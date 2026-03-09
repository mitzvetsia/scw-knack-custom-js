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
          dropLength:       'field_2367',   // Drop Length
          conduitFeet:      'field_2368'    // Conduit Linear Feet
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
          plenum:           'field_2371'
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
/* Narrower product column for view_3512 */
#view_3512 td.${P}-sum-product,
#view_3512 td.${P}-sum-product:hover {
  width: 300px;
  min-width: 300px;
  max-width: 300px;
}

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
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #f3f4f6;
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
@media (max-width: 900px) {
  .${P}-sections {
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
      productTd.classList.add(P + '-sum-product');
      identity.appendChild(productTd);
    }

    toggleZone.appendChild(identity);
    bar.appendChild(toggleZone);

    // ── Labor Desc (inline, fills middle space) ──
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
      if (isCellEmpty(laborDescTd)) laborDescTd.classList.add(P + '-empty');
      ldGroup.appendChild(laborDescTd);
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

    // Labor $
    var laborTd = findCell(tr, f.labor);
    if (laborTd) {
      var labGroup = document.createElement('span');
      labGroup.className = P + '-sum-group';
      var labLabel = document.createElement('span');
      labLabel.className = P + '-sum-label';
      labLabel.textContent = 'Labor';
      labGroup.appendChild(labLabel);
      laborTd.classList.add(P + '-sum-field');
      if (isCellEmpty(laborTd)) laborTd.classList.add(P + '-empty');
      labGroup.appendChild(laborTd);
      rightGroup.appendChild(labGroup);
    }

    // Qty (view_3505 only)
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
        if (isCellEmpty(qtyTd)) qtyTd.classList.add(P + '-empty');
        qtyGroup.appendChild(qtyTd);
        rightGroup.appendChild(qtyGroup);
      }
    }

    // Extended (view_3505 only, read-only)
    if (f.extended) {
      var extTd = findCell(tr, f.extended);
      if (extTd) {
        var extGroup = document.createElement('span');
        extGroup.className = P + '-sum-group';
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

    addRow(equipSection, buildFieldRow('Mounting\nHardware',
      findCell(tr, f.mounting, ci.mounting), { skipEmpty: true }));

    addRow(equipSection, buildFieldRow('SCW Notes',
      findCell(tr, f.scwNotes), { notes: true }));

    sections.appendChild(equipSection);

    // ── Right column: Survey Details ──
    var surveySection = buildSection('Survey Details');

    addRow(surveySection, buildFieldRow('Connected to',
      findCell(tr, f.connections)));

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

    if (f.dropLength) {
      addRow(surveySection, buildFieldRow('Drop Length',
        findCell(tr, f.dropLength)));
    }

    if (f.conduitFeet) {
      addRow(surveySection, buildFieldRow('Conduit Ft',
        findCell(tr, f.conduitFeet)));
    }

    addRow(surveySection, buildFieldRow('Survey\nNotes',
      findCell(tr, f.surveyNotes), { notes: true }));

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
          // On cell update, Knack re-renders — transformView re-runs
        });

      if ($('#' + viewId).length) {
        setTimeout(function () { transformView(viewCfg); }, 150);
      }
    });
  }

  if (document.readyState === 'loading') {
    $(document).ready(init);
  } else {
    init();
  }
})();
// ============================================================
// End Device Worksheet
// ============================================================
