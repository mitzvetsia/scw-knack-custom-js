// jsdom smoke test: the deploy page's "Change Orders" row always opens the Change Orders
// section (2026-10-21, "the CO link jumps down a few lines instead of opening the drawer").
// deploy-page-nav.js moves the Change Orders grid above the worksheet and used to wait for the
// accordion engine's next render pass to wrap it; meanwhile the "Also on this project" row
// targeted the bare, hidden container and a click scrolled to it — onto the worksheet's scope
// strip. Now: a grid that already has a wrapper moves WITH it (no empty shell left behind), a
// bare grid is wrapped on the spot through the engine's refresh, the row re-resolves its target
// at click time, and nothing ever scrolls to a container without a box.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.Node = window.Node; global.MutationObserver = window.MutationObserver;
const handlers = {};
function jq() { return jqObj; }
const jqObj = { on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; },
  ready(fn) { if (fn) fn(); return jqObj; }, find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' } }; global.Knack = window.Knack;
// The accordion engine, emulated: refresh() wraps every bare keyword-flagged view in place
// (buildStandaloneAccordion's fresh-build path). `engineOn` = false emulates a grid the engine
// never wraps.
let engineOn = true, refreshCalls = 0;
function wrapView(v) {
  const title = v.querySelector('.view-header h2.kn-title').textContent;
  const w = document.createElement('div'); w.className = 'scw-ktl-accordion scw-acc-for-' + v.id;
  w.innerHTML = '<div class="scw-ktl-accordion__header" data-view-key="' + v.id + '"><span class="scw-acc-title">' + title + '</span><span class="scw-acc-count">' + v.querySelectorAll('tbody tr[id]').length + '</span></div>' +
    '<div class="scw-ktl-accordion__body" style="display:none"></div>';
  v.parentNode.insertBefore(w, v);
  w.querySelector('.scw-ktl-accordion__body').appendChild(v);
  w.querySelector('.scw-ktl-accordion__header').addEventListener('click', () => {
    w.classList.toggle('is-expanded'); w.querySelector('.scw-ktl-accordion__body').style.display = w.classList.contains('is-expanded') ? '' : 'none';
  });
  return w;
}
window.SCW = { CONFIG: {}, ktlAccordion: { refresh() {
  refreshCalls++;
  if (!engineOn) return;
  document.querySelectorAll('.kn-view[data-scw-hsv="1"]').forEach(v => { if (!v.closest('.scw-ktl-accordion')) wrapView(v); });
} } };
global.SCW = window.SCW;
window.setInterval = function () {};
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/deploy-page-nav.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

function acc(title, count) {
  return '<div class="scw-ktl-accordion"><div class="scw-ktl-accordion__header"><span class="scw-acc-title">' + title + '</span><span class="scw-acc-count">' + count + '</span></div>' +
    '<div class="scw-ktl-accordion__body" style="display:none"><div class="kn-view"><div class="view-header"><h2 class="kn-title">' + title + '</h2></div></div></div></div>';
}
const coGrid = () => '<div class="kn-view kn-table" id="view_4080" data-scw-hsv="1"><div class="view-header"><h2 class="kn-title">Change Orders</h2></div>' +
  '<table><tbody><tr id="co1"><td>CO 1781</td></tr><tr id="co2"><td>CO 1790</td></tr></tbody></table></div>';
function buildScene(opts) {
  const sceneHtml =
    '<div id="kn-scene_1311" class="kn-scene">' +
      '<div class="kn-view" id="view_3938"><h1>Project</h1></div>' +
      acc('ACCEPTANCE', '2') + acc('System Setup Questionnaire', '1') + acc('CLOSEOUT', '1') + acc('Other Files', '4') +
      '<div class="kn-view kn-menu" id="view_4081"><a class="kn-link" href="https://x/#deploy/create-change-order">Create Change Order</a></div>' +
      '<div id="scw-ws-v2-view_4093"><div class="scw-ws-v2-toolbar"><div class="scw-ws-v2-toolbar-group scw-ws-v2-toolbar-group--cta"></div></div>' +
        '<div class="scw-ws-v2-banner"><span class="scw-ws-v2-count">7 records</span></div><div class="scw-ws-v2-scope">CAMERAS 4 · SERVICES 12</div></div>' +
      // Builder order: the Change Orders grid sits at the very bottom, after the worksheet.
      coGrid() +
    '</div>';
  const old = document.getElementById('kn-scene_1311');
  if (old) old.outerHTML = sceneHtml; else document.body.innerHTML = sceneHtml;
  document.querySelectorAll('#kn-scene_1311 .scw-ktl-accordion__header').forEach(h => h.addEventListener('click', () => {
    const w = h.parentNode; w.classList.toggle('is-expanded'); w.querySelector('.scw-ktl-accordion__body').style.display = w.classList.contains('is-expanded') ? '' : 'none';
  }));
  if (opts && opts.prewrapped) wrapView(document.getElementById('view_4080'));   // the engine got there first
}
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return this.parentNode; } });
let scrolls = 0;
window.HTMLElement.prototype.scrollIntoView = function () { scrolls++; };
const fire = () => (handlers['knack-scene-render.scene_1311.scwDeployNav'] || []).forEach(fn => fn());
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
// applyNames renames the title and appends the subtitle span inside it — match on the ORIGINAL title it stashes.
const coAccs = () => [...document.querySelectorAll('.scw-ktl-accordion')].filter(a => /^change orders?$/i.test(a.getAttribute('data-scw-orig-title') || a.querySelector('.scw-acc-title').textContent));
const alsoRows = () => [...document.querySelectorAll('.scw-deploy-also__row')].map(b => b.querySelector('.scw-deploy-also__label').textContent + '|' + ((b.querySelector('.scw-deploy-nav-count') || {}).textContent || ''));
const coRow = () => [...document.querySelectorAll('.scw-deploy-also__row')].find(b => /^change orders$/i.test(b.querySelector('.scw-deploy-also__label').textContent));
const drawer = () => document.getElementById('scw-deploy-drawer');
const drawerOpen = () => !!(drawer() && !drawer().hidden);
function closeDrawer() { if (drawerOpen()) drawer().querySelector('.scw-deploy-drawer__close').click(); }

(async () => {
  // ── 1. The grid is still bare when the nav moves it ──────────────────────────────────────
  buildScene();
  fire();
  await sleep(400);
  const strip = document.getElementById('scw-deploy-co-strip');
  const grid = document.getElementById('view_4080');
  check('the bare grid moved into the strip and was wrapped on the spot (engine refresh asked for), parked like every section',
    [!!strip && strip.contains(grid), refreshCalls > 0, !!grid.closest('.scw-ktl-accordion'), strip.contains(grid.closest('.scw-ktl-accordion')),
     grid.closest('.scw-ktl-accordion').classList.contains('scw-deploy-parked'), grid.classList.contains('scw-deploy-prewrap')],
    [true, true, true, true, true, false]);
  check('exactly one Change Orders section exists and the "Also" list carries it ONCE, by its renamed label with the row count',
    [coAccs().length, alsoRows().filter(r => /change orders/i.test(r))], [1, ['Change orders|2']]);
  check('the Create Change Order proxy mounted inside that section', !!document.querySelector('#scw-deploy-co-strip .scw-ktl-accordion #scw-deploy-co-cta'), true);
  coRow().click();
  check('clicking the row opens the drawer with the Change Orders section inside — no scroll',
    [drawerOpen(), !!drawer().querySelector('.scw-deploy-drawer__body .scw-ktl-accordion .kn-view#view_4080'), scrolls], [true, true, 0]);
  closeDrawer();
  await sleep(250);

  // ── 2. The engine wrapped the grid BEFORE the nav moved it ───────────────────────────────
  buildScene({ prewrapped: true });
  refreshCalls = 0;
  fire();
  await sleep(400);
  const strip2 = document.getElementById('scw-deploy-co-strip');
  const grid2 = document.getElementById('view_4080');
  check('the grid moved WITH its wrapper: one Change Orders section, inside the strip, no empty shell at the Builder position',
    [coAccs().length, strip2.contains(grid2.closest('.scw-ktl-accordion')), refreshCalls, alsoRows().filter(r => /change orders/i.test(r))],
    [1, true, 0, ['Change orders|2']]);
  coRow().click();
  check('…and the row opens the drawer', [drawerOpen(), !!drawer().querySelector('.scw-deploy-drawer__body #view_4080')], [true, true]);
  closeDrawer();
  await sleep(250);

  // ── 3. The engine cannot wrap the grid (no keyword): the fallback row never scrolls into nothing ──
  engineOn = false;
  buildScene();
  fire();
  await sleep(400);
  const strip3 = document.getElementById('scw-deploy-co-strip');
  const grid3 = document.getElementById('view_4080');
  check('unwrapped: the grid sits bare in the strip (pre-wrap hidden) and the fallback row stands in for the section',
    [strip3.contains(grid3), !grid3.closest('.scw-ktl-accordion'), grid3.classList.contains('scw-deploy-prewrap'), alsoRows().filter(r => /change orders/i.test(r))],
    [true, true, true, ['Change Orders|2']]);
  scrolls = 0;
  coRow().click();
  check('a click while the container has no box neither opens a drawer nor scrolls (the old jump onto the scope strip)',
    [drawerOpen(), scrolls], [false, 0]);
  // The engine comes back (its next render pass): the SAME row, clicked again, wraps on the spot and opens the section.
  engineOn = true;
  coRow().click();
  check('the row re-resolves its target at click time: the grid is wrapped now and the drawer opens on it',
    [drawerOpen(), !!drawer().querySelector('.scw-deploy-drawer__body .scw-ktl-accordion #view_4080'), coAccs().length], [true, true, 1]);
  closeDrawer();
  await sleep(250);

  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + (e && e.stack || e)); process.exit(1); });
