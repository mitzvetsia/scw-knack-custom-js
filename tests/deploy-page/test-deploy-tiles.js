// jsdom smoke test: deploy-page-nav.js builds the four stage tiles + the
// "Also on this project" chip row from a scene that looks like scene_1311
// after the other modules have rendered (accordions with rollups, the v2
// worksheet mount with banner chips and photo slots).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.Node = window.Node;
// jQuery shim that records document handlers so the test can fire scene render.
const handlers = {};
function jq(sel) { return jqObj; }
const jqObj = {
  on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; },
  off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; },
  find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; }, length: 0
};
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' } }; global.Knack = window.Knack;
window.SCW = { CONFIG: {} }; global.SCW = window.SCW;
window.setInterval = function () {}; // no heartbeat in the test
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/deploy-page-nav.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

function acc(title, count, rollHtml, attention) {
  return '<div class="scw-ktl-accordion' + '"' + (attention ? ' data-scw-attention=""' : '') + '>' +
    '<div class="scw-ktl-accordion__header"><span class="scw-acc-title">' + title + '</span>' +
    (rollHtml || '') + '<span class="scw-acc-count">' + count + '</span></div>' +
    '<div class="scw-ktl-accordion__body"><div class="kn-view"><div class="view-header"><h2 class="kn-title">' + title + '</h2></div></div></div></div>';
}
function photo(required, missing, chit) {
  return '<div class="scw-ws-v2-photo-card' + (required ? ' scw-ws-v2-photo-card--required' : '') + (missing ? ' scw-ws-v2-photo-card--missing' : '') + '">' +
    (chit ? '<span class="scw-ws-v2-photo-qa-chit is-' + chit + '"></span>' : '') + '</div>';
}
document.body.innerHTML =
  '<div id="kn-scene_1311" class="kn-scene">' +
    '<div class="kn-view" id="view_3938"><h1>Project</h1></div>' +
    acc('ACCEPTANCE', '2', '<span class="scw-acpt-rollup scw-acpt-rollup--ok">all signed</span>', false) +
    acc('System Setup Questionnaire', '1', '', false) +
    acc('CLOSEOUT', '1', '', false) +
    '<div class="scw-ktl-accordion"><div class="scw-ktl-accordion__header"><span class="scw-acc-title">Other Files</span><span class="scw-acc-count">4</span></div><div class="scw-ktl-accordion__body"></div></div>' +
    '<div id="scw-ws-v2-view_4093">' +
      '<div class="scw-ws-v2-banner"><span class="scw-ws-v2-count">172 records</span>' +
        '<span class="scw-ws-v2-warn-chip" data-scw-ws-v2-warn-chip="photos"><span class="scw-ws-v2-warn-chip-n">35</span></span>' +
        '<span class="scw-ws-v2-warn-chip" data-scw-ws-v2-warn-chip="disconnected"><span class="scw-ws-v2-warn-chip-n">11</span></span></div>' +
      photo(true, true) + photo(true, true) + photo(true, false, 'pending') + photo(true, false, 'done') + photo(false, false) +
    '</div>' +
  '</div>';
// Closeout docs + questionnaire status come from applyRollups (needs a Knack model for field_1772).
const closeout = [...document.querySelectorAll('.scw-ktl-accordion')][2];
closeout.querySelector('.scw-ktl-accordion__body').innerHTML =
  '<div class="scw-cd-doc is-no-file"></div><div class="scw-cd-doc is-qa-pending"></div><div class="scw-cd-doc"></div>';
window.Knack.views.view_4015 = { model: { data: { models: [{ attributes: { field_1772: 'Pending Tech Support Signoff' } }] } } };
// offsetParent is null in jsdom; the module skips hidden accordions by it.
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return this.parentNode; } });
window.HTMLElement.prototype.scrollIntoView = function () { this.setAttribute('data-scrolled', '1'); };

(handlers['knack-scene-render.scene_1311.scwDeployNav'] || []).forEach(fn => fn());
setTimeout(() => {
  let fails = 0;
  function check(label, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
  }
  const nav = document.getElementById('scw-deploy-nav');
  const tiles = nav ? [...nav.querySelectorAll('.scw-deploy-tile')] : [];
  check('four stage tiles render', tiles.length, 4);
  check('tile order follows the lifecycle', tiles.map(t => t.querySelector('.scw-deploy-tile__eyebrow').textContent),
    ['1 · Paperwork & billing', '2 · Project setup', '3 · Installation', '4 · Closeout']);
  check('paperwork reads the acceptance tally', [tiles[0].querySelector('.scw-deploy-tile__state').textContent, tiles[0].querySelector('.scw-deploy-tile__head').textContent, tiles[0].querySelector('.scw-deploy-tile__fact').textContent],
    ['Done', '2 agreements', 'all signed']);
  check('setup reads the questionnaire status rollup', [tiles[1].querySelector('.scw-deploy-tile__state').textContent, tiles[1].querySelector('.scw-deploy-tile__fact').textContent],
    ['Waiting', 'Pending Tech Support Signoff · 2 of 3 docs generated']);
  check('installation is current, counts items + required photos', [tiles[2].classList.contains('scw-deploy-tile--current'), tiles[2].querySelector('.scw-deploy-tile__head').textContent],
    [true, '172 items · 4 required photos']);
  check('two bars: Sub in/missing, SCW reviewed/waiting', [...tiles[2].querySelectorAll('.scw-deploy-bars > span:not(.scw-deploy-bar)')].map(s => s.textContent),
    ['2 of 4 in · 2 missing', '1 of 2 reviewed · 1 waiting']);
  check('installation facts from the banner chips', tiles[2].querySelector('.scw-deploy-tile__fact').textContent, '35 items missing photos · 11 disconnected');
  check('closeout counts docs and names the gap', [tiles[3].querySelector('.scw-deploy-tile__state').textContent, tiles[3].querySelector('.scw-deploy-tile__head').textContent],
    ['1 missing', '2 of 3 deliverables in']);
  const also = nav ? [...nav.querySelectorAll('.scw-deploy-also__row')].map(b => b.querySelector('.scw-deploy-also__label').textContent + b.querySelector('.scw-deploy-nav-count').textContent) : [];
  check('leftover sections become the "also" rows', also, ['Files4']);
  tiles[3].click();
  const drawer = document.getElementById('scw-deploy-drawer');
  check('clicking a stage tile opens its section in the drawer, expanded', [!!drawer && !drawer.hidden, drawer && drawer.contains(closeout), closeout.classList.contains('is-expanded')], [true, true, true]);
  tiles[2].click();
  check('the Installation tile scrolls to the worksheet instead', document.getElementById('scw-ws-v2-view_4093').getAttribute('data-scrolled'), '1');
  console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
  process.exit(fails ? 1 : 0);
}, 400);
