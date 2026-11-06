// jsdom smoke test: the Installation tile's "N waiting" (photos waiting on SCW QA) names the line
// items it counts and, on click, opens the group holding them and highlights their cards
// (2026-11-06 — "we're still showing 1 item to QA but there is no item to QA": the photo sat on a
// card inside a collapsed group, counted but invisible).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scwinstallation.knack.com/installationservices#deploy/x' });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.Node = window.Node;
const handlers = {};
function jq(sel) { return jqObj; }
const jqObj = {
  on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return jqObj; },
  off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { if (fn) fn(); return jqObj; },
  find() { return jqObj; }, closest() { return jqObj; }, data() { return null; }, attr() { return null; }, length: 0
};
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {}, router: { current_scene_key: 'scene_1311' } }; global.Knack = window.Knack;
const revealed = [];
window.SCW = { CONFIG: {},
  worksheetV2: { summary: { revealCard(card) {
    revealed.push(card.getAttribute('data-scw-ws-v2-record'));
    let opened = false;
    const l1 = card.closest('.scw-ws-v2-l1');
    if (l1 && !l1.classList.contains('scw-ws-v2-l1--open')) { l1.classList.add('scw-ws-v2-l1--open'); opened = true; }
    const sec = card.closest('.scw-ws-v2-removedsec');
    if (sec && !sec.classList.contains('scw-ws-v2-removedsec--open')) { sec.classList.add('scw-ws-v2-removedsec--open'); opened = true; }
    return opened;
  } } } };
global.SCW = window.SCW;
window.setInterval = function () {};
new Function('window', 'document', '$', 'Knack', 'SCW',
  fs.readFileSync(path.join(__dirname, '../../src/features/deploy-page-nav.js'), 'utf8'))(window, document, jq, window.Knack, window.SCW);

function acc(title, count) {
  return '<div class="scw-ktl-accordion"><div class="scw-ktl-accordion__header"><span class="scw-acc-title">' + title + '</span><span class="scw-acc-count">' + count + '</span></div>' +
    '<div class="scw-ktl-accordion__body"><div class="kn-view"><div class="view-header"><h2 class="kn-title">' + title + '</h2></div></div></div></div>';
}
function card(id, label, chit) {
  return '<div class="scw-ws-v2-card" data-scw-ws-v2-record="' + id + '"><span class="scw-ws-v2-cell--label">' + label + '</span>' +
    '<div class="scw-ws-v2-photo-card scw-ws-v2-photo-card--required">' + (chit ? '<span class="scw-ws-v2-photo-qa-chit is-' + chit + '"></span>' : '') + '</div></div>';
}
document.body.innerHTML =
  '<div id="kn-scene_1311" class="kn-scene">' +
    acc('ACCEPTANCE', '1') + acc('System Setup Questionnaire', '1') + acc('CLOSEOUT', '1') +
    '<div id="scw-ws-v2-view_4093">' +
      '<div class="scw-ws-v2-banner"><span class="scw-ws-v2-count">12 records</span></div>' +
      // an OPEN group with a reviewed photo
      '<div class="scw-ws-v2-l1 scw-ws-v2-l1--open"><div data-scw-ws-v2-l1-toggle="1"><span class="scw-ws-v2-l1-label">HEADEND: 019 - Server Room<span class="scw-ws-v2-l1-sub">x</span></span></div>' +
        card('r1', 'NVR-001', 'done') +
      '</div>' +
      // a CLOSED group whose "Removed by change order" section holds the waiting photo
      '<div class="scw-ws-v2-l1"><div data-scw-ws-v2-l1-toggle="1"><span class="scw-ws-v2-l1-label">IDF 2 - Lobby</span></div>' +
        card('r2', 'AC-07', null) +
        '<div class="scw-ws-v2-removedsec"><div class="scw-ws-v2-removedsec-head">Removed by change order</div>' + card('r3', 'AC-03', 'pending') + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
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
  const tile = nav && [...nav.querySelectorAll('.scw-deploy-tile')].find(t => /Install/i.test(t.querySelector('.scw-deploy-tile__eyebrow').textContent));
  check('the Installation tile renders', !!tile, true);
  const scwBar = [...tile.querySelectorAll('.scw-deploy-bars > span:not(.scw-deploy-bar)')].map(s => s.textContent);
  check('the SCW bar counts the hidden photo and says so', scwBar[1], '1 of 3 reviewed · 1 waiting (hidden)');
  const btn = tile.querySelector('[data-scw-tile-qa-waiting]');
  check('the waiting count is a button whose title names the item, its group and that it is collapsed',
    btn && btn.getAttribute('title'),
    'Waiting on SCW QA: AC-03 (Removed by change order · IDF 2 - Lobby) — 1 of these sits in a collapsed group. Click to show it.');
  const ws = document.getElementById('scw-ws-v2-view_4093');
  btn.click();
  check('the click reveals the card (group + removed section opened) and does not scroll to the worksheet top',
    [revealed, ws.querySelector('.scw-ws-v2-l1:not(.scw-ws-v2-l1--open)') === null,
     ws.querySelector('.scw-ws-v2-removedsec').classList.contains('scw-ws-v2-removedsec--open'), ws.getAttribute('data-scrolled')],
    [['r3'], true, true, null]);
  const hl = [...ws.querySelectorAll('.scw-ws-v2-card--scope-hl')].map(c => c.getAttribute('data-scw-ws-v2-record'));
  check('only the waiting card is highlighted', hl, ['r3']);
  setTimeout(() => {
    check('…and scrolled into view once the group is open', ws.querySelector('[data-scw-ws-v2-record="r3"]').getAttribute('data-scrolled'), '1');
    // The next nav pass (sig now includes the open state) drops the "(hidden)" word.
    (handlers['knack-scene-render.scene_1311.scwDeployNav'] || []).forEach(fn => fn());
    setTimeout(() => {
      const tile2 = [...document.querySelectorAll('.scw-deploy-tile')].find(t => /Install/i.test(t.querySelector('.scw-deploy-tile__eyebrow').textContent));
      const bar2 = [...tile2.querySelectorAll('.scw-deploy-bars > span:not(.scw-deploy-bar)')].map(s => s.textContent);
      check('once the group is open the count reads plain "1 waiting" with the item still named',
        [bar2[1], /AC-03/.test(tile2.querySelector('[data-scw-tile-qa-waiting]').getAttribute('title')), /collapsed/.test(tile2.querySelector('[data-scw-tile-qa-waiting]').getAttribute('title'))],
        ['1 of 3 reviewed · 1 waiting', true, false]);
      console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
      process.exit(fails ? 1 : 0);
    }, 400);
  }, 150);
}, 400);
