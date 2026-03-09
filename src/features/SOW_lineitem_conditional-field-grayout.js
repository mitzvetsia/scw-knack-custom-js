/***************************** CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
/**
 * SCW / Knack: Row-based conditional cell grayout (view_3456 — SOW)
 *
 * Reads the hidden field_2219 (REL_proposal bucket) on each row
 * and applies per-bucket grayout rules:
 *
 *  "Other Services"  → gray out all cells; inject bucket label +
 *                      field_2020 (Labor Description) into field_1949.
 *  "Assumptions"     → gray out all cells; inject bucket label +
 *                      field_2020 (Labor Description) into field_1949.
 *
 * Approach mirrors lock-fields.js: capture-phase event blocker,
 * MutationObserver, retried application on render.
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const VIEW_IDS = ['view_3456'];

  // Detect field (hidden column with the bucket connection value)
  const DETECT_FIELD = 'field_2219';

  // Sort field (in DOM but not visible)
  const SORT_FIELD = 'field_2218';

  // Connection record IDs (more reliable than text matching)
  const BUCKET_OTHER_SERVICES = '6977caa7f246edf67b52cbcd';
  const BUCKET_ASSUMPTIONS    = '697b7a023a31502ec68b3303';

  // Display labels for the detect-field cell
  const BUCKET_LABELS = {
    [BUCKET_OTHER_SERVICES]: 'SERVICE',
    [BUCKET_ASSUMPTIONS]:    'ASSUMPTION',
  };

  // All editable/visible column field keys in this view (excluding the hidden detect field)
  const ALL_COLUMN_KEYS = [
    'field_1949', // PRODUCT (bucket label + labor description target)
    'field_1957', // Connected Devices
    'field_1960', // Unit Price
    'field_2020', // INPUT_Labor Description (hidden)
    'field_1953', // SCW Notes
    //'field_2376', // Power Available
    'field_2261', // Cust Disc %
    'field_2262', // Cust Disc $$ Each
    'field_1964', // Qty
    'field_2303', // Applied Disc
    'field_2269', // total Line Price
  ];

  // Per-row conditional locks (applied to ALL rows regardless of bucket)
  // Each rule: if detectField matches `when`, gray+lock the target field
  const ROW_LOCKS = [
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
  ];

  // Rules: which fields stay ACTIVE (not grayed) per bucket
  const RULES = {
    [BUCKET_OTHER_SERVICES]: {
      activeFields: [],
      rowClass: 'scw-row--services',
    },
    [BUCKET_ASSUMPTIONS]: {
      activeFields: [],
      rowClass: 'scw-row--assumptions',
    },
  };

  // ============================================================
  // CONSTANTS
  // ============================================================
  const EVENT_NS      = '.scwCondGray';
  const GRAY_ATTR     = 'data-scw-cond-grayed';
  const GRAY_CLASS    = 'scw-cond-grayed';
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

      /* Distinctive background on the active description cell for assumption rows */
      tr.scw-row--assumptions td.field_2409 {
        background-color: #e8f0fe !important;   /* light blue tint */
      }

      /* ── Bucket label overlay in PRODUCT (field_1949) cell ── */
      td.field_1949[data-scw-bucket-label] {
        position: relative;
      }
      td.field_1949[data-scw-bucket-label]::after {
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
    `;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // DETECTION
  // ============================================================

  /**
   * Returns the connection-value record ID from the detect cell,
   * e.g. "697b7a023a31502ec68b3303" for Assumptions.
   * Falls back to normalized text if no span[data-kn] is found.
   */
  function readBucketId($detectTd) {
    const $span = $detectTd.find('span[data-kn="connection-value"]');
    if ($span.length) {
      // The record ID is used as the span's class
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

  function clearRow($tr) {
    $tr.find(`td[${GRAY_ATTR}="1"]`).each(function () {
      $(this)
        .removeAttr(GRAY_ATTR)
        .removeClass(GRAY_CLASS);
    });
    // Remove all possible row classes
    Object.values(RULES).forEach(function (rule) {
      $tr.removeClass(rule.rowClass);
    });
    $tr.removeAttr(ROW_PROCESSED);
  }

  function normText(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // Read a yes/no value from a cell, handling text, checkboxes, and Knack booleans
  function readBool($cell) {
    // Checkbox input
    var $chk = $cell.find('input[type="checkbox"]');
    if ($chk.length) return $chk.is(':checked') ? 'yes' : 'no';
    // Knack boolean icon (thumbs-up / thumbs-down, check / x)
    if ($cell.find('.kn-icon-yes, .fa-check, .fa-thumbs-up').length) return 'yes';
    if ($cell.find('.kn-icon-no, .fa-times, .fa-thumbs-down').length) return 'no';
    // Fall back to text
    return normText($cell.text());
  }

  function applyRowLocks($tr) {
    ROW_LOCKS.forEach(function (lock) {
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

  function processRow($tr) {
    // Skip group/header rows
    if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

    // ── Bucket-based grayout ──
    const $detectTd = $tr.find('td.' + DETECT_FIELD);
    if (!$detectTd.length) {
      applyRowLocks($tr);
      return;
    }

    const bucketId = readBucketId($detectTd);
    if (!bucketId) {
      applyRowLocks($tr);
      return;
    }

    const rule = RULES[bucketId];
    if (!rule) {
      clearRow($tr);
      // Per-row locks run AFTER clearRow so they aren't wiped
      applyRowLocks($tr);
      return;
    }

    const activeSet = new Set(rule.activeFields || []);

    // Gray every column not in the active set
    ALL_COLUMN_KEYS.forEach(function (fieldKey) {
      if (activeSet.has(fieldKey)) return;
      const $td = $tr.find('td.' + fieldKey);
      if ($td.length) grayTd($td);
    });

    // Show bucket label + labor description in the PRODUCT (field_1949) cell.
    // field_2020 (INPUT_Labor Description) is read if present in the DOM.
    var label = BUCKET_LABELS[bucketId];
    if (label) {
      var $laborDesc = $tr.find('td.field_2020');
      var laborText = $laborDesc.length ? $laborDesc.text().trim() : '';
      var combined = laborText ? label + ' \u2014 ' + laborText : label;
      var $target = $tr.find('td.field_1949');
      if ($target.length) {
        $target.first().attr('data-scw-bucket-label', combined);
      }
    }

    // Apply row-level class
    $tr.addClass(rule.rowClass);
    $tr.attr(ROW_PROCESSED, '1');

    // Per-row locks run last so they can override activeFields
    applyRowLocks($tr);
  }

  // ============================================================
  // VIEW-LEVEL APPLICATION
  // ============================================================
  function applyForView(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;

    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

    $tbody.find('tr').each(function () {
      processRow($(this));
    });
  }

  // ============================================================
  // SORT ROWS BY SORT_FIELD
  // ============================================================
  function sortRows(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;
    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

    // Collect groups: each group starts with a group-header row,
    // followed by its data rows until the next group-header.
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
        // Rows before any group header — treat as their own group
        if (!groups.length || groups[groups.length - 1].header) {
          current = { header: null, rows: [] };
          groups.push(current);
        }
        current.rows.push(row);
      }
    });

    // Sort data rows within each group
    var comparator = function (a, b) {
      var aVal = $(a).find('td.' + SORT_FIELD).text().trim();
      var bVal = $(b).find('td.' + SORT_FIELD).text().trim();
      var aNum = parseFloat(aVal);
      var bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return aVal.localeCompare(bVal);
    };

    groups.forEach(function (g) {
      if (g.rows.length > 1) g.rows.sort(comparator);
    });

    // Re-append in order: header then sorted rows
    groups.forEach(function (g) {
      if (g.header) $tbody.append(g.header);
      g.rows.forEach(function (row) { $tbody.append(row); });
    });
  }

  function applyWithRetries(viewId, tries) {
    tries = tries || 12;
    var i = 0;
    (function tick() {
      i++;
      applyForView(viewId);
      if (i < tries) setTimeout(tick, 250);
    })();
  }

  // ============================================================
  // CAPTURE-PHASE EVENT BLOCKER
  // (shared with lock-fields.js via the same attribute)
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
      document.addEventListener(evt, kill, true); // capture phase
    });
  }

  // ============================================================
  // MUTATION OBSERVER (re-apply when Knack/KTL re-renders tbody)
  // ============================================================
  function installObserver(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;
    if ($view.data('scwCondGrayObserver')) return;
    $view.data('scwCondGrayObserver', true);

    var el = $view.find('table.kn-table-table tbody').get(0);
    if (!el) return;

    var obs = new MutationObserver(function () {
      applyForView(viewId);
    });
    obs.observe(el, { childList: true, subtree: true });
  }

  // ============================================================
  // INIT
  // ============================================================
  injectCssOnce();
  installCaptureBlockerOnce();

  VIEW_IDS.forEach(function (viewId) {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        sortRows(viewId);
        applyWithRetries(viewId);
        installObserver(viewId);
      });
  });
})();
/***************************** /CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
