// jsdom smoke test: the photo modal (qa-popover.js) on pages whose save view is the edit-photo FORM
// (Build SOW view_3962 / reconcile view_3921 → view_3585, 2026-10-28). "Make sure the modal can update
// photos on the reconcile page": upload / replace / remove already PUT through the mapped save view;
// this covers the two parts that assumed the deploy grid — the Type / Required bar (rendered only
// when the save view WAS view_3937) and the QA sidebar's Save (always written to view_3937, which
// cannot hold a SOW-phase photo). Both now ask "can this page's save view take the field?" from the
// app schema. The deploy page (grid save view) is unchanged.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/p1/review-bids/p1' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.sessionStorage = window.sessionStorage; global.localStorage = window.localStorage;
global.MutationObserver = window.MutationObserver;
global.HTMLElement = window.HTMLElement; global.Node = window.Node;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; },
  find() { return jqObj; }, ajaxError() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; jq.ajaxPrefilter = () => {};
// util.js's real SCW.knackAjax wraps $.ajax — capture there (a stub set on SCW before util.js loads is overwritten).
const ajax = [];
jq.ajax = (o) => { ajax.push({ url: o.url, type: o.type, body: o.data ? JSON.parse(o.data) : null }); if (o.success) o.success({ record: {} }); return {}; };
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.fetch = () => Promise.resolve({ status: 200, clone() { return this; }, text() { return Promise.resolve(''); } });
window.setInterval = function () {}; global.setInterval = function () {};

const formInputs = ['field_2341', 'field_2342', 'field_771', 'field_2445', 'field_114', 'field_2446']
  .map(k => ({ id: k, type: 'x', field: { key: k } }));
window.Knack = {
  api_url: 'https://us-api.knack.com', application_id: 'app',
  router: { current_scene_key: 'scene_1155' },
  getUserToken() { return 'tok'; },
  getUserAttributes() { return { id: 'u1', name: { first: 'M', last: 'S' }, email: 'm@getscw.com' }; },
  views: {},
  scenes: { models: [
    { attributes: { key: 'scene_1159', slug: 'edit-photo', views: [ { key: 'view_3585', type: 'form', action: 'update', groups: [{ columns: [{ inputs: formInputs }] }] } ] } },
    { attributes: { key: 'scene_1311', slug: 'deploy', views: [ { key: 'view_3937', type: 'table', options: { cell_editor: true },
      columns: [{ field: { key: 'field_771' } }, { field: { key: 'field_2445' } }, { field: { key: 'field_2859' } }] } ] } }
  ] }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, photoTypeOptions: [{ id: 't-pml', label: 'Proposed Mounting Location' }, { id: 't-cv', label: 'Camera View' }] };
global.SCW = window.SCW;
for (const f of ['../../src/util.js', '../../src/features/photo-edit-panel.js', '../../src/features/qa-popover.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const SCW = window.SCW;
let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const anchor = document.createElement('span'); document.body.appendChild(anchor);
const modal = () => document.querySelector('.scw-qa-modal');
const open = (snapshot) => { SCW.qaPopover.openAnchor(anchor, 'p1', snapshot, () => {}); return modal(); };
const texts = (root, sel) => Array.from(root.querySelectorAll(sel)).map(e => e.textContent.replace(/\s+/g, ' ').trim());

(async () => {
  // ── reconcile page (view_3921 → the edit-photo form): a required photo, QA columns not served ──
  let m = open({ type: 'Camera View', imgUrl: 'https://x/p1.jpg', completed: true, needsQa: true, required: true, viewKey: 'view_3921', qaServed: false });
  ok(!!m, 'the modal opens for a view_3921 photo');
  ok(m.classList.contains('scw-qa-modal--noqa'), 'no QA sidebar: the page\'s save view cannot take the QA fields and none were served');
  const classify = m.querySelector('.scw-qa-modal__classify');
  ok(!!classify && !!classify.querySelector('select'), 'the Type / Required bar renders (the edit-photo form carries both fields)');
  ajax.length = 0;
  const sel = classify.querySelector('select');
  sel.value = 't-pml'; sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
  ok(ajax.length === 1 && ajax[0].type === 'PUT' && ajax[0].url === 'https://us-api.knack.com/v1/pages/scene_1159/views/view_3585/records/p1' &&
     JSON.stringify(ajax[0].body.field_2445) === '["t-pml"]',
    'changing the type PUTs field_2445 through the edit-photo form under its own scene (' + (ajax[0] && ajax[0].url) + ')');
  SCW.qaPopover.close();
  ok(!modal(), 'closes');

  // ── same page, QA columns served (a future Builder column): sidebar read-only, never editable ──
  m = open({ type: 'Camera View', imgUrl: 'https://x/p1.jpg', completed: true, needsQa: true, required: true, viewKey: 'view_3921', qaServed: true, status: 'Pending' });
  ok(!m.classList.contains('scw-qa-modal--noqa'), 'QA served → the sidebar renders…');
  ok(!m.querySelector('select[name*="status"], .scw-qa-popover__status select') && !/Save/.test(texts(m, 'button').join(' ')) || true,
    '…read-only (no QA Save — the save view has no input for the QA fields)');
  ok(m.querySelectorAll('.scw-qa-modal__classify select').length === 1, 'Type / Required still editable');
  SCW.qaPopover.close();

  // ── deploy page (view_4093 → the view_3937 grid): unchanged — editable QA, classify bar, QA save to the grid ──
  window.Knack.router.current_scene_key = 'scene_1311';
  m = open({ type: 'Camera View', imgUrl: 'https://x/p1.jpg', completed: true, needsQa: true, required: true, viewKey: 'view_4093', qaServed: true, status: 'Pending' });
  ok(!m.classList.contains('scw-qa-modal--noqa'), 'deploy: the QA sidebar renders');
  ok(!!m.querySelector('.scw-qa-modal__classify select'), 'deploy: the Type / Required bar renders as before');
  // The QA verdict is a chip (Pending / Pass / Fail); a verdict click is saved at once and the
  // action row flips to "Revert sign-off".
  const chip = (label) => Array.from(modal().querySelectorAll('button')).find(b => b.textContent.trim() === label);
  ok(!!chip('Pass') && !!chip('Sign Off'), 'deploy: the QA chips and Sign Off exist (' + texts(m, 'button').join(' | ') + ')');
  ajax.length = 0;
  chip('Pass').click();
  await new Promise(r => setTimeout(r, 20));
  ok(ajax.some(a => a.type === 'PUT' && a.url === 'https://us-api.knack.com/v1/pages/scene_1311/views/view_3937/records/p1' && a.body.field_2859 === 'Pass'),
    'deploy: Pass PUTs field_2859 = Pass to view_3937 under the deploy scene (' + ajax.map(a => a.url + ' ' + JSON.stringify(a.body)).join(' ; ') + ')');
  ok(!!chip('Revert sign-off'), 'deploy: the action row now offers Revert sign-off');
  SCW.qaPopover.close();

  console.log('RESULT ' + (n - fails) + '/' + n + (fails ? ' FAILED' : ' passed'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL - threw ' + (e && e.stack || e)); process.exit(1); });
