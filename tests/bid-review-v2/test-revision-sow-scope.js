// jsdom smoke test: on the reconcile page a sales revision shows under the SOW it was raised on.
// A line item shared by the original and an alternate SOW is a row in BOTH SOW sections; before,
// the pending card, the per-item history and the per-SOW history strip all followed the ROW, so a
// revision filed from the alternate's page surfaced under the Original tab too ("it comes through
// as the original scope of work", 2026-10-21). A revision whose stored JSON names a SOW now renders
// only in that section; one without (older rows) keeps following its item. Drives the real
// sales-revision-column.js over a seeded revision set.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/x/review-bids/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, each() { return jqObj; }, length: 0 };
function jq() { return jqObj; }
jq.fn = {}; jq.ajax = () => ({ done() { return this; }, fail() { return this; } });
window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  bidReviewV2: { CONFIG: { mountId: 'scw-bid-review-v2' } } };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/sales-revision-column.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const seam = window.SCW.salesRevHistory;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const SOW_A = '6a0000000000000000000a01';   // Original, 1979
const SOW_B = '6a0000000000000000000b02';   // Alternate, 1980
const idAt = (iso, tail) => (Math.floor(Date.parse(iso) / 1000)).toString(16).padStart(8, '0') + tail;
function section(sowId) {
  return '<section class="scw-bid-review-v2__sow" data-sow-id="' + sowId + '">' +
    '<div class="scw-bid-review-v2__sow-header"></div><table><thead><tr>' +
    '<th class="scw-bid-review-v2__pkg-col" data-pkg-id="pkg1">Bid 1</th></tr></thead><tbody>' +
    '<tr class="scw-bid-review-v2__row" data-sow-item-id="item1" data-row-id="item1">' +
    '<td class="scw-bid-review-v2__sow-cell"></td><td class="scw-bid-review-v2__pkg-col"></td></tr>' +
    '</tbody></table></section>';
}
document.body.innerHTML = '<div id="scw-bid-review-v2"><div class="scw-bid-review-v2-body">' +
  section(SOW_A) + section(SOW_B) + '</div></div>';
const rev = (tail, status, statusNorm, json, parent) => ({
  id: idAt('2026-10-21T12:00:00Z', tail), sowItemId: 'item1', parentRequestId: parent, status, statusNorm,
  origin: 'Sales', writable: true, html: '', json
});
seam._setRevisionData([
  // Raised from the alternate's page (new shape: the SOW rides in the JSON).
  rev('1111111111111111', 'Pending', 'pending', { action: 'revise', displayLabel: 'I-001', productName: 'Cam', sowId: SOW_B, sowLabel: '1980', fields: [] }, 'r1'),
  // Older revision: no SOW on record → follows its item, as before.
  rev('2222222222222222', 'Pending', 'pending', { action: 'revise', displayLabel: 'I-001', productName: 'Cam', fields: [] }, 'r2'),
  // Triaged revision raised from the alternate's page → history on 1980 only.
  rev('3333333333333333', 'Accepted', 'accepted', { action: 'remove', displayLabel: 'I-001', productName: 'Cam', sowId: SOW_B, sowLabel: '1980' }, 'r3'),
]);
seam.injectIntoV2();
const secA = document.querySelector('section[data-sow-id="' + SOW_A + '"]');
const secB = document.querySelector('section[data-sow-id="' + SOW_B + '"]');
const pendingCards = sec => sec.querySelectorAll('.scw-bid-review-v2__sow-cell .scw-bid-cr-card').length;
check('Original section shows only the revision with no SOW on record', pendingCards(secA), 1);
check('Alternate section shows both pending revisions', pendingCards(secB), 2);
check('the card names the SOW it was raised on', [...secB.querySelectorAll('.scw-bid-cr-card__sow')].map(e => e.textContent), ['Raised on SOW 1980']);
check('no SOW line on the older card', secA.querySelectorAll('.scw-bid-cr-card__sow').length, 0);
check('per-item history (the accepted remove) is on the Alternate only', [secA.querySelectorAll('.scw-sr-cellhist').length, secB.querySelectorAll('.scw-sr-cellhist').length], [0, 1]);
const stripItems = sec => sec.querySelectorAll(':scope > .scw-sr-sowhist .scw-sr-hitem').length;
check('per-SOW history strip: Original carries the one unscoped revision, Alternate all three', [stripItems(secA), stripItems(secB)], [1, 3]);
check('history heads name the SOW where the request carries it', [...secB.querySelectorAll(':scope > .scw-sr-sowhist .scw-sr-req__sow')].map(e => e.textContent), ['SOW 1980', 'SOW 1980']);
check('forSection without a section id passes everything through', seam.forSection([{ json: { sowId: SOW_B } }], '').length, 1);

// Re-running is idempotent (the grid observer re-injects on every data tick).
seam.injectIntoV2();
check('second pass does not duplicate cards', [pendingCards(secA), pendingCards(secB)], [1, 2]);

console.log('RESULT ' + (fails ? fails + ' FAILED' : 'all passed'));
process.exit(fails ? 1 : 0);
