/*** FEATURE: SCW design tokens (palette + named L1 themes) ********************
 *
 * Single source of truth for the SCW visual system. Injects a :root
 * palette of CSS custom properties and a small set of named theme
 * presets that shadow specific tokens within an opted-in subtree.
 *
 * Why tokens, not hardcoded hexes:
 *   The codebase has ~40 feature files, many of which reproduce the
 *   same colours (slate-50 surfaces, navy summary headers, the orange
 *   L1 accent, the SCW-blue accordion accent). When a designer wants
 *   to retune the palette, hunting every hardcoded value is the
 *   bottleneck. Tokens collapse that to a single edit here.
 *
 * Why an attribute-driven theme layer:
 *   Known Issue #9 — the L1 group accent is wired into ~9 coupled CSS
 *   rules (background, border, hover, chevron, bridge to content rows,
 *   record-count badge). Per-view variation used to require either
 *   inline JS setProperty calls per row or a JS-generated CSS block.
 *   With named themes, swapping a view's L1 colour is a single
 *   attribute on the view container — no CSS edits anywhere.
 *
 * Adoption is incremental: features that haven't migrated yet still
 * work because every token has a hex value baked in by the cascade
 * at :root, identical to the values they used before.
 ******************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-design-tokens-css';
  if (document.getElementById(STYLE_ID)) return;

  var s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = [
    // ── Root palette ───────────────────────────────────────
    // Names are semantic, not literal ("text-default", not
    // "slate-800"). Hex values match what the codebase has been using
    // de-facto so adoption can be a one-line search-and-replace.
    ':root {',
    // Surfaces
    '  --scw-surface-base:   #ffffff;',
    '  --scw-surface-subtle: #f8fafc;', /* slate-50 — toolbar / summary panel bg */
    '  --scw-surface-muted:  #f1f5f9;', /* slate-100 — hover state */
    '  --scw-surface-strong: #0f4c75;', /* navy — summary table headers, totals */

    // Borders
    '  --scw-border-subtle:  #e2e8f0;',
    '  --scw-border-default: #cbd5e1;',
    '  --scw-border-strong:  #94a3b8;',

    // Text
    '  --scw-text-default:    #1e293b;',
    '  --scw-text-muted:      #64748b;',
    '  --scw-text-subtle:     #94a3b8;',
    '  --scw-text-on-accent:  #ffffff;',

    // Brand — the SCW blue used by the KTL accordion header accent.
    // Anything that wants to feel like a primary CTA or a brand surface
    // pulls from this triplet.
    '  --scw-accent:        #295F91;',
    '  --scw-accent-strong: #1f4a73;', /* hover */
    '  --scw-accent-deep:   #163654;', /* active / pressed */

    // Semantic — reserved for status. Per CLAUDE.md, never use red for
    // warnings (reserve red for errors / destructive actions); amber
    // is the warning colour everywhere. Each semantic role gets a
    // -strong variant for hover/active states, mirroring the brand
    // accent triplet.
    '  --scw-info:        #0891b2;', /* cyan — neutral info / SOW filter */
    '  --scw-info-strong: #0e7490;',
    '  --scw-success:     #16a34a;',
    '  --scw-warning:     #b45309;', /* amber */
    '  --scw-danger:      #b91c1c;',

    // L1 group accent — the colour painted on collapsible L1 group
    // headers (MDF/IDF rows on worksheet grids). Default is the
    // historical orange. Per-view themes below shadow these two values.
    '  --scw-grp-accent:     #ed8326;',
    '  --scw-grp-accent-rgb: 237, 131, 38;',
    '}',

    // ── Named L1 themes ────────────────────────────────────
    // Apply by setting data-scw-l1-theme="<name>" on a view container
    // (or any ancestor of the L1 rows). Themes only retone the two L1
    // tokens; the ~12 CSS rules in group-collapse.js that read
    // var(--scw-grp-accent[-rgb]) pick up the new colour automatically.
    //
    // Adding a new theme: append a block below with the desired
    // (hex, r,g,b) pair. Adding a new VIEW: edit VIEW_OVERRIDES in
    // group-collapse.js and use one of these names. Per-row dynamic
    // colours (e.g. HSV-extracted) still work — inline style="" on a
    // row beats the attribute selector by specificity.
    '[data-scw-l1-theme="sow-blue"] {',
    '  --scw-grp-accent:     #124E85;',
    '  --scw-grp-accent-rgb: 18, 78, 133;',
    '}',
    '[data-scw-l1-theme="slate"] {',
    '  --scw-grp-accent:     #5F6B7A;',
    '  --scw-grp-accent-rgb: 95, 107, 122;',
    '}',
    '[data-scw-l1-theme="scw-accent"] {',
    '  --scw-grp-accent:     #295F91;',
    '  --scw-grp-accent-rgb: 41, 95, 145;',
    '}'
  ].join('\n');
  document.head.appendChild(s);
})();
/*** END FEATURE: SCW design tokens *******************************************/
