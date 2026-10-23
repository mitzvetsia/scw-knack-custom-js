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

// ── Configured to the Builder column, every bucket ────────────────────
// (productDescKinds: null = every bucket; the shipped default is ['services'] — see below)
grid.CONFIG.fields.productDesc = DESC;
grid.CONFIG.productDescKinds = null;
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
// ── Services only (the shipped default, 2026-10-23: productized services) ──
// An onboarding fee is a Services-bucket PRODUCT whose detail lives in the catalog description,
// with a separate labor description. The service shows its product header (hideL3 used to hide
// every services L3) and the description sub-row; an equipment product's description stays off
// under this gate; a description-only service (no product) renders as before — no L3, its text
// as the line.
const SVC = '6977caa7f246edf67b52cbcd';
const svcRec = Object.assign({}, rec, {
  id: 'r2', field_1946_raw: [], field_1946: '', field_2219_raw: conn(SVC, 'Other Services'), field_2219: 'Other Services', field_2218_raw: conn('so2', '60'), field_2218: '60',
  field_2208: 'Onboarding Fee', field_2019: 'Technician plugs in the onboarding hardware.',
  field_1964_raw: 1, field_1964: '1', field_2028_raw: 150, field_2028: '$150.00', field_2201_raw: 500, field_2201: '$500.00', field_2203_raw: 650, field_2203: '$650.00',
  [DESC]: '<p>Remote onboarding of the system: accounts, users, alerts and a 1-hour training session.</p>'
});
const plainSvc = Object.assign({}, svcRec, { id: 'r3', field_2208: '', field_2019: 'Permit filing with the city.', field_2201_raw: 0, field_2201: '$0.00', field_2028_raw: 250, field_2028: '$250.00', field_2203_raw: 250, field_2203: '$250.00', [DESC]: '' });
window.Knack.views.view_4140 = { model: { data: { models: [{ attributes: rec }, { attributes: svcRec }, { attributes: plainSvc }] } } };
grid.CONFIG.productDescKinds = ['services'];
const svcOnly = grid.buildPublishData('view_3341');
const allBuckets = svcOnly.sections.reduce((a, s) => a.concat(s.buckets || []), []);
const svcBucket = allBuckets.find(b => /service/i.test(b.label || ''));
const eqBucket  = allBuckets.find(b => /other equipment/i.test(b.label || ''));
check('services bucket: the productized service is a real L3 product entry (name, qty) carrying the description; the description-only one rides the label-less synthetic entry, as every service did before',
  svcBucket && svcBucket.products.map(p => [p.label, p.qty, p.productDesc || '']),
  [['Onboarding Fee', 1, 'Remote onboarding of the system: accounts, users, alerts and a 1-hour training session.'], ['', 0, '']]);
check('the productized service carries its labor line; the description-only service is its own line with the cost kept (never hidden like an assumption)',
  (() => { const prod = svcBucket.products[0], synth = svcBucket.products[1];
           return [prod.lineItems.map(li => li.label), synth.lineItems.map(li => li.label), synth.hideCost]; })(),
  [['Technician plugs in the onboarding hardware.'], ['Permit filing with the city.'], false]);
check('under the services-only gate the equipment product carries no description', eqBucket && eqBucket.products[0].productDesc, '');
const svcHtml = pdf.buildPdfHtml({ views: [Object.assign({ type: 'grid', title: 'T' }, svcOnly)] });
const jName = svcHtml.indexOf('Onboarding Fee'), jDesc = svcHtml.indexOf('Remote onboarding of the system'), jLabor = svcHtml.indexOf('Technician plugs in the onboarding hardware.');
check('PDF: "Onboarding Fee" product row, the quiet description under it, the labor description below that',
  [jName > 0, jDesc > jName, jLabor > jDesc, svcHtml.indexOf('Permit filing with the city.') > 0], [true, true, true, true]);
// ── Licenses (2026-10-23: "licenses need the product description on the proposal as well") ──
// The "Recurring Services or Licenses (billed separately)" section (view_3371, self-hosted) lists
// each license as product name + qty + cost and nothing else — the description is the line's only
// detail. The License bucket is 'default' to bucketKind (no rendering rule of its own), so the
// gate reads a description-only kind: 'license' by bucket id or by a label starting "Licen[cs]e".
const LIC = '645554dce6f3a60028362a6a';
const licRec = Object.assign({}, rec, {
  id: 'r4', field_1946_raw: [], field_1946: '', field_2219_raw: conn(LIC, 'License'), field_2219: 'License', field_2218_raw: conn('so3', '90'), field_2218: '90',
  field_2208: 'Pro Video Monitoring / Remote Guarding - 40 cameras - RG-SB-LT-40', field_2019: '',
  field_1964_raw: 1, field_1964: '1', field_2028_raw: 0, field_2028: '$0.00', field_2201_raw: 1200, field_2201: '$1,200.00', field_2203_raw: 1200, field_2203: '$1,200.00',
  field_2464_raw: undefined, field_2464: undefined,
  [DESC]: '<p>24/7 remote video monitoring of up to 40 cameras with live voice-down and dispatch; billed monthly.</p>'
});
delete licRec.field_2464_raw; delete licRec.field_2464;   // view_3371 serves no accessory column (noAccessories)
const licByLabel = Object.assign({}, licRec, { id: 'r5', field_2219_raw: conn('bk-unknown', 'Licenses'), field_2219: 'Licenses',
  field_2208: 'Cloud Storage - 30 days - CS-30', [DESC]: '<p>Cloud retention of every camera for 30 days.</p>' });
const licNoDesc = Object.assign({}, licRec, { id: 'r6', field_2208: 'Analytics License - AN-1', [DESC]: '' });
window.Knack.views.view_3371 = { model: { data: { models: [{ attributes: licRec }, { attributes: licByLabel }, { attributes: licNoDesc }] } } };
grid.CONFIG.productDescKinds = ['services', 'license'];   // the shipped default
const lic = grid.buildPublishData('view_3371');
const licProducts = lic.sections.reduce((a, s) => a.concat(s.buckets || []), []).reduce((a, b) => a.concat(b.products || []), []);
check('licenses view: every license is an L3 product entry; the description rides it when populated — by bucket id and by a "Licenses" label alike; a license without one carries none',
  licProducts.map(p => [p.label, p.qty, p.productDesc || '']),
  // (the two lines on the License bucket id group together; the label-only "Licenses" bucket is its own group after them)
  [['Pro Video Monitoring / Remote Guarding - 40 cameras - RG-SB-LT-40', 1, '24/7 remote video monitoring of up to 40 cameras with live voice-down and dispatch; billed monthly.'],
   ['Analytics License - AN-1', 1, ''],
   ['Cloud Storage - 30 days - CS-30', 1, 'Cloud retention of every camera for 30 days.']]);
const licHtml = pdf.buildPdfHtml({ views: [Object.assign({ type: 'grid', title: 'Recurring Services or Licenses (billed separately)', isRecurring: true }, lic)] });
const kName = licHtml.indexOf('RG-SB-LT-40'), kDesc = licHtml.indexOf('24/7 remote video monitoring'), kNext = licHtml.indexOf('CS-30');
check('PDF: the license product row, its quiet description directly under it, before the next license',
  [kName > 0, kDesc > kName, kNext > kDesc, (licHtml.match(/class="l4-row l4-proddesc"/g) || []).length], [true, true, true, 2]);
check('the shipped gate is still services + licenses only: the equipment product on the main grid carries no description',
  (() => { window.Knack.views.view_4140 = { model: { data: { models: [{ attributes: rec }, { attributes: svcRec }] } } };
           const d = grid.buildPublishData('view_3341'); const bs = d.sections.reduce((a, s) => a.concat(s.buckets || []), []);
           return [bs.find(b => /other equipment/i.test(b.label || '')).products[0].productDesc, bs.find(b => /service/i.test(b.label || '')).products[0].productDesc]; })(),
  ['', 'Remote onboarding of the system: accounts, users, alerts and a 1-hour training session.']);
check('taking "license" out of productDescKinds switches the license description off again (config, not code)',
  (() => { grid.CONFIG.productDescKinds = ['services']; const d = grid.buildPublishData('view_3371'); grid.CONFIG.productDescKinds = ['services', 'license'];
           return d.sections.reduce((a, s) => a.concat(s.buckets || []), []).reduce((a, b) => a.concat(b.products || []), []).map(p => p.productDesc || ''); })(),
  ['', '', '']);
// ── Line structure (2026-10-23: "no line breaks here is brutal") ─────────────────────────────
// The stored description is Knack rich text — one <p> per paragraph, <br>s, bold, lists. The flat
// read ran a six-paragraph license description into one 90-word run. descHtmlOf keeps the author's
// lines as <br />s (empty paragraphs dropped, bold + lists kept, every other tag gone); the payload
// carries it as productDescHtml beside the flat productDesc, the PDF renders the HTML variant and
// the e-sign manifest still reads the words with spaces between them.
const RICH = '<p>Per camera, per month &middot; <strong>12-month commitment</strong></p><p><br></p>' +
  '<p>Remote guarding for sites that are unoccupied on weekends.<br>Coverage: Saturday and Sunday, in the site\u2019s local time.</p>' +
  '<p class="ak-p" style="margin:0">Equipment: provided per site.</p><ul class="ak-ul"><li>RTSP or ONVIF streams at 720p</li><li>2 Mbps upload per camera</li></ul>' +
  '<p>Not included: cameras, speakers, alarm permits.</p><p>&nbsp;</p>';
check('descHtmlOf: paragraphs and <br>s become <br />, empty paragraphs vanish, bold stays (<strong> → <b>), lists stay, attributes and every other tag are gone',
  grid.descHtmlOf(RICH),
  'Per camera, per month · <b>12-month commitment</b><br />Remote guarding for sites that are unoccupied on weekends.<br />Coverage: Saturday and Sunday, in the site\u2019s local time.<br />' +
  'Equipment: provided per site.<ul><li>RTSP or ONVIF streams at 720p</li><li>2 Mbps upload per camera</li></ul>Not included: cameras, speakers, alarm permits.');
check('descHtmlOf: a list is a block of its own — no <br /> beside it (that reads as a blank line) — and never carries attributes',
  [grid.descHtmlOf('<p>Needs:</p><ul class="x"><li style="a">One</li></ul><p>Then.</p>'), grid.descHtmlOf('<ol><li>A</li></ol>')],
  ['Needs:<ul><li>One</li></ul>Then.', '<ol><li>A</li></ol>']);
check('descHtmlOf: plain text passes through; blank / tag-only input is empty', [grid.descHtmlOf('Just one line.'), grid.descHtmlOf('<p><br></p><p>&nbsp;</p>'), grid.descHtmlOf('')], ['Just one line.', '', '']);
const richLic = Object.assign({}, licRec, { id: 'r7', field_2208: 'Pro Video Monitoring — 12 Hour Weekdays PVM-1C-M-24HWEEKENDS', [DESC]: RICH });
window.Knack.views.view_3371 = { model: { data: { models: [{ attributes: richLic }] } } };
const richData = grid.buildPublishData('view_3371');
const richProd = richData.sections[0].buckets[0].products[0];
check('payload: productDesc stays the flat one-line text; productDescHtml carries the line breaks',
  [richProd.productDesc.indexOf('<') === -1, /commitment Remote guarding/.test(richProd.productDesc), (richProd.productDescHtml.match(/<br \/>/g) || []).length, /<b>12-month commitment<\/b>/.test(richProd.productDescHtml)],
  [true, true, 3, true]);
const richHtml = pdf.buildPdfHtml({ views: [Object.assign({ type: 'grid', title: 'Recurring Services or Licenses (billed separately)', isRecurring: true }, richData)] });
const richCell = new DOMParser().parseFromString(richHtml, 'text/html').querySelector('tr.l4-proddesc td.l4-desc');
check('PDF: the description cell renders the HTML variant — line breaks, inline-styled bold (no <b>), the list — in the quiet row',
  [richCell.querySelectorAll('br').length, richCell.querySelectorAll('span[style*="font-weight:700"]').length, richCell.querySelectorAll('b').length, richCell.querySelectorAll('li').length, richCell.textContent.indexOf('Not included') > 0],
  [3, 1, 0, 2, true]);
check('e-sign manifest: the description cell reads as words with spaces at every break, never glued across a <br />',
  (() => { const els = pdf.buildSowDocumentElements(richHtml); const tbl = els.find(e => e.type === 'table');
           const row = tbl && tbl.table_cells.find(r => /Per camera/.test(r[0].text));
           return [!!row, row && /commitment Remote guarding/.test(row[0].text), row && /weekends\. Coverage/.test(row[0].text), row && /720p 2 Mbps/.test(row[0].text)]; })(),
  [true, true, true, true]);
check('an older payload with only the flat productDesc still renders the row as escaped text',
  (() => { const d = JSON.parse(JSON.stringify(richData)); const pr = d.sections[0].buckets[0].products[0]; delete pr.productDescHtml; pr.productDesc = 'Flat <text> & more';
           const h = pdf.buildPdfHtml({ views: [Object.assign({ type: 'grid', title: 'T' }, d)] });
           const td = new DOMParser().parseFromString(h, 'text/html').querySelector('tr.l4-proddesc td.l4-desc'); return [td.textContent, td.querySelectorAll('br').length]; })(),
  ['Flat <text> & more', 0]);
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
