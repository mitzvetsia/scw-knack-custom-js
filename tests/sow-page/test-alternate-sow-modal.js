// jsdom test: Create Alternate SOW window (2026-11-03). "It is not obvious enough that we're creating an
// alternate SOW with SHARED options" and "swapping all the readers to a different type of reader — that's a
// LOT of clicks". Drives the real create-sow-option-btn.js: the shared-by-default band + counters + a chip
// on every row, the per-model swap (every location / picked locations), rows set by hand ("Set per row
// below"), the mounting-hardware check, the filters, the undo, and the link / clone payload.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#sales/scope-of-work-details/s0000000000000000000000a/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;

const READER = 'a1000000000000000000000a', READER2 = 'a2000000000000000000000a', HUB = 'a3000000000000000000000a';
const BRACKET = 'a4000000000000000000000a';
const B_READ = 'b1000000000000000000000b', B_HEAD = 'b2000000000000000000000b', B_MNT = 'b3000000000000000000000b';
const MDF = 'c1000000000000000000000c', IDF = 'c2000000000000000000000c';
let n = 0;
function li(label, product, productName, bucket, mdf, mdfLabel, parent) {
  n++;
  const id = 'ab' + String(n).padStart(22, '0');
  const a = { id, field_1950: label, field_1950_raw: label,
    field_1949_raw: [{ id: product, identifier: productName }],
    field_2219_raw: [{ id: bucket, identifier: bucket === B_READ ? 'Readers' : bucket === B_HEAD ? 'Headend' : 'Mounting Hardware' }],
    field_1946_raw: [{ id: mdf, identifier: mdfLabel }] };
  if (parent) a.field_2464_raw = [{ id: parent, identifier: 'parent' }];
  return { attributes: a };
}
const recs = [
  li('Door Hub (MDF)', HUB, 'Avigilon Alta 8 Door Hub', B_HEAD, MDF, 'HEADEND: 2nd Floor (Main) MDF'),
  li('AC-001', READER, 'Avigilon Alta Smart Door Reader Dual Freq', B_READ, MDF, 'HEADEND: 2nd Floor (Main) MDF'),
  li('AC-002', READER, 'Avigilon Alta Smart Door Reader Dual Freq', B_READ, MDF, 'HEADEND: 2nd Floor (Main) MDF'),
  li('AC-053', READER, 'Avigilon Alta Smart Door Reader Dual Freq', B_READ, IDF, 'IDF 01: 3rd Floor IDF West'),
  li('AC-054', READER, 'Avigilon Alta Smart Door Reader Dual Freq', B_READ, IDF, 'IDF 01: 3rd Floor IDF West')
];
// A bracket under AC-001 (an accessory: not a row of the window, but checked against the new model).
recs.push(li('Bracket', BRACKET, 'Wall bracket', B_MNT, MDF, 'HEADEND: 2nd Floor (Main) MDF', recs[1].attributes.id));
const ids = recs.map(r => r.attributes.id);

window.Knack = {
  views: {
    view_3586: { model: { data: { models: recs } } },
    view_3827: { model: { attributes: { id: 'd0000000000000000000000d', field_2122: '60486704913-SW1980',
      field_2126: 'Access control', field_1199_raw: [{ id: 'x', identifier: 'Install' }] } } }
  },
  getUserAttributes() { return { id: 'u1', name: 'Micah', email: 'm@example.com' }; }
};
global.Knack = window.Knack;
const posts = [];
window.fetch = (url, opts) => { posts.push({ url, body: JSON.parse(opts.body) });
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"success":true,"newSowUrl":"#sales/scope-of-work-details/new/"}') }); };
global.fetch = window.fetch;
window.SCW = {
  CONFIG: { MAKE_DUPLICATE_SOW_WEBHOOK: 'https://hook.example/dup' }, debug() {},
  onViewRender() {}, onSceneRender() {},
  productMap: {
    [READER]: { name: 'Avigilon Alta Smart Door Reader Dual Freq', buckets: [B_READ] },
    [READER2]: { name: 'Avigilon Alta Smart Reader Pro', buckets: [B_READ] },
    [HUB]: { name: 'Avigilon Alta 8 Door Hub', buckets: [B_HEAD] }
  },
  catalog: { fits(acc, parent) { return acc === BRACKET && parent === READER2 ? false : null; } }
};
global.SCW = window.SCW;
const alerts = []; window.alert = global.alert = (m) => { alerts.push(m); };
new Function('window', 'document', '$', 'Knack', 'SCW', 'fetch',
  fs.readFileSync(path.join(__dirname, '../../src/features/create-sow-option-btn.js'), 'utf8'))(
  window, document, jq, window.Knack, window.SCW, window.fetch);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const $1 = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const row = id => $1('[data-alt-row="' + id + '"]');
const chip = id => txt(row(id).querySelector('[data-alt-chip]'));
const counts = () => ['shared', 'copy', 'off'].map(k => txt($1('[data-alt-n-' + k + ']')));
function change(el) { el.dispatchEvent(new window.Event('change', { bubbles: true })); }
const readerRow = () => $1('[data-alt-model="' + READER + '"]');
const msel = () => readerRow().querySelector('[data-alt-msel]');

(async () => {
  window.SCW.createAltSow.open(null);

  // ── shared, said three ways ──
  check('the band says everything starts shared, naming this SOW',
    [/Everything starts shared/.test(txt($1('[data-alt-band]'))), /SOW 1980/.test(txt($1('[data-alt-band]'))),
     $1('[data-alt-band]').classList.contains('is-compact'), txt($1('.scw-alt-sow-sub'))],
    [true, true, false, 'Starts from SOW 1980 · Access control']);
  check('counters: 5 shared, 0 copies, 0 left off; the accessory is not a row', counts(), ['5', '0', '0']);
  check('every row says Shared', ids.slice(0, 5).map(chip), ['Shared', 'Shared', 'Shared', 'Shared', 'Shared']);
  check('the Create button carries the total', txt($1('[data-alt-go]')), 'Create alternate · 5 shared');

  // ── the model list ──
  check('models most-used first, with counts and locations',
    $$('[data-alt-model]').map(m => [txt(m.querySelector('.scw-alt-sow-mname')), txt(m.querySelector('.scw-alt-sow-mcount')),
      txt(m.querySelector('.scw-alt-sow-msub'))]),
    [['Avigilon Alta Smart Door Reader Dual Freq', '4 lines', 'Readers · 2 locations'],
     ['Avigilon Alta 8 Door Hub', '1 line', 'Headend · 1 location']]);
  check('the swap list offers the bucket\'s other models, not the one itself',
    [...msel().options].map(o => o.textContent), ['Keep this model (shared)', 'Set per row below', 'Avigilon Alta Smart Reader Pro']);

  // ── one choice swaps every reader ──
  msel().value = READER2; change(msel());
  check('every reader row now uses the new model and is a Copy that names what SOW 1980 keeps',
    [ids.slice(1, 5).map(id => row(id).querySelector('select').value), ids.slice(1, 5).map(chip),
     txt(row(ids[1]).querySelector('[data-alt-was]')), chip(ids[0])],
    [[READER2, READER2, READER2, READER2], ['Copy', 'Copy', 'Copy', 'Copy'],
     'SOW 1980 keeps: Avigilon Alta Smart Door Reader Dual Freq', 'Shared']);
  check('counters, the band folds to its legend, the button and the model row say it',
    [counts(), $1('[data-alt-band]').classList.contains('is-compact'), txt($1('[data-alt-go]')),
     readerRow().classList.contains('is-swapped'), txt(readerRow().querySelector('[data-alt-mcopies]'))],
    [['1', '4', '0'], true, 'Create alternate · 1 shared · 4 copies', true, '4 lines become copies']);
  check('the mounting hardware the catalog says does not fit is flagged in amber',
    txt(readerRow().querySelector('[data-alt-mwarn]')),
    'On 1 of these lines the attached mounting hardware isn’t listed as fitting the new model. Check it on the alternate.');

  // ── only some locations ──
  readerRow().querySelector('[data-alt-mscope][value=pick]').checked = true;
  change(readerRow().querySelector('[data-alt-mscope][value=pick]'));
  const idfBox = readerRow().querySelector('[data-alt-mloc="' + IDF + '"]');
  check('Pick locations shows the locations with their counts',
    [readerRow().querySelector('[data-alt-mlocs]').style.display, txt(readerRow().querySelector('[data-alt-mlocs]'))],
    ['', 'HEADEND: 2nd Floor (Main) MDF (2) IDF 01: 3rd Floor IDF West (2)']);
  idfBox.checked = false; change(idfBox);
  check('unticking the IDF keeps its readers shared; the swap still reads as the new model',
    [ids.slice(1, 5).map(chip), msel().value, counts(), txt(readerRow().querySelector('[data-alt-mcopies]'))],
    [['Copy', 'Copy', 'Shared', 'Shared'], READER2, ['3', '2', '0'], '2 lines become copies']);

  // ── a row set by hand ──
  const r1 = row(ids[1]).querySelector('select');
  r1.value = READER; change(r1);
  check('a row put back by hand makes the model row read "Set per row below"',
    [msel().value, chip(ids[1]), chip(ids[2])], ['__mixed', 'Shared', 'Copy']);

  // ── filters ──
  $1('[data-alt-filter="copy"]').click();
  check('the Copies filter shows only copies, hides empty locations, counts on the pills',
    [$$('[data-alt-row]:not(.is-hidden)').map(r => r.getAttribute('data-alt-row')),
     $$('.scw-alt-sow-grp:not(.is-hidden)').length, $$('[data-alt-filter]').map(txt)],
    [[ids[2]], 1, ['All 5', 'Shared 4', 'Copies 1', 'Left off 0']]);
  $1('[data-alt-filter="all"]').click();

  // ── leaving items off ──
  const cb = row(ids[0]).querySelector('input[type=checkbox]');
  cb.checked = false; change(cb);
  check('an unticked row is Left off and counted', [chip(ids[0]), counts()], ['Left off', ['3', '1', '1']]);

  // ── keep current model undoes the swap ──
  readerRow().querySelector('[data-alt-mkeep]').click();
  check('Keep current model puts every reader back to shared and the band opens again',
    [ids.slice(1, 5).map(chip), msel().value, readerRow().classList.contains('is-swapped'),
     $1('[data-alt-band]').classList.contains('is-compact')],
    [['Shared', 'Shared', 'Shared', 'Shared'], '', false, false]);

  // ── submit ──
  msel().value = READER2; change(msel());
  $1('[data-alt-go]').click();
  await new Promise(r => setTimeout(r, 20));
  const p = posts[0] && posts[0].body;
  check('the payload links the shared rows and clones the swapped ones; the left-off hub rides neither',
    [p && p.linkIds, p && p.sowLineItemIds, p && p.cloneItems.map(c => [c.sourceItemId, c.productId, c.productName, c.fromProductId]),
     p && p.sourceRecordId, alerts, !!$1('.scw-alt-sow-back')],
    [[], [], ids.slice(1, 5).map(id => [id, READER2, 'Avigilon Alta Smart Reader Pro', READER]), 'd0000000000000000000000d', [], false]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
