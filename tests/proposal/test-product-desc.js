// jsdom smoke test: the product's catalog description renders as a QUIET sub-row directly under
// the L3 product name — on the proposal PDF (from the grid-v2 publish payload) — and the payload
// carries it only when CONFIG.fields.productDesc names a column. Without the column nothing
// changes: no row, no key.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#proposal/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.DOMParser = window.DOMParser; global.Node = window.Node;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1096' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
for (const f of ['proposal-grid-v2.js', 'proposal-pdf-export.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const grid = window.SCW.proposalGridV2, pdf = window.SCW.pdfExport;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const conn = (id, name) => [{ id, identifier: name }];
// One flat data-view record (view_4140), every PROBE_FIELD present, plus a stand-in description column.
const DESC = 'field_9999';
const rec = {
  id: 'r1', field_1946_raw: conn('l1', 'HEADEND: Server Room_Dmark'), field_1946: 'HEADEND: Server Room_Dmark',
  field_2228_raw: conn('pt', 'Video'), field_2219_raw: conn('bk', 'Other Equipment'), field_2219: 'Other Equipment', field_2218_raw: conn('so', '20'), field_2218: '20',
  field_2208: '[SPECIAL ORDER] 18-Channel 10A CCTV Power Supply SCW-PS18C', field_2019: 'Install power supply on wall.',
  field_1964_raw: 1, field_1964: '1', field_2028_raw: 398, field_2028: '$398.00', field_2201_raw: 126, field_2201: '$126.00',
  field_2203_raw: 524, field_2203: '$524.00', field_2464_raw: [], field_2464: '', field_2303_raw: 0,
  [DESC]: '<p>Rack-mountable 18-channel 12V DC power supply, 10A total, individually fused outputs.</p>'
};
window.Knack.views.view_4140 = { model: { data: { models: [{ attributes: rec }] } } };

function firstProduct(data) { return data.sections[0].buckets.find(b => b.products && b.products.length).products[0]; }

// ── Not configured (today): nothing changes ──────────────────────────
grid.CONFIG.fields.productDesc = '';
const off = grid.buildPublishData('view_3341');
check('field not configured → payload has no description, PDF has no l4-proddesc row',
  [firstProduct(off).productDesc, pdf.buildPdfHtml({ views: [Object.assign({ type: 'grid', title: 'T' }, off)] }).indexOf('class="l4-row l4-proddesc"')], ['', -1]);

// ── Configured to the Builder column ─────────────────────────────────
grid.CONFIG.fields.productDesc = DESC;
const on = grid.buildPublishData('view_3341');
check('payload carries the description, HTML stripped and whitespace-normalized',
  firstProduct(on).productDesc, 'Rack-mountable 18-channel 12V DC power supply, 10A total, individually fused outputs.');
const html = pdf.buildPdfHtml({ views: [Object.assign({ type: 'grid', title: 'T' }, on)] });
const iName = html.indexOf('SCW-PS18C'), iDesc = html.indexOf('class="l4-row l4-proddesc"'), iLabor = html.indexOf('Install power supply on wall.');
check('PDF: quiet l4-proddesc row sits under the product name and ABOVE the labor description',
  [iName > 0, iDesc > iName, iLabor > iDesc], [true, true, true]);
const frag = new DOMParser().parseFromString(html, 'text/html').querySelector('tr.l4-proddesc');
check('the row is an l4 (quiet) row, not a bold l3-product row, with empty qty / cost cells',
  [frag.classList.contains('l4-row'), frag.classList.contains('l3-product'), frag.querySelector('.col-qty').textContent, frag.querySelector('.col-cost').textContent],
  [true, false, '', '']);
check('the e-sign element manifest carries the description as an unbolded cell',
  (() => { const els = pdf.buildSowDocumentElements(html); const tbl = els.find(e => e.type === 'table');
           const row = tbl && tbl.table_cells.find(r => /Rack-mountable/.test(r[0].text)); return [!!row, row && (row[0].styles || []).includes('bold')]; })(),
  [true, false]);
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
