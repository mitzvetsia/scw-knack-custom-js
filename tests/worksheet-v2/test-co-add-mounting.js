// jsdom smoke test: worksheet-v2/co-add-item-form.js — the "Mounting Hardware" item type on the
// change-order add form: a parent-device picker (this CO's lines + the project's installed items),
// a product list narrowed to hardware the catalog says fits the parent, the parent's MDF/IDF
// prefilled, and the parent riding the webhook payload.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const CO = '69c4310cf4b1b33df77fa499';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#build-co/change-order/' + CO });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.Event = window.Event;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

const B_CAMERA = '6481e5ba38f283002898113c', B_NETWORKING = '647953bb54b4e1002931ed97', B_SERVICE = '6977caa7f246edf67b52cbcd', B_MOUNTING = '594a94536877675816984cb9';
window.Knack = {
  router: { current_scene_key: 'scene_1362' },
  getUserAttributes() { return { id: 'u1', name: { first: 'Micah', last: 'S' }, email: 'x@getscw.com' }; },
  views: { view_4084: { model: { data: { models: [
    { attributes: { id: 'm1', field_1642_raw: 'HEADEND: : Main Office' } },
    { attributes: { id: 'm2', field_1642_raw: 'IDF: 02: Intake Building' } }
  ] } } } }
};
global.Knack = window.Knack;
window.SCW = {
  CONFIG: { MAKE_CO_ADD_ITEMS_WEBHOOK: 'https://hook.test/co-add' }, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  productMap: {
    camP: { name: 'Deputy 8.0 v5', buckets: [B_CAMERA] },
    nvrP: { name: 'Admiral Pro 32 v5', buckets: [B_NETWORKING] },
    brA:  { name: 'Wall Mount Bracket for The Deputy', buckets: [B_MOUNTING] },
    brB:  { name: 'Pole Adapter', buckets: [B_MOUNTING] },
    brC:  { name: 'Electrical Box Mount', buckets: [B_MOUNTING] }
  },
  mountingBoxProducts: [
    { id: 'brA', name: 'Wall Mount Bracket for The Deputy', compatibleProducts: ['camP'] },
    { id: 'brB', name: 'Pole Adapter', compatibleProducts: ['otherP'] },
    { id: 'brC', name: 'Electrical Box Mount', compatibleProducts: [], compatibleProductsAlt: ['camP'] }
  ]
};
global.SCW = window.SCW;
const posts = [];
const fetchStub = (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); return Promise.resolve({ ok: true, text: () => Promise.resolve('{"success":true}') }); };
global.fetch = window.fetch = fetchStub;

for (const f of ['config.js', 'card.js', 'co-add-item-form.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', 'fetch',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW, fetchStub);
}
const wv2 = window.SCW.worksheetV2;
// CO lines (view_4079) + installed items (view_4086).
const coLines = [
  { id: 'c1', field_1950: 'E-05', field_1949_raw: [{ id: 'camP', identifier: 'Deputy 8.0 v5' }], field_2219_raw: [{ id: B_CAMERA }], field_1946_raw: [{ id: 'm1' }] },
  { id: 'c2', field_1950: '', field_1949_raw: [{ id: 'svcP', identifier: 'Programming' }], field_2219_raw: [{ id: B_SERVICE }] },
  { id: 'c3', field_1950: '', field_1949_raw: [{ id: 'brA', identifier: 'Wall Mount Bracket for The Deputy' }], field_2219_raw: [{ id: B_MOUNTING }], field_2464_raw: [{ id: 'c1' }] }
];
const installs = [
  { id: 'i1', field_2802: 'E-04', field_2790: 'Deputy 8.0 v5', field_2846_raw: [{ id: 'camP' }], field_2819_raw: [{ id: 's9' }], field_2818_raw: [{ id: 'm2' }], field_2822_raw: [{ id: B_CAMERA }] },
  { id: 'i2', field_2802: '', field_2790: 'Wall Mount Bracket for The Deputy', field_2846_raw: [{ id: 'brA' }], field_2853_raw: [{ id: 'i1' }], field_2822_raw: [{ id: B_MOUNTING }] },
  { id: 'i3', field_2802: 'E-01', field_2790: 'Deputy 8.0 v5', field_2846_raw: [{ id: 'camP' }], field_2967_raw: [{ id: 'co9' }], field_2822_raw: [{ id: B_CAMERA }] },
  { id: 'i4', field_2802: '', field_2801: 'Admiral Pro 32 v5 Main Office', field_2790: 'Admiral Pro 32 v5', field_2846_raw: [{ id: 'nvrP' }], field_2818_raw: [{ id: 'm1' }], field_2822_raw: [{ id: B_NETWORKING }] }
];
const refetches = [];
wv2.data = { readRecords: (vk) => (vk === 'view_4086' ? installs : (vk === 'view_4079' ? coLines : [])), refetchAndNotify: (k) => refetches.push(k) };

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const host = document.createElement('div'); document.body.appendChild(host);
const q = (sel) => host.querySelector(sel);
const combos = () => Array.from(host.querySelectorAll('.scw-coadd__combo'));
const optsOf = (combo) => Array.from(combo.querySelectorAll('.scw-coadd__opt')).map(o => o.getAttribute('data-id'));
const pick = (combo, id) => combo.querySelector('.scw-coadd__opt[data-id="' + id + '"]').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
const labelsIn = () => Array.from(host.querySelectorAll('.scw-coadd__lbl')).map(l => l.textContent);

(async () => {
  wv2.coAddForm.open({ host, viewKey: 'view_4079' });
  check('the item-type chips carry Mounting Hardware after Other Equipment',
    Array.from(host.querySelectorAll('[data-bucket]')).map(c => c.textContent),
    ['Camera or Reader', 'Networking or Headend', 'Other Equipment', 'Mounting Hardware', 'Other Services', 'Assumptions', 'Materials', 'License']);
  check('parent candidates: this CO\'s devices first, then installed devices — never services, accessories or removed items',
    wv2.coAddForm.parentCandidates('view_4079').map(c => [c.id, c.name, c.sowLineId, c.installId, c.productId, c.mdfId]),
    [['co:c1', 'E-05 · Deputy 8.0 v5 — on this change order', 'c1', '', 'camP', 'm1'],
     ['inst:i4', 'Admiral Pro 32 v5 Main Office · Admiral Pro 32 v5 — installed', '', 'i4', 'nvrP', 'm1'],
     ['inst:i1', 'E-04 · Deputy 8.0 v5 — installed', 's9', 'i1', 'camP', 'm2']]);
  q('[data-bucket="' + B_MOUNTING + '"]').click();
  check('Mounting Hardware fields: mounts-on, hardware, MDF/IDF (optional), quantity',
    labelsIn(), ['Item type', 'Mounts on (optional)', 'Mounting hardware', 'MDF / IDF (optional) — one item created per location', 'Quantity']);
  check('with no parent the hardware list is the whole bucket', optsOf(combos()[1]), ['brC', 'brB', 'brA']);
  pick(combos()[0], 'inst:i1');
  check('picking an installed camera narrows the list to hardware the catalog says fits it (either compatibility list) and says so',
    [optsOf(combos()[1]), q('[data-parent-note]').textContent],
    [['brC', 'brA'], 'Showing the 2 items the catalog lists as fitting E-04 · Deputy 8.0 v5.']);
  check('…and ticks the parent\'s MDF/IDF', Array.from(host.querySelectorAll('.scw-coadd__checks input:checked')).map(i => i.value), ['m2']);
  pick(combos()[1], 'brA');
  q('[data-f="qty"]').value = '2';
  q('[data-act="submit"]').click();
  await new Promise(r => setTimeout(r, 10));
  const p = posts[0] && posts[0].body;
  check('the payload carries the bucket, the hardware, the parent (SOW line + install record + product) and the prefilled location',
    p && [p.coSowId, p.bucketId, p.bucketName, p.productIds, p.mdfIds, p.qty, p.parentLineItemId, p.parentInstallItemId, p.parentProductId, p.parentLabel, p.parentSource, p.accessoryIds],
    [CO, B_MOUNTING, 'Mounting Hardware', ['brA'], ['m2'], '2', 's9', 'i1', 'camP', 'E-04 · Deputy 8.0 v5', 'install', []]);

  // A device on this CO as the parent; a parent the catalog knows nothing about keeps the whole list.
  wv2.coAddForm.open({ host, viewKey: 'view_4079' });
  q('[data-bucket="' + B_MOUNTING + '"]').click();
  pick(combos()[0], 'inst:i4');
  check('a parent nothing fits keeps the whole bucket, with a note', [optsOf(combos()[1]), /Nothing in the catalog lists Admiral Pro 32 v5 Main Office/.test(q('[data-parent-note]').textContent)], [['brC', 'brB', 'brA'], true]);
  pick(combos()[0], 'co:c1');
  pick(combos()[1], 'brA');
  q('[data-act="submit"]').click();
  await new Promise(r => setTimeout(r, 10));
  const p2 = posts[1] && posts[1].body;
  check('a parent on this change order ships its line item id and no install record (the first parent\'s MDF/IDF stays ticked)', p2 && [p2.parentLineItemId, p2.parentInstallItemId, p2.parentSource, p2.mdfIds], ['c1', '', 'co', ['m1']]);

  // Other buckets are untouched: no parent field, no parent in the payload.
  wv2.coAddForm.open({ host, viewKey: 'view_4079' });
  q('[data-bucket="' + B_CAMERA + '"]').click();
  check('the camera form has no mounts-on field', labelsIn().indexOf('Mounts on (optional)'), -1);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL uncaught: ' + (e && e.stack || e)); process.exit(1); });
