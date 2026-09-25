// jsdom smoke test: the per-item / per-SOW revision history timeline reads NEWEST → OLDEST all
// the way down (requests by their latest event, items within a request newest first), and
// "Sent to sub" on a Sales → Ops request renders as a COMPLETED (green) state — Ops triaged it and
// handed it on — while on an Ops → Sub request it stays the in-flight indigo chip.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#bids/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, each() { return jqObj; }, length: 0 };
jq.fn = {}; jq.ajax = () => ({ done() { return this; }, fail() { return this; } }); window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/sales-revision-column.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const build = window.SCW.salesRevHistory.buildHistory;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
// Knack ObjectIds date themselves: first 8 hex = unix seconds.
const idAt = (iso, tail) => (Math.floor(Date.parse(iso) / 1000)).toString(16).padStart(8, '0') + tail;
const REQ_OLD = idAt('2026-09-16T15:24:00Z', 'aaaaaaaaaaaaaaaa');   // Ops → Sub, Sep 16
const REQ_NEW = idAt('2026-09-25T14:52:00Z', 'bbbbbbbbbbbbbbbb');   // Sales → Ops, Sep 25
const rev = (id, parent, origin, status, label, prod) => ({
  id, parentRequestId: parent, origin, status, statusNorm: status === 'Accepted' ? 'accepted' : /sub/i.test(status) ? 'forwarded' : 'pending',
  json: { displayLabel: label, productName: prod }, html: ''
});
const rows = [
  // Fed oldest-first on purpose — the builder must not trust input order.
  rev(idAt('2026-09-16T15:25:00Z', '1111111111111111'), REQ_OLD, 'ops',   'Accepted',         'AC-001', 'Avigilon Alta Smart Door Reader'),
  rev(idAt('2026-09-25T14:53:00Z', '2222222222222222'), REQ_NEW, 'sales', 'submitted to sub', 'AC-001', 'Avigilon Alta Video Intercom Reader Pro'),
  rev(idAt('2026-09-25T14:55:00Z', '3333333333333333'), REQ_NEW, 'sales', 'submitted to sub', 'AC-002', 'Avigilon Alta Video Intercom Reader Pro'),
  rev(idAt('2026-09-25T14:54:00Z', '4444444444444444'), REQ_NEW, 'sales', 'Accepted',         'AC-003', 'Bosch DS150i'),
];
const wrap = build(rows);
const blocks = [...wrap.querySelectorAll('.scw-sr-req')];
check('requests read newest → oldest: Sep 25 Sales → Ops above Sep 16 Ops → Sub',
  blocks.map(b => b.querySelector('.scw-sr-req__dir').textContent), ['Sales → Ops', 'Ops → Sub']);
check('items inside a request read newest → oldest too (14:55, 14:54, 14:53), not raise order',
  [...blocks[0].querySelectorAll('.scw-sr-hitem__text')].map(t => t.textContent.slice(0, 6)), ['AC-002', 'AC-003', 'AC-001']);
const chipOf = (block, label) => [...block.querySelectorAll('.scw-sr-hitem')].find(r => r.textContent.includes(label)).querySelector('.scw-sr-panel__chip');
check('"Sent to sub" on a Sales → Ops request is a COMPLETED state: green (chip--done), same as Accepted',
  [chipOf(blocks[0], 'AC-002').textContent, chipOf(blocks[0], 'AC-002').classList.contains('scw-sr-panel__chip--done'),
   chipOf(blocks[0], 'AC-003').classList.contains('scw-sr-panel__chip--done')],
  ['Sent to sub', true, true]);
check('Accepted on an Ops → Sub request is green as before', chipOf(blocks[1], 'AC-001').classList.contains('scw-sr-panel__chip--done'), true);

// On an Ops → Sub request "Sent to sub" means the sub still has it — in flight, not done.
const inflight = build([rev(idAt('2026-09-20T10:00:00Z', '5555555555555555'), REQ_OLD, 'ops', 'submitted to sub', 'AC-009', 'X')]);
check('"Sent to sub" on an Ops → Sub request stays the in-flight chip (no chip--done)',
  [inflight.querySelector('.scw-sr-panel__chip').textContent, inflight.querySelector('.scw-sr-panel__chip').classList.contains('scw-sr-panel__chip--done')],
  ['Sent to sub', false]);

// A request is dated by its LATEST event: an old request whose newest item is recent sorts above a
// request record that is newer than it but whose items are older.
const REQ_A = idAt('2026-09-01T00:00:00Z', 'cccccccccccccccc'), REQ_B = idAt('2026-09-10T00:00:00Z', 'dddddddddddddddd');
const mixed = build([
  rev(idAt('2026-09-24T00:00:00Z', '6666666666666666'), REQ_A, 'sales', 'Accepted', 'A-1', 'p'),
  rev(idAt('2026-09-11T00:00:00Z', '7777777777777777'), REQ_B, 'sales', 'Accepted', 'B-1', 'p'),
]);
check('requests sort by their latest event (request record OR newest item), and a parentless group dates from its items',
  [[...mixed.querySelectorAll('.scw-sr-hitem__text')].map(t => t.textContent.slice(0, 3)),
   build([rev(idAt('2026-09-24T00:00:00Z', '8888888888888888'), '', 'sales', 'Accepted', 'N-1', 'p')]).querySelector('.scw-sr-req__when').textContent !== 'Date unknown'],
  [['A-1', 'B-1'], true]);
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
