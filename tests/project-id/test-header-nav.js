// jsdom smoke test: project-header-nav.js folds Knack's project menu (view_44) into the Project #
// hero as a tab strip — real anchors moved (routing intact), "K2:" prefixes stripped, the three
// workflow stages numbered in order, Dashboard set apart, legacy pages behind "More", the current
// page marked from the hash — adopts the project header card's top block into the hero (title
// without the deal-id suffix), hides the menu view, pins a bar with cloned tabs, and survives a
// Knack menu rebuild without duplicating anchors.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PROJECT = '6a134cd87d195df08d150ef8';
const BASE = 'https://scwinstallation.knack.com/installationservices#team-calendar/project-dashboard/' + PROJECT + '/';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: BASE + 'deploy/' + PROJECT });
const { window } = dom; const { document } = window;
global.window = window; global.document = document; global.navigator = window.navigator;
global.MutationObserver = window.MutationObserver;
const sceneHandlers = {}, viewHandlers = {};
function jq() { return jqObj; }
const jqObj = { on() { return jqObj; }, off() { return jqObj; }, trigger() { return jqObj; }, ready(fn) { fn && fn(); return jqObj; }, find() { return jqObj; }, length: 0 };
jq.fn = {}; window.$ = jq; window.jQuery = jq; global.$ = jq;
window.Knack = { views: {} }; global.Knack = window.Knack;
window.SCW = { CONFIG: {}, debug() {}, onViewRender(v, fn) { viewHandlers[v] = fn; }, onSceneRender(id, fn) { sceneHandlers[id] = fn; } };
global.SCW = window.SCW;
for (const f of ['project-id-badge.js', 'project-header-nav.js']) {
  new Function('window', 'document', '$', 'Knack', 'SCW',
    fs.readFileSync(path.join(__dirname, '../../src/features/' + f), 'utf8'))(window, document, jq, window.Knack, window.SCW);
}

let fails = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
}
const link = (slug, label, primary) =>
  '<a class="kn-link kn-link-page kn-button' + (primary ? ' is-primary' : '') + '" href="' + BASE + slug + '/' + PROJECT + '"><span>' + label + '</span></a>';
function menuHtml() {
  return '<div class="control has-addons">' +
    link('new-dashboard', 'Dashboard') + link('build-sow', 'K2: Build SOWs') + link('review-bids', 'K2: Reconcile Bids') +
    link('deploy', 'K2: Manage Deployment', true) + link('build-quote', 'Build Quotes') + link('documents', 'Files') +
    link('photos', 'Photos') + link('project-management2', 'Project Management') + link('review-surveys', 'Review Surveys') + '</div>';
}
document.body.innerHTML = '<div id="kn-scene_1311">' +
  '<div class="kn-menu kn-view" id="view_44">' + menuHtml() + '</div>' +
  '<div class="kn-details kn-view" id="view_3938"><div class="scw-bsh-card">' +
    '<div class="scw-bsh-top"><div class="scw-bsh-top-main"><div class="scw-bsh-eyebrow scw-bsh-eyebrow--project">Project</div>' +
    '<div class="scw-bsh-title">Surveillance System Installation - 60524852230</div></div>' +
    '<div class="scw-bsh-top-side"><div class="scw-bsh-actions"><a class="scw-bsh-action" href="#edit">Edit</a></div></div></div>' +
    '<div class="scw-bsh-section scw-bsh-playbook">Playbook</div>' +
  '</div><div class="kn-detail field_1622"><div class="kn-detail-body">60524852230</div></div></div>' +
  '</div>';

// Scene render → hero; the badge then asks the nav to refresh (debounced).
sceneHandlers.scene_1311();
viewHandlers.view_44();

setTimeout(() => {
  const hero = document.getElementById('scw-pid-hero');
  const strip = document.getElementById('scw-phn-tabs');
  const stripAnchors = () => [...strip.querySelectorAll('.scw-phn-home a, .scw-phn-stages a')];
  const labels = as => as.map(a => a.querySelector('span:not(.scw-phn-step):not(.scw-phn-home-ic)').textContent);

  check('the strip lives in the hero footer; the hero is the card', [!!strip, strip && strip.closest('#scw-pid-hero .scw-pid-foot') !== null, hero.classList.contains('scw-pid--nav')], [true, true, true]);
  check('Dashboard, then the three stages in workflow order, prefixes gone', labels(stripAnchors()), ['Dashboard', 'Build SOWs', 'Reconcile Bids', 'Manage Deployment']);
  check('stages carry step numbers 1-3; Dashboard carries the home icon instead',
    [[...strip.querySelectorAll('.scw-phn-stages .scw-phn-step')].map(s => s.textContent), !!strip.querySelector('.scw-phn-home .scw-phn-home-ic')], [['1', '2', '3'], true]);
  check('the moved anchors are the REAL Knack anchors (href intact)', stripAnchors()[3].getAttribute('href'), BASE + 'deploy/' + PROJECT);
  check('current page = Manage Deployment (from the hash), aria-current set',
    [...strip.querySelectorAll('a.is-current')].map(a => [labels([a])[0], a.getAttribute('aria-current')]), [['Manage Deployment', 'page']]);
  const panelLabels = [...strip.querySelectorAll('.scw-phn-panel a')].map(a => a.textContent.trim());
  check('legacy pages behind More, in Builder order', panelLabels, ['Build Quotes', 'Files', 'Photos', 'Project Management', 'Review Surveys']);
  check('the menu view is hidden, not removed', [document.getElementById('view_44').classList.contains('scw-phn-source'), !!document.getElementById('view_44')], [true, true]);
  const adopted = hero.querySelector('.scw-pid-adopt .scw-bsh-top');
  check('the header card top block is adopted into the hero; the deal-id suffix comes off the title',
    [!!adopted, adopted && adopted.querySelector('.scw-bsh-title').textContent, hero.classList.contains('scw-pid--adopted')],
    [true, 'Surveillance System Installation', true]);
  check('the rest of the header card (playbook) stays put, card not folded',
    [!!document.querySelector('.scw-bsh-card .scw-bsh-playbook'), document.querySelector('.scw-bsh-card').classList.contains('scw-bsh-card--hollow')], [true, false]);
  check('the hero still shows the number from field_1622', hero.getAttribute('data-scw-pid'), '60524852230');
  const bar = document.getElementById('scw-phn-bar');
  check('the pinned bar carries the number, the title and cloned tabs (no legacy pages); the badge pill is off',
    [!!bar, bar && bar.querySelector('.scw-phn-bar-num').textContent, bar && bar.querySelector('.scw-phn-bar-title').textContent,
     bar && [...bar.querySelectorAll('a.scw-phn-clone')].map(a => a.textContent.replace(/^\d/, '').trim()), SCW.projectId.CONFIG.stickyPill],
    [true, '60524852230', 'Surveillance System Installation', ['Dashboard', 'Build SOWs', 'Reconcile Bids', 'Manage Deployment'], false]);

  // "More" toggles its panel.
  strip.querySelector('.scw-phn-more-btn').click();
  check('More opens its panel', strip.querySelector('.scw-phn-more').classList.contains('is-open'), true);
  document.body.click();
  check('an outside click closes it', strip.querySelector('.scw-phn-more').classList.contains('is-open'), false);

  // Knack rebuilds the menu (fresh anchors inside view_44) → re-adopt, no duplicates.
  document.getElementById('view_44').innerHTML = menuHtml();
  SCW.projectHeaderNav.refresh();
  setTimeout(() => {
    check('after a Knack menu rebuild the strip holds exactly the fresh anchors — no duplicates',
      [strip.querySelectorAll('a.kn-link').length, document.querySelectorAll('#view_44 a.kn-link').length], [9, 0]);
    // Second decorate pass must not stack step badges.
    check('step badges are not duplicated on re-adopt', strip.querySelectorAll('.scw-phn-stages a')[0].querySelectorAll('.scw-phn-step').length, 1);
    console.log(fails ? 'RESULT: FAIL (' + fails + ')' : 'RESULT: PASS');
    process.exit(fails ? 1 : 0);
  }, 150);
}, 400);
