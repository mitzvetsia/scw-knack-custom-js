/*** BID REVIEW — INITIALIZATION ***/
/**
 * Orchestrates the Bid Review Matrix feature:
 *   1. Binds to Knack scene render
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
      _state = ns.buildState(raw.records);

      if (CFG.debug) {
        console.log('[BidReview] State built:',
          _state.packages.length, 'packages,',
          _state.flatRows.length, 'rows');
      }

      var mount = ns.renderMatrix(_state);
      attachClickHandler(mount);
    }).fail(function (err) {
      console.error('[BidReview] Pipeline failed:', err);
      ns.renderToast('Failed to load comparison data', 'error');
    });
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

      // Prevent double-click
      if (button.classList.contains('scw-bid-review__btn--busy')) return;

      if (action.indexOf('package_') === 0) {
        handlePackageAction(button, action);
      } else if (action.indexOf('row_') === 0) {
        handleRowAction(button, action);
      }
    });
  }

  // ── package-level action ────────────────────────────────────

  function handlePackageAction(button, actionType) {
    if (!_state) return;

    var pkgId  = button.getAttribute('data-package-id');
    var rowIds = ns.collectEligible(pkgId, actionType, _state);

    if (!rowIds.length) {
      ns.renderToast('No eligible rows for this action', 'info');
      return;
    }

    // Find package name for confirmation
    var pkgName = pkgId;
    for (var i = 0; i < _state.packages.length; i++) {
      if (_state.packages[i].id === pkgId) {
        pkgName = _state.packages[i].name;
        break;
      }
    }

    var verb = actionType === 'package_adopt_all'      ? 'Adopt'
             : actionType === 'package_create_missing'  ? 'Create'
             : 'Adopt + Create';

    var confirmed = window.confirm(
      verb + ' ' + rowIds.length + ' row(s) from ' + pkgName + '?'
    );
    if (!confirmed) return;

    setBusy(button, true);

    ns.submitAction({
      actionType: actionType,
      packageId:  pkgId,
      rowIds:     rowIds,
    }).always(function () {
      setBusy(button, false);
    });
  }

  // ── row-level action ────────────────────────────────────────

  function handleRowAction(button, actionType) {
    var rowId = button.getAttribute('data-row-id');
    var pkgId = button.getAttribute('data-package-id');

    setBusy(button, true);

    var payload = {
      actionType:  actionType,
      reviewRowId: rowId,
    };

    if (pkgId) payload.packageId = pkgId;

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

  // ── init on scene render ────────────────────────────────────

  function init() {
    ns.injectStyles();

    SCW.onSceneRender(CFG.sceneKey, function () {
      setTimeout(function () {
        runPipeline();
      }, CFG.renderDelay);
    }, CFG.eventNs);
  }

  init();

})();
