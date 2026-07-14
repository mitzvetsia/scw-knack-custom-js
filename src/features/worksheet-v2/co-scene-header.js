/*** CHANGE ORDER SCENE — guidance header + collapsed source strips ********
 *
 * The CO drafting scene (scene_1362) hosts three ways to build the change
 * order. This module makes them read top-down in workflow order:
 *
 *   [ Draft this change order            (+ Add new item) ]   ← action bar
 *   [ ▸ Previously Quoted Items — available to add    · 85 ]  ← green strip
 *   [ ▸ Install Line Items — available to remove      · 12 ]  ← rose strip
 *   [ Change Order Line Items (the CO worksheet) …         ]
 *
 * - "+ Add new item" opens the custom add modal (co-add-item-form.js).
 * - The two source panels are RELOCATED from deep in the page to directly
 *   under the action bar and collapsed to their banner (title + warning
 *   chips + record count stay visible). The banner is the toggle; expanding
 *   focuses the panel's search box so the user can type to filter at once.
 * - Banner toggling is DELEGATED (document-level) and the decoration pass is
 *   idempotent — panels/banners can be rebuilt by their own render pipeline
 *   without duplicating chevrons or losing the click handler (both bugs
 *   observed with per-element binding).
 * - A per-session open-intent map stops the delayed init timers / panel
 *   remounts from re-collapsing a panel the user opened.
 ***************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var CO_VIEW     = 'view_4079';
  var ADOPT_VIEW  = 'view_4088';
  var REMOVE_VIEW = 'view_4086';
  var BAR_ID      = 'scw-co-actionbar';
  var STYLE_ID    = 'scw-co-actionbar-css';
  var EVENT_NS    = '.scwCoActionBar';

  var PLUS_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/></svg>';
  var CHEV_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="9 6 15 12 9 18"/></svg>';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + BAR_ID + '{display:flex;align-items:center;flex-wrap:wrap;gap:10px;',
      'margin:0 0 8px 0;padding:12px 16px;background:#f8fafc;',
      'border:1px solid #e2e8f0;border-radius:10px;}',
      '#' + BAR_ID + ' .scw-co-ab-copy{flex:1 1 260px;min-width:220px;}',
      '#' + BAR_ID + ' .scw-co-ab-title{font:700 13px/1.3 system-ui,-apple-system,sans-serif;color:#0f4c75;}',
      '#' + BAR_ID + ' .scw-co-ab-sub{font:400 12px/1.4 system-ui,sans-serif;color:#64748b;margin-top:2px;}',
      '#' + BAR_ID + ' button{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;',
      'border-radius:7px;font:600 12.5px/1 system-ui,-apple-system,sans-serif;cursor:pointer;',
      'transition:background .12s;color:#fff;background:#0f4c75;border:1px solid #0a3a63;}',
      '#' + BAR_ID + ' button:hover{background:#0a3a63;}',
      // Source strips: stacked tight under the action bar. Kill the panels'
      // own top margins so the bar + two strips + worksheet read as one block.
      '.scw-co-collapsible{margin:0 0 8px 0 !important;}',
      '.scw-co-collapsible > .scw-ws-v2-banner{cursor:pointer;user-select:none;}',
      '.scw-co-collapsed > *:not(.scw-ws-v2-banner){display:none !important;}',
      '.scw-co-chevron{display:inline-flex;align-items:center;margin-right:8px;',
      'transition:transform .15s ease;color:#94a3b8;flex:0 0 auto;}',
      '.scw-co-collapsible:not(.scw-co-collapsed) .scw-co-chevron{transform:rotate(90deg);}',
      // Signposts: tinted banner + colored left bar. The panel titles already
      // say "available to add / to remove" — no extra tag chip needed.
      '.scw-co-src--add > .scw-ws-v2-banner{',
      'background:#f0fdf4 !important;box-shadow:inset 4px 0 0 #16a34a;}',
      '.scw-co-src--remove > .scw-ws-v2-banner{',
      'background:#fff1f2 !important;box-shadow:inset 4px 0 0 #e11d48;}'
    ].join('');
    document.head.appendChild(s);
  }

  // Per-session open/closed intent. Once the user opens a panel, delayed
  // decoration passes and panel remounts must NOT re-collapse it.
  var _userOpened = {};

  function focusSearch(panel) {
    var search = panel.querySelector('.scw-ws-v2-search-input');
    if (search) {
      try { search.focus({ preventScroll: true }); }
      catch (e) { search.focus(); }
    }
  }

  // Idempotent decoration — safe to re-run on every pass even if the panel
  // or its banner was rebuilt: classes are re-asserted, stale chevrons/tags
  // are removed, exactly one chevron is (re)inserted. NO per-element click
  // binding (see the delegated handler below).
  function decorate(viewKey, kind) {
    var panel = document.getElementById('scw-ws-v2-' + viewKey);
    if (!panel) return;
    panel.classList.add('scw-co-collapsible', 'scw-co-src--' + kind);
    panel.setAttribute('data-scw-co-src', viewKey);
    if (!_userOpened[viewKey]) panel.classList.add('scw-co-collapsed');
    var banner = panel.querySelector('.scw-ws-v2-banner');
    if (!banner) return;
    var old = banner.querySelectorAll('.scw-co-chevron, .scw-co-src-tag');
    for (var i = old.length - 1; i >= 0; i--) {
      if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    }
    var chev = document.createElement('span');
    chev.className = 'scw-co-chevron';
    chev.innerHTML = CHEV_SVG;
    banner.insertBefore(chev, banner.firstChild);
  }

  // Delegated banner toggle — survives banner rebuilds. Bound once.
  if (!document.documentElement.hasAttribute('data-scw-co-strips-bound')) {
    document.documentElement.setAttribute('data-scw-co-strips-bound', '1');
    document.addEventListener('click', function (e) {
      var banner = e.target && e.target.closest &&
                   e.target.closest('.scw-co-collapsible > .scw-ws-v2-banner');
      if (!banner) return;
      // Don't hijack real banner controls (e.g. co-adopt's bulk button).
      if (e.target.closest('button, a, input, select')) return;
      var panel = banner.parentNode;
      var viewKey = panel.getAttribute('data-scw-co-src') || '';
      var nowCollapsed = panel.classList.toggle('scw-co-collapsed');
      if (viewKey) _userOpened[viewKey] = !nowCollapsed;
      if (!nowCollapsed) setTimeout(function () { focusSearch(panel); }, 60);
    });
  }

  function mount() {
    var panel = document.getElementById('scw-ws-v2-' + CO_VIEW);
    if (!panel || document.getElementById(BAR_ID)) return;
    injectCss();

    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML =
      '<div class="scw-co-ab-copy">' +
        '<div class="scw-co-ab-title">Draft this change order</div>' +
        '<div class="scw-co-ab-sub">Add new items with the button, or expand ' +
          'a panel below to pull in previously quoted items or flag installed ' +
          'items for removal.</div>' +
      '</div>' +
      '<button type="button" data-co-ab="add">' + PLUS_SVG +
        '<span>Add new item</span></button>';
    panel.parentNode.insertBefore(bar, panel);

    bar.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-co-ab]');
      if (!btn) return;
      if (ns.coAddForm && typeof ns.coAddForm.open === 'function') {
        ns.coAddForm.open({ viewKey: CO_VIEW });
      }
    });
  }

  // Move the (collapsed) source panels directly under the action bar, above
  // the CO worksheet. Idempotent order check; init.js's accordion-relocation
  // no-ops once the panels live outside any accordion wrapper.
  function relocateSources() {
    var bar = document.getElementById(BAR_ID);
    if (!bar || !bar.parentNode) return;
    var after = bar;
    [ADOPT_VIEW, REMOVE_VIEW].forEach(function (vk) {
      var p = document.getElementById('scw-ws-v2-' + vk);
      if (!p) return;
      if (after.nextSibling !== p) after.parentNode.insertBefore(p, after.nextSibling);
      after = p;
    });
  }

  function mountAll() {
    mount();
    decorate(ADOPT_VIEW, 'add');
    decorate(REMOVE_VIEW, 'remove');
    relocateSources();
  }
  function mountSoon() {
    setTimeout(mountAll, 200);
    setTimeout(mountAll, 800);   // catch a late v2 panel build
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(CO_VIEW, mountSoon, EVENT_NS);
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, mountSoon);
})();
/*** END: CO scene action bar **********************************************/
