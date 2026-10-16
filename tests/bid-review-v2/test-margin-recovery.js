// jsdom smoke test: bid-review/margin.js — the "Increase project margin to X%" number and its write
// (2026-10-16: "this button doesn't seem to be working, and it doesn't seem to be using the right
// math", "when I change this number I have to refresh the page"). The target is the project margin
// that puts the margin on labor back at 12% after survey costs under the house gross-margin model
// (install fee = sub bid / (1 − margin)); when the row carries the current project margin, today's
// numbers pick the model (gross vs markup) before it is inverted. The write is a view-based PUT
// through the hidden update form, to the SOW when the form edits SOWs, else to the record the form
// is bound to, verified from the response. The row signature changes with the row's text.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/69f0d4b567a35332e743cc27/review-bids/69f0d4b567a35332e743cc27' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
const SOW_OBJ = 'object_106', PROJECT_OBJ = 'object_1';
const view = (obj, recId) => ({ model: { id: recId || undefined, view: { source: { object: obj } } } });
window.Knack = { views: { view_3918: view(SOW_OBJ), view_3923: view(PROJECT_OBJ, '69f0d4b567a35332e743cc27') },
  router: { current_scene_key: 'scene_1155' } };
global.Knack = window.Knack;
const ajaxCalls = [];
window.SCW = { CONFIG: {}, debug() {},
  knackAjax(o) { ajaxCalls.push(o); },
  knackRecordUrl(v, id) { return 'https://api.knack.com/v1/pages/scene_1155/views/' + v + '/records/' + id; } };
global.SCW = window.SCW;
const warns = [];
const origWarn = console.warn; console.warn = (...a) => { warns.push(a); };
for (const f of ['config.js', 'margin.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/bid-review/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const M = window.SCW.bidReview.margin;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const r2 = n => Math.round(n * 1000) / 1000;

// ── the number ─────────────────────────────────────────────────────────────
// Sub bid $3,330, survey $856 (the live SOW): r = 0.257 → gross model m* = (0.12 + r)/(1 + r) = 30.0%.
const t1 = M.target('$3,330.00', '$856.00');
check('gross model (default): sub bid $3,330 + survey $856 → 30.0%; the written decimal IS the labelled percent',
  [t1.pctLabel, t1.decimal, t1.model, t1.fit, t1.target], ['30.0', 0.3, 'gross', null, 0.12]);
check('a blank survey cost reads as $0 → the target is the recovery target itself', M.target(3330, '').pctLabel, '12.0');
check('no sub bid total → nothing to suggest', [M.target('', 856), M.target(0, 856), M.target('$—', 100)], [null, null, null]);
check('the recovery target follows config (and an explicit override)',
  [M.target(1000, 0, { target: 0.10 }).pctLabel, (window.SCW.bidReview.CONFIG.marginRecoveryTarget = 0.15, M.target(1000, 0).pctLabel)], ['10.0', '15.0']);
window.SCW.bidReview.CONFIG.marginRecoveryTarget = 0.12;

// The row carries today's project margin: Knack's margin on labor picks the model.
//   gross: 15.9% project margin → −5.7% on labor (what the live row showed)
const gross = M.target(3330, 856, { currentMargin: '15.9%', observedMargin: '-5.7%', sowId: 'g' });
check('row fits the gross model (15.9% project margin → −5.7% on labor) → gross inversion, 30.0%',
  [gross.fit, gross.pctLabel, gross.currentMargin, gross.observedMargin], ['gross', '30.0', 0.159, -0.057]);
//   markup: 18.9% project margin → (0.189 − 0.257)/1.189 = −5.7% on labor → the markup inversion (t + r)/(1 − t)
const markup = M.target(3330, 856, { currentMargin: 0.189, observedMargin: -0.057, sowId: 'm' });
check('row fits the markup model instead → markup inversion, 42.9%', [markup.fit, markup.pctLabel], ['markup', '42.9']);
check('percent-number inputs read the same as decimals (15.9 ≡ 0.159, -5.7 ≡ -0.057)',
  M.target(3330, 856, { currentMargin: 15.9, observedMargin: -5.7, sowId: 'g2' }).fit, 'gross');
// Neither model reproduces Knack's figure: say so once (console) and keep the house model.
warns.length = 0;
const odd = M.target(3330, 856, { currentMargin: 0.30, observedMargin: 0.25, sowId: 'odd' });   // gross says 12.0%, markup 3.3%
M.target(3330, 856, { currentMargin: 0.30, observedMargin: 0.25, sowId: 'odd' });
check('a row that fits neither model: gross is used and the four numbers are logged ONCE per SOW',
  [odd.fit, odd.model, odd.pctLabel, warns.length, /field_2749/.test(String(warns[0] && warns[0][0]))], [null, 'gross', '30.0', 1, true]);
check('the tooltip spells out the inputs and the current figures',
  M.describe(gross), 'Sub bid $3,330.00 + survey costs $856.00 → margin on labor back to 12.0% after survey costs (now -5.7%, project margin 15.9%)');

// ── the write ──────────────────────────────────────────────────────────────
check('the form is an "Update Installation Project" form (bound to the project) → the PUT addresses the project record',
  M.resolveWriteTarget('5ow5ow5ow5ow5ow5ow5ow5o1'), { view: 'view_3923', recordId: '69f0d4b567a35332e743cc27', scope: 'form', formObject: PROJECT_OBJ, sowObject: SOW_OBJ });
window.Knack.views.view_3923 = view(SOW_OBJ);
check('the form edits SOW records → the PUT addresses the SOW the button names',
  M.resolveWriteTarget('5ow5ow5ow5ow5ow5ow5ow5o1').recordId, '5ow5ow5ow5ow5ow5ow5ow5o1');
window.Knack.views.view_3923 = view(PROJECT_OBJ, '69f0d4b567a35332e743cc27');

const results = [];
M.save({ sowId: '5ow5ow5ow5ow5ow5ow5ow5o1', decimal: 0.3 }, r => results.push(r));
check('save: ONE view-based PUT through view_3923 to the bound record, field_2158 = 0.3',
  [ajaxCalls.length, ajaxCalls[0].type, ajaxCalls[0].url, JSON.parse(ajaxCalls[0].data)],
  [1, 'PUT', 'https://api.knack.com/v1/pages/scene_1155/views/view_3923/records/69f0d4b567a35332e743cc27', { field_2158: 0.3 }]);
ajaxCalls[0].success({ record: { id: '69f0d4b567a35332e743cc27', field_2158_raw: 0.3 } });
check('the response record carries the value → ok, scope form', [results[0].ok, results[0].scope, results[0].reason], [true, 'form', '']);
M.save({ sowId: 's1', decimal: 0.3 }, r => results.push(r));
ajaxCalls[1].success({ record: { id: 'x', field_2158_raw: 0.159 } });
check('Knack answered 200 but kept the OLD value → not ok, reason "ignored" (field not editable on the view)', [results[1].ok, results[1].reason], [false, 'ignored']);
M.save({ sowId: 's1', decimal: 0.3 }, r => results.push(r));
ajaxCalls[2].success({ record: { id: 'x', field_2158_raw: 30 } });
check('a percent-stored echo (30) still counts as landed', results[2].ok, true);
M.save({ sowId: 's1', decimal: 0.3 }, r => results.push(r));
ajaxCalls[3].error({ status: 403, responseText: 'nope' });
check('an HTTP error reports status + reason', [results[3].ok, results[3].reason, results[3].status], [false, 'http', 403]);
M.save({ sowId: 's1', decimal: 'abc' }, r => results.push(r));
check('an unparseable margin never issues a request', [results[4].reason, ajaxCalls.length], ['no-value', 4]);

// ── the row signature (view_3918) ──────────────────────────────────────────
document.body.innerHTML = '<div id="view_3918"><table><tbody>' +
  '<tr id="5ow5ow5ow5ow5ow5ow5ow5o1"><td class="field_2126"><span class="col-1">Fellowship Hall</span></td>' +
  '<td class="field_2750"><span class="col-2">$756.00</span></td><td class="field_2749"><span class="col-3">3.9%</span></td></tr>' +
  '</tbody></table></div>';
const sigA = M.rowSignature('5ow5ow5ow5ow5ow5ow5ow5o1');
document.querySelector('td.field_2750 span').textContent = '$856.00';
document.querySelector('td.field_2749 span').textContent = '-5.7%';
const sigB = M.rowSignature('5ow5ow5ow5ow5ow5ow5ow5o1');
check('the row signature is non-empty and changes when survey costs / margin change; unknown rows read blank',
  [!!sigA, sigA !== sigB, M.rowSignature('0000000000000000000000ff'), M.rowSignature('')], [true, true, '', '']);

console.warn = origWarn;
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
