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

  // ── Combined refresh (called after any mutation) ──────

  function refresh() {
    ns.renderUI();
    ns.injectRevisions();
  }

  ns.refresh = refresh;

  // ── Worksheet view render ─────────────────────────────

  SCW.onViewRender(CFG.worksheetView, function () {
    S.setOnPage(true);
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

  // ── Scene change → reset page flag, hide action bar ───

  $(document)
    .off('knack-scene-render.any' + CFG.eventNs)
    .on('knack-scene-render.any' + CFG.eventNs, function () {
      S.setOnPage(false);
      S.setBaseline({});
      ns.renderActionBar();
    });

  // ── Expose remaining public API ───────────────────────

  ns.getPending   = function () { return S.pending(); };
  ns.getBaseline  = function () { return S.baseline(); };

  if (CFG.debug) console.log('[SalesCR] Module initialized');

})();
