// jsdom smoke test: on the worksheet (the Change Order worksheet view_4079 here), License-bucket
// lines are set apart — their own "Recurring licenses" group, last, flagged isLicense; the card
// carries a license class; the summary lists them in their own section after the Total and
// never counts them in it — the way the proposal's Recurring Services band bills them separately.
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
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
const CAM = '6481e5ba38f283002898113c', NET = '647953bb54b4e1002931ed97', LIC = '645554dce6f3a60028362a6a';
const conn = (id, name) => [{ id, identifier: name }];
const records = [
  { id: 'c1', field_1949: 'Deputy 8.0 v5', field_1964: 1, field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: conn('L1', 'MDF - Clubhouse'), field_2218: 10, field_2269: 500 },
  { id: 'n1', field_1949: 'SCW 4 Port Switch', field_1964: 1, field_2219_raw: conn(NET, 'Networking or Headend'), field_1946_raw: conn('L1', 'MDF - Clubhouse'), field_2218: 20, field_2269: 200 },
  // A license with an MDF/IDF on the record still lands in the licenses group (it is not installed anywhere).
  { id: 'l1', field_1949: 'Cloud Storage License, 30 days', field_1964: 3, field_2219_raw: conn(LIC, 'License'), field_1946_raw: conn('L1', 'MDF - Clubhouse'), field_2218: 90, field_2269: 45 },
  { id: 'l2', field_1949: 'Health Monitoring License', field_1964: 1, field_2219_raw: conn('lic2', 'Licenses (annual)'), field_2218: 90, field_2269: 120 }
];
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const fields = ns.cfg.fields('view_4079');
const tree = ns.groups.buildGroupTree(records, [], { viewKey: 'view_4079', fields });
check('licenses form their own L1, last, flagged; the MDF/IDF on a license record is ignored',
  [tree.map(l1 => l1.label), tree[tree.length - 1].isLicense === true, tree[tree.length - 1].isSynthetic, tree[tree.length - 1].recordCount],
  [['MDF - Clubhouse', 'Recurring licenses'], true, true, 2]);
check('the card knows a license (bucket id, or a bucket label starting "License")',
  [ns.card.isLicenseBucket(records[2], 'view_4079'), ns.card.isLicenseBucket(records[3], 'view_4079'), ns.card.isLicenseBucket(records[0], 'view_4079'),
   ns.card.buildCard(records[2], 'view_4079').classList.contains('scw-ws-v2-card--license')],
  [true, true, false, true]);
const grand = ns.summary.buildGrandSummary(tree, { viewKey: 'view_4079', fields, moneyField: 'field_2269' });
const rows = [...grand.querySelectorAll('tbody tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
const totalRow = rows.find(r => /^Total/.test(r));
const licHead = rows.findIndex(r => /Recurring licenses — billed separately/.test(r));
check('summary: licenses sit in their own section AFTER the Total; the Total excludes them (2 items, $700)',
  [licHead > rows.indexOf(totalRow), /2/.test(totalRow) && /700/.test(totalRow), rows.slice(licHead + 1).some(r => /Cloud Storage License/.test(r) && /3/.test(r)), rows[rows.length - 1].indexOf('not in Total') > 0],
  [true, true, true, true]);
check('the summary head count / money leaves licenses out', /2 items · \$700/.test(grand.querySelector('.scw-ws-v2-summary-stats').textContent), true);
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
