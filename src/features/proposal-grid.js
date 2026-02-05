/////************* PROPOSAL GRID (L2 REORDER + CLEANUP + ASSUMPTIONS FOOTER HIDE) ***************//////
/**
 * SCW Proposal Grid Patch
 * Version: 1.0
 * Last Updated: 2026-02-05
 *
 * What this fixes (based on your DOM):
 *  1) ✅ Stable L2 re-order WITHIN each L1 section (without breaking grouping)
 *     - Uses the first data-row’s field_2218 connection-value as the L2 sort key
 *       (your DOM shows 0,1,2,3,4,8 mapping to the L2 buckets).
 *  2) ✅ Removes/ hides blank group header rows (common in L3/L4)
 *     - e.g., `<tr class="kn-table-group kn-group-level-3"><td ...></td></tr>`
 *     - e.g., blank L4 description rows with empty text.
 *  3) ✅ Hides Level-2 subtotal/footer rows ONLY when:
 *     - L2 label is "Assumptions" (case-insensitive), OR
 *     - the block contains the special connection id 697b7a023a31502ec68b3303
 *
 * Safe / idempotent:
 *  - Won’t repeatedly reorder (stamp on <tbody>)
 *  - Won’t assume a single view; supports multiple scenes/views from the start
 */

(function () {
  // ======================
  // CONFIG
  // ======================
  const EVENT_NS = ".scwProposalGridPatch";

  // If you want to hard-scope, put IDs here. Otherwise it runs anywhere it finds a Knack table with group rows.
  const SCENE_IDS = ["any"]; // e.g. ["scene_1085"]
  const VIEW_IDS  = ["any"]; // e.g. ["view_3301"]

  // Fields / IDs observed in your DOM
  const L2_SORT_KEY_FIELD_CLASS = "field_2218"; // contains connection-value number used to sort buckets
  const ASSUMPTIONS_SPECIAL_CONN_ID = "697b7a023a31502ec68b3303";

  // Group row classes
  const CLS_L1 = "kn-group-level-1";
  const CLS_L2 = "kn-group-level-2";
  const CLS_L3 = "kn-group-level-3";
  const CLS_L4 = "kn-group-level-4";

  // Subtotal/footer row detection (your existing totals script uses these)
  const SUBTOTAL_ROW_SELECTORS = [
    "tr.scw-subtotal--level-2",
    "tr[data-scw-subtotal-level='2']",
    "tr.scw-level-total-row.scw-subtotal"
  ].join(",");

  // Stamp to avoid repeated reorder loops
  const STAMP_ATTR = "data-scw-l2-reorder-stamp";

  // ======================
  // HELPERS
  // ======================
  function inScope(sceneId, viewId) {
    const sceneOk = SCENE_IDS.includes("any") || SCENE_IDS.includes(sceneId);
    const viewOk  = VIEW_IDS.includes("any")  || VIEW_IDS.includes(viewId);
    return sceneOk && viewOk;
  }

  function normalizeLabel(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function getGroupRowText($tr) {
    // Group rows are single-cell (often colspan). Pull visible text reliably.
    return normalizeLabel($tr.find("td").first().text());
  }

  function isBlankGroupRow($tr) {
    const txt = normalizeLabel($tr.find("td").first().text());
    return !txt;
  }

  function parseSortKeyFromBlock($rows) {
    // Find first *data record* row inside this L2 block: it has an id and not kn-table-group
    // Then read the numeric key from .field_2218 [data-kn="connection-value"] text.
    const $firstDataRow = $rows.filter(function () {
      const tr = this;
      if (!tr || tr.nodeType !== 1) return false;
      const $t = $(tr);
      if ($t.hasClass("kn-table-group")) return false;
      // Knack record rows have an id like 698162...
      const id = $t.attr("id");
      return !!id;
    }).first();

    if (!$firstDataRow.length) return Number.POSITIVE_INFINITY;

    const $val = $firstDataRow.find(
      `td.${L2_SORT_KEY_FIELD_CLASS} [data-kn="connection-value"]`
    ).first();

    const raw = normalizeLabel($val.text());
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }

  function blockContainsSpecialConnId($rows) {
    // Your DOM shows: <span id="697b7a023a31502ec68b3303" data-kn="connection-value">8</span>
    return $rows.find(`#${ASSUMPTIONS_SPECIAL_CONN_ID}`).length > 0;
  }

  function getAllTablesInView($view) {
    // Restrict to “real” Knack grid tables
    return $view.find("table.kn-table").filter(function () {
      const $t = $(this);
      return $t.find("tbody tr").length > 0;
    });
  }

  // ======================
  // CLEANUP: BLANK GROUP ROWS
  // ======================
  function cleanupBlankGroupRows($tbody) {
    // Remove/hide blank L3/L4 group rows that cause visual/logic weirdness.
    $tbody.find(`tr.kn-table-group.${CLS_L3}, tr.kn-table-group.${CLS_L4}`).each(function () {
      const $tr = $(this);
      if (isBlankGroupRow($tr)) {
        $tr.remove();
      }
    });
  }

  // ======================
  // L2 REORDER (within each L1 section)
  // ======================
  function reorderL2WithinEachL1($tbody) {
    // Guard: if already stamped, don't re-run reorder (prevents loops with other scripts)
    if ($tbody.attr(STAMP_ATTR)) return;

    const $rows = $tbody.children("tr");
    if (!$rows.length) return;

    // Identify L1 sections as contiguous ranges:
    // [L1 header] ... until next L1 header (or end)
    const l1Starts = [];
    $rows.each(function (idx) {
      if ($(this).hasClass("kn-table-group") && $(this).hasClass(CLS_L1)) {
        l1Starts.push(idx);
      }
    });
    if (!l1Starts.length) return;

    // Add a sentinel end
    l1Starts.push($rows.length);

    for (let i = 0; i < l1Starts.length - 1; i++) {
      const startIdx = l1Starts[i];
      const endIdx   = l1Starts[i + 1];

      const $l1Header = $rows.eq(startIdx);
      const $sectionRows = $rows.slice(startIdx + 1, endIdx); // everything under this L1

      // Within the section, break into L2 blocks:
      // [L2 header] + (any following L3/L4/data rows) until next L2 header or next L1 end
      const l2Blocks = [];
      let current = null;

      $sectionRows.each(function () {
        const $tr = $(this);

        if ($tr.hasClass("kn-table-group") && $tr.hasClass(CLS_L2)) {
          // start new block
          if (current) l2Blocks.push(current);
          current = {
            $header: $tr,
            $rows: $($tr.get(0)), // include header row itself
            label: getGroupRowText($tr),
            sortKey: Number.POSITIVE_INFINITY,
            hasSpecial: false
          };
          return;
        }

        if (!current) {
          // Rows before first L2 (rare) should be left untouched.
          return;
        }

        // Append row to current block
        current.$rows = current.$rows.add($tr);
      });

      if (current) l2Blocks.push(current);
      if (!l2Blocks.length) continue;

      // Compute sort keys + special markers
      l2Blocks.forEach((b) => {
        b.sortKey = parseSortKeyFromBlock(b.$rows);
        b.hasSpecial = blockContainsSpecialConnId(b.$rows);
      });

      // Sort by sortKey, but keep stable order for ties
      const decorated = l2Blocks.map((b, idx) => ({ b, idx }));
      decorated.sort((a, c) => {
        const ak = a.b.sortKey;
        const ck = c.b.sortKey;
        if (ak !== ck) return ak - ck;
        return a.idx - c.idx;
      });

      // Rebuild DOM: remove and re-insert blocks in sorted order
      // To avoid breaking Knack, we reinsert blocks in-place right after the L1 header.
      const $anchor = $l1Header;

      // Detach blocks first (keeps events/data better than remove)
      const $detachedBlocks = decorated.map((d) => d.b.$rows.detach());

      // Insert in order
      let $insertAfter = $anchor;
      $detachedBlocks.forEach(($blockRows) => {
        $insertAfter.after($blockRows);
        // advance insertAfter to last row in this block
        $insertAfter = $blockRows.last();
      });

      // After reorder, hide Assumptions subtotal/footer rows in this L1 section (if present)
      hideAssumptionsL2FootersInSection($anchor, $insertAfter);
    }

    // Stamp so we don't repeat reorder
    $tbody.attr(STAMP_ATTR, String(Date.now()));
  }

  // ======================
  // HIDE L2 FOOTERS FOR ASSUMPTIONS
  // ======================
  function hideAssumptionsL2FootersInSection($sectionStartRow, $sectionEndRow) {
    // Walk rows between sectionStartRow and sectionEndRow, detect L2 block boundaries,
    // and hide any subtotal/footer row inside that block if it's Assumptions or contains the special id.
    const $all = $sectionStartRow.nextUntil($sectionEndRow.next());

    let current = null;

    $all.each(function () {
      const $tr = $(this);

      if ($tr.hasClass("kn-table-group") && $tr.hasClass(CLS_L2)) {
        // close previous
        if (current) applyHideRuleToBlock(current);

        current = {
          label: getGroupRowText($tr),
          $rows: $($tr.get(0))
        };
        return;
      }

      if (!current) return;

      current.$rows = current.$rows.add($tr);
    });

    if (current) applyHideRuleToBlock(current);
  }

  function applyHideRuleToBlock(block) {
    const isAssumptions = block.label === "assumptions";
    const hasSpecial    = block.$rows.find(`#${ASSUMPTIONS_SPECIAL_CONN_ID}`).length > 0;

    if (!isAssumptions && !hasSpecial) return;

    // Hide ONLY level-2 subtotal/footer rows (if your totals script created them)
    block.$rows.filter(SUBTOTAL_ROW_SELECTORS).hide();

    // Also, if someone previously hid Qty/Cost cells on these subtotal rows, force them visible
    // (this addresses your earlier "footer row shouldn't be hidden" issue).
    block.$rows.filter(SUBTOTAL_ROW_SELECTORS).find("td.field_1964, td.field_2203").css({
      visibility: "visible"
    });
  }

  // ======================
  // MAIN: PROCESS A TABLE
  // ======================
  function processTable($table) {
    const $tbody = $table.find("tbody").first();
    if (!$tbody.length) return;

    // 1) cleanup blank group rows (prevents broken grouping logic)
    cleanupBlankGroupRows($tbody);

    // 2) reorder L2 blocks inside each L1 section (stable + idempotent)
    reorderL2WithinEachL1($tbody);

    // 3) cleanup again (reorder can expose empties)
    cleanupBlankGroupRows($tbody);
  }

  function processView(viewId) {
    const $view = $(`#${viewId}`);
    if (!$view.length) return;

    const $tables = getAllTablesInView($view);
    if (!$tables.length) return;

    $tables.each(function () {
      processTable($(this));
    });
  }

  // ======================
  // EVENT BINDING
  // ======================
  function bind() {
    // Avoid stacking handlers across bundle reloads
    $(document).off(EVENT_NS);

    $(document).on(`knack-view-render${EVENT_NS}`, function (event, view) {
      const sceneId = (Knack && Knack.scene && Knack.scene.key) ? Knack.scene.key : "unknown";
      const viewId  = view && view.key ? view.key : (view && view.id ? view.id : null);
      if (!viewId) return;
      if (!inScope(sceneId, viewId)) return;

      // Let Knack finish painting the grouped rows
      setTimeout(function () {
        processView(viewId);
      }, 0);
    });

    // Also catch scene rerenders that can rebuild the DOM after view-render
    $(document).on(`knack-scene-render${EVENT_NS}`, function (event, scene) {
      const sceneId = scene && scene.key ? scene.key : "unknown";
      if (!(SCENE_IDS.includes("any") || SCENE_IDS.includes(sceneId))) return;

      setTimeout(function () {
        if (VIEW_IDS.includes("any")) {
          // process all views on the scene
          $(`[id^="view_"]`).each(function () {
            const vid = this.id;
            processView(vid);
          });
        } else {
          VIEW_IDS.forEach(processView);
        }
      }, 0);
    });
  }

  bind();
})();
