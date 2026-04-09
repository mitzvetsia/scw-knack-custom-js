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
      _state = ns.buildState(raw.records, raw.sowItems || []);

      if (CFG.debug) {
        console.log('[BidReview] State built:',
          _state.sowGrids.length, 'SOW grids,',
          _state.allPackages.length, 'packages');
      }

      var mount = ns.renderMatrix(_state);
      attachClickHandler(mount);
    }).fail(function (err) {
      console.error('[BidReview] Pipeline failed:', err);
      ns.renderToast('Failed to load comparison data', 'error');
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

      if (action.indexOf('package_') === 0) {
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
    }).always(function () {
      setBusy(button, false);
    });
  }

  // ── Copy to SOW handler ────────────────────────────────────

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

    setBusy(button, true);

    ns.submitAction(payload).always(function () {
      setBusy(button, false);
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

    ns.submitAction(payload).always(function () {
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
