// jsdom smoke test: site-maps-strip.js with 1, 5 and 12 maps — density
// buckets, the +N more overflow tile, and expand / collapse.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
function rec(i) {
  const pdf = i % 4 === 3;
  return { attributes: { id: 'm' + i, field_2877_raw: [{ id: 't', identifier: 'Site Plan' }],
    field_68_raw: { url: 'https://s3/map' + i + (pdf ? '.pdf' : '.png'), thumb_url: pdf ? '' : 'https://s3/map' + i + '_t.png', filename: 'map' + i + (pdf ? '.pdf' : '.png') },
    field_588: 'Map ' + i } };
}
const model = { data: { models: [] } };
window.Knack = { views: { view_3942: { model } }, router: { current_scene_key: 'scene_1311' } };
global.Knack = window.Knack;
window.SCW = { CONFIG: {}, deployNav: { addFileHref() { return ''; }, openSection() { return true; } } };
global.SCW = window.SCW;
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/site-maps-strip.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);
document.body.innerHTML = '<div id="kn-scene_1311"><nav id="scw-deploy-nav"><div class="scw-deploy-row2"><div class="scw-deploy-maps-slot"></div></div></nav><div id="view_3942"></div></div>';
const fire = () => (handlers['knack-view-render.view_3942.scwSiteMaps'] || []).forEach(fn => fn());

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const strip = () => document.getElementById('scw-site-maps');
const visible = () => [...strip().querySelectorAll('.scw-maps__tile, .scw-maps__doc')].filter(t => !t.classList.contains('scw-maps__over')).length;
const all = () => strip().querySelectorAll('.scw-maps__tile, .scw-maps__doc').length;
const bucket = () => ['is-medium', 'is-compact', 'is-expanded'].filter(c => strip().classList.contains(c));

model.data.models = [rec(1)]; fire();
setTimeout(() => {
  check('1 map: big tiles, no overflow tile', [all(), visible(), bucket(), !!strip().querySelector('[data-map-more]')], [1, 1, [], false]);
  model.data.models = [1, 2, 3, 4, 5].map(rec); fire();
  setTimeout(() => {
    check('5 maps: medium tiles, all visible', [all(), visible(), bucket(), !!strip().querySelector('[data-map-more]')], [5, 5, ['is-medium'], false]);
    model.data.models = Array.from({ length: 12 }, (_, i) => rec(i + 1)); fire();
    setTimeout(() => {
      const more = strip().querySelector('[data-map-more]');
      check('12 maps: compact tiles, 6 shown, "+6 more" tile', [all(), visible(), bucket(), more && more.textContent], [12, 6, ['is-compact'], '+6 more']);
      more.click();
      check('+6 more expands in place and flips to Show fewer', [bucket(), more.textContent, more.getAttribute('aria-expanded')], [['is-compact', 'is-expanded'], 'Show fewer', 'true']);
      // A refresh (same maps, new file added) keeps the expanded state.
      model.data.models.push(rec(13)); fire();
      setTimeout(() => {
        check('a re-render keeps the expanded state and recounts', [bucket(), strip().querySelector('[data-map-more]').textContent, all()], [['is-compact', 'is-expanded'], 'Show fewer', 13]);
        strip().querySelector('[data-map-more]').click();
        check('Show fewer collapses back to 6', [bucket(), strip().querySelector('[data-map-more]').textContent], [['is-compact'], '+7 more']);
        console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
        process.exit(fails ? 1 : 0);
      }, 200);
    }, 200);
  }, 200);
}, 200);
