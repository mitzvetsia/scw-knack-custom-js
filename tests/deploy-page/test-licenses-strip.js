// jsdom smoke test: licenses-strip.js — the "Recurring licenses" card deploy-page-nav.js mounts
// between "Also on this project" and the worksheet (its own slot, not the Also list, not a drawer).
// Collapsed by default; the header alone states count + extended total; pricing is joined from the
// proposed SOW item (field_2819 -> view_4072) the same way bom-tray.js reads it; non-license and
// zero-license cases; a line with no linked SOW pricing degrades to a dash + a footnote, never crashes.
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

const LIC = '645554dce6f3a60028362a6a', CAM = 'bucket_cam';
const conn = (id, name) => [{ id, identifier: name }];
const install = [
  { id: 'l1', field_2790: '10-Pack Mobile Credentials', field_2789: 2, field_2218: 90,
    field_2822_raw: conn(LIC, 'License'), field_2819_raw: conn('s1', 'x') },
  { id: 'l2', field_2790: 'Avigilon Alta Software License Pack Basic - 5 Entries - SW-BSC-P5', field_2789: 1, field_2218: 90,
    field_2822_raw: conn(LIC, 'License'), field_2819_raw: conn('s2', 'x') },
  // No linked SOW item at all: pricing unknown, must not crash and must not silently total as $0.
  { id: 'l3', field_2790: 'Health Monitoring License', field_2789: 1, field_2218: 90,
    field_2822_raw: conn(LIC, 'License') },
  // Not a license: must be excluded even though it sits right beside them.
  { id: 'c1', field_2790: 'Deputy 8.0 v5', field_2789: 1, field_2218: 10, field_2822_raw: conn(CAM, 'Camera / Reader'), field_2819_raw: conn('s3', 'x') }
];
const sow = [
  { id: 's1', field_1960: '$18.00', field_2262: '$0.00', field_2268: '$18.00', field_9999: 'MC-10' },
  { id: 's2', field_1960: '$85.00', field_2262: '$0.00', field_2268: '$85.00', field_9999: 'SW-BSC-P5' },
  { id: 's3', field_1960: '$500.00', field_2262: '$0.00', field_2268: '$500.00', field_9999: 'DEP-80-V5' }
];
const models = recs => ({ model: { data: { models: recs.map(a => ({ attributes: a })) } } });
window.Knack = { views: { view_4093: models(install), view_4072: models(sow) }, router: { current_scene_key: 'scene_1311' } };
global.Knack = window.Knack;
window.SCW = { CONFIG: {} };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/licenses-strip.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

function mountPage() {
  document.body.innerHTML = '<div id="kn-scene_1311">' +
    '<nav id="scw-deploy-nav"><div class="scw-deploy-row2"></div><div class="scw-deploy-licenses-slot"></div></nav>' +
    '<div class="kn-view kn-table" id="view_4093"></div>' +
    '<div class="kn-view kn-table" id="view_4072" style="display:none"><table><thead><tr><th class="field_1949">Product</th><th class="field_9999">SKU</th></tr></thead><tbody></tbody></table></div>' +
  '</div>';
}
const fire = () => (handlers['knack-view-render.view_4093.scwLicStrip'] || []).forEach(fn => fn());

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const strip = () => document.getElementById('scw-lic-strip');
const rowCells = () => [...strip().querySelectorAll('.scw-lic__row')].map(r => [
  r.querySelector('.scw-lic__name').textContent,
  (r.querySelector('.scw-lic__sku') || { textContent: '' }).textContent,
  r.querySelector('.scw-lic__qty').textContent,
  r.querySelector('.scw-lic__money').textContent,
  r.querySelector('.scw-lic__status').textContent.trim()
]);

mountPage();
window.Knack.views = { view_4093: models(install), view_4072: models(sow) };
fire();
setTimeout(() => {
  check('mounted inside its own slot, not the Also list', strip().closest('.scw-deploy-licenses-slot') !== null, true);
  check('collapsed by default', strip().classList.contains('is-open'), false);
  check('header: title, sub-copy, count and extended total (unpriced line means the total is left out)',
    [strip().querySelector('.scw-lic__title').textContent,
     /billed separately.*not part of the worksheet/i.test(strip().querySelector('.scw-lic__sub').textContent),
     strip().querySelector('.scw-lic__count').textContent,
     strip().querySelector('.scw-lic__total')],
    ['Recurring licenses', true, '3 lines', null]);
  check('the camera line is excluded; only the three license lines render, sorted A→Z',
    rowCells().map(r => r[0]),
    ['10-Pack Mobile Credentials', 'Avigilon Alta Software License Pack Basic - 5 Entries - SW-BSC-P5', 'Health Monitoring License']);
  check('qty, SKU (joined via the SOW grid header) and extended price (net x qty) per row',
    [rowCells()[0][1], rowCells()[0][2], rowCells()[0][3], rowCells()[1][3]],
    ['MC-10', '×2', '$36.00', '$85.00']);
  check('every row reads Not yet activated — no activation control exists yet', rowCells().map(r => r[4]), Array(3).fill('Not yet activated'));
  check('a line with no linked SOW item shows a dash, not a crash or a silent $0', rowCells()[2][3], '—');
  check('an unpriced line drops the header total and adds a footnote', /no linked SOW pricing/i.test(strip().querySelector('.scw-lic__foot').textContent), true);

  strip().querySelector('.scw-lic__head').click();
  check('clicking the header opens it', [strip().classList.contains('is-open'), strip().querySelector('.scw-lic__head').getAttribute('aria-expanded')], [true, 'true']);

  // Re-render with the same data: signature unchanged, must not reset the open state or rebuild.
  const sameEl = strip();
  fire();
  setTimeout(() => {
    check('an unchanged re-render keeps the same element and the open state', [strip() === sameEl, strip().classList.contains('is-open')], [true, true]);

    // All fully-priced lines now: the header shows a real total, and the open state survives the rebuild.
    window.Knack.views = { view_4093: models(install.filter(r => r.id !== 'l3')), view_4072: models(sow) };
    fire();
    setTimeout(() => {
      check('fully priced: header total is 2x$18.00 + $85.00 = $121.00, no footnote, stays open across the content change',
        [strip().querySelector('.scw-lic__total').textContent, strip().querySelector('.scw-lic__foot'), strip().classList.contains('is-open')],
        ['$121.00', null, true]);

      // No license lines at all: the strip disappears entirely (unlike the maps strip, no permanent empty state).
      window.Knack.views = { view_4093: models(install.filter(r => r.field_2822_raw[0].id !== LIC)), view_4072: models(sow) };
      fire();
      setTimeout(() => {
        check('zero license lines: no card at all, slot collapses to empty', [strip(), document.querySelector('.scw-deploy-licenses-slot').innerHTML], [null, '']);
        console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
        process.exit(fails ? 1 : 0);
      }, 200);
    }, 200);
  }, 200);
}, 200);
