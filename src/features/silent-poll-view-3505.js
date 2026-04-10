/**************************************************************************************************
 * FEATURE: Silent poll + silent regroup after field_2380 inline-edit on view_3505
 *
 * Context:
 *   - Knack's native inline-edit record rule on field_2380 (view_3505)
 *     triggers a Make webhook.
 *   - The webhook rewrites field_2381 (REL_DROP → parent networking device)
 *     on OTHER, already-connected records in the grid. field_2381 is the
 *     L1 GROUPING key for the worksheet, so the webhook effectively moves
 *     existing rows between MDF/IDF/HEADEND group sections.
 *   - Those updates land asynchronously, AFTER Knack's PUT response.
 *
 * Why not model.fetch()?
 *   - A full Knack re-render wipes the card DOM, flashes the view, and
 *     churns through every card's enhancer (applyRecordLock,
 *     applyHideWhenFieldEquals, refreshInputConditionalColor). The user
 *     explicitly asked for a silent refresh that does NOT flash.
 *
 * Why not patchCardFromResponse for everything?
 *   - patchCard only updates text nodes / inputs INSIDE an existing card.
 *     It cannot move a row from one L1 group header to another, so it
 *     physically cannot reflect the webhook's main change.
 *
 * Strategy:
 *   1. On each successful PUT whose body contains field_2380, snapshot the
 *      DOM's current {recordId → sortedParentIds} map as a baseline.
 *   2. Poll the view records endpoint on a timer, computing the same
 *      shape from field_2381_raw in the API response.
 *   3. When two successive API polls agree AND differ from the baseline,
 *      assume the webhook is done.
 *   4. Apply a SILENT REGROUP:
 *        a. Build {parentDeviceId → L1 group header row} from the DOM.
 *        b. For every record whose field_2381 differs between DOM and API,
 *           move its row-triple (hidden sourceTr + visible wsTr + optional
 *           photo row) to the tail of the destination group header.
 *        c. Rewrite the sourceTr's td.field_2381 to reflect the new parent.
 *        d. Patch the corresponding Backbone model record's attributes so
 *           subsequent inline-edit PUTs see the new parent.
 *        e. Call SCW.deviceWorksheet.patchCard for every record so other
 *           changed fields (labels, fees, calcs) sync into the card.
 *      If any record requires moving to a destination group that doesn't
 *      exist in the visible DOM (or to a record that isn't visible at all)
 *      fall back to model.fetch() — we can't silently construct a new L1
 *      group header from scratch.
 *   5. group-collapse's MutationObserver re-runs on its own (debounced
 *      100ms) and its state map is keyed by L1 label text, so collapse
 *      state survives the moves.
 *
 * Tunables live in the CONFIG block below.
 **************************************************************************************************/
(function silentPollView3505() {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  var VIEW_ID         = 'view_3505';
  var TRIGGER_FIELD   = 'field_2380';   // the field the user inline-edits
  var GROUPING_FIELD  = 'field_2381';   // the field the webhook rewrites → drives L1 groups
  var POLL_INTERVAL   = 1000;           // ms between polls
  var STABLE_CYCLES   = 2;              // consecutive unchanged cycles → webhook done
  var MAX_POLLS       = 12;             // hard cap (~14s)
  var START_DELAY     = 250;            // ms to wait after trigger before first poll
  var LOG_PREFIX      = '[scw-silent-poll.' + VIEW_ID + ']';

  var HEX24 = /^[0-9a-f]{24}$/i;

  // ======================
  // STATE
  // ======================
  var pollTimer       = null;
  var pollsRemaining  = 0;
  var stableStreak    = 0;
  var lastSnapshot    = null;   // snapshot from previous poll (for stability check)
  var domBaseline     = null;   // snapshot captured at trigger time (for dirty check)
  var inFlight        = false;
  var active          = false;

  function log() {
    // Always-on lifecycle logging while we're diagnosing. Cheap and low-volume.
    try { console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch (e) {}
  }
  function debug() {
    if (!window.SCW || !window.SCW.DEBUG_SILENT_POLL) return;
    try { console.log.apply(console, [LOG_PREFIX + '[dbg]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  // ======================================================================
  // DOM helpers — reading field_2381 out of the triple-row card structure
  // ----------------------------------------------------------------------
  // For view_3505 the device-worksheet feature lays each record out as
  //    sourceTr [data-scw-worksheet="1"]  (hidden original Knack tr, has td.field_2381)
  //    wsTr    .scw-ws-row                (visible, id=RECORD_ID, wraps card)
  //    photoRow .scw-inline-photo-row     (optional trailing photo strip)
  // All field cells live on sourceTr; wsTr only has one <td colspan> with
  // the card inside it. So to read field_2381 we look at wsTr's PREVIOUS
  // sibling.
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

  function extractField2381Ids(tr) {
    var ids = [];
    if (!tr) return ids;
    var cell = tr.querySelector('td.' + GROUPING_FIELD);
    if (!cell) return ids;
    var spans = cell.querySelectorAll('span[data-kn="connection-value"]');
    for (var s = 0; s < spans.length; s++) {
      var classes = spans[s].classList;
      for (var c = 0; c < classes.length; c++) {
        if (HEX24.test(classes[c])) { ids.push(classes[c]); break; }
      }
    }
    return ids;
  }

  function sortedIdString(ids) {
    if (!ids || !ids.length) return '';
    var copy = ids.slice();
    copy.sort();
    return copy.join(',');
  }

  /** Build { recordId → sortedJoinedParentIds } from the current DOM. */
  function captureDomSnapshot() {
    var snap = {};
    var view = document.getElementById(VIEW_ID);
    if (!view) return snap;
    var rows = view.querySelectorAll('tr.scw-ws-row[id]');
    for (var i = 0; i < rows.length; i++) {
      var wsTr = rows[i];
      if (!HEX24.test(wsTr.id)) continue;
      snap[wsTr.id] = sortedIdString(extractField2381Ids(getSourceTr(wsTr)));
    }
    return snap;
  }

  /** Build the same shape from an API records response. */
  function snapshotFromResponse(records) {
    var snap = {};
    if (!records || !records.length) return snap;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r || !r.id) continue;
      var ids = [];
      var raw = r[GROUPING_FIELD + '_raw'];
      if (Array.isArray(raw)) {
        for (var k = 0; k < raw.length; k++) {
          var entry = raw[k];
          if (entry && typeof entry === 'object' && entry.id && HEX24.test(entry.id)) {
            ids.push(entry.id);
          } else if (typeof entry === 'string' && HEX24.test(entry)) {
            ids.push(entry);
          }
        }
      } else if (typeof r[GROUPING_FIELD] === 'string') {
        var m = r[GROUPING_FIELD].match(/[0-9a-f]{24}/gi);
        if (m) ids = m;
      }
      snap[r.id] = sortedIdString(ids);
    }
    return snap;
  }

  function snapshotsEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      var key = ka[i];
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (a[key] !== b[key]) return false;
    }
    return true;
  }

  function isDirty(baseline, current) {
    if (!baseline || !current) return false;
    var bk = Object.keys(baseline), ck = Object.keys(current);
    if (bk.length !== ck.length) return true;
    for (var i = 0; i < bk.length; i++) {
      var key = bk[i];
      if (!Object.prototype.hasOwnProperty.call(current, key)) return true;
      if (baseline[key] !== current[key]) return true;
    }
    return false;
  }

  // ======================================================================
  // Group header index
  // ----------------------------------------------------------------------
  // Walk the tbody, identify every L1 group header, and for each header
  // record the parent device ID shared by its child rows (read from their
  // td.field_2381 spans). Returns { parentDeviceId → headerTr }.
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
        // Commit previous group
        if (curHeader && curParentId && !map[curParentId]) {
          map[curParentId] = curHeader;
        }
        curHeader = row;
        curParentId = null;
        continue;
      }
      if (row.classList.contains('kn-table-group')) continue; // L2+ subgroup header

      // Data row — only read parent id from hidden originals (sourceTr)
      if (curParentId == null && row.getAttribute && row.getAttribute('data-scw-worksheet') === '1') {
        var ids = extractField2381Ids(row);
        if (ids.length) curParentId = ids[0];
      }
    }
    // Commit trailing group
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

  // ======================================================================
  // Row moving
  // ----------------------------------------------------------------------
  // Move the full triple (sourceTr + wsTr + optional photoRow) to the
  // tail of the destination group, preserving relative order.
  // ======================================================================

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

    // Guard: if we're already at the tail of the right group, no-op.
    if (anchor === (photoRow || wsTr)) return true;

    var cursor = anchor;
    parent.insertBefore(sourceTr, cursor.nextSibling);  cursor = sourceTr;
    parent.insertBefore(wsTr,     cursor.nextSibling);  cursor = wsTr;
    if (photoRow) parent.insertBefore(photoRow, cursor.nextSibling);
    return true;
  }

  // ======================================================================
  // Update td.field_2381 in-place on the hidden sourceTr
  // ======================================================================

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateField2381Cell(wsTr, record) {
    var sourceTr = getSourceTr(wsTr);
    if (!sourceTr) return;
    var cell = sourceTr.querySelector('td.' + GROUPING_FIELD);
    if (!cell) return;
    var raw = record[GROUPING_FIELD + '_raw'];
    if (!Array.isArray(raw)) return;

    var parts = [];
    for (var i = 0; i < raw.length; i++) {
      var entry = raw[i];
      if (!entry || !entry.id || !HEX24.test(entry.id)) continue;
      parts.push(
        '<span class="' + entry.id + '" data-kn="connection-value">' +
        escapeHtml(entry.identifier || '') +
        '</span>'
      );
    }
    cell.innerHTML = parts.join('');
  }

  // ======================================================================
  // Update the Backbone model record's attributes so the next inline-edit
  // PUT carries the new parent. Pattern borrowed from device-worksheet.js
  // syncKnackModel (src/features/device-worksheet.js:3314).
  // ======================================================================

  function syncModelRecord(recordId, record) {
    try {
      if (typeof Knack === 'undefined' || !Knack.views || !Knack.views[VIEW_ID]) return;
      var view = Knack.views[VIEW_ID];
      if (!view.model) return;
      var m = view.model;

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
      var raw = record[GROUPING_FIELD + '_raw'];
      if (raw != null) {
        attrs[GROUPING_FIELD] = raw;
        attrs[GROUPING_FIELD + '_raw'] = raw;
      }
    } catch (ex) {
      // best-effort
    }
  }

  // ======================================================================
  // Silent regroup — the main payoff
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
      var view = Knack.views && Knack.views[VIEW_ID];
      if (view && view.model && typeof view.model.fetch === 'function') {
        view.model.fetch();
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'fallback fetch threw', e);
    }
  }

  function applySilentRegroup(records) {
    var groupMap = buildGroupHeaderMap();
    var domNow = captureDomSnapshot();
    var apiNow = snapshotFromResponse(records);
    var moves = 0;
    var skipped = 0;

    var patchFn = window.SCW && window.SCW.deviceWorksheet && window.SCW.deviceWorksheet.patchCard;

    // First pass: validate that all moving rows have a destination group
    // in the current DOM. If even one destination is missing, bail to
    // model.fetch — we can't silently construct new L1 group headers.
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r || !r.id) continue;
      var wsTr = document.getElementById(r.id);
      if (!wsTr || !wsTr.classList.contains('scw-ws-row')) continue;
      var cur = domNow[r.id] || '';
      var want = apiNow[r.id] || '';
      if (cur === want) continue;

      var rawArr = r[GROUPING_FIELD + '_raw'];
      var newParentId = (Array.isArray(rawArr) && rawArr[0] && rawArr[0].id) ? rawArr[0].id : null;
      if (!newParentId) {
        fallbackFetch('record ' + r.id + ' has no parent id in response');
        return;
      }
      if (!groupMap[newParentId]) {
        fallbackFetch('destination group ' + newParentId + ' not in DOM (group currently empty)');
        return;
      }
    }

    // Second pass: apply moves + cell rewrites + model sync
    for (var j = 0; j < records.length; j++) {
      var rec = records[j];
      if (!rec || !rec.id) continue;
      var row = document.getElementById(rec.id);
      if (!row || !row.classList.contains('scw-ws-row')) { skipped++; continue; }

      var current = domNow[rec.id] || '';
      var target  = apiNow[rec.id] || '';

      if (current !== target) {
        var rawA = rec[GROUPING_FIELD + '_raw'];
        var destId = (Array.isArray(rawA) && rawA[0] && rawA[0].id) ? rawA[0].id : null;
        var destHeader = destId ? groupMap[destId] : null;
        if (destHeader) {
          if (moveRowTriple(row, destHeader)) moves++;
          updateField2381Cell(row, rec);
          syncModelRecord(rec.id, rec);
        }
      }

      // Always sync other cell contents (fees, labels, calcs, inputs)
      if (typeof patchFn === 'function') {
        try { patchFn(VIEW_ID, rec.id, rec, { skipFocused: true }); }
        catch (e) { console.warn(LOG_PREFIX, 'patchCard threw for ' + rec.id, e); }
      }
    }

    log('silent regroup: ' + moves + ' moved, ' + skipped + ' skipped, ' + records.length + ' total');
  }

  // ======================================================================
  // Polling core
  // ======================================================================

  function buildRecordsUrl() {
    if (typeof Knack === 'undefined' || !Knack.router || !Knack.router.current_scene_key) return null;
    return Knack.api_url +
      '/v1/pages/' + Knack.router.current_scene_key +
      '/views/' + VIEW_ID + '/records?rows_per_page=1000';
  }

  function poll() {
    pollTimer = null;
    if (!active) return;
    if (pollsRemaining <= 0) { log('max polls reached — stop'); return stop(); }
    if (inFlight)            { log('previous request still in flight — skip'); return scheduleNext(); }

    var url = buildRecordsUrl();
    if (!url) { log('no URL — stop'); return stop(); }
    if (!window.SCW || typeof window.SCW.knackAjax !== 'function') {
      log('SCW.knackAjax unavailable — stop');
      return stop();
    }
    if (!document.getElementById(VIEW_ID)) { log('view gone — stop'); return stop(); }

    inFlight = true;
    pollsRemaining--;

    window.SCW.knackAjax({
      type: 'GET',
      url: url,
      dataType: 'json',
      success: function (resp) {
        inFlight = false;
        if (!active) return;

        var records = (resp && resp.records) || [];
        var snap = snapshotFromResponse(records);

        var stableNow = snapshotsEqual(snap, lastSnapshot);
        var dirtyNow  = isDirty(domBaseline, snap);

        log('poll ok — ' + records.length + ' records, dirty=' + dirtyNow + ', stable=' + stableNow);

        if (stableNow) stableStreak++;
        else           stableStreak = 0;
        lastSnapshot = snap;

        if (stableStreak >= STABLE_CYCLES) {
          if (dirtyNow) {
            log('webhook done — applying silent regroup');
            applySilentRegroup(records);
          } else {
            log('webhook done — no DOM changes needed');
          }
          return stop();
        }
        scheduleNext();
      },
      error: function (xhr) {
        inFlight = false;
        if (!active) return;
        log('poll error ' + (xhr && xhr.status));
        scheduleNext();
      }
    });
  }

  function scheduleNext() {
    if (!active) return;
    if (pollsRemaining <= 0) return stop();
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, POLL_INTERVAL);
  }

  function stop() {
    active         = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    pollsRemaining = 0;
    stableStreak   = 0;
    lastSnapshot   = null;
    domBaseline    = null;
    inFlight       = false;
  }

  function startPolling(preservedBaseline) {
    domBaseline = preservedBaseline || captureDomSnapshot();
    log('start polling (' + MAX_POLLS + ' polls @ ' + POLL_INTERVAL + 'ms), baseline rows=' + Object.keys(domBaseline).length);
    active         = true;
    pollsRemaining = MAX_POLLS;
    stableStreak   = 0;
    lastSnapshot   = null;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, START_DELAY);
  }
  // Legacy alias used by the DevTools debug hook
  var start = startPolling;

  // ======================================================================
  // Trigger + settle coordinator
  // ----------------------------------------------------------------------
  // Observed timing (from the diagnostic run):
  //   1. User confirms field_2380 inline-edit
  //   2. device-worksheet patches card display
  //   3. knack-cell-update.view_3505 fires with the record (field_2381 STILL OLD
  //      because the Make webhook is async)
  //   4. Knack natively re-renders view_3505 within ~50-250ms from its cached
  //      model data → old knack-view-render handler used to call stop() here
  //      and killed the poll loop before a single poll could fire
  //   5. Make webhook finishes over the next N seconds and rewrites field_2381
  //      on one or more records in the database
  //
  // We cannot prevent step 4 — it's Knack's native post-edit behavior.
  // Instead, we use a debounced settle detector:
  //   - On knack-cell-update we snapshot the PRE-render DOM baseline
  //     synchronously (before step 4 wipes the DOM nodes) and arm the
  //     settle timer.
  //   - Every subsequent knack-view-render.view_3505 RESETS the settle
  //     timer rather than killing it. After SETTLE_MS of render silence,
  //     the poll loop starts with the captured pre-render baseline.
  //   - A re-render that happens DURING active polling means our in-progress
  //     moves may have been wiped by Knack. Save the baseline, stop the
  //     poll loop, and restart the settle cycle.
  // ======================================================================

  var SETTLE_MS = 400;
  var settleTimer = null;
  var pendingBaseline = null;
  var inEditCycle = false;

  function armSettle() {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(onSettled, SETTLE_MS);
  }

  function onSettled() {
    settleTimer = null;
    var baseline = pendingBaseline;
    pendingBaseline = null;
    inEditCycle = false;
    if (!baseline) return;
    log('settled — starting poll loop');
    startPolling(baseline);
  }

  function beginEditCycle() {
    if (!inEditCycle) {
      pendingBaseline = captureDomSnapshot();
      inEditCycle = true;
      log('captured pre-render baseline (rows=' + Object.keys(pendingBaseline).length + ')');
    }
    armSettle();
  }

  $(document).on('knack-cell-update.' + VIEW_ID + '.scwSilentPoll', function (event, view, record) {
    try {
      log('knack-cell-update fired', { recordId: record && record.id });

      // Fast path: if the event record already has a new field_2381 (some
      // server-side record rule fired synchronously), apply it immediately.
      // For the async Make-webhook case this branch is a no-op.
      if (record && record.id) {
        var nowSnap = captureDomSnapshot();
        var eventSnap = snapshotFromResponse([record]);
        var eventKey = eventSnap[record.id];
        if (eventKey != null && eventKey !== (nowSnap[record.id] || '')) {
          log('event record has dirty ' + GROUPING_FIELD +
              ' (DOM="' + (nowSnap[record.id] || '') + '" → event="' + eventKey + '") — immediate regroup');
          applySilentRegroup([record]);
        }
      }

      beginEditCycle();
    } catch (e) {
      console.warn(LOG_PREFIX, 'knack-cell-update handler threw', e);
    }
  });

  // Re-render coordination: DO NOT stop polling on a stray render. If we
  // are still in an edit cycle (waiting to settle), reset the timer. If
  // polling is active, assume our moves were wiped by the render, stash
  // the baseline, stop the loop, and re-arm the settle cycle.
  $(document).on('knack-view-render.' + VIEW_ID + '.scwSilentPoll', function () {
    if (inEditCycle) {
      log('view re-rendered during edit cycle — resetting settle timer');
      armSettle();
      return;
    }
    if (active) {
      log('view re-rendered mid-poll — saving baseline, stopping poll, re-arming settle');
      var saved = domBaseline;
      stop();
      pendingBaseline = saved;
      inEditCycle = true;
      armSettle();
      return;
    }
    // Unrelated render (e.g. navigating to the scene) — nothing to do.
  });

  // Public debug hooks — poke these from DevTools to force-run without
  // needing to reproduce an inline edit.
  window.SCW = window.SCW || {};
  window.SCW.silentPollView3505 = {
    start: startPolling,
    stop: stop,
    captureDomSnapshot: captureDomSnapshot,
    buildGroupHeaderMap: buildGroupHeaderMap,
    applySilentRegroup: applySilentRegroup,
    beginEditCycle: beginEditCycle,
    inspectState: function () {
      return {
        active: active,
        inEditCycle: inEditCycle,
        pollsRemaining: pollsRemaining,
        stableStreak: stableStreak,
        hasPendingBaseline: pendingBaseline != null,
        hasDomBaseline: domBaseline != null,
        hasSettleTimer: settleTimer != null,
        hasPollTimer: pollTimer != null
      };
    }
  };
  log('installed — trigger=' + TRIGGER_FIELD + ', view=' + VIEW_ID);
})();
/*** END FEATURE: Silent poll + silent regroup after field_2380 inline-edit on view_3505 ************/
