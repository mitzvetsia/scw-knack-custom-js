// ============================================================
// Device Worksheet – compact summary row + expandable detail
// ============================================================
//
// Transforms flat table rows into a two-part layout:
//   1. SUMMARY ROW – always-visible, compact bar with key bid
//      fields that are directly inline-editable.
//   2. DETAIL PANEL – accordion-expandable section with the full
//      set of remaining editable fields (survey, mounting, etc.)
//
// A chevron on the summary row toggles the detail panel and the
// associated inline-photo row (injected by inline-photo-row.js).
//
// INLINE-EDIT PRESERVATION STRATEGY
//   The actual <td> elements are *moved* (reparented) into the
//   worksheet layout — NOT cloned.  This keeps all of Knack's
//   jQuery event bindings alive.  When Knack fires cell-edit or
//   re-renders the view, the whole table is replaced and this
//   script re-runs from scratch.
//
// CONFIGURATION
//   Edit WORKSHEET_CONFIG below. Each entry maps semantic field
//   names to Knack field keys for a given view.
//
(function () {
  'use strict';

  // ============================================================
  // CONFIG – plug in field keys per view here
  // ============================================================
  var WORKSHEET_CONFIG = {
    views: [
      {
        viewId: 'view_3512',
        fields: {
          // ── Summary row (always visible, primary edit surface) ──
          bid:              'field_2415',   // Bid (column 1)
          move:             'field_2375',   // Move icon (column 2)
          label:            'field_2364',   // Label
          product:          'field_2379',   // Product (column 4)
          laborDescription: 'field_2409',   // Labor Description
          labor:            'field_2400',   // Labor $

          // ── Detail panel (expandable) ──
          mounting:         'field_2379',   // Mounting Acces. (column 5 — same field, different column-index)
          connections:      'field_2381',   // connected to
          scwNotes:         'field_2418',   // SCW Notes
          surveyNotes:      'field_2412',   // Survey Notes
          exterior:         'field_2372',   // Exterior (chip host)
          existingCabling:  'field_2370',   // Existing Cabling
          plenum:           'field_2371',   // Plenum
          mountingHeight:   'field_2455',   // Mounting Height
          dropLength:       'field_2367',   // Drop Length
          conduitFeet:      'field_2368',   // Conduit Linear Feet
          warningCount:     'field_2454'    // Warning count (shown as chit on header)
        },
        columnIndices: {
          product:  4,
          mounting: 5
        }
      },
      {
        viewId: 'view_3505',
        fields: {
          bid:              'field_2415',
          move:             'field_2375',
          label:            'field_2364',
          product:          'field_2379',
          laborDescription: 'field_2409',
          labor:            'field_2400',
          quantity:         'field_2399',   // Qty (summary, inline-edit)
          extended:         'field_2401',   // Extended / Labor Total (summary, read-only)

          mounting:         'field_2379',
          connections:      'field_2380',
          scwNotes:         'field_2418',
          surveyNotes:      'field_2412',
          exterior:         'field_2372',
          existingCabling:  'field_2370',
          plenum:           'field_2371',
          warningCount:     'field_2454'    // Warning count (shown as chit on header)
        },
        columnIndices: {
          product:  3,
          mounting: 4
        }
      }
    ]
  };

  // ============================================================
  // CONSTANTS
  // ============================================================
  var STYLE_ID       = 'scw-device-worksheet-css';
  var WORKSHEET_ROW  = 'scw-ws-row';
  var PROCESSED_ATTR = 'data-scw-worksheet';
  var EVENT_NS       = '.scwDeviceWorksheet';
  var P              = 'scw-ws';  // class prefix

  // SVG chevron (matches group-collapse.js style)
  var CHEVRON_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 2 8 6 4 10"/></svg>';

  // ============================================================
  // CSS – injected once
  // ============================================================
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = `
/* ── Hide the original data row (cells moved out, shell stays) ── */
tr[${PROCESSED_ATTR}="1"] {
  display: none !important;
}

/* ── Kill ALL residual Knack hover / striping ── */
tr.${WORKSHEET_ROW},
tr.${WORKSHEET_ROW}:hover,
tr.scw-inline-photo-row,
tr.scw-inline-photo-row:hover,
tr[data-scw-worksheet],
tr[data-scw-worksheet]:hover {
  background: none !important;
  background-color: transparent !important;
}
tr.${WORKSHEET_ROW} > td,
tr.${WORKSHEET_ROW}:hover > td,
tr.scw-inline-photo-row > td,
tr.scw-inline-photo-row:hover > td,
tr[data-scw-worksheet] > td,
tr[data-scw-worksheet]:hover > td {
  background: none !important;
  background-color: transparent !important;
}

/* ── Worksheet row <td> — zero padding so the card fills it ── */
.${WORKSHEET_ROW} > td {
  padding: 0 !important;
  border: none !important;
}

/* ── Photo row — part of the same visual unit ── */
tr.scw-inline-photo-row > td {
  padding: 10px 16px 14px 16px !important;
  border: none !important;
  border-bottom: 2px solid #e2e8f0 !important;
}

/* ── Card wrapper ── */
.${P}-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-top: 2px solid #e2e8f0;
}

/* ── Bottom separator between record groups (card + photo row) ── */
.${WORKSHEET_ROW}.${P}-last > td {
  border-bottom: 2px solid #e2e8f0 !important;
}

/* ================================================================
   SUMMARY BAR – single-row layout
   [checkbox] [chevron] [label · product] [labor desc] → push right → [bid] [labor] [qty] [ext] [move]
   ================================================================ */
.${P}-summary {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  min-height: 38px;
}
.${P}-summary:hover {
  background: #f1f5f9;
}

/* Right-aligned group: bid, labor, qty, ext, move pushed to far right */
.${P}-sum-right {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}
/* Each field group in the right section gets fixed width for vertical alignment */
.${P}-sum-right .${P}-sum-group {
  width: 80px;
  min-width: 80px;
}
/* Bid group can be a bit narrower */
.${P}-sum-right .${P}-sum-group--bid {
  width: 70px;
  min-width: 70px;
}
/* Bid field grows in height when multiple selections are present */
.${P}-sum-group--bid td.${P}-sum-field {
  height: auto;
  min-height: 30px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
/* Qty group narrower */
.${P}-sum-right .${P}-sum-group--qty {
  width: 50px;
  min-width: 50px;
}
/* Fields inside right groups stretch to fill their group */
.${P}-sum-right td.${P}-sum-field,
.${P}-sum-right td.${P}-sum-field-ro {
  width: 100%;
  min-width: 0;
}

/* Hide labor, qty, extended for Assumptions rows (keeps space for alignment) */
tr.scw-row--assumptions .${P}-sum-group--labor,
tr.scw-row--assumptions .${P}-sum-group--qty,
tr.scw-row--assumptions .${P}-sum-group--ext {
  visibility: hidden;
}

/* ── KTL bulk-edit checkbox cell ── */
td.${P}-sum-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  flex: 0 0 auto;
  padding: 0 4px !important;
  border: none !important;
  background: transparent !important;
  min-width: 20px;
}
td.${P}-sum-check input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
}

/* Clickable toggle zone (chevron + identity) — fixed width so labor desc aligns */
.${P}-toggle-zone {
  display: flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  flex: 0 0 auto;
  min-width: 0;
}
.${P}-toggle-zone:hover .${P}-chevron {
  color: #6b7280;
}

/* Chevron toggle */
.${P}-chevron {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: #9ca3af;
  transition: transform 200ms ease, color 150ms ease;
  transform: rotate(0deg);
}
.${P}-chevron.${P}-collapsed {
  transform: rotate(0deg);
}
.${P}-chevron.${P}-expanded {
  transform: rotate(90deg);
  color: #6b7280;
}

/* Label + Product identity block */
.${P}-identity {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex: 0 1 auto;
  min-width: 0;
}

/* Warning chit (field_2454 count > 0) */
.${P}-warn-chit {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px 1px 5px;
  font-size: 12px;
  font-weight: 700;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.4;
}
.${P}-warn-chit svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}
/* Wrapper so chit + product share the product's fixed width */
.${P}-product-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}
#view_3512 .${P}-product-group {
  width: 300px;
  min-width: 300px;
  max-width: 300px;
}
#view_3505 .${P}-product-group {
  width: 400px;
  min-width: 400px;
  max-width: 400px;
}
.${P}-product-group > td.${P}-sum-product {
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Label td in summary — primary styling, fixed width for alignment */
td.${P}-sum-label-cell,
td.${P}-sum-label-cell:hover {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #1e4d78;
  cursor: pointer !important;
  border: none !important;
  background: transparent !important;
  padding: 0 2px;
  white-space: nowrap;
  width: 80px;
  min-width: 80px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Product td in summary — fixed width so labor desc and right fields align vertically */
td.${P}-sum-product,
td.${P}-sum-product:hover {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #1e4d78;
  cursor: pointer !important;
  border: none !important;
  background: transparent !important;
  padding: 0 2px;
  width: 400px;
  min-width: 400px;
  max-width: 400px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
/* view_3512: product width managed by product-group wrapper */

/* Separator dot */
.${P}-sum-sep {
  color: #d1d5db;
  font-size: 12px;
  user-select: none;
  flex-shrink: 0;
}

/* ── Standardized editable field cell height ── */
td.${P}-sum-field {
  display: inline-flex;
  align-items: center;
  position: relative;
  padding: 2px 8px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  white-space: nowrap;
  height: 30px;
  min-width: 40px;
  box-sizing: border-box;
  transition: border-color 0.15s, background-color 0.15s;
}
td.${P}-sum-field.cell-edit:hover,
td.${P}-sum-field.ktlInlineEditableCellsStyle:hover {
  background-color: #dbeafe !important;
  border-color: #93c5fd !important;
  cursor: pointer;
}
/* Empty summary fields */
td.${P}-sum-field.${P}-empty {
  color: #9ca3af;
  font-style: italic;
}

/* Read-only summary field (non-editable, e.g. Extended total) */
td.${P}-sum-field-ro {
  display: inline-flex;
  align-items: center;
  position: relative;
  padding: 2px 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  white-space: nowrap;
  height: 30px;
  min-width: 40px;
  box-sizing: border-box;
}

/* Labor desc field — fills available space between identity and right-aligned fields */
td.${P}-sum-field--desc {
  white-space: normal;
  word-break: break-word;
  height: auto;
  min-height: 30px;
}

/* Summary field label (tiny, above or inline) */
.${P}-sum-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #374151;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Summary field group: label + value stacked */
.${P}-sum-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  min-width: 0;
  flex-shrink: 0;
}

/* Labor desc group — fills middle space, pushes right group to far right */
.${P}-sum-group--fill {
  flex: 1 1 auto;
  min-width: 80px;
}

/* Move td sits at the right end */
td.${P}-sum-move {
  display: inline-flex;
  align-items: center;
  padding: 0 4px;
  border: none !important;
  background: transparent !important;
  flex-shrink: 0;
}

/* ================================================================
   DETAIL PANEL – expandable section
   ================================================================ */
.${P}-detail {
  display: none;
  border-top: 1px solid #e5e7eb;
}
.${P}-detail.${P}-open {
  display: block;
}

/* ── Sections grid ── */
.${P}-sections {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
/* Narrow the Equipment Details (left) section so Survey Details
   starts roughly aligned with Labor Description in the summary bar. */
#view_3512 .${P}-sections {
  grid-template-columns: 455px 1fr;
}
#view_3505 .${P}-sections {
  grid-template-columns: 555px 1fr;
}
@media (max-width: 900px) {
  .${P}-sections,
  #view_3512 .${P}-sections,
  #view_3505 .${P}-sections {
    grid-template-columns: 1fr;
  }
}

/* ── Individual section ── */
.${P}-section {
  padding: 14px 20px 14px 16px;
  border-right: 1px solid #e5e7eb;
  min-width: 0;
}
.${P}-section:last-child {
  border-right: none;
}

.${P}-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #4b5563;
  padding-bottom: 6px;
  margin-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
}

/* ── Field row inside a section ── */
.${P}-field {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: flex-start;
  min-height: 24px;
}
.${P}-field:last-child {
  margin-bottom: 0;
}

.${P}-field-label {
  flex: 0 0 100px;
  width: 100px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-top: 5px;
  white-space: pre-line;
  line-height: 1.3;
}

/* ── The moved <td> becomes the field value container ── */
.${P}-field-value {
  flex: 1;
  font-size: 13px;
  color: #1f2937;
  line-height: 1.5;
  min-width: 0;
  word-break: break-word;
}

td.${P}-field-value {
  display: block;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  min-height: 28px;
}

/* ── Editable hover affordance ── */
td.${P}-field-value.cell-edit,
td.${P}-field-value.ktlInlineEditableCellsStyle {
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}
td.${P}-field-value.cell-edit:hover,
td.${P}-field-value.ktlInlineEditableCellsStyle:hover {
  background-color: #f0f6ff !important;
  border-color: #93c5fd !important;
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25);
}

/* ── Chip host td — invisible cell, chips aligned with fields ── */
td.${P}-chip-host {
  display: block !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  min-height: 0 !important;
}
td.${P}-chip-host:hover {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.${P}-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 0;
}

/* ── Notes fields — allow more vertical space ── */
td.${P}-field-value--notes {
  font-size: 13px;
  line-height: 1.5;
  max-height: 120px;
  overflow-y: auto;
}

/* ── Empty field value ── */
.${P}-field-value--empty {
  color: #9ca3af;
  font-style: italic;
}

/* ── Radio chips (Mounting Height) ── */
.${P}-radio-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 0;
}
.${P}-radio-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.5;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
  border: 1px solid transparent;
  text-align: center;
}
.${P}-radio-chip.is-selected {
  background-color: #dbeafe;
  color: #1e40af;
  border-color: #93c5fd;
}
.${P}-radio-chip.is-selected:hover {
  background-color: #bfdbfe;
  box-shadow: 0 1px 3px rgba(30,64,175,0.15);
}
.${P}-radio-chip.is-unselected {
  background-color: #f9fafb;
  color: #9ca3af;
  border-color: #d1d5db;
}
.${P}-radio-chip.is-unselected:hover {
  background-color: #f3f4f6;
  color: #6b7280;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.${P}-radio-chip.is-saving {
  opacity: 0.6;
  pointer-events: none;
}

/* ── Direct-edit inputs (type-and-save text fields) ── */
.${P}-direct-input,
.${P}-direct-textarea {
  width: 100%;
  font-size: 13px;
  font-family: inherit;
  color: #1f2937;
  line-height: 1.5;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}
.${P}-direct-input:focus,
.${P}-direct-textarea:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25);
}
.${P}-direct-input.is-saving,
.${P}-direct-textarea.is-saving {
  background-color: #f0fdf4;
  border-color: #86efac;
}
.${P}-direct-input.is-error,
.${P}-direct-textarea.is-error {
  background-color: #fef2f2;
  border-color: #fca5a5;
  box-shadow: 0 0 0 2px rgba(252, 165, 165, 0.25);
}
.${P}-direct-error {
  font-size: 11px;
  color: #dc2626;
  margin-top: 3px;
  line-height: 1.3;
}
.${P}-direct-textarea {
  resize: vertical;
  min-height: 48px;
  max-height: 120px;
}

/* ── Summary bar direct-edit input wrapper ── */
.${P}-sum-input-wrap {
  width: 100%;
  position: relative;
}
.${P}-sum-input-wrap .${P}-direct-input {
  height: 28px;
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 500;
}
.${P}-sum-input-wrap .${P}-direct-error {
  position: absolute;
  top: 100%;
  left: 0;
  white-space: nowrap;
  z-index: 10;
  background: #fff;
  padding: 2px 4px;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* ── Photo row hidden when detail collapsed ── */
tr.scw-inline-photo-row.${P}-photo-hidden {
  display: none !important;
}
`;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  function findCell(tr, fieldKey, colIndex) {
    var cells = tr.querySelectorAll(
      'td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]'
    );
    if (!cells.length) return null;
    if (colIndex != null) {
      for (var i = 0; i < cells.length; i++) {
        var ci = cells[i].getAttribute('data-column-index');
        if (ci !== null && parseInt(ci, 10) === colIndex) return cells[i];
      }
    }
    return cells[0];
  }

  function isCellEmpty(td) {
    if (!td) return true;
    var text = (td.textContent || '').replace(/[\u00a0\s]/g, '').trim();
    return text.length === 0 && !td.querySelector('img');
  }

  function getRecordId(tr) {
    var trId = tr.id || '';
    var match = trId.match(/[0-9a-f]{24}/i);
    return match ? match[0] : null;
  }

  // ============================================================
  // EXPANDED STATE PERSISTENCE (across inline-edit re-renders)
  // ============================================================
  //
  // Device-worksheet panels start collapsed after every transformView.
  // Without persistence, an inline edit causes all expanded panels to
  // close — losing the user's context.
  //
  // On knack-cell-update (BEFORE re-render): scan worksheet rows and
  // save which record IDs have expanded detail panels.
  // At the end of transformView (AFTER rebuild): re-expand saved panels.

  var _expandedState = {};  // viewId → [recordId, ...]

  /** Scan current worksheet rows for open detail panels and save their
   *  record IDs so they can be re-expanded after transformView. */
  function captureExpandedState(viewId) {
    var expanded = [];
    var wsRows = document.querySelectorAll('#' + viewId + ' tr.' + WORKSHEET_ROW);
    for (var i = 0; i < wsRows.length; i++) {
      var detail = wsRows[i].querySelector('.' + P + '-detail.' + P + '-open');
      if (detail) {
        var rid = getRecordId(wsRows[i]);
        if (rid) expanded.push(rid);
      }
    }
    _expandedState[viewId] = expanded;
  }

  /** Capture expanded state for ALL configured worksheet views.
   *  Called on ANY knack-cell-update because refresh-on-inline-edit.js
   *  may refresh sibling views — not just the one that was edited. */
  function captureAllExpandedStates() {
    WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
      captureExpandedState(viewCfg.viewId);
    });
  }

  /** Re-expand detail panels for previously-expanded records.
   *  Called at the end of transformView after new worksheet rows
   *  have been built. Uses record ID (24-char hex) for stable
   *  identity across re-renders. */
  function restoreExpandedState(viewId) {
    var expanded = _expandedState[viewId];
    if (!expanded || !expanded.length) return;

    // Build a lookup set for O(1) checks
    var expandedSet = {};
    for (var i = 0; i < expanded.length; i++) {
      expandedSet[expanded[i]] = true;
    }

    var wsRows = document.querySelectorAll('#' + viewId + ' tr.' + WORKSHEET_ROW);
    for (var j = 0; j < wsRows.length; j++) {
      var rid = getRecordId(wsRows[j]);
      if (rid && expandedSet[rid]) {
        toggleDetail(wsRows[j]);
      }
    }

    delete _expandedState[viewId];
  }

  // ============================================================
  // BUILD DETAIL PANEL HELPERS
  // ============================================================

  var GRAYED_CLASS = 'scw-cond-grayed';

  function buildFieldRow(label, td, opts) {
    opts = opts || {};

    // If the cell was grayed out by the conditional-grayout script,
    // remove it from the detail panel entirely (keep summary graying).
    if (td && td.classList.contains(GRAYED_CLASS)) return null;

    // If skipEmpty is set, omit the field entirely when the cell is blank.
    if (opts.skipEmpty && (!td || isCellEmpty(td))) return null;

    var row = document.createElement('div');
    row.className = P + '-field';

    var lbl = document.createElement('div');
    lbl.className = P + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    if (td && !isCellEmpty(td)) {
      td.classList.add(P + '-field-value');
      if (opts.notes) td.classList.add(P + '-field-value--notes');
      row.appendChild(td);
    } else if (td) {
      td.classList.add(P + '-field-value');
      td.classList.add(P + '-field-value--empty');
      if (opts.notes) td.classList.add(P + '-field-value--notes');
      row.appendChild(td);
    } else {
      var placeholder = document.createElement('div');
      placeholder.className = P + '-field-value ' + P + '-field-value--empty';
      placeholder.textContent = '\u2014';
      row.appendChild(placeholder);
    }

    return row;
  }

  function buildSection(title) {
    var section = document.createElement('div');
    section.className = P + '-section';

    if (title) {
      var titleEl = document.createElement('div');
      titleEl.className = P + '-section-title';
      titleEl.textContent = title;
      section.appendChild(titleEl);
    }

    return section;
  }

  // ============================================================
  // RADIO CHIPS – single-select chip UI for multiple-choice fields
  // ============================================================
  var RADIO_CHIP_CLASS = P + '-radio-chip';
  var RADIO_CHIPS_ATTR = 'data-scw-radio-chips';

  var MOUNTING_HEIGHT_OPTIONS = ["Under 16'", "16' - 24'", "Over 24'"];

  /** Read current value from a cell's text content. */
  function readCellText(td) {
    if (!td) return '';
    return (td.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim();
  }

  /** Build radio chip elements for a set of options. */
  function buildRadioChips(td, fieldKey, options) {
    var currentVal = readCellText(td);
    var container = document.createElement('div');
    container.className = P + '-radio-chips';
    container.setAttribute('data-field', fieldKey);

    for (var i = 0; i < options.length; i++) {
      var chip = document.createElement('span');
      chip.className = RADIO_CHIP_CLASS;
      chip.setAttribute('data-option', options[i]);
      chip.setAttribute('data-field', fieldKey);
      chip.textContent = options[i];

      if (currentVal === options[i]) {
        chip.classList.add('is-selected');
      } else {
        chip.classList.add('is-unselected');
      }
      container.appendChild(chip);
    }
    return container;
  }

  /** Build a field row that uses radio chips instead of the raw cell. */
  function buildRadioChipRow(label, td, fieldKey, options) {
    if (td && td.classList.contains(GRAYED_CLASS)) return null;

    var row = document.createElement('div');
    row.className = P + '-field';

    var lbl = document.createElement('div');
    lbl.className = P + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    var valueWrapper = document.createElement('div');
    valueWrapper.className = P + '-field-value';
    valueWrapper.style.border = 'none';
    valueWrapper.style.padding = '0';
    valueWrapper.style.background = 'transparent';

    var chips = buildRadioChips(td, fieldKey, options);
    valueWrapper.appendChild(chips);

    // Keep the original td hidden so Knack's data binding stays alive
    if (td) {
      td.style.display = 'none';
      td.setAttribute(RADIO_CHIPS_ATTR, '1');
      valueWrapper.appendChild(td);
    }

    row.appendChild(valueWrapper);
    return row;
  }

  // ============================================================
  // DIRECT-EDIT INPUTS – type-and-save text fields
  // ============================================================
  var DIRECT_EDIT_ATTR = 'data-scw-direct-edit';
  var DIRECT_INPUT_CLASS = P + '-direct-input';
  var DIRECT_TEXTAREA_CLASS = P + '-direct-textarea';

  /** Read the display text from a td, stripping whitespace. */
  function readFieldText(td) {
    if (!td) return '';
    return (td.textContent || '').replace(/[\u00a0]/g, ' ').trim();
  }

  /** Build an editable field row with a native input or textarea. */
  function buildEditableFieldRow(label, td, fieldKey, opts) {
    opts = opts || {};
    if (td && td.classList.contains(GRAYED_CLASS)) return null;
    if (opts.skipEmpty && (!td || isCellEmpty(td))) return null;

    var row = document.createElement('div');
    row.className = P + '-field';

    var lbl = document.createElement('div');
    lbl.className = P + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    var valueWrapper = document.createElement('div');
    valueWrapper.className = P + '-field-value';
    valueWrapper.style.border = 'none';
    valueWrapper.style.padding = '0';
    valueWrapper.style.background = 'transparent';

    var currentVal = readFieldText(td);
    var input;

    if (opts.notes) {
      input = document.createElement('textarea');
      input.className = DIRECT_TEXTAREA_CLASS;
      input.value = currentVal;
      input.rows = 2;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = DIRECT_INPUT_CLASS;
      input.value = currentVal;
    }

    input.setAttribute('data-field', fieldKey);
    input.setAttribute(DIRECT_EDIT_ATTR, '1');

    valueWrapper.appendChild(input);

    // Keep the original td hidden so Knack data binding stays alive
    if (td) {
      td.style.display = 'none';
      td.setAttribute(DIRECT_EDIT_ATTR, '1');
      valueWrapper.appendChild(td);
    }

    row.appendChild(valueWrapper);
    return row;
  }

  /** Parse an error message from a Knack API response. */
  function parseKnackError(xhr) {
    try {
      var body = JSON.parse(xhr.responseText || '{}');
      // Knack returns { errors: [{ message: "..." }] } or { errors: [{ field: "...", message: "..." }] }
      if (body.errors && body.errors.length) {
        return body.errors.map(function (e) { return e.message || e; }).join('; ');
      }
      if (body.message) return body.message;
    } catch (ignored) {}
    return 'Save failed';
  }

  /** Show an error message below a direct-edit input, with red styling. */
  function showInputError(input, message, previousValue) {
    // Remove saving state, add error state
    input.classList.remove('is-saving');
    input.classList.add('is-error');

    // Revert value
    input.value = previousValue;

    // Update hidden td back to previous value
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    if (hiddenTd) {
      hiddenTd.textContent = previousValue;
    }

    // Show error message element
    var existing = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (existing) existing.remove();

    var errEl = document.createElement('div');
    errEl.className = P + '-direct-error';
    errEl.textContent = message;
    if (wrapper) wrapper.appendChild(errEl);

    // Auto-clear after 4 seconds
    setTimeout(function () {
      input.classList.remove('is-error');
      if (errEl.parentNode) errEl.remove();
    }, 4000);
  }

  /** Show success feedback on input. */
  function showInputSuccess(input) {
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    // Remove any lingering error
    var wrapper = input.parentNode;
    var errEl = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (errEl) errEl.remove();

    setTimeout(function () { input.classList.remove('is-saving'); }, 600);
  }

  // Number fields that need client-side validation
  var NUMBER_FIELDS = ['field_2367', 'field_2368', 'field_2400', 'field_2399'];

  /** Save a direct-edit field value via model.updateRecord.
   *  Uses Knack's internal API to avoid triggering a full view re-render.
   *  Calls onSuccess() or onError(message) when done. */
  function saveDirectEditValue(viewId, recordId, fieldKey, value, onSuccess, onError) {
    if (typeof Knack === 'undefined') return;

    var data = {};
    data[fieldKey] = value;

    var view = Knack.views[viewId];
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      view.model.updateRecord(recordId, data);
      if (onSuccess) onSuccess();
      return;
    }

    // Fallback: direct AJAX (no model.fetch to avoid re-render)
    $.ajax({
      url: Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
           '/views/' + viewId + '/records/' + recordId,
      type: 'PUT',
      headers: {
        'X-Knack-Application-Id': Knack.application_id,
        'x-knack-rest-api-key': 'knack',
        'Authorization': Knack.getUserToken()
      },
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: function () {
        if (onSuccess) onSuccess();
      },
      error: function (xhr) {
        var msg = parseKnackError(xhr);
        console.warn('[scw-ws-direct] Save failed for ' + recordId, xhr.responseText);
        if (onError) onError(msg);
      }
    });
  }

  /** Handle save for a direct-edit input. */
  function handleDirectEditSave(input) {
    var fieldKey = input.getAttribute('data-field') || '';
    var newValue = input.value;

    // Capture previous value before overwriting hidden td
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var previousValue = hiddenTd ? readFieldText(hiddenTd) : '';

    // Client-side validation for number fields
    if (NUMBER_FIELDS.indexOf(fieldKey) !== -1) {
      var trimmed = newValue.trim().replace(/[$,]/g, '');
      if (trimmed !== '' && isNaN(Number(trimmed))) {
        showInputError(input, 'Please enter a number', previousValue);
        return;
      }
    }

    // Optimistically update hidden td
    if (hiddenTd) {
      hiddenTd.textContent = newValue;
    }

    // Visual feedback — start saving
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    var errEl = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (errEl) errEl.remove();

    // Find record ID and view ID
    var wsTr = input.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = input.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveDirectEditValue(viewId, recordId, fieldKey, newValue,
        function () { showInputSuccess(input); },
        function (msg) { showInputError(input, msg, previousValue); }
      );
    }
  }

  // ── Keydown handler for direct-edit inputs: save on Enter ──
  document.addEventListener('keydown', function (e) {
    var target = e.target;
    if (!target.hasAttribute(DIRECT_EDIT_ATTR)) return;

    if (e.key === 'Enter') {
      // For textareas, Shift+Enter inserts newline; Enter alone saves
      if (target.tagName === 'TEXTAREA' && e.shiftKey) return;

      e.preventDefault();
      e.stopPropagation();
      // Mark as just-saved so blur handler doesn't double-fire
      target._scwJustSaved = true;
      handleDirectEditSave(target);
      target.blur();
    }

    if (e.key === 'Escape') {
      // Revert to the hidden td value
      target._scwJustSaved = true; // prevent blur save
      var wrapper = target.parentNode;
      var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
      if (hiddenTd) {
        target.value = readFieldText(hiddenTd);
      }
      target.blur();
    }
  }, true);

  // ── Blur handler: save when focus leaves ──
  document.addEventListener('focusout', function (e) {
    var target = e.target;
    if (!target.hasAttribute(DIRECT_EDIT_ATTR)) return;

    // Skip if Enter/Escape already handled it
    if (target._scwJustSaved) {
      target._scwJustSaved = false;
      return;
    }

    // Check if value actually changed
    var wrapper = target.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var originalVal = hiddenTd ? readFieldText(hiddenTd) : '';
    if (target.value !== originalVal) {
      handleDirectEditSave(target);
    }
  }, true);

  // ── Capture-phase click/mousedown: block Knack inline-edit on direct-edit inputs ──
  document.addEventListener('click', function (e) {
    if (e.target.hasAttribute(DIRECT_EDIT_ATTR)) {
      e.stopPropagation();
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    if (e.target.hasAttribute(DIRECT_EDIT_ATTR)) {
      e.stopPropagation();
    }
  }, true);

  /** Save a radio chip selection via Knack's internal API. */
  function saveRadioValue(viewId, recordId, fieldKey, value) {
    var data = {};
    data[fieldKey] = value;

    var view = typeof Knack !== 'undefined' && Knack.views ? Knack.views[viewId] : null;
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      view.model.updateRecord(recordId, data);
      return;
    }

    // Fallback: AJAX PUT
    if (typeof Knack !== 'undefined') {
      $.ajax({
        url: Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
             '/views/' + viewId + '/records/' + recordId,
        type: 'PUT',
        headers: {
          'X-Knack-Application-Id': Knack.application_id,
          'x-knack-rest-api-key': 'knack',
          'Authorization': Knack.getUserToken()
        },
        contentType: 'application/json',
        data: JSON.stringify(data),
        error: function (xhr) {
          console.warn('[scw-ws-radio] Save failed for ' + recordId, xhr.responseText);
        }
      });
    }
  }

  // ── Capture-phase click handler for radio chips ──
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.' + RADIO_CHIP_CLASS);
    if (!chip) return;

    e.stopPropagation();
    e.preventDefault();

    var newValue = chip.getAttribute('data-option') || '';
    var fieldKey = chip.getAttribute('data-field') || '';
    var container = chip.closest('.' + P + '-radio-chips');
    if (!container) return;

    // Update chip states
    var allChips = container.querySelectorAll('.' + RADIO_CHIP_CLASS);
    for (var i = 0; i < allChips.length; i++) {
      allChips[i].classList.remove('is-selected', 'is-unselected');
      if (allChips[i].getAttribute('data-option') === newValue) {
        allChips[i].classList.add('is-selected', 'is-saving');
      } else {
        allChips[i].classList.add('is-unselected');
      }
    }
    setTimeout(function () {
      var saving = container.querySelectorAll('.is-saving');
      for (var j = 0; j < saving.length; j++) saving[j].classList.remove('is-saving');
    }, 400);

    // Update hidden td text so re-renders stay in sync
    var hiddenTd = container.parentNode.querySelector('td[' + RADIO_CHIPS_ATTR + ']');
    if (hiddenTd) {
      hiddenTd.textContent = newValue;
    }

    // Find record ID and view ID, then save
    var wsTr = chip.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = chip.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveRadioValue(viewId, recordId, fieldKey, newValue);
    }
  }, true);

  // ── Capture-phase mousedown: block Knack inline-edit trigger ──
  document.addEventListener('mousedown', function (e) {
    var chip = e.target.closest('.' + RADIO_CHIP_CLASS);
    if (!chip) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ============================================================
  // SUMMARY BAR DIRECT-EDIT INPUT
  // ============================================================

  /** Build a direct-edit input that replaces a summary bar td.
   *  Returns a wrapper div containing the input + hidden td. */
  function buildSummaryEditInput(td, fieldKey) {
    var wrapper = document.createElement('div');
    wrapper.className = P + '-sum-input-wrap';

    var currentVal = readFieldText(td);
    var input = document.createElement('input');
    input.type = 'text';
    input.className = DIRECT_INPUT_CLASS;
    input.value = currentVal;
    input.setAttribute('data-field', fieldKey);
    input.setAttribute(DIRECT_EDIT_ATTR, '1');

    wrapper.appendChild(input);

    if (td) {
      td.style.display = 'none';
      td.setAttribute(DIRECT_EDIT_ATTR, '1');
      wrapper.appendChild(td);
    }

    return wrapper;
  }

  // ============================================================
  // BUILD SUMMARY BAR
  // ============================================================

  function buildSummaryBar(tr, viewCfg) {
    var f = viewCfg.fields;
    var ci = viewCfg.columnIndices || {};

    var bar = document.createElement('div');
    bar.className = P + '-summary';

    // ── KTL / legacy bulk-edit checkbox (if present) ──
    var checkTd = tr.querySelector('td > input[type="checkbox"]');
    if (checkTd) {
      var checkCell = checkTd.closest('td');
      checkCell.classList.add(P + '-sum-check');
      bar.appendChild(checkCell);
    }

    // ── Toggle zone: chevron + identity ──
    var toggleZone = document.createElement('span');
    toggleZone.className = P + '-toggle-zone';

    var chevron = document.createElement('span');
    chevron.className = P + '-chevron ' + P + '-collapsed';
    chevron.innerHTML = CHEVRON_SVG;
    toggleZone.appendChild(chevron);

    var identity = document.createElement('span');
    identity.className = P + '-identity';

    var labelTd = findCell(tr, f.label);
    if (labelTd) {
      labelTd.classList.add(P + '-sum-label-cell');
      identity.appendChild(labelTd);
    }

    var productTd = findCell(tr, f.product, ci.product);
    if (productTd) {
      var sep0 = document.createElement('span');
      sep0.className = P + '-sum-sep';
      sep0.textContent = '\u00b7';
      identity.appendChild(sep0);

      var productGroup = document.createElement('span');
      productGroup.className = P + '-product-group';

      // Warning chit (field_2454, view_3512 only)
      if (f.warningCount) {
        var warnTd = findCell(tr, f.warningCount);
        var warnVal = warnTd ? parseFloat((warnTd.textContent || '').replace(/[^0-9.-]/g, '')) : 0;
        if (warnVal > 0) {
          var chit = document.createElement('span');
          chit.className = P + '-warn-chit';
          chit.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 9.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.507l-3.22-3.22a.75.75 0 00-1.06 0l-3.22 3.22-1.72-1.72a.75.75 0 00-1.06 0L2.5 12.993v1.757zM12.75 7a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clip-rule="evenodd"/></svg>'
            + Math.round(warnVal);
          productGroup.appendChild(chit);
        }
      }

      productTd.classList.add(P + '-sum-product');
      productGroup.appendChild(productTd);
      identity.appendChild(productGroup);
    }

    toggleZone.appendChild(identity);
    bar.appendChild(toggleZone);

    // ── Labor Desc (inline, fills middle space — direct-edit) ──
    var laborDescTd = findCell(tr, f.laborDescription);
    if (laborDescTd) {
      var ldGroup = document.createElement('span');
      ldGroup.className = P + '-sum-group ' + P + '-sum-group--fill';
      var ldLabel = document.createElement('span');
      ldLabel.className = P + '-sum-label';
      ldLabel.textContent = 'Labor Desc';
      ldGroup.appendChild(ldLabel);
      ldGroup.appendChild(buildSummaryEditInput(laborDescTd, f.laborDescription));
      bar.appendChild(ldGroup);
    }

    // ── Right-aligned group: bid, labor, qty, ext, move ──
    var rightGroup = document.createElement('span');
    rightGroup.className = P + '-sum-right';

    // Bid
    var bidTd = findCell(tr, f.bid);
    if (bidTd) {
      var bidGroup = document.createElement('span');
      bidGroup.className = P + '-sum-group ' + P + '-sum-group--bid';
      var bidLabel = document.createElement('span');
      bidLabel.className = P + '-sum-label';
      bidLabel.textContent = 'Bid';
      bidGroup.appendChild(bidLabel);
      bidTd.classList.add(P + '-sum-field');
      if (isCellEmpty(bidTd)) bidTd.classList.add(P + '-empty');
      bidGroup.appendChild(bidTd);
      rightGroup.appendChild(bidGroup);
    }

    // Labor $ (direct-edit)
    var laborTd = findCell(tr, f.labor);
    if (laborTd) {
      var labGroup = document.createElement('span');
      labGroup.className = P + '-sum-group ' + P + '-sum-group--labor';
      var labLabel = document.createElement('span');
      labLabel.className = P + '-sum-label';
      labLabel.textContent = 'Labor';
      labGroup.appendChild(labLabel);
      labGroup.appendChild(buildSummaryEditInput(laborTd, f.labor));
      rightGroup.appendChild(labGroup);
    }

    // Qty (view_3505 only, direct-edit)
    if (f.quantity) {
      var qtyTd = findCell(tr, f.quantity);
      if (qtyTd) {
        var qtyGroup = document.createElement('span');
        qtyGroup.className = P + '-sum-group ' + P + '-sum-group--qty';
        var qtyLabel = document.createElement('span');
        qtyLabel.className = P + '-sum-label';
        qtyLabel.textContent = 'Qty';
        qtyGroup.appendChild(qtyLabel);
        qtyGroup.appendChild(buildSummaryEditInput(qtyTd, f.quantity));
        rightGroup.appendChild(qtyGroup);
      }
    }

    // Extended (view_3505 only, read-only)
    if (f.extended) {
      var extTd = findCell(tr, f.extended);
      if (extTd) {
        var extGroup = document.createElement('span');
        extGroup.className = P + '-sum-group ' + P + '-sum-group--ext';
        var extLabel = document.createElement('span');
        extLabel.className = P + '-sum-label';
        extLabel.textContent = 'Extended';
        extGroup.appendChild(extLabel);
        extTd.classList.add(P + '-sum-field-ro');
        extGroup.appendChild(extTd);
        rightGroup.appendChild(extGroup);
      }
    }

    // Move
    var moveTd = findCell(tr, f.move);
    if (moveTd) {
      moveTd.classList.add(P + '-sum-move');
      rightGroup.appendChild(moveTd);
    }

    bar.appendChild(rightGroup);

    return bar;
  }

  // ============================================================
  // BUILD DETAIL PANEL
  // ============================================================

  function buildDetailPanel(tr, viewCfg) {
    var f = viewCfg.fields;
    var ci = viewCfg.columnIndices || {};

    var detail = document.createElement('div');
    detail.className = P + '-detail';

    var sections = document.createElement('div');
    sections.className = P + '-sections';

    // Helper: append a field row only if it wasn't grayed out (null)
    function addRow(section, row) {
      if (row) section.appendChild(row);
    }

    // ── Left column: Equipment Details ──
    var equipSection = buildSection('');

    addRow(equipSection, buildEditableFieldRow('Mounting\nHardware',
      findCell(tr, f.mounting, ci.mounting), f.mounting, { skipEmpty: true }));

    addRow(equipSection, buildEditableFieldRow('SCW Notes',
      findCell(tr, f.scwNotes), f.scwNotes, { notes: true }));

    sections.appendChild(equipSection);

    // ── Right column: Survey Details ──
    var surveySection = buildSection('Survey Details');

    addRow(surveySection, buildEditableFieldRow('Connected to',
      findCell(tr, f.connections), f.connections));

    // Chip stack (boolean chips for exterior/cabling/plenum)
    var chipHostTd = findCell(tr, f.exterior);
    if (chipHostTd && !chipHostTd.classList.contains(GRAYED_CLASS)) {
      var chipStack = chipHostTd.querySelector('.scw-chip-stack');
      if (chipStack) {
        var chipFieldRow = document.createElement('div');
        chipFieldRow.className = P + '-field';

        var chipLabel = document.createElement('div');
        chipLabel.className = P + '-field-label';
        chipLabel.textContent = '';
        chipFieldRow.appendChild(chipLabel);

        chipHostTd.classList.add(P + '-chip-host');
        chipHostTd.classList.add(P + '-field-value');
        chipHostTd.innerHTML = '';
        var chipsRow = document.createElement('div');
        chipsRow.className = P + '-chips';
        while (chipStack.firstChild) {
          chipsRow.appendChild(chipStack.firstChild);
        }
        chipHostTd.appendChild(chipsRow);
        chipFieldRow.appendChild(chipHostTd);
        surveySection.appendChild(chipFieldRow);
      } else {
        addRow(surveySection, buildFieldRow('Exterior',
          chipHostTd));
      }
    }

    if (f.mountingHeight) {
      addRow(surveySection, buildRadioChipRow('Mounting\nHeight',
        findCell(tr, f.mountingHeight), f.mountingHeight, MOUNTING_HEIGHT_OPTIONS));
    }

    if (f.dropLength) {
      addRow(surveySection, buildEditableFieldRow('Drop Length',
        findCell(tr, f.dropLength), f.dropLength));
    }

    if (f.conduitFeet) {
      addRow(surveySection, buildEditableFieldRow('Conduit Ft',
        findCell(tr, f.conduitFeet), f.conduitFeet));
    }

    addRow(surveySection, buildEditableFieldRow('Survey\nNotes',
      findCell(tr, f.surveyNotes), f.surveyNotes, { notes: true }));

    sections.appendChild(surveySection);

    detail.appendChild(sections);

    return detail;
  }

  // ============================================================
  // ACCORDION TOGGLE
  // ============================================================

  function toggleDetail(wsTr) {
    var detail = wsTr.querySelector('.' + P + '-detail');
    var chevron = wsTr.querySelector('.' + P + '-chevron');
    if (!detail) return;

    var isOpen = detail.classList.contains(P + '-open');

    if (isOpen) {
      // Collapse
      detail.classList.remove(P + '-open');
      if (chevron) {
        chevron.classList.remove(P + '-expanded');
        chevron.classList.add(P + '-collapsed');
      }
      // Hide the photo row too
      var photoRow = wsTr.nextElementSibling;
      if (photoRow && photoRow.classList.contains('scw-inline-photo-row')) {
        photoRow.classList.add(P + '-photo-hidden');
      }
    } else {
      // Expand
      detail.classList.add(P + '-open');
      if (chevron) {
        chevron.classList.remove(P + '-collapsed');
        chevron.classList.add(P + '-expanded');
      }
      // Show the photo row
      var photoRow2 = wsTr.nextElementSibling;
      if (photoRow2 && photoRow2.classList.contains('scw-inline-photo-row')) {
        photoRow2.classList.remove(P + '-photo-hidden');
      }
    }
  }

  // ============================================================
  // BUILD FULL WORKSHEET CARD
  // ============================================================

  function buildWorksheetCard(tr, viewCfg) {
    var card = document.createElement('div');
    card.className = P + '-card';

    // Summary bar (always visible)
    var summary = buildSummaryBar(tr, viewCfg);
    card.appendChild(summary);

    // Detail panel (expandable)
    var detail = buildDetailPanel(tr, viewCfg);
    card.appendChild(detail);

    return card;
  }

  // ============================================================
  // TRANSFORM VIEW
  // ============================================================

  function transformView(viewCfg) {
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;

    var table = $view.find('table.kn-table-table, table.kn-table')[0];
    if (!table) return;

    table.classList.remove('is-striped', 'ktlTable--rowHover', 'is-bordered');

    var thead = table.querySelector('thead');
    if (thead) thead.style.display = 'none';

    var $rows = $(table).find('tbody > tr');

    $rows.each(function () {
      var tr = this;

      if (tr.classList.contains('kn-table-group')) return;
      if (tr.classList.contains('scw-inline-photo-row')) return;
      if (tr.classList.contains(WORKSHEET_ROW)) return;

      var recordId = getRecordId(tr);
      if (!recordId) return;
      if (tr.getAttribute(PROCESSED_ATTR) === '1') return;

      var card = buildWorksheetCard(tr, viewCfg);

      var wsTr = document.createElement('tr');
      wsTr.className = WORKSHEET_ROW;
      wsTr.id = tr.id;
      tr.removeAttribute('id');

      // Propagate bucket row classes so worksheet CSS can react
      if (tr.classList.contains('scw-row--assumptions')) wsTr.classList.add('scw-row--assumptions');
      if (tr.classList.contains('scw-row--services'))    wsTr.classList.add('scw-row--services');

      var wsTd = document.createElement('td');

      var headerRow = table.querySelector('thead tr');
      var colCount = 1;
      if (headerRow) {
        colCount = 0;
        var cells = headerRow.children;
        for (var i = 0; i < cells.length; i++) {
          colCount += parseInt(cells[i].getAttribute('colspan') || '1', 10);
        }
      }
      wsTd.setAttribute('colspan', String(colCount));
      wsTd.appendChild(card);
      wsTr.appendChild(wsTd);

      tr.parentNode.insertBefore(wsTr, tr.nextSibling);
      tr.setAttribute(PROCESSED_ATTR, '1');
    });

    // After all rows are processed, hide photo rows for collapsed items
    // and set up the bottom border on the last row of each record group
    var wsRows = table.querySelectorAll('tr.' + WORKSHEET_ROW);
    for (var j = 0; j < wsRows.length; j++) {
      var ws = wsRows[j];
      var photoRow = ws.nextElementSibling;
      if (photoRow && photoRow.classList.contains('scw-inline-photo-row')) {
        // Start collapsed — hide the photo row
        photoRow.classList.add(P + '-photo-hidden');
      }
    }

    // ── RESTORE EXPANDED STATE ──
    // Re-expand detail panels that were open before the inline-edit
    // re-render.  Must run AFTER all worksheet rows + photo rows are
    // built so toggleDetail can find and show the photo row too.
    restoreExpandedState(viewCfg.viewId);
  }

  // ============================================================
  // DELEGATED CLICK HANDLER FOR ACCORDION TOGGLE
  // ============================================================
  // ONLY the toggle-zone (chevron + identity) toggles the detail
  // panel.  All other clicks in the summary bar are left alone so
  // Knack / KTL inline edit can work without interference.

  $(document).on('click' + EVENT_NS, '.' + P + '-toggle-zone', function (e) {
    e.preventDefault();
    var wsTr = this.closest('tr.' + WORKSHEET_ROW);
    if (wsTr) {
      toggleDetail(wsTr);
    }
  });

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    injectStyles();

    WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
      var viewId = viewCfg.viewId;

      $(document)
        .off('knack-view-render.' + viewId + EVENT_NS)
        .on('knack-view-render.' + viewId + EVENT_NS, function () {
          setTimeout(function () { transformView(viewCfg); }, 150);
        });

      $(document)
        .off('knack-cell-update.' + viewId + EVENT_NS)
        .on('knack-cell-update.' + viewId + EVENT_NS, function () {
          // Capture expanded panel state BEFORE Knack re-renders.
          // transformView will restore it after rebuilding.
          captureExpandedState(viewId);
        });

      if ($('#' + viewId).length) {
        setTimeout(function () { transformView(viewCfg); }, 150);
      }
    });
  }

  // Capture ALL worksheet view states on ANY cell-update, because
  // refresh-on-inline-edit.js may trigger model.fetch() on sibling
  // views — causing them to re-render even though the edit wasn't
  // on their view.  The per-view handler above handles the edited
  // view; this generic handler covers the cross-refresh case.
  $(document)
    .off('knack-cell-update' + EVENT_NS + 'All')
    .on('knack-cell-update' + EVENT_NS + 'All', function () {
      captureAllExpandedStates();
    });

  if (document.readyState === 'loading') {
    $(document).ready(init);
  } else {
    init();
  }

  // ── Expose API for coordination with post-edit restore ──
  window.SCW = window.SCW || {};
  window.SCW.deviceWorksheet = {
    /** Capture expanded panel state for all worksheet views. */
    captureState: captureAllExpandedStates,
    /** Force re-transform a view (idempotent). */
    refresh: function (viewId) {
      WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
        if (!viewId || viewCfg.viewId === viewId) {
          transformView(viewCfg);
        }
      });
    }
  };
})();
// ============================================================
// End Device Worksheet
// ============================================================
