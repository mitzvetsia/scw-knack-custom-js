// jsdom smoke test: the Issue Change Order modal refuses a recipient phone that is not a phone number
// (2026-11-02, "put a check on the issue CO modal that doesn't allow a submit if the phone number is
// garbled like that"). The live contract body broke on a contact whose Cell Phone (field_195) held a
// data fragment: '(845) 406-1685 xt":null,"full":"8454061685",…'. ops-stepper.js's recipient picker
// (view_4124) now flags such a contact in the dropdown, shows an amber note under Phone with the
// clean number to use, blocks submit while the input is unusable, waits for the contact write when
// the record's own phone was bad (and stops when that write does not land), and builds the payload
// label from the values it sends.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#proposal/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;

const GARBLED = '(845) 406-1685 xt":null,"full":"8454061685","country":null,"formatted":"(845) 406-1685"}';
function contact(id, first, last, phoneRaw, email) {
  return { attributes: { id,
    field_198: first + ' ' + last, field_198_raw: { first, last },
    field_195: phoneRaw ? phoneRaw.formatted : '', field_195_raw: phoneRaw,
    field_196: email, field_196_raw: { email } } };
}
window.Knack = { views: { view_4124: { model: { data: { models: [
  contact('c0000000000000000000000a', 'Jane', 'Garbled', { area: '845', number: '4061685',
    ext: 't":null,"full":"8454061685","country":null,"formatted":"(845) 406-1685"}', full: '8454061685',
    country: null, formatted: GARBLED }, 'jane@client.com'),
  contact('c0000000000000000000000b', 'Bob', 'Clean', { area: '212', number: '5550199', ext: '', full: '2125550199',
    country: null, formatted: '(212) 555-0199' }, 'bob@client.com')
] } } } }, router: { current_scene_key: 'scene_1096' } };
global.Knack = window.Knack;
const puts = [];
window.SCW = {
  CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackRecordUrl(v, id) { return 'https://api/' + v + '/' + id; },
  knackAjax(o) { puts.push(o); return { then() {} }; }
};
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/ops-stepper.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const api = window.SCW.opsStepper;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const tick = () => new Promise(r => setTimeout(r, 0));
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();

// ── the check itself ──
const P = api.phoneProblem;
check('the live garbled value is refused as stray data', /stray data/.test(P(GARBLED)), true);
check('ordinary US numbers pass, in every common shape, with or without an extension',
  ['(845) 406-1685', '845-406-1685', '845.406.1685', '8454061685', '1-845-406-1685', '+1 845 406 1685',
   '(845) 406-1685 x123', '(845) 406-1685 ext. 12', '+44 20 7946 0958'].map(P), ['', '', '', '', '', '', '', '', '']);
check('blank is not this check\'s call', [P(''), P(null), P('   ')], ['', '', '']);
check('a short number names its digit count', P('406-1685'), 'it has 7 digits — a US number needs 10, with the area code');
check('words, two numbers, "null" and a bad international number are refused',
  [/can’t carry/.test(P('Cell: 845-406-1685')), /can’t carry/.test(P('845-406-1685 / 845-555-1212')),
   /stray data/.test(P('null')), /8 to 15 digits/.test(P('+12'))], [true, true, true, true]);
const S = api.phoneSuggestion;
check('the clean number comes from the stored digits, else from the clean run the text starts with',
  [S({ full: '8454061685' }, GARBLED), S(null, GARBLED), S({ full: 'x', area: '845', number: '4061685' }, ''), S(null, 'abc'), S(null, '406-1685')],
  ['(845) 406-1685', '(845) 406-1685', '(845) 406-1685', '', '']);

// ── the modal ──
let submitted = null;
function openIssue() {
  document.querySelectorAll('.scw-ops-modal-overlay').forEach(o => o.remove());
  submitted = null; puts.length = 0;
  api._openModal({ title: 'Issue Change Order', submitLabel: 'Issue Change Order',
    recipient: { view: 'view_4124', required: true, fields: { name: 'field_198', phone: 'field_195', email: 'field_196' } }
  }, (notes, ctx) => { submitted = ctx; });
  const m = document.querySelector('.scw-ops-modal');
  return {
    sel: m.querySelector('select.scw-ops-modal-recipient'),
    phone: [...m.querySelectorAll('.scw-ops-modal-rcp-row')].find(r => /Phone/.test(r.textContent)).querySelector('input'),
    email: [...m.querySelectorAll('.scw-ops-modal-rcp-row')].find(r => /Email/.test(r.textContent)).querySelector('input'),
    warn: m.querySelector('.scw-ops-modal-rcp-warn'),
    err: m.querySelector('.scw-ops-modal-error'),
    submit: m.querySelector('.scw-ops-modal-submit')
  };
}
function pick(ui, id) { ui.sel.value = id; ui.sel.dispatchEvent(new window.Event('change')); }
function type(input, v) { input.value = v; input.dispatchEvent(new window.Event('input')); }
const shown = el => !!el && el.style.display !== 'none';

(async () => {
  let ui = openIssue();
  const optA = [...ui.sel.options].find(o => o.value === 'c0000000000000000000000a');
  check('the dropdown names the problem instead of showing the fragment',
    [optA.textContent, /xt"/.test(optA.textContent)], ['Jane Garbled — ⚠ phone needs fixing — jane@client.com', false]);

  pick(ui, 'c0000000000000000000000a');
  const fixBtn = ui.warn.querySelector('.scw-ops-modal-rcp-fix');
  check('choosing the contact shows the amber note under Phone with the clean number to use',
    [ui.phone.value === GARBLED, shown(ui.warn), /can’t go on the signature request/.test(txt(ui.warn)),
     fixBtn && fixBtn.textContent, ui.phone.classList.contains('is-invalid')],
    [true, true, true, 'Use (845) 406-1685', true]);

  ui.submit.click(); await tick();
  check('submit is refused while the phone is garbled: nothing written, nothing sent',
    [submitted, puts.length, shown(ui.err), /Fix the phone number before you submit/.test(txt(ui.err))], [null, 0, true, true]);

  fixBtn.click();
  check('"Use (845) 406-1685" fills the number and clears the note',
    [ui.phone.value, shown(ui.warn), ui.phone.classList.contains('is-invalid')], ['(845) 406-1685', false, false]);

  ui.submit.click(); await tick();
  check('the corrected phone is written to the contact first, and the CO waits for it',
    [puts.length, puts[0] && puts[0].url, puts[0] && JSON.parse(puts[0].data), puts[0] && puts[0].type, ui.submit.textContent, ui.submit.disabled, submitted],
    [1, 'https://api/view_4124/c0000000000000000000000a', { field_195: '(845) 406-1685' }, 'PUT', 'Saving contact…', true, null]);
  puts[0].success({ id: 'c0000000000000000000000a', field_195: '(845) 406-1685',
    field_195_raw: { area: '845', number: '4061685', ext: '', full: '8454061685', formatted: '(845) 406-1685' } });
  await tick();
  check('once the write lands the CO goes out with the clean number, and the label carries no fragment',
    [submitted && submitted.recipient.phone, submitted && submitted.recipient.label],
    ['(845) 406-1685', 'Jane Garbled — (845) 406-1685 — jane@client.com']);

  // The write is refused: the record still holds the fragment, so nothing goes out.
  ui = openIssue(); pick(ui, 'c0000000000000000000000a');
  ui.warn.querySelector('.scw-ops-modal-rcp-fix').click();
  ui.submit.click(); await tick();
  puts[0].error({ status: 403 }); await tick();
  check('a refused contact write stops the CO and says how to fix it',
    [submitted, /Couldn’t save the corrected phone number to the contact \(HTTP 403\)/.test(txt(ui.err)),
     /Fix the Cell Phone on the contact record in Knack/.test(txt(ui.err)), ui.submit.disabled, ui.submit.textContent],
    [null, true, true, false, 'Issue Change Order']);

  // A 200 that did not take (the column is not editable on the view) counts as not saved.
  ui = openIssue(); pick(ui, 'c0000000000000000000000a');
  ui.warn.querySelector('.scw-ops-modal-rcp-fix').click();
  ui.submit.click(); await tick();
  puts[0].success({ id: 'c0000000000000000000000a', field_195: GARBLED, field_195_raw: { formatted: GARBLED } }); await tick();
  check('a 200 whose record still reads the fragment is treated as not saved',
    [submitted, /\(not applied\)/.test(txt(ui.err))], [null, true]);

  // Typed by hand: a short number has no suggestion and stays blocked; clearing the field is allowed.
  ui = openIssue(); pick(ui, 'c0000000000000000000000a');
  type(ui.phone, '406-1685');
  check('a hand-typed short number warns with its digit count and offers nothing to use',
    [/7 digits/.test(txt(ui.warn)), !!ui.warn.querySelector('.scw-ops-modal-rcp-fix')], [true, false]);
  ui.submit.click(); await tick();
  check('and submit stays refused', [submitted, puts.length], [null, 0]);
  type(ui.phone, '');
  ui.submit.click(); await tick();
  check('clearing the garbled phone is a valid fix: the blank is written, then the CO goes out',
    [puts.length, puts[0] && JSON.parse(puts[0].data), submitted], [1, { field_195: '' }, null]);
  puts[0].success({ id: 'c0000000000000000000000a', field_195: '', field_195_raw: '' }); await tick();
  check('…with no phone on the recipient', submitted && submitted.recipient.phone, '');

  // A contact whose phone is fine: no note, no write, the CO goes straight out.
  ui = openIssue(); pick(ui, 'c0000000000000000000000b');
  check('a clean contact shows no note', [shown(ui.warn), ui.phone.classList.contains('is-invalid')], [false, false]);
  ui.submit.click(); await tick();
  check('and submits with no contact write', [puts.length, submitted && submitted.recipient.phone], [0, '(212) 555-0199']);

  // Same clean contact with an email edit whose write fails: non-fatal, as before.
  ui = openIssue(); pick(ui, 'c0000000000000000000000b');
  type(ui.email, 'bob.new@client.com');
  ui.submit.click(); await tick();
  puts[0].error({ status: 500 }); await tick();
  check('an ordinary edit that fails to save still lets the CO go out with the edited values',
    [JSON.parse(puts[0].data), submitted && submitted.recipient.email], [{ field_196: 'bob.new@client.com' }, 'bob.new@client.com']);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
