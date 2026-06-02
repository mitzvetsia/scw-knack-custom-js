/*** BID REVIEW V2 — CARD *****************************************************
 *
 * HTML factories for the v2 grid:
 *   buildSowSection(grid)        →  one SOW section (header + table)
 *   buildBidRow(row, packages)   →  one <tr> for one line item
 *   buildBidCell(cell, ctx)      →  one <td> for one (row × package) pair
 *
 * Every editable input is OUR input — never a Knack inline-edit field.
 * Inputs carry data-scw-br-v2-field / -record / -view; edit.js handles
 * commit + PUT.
 *
 * Phase 1: qty, rate, labor desc as plain inputs. Chips, connection
 * pickers, change-request buttons come in Phase 2.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns || !ns.CONFIG) return;

  var FK = ns.CONFIG.fieldKeys;
  // Bid records are the FIRST source view (view_3680). All cell PUTs
  // target it because that's where the editable cell records live.
  var BID_VIEW = (ns.CONFIG.sourceViewKeys || [])[0];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '';
    return '$' + Number(n).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  /**
   * One bid cell — the (row × package) intersection. Pure HTML
   * factory; events bind via delegation in edit.js.
   */
  function buildBidCell(cell, recordId) {
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__cell';
    if (!cell) {
      // No bid record for this row/package — render an empty cell so
      // the column lines up. Phase 2 will render "+ Add to bid" here.
      td.classList.add('scw-bid-review-v2__cell--empty');
      td.innerHTML = '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      return td;
    }

    // qty + rate inputs (numeric)
    function inputHtml(fieldKey, value, cls, step) {
      return '<input type="number" class="scw-bid-review-v2-input ' + cls + '"' +
        ' value="' + escapeHtml(value == null ? '' : value) + '"' +
        (step ? ' step="' + step + '"' : '') +
        ' data-scw-br-v2-field="' + fieldKey + '"' +
        ' data-scw-br-v2-record="' + cell.id + '"' +
        ' data-scw-br-v2-view="' + BID_VIEW + '">';
    }

    td.innerHTML =
      '<div class="scw-bid-review-v2__cell-line">' +
        '<label class="scw-bid-review-v2__cell-label">Qty</label>' +
        inputHtml(FK.qty,  cell.qty,  'scw-bid-review-v2-input--qty',  '1') +
      '</div>' +
      '<div class="scw-bid-review-v2__cell-line">' +
        '<label class="scw-bid-review-v2__cell-label">Rate</label>' +
        inputHtml(FK.rate, cell.rate, 'scw-bid-review-v2-input--rate', '0.01') +
      '</div>' +
      '<div class="scw-bid-review-v2__cell-line scw-bid-review-v2__cell-line--ext">' +
        '<label class="scw-bid-review-v2__cell-label">Ext</label>' +
        '<span class="scw-bid-review-v2__cell-ext">' + escapeHtml(fmtMoney(cell.labor)) + '</span>' +
      '</div>' +
      '<div class="scw-bid-review-v2__cell-desc-wrap">' +
        '<textarea class="scw-bid-review-v2-input scw-bid-review-v2-input--desc"' +
          ' rows="2" placeholder="Labor description"' +
          ' data-scw-br-v2-field="' + FK.laborDesc + '"' +
          ' data-scw-br-v2-record="' + cell.id + '"' +
          ' data-scw-br-v2-view="' + BID_VIEW + '">' +
          escapeHtml(ns.transform.stripHtml(cell.laborDesc || '')) +
        '</textarea>' +
      '</div>';

    return td;
  }

  function buildBidRow(row, packages) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__row';
    tr.setAttribute('data-row-id', row.id);
    if (row.sowItem) tr.setAttribute('data-sow-item-id', row.sowItem);

    // Label column
    var labelTd = document.createElement('td');
    labelTd.className = 'scw-bid-review-v2__row-label-cell';
    labelTd.innerHTML =
      '<div class="scw-bid-review-v2__row-label">' +
        escapeHtml(row.displayLabel || row.productName || '(unlabeled)') +
      '</div>' +
      (row.productName && row.displayLabel ?
        '<div class="scw-bid-review-v2__row-product">' + escapeHtml(row.productName) + '</div>' : '');
    tr.appendChild(labelTd);

    // One cell per package
    for (var p = 0; p < packages.length; p++) {
      var pkg = packages[p];
      var cell = row.cellsByPackage[pkg.id] || null;
      tr.appendChild(buildBidCell(cell, row.id));
    }
    return tr;
  }

  function buildSowSection(grid) {
    var section = document.createElement('section');
    section.className = 'scw-bid-review-v2__sow';
    section.setAttribute('data-sow-id', grid.sowId);

    var header = document.createElement('header');
    header.className = 'scw-bid-review-v2__sow-header';
    header.innerHTML =
      '<span class="scw-bid-review-v2__sow-name">' + escapeHtml(grid.sowName) + '</span>' +
      '<span class="scw-bid-review-v2__sow-meta">' +
        grid.rows.length + ' line item' + (grid.rows.length === 1 ? '' : 's') +
        ' × ' + grid.packages.length + ' bid' + (grid.packages.length === 1 ? '' : 's') +
      '</span>';
    section.appendChild(header);

    var table = document.createElement('table');
    table.className = 'scw-bid-review-v2__table';

    // Column headers
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    headRow.innerHTML = '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--label">Line item</th>';
    for (var p = 0; p < grid.packages.length; p++) {
      headRow.innerHTML +=
        '<th class="scw-bid-review-v2__th">' +
          escapeHtml(grid.packages[p].label) +
        '</th>';
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var r = 0; r < grid.rows.length; r++) {
      tbody.appendChild(buildBidRow(grid.rows[r], grid.packages));
    }
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  ns.card = {
    buildSowSection: buildSowSection,
    buildBidRow:     buildBidRow,
    buildBidCell:    buildBidCell
  };
})();
/*** END BID REVIEW V2 — CARD *************************************************/
