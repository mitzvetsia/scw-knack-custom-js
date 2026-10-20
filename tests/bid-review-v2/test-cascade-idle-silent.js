// jsdom smoke test: bid-review-v2/data.js answers scw-cascade-idle two ways (2026-10-20 deep dive).
// A LOUD batch (a user's cascade) refetches every source view, as before. A SILENT batch — only the
// connection-sync accessory-SOW sweep's background repairs, which patch their own local models —
// rebuilds from the models and issues NO fetch, because every source view on the reconcile page is
// a hidden Knack grid whose native re-render scrolls the page to the top.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155">' +
  '<div id="view_3680"></div><div id="view_3921"></div><div id="scw-bid-review-v2"></div></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#review-bids/6a2c00010000000000001111' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; } };
function jq() { return jqObj; } jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
let fetches = 0;
function view(n) {
  return { model: { data: { models: Array.from({ length: n }, (_, i) => ({ attributes: { id: 'r' + i } })) },
    fetch() { fetches++; return { always(cb) { cb(); } }; } } };
}
window.Knack = { views: { view_3680: view(3), view_3921: view(2) }, router: { current_scene_key: 'scene_1155' } };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, bidReviewV2: { CONFIG: {
  enabled: true, sourceViewKeys: ['view_3680', 'view_3921'], eventNs: '.t', mountId: 'scw-bid-review-v2' } } };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/bid-review-v2/data.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
const ns = window.SCW.bidReviewV2;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
let notified = 0, snapshots = [];
ns.data.subscribe(function (snap) { notified++; snapshots.push(Object.keys(snap)); });
ns.data.attachListeners();
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // Silent batch: rebuild from models, no fetch, no cascade anchor.
  document.dispatchEvent(new window.CustomEvent('scw-cascade-idle', { detail: { silent: true } }));
  await sleep(500);
  check('silent idle issues no fetch', fetches, 0);
  check('silent idle rebuilds once from the models', notified, 1);
  check('silent idle reads every source view', snapshots[0], ['view_3680', 'view_3921']);
  check('silent idle does not arm the cascade anchor', !!ns._pendingCascadeAnchor, false);
  check('silent idle names its trigger in the diary', ns._lastRenderTrigger, 'sweep cascade-idle (silent: models patched, no refetch)');
  // Loud batch (no detail, as a pre-change emitter would send, and detail.silent false): refetch all.
  document.dispatchEvent(new window.CustomEvent('scw-cascade-idle'));
  await sleep(600);
  check('loud idle refetches both source views', fetches, 2);
  check('loud idle arms the cascade anchor', !!ns._pendingCascadeAnchor, true);
  check('loud idle rebuilds once after the refetch settles', notified, 2);
  ns._pendingCascadeAnchor = false;
  document.dispatchEvent(new window.CustomEvent('scw-cascade-idle', { detail: { silent: false } }));
  await sleep(600);
  check('explicit silent:false is loud', fetches, 4);
  console.log('RESULT ' + (fails ? fails + ' FAILED' : 'all passed'));
  process.exit(fails ? 1 : 0);
})();
