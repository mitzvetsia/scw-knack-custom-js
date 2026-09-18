// jsdom smoke test: the Change Order worksheet (view_4079) offers the unit Equipment $
// (field_1960) in bulk edit for the equipment buckets, on top of the shared SOW registry;
// services never get it. Other SOW views keep the registry as it was.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#co/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1362' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
for (const f of ['config.js', 'bulk.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const reg = window.SCW.worksheetV2.bulk.fieldSetFor('view_4079');
const keys = cat => (reg[cat] || []).map(f => f.key + ':' + f.kind);
check('CO worksheet: Equipment $ (field_1960, number) is bulk-editable on cam + default, after the shared fields',
  [keys('cam').slice(-1), keys('default').slice(-1), reg.cam.find(f => f.key === 'field_1960').label],
  [['field_1960:number'], ['field_1960:number'], 'Equipment $ (unit)']);
check('services and assumptions carry no equipment price', [keys('services').includes('field_1960:number'), keys('assumptions').includes('field_1960:number')], [false, false]);
check('the shared registry is intact underneath (Product, Qty, Sub Bid … still there)', keys('default').slice(0, 4), ['field_1949:conn-single', 'field_2020:text', 'field_1964:number', 'field_2150:number']);
const sow = window.SCW.worksheetV2.bulk.fieldSetFor('view_3962');
check('the build-SOW worksheet is unchanged (no Equipment $ there)', (sow.default || []).some(f => f.key === 'field_1960'), false);
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
