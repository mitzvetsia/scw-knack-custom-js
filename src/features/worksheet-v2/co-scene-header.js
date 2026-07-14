/*** CHANGE ORDER SCENE — caption + add strip + source-strip coordination ***
 *
 * A CO drafting scene has three ways to build the change order, presented
 * as three consistent expandable strips directly above the CO worksheet:
 *
 *   [ ▸ + Add new items                       ]  (blue — inline add form)
 *   [ ▸ Previously Quoted — available to add  ]  (green — adopt panel)
 *   [ ▸ Install Items — available to remove   ]  (rose  — remove panel)
 *   [ Change Order Line Items … (the CO worksheet) ]
 *
 * Deployed twice (same experience, different scenes):
 *   internal drafting scene_1362 — view_4079 / view_4088 / view_4086
 *   sub portal scene_1374        — view_4112 / view_4118 / view_4116
 * Only one deployment's views exist on any rendered scene; each deployment
 * gets its own suffixed element/style ids so lock code (co-sub-lock.js) can
 * target the sub scene's strips without touching the internal ones.
 *
 * IMPORTANT — collapse ownership: co-adopt.js and co-remove.js already own
 * their panels' collapse (delegated banner toggle, caret, localStorage
 * persistence, default collapsed). This module must NOT add a second
 * collapse system on those banners (doing so double-decorated the carets
 * and the two systems toggled out of phase — the "panel won't expand" bug).
 * Here we only: relocate the panels under the caption, tint their banners,
 * and coordinate EXCLUSIVE expansion (opening one strip collapses the
 * others, via co-adopt/co-remove's own classes + storage keys).
 *
 * The add strip is ours: same banner-toggle pattern, blue tint, and its
 * body hosts the add-item form inline (co-add-item-form.js open({host})).
 * The form is (re)built fresh on each expand — collapse discards state.
 ***************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var DEPLOYMENTS = [
    { coView: 'view_4079', adoptView: 'view_4088', removeView: 'view_4086' },
    { coView: 'view_4112', adoptView: 'view_4118', removeView: 'view_4116' }
  ];

  var CHEV_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="9 6 15 12 9 18"/></svg>';
  var PLUS_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/></svg>';

  DEPLOYMENTS.forEach(setup);

  function setup(cfg) {
    var CO_VIEW     = cfg.coView;
    var ADOPT_VIEW  = cfg.adoptView;
    var REMOVE_VIEW = cfg.removeView;
    var WRAP_ID     = 'scw-co-strips-' + CO_VIEW;
    var STRIP_ID    = 'scw-co-add-strip-' + CO_VIEW;
    var STYLE_ID    = 'scw-co-actionbar-css-' + CO_VIEW;
    var EVENT_NS    = '.scwCoActionBar' + CO_VIEW.replace('view_', '');

    // co-adopt / co-remove collapse surfaces (their classes + storage keys —
    // see the ownership note above; keep in sync with those modules).
    var ADOPT_CLS  = 'scw-ws-v2--co-collapsed';
    var REMOVE_CLS = 'scw-ws-v2--co-remove-collapsed';
    var ADOPT_KEY  = 'scwCoAdoptCollapsed:'  + ADOPT_VIEW;
    var REMOVE_KEY = 'scwCoRemoveCollapsed:' + REMOVE_VIEW;

    function injectCss() {
      if (document.getElementById(STYLE_ID)) return;
      var s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent = [
        // One contained block for all three strips — hairline dividers between
        // rows instead of three separate bordered boxes.
        '#' + WRAP_ID + '{border:1px solid #e2e8f0;border-radius:10px;background:#fff;',
        'overflow:hidden;margin:0 0 12px 0;}',
        '#' + WRAP_ID + ' > * + *{border-top:1px solid #e2e8f0;}',
        '#scw-ws-v2-' + ADOPT_VIEW + ', #scw-ws-v2-' + REMOVE_VIEW + ', #' + STRIP_ID + '{',
        'margin:0 !important;border:0 !important;border-radius:0 !important;box-shadow:none !important;}',
        // Slim the banner rows inside the block.
        '#' + WRAP_ID + ' .scw-ws-v2-banner{padding:8px 14px !important;border-radius:0 !important;}',
        // Source-strip tints (their own carets/toggles stay untouched).
        '#scw-ws-v2-' + ADOPT_VIEW + ' > .scw-ws-v2-banner{',
        'background:#f0fdf4 !important;box-shadow:inset 4px 0 0 #16a34a !important;}',
        '#scw-ws-v2-' + REMOVE_VIEW + ' > .scw-ws-v2-banner{',
        'background:#fff1f2 !important;box-shadow:inset 4px 0 0 #e11d48 !important;}',
        // Warning chips are browse-time info — hide them while the source strip
        // is collapsed (record count stays as the summary).
        '#scw-ws-v2-' + ADOPT_VIEW + '.' + ADOPT_CLS + ' .scw-ws-v2-banner-chips,',
        '#scw-ws-v2-' + REMOVE_VIEW + '.' + REMOVE_CLS + ' .scw-ws-v2-banner-chips{',
        'display:none !important;}',
        // Add strip row — blue, same anatomy as the panel banners.
        '#' + STRIP_ID + ' .scw-co-add-banner{display:flex;align-items:center;gap:8px;',
        'padding:8px 14px;cursor:pointer;user-select:none;',
        'background:#eff6ff;box-shadow:inset 4px 0 0 #0f4c75;',
        'font:700 13px/1.3 system-ui,-apple-system,sans-serif;color:#1e293b;}',
        '#' + STRIP_ID + ' .scw-co-add-caret{display:inline-flex;align-items:center;',
        'width:16px;height:16px;color:#64748b;transition:transform .15s ease;flex:0 0 auto;}',
        '#' + STRIP_ID + ':not(.is-collapsed) .scw-co-add-caret{transform:rotate(90deg);}',
        '#' + STRIP_ID + ' .scw-co-add-plus{display:inline-flex;align-items:center;color:#0f4c75;flex:0 0 auto;}',
        '#' + STRIP_ID + ' .scw-co-add-hint{font:400 12px/1.3 system-ui,sans-serif;color:#94a3b8;margin-left:auto;}',
        '#' + STRIP_ID + ' .scw-co-add-body{padding:4px 14px 12px;}',
        '#' + STRIP_ID + '.is-collapsed .scw-co-add-body{display:none;}'
      ].join('');
      document.head.appendChild(s);
    }

    // ── exclusive-expansion helpers (drive the OWNING modules' state) ────
    function collapseAdopt() {
      var p = document.getElementById('scw-ws-v2-' + ADOPT_VIEW);
      if (p && !p.classList.contains(ADOPT_CLS)) {
        p.classList.add(ADOPT_CLS);
        try { localStorage.setItem(ADOPT_KEY, '1'); } catch (e) {}
      }
    }
    function collapseRemove() {
      var p = document.getElementById('scw-ws-v2-' + REMOVE_VIEW);
      if (p && !p.classList.contains(REMOVE_CLS)) {
        p.classList.add(REMOVE_CLS);
        try { localStorage.setItem(REMOVE_KEY, '1'); } catch (e) {}
      }
    }
    function collapseAddStrip() {
      var strip = document.getElementById(STRIP_ID);
      if (!strip || strip.classList.contains('is-collapsed')) return;
      strip.classList.add('is-collapsed');
      var host = strip.querySelector('.scw-co-add-body');
      if (host) host.innerHTML = '';   // discard in-progress form state
    }
    function expandAddStrip() {
      var strip = document.getElementById(STRIP_ID);
      if (!strip) return;
      collapseAdopt();
      collapseRemove();
      strip.classList.remove('is-collapsed');
      var host = strip.querySelector('.scw-co-add-body');
      if (host && !host.firstChild &&
          ns.coAddForm && typeof ns.coAddForm.open === 'function') {
        ns.coAddForm.open({ viewKey: CO_VIEW, host: host, onClose: function () {
          var st = document.getElementById(STRIP_ID);
          if (st) st.classList.add('is-collapsed');
        }});
      }
    }

    function focusSearch(panel) {
      var search = panel.querySelector('.scw-ws-v2-search-input');
      if (search) {
        try { search.focus({ preventScroll: true }); }
        catch (e) { search.focus(); }
      }
    }

    // Exclusive coordination for the adopt/remove banners. Their OWN delegated
    // handlers (registered earlier in the bundle) perform the toggle; this
    // later-registered listener then reads the resulting state — if the panel
    // just EXPANDED, collapse the other strips and focus its search box.
    // Scoped to THIS deployment's panels by id, so the two deployments'
    // listeners never cross wires.
    var BOUND_ATTR = 'data-scw-co-exclusive-bound-' + CO_VIEW;
    if (!document.documentElement.hasAttribute(BOUND_ATTR)) {
      document.documentElement.setAttribute(BOUND_ATTR, '1');
      document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var adoptBanner  = t.closest('.scw-ws-v2-banner.scw-co-adopt-collapsible');
        var removeBanner = t.closest('.scw-ws-v2-banner.scw-co-remove-collapsible');
        if (!adoptBanner && !removeBanner) return;
        if (t.closest('button, a, input, select')) return;   // real controls
        var panel = (adoptBanner || removeBanner).closest('.scw-ws-v2');
        if (!panel) return;
        // Not this deployment's panel → the other setup() instance handles it.
        var pid = panel.id || '';
        if (pid !== 'scw-ws-v2-' + ADOPT_VIEW && pid !== 'scw-ws-v2-' + REMOVE_VIEW) return;
        var expanded = adoptBanner
          ? !panel.classList.contains(ADOPT_CLS)
          : !panel.classList.contains(REMOVE_CLS);
        if (!expanded) return;
        if (adoptBanner) collapseRemove(); else collapseAdopt();
        collapseAddStrip();
        setTimeout(function () { focusSearch(panel); }, 60);
      });
    }

    // ── strips block (wrapper + add strip) ────────────────────────────────
    // One bordered container directly above the CO worksheet holding all three
    // strips as hairline-divided rows — no separate caption box (the strip
    // titles carry the guidance; the header card says where you are).
    function mount() {
      var panel = document.getElementById('scw-ws-v2-' + CO_VIEW);
      if (!panel) return;
      injectCss();

      var wrap = document.getElementById(WRAP_ID);
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = WRAP_ID;
        wrap.className = 'scw-co-strips';
        panel.parentNode.insertBefore(wrap, panel);
      }

      if (!document.getElementById(STRIP_ID)) {
        var strip = document.createElement('div');
        strip.id = STRIP_ID;
        strip.className = 'is-collapsed';
        strip.innerHTML =
          '<div class="scw-co-add-banner">' +
            '<span class="scw-co-add-caret">' + CHEV_SVG + '</span>' +
            '<span class="scw-co-add-plus">' + PLUS_SVG + '</span>' +
            '<span>Add New Items — create new items on this change order</span>' +
            '<span class="scw-co-add-hint">expand to add</span>' +
          '</div>' +
          '<div class="scw-co-add-body"></div>';
        wrap.appendChild(strip);
        strip.querySelector('.scw-co-add-banner').addEventListener('click', function () {
          if (strip.classList.contains('is-collapsed')) expandAddStrip();
          else collapseAddStrip();
        });
      }
    }

    // Pull the source panels INTO the strips block, after the add strip.
    // Idempotent; init.js's accordion-relocation no-ops once the panels live
    // outside any accordion wrapper, and renders target the panels by id so
    // re-parenting is safe.
    function relocateSources() {
      var wrap = document.getElementById(WRAP_ID);
      var after = document.getElementById(STRIP_ID);
      if (!wrap || !after) return;
      [ADOPT_VIEW, REMOVE_VIEW].forEach(function (vk) {
        var p = document.getElementById('scw-ws-v2-' + vk);
        if (!p) return;
        if (after.nextSibling !== p || p.parentNode !== wrap) {
          wrap.insertBefore(p, after.nextSibling);
        }
        after = p;
      });
    }

    function mountAll() {
      mount();
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
  }
})();
/*** END: CO scene caption + strips ****************************************/
