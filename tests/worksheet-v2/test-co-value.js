// jsdom smoke test: the CO value strip (co-value.js) keeps recurring licenses out of Adds /
// Credits / Net change and shows them on their own "billed separately" row (ops card only),
// and expresses the labor margin as a % of the install fee.
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
  // Rows of the value table: [label, count, client amount]. The label cell
  // carries a dot + label + count; the amount is the Client column.
  const rows = [...document.querySelectorAll('.scw-co-val-table tbody tr')].map(tr => {
    const lbl = tr.querySelector('.scw-co-val-row-label');
    const cnt = lbl.querySelector('.scw-co-val-count');
    const label = lbl.textContent.replace(cnt ? cnt.textContent : '', '').trim();
    return [label, cnt ? cnt.textContent : '', tr.querySelector('.scw-co-val-main').textContent];
  });
  check('Adds / Credits / Net count hardware only; licenses get their own row with their net, billed separately',
    rows, [['Adds', '1 line', '$800.00'], ['Credits', '1 line', '−$300.00'], ['Net change', '', '$500.00'], ['Recurring licenses', '2 lines', '$240.00']]);
  const licRow = [...document.querySelectorAll('.scw-co-val-table tbody tr')].pop();
  check('the licenses row says why it is apart', /billed separately/.test(licRow.textContent), true);
  // Sub side: Adds bid 0 on this fixture → margin 100% of the fee; Net too.
  const cells = [...document.querySelectorAll('.scw-co-val-table tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()));
  check('labor margin is a percent of the install fee', cells[0][4], '100%');
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
}, 800);
