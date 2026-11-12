// jsdom smoke test: the bulk "Remove accessories" modal (worksheet-v2/bulk.js) says which accessory types are
// discontinued (2026-11-12 — "can the bulk remove modal also reflect which items are discontinued?"). The verdict
// is the worksheet's own (card.js isDiscontinued → the product catalog), so the modal agrees with the ⊘ on the
// chips: discontinued types are listed first with a tag, a partly discontinued type says how many, and a note
// above the list counts them. No catalog = nothing is called discontinued.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1085"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#build/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.localStorage = window.localStorage;
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
const jq = () => jqObj; jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
const V = 'view_3962';
const MHB = '594a94536877675816984cb9';
const conn = (id, name) => [{ id, identifier: name }];
const cam = (id) => ({ id, field_1949_raw: conn('p-cam', 'Deputy'), field_2219_raw: conn('6481e5ba38f283002898113c', 'Camera / Reader') });
const acc = (id, parent, prod, name) => ({ id, field_1949: name, field_1949_raw: conn(prod, name), field_2464_raw: conn(parent, parent),
  field_2219_raw: conn(MHB, 'Mounting Hardware') });
const OLD = 'Electrical Box Mount for The Deputy, Sheriff, Informant, Scout - EBM26DFD - EBM26DFD';
const NEW = 'Electrical Box Mount for The Deputy v2, Deputy v3, Sheriff, Informant, Scout 8.0 and The Diplomat. - EMB26DFD';
const WALL = 'Wall Mount Bracket';
const records = [cam('c1'), cam('c2'), cam('c3'), cam('c4'),
  acc('a1', 'c1', 'p-old', OLD), acc('a2', 'c2', 'p-old', OLD), acc('a3', 'c3', 'p-old', OLD), acc('a4', 'c4', 'p-old', OLD),
  acc('b1', 'c1', 'p-new', NEW), acc('b2', 'c2', 'p-new', NEW), acc('b3', 'c3', 'p-new', NEW), acc('b4', 'c4', 'p-new', NEW),
  // one name, two products: one still sold, one retired → "1 discontinued"
  acc('w1', 'c1', 'p-wall', WALL), acc('w2', 'c2', 'p-wall-old', WALL)];
window.Knack = { views: { [V]: { model: { data: { models: records.map(r => ({ attributes: r })) } } } }, router: { current_scene_key: 'scene_1085' } };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {},
  sowColor: { dot: () => '#000', chipStyle: () => ({ bg: '#fff', border: '#000', text: '#000' }) } };
global.SCW = window.SCW;
new Function('window', 'document', fs.readFileSync(path.join(__dirname, '../../src/features/product-catalog.js'), 'utf8'))(window, document);
for (const f of ['config.js', 'card.js', 'bulk.js']) {
  new Function('window', 'document', '$', 'jQuery', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
ns.data = ns.data || { readRecords: vk => (vk === V ? records : []) };
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const parents = ['c1', 'c2', 'c3', 'c4'];
const rows = () => Array.from(document.querySelectorAll('.scw-ws-v2-bulk-acc-row')).map(r => ({
  name: r.querySelector('.scw-ws-v2-bulk-acc-name').firstChild.textContent,
  tag: (r.querySelector('.scw-ws-v2-bulk-acc-disc') || {}).textContent || '',
  disc: r.classList.contains('scw-ws-v2-bulk-acc-row--disc'),
  n: r.querySelector('.scw-ws-v2-bulk-acc-count').textContent }));
const closeAll = () => document.querySelectorAll('.scw-ws-v2-bulk-overlay').forEach(o => o.remove());

check('the test seams exist', [typeof ns.bulk._openRemoveAccessories, typeof ns.bulk._accessoriesGrouped], ['function', 'function']);

// ── no catalog: nothing can be called discontinued, the list is alphabetical as before ──
ns.bulk._openRemoveAccessories(parents, V);
check('no catalog → no tags, no note, alphabetical',
  [rows().map(r => [r.name, r.tag, r.n]), !!document.querySelector('.scw-ws-v2-bulk-acc-discnote')],
  [[[NEW, '', '× 4'], [OLD, '', '× 4'], [WALL, '', '× 2']], false]);   // the order the screenshot shows
closeAll();

// ── the catalog says the old box mount and the old wall bracket are gone ──
window.SCW.mountingBoxProducts = [];
window.SCW.productMap = { 'p-cam': { name: 'Deputy' }, 'p-new': { name: NEW }, 'p-wall': { name: WALL } };
check('grouping counts the discontinued lines per type', ns.bulk._accessoriesGrouped(parents, V).map(g => [g.name, g.ids.length, g.disc]),
  [[OLD, 4, 4], [WALL, 2, 1], [NEW, 4, 0]]);
ns.bulk._openRemoveAccessories(parents, V);
check('discontinued types are listed first and tagged; a partly discontinued type says how many; a live type is plain',
  rows(), [
    { name: OLD, tag: 'Discontinued', disc: true, n: '× 4' },
    { name: WALL, tag: '1 discontinued', disc: true, n: '× 2' },
    { name: NEW, tag: '', disc: false, n: '× 4' }]);
check('the note above the list counts them', document.querySelector('.scw-ws-v2-bulk-acc-discnote').textContent.trim(),
  '5 of these accessories are discontinued — listed first.');
check('the tag carries the ⊘ and says why on hover',
  [!!document.querySelector('.scw-ws-v2-bulk-acc-disc svg'), /no longer available/.test(document.querySelector('.scw-ws-v2-bulk-acc-disc').title)], [true, true]);
// ticking still picks the right ids after the re-sort
const cbs = document.querySelectorAll('.scw-ws-v2-bulk-acc-cb');
cbs[0].checked = true; cbs[0].dispatchEvent(new window.Event('change'));
check('ticking the first (discontinued) row counts its 4 lines', document.querySelector('.scw-ws-v2-bulk-modal-confirm-delete').textContent, 'Remove 4 accessories');
closeAll();

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
