/*** SELECT-ALL CHECKBOXES — native <thead> + group header checkboxes ***/
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
      /* ── Sticky <thead> ── */
      '.kn-table thead {',
      '  position: sticky;',
      '  top: 0;',
      '  z-index: 5;',
      '}',
      '.kn-table thead th {',
      '  background: #fafafa;',
      '  border-bottom: 2px solid #dbdbdb;',
      '  padding: 8px 10px;',
      '  font-size: 0.85rem;',
      '  font-weight: 600;',
      '  color: #363636;',
      '  white-space: normal;',
      '  vertical-align: middle;',
      '}',
      '.kn-table thead th .kn-sort {',
      '  color: #363636;',
      '  text-decoration: none;',
      '}',
      '.kn-table thead th .kn-sort:hover {',
      '  color: #000;',
      '}',
      '.kn-table thead .ktlCheckboxHeaderCell {',
      '  text-align: center;',
      '  vertical-align: middle;',
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
      '  display: inline-block !important;',
      '  opacity: 1 !important;',
      '  visibility: visible !important;',
      '  position: static !important;',
      '}',
      'tr.scw-group-header > td { overflow: visible !important; }',
      '.scw-sa-grp-check input[type="checkbox"] {',
      '  pointer-events: auto;',
      '}',

      '/* ── Normalize ALL KTL + SCW checkboxes to fixed 15px ── */',
      '.kn-table thead input.ktlCheckbox[type="checkbox"],',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"],',
      '.scw-sa-grp-check input[type="checkbox"],',
      'tr.kn-table-group.scw-group-header input[type="checkbox"] {',
      '  appearance: none !important;',
      '  -webkit-appearance: none !important;',
      '  -moz-appearance: none !important;',
      '  width: 15px !important;',
      '  height: 15px !important;',
      '  min-width: 15px !important;',
      '  min-height: 15px !important;',
      '  max-width: 15px !important;',
      '  max-height: 15px !important;',
      '  flex-shrink: 0 !important;',
      '  box-sizing: border-box !important;',
      '  border: 1.5px solid #9ca3af !important;',
      '  border-radius: 3px !important;',
      '  background: #fff !important;',
      '  cursor: pointer;',
      '  position: relative !important;',
      '  vertical-align: middle !important;',
      '  outline: none !important;',
      '}',
      '.kn-table thead input.ktlCheckbox[type="checkbox"]:checked,',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"]:checked,',
      '.scw-sa-grp-check input[type="checkbox"]:checked,',
      'tr.kn-table-group.scw-group-header input[type="checkbox"]:checked {',
      '  background: #07467c !important;',
      '  border-color: #07467c !important;',
      '}',
      '.kn-table thead input.ktlCheckbox[type="checkbox"]:checked::after,',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"]:checked::after,',
      '.scw-sa-grp-check input[type="checkbox"]:checked::after,',
      'tr.kn-table-group.scw-group-header input[type="checkbox"]:checked::after {',
      '  content: "" !important;',
      '  position: absolute !important;',
      '  left: 4px !important;',
      '  top: 1px !important;',
      '  width: 5px !important;',
      '  height: 9px !important;',
      '  border: solid #fff !important;',
      '  border-width: 0 2px 2px 0 !important;',
      '  transform: rotate(45deg) !important;',
      '}',
      '.kn-table thead input.ktlCheckbox[type="checkbox"]:indeterminate,',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"]:indeterminate,',
      '.scw-sa-grp-check input[type="checkbox"]:indeterminate,',
      'tr.kn-table-group.scw-group-header input[type="checkbox"]:indeterminate {',
      '  background: #07467c !important;',
      '  border-color: #07467c !important;',
      '}',
      '.kn-table thead input.ktlCheckbox[type="checkbox"]:indeterminate::after,',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"]:indeterminate::after,',
      '.scw-sa-grp-check input[type="checkbox"]:indeterminate::after,',
      'tr.kn-table-group.scw-group-header input[type="checkbox"]:indeterminate::after {',
      '  content: "" !important;',
      '  position: absolute !important;',
      '  left: 2px !important;',
      '  top: 5px !important;',
      '  width: 9px !important;',
      '  height: 2px !important;',
      '  background: #fff !important;',
      '  border: none !important;',
      '  transform: none !important;',
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

  // A row is "selectable" for bulk operations only if it has at least
  // one inline-editable cell. Rows that are entirely read-only (no
  // td.cell-edit anywhere — either because the columns are display-only,
  // or because conditional-grayout has stripped cell-edit on this row's
  // cells) get skipped by select-all and by group-level select.
  //
  // The signal `td.cell-edit` is universal in this codebase:
  //   - Knack adds it on render for inline-edit columns.
  //   - SOW_lineitem_conditional-field-grayout.js + the survey variant
  //     remove it on per-row locked cells (see line ~267 of that file).
  //   - Read-only fields (formulas, view-only role config, etc.) never
  //     get it in the first place.
  function rowIsEditable(tr) {
    if (!tr) return false;
    return !!tr.querySelector('td.cell-edit');
  }

  // Filter a NodeList/Array of row checkboxes down to the ones whose row
  // has at least one editable cell. Used everywhere we previously used
  // findCheckboxes() for the purpose of acting on a selection.
  function selectableCheckboxes(container) {
    var raw = findCheckboxes(container);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var cb = raw[i];
      var tr = cb.closest && cb.closest('tr');
      if (rowIsEditable(tr)) out.push(cb);
    }
    return out;
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

  /**
   * After a bulk .checked assignment, sync KTL's visual state that it
   * normally manages via its own change handlers:
   *  - bulkEditSelectedRow class on each row's <td> elements
   *  - KTL's "Delete Selected: N" button text
   *  - Header column bulk-edit checkboxes visibility
   */
  function syncKtlBulkState(viewEl) {
    var rows = viewEl.querySelectorAll('table.kn-table tbody tr');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.classList.contains('kn-table-group') ||
          row.classList.contains('kn-table-totals')) continue;

      var cb = row.querySelector(CB_SELECTOR);
      var tds = row.querySelectorAll('td');
      for (var t = 0; t < tds.length; t++) {
        if (cb && cb.checked) {
          tds[t].classList.add('bulkEditSelectedRow');
        } else {
          tds[t].classList.remove('bulkEditSelectedRow');
        }
      }
    }

    var checkedCount = viewEl.querySelectorAll(CB_SELECTOR + ':checked').length;

    var viewKey = viewEl.id;
    var delBtn = document.getElementById('ktl-bulk-delete-selected-' + viewKey);
    if (delBtn) {
      if (checkedCount > 0) {
        delBtn.textContent = 'Delete Selected: ' + checkedCount;
        delBtn.style.display = '';
      } else {
        delBtn.style.display = 'none';
      }
    }

    syncHeaderCboxVisibility(viewEl, checkedCount > 0);
  }

  /**
   * Show or hide the KTL bulkEditHeaderCbox checkboxes in <thead>.
   * KTL normally manages this via its own master-selector handler, but
   * our code intercepts those events (stopImmediatePropagation). So we
   * must replicate header checkbox visibility after any selection change.
   */
  function syncHeaderCboxVisibility(viewEl, anyChecked) {
    var ths = viewEl.querySelectorAll('thead th');
    for (var t = 0; t < ths.length; t++) {
      // Skip hidden <th>s (worksheet reorder hides non-summary columns)
      if (ths[t].style.display === 'none') continue;
      var hdrSpans = ths[t].querySelectorAll('.table-fixed-label');
      for (var s = 0; s < hdrSpans.length; s++) {
        var sp = hdrSpans[s];
        var hcb = sp.querySelector('.bulkEditHeaderCbox');
        if (!hcb) continue;
        if (anyChecked) {
          sp.classList.add('bulkEditTh');
          sp.style.display = 'inline-flex';
        } else {
          sp.classList.remove('bulkEditTh');
          sp.style.display = '';
        }
      }
    }
  }

  // Bulk-operation flag — suppresses per-checkbox change handler during
  // select-all / group-select to avoid N×handler calls.
  var _bulkOp = false;

  // When a bulk op affects more than this many rows, dispatch the
  // per-row change events in chunks via requestAnimationFrame so the
  // page stays responsive. Set deliberately low — KTL's own change
  // handlers do O(N) DOM work per event, so even a 30-row group can
  // produce multi-second INP if dispatched synchronously.
  var BULK_SYNC_THRESHOLD = 4;
  var BULK_CHUNK_SIZE     = 8;

  // Fire 'change' on each target checkbox (so KTL's internal bulk-edit
  // state updates). `_bulkOp` stays true for the entire run so our own
  // delegated change handlers skip — otherwise each dispatch re-runs
  // findCheckboxes() over the whole view, giving O(N²) DOM work that
  // locks the page on large views (view_3450 with ~180 rows).
  function dispatchChangeEvents(targets, onDone) {
    function done() {
      _bulkOp = false;
      if (onDone) onDone();
    }
    if (targets.length <= BULK_SYNC_THRESHOLD) {
      for (var i = 0; i < targets.length; i++) {
        targets[i].dispatchEvent(new Event('change', { bubbles: true }));
      }
      done();
      return;
    }
    var idx = 0;
    document.body.style.cursor = 'progress';
    function pump() {
      var end = Math.min(idx + BULK_CHUNK_SIZE, targets.length);
      for (; idx < end; idx++) {
        targets[idx].dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (idx < targets.length) {
        requestAnimationFrame(pump);
      } else {
        document.body.style.cursor = '';
        done();
      }
    }
    requestAnimationFrame(pump);
  }

  // ───────────────────────────────────────────────
  //  1) Wire native <thead> master selector
  // ───────────────────────────────────────────────

  function enhanceViews() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion__header');

    for (var i = 0; i < accordions.length; i++) {
      var header = accordions[i];
      var viewKey = header.getAttribute('data-view-key');
      if (!viewKey) continue;

      var viewEl = document.getElementById(viewKey);
      if (!viewEl) continue;
      if (viewEl.getAttribute(HEADER_ATTR) === '1') continue;

      var hasCheckboxes = findCheckboxes(viewEl).length > 0;
      if (!hasCheckboxes) continue;

      var nativeMaster = viewEl.querySelector('thead input.masterSelector');
      if (!nativeMaster) continue;

      viewEl.setAttribute(HEADER_ATTR, '1');

      // Override native master click with fast bulk-set.
      // e.stopImmediatePropagation() prevents KTL's slow per-row handler.
      // Heavy work (syncKtlBulkState + KTL change events) is deferred
      // to the next frame so the click finishes painting first — that's
      // what bounds INP. The .checked = … assignment is the only thing
      // the user actually needs to see paint synchronously.
      (function (master, vKey) {
        $(master).off('click.scwSaMaster').on('click.scwSaMaster', function (e) {
          e.stopImmediatePropagation();
          var el = document.getElementById(vKey);
          if (!el) return;
          // Only act on rows that have at least one editable cell —
          // entirely read-only rows are skipped (their checkbox stays
          // in whatever state it was, which is "unchecked" by default).
          var cbs = selectableCheckboxes(el);
          if (!cbs.length) return;

          _bulkOp = true;
          var shouldCheck = master.checked;
          for (var k = 0; k < cbs.length; k++) {
            cbs[k].checked = shouldCheck;
          }
          master.indeterminate = false;

          requestAnimationFrame(function () {
            syncKtlBulkState(el);
            // Notify KTL — chunked above the threshold so the page stays
            // responsive on large views. `_bulkOp` is cleared inside
            // dispatchChangeEvents when the last chunk finishes.
            dispatchChangeEvents(cbs);
          });
        });

        // Sync master state + header checkbox visibility on any row checkbox change
        $(viewEl).off('change.scwSaHeader').on('change.scwSaHeader', 'input[type="checkbox"]', function () {
          if (_bulkOp) return;
          var el = document.getElementById(vKey);
          if (!el) return;
          // Sync against the SELECTABLE set so the master shows
          // "all checked" once every editable row is checked, even if
          // some read-only rows are unchecked (they always will be).
          syncCheckbox(master, selectableCheckboxes(el));
          var any = el.querySelectorAll(CB_SELECTOR + ':checked').length > 0;
          syncHeaderCboxVisibility(el, any);
        });

        syncCheckbox(master, selectableCheckboxes(viewEl));
      })(nativeMaster, viewKey);
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
      var hasSelectable = false;
      for (var r = 0; r < rows.length; r++) {
        if (rowIsEditable(rows[r]) && rows[r].querySelector(CB_SELECTOR)) {
          hasSelectable = true;
          break;
        }
      }
      // Don't inject the group checkbox if the group has no editable rows —
      // clicking it would be a no-op.
      if (!hasSelectable) continue;

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
      var inner = td.querySelector('.scw-group-inner');
      var target = inner || td;
      target.insertBefore(checkWrap, target.firstChild);

      // Collect editable-row checkboxes inside this group. Used by
      // both the click handler (to act on) and the change-sync handler
      // (so the group master reflects "all editable rows checked").
      function collectGroupSelectable(headerRow) {
        var groupRows = rowsInGroup(headerRow);
        var targets = [];
        for (var g = 0; g < groupRows.length; g++) {
          if (!rowIsEditable(groupRows[g])) continue;
          var cbs = groupRows[g].querySelectorAll(CB_SELECTOR);
          for (var c = 0; c < cbs.length; c++) targets.push(cbs[c]);
        }
        return targets;
      }

      (function (checkbox, headerRow) {
        checkbox.addEventListener('click', function (e) {
          e.stopPropagation();
          e.stopImmediatePropagation();

          var targets = collectGroupSelectable(headerRow);
          if (!targets.length) return;

          _bulkOp = true;
          var shouldCheck = checkbox.checked;
          for (var k = 0; k < targets.length; k++) {
            targets[k].checked = shouldCheck;
          }
          checkbox.indeterminate = false;

          // Defer everything else past the next paint. The synchronous
          // .checked = … assignment above gives the user immediate
          // visual feedback; syncKtlBulkState + KTL change-event
          // dispatch are O(N × tds) and were responsible for the
          // multi-second INP measured on MDF groups.
          requestAnimationFrame(function () {
            var vEl = headerRow.closest('[id^="view_"]');
            if (vEl) {
              syncKtlBulkState(vEl);
              var nativeMaster = vEl.querySelector('thead input.masterSelector');
              if (nativeMaster) syncCheckbox(nativeMaster, selectableCheckboxes(vEl));
            }
            // Notify KTL — chunked above threshold so large groups don't
            // lock the page. `_bulkOp` is cleared when the last chunk fires.
            dispatchChangeEvents(targets);
          });
        });

        var parentTable = headerRow.closest('table');
        if (parentTable) {
          $(parentTable).off('change.scwSaGrp' + i).on('change.scwSaGrp' + i, 'input[type="checkbox"]', function () {
            if (_bulkOp) return;
            syncCheckbox(checkbox, collectGroupSelectable(headerRow));
          });
        }
      })(cb, tr);

      syncCheckbox(cb, collectGroupSelectable(tr));
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

  // 1. Worksheet views — event-driven, no blind timer
  document.addEventListener('scw-worksheet-ready', function () {
    requestAnimationFrame(enhance);
  });

  // 2. Post-inline-edit — event-driven, replaces 1200ms blind timer
  document.addEventListener('scw-post-edit-ready', function () {
    requestAnimationFrame(enhance);
  });

  // 3. Non-worksheet views — short debounce after view render
  var _viewRenderTimer = null;
  $(document)
    .off('knack-view-render.any.scwSelectAll')
    .on('knack-view-render.any.scwSelectAll', function () {
      if (_viewRenderTimer) clearTimeout(_viewRenderTimer);
      _viewRenderTimer = setTimeout(function () {
        _viewRenderTimer = null;
        enhance();
      }, 100);
    });
})();
/*** END SELECT-ALL CHECKBOXES ***/
