/*************************** REVENUE TIER PROGRESS BAR *******************************/
(function () {
  'use strict';

  var EVENT_NS = '.scwRevTierProgress';
  var STYLE_ID = 'scw-revenue-tier-progress-css';
  var VIEW_IDS = ['view_352', 'view_256', 'view_325', 'view_383'];

  /* ── field keys ─────────────────────────────────────── */
  var FIELD_FLOOR    = 'field_324';   // Floor
  var FIELD_UPPER    = 'field_325';   // Upper Limit
  var FIELD_REVENUE  = 'field_415';   // Total Revenue from Schedule
  var FIELD_NEEDED   = 'field_417';   // Amount needed to unlock tier
  var FIELD_GRP_SORT = 'field_419';   // Group sort     (desc – highest first)
  var FIELD_ROW_SORT = 'field_323';   // Row sort       (asc  – lowest first / Sequence)

  /* ── colors ─────────────────────────────────────────── */
  var COLOR_GREEN = '#d4edda';  // pale green – at/above upper

  /* ── helpers ────────────────────────────────────────── */
  function parseCurrency(text) {
    if (!text) return NaN;
    var cleaned = text.replace(/[^0-9.\-]/g, '');
    return cleaned === '' ? NaN : parseFloat(cleaned);
  }

  function cellText($td) {
    return ($td.find('span').first().text() || $td.text()).trim();
  }

  /* ── inject CSS once ────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '/* Revenue-tier progress bar fill */',
      '.scw-rev-tier-cell {',
      '  position: relative;',
      '  overflow: hidden;',
      '}',
      '.scw-rev-tier-fill {',
      '  position: absolute;',
      '  top: 0; left: 0; bottom: 0;',
      '  pointer-events: none;',
      '  transition: width .3s ease;',
      '}',
      'tr:not(.kn-table-group) > .scw-rev-tier-cell > span {',
      '  position: relative;',
      '  z-index: 1;',
      '}',
      '.scw-rev-tier-label {',
      '  position: relative;',
      '  z-index: 1;',
      '  font-weight: 600;',
      '  font-size: 12px;',
      '  white-space: nowrap;',
      '}',
      '.scw-rev-tier-label svg {',
      '  vertical-align: -2px;',
      '  margin-right: 3px;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  var CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  /* ── helpers: column count for colspan fix ──────────── */
  function getColCount($table) {
    var hCells = $table.find('thead th');
    var n = 0;
    hCells.each(function () {
      n += parseInt($(this).attr('colspan') || '1', 10);
    });
    return n || hCells.length || 1;
  }

  /* ── sort groups + rows within groups ───────────────── */
  function sortGroupRows($table) {
    var $tbody = $table.find('tbody');
    var groups = [];
    var currentGroup = null;

    /* Collect groups and their data rows */
    $tbody.children('tr').each(function () {
      var $row = $(this);
      if ($row.hasClass('kn-table-group')) {
        currentGroup = { header: $row, rows: [] };
        groups.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.rows.push($row);
      }
    });

    if (groups.length === 0) return;

    /* ── 1. Sort rows WITHIN each group by field_323 (Sequence) asc ── */
    groups.forEach(function (group) {
      if (group.rows.length < 2) return;
      group.rows.sort(function (a, b) {
        var aSeq = parseCurrency(cellText(a.find('td[data-field-key="' + FIELD_ROW_SORT + '"]')));
        var bSeq = parseCurrency(cellText(b.find('td[data-field-key="' + FIELD_ROW_SORT + '"]')));
        if (isNaN(aSeq)) aSeq = Infinity;
        if (isNaN(bSeq)) bSeq = Infinity;
        return aSeq - bSeq;
      });
    });

    /* ── 2. Sort GROUPS by field_419 desc (use max value from rows) ── */
    groups.sort(function (a, b) {
      var aMax = -Infinity;
      var bMax = -Infinity;
      a.rows.forEach(function ($r) {
        var v = parseCurrency(cellText($r.find('td[data-field-key="' + FIELD_GRP_SORT + '"]')));
        if (!isNaN(v) && v > aMax) aMax = v;
      });
      b.rows.forEach(function ($r) {
        var v = parseCurrency(cellText($r.find('td[data-field-key="' + FIELD_GRP_SORT + '"]')));
        if (!isNaN(v) && v > bMax) bMax = v;
      });
      return bMax - aMax;  /* descending */
    });

    /* ── 3. Re-insert everything in sorted order ── */
    groups.forEach(function (group) {
      $tbody.append(group.header);
      group.rows.forEach(function ($row) {
        $tbody.append($row);
      });
    });
  }

  /* ── core logic ─────────────────────────────────────── */
  function applyProgress(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;

    var $table = $view.find('table.kn-table').first();
    var colCount = getColCount($table);

    /* Fix group-header colspan so accordion rows span full width */
    $table.find('tr.kn-table-group td').each(function () {
      var $cell = $(this);
      var cur = parseInt($cell.attr('colspan') || '1', 10);
      if (cur < colCount) {
        $cell.attr('colspan', colCount);
      }
    });

    /* Sort rows within each accordion group before applying progress bars */
    sortGroupRows($table);

    $table.find('tbody tr:not(.kn-table-group)').each(function () {
      var $row = $(this);
      var $floorTd   = $row.find('td[data-field-key="' + FIELD_FLOOR   + '"]');
      var $upperTd   = $row.find('td[data-field-key="' + FIELD_UPPER   + '"]');
      var $revTd     = $row.find('td[data-field-key="' + FIELD_REVENUE + '"]');
      var $neededTd  = $row.find('td[data-field-key="' + FIELD_NEEDED  + '"]');
      if (!$revTd.length) return;

      var floor   = parseCurrency(cellText($floorTd));
      var upper   = parseCurrency(cellText($upperTd));
      var revenue = parseCurrency(cellText($revTd));

      if (isNaN(revenue) || isNaN(floor)) return;

      /* Reset */
      $revTd.addClass('scw-rev-tier-cell');
      $revTd.find('.scw-rev-tier-fill').remove();
      $revTd.find('.scw-rev-tier-label').remove();
      var $span = $revTd.find('span').first();
      $span.css('display', '');
      $revTd.css('text-align', '');

      if (revenue < floor) {
        /* ── below floor → show amount needed to unlock ── */
        var neededVal = cellText($neededTd);
        $span.css('display', 'none');
        $revTd.css('text-align', 'center');
        $revTd.append('<span class="scw-rev-tier-label">' + neededVal + ' needed to unlock tier!</span>');

      } else if (isNaN(upper) || upper <= floor) {
        /* ── top tier (no upper limit) and revenue >= floor → full green ── */
        var $fill = $('<div class="scw-rev-tier-fill"></div>');
        $fill.css({ width: '100%', background: COLOR_GREEN });
        $span.css('display', 'none');
        $revTd.css('text-align', 'center');
        $revTd.prepend($fill);
        $revTd.append('<span class="scw-rev-tier-label">' + CHECK_SVG + '100% Achieved!</span>');

      } else if (revenue >= upper) {
        /* ── at or above upper limit → full green ── */
        var $fill2 = $('<div class="scw-rev-tier-fill"></div>');
        $fill2.css({ width: '100%', background: COLOR_GREEN });
        $span.css('display', 'none');
        $revTd.css('text-align', 'center');
        $revTd.prepend($fill2);
        $revTd.append('<span class="scw-rev-tier-label">' + CHECK_SVG + '100% Achieved!</span>');

      } else {
        /* ── between floor and upper → partial green ── */
        var pct = ((revenue - floor) / (upper - floor)) * 100;
        pct = Math.max(0, Math.min(100, pct));
        var $fill3 = $('<div class="scw-rev-tier-fill"></div>');
        $fill3.css({ width: pct + '%', background: COLOR_GREEN });
        $span.css('display', 'none');
        $revTd.css('text-align', 'center');
        $revTd.prepend($fill3);
        $revTd.append('<span class="scw-rev-tier-label">' + Math.round(pct) + '% Achieved</span>');
      }
    });
  }

  /* ── bind ────────────────────────────────────────────── */
  injectStyles();

  VIEW_IDS.forEach(function (viewId) {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.'  + viewId + EVENT_NS, function () {
        applyProgress(viewId);

        /* Re-apply after Knack DOM mutations (inline edits, etc.) */
        var el = document.getElementById(viewId);
        if (!el || $(el).data('scwRevTierObs')) return;

        var timer = 0;
        var obs = new MutationObserver(function () {
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () { timer = 0; applyProgress(viewId); }, 150);
        });
        obs.observe(el, { childList: true, subtree: true });
        $(el).data('scwRevTierObs', true);
      });
  });

})();
