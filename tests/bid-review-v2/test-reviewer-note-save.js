// jsdom smoke test: the sub-bid diff panel's reviewer note persists reliably (2026-10-20,
// "this field is not reliably saving for folks"). The note rides the field_2941 snapshot blob and
// used to save ONLY on the textarea's blur. Covered here, driving the real sub-bid-diff/render.js:
//   1. typing persists after a short idle (no blur needed) and keeps a per-device draft meanwhile;
//   2. a successful write mirrors the blob onto the local model and retires the draft;
//   3. the write re-reads the record first: a note another tab saved is kept when this tab has no
//      in-session edit (a data-only change here no longer writes the stale note back);
//   4. a permanent write failure stops retrying and is shown in the bar, and a content change
//      re-arms the save;
//   5. a stored blob whose NOTE contains '<' still parses (the old tag-stripping parser lost it);
//   6. a SOW whose basis is only the Builder-assigned default still saves the note — as a note-only
//      blob (no basis id, no field_2942), so the award gesture and the publish gate are untouched; an
//      empty note on such a SOW writes nothing.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155"></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#review-bids/6a2c00010000000000001111' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const store = new Map();
const ls = { getItem(k) { return store.has(k) ? store.get(k) : null; }, setItem(k, v) { store.set(k, String(v)); }, removeItem(k) { store.delete(k); } };
Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
global.localStorage = ls;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;

// ── ajax stub: GET answers from `remote` (per SOW), PUT records bodies and succeeds / fails ──
const puts = [], gets = [];
let remote = Object.create(null), putMode = 'ok';
window.SCW = {
  CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackRecordUrl(v, id) { return 'https://api/' + v + '/' + id; },
  knackAjax(o) {
    const sowId = o.url.split('/').pop();
    if (o.type === 'GET') {
      gets.push(sowId);
      setTimeout(() => o.success({ record: { id: sowId, field_2941_raw: remote[sowId] || '' } }), 3);
      return { then() {} };
    }
    const body = JSON.parse(o.data);
    puts.push({ sowId, body, note: JSON.parse(body.field_2941).note });
    return new Promise((res, rej) => setTimeout(() => putMode === 'ok' ? res({}) : rej({ status: 403 }), 3));
  }
};
global.SCW = window.SCW;
function load(f) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
for (const f of ['bid-review/config.js', 'bid-review-v2/config.js', 'bid-review-v2/transform.js', 'bid-review-v2/card.js',
  'sub-bid-diff/config.js', 'sub-bid-diff/pdf-html.js', 'sub-bid-diff/render.js']) load(f);
const T = window.SCW.bidReviewV2.transform, sbd = window.SCW.subBidDiff;
const FK = window.SCW.bidReview.CONFIG.fieldKeys, SFK = window.SCW.bidReview.CONFIG.sowItemFieldKeys;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const conn = (id, name) => [{ id, identifier: name }];
const CAM = '6481e5ba38f283002898113c';
const SOW_A = '6a2c000100000000000a1105', SOW_C = '6a2c000100000000000c1200';
const NAME = { [SOW_A]: '1105', [SOW_C]: '1200' };
const ref = ids => ids.map(id => ({ id, identifier: NAME[id] }));
const PKG8 = '6a2c0001000000000000bid8', PKG9 = '6a2c0001000000000000bid9';
function item(id, sows, label, fee) {
  const r = { id, field_1949_raw: conn('p' + id, 'Informant Dual Vision'), field_1958: 'Informant Dual Vision', field_1950: label,
    field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: conn('m1', 'MDF - Clubhouse'), field_2218: 10 };
  r[SFK.sow + '_raw'] = ref(sows); r[SFK.fee] = fee; r[SFK.installFee] = 50; r[SFK.equipmentTotal] = 500;
  return r;
}
function bid(id, o) {
  const r = { id };
  r[FK.sow + '_raw'] = ref(o.sows || []);
  r[FK.bidPackage + '_raw'] = conn(o.pkg || PKG8, o.pkg === PKG9 ? 'Bid 9' : 'Bid 8');
  r[FK.relatedSowItem + '_raw'] = o.item ? conn(o.item, o.label || 'X') : [];
  r[FK.proposalBucket + '_raw'] = conn(CAM, 'Camera');
  r[FK.mdfIdf + '_raw'] = conn('m1', 'MDF - Clubhouse');
  r[FK.displayLabel] = o.label || ''; r[FK.productName] = 'Informant Dual Vision';
  r[FK.qty] = 1; r[FK.rate] = o.labor; r[FK.labor] = o.labor;
  return r;
}
const sowItems = [item('iA', [SOW_A], 'I-001', 700), item('iC', [SOW_C], 'I-010', 300)];
const bids = [bid('bA', { item: 'iA', label: 'I-001', labor: 750, sows: [SOW_A] }),   // labor differs → a diff → note bar
              bid('bC', { item: 'iC', label: 'I-010', labor: 320, sows: [SOW_C], pkg: PKG9 })];
const pkgs = [{ id: PKG8, field_2636: 'Bid 8', field_2550: 'Submitted' },
              { id: PKG9, field_2636: 'Bid 9', field_2550: 'Submitted', field_2387_raw: ref([SOW_C]) }];   // Builder-assigned to SOW_C
const sowA = { id: SOW_A, field_2942_raw: conn(PKG8, 'Bid 8'), field_2941_raw: '' };        // saved basis
const sowC = { id: SOW_C, field_2942_raw: [], field_2941_raw: '' };                           // soft default only
function model(recs) { return { model: { data: { models: recs.map(r => ({ id: r.id, attributes: r })) } } }; }
window.Knack.views.view_3680 = model(bids); window.Knack.views.view_3921 = model(sowItems);
window.Knack.views.view_3573 = model(pkgs); window.Knack.views.view_3918 = model([sowA, sowC]);
document.body.innerHTML =
  '<div id="scw-bid-review-v2">' +
  '<div class="scw-bid-review-v2__sow" data-sow-id="' + SOW_A + '"><div class="scw-bid-review-v2__sow-header">1105</div></div>' +
  '<div class="scw-bid-review-v2__sow" data-sow-id="' + SOW_C + '"><div class="scw-bid-review-v2__sow-header">1200</div></div></div>';
const secA = document.querySelector('[data-sow-id="' + SOW_A + '"]'), secC = document.querySelector('[data-sow-id="' + SOW_C + '"]');
const ta = sec => sec.querySelector('textarea[data-scw-sbd-note]');
const status = sec => (sec.querySelector('.scw-sbd-noterow') || { textContent: '' }).textContent;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function type(sec, text) { const t = ta(sec); t.focus(); t.value = text; t.dispatchEvent(new window.Event('input', { bubbles: true })); return t; }
const drafts = () => JSON.parse(store.get('scwSbdNoteDraft') || '{}');

(async () => {
  sbd.render.bindOnce();
  sbd.render.render();
  check('both SOW sections got a diff block with a note textarea', [!!ta(secA), !!ta(secC)], [true, true]);
  await sleep(700);                                   // the initial diff snapshot auto-saves for the saved basis
  const initial = puts.length;
  check('the initial snapshot write went to the saved-basis SOW only (the defaulted one writes nothing)',
    puts.map(p => p.sowId), [SOW_A]);

  // 1. typing persists after the idle, without a blur, and keeps a draft meanwhile
  type(secA, 'approved with sub');
  await sleep(50);
  check('a draft is kept on the device as soon as the user types', drafts()[SOW_A] && drafts()[SOW_A].note, 'approved with sub');
  check('no write yet (idle not elapsed), textarea still focused and intact', [puts.length, document.activeElement === ta(secA)], [initial, true]);
  await sleep(2300);
  check('the note is written after the idle: GET first, then the PUT carrying it',
    [puts.length - initial, puts[puts.length - 1].note, gets.length > 0], [1, 'approved with sub', true]);
  // 2. the write is mirrored onto the model and the draft retires
  check('the local model now carries the written blob (no refetch needed)', JSON.parse(sowA.field_2941_raw).note, 'approved with sub');
  check('the draft is cleared once the note is on the server', drafts()[SOW_A], undefined);
  ta(secA).blur();
  check('status reads auto-saved', /auto-saved/.test(status(secA)), true);

  // 3. cross-tab merge: another tab saved a different note; a data-only change here must keep it
  remote[SOW_A] = JSON.stringify(Object.assign(JSON.parse(sowA.field_2941_raw), { note: 'saved from another tab' }));
  bids[0][FK.labor] = 760; bids[0][FK.rate] = 760;    // the diff changes → autoSave fires with no note edit here
  sbd.render.markDirty(); sbd.render.render();
  await sleep(700);
  check('the data-only write adopts the note another tab saved instead of writing the stale one back',
    puts[puts.length - 1].note, 'saved from another tab');
  check('the textarea shows the adopted note', ta(secA).value, 'saved from another tab');

  // 4. a permanent failure stops retrying, is shown, and a content change re-arms
  putMode = 'fail';
  const before = puts.length;
  type(secA, 'second note');
  await sleep(2400);
  check('one failed PUT', puts.length - before, 1);
  ta(secA).blur();
  check('the bar names the failure and the Builder fix', /HTTP 403/.test(status(secA)) && /field_2941/.test(status(secA)), true);
  sbd.render.render();
  await sleep(1200);
  check('no retry loop on a permanent failure', puts.length - before, 1);
  putMode = 'ok';
  type(secA, 'second note, amended');
  await sleep(2400);
  check('a content change re-arms the save and it lands', [puts.length - before, puts[puts.length - 1].note], [2, 'second note, amended']);

  // 5. a stored note containing '<' still parses (bidHtml after it carries a '>')
  remote[SOW_A] = '';
  sowA.field_2941_raw = JSON.stringify(Object.assign(JSON.parse(sowA.field_2941_raw),
    { note: 'under <$500 delta', bidHtml: '<table class="product-table"><tr><td>x</td></tr></table>' }));
  // the in-session copy retired with the last successful write, so the model is the only source;
  // blur first — render() deliberately leaves a focused textarea alone
  ta(secA).blur();
  await sleep(50);
  sbd.render.render();
  check('a note with "<" reads back from the stored blob', ta(secA).value, 'under <$500 delta');

  // 6. defaulted basis: the note saves as a note-only blob; no basis id, no field_2942
  check('an empty note on a defaulted basis wrote nothing so far', puts.filter(p => p.sowId === SOW_C).length, 0);
  type(secC, 'note before the award');
  await sleep(2400);
  const cPuts = puts.filter(p => p.sowId === SOW_C);
  const cBlob = cPuts.length ? JSON.parse(cPuts[cPuts.length - 1].body.field_2941) : null;
  check('typing on a defaulted basis writes the note', [cPuts.length, cBlob && cBlob.note], [1, 'note before the award']);
  check('…as a note-only blob: no basis id, no diff, flagged, the default bid named for information',
    cBlob && [cBlob.basisBidId, cBlob.noteOnly, cBlob.total, cBlob.exceptions.length, cBlob.defaultBidId, cBlob.bidHtml],
    ['', true, 0, 0, PKG9, '']);
  check('…and field_2942 is NOT written (the award stays a human gesture)', 'field_2942' in cPuts[cPuts.length - 1].body, false);
  ta(secC).blur();
  check('the draft retires and the bar reads auto-saved', [drafts()[SOW_C], /auto-saved/.test(status(secC))], [undefined, true]);
  check('the panel still treats the bid as the soft default (nothing chosen)', JSON.parse(sowC.field_2941_raw).basisBidId, '');

  // 7. a later render with the note-only blob persisted and nothing typed writes nothing more:
  //    the guard compares the note with the persisted one — a blob merely existing is no reason to write
  const cBefore = puts.filter(p => p.sowId === SOW_C).length;
  sbd.render.markDirty(); sbd.render.render();
  await sleep(700);
  check('a re-render with the note-only blob persisted and nothing typed writes nothing more',
    puts.filter(p => p.sowId === SOW_C).length, cBefore);

  // 8. clearing the note on a defaulted basis persists the clearing (still no basis id)
  type(secC, '');
  await sleep(2400);
  const cAfter = puts.filter(p => p.sowId === SOW_C);
  const cLast = cAfter.length ? JSON.parse(cAfter[cAfter.length - 1].body.field_2941) : null;
  check('clearing the note on a defaulted basis writes the empty note-only blob',
    [cAfter.length - cBefore, cLast && cLast.note, cLast && cLast.basisBidId], [1, '', '']);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
