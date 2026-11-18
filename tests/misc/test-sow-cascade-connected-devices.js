// jsdom smoke test: the SOW cascade in mirror-connection-sync.js never MOVES a connected device
// (ClickUp 86bcjbxwp, 2026-10-22: "removing a switch/NVR from a SOW removes its linked cameras too").
// Driving the real module's view_3962 instance (MODEL_ONLY) through its knack-cell-update handler:
//   1. parent on [A,B] → [B]: the accessory follows (exact mirror); the camera on [A] alone is
//      DISCONNECTED (its Connected To cleared, dropped from the parent's Connected Devices) and keeps
//      SOW A; cameras still sharing B keep the connection; a camera whose SOW read is unverifiable is
//      left alone; NO camera's field_2154 is ever written.
//   2. parent cleared ([]): accessory cleared; every judgeable camera disconnected; none moved.
//   3. parent [A] → [A,B] (an add): nothing but the accessory is touched.
//   4. parent [A,B] → [B] with its only camera on [A] (a move): the camera stays on A, disconnected.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#build-sow/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.CustomEvent = window.CustomEvent;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; },
  each() { return jqObj; }, length: 0 };
jq.fn = {}; jq.extend = Object.assign; window.$ = jq; window.jQuery = jq; global.$ = jq;
const puts = [];
window.fetch = (url, opts) => {
  const m = /views\/(view_\d+)\/records\/([0-9a-f]{24})/.exec(url);
  puts.push({ view: m[1], id: m[2], body: JSON.parse(opts.body) });
  return Promise.resolve({ ok: true, status: 200 });
};
window.Knack = { application_id: 'app', getUserToken: () => 'tok', views: {}, router: { current_scene_key: 'scene_1085' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  knackRecordUrl: (v, id) => 'https://api/v1/pages/scene_1085/views/' + v + '/records/' + id };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/mirror-connection-sync.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const H = s => '6a2c000100000000000' + s;          // 24-hex ids
const A = H('05a0a'), B = H('05b0b');
const N1 = H('0aa01'), C1 = H('0aa11'), C2 = H('0aa12'), C3 = H('0aa13'), C4 = H('0aa14'), M1 = H('0bb01');
const sowRef = ids => ids.map(id => ({ id, identifier: id === A ? '1105' : '1200' }));
const ref = ids => ids.map(id => ({ id, identifier: 'x' }));
function models(recs) { return { model: { data: { models: recs.map(r => ({ id: r.id, attributes: r })) } } }; }
function fixture() {
  const n1 = { id: N1, field_1950: 'NVR-1', field_2154: '1105, 1200', field_2154_raw: sowRef([A, B]), field_1957_raw: ref([C1, C2, C3, C4]), field_2197_raw: [] };
  const c1 = { id: C1, field_1950: 'C-001', field_2154: '1105', field_2154_raw: sowRef([A]), field_2197_raw: ref([N1]), field_1957_raw: [] };
  const c2 = { id: C2, field_1950: 'C-002', field_2154: '1105, 1200', field_2154_raw: sowRef([A, B]), field_2197_raw: ref([N1]), field_1957_raw: [] };
  const c3 = { id: C3, field_1950: 'C-003', field_2154: '1200', field_2154_raw: sowRef([B]), field_2197_raw: ref([N1]), field_1957_raw: [] };
  const c4 = { id: C4, field_1950: 'C-004', field_2197_raw: ref([N1]), field_1957_raw: [] };   // SOW not projected → unjudgeable
  const m1 = { id: M1, field_1950: 'Wall mount', field_2464_raw: ref([N1]), field_2154: '1105, 1200', field_2154_raw: sowRef([A, B]) };
  window.Knack.views.view_3962 = models([n1, c1, c2, c3, c4]);
  window.Knack.views.view_3888 = models([m1]);
  return { n1, c1, c2, c3, c4, m1 };
}
const prime = () => (handlers['knack-view-render.view_3962.scwSilentRegroup-sowprime'] || []).forEach(fn => fn());
const sowEdit = rec => (handlers['knack-cell-update.view_3962.scwSilentRegroup-sow'] || []).forEach(fn => fn(null, { key: 'view_3962' }, rec, 'field_2154'));
function setSow(rec, ids) { rec.field_2154_raw = sowRef(ids); rec.field_2154 = ids.map(id => id === A ? '1105' : '1200').join(', '); return Object.assign({}, rec); }
const putsFor = id => puts.filter(p => p.id === id).map(p => p.body);
const sowWrites = () => puts.filter(p => p.view === 'view_3962' && ('field_2154' in p.body));
const idsIn = raw => (raw || []).map(r => r.id);

(async () => {
  check('the cascade handler and its cache primer are bound for view_3962',
    [!!handlers['knack-cell-update.view_3962.scwSilentRegroup-sow'], !!handlers['knack-view-render.view_3962.scwSilentRegroup-sowprime']], [true, true]);

  // 1. the parent leaves one of its two SOWs
  let fx = fixture(); prime();
  sowEdit(setSow(fx.n1, [B]));
  await sleep(60);
  check('accessory follows the parent to its exact new set', putsFor(M1), [{ field_2154: [B] }]);
  check('the camera on SOW A alone is disconnected — Connected To cleared — and NOT moved', putsFor(C1), [{ field_2197: [] }]);
  check('the parent\'s Connected Devices drop that camera and keep the rest (incl. the unjudgeable one)', putsFor(N1), [{ field_1957: [C2, C3, C4] }]);
  check('cameras still sharing SOW B keep their connection; the unjudgeable camera is left alone', [putsFor(C2), putsFor(C3), putsFor(C4)], [[], [], []]);
  check('no camera\'s SOW membership was written (the old re-align is gone)', sowWrites().length, 0);
  check('local model patched: the camera lost its back-pointer but kept SOW A; the parent\'s list shrank',
    [idsIn(fx.c1.field_2197_raw), idsIn(fx.c1.field_2154_raw), idsIn(fx.n1.field_1957_raw)], [[], [A], [C2, C3, C4]]);

  // 2. the parent is cleared off every SOW
  puts.length = 0;
  sowEdit(setSow(fx.n1, []));
  await sleep(60);
  check('cleared parent: accessory cleared with it', putsFor(M1), [{ field_2154: [] }]);
  check('cleared parent: every judgeable connected camera is disconnected, none moved',
    [putsFor(C2), putsFor(C3), putsFor(C4), sowWrites().length], [[{ field_2197: [] }], [{ field_2197: [] }], [], 0]);
  check('cleared parent: Connected Devices keeps only the unjudgeable camera', putsFor(N1), [{ field_1957: [C4] }]);
  check('the cameras keep their own SOWs', [idsIn(fx.c2.field_2154_raw), idsIn(fx.c3.field_2154_raw)], [[A, B], [B]]);

  // 3. an ADD: parent [A] → [A,B] touches nothing but the accessory
  puts.length = 0;
  fx = fixture(); fx.n1.field_2154_raw = sowRef([A]); fx.n1.field_2154 = '1105'; fx.n1.field_1957_raw = ref([C1]);
  fx.m1.field_2154_raw = sowRef([A]);
  prime();
  sowEdit(setSow(fx.n1, [A, B]));
  await sleep(60);
  check('add: only the accessory is written; the camera on A still shares A → untouched', [putsFor(M1), putsFor(C1), putsFor(N1)], [[{ field_2154: [A, B] }], [], []]);

  // 4. a MOVE: parent [A,B] → [B] with its only camera on A → the camera stays on A, disconnected
  puts.length = 0;
  sowEdit(setSow(fx.n1, [B]));
  await sleep(60);
  check('move: the camera is disconnected, not dragged along; the parent\'s list empties',
    [putsFor(C1), putsFor(N1), idsIn(fx.c1.field_2154_raw), sowWrites().length], [[{ field_2197: [] }], [{ field_1957: [] }], [A], 0]);

  // 5. ACCESSORIES the accessory grid does not hold (2026-11-18, Cavco: a surge protection kit stayed on
  //    the SOW its Ubiquiti antenna had left). view_3888 is Builder-filtered to the Mounting Hardware
  //    bucket, loads 25 rows and has no SOW column; every accessory is also a row of the worksheet's own
  //    grid, which carries the parent pointer and takes the SOW write.
  puts.length = 0;
  const ANT = H('0cc01'), KIT = H('0cc02'), BRK = H('0cc03'), SW = H('0cc04'), SWB = H('0cc05'), IDF4 = H('0dd04'), IDF5 = H('0dd05');
  const mdfRef = id => [{ id, identifier: id === IDF4 ? 'IDF 04' : 'IDF 05' }];
  function fixture2() {
    const ant = { id: ANT, field_1950: 'ANT-001', field_2154: '1105', field_2154_raw: sowRef([A]), field_1957_raw: [], field_2197_raw: [], field_2464_raw: [], field_1946_raw: mdfRef(IDF4) };
    // a surge kit in the Other Equipment bucket: a row of view_3962 only
    const kit = { id: KIT, field_1950: 'Surge Protection Kit', field_2154: '1105', field_2154_raw: sowRef([A]), field_2464_raw: ref([ANT]), field_1957_raw: [], field_2197_raw: [], field_1946_raw: mdfRef(IDF4) };
    // a bracket that is in BOTH grids (on view_3888's first page)
    const brk = { id: BRK, field_1950: 'Pole mount', field_2154: '1105', field_2154_raw: sowRef([A]), field_2464_raw: ref([ANT]), field_1957_raw: [], field_2197_raw: [], field_1946_raw: mdfRef(IDF4) };
    // the neighbour: a switch with NO accessory in any model, and the record above it in the hidden grid
    const sw  = { id: SW, field_1950: 'SW-001', field_2154: '1105', field_2154_raw: sowRef([A]), field_1957_raw: [], field_2197_raw: [], field_2464_raw: [], field_1946_raw: mdfRef(IDF4) };
    window.Knack.views.view_3962 = models([ant, kit, brk, sw]);
    window.Knack.views.view_3888 = models([{ id: BRK, field_1958: 'Pole mount', field_2464_raw: ref([ANT]), field_1946_raw: mdfRef(IDF4) }]);   // no SOW column
    // the hidden native grid: the antenna's row sits right ABOVE the switch's, its accessory-list cell
    // carrying the antenna's accessories (plus one id no model knows, to prove the scrape is not read)
    document.body.innerHTML = '<div id="view_3962"><table><tbody>' +
      '<tr id="' + ANT + '"><td class="field_1958"><span id="' + KIT + '" data-kn="connection-value">Surge Protection Kit</span>' +
        '<span id="' + SWB + '" data-kn="connection-value">Stray</span></td></tr>' +
      '<tr id="' + SW + '"><td class="field_1958"></td></tr></tbody></table></div>';
    return { ant, kit, brk, sw };
  }
  const mdfPrime = () => (handlers['knack-view-render.view_3962.scwSilentRegroup-mdfprime'] || []).forEach(fn => fn());
  const mdfEdit = rec => (handlers['knack-cell-update.view_3962.scwSilentRegroup-mdf'] || []).forEach(fn => fn(null, { key: 'view_3962' }, rec, 'field_1946'));
  const putsVia = id => puts.filter(p => p.id === id).map(p => p.view + ' ' + JSON.stringify(p.body));
  let f2 = fixture2(); prime(); mdfPrime();
  sowEdit(setSow(f2.ant, []));
  await sleep(60);
  check('the antenna leaves its SOW: the surge kit (another bucket, a row of the worksheet grid only) follows, written through the worksheet grid',
    putsVia(KIT), ['view_3962 {"field_2154":[]}']);
  check('a bracket in both grids is written ONCE, through the grid that has the SOW column (never the SOW-less accessory grid)',
    putsVia(BRK), ['view_3962 {"field_2154":[]}']);
  check('the local model follows at once, so the next rebuild does not show the kit stranded on the SOW',
    [idsIn(f2.kit.field_2154_raw), idsIn(f2.brk.field_2154_raw)], [[], []]);

  // 6. a record with NO accessories never touches the row above it. The old fallback scraped the
  //    accessory list of the previous row in the hidden grid and wrote this record's SOW onto it.
  puts.length = 0;
  f2 = fixture2(); prime(); mdfPrime();
  sowEdit(setSow(f2.sw, [A, B]));
  await sleep(60);
  check('a switch with no accessories gains a SOW: nothing is written to the antenna\'s accessories in the row above',
    [putsVia(KIT), putsVia(BRK), putsVia(SWB), puts.length], [[], [], [], 0]);

  // 7. the MDF/IDF follow uses the same lookup and route
  puts.length = 0;
  f2.ant.field_1946_raw = mdfRef(IDF5);
  mdfEdit(Object.assign({}, f2.ant));
  await sleep(60);
  check('the antenna moves to another MDF/IDF: the surge kit and the bracket move with it, through the worksheet grid',
    [putsVia(KIT), putsVia(BRK)], [['view_3962 {"field_1946":["' + IDF5 + '"]}'], ['view_3962 {"field_1946":["' + IDF5 + '"]}']]);
  puts.length = 0;
  f2.sw.field_1946_raw = mdfRef(IDF5);
  mdfEdit(Object.assign({}, f2.sw));
  await sleep(60);
  check('the switch moves: the row above keeps its accessories where they are', puts.length, 0);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
