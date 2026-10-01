// jsdom smoke test: on the reconcile-bid page, an accessory whose Require Sub Bid is Yes gets
// its own row (so its sub bid — or the absence of one — is visible) AND that row nests under
// its parent. The parent pointer (field_2464) lives on the SOW line item, not the bid record,
// so weaveAccessories must resolve it off row.sowFullRecord — a bid-backed row's own parentId
// is always '' (read off a record that has no such field).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#bids/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
for (const f of ['bid-review/config.js', 'bid-review-v2/config.js', 'bid-review-v2/transform.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const T = window.SCW.bidReviewV2.transform;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const conn = (id, name) => [{ id, identifier: name }];
// Rows as buildState hands them to groupRows: bid-backed (id = bid record, sowItem = SOW line
// item), parentId read off the BID record (→ ''), sowFullRecord = the view_3921 record.
function row(o) { return Object.assign({ parentId: '', mdfIdf: 'MDF', mdfIdfId: 'm1', proposalBucket: 'Access Control' }, o); }
const parent = row({ id: 'b-ac1', sowItem: 's-ac1', displayLabel: 'AC-001', productName: 'Avigilon Alta Video Intercom Reader Pro', sortOrder: 30,
  sowFullRecord: { id: 's-ac1', field_2464_raw: [], field_2479_raw: true } });
const dps = row({ id: 'b-dps', sowItem: 's-dps', displayLabel: '', productName: '[SPECIAL ORDER] DPS (Door Position Switch)', sortOrder: 10,
  sowFullRecord: { id: 's-dps', field_2464_raw: conn('s-ac1', 'AC-001'), field_2479_raw: true } });
const rex = row({ id: 'b-rex', sowItem: 's-rex', displayLabel: '', productName: 'Bosch DS150i Series Request-to-exit Motion Detectors', sortOrder: 10,
  sowFullRecord: { id: 's-rex', field_2464_raw: conn('s-ac1', 'AC-001'), field_2479_raw: true } });
const sw = row({ id: 'b-sw', sowItem: 's-sw', displayLabel: 'SW-001', productName: 'SCW 4 Port Gigabit Switch', sortOrder: 20,
  sowFullRecord: { id: 's-sw', field_2464_raw: [] } });

// Sorted the way the bug surfaced: accessories (low sortOrder) ahead of their parent.
const groups = T.groupRows([dps, rex, sw, parent], []);
const out = groups[0].rows;
check('one MDF group', groups.length, 1);
check('accessories are woven DIRECTLY under AC-001, not floated to the top of the group by sortOrder',
  out.map(r => r.id), ['b-sw', 'b-ac1', 'b-dps', 'b-rex']);
check('both are stamped as accessories of the parent (card.js draws the ATTACHED TO connector off these)',
  [dps.isAccessory, dps.parentKey, dps.parentLabel, rex.isAccessory, rex.parentKey],
  [true, 's-ac1', 'Avigilon Alta Video Intercom Reader Pro', true, 's-ac1']);
check('the parent and the switch stay top-level', [!!parent.isAccessory, !!sw.isAccessory], [false, false]);

// A SOW-backed row (no bid record) still weaves off its own parentId.
const sowOnly = row({ id: 's-hes', sowItem: 's-hes', parentId: 's-ac1', productName: 'HES 9600', sortOrder: 10 });
const p2 = row({ id: 'b-ac1', sowItem: 's-ac1', displayLabel: 'AC-001', sortOrder: 30, sowFullRecord: { id: 's-ac1' } });
const g2 = T.groupRows([sowOnly, p2], []);
check('SOW-backed rows (parentId set from the line item itself) still nest', g2[0].rows.map(r => r.id), ['b-ac1', 's-hes']);

// Parent not in this group → the accessory stays visible as a top-level row (never vanishes).
const orphan = row({ id: 'b-o', sowItem: 's-o', productName: 'Orphan', sortOrder: 10, sowFullRecord: { id: 's-o', field_2464_raw: conn('s-elsewhere', 'X') } });
const g3 = T.groupRows([orphan], []);
check('an accessory whose parent is not loaded here stays a visible top-level row', [g3[0].rows.map(r => r.id), !!orphan.isAccessory], [['b-o'], false]);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
