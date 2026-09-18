// jsdom smoke test: accept-proposal-guard.js keeps a rep from accepting a proposal twice on the
// accept form page (#…/accept-proposal3/<id>): the submit button locks after the first click, the
// form submit trips a per-browser wire the proposal page's CTA gate also reads, and a record check
// through the proposal page's detail view (field_2990) replaces the form with a notice.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ID = 'c3c3c3c3c3c3c3c3c3c3c3c3';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#project-proposal/view-proposal/' + ID + '/accept-proposal3/' + ID });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
window.HTMLFormElement.prototype.requestSubmit = function () {};   // jsdom stub: a submit click's activation behavior
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
let count = 0; const gets = [];
window.Knack = { views: {}, router: { current_scene_key: 'scene_9999' }, api_url: 'https://api.knack.com', application_id: 'app', getUserToken() { return 't'; } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, knackAjax(o) { gets.push(o.url); const rec = { id: ID }; rec.field_2990 = String(count); o.success(rec); } };
global.SCW = window.SCW;
for (const f of ['published-proposal-render.js', 'accept-proposal-guard.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
function scene() {
  document.body.innerHTML = '<div id="kn-scene_9999" class="kn-scene"><h1>Accept</h1><div class="kn-view kn-form" id="view_9001"><form><input name="x"><div class="kn-submit"><button type="submit" class="kn-button is-primary">Submit</button></div></form></div></div>';
  (handlers['knack-scene-render.any.scwAcceptGuard'] || []).forEach(fn => fn());
}
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const A = window.SCW.proposalAccept;
check('one reading of accepted, shared by the proposal page and the guard', [typeof A.isAcceptedCount, A.isAcceptedCount(A.readAcceptCount({ field_2990: '2' })), A.isAcceptedCount(A.readAcceptCount({ field_2990: '1' })), A.isAcceptedCount(A.readAcceptCount({}))], ['function', true, false, false]);
scene();
setTimeout(() => {
  const form = () => document.getElementById('view_9001');
  check('not accepted: the form stands, the record was checked through the proposal page\'s view', [form().classList.contains('scw-accept-guard-hidden'), !!document.getElementById('scw-accept-guard-notice'), gets[0]], [false, false, 'https://api.knack.com/v1/pages/scene_1279/views/view_3813/records/' + ID]);
  const btn = form().querySelector('button[type="submit"]');
  const click = () => { const e = new window.MouseEvent('click', { bubbles: true, cancelable: true }); btn.dispatchEvent(e); return e.defaultPrevented; };
  check('submit once: the first click goes through, a second click inside the window is swallowed', [click(), click()], [false, true]);
  // The acceptance went in → the wire trips for this browser.
  (handlers['knack-form-submit.any.scwAcceptGuard'] || []).forEach(fn => fn({}, {}, {}));
  check('form submit trips the per-browser wire for this proposal', !!window.localStorage.getItem('scw:proposal-accepted:' + ID), true);
  scene();   // Back / reload / second tab: same page again
  setTimeout(() => {
    const notice = document.getElementById('scw-accept-guard-notice');
    check('re-rendered with the wire tripped: form replaced by the notice, link back to the proposal', [form().classList.contains('scw-accept-guard-hidden'), !!notice, notice && notice.querySelector('a').getAttribute('href')], [true, true, '#project-proposal/view-proposal/' + ID + '/']);
    // Another browser (no wire) but the record already counts as accepted.
    window.localStorage.clear(); count = 2; gets.length = 0;
    scene();
    setTimeout(() => {
      check('record check: field_2990 says accepted → form replaced even with no wire', [form().classList.contains('scw-accept-guard-hidden'), !!document.getElementById('scw-accept-guard-notice'), gets.length], [true, true, 1]);
      console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
      process.exit(fails ? 1 : 0);
    }, 120);
  }, 120);
}, 120);
