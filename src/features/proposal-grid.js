/////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/**
 * SCW Totals Script – Full Patched Version (L1 multi-row footer)
 * Last Updated: 2026-02-05
 *
 * What this does:
 *  - Walks a Knack grouped table (kn-table) and computes rollups by group level.
 *  - Inserts subtotal rows bottom-up so nested groups land correctly.
 *  - ✅ PATCH: Level-1 totals render as 1 row (no discounts) OR 3 rows (pre/discount/final),
 *            with the L1 header label shown ABOVE the lines (not in a narrow TD).
 *
 * IMPORTANT:
 *  - This is written to be drop-in and multi-view friendly.
 *  - You MUST set the correct field class keys in SCW_TOTALS_CONFIG.columns below.
 *    (These are the td/th CSS classes like "field_2028", "field_1964", etc.)
 */

/* global Knack, $, jQuery */

(function () {
  // ============================================================
  // CONFIG
  // ============================================================

  const SCW_TOTALS_CONFIG = {
    // Apply to these views (leave empty array to auto-run on any view that contains a grouped kn-table)
    // Example: ["view_3301", "view_3359"]
    views: [],

    // Column class keys (MUST MATCH your table's th/td classes)
    // cost = the money/extended column you want totals to show in
    // discount = the discount $ column (optional but recommended)
    // qty = the qty column (optional; used only to place the label cell properly)
    columns: {
      qty: "field_1964",        // <-- change if needed
      cost: "field_2028",       // <-- change if needed (your $ column)
      discount: "field_2240",   // <-- change if needed (your discount $ column)
    },

    // Formatting
    money: {
      currency: "USD",
      decimals: 2,
    },

    // Group label cleanup
    stripSuffixes: {
      subtotal: /(\s+—\s*Subtotal\s*)$/i,
    },

    // Insert behavior
    insert: {
      // If true, do not insert any subtotal rows for groups whose label is blank-ish
      skipBlankLabels: true,
      blankLabelPattern: /^\s*(?:-|—|–)?\s*$/i,
    },
  };

  // ============================================================
  // SMALL UTILITIES
  // ============================================================

  function norm(s) {
    return (s == null ? "" : String(s)).trim();
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parseMoney(val) {
    // Accepts "$1,234.56", "(123.45)", "-123.45", "123"
    const s = norm(val);
    if (!s) return 0;

    const isParenNeg = /^\(.*\)$/.test(s);
    const cleaned = s
      .replace(/[()]/g, "")
      .replace(/[^0-9.\-]/g, "");

    const n = Number(cleaned);
    if (!isFinite(n)) return 0;
    return isParenNeg ? -Math.abs(n) : n;
  }

  function formatMoney(n) {
    const x = Number(n || 0);
    return x.toLocaleString(undefined, {
      style: "currency",
      currency: SCW_TOTALS_CONFIG.money.currency,
      minimumFractionDigits: SCW_TOTALS_CONFIG.money.decimals,
      maximumFractionDigits: SCW_TOTALS_CONFIG.money.decimals,
    });
  }

  function formatMoneyAbs(n) {
    return formatMoney(Math.abs(Number(n || 0)));
  }

  function isBlankGroupLabel(label) {
    const s = norm(label);
    if (!s) return true;
    if (SCW_TOTALS_CONFIG.insert.blankLabelPattern.test(s)) return true;
    return false;
  }

  function getGroupLevel($tr) {
    // Knack group headers look like: tr.kn-table-group.kn-group-level-1
    const cls = ($tr.attr("class") || "").split(/\s+/);
    const m = cls
      .map(c => c.match(/^kn-group-level-(\d+)$/))
      .find(Boolean);
    return m ? Number(m[1]) : null;
  }

  function isGroupRow($tr) {
    return $tr.hasClass("kn-table-group") || /kn-group-level-\d+/.test($tr.attr("class") || "");
  }

  function isRecordRow($tr) {
    // Most record rows have an id attribute; subtotal rows we inject won't.
    return Boolean($tr.attr("id"));
  }

  function isInjectedSubtotalRow($tr) {
    return $tr.hasClass("scw-level-total-row") || $tr.hasClass("scw-subtotal");
  }

  function findFirstCellText($tr) {
    // group header label is in the first td typically
    const $td = $tr.children("td").first();
    return norm($td.text());
  }

  // ============================================================
  // COLUMN META + L1 MULTI-ROW BUILDER (PATCH)
  // ============================================================

  function computeColumnMeta(ctx) {
    const firstRow = ctx.$tbody.find("tr[id]").first()[0];
    const colCount = firstRow ? firstRow.querySelectorAll("td").length : 0;

    let qtyIdx = -1;
    let costIdx = -1;

    const ths = ctx.$table.find("thead th").get();
    if (ths && ths.length) {
      qtyIdx = ths.findIndex(th => th.classList.contains(ctx.keys.qty));
      costIdx = ths.findIndex(th => th.classList.contains(ctx.keys.cost));
    }

    if (firstRow) {
      const tds = Array.from(firstRow.querySelectorAll("td"));
      if (qtyIdx < 0) qtyIdx = tds.findIndex(td => td.classList.contains(ctx.keys.qty));
      if (costIdx < 0) costIdx = tds.findIndex(td => td.classList.contains(ctx.keys.cost));
    }

    return { colCount, qtyIdx, costIdx };
  }

  function buildLevel1FooterRows(ctx, {
    titleText,
    preDiscountText,
    discountText,
    finalTotalText,
    hasDiscount,
    contextKey,
    groupLabel,
  }) {
    const { colCount, qtyIdx, costIdx } = computeColumnMeta(ctx);

    // Fallbacks if we couldn't identify columns (keeps table from breaking)
    const safeQtyIdx = qtyIdx >= 0 ? qtyIdx : Math.max(colCount - 2, 0);
    const safeCostIdx = costIdx >= 0 ? costIdx : Math.max(colCount - 1, 0);

    const leftSpan = Math.max(safeQtyIdx, 0);
    const midSpan = Math.max(safeCostIdx - safeQtyIdx, 1);
    const rightSpan = Math.max(colCount - (safeCostIdx + 1), 0);

    function row({ title, label, value, cls }) {
      return $(`
        <tr class="scw-level-total-row scw-subtotal scw-subtotal--level-1 scw-l1-line-row ${cls}"
            data-scw-subtotal-level="1"
            data-scw-context="${escapeHtml(contextKey || "default")}"
            data-scw-group-label="${escapeHtml(groupLabel || "")}">
          ${leftSpan ? `<td colspan="${leftSpan}"></td>` : ""}
          <td class="${ctx.keys.qty}" colspan="${midSpan}">
            ${title ? `<div class="scw-l1-title">${escapeHtml(title)}</div>` : ""}
            <div class="scw-l1-label">${escapeHtml(label)}</div>
          </td>
          <td class="${ctx.keys.cost}">
            <div class="scw-l1-value">${escapeHtml(value)}</div>
          </td>
          ${rightSpan ? `<td colspan="${rightSpan}"></td>` : ""}
        </tr>
      `);
    }

    if (!hasDiscount) {
      return [
        row({
          title: titleText,
          label: "Total",
          value: finalTotalText,
          cls: "scw-l1-line--final",
        }),
      ];
    }

    return [
      row({
        title: titleText,
        label: "Pre-Discount",
        value: preDiscountText,
        cls: "scw-l1-line--pre",
      }),
      row({
        title: "",
        label: "Discounts",
        value: discountText,
        cls: "scw-l1-line--disc",
      }),
      row({
        title: "",
        label: "Final Total",
        value: finalTotalText,
        cls: "scw-l1-line--final",
      }),
    ];
  }

  // ============================================================
  // SUBTOTAL ROW BUILDERS (L1 uses multi-row)
  // ============================================================

  function buildSubtotalRow(ctx, {
    level,
    leftText,
    cost,
    discount,
    finalTotal,
    hasDiscount,
    contextKey,
    groupLabel,
  }) {
    // Skip zeros
    if (Math.abs(cost) < 0.01 && Math.abs(discount) < 0.01 && Math.abs(finalTotal) < 0.01) {
      return $();
    }

    // ✅ PATCH: Level-1 returns 1 or 3 rows
    if (level === 1) {
      const titleText = norm(leftText || "")
        .replace(SCW_TOTALS_CONFIG.stripSuffixes.subtotal, "");

      const rows = buildLevel1FooterRows(ctx, {
        titleText,
        preDiscountText: formatMoney(cost),
        discountText: "–" + formatMoneyAbs(discount),
        finalTotalText: formatMoney(hasDiscount ? finalTotal : cost),
        hasDiscount,
        contextKey,
        groupLabel,
      });

      // return a jQuery collection containing multiple TRs
      return $(rows.map(r => r[0]));
    }

    // Default (single-row) for other levels
    const label = norm(leftText || "");
    const html = `
      <tr class="scw-level-total-row scw-subtotal scw-subtotal--level-${level}"
          data-scw-subtotal-level="${level}"
          data-scw-context="${escapeHtml(contextKey || "default")}"
          data-scw-group-label="${escapeHtml(groupLabel || "")}">
        <td class="scw-level-total-label" colspan="999">
          <strong>${escapeHtml(label)} — Subtotal</strong>
          <span class="scw-level-total-value" style="float:right;">${escapeHtml(formatMoney(hasDiscount ? finalTotal : cost))}</span>
        </td>
      </tr>
    `;
    return $(html);
  }

  // ============================================================
  // CORE PIPELINE
  // ============================================================

  function runTotalsPipeline($root) {
    const $table = $root.find(".kn-table").first();
    if (!$table.length) return;

    const $tbody = $table.find("tbody").first();
    if (!$tbody.length) return;

    // Remove prior injected rows (idempotent)
    $tbody.find("tr.scw-level-total-row").remove();

    const ctx = {
      $root,
      $table,
      $tbody,
      keys: {
        qty: SCW_TOTALS_CONFIG.columns.qty,
        cost: SCW_TOTALS_CONFIG.columns.cost,
        discount: SCW_TOTALS_CONFIG.columns.discount,
      },
    };

    // group stack: each item = { level, label, contextKey, headerTr, endAnchorTr, sumCost, sumDiscount }
    const stack = [];
    const jobs = [];

    function openGroup($tr, level) {
      const label = findFirstCellText($tr);
      if (SCW_TOTALS_CONFIG.insert.skipBlankLabels && isBlankGroupLabel(label)) return;

      stack.push({
        level,
        label,
        contextKey: "default",
        headerTr: $tr[0],
        endAnchorTr: null,
        sumCost: 0,
        sumDiscount: 0,
      });
    }

    function closeGroupsAtOrAbove(level, anchorTr) {
      // Close all groups with level >= incoming level
      while (stack.length && stack[stack.length - 1].level >= level) {
        const g = stack.pop();
        g.endAnchorTr = anchorTr;

        const cost = g.sumCost;
        const disc = g.sumDiscount;

        // Normalize: discount amount should be positive magnitude for display;
        // but allow if you store as negative in-table (we’ll take abs for hasDiscount)
        const discountAbs = Math.abs(disc);
        const hasDiscount = discountAbs > 0.01;
        const finalTotal = hasDiscount ? (cost - discountAbs) : cost;

        jobs.push({
          level: g.level,
          leftText: g.label,
          cost,
          discount: discountAbs,
          finalTotal,
          hasDiscount,
          contextKey: g.contextKey,
          groupLabel: g.label,
          anchor: g.endAnchorTr, // insert BEFORE this anchor
        });
      }
    }

    function addToOpenGroups(cost, discount) {
      for (let i = 0; i < stack.length; i++) {
        stack[i].sumCost += cost;
        stack[i].sumDiscount += discount;
      }
    }

    const $rows = $tbody.children("tr");
    $rows.each(function () {
      const $tr = $(this);

      if (isInjectedSubtotalRow($tr)) return;

      if (isGroupRow($tr)) {
        const lvl = getGroupLevel($tr);
        if (lvl == null) return;

        // Close groups at same/higher before opening new
        closeGroupsAtOrAbove(lvl, $tr[0]);
        openGroup($tr, lvl);
        return;
      }

      if (isRecordRow($tr)) {
        // Pull values from configured columns
        const costText = $tr.children("td." + ctx.keys.cost).first().text();
        const discText = ctx.keys.discount
          ? $tr.children("td." + ctx.keys.discount).first().text()
          : "";

        const cost = parseMoney(costText);
        const disc = parseMoney(discText);

        // We treat discount column as an amount (either negative or positive);
        // group stores raw, then we abs() at close time.
        addToOpenGroups(cost, disc);
      }
    });

    // Close remaining groups at end (anchor = null means append)
    closeGroupsAtOrAbove(0, null);

    // Insert bottom-up (later rows first)
    for (let i = jobs.length - 1; i >= 0; i--) {
      const job = jobs[i];
      const $row = buildSubtotalRow(ctx, job);
      if (!$row || !$row.length) continue;

      if (job.anchor) {
        // ✅ PATCH: insert all TRs (1 or 3) safely
        $row.each(function () {
          job.anchor.parentNode.insertBefore(this, job.anchor);
        });
      } else {
        // append to end
        const frag = document.createDocumentFragment();
        $row.each(function () {
          frag.appendChild(this);
        });
        $tbody[0].appendChild(frag);
      }
    }
  }

  // ============================================================
  // HOOKS (Knack)
  // ============================================================

  function shouldRunForView(viewId) {
    const allow = SCW_TOTALS_CONFIG.views;
    if (!Array.isArray(allow) || allow.length === 0) return true;
    return allow.includes(viewId);
  }

  // Generic: run on any Knack view render that contains a table + groups
  $(document).on("knack-view-render.any", function (event, view, data) {
    const viewId = view && view.key ? view.key : null;
    if (viewId && !shouldRunForView(viewId)) return;

    const $root = $("#"+viewId);
    if (!$root.length) return;

    // Only run if there's a grouped kn-table
    const $t = $root.find(".kn-table");
    if (!$t.length) return;
    if (!$root.find("tr.kn-table-group, tr[class*='kn-group-level-']").length) return;

    runTotalsPipeline($root);
  });

  // Back-compat for older events some setups use: knack-view-render.view_XXXX
  $(document).on("knack-view-render", function (event, view, data) {
    if (!view || !view.key) return;
    if (!shouldRunForView(view.key)) return;

    const $root = $("#"+view.key);
    if (!$root.length) return;

    const $t = $root.find(".kn-table");
    if (!$t.length) return;
    if (!$root.find("tr.kn-table-group, tr[class*='kn-group-level-']").length) return;

    runTotalsPipeline($root);
  });

})();
