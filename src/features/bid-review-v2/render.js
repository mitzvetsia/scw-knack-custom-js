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

  // ── Section reconciliation (keyed reuse) ───────────────────────────────
  // The dominant cost of a re-render is rebuilding EVERY SOW section's DOM
  // (each = a full line-items × bid-packages table). But a single-field edit
  // only changes ONE SOW's data, so we keep the existing DOM node for any
  // section whose inputs are byte-identical and rebuild only the ones that
  // actually changed — mirrors worksheet-v2/render.js's keyed-card factory.
  //
  // Signature = hash(the section's sowGrid) + a global aux hash of the source
  // arrays buildSowSection reads OUTSIDE its grid arg (change requests +
  // DOC_files, surfaced through v1's buildSowStatusBar / changeRequests). A
  // field edit busts only the edited SOW's grid → only that section rebuilds;
  // a CR/docs change busts the aux hash → every section rebuilds (rare, but
  // keeps those surfaces correct).
  function hashStr(s) {
    var h = 5381, i = s.length;
    while (i) { h = (h * 33) ^ s.charCodeAt(--i); }
    return (h >>> 0).toString(36);
  }
  function sigOf(obj) {
    try { var s = JSON.stringify(obj); return s.length.toString(36) + '.' + hashStr(s); }
    catch (e) { return 'x' + Math.random().toString(36).slice(2); }   // unparseable → always rebuild
  }
  function indexExistingSections(body) {
    var map = Object.create(null);
    var nodes = body.querySelectorAll('.scw-bid-review-v2__sow[data-sow-id]');
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute('data-sow-id');
      if (id) map[id] = nodes[i];
    }
    return map;
  }

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
    // warnIfTruncated also KICKS OFF the self-repair refetches. While one
    // is in flight the grid still renders (records stream in as they
    // load), but the container gets --partial, whose CSS hides every
    // AGGREGATE built from incomplete data — the sub-bid diff strip
    // (labor Δ / not-bid counts) and the SOW-header warning chips — since
    // those read as alarming nonsense mid-load ("137 not bid, +$260k").
    // The count line becomes an explicit loading notice. The repair's
    // fetch completion fires knack-view-render → notifyDebounced, so a
    // full-data render always follows and clears the flag; if retries
    // exhaust (a genuinely >1000-record view), pending goes false and
    // the best available data renders rather than deadlocking.
    if (ns.data && typeof ns.data.warnIfTruncated === 'function') ns.data.warnIfTruncated();
    var partial = !!(ns.data && typeof ns.data.truncationRepairPending === 'function' &&
                     ns.data.truncationRepairPending());
    container.classList.toggle('scw-bid-review-v2--partial', partial);
    var state = ns.transform.buildState(bidRecords, sowItems, bidPackages);

    // Publish the freshly-built comparison state so co-located consumers
    // (sub-bid-diff, which injects a per-SOW diff into these same sections)
    // can REUSE it instead of running the ~800-line transform a second time.
    // Set before the early-returns below so a consumer always sees the latest
    // build. renderSnapshot runs synchronously on the data notify, and
    // sub-bid-diff renders rAF-deferred off the same notify, so by the time it
    // reads this the value reflects the current data.
    ns.builtState = state;
    ns.builtStateGen = (ns.builtStateGen || 0) + 1;

    // Analyze SOW-item issues once per render (missing photos, disconnected
    // cam/reader, wrong accessory). Computed from the SOW items only — bid
    // records are never analyzed. card.js reads chips per SOW item id.
    if (ns.warnings && typeof ns.warnings.analyze === 'function') {
      try { ns.warnings.analyze(sowItems); }
      catch (e) { /* fail soft — chips just won't render */ }
    }

    if (count) {
      count.textContent = partial
        ? ('Loading full bid data… ' + bidRecords.length +
           ' record' + (bidRecords.length === 1 ? '' : 's') +
           ' so far — totals hidden until complete')
        : (state.sowGrids.length + ' SOW' +
           (state.sowGrids.length === 1 ? '' : 's') + ' / ' +
           bidRecords.length + ' bid record' + (bidRecords.length === 1 ? '' : 's'));
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

    // Global aux signature — the bits buildSowSection renders that DON'T live
    // in its grid arg (change requests + DOC_files). When these change every
    // section is rebuilt; for a plain field edit they're stable, so only the
    // edited SOW's section rebuilds.
    var globalAuxSig;
    try {
      var crRecs  = (sourceKeys[4] && snapshot[sourceKeys[4]]) || [];
      var docRecs = (sourceKeys[5] && snapshot[sourceKeys[5]]) || [];
      // Pending (not-yet-submitted) change requests live ONLY in v1's
      // client-side state (changeRequests.getPending), never in a Knack view —
      // so a freshly added/edited/removed CR leaves crRecs unchanged and the
      // keyed-section reuse below would skip the rebuild, leaving the pending
      // CR card invisible until a full page refresh. Fold the pending state
      // into the signature so the affected sections actually repaint.
      var pendingSig = '';
      var v1cr = v1ns && v1ns.changeRequests;
      if (v1cr && typeof v1cr.getPending === 'function') {
        pendingSig = JSON.stringify(v1cr.getPending() || {});
      }
      globalAuxSig = hashStr(JSON.stringify(crRecs) + '|' + JSON.stringify(docRecs) +
        '|' + pendingSig);
    } catch (e) { globalAuxSig = 'aux'; }

    var existing = indexExistingSections(body);
    var frag = document.createDocumentFragment();
    var reused = 0;
    for (var i = 0; i < state.sowGrids.length; i++) {
      var grid = state.sowGrids[i];
      try {
        var sig = sigOf(grid) + '|' + globalAuxSig;
        var sid = grid && grid.sowId;
        var ex  = sid && existing[sid];
        if (ex && ex.getAttribute('data-scw-sig') === sig) {
          // Unchanged section — reuse its DOM node verbatim (keeps expanded
          // rows, group-collapse state, focus-safe). Moving it into frag
          // detaches it from body before the innerHTML wipe below.
          delete existing[sid];
          frag.appendChild(ex);
          reused++;
        } else {
          var node = ns.card.buildSowSection(grid);
          if (node && node.setAttribute) node.setAttribute('data-scw-sig', sig);
          frag.appendChild(node);
        }
      } catch (e) {
        console.warn('[scw-br-v2] buildSowSection threw', grid && grid.sowId, e);
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
    // Re-sync the "Expand/Collapse line items" label — reopenExpandedRows may
    // have just re-opened panels, so the button must reflect the new state.
    if (ns.toolbar && typeof ns.toolbar.syncLabels === 'function') ns.toolbar.syncLabels();

    // Top-level search bar (idempotent) + re-apply the active query to the
    // freshly-rebuilt rows so a filter survives edits / refetches.
    if (ns.search) {
      if (typeof ns.search.mount === 'function') ns.search.mount();
      if (typeof ns.search.apply === 'function') ns.search.apply();
    }
  }

  // Resume deferred render when focus leaves the panel. Plain rebuild — NOT
  // anchored: SCW.v2ScrollAnchor's scrollBy runs away on this grid (see
  // init.js), scrolling to the bottom. Keyed section reuse keeps it stable.
  // init.js's subscribe callback DOES wrap the cascade-triggered render in
  // the anchor (Connected Devices moving a row between MDF/IDF groups) —
  // but only when that render fires immediately. If it instead gets queued
  // here (user still focused in the panel when the cascade settles) it
  // flushes as a plain rebuild like any other deferred render — a known,
  // accepted gap rather than a bug; the common case is focus has already
  // left the panel (the picker modal closed) by the time the cascade idles.
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
