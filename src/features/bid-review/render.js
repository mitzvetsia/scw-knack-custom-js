/*** BID REVIEW — RENDERING ***/
/**
 * Pure rendering: state object → DOM nodes.
 * Renders one grid (table) per SOW, each with bid-package columns.
 *
 * Reads : SCW.bidReview.CONFIG (mountSelector)
 * Writes: SCW.bidReview.renderMatrix(state), .renderToast(msg, type),
 *         .showLoading(), .clearMount()
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  var TOAST_ID = 'scw-bid-review-toast';

  // ── html helpers ────────────────────────────────────────────

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  var ESC_RE  = /[&<>"']/g;

  function esc(str) {
    return String(str == null ? '' : str).replace(ESC_RE, function (c) { return ESC_MAP[c]; });
  }

  function formatCurrency(val) {
    if (val == null || val === 0) return '$0.00';
    return '$' + Number(val).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ── element factories ───────────────────────────────────────

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function btn(label, cssModifier, attrs) {
    var b = el('button', 'scw-bid-review__btn scw-bid-review__btn--' + cssModifier, label);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        b.setAttribute(keys[i], attrs[keys[i]]);
      }
    }
    return b;
  }

  // ── chevron SVG ──────────────────────────────────────────────

  var CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 12 15 18 9"></polyline></svg>';

  // ── mount point ─────────────────────────────────────────────

  function getOrCreateMount() {
    var mount = document.querySelector(CFG.mountSelector);
    if (!mount) {
      mount = el('div');
      mount.id = CFG.mountSelector.replace(/^#/, '');
      // Insert after the nav menu (view_44)
      var nav = document.getElementById('view_44');
      if (nav && nav.nextSibling) {
        nav.parentNode.insertBefore(mount, nav.nextSibling);
      } else if (nav) {
        nav.parentNode.appendChild(mount);
      } else {
        var scene = document.getElementById(CFG.sceneKey);
        if (scene) {
          scene.insertBefore(mount, scene.firstChild);
        } else {
          document.body.appendChild(mount);
        }
      }
    }
    return mount;
  }

  // ── table header for a SOW grid ─────────────────────────────

  function buildHeaderRow(sowGrid) {
    var tr = el('tr', 'scw-bid-review__header-row');

    // Line item column header
    tr.appendChild(el('th', 'scw-bid-review__sow-header', 'Line Item'));

    // SOW detail column header
    tr.appendChild(el('th', 'scw-bid-review__sow-detail-header', 'SOW Detail'));

    // One header per bid package
    for (var i = 0; i < sowGrid.packages.length; i++) {
      var pkg = sowGrid.packages[i];
      var elig = sowGrid.eligibility[pkg.id] || { adoptable: 0, creatable: 0, total: 0 };

      var th = el('th', 'scw-bid-review__pkg-header');

      var nameRow = el('div', 'scw-bid-review__pkg-name');
      nameRow.textContent = pkg.name;
      if (pkg.pdfUrl) {
        var pdfLink = document.createElement('a');
        pdfLink.href = pkg.pdfUrl;
        pdfLink.target = '_blank';
        pdfLink.title = pkg.pdfFilename || 'View PDF';
        pdfLink.className = 'scw-bid-review__pdf-link';
        pdfLink.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';
        nameRow.appendChild(pdfLink);
      }
      th.appendChild(nameRow);

      var actions = el('div', 'scw-bid-review__pkg-actions');
      actions.appendChild(btn(
        'Copy to SOW', 'adopt',
        { 'data-action': 'package_copy_to_sow', 'data-package-id': pkg.id, 'data-sow-id': sowGrid.sowId }
      ));
      actions.appendChild(btn(
        'Create new SOW', 'create',
        { 'data-action': 'package_create_sow', 'data-package-id': pkg.id, 'data-sow-id': sowGrid.sowId }
      ));
      th.appendChild(actions);

      tr.appendChild(th);
    }

    // Change Requests column header (with Clear All + Submit controls)
    var crTh = el('th', 'scw-bid-review__actions-header');
    crTh.appendChild(el('div', 'scw-bid-review__cr-col-title', 'Change Requests'));

    var pending = (ns.changeRequests && ns.changeRequests.getPending) ? ns.changeRequests.getPending() : {};
    var hasPending = Object.keys(pending).length > 0;

    if (hasPending) {
      var crActions = el('div', 'scw-bid-review__cr-col-actions');

      // Per-package submit buttons
      var pkgIds = Object.keys(pending);
      for (var si = 0; si < pkgIds.length; si++) {
        var sPkg = pending[pkgIds[si]];
        if (!sPkg || !sPkg.items || !sPkg.items.length) continue;
        var subBtn = btn(
          'Submit ' + sPkg.pkgName + ' (' + sPkg.items.length + ')', 'cr-submit sm',
          { 'data-action': 'cr_submit', 'data-pkg-id': pkgIds[si] }
        );
        crActions.appendChild(subBtn);
      }

      // Clear All
      crActions.appendChild(btn('Clear All', 'cr-clear sm', { 'data-action': 'cr_clear_all' }));
      crTh.appendChild(crActions);
    }

    tr.appendChild(crTh);

    return tr;
  }

  // ── cabling visibility helper ─────────────────────────────────

  /** Cabling fields only apply to Camera / Reader buckets. */
  var CABLING_BUCKET_ID = '6481e5ba38f283002898113c';

  function showCabling(row) {
    if (row.proposalBucketId === CABLING_BUCKET_ID) return true;
    if (!row.proposalBucket) return false;
    var b = row.proposalBucket.toLowerCase().trim();
    return b === 'camera' || b === 'cameras' ||
           b === 'reader' || b === 'readers';
  }

  // ── existing cabling chip ────────────────────────────────────

  function isYes(val) {
    return val && /^yes$/i.test(String(val).trim());
  }

  // ── connected-device visibility helper ───────────────────────

  /**
   * Show Connected Devices when field_2374 is Yes on any bid cell
   * in the row, OR when field_2231 is Yes on the SOW item
   * (especially when no bid item is present).
   */
  function showConnectedDevices(row) {
    // SOW side: field_2231
    if (isYes(row.sowMapConn)) return true;
    // Bid side: check every package cell for field_2374
    var pkgs = Object.keys(row.cellsByPackage || {});
    for (var i = 0; i < pkgs.length; i++) {
      if (isYes(row.cellsByPackage[pkgs[i]].bidMapConn)) return true;
    }
    return false;
  }

  // ── qty visibility helper ─────────────────────────────────────

  /** Show Qty when EITHER SOW qty or any bid cell qty is > 1. */
  function showQty(row) {
    if (row.sowQty > 1) return true;
    var pkgs = Object.keys(row.cellsByPackage || {});
    for (var i = 0; i < pkgs.length; i++) {
      if (row.cellsByPackage[pkgs[i]].qty > 1) return true;
    }
    return false;
  }

  function buildCablingChip(val) {
    if (isYes(val)) {
      return el('span', 'scw-bid-review__cabling-chip scw-bid-review__cabling-chip--on', 'Existing Cabling');
    }
    // "No" or empty — render a dim off chip
    return el('span', 'scw-bid-review__cabling-chip scw-bid-review__cabling-chip--off', 'New Cabling');
  }

  // ── SOW detail cell ─────────────────────────────────────────

  /** diff class helper — appends --field-diff modifier when flagged */
  var DIFF_CLS = 'scw-bid-review__field-diff';

  function buildSowDetailCell(row, cablingVisible, connDevVisible, qtyVisible, diffs) {
    var td = el('td', 'scw-bid-review__sow-detail');

    if (!row.sowItem) {
      td.className += ' scw-bid-review__cell--missing';
      td.textContent = '\u2014';
      return td;
    }

    if (row.sowProduct) {
      var prodEl = el('div', 'scw-bid-review__cell-label', row.sowProduct);
      if (diffs && diffs.product) prodEl.classList.add(DIFF_CLS);
      td.appendChild(prodEl);
    }

    if (qtyVisible && row.sowQty) {
      var qtyEl = el('div', 'scw-bid-review__cell-qty');
      qtyEl.appendChild(el('span', 'scw-bid-review__field-label', 'Qty: '));
      qtyEl.appendChild(document.createTextNode(row.sowQty));
      td.appendChild(qtyEl);
    }

    if (row.sowLaborDesc) {
      var ldEl = el('div', 'scw-bid-review__cell-labor-desc');
      ldEl.appendChild(el('span', 'scw-bid-review__field-label', 'Labor Desc: '));
      ldEl.appendChild(document.createTextNode(row.sowLaborDesc));
      if (diffs && diffs.laborDesc) ldEl.classList.add(DIFF_CLS);
      td.appendChild(ldEl);
    }

    if (connDevVisible && row.sowConnDevice) {
      var cdEl = el('div', 'scw-bid-review__cell-conn-device', row.sowConnDevice);
      if (diffs && diffs.connDevice) cdEl.classList.add(DIFF_CLS);
      td.appendChild(cdEl);
    }

    if (cablingVisible) {
      var cabEl = buildCablingChip(row.sowExistCabling);
      if (diffs && diffs.cabling) cabEl.classList.add(DIFF_CLS);
      td.appendChild(cabEl);
    }

    if (row.sowFee) {
      var values = el('div', 'scw-bid-review__cell-values');
      var feeEl = el('span', 'scw-bid-review__cell-value', formatCurrency(row.sowFee));
      if (diffs && diffs.fee) feeEl.classList.add(DIFF_CLS);
      values.appendChild(feeEl);
      td.appendChild(values);
    }

    return td;
  }

  // ── data cell for a bid package column ──────────────────────

  function buildDataCell(cell, cablingVisible, connDevVisible, qtyVisible, diffs) {
    var td = el('td');

    if (!cell) {
      td.className = 'scw-bid-review__cell--missing';
      td.textContent = '\u2014';
      return td;
    }

    if (cell.productName) {
      var prodEl = el('div', 'scw-bid-review__cell-label', cell.productName);
      if (diffs && diffs.product) prodEl.classList.add(DIFF_CLS);
      td.appendChild(prodEl);
    }

    if (qtyVisible && cell.qty) {
      var qtyEl = el('div', 'scw-bid-review__cell-qty');
      qtyEl.appendChild(el('span', 'scw-bid-review__field-label', 'Qty: '));
      qtyEl.appendChild(document.createTextNode(cell.qty));
      td.appendChild(qtyEl);
    }

    if (cell.laborDesc) {
      var ldEl = el('div', 'scw-bid-review__cell-labor-desc');
      ldEl.appendChild(el('span', 'scw-bid-review__field-label', 'Labor Desc: '));
      ldEl.appendChild(document.createTextNode(cell.laborDesc));
      if (diffs && diffs.laborDesc) ldEl.classList.add(DIFF_CLS);
      td.appendChild(ldEl);
    }

    if (connDevVisible && cell.bidConnDevice) {
      var cdEl = el('div', 'scw-bid-review__cell-conn-device', cell.bidConnDevice);
      if (diffs && diffs.connDevice) cdEl.classList.add(DIFF_CLS);
      td.appendChild(cdEl);
    }

    if (cablingVisible) {
      var cabEl = buildCablingChip(cell.bidExistCabling);
      if (diffs && diffs.cabling) cabEl.classList.add(DIFF_CLS);
      td.appendChild(cabEl);
    }

    if (cell.labor) {
      var values = el('div', 'scw-bid-review__cell-values');
      var feeEl = el('span', 'scw-bid-review__cell-value', formatCurrency(cell.labor));
      if (diffs && diffs.fee) feeEl.classList.add(DIFF_CLS);
      values.appendChild(feeEl);
      td.appendChild(values);
    }

    if (cell.notes) {
      td.appendChild(el('hr', 'scw-bid-review__cell-notes-divider'));
      var notesEl = el('div', 'scw-bid-review__cell-notes');
      notesEl.appendChild(el('span', 'scw-bid-review__field-label', 'Survey Note: '));
      notesEl.appendChild(document.createTextNode(cell.notes));
      td.appendChild(notesEl);
    }

    return td;
  }

  // ── row actions cell ────────────────────────────────────────

  function buildRowActionsCell(row, packages, sowId, visibility) {
    var td = el('td');
    var wrap = el('div', 'scw-bid-review__row-actions');

    // Create buttons — only for NEW items (no SOW match)
    if (!row.sowItem) {
      for (var i = 0; i < packages.length; i++) {
        var pkg = packages[i];
        var cell = row.cellsByPackage[pkg.id];
        if (!cell) continue;

        wrap.appendChild(btn(
          'Create \u2190 ' + pkg.name, 'create sm',
          { 'data-action': 'row_create', 'data-row-id': row.id, 'data-package-id': pkg.id, 'data-sow-id': sowId }
        ));
      }
    }

    // Per-package "Request Change" / "Edit Change" buttons
    var pending = (ns.changeRequests && ns.changeRequests.getPending) ? ns.changeRequests.getPending() : {};
    for (var ci = 0; ci < packages.length; ci++) {
      var cpkg = packages[ci];
      var ccell = row.cellsByPackage[cpkg.id];
      if (!ccell) continue;

      // Check if there's an existing pending change for this row+package
      var pendingItem = null;
      if (pending[cpkg.id] && pending[cpkg.id].items) {
        for (var pi = 0; pi < pending[cpkg.id].items.length; pi++) {
          if (pending[cpkg.id].items[pi].rowId === row.id) { pendingItem = pending[cpkg.id].items[pi]; break; }
        }
      }

      // Only hide change request UI when require sub bid is explicitly No
      var noSubBid = ccell.requireSubBid && /^no$/i.test(String(ccell.requireSubBid).trim());

      if (!noSubBid) {
        // Show pending card FIRST (above buttons)
        if (pendingItem && ns.changeRequests && ns.changeRequests.buildSummaryCard) {
          wrap.appendChild(ns.changeRequests.buildSummaryCard(pendingItem, cpkg.id));
        }

        var crLabel = pendingItem ? ('\u270E Edit Change \u2014 ' + cpkg.name) : ('Request Change \u2014 ' + cpkg.name);
        var crMod   = pendingItem ? 'change-edit sm' : 'change-req sm';
        wrap.appendChild(btn(crLabel, crMod, {
          'data-action':      'cell_request_change',
          'data-row-id':      row.id,
          'data-package-id':  cpkg.id,
          'data-sow-id':      sowId,
          'data-vis-qty':     visibility.qty ? '1' : '0',
          'data-vis-cabling': visibility.cabling ? '1' : '0',
          'data-vis-conn':    visibility.connDevice ? '1' : '0',
        }));

        // "Remove from Bid" button
        if (!pendingItem || !pendingItem.removeFromBid) {
          wrap.appendChild(btn('Remove from Bid \u2014 ' + cpkg.name, 'remove-bid sm', {
            'data-action':     'cell_remove_from_bid',
            'data-row-id':     row.id,
            'data-package-id': cpkg.id,
            'data-sow-id':     sowId,
          }));
        }
      }
    }

    td.appendChild(wrap);
    return td;
  }

  // ── mismatch comparison ──────────────────────────────────────

  /**
   * Compare SOW detail vs a bid cell on paired fields.
   * Returns null if nothing to compare (no SOW item or no cell),
   * otherwise an object with boolean flags for each differing field:
   *   { any, product, laborDesc, fee, cabling, connDevice }
   */
  function getMismatches(row, cell, cablingVisible, connDevVisible) {
    // No SOW item or no bid cell — nothing to compare
    if (!row.sowItem || !cell) return null;

    // Normalize for comparison: lowercase, trim
    function norm(v) {
      if (v == null) return '';
      return String(v).toLowerCase().trim();
    }

    var m = {
      any:       false,
      product:   norm(row.sowProduct)   !== norm(cell.productName),
      laborDesc: norm(row.sowLaborDesc) !== norm(cell.laborDesc),
      fee:       row.sowFee !== cell.labor,
      cabling:   cablingVisible  ? norm(row.sowExistCabling) !== norm(cell.bidExistCabling) : false,
      connDevice: connDevVisible ? norm(row.sowConnDevice)   !== norm(cell.bidConnDevice)   : false,
    };

    m.any = m.product || m.laborDesc || m.fee || m.cabling || m.connDevice;
    return m;
  }

  // ── data row ────────────────────────────────────────────────

  function buildDataRow(row, packages, sowId) {
    var rowClass = 'scw-bid-review__row';
    if (row.noBid) rowClass += ' scw-bid-review__row--no-bid';
    var tr = el('tr', rowClass);
    tr.setAttribute('data-row-id', row.id);

    // Line item label cell
    // Only show displayLabel (field_2365) for Camera / Reader buckets
    var isCamReader = showCabling(row);
    var labelTd = el('td');
    if (row.noBid) {
      // SOW item with no bid at all
      labelTd.className = 'scw-bid-review__sow-cell scw-bid-review__sow-cell--no-bid';
      labelTd.appendChild(el('span', 'scw-bid-review__no-bid-badge', 'NO BID'));
      if (isCamReader && row.displayLabel) {
        labelTd.appendChild(document.createElement('br'));
        labelTd.appendChild(document.createTextNode(row.displayLabel));
      }
    } else if (row.sowItem) {
      labelTd.className = 'scw-bid-review__sow-cell';
      if (isCamReader && row.displayLabel) {
        labelTd.textContent = row.displayLabel;
      }
    } else {
      labelTd.className = 'scw-bid-review__sow-cell scw-bid-review__sow-cell--new';
      labelTd.appendChild(el('span', 'scw-bid-review__new-badge', 'NEW'));
      if (isCamReader && row.displayLabel) {
        labelTd.appendChild(document.createElement('br'));
        labelTd.appendChild(document.createTextNode(row.displayLabel));
      }
    }
    tr.appendChild(labelTd);

    // Cabling fields only shown/compared for Camera or Reader buckets
    var cablingVisible = showCabling(row);
    // Connected Devices: shown when bid has field_2374=Yes or SOW has field_2231=Yes
    var connDevVisible = showConnectedDevices(row);
    // Qty: shown when EITHER SOW or any bid cell has qty > 1
    var qtyVisible = showQty(row);

    // Per-package mismatch breakdown
    var diffsByPkg = {};
    // Aggregate: which fields differ in ANY package (for SOW detail highlight)
    var sowDiffs = { any: false, product: false, laborDesc: false, fee: false, cabling: false, connDevice: false };

    for (var mi = 0; mi < packages.length; mi++) {
      var pkgId   = packages[mi].id;
      var pkgCell = row.cellsByPackage[pkgId] || null;
      var m       = getMismatches(row, pkgCell, cablingVisible, connDevVisible);
      diffsByPkg[pkgId] = m;

      if (m && m.any) {
        sowDiffs.any = true;
        if (m.product)    sowDiffs.product    = true;
        if (m.laborDesc)  sowDiffs.laborDesc  = true;
        if (m.fee)        sowDiffs.fee        = true;
        if (m.cabling)    sowDiffs.cabling    = true;
        if (m.connDevice) sowDiffs.connDevice = true;
      }
    }

    // SOW detail cell — highlight cell + individual differing fields
    var sowTd = buildSowDetailCell(row, cablingVisible, connDevVisible, qtyVisible, sowDiffs.any ? sowDiffs : null);
    if (sowDiffs.any) {
      sowTd.classList.add('scw-bid-review__cell--mismatch');
    }
    tr.appendChild(sowTd);

    // Package cells — highlight cell + individual differing fields
    for (var i = 0; i < packages.length; i++) {
      var pid = packages[i].id;
      var d   = diffsByPkg[pid];
      var dataTd = buildDataCell(
        row.cellsByPackage[pid] || null, cablingVisible, connDevVisible, qtyVisible, d
      );
      if (d && d.any) {
        dataTd.classList.add('scw-bid-review__cell--mismatch');
      }
      tr.appendChild(dataTd);
    }

    // Row actions (with visibility flags for change request filtering)
    tr.appendChild(buildRowActionsCell(row, packages, sowId, {
      qty: qtyVisible, cabling: cablingVisible, connDevice: connDevVisible
    }));

    return tr;
  }

  // ── collapsible group header row ─────────────────────────────

  function buildGroupHeader(label, level, colSpan, rowCount) {
    var tr = el('tr', 'scw-bid-review__group-header');
    tr.setAttribute('role', 'button');
    tr.setAttribute('tabindex', '0');
    tr.setAttribute('aria-expanded', 'true');

    var td = el('td');
    td.setAttribute('colspan', colSpan);

    // Inner flex wrapper (flex on <td> breaks table width)
    var inner = el('div', 'scw-bid-review__grp-inner');

    // Chevron
    var chevron = el('span', 'scw-bid-review__grp-chevron');
    chevron.innerHTML = CHEVRON_SVG;
    inner.appendChild(chevron);

    // Label
    inner.appendChild(el('span', 'scw-bid-review__grp-title', label));

    // Count pill
    if (rowCount > 0) {
      inner.appendChild(el('span', 'scw-bid-review__grp-count', String(rowCount)));
    }

    td.appendChild(inner);
    tr.appendChild(td);

    // Toggle: hide/show sibling rows until next group header
    tr.addEventListener('click', function () {
      var expanded = tr.getAttribute('aria-expanded') === 'true';
      tr.setAttribute('aria-expanded', String(!expanded));
      tr.classList.toggle('scw-bid-review__group-header--collapsed', expanded);

      // Walk next siblings and toggle visibility
      var sibling = tr.nextElementSibling;
      while (sibling) {
        if (sibling.classList.contains('scw-bid-review__group-header')) break;
        sibling.style.display = expanded ? 'none' : '';
        sibling = sibling.nextElementSibling;
      }
    });

    tr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tr.click();
      }
    });

    return tr;
  }

  // ── assemble rows from grouped state ────────────────────────

  function buildBodyRows(groups, packages, colSpan, sowId) {
    var frag = document.createDocumentFragment();

    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];

      // Count all rows including subgroups
      var totalRows = group.rows.length;
      if (group.subgroups) {
        for (var ci = 0; ci < group.subgroups.length; ci++) {
          totalRows += group.subgroups[ci].rows.length;
        }
      }

      if (group.label) {
        frag.appendChild(buildGroupHeader(group.label, group.level, colSpan, totalRows));
      }

      // Subgroups (proposalBucket within mdfIdf)
      if (group.subgroups && group.subgroups.length) {
        for (var si = 0; si < group.subgroups.length; si++) {
          var sub = group.subgroups[si];
          if (sub.label) {
            frag.appendChild(buildSubgroupHeader(sub.label, colSpan, sub.rows.length));
          }
          for (var ri = 0; ri < sub.rows.length; ri++) {
            frag.appendChild(buildDataRow(sub.rows[ri], packages, sowId));
          }
        }
      }

      // Direct rows (no subgroups)
      for (var di = 0; di < group.rows.length; di++) {
        frag.appendChild(buildDataRow(group.rows[di], packages, sowId));
      }
    }

    return frag;
  }

  // ── subgroup header (proposalBucket within mdfIdf) ──────────

  function buildSubgroupHeader(label, colSpan, rowCount) {
    var tr = el('tr', 'scw-bid-review__subgroup-header');

    var td = el('td');
    td.setAttribute('colspan', colSpan);

    var inner = el('div', 'scw-bid-review__subgrp-inner');
    inner.appendChild(el('span', 'scw-bid-review__subgrp-title', label));
    if (rowCount > 0) {
      inner.appendChild(el('span', 'scw-bid-review__subgrp-count', String(rowCount)));
    }

    td.appendChild(inner);
    tr.appendChild(td);
    return tr;
  }

  // ── render a single SOW grid ────────────────────────────────

  function buildSowSection(sowGrid) {
    var section = el('div', 'scw-bid-review__sow-section');
    section.setAttribute('data-sow-id', sowGrid.sowId);

    // SOW accordion header (clickable) — open by default
    var header = el('div', 'scw-bid-review__sow-title');
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'true');

    var chevron = el('span', 'scw-bid-review__sow-chevron');
    chevron.innerHTML = CHEVRON_SVG;
    header.appendChild(chevron);

    header.appendChild(el('span', 'scw-bid-review__sow-title-text', sowGrid.sowName));
    header.appendChild(el('span', 'scw-bid-review__sow-title-count',
      sowGrid.rows.length + ' line item' + (sowGrid.rows.length !== 1 ? 's' : '') +
      ' \u00b7 ' + sowGrid.packages.length + ' bid' + (sowGrid.packages.length !== 1 ? 's' : '')));
    section.appendChild(header);

    // Collapsible body
    var body = el('div', 'scw-bid-review__sow-body');

    if (!sowGrid.rows.length) {
      body.appendChild(el('div', 'scw-bid-review__empty-state', 'No bid items for this SOW.'));
    } else {
      var table = el('table', 'scw-bid-review__table');

      var thead = document.createElement('thead');
      thead.appendChild(buildHeaderRow(sowGrid));
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      tbody.appendChild(buildBodyRows(sowGrid.groups, sowGrid.packages, sowGrid.columnCount, sowGrid.sowId));
      table.appendChild(tbody);

      body.appendChild(table);
    }

    section.appendChild(body);

    // Toggle handler
    header.addEventListener('click', function () {
      var expanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', String(!expanded));
      section.classList.toggle('scw-bid-review__sow-section--collapsed', expanded);
    });

    header.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });

    return section;
  }

  // ── accordion state save / restore ──────────────────────────

  /**
   * Snapshot which SOW sections and MDF/IDF groups are expanded
   * so we can restore them after a re-render.
   */
  function snapshotAccordionState(mount) {
    var snap = { sow: {}, group: {} };
    if (!mount) return snap;

    // SOW-level sections
    var sections = mount.querySelectorAll('.scw-bid-review__sow-section');
    for (var i = 0; i < sections.length; i++) {
      var sowId = sections[i].getAttribute('data-sow-id');
      if (sowId) {
        snap.sow[sowId] = !sections[i].classList.contains('scw-bid-review__sow-section--collapsed');
      }
    }

    // MDF/IDF group headers (inside each SOW section)
    var headers = mount.querySelectorAll('.scw-bid-review__group-header');
    for (var h = 0; h < headers.length; h++) {
      var section = headers[h].closest('.scw-bid-review__sow-section');
      var sowKey = section ? section.getAttribute('data-sow-id') : '__root__';
      var label = (headers[h].querySelector('.scw-bid-review__grp-title') || {}).textContent || '';
      if (label) {
        snap.group[sowKey + '::' + label] = headers[h].getAttribute('aria-expanded') === 'true';
      }
    }

    return snap;
  }

  function restoreAccordionState(mount, snap) {
    if (!mount || !snap) return;

    // Restore SOW sections (default is now open, so restore collapsed ones)
    var sections = mount.querySelectorAll('.scw-bid-review__sow-section');
    for (var i = 0; i < sections.length; i++) {
      var sowId = sections[i].getAttribute('data-sow-id');
      if (sowId && snap.sow[sowId] === false) {
        // Was collapsed — collapse it
        sections[i].classList.add('scw-bid-review__sow-section--collapsed');
        var hdr = sections[i].querySelector('.scw-bid-review__sow-title');
        if (hdr) hdr.setAttribute('aria-expanded', 'false');
      }
    }

    // Restore MDF/IDF group headers
    var headers = mount.querySelectorAll('.scw-bid-review__group-header');
    for (var h = 0; h < headers.length; h++) {
      var section = headers[h].closest('.scw-bid-review__sow-section');
      var sowKey = section ? section.getAttribute('data-sow-id') : '__root__';
      var label = (headers[h].querySelector('.scw-bid-review__grp-title') || {}).textContent || '';
      var key = sowKey + '::' + label;

      if (label && snap.group[key] === false) {
        // Was collapsed — collapse it
        headers[h].setAttribute('aria-expanded', 'false');
        headers[h].classList.add('scw-bid-review__group-header--collapsed');
        var sibling = headers[h].nextElementSibling;
        while (sibling) {
          if (sibling.classList.contains('scw-bid-review__group-header')) break;
          sibling.style.display = 'none';
          sibling = sibling.nextElementSibling;
        }
      }
    }
  }

  // ── public: renderMatrix ────────────────────────────────────

  ns.renderMatrix = function renderMatrix(state) {
    var mount = getOrCreateMount();

    // Preserve accordion state across re-renders
    var snap = snapshotAccordionState(mount);

    mount.innerHTML = '';
    mount.className = 'scw-bid-review';

    if (state.isEmpty) {
      mount.appendChild(el('div', 'scw-bid-review__empty-state',
        'No comparison data available.'));
      return mount;
    }

    for (var i = 0; i < state.sowGrids.length; i++) {
      mount.appendChild(buildSowSection(state.sowGrids[i]));
    }

    restoreAccordionState(mount, snap);

    return mount;
  };

  // ── public: showLoading ─────────────────────────────────────

  ns.showLoading = function showLoading() {
    var mount = getOrCreateMount();
    mount.innerHTML = '';
    mount.className = 'scw-bid-review';
    mount.appendChild(el('div', 'scw-bid-review__loading', 'Loading comparison data'));
    return mount;
  };

  // ── public: clearMount ──────────────────────────────────────

  ns.clearMount = function clearMount() {
    var mount = document.querySelector(CFG.mountSelector);
    if (mount) mount.innerHTML = '';
  };

  // ── public: renderToast ─────────────────────────────────────

  ns.renderToast = function renderToast(message, type) {
    var existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();

    var toast = el('div', 'scw-bid-review__toast scw-bid-review__toast--' + (type || 'info'), message);
    toast.id = TOAST_ID;
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 300);
    }, CFG.toastDuration);
  };

})();
