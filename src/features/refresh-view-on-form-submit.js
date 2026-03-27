/*** Recalculate totals on scene_1116 after inline edits or form submissions ***/
(function () {
  'use strict';

  var SCENE = 'scene_1116';
  var TARGET_VIEW = 'view_3418';
  var FORM_VIEWS = ['view_3492', 'view_3490'];
  var NS = '.scwRefreshTarget';

  /** Recalculate totals from grid DOM — no API calls needed. */
  function refreshTarget() {
    if (!window.SCW || typeof SCW.restructureTotals !== 'function') return;
    if (!document.getElementById(TARGET_VIEW)) return;
    console.log('[scw-refresh] Recalculating totals from grid DOM');
    SCW.restructureTotals();
  }

  /** Debounced version for rapid-fire events (e.g. multiple cell updates). */
  var debounceTimer = null;
  function refreshDebounced() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refreshTarget, 300);
  }

  // --- form submissions (knack-form-submit.viewId) ---
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-form-submit.' + formViewId + NS)
               .on('knack-form-submit.' + formViewId + NS, function () {
      console.log('[scw-refresh] Form submit detected on ' + formViewId);
      // Small delay to let Knack update the form input values after submit
      setTimeout(refreshTarget, 500);
    });
  });

  // --- record create / update on form views ---
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-record-create.' + formViewId + NS)
               .on('knack-record-create.' + formViewId + NS, function () {
      console.log('[scw-refresh] Record create detected on ' + formViewId);
      setTimeout(refreshTarget, 500);
    });
    $(document).off('knack-record-update.' + formViewId + NS)
               .on('knack-record-update.' + formViewId + NS, function () {
      console.log('[scw-refresh] Record update detected on ' + formViewId);
      setTimeout(refreshTarget, 500);
    });
  });

  // --- inline edits on any view in the scene (standard Knack cell-update) ---
  $(document).on('knack-scene-render.' + SCENE, function () {
    var views = [];
    $('[id^="view_"]').each(function () {
      if (/^view_\d+$/.test(this.id)) views.push(this.id);
    });

    views.forEach(function (viewId) {
      $(document).off('knack-cell-update.' + viewId + NS)
                 .on('knack-cell-update.' + viewId + NS, function () {
        console.log('[scw-refresh] Cell update detected on ' + viewId);
        refreshDebounced();
      });
    });
  });

  // --- device-worksheet direct edits (AJAX PUT / model.updateRecord) ---
  $(document).off('scw-record-saved' + NS)
             .on('scw-record-saved' + NS, function () {
    if (typeof Knack !== 'undefined' && Knack.views && Knack.views[TARGET_VIEW]) {
      console.log('[scw-refresh] Direct edit save detected');
      // Delay to let Knack re-render the grid row with updated values
      setTimeout(refreshTarget, 1000);
      setTimeout(refreshTarget, 3000);
    }
  });
})();
