/*** CO PROPOSAL — REMOVAL SUB-SECTIONS (view_3341, scene_1096) ************
 *
 * On a CHANGE ORDER's proposal preview, line items with CO Action
 * (field_2965) = Remove are credits — the viewer must instantly read
 * "this is being REMOVED", not mistake them for adds with odd pricing.
 *
 * Treatment — a SUB-SECTION inside each existing group (rows never leave
 * their MDF/bucket grouping, so proposal-grid.js's L1/L2/project totals
 * keep netting the credits):
 *   - within each group's row run, Remove rows are gathered at the END,
 *     beneath a full-width "Removed from install scope — credit" divider
 *     row (they land just above the group's subtotal/total rows)
 *   - rose row tint + left accent + a "REMOVED — CREDIT" chip on each
 *     (matches the CO worksheet's remove styling)
 *   - the raw CO Action (field_2965) / Target install item (field_2966)
 *     columns are hidden — the treatment conveys them
 *   - a rose banner above the grid: "N items removed … credit −$X"
 *
 * Runs AFTER proposal-grid.js's pipeline (delayed re-passes); dividers are
 * torn down and re-placed on every pass so proposal-grid re-sorts can't
 * strand them. The published proposal HTML/PDF inherits everything:
 * buildPublishPayload scrapes the live scene INCLUDING injected <style>s.
 *
 * Fails safe: no field_2965 column, or no Remove rows (every base-scope
 * proposal), and nothing changes.
 ***************************************************************************/
(function () {
  'use strict';

  var VIEWS      = ['view_3341'];
  var STYLE_ID   = 'scw-co-prop-remove-css';
  var EVENT_NS   = '.scwCoPropRemove';
  var ROW_CLS    = 'scw-co-prop-remove-row';
  var CHIP_CLS   = 'scw-co-prop-remove-chip';
  var DIVIDER_CLS = 'scw-co-prop-remove-divider';
  var BANNER_CLS = 'scw-co-prop-remove-banner';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Hide the raw CO columns (header + cells) — the row treatment
      // carries the meaning.
      VIEWS.map(function (v) {
        return '#' + v + ' .field_2965, #' + v + ' .field_2966';
      }).join(', ') + ' { display: none !important; }',
      // Sub-section divider row inside a group.
      'tr.' + DIVIDER_CLS + ' td { background: #ffe4e6 !important;',
      '  box-shadow: inset 4px 0 0 #e11d48; padding: 4px 10px !important;',
      '  font: 700 10px/1.6 system-ui, -apple-system, sans-serif;',
      '  letter-spacing: .07em; text-transform: uppercase; color: #9f1239;',
      '  border-top: 1px solid #fecdd3; }',
      // Removal rows — rose tint + left accent (CO worksheet language).
      'tr.' + ROW_CLS + ' td { background: #fff1f2 !important; }',
      'tr.' + ROW_CLS + ' td:first-child { box-shadow: inset 4px 0 0 #e11d48; }',
      // Chip stacked above the first cell\'s content so labels stay readable.
      '.' + CHIP_CLS + ' { display: block; width: max-content; margin: 0 0 3px;',
      '  padding: 1px 7px; border-radius: 3px; background: #ffe4e6;',
      '  color: #9f1239; font: 700 9.5px/1.5 system-ui, -apple-system, sans-serif;',
      '  letter-spacing: .06em; white-space: nowrap; }',
      // Banner above the grid.
      '.' + BANNER_CLS + ' { display: flex; align-items: center; gap: 8px;',
      '  margin: 0 0 10px; padding: 9px 14px; border: 1px solid #fecdd3;',
      '  border-radius: 8px; background: #fff1f2; box-shadow: inset 4px 0 0 #e11d48;',
      '  font: 600 12.5px/1.4 system-ui, -apple-system, sans-serif; color: #9f1239; }',
      '.' + BANNER_CLS + ' b { font-weight: 800; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function cellText(tr, fieldKey) {
    var td = tr.querySelector('td.' + fieldKey);
    return td ? (td.textContent || '').replace(/ /g, ' ').trim() : '';
  }

  // Data row = carries the CO Action cell (group headers, proposal-grid's
  // subtotal/footer rows, and our own divider don't).
  function isDataRow(tr) { return !!tr.querySelector('td.field_2965'); }
  function isRemoveRow(tr) { return /remove/i.test(cellText(tr, 'field_2965')); }

  function moneyNum(s) {
    var n = parseFloat(String(s == null ? '' : s).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function fmtMoney(n) {
    var s = '$' + Math.abs(n).toLocaleString('en-US',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '−' : '') + s;
  }

  function buildDivider(colspan) {
    var tr = document.createElement('tr');
    tr.className = DIVIDER_CLS;
    var td = document.createElement('td');
    td.colSpan = colspan || 12;
    td.textContent = 'Removed from install scope — credit';
    tr.appendChild(td);
    return tr;
  }

  function enhance(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;
    var tbody = viewEl.querySelector('table tbody');
    if (!tbody) return;
    injectCss();

    // Tear down previous dividers — every pass re-derives placement, so
    // proposal-grid re-sorts between passes can't strand them.
    var oldDividers = viewEl.querySelectorAll('tr.' + DIVIDER_CLS);
    for (var od = 0; od < oldDividers.length; od++) oldDividers[od].remove();

    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    var removed = 0, credit = 0;

    // Tag/untag rows + tally the credit.
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (!isDataRow(tr)) continue;
      if (isRemoveRow(tr)) {
        removed++;
        credit += moneyNum(cellText(tr, 'field_2028')) +
                  moneyNum(cellText(tr, 'field_2269'));
        if (!tr.classList.contains(ROW_CLS)) {
          tr.classList.add(ROW_CLS);
          var firstTd = tr.querySelector('td');
          if (firstTd && !firstTd.querySelector('.' + CHIP_CLS)) {
            var chip = document.createElement('span');
            chip.className = CHIP_CLS;
            chip.textContent = 'REMOVED — CREDIT';
            firstTd.insertBefore(chip, firstTd.firstChild);
          }
        }
      } else if (tr.classList.contains(ROW_CLS)) {
        // Re-render recycled a previously-tagged <tr> — untag.
        tr.classList.remove(ROW_CLS);
        var staleChip = tr.querySelector('.' + CHIP_CLS);
        if (staleChip) staleChip.remove();
      }
    }

    // Regroup: within each contiguous run of data rows (a group's rows,
    // bounded by group headers / subtotal rows), move Remove rows to the
    // END of the run beneath a divider — still INSIDE the group, just
    // above its totals.
    var run = [];
    function flushRun(boundary) {
      if (run.length) {
        var removes = [];
        for (var r = 0; r < run.length; r++) {
          if (run[r].classList.contains(ROW_CLS)) removes.push(run[r]);
        }
        if (removes.length) {
          var colspan = run[0].querySelectorAll('td').length || 12;
          var divider = buildDivider(colspan);
          // Insert the sub-section right before the row that ended the
          // run (subtotal/next group header), or at the end of the tbody.
          tbody.insertBefore(divider, boundary || null);
          for (var mv = 0; mv < removes.length; mv++) {
            tbody.insertBefore(removes[mv], boundary || null);
          }
        }
      }
      run = [];
    }
    for (var j = 0; j < rows.length; j++) {
      if (isDataRow(rows[j])) run.push(rows[j]);
      else flushRun(rows[j]);
    }
    flushRun(null);

    // Banner — only when removals exist; refreshed each pass.
    var banner = viewEl.querySelector('.' + BANNER_CLS);
    if (!removed) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.className = BANNER_CLS;
      var table = viewEl.querySelector('table');
      var anchor = table ? table.parentNode : viewEl;
      anchor.insertBefore(banner, table || anchor.firstChild);
    }
    banner.innerHTML =
      'This change order <b>removes ' + removed + ' item' +
      (removed === 1 ? '' : 's') + '</b> from the install scope' +
      (credit ? ' — credit <b>' + fmtMoney(credit) + '</b>' : '') +
      '. Removed items are grouped in red within their sections.';
  }

  function soon(viewId) {
    // After proposal-grid.js's pipeline pass on the same render event.
    setTimeout(function () { enhance(viewId); }, 150);
    setTimeout(function () { enhance(viewId); }, 700);
  }

  VIEWS.forEach(function (viewId) {
    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(viewId, function () { soon(viewId); }, EVENT_NS);
    }
    $(document).off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () { soon(viewId); });
    $(document).off('knack-records-render.' + viewId + EVENT_NS)
      .on('knack-records-render.' + viewId + EVENT_NS, function () { soon(viewId); });
  });
})();
/*** END: CO proposal removal sub-sections *********************************/
