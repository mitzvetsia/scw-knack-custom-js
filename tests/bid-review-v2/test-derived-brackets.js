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

// ── discontinued-products bar under a SOW section's status line (2026-10-13) ──
const SOW_A = hid('a1'), SOW_B = hid('b1');
const item = (id, prod, name, sows) => ({ id, field_1949: name, field_1949_raw: [{ id: prod, identifier: name }], field_2154_raw: sows.map(s => ({ id: s, identifier: s })) });
const sowItems = [item(CAM1, CAM, 'Cam', [SOW_A]), item(hid('71'), 'p-old-sw', '8 Port Switch', [SOW_A]), item(hid('72'), 'p-old-sw', '8 Port Switch', [SOW_A]),
  item(hid('73'), 'p-old-ups', 'Standby UPS', [SOW_B]), item(hid('74'), 'p-old-ups', 'Standby UPS', [])];
ns.lastSowItems = sowItems;
window.SCW.productMap = { [CAM]: { name: 'Cam' }, [NVR]: { name: 'NVR' }, [MOUNT]: { name: 'Wall mount' } };   // the switch and the UPS are gone
check('collectDiscontinued: only this SOW\'s items, grouped by product with their ids',
  [ns.warnings.collectDiscontinued(sowItems, SOW_A), ns.warnings.collectDiscontinued(sowItems, SOW_B), ns.warnings.collectDiscontinued(sowItems, '__none__')],
  [[{ name: '8 Port Switch', ids: [hid('71'), hid('72')] }], [{ name: 'Standby UPS', ids: [hid('73')] }], [{ name: 'Standby UPS', ids: [hid('74')] }]]);
function section(sowId, rowIds) {
  const sec = document.createElement('div'); sec.className = 'scw-bid-review-v2__sow'; sec.setAttribute('data-sow-id', sowId);
  sec.innerHTML = '<div class="scw-bid-review-v2__sow-header">status line</div><table><tbody>' +
    rowIds.map(id => '<tr class="scw-bid-review-v2__row" data-sow-item-id="' + id + '"><td>row</td></tr>').join('') + '</tbody></table>';
  document.body.appendChild(sec); return sec;
}
const secA = section(SOW_A, [CAM1, hid('71'), hid('72')]);
ns.warnings.mountDiscontinuedBar(secA, sowItems);
const dbar = () => secA.querySelector(':scope > .scw-bid-review-v2__disc');
const dtxt = el => el ? Array.from(el.children).map(c => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ') : null;
check('the bar sits right under the status line and names the product with its count',
  [dbar() && dbar().previousElementSibling.className, dtxt(dbar())],
  ['scw-bid-review-v2__sow-header', '2 discontinued products on this scope — replace them before it goes out: 8 Port Switch×2']);
window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function () {};
const dchip = dbar().querySelector('.scw-bid-review-v2__disc-chip');
dchip.click();
const dlit = () => Array.from(secA.querySelectorAll('tr.scw-bid-review-v2__row--scope-hl')).map(tr => tr.getAttribute('data-sow-item-id'));
check('a click highlights that product\'s rows (the scope-tile class)', [dlit(), dchip.classList.contains('is-on')], [[hid('71'), hid('72')], true]);
dchip.click();
check('a second click clears', [dlit(), dchip.classList.contains('is-on')], [[], false]);
window.SCW.productMap = { [CAM]: { name: 'Cam' }, 'p-old-sw': { name: '8 Port Switch' } };
ns.warnings.mountDiscontinuedBar(secA, sowItems);
check('once the product is enabled again the bar goes', dbar(), null);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
