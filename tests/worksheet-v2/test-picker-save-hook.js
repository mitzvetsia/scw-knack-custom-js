// jsdom smoke test: the worksheet-v2 picker's caller-owned save hook (opts.save). The picker's own
// PUT writes ONE field on ONE record (opts.recordId); bid-review's "Link bid items" picker instead
// writes field_2404 on each CHOSEN bid record, so it hands the picker a save(ids) that returns a
// thenable. Resolve → the modal closes and onSaved(ids, result) fires; reject → the modal stays
// open with the error in the status line and the buttons re-enabled. The picker's PUT path must
// not run at all (no SCW.knackAjax call).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#bids/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;
let ajaxCalls = 0;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackAjax() { ajaxCalls++; }, knackRecordUrl(v, r) { return v + '/' + r; } };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/picker.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const picker = window.SCW.worksheetV2.picker;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const tick = () => new Promise(r => setTimeout(r, 0));
const candidates = [
  { id: 'b-mdf', identifier: 'NanoBeam (MDF)', field_2415_raw: [{ id: 'p411', identifier: '411' }] },
  { id: 'b-idf', identifier: 'NanoBeam (IDF 01)', field_2415_raw: [{ id: 'p411', identifier: '411' }] },
  { id: 'b-gone', identifier: 'NanoBeam (removed)', field_2415_raw: [] }
];
function openWith(save, onSaved) {
  picker.open({
    sourceViewKey: 'view_3680', recordId: 's-new', fieldKey: 'field_2404', label: 'Link bid items',
    candidates, selectedIds: ['b-mdf'], multi: true, groupBy: false,
    sowFilter: { fieldKey: 'field_2415', label: 'Bid' }, anchorSowIds: ['p411'],
    save, onSaved
  });
  return document.querySelector('.scw-ws-v2-picker-overlay');
}

(async () => {
  // Resolving hook: closes + reports.
  let savedIds = null, onSavedArgs = null;
  const ov1 = openWith(ids => { savedIds = ids; return Promise.resolve({ added: 2, removed: 0, failed: 0 }); },
                       (ids, result) => { onSavedArgs = [ids, result]; });
  check('picker opened', !!ov1, true);
  check('pre-selected record is checked', ov1.querySelector('input[value="b-mdf"]').checked, true);
  check('a record on no bid still lists (nothing is hidden for being off the bid)', !!ov1.querySelector('input[value="b-gone"]'), true);
  check('the off-bid record is flagged as on a different Bid', !!ov1.querySelector('input[value="b-gone"]').closest('.scw-ws-v2-picker-item').querySelector('.scw-ws-v2-picker-item-sow--none, .scw-ws-v2-picker-item-sow--diff'), true);
  ov1.querySelector('input[value="b-idf"]').checked = true;
  ov1.querySelector('input[value="b-gone"]').checked = true;
  ov1.querySelector('.scw-ws-v2-picker-btn--confirm').click();
  await tick();
  // ids arrive in the picker's display order (canonical label sort), so compare as a set.
  check('save hook received the full selection (kept + newly chosen, incl. the off-bid record)', (savedIds || []).slice().sort(), ['b-gone', 'b-idf', 'b-mdf']);
  check('the picker\'s own PUT never ran', ajaxCalls, 0);
  check('modal closed on resolve', !!document.querySelector('.scw-ws-v2-picker-overlay'), false);
  check('onSaved got the ids and the hook\'s result', [(onSavedArgs ? onSavedArgs[0] : []).slice().sort(), onSavedArgs && onSavedArgs[1]], [['b-gone', 'b-idf', 'b-mdf'], { added: 2, removed: 0, failed: 0 }]);

  // Rejecting hook: stays open, shows the error, re-enables the buttons.
  let onSaved2 = 0;
  const ov2 = openWith(() => Promise.reject(new Error('1 bid item could not be saved — try again')), () => { onSaved2++; });
  ov2.querySelector('.scw-ws-v2-picker-btn--confirm').click();
  await tick();
  check('modal stays open on reject', !!document.querySelector('.scw-ws-v2-picker-overlay'), true);
  check('error shown in the status line', ov2.querySelector('.scw-ws-v2-picker-status').textContent, '1 bid item could not be saved — try again');
  check('status carries the error class', ov2.querySelector('.scw-ws-v2-picker-status').classList.contains('scw-ws-v2-picker-status--err'), true);
  check('confirm re-enabled for a retry', ov2.querySelector('.scw-ws-v2-picker-btn--confirm').disabled, false);
  check('onSaved not fired on reject', onSaved2, 0);
  check('still no picker-side PUT', ajaxCalls, 0);
  ov2.querySelector('.scw-ws-v2-picker-close').click();
  check('X still closes it after a failed save', !!document.querySelector('.scw-ws-v2-picker-overlay'), false);

  // Non-thenable return: treated as an immediate success.
  let saved3 = 0;
  openWith(() => { saved3++; return null; }, () => {});
  document.querySelector('.scw-ws-v2-picker-btn--confirm').click();
  await tick();
  check('a hook returning nothing closes immediately', [saved3, !!document.querySelector('.scw-ws-v2-picker-overlay')], [1, false]);

  // Auto-collapse (16+ candidates, several groups): a NEGATIVE-rank group is the caller's
  // "look here first" band (Link bid item's "Same product on this bid") and must stay open even
  // with nothing selected in it; ordinary groups without a selection still collapse.
  const many = [];
  for (let i = 0; i < 18; i++) many.push({ id: 'c' + i, identifier: 'Item ' + String(i).padStart(2, '0') });
  picker.open({
    sourceViewKey: 'view_3680', recordId: 's-new', fieldKey: 'field_2404', candidates: many, selectedIds: [], multi: true,
    groupBy: rec => rec.id === 'c3' ? { id: 'same', label: 'Same product · on bid 411', rank: -2 }
                  : (rec.id < 'c9' ? { id: 'g1', label: 'On bid 411', rank: 0 } : { id: 'g2', label: 'On bid 119', rank: 1 }),
    save() { return Promise.resolve({}); }
  });
  const wraps = Array.from(document.querySelectorAll('.scw-ws-v2-picker-groupwrap'))
    .map(w => [w.querySelector('.scw-ws-v2-picker-group-lbl').textContent, w.classList.contains('is-collapsed')]);
  check('negative-rank band is first and stays expanded; the rest auto-collapse',
    wraps, [['Same product · on bid 411', false], ['On bid 411', true], ['On bid 119', true]]);
  document.querySelector('.scw-ws-v2-picker-close').click();

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL threw ' + (e && e.stack || e)); process.exit(1); });
