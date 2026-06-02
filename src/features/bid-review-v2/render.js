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
    if (!a || !container) return false;
    if (!a.hasAttribute || !a.hasAttribute('data-scw-br-v2-field')) return false;
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

    var bidViewKey = (ns.CONFIG.sourceViewKeys || [])[0];
    var bidRecords = (snapshot && bidViewKey && snapshot[bidViewKey]) || [];
    if (!ns.transform || typeof ns.transform.buildState !== 'function') {
      body.innerHTML = '<div class="scw-bid-review-v2-empty">transform.js not loaded.</div>';
      return;
    }
    var state = ns.transform.buildState(bidRecords);

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
