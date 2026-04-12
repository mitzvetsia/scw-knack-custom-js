/*** FEATURE: Accordion Menu Button Injection ************************************
 *
 * Scans for kn-menu views in the view-group immediately preceding an
 * accordion's view-group and injects their action buttons into the
 * accordion header as solid accent-colored pill buttons.  Only the
 * kn-menu view itself is hidden; sibling views (rich_text titles,
 * etc.) in the same view-group are left visible.
 *
 * Two DOM patterns are detected:
 *
 *   Pattern A — menu in a preceding view-group:
 *
 *     <div class="view-group">
 *       <div class="kn-view kn-rich_text">    (optional — left visible)
 *       <div class="kn-view kn-menu">         (hidden after injection)
 *     </div>
 *     <div class="view-group">
 *       <div class="scw-ktl-accordion">       (enhanced accordion)
 *     </div>
 *
 *   Pattern B — menu is an immediate sibling in the same group:
 *
 *     <div class="view-group">
 *       <div class="kn-view kn-menu">         (hidden after injection)
 *       <div class="scw-ktl-accordion">       (enhanced accordion)
 *     </div>
 *
 * Button clicks proxy to the original (hidden) links so all Knack
 * event handlers are preserved.
 *
 * Reads : .scw-ktl-accordion, .scw-ktl-accordion__header, .kn-menu
 * Writes: Injects .scw-acc-actions into accordion headers
 *
 *********************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-acc-menu-inject-css';
  var INJECTED = 'data-scw-menu-injected';
  var MENU_SRC = 'data-scw-menu-src';
  var HIDDEN_CLASS = 'scw-acc-menu-src-hidden';
  var EVENT_NS = '.scwAccMenuInject';
  var LOG = '[SCW AccMenuInject]';

  // ── Plus icon for "Add" / "New" buttons ─────────────
  var PLUS_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/></svg>';

  // ── CSS injection ───────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      /* Hide the source view-group */
      '.' + HIDDEN_CLASS + ' { display: none !important; }',

      /* Action-button container inside the accordion header */
      '.scw-acc-actions {',
      '  flex: 0 0 auto;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  margin: 0 10px 0 0;',
      '}',

      /* Individual action button — solid accent fill so they pop */
      '.scw-acc-action-btn {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 4px;',
      '  padding: 5px 12px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  line-height: 1.4;',
      '  color: #fff;',
      '  background: var(--scw-accent, #295f91);',
      '  border: none;',
      '  border-radius: 6px;',
      '  cursor: pointer;',
      '  white-space: nowrap;',
      '  text-decoration: none !important;',
      '  font-family: inherit;',
      '  box-shadow: 0 1px 3px rgba(0,0,0,.15);',
      '  transition: background 150ms ease, box-shadow 150ms ease, transform 100ms ease;',
      '}',

      '.scw-acc-action-btn:hover {',
      '  background: rgba(var(--scw-accent-rgb, 41,95,145), 0.85);',
      '  box-shadow: 0 2px 6px rgba(0,0,0,.20);',
      '  color: #fff;',
      '  text-decoration: none !important;',
      '  transform: translateY(-1px);',
      '}',

      '.scw-acc-action-btn:active {',
      '  transform: translateY(0);',
      '  box-shadow: 0 1px 2px rgba(0,0,0,.12);',
      '}',

      '.scw-acc-action-btn:focus-visible {',
      '  outline: 2px solid var(--scw-accent, #295f91);',
      '  outline-offset: 1px;',
      '}',

      /* SVG icon inside button */
      '.scw-acc-action-btn svg {',
      '  flex-shrink: 0;',
      '  opacity: 0.85;',
      '}',
      '.scw-acc-action-btn:hover svg {',
      '  opacity: 1;',
      '}',
    ].join('\n');

    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ── Find the kn-menu view associated with an accordion ──

  function findMenuForAccordion(accordion) {
    // Strategy 1: menu is an immediate preceding sibling
    var prevSibling = accordion.previousElementSibling;
    if (prevSibling && prevSibling.classList.contains('kn-menu')) {
      return { menu: prevSibling, strategy: 'sibling' };
    }
    // Strategy 2: menu lives in the preceding view-group
    var viewGroup = accordion.parentElement;
    while (viewGroup && !viewGroup.classList.contains('view-group')) {
      viewGroup = viewGroup.parentElement;
    }
    if (!viewGroup) return null;
    var prevGroup = viewGroup.previousElementSibling;
    if (prevGroup &&
        prevGroup.classList.contains('view-group') &&
        !prevGroup.querySelector('.scw-ktl-accordion')) {
      var menu = prevGroup.querySelector('.kn-view.kn-menu');
      if (menu) return { menu: menu, strategy: 'prev-group' };
    }
    return null;
  }

  // ── MutationObserver tracking for late-loading menus ──

  var watchedMenus = {};
  var enhanceDebounceTimer = null;

  function debouncedEnhance() {
    clearTimeout(enhanceDebounceTimer);
    enhanceDebounceTimer = setTimeout(enhance, 150);
  }

  /** Disconnect all active menu observers */
  function clearMenuWatchers() {
    var ids = Object.keys(watchedMenus);
    if (ids.length) {
      console.log(LOG, 'clearMenuWatchers — disconnecting observers for:', ids.join(', '));
    }
    for (var id in watchedMenus) {
      if (watchedMenus.hasOwnProperty(id)) {
        watchedMenus[id].disconnect();
      }
    }
    watchedMenus = {};
  }

  /**
   * After enhance() runs, find accordion headers that couldn't be
   * injected because their kn-menu view was still empty.  Set up a
   * MutationObserver on each empty menu so we retry as soon as
   * content appears.
   */
  function watchEmptyMenus() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion');
    var watching = [];
    for (var i = 0; i < accordions.length; i++) {
      var header = accordions[i].querySelector('.scw-ktl-accordion__header');
      if (!header || header.hasAttribute(INJECTED)) continue;

      var result = findMenuForAccordion(accordions[i]);
      if (!result) continue;
      var menuView = result.menu;
      if (menuView.classList.contains(HIDDEN_CLASS)) continue;
      if (menuView.querySelectorAll('a').length > 0) continue;

      var viewId = menuView.id;
      if (watchedMenus[viewId]) continue;

      // IIFE to close over viewId and menuView for the observer callback
      (function (id, el) {
        var obs = new MutationObserver(function () {
          var linkCount = el.querySelectorAll('a').length;
          console.log(LOG, 'MutationObserver fired for', id,
            '— links now:', linkCount,
            '— innerHTML length:', el.innerHTML.length);
          if (linkCount > 0) {
            obs.disconnect();
            delete watchedMenus[id];
            console.log(LOG, 'Observer resolved for', id, '— re-running enhance()');
            debouncedEnhance();
          }
        });
        obs.observe(el, { childList: true, subtree: true });
        watchedMenus[id] = obs;
      })(viewId, menuView);

      watching.push(viewId);
    }
    if (watching.length) {
      console.log(LOG, 'watchEmptyMenus — now observing:', watching.join(', '));
    }
  }

  // ── Detect and inject ───────────────────────────────

  function enhance() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion');
    console.log(LOG, 'enhance() called — found', accordions.length, 'accordion(s)');

    // Snapshot all kn-menu views on the page for diagnostics
    var allMenus = document.querySelectorAll('.kn-menu');
    var menuSnapshot = [];
    for (var m = 0; m < allMenus.length; m++) {
      var mv = allMenus[m];
      menuSnapshot.push({
        id: mv.id,
        linkCount: mv.querySelectorAll('a').length,
        hidden: mv.classList.contains(HIDDEN_CLASS),
        innerHTMLLen: mv.innerHTML.length
      });
    }
    console.log(LOG, 'All kn-menu views on page:', JSON.stringify(menuSnapshot));

    var injected = 0;
    var skipped = { noHeader: 0, alreadyInjected: 0, noMenu: 0, menuHidden: 0, emptyMenu: 0 };

    for (var i = 0; i < accordions.length; i++) {
      var accordion = accordions[i];
      var header = accordion.querySelector('.scw-ktl-accordion__header');
      if (!header) { skipped.noHeader++; continue; }
      if (header.hasAttribute(INJECTED)) { skipped.alreadyInjected++; continue; }

      // Identify the accordion for logging
      var accLabel = (header.textContent || '').trim().substring(0, 50);
      var accViewId = accordion.closest('[id^="view_"]');
      accViewId = accViewId ? accViewId.id : '(unknown)';

      var result = findMenuForAccordion(accordion);
      if (!result) {
        skipped.noMenu++;
        console.log(LOG, '  accordion', accViewId, JSON.stringify(accLabel),
          '→ no menu found (strategy exhausted)');
        continue;
      }
      var menuView = result.menu;
      var strategy = result.strategy;

      // Skip if this menu has already been claimed by another accordion
      if (menuView.classList.contains(HIDDEN_CLASS)) {
        skipped.menuHidden++;
        console.log(LOG, '  accordion', accViewId, JSON.stringify(accLabel),
          '→ menu', menuView.id, 'already hidden (claimed)');
        continue;
      }

      // Collect action links
      var links = menuView.querySelectorAll('a');
      var actionLinks = [];
      for (var j = 0; j < links.length; j++) {
        var text = (links[j].textContent || '').trim();
        if (text) actionLinks.push({ text: text, index: j });
      }
      if (!actionLinks.length) {
        skipped.emptyMenu++;
        console.warn(LOG, '  accordion', accViewId, JSON.stringify(accLabel),
          '→ menu', menuView.id, 'found via', strategy,
          'but EMPTY (0 links, innerHTML length:', menuView.innerHTML.length + ')');
        continue;
      }

      console.log(LOG, '  accordion', accViewId, JSON.stringify(accLabel),
        '→ menu', menuView.id, 'via', strategy,
        '— injecting', actionLinks.length, 'button(s):',
        actionLinks.map(function(a) { return a.text; }).join(', '));

      // Build the button container
      var container = document.createElement('div');
      container.className = 'scw-acc-actions';
      container.setAttribute(MENU_SRC, menuView.id);

      for (var k = 0; k < actionLinks.length; k++) {
        var info = actionLinks[k];

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scw-acc-action-btn';
        btn.setAttribute('data-menu-view', menuView.id);
        btn.setAttribute('data-link-index', String(info.index));

        // Prefix a "+" icon for Add / New / Bulk Add buttons
        if (/^(add|bulk add|new)\b/i.test(info.text)) {
          var iconSpan = document.createElement('span');
          iconSpan.innerHTML = PLUS_SVG;
          btn.appendChild(iconSpan);
        }

        btn.appendChild(document.createTextNode(info.text));

        // Proxy click to the original hidden link
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          var menuId = this.getAttribute('data-menu-view');
          var linkIdx = parseInt(this.getAttribute('data-link-index'), 10);
          var menu = document.getElementById(menuId);
          if (!menu) return;

          var targets = menu.querySelectorAll('a');
          if (targets[linkIdx]) targets[linkIdx].click();
        });

        container.appendChild(btn);
      }

      // Insert before chevron in the header, then move count pill
      // to sit between the buttons and the chevron:
      //   icon | title | [buttons] | count | chevron
      var chevron = header.querySelector('.scw-acc-chevron');
      var countPill = header.querySelector('.scw-acc-count');
      if (chevron) {
        header.insertBefore(container, chevron);
        // Move count pill to right of buttons (before chevron)
        if (countPill) header.insertBefore(countPill, chevron);
      } else {
        header.appendChild(container);
      }

      // Hide only the kn-menu view (preserve rich_text titles, etc.)
      menuView.classList.add(HIDDEN_CLASS);

      // Mark this accordion header as processed
      header.setAttribute(INJECTED, '1');
      injected++;
    }

    console.log(LOG, 'enhance() done — injected:', injected,
      '— skipped:', JSON.stringify(skipped));

    // Watch any empty menus so we can retry when content arrives
    watchEmptyMenus();
  }

  // ── Lifecycle ───────────────────────────────────────

  injectStyles();

  // Run after accordion enhancement (which uses 80ms delay)
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function (event, scene) {
      var sceneId = scene && scene.key ? scene.key : '(unknown)';
      console.log(LOG, 'knack-scene-render.any fired — scene:', sceneId);
      clearMenuWatchers();
      setTimeout(enhance, 200);
    });

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view) {
      var viewId = view && view.key ? view.key : '(unknown)';
      // Only log menu views to reduce noise
      var el = document.getElementById(viewId);
      var isMenu = el && el.classList.contains('kn-menu');
      if (isMenu) {
        var linkCount = el.querySelectorAll('a').length;
        console.log(LOG, 'knack-view-render for MENU', viewId,
          '— links:', linkCount, '— innerHTML length:', el.innerHTML.length);
      }
      setTimeout(enhance, 200);
    });

  // Initial pass
  $(document).ready(function () {
    console.log(LOG, 'document.ready — scheduling initial enhance() in 500ms');
    setTimeout(enhance, 500);
  });

})();
/*** END FEATURE: Accordion Menu Button Injection ********************************/
