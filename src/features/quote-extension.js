/*** QUOTE EXPIRATION EXTENSIONS — the AE asks the basis bid's sub directly ***
 *
 * ClickUp 86ba5wg3f (design locked 2026-10-23, built 2026-11-05). Today only
 * Ops can extend a published proposal's expiration; sales sees the date read-
 * only with "coordinate an extension with Ops", so the ask leaves the system
 * (Slack / email), Ops relays it to SVS by hand, and nothing ever compares the
 * quote's expiration with the bid's (`field_2635`) it rests on. This module is
 * the bundle half of the direct path; Make owns every write (contract in
 * src/config.js `MAKE_QUOTE_EXTENSION_WEBHOOK`).
 *
 * THREE SURFACES
 *   1. Sales SOW page (scene_1116) — `decorateSalesCard(body, proposal)`, called
 *      by published-proposal-sow-card.js after it builds the Published Proposal
 *      card: a "Request extension" button → modal (requested date, prefilled
 *      +30 days; a one-line reason) → POST `request-extension`. While a request
 *      is pending the card reads "Extension to 11/22 requested 10/23 · awaiting
 *      SVS" with Nudge / Cancel (`nudge-extension` / `cancel-extension`).
 *      Pending comes from the SOW header's Builder fields when configured
 *      (CONFIG.sales.pendingFlag / requestedDate), else from a per-tab marker
 *      this page writes after a successful send (sessionStorage).
 *   2. Sub bid page (scene_1149) — when the bid package carries the Builder
 *      "extension requested" flag (CONFIG.sub.requestedFlag, read off
 *      view_3552's record), a card above the bid document shows the requested
 *      quote date beside the bid's own expiration with three answers:
 *      Can't extend · Re-price instead · Extend bid to <date> (date editable,
 *      may be earlier). Each POSTs `confirm-extension`; the page writes nothing.
 *   3. Reconcile page (scene_1155) — the sub card's "Bid expires" line and the
 *      "Extension pending" chip live in bid-review-v2/header.js (fields from
 *      bid-review/config.js: bidExpiration / bidExtensionFlag).
 *
 * FAIL-OPEN: every Builder key below is '' until the field exists. With no
 * pending-flag field the sales card falls back to the session marker; with no
 * requested-flag field the sub card never renders (nothing to answer). With the
 * webhook at PLACEHOLDER the sales button is hidden unless
 * localStorage.scwQuoteExtPreview = '1' (QA), and a send reports the missing
 * hook instead of pretending.
 *
 * Builder (TBD): SOW header `FLAG_extension pending` (Yes/No) +
 * `INPUT_requested expiration` (date); bid package `FLAG_extension requested`
 * (Yes/No) + `INPUT_requested quote expiration` (date); `field_2635` as a
 * column on view_3573. Fill the keys in CONFIG when they exist.
 ******************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    webhookKey: 'MAKE_QUOTE_EXTENSION_WEBHOOK',
    defaultExtensionDays: 30,
    previewKey: 'scwQuoteExtPreview',      // localStorage '1' → sales button with no hook (QA)
    sales: {
      scene: 'scene_1116',
      sowView: 'view_3827',                 // SOW-bound details view: the page's SOW record
      proposalView: 'view_3814',            // published-proposal details view (refetched after a send)
      sowIdField: 'field_2122',             // SOW ID "60486704913-SW1589" (the SW number)
      sowNameField: 'field_2126',
      pendingFlag: '',                      // Builder TBD: SOW FLAG_extension pending (Yes/No)
      requestedDate: ''                     // Builder TBD: SOW INPUT_requested expiration (date)
    },
    sub: {
      scene: 'scene_1149',
      bidView: 'view_3552',                 // BID_package details: this page's bid record
      mountBefore: 'view_3550',             // the card sits above the bid document
      bidExpiration: 'field_2635',
      bidSow: 'field_2387',
      bidLabel: 'field_2638',
      requestedFlag: '',                    // Builder TBD: bid FLAG_extension requested (Yes/No)
      requestedDate: ''                     // Builder TBD: bid INPUT_requested quote expiration (date)
    }
  };

  var STYLE_ID = 'scw-qext-css';
  var NS = '.scwQuoteExt';
  var MARK = 'scw:qext:';                    // sessionStorage marker per SOW (sales fallback)
  var _warned = {};

  // ── Small helpers ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function strip(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  function warnOnce(key, msg) {
    if (_warned[key]) return;
    _warned[key] = true;
    console.warn('[scw-quote-ext] ' + msg);
  }
  function hookUrl() {
    var u = (window.SCW && SCW.CONFIG && SCW.CONFIG[CONFIG.webhookKey]) || '';
    return (u && !/PLACEHOLDER/.test(u)) ? u : '';
  }
  function previewOn() {
    try { return localStorage.getItem(CONFIG.previewKey) === '1'; } catch (e) { return false; }
  }
  function user() {
    try {
      var a = (window.Knack && Knack.getUserAttributes && Knack.getUserAttributes()) || {};
      return { name: a.name || '', email: a.email || '' };
    } catch (e) { return { name: '', email: '' }; }
  }
  function viewRecord(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var m = v && v.model;
      if (!m) return null;
      if (m.attributes && m.attributes.id) return m.attributes;
      var models = m.data && m.data.models;
      if (models && models.length && models[0].attributes) return models[0].attributes;
    } catch (e) { /* no model */ }
    return null;
  }
  // The text of a Knack field off a record: the formatted date of a date
  // field, else the display value with markup stripped.
  function fieldText(rec, key) {
    if (!rec || !key) return '';
    var raw = rec[key + '_raw'];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (raw.date_formatted) return String(raw.date_formatted).trim();
      if (raw.date) return String(raw.date).trim();
    }
    if (Array.isArray(raw) && raw[0] && raw[0].identifier) return strip(raw[0].identifier);
    return strip(rec[key]);
  }
  function fieldYes(rec, key) {
    if (!rec || !key) return false;
    var raw = rec[key + '_raw'];
    if (typeof raw === 'boolean') return raw;
    return /^(yes|true)$/i.test(strip(rec[key]));
  }
  function connId(rec, key) {
    var raw = rec && key ? rec[key + '_raw'] : null;
    if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
    if (raw && raw.id) return raw.id;
    return '';
  }

  // ── Dates (M/D/YYYY, what Knack shows and takes) ─────────────────────────
  function normalizeMdy(s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    if (!m) {
      var digits = s.replace(/\D/g, '');
      if (digits.length === 8) m = [null, digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)];
      else return '';
    }
    var mo = parseInt(m[1], 10), d = parseInt(m[2], 10), y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return '';
    var dt = new Date(y, mo - 1, d);
    if (dt.getMonth() !== mo - 1) return '';           // 11/31 → invalid, not 12/1
    return mo + '/' + d + '/' + y;
  }
  function mdyToDate(mdy) {
    var n = normalizeMdy(mdy);
    if (!n) return null;
    var p = n.split('/');
    return new Date(parseInt(p[2], 10), parseInt(p[0], 10) - 1, parseInt(p[1], 10));
  }
  function dateToMdy(dt) { return (dt.getMonth() + 1) + '/' + dt.getDate() + '/' + dt.getFullYear(); }
  function addDays(mdy, n) {
    var dt = mdyToDate(mdy);
    if (!dt) return '';
    dt.setDate(dt.getDate() + n);
    return dateToMdy(dt);
  }
  function todayMdy() { return dateToMdy(new Date()); }
  function laterOf(a, b) {
    var da = mdyToDate(a), db = mdyToDate(b);
    if (!da) return normalizeMdy(b); if (!db) return normalizeMdy(a);
    return da >= db ? dateToMdy(da) : dateToMdy(db);
  }
  // Requested date prefill: 30 days past the current expiration, never in the past.
  function suggestedDate(currentMdy) {
    return laterOf(addDays(currentMdy, CONFIG.defaultExtensionDays) || '', addDays(todayMdy(), CONFIG.defaultExtensionDays));
  }

  // ── The webhook ──────────────────────────────────────────────────────────
  // Resolves { ok, data } — never rejects. A CORS-opaque status 0 counts as
  // delivered (every Make caller in this bundle treats it so).
  function post(payload) {
    var url = hookUrl();
    if (!url) {
      warnOnce('hook', CONFIG.webhookKey + ' is not configured — nothing was sent (' + payload.stepId + ')');
      return Promise.resolve({ ok: false, status: 0, unconfigured: true, data: null });
    }
    payload.triggeredBy = payload.triggeredBy || user();
    return new Promise(function (resolve) {
      try {
        SCW.knackAjax({
          url: url, type: 'POST', contentType: 'application/json', data: JSON.stringify(payload),
          success: function (resp) {
            var data = null;
            try { data = typeof resp === 'string' ? JSON.parse(resp) : resp; } catch (e) { data = null; }
            if (data && data.success === false) resolve({ ok: false, status: 200, data: data });
            else resolve({ ok: true, status: 200, data: data });
          },
          error: function (xhr) {
            var st = (xhr && xhr.status) || 0;
            if (st === 0) resolve({ ok: true, status: 0, data: null });
            else resolve({ ok: false, status: st, data: null });
          }
        });
      } catch (e) { resolve({ ok: false, status: 0, data: null }); }
    });
  }
  function errText(res, what) {
    if (res.unconfigured) return what + ' was not sent — the extension webhook is not configured yet.';
    if (res.data && res.data.error) return String(res.data.error);
    return what + ' failed' + (res.status ? ' (HTTP ' + res.status + ')' : '') + ' — try again.';
  }
  function toast(msg, type) {
    try {
      var br = window.SCW && SCW.bidReview;
      if (br && typeof br.renderToast === 'function') { br.renderToast(msg, type); return; }
      var scr = window.SCW && SCW.salesCR;
      if (scr && typeof scr.showToast === 'function') { scr.showToast(msg, type); return; }
    } catch (e) { /* fall through */ }
    if (type === 'error') console.warn('[scw-quote-ext] ' + msg);
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.scw-qext { margin: 10px 0 2px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px;' +
      '  background: #f8fafc; font: 400 12px/1.45 system-ui, sans-serif; color: #334155; text-align: left; }' +
      '.scw-qext--pending { border-color: #fcd34d; background: #fffbeb; }' +
      '.scw-qext--sub { margin: 0 0 14px; padding: 14px 16px; border-color: #fcd34d; background: #fffbeb; }' +
      '.scw-qext__title { font-weight: 700; font-size: 13px; color: #0f172a; margin: 0 0 4px; }' +
      '.scw-qext__line { margin: 2px 0; }' +
      '.scw-qext__muted { color: #64748b; }' +
      '.scw-qext__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }' +
      '.scw-qext__btn { font: 600 12px/1 system-ui, sans-serif; padding: 7px 12px; border-radius: 6px; cursor: pointer;' +
      '  border: 1px solid #cbd5e1; background: #fff; color: #0f172a; }' +
      '.scw-qext__btn:hover { background: #f1f5f9; }' +
      '.scw-qext__btn--primary { background: #1e3a8a; border-color: #1e3a8a; color: #fff; }' +
      '.scw-qext__btn--primary:hover { background: #1e40af; }' +
      '.scw-qext__btn--danger { color: #b91c1c; border-color: #fca5a5; }' +
      '.scw-qext__btn--danger:hover { background: #fef2f2; }' +
      '.scw-qext__btn[disabled] { opacity: .55; cursor: default; }' +
      '.scw-qext__chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font: 700 10px/1.6 system-ui, sans-serif;' +
      '  letter-spacing: .02em; text-transform: uppercase; background: #fef3c7; color: #b45309; margin-right: 6px; }' +
      '.scw-qext__input { font: 400 13px/1.2 system-ui, sans-serif; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; width: 120px; }' +
      '.scw-qext__ta { font: 400 13px/1.4 system-ui, sans-serif; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%; min-height: 64px; box-sizing: border-box; }' +
      '.scw-qext__err { color: #b91c1c; margin-top: 6px; }' +
      '.scw-qext__ok { color: #166534; margin-top: 6px; }' +
      '.scw-qext-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 10050; display: flex; align-items: center; justify-content: center; }' +
      '.scw-qext-modal { background: #fff; border-radius: 12px; width: min(480px, 92vw); padding: 18px 20px; box-shadow: 0 20px 50px rgba(15,23,42,.3);' +
      '  font: 400 13px/1.45 system-ui, sans-serif; color: #334155; }' +
      '.scw-qext-modal h3 { margin: 0 0 4px; font-size: 16px; color: #0f172a; }' +
      '.scw-qext-modal label { display: block; font-weight: 600; font-size: 12px; color: #475569; margin: 12px 0 4px; }' +
      '.scw-qext-modal__foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }';
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. SALES SOW PAGE
  // ═══════════════════════════════════════════════════════════════════════
  function salesSowRecord() { return viewRecord(CONFIG.sales.sowView); }
  function salesSowId() {
    var rec = salesSowRecord();
    if (rec && rec.id) return rec.id;
    // The hash is the fallback, and the DEEPEST occurrence of the slug wins
    // (Knack nests a page under the page it was opened from).
    var h = String(window.location.hash || '');
    var re = /scope-of-work-details\/([0-9a-f]{24})/gi, m, last = '';
    while ((m = re.exec(h))) last = m[1];
    return last;
  }
  function salesSowLabel() {
    // The sales change-request module already derives the page's SOW number
    // ("1589") — view_3827 serves neither the SOW ID nor its name.
    try {
      var scr = window.SCW && SCW.salesCR;
      var lbl = scr && typeof scr.sowDisplayLabel === 'function' ? strip(scr.sowDisplayLabel()) : '';
      if (lbl) return lbl;
    } catch (e) { /* fall through */ }
    var rec = salesSowRecord();
    var id = fieldText(rec, CONFIG.sales.sowIdField);
    var m = id.match(/SW(\d+)/i);
    if (m) return m[1];
    return fieldText(rec, CONFIG.sales.sowNameField) || id || '';
  }
  function projectNumber() {
    try {
      var p = window.SCW && SCW.projectId && SCW.projectId.resolve && SCW.projectId.resolve(CONFIG.sales.scene);
      if (!p) return '';
      if (typeof p === 'string') return p;
      return String(p.id || p.number || p.value || '');
    } catch (e) { return ''; }
  }
  function markerKey(sowId) { return MARK + sowId; }
  function readMarker(sowId) {
    try { var v = sessionStorage.getItem(markerKey(sowId)); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function writeMarker(sowId, obj) {
    try { if (obj) sessionStorage.setItem(markerKey(sowId), JSON.stringify(obj)); else sessionStorage.removeItem(markerKey(sowId)); } catch (e) { /* ignore */ }
  }
  /** { requestedDate, at, routedTo, source } when an extension is pending on
   *  this SOW: the Builder fields when configured, else the session marker. */
  function pendingState(sowId) {
    var rec = salesSowRecord();
    var c = CONFIG.sales;
    if (c.pendingFlag && rec && (rec[c.pendingFlag] !== undefined || rec[c.pendingFlag + '_raw'] !== undefined)) {
      if (!fieldYes(rec, c.pendingFlag)) { writeMarker(sowId, null); return null; }
      var m = readMarker(sowId) || {};
      return { requestedDate: fieldText(rec, c.requestedDate) || m.requestedDate || '', at: m.at || '',
               routedTo: m.routedTo || 'svs', source: 'record' };
    }
    var mk = readMarker(sowId);
    return mk ? { requestedDate: mk.requestedDate, at: mk.at, routedTo: mk.routedTo || '', source: 'marker' } : null;
  }
  function requestText(ctx) {
    var lines = [
      'Quote extension requested',
      (ctx.projectNumber ? 'Project ' + ctx.projectNumber + ' · ' : '') + 'SOW ' + ctx.sowLabel + (ctx.proposalName ? ' · ' + ctx.proposalName : ''),
      'Current expiration: ' + (ctx.currentQuoteExpiration || '—'),
      'Requested: ' + ctx.requestedDate,
      'Reason: ' + ctx.reason,
      'Requested by ' + (ctx.by.name || ctx.by.email || 'sales') + ' on ' + todayMdy()
    ];
    return lines.join('\n');
  }
  function requestHtml(ctx) {
    return '<p><b>Quote extension requested</b></p>' +
      '<p>' + esc((ctx.projectNumber ? 'Project ' + ctx.projectNumber + ' · ' : '') + 'SOW ' + ctx.sowLabel) +
      (ctx.proposalName ? ' · ' + esc(ctx.proposalName) : '') + '</p>' +
      '<p>Current expiration: ' + esc(ctx.currentQuoteExpiration || '—') + '<br>Requested: <b>' + esc(ctx.requestedDate) + '</b></p>' +
      '<p>Reason: ' + esc(ctx.reason) + '</p>' +
      '<p><i>Requested by ' + esc(ctx.by.name || ctx.by.email || 'sales') + ' on ' + esc(todayMdy()) + '</i></p>';
  }
  function closeModal() {
    var o = document.getElementById('scw-qext-overlay');
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }
  /** The AE's modal: requested date (prefilled +30 days) + a reason. */
  function openRequestModal(proposal, onSent) {
    injectStyles();
    closeModal();
    var current = normalizeMdy(proposal.expDate || '');
    var overlay = document.createElement('div');
    overlay.className = 'scw-qext-overlay';
    overlay.id = 'scw-qext-overlay';
    overlay.innerHTML =
      '<div class="scw-qext-modal" role="dialog" aria-label="Request an extension">' +
        '<h3>Request an extension</h3>' +
        '<div class="scw-qext__muted">Goes to the sub whose bid this quote rests on. If the date you ask for is within their bid\'s ' +
          'validity it is extended at once; otherwise they confirm first. Ops is copied on the deal task.</div>' +
        '<label>New expiration date' + (current ? ' <span class="scw-qext__muted">(currently ' + esc(current) + ')</span>' : '') + '</label>' +
        '<input class="scw-qext__input" data-qext-date type="text" inputmode="numeric" placeholder="M/D/YYYY" value="' + esc(suggestedDate(current)) + '">' +
        '<label>Reason</label>' +
        '<textarea class="scw-qext__ta" data-qext-reason placeholder="One line the sub and Ops will read — e.g. client decides at the 11/18 board meeting"></textarea>' +
        '<div class="scw-qext__err" data-qext-err hidden></div>' +
        '<div class="scw-qext-modal__foot">' +
          '<button type="button" class="scw-qext__btn" data-qext-cancel>Cancel</button>' +
          '<button type="button" class="scw-qext__btn scw-qext__btn--primary" data-qext-send>Send request</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var dateIn = overlay.querySelector('[data-qext-date]'), reasonIn = overlay.querySelector('[data-qext-reason]');
    var err = overlay.querySelector('[data-qext-err]'), sendBtn = overlay.querySelector('[data-qext-send]');
    function fail(msg) { err.textContent = msg; err.hidden = false; }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    overlay.querySelector('[data-qext-cancel]').addEventListener('click', closeModal);
    sendBtn.addEventListener('click', function () {
      var mdy = normalizeMdy(dateIn.value);
      var reason = String(reasonIn.value || '').trim();
      if (!mdy) return fail('Enter the new expiration as M/D/YYYY.');
      var dt = mdyToDate(mdy), today = mdyToDate(todayMdy());
      if (dt <= today) return fail('The new expiration has to be after today.');
      if (current && mdyToDate(current) && dt <= mdyToDate(current)) return fail('The new expiration has to be after the current one (' + current + ').');
      if (!reason) return fail('Give the sub and Ops one line on why.');
      var sowId = salesSowId();
      if (!sowId) return fail('Could not tell which SOW this page is — reload and try again.');
      var ctx = {
        sowId: sowId, sowLabel: salesSowLabel(), projectNumber: projectNumber(),
        proposalName: proposal.name || '', proposalRecordId: proposal.recordId || '',
        currentQuoteExpiration: current, requestedDate: mdy, reason: reason, by: user()
      };
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; err.hidden = true;
      post({
        stepId: 'request-extension', sowId: ctx.sowId, proposalRecordId: ctx.proposalRecordId,
        requestedDate: mdy, reason: reason, currentQuoteExpiration: current, triggeredBy: ctx.by,
        requestText: requestText(ctx), requestHtml: requestHtml(ctx)
      }).then(function (res) {
        if (!res.ok) { sendBtn.disabled = false; sendBtn.textContent = 'Send request'; return fail(errText(res, 'The request')); }
        var routedTo = (res.data && res.data.routedTo) || '';
        closeModal();
        if (routedTo === 'auto') {
          writeMarker(sowId, null);
          toast('Expiration extended to ' + mdy + ' — the date was within the sub\'s bid validity', 'success');
        } else {
          writeMarker(sowId, { requestedDate: mdy, at: todayMdy(), routedTo: routedTo });
          toast(routedTo === 'ops'
            ? 'Sent to Ops — this quote has no basis bid, so Ops extends it'
            : 'Extension requested — the sub has been asked to hold their bid until ' + mdy, 'success');
        }
        if (typeof onSent === 'function') onSent(routedTo, mdy);
      });
    });
    setTimeout(function () { dateIn.focus(); dateIn.select(); }, 30);
  }
  function refetchProposalView() {
    try {
      var v = window.Knack && Knack.views && Knack.views[CONFIG.sales.proposalView];
      if (v && v.model && typeof v.model.fetch === 'function') setTimeout(function () { v.model.fetch(); }, 1500);
    } catch (e) { /* the next render picks it up */ }
  }
  /** Called by published-proposal-sow-card.js with the card body + the
   *  proposal it rendered ({ recordId, name, expDate, expired, … }). */
  function decorateSalesCard(body, proposal) {
    if (!body || !proposal) return;
    injectStyles();
    var old = body.querySelector('.scw-qext');
    if (old) old.parentNode.removeChild(old);
    var sowId = salesSowId();
    var pending = sowId ? pendingState(sowId) : null;
    var canAsk = !!hookUrl() || previewOn();
    var box = document.createElement('div');
    box.className = 'scw-qext' + (pending ? ' scw-qext--pending' : '');
    box.setAttribute('data-scw-qext', pending ? 'pending' : (canAsk ? 'ready' : 'off'));
    var note = body.querySelector('.scw-pq-expired-note');
    if (pending) {
      var where = pending.routedTo === 'ops' ? 'with Ops' : pending.routedTo === 'svs' ? 'awaiting SVS' : 'awaiting a reply';
      box.innerHTML =
        '<div><span class="scw-qext__chip">Extension pending</span> ' +
          'Extension to <b>' + esc(pending.requestedDate || '—') + '</b>' +
          (pending.at ? ' requested ' + esc(pending.at) : '') + ' · ' + esc(where) + '</div>' +
        '<div class="scw-qext__row">' +
          '<button type="button" class="scw-qext__btn scw-qext__btn--danger" data-qext-cancel-req>Cancel request</button>' +
          '<button type="button" class="scw-qext__btn" data-qext-nudge>Nudge</button>' +
        '</div>';
      if (note) note.innerHTML = '<strong>This proposal is expired.</strong> An extension is pending — the customer link stays off until it lands.';
      box.querySelector('[data-qext-nudge]').addEventListener('click', function (e) {
        var b = e.currentTarget; b.disabled = true;
        post({ stepId: 'nudge-extension', sowId: sowId }).then(function (res) {
          b.disabled = false;
          toast(res.ok ? 'Reminder sent' : errText(res, 'The reminder'), res.ok ? 'success' : 'error');
        });
      });
      box.querySelector('[data-qext-cancel-req]').addEventListener('click', function (e) {
        if (!window.confirm('Cancel the extension request? The quote keeps its current expiration.')) return;
        var b = e.currentTarget; b.disabled = true;
        post({ stepId: 'cancel-extension', sowId: sowId }).then(function (res) {
          if (!res.ok) { b.disabled = false; return toast(errText(res, 'The cancel'), 'error'); }
          writeMarker(sowId, null);
          toast('Extension request cancelled', 'success');
          decorateSalesCard(body, proposal);
          refetchProposalView();
        });
      });
    } else if (canAsk) {
      box.innerHTML =
        '<div class="scw-qext__muted">' + (proposal.expired
          ? 'This proposal is expired. Ask the sub to hold their bid and the quote is extended with it.'
          : 'Need more time? The sub whose bid this quote rests on is asked directly; Ops is copied.') + '</div>' +
        '<div class="scw-qext__row"><button type="button" class="scw-qext__btn scw-qext__btn--primary" data-qext-request>Request extension</button></div>';
      if (note) note.innerHTML = '<strong>This proposal is expired.</strong> Request an extension below before re-sharing the customer link.';
      box.querySelector('[data-qext-request]').addEventListener('click', function () {
        openRequestModal(proposal, function () { decorateSalesCard(body, proposal); refetchProposalView(); });
      });
    } else {
      // No hook yet: the card keeps its existing copy; nothing to add.
      return;
    }
    body.appendChild(box);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. SUB BID PAGE
  // ═══════════════════════════════════════════════════════════════════════
  function subBidRecord() { return viewRecord(CONFIG.sub.bidView); }
  function renderSubCard() {
    var c = CONFIG.sub;
    var existing = document.getElementById('scw-qext-sub');
    if (!c.requestedFlag) {
      warnOnce('subflag', 'CONFIG.sub.requestedFlag is not set (Builder: bid package "FLAG_extension requested") — the extension card never renders');
      if (existing) existing.parentNode.removeChild(existing);
      return;
    }
    var rec = subBidRecord();
    if (!rec || !rec.id) return;
    if (!fieldYes(rec, c.requestedFlag)) { if (existing) existing.parentNode.removeChild(existing); return; }
    var mount = document.getElementById(c.mountBefore);
    if (!mount || !mount.parentNode) return;
    injectStyles();
    var requested = normalizeMdy(fieldText(rec, c.requestedDate)) || fieldText(rec, c.requestedDate);
    var bidExp = normalizeMdy(fieldText(rec, c.bidExpiration)) || fieldText(rec, c.bidExpiration);
    var sowId = connId(rec, c.bidSow);
    var card = existing || document.createElement('div');
    card.id = 'scw-qext-sub';
    card.className = 'scw-qext scw-qext--sub';
    card.setAttribute('data-scw-qext-sub', rec.id);
    card.innerHTML =
      '<div class="scw-qext__title">SCW asks you to hold this bid' + (requested ? ' until ' + esc(requested) : '') + '</div>' +
      '<div class="scw-qext__line">The client needs more time on the quote this bid is priced into' +
        (requested ? ': the requested quote expiration is <b>' + esc(requested) + '</b>' : '') + '.' +
        ' Your bid currently expires <b>' + esc(bidExp || '—') + '</b>.</div>' +
      '<div class="scw-qext__line scw-qext__muted">Extend if the price still stands (an earlier date than requested is fine — the quote follows your date). ' +
        'Re-price if costs have moved; SCW will reconcile and re-publish. Can\'t extend leaves the quote as it is.</div>' +
      '<label class="scw-qext__line" style="margin-top:8px"><span class="scw-qext__muted">Extend my bid to</span> ' +
        '<input class="scw-qext__input" data-qext-sub-date type="text" inputmode="numeric" placeholder="M/D/YYYY" value="' + esc(requested) + '"></label>' +
      '<textarea class="scw-qext__ta" data-qext-sub-note placeholder="Note to SCW (optional)"></textarea>' +
      '<div class="scw-qext__err" data-qext-sub-err hidden></div>' +
      '<div class="scw-qext__row">' +
        '<button type="button" class="scw-qext__btn scw-qext__btn--danger" data-qext-outcome="decline">Can\'t extend</button>' +
        '<button type="button" class="scw-qext__btn" data-qext-outcome="reprice">Re-price instead</button>' +
        '<button type="button" class="scw-qext__btn scw-qext__btn--primary" data-qext-outcome="extend">Extend bid to ' + esc(requested || 'the date above') + '</button>' +
      '</div>';
    if (!existing) mount.parentNode.insertBefore(card, mount);
    var dateIn = card.querySelector('[data-qext-sub-date]'), err = card.querySelector('[data-qext-sub-err]');
    var extendBtn = card.querySelector('[data-qext-outcome="extend"]');
    dateIn.addEventListener('input', function () {
      var n = normalizeMdy(dateIn.value);
      extendBtn.textContent = 'Extend bid to ' + (n || 'the date above');
    });
    var btns = card.querySelectorAll('[data-qext-outcome]');
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function () {
        var outcome = b.getAttribute('data-qext-outcome');
        var payload = { stepId: 'confirm-extension', bidPackageId: rec.id, sowId: sowId, outcome: outcome,
                        note: String(card.querySelector('[data-qext-sub-note]').value || '').trim(), triggeredBy: user() };
        err.hidden = true;
        if (outcome === 'extend') {
          var mdy = normalizeMdy(dateIn.value);
          if (!mdy) { err.textContent = 'Enter the date to extend to as M/D/YYYY.'; err.hidden = false; return; }
          if (mdyToDate(mdy) <= mdyToDate(todayMdy())) { err.textContent = 'The date has to be after today.'; err.hidden = false; return; }
          payload.bidExpiration = mdy;
        }
        if (outcome === 'decline' && !window.confirm('Tell SCW you can\'t extend this bid? The quote keeps its current expiration.')) return;
        Array.prototype.forEach.call(btns, function (x) { x.disabled = true; });
        b.textContent = 'Sending…';
        post(payload).then(function (res) {
          if (!res.ok) {
            Array.prototype.forEach.call(btns, function (x) { x.disabled = false; });
            b.textContent = outcome === 'extend' ? 'Extend bid to ' + (payload.bidExpiration || '') : outcome === 'reprice' ? 'Re-price instead' : 'Can\'t extend';
            err.textContent = errText(res, 'Your answer'); err.hidden = false;
            return;
          }
          card.innerHTML = '<div class="scw-qext__title">Sent to SCW</div><div class="scw-qext__ok">' + esc(
            outcome === 'extend' ? 'Your bid is extended to ' + payload.bidExpiration + '. The quote follows your date.' :
            outcome === 'reprice' ? 'SCW will reopen the bid for re-pricing and reconcile when you resubmit.' :
            'SCW has been told the bid can\'t be extended.') + '</div>';
          card.setAttribute('data-scw-qext-sub-done', outcome);
        });
      });
    });
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  if (window.SCW && SCW.onSceneRender) {
    SCW.onSceneRender(CONFIG.sub.scene, function () { setTimeout(renderSubCard, 200); }, NS);
  }
  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(CONFIG.sub.bidView, function () { setTimeout(renderSubCard, 100); }, NS);
    SCW.onViewRender(CONFIG.sub.mountBefore, function () { setTimeout(renderSubCard, 100); }, NS);
  }

  window.SCW = window.SCW || {};
  window.SCW.quoteExtension = {
    CONFIG: CONFIG,
    decorateSalesCard: decorateSalesCard,
    openRequestModal: openRequestModal,
    renderSubCard: renderSubCard,
    pendingState: pendingState,
    // tooling / tests
    normalizeMdy: normalizeMdy,
    suggestedDate: suggestedDate,
    _post: post,
    _marker: { read: readMarker, write: writeMarker }
  };
})();
/*** END quote-extension.js ***/
