/*** BID REVIEW V2 — RENDER ***************************************************
 *
 * Phase 1: real grid. For each SOW, render a section with a table —
 * line items × bid packages, with our own number inputs and textarea
 * for labor description. Custom edits ONLY — no Knack inline-edit.
 *
 * Mid-edit guard mirrors worksheet-v2/render.js: if the user is focused
 * on a v2 input when a re-notify fires, defer the rebuild until focus
 * leaves the panel.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns) return;

  var _pendingSnapshot = null;

  function hasFocusInPanel(container) {
    var a = document.activeElement;
    if (!a || !container || !a.hasAttribute) return false;
    // Defer the rebuild while the user is mid-edit in EITHER a comparison-grid
    // input (data-scw-br-v2-field) OR an embedded worksheet-v2 card input
    // (data-scw-ws-v2-field) inside an expanded row's SOW editor. Without the
    // ws-v2 check, editing a SOW field + tabbing fired a refetch that rebuilt
    // the grid and tore down the panel mid-edit, dropping the in-progress edit.
    if (!a.hasAttribute('data-scw-br-v2-field') &&
        !a.hasAttribute('data-scw-ws-v2-field')) return false;
    return container.contains(a);
  }

  function renderSnapshot(snapshot) {
    if (!ns.CONFIG) return;
    var container = document.getElementById(ns.CONFIG.mountId);
    if (!container) return;
    var body  = container.querySelector('.scw-bid-review-v2-body');
    var count = container.querySelector('.scw-bid-review-v2-count');
    if (!body) return;

    if (hasFocusInPanel(container)) {
      _pendingSnapshot = snapshot;
      return;
    }
    _pendingSnapshot = null;

    var sourceKeys = ns.CONFIG.sourceViewKeys || [];
    var bidRecords = (snapshot && sourceKeys[0] && snapshot[sourceKeys[0]]) || [];
    // SOW items live on the second source view (view_3921). They feed
    // the SOW column on the left side of the comparison grid.
    var sowItems = (snapshot && sourceKeys[1] && snapshot[sourceKeys[1]]) || [];
    // Bid package records (view_3573) carry status / friendly name / PDF.
    var bidPackages = (snapshot && sourceKeys[2] && snapshot[sourceKeys[2]]) || [];
    if (!ns.transform || typeof ns.transform.buildState !== 'function') {
      body.innerHTML = '<div class="scw-bid-review-v2-empty">transform.js not loaded.</div>';
      return;
    }
    // Loud console warning if any source view is page-capped — the diff
    // silently produces phantom Removed/Not-surveyed rows on partial data.
    if (ns.data && typeof ns.data.warnIfTruncated === 'function') ns.data.warnIfTruncated();
    var state = ns.transform.buildState(bidRecords, sowItems, bidPackages);

    // Analyze SOW-item issues once per render (missing photos, disconnected
    // cam/reader, wrong accessory). Computed from the SOW items only — bid
    // records are never analyzed. card.js reads chips per SOW item id.
    if (ns.warnings && typeof ns.warnings.analyze === 'function') {
      try { ns.warnings.analyze(sowItems); }
      catch (e) { /* fail soft — chips just won't render */ }
    }

    if (count) {
      count.textContent = state.sowGrids.length + ' SOW' +
        (state.sowGrids.length === 1 ? '' : 's') + ' / ' +
        bidRecords.length + ' bid record' + (bidRecords.length === 1 ? '' : 's');
    }

    if (state.isEmpty) {
      body.innerHTML = '<div class="scw-bid-review-v2-empty">' +
        'No bid records loaded yet.</div>';
      return;
    }

    // Drop v1's cached DOC_files scrape so the docs block v1 injects into
    // each SOW header (via buildSowStatusBar) re-reads view_3926's fresh DOM.
    // Needed because a link/unlink PUT refetches view_3926 → fires a render
    // v2 now subscribes to, but the scrape is cached per v1 renderMatrix pass
    // and v2 never calls renderMatrix.
    var v1ns = window.SCW && window.SCW.bidReview;
    if (v1ns && typeof v1ns.resetDocsIndex === 'function') v1ns.resetDocsIndex();

    var frag = document.createDocumentFragment();
    for (var i = 0; i < state.sowGrids.length; i++) {
      try {
        frag.appendChild(ns.card.buildSowSection(state.sowGrids[i]));
      } catch (e) {
        console.warn('[scw-br-v2] buildSowSection threw', state.sowGrids[i] && state.sowGrids[i].sowId, e);
      }
    }
    body.innerHTML = '';
    body.appendChild(frag);

    // Re-apply persisted MDF/IDF group + subgroup collapse state — the
    // rebuild just reset every group to its default, which re-opened
    // anything the user had closed (init.js applyGroupCollapse).
    if (typeof ns.applyGroupCollapse === 'function') {
      try { ns.applyGroupCollapse(body); } catch (e) { /* fail soft */ }
    }

    // Re-open any row panels the user had expanded — the rebuild reset every
    // row to collapsed, which otherwise closed the line item after an inline
    // edit or accessory delete refetch.
    if (typeof ns.reopenExpandedRows === 'function') {
      try { ns.reopenExpandedRows(body); } catch (e) { /* fail soft */ }
    }

    // Ensure the toolbar is present (idempotent — survives body rebuilds).
    if (ns.toolbar && typeof ns.toolbar.mount === 'function') ns.toolbar.mount();
  }

  // Resume deferred render when focus leaves the panel.
  document.addEventListener('focusout', function () {
    setTimeout(function () {
      if (!_pendingSnapshot) return;
      var container = document.getElementById(ns.CONFIG && ns.CONFIG.mountId);
      if (!container || hasFocusInPanel(container)) return;
      var snap = _pendingSnapshot;
      _pendingSnapshot = null;
      renderSnapshot(snap);
    }, 0);
  }, true);

  ns.render = { renderSnapshot: renderSnapshot };
})();
/*** END BID REVIEW V2 — RENDER ***********************************************/
