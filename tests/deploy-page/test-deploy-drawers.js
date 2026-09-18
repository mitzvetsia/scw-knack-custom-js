// jsdom smoke test: deploy-page-nav.js parks the non-worksheet sections,
// opens them in the drawer from tiles / chips, returns them home on close,
// puts the doc-generation action on the Setup tile, and mounts the
// "+ Change Order" proxy in the worksheet toolbar.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.Node = window.Node;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {} }; global.SCW = window.SCW;
window.setInterval = function () {};
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/deploy-page-nav.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

function acc(title, count, rollHtml) {
  return '<div class="scw-ktl-accordion"><div class="scw-ktl-accordion__header"><span class="scw-acc-title">' + title + '</span>' +
    (rollHtml || '') + '<span class="scw-acc-count">' + count + '</span></div>' +
    '<div class="scw-ktl-accordion__body" style="display:none"><div class="kn-view"><div class="view-header"><h2 class="kn-title">' + title + '</h2></div></div></div></div>';
}
function buildScene() {
  // A Knack scene render replaces the scene container only — never the
  // body — so the drawer element (appended to body) survives it.
  const sceneHtml =
    '<div id="kn-scene_1311" class="kn-scene">' +
      '<div class="kn-view" id="view_3938"><h1>Project</h1></div>' +
      acc('ACCEPTANCE', '2', '<span class="scw-acpt-rollup scw-acpt-rollup--ok">all signed</span>') +
      acc('System Setup Questionnaire', '1') +
      acc('CLOSEOUT', '1') +
      acc('Other Files', '4') +
      '<div class="kn-view kn-menu" id="view_4081"><a class="kn-link" href="https://x/#deploy/create-change-order">Create Change Order</a></div>' +
      '<div id="scw-ws-v2-view_4093"><div class="scw-ws-v2-toolbar"><div class="scw-ws-v2-toolbar-group scw-ws-v2-toolbar-group--cta">' +
        '<button type="button" class="scw-ws-v2-toolbar-btn scw-ws-v2-toolbar-btn--cta" data-scw-ws-v2-action="add-photos">+ Add Photos</button></div></div>' +
        '<div class="scw-ws-v2-banner"><span class="scw-ws-v2-count">172 records</span></div></div>' +
    '</div>';
  const old = document.getElementById('kn-scene_1311');
  if (old) old.outerHTML = sceneHtml; else document.body.innerHTML = sceneHtml;
  const closeout = [...document.querySelectorAll('#kn-scene_1311 .scw-ktl-accordion')][2];
  closeout.querySelector('.scw-ktl-accordion__body').innerHTML =
    '<div class="scw-cd-toolbar"><span id="scw-regen-docs-wrap"><button type="button" id="scw-regen-docs-btn">Regenerate Docs…</button></span></div>' +
    '<div class="scw-cd-doc is-no-file"></div><div class="scw-cd-doc is-no-file"></div><div class="scw-cd-doc is-no-file"></div>';
  // ktl-accordion's header click toggles is-expanded; emulate it.
  document.querySelectorAll('.scw-ktl-accordion__header').forEach(h => h.addEventListener('click', () => {
    const w = h.parentNode; w.classList.toggle('is-expanded'); w.querySelector('.scw-ktl-accordion__body').style.display = w.classList.contains('is-expanded') ? '' : 'none';
  }));
}
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return this.parentNode; } });
window.HTMLElement.prototype.scrollIntoView = function () {};
buildScene();
window.Knack.views.view_4015 = { model: { data: { models: [{ attributes: { field_1772: 'Pending Tech Support Signoff' } }] } } };
const fire = () => (handlers['knack-scene-render.scene_1311.scwDeployNav'] || []).forEach(fn => fn());
fire();

setTimeout(() => {
  let fails = 0;
  function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
  }
  const accs = () => [...document.querySelectorAll('#kn-scene_1311 .scw-ktl-accordion')];
  check('every non-worksheet section is parked (hidden in place)', accs().map(a => a.classList.contains('scw-deploy-parked')), [true, true, true, true]);
  check('parked sections still produce tiles + chips', [document.querySelectorAll('.scw-deploy-tile').length, [...document.querySelectorAll('.scw-deploy-also__row')].map(b => b.querySelector('.scw-deploy-also__label').textContent + b.querySelector('.scw-deploy-nav-count').textContent)], [4, ['Files4']]);
  const setup = document.querySelector('[data-scw-tile="setup"]');
  check('setup tile: docs not generated → Waiting + Generate button', [setup.querySelector('.scw-deploy-tile__state').textContent, setup.querySelector('[data-scw-tile-docs]').textContent, setup.querySelector('.scw-deploy-tile__fact').textContent],
    ['Waiting', 'Generate documents…', 'Pending Tech Support Signoff · Docs not generated yet']);
  check('CO proxy mounted in the worksheet toolbar, first in the CTA group', (() => { const b = document.getElementById('scw-deploy-co-toolbar-cta'); return [!!b, b && b.parentNode.firstChild === b, b && b.getAttribute('href')]; })(),
    [true, true, 'https://x/#deploy/create-change-order']);

  // Open the Paperwork tile → drawer hosts the acceptance section, expanded.
  const tileNodes = [...document.querySelectorAll('.scw-deploy-tile')];
  const alsoNode = document.querySelector('.scw-deploy-also');
  document.querySelector('[data-scw-tile="paper"] [data-scw-tile-open]').click();
  // A pass while the section is in the drawer must not touch the tiles. Run it NOW
  // (the module defers passes with a timer) so the checks below see its effect.
  const realTimeout = global.setTimeout;
  global.setTimeout = (fn) => { fn(); return 0; };
  try { fire(); } finally { global.setTimeout = realTimeout; }
  const drawer = document.getElementById('scw-deploy-drawer');
  const inDrawer = drawer.querySelector('.scw-deploy-drawer__body .scw-ktl-accordion');
  check('tile opens the drawer with its section inside, expanded', [!drawer.hidden, !!inDrawer, inDrawer && inDrawer.classList.contains('is-expanded'), inDrawer && inDrawer.classList.contains('scw-deploy-in-drawer')], [true, true, true, true]);
  // The nav anchors before the FIRST section; with that section away in the drawer a pass
  // must anchor at its home placeholder, not carry the tiles / maps / "Also" list into the drawer.
  check('the nav (tiles, maps, "also") stays in the scene while the first section is in the drawer',
    [document.getElementById('kn-scene_1311').contains(document.getElementById('scw-deploy-nav')), !!drawer.querySelector('#scw-deploy-nav'), document.getElementById('scw-deploy-nav').nextElementSibling.className],
    [true, false, 'scw-deploy-home']);
  check('drawer head names the stage + renamed section', [drawer.querySelector('.scw-deploy-drawer__eyebrow').textContent, drawer.querySelector('.scw-deploy-drawer__title').textContent], ['1 · Paperwork & billing', 'Agreements & Invoices']);
  // Setup tile → drawer leads with the generated documents from the DOC model.
  // Other Files holds the BLANK generated forms ("(not completed)"); the
  // closeout save grid holds completed uploads (must NOT show here) + the deck.
  window.Knack.views.view_3942 = { model: { data: { models: [
    { attributes: { id: 'o1', field_2877_raw: [{ id: 't1', identifier: 'Scope of Work PDF' }], field_68_raw: { url: 'https://s3/sow.pdf', filename: 'sow_form.pdf' } } },
    // Live shape: the generator types a blank "Location Approval Form" and writes "(not completed)" into the NOTE.
    { attributes: { id: 'o2', field_2877_raw: [{ id: 't2', identifier: 'Location Approval Form' }], field_588: 'Location Approval Form (not completed)', field_68_raw: { url: 'https://s3/loc_blank.pdf', filename: 'location_approval.pdf' } } },
    // A run that missed the type still carries the note: it is a blank too.
    { attributes: { id: 'o3', field_2877_raw: [], field_588: 'View Approval Form (not completed)', field_68_raw: { url: 'https://s3/view_blank.pdf', filename: 'view_approval.pdf' } } },
    // Same type, no "(not completed)" note: a completed upload, not a blank.
    { attributes: { id: 'o4', field_2877_raw: [{ id: 't2', identifier: 'Location Approval Form' }], field_588: 'signed on site', field_68_raw: { url: 'https://s3/loc_done.pdf', filename: 'loc_done.pdf' } } }
  ] } } };
  window.Knack.views.view_3941 = { model: { data: { models: [
    { attributes: { id: 'd2', field_2877_raw: [{ id: 't5', identifier: 'Location Approval Form' }], field_68_raw: { url: 'https://s3/loc_completed.pdf', filename: 'loc_completed.pdf' }, field_2879: 'Pass' } },
    { attributes: { id: 'd4', field_2877_raw: [{ id: 't4', identifier: 'Project Kickoff Deck' }], field_68_raw: { url: 'https://s3/deck.pdf', filename: 'deck.pdf' } } }
  ] } } };
  document.querySelector('[data-scw-tile="setup"] [data-scw-tile-open]').click();
  const pre = drawer.querySelector('.scw-deploy-drawer__prelude');
  check('Setup drawer lists the blank PDFs for the sub (not the completed uploads), in order',
    pre && [...pre.querySelectorAll('.scw-deploy-docs__row')].map(r => [r.querySelector('.scw-deploy-docs__type').textContent, r.querySelector('.scw-deploy-docs__state').textContent, (r.querySelector('.scw-deploy-docs__open') || {}).href || null]),
    [['Scope of Work PDF', 'Ready to print · sow_form.pdf', 'https://s3/sow.pdf'], ['Location Approval Form (blank)', 'Ready to print · location_approval.pdf', 'https://s3/loc_blank.pdf'], ['View Approval Form (blank)', 'Ready to print · view_approval.pdf', 'https://s3/view_blank.pdf'], ['Kickoff Deck', 'Ready to print · deck.pdf', 'https://s3/deck.pdf']]);
  check('the questionnaire section follows the documents', pre && pre.nextElementSibling && pre.nextElementSibling.classList.contains('scw-ktl-accordion'), true);
  // Switch to the Other Files chip while open → previous section goes home.
  document.querySelector('.scw-deploy-also__row').click();
  check('opening another section returns the first one home (parked, in scene)', [accs().length, accs()[0].classList.contains('scw-deploy-parked'), drawer.querySelector('.scw-deploy-drawer__title').textContent], [3, true, 'Files']);
  // A custom panel (bom-tray.js) takes the drawer over: the hosted section goes home first,
  // and opening a section again drops the panel.
  const custom = document.createElement('div'); custom.id = 'custom-panel'; custom.textContent = 'BOM';
  window.SCW.deployNav.openPanel({ eyebrow: '3 · Installation', title: 'Bill of materials', sub: 'ships', el: custom });
  check('openPanel hosts a custom element, sends the section home, titles the drawer',
    [!!drawer.querySelector('.scw-deploy-drawer__body #custom-panel'), custom.classList.contains('scw-deploy-drawer__custom'), accs().length, drawer.querySelector('.scw-deploy-drawer__title').textContent, drawer.querySelector('.scw-deploy-drawer__eyebrow').textContent],
    [true, true, 4, 'Bill of materials', '3 · Installation']);
  document.querySelector('.scw-deploy-also__row').click();
  check('opening a section afterwards drops the custom panel', [!!drawer.querySelector('#custom-panel'), accs().length, drawer.querySelector('.scw-deploy-drawer__title').textContent], [false, 3, 'Files']);
  // Escape closes and returns it home in original position.
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  fire();   // a pass DURING the close (section still in the drawer) must not touch the tiles either
  setTimeout(() => {
  check('Escape closes the drawer (after the slide) and puts the section back where it was', [drawer.hidden, accs().length, accs()[3].getAttribute('data-scw-orig-title')], [true, 4, 'Other Files']);
  check('tiles + the "also" list are the SAME elements after open / mid-close pass / close (no blink)',
    [[...document.querySelectorAll('.scw-deploy-tile')].every((t, i) => t === tileNodes[i]), document.querySelectorAll('.scw-deploy-tile').length, document.querySelector('.scw-deploy-also') === alsoNode], [true, 4, true]);
  // Generate documents → the picker opens under the tile's button (no tray).
  let picked = null;
  window.SCW.regenDocs = { openPicker(host, stateBtn) { picked = [host.className, stateBtn.textContent]; return true; } };
  setup.querySelector('[data-scw-tile-docs]').click();
  check('Generate documents opens just the picker, hosted under the tile', [picked, drawer.hidden], [['scw-deploy-tile__actions', 'Generate documents…'], true]);
  // Without the picker API it falls back to the Closeout drawer + its button.
  delete window.SCW.regenDocs;
  let pressed = 0; document.getElementById('scw-regen-docs-btn').addEventListener('click', () => pressed++);
  setup.querySelector('[data-scw-tile-docs]').click();
  setTimeout(() => {
    check('fallback: opens Closeout and presses Regenerate Docs', [drawer.querySelector('.scw-deploy-drawer__title').textContent, pressed], ['Closeout Deliverables', 1]);
    // Navigating (hash change, e.g. the questionnaire page link) closes the drawer.
    window.dispatchEvent(new window.Event('hashchange'));
    setTimeout(() => {
    check('a hash navigation closes the drawer and returns the section home', [drawer.hidden, accs().length], [true, 4]);
    // Reopen, then scene re-render underneath the open drawer → drawer drops the stale section.
    document.querySelector('[data-scw-tile="paper"] [data-scw-tile-open]').click();
    buildScene(); fire();
    setTimeout(() => {
      check('scene re-render closes a stale drawer', [drawer.hidden, drawer.querySelector('.scw-deploy-drawer__body').children.length], [true, 0]);
    }, 600);
    setTimeout(() => {
      console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
      process.exit(fails ? 1 : 0);
    }, 900);
    }, 250);
  }, 120);
  }, 250);
}, 400);
