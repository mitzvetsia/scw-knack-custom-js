/*** DELETE INTERCEPT — fire accessory IDs to webhook before record deletion ***/
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  // Connection fields whose linked record IDs should be sent to the
  // webhook when the parent record is deleted.
  var CONNECTION_FIELDS = ['field_1958'];

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

    SCW.debug('[SCW][delete-intercept] DOM lookup for ' + recordId + ': found ' + ids.length + ' accessory IDs', ids);
    return ids;
  }

  /**
   * Pick a view to DELETE the accessory records through. Accessories are line
   * items; any line-item view with Delete enabled works. Prefer the view the
   * user clicked the parent-delete in, else the worksheet row's enclosing view.
   */
  function deleteViewKey() {
    if (_lastClickedViewKey) return _lastClickedViewKey;
    var wsRow = document.querySelector('tr.scw-ws-row[id]');
    var vw = wsRow && wsRow.closest('.kn-view');
    return vw ? vw.id : '';
  }

  /**
   * FRONT-END cascade delete of the accessory records (no Make webhook).
   * Routes through worksheet-v2's concurrency-capped + retry FE delete queue
   * (view-scoped REST DELETE). The parent itself is deleted by Knack's own
   * native delete that this intercept lets proceed.
   */
  function cascadeDeleteFE(accessoryIds) {
    var viewKey = deleteViewKey();
    var bulk = window.SCW && SCW.worksheetV2 && SCW.worksheetV2.bulk;
    if (!viewKey) {
      console.warn('[SCW][delete-intercept] no view to DELETE accessories through');
      return;
    }
    if (bulk && typeof bulk.queuedDeleteFE === 'function') {
      bulk.queuedDeleteFE(viewKey, accessoryIds).then(function (results) {
        var failed = 0;
        for (var i = 0; i < results.length; i++) if (!results[i].ok) failed++;
        if (failed) console.warn('[SCW][delete-intercept] ' + failed + ' of ' +
          accessoryIds.length + ' accessory FE delete(s) failed');
      });
    } else if (window.SCW && typeof SCW.knackAjax === 'function' &&
               typeof SCW.knackRecordUrl === 'function') {
      // Fallback: direct REST DELETE per id (bulk module not loaded).
      for (var i = 0; i < accessoryIds.length; i++) {
        (function (id) {
          SCW.knackAjax({ url: SCW.knackRecordUrl(viewKey, id), type: 'DELETE',
            error: function (xhr) {
              console.warn('[SCW][delete-intercept] accessory DELETE failed ' +
                id, xhr && xhr.status); } });
        })(accessoryIds[i]);
      }
    } else {
      console.warn('[SCW][delete-intercept] no FE delete path available');
    }
  }

  // ============================================================
  // TRACK WHICH ROW THE USER CLICKED (for single delete)
  // ============================================================

  var _lastClickedRecordId = null;
  var _lastClickedViewKey  = null;   // view the parent-delete was clicked in

  // Capture clicks on delete icons / links BEFORE the confirm dialog fires.
  // Uses capture phase so we see it before Knack's handler calls confirm().
  document.addEventListener('click', function (e) {
    // Knack delete links are <a> with class "kn-link-delete" or inside
    // a td.kn-table-link with a trash icon. Walk up to the <tr>.
    var link = e.target.closest('a.kn-link-delete, .kn-link-delete, td.kn-table-link a');
    if (!link) {
      _lastClickedRecordId = null;
      _lastClickedViewKey  = null;
      return;
    }

    var tr = link.closest('tr[id]');
    if (tr && /^[a-f0-9]{24}$/.test(tr.id)) {
      _lastClickedRecordId = tr.id;
      var vw = link.closest('.kn-view');
      _lastClickedViewKey = vw ? vw.id : null;
      SCW.debug('[SCW][delete-intercept] Tracked click on record ' + tr.id +
        ' in ' + _lastClickedViewKey);
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
      SCW.debug('[SCW][delete-intercept] Bulk delete confirmed — ' + deletedRecordIds.length + ' records:', deletedRecordIds);

    } else if (SINGLE_DELETE_RE.test(msg)) {
      // Single record delete
      if (_lastClickedRecordId) {
        deletedRecordIds = [_lastClickedRecordId];
        SCW.debug('[SCW][delete-intercept] Single delete confirmed — record:', _lastClickedRecordId);
      } else {
        console.warn('[SCW][delete-intercept] Single delete confirmed but no record ID captured');
      }
    }

    if (!deletedRecordIds.length) return result;

    // Collect all accessory IDs across all deleted records. Dedupe, and
    // drop any accessory that's also in deletedRecordIds — one box can be
    // connected to several selected parents (so it surfaces multiple
    // times), and a selected row can itself be another's accessory.
    // Sending duplicates / already-deleted IDs makes Make re-delete a gone
    // record, which Knack answers with a 403 — the noise we're chasing.
    var deletedSet = {};
    for (var d = 0; d < deletedRecordIds.length; d++) deletedSet[deletedRecordIds[d]] = true;

    var seenAccessory = {};
    var allAccessoryIds = [];
    for (var i = 0; i < deletedRecordIds.length; i++) {
      var accessories = getConnectedIdsFromDOM(deletedRecordIds[i]);
      if (accessories.length) {
        SCW.debug('[SCW][delete-intercept] Record ' + deletedRecordIds[i] + ' has accessories:', accessories);
      }
      for (var a = 0; a < accessories.length; a++) {
        var aid = accessories[a];
        if (!aid || seenAccessory[aid] || deletedSet[aid]) continue;
        seenAccessory[aid] = true;
        allAccessoryIds.push(aid);
      }
    }

    if (allAccessoryIds.length) {
      cascadeDeleteFE(allAccessoryIds);
    } else {
      SCW.debug('[SCW][delete-intercept] No connected accessories found for deleted records');
    }

    return result;
  };

  SCW.debug('[SCW][delete-intercept] Installed — patched window.confirm to monitor delete confirmations');
})();
