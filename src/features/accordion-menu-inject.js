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
 *   Pattern A -- menu in a preceding view-group:
 *
 *     <div class="view-group">
 *       <div class="kn-view kn-rich_text">    (optional -- left visible)
 *       <div class="kn-view kn-menu">         (hidden after injection)
 *     </div>
 *     <div class="view-group">
 *       <div class="scw-ktl-accordion">       (enhanced accordion)
 *     </div>
 *
 *   Pattern B -- menu is an immediate sibling in the same group:
 *
 *     <div class="view-group">
 *       <div class="kn-view kn-menu">         (hidden after injection)
 *       <div class="scw-ktl-accordion">       (enhanced accordion)
 *     </div>
 *
 * On cold page loads Knack often renders the kn-menu DOM element but
 * never populates it with link content.  When the DOM is empty, this
 * feature falls back to reading the menu link definitions from
 * Knack.views[viewId].model (the internal Backbone model).
 *
 * Button clicks proxy to the original (hidden) links so all Knack
 * event handlers are preserved.  For model-derived buttons whose DOM
 * links are not yet available, clicks fall back to hash navigation.
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

      /* Individual action button -- solid accent fill so they pop */
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
        !prevGroup.querySelector('.scw-ktl-accordion') &&
        !prevGroup.querySelector('.ktlHideShowView')) {
      var menu = prevGroup.querySelector('.kn-view.kn-menu');
      if (menu) return { menu: menu, strategy: 'prev-group' };
    }
    return null;
  }

  // ── Knack model extraction for cold-load fallback ───

  /** Track which menu models have already been logged (avoid repeat dumps) */
  var modelInspected = {};

  /**
   * Attempt to extract menu link definitions from Knack's internal
   * Backbone view model.  On cold page loads, the kn-menu DOM elements
   * exist but are empty; Knack.views[viewId].model still holds the
   * view definition with link metadata.
   *
   * Returns Array<{text:string, href:string}> or null.
   */
  function extractMenuLinksFromKnack(menuViewId) {
    if (!window.Knack || !Knack.views) return null;
    var kv = Knack.views[menuViewId];
    if (!kv) {
      console.log(LOG, '  [model] Knack.views[' + menuViewId + '] not found');
      return null;
    }

    // ── Diagnostic: deep-log the model structure (once per view) ──
    if (!modelInspected[menuViewId]) {
      modelInspected[menuViewId] = true;
      try {
        console.log(LOG, '  [model-inspect] Knack.views[' + menuViewId + '] keys:',
          Object.keys(kv).join(', '));

        if (kv.model) {
          console.log(LOG, '  [model-inspect] .model keys:',
            Object.keys(kv.model).join(', '));

          if (kv.model.view) {
            console.log(LOG, '  [model-inspect] .model.view:',
              JSON.stringify(kv.model.view).substring(0, 1000));
          }

          if (kv.model.attributes) {
            var ak = Object.keys(kv.model.attributes);
            console.log(LOG, '  [model-inspect] .model.attributes keys:', ak.join(', '));
            for (var a = 0; a < ak.length; a++) {
              var val = kv.model.attributes[ak[a]];
              var str = (typeof val === 'object' && val !== null)
                ? JSON.stringify(val).substring(0, 500)
                : String(val == null ? 'null' : val).substring(0, 500);
              console.log(LOG, '  [model-inspect]   .' + ak[a] + ' =', str);
            }
          }
        }

        if (kv.options) {
          console.log(LOG, '  [model-inspect] .options:',
            JSON.stringify(kv.options).substring(0, 500));
        }
      } catch (logErr) {
        console.warn(LOG, '  [model-inspect] Error:', logErr);
      }
    }

    // ── Search multiple paths for link data ──
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
        console.log(LOG, '  [model-extract] Found link array (candidate #' + ci +
          '), count:', raw.length);
        var links = [];
        for (var li = 0; li < raw.length; li++) {
          var item = raw[li];
          console.log(LOG, '  [model-extract]   [' + li + ']:',
            JSON.stringify(item).substring(0, 300));

          var text = item.name || item.label || item.text || item.title || '';
          var href = '';

          // Build href from scene/page data
          if (item.scene) {
            var s = item.scene;
            href = '#' + (typeof s === 'object' ? (s.slug || s.key || '') : s);
          } else if (item.scene_key) {
            href = '#' + item.scene_key;
          }
          href = href || item.url || item.href || '';

          if (text.trim()) {
            links.push({ text: text.trim(), href: href });
          }
        }
        if (links.length) return links;
      }
    }

    // ── Try HTML source stored in the model ──
    var htmlSrc = (kv.model && kv.model.attributes && kv.model.attributes.html)
               || (kv.model && kv.model.attributes && kv.model.attributes.source)
               || null;
    if (typeof htmlSrc === 'string' && htmlSrc.length > 10) {
      console.log(LOG, '  [model-extract] Trying HTML source, length:', htmlSrc.length);
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
        if (hlinks.length) {
          console.log(LOG, '  [model-extract] Extracted', hlinks.length,
            'link(s) from HTML source');
          return hlinks;
        }
      }
    }

    console.warn(LOG, '  [model-extract] No link data found for', menuViewId);
    return null;
  }

  // ── Detect and inject ───────────────────────────────

  function enhance() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion');
    console.log(LOG, 'enhance() — found', accordions.length, 'accordion(s)');

    var injected = 0;
    var skipped = { noHeader: 0, alreadyInjected: 0, noMenu: 0, menuHidden: 0, emptyMenu: 0 };

    for (var i = 0; i < accordions.length; i++) {
      var accordion = accordions[i];
      var header = accordion.querySelector('.scw-ktl-accordion__header');
      if (!header) { skipped.noHeader++; continue; }
      if (header.hasAttribute(INJECTED)) { skipped.alreadyInjected++; continue; }

      var accViewId = accordion.closest('[id^="view_"]');
      accViewId = accViewId ? accViewId.id : '(unknown)';

      var result = findMenuForAccordion(accordion);
      if (!result) { skipped.noMenu++; continue; }

      var menuView = result.menu;
      var strategy = result.strategy;

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

      // ── If DOM is empty, try Knack's internal model ──
      if (!actionLinks.length) {
        modelLinks = extractMenuLinksFromKnack(menuView.id);
        if (modelLinks && modelLinks.length) {
          useModelData = true;
          console.log(LOG, '  accordion', accViewId,
            '-> menu', menuView.id, 'via', strategy,
            '-- using', modelLinks.length, 'link(s) from Knack model');
        } else {
          skipped.emptyMenu++;
          console.warn(LOG, '  accordion', accViewId,
            '-> menu', menuView.id, 'via', strategy,
            '-- empty DOM AND no model data');
          continue;
        }
      } else {
        console.log(LOG, '  accordion', accViewId,
          '-> menu', menuView.id, 'via', strategy,
          '-- injecting', actionLinks.length, 'button(s) from DOM');
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

        // Prefix a "+" icon for Add / New / Bulk Add buttons
        if (/^(add|bulk add|new)\b/i.test(def.text)) {
          var iconSpan = document.createElement('span');
          iconSpan.innerHTML = PLUS_SVG;
          btn.appendChild(iconSpan);
        }

        btn.appendChild(document.createTextNode(def.text));

        // Click handler — tries DOM link first, falls back to hash navigation
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          var menuId = this.getAttribute('data-menu-view');
          var isModel = this.getAttribute('data-source') === 'model';
          var menu = document.getElementById(menuId);

          // Strategy 1: click the actual DOM link (works always for DOM-derived
          // buttons, and works for model-derived if menu was rendered since)
          if (menu) {
            var targets = menu.querySelectorAll('a');

            if (isModel) {
              // Match by text for model-derived buttons (more reliable than index)
              var linkText = this.getAttribute('data-link-text');
              for (var t = 0; t < targets.length; t++) {
                if ((targets[t].textContent || '').trim() === linkText) {
                  console.log(LOG, 'Click: matched DOM link for "' + linkText + '"');
                  targets[t].click();
                  return;
                }
              }
            } else {
              // Match by index for DOM-derived buttons
              var linkIdx = parseInt(this.getAttribute('data-link-index'), 10);
              if (targets[linkIdx]) {
                targets[linkIdx].click();
                return;
              }
            }
          }

          // Strategy 2: hash navigation fallback for model-derived buttons
          var href = this.getAttribute('data-link-href');
          if (href) {
            console.log(LOG, 'Click: hash navigation to "' + href + '"');
            window.location.hash = href;
            return;
          }

          console.warn(LOG, 'Click: no DOM link and no href for button');
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
  }

  // ── Lifecycle ───────────────────────────────────────

  injectStyles();

  // Run after accordion enhancement (which uses 80ms delay)
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function (event, scene) {
      var sceneId = scene && scene.key ? scene.key : '(unknown)';
      console.log(LOG, 'knack-scene-render.any — scene:', sceneId);
      // Reset model inspection log for fresh scene
      modelInspected = {};
      setTimeout(enhance, 200);
    });

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view) {
      setTimeout(enhance, 200);
    });

  // Initial pass
  $(document).ready(function () {
    console.log(LOG, 'document.ready — scheduling initial enhance() in 500ms');
    setTimeout(enhance, 500);
  });

})();
/*** END FEATURE: Accordion Menu Button Injection ********************************/
