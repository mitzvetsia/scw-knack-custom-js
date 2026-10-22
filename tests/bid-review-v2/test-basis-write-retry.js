// jsdom smoke test: the basis-bid write on the reconcile page is durable and honest (2026-10-22,
// "the quote previews tell me a basis bid has not been selected, though it has"). Driving the real
// sub-bid-diff/render.js:
//   1. a Builder-assigned soft default (REL_SOW on the bid package) is shown but, once no note is
//      owed, reads "Default bid shown — save it as the basis" — never "✓ Reviewed";
//   2. saving it with a PUT that gets a 429 retries with backoff and lands (two attempts, one award);
//   3. a permanent 4xx does not retry; the bar says "basis NOT saved (HTTP 403)" with a Retry, and the
//      retry writes again and clears the error.
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

// ── ajax stub: GET answers the record; PUT follows a per-SOW plan of statuses ('ok' | number) ──
const puts = [];
const plan = Object.create(null);   // sowId → [status, …] consumed per attempt; empty = ok
window.SCW = {
  CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackRecordUrl(v, id) { return 'https://api/' + v + '/' + id; },
  knackAjax(o) {
    const sowId = o.url.split('/').pop();
    if (o.type === 'GET') { setTimeout(() => o.success({ record: { id: sowId, field_2941_raw: '' } }), 2); return { then() {} }; }
    const body = JSON.parse(o.data);
    const st = (plan[sowId] && plan[sowId].length) ? plan[sowId].shift() : 'ok';
    puts.push({ sowId, body, status: st });
    return new Promise((res, rej) => setTimeout(() => st === 'ok' ? res({}) : rej({ status: st }), 2));
  }
};
global.SCW = window.SCW;
function load(f) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
for (const f of ['bid-review/config.js', 'bid-review-v2/config.js', 'bid-review-v2/transform.js', 'bid-review-v2/card.js',
  'sub-bid-diff/config.js', 'sub-bid-diff/pdf-html.js', 'sub-bid-diff/render.js']) load(f);
const sbd = window.SCW.subBidDiff;
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
// Same fixture as test-reviewer-note-save.js: both bids differ from their SOW line (a note is owed),
// so the auto-pick never awards a zero-diff bid behind the test's back.
const sowItems = [item('iA', [SOW_A], 'I-001', 700), item('iC', [SOW_C], 'I-010', 300)];
const bids = [bid('bA', { item: 'iA', label: 'I-001', labor: 750, sows: [SOW_A] }),
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
const ready = sec => sec.querySelector('.scw-sbd-ready');
const state = sec => ready(sec).className.replace(/.*--/, '');
const meta = sec => (sec.querySelector('.scw-sbd-baseline') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
const sel = sec => sec.querySelector('select[data-scw-sbd-basis]');
const ta = sec => sec.querySelector('textarea[data-scw-sbd-note]');
const basisPuts = sow => puts.filter(p => p.sowId === sow && ('field_2942' in p.body));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function pick(sec, pkgId) { const s = sel(sec); s.value = pkgId; s.dispatchEvent(new window.Event('change', { bubbles: true })); }
function type(sec, text) { const t = ta(sec); t.focus(); t.value = text; t.dispatchEvent(new window.Event('input', { bubbles: true })); return t; }

(async () => {
  sbd.render._basisRetry.baseMs = 60; sbd.render._basisRetry.jitterMs = 0;   // long enough to observe the in-flight state
  sbd.render.bindOnce();
  sbd.render.render();
  await sleep(700);                                   // the saved-basis SOW's initial snapshot auto-save

  // 1. the soft default is shown and compared, but never called reviewed
  check('SOW_C shows Bid 9 (the Builder default) as the selection, flagged as the default; SOW_A is a saved basis',
    [sel(secC).value, sbd.render.isDefaulted(SOW_C), sbd.render.isDefaulted(SOW_A)], [PKG9, true, false]);
  check('with a diff and no note, both read needs-note first', [state(secA), state(secC)], ['needs-note', 'needs-note']);
  type(secC, 'approved: the sub priced the extra conduit');
  ta(secC).blur();                                    // the renderer leaves a section alone while its note has focus
  sbd.render.markDirty(); sbd.render.render();
  check('note in hand, the defaulted SOW reads needs-basis — "Default bid shown — save it as the basis" — not ✓ Reviewed',
    [state(secC), ready(secC).textContent], ['needs-basis', 'Default bid shown — save it as the basis']);
  check('the bar offers Save as basis on the default', /not saved as basis/.test(meta(secC)) && !!secC.querySelector('[data-scw-sbd-savedef]'), true);
  await sleep(2200);                                  // the note-only blob idle-saves; no basis is written by it
  check('the note idle-save wrote no basis', basisPuts(SOW_C).length, 0);

  // 2. a 429 on the award is retried and lands
  plan[SOW_C] = [429];
  secC.querySelector('[data-scw-sbd-savedef]').click();
  await sleep(10);
  check('while the write (and its retry) is in flight the bar reads saving… and the picker is disabled',
    [sbd.render.isSavingBasis(SOW_C), /saving/.test(meta(secC)), sel(secC).disabled], [true, true, true]);
  await sleep(150);
  check('two attempts, one award: the 429 was retried and the second PUT carried field_2942 = Bid 9 (+ the snapshot)',
    [basisPuts(SOW_C).map(p => p.status), basisPuts(SOW_C)[1].body.field_2942, 'field_2941' in basisPuts(SOW_C)[1].body], [[429, 'ok'], [PKG9], true]);
  await sleep(300);
  check('after the retry lands: not saving, no error, no longer a default, readiness ready',
    [sbd.render.isSavingBasis(SOW_C), sbd.render.basisWriteError(SOW_C), sbd.render.isDefaulted(SOW_C), state(secC)],
    [false, null, false, 'ready']);
  check('the bar reads saved', /saved as the basis/.test(meta(secC)), true);

  // 3. a permanent failure: no retry, told in the bar, Retry writes again
  // (SOW_A's initial snapshot auto-save already carried field_2942 — count from here.)
  const aBefore = basisPuts(SOW_A).length;
  const aPuts = () => basisPuts(SOW_A).slice(aBefore);
  plan[SOW_A] = [403];
  pick(secA, PKG9);
  await sleep(150);
  check('one attempt only on a 403', aPuts().map(p => p.status), [403]);
  const err = sbd.render.basisWriteError(SOW_A);
  check('the failure is recorded against the pick and shown with a Retry',
    [err && err.status, err && err.pkgId, /basis NOT saved \(HTTP 403\)/.test(meta(secA)), !!secA.querySelector('[data-scw-sbd-savedef]')],
    [403, PKG9, true, true]);
  secA.querySelector('[data-scw-sbd-savedef]').click();
  await sleep(80);
  check('Retry writes the basis again and clears the error',
    [aPuts().map(p => p.status), sbd.render.basisWriteError(SOW_A), aPuts()[1].body.field_2942], [[403, 'ok'], null, [PKG9]]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
