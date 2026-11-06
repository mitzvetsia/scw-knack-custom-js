// jsdom smoke test: clearing a photo's TYPE from the photo modal (2026-11-06 — "I need to be able to
// change those 'camera view' placeholders to not having a photo type so that I can delete them").
// Deploy page (view_4093 → the view_3937 grid): the Type select's first option is "No type"; on a
// typed photo it PUTs field_2445 = [] through the save view. A slot that is then not required and
// untyped is a loose record (photos.js canDeleteAdhoc), so the modal re-derives canDelete after a
// Type / Required edit and rebuilds itself with the Delete button — on an EMPTY slot too, which
// used to offer no delete at all inside the modal. Drives the real util + photo-edit-panel +
// worksheet-v2/photos + qa-popover modules.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/p1/deploy/p1' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.sessionStorage = window.sessionStorage; global.localStorage = window.localStorage;
global.MutationObserver = window.MutationObserver;
global.HTMLElement = window.HTMLElement; global.Node = window.Node;
window.requestAnimationFrame = fn => setTimeout(fn, 0); global.requestAnimationFrame = window.requestAnimationFrame;
window.scrollTo = () => {};
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; },
  find() { return jqObj; }, ajaxError() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; jq.ajaxPrefilter = () => {};
const ajax = [];
jq.ajax = (o) => { ajax.push({ url: o.url, type: o.type, body: o.data ? JSON.parse(o.data) : null }); if (o.success) o.success({ record: {} }); return {}; };
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.fetch = () => Promise.resolve({ status: 200, clone() { return this; }, text() { return Promise.resolve(''); } });
window.setInterval = function () {}; global.setInterval = function () {};
window.alert = () => {};

window.Knack = {
  api_url: 'https://us-api.knack.com', application_id: 'app',
  router: { current_scene_key: 'scene_1311' },
  getUserToken() { return 'tok'; },
  getUserAttributes() { return { id: 'u1', name: { first: 'M', last: 'S' }, email: 'm@getscw.com' }; },
  views: {},
  scenes: { models: [
    { attributes: { key: 'scene_1311', slug: 'deploy', views: [ { key: 'view_3937', type: 'table', options: { cell_editor: true },
      columns: [{ field: { key: 'field_771' } }, { field: { key: 'field_2445' } }, { field: { key: 'field_2446' } }, { field: { key: 'field_2859' } }] } ] } }
  ] }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, photoTypeOptions: [{ id: 't-pml', label: 'Proposed Mounting Location' }, { id: 't-cv', label: 'Camera View' }] };
global.SCW = window.SCW;
const load = (f) => new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
load('../../src/util.js');
load('../../src/features/photo-edit-panel.js');
const confirmCalls = [];
window.SCW.worksheetV2 = {
  confirmModal(opts) { confirmCalls.push(opts); return Promise.resolve(true); },
  data: { refetchAndNotify() {} },
  warnings: { invalidatePhotos() {} }
};
load('../../src/features/worksheet-v2/photos.js');
load('../../src/features/qa-popover.js');
const SCW = window.SCW;
const deleted = [];
SCW.worksheetV2.photos.deletePhotoRecord = (id, vk) => { deleted.push([id, vk]); return Promise.resolve(true); };

let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const anchor = document.createElement('span'); document.body.appendChild(anchor);
const modal = () => document.querySelector('.scw-qa-modal');
const tick = () => new Promise(r => setTimeout(r, 25));
const snap = (over) => Object.assign({ viewKey: 'view_4093', qaServed: true, status: 'Pending', completed: false, imgUrl: '', needsQa: true }, over);
const open = (s) => {
  s.canDelete = SCW.worksheetV2.photos.canDeleteAdhoc(s.viewKey, { id: 'p1', required: s.required, type: s.type });
  SCW.qaPopover.openAnchor(anchor, 'p1', s, () => {}); return modal();
};
const typeSel = () => modal().querySelector('.scw-qa-modal__classify select');
const reqBox = () => modal().querySelector('.scw-qa-modal__classify-req input');
const delBtn = () => Array.from(modal().querySelectorAll('button')).find(b => /^Delete photo|^Deleting/.test(b.textContent.trim())) || null;
const lastPut = () => ajax.filter(a => a.type === 'PUT').slice(-1)[0];

(async () => {
  // ── a seeded "Camera View" placeholder: typed, required, no image ──
  let m = open(snap({ type: 'Camera View', required: true }));
  ok(!!m, 'the modal opens for the empty required slot');
  ok(typeSel().options[0].textContent === 'No type (loose photo)' && typeSel().value === 't-cv',
    'the Type select leads with "No type (loose photo)" and shows Camera View selected');
  ok(!delBtn(), 'no Delete yet: typed and required');

  ajax.length = 0;
  typeSel().value = ''; typeSel().dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  ok(lastPut() && lastPut().url === 'https://us-api.knack.com/v1/pages/scene_1311/views/view_3937/records/p1' &&
     JSON.stringify(lastPut().body) === '{"field_2445":[]}',
    'picking No type PUTs field_2445 = [] through view_3937 (' + (lastPut() && JSON.stringify(lastPut().body)) + ')');
  ok(!delBtn(), 'still required → still no Delete');
  ok(typeSel().value === '' && typeSel().options[0].textContent === 'No type (loose photo)',
    'the select reads No type after the clear');

  ajax.length = 0;
  reqBox().checked = false; reqBox().dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  ok(lastPut() && lastPut().body.field_2446 === 'No', 'unticking Required PUTs field_2446 = No');
  ok(!!delBtn() && !!modal().querySelector('.scw-qa-modal__viewer-bar--empty'),
    'not required + no type → the rebuilt modal offers Delete photo on the EMPTY slot');
  ok(modal().classList.contains('scw-qa-modal--noqa') || !modal().querySelector('.scw-qa-modal__sidebar'),
    'the QA sidebar is gone with Required (nothing to sign off)');

  deleted.length = 0;
  delBtn().click();
  await tick();
  ok(confirmCalls.length === 1 && deleted.length === 1 && deleted[0][0] === 'p1' && deleted[0][1] === 'view_4093',
    'Delete → the are-you-SURE prompt → deletePhotoRecord(p1, view_4093)');
  ok(!modal(), 'the modal closes after the delete');

  // ── a FILLED typed photo that is not required: clearing the type alone makes it deletable ──
  m = open(snap({ type: 'Camera View', required: false, imgUrl: 'https://x/p1.jpg', completed: true, needsQa: false }));
  ok(!!m && !delBtn(), 'filled typed photo: no Delete while it carries a type');
  ajax.length = 0;
  typeSel().value = ''; typeSel().dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  ok(JSON.stringify(lastPut().body) === '{"field_2445":[]}', 'the clear PUTs field_2445 = []');
  ok(!!delBtn() && !!modal().querySelector('.scw-qa-modal__viewer-bar') && !modal().querySelector('.scw-qa-modal__viewer-bar--empty'),
    'the viewer bar now carries Delete photo');
  SCW.qaPopover.close();

  // ── an untyped photo: the first option is the current state and writes nothing ──
  m = open(snap({ type: '', required: true }));
  ok(typeSel().options[0].textContent === '— no type —' && typeSel().value === '', 'untyped: the first option reads "— no type —"');
  ajax.length = 0;
  typeSel().value = ''; typeSel().dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  ok(ajax.length === 0, 'choosing it again writes nothing');
  ajax.length = 0;
  typeSel().value = 't-pml'; typeSel().dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  ok(JSON.stringify(lastPut().body) === '{"field_2445":["t-pml"]}', 'picking a type still PUTs its id');
  SCW.qaPopover.close();

  // ── a required photo that loses Required but keeps its type: still not deletable ──
  m = open(snap({ type: 'Camera View', required: true }));
  reqBox().checked = false; reqBox().dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  ok(!delBtn(), 'typed + not required → no Delete (the type still names a slot)');
  SCW.qaPopover.close();

  console.log('RESULT ' + (n - fails) + '/' + n + (fails ? ' FAILED' : ' passed'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL - threw ' + (e && e.stack || e)); process.exit(1); });
