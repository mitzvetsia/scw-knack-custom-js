// jsdom smoke test: worksheet-v2/photo-assign.js — MDF/IDF locations and SOW-scoped page photos as
// rail targets (2026-10-30). "I want to be able to ALSO add photos to one or many MDF/IDFs" and "upload
// a photo to a project AND connect it to a specific SOW (but no specific line items)". The rail gains
// one row per MDF/IDF location on the page (the records' own locations plus the page's MDF grids, so a
// location with no device yet is offered) under an "MDF / IDF locations" group, and one "<page> photo ·
// SOW <n>" row per SOW the page knows under the pinned "not tied to a device" row. Both aim like any
// device (click, drag, chip menu, preset), never match a file name, never join the device groups or the
// family filter. A location's manifest is target.kind 'mdfIdfID' with the location's record id; a SOW
// row's is the 'none' target with links.sowId / sowIds = the chosen SOW.
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
const email = 'Micah.Shearer@getscw.com';
window.Knack = {
  router: { current_scene_key: 'scene_1311' },
  getUserAttributes() { return { id: 'u1', name: { first: 'Micah', last: 'S' }, email }; },
  getUserToken() { return 'tok'; },
  views: {}
};
global.Knack = window.Knack;
window.SCW = { CONFIG: { MAKE_PHOTO_ASSIGN_WEBHOOK: 'https://hook.us1.make.com/pa' }, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;
const posts = [];
const fetchStub = (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"success":true}') }); };
global.fetch = window.fetch = fetchStub;
console.info = () => {};
for (const f of ['config.js', 'card.js', 'photo-assign.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', 'fetch',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW, fetchStub);
}
const ns = window.SCW.worksheetV2;
const pa = ns.photoAssign;
pa.CONFIG.RETRY_BASE_MS = 5; pa.CONFIG.RETRY_MAX_MS = 10; pa.CONFIG.WRITES_GAP_MS = 0;
const V = 'view_4093';
const CAM = ns.card.CAM_READER_BUCKET, NET = ns.card.NETWORKING_BUCKET;
const MDF1 = '6abd0251e5d0b1ca628ebb94', MDF2 = '6abd0286c3e527b8ea5499ef', MDF3 = '6abd0299aaaa27b8ea549900';
const SW1 = '6a0000000000000000000501', SW2 = '6a0000000000000000000502';
const irec = (id, prod, bucket, mdf, sort, extra) => Object.assign({
  id, field_2790: prod, field_2822_raw: [{ id: bucket, identifier: 'b' }],
  field_2818_raw: [{ id: mdf, identifier: mdf === MDF1 ? 'HEADEND: closet' : 'IDF: 01: shop' }], field_2218: sort
}, extra || {});
const installRecords = [
  irec('r1', 'Vista Dome 4MP', CAM, MDF1, 2, { field_2801: 'I-010' }),
  irec('r2', 'Vista Dome 4MP', CAM, MDF1, 2, { field_2802: 'I-011' }),
  irec('r3', 'Bullet 8MP', CAM, MDF2, 2, { field_2802: 'I-012' }),
  irec('r5', 'Imperial NVR 16 Channel 4K', NET, MDF1, 1, { field_2802: 'Imperial NVR 16 Chan Main Office' })
];
const srec = (id, label, mdfId, mdfLabel) => ({ id, field_1950: label, field_1949: 'Cam', field_2219_raw: [{ id: CAM, identifier: 'b' }],
  field_1946_raw: [{ id: mdfId, identifier: mdfLabel }], field_2218: 2, field_2154_raw: [{ id: SW1, identifier: '1589' }] });
const sowRecords = [srec('s1', 'E-001', MDF1, 'HEADEND: closet'), srec('s2', 'E-002', MDF2, 'IDF: 01: shop')];
ns.data = { readRecords: (vk) => (vk === 'view_4093' ? installRecords : sowRecords), refetchAndNotify() {}, subscribeRendered() {} };
ns.photos = { extractPhotoRecords: (vk, rid) => (rid === 'r1' ? [{ id: 'p1', type: 'Camera View', required: true, imgUrl: '' }] : []) };
ns.picker = { open() {}, canonicalItemSort(itemLabel) { return (a, b) => String(itemLabel(a)).localeCompare(String(itemLabel(b)), undefined, { numeric: true }); } };
// The deploy page's MDF manage grid (view_3932, the view's mdfManage / mdfSourceViewKey): a third location with no device yet,
// plus one of the record locations (de-duplicated). The SOW grid view_4161 carries the project's SOWs.
window.Knack.views.view_3932 = { model: { data: { models: [
  { id: MDF3, attributes: { id: MDF3, field_1642: 'IDF: 02: warehouse', field_1943: 'warehouse' } },
  { id: MDF1, attributes: { id: MDF1, field_1642: 'HEADEND: closet' } }
] } } };
window.Knack.views.view_4161 = { model: { data: { models: [
  { id: SW2, attributes: { id: SW2, field_2122: '60486704913-SW1626', field_2126: 'Alternate · fewer cameras' } },
  { id: SW1, attributes: { id: SW1, field_2122: '60486704913-SW1589', field_2126: 'Original scope' } }
] } } };
const uploads = [], puts = [];
let assetN = 0;
window.SCW.photoEditPanel = {
  SAVE_VIEWS: { view_4093: 'view_3937' },
  util: {
    uploadImage: (blob, name) => { uploads.push(name); return Promise.resolve('asset-' + (++assetN)); },
    putRecord: (view, id, body) => { puts.push([view, id, body]); return Promise.resolve({}); },
    collectTypeOptions: () => [{ id: 't-cv', label: 'Camera View' }]
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
const modal = () => document.getElementById('scw-photo-assign');
const rows = () => pa.state().rows;
const tg = (r) => r.targets.map(t => [t.deviceId, t.mode]);
const text = (sel) => { const el = modal().querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };
const railIds = (cls) => Array.from(modal().querySelectorAll('.scw-pa-dev' + (cls || ''))).map(d => d.getAttribute('data-scw-pa-dev-row'));
const rowText = (id) => text('[data-scw-pa-dev-row="' + id + '"] .id') + ' | ' + text('[data-scw-pa-dev-row="' + id + '"] .st');
const LOC = (id) => pa.LOC_PREFIX + id, SOWR = (id) => pa.SOW_SCOPE_PREFIX + id;

(async () => {
  // ── the rows the page offers ──
  check('locations: the records\' own locations plus the MDF grid\'s (a location with no device included, de-duplicated), name order',
    pa.locationsFor(V).map(l => [l.id, l.label, l.mdfId, l.locationOnly]),
    [[LOC(MDF1), 'HEADEND: closet', MDF1, true], [LOC(MDF2), 'IDF: 01: shop', MDF2, true], [LOC(MDF3), 'IDF: 02: warehouse', MDF3, true]]);
  check('SOW rows on the deploy page come from the SOW grid: the deployment photo on each SOW, the SOW name as the sub line, in SOW order',
    pa.sowScopesFor(V).map(x => [x.id, x.label, x.product, x.sowId, x.scopeOnly]),
    [[SOWR(SW1), 'Deployment photo · SOW 1589', 'Original scope', SW1, true], [SOWR(SW2), 'Deployment photo · SOW 1626', 'Alternate · fewer cameras', SW2, true]]);

  // ── the rail ──
  pa.open(V);
  check('the subtitle counts devices and locations', /4 devices · 3 locations/.test(text('.scw-pa-sub')), true);
  check('rail order: the pinned scope row, the two SOW rows under it, the locations group, then the device groups',
    [railIds('.scw-pa-dev--scope'), railIds('.scw-pa-dev--loc'), text('.scw-pa-grp'), railIds().slice(0, 6)],
    [['__scope__', SOWR(SW1), SOWR(SW2)], [LOC(MDF1), LOC(MDF2), LOC(MDF3)], 'MDF / IDF locations', ['__scope__', SOWR(SW1), SOWR(SW2), LOC(MDF1), LOC(MDF2), LOC(MDF3)]]);
  check('a location row reads as a location, a SOW row as a page photo with the SOW name beneath',
    [rowText(LOC(MDF3)), rowText(SOWR(SW1)), text('[data-scw-pa-dev-row="' + SOWR(SW1) + '"] .nm')],
    ['IDF: 02: warehouse | location', 'Deployment photo · SOW 1589 | no device', 'Original scope']);
  check('neither kind is a device: not in the match candidates, not in the rail hits, not grouped under a location',
    [pa.candidatesFor(V).length, pa.railHits().filter(id => id.indexOf('loc:') === 0 || id.indexOf('sow:') === 0).length, pa.state().candidates.length],
    [4, 0, 4]);
  await pa.addFiles([file('HEADEND closet.jpg'), file('i10.png'), file('warehouse wide.jpg')]);
  const closet = rows()[0], i10 = rows()[1], wide = rows()[2];
  check('file names never aim at a location (only the device matched)', [tg(closet), tg(i10), tg(wide)], [[], [['r1', 'slot']], []]);

  // ── aiming ──
  pa.select(closet.id);
  pa.clickDevice(LOC(MDF1));
  pa.clickDevice(SOWR(SW1));
  pa.clickDevice('r2');
  check('one photo aimed at a location, a SOW page photo and a device: three chips, the rail rows ticked',
    [tg(closet), modal().querySelector('[data-scw-pa-dev-row="' + LOC(MDF1) + '"] .box').className, text('[data-scw-pa-dev-row="' + SOWR(SW1) + '"] .st'),
     Array.from(modal().querySelectorAll('[data-scw-pa-chip="' + closet.id + '"] .lbl')).map(e => e.textContent.trim())],
    [[[LOC(MDF1), 'new'], [SOWR(SW1), 'new'], ['r2', 'new']], 'box on', 'this photo → new photo', ['HEADEND: closet', 'Deployment photo · SOW 1589 · Original scope', 'I-011 · Vista Dome 4MP']]);
  pa.clickDevice(LOC(MDF1));
  check('clicking the location again clears it', tg(closet), [[SOWR(SW1), 'new'], ['r2', 'new']]);
  pa.clickDevice(LOC(MDF1));
  pa.select(closet.id, false);
  // Many locations at once: select the wide shot, click two locations.
  pa.select(wide.id);
  pa.clickDevice(LOC(MDF2));
  pa.clickDevice(LOC(MDF3));
  check('a photo can go to several locations', tg(wide), [[LOC(MDF2), 'new'], [LOC(MDF3), 'new']]);
  pa.select(wide.id, false);
  // The rail search keeps locations by name.
  pa.setFinderQuery(i10.id, 'shop');
  check('the rail search filters the locations by name as well as the devices', [railIds('.scw-pa-dev--loc'), pa.railHits()], [[LOC(MDF2)], ['r3']]);
  pa.setFinderQuery(i10.id, '');
  pa.state().finderRow = '';

  // ── send ──
  posts.length = 0; uploads.length = 0;
  const res = await pa.send();
  // Manifests keyed by what they target: the record for a device / location, the label for a page photo.
  const byKey = Object.create(null);
  for (const p of posts) byKey[p.body.target.kind === 'none' ? p.body.target.label : p.body.target.recordId] = p.body;
  check('Send: one upload per photo, a manifest per destination (fills aside)', [res.filled, res.created, res.failed, uploads.length, posts.length], [1, 5, 0, 3, 5]);
  check('a location manifest: target.kind mdfIdfID with the location\'s record id, the page links as for a scope photo',
    [byKey[MDF1].target, byKey[MDF1].links.deploymentId, byKey[MDF1].links.sowId, byKey[MDF1].scope],
    [{ kind: 'mdfIdfID', recordId: MDF1, label: 'HEADEND: closet' }, PID, '', { linkField: 'deploymentID', recordId: PID }]);
  check('a SOW page-photo manifest: the none target, the chosen SOW on links.sowId / sowIds, the deployment + project kept',
    [byKey['Deployment photo · SOW 1589'].target, byKey['Deployment photo · SOW 1589'].links],
    [{ kind: 'none', recordId: '', label: 'Deployment photo · SOW 1589' },
     { page: 'deploy', projectId: PID, deploymentId: PID, sowId: SW1, sowIds: [SW1], surveyId: '', sowLineItemId: '', sowLineItemIds: [] }]);
  check('the device manifest is unchanged', [byKey.r2.target.kind, byKey.r2.target.recordId, byKey.r2.links.sowId], ['installLineItemID', 'r2', '']);
  check('the wide shot went to two locations', [byKey[MDF2].target.recordId, byKey[MDF3].target.recordId, byKey[MDF3].uploadId.split(':').slice(1).join(':')],
    [MDF2, MDF3, 'loc:' + MDF3]);
  check('the tiles say where each copy went', [closet.result, wide.result],
    ['New photo on Deployment photo · SOW 1589 (sent to Make) · New photo on I-011 (sent to Make) · New photo on HEADEND: closet (sent to Make)',
     'New photo on IDF: 01: shop (sent to Make) · New photo on IDF: 02: warehouse (sent to Make)']);
  pa.close();

  // ── a location as the preset (a band's "+ Add" could open the modal on one location) ──
  pa.open(V, { deviceId: LOC(MDF2) });
  check('a location preset: every added photo goes to that location', [pa.state().presetDeviceId, /photos you add here go to IDF: 01: shop/.test(text('.scw-pa-sub'))], [LOC(MDF2), true]);
  await pa.addFiles([file('IMG_0001.jpg')]);
  check('…and does', tg(rows()[0]), [[LOC(MDF2), 'new']]);
  pa.close();

  // ── the project page: SOW rows from the worksheet's SOW filter list; the sales SOW page: none ──
  ns.sowFilter = { collectSowList: (vk) => (vk === 'view_3962' ? [{ id: SW1, label: '1589', name: 'Original scope', isCo: false }, { id: SW2, label: '1626', name: '', isCo: false }] : []) };
  window.location.hash = '#team-calendar/project-dashboard/' + PID + '/build-sow/' + PID;
  check('project page: "Project photo · SOW n" per SOW the filter lists; locations from the records\' field_1946',
    [pa.sowScopesFor('view_3962').map(x => [x.id, x.label, x.product]), pa.locationsFor('view_3962').map(l => l.label)],
    [[[SOWR(SW1), 'Project photo · SOW 1589', 'Original scope'], [SOWR(SW2), 'Project photo · SOW 1626', '']], ['HEADEND: closet', 'IDF: 01: shop']]);
  window.location.hash = '#sales-dashboard/scope-of-work-details/' + SW1;
  check('sales SOW page: no SOW rows (the page is one SOW; links.sowId already names it)', pa.sowScopesFor('view_3586'), []);
  window.location.hash = '#team-calendar/project-dashboard/' + PID + '/deploy/' + PID;

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL uncaught: ' + (e && e.stack || e)); process.exit(1); });
