/*** SELECT-ALL CHECKBOXES — view header row + group header checkboxes ***/
(function () {
  'use strict';

  var STYLE_ID  = 'scw-select-all-css';
  var HEADER_ATTR = 'data-scw-sa-header';
  var GROUP_ATTR  = 'data-scw-sa-grp';
  var CB_SELECTOR =
    '.kn-table-bulk-checkbox input[type="checkbox"], ' +
    'input.ktlCheckbox-row[type="checkbox"]';

  /* KTL class strings — match native Knack + KTL exactly */
  var KTL_MASTER_CLS = 'ktlCheckbox masterSelector ktlCheckbox-master ktlCheckbox-table bulkEditCb ktlCheckbox-bulkops';
  var KTL_HEADER_CLS = 'ktlCheckbox bulkEditHeaderCbox ktlCheckbox-header ktlCheckbox-table ktlCheckbox-bulkops bulkEditCb';

  // ───────────────────────────────────────────────
  //  CSS
  // ───────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      /* ── View-level header bar — styled like native Knack <thead> row ── */
      '.scw-sa-header {',
      '  display: flex;',
      '  align-items: stretch;',
      '  gap: 0;',
      '  padding: 0 12px;',
      '  background: #fafafa;',
      '  border-bottom: 1px solid #dbdbdb;',
      '  min-height: 36px;',
      '  user-select: none;',
      '  position: sticky;',
      '  top: 0;',
      '  z-index: 5;',
      '}',
      '.scw-sa-header-check {',
      '  flex: 0 0 auto;',
      '  min-width: 24px;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 0;',
      '}',
      '.scw-sa-header-check input[type="checkbox"] {',
      '  margin: 0;',
      '  cursor: pointer;',
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

      /* Each header label cell: styled like native <th> */
      '.scw-sa-header-cell {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  flex-shrink: 0;',
      '  padding: 8px 4px;',
      '}',

      /*',
       * Sort link — uses native Knack classes (kn-sort, level, is-compact)',
       * but we add a wrapper span so we can target it without Knack bindings.',
       */
      '.scw-sa-header-cell .table-fixed-label {',
      '  display: inline-flex;',
      '  align-items: center;',
      '}',
      '.scw-sa-header-cell a.kn-sort {',
      '  color: #485fc7;',
      '  text-decoration: none;',
      '  font-size: 0.85rem;',
      '  font-weight: 600;',
      '  white-space: nowrap;',
      '}',
      '.scw-sa-header-cell a.kn-sort:hover {',
      '  color: #363636;',
      '}',

      /* Non-sortable label (delete column, etc.) */
      '.scw-sa-header-label {',
      '  font-size: 0.85rem;',
      '  font-weight: 600;',
      '  color: #363636;',
      '  white-space: nowrap;',
      '  text-align: center;',
      '  line-height: 1.3;',
      '}',

      /* Sort direction icon — native Knack uses icon.is-small.is-transparent */
      '.scw-sa-header-cell .icon.is-small {',
      '  margin-left: 3px;',
      '}',

      /* Bulk-edit column checkbox inside header cell */
      '.scw-sa-hdr-cbox {',
      '  margin: 0 0 0 4px;',
      '  cursor: pointer;',
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
  //  Sort helpers
  // ───────────────────────────────────────────────

  /**
   * Find the native Knack sort link in the hidden <thead> for a given field key.
   * Always does a fresh DOM lookup using viewKey string.
   * Returns { link, th } or null.
   */
  function findSortLink(viewKey, fieldKey) {
    var viewEl = document.getElementById(viewKey);
    if (!viewEl) return null;
    var thead = viewEl.querySelector('thead');
    if (!thead) return null;
    // Match by th class first (most reliable)
    var ths = thead.querySelectorAll('th');
    for (var i = 0; i < ths.length; i++) {
      var th = ths[i];
      if (th.className.indexOf(fieldKey) === -1) continue;
      var link = th.querySelector('a.kn-sort');
      if (link) return { link: link, th: th };
    }
    // Fallback: search by href
    var links = thead.querySelectorAll('a.kn-sort');
    for (var j = 0; j < links.length; j++) {
      var href = links[j].getAttribute('href') || '';
      if (href.indexOf(fieldKey) !== -1) return { link: links[j], th: links[j].closest('th') };
    }
    return null;
  }

  /**
   * Read the current sort direction for a field from the hidden <thead>.
   * Returns 'asc', 'desc', or null.
   */
  function readSortState(viewKey, fieldKey) {
    var info = findSortLink(viewKey, fieldKey);
    if (!info || !info.th) return null;
    if (info.th.classList.contains('sorted-asc')) return 'asc';
    if (info.th.classList.contains('sorted-desc')) return 'desc';
    return null;
  }

  /**
   * Read the native sort link href for a field (e.g. "#field_2154|asc").
   */
  function readSortHref(viewKey, fieldKey) {
    var info = findSortLink(viewKey, fieldKey);
    if (!info || !info.link) return '#';
    return info.link.getAttribute('href') || '#';
  }

  /**
   * Trigger sort by programmatically clicking the native Knack sort link.
   * Always does a fresh DOM lookup.
   */
  function triggerSort(viewKey, fieldKeys) {
    for (var i = 0; i < fieldKeys.length; i++) {
      var info = findSortLink(viewKey, fieldKeys[i]);
      if (info && info.link) {
        info.link.click();
        return true;
      }
    }
    return false;
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
   * Build a header cell using native Knack DOM structure:
   *   <span class="scw-sa-header-cell [widthCls]">
   *     <span class="table-fixed-label [bulkEditTh]">
   *       <a href="#field|dir" class="kn-sort level is-compact">
   *         <span>Label</span>
   *         <span class="icon is-small is-transparent">
   *           <i class="fa fa-sort-amount-asc"></i>
   *         </span>
   *       </a>
   *       <input class="ktlCheckbox bulkEditHeaderCbox ..." />
   *     </span>
   *   </span>
   */
  function buildHeaderCell(labelText, fieldKeys, theadMap, bulkVisible, extraCls, viewKey) {
    var cell = document.createElement('span');
    cell.className = 'scw-sa-header-cell' + (extraCls ? ' ' + extraCls : '');

    // Check if any of this group's fields has a native sort link
    var hasSortLink = false;
    var sortFieldKey = fieldKeys.length ? fieldKeys[0] : null;
    if (sortFieldKey) {
      hasSortLink = !!findSortLink(viewKey, sortFieldKey);
    }

    if (hasSortLink) {
      // ── Sortable: replicate native Knack <th> internals ──
      var fixedLabel = document.createElement('span');
      fixedLabel.className = 'table-fixed-label' + (theadMap[sortFieldKey] ? ' bulkEditTh' : '');
      fixedLabel.style.display = 'inline-flex';

      var dir = readSortState(viewKey, sortFieldKey);
      var href = readSortHref(viewKey, sortFieldKey);

      var sortLink = document.createElement('a');
      sortLink.href = href;
      sortLink.className = 'kn-sort level is-compact';

      var textSpan = document.createElement('span');
      textSpan.textContent = labelText;
      sortLink.appendChild(textSpan);

      // Sort direction icon (only visible when actively sorted)
      if (dir) {
        var iconWrap = document.createElement('span');
        iconWrap.className = 'icon is-small is-transparent';
        iconWrap.style.marginLeft = '3px';
        var icon = document.createElement('i');
        icon.className = dir === 'desc' ? 'fa fa-sort-amount-desc' : 'fa fa-sort-amount-asc';
        iconWrap.appendChild(icon);
        sortLink.appendChild(iconWrap);
      }

      // Click: trigger the native hidden sort link (not follow this href)
      sortLink.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        triggerSort(viewKey, fieldKeys);
      });

      fixedLabel.appendChild(sortLink);

      // Bulk-edit column checkbox (KTL-compatible)
      var matchedCbox = null;
      for (var i = 0; i < fieldKeys.length; i++) {
        if (theadMap[fieldKeys[i]]) { matchedCbox = theadMap[fieldKeys[i]]; break; }
      }
      if (matchedCbox) {
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = KTL_HEADER_CLS + ' scw-sa-hdr-cbox' + (bulkVisible ? '' : ' scw-sa-hdr-cbox--hidden');
        cb.checked = matchedCbox.checked;
        cb.setAttribute('aria-label', 'Select column');
        cb.setAttribute('data-ktl-bulkops', '1');
        cb.setAttribute('data-scw-thead-field', fieldKeys[0]);
        cb.addEventListener('click', function (e) {
          e.stopPropagation();
          // Fresh lookup — native thead may have been rebuilt
          var freshEl = document.getElementById(viewKey);
          if (!freshEl) return;
          var freshMap = readTheadCheckboxes(freshEl);
          var nativeCb = freshMap[fieldKeys[0]];
          if (nativeCb && nativeCb.checked !== cb.checked) {
            nativeCb.click();
          }
        });
        fixedLabel.appendChild(cb);
      }

      cell.appendChild(fixedLabel);
    } else {
      // ── Non-sortable column: plain label ──
      var lbl = document.createElement('span');
      lbl.className = 'scw-sa-header-label';
      lbl.textContent = labelText;
      cell.appendChild(lbl);
    }

    return cell;
  }

  /**
   * Find the header bar for a given viewKey anywhere in the document.
   */
  function findHeaderBar(viewKey) {
    return document.querySelector('.scw-sa-header[data-scw-sa-view="' + viewKey + '"]');
  }

  /**
   * Build and insert the header bar.
   * Inserts OUTSIDE the view element (in accordion body) when possible,
   * so it survives Knack view re-renders.
   */
  function buildHeaderBar(viewEl, viewKey) {
    var layout = readHeaderLayout(viewEl);
    if (!layout) return null;

    // Remove any previously-inserted header bar (search globally)
    var existing = findHeaderBar(viewKey);
    if (existing) existing.remove();

    // Read thead checkbox map for KTL bulk-edit column selection
    var theadMap = readTheadCheckboxes(viewEl);
    var bulkVisible = areBulkEditCboxesVisible(viewEl);

    var bar = document.createElement('div');
    bar.className = 'scw-sa-header';
    bar.setAttribute('data-scw-sa-view', viewKey);

    // ── Select-all checkbox (with KTL classes) ──
    var checkWrap = document.createElement('span');
    checkWrap.className = 'scw-sa-header-check';
    var selectAllCb = document.createElement('input');
    selectAllCb.type = 'checkbox';
    selectAllCb.className = KTL_MASTER_CLS;
    selectAllCb.setAttribute('aria-label', 'Select all rows');
    selectAllCb.setAttribute('data-ktl-selection', 'ktlCheckbox');
    selectAllCb.setAttribute('data-ktl-bulkops', '1');
    selectAllCb.title = 'Select / deselect all';
    checkWrap.appendChild(selectAllCb);
    bar.appendChild(checkWrap);

    // ── Identity labels (Product) ──
    var idSpan = document.createElement('span');
    idSpan.className = 'scw-sa-header-identity';
    for (var id = 0; id < layout.identity.length; id++) {
      var idItem = layout.identity[id];
      var idCell = buildHeaderCell(idItem.text, idItem.field ? [idItem.field] : [], theadMap, bulkVisible, '', viewKey);
      idSpan.appendChild(idCell);
    }
    bar.appendChild(idSpan);

    // ── Fill label (labor desc) ──
    if (layout.fill) {
      var fillCell = buildHeaderCell(layout.fill.text, layout.fill.fields, theadMap, bulkVisible, '', viewKey);
      fillCell.classList.add('scw-sa-header-fill');
      bar.appendChild(fillCell);
    }

    // ── Right-side labels ──
    var rightSpan = document.createElement('span');
    rightSpan.className = 'scw-sa-header-right';

    if (layout.hasCabling) {
      var cabCell = buildHeaderCell('Cabling', [], theadMap, bulkVisible, 'scw-sa-hdr-cabling', viewKey);
      rightSpan.appendChild(cabCell);
    }

    for (var r = 0; r < layout.right.length; r++) {
      var item = layout.right[r];
      var rCell = buildHeaderCell(item.text, item.fields, theadMap, bulkVisible, item.widthCls, viewKey);
      rightSpan.appendChild(rCell);
    }

    if (layout.hasMove) {
      var mvCell = buildHeaderCell('Move', layout.moveField ? [layout.moveField] : [], theadMap, bulkVisible, 'scw-sa-hdr-move', viewKey);
      rightSpan.appendChild(mvCell);
    }
    if (layout.hasDelete) {
      var delCell = document.createElement('span');
      delCell.className = 'scw-sa-header-cell scw-sa-hdr-delete';
      delCell.innerHTML = '&nbsp;';
      rightSpan.appendChild(delCell);
    }

    bar.appendChild(rightSpan);

    // ── Insert OUTSIDE the view element when possible ──
    // The accordion body wraps the view; inserting there survives view re-renders.
    var accordionBody = viewEl.closest('.scw-ktl-accordion__body');
    if (accordionBody) {
      accordionBody.insertBefore(bar, viewEl);
    } else {
      // Fallback: inside the view, before the table wrapper
      var tableWrapper = viewEl.querySelector('.kn-table-wrapper');
      if (tableWrapper) {
        tableWrapper.parentNode.insertBefore(bar, tableWrapper);
      } else if (viewEl.parentNode) {
        viewEl.parentNode.insertBefore(bar, viewEl);
      }
    }

    // ── Click handler for select-all (fresh DOM lookup) ──
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
   * Also updates sort direction indicators.
   */
  function syncHeaderBar(viewEl, viewKey) {
    var bar = findHeaderBar(viewKey);
    if (!bar) return;

    var theadMap = readTheadCheckboxes(viewEl);
    var visible = areBulkEditCboxesVisible(viewEl);

    // Sync bulk-edit column checkboxes
    var hdrCboxes = bar.querySelectorAll('.scw-sa-hdr-cbox');
    for (var i = 0; i < hdrCboxes.length; i++) {
      var hcb = hdrCboxes[i];
      var fk = hcb.getAttribute('data-scw-thead-field');
      if (visible) {
        hcb.classList.remove('scw-sa-hdr-cbox--hidden');
      } else {
        hcb.classList.add('scw-sa-hdr-cbox--hidden');
      }
      if (fk && theadMap[fk]) {
        hcb.checked = theadMap[fk].checked;
      }
    }

    // Sync sort direction indicators
    var sortLinks = bar.querySelectorAll('a.kn-sort');
    for (var s = 0; s < sortLinks.length; s++) {
      var a = sortLinks[s];
      var oldHref = a.getAttribute('href') || '';
      // Extract field key from href (e.g. "#field_2154|asc" → "field_2154")
      var match = oldHref.match(/(field_\d+)/);
      if (!match) continue;
      var fld = match[1];
      var dir = readSortState(viewKey, fld);
      var newHref = readSortHref(viewKey, fld);
      a.setAttribute('href', newHref);

      // Update icon
      var iconWrap = a.querySelector('.icon.is-small');
      if (dir && !iconWrap) {
        iconWrap = document.createElement('span');
        iconWrap.className = 'icon is-small is-transparent';
        iconWrap.style.marginLeft = '3px';
        var icon = document.createElement('i');
        icon.className = dir === 'desc' ? 'fa fa-sort-amount-desc' : 'fa fa-sort-amount-asc';
        iconWrap.appendChild(icon);
        a.appendChild(iconWrap);
      } else if (dir && iconWrap) {
        var ic = iconWrap.querySelector('i');
        if (ic) ic.className = dir === 'desc' ? 'fa fa-sort-amount-desc' : 'fa fa-sort-amount-asc';
      } else if (!dir && iconWrap) {
        iconWrap.remove();
      }
    }

    // Sync select-all checkbox state
    var masterCb = bar.querySelector('.scw-sa-header-check input[type="checkbox"]');
    if (masterCb) {
      syncCheckbox(masterCb, findCheckboxes(viewEl));
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

      // Check if the bar already exists (may be outside view, in accordion body)
      var existingBar = findHeaderBar(viewKey);
      if (existingBar) {
        // Bar exists — just sync checkboxes and sort state
        syncHeaderBar(viewEl, viewKey);
        viewEl.setAttribute(HEADER_ATTR, '1');
        continue;
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
            var hBar = findHeaderBar(vEl.id);
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
      // Second pass for views where transformView / KTL hasn't finished
      setTimeout(enhance, 700);
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
