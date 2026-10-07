// jsdom smoke test: dto-form-submit-intercept.js takes over Submit on the bucket-filtered DTO
// forms (Add to Scope). It POSTs only the fields the selected bucket SHOWS (plus the bucket and
// any input the visibility module doesn't manage) through the form view's records endpoint with
// the parent crumbs, never Knack's own submit — so hidden required fields can't block it.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/P1/build-sow/S1/add-to-scope/S1' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.CSS = window.CSS || { escape: s => s };
if (!window.CSS) window.CSS = global.CSS;

const handlers = {};
function key(ev) { return ev.split('.').slice(0, 2).join('.'); }
const posts = []; const triggered = [];
const jqObj = {
  on(ev, fn) { ev.split(/\s+/).forEach(e => { (handlers[key(e)] = handlers[key(e)] || []).push(fn); }); return jqObj; },
  off() { return jqObj; },
  trigger(ev, args) { triggered.push(ev); (handlers[key(ev)] || []).forEach(fn => fn({ type: ev }, ...(args || []))); return jqObj; }
};
function jq() { return jqObj; }
window.$ = jq; global.$ = jq;
window.Knack = { views: { view_3329: {} }, api_url: 'https://api.knack.com', router: { current_scene_key: 'scene_1086' } }; global.Knack = window.Knack;
window.SCW = { knackAjax(o) { posts.push({ url: o.url, type: o.type, body: JSON.parse(o.data) }); o.success({ record: { id: 'dto1' } }); } };
global.SCW = window.SCW;
console.info = () => {};

new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/dto-form-submit-intercept.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const ASSUMP = '697b7a023a31502ec68b3303', MDF1 = '6abd0251e5d0b1ca628ebb94', SOW = '69dd0f8333dbe73a5cdfc652', CUST = '69ce7098172caa5786d3767d';
// The Add to Scope form with the Assumptions bucket selected: the visibility module has marked
// the bucket, SOW, optional MDF multi-select and assumption type visible; the mandatory MDF
// single-select, product and prefix fields (all REQUIRED in Knack) are hidden.
document.body.innerHTML = '<div id="kn-scene_1086"><div class="kn-form kn-view" id="view_3329"><form>' +
  '<div class="kn-input scw-visible" id="kn-input-field_2223" data-input-id="field_2223"><select id="view_3329-field_2223" name="field_2223"><option value="' + ASSUMP + '" selected>Assumptions</option></select></div>' +
  '<div class="kn-input scw-visible" id="kn-input-field_2182" data-input-id="field_2182"><label class="option checkbox"><input type="checkbox" name="field_2182" value="' + SOW + '" checked></label></div>' +
  '<div class="kn-input scw-visible" id="kn-input-field_2250" data-input-id="field_2250"><input type="checkbox" value="' + MDF1 + '" checked><input type="checkbox" value="6abd0286c3e527b8ea5499ef"></div>' +
  '<div class="kn-input scw-visible" id="kn-input-field_2248" data-input-id="field_2248"><select id="view_3329-field_2248" name="field_2248" multiple><option value="' + CUST + '" selected>Custom</option><option value="x1">Other</option></select></div>' +
  // hidden, required
  '<div class="kn-input" id="kn-input-field_2211" data-input-id="field_2211"><select id="view_3329-field_2211" name="field_2211"><option value=""></option></select></div>' +
  '<div class="kn-input" id="kn-input-field_2193" data-input-id="field_2193"><select id="view_3329-field_2193" name="field_2193"><option value=""></option></select></div>' +
  '<div class="kn-input" id="kn-input-field_2241" data-input-id="field_2241"><select id="view_3329-field_2241" name="field_2241"><option value=""></option></select></div>' +
  '<div class="kn-input" id="kn-input-field_2183" data-input-id="field_2183"><input id="field_2183" name="field_2183" type="text" value=""></div>' +
  '<div class="kn-submit"><input class="crumb" type="hidden" name="project-dashboard_id" value="P1"><input class="crumb" type="hidden" name="build-sow_id" value="S1">' +
  '<button class="kn-button is-primary" type="submit">Submit</button></div>' +
  '</form></div></div>';

(handlers['knack-view-render.view_3329'] || []).forEach(fn => fn());
const form = document.querySelector('#view_3329 form');
let knackSawSubmit = 0;
form.addEventListener('submit', () => { knackSawSubmit++; });   // stands in for Knack's own handler (bubble phase)

const c = SCW.dtoSubmitIntercept.collect(form);
check('collect: only the bucket-visible fields, hidden required ones skipped',
  [c.sent, c.skipped], [['field_2223', 'field_2182', 'field_2250', 'field_2248'], ['field_2211', 'field_2193', 'field_2241', 'field_2183']]);
check('values: single connection → [id]; checkbox connections → ids; multi-select → ids',
  c.body, { field_2223: [ASSUMP], field_2182: [SOW], field_2250: [MDF1], field_2248: [CUST] });

form.querySelector('button[type="submit"]').click();
check('Submit → one POST through the form view with the parent crumbs; Knack\'s own submit never runs',
  [posts.length, posts[0] && posts[0].url, posts[0] && posts[0].type, knackSawSubmit],
  [1, 'https://api.knack.com/v1/pages/scene_1086/views/view_3329/records?project-dashboard_id=P1&build-sow_id=S1', 'POST', 0]);
check('the POST body is the bucket-visible field set', Object.keys(posts[0].body), ['field_2223', 'field_2182', 'field_2250', 'field_2248']);
check('listeners for the form\'s submit / record-create still fire', triggered.filter(t => /view_3329/.test(t)), ['knack-form-submit.view_3329', 'knack-record-create.view_3329']);

setTimeout(() => {
  check('then the modal returns to the parent page (modal slug + id dropped from the hash)',
    window.location.hash, '#team-calendar/project-dashboard/P1/build-sow/S1');
  // Submit while a request is in flight is ignored; a failed POST shows the server's message and re-enables.
  window.SCW.knackAjax = o => { o.error({ status: 400, responseText: JSON.stringify({ errors: [{ message: 'Which SOWS are you adding to? is required.' }] }) }); };
  form.querySelector('button[type="submit"]').click();
  check('a server-side rejection is shown in the form and the button comes back',
    [document.querySelector('#view_3329 .scw-dto-msg').textContent, document.querySelector('#view_3329 button[type="submit"]').disabled],
    ['Could not add: Which SOWS are you adding to? is required.', false]);
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
}, 400);
