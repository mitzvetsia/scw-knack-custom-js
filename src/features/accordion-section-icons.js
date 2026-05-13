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
  // Order matters — more specific patterns must come before generic ones.
  // e.g. "Site Maps and Other Files" needs the site-maps rule to win
  // before the generic "other files" rule grabs it.
  var SECTIONS = [
    { match: /closeout/i,                     icon: 'checkCircle' },
    { match: /\bacceptance\b/i,               icon: 'clipboardCheck' },
    { match: /alternative sows?/i,            icon: 'clipboardCheck' },
    { match: /what.?s? we.?re installing|deploy worksheet|\binstall\b/i, icon: 'wrench' },
    { match: /(scope of work|sow) line items?/i, icon: 'wrench' },
    { match: /(manage )?(mdfs?\s*\/?\s*idfs?|mdf|idf)/i,             icon: 'server' },
    { match: /site maps/i,                    icon: 'paperclip' },
    { match: /(additional )?photos?/i,        icon: 'image' },
    { match: /licen[cs]e|recurring/i,         icon: 'repeat' },
    { match: /proposals?/i,                   icon: 'fileText' },
    { match: /(other )?files?|attachments?/i, icon: 'paperclip' }
  ];

  // Accordions to fully hide based on their title. Same stepper-safety
  // applies — we won't hide stepper-controlled accordions even if a
  // title happens to match. Patterns are case-insensitive substrings.
  var HIDE_TITLES = [
    /equipment summary/i
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
    // Lucide "wrench" — used for the install/deploy section so it
    // reads as "installation tool" rather than "photography".
    wrench: svg(
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'
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
    ),
    // Lucide "repeat" — recurring/subscription connotation for the
    // License / Recurring Services section.
    repeat: svg(
      '<polyline points="17 1 21 5 17 9"/>' +
      '<path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
      '<polyline points="7 23 3 19 7 15"/>' +
      '<path d="M21 13v2a4 4 0 0 1-4 4H3"/>'
    ),
    // Lucide "file-text" — proposal / quote document connotation.
    fileText: svg(
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/>' +
      '<line x1="16" y1="13" x2="8" y2="13"/>' +
      '<line x1="16" y1="17" x2="8" y2="17"/>' +
      '<polyline points="10 9 9 9 8 9"/>'
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

  function shouldHide(titleText) {
    var t = (titleText || '').trim();
    if (!t) return false;
    for (var i = 0; i < HIDE_TITLES.length; i++) {
      if (HIDE_TITLES[i].test(t)) return true;
    }
    return false;
  }

  // ── Apply ──────────────────────────────────────────────────────────
  function applyAll() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < accordions.length; i++) {
      var acc = accordions[i];
      if (isStepperStep(acc)) continue;
      var titleEl = acc.querySelector('.scw-acc-title');
      var iconEl  = acc.querySelector('.scw-acc-icon');
      if (!titleEl) continue;
      var titleText = titleEl.textContent;

      // Hide-by-title wins — no point stamping an icon on a hidden node.
      if (shouldHide(titleText)) {
        acc.style.display = 'none';
        continue;
      }

      if (!iconEl) continue;
      var iconSvg = findIcon(titleText);
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
      '}',
      // BID_revision line items grid is internal data plumbing — its
      // contents are already surfaced via the bid-review card UI, so
      // the raw Knack table just adds noise on the SOW details scene.
      // Not a KTL accordion, so title-matching wouldn\'t reach it.
      '#view_3837 { display: none !important; }'
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
