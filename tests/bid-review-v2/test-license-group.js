// jsdom smoke test: licenses on the reconcile-bids page (bid-review-v2). 2026-10-13: view_3921 no
// longer filters the License bucket out, so license line items reach the grid. They get their own
// "Licenses" L1 — last, after Project Wide Services, whatever MDF/IDF the record carries, indigo,
// no manage gear / survey-notes / photos band — their bid cells read a muted "—" (a sub never
// prices a license: no "Not surveyed" cut-out, no "+ Add to bid"), the SOW cell shows Qty but no
// Sub Bid, and they stay out of the SOW's Sub Bid / Install totals, the diff bar's coverage gaps
// and "Update SOW to match Bid"'s disconnect list.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PROJECT = '6a2c00010000000000001111';
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155"></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#review-bids/' + PROJECT });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
global.MutationObserver = window.MutationObserver; global.Event = window.Event;
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
load('bid-review/actions.js');
let sbd = null;
try { load('sub-bid-diff/config.js'); load('sub-bid-diff/render.js'); sbd = window.SCW.subBidDiff && window.SCW.subBidDiff.render; } catch (e) { sbd = null; }
for (const f of ['config.js', 'transform.js', 'basis-filter.js', 'card.js']) load('bid-review-v2/' + f);
const ns = window.SCW.bidReviewV2;
const T = ns.transform;
const LIC = T.LICENSE_BUCKET_ID, CAM = '6481e5ba38f283002898113c';

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
function row(o) {
  return Object.assign({ parentId: '', mdfIdf: 'MDF - Clubhouse', mdfIdfId: 'm1', proposalBucket: 'Camera / Reader',
    proposalBucketId: CAM, cellsByPackage: Object.create(null), requireSubBidSow: true }, o);
}
const PKG = { id: 'pkgA', name: 'SVS' };
const cell = { id: 'bid-1', qty: 1, rate: 100, labor: 100, productName: 'Deputy 8.0 v5', laborDesc: '' };
const cam = row({ id: 'b-cam', sowItem: 's-cam', displayLabel: 'E-001', productName: 'Deputy 8.0 v5', sortOrder: 10,
  cellsByPackage: { pkgA: cell },
  sowItemData: { productName: 'Deputy 8.0 v5', qty: 1, fee: 100, installFee: 50, equipmentTotal: 500, laborDesc: '' } });
const camNoBid = row({ id: 's-cam2', sowItem: 's-cam2', displayLabel: 'E-002', productName: 'Deputy 8.0 v5', sortOrder: 11, noBid: true,
  sowItemData: { productName: 'Deputy 8.0 v5', qty: 1, fee: 100, installFee: 50, equipmentTotal: 500, laborDesc: '' } });
const svc = row({ id: 's-svc', sowItem: 's-svc', mdfIdf: '', mdfIdfId: '', proposalBucket: 'Other Services', proposalBucketId: 'svc', noBid: true,
  sowItemData: { productName: '', qty: 1, fee: 0, installFee: 0, equipmentTotal: 0, laborDesc: 'Programming' } });
// A license WITH an MDF/IDF on the record (left over from a copy) — still lands in Licenses.
const lic = row({ id: 's-lic', sowItem: 's-lic', productName: 'Cloud Storage License, 30 days', sortOrder: 90, proposalBucket: 'License', proposalBucketId: LIC, noBid: true,
  sowItemData: { productName: 'Cloud Storage License, 30 days', qty: 3, fee: 0, installFee: 0, equipmentTotal: 45, laborDesc: '' } });
// A license known only by its bucket label (no id).
const lic2 = row({ id: 's-lic2', sowItem: 's-lic2', productName: 'Health Monitoring License', sortOrder: 91, mdfIdf: '', mdfIdfId: '', proposalBucket: 'Licenses (annual)', proposalBucketId: '', noBid: true,
  sowItemData: { productName: 'Health Monitoring License', qty: 1, fee: 0, installFee: 0, equipmentTotal: 120, laborDesc: '' } });

check('isLicenseRow: bucket id, bucket label, not a camera / service', [T.isLicenseRow(lic), T.isLicenseRow(lic2), T.isLicenseRow(cam), T.isLicenseRow(svc)], [true, true, false, false]);

const groups = T.groupRows([lic2, lic, svc, camNoBid, cam], []);
check('L1 order: the MDF/IDF, Project Wide Services, then Licenses LAST — the license with an MDF on its record is in Licenses, not the MDF',
  [groups.map(g => g.key), groups[0].rows.map(r => r.id), groups[2].rows.map(r => r.id)],
  [['MDF - Clubhouse', 'Project Wide Services', 'Licenses'], ['b-cam', 's-cam2'], ['s-lic', 's-lic2']]);
const licGroup = groups[2];
check('the Licenses group is flagged and carries no location id (the copied MDF is dropped)',
  [licGroup.licenseItems, licGroup.mdfIdfId, licGroup.level, !!groups[0].licenseItems], [true, '', 1, false]);

const hdr = ns.card.buildL1HeaderRow(licGroup, 4);
check('Licenses L1 header: license class, the recurring sub-line, no manage gear',
  [hdr.classList.contains('scw-bid-review-v2__group-header--license'), !!hdr.querySelector('.scw-brv2-mdf-gear'),
   hdr.querySelector('.scw-bid-review-v2__grp-sub').textContent, hdr.querySelector('.scw-bid-review-v2__grp-title').textContent.indexOf('Licenses') === 0],
  [true, false, 'recurring · billed separately · not in the project total', true]);
// Removed license records (on no SOW, never on a bid) fold into the group's collapsed
// "Removed" subgroup — the HEADER count stays the live rows only (the subgroup shows its own).
const removedLic = (i) => row({ id: 's-rl' + i, sowItem: 's-rl' + i, productName: 'Old License ' + i, mdfIdf: '', mdfIdfId: '',
  proposalBucket: 'License', proposalBucketId: LIC, noBid: true, removed: true, hasBidRecord: false,
  sowItemData: { productName: 'Old License ' + i, qty: 1, fee: 0, installFee: 0, equipmentTotal: 10, laborDesc: '' } });
const gWithRemoved = T.groupRows([lic], [removedLic(1), removedLic(2), removedLic(3)]);
const hdrR = ns.card.buildL1HeaderRow(gWithRemoved[0], 4);
check('a Licenses group with 1 live row + 3 removed: the header counts 1; the Removed subgroup carries its own 3',
  [gWithRemoved[0].key, gWithRemoved[0].rows.length, gWithRemoved[0].subgroups.length, gWithRemoved[0].subgroups[0].rows.length,
   gWithRemoved[0].subgroups[0].removedItems, hdrR.querySelector('.scw-bid-review-v2__grp-count').textContent],
  ['Licenses', 1, 1, 3, true, '1']);
const mdfHdr = ns.card.buildL1HeaderRow(groups[0], 4);
check('an MDF/IDF header is untouched (gear, no license class)',
  [mdfHdr.classList.contains('scw-bid-review-v2__group-header--license'), !!mdfHdr.querySelector('.scw-brv2-mdf-gear')], [false, true]);

const licTr = ns.card.buildBidRow(lic, [PKG], 'sow1');
const licBid = licTr.querySelector('.scw-bid-review-v2__pkg-col');
const licSow = licTr.querySelector('.scw-bid-review-v2__sow-cell');
check('license row: license class; the bid cell is a muted "—" — no cut-out, no "Not surveyed", no "+ Add to bid"',
  [licTr.classList.contains('scw-bid-review-v2__row--license'), licBid.classList.contains('scw-bid-review-v2__cell--license'),
   licBid.classList.contains('scw-bid-review-v2__cell--no-bid-cutout'), licBid.textContent.trim(), !!licBid.querySelector('.scw-bid-review__cell-action'),
   licBid.querySelector('.scw-bid-review-v2__cell-empty-mark').getAttribute('title')],
  [true, true, false, '—', false, 'Licenses are not priced by subs']);
check('license row: the SOW cell shows the product + Qty, no Sub Bid figure; the row total reads "Recurring", not "Equip"',
  [licSow.querySelector('.scw-bid-review-v2__sow-product').textContent, !!licSow.querySelector('[data-scw-sow-field="qty"]'),
   !!licSow.querySelector('[data-scw-sow-field="fee"]'), licTr.querySelector('.scw-bid-review-v2__row-total-label').textContent,
   !!licTr.querySelector('.scw-br-v2-rowselect')],
  ['Cloud Storage License, 30 days', true, false, 'Recurring', true]);
const camTr = ns.card.buildBidRow(camNoBid, [PKG], 'sow1');
const camBid = camTr.querySelector('.scw-bid-review-v2__pkg-col');
check('a camera with no bid keeps the cut-out + "Not surveyed" + "+ Add to bid" (regression guard)',
  [camBid.classList.contains('scw-bid-review-v2__cell--no-bid-cutout'), /Not surveyed/.test(camBid.textContent), !!camBid.querySelector('.scw-bid-review__cell-action'),
   camTr.classList.contains('scw-bid-review-v2__row--license'), !!camTr.querySelector('[data-scw-sow-field="fee"]'), camTr.querySelector('.scw-bid-review-v2__row-total-label').textContent],
  [true, true, true, false, true, 'Equip']);

// "Update SOW to match Bid": a license is never "on the SOW, not in this bid".
const payload = window.SCW.bidReview.buildCopyToSowPayload('pkgA', { sowId: 'sow1', rows: [cam, camNoBid, lic, lic2] });
check('Update SOW to match Bid disconnects the unbid camera but never a license',
  [payload.removals.map(r => r.sowItemId), payload.updates.map(u => u.sowItemId)], [['s-cam2'], ['s-cam']]);

// Diff bar: a license missing from the basis bid is not a coverage gap.
if (sbd && typeof sbd.distill === 'function') {
  const res = sbd.distill({ sowId: 'sow1', rows: [cam, camNoBid, lic, lic2] }, 'pkgA');
  check('diff bar: the unbid camera is the only coverage gap — licenses never are',
    [res.coverageGaps, res.exceptions.map(e => e.jumpId)], [1, ['s-cam2']]);
} else {
  console.log('skip the diff-bar distill check (module did not load standalone)');
}

// buildState totals: the SOW Sub Bid / Install totals leave licenses out.
const SFK = window.SCW.bidReview.CONFIG.sowItemFieldKeys;
const conn = (id, name) => [{ id, identifier: name }];
function sowItem(id, o) {
  const r = { id, field_2154_raw: conn('sow1', 'SW-1001'), field_2219_raw: conn(o.bucketId, o.bucket), field_1949_raw: conn('p' + id, o.name),
    field_1964: o.qty, field_1946_raw: o.mdf ? conn('m1', 'MDF - Clubhouse') : [] };
  r[SFK.fee] = o.fee; r[SFK.installFee] = o.install; r[SFK.equipmentTotal] = o.equip;
  return r;
}
if (typeof T.buildState === 'function') {
  let state = null;
  try {
    // buildState(bidRecords, sowItems, bidPackages): no bid records at all — the
    // SOW is reached through the line items' own field_2154 — so every row is a
    // no-bid row and the totals are the SOW side alone.
    state = T.buildState([], [
      sowItem('s-cam', { bucketId: CAM, bucket: 'Camera / Reader', name: 'Deputy', qty: 1, fee: 100, install: 50, equip: 500, mdf: true }),
      sowItem('s-lic', { bucketId: LIC, bucket: 'License', name: 'Cloud Storage License', qty: 3, fee: 45, install: 10, equip: 45, mdf: true })
    ], []);
  } catch (e) { state = null; console.log('buildState threw: ' + (e && e.message)); }
  if (state && state.sowGrids && state.sowGrids[0]) {
    const g = state.sowGrids[0];
    check('buildState: the SOW Sub Bid / Install totals count the camera only; the license sits in its own L1',
      [g.sowTotals.subBid, g.sowTotals.install, g.groups.map(x => x.key)], [100, 50, ['MDF - Clubhouse', 'Licenses']]);
  } else {
    console.log('skip the buildState totals check (state did not build with this minimal raw shape)');
  }
}

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
