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
  function nextStepSig(sowId) {
    try {
      var v1 = window.SCW && window.SCW.bidReview;
      if (v1 && typeof v1.nextStepRowSignature === 'function') return v1.nextStepRowSignature(sowId) || '';
    } catch (e) { /* fall through */ }
    return '';
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

  // The tabs' "one SOW at a time" rule (header.js) hides every section
  // without this class. A fresh section gets it at BUILD time when the tabs
  // already know the active SOW, so no layout between the swap and
  // header.afterRender ever sees the grid fully hidden.
  var ACTIVE_CLS = 'scw-bid-review-v2__sow--active';

  // Replace body's children with `nodes`, in order, in ONE pass with no
  // layout read in between — the browser only clamps the scroll at a layout,
  // and none can run inside a synchronous remove-then-append. Returns false
  // (and touches nothing) when body already holds exactly these nodes in
  // this order — a fully reused render leaves the DOM alone.
  function swapChildren(body, nodes) {
    var kids = body.children;
    var same = kids.length === nodes.length;
    for (var i = 0; same && i < nodes.length; i++) if (kids[i] !== nodes[i]) same = false;
    if (same) return false;
    while (body.firstChild) body.removeChild(body.firstChild);
    for (var j = 0; j < nodes.length; j++) body.appendChild(nodes[j]);
    return true;
  }

  function hasFocusInPanel(container) {
    var a = document.activeElement;
    if (!a || !container || !a.hasAttribute) return false;
    // Defer the rebuild while the user is mid-edit in EITHER a comparison-grid
    // input (data-scw-br-v2-field) OR an embedded worksheet-v2 card input
    // (data-scw-ws-v2-field) inside an expanded row's SOW editor. Without the
    // ws-v2 check, editing a SOW field + tabbing fired a refetch that rebuilt
    // the grid and tore down the panel mid-edit, dropping the in-progress edit.
    // …or the sub-bid diff panel's reviewer note (data-scw-sbd-note), which
    // lives inside the SOW section: rebuilding the section while it is
    // focused replaced the textarea with no blur, so the keystrokes after
    // that went nowhere and the note "didn't save" (2026-10-20).
    if (!a.hasAttribute('data-scw-br-v2-field') &&
        !a.hasAttribute('data-scw-ws-v2-field') &&
        !a.hasAttribute('data-scw-sbd-note')) return false;
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
    // header.js reads these for the tabs' counts + the scope summary.
    ns.lastSowItems = sowItems;
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
      if (ns.header && typeof ns.header.afterRender === 'function') {
        try { ns.header.afterRender(body); } catch (eh) { /* fail soft */ }
      }
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

    // ── Scroll-clamp guard (2026-10-21) ────────────────────────────────────
    // Every re-render of a hidden source grid used to send this page to the
    // top: not a scroll call (scroll-spy traced none, with every scroll API
    // and the scrollTop setter patched) but the BROWSER'S CLAMP. The old
    // swap moved reused sections into a fragment one by one (that detaches
    // them from the page) and inserted fresh sections without the tabs'
    // --active class (display:none under .scw-bid-review-v2--tabs until
    // header.afterRender ran at the very end). Any layout flush inside
    // either window — reopenExpandedRows' offsetParent probe, the diary's
    // pageYOffset read — laid the page out ~1260px tall (hero + tabs), and
    // Chrome clamped scrollY to that short page (y=261 on a 1000px viewport,
    // twenty times in one capture); the grid came back, the scroll did not.
    // Three measures, all synchronous with the rebuild:
    //   1. floor the document's height for the rebuild (body min-height =
    //      the pre-rebuild scrollHeight, _v2-scroll-anchor.js), so a short
    //      intermediate layout can never clamp the scroll;
    //   2. build fresh sections WITH the active class when the tabs know it;
    //   3. swap the children in one pass with no layout read in between,
    //      and not at all when the sections are unchanged.
    var floored = 0;
    if (window.SCW && SCW.v2ScrollAnchor && typeof SCW.v2ScrollAnchor.floor === 'function') {
      try { floored = SCW.v2ScrollAnchor.floor() || 0; } catch (eFl) { floored = 0; }
    }
    var activeId = '';
    if (ns.header && typeof ns.header.activeSowId === 'function') {
      try { activeId = ns.header.activeSowId() || ''; } catch (eAct) { activeId = ''; }
    }

    var existing = indexExistingSections(body);
    var nodes = [];
    var reused = 0;
    for (var i = 0; i < state.sowGrids.length; i++) {
      var grid = state.sowGrids[i];
      try {
        var sid = grid && grid.sowId;
        // The SOW header's survey costs / margin / margin-low buttons are read
        // off the next-step grid's row (view_3918), not off `grid` — so that
        // row is part of the signature, or a Survey Costs save (whose refetch
        // re-renders view_3918 → v1 asks us to repaint) reused the stale header
        // and the margin only caught up on a page refresh (2026-10-16).
        var sig = sigOf(grid) + '|' + globalAuxSig + '|' + nextStepSig(sid);
        var ex  = sid && existing[sid];
        if (ex && ex.getAttribute('data-scw-sig') === sig) {
          // Unchanged section — reuse its DOM node verbatim (keeps expanded
          // rows, group-collapse state, focus-safe). It stays ATTACHED until
          // the swap below.
          delete existing[sid];
          nodes.push(ex);
          reused++;
        } else {
          var node = ns.card.buildSowSection(grid);
          if (node && node.setAttribute) {
            node.setAttribute('data-scw-sig', sig);
            if (activeId && sid === activeId && node.classList) node.classList.add(ACTIVE_CLS);
          }
          if (node) nodes.push(node);
        }
      } catch (e) {
        console.warn('[scw-br-v2] buildSowSection threw', grid && grid.sowId, e);
      }
    }
    var swapped = swapChildren(body, nodes);
    // Rebuild diary (localStorage.scwScrollSpy = '1'): how much of the grid
    // this render actually rebuilt and what asked for it — read it next to
    // data.js's per-view render lines when the page repaints on its own.
    // After the swap on purpose: its pageYOffset read is a layout flush.
    try {
      if (window.localStorage && localStorage.scwScrollSpy === '1') {
        var _from = String((new Error()).stack || '').split('\n').slice(2, 6).join(' « ').replace(/\s+/g, ' ');
        console.warn('[scw-br-v2] REBUILD — ' + reused + ' section(s) reused, ' +
          (state.sowGrids.length - reused) + ' rebuilt — trigger: ' +
          (ns._lastRenderTrigger || 'notify()') + ' — y=' + Math.round(window.pageYOffset || 0) +
          ' — floor ' + (floored ? floored + 'px' : 'off (at top)') +
          (swapped ? ' — sections swapped' : ' — DOM untouched (same sections)') +
          ' — from: ' + _from);
      }
    } catch (eSpy) { /* diagnostics only */ }
    ns._lastRenderTrigger = '';

    // Discontinued-products bar under each section's status line (warnings.js,
    // 2026-10-13) — refreshed on reused sections too, since the catalog may
    // have landed after they were built.
    if (ns.warnings && typeof ns.warnings.mountDiscontinuedBar === 'function') {
      var secs = body.querySelectorAll('.scw-bid-review-v2__sow');
      for (var di = 0; di < secs.length; di++) {
        try { ns.warnings.mountDiscontinuedBar(secs[di], sowItems); } catch (ed) { /* fail soft */ }
      }
    }

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

    // Header rework (header.js): SOW tabs, status line, column cards —
    // decorates the freshly built sections, keeps reused ones as they are.
    if (ns.header && typeof ns.header.afterRender === 'function') {
      try { ns.header.afterRender(body); }
      catch (eh) { console.warn('[scw-br-v2] header.afterRender threw', eh); }
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
  // Double-defer (rAF → task) so the deferred full-grid rebuild can never
  // flush BEFORE the paint of whatever the focusout belonged to — e.g. a
  // row close blurs the panel's input, and flushing the 200-800ms
  // renderSnapshot in the same task made the close feel laggy (perf
  // traces 2026-07-30). Covers both the mousedown-blur focusout (mouse
  // close) and the explicit active.blur() in toggleRowExpand (keyboard /
  // programmatic close). Guards unchanged — they are what make the
  // delayed flush behavior-preserving.
  function flushDeferredSnapshot() {
    if (!_pendingSnapshot) return;
    var container = document.getElementById(ns.CONFIG && ns.CONFIG.mountId);
    if (!container || hasFocusInPanel(container)) return;
    var snap = _pendingSnapshot;
    _pendingSnapshot = null;
    renderSnapshot(snap);
  }
  document.addEventListener('focusout', function () {
    var rafFn = window.requestAnimationFrame ||
      function (fn) { return window.setTimeout(fn, 16); };
    rafFn(function () { setTimeout(flushDeferredSnapshot, 0); });
  }, true);

  ns.render = { renderSnapshot: renderSnapshot };
})();
/*** END BID REVIEW V2 — RENDER ***********************************************/
