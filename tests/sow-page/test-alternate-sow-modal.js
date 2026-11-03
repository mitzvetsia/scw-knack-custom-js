// jsdom test: Create Alternate SOW window (2026-11-03). "It is not obvious enough that we're creating an
// alternate SOW with SHARED options" and "swapping all the readers to a different type of reader — that's a
// LOT of clicks". Drives the real create-sow-option-btn.js: the shared-by-default band + counters + a chip
// on every row, the per-model swap (all lines / picked locations or lines — offered BEFORE a model is chosen: location ticks, single lines,
// shift-click — "change 100 of these 188 readers"; no typed line range), rows set by hand (mirrored in the picker;
// "Set per row below" for two new models), the mounting-hardware check, the filters, the undo, and the
// link / clone payload.
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
const READER3 = 'a5000000000000000000000a';
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
    [READER3]: { name: 'Avigilon Alta Smart Reader Mini', buckets: [B_READ] },
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
    [...msel().options].map(o => o.textContent), ['Keep this model (shared)', 'Set per row below', 'Avigilon Alta Smart Reader Mini', 'Avigilon Alta Smart Reader Pro']);

  // ── which lines BEFORE a model is chosen ("I don't know I get this until I select a different model") ──
  check('every model with 2+ lines shows Which lines from the start; a one-line model does not; Keep is hidden',
    [readerRow().querySelector('[data-alt-mmore]').style.display, txt(readerRow().querySelector('[data-alt-mmore]')).slice(0, 11),
     $1('[data-alt-model="' + HUB + '"] [data-alt-mmore]').style.display, readerRow().querySelector('[data-alt-mkeep]').style.display],
    ['', 'Which lines', 'none', 'none']);
  const pickFirst = readerRow().querySelector('[data-alt-mscope][value=pick]');
  pickFirst.checked = true; change(pickFirst);
  const idfFirst = readerRow().querySelector('[data-alt-mloc="' + IDF + '"]');
  idfFirst.checked = true; change(idfFirst);
  check('pick first: the IDF lines are ticked, nothing is a copy yet, the row says what comes next',
    [readerRow().querySelector('[data-alt-mlocs]').style.display, txt(readerRow().querySelector('[data-alt-mpick-n]')), counts(),
     txt(readerRow().querySelector('[data-alt-mcopies]'))],
    ['', '2 of 4 lines picked', ['5', '0', '0'], 'Now choose the new model for these 2 lines']);
  msel().value = READER2; change(msel());
  check('then the model: only the picked lines become copies',
    [ids.slice(1, 5).map(chip), counts(), txt(readerRow().querySelector('[data-alt-mcopies]'))],
    [['Shared', 'Shared', 'Copy', 'Copy'], ['3', '2', '0'], '2 lines become copies']);
  readerRow().querySelector('[data-alt-mkeep]').click();
  check('Keep current model puts them back and returns to All lines',
    [ids.slice(1, 5).map(chip), readerRow().querySelector('[data-alt-mscope][value=all]').checked, readerRow().querySelector('[data-alt-mkeep]').style.display],
    [['Shared', 'Shared', 'Shared', 'Shared'], true, 'none']);

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

  // ── only some locations or lines ("change 100 of these 188 readers") ──
  const pickRadio = readerRow().querySelector('[data-alt-mscope][value=pick]');
  check('the swap offers all lines or a pick',
    [...readerRow().querySelectorAll('[data-alt-mscope-wrap]')].map(txt), ['Which lines', 'All 4 lines', 'Pick locations or lines…']);
  check('a one-line model has no picker', !!$1('[data-alt-model="' + HUB + '"] [data-alt-mlocs]'), false);
  pickRadio.checked = true; change(pickRadio);
  const picker = () => readerRow().querySelector('[data-alt-mlocs]');
  const locN = () => [...readerRow().querySelectorAll('[data-alt-mloc-n]')].map(txt);
  const pickN = () => txt(readerRow().querySelector('[data-alt-mpick-n]'));
  const reader4 = () => ids.slice(1, 5).map(chip);
  check('Pick opens empty: nothing is a copy until a line is ticked; the swap still names the new model',
    [picker().style.display, pickN(), locN(), counts(), msel().value, readerRow().classList.contains('is-swapped')],
    ['', '0 of 4 lines picked', ['0 of 2', '0 of 2'], ['5', '0', '0'], READER2, true]);
  const idfBox = readerRow().querySelector('[data-alt-mloc="' + IDF + '"]');
  const mdfBox = readerRow().querySelector('[data-alt-mloc="' + MDF + '"]');
  idfBox.checked = true; change(idfBox);
  check('ticking a location takes every line in it',
    [reader4(), pickN(), locN(), counts(), txt(readerRow().querySelector('[data-alt-mcopies]'))],
    [['Shared', 'Shared', 'Copy', 'Copy'], '2 of 4 lines picked', ['0 of 2', '2 of 2'], ['3', '2', '0'], '2 lines become copies']);
  const line = id => readerRow().querySelector('[data-alt-mline="' + id + '"]');
  const locOf = id => line(id).closest('.scw-alt-sow-mloc');
  check('locations start folded (more than one location)', [locOf(ids[1]).classList.contains('is-open'), locOf(ids[3]).classList.contains('is-open')], [false, false]);
  locOf(ids[1]).querySelector('[data-alt-mloc-x]').click();
  line(ids[1]).click();
  check('one line on its own: the location box goes partial',
    [reader4(), pickN(), locN(), mdfBox.indeterminate, locOf(ids[1]).classList.contains('is-open')],
    [['Copy', 'Shared', 'Copy', 'Copy'], '3 of 4 lines picked', ['1 of 2', '2 of 2'], true, true]);
  readerRow().querySelector('[data-alt-mpick-set="0"]').click();
  check('Untick all puts every line back to shared', [reader4(), pickN(), counts()], [['Shared', 'Shared', 'Shared', 'Shared'], '0 of 4 lines picked', ['5', '0', '0']]);
  locOf(ids[3]).querySelector('[data-alt-mloc-x]').click();
  line(ids[1]).click();
  line(ids[4]).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
  check('shift-click ticks every open line between the two clicks', [reader4(), pickN()], [['Copy', 'Copy', 'Copy', 'Copy'], '4 of 4 lines picked']);
  readerRow().querySelector('[data-alt-mpick-set="0"]').click();
  line(ids[1]).click(); line(ids[2]).click(); line(ids[3]).click();
  check('single lines ticked one by one; no typed line range anywhere',
    [reader4(), pickN(), !!readerRow().querySelector('[data-alt-mfrom], [data-alt-mto], [data-alt-mrange]')],
    [['Copy', 'Copy', 'Copy', 'Shared'], '3 of 4 lines picked', false]);

  // ── rows set by hand ──
  const r4 = row(ids[4]).querySelector('select');
  r4.value = READER2; change(r4);
  check('a row set by hand to the same model shows up ticked in the picker', [pickN(), msel().value, chip(ids[4])], ['4 of 4 lines picked', READER2, 'Copy']);
  r4.value = READER; change(r4);
  const r1 = row(ids[1]).querySelector('select');
  r1.value = READER3; change(r1);
  check('two different new models: the model row reads "Set per row below" and the picker steps aside',
    [msel().value, picker().style.display, chip(ids[1]), chip(ids[2])], ['__mixed', 'none', 'Copy', 'Copy']);
  r1.value = READER; change(r1);

  // ── filters ──
  $1('[data-alt-filter="copy"]').click();
  check('the Copies filter shows only copies, hides empty locations, counts on the pills',
    [$$('[data-alt-row]:not(.is-hidden)').map(r => r.getAttribute('data-alt-row')),
     $$('.scw-alt-sow-grp:not(.is-hidden)').length, $$('[data-alt-filter]').map(txt)],
    [[ids[2], ids[3]], 2, ['All 5', 'Shared 3', 'Copies 2', 'Left off 0']]);
  $1('[data-alt-filter="all"]').click();

  // ── leaving items off ──
  const cb = row(ids[0]).querySelector('input[type=checkbox]');
  cb.checked = false; change(cb);
  check('an unticked row is Left off and counted', [chip(ids[0]), counts()], ['Left off', ['2', '2', '1']]);

  // ── keep current model undoes the swap ──
  readerRow().querySelector('[data-alt-mkeep]').click();
  check('Keep current model puts every reader back to shared and the band opens again',
    [ids.slice(1, 5).map(chip), msel().value, readerRow().classList.contains('is-swapped'),
     $1('[data-alt-band]').classList.contains('is-compact')],
    [['Shared', 'Shared', 'Shared', 'Shared'], '', false, false]);

  // ── the rows are the truth: one row set by hand puts the model row into Pick with that line ticked ──
  const r2 = row(ids[2]).querySelector('select');
  r2.value = READER2; change(r2);
  check('one row set by hand: the model row names the model and the picker holds that line',
    [msel().value, readerRow().querySelector('[data-alt-mscope][value=pick]').checked, picker().style.display, pickN(), reader4()],
    [READER2, true, '', '1 of 4 lines picked', ['Shared', 'Copy', 'Shared', 'Shared']]);
  readerRow().querySelector('[data-alt-mkeep]').click();
  check('Keep current model again: all lines, all shared', [readerRow().querySelector('[data-alt-mscope][value=all]').checked, reader4()],
    [true, ['Shared', 'Shared', 'Shared', 'Shared']]);

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
