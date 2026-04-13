/*** BID REVIEW — STYLES ***/
/**
 * Injects all CSS for the Bid Review Matrix.
 * Guarded by a unique style-element ID to prevent duplicates.
 *
 * Reads : SCW.bidReview.CONFIG.cssId
 * Writes: SCW.bidReview.injectStyles()
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  ns.injectStyles = function injectStyles() {
    if (document.getElementById(CFG.cssId)) return;

    var css = [

      /* ── container ─────────────────────────────────────────── */
      '.scw-bid-review {',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif;',
      '  color: #1e293b;',
      '  overflow-x: auto;',
      '  -webkit-overflow-scrolling: touch;',
      '  padding: 12px 16px 8px;',
      '  margin: 0 12px;',
      '}',

      /* ── SOW sections ────────────────────────────────────────── */
      '.scw-bid-review__sow-section {',
      '  margin-bottom: 24px;',
      '  border: 1px solid #e2e8f0;',
      '  border-radius: 6px;',
      '  overflow: hidden;',
      '}',

      '.scw-bid-review__sow-title {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 10px;',
      '  padding: 10px 12px;',
      '  background: #1e293b;',
      '  color: #fff;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  -webkit-user-select: none;',
      '}',

      '.scw-bid-review__sow-title:hover {',
      '  background: #334155;',
      '}',

      '.scw-bid-review__sow-chevron {',
      '  display: inline-flex;',
      '  transition: transform .2s ease;',
      '}',

      '.scw-bid-review__sow-section--collapsed .scw-bid-review__sow-chevron {',
      '  transform: rotate(-90deg);',
      '}',

      '.scw-bid-review__sow-body {',
      '  overflow: hidden;',
      '}',

      '.scw-bid-review__sow-section--collapsed .scw-bid-review__sow-body {',
      '  display: none;',
      '}',

      '.scw-bid-review__sow-title-text {',
      '  font-size: 14px;',
      '  font-weight: 700;',
      '}',

      '.scw-bid-review__sow-title-count {',
      '  font-size: 11px;',
      '  font-weight: 400;',
      '  color: #94a3b8;',
      '}',

      /* ── table ─────────────────────────────────────────────── */
      '.scw-bid-review__table {',
      '  width: 100%;',
      '  border-collapse: collapse;',
      '  table-layout: fixed;',
      '  min-width: 700px;',
      '}',

      /* ── header row ────────────────────────────────────────── */
      '.scw-bid-review__header-row th {',
      '  position: sticky;',
      '  top: 0;',
      '  z-index: 2;',
      '  background: #f8fafc;',
      '  border-bottom: 2px solid #cbd5e1;',
      '  padding: 10px 8px;',
      '  text-align: left;',
      '  vertical-align: top;',
      '  font-weight: 600;',
      '  font-size: 13px;',
      '}',

      '.scw-bid-review__sow-header {',
      '  width: 120px;',
      '  min-width: 90px;',
      '}',

      /* SOW detail and bid columns share equal width */
      '.scw-bid-review__sow-detail-header,',
      '.scw-bid-review__pkg-header {',
      '}',

      '.scw-bid-review__actions-header {',
      '  width: 150px;',
      '  min-width: 120px;',
      '}',

      /* ── package column header ─────────────────────────────── */

      '.scw-bid-review__pkg-name {',
      '  font-size: 14px;',
      '  font-weight: 700;',
      '  color: #0f172a;',
      '  margin-bottom: 4px;',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '}',

      '.scw-bid-review__pdf-link {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  color: #dc2626;',
      '  opacity: .7;',
      '  transition: opacity 150ms ease;',
      '  flex-shrink: 0;',
      '}',
      '.scw-bid-review__pdf-link:hover { opacity: 1; }',
      '.scw-bid-review__pdf-link svg { display: block; width: 20px; height: 20px; }',

      '.scw-bid-review__pkg-counts {',
      '  font-size: 11px;',
      '  font-weight: 400;',
      '  color: #64748b;',
      '  margin-bottom: 6px;',
      '}',

      '.scw-bid-review__pkg-actions {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 3px;',
      '}',

      /* ── buttons ───────────────────────────────────────────── */
      '.scw-bid-review__btn {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 4px 8px;',
      '  border: none;',
      '  border-radius: 4px;',
      '  font: 600 11px/1.2 system-ui, sans-serif;',
      '  cursor: pointer;',
      '  transition: opacity .15s, filter .15s;',
      '  white-space: nowrap;',
      '}',

      '.scw-bid-review__btn:hover {',
      '  filter: brightness(0.92);',
      '}',

      '.scw-bid-review__btn--adopt {',
      '  background: #16a34a;',
      '  color: #fff;',
      '}',

      '.scw-bid-review__btn--create {',
      '  background: #2563eb;',
      '  color: #fff;',
      '}',

      '.scw-bid-review__btn--combo {',
      '  background: #7c3aed;',
      '  color: #fff;',
      '}',

      '.scw-bid-review__btn--skip {',
      '  background: #e2e8f0;',
      '  color: #475569;',
      '}',

      '.scw-bid-review__btn--revision {',
      '  background: #fbbf24;',
      '  color: #78350f;',
      '}',

      '.scw-bid-review__btn--change-req {',
      '  background: #0891b2;',
      '  color: #fff;',
      '}',

      '.scw-bid-review__btn--change-edit {',
      '  background: #f59e0b;',
      '  color: #78350f;',
      '}',

      '.scw-bid-review__btn--busy {',
      '  opacity: 0.5;',
      '  pointer-events: none;',
      '  cursor: default;',
      '}',

      '.scw-bid-review__btn--sm {',
      '  font-size: 10px;',
      '  padding: 3px 6px;',
      '}',

      /* ── collapsible group headers (accordion style) ────────── */
      '.scw-bid-review__group-header {',
      '  cursor: pointer;',
      '  user-select: none;',
      '  -webkit-user-select: none;',
      '}',

      '.scw-bid-review__group-header td {',
      '  position: relative;',
      '  background: #f1f5f9;',
      '  padding: 0;',
      '  font-weight: 700;',
      '  font-size: 13px;',
      '  color: #334155;',
      '  border-bottom: 1px solid #cbd5e1;',
      '  border-left: 4px solid #295f91;',
      '}',

      '.scw-bid-review__grp-inner {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  padding: 10px 12px 10px 12px;',
      '}',

      '.scw-bid-review__group-header:hover td {',
      '  background: #e8edf3;',
      '}',

      /* Chevron in group header */
      '.scw-bid-review__grp-chevron {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  flex: 0 0 auto;',
      '  color: #295f91;',
      '  transition: transform 220ms ease;',
      '}',

      '.scw-bid-review__group-header--collapsed .scw-bid-review__grp-chevron {',
      '  transform: rotate(-90deg);',
      '}',

      /* Title */
      '.scw-bid-review__grp-title {',
      '  flex: 1 1 auto;',
      '}',

      /* Count pill — mirrors KTL accordion count */
      '.scw-bid-review__grp-count {',
      '  display: inline-block;',
      '  padding: 2px 8px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  line-height: 1.4;',
      '  border-radius: 999px;',
      '  background: rgba(41, 95, 145, 0.12);',
      '  border: 1px solid rgba(41, 95, 145, 0.22);',
      '  color: #295f91;',
      '}',

      /* ── subgroup headers (proposalBucket within mdfIdf) ──── */
      '.scw-bid-review__subgroup-header td {',
      '  background: #f8fafc;',
      '  padding: 0;',
      '  border-bottom: 1px solid #e2e8f0;',
      '}',

      '.scw-bid-review__subgrp-inner {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  padding: 6px 12px 6px 28px;',
      '}',

      '.scw-bid-review__subgrp-title {',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  color: #475569;',
      '}',

      '.scw-bid-review__subgrp-count {',
      '  display: inline-block;',
      '  padding: 1px 6px;',
      '  font-size: 10px;',
      '  font-weight: 600;',
      '  line-height: 1.4;',
      '  border-radius: 999px;',
      '  background: #f1f5f9;',
      '  color: #64748b;',
      '}',

      /* ── data rows ─────────────────────────────────────────── */
      '.scw-bid-review__row td {',
      '  padding: 6px 8px;',
      '  border-bottom: 1px solid #e5e7eb;',
      '  vertical-align: top;',
      '}',

      '.scw-bid-review__row:nth-child(even) td {',
      '  background: #fafbfc;',
      '}',

      '.scw-bid-review__row:hover td {',
      '  background: #eff6ff;',
      '}',

      /* ── SOW cell ──────────────────────────────────────────── */
      '.scw-bid-review__sow-cell {',
      '  font-weight: 600;',
      '  color: #1e293b;',
      '}',

      '.scw-bid-review__sow-cell--new {',
      '  font-weight: 600;',
      '  color: #1e293b;',
      '}',

      '.scw-bid-review__new-badge {',
      '  display: inline-block;',
      '  padding: 1px 5px;',
      '  border-radius: 3px;',
      '  background: #2563eb;',
      '  color: #fff;',
      '  font-size: 9px;',
      '  font-weight: 700;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.5px;',
      '  vertical-align: middle;',
      '  margin-right: 4px;',
      '}',

      /* ── NO BID badge & row ──────────────────────────────────── */
      '.scw-bid-review__no-bid-badge {',
      '  display: inline-block;',
      '  padding: 1px 5px;',
      '  border-radius: 3px;',
      '  background: #dc2626;',
      '  color: #fff;',
      '  font-size: 9px;',
      '  font-weight: 700;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.5px;',
      '  vertical-align: middle;',
      '  margin-right: 4px;',
      '}',

      '.scw-bid-review__row--no-bid td {',
      '  background: #fef2f2 !important;',
      '}',

      '.scw-bid-review__row--no-bid:hover td {',
      '  background: #fee2e2 !important;',
      '}',

      /* ── package data cell ─────────────────────────────────── */
      '.scw-bid-review__cell-label {',
      '  font-size: 12px;',
      '  color: #334155;',
      '  margin-bottom: 2px;',
      '}',

      '.scw-bid-review__cell-values {',
      '  display: flex;',
      '  gap: 8px;',
      '  font-size: 12px;',
      '  color: #475569;',
      '}',

      '.scw-bid-review__cell-value {',
      '  font-weight: 600;',
      '  color: #0f172a;',
      '}',

      '.scw-bid-review__cell--missing {',
      '  color: #cbd5e1;',
      '  font-style: italic;',
      '  font-size: 12px;',
      '}',

      /* ── mismatch highlight (SOW vs Bid field pair differs) ── */
      '.scw-bid-review__cell--mismatch {',
      '  background: #fff7ed !important;',
      '  border-left: 3px solid #fb923c;',
      '}',

      /* ── per-field diff highlight (pinpoints WHICH values differ) ── */
      '.scw-bid-review__field-diff {',
      '  background: #fed7aa;',
      '  border-radius: 2px;',
      '  padding: 1px 4px;',
      '  box-decoration-break: clone;',
      '  -webkit-box-decoration-break: clone;',
      '}',

      '.scw-bid-review__cell-qty {',
      '  font-size: 11px;',
      '  color: #475569;',
      '  margin-top: 1px;',
      '}',

      '.scw-bid-review__cell-labor-desc {',
      '  font-size: 11px;',
      '  color: #475569;',
      '  margin-top: 1px;',
      '}',

      '.scw-bid-review__field-label {',
      '  font-weight: 600;',
      '  color: #64748b;',
      '}',

      '.scw-bid-review__cell-notes-divider {',
      '  border: none;',
      '  border-top: 1px solid #e2e8f0;',
      '  margin: 4px 0 2px;',
      '}',

      '.scw-bid-review__cell-notes {',
      '  font-size: 11px;',
      '  color: #64748b;',
      '  margin-top: 2px;',
      '}',

      '.scw-bid-review__cell-conn-device {',
      '  font-size: 11px;',
      '  color: #6366f1;',
      '  margin-top: 2px;',
      '  font-weight: 500;',
      '}',

      /* ── SOW detail cell ─────────────────────────────────────── */
      '.scw-bid-review__sow-detail {',
      '  vertical-align: top;',
      '  font-size: 12px;',
      '}',

      /* ── cabling chips ────────────────────────────────────────── */
      '.scw-bid-review__cabling-chip {',
      '  display: inline-block;',
      '  padding: 2px 7px;',
      '  border-radius: 3px;',
      '  font-size: 10px;',
      '  font-weight: 600;',
      '  margin-top: 4px;',
      '}',

      '.scw-bid-review__cabling-chip--on {',
      '  background: #dcfce7;',
      '  color: #166534;',
      '}',

      '.scw-bid-review__cabling-chip--off {',
      '  background: #f1f5f9;',
      '  color: #94a3b8;',
      '  font-weight: 400;',
      '}',

      /* ── status chips ──────────────────────────────────────── */
      '.scw-bid-review__chip {',
      '  display: inline-block;',
      '  padding: 1px 6px;',
      '  border-radius: 3px;',
      '  font-size: 10px;',
      '  font-weight: 600;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.3px;',
      '  margin-top: 3px;',
      '}',

      '.scw-bid-review__chip--matched {',
      '  background: #dcfce7;',
      '  color: #166534;',
      '}',

      '.scw-bid-review__chip--missing {',
      '  background: #fef3c7;',
      '  color: #92400e;',
      '}',

      '.scw-bid-review__chip--new {',
      '  background: #dbeafe;',
      '  color: #1e40af;',
      '}',

      '.scw-bid-review__chip--conflict {',
      '  background: #fee2e2;',
      '  color: #991b1b;',
      '}',

      /* ── row actions cell ──────────────────────────────────── */
      '.scw-bid-review__row-actions {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 3px;',
      '}',

      /* ── empty & loading states ────────────────────────────── */
      '.scw-bid-review__empty-state {',
      '  text-align: center;',
      '  padding: 40px 20px;',
      '  color: #94a3b8;',
      '  font-size: 14px;',
      '}',

      '.scw-bid-review__loading {',
      '  text-align: center;',
      '  padding: 32px 20px;',
      '  color: #64748b;',
      '  font-size: 13px;',
      '}',

      '.scw-bid-review__loading::after {',
      '  content: "";',
      '  display: inline-block;',
      '  width: 14px;',
      '  height: 14px;',
      '  border: 2px solid #cbd5e1;',
      '  border-top-color: #3b82f6;',
      '  border-radius: 50%;',
      '  margin-left: 8px;',
      '  vertical-align: middle;',
      '  animation: scwBidSpin .7s linear infinite;',
      '}',

      '@keyframes scwBidSpin {',
      '  to { transform: rotate(360deg); }',
      '}',

      /* ── toast ──────────────────────────────────────────────── */
      '.scw-bid-review__toast {',
      '  position: fixed;',
      '  bottom: 24px;',
      '  left: 50%;',
      '  transform: translateX(-50%);',
      '  z-index: 100000;',
      '  padding: 10px 20px;',
      '  border-radius: 6px;',
      '  font: 600 13px/1.3 system-ui, sans-serif;',
      '  color: #fff;',
      '  box-shadow: 0 4px 16px rgba(0,0,0,0.25);',
      '  transition: opacity .3s;',
      '}',

      '.scw-bid-review__toast--success {',
      '  background: #16a34a;',
      '}',

      '.scw-bid-review__toast--error {',
      '  background: #dc2626;',
      '}',

      '.scw-bid-review__toast--info {',
      '  background: #2563eb;',
      '}',

    ].join('\n');

    var style = document.createElement('style');
    style.id = CFG.cssId;
    style.textContent = css;
    document.head.appendChild(style);
  };

})();
