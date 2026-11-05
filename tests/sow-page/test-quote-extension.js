// jsdom test: quote expiration extensions, AE → SVS direct (2026-11-05, ClickUp 86ba5wg3f). Drives the
// real quote-extension.js + published-proposal-sow-card.js + published-quote-info.js:
//   - sales SOW page (scene_1116): no hook → the card is as it was; hook configured (or the QA preview
//     flag) → "Request extension" + modal (date prefilled +30 days past the current expiration, reason
//     required, the date must be after today and after the current expiration) → ONE POST
//     `request-extension` with the contract's keys and the fixed request text; the reply's routedTo
//     decides the card: svs/ops/unknown → the pending state (chip, Nudge, Cancel → their POSTs),
//     auto → no pending state; the pending state survives a re-render (session marker) and reads the
//     Builder flag first once configured; an expired proposal's "coordinate with Ops" note is replaced;
//   - sub bid page (scene_1149): no flag field configured → no card; flag Yes on the bid record → the
//     card with the requested date, the bid's expiration and three answers, each ONE POST
//     `confirm-extension` (extend carries the (editable) date and refuses a bad one); flag No → no card.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const SOW = '6a465ad1bb00d991572419dd', PROP = '6a4ab0e1cc2d7f0a3c111111', BID = '6a4ab0e1cc2d7f0a3c222222';
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#sales/scope-of-work-details/' + SOW + '/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.sessionStorage = window.sessionStorage; global.localStorage = window.localStorage;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, a, b) { const fn = typeof a === 'function' ? a : b; (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1116' }, getUserAttributes() { return { name: 'Danny Mize', email: 'danny@getscw.com' }; } };
global.Knack = window.Knack;
const posts = [];
let hook = 'PLACEHOLDER';
window.SCW = { CONFIG: { get MAKE_QUOTE_EXTENSION_WEBHOOK() { return hook; } }, onViewRender() {}, onSceneRender() {}, debug() {},
  knackAjax(o) { posts.push(o); return {}; },
  projectId: { resolve() { return { id: '60486704913', source: 'derived' }; } },
  salesCR: { sowDisplayLabel() { return '1589'; } } };
global.SCW = window.SCW;
window.confirm = () => true; global.confirm = window.confirm;
for (const f of ['published-quote-info.js', 'quote-extension.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
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
const lastPost = () => posts[posts.length - 1];
const body = () => JSON.parse(lastPost().data);

// ── the sales page: the Published Proposal card over view_3814 + view_3827 ──────────────────────
function salesPage(expDate, extraSow) {
  document.body.innerHTML =
    '<div class="view-column"><div class="kn-view kn-details" id="view_3827"></div></div>' +
    '<div class="kn-view kn-table" id="view_3814"><table><tbody><tr id="' + PROP + '">' +
      '<td class="field_2658">Published</td><td class="field_2665">20261009-12028</td><td class="field_2659">' + expDate + '</td>' +
      '<td class="field_2681"><a href="https://files/x.pdf">x.pdf</a></td><td class="field_2908">https://tok</td></tr></tbody></table></div>';
  window.Knack.views = {
    view_3827: { model: { attributes: Object.assign({ id: SOW }, extraSow || {}) } },
    view_3814: { model: { data: { models: [{ attributes: { id: PROP, field_2658: 'Published', field_2658_raw: 'Published', field_2665: '20261009-12028', field_2659: expDate,
      field_2659_raw: { date_formatted: expDate, date: expDate }, field_2681: '<a href="https://files/x.pdf">x.pdf</a>', field_2908: 'https://tok' } }] } } }
  };
}
const card = () => document.getElementById('scw-pp-sow-card');
const q = (sel, root) => (root || document).querySelector(sel);
// published-proposal-sow-card renders on SCW.onSceneRender (captured here so each page can call it).
let cardRender = null;
window.SCW.onSceneRender = (scene, fn) => { if (scene === 'scene_1116') cardRender = fn; };
new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/published-proposal-sow-card.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

(async () => {
  const future = plus(20);
  // ── no hook, no preview: nothing added ──
  salesPage(future); cardRender(); await sleep(200);
  check('the card renders; with no webhook configured the extension block is absent', [!!card(), !!q('.scw-qext')], [true, false]);
  // ── hook configured ──
  hook = 'https://hook.us1.make.com/qext';
  salesPage(future); cardRender(); await sleep(200);
  check('with the hook: a "Request extension" button and the ready state', [txt(q('.scw-qext [data-qext-request]')), q('.scw-qext').getAttribute('data-scw-qext')], ['Request extension', 'ready']);
  q('[data-qext-request]').click();
  const modal = () => document.getElementById('scw-qext-overlay');
  check('the modal prefills +30 days past the current expiration and shows the current one', [q('[data-qext-date]', modal()).value, /currently /.test(txt(modal()))], [plus(50), true]);
  // a bad date, a past date, no reason
  q('[data-qext-date]', modal()).value = '13/40/2026'; q('[data-qext-send]', modal()).click();
  check('an invalid date is refused', txt(q('[data-qext-err]', modal())), 'Enter the new expiration as M/D/YYYY.');
  q('[data-qext-date]', modal()).value = plus(10); q('[data-qext-send]', modal()).click();
  check('a date before the current expiration is refused', /has to be after the current one/.test(txt(q('[data-qext-err]', modal()))), true);
  q('[data-qext-date]', modal()).value = plus(45); q('[data-qext-send]', modal()).click();
  check('a blank reason is refused', txt(q('[data-qext-err]', modal())), 'Give the sub and Ops one line on why.');
  q('[data-qext-reason]', modal()).value = 'client decides at the 11/18 board meeting';
  posts.length = 0;
  q('[data-qext-send]', modal()).click();
  check('ONE POST request-extension with the contract keys', [posts.length, lastPost().type, lastPost().url, Object.keys(body()).sort()],
    [1, 'POST', hook, ['currentQuoteExpiration', 'proposalRecordId', 'reason', 'requestHtml', 'requestText', 'requestedBy', 'requestedDate', 'sowId', 'stepId', 'triggeredBy']]);
  check('the payload: SOW, proposal, dates, reason, who (sales — no discontinued keys)', [body().stepId, body().sowId, body().proposalRecordId, body().currentQuoteExpiration, body().requestedDate, body().reason, body().triggeredBy, body().requestedBy, body().discontinuedProducts],
    ['request-extension', SOW, PROP, future, plus(45), 'client decides at the 11/18 board meeting', { name: 'Danny Mize', email: 'danny@getscw.com' }, 'sales', undefined]);
  check('the fixed request text names the project, the SOW, the dates, the reason and the AE',
    body().requestText.split('\n').slice(0, 5), ['Quote extension requested', 'Project 60486704913 · SOW 1589 · 20261009-12028', 'Current expiration: ' + future, 'Requested: ' + plus(45), 'Reason: client decides at the 11/18 board meeting']);
  // the sub is asked → pending
  lastPost().success({ success: true, routedTo: 'svs' });
  await sleep(10);
  check('routedTo svs: the modal closes, the card shows the pending state with the date, the day and Nudge / Cancel',
    [!!modal(), q('.scw-qext').getAttribute('data-scw-qext'), txt(q('.scw-qext > div')), !!q('[data-qext-nudge]'), !!q('[data-qext-cancel-req]')],
    [false, 'pending', 'Extension pending Extension to ' + plus(45) + ' requested ' + mdy(new Date()) + ' · awaiting SVS', true, true]);
  check('the pending state is stored per SOW (survives a re-render)', qx.pendingState(SOW).requestedDate, plus(45));
  salesPage(future); cardRender(); await sleep(200);
  check('after a re-render the card is still pending', q('.scw-qext').getAttribute('data-scw-qext'), 'pending');
  posts.length = 0; q('[data-qext-nudge]').click();
  check('Nudge posts nudge-extension for the SOW', [body().stepId, body().sowId], ['nudge-extension', SOW]);
  lastPost().success({ success: true });
  posts.length = 0; q('[data-qext-cancel-req]').click();
  check('Cancel posts cancel-extension', body().stepId, 'cancel-extension');
  lastPost().success({ success: true }); await sleep(10);
  check('after a cancel the card is back to the ready state and the marker is gone', [q('.scw-qext').getAttribute('data-scw-qext'), qx.pendingState(SOW)], ['ready', null]);
  // routed to Ops
  q('[data-qext-request]').click(); q('[data-qext-reason]', modal()).value = 'x'; posts.length = 0; q('[data-qext-send]', modal()).click();
  lastPost().success({ success: true, routedTo: 'ops' }); await sleep(10);
  check('routedTo ops: pending "with Ops"', /with Ops$/.test(txt(q('.scw-qext > div'))), true);
  qx._marker.write(SOW, null);
  // auto-extended
  salesPage(future); cardRender(); await sleep(200);
  q('[data-qext-request]').click(); q('[data-qext-reason]', modal()).value = 'x'; posts.length = 0; q('[data-qext-send]', modal()).click();
  lastPost().success({ success: true, routedTo: 'auto' }); await sleep(10);
  check('routedTo auto: no pending state (the date was within the bid\'s validity)', [q('.scw-qext').getAttribute('data-scw-qext'), qx.pendingState(SOW)], ['ready', null]);
  // CORS-opaque reply counts as delivered, routedTo unknown
  q('[data-qext-request]').click(); q('[data-qext-reason]', modal()).value = 'x'; posts.length = 0; q('[data-qext-send]', modal()).click();
  lastPost().error({ status: 0 }); await sleep(10);
  check('a status-0 reply: pending, "awaiting a reply"', /awaiting a reply$/.test(txt(q('.scw-qext > div'))), true);
  // a refused send stays in the modal
  qx._marker.write(SOW, null); salesPage(future); cardRender(); await sleep(200);
  q('[data-qext-request]').click(); q('[data-qext-reason]', modal()).value = 'x'; posts.length = 0; q('[data-qext-send]', modal()).click();
  lastPost().success({ success: false, error: 'No published proposal on this SOW' }); await sleep(10);
  check('a success:false reply keeps the modal open with Make\'s error', [!!modal(), txt(q('[data-qext-err]', modal()))], [true, 'No published proposal on this SOW']);
  q('[data-qext-cancel]', modal()).click();
  // the Builder status field wins over the marker once configured — three readings
  qx._marker.write(SOW, { requestedDate: '1/1/2030', at: '1/1/2026', routedTo: 'svs' });
  qx.CONFIG.sow.status = 'field_9001'; qx.CONFIG.sow.requestedDate = 'field_9002';
  salesPage(future, { field_9001: 'No', field_9001_raw: false }); cardRender(); await sleep(200);
  check('a Yes/No flag reading No: not pending, the stale marker is cleared', [q('.scw-qext').getAttribute('data-scw-qext'), qx._marker.read(SOW)], ['ready', null]);
  salesPage(future, { field_9001: 'Yes', field_9001_raw: true, field_9002: '12/31/2026', field_9002_raw: { date_formatted: '12/31/2026' } }); cardRender(); await sleep(200);
  check('a Yes/No flag reading Yes: pending with the record\'s requested date', [q('.scw-qext').getAttribute('data-scw-qext'), /Extension to 12\/31\/2026/.test(txt(q('.scw-qext > div')))], ['pending', true]);
  salesPage(future, { field_9001: 'Requested', field_9001_raw: 'Requested', field_9002: '12/31/2026', field_9002_raw: { date_formatted: '12/31/2026' } }); cardRender(); await sleep(200);
  check('status "Requested": pending, Nudge / Cancel offered', [q('.scw-qext').getAttribute('data-scw-qext'), !!q('[data-qext-nudge]'), !!q('[data-qext-cancel-req]')], ['pending', true, true]);
  salesPage(future, { field_9001: 'Re-pricing', field_9001_raw: 'Re-pricing' }); cardRender(); await sleep(200);
  check('status "Re-pricing": the re-pricing line, no buttons, no request', [q('.scw-qext').getAttribute('data-scw-qext'), txt(q('.scw-qext')), q('.scw-qext button')],
    ['repricing', 'Re-pricing The sub is re-pricing this bid. The quote keeps its current expiration until Ops publishes the re-priced proposal.', null]);
  check('… extensionState reads the kind', qx.pendingState(SOW).kind, 'repricing');
  salesPage('1/2/2026', { field_9001: 'Re-pricing', field_9001_raw: 'Re-pricing' }); cardRender(); await sleep(200);
  check('… an expired proposal\'s note says a re-published proposal follows', /re-pricing the bid — a re-published proposal follows/.test(txt(q('.scw-pq-expired-note'))), true);
  salesPage(future, { field_9001: '', field_9001_raw: '' }); cardRender(); await sleep(200);
  check('status blank: the request button is back', q('.scw-qext').getAttribute('data-scw-qext'), 'ready');
  qx.CONFIG.sow.status = ''; qx.CONFIG.sow.requestedDate = ''; qx._marker.write(SOW, null);

  // ── the discontinued-products gate (sales is blocked, with instructions) ──
  let catReady = false; const disabled = new Set(); const catWaiters = [];
  window.SCW.catalog = { isReady: () => catReady, ready(fn) { catWaiters.push(fn); }, isDisabled(id) { return catReady ? disabled.has(id) : null; } };
  const line = (id, pid, pname) => ({ id, field_1949: pname, field_1949_raw: [{ id: pid, identifier: pname }], field_2154_raw: [{ id: SOW, identifier: '1589' }] });
  const lines = recs => { window.Knack.views.view_3586 = { model: { data: { models: recs.map(r => ({ attributes: r })) } } }; };
  const sowLines = [line('li1', 'p1', 'Scout 8.0'), line('li2', 'p2', 'Deputy 8.0 26DF8M-V4'), line('li3', 'p2', 'Deputy 8.0 26DF8M-V4')];
  salesPage(future); lines(sowLines); cardRender(); await sleep(200);
  check('catalog not loaded: the button is offered (null is never a warning) and a repaint is queued for when it lands', [q('.scw-qext').getAttribute('data-scw-qext'), catWaiters.length], ['ready', 1]);
  catReady = true; disabled.add('p2'); catWaiters.splice(0).forEach(fn => fn()); await sleep(10);
  check('the catalog lands with a discontinued product on the SOW: the card repaints BLOCKED — the button disabled, the product named with its line count, the fix spelled out',
    [q('.scw-qext').getAttribute('data-scw-qext'), q('.scw-qext').getAttribute('data-qext-discontinued'), q('[data-qext-request]').disabled,
     /Deputy 8\.0 26DF8M-V4 \(2 line items\)/.test(txt(q('.scw-qext'))), /Update those line items on the worksheet below/.test(txt(q('.scw-qext'))), !!q('[data-qext-show]')],
    ['blocked', '1', true, true, true, true]);
  salesPage('1/2/2026'); lines(sowLines); cardRender(); await sleep(200);
  check('… an expired proposal\'s note points at the discontinued products', /Update the discontinued products below before an extension can be requested/.test(txt(q('.scw-pq-expired-note'))), true);
  check('… the block is an element of the card, never a modal', !!modal(), false);
  disabled.clear(); salesPage(future); lines(sowLines); cardRender(); await sleep(200);
  check('every product current again: the button is back', [q('.scw-qext').getAttribute('data-scw-qext'), q('[data-qext-request]').disabled], ['ready', false]);
  disabled.add('p1'); q('[data-qext-request]').click(); await sleep(10);
  check('a product retired since the paint: the click re-checks, blocks the card and opens no modal', [q('.scw-qext').getAttribute('data-scw-qext'), !!modal(), /Scout 8\.0 \(1 line item\)/.test(txt(q('.scw-qext')))], ['blocked', false, true]);
  disabled.clear(); delete window.SCW.catalog; qx._marker.write(SOW, null);
  // an expired proposal: the "coordinate with Ops" note is replaced
  salesPage('1/2/2026'); cardRender(); await sleep(200);
  check('expired: the note points at the button instead of Ops', txt(q('.scw-pq-expired-note')), 'This proposal is expired. Request an extension below before re-sharing the customer link.');
  // the QA preview flag with no hook
  hook = 'PLACEHOLDER'; window.localStorage.setItem('scwQuoteExtPreview', '1');
  salesPage(future); cardRender(); await sleep(200);
  check('no hook + preview flag: the button shows; a send reports the missing hook', !!q('[data-qext-request]'), true);
  q('[data-qext-request]').click(); q('[data-qext-reason]', modal()).value = 'x'; posts.length = 0; q('[data-qext-send]', modal()).click(); await sleep(10);
  check('… nothing is posted and the modal says so', [posts.length, txt(q('[data-qext-err]', modal()))], [0, 'The request was not sent — the extension webhook is not configured yet.']);
  q('[data-qext-cancel]', modal()).click(); window.localStorage.removeItem('scwQuoteExtPreview');

  // ── the sub bid page (scene_1149) ──────────────────────────────────────────────────────────
  hook = 'https://hook.us1.make.com/qext';
  window.Knack.router.current_scene_key = 'scene_1149';
  function subPage(bid) {
    document.body.innerHTML = '<div class="kn-view kn-details" id="view_3552"></div><div class="kn-view kn-table" id="view_3550"></div>';
    window.Knack.views = { view_3552: { model: { attributes: Object.assign({ id: BID, field_2635: '11/2/2026', field_2635_raw: { date_formatted: '11/2/2026' },
      field_2387_raw: [{ id: SOW, identifier: '1589' }] }, bid || {}) } } };
  }
  const subCard = () => document.getElementById('scw-qext-sub');
  subPage({ field_9101: 'Yes', field_9101_raw: true }); qx.renderSubCard();
  check('no flag field configured: no card', !!subCard(), false);
  qx.CONFIG.sub.requestedFlag = 'field_9101'; qx.CONFIG.sub.requestedDate = 'field_9102';
  subPage({ field_9101: 'No', field_9101_raw: false }); qx.renderSubCard();
  check('flag No: no card', !!subCard(), false);
  subPage({ field_9101: 'Yes', field_9101_raw: true, field_9102: '12/31/2026', field_9102_raw: { date_formatted: '12/31/2026' } }); qx.renderSubCard();
  check('flag Yes: the card above the document names the requested date and the bid\'s own expiration, with the three answers',
    [!!subCard(), subCard().nextElementSibling.id, /hold this bid until 12\/31\/2026/.test(txt(subCard())), /currently expires 11\/2\/2026/.test(txt(subCard())),
     [...subCard().querySelectorAll('[data-qext-outcome]')].map(b => b.textContent)],
    [true, 'view_3550', true, true, ['Can\'t extend', 'Re-price instead', 'Extend bid to 12/31/2026']]);
  // extend with a bad date
  q('[data-qext-sub-date]', subCard()).value = '2/30/2027'; posts.length = 0; q('[data-qext-outcome="extend"]', subCard()).click();
  check('extend refuses an invalid date, posts nothing', [posts.length, txt(q('[data-qext-sub-err]', subCard()))], [0, 'Enter the date to extend to as M/D/YYYY.']);
  // extend to an earlier date than requested is fine
  q('[data-qext-sub-date]', subCard()).value = '12/15/2026'; q('[data-qext-sub-note]', subCard()).value = 'ok through mid-December';
  q('[data-qext-outcome="extend"]', subCard()).click();
  check('extend posts confirm-extension with the chosen date, the bid, the SOW and the note',
    [body().stepId, body().bidPackageId, body().sowId, body().outcome, body().bidExpiration, body().note], ['confirm-extension', BID, SOW, 'extend', '12/15/2026', 'ok through mid-December']);
  lastPost().success({ success: true }); await sleep(10);
  check('after the reply the card reads sent', [subCard().getAttribute('data-scw-qext-sub-done'), /extended to 12\/15\/2026/.test(txt(subCard()))], ['extend', true]);
  subPage({ field_9101: 'Yes', field_9101_raw: true, field_9102: '12/31/2026', field_9102_raw: { date_formatted: '12/31/2026' } }); qx.renderSubCard();
  posts.length = 0; q('[data-qext-outcome="reprice"]', subCard()).click();
  check('re-price posts its outcome, no date', [body().outcome, body().bidExpiration], ['reprice', undefined]);
  lastPost().error({ status: 500 }); await sleep(10);
  check('a failed POST re-enables the buttons and says so', [[...subCard().querySelectorAll('[data-qext-outcome]')].every(b => !b.disabled), txt(q('[data-qext-sub-err]', subCard()))],
    [true, 'Your answer failed (HTTP 500) — try again.']);
  posts.length = 0; q('[data-qext-outcome="decline"]', subCard()).click();
  check('decline posts its outcome', body().outcome, 'decline');
  lastPost().error({ status: 0 }); await sleep(10);
  check('a CORS-opaque reply counts as sent', subCard().getAttribute('data-scw-qext-sub-done'), 'decline');

  // ── helpers ──
  check('normalizeMdy: shapes in, M/D/YYYY out, impossible dates out', [qx.normalizeMdy('11-31-2026'), qx.normalizeMdy('12.1.26'), qx.normalizeMdy('01022027'), qx.normalizeMdy('2/29/2027')], ['', '12/1/2026', '1/2/2027', '']);
  check('suggestedDate: +30 days past the current expiration, never before +30 days from today', [qx.suggestedDate(plus(5)), qx.suggestedDate('1/1/2020'), qx.suggestedDate('')], [plus(35), plus(30), plus(30)]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
