// jsdom smoke test: the sub bid document (scene_1149, view_3550) is ONE build for the preview
// page and the bid PDF. Driven by the real module and the real proposal-pdf-export over records
// taken from a survey dashboard dump of the test project (SR20: bids B465 and B24, 2026-10-28).
// Rules under test: items grouped by MDF/IDF then category; a REL_parent child sits under its
// parent priced or not; a dollar amount in the sub bid field prices a line whatever Require Sub
// Bid says; no-sub-bid items with no amount are SCW-provided (under their parent, else the
// location's closing list); services are project-wide; assumptions are their own section; the
// totals reconcile to the Bid Total Knack recorded; the submit payload's html / bidLineItems /
// grandTotal come from the same build.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#bids/edit-bid-package/6ae14fd6c1102c4a50124d4d' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.DOMParser = window.DOMParser; global.Node = window.Node;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, ajaxError() { return jqObj; }, length: 0 };
jq.fn = {}; jq.ajax = () => ({ done() { return this; }, fail() { return this; } });
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1149' }, getUserAttributes: () => ({ id: 'u', name: 'Tester', email: 'tester@getscw.com' }) };
global.Knack = window.Knack;
const renders = [];
window.SCW = {
  CONFIG: {}, debug() {}, onViewRender(v, fn) { renders.push([v, fn]); }, onSceneRender() {},
  isInternalUser() { return true; },
  projectId: { resolve() { return { id: '60524852230', source: 'derived' }; } }   // no banner()/footer(): the module's inline fallback renders
};
global.SCW = window.SCW;
for (const f of ['sub-bid-document.js', 'proposal-pdf-export.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const bd = window.SCW.bidDocument, pdf = window.SCW.pdfExport;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const textOf = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();

// ── the scene: view_3552 (bid header details) + view_3550 (the grid, hidden under the document) ──
const B465 = '6ae14fd6c1102c4a50124d4d', B24 = '6a14c1687cae8915d175c51c';
const ALL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sr20-bid-items.json'), 'utf8'));
const onBid = bidId => ALL.filter(r => (r.field_2415_raw || []).some(b => b.id === bidId));
function scene(header) {
  document.body.innerHTML =
    '<div id="kn-scene_1149" class="kn-scene">' +
      '<div id="view_3552" class="kn-view kn-details">' +
        '<div class="kn-label-none field_2638"><div class="kn-detail-body">' + header.title + ' |</div></div>' +
        '<div class="kn-detail field_2635"><div class="kn-detail-label">Expiration Date</div><div class="kn-detail-body">' + header.expires + '</div></div>' +
        '<div class="kn-detail field_666"><div class="kn-detail-label">Client Site</div><div class="kn-detail-body">Testies Coat Factory - Montague, MI</div></div>' +
        '<div class="kn-detail field_2410"><div class="kn-detail-label">Project Address</div><div class="kn-detail-body">11 Richland Street, Asheville, NC 28806</div></div>' +
        '<div class="kn-detail field_2631" style="display:none"><div class="kn-detail-label">CU task</div><div class="kn-detail-body">86xyz</div></div>' +
      '</div>' +
      '<div id="view_3550" class="kn-view kn-table">' +
        '<div class="view-header"><h2>Bid Items</h2></div>' +
        '<div class="kn-table-wrapper"><table class="kn-table"><tbody><tr id="6ae14fdd2c7afed0f49507bd"><td>Scout 8.0</td></tr></tbody></table></div>' +
        '<div class="kn-records-nav"></div>' +
      '</div>' +
      '<div id="view_3679" class="kn-view kn-form"><form><button type="submit">Finalize &amp; Submit to SCW</button></form></div>' +
    '</div>';
}
function load(records) {
  window.Knack.views.view_3550 = { model: { data: { models: records.map(r => ({ attributes: r })) }, view: { rows_per_page: 1000 } } };
}

// ════════════════════════════════════════════════════════════════════════
// B465 — the four brackets (REL_parent) under their cameras, one no-sub-bid camera closing the location
// ════════════════════════════════════════════════════════════════════════
scene({ title: '60524852230-SR20-B465', expires: '11/27/2026' });
load(onBid(B465));
check('the page render mounts the document, hides the table + the header view, keeps the table in the DOM',
  (() => { const ok = bd.render('view_3550'); const host = document.getElementById('view_3550');
           return [ok, !!host.querySelector('.scw-bid-doc .scw-bid-doc-body'), host.classList.contains('scw-bid-doc-host'),
                   document.getElementById('view_3552').classList.contains('scw-bid-doc-hidden'), !!host.querySelector('.kn-table tbody tr[id]'),
                   !!document.getElementById('scw-bid-doc-css')]; })(),
  [true, true, true, true, true, true]);
const m465 = bd.model('view_3550');
check('header: title (trailing | trimmed), expiration, the facts rows of view_3552 minus the hidden one, survey + bid tokens, project number',
  [m465.header.title, m465.header.expires, m465.header.facts.map(f => [f.k, f.v]), m465.header.survey, m465.header.bidNo, m465.header.projectNumber],
  ['60524852230-SR20-B465', '11/27/2026', [['Client Site', 'Testies Coat Factory - Montague, MI'], ['Project Address', '11 Richland Street, Asheville, NC 28806']], 'SR20', 'B465', '60524852230']);
check('one location, tidied name; one category; the six priced cameras in canonical order',
  [m465.locations.map(L => L.name), m465.locations[0].buckets.map(B => [B.title, B.items.map(i => i.label)])],
  [['HEADEND: behind cashregister'], [['Cameras', ['E-011', 'E-012', 'E-013', 'E-013', 'E-014', 'RA-E-200']]]]);
const cams = m465.locations[0].buckets[0].items;
check('each bracket sits under its camera as an unpriced SCW-provided child; the AXIS cameras (mount included) carry none',
  cams.map(i => [i.product.slice(0, 14), i.children.map(c => [c.product.slice(0, 26), c.priced, c.qty])]),
  [['Scout 8.0', [['Electrical Box Mount for T', false, 1]]], ['[SPECIAL ORDER', []], ['The Viking 8.0', [['Electrical Box Mount for V', false, 1]]],
   ['[SPECIAL ORDER', []], ['The Observer 5', [['Electrical Box Mount for T', false, 1]]], ['Beacon 8.0', [['Electrical Box Mount for T', false, 1]]]]);
check('the labor description splits into its bold title and body; the camera facts read off the install-detail fields',
  [cams[0].descTitle, cams[0].desc.slice(0, 40), cams[0].details, cams[1].details],
  ['Mount Camera & Complete Cabling to Network', 'Install and terminate new structured net',
   [['Cable', 'New drop, 150 ft'], ['Location', 'Interior'], ['Height', "Under 16'"]],
   [['Cable', 'Existing cable'], ['Location', 'Exterior, plenum'], ['Height', "Under 16'"]]]);
check('the no-sub-bid camera with no amount and no parent closes the location, with its label and category',
  m465.locations[0].provided.map(p => [p.label, p.product.slice(0, 20), p.where, p.qty]),
  [['E-012', '[PRICING INCREASE EF', 'Cameras', 1]]);
check('totals: 6 priced items at $625, 5 SCW-provided (5 units), $3,750 — the Bid Total Knack recorded on B465',
  [m465.totals.pricedCount, m465.totals.providedCount, m465.totals.units, m465.totals.grand, m465.totals.grandText, m465.totals.lines],
  [6, 5, 5, 3750, '$3,750.00', [{ label: 'HEADEND: behind cashregister', value: '$3,750.00', amount: 3750 }]]);
check('the seven default assumptions are a section of their own, title + catalog text',
  [m465.assumptions.length, m465.assumptions[0].title, m465.assumptions[0].text.slice(0, 30)],
  [7, 'Appointed Representative', 'An appointed representative, t']);
check('bidLineItems: one entry per priced line with the Make keys (qty number, rate / cost money strings) plus label and record id',
  m465.lineItems.map(l => [l.label, l.mdfIdf, l.bucket, l.qty, l.rate, l.cost, l.parent, l.recordId.length]),
  [['E-011', 'HEADEND: behind cashregister', 'Cameras', 1, '$625.00', '$625.00', '', 24], ['E-012', 'HEADEND: behind cashregister', 'Cameras', 1, '$625.00', '$625.00', '', 24],
   ['E-013', 'HEADEND: behind cashregister', 'Cameras', 1, '$625.00', '$625.00', '', 24], ['E-013', 'HEADEND: behind cashregister', 'Cameras', 1, '$625.00', '$625.00', '', 24],
   ['E-014', 'HEADEND: behind cashregister', 'Cameras', 1, '$625.00', '$625.00', '', 24], ['RA-E-200', 'HEADEND: behind cashregister', 'Cameras', 1, '$625.00', '$625.00', '', 24]]);
check('description keeps the old flattened shape (product + labor) for Make; productName / laborDescription are the split parts',
  [m465.lineItems[0].productName, m465.lineItems[0].laborDescription.indexOf('Mount Camera & Complete Cabling to Network Install and terminate') === 0, m465.lineItems[0].description.slice(0, 20)],
  ['Scout 8.0', true, 'Scout 8.0 Mount Came']);

// ── the PDF document is the page's render ──
const doc465 = bd.documentHtml('view_3550');
const pdfDom = new DOMParser().parseFromString(doc465, 'text/html');
check('documentHtml is a complete document: title, @page css in head AND at the top of body, the same body the page shows',
  [pdfDom.title, /@page \{ size: letter/.test(pdfDom.head.innerHTML), /@page \{ size: letter/.test(pdfDom.body.innerHTML),
   textOf(pdfDom.querySelector('.scw-bid-doc-body')) === textOf(document.querySelector('#view_3550 .scw-bid-doc-body'))],
  ['60524852230-SR20-B465', true, true, true]);
check('the document reads top to bottom: project number, title, facts, Bid Items, the location, its items, Not priced ×5, assumptions, Bid total',
  (() => { const t = textOf(pdfDom.body); const idx = s => t.indexOf(s);
           return [idx('Project # 60524852230') >= 0 || idx('60524852230') >= 0, idx('60524852230-SR20-B465') > 0, idx('Client Site') > idx('Bid expires: 11/27/2026'),
                   idx('Bid Items') > idx('Project Address'), idx('HEADEND: behind cashregister') > idx('Bid Items'), idx('E-011') > idx('HEADEND'),
                   (doc465.match(/>Not priced</g) || []).length, idx('General Project Assumptions') > idx('RA-E-200'),
                   idx('Bid total') > idx('General Project Assumptions') && t.indexOf('$3,750.00', idx('Bid total')) > 0,
                   idx('Accessory') === -1, idx('Other SCW-provided equipment') > idx('RA-E-200')]; })(),
  [true, true, true, true, true, true, 5, true, true, true, true]);

// ── proposal-pdf-export (scene_1149 submit payload) takes html / bidLineItems / grandTotal from the document ──
const payload = pdf.buildPublishPayload('scene_1149');
check('the submit payload: html === the document, bidLineItems === the document lines, grandTotal from the document totals, the view published from the model',
  [payload.type, payload.sceneId, payload.html === doc465, JSON.stringify(payload.bidLineItems) === JSON.stringify(m465.lineItems), payload.grandTotal,
   payload.bidLabel, payload.bidExpirationDate, payload.htmlPdf === doc465],
  ['subcontractor bid', 'scene_1149', true, true, '$3,750.00', '60524852230-SR20-B465', '11/27/2026', true]);
check('the payload keeps the record snapshot for Make (every bid item, raw fields intact)',
  [Array.isArray(payload.json.view_3550), payload.json.view_3550.length, payload.json.view_3550.every(r => r.field_2415_raw.some(b => b.id === B465))],
  [true, 18, true]);

// ════════════════════════════════════════════════════════════════════════
// B24 — SCW-provided equipment in the closing list, no-sub-bid items the sub priced anyway, project-wide services
// ════════════════════════════════════════════════════════════════════════
scene({ title: '60524852230-SR20-B24', expires: '11/06/2026' });
load(onBid(B24));
bd.render('view_3550');
const m24 = bd.model('view_3550');
check('locations in order: HEADEND, IDF 01, Project Wide Services; categories in bucket sort order (default titles: the dump carries no type of system)',
  m24.locations.map(L => [L.name, L.buckets.map(B => B.title)]),
  [['HEADEND: behind cashregister', ['Networking and Headend', 'Other Equipment', 'Cameras']], ['IDF 01: Guard Shack', ['Networking and Headend', 'Cameras']], ['Project Wide Services', ['Services']]]);
check('category titles follow the type of system (field_2228) as the old grid renamed them: Video / Access Control',
  (() => { const t = sys => bd.build(onBid(B24).map(r => Object.assign({}, r, { field_2228_raw: [{ id: 'sys', identifier: sys }] })), {}).locations[0].buckets.map(B => B.title);
           return [t('Video'), t('Access Control')]; })(),
  [['NVRs, Switches, and Networking', 'Other Equipment', 'Cameras'], ['AC Controllers, Switches, and Networking', 'Other Equipment', 'Entries']]);
const head24 = m24.locations[0];
check('a no-sub-bid item WITH a sub bid amount is an ordinary priced line (the cabinets, 2 × $1,000; E-012 Warrior at $725)',
  [head24.buckets[1].items.map(i => [i.product.slice(0, 32), i.qty, i.rate, i.amount]),
   m24.locations[1].buckets[1].items.filter(i => i.label === 'E-012').map(i => [i.product, i.rate])],
  [[['[SPECIAL ORDER] 9u 600mm Network', 2, 1000, 2000]], [['The Warrior 8.0 v5', 725]]]);
check('no-sub-bid items with no amount and no parent close the HEADEND: hard drives ×3, UPS, WattBox',
  head24.provided.map(p => [p.product.slice(0, 18), p.qty, p.where]),
  [['Hard Drive, 24TB', 3, 'Other Equipment'], ['Standby UPS & Batt', 1, 'Other Equipment'], ['WattBox IP Power C', 1, 'Other Equipment']]);
check('the switch lists only connected devices that are on this bid (the second E-001 is on no bid)',
  head24.buckets[0].items[0].details, [['Connected devices', 'E-001, E-003, E-004, E-005, E-010, RA-E-003']]);
check('the description-only service is its own line under Project Wide Services, the labor text as its name',
  m24.locations[2].buckets[0].items.map(i => [i.label, i.product, i.descTitle, i.desc, i.amount]),
  [['', 'configure alarm input / outputs', '', '', 750]]);
check('totals reconcile: $7,850 + $6,675 + $750 = $15,275, the Bid Total Knack recorded on B24; 20 priced, 3 SCW-provided (5 units)',
  [m24.totals.lines.map(t => [t.label, t.value]), m24.totals.grandText, m24.totals.pricedCount, m24.totals.providedCount, m24.totals.units],
  [[['HEADEND: behind cashregister', '$7,850.00'], ['IDF 01: Guard Shack', '$6,675.00'], ['Project Wide Services', '$750.00']], '$15,275.00', 20, 3, 5]);
check('a survey note rides its line, line breaks kept; the $0 NVR is still a priced line',
  [head24.buckets[0].items[1].note, head24.buckets[0].items[1].amount, head24.buckets[0].items[1].rate],
  [['asdfasdfasf -- testing second removal'], 0, 0]);

// ════════════════════════════════════════════════════════════════════════
// Edge cases on edited copies of the B465 rows
// ════════════════════════════════════════════════════════════════════════
const clone = () => JSON.parse(JSON.stringify(onBid(B465)));
const byId = (rows, id) => rows.find(r => r.id === id);
const BR_E011 = '6ae14fe04379b15e61877405', BR_E013 = '6ae14fe53388147407b541a7', BR_E014 = '6ae14fe9c963aef8cedb93bc', BR_RA200 = '6ae14fec3388147407b5a975';
const CAM_E011 = '6ae14fdd2c7afed0f49507bd', DET_E012 = '6ae14fe176522395133c17c4', AX_E012 = '6ae14fed1f0bb8e66d99e4ef', AX_E013 = '6ae14ff055b55c39cfe68717';
{
  const rows = clone();
  byId(rows, BR_E011).field_2400_raw = 40; byId(rows, BR_E011).field_2400 = '$40.00';            // a bracket with a sub bid
  byId(rows, BR_E014).field_2478_raw = true; byId(rows, BR_E014).field_2478 = 'Yes';              // Require Sub Bid = Yes, no amount
  byId(rows, BR_RA200).field_2416_raw = [{ id: DET_E012, identifier: 'E-012' }];                  // parent is in the closing list
  const extra = JSON.parse(JSON.stringify(byId(rows, BR_E013))); extra.id = 'f'.repeat(24);
  extra.field_2416_raw = [{ id: 'a'.repeat(24), identifier: 'E-001' }]; rows.push(extra);         // parent not on this bid
  byId(rows, AX_E012).field_2416_raw = [{ id: AX_E013, identifier: 'E-013' }];                   // a cycle
  byId(rows, AX_E013).field_2416_raw = [{ id: AX_E012, identifier: 'E-012' }];
  const m = bd.build(rows, { title: 't' });
  const cam = m.locations[0].buckets[0].items;
  check('a child with a sub bid amount is a PRICED child under its parent (Accessory, $40 counted; a bracket carries no labor text); Require Sub Bid = Yes with no amount is a priced $0 child',
    [cam[0].children.map(c => [c.priced, c.rate, c.amount, c.descTitle]), cam.find(i => i.label === 'E-014').children.map(c => [c.priced, c.amount])],
    [[[true, 40, 40, '']], [[true, 0]]]);
  check('a child whose parent closes the location sits under that parent in the closing list; the two cycle rows stand alone (the Viking keeps its own bracket)',
    [m.locations[0].provided.map(p => [p.label, p.children.map(c => c.product.slice(0, 24))]), cam.filter(i => i.label === 'E-012' || i.label === 'E-013').map(i => [i.product.slice(0, 10), i.children.length])],
    [[['E-012', ['Electrical Box Mount for']], ['', []]], [['[SPECIAL O', 0], ['The Viking', 1], ['[SPECIAL O', 0]]]);
  check('a parent that is not on this bid: the unpriced bracket stands alone and names it',
    m.locations[0].provided[1].where, 'Mounting Hardware · for E-001');
  check('the priced children count ONCE in the totals and ride bidLineItems with their own category and the parent named',
    [m.totals.grand, m.totals.pricedCount, m.totals.providedCount, m.lineItems.length, m.lineItems.filter(l => l.parent).map(l => [l.label, l.parent, l.cost, l.bucket])],
    [3790, 8, 4, 8, [['', 'E-011', '$40.00', 'Mounting Hardware'], ['', 'E-014', '$0.00', 'Mounting Hardware']]]);
  const html = bd.bodyHtml(m, {});
  check('the priced children render the Accessory chip with rate and total; the four unpriced rows read Not priced',
    [(html.match(/>Accessory</g) || []).length, (html.match(/>Not priced</g) || []).length, html.indexOf('$40.00') > 0], [2, 4, true]);
}
{
  const rows = clone();
  const gc = JSON.parse(JSON.stringify(byId(rows, BR_E013))); gc.id = 'e'.repeat(24);
  gc.field_2416_raw = [{ id: BR_E011, identifier: '' }]; gc.field_2379 = gc.field_2379_raw = 'Weather Shroud'; rows.push(gc);   // bracket of a bracket
  const m = bd.build(rows, {});
  check('a grandchild rides under the top-level parent', m.locations[0].buckets[0].items[0].children.map(c => c.product.slice(0, 14)), ['Electrical Box', 'Weather Shroud']);
}
{
  const rows = clone().map(r => { const c = Object.assign({}, r); delete c.field_2416_raw; delete c.field_2416; delete c.field_2412_raw; delete c.field_2412; return c; });
  scene({ title: '60524852230-SR20-B465', expires: '11/27/2026' });
  load(rows);
  const warned = []; const origWarn = console.warn; console.warn = (...a) => warned.push(a.join(' '));
  bd.render('view_3550'); bd.render('view_3550');
  console.warn = origWarn;
  check('missing columns: one console warning naming them, an amber note for staff, every bracket falls to the closing list',
    [warned.filter(w => /missing columns/.test(w)).length, /field_2416 \(parent\), field_2412 \(note\)/.test(warned[0] || ''),
     !!document.querySelector('#view_3550 .scw-bid-doc-note'), bd.model('view_3550').locations[0].provided.length],
    [1, true, true, 5]);
}
{
  // The export falls back to the table scrape when the model is not there.
  scene({ title: '60524852230-SR20-B465', expires: '11/27/2026' });
  window.Knack.views.view_3550 = { model: { data: null } };
  const p = pdf.buildPublishPayload('scene_1149');
  check('no model: publishView / documentHtml / lineItems are empty and the export scrapes the table instead',
    [bd.publishView('view_3550'), bd.documentHtml('view_3550'), bd.lineItems('view_3550'), p && /<html>/.test(p.html), p && p.html.indexOf('scw-bid-doc-body') === -1],
    [null, '', null, true, true]);
}
check('bindings: the module listens on the host view render', renders.map(r => r[0]), ['view_3550']);

console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: ALL PASS');
process.exit(fails ? 1 : 0);
