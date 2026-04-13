/*** FEATURE: Accordion Menu Button Injection ************************************
 *
 * Injects kn-menu action links as pill-buttons into KTL accordion headers.
 *
 * ── How pairing works ────────────────────────────────────────────────────────
 *
 * At knack-scene-render time (before KTL wraps any tables) the DOM is in its
 * pristine Knack-builder order.  discoverMenuPairings() walks every kn-menu
 * on the page and pairs it with the table/list/report view it belongs to:
 *
 *   Pattern B — menu + table in the same view-group:
 *     menu.nextElementSibling  ──▶  first kn-table / kn-list / kn-report
 *
 *   Pattern A — menu in a "header" group, table in the next group:
 *     viewGroup contains only kn-menu + optional kn-rich_text
 *     nextElementSibling view-group  ──▶  first table therein
 *
 * The resulting map  { tableViewId → menuViewId }  is cached for the life of
 * the scene.  When KTL later wraps a table inside .scw-ktl-accordion, a
 * MutationObserver fires enhance() which looks up the pairing by the inner
 * view's ID — fully deterministic, no timing guesses.
 *
 * ── Safety valves ────────────────────────────────────────────────────────────
 *
 *   MENU_EXCLUDE — standalone menus that must never be consumed
 *   MENU_MAP     — explicit { tableViewId: menuViewId } overrides
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

  // ── Configuration ──────────────────────────────────
  // Standalone menus that must NEVER be paired with an accordion.
  var MENU_EXCLUDE = {
    'view_3815': true
  };

  // Explicit overrides — takes priority over auto-discovery.
  // Format: { tableViewId: menuViewId }
  var MENU_MAP = {};

  // ── State ──────────────────────────────────────────
  var _menuPairings = {};      // tableViewId → { menuId, strategy }
  var _debounceTimer = null;
  var _sceneObserver = null;
  var modelInspected = {};

  function scheduleEnhance(delay) {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(function () {
      _debounceTimer = null;
      enhance();
    }, delay || 100);
  }

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
      '.' + HIDDEN_CLASS + ' { display: none !important; }',

      '.scw-acc-actions {',
      '  flex: 0 0 auto;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  margin: 0 10px 0 0;',
      '}',

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
      '  justify-content: center;',
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

  // ══════════════════════════════════════════════════════════════
  // PAIRING DISCOVERY — runs once per scene on pristine DOM
  // ══════════════════════════════════════════════════════════════

  function discoverMenuPairings() {
    _menuPairings = {};
    var claimed = {};
    var menus = document.querySelectorAll('.kn-view.kn-menu');
    console.log(LOG, 'discoverMenuPairings() — found', menus.length, 'menu(s)');

    for (var i = 0; i < menus.length; i++) {
      var menu = menus[i];
      if (!menu.id) continue;
      if (MENU_EXCLUDE[menu.id]) {
        console.log(LOG, '  skip excluded menu', menu.id);
        continue;
      }

      var viewGroup = menu.closest('.view-group');
      if (!viewGroup) continue;

      // ── Pattern B: table in the same view-group, after the menu ──
      var paired = false;
      var sibling = menu.nextElementSibling;
      while (sibling) {
        if (sibling.id && sibling.classList.contains('kn-view')) {
          if (sibling.classList.contains('kn-table') ||
              sibling.classList.contains('kn-list') ||
              sibling.classList.contains('kn-report')) {
            if (!claimed[sibling.id]) {
              _menuPairings[sibling.id] = { menuId: menu.id, strategy: 'sibling' };
              claimed[sibling.id] = true;
              paired = true;
              console.log(LOG, '  pair (B)', menu.id, '→', sibling.id);
            }
            break;
          }
          // Skip rich_text labels between menu and table; stop on anything else
          if (!sibling.classList.contains('kn-rich_text')) break;
        }
        sibling = sibling.nextElementSibling;
      }
      if (paired) continue;

      // ── Pattern A: menu-only group → table in the next view-group ──
      var isHeaderGroup = true;
      var groupViews = viewGroup.querySelectorAll('.kn-view');
      for (var gv = 0; gv < groupViews.length; gv++) {
        if (!groupViews[gv].classList.contains('kn-menu') &&
            !groupViews[gv].classList.contains('kn-rich_text')) {
          isHeaderGroup = false;
          break;
        }
      }
      if (!isHeaderGroup) continue;

      var nextGroup = viewGroup.nextElementSibling;
      if (nextGroup && nextGroup.classList.contains('view-group')) {
        var tables = nextGroup.querySelectorAll(
          '.kn-view.kn-table, .kn-view.kn-list, .kn-view.kn-report'
        );
        for (var t = 0; t < tables.length; t++) {
          if (tables[t].id && !claimed[tables[t].id]) {
            _menuPairings[tables[t].id] = { menuId: menu.id, strategy: 'prev-group' };
            claimed[tables[t].id] = true;
            console.log(LOG, '  pair (A)', menu.id, '→', tables[t].id);
            break;
          }
        }
      }
    }

    // Explicit overrides always win
    for (var key in MENU_MAP) {
      if (MENU_MAP.hasOwnProperty(key)) {
        _menuPairings[key] = { menuId: MENU_MAP[key], strategy: 'config' };
        console.log(LOG, '  pair (cfg)', MENU_MAP[key], '→', key);
      }
    }

    console.log(LOG, 'Pairings:', JSON.stringify(_menuPairings));
  }

  // ══════════════════════════════════════════════════════════════
  // KNACK MODEL EXTRACTION — cold-load fallback for empty menus
  // ══════════════════════════════════════════════════════════════

  function extractMenuLinksFromKnack(menuViewId) {
    if (!window.Knack || !Knack.views) return null;
    var kv = Knack.views[menuViewId];
    if (!kv) return null;

    if (!modelInspected[menuViewId]) {
      modelInspected[menuViewId] = true;
      try {
        console.log(LOG, '  [model-inspect] Knack.views[' + menuViewId + '] keys:',
          Object.keys(kv).join(', '));
        if (kv.model && kv.model.view) {
          console.log(LOG, '  [model-inspect] .model.view:',
            JSON.stringify(kv.model.view).substring(0, 1000));
        }
      } catch (e) { /* ignore */ }
    }

    var candidates = [
      kv.model && kv.model.view && kv.model.view.links,
      kv.model && kv.model.view && kv.model.view.menu,
      kv.model && kv.model.view && kv.model.view.menu_links,
      kv.model && kv.model.attributes && kv.model.attributes.links,
      kv.model && kv.model.attributes && kv.model.attributes.menu,
      kv.model && kv.model.attributes && kv.model.attributes.menu_links,
      kv.options && kv.options.links,
    ];

    for (var ci = 0; ci < candidates.length; ci++) {
      var raw = candidates[ci];
      if (Array.isArray(raw) && raw.length) {
        var links = [];
        for (var li = 0; li < raw.length; li++) {
          var item = raw[li];
          var text = item.name || item.label || item.text || item.title || '';
          var href = '';
          if (item.scene) {
            var s = item.scene;
            href = '#' + (typeof s === 'object' ? (s.slug || s.key || '') : s);
          } else if (item.scene_key) {
            href = '#' + item.scene_key;
          }
          href = href || item.url || item.href || '';
          if (text.trim()) links.push({ text: text.trim(), href: href });
        }
        if (links.length) return links;
      }
    }

    // Try HTML stored in model
    var htmlSrc = (kv.model && kv.model.attributes && kv.model.attributes.html)
               || (kv.model && kv.model.attributes && kv.model.attributes.source)
               || null;
    if (typeof htmlSrc === 'string' && htmlSrc.length > 10) {
      var tmp = document.createElement('div');
      tmp.innerHTML = htmlSrc;
      var anchors = tmp.querySelectorAll('a');
      if (anchors.length) {
        var hlinks = [];
        for (var hi = 0; hi < anchors.length; hi++) {
          var ht = (anchors[hi].textContent || '').trim();
          var hh = anchors[hi].getAttribute('href') || '';
          if (ht) hlinks.push({ text: ht, href: hh });
        }
        if (hlinks.length) return hlinks;
      }
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // WIDTH EQUALIZATION
  // ══════════════════════════════════════════════════════════════

  function equalizeWidths() {
    var pills = document.querySelectorAll('.scw-acc-count');
    var maxPillW = 0;
    var i;
    for (i = 0; i < pills.length; i++) pills[i].style.minWidth = '';
    for (i = 0; i < pills.length; i++) {
      if (pills[i].offsetParent === null) continue;
      var pw = pills[i].getBoundingClientRect().width;
      if (pw > maxPillW) maxPillW = pw;
    }
    if (maxPillW > 0) {
      var pillW = Math.ceil(maxPillW) + 'px';
      for (i = 0; i < pills.length; i++) {
        if (pills[i].offsetParent !== null) pills[i].style.minWidth = pillW;
      }
    }

    var btns = document.querySelectorAll('.scw-acc-action-btn');
    var maxBtnW = 0;
    for (i = 0; i < btns.length; i++) btns[i].style.minWidth = '';
    for (i = 0; i < btns.length; i++) {
      if (btns[i].offsetParent === null) continue;
      var bw = btns[i].getBoundingClientRect().width;
      if (bw > maxBtnW) maxBtnW = bw;
    }
    if (maxBtnW > 0) {
      var halfMax = Math.ceil(maxBtnW / 2) + 'px';
      var fullMax = Math.ceil(maxBtnW) + 'px';
      var containers = document.querySelectorAll('.scw-acc-actions');
      for (var c = 0; c < containers.length; c++) {
        var cBtns = containers[c].querySelectorAll('.scw-acc-action-btn');
        if (cBtns.length === 1) {
          cBtns[0].style.minWidth = fullMax;
        } else if (cBtns.length === 2) {
          for (var b = 0; b < cBtns.length; b++) cBtns[b].style.minWidth = halfMax;
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ENHANCE — inject buttons using the pre-computed pairing map
  // ══════════════════════════════════════════════════════════════

  function enhance() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion');
    console.log(LOG, 'enhance() — found', accordions.length, 'accordion(s)',
      '| pairings:', Object.keys(_menuPairings).length);

    var injected = 0;
    var skipped = { noHeader: 0, alreadyInjected: 0, noPairing: 0, noMenuEl: 0,
                    menuHidden: 0, emptyMenu: 0 };

    for (var i = 0; i < accordions.length; i++) {
      try {
        var accordion = accordions[i];
        var header = accordion.querySelector('.scw-ktl-accordion__header');
        if (!header) { skipped.noHeader++; continue; }
        if (header.hasAttribute(INJECTED)) { skipped.alreadyInjected++; continue; }

        // Find the inner view — the table/list that KTL wrapped
        var innerView = accordion.querySelector('[id^="view_"]');
        var innerViewId = innerView ? innerView.id : null;

        // Look up pre-computed pairing
        var pairing = innerViewId ? _menuPairings[innerViewId] : null;
        if (!pairing) { skipped.noPairing++; continue; }

        var menuView = document.getElementById(pairing.menuId);
        if (!menuView) { skipped.noMenuEl++; continue; }
        if (menuView.classList.contains(HIDDEN_CLASS)) { skipped.menuHidden++; continue; }

        // ── Collect action links from DOM ──
        var domLinks = menuView.querySelectorAll('a');
        var actionLinks = [];
        for (var j = 0; j < domLinks.length; j++) {
          var text = (domLinks[j].textContent || '').trim();
          if (text) actionLinks.push({ text: text, index: j });
        }

        var useModelData = false;
        var modelLinks = null;

        if (!actionLinks.length) {
          modelLinks = extractMenuLinksFromKnack(menuView.id);
          if (modelLinks && modelLinks.length) {
            useModelData = true;
            console.log(LOG, '  accordion', innerViewId,
              '→ menu', menuView.id, 'via', pairing.strategy,
              '— using', modelLinks.length, 'link(s) from model');
          } else {
            skipped.emptyMenu++;
            continue;
          }
        } else {
          console.log(LOG, '  accordion', innerViewId,
            '→ menu', menuView.id, 'via', pairing.strategy,
            '— injecting', actionLinks.length, 'button(s)');
        }

        // ── Build button container ──
        var container = document.createElement('div');
        container.className = 'scw-acc-actions';
        container.setAttribute(MENU_SRC, menuView.id);

        var buttonDefs = useModelData
          ? modelLinks.map(function (ml, idx) {
              return { text: ml.text, index: idx, href: ml.href, fromModel: true };
            })
          : actionLinks.map(function (al) {
              return { text: al.text, index: al.index, href: '', fromModel: false };
            });

        for (var k = 0; k < buttonDefs.length; k++) {
          var def = buttonDefs[k];
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'scw-acc-action-btn';
          btn.setAttribute('data-menu-view', menuView.id);
          btn.setAttribute('data-link-index', String(def.index));

          if (def.fromModel) {
            btn.setAttribute('data-link-text', def.text);
            btn.setAttribute('data-link-href', def.href);
            btn.setAttribute('data-source', 'model');
          }

          if (/^(add|bulk add|new)\b/i.test(def.text)) {
            var iconSpan = document.createElement('span');
            iconSpan.innerHTML = PLUS_SVG;
            btn.appendChild(iconSpan);
          }

          btn.appendChild(document.createTextNode(def.text));

          btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            var menuId = this.getAttribute('data-menu-view');
            var isModel = this.getAttribute('data-source') === 'model';
            var menu = document.getElementById(menuId);

            if (menu) {
              var targets = menu.querySelectorAll('a');
              if (isModel) {
                var linkText = this.getAttribute('data-link-text');
                for (var t = 0; t < targets.length; t++) {
                  if ((targets[t].textContent || '').trim() === linkText) {
                    targets[t].click();
                    return;
                  }
                }
              } else {
                var linkIdx = parseInt(this.getAttribute('data-link-index'), 10);
                if (targets[linkIdx]) {
                  targets[linkIdx].click();
                  return;
                }
              }
            }

            var href = this.getAttribute('data-link-href');
            if (href) {
              window.location.hash = href;
              return;
            }

            console.warn(LOG, 'Click: no DOM link and no href for button');
          });

          container.appendChild(btn);
        }

        // Insert: icon | title | [buttons] | count | chevron
        var chevron = header.querySelector('.scw-acc-chevron');
        var countPill = header.querySelector('.scw-acc-count');
        if (chevron) {
          header.insertBefore(container, chevron);
          if (countPill) header.insertBefore(countPill, chevron);
        } else {
          header.appendChild(container);
        }

        menuView.classList.add(HIDDEN_CLASS);
        header.setAttribute(INJECTED, '1');
        injected++;
      } catch (err) {
        console.error(LOG, 'Error processing accordion [' + i + ']:', err);
      }
    }

    console.log(LOG, 'enhance() done — injected:', injected,
      '| skipped:', JSON.stringify(skipped));

    requestAnimationFrame(equalizeWidths);
  }

  // ══════════════════════════════════════════════════════════════
  // MUTATION OBSERVER — reacts to KTL accordion creation
  // ══════════════════════════════════════════════════════════════

  function startAccordionObserver(root) {
    if (_sceneObserver) _sceneObserver.disconnect();

    _sceneObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.classList.contains('scw-ktl-accordion') ||
              (node.querySelector && node.querySelector('.scw-ktl-accordion'))) {
            scheduleEnhance(50);
            return; // one trigger is enough
          }
        }
      }
    });

    _sceneObserver.observe(root, { childList: true, subtree: true });
  }

  // ══════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ══════════════════════════════════════════════════════════════

  injectStyles();

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function (event, scene) {
      var sceneId = scene && scene.key ? scene.key : '(unknown)';
      console.log(LOG, 'scene-render', sceneId);
      modelInspected = {};

      // Build pairings from pristine DOM (before KTL reshuffles)
      discoverMenuPairings();

      // Watch for .scw-ktl-accordion elements being created
      var root = document.getElementById('kn-' + sceneId) || document.body;
      startAccordionObserver(root);

      // First pass + safety-net fallback
      scheduleEnhance(200);
      setTimeout(enhance, 3000);
    });

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      scheduleEnhance(200);
    });

  $(document).ready(function () {
    console.log(LOG, 'document.ready — initial discovery');
    discoverMenuPairings();
    startAccordionObserver(document.body);
    scheduleEnhance(500);
    setTimeout(enhance, 3000);
  });

})();
/*** END FEATURE: Accordion Menu Button Injection ********************************/
