/*** Refresh view_3418 on scene_1116 after inline edits or form submissions ***/
(function () {
  'use strict';

  var SCENE = 'scene_1116';
  var TARGET_VIEW = 'view_3418';
  var FORM_VIEWS = ['view_3492', 'view_3490'];
  var NS = '.scwRefreshTarget';

  function refreshTarget() {
    console.log('[scw-refresh] Refreshing ' + TARGET_VIEW);
    setTimeout(function () {
      try {
        var v = Knack.views[TARGET_VIEW];
        if (v && v.model && typeof v.model.fetch === 'function') {
          v.model.fetch();
        }
      } catch (e) {
        console.warn('[scw-refresh] Could not refresh ' + TARGET_VIEW, e);
      }
    }, 500);
  }

  // --- form submissions (knack-form-submit.viewId) ---
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-form-submit.' + formViewId + NS)
               .on('knack-form-submit.' + formViewId + NS, function () {
      console.log('[scw-refresh] Form submit detected on ' + formViewId);
      refreshTarget();
    });
  });

  // --- record create / update on form views ---
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-record-create.' + formViewId + NS)
               .on('knack-record-create.' + formViewId + NS, function () {
      console.log('[scw-refresh] Record create detected on ' + formViewId);
      refreshTarget();
    });
    $(document).off('knack-record-update.' + formViewId + NS)
               .on('knack-record-update.' + formViewId + NS, function () {
      console.log('[scw-refresh] Record update detected on ' + formViewId);
      refreshTarget();
    });
  });

  // --- inline edits on any view in the scene ---
  $(document).on('knack-scene-render.' + SCENE, function () {
    var views = [];
    $('[id^="view_"]').each(function () {
      if (/^view_\d+$/.test(this.id)) views.push(this.id);
    });

    views.forEach(function (viewId) {
      $(document).off('knack-cell-update.' + viewId + NS)
                 .on('knack-cell-update.' + viewId + NS, function () {
        console.log('[scw-refresh] Cell update detected on ' + viewId);
        refreshTarget();
      });
    });
  });
})();
