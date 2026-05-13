/*** FEATURE: KTL accordion tier styling *************************************
 *
 * The closeout / deploy / build-SOW pages stack 5-7 visually-identical
 * KTL accordions on top of each other.  They serve TWO different
 * purposes that the eye can't currently distinguish:
 *
 *   Tier 1 — Workflow phases the user must move through in order:
 *            Acceptance, What We're Installing, Closeout, etc.
 *
 *   Tier 2 — Content / file containers that sit alongside the workflow:
 *            Manage MDFs/IDFs, Additional Photos, Other Files, etc.
 *
 * Both used the same accordion chrome, so the page reads as "six rows
 * of folder" with no information hierarchy.  This feature classifies
 * each accordion by its title text and applies a tier class so the
 * cascade can differentiate them visually:
 *
 *   - Tier 1 gets a chunkier header, a numbered prefix matching its
 *     position in the workflow sequence (1 / 2 / 3), and the accent
 *     stripe stays prominent.
 *   - Tier 2 gets a slimmer header, muted accent, no number.
 *
 * Title matching is case-insensitive substring on the visible accordion
 * title (`<span class="scw-acc-title">`).  Add to TIER_1 / TIER_2 below
 * to opt new sections in.  Anything that doesn't match either stays at
 * the existing default styling — no change.
 *****************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-acc-tier-css';
  var NS       = '.scwAccTier';

  // Order matters for TIER_1: matched-index becomes the workflow step
  // number displayed in the title (1, 2, 3, ...).  Each line is a
  // case-insensitive substring match on the visible accordion title.
  var TIER_1 = [
    // Build SOW / proposal workflow
    'project playbook',
    'request site survey',
    'review site survey',
    'build proposal',
    // Deploy / install workflow
    'acceptance',
    "what we're installing",
    'closeout'
  ];

  // Tier 2: content / supporting material.  Order doesn't matter — no
  // numbering applied.
  var TIER_2 = [
    'manage mdfs / idfs',
    'manage mdfs',
    'additional photos',
    'other files',
    'project files'
  ];

  // ── Styles ─────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      // ── Tier 1: workflow phase — chunkier, numbered, prominent ────
      // The header gets more vertical breathing room and a slightly
      // larger title.  Accent stripe widens from 6px → 8px to read as a
      // heavier "this is a step in your flow" cue.
      '.scw-ktl-accordion.scw-acc-tier-1 > .scw-ktl-accordion__header {',
      '  min-height: 52px;',
      '  padding: 18px 18px 18px 26px;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-1 > .scw-ktl-accordion__header::before {',
      '  width: 8px;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-1 > .scw-ktl-accordion__header .scw-acc-title {',
      '  font-size: 15px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.02em;',
      '}',
      // Numbered prefix — small circle with the step number, sits in
      // place of the folder icon.
      '.scw-ktl-accordion.scw-acc-tier-1 > .scw-ktl-accordion__header .scw-acc-icon {',
      '  position: relative;',
      '  width: 32px; height: 32px;',
      '  margin-right: 10px;',
      '  opacity: 1;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-1 > .scw-ktl-accordion__header .scw-acc-tier-num {',
      '  display: inline-flex;',
      '  align-items: center; justify-content: center;',
      '  width: 26px; height: 26px;',
      '  border-radius: 999px;',
      '  background: rgba(var(--scw-accent-rgb), 0.16);',
      '  color: rgb(var(--scw-accent-rgb));',
      '  border: 1.5px solid rgba(var(--scw-accent-rgb), 0.55);',
      '  font: 700 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;',
      '}',
      // Hide the original folder svg when the number badge is showing.
      '.scw-ktl-accordion.scw-acc-tier-1 .scw-acc-icon > svg {',
      '  display: none;',
      '}',

      // ── Tier 2: content / supporting — slimmer, muted ─────────────
      // Less padding, lighter title, muted accent stripe (50% opacity).
      // Folder icon stays but smaller and de-emphasized.  Reads as
      // "supporting material" not "do this now".
      '.scw-ktl-accordion.scw-acc-tier-2 > .scw-ktl-accordion__header {',
      '  min-height: 36px;',
      '  padding: 10px 16px 10px 22px;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-2 > .scw-ktl-accordion__header::before {',
      '  width: 4px;',
      '  opacity: 0.45;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-2 > .scw-ktl-accordion__header .scw-acc-title {',
      '  font-size: 12.5px;',
      '  font-weight: 500;',
      '  color: #475569;',
      '  text-transform: none;',
      '  letter-spacing: 0;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-2 > .scw-ktl-accordion__header .scw-acc-icon {',
      '  width: 18px;',
      '  opacity: 0.5;',
      '  margin-right: 6px;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-2 > .scw-ktl-accordion__header .scw-acc-icon svg {',
      '  width: 14px; height: 14px;',
      '}',
      '.scw-ktl-accordion.scw-acc-tier-2 > .scw-ktl-accordion__header .scw-acc-count {',
      '  padding: 2px 8px;',
      '  font-size: 11px;',
      '  background: rgba(var(--scw-accent-rgb), 0.06);',
      '  border-color: rgba(var(--scw-accent-rgb), 0.14);',
      '  color: rgba(var(--scw-accent-rgb), 0.85);',
      '}',
      // Reduce wrapper margins so tier-2 items sit tighter together,
      // visually separating them from the chunkier tier-1 cards above.
      '.scw-ktl-accordion.scw-acc-tier-2 {',
      '  margin: 4px 0;',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Classification helpers ─────────────────────────────────────────
  function normalize(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // Returns { tier: 1|2, stepIndex?: number } or null if no match.
  function classify(titleText) {
    var t = normalize(titleText);
    if (!t) return null;
    for (var i = 0; i < TIER_1.length; i++) {
      if (t.indexOf(TIER_1[i]) !== -1) return { tier: 1, stepIndex: i };
    }
    for (var j = 0; j < TIER_2.length; j++) {
      if (t.indexOf(TIER_2[j]) !== -1) return { tier: 2 };
    }
    return null;
  }

  // Step numbers are derived PER-PAGE, not from the global TIER_1
  // index — otherwise "Closeout" on the deploy page would be step 7
  // (after Build-SOW's items).  Within a single page render, we walk
  // the matched tier-1 accordions in DOM order and assign 1/2/3...
  function applyTierClasses() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion');
    var tier1OnPage = [];
    for (var i = 0; i < accordions.length; i++) {
      var acc = accordions[i];
      var titleEl = acc.querySelector('.scw-acc-title');
      if (!titleEl) continue;
      var c = classify(titleEl.textContent);
      if (!c) continue;
      if (c.tier === 1) {
        acc.classList.remove('scw-acc-tier-2');
        acc.classList.add('scw-acc-tier-1');
        tier1OnPage.push(acc);
      } else {
        acc.classList.remove('scw-acc-tier-1');
        acc.classList.add('scw-acc-tier-2');
        // Tier 2 doesn't need step numbering; leave folder icon alone.
      }
    }

    // Number the tier-1 sequence in DOM order.
    for (var k = 0; k < tier1OnPage.length; k++) {
      var hdr = tier1OnPage[k].querySelector('.scw-ktl-accordion__header');
      if (!hdr) continue;
      var iconBox = hdr.querySelector('.scw-acc-icon');
      if (!iconBox) continue;
      var numEl = iconBox.querySelector('.scw-acc-tier-num');
      if (!numEl) {
        numEl = document.createElement('span');
        numEl.className = 'scw-acc-tier-num';
        iconBox.appendChild(numEl);
      }
      numEl.textContent = String(k + 1);
    }
  }

  // ── Bindings ───────────────────────────────────────────────────────
  injectStyles();

  // Run on every scene + view render so newly-injected accordions get
  // classified. applyTierClasses is idempotent — repeated calls just
  // re-set the same classes / number text.
  function schedule() {
    setTimeout(applyTierClasses, 50);
    setTimeout(applyTierClasses, 300);
  }
  $(document).on('knack-scene-render.any' + NS, schedule);
  $(document).on('knack-view-render.any'  + NS, schedule);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule);
  } else {
    schedule();
  }
})();
/*** END FEATURE: KTL accordion tier styling *********************************/
