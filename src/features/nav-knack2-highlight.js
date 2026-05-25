/*** FEATURE: Knack 2.0 nav highlighting (view_44) ***/
/**
 * Makes the "Knack 2.0" project-nav items pop and fades the legacy ones
 * during the platform transition. Highlighted in the teal action color:
 *   Dashboard, Build SOWs, Review Bids
 * Everything else (Build Quotes, Files, Photos, …) is dimmed.
 *
 * Matches each link by its label text first, with the href slug as a
 * fallback so a rename in Knack Builder doesn't silently drop a highlight.
 * Re-applies on view/scene render and via a MutationObserver, since the
 * global nav can be rebuilt by Knack on navigation.
 */
(function () {
  'use strict';

  var NAV_VIEW    = 'view_44';
  var NS          = '.scwNav2';
  var STYLE_ID    = 'scw-nav2-highlight-css';
  var PRIMARY_CLS = 'scw-nav2-primary';
  var LEGACY_CLS  = 'scw-nav2-legacy';

  // Each primary entry matches if the link label equals `label` OR the
  // href contains `/slug/`. Slugs are the Knack page slugs in the URL hash.
  var PRIMARY = [
    { label: 'dashboard',   slug: 'new-dashboard' },
    { label: 'build sows',  slug: 'build-sow' },
    { label: 'review bids', slug: 'review-bids' }
  ];

  // Teal = #0891b2 (our action-pill / CTA color).
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      /* Across-the-board nav sizing: 16px, normal weight (primary bumps
         weight back up below). */
      '#' + NAV_VIEW + ' a.kn-link {' +
      '  font-size: 16px !important; font-weight: 400 !important;' +
      '}' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + ',' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + '.is-primary {' +
      '  background: #0891b2 !important;' +
      '  border-color: #0891b2 !important;' +
      '  color: #ffffff !important;' +
      '  font-weight: 600 !important;' +
      '  box-shadow: 0 1px 4px rgba(8,145,178,0.40) !important;' +
      '}' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + ' span { color: #ffffff !important; }' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + ':hover {' +
      '  background: #0e7490 !important; border-color: #0e7490 !important;' +
      '}' +
      /* Legacy items: clearly de-emphasized but still clickable, with a
         lighter hover so users can confirm they still work. */
      '#' + NAV_VIEW + ' a.kn-link.' + LEGACY_CLS + ' {' +
      '  opacity: 0.42 !important; filter: grayscale(0.5);' +
      '  font-weight: 400 !important; transition: opacity .15s ease;' +
      '}' +
      '#' + NAV_VIEW + ' a.kn-link.' + LEGACY_CLS + ':hover { opacity: 0.85 !important; }';

    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function norm(s) {
    return (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isPrimary(label, href) {
    var l = norm(label);
    var h = (href || '').toLowerCase();
    for (var i = 0; i < PRIMARY.length; i++) {
      var p = PRIMARY[i];
      if (l && l === p.label) return true;
      if (p.slug && h.indexOf('/' + p.slug + '/') !== -1) return true;
    }
    return false;
  }

  function apply() {
    var nav = document.getElementById(NAV_VIEW);
    if (!nav) return;
    var links = nav.querySelectorAll('a.kn-link');
    if (!links.length) return;
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var span = a.querySelector('span');
      var label = span ? span.textContent : a.textContent;
      if (!norm(label)) continue;   // skip not-yet-rendered links
      var primary = isPrimary(label, a.getAttribute('href') || '');
      a.classList.toggle(PRIMARY_CLS, primary);
      a.classList.toggle(LEGACY_CLS, !primary);
    }
  }

  // The global nav can be rebuilt by Knack on navigation (replacing the
  // anchor elements). Watch childList only — our own classList changes are
  // attribute mutations and so never re-trigger this, avoiding a loop.
  var _obsTimer = null;
  function installObserver() {
    var nav = document.getElementById(NAV_VIEW);
    if (!nav || nav.getAttribute('data-scw-nav2-obs') === '1') return;
    nav.setAttribute('data-scw-nav2-obs', '1');
    var obs = new MutationObserver(function () {
      clearTimeout(_obsTimer);
      _obsTimer = setTimeout(apply, 50);
    });
    obs.observe(nav, { childList: true, subtree: true });
  }

  function run() {
    injectStyles();
    apply();
    installObserver();
  }

  injectStyles();

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(NAV_VIEW, function () { setTimeout(run, 50); }, NS);
  }
  $(document)
    .off('knack-scene-render.any' + NS)
    .on('knack-scene-render.any' + NS, function () { setTimeout(run, 100); });

  // Initial attempt in case the nav is already in the DOM at load.
  setTimeout(run, 200);
})();
