// jsdom smoke test: the reconcile grid's wrong-accessory chips are DERIVED from the product
// catalog (product-catalog.js, 2026-10-13) over view_3921's own records — the accessory line
// items are rows of that grid like their parents — with the stamped field_2244 spans deciding
// only where the catalog cannot say.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1155"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#bids/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
const jq = () => jqObj; jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1155' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
for (const f of ['product-catalog.js', 'bid-review/config.js', 'bid-review-v2/config.js', 'bid-review-v2/warnings.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.bidReviewV2;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const V = 'view_3921', CAM = 'p-cam', NVR = 'p-nvr', MOUNT = 'p-mount';
const hid = n => ('000000000000000000000000' + n).slice(-24);
const CAM1 = hid('11'), NVR1 = hid('22'), M1 = hid('31'), M2 = hid('32'), G1 = hid('41');
const conn = id => [{ id, identifier: id }];
const rec = (id, prod, parent) => ({ id, field_1949_raw: conn(prod), field_2464_raw: parent ? conn(parent) : [] });
function grid(records, spansByParent) {
  window.Knack.views[V] = { model: { data: { models: records.map(r => ({ id: r.id, attributes: r })) } } };
  const old = document.getElementById(V); if (old) old.remove();
  const view = document.createElement('div'); view.id = V;
  for (const parentId in spansByParent) {
    const tr = document.createElement('tr'); tr.id = parentId;
    const td = document.createElement('td'); td.className = 'field_2244';
    for (const [accId, val] of spansByParent[parentId]) {
      const s = document.createElement('span'); s.id = accId; s.setAttribute('data-kn', 'connection-value'); s.textContent = val; td.appendChild(s);
    }
    tr.appendChild(td); view.appendChild(tr);
  }
  document.body.appendChild(view);
}
const bracket = id => { ns.warnings.analyze([]); return ns.warnings.issuesFor(id).indexOf('bracket') !== -1; };
const records = [rec(CAM1, CAM), rec(NVR1, NVR), rec(M1, MOUNT, CAM1), rec(M2, MOUNT, NVR1)];

grid(records, { [CAM1]: [[M1, 'No']], [NVR1]: [[M2, 'Yes']] });
check('no catalog: the stamped spans decide (cam1 flagged by m1\'s No, nvr1 clean)', [bracket(CAM1), bracket(NVR1)], [true, false]);

window.SCW.mountingBoxProducts = [{ id: MOUNT, name: 'Wall mount', compatibleProducts: [CAM], compatibleProductsAlt: [] }];
window.SCW.productMap = { [CAM]: { name: 'Cam' }, [NVR]: { name: 'NVR' }, [MOUNT]: { name: 'Wall mount' } };
check('catalog wins over the grid\'s own records: the stale No on m1 is cleared, the stale Yes on m2 is overruled',
  [bracket(CAM1), bracket(NVR1)], [false, true]);
grid(records, {});
check('with no stamps on the page at all, the catalog alone flags nvr1', [bracket(CAM1), bracket(NVR1)], [false, true]);

grid(records.concat([rec(G1, 'p-ghost', CAM1)]), { [CAM1]: [[G1, 'No']] });
check('an accessory product the catalog does not know → undecided → its stamped No still flags cam1', bracket(CAM1), true);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
