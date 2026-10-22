// jsdom smoke test: worksheet-v2/toolbar.js add-accessory modal, multi-select (2026-10-22, ClickUp
// 86bb8bhu2). The accessory list is CHECKBOXES grouped by bucket (it was a single <select>); Add
// posts ONE webhook call per ticked product through a 2-wide queue with retry + backoff; a product
// that lands is un-ticked so a second Add re-sends only the failures; a CORS-opaque status 0 counts
// as delivered; a timeout is not retried; long lists get a filter box.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const P = '69f0d4b567a35332e743cc27', S = '6a0a0a0a0a0a0a0a0a0a0a0a';
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1085"></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/' + P + '/build-sow/' + S });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
global.Event = window.Event; global.CustomEvent = window.CustomEvent; global.MutationObserver = window.MutationObserver;
const ajax = [];
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; jq.ajax = (o) => { ajax.push(o); };
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const CAM_B = '6481e5ba38f283002898113c';
const rec = (id, label) => ({ attributes: { id, field_1950: label, field_1949: 'Deputy 8.0 v5',
  field_1949_raw: [{ id: 'camP', identifier: 'Deputy 8.0 v5' }], field_2219_raw: [{ id: CAM_B, identifier: 'Cameras' }],
  field_2154_raw: [{ id: S, identifier: '1589' }] } });
window.Knack = {
  router: { current_scene_key: 'scene_1085' },
  getUserAttributes() { return { id: 'u1', email: 'x@getscw.com' }; },
  views: { view_3962: { model: { data: { models: [rec('r1', 'C-001'), rec('r2', 'C-002')] } } } }
};
global.Knack = window.Knack;
const catalog = [
  { id: 'brA', name: 'Wall Mount Bracket', compatibleProducts: ['camP'], bucketId: 'bM', bucketName: 'Mounting Hardware' },
  { id: 'brB', name: 'Pole Adapter', compatibleProducts: ['camP'], bucketId: 'bM', bucketName: 'Mounting Hardware' },
  { id: 'brC', name: 'Junction Box', compatibleProductsAlt: ['camP'], bucketId: 'bO', bucketName: 'Other Equipment' },
  { id: 'brX', name: 'Incompatible Thing', compatibleProducts: ['otherP'], bucketId: 'bM', bucketName: 'Mounting Hardware' }
];
window.SCW = { CONFIG: { MAKE_BULK_ADD_MOUNTING_BOX_WEBHOOK: 'https://hook.test/acc' }, worksheetV2: {},
  mountingBoxProducts: catalog, debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'toolbar.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
const refetches = [];
ns.data = { refetchAndNotify: (k) => refetches.push(k) };
ns.toolbar._accQueue.gapMs = 0;
Object.assign(ns.toolbar._accRetry, { attempts: 3, baseMs: 1, jitterMs: 0 });
Object.assign(ns.toolbar._accRefresh, { firstMs: 5, secondMs: 10 });

// Two selected cards on the worksheet.
document.body.insertAdjacentHTML('beforeend',
  '<div class="scw-ws-v2-card"><input type="checkbox" data-scw-ws-v2-select="r1" checked><span class="scw-ws-v2-cell--label">C-001</span></div>' +
  '<div class="scw-ws-v2-card"><input type="checkbox" data-scw-ws-v2-select="r2" checked><span class="scw-ws-v2-cell--label">C-002</span></div>');

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const overlay = () => document.querySelector('.scw-ws-v2-mb-overlay');
const q = (sel) => overlay().querySelector(sel);
const qa = (sel) => Array.from(overlay().querySelectorAll(sel));
const box = (id) => q('.scw-ws-v2-mb-check[value="' + id + '"]');
const tick = (id) => { box(id).checked = true; box(id).dispatchEvent(new window.Event('change', { bubbles: true })); };
const body = (i) => JSON.parse(ajax[i].data);

(async () => {
  ns.toolbar.openAddAccessories('view_3962');
  check('the modal opens for the 2 selected rows', [!!overlay(), txt(q('.scw-ws-v2-mb-title'))], [true, 'Add accessories to 2 rows']);
  check('compatible products are checkboxes grouped by bucket, alphabetical inside a group; the incompatible one is absent; no filter box on a short list',
    [qa('.scw-ws-v2-mb-check').map(b => b.value), qa('.scw-ws-v2-mb-pgroup').map(txt), !!q('.scw-ws-v2-mb-filter')],
    [['brB', 'brA', 'brC'], ['Mounting Hardware', 'Other Equipment'], false]);
  check('nothing ticked: the count says so and the submit carries the plain label',
    [txt(q('[data-scw-mb-count]')), txt(q('.scw-ws-v2-mb-submit'))], ['none selected', 'Add to 2 rows']);
  q('.scw-ws-v2-mb-submit').click();
  check('Add with nothing ticked posts nothing and asks for a product',
    [ajax.length, txt(q('.scw-ws-v2-mb-status'))], [0, 'Tick at least one accessory product first.']);

  tick('brA'); tick('brB'); tick('brC');
  check('three ticked: count + submit label', [txt(q('[data-scw-mb-count]')), txt(q('.scw-ws-v2-mb-submit'))], ['3 selected', 'Add 3 accessories to 2 rows']);
  q('.scw-ws-v2-mb-submit').click();
  await sleep(10);
  check('two calls in flight (queue width 2), the dialog locked while sending',
    [ajax.length, overlay().classList.contains('is-busy'), q('.scw-ws-v2-mb-submit').disabled, q('.scw-ws-v2-mb-cancel').disabled, box('brA').disabled, txt(q('.scw-ws-v2-mb-status'))],
    [2, true, true, true, true, 'Sending 1 of 3…']);
  check('one payload per product in list order, same parents, the single-product shape the Make scenario already reads',
    [body(0).productId, body(1).productId, body(0).productName, body(0).parentRecordIds, body(0).parentLabels.map(l => l.split(' ')[0]), body(0).sowId, body(0).sourceViewId, body(0).triggeredBy, ajax[0].url, ajax[0].type],
    ['brB', 'brA', 'Pole Adapter', ['r1', 'r2'], ['C-001', 'C-002'], S, 'view_3962', 'u1', 'https://hook.test/acc', 'POST']);

  // brB (call 0) hits a 500 → retried while its slot stays taken; brA (call 1) lands → brC starts.
  ajax[0].error({ status: 500 }, 'error');
  await sleep(10);
  check('a 500 is retried for the SAME product; no new product starts (its slot is still taken)', [ajax.length, body(2).productId], [3, 'brB']);
  ajax[1].success({});
  await sleep(10);
  check('a settled call frees the slot: the third product goes out; the progress line advanced',
    [ajax.length, body(3).productId, txt(q('.scw-ws-v2-mb-status'))], [4, 'brC', 'Sending 2 of 3…']);
  ajax[2].success({});
  await sleep(10);
  ajax[3].error({ status: 403 }, 'error');
  await sleep(10);
  check('a permanent 4xx is not retried; partial failure keeps the dialog, un-ticks what landed, keeps the failure ticked, names it',
    [ajax.length, !!overlay(), overlay().classList.contains('is-busy'), box('brA').checked, box('brB').checked, box('brC').checked, txt(q('[data-scw-mb-count]')), txt(q('.scw-ws-v2-mb-status'))],
    [4, true, false, false, false, true, '1 selected', '2 of 3 sent. Failed: Junction Box (HTTP 403). Add again sends only the failed ones.']);
  await sleep(30);
  check('the worksheet refetched for the two that landed (a first and a later read)', refetches.length, 2);

  // Add again → only brC; a CORS-opaque status 0 counts as delivered → the dialog closes.
  const n = ajax.length;
  q('.scw-ws-v2-mb-submit').click();
  await sleep(10);
  check('Add again sends only the failed product', [ajax.length - n, body(n).productId], [1, 'brC']);
  ajax[n].error({ status: 0 }, 'error');
  await sleep(10);
  check('status 0 (CORS-opaque) counts as delivered: the dialog closes', !!overlay(), false);
  await sleep(30);
  check('one refetch for a single product (no second read)', refetches.length, 3);

  // A timeout is NOT retried (the run may have happened) and reads as "no response".
  ns.toolbar.openAddAccessories('view_3962');
  tick('brA');
  const m = ajax.length;
  q('.scw-ws-v2-mb-submit').click();
  await sleep(10);
  ajax[m].error({ status: 0 }, 'timeout');
  await sleep(10);
  check('timeout: one call, no retry, the product stays ticked, an honest message',
    [ajax.length - m, !!overlay(), txt(q('.scw-ws-v2-mb-status')).indexOf('no response') > 0, box('brA').checked], [1, true, true, true]);
  q('.scw-ws-v2-mb-cancel').click();
  check('Cancel closes an idle dialog', !!overlay(), false);

  // A long list gets a filter box; it hides rows by name and a group whose rows are all hidden.
  const many = [];
  for (let i = 1; i <= 10; i++) {
    many.push({ id: 'p' + i, name: (i % 2 ? 'Pole Adapter ' : 'Wall Bracket ') + i, compatibleProducts: ['camP'],
      bucketId: i <= 5 ? 'bM' : 'bO', bucketName: i <= 5 ? 'Mounting Hardware' : 'Other Equipment' });
  }
  window.SCW.mountingBoxProducts = many;
  ns.toolbar.openAddAccessories('view_3962');
  const filter = q('.scw-ws-v2-mb-filter');
  check('a long list gets a filter box', !!filter, true);
  filter.value = 'POLE'; filter.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('typing filters rows by name, case-insensitive; both groups keep a visible row',
    [qa('.scw-ws-v2-mb-prow:not(.is-hidden)').length, qa('.scw-ws-v2-mb-pgroup.is-hidden').length], [5, 0]);
  filter.value = 'wall bracket 1'; filter.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('a group with nothing left hides its heading',
    [qa('.scw-ws-v2-mb-prow:not(.is-hidden)').map(r => r.querySelector('input').value), qa('.scw-ws-v2-mb-pgroup.is-hidden').map(txt)],
    [['p10'], ['Mounting Hardware']]);
  q('.scw-ws-v2-mb-cancel').click();

  // No bucket metadata anywhere → one flat alphabetical list, no headings.
  window.SCW.mountingBoxProducts = [{ id: 'z', name: 'Zed Mount', compatibleProducts: ['camP'] }, { id: 'a', name: 'Alpha Mount', compatibleProducts: ['camP'] }];
  ns.toolbar.openAddAccessories('view_3962');
  check('no bucket metadata → flat alphabetical list without group headings',
    [qa('.scw-ws-v2-mb-check').map(b => b.value), qa('.scw-ws-v2-mb-pgroup').length], [['a', 'z'], 0]);
  q('.scw-ws-v2-mb-cancel').click();

  console.log(fails ? 'RESULT: ' + fails + ' failed' : 'RESULT: all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
