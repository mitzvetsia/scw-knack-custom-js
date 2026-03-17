/*************************** REVENUE TIER PROGRESS BAR *******************************/
(function () {
  'use strict';

  var EVENT_NS = '.scwRevTierProgress';
  var STYLE_ID = 'scw-revenue-tier-progress-css';
  var VIEW_ID  = 'view_352';

  /* ── field keys ─────────────────────────────────────── */
  var FIELD_FLOOR    = 'field_324';   // Floor
  var FIELD_UPPER    = 'field_325';   // Upper Limit
  var FIELD_REVENUE  = 'field_415';   // Total Revenue from Schedule

  /* ── colors ─────────────────────────────────────────── */
  var COLOR_RED   = '#f8d7da';  // pale red  – below floor
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
      '.scw-rev-tier-cell span {',
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

  /* ── core logic ─────────────────────────────────────── */
  function applyProgress() {
    var $view = $('#' + VIEW_ID);
    if (!$view.length) return;

    $view.find('table.kn-table tbody tr:not(.kn-table-group)').each(function () {
      var $row = $(this);
      var $floorTd   = $row.find('td[data-field-key="' + FIELD_FLOOR   + '"]');
      var $upperTd   = $row.find('td[data-field-key="' + FIELD_UPPER   + '"]');
      var $revTd     = $row.find('td[data-field-key="' + FIELD_REVENUE + '"]');
      if (!$revTd.length) return;

      var floor   = parseCurrency(cellText($floorTd));
      var upper   = parseCurrency(cellText($upperTd));
      var revenue = parseCurrency(cellText($revTd));

      if (isNaN(revenue) || isNaN(floor)) return;

      /* Reset */
      $revTd.addClass('scw-rev-tier-cell');
      $revTd.find('.scw-rev-tier-fill').remove();
      $revTd.find('.scw-rev-tier-label').remove();

      var $fill = $('<div class="scw-rev-tier-fill"></div>');
      var $span = $revTd.find('span').first();
      var CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

      if (revenue < floor) {
        /* ── below floor → full red, hide value ── */
        $fill.css({ width: '100%', background: COLOR_RED });
        $span.css('visibility', 'hidden');

      } else if (isNaN(upper) || upper <= floor) {
        /* ── top tier (no upper limit) and revenue >= floor → full green ── */
        $fill.css({ width: '100%', background: COLOR_GREEN });
        $span.css('visibility', 'hidden');
        $revTd.append('<span class="scw-rev-tier-label">' + CHECK_SVG + '100% Achieved!</span>');

      } else if (revenue >= upper) {
        /* ── at or above upper limit → full green ── */
        $fill.css({ width: '100%', background: COLOR_GREEN });
        $span.css('visibility', 'hidden');
        $revTd.append('<span class="scw-rev-tier-label">' + CHECK_SVG + '100% Achieved!</span>');

      } else {
        /* ── between floor and upper → partial green ── */
        var pct = ((revenue - floor) / (upper - floor)) * 100;
        pct = Math.max(0, Math.min(100, pct));
        $fill.css({ width: pct + '%', background: COLOR_GREEN });
        $span.css('visibility', 'hidden');
        $revTd.append('<span class="scw-rev-tier-label">' + Math.round(pct) + '% Achieved</span>');
      }

      $revTd.prepend($fill);
    });
  }

  /* ── bind ────────────────────────────────────────────── */
  injectStyles();

  $(document)
    .off('knack-view-render.' + VIEW_ID + EVENT_NS)
    .on('knack-view-render.'  + VIEW_ID + EVENT_NS, function () {
      applyProgress();

      /* Re-apply after Knack DOM mutations (inline edits, etc.) */
      var el = document.getElementById(VIEW_ID);
      if (!el || $(el).data('scwRevTierObs')) return;

      var timer = 0;
      var obs = new MutationObserver(function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { timer = 0; applyProgress(); }, 150);
      });
      obs.observe(el, { childList: true, subtree: true });
      $(el).data('scwRevTierObs', true);
    });

})();
