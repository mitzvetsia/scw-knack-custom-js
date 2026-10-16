// jsdom smoke test: every bid line whose line item is NOT on the SOW being reviewed is a grid row
// (2026-10-16). Before this, a bid record pointing (field_2404) at a line item that lives on ANOTHER
// SOW was classed `other-sow`, counted in the column total and shown only in the diff panel and the
// "Items not on this SOW" tray — 13 of Bid 8's priced lines had no row on SOW 1105 (all on 1684),
// while the two E-003 lines (item on no SOW) did. Now both kinds render with needsSow: the SOW cell
// is the empty shape with one context line ("Not on this SOW. On 1684." / "Not on any SOW.") over
// Remove from bid · + Add to this SOW, the bid cell carries a rose "Not on this SOW" badge, the add
// WRITE differs by addMode (union PUT on the existing item vs the row_add_to_sow create CR), the
// diff panel's tier reads "Not on this SOW" and no longer swallows a $0 line scoped on another SOW,
// and the tray leaves out the items that are now rows.
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
for (const f of ['bid-review/config.js', 'bid-review-v2/config.js', 'bid-review-v2/transform.js', 'bid-review-v2/card.js', 'sow-item-tray.js']) load(f);
let diffLoaded = false;
try { load('sub-bid-diff/config.js'); load('sub-bid-diff/render.js'); diffLoaded = true; }
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
const CAM = '6481e5ba38f283002898113c';
const SOW_A = '6a2c000100000000000a1105', SOW_B = '6a2c000100000000000b1684';
const NAME = { [SOW_A]: '1105', [SOW_B]: '1684' };
const ref = ids => ids.map(id => ({ id, identifier: NAME[id] }));
const PKG8 = '6a2c0001000000000000bid8';
function item(id, sows, label, fee) {
  const r = { id, field_1949_raw: conn('p' + id, 'Informant Dual Vision'), field_1958: 'Informant Dual Vision', field_1950: label,
    field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: conn('m1', 'MDF - Clubhouse'), field_2218: 10 };
  r[SFK.sow + '_raw'] = ref(sows); r[SFK.fee] = fee; r[SFK.installFee] = 50; r[SFK.equipmentTotal] = 500;
  return r;
}
function bid(id, o) {
  const r = { id };
  r[FK.sow + '_raw'] = ref(o.sows || []);
  r[FK.bidPackage + '_raw'] = conn(o.pkg || PKG8, 'Bid 8');
  r[FK.relatedSowItem + '_raw'] = o.item ? conn(o.item, o.label || 'X') : [];
  r[FK.proposalBucket + '_raw'] = conn(CAM, 'Camera');
  r[FK.mdfIdf + '_raw'] = conn('m1', 'MDF - Clubhouse');
  r[FK.displayLabel] = o.label || ''; r[FK.productName] = 'Informant Dual Vision';
  r[FK.qty] = 1; r[FK.rate] = o.labor; r[FK.labor] = o.labor;
  return r;
}
const sowItems = [
  item('iA',  [SOW_A], 'I-001',    700),   // on the SOW being reviewed
  item('iB',  [SOW_B], 'RA-I-002', 750),   // on 1684 only — Bid 8 prices it
  item('iB0', [SOW_B], 'RA-I-009', 0),     // on 1684 only — Bid 8 lists it at $0
  item('iC',  [SOW_B], 'RA-I-020', 300)    // on 1684 only — on NO bid → tray material
];
const bids = [
  bid('bA',  { item: 'iA',  label: 'I-001',    labor: 700 }),
  bid('bB',  { item: 'iB',  label: 'RA-I-002', labor: 750 }),   // other-sow on the 1105 grid
  bid('bB0', { item: 'iB0', label: 'RA-I-009', labor: 0 }),     // other-sow at $0 — still a gap
  bid('bE',  { item: null,  label: 'E-003',    labor: 400 }),   // bid-only (item on no SOW)
  bid('bE0', { item: null,  label: 'E-004',    labor: 0 })      // bid-only at $0 — placeholder, suppressed
];
const pkgs = [{ id: PKG8, field_2636: 'Bid 8', field_2550: 'Submitted' }];

function flatRows(grid) {
  const out = [];
  for (const g of grid.groups) { out.push(...(g.rows || [])); for (const s of (g.subgroups || [])) out.push(...(s.rows || [])); }
  return out;
}
function rowById(grid, id) { return flatRows(grid).find(r => r.id === id) || null; }

// ── 1. transform: both kinds are grid rows on the 1105 grid ─────────────────────────────────────
const state = T.buildState(bids, sowItems, pkgs);
const gridA = state.sowGrids.find(g => g.sowId === SOW_A), gridB = state.sowGrids.find(g => g.sowId === SOW_B);
check('both SOWs get a grid', [!!gridA, !!gridB], [true, true]);
const rB = rowById(gridA, 'bB'), rB0 = rowById(gridA, 'bB0'), rE = rowById(gridA, 'bE'), rA = rowById(gridA, 'bA');
check('1105 grid renders the line whose item is on 1684 only (other-sow), in the groups',
  rB && [rB.otherKind, rB.needsSow, rB.addMode, rB.offSow, rB.otherSowNames, rB.sowItem],
  ['other-sow', true, 'union', true, ['1684'], 'iB']);
check('…and the $0 other-sow line too', rB0 && [rB0.otherKind, rB0.needsSow, rB0.addMode], ['other-sow', true, 'union']);
check('the bid-only line (item on no SOW) keeps its row, addMode create',
  rE && [rE.otherKind, rE.needsSow, rE.addMode, rE.offSow, rE.sowItem], ['bid-only', true, 'create', true, '']);
check('the matched row is untouched', rA && [rA.offSow, !!rA.needsSow, !!rA.addMode], [false, false, false]);
check('not-on-SOW rows sit inside their MDF/IDF group with the matched rows, not a block of their own',
  gridA.groups.map(g => g.key), ['MDF - Clubhouse']);
check('the other-sow row has its item data (for the expand panel) but the SOW cell never uses it as a cut-out',
  !!(rB && rB.sowItemData), true);
check('Bid 8 column total counts every priced line, on this SOW or not (unchanged by the rendering)',
  gridA.packages[0].subBidTotal, 700 + 750 + 0 + 400 + 0);
check('SOW sub-bid total is this SOW\'s own items only', gridA.sowTotals.subBid, 700);
check('accepted consequence: the 1105-only line is a "Not on this SOW" row on the 1684 grid too',
  (rowById(gridB, 'bA') || {}).otherKind === 'other-sow' && rowById(gridB, 'bA').otherSowNames.join() === '1105', true);
check('1684 grid: its own items are matched rows there', [rowById(gridB, 'bB').offSow, rowById(gridB, 'bB0').offSow], [false, false]);

// ── 2. basis-filter husk: a not-on-SOW row whose only cell is on a HIDDEN column parks in Removed ──
ns.basisFilter = { hiddenFor() { const h = {}; h[PKG8] = true; return h; }, basisOf() { return ''; } };
const hidden = T.buildState(bids, sowItems, pkgs).sowGrids.find(g => g.sowId === SOW_A);
const husk = rowById(hidden, 'bB');
check('other-sow row on a basis-hidden column goes to the Removed subgroup (husk), like bid-only did',
  husk && [husk.removed, husk.hiddenBidOnly, !!husk.detail, hidden.groups[0].rows.some(r => r.id === 'bB'),
    hidden.groups[0].subgroups.some(s => s.removedItems && s.rows.some(r => r.id === 'bB'))],
  [true, true, true, false, true]);
const huskTd = card.buildSowCell(husk, false, SOW_A);
check('a husk\'s SOW cell: empty shape, context line, what the line was — no actions (its bid is not displayed)',
  [huskTd.classList.contains('scw-bid-review-v2__sow-cell--not-on-sow'), huskTd.querySelectorAll('.scw-bid-review-v2__cell-actions button').length,
   huskTd.querySelector('.scw-bid-review-v2__sow-not-on-sow').textContent],
  [true, 0, 'Not on this SOW. On 1684.']);
delete ns.basisFilter;

// ── 3. card: SOW cell = empty shape + context line + the two remedies ──────────────────────────────
function actions(td) { return Array.from(td.querySelectorAll('.scw-bid-review-v2__cell-actions button')).map(b => b.getAttribute('data-action')); }
const tdB = card.buildSowCell(rB, false, SOW_A);
check('other-sow SOW cell classes: empty + off-sow + not-on-sow',
  ['--empty', '--off-sow', '--not-on-sow'].map(m => tdB.classList.contains('scw-bid-review-v2__sow-cell' + m)), [true, true, true]);
check('other-sow SOW cell never shows the other SOW\'s line details in the cut-out',
  [!!tdB.querySelector('.scw-bid-review-v2__sow-product'), !!tdB.querySelector('.scw-bid-review-v2__sow-numbers'), !!tdB.querySelector('.scw-bid-review-v2__sow-elsewhere')],
  [false, false, false]);
check('other-sow context line', tdB.querySelector('.scw-bid-review-v2__sow-not-on-sow').textContent, 'Not on this SOW. On 1684.');
check('other-sow actions, destructive first: Remove from bid | + Add to this SOW (also) [union]',
  actions(tdB), ['cell_remove_from_bid', 'row_add_item_to_sow']);
const rm = tdB.querySelector('button[data-action="cell_remove_from_bid"]'), add = tdB.querySelector('button[data-action="row_add_item_to_sow"]');
check('Remove names the bid column and the exact bid record (v1 resolveBidTarget\'s bid-record fallback)',
  [rm.textContent, rm.getAttribute('data-package-id'), rm.getAttribute('data-bid-record-id'), rm.getAttribute('data-sow-id'), rm.getAttribute('data-row-id')],
  ['Remove from bid', PKG8, 'bB', SOW_A, 'bB']);
check('the union add names the EXISTING line item and this SOW (sow-item-tray addToSow\'s inputs)',
  [add.textContent, add.getAttribute('data-sow-item-id'), add.getAttribute('data-sow-id'), add.getAttribute('data-label')],
  ['+ Add to this SOW (also)', 'iB', SOW_A, '+ Add to this SOW (also)']);
const tdE = card.buildSowCell(rE, false, SOW_A);
check('bid-only context line', tdE.querySelector('.scw-bid-review-v2__sow-not-on-sow').textContent, 'Not on any SOW.');
check('bid-only actions: Remove from bid | + Add to this SOW [create CR, unchanged write path]',
  [actions(tdE), tdE.querySelector('button[data-action="row_add_to_sow"]').textContent], [['cell_remove_from_bid', 'row_add_to_sow'], '+ Add to this SOW']);
const tdA = card.buildSowCell(rA, false, SOW_A);
check('matched row\'s SOW cell is the normal populated cell', [tdA.classList.contains('scw-bid-review-v2__sow-cell--not-on-sow'), !!tdA.querySelector('.scw-bid-review-v2__sow-numbers')], [false, true]);

// No basis chosen + the row on two bids → Remove targets the first bid it is on; with a basis, that one.
const PKG9 = '6a2c0001000000000000bid9';
const twoBids = Object.assign({}, rB, { cellsByPackage: { [PKG8]: rB.cellsByPackage[PKG8], [PKG9]: Object.assign({}, rB.cellsByPackage[PKG8], { id: 'bB9' }) } });
ns.basisFilter = { basisOf() { return PKG9; }, hiddenFor() { return null; } };
const tdTwo = card.buildSowCell(twoBids, false, SOW_A);
check('with a basis bid chosen, Remove from bid acts on the basis column\'s record',
  [tdTwo.querySelector('button[data-action="cell_remove_from_bid"]').getAttribute('data-package-id'), tdTwo.querySelector('button[data-action="cell_remove_from_bid"]').getAttribute('data-bid-record-id')],
  [PKG9, 'bB9']);
delete ns.basisFilter;

// ── 4. card: bid cell badge ───────────────────────────────────────────────────────────────────────
const pkgObj = gridA.packages[0];
const cellB = card.buildBidCell(rB.cellsByPackage[PKG8], rB, pkgObj, SOW_A, false);
const cellE = card.buildBidCell(rE.cellsByPackage[PKG8], rE, pkgObj, SOW_A, false);
const cellA = card.buildBidCell(rA.cellsByPackage[PKG8], rA, pkgObj, SOW_A, false);
const badge = td => { const b = td.querySelector('.scw-bid-review-v2__no-bid-badge--not-on-sow'); return b ? b.textContent : null; };
check('rose "Not on this SOW" badge on both kinds, none on a matched row', [badge(cellB), badge(cellE), badge(cellA)], ['Not on this SOW', 'Not on this SOW', null]);
check('the bid cell keeps its own Revise / Remove', actions(cellB).indexOf('cell_remove_from_bid') !== -1, true);
const tr = card.buildBidRow(rB, gridA.packages, SOW_A);
check('row class --off-sow stays (jump target for the diff panel: data-row-id = bid record id)',
  [tr.classList.contains('scw-bid-review-v2__row--off-sow'), tr.getAttribute('data-row-id')], [true, 'bB']);

// ── 5. tray: items that are grid rows now are left out ───────────────────────────────────────────
ns.data = { readRecords(k) { return k === 'view_3921' ? sowItems : (k === 'view_3680' ? bids : []); } };
document.body.innerHTML += '<div class="scw-bid-review-v2__sow" data-sow-id="' + SOW_A + '"><table><tr><td data-pkg-id="' + PKG8 + '"></td></tr></table></div>';
const section = document.querySelector('.scw-bid-review-v2__sow');
const groups = window.SCW.sowItemTray.buildGroups(SOW_A, section);
check('tray keeps only the 1684 item NO bid on this section prices; the two Bid 8 lines are grid rows now',
  groups.map(g => [g.label, g.items.map(i => i.id)]), [['On SOW 1684', ['iC']]]);
check('tray groups carry no "on this bid" marks any more', groups.some(g => 'onBid' in g || g.items.some(i => '_onBid' in i)), false);
check('addToSow is exported for the grid\'s union action', typeof window.SCW.sowItemTray.addToSow, 'function');

// ── 6. diff panel: tier copy + $0 rule ───────────────────────────────────────────────────────────
if (diffLoaded) {
  const sbd = window.SCW.subBidDiff;
  check('tier label reads "Not on this SOW"', sbd.CONFIG.TIERS.orphan.label, 'Not on this SOW');
  const res = sbd.render.distill(gridA, PKG8);
  const orphans = res.exceptions.filter(e => e.tier === 'orphan').map(e => [e.label, e.note, e.jumpId, e.jumpAttr]);
  check('orphan exceptions: both other-sow lines (the $0 one is NOT suppressed) + the priced bid-only; the $0 bid-only placeholder is',
    orphans.sort(), [['E-003', 'on no SOW', 'bE', 'bid'], ['RA-I-002', 'on 1684', 'bB', 'bid'], ['RA-I-009', 'on 1684', 'bB0', 'bid']].sort());
  check('orphan count follows', res.counts.orphan, 3);
}

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
