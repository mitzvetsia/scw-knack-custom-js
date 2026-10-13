// jsdom smoke test: worksheet-v2 discontinued-products bar (discontinued-bar.js, 2026-10-13).
// Whenever a rendered line item's product is no longer in the enabled catalog, a bar under the
// banner names every such product with its count; a click highlights that product's cards and
// scrolls to the first, a second click clears; a clean scope has no bar.
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
for (const f of ['config.js', 'card.js', 'discontinued-bar.js']) {
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
const V = 'view_3962';
const rec = (id, prod, name) => ({ id, field_1949: name, field_1949_raw: [{ id: prod, identifier: name }] });
const panel = document.createElement('div'); panel.id = 'scw-ws-v2-' + V; panel.className = 'scw-ws-v2';
panel.innerHTML = '<div class="scw-ws-v2-toolbar"></div><div class="scw-ws-v2-banner">SOW Line Items</div><div class="scw-ws-v2-search"></div><div class="scw-ws-v2-body"></div>';
document.body.appendChild(panel);
const body = panel.querySelector('.scw-ws-v2-body');
const bar = () => panel.querySelector(':scope > .scw-ws-v2-discontinued-bar');
// The chips follow the text span with no whitespace node (flex gap spaces them), so join the parts.
const txt = el => el ? Array.from(el.children).map(c => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ') : null;
window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function () {};
const records = [rec('r1', 'p-cam', 'Garrison 5.0 - 26ZV5M-WIFI'), rec('r2', 'p-sw', '8 Port Gigabit PoE Switch - SW10P-EXT-GB'),
  rec('r3', 'p-sw', '8 Port Gigabit PoE Switch - SW10P-EXT-GB'), rec('r4', 'p-ups', 'Standby UPS')];
for (const r of records) { const c = document.createElement('div'); c.className = 'scw-ws-v2-card'; c.setAttribute('data-scw-ws-v2-record', r.id); body.appendChild(c); }

ns.discontinuedBar.mount(V, records);
check('no catalog loaded → nothing can be called discontinued → no bar', bar(), null);

window.SCW.mountingBoxProducts = [];
window.SCW.productMap = { 'p-cam': { name: 'Garrison' } };    // the switch and the UPS are gone from the enabled catalog
ns.discontinuedBar.mount(V, records);
check('the bar sits right under the banner and names each discontinued product with its count',
  [bar() && bar().previousElementSibling.className, txt(bar()), Array.from(bar().querySelectorAll('.scw-ws-v2-discontinued-bar-chip')).map(b => b.getAttribute('data-scw-ws-v2-disc-ids'))],
  ['scw-ws-v2-banner', '3 discontinued products on this scope — replace them before it goes out: 8 Port Gigabit PoE Switch - SW10P-EXT-GB×2 Standby UPS', ['r2,r3', 'r4']]);
check('collect() is the same list', ns.discontinuedBar.collect(records, V), [{ name: '8 Port Gigabit PoE Switch - SW10P-EXT-GB', ids: ['r2', 'r3'] }, { name: 'Standby UPS', ids: ['r4'] }]);

const chip = bar().querySelector('.scw-ws-v2-discontinued-bar-chip');
chip.click();
const lit = () => Array.from(panel.querySelectorAll('.scw-ws-v2-card--scope-hl')).map(c => c.getAttribute('data-scw-ws-v2-record'));
check('a click on a product highlights its cards (the scope-tile class) and presses the chip', [lit(), chip.classList.contains('is-on'), chip.getAttribute('aria-pressed')], [['r2', 'r3'], true, 'true']);
bar().querySelectorAll('.scw-ws-v2-discontinued-bar-chip')[1].click();
check('another product takes over the highlight', lit(), ['r4']);
bar().querySelectorAll('.scw-ws-v2-discontinued-bar-chip')[1].click();
check('a second click clears', [lit(), panel.querySelectorAll('.is-on').length], [[], 0]);

const sig = bar().getAttribute('data-scw-sig');
ns.discontinuedBar.mount(V, records);
check('re-mounting with the same facts leaves the bar untouched', [panel.querySelectorAll('.scw-ws-v2-discontinued-bar').length, bar().getAttribute('data-scw-sig') === sig], [1, true]);
ns.discontinuedBar.mount(V, [records[0]]);
check('a clean scope removes the bar', bar(), null);
ns.discontinuedBar.mount(V, [rec('r9', 'p-ups', 'Standby UPS')]);
check('singular copy for one item', txt(bar()), '1 discontinued product on this scope — replace it before it goes out: Standby UPS');

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
