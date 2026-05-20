/*** WORKSHEET V2 — STYLES ****************************************************
 *
 * All v2 CSS is scoped under `.scw-ws-v2` AND uses !important on the
 * structural rules. Knack injects scene-level styles that aggressively
 * target generic tags (div, input, textarea, label) — without
 * !important on the layout primitives, v2 cards collapsed to zero
 * height because Knack's display/padding/width rules won.
 *
 * Visual is intentionally distinct from v1 (purple dashed border,
 * "V2 PREVIEW" pill) so we can tell which UI we're looking at at a
 * glance during the parallel build.
 ****************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-ws-v2-css';
  if (document.getElementById(STYLE_ID)) return;

  var css = [
    /* ── Container ──────────────────────────────────────────── */
    '.scw-ws-v2 {',
    '  margin: 24px 0 !important;',
    '  padding: 0 !important;',
    '  background: var(--scw-surface-base, #fff) !important;',
    '  border: 2px dashed #c084fc !important;',
    '  border-radius: 8px !important;',
    '  overflow: hidden !important;',
    '  font: 13px/1.4 system-ui, -apple-system, sans-serif !important;',
    '  color: var(--scw-text-default, #1f2937) !important;',
    '  display: block !important;',
    '  box-sizing: border-box !important;',
    '}',
    '.scw-ws-v2 * { box-sizing: border-box; }',

    /* ── WIP banner ─────────────────────────────────────────── */
    '.scw-ws-v2-banner {',
    '  display: flex !important; align-items: center !important; gap: 10px !important;',
    '  padding: 8px 14px !important;',
    '  background: #faf5ff !important;',
    '  border-bottom: 1px solid #e9d5ff !important;',
    '  font-weight: 600 !important; color: #6b21a8 !important;',
    '}',
    '.scw-ws-v2-banner .scw-ws-v2-pill {',
    '  display: inline-block !important;',
    '  padding: 2px 8px !important;',
    '  background: #6b21a8 !important; color: #fff !important;',
    '  border-radius: 4px !important;',
    '  font-size: 10px !important; font-weight: 700 !important; letter-spacing: 0.04em !important;',
    '  text-transform: uppercase !important;',
    '}',
    '.scw-ws-v2-banner .scw-ws-v2-count {',
    '  margin-left: auto !important;',
    '  font-weight: 500 !important; color: #4b5563 !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '}',

    /* ── Body / card list ───────────────────────────────────── */
    '.scw-ws-v2-body {',
    '  padding: 10px 12px !important;',
    '  max-height: 560px !important;',
    '  overflow: auto !important;',
    '  display: flex !important; flex-direction: column !important; gap: 6px !important;',
    '}',
    '.scw-ws-v2-empty {',
    '  padding: 20px !important;',
    '  text-align: center !important;',
    '  color: #6b7280 !important;',
    '  font-style: italic !important;',
    '}',

    /* ── Card ───────────────────────────────────────────────── */
    '.scw-ws-v2-card {',
    '  display: block !important;',
    '  border: 1px solid var(--scw-border-subtle, #e2e8f0) !important;',
    '  border-radius: 6px !important;',
    '  background: #fff !important;',
    '  overflow: hidden !important;',
    '  min-height: 60px !important;', /* safety net: visible even if internal sizing fails */
    '  flex-shrink: 0 !important;',  /* don't collapse under flex parent */
    '}',
    '.scw-ws-v2-card-header {',
    '  display: flex !important; align-items: baseline !important; gap: 10px !important;',
    '  padding: 6px 12px !important;',
    '  background: var(--scw-surface-subtle, #f8fafc) !important;',
    '  border-bottom: 1px solid var(--scw-border-subtle, #e2e8f0) !important;',
    '  font-size: 13px !important;',
    '  min-height: 24px !important;',
    '}',
    '.scw-ws-v2-card-label {',
    '  display: inline-block !important;',
    '  font-weight: 700 !important;',
    '  color: #07467c !important;',
    '  min-width: 60px !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '}',
    '.scw-ws-v2-card-product {',
    '  display: inline-block !important;',
    '  flex: 1 1 auto !important;',
    '  color: var(--scw-text-default, #1f2937) !important;',
    '  overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important;',
    '}',

    /* ── Field row ──────────────────────────────────────────── */
    '.scw-ws-v2-card-fields {',
    '  display: grid !important;',
    '  grid-template-columns: 90px 100px 100px 1fr !important;',
    '  gap: 8px !important;',
    '  padding: 8px 12px !important;',
    '  align-items: start !important;',
    '  min-height: 36px !important;',
    '}',
    '@media (max-width: 760px) {',
    '  .scw-ws-v2-card-fields {',
    '    grid-template-columns: 1fr 1fr !important;',
    '  }',
    '  .scw-ws-v2-field--notes { grid-column: 1 / -1 !important; }',
    '}',
    '.scw-ws-v2-field {',
    '  display: flex !important; flex-direction: column !important; gap: 2px !important;',
    '  margin: 0 !important;',
    '  padding: 0 !important;',
    '}',
    '.scw-ws-v2-field-label {',
    '  display: block !important;',
    '  font-size: 10px !important; font-weight: 700 !important;',
    '  letter-spacing: 0.05em !important;',
    '  text-transform: uppercase !important;',
    '  color: var(--scw-text-caption, #64748b) !important;',
    '  margin: 0 !important;',
    '}',

    /* ── Inputs ─────────────────────────────────────────────── */
    '.scw-ws-v2-input {',
    '  display: block !important;',
    '  width: 100% !important; box-sizing: border-box !important;',
    '  padding: 5px 8px !important;',
    '  border: 1px solid var(--scw-border-default, #cbd5e1) !important;',
    '  border-radius: 4px !important;',
    '  background: #fff !important;',
    '  font: inherit !important;',
    '  color: var(--scw-text-default, #1f2937) !important;',
    '  min-height: 28px !important;',
    '  transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease !important;',
    '}',
    '.scw-ws-v2-input:focus {',
    '  outline: none !important;',
    '  border-color: #93c5fd !important;',
    '  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25) !important;',
    '}',
    '.scw-ws-v2-input--num {',
    '  text-align: right !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '}',
    '.scw-ws-v2-input--notes {',
    '  resize: vertical !important;',
    '  min-height: 28px !important;',
    '  max-height: 200px !important;',
    '}',

    /* ── Save state flashes ─────────────────────────────────── */
    '.scw-ws-v2-input--saving {',
    '  background-color: #dcfce7 !important;',
    '  border-color: #4ade80 !important;',
    '}',
    '.scw-ws-v2-input--error {',
    '  background-color: #fef2f2 !important;',
    '  border-color: #fca5a5 !important;',
    '  box-shadow: 0 0 0 2px rgba(252, 165, 165, 0.25) !important;',
    '}',

    /* ── Read-only display ──────────────────────────────────── */
    '.scw-ws-v2-display {',
    '  display: block !important;',
    '  padding: 5px 8px !important;',
    '  border: 1px solid transparent !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '  text-align: right !important;',
    '  color: var(--scw-text-default, #1f2937) !important;',
    '  min-height: 28px !important;',
    '}'
  ].join('\n');

  var s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
})();
/*** END WORKSHEET V2 — STYLES ************************************************/
