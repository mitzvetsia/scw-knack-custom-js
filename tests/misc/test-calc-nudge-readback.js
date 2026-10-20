// jsdom smoke test: calc-field-nudge.js re-reads the nudged records instead of refetching the view
// (2026-10-20 deep dive). A sweep over a model with one stuck row PUTs one nudge, then — after
// readbackDelayMs — GETs that record through the view-scoped endpoint, patches it via
// SCW.syncKnackModel and notifies the reconcile data layer. The view's model.fetch (a native
// re-render of a hidden grid, and a page jump) is never called while the read path exists.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155"><div id="view_3921"></div></body></html>',
  { url: 'https://scwinstallation.knack.com/installationservices#review-bids/6a2c00010000000000001111' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; } };
function jq() { return jqObj; } jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
try { window.localStorage.clear(); } catch (e) { /* ignore */ }
let fetches = 0;
const stuck = { id: '6a2c0001000000000000aa01', field_2028: '$0.00', field_2028_raw: 0,
  field_2150: '$135.00', field_2150_raw: 135, field_1953: 'note', field_1953_raw: 'note' };
const fine  = { id: '6a2c0001000000000000aa02', field_2028: '$154.00', field_2028_raw: 154,
  field_2150: '$135.00', field_2150_raw: 135, field_1953: '', field_1953_raw: '' };
window.Knack = { views: { view_3921: { model: {
  data: { models: [{ id: stuck.id, attributes: stuck }, { id: fine.id, attributes: fine }] },
  fetch() { fetches++; } } } }, router: { current_scene_key: 'scene_1155' } };
global.Knack = window.Knack;
const requests = [];
let synced = [], notifiedBr = 0;
window.SCW = {
  CONFIG: {}, debug() {},
  knackRecordUrl(v, id) { return 'https://api.knack.com/v1/pages/scene_1155/views/' + v + '/records/' + id; },
  knackAjax(o) {
    requests.push({ type: o.type, url: o.url });
    setTimeout(function () {
      if (o.type === 'PUT') { o.success({}); return; }
      o.success({ record: { id: stuck.id, field_2028: '$154.00', field_2028_raw: 154 } });
    }, 5);
  },
  syncKnackModel(v, id, resp, fieldKey, value) { synced.push([v, id, fieldKey, value, resp && resp.field_2028_raw]); },
  bidReviewV2: { CONFIG: { sourceViewKeys: ['view_3680', 'view_3921'] }, data: { notifyDebounced() { notifiedBr++; } } }
};
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/calc-field-nudge.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const nudge = window.SCW.calcNudge;
nudge.config.readbackDelayMs = 20;
nudge.sweep('view_3921');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(10);
  check('one nudge PUT for the stuck row only', requests.filter(r => r.type === 'PUT').map(r => r.url.slice(-24)), [stuck.id]);
  await sleep(120);
  check('read-back GETs only the nudged record', requests.filter(r => r.type === 'GET').map(r => r.url.slice(-24)), [stuck.id]);
  check('the record is patched through syncKnackModel with the calc field', synced, [['view_3921', stuck.id, 'field_2028', 154, 154]]);
  check('the reconcile data layer is told to rebuild', notifiedBr, 1);
  check('the hidden grid is never refetched', fetches, 0);
  // A second sweep in the same load: the row is still "stuck" in this model (the test never
  // repainted field_2028_raw) → marked sticky, no second nudge, no read-back.
  nudge.sweep('view_3921');
  await sleep(60);
  check('a still-stuck row is not nudged twice per load', requests.filter(r => r.type === 'PUT').length, 1);
  // Without the read path the old full refetch is the fallback.
  delete window.SCW.syncKnackModel;
  const SCW2 = window.SCW;
  nudge.config.maxPerLoad = 99;
  stuck.id = '6a2c0001000000000000aa03';  // a "new" stuck record id in the same model slot
  window.Knack.views.view_3921.model.data.models[0].id = stuck.id;
  nudge.sweep('view_3921');
  await sleep(120);
  check('fallback: full refetch when the record read path is unavailable', fetches, 1);
  console.log('RESULT ' + (fails ? fails + ' FAILED' : 'all passed'));
  process.exit(fails ? 1 : 0);
})();
