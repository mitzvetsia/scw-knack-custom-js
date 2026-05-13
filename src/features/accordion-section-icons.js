/*** FEATURE: KTL accordion section icons + slim padding *********************
 *
 * The closeout / deploy scene stacks 5-7 accordions that all use the
 * same folder icon, making the page read as undifferentiated rows of
 * "thing-folder thing-folder thing-folder."  This feature swaps in
 * semantic icons keyed off each accordion's title text:
 *
 *   Acceptance       → clipboard-check
 *   Closeout         → check-circle
 *   What we're       → camera
 *   installing
 *   Manage MDFs/IDFs → server
 *   Additional       → image
 *   Photos
 *   Other Files      → paperclip
 *
 * Also tightens the per-row padding (min-height 44 → 36, padding
 * 14px → 10px top/bottom) so the page feels calmer.
 *
 * Critical safety: workflow-stepper.js applies its own classes
 * (.scw-step-completed, .scw-step-disabled, .scw-step-current, ...)
 * to the SAME .scw-ktl-accordion wrappers on the sales scene.  We
 * skip any accordion that carries a `scw-step-*` class — those are
 * stepper-controlled and the stepper paints its own icons (checkmark,
 * lock, spinner).  Matching the previous tier-styling regression
 * post-mortem: if it has a stepper class, hands off.
 ******************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-acc-section-css';
  var MARK     = 'scw-acc-section';

  // Match patterns are case-insensitive substrings against the visible
  // accordion title (`<span class="scw-acc-title">`).  First match wins,
  // so order from most-specific to least-specific.
  var SECTIONS = [
    { match: /closeout/i,                     icon: 'checkCircle' },
    { match: /\bacceptance\b/i,               icon: 'clipboardCheck' },
    { match: /what.?s? we.?re installing|deploy worksheet|install/i, icon: 'camera' },
    { match: /(manage )?(mdfs?\s*\/?\s*idfs?|mdf|idf)/i,             icon: 'server' },
    { match: /(additional )?photos?/i,        icon: 'image' },
    { match: /(other )?files?|attachments?/i, icon: 'paperclip' }
  ];

  // ── SVG factories — Lucide-style, 16x16, currentColor stroke ──────
  function svg(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" ' +
           'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
           inner + '</svg>';
  }
  var ICONS = {
    clipboardCheck: svg(
      '<rect x="8" y="2" width="8" height="4" rx="1"/>' +
      '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
      '<path d="m9 14 2 2 4-4"/>'
    ),
    checkCircle: svg(
      '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
      '<polyline points="22 4 12 14.01 9 11.01"/>'
    ),
    camera: svg(
      '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>' +
      '<circle cx="12" cy="13" r="3"/>'
    ),
    server: svg(
      '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>' +
      '<rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>' +
      '<line x1="6" y1="6" x2="6.01" y2="6"/>' +
      '<line x1="6" y1="18" x2="6.01" y2="18"/>'
    ),
    image: svg(
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' +
      '<circle cx="8.5" cy="8.5" r="1.5"/>' +
      '<polyline points="21 15 16 10 5 21"/>'
    ),
    paperclip: svg(
      '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'
    )
  };

  // ── Classification helpers ─────────────────────────────────────────
  // Skip any accordion that the workflow-stepper has claimed — its
  // own icons (checkmark, lock, spinner) override ours and we don't
  // want to fight the stepper's icon-state cycle.
  function isStepperStep(acc) {
    for (var i = 0; i < acc.classList.length; i++) {
      if (acc.classList[i].indexOf('scw-step-') === 0) return true;
    }
    return false;
  }

  function findIcon(titleText) {
    var t = (titleText || '').trim();
    if (!t) return null;
    for (var i = 0; i < SECTIONS.length; i++) {
      if (SECTIONS[i].match.test(t)) return ICONS[SECTIONS[i].icon];
    }
    return null;
  }

  // ── Apply ──────────────────────────────────────────────────────────
  function applyAll() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accordions.length; i++) {
      var acc = accordions[i];
      if (isStepperStep(acc)) continue;
      var titleEl = acc.querySelector('.scw-acc-title');
      var iconEl  = acc.querySelector('.scw-acc-icon');
      if (!titleEl || !iconEl) continue;
      var iconSvg = findIcon(titleEl.textContent);
      if (!iconSvg) continue;

      // Replace the folder svg with the semantic one. Track via data-attr
      // so we don't re-stamp identical svg over and over on every render.
      if (acc.getAttribute('data-scw-section-icon') !== iconSvg.length + '') {
        iconEl.innerHTML = iconSvg;
        acc.setAttribute('data-scw-section-icon', iconSvg.length + '');
      }
      acc.classList.add(MARK);
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      // Slim the header for section accordions.  Stepper-controlled
      // accordions keep the default ktl-accordion padding (44px) since
      // their action affordances need room.
      '.scw-ktl-accordion.' + MARK + ' .scw-ktl-accordion__header {',
      '  min-height: 36px;',
      '  padding: 10px 16px 10px 22px;',
      '}',
      // Slightly smaller title to match the tightened padding.
      '.scw-ktl-accordion.' + MARK + ' .scw-ktl-accordion__header .scw-acc-title {',
      '  font-size: 13px;',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Bindings ───────────────────────────────────────────────────────
  injectStyles();

  function schedule() {
    setTimeout(applyAll, 50);
    setTimeout(applyAll, 300);
  }
  $(document).on('knack-scene-render.any.scwSectionIcons', schedule);
  $(document).on('knack-view-render.any.scwSectionIcons',  schedule);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
})();
/*** END FEATURE: KTL accordion section icons + slim padding ******************/
