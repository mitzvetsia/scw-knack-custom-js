// jsdom smoke test: the Project Number badge (project-id-badge.js) resolves the HubSpot deal
// id authoritatively from field_1622, derives it from a SOW / survey identifier prefix when the
// field isn't on the scene, renders as the FIRST thing in the scene with a copy control, says
// "not on this record" instead of guessing, and hands documents an inline-styled banner/footer.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.navigator = window.navigator;
global.MutationObserver = window.MutationObserver;
const sceneHandlers = {};
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { fn && fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {} }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender() {}, onSceneRender(id, fn) { sceneHandlers[id] = fn; } };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/project-id-badge.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const conn = (id, identifier) => [{ id, identifier }];
function scene(id, inner) {
  document.body.innerHTML = '<div id="kn-' + id + '">' + inner + '</div>';
  return document.getElementById('kn-' + id);
}

// 1. Sub dashboard — a details view on the scene carries field_1622: authoritative.
scene('scene_1353', '<nav id="scw-deploy-nav">tiles</nav><div class="kn-view" id="view_4050"><div class="kn-detail field_4"><div class="kn-detail-body">Riverside Yard</div></div></div>');
window.Knack.views = { view_4050: { model: { attributes: { id: 'p1', field_4: 'Riverside Yard', field_1622: '60486704913', field_1622_raw: 60486704913 } } } };
check('sub dashboard scene handler registered', typeof sceneHandlers.scene_1353, 'function');
sceneHandlers.scene_1353();
let hero = document.getElementById('scw-pid-hero');
check('hero renders FIRST in the scene, ahead of the deploy nav',
  [!!hero, document.getElementById('kn-scene_1353').firstChild === hero], [true, true]);
check('authoritative id from field_1622, flagged as such',
  [hero.getAttribute('data-scw-pid'), hero.getAttribute('data-scw-pid-source'), hero.querySelector('.scw-pid-num').textContent], ['60486704913', 'field', '60486704913']);
check('sub variant carries the tech-support line and a 44px copy control',
  [/tech support/.test(hero.querySelector('.scw-pid-support').textContent), hero.querySelector('.scw-pid-copy').getAttribute('data-scw-pid-copy')], [true, '60486704913']);
check('right half names the project', hero.querySelector('.scw-pid-title').textContent, 'Riverside Yard');
check('sticky pill exists and carries the same number', (document.getElementById('scw-pid-sticky') || {}).getAttribute('data-scw-pid'), '60486704913');

// 2. Sub CO page — no field_1622 anywhere; the SOW identifier prefix derives it, CO context fills the right.
scene('scene_1374', '<div class="kn-view" id="view_4121"><div id="kn-input-field_2123"><label>CO #</label><input value="1873"></div><div id="kn-input-field_2126"><label>Name</label><input value="Swap camera at gate"></div></div>' +
  '<div class="kn-view" id="view_4122"><div class="kn-detail field_2953"><div class="kn-detail-body">Pending Sub Pricing</div></div><div class="kn-detail field_2127"><div class="kn-detail-body">60486704913-SW1829CO | Swap camera at gate</div></div></div>');
window.Knack.views = { view_4122: { model: { attributes: { id: 's1', field_2127: '60486704913-SW1829CO | Swap camera at gate', field_2119_raw: conn('p1', 'Riverside Yard') } } } };
sceneHandlers.scene_1374();
hero = document.getElementById('scw-pid-hero');
check('derived from the SOW identifier prefix when field_1622 is absent',
  [hero.getAttribute('data-scw-pid'), hero.getAttribute('data-scw-pid-source')], ['60486704913', 'derived']);
check('CO scene: number, name and status on the right half',
  [hero.querySelector('.scw-pid-conum').textContent, hero.querySelector('.scw-pid-coname').textContent, hero.querySelector('.scw-pid-status').textContent],
  ['1873', 'Swap camera at gate', 'Pending Sub Pricing']);
check('project name read through the SOW connection', hero.querySelector('.scw-pid-sub').textContent, 'Riverside Yard');

// 3. Survey page — the REQ id prefix in a grid row.
scene('scene_1140', '<div class="kn-view" id="view_3825"></div>');
window.Knack.views = { view_3825: { model: { data: { models: [{ attributes: { id: 'r1', field_2345: '62610818596-SR168' } }] } } } };
sceneHandlers.scene_1140();
hero = document.getElementById('scw-pid-hero');
check('derived from a survey request id in a grid row', [hero.getAttribute('data-scw-pid'), hero.querySelector('.scw-pid-chip').textContent], ['62610818596', 'SR168']);

// 4. Ops variant — quiet caption, no amber line.
scene('scene_1311', '<div class="kn-view" id="view_3938"><div class="kn-detail field_1622"><div class="kn-detail-body">60486704913</div></div></div>');
window.Knack.views = {};
sceneHandlers.scene_1311();
hero = document.getElementById('scw-pid-hero');
check('ops variant: id read from the rendered detail, no tech-support line',
  [hero.getAttribute('data-scw-pid'), !!hero.querySelector('.scw-pid-support'), /HubSpot deal id/.test(hero.querySelector('.scw-pid-hint').textContent)], ['60486704913', false, true]);

// 5. Nothing to read → explicit unresolved state, never blank, no sticky.
scene('scene_1353', '<div class="kn-view" id="view_4050"><div class="kn-detail field_4"><div class="kn-detail-body">Mystery</div></div></div>');
window.Knack.views = { view_4050: { model: { attributes: { id: 'p2', field_4: 'Mystery' } } } };
sceneHandlers.scene_1353();
hero = document.getElementById('scw-pid-hero');
check('unresolved: "not on this record", no copy button, pill hidden',
  [hero.querySelector('.scw-pid-none').textContent, !!hero.querySelector('.scw-pid-copy'), !!(document.getElementById('scw-pid-sticky') && document.getElementById('scw-pid-sticky').classList.contains('is-shown'))],
  ['not on this record', false, false]);

// 6. Document fragments.
const ban = SCW.projectId.banner('60486704913', { right: ['SOW SW1163', 'Proposal 20260612-10251'], phone: '555-0100' });
check('banner: number, right-column ids, reference line with phone — inline styles only',
  [/60486704913/.test(ban), /SW1163/.test(ban), /contacting SCW support/.test(ban), /555-0100/.test(ban), /class="[^"]*"\s+style=/.test(ban), /<style/.test(ban)],
  [true, true, true, true, true, false]);
check('footer repeats the number; empty when unresolved',
  [/Project # 60486704913/.test(SCW.projectId.footer('60486704913', 'SW1163')), SCW.projectId.footer('', 'SW1163')], [true, '']);
check('prefixOf parses the three identifier shapes',
  ['60486704913-SW1163 | name', '62610818596-SR168', '60486704913-SW1829CO', 'SW1163'].map(SCW.projectId.prefixOf),
  ['60486704913', '62610818596', '60486704913', '']);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
