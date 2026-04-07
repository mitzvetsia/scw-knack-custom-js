/*** BID REVIEW — RENDERING ***/
/**
 * Pure rendering: state object → DOM nodes.
 * No business logic, no Knack access, no data derivation.
 * Every value consumed here is precomputed in the state object.
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
      // Insert after the first view in the scene, or at end of kn-scene
      var scene = document.getElementById(CFG.sceneKey);
      if (scene) {
        scene.appendChild(mount);
      } else {
        document.body.appendChild(mount);
      }
    }
    return mount;
  }

  // ── table header ────────────────────────────────────────────

  function buildHeaderRow(state) {
    var tr = el('tr', 'scw-bid-review__header-row');

    // SOW column header
    var sowTh = el('th', 'scw-bid-review__sow-header', 'SOW Item');
    tr.appendChild(sowTh);

    // One header per package
    for (var i = 0; i < state.packages.length; i++) {
      var pkg = state.packages[i];
      var elig = state.eligibility[pkg.id] || { adoptable: 0, creatable: 0, total: 0 };

      var th = el('th', 'scw-bid-review__pkg-header');

      // Package name
      th.appendChild(el('div', 'scw-bid-review__pkg-name', pkg.name));

      // Eligibility counts
      var countsText = elig.adoptable + ' adoptable \u00b7 ' + elig.creatable + ' new';
      th.appendChild(el('div', 'scw-bid-review__pkg-counts', countsText));

      // Package-level action buttons
      var actions = el('div', 'scw-bid-review__pkg-actions');

      if (elig.adoptable > 0) {
        actions.appendChild(btn(
          'Adopt All (' + elig.adoptable + ')', 'adopt',
          { 'data-action': 'package_adopt_all', 'data-package-id': pkg.id }
        ));
      }

      if (elig.creatable > 0) {
        actions.appendChild(btn(
          'Create Missing (' + elig.creatable + ')', 'create',
          { 'data-action': 'package_create_missing', 'data-package-id': pkg.id }
        ));
      }

      if (elig.total > 0 && elig.adoptable > 0 && elig.creatable > 0) {
        actions.appendChild(btn(
          'Adopt + Create (' + elig.total + ')', 'combo',
          { 'data-action': 'package_adopt_create', 'data-package-id': pkg.id }
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

    // Product name
    if (cell.productName) {
      td.appendChild(el('div', 'scw-bid-review__cell-label', cell.productName));
    }

    // Labor $
    if (cell.labor) {
      td.appendChild(el('div', 'scw-bid-review__cell-values',
        null));
      var values = td.lastChild;
      values.appendChild(el('span', 'scw-bid-review__cell-value', formatCurrency(cell.labor)));
    }

    // Notes
    if (cell.notes) {
      td.appendChild(el('div', 'scw-bid-review__cell-notes', cell.notes));
    }

    return td;
  }

  // ── row actions cell ────────────────────────────────────────

  function buildRowActionsCell(row, packages) {
    var td = el('td');
    var wrap = el('div', 'scw-bid-review__row-actions');

    for (var i = 0; i < packages.length; i++) {
      var pkg = packages[i];
      var cell = row.cellsByPackage[pkg.id];
      if (!cell) continue;

      if (row.sowItem) {
        wrap.appendChild(btn(
          'Adopt \u2190 ' + pkg.name, 'adopt sm',
          { 'data-action': 'row_adopt', 'data-row-id': row.id, 'data-package-id': pkg.id }
        ));
      } else {
        wrap.appendChild(btn(
          'Create \u2190 ' + pkg.name, 'create sm',
          { 'data-action': 'row_create', 'data-row-id': row.id, 'data-package-id': pkg.id }
        ));
      }
    }

    // Skip always available
    wrap.appendChild(btn(
      'Skip', 'skip sm',
      { 'data-action': 'row_skip', 'data-row-id': row.id }
    ));

    td.appendChild(wrap);
    return td;
  }

  // ── data row ────────────────────────────────────────────────

  function buildDataRow(row, packages) {
    var tr = el('tr', 'scw-bid-review__row');
    tr.setAttribute('data-row-id', row.id);

    // SOW cell
    var sowTd = el('td');
    if (row.sowItem) {
      sowTd.className = 'scw-bid-review__sow-cell';
      sowTd.textContent = row.displayLabel || 'SOW Item';
    } else {
      sowTd.className = 'scw-bid-review__sow-cell scw-bid-review__sow-cell--empty';
      sowTd.textContent = row.displayLabel
        ? row.displayLabel + ' (No SOW)'
        : 'No SOW Item';
    }
    tr.appendChild(sowTd);

    // Package cells
    for (var i = 0; i < packages.length; i++) {
      tr.appendChild(buildDataCell(row.cellsByPackage[packages[i].id] || null));
    }

    // Row actions
    tr.appendChild(buildRowActionsCell(row, packages));

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

  function buildBodyRows(groups, packages, colSpan) {
    var frag = document.createDocumentFragment();

    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];

      // L1 header (skip if blank label — single flat group)
      if (group.label) {
        frag.appendChild(buildGroupHeader(group.label, group.level, colSpan));
      }

      // If group has subgroups, recurse into them
      if (group.subgroups && group.subgroups.length) {
        for (var si = 0; si < group.subgroups.length; si++) {
          var sub = group.subgroups[si];
          if (sub.label) {
            frag.appendChild(buildGroupHeader(sub.label, sub.level, colSpan));
          }
          for (var ri = 0; ri < sub.rows.length; ri++) {
            frag.appendChild(buildDataRow(sub.rows[ri], packages));
          }
        }
      }

      // Direct rows on this group (flat or ungrouped)
      for (var di = 0; di < group.rows.length; di++) {
        frag.appendChild(buildDataRow(group.rows[di], packages));
      }
    }

    return frag;
  }

  // ── public: renderMatrix ────────────────────────────────────

  /**
   * Renders the full matrix into the mount point.
   * Replaces any existing content.
   *
   * @param {object} state — normalized state from buildState()
   */
  ns.renderMatrix = function renderMatrix(state) {
    var mount = getOrCreateMount();
    mount.innerHTML = '';
    mount.className = 'scw-bid-review';

    if (state.isEmpty) {
      mount.appendChild(el('div', 'scw-bid-review__empty-state',
        'No comparison data available.'));
      return mount;
    }

    var table = el('table', 'scw-bid-review__table');

    // thead
    var thead = document.createElement('thead');
    thead.appendChild(buildHeaderRow(state));
    table.appendChild(thead);

    // tbody
    var tbody = document.createElement('tbody');
    tbody.appendChild(buildBodyRows(state.groups, state.packages, state.columnCount));
    table.appendChild(tbody);

    mount.appendChild(table);
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

  /**
   * Show a transient toast notification.
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   */
  ns.renderToast = function renderToast(message, type) {
    // Remove existing toast
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
