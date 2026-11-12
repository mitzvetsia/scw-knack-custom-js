// jsdom smoke test: a 2nd bid line item on the same bid that points at the same SOW item
// ("2nd bid item → same SOW item", stacked under the primary in the bid cell) COUNTS in the bid's
// column total, the "matches the SOW" check, the diff panel and the basis-bid PDF fragment
// (2026-11-12: bid 413 read $40,025.00 "matches the SOW" while its document totals $40,160.00 — a
// second $135 SCW 24 Port PoE Switch line stacked on the SOW item was shown but never summed).
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
window.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
function load(f) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
for (const f of ['bid-review/config.js', 'bid-review-v2/config.js', 'bid-review-v2/transform.js', 'bid-review-v2/card.js']) load(f);
let diffLoaded = false;
try { load('sub-bid-diff/config.js'); load('sub-bid-diff/render.js'); load('sub-bid-diff/pdf-html.js'); diffLoaded = true; }
catch (e) { console.log('note: sub-bid-diff not loadable here (' + (e && e.message) + ') — diff checks skipped'); }

const ns = window.SCW.bidReviewV2;
const T = ns.transform, card = ns.card;
const FK = window.SCW.bidReview.CONFIG.fieldKeys, SFK = window.SCW.bidReview.CONFIG.sowItemFieldKeys;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const conn = (id, name) => [{ id, identifier: name }];
const NET = '6481e5ba38f283002898113d', CAM = '6481e5ba38f283002898113c';
const SOW = '6a2c000100000000000a1580';
const PKG = '6a2c000100000000000bd413', PKG2 = '6a2c000100000000000bd414';
function item(id, label, fee, bucket) {
  const r = { id, field_1949_raw: conn('p' + id, label), field_1958: label, field_1950: label,
    field_1964: 1, field_2219_raw: conn(bucket || NET, 'Networking'), field_1946_raw: conn('m1', 'HEADEND'), field_2218: 10 };
  r[SFK.sow + '_raw'] = [{ id: SOW, identifier: '1580' }]; r[SFK.fee] = fee; r[SFK.installFee] = 0; r[SFK.equipmentTotal] = 500;
  return r;
}
function bid(id, o) {
  const r = { id };
  r[FK.sow + '_raw'] = [{ id: SOW, identifier: '1580' }];
  r[FK.bidPackage + '_raw'] = (o.pkgs || [PKG]).map(p => ({ id: p, identifier: p === PKG ? 'Bid 413' : 'Bid 414' }));
  r[FK.relatedSowItem + '_raw'] = conn(o.item, o.label);
  r[FK.proposalBucket + '_raw'] = conn(o.bucket || NET, 'Networking');
  r[FK.mdfIdf + '_raw'] = conn('m1', 'HEADEND');
  r[FK.displayLabel] = o.label; r[FK.productName] = o.product || 'SCW 24 Port PoE Switch';
  r[FK.qty] = 1; r[FK.rate] = o.labor; r[FK.labor] = o.labor;
  return r;
}
const sowItems = [item('sw', 'SW-01', 135), item('cam', 'I-001', 300, CAM)];
const bids = [
  bid('b1', { item: 'sw', label: 'SW-01', labor: 135 }),
  bid('b2', { item: 'sw', label: 'SW-01', labor: 135 }),      // the 2nd switch on the same SOW item
  bid('b3', { item: 'cam', label: 'I-001', labor: 300, bucket: CAM, product: 'Camera' })
];
const pkgs = [{ id: PKG, field_2636: 'Bid 413', field_2550: 'Submitted' }];

function flatRows(grid) {
  const out = [];
  for (const g of grid.groups) { out.push(...(g.rows || [])); for (const s of (g.subgroups || [])) out.push(...(s.rows || [])); }
  return out;
}

// ── 1. helper ────────────────────────────────────────────────────────────────────────────────────
check('cellLaborTotal: primary + stacked extras', T.cellLaborTotal({ labor: 135, dupes: [{ labor: 135 }, { labor: 20 }] }), 290);
check('cellLaborTotal: no dupes = the cell', T.cellLaborTotal({ labor: 40 }), 40);
check('cellLaborTotal: nothing = 0', T.cellLaborTotal(null), 0);

// ── 2. the column total counts the 2nd bid item ──────────────────────────────────────────────────
const grid = T.buildState(bids, sowItems, pkgs).sowGrids.find(g => g.sowId === SOW);
const swRow = flatRows(grid).find(r => r.sowItem === 'sw');
const cell = swRow.cellsByPackage[PKG];
check('the switch row stacks the 2nd bid item under the primary', [cell.labor, (cell.dupes || []).length], [135, 1]);
const pkg = grid.packages.find(p => p.id === PKG);
check('bid total = every line of the bid (135 + 135 + 300), as the bid document sums it', pkg.subBidTotal, 570);
check('SOW sub-bid total unchanged (135 + 300)', grid.sowTotals.subBid, 435);
check('the bid no longer reads "matches the SOW": +$135 over', [pkg.matchesSow, pkg.deltaVsSow], [false, 135]);

// a record that is ALSO on another bid still counts here (it is a line of this bid too)
const bids2 = bids.slice(0, 1).concat([bid('b2', { item: 'sw', label: 'SW-01', labor: 135, pkgs: [PKG, PKG2] })], bids.slice(2));
const grid2 = T.buildState(bids2, sowItems, pkgs.concat([{ id: PKG2, field_2636: 'Bid 414' }])).sowGrids.find(g => g.sowId === SOW);
check('a stacked record also on another bid still counts in this bid\'s total',
  grid2.packages.find(p => p.id === PKG).subBidTotal, 570);

// a single line per SOW item is unchanged
const grid3 = T.buildState([bids[0], bids[2]], sowItems, pkgs).sowGrids.find(g => g.sowId === SOW);
check('no stacked item: bid total and match unchanged', [grid3.packages[0].subBidTotal, grid3.packages[0].matchesSow], [435, true]);


// ── 4. diff panel + basis PDF fragment agree with the column ─────────────────────────────────────
if (diffLoaded) {
  const sbd = window.SCW.subBidDiff;
  const res = sbd.render.distill(grid, PKG);
  check('diff headline reconciles with the column: SOW − bid = −135, no residual',
    [res.basisTotal, res.totalDelta, Math.abs(res.nonBidDelta) < 0.001], [570, -135, true]);
  const ex = res.exceptions.filter(e => e.tier === 'material').map(e => [e.label, e.sowFee, e.bidLabor, e.delta, e.note]);
  check('the doubled switch is a labor change naming the 2 bid items', ex, [['SW-01', 135, 270, -135, '2 bid items on this SOW item']]);
  const html = sbd.pdfHtml.buildBid(grid, PKG, 'Bid 413');
  check('basis bid PDF lists the 2nd bid item', /SW-01 \(2nd bid item\)/.test(html), true);
}

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
