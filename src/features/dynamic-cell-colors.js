/*************************** DYNAMIC CELL COLORS – EMPTY / ZERO FIELD HIGHLIGHTING *******************************/
(function () {
  'use strict';

  const EVENT_NS = '.scwDynCellColors';

  // ============================================================
  // PALETTE
  // ============================================================
  const COLORS = {
    good:    '#d4edda', // pale green
    bad:     '#f8d7da', // pale red
    warning: '#fff3cd'  // pale yellow
  };

  // ============================================================
  // VIEW / FIELD CONFIG
  // Each view entry contains an array of rules.
  //   fieldKey  – the Knack field class on <td>
  //   when      – "empty" | "zero" (what triggers the color)
  //   color     – key from COLORS (or a raw CSS color string)
  // ============================================================
  const VIEWS = [
    {
      viewId: 'view_3505',
      rules: [
        { fieldKey: 'field_2400', when: 'empty', color: 'bad'     },
        { fieldKey: 'field_2415', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2399', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_2400', when: 'empty', color: 'warning' }
      ]
    },
    {
      viewId: 'view_3512',
      rules: [
        { fieldKey: 'field_2400', when: 'empty', color: 'bad'     },
        { fieldKey: 'field_2415', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2399', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_771', when: 'empty', color: 'warning' }
      ]
    }
  ];

  // ============================================================
  // HELPERS
  // ============================================================

  /** Resolve a color key to a CSS value. */
  function resolveColor(colorKey) {
    return COLORS[colorKey] || colorKey;
  }

  /**
   * Normalize cell text by replacing non-breaking spaces and other
   * invisible / zero-width characters with regular spaces, then trim.
   */
  function normalizeText(raw) {
    return raw.replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ').trim();
  }

  /** Return true when the cell should be considered "empty". */
  function isCellEmpty($td) {
    // Connection / image fields: if real <img> elements exist the cell
    // has content regardless of surrounding text.
    if ($td.find('img').length) return false;

    var t = normalizeText($td.text());
    return t === '' || t === '-' || t === '—';
  }

  /** Return true when the cell text represents zero. */
  function isZero(text) {
    const t = normalizeText(text);
    // Handle plain "0", "$0", "$0.00", "0.00", "0.0", etc.
    return /^[\$]?0+(\.0+)?$/.test(t);
  }

  function matchesCondition($td, when) {
    if (when === 'empty') return isCellEmpty($td);
    if (when === 'zero')  return isZero($td.text());
    return false;
  }

  // ============================================================
  // CORE
  // ============================================================

  function applyColorsForView(viewCfg) {
    var viewId = viewCfg.viewId;
    var rules  = viewCfg.rules;
    var $view  = $('#' + viewId);
    if (!$view.length) return;

    var $rows = $view.find('table.kn-table-table tbody tr');
    if (!$rows.length) return;

    $rows.each(function () {
      var $tr = $(this);

      // Skip group / header rows
      if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

      rules.forEach(function (rule) {
        var $td = $tr.find('td.' + rule.fieldKey);
        if (!$td.length) return;

        if (matchesCondition($td, rule.when)) {
          $td.css('background-color', resolveColor(rule.color));
        }
      });
    });
  }

  function applyWithRetries(viewCfg, tries) {
    tries = tries || 12;
    var i = 0;
    (function tick() {
      i++;
      applyColorsForView(viewCfg);
      if (i < tries) setTimeout(tick, 250);
    })();
  }

  // Re-apply after KTL / Knack tbody mutations
  function installObserver(viewCfg) {
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;
    if ($view.data('scwDynColorsObs')) return;
    $view.data('scwDynColorsObs', true);

    var el = $view.find('table.kn-table-table tbody').get(0);
    if (!el) return;

    var obs = new MutationObserver(function () {
      applyColorsForView(viewCfg);
    });
    obs.observe(el, { childList: true, subtree: true });
  }

  // ============================================================
  // INIT
  // ============================================================
  VIEWS.forEach(function (viewCfg) {
    var viewId = viewCfg.viewId;

    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        applyWithRetries(viewCfg);
        installObserver(viewCfg);
      });
  });
})();
/***************************** DYNAMIC CELL COLORS – EMPTY / ZERO FIELD HIGHLIGHTING *******************************/
