// jsdom smoke test: co-cards.js "waiting on your pricing" bar (sub dashboard, scene_1353).
// A CO in Pending Sub Pricing is blocked on the SUB, but since the deploy redesign the CO list is
// a drawer row — a sub can open the dashboard for days and never see it. The bar has to appear
// above the stage tiles, name each blocked CO, link straight to it, and stay out of the way
// everywhere else (ops page, or a sub page with nothing pending).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.setInterval = function () {}; global.setInterval = function () {};
window.Knack = { views: {}, router: { current_scene_key: 'scene_1353' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {} }; global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/co-cards.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

// One CO row on the sub's CO grid (view_4123). Status text is what the Builder renders.
const row = (id, name, number, status) =>
  '<tr id="' + id + '">' +
    '<td class="field_2126">' + name + '</td>' +
    '<td class="field_2122">' + number + '</td>' +
    '<td class="field_2953">' + status + '</td>' +
    '<td class="kn-table-link"><a class="kn-link-page" href="#deploy/x/change-order/' + id + '">Edit</a></td>' +
  '</tr>';
function scene(sceneId, rows) {
  document.body.innerHTML =
    '<div id="kn-' + sceneId + '">' +
      '<nav id="scw-deploy-nav"><div class="scw-deploy-tiles"></div></nav>' +
      '<div class="kn-table kn-view" id="view_4123"><div class="kn-table-wrapper"><table>' +
        '<thead><tr><th class="field_2126">Name</th><th class="field_2122">SOW id</th>' +
          '<th class="field_2953">Status</th><th class="kn-table-link"></th></tr></thead>' +
        '<tbody>' + rows.join('') + '</tbody>' +
      '</table></div></div>' +
    '</div>';
}
const fire = () => (handlers['knack-view-render.any.scwCoCards'] || []).forEach(fn => fn({}, { key: 'view_4123' }));
const bar = () => document.getElementById('scw-co-alert');

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}

// ── The case that matters: sub page, one CO waiting on them ──────────
scene('scene_1353', [
  row('co1', 'CO #1 Relocate Cameras I-01 & I-02. Swap/Replace I-03', '60486704913-SW1764CO', 'Accepted'),
  row('co2', 'I-01 & I-02 Relocation Credit', '60486704913-SW1829CO', 'Pending Sub Pricing')
]);
fire();
check('the bar appears, and sits ABOVE the stage tiles rather than in the drawer',
  [!!bar(), bar() && bar().nextElementSibling.id], [true, 'scw-deploy-nav']);
check('it names only the CO that is actually blocked on the sub',
  [...bar().querySelectorAll('.scw-co-alert__name')].map(n => n.textContent),
  ['I-01 & I-02 Relocation Credit']);
check('singular headline, and it says what is blocked',
  [bar().querySelector('.scw-co-alert__title').textContent,
   /labor pricing back/.test(bar().querySelector('.scw-co-alert__body').textContent)],
  ['A change order is waiting on your pricing', true]);
check('the action opens that CO in a new tab, using the grid\'s own link',
  (() => { const a = bar().querySelector('.scw-co-alert__btn');
           return [a.textContent, a.getAttribute('href'), a.getAttribute('target')]; })(),
  ['Add your pricing', '#deploy/x/change-order/co2', '_blank']);

// ── Two pending → plural, one row each ───────────────────────────────
scene('scene_1353', [
  row('co2', 'Relocation Credit', '60486704913-SW1829CO', 'Pending Sub Pricing'),
  row('co3', 'Extra Conduit', '60486704913-SW1830CO', 'Pending Sub Pricing')
]);
fire();
check('two pending → plural headline and a row (with its own link) per CO',
  [bar().querySelector('.scw-co-alert__title').textContent,
   bar().querySelectorAll('.scw-co-alert__row').length,
   [...bar().querySelectorAll('.scw-co-alert__btn')].map(a => a.getAttribute('href'))],
  ['2 change orders are waiting on your pricing', 2,
   ['#deploy/x/change-order/co2', '#deploy/x/change-order/co3']]);

// ── Nothing pending → no bar at all (it must not become page furniture) ──
scene('scene_1353', [row('co1', 'Done deal', '60486704913-SW1764CO', 'Accepted')]);
fire();
check('nothing pending → the bar is removed, not left empty', bar(), null);

// ── Ops page → never. co-stage-strip already tells ops where the CO is ──
scene('scene_1311', [row('co2', 'Relocation Credit', '60486704913-SW1829CO', 'Pending Sub Pricing')]);
fire();
check('ops deploy page never gets the bar, even with a CO pending sub pricing', bar(), null);

// A sub page again, to prove the ops case removed it rather than never building it.
scene('scene_1353', [row('co2', 'Relocation Credit', '60486704913-SW1829CO', 'Pending Sub Pricing')]);
fire();
check('back on the sub page it returns', !!bar(), true);

console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
process.exit(fails ? 1 : 0);
