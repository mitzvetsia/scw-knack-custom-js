/*** DEVICE WORKSHEET — L1 ACCORDION COMPARISON-GRID STYLE ***/
/**
 * Scoped CSS override for view_3610 only that restyles its L1 (MDF/IDF)
 * group headers to match the bid-review comparison grid's accordion
 * look — flat slate background, solid #295f91 left accent border, no
 * per-row coloured tint.
 *
 * Implementation is CSS-only and uses higher specificity than
 * group-collapse.js's rules so the per-row --scw-grp-accent tint is
 * neutralised inside view_3610. Other views still get the tinted
 * accent style — this file changes nothing outside view_3610.
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-ws-l1-comparison-style-css';

  if (document.getElementById(STYLE_ID)) return;

  var css = [
    /* L1 default state — flat slate, solid blue left accent. */
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header {',
    '  background: #f1f5f9 !important;',
    '  color: #334155 !important;',
    '  font-weight: 700 !important;',
    '  font-size: 13px !important;',
    '}',
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header > td {',
    '  background: #f1f5f9 !important;',
    '  color: #334155 !important;',
    '  border-left: 4px solid #295f91 !important;',
    '  border-bottom: 1px solid #cbd5e1 !important;',
    '  padding: 10px 14px 10px 12px !important;',
    '}',
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header > td * {',
    '  color: #334155 !important;',
    '}',

    /* Hover — same step as comparison grid (#e8edf3). */
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header:hover {',
    '  background: #e8edf3 !important;',
    '}',
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header:hover > td {',
    '  background: #e8edf3 !important;',
    '}',

    /* Expanded — no font-size jump, no extra tint, keep it calm. */
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) {',
    '  background: #f1f5f9 !important;',
    '  font-size: 13px !important;',
    '}',
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) > td {',
    '  padding: 10px 14px 10px 12px !important;',
    '  border-bottom: 1px solid #cbd5e1 !important;',
    '}',

    /* Bridge: kill the accent-coloured left border that group-collapse
       inherits onto content rows beneath an expanded L1 — replace with
       a transparent column so the cards sit flush. */
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) + tr:not(.kn-table-group) > td:first-child {',
    '  border-left: 4px solid transparent !important;',
    '}',
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) + tr:not(.kn-table-group) .scw-ws-card {',
    '  border-top-color: #e2e8f0 !important;',
    '}',

    /* Collapsed — slightly lighter bottom border. */
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed > td {',
    '  border-bottom: 1px solid #cbd5e1 !important;',
    '}',

    /* Chevron color → match comparison grid accent. */
    '#view_3610 .kn-table-group.kn-group-level-1.scw-group-header .scw-collapse-icon {',
    '  color: #295f91 !important;',
    '}'
  ].join('\n');

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*** END DEVICE WORKSHEET — L1 ACCORDION COMPARISON-GRID STYLE ***/
