// jsdom smoke test: bom-tray.js hides the old summary panels and builds the tray (opened from the
// "Bill of materials" row deploy-page-nav.js puts in "Also on this project"): drops head, Shipping grouped by
// bucket (or MDF/IDF), one row per product with SKU / qty / pricing joined from the proposed SOW
// item, a separate Not shipping block for Pre-existing and Customer-supplied, no services.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const CAM = 'bucket_cam', NET = 'bucket_net', MNT = 'bucket_mount', SVC = 'bucket_svc';
const conn = (id, name) => [{ id, identifier: name }];
const install = [
  // 3 cams on new drops at the MDF, 2 on existing cable at the IDF; all priced via the SOW item s1
  { id: 'c1', field_2790: 'Informant 8.0 v5', field_2802: 'I-001', field_2789: 1, field_2807: 'No',  field_2818_raw: conn('L1', 'Default MDF'), field_2822_raw: conn(CAM, 'Camera / Reader'), field_2819_raw: conn('s1', 'x') },
  { id: 'c2', field_2790: 'Informant 8.0 v5', field_2802: 'I-002', field_2789: 1, field_2807: 'No',  field_2818_raw: conn('L1', 'Default MDF'), field_2822_raw: conn(CAM, 'Camera / Reader'), field_2819_raw: conn('s1', 'x') },
  { id: 'c3', field_2790: 'Informant 8.0 v5', field_2802: 'I-003', field_2789: 1, field_2807: 'No',  field_2818_raw: conn('L1', 'Default MDF'), field_2822_raw: conn(CAM, 'Camera / Reader'), field_2819_raw: conn('s1', 'x') },
  { id: 'c4', field_2790: 'Informant 8.0 v5', field_2802: 'I-004', field_2789: 1, field_2807: 'Yes', field_2818_raw: conn('L2', 'IDF 01'),      field_2822_raw: conn(CAM, 'Camera / Reader'), field_2819_raw: conn('s1', 'x') },
  { id: 'c5', field_2790: 'Informant 8.0 v5', field_2802: 'I-005', field_2789: 1, field_2807: 'Yes', field_2818_raw: conn('L2', 'IDF 01'),      field_2822_raw: conn(CAM, 'Camera / Reader'), field_2819_raw: conn('s1', 'x') },
  { id: 'n1', field_2790: 'Imperial 128 Channel 4K NVR v3', field_2789: 1, field_2818_raw: conn('L1', 'Default MDF'), field_2822_raw: conn(NET, 'Networking or Headend'), field_2819_raw: conn('s2', 'x') },
  { id: 'n2', field_2790: 'v2 16 Drive Mini-SAS Enclosure (Special Order)', field_2789: 2, field_2818_raw: conn('L1', 'Default MDF'), field_2822_raw: conn(NET, 'Networking or Headend'), field_2819_raw: conn('s3', 'x') },
  { id: 'n3', field_2790: 'Pre-existing PoE Switch', field_2789: 1, field_2818_raw: conn('L1', 'Default MDF'), field_2822_raw: conn(NET, 'Networking or Headend') },
  { id: 'n4', field_2790: 'Customer-supplied Monitor', field_2789: 1, field_2818_raw: conn('L2', 'IDF 01'), field_2822_raw: conn(NET, 'Networking or Headend') },
  // no MDF/IDF and no SOW link: lands in the "No MDF / IDF" / "No SOW" group, which sorts last
  { id: 'n5', field_2790: 'Cat6 Uplink', field_2789: 1, field_2822_raw: conn(NET, 'Networking or Headend') },
  { id: 'm1', field_2790: 'Junction Box', field_2789: 5, field_2818_raw: conn('L1', 'Default MDF'), field_2822_raw: conn(MNT, 'Mounting Hardware'), field_2819_raw: conn('s4', 'x') },
  { id: 'v1', field_2790: 'Travel', field_2789: 2, field_2822_raw: conn(SVC, 'Other Services') },
  { id: 'x1', field_2790: 'Removed Camera', field_2789: 1, field_2807: 'No', field_2822_raw: conn(CAM, 'Camera / Reader'), field_2967_raw: conn('co1', 'CO 1') }
];
// The SKU column on the hidden SOW grid is whatever field the Builder exposed under a "SKU" header
// (here field_9999) — found by header text, not by a guessed key.
// field_2154 is the SOW connection (multi: s2 is shared by two SOWs); s3 has none.
const sow = [
  { id: 's1', field_1960: '$300.00', field_2262: '$50.00', field_2268: '$250.00', field_9999: 'INF-80-V5', field_2154_raw: conn('w1', '1524') },
  { id: 's2', field_1960: '$1,000.00', field_2262: '$0.00', field_2268: '$1,000.00', field_9999: 'IMP-128', field_2154_raw: [{ id: 'w1', identifier: '1524' }, { id: 'w2', identifier: 'SW1601' }] },
  { id: 's3', field_1960: '$400.00', field_2262: '$0.00', field_2268: '$400.00' },
  { id: 's4', field_1960: '$10.00', field_2262: '$0.00', field_2268: '$10.00', field_9999: 'JB-1', field_2154_raw: conn('w2', 'SW1601') }
];
const models = recs => ({ model: { data: { models: recs.map(a => ({ attributes: a })) } } });
window.Knack = { views: { view_4093: models(install), view_4072: models(sow) }, router: { current_scene_key: 'scene_1311' } };
global.Knack = window.Knack;
let opened = null;
window.SCW = { CONFIG: {},
  worksheetV2: { card: { bucketCategoryOf(rec) { const b = rec.field_2822_raw && rec.field_2822_raw[0] && rec.field_2822_raw[0].id; return b === CAM ? 'cam' : b === SVC ? 'services' : 'default'; } } },
  // Same tagging as deploy-page-nav's openPanel: the drawer clears extras by this class.
  deployNav: { openPanel(o) { opened = o; o.el.classList.add('scw-deploy-drawer__custom'); document.body.appendChild(o.el); return true; } } };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/bom-tray.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

document.body.innerHTML = '<div id="kn-scene_1311"><div id="scw-ws-v2-view_4093"><div class="scw-ws-v2-toolbar">' +
  '<button type="button" class="scw-ws-v2-toolbar-btn" data-scw-ws-v2-mode="default">Default</button><button type="button" class="scw-ws-v2-toolbar-btn" data-scw-ws-v2-mode="summary">Summary only</button>' +
  '<div class="scw-ws-v2-toolbar-group scw-ws-v2-toolbar-group--cta"><a id="scw-deploy-co-toolbar-cta" class="scw-ws-v2-toolbar-btn">+ Change Order</a></div></div>' +
  '<div class="scw-ws-v2-grand-summary">old summary</div></div>' +
  '<div class="kn-view kn-table" id="view_4072" style="display:none"><table><thead><tr><th class="field_1949">Product</th><th class="field_9999">SKU</th><th class="field_1960">PRODUCT STORED_price</th></tr></thead><tbody></tbody></table></div></div>';
(handlers['knack-view-render.view_4093.scwBomTray'] || []).forEach(fn => fn());

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const cells = tr => [...tr.querySelectorAll('td')].map(td => td.textContent.replace(/\s+/g, ' ').trim());
setTimeout(() => {
  check('no toolbar button (the Also list is the way in); the old summary + Summary-only mode are hidden by CSS',
    [!!document.getElementById('scw-bom-toolbar-btn'), /\.scw-ws-v2-grand-summary[\s\S]*display: none/.test(document.getElementById('scw-bom-css').textContent), /mode="summary"\]/.test(document.getElementById('scw-bom-css').textContent)],
    [false, true, true]);
  window.SCW.bomTray.open();
  const tray = opened && opened.el;
  check('open() puts the tray in the drawer, titled', [opened && opened.title, opened && opened.eyebrow, !!tray], ['Bill of materials', '3 · Installation', true]);
  check('head: new drops vs existing cable (removed-by-CO rows ignored)', tray.querySelector('.scw-bom__drops').textContent.replace(/\s+/g, ' '), '3 new drops · 2 on existing cable');
  const groups = [...tray.querySelectorAll('.scw-bom__table')][0].querySelectorAll('.scw-bom__group td');
  check('Shipping groups by bucket, cameras first; services and assumptions never appear', [...groups].map(g => g.textContent), ['Camera / Reader', 'Networking or Headend', 'Mounting Hardware']);
  const ship = tray.querySelectorAll('.scw-bom__table')[0];
  const rows = [...ship.querySelectorAll('tbody tr:not(.scw-bom__group):not(.scw-bom__total)')].map(cells);
  check('one row per product: designators compacted, no location run-on, drops chip, SKU + extended pricing from the SOW item',
    rows[0], ['Informant 8.0 v5 · I-001 to I-005 3 new drops', 'INF-80-V5', '5', '$1,500.00', '−$250.00', '$1,250.00']);
  check('special order chip from the name; no SKU → dash; discount 0 → dash',
    rows[2], ['v2 16 Drive Mini-SAS Enclosure (Special Order) Special order', '—', '2', '$800.00', '—', '$800.00']);
  check('no SOW item → no SKU, no pricing on that row', rows[3], ['Cat6 Uplink', '—', '1', '—', '—', '—']);
  check('mounts are ordinary shipping rows', rows[4], ['Junction Box', 'JB-1', '5', '$50.00', '—', '$50.00']);
  check('shipping total', cells(ship.querySelector('.scw-bom__total')), ['Shipping total', '', '14', '$3,350.00', '−$250.00', '$3,100.00']);
  check('columns exist only when some row has data: all six here', [...ship.querySelectorAll('thead th')].map(t => t.textContent), ['Product', 'SKU', 'Qty', 'Retail', 'Discount', 'After discount']);
  const noShip = tray.querySelector('.scw-bom__noship');
  const nsRows = [...noShip.querySelectorAll('tbody tr:not(.scw-bom__group)')].map(cells);
  check('Not shipping: pre-existing + customer-supplied read off the name, no pricing columns',
    nsRows, [['Pre-existing PoE Switch Pre-existing', '1'], ['Customer-supplied Monitor Customer-supplied', '1']]);
  check('pre-existing / customer-supplied never count toward shipping', ship.textContent.indexOf('PoE Switch') < 0 && ship.textContent.indexOf('Monitor') < 0, true);
  // Toggle → by MDF / IDF. The tray REPAINTS IN PLACE: same element, still tagged for the
  // drawer to clear (a swapped-in fresh element lost the tag and lingered under the next tray).
  tray.querySelector('[data-scw-bom-set="loc"]').click();
  const tray2 = document.querySelector('.scw-bom');
  check('regrouping keeps the same element and the drawer tag; only one tray in the page',
    [tray2 === tray, tray2.classList.contains('scw-deploy-drawer__custom'), document.querySelectorAll('.scw-bom').length], [true, true, 1]);
  const g2 = [...tray2.querySelectorAll('.scw-bom__table')][0].querySelectorAll('.scw-bom__group');
  check('By MDF / IDF regroups the shipping rows by location, unassigned last and muted, toggle state persists',
    [[...g2].map(g => g.textContent), [...g2].map(g => g.classList.contains('scw-bom__group--none')), tray2.getAttribute('data-scw-bom-mode'), window.localStorage.getItem('scw:bom:mode')],
    [['Default MDF', 'IDF 01', 'No MDF / IDF'], [false, false, true], 'loc', 'loc']);
  const idfRows = [...tray2.querySelectorAll('.scw-bom__table')][0].querySelectorAll('tbody tr:not(.scw-bom__group):not(.scw-bom__total)');
  check('per-location rows carry their own qty and drops', cells(idfRows[0]), ['Informant 8.0 v5 · I-001 to I-003 3 new drops', 'INF-80-V5', '3', '$900.00', '−$150.00', '$750.00']);
  check('groups are set apart: the group row carries top padding + a rule, the first one less',
    [/\.scw-bom__group td \{[^}]*padding: 26px/.test(document.getElementById('scw-bom-css').textContent), /\.scw-bom__group:first-child td \{[^}]*padding-top: 10px/.test(document.getElementById('scw-bom-css').textContent)], [true, true]);
  // Toggle → by SOW (the SOW item's field_2154; shared lines name both SOWs; unlinked last)
  tray.querySelector('[data-scw-bom-set="sow"]').click();
  const g3 = [...tray.querySelectorAll('.scw-bom__table')][0].querySelectorAll('.scw-bom__group td');
  check('By SOW groups by the SOW the line came from, "SOW n" labels, shared lines under both names, no link last',
    [[...g3].map(g => g.textContent), tray.getAttribute('data-scw-bom-mode')], [['SOW 1524', 'SOW 1524 + SOW 1601', 'SOW 1601', 'No SOW'], 'sow']);
  const sowRows = [...tray.querySelectorAll('.scw-bom__table')][0].querySelectorAll('tbody tr:not(.scw-bom__group):not(.scw-bom__total)');
  check('rows under their SOW', [cells(sowRows[0])[0], cells(sowRows[1])[0], cells(sowRows[2])[0], cells(sowRows[3])[0], cells(sowRows[4])[0]],
    ['Informant 8.0 v5 · I-001 to I-005 3 new drops', 'Imperial 128 Channel 4K NVR v3', 'Junction Box', 'v2 16 Drive Mini-SAS Enclosure (Special Order) Special order', 'Cat6 Uplink']);
  // Re-open: the earlier tray is dropped, never stacked.
  window.SCW.bomTray.open();
  check('re-opening replaces the tray (one in the page), remembering the last grouping', [document.querySelectorAll('.scw-bom').length, opened.el.getAttribute('data-scw-bom-mode')], [1, 'sow']);
  window.localStorage.setItem('scw:bom:mode', 'bucket');
  // Sub scene: no pricing columns.
  document.body.innerHTML = '<div id="kn-scene_1353"><div id="scw-ws-v2-view_4056"><div class="scw-ws-v2-toolbar"><div class="scw-ws-v2-toolbar-group scw-ws-v2-toolbar-group--cta"></div></div></div></div>';
  // The sub grid carries no SKU column: the SKU column is left out entirely (a column with no data on any row never shows).
  window.Knack.views = { view_4056: models(install), view_4151: models(sow) };   // no SKU header on the sub grid → no SKU column
  (handlers['knack-view-render.view_4056.scwBomTray'] || []).forEach(fn => fn());
  setTimeout(() => {
    window.SCW.bomTray.open();
    const sub = opened.el;
    check('sub dashboard: no pricing, and no SKU column when the grid has no SKU header', [[...sub.querySelector('.scw-bom__table thead').querySelectorAll('th')].map(t => t.textContent), cells(sub.querySelector('.scw-bom__total'))], [['Product', 'Qty'], ['Shipping total', '14']]);
    console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
    process.exit(fails ? 1 : 0);
  }, 300);
}, 300);
