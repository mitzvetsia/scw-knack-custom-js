/*** Refresh view_3418 on scene_1116 after inline edits or form submissions ***/
(function () {
  'use strict';

  var SCENE = 'scene_1116';
  var TARGET_VIEW = 'view_3418';
  var FORM_VIEWS = ['view_3492', 'view_3490'];
  var NS = '.scwRefreshTarget';

  function doRefresh() {
    try {
      var v = Knack.views[TARGET_VIEW];
      if (!v) {
        console.warn('[scw-refresh] View object not found for ' + TARGET_VIEW);
        return;
      }
      console.log('[scw-refresh] View object:', Object.keys(v));

      // Try multiple refresh strategies
      // 1. render() — works for details views
      if (typeof v.render === 'function') {
        console.log('[scw-refresh] Calling render()');
        v.render();
        return;
      }
      // 2. model.fetch() — works for table/list views
      if (v.model && typeof v.model.fetch === 'function') {
        console.log('[scw-refresh] Calling model.fetch()');
        v.model.fetch();
        return;
      }
      // 3. Fallback: re-fetch via Knack REST API and replace HTML
      console.log('[scw-refresh] Trying API fallback');
      var slug = window.location.hash;
      $.ajax({
        url: slug,
        type: 'GET',
        success: function () {
          console.log('[scw-refresh] Page re-navigated');
        }
      });
    } catch (e) {
      console.warn('[scw-refresh] Could not refresh ' + TARGET_VIEW, e);
    }
  }

  function refreshTarget() {
    console.log('[scw-refresh] Scheduling refresh of ' + TARGET_VIEW);
    setTimeout(doRefresh, 1500);
    setTimeout(doRefresh, 4000);
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
