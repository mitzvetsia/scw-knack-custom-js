/*** WORKSHEET V2 — STYLES ****************************************************
 *
 * Phase 3.A — compact horizontal-row layout. Each card is a single
 * grid row with fixed/flex columns:
 *
 *   [label fixed] [product flex] [qty fixed] [rate fixed] [ext fixed]
 *     [notes flex] [chevron fixed]
 *
 * All v2 CSS scoped under `.scw-ws-v2` AND uses !important on the
 * structural rules — Knack's scene-level styles target generic tags
 * (div, input, textarea, button) aggressively and would otherwise
 * collapse the layout.
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
    '  padding: 0 !important;',
    '  max-height: 680px !important;',
    '  overflow: auto !important;',
    '  display: block !important;',
    '}',
    '.scw-ws-v2-empty {',
    '  padding: 20px !important;',
    '  text-align: center !important;',
    '  color: #6b7280 !important;',
    '  font-style: italic !important;',
    '}',

    /* ── Card (row container) ───────────────────────────────── */
    '.scw-ws-v2-card {',
    '  display: block !important;',
    '  border-bottom: 1px solid var(--scw-border-subtle, #e2e8f0) !important;',
    '  background: #fff !important;',
    '  transition: background-color 100ms ease !important;',
    '}',
    '.scw-ws-v2-card:hover {',
    '  background: var(--scw-surface-subtle, #f8fafc) !important;',
    '}',
    /* Alternating zebra to help scan long lists */
    '.scw-ws-v2-card:nth-child(even) {',
    '  background: #fafbfc !important;',
    '}',
    '.scw-ws-v2-card:nth-child(even):hover {',
    '  background: var(--scw-surface-muted, #f1f5f9) !important;',
    '}',

    /* ── Row grid ───────────────────────────────────────────── */
    /* Columns sized for a typical SOW line item:
       label (60px) · product (flex) · qty (70px) · rate (80px) ·
       ext (90px) · notes (flex 1.4) · chevron (28px) */
    '.scw-ws-v2-row {',
    '  display: grid !important;',
    '  grid-template-columns: 64px minmax(120px, 1fr) 72px 84px 90px minmax(160px, 1.4fr) 32px !important;',
    '  gap: 8px !important;',
    '  align-items: center !important;',
    '  padding: 4px 12px !important;',
    '  min-height: 40px !important;',
    '}',

    /* Mobile / narrow viewports — wrap notes to next line */
    '@media (max-width: 860px) {',
    '  .scw-ws-v2-row {',
    '    grid-template-columns: 64px 1fr 70px 80px 80px 32px !important;',
    '    grid-template-areas:',
    '      "label product qty rate ext chevron"',
    '      "notes notes notes notes notes notes" !important;',
    '  }',
    '  .scw-ws-v2-cell--label   { grid-area: label !important; }',
    '  .scw-ws-v2-cell--product { grid-area: product !important; }',
    '  .scw-ws-v2-cell--notes   { grid-area: notes !important; padding-top: 4px !important; }',
    '}',

    /* ── Cells ──────────────────────────────────────────────── */
    '.scw-ws-v2-cell {',
    '  display: block !important;',
    '  min-width: 0 !important;', /* allows ellipsis on flex children */
    '  font-size: 13px !important;',
    '  line-height: 1.3 !important;',
    '}',

    '.scw-ws-v2-cell--label {',
    '  font-weight: 700 !important;',
    '  color: #07467c !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '  white-space: nowrap !important;',
    '  overflow: hidden !important;',
    '  text-overflow: ellipsis !important;',
    '}',

    '.scw-ws-v2-cell--product {',
    '  color: var(--scw-text-default, #1f2937) !important;',
    '  white-space: nowrap !important;',
    '  overflow: hidden !important;',
    '  text-overflow: ellipsis !important;',
    '}',

    '.scw-ws-v2-cell--num,',
    '.scw-ws-v2-cell--ext {',
    '  text-align: right !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '}',

    '.scw-ws-v2-cell--ext {',
    '  font-weight: 600 !important;',
    '  color: #07467c !important;',
    '  padding: 5px 8px !important;', /* match input vertical rhythm */
    '}',

    /* ── Inputs ─────────────────────────────────────────────── */
    '.scw-ws-v2-input {',
    '  display: block !important;',
    '  width: 100% !important;',
    '  box-sizing: border-box !important;',
    '  padding: 4px 6px !important;',
    '  border: 1px solid transparent !important;', /* hide chrome until hover/focus — looks like v1's inline cells */
    '  border-radius: 3px !important;',
    '  background: transparent !important;',
    '  font: inherit !important;',
    '  color: var(--scw-text-default, #1f2937) !important;',
    '  min-height: 26px !important;',
    '  transition: border-color 100ms ease, background-color 100ms ease, box-shadow 100ms ease !important;',
    '}',
    '.scw-ws-v2-card:hover .scw-ws-v2-input {',
    '  border-color: var(--scw-border-subtle, #e2e8f0) !important;',
    '  background: #fff !important;',
    '}',
    '.scw-ws-v2-input:focus {',
    '  outline: none !important;',
    '  border-color: #93c5fd !important;',
    '  background: #fff !important;',
    '  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25) !important;',
    '}',

    '.scw-ws-v2-input--num {',
    '  text-align: right !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '}',

    '.scw-ws-v2-input--notes {',
    '  white-space: nowrap !important;',
    '  overflow: hidden !important;',
    '  text-overflow: ellipsis !important;',
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

    /* ── L1 group block (MDF/IDF accordion) ─────────────────── */
    '.scw-ws-v2-l1 {',
    '  display: block !important;',
    '  border-bottom: 1px solid var(--scw-border-default, #cbd5e1) !important;',
    '}',
    '.scw-ws-v2-l1:last-child {',
    '  border-bottom: 0 !important;',
    '}',

    /* L1 header — button styled to look like a v1 accordion header */
    '.scw-ws-v2-l1-head {',
    '  display: flex !important;',
    '  align-items: center !important;',
    '  gap: 10px !important;',
    '  width: 100% !important;',
    '  padding: 8px 14px !important;',
    '  background: linear-gradient(180deg, #0f4c75 0%, #07467c 100%) !important;',
    '  color: #fff !important;',
    '  border: 0 !important;',
    '  border-left: 4px solid #ed8326 !important;', /* orange L1 accent — matches v1 */
    '  font: 700 13px/1 system-ui, -apple-system, sans-serif !important;',
    '  letter-spacing: 0.02em !important;',
    '  text-align: left !important;',
    '  cursor: pointer !important;',
    '  transition: background 120ms ease !important;',
    '}',
    '.scw-ws-v2-l1-head:hover {',
    '  background: linear-gradient(180deg, #07467c 0%, #053659 100%) !important;',
    '}',
    '.scw-ws-v2-l1-head--synthetic {',
    /* Slate accent for synthetic groups (Project Wide Services etc.) */
    '  background: linear-gradient(180deg, #5f6b7a 0%, #475569 100%) !important;',
    '  border-left-color: #94a3b8 !important;',
    '}',
    '.scw-ws-v2-l1-head--synthetic:hover {',
    '  background: linear-gradient(180deg, #475569 0%, #334155 100%) !important;',
    '}',
    '.scw-ws-v2-l1-chevron {',
    '  display: inline-flex !important;',
    '  align-items: center !important;',
    '  justify-content: center !important;',
    '  width: 16px !important; height: 16px !important;',
    '  flex: 0 0 auto !important;',
    '  transition: transform 150ms ease !important;',
    '}',
    '.scw-ws-v2-l1-head--open .scw-ws-v2-l1-chevron {',
    '  transform: rotate(180deg) !important;',
    '}',
    '.scw-ws-v2-l1-label {',
    '  flex: 1 1 auto !important;',
    '  white-space: nowrap !important;',
    '  overflow: hidden !important;',
    '  text-overflow: ellipsis !important;',
    '}',
    '.scw-ws-v2-l1-count {',
    '  flex: 0 0 auto !important;',
    '  padding: 2px 8px !important;',
    '  background: rgba(255, 255, 255, 0.18) !important;',
    '  border-radius: 10px !important;',
    '  font-size: 11px !important;',
    '  font-weight: 700 !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '  min-width: 22px !important;',
    '  text-align: center !important;',
    '}',

    /* L1 body — collapsed by default; opens via .scw-ws-v2-l1--open */
    '.scw-ws-v2-l1-body {',
    '  display: none !important;',
    '  background: #fff !important;',
    '}',
    '.scw-ws-v2-l1--open .scw-ws-v2-l1-body {',
    '  display: block !important;',
    '}',

    /* ── L2 sub-header (proposal bucket) ────────────────────── */
    '.scw-ws-v2-l2-head {',
    '  display: flex !important;',
    '  align-items: center !important;',
    '  gap: 8px !important;',
    '  padding: 4px 14px !important;',
    '  background: #f8fafc !important;',
    '  border-top: 1px solid var(--scw-border-subtle, #e2e8f0) !important;',
    '  border-bottom: 1px solid var(--scw-border-subtle, #e2e8f0) !important;',
    '  font: 700 11px/1.2 system-ui, -apple-system, sans-serif !important;',
    '  color: #0f4c75 !important;',
    '  text-transform: uppercase !important;',
    '  letter-spacing: 0.06em !important;',
    '}',
    '.scw-ws-v2-l1-body > .scw-ws-v2-l2-head:first-child {',
    '  border-top: 0 !important;',
    '}',
    '.scw-ws-v2-l2-label {',
    '  flex: 1 1 auto !important;',
    '  white-space: nowrap !important;',
    '  overflow: hidden !important;',
    '  text-overflow: ellipsis !important;',
    '}',
    '.scw-ws-v2-l2-count {',
    '  flex: 0 0 auto !important;',
    '  color: var(--scw-text-caption, #64748b) !important;',
    '  font-weight: 500 !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '}',

    /* ── Chevron ────────────────────────────────────────────── */
    '.scw-ws-v2-chevron {',
    '  display: inline-flex !important;',
    '  align-items: center !important;',
    '  justify-content: center !important;',
    '  width: 24px !important;',
    '  height: 24px !important;',
    '  padding: 0 !important;',
    '  margin: 0 !important;',
    '  border: 0 !important;',
    '  background: transparent !important;',
    '  color: var(--scw-text-caption, #64748b) !important;',
    '  cursor: pointer !important;',
    '  border-radius: 4px !important;',
    '  transition: transform 150ms ease, background-color 100ms ease !important;',
    '}',
    '.scw-ws-v2-chevron:hover {',
    '  background: var(--scw-surface-muted, #f1f5f9) !important;',
    '  color: #07467c !important;',
    '}',
    '.scw-ws-v2-card--open .scw-ws-v2-chevron {',
    '  transform: rotate(90deg) !important;',
    '}'
  ].join('\n');

  var s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = css;
  document.head.appendChild(s);
})();
/*** END WORKSHEET V2 — STYLES ************************************************/
