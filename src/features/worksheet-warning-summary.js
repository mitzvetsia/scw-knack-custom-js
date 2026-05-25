/*** FEATURE: Worksheet Warning Summary (view level) **************************
 *
 * Consolidated, view-level rollup of every per-record warning chit on a
 * device worksheet. Companion to the MDF/IDF group-header rollup in
 * group-collapse.js (ensureBadges): that summarises issues per L1 group,
 * this summarises the whole view in one pill above the grid.
 *
 * It counts a worksheet row (tr.scw-ws-row) as "flagged" when it shows
 * ANY warning indicator:
 *   - .scw-cr-hdr-warning  — the shared warn-slot chit used by
 *     connected-records.js (accessory mismatch), missing-connection-warn.js
 *     (no Connected To) and connected-device-bid-check.js (cross-bid). Any
 *     future validator that drops a chit in the warn slot is counted for
 *     free — no change needed here.
 *   - .scw-ws-warn-chit--active — the field_2454 warning-count chit
 *     (device-worksheet.js), present only when its count is > 0.
 *
 * Mount: registers a SCW.toolbar slot so the pill rides in the worksheet
 * command bar (.kn-records-nav) on EVERY device worksheet — matchers.
 * deviceWorksheet is true for any view with tr.scw-ws-row. The toolbar
 * coordinator re-runs mount() on render, on accordion mutations, and on a
 * 2s heartbeat, so the count self-heals as validators add/remove chits,
 * filters change, or rows are edited. The pill hides itself at zero.
 ******************************************************************************/
(function () {
  'use strict';

  if (!window.SCW || !SCW.toolbar) return;

  var HOST_CLS = 'scw-ws-issue-summary';
  var STYLE_ID = 'scw-ws-issue-summary-css';

  // Amber warning triangle — matches the palette used by every per-record
  // warning chit (#b45309). Red is reserved for errors/destructive.
  var WARNING_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 ' +
    '1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.' + HOST_CLS + ' {',
      '  order: 0;', /* leftmost in the toolbar flex row */
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 5px;',
      '  padding: 3px 10px;',
      '  border-radius: 12px;',
      '  background: rgba(245,158,11,0.14);',
      '  color: #b45309;',
      '  border: 1px solid rgba(245,158,11,0.35);',
      '  font: 700 12px/1.4 system-ui,-apple-system,sans-serif;',
      '  white-space: nowrap;',
      '}',
      '.' + HOST_CLS + ' svg { flex-shrink: 0; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // Count flagged worksheet rows across the whole view. Counts every
  // tr.scw-ws-row regardless of collapse/filter visibility so the pill
  // reflects total outstanding issues in the dataset, not just what's
  // currently on screen.
  function countIssues(viewEl) {
    var rows = viewEl.querySelectorAll('tr.scw-ws-row');
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].querySelector('.scw-cr-hdr-warning') ||
          rows[i].querySelector('.scw-ws-warn-chit--active')) {
        n++;
      }
    }
    return n;
  }

  SCW.toolbar.register({
    id:        'ws-issue-summary',
    slot:      SCW.toolbar.SLOTS.sort, // informational; order set via CSS
    viewMatch: SCW.toolbar.matchers.deviceWorksheet,
    mount: function (viewEl, nav) {
      injectStyles();

      var n = countIssues(viewEl);
      var host = nav.querySelector('.' + HOST_CLS);

      if (n === 0) {
        if (host) host.parentNode.removeChild(host);
        return;
      }

      if (!host) {
        host = document.createElement('span');
        host.className = HOST_CLS;
        nav.appendChild(host); // visual order is CSS-controlled
      }

      // Skip the DOM write when nothing changed (mount runs every 2s).
      if (host.getAttribute('data-count') === String(n)) return;

      var noun = n === 1 ? 'issue' : 'issues';
      host.setAttribute('data-count', n);
      host.title = n + ' line item' + (n === 1 ? '' : 's') +
        ' with a warning in this view';
      host.innerHTML = WARNING_SVG + '<span>' + n + ' ' + noun + '</span>';
    }
  });
})();
/*** END FEATURE: Worksheet Warning Summary ***********************************/
