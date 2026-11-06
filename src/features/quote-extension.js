/*** QUOTE EXPIRATION EXTENSIONS — the AE (or Ops) asks the basis bid's sub directly ***
 *
 * ClickUp 86ba5wg3f (design locked 2026-10-23, built 2026-11-05, Ops surfaces +
 * the discontinued-products gate 2026-11-05). Today only Ops can extend a
 * published proposal's expiration; sales sees the date read-only with
 * "coordinate an extension with Ops", so the ask leaves the system (Slack /
 * email), Ops relays it to SVS by hand, and nothing ever compares the quote's
 * expiration with the bid's (`field_2635`) it rests on. This module is the
 * bundle half of the direct path; Make owns every write (contract in
 * src/config.js `MAKE_QUOTE_EXTENSION_WEBHOOK`).
 *
 * FOUR SURFACES
 *   1. Sales SOW page (scene_1116) — `decorateSalesCard(body, proposal)`, called
 *      by published-proposal-sow-card.js after it builds the Published Proposal
 *      card: a "Request extension" button → modal (requested date, prefilled
 *      +30 days; a one-line reason) → POST `request-extension`. While a request
 *      is open the card reads "Extension to 11/22 requested 10/23 · awaiting
 *      SVS" with Nudge / Cancel (`nudge-extension` / `cancel-extension`); while
 *      the sub re-prices it reads "Re-pricing" with no buttons.
 *      **Discontinued products BLOCK the request for sales**: when any line
 *      item on the SOW carries a product the catalog no longer offers
 *      (`SCW.catalog.isDisabled` === true, the worksheet's own discontinued
 *      verdict), the button is disabled and the card says which products to
 *      update on the worksheet first. The catalog not loaded = no block (the
 *      three-state contract: null is never a warning); the card repaints when
 *      the catalog lands, and the click re-checks.
 *   2. Ops pages — the reconcile page (scene_1155, one Published Proposal block
 *      per SOW header, `data-sow-record-id` on the block) and the Preview
 *      Proposal page (scene_1096, the block in view_3883, the SOW from the
 *      route): `decorateOps()` appends a compact row under every
 *      `.scw-pq-info` block with the same button, pending / re-pricing states
 *      and Nudge / Cancel. Ops CAN request over discontinued products, but only
 *      through a loud warning modal (`openOpsWarning`) that lists them and the
 *      risks and takes an explicit acknowledgement; the payload then carries
 *      `discontinuedProducts` + `riskAcknowledged`. With NO basis bid on the
 *      SOW (`field_2942` served and empty) there is no sub to ask: the row says
 *      so and points at the pencil, which stays the direct-write path.
 *   3. Sub bid page (scene_1149) — when the bid package carries the Builder
 *      "extension requested" flag (CONFIG.sub.requestedFlag, read off
 *      view_3552's record), a card above the bid document shows the requested
 *      quote date beside the bid's own expiration with three answers:
 *      Can't extend · Re-price instead · Extend bid to <date> (date editable,
 *      may be earlier). Each POSTs `confirm-extension`; the page writes nothing.
 *      The sub's SURVEYS DASHBOARD (scene_1140, where the notification's link
 *      and the portal both land them) gets a banner above the worksheet for
 *      every bid of the request that carries the flag — the requested date,
 *      the bid's own expiration and a "Review & answer" link to that bid's
 *      page (`renderDashboardBanner`, off the BID_packages grid view_3507).
 *   4. Reconcile page sub card — the "Bid expires" line and the "Extension
 *      pending" chip live in bid-review-v2/header.js (fields from
 *      bid-review/config.js: bidExpiration / bidExtensionFlag).
 *
 * STATE — one SOW field, three readings. `CONFIG.sow.status` is the SOW
 * header's STATUS_quote extension (blank / Requested / Re-pricing; a Yes/No
 * flag reads Yes = Requested). Make writes it at every turn (request → Requested,
 * extend / decline / cancel → blank, re-price → Re-pricing, the publish of the
 * re-priced proposal → blank). Until the field exists the sales and Ops pages
 * fall back to a per-tab sessionStorage marker written after a successful
 * send (Requested only — a re-price can only be learned from the record).
 *
 * THE HOOK IS THE SWITCH (2026-11-05, "don't show them to the user yet until we
 * get Make wired up"): while `MAKE_QUOTE_EXTENSION_WEBHOOK` is PLACEHOLDER
 * NOTHING extension-related renders on any surface — no buttons, no pending /
 * re-pricing lines, no sub card, no reconcile chip (header.js asks
 * `SCW.quoteExtension.enabled()`) — whatever the Builder fields say.
 * localStorage.scwQuoteExtPreview = '1' turns every surface on for QA in that
 * browser only (a send then reports the missing hook instead of pretending).
 * FAIL-OPEN: a field a view does not serve reads as "not configured" — the
 * sales / Ops pages fall back to the marker, the sub card does not render, the
 * reconcile chip stays off.
 *
 * Builder (fields created 2026-11-05): SOW header `STATUS_expiration extension`
 * field_3314 + `INPUT_requested quote expiration date` field_3315 — needed as
 * columns on view_3827 / view_3918 / view_3861; bid package `FLAG_expiration
 * extension requested` field_3316 + `INPUT_requested expiration date` field_3317
 * — on view_3552 / view_3573 (sub-bid-document.js drops the two bid rows from
 * the document header off the same keys).
 ******************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    webhookKey: 'MAKE_QUOTE_EXTENSION_WEBHOOK',
    defaultExtensionDays: 30,
    previewKey: 'scwQuoteExtPreview',      // localStorage '1' → every surface on in THIS browser, whatever the login (QA)
    hookOverrideKey: 'scwQuoteExtHook',    // localStorage: a hook URL for THIS browser while config.js still reads PLACEHOLDER
    // Preview logins (2026-11-05 — "I need all of this live for ME to test — show everything only to
    // micah.shearer@getscw.com"): while this list is NON-EMPTY every surface renders ONLY for these
    // logins (plus a browser carrying the preview flag), with or without the hook; the POSTs go to the
    // hook (config.js, else the per-browser override) and report "not configured" when there is none.
    // EMPTY = everyone, hook permitting (the pre-2026-11-05 switch). Clearing the list is the launch.
    previewEmails: ['micah.shearer@getscw.com'],
    // SOW header (Builder 2026-11-05): status = STATUS_expiration extension
    // (blank / Requested / Re-Pricing; a Yes/No flag would read Yes = Requested),
    // requestedDate = INPUT_requested quote expiration date. Read on every page
    // that shows a SOW record — fail-open where the view does not serve them.
    sow: { status: 'field_3314', requestedDate: 'field_3315' },
    // SOW line items (the discontinued-products gate): the product connection
    // and the SOW-header connection used to pick one SOW's lines off a grid.
    line: { product: 'field_1949', sow: 'field_2154' },
    basisField: 'field_2942',                // SOW → basis bid (REL_proposal basis); empty = no sub to ask
    sales: {
      scene: 'scene_1116',
      sowView: 'view_3827',                 // SOW-bound details view: the page's SOW record
      proposalView: 'view_3814',            // published-proposal details view (refetched after a send)
      sowIdField: 'field_2122',             // SOW ID "60486704913-SW1589" (the SW number)
      sowNameField: 'field_2126',
      linesView: 'view_3586'                // the sales worksheet grid: this SOW's line items
    },
    // Ops pages: one entry per scene. sowGrid = a SOW grid holding the block's
    // SOW (data-sow-record-id); sowView = a single-record SOW view (the page is
    // one SOW); linesView = the SOW line items on the scene; linesBySow = pick
    // this SOW's lines by their SOW connection (a grid over several SOWs).
    ops: {
      scene_1155: { sowGrid: 'view_3918', linesView: 'view_3921', linesBySow: true, refetch: 'view_3918' },
      scene_1096: { sowView: 'view_3861', linesView: 'view_4140', linesBySow: false, refetch: 'view_3861' }
    },
    sub: {
      scene: 'scene_1149',
      bidView: 'view_3552',                 // BID_package details: this page's bid record
      mountBefore: 'view_3550',             // the card sits above the bid document
      bidExpiration: 'field_2635',
      bidSow: 'field_2387',
      bidLabel: 'field_2638',
      requestedFlag: 'field_3316',          // bid FLAG_expiration extension requested (Yes/No, Builder 2026-11-05)
      requestedDate: 'field_3317',          // bid INPUT_requested expiration date
      // The QUOTE's expiration (SOW field_2135, the proposal's mirror — what Make gates a re-price on):
      // read off the bid record first, else off any view on the scene that serves it. Builder: add the
      // Matching SOW's expiration date (field_2135 through field_2387) as a column on view_3552. Until it is
      // served the card cannot say which re-price outcome applies and says "SCW reviews it" instead.
      quoteExpiration: 'field_2135',
      // The SURVEYS DASHBOARD (where the sub lands): one banner line per bid
      // of the request that carries the flag, linking to that bid's page.
      dashboard: { scene: 'scene_1140', bidsGrid: 'view_3507', bidPageSlug: 'edit-bid-package', mountBefore: 'view_3505' }
    }
  };

  var STYLE_ID = 'scw-qext-css';
  var NS = '.scwQuoteExt';
  var MARK = 'scw:qext:';                    // sessionStorage marker per SOW (fallback for the status field)
  var _warned = {};
  var _catWait = {};

  // ── Small helpers ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function strip(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function warnOnce(key, msg) {
    if (_warned[key]) return;
    _warned[key] = true;
    console.warn('[scw-quote-ext] ' + msg);
  }
  function hookUrl() {
    var u = (window.SCW && SCW.CONFIG && SCW.CONFIG[CONFIG.webhookKey]) || '';
    if (u && !/PLACEHOLDER/.test(u)) return u;
    // A tester's own browser can point at the hook before the URL is committed (never ships to anyone else).
    try {
      var o = String(localStorage.getItem(CONFIG.hookOverrideKey) || '').trim();
      if (/^https:\/\/hook\.[a-z0-9.-]+\.make\.com\/[A-Za-z0-9]+$/.test(o)) return o;
    } catch (e) { /* no storage */ }
    return '';
  }
  function previewOn() {
    try { return localStorage.getItem(CONFIG.previewKey) === '1'; } catch (e) { return false; }
  }
  function isPreviewUser() {
    var list = CONFIG.previewEmails || [];
    var e = String(user().email || '').trim().toLowerCase();
    if (!e) return false;
    for (var i = 0; i < list.length; i++) if (String(list[i]).trim().toLowerCase() === e) return true;
    return false;
  }
  /** The switch for every surface: the preview flag (this browser) → on; a non-empty preview list →
   *  only those logins; otherwise the hook URL. */
  function canAsk() {
    if (previewOn()) return true;
    if ((CONFIG.previewEmails || []).length) return isPreviewUser();
    return !!hookUrl();
  }
  /** The SUB's surfaces (bid-page card, dashboard banner + grid chips) use the SAME switch as
   *  every other surface — while the feature is in preview the list gates them too (decided
   *  2026-11-06: "this should still gate to micah.shearer@getscw.com"). To see them under a sub
   *  login, set the per-browser preview flag (localStorage.scwQuoteExtPreview = '1') in that browser. */
  function canShowSub() { return canAsk(); }
  function user() {
    try {
      var a = (window.Knack && Knack.getUserAttributes && Knack.getUserAttributes()) || {};
      return { name: a.name || '', email: a.email || '' };
    } catch (e) { return { name: '', email: '' }; }
  }
  function sceneKey() {
    try {
      var k = window.Knack && Knack.router && Knack.router.current_scene_key;
      if (k) return k;
    } catch (e) { /* fall through */ }
    var el = document.querySelector('[id^="kn-scene_"]');
    return el ? el.id.replace(/^kn-/, '') : '';
  }
  /** Every record a view holds: a details view's one record, a grid's rows. */
  function viewRecords(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var m = v && v.model;
      if (!m) return [];
      if (m.attributes && m.attributes.id) return [m.attributes];
      var models = (m.data && m.data.models) || [];
      var out = [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && (models[i].attributes || models[i]);
        if (a && a.id) out.push(a);
      }
      return out;
    } catch (e) { return []; }
  }
  function viewRecord(viewKey) { return viewRecords(viewKey)[0] || null; }
  function recordIn(viewKey, id) {
    var recs = viewRecords(viewKey);
    for (var i = 0; i < recs.length; i++) if (recs[i].id === id) return recs[i];
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
    var v = rec[key];
    if (v == null && typeof raw === 'string') v = raw;
    return strip(v);
  }
  function fieldServed(rec, key) { return !!(rec && key && (rec[key] !== undefined || rec[key + '_raw'] !== undefined)); }
  function fieldYes(rec, key) {
    if (!rec || !key) return false;
    var raw = rec[key + '_raw'];
    if (typeof raw === 'boolean') return raw;
    return /^(yes|true)$/i.test(strip(rec[key]));
  }
  function connIds(rec, key) {
    var raw = rec && key ? rec[key + '_raw'] : null, out = [];
    if (Array.isArray(raw)) { for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) out.push(raw[i].id); }
    else if (raw && raw.id) out.push(raw.id);
    return out;
  }
  function connId(rec, key) { return connIds(rec, key)[0] || ''; }

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
  function refetchView(viewKey, delayMs) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      if (v && v.model && typeof v.model.fetch === 'function') setTimeout(function () { v.model.fetch(); }, delayMs || 1500);
    } catch (e) { /* the next render picks it up */ }
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.scw-qext { margin: 10px 0 2px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px;' +
      '  background: #f8fafc; font: 400 12px/1.45 system-ui, sans-serif; color: #334155; text-align: left; }' +
      '.scw-qext--pending, .scw-qext--blocked { border-color: #fcd34d; background: #fffbeb; }' +
      '.scw-qext--repricing { border-color: #c7d2fe; background: #eef2ff; }' +
      '.scw-qext--held { border-color: #fcd34d; background: #fffbeb; }' +
      '.scw-totals-proposal .scw-qext { text-align: left; margin-top: 12px; }' +   // the sales Totals panel is right-aligned (scene-tweaks.js)
      '.scw-qext--ops { margin: 6px 0 0; padding: 6px 8px; font-size: 11.5px; }' +
      '.scw-qext--sub { margin: 0 0 14px; padding: 14px 16px; border-color: #fcd34d; background: #fffbeb; }' +
      '.scw-qext__title { font-weight: 700; font-size: 13px; color: #0f172a; margin: 0 0 4px; }' +
      // The state box is STACKED: the chip on its own line, then one fact per line, then the buttons —
      // an inline chip + sentence wrapped mid-sentence in the sales Totals panel's narrow column
      // (2026-11-06). The compact ops rows (reconcile / preview pages, wide) keep the one-line shape.
      '.scw-qext__head { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }' +
      '.scw-qext__head .scw-qext__chip { margin-right: 0; }' +
      '.scw-qext__line { margin: 2px 0; }' +
      '.scw-qext__line b { white-space: nowrap; }' +
      '.scw-qext--ops .scw-qext__head { display: inline-flex; margin: 0 6px 0 0; vertical-align: middle; }' +
      '.scw-qext--ops .scw-qext__line { display: inline; margin: 0; }' +
      '.scw-qext--ops .scw-qext__line + .scw-qext__line::before { content: " \\00b7 "; }' +
      '.scw-qext__muted { color: #64748b; }' +
      '.scw-qext__warn { color: #b45309; }' +
      '.scw-qext__row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }' +
      '.scw-qext--ops .scw-qext__row { margin-top: 4px; }' +
      '.scw-qext__btn { font: 600 12px/1 system-ui, sans-serif; padding: 7px 12px; border-radius: 6px; cursor: pointer;' +
      '  border: 1px solid #cbd5e1; background: #fff; color: #0f172a; }' +
      '.scw-qext--ops .scw-qext__btn { font-size: 11px; padding: 5px 9px; }' +
      '.scw-qext__btn:hover { background: #f1f5f9; }' +
      '.scw-qext__btn--primary { background: #1e3a8a; border-color: #1e3a8a; color: #fff; }' +
      '.scw-qext__btn--primary:hover { background: #1e40af; }' +
      '.scw-qext__btn--danger { color: #b91c1c; border-color: #fca5a5; }' +
      '.scw-qext__btn--danger:hover { background: #fef2f2; }' +
      '.scw-qext__btn--danger-solid { background: #dc2626; border-color: #dc2626; color: #fff; }' +
      '.scw-qext__btn--danger-solid:hover { background: #b91c1c; }' +
      '.scw-qext__btn--link { border-color: transparent; background: transparent; color: #1e3a8a; text-decoration: underline; padding-left: 0; padding-right: 0; }' +
      '.scw-qext__btn--link:hover { background: transparent; }' +
      '.scw-qext__btn[disabled] { opacity: .55; cursor: not-allowed; }' +
      '.scw-qext__chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font: 700 10px/1.6 system-ui, sans-serif;' +
      '  letter-spacing: .02em; text-transform: uppercase; background: #fef3c7; color: #b45309; margin-right: 6px; }' +
      '.scw-qext__chip--repricing { background: #e0e7ff; color: #3730a3; }' +
      '.scw-qext--sub .scw-qext__head { margin-bottom: 4px; }' +
      '.scw-qext__dashrow { padding: 8px 10px; margin-top: 8px; border: 1px solid #fcd34d; border-radius: 6px; background: #fff; justify-content: space-between; }' +
      '.scw-qext-gridchip { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin-top: 4px; font: 400 12px/1.4 system-ui, sans-serif; color: #334155; }' +
      '.scw-qext-gridchip .scw-qext__chip { margin-right: 0; }' +
      '.scw-qext-gridchip__link { font-weight: 600; color: #1e3a8a; text-decoration: underline; white-space: nowrap; }' +
      '.scw-qext__chip--held { background: #fef3c7; color: #92400e; }' +
      '.scw-qext__input { font: 400 13px/1.2 system-ui, sans-serif; padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 6px; width: 120px; }' +
      '.scw-qext__ta { font: 400 13px/1.4 system-ui, sans-serif; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%; min-height: 64px; box-sizing: border-box; }' +
      '.scw-qext__err { color: #b91c1c; margin-top: 6px; }' +
      '.scw-qext__ok { color: #166534; margin-top: 6px; }' +
      '.scw-qext__list { margin: 6px 0 0; padding-left: 18px; }' +
      '.scw-qext__list li { margin: 2px 0; }' +
      '.scw-qext-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.45); z-index: 10050; display: flex; align-items: center; justify-content: center; }' +
      '.scw-qext-modal { background: #fff; border-radius: 12px; width: min(480px, 92vw); padding: 18px 20px; box-shadow: 0 20px 50px rgba(15,23,42,.3);' +
      '  font: 400 13px/1.45 system-ui, sans-serif; color: #334155; }' +
      '.scw-qext-modal h3 { margin: 0 0 4px; font-size: 16px; color: #0f172a; }' +
      '.scw-qext-modal label { display: block; font-weight: 600; font-size: 12px; color: #475569; margin: 12px 0 4px; }' +
      '.scw-qext-modal__foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }' +
      '.scw-qext-modal--warn { width: min(560px, 94vw); border-top: 6px solid #dc2626; }' +
      '.scw-qext-modal--warn h3 { color: #b91c1c; font-size: 18px; }' +
      '.scw-qext-modal--warn .scw-qext-warn__lead { font-size: 14px; color: #0f172a; margin: 6px 0 10px; }' +
      '.scw-qext-modal--warn .scw-qext-warn__products { margin: 0 0 12px; padding: 10px 12px; border: 1px solid #fecaca; border-radius: 8px; background: #fef2f2; }' +
      '.scw-qext-modal--warn .scw-qext-warn__products li { font-weight: 600; color: #991b1b; }' +
      '.scw-qext-modal--warn ul.scw-qext-warn__risks { margin: 6px 0 10px; padding-left: 20px; }' +
      '.scw-qext-modal--warn ul.scw-qext-warn__risks li { margin: 4px 0; }' +
      '.scw-qext-modal--warn .scw-qext-warn__ack { display: flex; align-items: flex-start; gap: 8px; margin: 14px 0 0; padding: 10px 12px;' +
      '  border: 1px dashed #fca5a5; border-radius: 8px; font-weight: 600; color: #0f172a; cursor: pointer; }' +
      '.scw-qext-modal--warn .scw-qext-warn__ack input { margin-top: 2px; }';
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STATE — the SOW field (three readings) with the session marker behind it
  // ═══════════════════════════════════════════════════════════════════════
  function markerKey(sowId) { return MARK + sowId; }
  function readMarker(sowId) {
    try { var v = sessionStorage.getItem(markerKey(sowId)); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function writeMarker(sowId, obj) {
    try { if (obj) sessionStorage.setItem(markerKey(sowId), JSON.stringify(obj)); else sessionStorage.removeItem(markerKey(sowId)); } catch (e) { /* ignore */ }
  }
  /** 'requested' | 'repricing' | 'reprice-requested' | '' off the SOW record's status
   *  field; undefined when the field is not configured or not served on the record.
   *  'reprice-requested' (Builder option "Re-Price Requested"): the sub answered
   *  "re-price" while the proposal had NOT expired — the bid stays locked until Ops
   *  reopens it or keeps the quote (2026-11-05). */
  function statusKind(rec) {
    var key = CONFIG.sow.status;
    if (!key || !fieldServed(rec, key)) return undefined;
    var raw = rec[key + '_raw'];
    if (typeof raw === 'boolean') return raw ? 'requested' : '';
    var t = strip(rec[key] != null ? rec[key] : raw).toLowerCase();
    if (/re-?pric\w*[\s_-]*request/.test(t)) return 'reprice-requested';
    if (/re-?pric/.test(t)) return 'repricing';
    if (/request|pending|^yes$|^true$/.test(t)) return 'requested';
    return '';
  }
  /** { kind: 'requested' | 'repricing' | 'reprice-requested', requestedDate, at, routedTo, source }
   *  when an extension is open on this SOW: the record's status field when
   *  configured and served, else the session marker (Requested only). */
  function extensionState(rec, sowId) {
    var kind = statusKind(rec);
    if (kind !== undefined) {
      if (!kind) { writeMarker(sowId, null); return null; }
      var m = readMarker(sowId) || {};
      return { kind: kind, requestedDate: fieldText(rec, CONFIG.sow.requestedDate) || m.requestedDate || '',
               at: m.at || '', routedTo: m.routedTo || 'svs', source: 'record' };
    }
    var mk = readMarker(sowId);
    return mk ? { kind: 'requested', requestedDate: mk.requestedDate, at: mk.at, routedTo: mk.routedTo || '', source: 'marker' } : null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // THE DISCONTINUED-PRODUCTS GATE
  // ═══════════════════════════════════════════════════════════════════════
  /** One SOW's line items off a grid: every record when the page is one SOW,
   *  else the rows whose SOW connection names the SOW. */
  function sowLines(linesView, sowId, bySow) {
    var recs = viewRecords(linesView);
    if (!bySow || !sowId) return recs;
    var out = [];
    for (var i = 0; i < recs.length; i++) if (connIds(recs[i], CONFIG.line.sow).indexOf(sowId) !== -1) out.push(recs[i]);
    return out;
  }
  /** { ready, items: [{ id, name, count }] } — the products among these line
   *  items that the catalog no longer offers (isDisabled === true), with how
   *  many lines carry each. ready:false = the catalog cannot say (nothing is
   *  flagged; the caller repaints when it lands). */
  function discontinuedIn(records) {
    var cat = window.SCW && SCW.catalog;
    if (!cat || typeof cat.isDisabled !== 'function' || (typeof cat.isReady === 'function' && !cat.isReady())) return { ready: false, items: [] };
    var by = Object.create(null), order = [];
    for (var i = 0; i < (records || []).length; i++) {
      var rec = records[i], pid = connId(rec, CONFIG.line.product);
      if (!pid || cat.isDisabled(pid) !== true) continue;
      if (!by[pid]) { by[pid] = { id: pid, name: fieldText(rec, CONFIG.line.product) || pid, count: 0 }; order.push(pid); }
      by[pid].count += 1;
    }
    return { ready: true, items: order.map(function (k) { return by[k]; }) };
  }
  /** Run fn once the catalog lands (once per key, only while it is not ready). */
  function onCatalogReady(key, fn) {
    var cat = window.SCW && SCW.catalog;
    if (!cat || typeof cat.ready !== 'function') return;
    if (typeof cat.isReady === 'function' && cat.isReady()) return;
    if (_catWait[key]) return;
    _catWait[key] = true;
    cat.ready(function () { _catWait[key] = false; try { fn(); } catch (e) { /* a repaint never throws out */ } });
  }
  function productListHtml(items) {
    return items.map(function (p) { return '<b>' + esc(p.name) + '</b> (' + plural(p.count, 'line item', 'line items') + ')'; }).join(', ');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // THE REQUEST MODAL + THE OPS WARNING (shared by sales and Ops)
  // ═══════════════════════════════════════════════════════════════════════
  function requestText(ctx) {
    var who = (ctx.by.name || ctx.by.email || 'sales') + (ctx.requestedBy === 'ops' ? ' (Ops)' : '');
    var lines = [
      'Quote extension requested',
      (ctx.projectNumber ? 'Project ' + ctx.projectNumber + ' · ' : '') + 'SOW ' + ctx.sowLabel + (ctx.proposalName ? ' · ' + ctx.proposalName : ''),
      'Current expiration: ' + (ctx.currentQuoteExpiration || '—'),
      'Requested: ' + ctx.requestedDate,
      'Reason: ' + ctx.reason
    ];
    if (ctx.discontinued && ctx.discontinued.length) {
      lines.push('WARNING — requested despite ' + plural(ctx.discontinued.length, 'discontinued product', 'discontinued products') + ' on the SOW: ' +
        ctx.discontinued.map(function (p) { return p.name + ' (' + p.count + ')'; }).join(', ') + ' — risk acknowledged by the requester');
    }
    lines.push('Requested by ' + who + ' on ' + todayMdy());
    return lines.join('\n');
  }
  function requestHtml(ctx) {
    var who = (ctx.by.name || ctx.by.email || 'sales') + (ctx.requestedBy === 'ops' ? ' (Ops)' : '');
    return '<p><b>Quote extension requested</b></p>' +
      '<p>' + esc((ctx.projectNumber ? 'Project ' + ctx.projectNumber + ' · ' : '') + 'SOW ' + ctx.sowLabel) +
      (ctx.proposalName ? ' · ' + esc(ctx.proposalName) : '') + '</p>' +
      '<p>Current expiration: ' + esc(ctx.currentQuoteExpiration || '—') + '<br>Requested: <b>' + esc(ctx.requestedDate) + '</b></p>' +
      '<p>Reason: ' + esc(ctx.reason) + '</p>' +
      (ctx.discontinued && ctx.discontinued.length
        ? '<p><b>WARNING</b> — requested despite ' + esc(plural(ctx.discontinued.length, 'discontinued product', 'discontinued products')) +
          ' on the SOW: ' + ctx.discontinued.map(function (p) { return esc(p.name) + ' (' + p.count + ')'; }).join(', ') + ' — risk acknowledged by the requester</p>'
        : '') +
      '<p><i>Requested by ' + esc(who) + ' on ' + esc(todayMdy()) + '</i></p>';
  }
  function closeModal() {
    var o = document.getElementById('scw-qext-overlay');
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }
  /** The request modal: requested date (prefilled +30 days) + a reason.
   *  ctx: { sowId, sowLabel, projectNumber, requestedBy: 'sales' | 'ops',
   *  discontinued: [{ id, name, count }] | null } — the sales defaults apply
   *  when a key is missing. onSent(routedTo, mdy) after a delivered send. */
  function openRequestModal(proposal, onSent, ctx) {
    ctx = ctx || {};
    injectStyles();
    closeModal();
    var current = normalizeMdy(proposal.expDate || '');
    var isOps = ctx.requestedBy === 'ops';
    var overlay = document.createElement('div');
    overlay.className = 'scw-qext-overlay';
    overlay.id = 'scw-qext-overlay';
    overlay.innerHTML =
      '<div class="scw-qext-modal" role="dialog" aria-label="Request an extension">' +
        '<h3>Request an extension</h3>' +
        '<div class="scw-qext__muted">Goes to the sub whose bid this quote rests on. If the date you ask for is within their bid\'s ' +
          'validity it is extended at once; otherwise they confirm first. ' + (isOps ? 'The deal tasks are updated.' : 'Ops is copied on the deal task.') + '</div>' +
        (ctx.discontinued && ctx.discontinued.length
          ? '<div class="scw-qext__warn" style="margin-top:8px">Requested over ' + esc(plural(ctx.discontinued.length, 'discontinued product', 'discontinued products')) +
            ' — the request will say so.</div>' : '') +
        '<label>New expiration date' + (current ? ' <span class="scw-qext__muted">(currently ' + esc(current) + ')</span>' : '') + '</label>' +
        '<input class="scw-qext__input" data-qext-date type="text" inputmode="numeric" placeholder="M/D/YYYY" value="' + esc(suggestedDate(current)) + '">' +
        '<label>Reason</label>' +
        '<textarea class="scw-qext__ta" data-qext-reason placeholder="One line the sub' + (isOps ? '' : ' and Ops') + ' will read — e.g. client decides at the 11/18 board meeting"></textarea>' +
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
      if (!reason) return fail(isOps ? 'Give the sub one line on why.' : 'Give the sub and Ops one line on why.');
      var sowId = ctx.sowId || salesSowId();
      if (!sowId) return fail('Could not tell which SOW this page is — reload and try again.');
      var full = {
        sowId: sowId, sowLabel: ctx.sowLabel != null ? ctx.sowLabel : salesSowLabel(),
        projectNumber: ctx.projectNumber != null ? ctx.projectNumber : projectNumber(CONFIG.sales.scene),
        proposalName: proposal.name || '', proposalRecordId: proposal.recordId || '',
        currentQuoteExpiration: current, requestedDate: mdy, reason: reason, by: user(),
        requestedBy: isOps ? 'ops' : 'sales', discontinued: ctx.discontinued || null
      };
      var payload = {
        stepId: 'request-extension', sowId: full.sowId, proposalRecordId: full.proposalRecordId,
        requestedDate: mdy, reason: reason, currentQuoteExpiration: current, triggeredBy: full.by,
        requestedBy: full.requestedBy, requestText: requestText(full), requestHtml: requestHtml(full)
      };
      if (full.discontinued && full.discontinued.length) {
        payload.discontinuedProducts = full.discontinued.map(function (p) { return { id: p.id, name: p.name, count: p.count }; });
        payload.riskAcknowledged = true;
      }
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; err.hidden = true;
      post(payload).then(function (res) {
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
  /** The loud one: Ops asked for an extension on a SOW that carries
   *  discontinued products. Lists them and the risks; "Request extension
   *  anyway" is disabled until the acknowledgement is ticked. */
  function openOpsWarning(items, onProceed) {
    injectStyles();
    closeModal();
    var overlay = document.createElement('div');
    overlay.className = 'scw-qext-overlay';
    overlay.id = 'scw-qext-overlay';
    overlay.innerHTML =
      '<div class="scw-qext-modal scw-qext-modal--warn" role="alertdialog" aria-label="Discontinued products on this SOW">' +
        '<h3>&#9888; This SOW carries discontinued products</h3>' +
        '<div class="scw-qext-warn__lead">' + esc(plural(items.length, 'product', 'products')) + ' on this scope of work ' +
          (items.length === 1 ? 'is' : 'are') + ' no longer offered in the catalog. Sales is blocked from requesting an extension until the lines are updated. ' +
          'You can request it anyway — read this first.</div>' +
        '<ul class="scw-qext-warn__products">' + items.map(function (p) {
          return '<li>' + esc(p.name) + ' <span class="scw-qext__muted" style="font-weight:400">— ' + esc(plural(p.count, 'line item', 'line items')) + '</span></li>';
        }).join('') + '</ul>' +
        '<div><b>Extending this quote means:</b></div>' +
        '<ul class="scw-qext-warn__risks">' +
          '<li>The client is promised equipment SCW can no longer supply, at a price nobody can hold.</li>' +
          '<li>The sub\'s bid prices labor for products that will have to be swapped — the bid may not stand once they are.</li>' +
          '<li>If the client accepts, every one of these lines becomes a change order, a re-bid or a loss after the fact.</li>' +
        '</ul>' +
        '<div class="scw-qext__muted">The right fix is to update the lines on the Build SOW page, re-publish, then request the extension. ' +
          'The request will carry this warning to the sub and onto the deal tasks.</div>' +
        '<label class="scw-qext-warn__ack"><input type="checkbox" data-qext-ack> I understand the risk and want to request the extension anyway.</label>' +
        '<div class="scw-qext-modal__foot">' +
          '<button type="button" class="scw-qext__btn" data-qext-cancel>Cancel</button>' +
          '<button type="button" class="scw-qext__btn scw-qext__btn--danger-solid" data-qext-proceed disabled>Request extension anyway</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var ack = overlay.querySelector('[data-qext-ack]'), go = overlay.querySelector('[data-qext-proceed]');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    overlay.querySelector('[data-qext-cancel]').addEventListener('click', closeModal);
    ack.addEventListener('change', function () { go.disabled = !ack.checked; });
    go.addEventListener('click', function () {
      if (!ack.checked) return;
      closeModal();
      if (typeof onProceed === 'function') onProceed(items);
    });
  }

  // ── Shared pieces of the state boxes ────────────────────────────────────
  function stateHtml(state, opts) {
    opts = opts || {};
    if (state.kind === 'repricing') {
      return '<div class="scw-qext__head"><span class="scw-qext__chip scw-qext__chip--repricing">Re-pricing</span></div>' +
        '<div class="scw-qext__line">The sub is re-pricing this bid. The quote keeps its current expiration until Ops publishes the re-priced proposal.</div>';
    }
    if (state.kind === 'reprice-requested') {
      // The sub answered "re-price" while the proposal had not expired: Make left the bid LOCKED
      // and asked Ops. Ops decides here (the reconcile / preview rows); sales only reads it.
      return '<div class="scw-qext__head"><span class="scw-qext__chip scw-qext__chip--held">Re-price requested</span></div>' +
        '<div class="scw-qext__line">The sub asked to <b>re-price</b> this bid instead of extending it. The proposal has not expired, so the bid stays locked ' +
        'until Ops decides: reopen it for re-pricing, or keep the quote as it is and close before it expires.</div>' +
        (opts.ops
          ? '<div class="scw-qext__row">' +
              '<button type="button" class="scw-qext__btn" data-qext-keep>Keep quote as is</button>' +
              '<button type="button" class="scw-qext__btn scw-qext__btn--primary" data-qext-reopen>Reopen bid for re-pricing</button>' +
              '<span class="scw-qext__muted">Keep = the bid stays submitted and the sub is told; Reopen = bid back to Draft, the tasks stay in Waiting on Bid while the sub re-prices.</span>' +
            '</div>'
          : '<div class="scw-qext__muted">Ops decides on the Reconcile Bids page — tell them if the client will close before the quote expires.</div>');
    }
    var where = state.routedTo === 'ops' ? 'with Ops' : state.routedTo === 'svs' ? 'awaiting SVS' : 'awaiting a reply';
    return '<div class="scw-qext__head"><span class="scw-qext__chip">Extension pending</span></div>' +
      '<div class="scw-qext__line">Extension to <b>' + esc(state.requestedDate || '—') + '</b></div>' +
      '<div class="scw-qext__line scw-qext__muted">' + (state.at ? 'Requested ' + esc(state.at) + ' · ' + esc(where) : esc(where.charAt(0).toUpperCase() + where.slice(1))) + '</div>' +
      '<div class="scw-qext__row">' +
        '<button type="button" class="scw-qext__btn scw-qext__btn--danger" data-qext-cancel-req>Cancel request</button>' +
        '<button type="button" class="scw-qext__btn" data-qext-nudge>Nudge</button>' +
      '</div>';
  }
  function bindPendingButtons(box, sowId, redraw) {
    var nudge = box.querySelector('[data-qext-nudge]'), cancel = box.querySelector('[data-qext-cancel-req]');
    if (nudge) nudge.addEventListener('click', function (e) {
      var b = e.currentTarget; b.disabled = true;
      post({ stepId: 'nudge-extension', sowId: sowId }).then(function (res) {
        b.disabled = false;
        toast(res.ok ? 'Reminder sent' : errText(res, 'The reminder'), res.ok ? 'success' : 'error');
      });
    });
    if (cancel) cancel.addEventListener('click', function (e) {
      if (!window.confirm('Cancel the extension request? The quote keeps its current expiration.')) return;
      var b = e.currentTarget; b.disabled = true;
      post({ stepId: 'cancel-extension', sowId: sowId }).then(function (res) {
        if (!res.ok) { b.disabled = false; return toast(errText(res, 'The cancel'), 'error'); }
        writeMarker(sowId, null);
        toast('Extension request cancelled', 'success');
        redraw();
      });
    });
  }
  /** The Ops decision on a held re-price: keep the quote (the bid stays submitted) or reopen
   *  the bid for re-pricing. Each is ONE POST; Make writes the status and moves the tasks. */
  function bindHeldButtons(box, sowId, redraw) {
    var keep = box.querySelector('[data-qext-keep]'), reopen = box.querySelector('[data-qext-reopen]');
    function send(btn, stepId, confirmText, okText, what) {
      if (!window.confirm(confirmText)) return;
      btn.disabled = true;
      post({ stepId: stepId, sowId: sowId }).then(function (res) {
        if (!res.ok) { btn.disabled = false; return toast(errText(res, what), 'error'); }
        writeMarker(sowId, null);
        toast(okText, 'success');
        redraw();
      });
    }
    if (keep) keep.addEventListener('click', function (e) {
      send(e.currentTarget, 'keep-quote', 'Keep the quote as it is? The bid stays submitted and locked, the sub is told no re-price is needed, and the deal tasks return to Final Bid Submitted.',
        'Quote kept — the sub has been told', 'The decision');
    });
    if (reopen) reopen.addEventListener('click', function (e) {
      send(e.currentTarget, 'reopen-reprice', 'Reopen the bid for re-pricing? The bid goes back to Draft, its lines unlock, the SOW reads Re-Pricing and both deal tasks sit in Waiting on Bid while the sub re-prices.',
        'Bid reopened for re-pricing — the sub has been told', 'The reopen');
    });
  }
  /** Called by the reconcile page's native Reopen Bid (bid-review/init.js) after its PUTs land:
   *  when the SOW is waiting on exactly that decision, tell Make so the status, the tasks and
   *  the sub's comment follow (the bid writes Make repeats are idempotent). */
  function afterReopenBid(sowId) {
    try {
      var cfg = opsCfg();
      if (!cfg || !sowId || !canAsk()) return false;
      var state = extensionState(opsSowRecord(cfg, sowId), sowId);
      if (!state || state.kind !== 'reprice-requested') return false;
      post({ stepId: 'reopen-reprice', sowId: sowId }).then(function (res) {
        if (res.ok) { writeMarker(sowId, null); decorateOps(); refetchView(cfg.refetch); }
        else toast(errText(res, 'Telling Make about the reopen'), 'error');
      });
      return true;
    } catch (e) { return false; }
  }
  function projectNumber(scene) {
    try {
      var p = window.SCW && SCW.projectId && SCW.projectId.resolve && SCW.projectId.resolve(scene);
      if (!p) return '';
      if (typeof p === 'string') return p;
      return String(p.id || p.number || p.value || '');
    } catch (e) { return ''; }
  }
  function sowLabelOf(rec) {
    var id = fieldText(rec, CONFIG.sales.sowIdField);
    var m = id.match(/SW-?(\d+)/i);
    if (m) return m[1];
    return fieldText(rec, CONFIG.sales.sowNameField) || id || '';
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
    return sowLabelOf(salesSowRecord());
  }
  /** The sales page's extension state for this SOW (record field, else marker). */
  function pendingState(sowId) { return extensionState(salesSowRecord(), sowId); }
  function salesDiscontinued() { return discontinuedIn(sowLines(CONFIG.sales.linesView, salesSowId(), false)); }
  function scrollToWorksheet() {
    var el = document.querySelector('.scw-ws-v2-discontinued-bar') || document.getElementById(CONFIG.sales.linesView);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  /** Called by published-proposal-sow-card.js with the card body + the
   *  proposal it rendered ({ recordId, name, expDate, expired, … }). */
  function decorateSalesCard(body, proposal) {
    if (!body || !proposal) return;
    injectStyles();
    var old = body.querySelector('.scw-qext');
    if (old) old.parentNode.removeChild(old);
    if (!canAsk()) return;                     // the hook is the switch: nothing renders until Make is wired
    var sowId = salesSowId();
    var state = sowId ? pendingState(sowId) : null;
    var note = body.querySelector('.scw-pq-expired-note');
    var box = document.createElement('div');
    box.className = 'scw-qext';
    function redraw() { decorateSalesCard(body, proposal); refetchView(CONFIG.sales.proposalView); }
    if (state && state.kind === 'repricing') {
      box.className += ' scw-qext--repricing';
      box.setAttribute('data-scw-qext', 'repricing');
      box.innerHTML = stateHtml(state);
      if (note) note.innerHTML = '<strong>This proposal is expired.</strong> The sub is re-pricing the bid — a re-published proposal follows.';
      body.appendChild(box);
      return;
    }
    if (state && state.kind === 'reprice-requested') {
      box.className += ' scw-qext--held';
      box.setAttribute('data-scw-qext', 'reprice-requested');
      box.innerHTML = stateHtml(state);
      if (note) note.innerHTML = '<strong>This proposal is expired.</strong> The sub asked to re-price the bid — Ops decides whether to reopen it.';
      body.appendChild(box);
      return;
    }
    if (state) {
      box.className += ' scw-qext--pending';
      box.setAttribute('data-scw-qext', 'pending');
      box.innerHTML = stateHtml(state);
      if (note) note.innerHTML = '<strong>This proposal is expired.</strong> An extension is pending — the customer link stays off until it lands.';
      bindPendingButtons(box, sowId, redraw);
      body.appendChild(box);
      return;
    }
    var disc = salesDiscontinued();
    if (!disc.ready) onCatalogReady('sales', function () { if (body.isConnected !== false && document.body.contains(body)) decorateSalesCard(body, proposal); });
    if (disc.items.length) {
      box.className += ' scw-qext--blocked';
      box.setAttribute('data-scw-qext', 'blocked');
      box.setAttribute('data-qext-discontinued', String(disc.items.length));
      box.innerHTML =
        '<div class="scw-qext__head"><span class="scw-qext__chip">Extension unavailable</span></div>' +
        '<div class="scw-qext__line">This scope of work carries ' +
          esc(plural(disc.items.length, 'discontinued product', 'discontinued products')) + ' the catalog no longer offers: ' + productListHtml(disc.items) + '.</div>' +
        '<div class="scw-qext__line">Update those line items on the worksheet below — swap each one to a current product — then request the extension here.</div>' +
        '<div class="scw-qext__row">' +
          '<button type="button" class="scw-qext__btn scw-qext__btn--primary" data-qext-request disabled title="Update the discontinued products on this SOW first">Request extension</button>' +
          '<button type="button" class="scw-qext__btn scw-qext__btn--link" data-qext-show>Show them on the worksheet</button>' +
        '</div>';
      if (note) note.innerHTML = '<strong>This proposal is expired.</strong> Update the discontinued products below before an extension can be requested.';
      box.querySelector('[data-qext-show]').addEventListener('click', scrollToWorksheet);
      body.appendChild(box);
      return;
    }
    box.setAttribute('data-scw-qext', 'ready');
    box.innerHTML =
      '<div class="scw-qext__muted">' + (proposal.expired
        ? 'This proposal is expired. Ask the sub to hold their bid and the quote is extended with it.'
        : 'Need more time? The sub whose bid this quote rests on is asked directly; Ops is copied.') + '</div>' +
      '<div class="scw-qext__row"><button type="button" class="scw-qext__btn scw-qext__btn--primary" data-qext-request>Request extension</button></div>';
    if (note) note.innerHTML = '<strong>This proposal is expired.</strong> Request an extension below before re-sharing the customer link.';
    box.querySelector('[data-qext-request]').addEventListener('click', function () {
      // The catalog may have landed since the paint: a discontinued product
      // found now blocks the request and repaints the card instead.
      if (salesDiscontinued().items.length) { decorateSalesCard(body, proposal); return; }
      openRequestModal(proposal, redraw, { requestedBy: 'sales' });
    });
    body.appendChild(box);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. OPS PAGES — a row under every Published Proposal block
  // ═══════════════════════════════════════════════════════════════════════
  function opsCfg() {
    var key = sceneKey();
    if (!key || !CONFIG.ops[key]) return null;
    var c = CONFIG.ops[key], out = { scene: key };
    for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) out[k] = c[k];
    return out;
  }
  function opsSowId(block, cfg) {
    var id = block.getAttribute('data-sow-record-id');
    if (id) return id;
    var m = String(window.location.hash || '').match(/proposals\/proposal\/([a-f0-9]{24})/i);
    if (m) return m[1];
    if (cfg.sowView) { var r = viewRecord(cfg.sowView); if (r && r.id) return r.id; }
    return '';
  }
  function opsSowRecord(cfg, sowId) {
    if (cfg.sowGrid) return recordIn(cfg.sowGrid, sowId);
    var r = viewRecord(cfg.sowView);
    return (r && (!sowId || r.id === sowId)) ? r : null;
  }
  function proposalFromBlock(block) {
    var exp = block.querySelector('.scw-pq-exp'), name = block.querySelector('.scw-pq-name');
    var m = exp ? (exp.textContent || '').match(/(\d{1,2}\/\d{1,2}\/\d{4})/) : null;
    return { recordId: block.getAttribute('data-proposal-record-id') || '', name: name ? strip(name.textContent) : '',
             expDate: m ? m[1] : '', expired: !!(exp && exp.classList.contains('scw-pq-exp--past')) };
  }
  function opsDiscontinued(cfg, sowId) { return discontinuedIn(sowLines(cfg.linesView, sowId, cfg.linesBySow)); }
  function startOpsRequest(cfg, block, sowId, sowRec) {
    var proposal = proposalFromBlock(block);
    var ctx = { sowId: sowId, sowLabel: sowLabelOf(sowRec), projectNumber: projectNumber(cfg.scene), requestedBy: 'ops', discontinued: null };
    function onSent() { decorateOps(); refetchView(cfg.refetch); }
    var disc = opsDiscontinued(cfg, sowId);
    if (disc.items.length) {
      openOpsWarning(disc.items, function (items) { ctx.discontinued = items; openRequestModal(proposal, onSent, ctx); });
      return;
    }
    openRequestModal(proposal, onSent, ctx);
  }
  function buildOpsBox(cfg, block) {
    var sowId = opsSowId(block, cfg);
    if (!sowId || !canAsk()) return null;      // the hook is the switch: nothing renders until Make is wired
    var sowRec = opsSowRecord(cfg, sowId);
    var state = extensionState(sowRec, sowId);
    var box = document.createElement('div');
    box.className = 'scw-qext scw-qext--ops';
    box.setAttribute('data-qext-for', block.getAttribute('data-proposal-record-id') || '');
    box.setAttribute('data-qext-sow', sowId);
    if (state && state.kind === 'repricing') {
      box.className += ' scw-qext--repricing';
      box.setAttribute('data-scw-qext', 'repricing');
      box.innerHTML = stateHtml(state);
      return box;
    }
    if (state && state.kind === 'reprice-requested') {
      box.className += ' scw-qext--held';
      box.setAttribute('data-scw-qext', 'reprice-requested');
      box.innerHTML = stateHtml(state, { ops: true });
      bindHeldButtons(box, sowId, function () { decorateOps(); refetchView(cfg.refetch); });
      return box;
    }
    if (state) {
      box.className += ' scw-qext--pending';
      box.setAttribute('data-scw-qext', 'pending');
      box.innerHTML = stateHtml(state);
      bindPendingButtons(box, sowId, function () { decorateOps(); refetchView(cfg.refetch); });
      return box;
    }
    if (fieldServed(sowRec, CONFIG.basisField) && !connId(sowRec, CONFIG.basisField)) {
      box.setAttribute('data-scw-qext', 'nobasis');
      box.innerHTML = '<div class="scw-qext__muted">No basis bid on this SOW — there is no sub to ask. Extend the date with the pencil.</div>';
      return box;
    }
    var disc = opsDiscontinued(cfg, sowId);
    if (!disc.ready) onCatalogReady('ops', decorateOps);
    box.setAttribute('data-scw-qext', 'ready');
    box.setAttribute('data-qext-discontinued', String(disc.items.length));
    box.innerHTML =
      (disc.items.length
        ? '<div class="scw-qext__warn">&#9888; ' + esc(plural(disc.items.length, 'discontinued product', 'discontinued products')) + ' on this SOW: ' +
          productListHtml(disc.items) + '. Sales is blocked; you will be asked to confirm.</div>'
        : '') +
      '<div class="scw-qext__row">' +
        '<button type="button" class="scw-qext__btn scw-qext__btn--primary" data-qext-request>Request extension from sub</button>' +
        '<span class="scw-qext__muted">Asks the basis bid\'s sub to hold their price; the deal tasks follow.</span>' +
      '</div>';
    box.querySelector('[data-qext-request]').addEventListener('click', function () { startOpsRequest(cfg, block, sowId, sowRec); });
    return box;
  }
  /** Idempotent: every `.scw-pq-info` block on an Ops scene gets (or keeps)
   *  one row right after it; a row whose content is unchanged is left alone. */
  function decorateOps() {
    var cfg = opsCfg();
    if (!cfg) return;
    injectStyles();
    var blocks = document.querySelectorAll('.scw-pq-info[data-proposal-record-id]');
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (block.classList.contains('scw-pq-empty') || !block.parentNode) continue;
      var next = block.nextElementSibling;
      var existing = (next && next.classList && next.classList.contains('scw-qext--ops')) ? next : null;
      var fresh = buildOpsBox(cfg, block);
      if (!fresh) { if (existing) existing.parentNode.removeChild(existing); continue; }
      if (existing && existing.getAttribute('data-scw-qext') === fresh.getAttribute('data-scw-qext') && existing.innerHTML === fresh.innerHTML) continue;
      if (existing) block.parentNode.replaceChild(fresh, existing);
      else block.parentNode.insertBefore(fresh, block.nextSibling);
    }
  }
  var _opsTimer = null;
  function decorateOpsSoon() {
    clearTimeout(_opsTimer);
    _opsTimer = setTimeout(decorateOps, 180);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. SUB BID PAGE
  // ═══════════════════════════════════════════════════════════════════════
  function subBidRecord() { return viewRecord(CONFIG.sub.bidView); }
  /** The quote's expiration as M/D/YYYY, '' when no view on the page serves it. */
  function subQuoteExpiration() {
    var key = CONFIG.sub.quoteExpiration;
    if (!key) return '';
    var v = normalizeMdy(fieldText(subBidRecord(), key));
    if (v) return v;
    try {
      var views = (window.Knack && Knack.views) || {};
      for (var k in views) {
        if (!Object.prototype.hasOwnProperty.call(views, k)) continue;
        var recs = viewRecords(k);
        for (var i = 0; i < recs.length; i++) { v = normalizeMdy(fieldText(recs[i], key)); if (v) return v; }
      }
    } catch (e) { /* no page data */ }
    return '';
  }
  /** Which re-price path applies to THIS bid (the rule Make applies): the quote has expired → the bid
   *  reopens at once; still running → SCW decides first; unknown → the page cannot say.
   *  The sub is shown only the outcome that applies, never the if / then (2026-11-06). */
  function repriceOutcome() {
    var exp = subQuoteExpiration();
    if (!exp) return { kind: 'unknown', date: '' };
    var expired = mdyToDate(exp) < mdyToDate(todayMdy());
    return { kind: expired ? 'expired' : 'running', date: exp };
  }
  function repriceOutcomeText(o) {
    if (o.kind === 'expired') return 'the quote expired ' + esc(o.date) + ', so your bid reopens for re-pricing right away.';
    if (o.kind === 'running') return 'the quote runs until ' + esc(o.date) + ', so SCW decides whether to reopen your bid and answers on your task.';
    return 'SCW reviews it and answers on your task.';
  }
  function repriceSentText(o) {
    if (o.kind === 'expired') return 'Sent. Your bid is reopened for re-pricing.';
    if (o.kind === 'running') return 'Sent. The quote runs until ' + o.date + ', so SCW decides whether to reopen your bid — you will hear on your task.';
    return 'Sent. SCW reviews it and answers on your task.';
  }
  function renderSubCard() {
    var c = CONFIG.sub;
    var existing = document.getElementById('scw-qext-sub');
    if (!c.requestedFlag) {
      warnOnce('subflag', 'CONFIG.sub.requestedFlag is not set (Builder: bid package "FLAG_extension requested") — the extension card never renders');
      if (existing) existing.parentNode.removeChild(existing);
      return;
    }
    if (!canShowSub()) { if (existing) existing.parentNode.removeChild(existing); return; }   // the hook is the switch
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
    var outcome = repriceOutcome();
    card.setAttribute('data-scw-qext-reprice', outcome.kind);
    card.innerHTML =
      '<div class="scw-qext__title">SCW asks you to hold this bid' + (requested ? ' until ' + esc(requested) : '') + '</div>' +
      '<div class="scw-qext__line">The client needs more time on the quote. Your bid currently expires <b>' + esc(bidExp || '—') + '</b>.</div>' +
      '<ul class="scw-qext__list scw-qext__muted">' +
        '<li><b>Extend</b> if your price still stands — an earlier date than requested is fine; the quote follows your date.</li>' +
        '<li><b>Re-price instead</b> if your costs have changed — ' + repriceOutcomeText(outcome) + '</li>' +
        '<li><b>Can\'t extend</b> — the quote keeps its current expiration.</li>' +
      '</ul>' +
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
          // Make's reply says which way a re-price went (reopened now, or held for Ops while the
          // quote still runs); a bare / opaque reply gets the generic line.
          var replyMsg = res.data && typeof res.data.message === 'string' ? res.data.message.trim() : '';
          card.innerHTML = '<div class="scw-qext__title">Sent to SCW</div><div class="scw-qext__ok">' + esc(
            outcome === 'extend' ? 'Your bid is extended to ' + payload.bidExpiration + '. The quote follows your date.' :
            outcome === 'reprice' ? (replyMsg || repriceSentText(repriceOutcome())) :
            'SCW has been told the bid can\'t be extended.') + '</div>';
          card.setAttribute('data-scw-qext-sub-done', outcome);
        });
      });
    });
  }

  // ── The sub's SURVEYS DASHBOARD: a banner per flagged bid ──────────────
  function bidPageHref(bidId) {
    var grid = document.getElementById(CONFIG.sub.dashboard.bidsGrid);
    var row = grid && grid.querySelector('tr[id="' + bidId + '"]');
    var a = row && row.querySelector('a[href*="' + CONFIG.sub.dashboard.bidPageSlug + '"]');
    if (a && a.getAttribute('href')) return a.getAttribute('href');
    // The row's link column is not rendered yet: the page is a child of this one.
    var base = String(window.location.hash || '#').replace(/\/+$/, '');
    return base + '/' + CONFIG.sub.dashboard.bidPageSlug + '/' + bidId + '/';
  }
  function dashBidLabel(rec) {
    return [fieldText(rec, 'field_2414'), fieldText(rec, 'field_2636')].filter(Boolean).join(' · ') || fieldText(rec, CONFIG.sub.bidLabel) || 'this bid';
  }
  function renderDashboardBanner() {
    var c = CONFIG.sub, d = c.dashboard;
    var existing = document.getElementById('scw-qext-dash');
    function drop() { if (existing && existing.parentNode) existing.parentNode.removeChild(existing); clearBidsGridChips(); }
    if (!c.requestedFlag || !canShowSub()) { drop(); return; }
    var recs = viewRecords(d.bidsGrid), asked = [];
    for (var i = 0; i < recs.length; i++) if (fieldYes(recs[i], c.requestedFlag)) asked.push(recs[i]);
    if (!asked.length) { drop(); return; }
    decorateBidsGrid(asked);
    var mount = document.getElementById(d.mountBefore) || document.getElementById(d.bidsGrid);
    if (!mount || !mount.parentNode) return;
    injectStyles();
    var box = existing || document.createElement('div');
    box.id = 'scw-qext-dash';
    box.className = 'scw-qext scw-qext--sub';
    box.setAttribute('data-scw-qext-dash', String(asked.length));
    box.innerHTML =
      '<div class="scw-qext__head"><span class="scw-qext__chip">Action needed</span></div>' +
      '<div class="scw-qext__title">SCW has asked you to extend ' + (asked.length === 1 ? 'a bid' : asked.length + ' bids') + ' on this survey</div>' +
      '<div class="scw-qext__line">The client needs more time on the quote. Open the bid and answer on its Preview Bid page: ' +
        '<b>Extend</b> it if the price still stands, <b>Re-price instead</b> if costs have moved, or <b>Can\'t extend</b>. ' +
        'Nothing changes on your bid until you answer.</div>' +
      asked.map(function (rec) {
        var requested = normalizeMdy(fieldText(rec, c.requestedDate)) || fieldText(rec, c.requestedDate);
        var bidExp = normalizeMdy(fieldText(rec, c.bidExpiration)) || fieldText(rec, c.bidExpiration);
        return '<div class="scw-qext__row scw-qext__dashrow" data-qext-dash-bid="' + esc(rec.id) + '">' +
          '<span>Bid <b>' + esc(dashBidLabel(rec)) + '</b>' + (requested ? ' — hold it until <b>' + esc(requested) + '</b>' : '') +
            (bidExp ? ' <span class="scw-qext__muted">(it currently expires ' + esc(bidExp) + ')</span>' : '') + '</span> ' +
          '<a class="scw-qext__btn scw-qext__btn--primary" data-qext-dash-open href="' + esc(bidPageHref(rec.id)) + '">Open the bid to answer &rsaquo;</a>' +
        '</div>';
      }).join('');
    if (!existing) mount.parentNode.insertBefore(box, mount);
  }
  /** The BIDs grid (view_3507) row of each flagged bid: its flag cell reads a chip + the same link,
   *  so the request is visible where the sub looks at their bids, not only in the banner above
   *  the worksheet. Idempotent across Knack's grid re-renders (the cell is rebuilt each time). */
  function decorateBidsGrid(asked) {
    var c = CONFIG.sub, d = c.dashboard;
    var grid = document.getElementById(d.bidsGrid);
    if (!grid) return;
    clearBidsGridChips();
    for (var i = 0; i < asked.length; i++) {
      var rec = asked[i];
      var row = grid.querySelector('tr[id="' + rec.id + '"]');
      var cell = row && (row.querySelector('td.' + c.requestedFlag) || row.querySelector('td[data-field-key="' + c.requestedFlag + '"]'));
      if (!cell) continue;
      var requested = normalizeMdy(fieldText(rec, c.requestedDate)) || fieldText(rec, c.requestedDate);
      var chip = document.createElement('div');
      chip.className = 'scw-qext-gridchip';
      chip.setAttribute('data-qext-gridchip', rec.id);
      chip.innerHTML =
        '<span class="scw-qext__chip">Extension requested</span>' +
        (requested ? '<span class="scw-qext-gridchip__text">Hold until <b>' + esc(requested) + '</b></span>' : '') +
        '<a class="scw-qext-gridchip__link" data-qext-dash-open href="' + esc(bidPageHref(rec.id)) + '">Open the bid to answer &rsaquo;</a>';
      cell.appendChild(chip);
    }
  }
  function clearBidsGridChips() {
    var olds = document.querySelectorAll('.scw-qext-gridchip');
    for (var i = 0; i < olds.length; i++) if (olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]);
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  if (window.SCW && SCW.onSceneRender) {
    SCW.onSceneRender(CONFIG.sub.dashboard.scene, function () { setTimeout(renderDashboardBanner, 200); }, NS);
    SCW.onSceneRender(CONFIG.sub.scene, function () { setTimeout(renderSubCard, 200); }, NS);
    for (var opsScene in CONFIG.ops) {
      if (Object.prototype.hasOwnProperty.call(CONFIG.ops, opsScene)) {
        SCW.onSceneRender(opsScene, function () { decorateOpsSoon(); setTimeout(decorateOps, 900); }, NS);
      }
    }
  }
  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(CONFIG.sub.bidView, function () { setTimeout(renderSubCard, 100); }, NS);
    SCW.onViewRender(CONFIG.sub.mountBefore, function () { setTimeout(renderSubCard, 100); }, NS);
    SCW.onViewRender(CONFIG.sub.dashboard.bidsGrid, function () { setTimeout(renderDashboardBanner, 100); }, NS);
    SCW.onViewRender(CONFIG.sub.dashboard.mountBefore, function () { setTimeout(renderDashboardBanner, 100); }, NS);
  }
  // The Published Proposal blocks are rebuilt on every render of their hosts
  // (the v2 header, ops-review-pill, view_3883): re-decorate after any render.
  if (window.$ && typeof $(document).on === 'function') {
    $(document).off('knack-view-render.any' + NS).on('knack-view-render.any' + NS, function () { if (opsCfg()) decorateOpsSoon(); });
  }

  window.SCW = window.SCW || {};
  window.SCW.quoteExtension = {
    CONFIG: CONFIG,
    decorateSalesCard: decorateSalesCard,
    decorateOps: decorateOps,
    openRequestModal: openRequestModal,
    openOpsWarning: openOpsWarning,
    renderSubCard: renderSubCard,
    renderDashboardBanner: renderDashboardBanner,
    enabled: canAsk,                  // the hook (or the QA preview flag) — header.js gates its chip on it
    afterReopenBid: afterReopenBid,   // bid-review/init.js handleReopenBid → Make, when the SOW waits on that decision
    pendingState: pendingState,
    extensionState: extensionState,
    discontinuedIn: discontinuedIn,
    // tooling / tests
    normalizeMdy: normalizeMdy,
    suggestedDate: suggestedDate,
    _post: post,
    _marker: { read: readMarker, write: writeMarker }
  };
})();
/*** END quote-extension.js ***/
