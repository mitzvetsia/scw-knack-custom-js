// jsdom test: the sales SOW page's Survey Request card says "Not sent" when the request's stored status
// reads SUBMITTED but the project has no survey (2026-11-04, Denso: "why is this showing submitted when the
// survey request is actually pending?" — a 12/01/2025 request stored SUBMITTED, no SOW link, view_4155 empty).
// Drives the real survey-request-cards.js: the unsent card names why Ops's Mark Ready will not send it
// (status not PENDING, no REL_scope of work) and what to set; a survey on the project, or no survey grid on
// the page, keeps the stored status; a PENDING request linked to this SOW still reads "Sends when Ops
// validates", one with no SOW link says it will not.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const SOW = '6a465ad1bb00d991572419dd';
const REQ = '692decdf2722050a70d47071';
const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#sales/scope-of-work-details/' + SOW + '/' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, a, b) { const fn = typeof a === 'function' ? a : b; (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {} };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, onViewRender() {} };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/survey-request-cards.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();

// A page: the survey step, the SOW header, the request grid (one record), and optionally the project's surveys.
function page(req, surveys) {
  document.body.innerHTML =
    '<div class="scw-ktl-accordion"><div class="scw-ktl-accordion__header" data-view-key="view_3853">Request Site Survey</div></div>' +
    '<div class="kn-view kn-details" id="view_3827"><div class="kn-detail field_2917"><div class="kn-detail-body">0</div></div>' +
      '<div class="kn-detail field_2723"><div class="kn-detail-body">No</div></div></div>' +
    '<div class="kn-view kn-table" id="view_3876"></div>' +
    (surveys === undefined ? '' : '<div class="kn-view kn-table" id="view_4155"><table><tbody>' +
      (surveys ? surveys.map(id => '<tr id="' + id + '"><td>SR</td></tr>').join('') : '<tr class="kn-tr-nodata"><td>No data</td></tr>') +
      '</tbody></table></div>');
  window.Knack.views = {
    view_3827: { model: { attributes: { id: SOW, field_2917: '0', field_2723: 'No' } } },
    view_3876: { model: { data: { models: [{ attributes: Object.assign({
      id: REQ, field_1195: '12/01/2025', field_1191: 'Alex Owings', field_2329: '', field_2329_raw: [] }, req) }] } } }
  };
  window.SCW.surveyRequests.refresh();
}
const card = () => document.querySelector('#scw-srq-cards .scw-srqc');
const chip = () => txt(document.querySelector('#scw-srq-cards .scw-srqc__chip'));
const note = () => txt(document.querySelector('#scw-srq-cards .scw-srqc__armed-note'));
const unsent = () => document.querySelector('#scw-srq-cards [data-scw-srqc-unsent]');
const label = () => txt(document.querySelector('#scw-srq-cards .scw-srqc-label'));
const linked = { field_2329: 'SW1404', field_2329_raw: [{ id: SOW, identifier: '1404' }] };

page({ field_2992: 'SUBMITTED' }, null);
check('stored SUBMITTED, no SOW link, no survey on the project: "Not sent", amber, says why and what to set',
  [chip(), card().classList.contains('scw-srqc--armed'), label(),
   /Marked SUBMITTED, but no survey request exists on this project, so it was never sent\./.test(txt(unsent())),
   /its status reads SUBMITTED, not PENDING and it is not linked to a scope of work/.test(txt(unsent())),
   /set FLAG_status to PENDING and REL_scope of work to this SOW on the request record/.test(txt(unsent())),
   note(), window.SCW.surveyRequests.isUnsent(window.SCW.surveyRequests.getRecords()[0])],
  ['Not sent', true, 'Survey Request', true, true, true, '', true]);

page(Object.assign({ field_2992: 'SUBMITTED' }, linked), null);
check('linked to this SOW but still SUBMITTED with no survey: only the status fix is asked for',
  [chip(), /not linked/.test(txt(unsent())), /set FLAG_status to PENDING on the request record/.test(txt(unsent()))], ['Not sent', false, true]);

page({ field_2992: 'SUBMITTED' }, ['aaaaaaaaaaaaaaaaaaaaaaaa']);
check('a survey on the project: the stored SUBMITTED stands', [chip(), card().classList.contains('scw-srqc--armed'), !!unsent()], ['SUBMITTED', false, false]);

page({ field_2992: 'SUBMITTED' }, undefined);
check('no survey grid on the page: no evidence, the stored status stands', [chip(), !!unsent()], ['SUBMITTED', false]);

page(Object.assign({ field_2992: 'PENDING' }, linked), null);
check('PENDING and linked to this SOW: Pending, sends when Ops validates, no warning', [chip(), note(), !!unsent()], ['Pending', 'Sends when Ops validates', false]);

page({ field_2992: 'PENDING' }, null);
check('PENDING with no SOW link: says it will not send and asks for the SOW link only',
  [chip(), note(), /This request will not send when Ops validates\. Ops’s Mark Ready will not send it: it is not linked to a scope of work\./.test(txt(unsent())),
   /set REL_scope of work to this SOW on the request record/.test(txt(unsent())), /FLAG_status/.test(txt(unsent()))],
  ['Pending', 'Will not send when Ops validates', true, true, false]);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
