/*** FEATURE: Accordion Menu Button Injection ************************************
 *
 * Injects kn-menu action links as pill-buttons into KTL accordion headers.
 *
 * ── How pairing works ────────────────────────────────────────────────────────
 *
 * Pairing is EXPLICIT, not proximity-based.  The table/form/list view that
 * lives inside an accordion must declare which menu to absorb via a KTL
 * keyword in its Knack view title or description:
 *
 *   _scwMenu=view_3777
 *
 * At enhance-time the code reads the keyword from KTL's pre-parsed cache
 * (window.ktlKeywords) or falls back to scraping the Knack model.  If the
 * keyword is absent the accordion gets no action buttons and nearby menus
 * remain visible and independent — safe by default.
 *
 * Multiple menus can be absorbed by a single accordion by comma-separating:
 *
 *   _scwMenu=view_3777,view_3482
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
  var KEYWORD = '_scwMenu';

  // ── Configuration: accordion view → menu view(s) ──
  // Primary lookup. Format: { innerViewId: 'menuViewId' }
  // Comma-separate for multiple: { innerViewId: 'view_A,view_B' }
  var MENU_MAP = {
    'view_3476': 'view_3777',           // Site Maps ← menu
    'view_3522': 'view_3482',           // Additional Photos ← menu
    'view_3602': 'view_3654',           // MDF & IDFs ← menu
    'view_3586': 'view_3450',           // SOW Line Items ← menu
    'view_3471': 'view_3787',           // Licenses ← menu
  };

  // ── State ──────────────────────────────────────────
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
  // Build pre-hide rules for every menu view in MENU_MAP. KTL renders
  // the menu's native buttons in their own view container before this
  // module gets a chance to absorb them — without these rules the user
  // sees the unstyled buttons flash for several hundred ms before they
  // disappear. A safety timer (revealUnabsorbed) clears the pre-hide
  // class if absorption hasn't completed within 5s, so a config error
  // can't strand the buttons offscreen.
  var PREHIDE_CLASS = 'scw-acc-menu-prehide';
  var PREHIDE_MS    = 5000;
  function getConfiguredMenuIds() {
    var ids = [];
    for (var innerKey in MENU_MAP) {
      if (!MENU_MAP.hasOwnProperty(innerKey)) continue;
      var raw = MENU_MAP[innerKey];
      if (!raw) continue;
      var parts = String(raw).split(',');
      for (var p = 0; p < parts.length; p++) {
        var id = parts[p].trim();
        if (id && ids.indexOf(id) === -1) ids.push(id);
      }
    }
    return ids;
  }
  function applyPreHideAttrs() {
    var ids = getConfiguredMenuIds();
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && !el.classList.contains(HIDDEN_CLASS)) {
        el.classList.add(PREHIDE_CLASS);
      }
    }
  }
  function revealUnabsorbed() {
    var els = document.querySelectorAll('.' + PREHIDE_CLASS);
    for (var i = 0; i < els.length; i++) els[i].classList.remove(PREHIDE_CLASS);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      '.' + HIDDEN_CLASS + ' { display: none !important; }',
      '.' + PREHIDE_CLASS + ' { display: none !important; }',

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
  // KEYWORD LOOKUP — reads _scwMenu from KTL keyword cache or
  // falls back to scraping the Knack view model description
  // ══════════════════════════════════════════════════════════════

  /**
   * Read _scwMenu keyword for a view.  Returns an array of menu view IDs
   * (e.g. ['view_3777']) or null if the keyword is not set.
   *
   * Lookup order:
   *   0. MENU_MAP hardcoded config           (most reliable)
   *   1. window.ktlKeywords[viewKey]._scwMenu  (KTL pre-parsed cache)
   *   2. Knack view model description / title   (raw text scrape)
   */
  function readMenuKeyword(viewKey) {
    // ── 0. Hardcoded config map ──
    if (MENU_MAP[viewKey]) {
      var ids0 = MENU_MAP[viewKey].split(',').map(function (s) { return s.trim(); })
                    .filter(function (s) { return /^view_\d+$/.test(s); });
      if (ids0.length) {
        SCW.debug(LOG, '  [keyword]', viewKey, KEYWORD, '=', ids0.join(','), '(config)');
        return ids0;
      }
    }

    // ── 1. KTL keyword cache ──
    // KTL may lowercase keyword names (e.g. _scwMenu → _scwmenu).
    // Check both the exact name and the lowercased version.
    try {
      var kw = window.ktlKeywords;
      var vkw = kw && kw[viewKey];
      var entries = vkw && (vkw[KEYWORD] || vkw[KEYWORD.toLowerCase()]);
      if (entries) {
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          var val;
          if (typeof entry === 'string') {
            val = entry;
          } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            var p = entry.params;
            if (Array.isArray(p) && p.length > 0) {
              val = Array.isArray(p[0]) ? p[0][0] : p[0];
            }
            if (!val && entry.paramStr) {
              val = entry.paramStr.replace(/^\[|\]$/g, '');
            }
          } else if (Array.isArray(entry)) {
            val = Array.isArray(entry[0]) ? entry[0][0] : entry[0];
          }
          if (val) {
            var ids = val.split(',').map(function (s) { return s.trim(); })
                        .filter(function (s) { return /^view_\d+$/.test(s); });
            if (ids.length) {
              SCW.debug(LOG, '  [keyword]', viewKey, KEYWORD, '=', ids.join(','), '(ktl cache)');
              return ids;
            }
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Debug: log what KTL actually has for this view so we can diagnose misses
    try {
      var kwDbg = window.ktlKeywords;
      if (kwDbg && kwDbg[viewKey]) {
        SCW.debug(LOG, '  [debug] ktlKeywords[' + viewKey + '] keys:',
          Object.keys(kwDbg[viewKey]).join(', '));
      } else {
        SCW.debug(LOG, '  [debug] ktlKeywords[' + viewKey + '] = (none)');
      }
    } catch (e) { /* ignore */ }

    // ── 2. Knack model fallback — scrape description / title ──
    try {
      var model = getViewModel(viewKey);
      if (model) {
        var attrs = model.attributes || model;
        var sources = [attrs.description, attrs.title, attrs.name];
        for (var s = 0; s < sources.length; s++) {
          if (typeof sources[s] !== 'string') continue;
          var match = sources[s].match(/_scwMenu=([^\s<]+)/i);
          if (match) {
            var ids2 = match[1].split(',').map(function (v) { return v.trim(); })
                          .filter(function (v) { return /^view_\d+$/.test(v); });
            if (ids2.length) {
              SCW.debug(LOG, '  [keyword]', viewKey, KEYWORD, '=', ids2.join(','), '(model scrape)');
              return ids2;
            }
          }
        }
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  /**
   * Find a Knack view model by view key.
   */
  function getViewModel(viewKey) {
    try {
      if (window.Knack && Knack.views && Knack.views[viewKey] && Knack.views[viewKey].model) {
        return Knack.views[viewKey].model;
      }
      var scene = Knack && Knack.router && Knack.router.scene_view;
      var collection = scene && scene.model && scene.model.views;
      if (!collection || !collection.models) return null;
      for (var i = 0; i < collection.models.length; i++) {
        var m = collection.models[i];
        if (m && m.attributes && m.attributes.key === viewKey) return m;
      }
    } catch (e) { /* ignore */ }
    return null;
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
        SCW.debug(LOG, '  [model-inspect] Knack.views[' + menuViewId + '] keys:',
          Object.keys(kv).join(', '));
        if (kv.model && kv.model.view) {
          SCW.debug(LOG, '  [model-inspect] .model.view:',
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
            var sc = item.scene;
            href = '#' + (typeof sc === 'object' ? (sc.slug || sc.key || '') : sc);
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
  // ENHANCE — inject buttons using _scwMenu keyword lookups
  // ══════════════════════════════════════════════════════════════

  function enhance() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion');
    SCW.debug(LOG, 'enhance() — found', accordions.length, 'accordion(s)');

    var injected = 0;
    var skipped = { noHeader: 0, alreadyInjected: 0, noKeyword: 0, noMenuEl: 0,
                    menuHidden: 0, emptyMenu: 0 };

    for (var i = 0; i < accordions.length; i++) {
      try {
        var accordion = accordions[i];
        var header = accordion.querySelector('.scw-ktl-accordion__header');
        if (!header) { skipped.noHeader++; continue; }
        if (header.hasAttribute(INJECTED)) { skipped.alreadyInjected++; continue; }

        // Find the inner view — the table/list/form that KTL wrapped
        var innerView = accordion.querySelector('[id^="view_"]');
        var innerViewId = innerView ? innerView.id : null;
        if (!innerViewId) { skipped.noKeyword++; continue; }

        // Read _scwMenu keyword for this view
        var menuIds = readMenuKeyword(innerViewId);
        if (!menuIds || !menuIds.length) { skipped.noKeyword++; continue; }

        // Collect links from all declared menus
        var allActionLinks = [];  // { text, index, menuViewId }
        var allModelLinks = [];   // { text, href, menuViewId }
        var menuElements = [];    // DOM elements to hide after injection

        for (var mi = 0; mi < menuIds.length; mi++) {
          var menuViewId = menuIds[mi];
          var menuView = document.getElementById(menuViewId);
          if (!menuView) { skipped.noMenuEl++; continue; }
          if (menuView.classList.contains(HIDDEN_CLASS)) { skipped.menuHidden++; continue; }

          // Try DOM links first
          var domLinks = menuView.querySelectorAll('a');
          var hasDOM = false;
          for (var j = 0; j < domLinks.length; j++) {
            var text = (domLinks[j].textContent || '').trim();
            if (text) {
              allActionLinks.push({ text: text, index: j, menuViewId: menuViewId });
              hasDOM = true;
            }
          }

          // Fall back to Knack model
          if (!hasDOM) {
            var modelLinks = extractMenuLinksFromKnack(menuViewId);
            if (modelLinks && modelLinks.length) {
              for (var ml = 0; ml < modelLinks.length; ml++) {
                allModelLinks.push({
                  text: modelLinks[ml].text, href: modelLinks[ml].href,
                  index: ml, menuViewId: menuViewId
                });
              }
              SCW.debug(LOG, '  accordion', innerViewId,
                '← menu', menuViewId, '— using', modelLinks.length, 'link(s) from model');
            }
          } else {
            SCW.debug(LOG, '  accordion', innerViewId,
              '← menu', menuViewId, '— injecting', domLinks.length, 'button(s) from DOM');
          }

          menuElements.push(menuView);
        }

        // Build combined button list
        var buttonDefs = [];
        for (var ai = 0; ai < allActionLinks.length; ai++) {
          buttonDefs.push({
            text: allActionLinks[ai].text,
            index: allActionLinks[ai].index,
            href: '',
            menuViewId: allActionLinks[ai].menuViewId,
            fromModel: false
          });
        }
        for (var mli = 0; mli < allModelLinks.length; mli++) {
          buttonDefs.push({
            text: allModelLinks[mli].text,
            index: allModelLinks[mli].index,
            href: allModelLinks[mli].href,
            menuViewId: allModelLinks[mli].menuViewId,
            fromModel: true
          });
        }

        if (!buttonDefs.length) { skipped.emptyMenu++; continue; }

        // ── Build button container ──
        var container = document.createElement('div');
        container.className = 'scw-acc-actions';
        container.setAttribute(MENU_SRC, menuIds.join(','));

        for (var k = 0; k < buttonDefs.length; k++) {
          var def = buttonDefs[k];
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'scw-acc-action-btn';
          btn.setAttribute('data-menu-view', def.menuViewId);
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

        // Hide absorbed menus
        for (var h = 0; h < menuElements.length; h++) {
          menuElements[h].classList.add(HIDDEN_CLASS);
        }
        header.setAttribute(INJECTED, '1');
        injected++;
      } catch (err) {
        console.error(LOG, 'Error processing accordion [' + i + ']:', err);
      }
    }

    SCW.debug(LOG, 'enhance() done — injected:', injected,
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

  // Per-scene pre-hide safety timer. Cleared on each scene render so
  // an accordion that legitimately took longer than usual to render
  // doesn't get reveal-then-re-hide flicker.
  var _preHideSafety = null;

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function (event, scene) {
      var sceneId = scene && scene.key ? scene.key : '(unknown)';
      SCW.debug(LOG, 'scene-render', sceneId);
      modelInspected = {};

      // Watch for .scw-ktl-accordion elements being created
      var root = document.getElementById('kn-' + sceneId) || document.body;
      startAccordionObserver(root);

      // Pre-hide configured menu views as soon as they exist in the
      // DOM so KTL's native buttons never paint before we absorb them.
      applyPreHideAttrs();
      if (_preHideSafety) clearTimeout(_preHideSafety);
      _preHideSafety = setTimeout(revealUnabsorbed, PREHIDE_MS);

      // First pass + safety-net fallback
      scheduleEnhance(200);
      setTimeout(enhance, 3000);
    });

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view) {
      // Re-apply pre-hide every render — covers the case where the
      // menu view renders later than scene-render fired (e.g. its
      // data fetch was slow) and wasn't in the DOM at scene-render time.
      applyPreHideAttrs();
      scheduleEnhance(200);
    });

  $(document).ready(function () {
    SCW.debug(LOG, 'document.ready — initial enhance');
    startAccordionObserver(document.body);
    applyPreHideAttrs();
    if (_preHideSafety) clearTimeout(_preHideSafety);
    _preHideSafety = setTimeout(revealUnabsorbed, PREHIDE_MS);
    scheduleEnhance(500);
    setTimeout(enhance, 3000);
  });

})();
/*** END FEATURE: Accordion Menu Button Injection ********************************/
