// jsdom smoke test: productized services on the worksheet (2026-10-23). A Services-bucket line
// that carries a PRODUCT (an onboarding fee: catalog description on the product, a separate labor
// description for the tech) shows that product in the product slot — the same editable product
// cell every other row has — with the fill cell labelled "Labor description", and its detail
// carries the product's stored description (field_1962) read-only when the view serves it. A
// description-only service (no product) renders exactly as before: the "Service" tag and
// "Service description". The survey worksheet row (view_3505) follows the same rule.
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
window.Knack = { views: {}, router: { current_scene_key: 'scene_1085' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
const SVC = '6977caa7f246edf67b52cbcd';
const conn = (id, name) => [{ id, identifier: name }];
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = (el, sel) => { const n = el.querySelector(sel); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
const has = (el, sel) => !!el.querySelector(sel);

// ── SOW line items (build-SOW page view_3962) ─────────────────────────────
const withProduct = { id: 's1', field_1949: 'Onboarding Fee', field_1949_raw: conn('p1', 'Onboarding Fee'), field_1964: 1,
  field_2020: 'Technician plugs in the onboarding hardware.', field_2150: 150, field_2219_raw: conn(SVC, 'Other Services'),
  field_1962: 'Remote onboarding of the system: accounts, users, alerts and a 1-hour training session.' };
const plain = { id: 's2', field_1949: '', field_1949_raw: [], field_1964: 1, field_2020: 'Permit filing with the city.', field_2150: 250,
  field_2219_raw: conn(SVC, 'Other Services'), field_1962: '' };

const c1 = ns.card.buildCard(withProduct, 'view_3962');
check('service WITH a product: the product slot is the editable product cell naming it; no "Service" tag',
  [txt(c1, '.scw-ws-v2-cell--product .scw-ws-v2-product-name'), has(c1, '.scw-ws-v2-cell--product[data-scw-ws-v2-conn="field_1949"]'), has(c1, '.scw-ws-v2-cell--tag')],
  ['Onboarding Fee', true, false]);
check('…the fill cell is the LABOR description (the product carries the service description)',
  [c1.querySelector('.scw-ws-v2-cell--labor-desc textarea') ? c1.querySelector('.scw-ws-v2-cell--labor-desc textarea').getAttribute('aria-label') : null,
   c1.querySelector('.scw-ws-v2-cell--labor-desc textarea') ? c1.querySelector('.scw-ws-v2-cell--labor-desc textarea').value : null],
  ['Labor description', 'Technician plugs in the onboarding hardware.']);
check('…the detail shows the product description read-only (field_1962), ahead of the notes',
  (() => { const labels = [...c1.querySelectorAll('.scw-ws-v2-detail-label')].map(l => l.textContent.trim());
           const i = labels.indexOf('Product description'); return [i >= 0, i < labels.indexOf('SCW Notes'),
           txt(c1, '.scw-ws-v2-detail-field--ro .scw-ws-v2-display')]; })(),
  [true, true, 'Remote onboarding of the system: accounts, users, alerts and a 1-hour training session.']);
check('…it is still a services row (money tracks, qty, SOW slot as before)',
  [has(c1, '.scw-ws-v2-row--services'), has(c1, 'input[data-scw-ws-v2-field="field_1964"]'), has(c1, '[data-scw-ws-v2-field="field_2150"]')], [true, true, true]);

const c2 = ns.card.buildCard(plain, 'view_3962');
check('description-only service: the "Service" tag in the product slot, "Service description" fill, no product cell, no product-description line',
  [txt(c2, '.scw-ws-v2-cell--tag'), has(c2, '.scw-ws-v2-cell--product'),
   c2.querySelector('.scw-ws-v2-cell--labor-desc textarea').getAttribute('aria-label'),
   [...c2.querySelectorAll('.scw-ws-v2-detail-label')].map(l => l.textContent.trim()).indexOf('Product description')],
  ['Service', false, 'Service description', -1]);

// ── sales SOW page (view_3586): the product shows there too; the fill cell is SCW Notes as on every sales row ──
const c3 = ns.card.buildCard(withProduct, 'view_3586');
check('sales page: the product cell names the service product', txt(c3, '.scw-ws-v2-cell--product .scw-ws-v2-product-name'), 'Onboarding Fee');

// ── survey / bid worksheet (view_3505) ────────────────────────────────────
const svWith = { id: 'v1', field_2379: 'Onboarding Fee', field_2627_raw: conn('p1', 'Onboarding Fee'), field_2627: 'Onboarding Fee',
  field_2409: 'Technician plugs in the onboarding hardware.', field_2399: 1, field_2366_raw: conn(SVC, 'Other Services'), field_2366: 'Other Services' };
const svPlain = { id: 'v2', field_2379: '', field_2627_raw: [], field_2627: '', field_2409: 'Permit filing with the city.', field_2399: 1,
  field_2366_raw: conn(SVC, 'Other Services'), field_2366: 'Other Services' };
let v1, v2, svErr = '';
try { v1 = ns.card.buildCard(svWith, 'view_3505'); v2 = ns.card.buildCard(svPlain, 'view_3505'); } catch (e) { svErr = String(e && e.message || e); }
check('survey row builds for both shapes', svErr, '');
if (v1 && v2) {
  check('survey: a service WITH a product shows the product cell (editable survey product picker), no tag',
    [txt(v1, '.scw-ws-v2-cell--product .scw-ws-v2-product-name'), has(v1, '.scw-ws-v2-cell--product[data-scw-ws-v2-conn]'), has(v1, '.scw-ws-v2-cell--tag')],
    ['Onboarding Fee', true, false]);
  check('survey: a description-only service keeps the "Service" tag', [txt(v2, '.scw-ws-v2-cell--tag'), has(v2, '.scw-ws-v2-cell--product')], ['Service', false]);
}
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
