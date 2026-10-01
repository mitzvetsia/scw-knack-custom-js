// jsdom smoke test: after a product change, the stored "discontinued" flag (field_2912, No = the
// ⊘ badge) is flipped to Yes ONLY when the new product is confirmed enabled — i.e. present in
// SCW.productMap, the Builder snippet's Status=Enabled catalog. Anything unconfirmable is a no-op.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#build/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1' } }; global.Knack = window.Knack;
const puts = [], synced = [], pending = [], refetched = [];
let respond = (body) => ({ record: Object.assign({ id: 'r1' }, JSON.parse(body), { field_2912_raw: true }) });
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackRecordUrl(v, id) { return '/v1/scenes/x/views/' + v + '/records/' + id; },
  knackAjax(o) { puts.push({ url: o.url, type: o.type, body: JSON.parse(o.data) }); o.success(respond(o.data)); },
  syncKnackModel(v, id, rec, f, val) { synced.push([v, id, f, val]); } };
global.SCW = window.SCW;
for (const f of ['config.js', 'product-enabled-flag.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
ns.data = { registerPendingWrite(v, id, f, raw) { pending.push([v, id, f, raw]); }, refetchAndNotify(v) { refetched.push(v); } };
const api = ns.productEnabledFlag;

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const flagged   = { id: 'r1', field_2912_raw: false, field_2912: 'No' };
const unflagged = { id: 'r2', field_2912_raw: true,  field_2912: 'Yes' };
const blank     = { id: 'r3' };

(async () => {
  // ── Catalog absent (scene without the snippet): can't confirm → no write ──
  delete window.SCW.productMap;
  let r = await api.clearIfEnabled({ viewKey: 'view_3962', recordId: 'r1', productId: 'p-live', rec: flagged });
  check('no SCW.productMap → unknown, not "disabled": skipped, nothing written', [r.skipped, puts.length], ['catalog-absent', 0]);
  window.SCW.productMap = {};
  r = await api.clearIfEnabled({ viewKey: 'view_3962', recordId: 'r1', productId: 'p-live', rec: flagged });
  check('empty map (still fetching) → same', [r.skipped, puts.length], ['catalog-absent', 0]);

  // ── Catalog loaded ──
  window.SCW.productMap = { 'p-live': { name: 'Admiral Pro 32ch V6', buckets: [] } };
  check('isEnabled: in the Status=Enabled catalog → true; not in it → false', [api.isEnabled('p-live'), api.isEnabled('p-dead')], [true, false]);

  r = await api.clearIfEnabled({ viewKey: 'view_3962', recordId: 'r1', productId: 'p-dead', rec: flagged });
  check('new product NOT in the enabled catalog → badge stays, nothing written', [r.skipped, puts.length], ['not-enabled', 0]);

  r = await api.clearIfEnabled({ viewKey: 'view_3962', recordId: 'r2', productId: 'p-live', rec: unflagged });
  check('flag already Yes → nothing to clear', [r.skipped, puts.length], ['not-flagged', 0]);
  r = await api.clearIfEnabled({ viewKey: 'view_3962', recordId: 'r3', productId: 'p-live', rec: blank });
  check('flag blank (never stamped) → treated as unknown, left alone', [r.skipped, puts.length], ['not-flagged', 0]);

  r = await api.clearIfEnabled({ viewKey: 'view_3962', recordId: 'r1', productId: 'p-live', rec: flagged });
  check('flagged No + enabled product → ONE PUT of field_2912=Yes through the view the product was changed on',
    [r.ok, puts.length, puts[0].type, puts[0].url, puts[0].body], [true, 1, 'PUT', '/v1/scenes/x/views/view_3962/records/r1', { field_2912: 'Yes' }]);
  check('model synced, pending overlay registered with the server raw, worksheet refetched',
    [synced[0], pending[0], refetched], [['view_3962', 'r1', 'field_2912', true], ['view_3962', 'r1', 'field_2912', true], ['view_3962']]);

  // ── Same object on the bid-review page (view_3921) and the CO worksheet (view_4079) ──
  r = await api.clearIfEnabled({ viewKey: 'view_3921', recordId: 'r1', productId: 'p-live', rec: flagged });
  check('view_3921 (no config entry) falls back to the default field and writes through that view', [r.ok, puts[1].url], [true, '/v1/scenes/x/views/view_3921/records/r1']);

  // ── Survey object (view_3505, product field_2627): it carries no such flag ──
  r = await api.clearIfEnabled({ viewKey: 'view_3505', recordId: 's1', productId: 'p-live', rec: { id: 's1', field_2627_raw: [{ id: 'p-live' }] } });
  check('survey object maps no flag field (config discontinued: "") → skipped, never written', [r.skipped, puts.length], ['no-field', 2]);

  // ── Dropped write: 200 but the record still reads No (column not inline-editable) ──
  respond = () => ({ record: { id: 'r1', field_2912_raw: false, field_2912: 'No' } });
  const before = refetched.length;
  r = await api.clearIfEnabled({ viewKey: 'view_4079', recordId: 'r1', productId: 'p-live', rec: flagged });
  check('200 with the flag unchanged → reported as dropped (Builder hint), no refetch, no false success',
    [r.ok, r.dropped, /inline-editable/.test(r.message), refetched.length - before], [false, true, true, 0]);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})();
