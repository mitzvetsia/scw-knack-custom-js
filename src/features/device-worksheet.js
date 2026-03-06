// ============================================================
// Device Worksheet – stacked card layout for line-item rows
// ============================================================
//
// Transforms flat table rows into grouped "device worksheet" cards
// with sections: (identity), SURVEY DETAILS, BID, and PHOTOS.
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
          // ── Title bar ──
          bid:          'field_2415',   // Bid (column 1)
          move:         'field_2375',   // Move icon (column 2)
          label:        'field_2364',   // Label
          product:      'field_2379',   // Product (column 4)

          // ── Identity section (no header) ──
          mounting:     'field_2379',   // Mounting Acces. (column 5 — same field, different column-index)
          connections:  'field_2381',   // connected to
          scwNotes:     'field_2418',   // SCW Notes

          // ── SURVEY DETAILS ──
          surveyNotes:    'field_2412', // Survey Notes
          exterior:       'field_2372', // Exterior (chip host)
          existingCabling:'field_2370', // Existing Cabling
          plenum:         'field_2371', // Plenum
          dropLength:     'field_2367', // Drop Length
          conduitFeet:    'field_2368', // Conduit Linear Feet

          // ── BID ──
          laborDescription: 'field_2409', // Labor Description
          labor:            'field_2400'  // Labor $
        },
        // Column indices for fields that share the same field key
        // (product and mounting both use field_2379)
        columnIndices: {
          product:  4,
          mounting: 5
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
  var PREFIX         = 'scw-ws';

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

/* ── Kill ALL residual Knack hover / striping.
   We remove is-striped / ktlTable--rowHover from the <table> in JS,
   but these belt-and-suspenders rules catch anything else. ── */
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
tr.${WORKSHEET_ROW} .${PREFIX}-card td,
tr.${WORKSHEET_ROW}:hover .${PREFIX}-card td {
  background-color: transparent !important;
}

/* ── Worksheet row <td> — zero padding so the card fills it ── */
.${WORKSHEET_ROW} > td {
  padding: 0 !important;
  border: none !important;
}

/* ── Photo row — part of the same visual unit as the card above.
   A subtle separator underneath divides one record-pair from the next. ── */
tr.scw-inline-photo-row > td {
  padding: 10px 16px 14px 16px !important;
  border: none !important;
  border-bottom: 2px solid #e2e8f0 !important;
  background: #f8fafc !important;
}

/* ── Card wrapper ── */
.${PREFIX}-card {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: #fff;
  border-radius: 0;
  overflow: hidden;
  border-top: 2px solid #e2e8f0;
}

/* ── Title bar ── */
.${PREFIX}-titlebar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e9eef4;
  flex-wrap: wrap;
}

/* All titlebar items share the same base type */
.${PREFIX}-titlebar-item {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  line-height: 1.4;
  white-space: nowrap;
}

/* Label & Product — plain text, no box, no hover effect */
td.${PREFIX}-titlebar-item.${PREFIX}-titlebar-item--primary,
td.${PREFIX}-titlebar-item.${PREFIX}-titlebar-item--primary:hover {
  font-size: 15px;
  font-weight: 700;
  color: #295f91;
  cursor: default !important;
  border: none !important;
  background: transparent !important;
  padding: 0 4px;
  border-radius: 0;
}

/* The move td sits at the right end */
.${PREFIX}-titlebar-move {
  margin-left: auto;
  display: flex;
  align-items: center;
}

/* Titlebar <td> elements — reset table cell appearance */
td.${PREFIX}-titlebar-item {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 3px;
}

/* Only editable titlebar cells get pointer + hover box */
td.${PREFIX}-titlebar-item.cell-edit,
td.${PREFIX}-titlebar-item.ktlInlineEditableCellsStyle {
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
}
td.${PREFIX}-titlebar-item.cell-edit:hover,
td.${PREFIX}-titlebar-item.ktlInlineEditableCellsStyle:hover {
  background-color: #dbeafe !important;
  border-color: #93c5fd !important;
}

/* Separator dot between titlebar items */
.${PREFIX}-titlebar-sep {
  color: #cbd5e1;
  font-size: 14px;
  user-select: none;
}

/* ── Sections grid ── */
.${PREFIX}-sections {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0;
}
@media (max-width: 900px) {
  .${PREFIX}-sections {
    grid-template-columns: 1fr;
  }
}

/* ── Individual section ── */
.${PREFIX}-section {
  padding: 14px 20px 14px 16px;
  border-right: 1px solid #edf0f4;
  min-width: 0;
}
.${PREFIX}-section:last-child {
  border-right: none;
}

.${PREFIX}-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #94a3b8;
  padding-bottom: 6px;
  margin-bottom: 10px;
  border-bottom: 1px solid #edf0f4;
}

/* ── Field row inside a section ── */
.${PREFIX}-field {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: flex-start;
  min-height: 24px;
}
.${PREFIX}-field:last-child {
  margin-bottom: 0;
}

.${PREFIX}-field-label {
  flex: 0 0 auto;
  min-width: 100px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-top: 5px;
  white-space: nowrap;
}

/* ── The moved <td> becomes the field value container ── */
.${PREFIX}-field-value {
  flex: 1;
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  min-width: 0;
  word-break: break-word;
}

/* Reset <td> styling when it's been reparented into the worksheet.
   Give it a visible input-like appearance so it reads as a form field. */
td.${PREFIX}-field-value {
  display: block;
  padding: 4px 8px;
  border: 1px solid #dde3ea;
  border-radius: 4px;
  background: #fff;
  min-height: 28px;
}

/* ── Editable hover affordance ── */
td.${PREFIX}-field-value.cell-edit,
td.${PREFIX}-field-value.ktlInlineEditableCellsStyle {
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}
td.${PREFIX}-field-value.cell-edit:hover,
td.${PREFIX}-field-value.ktlInlineEditableCellsStyle:hover {
  background-color: #f0f6ff !important;
  border-color: #93c5fd !important;
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25);
}

/* ── Chip host td — invisible cell, chips aligned with fields ── */
td.${PREFIX}-chip-host {
  display: block !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  min-height: 0 !important;
}
td.${PREFIX}-chip-host:hover {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

/* ── Chip row sits in a field row so the left edge
   of the first chip aligns with field values above/below ── */
.${PREFIX}-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 0;
}

/* ── Notes fields — allow more vertical space ── */
td.${PREFIX}-field-value--notes {
  font-size: 12px;
  line-height: 1.5;
  max-height: 120px;
  overflow-y: auto;
}

/* ── Empty field value ── */
.${PREFIX}-field-value--empty {
  color: #cbd5e1;
  font-style: italic;
  font-size: 12px;
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

  /**
   * Find a <td> in a row by field key and optional column index.
   * When column-index is provided, it's used to disambiguate
   * fields that share the same field_key (e.g. field_2379 for
   * both Product and Mounting).
   */
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

  /** Check if a cell contains only whitespace / &nbsp; */
  function isCellEmpty(td) {
    if (!td) return true;
    var text = (td.textContent || '').replace(/[\u00a0\s]/g, '').trim();
    return text.length === 0 && !td.querySelector('img');
  }

  /** Get record id from a row's id attribute. */
  function getRecordId(tr) {
    var trId = tr.id || '';
    var match = trId.match(/[0-9a-f]{24}/i);
    return match ? match[0] : null;
  }

  // ============================================================
  // BUILD WORKSHEET SECTIONS
  // ============================================================

  /**
   * Create a field row that embeds the ACTUAL <td> as the value.
   * The <td> is moved (not cloned) so Knack's event bindings survive.
   *
   * We add our CSS class to the <td> and switch it to display:block
   * so it renders as a normal block element within the flex row.
   */
  function buildFieldRow(label, td, opts) {
    opts = opts || {};
    var row = document.createElement('div');
    row.className = PREFIX + '-field';

    var lbl = document.createElement('div');
    lbl.className = PREFIX + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    if (td && !isCellEmpty(td)) {
      // Add our class to the actual <td>. This turns it into a
      // flex child with display:block and our styling.
      td.classList.add(PREFIX + '-field-value');
      if (opts.notes) td.classList.add(PREFIX + '-field-value--notes');
      // Move the actual <td> into the worksheet layout
      row.appendChild(td);
    } else if (td) {
      // Cell exists but is empty — still move it so edits work,
      // but style it as empty
      td.classList.add(PREFIX + '-field-value');
      td.classList.add(PREFIX + '-field-value--empty');
      if (opts.notes) td.classList.add(PREFIX + '-field-value--notes');
      row.appendChild(td);
    } else {
      // No cell at all — create placeholder
      var placeholder = document.createElement('div');
      placeholder.className = PREFIX + '-field-value ' + PREFIX + '-field-value--empty';
      placeholder.textContent = '\u2014';
      row.appendChild(placeholder);
    }

    return row;
  }

  /**
   * Create a section wrapper with a title.
   * Pass null/empty title for no header (identity section).
   */
  function buildSection(title) {
    var section = document.createElement('div');
    section.className = PREFIX + '-section';

    if (title) {
      var titleEl = document.createElement('div');
      titleEl.className = PREFIX + '-section-title';
      titleEl.textContent = title;
      section.appendChild(titleEl);
    }

    return section;
  }

  /**
   * Build the full worksheet card for a data row.
   * Cells are MOVED out of the <tr> into the card layout.
   */
  function buildWorksheetCard(tr, viewCfg) {
    var f = viewCfg.fields;
    var ci = viewCfg.columnIndices || {};

    var card = document.createElement('div');
    card.className = PREFIX + '-card';

    // ── Title bar ──
    // Move the actual <td> elements so inline-edit bindings survive.
    var titlebar = document.createElement('div');
    titlebar.className = PREFIX + '-titlebar';

    // Bid — move actual <td>
    var bidTd = findCell(tr, f.bid);
    if (bidTd) {
      bidTd.classList.add(PREFIX + '-titlebar-item');
      titlebar.appendChild(bidTd);
    }

    // Separator
    var sep1 = document.createElement('span');
    sep1.className = PREFIX + '-titlebar-sep';
    sep1.textContent = '\u00b7';
    titlebar.appendChild(sep1);

    // Label — move actual <td>, primary styling
    var labelTd = findCell(tr, f.label);
    if (labelTd) {
      labelTd.classList.add(PREFIX + '-titlebar-item');
      labelTd.classList.add(PREFIX + '-titlebar-item--primary');
      titlebar.appendChild(labelTd);
    }

    // Separator
    var sep2 = document.createElement('span');
    sep2.className = PREFIX + '-titlebar-sep';
    sep2.textContent = '\u00b7';
    titlebar.appendChild(sep2);

    // Product — move actual <td>, primary styling
    var productTd = findCell(tr, f.product, ci.product);
    if (productTd) {
      productTd.classList.add(PREFIX + '-titlebar-item');
      productTd.classList.add(PREFIX + '-titlebar-item--primary');
      titlebar.appendChild(productTd);
    }

    // Move (IDF/MDF assignment) — move actual <td>, sits right
    var moveTd = findCell(tr, f.move);
    if (moveTd) {
      moveTd.classList.add(PREFIX + '-titlebar-item');
      moveTd.classList.add(PREFIX + '-titlebar-move');
      titlebar.appendChild(moveTd);
    }

    card.appendChild(titlebar);

    // ── Sections container ──
    var sections = document.createElement('div');
    sections.className = PREFIX + '-sections';

    // ── Identity section (no header) ──
    var identitySection = buildSection(null);

    // Move the actual <td> elements into field rows
    identitySection.appendChild(buildFieldRow('Mounting',
      findCell(tr, f.mounting, ci.mounting)));

    identitySection.appendChild(buildFieldRow('Connected to',
      findCell(tr, f.connections)));

    identitySection.appendChild(buildFieldRow('SCW Notes',
      findCell(tr, f.scwNotes), { notes: true }));

    sections.appendChild(identitySection);

    // ── SURVEY DETAILS ──
    var surveySection = buildSection('Survey Details');

    surveySection.appendChild(buildFieldRow('Notes',
      findCell(tr, f.surveyNotes), { notes: true }));

    // Chip stack — the boolean-chips feature has already transformed
    // the exterior cell into a chip stack. Move the chip elements
    // into a field row so they align with Notes / Drop Length.
    var chipHostTd = findCell(tr, f.exterior);
    if (chipHostTd) {
      var chipStack = chipHostTd.querySelector('.scw-chip-stack');
      if (chipStack) {
        // Build a field row with an empty label to align chips
        // with other field values in the section
        var chipFieldRow = document.createElement('div');
        chipFieldRow.className = PREFIX + '-field';

        var chipLabel = document.createElement('div');
        chipLabel.className = PREFIX + '-field-label';
        chipLabel.textContent = '';  // no label, just spacing
        chipFieldRow.appendChild(chipLabel);

        // Make the chip host td invisible — just holds chips
        chipHostTd.classList.add(PREFIX + '-chip-host');
        chipHostTd.classList.add(PREFIX + '-field-value');
        chipHostTd.innerHTML = '';
        var chipsRow = document.createElement('div');
        chipsRow.className = PREFIX + '-chips';
        while (chipStack.firstChild) {
          chipsRow.appendChild(chipStack.firstChild);
        }
        chipHostTd.appendChild(chipsRow);
        chipFieldRow.appendChild(chipHostTd);
        surveySection.appendChild(chipFieldRow);
      } else {
        surveySection.appendChild(buildFieldRow('Exterior',
          chipHostTd));
      }
    }

    surveySection.appendChild(buildFieldRow('Drop Length',
      findCell(tr, f.dropLength)));

    surveySection.appendChild(buildFieldRow('Conduit Ft',
      findCell(tr, f.conduitFeet)));

    sections.appendChild(surveySection);

    // ── BID ──
    var bidSection = buildSection('Bid');

    bidSection.appendChild(buildFieldRow('Labor Desc.',
      findCell(tr, f.laborDescription), { notes: true }));

    bidSection.appendChild(buildFieldRow('Labor',
      findCell(tr, f.labor)));

    sections.appendChild(bidSection);

    card.appendChild(sections);

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

    // Strip Knack table classes that add row hover/striping —
    // our card layout handles its own styling
    table.classList.remove('is-striped', 'ktlTable--rowHover', 'is-bordered');

    // Hide the table header row — we don't need column headers
    var thead = table.querySelector('thead');
    if (thead) thead.style.display = 'none';

    var $rows = $(table).find('tbody > tr');

    $rows.each(function () {
      var tr = this;

      // Skip group headers, photo rows, and already-processed rows
      if (tr.classList.contains('kn-table-group')) return;
      if (tr.classList.contains('scw-inline-photo-row')) return;
      if (tr.classList.contains(WORKSHEET_ROW)) return;

      // Must have a record ID
      var recordId = getRecordId(tr);
      if (!recordId) return;

      // Skip if already processed
      if (tr.getAttribute(PROCESSED_ATTR) === '1') return;

      // Build the worksheet card — this MOVES cells out of the <tr>
      var card = buildWorksheetCard(tr, viewCfg);

      // Create the worksheet row
      var wsTr = document.createElement('tr');
      wsTr.className = WORKSHEET_ROW;
      // Copy the record id so Knack can still find the row
      wsTr.id = tr.id;
      // Remove id from original to avoid duplicate IDs
      tr.removeAttribute('id');

      var wsTd = document.createElement('td');

      // Count columns for colspan
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

      // Insert the worksheet row right after the data row
      // (before any existing photo row)
      tr.parentNode.insertBefore(wsTr, tr.nextSibling);

      // Mark the original row as processed and hide it
      tr.setAttribute(PROCESSED_ATTR, '1');
    });
  }

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
          // Small delay to let boolean-chips and inline-photo-row run first
          setTimeout(function () { transformView(viewCfg); }, 150);
        });

      $(document)
        .off('knack-cell-update.' + viewId + EVENT_NS)
        .on('knack-cell-update.' + viewId + EVENT_NS, function () {
          // On cell update, Knack re-renders the entire view.
          // Our worksheet rows will be gone — transformView will
          // re-run via knack-view-render.
        });

      // If the view already exists in the DOM, transform immediately
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
