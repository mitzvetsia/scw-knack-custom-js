// jsdom smoke test: the proposal document HTML (what Make renders to the PDF and builds the
// e-signatures agreement from) carries the recurring services section BELOW the project totals
// with a "billed separately" note under its title, and the e-sign element manifest emits that
// note as text right after the section header.
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
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/proposal-pdf-export.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const api = window.SCW.pdfExport;
const line = (label, value, type) => ({ label, value, type: type || 'total' });
const payload = {
  views: [
    { type: 'grid', title: 'Proposed Solution', sections: [{ label: 'MDF - Clubhouse', buckets: [], footer: { title: 'MDF - Clubhouse totals', lines: [line('Equipment', '$1,000.00'), line('Installation', '$500.00')] } }],
      projectTotals: { title: 'Project Totals', lines: [line('Equipment Total', '$1,000.00'), line('Installation Total', '$500.00'), line('Project Total', '$1,500.00')] } },
    { type: 'grid', title: 'Recurring Services', isRecurring: true, sections: [{ label: '', buckets: [], footer: { title: 'Recurring', lines: [line('Video Intercom License, annual', '$240.00')] } }] }
  ]
};
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const html = api.buildPdfHtml(payload);
const iTotals = html.indexOf('class="project-totals"'), iRec = html.indexOf('class="recurring-section"'), iNote = html.indexOf('class="recurring-note"');
check('recurring section renders after the project totals, with the billed-separately note under its title',
  [iTotals > 0 && iRec > iTotals, iNote > iRec, /billed separately on its own cycle\. Not included in the Project Totals above\./.test(html), html.indexOf('Recurring Services') < iNote],
  [true, true, true, true]);
const els = api.buildSowDocumentElements(html);
const texts = els.map(e => e.type + ':' + String(e.text || '').slice(0, 40));
const iHdr = texts.findIndex(t => t === 'text_header_two:Recurring Services');
check('e-sign manifest: the Recurring Services header is followed by the note as a text element',
  [iHdr >= 0, iHdr >= 0 && /^text_normal:Recurring — billed separately/.test(texts[iHdr + 1])], [true, true]);
console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
