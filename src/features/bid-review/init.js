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

  // Current state — kept in closure for the click handler
  var _state = null;

  // ── load → transform → render pipeline ──────────────────────

  function runPipeline() {
    ns.showLoading();

    ns.loadRawData().then(function (raw) {
      _state = ns.buildState(raw.records, raw.sowItems || [], raw.bidPackages || []);

      if (CFG.debug) {
        console.log('[BidReview] State built:',
          _state.sowGrids.length, 'SOW grids,',
          _state.allPackages.length, 'packages');
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

    mount.addEventListener('click', function (e) {
      var button = e.target.closest('.scw-bid-review__btn');
      if (!button) return;

      var action = button.getAttribute('data-action');
      if (!action) return;

      if (button.classList.contains('scw-bid-review__btn--busy')) return;

      if (action === 'cell_request_change') {
        handleChangeRequest(button);
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
  var COPY_POLL_MS   = 5000;     // poll every 5s
  var COPY_TIMEOUT_MS = 120000;  // stop after 2 minutes
  var _copyPollTimer = null;

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
        // Webhook responded — schedule final refreshes then stop
        if (CFG.debug) console.log('[BidReview] Copy to SOW webhook completed');
        stopCopyPoll();
        // Two final refreshes to catch any stragglers
        setTimeout(function () { refreshSilently(); }, 2000);
        setTimeout(function () {
          refreshSilently();
          hideCopyToast();
          ns.renderToast('SOW updated successfully', 'success');
        }, 5000);
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
    if (!cell) return;

    ns.changeRequests.open({
      rowId:        rowId,
      pkgId:        pkgId,
      pkgName:      findPackageName(grid, pkgId),
      sowId:        sowId,
      sowName:      grid.sowName,
      displayLabel: row.displayLabel,
      productName:  row.productName,
      cell:         cell,
    });
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

  // ── init on view render ─────────────────────────────────────

  function init() {
    ns.injectStyles();

    SCW.onViewRender(CFG.viewKey, function () {
      // Force both data views to 1000 per page.
      // If either needed changing, Knack re-renders the view and
      // this handler will fire again with full data in the cache.
      var bidReady = ensureFullPage(CFG.viewKey);
      ensureFullPage(CFG.sowItemsViewKey);

      if (!bidReady) return; // wait for re-render with full data

      setTimeout(function () {
        runPipeline();
      }, CFG.renderDelay);
    }, CFG.eventNs);
  }

  init();

})();
