/*** SELECT-ALL CHECKBOXES — view accordion + group header buttons ***/
(function () {
  'use strict';

  var STYLE_ID = 'scw-select-all-css';
  var ENHANCED_ACCORDION = 'data-scw-select-all';
  var ENHANCED_GROUP = 'data-scw-select-all-grp';

  // ── SVG icon (checkbox with checkmark) ──
  var CHECK_ALL_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="9 11 12 14 22 4"/>' +
    '<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' +
    '</svg>';

  // ───────────────────────────────────────────────
  //  CSS
  // ───────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      /* ── Shared button style ── */
      '.scw-select-all-btn {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 4px;',
      '  padding: 3px 10px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  line-height: 1.4;',
      '  border-radius: 10px;',
      '  border: 1px solid rgba(0,0,0,.15);',
      '  background: rgba(255,255,255,.85);',
      '  color: #475569;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  white-space: nowrap;',
      '  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;',
      '  flex-shrink: 0;',
      '}',
      '.scw-select-all-btn:hover {',
      '  background: rgba(255,255,255,1);',
      '  border-color: rgba(0,0,0,.25);',
      '  color: #1e293b;',
      '}',
      '.scw-select-all-btn svg {',
      '  flex-shrink: 0;',
      '}',

      /* ── Active state (all selected) ── */
      '.scw-select-all-btn.is-all-selected {',
      '  background: rgba(34,197,94,.12);',
      '  border-color: rgba(34,197,94,.35);',
      '  color: #16a34a;',
      '}',
      '.scw-select-all-btn.is-all-selected:hover {',
      '  background: rgba(34,197,94,.18);',
      '}',

      /* ── Accordion header placement ── */
      '.scw-ktl-accordion__header .scw-select-all-btn {',
      '  margin-right: 6px;',
      '}',

      /* ── Group header placement ── */
      '.scw-group-badges .scw-select-all-btn {',
      '  margin-right: 2px;',
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

  /** Find all bulk-edit checkbox inputs within a container element. */
  function findCheckboxes(container) {
    return container.querySelectorAll('.kn-table-bulk-checkbox input[type="checkbox"]');
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
        // Deselect all
        if (checkboxes[j].checked) checkboxes[j].click();
      } else {
        // Select all unchecked
        if (!checkboxes[j].checked) checkboxes[j].click();
      }
    }

    return !allChecked; // new state: true = now all selected
  }

  /** Update button visual state based on checkbox status. */
  function syncButtonState(btn, checkboxes) {
    if (!checkboxes.length) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    var allChecked = true;
    for (var i = 0; i < checkboxes.length; i++) {
      if (!checkboxes[i].checked) { allChecked = false; break; }
    }
    btn.classList.toggle('is-all-selected', allChecked);
    btn.textContent = '';
    btn.innerHTML = CHECK_ALL_SVG + (allChecked ? ' Deselect' : ' Select All');
  }

  // ───────────────────────────────────────────────
  //  1) KTL Accordion — view-level "Select All"
  // ───────────────────────────────────────────────

  function enhanceAccordions() {
    var headers = document.querySelectorAll('.scw-ktl-accordion__header');

    for (var i = 0; i < headers.length; i++) {
      var header = headers[i];
      if (header.getAttribute(ENHANCED_ACCORDION) === '1') continue;

      var viewKey = header.getAttribute('data-view-key');
      if (!viewKey) continue;

      var viewEl = document.getElementById(viewKey);
      if (!viewEl) continue;

      // Only add if this view has bulk checkboxes
      var checkboxes = findCheckboxes(viewEl);
      if (!checkboxes.length) continue;

      header.setAttribute(ENHANCED_ACCORDION, '1');

      var btn = document.createElement('button');
      btn.className = 'scw-select-all-btn';
      btn.type = 'button';
      btn.setAttribute('data-scw-sa-view', viewKey);
      btn.innerHTML = CHECK_ALL_SVG + ' Select All';

      // Insert before the chevron
      var chevron = header.querySelector('.scw-acc-chevron');
      if (chevron) {
        header.insertBefore(btn, chevron);
      } else {
        header.appendChild(btn);
      }

      // Click handler
      (function (button, vKey) {
        button.addEventListener('click', function (e) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();

          var el = document.getElementById(vKey);
          if (!el) return;
          var cbs = findCheckboxes(el);
          var nowSelected = toggleAll(cbs);
          button.classList.toggle('is-all-selected', nowSelected);
          button.innerHTML = CHECK_ALL_SVG + (nowSelected ? ' Deselect' : ' Select All');
        });
      })(btn, viewKey);

      syncButtonState(btn, checkboxes);
    }
  }

  // ───────────────────────────────────────────────
  //  2) Group-collapse — group-level "Select All"
  // ───────────────────────────────────────────────

  /** Find all data rows (non-group, non-totals) between this group header
   *  and the next group header of the same or higher level. */
  function rowsInGroup(headerTr) {
    var isL2 = headerTr.classList.contains('kn-group-level-2');
    var rows = [];
    var next = headerTr.nextElementSibling;

    while (next) {
      if (next.classList.contains('kn-table-group')) {
        if (isL2) break; // L2: stop at any group row
        if (next.classList.contains('kn-group-level-1')) break; // L1: stop at next L1
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
    var groupHeaders = document.querySelectorAll(
      'tr.kn-table-group.scw-group-header'
    );

    for (var i = 0; i < groupHeaders.length; i++) {
      var tr = groupHeaders[i];
      if (tr.getAttribute(ENHANCED_GROUP) === '1') continue;

      // Check if any rows in this group have bulk checkboxes
      var rows = rowsInGroup(tr);
      var hasCheckboxes = false;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].querySelector('.kn-table-bulk-checkbox input[type="checkbox"]')) {
          hasCheckboxes = true;
          break;
        }
      }
      if (!hasCheckboxes) continue;

      tr.setAttribute(ENHANCED_GROUP, '1');

      var btn = document.createElement('button');
      btn.className = 'scw-select-all-btn';
      btn.type = 'button';
      btn.innerHTML = CHECK_ALL_SVG + ' Select All';

      // Place inside .scw-group-badges if it exists, otherwise append to first td
      var badges = tr.querySelector('.scw-group-badges');
      if (badges) {
        badges.insertBefore(btn, badges.firstChild);
      } else {
        var td = tr.querySelector('td');
        if (!td) continue;
        // Create a badges wrapper for consistency
        var wrapper = document.createElement('span');
        wrapper.className = 'scw-group-badges';
        wrapper.appendChild(btn);
        td.appendChild(wrapper);
      }

      // Click handler — must stop propagation so group collapse doesn't toggle
      (function (button, headerRow) {
        button.addEventListener('click', function (e) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();

          var groupRows = rowsInGroup(headerRow);
          var checkboxes = [];
          for (var g = 0; g < groupRows.length; g++) {
            var cbs = groupRows[g].querySelectorAll(
              '.kn-table-bulk-checkbox input[type="checkbox"]'
            );
            for (var c = 0; c < cbs.length; c++) checkboxes.push(cbs[c]);
          }
          if (!checkboxes.length) return;

          var nowSelected = toggleAll(checkboxes);
          button.classList.toggle('is-all-selected', nowSelected);
          button.innerHTML = CHECK_ALL_SVG + (nowSelected ? ' Deselect' : ' Select All');
        });
      })(btn, tr);
    }
  }

  // ───────────────────────────────────────────────
  //  Lifecycle
  // ───────────────────────────────────────────────
  injectCss();

  function enhance() {
    enhanceAccordions();
    enhanceGroupHeaders();
  }

  // Run after KTL accordion and group-collapse have finished
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

  // MutationObserver fallback
  var raf = 0;
  var obs = new MutationObserver(function () {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      raf = 0;
      enhance();
    });
  });
  obs.observe(document.body, { childList: true, subtree: true });

  $(document).ready(function () {
    setTimeout(enhance, 500);
  });
})();
/*** END SELECT-ALL CHECKBOXES ***/
