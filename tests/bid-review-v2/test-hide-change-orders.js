// jsdom smoke test: the reconcile-bids page serves no change orders (bid-review-v2 CONFIG
// hideChangeOrders, 2026-10-13). A SOW whose identifier carries the CO suffix, or whose Type on
// the next-step grid (view_3918, field_2952) reads "change order", gets no grid / tab; the bid
// records and SOW line items connected only to change orders are dropped before the state is
// built — so they never surface as "Unmatched bid items" or removed rows — while an item on a
// base SOW as well stays in the base grid. Flip the flag off and the CO grids are back.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155"></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#review-bids/6a2c00010000000000001111' });
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
const ns = window.SCW.bidReviewV2;
const T = ns.transform;
const FK = window.SCW.bidReview.CONFIG.fieldKeys, SFK = window.SCW.bidReview.CONFIG.sowItemFieldKeys;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const conn = (id, name) => [{ id, identifier: name }];
const CAM = '6481e5ba38f283002898113c';
const BASE = '6a2c000100000000000b1145', CO1 = '6a2c000100000000000c1410', CO2 = '6a2c000100000000000c1580';
const ref = ids => ids.map(id => ({ id, identifier: id === BASE ? '1145' : id === CO1 ? '1410CO' : '1580' }));
// CO2's identifier carries no suffix — only the next-step grid's Type column says change order.
document.body.innerHTML += '<div id="view_3918"><table><tbody>' +
  '<tr id="' + BASE + '"><td class="field_2952">base scope</td></tr>' +
  '<tr id="' + CO2 + '"><td class="field_2952">change order</td></tr></tbody></table></div>';
function item(id, sows, label) {
  const r = { id, field_1949_raw: conn('p' + id, 'Deputy 8.0 v5'), field_1958: 'Deputy 8.0 v5', field_1950: label, field_1964: 1,
    field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: conn('m1', 'MDF - Clubhouse'), field_2218: 10 };
  r[SFK.sow + '_raw'] = ref(sows); r[SFK.fee] = 100; r[SFK.installFee] = 50; r[SFK.equipmentTotal] = 500;
  return r;
}
function bid(id, o) {
  const r = { id };
  r[FK.sow + '_raw'] = ref(o.sows || []);
  r[FK.bidPackage + '_raw'] = conn(o.pkg || 'pkgA', 'SVS');
  r[FK.relatedSowItem + '_raw'] = o.item ? conn(o.item, 'E') : [];
  r[FK.proposalBucket + '_raw'] = conn(CAM, 'Camera');
  r[FK.productName] = 'Deputy 8.0 v5'; r[FK.qty] = 1; r[FK.rate] = 100; r[FK.labor] = 100;
  return r;
}
const sowItems = [
  item('i1', [BASE], 'E-001'),
  item('i2', [CO1], 'E-002'),          // change order only (suffix)
  item('i3', [BASE, CO1], 'E-003'),    // base scope that a CO also lists — stays
  item('i4', [CO2], 'E-004'),          // change order only (by Type on view_3918)
  item('i5', [], 'E-005')              // on no SOW at all — the removed machinery's, untouched
];
const bids = [
  bid('b1', { sows: [BASE], item: 'i1' }),
  bid('b2', { sows: [CO1], item: 'i2' }),      // CO-only by its own SOW
  bid('b3', { sows: [], item: 'i4' }),         // CO-only through its line item
  bid('b4', { sows: [CO1], item: 'i3' })       // names the CO, but its item is base scope — stays
];
const pkgs = [{ id: 'pkgA', field_2636: 'SVS bid', field_2550: 'Submitted' }];

check('isChangeOrderSow: the CO suffix on an identifier / name, else the grid Type by id (after a build)',
  [T.isChangeOrderSow({ identifier: '1410CO' }), T.isChangeOrderSow({ identifier: 'SW-1781CO' }), T.isChangeOrderSow({ name: '60486704913-SW1781CO' }),
   T.isChangeOrderSow({ identifier: '1145' }), T.hidesChangeOrders()],
  [true, true, true, false, true]);

const d = T.dropChangeOrders(bids, sowItems);
check('dropChangeOrders: CO ids from the suffix AND the grid Type; CO-only items and bid records go, mixed + no-SOW stay',
  [Object.keys(d.coIds).sort(), d.sowItems.map(i => i.id), d.records.map(b => b.id)],
  [[CO1, CO2].sort(), ['i1', 'i3', 'i5'], ['b1', 'b4']]);
check('after a build the grid-typed CO is known by id too', T.isChangeOrderSow({ id: CO2, identifier: '1580' }), true);

const state = T.buildState(bids, sowItems, pkgs);
const grids = state.sowGrids;
check('buildState: one grid — the base SOW; no change-order grid, no "Unmatched bid items" grid for the dropped records',
  grids.map(g => g.sowId), [BASE]);
const baseRows = grids[0].rows.map(r => r.sowItem).sort();
check('the base grid holds its own item and the mixed item, never the CO-only ones',
  [baseRows.indexOf('i1') !== -1, baseRows.indexOf('i3') !== -1, baseRows.indexOf('i2'), baseRows.indexOf('i4')], [true, true, -1, -1]);

// The flag is the switch: off → the CO grids are back (same inputs).
ns.CONFIG.hideChangeOrders = false;
const open = T.buildState(bids, sowItems, pkgs);
check('hideChangeOrders off: the change orders come back as grids of their own',
  open.sowGrids.map(g => g.sowId).sort(), [BASE, CO1, CO2].sort());
ns.CONFIG.hideChangeOrders = true;

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
