/***************************** CALC FIELD NUDGE (self-heal stuck equations) *****************************/
/*
 * Knack equation fields on API-created records (Make "Create a Record")
 * sometimes never run their initial calculation pass — the record sits with
 * a blank Install Fee (field_2028) until ANY edit touches it, because an
 * update is what re-fires Knack's calc engine.
 *
 * This module is the client-side safety net: on render of the configured
 * SOW-line-item views it scans the view's model for rows whose calc field is
 * BLANK while the row clearly has pricing inputs (product connection or a
 * sub bid), and queues a same-value "nudge" PUT for each through a
 * concurrency-capped retry queue. The PUT re-sends an existing field with
 * its current value — no data changes — which is enough to trigger a full
 * equation recalc on the record. After the nudges land, the view refetches
 * once so the computed fee shows without a manual reload.
 *
 * Guards:
 *   - each record is nudged at most ONCE per page load (a still-blank calc
 *     after a nudge is left alone — no retry loops on legitimately-blank rows)
 *   - rows whose attributes don't carry the calc field key at all are
 *     skipped (the view doesn't expose the column — nothing to detect)
 *   - per-sweep cap + ~3 concurrent PUTs + exponential backoff on transient
 *     failures only (Knack's ~10 req/s silent-429 limit)
 */
(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────
  var CONFIG = {
    debug: false,

    // SOW Line Item surfaces (the object field_2028 lives on). Each entry
    // is a view whose model we can scan AND whose record URL accepts the
    // nudge PUT with the user's session.
    views: ['view_3962', 'view_3586', 'view_3921', 'view_3610', 'view_4079'],

    // The equation field we watch for the stuck-blank state.
    calcField: 'field_2028',        // INSTALL FEE CALC_installation price extended

    // Row is "clearly priced" (calc SHOULD have computed) when any of these
    // has a value — keeps legitimately-blank rows (bare assumptions) quiet.
    evidenceFields: ['field_1949',  // product connection
                     'field_2150'], // sub bid

    // Nudge body: the first of these present on the record is re-sent with
    // its CURRENT value. Any update triggers the recalc; preferring an
    // equation input (qty, product) over notes is belt-and-braces.
    nudgeFields: ['field_1964',     // qty (number)
                  'field_1949',     // product (connection)
                  'field_1953'],    // SCW notes (text — always accepted)

    maxPerSweep:   20,
    maxConcurrent: 3,
    maxAttempts:   4,
    baseBackoffMs: 500,
    sweepDebounceMs: 1500
  };

  // ── helpers ─────────────────────────────────────────────────────
  function log() {
    if (!CONFIG.debug) return;
    var args = ['[scw-calc-nudge]'].concat([].slice.call(arguments));
    console.log.apply(console, args);
  }

  function getModelAttrs(viewKey) {
    var v = window.Knack && Knack.views && Knack.views[viewKey];
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return [];
    var out = [];
    for (var i = 0; i < models.length; i++) {
      var a = models[i].attributes || models[i];
      if (a && a.id) out.push(a);
    }
    return out;
  }

  function isBlank(v) {
    return v === undefined || v === null || v === '';
  }

  /** Raw-first read; connection raws are arrays of {id}. */
  function fieldHasValue(attrs, fieldKey) {
    var raw = attrs[fieldKey + '_raw'];
    if (Array.isArray(raw)) return raw.length > 0;
    if (!isBlank(raw)) return true;
    return !isBlank(attrs[fieldKey]) &&
           String(attrs[fieldKey]).replace(/&nbsp;/g, '').trim() !== '';
  }

  /** The calc is STUCK when the record carries the field key (the view
   *  exposes the column) but both raw and display are blank. A computed
   *  zero comes back as 0 / "0.00" — that's calculated, not stuck. */
  function calcIsStuck(attrs) {
    var k = CONFIG.calcField;
    if (!(k in attrs) && !((k + '_raw') in attrs)) return false;
    return isBlank(attrs[k + '_raw']) &&
           (isBlank(attrs[k]) ||
            String(attrs[k]).replace(/&nbsp;/g, '').trim() === '');
  }

  /** Same-value nudge body from the first available nudge field. */
  function buildNudgeBody(attrs) {
    for (var i = 0; i < CONFIG.nudgeFields.length; i++) {
      var k = CONFIG.nudgeFields[i];
      if (!(k in attrs) && !((k + '_raw') in attrs)) continue;
      var raw = attrs[k + '_raw'];
      var body = {};
      if (Array.isArray(raw)) {                      // connection — re-send ids
        var ids = [];
        for (var j = 0; j < raw.length; j++) {
          if (raw[j] && raw[j].id) ids.push(raw[j].id);
        }
        if (!ids.length) continue;
        body[k] = ids;
        return body;
      }
      if (!isBlank(raw)) { body[k] = raw; return body; }
      // Text fields accept re-sending the display value (even '').
      if (k === 'field_1953') { body[k] = attrs[k] || ''; return body; }
    }
    return null;
  }

  // ── nudge queue: concurrency-capped + retry + backoff ───────────
  var nudgedOnce = Object.create(null);   // recordId → true (per page load)
  var queue = [];
  var inFlight = 0;

  function isRetryable(xhr) {
    if (!xhr) return true;
    var s = xhr.status;
    return s === 0 || s === 408 || s === 429 || (s >= 500 && s <= 599);
  }

  function pump() {
    while (inFlight < CONFIG.maxConcurrent && queue.length) {
      var job = queue.shift();
      inFlight++;
      runJob(job);
    }
  }

  function runJob(job) {
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(job.viewKey, job.recordId),
      type: 'PUT',
      data: JSON.stringify(job.body),
      success: function () {
        inFlight--;
        job.done(true);
        pump();
      },
      error: function (xhr) {
        if (job.attempt < CONFIG.maxAttempts && isRetryable(xhr)) {
          var wait = CONFIG.baseBackoffMs * Math.pow(2, job.attempt - 1) +
                     Math.random() * 250;
          setTimeout(function () {
            job.attempt++;
            runJob(job);   // keeps its in-flight slot through the retry
          }, wait);
          return;
        }
        inFlight--;
        console.warn('[scw-calc-nudge] nudge PUT failed for ' + job.recordId +
          ' via ' + job.viewKey + ' (status ' + (xhr && xhr.status) + ')');
        job.done(false);
        pump();
      }
    });
  }

  // ── sweep ───────────────────────────────────────────────────────
  function sweep(viewKey) {
    if (!(window.SCW && typeof SCW.knackAjax === 'function' &&
          typeof SCW.knackRecordUrl === 'function')) return;
    var attrsList = getModelAttrs(viewKey);
    if (!attrsList.length) return;

    var jobs = [];
    for (var i = 0; i < attrsList.length; i++) {
      var attrs = attrsList[i];
      if (nudgedOnce[attrs.id]) continue;
      if (!calcIsStuck(attrs)) continue;
      var hasEvidence = false;
      for (var e = 0; e < CONFIG.evidenceFields.length; e++) {
        if (fieldHasValue(attrs, CONFIG.evidenceFields[e])) { hasEvidence = true; break; }
      }
      if (!hasEvidence) continue;
      var body = buildNudgeBody(attrs);
      if (!body) continue;
      jobs.push({ viewKey: viewKey, recordId: attrs.id, body: body, attempt: 1 });
      if (jobs.length >= CONFIG.maxPerSweep) break;
    }
    if (!jobs.length) return;

    log('nudging ' + jobs.length + ' stuck record(s) on ' + viewKey,
        jobs.map(function (j) { return j.recordId; }));

    var pending = jobs.length;
    var anyOk = false;
    function onDone(ok) {
      if (ok) anyOk = true;
      pending--;
      if (pending === 0 && anyOk) scheduleRefetch(viewKey);
    }
    for (var j = 0; j < jobs.length; j++) {
      nudgedOnce[jobs[j].recordId] = true;
      jobs[j].done = onDone;
      queue.push(jobs[j]);
    }
    pump();
  }

  /** One refetch after a nudge batch so the computed values surface.
   *  worksheet-v2 views go through refetchAndNotify (rebuilds the cards);
   *  anything else falls back to a plain model fetch. */
  function scheduleRefetch(viewKey) {
    setTimeout(function () {
      var ws = window.SCW && SCW.worksheetV2;
      if (ws && ws.data && typeof ws.data.refetchAndNotify === 'function' &&
          ws.cfg && typeof ws.cfg.viewCfg === 'function' && ws.cfg.viewCfg(viewKey)) {
        ws.data.refetchAndNotify(viewKey);
        return;
      }
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
    }, 1200);
  }

  // ── bind ────────────────────────────────────────────────────────
  var timers = Object.create(null);
  function scheduleSweep(viewKey) {
    if (timers[viewKey]) clearTimeout(timers[viewKey]);
    timers[viewKey] = setTimeout(function () {
      timers[viewKey] = 0;
      try { sweep(viewKey); }
      catch (e) { console.warn('[scw-calc-nudge] sweep failed for ' + viewKey, e); }
    }, CONFIG.sweepDebounceMs);
  }

  for (var i = 0; i < CONFIG.views.length; i++) {
    (function (viewKey) {
      $(document)
        .off('knack-view-render.' + viewKey + '.scwCalcNudge')
        .on('knack-view-render.' + viewKey + '.scwCalcNudge', function () {
          scheduleSweep(viewKey);
        });
    })(CONFIG.views[i]);
  }

  // Public seam (debug / manual sweep from the console).
  window.SCW = window.SCW || {};
  window.SCW.calcNudge = { sweep: sweep, config: CONFIG };
})();
/*** END CALC FIELD NUDGE ****************************************************/
