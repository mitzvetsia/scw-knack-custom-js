/*** BID REVIEW — ACTIONS ***/
/**
 * Payload construction and webhook submission.
 * No DOM manipulation, no rendering — only data out.
 * Calls renderToast for user feedback (the only render dependency).
 *
 * Reads : SCW.bidReview.CONFIG, SCW.bidReview.renderToast
 * Writes: SCW.bidReview.submitAction(payload)
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  /**
   * Submit a bid review action to the Make webhook.
   *
   * @param {object} payload
   * @param {string} payload.actionType — one of:
   *   'row_adopt', 'row_create', 'row_skip',
   *   'package_adopt_all', 'package_create_missing', 'package_adopt_create'
   * @param {string} [payload.reviewRowId]  — for row-level actions
   * @param {string} [payload.packageId]    — target package
   * @param {string[]} [payload.rowIds]     — for package-level batch actions
   * @returns {jQuery.Deferred}
   */
  ns.submitAction = function submitAction(payload) {
    var deferred = $.Deferred();

    if (!payload || !payload.actionType) {
      if (CFG.debug) console.warn('[BidReview] submitAction called without actionType');
      deferred.reject('Missing actionType');
      return deferred.promise();
    }

    var body = {
      actionType:  payload.actionType,
      timestamp:   new Date().toISOString(),
    };

    if (payload.reviewRowId) body.reviewRowId = payload.reviewRowId;
    if (payload.packageId)   body.packageId   = payload.packageId;
    if (payload.sowId)       body.sowId       = payload.sowId;
    if (payload.rowIds)      body.rowIds      = payload.rowIds;
    if (payload.updates)     body.updates     = payload.updates;
    if (payload.creates)     body.creates     = payload.creates;
    if (payload.removals)    body.removals    = payload.removals;
    if (payload.items)       body.items       = payload.items;
    if (payload.matchedSowItems)  body.matchedSowItems  = payload.matchedSowItems;
    if (payload.orphanBidRecords) body.orphanBidRecords = payload.orphanBidRecords;

    if (CFG.debug) {
      SCW.debug('[BidReview] Submitting action:', body);
    }

    var webhookUrl = (payload.actionType === 'create_new_sow' && CFG.createNewSowWebhook)
      ? CFG.createNewSowWebhook
      : CFG.actionWebhook;

    SCW.knackAjax({
      url:  webhookUrl,
      type: 'POST',
      data: JSON.stringify(body),
      success: function (resp) {
        if (CFG.debug) SCW.debug('[BidReview] Action success:', resp);

        // Skip toast for copy_to_sow — handleCopyToSow manages its own messaging
        if (payload.actionType !== 'package_copy_to_sow') {
          var label = describeAction(payload);
          ns.renderToast(label + ' — sent successfully', 'success');
        }
        deferred.resolve(resp);
      },
      error: function (xhr) {
        console.error('[BidReview] Action failed:', xhr.status, xhr.responseText);
        ns.renderToast('Action failed — please try again', 'error');
        deferred.reject(xhr);
      },
    });

    return deferred.promise();
  };

  // ── Copy to SOW payload builder ──────────────────────────────

  /**
   * Walk a SOW grid's rows for a given bid package and categorize into:
   *   updates  — matched SOW item + bid cell → copy bid values to SOW
   *   creates  — bid cell with no SOW match  → new SOW item needed
   *   removals — SOW item with no bid cell   → remove from SOW
   *
   * @param {string} pkgId   — bid package ID to sync
   * @param {object} sowGrid — one entry from state.sowGrids
   * @returns {object} payload ready for submitAction
   */
  ns.buildCopyToSowPayload = function buildCopyToSowPayload(pkgId, sowGrid) {
    var updates  = [];
    var creates  = [];
    var removals = [];
    var rows     = sowGrid.rows;

    for (var i = 0; i < rows.length; i++) {
      var row  = rows[i];
      var cell = row.cellsByPackage[pkgId] || null;

      if (row.sowItem && cell) {
        // Matched: update SOW item with bid values
        updates.push({
          sowItemId:    row.sowItem,
          bidRecordId:  cell.id,
          qty:          cell.qty,
          rate:         cell.rate,
          labor:        cell.labor,
          laborDesc:    cell.laborDesc,
          productName:  cell.productName,
          existCabling: /^yes$/i.test(cell.bidExistCabling),
          connDevice:   cell.bidConnDeviceIds,
          mapConn:      cell.mapConnections,
          notes:        cell.notes,
          product:        cell.field2627,
          sku:            cell.sku,
          price:          cell.price,
          productDesc:    cell.productDesc,
          dropLength:     cell.bidDropLength,
          conduit:        /^yes$/i.test(cell.bidConduit),
          plenum:         /^yes$/i.test(cell.bidPlenum),
          dropPrefix:     cell.dropPrefix,
          dropNumber:     cell.dropNumber,
          exterior:       /^yes$/i.test(cell.bidExterior),
          limitQtyOne:      cell.limitQtyOne,
          proposalBucket:   cell.proposalBucketId,
          mdfIdf:           cell.mdfIdfId,
        });
      } else if (!row.sowItem && cell) {
        // NEW: create SOW item from bid data
        creates.push({
          bidRecordId:      cell.id,
          qty:              cell.qty,
          rate:             cell.rate,
          labor:            cell.labor,
          laborDesc:        cell.laborDesc,
          productName:      cell.productName,
          existCabling:     /^yes$/i.test(cell.bidExistCabling),
          connDevice:       cell.bidConnDeviceIds,
          mapConn:          cell.mapConnections,
          notes:            cell.notes,
          product:          cell.field2627,
          sku:              cell.sku,
          price:            cell.price,
          productDesc:      cell.productDesc,
          dropLength:       cell.bidDropLength,
          conduit:          /^yes$/i.test(cell.bidConduit),
          plenum:           /^yes$/i.test(cell.bidPlenum),
          dropPrefix:       cell.dropPrefix,
          dropNumber:       cell.dropNumber,
          exterior:         /^yes$/i.test(cell.bidExterior),
          limitQtyOne:      cell.limitQtyOne,
          proposalBucket:   cell.proposalBucketId,
          mdfIdf:           cell.mdfIdfId,
          displayLabel:     row.displayLabel,
        });
      } else if (row.sowItem && !cell) {
        // Removal: SOW item not covered by this bid package
        removals.push({
          sowItemId: row.sowItem,
        });
      }
    }

    return {
      actionType: 'package_copy_to_sow',
      packageId:  pkgId,
      sowId:      sowGrid.sowId,
      updates:    updates,
      creates:    creates,
      removals:   removals,
    };
  };

  // ── Create New SOW payload builder ───────────────────────────

  /**
   * Walk every SOW grid + row and produce two flat lists for a
   * "create new SOW" webhook:
   *   matchedSowItems  — rows whose SOW line item already exists AND
   *                      has at least one bid cell (across any package).
   *                      The new SOW should adopt these items.
   *   orphanBidRecords — bid records whose row has no matching SOW
   *                      line item. The new SOW needs net-new line
   *                      items built from these bid records.
   *
   * Source views:
   *   view_3680 — bid review records (CFG.viewKey). Row.cellsByPackage[*]
   *               and row._rawRecord carry the full record with every
   *               field projected by that view.
   *   view_3728 — unbid SOW line items (CFG.sowItemsViewKey). Used to
   *               build "no bid" rows; row._rawRecord carries the full
   *               record with every field projected by that view.
   *
   * Each entry in `matchedSowItems` includes a `sourceRecord` property
   * holding the entire raw record (every field_NNNN + field_NNNN_raw)
   * from whichever source view the row came from. Each entry in
   * `bidRecords` (and in `orphanBidRecords`) includes a `bidRecord`
   * property with the entire raw view_3680 record.
   */
  ns.buildCreateNewSowPayload = function buildCreateNewSowPayload(state) {
    var matchedSowItems  = [];
    var orphanBidRecords = [];

    if (!state || !state.sowGrids) {
      return {
        actionType:       'create_new_sow',
        matchedSowItems:  matchedSowItems,
        orphanBidRecords: orphanBidRecords,
      };
    }

    for (var g = 0; g < state.sowGrids.length; g++) {
      var grid = state.sowGrids[g];
      var pkgs = grid.packages || [];
      var rows = grid.rows || [];

      var pkgNameById = {};
      for (var p = 0; p < pkgs.length; p++) pkgNameById[pkgs[p].id] = pkgs[p].name;

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var bidCells = [];
        var pkgIds = Object.keys(row.cellsByPackage || {});
        for (var c = 0; c < pkgIds.length; c++) {
          var pkgId = pkgIds[c];
          var cell  = row.cellsByPackage[pkgId];
          if (!cell) continue;
          bidCells.push({
            bidRecordId:    cell.id,
            packageId:      pkgId,
            packageName:    pkgNameById[pkgId] || '',
            qty:            cell.qty,
            rate:           cell.rate,
            labor:          cell.labor,
            laborDesc:      cell.laborDesc,
            productName:    cell.productName,
            existCabling:   /^yes$/i.test(cell.bidExistCabling),
            connDevice:     cell.bidConnDeviceIds,
            mapConn:        cell.mapConnections,
            notes:          cell.notes,
            product:        cell.field2627,
            sku:            cell.sku,
            price:          cell.price,
            productDesc:    cell.productDesc,
            dropLength:     cell.bidDropLength,
            conduit:        /^yes$/i.test(cell.bidConduit),
            plenum:         /^yes$/i.test(cell.bidPlenum),
            dropPrefix:     cell.dropPrefix,
            dropNumber:     cell.dropNumber,
            exterior:       /^yes$/i.test(cell.bidExterior),
            limitQtyOne:    cell.limitQtyOne,
            proposalBucket: cell.proposalBucketId,
            mdfIdf:         cell.mdfIdfId,
            // Every field on the bid record from view_3680
            bidRecord:      cell._rawRecord || null,
          });
        }

        if (row.sowItem && bidCells.length) {
          matchedSowItems.push({
            sourceSowId:     grid.sowId,
            sourceSowName:   grid.sowName,
            sowItemId:       row.sowItem,
            displayLabel:    row.displayLabel,
            productName:     row.productName,
            mdfIdf:          row.mdfIdf,
            proposalBucket:  row.proposalBucket,
            sortOrder:       row.sortOrder,
            sowQty:          row.sowQty,
            sowFee:          row.sowFee,
            sowProduct:      row.sowProduct,
            sowLaborDesc:    row.sowLaborDesc,
            sowExistCabling: row.sowExistCabling,
            sowPlenum:       row.sowPlenum,
            sowExterior:     row.sowExterior,
            sowDropLength:   row.sowDropLength,
            sowConduit:      row.sowConduit,
            sowConnDevice:   row.sowConnDeviceIds,
            sowMapConn:      row.sowMapConn,
            sowMdfIdf:       row.sowMdfIdf,
            // Every field on the source record (view_3680 bid record OR
            // view_3728 unbid SOW item, depending on which view this row
            // came from). Includes the field_NNNN and field_NNNN_raw
            // pair for every column projected by the source view.
            sourceRecord:    row._rawRecord || null,
            bidRecords:      bidCells,
          });
        } else if (!row.sowItem && bidCells.length) {
          for (var b = 0; b < bidCells.length; b++) {
            var bc = bidCells[b];
            bc.sourceSowId   = grid.sowId;
            bc.sourceSowName = grid.sowName;
            bc.displayLabel  = row.displayLabel;
            orphanBidRecords.push(bc);
          }
        }
      }
    }

    return {
      actionType:       'create_new_sow',
      matchedSowItems:  matchedSowItems,
      orphanBidRecords: orphanBidRecords,
    };
  };

  /**
   * Build a human-readable label for a toast message.
   */
  function describeAction(payload) {
    switch (payload.actionType) {
      case 'row_adopt':             return 'Row adopted';
      case 'row_create':            return 'SOW item creation requested';
      case 'row_skip':              return 'Row skipped';
      case 'package_adopt_all':      return 'Adopt All (' + (payload.rowIds ? payload.rowIds.length : 0) + ' rows)';
      case 'package_create_missing': return 'Create Missing (' + (payload.rowIds ? payload.rowIds.length : 0) + ' rows)';
      case 'package_adopt_create':   return 'Adopt + Create (' + (payload.rowIds ? payload.rowIds.length : 0) + ' rows)';
      case 'package_copy_to_sow':    return 'Copy to SOW requested';
      case 'package_create_sow':     return 'Create new SOW requested';
      case 'create_new_sow':         return 'New SOW (' + ((payload.matchedSowItems || []).length + (payload.orphanBidRecords || []).length) + ' items) requested';
      case 'change_request':         return 'Change request (' + (payload.items ? payload.items.length : 0) + ' items)';
      default:                       return 'Action submitted';
    }
  }

})();
