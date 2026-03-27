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

      // Details view: fetch fresh record via Knack API, then re-render
      if (v.model && v.model.id) {
        var objectKey = v.model.view && v.model.view.source && v.model.view.source.object;
        if (!objectKey) {
          // Try to get object from the view's scene config
          var viewMeta = Knack.views[TARGET_VIEW].model && Knack.views[TARGET_VIEW].model.view;
          objectKey = viewMeta && viewMeta.source && viewMeta.source.object;
        }
        console.log('[scw-refresh] Fetching record ' + v.model.id + ' from object ' + objectKey);

        // Use Knack's internal API to re-fetch the record
        $.ajax({
          url: Knack.api_url + '/v1/pages/' + SCENE + '/views/' + TARGET_VIEW + '/records/' + v.model.id,
          type: 'GET',
          headers: {
            'X-Knack-Application-Id': Knack.application_id,
            'x-knack-rest-api-key': 'knack',
            'Authorization': Knack.getUserToken()
          },
          success: function (data) {
            console.log('[scw-refresh] Got fresh record data, rendering');
            // Update the view's record and model with fresh data
            v.record = data;
            if (v.model && v.model.attributes) {
              for (var key in data) {
                if (data.hasOwnProperty(key)) {
                  v.model.attributes[key] = data[key];
                }
              }
            }
            if (typeof v.render === 'function') {
              v.render();
            }
            // Rebuild custom totals layout (v.render may not fire knack-view-render)
            setTimeout(function () {
              if (window.SCW && SCW.restructureTotals) SCW.restructureTotals();
            }, 150);
          },
          error: function (xhr) {
            console.warn('[scw-refresh] API fetch failed', xhr.status, xhr.statusText);
            // Fallback: just try render
            if (typeof v.render === 'function') v.render();
          }
        });
        return;
      }

      // Table/list fallback
      if (v.model && typeof v.model.fetch === 'function') {
        console.log('[scw-refresh] Calling model.fetch()');
        v.model.fetch();
      }
    } catch (e) {
      console.warn('[scw-refresh] Could not refresh ' + TARGET_VIEW, e);
    }
  }

  function refreshTarget() {
    console.log('[scw-refresh] Scheduling refresh of ' + TARGET_VIEW);
    setTimeout(doRefresh, 2000);
    setTimeout(doRefresh, 5000);
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
        refreshTarget();
      });
    });
  });

  // --- device-worksheet direct edits (AJAX PUT / model.updateRecord) ---
  $(document).off('scw-record-saved' + NS)
             .on('scw-record-saved' + NS, function () {
    // Only refresh if view_3418 exists on the current page
    if (typeof Knack !== 'undefined' && Knack.views && Knack.views[TARGET_VIEW]) {
      console.log('[scw-refresh] Direct edit save detected');
      refreshTarget();
    }
  });
})();
