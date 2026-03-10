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
      },
      {
        viewId: 'view_3559',
        fields: {
          // ── Summary row ──
          label:            'field_1642',   // DISPLAY_mdf_idf_name (composite identity)

          // ── Detail panel ──
          mdfIdf:           'field_1641',   // MDF/IDF (radio chips: HEADEND, IDF)
          mdfNumber:        'field_2458',   // ## (read-only)
          name:             'field_1943',   // Name (textarea, direct-edit)
          surveyNotes:      'field_2457'    // Survey Notes (textarea, direct-edit)
        },
        // Fields whose changes feed the label formula — saving any of
        // these triggers a lightweight GET to refresh the header text.
        headerTriggerFields: ['field_1641', 'field_2458', 'field_1943']
      },
      {
        viewId: 'view_3575',
        comparisonLayout: true,
        fields: {
          // ── Summary row (laid out like view_3512) ──
          label:            'field_2365',   // Label
          product:          'field_2379',   // Product
          laborDescription: 'field_2409',   // Labor Description
          labor:            'field_2400',   // Labor $

          // ── Detail comparison – SCW side ──
          connections:      'field_2381',   // Connected To
          dropLength:       'field_2367',   // Drop Length
          exterior:         'field_2372',   // Exterior (chip host)
          existingCabling:  'field_2370',   // Existing Cabling
          plenum:           'field_2371',   // Plenum
          mountingHeight:   'field_2455',   // Mounting Height (radio chips)
          conduitFeet:      'field_2368',   // Conduit Feet
          scwNotes:         'field_2412',   // Survey Notes (SCW side)

          // ── Detail comparison – Survey side ──
          surveyLabel:      'field_1950',   // Survey Label
          surveyProduct:    'field_1958',   // Survey Product
          surveyConnections:'field_2197',   // Survey Connected To
          surveyDropLength: 'field_1965',   // Survey Drop Length
          surveyChips:      'field_1972',   // Survey (TBD placeholder)
          surveyNotes:      'field_1953'    // Survey Notes
        }
      },
      {
        viewId: 'view_3313',
        simpleDetail: true,
        fields: {
          // ── Summary row ──
          label:            'field_1950',   // LABEL (read-only)
          product:          'field_1949',   // PRODUCT
          sow:              'field_2154',   // SOW (connection)
          mountCableBoth:   'field_1968',   // Mount Cable Both
          laborDescription: 'field_2020',   // Labor Description
          laborCategory:    'field_2462',   // Labor Category
          laborVariables:   'field_1972',   // Labor Variables
          subBid:           'field_2150',   // sub bid
          plusHrs:           'field_1973',   // +Hrs
          plusMat:           'field_1974',   // +MAT
          installFee:       'field_2028',   // Install Fee (read-only)
          move:             'field_1946',   // Change MDF/IDF (move icon)

          existingCabling:  'field_2461',   // Existing Cabling

          // ── Detail panel ──
          dropPrefix:       'field_2240',   // Drop Prefix (connection — show label)
          dropNumber:       'field_1951',   // # (Label Number)
          dropLength:       'field_1965',   // Drop Length
          mountingHardware: 'field_1963',   // MOUNTs (Mounting Hardware)
          connectedDevice:  'field_2197',   // Connected Device
          scwNotes:         'field_1953'    // SCW Notes
        },
        // Fields whose edits change the calculated Install Fee — save via
        // AJAX PUT so the response carries the refreshed formula value.
        feeTriggerFields: ['field_2461', 'field_1972', 'field_2150', 'field_1973', 'field_1974', 'field_1965']
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
/* view_3559: wider label (no product column, label IS the identity) */
#view_3559 td.${P}-sum-label-cell,
#view_3559 td.${P}-sum-label-cell:hover {
  width: 400px;
  min-width: 400px;
  max-width: 400px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
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
  display: inline-flex !important;
  align-items: center;
  align-self: flex-start;
  padding: 0 4px;
  border: none !important;
  background: transparent !important;
  flex-shrink: 0;
}

/* ── Delete button (extracted from Knack row) ── */
.${P}-sum-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  flex-shrink: 0;
  padding: 0 4px;
  border: none !important;
  background: transparent !important;
}
.${P}-sum-delete a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 14px;
  transition: color 150ms ease;
}
.${P}-sum-delete a:hover {
  color: #ef4444;
}

/* ── Cabling group alignment (match variables column) ── */
.${P}-sum-group--cabling {
  align-self: stretch;
  display: flex;
  align-items: center;
}

/* ── Cabling toggle chit (boolean, inline in summary bar) ── */
.${P}-cabling-chit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  border: 1px solid transparent;
  text-align: center;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
  flex-shrink: 0;
  height: 100%;
  box-sizing: border-box;
  vertical-align: middle;
}
.${P}-cabling-chit.is-yes {
  background-color: #1a6b3c;
  color: #ffffff;
  border-color: #145230;
}
.${P}-cabling-chit.is-yes:hover {
  background-color: #145230;
  box-shadow: 0 1px 3px rgba(20,82,48,0.25);
}
.${P}-cabling-chit.is-no {
  background-color: #f9fafb;
  color: #9ca3af;
  border-color: #d1d5db;
}
.${P}-cabling-chit.is-no:hover {
  background-color: #f3f4f6;
  color: #6b7280;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.${P}-cabling-chit.is-saving {
  opacity: 0.6;
  pointer-events: none;
}

/* ── Summary chip host td — visible for KTL bulk-edit but visually transparent ── */
td.${P}-sum-chip-host {
  display: inline-flex !important;
  align-items: center;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  min-height: 0 !important;
  vertical-align: middle;
}
td.${P}-sum-chip-host:hover,
td.${P}-sum-chip-host.ktlInlineEditableCellsStyle,
td.${P}-sum-chip-host.cell-edit {
  background: transparent !important;
}
/* KTL bulk-edit highlight on chip host */
td.${P}-sum-chip-host.ktlInlineEditableCellsStyle:hover,
td.${P}-sum-chip-host.bulkEditSelectSrc {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
  border-radius: 4px !important;
}
/* When KTL bulk-edit is active on chip hosts, disable chit/chip interaction */
td.${P}-sum-chip-host.bulkEditSelectSrc .${P}-cabling-chit,
td.${P}-sum-chip-host.bulkEditSelectSrc .${P}-radio-chip {
  pointer-events: none !important;
  cursor: cell !important;
}

/* ── field_1972 (Labor Variables): ensure no blue background leaks through ── */
#view_3313 .${P}-sum-group--vars td,
#view_3313 .${P}-sum-group--vars td[style] {
  background: transparent !important;
  background-color: transparent !important;
}

/* ── Summary-bar radio chips (Labor Variables) ── */
.${P}-sum-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
  align-self: center;
}
.${P}-sum-chips .${P}-radio-chip {
  flex: 1 1 calc(50% - 2px);
  min-width: 0;
  text-align: center;
  box-sizing: border-box;
}

/* ── Synthetic group divider bars ── */
tr.scw-synth-divider > td {
  height: 6px;
  padding: 0 !important;
  background: #d1d5db;
  border: none !important;
  line-height: 0;
  font-size: 0;
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
  background-color: #1a6b3c;
  color: #ffffff;
  border-color: #145230;
}
.${P}-radio-chip.is-selected:hover {
  background-color: #145230;
  box-shadow: 0 1px 3px rgba(20,82,48,0.25);
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
  background-color: #dcfce7 !important;
  border-color: #4ade80 !important;
}
.${P}-direct-input.is-error,
.${P}-direct-textarea.is-error {
  background-color: #fef2f2 !important;
  border-color: #fca5a5 !important;
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

/* ── Summary bar inline direct-edit inputs ── */
td.${P}-sum-direct-edit {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0 !important;
}
td.${P}-sum-direct-edit .${P}-direct-input,
td.${P}-sum-direct-edit .${P}-direct-textarea {
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 500;
  width: 100%;
  box-sizing: border-box;
  display: block;
}
td.${P}-sum-direct-edit .${P}-direct-input {
  height: 28px;
}
td.${P}-sum-direct-edit .${P}-direct-textarea {
  resize: vertical;
  min-height: 28px;
  line-height: 1.3;
  white-space: pre-wrap;
  word-wrap: break-word;
}
td.${P}-sum-direct-edit .${P}-direct-error {
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
/* When KTL bulk-edit copy mode is active (KTL adds bulkEditSelectSrc
   to cell-edit tds), disable input interaction so td handles clicks. */
td.${P}-sum-direct-edit.bulkEditSelectSrc {
  cursor: cell !important;
}
td.${P}-sum-direct-edit.bulkEditSelectSrc .${P}-direct-input,
td.${P}-sum-direct-edit.bulkEditSelectSrc .${P}-direct-textarea {
  pointer-events: none !important;
  cursor: cell !important;
}

/* ── Photo row hidden when detail collapsed ── */
tr.scw-inline-photo-row.${P}-photo-hidden {
  display: none !important;
}

/* ================================================================
   COMPARISON LAYOUT (view_3575) – side-by-side SCW vs Survey
   ================================================================ */
.${P}-comp {
  display: grid;
  grid-template-columns: 110px 1fr 1fr;
  gap: 0;
  padding: 8px 16px 12px;
}
.${P}-comp-header {
  display: contents;
}
.${P}-comp-header > div {
  padding: 8px 8px 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #4b5563;
  border-bottom: 2px solid #e5e7eb;
}
.${P}-comp-row {
  display: contents;
}
.${P}-comp-row > div {
  padding: 6px 8px;
  border-bottom: 1px solid #f3f4f6;
  min-height: 28px;
  display: flex;
  align-items: flex-start;
}
.${P}-comp-label {
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-top: 10px !important;
  white-space: pre-line;
  line-height: 1.3;
}
.${P}-comp-val {
  min-width: 0;
  word-break: break-word;
}
.${P}-comp-val > td.${P}-field-value {
  display: block;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  min-height: 24px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.${P}-comp-text {
  display: block;
  padding: 4px 8px;
  font-size: 13px;
  color: #1f2937;
  line-height: 1.5;
}
.${P}-comp-text--empty {
  color: #9ca3af;
  font-style: italic;
}

/* Survey column subtle background to visually distinguish sides */
.${P}-comp-row > .${P}-comp-val:last-child {
  background: #fafbfc;
}

/* Highlight mismatched rows for quick discrepancy identification */
.${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val {
  background: #fffbeb;
}
.${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val:last-child {
  background: #fef3c7;
}

/* view_3313: Product styled as an editable field — same treatment as
   td.sum-field so it blends with the summary bar background */
#view_3313 td.${P}-sum-product,
#view_3313 td.${P}-sum-product:hover {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  border: 1px solid #e5e7eb !important;
  border-radius: 4px;
  background: rgba(134, 182, 223, 0.1) !important;
  padding: 2px 8px;
  height: 30px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s, background-color 0.15s;
}
#view_3313 td.${P}-sum-product.cell-edit:hover,
#view_3313 td.${P}-sum-product.ktlInlineEditableCellsStyle:hover {
  background-color: rgba(134, 182, 223, 0.18) !important;
  border-color: #93c5fd !important;
  cursor: pointer;
}
#view_3313 td.${P}-sum-product.bulkEditSelectSrc {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
  cursor: cell !important;
}
/* Product group width for view_3575 (matches view_3512) */
#view_3575 .${P}-product-group {
  width: 300px;
  min-width: 300px;
  max-width: 300px;
}

/* ================================================================
   VIEW 3313 – SOW Build worksheet
   ================================================================ */
/* Product group as column layout to align with editable fields */
#view_3313 .${P}-product-group {
  width: 280px;
  min-width: 280px;
  max-width: 280px;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}
#view_3313 .${P}-product-group > td.${P}-sum-product {
  width: 100% !important;
  flex: none;
}

/* view_3313: editable summary fields (Sub Bid, +Hrs, +Mat) get blue background */
#view_3313 td.${P}-sum-field.cell-edit,
#view_3313 td.${P}-sum-field.ktlInlineEditableCellsStyle {
  background: rgba(134, 182, 223, 0.1) !important;
}
#view_3313 td.${P}-sum-field.cell-edit:hover,
#view_3313 td.${P}-sum-field.ktlInlineEditableCellsStyle:hover {
  background: rgba(134, 182, 223, 0.18) !important;
}

/* view_3313: top-align all elements; pad non-labeled items to match label height */
#view_3313 .${P}-toggle-zone {
  align-self: flex-start;
  align-items: flex-start;
}
#view_3313 .${P}-chevron {
  margin-top: 11px;
}
#view_3313 td.${P}-sum-label-cell {
  margin-top: 11px;
}
#view_3313 .${P}-sum-sep {
  margin-top: 11px;
}
#view_3313 td.${P}-sum-check {
  align-self: flex-start;
  padding-top: 11px !important;
}
#view_3313 .${P}-sum-delete {
  align-self: flex-start;
  padding-top: 11px;
}

/* view_3313: warning group (SOW empty) — amber background */
.${P}-sum-group--warning td.${P}-sum-field,
.${P}-sum-group--warning td.${P}-sum-field-ro {
  background: rgb(255, 243, 205) !important;
  border-color: #f59e0b !important;
  border: 1px solid #f59e0b !important;
  border-radius: 4px;
}
/* view_3313: danger group (Fee $0/empty) — red background */
.${P}-sum-group--danger td.${P}-sum-field,
.${P}-sum-group--danger td.${P}-sum-field-ro {
  background: rgb(248, 215, 218) !important;
  border-color: #ef4444 !important;
  border: 1px solid #ef4444 !important;
  border-radius: 4px;
}
/* Ensure warning/danger wins over #view_3313 blue editable-field background */
#view_3313 .${P}-sum-group--warning td.${P}-sum-field.cell-edit,
#view_3313 .${P}-sum-group--warning td.${P}-sum-field.ktlInlineEditableCellsStyle {
  background: rgb(255, 243, 205) !important;
  border-color: #f59e0b !important;
}
#view_3313 .${P}-sum-group--danger td.${P}-sum-field.cell-edit,
#view_3313 .${P}-sum-group--danger td.${P}-sum-field.ktlInlineEditableCellsStyle {
  background: rgb(248, 215, 218) !important;
  border-color: #ef4444 !important;
}

/* Fee label — align with value text (match td padding-left) */
.${P}-sum-group--fee > .${P}-sum-label {
  padding-left: 8px;
}

/* Narrow summary groups for compact fields (+Hrs, +Mat, etc.) */
.${P}-sum-group--narrow {
  width: 50px;
  min-width: 50px;
}
.${P}-sum-group--sub-bid {
  width: 65px;
  min-width: 65px;
}
.${P}-sum-group--cat {
  width: 70px;
  min-width: 70px;
}
.${P}-sum-group--vars {
  width: 70px;
  min-width: 70px;
}
.${P}-sum-group--fee {
  width: 70px;
  min-width: 70px;
}
.${P}-sum-group--sow {
  min-width: 110px;
  flex-shrink: 0;
}
/* SOW field grows in height to show multiple connection values */
.${P}-sum-group--sow td.${P}-sum-field {
  height: auto;
  min-height: 30px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
.${P}-sum-group--mcb {
  width: 80px;
  min-width: 80px;
}

/* view_3313 detail sections grid */
#view_3313 .${P}-sections {
  grid-template-columns: 1fr 1fr;
}
@media (max-width: 900px) {
  #view_3313 .${P}-sections {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .${P}-comp {
    grid-template-columns: 90px 1fr 1fr;
  }
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
  var MDF_IDF_OPTIONS = ['HEADEND', 'IDF'];
  var LABOR_VARIABLE_OPTIONS = ['Exterior', 'High Traffic', 'Plenum'];

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
    input._scwPrev = previousValue;

    // Update hidden td back to previous value (detail panel)
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    if (hiddenTd) {
      hiddenTd.textContent = previousValue;
    }
    // Update hidden span (summary bar)
    var hiddenSpan = wrapper ? wrapper.querySelector('span[style*="display"]') : null;
    if (hiddenSpan) hiddenSpan.textContent = previousValue;

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

    setTimeout(function () {
      input.classList.remove('is-saving');
      // Re-evaluate conditional formatting after save completes.
      // The hidden td has already been updated with the new value;
      // recalculate whether the field still meets a danger/warning
      // condition and update the input background accordingly.
      refreshInputConditionalColor(input);
    }, 600);
  }

  /**
   * After a successful save, recalculate the conditional background
   * color (danger/warning) for a direct-edit input based on the
   * updated value in its hidden td.  Clears the color when the
   * condition no longer applies.
   */
  function refreshInputConditionalColor(input) {
    var wrapper = input.parentNode;
    if (!wrapper) return;
    var fieldKey = input.getAttribute('data-field');
    if (!fieldKey) return;

    // Find the view config that governs this input
    var viewEl = input.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (!viewId) return;

    var COLORS_MAP = {
      danger:  'rgb(248, 215, 218)',
      warning: 'rgb(255, 243, 205)'
    };

    // Read value from hidden td (detail panel) or input itself (summary bar)
    var hiddenTd = wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']');
    var rawText = hiddenTd ? (hiddenTd.textContent || '') : (input.value || '');
    var cleaned = rawText.replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ').trim();
    var isEmpty = cleaned === '' || cleaned === '-' || cleaned === '\u2014';
    var isZero = /^[$]?0+(\.0+)?$/.test(cleaned);
    // The element to update classes/styles on
    var styleTd = hiddenTd || wrapper;

    var dangerCls = 'scw-cell-danger';
    var warningCls = 'scw-cell-warning';

    var conditionMet = false;
    var conditionColor = null;

    if (fieldKey === 'field_2400') {
      if (isEmpty) { conditionMet = true; conditionColor = 'danger'; }
      else if (isZero) { conditionMet = true; conditionColor = 'warning'; }
    } else if (fieldKey === 'field_2409') {
      conditionMet = isEmpty;
      conditionColor = 'danger';
    } else if (fieldKey === 'field_2415' || fieldKey === 'field_771') {
      conditionMet = isEmpty;
      conditionColor = 'warning';
    } else if (fieldKey === 'field_2399') {
      conditionMet = isZero;
      conditionColor = 'warning';
    }

    // Update td classes (so the condition is reflected in DOM)
    styleTd.classList.remove(dangerCls, warningCls);
    if (conditionMet && conditionColor === 'danger') {
      styleTd.classList.add(dangerCls);
      styleTd.style.backgroundColor = COLORS_MAP.danger;
    } else if (conditionMet && conditionColor === 'warning') {
      styleTd.classList.add(warningCls);
      styleTd.style.backgroundColor = COLORS_MAP.warning;
    } else {
      styleTd.style.backgroundColor = '';
    }

    // Update the visible input's background
    if (conditionMet && COLORS_MAP[conditionColor]) {
      input.style.backgroundColor = COLORS_MAP[conditionColor];
    } else {
      // Restore the default direct-edit background (light blue tint
      // from the build step or transparent)
      input.style.backgroundColor = 'rgba(134, 182, 223, 0.1)';
    }
  }

  // Number fields that need client-side validation
  var NUMBER_FIELDS = ['field_2367', 'field_2368', 'field_2400', 'field_2399', 'field_2458',
                       'field_2150', 'field_1973', 'field_1974', 'field_1951', 'field_1965'];

  // ============================================================
  // SOFT HEADER REFRESH
  // ============================================================
  //
  // For views whose header label is a Knack formula (e.g. view_3559's
  // field_1642 = composite of field_1641 + field_2458 + field_1943),
  // we read the recalculated formula from the PUT response after
  // saving a trigger field and patch the label td in place.
  //
  // The view-level GET endpoint does NOT return formula fields, so
  // the label must come from the PUT response itself.
  //
  // We also cache the last-known label per record so that if Knack
  // re-renders the view (via model change events), we can re-apply
  // the label in transformView without another round-trip.

  var _labelCache = {};  // recordId → label text

  /** Look up the viewCfg that owns a given viewId. */
  function viewCfgFor(viewId) {
    var views = WORKSHEET_CONFIG.views;
    for (var i = 0; i < views.length; i++) {
      if (views[i].viewId === viewId) return views[i];
    }
    return null;
  }

  /** Returns true if fieldKey is a header-trigger field for viewId. */
  function isHeaderTrigger(viewId, fieldKey) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.headerTriggerFields) return false;
    return cfg.headerTriggerFields.indexOf(fieldKey) !== -1;
  }

  /** Returns true if fieldKey affects the calculated Install Fee. */
  function isFeeTrigger(viewId, fieldKey) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.feeTriggerFields) return false;
    return cfg.feeTriggerFields.indexOf(fieldKey) !== -1;
  }

  /** After a fee-trigger save, patch the Fee cell from the API response
   *  and re-evaluate danger styling on Sub Bid / +Hrs / +Mat groups. */
  function patchFeeFromResponse(viewId, recordId, resp) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.fields.installFee) return;
    var feeField = cfg.fields.installFee;
    var newFee = resp[feeField] || '';

    // Locate the worksheet row for this record
    var wsTr = document.getElementById(recordId);
    if (!wsTr) return;
    var feeTd = wsTr.querySelector('td.' + feeField);
    if (!feeTd) return;

    // Update the fee cell text
    var span = feeTd.querySelector('span');
    if (span) { span.textContent = '\n' + newFee + '\n  '; }
    else { feeTd.textContent = newFee; }

    // Re-evaluate danger: is new fee zero/empty?
    var stripped = newFee.replace(/[\u00a0\s$,]/g, '').trim();
    var feeIsZeroOrEmpty = stripped === '' || stripped === '-' || /^0+(\.0+)?$/.test(stripped);

    // Toggle danger class on the editable sum-groups
    var DANGER = P + '-sum-group--danger';
    ['sub-bid', 'narrow'].forEach(function (suffix) {
      var groups = wsTr.querySelectorAll('.' + P + '-sum-group--' + suffix);
      for (var i = 0; i < groups.length; i++) {
        if (feeIsZeroOrEmpty) groups[i].classList.add(DANGER);
        else                  groups[i].classList.remove(DANGER);
      }
    });
  }

  /** Extract the label text from a Knack API response object. */
  function extractLabelFromResponse(viewId, resp) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.fields.label) return '';
    var labelField = cfg.fields.label;
    var raw = resp[labelField + '_raw'] || resp[labelField] || '';
    return typeof raw === 'string'
      ? raw.replace(/<[^>]*>/g, '').trim()
      : String(raw);
  }

  /**
   * Fetch the record via the OBJECT-level API (which returns formula
   * fields) and apply the label.  The view-level API strips formulas.
   */
  function fetchAndApplyLabel(viewId, recordId) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.fields.label) return;

    if (typeof Knack === 'undefined') return;

    // Derive the object key from the Knack view model
    var view = Knack.views[viewId];
    var objectKey = null;
    try {
      objectKey = view.model.view.source.object;
    } catch (ignored) { /* */ }
    if (!objectKey) {
      console.warn('[scw-ws-header] Cannot determine object key for ' + viewId);
      return;
    }

    console.log('[scw-ws-header] Fetching label via object API (' + objectKey + ') for ' + recordId);

    $.ajax({
      url: Knack.api_url + '/v1/objects/' + objectKey + '/records/' + recordId,
      type: 'GET',
      headers: {
        'X-Knack-Application-Id': Knack.application_id,
        'x-knack-rest-api-key': 'knack',
        'Authorization': Knack.getUserToken()
      },
      success: function (resp) {
        var txt = extractLabelFromResponse(viewId, resp);
        console.log('[scw-ws-header] Object API label for ' + recordId + ': "' + txt + '"');
        if (txt) {
          _labelCache[recordId] = txt;
          applyLabelText(viewId, recordId, txt);
        }
      },
      error: function (xhr) {
        console.warn('[scw-ws-header] Object GET failed for ' + recordId, xhr.status, xhr.responseText);
      }
    });
  }

  /** Patch the label td text for a single record in the DOM. */
  function applyLabelText(viewId, recordId, txt) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.fields.label) return;
    var labelField = cfg.fields.label;

    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    // Find ALL label tds in the view, then match by closest row id
    var allLabels = viewEl.querySelectorAll(
      'td.' + labelField + ', td[data-field-key="' + labelField + '"]'
    );
    for (var i = 0; i < allLabels.length; i++) {
      var row = allLabels[i].closest('tr.' + WORKSHEET_ROW);
      if (row && getRecordId(row) === recordId) {
        allLabels[i].textContent = txt;
        console.log('[scw-ws-header] Applied label for ' + recordId + ': "' + txt + '"');
        return;
      }
    }
    console.warn('[scw-ws-header] Label td not found for ' + recordId);
  }

  /**
   * Called at the end of transformView — re-apply any cached labels
   * that Knack's re-render may have wiped with stale formula data.
   */
  function restoreCachedLabels(viewId) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.fields.label) return;
    var labelField = cfg.fields.label;

    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    var allLabels = viewEl.querySelectorAll(
      'td.' + labelField + ', td[data-field-key="' + labelField + '"]'
    );
    for (var i = 0; i < allLabels.length; i++) {
      var row = allLabels[i].closest('tr.' + WORKSHEET_ROW);
      if (!row) continue;
      var rid = getRecordId(row);
      if (rid && _labelCache[rid]) {
        var current = (allLabels[i].textContent || '').trim();
        if (!current || current === '\u00a0') {
          allLabels[i].textContent = _labelCache[rid];
          console.log('[scw-ws-header] Restored cached label for ' + rid + ': "' + _labelCache[rid] + '"');
        }
      }
    }
  }

  /** Save a direct-edit field value.
   *  For header-trigger fields, always uses AJAX PUT so we can read
   *  the recalculated formula from the response.  For other fields,
   *  prefers model.updateRecord to avoid a full re-render.
   *  Calls onSuccess(resp) or onError(message) when done. */
  function saveDirectEditValue(viewId, recordId, fieldKey, value, onSuccess, onError) {
    if (typeof Knack === 'undefined') return;

    var data = {};
    data[fieldKey] = value;
    var trigger = isHeaderTrigger(viewId, fieldKey);
    var feeTrig = isFeeTrigger(viewId, fieldKey);

    // Non-trigger fields: prefer model.updateRecord (no re-render)
    if (!trigger && !feeTrig) {
      var view = Knack.views[viewId];
      if (view && view.model && typeof view.model.updateRecord === 'function') {
        view.model.updateRecord(recordId, data);
        if (onSuccess) onSuccess(null);
        return;
      }
    }

    // Trigger / fee-trigger fields (or fallback): direct AJAX PUT
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
      success: function (resp) {
        if (feeTrig && resp) patchFeeFromResponse(viewId, recordId, resp);
        if (onSuccess) onSuccess(resp);
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

    // Capture previous value: from hidden td (detail panel) or _scwPrev (summary bar)
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var previousValue = hiddenTd ? readFieldText(hiddenTd) : (input._scwPrev || '');

    // Client-side validation for number fields
    if (NUMBER_FIELDS.indexOf(fieldKey) !== -1) {
      var trimmed = newValue.trim().replace(/[$,]/g, '');
      if (trimmed !== '' && isNaN(Number(trimmed))) {
        showInputError(input, 'Please enter a number', previousValue);
        return;
      }
    }

    // Optimistically update backing store
    if (hiddenTd) {
      hiddenTd.textContent = newValue;
    }
    input._scwPrev = newValue;
    // Update hidden span (summary bar) so dynamic-cell-colors sees new value
    var hiddenSpan = wrapper ? wrapper.querySelector('span[style*="display"]') : null;
    if (hiddenSpan) hiddenSpan.textContent = newValue;

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
        function () {
          showInputSuccess(input);
          if (isHeaderTrigger(viewId, fieldKey)) {
            fetchAndApplyLabel(viewId, recordId);
          }
        },
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
      // Revert to the original value
      target._scwJustSaved = true; // prevent blur save
      var wrapper = target.parentNode;
      var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
      target.value = hiddenTd ? readFieldText(hiddenTd) : (target._scwPrev || '');
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
    var originalVal = hiddenTd ? readFieldText(hiddenTd) : (target._scwPrev || '');
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
  function saveRadioValue(viewId, recordId, fieldKey, value, onSuccess) {
    var data = {};
    data[fieldKey] = value;
    var trigger = isHeaderTrigger(viewId, fieldKey);
    var feeTrig = isFeeTrigger(viewId, fieldKey);

    // Non-trigger: prefer model.updateRecord (no re-render)
    if (!trigger && !feeTrig) {
      var view = typeof Knack !== 'undefined' && Knack.views ? Knack.views[viewId] : null;
      if (view && view.model && typeof view.model.updateRecord === 'function') {
        view.model.updateRecord(recordId, data);
        if (onSuccess) onSuccess(null);
        return;
      }
    }

    // Trigger / fee-trigger fields (or fallback): AJAX PUT — response has the formula
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
        success: function (resp) {
          if (feeTrig && resp) patchFeeFromResponse(viewId, recordId, resp);
          if (onSuccess) onSuccess(resp);
        },
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

    // Let KTL bulk-edit handle the click when active
    var chipTd = chip.closest('td');
    if (chipTd && chipTd.classList.contains('bulkEditSelectSrc')) return;

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

    // Update source td text so re-renders stay in sync
    // (td may be the container's parent when chips are inside it, or a sibling)
    var hiddenTd = container.closest('td[' + RADIO_CHIPS_ATTR + ']')
                || container.parentNode.querySelector('td[' + RADIO_CHIPS_ATTR + ']');
    if (hiddenTd) {
      var hSpan = hiddenTd.querySelector('span[style*="display"]');
      if (hSpan) hSpan.textContent = newValue;
      else hiddenTd.textContent = newValue;
    }

    // Find record ID and view ID, then save
    var wsTr = chip.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = chip.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveRadioValue(viewId, recordId, fieldKey, newValue, function () {
        if (isHeaderTrigger(viewId, fieldKey)) {
          fetchAndApplyLabel(viewId, recordId);
        }
      });
    }
  }, true);

  // ── Capture-phase mousedown: block Knack inline-edit trigger ──
  document.addEventListener('mousedown', function (e) {
    var chip = e.target.closest('.' + RADIO_CHIP_CLASS);
    if (!chip) return;
    var chipTd = chip.closest('td');
    if (chipTd && chipTd.classList.contains('bulkEditSelectSrc')) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ── Capture-phase click handler for cabling toggle chit ──
  var CABLING_CHIT_SEL = '.' + P + '-cabling-chit';
  document.addEventListener('click', function (e) {
    var chit = e.target.closest(CABLING_CHIT_SEL);
    if (!chit) return;

    // Let KTL bulk-edit handle the click when active
    var chitTd = chit.closest('td');
    if (chitTd && chitTd.classList.contains('bulkEditSelectSrc')) return;

    e.stopPropagation();
    e.preventDefault();

    var fieldKey = chit.getAttribute('data-field') || '';
    var isYes = chit.classList.contains('is-yes');
    var newBool = isYes ? 'No' : 'Yes';

    // Toggle visual state
    chit.classList.remove('is-yes', 'is-no');
    chit.classList.add(newBool === 'Yes' ? 'is-yes' : 'is-no', 'is-saving');
    setTimeout(function () { chit.classList.remove('is-saving'); }, 400);

    // Update source td (chit may be inside or beside the td)
    var srcTd = chit.closest('td[data-scw-cabling-src]')
             || chit.parentNode.querySelector('td[data-scw-cabling-src]');
    if (srcTd) {
      var hiddenSpan = srcTd.querySelector('span[style*="display"]');
      if (hiddenSpan) hiddenSpan.textContent = newBool;
    }

    // Save
    var wsTr = chit.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = chit.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveRadioValue(viewId, recordId, fieldKey, newBool);
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    var chitEl = e.target.closest(CABLING_CHIT_SEL);
    if (!chitEl) return;
    var chitTd = chitEl.closest('td');
    if (chitTd && chitTd.classList.contains('bulkEditSelectSrc')) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ============================================================
  // SUMMARY BAR DIRECT-EDIT  (in-place input inside existing td)
  // ============================================================

  /** Inject a direct-edit input into an existing summary bar td.
   *  The td stays visible in the DOM with all its Knack/KTL classes
   *  so bulk-edit can still discover it.  The original span content
   *  is hidden; the previous value is stashed on input._scwPrev.
   *  opts.multiline — use a textarea that wraps and auto-grows. */
  function injectSummaryDirectEdit(td, fieldKey, opts) {
    opts = opts || {};
    var currentVal = readFieldText(td);
    td.classList.add(P + '-sum-direct-edit');

    // Capture conditional bg BEFORE we touch the DOM
    var compBg = window.getComputedStyle(td).backgroundColor;

    // Keep a hidden span with the text value so dynamic-cell-colors
    // (which reads $td.text()) still sees the real content.
    var existingSpan = td.querySelector('span');
    if (existingSpan) {
      existingSpan.style.display = 'none';
    } else {
      var hiddenSpan = document.createElement('span');
      hiddenSpan.style.display = 'none';
      hiddenSpan.textContent = currentVal;
      td.appendChild(hiddenSpan);
    }

    var input;
    if (opts.multiline) {
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
    input._scwPrev = currentVal;

    // Propagate conditional background color from td to input
    if (compBg && compBg !== 'rgba(0, 0, 0, 0)' && compBg !== 'transparent') {
      input.style.backgroundColor = compBg;
    }

    td.appendChild(input);
  }

  // ============================================================
  // SUMMARY GROUP HELPER
  // ============================================================

  /** Append a labelled summary-bar group to a parent element.
   *  opts.readOnly   — use read-only styling (no edit affordance)
   *  opts.directEdit — inject a type-and-save input
   *  opts.fieldKey   — field key for direct-edit save target
   *  opts.cls        — extra CSS class for the group wrapper */
  function appendSumGroup(parent, label, td, opts) {
    opts = opts || {};
    if (!td) return null;
    var group = document.createElement('span');
    group.className = P + '-sum-group' + (opts.cls ? ' ' + opts.cls : '');
    var lbl = document.createElement('span');
    lbl.className = P + '-sum-label';
    lbl.textContent = label;
    group.appendChild(lbl);
    td.classList.add(opts.readOnly ? (P + '-sum-field-ro') : (P + '-sum-field'));
    if (isCellEmpty(td)) td.classList.add(P + '-empty');
    if (opts.directEdit && opts.fieldKey) {
      injectSummaryDirectEdit(td, opts.fieldKey);
    }
    group.appendChild(td);
    parent.appendChild(group);
    return group;
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

      // Empty label so product aligns vertically with editable field values
      if (viewCfg.viewId === 'view_3313') {
        var prodLabel = document.createElement('span');
        prodLabel.className = P + '-sum-label';
        prodLabel.innerHTML = '&nbsp;';
        productGroup.appendChild(prodLabel);
      }

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

    // ── Optional pre-fill groups (SOW shown here for non-3313 views, MCB) ──
    if (f.sow && !f.subBid) {
      // For views without subBid, SOW stays in its original position
      appendSumGroup(bar, 'SOW', findCell(tr, f.sow),
        { cls: P + '-sum-group--sow' });
    }
    if (f.mountCableBoth) {
      appendSumGroup(bar, 'MCB', findCell(tr, f.mountCableBoth),
        { cls: P + '-sum-group--mcb' });
    }

    // ── Labor Desc (inline, fills middle space — direct-edit) ──
    var laborDescTd = findCell(tr, f.laborDescription);
    if (laborDescTd) {
      var ldGroup = document.createElement('span');
      ldGroup.className = P + '-sum-group ' + P + '-sum-group--fill';
      var ldLabel = document.createElement('span');
      ldLabel.className = P + '-sum-label';
      ldLabel.textContent = 'Labor Desc';
      ldGroup.appendChild(ldLabel);
      laborDescTd.classList.add(P + '-sum-field');
      laborDescTd.classList.add(P + '-sum-field--desc');
      injectSummaryDirectEdit(laborDescTd, f.laborDescription, { multiline: true });
      ldGroup.appendChild(laborDescTd);
      bar.appendChild(ldGroup);
    }

    // ── Existing Cabling toggle chit (after Labor Desc) ──
    // Keep the td visible so KTL bulk-edit can discover it; chit goes inside.
    if (f.existingCabling) {
      var cablingTd = findCell(tr, f.existingCabling);
      if (cablingTd) {
        var cablingVal = (cablingTd.textContent || '').replace(/[\u00a0\s]/g, '').trim().toLowerCase();
        var isYes = (cablingVal === 'yes' || cablingVal === 'true');
        var cablingChit = document.createElement('span');
        cablingChit.className = P + '-cabling-chit ' + (isYes ? 'is-yes' : 'is-no');
        cablingChit.setAttribute('data-field', f.existingCabling);
        cablingChit.innerHTML = isYes ? 'Existing<br>Cabling' : 'Existing<br>Cabling';
        // Hide original text but keep td visible for KTL bulk-edit
        var cablingSpan = cablingTd.querySelector('span');
        if (cablingSpan) { cablingSpan.style.display = 'none'; }
        cablingTd.textContent = '';
        if (cablingSpan) cablingTd.appendChild(cablingSpan);
        cablingTd.appendChild(cablingChit);
        cablingTd.classList.add(P + '-sum-chip-host');
        cablingTd.setAttribute('data-scw-cabling-src', '1');
        var cablingWrap = document.createElement('span');
        cablingWrap.className = P + '-sum-group ' + P + '-sum-group--cabling';
        // Empty label placeholder so chit aligns with variables chips
        var cablingLabel = document.createElement('span');
        cablingLabel.className = P + '-sum-label';
        cablingLabel.innerHTML = '&nbsp;';
        cablingWrap.appendChild(cablingLabel);
        cablingWrap.appendChild(cablingTd);
        bar.appendChild(cablingWrap);
      }
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
      laborTd.classList.add(P + '-sum-field');
      injectSummaryDirectEdit(laborTd, f.labor);
      labGroup.appendChild(laborTd);
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
        qtyTd.classList.add(P + '-sum-field');
        injectSummaryDirectEdit(qtyTd, f.quantity);
        qtyGroup.appendChild(qtyTd);
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

    // ── Additional right-aligned fields (view_3313) ──
    if (f.laborCategory) {
      appendSumGroup(rightGroup, 'Cat', findCell(tr, f.laborCategory),
        { cls: P + '-sum-group--cat' });
    }

    // Labor Variables — selectable radio chips
    // Keep the td visible so KTL bulk-edit can discover it; chips go inside.
    if (f.laborVariables) {
      var varsTd = findCell(tr, f.laborVariables);
      if (varsTd) {
        var varsGroup = document.createElement('span');
        varsGroup.className = P + '-sum-group ' + P + '-sum-group--vars';
        var varsLabel = document.createElement('span');
        varsLabel.className = P + '-sum-label';
        varsLabel.textContent = 'Vars';
        varsGroup.appendChild(varsLabel);
        // Hide original text content but keep td visible for KTL
        var varsSpan = varsTd.querySelector('span');
        if (varsSpan) { varsSpan.style.display = 'none'; }
        else {
          var varsHidden = document.createElement('span');
          varsHidden.style.display = 'none';
          varsHidden.textContent = readCellText(varsTd);
          varsTd.appendChild(varsHidden);
        }
        var varsChips = buildRadioChips(varsTd, f.laborVariables, LABOR_VARIABLE_OPTIONS);
        varsChips.classList.add(P + '-sum-chips');
        varsTd.textContent = '';
        if (varsSpan) varsTd.appendChild(varsSpan);
        varsTd.appendChild(varsChips);
        varsTd.classList.add(P + '-sum-chip-host');
        varsTd.setAttribute(RADIO_CHIPS_ATTR, '1');
        varsGroup.appendChild(varsTd);
        rightGroup.appendChild(varsGroup);
      }
    }

    // SOW — moved to right group (before Sub Bid) for view_3313
    if (f.sow && f.subBid) {
      var sowTd = findCell(tr, f.sow);
      var sowGroup = appendSumGroup(rightGroup, 'SOW', sowTd,
        { cls: P + '-sum-group--sow' });
      // Warning styling if SOW is empty
      if (sowTd && isCellEmpty(sowTd) && sowGroup) {
        sowGroup.classList.add(P + '-sum-group--warning');
      }
    }

    // Determine if Fee is $0 or empty (drives danger styling on editable fields)
    var feeTd = f.installFee ? findCell(tr, f.installFee) : null;
    var feeIsZeroOrEmpty = false;
    if (feeTd) {
      var feeText = (feeTd.textContent || '').replace(/[\u00a0\s$,]/g, '').trim();
      feeIsZeroOrEmpty = feeText === '' || feeText === '-' || /^0+(\.0+)?$/.test(feeText);
    }

    if (f.subBid) {
      var sbGroup = appendSumGroup(rightGroup, 'Sub Bid', findCell(tr, f.subBid),
        { cls: P + '-sum-group--sub-bid', directEdit: true, fieldKey: f.subBid });
      if (feeIsZeroOrEmpty && sbGroup) sbGroup.classList.add(P + '-sum-group--danger');
    }
    if (f.plusHrs) {
      var phGroup = appendSumGroup(rightGroup, '+Hrs', findCell(tr, f.plusHrs),
        { cls: P + '-sum-group--narrow', directEdit: true, fieldKey: f.plusHrs });
      if (feeIsZeroOrEmpty && phGroup) phGroup.classList.add(P + '-sum-group--danger');
    }
    if (f.plusMat) {
      var pmGroup = appendSumGroup(rightGroup, '+Mat', findCell(tr, f.plusMat),
        { cls: P + '-sum-group--narrow', directEdit: true, fieldKey: f.plusMat });
      if (feeIsZeroOrEmpty && pmGroup) pmGroup.classList.add(P + '-sum-group--danger');
    }
    if (f.installFee) {
      appendSumGroup(rightGroup, 'Fee', feeTd,
        { cls: P + '-sum-group--fee', readOnly: true });
    }

    // Move – ensure the icon is present (replace-content-with-icon.js
    // may not have run yet on this fresh DOM after a KTL bulk-edit refresh)
    var moveTd = findCell(tr, f.move);
    if (moveTd) {
      if (!moveTd.querySelector('.fa-server')) {
        moveTd.innerHTML =
          '<span style="display:inline-flex; align-items:center; justify-content:center; gap:4px; vertical-align:middle;">' +
            '<i class="fa fa-server" aria-hidden="true" title="Changing Location" style="font-size:22px; line-height:1;"></i>' +
            '<span style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:0; line-height:1;">' +
              '<i class="fa fa-level-up" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
              '<i class="fa fa-level-down" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
            '</span>' +
          '</span>';
      }
      moveTd.classList.add(P + '-sum-move');
      var moveWrap = document.createElement('span');
      moveWrap.className = P + '-sum-group ' + P + '-sum-group--move';
      var moveLabel = document.createElement('span');
      moveLabel.className = P + '-sum-label';
      moveLabel.innerHTML = '&nbsp;';
      moveWrap.appendChild(moveLabel);
      moveWrap.appendChild(moveTd);
      rightGroup.appendChild(moveWrap);
    }

    // ── Delete link (if Knack provides one in this grid) ──
    var deleteLink = tr.querySelector('a.kn-link-delete');
    if (deleteLink) {
      var deleteTd = deleteLink.closest('td');
      var deleteWrap = document.createElement('span');
      deleteWrap.className = P + '-sum-delete';
      deleteWrap.appendChild(deleteLink);
      rightGroup.appendChild(deleteWrap);
      // Remove the now-empty source cell so it doesn't leave a gap
      if (deleteTd && !deleteTd.children.length) {
        deleteTd.style.display = 'none';
      }
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

    if (f.mdfIdf) {
      addRow(equipSection, buildRadioChipRow('MDF/IDF',
        findCell(tr, f.mdfIdf), f.mdfIdf, MDF_IDF_OPTIONS));
    }

    if (f.mdfNumber) {
      addRow(equipSection, buildFieldRow('##',
        findCell(tr, f.mdfNumber)));
    }

    addRow(equipSection, buildEditableFieldRow('Mounting\nHardware',
      findCell(tr, f.mounting, ci.mounting), f.mounting, { skipEmpty: true }));

    if (f.name) {
      addRow(equipSection, buildEditableFieldRow('Name',
        findCell(tr, f.name), f.name, { notes: true }));
    }

    addRow(equipSection, buildFieldRow('SCW Notes',
      findCell(tr, f.scwNotes)));

    sections.appendChild(equipSection);

    // ── Right column: Survey Details ──
    var surveySection = buildSection('Survey Details');

    if (f.connections) {
      addRow(surveySection, buildFieldRow('Connected to',
        findCell(tr, f.connections)));
    }

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
  // BUILD COMPARISON DETAIL PANEL (view_3575)
  // ============================================================
  //
  // Side-by-side layout: Label | SCW Bid value | Survey value
  // for quick visual discrepancy identification.
  //
  // `snapshots` contains text values for fields that were already
  // moved into the summary bar (label, product).

  function buildComparisonDetailPanel(tr, viewCfg, snapshots) {
    var f = viewCfg.fields;

    var detail = document.createElement('div');
    detail.className = P + '-detail';

    var comp = document.createElement('div');
    comp.className = P + '-comp';

    // ── Column headers ──
    var hdr = document.createElement('div');
    hdr.className = P + '-comp-header';
    var hdrLabel = document.createElement('div');
    hdrLabel.className = P + '-comp-label';
    hdr.appendChild(hdrLabel);
    var hdrScw = document.createElement('div');
    hdrScw.textContent = 'SCW Bid';
    hdr.appendChild(hdrScw);
    var hdrSurvey = document.createElement('div');
    hdrSurvey.textContent = 'Survey';
    hdr.appendChild(hdrSurvey);
    comp.appendChild(hdr);

    // ── Helper: build a standard comparison row ──
    function addCompRow(label, scwTd, surveyTd, opts) {
      opts = opts || {};
      var row = document.createElement('div');
      row.className = P + '-comp-row';

      // Label column
      var lbl = document.createElement('div');
      lbl.className = P + '-comp-label';
      lbl.textContent = label;
      row.appendChild(lbl);

      // SCW value column
      var scwVal = document.createElement('div');
      scwVal.className = P + '-comp-val';
      var scwText = '';
      if (scwTd && !scwTd.classList.contains(GRAYED_CLASS)) {
        scwText = readCellText(scwTd);
        scwTd.classList.add(P + '-field-value');
        if (opts.notes) scwTd.classList.add(P + '-field-value--notes');
        scwVal.appendChild(scwTd);
      } else if (opts.scwSnapshot != null) {
        scwText = opts.scwSnapshot;
        var span = document.createElement('span');
        span.className = P + '-comp-text' + (scwText ? '' : ' ' + P + '-comp-text--empty');
        span.textContent = scwText || '\u2014';
        scwVal.appendChild(span);
      } else {
        scwVal.innerHTML = '<span class="' + P + '-comp-text ' + P + '-comp-text--empty">\u2014</span>';
      }
      row.appendChild(scwVal);

      // Survey value column
      var survVal = document.createElement('div');
      survVal.className = P + '-comp-val';
      var survText = '';
      if (surveyTd && !surveyTd.classList.contains(GRAYED_CLASS)) {
        survText = readCellText(surveyTd);
        surveyTd.classList.add(P + '-field-value');
        if (opts.notes) surveyTd.classList.add(P + '-field-value--notes');
        survVal.appendChild(surveyTd);
      } else if (!opts.emptyRight) {
        survVal.innerHTML = '<span class="' + P + '-comp-text ' + P + '-comp-text--empty">\u2014</span>';
      }
      row.appendChild(survVal);

      // Mismatch highlight (when both sides have comparable values)
      if (!opts.skipMismatch && scwText && survText &&
          scwText.toLowerCase() !== survText.toLowerCase()) {
        row.classList.add(P + '-comp-mismatch');
      }

      comp.appendChild(row);
      return row;
    }

    // ── LABEL ──
    addCompRow('Label',
      findCell(tr, f.label),          // may be null if summary took it
      findCell(tr, f.surveyLabel),
      { scwSnapshot: snapshots.label }
    );

    // ── PRODUCT ──
    addCompRow('Product',
      findCell(tr, f.product),        // may be null if summary took it
      findCell(tr, f.surveyProduct),
      { scwSnapshot: snapshots.product }
    );

    // ── CONNECTED TO ──
    addCompRow('Connected To',
      findCell(tr, f.connections),
      findCell(tr, f.surveyConnections)
    );

    // ── DROP LENGTH ──
    addCompRow('Drop Length',
      findCell(tr, f.dropLength),
      findCell(tr, f.surveyDropLength)
    );

    // ── BOOLEAN CHIPS (unlabelled) ──
    // SCW side: reconstituted chip stack (exterior / existing cabling / plenum)
    // Survey side: field_1972 (TBD placeholder)
    var chipsRow = document.createElement('div');
    chipsRow.className = P + '-comp-row';

    var chipsLabel = document.createElement('div');
    chipsLabel.className = P + '-comp-label';
    chipsLabel.textContent = '';
    chipsRow.appendChild(chipsLabel);

    // SCW chips
    var chipsScwVal = document.createElement('div');
    chipsScwVal.className = P + '-comp-val';
    var chipHostTd = findCell(tr, f.exterior);
    if (chipHostTd && !chipHostTd.classList.contains(GRAYED_CLASS)) {
      var chipStack = chipHostTd.querySelector('.scw-chip-stack');
      if (chipStack) {
        chipHostTd.classList.add(P + '-chip-host');
        chipHostTd.classList.add(P + '-field-value');
        chipHostTd.innerHTML = '';
        var chipsWrap = document.createElement('div');
        chipsWrap.className = P + '-chips';
        while (chipStack.firstChild) {
          chipsWrap.appendChild(chipStack.firstChild);
        }
        chipHostTd.appendChild(chipsWrap);
        chipsScwVal.appendChild(chipHostTd);
      } else {
        chipHostTd.classList.add(P + '-field-value');
        chipsScwVal.appendChild(chipHostTd);
      }
    }
    chipsRow.appendChild(chipsScwVal);

    // Survey chips placeholder
    var chipsSurvVal = document.createElement('div');
    chipsSurvVal.className = P + '-comp-val';
    var surveyChipsTd = findCell(tr, f.surveyChips);
    if (surveyChipsTd && !surveyChipsTd.classList.contains(GRAYED_CLASS)) {
      surveyChipsTd.classList.add(P + '-field-value');
      chipsSurvVal.appendChild(surveyChipsTd);
    } else {
      chipsSurvVal.innerHTML = '<span class="' + P + '-comp-text ' + P + '-comp-text--empty">\u2014</span>';
    }
    chipsRow.appendChild(chipsSurvVal);
    comp.appendChild(chipsRow);

    // ── MOUNT HEIGHT (radio chips, SCW only) ──
    var mhRow = document.createElement('div');
    mhRow.className = P + '-comp-row';

    var mhLabel = document.createElement('div');
    mhLabel.className = P + '-comp-label';
    mhLabel.textContent = 'Mount Height';
    mhRow.appendChild(mhLabel);

    var mhScwVal = document.createElement('div');
    mhScwVal.className = P + '-comp-val';
    var mhTd = findCell(tr, f.mountingHeight);
    if (mhTd && !mhTd.classList.contains(GRAYED_CLASS)) {
      var mhWrapper = document.createElement('div');
      mhWrapper.className = P + '-field-value';
      mhWrapper.style.border = 'none';
      mhWrapper.style.padding = '0';
      mhWrapper.style.background = 'transparent';
      var mhChips = buildRadioChips(mhTd, f.mountingHeight, MOUNTING_HEIGHT_OPTIONS);
      mhWrapper.appendChild(mhChips);
      mhTd.style.display = 'none';
      mhTd.setAttribute(RADIO_CHIPS_ATTR, '1');
      mhWrapper.appendChild(mhTd);
      mhScwVal.appendChild(mhWrapper);
    }
    mhRow.appendChild(mhScwVal);

    var mhSurvVal = document.createElement('div');
    mhSurvVal.className = P + '-comp-val';
    mhRow.appendChild(mhSurvVal);
    comp.appendChild(mhRow);

    // ── CONDUIT FEET (SCW only) ──
    addCompRow('Conduit Feet',
      findCell(tr, f.conduitFeet),
      null,
      { emptyRight: true }
    );

    // ── SURVEY NOTES ──
    addCompRow('Survey Notes',
      findCell(tr, f.scwNotes),
      findCell(tr, f.surveyNotes),
      { notes: true }
    );

    detail.appendChild(comp);
    return detail;
  }

  // ============================================================
  // BUILD SIMPLE DETAIL PANEL (view_3313)
  // ============================================================
  //
  // Single-section detail with a flat list of fields.
  // Used when the view doesn't need the two-column
  // Equipment/Survey split of the standard detail panel.

  function buildSimpleDetailPanel(tr, viewCfg) {
    var f = viewCfg.fields;

    var detail = document.createElement('div');
    detail.className = P + '-detail';

    var sections = document.createElement('div');
    sections.className = P + '-sections';

    function addRow(section, row) { if (row) section.appendChild(row); }

    // ── Left column ──
    var leftSection = buildSection('');

    if (f.dropPrefix) {
      addRow(leftSection, buildFieldRow('Drop Prefix',
        findCell(tr, f.dropPrefix)));
    }

    if (f.dropNumber) {
      addRow(leftSection, buildEditableFieldRow('Label #',
        findCell(tr, f.dropNumber), f.dropNumber));
    }

    if (f.mountingHardware) {
      addRow(leftSection, buildFieldRow('Mounting\nHardware',
        findCell(tr, f.mountingHardware)));
    }

    sections.appendChild(leftSection);

    // ── Right column ──
    var rightSection = buildSection('');

    if (f.connectedDevice) {
      addRow(rightSection, buildFieldRow('Connected\nDevice',
        findCell(tr, f.connectedDevice)));
    }

    if (f.dropLength) {
      addRow(rightSection, buildEditableFieldRow('Drop Length',
        findCell(tr, f.dropLength), f.dropLength));
    }

    if (f.scwNotes) {
      addRow(rightSection, buildEditableFieldRow('SCW Notes',
        findCell(tr, f.scwNotes), f.scwNotes, { notes: true }));
    }

    sections.appendChild(rightSection);

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

    // For comparison layouts, snapshot field text values that appear
    // in both the summary and detail BEFORE the summary moves them.
    var snapshots = null;
    if (viewCfg.comparisonLayout) {
      snapshots = {};
      var sf = viewCfg.fields;
      if (sf.label)   snapshots.label   = readCellText(findCell(tr, sf.label));
      if (sf.product) snapshots.product = readCellText(findCell(tr, sf.product));
    }

    // Summary bar (always visible)
    var summary = buildSummaryBar(tr, viewCfg);
    card.appendChild(summary);

    // Detail panel (expandable)
    var detail;
    if (viewCfg.comparisonLayout) {
      detail = buildComparisonDetailPanel(tr, viewCfg, snapshots);
    } else if (viewCfg.simpleDetail) {
      detail = buildSimpleDetailPanel(tr, viewCfg);
    } else {
      detail = buildDetailPanel(tr, viewCfg);
    }
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

      // Tag rows with empty MDF/IDF (move) field BEFORE the td is moved
      var moveTd = findCell(tr, viewCfg.fields.move);
      if (isCellEmpty(moveTd)) wsTr.setAttribute('data-scw-no-move', '1');

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

    // ── SYNTHETIC GROUP HEADERS for ungrouped Assumptions / Services ──
    // In view_3505, rows with an empty MDF/IDF connection (field_2375)
    // that are Assumptions or Services get collected under synthetic
    // group-header rows placed FIRST in the table (before MDF/IDF groups).
    if (viewCfg.viewId === 'view_3505') {
      var tbody = table.querySelector('tbody');
      var colSpan = 1;
      var hdr = table.querySelector('thead tr');
      if (hdr) {
        colSpan = 0;
        var hCells = hdr.children;
        for (var ci = 0; ci < hCells.length; ci++) {
          colSpan += parseInt(hCells[ci].getAttribute('colspan') || '1', 10);
        }
      }

      // Pale blue accent for synthetic groups (matches view accordion style)
      var SYNTH_ACCENT = '#5b9bd5';
      var SYNTH_ACCENT_RGB = '91,155,213';

      // Remove empty native Knack group headers (blank MDF/IDF value)
      // and any orphaned photo rows directly beneath them.
      var nativeGroups = tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1');
      for (var gi = 0; gi < nativeGroups.length; gi++) {
        var grp = nativeGroups[gi];
        if (grp.classList.contains('scw-synthetic-group')) continue;
        var labelText = (grp.textContent || '').replace(/\s+/g, ' ').trim();
        if (labelText.length === 0) {
          // Remove orphaned photo rows that follow this empty header
          var sib = grp.nextElementSibling;
          while (sib && !sib.classList.contains('kn-table-group') &&
                 !sib.classList.contains(WORKSHEET_ROW)) {
            var toRemove = sib;
            sib = sib.nextElementSibling;
            toRemove.remove();
          }
          grp.remove();
        }
      }

      // Helper: build a gray divider row
      function makeDivider() {
        var divTr = document.createElement('tr');
        divTr.className = 'scw-synth-divider';
        var divTd = document.createElement('td');
        divTd.setAttribute('colspan', String(colSpan));
        divTr.appendChild(divTd);
        return divTr;
      }

      // Build synthetic groups in reverse so insertions at top keep order:
      // Project Assumptions first, then Project Services.
      var buckets = [
        { cls: 'scw-row--services',    label: 'Project Services' },
        { cls: 'scw-row--assumptions', label: 'Project Assumptions' }
      ];

      // Track the last inserted row to place the bottom divider after
      var lastInsertedRow = null;
      var anySyntheticBuilt = false;

      buckets.forEach(function (bucket) {
        // Find worksheet rows that belong to this bucket AND have no MDF/IDF.
        var candidates = tbody.querySelectorAll(
          'tr.' + WORKSHEET_ROW + '.' + bucket.cls + '[data-scw-no-move="1"]'
        );
        if (!candidates.length) return;

        anySyntheticBuilt = true;

        // Build a synthetic kn-table-group row styled with pale blue accent
        var groupTr = document.createElement('tr');
        groupTr.className = 'kn-table-group kn-group-level-1 scw-group-header scw-synthetic-group';
        groupTr.style.cssText = '--scw-grp-accent: ' + SYNTH_ACCENT +
          '; --scw-grp-accent-rgb: ' + SYNTH_ACCENT_RGB + ';';
        var groupTd = document.createElement('td');
        groupTd.setAttribute('colspan', String(colSpan));
        groupTd.textContent = bucket.label;
        groupTr.appendChild(groupTd);

        // Collect rows to move (snapshot to avoid live-NodeList issues)
        var rowsToMove = [];
        for (var k = 0; k < candidates.length; k++) {
          var wsRow = candidates[k];
          var origRow = wsRow.previousElementSibling;
          var photoRows = [];
          var nxt = wsRow.nextElementSibling;
          while (nxt && nxt.classList.contains('scw-inline-photo-row')) {
            photoRows.push(nxt);
            nxt = nxt.nextElementSibling;
          }
          rowsToMove.push({
            orig: (origRow && origRow.getAttribute(PROCESSED_ATTR) === '1') ? origRow : null,
            ws: wsRow,
            photos: photoRows
          });
        }

        // Insert the group header at the very top of tbody
        var firstChild = tbody.firstChild;
        tbody.insertBefore(groupTr, firstChild);

        // Insert each row set right after the group header (in order)
        var insertRef = groupTr;
        for (var m = 0; m < rowsToMove.length; m++) {
          var set = rowsToMove[m];
          if (set.orig) {
            insertRef.parentNode.insertBefore(set.orig, insertRef.nextSibling);
            insertRef = set.orig;
          }
          insertRef.parentNode.insertBefore(set.ws, insertRef.nextSibling);
          insertRef = set.ws;
          for (var p = 0; p < set.photos.length; p++) {
            insertRef.parentNode.insertBefore(set.photos[p], insertRef.nextSibling);
            insertRef = set.photos[p];
          }
        }
        lastInsertedRow = insertRef;
      });

      // Insert gray divider bars around the synthetic section
      if (anySyntheticBuilt) {
        // Bottom divider: after the last synthetic group's rows
        if (lastInsertedRow && lastInsertedRow.nextSibling) {
          tbody.insertBefore(makeDivider(), lastInsertedRow.nextSibling);
        } else if (lastInsertedRow) {
          tbody.appendChild(makeDivider());
        }
      }
    }

    // ── RESTORE EXPANDED STATE ──
    // Re-expand detail panels that were open before the inline-edit
    // re-render.  Must run AFTER all worksheet rows + photo rows are
    // built so toggleDetail can find and show the photo row too.
    restoreExpandedState(viewCfg.viewId);

    // ── RE-APPLY GROUP COLLAPSE STATE ──
    // transformView creates new DOM rows that are visible by default.
    // Group-collapse may have already run and set .scw-collapsed on
    // headers before these rows existed.  Explicitly re-enhance so
    // collapsed groups properly hide their new content rows.
    if (window.SCW && window.SCW.groupCollapse && window.SCW.groupCollapse.enhance) {
      window.SCW.groupCollapse.enhance();
    }

    // ── RESTORE CACHED HEADER LABELS ──
    // If a trigger-field save caused this re-render, the rebuilt DOM
    // may have stale formula data.  Re-apply labels from our cache
    // (populated from the PUT response) now that the DOM is stable.
    restoreCachedLabels(viewCfg.viewId);
  }

  // ============================================================
  // DELEGATED CLICK HANDLER FOR ACCORDION TOGGLE
  // ============================================================
  // ONLY the toggle-zone (chevron + identity) toggles the detail
  // panel.  All other clicks in the summary bar are left alone so
  // Knack / KTL inline edit can work without interference.

  $(document).on('click' + EVENT_NS, '.' + P + '-toggle-zone', function (e) {
    // Let clicks on the product cell pass through to KTL / Knack inline-edit
    var target = e.target;
    if (target.closest('.' + P + '-sum-product') || target.closest('.' + P + '-product-group')) {
      return;
    }
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
