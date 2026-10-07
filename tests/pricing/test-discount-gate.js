// jsdom smoke test: pricing-discount-gate.js limits the Adjust Pricing forms by the logged-in
// user. Restricted users get Global Discount % clamped to 15 (over-limit submit blocked) and the
// Lump Sum form locked read-only with its submit hidden; allowed users are untouched.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
// Un-blocked submit clicks reach jsdom's unimplemented requestSubmit; keep that noise out of the log.
const vc = new VirtualConsole(); vc.on('error', () => {}); vc.on('warn', () => {}); vc.on('jsdomError', () => {});
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#x', virtualConsole: vc });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.CSS = window.CSS || { escape: s => s };
if (!window.CSS) window.CSS = global.CSS;

const handlers = {};
function key(ev) { return ev.split('.').slice(0, 2).join('.'); }
const jqObj = {
  on(ev, fn) { ev.split(/\s+/).forEach(e => { (handlers[key(e)] = handlers[key(e)] || []).push(fn); }); return jqObj; },
  off() { return jqObj; }, trigger() { return jqObj; }
};
function jq() { return jqObj; }
window.$ = jq; global.$ = jq;
let user = { id: 'u1', email: 'Rep.Person@getscw.com' };
window.Knack = { getUserAttributes: () => user }; global.Knack = window.Knack;
window.SCW = {}; global.SCW = window.SCW;
console.info = () => {};

new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/pricing-discount-gate.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const FORMS = '<div class="kn-form kn-view" id="view_3492"><form>' +
  '<div class="kn-input" id="kn-input-field_2276"><input class="input" id="field_2276" name="field_2276" type="text" value=""></div>' +
  '<div class="kn-submit"><button class="kn-button is-primary" type="submit">Update Global Discount %</button></div></form></div>' +
  '<div class="kn-form kn-view" id="view_3490"><form>' +
  '<div class="kn-input" id="kn-input-field_2290"><input class="input" id="field_2290" name="field_2290" type="text" value=""></div>' +
  '<div class="kn-input" id="kn-input-field_2291"><textarea id="field_2291" name="field_2291"></textarea></div>' +
  '<div class="kn-submit"><button class="kn-button is-primary" type="submit">Update Lump Sum Discount</button></div></form></div>';
const render = v => (handlers['knack-view-render.' + v] || []).forEach(fn => fn());
function knackSubmits(viewId) {   // stands in for Knack's own bubble-phase handlers
  const n = { submit: 0, click: 0 };
  const form = document.querySelector('#' + viewId + ' form');
  form.addEventListener('submit', () => { n.submit++; });
  form.querySelector('button[type="submit"]').addEventListener('click', () => { n.click++; });
  return n;
}

// ── Restricted user ──
document.body.innerHTML = FORMS;
render('view_3492'); render('view_3490');
const gSeen = knackSubmits('view_3492'), lSeen = knackSubmits('view_3490');
const gInput = document.getElementById('field_2276'), gBtn = document.querySelector('#view_3492 button');

gInput.value = '10'; gBtn.click();
check('restricted: 10% passes through to Knack (panel Enter path clicks the button)', [gSeen.click, !!document.querySelector('#view_3492 .scw-pricing-gate-note')], [1, false]);

gInput.value = '25'; gBtn.click();
check('restricted: 25% is clamped to 15, the submit is blocked, amber note shown',
  [gInput.value, gSeen.click, (document.querySelector('#view_3492 .scw-pricing-gate-note') || {}).textContent],
  ['15', 1, 'Global discounts above 15% need ops-management approval — the value was set to 15%. Press Enter to apply.']);
gBtn.click();
check('restricted: re-submitting the clamped 15% goes through and clears the note', [gSeen.click, !!document.querySelector('#view_3492 .scw-pricing-gate-note')], [2, false]);

gInput.value = '40'; gInput.dispatchEvent(new window.Event('change', { bubbles: true }));
check('restricted: leaving the field with 40% clamps before Enter', gInput.value, '15');

const lView = document.getElementById('view_3490');
check('restricted: lump sum form locked — readOnly inputs, locked class, note',
  [lView.classList.contains('scw-pricing-gate--locked'), document.getElementById('field_2290').readOnly, document.getElementById('field_2291').readOnly,
   (lView.querySelector('.scw-pricing-gate-note') || {}).textContent],
  [true, true, true, 'Lump sum discounts can only be entered by ops management.']);
document.getElementById('field_2290').value = '500';
document.querySelector('#view_3490 button').click();
document.querySelector('#view_3490 form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('restricted: lump sum submit (button or form) never reaches Knack', [lSeen.click, lSeen.submit], [0, 0]);
check('CSS injected once; hides the locked form\'s submit', [!!document.getElementById('scw-pricing-gate-css'), /scw-pricing-gate--locked \.kn-submit\{display:none/.test(document.getElementById('scw-pricing-gate-css').textContent)], [true, true]);

// ── Allowed user (case-insensitive) ──
user = { id: 'u2', email: 'Micah.Shearer@getscw.com' };
document.body.innerHTML = FORMS;
render('view_3492'); render('view_3490');
const aG = knackSubmits('view_3492'), aL = knackSubmits('view_3490');
document.getElementById('field_2276').value = '35'; document.querySelector('#view_3492 button').click();
document.getElementById('field_2290').value = '750'; document.querySelector('#view_3490 button').click();
check('allowed: 35% global discount and a lump sum both submit untouched',
  [document.getElementById('field_2276').value, aG.click, aL.click, document.getElementById('view_3490').classList.contains('scw-pricing-gate--locked'), document.getElementById('field_2290').readOnly],
  ['35', 1, 1, false, false]);

// ── No identity → restricted ──
user = null;
document.body.innerHTML = FORMS;
render('view_3490');
check('no user attributes → treated as restricted (lump sum locked)', document.getElementById('view_3490').classList.contains('scw-pricing-gate--locked'), true);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
