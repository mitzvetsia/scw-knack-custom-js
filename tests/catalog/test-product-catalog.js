// jsdom smoke test: product-catalog.js — the derived product facts (nothing stamped, 2026-10-13).
// Three-state answers: true / false when the catalog knows, null when it cannot say, so a
// consumer falls back to its stored signal instead of inventing a warning.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
window.SCW = {}; global.SCW = window.SCW;
new Function('window', 'document', fs.readFileSync(path.join(__dirname, '../../src/features/product-catalog.js'), 'utf8'))(window, document);
const cat = window.SCW.catalog;
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const CAM = 'p-cam', NVR = 'p-nvr', MOUNT = 'p-mount', BOX = 'p-box', OLDMOUNT = 'p-oldmount', NOLIST = 'p-nolist';

// ── nothing loaded ──
let fired = 0; cat.ready(() => { fired++; });
check('before the snippet lands: not ready, every answer is null, ready(fn) waits',
  [cat.isReady(), cat.isDisabled(CAM), cat.fits(MOUNT, CAM), cat.product(CAM), fired, cat.auditAccessories([{ id: 'a' }], { product: 'field_1949', parent: 'field_2464' }).ready],
  [false, null, null, null, 0, false]);

// ── the OLD snippet shape: enabled products only, no status ──
window.SCW.mountingBoxProducts = [
  { id: MOUNT,  name: 'Wall mount', compatibleProducts: [CAM], compatibleProductsAlt: [] },
  { id: BOX,    name: 'Box',        compatibleProducts: [],    compatibleProductsAlt: [NVR] },
  { id: NOLIST, name: 'Cable',      compatibleProducts: [],    compatibleProductsAlt: [] }
];
window.SCW.productMap = { [CAM]: { name: 'Cam' }, [NVR]: { name: 'NVR' }, [MOUNT]: { name: 'Wall mount' }, [BOX]: { name: 'Box' }, [NOLIST]: { name: 'Cable' } };
document.dispatchEvent(new window.CustomEvent('scw-mounting-box-products-ready'));
check('the ready event fires the waiter once, and a late ready(fn) runs at once',
  (cat.ready(() => { fired += 10; }), [cat.isReady(), fired]), [true, 11]);
check('fits: either list names the parent → true; a list that does not → false',
  [cat.fits(MOUNT, CAM), cat.fits(BOX, NVR), cat.fits(MOUNT, NVR), cat.fits(BOX, CAM)], [true, true, false, false]);
check('fits: unknown accessory, no list at all, or a missing id → null (never "wrong")',
  [cat.fits('p-ghost', CAM), cat.fits(NOLIST, CAM), cat.fits('', CAM), cat.fits(MOUNT, '')], [null, null, null, null]);
check('enabled-only catalog: present → not disabled; absent → disabled (the pickers can no longer offer it)',
  [cat.isDisabled(CAM), cat.isDisabled(OLDMOUNT), cat.product(CAM).enabled], [false, true, true]);

const F = { product: 'field_1949', parent: 'field_2464' };
const rec = (id, prod, parent) => ({ id, field_1949_raw: [{ id: prod, identifier: prod }], field_2464_raw: parent ? [{ id: parent, identifier: parent }] : [] });
const recs = [rec('cam1', CAM), rec('nvr1', NVR), rec('m1', MOUNT, 'cam1'), rec('m2', MOUNT, 'nvr1'), rec('b1', BOX, 'nvr1'), rec('c1', NOLIST, 'cam1'), rec('m3', MOUNT, 'ghost-parent'), rec('x1', 'p-ghost', 'cam1')];
const a = cat.auditAccessories(recs, F);
check('audit: wrong / ok / undecided map each accessory to its parent; non-accessories are skipped',
  [a.ready, a.wrong, a.ok, a.undecided],
  [true, { m2: 'nvr1' }, { m1: 'cam1', b1: 'nvr1' }, { c1: 'cam1', m3: 'ghost-parent', x1: 'cam1' }]);

// ── an explicit enabled flag is honoured should the catalog ever carry status ──
window.SCW.productMap = { [CAM]: { name: 'Cam', status: 'Enabled', enabled: true }, [OLDMOUNT]: { name: 'Old mount', status: 'Disabled', enabled: false }, [MOUNT]: { name: 'Wall mount', status: 'Enabled', enabled: true } };
check('explicit status: enabled → false, disabled → true, absent → true, status readable',
  [cat.isDisabled(CAM), cat.isDisabled(OLDMOUNT), cat.isDisabled('p-ghost'), cat.product(OLDMOUNT).status], [false, true, true, 'Disabled']);
check('a disabled accessory is not in the picker list, so its fit is unknown (the disabled badge carries it)', cat.fits(OLDMOUNT, CAM), null);

// ── an empty map is a failed load, never "everything disabled" ──
window.SCW.productMap = {};
check('an empty catalog reads as not loaded: null, not disabled', [cat.isReady(), cat.isDisabled(CAM)], [false, null]);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
