// jsdom test: a proposal cannot be accepted while the project address has no zip code (2026-11-04,
// "block the acceptance of a proposal if there is no zip code in the project address"). Drives the
// real project-address-zip.js (SCW.projectZip: model first, rendered text second, a five-digit street
// number is never a zip, views left over from another page are skipped) and accept-proposal-guard.js
// on the accept form page (#…/accept-proposal3/<id>): no project view on the page → the form stands
// and the console names the Builder step once; a zip → the form stands; no zip / no address → the
// form is replaced by an amber notice (address on file, a staff line for @getscw.com logins only, a
// link back), the source view is hidden, and a submit is refused at capture; "already accepted" wins.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const ID = 'c3c3c3c3c3c3c3c3c3c3c3c3';
const vc = new VirtualConsole(); vc.sendTo(console, { omitJSDOMErrors: true });
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#project-proposal/view-proposal/' + ID + '/accept-proposal3/' + ID, virtualConsole: vc });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
let user = 'No user found';
window.Knack = { views: {}, router: { current_scene_key: 'scene_1324' }, api_url: 'https://api.knack.com', application_id: 'app',
  getUserToken() { return 't'; }, getUserAttributes() { return user; } };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, knackAjax(o) { o.success({ id: ID, field_2990: '0' }); } };
global.SCW = window.SCW;
const warns = [];
const realWarn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };
for (const f of ['project-address-zip.js', 'published-proposal-render.js', 'accept-proposal-guard.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  realWarn.call(console, '');
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Z = window.SCW.projectZip;

// A page: the accept form, plus (optionally) a details view of the project showing field_22.
function page(addr) {
  const proj = addr === undefined ? '' :
    '<div class="kn-view kn-details" id="view_9002"><div class="kn-detail field_22"><div class="kn-detail-body">' +
    (addr ? addr.html : '') + '</div></div></div>';
  document.body.innerHTML = '<div id="kn-scene_1324" class="kn-scene"><h1>Accept</h1>' +
    '<div class="kn-view kn-form" id="view_4043"><form><input name="x"><div class="kn-submit">' +
    '<button type="submit" class="kn-button is-primary">Submit</button></div></form></div>' + proj + '</div>';
  window.Knack.views = {};
  if (addr !== undefined) window.Knack.views.view_9002 = { model: { attributes: { id: 'p1', field_22: addr ? addr.html : '', field_22_raw: addr ? addr.raw : '' } } };
  (handlers['knack-scene-render.any.scwAcceptGuard'] || []).forEach(fn => fn());
}
const form = () => document.getElementById('view_4043');
const notice = () => document.getElementById('scw-accept-zip-notice');
const submitClick = () => { const b = form().querySelector('button[type="submit"]'); const e = new window.MouseEvent('click', { bubbles: true, cancelable: true }); b.dispatchEvent(e); return e.defaultPrevented; };
const NO_ZIP = { html: '756 Fairview Rd<br />Asheville, NC', raw: { street: '756 Fairview Rd', city: 'Asheville', state: 'NC', zip: '' } };
const WITH_ZIP = { html: '756 Fairview Rd<br />Asheville, NC 28803', raw: { street: '756 Fairview Rd', city: 'Asheville', state: 'NC', zip: '28803' } };

(async () => {
  // ── the reader ──
  document.body.innerHTML = '';
  window.Knack.views = { view_1: { model: { attributes: { field_22_raw: { zip: '28803' } } } } };
  check('a view left over from another page (not in the DOM) is not read', Z.read().state, 'unknown');
  document.body.innerHTML = '<div id="view_1"></div>';
  check('model raw zip → ok', [Z.read().state, Z.read().zip, Z.read().source], ['ok', '28803', 'model']);
  window.Knack.views.view_1.model.attributes = { field_22: '12 Elm St<br />Asheville, NC', field_22_raw: { street: '12 Elm St', city: 'Asheville', state: 'NC', zip: ' ' } };
  check('model raw with a blank zip → missing, address named', [Z.read().state, Z.read().address, Z.read().blank], ['missing', '12 Elm St, Asheville, NC', false]);
  window.Knack.views.view_1.model.attributes = { field_22: '', field_22_raw: '' };
  check('a blank address → missing and blank', [Z.read().state, Z.read().blank], ['missing', true]);
  window.Knack.views = {};
  document.body.innerHTML = '<div class="kn-view" id="view_2"><div class="kn-detail field_22"><div class="kn-detail-body">12345 Main St<br>Asheville, NC</div></div></div>';
  check('rendered text: a five-digit street number is not a zip', [Z.read().state, Z.read().source], ['missing', 'dom']);
  document.body.innerHTML = '<div class="kn-view" id="view_2"><div class="kn-detail field_22"><div class="kn-detail-body">12345 Main St<br>Asheville, NC 28803-1234, USA</div></div></div>';
  check('rendered text: zip+4 before a trailing country → ok', [Z.read().state, Z.read().zip], ['ok', '28803-1234']);
  check('zipFromText on one line', [Z.zipFromText('9 Oak Ave, Austin, TX 78701'), Z.zipFromText('9 Oak Ave, Austin, TX')], ['78701', '']);

  // ── the accept page ──
  page(undefined);
  await sleep(120);
  check('no project view on the page: the form stands, no notice, the console names the Builder step once',
    [form().classList.contains('scw-accept-zip-hidden'), !!notice(), warns.filter(w => /no project address \(field_22\)/.test(w)).length, submitClick()],
    [false, false, 1, false]);
  page(undefined);
  await sleep(120);
  check('…and only once per page load', warns.filter(w => /no project address \(field_22\)/.test(w)).length, 1);

  page(WITH_ZIP);
  await sleep(120);
  check('a zip on the project address: the form stands; the address view is hidden', [form().classList.contains('scw-accept-zip-hidden'), !!notice(),
    document.getElementById('view_9002').classList.contains('scw-accept-zip-src')], [false, false, true]);

  page(NO_ZIP);
  await sleep(120);
  check('no zip: the form is replaced by the notice, naming the address, with a link back and no staff line for the client',
    [form().classList.contains('scw-accept-zip-hidden'), /can’t be accepted yet/.test(txt(notice())), /missing its zip code/.test(txt(notice())),
     txt(notice().querySelector('.scw-accept-zip-addr')), notice().querySelector('a').getAttribute('href'), !!notice().querySelector('.scw-accept-zip-staff'),
     notice().getAttribute('role')],
    [true, true, true, 'Address on file: 756 Fairview Rd, Asheville, NC', '#project-proposal/view-proposal/' + ID + '/', false, 'alert']);
  form().classList.remove('scw-accept-zip-hidden');            // even if the form were showing…
  check('…a submit is refused at capture', submitClick(), true);

  user = { id: 'u1', email: 'ops@getscw.com' };
  page(NO_ZIP);
  await sleep(120);
  check('an SCW staff login also gets the fix', /add the zip code to the project’s Address/.test(txt(notice().querySelector('.scw-accept-zip-staff'))), true);
  user = 'No user found';

  page({ html: '', raw: '' });
  await sleep(120);
  check('no address at all: says so', [/no project address on file/.test(txt(notice())), !notice().querySelector('.scw-accept-zip-addr')], [true, true]);

  // The zip lands (the view re-renders with it): the gate lifts.
  window.Knack.views.view_9002.model.attributes = { field_22: WITH_ZIP.html, field_22_raw: WITH_ZIP.raw };
  (handlers['knack-view-render.any.scwAcceptGuard'] || []).forEach(fn => fn());
  await sleep(120);
  check('the zip added and the view re-rendered: the notice goes, the form returns', [!!notice(), form().classList.contains('scw-accept-zip-hidden')], [false, false]);

  // Already accepted wins: the accepted notice, never the zip one.
  window.localStorage.setItem('scw:proposal-accepted:' + ID, new Date().toISOString());
  page(NO_ZIP);
  await sleep(120);
  check('already accepted: the accepted notice shows, the zip notice does not', [!!document.getElementById('scw-accept-guard-notice'), !!notice()], [true, false]);

  console.warn = realWarn;
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.warn = realWarn; console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
