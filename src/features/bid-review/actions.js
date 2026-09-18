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
    if (payload.packageName) body.packageName = payload.packageName;
    if (payload.projectId)   body.projectId   = payload.projectId;
    if (payload.sowId)       body.sowId       = payload.sowId;
    if (payload.sourceSowId) body.sourceSowId = payload.sourceSowId;
    if (payload.sourceSowName) body.sourceSowName = payload.sourceSowName;
    if (payload.rowIds)      body.rowIds      = payload.rowIds;
    if (payload.updates)     body.updates     = payload.updates;
    if (payload.creates)     body.creates     = payload.creates;
    if (payload.removals)    body.removals    = payload.removals;
    if (payload.items)       body.items       = payload.items;
    if (payload.matchedSowItems)  body.matchedSowItems  = payload.matchedSowItems;
    if (payload.orphanBidRecords) body.orphanBidRecords = payload.orphanBidRecords;
    // Full raw source record (every field_NNNN + field_NNNN_raw) — used by
    // row_add_to_sow so the Make scenario gets the entire bid/survey line item.
    if (payload.sourceRecord)     body.sourceRecord     = payload.sourceRecord;
    // Survey-costs payload (PM-mobilization webhook). surveyCosts is
    // numeric; surveyCostsRaw preserves the user's literal entry; null
    // means the input was empty or non-numeric.
    if (payload.surveyCosts !== undefined)      body.surveyCosts      = payload.surveyCosts;
    if (payload.surveyCostsRaw !== undefined)   body.surveyCostsRaw   = payload.surveyCostsRaw;
    if (payload.surveyCostsField)               body.surveyCostsField = payload.surveyCostsField;

    if (CFG.debug) {
      SCW.debug('[BidReview] Submitting action:', body);
    }

    var webhookUrl = CFG.actionWebhook;
    if (payload.actionType === 'create_new_sow' && CFG.createNewSowWebhook) {
      webhookUrl = CFG.createNewSowWebhook;
    } else if (payload.actionType === 'row_add_to_sow' && CFG.addToSowWebhook) {
      webhookUrl = CFG.addToSowWebhook;
    } else if (payload.actionType === 'add_pm_mobilization' && CFG.addPmMobilizationWebhook) {
      webhookUrl = CFG.addPmMobilizationWebhook;
    }

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

        // Add to SOW: Make creates the new SOW line item server-side (async),
        // so the comparison grid won't show it until the SOW-item source view
        // (view_3921) is re-read. Re-fetch + rebuild a beat after the webhook
        // returns — and once more, since Make can respond before the record is
        // committed. Prefers the v2 grid's own data layer (re-fetches every
        // source view + rebuilds); falls back to v1's refresh.
        if (payload.actionType === 'row_add_to_sow') {
          var doSowRefresh = function () {
            try {
              var v2d = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.data;
              if (v2d && typeof v2d.refetchAll === 'function') { v2d.refetchAll(); return; }
            } catch (e) {}
            try { if (typeof ns.refresh === 'function') ns.refresh(); } catch (e) {}
          };
          setTimeout(doSowRefresh, 1500);
          setTimeout(doSowRefresh, 4500);
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
   * ⚠ SYNC CONTRACT LIVES IN docs/sow-bid-sync.md — the Make scenario
   * self-derives the authoritative sync from {packageId, sowId} at apply
   * time (a second trigger fires on subcontractor bid submit, with no page
   * behind it). This rich payload is ADVISORY: the confirm modal previews
   * from it and Make run history logs it, but changes to sync semantics
   * must land in the scenario's derivation + the doc, not only here.
   *
   * @param {string} pkgId   — bid package ID to sync
   * @param {object} sowGrid — one entry from state.sowGrids
   * @returns {object} payload ready for submitAction
   */
  ns.buildCopyToSowPayload = function buildCopyToSowPayload(pkgId, sowGrid) {
    var updates  = [];
    var creates  = [];
    var removals = [];
    // Duplicate bid items: when 2+ bid line items on this bid map to the
    // SAME SOW item, only ONE should keep the SOW connection. The extras
    // are disconnected (REL_sow-line-item / field_2404 cleared) so they
    // don't all keep pointing at the one SOW item that's being updated.
    var disconnectBids = [];
    var sowFK = (CFG.fieldKeys && CFG.fieldKeys.relatedSowItem) || 'field_2404';
    var rows     = sowGrid.rows;

    // Pre-pass: which SOW items are covered by a bid cell on this package.
    // Needed BEFORE the removal decision below — an accessory row's own
    // parent may appear later in `rows` than the accessory itself, so this
    // can't be decided inline in a single forward pass.
    var coveredSowItemIds = {};
    for (var ci = 0; ci < rows.length; ci++) {
      var crow = rows[ci];
      if (crow.sowItem && crow.cellsByPackage[pkgId]) coveredSowItemIds[crow.sowItem] = true;
    }

    for (var i = 0; i < rows.length; i++) {
      var row  = rows[i];
      var cell = row.cellsByPackage[pkgId] || null;

      // Disconnect any duplicate bid records sharing this SOW item.
      if (cell && cell.dupes && cell.dupes.length && row.sowItem) {
        for (var d = 0; d < cell.dupes.length; d++) {
          disconnectBids.push({
            bidRecordId:  cell.dupes[d].id,
            sowItemId:    row.sowItem,        // the SOW item to disconnect FROM
            field:        sowFK,              // field to clear on the bid record
            keptBidId:    cell.id,            // the duplicate we're keeping
            productName:  cell.dupes[d].productName,
            bidRecord:    cell.dupes[d]._rawRecord || null
          });
        }
      }

      if (row.sowItem && cell) {
        // Matched: update SOW item with bid values
        updates.push({
          sowItemId:    row.sowItem,
          bidRecordId:  cell.id,
          label:        row.displayLabel || cell.productName || row.sowProduct || row.productName || row.sowItem,
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
          // Conduit is numeric feet (field_2368), NOT a yes/no flag —
          // ship the raw value so it can be written to the SOW's
          // numeric conduit field. The earlier /^yes$/i.test() coerced
          // legitimate footage to false.
          conduit:        cell.bidConduit,
          plenum:         /^yes$/i.test(cell.bidPlenum),
          dropPrefix:     cell.dropPrefix,
          dropNumber:     cell.dropNumber,
          exterior:       /^yes$/i.test(cell.bidExterior),
          limitQtyOne:      cell.limitQtyOne,
          proposalBucket:   cell.proposalBucketId,
          mdfIdf:           cell.mdfIdfId,
          // Full bid record (every field_NNNN + field_NNNN_raw the view
          // projects). Make scenarios should prefer .bidRecord.field_XXXX_raw
          // for any field not enumerated above — including field_2374
          // (bidMapConn / FLAG_map camera or reader connections).
          bidRecord:      cell._rawRecord || null,
        });
      } else if (!row.sowItem && cell) {
        // NEW: create SOW item from bid data
        creates.push({
          bidRecordId:      cell.id,
          label:            row.displayLabel || cell.productName || row.productName || cell.id,
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
          // Conduit is numeric feet (field_2368) — see updates branch.
          conduit:          cell.bidConduit,
          plenum:           /^yes$/i.test(cell.bidPlenum),
          dropPrefix:       cell.dropPrefix,
          dropNumber:       cell.dropNumber,
          exterior:         /^yes$/i.test(cell.bidExterior),
          limitQtyOne:      cell.limitQtyOne,
          proposalBucket:   cell.proposalBucketId,
          mdfIdf:           cell.mdfIdfId,
          displayLabel:     row.displayLabel,
          // Full bid record with every field projected by view_3680
          // (field_NNNN + field_NNNN_raw pairs). Keyed fields above are
          // kept for backwards-compat with existing Make mappings; new
          // mappings should prefer .bidRecord.field_NNNN_raw so any
          // field added to the view shows up automatically here.
          bidRecord:        cell._rawRecord || null,
        });
      } else if (row.sowItem && !cell) {
        // Removal: SOW item not covered by this bid package. BUT — an
        // accessory/mounting-hardware row (row.accessoryParentId set)
        // never gets its own bid cell; bids price the parent device, not
        // each accessory. So an accessory with no cell of its own is only
        // a real removal when its PARENT is ALSO not covered this round
        // (the parent is being removed too). A parent that IS covered
        // (being updated) keeps its children untouched — skip the
        // accessory entirely rather than flagging it for removal.
        if (row.accessoryParentId && coveredSowItemIds[row.accessoryParentId]) continue;
        removals.push({
          sowItemId: row.sowItem,
          // Human-readable name so the confirm modal can show WHICH
          // items will be disconnected from the SOW. Prefer the SOW
          // item's own label (field_1950) — these items aren't on the
          // bid, so the bid-side label is empty and we'd otherwise fall
          // back to the raw record id.
          label: row.sowItemLabel || row.displayLabel || row.sowProduct || row.productName || row.sowItem,
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
      // Extra bid items (beyond the first) that share a SOW item with the
      // kept bid — Make clears each one's field_2404 so only the kept bid
      // stays connected. Always applied (not user-deselectable).
      disconnectBids: disconnectBids,
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
   *   view_3921 — unbid SOW line items (CFG.sowItemsViewKey). Used to
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
            // Conduit is numeric feet (field_2368) — NOT a yes/no flag.
            conduit:        cell.bidConduit,
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
            // view_3921 unbid SOW item, depending on which view this row
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
   * Build a create-new-SOW payload scoped to a SINGLE bid package within
   * one SOW grid. Fired by the per-bid "+ Create new SOW" header button —
   * creates a whole new SOW in Make from just that subcontractor's bid.
   * Same shape as buildCreateNewSowPayload (actionType create_new_sow) so
   * it routes to the same webhook, but only that package's bid cells are
   * included.
   */
  ns.buildCreateNewSowForPackagePayload = function buildCreateNewSowForPackagePayload(grid, pkgId) {
    var matchedSowItems  = [];
    var orphanBidRecords = [];

    var pkgs = (grid && grid.packages) || [];
    var pkgName = '';
    for (var p = 0; p < pkgs.length; p++) { if (pkgs[p].id === pkgId) { pkgName = pkgs[p].name; break; } }

    var rows = (grid && grid.rows) || [];
    for (var i = 0; i < rows.length; i++) {
      var row  = rows[i];
      var cell = row.cellsByPackage && row.cellsByPackage[pkgId];
      if (!cell) continue;

      var bidCell = {
        bidRecordId:    cell.id,
        packageId:      pkgId,
        packageName:    pkgName,
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
        conduit:        cell.bidConduit,
        plenum:         /^yes$/i.test(cell.bidPlenum),
        dropPrefix:     cell.dropPrefix,
        dropNumber:     cell.dropNumber,
        exterior:       /^yes$/i.test(cell.bidExterior),
        limitQtyOne:    cell.limitQtyOne,
        proposalBucket: cell.proposalBucketId,
        mdfIdf:         cell.mdfIdfId,
        bidRecord:      cell._rawRecord || null,
      };

      if (row.sowItem) {
        matchedSowItems.push({
          sourceSowId:     grid.sowId,
          sourceSowName:   grid.sowName,
          sowItemId:       row.sowItem,
          displayLabel:    row.displayLabel,
          sowItemLabel:    row.sowItemLabel,
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
          sourceRecord:    row._rawRecord || null,
          bidRecords:      [bidCell],
        });
      } else {
        bidCell.sourceSowId   = grid.sowId;
        bidCell.sourceSowName = grid.sowName;
        bidCell.displayLabel  = row.displayLabel;
        orphanBidRecords.push(bidCell);
      }
    }

    return {
      actionType:       'create_new_sow',
      packageId:        pkgId,
      packageName:      pkgName,
      sourceSowId:      grid ? grid.sowId : '',
      sourceSowName:    grid ? grid.sowName : '',
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
      case 'row_add_to_sow':        return 'Add to SOW requested';
      case 'row_skip':              return 'Row skipped';
      case 'package_adopt_all':      return 'Adopt All (' + (payload.rowIds ? payload.rowIds.length : 0) + ' rows)';
      case 'package_create_missing': return 'Create Missing (' + (payload.rowIds ? payload.rowIds.length : 0) + ' rows)';
      case 'package_adopt_create':   return 'Adopt + Create (' + (payload.rowIds ? payload.rowIds.length : 0) + ' rows)';
      case 'package_copy_to_sow':    return 'Copy to SOW requested';
      case 'package_create_sow':     return 'Create new SOW requested';
      case 'create_new_sow':         return 'New SOW (' + ((payload.matchedSowItems || []).length + (payload.orphanBidRecords || []).length) + ' items) requested';
      case 'add_pm_mobilization':    return 'Add PM & Mobilization line item requested';
      case 'change_request':         return 'Change request (' + (payload.items ? payload.items.length : 0) + ' items)';
      default:                       return 'Action submitted';
    }
  }

})();
