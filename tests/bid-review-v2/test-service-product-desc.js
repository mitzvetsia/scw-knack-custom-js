// jsdom smoke test: productized services on the reconcile-bids grid (2026-10-23). A Services-bucket
// row whose line item carries a product shows the product's catalog description (the stored copy,
// field_1962, read off view_3921 through sowItemFieldKeys.productDesc) as a quiet line under the
// product name in the SOW cell — "Remote Guarding Custom (40 cameras)" says little; its description
// says what the client gets. Services only (an equipment row's description stays off), only when
// populated, and the labor description keeps its own line below the numbers.
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
try { load('sub-bid-diff/config.js'); load('sub-bid-diff/render.js'); } catch (e) { /* optional */ }
for (const f of ['config.js', 'transform.js', 'basis-filter.js', 'card.js']) load('bid-review-v2/' + f);
const ns = window.SCW.bidReviewV2;
const SVC = '6977caa7f246edf67b52cbcd', CAM = '6481e5ba38f283002898113c';
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
check('the SOW item field map names the stored product description', window.SCW.bidReview.CONFIG.sowItemFieldKeys.productDesc, 'field_1962');
function row(o) {
  return Object.assign({ parentId: '', mdfIdf: '', mdfIdfId: '', proposalBucket: 'Other Services', proposalBucketId: SVC,
    cellsByPackage: Object.create(null), requireSubBidSow: true, noBid: true }, o);
}
const DESC = '<p>24/7 remote video monitoring of up to 40 cameras with live operator response, audio talk-down and dispatch.</p>';
const svc = row({ id: 's1', sowItem: 's1', productName: 'Remote Guarding Custom (40 cameras) - RG-SB-LT-40',
  sowItemData: { productName: 'Remote Guarding Custom (40 cameras) - RG-SB-LT-40', qty: 1, fee: 0, installFee: 0, equipmentTotal: 6000,
    laborDesc: 'Connect the box to the same network as the NVR.', productDesc: DESC } });
const svcPlain = row({ id: 's2', sowItem: 's2', productName: '',
  sowItemData: { productName: '', qty: 1, fee: 250, installFee: 0, equipmentTotal: 0, laborDesc: 'Permit filing with the city.', productDesc: '' } });
const svcByLabel = row({ id: 's3', sowItem: 's3', proposalBucketId: '', proposalBucket: 'Services', productName: 'Onboarding Fee',
  sowItemData: { productName: 'Onboarding Fee', qty: 1, fee: 150, installFee: 0, equipmentTotal: 500, laborDesc: 'Tech plugs in the hardware.', productDesc: 'Remote onboarding and training.' } });
const cam = row({ id: 'c1', sowItem: 'c1', proposalBucket: 'Camera / Reader', proposalBucketId: CAM, mdfIdf: 'MDF', mdfIdfId: 'm1', displayLabel: 'E-001', productName: 'Deputy 8.0 v5',
  sowItemData: { productName: 'Deputy 8.0 v5', qty: 1, fee: 100, installFee: 50, equipmentTotal: 500, laborDesc: '', productDesc: '4MP turret camera, 2.8mm lens.' } });

function sowCell(r) { try { return ns.card.buildSowCell(r, false, 'sow1'); } catch (e) { console.log('build error', e && e.stack); return null; } }
const txt = (el, sel) => { const n = el && el.querySelector(sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
const c1 = sowCell(svc);
check('service row with a product: the catalog description renders under the product name',
  [txt(c1, '.scw-bid-review-v2__sow-product'), txt(c1, '.scw-bid-review-v2__sow-proddesc')],
  ['Remote Guarding Custom (40 cameras) - RG-SB-LT-40', '24/7 remote video monitoring of up to 40 cameras with live operator response, audio talk-down and dispatch.']);
check('…ordered name → description → numbers → labor description (the labor line keeps its own place)',
  (() => { const kids = [...c1.children].map(k => k.className.split(' ')[0]);
           const i = n => kids.indexOf('scw-bid-review-v2__' + n);
           return [i('sow-product') < i('sow-proddesc'), i('sow-proddesc') < i('sow-numbers'), i('sow-numbers') < i('sow-desc'),
                   txt(c1, '.scw-bid-review-v2__sow-desc')]; })(),
  [true, true, true, 'Connect the box to the same network as the NVR.']);
check('…the description is rendered as rich text, with the plain text on the hover title',
  [!!c1.querySelector('.scw-bid-review-v2__sow-proddesc p'), c1.querySelector('.scw-bid-review-v2__sow-proddesc').getAttribute('title').slice(0, 20)],
  [true, '24/7 remote video mo']);
check('a description-only service: no product, no description line, its labor text as before',
  [txt(sowCell(svcPlain), '.scw-bid-review-v2__sow-proddesc'), txt(sowCell(svcPlain), '.scw-bid-review-v2__sow-desc')], [null, 'Permit filing with the city.']);
check('a service known only by its bucket LABEL shows the description too', txt(sowCell(svcByLabel), '.scw-bid-review-v2__sow-proddesc'), 'Remote onboarding and training.');
check('an equipment row never shows a product description here (services only)', txt(sowCell(cam), '.scw-bid-review-v2__sow-proddesc'), null);
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
