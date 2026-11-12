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
check('collect() is the same list (no parents on top-level lines)', ns.discontinuedBar.collect(records, V),
  [{ name: '8 Port Gigabit PoE Switch - SW10P-EXT-GB', ids: ['r2', 'r3'], parents: ['', ''] }, { name: 'Standby UPS', ids: ['r4'], parents: [''] }]);

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

// ── 2026-11-12: a discontinued ACCESSORY folded under its parent ("clicking on the pill … is not doing
// anything — the discontinued items are CHILD items"; "the child items … are not showing an icon") ──
const CAMP = 'p-cam', MOUNT = 'p-mount-old';
const MHB = '594a94536877675816984cb9';
const cam = { id: 'c1', field_1949: 'Garrison 5.0', field_1949_raw: [{ id: CAMP, identifier: 'Garrison 5.0' }], field_1950: 'E-001',
  field_2219_raw: [{ id: '6481e5ba38f283002898113c', identifier: 'Camera / Reader' }], field_1946_raw: [{ id: 'L1', identifier: 'MDF' }], field_1964: 1 };
const mnt = { id: 'a1', field_1949: 'Wall Mount Bracket (old)', field_1949_raw: [{ id: MOUNT, identifier: 'Wall Mount Bracket (old)' }],
  field_1950: 'Wall Mount Bracket (old) (MDF)', field_2464_raw: [{ id: 'c1', identifier: 'E-001' }],
  field_2219_raw: [{ id: MHB, identifier: 'Mounting Hardware' }], field_1946_raw: [{ id: 'L1', identifier: 'MDF' }], field_1964: 1 };
const accRecs = [cam, mnt];
ns.data = { readRecords: vk => (vk === V ? accRecs : []) };
ns.idxGen = (ns.idxGen || 0) + 1;
check('collect() names the accessory and carries its parent', ns.discontinuedBar.collect(accRecs, V),
  [{ name: 'Wall Mount Bracket (old)', ids: ['a1'], parents: ['c1'] }]);

const camCard = ns.card.buildCard(cam, V);
const wrap = camCard.querySelector('.scw-ws-v2-mh-chip-wrap[data-scw-ws-v2-acc-chip="a1"]');
check('the accessory chip under the parent carries its record id, the discontinued class and the ⊘ mark',
  [!!wrap, !!(wrap && wrap.classList.contains('scw-ws-v2-mh-chip-wrap--discontinued')), !!(wrap && wrap.querySelector('.scw-ws-v2-mh-disc'))],
  [true, true, true]);
check('the parent card itself is not marked discontinued (its own product is live)',
  camCard.querySelector('.scw-ws-v2-cell--discontinued'), null);
const sigBefore = ns.card.accessoriesSig(cam, V);
window.SCW.productMap[MOUNT] = { name: 'Wall Mount Bracket (old)' };   // back in the enabled catalog
const sigAfter = ns.card.accessoriesSig(cam, V);
delete window.SCW.productMap[MOUNT];
check('the parent card signature changes when the accessory stops being discontinued (the card repaints)',
  [sigBefore, sigAfter], ['a1!', 'a1']);

// Mount the parent inside a CLOSED MDF/IDF group, detail closed; the bar's click opens both,
// lights the parent card and the chip, and scrolls to the chip.
body.innerHTML = '';
const l1 = document.createElement('div'); l1.className = 'scw-ws-v2-l1';
const l1Head = document.createElement('div'); l1Head.setAttribute('data-scw-ws-v2-l1-toggle', '1');
let l1Clicks = 0;
l1Head.addEventListener('click', () => { l1Clicks++; l1.classList.add('scw-ws-v2-l1--open'); });
l1.appendChild(l1Head); l1.appendChild(camCard); body.appendChild(l1);
camCard.classList.remove('scw-ws-v2-card--open');
let scrolled = null;
window.Element.prototype.scrollIntoView = function () { scrolled = this; };
ns.summary = { revealCard: (card) => {
  const g = card.closest('.scw-ws-v2-l1');
  if (g && !g.classList.contains('scw-ws-v2-l1--open')) { g.querySelector('[data-scw-ws-v2-l1-toggle]').click(); return true; }
  return false;
} };
const realTimeout = global.setTimeout;
window.setTimeout = global.setTimeout = (fn) => { fn(); return 0; };   // the reveal's re-query runs at once
ns.discontinuedBar.mount(V, accRecs);
const accChip = bar().querySelector('.scw-ws-v2-discontinued-bar-chip');
check('the bar chip carries the parent and says the accessory shows under its device',
  [accChip.getAttribute('data-scw-ws-v2-disc-parents'), /under its device/.test(accChip.title)], ['c1', true]);
accChip.click();
window.setTimeout = global.setTimeout = realTimeout;
const liveWrap = camCard.querySelector('[data-scw-ws-v2-acc-chip="a1"]');
check('a click on the accessory opens the closed group, opens the parent\'s detail, lights the parent and the chip, scrolls to the chip',
  [l1Clicks, camCard.classList.contains('scw-ws-v2-card--open'), camCard.classList.contains('scw-ws-v2-card--scope-hl'),
   liveWrap.classList.contains('scw-ws-v2-mh-chip-wrap--hl'), scrolled === liveWrap],
  [1, true, true, true, true]);
accChip.click();
check('a second click clears the card and the chip', [panel.querySelectorAll('.scw-ws-v2-card--scope-hl, .scw-ws-v2-mh-chip-wrap--hl').length], [0]);

// The parent's chip is not rendered (no detail markup): the parent card is still lit.
liveWrap.parentNode.removeChild(liveWrap);
accChip.click();
check('with no chip in the DOM the parent card is lit and scrolled to', [camCard.classList.contains('scw-ws-v2-card--scope-hl'), scrolled === camCard], [true, true]);
accChip.click();

// A top-level card in a closed group is revealed too (the bar never did that before).
const top = rec('t1', 'p-ups', 'Standby UPS');
const g2 = document.createElement('div'); g2.className = 'scw-ws-v2-l1';
const h2 = document.createElement('div'); h2.setAttribute('data-scw-ws-v2-l1-toggle', '1');
h2.addEventListener('click', () => g2.classList.add('scw-ws-v2-l1--open'));
const tc = document.createElement('div'); tc.className = 'scw-ws-v2-card'; tc.setAttribute('data-scw-ws-v2-record', 't1');
g2.appendChild(h2); g2.appendChild(tc); body.appendChild(g2);
window.setTimeout = global.setTimeout = (fn) => { fn(); return 0; };
ns.discontinuedBar.mount(V, [top]);
bar().querySelector('.scw-ws-v2-discontinued-bar-chip').click();
window.setTimeout = global.setTimeout = realTimeout;
check('a top-level discontinued card in a closed group: the group opens and the card is scrolled to',
  [g2.classList.contains('scw-ws-v2-l1--open'), tc.classList.contains('scw-ws-v2-card--scope-hl'), scrolled === tc], [true, true, true]);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
