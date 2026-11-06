// jsdom smoke test: the scope strip's "N QA open" segment and the open-item chips are CLICKABLE
// (init.js, 2026-11-06 — "it's still yelling me about something that's failing QA but ... the other
// status tile says all are reviewed. Can you allow me to click to the 1 that is open?"). A click on
// the segment highlights ONLY the items still open on QA (the camera tile itself still highlights
// every camera), opens the collapsed group that holds the first one through summary.revealCard and
// scrolls to it; a click on one chip aims at that one card; a second click clears; one pressed
// target at a time, tile or chip.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1311"></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#deploy/manage-deployment/6a0000000000000000000001' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.MutationObserver = window.MutationObserver;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; },
  find() { return jqObj; }, ajaxError() { return jqObj; }, length: 0 };
jq.fn = {};
jq.Deferred = function () {
  let state = 'pending', value; const cbs = [];
  const d = {
    resolve(v) { if (state === 'pending') { state = 'resolved'; value = v; cbs.splice(0).forEach(f => f(v)); } return d; },
    reject() { return d; }, promise() { return d; },
    then(ok) { const n = jq.Deferred(); const run = v => n.resolve(ok ? ok(v) : v); if (state === 'resolved') run(value); else cbs.push(run); return n.promise(); }
  };
  return d;
};
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

const CAM = '6481e5ba38f283002898113c';
const conn = (id, name) => [{ id, identifier: name }];
const inst = (id, label, mdfId, extra) => Object.assign({
  id, field_2790: 'Reader', field_2801: label, field_2789: 1, field_2822_raw: conn(CAM, 'Camera / Reader'),
  field_2818_raw: conn(mdfId, mdfId === 'L1' ? 'MDF - Clubhouse' : 'IDF 01 - Gym'), field_2218: 10, field_2830: 'No'
}, extra || {});
// i3 (open on QA) sits in the SECOND group, which starts CLOSED on the page.
const install = [inst('i1', 'AC-01', 'L1', { field_2830: 'Yes' }), inst('i2', 'AC-02', 'L1', { field_2830: 'Yes' }), inst('i3', 'AC-03', 'L2'), inst('i4', 'AC-04', 'L2')];
const models = recs => ({ model: { data: {
  get(id) { const a = recs.find(r => r.id === id); return a ? { attributes: a, set(o) { Object.assign(a, o); } } : null; },
  toJSON() { return recs; }, models: recs.map(r => ({ id: r.id, attributes: r }))
} } });
window.Knack = { views: { view_4093: models(install) }, router: { current_scene_key: 'scene_1311' } };
global.Knack = window.Knack;
window.SCW = {
  CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {}, isInternalUser() { return true; },
  knackRecordUrl(v, id) { return '/v/' + v + '/' + id; }, knackAjax(o) { if (o.success) o.success({ record: {} }); }
};
global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js', 'warnings.js', 'bulk.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
ns.data = { readRecords: v => (v === 'view_4093' ? install : []), subscribe() {}, attachListeners() {}, subscribeRendered() {}, refetchAndNotify() {}, notify() {} };
ns.picker = { open() {} };
// i3's required slots: one never uploaded, one passed; i4 has no required photos but is open on QA too.
ns.photos = { extractPhotoRecords(viewKey, id) {
  if (viewKey !== 'view_4093') return [];
  return id === 'i3' ? [{ required: true, imgUrl: '', qaStatus: 'Pending' }, { required: true, imgUrl: 'u', qaStatus: 'Pass' }] : [];
} };
// init.js: load with its deferred mount attempt neutralised (no live worksheet mount here).
// Keep Node's own timer for the global afterwards: handing jsdom's unbound window.setTimeout to
// global.setTimeout recurses ("Maximum call stack size exceeded").
const realTimeout = window.setTimeout, nodeTimeout = global.setTimeout;
window.setTimeout = function () {}; global.setTimeout = window.setTimeout;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/init.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
window.setTimeout = realTimeout; global.setTimeout = nodeTimeout;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

// The worksheet container the strip lives in: two MDF/IDF groups with cards, the second closed.
const FI = ns.cfg.fields('view_4093');
const opts = { viewKey: 'view_4093', fields: FI, hideMoney: true, records: install };
const strip = ns.summary.buildScopeStrip(ns.groups.buildGroupTree(install, [], { viewKey: 'view_4093', fields: FI }), opts);
const host = document.createElement('div'); host.id = 'scw-ws-v2-view_4093';
host.innerHTML =
  '<div class="scw-ws-v2-l1 scw-ws-v2-l1--open" data-scw-ws-v2-l1="L1"><button type="button" data-scw-ws-v2-l1-toggle="L1">MDF</button>' +
    '<div class="scw-ws-v2-card" data-scw-ws-v2-record="i1">AC-01</div><div class="scw-ws-v2-card" data-scw-ws-v2-record="i2">AC-02</div></div>' +
  '<div class="scw-ws-v2-l1" data-scw-ws-v2-l1="L2"><button type="button" data-scw-ws-v2-l1-toggle="L2">IDF 01</button>' +
    '<div class="scw-ws-v2-card" data-scw-ws-v2-record="i3">AC-03</div><div class="scw-ws-v2-card" data-scw-ws-v2-record="i4">AC-04</div></div>';
host.insertBefore(strip, host.firstChild);
document.body.appendChild(host);
let l2Clicks = 0;
host.querySelector('[data-scw-ws-v2-l1-toggle="L2"]').addEventListener('click', e => { l2Clicks++; e.target.closest('.scw-ws-v2-l1').classList.toggle('scw-ws-v2-l1--open'); });
const scrolled = [];
window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.getAttribute('data-scw-ws-v2-record')); };
const hl = () => [...host.querySelectorAll('.scw-ws-v2-card--scope-hl')].map(c => c.getAttribute('data-scw-ws-v2-record'));
const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

const tile = strip.querySelector('[data-scw-ws-v2-scope-tile="cam"]');
const seg = strip.querySelector('[data-scw-ws-v2-scope-qa-open="all"]');
const chips = [...strip.querySelectorAll('.scw-ws-v2-scope-qa-item')];
check('the strip renders the open segment (two open items) and one chip per open item',
  [seg && seg.getAttribute('data-scw-ws-v2-scope-ids'), chips.map(c => c.getAttribute('data-scw-ws-v2-scope-ids'))], ['i3,i4', ['i3', 'i4']]);

click(seg);
check('segment click: only the two OPEN items are highlighted, the segment is pressed, the tile is not',
  [hl(), seg.classList.contains('is-on'), seg.getAttribute('aria-pressed'), tile.classList.contains('is-on'), tile.getAttribute('aria-pressed')],
  [['i3', 'i4'], true, 'true', false, 'false']);
check('…and the closed group holding them was opened through its own head (revealCard)', [l2Clicks, host.querySelector('[data-scw-ws-v2-l1="L2"]').classList.contains('scw-ws-v2-l1--open')], [1, true]);
setTimeout(() => {
  check('…then the first open card is scrolled into view', scrolled, ['i3']);
  click(seg);
  check('a second click on the segment clears the highlight and the pressed state', [hl(), seg.getAttribute('aria-pressed')], [[], 'false']);
  click(chips[1]);
  check('a chip click aims at THAT card only; the segment stays unpressed', [hl(), chips[1].classList.contains('is-on'), seg.classList.contains('is-on')], [['i4'], true, false]);
  click(tile);
  check('the tile click still highlights every camera and takes the pressed state off the chip',
    [hl().sort(), tile.getAttribute('aria-pressed'), chips[1].getAttribute('aria-pressed'), chips[1].classList.contains('is-on')],
    [['i1', 'i2', 'i3', 'i4'], 'true', 'false', false]);
  click(chips[0]);
  check('a chip click after the tile: the tile is released, the chip\'s card alone is lit', [hl(), tile.getAttribute('aria-pressed'), chips[0].getAttribute('aria-pressed')], [['i3'], 'false', 'true']);
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
}, 150);
