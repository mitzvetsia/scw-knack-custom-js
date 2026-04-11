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
 *        currentChildren = scan Knack.views[view_3505].model.data.models
 *                          for records whose field_2381_raw contains R.id
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
 *
 *      NOTE: The hidden sourceTr ([data-scw-worksheet="1"]) has an empty
 *      td.field_2381 and no td.field_2375 at all — both fields are only
 *      meaningful in the Backbone model, so all reads/writes of those
 *      two fields go through the model, never the sourceTr DOM.
 *   4. Falls back to model.fetch() ONLY when the destination L1 group
 *      header is not currently in the DOM (group is empty / collapsed out
 *      of tbody) — we can't silently synthesize an L1 header row.
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
    try { console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch (e) {}
  }

  // ======================================================================
  // DOM helpers — reading field cells out of the triple-row card layout.
  // ----------------------------------------------------------------------
  // For view_3505 each record is rendered as:
  //    sourceTr [data-scw-worksheet="1"]  (hidden original Knack tr — NOTE: its
  //                                        td.field_2381 is always empty and it
  //                                        has no td.field_2375 at all, so we
  //                                        cannot read either from the DOM)
  //    wsTr    .scw-ws-row                (visible, id=RECORD_ID, wraps the card)
  //    photoRow .scw-inline-photo-row     (optional trailing photo strip)
  //
  // Because the hidden sourceTr is unreliable/unavailable for field_2375
  // and field_2381, all reads of those values go through the Backbone model
  // (Knack.views[view_3505].model.data.models[*].attributes) which is the
  // canonical source of truth. Writes flow through:
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
  // Backbone model access — the only reliable source for field_2375/2381.
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

  /** Return ids of every model record whose field_2381_raw contains parentId. */
  function findRowsPointingTo(parentId) {
    var results = [];
    if (!parentId) return results;
    var arr = getModelRecords();
    for (var i = 0; i < arr.length; i++) {
      var m = arr[i];
      if (!m || !m.id) continue;
      var attrs = m.attributes || {};
      var raw = attrs[CONNECTIONS_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && raw[j].id === parentId) {
          results.push(m.id);
          break;
        }
      }
    }
    return results;
  }

  /**
   * Look up the display identifier for parentId. Prefer the model entry
   * (if R lives in this view's collection, which it does — R is a view_3505
   * record). Fall back to scraping any existing card td.field_2381 span.
   */
  function sampleIdentifierForParent(parentId) {
    if (!parentId) return '';
    // 1. The parent's own model record usually carries its display identifier
    //    inside a connection-ish attribute. Scan its attrs for a string that
    //    looks like an identifier — but simpler: pull from any child's
    //    field_2381_raw where one of the entries matches parentId.
    var arr = getModelRecords();
    for (var i = 0; i < arr.length; i++) {
      var attrs = arr[i] && arr[i].attributes;
      var raw = attrs && attrs[CONNECTIONS_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && raw[j].id === parentId && raw[j].identifier) {
          return String(raw[j].identifier);
        }
      }
    }
    // 2. Fallback — scrape any rendered card td.field_2381 span that shows it.
    var view = document.getElementById(VIEW_ID);
    if (view) {
      var span = view.querySelector(
        'tr.scw-ws-row td.' + CONNECTIONS_FIELD + ' span[data-kn="connection-value"].' + parentId
      );
      if (span) return span.textContent || '';
    }
    return '';
  }

  // ======================================================================
  // Group header index — {mdfIdfRecordId → L1 header tr}
  // ======================================================================

  function buildGroupHeaderMap() {
    var map = {};
    var view = document.getElementById(VIEW_ID);
    if (!view) return map;
    var tbody = view.querySelector('tbody');
    if (!tbody) return map;

    var kids = tbody.children;
    var curHeader = null;
    var curParentId = null;

    for (var i = 0; i < kids.length; i++) {
      var row = kids[i];
      var isL1Group = row.classList.contains('kn-table-group') &&
                      row.classList.contains('kn-group-level-1');

      if (isL1Group) {
        if (curHeader && curParentId && !map[curParentId]) {
          map[curParentId] = curHeader;
        }
        curHeader = row;
        curParentId = null;
        continue;
      }
      if (row.classList.contains('kn-table-group')) continue; // L2+ subgroup header

      // The sourceTr has no td.field_2375, so we can't read the group from the
      // DOM. When we hit a visible wsTr (.scw-ws-row) we look up that record's
      // field_2375_raw in the Backbone model instead.
      if (curParentId == null && row.classList.contains('scw-ws-row') &&
          row.id && HEX24.test(row.id)) {
        var attrs = getModelAttrs(row.id);
        var raw = attrs && attrs[GROUPING_FIELD + '_raw'];
        if (Array.isArray(raw) && raw[0] && raw[0].id) {
          curParentId = raw[0].id;
        }
      }
    }
    if (curHeader && curParentId && !map[curParentId]) {
      map[curParentId] = curHeader;
    }
    return map;
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

  function firePut(recordId, body) {
    if (!window.SCW || typeof window.SCW.knackAjax !== 'function' ||
        typeof window.SCW.knackRecordUrl !== 'function') {
      console.warn(LOG_PREFIX, 'SCW.knackAjax/knackRecordUrl unavailable — skipping PUT for ' + recordId);
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
      },
      error: function (xhr) {
        delete ownPuts[recordId];
        console.warn(LOG_PREFIX, 'PUT failed ' + recordId,
          xhr && xhr.status, xhr && xhr.responseText);
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
  // ======================================================================

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

    // --- 2. Current children from the Backbone model --------------------
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
    // R.field_2375_raw isn't always on the event payload — fall back to the
    // model entry for R (R IS a view_3505 record so it lives in this view's
    // collection).
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
    var patchFn = window.SCW && window.SCW.deviceWorksheet && window.SCW.deviceWorksheet.patchCard;

    if (added.length) {
      if (!rGroupId) {
        log('  no rGroupId — fallbackFetch + PUT-only for all');
        fallbackFetch('R has no ' + GROUPING_FIELD + ' — cannot place added children');
        // Still fire PUTs so the backend eventually converges.
        added.forEach(function (cid) { firePut(cid, buildAddedPut(null, R.id)); });
        removed.forEach(function (rid) { firePut(rid, buildRemovedPut()); });
        return;
      }
      var groupMap = buildGroupHeaderMap();
      log('  buildGroupHeaderMap keys=', Object.keys(groupMap));
      var destHeader = groupMap[rGroupId];
      if (!destHeader) {
        log('  destination group ' + rGroupId + ' not visible — PUT + fallbackFetch');
        // Fire the PUTs and fall back to a visual refresh — we can't
        // silently synthesize a new L1 header for an empty group.
        added.forEach(function (cid) { firePut(cid, buildAddedPut(rGroupId, R.id)); });
        removed.forEach(function (rid) { firePut(rid, buildRemovedPut()); });
        fallbackFetch('destination group ' + rGroupId + ' not in visible DOM');
        return;
      }

      for (var a = 0; a < added.length; a++) {
        var cid = added[a];
        var wsTr = document.getElementById(cid);
        if (!wsTr || !wsTr.classList.contains('scw-ws-row')) {
          log('  added child ' + cid + ' not visible in view — PUT only');
          firePut(cid, buildAddedPut(rGroupId, R.id));
          continue;
        }

        log('  + add ' + cid + ' → move into group ' + rGroupId);
        moveRowTriple(wsTr, destHeader);

        syncModelChild(cid, (function () {
          var p = {};
          p[GROUPING_FIELD] = rGroupRaw;
          p[GROUPING_FIELD + '_raw'] = rGroupRaw;
          p[CONNECTIONS_FIELD] = [{ id: R.id, identifier: rIdentifier }];
          p[CONNECTIONS_FIELD + '_raw'] = [{ id: R.id, identifier: rIdentifier }];
          return p;
        })());

        if (typeof patchFn === 'function') {
          var resp = { id: cid };
          resp[GROUPING_FIELD] = (rGroupRaw[0] && rGroupRaw[0].identifier) || '';
          resp[GROUPING_FIELD + '_raw'] = rGroupRaw;
          resp[CONNECTIONS_FIELD] = rIdentifier;
          resp[CONNECTIONS_FIELD + '_raw'] = [{ id: R.id, identifier: rIdentifier }];
          try { patchFn(VIEW_ID, cid, resp, { skipFocused: true }); }
          catch (e) { console.warn(LOG_PREFIX, 'patchCard threw for ' + cid, e); }
        }

        firePut(cid, buildAddedPut(rGroupId, R.id));
      }
    }

    // --- 5. Removed children: clear field_2381 only ----------------------
    for (var r = 0; r < removed.length; r++) {
      var rid = removed[r];
      log('  - remove ' + rid + ' (clear ' + CONNECTIONS_FIELD + ')');
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
      firePut(rid, buildRemovedPut());
    }

    log('  regroup done: ' + added.length + ' added, ' + removed.length + ' removed');
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
  $(document).on('knack-view-render.' + VIEW_ID + '.scwSilentRegroup', function () {
    if (pendingRecord || settleTimer) {
      log('view re-rendered during edit cycle — resetting settle timer');
      armSettle();
    }
  });

  // ======================================================================
  // Public debug hooks — poke from DevTools.
  // ======================================================================
  window.SCW = window.SCW || {};
  window.SCW.silentRegroupView3505 = {
    applyDeterministicRegroup: applyDeterministicRegroup,
    findRowsPointingTo: findRowsPointingTo,
    buildGroupHeaderMap: buildGroupHeaderMap,
    inspectState: function () {
      return {
        hasPendingRecord: pendingRecord != null,
        hasSettleTimer: settleTimer != null,
        ownPutsInFlight: Object.keys(ownPuts)
      };
    }
  };
  // Backward-compat alias for any lingering DevTools snippets.
  window.SCW.silentPollView3505 = window.SCW.silentRegroupView3505;

  log('installed — trigger=' + TRIGGER_FIELD + ', view=' + VIEW_ID);
})();
/*** END FEATURE: Silent deterministic regroup after field_2380 inline-edit on view_3505 *************/
