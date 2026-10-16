// jsdom smoke test: on the worksheet (the Change Order worksheet view_4079 here), License-bucket
// lines are set apart — their own "Licenses" group, last, flagged isLicense; the card
// carries a license class; the summary lists them in their own section after the Total and
// never counts them in it — the way the proposal's Recurring Services band bills them separately.
// 2026-10-13: licenses flow through the build-SOW grids (view_3962 ops / view_3586 sales) too,
// so the license CARD is its own shape — product · description · qty · the view's own price,
// nothing to install, connect or bid (no MDF/IDF, Parent, Connected Devices, Sub Bid).
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
  [['MDF - Clubhouse', 'Licenses'], true, true, 2]);
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
// ── the license card on the build-SOW pages ───────────────────────────────
function cardOn(viewKey, rec) { return ns.card.buildCard(rec, viewKey); }
function has(el, sel) { return !!el.querySelector(sel); }
const ops = cardOn('view_3962', records[2]);
check('ops (view_3962): license row — product picker, description, editable qty; the labor money tracks blank, SOW kept',
  [has(ops, '.scw-ws-v2-row--license'), has(ops, '[data-scw-ws-v2-conn="field_1949"]'),
   has(ops, 'input[data-scw-ws-v2-field="field_1964"]'), has(ops, '[data-scw-ws-v2-field="field_2020"]'),
   ops.querySelectorAll('.scw-ws-v2-cell--license-blank').length,
   has(ops, '[data-scw-ws-v2-field="field_2150"]'), has(ops, '[data-scw-ws-v2-field="field_1973"]'),
   has(ops, '[data-scw-ws-v2-conn="field_2154"]')],
  [true, true, true, true, 4, false, false, true]);
check('ops: the detail carries notes only — no MDF/IDF, Parent, Connected Devices or Require Sub Bid',
  [has(ops, '[data-scw-ws-v2-conn="field_1946"]'), has(ops, '[data-scw-ws-v2-conn="field_2464"]'),
   has(ops, '[data-scw-ws-v2-conn="field_1957"]'), has(ops, '.scw-ws-v2-subbid'), has(ops, '.scw-ws-v2-detail-notes'),
   has(ops, '[data-scw-ws-v2-field="field_1953"]')],
  [false, false, false, false, true, true]);
const sales = cardOn('view_3586', records[2]);
check('sales (view_3586): the line total stays (it IS the license price); pricing detail with Qty + Custom Disc %; no location / connections',
  [has(sales, '.scw-ws-v2-row--license'), has(sales, '.scw-ws-v2-cell--sales-total'),
   sales.querySelector('.scw-ws-v2-cell--sales-total').textContent.trim(),
   has(sales, 'input[data-scw-ws-v2-field="field_1964"]'), has(sales, 'input[data-scw-ws-v2-field="field_2261"]'),
   has(sales, '[data-scw-ws-v2-conn="field_1946"]'), has(sales, '[data-scw-ws-v2-conn="field_2464"]'),
   has(sales, '.scw-ws-v2-cell--license-blank')],
  [true, true, '45', true, true, false, false, false]);
const co = cardOn('view_4079', records[2]);
check('ops CO worksheet (view_4079): the Equipment $ stack + net total survive (the CO prices the license); labor tracks blank',
  [has(co, '.scw-ws-v2-row--license'), has(co, '.scw-ws-v2-cell--net'),
   co.querySelectorAll('.scw-ws-v2-cell--license-blank').length, has(co, '[data-scw-ws-v2-field="field_2150"]')],
  [true, true, 4, false]);
const cam = cardOn('view_3962', records[0]);
check('a camera card is untouched (MDF/IDF connection still on it, no license class)',
  [has(cam, '[data-scw-ws-v2-conn="field_1946"]'), has(cam, '.scw-ws-v2-row--license')], [true, false]);

// ── the deploy worksheets (install object — view_4093 ops / view_4056 sub) ─────────────────
// 2026-10-16: the install object keeps its bucket on field_2822 (not the SOW's field_2219). render.js
// hands the group builder the per-view field map but no view key, so the license test has to read
// the bucket off that map — before this, every license on the deploy page landed in "Unassigned".
const INST_F = ns.cfg.fields('view_4093');
const inst = [
  { id: 'i1', field_2790: 'Customer Supplied Reader', field_2801: 'AC-01', field_2789: 1, field_2218: 10,
    field_2822_raw: conn(CAM, 'Camera / Reader'), field_2818_raw: conn('M1', 'HEADEND: : MDF') },
  { id: 'i2', field_2790: 'Avigilon Alta 8 Door Hub', field_2789: 1, field_2218: 20,
    field_2822_raw: conn(NET, 'Networking or Headend'), field_2818_raw: conn('M1', 'HEADEND: : MDF') },
  // A license carrying an MDF/IDF still goes to the Licenses group (a license is not installed anywhere).
  { id: 'il', field_2790: 'Avigilon Alta Software License Pack Enterprise- 10 Entries', field_2789: 2, field_2218: 90,
    field_2809: 'Annual cloud license, 10 entries', field_2822_raw: conn(LIC, 'License'), field_2818_raw: conn('M1', 'HEADEND: : MDF') },
  { id: 'il2', field_2790: 'Health Monitoring License', field_2789: 1, field_2218: 90, field_2822_raw: conn('lic2', 'Licenses (annual)') }
];
const itree = ns.groups.buildGroupTree(inst, [], { fields: INST_F });   // no viewKey, as render.js called it
check('deploy worksheet: licenses get the Licenses group (last, flagged, 2 records) — never "Unassigned" — even with no view key',
  [itree.map(l1 => l1.label), itree[itree.length - 1].isLicense === true, itree[itree.length - 1].recordCount],
  [['HEADEND: : MDF', 'Licenses'], true, 2]);
const ic = cardOn('view_4093', inst[2]);
check('deploy worksheet: the license card — install grid + license row, read-only product, "Recurring ×2" chit, SCW Notes still editable',
  [ic.classList.contains('scw-ws-v2-card--install'), ic.classList.contains('scw-ws-v2-card--license'),
   has(ic, '.scw-ws-v2-row--license.scw-ws-v2-row--install'), ic.querySelector('.scw-ws-v2-product-name').textContent,
   ic.querySelector('.scw-ws-v2-cell--install-flags .scw-ws-v2-chip--license').textContent,
   has(ic, 'textarea[data-scw-ws-v2-field="field_2808"]')],
  [true, true, true, 'Avigilon Alta Software License Pack Enterprise- 10 Entries', 'Recurring ×2', true]);
const icDetail = ic.querySelector('.scw-ws-v2-detail');
check('deploy worksheet: the detail is qty + description, read-only — no MDF/IDF picker, Parent, Connected Devices or Mounting Hardware',
  [has(ic, '[data-scw-ws-v2-conn="field_2818"]'), has(ic, '[data-scw-ws-v2-conn="field_2853"]'), has(ic, '[data-scw-ws-v2-conn="field_2820"]'),
   has(ic, '.scw-ws-v2-mh-chips'), has(ic, '.scw-ws-v2-conn-btn'),
   /Qty/.test(icDetail.textContent) && /Annual cloud license, 10 entries/.test(icDetail.textContent),
   /billed separately/.test(icDetail.textContent)],
  [false, false, false, false, false, true, true]);
check('deploy worksheet: a single license reads plain "Recurring"', cardOn('view_4093', inst[3]).querySelector('.scw-ws-v2-chip--license').textContent, 'Recurring');
const icam = cardOn('view_4093', inst[0]);
check('deploy worksheet: a reader card is untouched (MDF/IDF picker still on it, no license row)',
  [has(icam, '[data-scw-ws-v2-conn="field_2818"]'), has(icam, '.scw-ws-v2-row--license'), has(icam, '.scw-ws-v2-chip--license')], [true, false, false]);
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
