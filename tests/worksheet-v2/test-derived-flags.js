// jsdom smoke test: the worksheet's wrong-accessory warning and discontinued badge are DERIVED
// from the product catalog (product-catalog.js, 2026-10-13) — nothing stamped. Where the catalog
// answers it wins over the stored field_2244 / field_2912 signals; where it cannot say, the
// stored signals decide as before.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1085"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#build/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
const jq = () => jqObj; jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1085' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  sowColor: { dot: () => '#000', chipStyle: () => ({ bg: '#fff', border: '#000', text: '#000' }) } };
global.SCW = window.SCW;
new Function('window', 'document', fs.readFileSync(path.join(__dirname, '../../src/features/product-catalog.js'), 'utf8'))(window, document);
for (const f of ['config.js', 'card.js', 'warnings.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const V = 'view_3962', CAM = 'p-cam', NVR = 'p-nvr', MOUNT = 'p-mount', OLD = 'p-old';
// Record ids must be 24-hex: the stamped-span source walks up to the owning row by that shape.
const hid = n => ('000000000000000000000000' + n).slice(-24);
const CAM1 = hid('11'), NVR1 = hid('22'), M1 = hid('31'), M2 = hid('32'), G1 = hid('41'), O1 = hid('51'), S1 = hid('61'), GONE = hid('99');
const MH = '594a94536877675816984cb9', CR = '6481e5ba38f283002898113c';
const conn = (id) => [{ id, identifier: id }];
const rec = (id, prod, o) => Object.assign({ id, field_1949: prod, field_1949_raw: conn(prod), field_2219_raw: conn(o && o.parent ? MH : CR),
  field_1946_raw: conn('L1'), field_2464_raw: o && o.parent ? conn(o.parent) : [] }, o && o.extra || {});
// Stamped signal on the parent row: one Yes/No span per accessory in the field_2244 cell.
function stampedView(spansByParent) {
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
// Only the bracket issue is under test here (the fixture's cameras have no connected device, which is a different warning).
function issues(records) { const by = ns.warnings.analyze(records, V); return Object.keys(by).filter(k => by[k].indexOf('bracket') !== -1).sort(); }
const name = id => ({ [CAM1]: 'cam1', [NVR1]: 'nvr1', [M1]: 'm1', [M2]: 'm2', [G1]: 'g1', [O1]: 'o1', [S1]: 's1', [GONE]: 'gone' })[id] || id;
const named = list => list.map(name);

// ── catalog not loaded: the stamps decide, exactly as before ──
const records = [rec(CAM1, CAM), rec(NVR1, NVR), rec(M1, MOUNT, { parent: CAM1 }), rec(M2, MOUNT, { parent: NVR1 })];
stampedView({ [CAM1]: [[M1, 'No']], [NVR1]: [[M2, 'Yes']] });
check('no catalog: the stamped spans decide (m1 stamped No → cam1 flagged; m2 stamped Yes → nvr1 clean)',
  [named(issues(records)), ns.warnings.isAccessoryMismatch(M1), ns.warnings.isAccessoryMismatch(M2)], [['cam1'], true, false]);
check('no catalog: the discontinued badge follows the stored flag only',
  [ns.card.isDiscontinued(rec('x', OLD, { extra: { field_2912_raw: false } }), V), ns.card.isDiscontinued(rec('y', CAM, { extra: { field_2912_raw: true } }), V), ns.card.isDiscontinued(rec('z', CAM), V)],
  [true, false, false]);

// ── the catalog lands: a wall mount fits a camera, not an NVR ──
window.SCW.mountingBoxProducts = [{ id: MOUNT, name: 'Wall mount', compatibleProducts: [CAM], compatibleProductsAlt: [] }];
window.SCW.productMapHasStatus = true;
window.SCW.productMap = { [CAM]: { name: 'Cam', enabled: true, status: 'Enabled' }, [NVR]: { name: 'NVR', enabled: true, status: 'Enabled' },
  [MOUNT]: { name: 'Wall mount', enabled: true, status: 'Enabled' }, [OLD]: { name: 'Old', enabled: false, status: 'Disabled' } };
document.dispatchEvent(new window.CustomEvent('scw-mounting-box-products-ready'));
check('catalog wins: the stale No on m1 is cleared (it fits), the stale Yes on m2 is overruled (it does not) → only nvr1 flagged',
  [named(issues(records)), ns.warnings.isAccessoryMismatch(M1), ns.warnings.isAccessoryMismatch(M2)], [['nvr1'], false, true]);
check('a wrong accessory needs no stamp at all: with an empty view the catalog alone flags nvr1',
  (stampedView({}), named(issues(records))), ['nvr1']);

// ── where the catalog cannot say, the stamp still decides ──
const ghost = rec(G1, 'p-ghost', { parent: CAM1 });            // product unknown to the catalog
const orphan = rec(O1, MOUNT, { parent: GONE });                // parent not on this view
stampedView({ [CAM1]: [[G1, 'No']], [GONE]: [[O1, 'No']] });
check('unknown accessory product or an unloaded parent → undecided → the stamped No still flags',
  [named(issues(records.concat([ghost, orphan]))), ns.warnings.isAccessoryMismatch(G1), ns.warnings.isAccessoryMismatch(O1)], [['cam1', 'nvr1'], true, true]);

// ── an attached service line is never a bracket, catalog or not ──
const svc = Object.assign(rec(S1, MOUNT, { parent: NVR1 }), { field_2219_raw: conn('6977caa7f246edf67b52cbcd') });
window.Knack.views[V] = { model: { data: { models: [{ id: S1, attributes: svc }] } } };
stampedView({});
check('a service line attached to a parent is exempt even when the catalog says it does not fit',
  (issues([rec(CAM1, CAM), rec(NVR1, NVR), svc])), []);
delete window.Knack.views[V];

// ── the discontinued badge from the catalog's status ──
check('catalog status: a disabled product badges even with a stale Yes; an enabled one never badges even with a stale No; unknown → stored flag',
  [ns.card.isDiscontinued(rec('x', OLD, { extra: { field_2912_raw: true } }), V), ns.card.isDiscontinued(rec('y', CAM, { extra: { field_2912_raw: false } }), V),
   ns.card.isDiscontinued(rec('z', 'p-ghost', { extra: { field_2912_raw: false } }), V), ns.card.isDiscontinued(rec('w', 'p-ghost'), V)],
  [true, false, true, false]);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
