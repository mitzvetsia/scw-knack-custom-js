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
  var KEPT_CLS    = 'scw-nav2-kept';   // top-level non-primary kept link (not dimmed)

  // Top-level links that stay visible in the nav, in order. Everything else
  // collapses under a "K1 Pages" dropdown. Matched by normalized label.
  var KEEP = ['dashboard', 'k2: build sows', 'k2: reconcile bids', 'k2: manage deployment'];
  // Set while we move anchors so our own DOM writes don't re-trigger the
  // nav MutationObserver (which would loop).
  var _busy = false;

  // Strict allow-list — only these two menu items should get the teal
  // K2 treatment for now. Match by exact label only (slug fallback
  // intentionally disabled — a slug match was lighting up legacy
  // "Build SOWs" links on some users' menus).
  var PRIMARY = [
    { label: 'k2: build sows',     slug: null },
    { label: 'k2: reconcile bids', slug: null }
  ];

  // Teal palette:
  //   bright (#0891b2) = active page indicator only
  //   pale  (#cffafe / #0e7490) = K2 group identity (non-active) +
  //                                active legacy item indicator
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      /* Across-the-board nav sizing: 16px, normal weight (primary bumps
         weight back up below). */
      '#' + NAV_VIEW + ' a.kn-link {' +
      '  font-size: 16px !important; font-weight: 400 !important;' +
      '}' +
      /* K2 primary items — PALE teal by default. The bright teal only
         lights up the truly-active page so the user can tell where
         they are. */
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + ' {' +
      '  background: #cffafe !important;' +
      '  border-color: #a5f3fc !important;' +
      '  color: #0e7490 !important;' +
      '  font-weight: 600 !important;' +
      '}' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + ' span { color: #0e7490 !important; }' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + ':hover {' +
      '  background: #a5f3fc !important; border-color: #67e8f9 !important;' +
      '}' +
      /* Active K2 item — BRIGHT teal. Covers both Knack's anchor-level
         (.is-active / .is-primary) and the parent-li-level (li.is-active
         > a) variants since the active class lands in different places
         depending on which menu chrome rendered the link. */
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + '.is-active,' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + '.is-primary,' +
      '#' + NAV_VIEW + ' li.is-active > a.kn-link.' + PRIMARY_CLS + ' {' +
      '  background: #0891b2 !important;' +
      '  border-color: #0891b2 !important;' +
      '  color: #ffffff !important;' +
      '  box-shadow: 0 1px 4px rgba(8,145,178,0.40) !important;' +
      '}' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + '.is-active span,' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + '.is-primary span,' +
      '#' + NAV_VIEW + ' li.is-active > a.kn-link.' + PRIMARY_CLS + ' span {' +
      '  color: #ffffff !important;' +
      '}' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + '.is-active:hover,' +
      '#' + NAV_VIEW + ' a.kn-link.' + PRIMARY_CLS + '.is-primary:hover,' +
      '#' + NAV_VIEW + ' li.is-active > a.kn-link.' + PRIMARY_CLS + ':hover {' +
      '  background: #0e7490 !important; border-color: #0e7490 !important;' +
      '}' +
      /* Legacy items: clearly de-emphasized but still clickable, with a
         lighter hover so users can confirm they still work. */
      '#' + NAV_VIEW + ' a.kn-link.' + LEGACY_CLS + ' {' +
      '  opacity: 0.42 !important; filter: grayscale(0.5);' +
      '  font-weight: 400 !important; transition: opacity .15s ease;' +
      '}' +
      '#' + NAV_VIEW + ' a.kn-link.' + LEGACY_CLS + ':hover { opacity: 0.85 !important; }' +
      /* Active legacy item — pale teal so the user can still tell which
         legacy page they're on without competing with the bright K2
         active state. */
      '#' + NAV_VIEW + ' a.kn-link.' + LEGACY_CLS + '.is-active,' +
      '#' + NAV_VIEW + ' a.kn-link.' + LEGACY_CLS + '.is-primary,' +
      '#' + NAV_VIEW + ' li.is-active > a.kn-link.' + LEGACY_CLS + ' {' +
      '  opacity: 1 !important; filter: none !important;' +
      '  background: #ecfeff !important;' +
      '  border-color: #a5f3fc !important;' +
      '  color: #0e7490 !important;' +
      '}' +
      /* Kept top-level non-K2 links (Dashboard, Manage Deployment) — clean and
         neutral, NOT dimmed like the now-hidden legacy pages. */
      '#' + NAV_VIEW + ' a.kn-link.' + KEPT_CLS + ' {' +
      '  opacity: 1 !important; filter: none !important;' +
      '  font-weight: 500 !important; color: #334155 !important;' +
      '}' +
      '#' + NAV_VIEW + ' a.kn-link.' + KEPT_CLS + ' span { color: #334155 !important; }' +
      '#' + NAV_VIEW + ' a.kn-link.' + KEPT_CLS + ':hover { background: #f1f5f9 !important; }' +
      '#' + NAV_VIEW + ' a.kn-link.' + KEPT_CLS + '.is-active,' +
      '#' + NAV_VIEW + ' a.kn-link.' + KEPT_CLS + '.is-primary,' +
      '#' + NAV_VIEW + ' li.is-active > a.kn-link.' + KEPT_CLS + ' {' +
      '  background: #ecfeff !important; border-color: #a5f3fc !important; color: #0e7490 !important;' +
      '}' +
      /* ── "K1 Pages" collapse dropdown ─────────────────────────────── */
      '#' + NAV_VIEW + ' .scw-k1-wrap {' +
      '  position: relative; display: inline-flex; align-items: center;' +
      '  vertical-align: middle; margin-left: 12px;' +
      '}' +
      '#' + NAV_VIEW + ' .scw-k1-toggle {' +
      '  display: inline-flex; align-items: center; gap: 6px;' +
      '  font: 500 16px system-ui, -apple-system, sans-serif !important;' +
      '  padding: 7px 12px; border: 1px solid #e2e8f0; border-radius: 6px;' +
      '  background: #fff; color: #64748b; cursor: pointer; white-space: nowrap;' +
      '  transition: background .12s ease, border-color .12s ease, color .12s ease;' +
      '}' +
      '#' + NAV_VIEW + ' .scw-k1-toggle:hover { background: #f8fafc; border-color: #cbd5e1; color: #334155; }' +
      '#' + NAV_VIEW + ' .scw-k1-wrap.is-open .scw-k1-toggle { background: #f1f5f9; border-color: #cbd5e1; color: #334155; }' +
      '#' + NAV_VIEW + ' .scw-k1-caret { flex: 0 0 auto; color: #94a3b8; transition: transform .15s ease; }' +
      '#' + NAV_VIEW + ' .scw-k1-wrap.is-open .scw-k1-caret { transform: rotate(180deg); }' +
      '#' + NAV_VIEW + ' .scw-k1-panel {' +
      '  position: absolute; top: calc(100% + 6px); left: 0; z-index: 1000;' +
      '  min-width: 210px; display: none; flex-direction: column; gap: 2px;' +
      '  padding: 6px; background: #fff; border: 1px solid #e5e7eb;' +
      '  border-radius: 8px; box-shadow: 0 10px 28px rgba(15,23,42,.18);' +
      '}' +
      '#' + NAV_VIEW + ' .scw-k1-wrap.is-open .scw-k1-panel { display: flex; }' +
      /* Links inside the dropdown read as a normal stacked menu — undo the
         legacy dimming + segmented-button chrome. */
      '#' + NAV_VIEW + ' .scw-k1-panel a.kn-link {' +
      '  display: block !important; width: 100% !important; box-sizing: border-box;' +
      '  margin: 0 !important; text-align: left !important;' +
      '  opacity: 1 !important; filter: none !important;' +
      '  border: 0 !important; border-radius: 6px !important;' +
      '  padding: 8px 12px !important; font-weight: 500 !important;' +
      '  background: transparent !important; color: #1f2937 !important;' +
      '}' +
      '#' + NAV_VIEW + ' .scw-k1-panel a.kn-link span { color: #1f2937 !important; }' +
      '#' + NAV_VIEW + ' .scw-k1-panel a.kn-link:hover { background: #f1f5f9 !important; }' +
      '#' + NAV_VIEW + ' .scw-k1-panel a.kn-link.is-active,' +
      '#' + NAV_VIEW + ' .scw-k1-panel a.kn-link.is-primary {' +
      '  background: #ecfeff !important; color: #0e7490 !important;' +
      '}';

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
      var kept = KEEP.indexOf(norm(label)) !== -1;
      a.classList.toggle(PRIMARY_CLS, primary);
      a.classList.toggle(KEPT_CLS, !primary && kept);
      a.classList.toggle(LEGACY_CLS, !primary && !kept);
    }
  }

  function labelOf(a) {
    var span = a.querySelector('span');
    return norm(span ? span.textContent : a.textContent);
  }

  // Collapse every non-KEEP top-level link into a "K1 Pages" dropdown. The
  // KEEP links stay in place, in order; the rest move into a panel behind a
  // toggle button inserted right after the last kept link. Idempotent — skips
  // when already collapsed, and rebuilds after Knack regenerates the nav.
  // Currently-mounted K1 wrap (outside-click closer reads it; assigned on
  // every collapse() pass because nav rebuilds re-create the element).
  var _k1Wrap = null;

  function collapse() {
    var nav = document.getElementById(NAV_VIEW);
    if (!nav) return;
    var container = nav.querySelector('.control.has-addons') ||
                    nav.querySelector('.kn-menu .control') ||
                    nav.querySelector('.control');
    if (!container) return;

    var existingWrap = container.querySelector('.scw-k1-wrap');
    var direct = [];
    for (var i = 0; i < container.children.length; i++) {
      var c = container.children[i];
      if (c.tagName === 'A' && c.classList.contains('kn-link')) direct.push(c);
    }
    var keptDirect      = direct.filter(function (a) { return KEEP.indexOf(labelOf(a)) !== -1; });
    var collapsedDirect = direct.filter(function (a) { return KEEP.indexOf(labelOf(a)) === -1; });

    // Already collapsed (wrap present, nothing loose) or nothing to collapse.
    if (existingWrap && !collapsedDirect.length) { _k1Wrap = existingWrap; return; }
    if (!existingWrap && !collapsedDirect.length) return;

    _busy = true;
    try {
      var wrap = existingWrap;
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'scw-k1-wrap';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kn-button scw-k1-toggle';
        btn.innerHTML = '<span>K1 Pages</span>' +
          '<svg class="scw-k1-caret" aria-hidden="true" viewBox="0 0 24 24" width="13" height="13" ' +
          'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="6 9 12 15 18 9"/></svg>';
        var panel = document.createElement('div');
        panel.className = 'scw-k1-panel';
        wrap.appendChild(btn);
        wrap.appendChild(panel);
        btn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          wrap.classList.toggle('is-open');
        });
        var ref = keptDirect.length ? keptDirect[keptDirect.length - 1] : null;
        if (ref && ref.nextSibling) container.insertBefore(wrap, ref.nextSibling);
        else container.appendChild(wrap);
      }
      var panelEl = wrap.querySelector('.scw-k1-panel');
      collapsedDirect.forEach(function (a) { panelEl.appendChild(a); });
      // Cache for the outside-click closer — re-assigned every pass since
      // Knack nav rebuilds re-create the wrap.
      _k1Wrap = wrap;
    } finally {
      setTimeout(function () { _busy = false; }, 0);
    }
  }

  // Close the dropdown on any outside click (bound once). Uses the wrap
  // cached by collapse() instead of a per-click document.querySelector —
  // this listener fires on EVERY click on every page (perf traces
  // 2026-07-30). collapse() re-assigns the ref on every pass, so nav
  // rebuilds that re-create the wrap keep it fresh; a stale ref no-ops.
  function bindOutsideClose() {
    if (document.documentElement.hasAttribute('data-scw-k1-close')) return;
    document.documentElement.setAttribute('data-scw-k1-close', '1');
    document.addEventListener('click', function (e) {
      if (_k1Wrap && _k1Wrap.classList.contains('is-open') &&
          !_k1Wrap.contains(e.target)) {
        _k1Wrap.classList.remove('is-open');
      }
    });
  }

  // The global nav can be rebuilt by Knack on navigation (replacing the
  // anchor elements). Watch childList only — our own classList changes are
  // attribute mutations and so never re-trigger this. The _busy guard keeps
  // collapse()'s anchor moves from looping the observer.
  var _obsTimer = null;
  function installObserver() {
    var nav = document.getElementById(NAV_VIEW);
    if (!nav || nav.getAttribute('data-scw-nav2-obs') === '1') return;
    nav.setAttribute('data-scw-nav2-obs', '1');
    var obs = new MutationObserver(function () {
      if (_busy) return;
      clearTimeout(_obsTimer);
      _obsTimer = setTimeout(function () { apply(); collapse(); }, 50);
    });
    obs.observe(nav, { childList: true, subtree: true });
  }

  function run() {
    injectStyles();
    apply();
    collapse();
    bindOutsideClose();
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
