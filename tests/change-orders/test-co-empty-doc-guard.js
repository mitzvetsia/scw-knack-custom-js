// jsdom smoke test: the CO stage strip refuses to send an EMPTY document. Every document it
// sends (Send to sub pricing request, the sub's Submit Pricing, Send back, the not-billable
// authorization) is built from the CO worksheet's records on the page; SW1943CO (2026-10-12)
// shipped a "0 adds, 0 removals · $0.00" submission because the sub's worksheet view held no
// line while the ops grid showed one. The guard counts the lines the document would carry
// (license lines excluded — they never ride the labor docs) and alerts instead of sending.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1374"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#manage-change-order/69f0d4b567a35332e743cc27' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1374' } }; global.Knack = window.Knack;
let records = [];
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  worksheetV2: { data: { readRecords(viewKey) { return viewKey === 'view_4112' || viewKey === 'view_4079' ? records : []; } } } };
global.SCW = window.SCW;
const alerts = [];
window.alert = m => alerts.push(String(m));
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/co-stage-strip.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const conn = (id, name) => [{ id, identifier: name }];
const SERVICES = '6977caa7f246edf67b52cbcd', LICENSE = '645554dce6f3a60028362a6a';
const sub = window.SCW.coStageSub, ops = window.SCW.coStage;
check('both strips expose the guard', [typeof sub.countDocLines, typeof sub.guardDocLines, typeof ops.guardDocLines], ['function', 'function', 'function']);

// 1. An empty worksheet view — the SW1943CO case — refuses, with the sub-facing message.
records = [];
check('sub page, no lines: 0 doc lines', sub.countDocLines(), 0);
check('sub page, no lines: Submit Pricing is refused', sub.guardDocLines('submit'), false);
check('…with a message that says why and what to do (no subcontractor name, mentions SCW, $0.00)',
  [alerts.length, /nothing to submit/.test(alerts[0]), /reload the page/.test(alerts[0]), /contact SCW/.test(alerts[0]), /\$0\.00/.test(alerts[0])],
  [1, true, true, true, true]);

// 2. The service line present (as the ops grid showed it) → the doc has a line → allowed.
records = [{ id: 's1', field_2219_raw: conn(SERVICES, 'Services'), field_2020: '1 Week Lift Extension', field_2150: '900', field_2965: 'Add' }];
check('a service line counts (services ride the doc by their labor description)', sub.countDocLines(), 1);
check('Submit Pricing allowed, no alert', [sub.guardDocLines('submit'), alerts.length], [true, 1]);

// 3. License lines never ride the labor docs → a license-only CO is still "empty" for them…
records = [{ id: 'l1', field_2219_raw: conn(LICENSE, 'License') }];
check('license-only: 0 labor-doc lines', sub.countDocLines(), 0);
check('…but counts when asked to include licenses (the not-billable authorization)', sub.countDocLines(true), 1);
check('authorize-style guard passes on a license-only CO', ops.guardDocLines('authorize', true), true);

// 4. The ops message names this page's worksheet view and the Builder filter.
records = [];
check('ops page, no lines: Send to sub is refused', ops.guardDocLines('send for pricing'), false);
check('…ops message names the verb, the view and the source filter',
  [/nothing to send for pricing/.test(alerts[alerts.length - 1]), /view_4079/.test(alerts[alerts.length - 1]), /source filter/.test(alerts[alerts.length - 1])], [true, true, true]);

// 5. Records without an id (phantom rows) do not count.
records = [{ field_2219_raw: conn(SERVICES, 'Services') }, { id: '', field_2020: 'x' }];
check('rows without an id are not lines', sub.countDocLines(), 0);

console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: all passed');
process.exit(fails ? 1 : 0);
