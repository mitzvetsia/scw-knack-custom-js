/**************************************************************************************************
 * FEATURE: Silent poll after field_2380 inline-edit on view_3505
 *
 * Context:
 *   - Knack's native inline-edit record rule on field_2380 (view_3505)
 *     triggers a Make webhook.
 *   - The webhook updates OTHER, already-connected records in the same
 *     grid via the Knack REST API. The key change is to field_2381
 *     (REL_DROP → parent networking device), which is the L1 GROUPING
 *     key for the worksheet view. In other words: the webhook moves
 *     existing rows between MDF/IDF groups.
 *   - Those updates land asynchronously, AFTER Knack's PUT response, so
 *     the user would otherwise need to hard-refresh to see them.
 *
 * Strategy:
 *   - When a successful PUT to view_3505/records/* containing field_2380
 *     is observed, capture a DOM baseline of every row's current
 *     field_2381 connection-id set (read out of the
 *     span[data-kn="connection-value"] classNames, which hold the 24-hex
 *     record IDs).
 *   - Poll the view's records endpoint. For each response, build an
 *     equivalent snapshot from field_2381_raw arrays.
 *   - Detect:
 *       * dirty   → any record's field_2381 set differs from baseline
 *       * stable  → the snapshot is identical to the previous poll's
 *                   snapshot for N consecutive cycles
 *     When dirty AND stable, do exactly ONE full view refresh via
 *     Knack.views[VIEW_ID].model.fetch(). The existing preservation
 *     machinery (group-collapse localStorage, preserve-scroll-on-refresh
 *     coordinator, device-worksheet captureState/refresh) restores the
 *     accordion/expanded/scroll state after the re-render.
 *   - We do NOT call patchCardFromResponse per record here — that would
 *     touch every card on every poll and paint-flash the view, and it
 *     cannot move rows between group headers anyway.
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
  var POLL_INTERVAL   = 1500;           // ms between polls
  var STABLE_CYCLES   = 2;              // consecutive unchanged cycles → webhook done
  var MAX_POLLS       = 20;             // hard cap (~30s)
  var START_DELAY     = 500;            // ms to wait after PUT response before first poll
  var LOG_PREFIX      = '[scw-silent-poll.' + VIEW_ID + ']';

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
    if (!window.SCW || !window.SCW.DEBUG_SILENT_POLL) return;
    try { console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch (e) {}
  }

  // ======================
  // Snapshot helpers
  // ----------------------
  // A "snapshot" is { recordId: "id1,id2,..." } where the value is the
  // sorted, comma-joined list of 24-hex record IDs that record is
  // connected to via field_2381. Comparing two snapshots with === on
  // the joined strings tells us whether any row's grouping connections
  // have changed.
  // ======================

  var HEX24 = /^[0-9a-f]{24}$/i;

  function sortedIdString(ids) {
    if (!ids || !ids.length) return '';
    // copy before sorting so we don't mutate caller arrays
    var copy = ids.slice();
    copy.sort();
    return copy.join(',');
  }

  /**
   * Walk the live view_3505 DOM and extract each record row's current
   * field_2381 connection IDs from the span[data-kn="connection-value"]
   * classNames.
   */
  function captureDomBaseline() {
    var snap = {};
    var view = document.getElementById(VIEW_ID);
    if (!view) return snap;

    var rows = view.querySelectorAll('tr.scw-ws-row[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var recordId = tr.id;
      if (!HEX24.test(recordId)) continue;

      var cell = tr.querySelector('td.' + GROUPING_FIELD);
      if (!cell) { snap[recordId] = ''; continue; }

      var spans = cell.querySelectorAll('span[data-kn="connection-value"]');
      var ids = [];
      for (var s = 0; s < spans.length; s++) {
        // Knack writes each connected record's 24-hex ID as a className
        // on the connection-value span. There may be other classes too,
        // so walk the classList looking for the hex pattern.
        var classes = spans[s].classList;
        for (var c = 0; c < classes.length; c++) {
          if (HEX24.test(classes[c])) { ids.push(classes[c]); break; }
        }
      }
      snap[recordId] = sortedIdString(ids);
    }
    return snap;
  }

  /**
   * Build an equivalent snapshot from a records API response payload.
   * Prefers field_2381_raw (array of {id, identifier}), falls back to
   * parsing HTML out of field_2381 if _raw isn't present.
   */
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
        // Defensive fallback: parse 24-hex substrings out of any HTML.
        var m = r[GROUPING_FIELD].match(/[0-9a-f]{24}/gi);
        if (m) ids = m;
      }
      snap[r.id] = sortedIdString(ids);
    }
    return snap;
  }

  /** True if two snapshots have identical { recordId → joinedIds } shape. */
  function snapshotsEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    var ka = Object.keys(a);
    var kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      var key = ka[i];
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (a[key] !== b[key]) return false;
    }
    return true;
  }

  /**
   * True if ANY record shared between baseline and current has a
   * different joinedIds value. Records that exist only in one side
   * also count as dirty (row added/removed from the visible set).
   */
  function isDirty(baseline, current) {
    if (!baseline || !current) return false;
    var bk = Object.keys(baseline);
    var ck = Object.keys(current);
    // If every baseline record is present in current with the same
    // joined string AND current has no extra records, we're clean.
    if (bk.length !== ck.length) return true;
    for (var i = 0; i < bk.length; i++) {
      var key = bk[i];
      if (!Object.prototype.hasOwnProperty.call(current, key)) return true;
      if (baseline[key] !== current[key]) return true;
    }
    return false;
  }

  // ======================
  // Build the view-records GET URL, respecting the current scene key.
  // ======================
  function buildRecordsUrl() {
    if (typeof Knack === 'undefined' || !Knack.router || !Knack.router.current_scene_key) return null;
    return Knack.api_url +
      '/v1/pages/' + Knack.router.current_scene_key +
      '/views/' + VIEW_ID + '/records?rows_per_page=1000';
  }

  // ======================
  // Trigger the single full refresh once we've decided the webhook is done.
  // Capture the current expanded-panel state first so device-worksheet can
  // restore it after the re-render, same path used by the normal refresh
  // coordinator.
  // ======================
  function triggerRefresh() {
    log('dirty+stable → triggering model.fetch()');
    try {
      if (window.SCW && window.SCW.deviceWorksheet && typeof window.SCW.deviceWorksheet.captureState === 'function') {
        window.SCW.deviceWorksheet.captureState();
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'captureState threw', e);
    }

    try {
      var view = Knack.views && Knack.views[VIEW_ID];
      if (view && view.model && typeof view.model.fetch === 'function') {
        view.model.fetch();
      } else {
        log('Knack.views[' + VIEW_ID + '].model.fetch not available — nothing to do');
      }
    } catch (e) {
      console.warn(LOG_PREFIX, 'model.fetch threw', e);
    }
  }

  // ======================
  // One poll cycle: GET records, snapshot, compare, decide.
  // ======================
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

    // Bail if the user has navigated away from the view.
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

        if (stableNow) {
          stableStreak++;
        } else {
          stableStreak = 0;
        }
        lastSnapshot = snap;

        if (dirtyNow && stableStreak >= STABLE_CYCLES) {
          log('webhook done — stable for ' + stableStreak + ' cycles and dirty vs baseline');
          triggerRefresh();
          return stop();
        }

        scheduleNext();
      },
      error: function (xhr) {
        inFlight = false;
        if (!active) return;
        log('poll error ' + (xhr && xhr.status));
        // Keep trying until the poll budget runs out.
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

  function start() {
    // Capture the baseline BEFORE any polling, so even very fast webhook
    // updates that land before poll #1 still register as "dirty".
    domBaseline = captureDomBaseline();
    log('start polling (' + MAX_POLLS + ' polls @ ' + POLL_INTERVAL + 'ms), baseline rows=' + Object.keys(domBaseline).length);

    active         = true;
    pollsRemaining = MAX_POLLS;
    stableStreak   = 0;
    lastSnapshot   = null;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, START_DELAY);
  }

  // ======================
  // Detect inline-edit PUTs that include field_2380.
  // ajaxComplete fires after the response — perfect for "start polling
  // once Knack has saved the value and queued the webhook".
  // ======================
  $(document).ajaxComplete(function (event, xhr, settings) {
    if (!settings || settings.type !== 'PUT') return;
    var url = settings.url || '';
    if (url.indexOf('/views/' + VIEW_ID + '/records/') === -1) return;
    if (!xhr || xhr.status < 200 || xhr.status >= 300) return;

    // Parse the request body — may be a JSON string or an object.
    var body = settings.data;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || typeof body !== 'object') return;
    if (!Object.prototype.hasOwnProperty.call(body, TRIGGER_FIELD)) return;

    log('trigger PUT observed (' + TRIGGER_FIELD + ')');
    start();
  });

  // If the view is re-rendered for any reason (including the model.fetch
  // we triggered ourselves) stop polling. For our own fetch this is the
  // correct terminal state; for unrelated re-renders the poll would be
  // targeting stale data anyway.
  $(document).on('knack-view-render.' + VIEW_ID + '.scwSilentPoll', function () {
    if (active) log('view re-rendered — stop');
    stop();
  });
})();
/*** END FEATURE: Silent poll after field_2380 inline-edit on view_3505 ************************/
