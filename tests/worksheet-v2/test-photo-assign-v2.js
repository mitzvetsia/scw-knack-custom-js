// jsdom smoke test: worksheet-v2/photo-assign.js — the v2 "Add Photos" modal (preview, email-gated),
// one screen and no modes: photo tiles left, the device rail right; every photo is aimed at one or
// more devices (chips), each chip fills an open slot (view-based PUT of the Knack asset id) or adds a
// new photo (manifest to Make). File names aim rows with the board-2 rules; the label read falls back
// to the alternate label install rows carry. Rev 3: open slots are rows under each device (a photo
// is aimed at exactly one), no batch rule, no "assign in order", a lightbox zoom, wrapping labels.
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
// A loaded survey-request record (any view) carrying the request's project — the survey page's projectId source.
window.Knack.views.view_3617 = { model: { data: { models: [{ attributes: { id: 'req1', field_2346_raw: [{ id: 'proj9', identifier: 'P' }] } }] } } };
global.SCW = window.SCW;
const posts = [];
const fetchStub = (url, o) => { posts.push({ url, body: JSON.parse(o.body) }); return Promise.resolve({ ok: true, text: () => Promise.resolve('{"success":true}') }); };
global.fetch = window.fetch = fetchStub;
const infos = [];
const realInfo = console.info; console.info = (m) => infos.push(String(m));

for (const f of ['config.js', 'card.js', 'photo-assign.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', 'fetch',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW, fetchStub);
}
const ns = window.SCW.worksheetV2;
const pa = ns.photoAssign;
// Retries back off for real in the app; here they only need to happen.
pa.CONFIG.RETRY_BASE_MS = 5; pa.CONFIG.RETRY_MAX_MS = 10; pa.CONFIG.WRITES_GAP_MS = 0;
const V = 'view_4093';
const CAM = ns.card.CAM_READER_BUCKET, NET = ns.card.NETWORKING_BUCKET, SVC = ns.card.SERVICES_BUCKET;
const MH = ns.cfg.bucket('mountingHardware', V);
const MDF1 = '6abd0251e5d0b1ca628ebb94', MDF2 = '6abd0286c3e527b8ea5499ef';
// Install rows (view_4093 field map). r1 carries ONLY the alternate label (field_2801) — the shape that
// made the first build match nothing on a deploy page. r7 is a bracket pointing at r1; r8 is a bracket
// in the mounting-hardware bucket with NO parent column served (the shape that put brackets in the
// rail); r9 + r10 are a camera and its bracket naming EACH OTHER as parent (the corrupt reciprocal link
// seen live) — the worksheet keeps the bracket attached and un-hides the camera, so does the modal.
const irec = (id, label, prod, bucket, mdf, sort, extra) => Object.assign({
  id, field_2790: prod, field_2822_raw: [{ id: bucket, identifier: 'b' }],
  field_2818_raw: [{ id: mdf, identifier: mdf === MDF1 ? 'HEADEND: closet' : 'IDF: 01: shop' }], field_2218: sort
}, extra || {});
const installRecords = [
  irec('r1', '', 'Vista Dome 4MP', CAM, MDF1, 2, { field_2801: 'I-010' }),
  irec('r2', '', 'Vista Dome 4MP', CAM, MDF1, 2, { field_2802: 'I-011' }),
  irec('r3', '', 'Bullet 8MP', CAM, MDF2, 2, { field_2802: 'I-012' }),
  irec('r4', '', 'Bullet 8MP', CAM, MDF2, 2, { field_2802: 'I-013', field_2819_raw: [{ id: 'sl4', identifier: 'I-013' }] }),
  irec('r5', '', 'Imperial NVR 16 Channel 4K', NET, MDF1, 1, { field_2802: 'Imperial NVR 16 Chan Main Office' }),   // install label = truncated product + location
  irec('r6', '', 'Programming service', SVC, MDF1, 3),
  irec('r7', '', 'Wall Mount Bracket', CAM, MDF1, 2, { field_2853_raw: [{ id: 'r1', identifier: 'I-010' }] }),
  irec('r8', '', 'Electrical Box Mount', MH, MDF2, 4),
  irec('r9', '', 'Vista Dome 4MP', CAM, MDF2, 2, { field_2802: 'I-014', field_2853_raw: [{ id: 'r10', identifier: 'Wall Mount Bracket' }] }),
  irec('r10', '', 'Wall Mount Bracket', MH, MDF2, 4, { field_2853_raw: [{ id: 'r9', identifier: 'I-014' }] })
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
ns.picker = {
  open() {},
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
const railRows = () => Array.from(modal().querySelectorAll('.scw-pa-dev:not(.scw-pa-dev--scope)')).map(d => d.querySelector('.id').textContent + ' ' + d.querySelector('.st').textContent);
const slotRows = (dev) => Array.from(modal().querySelectorAll('[data-scw-pa-slot-dev="' + dev + '"]')).map(el => [el.getAttribute('data-scw-pa-slot-row'), el.className.replace('scw-pa-slot', '').trim(), el.querySelector('.who').textContent.trim()]);
const newRow = (dev) => { const el = modal().querySelector('[data-scw-pa-new-row="' + dev + '"]'); return el ? [el.className.replace('scw-pa-slot', '').trim(), el.querySelector('.who').textContent.trim()] : null; };
const railq = () => modal().querySelector('[data-scw-pa-railq]').value;

(async () => {
  // ── gate + button ──
  check('allowed: anyone @getscw.com, case-insensitive; other domains and no email are not',
    [pa.isAllowed(), (email = 'Jon.Carter@getscw.com', pa.isAllowed()), (email = 'someone@GetSCW.com', pa.isAllowed()),
     (email = 'sub@acmeinstalls.com', pa.isAllowed()), (email = '', pa.isAllowed())],
    [true, true, true, false, false]);
  email = 'Micah.Shearer@getscw.com';
  let c = toolbarFixture();
  check('replace mode: v2 stands in for v1 — no second button, the toolbar keeps its own "+ Add Photos"',
    [pa.replacesV1(), pa.inject(V), Array.from(c.querySelectorAll('.scw-ws-v2-toolbar button')).map(b => b.textContent),
     c.querySelectorAll('[data-scw-pa-open]').length],
    [true, true, ['+ Add MDF/IDF', '+ Add Photos'], 0]);
  pa.CONFIG.REPLACE_V1 = false;
  c = toolbarFixture();
  check('preview mode (REPLACE_V1 off): the amber v2 button right after "+ Add Photos", once',
    [pa.replacesV1(), pa.inject(V), pa.inject(V), Array.from(c.querySelectorAll('.scw-ws-v2-toolbar button')).map(b => b.textContent),
     c.querySelector('[data-scw-pa-open]').className.includes('scw-ws-v2-toolbar-btn--preview')],
    [false, true, true, ['+ Add MDF/IDF', '+ Add Photos', '+ Add Photos (v2)'], true]);
  pa.CONFIG.REPLACE_V1 = true;
  check('back in replace mode, inject drops the preview button', [pa.inject(V), c.querySelectorAll('[data-scw-pa-open]').length], [true, 0]);
  email = 'sub@acmeinstalls.com';
  c = toolbarFixture();
  check('another domain: not allowed, nothing injected, v1 stays',
    [pa.isAllowed(), pa.replacesV1(), pa.inject(V), c.querySelectorAll('[data-scw-pa-open]').length], [false, false, false, 0]);
  // ALONGSIDE (2026-10-19): @securevisionsolutions.com gets v2 as a second button BESIDE v1, never in place of it.
  email = 'tech@SecureVisionSolutions.com';
  c = toolbarFixture();
  check('alongside domain: allowed but no replacement — the amber v2 button right after "+ Add Photos" (v1 kept), once',
    [pa.isAllowed(), pa.isAlongside(), pa.replacesV1(), pa.inject(V), pa.inject(V),
     Array.from(c.querySelectorAll('.scw-ws-v2-toolbar button')).map(b => b.textContent)],
    [true, true, false, true, true, ['+ Add MDF/IDF', '+ Add Photos', '+ Add Photos (v2)']]);
  pa.CONFIG.ALONGSIDE_EMAILS = ['micah.shearer@getscw.com'];
  email = 'Micah.Shearer@getscw.com';
  check('a listed alongside email wins over its allowed domain', [pa.isAlongside(), pa.replacesV1()], [true, false]);
  pa.CONFIG.ALONGSIDE_EMAILS = [];
  check('empty alongside lists name nobody (never "everyone")', [pa.isAlongside(), pa.replacesV1()], [false, true]);
  email = 'Micah.Shearer@getscw.com';

  // ── candidates + matching ──
  const why = {};
  const cands = pa.candidatesFor(V, why);
  check('candidates: hardware only — attached accessories never (the worksheet rule, incl. the mutual-parent tie-break that keeps the camera), mounting-hardware never, the ALTERNATE label read when the display label is blank',
    [cands.map(x => x.id + '|' + x.drop + '|' + x.prefix + '|' + x.number), why, Object.keys(pa.attachedAccessoryIds(installRecords, V)).sort()],
    [['r5|Imperial NVR 16 Chan Main Office|IMPERIALNVRCHANMAINOFFICE|16', 'r1|I-010|I|10', 'r2|I-011|I|11', 'r3|I-012|I|12', 'r4|I-013|I|13', 'r9|I-014|I|14'], { records: 10, services: 1, attached: 2, accessories: 1 }, ['r10', 'r7']]);
  check('a label that already carries the product (whole, or a truncated run of it) needs no product line; a camera label does not',
    [pa.labelCarriesProduct('Admiral Pro 32 v5 Main Office', 'Admiral Pro 32 v5'), pa.labelCarriesProduct('[SPECIAL ORDER] Network Aggreg Main Office', '[SPECIAL ORDER] Network Aggregate Switch 8x2.5GbE Plus 2 x SFP'),
     pa.labelCarriesProduct('E-04', 'Deputy 8.0 v5'), pa.labelCarriesProduct('RA-E-011', 'Viking 8.0 v5'), pa.labelCarriesProduct('I-010', 'I/O module')],
    [true, true, false, false, false]);
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
  const DEP = '6a0000000000000000000d01', SOW = '6a0000000000000000000501', REQ = '6a0000000000000000000701';
  check('links per page — deploy: deployment + project from the route, the install item\'s source SOW line',
    pa.linksFor(V, installRecords[3], '#team-calendar/project-dashboard/' + PID + '/deploy/' + DEP),
    { page: 'deploy', projectId: PID, deploymentId: DEP, sowId: '', sowIds: [], surveyId: '', sowLineItemId: 'sl4', sowLineItemIds: ['sl4'] });
  check('links — sub deployment dashboard: the deployment only',
    pa.linksFor('view_4056', installRecords[0], '#subcontractor-portal/deployment-dashboard/' + DEP),
    { page: 'deploy', projectId: '', deploymentId: DEP, sowId: '', sowIds: [], surveyId: '', sowLineItemId: '', sowLineItemIds: [] });
  check('links — ops project page: the project from the route, the item\'s SOW headers (one SOW = sowId, two = sowIds only)',
    [pa.linksFor('view_3962', Object.assign({}, sowRecords[0], { field_2154_raw: [{ id: 'sw1' }] }), '#team-calendar/project-dashboard/' + PID + '/build-sow/' + PID),
     pa.linksFor('view_3962', Object.assign({}, sowRecords[0], { field_2154_raw: [{ id: 'sw1' }, { id: 'sw2' }] }), '#team-calendar/project-dashboard/' + PID + '/build-sow/' + PID).sowId],
    [{ page: 'project', projectId: PID, deploymentId: '', sowId: 'sw1', sowIds: ['sw1'], surveyId: '', sowLineItemId: '', sowLineItemIds: [] }, '']);
  check('links — sales SOW page: the page\'s SOW from the route (never the project), plus every SOW the item is on',
    pa.linksFor('view_3586', Object.assign({}, sowRecords[0], { field_2154_raw: [{ id: SOW }, { id: 'sw2' }] }), '#sales-dashboard/scope-of-work-details/' + SOW),
    { page: 'sow', projectId: '', deploymentId: '', sowId: SOW, sowIds: [SOW, 'sw2'], surveyId: '', sowLineItemId: '', sowLineItemIds: [] });
  check('links — survey page: the request from the route, its project from a loaded record, the survey item\'s matching SOW line(s)',
    pa.linksFor('view_3505', { id: 'sv1', field_2404_raw: [{ id: 'sl1' }, { id: 'sl2' }] }, '#subcontractor-portal/site-survey-request-details/' + REQ),
    { page: 'survey', projectId: 'proj9', deploymentId: '', sowId: '', sowIds: [], surveyId: REQ, sowLineItemId: 'sl1', sowLineItemIds: ['sl1', 'sl2'] });

  // ── the one screen ──
  toolbarFixture();
  pa.open(V);
  check('opens with the device count, both panes, and a console line naming what was skipped',
    [!!modal(), /6 devices/.test(text('.scw-pa-sub')), modal().querySelectorAll('.scw-pa-dev:not(.scw-pa-dev--scope)').length, infos.some(s => /view_4093: 10 records → 6 photo targets \(skipped: services 1, attached 2, accessories 1\)/.test(s))],
    [true, true, 6, true]);
  await pa.addFiles([file('i10.png'), file('i11.png'), file('i13 front.jpg'), file('i13 back.jpg'), file('1.12.jpg'), file('IMG_4523.jpg')]);
  check('rows aim themselves: open required slots fill in strip order, no slot → new, a guess is flagged, IMG waits',
    rows().map(r => [r.filename, tg(r)]),
    [['i10.png', [['r1', 'slot', 'p1', false]]], ['i11.png', [['r2', 'slot', 'p3', false]]], ['i13 front.jpg', [['r4', 'new', '', false]]],
     ['i13 back.jpg', [['r4', 'new', '', false]]], ['1.12.jpg', [['r3', 'new', '', true]]], ['IMG_4523.jpg', []]]);
  check('toolbar counts + footer + Send; no batch rule, no "assign in order"',
    [text('.scw-pa-matchsum .ok'), text('.scw-pa-matchsum .gs'), text('.scw-pa-matchsum .td'), text('.scw-pa-summary'), text('[data-scw-pa-send]'), modal().querySelector('[data-scw-pa-send]').disabled,
     modal().querySelectorAll('[data-scw-pa-rule], [data-scw-pa-order]').length],
    ['4 matched', '1 guessed', '1 to pick', '6 photos → 5 destinations · 2 fill a slot · 3 new photos · 1 guess to confirm · 1 photo still needs a device', 'Send 5 photos', false, 0]);
  check('DOM: six tiles with a zoom button each, five chips (one blue guess) naming the slot in full, one finder on the unaimed tile, amber tiles for unaimed + guess-free',
    [modal().querySelectorAll('.scw-pa-tile').length, modal().querySelectorAll('[data-scw-pa-zoom]').length, modal().querySelectorAll('.scw-pa-chip').length, modal().querySelectorAll('.scw-pa-chip.is-guess').length,
     modal().querySelectorAll('[data-scw-pa-finder]').length, modal().querySelectorAll('.scw-pa-tile.is-todo').length, text('[data-scw-pa-chip="' + rowByName('i10.png').id + '"]')],
    [6, 6, 5, 1, 1, 1, 'I-010 · Vista Dome 4MP fills Proposed Mounting Location']);
  check('rail rows: label (or product when there is none) + what is open and queued; devices still missing a required photo first, groups by name',
    railRows(),
    ['I-010 2 open slots · 2 required · 1 queued', 'I-011 1 open slot · 1 required · 1 queued', 'Imperial NVR 16 Chan Main Office no slots',
     'I-012 required photos all in · 1 queued', 'I-013 no slots · 2 queued', 'I-014 no slots']);
  check('the product line shows only when the label does not already carry it',
    [text('[data-scw-pa-dev-row="r1"] .nm'), modal().querySelector('[data-scw-pa-dev-row="r5"] .nm')], ['Vista Dome 4MP', null]);
  check('slot rows are collapsed by default; the status text is the toggle; a device with no open slots has no toggle',
    [slotRows('r1'), newRow('r1'), modal().querySelector('[data-scw-pa-slots-toggle="r1"]').getAttribute('aria-expanded'), modal().querySelector('[data-scw-pa-slots-toggle="r4"]')],
    [[], null, 'false', null]);
  modal().querySelector('[data-scw-pa-slots-toggle="r1"]').click();
  check('opened: one row per open slot (a taken one names its photo) and a "+ new photo" row',
    [slotRows('r1'), newRow('r1'), modal().querySelector('[data-scw-pa-slots-toggle="r1"]').getAttribute('aria-expanded')],
    [[['p1', 'is-taken', '← i10.png'], ['p2', '', 'open']], ['new', ''], 'true']);
  modal().querySelector('[data-scw-pa-slots-toggle="r1"]').click();
  check('and closed again', slotRows('r1'), []);
  pa.setShowSlots(true);
  check('"Show open slots under every device" opens them all and is remembered', [slotRows('r2'), window.localStorage.getItem('scw:pa:show-slots')], [[['p3', 'is-taken', '← i11.png']], '1']);
  pa.setShowSlots(false);
  check('…and off again', [slotRows('r2'), window.localStorage.getItem('scw:pa:show-slots')], [[], '0']);

  // Slot rows: pick exactly which slot a photo fills. The device a selected photo is aimed at opens by itself.
  const front = rowByName('i13 front.jpg');
  pa.select(front.id);
  pa.clickSlot('r1', 'p2');
  check('a slot click aims the selected photo at exactly that slot (its rows open)',
    [tg(front), slotRows('r1'), text('[data-scw-pa-dev-row="r1"] .st')],
    [[['r4', 'new', '', false], ['r1', 'slot', 'p2', false]], [['p1', 'is-taken', '← i10.png'], ['p2', 'is-hit', 'this photo']], 'this photo → fills Camera View']);
  pa.clickSlot('r1', 'p2');
  check('clicking its slot again clears it (a device whose slots were worked stays open)', [tg(front), slotRows('r1')], [[['r4', 'new', '', false]], [['p1', 'is-taken', '← i10.png'], ['p2', '', 'open']]]);
  pa.clickSlot('r1', 'p1');
  check('a slot another photo fills is refused with a note', [tg(front), /already taken by i10\.png/.test(text('.scw-pa-rail-ft'))], [[['r4', 'new', '', false]], true]);
  pa.clickNew('r1');
  check('"+ new photo" under a device with open slots forces a new photo there', [tg(front), newRow('r1')], [[['r4', 'new', '', false], ['r1', 'new', '', false]], ['new is-hit', 'this photo']]);
  pa.clickNew('r1');
  check('and again removes it', tg(front), [['r4', 'new', '', false]]);
  pa.select(front.id, false);

  // Two more photos of I-010: the next open required slot, then a new photo.
  await pa.addFiles([file('i10 extra.jpg'), file('i10 third.jpg')]);
  check('a second photo of the same device fills its next open required slot; a third becomes a new photo',
    [tg(rowByName('i10 extra.jpg')), tg(rowByName('i10 third.jpg'))], [[['r1', 'slot', 'p2', false]], [['r1', 'new', '', false]]]);

  // Finder: type on the unaimed tile, Enter takes the top hit; the rail search mirrors the query and clears with it.
  const img = rowByName('IMG_4523.jpg');
  pa.setFinderQuery(img.id, '13');
  check('the finder filters the rail, the search box shows the query, and the rail says it is filtered', [pa.railHits(), railq(), text('.scw-pa-railcount')], [['r4'], '13', 'Showing 1 of 6 devices for "13" · show all']);
  pa.finderEnter(img.id);
  check('Enter aims the tile at the top hit; the finder, the search box and the filter note clear', [tg(img), modal().querySelectorAll('[data-scw-pa-finder]').length, pa.state().finderRow, railq(), text('.scw-pa-railcount')], [[['r4', 'new', '', false]], 0, '', '', '']);

  // Rail click toggles the destination on the selected photos.
  pa.select(front.id);
  check('selecting a tile ticks its device in the rail', [modal().querySelector('[data-scw-pa-dev-row="r4"] .box').className, text('[data-scw-pa-dev-row="r4"] .st')], ['box on', 'this photo → new photo']);
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
  check('a typed new photo', [tg(front), text('[data-scw-pa-chip="' + front.id + '"] .slot')], [[['r4', 'new', 't-cv', false]], 'new Camera View photo']);
  const i10 = rowByName('i10.png');
  modal().querySelector('[data-scw-pa-chip="' + i10.id + '"]').click();
  check('a slot another photo fills is offered but disabled', Array.from(modal().querySelectorAll('.scw-pa-menu button[data-scw-pa-menu-slot]')).map(b => [b.getAttribute('data-scw-pa-menu-slot'), b.disabled, b.className]),
    [['p1', false, 'is-on'], ['p2', true, '']]);
  modal().querySelector('[data-scw-pa-menu-close]').click();
  pa.select(front.id, false);

  // Lightbox: view a photo larger, walk the queue, Esc back.
  pa.openZoom(front.id);
  check('zoom opens the photo full-size with its destinations', [!!modal().querySelector('.scw-pa-lb'), text('.scw-pa-lb-name'), /New "Camera View" photo on I-013 · 3 of 8/.test(text('.scw-pa-lb-sub'))], [true, 'i13 front.jpg', true]);
  pa.zoomStep(1);
  check('→ walks to the next photo', text('.scw-pa-lb-name'), 'i13 back.jpg');
  modal().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc closes the lightbox, not the modal', [!!modal(), !!modal().querySelector('.scw-pa-lb')], [true, false]);

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
    [[['p1', 'asset-1'], ['p3', 'asset-2'], ['p2', 'asset-7']], [['p1', 'Yes', true], ['p3', 'Yes', true], ['p2', 'Yes', true]]]);
  check('every manifest carries the page\'s links (deploy: deployment + project + the item\'s source SOW line)',
    [posts[0].body.links, posts[2].body.links.sowLineItemId],
    [{ page: 'deploy', projectId: PID, deploymentId: PID, sowId: '', sowIds: [], surveyId: '', sowLineItemId: 'sl4', sowLineItemIds: ['sl4'] }, '']);
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

  // ── "not tied to a device": the pinned rail row, a target of kind 'none' ──
  pa.close(); pa.open(V);
  await pa.addFiles([file('site overview.jpg')]);
  const site = rowByName('site overview.jpg');
  check('the rail opens with a pinned "not tied to a device" row that is not a device (not matched, not grouped, not ticked by a group)',
    [text('[data-scw-pa-dev-row="__scope__"] .id'), modal().querySelectorAll('.scw-pa-dev').length, tg(site), pa.railHits().indexOf('__scope__')],
    ['Deployment photo — not tied to a device', 7, [], -1]);
  pa.select(site.id);
  pa.clickDevice('__scope__');
  check('aiming at it is an ordinary chip', [tg(site), text('[data-scw-pa-chip="' + site.id + '"]')], [[['__scope__', 'new', '', false]], 'Deployment photo — not tied to a device new photo']);
  posts.length = 0;
  res = await pa.send();
  check('its manifest has target.kind none, no record, and the page links', [res.created, posts[0].body.target, posts[0].body.links.deploymentId], [1, { kind: 'none', recordId: '', label: 'Deployment photo — not tied to a device' }, PID]);

  // ── helpers ──
  pa.close(); pa.open(V);
  await pa.addFiles([file('b.jpg'), file('a.jpg')]);
  pa.select(rowByName('b.jpg').id);
  pa.clickDevice('r4');
  pa.tickGroup(MDF2);
  check('tick all in a group adds every device of that MDF/IDF', tg(rowByName('b.jpg')), [['r4', 'new', '', false], ['r3', 'new', '', false], ['r9', 'new', '', false]]);
  modal().querySelector('[data-scw-pa-hideaimed]').click();
  check('hide aimed leaves the unaimed tile', [modal().querySelectorAll('.scw-pa-tile').length, text('.scw-pa-tile .scw-pa-name')], [1, 'a.jpg']);

  // ── upload failure never writes ──
  pa.close(); pa.open(V);
  window.SCW.photoEditPanel.util.uploadImage = () => Promise.reject(new Error('503'));
  puts.length = 0; posts.length = 0;
  await pa.addFiles([file('i10.png')]);
  res = await pa.send();
  check('a failed upload fails its row and skips its writes', [res.filled, res.created, res.failed, rows()[0].status, /Upload failed: 503/.test(rows()[0].error), puts.length, posts.length], [0, 0, 1, 'failed', true, 0, 0]);

  console.info = realInfo;
  // ── a card's "+ Add Photos": the modal opens with that device preset ──
  pa.close(); pa.open(V, { deviceId: 'r1' });
  check('preset device is remembered and the header says where photos go',
    [pa.state().presetDeviceId, /photos you add here go to/.test(text('.scw-pa-sub')), text('.scw-pa-title')], ['r1', true, 'Add Photos']);
  await pa.addFiles([file('IMG_7001.jpg'), file('I-005.jpg')]);
  check('every photo added goes to the preset device — file names are not consulted',
    rows().map(r => r.targets.map(t => t.deviceId)), [['r1'], ['r1']]);
  pa.close(); pa.open(V, { deviceId: '__scope__' });
  check('the scope row is never a preset', pa.state().presetDeviceId, '');

  // ── 2026-10-16: select all / shift-click / family pills / sending lock + rate-limit retry ──
  pa.close(); pa.open(V);
  await pa.addFiles([file('p1.jpg'), file('p2.jpg'), file('p3.jpg'), file('p4.jpg'), file('p5.jpg')]);
  const tileBtn = (name) => modal().querySelector('[data-scw-pa-toggle="' + rowByName(name).id + '"]');
  const selNames = () => rows().filter(r => pa.state().selected[r.id]).map(r => r.filename);
  const shiftClick = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
  tileBtn('p2.jpg').click();
  shiftClick(tileBtn('p4.jpg'));
  check('shift-click selects the range from the last plain click', selNames(), ['p2.jpg', 'p3.jpg', 'p4.jpg']);
  shiftClick(tileBtn('p1.jpg'));
  check('another shift-click extends from the same anchor; nothing already ticked is dropped', selNames(), ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg']);
  check('the selection bar offers Select all / Clear selection', [text('[data-scw-pa-selall]'), !!modal().querySelector('[data-scw-pa-selnone]')], ['Select all 5', true]);
  modal().querySelector('[data-scw-pa-selall]').click();
  check('Select all ticks every sendable tile and the button goes away', [selNames().length, !!modal().querySelector('[data-scw-pa-selall]')], [5, false]);
  modal().querySelector('[data-scw-pa-selnone]').click();
  check('Clear selection empties it', selNames(), []);
  modal().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true }));
  check('⌘A (outside a text box) selects all', selNames().length, 5);
  tileBtn('p1.jpg').click();
  check('a plain click still toggles one tile off', selNames().length, 4);
  // Family pills on the rail.
  const pillTexts = () => Array.from(modal().querySelectorAll('[data-scw-pa-fam]')).map(b => b.textContent.replace(/\s+/g, ' ').trim());
  check('the rail offers one pill per family present, with counts (no "other" on this worksheet)', pillTexts(), ['All 6', 'Cameras 5', 'Headend & networking 1']);
  modal().querySelector('[data-scw-pa-fam="headend"]').click();
  check('"Headend & networking" shows only the NVR, the count line says so, the scope row stays',
    [pa.railHits(), text('.scw-pa-railcount'), !!modal().querySelector('[data-scw-pa-dev-row="__scope__"]'), modal().querySelector('[data-scw-pa-fam="headend"]').classList.contains('is-on')],
    [['r5'], 'Showing 1 of 6 devices · Headend & networking · show all', true, true]);
  const rqEl = modal().querySelector('[data-scw-pa-railq]'); rqEl.value = '13'; rqEl.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('the family filter and the search combine', [pa.railHits(), text('.scw-pa-railcount'), /No headend & networking match "13"\./.test(text('.scw-pa-rail-list'))],
    [[], 'Showing 0 of 6 devices · Headend & networking for "13" · show all', true]);
  modal().querySelector('[data-scw-pa-fam="cam"]').click();
  check('switching to Cameras keeps the query: I-013 only', pa.railHits(), ['r4']);
  modal().querySelector('[data-scw-pa-fam="cam"]').click();
  check('clicking the active pill again clears the family (the query stays)', [pa.state().railFamily, railq()], ['', '13']);
  modal().querySelector('[data-scw-pa-fam="headend"]').click();
  modal().querySelector('[data-scw-pa-railclear]').click();
  check('"show all" clears both the family and the query', [pa.railHits().length, railq(), modal().querySelector('[data-scw-pa-fam=""]').classList.contains('is-on')], [6, '', true]);
  check('a candidate carries its family', [pa.state().candIndex.r1.family, pa.state().candIndex.r5.family], ['cam', 'headend']);
  // Sending: the dialog locks, a progress bar shows, a 429 on a fill is retried with backoff.
  pa.close(); pa.open(V);
  // The upload-failure section above left the upload stub broken — a working one again.
  window.SCW.photoEditPanel.util.uploadImage = (blob, name) => { uploads.push(name); return Promise.resolve('asset-' + (++assetN)); };
  await pa.addFiles([file('i10.png')]);     // → r1's first open required slot (p1): a fill
  let failOnce = 1;
  const realPut = window.SCW.photoEditPanel.util.putRecord;
  window.SCW.photoEditPanel.util.putRecord = (view, id, body) => {
    if (body.field_771 && failOnce-- > 0) return Promise.reject(new Error('save failed (429)'));
    return realPut(view, id, body);
  };
  puts.length = 0; uploads.length = 0;
  const pending = pa.send();
  check('while sending the dialog is locked and a progress bar shows',
    [modal().querySelector('.scw-pa').classList.contains('is-sending'), !!modal().querySelector('.scw-pa-progress'), modal().querySelector('[data-scw-pa-send]').disabled, modal().querySelector('.scw-pa').getAttribute('aria-busy')],
    [true, true, true, 'true']);
  res = await pending;
  window.SCW.photoEditPanel.util.putRecord = realPut;
  check('a 429 on the slot write is retried and the fill lands; the lock lifts and the bar goes',
    [res.filled, res.failed, puts.filter(p => p[2].field_771).length, uploads.length, modal().querySelector('.scw-pa').classList.contains('is-sending'), !!modal().querySelector('.scw-pa-progress')],
    [1, 0, 1, 1, false, false]);
  let calls = 0;
  await pa.withRetry(() => { calls++; return Promise.reject(new Error('save failed (403)')); }, 'x').catch(() => {});
  check('withRetry: a permanent 4xx fails at once', calls, 1);
  calls = 0;
  await pa.withRetry(() => { calls++; return calls < 3 ? Promise.reject(new Error('save failed (429)')) : Promise.resolve('ok'); }, 'x');
  check('withRetry: 429s back off and succeed on the third try', calls, 3);
  calls = 0;
  await pa.withRetry(() => { calls++; return Promise.reject(new Error('upload failed (undefined)')); }, 'x').catch(() => {});
  check('withRetry: a network failure (no status) is transient — every attempt is used', calls, pa.CONFIG.RETRY_ATTEMPTS);
  const starts = [];
  await pa.runQueue([1, 2, 3, 4].map(n => () => { starts.push(Date.now()); return Promise.resolve(n); }), 2, 40);
  check('runQueue spaces task starts by the gap even when slots are free', starts.slice(1).every((t, i) => t - starts[i] >= 35), true);
  // A row whose writes failed keeps its asset: Send again reuses it instead of re-uploading.
  pa.close(); pa.open(V);
  await pa.addFiles([file('i11.png')]);     // → r2's open required slot p3
  let alwaysFail = true;
  window.SCW.photoEditPanel.util.putRecord = (view, id, body) => (body.field_771 && alwaysFail) ? Promise.reject(new Error('save failed (403)')) : realPut(view, id, body);
  uploads.length = 0;
  res = await pa.send();
  check('a permanent failure marks the row failed (no retry storm) and Send stays available for it', [res.failed, rowByName('i11.png').status, uploads.length, modal().querySelector('[data-scw-pa-send]').disabled], [1, 'failed', 1, false]);
  alwaysFail = false;
  res = await pa.send();
  window.SCW.photoEditPanel.util.putRecord = realPut;
  check('Send again writes the failed row without uploading the photo a second time', [res.filled, uploads.length, rowByName('i11.png').status], [1, 1, 'done']);

  // ── An uploaded photo as the tile (2026-10-29): "Copy to other slots…" from the single-photo modal ──
  // The asset id + file name come off either Knack image URL form; the tile carries the asset from the
  // start, so Send writes it without an upload; it is selected on open and never aimed by its file name.
  check('assetFromUrl reads both Knack URL forms (asset id, file name, the app), nothing else',
    [pa.assetFromUrl('https://api.knack.com/v1/applications/594319f83817c2580c853138/download/asset/68f1a2b3c4d5e6f7a8b9c0d1/IMG_0012.jpg?x=1'),
     pa.assetFromUrl('https://s3.us-east-1.amazonaws.com/assets.knackhq.com/assets/594319f83817c2580c853138/68f1a2b3c4d5e6f7a8b9c0d1/thumb_14/I-010%20front.jpg'),
     pa.assetFromUrl('blob:https://scwinstallation.knack.com/abc'), pa.assetFromUrl('')],
    [{ id: '68f1a2b3c4d5e6f7a8b9c0d1', applicationId: '594319f83817c2580c853138', filename: 'IMG_0012.jpg' },
     { id: '68f1a2b3c4d5e6f7a8b9c0d1', applicationId: '594319f83817c2580c853138', filename: 'I-010 front.jpg' }, null, null]);
  const srcUrl = 'https://api.knack.com/v1/applications/594319f83817c2580c853138/download/asset/68f1a2b3c4d5e6f7a8b9c0d1/IMG_0012.jpg';
  check('copyFromAllowed: an allowed login with a Knack image URL may open; a blob URL or a sub login may not',
    [pa.copyFromAllowed(V, srcUrl), pa.copyFromAllowed(V, 'blob:x') !== '', (email = 'sub@acmeinstalls.com', pa.copyFromAllowed(V, srcUrl) !== '')],
    ['', true, true]);
  email = 'Micah.Shearer@getscw.com';
  pa.close();
  let st = pa.open(V, { existingPhoto: { photoId: 'p4', imgUrl: srcUrl, type: 'Proposed Mounting Location', deviceId: 'r3' } });
  let ex = rows()[0];
  check('open with existingPhoto: copy mode, ONE tile already carrying the asset, selected, no targets, no file name aim',
    [st.copyMode, rows().length, ex.assetId, ex.filename, ex.status, !!pa.state().selected[ex.id], ex.targets.length, ex.match, ex.thumbUrl === srcUrl, ex.existing],
    [true, 1, '68f1a2b3c4d5e6f7a8b9c0d1', 'IMG_0012.jpg', 'queued', true, 0, null, true,
     { photoId: 'p4', deviceId: 'r3', deviceLabel: 'I-012', type: 'Proposed Mounting Location' }]);
  check('the header and the tile say what it is', [text('.scw-pa-title'), /the Proposed Mounting Location on I-012 is queued below, already uploaded/.test(text('.scw-pa-sub')), text('.scw-pa-from'), text('.scw-pa-thumb .sz')],
    ['Copy Photo', true, 'Copy of the Proposed Mounting Location on I-012', 'already uploaded']);
  // Aim it: a device click fills r1's first open required slot, "+ new photo" under r2 adds a copy there.
  pa.clickDevice('r1');
  pa.clickNew('r2');
  check('aimed at two destinations: a slot fill on I-010 and a new photo on I-011', tg(ex), [['r1', 'slot', 'p1', false], ['r2', 'new', '', false]]);
  uploads.length = 0; puts.length = 0; posts.length = 0;
  window.SCW.CONFIG.MAKE_PHOTO_ASSIGN_WEBHOOK = 'https://hook.us1.make.com/copy';
  res = await pa.send();
  const fillPut = puts.find(p => p[2].field_771), stampPut = puts.find(p => p[2].field_2865);
  check('Send: nothing is uploaded; the slot takes the EXISTING asset id; the history line says it was copied and from where',
    [res.filled, res.created, res.failed, uploads.length, fillPut && fillPut.slice(0, 2), fillPut && fillPut[2].field_771, /COPIED PHOTO: from I-012 \(IMG_0012\.jpg\)/.test(stampPut ? stampPut[2].field_2865 : '')],
    [1, 1, 0, 0, ['view_3937', 'p1'], '68f1a2b3c4d5e6f7a8b9c0d1', true]);
  check('the create manifest carries the same asset and names the source photo', [posts.length, posts[0].body.asset.id, posts[0].body.copyOf, posts[0].body.target.recordId],
    [1, '68f1a2b3c4d5e6f7a8b9c0d1', { photoId: 'p4', deviceId: 'r3', deviceLabel: 'I-012' }, 'r2']);
  check('the tile is done', [ex.status, ex.result], ['done', 'Fill Proposed Mounting Location on I-010 · New photo on I-011 (sent to Make)']);
  // A URL with no asset id: the option is refused up front (open falls back to an ordinary empty modal).
  pa.close();
  st = pa.open(V, { existingPhoto: { photoId: 'p9', imgUrl: 'blob:https://x/y' } });
  check('an existingPhoto whose URL carries no asset id opens an ordinary empty modal', [st.copyMode, rows().length, text('.scw-pa-title')], [false, 0, 'Add Photos']);
  pa.close();

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL uncaught: ' + (e && e.stack || e)); process.exit(1); });
