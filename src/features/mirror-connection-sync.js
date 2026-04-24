/**************************************************************************************************
 * FEATURE: Silent deterministic regroup after field_2380 inline-edit on view_3505
 *
 * Context:
 *   - Knack's native inline-edit record rule on field_2380 (view_3505)
 *     triggers a Make webhook whose only job is to rewrite field_2375 +
 *     field_2381 on the connected CHILD records:
 *        * added child D    → field_2375 = R.field_2375, field_2381 = [R]
 *        * removed child D  → field_2381 = []  (field_2375 untouched)
 *     where R is the record the user just edited.
 *   - field_2375 (REL_mdf-idf) is view_3505's L1 grouping key
 *     (device-worksheet.js:106 "move: { key: 'field_2375' }"), so the
 *     side-effect is that child rows visually move between MDF/IDF groups.
 *   - field_2381 ("connections") is a readOnly detail-panel field on the
 *     card (device-worksheet.js:117), NOT the grouping key.
 *
 * Why not wait for the Make webhook and model.fetch()?
 *   - A full re-render wipes all cards, flashes the view, and re-runs every
 *     per-card enhancer. The user explicitly asked for a silent refresh.
 *
 * Why not poll the API?
 *   - We own the rule deterministically. Given R on knack-cell-update we
 *     already know exactly what the webhook will do, so we can do it
 *     ourselves locally and fire the PUTs from the client. No polling,
 *     no webhook dependency, no guessing at stability.
 *
 * Strategy:
 *   1. On knack-cell-update.view_3505 stash the event record R and arm a
 *      debounced settle timer — Knack's native post-edit re-render fires
 *      within ~50ms and would wipe any DOM changes we made synchronously.
 *   2. Every knack-view-render.view_3505 during the edit cycle resets the
 *      settle timer. After SETTLE_MS of render silence, apply the regroup.
 *   3. Deterministic regroup:
 *        newChildren     = R.field_2380_raw (event payload)
 *        currentChildren = DOM-scan every visible card's td.field_2381 for
 *                          a `<span data-kn="connection-value">` whose class
 *                          list contains R.id — device-worksheet.js renders
 *                          field_2381 as a readOnly detail field which MOVES
 *                          the original Knack-rendered td (with its spans
 *                          intact) from sourceTr into the card's detail
 *                          panel, so the DOM is the ground truth here.
 *        added   = newChildren ∖ currentChildren
 *        removed = currentChildren ∖ newChildren
 *      For each added child D:
 *        - move D's row-triple into R.field_2375's L1 group
 *        - patch D's Backbone model attrs (field_2375, field_2381)
 *        - patch D's visible card via SCW.deviceWorksheet.patchCard
 *        - fire background PUT { field_2375: [R.field_2375], field_2381: [R] }
 *      For each removed child D:
 *        - patch D's Backbone model (field_2381 = [])
 *        - patch D's visible card
 *        - fire background PUT { field_2381: [] }
 *      When ALL PUTs have landed on the server (success or failure), fire
 *      a real `view.model.fetch()` to resync Knack's model with the true
 *      server state. This replaces the user having to manually reload the
 *      page after the silent regroup — by the time the fetch runs, the
 *      child records have their new field_2375/field_2381 persisted, so
 *      the natural re-render is correct.
 *
 *      NOTE: device-worksheet.js moves both field_2381 (readOnly) and
 *      field_2375 (moveIcon) tds out of the hidden sourceTr into the card,
 *      but the moveIcon td has its innerHTML replaced with an icon (the
 *      original connection-value span is destroyed), whereas readOnly tds
 *      preserve their contents. So field_2381 is DOM-readable, field_2375
 *      is not. For destination group resolution we walk backward from R's
 *      own wsTr to the nearest L1 group header — R is itself a view_3505
 *      record, so its current L1 group IS the destination.
 *   4. Falls back to model.fetch() ONLY when R's wsTr has no L1 header
 *      before it (R was just moved into an empty group, or R is not
 *      visible) — we can't silently synthesize an L1 header row.
 *   5. A re-entrancy guard (ownPuts) ignores any stray knack-cell-update
 *      events that echo our own background PUTs.
 **************************************************************************************************/
(function silentRegroupView3505() {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  var VIEW_ID           = 'view_3505';
  var TRIGGER_FIELD     = 'field_2380';  // children-connection on the edited record
  var GROUPING_FIELD    = 'field_2375';  // REL_mdf-idf (L1 group key)
  var CONNECTIONS_FIELD = 'field_2381';  // back-connection to parent (detail-panel)
  var SETTLE_MS         = 400;
  var LOG_PREFIX        = '[scw-silent-regroup.' + VIEW_ID + ']';

  var HEX24 = /^[0-9a-f]{24}$/i;

  function log() {
    if (!window.SCW || !window.SCW.DEBUG) return;
    try { console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch (e) {}
  }

  // ======================================================================
  // DOM helpers — reading field cells out of the triple-row card layout.
  // ----------------------------------------------------------------------
  // For view_3505 each record is rendered as:
  //    sourceTr [data-scw-worksheet="1"]  (hidden, original Knack tr — most
  //                                        of its tds have been moved OUT
  //                                        into the card below)
  //    wsTr    .scw-ws-row                (visible, id=RECORD_ID, wraps the card)
  //    photoRow .scw-inline-photo-row     (optional trailing photo strip)
  //
  // device-worksheet.js moves the original field_2381 td into the card's
  // detail panel with its contents intact, so:
  //   - field_2381 → DOM-readable via `tr.scw-ws-row td.field_2381 span[data-kn="connection-value"]`
  //   - field_2375 → NOT DOM-readable (moveIcon rewrites innerHTML)
  //
  // Writes to field_2381/field_2375 flow through:
  //   - syncModelChild()                 → Backbone attrs
  //   - SCW.deviceWorksheet.patchCard()  → the visible card td text
  // No sourceTr cell is ever written — there's nothing to write to.
  // ======================================================================

  function getSourceTr(wsTr) {
    if (!wsTr) return null;
    var s = wsTr.previousElementSibling;
    if (s && s.getAttribute && s.getAttribute('data-scw-worksheet') === '1') return s;
    return null;
  }

  function getTrailingPhotoRow(wsTr) {
    if (!wsTr) return null;
    var n = wsTr.nextElementSibling;
    if (n && n.classList && n.classList.contains('scw-inline-photo-row')) return n;
    return null;
  }

  // ----------------------------------------------------------------------
  // Backbone model access — used only as a fallback for R's field_2375_raw
  // when the event payload doesn't include it (the DOM can't tell us because
  // moveIcon rewrites R's field_2375 td).
  // ----------------------------------------------------------------------

  function getModelRecords() {
    try {
      if (typeof Knack === 'undefined' || !Knack.views || !Knack.views[VIEW_ID]) return [];
      var v = Knack.views[VIEW_ID];
      if (!v.model) return [];
      return (v.model.data && v.model.data.models) || v.model.models || [];
    } catch (e) { return []; }
  }

  function getModelAttrs(recordId) {
    if (!recordId) return null;
    var arr = getModelRecords();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id === recordId) return arr[i].attributes || null;
    }
    return null;
  }

  /**
   * Return ids of every visible wsTr whose td.field_2381 contains a
   * connection-value span pointing to parentId.
   *
   * We scan the DOM (not the Backbone model) because device-worksheet.js
   * renders field_2381 as a readOnly detail field — it MOVES the original
   * Knack-rendered td (with its `<span class="RECORD_ID" data-kn="connection-value">IDENTIFIER</span>`
   * children fully intact) from the hidden sourceTr into the card's detail
   * panel (see buildFieldRow: `row.appendChild(td)`). The data is guaranteed
   * to be in the DOM after the card builds, whereas the Backbone model
   * `attributes[field_2381_raw]` shape has historically been inconsistent.
   */
  function findRowsPointingTo(parentId) {
    var results = [];
    if (!parentId) return results;
    var view = document.getElementById(VIEW_ID);
    if (!view) return results;

    // NOTE: Knack stores the connected record's 24-hex id as the class
    // attribute of the span. We CANNOT use a `.<id>` CSS class selector here
    // because CSS class tokens cannot start with a digit — ~60% of hex ids
    // start with a digit, and `querySelectorAll('span.6abc...')` is invalid.
    // Instead we select all connection-value spans in td.field_2381 and
    // compare their class attribute programmatically.
    var spans = view.querySelectorAll(
      'tr.scw-ws-row td.' + CONNECTIONS_FIELD + ' span[data-kn="connection-value"]'
    );
    for (var i = 0; i < spans.length; i++) {
      var cls = (spans[i].getAttribute('class') || '').trim();
      if (cls !== parentId) continue;
      var tr = spans[i].closest('tr.scw-ws-row');
      if (tr && tr.id && HEX24.test(tr.id)) {
        if (results.indexOf(tr.id) === -1) results.push(tr.id);
      }
    }
    return results;
  }

  /**
   * Look up the display identifier for parentId. We scrape any existing
   * card td.field_2381 span that points to parentId — the identifier text
   * is the span's textContent. Falls back to an empty string.
   */
  function sampleIdentifierForParent(parentId) {
    if (!parentId) return '';
    var view = document.getElementById(VIEW_ID);
    if (view) {
      // Same CSS-class-starts-with-digit gotcha as findRowsPointingTo —
      // iterate all spans and compare class attribute manually.
      var spans = view.querySelectorAll(
        'tr.scw-ws-row td.' + CONNECTIONS_FIELD + ' span[data-kn="connection-value"]'
      );
      for (var si = 0; si < spans.length; si++) {
        var cls = (spans[si].getAttribute('class') || '').trim();
        if (cls === parentId) return (spans[si].textContent || '').trim();
      }
    }
    // Last-ditch: model
    var arr = getModelRecords();
    for (var i = 0; i < arr.length; i++) {
      var attrs = arr[i] && (arr[i].attributes || arr[i]);
      var raw = attrs && attrs[CONNECTIONS_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && raw[j].id === parentId && raw[j].identifier) {
          return String(raw[j].identifier);
        }
      }
    }
    return '';
  }

  // ======================================================================
  // L1 group header lookup.
  // ----------------------------------------------------------------------
  // R (the edited parent) is itself a view_3505 record and lives in exactly
  // the L1 group we want added children to land in. We walk backward from
  // R's wsTr to find the nearest preceding `.kn-table-group.kn-group-level-1`
  // row — that's the destination header. This is more reliable than trying
  // to read field_2375 off any card, because the moveIcon td has its
  // innerHTML rewritten (the original connection-value span is destroyed).
  // ======================================================================

  /** Walk backward from wsTr until we hit an L1 group header row. */
  function findL1HeaderBefore(wsTr) {
    if (!wsTr) return null;
    var cur = wsTr.previousElementSibling;
    while (cur) {
      if (cur.classList.contains('kn-table-group') &&
          cur.classList.contains('kn-group-level-1')) {
        return cur;
      }
      cur = cur.previousElementSibling;
    }
    return null;
  }

  /** Walk forward from a group header to the last row in its section. */
  function findLastRowInGroup(headerTr) {
    var cur = headerTr;
    var nxt = cur.nextElementSibling;
    while (nxt) {
      if (nxt.classList.contains('kn-table-group') &&
          nxt.classList.contains('kn-group-level-1')) break;
      cur = nxt;
      nxt = nxt.nextElementSibling;
    }
    return cur;
  }

  /** Move the full triple (sourceTr + wsTr + optional photoRow) to the tail of destHeader's group. */
  function moveRowTriple(wsTr, destHeader) {
    var sourceTr = getSourceTr(wsTr);
    if (!sourceTr) {
      console.warn(LOG_PREFIX, 'missing sourceTr for', wsTr.id, '— cannot move');
      return false;
    }
    var photoRow = getTrailingPhotoRow(wsTr);
    var anchor = findLastRowInGroup(destHeader);
    var parent = destHeader.parentNode;
    if (!parent) return false;

    if (anchor === (photoRow || wsTr)) return true; // already at tail of the right group

    var cursor = anchor;
    parent.insertBefore(sourceTr, cursor.nextSibling);  cursor = sourceTr;
    parent.insertBefore(wsTr,     cursor.nextSibling);  cursor = wsTr;
    if (photoRow) parent.insertBefore(photoRow, cursor.nextSibling);
    return true;
  }

  // ======================================================================
  // Backbone model sync. Pattern borrowed from device-worksheet.js syncKnackModel.
  // ======================================================================

  function syncModelChild(recordId, attrsPatch) {
    try {
      if (typeof Knack === 'undefined' || !Knack.views || !Knack.views[VIEW_ID]) return;
      var v = Knack.views[VIEW_ID];
      if (!v.model) return;
      var m = v.model;

      var entry = (typeof m.get === 'function') ? m.get(recordId) : null;
      if (!entry && m.data && typeof m.data.get === 'function') entry = m.data.get(recordId);
      if (!entry) {
        var arr = m.models || (m.data && m.data.models) || [];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].id === recordId) { entry = arr[i]; break; }
        }
      }
      if (!entry) return;

      var attrs = entry.attributes || entry;
      Object.keys(attrsPatch).forEach(function (k) { attrs[k] = attrsPatch[k]; });
    } catch (ex) { /* best-effort */ }
  }

  // ======================================================================
  // Background PUTs via SCW.knackAjax (auto-adds auth headers).
  // ownPuts tracks in-flight ids so we can ignore echo cell-update events.
  // ======================================================================

  var ownPuts = {};

  function firePut(recordId, body, onDone) {
    if (!window.SCW || typeof window.SCW.knackAjax !== 'function' ||
        typeof window.SCW.knackRecordUrl !== 'function') {
      console.warn(LOG_PREFIX, 'SCW.knackAjax/knackRecordUrl unavailable — skipping PUT for ' + recordId);
      if (typeof onDone === 'function') onDone(new Error('knackAjax unavailable'));
      return;
    }
    var url = window.SCW.knackRecordUrl(VIEW_ID, recordId);
    log('  PUT → ' + recordId + ' body=' + JSON.stringify(body));
    ownPuts[recordId] = true;
    window.SCW.knackAjax({
      type: 'PUT',
      url: url,
      data: JSON.stringify(body),
      dataType: 'json',
      success: function (resp) {
        delete ownPuts[recordId];
        log('  PUT ok ' + recordId);
        if (typeof onDone === 'function') onDone(null, resp);
      },
      error: function (xhr) {
        delete ownPuts[recordId];
        console.warn(LOG_PREFIX, 'PUT failed ' + recordId,
          xhr && xhr.status, xhr && xhr.responseText);
        if (typeof onDone === 'function') onDone(xhr || new Error('PUT failed'));
      }
    });
  }

  // ======================================================================
  // Fallback: full model.fetch when destination group isn't in the DOM.
  // ======================================================================

  function fallbackFetch(reason) {
    log('fallback → model.fetch(): ' + reason);
    try {
      if (window.SCW && window.SCW.deviceWorksheet &&
          typeof window.SCW.deviceWorksheet.captureState === 'function') {
        window.SCW.deviceWorksheet.captureState();
      }
    } catch (e) { /* ignore */ }
    try {
      var v = Knack.views && Knack.views[VIEW_ID];
      if (v && v.model && typeof v.model.fetch === 'function') {
        v.model.fetch();
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'fallback fetch threw', e);
    }
  }

  // ======================================================================
  // Deterministic regroup — the main payoff.
  // ----------------------------------------------------------------------
  // Plan cache: after we compute a regroup plan, we keep it around for
  // REPLAY_GRACE_MS so that any subsequent view re-render (either the
  // Make webhook's child PUTs echoing back, or Knack re-fetching after
  // its native post-edit cycle) can re-apply the moves. This is the fix
  // for "items visually snap back to old group after a brief move" — the
  // DOM-level moves get wiped by Knack's re-render-from-fresh-fetch
  // (which sees stale server data because the Make webhook / our own
  // child PUTs haven't landed yet), so we replay them until the server
  // converges and Knack starts rendering the correct group naturally.
  // ======================================================================

  var REPLAY_GRACE_MS = 8000; // window during which we replay moves on re-render
  var pendingPlan = null;     // { R_id, rGroupRaw, rGroupId, rIdentifier, added, removed }
  var planClearTimer = null;
  var mutObserver = null;     // tbody watchdog
  var mutSuppressed = false;  // re-entrance guard during our own DOM mutations
  var mutDebounceTimer = null;

  function clearPendingPlanSoon() {
    if (planClearTimer) clearTimeout(planClearTimer);
    planClearTimer = setTimeout(function () {
      log('plan expired — clearing pendingPlan');
      pendingPlan = null;
      planClearTimer = null;
      stopMutGuard();
    }, REPLAY_GRACE_MS);
  }

  // ----------------------------------------------------------------------
  // Plan drift detector: returns true if any added child is NOT currently
  // beneath R's L1 header in the tbody. Used by both the mutation observer
  // and the view-render replay to decide whether a reapply is needed.
  // ----------------------------------------------------------------------
  function planHasDrifted(plan) {
    if (!plan) return false;
    var rWsTr = document.getElementById(plan.R_id);
    if (!rWsTr) return false;
    var destHeader = findL1HeaderBefore(rWsTr);
    if (!destHeader) return false;
    for (var i = 0; i < plan.added.length; i++) {
      var cid = plan.added[i];
      var cWsTr = document.getElementById(cid);
      if (!cWsTr) continue; // not visible — nothing to check
      if (findL1HeaderBefore(cWsTr) !== destHeader) return true;
    }
    return false;
  }

  // ----------------------------------------------------------------------
  // Mutation observer watchdog on the view's tbody. Catches any DOM
  // change — whether Knack fires knack-view-render or not — and re-applies
  // the cached plan whenever drift is detected. Auto-reattaches if the
  // tbody element itself is replaced by Knack's renderer.
  // ----------------------------------------------------------------------
  function startMutGuard() {
    stopMutGuard();
    var view = document.getElementById(VIEW_ID);
    if (!view) return;
    mutObserver = new MutationObserver(function () {
      if (mutSuppressed) return;
      if (!pendingPlan) { stopMutGuard(); return; }
      clearTimeout(mutDebounceTimer);
      mutDebounceTimer = setTimeout(function () {
        if (!pendingPlan || mutSuppressed) return;
        if (!planHasDrifted(pendingPlan)) return;
        log('mut-guard: drift detected — replaying plan');
        mutSuppressed = true;
        try { applyPlanToDom(pendingPlan, 'mut-guard'); }
        catch (e) { console.warn(LOG_PREFIX, 'mut-guard replay threw', e); }
        // Keep suppression active briefly so our own reapply doesn't
        // retrigger the observer in an infinite loop.
        setTimeout(function () { mutSuppressed = false; }, 80);
      }, 40);
    });
    // Observe the whole view subtree so we catch both tbody-internal row
    // rearrangements AND full tbody replacement (childList on table).
    mutObserver.observe(view, { childList: true, subtree: true });
    log('mut-guard: installed on ' + VIEW_ID);
  }

  function stopMutGuard() {
    if (mutDebounceTimer) { clearTimeout(mutDebounceTimer); mutDebounceTimer = null; }
    if (mutObserver) { mutObserver.disconnect(); mutObserver = null; log('mut-guard: stopped'); }
  }

  function applyPlanToDom(plan, reason) {
    if (!plan) return;
    mutSuppressed = true; // don't retrigger the watchdog from our own writes
    var patchFn = window.SCW && window.SCW.deviceWorksheet && window.SCW.deviceWorksheet.patchCard;
    var rWsTr = document.getElementById(plan.R_id);
    var destHeader = findL1HeaderBefore(rWsTr);
    log('applyPlanToDom (' + reason + '): R wsTr=' + (!!rWsTr) +
        ' destHeader=' + (!!destHeader) +
        ' added=' + plan.added.length + ' removed=' + plan.removed.length);

    // Added children → move into R's L1 group + patch
    if (destHeader) {
      for (var a = 0; a < plan.added.length; a++) {
        var cid = plan.added[a];
        var wsTr = document.getElementById(cid);
        if (!wsTr || !wsTr.classList.contains('scw-ws-row')) continue;

        moveRowTriple(wsTr, destHeader);

        syncModelChild(cid, (function (rGroupRaw, rId, rIdentifier) {
          var p = {};
          p[GROUPING_FIELD] = rGroupRaw;
          p[GROUPING_FIELD + '_raw'] = rGroupRaw;
          p[CONNECTIONS_FIELD] = [{ id: rId, identifier: rIdentifier }];
          p[CONNECTIONS_FIELD + '_raw'] = [{ id: rId, identifier: rIdentifier }];
          return p;
        })(plan.rGroupRaw, plan.R_id, plan.rIdentifier));

        if (typeof patchFn === 'function') {
          var resp = { id: cid };
          resp[GROUPING_FIELD] = (plan.rGroupRaw && plan.rGroupRaw[0] && plan.rGroupRaw[0].identifier) || '';
          resp[GROUPING_FIELD + '_raw'] = plan.rGroupRaw;
          resp[CONNECTIONS_FIELD] = plan.rIdentifier;
          resp[CONNECTIONS_FIELD + '_raw'] = [{ id: plan.R_id, identifier: plan.rIdentifier }];
          try { patchFn(VIEW_ID, cid, resp, { skipFocused: true }); }
          catch (e) { console.warn(LOG_PREFIX, 'patchCard threw for ' + cid, e); }
        }
      }
    }

    // Removed children → clear field_2381 on the card + model
    for (var r = 0; r < plan.removed.length; r++) {
      var rid = plan.removed[r];
      syncModelChild(rid, (function () {
        var p = {};
        p[CONNECTIONS_FIELD] = [];
        p[CONNECTIONS_FIELD + '_raw'] = [];
        return p;
      })());
      if (typeof patchFn === 'function') {
        var resp2 = { id: rid };
        resp2[CONNECTIONS_FIELD] = '';
        resp2[CONNECTIONS_FIELD + '_raw'] = [];
        try { patchFn(VIEW_ID, rid, resp2, { skipFocused: true }); }
        catch (e) { console.warn(LOG_PREFIX, 'patchCard threw for ' + rid, e); }
      }
    }

    // Release the mutation-observer suppression on the next tick so our
    // own writes have all been queued before we start listening again.
    setTimeout(function () { mutSuppressed = false; }, 0);
  }

  function applyDeterministicRegroup(R) {
    if (!R || !R.id) {
      log('applyDeterministicRegroup: no R or R.id — abort', R);
      return;
    }
    log('applyDeterministicRegroup: start R=' + R.id);

    // --- 1. New children from the event record --------------------------
    var newChildrenRaw = R[TRIGGER_FIELD + '_raw'] || [];
    log('  R.' + TRIGGER_FIELD + '_raw =', newChildrenRaw);
    var newChildIds = [];
    for (var i = 0; i < newChildrenRaw.length; i++) {
      var entry = newChildrenRaw[i];
      var id = entry && entry.id;
      if (id && HEX24.test(id)) newChildIds.push(id);
    }
    var newChildSet = {};
    newChildIds.forEach(function (id) { newChildSet[id] = true; });

    // --- 2. Current children — DOM-scan every visible card's td.field_2381.
    var currentChildIds = findRowsPointingTo(R.id);
    log('  findRowsPointingTo(' + R.id + ') →', currentChildIds);
    var currentChildSet = {};
    currentChildIds.forEach(function (id) { currentChildSet[id] = true; });

    // --- 3. Diff ---------------------------------------------------------
    var added = newChildIds.filter(function (id) { return !currentChildSet[id]; });
    var removed = currentChildIds.filter(function (id) { return !newChildSet[id]; });

    log('  diff: new=' + newChildIds.length +
        ' cur=' + currentChildIds.length +
        ' added=' + JSON.stringify(added) +
        ' removed=' + JSON.stringify(removed));

    if (!added.length && !removed.length) {
      log('  no changes — done');
      return;
    }

    // --- 4. Resolve destination group for added children ---------------
    var rGroupRaw = R[GROUPING_FIELD + '_raw'];
    if (!Array.isArray(rGroupRaw) || !rGroupRaw.length) {
      var rAttrs = getModelAttrs(R.id);
      if (rAttrs && Array.isArray(rAttrs[GROUPING_FIELD + '_raw'])) {
        rGroupRaw = rAttrs[GROUPING_FIELD + '_raw'];
      }
    }
    var rGroupId = (Array.isArray(rGroupRaw) && rGroupRaw[0] && rGroupRaw[0].id) ? rGroupRaw[0].id : null;
    var rIdentifier = sampleIdentifierForParent(R.id);
    log('  R group raw=', rGroupRaw, ' id=' + rGroupId + ' identifier="' + rIdentifier + '"');

    // --- 5. Build and cache plan so subsequent re-renders can replay it.
    var plan = {
      R_id: R.id,
      rGroupRaw: rGroupRaw,
      rGroupId: rGroupId,
      rIdentifier: rIdentifier,
      added: added,
      removed: removed
    };
    pendingPlan = plan;
    startMutGuard(); // watchdog catches any DOM rebuild from here on out

    // --- 6. Check destination header ------------------------------------
    var rWsTr = document.getElementById(R.id);
    var destHeader = findL1HeaderBefore(rWsTr);
    log('  R wsTr found=' + (!!rWsTr) + ' destHeader found=' + (!!destHeader));

    // --- 7. Start the PUT-completion tracker ----------------------------
    // When ALL of our child PUTs have landed on the server, we fire a
    // real model.fetch() so Knack re-renders the view from fresh,
    // now-consistent server state. This replaces the user having to hit
    // browser-refresh manually after the silent regroup.
    var totalPuts = added.length + removed.length;
    var putsRemaining = totalPuts;
    function onPutFinished() {
      putsRemaining--;
      if (putsRemaining > 0) return;
      log('all ' + totalPuts + ' PUTs settled — firing real refresh (model.fetch)');
      // Clear plan + watchdog FIRST so the incoming render isn't fought
      // by our replay machinery.
      pendingPlan = null;
      stopMutGuard();
      if (planClearTimer) { clearTimeout(planClearTimer); planClearTimer = null; }
      try {
        if (window.SCW && window.SCW.deviceWorksheet &&
            typeof window.SCW.deviceWorksheet.captureState === 'function') {
          window.SCW.deviceWorksheet.captureState();
        }
      } catch (e) { /* best-effort */ }
      try {
        var v = Knack.views && Knack.views[VIEW_ID];
        if (v && v.model && typeof v.model.fetch === 'function') {
          v.model.fetch();
        }
      } catch (e) {
        console.warn(LOG_PREFIX, 'final model.fetch threw', e);
      }
    }

    if (added.length && !destHeader) {
      log('  no destHeader for R — PUT-only + fallbackFetch');
      added.forEach(function (cid) { firePut(cid, buildAddedPut(rGroupId, R.id), onPutFinished); });
      removed.forEach(function (rid) { firePut(rid, buildRemovedPut(), onPutFinished); });
      // Skip the duplicate fetch here — onPutFinished will fetch when
      // all PUTs land.
      clearPendingPlanSoon();
      return;
    }

    // --- 8. Apply plan to DOM (initial pass) ----------------------------
    applyPlanToDom(plan, 'initial');

    // --- 9. Fire background PUTs with completion tracking --------------
    if (totalPuts === 0) {
      log('  no PUTs to fire — skipping final fetch');
    } else {
      for (var a = 0; a < added.length; a++) {
        firePut(added[a], buildAddedPut(rGroupId, R.id), onPutFinished);
      }
      for (var r = 0; r < removed.length; r++) {
        firePut(removed[r], buildRemovedPut(), onPutFinished);
      }
    }

    // --- 10. Schedule plan expiry as a safety net (in case a PUT hangs).
    clearPendingPlanSoon();

    log('  regroup done: ' + added.length + ' added, ' + removed.length + ' removed' +
        ' (plan cached for up to ' + REPLAY_GRACE_MS + 'ms, final fetch on PUT completion)');
  }

  function buildAddedPut(rGroupId, rId) {
    var body = {};
    if (rGroupId) body[GROUPING_FIELD] = [rGroupId];
    body[CONNECTIONS_FIELD] = [rId];
    return body;
  }

  function buildRemovedPut() {
    var body = {};
    body[CONNECTIONS_FIELD] = [];
    return body;
  }

  // ======================================================================
  // Event coordinator
  // ----------------------------------------------------------------------
  // Knack natively re-renders view_3505 within ~50ms of knack-cell-update
  // (device-worksheet.js:5721 patches the card off the same event). Any
  // DOM changes we make synchronously get wiped by that re-render, so we
  // defer the regroup until a debounced settle window passes.
  // ======================================================================

  var pendingRecord = null;
  var settleTimer = null;

  function armSettle() {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(onSettled, SETTLE_MS);
  }

  function onSettled() {
    settleTimer = null;
    var R = pendingRecord;
    pendingRecord = null;
    if (!R) return;
    log('settled — applying deterministic regroup for R=' + R.id);
    try { applyDeterministicRegroup(R); }
    catch (e) { console.warn(LOG_PREFIX, 'applyDeterministicRegroup threw', e); }
  }

  $(document).on('knack-cell-update.' + VIEW_ID + '.scwSilentRegroup', function (event, view, record) {
    try {
      if (!record || !record.id) return;
      // Re-entrancy: ignore echoes from our own background PUTs.
      if (ownPuts[record.id]) {
        log('ignoring cell-update echo for own PUT ' + record.id);
        return;
      }
      log('knack-cell-update received', { recordId: record.id });
      // If a later edit arrives before we've settled, the newest record wins —
      // Knack always provides the full record snapshot, so we don't lose data.
      pendingRecord = record;
      armSettle();
    } catch (e) {
      console.warn(LOG_PREFIX, 'knack-cell-update handler threw', e);
    }
  });

  // Re-renders during the edit cycle reset the settle timer rather than
  // aborting, so Knack's native post-edit re-render doesn't kill us.
  // After the initial regroup has run, the MutationObserver watchdog is
  // the primary reapply path, but we also hook view-render as a secondary
  // path with a longer defer (the observer fires immediately on childList
  // changes; view-render may fire later after Knack finishes its render
  // cycle — we want to catch both).
  $(document).on('knack-view-render.' + VIEW_ID + '.scwSilentRegroup', function () {
    if (pendingRecord || settleTimer) {
      log('view re-rendered during edit cycle — resetting settle timer');
      armSettle();
      return;
    }
    if (pendingPlan) {
      log('view re-rendered during replay window — scheduling replay checks');
      // Re-attach the mutation observer in case the tbody element was
      // replaced (the old observer is bound to the defunct tbody).
      startMutGuard();
      // Run multiple replay checks at increasing delays so we catch both
      // immediate render commits and any tail-end re-sorts Knack does
      // after emitting view-render.
      [50, 200, 500].forEach(function (delay) {
        setTimeout(function () {
          if (!pendingPlan) return;
          if (planHasDrifted(pendingPlan)) {
            log('view-render replay @' + delay + 'ms: drift detected');
            applyPlanToDom(pendingPlan, 'view-render@' + delay);
          }
        }, delay);
      });
    }
  });

  // ======================================================================
  // Public debug hooks — poke from DevTools.
  // ======================================================================
  window.SCW = window.SCW || {};
  window.SCW.silentRegroupView3505 = {
    applyDeterministicRegroup: applyDeterministicRegroup,
    applyPlanToDom: applyPlanToDom,
    findRowsPointingTo: findRowsPointingTo,
    findL1HeaderBefore: findL1HeaderBefore,
    inspectState: function () {
      return {
        hasPendingRecord: pendingRecord != null,
        hasSettleTimer: settleTimer != null,
        hasPendingPlan: pendingPlan != null,
        pendingPlan: pendingPlan,
        ownPutsInFlight: Object.keys(ownPuts)
      };
    }
  };
  // Backward-compat alias for any lingering DevTools snippets.
  window.SCW.silentPollView3505 = window.SCW.silentRegroupView3505;

  log('installed — trigger=' + TRIGGER_FIELD + ', view=' + VIEW_ID);
})();
/*** END FEATURE: Silent deterministic regroup after field_2380 inline-edit on view_3505 *************/
