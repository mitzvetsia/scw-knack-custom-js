// jsdom smoke test: the "Sub bid" disclosure at the foot of an expanded build-SOW card — the only
// place an ORDINARY row's Require Sub Bid is flipped (the accessory edit modal covers accessories).
// It must: render only where config opts in (view_3962), never on assumptions, sit BELOW the notes
// as the last thing in the panel, read the current state in its header while collapsed, and use
// the modal's own Yes / No radiochips wired to SCW.requireSubBid.setFlag. Nothing on the row at rest.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#build/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1' } }; global.Knack = window.Knack;
// A stub of require-sub-bid-settings.js's API: readFlag as the real one behaves, setFlag recorded.
const calls = [];
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  requireSubBid: {
    readFlag(rec, field) { const v = rec[field + '_raw']; return v === true ? 'Yes' : v === false ? 'No' : (rec[field] || ''); },
    setFlag(item, surface, value) { calls.push({ item, surface, value }); return Promise.resolve({ ok: true }); },
    confirm() { return Promise.resolve(true); },
    confirmCopy(item) { return { title: 't', body: 'b' }; },
    labelOf(rec) { return rec.field_1949 || ''; }
  } };
global.SCW = window.SCW;
for (const f of ['config.js', 'card.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
const CAM = '6481e5ba38f283002898113c', NET = '647953bb54b4e1002931ed97', SVC = 'bucket_svc', ASM = '697b7a023a31502ec68b3303';
const conn = (id, name) => [{ id, identifier: name }];
const cam    = { id: 'c1', field_1949: 'Informant 8.0 v5', field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_2479_raw: false, field_2479: 'No' };
const nvr    = { id: 'n1', field_1949: 'Admiral Pro NVR',   field_1964: 1, field_2219_raw: conn(NET, 'Networking or Headend'), field_2479_raw: true, field_2479: 'Yes' };
const svc    = { id: 's1', field_1949: 'Travel',            field_1964: 1, field_2219_raw: conn(SVC, 'Other Services'), field_2479: 'No' };
const assume = { id: 'a1', field_1949: 'Site Access',       field_1964: 1, field_2219_raw: conn(ASM, 'Assumptions'), field_2479: 'No' };
ns.data = { readRecords() { return [cam, nvr, svc, assume]; } };

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const sectionOf = (rec, view) => ns.card.buildCard(rec, view).querySelector('.scw-ws-v2-subbid');

// ── Where it appears ────────────────────────────────────────────────
check('build-SOW rows get the disclosure: cam, default (NVR), services',
  [!!sectionOf(cam, 'view_3962'), !!sectionOf(nvr, 'view_3962'), !!sectionOf(svc, 'view_3962')], [true, true, true]);
check('never on an assumptions row — it is contract language, nobody bids it',
  sectionOf(assume, 'view_3962'), null);
check('only where config opts in: the ops CO worksheet (view_4079) has no requireSubBidControl',
  sectionOf(cam, 'view_4079'), null);
check('NOTHING on the row at rest — no gear, no icon; the section lives inside the detail panel only',
  (() => { const card = ns.card.buildCard(cam, 'view_3962');
           return [card.querySelector('.scw-ws-v2-row .scw-ws-v2-subbid'), !!card.querySelector('.scw-ws-v2-detail .scw-ws-v2-subbid')]; })(),
  [null, true]);
check('it is the LAST thing in the expanded panel — below the notes, not in the field grid',
  (() => { const d = ns.card.buildCard(cam, 'view_3962').querySelector('.scw-ws-v2-detail');
           return d.lastElementChild.classList.contains('scw-ws-v2-subbid'); })(), true);

// ── Collapsed by default; the header still reads the state ──────────
const sNo = sectionOf(cam, 'view_3962'), sYes = sectionOf(nvr, 'view_3962');
check('collapsed by default, aria says so',
  [sNo.classList.contains('is-open'), sNo.querySelector('.scw-ws-v2-subbid-head').getAttribute('aria-expanded')], [false, 'false']);
check('the header states the flag without opening anything — No and Yes read differently',
  [sNo.querySelector('.scw-ws-v2-subbid-state').textContent, sYes.querySelector('.scw-ws-v2-subbid-state').textContent,
   sYes.querySelector('.scw-ws-v2-subbid-state').classList.contains('scw-ws-v2-subbid-state--yes')],
  ['Not required', 'Required — subs price this item on its own line', true]);

// ── The control is the modal's own radiochips, carrying what init.js needs ──
const chips = [...sNo.querySelectorAll('[data-scw-ws-v2-subbid]')];
check('Yes / No radiochips, current value selected, each stamped with record / view / field for the delegate',
  chips.map(c => [c.textContent, c.classList.contains('is-selected'), c.getAttribute('data-scw-ws-v2-record'), c.getAttribute('data-scw-ws-v2-view'), c.getAttribute('data-scw-ws-v2-field')]),
  [['Yes', false, 'c1', 'view_3962', 'field_2479'], ['No', true, 'c1', 'view_3962', 'field_2479']]);
check('the note says what Yes and No mean in the sub\'s terms',
  /subs must price this item/.test(sNo.querySelector('.scw-ws-v2-subbid-note').textContent), true);

// ── Without the write module the section degrades to read-only text ──
delete window.SCW.requireSubBid;
const sRo = sectionOf(nvr, 'view_3962');
check('no SCW.requireSubBid → state still shown, but read-only text instead of chips, and no "change" hint',
  [!!sRo, sRo.querySelectorAll('[data-scw-ws-v2-subbid]').length, sRo.querySelector('.scw-ws-v2-display').textContent, sRo.querySelector('.scw-ws-v2-subbid-hint').textContent],
  [true, 0, 'Yes', '']);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
