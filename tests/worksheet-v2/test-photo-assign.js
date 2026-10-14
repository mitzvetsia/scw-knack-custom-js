// jsdom smoke test: worksheet-v2/photo-assign.js — the v2 "Add Photos" modal (preview, email-gated).
// Files → Assign → Send: every photo is aimed at one device (auto-matched from its file name) and at an
// open slot (fill: view-based PUT of the Knack asset id onto the existing DOC_photos record) or a new
// photo (manifest to Make). Copy mode sends one asset to several devices with one slot rule.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PID = '69c4310cf4b1b33df77fa499';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/' + PID + '/deploy/' + PID });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

let email = 'Micah.Shearer@getscw.com';
window.Knack = {
  router: { current_scene_key: 'scene_1311' },
  getUserAttributes() { return email ? { id: 'u1', name: { first: 'Micah', last: 'S' }, email } : null; },
  getUserToken() { return 'tok'; },
  views: {}
};
global.Knack = window.Knack;
window.SCW = { CONFIG: { MAKE_PHOTO_ASSIGN_WEBHOOK: 'PLACEHOLDER' }, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;
const posts = [];
const fetchStub = (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); return Promise.resolve({ ok: true, text: () => Promise.resolve('{"success":true}') }); };
global.fetch = window.fetch = fetchStub;

for (const f of ['config.js', 'card.js', 'photo-assign.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', 'fetch',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW, fetchStub);
}
const ns = window.SCW.worksheetV2;
const pa = ns.photoAssign;
const V = 'view_4093';
const CAM = ns.card.CAM_READER_BUCKET, NET = ns.card.NETWORKING_BUCKET, SVC = ns.card.SERVICES_BUCKET;
const MDF1 = '6abd0251e5d0b1ca628ebb94', MDF2 = '6abd0286c3e527b8ea5499ef';
const rec = (id, label, prod, bucket, mdf, sort, extra) => Object.assign({
  id, field_2802: label, field_2790: prod, field_2822_raw: [{ id: bucket, identifier: 'b' }],
  field_2818_raw: [{ id: mdf, identifier: mdf === MDF1 ? 'HEADEND: closet' : 'IDF: 01: shop' }], field_2218: sort
}, extra || {});
const records = [
  rec('r1', 'E-001', 'Vista Dome 4MP', CAM, MDF1, 2),
  rec('r2', 'E-002', 'Vista Dome 4MP', CAM, MDF1, 2),
  rec('r3', 'E-010', 'Bullet 8MP', CAM, MDF2, 2),
  rec('r4', 'RA-E-001', 'Reader', CAM, MDF2, 2),
  rec('r5', '', 'Imperial NVR', NET, MDF1, 1),
  rec('r6', '', 'Programming service', SVC, MDF1, 3),
  rec('r7', '', 'Wall Mount Bracket', CAM, MDF1, 2, { field_2853_raw: [{ id: 'r1', identifier: 'E-001' }] })
];
const refetches = [];
ns.data = { readRecords: () => records, refetchAndNotify: (k) => refetches.push(k), subscribeRendered() {} };
const photosByRecord = {
  r1: [{ id: 'p1', type: 'Proposed Mounting Location', required: true, imgUrl: '', qaHistory: 'older line' },
       { id: 'p2', type: 'Camera View', required: true, imgUrl: '' }],
  r2: [{ id: 'p3', type: 'Camera View', required: true, imgUrl: '' }],
  r3: [{ id: 'p4', type: 'Proposed Mounting Location', required: true, imgUrl: 'https://x/p4.jpg' }]
};
ns.photos = { extractPhotoRecords: (vk, rid) => (photosByRecord[rid] || []).map(p => Object.assign({}, p)) };
let lastPicker = null;
ns.picker = {
  open(opts) { lastPicker = opts; },
  canonicalItemSort(itemLabel) {
    return (a, b) => {
      const sa = a.field_2218 == null ? Infinity : Number(a.field_2218), sb = b.field_2218 == null ? Infinity : Number(b.field_2218);
      if (sa !== sb) return sa - sb;
      const c = String(itemLabel(a)).localeCompare(String(itemLabel(b)), undefined, { numeric: true, sensitivity: 'base' });
      return c || String(a.id).localeCompare(String(b.id));
    };
  }
};
const uploads = [], puts = [];
let assetN = 0;
window.SCW.photoEditPanel = {
  SAVE_VIEWS: { view_4093: 'view_3937' },
  util: {
    downscale: f => Promise.resolve(f),
    uploadImage: (blob, name) => { uploads.push(name); return Promise.resolve('asset-' + (++assetN)); },
    putRecord: (view, id, body) => { puts.push([view, id, body]); return Promise.resolve({}); },
    collectTypeOptions: () => [{ id: 't-cv', label: 'Camera View' }, { id: 't-pml', label: 'Proposed Mounting Location' }]
  }
};
window.SCW.bulkUpload = {
  prepareFile: f => Promise.resolve({ blob: f, converted: false }),
  config: { VIEWS: [{ menuViewId: 'view_4093_deploy', linkField: 'deploymentID', hashPattern: /(?:project-dashboard|deployment-dashboard)\/([a-f0-9]{24})/ }] }
};

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const file = (name) => new window.File(['abc'], name, { type: 'image/jpeg' });
function toolbarFixture() {
  document.body.innerHTML = '';
  const c = document.createElement('div'); c.id = 'scw-ws-v2-' + V; c.className = 'scw-ws-v2';
  c.innerHTML = '<div class="scw-ws-v2-toolbar"><div><button type="button" class="scw-ws-v2-toolbar-btn scw-ws-v2-toolbar-btn--cta" data-scw-ws-v2-action="add-mdf">+ Add MDF/IDF</button>' +
    '<button type="button" class="scw-ws-v2-toolbar-btn scw-ws-v2-toolbar-btn--cta" data-scw-ws-v2-action="add-photos">+ Add Photos</button></div></div><div class="scw-ws-v2-body"></div>';
  document.body.appendChild(c);
  return c;
}
const modal = () => document.getElementById('scw-photo-assign');
const rows = () => pa.state().rows;

(async () => {
  // ── gate + button ──
  check('allowed: the listed email, case-insensitive', pa.isAllowed(), true);
  let c = toolbarFixture();
  check('inject puts the amber v2 button right after "+ Add Photos", once',
    [pa.inject(V), pa.inject(V), Array.from(c.querySelectorAll('.scw-ws-v2-toolbar button')).map(b => b.textContent),
     c.querySelector('[data-scw-pa-open]').className.includes('scw-ws-v2-toolbar-btn--preview'), c.querySelector('[data-scw-pa-open]').getAttribute('data-scw-pa-open')],
    [true, true, ['+ Add MDF/IDF', '+ Add Photos', '+ Add Photos (v2)'], true, V]);
  email = 'someone@getscw.com';
  c = toolbarFixture();
  check('another user: not allowed, no button', [pa.isAllowed(), pa.inject(V), c.querySelectorAll('[data-scw-pa-open]').length], [false, false, 0]);
  email = 'Micah.Shearer@getscw.com';

  // ── candidates + matching ──
  const cands = pa.candidatesFor(V);
  check('candidates: hardware only (no service, no accessory), canonical order, drop · product labels',
    cands.map(x => x.id + '|' + x.label),
    ['r5|Imperial NVR', 'r1|E-001 · Vista Dome 4MP', 'r2|E-002 · Vista Dome 4MP', 'r3|E-010 · Bullet 8MP', 'r4|RA-E-001 · Reader']);
  check('tokens: letters and zero-stripped digit runs', [pa.tokensOf('E-001'), pa.tokensOf('ra-e-02'), pa.tokensOf('IMG_0042 copy')], [['E', '1'], ['RA', 'E', '2'], ['IMG', '42', 'COPY']]);
  const m = (n) => { const r = pa.matchFile(n, cands); return r ? r.id : null; };
  check('file-name match: E-001 / e1 / E-01 / E010 / RA-E-001 (longest wins) / none / ambiguous / bare number',
    [m('E-001 front.jpg'), m('e1.jpg'), m('E-01.jpg'), m('E010.JPG'), m('RA-E-001.jpg'), m('IMG_1234.jpg'), m('E-1 and E-2.jpg'), m('001.jpg')],
    ['r1', 'r1', 'r1', 'r3', 'r4', null, null, null]);
  check('route: install line items under a deployment', [pa.targetKind(), pa.resolveScope(V)], ['installLineItemID', { linkField: 'deploymentID', recordId: PID }]);
  check('open slots: no-image records only, in the strip\'s own order', pa.openSlotsFor(V, 'r1').map(s => s.id + ':' + s.type), ['p1:Proposed Mounting Location', 'p2:Camera View']);
  check('a filled slot is not open', pa.openSlotsFor(V, 'r3'), []);

  // ── assign mode ──
  toolbarFixture();
  pa.open(V);
  check('modal opens in assign mode with the device count', [!!modal(), pa.state().mode, modal().querySelector('.scw-pa-sub').textContent], [true, 'assign', 'Install Line Items · 5 devices on this page']);
  await pa.addFiles([file('E-001 front.jpg'), file('e2.jpg'), file('IMG_9.jpg')]);
  check('queued rows auto-aim at the device their name says; the rest wait',
    rows().map(r => [r.filename, r.targetId, r.matched, r.slot]),
    [['E-001 front.jpg', 'r1', true, 'new'], ['e2.jpg', 'r2', true, 'new'], ['IMG_9.jpg', '', false, 'new']]);
  check('DOM: three rows, matched badge, empty target styled, Send disabled until every photo has a device',
    [modal().querySelectorAll('.scw-pa-row').length, modal().querySelectorAll('.scw-pa-target .m').length, modal().querySelectorAll('.scw-pa-target.is-empty').length,
     modal().querySelector('[data-scw-pa-send]').disabled, modal().querySelector('.scw-pa-summary').textContent],
    [3, 2, 1, true, '3 photos · 2 aimed · 1 need a device']);
  const sel0 = modal().querySelector('[data-scw-pa-slot="' + rows()[0].id + '"]');
  check('slot menu: new photo, this device\'s open slots, then a typed new photo',
    Array.from(sel0.options).map(o => o.value), ['new', 'slot:p1', 'slot:p2', 'type:t-cv', 'type:t-pml']);
  // Third row: pick the device through the (stubbed) canonical picker.
  modal().querySelector('[data-scw-pa-target="' + rows()[2].id + '"]').click();
  check('target button opens the record picker in pick-only single mode over the hardware',
    [lastPicker.pickOnly, lastPicker.multi, lastPicker.candidates.length, lastPicker.allowClear, lastPicker.label],
    [true, false, 5, false, 'Which device is "IMG_9.jpg" a photo of?']);
  lastPicker.onChoose(['r3']);
  pa.setSlot(rows()[0].id, 'slot:p1');
  pa.setSlot(rows()[1].id, 'type:t-cv');
  check('all aimed → Send enabled', [rows()[2].targetId, modal().querySelector('[data-scw-pa-send]').disabled], ['r3', false]);
  let res = await pa.send();
  check('no Make webhook: creates are refused up front, nothing uploads', [res.errors.length, /not configured/.test(res.errors[0]), uploads.length, modal().querySelectorAll('.scw-pa-errors div').length], [1, true, 0, 1]);
  window.SCW.CONFIG.MAKE_PHOTO_ASSIGN_WEBHOOK = 'https://hook.test/assign';
  res = await pa.send();
  check('send: three uploads, one slot filled, two manifests', [res, uploads], [{ filled: 1, created: 2, failed: 0, uploaded: 3 }, ['E-001 front.jpg', 'e2.jpg', 'IMG_9.jpg']]);
  check('fill = the asset id PUT onto the slot record through the scene save view, then a best-effort completion + history stamp',
    [puts[0], puts[1][0], puts[1][1], puts[1][2].field_2447, /UPLOADED PHOTO: bulk assign \(E-001 front\.jpg\)<br>older line$/.test(puts[1][2].field_2865), puts.length],
    [['view_3937', 'p1', { field_771: 'asset-1' }], 'view_3937', 'p1', 'Yes', true, 2]);
  check('manifests: no bytes, target kind + record, type when chosen, parent scope, the same contract keys',
    posts.map(p => [p.url, p.body.uploadKind, p.body.asset.id, p.body.target.kind, p.body.target.recordId, p.body.photoType, p.body.scope, p.body.slot, p.body.sourceViewId, p.body.triggeredBy.email, Object.keys(p.body).sort()]),
    [['https://hook.test/assign', 'photo_assign', 'asset-2', 'installLineItemID', 'r2', { id: 't-cv', label: 'Camera View' }, { linkField: 'deploymentID', recordId: PID }, null, V, 'Micah.Shearer@getscw.com',
      ['asset', 'batchId', 'photoType', 'required', 'scope', 'slot', 'sourceViewId', 'target', 'triggeredBy', 'uploadId', 'uploadKind']],
     ['https://hook.test/assign', 'photo_assign', 'asset-3', 'installLineItemID', 'r3', null, { linkField: 'deploymentID', recordId: PID }, null, V, 'Micah.Shearer@getscw.com',
      ['asset', 'batchId', 'photoType', 'required', 'scope', 'slot', 'sourceViewId', 'target', 'triggeredBy', 'uploadId', 'uploadKind']]]);
  check('rows report what happened and the worksheet refetches', [rows().map(r => [r.status, r.result]), refetches, pa.state().done],
    [[['done', 'Filled Proposed Mounting Location on E-001'], ['done', 'New "Camera View" photo on E-002 (sent to Make)'], ['done', 'New photo on E-010 (sent to Make)']], [V], '1 slot filled · 2 new photos sent to Make']);
  check('after a send the button reads Sent and stays off', [modal().querySelector('[data-scw-pa-send]').textContent, modal().querySelector('[data-scw-pa-send]').disabled], ['Sent', true]);

  // ── helpers ──
  pa.close(); pa.open(V);
  await pa.addFiles([file('b.jpg'), file('a.jpg')]);
  pa.pairInOrder(['r3', 'r1']);
  check('assign in order: files in name order ↔ picked devices in canonical order', rows().map(r => [r.filename, r.targetId]), [['b.jpg', 'r3'], ['a.jpg', 'r1']]);
  pa.applyToAll('firstreq');
  check('for all rows: first open required slot, else a new photo', rows().map(r => r.slot), ['new', 'slot:p1']);
  pa.setMode('copy');
  check('copy mode needs exactly one queued photo', pa.state().mode, 'assign');

  // ── copy mode ──
  uploads.length = 0; puts.length = 0; posts.length = 0; refetches.length = 0;
  pa.close(); pa.open(V);
  await pa.addFiles([file('wide shot.jpg')]);
  pa.setMode('copy');
  modal().querySelector('[data-scw-pa-copy-pick]').click();
  check('copy mode: the picker opens multi-select', [pa.state().mode, lastPicker.multi, lastPicker.pickOnly], ['copy', true, true]);
  lastPicker.onChoose(['r3', 'r1', 'r2']);
  pa.setCopyRule('fill:Proposed Mounting Location');
  check('rule menu offers the open slot types and the catalog types once each',
    Array.from(modal().querySelector('[data-scw-pa-copy-rule]').options).map(o => o.value), ['new', 'fill:Camera View', 'fill:Proposed Mounting Location']);
  const plan = pa.buildPlan();
  check('plan: fill where that slot is open, create a typed photo where it is missing or already filled',
    plan.ops.map(o => [o.kind, o.targetId, o.slotId || o.typeId]), [['fill', 'r1', 'p1'], ['create', 'r2', 't-pml'], ['create', 'r3', 't-pml']]);   // picked devices are kept in canonical worksheet order
  res = await pa.send();
  check('copy send: ONE upload, one fill, two manifests sharing the asset', [res, uploads, puts[0], posts.map(p => [p.body.asset.id, p.body.target.recordId, p.body.photoType.label])],
    [{ filled: 1, created: 2, failed: 0, uploaded: 1 }, ['wide shot.jpg'], ['view_3937', 'p1', { field_771: 'asset-4' }], [['asset-4', 'r2', 'Proposed Mounting Location'], ['asset-4', 'r3', 'Proposed Mounting Location']]]);
  check('copy results ride the device chips', Array.from(modal().querySelectorAll('.scw-pa-chip')).map(ch => ch.className.includes('is-done')), [true, true, true]);
  check('copy row summary', [rows()[0].status, rows()[0].result], ['done', '3 of 3 devices written']);

  // ── upload failure never writes ──
  pa.close(); pa.open(V);
  window.SCW.photoEditPanel.util.uploadImage = () => Promise.reject(new Error('503'));
  puts.length = 0; posts.length = 0;
  await pa.addFiles([file('E-001.jpg')]);
  pa.setSlot(rows()[0].id, 'slot:p1');
  res = await pa.send();
  check('a failed upload fails its row and skips its writes', [res, rows()[0].status, /Upload failed: 503/.test(rows()[0].error), puts.length, posts.length], [{ filled: 0, created: 0, failed: 1, uploaded: 0 }, 'failed', true, 0, 0]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL uncaught: ' + (e && e.stack || e)); process.exit(1); });
