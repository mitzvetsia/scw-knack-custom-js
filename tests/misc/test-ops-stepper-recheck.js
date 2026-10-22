// jsdom smoke test: the proposal page's Ops stepper re-reads the SOW before insisting there is no
// basis bid (2026-10-22, "the quote previews tell me a basis bid has not been selected, though it
// has"). ops-stepper.js gates Publish as Final on the SOW record as view_3861 rendered it; a basis
// saved on the Bid Review page moments earlier can trail that render. Now: a blocked render
// schedules ONE automatic re-read (view-scoped GET) and the banner carries a Re-check button; the
// fresh record outranks the DOM for the basis connection and the snapshot.
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
let fresh = null;                 // what the view-scoped GET returns for the current record
const gets = [];
window.SCW = {
  CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackRecordUrl(v, id) { return 'https://api/' + v + '/' + id; },
  knackAjax(o) { gets.push(o.url); setTimeout(() => o.success(fresh), 5); return { then() {} }; }
};
global.SCW = window.SCW;
function detail(key, text) { return '<div class="kn-detail ' + key + '"><div class="kn-detail-body">' + text + '</div></div>'; }
function page(recordId) {
  document.body.innerHTML =
    '<div class="kn-view" id="view_3345"></div>' +
    '<div class="kn-view kn-details" id="view_3861">' +
      detail('field_2952', 'base scope') + detail('field_2728', '1') + detail('field_2706', 'Yes') + detail('field_2723', 'Yes') +
      detail('field_2941', '') + detail('field_2942', '') +           // the render that trails the basis pick
    '</div>';
  window.Knack.views.view_3861 = { model: { attributes: { id: recordId, field_2941: '', field_2941_raw: '' } } };
}
page('sow1');
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/ops-stepper.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
// 300 ms: long enough that the test's own timers (check the blocked render at +260, then swap in
// the fresh record) always run BEFORE the automatic re-read, whatever the first render costs.
window.SCW.opsStepper.setRecheckDelay(300);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const block = () => document.querySelector('#view_3345 .scw-ops-subbid__block');
const publishStep = () => [...document.querySelectorAll('#view_3345 .scw-step-action')].find(a => /Publish Final/.test(a.textContent));
const renderNow = () => (handlers['knack-view-render.view_3861.scwOpsStepper'] || []).forEach(fn => fn());

(async () => {
  await sleep(260);                                  // the module renders 200 ms after load when the host exists
  check('rendered from the trailing DOM: Publish Final is blocked for want of a basis, with a Re-check on the banner',
    [/Select the basis bid/.test(txt(block())), !!(block() && block().querySelector('[data-scw-ops-recheck]')), publishStep() && publishStep().classList.contains('is-disabled')],
    [true, true, true]);
  // The record meanwhile carries the basis (the Bid Review page's PUT landed): the automatic re-read picks it up.
  fresh = { id: 'sow1', field_2942: 'Bid 8', field_2942_raw: [{ id: '6a2c0001000000000000bid8', identifier: 'Bid 8' }], field_2941: '', field_2941_raw: '' };
  await sleep(360);                                  // the automatic re-read fires 300 ms after the blocked render
  check('one automatic re-read through the view, and the gate opens: no block, the basis named, Publish Final clickable',
    [gets, !block(), txt(document.querySelector('#view_3345 .scw-ops-subbid__basis')), publishStep() && !publishStep().classList.contains('is-disabled'),
     /Basis bid selected on the Bid Review page/.test(txt(document.querySelector('#view_3345 .scw-ops-subbid__empty')))],
    [['https://api/view_3861/sow1'], true, 'Bid 8', true, true]);
  await sleep(400);
  check('no second automatic re-read for the same record', gets.length, 1);

  // Another SOW whose record really has no basis yet: the auto re-read confirms the block; the user's Re-check later finds it.
  page('sow2');
  fresh = { id: 'sow2', field_2942: '', field_2942_raw: [], field_2941: '', field_2941_raw: '' };
  renderNow();
  await sleep(620);                                  // render at +200, its automatic re-read at +500
  check('a genuinely basis-less SOW stays blocked after its automatic re-read (fresh record outranks nothing here)',
    [gets.length, /Select the basis bid/.test(txt(block()))], [2, true]);
  fresh = { id: 'sow2', field_2942: 'Bid 9', field_2942_raw: [{ id: '6a2c0001000000000000bid9', identifier: 'Bid 9' }], field_2941: '', field_2941_raw: '' };
  block().querySelector('[data-scw-ops-recheck]').click();
  check('Re-check disables itself while the read runs', block().querySelector('[data-scw-ops-recheck]').disabled, true);
  await sleep(40);
  check('the Re-check re-read finds the basis and unblocks', [gets.length, !block(), txt(document.querySelector('#view_3345 .scw-ops-subbid__basis'))], [3, true, 'Bid 9']);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
