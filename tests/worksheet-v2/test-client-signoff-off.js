// jsdom smoke test: client sign-off on photos is switched OFF (2026-11-19 — Lee, deploy page:
// "What is this from the Deployment page? … It doesn't ask on every camera line item. Looks like
// only this one." — the photo QA window's "Client signoff" chips, shown only for a photo whose
// DOC_photos field_2860 is not N/A). SCW.CONFIG.PHOTO_CLIENT_SIGNOFF (src/config.js) is false:
// the stored value is ignored — no chips, no "Client pending" chit, SCW's Pass alone is complete,
// field_2860 is never written. true brings the old behaviour back.
// Drives the real config + util + photo-edit-panel + worksheet-v2/photos + qa-popover modules.
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
      columns: [{ field: { key: 'field_771' } }, { field: { key: 'field_2859' } }, { field: { key: 'field_2860' } }, { field: { key: 'field_2861' } }] } ] } }
  ] }
};
global.Knack = window.Knack;
const load = (f) => new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
load('../../src/config.js');                       // the real switch
window.SCW.debug = () => {};
global.SCW = window.SCW;
load('../../src/util.js');
load('../../src/features/photo-edit-panel.js');
window.SCW.worksheetV2 = {
  confirmModal() { return Promise.resolve(true); },
  data: { refetchAndNotify() {} },
  warnings: { invalidatePhotos() {} }
};
load('../../src/features/worksheet-v2/photos.js');
load('../../src/features/qa-popover.js');
const SCW = window.SCW;

let fails = 0, n = 0;
function ok(cond, msg) { n++; if (cond) console.log('ok - ' + msg); else { fails++; console.log('FAIL - ' + msg); } }
const anchor = document.createElement('span'); document.body.appendChild(anchor);
const modal = () => document.querySelector('.scw-qa-modal');
const tick = () => new Promise(r => setTimeout(r, 25));
const IMG = 'https://api.knack.com/v1/applications/app/download/asset/a1/cam.jpg';
const snap = (over) => Object.assign({ viewKey: 'view_4093', qaServed: true, type: 'Camera View', required: true,
  status: 'Pass', client: 'Pending', completed: true, imgUrl: IMG, needsQa: true }, over);
const open = (s) => { SCW.qaPopover.openAnchor(anchor, 'p1', s, () => {}); return modal(); };
const close = () => { const m = modal(); if (m && m.parentNode) m.parentNode.removeChild(m); const p = document.getElementById('scw-qa-popover'); if (p && p.parentNode) p.parentNode.removeChild(p); };
const hasClientRow = () => /client signoff/i.test(modal().textContent);
const chip = (label) => Array.from(modal().querySelectorAll('button, [role="button"], .scw-qa-chip'))
  .find(b => b.textContent.trim() === label) || null;
const photo = (over) => Object.assign({ id: 'p1', type: 'Camera View', required: true, completed: true,
  imgUrl: IMG, qaStatus: 'Pass', qaClient: 'Pending', qaPresent: true, qaColumns: true }, over);
const chitClass = (p) => {
  const strip = SCW.worksheetV2.photos.buildStripFromPhotos([p], 'li1', 'view_4093');
  const chit = strip && strip.querySelector('.scw-ws-v2-photo-qa-chit');
  return chit ? chit.className + ' | client=' + chit.getAttribute('data-qa-client') : '(no chit)';
};

(async () => {
  ok(SCW.CONFIG.PHOTO_CLIENT_SIGNOFF === false, 'the switch ships OFF in src/config.js');

  // ── OFF: a passed photo whose stored client sign-off is Pending ──
  ok(/is-done/.test(chitClass(photo())) && !/half-pass/.test(chitClass(photo())),
    'OFF: the strip chit of a Pass + client Pending photo reads done, not "Client pending" (' + chitClass(photo()) + ')');
  ok(/is-fail/.test(chitClass(photo({ qaStatus: 'Fail' }))) && /is-pending/.test(chitClass(photo({ qaStatus: 'Pending' }))),
    'OFF: Fail and Pending chits are unchanged');

  let m = open(snap());
  ok(!!m, 'the photo window opens for the passed photo');
  ok(!hasClientRow(), 'OFF: the window has no "Client signoff" row');
  ok(!chip('Approved') && !chip('Bypassed'), 'OFF: no Approved / Bypassed chips');
  ok(!!chip('Pass') && !!chip('Fail'), 'the QA Status chips are still there');

  close();

  // A photo still waiting on SCW, whose stored client sign-off is Pending: Pass alone completes it.
  m = open(snap({ status: 'Pending' }));
  ok(!hasClientRow(), 'OFF: no "Client signoff" row on a photo still waiting on SCW either');
  ajax.length = 0;
  chip('Pass').click();
  await tick(); await tick();
  const puts = ajax.filter(a => a.type === 'PUT').map(a => a.body || {});
  ok(puts.some(b => b.field_2859 === 'Pass'), 'OFF: Pass is saved (' + JSON.stringify(puts) + ')');
  ok(puts.length > 0 && puts.every(b => !('field_2860' in b)), 'OFF: the save never writes field_2860');
  ok(puts.some(b => b.field_2863), 'OFF: SCW\'s Pass alone stamps the sign-off date (the photo is complete)');
  ok(!!chip('Revert sign-off'), 'OFF: the window now offers Revert sign-off');
  close();

  // ── ON: the old behaviour comes back from the one switch ──
  SCW.CONFIG.PHOTO_CLIENT_SIGNOFF = true;
  ok(/half-pass/.test(chitClass(photo())), 'ON: the same photo reads "Client pending" again (' + chitClass(photo()) + ')');
  ok(/is-done/.test(chitClass(photo({ qaClient: 'Approved' }))), 'ON: client Approved reads done');
  m = open(snap());
  ok(hasClientRow() && !!chip('Approved') && !!chip('Bypassed'), 'ON: the window shows the Client signoff chips');
  close();
  m = open(snap({ client: 'N/A' }));
  ok(!hasClientRow(), 'ON: a photo whose client sign-off is N/A still shows no row');
  close();

  console.log('\n' + (n - fails) + '/' + n + ' passed');
  process.exit(fails ? 1 : 0);
})();
