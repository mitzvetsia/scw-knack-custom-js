// jsdom test: quote expiration extensions — the OPS surfaces (2026-11-05, ClickUp 86ba5wg3f). Drives the
// real quote-extension.js `decorateOps` over the Published Proposal blocks the reconcile page (scene_1155,
// one block per SOW header with data-sow-record-id, SOW rows on view_3918, line items on view_3921) and
// the Preview Proposal page (scene_1096, the block in view_3883, the SOW from the route, view_3861 +
// view_4140) render:
//   - no hook → nothing; hook → a compact row with "Request extension from sub"; a SOW whose basis bid
//     field is served and EMPTY → "no sub to ask", no button; the field not served → the button (fail open);
//   - the discontinued-products gate for Ops: the row names the products, the click opens the loud warning
//     (alertdialog, products + risks, proceed disabled until acknowledged) and only then the request modal;
//     the payload carries requestedBy 'ops', discontinuedProducts, riskAcknowledged and the warning line in
//     requestText; a clean SOW goes straight to the request modal;
//   - the reply's routedTo svs → the pending row (Nudge / Cancel) through the session marker; Cancel posts
//     and returns the row to ready;
//   - the SOW status field once configured: Re-pricing / Requested / blank;
//   - a repeat decorate leaves an unchanged row in place (no DOM churn).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const SOW = '6a465ad1bb00d991572419dd', SOW_B = '6a465ad1bb00d991572419ee', PROP = '6a4ab0e1cc2d7f0a3c111111', BID = '6a4ab0e1cc2d7f0a3c222222';
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#ops/reconcile-bids/' + SOW + '/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.sessionStorage = window.sessionStorage; global.localStorage = window.localStorage;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, a, b) { const fn = typeof a === 'function' ? a : b; (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' }, getUserAttributes() { return { name: 'Will Polk', email: 'william.polk@getscw.com' }; } };
global.Knack = window.Knack;
const posts = [];
let hook = 'PLACEHOLDER';
let catReady = true; const disabled = new Set(); const catWaiters = [];
window.SCW = { CONFIG: { get MAKE_QUOTE_EXTENSION_WEBHOOK() { return hook; } }, onViewRender() {}, onSceneRender() {}, debug() {},
  knackAjax(o) { posts.push(o); return {}; },
  projectId: { resolve() { return { id: '60486704913', source: 'derived' }; } },
  catalog: { isReady: () => catReady, ready(fn) { catWaiters.push(fn); }, isDisabled(id) { return catReady ? disabled.has(id) : null; } } };
global.SCW = window.SCW;
window.confirm = () => true; global.confirm = window.confirm;
new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/quote-extension.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const qx = window.SCW.quoteExtension;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mdy = d => (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return mdy(d); };
const future = plus(20);
const lastPost = () => posts[posts.length - 1];
const body = () => JSON.parse(lastPost().data);
const q = (sel, root) => (root || document).querySelector(sel);
const grid = recs => ({ model: { data: { models: recs.map(r => ({ attributes: r })) } } });
const details = rec => ({ model: { attributes: rec } });
const line = (id, pid, pname, sowId) => ({ id, field_1949: pname, field_1949_raw: [{ id: pid, identifier: pname }], field_2154_raw: [{ id: sowId || SOW, identifier: '1589' }] });
const sowRow = extra => Object.assign({ id: SOW, field_2122: '60486704913-SW1589', field_2126: 'Original', field_2942_raw: [{ id: BID, identifier: 'BD-1' }] }, extra || {});
const LINES = [line('li1', 'p1', 'Scout 8.0'), line('li2', 'p2', 'Deputy 8.0 26DF8M-V4'), line('li3', 'p2', 'Deputy 8.0 26DF8M-V4'), line('li4', 'p2', 'Deputy 8.0 26DF8M-V4', SOW_B)];
const block = () => q('.scw-pq-info');
const box = () => q('.scw-qext--ops');
const modal = () => document.getElementById('scw-qext-overlay');

// ── the reconcile page: one Published Proposal block in a SOW header ─────────────────────────────
function reconcilePage(row, lines) {
  document.body.innerHTML =
    '<div id="kn-scene_1155" class="kn-scene"><div class="scw-bid-review__sow-status">' +
      '<div class="scw-pq-info scw-pq-info--compact" data-proposal-record-id="' + PROP + '" data-sow-record-id="' + SOW + '">' +
        '<div class="scw-pq-name">20261009-12028</div><div class="scw-pq-exp">Expires: ' + future + '</div></div>' +
    '</div></div>';
  window.Knack.views = { view_3918: grid([row || sowRow()]), view_3921: grid(lines || LINES) };
}

(async () => {
  reconcilePage(); qx.decorateOps();
  check('no hook, no preview: nothing is added under the block', !!box(), false);
  reconcilePage(sowRow({ field_3314: 'Requested', field_3314_raw: 'Requested', field_3315: '12/31/2026', field_3315_raw: { date_formatted: '12/31/2026' } })); qx.decorateOps();
  check('no hook: a Requested record renders nothing either (the switch is off until Make is wired)', !!box(), false);
  window.localStorage.setItem('scwQuoteExtPreview', '1'); qx.decorateOps();
  check('… the QA preview flag renders the pending row off the record', box() && box().getAttribute('data-scw-qext'), 'pending');
  window.localStorage.removeItem('scwQuoteExtPreview');
  hook = 'https://hook.us1.make.com/qext';
  reconcilePage(); qx.decorateOps();
  check('with the hook: a compact row right after the block — ready, the button, no discontinued products counted',
    [block().nextElementSibling === box(), box().getAttribute('data-scw-qext'), txt(q('[data-qext-request]', box())), box().getAttribute('data-qext-discontinued'), box().getAttribute('data-qext-sow')],
    [true, 'ready', 'Request extension from sub', '0', SOW]);
  const first = box(); qx.decorateOps();
  check('a repeat decorate leaves the unchanged row in place', [box() === first, document.querySelectorAll('.scw-qext--ops').length], [true, 1]);
  reconcilePage(sowRow({ field_2942_raw: [] })); qx.decorateOps();
  check('basis bid field served and empty: no sub to ask — the note, no button', [box().getAttribute('data-scw-qext'), !!q('[data-qext-request]', box()), /no sub to ask/.test(txt(box()))], ['nobasis', false, true]);
  const bare = sowRow(); delete bare.field_2942_raw;
  reconcilePage(bare); qx.decorateOps();
  check('basis bid field not served on the row: the button (fail open)', box().getAttribute('data-scw-qext'), 'ready');

  // ── a clean SOW: straight to the request modal; the payload says Ops asked ──
  reconcilePage(); qx.decorateOps();
  q('[data-qext-request]', box()).click();
  check('clean SOW: the request modal opens directly (no warning)', [!!modal(), q('[role]', modal()).getAttribute('role'), /The deal tasks are updated/.test(txt(modal()))], [true, 'dialog', true]);
  q('[data-qext-reason]', modal()).value = 'client board meets 11/18'; posts.length = 0; q('[data-qext-send]', modal()).click();
  check('ONE POST request-extension: the block\'s SOW + proposal, requestedBy ops, no discontinued keys',
    [posts.length, body().stepId, body().sowId, body().proposalRecordId, body().requestedBy, body().discontinuedProducts, body().riskAcknowledged, body().currentQuoteExpiration],
    [1, 'request-extension', SOW, PROP, 'ops', undefined, undefined, future]);
  check('the request text names the SOW off the row and marks the requester as Ops', [body().requestText.split('\n')[1], /Requested by Will Polk \(Ops\) on/.test(body().requestText)], ['Project 60486704913 · SOW 1589 · 20261009-12028', true]);
  lastPost().success({ success: true, routedTo: 'svs' }); await sleep(10);
  check('routedTo svs: the row is pending (session marker) with Nudge / Cancel', [box().getAttribute('data-scw-qext'), /awaiting SVS/.test(txt(box())), !!q('[data-qext-nudge]', box()), !!q('[data-qext-cancel-req]', box())], ['pending', true, true, true]);
  posts.length = 0; q('[data-qext-cancel-req]', box()).click();
  check('Cancel posts cancel-extension for the SOW', [body().stepId, body().sowId], ['cancel-extension', SOW]);
  lastPost().success({ success: true }); await sleep(10);
  check('… and the row is ready again, the marker gone', [box().getAttribute('data-scw-qext'), qx._marker.read(SOW)], ['ready', null]);

  // ── discontinued products: the loud warning, then the request ──
  disabled.add('p2');
  reconcilePage(); qx.decorateOps();
  check('discontinued products on THIS SOW only (the other SOW\'s line is not counted): the row warns and names them, the button stays',
    [box().getAttribute('data-scw-qext'), box().getAttribute('data-qext-discontinued'), /1 discontinued product on this SOW: Deputy 8\.0 26DF8M-V4 \(2 line items\)\. Sales is blocked; you will be asked to confirm\./.test(txt(box())), !!q('[data-qext-request]', box())],
    ['ready', '1', true, true]);
  q('[data-qext-request]', box()).click();
  check('the click opens the WARNING first: alertdialog, the product with its count, the three risks, proceed disabled',
    [q('[role]', modal()).getAttribute('role'), [...modal().querySelectorAll('.scw-qext-warn__products li')].map(txt), modal().querySelectorAll('.scw-qext-warn__risks li').length,
     q('[data-qext-proceed]', modal()).disabled, /Sales is blocked from requesting an extension until the lines are updated/.test(txt(modal()))],
    ['alertdialog', ['Deputy 8.0 26DF8M-V4 — 2 line items'], 3, true, true]);
  q('[data-qext-proceed]', modal()).click();
  check('proceed does nothing until the acknowledgement is ticked', q('[role]', modal()).getAttribute('role'), 'alertdialog');
  const ack = q('[data-qext-ack]', modal()); ack.checked = true; ack.dispatchEvent(new window.Event('change'));
  check('ticked: proceed enabled', q('[data-qext-proceed]', modal()).disabled, false);
  q('[data-qext-proceed]', modal()).click();
  check('then the request modal, which says the request will carry the warning', [q('[role]', modal()).getAttribute('role'), /Requested over 1 discontinued product — the request will say so/.test(txt(modal()))], ['dialog', true]);
  q('[data-qext-reason]', modal()).value = 'client needs the quote through year end'; posts.length = 0; q('[data-qext-send]', modal()).click();
  check('the payload carries the discontinued products and the acknowledgement; the text carries the warning line',
    [body().requestedBy, body().discontinuedProducts, body().riskAcknowledged,
     body().requestText.split('\n').filter(l => /^WARNING/.test(l)), /<b>WARNING<\/b>/.test(body().requestHtml)],
    ['ops', [{ id: 'p2', name: 'Deputy 8.0 26DF8M-V4', count: 2 }], true,
     ['WARNING — requested despite 1 discontinued product on the SOW: Deputy 8.0 26DF8M-V4 (2) — risk acknowledged by the requester'], true]);
  lastPost().success({ success: true, routedTo: 'svs' }); await sleep(10);
  check('… pending afterwards', box().getAttribute('data-scw-qext'), 'pending');
  qx._marker.write(SOW, null); disabled.clear();
  // Cancel on the warning sends nothing
  disabled.add('p1'); reconcilePage(); qx.decorateOps(); q('[data-qext-request]', box()).click(); posts.length = 0;
  q('[data-qext-cancel]', modal()).click();
  check('Cancel on the warning: no modal, nothing posted', [!!modal(), posts.length], [false, 0]);
  disabled.clear();
  // the catalog not loaded: no warning, a repaint queued
  catReady = false; reconcilePage(); qx.decorateOps();
  check('catalog not loaded: the row counts nothing and queues a repaint', [box().getAttribute('data-qext-discontinued'), catWaiters.length], ['0', 1]);
  catReady = true; disabled.add('p2'); catWaiters.splice(0).forEach(fn => fn());
  check('… which names the product once the catalog lands', box().getAttribute('data-qext-discontinued'), '1');
  disabled.clear();

  // ── the SOW status field once configured ──
  check('the SOW Builder keys are wired', [qx.CONFIG.sow.status, qx.CONFIG.sow.requestedDate], ['field_3314', 'field_3315']);
  reconcilePage(sowRow({ field_3314: 'Re-Pricing', field_3314_raw: 'Re-Pricing' })); qx.decorateOps();
  check('status Re-Pricing (the Builder option): the re-pricing line, no buttons', [box().getAttribute('data-scw-qext'), q('button', box()), /re-pricing this bid/.test(txt(box()))], ['repricing', null, true]);
  reconcilePage(sowRow({ field_3314: 'Requested', field_3314_raw: 'Requested', field_3315: '12/31/2026', field_3315_raw: { date_formatted: '12/31/2026' } })); qx.decorateOps();
  check('status Requested: pending with the record\'s date', [box().getAttribute('data-scw-qext'), /Extension to 12\/31\/2026/.test(txt(box())), !!q('[data-qext-nudge]', box())], ['pending', true, true]);
  qx._marker.write(SOW, { requestedDate: '1/1/2030', at: '1/1/2026', routedTo: 'svs' });
  reconcilePage(sowRow({ field_3314: '', field_3314_raw: '' })); qx.decorateOps();
  check('status blank: ready, and a stale marker is cleared', [box().getAttribute('data-scw-qext'), qx._marker.read(SOW)], ['ready', null]);

  // ── the Preview Proposal page (scene_1096): the SOW from the route, a single-record SOW view ──
  window.Knack.router.current_scene_key = 'scene_1096';
  window.location.hash = '#proposals/proposal/' + SOW + '/';
  function previewPage(rec, lines) {
    document.body.innerHTML =
      '<div id="kn-scene_1096" class="kn-scene"><div id="view_3883" class="kn-view kn-details">' +
        '<div class="scw-pq-info scw-pq-info--regular" data-proposal-record-id="' + PROP + '">' +
          '<div class="scw-pq-header">Published Proposal</div><div class="scw-pq-name">20261009-12028</div><div class="scw-pq-exp scw-pq-exp--past">Expired: 1/2/2026</div></div>' +
      '</div></div>';
    window.Knack.views = { view_3861: details(rec || sowRow()), view_4140: grid(lines || LINES.slice(0, 3)) };
  }
  previewPage(); qx.decorateOps();
  check('preview page: the row renders off the route\'s SOW with no data-sow-record-id on the block', [box().getAttribute('data-scw-qext'), box().getAttribute('data-qext-sow')], ['ready', SOW]);
  q('[data-qext-request]', box()).click();
  check('the modal reads the expired date off the block and prefills +30 days from today', [/currently 1\/2\/2026/.test(txt(modal())), q('[data-qext-date]', modal()).value], [true, plus(30)]);
  q('[data-qext-reason]', modal()).value = 'x'; posts.length = 0; q('[data-qext-send]', modal()).click();
  check('the payload names the route\'s SOW and the record\'s SOW number', [body().sowId, body().requestedBy, body().requestText.split('\n')[1]], [SOW, 'ops', 'Project 60486704913 · SOW 1589 · 20261009-12028']);
  lastPost().success({ success: true, routedTo: 'auto' }); await sleep(10);
  check('routedTo auto: no pending state', [box().getAttribute('data-scw-qext'), qx._marker.read(SOW)], ['ready', null]);
  disabled.add('p1'); previewPage(); qx.decorateOps();
  check('every view_4140 line is this SOW\'s: a discontinued product warns here too', [box().getAttribute('data-qext-discontinued'), /Scout 8\.0 \(1 line item\)/.test(txt(box()))], ['1', true]);
  previewPage(sowRow({ field_2942_raw: [] })); qx.decorateOps();
  check('no basis bid on the preview page: the note', box().getAttribute('data-scw-qext'), 'nobasis');
  window.Knack.router.current_scene_key = 'scene_1085';
  previewPage(); qx.decorateOps();
  check('a scene with no Ops entry: nothing is decorated', !!box(), false);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
