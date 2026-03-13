/*** SELECT-ALL CHECKBOXES — view header row + group header checkboxes ***/
(function () {
  'use strict';

  var STYLE_ID  = 'scw-select-all-css';
  var HEADER_ATTR = 'data-scw-sa-header';
  var GROUP_ATTR  = 'data-scw-sa-grp';
  var CB_SELECTOR =
    '.kn-table-bulk-checkbox input[type="checkbox"], ' +
    'input.ktlCheckbox-row[type="checkbox"]';

  // ───────────────────────────────────────────────
  //  CSS
  // ───────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      /* ── View-level header bar ── */
      '.scw-sa-header {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 0;',
      '  padding: 4px 12px;',
      '  background: #e2e8f0;',
      '  border-bottom: 2px solid #cbd5e1;',
      '  min-height: 28px;',
      '  user-select: none;',
      '  position: sticky;',
      '  top: 0;',
      '  z-index: 5;',
      '}',
      '.scw-sa-header-check {',
      '  flex: 0 0 auto;',
      '  min-width: 20px;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 0 4px;',
      '}',
      '.scw-sa-header-check input[type="checkbox"] {',
      '  margin: 0;',
      '  cursor: pointer;',
      '  width: 15px;',
      '  height: 15px;',
      '}',

      /* identity mirrors toggle-zone width */
      '.scw-sa-header-identity {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  flex: 0 0 auto;',
      '  min-width: 0;',
      '}',
      '.scw-sa-header-fill {',
      '  flex: 1 1 auto;',
      '  min-width: 0;',
      '}',
      '.scw-sa-header-right {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 4px;',
      '  margin-left: auto;',
      '  flex-shrink: 0;',
      '}',

      /* Each header label cell: contains label text + optional checkbox */
      '.scw-sa-header-cell {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: flex-end;',
      '  gap: 2px;',
      '  flex-shrink: 0;',
      '}',
      '.scw-sa-header-label {',
      '  font-size: 10px;',
      '  font-weight: 700;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.5px;',
      '  color: #374151;',
      '  white-space: nowrap;',
      '  text-align: center;',
      '  line-height: 1.2;',
      '}',
      /* Bulk-edit column checkbox inside header cell */
      '.scw-sa-hdr-cbox {',
      '  margin: 0;',
      '  cursor: pointer;',
      '  width: 13px;',
      '  height: 13px;',
      '}',
      /* Hidden by default, shown when KTL bulk-edit header checkboxes become visible */
      '.scw-sa-hdr-cbox.scw-sa-hdr-cbox--hidden {',
      '  display: none;',
      '}',

      /* per-group widths matching summary bar */
      '.scw-sa-hdr-narrow  { width: 50px;  min-width: 50px;  }',
      '.scw-sa-hdr-sub-bid { width: 70px;  min-width: 70px;  }',
      '.scw-sa-hdr-vars    { width: 100px; min-width: 100px; }',
      '.scw-sa-hdr-fee     { width: 70px;  min-width: 70px;  }',
      '.scw-sa-hdr-sow     { width: 100px; min-width: 100px; }',
      '.scw-sa-hdr-cat     { width: 70px;  min-width: 70px;  }',
      '.scw-sa-hdr-bid     { width: 70px;  min-width: 70px;  }',
      '.scw-sa-hdr-qty     { width: 50px;  min-width: 50px;  }',
      '.scw-sa-hdr-mcb     { width: 80px;  min-width: 80px;  }',
      '.scw-sa-hdr-cabling { min-width: 60px; }',
      '.scw-sa-hdr-move    { width: 40px;  min-width: 40px;  }',
      '.scw-sa-hdr-delete  { width: 28px;  min-width: 28px;  }',

      /* ── Group header checkbox ── */
      '.scw-sa-grp-check {',
      '  display: inline-flex !important;',
      '  align-items: center;',
      '  justify-content: center;',
      '  flex: 0 0 auto;',
      '  min-width: 20px;',
      '  padding: 0 4px;',
      '  margin-right: 4px;',
      '  visibility: visible !important;',
      '  opacity: 1 !important;',
      '  order: -1;',
      '}',
      '.scw-sa-grp-check input[type="checkbox"] {',
      '  margin: 0;',
      '  cursor: pointer;',
      '  width: 15px !important;',
      '  height: 15px !important;',
      '  display: inline-block !important;',
      '  appearance: auto !important;',
      '  -webkit-appearance: checkbox !important;',
      '  opacity: 1 !important;',
      '  visibility: visible !important;',
      '  position: static !important;',
      '}',
      'tr.scw-group-header > td { overflow: visible !important; }',
      '.scw-sa-header-check input[type="checkbox"],',
      '.scw-sa-grp-check input[type="checkbox"] {',
      '  pointer-events: auto;',
      '}',
      /* Group header td already display:flex from group-collapse, insert checkbox before collapse icon */
    ].join('\n');

    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ───────────────────────────────────────────────
  //  Helpers
  // ───────────────────────────────────────────────

  /** Find all bulk-edit checkbox inputs within a container element. */
  function findCheckboxes(container) {
    return container.querySelectorAll(CB_SELECTOR);
  }

  /** Toggle all checkboxes: if any unchecked → check all, else uncheck all.
   *  Uses .click() to trigger KTL's event handlers. */
  function toggleAll(checkboxes) {
    var allChecked = true;
    for (var i = 0; i < checkboxes.length; i++) {
      if (!checkboxes[i].checked) { allChecked = false; break; }
    }
    for (var j = 0; j < checkboxes.length; j++) {
      if (allChecked) {
        if (checkboxes[j].checked) checkboxes[j].click();
      } else {
        if (!checkboxes[j].checked) checkboxes[j].click();
      }
    }
    return !allChecked;
  }

  /** Sync a checkbox's checked state with a set of target checkboxes. */
  function syncCheckbox(cb, targets) {
    if (!targets.length) return;
    var allChecked = true;
    var anyChecked = false;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].checked) anyChecked = true;
      else allChecked = false;
    }
    cb.checked = allChecked;
    cb.indeterminate = !allChecked && anyChecked;
  }

  // ───────────────────────────────────────────────
  //  KTL bulk-edit header checkbox helpers
  // ───────────────────────────────────────────────

  /**
   * Build a map from field key → <input> for all bulkEditHeaderCbox checkboxes
   * inside the view's hidden <thead>.
   */
  function readTheadCheckboxes(viewEl) {
    var map = {};
    var thead = viewEl.querySelector('thead');
    if (!thead) return map;
    var ths = thead.querySelectorAll('th');
    for (var i = 0; i < ths.length; i++) {
      var th = ths[i];
      var cbox = th.querySelector('input.bulkEditHeaderCbox');
      if (!cbox) continue;
      // field key from the th class list
      var cls = th.className.split(/\s+/);
      for (var c = 0; c < cls.length; c++) {
        if (cls[c].indexOf('field_') === 0) {
          map[cls[c]] = cbox;
          break;
        }
      }
    }
    return map;
  }

  /**
   * Check whether KTL bulk-edit header checkboxes are currently visible
   * (KTL shows them when a row checkbox is selected and copy/paste mode is active).
   */
  function areBulkEditCboxesVisible(viewEl) {
    var thead = viewEl.querySelector('thead');
    if (!thead) return false;
    var sample = thead.querySelector('input.bulkEditHeaderCbox');
    if (!sample) return false;
    // KTL toggles ktlDisplayNone class to show/hide
    return !sample.classList.contains('ktlDisplayNone');
  }

  // ───────────────────────────────────────────────
  //  1) View-level header row
  // ───────────────────────────────────────────────

  /**
   * Read column layout from the first rendered summary bar.
   * Returns an object with info about each group including its data-scw-fields.
   */
  function readHeaderLayout(viewEl) {
    var bar = viewEl.querySelector('.scw-ws-summary');
    if (!bar) return null;

    var result = { identity: [], fill: null, right: [], hasCabling: false, hasMove: false, hasDelete: false };

    // Identity: product
    var productCell = bar.querySelector('.scw-ws-sum-product');
    if (productCell) result.identity.push({ text: 'Product', field: productCell.getAttribute('data-field-key') || 'field_1949' });

    // Fill: labor description
    var fillGroup = bar.querySelector('.scw-ws-sum-group--fill');
    if (fillGroup) {
      var fillLabel = fillGroup.querySelector('.scw-ws-sum-label');
      var fillFields = fillGroup.getAttribute('data-scw-fields') || '';
      result.fill = {
        text: fillLabel ? fillLabel.textContent.trim() : 'Labor Desc',
        fields: fillFields.split(/\s+/).filter(function(f) { return f; })
      };
    }

    // Right groups — read in DOM order
    var rightContainer = bar.querySelector('.scw-ws-sum-right');
    if (rightContainer) {
      var groups = rightContainer.querySelectorAll('.scw-ws-sum-group');
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        var cls = g.className;

        if (cls.indexOf('sum-group--cabling') !== -1) {
          result.hasCabling = true;
          continue;
        }
        if (cls.indexOf('sum-group--move') !== -1) {
          // Extract field from the td inside
          var moveTd = g.querySelector('td[data-field-key]');
          result.hasMove = true;
          result.moveField = moveTd ? moveTd.getAttribute('data-field-key') : 'field_1946';
          continue;
        }
        if (cls.indexOf('sum-group--delete') !== -1 || g.querySelector('.kn-link-delete')) {
          result.hasDelete = true;
          continue;
        }

        var lbl = g.querySelector('.scw-ws-sum-label');
        var text = lbl ? lbl.textContent.trim() : '';
        if (!text) continue;

        // Read data-scw-fields to know which field keys belong to this group
        var fieldKeys = (g.getAttribute('data-scw-fields') || '').split(/\s+/).filter(function(f) { return f; });

        // Determine width class
        var widthCls = '';
        if (cls.indexOf('sum-group--narrow') !== -1)     widthCls = 'scw-sa-hdr-narrow';
        else if (cls.indexOf('sum-group--sub-bid') !== -1) widthCls = 'scw-sa-hdr-sub-bid';
        else if (cls.indexOf('sum-group--vars') !== -1)    widthCls = 'scw-sa-hdr-vars';
        else if (cls.indexOf('sum-group--fee') !== -1)     widthCls = 'scw-sa-hdr-fee';
        else if (cls.indexOf('sum-group--sow') !== -1)     widthCls = 'scw-sa-hdr-sow';
        else if (cls.indexOf('sum-group--cat') !== -1)     widthCls = 'scw-sa-hdr-cat';
        else if (cls.indexOf('sum-group--bid') !== -1)     widthCls = 'scw-sa-hdr-bid';
        else if (cls.indexOf('sum-group--qty') !== -1)     widthCls = 'scw-sa-hdr-qty';
        else if (cls.indexOf('sum-group--mcb') !== -1)     widthCls = 'scw-sa-hdr-mcb';
        else if (cls.indexOf('sum-group--ext') !== -1)     widthCls = 'scw-sa-hdr-fee';

        result.right.push({ text: text, widthCls: widthCls, fields: fieldKeys });
      }
    }

    // Check for cabling by looking at chit
    if (!result.hasCabling && bar.querySelector('.scw-ws-cabling-chit')) {
      result.hasCabling = true;
    }

    // Check for delete
    if (!result.hasDelete && bar.querySelector('.scw-ws-sum-delete')) {
      result.hasDelete = true;
    }

    return result;
  }

  /**
   * Build a header cell (label + optional bulk-edit checkbox).
   * @param {string} labelText
   * @param {string[]} fieldKeys — field keys for this group (first one checked for thead cbox)
   * @param {Object} theadMap — field→checkbox map from readTheadCheckboxes
   * @param {boolean} bulkVisible — whether bulk-edit checkboxes are currently visible
   * @param {string} extraCls — extra CSS class for width
   * @returns {HTMLElement}
   */
  function buildHeaderCell(labelText, fieldKeys, theadMap, bulkVisible, extraCls) {
    var cell = document.createElement('span');
    cell.className = 'scw-sa-header-cell' + (extraCls ? ' ' + extraCls : '');

    var lbl = document.createElement('span');
    lbl.className = 'scw-sa-header-label';
    lbl.textContent = labelText;
    cell.appendChild(lbl);

    // Check if any of this group's fields has a bulkEditHeaderCbox
    var matchedCbox = null;
    for (var i = 0; i < fieldKeys.length; i++) {
      if (theadMap[fieldKeys[i]]) {
        matchedCbox = theadMap[fieldKeys[i]];
        break;
      }
    }

    if (matchedCbox) {
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'scw-sa-hdr-cbox' + (bulkVisible ? '' : ' scw-sa-hdr-cbox--hidden');
      cb.checked = matchedCbox.checked;
      cb.title = 'Include "' + labelText + '" in copy';
      cb.setAttribute('data-scw-thead-field', fieldKeys[0]);
      // Sync clicks both ways
      cb.addEventListener('click', function (e) {
        e.stopPropagation();
        if (matchedCbox.checked !== cb.checked) {
          matchedCbox.click(); // trigger KTL handler
        }
      });
      cell.appendChild(cb);
    }

    return cell;
  }

  /** Build and insert the header bar inside the view, between kn-records-nav and kn-table-wrapper. */
  function buildHeaderBar(viewEl, viewKey) {
    var layout = readHeaderLayout(viewEl);
    if (!layout) return null;

    // Remove any previously-inserted header bar (defensive)
    var sel = '.scw-sa-header[data-scw-sa-view="' + viewKey + '"]';
    var existing = viewEl.querySelector(sel);
    if (!existing && viewEl.parentNode) {
      existing = viewEl.parentNode.querySelector(sel);
    }
    if (existing) existing.remove();

    // Read thead checkbox map for KTL bulk-edit column selection
    var theadMap = readTheadCheckboxes(viewEl);
    var bulkVisible = areBulkEditCboxesVisible(viewEl);

    var bar = document.createElement('div');
    bar.className = 'scw-sa-header';
    bar.setAttribute('data-scw-sa-view', viewKey);

    // ── Select-all checkbox ──
    var checkWrap = document.createElement('span');
    checkWrap.className = 'scw-sa-header-check';
    var selectAllCb = document.createElement('input');
    selectAllCb.type = 'checkbox';
    selectAllCb.setAttribute('aria-label', 'Select all rows in this view');
    selectAllCb.title = 'Select / deselect all';
    checkWrap.appendChild(selectAllCb);
    bar.appendChild(checkWrap);

    // ── Identity labels (Product) ──
    var idSpan = document.createElement('span');
    idSpan.className = 'scw-sa-header-identity';
    for (var id = 0; id < layout.identity.length; id++) {
      var idItem = layout.identity[id];
      var idCell = buildHeaderCell(idItem.text, idItem.field ? [idItem.field] : [], theadMap, bulkVisible, '');
      idSpan.appendChild(idCell);
    }
    bar.appendChild(idSpan);

    // ── Fill label (labor desc) ──
    if (layout.fill) {
      var fillCell = buildHeaderCell(layout.fill.text, layout.fill.fields, theadMap, bulkVisible, '');
      fillCell.classList.add('scw-sa-header-fill');
      bar.appendChild(fillCell);
    }

    // ── Right-side labels ──
    var rightSpan = document.createElement('span');
    rightSpan.className = 'scw-sa-header-right';

    if (layout.hasCabling) {
      var cabCell = buildHeaderCell('Cabling', [], theadMap, bulkVisible, 'scw-sa-hdr-cabling');
      rightSpan.appendChild(cabCell);
    }

    for (var r = 0; r < layout.right.length; r++) {
      var item = layout.right[r];
      var rCell = buildHeaderCell(item.text, item.fields, theadMap, bulkVisible, item.widthCls);
      rightSpan.appendChild(rCell);
    }

    if (layout.hasMove) {
      var mvCell = buildHeaderCell('Move', layout.moveField ? [layout.moveField] : [], theadMap, bulkVisible, 'scw-sa-hdr-move');
      rightSpan.appendChild(mvCell);
    }
    if (layout.hasDelete) {
      var delCell = document.createElement('span');
      delCell.className = 'scw-sa-header-cell scw-sa-hdr-delete';
      delCell.innerHTML = '&nbsp;';
      rightSpan.appendChild(delCell);
    }

    bar.appendChild(rightSpan);

    // ── Insert inside the view, between kn-records-nav and kn-table-wrapper ──
    var tableWrapper = viewEl.querySelector('.kn-table-wrapper');
    if (tableWrapper) {
      tableWrapper.parentNode.insertBefore(bar, tableWrapper);
    } else if (viewEl.parentNode) {
      viewEl.parentNode.insertBefore(bar, viewEl);
    }

    // ── Click handler for select-all ──
    selectAllCb.addEventListener('click', function (e) {
      e.stopPropagation();
      var el = document.getElementById(viewKey);
      if (!el) return;
      var cbs = findCheckboxes(el);
      if (!cbs.length) return;

      var shouldCheck = selectAllCb.checked;
      for (var k = 0; k < cbs.length; k++) {
        if (cbs[k].checked !== shouldCheck) cbs[k].click();
      }
      selectAllCb.indeterminate = false;
    });

    // ── Sync state on any checkbox change within view ──
    $(viewEl).off('change.scwSaHeader').on('change.scwSaHeader', 'input[type="checkbox"]', function () {
      var cbs = findCheckboxes(document.getElementById(viewKey));
      syncCheckbox(selectAllCb, cbs);
    });

    // Initial sync
    syncCheckbox(selectAllCb, findCheckboxes(viewEl));

    return bar;
  }

  /**
   * Sync visibility + checked state of header bar's column checkboxes
   * with the KTL bulk-edit header checkboxes in the hidden <thead>.
   */
  function syncBulkEditCheckboxes(viewEl, viewKey) {
    var sel = '.scw-sa-header[data-scw-sa-view="' + viewKey + '"]';
    var bar = viewEl.querySelector(sel);
    if (!bar && viewEl.parentNode) {
      bar = viewEl.parentNode.querySelector(sel);
    }
    if (!bar) return;

    var theadMap = readTheadCheckboxes(viewEl);
    var visible = areBulkEditCboxesVisible(viewEl);
    var hdrCboxes = bar.querySelectorAll('.scw-sa-hdr-cbox');
    for (var i = 0; i < hdrCboxes.length; i++) {
      var hcb = hdrCboxes[i];
      var fk = hcb.getAttribute('data-scw-thead-field');
      // Show/hide
      if (visible) {
        hcb.classList.remove('scw-sa-hdr-cbox--hidden');
      } else {
        hcb.classList.add('scw-sa-hdr-cbox--hidden');
      }
      // Sync checked state from thead
      if (fk && theadMap[fk]) {
        hcb.checked = theadMap[fk].checked;
      }
    }
  }

  function enhanceViews() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion__header');

    for (var i = 0; i < accordions.length; i++) {
      var header = accordions[i];
      var viewKey = header.getAttribute('data-view-key');
      if (!viewKey) continue;

      var viewEl = document.getElementById(viewKey);
      if (!viewEl) continue;

      // If attribute is set, check whether the bar still exists in the DOM
      if (viewEl.getAttribute(HEADER_ATTR) === '1') {
        var existingBar = viewEl.querySelector('.scw-sa-header[data-scw-sa-view="' + viewKey + '"]');
        if (!existingBar && viewEl.parentNode) {
          existingBar = viewEl.parentNode.querySelector('.scw-sa-header[data-scw-sa-view="' + viewKey + '"]');
        }
        if (existingBar) {
          // Bar exists — just sync KTL bulk-edit checkboxes
          syncBulkEditCheckboxes(viewEl, viewKey);
          continue;
        }
        // Bar was removed — reset and rebuild
        viewEl.removeAttribute(HEADER_ATTR);
      }

      // Only add if this view has bulk checkboxes
      var checkboxes = findCheckboxes(viewEl);
      if (!checkboxes.length) continue;

      // Remove old button from accordion header if present
      var oldBtn = header.querySelector('.scw-select-all-btn');
      if (oldBtn) oldBtn.remove();

      var headerBar = buildHeaderBar(viewEl, viewKey);
      if (headerBar) {
        viewEl.setAttribute(HEADER_ATTR, '1');
      }
    }
  }

  // ───────────────────────────────────────────────
  //  2) Group header checkboxes
  // ───────────────────────────────────────────────

  /** Find all data rows between this group header and the next. */
  function rowsInGroup(headerTr) {
    var isL2 = headerTr.classList.contains('kn-group-level-2');
    var rows = [];
    var next = headerTr.nextElementSibling;

    while (next) {
      if (next.classList.contains('kn-table-group')) {
        if (isL2) break;
        if (next.classList.contains('kn-group-level-1')) break;
      }
      if (!next.classList.contains('kn-table-group') &&
          !next.classList.contains('kn-table-totals')) {
        rows.push(next);
      }
      next = next.nextElementSibling;
    }
    return rows;
  }

  function enhanceGroupHeaders() {
    var groupHeaders = document.querySelectorAll('tr.kn-table-group.scw-group-header');

    for (var i = 0; i < groupHeaders.length; i++) {
      var tr = groupHeaders[i];
      if (tr.getAttribute(GROUP_ATTR) === '1') {
        // Verify checkbox still exists in DOM
        if (tr.querySelector('.scw-sa-grp-check')) continue;
        tr.removeAttribute(GROUP_ATTR); // reset for rebuild
      }

      var rows = rowsInGroup(tr);
      var hasCheckboxes = false;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].querySelector(CB_SELECTOR)) {
          hasCheckboxes = true;
          break;
        }
      }
      if (!hasCheckboxes) continue;

      tr.setAttribute(GROUP_ATTR, '1');

      // Remove old select-all button if present
      var oldBtn = tr.querySelector('.scw-select-all-btn');
      if (oldBtn) oldBtn.remove();

      // Create checkbox
      var checkWrap = document.createElement('span');
      checkWrap.className = 'scw-sa-grp-check';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('aria-label', 'Select all rows in this group');
      cb.title = 'Select / deselect group';
      checkWrap.appendChild(cb);

      // Insert at the start of td, before collapse icon
      var td = tr.querySelector('td');
      if (!td) continue;
      td.insertBefore(checkWrap, td.firstChild);

      // Click handler
      (function (checkbox, headerRow) {
        checkbox.addEventListener('click', function (e) {
          e.stopPropagation();
          e.stopImmediatePropagation();

          var groupRows = rowsInGroup(headerRow);
          var targets = [];
          for (var g = 0; g < groupRows.length; g++) {
            var cbs = groupRows[g].querySelectorAll(CB_SELECTOR);
            for (var c = 0; c < cbs.length; c++) targets.push(cbs[c]);
          }
          if (!targets.length) return;

          var shouldCheck = checkbox.checked;
          for (var k = 0; k < targets.length; k++) {
            if (targets[k].checked !== shouldCheck) targets[k].click();
          }
          checkbox.indeterminate = false;

          // Also sync view-level header checkbox
          var vEl = headerRow.closest('[id^="view_"]');
          if (vEl) {
            var hBar = vEl.querySelector('.scw-sa-header[data-scw-sa-view="' + vEl.id + '"]');
            if (!hBar && vEl.parentNode) {
              hBar = vEl.parentNode.querySelector('.scw-sa-header[data-scw-sa-view="' + vEl.id + '"]');
            }
            if (hBar) {
              var viewCb = hBar.querySelector('.scw-sa-header-check input[type="checkbox"]');
              if (viewCb) syncCheckbox(viewCb, findCheckboxes(vEl));
            }
          }
        });

        // Listen for row checkbox changes to update group checkbox state
        var parentTable = headerRow.closest('table');
        if (parentTable) {
          $(parentTable).off('change.scwSaGrp' + i).on('change.scwSaGrp' + i, 'input[type="checkbox"]', function () {
            var groupRows = rowsInGroup(headerRow);
            var targets = [];
            for (var g = 0; g < groupRows.length; g++) {
              var cbs = groupRows[g].querySelectorAll(CB_SELECTOR);
              for (var c = 0; c < cbs.length; c++) targets.push(cbs[c]);
            }
            syncCheckbox(checkbox, targets);
          });
        }
      })(cb, tr);

      // Initial sync
      var initRows = rowsInGroup(tr);
      var initTargets = [];
      for (var ir = 0; ir < initRows.length; ir++) {
        var initCbs = initRows[ir].querySelectorAll(CB_SELECTOR);
        for (var ic = 0; ic < initCbs.length; ic++) initTargets.push(initCbs[ic]);
      }
      syncCheckbox(cb, initTargets);
    }
  }

  // ───────────────────────────────────────────────
  //  Lifecycle
  // ───────────────────────────────────────────────
  injectCss();

  function enhance() {
    enhanceViews();
    enhanceGroupHeaders();
  }

  $(document)
    .off('knack-scene-render.any.scwSelectAll')
    .on('knack-scene-render.any.scwSelectAll', function () {
      setTimeout(enhance, 350);
    });

  $(document)
    .off('knack-view-render.any.scwSelectAll')
    .on('knack-view-render.any.scwSelectAll', function () {
      setTimeout(enhance, 350);
    });

  // MutationObserver fallback — debounced to avoid infinite loops
  var debounceTimer = 0;
  var obs = new MutationObserver(function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(enhance, 300);
  });
  obs.observe(document.body, { childList: true, subtree: true });

  $(document).ready(function () {
    setTimeout(enhance, 500);
  });
})();
/*** END SELECT-ALL CHECKBOXES ***/
