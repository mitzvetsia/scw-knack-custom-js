// jsdom smoke test: the Bid / SOW filter's stored choice is PER TAB and is never erased by a rebuild
// (worksheet-v2/sow-filter.js, 2026-10-22). A sub reviewing two variant bids in two tabs saw each tab
// flip to the other's bid "while just scrolling": every background rebuild (poll ticks, the 15 s burst
// after an edit) re-read the SHARED localStorage key. And a rebuild that ran while the BIDs grid was not
// rendered erased a variant with no items for good. Now: the live choice lives in sessionStorage (per
// tab) and localStorage only seeds a fresh tab; a stored id the list cannot show at that instant is
// kept and applied as soon as the grid is back; a click never carries a stale id along; an explicit
// "nothing selected" is not re-seeded; a change-order id on a view that hides COs is still purged.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const REQ = '6a2c00010000000000002222';
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1140"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#site-survey-request-details/' + REQ + '/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.localStorage = window.localStorage;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const B1 = '6a2c000100000000000bd001', B2 = '6a2c000100000000000bd002', B3 = '6a2c000100000000000bd003';
const CAM = '6481e5ba38f283002898113c';
const conn = (id, name) => [{ id, identifier: name }];
const bidRef = ids => ids.map(id => ({ id, identifier: id === B1 ? 'BD-1' : id === B2 ? 'BD-2' : 'BD-3' }));
const rec = (id, bids) => ({ id, field_2365: id.toUpperCase(), field_2379: 'Vista Dome 4MP', field_2399: 1, field_2400: 120,
  field_2366_raw: conn(CAM, 'Camera / Reader'), field_2375_raw: conn('L1', 'MDF - Clubhouse'), field_2218: 10, field_2415_raw: bidRef(bids) });
const survey = [rec('r1', [B1]), rec('r2', [B1]), rec('r3', [B1, B2]), rec('r4', [B2]), rec('r5', [])];
const bidRows = [
  { id: B1, field_2414: 'BD-1', field_2636: 'Base bid' },
  { id: B2, field_2414: 'BD-2', field_2636: 'No readers' },
  { id: B3, field_2414: 'BD-3', field_2636: 'Fresh variant' }   // created, no items yet — listed only through the grid
];
const bidsGrid = { model: { data: { models: bidRows.map(r => ({ attributes: r })) } } };
window.Knack = {
  router: { current_scene_key: 'scene_1140' },
  views: { view_3505: { model: { data: { models: survey.map(r => ({ attributes: r })) } } }, view_3507: bidsGrid }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  sowColor: { dot: i => ['#2563eb', '#dc2626', '#16a34a'][i] || '#000', chipStyle: () => ({ bg: '#fff', border: '#000', text: '#000' }) } };
global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js', 'sow-filter.js', 'sow-context.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
ns.data = { readRecords: vk => (vk === 'view_3505' ? survey : []) };
ns.render = { renderView: () => {} };
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
const panel = (vk) => { const p = document.createElement('div'); p.id = 'scw-ws-v2-' + vk; p.className = 'scw-ws-v2';
  p.innerHTML = '<div class="scw-ws-v2-banner"><span class="scw-ws-v2-banner-title">x</span></div><div class="scw-ws-v2-body"></div>'; document.body.appendChild(p); return p; };
const click = (el, init) => el.dispatchEvent(new window.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, init || {})));
const KEY = 'scw:ws-v2:sow-filter:scene_1140:view_3505:' + REQ;
const sess = () => window.sessionStorage.getItem(KEY);
const local = () => window.localStorage.getItem(KEY);
const mode = (P) => { const b = P.querySelector('.scw-ws-v2-sowctx'); return b ? b.getAttribute('data-scw-ws-v2-sowctx-mode') : null; };
const tok = (P) => txt(P.querySelector('.scw-ws-v2-sowctx-tok'));
const chooseOpt = (P, id) => click(P.querySelector('[data-scw-ws-v2-sowctx-choose="' + id + '"]'));
window.localStorage.clear(); window.sessionStorage.clear();

// ── a choice is written to both stores; the tab's own copy wins over the shared one ─────────────
const P = panel('view_3505');
ns.sowFilter.mount('view_3505');
check('nothing stored anywhere: the chooser', [mode(P), sess(), local()], ['unchosen', null, null]);
chooseOpt(P, B2);
check('choosing BD-2 writes the tab copy (sessionStorage) and the cross-tab seed (localStorage)',
  [ns.sowFilter.loadActive('view_3505'), sess(), local(), mode(P), tok(P)], [[B2], B2, B2, 'single', 'BD-2']);
// Another tab picks BD-1: only the shared seed changes.
window.localStorage.setItem(KEY, B1);
ns.sowFilter.mount('view_3505');
check('a background rebuild after another tab picked BD-1 keeps THIS tab on BD-2 (the old bug flipped it)',
  [ns.sowFilter.loadActive('view_3505'), mode(P), tok(P), ns.sowFilter.filterRecords('view_3505', survey).map(r => r.id)],
  [[B2], 'single', 'BD-2', ['r3', 'r4']]);
// A fresh tab (no session copy) starts from the last choice made anywhere.
window.sessionStorage.removeItem(KEY);
check('a fresh tab is seeded from the shared choice', ns.sowFilter.loadActive('view_3505'), [B1]);
ns.sowFilter.mount('view_3505');
check('…and shows it', [mode(P), tok(P)], ['single', 'BD-1']);

// ── a stored bid the list cannot show right now is kept, not erased ────────────────────────────
// Pick the grid-only variant BD-3 through the tab strip (not additive) …
click(P.querySelector('[data-scw-ws-v2-sowctx-tab="' + B3 + '"]'));
check('BD-3 (listed only through the BIDs grid, 0 items) chosen', [ns.sowFilter.loadActive('view_3505'), mode(P), tok(P)], [[B3], 'single', 'BD-3']);
// … then the BIDs grid is not there (not rendered yet / being re-created by Knack) when a rebuild runs.
window.Knack.views.view_3507 = undefined;
ns.sowFilter.mount('view_3505');
check('BIDs grid absent on a rebuild: the choice is KEPT in both stores (the old write-back erased it)',
  [ns.sowFilter.loadActive('view_3505'), sess(), local(), ns.sowFilter.collectSowList('view_3505').map(b => b.label)],
  [[B3], B3, B3, ['BD-1', 'BD-2']]);
check('while the grid is away the bar cannot name BD-3, so it asks; the records filter stays on BD-3 (its 0 items)',
  [mode(P), ns.sowFilter.filterRecords('view_3505', survey).length], ['unchosen', 0]);
window.Knack.views.view_3507 = bidsGrid;
ns.sowFilter.mount('view_3505');
check('the grid is back: BD-3 is the working bid again, no chooser', [mode(P), tok(P), ns.sowFilter.loadActive('view_3505')], ['single', 'BD-3', [B3]]);

// ── a click never carries a stale id along ─────────────────────────────────────────────────────
window.Knack.views.view_3507 = undefined;
ns.sowFilter.mount('view_3505');
click(P.querySelector('[data-scw-ws-v2-sowctx-tab="' + B1 + '"]'), { shiftKey: true });
check('shift-click BD-1 while BD-3 is unlisted: the new choice is BD-1 alone (BD-3 did not ride along as a second bid)',
  [ns.sowFilter.loadActive('view_3505'), mode(P), tok(P)], [[B1], 'single', 'BD-1']);
window.Knack.views.view_3507 = bidsGrid;
ns.sowFilter.mount('view_3505');
check('…and stays BD-1 alone once the grid is back', [ns.sowFilter.loadActive('view_3505'), mode(P)], [[B1], 'single']);
// The pills strip toggle builds from the shown ids too.
window.sessionStorage.setItem(KEY, B3 + ',' + B1);   // a stale + a live id, as a tab could hold after the grid blinked
window.Knack.views.view_3507 = undefined;
ns.sowFilter.mount('view_3505');
click(P.querySelector('[data-scw-ws-v2-sow-pill="' + B2 + '"]'));
check('pill click while BD-3 is unlisted: BD-1 + BD-2, the stale BD-3 dropped from the new choice', ns.sowFilter.loadActive('view_3505'), [B1, B2]);
window.Knack.views.view_3507 = bidsGrid;

// ── an explicit "nothing selected" is not re-seeded from another tab ────────────────────────────
window.sessionStorage.setItem(KEY, B1); window.localStorage.setItem(KEY, B1);
ns.sowFilter.mount('view_3505');
click(P.querySelector('[data-scw-ws-v2-sow-pill="' + B1 + '"]'));   // toggles the only active pill off
check('toggling the last pill off stores an explicit empty choice in the tab and clears the shared seed', [sess(), local(), ns.sowFilter.loadActive('view_3505')], ['', null, []]);
window.localStorage.setItem(KEY, B2);   // another tab picks BD-2 afterwards
check('…which another tab\'s later pick does not override', ns.sowFilter.loadActive('view_3505'), []);

// ── a change-order id on a view that hides COs is still purged (never transient) ───────────────
const PRJ = '69f0d4b567a35332e743cc27';
window.location.hash = '#team-calendar/project-dashboard/' + PRJ + '/build-sow/' + PRJ;
document.body.id = 'knack-body scene_1085';
const sowItems = [
  { id: 'i1', field_1950: 'C-001', field_1949: 'Vista Dome 4MP', field_2154_raw: [{ id: 'sowA', identifier: '1589' }] },
  { id: 'i2', field_1950: 'C-002', field_1949: 'Vista Dome 4MP', field_2154_raw: [{ id: 'sowA', identifier: '1589' }, { id: 'coX', identifier: '1926CO' }] },
  { id: 'i3', field_1950: 'C-003', field_1949: 'Vista Dome 4MP', field_2154_raw: [{ id: 'sowB', identifier: '1628' }] }
];
window.Knack.views.view_3962 = { model: { data: { models: sowItems.map(r => ({ attributes: r })) } } };
ns.data = { readRecords: vk => (vk === 'view_3962' ? sowItems : (vk === 'view_3505' ? survey : [])) };
const KEY2 = 'scw:ws-v2:sow-filter:scene_1085:view_3962:' + PRJ;
window.sessionStorage.setItem(KEY2, 'coX,sowA'); window.localStorage.setItem(KEY2, 'coX,sowA');
const P2 = panel('view_3962');
ns.sowFilter.mount('view_3962');
check('project page: a stored change-order id is purged from both stores on mount; the base SOW stays',
  [ns.sowFilter.loadActive('view_3962'), window.sessionStorage.getItem(KEY2), window.localStorage.getItem(KEY2), mode(P2)],
  [['sowA'], 'sowA', 'sowA', 'single']);

console.log(fails ? 'RESULT: ' + fails + ' failed' : 'RESULT: all passed');
process.exit(fails ? 1 : 0);
