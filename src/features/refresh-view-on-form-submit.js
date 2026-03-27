/*** Refresh view_3418 on scene_1116 after inline edits or form submissions ***/
(function () {
  'use strict';

  var SCENE = 'scene_1116';
  var TARGET_VIEW = 'view_3418';
  var FORM_VIEWS = ['view_3492', 'view_3490'];
  var NS = '.scwRefreshTarget';

  var AUTH_HEADERS = {
    'X-Knack-Application-Id': Knack.application_id,
    'x-knack-rest-api-key': 'knack',
    'Content-Type': 'application/json'
  };

  function getAuthHeaders() {
    var h = {};
    for (var k in AUTH_HEADERS) h[k] = AUTH_HEADERS[k];
    h['Authorization'] = Knack.getUserToken();
    return h;
  }

  /** Touch the parent record with an empty PUT to force Knack to
   *  recalculate aggregate / sum / formula fields, then fetch + render. */
  function doRefresh() {
    try {
      var v = Knack.views[TARGET_VIEW];
      if (!v) return;
      if (!v.model || !v.model.id) return;

      var recordId = v.model.id;
      var objectKey = (v.model.view && v.model.view.source && v.model.view.source.object) || '';

      // Step 1 — touch the parent record (empty PUT forces aggregate recalc)
      var touchUrl = objectKey
        ? Knack.api_url + '/v1/objects/' + objectKey + '/records/' + recordId
        : Knack.api_url + '/v1/pages/' + SCENE + '/views/' + TARGET_VIEW + '/records/' + recordId;

      console.log('[scw-refresh] Touching parent record ' + recordId + ' to force recalc');

      $.ajax({
        url: touchUrl,
        type: 'PUT',
        headers: getAuthHeaders(),
        data: JSON.stringify({}),
        complete: function () {
          // Step 2 — fetch fresh data (whether touch succeeded or not)
          fetchAndRender(v, recordId);
        }
      });
    } catch (e) {
      console.warn('[scw-refresh] Could not refresh ' + TARGET_VIEW, e);
    }
  }

  /** Fetch fresh record data from the API and re-render view_3418. */
  function fetchAndRender(v, recordId) {
    $.ajax({
      url: Knack.api_url + '/v1/pages/' + SCENE + '/views/' + TARGET_VIEW + '/records/' + recordId,
      type: 'GET',
      headers: getAuthHeaders(),
      success: function (data) {
        console.log('[scw-refresh] Got fresh record data, rendering');
        v.record = data;
        if (v.model && v.model.attributes) {
          for (var key in data) {
            if (data.hasOwnProperty(key)) {
              v.model.attributes[key] = data[key];
            }
          }
        }
        if (typeof v.render === 'function') v.render();
        setTimeout(function () {
          if (window.SCW && SCW.restructureTotals) SCW.restructureTotals();
        }, 150);
      },
      error: function (xhr) {
        console.warn('[scw-refresh] API fetch failed', xhr.status, xhr.statusText);
        if (typeof v.render === 'function') v.render();
        setTimeout(function () {
          if (window.SCW && SCW.restructureTotals) SCW.restructureTotals();
        }, 150);
      }
    });
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
    if (typeof Knack !== 'undefined' && Knack.views && Knack.views[TARGET_VIEW]) {
      console.log('[scw-refresh] Direct edit save detected');
      refreshTarget();
    }
  });
})();
