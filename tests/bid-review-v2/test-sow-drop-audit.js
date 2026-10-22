// jsdom smoke test: the SOW drop audit (bid-review-v2/sow-drop-audit.js, ClickUp 86bcjbxwp) lists the
// reconcile grid's "Not on this SOW" rows whose line item is a CONNECTED device — the cameras the old
// SOW cascade pulled off a SOW when their switch / NVR left it — and restores them through the tray's
// union write, one SOW at a time or all.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155"></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#review-bids/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
function load(rel) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + rel), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js']) load('worksheet-v2/' + f);
load('bid-review/config.js');
for (const f of ['config.js', 'transform.js', 'sow-drop-audit.js']) load('bid-review-v2/' + f);
const ns = window.SCW.bidReviewV2;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const A = 'sowA', B = 'sowB';
const sow = ids => ids.map(id => ({ id, identifier: id === A ? '1105' : '1200' }));
const ref = ids => ids.map(id => ({ id, identifier: 'x' }));
const items = [
  { id: 'nvr', field_1950: 'NVR-1', field_1949: '16ch NVR', field_2154_raw: sow([B]), field_1957_raw: ref(['cam1', 'cam2']), field_2197_raw: [] },
  { id: 'cam1', field_1950: 'C-001', field_1949: 'Dome', field_2154_raw: sow([B]), field_2197_raw: ref(['nvr']) },        // dropped from A; back-pointer intact
  { id: 'cam2', field_1950: 'C-002', field_1949: 'Dome', field_2154_raw: sow([B]), field_2197_raw: [] },                 // dropped from A; only the parent's list names it
  { id: 'svc',  field_1950: '',      field_1949: 'Lift rental', field_2154_raw: sow([B]), field_2197_raw: [] }           // not a connected device
];
ns.data = { readRecords: v => (v === 'view_3921' ? items : []) };
const row = (sowItem, kind) => ({ needsSow: true, otherKind: kind, sowItem, addMode: kind === 'other-sow' ? 'union' : 'create' });
ns.builtState = { sowGrids: [
  { sowId: A, sowName: '1105', rows: [row('cam1', 'other-sow'), row('cam2', 'other-sow'), row('svc', 'other-sow'), row(null, 'bid-only'), { needsSow: false, sowItem: 'nvr' }] },
  { sowId: B, sowName: '1200', rows: [] },
  { sowId: ns.transform.NO_SOW, sowName: 'Bid items (no matching SOW)', rows: [row('cam1', 'other-sow')] }
] };
const calls = [];
window.SCW.sowItemTray = { addToSow(id, sowId, btn) { calls.push([id, sowId, btn && btn.tagName]); } };
const quiet = () => { const t = console.table, l = console.log; console.table = () => {}; console.log = () => {}; return () => { console.table = t; console.log = l; }; };

let un = quiet(); const found = ns.sowAudit.scan(); un();
check('scan lists the connected devices off SOW A — by back-pointer AND by the parent\'s list — not the service, not bid-only rows, never the no-SOW grid',
  found.map(e => [e.sow, e.itemId, e.parentLabel, e.parentOnThisSow, e.itemSows, e.connected]),
  [['1105', 'cam1', 'NVR-1', false, '1200', true], ['1105', 'cam2', 'NVR-1', false, '1200', true]]);
un = quiet(); const all = ns.sowAudit.scan({ all: true }); un();
check('scan({ all: true }) includes the unconnected service too', all.map(e => e.itemId), ['cam1', 'cam2', 'svc']);
un = quiet(); const n = ns.sowAudit.restore(A, found); un();
check('restore(sowId) union-adds each candidate to that SOW through the tray, spaced out — the first at once',
  [n, calls], [2, [['cam1', A, 'BUTTON']]]);
setTimeout(() => {
  check('…the second after the gap', calls.map(c => c[0]), ['cam1', 'cam2']);
  un = quiet(); const none = ns.sowAudit.restore(B, found); un();
  check('a SOW with no candidates restores nothing', none, 0);
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
}, ns.sowAudit._GAP_MS + 100);
