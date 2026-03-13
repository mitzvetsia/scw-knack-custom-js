/*** DELETE INTERCEPT — fire accessory IDs to webhook before record deletion ***/
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  // Connection fields whose linked record IDs should be sent to the
  // webhook when the parent record is deleted.
  var CONNECTION_FIELDS = ['field_1958'];

  // Webhook URL — reuses the existing delete record webhook.
  function getWebhookUrl() {
    return (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_DELETE_RECORD_WEBHOOK) || '';
  }

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Extract record ID from a Knack DELETE URL.
   * Patterns:
   *   /v1/pages/scene_xxx/views/view_xxx/records/RECORD_ID
   *   /v1/objects/object_xxx/records/RECORD_ID
   */
  function extractRecordId(url) {
    var m = url.match(/\/records\/([a-f0-9]{24})/i);
    return m ? m[1] : '';
  }

  /**
   * Extract view ID from a Knack scene/view URL.
   * Pattern: /v1/pages/scene_xxx/views/view_xxx/records/...
   */
  function extractViewId(url) {
    var m = url.match(/\/views\/(view_\d+)\//);
    return m ? m[1] : '';
  }

  /**
   * Look up a record in Knack's in-memory models and return the raw
   * connected record IDs for the configured connection fields.
   */
  function getConnectedIds(recordId, viewId) {
    var ids = [];

    // Try view model first (most reliable)
    if (viewId && Knack.views[viewId] && Knack.views[viewId].model) {
      var model = Knack.views[viewId].model;
      var collection = model.data && model.data.models ? model.data.models : [];
      for (var i = 0; i < collection.length; i++) {
        var rec = collection[i];
        var attrs = rec.attributes || rec;
        if (attrs.id === recordId) {
          return extractFromRecord(attrs);
        }
      }
    }

    // Fallback: search all view models
    var viewKeys = Object.keys(Knack.views || {});
    for (var v = 0; v < viewKeys.length; v++) {
      var vw = Knack.views[viewKeys[v]];
      if (!vw || !vw.model || !vw.model.data) continue;
      var models = vw.model.data.models || [];
      for (var j = 0; j < models.length; j++) {
        var r = models[j];
        var a = r.attributes || r;
        if (a.id === recordId) {
          return extractFromRecord(a);
        }
      }
    }

    return ids;
  }

  /**
   * Given a record's attributes, pull connected record IDs from
   * the configured connection fields.
   */
  function extractFromRecord(attrs) {
    var ids = [];
    for (var f = 0; f < CONNECTION_FIELDS.length; f++) {
      var fieldKey = CONNECTION_FIELDS[f];
      var raw = attrs[fieldKey + '_raw'];
      if (!raw) continue;

      // Knack stores connections as an array of {id, identifier, ...}
      var arr = Array.isArray(raw) ? raw : [raw];
      for (var k = 0; k < arr.length; k++) {
        if (arr[k] && arr[k].id) {
          ids.push(arr[k].id);
        }
      }
    }
    return ids;
  }

  /**
   * Fire-and-forget webhook with the accessory record IDs.
   */
  function fireWebhook(deletedRecordId, accessoryIds) {
    var url = getWebhookUrl();
    if (!url) {
      console.warn('[SCW][delete-intercept] No webhook URL configured (MAKE_DELETE_RECORD_WEBHOOK)');
      return;
    }

    var payload = {
      deletedRecordId: deletedRecordId,
      accessoryRecordIds: accessoryIds
    };

    console.log('[SCW][delete-intercept] Sending accessory IDs to webhook:', payload);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      if (!resp.ok) {
        console.warn('[SCW][delete-intercept] Webhook responded ' + resp.status);
      }
    }).catch(function (err) {
      console.warn('[SCW][delete-intercept] Webhook failed:', err);
    });
  }

  // ============================================================
  // $.ajax INTERCEPT
  // ============================================================

  if (typeof $ === 'undefined' || !$.ajaxPrefilter) {
    console.warn('[SCW][delete-intercept] jQuery not available — cannot install intercept');
    return;
  }

  $.ajaxPrefilter(function (options) {
    var method = (options.type || options.method || '').toUpperCase();
    if (method !== 'DELETE') return;

    var url = options.url || '';
    var recordId = extractRecordId(url);
    if (!recordId) return;

    var viewId = extractViewId(url);

    console.log('[SCW][delete-intercept] DELETE detected for record ' + recordId + (viewId ? ' in ' + viewId : ''));

    var accessoryIds = getConnectedIds(recordId, viewId);
    if (accessoryIds.length) {
      fireWebhook(recordId, accessoryIds);
    } else {
      console.log('[SCW][delete-intercept] No connected accessories found for ' + recordId);
    }
  });

  console.log('[SCW][delete-intercept] Installed — monitoring DELETE requests');
})();
