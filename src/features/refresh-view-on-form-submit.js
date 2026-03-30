/*** Recalculate totals on scene_1116 after inline edits or form submissions ***/
(function () {
  'use strict';

  var SCENE = 'scene_1116';
  var TARGET_VIEW = 'view_3418';
  var FORM_VIEWS = ['view_3492', 'view_3490'];
  // Source grid views whose data feeds the totals panel
  var SOURCE_VIEWS = ['view_3586', 'view_3588', 'view_3604'];
  var NS = '.scwRefreshTarget';
  var SPINNER_CLS = 'scw-totals-refreshing';

  // ── Loading overlay on view_3418 ──
  var OVERLAY_STYLE_ID = 'scw-totals-refresh-css';
  function injectOverlayStyle() {
    if (document.getElementById(OVERLAY_STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = OVERLAY_STYLE_ID;
    s.textContent = [
      '#' + TARGET_VIEW + '.' + SPINNER_CLS + ' { position: relative; pointer-events: none; }',
      '#' + TARGET_VIEW + '.' + SPINNER_CLS + '::after {',
      '  content: "Refreshing…";',
      '  position: absolute; inset: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '  background: rgba(255,255,255,.75);',
      '  color: #555; font-size: 13px; font-weight: 500; letter-spacing: .3px;',
      '  border-radius: 8px; z-index: 5;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showRefreshing() {
    injectOverlayStyle();
    var el = document.getElementById(TARGET_VIEW);
    if (el) el.classList.add(SPINNER_CLS);
  }

  function hideRefreshing() {
    var el = document.getElementById(TARGET_VIEW);
    if (el) el.classList.remove(SPINNER_CLS);
  }

  /**
   * Refresh the source grid views so their DOM updates with fresh data.
   * scene-tweaks.js already binds onViewRender for these grids → restructureTotals,
   * so totals recalculate automatically once the grids re-render.
   */
  function refreshSourceGrids() {
    if (typeof Knack === 'undefined') return;

    showRefreshing();

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
        console.log('[scw-refresh] Fetching source grid ' + viewId);
        view.model.fetch();
      }
    });

    if (!fetched) {
      // Fallback: just recalculate from current DOM
      console.log('[scw-refresh] No source grids available, recalculating from DOM');
      if (window.SCW && typeof SCW.restructureTotals === 'function') {
        SCW.restructureTotals();
      }
      hideRefreshing();
    }

    // Safety timeout — clear spinner after 10s no matter what
    setTimeout(hideRefreshing, 10000);
  }

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

  // --- form submissions (knack-form-submit.viewId) ---
  // These change server data, so we must re-fetch the source grids.
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-form-submit.' + formViewId + NS)
               .on('knack-form-submit.' + formViewId + NS, function () {
      console.log('[scw-refresh] Form submit detected on ' + formViewId);
      showRefreshing();
      setTimeout(refreshSourceGrids, 500);
    });
  });

  // --- record create / update on form views ---
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-record-create.' + formViewId + NS)
               .on('knack-record-create.' + formViewId + NS, function () {
      console.log('[scw-refresh] Record create detected on ' + formViewId);
      showRefreshing();
      setTimeout(refreshSourceGrids, 500);
    });
    $(document).off('knack-record-update.' + formViewId + NS)
               .on('knack-record-update.' + formViewId + NS, function () {
      console.log('[scw-refresh] Record update detected on ' + formViewId);
      showRefreshing();
      setTimeout(refreshSourceGrids, 500);
    });
  });

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
        console.log('[scw-refresh] Cell update detected on ' + viewId);
        recalcDebounced();
      });
    });
  });

  // --- device-worksheet direct edits (AJAX PUT / model.updateRecord) ---
  $(document).off('scw-record-saved' + NS)
             .on('scw-record-saved' + NS, function () {
    if (typeof Knack !== 'undefined' && Knack.views && Knack.views[TARGET_VIEW]) {
      console.log('[scw-refresh] Direct edit save detected');
      setTimeout(recalcTotals, 1000);
      setTimeout(recalcTotals, 3000);
    }
  });
})();
