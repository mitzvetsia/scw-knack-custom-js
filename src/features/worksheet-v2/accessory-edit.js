/*** WORKSHEET V2 — ACCESSORY EDIT MODAL ***************************************
 * The accessories folded under a card (the Mounting Hardware chips: "Electrical
 * Box Mount … · − 1 + · unlink · trash") have no card of their own, so their
 * pricing fields were only reachable through the chip's link to Knack's native
 * edit page (CO page, 2026-10-30: "need to be able to edit the custom discount
 * % and custom discount $ on child / accessory records — right now it's opening
 * a knack native form. Can we just do a custom modal that pushes inline
 * edits?" + "I also need to be able to bulk edit those accessories").
 *
 * This modal is that, in two shapes that share one form:
 *   - ONE accessory — the chip click (init.js intercepts the chip anchor on an
 *     opted-in view): its facts (unit price, applied discount, net unit, line
 *     total — whatever the view serves, read-only), then Qty (when the
 *     accessory product allows multi-qty, the chip stepper's own rule),
 *     Custom discount %, Custom discount $ each, Discount reason. Save sends
 *     ONE view-based PUT carrying only the fields that changed.
 *   - MANY accessories — the bulk bar's "Edit accessories (N)" over the
 *     accessories of the SELECTED cards (bulk.js): a ticked list (accessory ·
 *     its parent · current qty / discounts), then the same discount fields. A
 *     blank field is left as it is on every accessory; 0 clears a discount.
 *     Apply sends one PUT per ticked accessory through a capped retry queue
 *     (2 in flight, 150 ms apart, 429 / 408 / 5xx / network backed off); the
 *     ones that failed stay ticked so Apply again re-sends only those.
 *
 * Writes are the same view-based PUTs the cards' own inputs make (edit.js):
 * SCW.knackRecordUrl(viewKey, id) with the session token, the local model
 * patched from the response (CALC fields included) and the worksheet
 * re-read. A 200 whose record still carries the OLD value is reported as
 * "not applied" instead of pretending — the Builder dependency: the columns
 * must be inline-editable on the view.
 *
 * Opt-in per view: `accessoryEdit: true` in worksheet-v2/config.js next to
 * the view's `lineDiscPct` / `lineDiscAmt` / `lineDiscReason` keys
 * (view_4079 today). Views without it keep the chip's native link.
 ******************************************************************************/
(function () {
  'use strict';
  window.SCW = window.SCW || {};
  var ns = SCW.worksheetV2 = SCW.worksheetV2 || {};

  var CONFIG = {
    MAX_CONCURRENT: 2,     // PUTs in flight (CLAUDE.md rate-limit rule)
    GAP_MS:         150,   // starts at least this far apart
    RETRY_ATTEMPTS: 4,
    RETRY_BASE_MS:  600,
    RETRY_MAX_MS:   6000
  };
  var STYLE_ID = 'scw-ws-v2-acc-edit-css';
  var FIELD_DEFS = [
    { key: 'lineDiscPct',    label: 'Custom discount %',      kind: 'number', hint: '%' },
    { key: 'lineDiscAmt',    label: 'Custom discount $ each', kind: 'number', hint: '$' },
    { key: 'lineDiscReason', label: 'Discount reason',        kind: 'text',   wide: true }
  ];
  var FACT_DEFS = [
    { key: 'retailPrice',     label: 'Unit price' },
    { key: 'appliedDiscount', label: 'Applied discount' },
    { key: 'netUnit',         label: 'Net unit' },
    { key: 'total',           label: 'Line total' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cfgFor(viewKey) {
    try { return (ns.cfg && typeof ns.cfg.viewCfg === 'function') ? ns.cfg.viewCfg(viewKey) : null; }
    catch (e) { return null; }
  }
  function fieldsFor(viewKey) {
    try { return (ns.cfg && typeof ns.cfg.fields === 'function') ? (ns.cfg.fields(viewKey) || {}) : {}; }
    catch (e) { return {}; }
  }
  /** The view opted in AND maps a discount field to edit. */
  function canOpen(viewKey) {
    var c = cfgFor(viewKey), F = fieldsFor(viewKey);
    return !!(c && c.accessoryEdit && (F.lineDiscPct || F.lineDiscAmt));
  }
  function records(viewKey) {
    try { return (ns.data && typeof ns.data.readRecords === 'function') ? (ns.data.readRecords(viewKey) || []) : []; }
    catch (e) { return []; }
  }
  function attrs(rec) { return rec ? (rec.attributes || rec) : null; }
  function recById(viewKey, id) {
    var list = records(viewKey);
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function parentKeyFor(viewKey) { return fieldsFor(viewKey).parent || 'field_2464'; }
  function idsOf(raw) {
    var out = [];
    if (Array.isArray(raw)) for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) out.push(raw[i].id);
    else if (raw && raw.id) out.push(raw.id);
    return out;
  }
  function clean(v) { return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
  function readText(rec, key) {
    var a = attrs(rec) || {};
    var raw = a[key + '_raw'];
    if (typeof raw === 'string') return clean(raw);
    return clean(a[key]);
  }
  /** A number off the record: the raw number, a numeric raw string, else the
   *  display value with every Knack negative format honoured ("-$2,500.00",
   *  "($2,500.00)", "2,500.00-"). NaN when blank. */
  function readNum(rec, key) {
    var a = attrs(rec) || {};
    var raw = a[key + '_raw'];
    if (typeof raw === 'number') return raw;
    var s = (typeof raw === 'string' && raw.trim() !== '') ? raw : (a[key] == null ? '' : a[key]);
    s = String(s).replace(/<[^>]*>/g, '').trim();
    if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || s.indexOf('-') !== -1;
    var digits = s.replace(/[^0-9.]/g, '');
    if (!digits) return NaN;
    var n = parseFloat(digits);
    return isFinite(n) ? (neg ? -n : n) : NaN;
  }
  function sameNum(a, b) {
    var x = (typeof a === 'number') ? a : parseFloat(a), y = (typeof b === 'number') ? b : parseFloat(b);
    if (isNaN(x) && isNaN(y)) return true;
    if (isNaN(x) || isNaN(y)) return false;
    return Math.abs(x - y) < 0.005;
  }
  function fmtMoney(n) {
    if (!isFinite(n)) return '—';
    var s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-$' : '$') + s;
  }
  function fmtPct(n) { return isFinite(n) ? (Math.round(n * 100) / 100) + '%' : '—'; }
  function isQtyLocked(rec) {
    var a = attrs(rec) || {};
    var raw = a.field_2230_raw;
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = String(a.field_2230 || '').trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }
  function labelOf(rec) {
    var a = attrs(rec) || {};
    var lbl = clean(a.field_1950);
    if (!lbl && Array.isArray(a.field_1950_raw) && a.field_1950_raw[0]) lbl = clean(a.field_1950_raw[0].identifier || '');
    if (!lbl || /^[a-f0-9]{24}(\s|\b|$)/i.test(lbl)) {
      lbl = (ns.card && typeof ns.card.labelLineItem === 'function') ? ns.card.labelLineItem(rec) : '';
    }
    return lbl || (rec && rec.id) || '';
  }
  function productOf(rec, viewKey) {
    var a = attrs(rec) || {};
    var key = fieldsFor(viewKey).product || 'field_1949';
    var p = clean(a[key]);
    if (!p && Array.isArray(a[key + '_raw']) && a[key + '_raw'][0]) p = clean(a[key + '_raw'][0].identifier || '');
    return p;
  }
  /** The parent's label: the loaded parent record's, else the back-pointer's identifier. */
  function parentOf(rec, viewKey) {
    var a = attrs(rec) || {};
    var raw = a[parentKeyFor(viewKey) + '_raw'];
    var pid = idsOf(raw)[0] || '';
    var prec = pid ? recById(viewKey, pid) : null;
    var lbl = prec ? labelOf(prec) : (Array.isArray(raw) && raw[0] ? clean(raw[0].identifier || '') : '');
    return { id: pid, label: lbl };
  }
  /** The accessory records whose parent back-pointer names one of the given
   *  parents, in model order (never a parent itself). */
  function accessoriesOf(viewKey, parentIds) {
    var set = Object.create(null);
    for (var p = 0; p < (parentIds || []).length; p++) set[parentIds[p]] = true;
    var key = parentKeyFor(viewKey) + '_raw', out = [], list = records(viewKey);
    for (var i = 0; i < list.length; i++) {
      var a = attrs(list[i]);
      if (!a || !a.id || set[a.id]) continue;
      var ids = idsOf(a[key]);
      for (var j = 0; j < ids.length; j++) if (set[ids[j]]) { out.push(list[i]); break; }
    }
    return out;
  }

  // ── CSS (the add-accessories modal's .scw-ws-v2-mb-* chrome + a few rows) ──
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.scw-ws-v2-ae-modal { width: min(600px, 94vw) !important; max-height: 90vh !important; overflow: auto !important; }',
      '.scw-ws-v2-ae-facts { display:flex; flex-wrap:wrap; gap:4px 18px; font:500 12.5px system-ui, sans-serif; color:#334155; }',
      '.scw-ws-v2-ae-facts em { font-style:normal; font-size:10.5px; letter-spacing:.04em; text-transform:uppercase; color:#94a3b8; margin-right:5px; }',
      '.scw-ws-v2-ae-fields { display:grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }',
      '.scw-ws-v2-ae-field { display:flex; flex-direction:column; gap:3px; min-width:0; }',
      '.scw-ws-v2-ae-field--wide { grid-column: 1 / -1; }',
      '.scw-ws-v2-ae-field .scw-ws-v2-mb-label { margin:0; }',
      '.scw-ws-v2-ae-hint { font-size:11.5px; color:#64748b; }',
      '.scw-ws-v2-ae-list { max-height: 240px; overflow:auto; border:1px solid #e2e8f0; border-radius:6px; padding:2px 4px; }',
      '.scw-ws-v2-ae-row { display:flex; gap:8px; align-items:baseline; padding:5px 6px; font:12.5px system-ui, sans-serif; cursor:pointer; border-radius:4px; }',
      '.scw-ws-v2-ae-row:hover { background:#f8fafc; }',
      '.scw-ws-v2-ae-row input { margin:0; position:relative; top:1px; }',
      '.scw-ws-v2-ae-row .n { font-weight:600; color:#0f172a; }',
      '.scw-ws-v2-ae-row .p { color:#64748b; }',
      '.scw-ws-v2-ae-row .v { margin-left:auto; color:#64748b; white-space:nowrap; font-variant-numeric: tabular-nums; }',
      '.scw-ws-v2-ae-row.is-fail { background:#fff1f2; }',
      '.scw-ws-v2-ae-row.is-fail .v { color:#be123c; }',
      '.scw-ws-v2-ae-count { font-size:11.5px; color:#64748b; display:flex; gap:10px; align-items:center; }',
      '.scw-ws-v2-ae-count button { border:0; background:none; color:#07467c; font:600 11.5px system-ui, sans-serif; cursor:pointer; padding:0; }',
      '.scw-ws-v2-ae-toast { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:#0f172a; color:#fff; padding:9px 14px; border-radius:6px; font:500 13px system-ui, sans-serif; z-index:10001; box-shadow:0 10px 30px rgba(0,0,0,.3); max-width:90vw; }',
      '.scw-ws-v2-ae-toast.is-err { background:#be123c; }'
    ].join('\n');
    document.head.appendChild(st);
  }
  var _toastTimer = null;
  function toast(msg, isErr) {
    injectCss();
    var el = document.getElementById('scw-ws-v2-ae-toast');
    if (!el) { el = document.createElement('div'); el.id = 'scw-ws-v2-ae-toast'; document.body.appendChild(el); }
    el.className = 'scw-ws-v2-ae-toast' + (isErr ? ' is-err' : '');
    el.textContent = msg;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, isErr ? 7000 : 3500);
  }

  // ── Writes: one view-based PUT per record, retried on transient failures ──
  function transient(status) { return status === 0 || status === 408 || status === 429 || (status >= 500 && status <= 599); }
  function putRecord(viewKey, recordId, body) {
    return new Promise(function (resolve) {
      var attempt = 0;
      function go() {
        attempt++;
        var done = false;
        try {
          SCW.knackAjax({
            url:  SCW.knackRecordUrl(viewKey, recordId),
            type: 'PUT',
            data: JSON.stringify(body),
            success: function (resp) { if (done) return; done = true; resolve({ ok: true, status: 200, recordId: recordId, resp: resp }); },
            error: function (xhr) {
              if (done) return; done = true;
              var status = (xhr && typeof xhr.status === 'number') ? xhr.status : 0;
              if (transient(status) && attempt < CONFIG.RETRY_ATTEMPTS) {
                var wait = Math.min(CONFIG.RETRY_MAX_MS, CONFIG.RETRY_BASE_MS * Math.pow(2, attempt - 1)) +
                           Math.random() * Math.min(200, CONFIG.RETRY_BASE_MS);
                setTimeout(go, wait);
                return;
              }
              resolve({ ok: false, status: status, recordId: recordId, error: (xhr && (xhr.responseText || xhr.statusText)) || '' });
            }
          });
        } catch (e) {
          if (!done) { done = true; resolve({ ok: false, status: 0, recordId: recordId, error: String((e && e.message) || e) }); }
        }
      }
      go();
    });
  }
  /** Run promise-returning tasks at most `limit` at a time, starts at least
   *  `gapMs` apart; resolves to the results array. Never rejects. */
  function runQueue(tasks, limit, gapMs) {
    return new Promise(function (resolve) {
      var results = new Array(tasks.length);
      var next = 0, active = 0, finished = 0, lastStart = 0;
      if (!tasks.length) { resolve(results); return; }
      function settle(i, r) {
        results[i] = r; active--; finished++;
        if (finished === tasks.length) resolve(results); else launch();
      }
      function start(i, wait) {
        setTimeout(function () {
          var p;
          try { p = Promise.resolve(tasks[i]()); }
          catch (e) { p = Promise.resolve({ ok: false, status: 0, error: String((e && e.message) || e) }); }
          p.then(function (r) { settle(i, r); }, function (e) { settle(i, { ok: false, status: 0, error: String((e && e.message) || e) }); });
        }, wait);
      }
      function launch() {
        while (active < limit && next < tasks.length) {
          var i = next++; active++;
          var now = Date.now(), at = Math.max(now, lastStart + gapMs);
          lastStart = at;
          start(i, at - now);
        }
      }
      launch();
    });
  }
  /** Which of the keys we sent did the server NOT take? A 200 whose record
   *  still carries the previous value for a key we changed = dropped (the
   *  column is not inline-editable on this view, or a rule re-stamped it). A
   *  response that carries a third value is a normalization, not a drop. */
  function droppedKeys(resp, body, prev) {
    var rr = (resp && resp.record && typeof resp.record === 'object') ? resp.record : resp;
    var out = [];
    if (!rr || typeof rr !== 'object') return out;
    for (var key in body) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      var sv = rr[key + '_raw'];
      if (sv === undefined) sv = rr[key];
      if (sv === undefined || (sv && typeof sv === 'object')) continue;
      var sent = body[key], was = prev[key];
      if (typeof sent === 'number' || typeof was === 'number') {
        if (sameNum(sv, was) && !sameNum(sv, sent)) out.push(key);
      } else {
        var s = clean(sv), p = clean(was), n = clean(sent);
        if (s === p && s !== n) out.push(key);
      }
    }
    return out;
  }
  function syncModel(viewKey, recordId, resp, body) {
    try {
      if (typeof SCW.syncKnackModel !== 'function') return;
      var keys = Object.keys(body);
      if (!keys.length) { SCW.syncKnackModel(viewKey, recordId, resp, '', undefined); return; }
      for (var i = 0; i < keys.length; i++) SCW.syncKnackModel(viewKey, recordId, resp, keys[i], body[keys[i]]);
    } catch (e) { /* the refetch below re-reads the record anyway */ }
  }
  function refetch(viewKey, recordId, body) {
    try {
      var keys = Object.keys(body || {});
      if (recordId && keys.length && ns.data && typeof ns.data.refetchRecordAndNotify === 'function') {
        ns.data.refetchRecordAndNotify(viewKey, recordId, keys[0], body[keys[0]]);
      } else if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
        ns.data.refetchAndNotify(viewKey);
      } else if (ns.data && typeof ns.data.notify === 'function') {
        ns.data.notify(viewKey);
      }
    } catch (e) { /* ignore */ }
  }

  // ── The modal ──
  var _overlay = null;
  function close() {
    if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
    _overlay = null;
  }
  function fieldInputHtml(def, F, value, bulk) {
    var key = F[def.key];
    var val = (value == null || (typeof value === 'number' && !isFinite(value))) ? '' : value;
    return '<label class="scw-ws-v2-ae-field' + (def.wide ? ' scw-ws-v2-ae-field--wide' : '') + '">' +
      '<span class="scw-ws-v2-mb-label">' + esc(def.label) + '</span>' +
      '<input class="scw-ws-v2-mb-input" type="' + (def.kind === 'number' ? 'number' : 'text') + '"' +
        (def.kind === 'number' ? ' step="any" inputmode="decimal"' : '') +
        ' data-scw-ae-field="' + esc(key) + '" data-scw-ae-kind="' + def.kind + '"' +
        ' value="' + esc(val) + '"' +
        (bulk ? ' placeholder="leave as is"' : '') + '>' +
    '</label>';
  }
  /** The sign convention, read off the object's own formulas (2026-10-30, "the
   *  discount should be entered as a positive value, right?"): the unit
   *  discount CALC_LI_unit_discount_amt_effective (field_2267) is the $ each
   *  when its flag is on, else % × unit price, and the net unit price
   *  (field_2268) is unit price MINUS that — so a positive number takes money
   *  off, a negative one adds it (a line-level fee). Knack's conditional
   *  rules switch the "custom discount entered" flags (field_2467 / 2468) on
   *  when an input is not blank, and the $ amount wins over the % when both
   *  are set. 10 in the % box means 10 %. */
  function discountHintHtml(F) {
    if (!F.lineDiscPct && !F.lineDiscAmt) return '';
    return '<div class="scw-ws-v2-ae-hint scw-ws-v2-ae-field--wide">Enter a discount as a positive number — it comes off the unit price (net = unit price − discount); a negative number adds to it.' +
      (F.lineDiscPct && F.lineDiscAmt ? ' 10 in the % box means 10 %. When both are set, the $ amount wins.' : '') + '</div>';
  }
  function currentLine(rec, viewKey, F) {
    var bits = [];
    var q = readNum(rec, F.qty || 'field_1964');
    if (isFinite(q)) bits.push('qty ' + q);
    if (F.lineDiscPct) { var pc = readNum(rec, F.lineDiscPct); if (isFinite(pc) && pc !== 0) bits.push(fmtPct(pc)); }
    if (F.lineDiscAmt) { var am = readNum(rec, F.lineDiscAmt); if (isFinite(am) && am !== 0) bits.push(fmtMoney(am) + ' each'); }
    if (F.netUnit) { var nu = readNum(rec, F.netUnit); if (isFinite(nu)) bits.push('net ' + fmtMoney(nu)); }
    return bits.join(' · ');
  }

  /**
   * open(viewKey, accessoryIds, opts) — one id = the single form, 2+ = the
   * bulk list. Returns the overlay element, or null when the view has not
   * opted in / none of the ids is a loaded record (a toast says so).
   */
  function open(viewKey, accIds, opts) {
    opts = opts || {};
    if (!canOpen(viewKey)) return null;
    var recs = [];
    for (var i = 0; i < (accIds || []).length; i++) { var r = recById(viewKey, accIds[i]); if (r) recs.push(r); }
    if (!recs.length) { toast('That accessory is not loaded on this worksheet — refresh the page and try again.', true); return null; }
    var bulk = recs.length > 1;
    var F = fieldsFor(viewKey);
    var defs = FIELD_DEFS.filter(function (d) { return !!F[d.key]; });
    close();
    injectCss();

    var h = '<div class="scw-ws-v2-mb-modal scw-ws-v2-ae-modal" role="dialog" aria-modal="true" aria-label="' + (bulk ? 'Edit accessories' : 'Edit accessory') + '">';
    if (!bulk) {
      var rec = recs[0], par = parentOf(rec, viewKey), prod = productOf(rec, viewKey), lbl = labelOf(rec);
      h += '<div class="scw-ws-v2-mb-title">Edit accessory</div>' +
        '<div class="scw-ws-v2-mb-sub"><b>' + esc(lbl) + '</b>' +
          (par.label ? ' on <b>' + esc(par.label) + '</b>' : '') +
          (prod && lbl.indexOf(prod) === -1 ? ' · ' + esc(prod) : '') + '</div>';
      var facts = '';
      for (var fi = 0; fi < FACT_DEFS.length; fi++) {
        var fk = F[FACT_DEFS[fi].key];
        if (!fk) continue;
        var fv = readNum(rec, fk);
        if (!isFinite(fv)) continue;
        facts += '<span><em>' + esc(FACT_DEFS[fi].label) + '</em>' + esc(fmtMoney(fv)) + '</span> ';
      }
      if (facts) h += '<div class="scw-ws-v2-ae-facts">' + facts + '</div>';
      h += '<div class="scw-ws-v2-ae-fields">';
      if (!isQtyLocked(rec)) {
        var q0 = readNum(rec, F.qty || 'field_1964');
        h += '<label class="scw-ws-v2-ae-field"><span class="scw-ws-v2-mb-label">Quantity</span>' +
          '<input class="scw-ws-v2-mb-input" type="number" min="1" step="1" inputmode="numeric" data-scw-ae-field="' + esc(F.qty || 'field_1964') + '" data-scw-ae-kind="qty" value="' + esc(isFinite(q0) ? q0 : 1) + '"></label>';
      }
      for (var di = 0; di < defs.length; di++) {
        var d = defs[di];
        h += fieldInputHtml(d, F, d.kind === 'number' ? readNum(rec, F[d.key]) : readText(rec, F[d.key]), false);
      }
      h += discountHintHtml(F) + '</div>';
    } else {
      // The bulk list: by parent (model order), the accessory and what it carries today.
      var rows = recs.slice().map(function (r) { return { rec: r, par: parentOf(r, viewKey), lbl: labelOf(r) }; });
      rows.sort(function (a, b) {
        var pa = a.par.label || '', pb = b.par.label || '';
        return pa === pb ? a.lbl.localeCompare(b.lbl, undefined, { numeric: true }) : pa.localeCompare(pb, undefined, { numeric: true });
      });
      var nParents = Object.create(null), np = 0;
      rows.forEach(function (x) { if (x.par.id && !nParents[x.par.id]) { nParents[x.par.id] = 1; np++; } });
      h += '<div class="scw-ws-v2-mb-title">Edit ' + rows.length + ' accessories</div>' +
        '<div class="scw-ws-v2-mb-sub">' + (np ? 'Under ' + np + ' selected item' + (np === 1 ? '' : 's') + '. ' : '') +
          'A blank field is left as it is on every accessory; enter 0 to clear a discount.</div>' +
        '<div class="scw-ws-v2-ae-count"><span data-scw-ae-count></span>' +
          '<button type="button" data-scw-ae-all="1">Tick all</button><button type="button" data-scw-ae-all="0">Untick all</button></div>' +
        '<div class="scw-ws-v2-ae-list" role="group" aria-label="Accessories">';
      for (var ri = 0; ri < rows.length; ri++) {
        var x = rows[ri];
        h += '<label class="scw-ws-v2-ae-row" data-scw-ae-row="' + esc(x.rec.id) + '">' +
          '<input type="checkbox" class="scw-ws-v2-ae-check" value="' + esc(x.rec.id) + '" checked>' +
          '<span class="n">' + esc(x.lbl) + '</span>' +
          (x.par.label ? '<span class="p">on ' + esc(x.par.label) + '</span>' : '') +
          '<span class="v">' + esc(currentLine(x.rec, viewKey, F)) + '</span></label>';
      }
      h += '</div><div class="scw-ws-v2-ae-fields">';
      for (var bi = 0; bi < defs.length; bi++) h += fieldInputHtml(defs[bi], F, '', true);
      h += discountHintHtml(F) + '</div>';
    }
    h += '<div class="scw-ws-v2-mb-status" aria-live="polite"></div>' +
      '<div class="scw-ws-v2-mb-actions">' +
        '<button type="button" class="scw-ws-v2-mb-cancel">Cancel</button>' +
        '<button type="button" class="scw-ws-v2-mb-submit">' + (bulk ? 'Apply' : 'Save') + '</button>' +
      '</div></div>';

    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-mb-overlay scw-ws-v2-ae-overlay';
    overlay.innerHTML = h;
    document.body.appendChild(overlay);
    _overlay = overlay;

    var status = overlay.querySelector('.scw-ws-v2-mb-status');
    var submit = overlay.querySelector('.scw-ws-v2-mb-submit');
    var cancel = overlay.querySelector('.scw-ws-v2-mb-cancel');
    var busy = false;
    function checks() { return overlay.querySelectorAll('.scw-ws-v2-ae-check'); }
    function ticked() {
      var out = [], all = checks();
      for (var i = 0; i < all.length; i++) if (all[i].checked) out.push(all[i].value);
      return out;
    }
    function syncCount() {
      var c = overlay.querySelector('[data-scw-ae-count]');
      if (c) c.textContent = ticked().length + ' of ' + checks().length + ' ticked';
      if (bulk) submit.textContent = 'Apply to ' + ticked().length;
    }
    if (bulk) syncCount();
    cancel.addEventListener('click', function () { if (!busy) close(); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { if (!busy) close(); return; }
      var all = e.target.closest && e.target.closest('[data-scw-ae-all]');
      if (all) {
        var on = all.getAttribute('data-scw-ae-all') === '1', boxes = checks();
        for (var i = 0; i < boxes.length; i++) boxes[i].checked = on;
        syncCount();
      }
    });
    overlay.addEventListener('change', function (e) { if (e.target && e.target.classList.contains('scw-ws-v2-ae-check')) syncCount(); });
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); close(); }
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); submit.click(); }
    });
    var first = overlay.querySelector('.scw-ws-v2-ae-fields input');
    if (first && typeof first.focus === 'function') { try { first.focus(); } catch (e) { /* ignore */ } }

    /** The body to send per record. Single: only what changed (a blank number
     *  = clear it). Bulk: the filled fields, verbatim, for every ticked row. */
    function bodyFor(rec) {
      var body = {}, prev = {};
      var inputs = overlay.querySelectorAll('[data-scw-ae-field]');
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i], key = inp.getAttribute('data-scw-ae-field'), kind = inp.getAttribute('data-scw-ae-kind');
        var v = String(inp.value == null ? '' : inp.value).trim();
        if (kind === 'qty') {
          var q = parseInt(v, 10), cur = readNum(rec, key);
          if (isFinite(q) && q >= 1 && !sameNum(q, cur)) { body[key] = q; prev[key] = cur; }
          continue;
        }
        if (kind === 'number') {
          var curN = readNum(rec, key);
          if (v === '') {
            if (!bulk && isFinite(curN)) { body[key] = ''; prev[key] = curN; }   // the box was emptied: clear the field
            continue;
          }
          var n = parseFloat(v);
          if (!isFinite(n)) continue;
          if (bulk || !sameNum(n, curN)) { body[key] = n; prev[key] = curN; }
          continue;
        }
        var curT = readText(rec, key);
        if (v === '') { if (!bulk && curT) { body[key] = ''; prev[key] = curT; } continue; }
        if (bulk || v !== curT) { body[key] = v; prev[key] = curT; }
      }
      return { body: body, prev: prev };
    }
    function setBusy(on) {
      busy = on;
      submit.disabled = on; cancel.disabled = on;
      var inputs = overlay.querySelectorAll('input');
      for (var i = 0; i < inputs.length; i++) inputs[i].disabled = on;
    }
    submit.addEventListener('click', function () {
      if (busy) return;
      var targets = bulk ? ticked().map(function (id) { return recById(viewKey, id); }).filter(Boolean) : [recs[0]];
      if (!targets.length) { status.textContent = 'Tick at least one accessory.'; return; }
      var jobs = [];
      for (var t = 0; t < targets.length; t++) {
        var bf = bodyFor(targets[t]);
        if (Object.keys(bf.body).length) jobs.push({ rec: targets[t], body: bf.body, prev: bf.prev });
      }
      if (!jobs.length) {
        if (bulk) { status.textContent = 'Fill in at least one field — a blank field is left as it is.'; return; }
        close(); return;   // nothing changed on the single form
      }
      setBusy(true);
      status.textContent = bulk ? 'Saving 0 of ' + jobs.length + '…' : 'Saving…';
      var done = 0;
      runQueue(jobs.map(function (job) {
        return function () {
          return putRecord(viewKey, job.rec.id, job.body).then(function (res) {
            done++;
            if (bulk) status.textContent = 'Saving ' + done + ' of ' + jobs.length + '…';
            res.job = job;
            if (res.ok) {
              res.dropped = droppedKeys(res.resp, job.body, job.prev);
              syncModel(viewKey, job.rec.id, res.resp, job.body);
            }
            return res;
          });
        };
      }), CONFIG.MAX_CONCURRENT, CONFIG.GAP_MS).then(function (results) {
        var okRows = [], failed = [], dropped = [];
        for (var i = 0; i < results.length; i++) {
          var r = results[i];
          if (!r || !r.ok) failed.push(r || { job: jobs[i], status: 0 });
          else if (r.dropped && r.dropped.length) dropped.push(r);
          else okRows.push(r);
        }
        var labelOfKey = function (key) {
          for (var k in F) if (F[k] === key) {
            for (var d = 0; d < FIELD_DEFS.length; d++) if (FIELD_DEFS[d].key === k) return FIELD_DEFS[d].label;
            return k;
          }
          return key;
        };
        var applied = okRows.length + dropped.length;   // dropped rows still took the other keys
        if (!failed.length && !dropped.length) {
          close();
          toast(bulk ? 'Updated ' + okRows.length + ' accessor' + (okRows.length === 1 ? 'y' : 'ies') + '.' : 'Accessory saved.');
          if (bulk) refetch(viewKey, '', null); else refetch(viewKey, jobs[0].rec.id, jobs[0].body);
          return;
        }
        setBusy(false);
        var parts = [];
        if (dropped.length) {
          var keys = Object.create(null);
          dropped.forEach(function (r) { r.dropped.forEach(function (k) { keys[k] = 1; }); });
          parts.push('Knack did not apply ' + Object.keys(keys).map(labelOfKey).join(' / ') + ' on ' +
            (bulk ? dropped.length + ' accessor' + (dropped.length === 1 ? 'y' : 'ies') : 'this accessory') +
            ' — the column is not inline-editable on ' + viewKey + ' (Builder).');
        }
        if (failed.length) {
          parts.push(failed.map(function (r) {
            return labelOf(r.job.rec) + ' failed' + (r.status ? ' (HTTP ' + r.status + ')' : ' (no response)');
          }).join('; ') + '.');
        }
        if (okRows.length) parts.push(okRows.length + ' saved.');
        status.innerHTML = '<span style="color:#be123c">' + esc(parts.join(' ')) + '</span>' +
          (bulk && failed.length ? ' <span class="scw-ws-v2-ae-hint">The failed ones stay ticked — Apply again re-sends only those.</span>' : '');
        if (bulk) {
          var okSet = Object.create(null);
          okRows.concat(dropped).forEach(function (r) { okSet[r.job.rec.id] = 1; });
          var boxes = checks();
          for (var b = 0; b < boxes.length; b++) {
            boxes[b].checked = !okSet[boxes[b].value];
            var row = boxes[b].closest('.scw-ws-v2-ae-row');
            if (row) row.classList.toggle('is-fail', !okSet[boxes[b].value]);
          }
          syncCount();
        }
        if (applied) refetch(viewKey, '', null);
      });
    });
    return overlay;
  }

  /** The bulk bar's entry: every accessory under the given parents. */
  function openForParents(viewKey, parentIds) {
    var accs = accessoriesOf(viewKey, parentIds);
    if (!accs.length) { toast('The selected items have no accessories.', true); return null; }
    return open(viewKey, accs.map(function (r) { return r.id; }), { parentIds: parentIds });
  }

  ns.accessoryEdit = {
    CONFIG:         CONFIG,
    canOpen:        canOpen,
    open:           open,
    openForParents: openForParents,
    accessoriesOf:  accessoriesOf,
    close:          close,
    _putRecord:     putRecord,
    _runQueue:      runQueue,
    _droppedKeys:   droppedKeys
  };
})();
/*** END WORKSHEET V2 — ACCESSORY EDIT MODAL *********************************/
