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
      '  gap: 6px;',
      '  padding: 6px 12px;',
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
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  padding: 0 4px;',
      '}',
      '.scw-sa-header-check input[type="checkbox"] {',
      '  margin: 0;',
      '  cursor: pointer;',
      '}',

      /* identity + chevron placeholder — width set dynamically via JS */
      '.scw-sa-header-toggle {',
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

      /* Each header label cell */
      '.scw-sa-header-cell {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  flex-shrink: 0;',
      '  padding: 0;',
      '}',

      /* ── Sort link — styled to match native <a class="kn-sort"> ── */
      '.scw-sa-header-cell .scw-sa-sort-link {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 3px;',
      '  font-size: 0.85rem;',
      '  font-weight: 600;',
      '  color: #485fc7;',
      '  white-space: normal;',
      '  text-align: center;',
      '  cursor: pointer;',
      '  text-decoration: none;',
      '  line-height: 1.15;',
      '}',
      '.scw-sa-sort-link:hover {',
      '  color: #363636;',
      '}',

      /* Non-sortable label */
      '.scw-sa-header-label {',
      '  font-size: 0.85rem;',
      '  font-weight: 600;',
      '  color: #363636;',
      '  white-space: normal;',
      '  text-align: center;',
      '  line-height: 1.15;',
      '}',

      /* Sort direction icon */
      '.scw-sa-sort-link .icon.is-small {',
      '  margin-left: 3px;',
      '}',

      /* Wrapper inside header cell — vertical stack: label on top, checkbox below */
      '.scw-sa-header-cell .table-fixed-label {',
      '  display: flex !important;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  gap: 2px;',
      '}',

      /* Bulk-edit column checkbox — centered below label */
      '.scw-sa-hdr-cbox {',
      '  margin: 0;',
      '  cursor: pointer;',
      '}',

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
    ].join('\n');

    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ───────────────────────────────────────────────
  //  Helpers
  // ───────────────────────────────────────────────

  function findCheckboxes(container) {
    return container.querySelectorAll(CB_SELECTOR);
  }

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
  //  Sort helpers (always fresh DOM lookups via viewKey)
  // ───────────────────────────────────────────────

  function findSortLink(viewKey, fieldKey) {
    var viewEl = document.getElementById(viewKey);
    if (!viewEl) return null;
    var thead = viewEl.querySelector('thead');
    if (!thead) return null;
    var ths = thead.querySelectorAll('th');
    for (var i = 0; i < ths.length; i++) {
      var th = ths[i];
      if (th.className.indexOf(fieldKey) === -1) continue;
      var link = th.querySelector('a.kn-sort');
      if (link) return { link: link, th: th };
    }
    var links = thead.querySelectorAll('a.kn-sort');
    for (var j = 0; j < links.length; j++) {
      var href = links[j].getAttribute('href') || '';
      if (href.indexOf(fieldKey) !== -1) return { link: links[j], th: links[j].closest('th') };
    }
    return null;
  }

  function readSortState(viewKey, fieldKey) {
    var info = findSortLink(viewKey, fieldKey);
    if (!info || !info.th) return null;
    if (info.th.classList.contains('sorted-asc')) return 'asc';
    if (info.th.classList.contains('sorted-desc')) return 'desc';
    return null;
  }

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

  function readTheadCheckboxes(viewEl) {
    var map = {};
    var thead = viewEl.querySelector('thead');
    if (!thead) return map;
    var ths = thead.querySelectorAll('th');
    for (var i = 0; i < ths.length; i++) {
      var th = ths[i];
      var cbox = th.querySelector('input.bulkEditHeaderCbox');
      if (!cbox) continue;
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

  function areBulkEditCboxesVisible(viewEl) {
    var thead = viewEl.querySelector('thead');
    if (!thead) return false;
    var sample = thead.querySelector('input.bulkEditHeaderCbox');
    if (!sample) return false;
    return !sample.classList.contains('ktlDisplayNone');
  }

  // ───────────────────────────────────────────────
  //  1) View-level header row
  // ───────────────────────────────────────────────

  function readHeaderLayout(viewEl) {
    // Find a visible summary bar (first may be inside a collapsed group)
    var allBars = viewEl.querySelectorAll('.scw-ws-summary');
    var bar = null;
    for (var bi = 0; bi < allBars.length; bi++) {
      if (allBars[bi].getBoundingClientRect().width > 0) {
        bar = allBars[bi];
        break;
      }
    }
    if (!bar) return null;

    var result = { identity: [], fill: null, right: [], hasCabling: false, hasMove: false, hasDelete: false };

    var productCell = bar.querySelector('.scw-ws-sum-product');
    if (productCell) result.identity.push({ text: 'Product', field: productCell.getAttribute('data-field-key') || 'field_1949' });

    var fillGroup = bar.querySelector('.scw-ws-sum-group--fill');
    if (fillGroup) {
      var fillLabel = fillGroup.querySelector('.scw-ws-sum-label');
      var fillFields = fillGroup.getAttribute('data-scw-fields') || '';
      result.fill = {
        text: fillLabel ? fillLabel.textContent.trim() : 'Labor Desc',
        fields: fillFields.split(/\s+/).filter(function(f) { return f; })
      };
    }

    var rightContainer = bar.querySelector('.scw-ws-sum-right');
    if (rightContainer) {
      var groups = rightContainer.querySelectorAll('.scw-ws-sum-group');
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        var cls = g.className;

        if (cls.indexOf('sum-group--cabling') !== -1) { result.hasCabling = true; continue; }
        if (cls.indexOf('sum-group--move') !== -1) {
          var moveTd = g.querySelector('td[data-field-key]');
          result.hasMove = true;
          result.moveField = moveTd ? moveTd.getAttribute('data-field-key') : 'field_1946';
          continue;
        }
        if (cls.indexOf('sum-group--delete') !== -1 || g.querySelector('.kn-link-delete')) { result.hasDelete = true; continue; }

        var lbl = g.querySelector('.scw-ws-sum-label');
        var text = lbl ? lbl.textContent.trim() : '';
        if (!text) continue;

        var fieldKeys = (g.getAttribute('data-scw-fields') || '').split(/\s+/).filter(function(f) { return f; });

        result.right.push({ text: text, fields: fieldKeys });
      }
    }

    if (!result.hasCabling && bar.querySelector('.scw-ws-cabling-chit')) result.hasCabling = true;
    if (!result.hasDelete && bar.querySelector('.scw-ws-sum-delete')) result.hasDelete = true;

    return result;
  }

  /**
   * Build a header cell: sort link + optional bulk-edit checkbox.
   * Uses <span> (not <a class="kn-sort">) to avoid Knack delegated handler interference.
   */
  function buildHeaderCell(labelText, fieldKeys, theadMap, bulkVisible, viewKey) {
    var cell = document.createElement('span');
    cell.className = 'scw-sa-header-cell';

    var hasSortLink = false;
    var sortFieldKey = fieldKeys.length ? fieldKeys[0] : null;
    if (sortFieldKey) hasSortLink = !!findSortLink(viewKey, sortFieldKey);

    if (hasSortLink) {
      var wrapper = document.createElement('span');
      wrapper.className = 'table-fixed-label' + (theadMap[sortFieldKey] ? ' bulkEditTh' : '');

      var sortEl = document.createElement('span');
      sortEl.className = 'scw-sa-sort-link';
      if (sortFieldKey) sortEl.setAttribute('data-scw-sort-field', sortFieldKey);

      var dir = readSortState(viewKey, sortFieldKey);

      var textSpan = document.createElement('span');
      textSpan.textContent = labelText;
      sortEl.appendChild(textSpan);

      if (dir) {
        var iconWrap = document.createElement('span');
        iconWrap.className = 'icon is-small is-transparent';
        iconWrap.style.marginLeft = '3px';
        var icon = document.createElement('i');
        icon.className = dir === 'desc' ? 'fa fa-sort-amount-desc' : 'fa fa-sort-amount-asc';
        iconWrap.appendChild(icon);
        sortEl.appendChild(iconWrap);
      }

      sortEl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        triggerSort(viewKey, fieldKeys);
      });

      wrapper.appendChild(sortEl);

      // Bulk-edit column checkbox (full KTL classes)
      var matchedCbox = null;
      for (var i = 0; i < fieldKeys.length; i++) {
        if (theadMap[fieldKeys[i]]) { matchedCbox = theadMap[fieldKeys[i]]; break; }
      }
      if (matchedCbox) {
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = KTL_HEADER_CLS + ' scw-sa-hdr-cbox' + (bulkVisible ? '' : ' ktlDisplayNone');
        cb.checked = matchedCbox.checked;
        cb.setAttribute('aria-label', 'Select column');
        cb.setAttribute('data-ktl-bulkops', '1');
        cb.setAttribute('data-scw-thead-field', fieldKeys[0]);
        cb.addEventListener('click', function (e) {
          e.stopPropagation();
          var freshEl = document.getElementById(viewKey);
          if (!freshEl) return;
          var freshMap = readTheadCheckboxes(freshEl);
          var nativeCb = freshMap[fieldKeys[0]];
          if (nativeCb && nativeCb.checked !== cb.checked) nativeCb.click();
        });
        wrapper.appendChild(cb);
      }

      cell.appendChild(wrapper);
    } else {
      var lbl = document.createElement('span');
      lbl.className = 'scw-sa-header-label';
      lbl.textContent = labelText;
      cell.appendChild(lbl);
    }

    return cell;
  }

  function findHeaderBar(viewKey) {
    return document.querySelector('.scw-sa-header[data-scw-sa-view="' + viewKey + '"]');
  }

  /**
   * Measure a VISIBLE summary bar in the view and apply matching widths
   * to the header bar cells so columns are perfectly aligned.
   */
  function alignHeaderToSummary(bar, viewEl) {
    // Find a visible summary bar (first one may be in a collapsed group)
    var summaries = viewEl.querySelectorAll('.scw-ws-summary');
    var summary = null;
    for (var si = 0; si < summaries.length; si++) {
      if (summaries[si].getBoundingClientRect().width > 0) {
        summary = summaries[si];
        break;
      }
    }
    if (!summary) return;

    // ── Left side: check + toggle zone → header check + toggle ──
    var sumCheck = summary.querySelector('.scw-ws-sum-check');
    var hdrCheck = bar.querySelector('.scw-sa-header-check');
    if (sumCheck && hdrCheck) {
      var cw = sumCheck.getBoundingClientRect().width;
      hdrCheck.style.width = cw + 'px';
      hdrCheck.style.minWidth = cw + 'px';
      hdrCheck.style.flex = '0 0 ' + cw + 'px';
    }

    var sumToggle = summary.querySelector('.scw-ws-toggle-zone');
    var hdrToggle = bar.querySelector('.scw-sa-header-toggle');
    if (sumToggle && hdrToggle) {
      var tw = sumToggle.getBoundingClientRect().width;
      hdrToggle.style.width = tw + 'px';
      hdrToggle.style.minWidth = tw + 'px';
      hdrToggle.style.flex = '0 0 ' + tw + 'px';
    }

    // ── Right side: match each group width ──
    var sumRight = summary.querySelector('.scw-ws-sum-right');
    var hdrRight = bar.querySelector('.scw-sa-header-right');
    if (sumRight && hdrRight) {
      var sumGroups = sumRight.querySelectorAll(':scope > .scw-ws-sum-group');
      var hdrCells = hdrRight.querySelectorAll(':scope > .scw-sa-header-cell');
      for (var i = 0; i < Math.min(sumGroups.length, hdrCells.length); i++) {
        var gw = sumGroups[i].getBoundingClientRect().width;
        hdrCells[i].style.width = Math.round(gw) + 'px';
        hdrCells[i].style.minWidth = Math.round(gw) + 'px';
        hdrCells[i].style.flex = '0 0 ' + Math.round(gw) + 'px';
      }
    }
  }

  /**
   * Build and insert the header bar.
   * Inserts OUTSIDE the view (in accordion body) to survive re-renders.
   */
  function buildHeaderBar(viewEl, viewKey) {
    var layout = readHeaderLayout(viewEl);
    if (!layout) return null;

    var existing = findHeaderBar(viewKey);
    if (existing) existing.remove();

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

    // ── Toggle zone placeholder (mirrors summary toggle-zone width) ──
    var toggleSpan = document.createElement('span');
    toggleSpan.className = 'scw-sa-header-toggle';
    for (var id = 0; id < layout.identity.length; id++) {
      var idItem = layout.identity[id];
      var idCell = buildHeaderCell(idItem.text, idItem.field ? [idItem.field] : [], theadMap, bulkVisible, viewKey);
      toggleSpan.appendChild(idCell);
    }
    bar.appendChild(toggleSpan);

    // ── Fill label (labor desc) ──
    if (layout.fill) {
      var fillCell = buildHeaderCell(layout.fill.text, layout.fill.fields, theadMap, bulkVisible, viewKey);
      fillCell.classList.add('scw-sa-header-fill');
      bar.appendChild(fillCell);
    }

    // ── Right-side labels ──
    var rightSpan = document.createElement('span');
    rightSpan.className = 'scw-sa-header-right';

    if (layout.hasCabling) {
      rightSpan.appendChild(buildHeaderCell('Cabling', [], theadMap, bulkVisible, viewKey));
    }

    for (var r = 0; r < layout.right.length; r++) {
      var item = layout.right[r];
      rightSpan.appendChild(buildHeaderCell(item.text, item.fields, theadMap, bulkVisible, viewKey));
    }

    if (layout.hasMove) {
      rightSpan.appendChild(buildHeaderCell('Move', layout.moveField ? [layout.moveField] : [], theadMap, bulkVisible, viewKey));
    }
    if (layout.hasDelete) {
      var delCell = document.createElement('span');
      delCell.className = 'scw-sa-header-cell';
      delCell.innerHTML = '&nbsp;';
      rightSpan.appendChild(delCell);
    }

    bar.appendChild(rightSpan);

    // ── Insert INSIDE the view, after kn-records-nav ──
    // Primary: place after .kn-records-nav so the bar sits between
    //          the filters/pagination row and the table content.
    // Fallback: before .kn-table-wrapper, or before viewEl itself.
    var inserted = false;
    var recordsNav = viewEl.querySelector('.kn-records-nav');
    if (recordsNav) {
      recordsNav.parentNode.insertBefore(bar, recordsNav.nextSibling);
      inserted = true;
    }
    if (!inserted) {
      var tableWrapper = viewEl.querySelector('.kn-table-wrapper');
      if (tableWrapper) {
        tableWrapper.parentNode.insertBefore(bar, tableWrapper);
      } else if (viewEl.parentNode) {
        viewEl.parentNode.insertBefore(bar, viewEl);
      }
    }

    // ── Align columns to summary bar ──
    alignHeaderToSummary(bar, viewEl);

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
      var freshEl = document.getElementById(viewKey);
      if (!freshEl) return;
      var cbs = findCheckboxes(freshEl);
      syncCheckbox(selectAllCb, cbs);
      // After a row checkbox changes, KTL toggles ktlDisplayNone on native
      // thead checkboxes (class change). Delay sync so KTL processes first.
      setTimeout(function () {
        var el = document.getElementById(viewKey);
        if (el) syncHeaderBar(el, viewKey);
      }, 150);
    });

    syncCheckbox(selectAllCb, findCheckboxes(viewEl));

    return bar;
  }

  /**
   * Sync the header bar with current view state: checkbox visibility,
   * sort direction indicators, column alignment, and select-all state.
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
        hcb.classList.remove('ktlDisplayNone');
      } else {
        hcb.classList.add('ktlDisplayNone');
      }
      if (fk && theadMap[fk]) hcb.checked = theadMap[fk].checked;
    }

    // Sync sort direction indicators
    var sortLinks = bar.querySelectorAll('.scw-sa-sort-link');
    for (var s = 0; s < sortLinks.length; s++) {
      var sl = sortLinks[s];
      var fld = sl.getAttribute('data-scw-sort-field');
      if (!fld) continue;
      var dir = readSortState(viewKey, fld);

      // Update icon
      var existingIcon = sl.querySelector('.icon.is-small');
      if (dir && !existingIcon) {
        var iconWrap = document.createElement('span');
        iconWrap.className = 'icon is-small is-transparent';
        iconWrap.style.marginLeft = '3px';
        var ic = document.createElement('i');
        ic.className = dir === 'desc' ? 'fa fa-sort-amount-desc' : 'fa fa-sort-amount-asc';
        iconWrap.appendChild(ic);
        sl.appendChild(iconWrap);
      } else if (dir && existingIcon) {
        var icEl = existingIcon.querySelector('i');
        if (icEl) icEl.className = dir === 'desc' ? 'fa fa-sort-amount-desc' : 'fa fa-sort-amount-asc';
      } else if (!dir && existingIcon) {
        existingIcon.remove();
      }
    }

    // Re-align columns (summary bar may have re-rendered with different widths)
    alignHeaderToSummary(bar, viewEl);

    // Sync select-all checkbox + re-bind change handler to (possibly new) viewEl
    var masterCb = bar.querySelector('.scw-sa-header-check input[type="checkbox"]');
    if (masterCb) {
      syncCheckbox(masterCb, findCheckboxes(viewEl));
      // Re-bind change handler — after inline edits Knack replaces the view
      // element, so the old handler (bound to the destroyed element) is dead.
      $(viewEl).off('change.scwSaHeader').on('change.scwSaHeader', 'input[type="checkbox"]', function () {
        var freshEl = document.getElementById(viewKey);
        if (!freshEl) return;
        var cbs = findCheckboxes(freshEl);
        syncCheckbox(masterCb, cbs);
        setTimeout(function () {
          var el = document.getElementById(viewKey);
          if (el) syncHeaderBar(el, viewKey);
        }, 150);
      });
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

      // Check if the bar already exists (outside view, in accordion body)
      var existingBar = findHeaderBar(viewKey);
      if (existingBar) {
        syncHeaderBar(viewEl, viewKey);
        viewEl.setAttribute(HEADER_ATTR, '1');
        continue;
      }

      // Build if this view has a device-worksheet summary bar OR bulk checkboxes.
      // After inline edits, KTL checkboxes may appear later than the summary bar,
      // so checking for summary bar is the primary guard.
      var hasSummary = !!viewEl.querySelector('.scw-ws-summary');
      var hasCheckboxes = findCheckboxes(viewEl).length > 0;
      if (!hasSummary && !hasCheckboxes) continue;

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
        if (tr.querySelector('.scw-sa-grp-check')) continue;
        tr.removeAttribute(GROUP_ATTR);
      }

      var rows = rowsInGroup(tr);
      var hasCheckboxes = false;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].querySelector(CB_SELECTOR)) { hasCheckboxes = true; break; }
      }
      if (!hasCheckboxes) continue;

      tr.setAttribute(GROUP_ATTR, '1');

      var oldBtn = tr.querySelector('.scw-select-all-btn');
      if (oldBtn) oldBtn.remove();

      var checkWrap = document.createElement('span');
      checkWrap.className = 'scw-sa-grp-check';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('aria-label', 'Select all rows in this group');
      cb.title = 'Select / deselect group';
      checkWrap.appendChild(cb);

      var td = tr.querySelector('td');
      if (!td) continue;
      td.insertBefore(checkWrap, td.firstChild);

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

          var vEl = headerRow.closest('[id^="view_"]');
          if (vEl) {
            var hBar = findHeaderBar(vEl.id);
            if (hBar) {
              var viewCb = hBar.querySelector('.scw-sa-header-check input[type="checkbox"]');
              if (viewCb) syncCheckbox(viewCb, findCheckboxes(vEl));
            }
          }
        });

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
      setTimeout(enhance, 700);
      setTimeout(enhance, 1500);
    });

  // After inline edits, the post-edit coordinator rebuilds accordions
  // and device-worksheet summary bars before our enhance() runs.
  // Schedule a late rebuild to ensure header bars are restored after
  // all other features have finished their post-edit work.
  $(document)
    .off('knack-cell-update.scwSelectAll')
    .on('knack-cell-update.scwSelectAll', function () {
      setTimeout(enhance, 1200);
      setTimeout(enhance, 2000);
    });

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
