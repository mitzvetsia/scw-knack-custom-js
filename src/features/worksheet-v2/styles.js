/*** WORKSHEET V2 — STYLES ****************************************************
 *
 * All v2 CSS is scoped under `.scw-ws-v2` so it can't bleed into the
 * v1 worksheet rendering of the same view. Lifts the visual tokens
 * from _design-tokens.js but keeps its own class namespace.
 *
 * Banner-style WIP indicator at the top of every v2 panel so the user
 * (and we) can tell v2 from v1 at a glance.
 ****************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-ws-v2-css';
  if (document.getElementById(STYLE_ID)) return;

  var css = [
    /* ── Container ──────────────────────────────────────────── */
    '.scw-ws-v2 {',
    '  margin: 24px 0;',
    '  padding: 0;',
    '  background: var(--scw-surface-base, #fff);',
    '  border: 2px dashed #c084fc;', /* purple — visually distinct from v1 */
    '  border-radius: 8px;',
    '  overflow: hidden;',
    '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
    '  color: var(--scw-text-default, #1f2937);',
    '}',

    /* ── WIP banner ─────────────────────────────────────────── */
    '.scw-ws-v2-banner {',
    '  display: flex; align-items: center; gap: 10px;',
    '  padding: 8px 14px;',
    '  background: #faf5ff;',  /* purple-50 */
    '  border-bottom: 1px solid #e9d5ff;',  /* purple-200 */
    '  font-weight: 600; color: #6b21a8;', /* purple-800 */
    '}',
    '.scw-ws-v2-banner .scw-ws-v2-pill {',
    '  display: inline-block;',
    '  padding: 2px 8px;',
    '  background: #6b21a8; color: #fff;',
    '  border-radius: 4px;',
    '  font-size: 10px; font-weight: 700; letter-spacing: 0.04em;',
    '  text-transform: uppercase;',
    '}',
    '.scw-ws-v2-banner .scw-ws-v2-count {',
    '  margin-left: auto;',
    '  font-weight: 500; color: #4b5563;',
    '  font-variant-numeric: tabular-nums;',
    '}',

    /* ── Body / record list (Phase 0: dead-simple table) ──── */
    '.scw-ws-v2-body {',
    '  padding: 12px 14px;',
    '  max-height: 480px;',
    '  overflow: auto;',
    '}',
    '.scw-ws-v2-empty {',
    '  padding: 20px;',
    '  text-align: center;',
    '  color: #6b7280;',
    '  font-style: italic;',
    '}',
    '.scw-ws-v2-table {',
    '  width: 100%;',
    '  border-collapse: collapse;',
    '}',
    '.scw-ws-v2-table th,',
    '.scw-ws-v2-table td {',
    '  padding: 6px 10px;',
    '  border-bottom: 1px solid var(--scw-border-subtle, #e2e8f0);',
    '  text-align: left;',
    '  vertical-align: top;',
    '}',
    '.scw-ws-v2-table th {',
    '  position: sticky; top: 0;',
    '  background: var(--scw-surface-subtle, #f8fafc);',
    '  font-weight: 700;',
    '  color: var(--scw-text-default, #1f2937);',
    '  z-index: 1;',
    '}',
    '.scw-ws-v2-table tr:hover td {',
    '  background: var(--scw-surface-muted, #f1f5f9);',
    '}',
    '.scw-ws-v2-table td.scw-ws-v2-label {',
    '  font-weight: 600; color: #07467c;',
    '  white-space: nowrap;',
    '}',
    '.scw-ws-v2-table td.scw-ws-v2-num {',
    '  text-align: right;',
    '  font-variant-numeric: tabular-nums;',
    '}'
  ].join('\n');

  var s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
})();
/*** END WORKSHEET V2 — STYLES ************************************************/
