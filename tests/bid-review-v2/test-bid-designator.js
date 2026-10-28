// jsdom smoke test: the bid line's designator on the reconcile grid (2026-10-28). "On the reconcile bid
// grid we need to be displaying the label / designator (I-002 etc) on the BID line item AND flagging any
// discrepancies between the two." Every bid cell now opens with a Label line carrying the bid line's own
// designator — field_2365 when it is drop-shaped, else composed from the bid's prefix + number
// (field_2361 / field_2362) — and getMismatches.designator compares it, case- and padding-insensitive,
// with the SOW line item's (field_1950, else field_2240 + field_1951). ANY discrepancy flags, a missing
// designator on one side included; non-device rows (product-based labels) carry no designator and never
// flag; the flagged line names the SOW value and hover-links to the row-label column.
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
const CAM = '6481e5ba38f283002898113c', NET = '6481e5ba38f283002898113d';
const SOW_A = '6a2c000100000000000a1105';
const PKG = '6a2c0001000000000000bid8';
const PFX_I = '6a2c00010000000000000pfi', PFX_N = '6a2c00010000000000000pfn';

// ── config ───────────────────────────────────────────────────────────────────────────────────────
check('the SOW item field map names the designator inputs (view_3921 serves both)', [SFK.dropPrefix, SFK.dropNumber], ['field_2240', 'field_1951']);
check('the bid item field map names its inputs', [FK.dropPrefix, FK.dropNumber, FK.displayLabel], ['field_2361', 'field_2362', 'field_2365']);

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────
check('designatorOfLabel: drop-shaped labels only',
  ['E-001', 'I-038', 'RA-E-200', 'CAM12', 'n-1', 'Hikvision NVR (MDF)', '6a2c00010000000000000abc (MDF - Clubhouse)', '', '<span>E-002</span>'].map(T.designatorOfLabel),
  ['E-001', 'I-038', 'RA-E-200', 'CAM12', 'n-1', '', '', '', 'E-002']);
check('composeDesignator: prefix + 3-digit padded number, nothing without both',
  [T.composeDesignator('I-', '5'), T.composeDesignator('I-', 38), T.composeDesignator('RA-E-', '1,200'), T.composeDesignator('', '5'), T.composeDesignator('I-', ''), T.composeDesignator('I-', 'x')],
  ['I-005', 'I-038', 'RA-E-1200', '', '', '']);
check('designatorKey: case, whitespace and zero padding do not count',
  [T.designatorKey('E-001'), T.designatorKey('e-1'), T.designatorKey(' RA-E-200 '), T.designatorKey('')], ['e-1', 'e-1', 'ra-e-200', '']);

// ── state ────────────────────────────────────────────────────────────────────────────────────────
// SOW line items (view_3921 shape) and Bid 8's records (view_3680 shape).
function item(id, o) {
  const r = { id, field_1949_raw: conn('p' + id, o.product || 'Informant Dual Vision'), field_1958: o.product || 'Informant Dual Vision',
    field_1950: o.label == null ? '' : o.label, field_1964: 1, field_2219_raw: conn(o.bucket || CAM, o.bucket === NET ? 'Networking' : 'Camera / Reader'),
    field_1946_raw: conn('m1', 'MDF - Clubhouse'), field_2218: 10 };
  r[SFK.sow + '_raw'] = [{ id: SOW_A, identifier: '1105' }]; r[SFK.fee] = 700; r[SFK.installFee] = 50; r[SFK.equipmentTotal] = 500;
  if (o.prefix) r[SFK.dropPrefix + '_raw'] = conn(o.prefixId || PFX_I, o.prefix);
  if (o.number != null) r[SFK.dropNumber] = String(o.number);
  return r;
}
function bid(id, o) {
  const r = { id };
  r[FK.sow + '_raw'] = [{ id: SOW_A, identifier: '1105' }];
  r[FK.bidPackage + '_raw'] = conn(PKG, 'Bid 8');
  r[FK.relatedSowItem + '_raw'] = o.item ? conn(o.item, o.label || 'X') : [];
  r[FK.proposalBucket + '_raw'] = conn(o.bucket || CAM, o.bucket === NET ? 'Networking' : 'Camera');
  r[FK.mdfIdf + '_raw'] = conn('m1', 'MDF - Clubhouse');
  r[FK.displayLabel] = o.label == null ? '' : o.label; r[FK.productName] = o.product || 'Informant Dual Vision';
  r[FK.qty] = 1; r[FK.rate] = 700; r[FK.labor] = 700;
  if (o.prefix) r[FK.dropPrefix + '_raw'] = conn(o.prefixId || PFX_I, o.prefix);
  if (o.number != null) r[FK.dropNumber] = String(o.number);
  return r;
}
const sowItems = [
  item('iSame',   { label: 'I-002', prefix: 'I-', number: 2 }),              // same designator both sides
  item('iMoved',  { label: 'I-003', prefix: 'I-', number: 3 }),              // SOW renumbered to 3, bid still 2
  item('iComp',   { label: 'I-005', prefix: 'I-', number: 5 }),              // bid label blank, prefix + number present
  item('iLost',   { label: 'I-001', prefix: 'I-', number: 1 }),              // bid has no designator at all
  item('iPad',    { label: 'I-001', prefix: 'I-', number: 1 }),              // bid label "i-1"
  item('iNvr',    { label: 'Hikvision NVR', bucket: NET, product: 'Hikvision NVR' }),   // product-based labels
  item('iNet',    { label: '6a2c00010000000000000abc (MDF - Clubhouse)', bucket: NET, product: 'Switch 24', prefix: 'N-', prefixId: PFX_N, number: 1 }),
  item('iGain',   { label: '', prefix: '', number: null })                   // SOW has none, bid has one
];
const bids = [
  bid('bSame',  { item: 'iSame',  label: 'I-002', prefix: 'I-', number: 2 }),
  bid('bMoved', { item: 'iMoved', label: 'I-002', prefix: 'I-', number: 2 }),
  bid('bComp',  { item: 'iComp',  label: '',      prefix: 'I-', number: 5 }),
  bid('bLost',  { item: 'iLost',  label: '' }),
  bid('bPad',   { item: 'iPad',   label: 'i-1',   prefix: 'I-', number: 1 }),
  bid('bNvr',   { item: 'iNvr',   label: 'Hikvision NVR (MDF - Clubhouse)', bucket: NET, product: 'Hikvision NVR' }),
  bid('bNet',   { item: 'iNet',   label: 'Switch 24 (MDF - Clubhouse)', bucket: NET, product: 'Switch 24', prefix: 'N-', prefixId: PFX_N, number: 1 }),
  bid('bGain',  { item: 'iGain',  label: 'E-009', prefix: 'E-', prefixId: 'pfe', number: 9 }),
  bid('bOrphan', { item: null,   label: 'E-003', prefix: 'E-', prefixId: 'pfe', number: 3 })   // bid-only: no SOW item to compare
];
const pkgs = [{ id: PKG, field_2636: 'Bid 8', field_2550: 'Submitted' }];
const state = T.buildState(bids, sowItems, pkgs);
const grid = state.sowGrids.find(g => g.sowId === SOW_A);
function flatRows(g) { const out = []; for (const l1 of g.groups) { out.push(...(l1.rows || [])); for (const s of (l1.subgroups || [])) out.push(...(s.rows || [])); } return out; }
const rows = Object.create(null); for (const r of flatRows(grid)) rows[r.id] = r;
const cellOf = r => r.cellsByPackage[PKG];
const mm = r => T.getMismatches(r, cellOf(r));

check('cell.designator: the drop-shaped label as is', cellOf(rows.bSame).designator, 'I-002');
check('cell.designator: composed from prefix + number when the label is blank', [cellOf(rows.bComp).designator, cellOf(rows.bComp).dropPrefix, cellOf(rows.bComp).dropNumber], ['I-005', 'I-', '5']);
check('cell.designator: nothing without label, prefix or number', cellOf(rows.bLost).designator, '');
check('cell.designator: a product-based label is not a designator', [cellOf(rows.bNvr).designator, cellOf(rows.bNet).designator], ['', 'N-001']);
check('SOW item designator: field_1950 when drop-shaped, else composed from field_2240 + field_1951, else blank',
  [rows.bSame.sowItemData.designator, rows.bNet.sowItemData.designator, rows.bNvr.sowItemData.designator, rows.bGain.sowItemData.designator],
  ['I-002', 'N-001', '', '']);

check('no drift when both sides read the same designator', [mm(rows.bSame).designator, mm(rows.bSame).any], [false, false]);
check('drift when the SOW renumbered the device (I-003) and the bid still says I-002', [mm(rows.bMoved).designator, mm(rows.bMoved).any], [true, true]);
check('a composed bid designator compares like a label (I-005 == I-005)', mm(rows.bComp).designator, false);
check('a bid line with NO designator against a labelled SOW item is a discrepancy', mm(rows.bLost).designator, true);
check('padding and case never count ("i-1" == "I-001")', mm(rows.bPad).designator, false);
check('product-based labels on both sides: no designator, no drift', mm(rows.bNvr).designator, false);
check('a degenerate SOW label ("<id> (MDF)") falls back to the SOW prefix + number and matches the bid', mm(rows.bNet).designator, false);
check('a bid designator the SOW item lacks is a discrepancy too', mm(rows.bGain).designator, true);
check('no SOW item loaded (bid-only row) → no verdict', T.getMismatches(rows.bOrphan, cellOf(rows.bOrphan)), null);

// ── card ─────────────────────────────────────────────────────────────────────────────────────────
const pkg = grid.packages[0];
function bidCell(r) { return card.buildBidCell(cellOf(r), r, pkg, SOW_A, false); }
const line = td => td.querySelector('.scw-bid-review-v2__cell-label');
// Element children read with a space between them (the gap is CSS margin, not whitespace).
const txt = n => n ? Array.from(n.childNodes).map(c => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ') : null;
const tdSame = bidCell(rows.bSame), lSame = line(tdSame);
check('every bid cell with a designator opens with a Label line (first child, before the product)',
  [!!lSame, tdSame.firstElementChild === lSame, txt(lSame), lSame.querySelector('.scw-bid-review-v2__cell-label-val').textContent],
  [true, true, 'Label I-002', 'I-002']);
check('…unflagged: no diff pill, no SOW value, no hover hook, cell not a mismatch',
  [!!lSame.querySelector('.scw-bid-review-v2__field-diff'), !!lSame.querySelector('.scw-bid-review-v2__cell-label-sow'), lSame.hasAttribute('data-scw-diff-field'),
   tdSame.classList.contains('scw-bid-review-v2__cell--mismatch')],
  [false, false, false, false]);
const tdMoved = bidCell(rows.bMoved), lMoved = line(tdMoved);
check('drift: the bid value wears the diff pill, the SOW value reads beside it, the line hover-links to the row label',
  [txt(lMoved), lMoved.querySelector('.scw-bid-review-v2__cell-label-val').classList.contains('scw-bid-review-v2__field-diff'),
   txt(lMoved.querySelector('.scw-bid-review-v2__cell-label-sow')), lMoved.getAttribute('data-scw-diff-field'), lMoved.getAttribute('title'),
   tdMoved.classList.contains('scw-bid-review-v2__cell--mismatch')],
  ['Label I-002 SOW: I-003', true, 'SOW: I-003', 'label', 'Bid label: I-002 — SOW: I-003 (prefix I-, number 2)', true]);
const tdLost = bidCell(rows.bLost), lLost = line(tdLost);
check('a bid line with no designator says so, flagged, naming the SOW value',
  [txt(lLost), lLost.querySelector('.scw-bid-review-v2__cell-label-val').classList.contains('scw-bid-review-v2__cell-label-val--none'),
   lLost.querySelector('.scw-bid-review-v2__cell-label-val').classList.contains('scw-bid-review-v2__field-diff')],
  ['Label none on bid SOW: I-001', true, true]);
const tdComp = bidCell(rows.bComp);
check('a composed designator renders like a label, with its inputs on the hover title',
  [txt(line(tdComp)), line(tdComp).getAttribute('title')], ['Label I-005', 'Bid label: I-005 (prefix I-, number 5)']);
check('no designator and no drift → no Label line at all (NVR row)', line(bidCell(rows.bNvr)), null);
check('a bid-only row still shows its own designator (nothing to compare, nothing flagged)',
  [txt(line(bidCell(rows.bOrphan))), !!line(bidCell(rows.bOrphan)).querySelector('.scw-bid-review-v2__field-diff')], ['Label E-003', false]);
check('the bid designator the SOW lacks: flagged, "SOW: none"', txt(line(bidCell(rows.bGain))), 'Label E-009 SOW: none');

// the row-label column (SOW side) is the hover target of the flagged line
const tr = card.buildBidRow(rows.bMoved, grid.packages, SOW_A);
const rowLbl = tr.querySelector('.scw-bid-review-v2__row-label-cell [data-scw-sow-field="label"]');
check('the row-label cell carries the SOW designator as the hover target (data-scw-sow-field="label")', [txt(rowLbl)], ['I-003']);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
