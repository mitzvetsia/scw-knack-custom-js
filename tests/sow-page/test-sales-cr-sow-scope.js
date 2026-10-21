// jsdom smoke test: a sales change request names the SOW page it is raised on — on the envelope, on
// EVERY item (so each stored revision line carries it), in the HTML and the plain text — and the
// submitted-revision strips belong only on that SOW's page (2026-10-21: "even if we enter the
// revision on the alternate, it comes through as the original scope of work" — a line item shared by
// the original and an alternate SOW renders on both pages, so only the request can say where it was
// raised). Drives the real config.js / state.js / payload.js.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const SOW_A = '6a0000000000000000000a01';   // the original, 1979
const SOW_B = '6a0000000000000000000b02';   // the alternate the rep is on, 1980
const COMPANY = '6a000000000000000000c0c0';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://scwinstallation.knack.com/installationservices#sales-portal/company-details/' +
    COMPANY + '/scope-of-work-details/' + SOW_B + '/'
});
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
global.localStorage = window.localStorage; global.sessionStorage = window.sessionStorage;
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, each() { return jqObj; }, length: 0 };
function jq() { return jqObj; }
jq.fn = {};
jq.Deferred = () => { const d = { resolve() { return d; }, promise() { return d; }, then() { return d; }, fail() { return d; } }; return d; };
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = {
  views: { view_3586: { model: { data: { models: [
    { attributes: { id: 'item1', field_2154_raw: [{ id: SOW_A, identifier: '1979' }, { id: SOW_B, identifier: '1980' }] } },
    { attributes: { id: 'item2', field_2154_raw: [{ id: SOW_A, identifier: '1979' }] } }
  ] } } } },
  getUserAttributes() { return { id: 'u1', name: 'Rep', email: 'rep@getscw.com' }; },
  router: { current_scene_key: 'scene_1116' }
};
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, knackAjax() { return jq.Deferred(); }, knackRecordUrl() { return ''; } };
global.SCW = window.SCW;
function load(rel) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/sales-change-request/', rel), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
['config.js', 'state.js', 'payload.js'].forEach(load);
const ns = window.SCW.salesCR;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

ns.detectSowRecordId();
check('SOW id is read from the sales build page route', ns._state.sowRecordId(), SOW_B);
check('its label is the number Knack shows for THAT SOW', ns.sowDisplayLabel(), '1980');

ns._state.setPending({
  item1: { rowId: 'item1', action: 'revise', displayLabel: 'I-001', productName: 'Deputy 4.0',
    current: { field_1964: 1 }, requested: { field_1964: 2 }, changeNotes: 'two please' },
  item2: { rowId: 'item2', action: 'remove', displayLabel: 'I-002', productName: 'Deputy 4.0',
    current: {}, requested: {}, changeNotes: 'not needed' }
});
const p = ns.buildPayload(false);
check('envelope names the page SOW', [p.sowId, p.sowLabel], [SOW_B, '1980']);
check('every item names the page SOW', p.items.map(it => [it.sowId, it.sowLabel]), [[SOW_B, '1980'], [SOW_B, '1980']]);
check('the per-item JSON snapshot (what a revision line stores) carries it',
  p.items.map(it => { const j = JSON.parse(it.json); return [j.sowId, j.sowLabel]; }), [[SOW_B, '1980'], [SOW_B, '1980']]);
check('item plain text names the SOW', p.items[0].plainText.indexOf('for SOW 1980') !== -1, true);
check('combined HTML header names the SOW', ns.buildHtml().indexOf('For SOW 1980') !== -1, true);
check('combined plain text names the SOW', ns.buildPlainText().indexOf('For SOW: 1980') !== -1, true);
check('nothing names the other SOW', [p.items[0].plainText, ns.buildHtml(), ns.buildPlainText()].some(s => /1979/.test(s)), false);

// Which page shows a submitted revision's strip.
check('a revision raised on the other SOW is not this page\'s', ns.revisionOnThisSow({ json: { sowId: SOW_A } }), false);
check('a revision raised on this SOW is', ns.revisionOnThisSow({ json: { sowId: SOW_B } }), true);
check('an older revision with no SOW on record shows as before', ns.revisionOnThisSow({ json: {} }), true);
check('a revision with no JSON at all shows as before', ns.revisionOnThisSow({ json: null }), true);

// Navigating to the other SOW's page re-reads the route.
window.location.hash = '#sales-portal/company-details/' + COMPANY + '/scope-of-work-details/' + SOW_A + '/';
ns.detectSowRecordId();
check('after a hop to the original, the id follows the route', ns._state.sowRecordId(), SOW_A);
check('and the label follows it', ns.sowDisplayLabel(), '1979');


// ── Knack nests pages: the hash is NOT the page (2026-10-21, "the payload came across as 1642").
// Hopping from SOW A to SOW B inside the app leaves …/scope-of-work-details/<A>/scope-of-work-details/<B>.
window.location.hash = '#sales-portal/company-details/' + COMPANY + '/scope-of-work-details/' + SOW_A +
  '/scope-of-work-details/' + SOW_B + '/';
check('hash reader takes the DEEPEST SOW segment, not the first', ns._sowIdFromHash(), SOW_B);
ns.detectSowRecordId();
check('a nested route resolves to the SOW on screen (B), not the one the rep left (A)', ns._state.sowRecordId(), SOW_B);
check('and the request names that SOW', ns.buildPayload(false).sowLabel, '1980');

// The page's own SOW-bound view beats the hash entirely.
window.location.hash = '#sales-portal/company-details/' + COMPANY + '/scope-of-work-details/' + SOW_A + '/';
ns.detectSowRecordId();
check('hash-only read lands on A first', ns._state.sowRecordId(), SOW_A);
window.Knack.views.view_3827 = { model: { attributes: { id: SOW_B, field_2126: 'Alt' },
  view: { type: 'details', source: { object: 'object_106' } } } };
ns.detectSowRecordId();
check('the SOW details view on the scene wins over a hash that says A', ns._state.sowRecordId(), SOW_B);
check('resolver prefers the view', ns._resolveSowRecordId(), SOW_B);

// Any single-record view of the SOW object counts; a GRID of SOWs does not.
delete window.Knack.views.view_3827;
window.Knack.views.view_9001 = { model: { attributes: {}, data: { models: [] },
  view: { type: 'table', source: { object: 'object_106' } } } };
check('a SOW grid names no record → hash fallback (A)', ns._resolveSowRecordId(), SOW_A);
window.Knack.views.view_9002 = { model: { attributes: { id: SOW_B },
  view: { type: 'form', source: { object: 'object_106' } } } };
check('an unlisted SOW form view is found by its object', ns._resolveSowRecordId(), SOW_B);
window.Knack.views.view_9003 = { model: { attributes: { id: '6a0000000000000000000ffff' },
  view: { type: 'details', source: { object: 'object_3' } } } };
check('a details view of another object is ignored', ns._resolveSowRecordId(), SOW_B);
delete window.Knack.views.view_9001; delete window.Knack.views.view_9002; delete window.Knack.views.view_9003;

console.log('RESULT ' + (fails ? fails + ' FAILED' : 'all passed'));
process.exit(fails ? 1 : 0);
