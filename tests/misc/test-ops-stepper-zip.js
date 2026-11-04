// jsdom test: "Post and/or Publish Final" stays locked while the project address has no zip code
// (2026-11-04). A final proposal is the one the client can accept, and the accept page now refuses
// a project address with no zip — so the Ops stepper on the proposal page (scene_1096) refuses to
// publish it first. Drives the real project-address-zip.js + ops-stepper.js: view_3349 "Project
// Address" with no zip → the step is locked with the reason on its tooltip, an amber line under the
// title, and a click-time refusal; a zip → the step is free (no sub bids on this SOW, so nothing else
// gates it); no address view on the page → fail open; a change order is never gated by it.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#proposal/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1096' }, getUserAttributes() { return { id: 'u1', name: 'Ops', email: 'ops@getscw.com' }; } };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackRecordUrl(v, id) { return 'https://api/' + v + '/' + id; }, knackAjax() { return { then() {} }; } };
global.SCW = window.SCW;
const alerts = []; window.alert = global.alert = (m) => { alerts.push(m); };
function detail(key, text) { return '<div class="kn-detail ' + key + '"><div class="kn-detail-body">' + text + '</div></div>'; }
function page(addr, type) {
  document.body.innerHTML =
    '<div class="kn-view" id="view_3345"></div>' +
    '<div class="kn-view kn-details" id="view_3861">' +
      detail('field_2952', type || 'base scope') + detail('field_2728', '0') +
    '</div>' +
    (addr === undefined ? '' : '<div class="kn-view kn-details" id="view_3349">' + detail('field_22', addr.html) + '</div>');
  window.Knack.views = { view_3861: { model: { attributes: { id: 'sow1' } } } };
  if (addr !== undefined) window.Knack.views.view_3349 = { model: { attributes: { id: 'p1', field_22: addr.html, field_22_raw: addr.raw } } };
}
const NO_ZIP = { html: '756 Fairview Rd<br />Asheville, NC', raw: { street: '756 Fairview Rd', city: 'Asheville', state: 'NC', zip: '' } };
const WITH_ZIP = { html: '756 Fairview Rd<br />Asheville, NC 28803', raw: { street: '756 Fairview Rd', city: 'Asheville', state: 'NC', zip: '28803' } };
page(NO_ZIP);
for (const f of ['project-address-zip.js', 'ops-stepper.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const step = () => [...document.querySelectorAll('#view_3345 .scw-step-action')].find(a => /Publish Final/.test(a.textContent));
const zipLine = () => document.querySelector('#view_3345 [data-scw-ops-zip]');
const rerender = () => (handlers['knack-view-render.view_3349.scwOpsStepper'] || []).forEach(fn => fn());

(async () => {
  await sleep(260);
  check('no zip: Publish Final is locked, the tooltip and an amber line say why',
    [!!step(), step() && step().classList.contains('is-disabled'), /no zip code \(756 Fairview Rd, Asheville, NC\)/.test(step() && step().title),
     /Publish Final is locked\. The project address has no zip code/.test(txt(zipLine()))],
    [true, true, true, true]);
  check('the reason is exported for tooling', /no zip code/.test(window.SCW.opsStepper.zipBlockReason()), true);

  page({ html: '', raw: '' });
  rerender();
  await sleep(260);
  check('no address at all: locked, says the project has no address', [step().classList.contains('is-disabled'), /The project has no address/.test(txt(zipLine()))], [true, true]);

  page(WITH_ZIP);
  rerender();
  await sleep(260);
  check('a zip: Publish Final is free (no sub bids on this SOW), no amber line', [step().classList.contains('is-disabled'), !!zipLine(), window.SCW.opsStepper.zipBlockReason()], [false, false, '']);

  page(undefined);
  rerender();
  await sleep(260);
  check('no address view on the page: fail open', [step().classList.contains('is-disabled'), !!zipLine()], [false, false]);

  page(NO_ZIP, 'change order');
  rerender();
  await sleep(260);
  check('a change order: no amber line (its steps are its own)', !!zipLine(), false);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
