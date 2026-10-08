// jsdom smoke test: an accessory a signed CO removed must not read as live hardware.
// Accessories with a loaded parent attach to the device as Mounting Hardware CHIPS instead of
// getting their own card, and the chip builder never read field_2967 — so a swapped-OUT mount
// rendered identically to the one that replaced it (live: I-03's old Informant Dual Vision Wall
// Mount sat beside its own replacement, both plain blue chips, with the CO flag set the whole time).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
for (const f of ['config.js', 'card.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;

const CAM = '6481e5ba38f283002898113c';
const conn = (id, identifier) => [{ id, identifier }];
// I-03 and its two accessories. The CO swapped the camera AND its ride-along mount, so the device
// carries both: the old mount (field_2967 set) and its replacement (clean).
const device = { id: 'dev1', field_2790: 'Informant 8.0 v5', field_2802: 'I-03', field_2789: 1,
                 field_2822_raw: conn(CAM, 'Camera / Reader') };
// field_2967's display value is the removed LINE's product name, never a CO number — the flag must
// still be honoured, and the tag must not try to name a CO out of it.
const oldMount = { id: 'acc-old', field_2790: 'Informant Dual Vision Wall Mount', field_2789: 1,
                   field_2853_raw: conn('dev1', 'I-03'),
                   field_2967_raw: conn('co1', 'Informant Dual Vision Wall Mount') };
const newMount = { id: 'acc-new', field_2790: 'Electrical Box Mount for The Deputy v2', field_2789: 1,
                   field_2853_raw: conn('dev1', 'I-03') };
const records = [device, oldMount, newMount];
ns.data = { readRecords() { return records; } };

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

const card = ns.card.buildCard(device, 'view_4093');
const wraps = [...card.querySelectorAll('.scw-ws-v2-mh-chip-wrap')];
const labelOf = w => w.querySelector('.scw-ws-v2-mh-chip').textContent;

check('both accessories still render — install scope is never deleted, only marked',
  wraps.map(labelOf), ['Informant Dual Vision Wall Mount', 'Electrical Box Mount for The Deputy v2']);
check('only the CO-removed one is set apart',
  wraps.map(w => w.classList.contains('scw-ws-v2-mh-chip-wrap--removed')), [true, false]);
check('the removed chip carries a REMOVED tag; the live one carries none',
  wraps.map(w => (w.querySelector('.scw-ws-v2-mh-removed') || { textContent: '' }).textContent), ['removed', '']);
check('the tag never names a CO — field_2967 holds the removed line\'s product name, not a CO number',
  /\bCO\s*#?\d|1764/.test(wraps[0].textContent), false);
check('the title says why it is struck, the live chip\'s title is just its name',
  [/removed from install scope by a change order/.test(wraps[0].querySelector('.scw-ws-v2-mh-chip').getAttribute('title')),
   wraps[1].querySelector('.scw-ws-v2-mh-chip').getAttribute('title')],
  [true, 'Electrical Box Mount for The Deputy v2']);

// The base chip rule sets text-decoration:none !important, so the strike has to out-specify it.
const css = fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/styles.js'), 'utf8');
check('the strike-through is declared !important, or the base chip rule would win',
  /scw-ws-v2-mh-chip-wrap--removed \.scw-ws-v2-mh-chip[\s\S]{0,200}line-through !important/.test(css), true);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
