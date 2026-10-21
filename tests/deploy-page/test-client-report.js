// jsdom smoke test: deploy-client-report.js — the "Client report (PDF)" button on the ops
// deployment page (scene_1311). Gated to CONFIG.ALLOWED_EMAILS, re-mounted when the worksheet
// rebuilds its toolbar; collect() reads the install worksheet through the real worksheet-v2
// config / groups / summary modules so the report follows the worksheet's own order (bucket sort
// order, then label), folds mounts under their device, lists removed-by-CO items apart, builds
// the network tree from Connected To / Connected Devices, prints every photo with an image, and
// never prints SCW notes, services, or a configuration answer whose label reads like a secret.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/p1' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.MutationObserver = window.MutationObserver;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

const CAM = '6481e5ba38f283002898113c', NET = '647953bb54b4e1002931ed97', OTH = '5df12ce036f91b0015404d78',
      MNT = '594a94536877675816984cb9', SVC = '6977caa7f246edf67b52cbcd';
const conn = (id, name) => [{ id, identifier: name }];
const L1 = conn('L1', 'MDF - Server Room'), L2 = conn('L2', 'IDF 01 - Mezzanine');
const cam = (id, label, loc, extra) => Object.assign({
  id, field_2802: label, field_2801: label, field_2790: 'Informant 4.0 Dual Vision', field_2822_raw: conn(CAM, 'Camera / Reader'),
  field_2818_raw: loc, field_2218: 10, field_2789: 1, field_2825: 'Done', field_2808: 'internal note for ops only'
}, extra || {});
const install = [
  cam('c3', 'I-003', L1, { field_2821_raw: conn('s1', 'SW-01') }),                       // out of label order on purpose
  cam('c1', 'I-001', L1, { field_2821_raw: conn('n1', 'NVR-01'), field_2807: 'No', field_2805: 'No', field_2806: 'Yes', field_2804: 120,
    field_2930_raw: conn('sch1', 'IP Cameras'), field_2932: JSON.stringify({ osd: 'Dock Door 1', res: '4K', pw: 'hunter2', notes: ['Night mode', 'WDR'] }) }),
  cam('c2', 'I-002', L1, { field_2790: 'The Deputy 4.0', field_2821_raw: conn('s1', 'SW-01'), field_2967_raw: conn('co1', '60486704913-SW1781CO') }),
  cam('c4', 'I-011', L2, { field_2821_raw: conn('s2', 'SW-02') }),
  cam('c5', 'I-012', L2, {}),                                                            // no connection at all
  { id: 'n1', field_2802: 'NVR-01', field_2801: 'NVR-01', field_2790: 'Imperial 128 Channel 4K NVR v3', field_2822_raw: conn(NET, 'Networking or Headend'),
    field_2818_raw: L1, field_2218: 20, field_2789: 1, field_2820_raw: conn('c1', 'I-001') },
  { id: 's1', field_2802: 'SW-01', field_2801: 'SW-01', field_2790: '24-port PoE switch', field_2822_raw: conn(NET, 'Networking or Headend'),
    field_2818_raw: L1, field_2218: 20, field_2789: 1, field_2821_raw: conn('n1', 'NVR-01'), field_2825: 'Not Started' },
  { id: 's2', field_2802: 'SW-02', field_2801: 'SW-02', field_2790: '8-port PoE switch', field_2822_raw: conn(NET, 'Networking or Headend'),
    field_2818_raw: L2, field_2218: 20, field_2789: 1, field_2821_raw: conn('n1', 'NVR-01') },
  { id: 'u1', field_2802: 'UPS-01', field_2801: 'UPS-01', field_2790: 'Rack UPS 1500VA', field_2822_raw: conn(OTH, 'Other Equipment'),
    field_2818_raw: L1, field_2218: 30, field_2789: 1 },
  { id: 'm1', field_2801: 'Wall Mount Bracket', field_2790: 'Wall Mount Bracket', field_2822_raw: conn(MNT, 'Mounting Hardware'),
    field_2818_raw: L1, field_2218: 30, field_2789: 1, field_2853_raw: conn('c1', 'I-001') },
  // a hard drive in the Other Equipment bucket, attached to the recorder: an accessory line on the
  // NVR card, never a card or an "other equipment" count of its own
  { id: 'h1', field_2801: 'Hard Drive, 24TB', field_2790: 'Hard Drive, 24TB', field_2822_raw: conn(OTH, 'Other Equipment'),
    field_2818_raw: L1, field_2218: 30, field_2789: 1, field_2853_raw: conn('n1', 'NVR-01') },
  { id: 'sv1', field_2801: 'Lift rental', field_2790: '', field_2809: 'Lift rental', field_2822_raw: conn(SVC, 'Services'), field_2218: 40, field_2789: 1 }
];
const photosById = {
  c1: [{ id: 'ph1', imgUrl: 'https://s3/ph1.jpg', type: 'Installed view' }, { id: 'ph2', imgUrl: 'https://s3/ph2.jpg', type: '' },
       { id: 'ph3', imgUrl: '', type: 'Field of view' }],                          // an empty required slot never prints
  n1: [{ id: 'ph4', imgUrl: 'https://s3/ph4.jpg', type: 'Rack front' }]
};
const maps = [
  { id: 'f1', field_68_raw: { url: 'https://s3/maps/floor1.png', filename: 'floor1.png' }, field_2877_raw: conn('t1', 'Site Plan'), field_588: 'Floor 1' },
  { id: 'f2', field_68_raw: { url: 'https://s3/docs/sow.pdf', filename: 'sow.pdf' }, field_2877_raw: conn('t2', 'Scope of Work PDF'), field_588: '' }
];
const project = [{ id: 'p1', field_4: 'Acme Warehouse', field_1622: '61234567890' }];
const models = recs => ({ model: { data: { models: recs.map(a => ({ attributes: a })) } } });
let currentEmail = 'someone.else@getscw.com';
window.Knack = {
  views: { view_4093: models(install), view_3942: models(maps), view_3930: models(project) },
  router: { current_scene_key: 'scene_1311' },
  getUserAttributes() { return { email: currentEmail, name: 'Micah Shearer' }; }
};
global.Knack = window.Knack;
const sceneHandlers = {}, viewHandlers = {};
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {},
  onViewRender(id, fn) { viewHandlers[id] = fn; }, onSceneRender(id, fn) { sceneHandlers[id] = fn; } };
global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
ns.data = { readRecords: () => install };
ns.photos = { extractPhotoRecords: (vk, id) => photosById[id] || [] };
window.SCW.knackImgThumb = (url, style) => url.replace(/\/([^/]+)$/, '/' + (style || 'thumb_14') + '/$1');
window.SCW.projectId = {
  resolve: () => ({ id: '61234567890', source: 'field' }),
  banner: (id, o) => '<div class="scw-pid-banner">Project # ' + id + ' · ' + (o.right || []).join(' · ') + '</div>',
  footer: id => '<div class="scw-pid-footer">Project # ' + id + '</div>'
};
window.SCW.deliverables = {
  ready: () => true,
  schemaIdOf: rec => (rec.field_2930_raw && rec.field_2930_raw[0] && rec.field_2930_raw[0].id) || '',
  schemaFieldsById: () => ({ sch1: [
    { key: 'osd', label: 'Camera name', sortOrder: 1 }, { key: 'res', label: 'Resolution', sortOrder: 2 },
    { key: 'pw', label: 'Admin password', sortOrder: 3 }, { key: 'notes', label: 'Features', sortOrder: 4 },
    { key: 'blank', label: 'Unanswered', sortOrder: 5 } ] }),
  readValues: rec => JSON.parse(rec.field_2932 || '{}')
};
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/deploy-client-report.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const api = window.SCW.deployClientReport;

const toolbar = () => '<div class="scw-ws-v2-toolbar"><div class="scw-ws-v2-toolbar-group"><button type="button" class="scw-ws-v2-toolbar-btn">Summary only</button></div>' +
  '<div class="scw-ws-v2-toolbar-group scw-ws-v2-toolbar-group--cta"><button type="button" class="scw-ws-v2-toolbar-btn scw-ws-v2-toolbar-btn--cta">+ Add Photos</button></div></div>';
document.body.innerHTML = '<div id="kn-scene_1311">' +
  '<div class="kn-view kn-details" id="view_3930"><div class="kn-detail field_4"><span class="kn-detail-label">Project Name</span><span class="kn-detail-body">Acme Warehouse</span></div>' +
  '<div class="kn-detail"><span class="kn-detail-label">Company</span><span class="kn-detail-body">Acme Logistics</span></div>' +
  '<div class="kn-detail"><span class="kn-detail-label">Site Address</span><span class="kn-detail-body">1 Dock Rd, Springfield</span></div></div>' +
  '<div id="scw-ws-v2-view_4093">' + toolbar() + '<div class="scw-ws-v2-body"></div></div>' +
  '<div class="kn-view kn-table" id="view_3942" style="display:none"></div>' +
  '<div class="kn-view kn-table" id="view_4093" style="display:none"></div></div>';

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const btn = () => document.getElementById('scw-client-report-btn');
const cfg = api.CONFIG.SCENES[0];

(async () => {
  // 1. the gate: another login never gets the button
  sceneHandlers.scene_1311();
  check('another login: no button', !!btn(), false);
  check('isAllowed is false for them', api.isAllowed(), false);

  // 2. the allowed login (case-insensitive) gets it in the toolbar's CTA group, marked preview
  currentEmail = 'Micah.Shearer@getscw.com';
  sceneHandlers.scene_1311();
  check('allowed login: the button sits in the toolbar CTA group, preview-styled',
    [!!btn(), btn() && btn().parentNode.classList.contains('scw-ws-v2-toolbar-group--cta'), btn() && btn().classList.contains('scw-ws-v2-toolbar-btn--preview'), btn() && btn().textContent],
    [true, true, true, 'Client report (PDF)']);

  // 3. the worksheet rebuilds its toolbar on every render: the button comes back on its own
  const panel = document.getElementById('scw-ws-v2-view_4093');
  panel.innerHTML = toolbar() + '<div class="scw-ws-v2-body">rebuilt</div>';
  check('gone right after the rebuild', !!btn(), false);
  await sleep(400);
  check('re-mounted by the scene observer, once', [!!btn(), document.querySelectorAll('#scw-client-report-btn').length], [true, 1]);

  // 4. collect(): the report object
  const r = api.collect(cfg);
  check('cover facts: project number, project name, client and address off the scene, prepared by the login',
    [r.projectNo, r.projectName, r.client, r.address, r.preparedBy], ['61234567890', 'Acme Warehouse', 'Acme Logistics', '1 Dock Rd, Springfield', 'Micah Shearer']);
  // Location order is the worksheet's (groups.js): real locations alphabetical, numeric-aware; within
  // one, proposal-bucket sort order (cameras 10, headend 20, other 30) then label.
  check('locations and devices in worksheet order; services, mounts and the removed camera are not devices',
    r.locations.map(l => [l.label, l.devices.map(d => d.label)]),
    [['IDF 01 - Mezzanine', ['I-011', 'I-012', 'SW-02']], ['MDF - Server Room', ['I-001', 'I-003', 'NVR-01', 'SW-01', 'UPS-01']]]);
  const c1 = r.devices.find(d => d.id === 'c1');
  check('camera facts: connected to by label, the mount from the accessory back-pointer, the cable line (new vs existing only), the config answers minus the password and the blank, arrays joined',
    [c1.connectedTo.label, c1.mounts, c1.cable, c1.facts, c1.status],
    ['NVR-01', ['Wall Mount Bracket'], 'New drop',
     [{ label: 'Camera name', value: 'Dock Door 1' }, { label: 'Resolution', value: '4K' }, { label: 'Features', value: 'Night mode, WDR' }], 'Done']);
  check('every photo with an image prints, typed or not; empty slots never do', c1.photos.map(p => [p.url, p.type]), [['https://s3/ph1.jpg', 'Installed view'], ['https://s3/ph2.jpg', '']]);
  const n1 = r.devices.find(d => d.id === 'n1');
  check('the recorder lists its connected devices from the union of forward list and back-pointers, in worksheet order',
    n1.connectedDevices.map(c => c.label), ['SW-02', 'I-001', 'SW-01']);
  check('an attached hard drive is an accessory line on the recorder, not a mount and not a device', [n1.mounts, n1.accessories, r.devices.some(d => d.id === 'h1')], [[], ['Hard Drive, 24TB'], false]);
  check('removed by change order: apart from the locations, with the CO named', r.removed.map(d => [d.label, d.location, d.co]), [['I-002', 'MDF - Server Room', 'CO 1781']]);
  check('network: the recorder is the root; its direct camera is a leaf; each switch is a branch with its cameras; the unconnected camera is listed apart',
    [r.network.roots.map(n => [n.device.label, n.leaves.map(l => l.label), n.branches.map(b => [b.device.label, b.leaves.map(l => l.label)])]), r.network.unconnected.map(d => d.label)],
    [[['NVR-01', ['I-001'], [['SW-02', ['I-011']], ['SW-01', ['I-003']]]]], ['I-012']]);
  check('scope tiles: Cameras (never readers), counts, locations, photos, removed', r.scope, { title: 'Cameras', cameras: 4, headend: 3, other: 1, locations: 2, photos: 3, removed: 1 });
  check('site maps: the image plan only, by its note; the PDF is not a map image', r.maps.map(m => [m.name, m.image]), [['Floor 1', true]]);
  check('location display names are tidied (a HEADEND carries no number)', api._internals.cleanLocation('HEADEND: : 019 - Server Room'), 'HEADEND: 019 - Server Room');
  check('network rows: one per recorder / switch, grouped by location in report order, each with its devices, what it feeds and what it uplinks to',
    api._internals.networkRows(r).map(g => [g.label, g.rows.map(row => [row.device.label, row.leaves.map(l => l.label), row.feeds.map(f => f.label), row.parent ? row.parent.label : null])]),
    [['IDF 01 - Mezzanine', [['SW-02', ['I-011'], [], 'NVR-01']]], ['MDF - Server Room', [['NVR-01', ['I-001'], ['SW-02', 'SW-01'], null], ['SW-01', ['I-003'], [], 'NVR-01']]]]);

  // 4a. the drawn map: hub = the recorder, a trunk, one branch per switch, the hub's own camera as a
  //     "direct" row, a band per location, unconnected cameras in an amber band — all recorded links solid
  const L = api._internals.networkLayout(r);
  check('map: the recorder is the hub; rows in location order (SW-02 in the IDF, then the hub\'s direct camera and SW-01 in the MDF); the unconnected camera gets its own band',
    [L.hub.label, L.nodes.map(n => [n.kind, n.label]), L.bands.map(b => b.label), L.clusters.map(c => c.leaves.map(l => l.label))],
    ['NVR-01', [['hub', 'NVR-01'], ['switch', 'SW-02'], ['direct', 'Direct connections'], ['switch', 'SW-01'], ['note', 'No connection recorded']],
     ['IDF 01 - Mezzanine', 'MDF - Server Room', 'Not connected to a recorder or switch'], [['I-011'], ['I-001'], ['I-003'], ['I-012']]]);
  check('map: a line from the trunk to every row, from every row to its cluster, the hub to the trunk and the trunk itself; nothing dashed (every link is recorded); fits one page unscaled',
    [L.lines.length, L.lines.filter(l => l.dashed).length, L.implied, L.scale], [8, 0, false, 1]);
  // a deployment like the first live one: the recorder records nothing, the switches record no uplink
  const mk = (id, label, product, family, loc, to) => ({ id, label, product, family, location: loc, photos: [], connectedDeviceIds: [], connectedTo: to ? { id: to, label: to.toUpperCase() } : null, mounts: [], accessories: [], facts: [], cable: '', qty: 0, status: '' });
  const live = [mk('n', 'NVR-01', 'Imperial 128 Channel 4K NVR v3', 'headend', 'MDF'), mk('s', 'Pre-existing PoE Switch U17', 'Pre-existing PoE Switch', 'headend', 'IDF 01'), mk('c', 'RA-I-070', 'Sheriff 8.0', 'cam', 'IDF 01', 's')];
  const net2 = api._internals.buildNetwork(live);
  const L2 = api._internals.networkLayout({ network: net2, locations: [{ label: 'MDF', devices: [live[0]] }, { label: 'IDF 01', devices: [live[1], live[2]] }], devices: live });
  check('live shape: a lone recorder with nothing recorded still becomes the hub, and the switch with no recorded uplink hangs off it by a dashed line',
    [L2.hub && L2.hub.label, L2.nodes.map(n => n.kind), L2.lines.filter(l => l.dashed).length, L2.implied], ['NVR-01', ['hub', 'switch'], 1, true]);
  api.CONFIG.IMPLY_UPLINKS = false;
  const L3 = api._internals.networkLayout({ network: net2, locations: [{ label: 'IDF 01', devices: [live[1], live[2]] }], devices: live });
  check('with implied uplinks off the switch stands alone: no hub, no trunk, no dashed line', [L3.hub, L3.nodes.map(n => n.kind), L3.lines.length], [null, ['switch'], 1]);
  api.CONFIG.IMPLY_UPLINKS = true;

  // 4b. photos: the image host refuses cross-origin reads (nothing loads under jsdom), so every
  //     photo falls back to Knack's thumbnail derivative with the full-size file as its onerror
  const s3 = 'https://s3.us-east-1.amazonaws.com/assets.knackhq.com/assets/' + 'a'.repeat(24) + '/' + 'b'.repeat(24) + '/original/cam.jpg';
  const apiU = 'https://api.knack.com/v1/applications/' + 'a'.repeat(24) + '/download/asset/' + 'b'.repeat(24) + '/cam.jpg';
  check('both Knack asset addresses are tried, the api host first', [api._internals.hostForms(s3), api._internals.hostForms(apiU), api._internals.hostForms('https://x/y.jpg')],
    [[apiU, s3], [apiU, s3], ['https://x/y.jpg']]);
  api.CONFIG.PHOTO_LOAD_TIMEOUT_MS = 30;
  await api.prepareImages(r, null);
  check('no cross-origin read → every photo prints from the thumbnail derivative, full size kept as the fallback',
    [r.photoStats, c1.photos.map(p => [p.mode, p.src, p.fallback])],
    [{ total: 3, reduced: 0, thumb: 3, original: 0 }, [['thumb', 'https://s3/thumb_14/ph1.jpg', 'https://s3/ph1.jpg'], ['thumb', 'https://s3/thumb_14/ph2.jpg', 'https://s3/ph2.jpg']]]);

  // 5. buildHtml(): what the client sees, and what they never see
  const html = api.buildHtml(r);
  const has = s => html.indexOf(s) !== -1;
  check('the document carries the project banner first, the client, the map image, the device facts, the network map, the removed table and the index',
    [has('scw-pid-banner'), has('Acme Logistics'), has('https://s3/maps/floor1.png'), has('Dock Door 1'), has('What connects to what'), has('Removed by change order'), has('CO 1781'), has('Device index'), has('Not connected to a recorder or switch'), has('<svg class="nm-lines"'), has('nm-node--hub')],
    [true, true, true, true, true, true, true, true, true, true, true]);
  check('never printed: the password, SCW notes, the service line', [has('hunter2'), has('internal note'), has('Lift rental')], [false, false, false]);
  check('the recorder card labels its hard drive as an accessory, the camera its bracket as a mount', [has('<dt>Accessories</dt><dd>Hard Drive, 24TB</dd>'), has('<dt>Mount</dt><dd>Wall Mount Bracket</dd>')], [true, true]);
  check('the document title names the client', has('<title>Acme Logistics · Deployment report</title>'), true);
  check('photos print from the thumbnail with the full-size onerror fallback; the bar says so',
    [has('src="https://s3/thumb_14/ph1.jpg"'), has("onerror=\"this.onerror=null;this.src='https://s3/ph1.jpg'\""), has('3 photos: 3 at Knack')], [true, true, true]);
  check('install status chips are off (the field is not maintained); the locations tile is named', [has('class="cr-status'), has('Not Started'), has('MDF / IDF locations')], [false, false, true]);

  // 6. generate(): opens the tab on the click, fills it, restores the button, prints
  let written = '', printed = false;
  const fakeWin = { document: { write(s) { written += s; }, open() { written = ''; }, close() {}, getElementById() { return null; }, body: {} }, focus() {}, print() { printed = true; } };
  window.open = () => fakeWin;
  api.CONFIG.PHOTO_MAX_DIM = 0;          // no canvas in jsdom: embed the original URLs
  api.CONFIG.PRINT_DELAY_MS = 20;
  const rep = await api.generate(cfg, btn());
  await sleep(60);
  check('generate wrote the report into the new tab, triggered print, and put the button back', [!!rep, written.indexOf('Acme Logistics · Deployment report') !== -1, printed, btn().textContent, btn().disabled], [true, true, true, 'Client report (PDF)', false]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
