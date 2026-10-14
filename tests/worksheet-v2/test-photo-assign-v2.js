// jsdom smoke test: worksheet-v2/photo-assign.js — the v2 "Add Photos" modal (preview, email-gated),
// one screen and no modes: photo tiles left, the device rail right; every photo is aimed at one or
// more devices (chips), each chip fills an open slot (view-based PUT of the Knack asset id) or adds a
// new photo (manifest to Make). File names aim rows with the board-2 rules; the label read falls back
// to the alternate label install rows carry.
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
// Install rows (view_4093 field map). r1 carries ONLY the alternate label (field_2801) — the shape that
// made the first build match nothing on a deploy page.
const irec = (id, label, prod, bucket, mdf, sort, extra) => Object.assign({
  id, field_2790: prod, field_2822_raw: [{ id: bucket, identifier: 'b' }],
  field_2818_raw: [{ id: mdf, identifier: mdf === MDF1 ? 'HEADEND: closet' : 'IDF: 01: shop' }], field_2218: sort
}, extra || {});
const installRecords = [
  irec('r1', '', 'Vista Dome 4MP', CAM, MDF1, 2, { field_2801: 'I-010' }),
  irec('r2', '', 'Vista Dome 4MP', CAM, MDF1, 2, { field_2802: 'I-011' }),
  irec('r3', '', 'Bullet 8MP', CAM, MDF2, 2, { field_2802: 'I-012' }),
  irec('r4', '', 'Bullet 8MP', CAM, MDF2, 2, { field_2802: 'I-013' }),
  irec('r5', '', 'Imperial NVR', NET, MDF1, 1),
  irec('r6', '', 'Programming service', SVC, MDF1, 3),
  irec('r7', '', 'Wall Mount Bracket', CAM, MDF1, 2, { field_2853_raw: [{ id: 'r1', identifier: 'I-010' }] })
];
// SOW rows (view_3962 defaults) for the matcher's prefix rules.
const srec = (id, label, prod) => ({ id, field_1950: label, field_1949: prod, field_2219_raw: [{ id: CAM, identifier: 'b' }], field_1946_raw: [{ id: MDF1, identifier: 'HEADEND' }], field_2218: 2 });
const sowRecords = [srec('s1', 'E-001', 'Cam'), srec('s2', 'RA-E-001', 'Reader'), srec('s3', 'E-003', 'Cam')];
let records = installRecords;
const refetches = [];
ns.data = { readRecords: (vk) => (vk === 'view_3962' ? sowRecords : records), refetchAndNotify: (k) => refetches.push(k), subscribeRendered() {} };
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
const rowByName = (n) => rows().find(r => r.filename === n);
const tg = (r) => r.targets.map(t => [t.deviceId, t.mode, t.slotId || t.typeId || '', t.guessed]);
const text = (sel) => { const el = modal().querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; };

(async () => {
  // ── gate + button ──
  check('allowed: the listed email, case-insensitive', pa.isAllowed(), true);
  let c = toolbarFixture();
  check('inject puts the amber v2 button right after "+ Add Photos", once',
    [pa.inject(V), pa.inject(V), Array.from(c.querySelectorAll('.scw-ws-v2-toolbar button')).map(b => b.textContent),
     c.querySelector('[data-scw-pa-open]').className.includes('scw-ws-v2-toolbar-btn--preview')],
    [true, true, ['+ Add MDF/IDF', '+ Add Photos', '+ Add Photos (v2)'], true]);
  email = 'someone@getscw.com';
  c = toolbarFixture();
  check('another user: not allowed, no button', [pa.isAllowed(), pa.inject(V), c.querySelectorAll('[data-scw-pa-open]').length], [false, false, 0]);
  email = 'Micah.Shearer@getscw.com';

  // ── candidates + matching ──
  const cands = pa.candidatesFor(V);
  check('candidates: hardware only, canonical order, the ALTERNATE label read when the display label is blank',
    cands.map(x => x.id + '|' + x.drop + '|' + x.prefix + '|' + x.number),
    ['r5||| ', 'r1|I-010|I|10', 'r2|I-011|I|11', 'r3|I-012|I|12', 'r4|I-013|I|13'].map(s => s.replace('||| ', '|||')));
  const m = (n, list) => { const r = pa.matchFile(n, list || cands); return r ? [r.cand.id, r.confidence, r.via] : null; };
  check('board 2, install page: label / separators / zeros / bare number / leading 1 / sibling prefix / camera roll / ambiguous / words',
    [m('i10.png'), m('I_010 front.jpg'), m('i-10.heic'), m('10.jpg'), m('0010.jpg'), m('1.10.jpg'), m('E-013.jpg'),
     m('IMG_4523.jpg'), m('IMG_0010.jpg'), m('DSC_0112 I-012.jpg'), m('i10 and i11.png'), m('lobby wide.jpg'), m('NVR closet.jpg')],
    [['r1', 'matched', 'label'], ['r1', 'matched', 'label'], ['r1', 'matched', 'label'], ['r1', 'matched', 'number'], ['r1', 'matched', 'number'],
     ['r1', 'guessed', 'leading1'], ['r4', 'guessed', 'prefix'], null, null, ['r3', 'matched', 'label'], null, null, null]);
  const sow = pa.candidatesFor('view_3962');
  check('board 2, SOW page: the longer label wins; a number two devices share asks; a known prefix with a missing number asks',
    [m('RA-E-001.jpg', sow), m('E-001.jpg', sow), m('1.jpg', sow), m('E-003 front.jpg', sow), m('E-9.jpg', sow)],
    [['s2', 'matched', 'label'], ['s1', 'matched', 'label'], null, ['s3', 'matched', 'label'], null]);
  check('route: install line items under a deployment', [pa.targetKind(), pa.resolveScope(V)], ['installLineItemID', { linkField: 'deploymentID', recordId: PID }]);

  // ── the one screen ──
  toolbarFixture();
  pa.open(V);
  check('opens with the device count and both panes', [!!modal(), /5 devices/.test(text('.scw-pa-sub')), modal().querySelectorAll('.scw-pa-dev').length], [true, true, 5]);
  await pa.addFiles([file('i10.png'), file('i11.png'), file('i13 front.jpg'), file('i13 back.jpg'), file('1.12.jpg'), file('IMG_4523.jpg')]);
  check('rows aim themselves: open required slots fill in strip order, no slot → new, a guess is flagged, IMG waits',
    rows().map(r => [r.filename, tg(r)]),
    [['i10.png', [['r1', 'slot', 'p1', false]]], ['i11.png', [['r2', 'slot', 'p3', false]]], ['i13 front.jpg', [['r4', 'new', '', false]]],
     ['i13 back.jpg', [['r4', 'new', '', false]]], ['1.12.jpg', [['r3', 'new', '', true]]], ['IMG_4523.jpg', []]]);
  check('toolbar counts + footer + Send', [text('.scw-pa-matchsum .ok'), text('.scw-pa-matchsum .gs'), text('.scw-pa-matchsum .td'), text('.scw-pa-summary'), text('[data-scw-pa-send]'), modal().querySelector('[data-scw-pa-send]').disabled],
    ['4 matched', '1 guessed', '1 to pick', '6 photos → 5 destinations · 2 fill a slot · 3 new photos · 1 guess to confirm · 1 photo still needs a device', 'Send 5 photos', false]);
  check('DOM: six tiles, five chips (one blue guess), one finder on the unaimed tile, amber tiles for unaimed + guess-free',
    [modal().querySelectorAll('.scw-pa-tile').length, modal().querySelectorAll('.scw-pa-chip').length, modal().querySelectorAll('.scw-pa-chip.is-guess').length,
     modal().querySelectorAll('[data-scw-pa-finder]').length, modal().querySelectorAll('.scw-pa-tile.is-todo').length],
    [6, 5, 1, 1, 1]);
  check('rail rows say what is open and what is queued', Array.from(modal().querySelectorAll('.scw-pa-dev')).map(d => d.querySelector('.id').textContent + ' ' + d.querySelector('.st').textContent),
    ['I-010 0 of 2 required · 1 queued', 'I-011 0 of 1 required · 1 queued', '— no required slots', 'I-012 1 of 1 required · 1 queued', 'I-013 2 queued']);   // devices still missing a required photo first; the rest in canonical order

  // Two more photos of I-010: the next open required slot, then a new photo.
  await pa.addFiles([file('i10 extra.jpg'), file('i10 third.jpg')]);
  check('a second photo of the same device fills its next open required slot; a third becomes a new photo',
    [tg(rowByName('i10 extra.jpg')), tg(rowByName('i10 third.jpg'))], [[['r1', 'slot', 'p2', false]], [['r1', 'new', '', false]]]);

  // Finder: type on the unaimed tile, Enter takes the top hit.
  const img = rowByName('IMG_4523.jpg');
  pa.setFinderQuery(img.id, '13');
  check('the finder filters the rail', pa.railHits(), ['r4']);
  pa.finderEnter(img.id);
  check('Enter aims the tile at the top hit and the finder goes away', [tg(img), modal().querySelectorAll('[data-scw-pa-finder]').length, pa.state().finderRow], [[['r4', 'new', '', false]], 0, '']);

  // Rail click toggles the destination on the selected photos.
  const front = rowByName('i13 front.jpg');
  pa.select(front.id);
  check('selecting a tile ticks its device in the rail', [modal().querySelector('[data-scw-pa-dev-row="r4"] .box').className, text('[data-scw-pa-dev-row="r4"] .st')], ['box on', 'this photo → new']);
  pa.clickDevice('r1');
  check('clicking another device adds a second chip: one upload, two copies (I-010 slots are taken → new)',
    [tg(front), text('[data-scw-pa-row="' + front.id + '"] .scw-pa-addmore')], [[['r4', 'new', '', false], ['r1', 'new', '', false]], '+ another device · one upload, 2 copies']);
  pa.clickDevice('r1');
  check('clicking it again removes the chip', tg(front), [['r4', 'new', '', false]]);
  // The chip menu: a typed new photo, and a slot already taken by another photo in the batch is offered disabled.
  modal().querySelector('[data-scw-pa-chip="' + front.id + '"]').click();
  check('chip menu lists this device\'s choices', Array.from(modal().querySelectorAll('.scw-pa-menu button')).map(b => b.textContent.replace(/\s+/g, ' ').trim()),
    ['New photo, no type', 'New photo: Camera View', 'New photo: Proposed Mounting Location', 'Remove this device', 'Close']);
  pa.setTarget(front.id, 'r4', { mode: 'new', typeId: 't-cv' });
  check('a typed new photo', [tg(front), text('[data-scw-pa-chip="' + front.id + '"] .slot')], [[['r4', 'new', 't-cv', false]], 'new: Camera View']);
  const i10 = rowByName('i10.png');
  modal().querySelector('[data-scw-pa-chip="' + i10.id + '"]').click();
  check('a slot another photo fills is offered but disabled', Array.from(modal().querySelectorAll('.scw-pa-menu button[data-scw-pa-menu-slot]')).map(b => [b.getAttribute('data-scw-pa-menu-slot'), b.disabled, b.className]),
    [['p1', false, 'is-on'], ['p2', true, '']]);
  modal().querySelector('[data-scw-pa-menu-close]').click();
  pa.select(front.id, false);

  // One photo left unaimed on purpose: it stays in the queue through a send.
  await pa.addFiles([file('lobby wide.jpg')]);
  let res = await pa.send();
  check('no Make webhook: creates are refused up front, nothing uploads', [res.errors.length, /not configured/.test(res.errors[0]), uploads.length], [1, true, 0]);
  window.SCW.CONFIG.MAKE_PHOTO_ASSIGN_WEBHOOK = 'https://hook.test/assign';
  res = await pa.send();
  check('send: one upload per aimed photo, fills for the slots, manifests for the rest, the unaimed one left in the queue',
    [res, uploads.length], [{ sent: 8, uploaded: 8, filled: 3, created: 5, failed: 0, guessed: 1, leftover: 1 }, 8]);
  check('fill = the asset id PUT onto the slot record through the save view, then the best-effort completion + history stamp',
    [puts.filter(p => p[2].field_771).map(p => [p[1], p[2].field_771]), puts.filter(p => p[2].field_2447).map(p => [p[1], p[2].field_2447, /UPLOADED PHOTO: bulk assign/.test(p[2].field_2865)])],
    [['p1', 'asset-1'], ['p3', 'asset-2'], ['p2', 'asset-7']].length === 3 ? [[['p1', 'asset-1'], ['p3', 'asset-2'], ['p2', 'asset-7']], [['p1', 'Yes', true], ['p3', 'Yes', true], ['p2', 'Yes', true]]] : null);
  check('manifests: no bytes, the target device, the type when chosen, the parent scope',
    posts.map(p => [p.body.uploadKind, p.body.target.kind, p.body.target.recordId, p.body.photoType && p.body.photoType.id, p.body.scope.linkField, p.body.asset.id]),
    [['photo_assign', 'installLineItemID', 'r4', 't-cv', 'deploymentID', 'asset-3'], ['photo_assign', 'installLineItemID', 'r4', null, 'deploymentID', 'asset-4'],
     ['photo_assign', 'installLineItemID', 'r3', null, 'deploymentID', 'asset-5'], ['photo_assign', 'installLineItemID', 'r4', null, 'deploymentID', 'asset-6'],
     ['photo_assign', 'installLineItemID', 'r1', null, 'deploymentID', 'asset-8']]);
  check('rows report what happened; the unaimed one still carries its finder; the worksheet refetches; Send is off until something new is aimed',
    [rows().map(r => r.status), rowByName('i10.png').result, modal().querySelectorAll('[data-scw-pa-finder]').length, refetches, text('.scw-pa-done'), modal().querySelector('[data-scw-pa-send]').disabled],
    [['done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'queued'], 'Fill Proposed Mounting Location on I-010', 1, [V], '3 slots filled · 5 new photos sent to Make · 1 guess confirmed · 1 photo still in the queue', true]);
  const lobby = rowByName('lobby wide.jpg');
  pa.setTarget(lobby.id, 'r2');
  check('aiming the leftover re-enables Send for just that photo', [text('[data-scw-pa-send]'), modal().querySelector('[data-scw-pa-send]').disabled], ['Send 1 photo', false]);

  // ── helpers ──
  pa.close(); pa.open(V);
  await pa.addFiles([file('b.jpg'), file('a.jpg')]);
  pa.pairInOrder(['r4', 'r1']);
  check('assign in order: files in name order ↔ picked devices in canonical order', rows().map(r => [r.filename, tg(r)]), [['b.jpg', [['r4', 'new', '', false]]], ['a.jpg', [['r1', 'slot', 'p1', false]]]]);
  pa.select(rowByName('b.jpg').id);
  pa.tickGroup(MDF2);
  check('tick all in a group adds every device of that MDF/IDF', tg(rowByName('b.jpg')), [['r4', 'new', '', false], ['r3', 'new', '', false]]);
  pa.setRule('new');
  pa.setTarget(rowByName('a.jpg').id, 'r2');
  check('the batch rule "always add a new photo" skips open slots', tg(rowByName('a.jpg')), [['r1', 'slot', 'p1', false], ['r2', 'new', '', false]]);
  modal().querySelector('[data-scw-pa-hideaimed]').click();
  check('hide aimed', modal().querySelectorAll('.scw-pa-tile').length, 0);

  // ── upload failure never writes ──
  pa.close(); pa.open(V);
  window.SCW.photoEditPanel.util.uploadImage = () => Promise.reject(new Error('503'));
  puts.length = 0; posts.length = 0;
  await pa.addFiles([file('i10.png')]);
  res = await pa.send();
  check('a failed upload fails its row and skips its writes', [res.filled, res.created, res.failed, rows()[0].status, /Upload failed: 503/.test(rows()[0].error), puts.length, posts.length], [0, 0, 1, 'failed', true, 0, 0]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL uncaught: ' + (e && e.stack || e)); process.exit(1); });
