// jsdom test: a TBD proposal never gives the masked labor away through its subtotals (2026-11-04,
// SW2059 / quote 12348 v3: labor lines, Installation Total and Grand Total read TBD, yet every
// bucket and location subtotal was equipment + install to the dollar, $102,752 in all). Drives the
// real proposal-grid-v2.js + proposal-pdf-export.js:
//   - buildPublishData(view, { masked: true }) sums EQUIPMENT ONLY into the bucket footers and the
//     location Total (what the masked page shows); a services bucket with no equipment reads TBD and
//     its location gets no Total; unmasked, the numbers are equipment + labor as before;
//   - buildPublishPayload on the proposal scene with tbdMode true / false / undefined (field_2725):
//     the published HTML carries the equipment-only subtotals and TBD for every labor surface;
//   - a grid scraped off the page (the v1 fallback, no gridSource 'v2') gets TBD subtotals, since
//     labor cannot be taken back out of a printed figure; discount lines stay.
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
const money = n => '$' + n.toFixed(2);
// Two lines on view_4140 (the v2 data view): a camera at the MDF ($1,000 equipment + $500 install)
// and a service on no location ($300 install, no equipment).
function line(id, o) {
  return Object.assign({
    id, field_1946_raw: [], field_1946: '', field_2228_raw: conn('pt', 'Video'), field_2218_raw: conn('so', '10'), field_2218: '10',
    field_1964_raw: 1, field_1964: '1', field_2464_raw: [], field_2464: '', field_2303_raw: 0, field_2303: '$0.00'
  }, o);
}
const cam = line('r1', {
  field_1946_raw: conn('l1', 'HEADEND: : MDF'), field_1946: 'HEADEND: : MDF',
  field_2219_raw: conn('bk1', 'Cameras'), field_2219: 'Camera or Reader',
  field_2208: 'Warrior 8.0 v5 26BF8-V5', field_2019: 'Mount camera and associated hardware.',
  field_2201_raw: 1000, field_2201: money(1000), field_2028_raw: 500, field_2028: money(500), field_2203_raw: 1500, field_2203: money(1500)
});
const svc = line('r2', {
  field_2219_raw: conn('6977caa7f246edf67b52cbcd', 'Other Services'), field_2219: 'Other Services', field_2218_raw: conn('so', '90'), field_2218: '90',
  field_2208: '', field_2019: 'Project management, quality assurance, and project mobilization costs.',
  field_2201_raw: 0, field_2201: money(0), field_2028_raw: 300, field_2028: money(300), field_2203_raw: 300, field_2203: money(300)
});
window.Knack.views.view_4140 = { model: { data: { models: [{ attributes: cam }, { attributes: svc }] } } };

const bucketsOf = d => d.sections.reduce((a, s) => a.concat((s.buckets || []).map(b => ({ sec: s, b }))), []);
const footerOf = (d, label) => { const e = bucketsOf(d).find(x => x.b.footer && x.b.footer.label === label); return e ? e.b.footer.cost : null; };
const totalOf = (d, title) => { const s = d.sections.find(x => x.footer && x.footer.title === title); return s ? s.footer.lines.map(l => l.label + ' ' + l.value) : null; };

// ── the v2 builder ──────────────────────────────────────────────────────
const open = grid.buildPublishData('view_3341');
check('unmasked: the camera bucket and the MDF Total are equipment + labor; the services bucket is its labor',
  [footerOf(open, 'Cameras'), totalOf(open, 'HEADEND: MDF'), footerOf(open, 'Other Services')],
  ['$1,500.00', ['Total $1,500.00'], '$300.00']);
const masked = grid.buildPublishData('view_3341', { masked: true });
check('masked: the camera bucket and the MDF Total carry the equipment only',
  [footerOf(masked, 'Cameras'), totalOf(masked, 'HEADEND: MDF')], ['$1,000.00', ['Total $1,000.00']]);
check('masked: the services bucket reads TBD and its section has no Total',
  [footerOf(masked, 'Other Services'), masked.sections.filter(s => s.footer).map(s => s.footer.title)], ['TBD', ['HEADEND: MDF']]);
check('masked: the equipment line and the product cost are unchanged',
  bucketsOf(masked).find(x => x.b.label === 'Cameras').b.products[0].cost, '$1,000.00');

// ── end to end: the proposal scene's publish payload ────────────────────
document.body.innerHTML =
  '<div id="kn-scene_1096" class="kn-scene">' +
    '<div class="kn-view kn-table view_3341" id="view_3341"><div class="kn-table-wrapper"><table class="kn-table"><tbody><tr id="r1"><td class="field_2208">x</td></tr></tbody></table></div></div>' +
    '<div class="kn-view kn-details" id="view_3861"><div class="kn-detail field_2725"><div class="kn-detail-body">No</div></div></div>' +
  '</div>';
// The published payload carries the document as HTML (htmlPdf = the PDF's input, html = the snapshot).
const htmlOf = opts => { const p = pdf.buildPublishPayload('scene_1096', opts) || {}; return (p.htmlPdf || '') + (p.html || ''); };
// Labor $500 / $300, equipment + labor $1,500 / $1,800: none may appear in a TBD document.
const leaks = html => ['$500.00', '$300.00', '$1,500.00', '$1,800.00'].filter(m => html.indexOf(m) !== -1);
const tbdHtml = htmlOf({ tbdMode: true });
check('publish-sow-tbd: the document is built', tbdHtml.indexOf('Warrior 8.0 v5') !== -1, true);
check('publish-sow-tbd: no labor figure and no equipment + labor figure anywhere in the HTML', leaks(tbdHtml), []);
check('publish-sow-tbd: the equipment-only subtotal and TBD are there', [tbdHtml.indexOf('$1,000.00') !== -1, tbdHtml.indexOf('TBD') !== -1], [true, true]);
const finHtml = htmlOf({ tbdMode: false });
check('publish-final: subtotals carry the labor as before', [finHtml.indexOf('$1,500.00') !== -1, finHtml.indexOf('$300.00') !== -1], [true, true]);
check('field_2725 = No with no override: TBD, no leak', leaks(htmlOf({})), []);

// ── the page-scrape fallback ────────────────────────────────────────────
const scraped = { views: [{ type: 'grid', sections: [{ buckets: [{ label: 'Camera or Reader', products: [{ cost: '$1,000.00', lineItems: [{ cost: '$500.00' }] }],
  footer: { label: 'Camera or Reader', qty: 0, cost: '$1,500.00' } }],
  footer: { title: 'HEADEND: : MDF', lines: [{ type: 'sub', label: 'Subtotal', value: '$1,600.00' }, { type: 'disc', label: 'Discount', value: '-$100.00' }, { type: 'final', label: 'Total', value: '$1,500.00' }] } }] }] };
pdf.applyTbdToPublishPayload(scraped);
const ss = scraped.views[0].sections[0];
check('page-scraped grid: bucket and location subtotals read TBD, the discount stays, the equipment line stays',
  [ss.buckets[0].footer.cost, ss.footer.lines.map(l => l.value), ss.buckets[0].products[0].cost, ss.buckets[0].products[0].lineItems[0].cost],
  ['TBD', ['TBD', '-$100.00', 'TBD'], '$1,000.00', 'TBD']);
const v2view = { views: [{ type: 'grid', gridSource: 'v2', sections: [{ buckets: [{ products: [], footer: { label: 'X', cost: '$1,000.00' } }], footer: { title: 'T', lines: [{ type: 'final', label: 'Total', value: '$1,000.00' }] } }] }] };
pdf.applyTbdToPublishPayload(v2view);
check('a v2 grid keeps its (already equipment-only) subtotals', [v2view.views[0].sections[0].buckets[0].footer.cost, v2view.views[0].sections[0].footer.lines[0].value], ['$1,000.00', '$1,000.00']);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
