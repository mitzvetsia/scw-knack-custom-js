// jsdom smoke test: qa-popover.js "Copy to other slots…" (2026-10-29) — on the deploy page's single-photo
// modal, a photo that HAS an image offers a hand-off into the v2 photo-assign modal: the button shows only
// where that modal is enabled for the login and the image URL carries a Knack asset id; a click closes this
// modal and opens photo-assign over the same worksheet with the photo (id, URL, type, its line item) as
// the existing-photo tile. Every other action in the bar is unchanged.
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
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; },
  find() { return jqObj; }, ajaxError() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; jq.ajaxPrefilter = () => {};
jq.ajax = (o) => { if (o.success) o.success({ record: {} }); return {}; };
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.fetch = () => Promise.resolve({ status: 200, clone() { return this; }, text() { return Promise.resolve(''); } });
window.setInterval = function () {}; global.setInterval = function () {};
const alerts = []; window.alert = (m) => alerts.push(m); global.alert = window.alert;
window.Knack = {
  api_url: 'https://us-api.knack.com', application_id: 'app',
  router: { current_scene_key: 'scene_1311' },
  getUserToken() { return 'tok'; },
  getUserAttributes() { return { id: 'u1', name: { first: 'M', last: 'S' }, email: 'm@getscw.com' }; },
  views: {},
  scenes: { models: [
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
// The v2 photo-assign modal, as qa-popover sees it: a gate and an opener.
const opens = []; let allowReason = '';
SCW.worksheetV2 = { photoAssign: {
  copyFromAllowed: (vk, url) => allowReason || (/download\/asset\/[a-f0-9]{24}\//.test(url) ? '' : 'the photo URL carries no Knack asset id'),
  open: (vk, opts) => { opens.push([vk, opts]); return { viewKey: vk }; }
} };
let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const anchor = document.createElement('span'); document.body.appendChild(anchor);
const modal = () => document.querySelector('.scw-qa-modal');
const open = (snapshot) => { SCW.qaPopover.openAnchor(anchor, 'p4', snapshot, () => {}); return modal(); };
const barButtons = (m) => Array.from(m.querySelectorAll('.scw-qa-modal__viewer-bar button')).map(b => b.textContent.trim());
const URL_OK = 'https://api.knack.com/v1/applications/594319f83817c2580c853138/download/asset/68f1a2b3c4d5e6f7a8b9c0d1/IMG_0012.jpg';

(async () => {
  // ── deploy page, a filled required photo on line item r3 ──
  let m = open({ type: 'Proposed Mounting Location', imgUrl: URL_OK, completed: true, needsQa: true, required: true, viewKey: 'view_4093',
                 qaServed: true, status: 'Pending', lineItemId: 'r3', lineLabel: 'I-012', product: 'Bullet 8MP' });
  ok(!!m, 'the modal opens for a deploy-page photo');
  const btns = barButtons(m);
  ok(JSON.stringify(btns) === JSON.stringify(['Copy to other slots…', 'Replace photo', 'Remove photo']),
    'the viewer bar offers Copy to other slots… ahead of Replace / Remove (' + btns.join(' | ') + ')');
  const cp = Array.from(m.querySelectorAll('.scw-qa-modal__viewer-bar button')).find(b => b.textContent.trim() === 'Copy to other slots…');
  ok(cp.classList.contains('is-copy') && /copy of this photo/i.test(cp.title), 'it is the accent-styled copy button with a tooltip');
  cp.click();
  await new Promise(r => setTimeout(r, 20));
  ok(!modal(), 'the click closes the single-photo modal');
  ok(opens.length === 1 && opens[0][0] === 'view_4093' &&
     JSON.stringify(opens[0][1]) === JSON.stringify({ existingPhoto: { photoId: 'p4', imgUrl: URL_OK, type: 'Proposed Mounting Location', deviceId: 'r3', deviceLabel: 'I-012' } }),
    'and opens photo-assign over the same worksheet with the photo as the existing-photo tile (' + JSON.stringify(opens[0]) + ')');
  ok(alerts.length === 0, 'no alert when the modal opened');

  // ── not offered: a URL with no asset id (a blob: preview after a replace), or a login the v2 modal is off for ──
  m = open({ type: 'Camera View', imgUrl: 'blob:https://scwinstallation.knack.com/abc', completed: true, needsQa: true, required: true, viewKey: 'view_4093', qaServed: true, lineItemId: 'r3' });
  ok(JSON.stringify(barButtons(m)) === JSON.stringify(['Replace photo', 'Remove photo']), 'a blob: URL offers no copy button (' + barButtons(m).join(' | ') + ')');
  SCW.qaPopover.close();
  allowReason = 'the v2 photo modal is not enabled for this login';
  m = open({ type: 'Camera View', imgUrl: URL_OK, completed: true, needsQa: true, required: true, viewKey: 'view_4093', qaServed: true, lineItemId: 'r3' });
  ok(JSON.stringify(barButtons(m)) === JSON.stringify(['Replace photo', 'Remove photo']), 'a login the modal is off for sees the bar as before');
  SCW.qaPopover.close();
  allowReason = '';

  // ── the opener refusing (no state back) is said plainly ──
  SCW.worksheetV2.photoAssign.open = () => null;
  m = open({ type: 'Camera View', imgUrl: URL_OK, completed: true, needsQa: false, viewKey: 'view_4093', lineItemId: 'r3' });
  Array.from(m.querySelectorAll('.scw-qa-modal__viewer-bar button')).find(b => b.textContent.trim() === 'Copy to other slots…').click();
  await new Promise(r => setTimeout(r, 20));
  ok(alerts.length === 1 && /could not open/.test(alerts[0]), 'when photo-assign cannot open, an alert says so');

  // ── without the v2 modal loaded at all: nothing changes ──
  delete SCW.worksheetV2;
  m = open({ type: 'Camera View', imgUrl: URL_OK, completed: true, needsQa: false, viewKey: 'view_4093', lineItemId: 'r3' });
  ok(JSON.stringify(barButtons(m)) === JSON.stringify(['Replace photo', 'Remove photo']), 'no photo-assign module → the bar is as before');
  SCW.qaPopover.close();

  console.log('RESULT ' + (n - fails) + '/' + n + (fails ? ' FAILED' : ' passed'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL - threw ' + (e && e.stack || e)); process.exit(1); });
