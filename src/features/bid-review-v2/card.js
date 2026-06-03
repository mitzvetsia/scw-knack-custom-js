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

  var FK  = ns.CONFIG.fieldKeys;
  var SFK = ns.CONFIG.sowItemFieldKeys || {};
  // Source views:
  //   [0] view_3680 — bid records  (READ-ONLY in this grid; changes go
  //                                 through Change Requests)
  //   [1] view_3921 — SOW items    (EDITABLE — source of truth)
  var BID_VIEW = (ns.CONFIG.sourceViewKeys || [])[0];
  var SOW_VIEW = (ns.CONFIG.sourceViewKeys || [])[1];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // Cam/reader detection — mirrors v1's showCabling(). Only these
  // buckets get the displayLabel column (E-001, E-002, …) and the
  // cabling/plenum/exterior chips (Phase 2).
  var CAM_READER_BUCKET_ID = '6481e5ba38f283002898113c';
  function isCamReader(row) {
    if (row.proposalBucketId === CAM_READER_BUCKET_ID) return true;
    var b = (row.proposalBucket || '').toLowerCase().trim();
    return b === 'camera' || b === 'cameras' ||
           b === 'reader' || b === 'readers' ||
           /(camera|reader)/.test(b);
  }

  // Chevron SVG — same shape v1's group header uses.
  var GROUP_CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '';
    return '$' + Number(n).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  // ── Photos column ────────────────────────────────────────────
  // Mirrors v1's dedicated Photos column: one large thumb per row with
  // a "+N more" pill for the rest; clicking opens the row's expand
  // panel WITH a side-by-side photo viewer (init.js openWithPhoto).
  // We reuse v1's scraper verbatim — it already handles the 3-path
  // fallback (SOW-side .scw-inline-photo-card → view_3680 model
  // field_771_raw → view_3680 DOM) and caches across re-renders.
  var ROW_PHOTO_VISIBLE = 1;

  function getRowPhotoUrls(row) {
    var fn = window.SCW && SCW.bidReview && SCW.bidReview.scrapeRowPhotoUrls;
    if (typeof fn !== 'function') return null;
    // row.sowItem is the wsTr id (primary path); row.id is a bid
    // record id used by the fallback paths.
    return fn(row.sowItem || null, row.id || null);
  }

  function buildPhotosCell(row) {
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__photos-cell';
    var urls = getRowPhotoUrls(row);
    if (!urls || !urls.length) {
      td.innerHTML = '<div class="scw-bid-review-v2__photos-empty">—</div>';
      return td;
    }

    var stack = document.createElement('div');
    stack.className = 'scw-bid-review-v2__photos-stack';
    stack.setAttribute('title', urls.length + ' photo' +
      (urls.length === 1 ? '' : 's') +
      ' — click to open the editor with a full-size viewer');

    function openViewer(idx, e) {
      // Suppress the row's click-to-expand: we drive expansion ourselves
      // so the viewer mounts together with the panel.
      if (e) { e.preventDefault(); e.stopPropagation(); }
      var rowTr = td.parentNode;
      if (!rowTr || !ns.openWithPhoto) return;
      ns.openWithPhoto(rowTr, urls, idx);
    }

    var visible = Math.min(ROW_PHOTO_VISIBLE, urls.length);
    for (var v = 0; v < visible; v++) {
      (function (idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scw-bid-review-v2__photos-thumb';
        btn.addEventListener('click', function (e) { openViewer(idx, e); });
        var img = document.createElement('img');
        img.src = urls[idx]; img.alt = ''; img.loading = 'lazy';
        btn.appendChild(img);
        stack.appendChild(btn);
      })(v);
    }
    var hidden = urls.length - visible;
    if (hidden > 0) {
      (function (idx) {
        var more = document.createElement('span');
        more.className = 'scw-bid-review-v2__photos-more';
        more.textContent = '+' + hidden + ' more';
        more.addEventListener('click', function (e) { openViewer(idx, e); });
        stack.appendChild(more);
      })(visible);
    }
    td.appendChild(stack);
    return td;
  }

  /**
   * SOW item cell — leftmost data column. Read-only summary of the
   * underlying SOW line item that anchors this row. Edits to SOW
   * fields flow through worksheet-v2; bid-review v2 only displays.
   */
  function buildSowCell(sowItemData) {
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__sow-cell';
    if (!sowItemData) {
      td.classList.add('scw-bid-review-v2__sow-cell--empty');
      td.innerHTML = '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      return td;
    }
    var qtyTxt  = sowItemData.qty ? String(sowItemData.qty) : '—';
    var feeTxt  = sowItemData.fee ? fmtMoney(sowItemData.fee) : '—';
    var descTxt = ns.transform.stripHtml(sowItemData.laborDesc || '');
    td.innerHTML =
      (sowItemData.productName ?
        '<div class="scw-bid-review-v2__sow-product" title="' +
          escapeHtml(sowItemData.productName) + '">' +
          escapeHtml(sowItemData.productName) +
        '</div>' : '') +
      '<div class="scw-bid-review-v2__sow-numbers">' +
        '<span class="scw-bid-review-v2__sow-num"><label>Qty</label>' +
          escapeHtml(qtyTxt) + '</span>' +
        '<span class="scw-bid-review-v2__sow-num"><label>Fee</label>' +
          escapeHtml(feeTxt) + '</span>' +
      '</div>' +
      (descTxt ?
        '<div class="scw-bid-review-v2__sow-desc" title="' +
          escapeHtml(descTxt) + '">' + escapeHtml(descTxt) +
        '</div>' : '');
    return td;
  }

  /**
   * One bid cell — the (row × package) intersection. Pure HTML
   * factory; events bind via delegation in edit.js.
   */
  function buildBidCell(cell, recordId) {
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__cell';
    if (!cell) {
      // No bid record for this row/package — Phase 4 will render
      // "+ Add to bid" here. For now just keep the column aligned.
      td.classList.add('scw-bid-review-v2__cell--empty');
      td.innerHTML = '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      return td;
    }

    var qtyTxt  = cell.qty  ? String(cell.qty) : '—';
    var rateTxt = cell.rate ? fmtMoney(cell.rate) : '—';
    var extTxt  = cell.labor ? fmtMoney(cell.labor) : '—';
    var descTxt = ns.transform.stripHtml(cell.laborDesc || '');

    td.innerHTML =
      (cell.productName ?
        '<div class="scw-bid-review-v2__cell-product" title="' +
          escapeHtml(cell.productName) + '">' +
          escapeHtml(cell.productName) +
        '</div>' : '') +
      '<div class="scw-bid-review-v2__cell-numbers">' +
        '<span class="scw-bid-review-v2__cell-num"><label>Qty</label>' +
          escapeHtml(qtyTxt) + '</span>' +
        '<span class="scw-bid-review-v2__cell-num"><label>Rate</label>' +
          escapeHtml(rateTxt) + '</span>' +
        '<span class="scw-bid-review-v2__cell-num"><label>Ext</label>' +
          escapeHtml(extTxt) + '</span>' +
      '</div>' +
      (descTxt ?
        '<div class="scw-bid-review-v2__cell-desc" title="' +
          escapeHtml(descTxt) + '">' + escapeHtml(descTxt) +
        '</div>' : '');
    // Phase 5 will append the Revise / Remove / +Add-to-bid action stack
    // here. Editing happens through change requests, never inline.
    return td;
  }

  function buildBidRow(row, packages) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__row';
    if (row.sowItem) tr.classList.add('scw-bid-review-v2__row--expandable');
    tr.setAttribute('data-row-id', row.id);
    if (row.sowItem) tr.setAttribute('data-sow-item-id', row.sowItem);
    tr.setAttribute('aria-expanded', 'false');

    // Label column — only show displayLabel (E-001, etc.) for cam/reader
    // rows. Everything else (networking, services, assumptions) is
    // identified by product name only, in the bid cell columns.
    var labelTd = document.createElement('td');
    labelTd.className = 'scw-bid-review-v2__row-label-cell';
    // Expand caret — kept as a direct child of the <td> (absolutely
    // positioned) so the cell stays a table-cell and its background spans
    // the full row height. The stacked content lives in an inner flex div.
    var caretHtml = row.sowItem
      ? '<span class="scw-bid-review-v2__row-caret" aria-hidden="true">' +
          GROUP_CHEVRON_SVG + '</span>'
      : '';
    var labelHtml = '';
    // Bulk-select checkbox — keyed on the SOW line-item id so the shared
    // worksheet-v2 bulk module (mounted on the SOW view) drives selection
    // + the floating edit/delete toolbar. Only for rows backed by a SOW
    // item (the editable record).
    if (row.sowItem) {
      labelHtml +=
        '<input type="checkbox" class="scw-br-v2-rowselect" ' +
        'data-scw-ws-v2-select="' + escapeHtml(row.sowItem) + '" ' +
        'aria-label="Select line item">';
    }
    if (isCamReader(row) && row.displayLabel) {
      labelHtml +=
        '<div class="scw-bid-review-v2__row-label">' +
          escapeHtml(row.displayLabel) + '</div>';
    }
    // Per-row SOW totals — Equipment Total above Install Fee, mirroring
    // v1's leftmost column. Read from the SOW item snapshot.
    var sd = row.sowItemData;
    if (sd && (sd.equipmentTotal || sd.installFee)) {
      labelHtml += '<div class="scw-bid-review-v2__row-totals">';
      if (sd.equipmentTotal) {
        labelHtml +=
          '<div class="scw-bid-review-v2__row-total scw-bid-review-v2__row-total--equip">' +
            '<span class="scw-bid-review-v2__row-total-label">Equip</span>' +
            '<span class="scw-bid-review-v2__row-total-value">' +
              escapeHtml(fmtMoney(sd.equipmentTotal)) + '</span>' +
          '</div>';
      }
      if (sd.installFee) {
        labelHtml +=
          '<div class="scw-bid-review-v2__row-total scw-bid-review-v2__row-total--install">' +
            '<span class="scw-bid-review-v2__row-total-label">Install</span>' +
            '<span class="scw-bid-review-v2__row-total-value">' +
              escapeHtml(fmtMoney(sd.installFee)) + '</span>' +
          '</div>';
      }
      labelHtml += '</div>';
    }
    labelTd.innerHTML = caretHtml +
      '<div class="scw-bid-review-v2__row-label-inner">' + labelHtml + '</div>';
    tr.appendChild(labelTd);

    // Photos column — one big thumb + "+N more"; click opens the
    // expand panel with a side-by-side viewer (v1 parity).
    tr.appendChild(buildPhotosCell(row));

    // SOW item column — anchors the row, always second from left.
    tr.appendChild(buildSowCell(row.sowItemData));

    // One cell per bid package
    for (var p = 0; p < packages.length; p++) {
      var pkg = packages[p];
      var cell = row.cellsByPackage[pkg.id] || null;
      tr.appendChild(buildBidCell(cell, row.id));
    }
    return tr;
  }

  function buildL1HeaderRow(group, colspan) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__group-header';
    tr.setAttribute('data-l1-id', group.key);
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-expanded', 'true');
    var td = document.createElement('td');
    td.colSpan = colspan;
    var rowCount =
      (group.rows ? group.rows.length : 0) +
      (group.subgroups || []).reduce(function (a, s) { return a + s.rows.length; }, 0);
    td.innerHTML =
      '<div class="scw-bid-review-v2__grp-inner">' +
        '<span class="scw-bid-review-v2__grp-chevron">' + GROUP_CHEVRON_SVG + '</span>' +
        '<span class="scw-bid-review-v2__grp-title">' + escapeHtml(group.label) + '</span>' +
        '<span class="scw-bid-review-v2__grp-count">' + rowCount + '</span>' +
      '</div>';
    tr.appendChild(td);
    return tr;
  }

  function buildL2HeaderRow(sub, colspan) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__subgroup-header';
    var td = document.createElement('td');
    td.colSpan = colspan;
    td.innerHTML =
      '<div class="scw-bid-review-v2__subgrp-inner">' +
        '<span class="scw-bid-review-v2__subgrp-title">' + escapeHtml(sub.label) + '</span>' +
        '<span class="scw-bid-review-v2__subgrp-count">' + sub.rows.length + '</span>' +
      '</div>';
    tr.appendChild(td);
    return tr;
  }

  function appendGroup(tbody, group, packages, colspan) {
    // Level 0 means "flat" — no MDF/IDF on any row, just render rows.
    if (group.level === 1) tbody.appendChild(buildL1HeaderRow(group, colspan));
    // Direct rows (when there are no subgroups).
    for (var i = 0; i < group.rows.length; i++) {
      tbody.appendChild(buildBidRow(group.rows[i], packages));
    }
    // Subgroups (L2 — proposal bucket).
    var subs = group.subgroups || [];
    for (var s = 0; s < subs.length; s++) {
      var sub = subs[s];
      tbody.appendChild(buildL2HeaderRow(sub, colspan));
      for (var sr = 0; sr < sub.rows.length; sr++) {
        tbody.appendChild(buildBidRow(sub.rows[sr], packages));
      }
    }
  }

  // One labelled money figure in a column header (Sub Bid / Install).
  function headTotal(label, amount) {
    return '<div class="scw-bid-review-v2__head-total">' +
      '<span class="scw-bid-review-v2__head-total-label">' + escapeHtml(label) + '</span>' +
      '<span class="scw-bid-review-v2__head-total-value">' +
        escapeHtml(fmtMoney(amount) || '$0.00') + '</span>' +
    '</div>';
  }

  // A bid (package) column header: title, bid label, sub-bid total, and a
  // match/gap delta vs the SOW. Identity (status/PDF/CR) + actions land in
  // later phases.
  function buildPkgHead(pkg) {
    var delta;
    if (pkg.matchesSow) {
      delta = '<div class="scw-bid-review-v2__head-delta scw-bid-review-v2__head-delta--match">' +
        '✓ matches SOW</div>';
    } else {
      var sign = pkg.deltaVsSow > 0 ? '+' : '−';
      delta = '<div class="scw-bid-review-v2__head-delta scw-bid-review-v2__head-delta--gap">' +
        sign + (fmtMoney(Math.abs(pkg.deltaVsSow)) || '$0.00') + ' vs SOW</div>';
    }
    return '<th class="scw-bid-review-v2__th scw-bid-review-v2__head--pkg" ' +
        'data-pkg-id="' + escapeHtml(pkg.id) + '">' +
      '<div class="scw-bid-review-v2__head-title">Subcontractor Bid</div>' +
      '<div class="scw-bid-review-v2__head-subtitle">' + escapeHtml(pkg.label) + '</div>' +
      '<div class="scw-bid-review-v2__head-totals">' +
        headTotal('Sub Bid', pkg.subBidTotal) +
      '</div>' +
      delta +
    '</th>';
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

    // Column headers — Line item | Photos | SOW (totals) | Bid… (totals + delta)
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    headRow.className = 'scw-bid-review-v2__head-row';
    var totals = grid.sowTotals || { subBid: 0, install: 0 };
    var headHtml =
      '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--label"></th>' +
      '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--photos">Photos</th>' +
      '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--sow scw-bid-review-v2__head--sow">' +
        '<div class="scw-bid-review-v2__head-title">SCW SOW</div>' +
        '<div class="scw-bid-review-v2__head-totals">' +
          headTotal('Sub Bid', totals.subBid) +
          headTotal('Install', totals.install) +
        '</div>' +
      '</th>';
    for (var p = 0; p < grid.packages.length; p++) {
      headHtml += buildPkgHead(grid.packages[p]);
    }
    headRow.innerHTML = headHtml;
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    // colspan = label + photos + sow + one per bid package
    var colspan = grid.packages.length + 3;
    var groups = grid.groups || [{ key: '__all__', level: 0, rows: grid.rows, subgroups: [] }];
    for (var g = 0; g < groups.length; g++) {
      appendGroup(tbody, groups[g], grid.packages, colspan);
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
