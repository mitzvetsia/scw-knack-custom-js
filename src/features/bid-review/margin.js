/*** BID REVIEW — PROJECT MARGIN (recovery target + write) ********************
 *
 * The "Margin is low" recovery block (bid-review/render.js status bar on the
 * reconcile page; ops-review-pill.js on the ops SOW list) offers "Increase
 * project margin to X%". Everything about that number and about SAVING it
 * lives here, once:
 *
 *   • target(subBidTotal, surveyCosts, opts) — the project margin that puts
 *     the SOW's margin on labor (field_2749, the figure Knack shows) back at
 *     the recovery target (CFG.marginRecoveryTarget, 12%). The project margin
 *     (field_2158) is a GROSS margin — install fee = sub bid / (1 − margin),
 *     the house formula in calc-install-fee-adjustment.js — and the margin on
 *     labor is what is left of that fee after the survey costs come out:
 *         labor margin = m − (C / S) × (1 − m)
 *     so the margin that lands at target t is  m* = (t + C/S) / (1 + C/S).
 *     When the row ALSO carries the current project margin, today's numbers
 *     are checked against that model — and against the plain markup model
 *     (fee = S × (1 + m)), the other way a margin field is sometimes defined
 *     — and whichever reproduces Knack's margin on labor is the one inverted.
 *     A row that fits neither logs the four numbers once, so the formula can
 *     be read off field_2749 in Builder instead of guessed at.
 *   • save(opts, done) — writes field_2158 through the hidden update form the
 *     page carries (CFG.marginWriteView, view_3923) with a VIEW-BASED PUT: to
 *     the SOW the button names when that form edits SOW records, else to the
 *     record the form is bound to (an "Update Installation Project" form edits
 *     the page's project). The response record proves the write landed — a
 *     view-scoped PUT answers 200 even when it ignored the field. This
 *     replaced the old flow (set the form's input, click its submit button,
 *     wait for knack-record-update, reload the page), which had stopped
 *     working on the reconcile page: the jQuery value + change never reached
 *     the form's model, so the 25 s watchdog reloaded a page with the old
 *     margin ("the button doesn't do anything", 2026-10-16).
 *   • rowSignature(sowId) — a hash of the SOW's next-step row (view_3918:
 *     survey costs, margin, sub bid total…). bid-review-v2 folds it into each
 *     SOW section's signature so a save that changes those numbers rebuilds
 *     the header instead of reusing the stale one (the "I have to refresh the
 *     page" of the same report).
 ***************************************************************************/
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG || {};

  function num(v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    var s = String(v).replace(/<[^>]*>/g, '').replace(/[^0-9.\-]/g, '');
    return s === '' ? NaN : parseFloat(s);
  }
  /** A margin read off a Knack percent field — "15.9%", "0.159" or 15.9 — as
   *  a decimal (0.159). Anything past ±150% is read as a percent number. */
  function toDecimal(v) {
    var n = num(v);
    if (!isFinite(n)) return null;
    if (Math.abs(n) > 1.5) n = n / 100;
    return n;
  }

  // r = survey costs / sub bid total.
  //   gross:  fee = S / (1 − m)  → labor margin = (fee − S − C) / fee = m − r (1 − m)
  //   markup: fee = S × (1 + m)  → labor margin = (fee − S − C) / fee = (m − r) / (1 + m)
  var MODELS = {
    gross:  { predict: function (m, r) { return m - r * (1 - m); },
              invert:  function (t, r) { return (t + r) / (1 + r); } },
    markup: { predict: function (m, r) { return (m - r) / (1 + m); },
              invert:  function (t, r) { return (t + r) / (1 - t); } }
  };
  var FIT_TOLERANCE = 0.015;   // 1.5 points — both displayed figures are rounded
  var _warned = Object.create(null);

  function recoveryTarget(override) {
    if (isFinite(override)) return override;
    var t = parseFloat(CFG.marginRecoveryTarget);
    return isFinite(t) ? t : 0.12;
  }

  /**
   * @param subBidTotal  the SOW's sub bid total (number or cell text)
   * @param surveyCosts  the SOW's survey costs (number or cell text; blank = 0)
   * @param opts         { currentMargin, observedMargin, target, sowId }
   * @returns null (nothing sensible to suggest) or
   *   { decimal, pct, pctLabel, model, fit, target, subBidTotal, surveyCosts,
   *     currentMargin, observedMargin }
   *   decimal is the value to WRITE — the labelled percent, so the stored
   *   margin reads exactly what the button promised.
   */
  function target(subBidTotal, surveyCosts, opts) {
    opts = opts || {};
    var S = num(subBidTotal), C = num(surveyCosts);
    if (!isFinite(S) || S <= 0) return null;
    if (!isFinite(C) || C < 0) C = 0;
    var t = recoveryTarget(opts.target);
    var r = C / S;
    var cur = toDecimal(opts.currentMargin), obs = toDecimal(opts.observedMargin);
    var model = 'gross', fit = null;
    if (cur != null && obs != null) {
      var dg = Math.abs(MODELS.gross.predict(cur, r) - obs);
      var dm = Math.abs(MODELS.markup.predict(cur, r) - obs);
      if (dg <= FIT_TOLERANCE || dm <= FIT_TOLERANCE) {
        model = dm < dg ? 'markup' : 'gross';
        fit = model;
      } else {
        var k = opts.sowId || '*';
        if (!_warned[k]) {
          _warned[k] = true;
          if (window.console && console.warn) {
            console.warn('[BidReview] margin on labor does not follow either margin model — ' +
              'read field_2749\'s formula in Builder and fix bid-review/margin.js MODELS.',
              { subBidTotal: S, surveyCosts: C, projectMargin: cur, marginOnLabor: obs,
                grossPredicts: MODELS.gross.predict(cur, r), markupPredicts: MODELS.markup.predict(cur, r) });
          }
        }
      }
    }
    var m = MODELS[model].invert(t, r);
    if (!isFinite(m) || m <= 0 || m >= 1) return null;
    var pct = Math.ceil(m * 1000 - 1e-9) / 10;          // up to the next 0.1%
    return {
      decimal: Math.round(pct * 100) / 10000,
      pct: pct,
      pctLabel: pct.toFixed(1),
      model: model,
      fit: fit,
      target: t,
      subBidTotal: S,
      surveyCosts: C,
      currentMargin: cur,
      observedMargin: obs
    };
  }

  function money(n) {
    var s = (Math.round(Math.abs(n) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '−$' : '$') + s;
  }
  function pctText(d) { return (Math.round(d * 1000) / 10).toFixed(1) + '%'; }
  /** The tooltip: what the number was computed from, so it can be checked. */
  function describe(t) {
    if (!t) return '';
    var s = 'Sub bid ' + money(t.subBidTotal) + ' + survey costs ' + money(t.surveyCosts) +
      ' → margin on labor back to ' + pctText(t.target) + ' after survey costs';
    if (t.observedMargin != null) {
      s += ' (now ' + pctText(t.observedMargin) +
        (t.currentMargin != null ? ', project margin ' + pctText(t.currentMargin) : '') + ')';
    }
    if (t.fit === 'markup') s += ' · install fee = sub bid × (1 + margin)';
    return s;
  }

  // ── Write ─────────────────────────────────────────────────────────────
  function viewObject(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      return (v && v.model && v.model.view && v.model.view.source && v.model.view.source.object) || '';
    } catch (e) { return ''; }
  }
  function formRecordId(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var m = v && v.model;
      if (!m) return '';
      var id = m.id || (m.attributes && m.attributes.id) ||
        (typeof m.get === 'function' ? m.get('id') : '') || '';
      return /^[a-f0-9]{24}$/i.test(String(id)) ? String(id) : '';
    } catch (e) { return ''; }
  }
  /** Which record the margin PUT addresses, and through which view.
   *  scope: 'sow'  — the SOW the button names (the form edits SOW records,
   *                  or it is bound to that very SOW);
   *         'form' — the record the form is bound to (project-level margin). */
  function resolveWriteTarget(sowId, writeView) {
    writeView = writeView || CFG.marginWriteView || 'view_3923';
    var formObj = viewObject(writeView), sowObj = viewObject(CFG.nextStepViewKey);
    var bound = formRecordId(writeView);
    var recordId, scope;
    if (sowId && formObj && sowObj && formObj === sowObj) { recordId = sowId; scope = 'sow'; }
    else if (bound) { recordId = bound; scope = (sowId && bound === sowId) ? 'sow' : 'form'; }
    else { recordId = sowId || ''; scope = 'sow'; }
    return { view: writeView, recordId: recordId, scope: scope, formObject: formObj, sowObject: sowObj };
  }

  /**
   * PUT the project margin. done(result) with
   *   { ok, reason: 'unavailable'|'no-record'|'http'|'ignored'|'', status,
   *     view, recordId, scope, decimal, resp }
   * 'ignored' = Knack answered 200 but the response record does not carry the
   * value (the field is not editable on the write view).
   */
  function save(opts, done) {
    opts = opts || {};
    done = typeof done === 'function' ? done : function () {};
    var fieldKey = CFG.projectMarginField || 'field_2158';
    var decimal = Math.round(num(opts.decimal) * 10000) / 10000;
    var tgt = resolveWriteTarget(opts.sowId, opts.writeView);
    var base = { view: tgt.view, recordId: tgt.recordId, scope: tgt.scope, decimal: decimal, status: 0, resp: null };
    if (!isFinite(decimal)) { done(mk(base, false, 'no-value')); return; }
    if (!window.SCW || typeof SCW.knackAjax !== 'function' || typeof SCW.knackRecordUrl !== 'function') {
      done(mk(base, false, 'unavailable')); return;
    }
    if (!tgt.recordId) { done(mk(base, false, 'no-record')); return; }
    var body = {};
    body[fieldKey] = decimal;
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(tgt.view, tgt.recordId),
      type: 'PUT',
      data: JSON.stringify(body),
      dataType: 'json',
      success: function (resp) {
        base.status = 200; base.resp = resp;
        var rec = resp && resp.record && typeof resp.record === 'object' ? resp.record : resp;
        if (rec && typeof rec === 'object' && Object.prototype.hasOwnProperty.call(rec, fieldKey + '_raw')) {
          var back = toDecimal(rec[fieldKey + '_raw']);
          if (back == null || Math.abs(back - decimal) > 0.0006) { done(mk(base, false, 'ignored')); return; }
        }
        if (typeof SCW.syncKnackModel === 'function') {
          try { SCW.syncKnackModel(tgt.view, tgt.recordId, resp, fieldKey, decimal); } catch (e) { /* best-effort */ }
        }
        done(mk(base, true, ''));
      },
      error: function (xhr) {
        base.status = (xhr && xhr.status) || 0;
        base.resp = xhr && xhr.responseText;
        done(mk(base, false, 'http'));
      }
    });
  }
  function mk(base, ok, reason) {
    var r = {};
    for (var k in base) r[k] = base[k];
    r.ok = ok; r.reason = reason;
    return r;
  }

  // ── Row signature (view_3918) ───────────────────────────────────────
  function rowSignature(sowId) {
    var viewKey = CFG.nextStepViewKey;
    if (!viewKey || !sowId) return '';
    var view = document.getElementById(viewKey);
    if (!view) return '';
    var tr = view.querySelector('tbody tr[id="' + sowId + '"]');
    if (!tr) return '';
    var s = (tr.textContent || '').replace(/\s+/g, ' ').trim();
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return s.length.toString(36) + '.' + (h >>> 0).toString(36);
  }

  ns.margin = {
    target: target,
    describe: describe,
    save: save,
    resolveWriteTarget: resolveWriteTarget,
    rowSignature: rowSignature,
    toDecimal: toDecimal,
    MODELS: MODELS
  };
  ns.marginTarget = target;
  ns.nextStepRowSignature = rowSignature;
})();
/*** END BID REVIEW — PROJECT MARGIN *****************************************/
