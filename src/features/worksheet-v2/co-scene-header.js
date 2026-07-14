/*** CHANGE ORDER SCENE — caption + add strip + source-strip coordination ***
 *
 * The CO drafting scene (scene_1362) has three ways to build the change
 * order, presented as three consistent expandable strips directly under a
 * one-line caption:
 *
 *   Draft this change order — expand a panel below.
 *   [ ▸ + Add new items                       ]  (blue — inline add form)
 *   [ ▸ Previously Quoted — available to add  ]  (green — view_4088)
 *   [ ▸ Install Items — available to remove   ]  (rose  — view_4086)
 *   [ Change Order Line Items … (the CO worksheet) ]
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

  var CO_VIEW     = 'view_4079';
  var ADOPT_VIEW  = 'view_4088';
  var REMOVE_VIEW = 'view_4086';
  var BAR_ID      = 'scw-co-actionbar';
  var STRIP_ID    = 'scw-co-add-strip';
  var STYLE_ID    = 'scw-co-actionbar-css';
  var EVENT_NS    = '.scwCoActionBar';

  // co-adopt / co-remove collapse surfaces (their classes + storage keys —
  // see the ownership note above; keep in sync with those modules).
  var ADOPT_CLS  = 'scw-ws-v2--co-collapsed';
  var REMOVE_CLS = 'scw-ws-v2--co-remove-collapsed';
  var ADOPT_KEY  = 'scwCoAdoptCollapsed:'  + ADOPT_VIEW;
  var REMOVE_KEY = 'scwCoRemoveCollapsed:' + REMOVE_VIEW;

  var CHEV_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="9 6 15 12 9 18"/></svg>';
  var PLUS_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/></svg>';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // One-line caption above the strips.
      '#' + BAR_ID + '{margin:0 0 8px 0;padding:10px 16px;background:#f8fafc;',
      'border:1px solid #e2e8f0;border-radius:10px;}',
      '#' + BAR_ID + ' .scw-co-ab-title{font:700 13px/1.3 system-ui,-apple-system,sans-serif;color:#0f4c75;}',
      '#' + BAR_ID + ' .scw-co-ab-sub{font:400 12px/1.4 system-ui,sans-serif;color:#64748b;margin-top:2px;}',
      // Tight stacking rhythm for the strips.
      '#scw-ws-v2-' + ADOPT_VIEW + ', #scw-ws-v2-' + REMOVE_VIEW + ', #' + STRIP_ID + '{',
      'margin:0 0 8px 0 !important;}',
      // Source-strip tints (their own carets/toggles stay untouched).
      '#scw-ws-v2-' + ADOPT_VIEW + ' > .scw-ws-v2-banner{',
      'background:#f0fdf4 !important;box-shadow:inset 4px 0 0 #16a34a;}',
      '#scw-ws-v2-' + REMOVE_VIEW + ' > .scw-ws-v2-banner{',
      'background:#fff1f2 !important;box-shadow:inset 4px 0 0 #e11d48;}',
      // Add strip — visually a sibling of the panel banners, blue.
      '#' + STRIP_ID + '{border:1px solid #e2e8f0;border-radius:8px;background:#fff;overflow:hidden;}',
      '#' + STRIP_ID + ' .scw-co-add-banner{display:flex;align-items:center;gap:8px;',
      'padding:10px 14px;cursor:pointer;user-select:none;',
      'background:#eff6ff;box-shadow:inset 4px 0 0 #0f4c75;',
      'font:700 13px/1.3 system-ui,-apple-system,sans-serif;color:#1e293b;}',
      '#' + STRIP_ID + ' .scw-co-add-caret{display:inline-flex;align-items:center;',
      'width:16px;height:16px;color:#64748b;transition:transform .15s ease;flex:0 0 auto;}',
      '#' + STRIP_ID + ':not(.is-collapsed) .scw-co-add-caret{transform:rotate(90deg);}',
      '#' + STRIP_ID + ' .scw-co-add-plus{display:inline-flex;align-items:center;color:#0f4c75;flex:0 0 auto;}',
      '#' + STRIP_ID + ' .scw-co-add-hint{font:400 12px/1.3 system-ui,sans-serif;color:#64748b;margin-left:auto;}',
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
  if (!document.documentElement.hasAttribute('data-scw-co-exclusive-bound')) {
    document.documentElement.setAttribute('data-scw-co-exclusive-bound', '1');
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var adoptBanner  = t.closest('.scw-ws-v2-banner.scw-co-adopt-collapsible');
      var removeBanner = t.closest('.scw-ws-v2-banner.scw-co-remove-collapsible');
      if (!adoptBanner && !removeBanner) return;
      if (t.closest('button, a, input, select')) return;   // real controls
      var panel = (adoptBanner || removeBanner).closest('.scw-ws-v2');
      if (!panel) return;
      var expanded = adoptBanner
        ? !panel.classList.contains(ADOPT_CLS)
        : !panel.classList.contains(REMOVE_CLS);
      if (!expanded) return;
      if (adoptBanner) collapseRemove(); else collapseAdopt();
      collapseAddStrip();
      setTimeout(function () { focusSearch(panel); }, 60);
    });
  }

  // ── caption + add strip ───────────────────────────────────────────────
  function mount() {
    var panel = document.getElementById('scw-ws-v2-' + CO_VIEW);
    if (!panel) return;
    injectCss();

    if (!document.getElementById(BAR_ID)) {
      var bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.innerHTML =
        '<div class="scw-co-ab-title">Draft this change order</div>' +
        '<div class="scw-co-ab-sub">Expand a panel below to add new items, ' +
          'pull in previously quoted items, or flag installed items for ' +
          'removal. Everything drafts here before pricing and issue.</div>';
      panel.parentNode.insertBefore(bar, panel);
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
      var barEl = document.getElementById(BAR_ID);
      barEl.parentNode.insertBefore(strip, barEl.nextSibling);
      strip.querySelector('.scw-co-add-banner').addEventListener('click', function () {
        if (strip.classList.contains('is-collapsed')) expandAddStrip();
        else collapseAddStrip();
      });
    }
  }

  // Order under the caption: add strip → adopt panel → remove panel → CO
  // worksheet. Idempotent; init.js's accordion-relocation no-ops once the
  // panels live outside any accordion wrapper.
  function relocateSources() {
    var after = document.getElementById(STRIP_ID) || document.getElementById(BAR_ID);
    if (!after || !after.parentNode) return;
    [ADOPT_VIEW, REMOVE_VIEW].forEach(function (vk) {
      var p = document.getElementById('scw-ws-v2-' + vk);
      if (!p) return;
      if (after.nextSibling !== p) after.parentNode.insertBefore(p, after.nextSibling);
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
})();
/*** END: CO scene caption + strips ****************************************/
