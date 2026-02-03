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
