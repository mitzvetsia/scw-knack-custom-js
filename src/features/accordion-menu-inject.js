/*** FEATURE: Accordion Menu Button Injection ************************************
 *
 * Scans for kn-menu views in the view-group immediately preceding an
 * accordion's view-group and injects their action buttons into the
 * accordion header as solid accent-colored pill buttons.  Only the
 * kn-menu view itself is hidden; sibling views (rich_text titles,
 * etc.) in the same view-group are left visible.
 *
 * Pattern detected (throughout the app):
 *
 *   <div class="view-group">
 *     <div class="kn-view kn-rich_text">    (optional — left visible)
 *     <div class="kn-view kn-menu">         (hidden after injection)
 *   </div>
 *   <div class="view-group">
 *     <div class="scw-ktl-accordion">       (enhanced accordion)
 *       <div class="scw-ktl-accordion__header">
 *         icon | title | count | [injected buttons] | chevron
 *       </div>
 *       ...
 *     </div>
 *   </div>
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

  // ── Detect and inject ───────────────────────────────

  function enhance() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion');

    for (var i = 0; i < accordions.length; i++) {
      var accordion = accordions[i];
      var header = accordion.querySelector('.scw-ktl-accordion__header');
      if (!header || header.hasAttribute(INJECTED)) continue;

      // Walk up to the parent view-group
      var viewGroup = accordion.parentElement;
      while (viewGroup && !viewGroup.classList.contains('view-group')) {
        viewGroup = viewGroup.parentElement;
      }
      if (!viewGroup) continue;

      // Check the immediately preceding sibling view-group
      var prevGroup = viewGroup.previousElementSibling;
      if (!prevGroup || !prevGroup.classList.contains('view-group')) continue;

      // Look for a kn-menu view in the previous group
      var menuView = prevGroup.querySelector('.kn-view.kn-menu');
      if (!menuView) continue;

      // Collect action links
      var links = menuView.querySelectorAll('a');
      var actionLinks = [];
      for (var j = 0; j < links.length; j++) {
        var text = (links[j].textContent || '').trim();
        if (text) actionLinks.push({ text: text, index: j });
      }
      if (!actionLinks.length) continue;

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

      // Insert before chevron in the header
      var chevron = header.querySelector('.scw-acc-chevron');
      if (chevron) {
        header.insertBefore(container, chevron);
      } else {
        header.appendChild(container);
      }

      // Hide only the kn-menu view (preserve rich_text titles, etc.)
      menuView.classList.add(HIDDEN_CLASS);

      // Mark this accordion header as processed
      header.setAttribute(INJECTED, '1');
    }
  }

  // ── Lifecycle ───────────────────────────────────────

  injectStyles();

  // Run after accordion enhancement (which uses 80ms delay)
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      setTimeout(enhance, 200);
    });

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      setTimeout(enhance, 200);
    });

  // Initial pass
  $(document).ready(function () {
    setTimeout(enhance, 500);
  });

})();
/*** END FEATURE: Accordion Menu Button Injection ********************************/
