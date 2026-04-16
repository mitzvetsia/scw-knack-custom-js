/*** SALES CHANGE REQUEST — INIT ***/
/**
 * Event bindings: wires view-render, cell-update, and scene-change
 * events to the sales change request pipeline.
 *
 * Reads : SCW.salesCR.* (all sibling modules)
 * Writes: SCW.salesCR.refresh (combined refresh entry point)
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;

  // Track which scene we're on so we only reset when truly navigating away
  var _activeScene = '';

  // ── Combined refresh (called after any mutation) ──────

  function refresh() {
    ns.renderUI();
    ns.injectRevisions();
  }

  ns.refresh = refresh;

  // ── Worksheet view render ─────────────────────────────
  // Fires on initial load AND on re-renders triggered by
  // refresh-on-inline-edit.js (model.fetch after cell updates).
  // We re-inject UI every time since re-render wipes the DOM.

  SCW.onViewRender(CFG.worksheetView, function () {
    S.setOnPage(true);
    _activeScene = Knack.router.current_scene_key || '';
    ns.injectStyles();
    ns.buildBaseline();

    // Inject UI after device-worksheet transform (uses 150ms)
    setTimeout(function () {
      ns.checkAddMode();
      ns.detectAddRecords();
      refresh();
    }, CFG.uiDelay);
  }, CFG.eventNs);

  // ── Cell update → auto-create CR ──────────────────────
  // Fires BEFORE the view re-renders. We capture the change here;
  // the subsequent view-render will re-inject the UI with the
  // updated pending state.

  $(document)
    .off('knack-cell-update.' + CFG.worksheetView + CFG.eventNs)
    .on('knack-cell-update.' + CFG.worksheetView + CFG.eventNs, ns.onCellUpdate);

  // ── Proposal view render → check add mode ─────────────

  SCW.onViewRender(CFG.proposalView, function () {
    setTimeout(function () {
      ns.checkAddMode();
      if (S.isAddMode() && Object.keys(S.baseline()).length) {
        ns.detectAddRecords();
        refresh();
      }
    }, 300);
  }, CFG.eventNs);

  // ── Revision view render → load + inject ──────────────

  SCW.onViewRender(CFG.revisionView, function () {
    setTimeout(function () {
      ns.loadRevisions();
      ns.injectRevisions();
    }, 300);
  }, CFG.eventNs);

  // ── Scene change → only reset when navigating AWAY ────
  // refresh-on-inline-edit.js triggers model.fetch() on sibling
  // views after any cell update, which can fire scene-render on
  // the SAME scene. We must not wipe state when that happens.

  $(document)
    .off('knack-scene-render.any' + CFG.eventNs)
    .on('knack-scene-render.any' + CFG.eventNs, function () {
      var newScene = Knack.router.current_scene_key || '';
      if (_activeScene && newScene === _activeScene) return;

      // Truly navigated away
      S.setOnPage(false);
      S.setBaseline({});
      _activeScene = '';
      ns.renderActionBar();
    });

  // ── Expose remaining public API ───────────────────────

  ns.getPending   = function () { return S.pending(); };
  ns.getBaseline  = function () { return S.baseline(); };

  if (CFG.debug) console.log('[SalesCR] Module initialized');

})();
