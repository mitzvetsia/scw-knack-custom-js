/***************************** CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
/**
 * SCW / Knack: Row-based conditional cell grayout (view_3505)
 *
 * Reads the hidden field_2366 (REL_proposal bucket) on each row
 * and applies per-bucket grayout rules:
 *
 *  "Other Services"  → gray out all cells EXCEPT field_2415, field_2409, field_2400, field_2399
 *  "Assumptions"     → gray out all cells EXCEPT field_2415, field_2409;
 *                      field_2409 gets a distinctive background;
 *                      grayed cells have their content hidden so the
 *                      description column visually dominates the row.
 *
 * Approach mirrors lock-fields.js: capture-phase event blocker,
 * MutationObserver, retried application on render.
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const VIEW_IDS = ['view_3505'];

  // Detect field (hidden column with the bucket connection value)
  const DETECT_FIELD = 'field_2366';

  // Connection record IDs (more reliable than text matching)
  const BUCKET_OTHER_SERVICES = '6977caa7f246edf67b52cbcd';
  const BUCKET_ASSUMPTIONS    = '697b7a023a31502ec68b3303';

  // All editable/visible column field keys in this view (excluding the hidden detect field)
  const ALL_COLUMN_KEYS = [
    'field_2415', // REL_bid
    'field_2379', // PRODUCT
    'field_2380', // Connected Devices
    'field_2409', // Install Labor Description
    'field_2412', // Survey Notes
    'field_2376', // Power Available
    'field_2400', // Labor
    'field_2399', // Qty
    'field_2401', // Labor Total
  ];

  // Rules: which fields stay ACTIVE (not grayed) per bucket
  const RULES = {
    [BUCKET_OTHER_SERVICES]: {
      activeFields: ['field_2415', 'field_2409', 'field_2400', 'field_2399'],
      rowClass: 'scw-row--services',
    },
    [BUCKET_ASSUMPTIONS]: {
      activeFields: ['field_2415', 'field_2409'],
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
    const id = 'scw-cond-grayout-css';
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

      /* ── Assumptions: hide content in grayed cells so description dominates ── */
      tr.scw-row--assumptions td.${GRAY_CLASS} span[class^="col-"] {
        visibility: hidden;
      }

      /* Distinctive background on the active description cell for assumption rows */
      tr.scw-row--assumptions td.field_2409 {
        background-color: #e8f0fe !important;   /* light blue tint */
      }

      /* Subtle left-border accent for assumption rows */
      tr.scw-row--assumptions td:first-child {
        border-left: 4px solid #4285f4 !important;
      }

      /* ── Other Services: lighter gray + keep grayed cells readable ── */
      tr.scw-row--services td.${GRAY_CLASS} {
        background-color: #b0bec5 !important;   /* lighter blue-gray */
        border-color: #b0bec5 !important;
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

  function processRow($tr) {
    // Skip group/header rows
    if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

    const $detectTd = $tr.find('td.' + DETECT_FIELD);
    if (!$detectTd.length) return;

    const bucketId = readBucketId($detectTd);
    if (!bucketId) return;

    const rule = RULES[bucketId];
    if (!rule) {
      // No rule for this bucket — make sure row is clear
      clearRow($tr);
      return;
    }

    const activeSet = new Set(rule.activeFields || []);

    // Gray every column not in the active set
    ALL_COLUMN_KEYS.forEach(function (fieldKey) {
      if (activeSet.has(fieldKey)) return;
      const $td = $tr.find('td.' + fieldKey);
      if ($td.length) grayTd($td);
    });

    // Also gray the detect field itself (it's hidden but let's be safe)
    const $detectSelf = $tr.find('td.' + DETECT_FIELD);
    if ($detectSelf.length && !activeSet.has(DETECT_FIELD)) {
      grayTd($detectSelf);
    }

    // Apply row-level class
    $tr.addClass(rule.rowClass);
    $tr.attr(ROW_PROCESSED, '1');
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
        applyWithRetries(viewId);
        installObserver(viewId);
      });
  });
})();
/***************************** /CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
