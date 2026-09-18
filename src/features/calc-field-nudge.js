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
    // nudge PUT with the user's session. view_4112 is the sub portal's CO
    // worksheet (scene_1374 analogue of view_4079) — CO lines are Make-
    // created, so the stuck-calc state shows up there too; the sub never
    // SEES the fee (laborOnly hides it) but the nudge still heals the
    // record for ops/client pricing.
    views: ['view_3962', 'view_3586', 'view_3921', 'view_3610', 'view_4079',
            'view_4112'],

    // The equation field we watch for the stuck-blank state.
    calcField: 'field_2028',        // INSTALL FEE CALC_installation price extended

    // Row is "clearly priced" (calc SHOULD have computed) when any of these
    // has a value — keeps legitimately-blank rows (bare assumptions) quiet.
    evidenceFields: ['field_1949',  // product connection
                     'field_2150'], // sub bid

    // The install fee is a markup over these inputs, so ANY of them being
    // positive means the fee CANNOT legitimately be zero. A calc reading 0
    // alongside a positive input here is the stuck state Knack stores on
    // API-created records (it writes 0, not blank, when the initial
    // equation pass never ran).
    positiveInputs: ['field_2150',  // sub bid
                     'field_1973',  // +Hrs
                     'field_1974'], // +Mat

    // Nudge body: the first of these present on the record is re-sent with
    // its CURRENT value — any update triggers the recalc. SCW Notes leads
    // because it's inline-editable on every configured grid (qty/product
    // are read-only columns on view_3921, and a view-based PUT can reject
    // fields the view doesn't allow editing).
    nudgeFields: ['field_1953',     // SCW notes (text — editable everywhere)
                  'field_1964',     // qty (number)
                  'field_1949'],    // product (connection)

    maxPerSweep:   20,
    // Hard ceiling per PAGE LOAD across all sweeps. The post-nudge refetch
    // re-renders the view, which schedules another sweep, which nudges the
    // NEXT maxPerSweep records — on a grid with many stuck rows that
    // cascaded into 60+ PUTs and repeated grid rebuilds under the user
    // (observed live 2026-08-05). The ceiling stops the cascade.
    maxPerLoad:    40,
    maxConcurrent: 3,
    maxAttempts:   4,
    baseBackoffMs: 500,
    sweepDebounceMs: 1500,
    // Cross-page-load cooldowns (localStorage). A nudged record isn't
    // re-nudged for retryCooldownMs; a record that STAYED stuck after a
    // nudge clearly can't be healed this way (legitimately $0, or a deeper
    // data issue) and is left alone for stickyCooldownMs — without this,
    // every page load by every user re-nudged the same records forever.
    retryCooldownMs:  24 * 3600 * 1000,        // 1 day
    stickyCooldownMs: 30 * 24 * 3600 * 1000    // 30 days
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

  /** Numeric read of a currency/number field: raw first, display fallback
   *  ($ and commas stripped). NaN when the field holds no number at all. */
  function numOf(attrs, fieldKey) {
    var raw = attrs[fieldKey + '_raw'];
    if (typeof raw === 'number') return raw;
    if (!isBlank(raw) && !Array.isArray(raw)) {
      var n = parseFloat(String(raw).replace(/[$,\s]/g, ''));
      if (!isNaN(n)) return n;
    }
    var disp = String(attrs[fieldKey] == null ? '' : attrs[fieldKey])
      .replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').replace(/[$,\s]/g, '');
    if (!disp) return NaN;
    var d = parseFloat(disp);
    return isNaN(d) ? NaN : d;
  }

  /** Stuck-state classifier for the calc field:
   *    'blank' — the record carries the key but no value at all (equation
   *              never ran, stored empty)
   *    'zero'  — the calc reads 0 (how Knack stores a never-run equation on
   *              API-created records). Only meaningful when a positive input
   *              proves the true fee can't be 0 — the sweep checks that.
   *    null    — calculated (any non-zero number), or the view doesn't
   *              expose the column. */
  function stuckState(attrs) {
    var k = CONFIG.calcField;
    if (!(k in attrs) && !((k + '_raw') in attrs)) return null;
    var n = numOf(attrs, k);
    if (isNaN(n)) return 'blank';
    if (n === 0)  return 'zero';
    return null;
  }

  /** True when any fee input (sub bid / +Hrs / +Mat) is a positive number —
   *  the proof that a zero calc is stuck rather than legitimately $0. */
  function hasPositiveInput(attrs) {
    for (var i = 0; i < CONFIG.positiveInputs.length; i++) {
      var n = numOf(attrs, CONFIG.positiveInputs[i]);
      if (!isNaN(n) && n > 0) return true;
    }
    return false;
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

  // ── persistent nudge memory (cross page-load, localStorage) ─────
  var MEMO_KEY = 'scwCalcNudgeMemo';
  var memo = (function () {
    try {
      var m = JSON.parse(localStorage.getItem(MEMO_KEY) || '{}') || {};
      var now = Date.now();
      var pruned = {};
      for (var k in m) {
        if (m[k] && (now - (m[k].t || 0)) < CONFIG.stickyCooldownMs) pruned[k] = m[k];
      }
      return pruned;
    } catch (e) { return {}; }
  })();
  function memoSave() {
    try { localStorage.setItem(MEMO_KEY, JSON.stringify(memo)); } catch (e) {}
  }
  function memoCooldownActive(id) {
    var e = memo[id];
    if (!e) return false;
    return (Date.now() - (e.t || 0)) <
      (e.sticky ? CONFIG.stickyCooldownMs : CONFIG.retryCooldownMs);
  }

  // ── nudge queue: concurrency-capped + retry + backoff ───────────
  var nudgedOnce = Object.create(null);   // recordId → true (per page load)
  var nudgedThisLoad = 0;                 // total across sweeps (maxPerLoad)
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
    var memoDirty = false;
    for (var i = 0; i < attrsList.length; i++) {
      var attrs = attrsList[i];
      var state = stuckState(attrs);
      var stuck = false;
      if (state === 'zero') {
        // A zero calc is only provably stuck when a fee input is positive
        // (fee = markup over sub bid / +Hrs / +Mat, so input > 0 ⇒ fee > 0).
        stuck = hasPositiveInput(attrs);
      } else if (state === 'blank') {
        // Blank calc: nudge when the row clearly should have priced.
        for (var e = 0; e < CONFIG.evidenceFields.length; e++) {
          if (fieldHasValue(attrs, CONFIG.evidenceFields[e])) { stuck = true; break; }
        }
      }
      if (!stuck) continue;
      if (nudgedOnce[attrs.id]) {
        // Nudged THIS load and still stuck after the refetch — the nudge
        // can't heal it (legitimately $0, or a deeper data issue). Mark it
        // sticky so no page load re-nudges it for stickyCooldownMs.
        if (!memo[attrs.id] || !memo[attrs.id].sticky) {
          memo[attrs.id] = { t: Date.now(), sticky: true };
          memoDirty = true;
        }
        continue;
      }
      if (memoCooldownActive(attrs.id)) continue;
      if (nudgedThisLoad + jobs.length >= CONFIG.maxPerLoad) break;
      var body = buildNudgeBody(attrs);
      if (!body) continue;
      jobs.push({ viewKey: viewKey, recordId: attrs.id, body: body, attempt: 1 });
      if (jobs.length >= CONFIG.maxPerSweep) break;
    }
    if (!jobs.length) {
      if (memoDirty) memoSave();
      return;
    }

    // Always announce a nudge batch (not debug-gated) — the write is real,
    // so it should be visible in the console when verifying the feature.
    // The full record-id list is debug-only noise.
    console.info('[scw-calc-nudge] nudging ' + jobs.length +
      ' stuck record(s) on ' + viewKey +
      (CONFIG.debug ? ': ' + jobs.map(function (j) { return j.recordId; }).join(', ') : ''));

    var pending = jobs.length;
    var anyOk = false;
    function onDone(ok) {
      if (ok) anyOk = true;
      pending--;
      if (pending === 0 && anyOk) scheduleRefetch(viewKey);
    }
    for (var j = 0; j < jobs.length; j++) {
      nudgedOnce[jobs[j].recordId] = true;
      nudgedThisLoad++;
      memo[jobs[j].recordId] = { t: Date.now() };
      jobs[j].done = onDone;
      queue.push(jobs[j]);
    }
    memoSave();
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
