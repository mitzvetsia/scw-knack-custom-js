/*** Refresh view_3418 on scene_1116 after inline edits or form submissions ***/
(function () {
  'use strict';

  var SCENE = 'scene_1116';
  var TARGET_VIEW = 'view_3418';
  var FORM_VIEWS = ['view_3492', 'view_3490'];

  function refreshTarget() {
    try {
      var v = Knack.views[TARGET_VIEW];
      if (v && v.model && typeof v.model.fetch === 'function') {
        v.model.fetch();
      }
    } catch (e) {
      console.warn('[scw-refresh-view-on-form-submit] Could not refresh ' + TARGET_VIEW, e);
    }
  }

  $(document).on('knack-scene-render.' + SCENE, function () {
    // --- inline edits on any view in the scene ---
    var views = [];
    $('[id^="view_"]').each(function () {
      if (/^view_\d+$/.test(this.id)) views.push(this.id);
    });

    views.forEach(function (viewId) {
      $(document).off('knack-cell-update.' + viewId + '.scwRefreshTarget');
      $(document).on('knack-cell-update.' + viewId + '.scwRefreshTarget', function () {
        refreshTarget();
      });
    });

    // --- form submissions ---
    FORM_VIEWS.forEach(function (formViewId) {
      $(document).off('knack-form-submit.' + formViewId + '.scwRefreshTarget');
      $(document).on('knack-form-submit.' + formViewId + '.scwRefreshTarget', function () {
        refreshTarget();
      });
    });
  });
})();
