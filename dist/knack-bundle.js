// src/config.js
window.SCW = window.SCW || {};
window.SCW.CONFIG = window.SCW.CONFIG || {
  VERSION: "dev"
};
window.SCW = window.SCW || {};

(function initBindingsHelpers(namespace) {
  function normalizeNamespace(ns) {
    if (!ns) return '.scw';
    return ns.startsWith('.') ? ns : `.${ns}`;
  }

  namespace.onViewRender = function onViewRender(viewId, handler, ns) {
    if (!viewId || typeof handler !== 'function') return;
    const eventName = `knack-view-render.${viewId}${normalizeNamespace(ns)}`;
    $(document).off(eventName).on(eventName, handler);
  };

  namespace.onSceneRender = function onSceneRender(sceneId, handler, ns) {
    if (!sceneId || typeof handler !== 'function') return;
    const eventName = `knack-scene-render.${sceneId}${normalizeNamespace(ns)}`;
    $(document).off(eventName).on(eventName, handler);
  };
})(window.SCW);
/**************************************************************************************************
 * LEGACY / RATKING SEGMENT
 * Goal: Make boundaries between “features” obvious without changing behavior.
 * Note: This file mixes global handlers, per-view hacks, and legacy utilities.
 **************************************************************************************************/

/**************************************************************************************************
 * FEATURE: Modal backdrop click-to-close DISABLE (possibly obsolete)
 * - DEPRECATE? Knack now has “keep open till action”
 * - Purpose: prevents closing modal when clicking outside it
 **************************************************************************************************/
(function modalBackdropClickDisable() {
  $(document).on('knack-scene-render.any', function (event, scene) {
    $('.kn-modal-bg').off('click');
  });
})();
/*** END FEATURE: Modal backdrop click-to-close DISABLE ************************************************/
/**************************************************************************************************
 * FEATURE: Default field value injection (single-purpose hacks)
 **************************************************************************************************/

/** Default: view_1519 sets field_932 */
(function defaultValue_view1519_field932() {
  $(document).on('knack-view-render.view_1519', function (event, view, data) {
    setTimeout(function () {
      $('input#field_932').attr('value', '5deebcd9525d220015a14e1f'); // works
    }, 1);
  });
})();

/** Default: modal view_1328 sets field_737 */
(function defaultValue_modal1328_field737() {
  $(document).on('knack-modal-render.view_1328', function (event, view, record) {
    setTimeout(function () {
      $('input#field_737').attr('value', 'Create_Project');
    }, 1);
  });
})();

/** Default: scene_208 sets field_877 */
(function defaultValue_scene208_field877() {
  $(document).on('knack-scene-render.scene_208', function (event, view, record) {
    setTimeout(function () {
      $('input#field_877').attr('value', 'Deputy 8.0');
    }, 1);
  });
})();

/** Default: modal view_1457 sets field_737 */
(function defaultValue_modal1457_field737() {
  $(document).on('knack-modal-render.view_1457', function (event, view, record) {
    setTimeout(function () {
      $('input#field_737').attr('value', 'Create_Project');
    }, 1);
  });
})();

/*** END FEATURE: Default field value injection *********************************************************/
/**************************************************************************************************
 * FEATURE: Post-inline-edit behavior (refresh / spinner / alerts)
 **************************************************************************************************/

/** Inline edit: view_1991 shows spinner + minor hash tweak */
(function inlineEdit_view1991_spinner() {
  $(document).on('knack-cell-update.view_1991', function (event, view, data) {
    setTimeout(function () { location.hash = location.hash + "#"; }, 100);
    Knack.showSpinner();
  });
})();

/** Record update: view_1493 alerts + fetches view model */
(function recordUpdate_view1493_alertAndFetch() {
  $(document).on('knack-record-update.view_1493', function (event, view, record) {
    alert("Click 'OK' to update equipment total");
    Knack.views["view_1493"].model.fetch();
    console.log("hello world");
    console.log(Knack.views);
  });
})();

/*** END FEATURE: Post-inline-edit behavior *************************************************************/
/**************************************************************************************************
 * FEATURE: Timepicker initialization (per-view list)
 * - Applies timepicker to .ui-timepicker-input when view renders
 **************************************************************************************************/
(function timepickerInit_perViewList() {
  var view_names = ["view_832"]; // add view numbers as necessary

  view_names.forEach(function bindToUpdate1(selector_view_name) {
    $(document).on('knack-view-render.' + selector_view_name, function (event, view, data) {
      $(document).ready(function () {
        $('.ui-timepicker-input').timepicker({
          minTime: '09:30:00', // change as necessary
          maxTime: '16:30:00'
        });
      });
    });
  });
})();
/*** END FEATURE: Timepicker initialization **************************************************************/
/**************************************************************************************************
 * FEATURE: view_1509 UI text tweaks (discount description / label helpers)
 **************************************************************************************************/
(function discountCopyTweaks_view1509() {
  $(document).on('knack-view-render.view_1509', function (event, view) {
    // Add discount description
    $('<div><hr></br></div>').insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(3)');

    // Modify text around discount amount
    $('<span>-</span>').insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span');

    $('<span> discount for Annual plan = </span>').insertAfter('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span:nth-child(2)');
  });
})();
/*** END FEATURE: view_1509 UI tweaks *********************************************************************/
/**************************************************************************************************
 * FEATURE: Record update => “hash bump” refresh (micro-hacks)
 **************************************************************************************************/
(function hashBump_onRecordUpdate() {
  $(document).on('knack-record-update.view_2074', function (event, view, record) { location.hash = location.hash + "#"; });
  $(document).on('knack-record-update.view_2083', function (event, view, record) { location.hash = location.hash + "#"; });
  $(document).on('knack-record-update.view_2078', function (event, view, record) { location.hash = location.hash + "#"; });
  $(document).on('knack-record-update.view_2084', function (event, view, record) { location.hash = location.hash + "#"; });
})();
/*** END FEATURE: Record update => hash bump **************************************************************/
/**************************************************************************************************
 * FEATURE: Odd scene_776 stub (currently non-functional)
 **************************************************************************************************/
(function scene776_stub() {
  $(document).on('knack-scene-render.scene_776', function (event, view, data) {
    $('').click(function () { // ⚠ selector is empty -> does nothing
      $('#view_hide').show();
    });
  });
})();
/*** END FEATURE: Odd scene_776 stub ************************************************************************/
////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************////
/**
 * SCW Totals Script - Full Patched Code
 *
 * Baseline behaviors preserved (per your “working code” requirements):
 *  - Footer subtotals are queued and inserted bottom-up
 *  - Level-2 subtotal rows are inserted before Level-1 when anchored at same spot
 *  - Per-level subtotal CSS hooks (scw-subtotal--level-X + data attributes)
 *  - Level-4 “drop-only” camera concat from field_1952/field_1951
 *  - Sanitizes field_2019 to allow only <br>/<b>
 *
 * Added / Repaired patches in this version:
 *  - ✅ Hide Level-3 group header row when its label is blank-ish (prevents “Other Services” blank L3)
 *  - ✅ Add L2 class hook for “Assumptions” ONLY when the first record under it matches a specific record ID
 *  - ✅ Hide duplicated record rows that immediately repeat the Level-4 group text (safe, non-row-injecting)
 *
 * IMPORTANT:
 *  - This code does NOT inject fake table rows with multiple <td> (that breaks Knack’s group row structure).
 *  - It only adds classes, hides select rows, and injects subtotal rows in a controlled way.
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const EVENT_NS = '.scwTotals';

  // Enable on these views
  const VIEW_IDS = ['view_3301', 'view_3341'];

  // Optional: restrict to certain scenes (leave empty to allow all scenes)
  const SCENE_IDS = []; // e.g. ['scene_1085']

  // Field keys used by totals
  const QTY_FIELD_KEY      = 'field_1964';
  const LABOR_FIELD_KEY    = 'field_2028';
  const HARDWARE_FIELD_KEY = 'field_2201';
  const COST_FIELD_KEY     = 'field_2203';

  // Text / description field where you inject <b> and <br>
  const DESC_FIELD_KEY = 'field_2019';

  // Camera “drop” concat source fields (your known working convention)
  const DROP_PREFIX_FIELD_KEY = 'field_1952'; // e.g. E-
  const DROP_NUM_FIELD_KEY    = 'field_1951'; // e.g. 1,2,3...

  // Assumptions hook: when an L2 row label is “Assumptions”, add a class IF the first record under it is this ID
  const ASSUMPTIONS_FIRST_RECORD_ID = '698217d2e8902a998373388b';

  // CSS injection id
  const CSS_ID = 'scw-totals-css-v3';

  // ============================================================
  // CSS
  // ============================================================
  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;

    const css = `
/* ===== SCW Totals + Patches ===== */

/* Hide blank-ish L3 headers */
tr.kn-table-group.kn-group-level-3.scw-hide-level3-header { display: none !important; }

/* Hide duplicated record rows (the record row right after an L4 group when it repeats the L4 label) */
tr.scw-hidden-record-row { display: none !important; }

/* L2 assumptions hooks */
tr.kn-table-group.kn-group-level-2.scw-l2--assumptions { }
tr.kn-table-group.kn-group-level-2.scw-l2--assumptions-id { }

/* Subtotal row hooks */
tr.scw-subtotal-row { background: #f7f9fc; }
tr.scw-subtotal-row td { font-weight: 600; }
tr.scw-subtotal--level-1 td { }
tr.scw-subtotal--level-2 td { }
tr.scw-subtotal--level-3 td { }
tr.scw-subtotal--level-4 td { }

/* Optional: make subtotal amounts align like your grid */
tr.scw-subtotal-row td.scw-subtotal-cell--amount { text-align: right !important; }
tr.scw-subtotal-row td.scw-subtotal-cell--qty { text-align: center !important; }
    `.trim();

    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // UTIL
  // ============================================================
  function normText(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isBlankish(s) {
    const t = normText(s);
    return !t || t === '-' || t === '—' || t === '–';
  }

  function parseMoneyCell($td) {
    // e.g. "$5,100.00" or "&nbsp;" => number
    const t = normText($td.text()).replace(/[$,]/g, '');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  }

  function parseNumberCell($td) {
    const t = normText($td.text()).replace(/[,]/g, '');
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : 0;
  }

  function getGroupLabel($groupTr) {
    return normText($groupTr.children('td').first().text());
  }

  function getRecordDescText($recordTr) {
    const $cell = $recordTr.find(`td.${DESC_FIELD_KEY}[data-field-key="${DESC_FIELD_KEY}"]`);
    if (!$cell.length) return '';
    return normText($cell.text());
  }

  // Find the next “real record row” (has id) after a group row, stopping at next group header.
  function nextRecordRow($startTr) {
    let $n = $startTr.next();
    while ($n.length) {
      if ($n.hasClass('kn-table-group')) return $(); // stop at next group
      if ($n.attr('id')) return $n;                 // record row
      $n = $n.next();
    }
    return $();
  }

  // ============================================================
  // PATCH A: Hide blank-ish level-3 group header rows
  // ============================================================
  function hideBlankLevel3Headers($view) {
    $view.find('tr.kn-table-group.kn-group-level-3').each(function () {
      const $l3 = $(this);
      const label = getGroupLabel($l3);
      if (isBlankish(label)) $l3.addClass('scw-hide-level3-header');
      else $l3.removeClass('scw-hide-level3-header');
    });
  }

  // ============================================================
  // PATCH B: Assumptions hook by first record id
  // ============================================================
  function applyAssumptionsHook($view) {
    $view.find('tr.kn-table-group.kn-group-level-2').each(function () {
      const $l2 = $(this);
      const label = getGroupLabel($l2);

      if (label !== 'Assumptions') {
        $l2.removeClass('scw-l2--assumptions scw-l2--assumptions-id');
        return;
      }

      $l2.addClass('scw-l2--assumptions');

      const $firstRecord = nextRecordRow($l2);
      if ($firstRecord.length && $firstRecord.attr('id') === ASSUMPTIONS_FIRST_RECORD_ID) {
        $l2.addClass('scw-l2--assumptions-id');
      } else {
        $l2.removeClass('scw-l2--assumptions-id');
      }
    });
  }

  // ============================================================
  // PATCH C: Hide duplicated record rows right after L4 group row
  //         when record’s field_2019 text matches L4 label
  // ============================================================
  function hideDuplicateRecordsAfterL4($view) {
    $view.find('tr.kn-table-group.kn-group-level-4').each(function () {
      const $l4 = $(this);
      const l4Text = getGroupLabel($l4);

      // If L4 is blank, do nothing (common in Mounting Hardware)
      if (isBlankish(l4Text)) return;

      const $next = $l4.next();
      if (!$next.length) return;
      if (!$next.attr('id')) return; // only handle the common “L4 then record row” pattern

      const recText = getRecordDescText($next);
      if (!isBlankish(recText) && recText === l4Text) {
        $next.addClass('scw-hidden-record-row');
      }
    });
  }

  // ============================================================
  // SANITIZE field_2019 to allow only <br> and <b>
  // ============================================================
  function sanitizeDescCellHtml($td) {
    // Keep <br> and <b> ONLY; strip all other tags
    const html = String($td.html() || '');

    // Temporary marker approach to preserve <br> and <b>
    const marked = html
      .replace(/<\s*br\s*\/?>/gi, '[[[SCW_BR]]]')
      .replace(/<\s*b\s*>/gi, '[[[SCW_B_OPEN]]]')
      .replace(/<\s*\/\s*b\s*>/gi, '[[[SCW_B_CLOSE]]]');

    // Strip all tags
    const stripped = marked.replace(/<[^>]*>/g, '');

    // Restore allowed tags
    const restored = stripped
      .replace(/\[\[\[SCW_BR\]\]\]/g, '<br>')
      .replace(/\[\[\[SCW_B_OPEN\]\]\]/g, '<b>')
      .replace(/\[\[\[SCW_B_CLOSE\]\]\]/g, '</b>');

    if (restored !== html) $td.html(restored);
  }

  function sanitizeAllDescriptions($view) {
    $view.find(`td.${DESC_FIELD_KEY}[data-field-key="${DESC_FIELD_KEY}"]`).each(function () {
      sanitizeDescCellHtml($(this));
    });
  }

  // ============================================================
  // CAMERA CONCAT (drop-only) for Level-4 “Camera or Reader”
  // ============================================================
  function buildDropLabel(prefix, num) {
    const p = normText(prefix);
    const n = normText(num);
    if (!p && !n) return '';
    return `${p}${n}`.replace(/\s+/g, ' ').trim();
  }

  function collectDropLabelsUntilNextGroup($startRow) {
    const labels = [];
    let $row = $startRow;

    while ($row.length) {
      if ($row.hasClass('kn-table-group')) break;

      if ($row.attr('id') && !$row.hasClass('scw-hidden-record-row')) {
        const prefix = normText($row.find(`td.${DROP_PREFIX_FIELD_KEY}[data-field-key="${DROP_PREFIX_FIELD_KEY}"]`).text());
        const num    = normText($row.find(`td.${DROP_NUM_FIELD_KEY}[data-field-key="${DROP_NUM_FIELD_KEY}"]`).text());

        const label = buildDropLabel(prefix, num);
        // Only accept drop-only values (prefix like "E-" etc AND a number)
        if (label && /\d/.test(label)) labels.push(label);
      }

      $row = $row.next();
    }

    // unique while preserving order
    const seen = new Set();
    return labels.filter(l => (seen.has(l) ? false : (seen.add(l), true)));
  }

  function injectDropLabelsIntoLevel4GroupRow($l4GroupRow, labels) {
    if (!labels || !labels.length) return;

    // Non-destructive: append a small line to the L4 text cell (single-td row)
    const $td = $l4GroupRow.children('td').first();
    const existing = $td.html() || '';
    const line = `<br><b>Drops:</b> ${labels.join(', ')}`;

    // avoid double-inject
    if (existing.includes('scw-drop-labels')) return;

    $td.html(`${existing}<span class="scw-drop-labels">${line}</span>`);
  }

  function applyCameraDropConcat($view) {
    // We only do this when we see an L2 bucket named “Camera or Reader”
    $view.find('tr.kn-table-group.kn-group-level-2').each(function () {
      const $l2 = $(this);
      const label = getGroupLabel($l2);
      if (label !== 'Camera or Reader') return;

      // For each L3 under this L2, find its L4 group row(s) and inject concatenated drops
      // Pattern: L3 group row -> L4 group row -> record rows (one per drop/line item)
      let $row = $l2.next();
      while ($row.length) {
        if ($row.hasClass('kn-table-group') && $row.hasClass('kn-group-level-2')) break; // next L2 starts
        if ($row.hasClass('kn-table-group') && $row.hasClass('kn-group-level-1')) break; // next L1 starts

        if ($row.hasClass('kn-table-group') && $row.hasClass('kn-group-level-4')) {
          const $l4 = $row;
          const labels = collectDropLabelsUntilNextGroup($l4.next());
          injectDropLabelsIntoLevel4GroupRow($l4, labels);
        }
        $row = $row.next();
      }
    });
  }

  // ============================================================
  // TOTALS / SUBTOTALS
  // ============================================================
  function getRowValues($recordRow) {
    const $qty      = $recordRow.find(`td.${QTY_FIELD_KEY}[data-field-key="${QTY_FIELD_KEY}"]`);
    const $labor    = $recordRow.find(`td.${LABOR_FIELD_KEY}[data-field-key="${LABOR_FIELD_KEY}"]`);
    const $hardware = $recordRow.find(`td.${HARDWARE_FIELD_KEY}[data-field-key="${HARDWARE_FIELD_KEY}"]`);
    const $cost     = $recordRow.find(`td.${COST_FIELD_KEY}[data-field-key="${COST_FIELD_KEY}"]`);

    return {
      qty: parseNumberCell($qty),
      labor: parseMoneyCell($labor),
      hardware: parseMoneyCell($hardware),
      cost: parseMoneyCell($cost)
    };
  }

  function fmtMoney(n) {
    // Basic money format, no locale surprises
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(n);
    const s = v.toFixed(2);
    const parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}$${parts.join('.')}`;
  }

  function makeSubtotalRow(level, meta, totals, colCount) {
    // colCount should match your table columns count (you showed 9)
    const $tr = $('<tr/>')
      .addClass('scw-subtotal-row')
      .addClass(`scw-subtotal--level-${level}`)
      .attr('data-scw-level', String(level));

    // Carry some context
    if (meta && meta.l1) $tr.attr('data-scw-l1', meta.l1);
    if (meta && meta.l2) $tr.attr('data-scw-l2', meta.l2);
    if (meta && meta.l3) $tr.attr('data-scw-l3', meta.l3);

    // Build cells aligned to your columns:
    // [desc][conn/bucket][unit][prefix][labor][hardware][qty][cost][dropnum]
    // You can adjust labeling, but keep structure stable.
    const cells = new Array(colCount).fill('').map(() => $('<td/>'));

    // Put label in first cell
    const labelParts = [];
    if (level === 1) labelParts.push('Subtotal' + (meta?.l1 ? `: ${meta.l1}` : ''));
    if (level === 2) labelParts.push('Subtotal' + (meta?.l2 ? `: ${meta.l2}` : ''));
    if (level === 3) labelParts.push('Subtotal' + (meta?.l3 ? `: ${meta.l3}` : ''));

    cells[0].html(`<b>${labelParts.join('')}</b>`);

    // Labor (col index based on your DOM):
    // field_2028 appears as 5th visible data column in your markup (0-based: 4)
    // field_2201 next (0-based: 5)
    // field_1964 qty (0-based: 6)
    // field_2203 cost (0-based: 7)
    // We’ll target those positions safely if colCount >= 8.
    const idxLabor = 4;
    const idxHardware = 5;
    const idxQty = 6;
    const idxCost = 7;

    if (colCount > idxLabor)   cells[idxLabor].addClass('scw-subtotal-cell--amount').text(fmtMoney(totals.labor || 0));
    if (colCount > idxHardware)cells[idxHardware].addClass('scw-subtotal-cell--amount').text(fmtMoney(totals.hardware || 0));
    if (colCount > idxQty)     cells[idxQty].addClass('scw-subtotal-cell--qty').text(String(Math.round((totals.qty || 0) * 100) / 100));
    if (colCount > idxCost)    cells[idxCost].addClass('scw-subtotal-cell--amount').text(fmtMoney(totals.cost || 0));

    cells.forEach($td => $tr.append($td));
    return $tr;
  }

  function removeExistingSubtotals($view) {
    $view.find('tr.scw-subtotal-row').remove();
  }

  function computeAndInsertSubtotals($view) {
    const $table = $view.find('table.kn-table-table');
    if (!$table.length) return;

    const $tbody = $table.find('tbody');
    if (!$tbody.length) return;

    const colCount = ($table.find('thead tr th').length) || 9;

    // Remove old subtotal rows before recompute
    removeExistingSubtotals($view);

    // We scan rows and compute running totals per group context.
    // Then we queue subtotal insertions at appropriate anchors and insert bottom-up.
    const queue = []; // { anchorIndex, level, meta, totals }

    let ctx = { l1: '', l2: '', l3: '' };

    // Running totals per context
    let tL1 = { qty: 0, labor: 0, hardware: 0, cost: 0 };
    let tL2 = { qty: 0, labor: 0, hardware: 0, cost: 0 };
    let tL3 = { qty: 0, labor: 0, hardware: 0, cost: 0 };

    function addToTotals(T, v) {
      T.qty += v.qty; T.labor += v.labor; T.hardware += v.hardware; T.cost += v.cost;
    }
    function cloneTotals(T) {
      return { qty: T.qty, labor: T.labor, hardware: T.hardware, cost: T.cost };
    }
    function resetTotals(T) {
      T.qty = 0; T.labor = 0; T.hardware = 0; T.cost = 0;
    }

    const $rows = $tbody.children('tr');
    $rows.each(function (i) {
      const $tr = $(this);

      // Skip rows we intentionally hid
      if ($tr.hasClass('scw-hidden-record-row')) return;

      if ($tr.hasClass('kn-table-group')) {
        // When a group header appears, we may need to close lower-level totals.
        if ($tr.hasClass('kn-group-level-1')) {
          // Close out L3 and L2 and L1 before new L1
          if (ctx.l3) queue.push({ anchorIndex: i, level: 3, meta: { ...ctx }, totals: cloneTotals(tL3) });
          if (ctx.l2) queue.push({ anchorIndex: i, level: 2, meta: { ...ctx }, totals: cloneTotals(tL2) });
          if (ctx.l1) queue.push({ anchorIndex: i, level: 1, meta: { ...ctx }, totals: cloneTotals(tL1) });

          // Reset and set ctx
          resetTotals(tL1); resetTotals(tL2); resetTotals(tL3);
          ctx.l1 = getGroupLabel($tr);
          ctx.l2 = '';
          ctx.l3 = '';
          return;
        }

        if ($tr.hasClass('kn-group-level-2')) {
          // Close out L3 and L2 before new L2
          if (ctx.l3) queue.push({ anchorIndex: i, level: 3, meta: { ...ctx }, totals: cloneTotals(tL3) });
          if (ctx.l2) queue.push({ anchorIndex: i, level: 2, meta: { ...ctx }, totals: cloneTotals(tL2) });

          resetTotals(tL2); resetTotals(tL3);
          ctx.l2 = getGroupLabel($tr);
          ctx.l3 = '';
          return;
        }

        if ($tr.hasClass('kn-group-level-3')) {
          // Close out L3 before new L3
          if (ctx.l3) queue.push({ anchorIndex: i, level: 3, meta: { ...ctx }, totals: cloneTotals(tL3) });

          resetTotals(tL3);
          ctx.l3 = getGroupLabel($tr);
          return;
        }

        // level 4 is descriptive grouping; totals still come from record rows
        return;
      }

      // Record row (should have id in Knack)
      if ($tr.attr('id')) {
        const v = getRowValues($tr);
        addToTotals(tL1, v);
        addToTotals(tL2, v);
        addToTotals(tL3, v);
      }
    });

    // Close out at end of table
    const endIndex = $rows.length;
    if (ctx.l3) queue.push({ anchorIndex: endIndex, level: 3, meta: { ...ctx }, totals: cloneTotals(tL3) });
    if (ctx.l2) queue.push({ anchorIndex: endIndex, level: 2, meta: { ...ctx }, totals: cloneTotals(tL2) });
    if (ctx.l1) queue.push({ anchorIndex: endIndex, level: 1, meta: { ...ctx }, totals: cloneTotals(tL1) });

    // Insert bottom-up, but enforce your “L2 before L1 at same anchor” rule.
    // Bottom-up insertion requires stable ordering at same anchor.
    // We’ll sort by anchorIndex DESC, then by level ASC for same anchor (2 before 1 because 2 < 1? No.)
    // You want Level-2 inserted before Level-1 at same anchor: that means Level-2 row should appear ABOVE Level-1 row.
    // When inserting before the same anchor, inserting Level-1 first then Level-2 would put Level-2 above it (since both inserted before anchor).
    // But we are inserting bottom-up; easiest: sort by anchorIndex DESC, then by level DESC so L1 inserts first, then L2, then L3.
    queue.sort((a, b) => {
      if (a.anchorIndex !== b.anchorIndex) return b.anchorIndex - a.anchorIndex;
      return b.level - a.level; // L1(1) inserted last? Actually higher first: 3,2,1. We want 1 first so that 2 ends up above it. So reverse.
    });
    // Fix: For same anchorIndex, insert L1 first, then L2, then L3 (so smaller level first).
    queue.sort((a, b) => {
      if (a.anchorIndex !== b.anchorIndex) return b.anchorIndex - a.anchorIndex;
      return a.level - b.level;
    });

    // Insert before row at anchorIndex; if anchorIndex == end, append.
    queue.forEach(item => {
      const $subtotal = makeSubtotalRow(item.level, item.meta, item.totals, colCount);
      const $anchor = $rows.eq(item.anchorIndex);
      if ($anchor.length) $anchor.before($subtotal);
      else $tbody.append($subtotal);
    });
  }

  // ============================================================
  // APPLY ALL
  // ============================================================
  function applyAll(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) return;

    ensureCss();

    // 1) sanitize descriptions (keeps your <b> rendering stable)
    sanitizeAllDescriptions($view);

    // 2) structural patches (non-destructive)
    hideBlankLevel3Headers($view);
    applyAssumptionsHook($view);
    hideDuplicateRecordsAfterL4($view);

    // 3) camera drop concat for L4 rows within “Camera or Reader”
    applyCameraDropConcat($view);

    // 4) totals/subtotals
    computeAndInsertSubtotals($view);
  }

  function sceneAllowed(sceneKey) {
    if (!SCENE_IDS || !SCENE_IDS.length) return true;
    return !!sceneKey && SCENE_IDS.includes(sceneKey);
  }

  // ============================================================
  // EVENTS
  // ============================================================
  $(document)
    .off('knack-scene-render' + EVENT_NS)
    .on('knack-scene-render' + EVENT_NS, function (event, scene) {
      if (!sceneAllowed(scene && scene.key)) return;

      // no-op; kept if you later want scene-level initialization
    });

  $(document)
    .off('knack-view-render' + EVENT_NS)
    .on('knack-view-render' + EVENT_NS, function (event, view) {
      if (!view || !VIEW_IDS.includes(view.key)) return;

      // Allow DOM to settle (Knack + KTL often mutates after initial render)
      requestAnimationFrame(function () {
        setTimeout(function () {
          applyAll(view.key);
        }, 0);
      });
    });

})();
/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const SCENE_IDS = ['scene_1085']; // add more scenes as needed
  const EVENT_NS = '.scwGroupCollapse';

  const COLLAPSED_BY_DEFAULT = true;
  const PERSIST_STATE = true;

  // ======================
  // STATE (localStorage)
  // ======================
  function storageKey(sceneId, viewId) {
    return `scw:collapse:${sceneId}:${viewId}`;
  }
  function loadState(sceneId, viewId) {
    if (!PERSIST_STATE) return {};
    try {
      return JSON.parse(localStorage.getItem(storageKey(sceneId, viewId)) || '{}');
    } catch {
      return {};
    }
  }
  function saveState(sceneId, viewId, state) {
    if (!PERSIST_STATE) return;
    try {
      localStorage.setItem(storageKey(sceneId, viewId), JSON.stringify(state));
    } catch {}
  }

  // ======================
  // CSS (ONCE, SCENE-SCOPED)
  // ======================
  function injectCssOnce() {
    const id = 'scw-group-collapse-css';
    if (document.getElementById(id)) return;

    const sceneScopes = (SCENE_IDS || [])
      .map((s) => `#kn-${s}`)
      .join(', ');
    const S = sceneScopes || '';

    const L1 = {
      fontSize: '16px',
      fontWeight: '600',
      bg: '#07467c',
      color: '#ffffff',
      tdPadding: '10px 14px',
      collapsedOpacity: '0.92',
      textalign: 'left',
    };

    const L2 = {
      fontSize: '14px',
      fontWeight: '600',
      bg: '#f3f8ff',
      color: '#07467c',
      tdPadding: '10px 14px 10px 26px',
      collapsedOpacity: '0.90',
    };

    const css = `
      ${S} .scw-group-collapse-enabled tr.scw-group-header {
        cursor: pointer;
        user-select: none;
      }

      ${S} .scw-group-collapse-enabled tr.scw-group-header .scw-collapse-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.25em;
        height: 1.25em;
        margin-right: .5em;
        font-weight: 900;
        line-height: 1;
        vertical-align: middle;
        transform-origin: 50% 55%;
        transition: transform 160ms ease, opacity 160ms ease;
        opacity: .95;
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header.scw-collapsed .scw-collapse-icon {
        transform: rotate(0deg);
        opacity: .9;
      }

      ${S} .scw-group-collapse-enabled tr.scw-group-header > td {
        position: relative;
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header > td:before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 6px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 160ms ease;
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header:hover > td:before {
        opacity: 1;
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header:focus-within > td:before {
        opacity: 1;
        outline: 2px solid rgba(7,70,124,.28);
        outline-offset: -2px;
      }

      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header {
        font-size: ${L1.fontSize};
        font-weight: ${L1.fontWeight} !important;
        background-color: ${L1.bg} !important;
        color: ${L1.color} !important;
        text-align: ${L1.textalign} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td {
        padding: ${L1.tdPadding} !important;
        border-bottom: 1px solid rgba(255,255,255,.14);
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td:before {
        box-shadow: 0 1px 0 rgba(255,255,255,.10) inset, 0 1px 10px rgba(0,0,0,.10);
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed {
        opacity: ${L1.collapsedOpacity};
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td,
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td * {
        color: ${L1.color} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:hover {
        filter: brightness(1.06);
      }

      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header {
        font-size: ${L2.fontSize};
        font-weight: ${L2.fontWeight} !important;
        background-color: ${L2.bg} !important;
        color: ${L2.color} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td {
        padding: ${L2.tdPadding} !important;
        border-bottom: 1px solid rgba(7,70,124,.12);
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td:after {
        content: "";
        position: absolute;
        left: 12px;
        top: 8px;
        bottom: 8px;
        width: 3px;
        border-radius: 2px;
        background: rgba(7,70,124,.28);
        pointer-events: none;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed {
        opacity: ${L2.collapsedOpacity};
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td,
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td * {
        color: ${L2.color} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:hover {
        filter: brightness(0.985);
      }

      /* KTL arrows: collapsed (.ktlUp) => DOWN; open (.ktlDown) => RIGHT */
      ${S} span.ktlArrow[id^="hideShow_view_"][id$="_arrow"] {
        display: inline-block;
        transition: transform 160ms ease, opacity 160ms ease;
        transform-origin: 50% 50%;
      }
      ${S} span.ktlArrow[id^="hideShow_view_"][id$="_arrow"].ktlUp {
        transform: rotate(-90deg);
        opacity: .95;
      }
      ${S} span.ktlArrow[id^="hideShow_view_"][id$="_arrow"].ktlDown {
        transform: rotate(180deg);
        opacity: 1;
      }
    `;

    const style = document.createElement('style');
    style.id = id;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ======================
  // GROUP ROW HELPERS
  // ======================
  const GROUP_ROW_SEL =
    'tr.kn-table-group.kn-group-level-1, tr.kn-table-group.kn-group-level-2';

  function getGroupLevel($tr) {
    return $tr.hasClass('kn-group-level-2') ? 2 : 1;
  }

  function ensureIcon($tr) {
    const $cell = $tr.children('td,th').first();
    if (!$cell.find('.scw-collapse-icon').length) {
      $cell.prepend('<span class="scw-collapse-icon" aria-hidden="true">▼</span>');
    }
  }

  function getRowLabelText($tr) {
    return $tr
      .clone()
      .find('.scw-collapse-icon')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getParentLevel1Label($tr) {
    const $l1 = $tr.prevAll('tr.kn-table-group.kn-group-level-1').first();
    return $l1.length ? getRowLabelText($l1) : '';
  }

  function buildKey($tr, level) {
    const label = getRowLabelText($tr);
    if (level === 2) {
      const parent = getParentLevel1Label($tr);
      return `L2:${parent}::${label}`;
    }
    return `L1:${label}`;
  }

  function rowsUntilNextRelevantGroup($headerRow) {
    const isLevel2 = $headerRow.hasClass('kn-group-level-2');
    let $rows = $();

    $headerRow.nextAll('tr').each(function () {
      const $tr = $(this);

      if (isLevel2) {
        if ($tr.hasClass('kn-table-group')) return false;
        $rows = $rows.add($tr);
        return;
      }

      if ($tr.hasClass('kn-group-level-1')) return false;
      $rows = $rows.add($tr);
    });

    return $rows;
  }

  function restoreLevel2StatesUnderLevel1($level1Header) {
    rowsUntilNextRelevantGroup($level1Header)
      .filter('tr.kn-table-group.kn-group-level-2.scw-group-header')
      .each(function () {
        const $l2 = $(this);
        const collapsed = $l2.hasClass('scw-collapsed');
        rowsUntilNextRelevantGroup($l2).toggle(!collapsed);
      });
  }

  // NEW: when collapsing L1, force-collapse all child L2 headers and persist
  function collapseAllLevel2UnderLevel1($level1Header, sceneId, viewId, state) {
    rowsUntilNextRelevantGroup($level1Header)
      .filter('tr.kn-table-group.kn-group-level-2.scw-group-header')
      .each(function () {
        const $l2 = $(this);

        // force state + class
        $l2.addClass('scw-collapsed');
        $l2.find('.scw-collapse-icon').text('▶');

        // hide its detail rows (even though L1 is hiding everything, this keeps it consistent)
        rowsUntilNextRelevantGroup($l2).hide();

        // persist
        const key = buildKey($l2, 2);
        state[key] = 1;
      });
  }

  function setCollapsed($header, collapsed) {
    const isLevel2 = $header.hasClass('kn-group-level-2');

    $header.toggleClass('scw-collapsed', collapsed);
    $header.find('.scw-collapse-icon').text(collapsed ? '▶' : '▼');

    if (isLevel2) {
      rowsUntilNextRelevantGroup($header).toggle(!collapsed);
      return;
    }

    rowsUntilNextRelevantGroup($header).toggle(!collapsed);

    if (!collapsed) restoreLevel2StatesUnderLevel1($header);
  }

  // ======================
  // SCENE DETECTION
  // ======================
  function getCurrentSceneId() {
    const bodyId = $('body').attr('id');
    if (bodyId && bodyId.includes('scene_')) {
      const m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    const $fallback = $('[id*="scene_"]').filter(':visible').first();
    if ($fallback.length) {
      const m = ($fallback.attr('id') || '').match(/scene_\d+/);
      if (m) return m[0];
    }
    return null;
  }

  function isEnabledScene(sceneId) {
    return !!sceneId && SCENE_IDS.includes(sceneId);
  }

  // ======================
  // ENHANCE GRIDS
  // ======================
  function enhanceAllGroupedGrids(sceneId) {
    if (!isEnabledScene(sceneId)) return;

    const $sceneRoot = $(`#kn-${sceneId}`);
    if (!$sceneRoot.length) return;

    $sceneRoot.find(GROUP_ROW_SEL).each(function () {
      const $tr = $(this);
      const $view = $tr.closest('.kn-view[id^="view_"]');
      const viewId = $view.attr('id') || 'unknown_view';

      $view.addClass('scw-group-collapse-enabled');

      const state = loadState(sceneId, viewId);

      $tr.addClass('scw-group-header');
      ensureIcon($tr);

      const level = getGroupLevel($tr);
      const key = buildKey($tr, level);
      const shouldCollapse = key in state ? !!state[key] : COLLAPSED_BY_DEFAULT;

      setCollapsed($tr, shouldCollapse);
    });
  }

  // ======================
  // CLICK HANDLER
  // ======================
  function bindClicksOnce() {
    $(document)
      .off('click' + EVENT_NS, GROUP_ROW_SEL)
      .on('click' + EVENT_NS, GROUP_ROW_SEL, function (e) {
        if ($(e.target).closest('a,button,input,select,textarea,label').length) return;

        const sceneId = getCurrentSceneId();
        if (!isEnabledScene(sceneId)) return;

        const $tr = $(this);
        if (!$tr.closest(`#kn-${sceneId}`).length) return;

        const $view = $tr.closest('.kn-view[id^="view_"]');
        const viewId = $view.attr('id') || 'unknown_view';

        $view.addClass('scw-group-collapse-enabled');

        $tr.addClass('scw-group-header');
        ensureIcon($tr);

        const level = getGroupLevel($tr);
        const key = buildKey($tr, level);

        const state = loadState(sceneId, viewId);
        const collapseNow = !$tr.hasClass('scw-collapsed');

        // apply collapse/expand
        setCollapsed($tr, collapseNow);

        // NEW: if this was an L1 collapse, also collapse all nested L2 groups + persist
        if (level === 1 && collapseNow) {
          collapseAllLevel2UnderLevel1($tr, sceneId, viewId, state);
        }

        state[key] = collapseNow ? 1 : 0;
        saveState(sceneId, viewId, state);
      });
  }

  // ======================
  // MUTATION OBSERVER
  // ======================
  const observerByScene = {};

  function startObserverForScene(sceneId) {
    if (!isEnabledScene(sceneId) || observerByScene[sceneId]) return;

    let raf = 0;
    const obs = new MutationObserver(() => {
      const current = getCurrentSceneId();
      if (!isEnabledScene(current)) return;
      if (current !== sceneId) return;

      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => enhanceAllGroupedGrids(sceneId));
    });

    obs.observe(document.body, { childList: true, subtree: true });
    observerByScene[sceneId] = obs;
  }

  // ======================
  // INIT
  // ======================
  injectCssOnce();
  bindClicksOnce();

  SCENE_IDS.forEach((sceneId) => {
    $(document)
      .off(`knack-scene-render.${sceneId}${EVENT_NS}`)
      .on(`knack-scene-render.${sceneId}${EVENT_NS}`, function () {
        enhanceAllGroupedGrids(sceneId);
        startObserverForScene(sceneId);
      });
  });

  const initialScene = getCurrentSceneId();
  if (isEnabledScene(initialScene)) {
    enhanceAllGroupedGrids(initialScene);
    startObserverForScene(initialScene);
  }
})();
/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3329']; // add more views
  const BUCKET_FIELD_KEY = 'field_2223';
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID = 'scw-bucket-visibility-css';

  // Readable mapping
  const BUCKET_RULES_HUMAN = {
    //cameras or readers
    '6481e5ba38f283002898113c': [
      ['field_2182', 'REL_scope of work'],
      ['field_2211', 'REL_mdf-idf_mandatory single select'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2193', 'REL_products_cameras+cabling'],
      ['field_2206', 'REL_product accessories'],
      ['field_2241', 'INPUT_DROP: Pre-fix'],
      ['field_2184', 'INPUT_DROP: label number'],
      ['field_2186', 'INPUT_DROP: mount_cable_both'],
      ['field_2246', 'REL_unified product field'],
      ['field_2187', 'INPUT_DROP: variables'],
    ],
    //networking or headend
    '647953bb54b4e1002931ed97': [
      ['field_2182', 'REL_scope of work'],
      ['field_2180', 'REL_mdf-idf_mandatory multi select'],
      ['field_2194', 'REL_products_for networking'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2246', 'REL_unified product field'],
      ['field_2206', 'REL_product accessories'],
    ],
    //other equipment
    '5df12ce036f91b0015404d78': [
      ['field_2182', 'REL_scope of work'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2195', 'REL_products_for other equipment'],
      ['field_2246', 'REL_unified product field'],
      ['field_2183', 'INPUT_product quantity'],
    ],
    //service
    '6977caa7f246edf67b52cbcd': [
      ['field_2182', 'REL_scope of work'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2233', 'INPUT_exepcted sub bid #'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2210', 'INPUT_service description'],
    ],
    //assumptions
    '697b7a023a31502ec68b3303': [
      ['field_2182', 'REL_scope of work'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2248', 'REL_products for assumptions'],
    ],
    //licenses
    '645554dce6f3a60028362a6a': [
      ['field_2182', 'REL_scope of work'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2224', 'REL_products for licenses'],
    ],
  };

  const ALL_FIELD_KEYS = [
    'field_2182','field_2180','field_2188','field_2193','field_2194','field_2183','field_2210','field_2224','field_2248','field_2250',
    'field_2206','field_2195','field_2241','field_2184','field_2186','field_2187','field_2204', 'field_2211','field_2233','field_2246',
  ];

  function compileRules(human) {
    const out = {};
    Object.keys(human || {}).forEach((bucket) => {
      out[bucket] = (human[bucket] || [])
        .map((x) => (Array.isArray(x) ? x[0] : x))
        .filter(Boolean);
    });
    return out;
  }
  const BUCKET_RULES = compileRules(BUCKET_RULES_HUMAN);

  // ============================================================
  // ✅ EARLY CSS: inject immediately so there’s no initial “flash”
  // ============================================================
  function injectGlobalCssOnce() {
    let el = document.getElementById(CSS_ID);
    if (el) return;

    el = document.createElement('style');
    el.id = CSS_ID;

    // Hide all fields inside the target views immediately.
    // Then only show ones marked scw-visible, plus the bucket input failsafe.
    const blocks = VIEW_IDS.map((viewId) => `
#${viewId} .kn-input { display: none !important; }
#${viewId} .kn-input.scw-visible { display: block !important; }
#${viewId} #kn-input-${BUCKET_FIELD_KEY} { display: block !important; } /* bucket always visible */
    `.trim()).join('\n\n');

    el.appendChild(document.createTextNode('\n' + blocks + '\n'));
    document.head.appendChild(el);
  }

  // Run ASAP (before Knack paints the view)
  injectGlobalCssOnce();

  // ======================
  // DOM helpers
  // ======================
  function $wrapForKeyWithinScope($scope, key) {
    let $w = $scope.find('#kn-input-' + key);
    if ($w.length) return $w;

    $w = $scope.find('.kn-input[data-input-id="' + key + '"]');
    if ($w.length) return $w;

    return $();
  }

  function hideField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.removeClass('scw-visible');
  }

  function showField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.addClass('scw-visible');
  }

  function hideAllExceptBucket($scope) {
    ALL_FIELD_KEYS.forEach((k) => {
      if (k === BUCKET_FIELD_KEY) return;
      hideField($scope, k);
    });
    showField($scope, BUCKET_FIELD_KEY);
  }

  function findBucketSelectInScope($scope, viewId) {
    let $sel = $scope.find('#' + viewId + '-' + BUCKET_FIELD_KEY);
    if ($sel.length) return $sel;
    return $scope.find('select[name="' + BUCKET_FIELD_KEY + '"]');
  }

  function getBucketValue($scope, viewId) {
    const $sel = findBucketSelectInScope($scope, viewId);
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, viewId) {
    const bucketValue = getBucketValue($scope, viewId);

    hideAllExceptBucket($scope);
    if (!bucketValue) return;

    (BUCKET_RULES[bucketValue] || []).forEach((k) => showField($scope, k));
  }

  // ======================
  // Binding strategy
  // ======================
  function bindDelegatedChange(viewId) {
    const sel = `#${viewId} select[name="${BUCKET_FIELD_KEY}"], #${viewId} #${viewId}-${BUCKET_FIELD_KEY}`;

    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $bucketWrap = $(this).closest('.kn-input');
        const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
          ? $bucketWrap.closest('form, .kn-form, .kn-view')
          : $('#' + viewId);

        applyRules($scope, viewId);
      });
  }

  function initView(viewId) {
    bindDelegatedChange(viewId);

    const $view = $('#' + viewId);
    const $bucketWrap = $view.find('#kn-input-' + BUCKET_FIELD_KEY);
    const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
      ? $bucketWrap.closest('form, .kn-form, .kn-view')
      : $view;

    applyRules($scope, viewId);
  }

  VIEW_IDS.forEach((viewId) => {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        initView(viewId);
      });
  });
})();

////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////


////************* HIGHLIGHT DUPLICATE CELLS view_3313 - BUILD SOW PAGE  ***************//////


$(document).on('knack-view-render.view_3313', function () {

  const FIELD_KEY = 'field_1950';
  const DUP_BG = '#ffe2e2'; // light red highlight

  const valueMap = {};

  // Gather values from the column
  $('#view_3313 td.' + FIELD_KEY).each(function () {
    const value = $(this).text().trim();

    if (!value) return;

    if (!valueMap[value]) {
      valueMap[value] = [];
    }

    valueMap[value].push(this);
  });

  // Highlight duplicates
  Object.keys(valueMap).forEach(value => {
    if (valueMap[value].length > 1) {
      valueMap[value].forEach(cell => {
        $(cell).css({
          'background-color': DUP_BG,
          'font-weight': '600'
        });
      });
    }
  });

});
////************* HIGHLIGHT DUPLICATE CELLS view_3313 - BUILD SOW PAGE  ***************//////
/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE **************************/

// Replace *whatever* is rendered in field_1946 cells with an icon
// Runs on multiple grid views

(function () {
  const VIEW_IDS = [
    "view_3313",
    "view_3332"   // ← add the second view id here
  ];

  const FIELD_KEY = "field_1946";

  const ICON_HTML =
    '<i class="fa fa-solid fa-sort" aria-hidden="true" title="Changing Location" style="font-size:30px; vertical-align:middle;"></i>';

  // Inject CSS once (covers all target views)
  function injectCssOnce() {
    const id = "scw-field1946-icon-css";
    if (document.getElementById(id)) return;

    const selectors = VIEW_IDS
      .map(v => `#${v} td.${FIELD_KEY}`)
      .join(", ");

    const css = `
      ${selectors} {
        display: table-cell !important;
        text-align: center;
      }
    `;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  VIEW_IDS.forEach((VIEW_ID) => {
    SCW.onViewRender(VIEW_ID, function () {
      injectCssOnce();

      const $view = $("#" + VIEW_ID);
      if (!$view.length) return;

      $view.find(`table.kn-table tbody td.${FIELD_KEY}`).each(function () {
        const $cell = $(this);

        // idempotent
        if ($cell.data("scwReplacedWithIcon")) return;

        $cell.empty().append(ICON_HTML);
        $cell.data("scwReplacedWithIcon", true);
      });
    }, 'replace-content-with-icon');
  });
})();

/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE **************************/

/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 and view_3341 **************************/

(function () {
  const VIEW_IDS = ['view_3301', 'view_3341'];
  const LIMIT_VALUE = '1000';
  const EVENT_NS = '.scwLimit1000';

  VIEW_IDS.forEach((VIEW_ID) => {
    $(document)
      .off(`knack-view-render.${VIEW_ID}${EVENT_NS}`)
      .on(`knack-view-render.${VIEW_ID}${EVENT_NS}`, function () {
        const $view = $('#' + VIEW_ID);
        if (!$view.length) return;

        // Run-once guard per view instance
        if ($view.data('scwLimitSet')) return;
        $view.data('scwLimitSet', true);

        const $limit = $view.find('select[name="limit"]');
        if (!$limit.length) return;

        if ($limit.val() !== LIMIT_VALUE) {
          $limit.val(LIMIT_VALUE).trigger('change');
        }
      });
  });
})();


/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 **************************/
/***************************** DISABLE QUANTITY CELL ON DESIGNATED QUANTITY 1 ONLY LINE ITEM TYPES *******************************/
(function () {
  // ============================================================
  // SCW / Knack: Row-based cell locks (multi-view, multi-rule)
  // - Locks target cells on specific rows based on a detect field value
  // - Prevents inline edit by killing events in CAPTURE phase
  // - Adds per-rule message tooltip + optional “Locked” badge
  // - Avoids rewriting cell HTML (safe for REL/connection fields like field_1957)
  // ============================================================

  const EVENT_NS = ".scwRowLocks";

  // ============================================================
  // CONFIG
  // ============================================================
  const VIEWS = [
    {
      viewId: "view_3332",
      rules: [
        {
          detectFieldKey: "field_2230",      // qty limit boolean
          when: "yes",
          lockFieldKeys: ["field_1964"],     // lock qty
          message: "Qty locked (must be 1)"
        },
        {
          detectFieldKey: "field_2231",      // <-- was field_2232; field_2231 exists in your DOM
          when: "no",
          lockFieldKeys: ["field_1957"],     // lock map connections field
          message: "This field is locked until map connections = Yes"
        }
      ]
    },

    // Example for adding more views:
    // {
    //   viewId: "view_1953",
    //   rules: [
    //     { detectFieldKey: "field_2230", when: "yes", lockFieldKeys: ["field_1964"], message: "Qty locked" }
    //   ]
    // }
  ];

  // ============================================================
  // INTERNALS
  // ============================================================
  const LOCK_ATTR = "data-scw-locked";
  const LOCK_MSG_ATTR = "data-scw-locked-msg";
  const LOCK_CLASS = "scw-cell-locked";
  const ROW_CLASS = "scw-row-has-locks";

  function normText(s) {
    return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function readCellValue($cell) {
    return normText($cell.text());
  }

  function matchesWhen(cellVal, when) {
    if (typeof when === "function") return !!when(cellVal);
    if (when === true) return cellVal === "yes" || cellVal === "true" || cellVal === "1";
    if (when === false) return cellVal === "no" || cellVal === "false" || cellVal === "0" || cellVal === "";
    return cellVal === normText(String(when));
  }

  // Safer lock: do NOT replace the cell HTML (important for REL/connection fields)
  function lockTd($td, msg) {
    if (!$td || !$td.length) return;
    if ($td.attr(LOCK_ATTR) === "1") return;

    const m = (msg || "N/A").trim();

    $td
      .attr(LOCK_ATTR, "1")
      .attr(LOCK_MSG_ATTR, m)
      .addClass(LOCK_CLASS)
      .attr("title", m);

    // Remove common Knack/KTL inline-edit hooks
    $td.removeClass("cell-edit ktlInlineEditableCellsStyle");
    $td.find(".cell-edit, .ktlInlineEditableCellsStyle").removeClass("cell-edit ktlInlineEditableCellsStyle");

    // Belt-and-suspenders: if KTL uses pointer events, kill them in locked cells
    // (We also have capture-blocker below.)
  }

  function applyLocksForView(viewCfg) {
    const { viewId, rules } = viewCfg;
    const $view = $("#" + viewId);
    if (!$view.length) return;

    const $tbody = $view.find("table.kn-table-table tbody");
    if (!$tbody.length) return;

    $tbody.find("tr").each(function () {
      const $tr = $(this);

      // Skip group/header rows
      if ($tr.hasClass("kn-table-group") || $tr.hasClass("kn-table-group-container")) return;

      let rowLocked = false;

      rules.forEach((rule) => {
        const $detect = $tr.find(`td.${rule.detectFieldKey}`);
        if (!$detect.length) return;

        const cellVal = readCellValue($detect);
        if (!matchesWhen(cellVal, rule.when)) return;

        (rule.lockFieldKeys || []).forEach((fk) => {
          const $td = $tr.find(`td.${fk}`);
          if ($td.length) {
            lockTd($td, rule.message);
            rowLocked = true;
          }
        });
      });

      if (rowLocked) $tr.addClass(ROW_CLASS);
    });
  }

  function applyWithRetries(viewCfg, tries = 12) {
    let i = 0;
    (function tick() {
      i++;
      applyLocksForView(viewCfg);
      if (i < tries) setTimeout(tick, 250);
    })();
  }

  // Capture-phase event killer: blocks Knack’s delegated inline-edit before it runs
  function installCaptureBlockerOnce() {
    if (window.__scwRowLocksCaptureInstalled) return;
    window.__scwRowLocksCaptureInstalled = true;

    const kill = (e) => {
      const td = e.target.closest && e.target.closest(`td[${LOCK_ATTR}="1"]`);
      if (!td) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return false;
    };

    ["mousedown", "mouseup", "click", "dblclick", "touchstart", "keydown"].forEach((evt) => {
      document.addEventListener(evt, kill, true); // capture phase
    });
  }

  // MutationObserver per view: if KTL/Knack re-renders tbody, re-apply locks
  function installObserver(viewCfg) {
    const { viewId } = viewCfg;
    const $view = $("#" + viewId);
    if (!$view.length) return;

    if ($view.data("scwRowLocksObserver")) return;
    $view.data("scwRowLocksObserver", true);

    const el = $view.find("table.kn-table-table tbody").get(0);
    if (!el) return;

    const obs = new MutationObserver(() => applyLocksForView(viewCfg));
    obs.observe(el, { childList: true, subtree: true });
  }

  function bindTriggers(viewCfg) {
    const { viewId, rules } = viewCfg;

    const triggers = new Set();
    rules.forEach((r) => (r.triggerFieldKeys || []).forEach((k) => triggers.add(k)));
    if (triggers.size === 0) triggers.add("*");

    $(document)
      .off(`click${EVENT_NS}`, `#${viewId} td`)
      .on(`click${EVENT_NS}`, `#${viewId} td`, function () {
        const $td = $(this);
        const cls = ($td.attr("class") || "").split(/\s+/);

        const triggered = triggers.has("*") || cls.some((c) => triggers.has(c));
        if (!triggered) return;

        setTimeout(() => applyLocksForView(viewCfg), 50);
        setTimeout(() => applyLocksForView(viewCfg), 300);
      });
  }

  function injectLockCssOnce() {
    const id = "scw-row-locks-css";
    if (document.getElementById(id)) return;

    const css = `
      /* Locked look + no interaction */
      td.${LOCK_CLASS} {
        position: relative;
        cursor: not-allowed !important;
      }
      td.${LOCK_CLASS} * {
        cursor: not-allowed !important;
      }

      /* Hide any KTL inline-edit hover affordance inside locked cells */
      td.${LOCK_CLASS} .ktlInlineEditableCellsStyle,
      td.${LOCK_CLASS} .cell-edit {
        pointer-events: none !important;
      }

      /* Optional: add a small badge */
      td.${LOCK_CLASS}::after{
        content: "N/A";
        position: absolute;
        top: 2px;
        right: 4px;
        font-size: 10px;
        opacity: .7;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(0,0,0,.06);
      }

      td.scw-cell-locked {
        background-color: slategray;
      }

      /* Hide only the Knack-rendered value */
      td.field_1964.scw-cell-locked span[class^="col-"] {
         visibility: hidden;
      }


      /* Tooltip bubble using per-cell message */
      td.${LOCK_CLASS}:hover::before{
        content: attr(${LOCK_MSG_ATTR});
        position: absolute;
        bottom: 100%;
        left: 0;
        margin-bottom: 6px;
        max-width: 260px;
        white-space: normal;
        font-size: 12px;
        line-height: 1.2;
        padding: 6px 8px;
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,.15);
        background: #fff;
        color: #111;
        z-index: 999999;
      }
    `;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // INIT
  // ============================================================
  injectLockCssOnce();
  installCaptureBlockerOnce();

  VIEWS.forEach((viewCfg) => {
    const viewId = viewCfg.viewId;

    $(document)
      .off(`knack-view-render.${viewId}${EVENT_NS}`)
      .on(`knack-view-render.${viewId}${EVENT_NS}`, function () {
        applyWithRetries(viewCfg);
        installObserver(viewCfg);
        bindTriggers(viewCfg);
      });
  });
})();

/***************************** DISABLE QUANTITY CELL ON DESIGNATED QUANTITY 1 ONLY LINE ITEM TYPES *******************************/
/*************  // view_3332 - truncate field_1949 with click-to-expand **************************/

// view_3332 - truncate field_1949 with click-to-expand
(function () {
  const VIEW_ID = 'view_3332';
  const FIELD_CLASS = 'field_1949';
  const MAX = 25;

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function applyTruncate(viewEl) {
    const cells = viewEl.querySelectorAll(`td.${FIELD_CLASS}`);
    cells.forEach((td) => {
      // Avoid double-processing on re-render/pagination
      if (td.dataset.scwTruncated === '1') return;

      const full = (td.textContent || '').trim();
      if (!full) return;

      // If short already, leave it
      if (full.length <= MAX) {
        td.dataset.scwTruncated = '1';
        return;
      }

      const preview = full.slice(0, MAX);

      td.dataset.scwTruncated = '1';
      td.dataset.scwFull = full;
      td.dataset.scwPreview = preview;
      td.dataset.scwExpanded = '0';

      td.innerHTML = `
        <a href="#" class="scw-trunc-toggle" style="text-decoration: underline;">
          <span class="scw-trunc-text">${escapeHtml(preview)}…</span>
        </a>
      `;
    });
  }

  // On view render, truncate
  $(document).on(`knack-view-render.${VIEW_ID}`, function (e, view) {
    const viewEl = document.getElementById(VIEW_ID);
    if (!viewEl) return;
    applyTruncate(viewEl);
  });

  // Delegate click handler (works after pagination/filter refresh)
  $(document).on('click', `#${VIEW_ID} td.${FIELD_CLASS} .scw-trunc-toggle`, function (e) {
    e.preventDefault();

    const td = this.closest(`td.${FIELD_CLASS}`);
    if (!td) return;

    const expanded = td.dataset.scwExpanded === '1';
    const nextText = expanded ? (td.dataset.scwPreview + '…') : td.dataset.scwFull;

    td.dataset.scwExpanded = expanded ? '0' : '1';

    // Keep it clickable for toggling back
    this.querySelector('.scw-trunc-text').textContent = nextText;
  });
})();


/*************  // view_3332 - truncate field_1949 with click-to-expand **************************/


/***************************** SURVEY / PROJECT FORM - network device mapping *******************/
/* testing*/

const checkboxStateByView = {};

function enableCheckboxSelectSync({ viewId, selectFieldId }) {
  checkboxStateByView[viewId] = checkboxStateByView[viewId] || [];

  $(document).on(`knack-view-render.${viewId}`, function () {
    console.log(`✅ View ${viewId} rendered`);

    const $selectInput = $(`#${viewId}-${selectFieldId}`);
    if (!$selectInput.length) {
      console.error(`❌ Select input not found in ${viewId}`);
      return;
    }

    // ✅ Force open to trigger Knack to populate options
    $selectInput.trigger('focus').trigger('mousedown');

    // ✅ MutationObserver for normal (multi-option) cases
    const observer = new MutationObserver(() => {
      const options = $selectInput.find('option');
      if (options.length === 0) return;

      console.log(`📋 ${options.length} options detected in ${viewId}`);
      syncSelectedToCheckboxState(options, viewId);
      observer.disconnect();
      renderCheckboxes();
      bindCheckboxListeners();
    });

    observer.observe($selectInput[0], { childList: true, subtree: true });

    // ✅ Fallback polling in case only one quote and Knack injects slowly
    const fallbackPoll = setInterval(() => {
      const options = $selectInput.find('option');
      if (options.length > 0) {
        clearInterval(fallbackPoll);
        console.log(`⏳ Fallback: camera options detected in ${viewId}`);
        syncSelectedToCheckboxState(options, viewId);
        renderCheckboxes();
        bindCheckboxListeners();
      }
    }, 100);

    // ✅ Handle quote field change (clear + wait for new camera list)
    $(document).off(`change.quote-${viewId}`);
    $(document).on(`change.quote-${viewId}`, `#${viewId}-field_1864`, function () {
      console.log(`🔁 Quote field changed in ${viewId}`);

      $(`#custom-checkboxes-${viewId} input[type="checkbox"]:checked`).each(function () {
        const val = $(this).val();
        const label = $(this).parent().text().trim();
        if (!checkboxStateByView[viewId].some(o => o.value === val)) {
          checkboxStateByView[viewId].push({ value: val, label });
        }
      });

      const reobserve = new MutationObserver(() => {
        const options = $selectInput.find('option');
        if (options.length === 0) return;

        reobserve.disconnect();
        renderCheckboxes();
        bindCheckboxListeners();
      });

      $selectInput.trigger('focus').trigger('mousedown');
      reobserve.observe($selectInput[0], { childList: true, subtree: true });
    });

    function syncSelectedToCheckboxState(options, viewId) {
      options.filter(':selected').each(function () {
        const val = $(this).val();
        const label = $(this).text();
        if (!checkboxStateByView[viewId].some(o => o.value === val)) {
          checkboxStateByView[viewId].push({ value: val, label });
        }
      });
    }

    function renderCheckboxes() {
      const $chosen = $selectInput.siblings('.chzn-container');
      if ($chosen.length) $chosen.hide();

      $(`#custom-checkboxes-${viewId}`).remove();

      $selectInput.find('option').prop('selected', false);
      checkboxStateByView[viewId].forEach(({ value }) => {
        $selectInput.find(`option[value="${value}"]`).prop('selected', true);
      });
      $selectInput.trigger('change').trigger('chosen:updated');

      let html = `<div id="custom-checkboxes-${viewId}" style="margin-top:10px;">`;
      const seen = {};

      checkboxStateByView[viewId].forEach(({ value, label }) => {
        html += `<label style="display:block;margin:5px 0;">
                   <input type="checkbox" value="${value}" checked> ${label}
                 </label>`;
        seen[value] = true;
      });

      $selectInput.find('option').each(function () {
        const val = $(this).val();
        const label = $(this).text();
        if (!seen[val]) {
          html += `<label style="display:block;margin:5px 0;">
                     <input type="checkbox" value="${val}"> ${label}
                   </label>`;
        }
      });

      html += '</div>';
      $selectInput.after(html);
    }

    function bindCheckboxListeners() {
      $(document).off(`change.checkbox-${viewId}`);
      $(document).on(`change.checkbox-${viewId}`, `#custom-checkboxes-${viewId} input[type="checkbox"]`, function () {
        $selectInput.find('option').prop('selected', false);
        checkboxStateByView[viewId] = [];

        $(`#custom-checkboxes-${viewId} input[type="checkbox"]:checked`).each(function () {
          const val = $(this).val();
          const label = $(this).parent().text().trim();
          checkboxStateByView[viewId].push({ value: val, label });
          $selectInput.find(`option[value="${val}"]`).prop('selected', true);
        });

        $selectInput.trigger('change').trigger('chosen:updated');
      });
    }
  });
}

// ✅ Activate for each view
enableCheckboxSelectSync({
  viewId: 'view_2688',
  selectFieldId: 'field_1656'
});

enableCheckboxSelectSync({
  viewId: 'view_2697',
  selectFieldId: 'field_1656'
});

/*




/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: NO WATTBOX SECTION *******************/

// Working version + Different message for each situation 🎯

$(document).on('knack-view-render.view_3094', function(event, view, data) {
  console.log('✅ View 3094 loaded');

  const uploadFields = ['field_1808_upload', 'field_1809_upload'];

  uploadFields.forEach(function(inputFieldId) {
    const $uploadWrapper = $('#' + inputFieldId).parent('.kn-file-upload');
    const $fileInput = $('#' + inputFieldId);

    let existingFilename = '';

    if ($uploadWrapper.length && $fileInput.length) {
      console.log('🔎 Upload wrapper exists for', inputFieldId);

      // Style wrapper
      $uploadWrapper.css({
        position: 'relative',
        width: '100%',
        height: '150px',
        minHeight: '150px',
        backgroundColor: 'rgba(255, 0, 0, 0.2)', // Default RED
        transition: 'background-color 0.5s ease'
      });

      $fileInput.css({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
        zIndex: 2
      });

      // Add overlay (only once)
      if ($uploadWrapper.find('.upload-message').length === 0) {
        $uploadWrapper.append(`
          <div class="upload-message" style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px dashed #1890ff;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            color: #1890ff;
            text-align: center;
            pointer-events: none;
            z-index: 1;
          ">
            📂 Drop your file here or click to upload
          </div>
        `);
      }

      function getFilenameFromAsset(assetElement) {
        if (!assetElement) return '';
        const link = assetElement.querySelector('a');
        if (link) {
          return link.innerText.trim();
        } else {
          return assetElement.innerText.replace(/remove/i, '').trim();
        }
      }

      function setUploadMessage(currentFilename, newFilename = '', mode = 'normal') {
        const $message = $uploadWrapper.find('.upload-message');

        if (mode === 'uploading-new') {
          // Uploading a file where none existed
          $message.html(`
            <div style="padding: 20px;">
              📂 Please click UPDATE to upload this file:<br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (mode === 'uploading-replacement') {
          // Replacing an existing file
          $message.html(`
            <div style="padding: 20px;">
              ♻️ Click UPDATE to replace <br><strong>${currentFilename}</strong><br> with <br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (currentFilename) {
          // File already uploaded
          $message.html(`
            <div style="padding: 20px;">
              📄 Good Job!
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(0, 128, 0, 0.2)'); // GREEN
        } else {
          // Default state (no file)
          $message.html(`📂 Drop your file here or click to upload`);
          $uploadWrapper.css('background-color', 'rgba(255, 0, 0, 0.2)'); // RED
        }
      }

      function hideAssetCurrent() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        if (assetCurrentNow) {
          $(assetCurrentNow).hide();
        }
      }

      function checkExistingUpload() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        const filename = getFilenameFromAsset(assetCurrentNow);

        console.log('📦 Existing upload detected for', inputFieldId, ':', filename);

        if (filename) {
          existingFilename = filename;
          setUploadMessage(existingFilename);
        } else {
          setUploadMessage('');
        }

        hideAssetCurrent();
      }

      checkExistingUpload();

      // MutationObserver for each upload field
      const observeTarget = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
      if (observeTarget) {
        const observer = new MutationObserver(function(mutationsList, observer) {
          for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              console.log('🛰️ Upload updated for', inputFieldId);

              const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
              const filename = getFilenameFromAsset(assetCurrentNow);

              console.log('🛰️ Found filename:', filename);

              if (filename) {
                if (existingFilename && filename !== existingFilename) {
                  // Replacing an existing file
                  setUploadMessage(existingFilename, filename, 'uploading-replacement');
                } else if (!existingFilename) {
                  // Uploading a new file where there was none
                  setUploadMessage('', filename, 'uploading-new');
                } else {
                  // No change
                  existingFilename = filename;
                  setUploadMessage(filename);
                }
              } else {
                setUploadMessage('', '', 'empty');
              }

              hideAssetCurrent();
            }
          }
        });

        observer.observe(observeTarget, { childList: true, subtree: true });
        console.log('🔭 Observer initialized for', inputFieldId);
      } else {
        console.log('🚫 No observer target for', inputFieldId);
      }

    } else {
      console.log('🚫 Upload wrapper or input not found for', inputFieldId);
    }
  });

});


/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: NO WATTBOX SECTION *******************/




/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: YES WATTBOX SECTION *******************/

// Working version + Different message for each situation 🎯

$(document).on('knack-view-render.view_3297', function(event, view, data) {
  console.log('✅ View 3297 loaded');

  const uploadFields = ['field_1808_upload', 'field_1809_upload', 'field_1930_upload'];

  uploadFields.forEach(function(inputFieldId) {
    const $uploadWrapper = $('#' + inputFieldId).parent('.kn-file-upload');
    const $fileInput = $('#' + inputFieldId);

    let existingFilename = '';

    if ($uploadWrapper.length && $fileInput.length) {
      console.log('🔎 Upload wrapper exists for', inputFieldId);

      // Style wrapper
      $uploadWrapper.css({
        position: 'relative',
        width: '100%',
        height: '150px',
        minHeight: '150px',
        backgroundColor: 'rgba(255, 0, 0, 0.2)', // Default RED
        transition: 'background-color 0.5s ease'
      });

      $fileInput.css({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
        zIndex: 2
      });

      // Add overlay (only once)
      if ($uploadWrapper.find('.upload-message').length === 0) {
        $uploadWrapper.append(`
          <div class="upload-message" style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px dashed #1890ff;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            color: #1890ff;
            text-align: center;
            pointer-events: none;
            z-index: 1;
          ">
            📂 Drop your file here or click to upload
          </div>
        `);
      }

      function getFilenameFromAsset(assetElement) {
        if (!assetElement) return '';
        const link = assetElement.querySelector('a');
        if (link) {
          return link.innerText.trim();
        } else {
          return assetElement.innerText.replace(/remove/i, '').trim();
        }
      }

      function setUploadMessage(currentFilename, newFilename = '', mode = 'normal') {
        const $message = $uploadWrapper.find('.upload-message');

        if (mode === 'uploading-new') {
          // Uploading a file where none existed
          $message.html(`
            <div style="padding: 20px;">
              📂 Please click UPDATE to upload this file:<br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (mode === 'uploading-replacement') {
          // Replacing an existing file
          $message.html(`
            <div style="padding: 20px;">
              ♻️ Click UPDATE to replace <br><strong>${currentFilename}</strong><br> with <br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (currentFilename) {
          // File already uploaded
          $message.html(`
            <div style="padding: 20px;">
              📄 Good Job!
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(0, 128, 0, 0.2)'); // GREEN
        } else {
          // Default state (no file)
          $message.html(`📂 Drop your file here or click to upload`);
          $uploadWrapper.css('background-color', 'rgba(255, 0, 0, 0.2)'); // RED
        }
      }

      function hideAssetCurrent() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        if (assetCurrentNow) {
          $(assetCurrentNow).hide();
        }
      }

      function checkExistingUpload() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        const filename = getFilenameFromAsset(assetCurrentNow);

        console.log('📦 Existing upload detected for', inputFieldId, ':', filename);

        if (filename) {
          existingFilename = filename;
          setUploadMessage(existingFilename);
        } else {
          setUploadMessage('');
        }

        hideAssetCurrent();
      }

      checkExistingUpload();

      // MutationObserver for each upload field
      const observeTarget = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
      if (observeTarget) {
        const observer = new MutationObserver(function(mutationsList, observer) {
          for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              console.log('🛰️ Upload updated for', inputFieldId);

              const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
              const filename = getFilenameFromAsset(assetCurrentNow);

              console.log('🛰️ Found filename:', filename);

              if (filename) {
                if (existingFilename && filename !== existingFilename) {
                  // Replacing an existing file
                  setUploadMessage(existingFilename, filename, 'uploading-replacement');
                } else if (!existingFilename) {
                  // Uploading a new file where there was none
                  setUploadMessage('', filename, 'uploading-new');
                } else {
                  // No change
                  existingFilename = filename;
                  setUploadMessage(filename);
                }
              } else {
                setUploadMessage('', '', 'empty');
              }

              hideAssetCurrent();
            }
          }
        });

        observer.observe(observeTarget, { childList: true, subtree: true });
        console.log('🔭 Observer initialized for', inputFieldId);
      } else {
        console.log('🚫 No observer target for', inputFieldId);
      }

    } else {
      console.log('🚫 Upload wrapper or input not found for', inputFieldId);
    }
  });

});


/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: NO WATTBOX SECTION *******************/




// PM REVIEW SYSTEM QUESTIONNAIRE
$(document).on('knack-scene-render.scene_1003', function (event, scene) {
//$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-info-bar").hide();
//$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});





// NEW Q1 2024 Technician SOW View
$(document).on('knack-scene-render.scene_915', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});




// NEW Q2 2023 Customer Quote View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_828', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});

// NEW Q2 2023 Scope of Work-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_833', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
$(".kn-menu.view_44").hide();
});

// NEW Q3 2023 DRAFT Quote View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_873', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});

// NEW Q2 2023 DRAFT Scope of Work-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_886', function (event, scene) {
$(".kn-back-link").hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
$(".kn-menu.view_44").hide();
});





// Project Summary View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_292', function (event, scene) {
//$('.kn-back-link').hide();
//$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
//$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});



// Customer Quote View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_212', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});

// Request site Visit View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_733', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});



// Customer Project Summary View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_401', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu").hide();


});

// Customer Camera Location Sign Off-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_689', function (event, scene) {
$(".kn-back-link").hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu").hide();


});

// Customer Final Approval Sign Off-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_696', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
// $(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu").hide();


});
/**************************************************************************************************
 * FEATURE: McGandy’s Experiment (scene_213) — margin/cost math
 * ⚠ Contains likely bug: document.querySelector('text#field_1365') should probably be input#field_1365
 **************************************************************************************************/
(function mcgandyExperiment_scene213() {
  SCW.onSceneRender('scene_213', function (event, view, record) {
    setTimeout(function () {

      // subcontractor cost changed
      $('input#field_1364').change(function () {
        var subcontractor_cost = $(this).val();
        var survey_cost = document.querySelector('input#field_1363').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var margin = document.querySelector('input#field_1365').value;
        var marked_up_labor = Math.round(total_cost / (1 - margin));

        var install_total = Knack.models['view_507'].toJSON().field_343.replaceAll(',', '').replaceAll('$', '');
        var fees_added = document.querySelector('input#field_1251').value.replaceAll(',', '');
        var more_fees_to_add = Math.round((marked_up_labor - install_total) + Math.round(fees_added));

        $('input#field_1366').val(marked_up_labor);
        $('input#field_1580').val(more_fees_to_add);
      });

      // survey cost changed
      $('input#field_1363').change(function () {
        var survey_cost = $(this).val();
        var subcontractor_cost = document.querySelector('input#field_1364').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var margin = document.querySelector('text#field_1365').value; // ⚠ likely wrong selector
        var marked_up_labor = Math.round(total_cost / (1 - margin));

        $('input#field_1366').val(marked_up_labor);
        $('input#field_1365').keyup();
      });

      // marked up labor changed -> update margin
      $('input#field_1366').change(function () {
        var marked_up_labor = $(this).val();
        var survey_cost = document.querySelector('input#field_1363').value;
        var subcontractor_cost = document.querySelector('input#field_1364').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var margin = Math.abs(Math.round(marked_up_labor - total_cost) / marked_up_labor);
        var margin_rounded = Math.round((margin + Number.EPSILON) * 100) / 100;

        $('input#field_1365').val(margin_rounded);
        $('input#field_1365').keyup();
      });

      // margin changed -> update marked up labor
      $('input#field_1365').change(function () {
        var margin = $(this).val();
        var survey_cost = document.querySelector('input#field_1363').value;
        var subcontractor_cost = document.querySelector('input#field_1364').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var marked_up_labor = Math.round(total_cost / (1 - margin));

        $('input#field_1366').val(marked_up_labor);
        $('input#field_1366').keyup();
      });

    }, 1);
  }, 'mcgandy-experiment');
})();
/*** END FEATURE: McGandy’s Experiment ********************************************************************/


/**************************************************************************************************
 * FEATURE: Instructions placement (move .kn-instructions under labels)
 **************************************************************************************************/
(function instructionsPlacement_allForms() {
  $(document).on('knack-view-render.form', function (event, view, data) {
    $("#" + view.key + " .kn-instructions").each(function () {
      var inputLabel = $(this).closest(".kn-input").find(".kn-label");
      $(this).insertAfter(inputLabel);
    });
  });
})();
/*** END FEATURE: Instructions placement ******************************************************************/

/**************************************************************************************************
 * FEATURE: Quote / publish gating refresh & scroll preservation (legacy bundle)
 * - Contains multiple “rerender scene_view + restore scroll” handlers
 **************************************************************************************************/

/** Submit quote details form when equipment table changes (view_2830 -> submit view_2833) */
(function submitFormOnCellUpdate_view2830() {
  $(document).ready(function () {
    $(document).on('knack-cell-update.view_2830', function (event, view, record) {
      var scrollPosition = $(window).scrollTop();

      $('#view_2833 button[type=submit]').submit();

      setTimeout(function () {
        $(window).scrollTop(scrollPosition);
      }, 2000);
    });
  });
})();

/** Force rerender on equipment table edits (view_2911) */
(function rerenderOnCellUpdate_view2911_restoreScroll() {
  $(document).ready(function () {
    $(document).on('knack-cell-update.view_2911', function (event, view, record) {
      var scrollPosition = $(window).scrollTop();
      Knack.router.scene_view.render();
      setTimeout(function () {
        $(window).scrollTop(scrollPosition);
      }, 2000);
    });
  });
})();

/** Force rerender on drops table edits (view_2835) */
(function rerenderOnCellUpdate_view2835_restoreScroll() {
  $(document).ready(function () {
    $(document).on('knack-cell-update.view_2835', function (event, view, record) {
      var scrollPosition = $(window).scrollTop();
      Knack.router.scene_view.render();
      setTimeout(function () {
        $(window).scrollTop(scrollPosition);
      }, 500);
    });
  });
})();

/** Enhanced scroll anchoring for view_2835 changes (uses requestAnimationFrame) */
(function rerenderAndScrollTo_view2835_onFieldChange() {
  $(document).ready(function () {
    let previousFieldValue = null;
    let scrolling = false;

    function scrollToView2835() {
      const $v = $("#view_2835");
      if (!$v.length) return false;
      window.scrollTo(0, $v.offset().top);
      return true;
    }

    $(document).on("knack-cell-update.view_2835", function (event, view, record) {
      const currentFieldValue = record.field_60;

      if (previousFieldValue === null) previousFieldValue = currentFieldValue;
      if (previousFieldValue === currentFieldValue) return;

      previousFieldValue = currentFieldValue;

      if (scrolling) return;
      scrolling = true;

      Knack.router.scene_view.render();

      requestAnimationFrame(() => {
        scrollToView2835();
        requestAnimationFrame(() => {
          scrollToView2835();
          setTimeout(() => {
            scrollToView2835();
            scrolling = false;
          }, 200);
        });
      });
    });
  });
})();

/** Enhanced rerender for view_2911 changes only when certain fields change */
(function rerenderOnWatchedFields_view2911() {
  $(document).ready(function () {
    const watchedFields = ["field_128", "field_129", "field_301"];
    const prevByRecordId = {};
    let scrolling = false;

    function scrollToView2911() {
      const $v = $("#view_2911");
      if (!$v.length) return false;
      const headerOffset = 0;
      window.scrollTo(0, $v.offset().top - headerOffset);
      return true;
    }

    function getRecordId(record) {
      return record && (record.id || record._id || record.record_id);
    }

    function snapshot(record) {
      const snap = {};
      watchedFields.forEach((f) => { snap[f] = record ? record[f] : undefined; });
      return snap;
    }

    function changed(prevSnap, nextSnap) {
      if (!prevSnap) return true;
      return watchedFields.some((f) => prevSnap[f] !== nextSnap[f]);
    }

    $(document).on("knack-cell-update.view_2911", function (event, view, record) {
      const rid = getRecordId(record);
      if (!rid) return;

      const nextSnap = snapshot(record);
      const prevSnap = prevByRecordId[rid];

      if (!changed(prevSnap, nextSnap)) return;

      prevByRecordId[rid] = nextSnap;

      if (scrolling) return;
      scrolling = true;

      Knack.router.scene_view.render();

      requestAnimationFrame(() => {
        scrollToView2911();
        requestAnimationFrame(() => {
          scrollToView2911();
          setTimeout(() => {
            scrollToView2911();
            scrolling = false;
          }, 250);
        });
      });
    });
  });
})();

/*** END FEATURE: Quote/publish gating refresh bundle ******************************************************/
/*************  Exception Grid: hide if empty, warn if any records  **************************/
(function () {
  'use strict';

  const PRIMARY_VIEW_ID = 'view_3364';
  const FOLLOW_VIEW_ID  = 'view_3359';

  const EVENT_NS = '.scwExceptionGrid';
  const WARNING_BG = '#7a0f16';
  const WARNING_FG = '#ffffff';
  const RADIUS = 20;

  function injectCssOnce() {
    const id = 'scw-exception-grid-css';
    if (document.getElementById(id)) return;

    const css = `
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active:has(.ktlHideShowButton){
        margin-bottom: 0px !important;
        background-color: ${WARNING_BG} !important;
        max-width: 100% !important;

        border-top-left-radius: ${RADIUS}px !important;
        border-top-right-radius: ${RADIUS}px !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;

        overflow: hidden !important;
      }

      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton{
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;

        width: 100% !important;
        background-color: ${WARNING_BG} !important;
        color: ${WARNING_FG} !important;

        padding: 12px 56px 12px 18px !important;
        border: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;

        border-top-left-radius: ${RADIUS}px !important;
        border-top-right-radius: 0 !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
      }

      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton *{
        color: ${WARNING_FG} !important;
      }

      /* LEFT icon – centered */
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton::before{
        content: "⚠️";
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.1em;
        line-height: 1;
        transform: translateY(-.02em);
        margin-right: 12px;
      }

      /* RIGHT icon – positioned */
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton::after{
        content: "⚠️";
        position: absolute;
        right: 32px;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.1em;
        line-height: 1;
        pointer-events: none;
      }

      /* ✅ Arrow pinned right + vertically centered WITHOUT transform (prevents KTL transform collisions) */
      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton .ktlArrow{
        position: absolute;
        right: 12px;
        top: 0;
        bottom: 0;
        margin: auto 0;
        height: 1em;
      }

      #${PRIMARY_VIEW_ID}.scw-exception-grid-active .ktlHideShowButton:hover{
        filter: brightness(1.06);
      }

      #${FOLLOW_VIEW_ID}.scw-exception-follow-connected{
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
      }
    `;

    const style = document.createElement('style');
    style.id = id;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function removeOnlyPrimaryView() {
    $('#' + PRIMARY_VIEW_ID).remove();
    syncFollowView(false);
  }

  function syncFollowView(active) {
    const $follow = $('#' + FOLLOW_VIEW_ID);
    if (!$follow.length) return;
    $follow.toggleClass('scw-exception-follow-connected', !!active);
  }

  function gridHasRealRows($view) {
    const $rows = $view.find('tbody tr');
    if (!$rows.length) return false;
    return !$rows.filter('.kn-tr-nodata').length;
  }

  function markPrimaryActive() {
    const $primary = $('#' + PRIMARY_VIEW_ID);
    if (!$primary.length) return;
    $primary.addClass('scw-exception-grid-active');
    syncFollowView(true);
  }

  function handlePrimary(view, data) {
    if (!view || view.key !== PRIMARY_VIEW_ID) return;

    const $primary = $('#' + PRIMARY_VIEW_ID);
    if (!$primary.length) return;

    if (data && typeof data.total_records === 'number') {
      if (data.total_records === 0) removeOnlyPrimaryView();
      else markPrimaryActive();
      return;
    }

    if (gridHasRealRows($primary)) markPrimaryActive();
    else removeOnlyPrimaryView();
  }

  function syncIfFollowRendersLater(view) {
    if (!view || view.key !== FOLLOW_VIEW_ID) return;
    const active = $('#' + PRIMARY_VIEW_ID).hasClass('scw-exception-grid-active');
    syncFollowView(active);
  }

  injectCssOnce();

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view, data) {
      handlePrimary(view, data);
      syncIfFollowRendersLater(view);
    });
})();
/*************  Exception Grid: hide if empty, warn if any records  **************************/
////************* DTO: Unified Products (field_2246) from 2193/2194/2195 *************////
(function () {
  "use strict";

  // ======================
  // CONFIG
  // ======================
  const EVENT_NS = ".scwUnifiedProducts";
  const CONFIG = {
    SCENES: [], // e.g. ['scene_123'] or leave [] for all scenes
    VIEWS: ["view_3329"],

    // parent product fields
    PARENTS: ["field_2193", "field_2194", "field_2195"],

    // unified field
    UNIFIED: "field_2246",

    // bucket field: when this changes, clear ALL parents + unified
    RESET_ON_FIELD: "field_2223",

    // If unified is SINGLE connection, pick first non-empty in this order:
    SINGLE_PRIORITY: ["field_2193", "field_2194", "field_2195"],

    // Hide unified visually but keep it in the DOM
    HIDE_UNIFIED_FIELD: true,

    DEBUG: false
  };

  // ======================
  // UTILS
  // ======================
  function log(...args) {
    if (CONFIG.DEBUG && window.console) console.log("[scwUnified2246]", ...args);
  }

  function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
  }

  function asArray(v) {
    if (!v) return [];
    return Array.isArray(v) ? v.filter(Boolean) : [v].filter(Boolean);
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function inAllowedScene(sceneKey) {
    if (!CONFIG.SCENES || !CONFIG.SCENES.length) return true;
    return CONFIG.SCENES.includes(sceneKey);
  }

  // ======================
  // DOM HELPERS
  // ======================
  function $viewRoot(viewId) {
    return $(`#${viewId}`);
  }

  function getSelect($view, viewId, fieldKey) {
    // Standard Knack form select id: `${viewId}-${fieldKey}`
    return $view.find(`#${viewId}-${fieldKey}`).first();
  }

  function getHiddenConn($view, fieldKey) {
    // Hidden "connection" input that Knack submits
    return $view.find(`#kn-input-${fieldKey} input.connection[name='${fieldKey}']`).first();
  }

  function isMultiSelect($select) {
    return !!$select.prop("multiple");
  }

  function chosenUpdate($select) {
    // Chosen legacy + newer event names
    $select.trigger("liszt:updated");
    $select.trigger("chosen:updated");
  }

  function encodeConnValue(ids, isMulti) {
    const payload = isMulti ? ids : (ids[0] || "");
    return encodeURIComponent(JSON.stringify(payload));
  }

  function readSelectedIdToLabelMap($select) {
    const out = {};
    if (!$select || !$select.length) return out;

    $select.find("option:selected").each(function () {
      const id = $(this).attr("value") || "";
      const label = ($(this).text() || "").trim();
      if (id) out[id] = label || id;
    });

    return out;
  }

  function mergeMaps(...maps) {
    const out = {};
    maps.forEach((m) => {
      Object.keys(m || {}).forEach((k) => {
        if (!out[k]) out[k] = m[k];
      });
    });
    return out;
  }

  function ensureOptions($unifiedSelect, idToLabel) {
    if (!$unifiedSelect || !$unifiedSelect.length) return;

    Object.keys(idToLabel).forEach((id) => {
      if (!$unifiedSelect.find(`option[value="${id}"]`).length) {
        const label = idToLabel[id] || id;
        $unifiedSelect.append(new Option(label, id, false, false));
      } else {
        const $opt = $unifiedSelect.find(`option[value="${id}"]`).first();
        if (!($opt.text() || "").trim()) $opt.text(idToLabel[id] || id);
      }
    });
  }

  // Hide unified input row visually, without removing it from DOM
  function safeHideUnifiedField($view) {
    if (!CONFIG.HIDE_UNIFIED_FIELD) return;

    const $wrap = $view.find(`#kn-input-${CONFIG.UNIFIED}`).first();
    if (!$wrap.length) return;

    $wrap.css({
      position: "absolute",
      left: "-99999px",
      top: "auto",
      width: "1px",
      height: "1px",
      overflow: "hidden"
    });

    $wrap.find(".chzn-container, .chosen-container").css({
      position: "absolute",
      left: "-99999px",
      top: "auto",
      width: "1px",
      height: "1px",
      overflow: "hidden"
    });
  }

  // ======================
  // CORE: set unified based on parents
  // ======================
  function computeUnionIdsAndLabels($view, viewId) {
    const parentSelects = CONFIG.PARENTS.map((fk) => [fk, getSelect($view, viewId, fk)]);
    const maps = parentSelects.map(([, $sel]) => readSelectedIdToLabelMap($sel));
    const idToLabel = mergeMaps(...maps);

    const unionIds = uniq(Object.keys(idToLabel));

    return { unionIds, idToLabel };
  }

  function computeSinglePick(unionIds, $view, viewId) {
    for (const fk of CONFIG.SINGLE_PRIORITY) {
      const $sel = getSelect($view, viewId, fk);
      const ids = asArray($sel.val());
      if (ids.length) return [ids[0]];
    }
    return unionIds.length ? [unionIds[0]] : [];
  }

  function setUnifiedFromParents($view, viewId) {
    const $unifiedSelect = getSelect($view, viewId, CONFIG.UNIFIED);
    const $unifiedHidden = getHiddenConn($view, CONFIG.UNIFIED);

    if (!$unifiedSelect.length || !$unifiedHidden.length) {
      log("Missing unified select/hidden for", CONFIG.UNIFIED);
      return;
    }

    const { unionIds, idToLabel } = computeUnionIdsAndLabels($view, viewId);

    if (!unionIds.length) {
      const isMulti = isMultiSelect($unifiedSelect);
      const encodedClear = encodeConnValue([], isMulti);

      $unifiedSelect.val(isMulti ? [] : "").trigger("change");
      $unifiedHidden.val(encodedClear).trigger("change");
      chosenUpdate($unifiedSelect);
      return;
    }

    const unifiedIsMulti = isMultiSelect($unifiedSelect);
    const finalIds = unifiedIsMulti ? unionIds : computeSinglePick(unionIds, $view, viewId);

    ensureOptions($unifiedSelect, idToLabel);

    $unifiedSelect.val(unifiedIsMulti ? finalIds : (finalIds[0] || "")).trigger("change");

    const encoded = encodeConnValue(finalIds, unifiedIsMulti);
    $unifiedHidden.val(encoded).trigger("change");

    chosenUpdate($unifiedSelect);

    log("Unified set", { unifiedIsMulti, finalIds, encoded });
  }

  // ======================
  // CLEAR HELPERS
  // ======================
  function clearConnField($view, viewId, fieldKey) {
    const $sel = getSelect($view, viewId, fieldKey);
    const $hidden = getHiddenConn($view, fieldKey);

    // Parent fields might not have the hidden connection input in the same shape as UNIFIED,
    // but if it exists we clear it too.
    const hasSelect = $sel && $sel.length;
    const hasHidden = $hidden && $hidden.length;

    if (!hasSelect && !hasHidden) return;

    let isMulti = false;
    if (hasSelect) isMulti = isMultiSelect($sel);

    const clearedVal = isMulti ? [] : "";

    if (hasSelect) {
      $sel.val(clearedVal).trigger("change");
      chosenUpdate($sel);
    }

    if (hasHidden) {
      const encodedClear = encodeConnValue([], isMulti);
      $hidden.val(encodedClear).trigger("change");
    }

    log("Cleared field", fieldKey);
  }

  function clearUnifiedField($view, viewId) {
    clearConnField($view, viewId, CONFIG.UNIFIED);
  }

  function clearAllParents($view, viewId) {
    CONFIG.PARENTS.forEach((fk) => clearConnField($view, viewId, fk));
  }

  function clearParentsAndUnified($view, viewId) {
    clearAllParents($view, viewId);
    clearUnifiedField($view, viewId);
  }

  // ======================
  // BINDING
  // ======================
  function bind(viewId) {
    const $view = $viewRoot(viewId);
    if (!$view.length) return;

    safeHideUnifiedField($view);

    const sync = debounce(() => setUnifiedFromParents($view, viewId), 80);

    // ✅ RESET: when bucket changes, clear ALL parent product fields AND unified
    if (CONFIG.RESET_ON_FIELD) {
      const $bucket = getSelect($view, viewId, CONFIG.RESET_ON_FIELD);
      if ($bucket.length) {
        $bucket
          .off(`change${EVENT_NS}-reset`)
          .on(`change${EVENT_NS}-reset`, function () {
            clearParentsAndUnified($view, viewId);

            // optional: one more pass to ensure unified stays cleared
            // (since parents are now empty, sync will clear unified anyway)
            sync();
          });
      }
    }

    // Bind to parent field changes only (your sequencing request)
    CONFIG.PARENTS.forEach((fk) => {
      const $sel = getSelect($view, viewId, fk);
      if (!$sel.length) return;

      $sel.off(`change${EVENT_NS}`).on(`change${EVENT_NS}`, sync);
      $sel.off(`blur${EVENT_NS}`).on(`blur${EVENT_NS}`, sync);
    });

    // Initial pass (will clear unified unless parents already have values)
    sync();
  }

  // Enable on view render
  $(document).on(`knack-scene-render.any${EVENT_NS}`, function (event, scene) {
    if (!inAllowedScene(scene.key)) return;

    CONFIG.VIEWS.forEach((viewId) => {
      $(document)
        .off(`knack-view-render.${viewId}${EVENT_NS}`)
        .on(`knack-view-render.${viewId}${EVENT_NS}`, function () {
          bind(viewId);
        });
    });
  });
})();

(function () {
  const applyCheckboxGrid = () => {
    document.querySelectorAll('#connection-picker-checkbox-field_739').forEach(container => {
      if (!container.classList.contains('multi-column-processed')) {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(4, 1fr)';
        container.style.gap = '0.5em';
        container.classList.add('multi-column-processed');

        container.querySelectorAll('.control').forEach(ctrl => {
          ctrl.style.marginBottom = '0.25em';
        });
      }
    });
  };

  // MutationObserver to watch for popups / form changes
  const observer = new MutationObserver(() => applyCheckboxGrid());

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Apply once on DOM ready
  document.addEventListener('DOMContentLoaded', applyCheckboxGrid);
})();


/**************************************************************************************************
 * FEATURE: “Scene section” expand/collapse (legacy)
 * - Toggles view sections using .view-header as a clickable accordion
 **************************************************************************************************/

/** BINDINGS: call addSceneExpandCollapse(view) on view render */
(function bind_sceneExpandCollapse() {
  // Admin
  $(document).on('knack-view-render.view_1218', function (event, view, data) { addSceneExpandCollapse(view); });

  // Micah's Shit
  $(document).on('knack-view-render.view_1190', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1584', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1559', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1380', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_760',  function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1212', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_462',  function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1049', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1314', function (event, view, data) { addSceneExpandCollapse(view); });

  // Project Dashboard
  $(document).on('knack-view-render.view_1224', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1498', function (event, view, data) { addSceneExpandCollapse(view); });

  // Job Reports (AVL / TRIAD)
  $(document).on('knack-view-render.view_845',  function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1231', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1257', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1420', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1392', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1418', function (event, view, data) { addSceneExpandCollapse(view); });

  // Job Reports > In Work
  $(document).on('knack-view-render.view_1302', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1309', function (event, view, data) { addSceneExpandCollapse(view); });

  // Service Calls & Troubleshooting
  $(document).on('knack-view-render.view_1361', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1411', function (event, view, data) { addSceneExpandCollapse(view); });

  // Project Summary
  $(document).on('knack-view-render.view_1185', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1368', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1710', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_899',  function (event, view, data) { addSceneExpandCollapse(view); });

  // Build Quote
  $(document).on('knack-view-render.view_2812', function (event, view, data) { addSceneExpandCollapse(view); });

})();

/** IMPLEMENTATION: addSceneExpandCollapse(view) */
var addSceneExpandCollapse = function (view) {
  $('#' + view.key + ' .view-header').css("cursor", "pointer");

  $('#' + view.key + " .view-header h2").each(function () {
    if ($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }
  });

  // Collapse by default
  $('#' + view.key + ' .view-header').nextUntil('.view-header').toggle();

  // Toggle on click (+/-)
  $('#' + view.key + ' .view-header').click(function () {
    $(this).nextUntil('.view-header').toggle();

    if ($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
};

/** DUPLICATE/ALT IMPLEMENTATION (kept for legacy reasons)
 * - addSceneExpandCollapseMultiple is functionally the same as addSceneExpandCollapse
 */
var addSceneExpandCollapseMultiple = function (view) {
  $('#' + view.key + ' .view-header').css("cursor", "pointer");

  $('#' + view.key + " .view-header h2").each(function () {
    if ($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o"; ></i>&nbsp;' + RowText);
    }
  });

  $('#' + view.key + ' .view-header').nextUntil('.view-header').toggle();

  $('#' + view.key + ' .view-header').click(function () {
    $(this).nextUntil('.view-header').toggle();

    if ($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
};
/*** END FEATURE: “Scene section” expand/collapse *********************************************************/


/**************************************************************************************************
 * FEATURE: Add row selection checkboxes to a table (utility)
 * ⚠ NOTE: This function is defined AGAIN later in your original blob.
 * Keeping one canonical copy is strongly recommended.
 **************************************************************************************************/
var addCheckboxes = function (view) {
  // add checkbox in header (select/unselect all)
  $('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');

  $('#' + view.key + '.kn-table thead input').change(function () {
    $('.' + view.key + '.kn-table tbody tr input').each(function () {
      $(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
    });
  });

  // add checkbox to each row in the table body
  $('#' + view.key + '.kn-table tbody tr').each(function () {
    $(this).prepend('<td><input type="checkbox"></td>');
  });
};
/*** END FEATURE: Add row selection checkboxes ************************************************************/


/**************************************************************************************************
 * FEATURE: Add row selection checkboxes to a table (utility)
 * ⚠ NOTE: This function is defined AGAIN later in your original blob.
 * Keeping one canonical copy is strongly recommended.
 **************************************************************************************************/
var addCheckboxes = function (view) {
  // add checkbox in header (select/unselect all)
  $('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');

  $('#' + view.key + '.kn-table thead input').change(function () {
    $('.' + view.key + '.kn-table tbody tr input').each(function () {
      $(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
    });
  });

  // add checkbox to each row in the table body
  $('#' + view.key + '.kn-table tbody tr').each(function () {
    $(this).prepend('<td><input type="checkbox"></td>');
  });
};
/*** END FEATURE: Add row selection checkboxes ************************************************************/



/**************************************************************************************************
 * FEATURE: Bulk actions on table rows (Assign Photos to Run / Get Photos from TLS)
 * - Uses addCheckboxes(view) utility above
 * ⚠ NOTE: Original had stray “P” after Knack.hideSpinner(); leaving as-is is unsafe.
 **************************************************************************************************/

/** view_2179: Assign Photos to Run (Make/Integromat webhook) */
(function assignPhotosToRun_view2179() {
  $(document).on('knack-view-render.view_2179', function (event, view) {
    $('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="assignphotos"">Assign Photos to Run</button>')
      .insertAfter('#view_2179 > div.view-header > h2');

    addCheckboxes(view);

    $('#assignphotos').click(function () {
      var record_ids = [];
      var runID = window.location.href.split('/')[window.location.href.split('/').length - 2];

      $('#' + view.key + ' tbody input[type=checkbox]:checked').each(function () {
        record_ids.push($(this).closest('tr').attr('id'));
      });

      commandURL = "https://hook.integromat.com/ecrm451p73bbgy6it4iu8iwpnpqh1vdf?recordid=" + record_ids + "&runID=" + runID;

      $.get(commandURL, function (data, status) {
        Knack.hideSpinner();
      });

      Knack.showSpinner();

      var selectedRecords = record_ids.length;

      setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
      alert('Integromat is updating ' + selectedRecords + ' records. Depending on how many photos you are updating this could take a few minutes');
      Knack.hideSpinner(); // ⚠ removed stray “P”
    });
  });
})();

/** view_1378: Get Photos from TLS WO (Make/Integromat webhook) */
(function getPhotosFromTLS_view1378() {
  $(document).on('knack-view-render.view_1378', function (event, view) {
    $('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="getTLSPhotos"">Get Photos from TLS WO</button>')
      .insertAfter('#view_1378 > div.view-header > h2');

    $('#getTLSPhotos').click(function () {
      var projectID = window.location.href.split('/')[window.location.href.split('/').length - 2];
      var tlWO = prompt("What is the TLS WO ID?:");

      commandURL = "https://hook.integromat.com/bp83h6wunhoa9oc2ubm5hwklbc8u775i?projectID=" + projectID + "&tlWO=" + tlWO;

      $.get(commandURL, function (data, status) {
        Knack.hideSpinner();
      });

      Knack.showSpinner();

      setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
      alert('Integromat is going to download photos from ' + tlWO + ' . Depending on how many photos there are it could take a moment for this to complete. ');
      Knack.hideSpinner(); // ⚠ removed stray “P”
    });
  });
})();
