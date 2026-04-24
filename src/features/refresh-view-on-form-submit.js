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
    toast.innerHTML = '<span class="scw-dto-spinner"></span> Adding records \u2014 grids will refresh automatically\u2026';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'scw-dto-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Dismiss and stop refreshing';
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

  $(document).off('knack-form-submit.' + DTO_FORM + DTO_NS)
             .on('knack-form-submit.' + DTO_FORM + DTO_NS, function () {
    SCW.debug('[scw-refresh] DTO form submitted \u2014 polling grids for new records');
    showDtoToast();

    // Capture initial record counts so we can detect when new records arrive
    var startCounts = {};
    DTO_GRIDS.forEach(function (viewId) {
      var view = Knack.views && Knack.views[viewId];
      startCounts[viewId] = (view && view.model && view.model.data)
        ? view.model.data.length : 0;
    });

    var elapsed = 0;
    if (_dtoPollTimer) clearInterval(_dtoPollTimer);
    _dtoPollTimer = setInterval(function () {
      elapsed += DTO_POLL_MS;

      DTO_GRIDS.forEach(function (viewId) { fetchGrid(viewId); });

      // Check if any grid gained records
      var gained = DTO_GRIDS.some(function (viewId) {
        var view = Knack.views && Knack.views[viewId];
        var current = (view && view.model && view.model.data)
          ? view.model.data.length : 0;
        return current > (startCounts[viewId] || 0);
      });

      if (gained) {
        SCW.debug('[scw-refresh] New records detected \u2014 stopping poll');
        // Keep polling a few more times to catch stragglers
        setTimeout(function () {
          DTO_GRIDS.forEach(function (viewId) { fetchGrid(viewId); });
        }, DTO_POLL_MS);
        setTimeout(function () {
          DTO_GRIDS.forEach(function (viewId) { fetchGrid(viewId); });
          hideDtoToast();
        }, DTO_POLL_MS * 2);
        clearInterval(_dtoPollTimer);
        _dtoPollTimer = null;
        return;
      }

      if (elapsed >= DTO_TIMEOUT_MS) {
        SCW.debug('[scw-refresh] DTO poll timeout');
        clearInterval(_dtoPollTimer);
        _dtoPollTimer = null;
        hideDtoToast();
      }
    }, DTO_POLL_MS);
  });
})();
