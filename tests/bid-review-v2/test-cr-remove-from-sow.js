// jsdom smoke test: bid-review/change-requests.js — "also remove from the SOW" on a Remove request
// (2026-10-22, ClickUp 86bcdrp7m). The Remove modal offers the box only when the bid line maps to a SOW
// line item, with a hint naming what the item keeps; the flag rides the pending item, its card, the
// payload, the HTML and the plain text; on submit (200 or a CORS-opaque 0) the page GETs each flagged
// line item and PUTs its SOW set minus this SOW through view_3921 — 2 in flight, retried on 5xx, a
// permanent 4xx reported — then fires Knack's own knack-cell-update so the mirror cascade runs.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155"></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/69f0d4b567a35332e743cc27/review-bids/69f0d4b567a35332e743cc27' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.sessionStorage = window.sessionStorage;
global.Event = window.Event;
// jQuery stub: Deferred + when (the submit returns a promise), document.trigger capture.
const triggers = [];
function Deferred() {
  const cbs = { done: [], fail: [] }; let state = 'pending', val;
  const d = {
    resolve(v) { if (state === 'pending') { state = 'resolved'; val = v; cbs.done.forEach(f => f(v)); } return d; },
    reject(v) { if (state === 'pending') { state = 'rejected'; val = v; cbs.fail.forEach(f => f(v)); } return d; },
    promise() { return { then(ok, ko) { if (ok) (state === 'resolved' ? ok(val) : cbs.done.push(ok)); if (ko) (state === 'rejected' ? ko(val) : cbs.fail.push(ko)); return this; }, done(f) { return this.then(f); }, fail(f) { return this.then(null, f); } }; },
    then(ok, ko) { return d.promise().then(ok, ko); }
  };
  return d;
}
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger(name, args) { triggers.push({ name, args }); return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
function jq() { return jqObj; }
jq.fn = {}; jq.Deferred = Deferred; jq.when = function () { const d = Deferred(); d.resolve(); return d.promise(); };
jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
// SOW line items on the reconcile grid's model (view_3921).
const SOW_A = 'aaaaaaaaaaaaaaaaaaaaaaaa', SOW_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const li = (id, label, sows) => ({ id, field_1950: label, field_1949: 'Vista Dome 4MP', field_2154_raw: sows.map(s => ({ id: s, identifier: s === SOW_A ? '1589' : '1628' })) });
const items = { li1: li('li1', 'C-001', [SOW_A, SOW_B]), li2: li('li2', 'C-002', [SOW_A]), li3: li('li3', 'C-003', [SOW_A, SOW_B]) };
window.Knack = {
  api_url: 'https://api.knack.com', router: { current_scene_key: 'scene_1155' },
  getUserAttributes() { return { id: 'u1', name: 'Micah', email: 'x@getscw.com' }; }, getUserToken() { return 'tok'; },
  views: { view_3921: { model: { data: { models: Object.values(items).map(a => ({ attributes: a })) } } } }
};
global.Knack = window.Knack;
const reqs = [];
window.SCW = { CONFIG: {}, bidReview: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackAjax(o) { reqs.push(o); return {}; },
  knackRecordUrl(v, id) { return 'https://api.knack.com/v1/pages/scene_1155/views/' + v + '/records/' + id; } };
global.SCW = window.SCW;
function load(rel) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + rel), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
load('bid-review/config.js');
const v1 = window.SCW.bidReview;
const toasts = []; v1.renderToast = (m, t) => toasts.push([t, m]); v1.rerender = () => {};
load('bid-review/change-requests.js');
const cr = v1.changeRequests;
Object.assign(cr._unlink, { gapMs: 0, baseMs: 1, jitterMs: 0, attempts: 3 });

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const modal = () => document.getElementById('scw-bid-cr-overlay');
const q = (sel) => modal().querySelector(sel);
const openRemove = (rowId, itemId, label, extra) => cr.openRemove(Object.assign({
  rowId, pkgId: 'pkgA', pkgName: 'SVS', surveyId: 'sr1', sowId: SOW_A, sowName: '1589',
  sowItemId: itemId, displayLabel: label, productName: 'Vista Dome 4MP', cell: { id: rowId, productName: 'Vista Dome 4MP' }
}, extra || {}));
const last = (type, re) => reqs.slice().reverse().find(r => r.type === type && (!re || re.test(r.url)));
const bodies = (type) => reqs.filter(r => r.type === type).map(r => ({ url: r.url.split('/records/')[1], body: r.data ? JSON.parse(r.data) : null }));

(async () => {
  // ── the Remove modal ─────────────────────────────────────────────────────────────────────────
  openRemove('bid1', 'li1', 'C-001');
  let chk = q('[data-scw-cr-remove-sow]');
  check('a bid line that maps to a SOW line item offers the box, unticked, naming the SOW and what the item keeps',
    [!!chk, chk && chk.checked, txt(q('.scw-bid-cr-modal__sowunlink .scw-bid-cr-modal__checkbox-item')), txt(q('.scw-bid-cr-modal__sowunlink-hint'))],
    [true, false, 'Also remove this item from SOW 1589', 'Happens on this page the moment the change request is submitted — Make is not involved. It stays on SOW 1628.']);
  chk.checked = true;
  q('.scw-bid-cr-modal__textarea').value = 'duplicate of C-004';
  q('.scw-bid-cr-modal__btn--remove').click();
  let pend = cr.getPending().pkgA;
  check('the removal is queued with the flag and the SOW name; the toast says the item also leaves the SOW',
    [pend.items.length, pend.items[0].removeFromBid, pend.items[0].removeFromSow, pend.items[0].removeFromSowName, toasts[toasts.length - 1][1]],
    [1, true, true, '1589', 'Removal added to change request — the item also leaves SOW 1589 when it is submitted']);
  // Re-opening the pending removal shows its note and its choice.
  openRemove('bid1', 'li1', 'C-001');
  check('re-opening a pending removal prefills the note and the box', [q('.scw-bid-cr-modal__textarea').value, q('[data-scw-cr-remove-sow]').checked], ['duplicate of C-004', true]);
  q('.scw-bid-cr-modal__btn--cancel').click();
  // An item on this SOW only.
  openRemove('bid2', 'li2', 'C-002');
  check('an item on no other SOW: the hint says it will be left unassigned, not deleted',
    txt(q('.scw-bid-cr-modal__sowunlink-hint')), 'Happens on this page the moment the change request is submitted — Make is not involved. It is on no other SOW, so it will be left unassigned (on no scope of work) — it is not deleted.');
  q('[data-scw-cr-remove-sow]').checked = true;
  q('.scw-bid-cr-modal__btn--remove').click();
  // A bid-only line (no SOW line item) has nothing to unlink.
  openRemove('bid9', '', 'E-009');
  check('a bid-only line offers no box', !!q('[data-scw-cr-remove-sow]'), false);
  q('.scw-bid-cr-modal__btn--remove').click();
  pend = cr.getPending().pkgA;
  check('three removals queued; only the two with a SOW line item carry the flag', pend.items.map(i => [i.rowId, !!i.removeFromSow]), [['bid1', true], ['bid2', true], ['bid9', false]]);

  // ── card, payload, HTML, plain text ──────────────────────────────────────────────────────────
  const card = cr.buildSummaryCard(pend.items[0], 'pkgA', 'SVS');
  check('the pending card says the item also leaves the SOW', txt(card.querySelector('.scw-bid-cr-card__row--sow')), 'Also leaves SOW 1589 when submitted');
  const card9 = cr.buildSummaryCard(pend.items[2], 'pkgA', 'SVS');
  check('a plain removal card has no such line', !!card9.querySelector('.scw-bid-cr-card__row--sow'), false);

  // ── submit: webhook first, then the SOW unlinks through a 2-wide queue ───────────────────────
  reqs.length = 0; toasts.length = 0; triggers.length = 0;
  cr.submitForPackage('pkgA', { silent: true });
  check('one webhook POST, every removal in it, the flag riding each item', [reqs.length, reqs[0].type, JSON.parse(reqs[0].data).items.map(i => [i.action, i.removeFromSow])],
    [1, 'POST', [['remove', true], ['remove', true], ['remove', false]]]);
  const payloadHtml = JSON.parse(reqs[0].data).html, payloadText = JSON.parse(reqs[0].data).plainText;
  check('the HTML and the plain text name the SOW half of the two flagged removals', [(payloadHtml.match(/Also removed from SOW 1589 when this request was submitted/g) || []).length, (payloadText.match(/Also removed from SOW 1589 when this request was submitted/g) || []).length], [2, 2]);
  reqs[0].success({ success: true });
  await sleep(10);
  check('after the webhook accepts: the pending package is gone and the two SOW line items are read back (2 in flight)',
    [!!cr.getPending().pkgA, reqs.length, bodies('GET').map(b => b.url)], [false, 3, ['li1', 'li2']]);
  // Authoritative reads answer; the PUTs follow with this SOW removed.
  reqs[1].success(items.li1); reqs[2].success(items.li2);
  await sleep(10);
  check('one PUT per item with the SOW set minus this SOW (the lone-SOW item goes to none)',
    bodies('PUT').map(b => [b.url, b.body.field_2154]), [['li1', [SOW_B]], ['li2', []]]);
  const put1 = last('PUT', /li1/), put2 = last('PUT', /li2/);
  put1.success(Object.assign({}, items.li1, { field_2154_raw: [{ id: SOW_B, identifier: '1628' }] }));
  put2.success(Object.assign({}, items.li2, { field_2154_raw: [] }));
  await sleep(10);
  check('each landed PUT fires Knack\'s own cell-update for view_3921 (the mirror cascade\'s trigger) with the field key',
    triggers.filter(t => t.name === 'knack-cell-update.view_3921').map(t => [t.args[0].key, t.args[1].id, t.args[2]]), [['view_3921', 'li1', 'field_2154'], ['view_3921', 'li2', 'field_2154']]);
  check('the toast reports the SOW half', toasts[toasts.length - 1], ['success', 'Removed 2 items from SOW 1589']);

  // ── failure path + CORS-opaque webhook ───────────────────────────────────────────────────────
  openRemove('bid3', 'li3', 'C-003');
  q('[data-scw-cr-remove-sow]').checked = true;
  q('.scw-bid-cr-modal__btn--remove').click();
  reqs.length = 0; toasts.length = 0; triggers.length = 0;
  cr.submitForPackage('pkgA', { silent: true });
  reqs[0].error({ status: 0 });            // Make reached, response CORS-opaque — still a send
  await sleep(10);
  check('a status-0 webhook response still counts as sent and starts the unlink', [!!cr.getPending().pkgA, reqs.length, reqs[1].type], [false, 2, 'GET']);
  reqs[1].success(items.li3);
  await sleep(10);
  check('the PUT goes out', bodies('PUT').map(b => [b.url, b.body.field_2154]), [['li3', [SOW_B]]]);
  last('PUT').error({ status: 500 });      // transient → retried
  await sleep(10);
  check('a 500 is retried', bodies('PUT').length, 2);
  last('PUT').error({ status: 403 });      // permanent → reported
  await sleep(10);
  check('a permanent 4xx is not retried; no cascade event; the toast names the item and asks for the worksheet',
    [bodies('PUT').length, triggers.filter(t => t.name === 'knack-cell-update.view_3921').length, toasts[toasts.length - 1]],
    [2, 0, ['error', 'Could not remove from SOW 1589: C-003 (HTTP 403) — take them off on the worksheet.']]);

  // ── an item already off the SOW is a no-op ───────────────────────────────────────────────────
  reqs.length = 0; toasts.length = 0;
  const res = await (async () => { const p = cr.removeItemsFromSow([{ sowItemId: 'li1', displayLabel: 'C-001' }], SOW_A); await sleep(5); last('GET').success(Object.assign({}, items.li1, { field_2154_raw: [{ id: SOW_B }] })); return p; })();
  check('an item that no longer carries the SOW is left alone (GET only, no PUT)', [res.map(r => [r.ok, r.noop]), bodies('PUT').length], [[[true, true]], 0]);

  console.log(fails ? 'RESULT: ' + fails + ' failed' : 'RESULT: all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
