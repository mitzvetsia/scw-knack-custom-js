// jsdom smoke test: scene-veil.js holds scene_1085 / scene_1155 behind the veil until the
// render stream goes quiet AND the page's transform markers exist; a scene that never grows
// its markers is force-revealed by the caps; a revealed scene never re-veils on later renders.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom; const { document } = window;
global.window = window; global.document = document;

// Minimal jQuery event bus: $(document).on('name.ns', fn) / trigger('name.ns').
const handlers = {};
function key(ev) { return ev.split('.').slice(0, 2).join('.'); }   // 'knack-view-render.any'
const jqObj = {
  on(ev, fn) { ev.split(/\s+/).forEach(e => { (handlers[key(e)] = handlers[key(e)] || []).push(fn); }); return jqObj; },
  off() { return jqObj; },
  trigger(ev) { (handlers[key(ev)] || []).forEach(fn => fn({ type: ev })); return jqObj; }
};
function jq() { return jqObj; }
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {} }; global.Knack = window.Knack;
window.SCW = {}; global.SCW = window.SCW;

new Function('window', 'document', '$', 'Knack',
  fs.readFileSync(path.join(__dirname, '../../src/features/scene-veil.js'), 'utf8'))(window, document, jq, window.Knack);

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const ready = id => document.getElementById('kn-' + id).classList.contains('scw-scene-ready');
const render = () => jqObj.trigger('knack-view-render.any');

check('veil CSS injected once, covers both scenes',
  [!!document.getElementById('scw-scene-veil-css'), /#kn-scene_1085 > \*/.test(document.getElementById('scw-scene-veil-css').textContent), /#kn-scene_1155/.test(document.getElementById('scw-scene-veil-css').textContent)],
  [true, true, true]);

// ── scene_1085: raw views render, then the transforms land ──
document.body.innerHTML = '<div id="kn-scene_1085"><div id="view_3901"><div class="kn-details">raw</div></div><div id="view_3962">raw grid</div></div>';
render();
check('markers missing right after the first render', SCW.sceneVeil.missing('scene_1085'),
  ['#scw-ws-v2-view_3962', '#scw-pid-hero', '#view_3901 .scw-bsh-card', '.scw-ktl-accordion']);

setTimeout(() => {
  check('still veiled after the quiet window when markers are missing', ready('scene_1085'), false);
  // Transforms land: hero, header card, accordion, worksheet panel (placeholder first).
  const scene = document.getElementById('kn-scene_1085');
  scene.insertAdjacentHTML('afterbegin', '<section id="scw-pid-hero"></section>');
  document.getElementById('view_3901').innerHTML = '<div class="scw-bsh-card">card</div>';
  scene.insertAdjacentHTML('beforeend', '<div class="scw-ktl-accordion"></div><div id="scw-ws-v2-view_3962"><div class="scw-ws-v2-empty">Waiting for source views…</div></div>');
  render();
  setTimeout(() => {
    check('panel placeholder ("Waiting…") still counts as not rendered', [ready('scene_1085'), SCW.sceneVeil.missing('scene_1085')], [false, ['#scw-ws-v2-view_3962']]);
    document.getElementById('scw-ws-v2-view_3962').innerHTML = '<div class="scw-ws-v2-group">rows</div>';
    render();
    setTimeout(() => {
      check('revealed once the stream is quiet and every marker exists', ready('scene_1085'), true);
      // A later render (inline edit refetch) must not re-veil.
      render();
      check('later renders never re-veil', ready('scene_1085'), true);

      // ── scene_1155: panel rendered empty-state (no SOW items) counts as rendered ──
      document.body.innerHTML = '<div id="kn-scene_1155"><section id="scw-pid-hero"></section><div id="view_3970"></div>' +
        '<div id="scw-bid-review-v2"><div class="scw-bid-review-v2-empty">No SOW line items on this project.</div></div></div>';
      render();
      setTimeout(() => {
        check('scene_1155 reveals with hero + rendered v2 panel (a real empty state is rendered)', ready('scene_1155'), true);

        // ── cap: a scene whose markers never arrive is force-revealed by the scene-render cap ──
        document.body.innerHTML = '<div id="kn-scene_1155"><div id="view_3970">raw</div></div>';
        jqObj.trigger('knack-scene-render.scene_1155');
        setTimeout(() => {
          check('still veiled before the scene-render cap (markers absent)', ready('scene_1155'), false);
          setTimeout(() => {
            check('scene-render cap (3s) force-reveals a scene whose markers never arrive', ready('scene_1155'), true);
            console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
            process.exit(fails ? 1 : 0);
          }, 2400);
        }, 750);
      }, 750);
    }, 750);
  }, 750);
}, 750);
