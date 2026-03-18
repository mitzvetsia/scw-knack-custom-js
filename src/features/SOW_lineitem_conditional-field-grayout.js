/***************************** CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
/**
 * SCW / Knack: Row-based conditional cell grayout (view_3456, view_3332 — SOW)
 *
 * Per-view configs drive bucket detection, column grayout, row locks,
 * and bucket-label injection.
 *
 *  view_3456: grays ALL cells for Services/Assumptions; replaces product
 *             cell content with "SERVICE — <labor desc>" via ::after.
 *  view_3332: selective grayout; preserves product cell; prefixes
 *             "ASSUMPTION" / "SERVICE" label above product via ::before.
 *
 * Approach: capture-phase event blocker, MutationObserver, retried
 * application on render.
 */
(function () {
  'use strict';

  // ============================================================
  // SHARED BUCKET IDS
  // ============================================================
  const BUCKET_OTHER_SERVICES = '6977caa7f246edf67b52cbcd';
  const BUCKET_ASSUMPTIONS    = '697b7a023a31502ec68b3303';

  const BUCKET_LABELS = {
    [BUCKET_OTHER_SERVICES]: 'SERVICE',
    [BUCKET_ASSUMPTIONS]:    'ASSUMPTION',
  };

  // ============================================================
  // PER-VIEW CONFIGS
  // ============================================================
  const VIEW_CONFIGS = [
    {
      viewId: 'view_3456',
      detectField: 'field_2219',
      sortField: 'field_2218',
      labelTarget: 'field_1949',
      // 'replace' = gray product cell, overlay label+desc via ::after
      labelMode: 'replace',
      laborDescField: 'field_2020',
      allColumnKeys: [
        'field_1949', // PRODUCT
        'field_1957', // Connected Devices
        'field_1960', // Unit Price
        'field_2020', // INPUT_Labor Description
        'field_1953', // SCW Notes
        'field_2261', // Cust Disc %
        'field_2262', // Cust Disc $$ Each
        'field_1964', // Qty
        'field_2303', // Applied Disc
        'field_2269', // total Line Price
      ],
      rowLocks: [
        {
          detectField: 'field_2230', // FLAG_only quantity one per record
          when: 'yes',
          lockField: 'field_1964',   // Qty
        },
        {
          detectField: 'field_2231', // FLAG_map camera or reader connections
          whenNot: 'yes',
          lockField: 'field_1957',   // Connected Devices
        },
      ],
      rules: {
        [BUCKET_OTHER_SERVICES]: {
          activeFields: [],
          rowClass: 'scw-row--services',
        },
        [BUCKET_ASSUMPTIONS]: {
          activeFields: [],
          rowClass: 'scw-row--assumptions',
        },
      },
    },
    {
      viewId: 'view_3332',
      detectField: 'field_2219',
      sortField: 'field_2218',
      labelTarget: 'field_1949',
      // 'prefix' = keep product visible, show label above via ::before
      labelMode: 'prefix',
      laborDescField: null,         // no labor desc concat for prefix mode
      allColumnKeys: [
        'field_2020', // Labor Description
        'field_2154', // SOW
        'field_1964', // Qty
        'field_2150', // Sub Bid
        'field_2151', // Sub Bid Total
        'field_1973', // +Hrs
        'field_1997', // Hrs Ttl
        'field_1974', // +Mat
        'field_2146', // Mat Ttl
        'field_2028', // Install Fee
        'field_1953', // SCW Notes
        'field_1957', // Connected Devices
        'field_2207', // Mounting Hardware
      ],
      rowLocks: [
        {
          detectField: 'field_2230',
          when: 'yes',
          lockField: 'field_1964',   // Qty
        },
        {
          detectField: 'field_2231',
          whenNot: 'yes',
          lockField: 'field_1957',   // Connected Devices
        },
      ],
      rules: {
        [BUCKET_OTHER_SERVICES]: {
          activeFields: ['field_2020', 'field_2154', 'field_2150', 'field_2151', 'field_1964', 'field_1973', 'field_1997', 'field_1974', 'field_2146', 'field_2028', 'field_1953'],
          rowClass: 'scw-row--services',
        },
        [BUCKET_ASSUMPTIONS]: {
          activeFields: ['field_2020', 'field_2154', 'field_1953'],
          rowClass: 'scw-row--assumptions',
        },
      },
    },
    {
      viewId: 'view_3586',
      detectField: 'field_2219',
      sortField: 'field_2218',
      labelTarget: 'field_1949',
      labelMode: 'prefix',
      laborDescField: null,
      allColumnKeys: [
        'field_1949', // PRODUCT
        'field_1957', // Connected Devices
        'field_1960', // Retail Price
        'field_2020', // Labor Description
        'field_1953', // SCW Notes
        'field_2261', // Cust Disc %
        'field_2262', // Cust Disc $
        'field_1964', // Qty
        'field_2303', // Applied Disc
        'field_2269', // Line Item Total
      ],
      rowLocks: [
        {
          detectField: 'field_2230',
          when: 'yes',
          lockField: 'field_1964',   // Qty
        },
        {
          detectField: 'field_2231',
          whenNot: 'yes',
          lockField: 'field_1957',   // Connected Devices
        },
      ],
      rules: {
        [BUCKET_OTHER_SERVICES]: {
          activeFields: ['field_2020', 'field_1953', 'field_1964', 'field_2261', 'field_2262', 'field_2303', 'field_2269', 'field_1960'],
          rowClass: 'scw-row--services',
        },
        [BUCKET_ASSUMPTIONS]: {
          activeFields: ['field_2020', 'field_1953'],
          rowClass: 'scw-row--assumptions',
        },
      },
    },
  ];

  // ============================================================
  // CONSTANTS
  // ============================================================
  const EVENT_NS      = '.scwCondGray';
  const GRAY_ATTR     = 'data-scw-cond-grayed';
  const GRAY_CLASS    = 'scw-cond-grayed';
  const HIDDEN_CLASS  = 'scw-cond-hidden';
  const ROW_PROCESSED = 'data-scw-cond-processed';

  // ============================================================
  // CSS
  // ============================================================
  function injectCssOnce() {
    const id = 'scw-sow-cond-grayout-css';
    if (document.getElementById(id)) return;

    const css = `
      /* ── Grayed-out cell ── */
      td.${GRAY_CLASS} {
        position: relative;
        background-color: #708090 !important;   /* slategray */
        border-color: #708090 !important;
        cursor: not-allowed !important;
      }
      td.${GRAY_CLASS} * {
        cursor: not-allowed !important;
      }

      /* Kill KTL inline-edit affordance */
      td.${GRAY_CLASS} .ktlInlineEditableCellsStyle,
      td.${GRAY_CLASS} .cell-edit {
        pointer-events: none !important;
      }

      /* ── Hide content in all grayed cells ── */
      td.${GRAY_CLASS} span[class^="col-"] {
        visibility: hidden;
      }

      /* ── Fully hidden cell (no gray bg, content invisible, clicks blocked) ── */
      td.${HIDDEN_CLASS} {
        position: relative;
        cursor: default !important;
      }
      td.${HIDDEN_CLASS} > * {
        visibility: hidden !important;
      }
      td.${HIDDEN_CLASS} .cell-edit,
      td.${HIDDEN_CLASS} .ktlInlineEditableCellsStyle {
        pointer-events: none !important;
      }

      /* ── view_3456: bucket label + labor desc REPLACES product cell via ::after ── */
      #view_3456 td.field_1949[data-scw-bucket-label] {
        position: relative;
      }
      #view_3456 td.field_1949[data-scw-bucket-label]::after {
        content: attr(data-scw-bucket-label);
        position: absolute;
        top: 50%;
        left: 8px;
        transform: translateY(-50%);
        font-weight: 700;
        font-size: 14px;
        color: #1e4d78;
        white-space: nowrap;
      }

      /* view_3332 label injection is handled by device-worksheet bucketRules */
    `;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // DETECTION
  // ============================================================
  function readBucketId($detectTd) {
    const $span = $detectTd.find('span[data-kn="connection-value"]');
    if ($span.length) {
      const cls = ($span.attr('class') || '').trim();
      if (cls) return cls;
    }
    return '';
  }

  // ============================================================
  // APPLY / REMOVE
  // ============================================================
  function grayTd($td) {
    if (!$td || !$td.length) return;
    if ($td.attr(GRAY_ATTR) === '1') return;

    $td
      .attr(GRAY_ATTR, '1')
      .addClass(GRAY_CLASS);

    // Strip Knack/KTL inline-edit hooks
    $td.removeClass('cell-edit ktlInlineEditableCellsStyle');
    $td.find('.cell-edit, .ktlInlineEditableCellsStyle')
      .removeClass('cell-edit ktlInlineEditableCellsStyle');
  }

  function hideTd($td) {
    if (!$td || !$td.length) return;
    if ($td.hasClass(HIDDEN_CLASS)) return;

    $td
      .attr(GRAY_ATTR, '1')       // reuse attr so capture blocker applies
      .addClass(HIDDEN_CLASS);

    $td.removeClass('cell-edit ktlInlineEditableCellsStyle');
    $td.find('.cell-edit, .ktlInlineEditableCellsStyle')
      .removeClass('cell-edit ktlInlineEditableCellsStyle');
  }

  function clearRow($tr, cfg) {
    $tr.find('td[' + GRAY_ATTR + '="1"]').each(function () {
      $(this)
        .removeAttr(GRAY_ATTR)
        .removeClass(GRAY_CLASS)
        .removeClass(HIDDEN_CLASS);
    });
    Object.values(cfg.rules).forEach(function (rule) {
      $tr.removeClass(rule.rowClass);
    });
    $tr.removeAttr(ROW_PROCESSED);
  }

  function normText(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function readBool($cell) {
    var $chk = $cell.find('input[type="checkbox"]');
    if ($chk.length) return $chk.is(':checked') ? 'yes' : 'no';
    if ($cell.find('.kn-icon-yes, .fa-check, .fa-thumbs-up').length) return 'yes';
    if ($cell.find('.kn-icon-no, .fa-times, .fa-thumbs-down').length) return 'no';
    return normText($cell.text());
  }

  function applyRowLocks($tr, cfg) {
    (cfg.rowLocks || []).forEach(function (lock) {
      var $detect = $tr.find('td.' + lock.detectField);
      if (!$detect.length) return;
      var val = readBool($detect);
      var shouldLock = false;
      if (lock.when !== undefined)    shouldLock = (val === normText(lock.when));
      if (lock.whenNot !== undefined) shouldLock = (val !== normText(lock.whenNot));
      if (!shouldLock) return;
      var $td = $tr.find('td.' + lock.lockField);
      if ($td.length) grayTd($td);
    });
  }

  function processRow($tr, cfg) {
    if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

    var $detectTd = $tr.find('td.' + cfg.detectField);
    if (!$detectTd.length) {
      applyRowLocks($tr, cfg);
      return;
    }

    var bucketId = readBucketId($detectTd);
    if (!bucketId) {
      applyRowLocks($tr, cfg);
      return;
    }

    var rule = cfg.rules[bucketId];
    if (!rule) {
      clearRow($tr, cfg);
      applyRowLocks($tr, cfg);
      return;
    }

    var activeSet  = new Set(rule.activeFields || []);
    var hiddenSet  = new Set(rule.hiddenFields || []);

    // Hide or gray every column not in the active set
    cfg.allColumnKeys.forEach(function (fieldKey) {
      if (activeSet.has(fieldKey)) return;
      var $td = $tr.find('td.' + fieldKey);
      if (!$td.length) return;
      if (hiddenSet.has(fieldKey)) { hideTd($td); } else { grayTd($td); }
    });

    // Hide fields listed in hiddenFields that aren't in allColumnKeys (e.g. labelTarget)
    hiddenSet.forEach(function (fieldKey) {
      if (cfg.allColumnKeys.indexOf(fieldKey) !== -1) return;  // already handled above
      if (activeSet.has(fieldKey)) return;
      var $td = $tr.find('td.' + fieldKey);
      if ($td.length) hideTd($td);
    });

    // ── Bucket label injection ──
    var label = BUCKET_LABELS[bucketId];
    if (label) {
      var $target = $tr.find('td.' + cfg.labelTarget);

      if (cfg.labelMode === 'replace') {
        // view_3456: combine label + labor desc, show via ::after on grayed product cell
        var laborField = cfg.laborDescField;
        var laborText = '';
        if (laborField) {
          var $laborDesc = $tr.find('td.' + laborField);
          laborText = $laborDesc.length ? $laborDesc.text().trim() : '';
        }
        var combined = laborText ? label + ' \u2014 ' + laborText : label;
        if ($target.length) {
          $target.first().attr('data-scw-bucket-label', combined);
        }
      } else if (cfg.labelMode === 'prefix') {
        // view_3332: show label above product text via ::before, product stays visible
        if ($target.length) {
          $target.first().attr('data-scw-bucket-label', label);
        }
      }
    }

    $tr.addClass(rule.rowClass);
    $tr.attr(ROW_PROCESSED, '1');

    applyRowLocks($tr, cfg);
  }

  // ============================================================
  // VIEW-LEVEL APPLICATION
  // ============================================================
  function applyForView(cfg) {
    var $view = $('#' + cfg.viewId);
    if (!$view.length) return;

    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

    $tbody.find('tr').each(function () {
      processRow($(this), cfg);
    });
  }

  // ============================================================
  // SORT ROWS BY SORT_FIELD
  // ============================================================
  function sortRows(cfg) {
    if (!cfg.sortField) return;

    var $view = $('#' + cfg.viewId);
    if (!$view.length) return;
    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

    var allRows = $tbody.children('tr').toArray();
    var groups = [];
    var current = null;

    allRows.forEach(function (row) {
      var $r = $(row);
      if ($r.hasClass('kn-table-group') || $r.hasClass('kn-table-group-container')) {
        current = { header: row, rows: [] };
        groups.push(current);
      } else if (current) {
        current.rows.push(row);
      } else {
        if (!groups.length || groups[groups.length - 1].header) {
          current = { header: null, rows: [] };
          groups.push(current);
        }
        current.rows.push(row);
      }
    });

    var sortField = cfg.sortField;
    var comparator = function (a, b) {
      var aVal = $(a).find('td.' + sortField).text().trim();
      var bVal = $(b).find('td.' + sortField).text().trim();
      var aNum = parseFloat(aVal);
      var bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return aVal.localeCompare(bVal);
    };

    groups.forEach(function (g) {
      if (g.rows.length > 1) g.rows.sort(comparator);
    });

    groups.forEach(function (g) {
      if (g.header) $tbody.append(g.header);
      g.rows.forEach(function (row) { $tbody.append(row); });
    });
  }

  // Removed: applyWithRetries (12×250ms polling loop).
  // The MutationObserver on tbody already re-applies after DOM changes.

  // ============================================================
  // CAPTURE-PHASE EVENT BLOCKER
  // ============================================================
  function installCaptureBlockerOnce() {
    if (window.__scwCondGrayCaptureInstalled) return;
    window.__scwCondGrayCaptureInstalled = true;

    var kill = function (e) {
      var td = e.target.closest && e.target.closest('td[' + GRAY_ATTR + '="1"]');
      if (!td) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      return false;
    };

    ['mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'keydown'].forEach(function (evt) {
      document.addEventListener(evt, kill, true);
    });
  }

  // ============================================================
  // MUTATION OBSERVER
  // ============================================================
  function installObserver(cfg) {
    var $view = $('#' + cfg.viewId);
    if (!$view.length) return;
    if ($view.data('scwCondGrayObserver')) return;
    $view.data('scwCondGrayObserver', true);

    var el = $view.find('table.kn-table-table tbody').get(0);
    if (!el) return;

    var obsTimer = 0;
    var obs = new MutationObserver(function () {
      if (obsTimer) clearTimeout(obsTimer);
      obsTimer = setTimeout(function () { obsTimer = 0; applyForView(cfg); }, 150);
    });
    obs.observe(el, { childList: true, subtree: true });
  }

  // ============================================================
  // INIT
  // ============================================================
  injectCssOnce();
  installCaptureBlockerOnce();

  VIEW_CONFIGS.forEach(function (cfg) {
    $(document)
      .off('knack-view-render.' + cfg.viewId + EVENT_NS)
      .on('knack-view-render.' + cfg.viewId + EVENT_NS, function () {
        sortRows(cfg);
        applyForView(cfg);
        installObserver(cfg);
      });
  });
})();
/***************************** /CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
