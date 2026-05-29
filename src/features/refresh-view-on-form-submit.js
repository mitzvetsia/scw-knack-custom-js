/*** Recalculate totals on scene_1116 after inline edits or form submissions ***/
(function () {
  'use strict';

  var SCENE = 'scene_1116';
  var TARGET_VIEW = 'view_3418';
  var FORM_VIEWS = ['view_3492', 'view_3490'];
  // Source grid views whose data feeds the totals panel
  var SOURCE_VIEWS = ['view_3586', 'view_3604'];
  var NS = '.scwRefreshTarget';
  var OVERLAY_ID = 'scw-totals-refresh-overlay';

  // ── Loading overlay on view_3418 ──
  var OVERLAY_STYLE_ID = 'scw-totals-refresh-css';
  function injectOverlayStyle() {
    if (document.getElementById(OVERLAY_STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = OVERLAY_STYLE_ID;
    s.textContent = [
      '#' + OVERLAY_ID + ' {',
      '  position: absolute; top: 0; left: 0; right: 0; bottom: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '  background: rgba(255,255,255,.78);',
      '  color: #555; font-size: 13px; font-weight: 500; letter-spacing: .3px;',
      '  border-radius: 8px; z-index: 5;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showRefreshing() {
    injectOverlayStyle();
    var el = document.getElementById(TARGET_VIEW);
    if (!el) return;
    // Ensure positioned parent for the overlay
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
    }
    // Don't add a duplicate
    if (document.getElementById(OVERLAY_ID)) return;
    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.textContent = 'Refreshing\u2026';
    el.appendChild(overlay);
  }

  function hideRefreshing() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
  }

  /**
   * Refresh the source grid views so their DOM updates with fresh data.
   * scene-tweaks.js already binds onViewRender for these grids → restructureTotals,
   * so totals recalculate automatically once the grids re-render.
   */
  function refreshSourceGrids() {
    if (typeof Knack === 'undefined') return;

    var pending = 0;
    var fetched = false;

    SOURCE_VIEWS.forEach(function (viewId) {
      var view = Knack.views && Knack.views[viewId];
      if (view && view.model && typeof view.model.fetch === 'function') {
        pending++;
        fetched = true;
        $(document).one('knack-view-render.' + viewId + NS + 'Grid', function () {
          pending--;
          if (pending <= 0) hideRefreshing();
        });
        SCW.debug('[scw-refresh] Fetching source grid ' + viewId);
        view.model.fetch();
      }
    });

    if (!fetched) {
      // Fallback: just recalculate from current DOM
      SCW.debug('[scw-refresh] No source grids available, recalculating from DOM');
      if (window.SCW && typeof SCW.restructureTotals === 'function') {
        SCW.restructureTotals();
      }
      hideRefreshing();
    }

    // Safety timeout — clear overlay after 10s no matter what
    setTimeout(hideRefreshing, 10000);
  }

  // ── Immediate submit-button click interception (capture phase) ──
  // knack-form-submit fires AFTER the AJAX round-trip completes.
  // We intercept the actual button click so the overlay appears instantly.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button[type="submit"]');
    if (!btn) return;
    var form = btn.closest('form');
    if (!form) return;
    var isTargetForm = false;
    for (var i = 0; i < FORM_VIEWS.length; i++) {
      if (form.closest('#' + FORM_VIEWS[i])) { isTargetForm = true; break; }
    }
    if (isTargetForm) {
      SCW.debug('[scw-refresh] Submit button clicked — showing overlay');
      showRefreshing();
    }
  }, true); // capture phase — fires before Knack's handler

  // --- form submissions (knack-form-submit.viewId) ---
  // By the time this fires, the save is done — refresh the source grids.
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-form-submit.' + formViewId + NS)
               .on('knack-form-submit.' + formViewId + NS, function () {
      SCW.debug('[scw-refresh] Form submit detected on ' + formViewId);
      refreshSourceGrids();
    });
  });

  // --- record create / update on form views ---
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-record-create.' + formViewId + NS)
               .on('knack-record-create.' + formViewId + NS, function () {
      SCW.debug('[scw-refresh] Record create detected on ' + formViewId);
      refreshSourceGrids();
    });
    $(document).off('knack-record-update.' + formViewId + NS)
               .on('knack-record-update.' + formViewId + NS, function () {
      SCW.debug('[scw-refresh] Record update detected on ' + formViewId);
      refreshSourceGrids();
    });
  });

  /** Recalculate totals from current DOM (for cell updates / direct edits). */
  function recalcTotals() {
    if (window.SCW && typeof SCW.restructureTotals === 'function') {
      SCW.restructureTotals();
    }
  }

  /** Debounced version for rapid-fire events (e.g. multiple cell updates). */
  var debounceTimer = null;
  function recalcDebounced() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recalcTotals, 300);
  }

  // --- inline edits on any view in the scene (standard Knack cell-update) ---
  // Cell updates change DOM in-place, so recalc from DOM is sufficient.
  $(document).on('knack-scene-render.' + SCENE, function () {
    var views = [];
    $('[id^="view_"]').each(function () {
      if (/^view_\d+$/.test(this.id)) views.push(this.id);
    });

    views.forEach(function (viewId) {
      $(document).off('knack-cell-update.' + viewId + NS)
                 .on('knack-cell-update.' + viewId + NS, function () {
        SCW.debug('[scw-refresh] Cell update detected on ' + viewId);
        recalcDebounced();
      });
    });
  });

  // --- device-worksheet direct edits (AJAX PUT / model.updateRecord) ---
  $(document).off('scw-record-saved' + NS)
             .on('scw-record-saved' + NS, function () {
    if (typeof Knack !== 'undefined' && Knack.views && Knack.views[TARGET_VIEW]) {
      SCW.debug('[scw-refresh] Direct edit save detected');
      setTimeout(recalcTotals, 1000);
      setTimeout(recalcTotals, 3000);
    }
  });

  // ============================================================
  // Poll-refresh grids after DTO form submit (Make automation)
  // ============================================================
  // view_3748 is a DTO form that triggers a Make automation which
  // creates records asynchronously.  Poll the target grids until
  // new records appear or the timeout expires.

  var DTO_FORM = 'view_3748';
  var DTO_GRIDS = ['view_3586'];
  var DTO_POLL_MS = 4000;       // poll every 4 s
  var DTO_TIMEOUT_MS = 60000;   // stop after 60 s
  var DTO_NS = '.scwDtoPoll';
  var TOAST_ID = 'scw-dto-poll-toast';
  var TOAST_CSS_ID = 'scw-dto-poll-css';

  function injectToastStyle() {
    if (document.getElementById(TOAST_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = TOAST_CSS_ID;
    s.textContent = [
      '#' + TOAST_ID + ' {',
      '  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);',
      '  background: #1e3a5f; color: #fff; padding: 10px 20px;',
      '  border-radius: 8px; font-size: 13px; font-weight: 500;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,.18); z-index: 10000;',
      '  display: flex; align-items: center; gap: 8px;',
      '  transition: opacity 300ms ease;',
      '}',
      '#' + TOAST_ID + ' .scw-dto-spinner {',
      '  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3);',
      '  border-top-color: #fff; border-radius: 50%;',
      '  animation: scwDtoSpin .8s linear infinite;',
      '}',
      '#' + TOAST_ID + ' .scw-dto-refresh {',
      '  background: #fff; color: #1e3a5f; border: none;',
      '  border-radius: 4px; padding: 4px 10px; font-size: 12px;',
      '  font-weight: 700; cursor: pointer; letter-spacing: .2px;',
      '}',
      '#' + TOAST_ID + ' .scw-dto-refresh:hover { background: #e0e7f1; }',
      '#' + TOAST_ID + ' .scw-dto-close {',
      '  background: none; border: none; color: rgba(255,255,255,.7);',
      '  font-size: 16px; cursor: pointer; padding: 0 0 0 6px;',
      '  line-height: 1; font-weight: 700;',
      '}',
      '#' + TOAST_ID + ' .scw-dto-close:hover { color: #fff; }',
      '@keyframes scwDtoSpin { to { transform: rotate(360deg); } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // Active poll timer — stored so the close button can cancel it
  var _dtoPollTimer = null;

  function showDtoToast() {
    injectToastStyle();
    if (document.getElementById(TOAST_ID)) return;
    var toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.innerHTML = '<span class="scw-dto-spinner"></span> ' +
      '<span class="scw-dto-msg">Adding records in the background\u2026</span>';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'scw-dto-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Dismiss and stop checking';
    closeBtn.addEventListener('click', function () {
      if (_dtoPollTimer) { clearInterval(_dtoPollTimer); _dtoPollTimer = null; }
      hideDtoToast();
    });
    toast.appendChild(closeBtn);

    document.body.appendChild(toast);
  }

  function hideDtoToast() {
    var toast = document.getElementById(TOAST_ID);
    if (!toast) return;
    toast.style.opacity = '0';
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 350);
  }

  // Swap the toast's content from "checking" to "N new records ready \u2014
  // Refresh now". Clicking Refresh is the ONLY thing that actually
  // rebuilds the grid; the user opts into the disruption rather than
  // having it dropped on them mid-edit.
  function showDtoReadyToast(viewIds, newCount) {
    var toast = document.getElementById(TOAST_ID);
    if (!toast) {
      injectToastStyle();
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }
    while (toast.firstChild) toast.removeChild(toast.firstChild);

    var msg = document.createElement('span');
    msg.className = 'scw-dto-msg';
    msg.textContent = newCount + ' new record' + (newCount === 1 ? '' : 's') +
      ' added \u2014 ready when you are.';
    toast.appendChild(msg);

    var refreshBtn = document.createElement('button');
    refreshBtn.className = 'scw-dto-refresh';
    refreshBtn.textContent = 'Refresh now';
    refreshBtn.addEventListener('click', function () {
      viewIds.forEach(function (vid) { fetchGrid(vid); });
      hideDtoToast();
    });
    toast.appendChild(refreshBtn);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'scw-dto-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Dismiss (records will appear on next page load)';
    closeBtn.addEventListener('click', hideDtoToast);
    toast.appendChild(closeBtn);
  }

  // Hard refresh \u2014 only called when the user clicks "Refresh now",
  // or from the legacy non-DTO paths above. NOT used by the silent
  // poll itself.
  function fetchGrid(viewId) {
    if (typeof Knack === 'undefined') return;
    var view = Knack.views && Knack.views[viewId];
    if (view && view.model && typeof view.model.fetch === 'function') {
      // Preserve expanded worksheet panels across the re-render
      if (window.SCW && SCW.deviceWorksheet && typeof SCW.deviceWorksheet.captureState === 'function') {
        SCW.deviceWorksheet.captureState();
      }
      view.model.fetch();
    }
  }

  // Silent record-count probe. Hits the view's records endpoint
  // directly via the REST API so Backbone's view.model never sees the
  // response \u2014 no model.fetch, no re-render, no scroll loss, no
  // collapsed worksheet panels. Resolves with the total_records the
  // API reports. Used purely to detect when Make has finished adding
  // records; the rebuild is gated on a user click.
  function countGridSilent(viewId, cb) {
    if (typeof Knack === 'undefined' || !Knack.router ||
        !Knack.router.current_scene_key) {
      cb(new Error('no scene'));
      return;
    }
    var url = Knack.api_url + '/v1/pages/' +
              Knack.router.current_scene_key +
              '/views/' + viewId +
              '/records?rows_per_page=1&page=1';
    SCW.knackAjax({
      url:  url,
      type: 'GET',
      success: function (resp) {
        if (resp && typeof resp.total_records === 'number') {
          cb(null, resp.total_records); return;
        }
        // Fallback for shapes that omit total_records.
        var n = (resp && Array.isArray(resp.records)) ? resp.records.length : 0;
        cb(null, n);
      },
      error: function (xhr) { cb(xhr || new Error('http error')); }
    });
  }

  $(document).off('knack-form-submit.' + DTO_FORM + DTO_NS)
             .on('knack-form-submit.' + DTO_FORM + DTO_NS, function () {
    SCW.debug('[scw-refresh] DTO form submitted \u2014 silently checking for new records');
    showDtoToast();

    // Baseline counts via the silent probe so we compare like-for-like
    // in the poll loop. Falls back to 0 on a failed probe so we still
    // detect the obvious "records went up" case.
    var startCounts = {};
    var pendingStarts = DTO_GRIDS.length;
    DTO_GRIDS.forEach(function (viewId) {
      countGridSilent(viewId, function (err, total) {
        startCounts[viewId] = err ? 0 : total;
        pendingStarts--;
      });
    });

    var elapsed = 0;
    if (_dtoPollTimer) clearInterval(_dtoPollTimer);
    _dtoPollTimer = setInterval(function () {
      elapsed += DTO_POLL_MS;

      // Wait for the baseline counts to land before comparing; without
      // this guard a slow first probe would compare against 0 and
      // declare false-positive new records.
      if (pendingStarts > 0) {
        if (elapsed >= DTO_TIMEOUT_MS) {
          SCW.debug('[scw-refresh] DTO poll timeout (baseline never landed)');
          clearInterval(_dtoPollTimer);
          _dtoPollTimer = null;
          hideDtoToast();
        }
        return;
      }

      // Silent probe each grid; if ANY has gained records, surface a
      // manual "Refresh now" toast and stop polling. The rendered
      // grids stay untouched until the user opts in.
      var pending = DTO_GRIDS.length;
      var gainedViews = [];
      var maxGain = 0;
      DTO_GRIDS.forEach(function (viewId) {
        countGridSilent(viewId, function (err, total) {
          pending--;
          if (!err && typeof total === 'number') {
            var gain = total - (startCounts[viewId] || 0);
            if (gain > 0) {
              gainedViews.push(viewId);
              if (gain > maxGain) maxGain = gain;
            }
          }
          if (pending === 0) {
            if (gainedViews.length) {
              SCW.debug('[scw-refresh] New records detected \u2014 surfacing manual refresh');
              showDtoReadyToast(gainedViews, maxGain);
              clearInterval(_dtoPollTimer);
              _dtoPollTimer = null;
            } else if (elapsed >= DTO_TIMEOUT_MS) {
              SCW.debug('[scw-refresh] DTO poll timeout');
              clearInterval(_dtoPollTimer);
              _dtoPollTimer = null;
              hideDtoToast();
            }
          }
        });
      });
    }, DTO_POLL_MS);
  });
})();
