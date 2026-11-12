// jsdom smoke test: every worksheet warning icon explains itself on hover, and "missing model selection" sits in the
// product box (2026-11-12 — "wth is this icon? we need explanations on hover on all these icons" / "make it a simple
// warning icon but put it next to the product name"). warnings.js explain / explainCount carry the text; card.js uses
// them on the warning column and the detail label, summary.js on the group / grand chips; the survey placeholder is an
// amber triangle at the right end of the product box and no longer a chip in the warning column.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1085"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#build/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
const jq = () => jqObj; jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const V = 'view_3962';
const CAM = '6481e5ba38f283002898113c';
const conn = (id, name) => [{ id, identifier: name }];
const placeholder = { id: 'r1', field_1949: 'Camera Added During Survey - SURVEY-CAMERA', field_1949_raw: conn('p-ph', 'Camera Added During Survey - SURVEY-CAMERA'),
  field_1950: 'RA-E-007', field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: conn('L1', 'HEADEND: : MDF'), field_1964: 1, field_2197_raw: [] };
const noted = { id: 'r2', field_1949: 'Garrison 5.0', field_1949_raw: conn('p-cam', 'Garrison 5.0'), field_1950: 'E-002',
  field_2219_raw: conn(CAM, 'Camera / Reader'), field_1946_raw: conn('L1', 'HEADEND: : MDF'), field_1964: 1,
  field_2197_raw: conn('nvr', 'NVR'), field_1953: 'Customer wants this one on the <b>north</b> wall.' };
const records = [placeholder, noted];
window.Knack = { views: { [V]: { model: { data: { models: records.map(r => ({ attributes: r })) } } } }, router: { current_scene_key: 'scene_1085' } };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  sowColor: { dot: () => '#000', chipStyle: () => ({ bg: '#fff', border: '#000', text: '#000' }) } };
global.SCW = window.SCW;
for (const f of ['config.js', 'warnings.js', 'card.js', 'summary.js']) {
  new Function('window', 'document', '$', 'jQuery', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
ns.data = { readRecords: vk => (vk === V ? records : []) };
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

ns.warnings.analyze(records, V);
check('the analyzer flags the placeholder as missing model selection + not connected, and the noted camera as notes',
  [ns.warnings.getIssuesFor(V, 'r1').slice().sort(), ns.warnings.getIssuesFor(V, 'r2')], [['disconnected', 'surveyAdded'], ['notes']]);

check('every issue type has a hover explanation that is a sentence, not a two-word caption',
  ns.warnings.TYPES.map(t => [t, ns.warnings.EXPLAIN[t].length > 40 && /:/.test(ns.warnings.EXPLAIN[t])]),
  ns.warnings.TYPES.map(t => [t, true]));

// ── the placeholder card ──
const card = ns.card.buildCard(placeholder, V);
const chits = Array.from(card.querySelectorAll('.scw-ws-v2-warn-chit'));
check('the warning column no longer carries missing model selection; disconnected stays',
  chits.map(c => c.getAttribute('data-issue-type')), ['disconnected']);
check('the disconnected chip explains what it means and how to fix it',
  chits[0].title, 'Not connected: the camera / reader has no Connected Device (the NVR or switch it plugs into). Add it to that NVR or switch\'s Connected Devices.');
check('and carries the same text as its accessible name', chits[0].getAttribute('aria-label') === chits[0].title, true);
const prod = card.querySelector('.scw-ws-v2-cell--product');
const mark = prod && prod.querySelector('.scw-ws-v2-product-warn');
check('the product box carries the amber warning triangle at its end (after the name)',
  [!!mark, mark && mark.previousElementSibling && mark.previousElementSibling.className, prod.classList.contains('scw-ws-v2-cell--product-warn'),
   !!(mark && mark.querySelector('svg path[d^="M10.29 3.86"]'))],
  [true, 'scw-ws-v2-product-name', true, true]);
check('its hover names the placeholder and the fix',
  mark.title, 'Missing model selection: the line was added during the survey and still carries the placeholder product "Camera Added During Survey - SURVEY-CAMERA". Pick the real model in Product.');
check('the product box itself says what a click does', /placeholder from the survey\. Click to pick the real model\./.test(prod.title), true);
const dIc = card.querySelector('.scw-ws-v2-detail-warn-ic');
check('the red link icon beside "Connected Device" in the detail explains itself too',
  dIc ? dIc.title : null, chits[0].title);

// ── a card with no placeholder: no triangle ──
const card2 = ns.card.buildCard(noted, V);
check('a real product has no triangle', card2.querySelector('.scw-ws-v2-product-warn'), null);
const note = card2.querySelector('.scw-ws-v2-warn-chit[data-issue-type="notes"]');
check('the notes chip shows the note itself (tags stripped)', note && note.title, 'SCW notes: Customer wants this one on the north wall.');

// ── group / grand chips ──
const grandHtml = ns.summary.grandIssueChips([{ l2: [{ records }] }]);
const host = document.createElement('div'); host.innerHTML = grandHtml;
const sa = host.querySelector('[data-issue-type="surveyAdded"]');
check('the grand chip for missing model selection keeps the count and explains it',
  sa ? sa.title : grandHtml.slice(0, 200),
  '1 item — Missing model selection: the line was added during the survey and still carries the placeholder product. Click to highlight it in the worksheet.');
check('explainCount reads for several items', ns.warnings.explainCount('photos', 3, 'in this group'),
  '3 items — Missing photos: a required photo has not been uploaded yet. Click to highlight them in this group.');

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
