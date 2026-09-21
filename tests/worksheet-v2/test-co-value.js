// jsdom smoke test: the CO value strip (co-value.js) keeps recurring licenses out of Adds /
// Credits / Net change and shows them on their own "billed separately" tile (ops strip only).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#co/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1362' } }; global.Knack = window.Knack;
const CAM = '6481e5ba38f283002898113c', LIC = '645554dce6f3a60028362a6a';
const conn = (id, name) => [{ id, identifier: name }];
const records = [
  { id: 'a', field_2965: 'Add',    field_2219_raw: conn(CAM, 'Camera / Reader'), field_2269: 500, field_2028: 300 },
  { id: 'r', field_2965: 'Remove', field_2219_raw: conn(CAM, 'Camera / Reader'), field_2269: -200, field_2028: -100 },
  { id: 'l', field_2965: 'Add',    field_2219_raw: conn(LIC, 'License'),         field_2269: 180, field_2028: 0 },
  { id: 'm', field_2965: 'Add',    field_2219_raw: conn('x', 'Licenses (annual)'), field_2269: 60, field_2028: 0 }
];
window.SCW = { CONFIG: {}, worksheetV2: { data: { readRecords() { return records; }, subscribe() {} } }, debug() {}, onViewRender() {}, onSceneRender() {} };
global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'co-value.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
document.body.innerHTML = '<div id="kn-scene_1362"><div class="kn-form kn-view" id="view_4092"><form><div class="scw-co-hdr">hdr</div></form></div></div>';
(handlers['knack-view-render.view_4092.scwCoValue4079'] || []).forEach(fn => fn());
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
setTimeout(() => {
  const tiles = [...document.querySelectorAll('.scw-co-val-tile')].map(t => [t.querySelector('.scw-co-val-label').textContent, (t.querySelector('.scw-co-val-count') || {}).textContent || '', t.querySelector('.scw-co-val-amt').textContent]);
  check('Adds / Credits / Net count hardware only; licenses get their own tile with their net, billed separately',
    tiles, [['Adds', '1 line', '$800.00'], ['Credits', '1 line', '−$300.00'], ['Net change', '', '$500.00'], ['Recurring licenses', '2 lines', '$240.00']]);
  check('the licenses tile says why it is apart', /billed separately/.test(document.querySelector('.scw-co-val-tile--licenses .scw-co-val-split').textContent), true);
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
}, 800);
