/**************************************************************************************************
 * FEATURE: Silent poll after field_2380 inline-edit on view_3505
 *
 * Context:
 *   - Knack's native inline-edit record rule on field_2380 (view_3505)
 *     triggers a Make webhook.
 *   - The webhook updates OTHER, already-connected records in the same
 *     grid via the Knack REST API (it does NOT create new records).
 *   - Those updates land asynchronously, AFTER Knack's PUT response, so
 *     the user would otherwise need to hard-refresh to see them.
 *
 * Strategy:
 *   - Watch `ajaxComplete` for successful PUTs to view_3505/records/* whose
 *     request body includes field_2380.
 *   - Start a silent polling loop that GETs the view's records endpoint
 *     and, for every returned record, calls
 *     `SCW.deviceWorksheet.patchCard(viewId, recordId, record, { skipFocused: true })`.
 *   - `patchCard` only touches text nodes, input values, and chips inside
 *     the existing worksheet cards — no DOM restructure, no re-render, no
 *     accordion flicker. Inputs the user is currently typing in are left
 *     alone (skipFocused).
 *   - Stop when the record payload hash is unchanged for 2 consecutive
 *     polls (webhook is done), when a hard timeout expires, or when the
 *     view re-renders for an unrelated reason (we hand control back).
 *
 * Tunables live in the CONFIG block below.
 **************************************************************************************************/
(function silentPollView3505() {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  var VIEW_ID         = 'view_3505';
  var TRIGGER_FIELD   = 'field_2380';
  var POLL_INTERVAL   = 1500;   // ms between polls
  var STABLE_CYCLES   = 2;      // consecutive unchanged cycles → stop
  var MAX_POLLS       = 15;     // hard cap (~22s)
  var START_DELAY     = 400;    // ms to wait after PUT response before first poll
  var LOG_PREFIX      = '[scw-silent-poll.' + VIEW_ID + ']';

  // ======================
  // STATE
  // ======================
  var pollTimer       = null;
  var pollsRemaining  = 0;
  var stableStreak    = 0;
  var lastHash        = null;
  var inFlight        = false;

  function log() {
    if (!window.SCW || !window.SCW.DEBUG_SILENT_POLL) return;
    try { console.log.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch (e) {}
  }

  // ======================
  // Hash a record payload so we can detect stability.
  // We intentionally hash ALL field keys in the response so any change
  // (label, fee, calculated, etc.) resets the stable streak.
  // ======================
  function hashRecords(records) {
    if (!records || !records.length) return '0:0';
    var parts = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r || !r.id) continue;
      var keys = Object.keys(r).sort();
      var buf = r.id + '|';
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        // Skip meta/internal keys
        if (key.charAt(0) === '_') continue;
        var v = r[key];
        if (v == null) { buf += key + '=;'; continue; }
        if (typeof v === 'object') {
          try { buf += key + '=' + JSON.stringify(v) + ';'; }
          catch (e) { buf += key + '=?;'; }
        } else {
          buf += key + '=' + String(v) + ';';
        }
      }
      parts.push(buf);
    }
    return parts.length + ':' + parts.join('\n').length + ':' + simpleHash(parts.join('\n'));
  }

  function simpleHash(s) {
    // Tiny non-cryptographic hash — plenty for change detection.
    var h = 0, i, c;
    if (!s) return 0;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      h = ((h << 5) - h) + c;
      h |= 0;
    }
    return h;
  }

  // ======================
  // Build the view-records GET URL, respecting the current scene key.
  // ======================
  function buildRecordsUrl() {
    if (typeof Knack === 'undefined' || !Knack.router || !Knack.router.current_scene_key) return null;
    // rows_per_page=1000 is well above any expected grid size; Knack caps
    // at 1000 so this is effectively "everything the view exposes".
    return Knack.api_url +
      '/v1/pages/' + Knack.router.current_scene_key +
      '/views/' + VIEW_ID + '/records?rows_per_page=1000';
  }

  // ======================
  // Patch every returned record into its worksheet card.
  // patchCard is a no-op if the card isn't present, so records outside
  // the visible page are harmlessly skipped.
  // ======================
  function patchAll(records) {
    if (!records || !records.length) return 0;
    var patchFn = window.SCW && window.SCW.deviceWorksheet && window.SCW.deviceWorksheet.patchCard;
    if (typeof patchFn !== 'function') {
      log('patchCard unavailable — aborting');
      return 0;
    }
    var count = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r || !r.id) continue;
      try {
        patchFn(VIEW_ID, r.id, r, { skipFocused: true });
        count++;
      } catch (e) {
        console.warn(LOG_PREFIX, 'patchCard threw for ' + r.id, e);
      }
    }
    return count;
  }

  // ======================
  // One poll cycle: GET records, hash, patch, decide whether to continue.
  // ======================
  function poll() {
    pollTimer = null;
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
        var records = (resp && resp.records) || [];
        var hash = hashRecords(records);
        log('poll ok — ' + records.length + ' records, hash=' + hash);

        patchAll(records);

        if (hash === lastHash) {
          stableStreak++;
          if (stableStreak >= STABLE_CYCLES) {
            log('stable for ' + stableStreak + ' cycles — stop');
            return stop();
          }
        } else {
          stableStreak = 0;
          lastHash = hash;
        }
        scheduleNext();
      },
      error: function (xhr) {
        inFlight = false;
        log('poll error ' + (xhr && xhr.status));
        // Keep trying until the poll budget runs out.
        scheduleNext();
      }
    });
  }

  function scheduleNext() {
    if (pollsRemaining <= 0) return stop();
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, POLL_INTERVAL);
  }

  function stop() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    pollsRemaining = 0;
    stableStreak   = 0;
    lastHash       = null;
    inFlight       = false;
  }

  function start() {
    log('start polling (' + MAX_POLLS + ' polls @ ' + POLL_INTERVAL + 'ms)');
    // Reset state but keep any in-flight request; scheduleNext will skip if needed.
    if (pollTimer) clearTimeout(pollTimer);
    pollsRemaining = MAX_POLLS;
    stableStreak   = 0;
    lastHash       = null;
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

  // If the view is re-rendered for any reason (e.g. the user triggered a
  // real refresh) abandon the current poll — patchCard would target stale
  // cards anyway, and transformView rebuilds from scratch.
  $(document).on('knack-view-render.' + VIEW_ID + '.scwSilentPoll', function () {
    if (pollsRemaining > 0) log('view re-rendered — stop');
    stop();
  });
})();
/*** END FEATURE: Silent poll after field_2380 inline-edit on view_3505 ************************/
