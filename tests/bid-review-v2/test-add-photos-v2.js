// jsdom smoke test: the Reconcile Bids page's "+ Add Photos" opens the v2 photo modal (2026-10-28).
// bid-review-v2/toolbar.js routes the click to worksheet-v2/photo-assign.js for the users v2 replaces
// v1 for (@getscw.com), over the page's SOW line items (view_3921 — the Build SOW page's object, so
// the field map, the Make route, the project scope and the save view are the Build SOW page's);
// everyone else still gets the v1 bulk-upload modal with the project id from the route.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PID = '69c4310cf4b1b33df77fa499';
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/' + PID + '/review-bids/' + PID });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, ajaxError() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};

let email = 'Micah.Shearer@getscw.com';
const CAM = '6481e5ba38f283002898113c', NET = '647953bb54b4e1002931ed97', SVC = '6977caa7f246edf67b52cbcd';
const conn = (id, name) => [{ id, identifier: name }];
// SOW line items as view_3921 serves them (the view_3962 keys = the worksheet-v2 defaults).
const sowRecords = [
  { id: 'd1', field_1950: 'E-001', field_1949: 'Deputy 8.0 v5', field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: conn('L1', 'HEADEND: 01'), field_2154_raw: conn('sowX', '1589'), field_2218: 2 },
  { id: 'd2', field_1950: 'E-002', field_1949: 'Deputy 8.0 v5', field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: conn('L1', 'HEADEND: 01'), field_2154_raw: conn('sowX', '1589').concat(conn('sowY', '1628')), field_2218: 2 },
  { id: 'n1', field_1950: '', field_1949: 'Imperial NVR 16ch', field_2219_raw: conn(NET, 'Networking'), field_1946_raw: conn('L1', 'HEADEND: 01'), field_2154_raw: conn('sowX', '1589'), field_2218: 1 },
  { id: 's1', field_1950: '', field_1949: 'Programming', field_2219_raw: conn(SVC, 'Other Services'), field_2154_raw: conn('sowX', '1589'), field_2218: 5 }
];
window.Knack = {
  router: { current_scene_key: 'scene_1155' }, api_url: 'https://us-api.knack.com', application_id: 'app',
  getUserAttributes() { return email ? { id: 'u1', name: { first: 'M', last: 'S' }, email } : null; },
  getUserToken() { return 'tok'; },
  views: { view_3921: { model: { data: { models: sowRecords.map(r => ({ id: r.id, attributes: r })) } } } }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: { MAKE_PHOTO_ASSIGN_WEBHOOK: 'https://hook.example/photo-assign' }, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;
const infos = [];
const realInfo = console.info; console.info = (m) => infos.push(String(m));

// Real modules: the photo machinery (save views), the worksheet-v2 config + card helpers, the v2 modal,
// and the reconcile toolbar (its namespace stubbed to the one key it reads).
new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/photo-edit-panel.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
for (const f of ['config.js', 'card.js', 'photo-assign.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
const pa = ns.photoAssign;
const refetches = [];
ns.data = { readRecords: (vk) => (vk === 'view_3921' ? sowRecords : []), refetchAndNotify: (k) => refetches.push(k), subscribeRendered() {} };
const photosByRecord = { d1: [{ id: 'p1', type: 'Proposed Mounting Location', required: true, imgUrl: '' }], d2: [] };
ns.photos = { extractPhotoRecords: (vk, rid) => (vk === 'view_3921' ? (photosByRecord[rid] || []) : []).map(p => Object.assign({}, p)) };
ns.picker = { open() {}, canonicalItemSort: (itemLabel) => (a, b) => String(itemLabel(a)).localeCompare(String(itemLabel(b)), undefined, { numeric: true }) };
const v1Opens = [];
window.SCW.bulkUpload = {
  prepareFile: f => Promise.resolve({ blob: f, converted: false }),
  open: (cfg, recordId) => v1Opens.push([cfg.linkField, recordId, cfg.menuViewId]),
  config: { VIEWS: [{ menuViewId: 'view_3482', linkField: 'sowID', hashPattern: /scope-of-work-details\/([a-f0-9]{24})/,
    injectTargets: [{ contexts: [
      { linkField: 'projectID', hashPattern: /project-dashboard\/([a-f0-9]{24})/ },
      { linkField: 'sowID', hashPattern: /scope-of-work-details\/([a-f0-9]{24})/ } ] }] }] }
};
window.SCW.bidReviewV2 = { CONFIG: { mountId: 'scw-bid-review-v2' } };
new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/bid-review-v2/toolbar.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const host = document.createElement('div'); host.id = 'scw-bid-review-v2';
host.innerHTML = '<div class="scw-bid-review-v2-body"></div>';
document.body.appendChild(host);
window.SCW.bidReviewV2.toolbar.mount();
const btn = () => host.querySelector('[data-scw-br-v2-tb="add-photos"]');
const modal = () => document.getElementById('scw-photo-assign');
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

ok(!!btn(), 'the reconcile toolbar carries "+ Add Photos"');

// ── an @getscw.com login: the v2 modal over view_3921 ──
ok(pa.replacesV1(), 'v2 replaces v1 for an @getscw.com login');
infos.length = 0;
click(btn());
ok(!!modal() && v1Opens.length === 0, 'click → the v2 modal opens, v1 is not called');
ok(pa.state() && pa.state().viewKey === 'view_3921', 'the modal is open over view_3921 (' + (pa.state() && pa.state().viewKey) + ')');
const rail = Array.from(modal().querySelectorAll('.scw-pa-dev:not(.scw-pa-dev--scope):not(.scw-pa-dev--loc) .id')).map(e => e.textContent.trim());   // device rows only (location rows since 2026-10-30)
ok(JSON.stringify(rail) === JSON.stringify(['Imperial NVR 16ch', 'E-001', 'E-002']) || JSON.stringify(rail.slice().sort()) === JSON.stringify(['E-001', 'E-002', 'Imperial NVR 16ch']),
  'the rail lists the hardware (cameras + the NVR), never the service (' + rail.join(', ') + ')');
ok(/view_3921: 4 records → 3 photo targets \(skipped: services 1\)/.test(infos.join('\n')), 'console: "view_3921: 4 records → 3 photo targets (skipped: services 1)"');
const sub = modal().querySelector('.scw-pa-sub');
ok(sub && /^Reconcile Bids · SOW line items · 3 devices/.test(sub.textContent.replace(/\s+/g, ' ').trim()), 'the header names the host: "' + (sub && sub.textContent.replace(/\s+/g, ' ').trim()) + '"');
ok(!!modal().querySelector('.scw-pa-dev--scope') && /Project photo/.test(modal().querySelector('.scw-pa-dev--scope').textContent), 'the "not tied to a device" row is a Project photo (the page is project-scoped)');
const slots = pa.openSlotsFor('view_3921', 'd1');
ok(slots.length === 1 && slots[0].id === 'p1', 'open slots come from view_3921\'s own photo columns (E-001: one open required slot)');
pa.close();
ok(!modal(), 'closes');

// ── what a new photo tells Make, and where a fill writes ──
const links = pa.linksFor('view_3921', sowRecords[1]);
ok(links.page === 'project' && links.projectId === PID && JSON.stringify(links.sowIds) === '["sowX","sowY"]' && links.sowId === '' && links.deploymentId === '' && links.surveyId === '',
  'links: the project page shape — projectId from the route, the item\'s SOW headers (' + JSON.stringify(links) + ')');
const links1 = pa.linksFor('view_3921', sowRecords[0]);
ok(links1.sowId === 'sowX', 'sowId is set when the item is on exactly one SOW');
ok(pa.targetKind() === 'sowLineItemID', 'target kind: sowLineItemID (Make\'s SOW-line route)');
const scope = pa.resolveScope('view_3921');
ok(scope && scope.linkField === 'projectID' && scope.recordId === PID, 'scope: projectID + the route\'s project id — what the v1 button sent (' + JSON.stringify(scope) + ')');
ok(window.SCW.photoEditPanel.SAVE_VIEWS.view_3921 === 'view_3585' && window.SCW.photoEditPanel.SAVE_VIEWS.view_3962 === 'view_3585',
  'save view: the edit-photo form view_3585, like the Build SOW page');

// ── any other login: v1 exactly as before ──
email = 'tech@securevisionsolutions.com';
ok(!pa.replacesV1(), 'a sub login: v2 does not replace v1');
click(btn());
ok(!modal() && v1Opens.length === 1 && v1Opens[0][0] === 'projectID' && v1Opens[0][1] === PID && v1Opens[0][2] === 'view_3482',
  'click → the v1 bulk-upload modal with linkField projectID + the route\'s project id (' + JSON.stringify(v1Opens[0]) + ')');
email = '';
click(btn());
ok(!modal() && v1Opens.length === 2, 'no email: v1 too');

console.info = realInfo;
console.log('RESULT ' + (n - fails) + '/' + n + (fails ? ' FAILED' : ' passed'));
process.exit(fails ? 1 : 0);
