// jsdom smoke test: the worksheet SCOPE STRIP (summary.js buildScopeStrip / aggregateScope /
// l1ScopeLine) — the grand slot answers "what is on this proposal?" with one tile per family
// (the proposal bucket every line already carries: cameras / readers with their splits, headend &
// networking and other equipment listing products BY NAME with counts, muted services + licenses,
// a rose removed-by-CO tile on the install worksheet) and folds mounts into the camera tile; each
// MDF/IDF header gets the same numbers as chips. No product family field, no name rules. Design:
// canvas "Worksheet Scope Summary" (2026-10-09).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body id="knack-body scene_1085"></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#build-sow/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1085' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, worksheetV2: {}, debug() {}, onViewRender() {}, onSceneRender() {} }; global.SCW = window.SCW;
for (const f of ['config.js', 'card.js', 'groups.js', 'summary.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/worksheet-v2/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}
const ns = window.SCW.worksheetV2;
const CAM = '6481e5ba38f283002898113c', MNT = '594a94536877675816984cb9', NET = '647953bb54b4e1002931ed97',
      OTH = '5df12ce036f91b0015404d78', SVC = '6977caa7f246edf67b52cbcd', ASM = '697b7a023a31502ec68b3303', LIC = '645554dce6f3a60028362a6a';
const conn = (id, name) => [{ id, identifier: name }];
const mdf = (id, name) => conn(id, name);
const yes = 'Yes', no = 'No';
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const txt = el => el.textContent.replace(/\s+/g, ' ').trim();

// ── Build-SOW worksheet (view_3962): SOW fields, money = sub bid (field_2150) ──────────────
// field_2461 = use existing cabling · field_1984 = exterior · field_1983 = plenum · field_1964 = qty
const cam = (id, name, mdfId, exist, ext, plen, bid, qty) => ({
  id, field_1949: '<span class="' + id + 'p">' + name + '</span>', field_1964: qty == null ? 1 : qty, field_2219_raw: conn(CAM, 'Camera / Reader'),
  field_1946_raw: mdf(mdfId, mdfId === 'L1' ? 'MDF - Clubhouse' : 'IDF 01 - Gym'), field_2218: 10, field_2150: bid, field_2461: exist, field_1984: ext, field_1983: plen
});
const sow = [
  cam('c1', 'Vista Dome 4MP',  'L1', no,  no,  yes, 500),
  cam('c2', 'Vista Dome 4MP',  'L1', yes, no,  no,  500),
  cam('c3', 'Vista Bullet 8MP', 'L1', no, yes, no,  700),
  cam('c4', 'Vista Bullet 8MP', 'L2', no, yes, no,  700, 2),   // qty 2 → counts twice everywhere
  cam('c5', 'Deputy PTZ 4K',    'L2', '',  '',  '',  900),     // blank flags → in neither split
  // a mount ATTACHED to c1 (parent field_2464 + Require Sub Bid No): groups.js hides it under the camera card,
  // so the tree never carries it — the strip and the header line count it from the render's full record list
  { id: 'm1', field_1949: 'Wall Mount Bracket', field_1964: 4, field_2219_raw: conn(MNT, 'Mounting Hardware'), field_1946_raw: mdf('L1', 'MDF - Clubhouse'), field_2218: 15, field_2150: 40,
    field_2464_raw: conn('c1', 'Vista Dome 4MP'), field_2479: 'No', field_2479_raw: false },
  { id: 'n1', field_1949: 'Imperial 256 Channel 4K NVR', field_1964: 1, field_2219_raw: conn(NET, 'Networking or Headend'), field_1946_raw: mdf('L1', 'MDF - Clubhouse'), field_2218: 20, field_2150: 2400 },
  { id: 'n2', field_1949: 'PoE switch 48-port', field_1964: 2, field_2219_raw: conn(NET, 'Networking or Headend'), field_1946_raw: mdf('L1', 'MDF - Clubhouse'), field_2218: 21, field_2150: 1050 },
  { id: 'n3', field_1949: 'UniFi outdoor antenna', field_1964: 1, field_2219_raw: conn(NET, 'Networking or Headend'), field_1946_raw: mdf('L2', 'IDF 01 - Gym'), field_2218: 22, field_2150: 440 },
  { id: 'o1', field_1949: 'Rack UPS 1500VA', field_1964: 1, field_2219_raw: conn(OTH, 'Other Equipment'), field_1946_raw: mdf('L1', 'MDF - Clubhouse'), field_2218: 30, field_2150: 300 },
  { id: 's1', field_1949: '', field_2020: 'Lift rental', field_1964: 1, field_2219_raw: conn(SVC, 'Services'), field_1946_raw: mdf('L1', 'MDF - Clubhouse'), field_2218: 40, field_2150: 650 },
  { id: 'a1', field_1949: 'Standard assumption', field_1964: 1, field_2219_raw: conn(ASM, 'Assumptions'), field_1946_raw: mdf('L1', 'MDF - Clubhouse'), field_2218: 50, field_2150: 0 },
  { id: 'l1', field_1949: 'Cloud Storage License, 30 days', field_1964: 3, field_2219_raw: conn(LIC, 'License'), field_2218: 90, field_2150: 45 }
];
const F = ns.cfg.fields('view_3962');
const opts = { viewKey: 'view_3962', fields: F, moneyLabel: 'sub bid', records: sow };
const a = ns.summary.aggregateScope(sow, opts);
check('families come from the bucket on each line (qty-weighted): 6 cameras, 4 mounts, 4 headend, 1 other, 1 service, 3 licenses; assumptions skipped',
  [a.title, a.cam.count, a.mounts.count, a.headend.count, a.other.count, a.services.count, a.licenses.count, a.lineItems],
  ['Cameras', 6, 4, 4, 1, 1, 3, 12]);
check('camera splits: new drops vs existing cable, interior vs exterior, plenum — blank flags count in neither',
  [a.cam.newDrops, a.cam.existing, a.cam.interior, a.cam.exterior, a.cam.plenum],
  [4, 1, 2, 3, 1]);
check('headend products listed by name with counts, most first; no family field, no name rule',
  a.headend.products.map(p => p.qty + 'x ' + p.name), ['2x PoE switch 48-port', '1x Imperial 256 Channel 4K NVR', '1x UniFi outdoor antenna']);
check('money is the view\'s own (sub bid) per family; the total leaves licenses out',
  [a.cam.money, a.mounts.money, a.headend.money, a.other.money, a.services.money, a.licenses.money, a.total],
  [500 + 500 + 700 + 700 + 900, 40, 2400 + 1050 + 440, 300, 650, 45, 500 + 500 + 700 + 700 + 900 + 40 + 2400 + 1050 + 440 + 300 + 650]);
check('a reader-only proposal titles the tile "Readers"; cameras and readers never share one',
  [ns.summary.aggregateScope([cam('r1', 'Door Reader Pro', 'L1', no, no, no, 100)], opts).title,
   ns.summary.aggregateScope([cam('r1', 'Door Reader Pro', 'L1', no, no, no, 100), cam('c9', 'Vista Dome', 'L1', no, no, no, 100)], opts).title],
  ['Readers', 'Cameras & readers']);

const tree = ns.groups.buildGroupTree(sow, [], { viewKey: 'view_3962', fields: F });
check('the attached mount is hidden from the group tree (so the strip must not count from the tree alone)',
  tree.some(l1 => l1.l2.some(l2 => l2.records.some(r => r.id === 'm1'))), false);
const strip = ns.summary.buildScopeStrip(tree, opts);
const tiles = [...strip.querySelectorAll('[data-scw-ws-v2-scope-tile]')];
check('the strip renders one tile per family that has lines, mounts folded into the camera tile (no mounts tile)',
  tiles.map(t => t.getAttribute('data-scw-ws-v2-scope-tile')), ['cam', 'headend', 'other', 'services', 'license']);
const camTile = tiles[0];
check('camera tile: label, count, money corner, three full-width bars with the labels inside, mounts line',
  [txt(camTile.querySelector('.scw-ws-v2-scope-k span')), txt(camTile.querySelector('.scw-ws-v2-scope-n')), txt(camTile.querySelector('.scw-ws-v2-scope-corner')),
   [...camTile.querySelectorAll('.scw-ws-v2-scope-bar')].map(txt), txt(camTile.querySelector('.scw-ws-v2-scope-mounts'))],
  ['Cameras', '6', '$3,300', ['4 new drops1 existing cable', '2 interior3 exterior', '1 plenum5 not plenum'], '4 mounts$40']);
check('without the record list the strip falls back to the tree (attached mounts then do not show)',
  ns.summary.buildScopeStrip(tree, { viewKey: 'view_3962', fields: F }).querySelector('.scw-ws-v2-scope-mounts'), null);
check('bar fill width is the share of the pair', camTile.querySelector('.scw-ws-v2-scope-bar-a').getAttribute('style'), 'width:80%');
check('tiles carry the record ids they stand for (the click highlights those cards)',
  [camTile.getAttribute('data-scw-ws-v2-scope-ids').split(',').sort(), camTile.querySelector('.scw-ws-v2-scope-mounts').getAttribute('data-scw-ws-v2-scope-ids')],
  [['c1', 'c2', 'c3', 'c4', 'c5'], 'm1']);
check('headend tile lists its products by name with counts', [...tiles[1].querySelectorAll('.scw-ws-v2-scope-list span')].map(txt),
  ['2×', 'PoE switch 48-port', '1×', 'Imperial 256 Channel 4K NVR', '1×', 'UniFi outdoor antenna']);
check('services and licenses are muted tiles; services name the lines, licenses say they are not in the total',
  [tiles[3].classList.contains('scw-ws-v2-scope-tile--muted'), txt(tiles[3].querySelector('.scw-ws-v2-scope-sub')), tiles[4].classList.contains('scw-ws-v2-scope-tile--muted'), txt(tiles[4].querySelector('.scw-ws-v2-scope-sub'))],
  [true, '1× Lift rental · $650', true, 'recurring · billed separately · not in total']);
const prod = strip.querySelector('.scw-ws-v2-scope-products');
check('the old product table (the tree\'s rows, as before — hidden mounts stay out of it) sits behind a closed "Products" disclosure (same grand persistence id) with the meta line',
  [prod.getAttribute('data-scw-ws-v2-summary-id'), prod.classList.contains('scw-ws-v2-summary--open'), txt(prod.querySelector('[data-scw-ws-v2-summary-toggle]')),
   txt(prod.querySelector('.scw-ws-v2-scope-meta')), prod.querySelectorAll('.scw-ws-v2-summary-body table.scw-ws-v2-summary-table tbody tr').length > 5],
  ['grand', false, 'Products (8)', '12 line items · 2 MDF/IDFs · $8,180 sub bid · licenses not included', true]);
check('an empty tree renders the empty strip', ns.summary.buildScopeStrip([], { viewKey: 'view_3962', fields: F }).classList.contains('scw-ws-v2-scope--empty'), true);

// ── MDF/IDF header line: that group's families as chips ────────────────────────────────────
const l1Clubhouse = tree.find(l1 => l1.label === 'MDF - Clubhouse');
const line = document.createElement('div'); line.innerHTML = ns.summary.l1ScopeLine(l1Clubhouse, opts);
check('the MDF/IDF header line carries the group\'s own numbers as chips (3 cameras with splits, mounts, headend by name, other, services)',
  [...line.querySelectorAll('.scw-ws-v2-l1-scope-chip')].map(txt),
  ['3 cameras · 2 new · 1 existing · 2 int · 1 ext · 1 plenum', '4 mounts', '3 headend · 2× PoE switch 48-port · 1× Imperial 256 Channel 4K NVR', '1 other · 1× Rack UPS 1500VA', '1 service']);
check('a zero side collapses into the other segment instead of a sliver; one unit reads singular',
  [...document.createRange().createContextualFragment(
     ns.summary.buildScopeStrip(ns.groups.buildGroupTree([cam('z1', 'Vista Dome 4MP', 'L1', no, no, no, 100)], [], { viewKey: 'view_3962', fields: F }), { viewKey: 'view_3962', fields: F }).outerHTML
   ).querySelectorAll('.scw-ws-v2-scope-bar')].map(b => [txt(b), b.children.length, b.firstElementChild.className.indexOf('--full') > 0]),
  [['1 new drop · 0 existing cable', 1, true], ['1 interior · 0 exterior', 1, true]]);
check('a group with no records has no line', ns.summary.l1ScopeLine({ id: 'x', l2: [] }, opts), '');

// ── Install worksheet (view_4093): install fields, no money, QA bar, removed-by-CO tile ──────
const FI = ns.cfg.fields('view_4093');
const inst = (id, name, extra) => Object.assign({
  id, field_2790: name, field_2789: 1, field_2822_raw: conn(CAM, 'Camera / Reader'), field_2818_raw: mdf('L1', 'MDF - Clubhouse'), field_2218: 10,
  field_2807: no, field_2805: no, field_2806: no, field_2830: no
}, extra || {});
const install = [
  inst('i1', 'Vista Dome 4MP', { field_2830: yes }),
  inst('i2', 'Vista Dome 4MP', { field_2830_raw: true, field_2807: yes }),
  inst('i3', 'Vista Bullet 8MP', { field_2805: yes }),
  inst('i4', 'Deputy PTZ 4K', { field_2967_raw: conn('co1', '60486704913-SW1418CO') }),   // removed by CO → counted apart
  { id: 'i5', field_2790: 'Admiral 32 Channel NVR', field_2789: 1, field_2822_raw: conn(NET, 'Networking or Headend'), field_2818_raw: mdf('L1', 'MDF - Clubhouse'), field_2218: 20 }
];
const iopts = { viewKey: 'view_4093', fields: FI, hideMoney: true };
const ia = ns.summary.aggregateScope(install, iopts);
check('install: cameras counted from the install object\'s own fields; the removed-by-CO row is counted apart, not as a camera',
  [ia.cam.count, ia.cam.existing, ia.cam.newDrops, ia.cam.exterior, ia.cam.interior, ia.headend.count, ia.removed.count, ia.removed.labels, ia.lineItems, ia.hideMoney],
  [3, 1, 2, 1, 2, 1, 1, ['60486704913-SW1418CO'], 4, true]);
check('install: QA passed counts from field_2830 (Yes or raw true)', [ia.hasQa, ia.cam.qaPassed, ia.cam.qaOpen], [true, 2, 1]);
const itree = ns.groups.buildGroupTree(install, [], { viewKey: 'view_4093', fields: FI });
const istrip = ns.summary.buildScopeStrip(itree, iopts);
const itiles = [...istrip.querySelectorAll('[data-scw-ws-v2-scope-tile]')];
check('install strip: no money anywhere, a green QA bar in the camera tile, a rose removed-by-CO tile naming the CO',
  [istrip.querySelectorAll('.scw-ws-v2-scope-corner').length, /\$/.test(istrip.textContent), [...itiles[0].querySelectorAll('.scw-ws-v2-scope-bar')].map(txt),
   itiles[0].querySelector('.scw-ws-v2-scope-bar-a--ok') != null, itiles.map(t => t.getAttribute('data-scw-ws-v2-scope-tile')),
   itiles[itiles.length - 1].classList.contains('scw-ws-v2-scope-tile--removed'), txt(itiles[itiles.length - 1].querySelector('.scw-ws-v2-scope-sub'))],
  [0, false, ['2 new drops1 existing cable', '2 interior1 exterior', '2 QA passed1 open'], true, ['cam', 'headend', 'removed'], true, '60486704913-SW1418CO']);
const iline = document.createElement('div'); iline.innerHTML = ns.summary.l1ScopeLine(itree[0], iopts);
check('install header line: QA passed in the camera chip, a rose removed-by-CO chip',
  [...iline.querySelectorAll('.scw-ws-v2-l1-scope-chip')].map(c => txt(c) + (c.classList.contains('scw-ws-v2-l1-scope-chip--removed') ? ' [removed]' : '')),
  ['3 cameras · 2 new · 1 existing · 2 int · 1 ext · 2 QA passed', '1 headend · 1× Admiral 32 Channel NVR', '1 removed by CO [removed]']);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
