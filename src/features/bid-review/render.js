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

  // ── mount point ─────────────────────────────────────────────

  function getOrCreateMount() {
    var mount = document.querySelector(CFG.mountSelector);
    if (!mount) {
      mount = el('div');
      mount.id = CFG.mountSelector.replace(/^#/, '');
      var scene = document.getElementById(CFG.sceneKey);
      if (scene) {
        scene.appendChild(mount);
      } else {
        document.body.appendChild(mount);
      }
    }
    return mount;
  }

  // ── table header for a SOW grid ─────────────────────────────

  function buildHeaderRow(sowGrid) {
    var tr = el('tr', 'scw-bid-review__header-row');

    // Line item column header
    tr.appendChild(el('th', 'scw-bid-review__sow-header', 'Line Item'));

    // One header per bid package
    for (var i = 0; i < sowGrid.packages.length; i++) {
      var pkg = sowGrid.packages[i];
      var elig = sowGrid.eligibility[pkg.id] || { adoptable: 0, creatable: 0, total: 0 };

      var th = el('th', 'scw-bid-review__pkg-header');

      th.appendChild(el('div', 'scw-bid-review__pkg-name', pkg.name));

      var countsText = elig.adoptable + ' adoptable \u00b7 ' + elig.creatable + ' new';
      th.appendChild(el('div', 'scw-bid-review__pkg-counts', countsText));

      // Package-level action buttons (scoped to this SOW)
      var actions = el('div', 'scw-bid-review__pkg-actions');

      if (elig.adoptable > 0) {
        actions.appendChild(btn(
          'Adopt All (' + elig.adoptable + ')', 'adopt',
          { 'data-action': 'package_adopt_all', 'data-package-id': pkg.id, 'data-sow-id': sowGrid.sowId }
        ));
      }

      if (elig.creatable > 0) {
        actions.appendChild(btn(
          'Create Missing (' + elig.creatable + ')', 'create',
          { 'data-action': 'package_create_missing', 'data-package-id': pkg.id, 'data-sow-id': sowGrid.sowId }
        ));
      }

      if (elig.total > 0 && elig.adoptable > 0 && elig.creatable > 0) {
        actions.appendChild(btn(
          'Adopt + Create (' + elig.total + ')', 'combo',
          { 'data-action': 'package_adopt_create', 'data-package-id': pkg.id, 'data-sow-id': sowGrid.sowId }
        ));
      }

      th.appendChild(actions);
      tr.appendChild(th);
    }

    // Actions column header
    tr.appendChild(el('th', 'scw-bid-review__actions-header', 'Actions'));

    return tr;
  }

  // ── data cell for a package column ──────────────────────────

  function buildDataCell(cell) {
    var td = el('td');

    if (!cell) {
      td.className = 'scw-bid-review__cell--missing';
      td.textContent = '\u2014';
      return td;
    }

    if (cell.productName) {
      td.appendChild(el('div', 'scw-bid-review__cell-label', cell.productName));
    }

    if (cell.labor) {
      var values = el('div', 'scw-bid-review__cell-values');
      values.appendChild(el('span', 'scw-bid-review__cell-value', formatCurrency(cell.labor)));
      td.appendChild(values);
    }

    if (cell.notes) {
      td.appendChild(el('div', 'scw-bid-review__cell-notes', cell.notes));
    }

    return td;
  }

  // ── row actions cell ────────────────────────────────────────

  function buildRowActionsCell(row, packages, sowId) {
    var td = el('td');
    var wrap = el('div', 'scw-bid-review__row-actions');

    for (var i = 0; i < packages.length; i++) {
      var pkg = packages[i];
      var cell = row.cellsByPackage[pkg.id];
      if (!cell) continue;

      if (row.sowItem) {
        wrap.appendChild(btn(
          'Adopt \u2190 ' + pkg.name, 'adopt sm',
          { 'data-action': 'row_adopt', 'data-row-id': row.id, 'data-package-id': pkg.id, 'data-sow-id': sowId }
        ));
      } else {
        wrap.appendChild(btn(
          'Create \u2190 ' + pkg.name, 'create sm',
          { 'data-action': 'row_create', 'data-row-id': row.id, 'data-package-id': pkg.id, 'data-sow-id': sowId }
        ));
      }
    }

    wrap.appendChild(btn(
      'Skip', 'skip sm',
      { 'data-action': 'row_skip', 'data-row-id': row.id, 'data-sow-id': sowId }
    ));

    td.appendChild(wrap);
    return td;
  }

  // ── data row ────────────────────────────────────────────────

  function buildDataRow(row, packages, sowId) {
    var tr = el('tr', 'scw-bid-review__row');
    tr.setAttribute('data-row-id', row.id);

    // Line item label cell
    var labelTd = el('td');
    if (row.sowItem) {
      labelTd.className = 'scw-bid-review__sow-cell';
      labelTd.textContent = row.displayLabel || row.productName || 'Line Item';
    } else {
      labelTd.className = 'scw-bid-review__sow-cell scw-bid-review__sow-cell--empty';
      labelTd.textContent = (row.displayLabel || row.productName || 'Unknown') + ' (No SOW)';
    }
    tr.appendChild(labelTd);

    // Package cells
    for (var i = 0; i < packages.length; i++) {
      tr.appendChild(buildDataCell(row.cellsByPackage[packages[i].id] || null));
    }

    // Row actions
    tr.appendChild(buildRowActionsCell(row, packages, sowId));

    return tr;
  }

  // ── group header row ────────────────────────────────────────

  function buildGroupHeader(label, level, colSpan) {
    var tr = el('tr', 'scw-bid-review__group-header' +
                (level === 2 ? ' scw-bid-review__group-header--l2' : ''));
    var td = el('td', null, label);
    td.setAttribute('colspan', colSpan);
    tr.appendChild(td);
    return tr;
  }

  // ── assemble rows from grouped state ────────────────────────

  function buildBodyRows(groups, packages, colSpan, sowId) {
    var frag = document.createDocumentFragment();

    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];

      if (group.label) {
        frag.appendChild(buildGroupHeader(group.label, group.level, colSpan));
      }

      if (group.subgroups && group.subgroups.length) {
        for (var si = 0; si < group.subgroups.length; si++) {
          var sub = group.subgroups[si];
          if (sub.label) {
            frag.appendChild(buildGroupHeader(sub.label, sub.level, colSpan));
          }
          for (var ri = 0; ri < sub.rows.length; ri++) {
            frag.appendChild(buildDataRow(sub.rows[ri], packages, sowId));
          }
        }
      }

      for (var di = 0; di < group.rows.length; di++) {
        frag.appendChild(buildDataRow(group.rows[di], packages, sowId));
      }
    }

    return frag;
  }

  // ── render a single SOW grid ────────────────────────────────

  function buildSowSection(sowGrid) {
    var section = el('div', 'scw-bid-review__sow-section');
    section.setAttribute('data-sow-id', sowGrid.sowId);

    // SOW title bar
    var header = el('div', 'scw-bid-review__sow-title');
    header.appendChild(el('span', 'scw-bid-review__sow-title-text', sowGrid.sowName));
    header.appendChild(el('span', 'scw-bid-review__sow-title-count',
      sowGrid.rows.length + ' line item' + (sowGrid.rows.length !== 1 ? 's' : '') +
      ' \u00b7 ' + sowGrid.packages.length + ' bid' + (sowGrid.packages.length !== 1 ? 's' : '')));
    section.appendChild(header);

    if (!sowGrid.rows.length) {
      section.appendChild(el('div', 'scw-bid-review__empty-state', 'No bid items for this SOW.'));
      return section;
    }

    var table = el('table', 'scw-bid-review__table');

    var thead = document.createElement('thead');
    thead.appendChild(buildHeaderRow(sowGrid));
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    tbody.appendChild(buildBodyRows(sowGrid.groups, sowGrid.packages, sowGrid.columnCount, sowGrid.sowId));
    table.appendChild(tbody);

    section.appendChild(table);
    return section;
  }

  // ── public: renderMatrix ────────────────────────────────────

  ns.renderMatrix = function renderMatrix(state) {
    var mount = getOrCreateMount();
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
