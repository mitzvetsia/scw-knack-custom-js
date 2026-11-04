// jsdom test: Mark Ready never sends a survey request it cannot name (2026-11-04, SOW 2083). The SOW
// read FLAG_survey requested = Yes and FLAG_ready for survey = No, the pending-requests grid view_4141
// was EMPTY (no PENDING request linked to the SOW) and SR438 was already on the project — yet the
// stepper armed from those two flags, labelled the step "Send Pending Survey Request" and posted the
// send with surveyRequestId ''. Make 04.04 reads the request by that id and stopped at its first module.
// Drives the real ops-stepper.js:
//   - grid on the page, no row → not armed, plain label, a banner that names the survey already there;
//   - grid on the page, a PENDING row linked to this SOW → armed, the send carries that row's id;
//   - grid not on the page (legacy) → the flag fallback still arms, but the send is SKIPPED (no id)
//     and the user is told no survey went out — one POST (mark ready), never a second with an empty id.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#proposal/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
const posts = [];
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;
jq.ajax = function (o) {
  posts.push({ url: o.url, body: JSON.parse(o.data || '{}') });
  setTimeout(() => o.success({ success: true }, 'success', { status: 200 }), 0);
};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1096' }, getUserAttributes() { return { id: 'u1', name: 'Ops', email: 'ops@getscw.com' }; } };
global.Knack = window.Knack;
window.SCW = { CONFIG: { MAKE_OPS_MARK_READY_WEBHOOK: 'https://hook/mark-ready', MAKE_SEND_PENDING_SURVEY_WEBHOOK: 'https://hook/send-survey' },
  debug() {}, onViewRender() {}, onSceneRender() {},
  knackRecordUrl(v, id) { return 'https://api/' + v + '/' + id; }, knackAjax() { return { then() {} }; } };
global.SCW = window.SCW;
const alerts = []; window.alert = global.alert = (m) => { alerts.push(m); };
window.close = () => {};
const SOW = '6aeb71633f560fad802414fe';
function detail(key, text) { return '<div class="kn-detail ' + key + '"><div class="kn-detail-body">' + text + '</div></div>'; }
// grid: undefined = not on the page; [] = empty; [{id, status, sow}] = rows
function page(grid) {
  document.body.innerHTML =
    '<div class="kn-view" id="view_3345"></div>' +
    '<div class="kn-view kn-details" id="view_3861">' +
      detail('field_2952', 'proposal') + detail('field_2706', 'Yes') + detail('field_2723', 'No') + detail('field_2728', '1') +
    '</div>' +
    '<div class="kn-view kn-table" id="view_3897"><table><tbody>' +
      '<tr id="6aeb928ac5a446613f272775"><td class="field_2347">Secure Vision Solutions</td><td class="field_2345">-SR438</td>' +
      '<td class="field_2351">11/04/2026 8:16pm</td><td class="field_2349">Site Visit Requested</td></tr>' +
    '</tbody></table></div>' +
    (grid === undefined ? '' :
      '<div class="kn-view kn-table" id="view_4141"><table><tbody>' +
        (grid.length ? grid.map(r => '<tr id="' + r.id + '"><td class="field_2992">' + r.status + '</td>' +
          '<td class="field_2329">' + (r.sow ? '<span class="' + r.sow + '" data-kn="connection-value">2083</span>' : '&nbsp;') + '</td></tr>').join('')
          : '<tr class="kn-tr-nodata"><td>No data</td></tr>') +
      '</tbody></table></div>');
  window.Knack.views = { view_3861: { model: { attributes: { id: SOW } } } };
}
page([]);
new Function('window', 'document', '$', 'Knack', 'SCW', fs.readFileSync(path.join(__dirname, '../../src/features/ops-stepper.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
const step = () => [...document.querySelectorAll('#view_3345 .scw-step-action')].find(a => /Mark Ready/.test(a.textContent));
const rerender = () => (handlers['knack-view-render.view_3861.scwOpsStepper'] || handlers['knack-view-render.view_3345.scwOpsStepper'] || []).forEach(fn => fn());
async function fire() {
  posts.length = 0; alerts.length = 0;
  step().click();
  await sleep(50);
  const modal = document.querySelector('.scw-ops-modal-submit');
  const banner = txt(document.body.lastElementChild);
  modal.click();
  await sleep(400);
  return { banner };
}

(async () => {
  await sleep(260);
  // ── SOW 2083 as it was: the grid on the page, empty; SR438 on the project ──
  check('empty grid: not armed, and the step is the plain Mark Ready',
    [window.SCW.opsStepper.armedSurveyCount(), !!step(), txt(step())], [0, true, 'Mark Ready for Survey']);
  let r = await fire();
  check('empty grid: the modal says the survey is already requested (SR438) and nothing will be sent',
    /Validation only\. A survey is already requested on this SOW \(SR438 on this project\)/.test(r.banner), true);
  check('empty grid: one POST (mark ready) carrying pendingSurveyCount 0, no survey send',
    [posts.map(p => p.url), posts[0] && posts[0].body.pendingSurveyCount], [['https://hook/mark-ready'], 0]);

  // ── a PENDING request linked to this SOW ──
  page([{ id: '6aeb7000000000000000aaaa', status: 'PENDING', sow: SOW }]);
  rerender(); await sleep(260);
  check('a PENDING row on this SOW: armed, the step names the send',
    [window.SCW.opsStepper.armedSurveyCount(), txt(step())], [1, 'Mark Ready — Send Pending Survey Request']);
  r = await fire();
  check('a PENDING row on this SOW: the send carries that request id',
    posts.map(p => [p.url, p.body.surveyRequestId === undefined ? null : p.body.surveyRequestId, p.body.pendingSurveyCount === undefined ? null : p.body.pendingSurveyCount]),
    [['https://hook/mark-ready', null, 1], ['https://hook/send-survey', '6aeb7000000000000000aaaa', null]]);
  check('the send names this SOW', posts[1] && posts[1].body.sowId, SOW);

  // ── a PENDING row with no SOW link never arms (unchanged) ──
  page([{ id: '6aeb7000000000000000bbbb', status: 'PENDING', sow: '' }]);
  rerender(); await sleep(260);
  check('a PENDING row with no SOW link: not armed', window.SCW.opsStepper.armedSurveyCount(), 0);

  // ── the grid not on the page: the legacy flag fallback arms, the send is skipped ──
  page(undefined);
  rerender(); await sleep(260);
  check('no grid on the page: the flag fallback still arms', window.SCW.opsStepper.armedSurveyCount(), 1);
  r = await fire();
  check('no grid: one POST (mark ready), the send with no id is never posted',
    posts.map(p => p.url), ['https://hook/mark-ready']);
  check('no grid: the user is told no survey went out',
    alerts.some(a => /marked ready, but no survey was sent: no PENDING survey request is linked to this SOW/.test(a)), true);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
