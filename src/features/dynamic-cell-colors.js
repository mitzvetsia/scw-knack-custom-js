/*************************** DYNAMIC CELL COLORS – EMPTY / ZERO FIELD HIGHLIGHTING *******************************/
(function () {
  'use strict';

  const EVENT_NS = '.scwDynCellColors';

  // ===========================================================
  // PALETTE
  // ===========================================================
  const COLORS = {
    good:    '#d4edda', // pale green
    bad:     '#f8d7da', // pale red
    danger:  '#f8d7da', // alias for bad – pale red
    warning: '#fff3cd'  // pale yellow
  };

  const COLOR_CLASSES = {
    good:    'scw-cell-good',
    bad:     'scw-cell-bad',
    danger:  'scw-cell-danger',
    warning: 'scw-cell-warning'
  };

  const ALL_COLOR_CLASSES = Object.values(COLOR_CLASSES).join(' ');

  // ===========================================================
  // VIEW / FIELD CONFIG
  // Each view entry contains an array of rules.
  //   fieldKey         – the Knack field id to COLOR (matched via data-field-key)
  //   when             – "empty" | "zero" (what triggers the color)
  //   color            – key from COLORS (or a raw CSS color string)
  //   triggerFieldKey  – (optional) check the condition on THIS field instead
  //                      of fieldKey.  Useful for cross-field rules such as
  //                      "when Fee is $0 → color Sub Bid as danger".
  // ===========================================================
  const VIEWS = [
    {
      viewId: 'view_3505',
      rules: [
        { fieldKey: 'field_2400', when: 'empty', color: 'danger'  },
        { fieldKey: 'field_2400', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_2415', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2399', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_771', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2409', when: 'empty', color: 'danger' }
      ]
    },
    {
      viewId: 'view_3512',
      rules: [
        { fieldKey: 'field_2400', when: 'empty', color: 'danger'  },
        { fieldKey: 'field_2400', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_2415', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2399', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_771', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2409', when: 'empty', color: 'danger' }
      ]
    },
    {
      viewId: 'view_3517',
      rules: [
        { fieldKey: 'field_2400', when: 'empty', color: 'danger'  },
        { fieldKey: 'field_2400', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_2415', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2399', when: 'zero',  color: 'warning' }
      ]
    },
    {
      viewId: 'view_3313',
      rules: [
        // SOW empty → warning on SOW cell
        { fieldKey: 'field_2154', when: 'empty', color: 'warning' },
        // Fee ($0 / empty) → danger on Sub Bid, +Hrs, +Mat
        { fieldKey: 'field_2150', triggerFieldKey: 'field_2028', when: 'empty', color: 'danger' },
        { fieldKey: 'field_2150', triggerFieldKey: 'field_2028', when: 'zero',  color: 'danger' },
        { fieldKey: 'field_1973', triggerFieldKey: 'field_2028', when: 'empty', color: 'danger' },
        { fieldKey: 'field_1973', triggerFieldKey: 'field_2028', when: 'zero',  color: 'danger' },
        { fieldKey: 'field_1974', triggerFieldKey: 'field_2028', when: 'empty', color: 'danger' },
        { fieldKey: 'field_1974', triggerFieldKey: 'field_2028', when: 'zero',  color: 'danger' }
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
  // INJECT STYLES (so color classes win over worksheet !important)
  // ============================================================
  (function injectColorStyles() {
    if (document.getElementById('scw-dyn-cell-color-css')) return;
    var style = document.createElement('style');
    style.id = 'scw-dyn-cell-color-css';
    // Selectors use tr.scw-ws-row .scw-ws-card td (0,3,2) to beat
    // the worksheet's tr.scw-ws-row .scw-ws-card td (0,2,1) even
    // when the worksheet stylesheet appears later in the DOM.
    style.textContent =
      'tr.scw-ws-row .scw-ws-card td.scw-cell-good,    tr td.scw-cell-good    { background-color: ' + COLORS.good    + ' !important; }\n' +
      'tr.scw-ws-row .scw-ws-card td.scw-cell-bad,     tr td.scw-cell-bad     { background-color: ' + COLORS.bad     + ' !important; }\n' +
      'tr.scw-ws-row .scw-ws-card td.scw-cell-danger,  tr td.scw-cell-danger  { background-color: ' + COLORS.danger  + ' !important; }\n' +
      'tr.scw-ws-row .scw-ws-card td.scw-cell-warning, tr td.scw-cell-warning { background-color: ' + COLORS.warning + ' !important; }\n' +
      '';
    document.head.appendChild(style);
  })();

  // ============================================================
  // CORE
  // ============================================================

  /** Collect the unique set of target fieldKeys for a rule list. */
  function targetFieldKeys(rules) {
    var seen = {};
    rules.forEach(function (r) { seen[r.fieldKey] = true; });
    return Object.keys(seen);
  }

  function applyColorsForView(viewCfg) {
    var viewId = viewCfg.viewId;
    var rules  = viewCfg.rules;
    var $view  = $('#' + viewId);
    if (!$view.length) return;

    var $rows = $view.find('table.kn-table-table tbody tr');
    if (!$rows.length) return;

    var targets = targetFieldKeys(rules);

    $rows.each(function () {
      var $tr = $(this);

      // Skip group / header rows
      if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

      // Clear previous dynamic colors on all target cells so that
      // cross-field rules (triggerFieldKey) are properly removed when
      // the trigger condition no longer holds.
      targets.forEach(function (fk) {
        var $td = $tr.find('td[data-field-key="' + fk + '"]');
        if ($td.length) {
          $td.removeClass(ALL_COLOR_CLASSES);
          $td.css('background-color', '');
          // Clear direct-edit input bg too
          $td.find('.scw-ws-direct-input, .scw-ws-direct-textarea').css('background-color', '');
        }
      });

      // Apply matching rules (last match for a given cell wins)
      rules.forEach(function (rule) {
        var $td = $tr.find('td[data-field-key="' + rule.fieldKey + '"]');
        if (!$td.length) return;

        // Determine which cell to test the condition against
        var $check = rule.triggerFieldKey
          ? $tr.find('td[data-field-key="' + rule.triggerFieldKey + '"]')
          : $td;
        if (!$check.length) return;

        if (matchesCondition($check, rule.when)) {
          $td.removeClass(ALL_COLOR_CLASSES);
          var cls = COLOR_CLASSES[rule.color];
          if (cls) $td.addClass(cls);
          var color = resolveColor(rule.color);
          $td.css('background-color', color);
          // Propagate to direct-edit inputs so they don't mask the td color
          $td.find('.scw-ws-direct-input, .scw-ws-direct-textarea').css('background-color', color);
        }
      });
    });
  }

  // Re-apply after KTL / Knack tbody mutations (debounced)
  function installObserver(viewCfg) {
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;
    if ($view.data('scwDynColorsObs')) return;
    $view.data('scwDynColorsObs', true);

    var el = $view.find('table.kn-table-table tbody').get(0);
    if (!el) return;

    var debounceTimer = 0;
    var obs = new MutationObserver(function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        debounceTimer = 0;
        applyColorsForView(viewCfg);
      }, 150);
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
        applyColorsForView(viewCfg);
        installObserver(viewCfg);
      });
  });
})();
/***************************** DYNAMIC CELL COLORS – EMPTY / ZERO FIELD HIGHLIGHTING *******************************/
