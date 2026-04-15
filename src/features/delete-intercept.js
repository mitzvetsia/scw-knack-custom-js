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

  // Delete confirm message patterns
  var SINGLE_DELETE_RE = /are you sure you want to delete this/i;
  var BULK_DELETE_RE = /are you sure you want to permanently delete \d+ records/i;

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Get connected accessory record IDs from the DOM.
   * The connected-records widget renders .scw-cr-remove buttons with
   * data-record-id on each accessory item inside the worksheet row.
   */
  function getConnectedIdsFromDOM(recordId) {
    var ids = [];

    // The device worksheet creates a tr.scw-ws-row with the same record ID.
    // The original hidden Knack <tr> also has this ID, so getElementById
    // may return the wrong one. Query specifically for the worksheet row.
    var wsRow = document.querySelector('tr.scw-ws-row[id="' + recordId + '"]');
    if (wsRow) {
      var buttons = wsRow.querySelectorAll('.scw-cr-remove[data-record-id]');
      for (var i = 0; i < buttons.length; i++) {
        var rid = buttons[i].getAttribute('data-record-id');
        if (rid) ids.push(rid);
      }
    }

    // Fallback: search any <tr> with this ID
    if (!ids.length) {
      var rows = document.querySelectorAll('tr[id="' + recordId + '"]');
      for (var r = 0; r < rows.length; r++) {
        var btns = rows[r].querySelectorAll('.scw-cr-remove[data-record-id]');
        for (var b = 0; b < btns.length; b++) {
          var id = btns[b].getAttribute('data-record-id');
          if (id) ids.push(id);
        }
      }
    }

    console.log('[SCW][delete-intercept] DOM lookup for ' + recordId + ': found ' + ids.length + ' accessory IDs', ids);
    return ids;
  }

  /**
   * Fire-and-forget webhook with the accessory record IDs.
   */
  function fireWebhook(deletedRecordIds, accessoryIds) {
    var url = getWebhookUrl();
    if (!url) {
      console.warn('[SCW][delete-intercept] No webhook URL configured');
      return;
    }

    var payload = {
      deletedRecordIds: deletedRecordIds,
      accessoryRecordIds: accessoryIds
    };

    console.log('[SCW][delete-intercept] Sending to webhook:', payload);

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
  // TRACK WHICH ROW THE USER CLICKED (for single delete)
  // ============================================================

  var _lastClickedRecordId = null;

  // Capture clicks on delete icons / links BEFORE the confirm dialog fires.
  // Uses capture phase so we see it before Knack's handler calls confirm().
  document.addEventListener('click', function (e) {
    // Knack delete links are <a> with class "kn-link-delete" or inside
    // a td.kn-table-link with a trash icon. Walk up to the <tr>.
    var link = e.target.closest('a.kn-link-delete, .kn-link-delete, td.kn-table-link a');
    if (!link) {
      _lastClickedRecordId = null;
      return;
    }

    var tr = link.closest('tr[id]');
    if (tr && /^[a-f0-9]{24}$/.test(tr.id)) {
      _lastClickedRecordId = tr.id;
      console.log('[SCW][delete-intercept] Tracked click on record ' + tr.id);
    }
  }, true); // capture phase

  // ============================================================
  // GET BULK-SELECTED RECORD IDs (for KTL bulk delete)
  // ============================================================

  function getBulkSelectedRecordIds() {
    var ids = [];
    // KTL marks selected rows with .bulkEditSelectedRow on <td> elements
    var cells = document.querySelectorAll('td.bulkEditSelectedRow');
    var seen = {};
    for (var i = 0; i < cells.length; i++) {
      var tr = cells[i].closest('tr[id]');
      if (tr && /^[a-f0-9]{24}$/.test(tr.id) && !seen[tr.id]) {
        seen[tr.id] = true;
        ids.push(tr.id);
      }
    }

    // Also check for selected rows via Knack's own checkbox selection
    if (!ids.length) {
      var checked = document.querySelectorAll('tr .kn-table-bulk-checkbox input:checked');
      for (var c = 0; c < checked.length; c++) {
        var row = checked[c].closest('tr[id]');
        if (row && /^[a-f0-9]{24}$/.test(row.id) && !seen[row.id]) {
          seen[row.id] = true;
          ids.push(row.id);
        }
      }
    }

    return ids;
  }

  // ============================================================
  // window.confirm INTERCEPT
  // ============================================================

  var _origConfirm = window.confirm;

  window.confirm = function (msg) {
    var isDeletePrompt = SINGLE_DELETE_RE.test(msg) || BULK_DELETE_RE.test(msg);

    // Auto-confirm delete dialogs — skip the native "are you sure" modal.
    // For all other confirm() calls, pass through to the browser default.
    var result = isDeletePrompt ? true : _origConfirm.call(window, msg);

    // Only act if user clicked OK (or auto-confirmed)
    if (!result) return result;

    var deletedRecordIds = [];

    if (BULK_DELETE_RE.test(msg)) {
      // KTL bulk delete
      deletedRecordIds = getBulkSelectedRecordIds();
      console.log('[SCW][delete-intercept] Bulk delete confirmed — ' + deletedRecordIds.length + ' records:', deletedRecordIds);

    } else if (SINGLE_DELETE_RE.test(msg)) {
      // Single record delete
      if (_lastClickedRecordId) {
        deletedRecordIds = [_lastClickedRecordId];
        console.log('[SCW][delete-intercept] Single delete confirmed — record:', _lastClickedRecordId);
      } else {
        console.warn('[SCW][delete-intercept] Single delete confirmed but no record ID captured');
      }
    }

    if (!deletedRecordIds.length) return result;

    // Collect all accessory IDs across all deleted records
    var allAccessoryIds = [];
    for (var i = 0; i < deletedRecordIds.length; i++) {
      var accessories = getConnectedIdsFromDOM(deletedRecordIds[i]);
      if (accessories.length) {
        console.log('[SCW][delete-intercept] Record ' + deletedRecordIds[i] + ' has accessories:', accessories);
        allAccessoryIds = allAccessoryIds.concat(accessories);
      }
    }

    if (allAccessoryIds.length) {
      fireWebhook(deletedRecordIds, allAccessoryIds);
    } else {
      console.log('[SCW][delete-intercept] No connected accessories found for deleted records');
    }

    return result;
  };

  console.log('[SCW][delete-intercept] Installed — patched window.confirm to monitor delete confirmations');
})();
