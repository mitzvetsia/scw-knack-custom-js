// jsdom smoke test: co-stage-strip.js acceptance / status drift (2026-10-29). The ops strip
// reads the CO's acceptance off the hidden grid (view_4164, matched through the published
// proposals view_4125). When that acceptance is signed (or approved without a signature) while
// the SOW's status is still a pre-accepted stage, the strip replaces the stage's verbs with an
// amber notice that names the fix, and the header pill gets a "status not updated" tag. The sub
// strip has no acceptance grid and never reports drift.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1374"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#manage-change-order/69f0d4b567a35332e743cc27' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1374' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  worksheetV2: { data: { readRecords() { return []; } } } };
global.SCW = window.SCW;
window.alert = m => {};
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/co-stage-strip.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const ops = window.SCW.coStage, sub = window.SCW.coStageSub;

// The CO page: the header form with co-header-card's pill, the status details view, the
// published-proposals grid and the acceptance grid — all as Backbone-shaped stubs.
function setup(status, acc) {
  document.body.innerHTML =
    '<div id="view_4092"><form><div class="scw-co-hdr"><span class="scw-co-hdr-pill">' + status + '</span></div></form></div>' +
    '<div id="view_4109"></div><div id="view_4125"></div><div id="view_4164"></div>';
  window.Knack.views = {
    view_4109: { model: { attributes: { id: '69f0d4b567a35332e743cc27', field_2953: status } } },
    view_4125: { model: { data: { models: [{ id: 'prop1' }] } } },
    view_4164: { model: { data: { models: acc ? [{ attributes: acc }] : [] } } }
  };
}
const signedAcc = { id: 'acc1', field_2755_raw: [{ id: 'prop1', identifier: '63222296454-SW1855CO | 20261014-12069' }],
  field_2766: 'Yes', field_2766_raw: true, field_3309_raw: false, field_3310_raw: false };
const strip = () => document.getElementById('scw-co-stage');
const tag = () => document.querySelector('.scw-co-hdr-nb');

// 1. Issued on the SOW, signed on the acceptance → drift, notice, no stage verbs, header tag.
setup('Issued', signedAcc);
check('Issued + signed acceptance → drift', ops.getAcceptanceDrift(), { signed: true, noSignature: false, notBillable: false });
ops.refresh();
check('the strip carries the amber notice instead of the Issued copy and its Reopen button',
  [!!strip().querySelector('.scw-co-stage-drift'),
   strip().querySelector('.scw-co-stage-drift-title').textContent,
   !!strip().querySelector('[data-scw-co-act="reopen"]'), !!strip().querySelector('[data-scw-co-act="preview-issue"]')],
  [true, 'Signed by the client — status not updated', false, false]);
check('the notice names the stored status, the scenario and the fix',
  [/reads <b>Issued<\/b>/.test(strip().querySelector('.scw-co-stage-drift-body').innerHTML),
   /13\.06b/.test(strip().textContent), /set the CO status to Accepted/.test(strip().textContent)], [true, true, true]);
check('the header pill gets the amber tag', [tag() && tag().textContent, tag() && tag().className],
  ['Signed · status not updated', 'scw-co-hdr-nb scw-co-hdr-nb--nosig']);
check('the stepper still stands on Issued (the stored status is what it shows)',
  [...strip().querySelectorAll('.scw-co-step--current .scw-co-step-lbl')].map(n => n.textContent), ['Issued']);

// 2. Status caught up → no drift; the normal accepted card; tag gone.
setup('Accepted', signedAcc);
check('Accepted → no drift', ops.getAcceptanceDrift(), null);
ops.refresh();
check('accepted card renders, no notice, no header tag',
  [!!strip().querySelector('.scw-co-acc--signed'), !!strip().querySelector('.scw-co-stage-drift'), !!tag()], [true, false, false]);

// 3. Issued with an UNSIGNED acceptance → the ordinary Issued copy.
setup('Issued', Object.assign({}, signedAcc, { field_2766: 'No', field_2766_raw: false }));
check('unsigned acceptance → no drift', ops.getAcceptanceDrift(), null);
ops.refresh();
check('Issued copy + Reopen are back, no tag',
  [!!strip().querySelector('[data-scw-co-act="reopen"]'), !!strip().querySelector('.scw-co-stage-drift'), !!tag()], [true, false, false]);

// 4. An acceptance that belongs to some other proposal is not this CO's.
setup('Issued', Object.assign({}, signedAcc, { field_2755_raw: [{ id: 'propX', identifier: 'other' }] }));
check('acceptance on another proposal → no drift', ops.getAcceptanceDrift(), null);

// 5. Approved without a signature while the SOW still says Ops Review.
setup('Ops Review', Object.assign({}, signedAcc, { field_2766: 'No', field_2766_raw: false, field_3309_raw: true }));
check('no-signature approval + Ops Review → drift (noSignature)', ops.getAcceptanceDrift(), { signed: false, noSignature: true, notBillable: false });
ops.refresh();
check('notice title names the path', strip().querySelector('.scw-co-stage-drift-title').textContent,
  'Approved without a client signature — status not updated');
check('header tag reads Approved', tag().textContent, 'Approved · status not updated');

// 6. Unknown / blank / terminal statuses never flag.
setup('', signedAcc);
check('blank status → no drift', ops.getAcceptanceDrift(), null);
setup('Declined', signedAcc);
check('Declined → no drift', ops.getAcceptanceDrift(), null);
setup('Void', signedAcc);
check('Void → no drift', ops.getAcceptanceDrift(), null);

// 7. The sub strip has no acceptance read.
setup('Issued', signedAcc);
check('sub instance never reports drift', sub.getAcceptanceDrift(), null);

console.log(fails ? 'RESULT: ' + fails + ' FAILED' : 'RESULT: all passed');
process.exit(fails ? 1 : 0);
