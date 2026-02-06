/////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/**
 * SCW Proposal Grid Subtotals + Styling Patch
 * Version: 2.2.0
 * Last Updated: 2026-02-05
 *
 * FIXES IN THIS PATCH:
 *  ✅ Subtotal label cell is RIGHT-ALIGNED (and does NOT wrap mid-label)
 *  ✅ Qty column stays visible (Quantities back)
 *  ✅ Subtotal “money” column gets a sane min-width so it doesn’t crush everything
 *  ✅ Subtotal row always matches the table column count (prevents “broke entirely” DOM issues)
 *
 * NOTES:
 *  - This script detects the real column count + column indexes from the <thead>.
 *  - It inserts L2 subtotals at the end of each L2 section and L1 subtotals at the end of each L1 section.
 *  - It is idempotent (re-renders won’t duplicate subtotals).
 */

(function () {
  // ======================
  // CONFIG
  // ======================
  const SCENE_IDS = ['scene_1085'];     // update if needed
  const VIEW_IDS  = ['view_3301'];      // update if needed

  // Column “keys” (from your DOM)
  const COL_LABEL_KEY = 'field_2019';   // where we put "XYZ — Subtotal"
  const COL_QTY_KEY   = 'field_1964';   // quantity column you said you need back
  const COL_TOTAL_KEY = 'field_2203';   // total column
  const COL_TAX_KEY   = 'field_2267';   // optional (kept if present)

  const EVENT_NS = '.scwProposalSubtotals';

  // ======================
  // CSS (Injected)
  // ======================
  function ensureStyleTag() {
    const id = 'scw-proposal-subtotals-style';
    if (document.getElementById(id)) return;

    const css = `
/* --- SCW Subtotal Row Styling --- */
tr.scw-subtotal td {
  vertical-align: middle;
}

/* Right-align + NO wrap for subtotal label (fix "final\\n total") */
tr.scw-subtotal td.scw-subtotal-label,
tr.scw-subtotal td.${COL_LABEL_KEY} {
  text-align: right !important;
  white-space: nowrap !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
}

/* Keep qty visible + readable */
tr.scw-subtotal td.${COL_QTY_KEY} {
  text-align: center !important;
  white-space: nowrap !important;
  min-width: 64px;
}

/* Give totals/tax columns breathing room so they don't crush text */
tr.scw-subtotal td.${COL_TOTAL_KEY} {
  white-space: nowrap !important;
  min-width: 120px;
  text-align: center !important;
}
tr.scw-subtotal td.${COL_TAX_KEY} {
  white-space: nowrap !important;
  min-width: 90px;
  text-align: center !important;
}

/* Slight emphasis */
tr.scw-subtotal td.scw-subtotal-label strong {
  font-weight: 700;
}
`;
    const style = document.createElement('style');
    style.id = id;
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ======================
  // Helpers
  // ======================
  function parseMoney(text) {
    const n = String(text || '')
      .replace(/[,\s]/g, '')
      .replace(/\$/g, '')
      .trim();
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : 0;
  }

  function parseNumber(text) {
    const n = String(text || '').replace(/[,\s]/g, '').trim();
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : 0;
  }

  function formatMoney(v) {
    try {
      return v.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
    } catch {
      // fallback
      const s = (Math.round((v || 0) * 100) / 100).toFixed(2);
      return `$${s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
    }
  }

  function getTable(viewId) {
    const root = document.getElementById(viewId);
    if (!root) return null;
    return root.querySelector('table.kn-table');
  }

  function getColIndexMap(table) {
    const map = {};
    const ths = Array.from(table.querySelectorAll('thead th'));
    ths.forEach((th, idx) => {
      // th class includes field_#### keys
      const cls = Array.from(th.classList).find(c => /^field_\d+$/.test(c));
      if (cls) map[cls] = idx;
    });
    return { map, count: ths.length };
  }

  function clearExistingSubtotals(tbody) {
    tbody.querySelectorAll('tr.scw-subtotal').forEach(tr => tr.remove());
  }

  function isGroupRow(tr) {
    return tr.classList.contains('kn-table-group');
  }

  function groupLevel(tr) {
    if (!isGroupRow(tr)) return 0;
    if (tr.classList.contains('kn-group-level-1')) return 1;
    if (tr.classList.contains('kn-group-level-2')) return 2;
    if (tr.classList.contains('kn-group-level-3')) return 3;
    if (tr.classList.contains('kn-group-level-4')) return 4;
    return 0;
  }

  function groupLabelText(tr) {
    const td = tr.querySelector('td');
    return td ? td.textContent.trim() : '';
  }

  function readCellText(row, colIdx) {
    if (colIdx == null || colIdx < 0) return '';
    const tds = row.querySelectorAll('td');
    const td = tds[colIdx];
    return td ? td.textContent.trim() : '';
  }

  function makeSubtotalRow({
    colCount,
    colIndex,
    level,
    labelText,
    qty,
    tax,
    total
  }) {
    const tr = document.createElement('tr');
    tr.className = `scw-level-total-row scw-subtotal scw-subtotal--level-${level}`;
    tr.setAttribute('data-scw-subtotal-level', String(level));

    // Build EXACT colCount tds to avoid DOM/table breakage.
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');

      // Put the correct field_#### class on the td when we can (so your existing CSS hooks still work)
      // We do it by mirroring the table’s column at that index, if known.
      // If unknown, leave it classless; table still stays aligned.
      const keyAtIndex = Object.keys(colIndex).find(k => colIndex[k] === i);
      if (keyAtIndex) td.classList.add(keyAtIndex);

      // Fill content for label / qty / tax / total
      if (i === colIndex[COL_LABEL_KEY]) {
        td.classList.add('scw-subtotal-label');
        td.innerHTML = `<strong>${escapeHtml(labelText)} — Subtotal</strong>`;
      } else if (i === colIndex[COL_QTY_KEY]) {
        td.textContent = qty ? String(qty) : '';
      } else if (i === colIndex[COL_TAX_KEY]) {
        td.textContent = tax ? formatMoney(tax) : '';
      } else if (i === colIndex[COL_TOTAL_KEY]) {
        td.textContent = total ? formatMoney(total) : formatMoney(0);
      } else {
        td.innerHTML = '&nbsp;';
      }

      tr.appendChild(td);
    }

    return tr;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ======================
  // Core: compute + insert subtotals
  // ======================
  function applySubtotals(viewId) {
    ensureStyleTag();

    const table = getTable(viewId);
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const { map: colIndex, count: colCount } = getColIndexMap(table);

    // Must have at least label + total columns, otherwise do nothing.
    if (colIndex[COL_LABEL_KEY] == null || colIndex[COL_TOTAL_KEY] == null) return;

    // Remove any previous run’s subtotal rows (idempotent)
    clearExistingSubtotals(tbody);

    const rows = Array.from(tbody.querySelectorAll(':scope > tr'));

    // Track current L1/L2 context and sums.
    let currentL1 = null; // { label, sumQty, sumTax, sumTotal, lastRowEl }
    let currentL2 = null; // same shape

    const pendingInserts = []; // { afterRowEl, trToInsert }

    function flushL2() {
      if (!currentL2 || !currentL2.lastRowEl) return;
      const tr = makeSubtotalRow({
        colCount,
        colIndex,
        level: 2,
        labelText: currentL2.label || 'Subtotal',
        qty: currentL2.sumQty,
        tax: currentL2.sumTax,
        total: currentL2.sumTotal
      });
      pendingInserts.push({ afterRowEl: currentL2.lastRowEl, trToInsert: tr });
      currentL2 = null;
    }

    function flushL1() {
      if (!currentL1 || !currentL1.lastRowEl) return;
      const tr = makeSubtotalRow({
        colCount,
        colIndex,
        level: 1,
        labelText: currentL1.label || 'Subtotal',
        qty: currentL1.sumQty,
        tax: currentL1.sumTax,
        total: currentL1.sumTotal
      });
      pendingInserts.push({ afterRowEl: currentL1.lastRowEl, trToInsert: tr });
      currentL1 = null;
    }

    function ensureL1(label) {
      if (!currentL1) {
        currentL1 = { label, sumQty: 0, sumTax: 0, sumTotal: 0, lastRowEl: null };
      } else if (label && currentL1.label !== label) {
        // Shouldn't happen often, but if it does, flush and re-open
        flushL2();
        flushL1();
        currentL1 = { label, sumQty: 0, sumTax: 0, sumTotal: 0, lastRowEl: null };
      }
    }

    function ensureL2(label) {
      if (!currentL2) {
        currentL2 = { label, sumQty: 0, sumTax: 0, sumTotal: 0, lastRowEl: null };
      } else if (label && currentL2.label !== label) {
        flushL2();
        currentL2 = { label, sumQty: 0, sumTax: 0, sumTotal: 0, lastRowEl: null };
      }
    }

    for (const tr of rows) {
      const lvl = groupLevel(tr);

      if (lvl === 1) {
        // New L1 begins: flush previous L2 + L1
        flushL2();
        flushL1();
        ensureL1(groupLabelText(tr));
        continue;
      }

      if (lvl === 2) {
        // New L2 begins: flush previous L2, keep L1
        flushL2();
        ensureL1(currentL1 ? currentL1.label : '');
        ensureL2(groupLabelText(tr));
        continue;
      }

      if (isGroupRow(tr)) {
        // L3/L4 headers: ignore for sums but not for “lastRow”
        continue;
      }

      // Data row
      // Update “last row” anchors (subtotals should go after the LAST data row within the section)
      if (currentL1) currentL1.lastRowEl = tr;
      if (currentL2) currentL2.lastRowEl = tr;

      // Sum fields
      const qty = colIndex[COL_QTY_KEY] != null ? parseNumber(readCellText(tr, colIndex[COL_QTY_KEY])) : 0;
      const tax = colIndex[COL_TAX_KEY] != null ? parseMoney(readCellText(tr, colIndex[COL_TAX_KEY])) : 0;
      const total = parseMoney(readCellText(tr, colIndex[COL_TOTAL_KEY]));

      if (currentL1) {
        currentL1.sumQty += qty;
        currentL1.sumTax += tax;
        currentL1.sumTotal += total;
      }
      if (currentL2) {
        currentL2.sumQty += qty;
        currentL2.sumTax += tax;
        currentL2.sumTotal += total;
      }
    }

    // End-of-table flush
    flushL2();
    flushL1();

    // Insert bottom-up to preserve anchors
    for (let i = pendingInserts.length - 1; i >= 0; i--) {
      const { afterRowEl, trToInsert } = pendingInserts[i];
      if (afterRowEl && afterRowEl.parentNode) {
        afterRowEl.parentNode.insertBefore(trToInsert, afterRowEl.nextSibling);
      }
    }
  }

  // ======================
  // Bind
  // ======================
  function shouldRun(scene) {
    return SCENE_IDS.includes('any') || SCENE_IDS.includes(scene.key);
  }

  $(document)
    .off(`knack-scene-render${EVENT_NS}`)
    .on(`knack-scene-render${EVENT_NS}`, function (event, scene) {
      if (!shouldRun(scene)) return;

      VIEW_IDS.forEach((viewId) => {
        // Run on render and again shortly after (Knack/KTL sometimes tweaks DOM after first paint)
        const run = () => applySubtotals(viewId);
        run();
        setTimeout(run, 250);
        setTimeout(run, 750);
      });
    });

})();
