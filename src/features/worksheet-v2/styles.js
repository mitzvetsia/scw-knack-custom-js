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
    '  border: 2px dashed #c084fc;',
    '  border-radius: 8px;',
    '  overflow: hidden;',
    '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
    '  color: var(--scw-text-default, #1f2937);',
    '}',

    /* ── WIP banner ─────────────────────────────────────────── */
    '.scw-ws-v2-banner {',
    '  display: flex; align-items: center; gap: 10px;',
    '  padding: 8px 14px;',
    '  background: #faf5ff;',
    '  border-bottom: 1px solid #e9d5ff;',
    '  font-weight: 600; color: #6b21a8;',
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

    /* ── Body / card list ───────────────────────────────────── */
    '.scw-ws-v2-body {',
    '  padding: 10px 12px;',
    '  max-height: 560px;',
    '  overflow: auto;',
    '  display: flex; flex-direction: column; gap: 6px;',
    '}',
    '.scw-ws-v2-empty {',
    '  padding: 20px;',
    '  text-align: center;',
    '  color: #6b7280;',
    '  font-style: italic;',
    '}',

    /* ── Card ───────────────────────────────────────────────── */
    '.scw-ws-v2-card {',
    '  border: 1px solid var(--scw-border-subtle, #e2e8f0);',
    '  border-radius: 6px;',
    '  background: #fff;',
    '  overflow: hidden;',
    '  transition: border-color 120ms ease;',
    '}',
    '.scw-ws-v2-card:hover {',
    '  border-color: var(--scw-border-default, #cbd5e1);',
    '}',
    '.scw-ws-v2-card-header {',
    '  display: flex; align-items: baseline; gap: 10px;',
    '  padding: 6px 12px;',
    '  background: var(--scw-surface-subtle, #f8fafc);',
    '  border-bottom: 1px solid var(--scw-border-subtle, #e2e8f0);',
    '  font-size: 13px;',
    '}',
    '.scw-ws-v2-card-label {',
    '  font-weight: 700;',
    '  color: #07467c;',
    '  min-width: 60px;',
    '  font-variant-numeric: tabular-nums;',
    '}',
    '.scw-ws-v2-card-product {',
    '  flex: 1 1 auto;',
    '  color: var(--scw-text-default, #1f2937);',
    '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
    '}',

    /* ── Field row ──────────────────────────────────────────── */
    '.scw-ws-v2-card-fields {',
    '  display: grid;',
    '  grid-template-columns: 90px 100px 100px 1fr;',
    '  gap: 8px;',
    '  padding: 8px 12px;',
    '  align-items: start;',
    '}',
    '@media (max-width: 760px) {',
    '  .scw-ws-v2-card-fields {',
    '    grid-template-columns: 1fr 1fr;',
    '  }',
    '  .scw-ws-v2-field--notes { grid-column: 1 / -1; }',
    '}',
    '.scw-ws-v2-field {',
    '  display: flex; flex-direction: column; gap: 2px;',
    '}',
    '.scw-ws-v2-field-label {',
    '  font-size: 10px; font-weight: 700;',
    '  letter-spacing: 0.05em;',
    '  text-transform: uppercase;',
    '  color: var(--scw-text-caption, #64748b);',
    '}',

    /* ── Inputs ─────────────────────────────────────────────── */
    '.scw-ws-v2-input {',
    '  width: 100%; box-sizing: border-box;',
    '  padding: 5px 8px;',
    '  border: 1px solid var(--scw-border-default, #cbd5e1);',
    '  border-radius: 4px;',
    '  background: #fff;',
    '  font: inherit;',
    '  color: var(--scw-text-default, #1f2937);',
    '  transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;',
    '}',
    '.scw-ws-v2-input:focus {',
    '  outline: none;',
    '  border-color: #93c5fd;',
    '  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25);',
    '}',
    '.scw-ws-v2-input--num {',
    '  text-align: right;',
    '  font-variant-numeric: tabular-nums;',
    '}',
    '.scw-ws-v2-input--notes {',
    '  resize: vertical;',
    '  min-height: 28px;',
    '  max-height: 200px;',
    '}',

    /* ── Save state flashes ─────────────────────────────────── */
    '.scw-ws-v2-input--saving {',
    '  background-color: #dcfce7 !important;',
    '  border-color: #4ade80 !important;',
    '}',
    '.scw-ws-v2-input--error {',
    '  background-color: #fef2f2 !important;',
    '  border-color: #fca5a5 !important;',
    '  box-shadow: 0 0 0 2px rgba(252, 165, 165, 0.25);',
    '}',

    /* ── Read-only display ──────────────────────────────────── */
    '.scw-ws-v2-field--readonly {',
    '  /* no input — just shows a value */',
    '}',
    '.scw-ws-v2-display {',
    '  padding: 5px 8px;',
    '  border: 1px solid transparent;',
    '  font-variant-numeric: tabular-nums;',
    '  text-align: right;',
    '  color: var(--scw-text-default, #1f2937);',
    '}'
  ].join('\n');

  var s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
})();
/*** END WORKSHEET V2 — STYLES ************************************************/
