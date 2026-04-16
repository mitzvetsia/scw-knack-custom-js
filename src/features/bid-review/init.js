/*** BID REVIEW — INITIALIZATION ***/
/**
 * Orchestrates the Bid Review Matrix feature:
 *   1. Binds to Knack view render
 *   2. Loads data → transforms → renders
 *   3. Installs a single delegated click handler for all actions
 *
 * Reads : SCW.bidReview.CONFIG, .injectStyles, .loadRawData,
 *         .buildState, .collectEligible, .renderMatrix,
 *         .showLoading, .submitAction, .renderToast
 * Writes: SCW.bidReview.refresh()
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  var INIT_FLAG = 'data-scw-bid-review-init';
  var CAM_READER_BUCKET_ID = '6481e5ba38f283002898113c';

  // Current state — kept in closure for the click handler
  var _state = null;
  var _mdfIdfRecords = [];  // MDF/IDF location records from view_3822

  // ── load → transform → render pipeline ──────────────────────

  function runPipeline() {
    ns.showLoading();

    ns.loadRawData().then(function (raw) {
      _state = ns.buildState(raw.records, raw.sowItems || [], raw.bidPackages || []);
      _mdfIdfRecords = raw.mdfIdfRecords || [];

      if (CFG.debug) {
        console.log('[BidReview] State built:',
          _state.sowGrids.length, 'SOW grids,',
          _state.allPackages.length, 'packages,',
          _mdfIdfRecords.length, 'MDF/IDF records');
      }

      var mount = ns.renderMatrix(_state);
      attachClickHandler(mount);

      // Rehydrate change request drafts from Knack field
      if (ns.changeRequests && ns.changeRequests.rehydrate) {
        ns.changeRequests.rehydrate(_state.sowGrids);
      }
    }).fail(function (err) {
      console.error('[BidReview] Pipeline failed:', err);
      ns.renderToast('Failed to load comparison data', 'error');
    });
  }

  /** Silent refresh — re-fetches data and re-renders without the loading spinner. */
  var _silentRefreshRunning = false;

  function refreshSilently() {
    if (_silentRefreshRunning) return;
    _silentRefreshRunning = true;

    ns.loadRawData().then(function (raw) {
      _state = ns.buildState(raw.records, raw.sowItems || [], raw.bidPackages || []);
      _mdfIdfRecords = raw.mdfIdfRecords || [];
      var mount = ns.renderMatrix(_state);
      attachClickHandler(mount);
    }).fail(function (err) {
      if (CFG.debug) console.warn('[BidReview] Silent refresh failed:', err);
    }).always(function () {
      _silentRefreshRunning = false;
    });
  }

  // ── find a SOW grid from the current state ──────────────────

  function findSowGrid(sowId) {
    if (!_state) return null;
    for (var i = 0; i < _state.sowGrids.length; i++) {
      if (_state.sowGrids[i].sowId === sowId) return _state.sowGrids[i];
    }
    return null;
  }

  // ── delegated click handler ─────────────────────────────────

  function attachClickHandler(mount) {
    if (!mount || mount.getAttribute(INIT_FLAG)) return;
    mount.setAttribute(INIT_FLAG, '1');

    // Close overflow menus on any click outside
    document.addEventListener('click', function () {
      var open = document.querySelectorAll('.scw-bid-review__overflow--open');
      for (var i = 0; i < open.length; i++) open[i].classList.remove('scw-bid-review__overflow--open');
    });

    mount.addEventListener('click', function (e) {
      // Match buttons, clickable cards, or overflow menu items
      var button = e.target.closest('.scw-bid-review__btn')
        || e.target.closest('.scw-bid-cr-card[data-action]')
        || e.target.closest('.scw-bid-review__overflow-item[data-action]');
      if (!button) return;

      // Close overflow menu after picking an item
      var overflow = button.closest('.scw-bid-review__overflow');
      if (overflow) overflow.classList.remove('scw-bid-review__overflow--open');

      var action = button.getAttribute('data-action');
      if (!action) return;

      if (button.classList.contains('scw-bid-review__btn--busy')) return;

      if (action === 'cell_request_change') {
        handleChangeRequest(button);
      } else if (action === 'cell_remove_from_bid') {
        handleRemoveFromBid(button);
      } else if (action === 'cell_add_to_bid') {
        handleAddToBid(button);
      } else if (action === 'cr_submit') {
        var pkgId = button.getAttribute('data-pkg-id');
        if (ns.changeRequests && ns.changeRequests.submitForPackage) {
          ns.changeRequests.submitForPackage(pkgId);
        }
      } else if (action === 'cr_clear_all') {
        if (ns.changeRequests && ns.changeRequests.clear) {
          if (window.confirm('Clear all pending change requests?')) {
            ns.changeRequests.clear();
          }
        }
      } else if (action.indexOf('package_') === 0) {
        handlePackageAction(button, action);
      } else if (action.indexOf('row_') === 0) {
        handleRowAction(button, action);
      }
    });
  }

  // ── package-level action ────────────────────────────────────

  function findPackageName(grid, pkgId) {
    for (var i = 0; i < grid.packages.length; i++) {
      if (grid.packages[i].id === pkgId) return grid.packages[i].name;
    }
    return pkgId;
  }

  /**
   * Build MDF/IDF dropdown options from view_3822 records.
   * Each record becomes { id, identifier }.
   */
  function buildMdfIdfOptions() {
    var opts = [];
    var seen = {};
    for (var i = 0; i < _mdfIdfRecords.length; i++) {
      var rec = _mdfIdfRecords[i];
      if (!rec.id || seen[rec.id]) continue;
      seen[rec.id] = true;
      // Use field_1642 for the display label
      var name = rec.field_1642 || '';
      if (typeof name === 'string') name = name.replace(/<[^>]*>/g, '').trim();
      opts.push({ id: rec.id, identifier: name || rec.id });
    }
    opts.sort(function (a, b) { return a.identifier.localeCompare(b.identifier); });
    return opts;
  }

  /**
   * Build Connected Devices + Connected To dropdown options from grid rows.
   * Used by the Add to Bid modal for camera/reader items.
   * Returns { bidConnDevice: [...], bidConnTo: [...] }
   */
  /**
   * Build a set of camera/reader IDs that are already claimed as Connected
   * Devices on ANY record (existing bid cells + pending change requests).
   * Excludes the given selfId so the current item's own selections don't
   * block themselves from appearing.
   */
  function buildClaimedDeviceSet(grid, selfId) {
    var TAG = '[ClaimedDevices]';
    var claimed = {};
    console.log(TAG, 'Building claimed set, selfId:', selfId);
    // 1. Existing bid records — scan all cells across all packages
    for (var ri = 0; ri < grid.rows.length; ri++) {
      var row = grid.rows[ri];
      var pkgs = Object.keys(row.cellsByPackage);
      for (var pi = 0; pi < pkgs.length; pi++) {
        var c = row.cellsByPackage[pkgs[pi]];
        if (c.id === selfId) continue; // skip self
        var ids = c.bidConnDeviceIds || [];
        if (ids.length) console.log(TAG, '  bid cell', c.id, 'bidConnDeviceIds:', ids);
        for (var di = 0; di < ids.length; di++) claimed[ids[di]] = true;
      }
    }
    // 2. Pending change requests — check requested bidConnDeviceIds
    var crApi = ns.changeRequests;
    if (crApi && typeof crApi.getPending === 'function') {
      var pending = crApi.getPending();
      var pkeys = Object.keys(pending);
      console.log(TAG, '  pending packages:', pkeys.length);
      for (var pk = 0; pk < pkeys.length; pk++) {
        var items = pending[pkeys[pk]].items || [];
        for (var ii = 0; ii < items.length; ii++) {
          var it = items[ii];
          console.log(TAG, '  pending item:', it.rowId, 'bidRecordId:', it.bidRecordId,
            'displayLabel:', it.displayLabel,
            'req.bidConnDevice:', it.requested && it.requested.bidConnDevice,
            'req.bidConnDeviceIds:', it.requested && it.requested.bidConnDeviceIds);
          // Skip self
          if (it.bidRecordId === selfId || it.rowId === selfId) {
            console.log(TAG, '    → SKIPPED (self)');
            continue;
          }
          var reqIds = (it.requested && it.requested.bidConnDeviceIds) || [];
          for (var qi = 0; qi < reqIds.length; qi++) claimed[reqIds[qi]] = true;
        }
      }
    } else {
      console.warn(TAG, '  ns.changeRequests or getPending not available!');
    }
    var claimedKeys = Object.keys(claimed);
    console.log(TAG, 'Final claimed set (' + claimedKeys.length + '):', claimedKeys);
    return claimed;
  }

  function buildAddConnOptions(grid, selfId) {
    var claimed = buildClaimedDeviceSet(grid, selfId);
    var connDevOpts = [], connToOpts = [];
    var seenDev = {}, seenTo = {};

    for (var ci = 0; ci < grid.rows.length; ci++) {
      var cr = grid.rows[ci];
      var cpkgs = Object.keys(cr.cellsByPackage);

      // noBid / surveyNoBid rows
      if ((cr.noBid || cr.surveyNoBid) && cpkgs.length === 0) {
        var nbLbl = cr.displayLabel || cr.sowProduct || cr.productName || cr.id;
        if (cr.sowProduct && cr.displayLabel && cr.displayLabel !== cr.sowProduct
            && nbLbl.indexOf(cr.sowProduct) === -1) {
          nbLbl = cr.displayLabel + ' \u2014 ' + cr.sowProduct;
        }
        var nbIsCR = cr.proposalBucketId === CAM_READER_BUCKET_ID;
        if (nbIsCR && !seenDev[cr.id] && !claimed[cr.id]) {
          seenDev[cr.id] = true;
          connDevOpts.push({ id: cr.id, identifier: nbLbl, noBid: true, rowId: cr.id });
        }
        var nbMapConn = /^yes$/i.test(String(cr.sowMapConn || '').trim());
        if (nbMapConn && !seenTo[cr.id]) {
          seenTo[cr.id] = true;
          connToOpts.push({ id: cr.id, identifier: nbLbl, noBid: true, rowId: cr.id });
        }
        continue;
      }

      for (var cp = 0; cp < cpkgs.length; cp++) {
        var cc = cr.cellsByPackage[cpkgs[cp]];
        if (!cc.id) continue;

        var lbl = cr.displayLabel || cr.productName || cc.productName || cc.id;
        if (cr.productName && cr.displayLabel && cr.displayLabel !== cr.productName
            && lbl.indexOf(cr.productName) === -1) {
          lbl = cr.displayLabel + ' \u2014 ' + cr.productName;
        }

        var isCR = cr.proposalBucketId === CAM_READER_BUCKET_ID;
        var connToBlank = !cc.bidConnTo || String(cc.bidConnTo).trim() === '';

        if (!seenDev[cc.id] && isCR && connToBlank && !claimed[cc.id]) {
          seenDev[cc.id] = true;
          connDevOpts.push({ id: cc.id, identifier: lbl });
        }
        if (!seenTo[cc.id] && cc.mapConnections) {
          seenTo[cc.id] = true;
          connToOpts.push({ id: cc.id, identifier: lbl });
        }
      }
    }

    return { bidConnDevice: connDevOpts, bidConnTo: connToOpts };
  }

  function findPackageSurveyId(grid, pkgId) {
    for (var i = 0; i < grid.packages.length; i++) {
      if (grid.packages[i].id === pkgId) return grid.packages[i].surveyId || '';
    }
    return '';
  }

  function handlePackageAction(button, actionType) {
    if (!_state) return;

    var pkgId  = button.getAttribute('data-package-id');
    var sowId  = button.getAttribute('data-sow-id');
    var grid   = findSowGrid(sowId);

    if (!grid) {
      ns.renderToast('SOW grid not found', 'error');
      return;
    }

    // Copy to SOW uses the structured payload builder
    if (actionType === 'package_copy_to_sow') {
      handleCopyToSow(button, pkgId, grid);
      return;
    }

    var rowIds = ns.collectEligible(pkgId, actionType, grid);

    if (!rowIds.length) {
      ns.renderToast('No eligible rows for this action', 'info');
      return;
    }

    var pkgName = findPackageName(grid, pkgId);

    var verb = actionType === 'package_adopt_all'      ? 'Adopt'
             : actionType === 'package_create_missing'  ? 'Create'
             : 'Adopt + Create';

    var confirmed = window.confirm(
      verb + ' ' + rowIds.length + ' row(s) from ' + pkgName +
      ' into ' + grid.sowName + '?'
    );
    if (!confirmed) return;

    setBusy(button, true);

    ns.submitAction({
      actionType: actionType,
      packageId:  pkgId,
      sowId:      sowId,
      rowIds:     rowIds,
    }).done(function () {
      refreshSilently();
    }).always(function () {
      setBusy(button, false);
    });
  }

  // ── Copy to SOW — processing toast + poll refresh ────────────

  var COPY_TOAST_ID  = 'scw-bid-review-copy-toast';
  var COPY_CSS_ID    = 'scw-bid-review-copy-css';
  var COPY_POLL_MS    = 5000;     // poll every 5s
  var COPY_TIMEOUT_MS = 120000;  // stop after 2 minutes
  var _copyPollTimer  = null;

  function injectCopyToastStyle() {
    if (document.getElementById(COPY_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = COPY_CSS_ID;
    s.textContent = [
      '#' + COPY_TOAST_ID + ' {',
      '  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);',
      '  background: #1e3a5f; color: #fff; padding: 12px 20px;',
      '  border-radius: 8px; font-size: 13px; font-weight: 500;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,.18); z-index: 10000;',
      '  display: flex; align-items: center; gap: 10px;',
      '  transition: opacity 300ms ease;',
      '}',
      '#' + COPY_TOAST_ID + ' .scw-copy-spinner {',
      '  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3);',
      '  border-top-color: #fff; border-radius: 50%;',
      '  animation: scwCopySpin .8s linear infinite; flex-shrink: 0;',
      '}',
      '#' + COPY_TOAST_ID + ' .scw-copy-close {',
      '  background: none; border: none; color: rgba(255,255,255,.7);',
      '  font-size: 18px; cursor: pointer; padding: 0 0 0 6px;',
      '  line-height: 1; font-weight: 700; flex-shrink: 0;',
      '}',
      '#' + COPY_TOAST_ID + ' .scw-copy-close:hover { color: #fff; }',
      '@keyframes scwCopySpin { to { transform: rotate(360deg); } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showCopyToast(message) {
    injectCopyToastStyle();
    hideCopyToast(true); // remove any existing toast instantly

    var toast = document.createElement('div');
    toast.id = COPY_TOAST_ID;

    var spinner = document.createElement('span');
    spinner.className = 'scw-copy-spinner';
    toast.appendChild(spinner);

    toast.appendChild(document.createTextNode(message));

    var closeBtn = document.createElement('button');
    closeBtn.className = 'scw-copy-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Dismiss and stop refreshing';
    closeBtn.addEventListener('click', function () {
      stopCopyPoll();
      hideCopyToast();
    });
    toast.appendChild(closeBtn);

    document.body.appendChild(toast);
  }

  function hideCopyToast(instant) {
    var toast = document.getElementById(COPY_TOAST_ID);
    if (!toast) return;
    if (instant) { toast.remove(); return; }
    toast.style.opacity = '0';
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 350);
  }

  function startCopyPoll() {
    stopCopyPoll();
    var elapsed = 0;

    _copyPollTimer = setInterval(function () {
      elapsed += COPY_POLL_MS;
      refreshSilently();

      if (elapsed >= COPY_TIMEOUT_MS) {
        stopCopyPoll();
        hideCopyToast();
        ns.renderToast('Sync may still be processing \u2014 refresh to check', 'info');
      }
    }, COPY_POLL_MS);
  }

  function stopCopyPoll() {
    if (_copyPollTimer) {
      clearInterval(_copyPollTimer);
      _copyPollTimer = null;
    }
  }

  function handleCopyToSow(button, pkgId, grid) {
    var payload = ns.buildCopyToSowPayload(pkgId, grid);

    var total = payload.updates.length + payload.creates.length + payload.removals.length;
    if (total === 0) {
      ns.renderToast('Nothing to sync \u2014 SOW already matches this bid', 'info');
      return;
    }

    var pkgName = findPackageName(grid, pkgId);

    var summary = [];
    if (payload.updates.length)  summary.push(payload.updates.length  + ' update(s)');
    if (payload.creates.length)  summary.push(payload.creates.length  + ' new item(s)');
    if (payload.removals.length) summary.push(payload.removals.length + ' removal(s)');

    var confirmed = window.confirm(
      'Copy ' + pkgName + ' to ' + grid.sowName + '?\n\n' + summary.join(', ')
    );
    if (!confirmed) return;

    // Show processing toast and start polling
    showCopyToast('Syncing ' + pkgName + ' \u2192 ' + grid.sowName + ': ' + summary.join(', ') + '\u2026');
    startCopyPoll();

    setBusy(button, true);

    ns.submitAction(payload)
      .done(function () {
        // Webhook responded 200 — Make scenario is complete.
        // Stop polling, refresh the grid immediately, and show success.
        if (CFG.debug) console.log('[BidReview] Copy to SOW webhook completed');
        stopCopyPoll();
        hideCopyToast();
        refreshSilently();
        ns.renderToast('SOW updated successfully', 'success');
      })
      .fail(function (xhr) {
        // Timeout or error — keep polling; Make may still be processing
        if (CFG.debug) {
          console.log('[BidReview] Webhook timeout/error (status ' +
            (xhr && xhr.status) + ') — continuing to poll');
        }
      })
      .always(function () {
        setBusy(button, false);
      });
  }

  // ── change request (per-cell) ────────────────────────────────

  function handleChangeRequest(button) {
    if (!_state || !ns.changeRequests) return;

    var rowId = button.getAttribute('data-row-id');
    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');

    var grid = findSowGrid(sowId);
    if (!grid) return;

    // Find the row
    var row = null;
    for (var i = 0; i < grid.rows.length; i++) {
      if (grid.rows[i].id === rowId) { row = grid.rows[i]; break; }
    }
    if (!row) return;

    var cell = row.cellsByPackage[pkgId];
    if (!cell) {
      // noBid or surveyNoBid row — re-open add modal for editing the pending add-to-bid item
      if ((row.noBid || row.surveyNoBid) && ns.changeRequests && ns.changeRequests.openAddItem) {
        var pendingData = ns.changeRequests.getPending();
        var pendItem = null;
        if (pendingData[pkgId]) {
          var pitems = pendingData[pkgId].items;
          for (var pi2 = 0; pi2 < pitems.length; pi2++) {
            if (pitems[pi2].rowId === rowId) { pendItem = pitems[pi2]; break; }
          }
        }
        var isCR2 = row.proposalBucketId === CAM_READER_BUCKET_ID;
        var hasMapConn2 = /^yes$/i.test(String(row.sowMapConn || '').trim())
                       || /^yes$/i.test(String(row.bidMapConn || '').trim());
        var showConn2 = hasMapConn2 && !isCR2;
        var addConnOpts2 = { bidMdfIdf: buildMdfIdfOptions() };
        if (showConn2 || isCR2) {
          var ac2 = buildAddConnOptions(grid, rowId);
          addConnOpts2.bidConnDevice = ac2.bidConnDevice;
          addConnOpts2.bidConnTo     = ac2.bidConnTo;
        }
        ns.changeRequests.openAddItem({
          rowId:        rowId,
          pkgId:        pkgId,
          pkgName:      findPackageName(grid, pkgId),
          surveyId:     findPackageSurveyId(grid, pkgId),
          sowId:        sowId,
          sowName:      grid.sowName,
          sowItemId:    row.sowItem || '',
          displayLabel: row.displayLabel,
          productName:  row.productName,
          sowProduct:       row.sowProduct,
          sowQty:           row.sowQty,
          sowFee:           row.sowFee,
          sowLaborDesc:     row.sowLaborDesc,
          sowExistCabling:  row.sowExistCabling,
          sowPlenum:        row.sowPlenum,
          sowExterior:      row.sowExterior,
          sowDropLength:    row.sowDropLength,
          sowConduit:       row.sowConduit,
          sowMdfIdf:        row.mdfIdf || '',
          sowMdfIdfIds:     row.mdfIdfIds || [],
          proposalBucket:   row.proposalBucket || '',
          proposalBucketId: row.proposalBucketId || '',
          sortOrder:        row.sortOrder || 0,
          sowMapConn:       row.sowMapConn || '',
          connOptions:      addConnOpts2,
          gridRows:         grid.rows,
          visibility:       { qty: row.sowQty > 1, cabling: isCR2, connDevice: showConn2 },
          existing:         pendItem,
        });
      }
      return;
    }

    // Build per-field connection dropdown options from the grid rows.
    // field_2380 (Connected Devices): cameras/readers not yet wired
    // field_2381 (Connected To): networking / headend items
    var claimed = buildClaimedDeviceSet(grid, cell.id);
    var connDevOpts = [], connToOpts = [];
    var seenDev = {}, seenTo = {};

    // Always include currently-connected records so they show pre-selected
    var curDevIds = cell.bidConnDeviceIds || [];
    var curToIds  = cell.bidConnToIds || [];
    var curDevSet = {}, curToSet = {};
    for (var di = 0; di < curDevIds.length; di++) curDevSet[curDevIds[di]] = true;
    for (var ti = 0; ti < curToIds.length; ti++)  curToSet[curToIds[ti]] = true;

    for (var ci = 0; ci < grid.rows.length; ci++) {
      var cr = grid.rows[ci];
      var cpkgs = Object.keys(cr.cellsByPackage);

      // noBid / surveyNoBid rows: no bid cells, but include as connection options
      if ((cr.noBid || cr.surveyNoBid) && cpkgs.length === 0) {
        var nbLbl = cr.displayLabel || cr.sowProduct || cr.productName || cr.id;
        if (cr.sowProduct && cr.displayLabel && cr.displayLabel !== cr.sowProduct
            && nbLbl.indexOf(cr.sowProduct) === -1) {
          nbLbl = cr.displayLabel + ' \u2014 ' + cr.sowProduct;
        }
        var nbIsCamReader = cr.proposalBucketId === CAM_READER_BUCKET_ID;
        // Connected Devices: camera/reader noBid items — skip if claimed elsewhere
        if (nbIsCamReader) {
          console.log('[ClaimedDevices] noBid cam/reader:', cr.id, nbLbl, 'claimed?', !!claimed[cr.id]);
        }
        if (nbIsCamReader && !seenDev[cr.id] && !claimed[cr.id]) {
          seenDev[cr.id] = true;
          connDevOpts.push({ id: cr.id, identifier: nbLbl, noBid: true, rowId: cr.id });
        }
        // Connected To: noBid items with mapConnections flag (field_2231)
        var nbMapConn = /^yes$/i.test(String(cr.sowMapConn || '').trim());
        if (nbMapConn && !seenTo[cr.id]) {
          seenTo[cr.id] = true;
          connToOpts.push({ id: cr.id, identifier: nbLbl, noBid: true, rowId: cr.id });
        }
        continue;
      }

      for (var cp = 0; cp < cpkgs.length; cp++) {
        var cc = cr.cellsByPackage[cpkgs[cp]];
        if (!cc.id || cc.id === cell.id) continue; // skip self

        var lbl = cr.displayLabel || cr.productName || cc.productName || cc.id;
        if (cr.productName && cr.displayLabel && cr.displayLabel !== cr.productName
            && lbl.indexOf(cr.productName) === -1) {
          lbl = cr.displayLabel + ' \u2014 ' + cr.productName;
        }

        var isCamReader = cr.proposalBucketId === CAM_READER_BUCKET_ID;
        var connToBlank = !cc.bidConnTo || String(cc.bidConnTo).trim() === '';

        // Connected Devices: Camera/Reader with no existing "Connected To",
        // not claimed by another record, or currently selected on this record
        if (!seenDev[cc.id] && ((isCamReader && connToBlank && !claimed[cc.id]) || curDevSet[cc.id])) {
          seenDev[cc.id] = true;
          connDevOpts.push({ id: cc.id, identifier: lbl });
        }

        // Connected To: items where field_2374 (mapConnections) is Yes, or currently selected
        if (!seenTo[cc.id] && (cc.mapConnections || curToSet[cc.id])) {
          seenTo[cc.id] = true;
          connToOpts.push({ id: cc.id, identifier: lbl });
        }
      }
    }

    if (CFG.debug) {
      console.log('[BidReview] connDevOpts:', connDevOpts.length,
                  'connToOpts:', connToOpts.length);
    }

    ns.changeRequests.open({
      rowId:        rowId,
      pkgId:        pkgId,
      pkgName:      findPackageName(grid, pkgId),
      surveyId:     findPackageSurveyId(grid, pkgId),
      sowId:        sowId,
      sowName:      grid.sowName,
      sowItemId:    row.sowItem || '',
      displayLabel: row.displayLabel,
      productName:  row.productName,
      cell:         cell,
      connOptions:  { bidConnDevice: connDevOpts, bidConnTo: connToOpts, bidMdfIdf: buildMdfIdfOptions() },
      gridRows:     grid.rows,
      visibility: {
        qty:        button.getAttribute('data-vis-qty') === '1',
        cabling:    button.getAttribute('data-vis-cabling') === '1',
        connDevice: button.getAttribute('data-vis-conn') === '1',
      },
    });
  }

  // ── remove from bid (per-cell) ────────────────────────────────

  function handleRemoveFromBid(button) {
    if (!_state || !ns.changeRequests) return;

    var rowId = button.getAttribute('data-row-id');
    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');

    var grid = findSowGrid(sowId);
    if (!grid) return;

    var row = null;
    for (var i = 0; i < grid.rows.length; i++) {
      if (grid.rows[i].id === rowId) { row = grid.rows[i]; break; }
    }
    if (!row) return;

    var cell = row.cellsByPackage[pkgId];
    if (!cell) return;

    ns.changeRequests.openRemove({
      rowId:        rowId,
      pkgId:        pkgId,
      pkgName:      findPackageName(grid, pkgId),
      surveyId:     findPackageSurveyId(grid, pkgId),
      sowId:        sowId,
      sowName:      grid.sowName,
      sowItemId:    row.sowItem || '',
      displayLabel: row.displayLabel,
      productName:  row.productName,
      cell:         cell,
    });
  }

  // ── add to bid (per-cell, for No Bid rows) ─────────────────

  function handleAddToBid(button) {
    if (!_state || !ns.changeRequests) return;

    var rowId = button.getAttribute('data-row-id');
    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');

    var grid = findSowGrid(sowId);
    if (!grid) return;

    var row = null;
    for (var i = 0; i < grid.rows.length; i++) {
      if (grid.rows[i].id === rowId) { row = grid.rows[i]; break; }
    }
    if (!row) return;

    // Derive visibility from proposal bucket (same logic as render.js)
    var isCamReader = row.proposalBucketId === CAM_READER_BUCKET_ID;
    var hasMapConn = /^yes$/i.test(String(row.sowMapConn || '').trim())
                   || /^yes$/i.test(String(row.bidMapConn || '').trim());
    var showConn = hasMapConn && !isCamReader;
    var vis = {
      qty:        row.sowQty > 1,
      cabling:    isCamReader,
      connDevice: showConn,
    };

    // Build connection options when Connected Devices or Connected To is visible
    var connOpts = { bidMdfIdf: buildMdfIdfOptions() };
    if (showConn || isCamReader) {
      var addConn = buildAddConnOptions(grid);
      connOpts.bidConnDevice = addConn.bidConnDevice;
      connOpts.bidConnTo     = addConn.bidConnTo;
    }

    if (ns.changeRequests.openAddItem) {
      ns.changeRequests.openAddItem({
        rowId:        rowId,
        pkgId:        pkgId,
        pkgName:      findPackageName(grid, pkgId),
        surveyId:     findPackageSurveyId(grid, pkgId),
        sowId:        sowId,
        sowName:      grid.sowName,
        sowItemId:    row.sowItem || '',
        displayLabel: row.displayLabel,
        productName:  row.productName,
        // SOW data for pre-fill
        sowProduct:       row.sowProduct,
        sowQty:           row.sowQty,
        sowFee:           row.sowFee,
        sowLaborDesc:     row.sowLaborDesc,
        sowExistCabling:  row.sowExistCabling,
        sowPlenum:        row.sowPlenum,
        sowExterior:      row.sowExterior,
        sowDropLength:    row.sowDropLength,
        sowConduit:       row.sowConduit,
        sowMdfIdf:        row.mdfIdf || '',
        sowMdfIdfIds:     row.mdfIdfIds || [],
        proposalBucket:   row.proposalBucket || '',
        proposalBucketId: row.proposalBucketId || '',
        sortOrder:        row.sortOrder || 0,
        sowMapConn:       row.sowMapConn || '',
        connOptions:      connOpts,
        gridRows:         grid.rows,
        visibility:       vis,
      });
    } else {
      ns.renderToast('Add to Bid not yet implemented', 'info');
    }
  }

  // ── row-level action ────────────────────────────────────────

  function handleRowAction(button, actionType) {
    var rowId = button.getAttribute('data-row-id');
    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');

    setBusy(button, true);

    var payload = {
      actionType:  actionType,
      reviewRowId: rowId,
    };

    if (pkgId) payload.packageId = pkgId;
    if (sowId) payload.sowId     = sowId;

    ns.submitAction(payload).done(function () {
      refreshSilently();
    }).always(function () {
      setBusy(button, false);
    });
  }

  // ── busy state helper ───────────────────────────────────────

  function setBusy(button, busy) {
    if (busy) {
      button.classList.add('scw-bid-review__btn--busy');
      button.setAttribute('data-original-text', button.textContent);
      button.textContent = 'Sending\u2026';
    } else {
      button.classList.remove('scw-bid-review__btn--busy');
      var orig = button.getAttribute('data-original-text');
      if (orig) button.textContent = orig;
    }
  }

  // ── public: refresh ─────────────────────────────────────────

  ns.refresh = function refresh() {
    runPipeline();
  };

  /** Lightweight re-render from existing state (no data refetch). */
  ns.rerender = function rerender() {
    if (!_state) return;
    var mount = ns.renderMatrix(_state);
    attachClickHandler(mount);
    if (ns.changeRequests && ns.changeRequests.rehydrate) {
      ns.changeRequests.rehydrate(_state.sowGrids);
    }
  };

  // ── force views to load 1000 records per page ───────────────

  /**
   * Set a view's "per page" dropdown to 1000 so Knack natively loads
   * all records into its model cache. Returns true if the view already
   * had 1000 selected (ready to proceed); false if we just changed it
   * (Knack will re-render the view with full data).
   */
  function ensureFullPage(viewKey) {
    var $select = $('#' + viewKey + ' select[name="limit"]');
    if ($select.length && $select.val() !== '1000') {
      $select.val('1000').trigger('change');
      return false; // Knack will re-render — not ready yet
    }
    return true; // already at 1000 (or no dropdown found)
  }

  // ── multi-view readiness tracking ────────────────────────────
  //
  // The matrix depends on three Knack views:
  //   view_3680  — bid records (primary)
  //   view_3728  — unbid SOW items (noBid rows)
  //   view_3573  — bid packages (PDF links)
  //
  // On first page load the secondary views may not have rendered
  // when the primary fires.  We track all three and only run the
  // pipeline once all are ready — or after a fallback timeout so
  // the grid still appears (the API adapter retries for missing data).

  var _viewsReady      = {};
  var _pipelineQueued  = false;
  var _fallbackTimer   = null;

  function allViewsReady() {
    if (!_viewsReady[CFG.viewKey]) return false;
    if (!_viewsReady[CFG.sowItemsViewKey]) return false;
    if (CFG.bidPackagesViewKey && !_viewsReady[CFG.bidPackagesViewKey]) return false;
    return true;
  }

  function schedulePipeline() {
    if (_pipelineQueued) return;
    _pipelineQueued = true;
    if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
    setTimeout(function () {
      _pipelineQueued = false;
      runPipeline();
    }, CFG.renderDelay);
  }

  function checkViewsAndRun() {
    if (!_viewsReady[CFG.viewKey]) return;   // primary must be ready
    if (allViewsReady()) {
      schedulePipeline();
    }
  }

  // ── init on view render ─────────────────────────────────────

  function init() {
    ns.injectStyles();

    // Primary view — bid records
    SCW.onViewRender(CFG.viewKey, function () {
      var ready = ensureFullPage(CFG.viewKey);
      if (!ready) return;    // Knack will re-render with full data

      // Kick SOW items pagination if already visible (belt-and-suspenders)
      ensureFullPage(CFG.sowItemsViewKey);

      _viewsReady[CFG.viewKey] = true;
      checkViewsAndRun();

      // Fallback: if secondary views haven't rendered within 3 s,
      // run anyway — loadRawData will use the API adapter for missing data.
      if (!_fallbackTimer && !allViewsReady()) {
        _fallbackTimer = setTimeout(function () {
          _fallbackTimer = null;
          if (!allViewsReady()) {
            if (CFG.debug) {
              console.log('[BidReview] Timeout waiting for:',
                !_viewsReady[CFG.sowItemsViewKey] ? CFG.sowItemsViewKey : '',
                CFG.bidPackagesViewKey && !_viewsReady[CFG.bidPackagesViewKey] ? CFG.bidPackagesViewKey : '');
            }
            schedulePipeline();
          }
        }, 3000);
      }
    }, CFG.eventNs);

    // SOW items view — unbid rows (noBid)
    SCW.onViewRender(CFG.sowItemsViewKey, function () {
      var ready = ensureFullPage(CFG.sowItemsViewKey);
      if (!ready) return;
      _viewsReady[CFG.sowItemsViewKey] = true;
      checkViewsAndRun();
    }, CFG.eventNs + 'Sow');

    // Bid packages view — PDF links
    if (CFG.bidPackagesViewKey) {
      SCW.onViewRender(CFG.bidPackagesViewKey, function () {
        _viewsReady[CFG.bidPackagesViewKey] = true;
        checkViewsAndRun();
      }, CFG.eventNs + 'Pkg');
    }

    // Change request view — pending CR counts + links (DOM-scraped)
    if (CFG.changeRequestViewKey) {
      SCW.onViewRender(CFG.changeRequestViewKey, function () {
        // Re-render the matrix to pick up updated CR data from view_3818
        if (_state) refreshSilently();
      }, CFG.eventNs + 'Cr');
    }
  }

  init();

})();
