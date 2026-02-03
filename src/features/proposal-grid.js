/////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/**
 * SCW Totals Script - Optimized Version
 * Version: 2.0 - Fixes L4 duplication + preserves limited HTML (<b>, <br />)
 * Last Updated: 2026-02-02
 *
 * PATCHES:
 *  - Hide Level-3 header row when product-name group label is blank-ish (grouped by field_2208)
 *  - Restore camera concat for "drop" (Cameras/Entries) by expanding L2_CONTEXT.byLabel variants
 *  - L4 field_2019 injection is non-destructive + IDPOTENT
 *  - ✅ FIX: Prevent duplicate L4 label text when concat runs (concat now uses base label WITHOUT injected nodes)
 *  - ✅ FIX: Replace-if-same works even when Knack strips spaces around <b> tags (we normalize spacing)
 *  - ✅ BR NORMALIZE: preserve <br>, <br/>, <br />, and even </br> by normalizing all to "<br />"
 *  - ✅ NEW: When Level-2 is "Mounting Hardware", inject camera label list into Level-3 header (not Level-4)
 *  - ✅ NEW PATCH (2026-01-30): Hide stray blank Level-4 header rows (Knack creates a group for empty L4 grouping values)
 *
 * PATCH (2026-02-03):
 *  - L2_SECTION_RULES-driven behaviors for Services + Assumptions (by record id)
 *  - Hide subtotal filter when any matching L2 rule requests it
 *  - Hide Qty/Cost columns via visibility (preserve table alignment)
 *  - Add explicit class hook: .scw-l2--assumptions-id on L2 header row (assumptions record id)
 *
 * PATCH (2026-02-03b):
 *  - ✅ Hide Level-2 footer subtotal row when L2 label is "Assumptions" OR record ID is 697b7a023a31502ec68b3303
 *
 * PATCH (2026-02-03c):
 *  - ✅ Reorder Level-2 groups by numeric sort field (field_2218) using DOM reflow (Option 2)
 */
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================

  const VIEW_IDS = ['view_3301', 'view_3341', 'view_3371'];
  const EVENT_NS = '.scwTotals';

  // Your CSS references scene_1096; keep as explicit scene scope
  const STYLE_SCENE_IDS = ['scene_1096'];

  // Field keys
  const QTY_FIELD_KEY = 'field_1964';
  const LABOR_FIELD_KEY = 'field_2028';
  const HARDWARE_FIELD_KEY = 'field_2201';
  const COST_FIELD_KEY = 'field_2203';

  // ✅ NEW: L2 sort key (numeric field on record rows within each L2 group)
  const L2_SORT = {
    enabled: true,
    sortFieldKey: 'field_2218', // number field
    missingSortGoesLast: true,
  };

  // ✅ Hide L3 group header if product-name group label is blank-ish
  const HIDE_LEVEL3_WHEN_FIELD_BLANK = {
    enabled: true,
    fieldKey: 'field_2208',
  };

  // ✅ Hide stray blank Level-4 headers
  const HIDE_LEVEL4_WHEN_HEADER_BLANK = {
    enabled: true,
    cssClass: 'scw-hide-level4-header',
    requireField2019AlsoBlank: true,
  };

  // ✅ NEW: Hide L2 footer subtotal row for Assumptions (label OR id)
  const HIDE_L2_FOOTER = {
    enabled: true,
    labels: ['Assumptions'], // case-insensitive match via normKey
    recordIds: ['697b7a023a31502ec68b3303'],
  };

  // Level-2 Label Rewriting Configuration
  const LEVEL_2_LABEL_CONFIG = {
    enabled: true,
    selectorFieldKey: 'field_2228',
    rules: [
      {
        when: 'Video',
        match: 'exact',
        renames: {
          'Camera or Reader': 'Cameras',
          'Networking or Headend': 'NVRs, Switches, and Networking',
        },
      },
      {
        when: 'Access Control',
        match: 'exact',
        renames: {
          'Camera or Reader': 'Entries',
          'Networking or Headend': 'AC Controllers, Switches, and Networking',
        },
      },
      {
        when: 'video',
        match: 'contains',
        renames: {
          'Networking or Headend': 'NVR, Switches, and Networking',
        },
      },
    ],
  };

  const EACH_COLUMN = {
    enabled: false,
    fieldKey: 'field_1960',
  };

  // Camera label builder inputs (USED FOR BOTH L4 CAMERAS + L3 MOUNTING HARDWARE)
  const CONCAT = {
    enabled: true,
    onlyContextKey: 'drop',
    onlyLevel: 4,
    prefixFieldKey: 'field_2240',
    numberFieldKey: 'field_1951',
  };

  // ✅ For Mounting Hardware, inject camera list into Level-3 header (not Level-4)
  const CONCAT_L3_FOR_MOUNTING = {
    enabled: true,
    level2Label: 'Mounting Hardware',
    level: 3,
    cssClass: 'scw-concat-cameras--mounting',
  };

  // Context mapping for "drop" etc
  const L2_CONTEXT = {
    byId: {},
    byLabel: {
      'Cameras & Cabling': 'drop',
      'Cameras and Cabling': 'drop',
      'Cameras or Cabling': 'drop',
      'Camera or Reader': 'drop',
      'Cameras': 'drop',
      'Entries': 'drop',

      'Networking or Headend': 'headend',
      'Networking & Headend': 'headend',
      'NVRs, Switches, and Networking': 'headend',
      'NVR, Switches, and Networking': 'headend',
      'AC Controllers, Switches, and Networking': 'headend',

      'Services': 'services',
    },
  };

  const L2_SPECIALS = {
    mountingHardwareId: '',
    mountingHardwareLabel: 'Mounting Hardware',
    classOnLevel3: 'scw-level3--mounting-hardware',
  };

  const L2_SECTION_RULES = [
    {
      key: 'services',
      recordIds: ['6977caa7f246edf67b52cbcd'],
      labels: ['Services'],
      hideLevel3Summary: true,
      hideQtyCostColumns: true,
      hideSubtotalFilter: true,
      headerBackground: '',
      headerTextColor: '',
    },
    {
      key: 'assumptions',
      recordIds: ['697b7a023a31502ec68b3303'],
      labels: ['Assumptions'],
      hideLevel3Summary: true,
      hideQtyCostColumns: true,
      hideSubtotalFilter: true,
      headerBackground: '#f0f7ff',
      headerTextColor: '',
    },
  ];

  // ======================
  // CACHED UTILITIES
  // ======================

  const decoderElement = document.createElement('textarea');
  const htmlEscapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  const htmlEscapeRegex = /[&<>"']/g;

  function escapeHtml(str) {
    return String(str ?? '').replace(htmlEscapeRegex, (char) => htmlEscapeMap[char]);
  }

  function decodeEntities(str) {
    decoderElement.innerHTML = str;
    return decoderElement.value;
  }

  function norm(s) {
    return String(s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const normKeyCache = new Map();
  function normKey(s) {
    const key = String(s);
    if (normKeyCache.has(key)) return normKeyCache.get(key);
    const result = norm(s).toLowerCase();
    normKeyCache.set(key, result);
    return result;
  }

  function isBlankish(v) {
    const t = norm(v);
    return !t || t === '-' || t === '—' || t === '–';
  }

  function shouldHideLevel2Footer(level2Info) {
    if (!HIDE_L2_FOOTER.enabled) return false;

    const id = (level2Info?.recordId || '').trim();
    if (id && HIDE_L2_FOOTER.recordIds.includes(id)) return true;

    const labelKey = normKey(level2Info?.label || '');
    if (!labelKey) return false;

    return (HIDE_L2_FOOTER.labels || []).some((l) => normKey(l) === labelKey);
  }

  // ----------------------
  // LIMITED HTML SANITIZE
  // ----------------------

  // Allow only <b> and <br>
  const sanitizeRegex = /<\/?strong\b[^>]*>/gi;
  const removeTagsRegex = /<(?!\/?(br|b)\b)[^>]*>/gi;

  function normalizeBrVariants(html) {
    if (!html) return '';
    return String(html)
      .replace(/<\/\s*br\s*>/gi, '<br />') // tolerate invalid closing </br>
      .replace(/<\s*br\s*\/?\s*>/gi, '<br />'); // normalize all <br> forms
  }

  function normalizeBoldSpacing(html) {
    if (!html) return '';
    let out = String(html);
    out = out.replace(/([^\s>])\s*<b\b/gi, '$1 <b');
    out = out.replace(/<\/b>\s*([^\s<])/gi, '</b> $1');
    return out;
  }

  function sanitizeAllowOnlyBrAndB(html) {
    if (!html) return '';
    return normalizeBoldSpacing(
      normalizeBrVariants(html)
        .replace(sanitizeRegex, (tag) => tag.replace(/strong/gi, 'b'))
        .replace(removeTagsRegex, '')
        .replace(/<\/\s*br\s*>/gi, '<br />')
        .replace(/<\s*br\s*\/?\s*>/gi, '<br />')
    );
  }

  function plainTextFromLimitedHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return norm(tmp.textContent || '');
  }

  function formatMoney(n) {
    const num = Number(n || 0);
    return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
  }

  // ----------------------
  // ROW CACHE
  // ----------------------

  let rowCache = new WeakMap();
  function getRowCache(row) {
    let cache = rowCache.get(row);
    if (!cache) {
      cache = { cells: new Map(), nums: new Map(), texts: new Map() };
      rowCache.set(row, cache);
    }
    return cache;
  }

  function getRowCell(row, fieldKey) {
    const cache = getRowCache(row);
    if (cache.cells.has(fieldKey)) return cache.cells.get(fieldKey);
    const cell = row.querySelector(`td.${fieldKey}`);
    cache.cells.set(fieldKey, cell || null);
    return cell;
  }

  function getRowCellText(row, fieldKey) {
    const cache = getRowCache(row);
    if (cache.texts.has(fieldKey)) return cache.texts.get(fieldKey);
    const cell = getRowCell(row, fieldKey);
    const text = cell ? cell.textContent.trim() : '';
    cache.texts.set(fieldKey, text);
    return text;
  }

  function getRowNumericValue(row, fieldKey) {
    const cache = getRowCache(row);
    if (cache.nums.has(fieldKey)) return cache.nums.get(fieldKey);
    const cell = getRowCell(row, fieldKey);
    const value = cell ? parseFloat(cell.textContent.replace(/[^\d.-]/g, '')) : NaN;
    cache.nums.set(fieldKey, value);
    return value;
  }

  function sumField($rows, fieldKey) {
    let total = 0;
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const num = getRowNumericValue(rows[i], fieldKey);
      if (Number.isFinite(num)) total += num;
    }
    return total;
  }

  function sumFields($rows, fieldKeys) {
    const totals = {};
    fieldKeys.forEach((key) => (totals[key] = 0));
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const key of fieldKeys) {
        const num = getRowNumericValue(row, key);
        if (Number.isFinite(num)) totals[key] += num;
      }
    }
    return totals;
  }

  function getGroupLabelText($groupRow) {
    const $td = $groupRow.children('td').first();
    return $td.length ? norm($td.text()) : '';
  }

  function getLabelCellTextWithoutInjected(labelCell) {
    const clone = labelCell.cloneNode(true);
    clone.querySelectorAll('.scw-l4-2019, br.scw-l4-2019-br').forEach((n) => n.remove());
    return norm(clone.textContent || '');
  }

  function getLabelCellHtmlWithoutInjected(labelCell) {
    const clone = labelCell.cloneNode(true);
    clone.querySelectorAll('.scw-l4-2019, br.scw-l4-2019-br').forEach((n) => n.remove());
    return clone.innerHTML || '';
  }

  // ======================
  // ✅ L2 GROUP REORDER (Option 2) — within each L1 section
  // ======================

  function getSortValueForL2Block(l2HeaderEl, stopEl) {
    // Scan forward until stopEl (next L2 or next L1 or end) and read td.field_2218 from first data row found
    let cur = l2HeaderEl.nextElementSibling;

    while (cur && cur !== stopEl) {
      if (cur.id && cur.tagName === 'TR') {
        const cell = cur.querySelector(`td.${L2_SORT.sortFieldKey}`);
        if (cell) {
          const raw = norm(cell.textContent || '');
          const num = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
          if (Number.isFinite(num)) return num;
        }
      }
      // stop if we hit any group header that is <= level 2 (safety)
      if (cur.classList?.contains('kn-table-group')) {
        const m = cur.className.match(/kn-group-level-(\d+)/);
        const lvl = m ? parseInt(m[1], 10) : null;
        if (lvl !== null && lvl <= 2) break;
      }
      cur = cur.nextElementSibling;
    }

    return null;
  }

  function reorderLevel2GroupsBySortField($tbody, viewId, runId) {
    if (!L2_SORT.enabled) return;
    const tbody = $tbody?.[0];
    if (!tbody) return;

    // prevent repeated work per render cycle
    const stampKey = 'scwL2ReorderStamp';
    if (tbody.dataset[stampKey] === String(runId)) return;
    tbody.dataset[stampKey] = String(runId);

    const l1Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1'));
    if (!l1Headers.length) return;

    const missing = L2_SORT.missingSortGoesLast ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

    for (let i = 0; i < l1Headers.length; i++) {
      const l1El = l1Headers[i];
      const nextL1El = i + 1 < l1Headers.length ? l1Headers[i + 1] : null;

      // Collect all nodes in this L1 section (excluding the L1 header itself)
      const sectionNodes = [];
      let cur = l1El.nextElementSibling;
      while (cur && cur !== nextL1El) {
        sectionNodes.push(cur);
        cur = cur.nextElementSibling;
      }
      if (!sectionNodes.length) continue;

      // Find L2 headers within this section
      const l2Headers = sectionNodes.filter(
        (n) =>
          n.classList &&
          n.classList.contains('kn-table-group') &&
          n.classList.contains('kn-group-level-2')
      );
      if (l2Headers.length < 2) continue;

      const firstL2 = l2Headers[0];

      // Preserve any nodes BEFORE the first L2 (rare, but safe)
      const prefixNodes = [];
      cur = l1El.nextElementSibling;
      while (cur && cur !== nextL1El && cur !== firstL2) {
        prefixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      // Build L2 blocks: header + everything until next L2 or next L1
      const blocks = l2Headers.map((l2El, idx) => {
        const nextL2El = idx + 1 < l2Headers.length ? l2Headers[idx + 1] : null;

        const nodes = [];
        let n = l2El;
        while (n && n !== nextL1El && n !== nextL2El) {
          nodes.push(n);
          n = n.nextElementSibling;
        }

        const sortVal = getSortValueForL2Block(l2El, nextL2El || nextL1El);
        return { idx, sortVal, nodes };
      });

      // Anything after the last L2 block but before next L1 (again, rare)
      const lastBlockLastNode = blocks[blocks.length - 1].nodes[blocks[blocks.length - 1].nodes.length - 1];
      const suffixNodes = [];
      cur = lastBlockLastNode ? lastBlockLastNode.nextElementSibling : null;
      while (cur && cur !== nextL1El) {
        suffixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      // Sort blocks by numeric sortVal
      blocks.sort((a, b) => {
        const av = Number.isFinite(a.sortVal) ? a.sortVal : missing;
        const bv = Number.isFinite(b.sortVal) ? b.sortVal : missing;
        if (av !== bv) return av - bv;
        return a.idx - b.idx; // stable
      });

      // Reinsert: prefixNodes + sorted blocks + suffixNodes, placed immediately after L1 header
      const frag = document.createDocumentFragment();
      for (const n of prefixNodes) frag.appendChild(n); // moves node
      for (const block of blocks) for (const n of block.nodes) frag.appendChild(n);
      for (const n of suffixNodes) frag.appendChild(n);

      // Insert before nextL1El (or append at end); nodes are already moved out of place by fragment appends
      if (nextL1El) tbody.insertBefore(frag, nextL1El);
      else tbody.appendChild(frag);
    }

    // Debug hook:
    // console.debug(`[SCW totals][${viewId}] Reordered L2 groups by ${L2_SORT.sortFieldKey}`);
  }

  // ======================
  // CSS (INJECTED) — FIXED MULTI-VIEW SELECTORS
  // ======================

  let cssInjected = false;
  function injectCssOnce() {
    if (cssInjected) return;

    // If the style tag already exists (navigation back/forward or multiple bundles), don't duplicate.
    if (document.getElementById('scw-totals-css')) {
      cssInjected = true;
      return;
    }

    cssInjected = true;

    const sceneSelectors = STYLE_SCENE_IDS.map((id) => `#kn-${id}`).join(', ');

    // ✅ IMPORTANT: build a comma-list where EACH selector includes the suffix
    function sel(suffix) {
      return VIEW_IDS.map((id) => `#${id} ${suffix}`.trim()).join(', ');
    }

    const style = document.createElement('style');
    style.id = 'scw-totals-css';

    style.textContent = `
/* ============================================================
   SCW Totals helper CSS (existing)
   ============================================================ */
tr.scw-level-total-row.scw-subtotal td { vertical-align: middle; }
tr.scw-level-total-row.scw-subtotal .scw-level-total-label { white-space: nowrap; }

.scw-concat-cameras { line-height: 1.2; }
.scw-concat-cameras--mounting { line-height: 1.15; }

.scw-l4-2019 { display: inline-block; margin-top: 2px; line-height: 1.2; }
.scw-l4-2019-br { line-height: 0; }

.scw-l4-2019 b,
.scw-concat-cameras b,
.scw-l4-2019 strong,
.scw-concat-cameras strong {
  font-weight: 800 !important;
}

.scw-each { line-height: 1.1; }
.scw-each__label { font-weight: 700; opacity: .9; margin-bottom: 2px; }

tr.scw-hide-level3-header { display: none !important; }
tr.scw-hide-level4-header { display: none !important; }

/* ✅ Hide Qty/Cost content while preserving column layout */
tr.scw-hide-qty-cost td.${QTY_FIELD_KEY},
tr.scw-hide-qty-cost td.${COST_FIELD_KEY} { visibility: hidden !important; }


/* ============================================================
   YOUR PROVIDED CSS — APPLIED TO ALL VIEW_IDS (correctly)
   ============================================================ */

/********************* OVERAL -- GRID ***********************/
${sceneSelectors} h2 {font-weight: 800; color: #07467c; font-size: 24px;}

${sel('.kn-pagination .kn-select')} { display: none !important; }
${sel('> div.kn-records-nav > div.level > div.level-left > div.kn-entries-summary')} { display: none !important; }

/* This hides all data rows (leaves only group headers + totals rows) */
${sel('.kn-table tbody tr[id]')} { display: none !important; }

/* Hide vertical borders in the grid */
${sel('.kn-table th')},
${sel('.kn-table td')} { border-left: none !important; border-right: none !important; }

${sel('.kn-table tbody td')} { vertical-align: middle; }
/********************* OVERAL -- GRID ***********************/


/********************* LEVEL 1 (MDF/IDF) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-1 {
  font-size: 16px;
  font-weight: 600;
  background-color: white !important;
  color: #07467c !important;
  padding-right: 20% !important;
  padding-left: 20px !important;
  padding-top: 30px !important;
  padding-bottom: 0px !important;
  text-align: center !important;
}
${sceneSelectors} .kn-table-group.kn-group-level-1 td:first-child {font-size: 24px; font-weight: 200 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-1 td {border-bottom-width: 20px !important; border-color: #07467c !important;}

${sel('tr.scw-subtotal--level-1 td')} {
  background: RGB(7, 70, 124, 1);
  border-top:1px solid #dadada;
  font-weight:600;
  color: white;
  text-align: right;
  border-bottom-width: 80px;
  border-color: transparent;
  font-size: 16px;
}
${sel('tr.scw-grand-total-sep td')} { height:10px; background:transparent; border:none !important; }
${sel('tr.scw-grand-total-row td')} {
  background:white;
  border-top:2px solid #bbb !important;
  font-weight:800;
  color: #07467c;
  font-size: 20px;
  text-align: right;
}
/********************* LEVEL 1 (MDF/IDF) ***********************/


/********************* LEVEL 2 (BUCKET) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-2 {
  font-size: 16px;
  font-weight: 400 !important;
  background-color: aliceblue !important;
  color: #07467c;
}
${sceneSelectors} .kn-table-group.kn-group-level-2 td {padding: 5px 0px 5px 20px !important; border-top: 20px solid transparent !important;}
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-l2--assumptions td {font-weight: 600 !important;}

${sel('tr.scw-subtotal--level-2 td')} {
  background: aliceblue;
  border-top:1px solid #dadada;
  font-weight:800 !important;
  color: #07467c;
  text-align: center !important;
  border-bottom-width: 20px !important;
  border-color: transparent;
}
${sel('tr.scw-subtotal--level-2 td:first-child')} {text-align: right !important;}
/********************* LEVEL 2 (BUCKET) ***********************/


/********************* LEVEL 3 (PRODUCT) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-3 {background-color: white !important; color: #07467c;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td {padding-top: 10px !important; font-weight: 300 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:first-child {font-size: 20px;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:nth-last-child(-n+3) {font-weight:600 !important;}

${sel('tr.kn-table-group.kn-group-level-3.scw-level3--mounting-hardware td:first-child')} {
  padding-left: 80px !important;
  font-size: 14px !important;
  font-weight: 400 !important;
}
/********************* LEVEL 3 (PRODUCT) ***********************/


/********************* LEVEL 4 (INSTALL DESCRIPTION) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-4 {background-color: white !important; color: #07467c;}
${sceneSelectors} .kn-table-group.kn-group-level-4 td:nth-last-child(-n+3) {font-weight:600 !important; color: #07467c !important;}
${sceneSelectors} .kn-table-group.kn-group-level-4 td {padding-top: 5px !important; font-weight: 300;}
${sceneSelectors} .kn-table-group.kn-group-level-4 td:first-child {padding-left:80px !important;}

.scw-l4-2019 b {font-weight: 600 !important;}
/********************* LEVEL 4 (INSTALL DESCRIPTION) ***********************/
`;

    document.head.appendChild(style);
  }

  // ======================
  // RECORD-ID EXTRACTION
  // ======================

  function extractRecordIdFromElement(el) {
    if (!el) return null;

    const direct = el.getAttribute('data-record-id') || el.getAttribute('data-id');
    if (direct) return direct.trim();

    const nested = el.querySelector('[data-record-id],[data-id]');
    if (nested) {
      const nestedId = nested.getAttribute('data-record-id') || nested.getAttribute('data-id');
      if (nestedId) return nestedId.trim();
    }

    const a = el.querySelector('a[href]');
    if (a) {
      const href = a.getAttribute('href') || '';
      const patterns = [/\/records\/([A-Za-z0-9]+)/i, /\/record\/([A-Za-z0-9]+)/i, /[?&]id=([A-Za-z0-9]+)/i];
      for (const pattern of patterns) {
        const match = href.match(pattern);
        if (match?.[1]) return match[1];
      }
    }

    return null;
  }

  function getLevel2InfoFromGroupRow($groupRow) {
    const el = $groupRow[0];
    if (!el) return { label: null, recordId: null };

    const td = el.querySelector('td:first-child');
    const label = td ? norm(td.textContent) : null;
    const recordId = extractRecordIdFromElement(td);

    return { label, recordId };
  }

  function contextKeyFromLevel2Info(level2Info) {
    const id = level2Info?.recordId;
    const label = level2Info?.label;

    if (id && L2_CONTEXT.byId[id]) return L2_CONTEXT.byId[id];
    if (label && L2_CONTEXT.byLabel[label]) return L2_CONTEXT.byLabel[label];
    return 'default';
  }

  function matchesLevel2Rule(level2Info, rule) {
    if (!level2Info || !rule) return false;
    const id = level2Info.recordId ? level2Info.recordId.trim() : '';
    if (id && Array.isArray(rule.recordIds) && rule.recordIds.includes(id)) return true;

    const label = norm(level2Info.label);
    if (!label || !Array.isArray(rule.labels)) return false;
    return rule.labels.some((entry) => norm(entry) === label);
  }

  function getLevel2Rule(level2Info) {
    for (const rule of L2_SECTION_RULES) {
      if (matchesLevel2Rule(level2Info, rule)) return rule;
    }
    return null;
  }

  let nearestL2Cache = new WeakMap();
  function getNearestLevel2Info($row) {
    const el = $row[0];
    if (nearestL2Cache.has(el)) return nearestL2Cache.get(el);

    let current = el.previousElementSibling;
    while (current) {
      const classList = current.classList;
      if (classList.contains('kn-group-level-2')) {
        const result = getLevel2InfoFromGroupRow($(current));
        nearestL2Cache.set(el, result);
        return result;
      }
      if (classList.contains('kn-group-level-1')) break;
      current = current.previousElementSibling;
    }

    const result = { label: null, recordId: null };
    nearestL2Cache.set(el, result);
    return result;
  }

  function applyLevel2Styling($groupRow, rule) {
    if (!rule || !$groupRow?.length) return;
    $groupRow.addClass(`scw-l2--${rule.key}`);

    // ✅ explicit hook for assumptions record-id bucket
    if (rule.key === 'assumptions') {
      $groupRow.addClass('scw-l2--assumptions-id');
    }

    if (rule.headerBackground) $groupRow.css('background-color', rule.headerBackground);
    if (rule.headerTextColor) $groupRow.css('color', rule.headerTextColor);
  }

  // ======================
  // LEVEL-2 LABEL REWRITING
  // ======================

  function getSelectorFieldValue($row) {
    const $cell = $row.find(`td.${LEVEL_2_LABEL_CONFIG.selectorFieldKey}`).first();
    if (!$cell.length) return '';

    const attrs = ['data-raw-value', 'data-value', 'data-id', 'data-record-id'];
    for (const attr of attrs) {
      const val = $cell.attr(attr);
      if (val) return norm(val);
    }

    const $nested = $cell.find('[data-raw-value],[data-value],[data-id],[data-record-id]').first();
    if ($nested.length) {
      for (const attr of attrs) {
        const val = $nested.attr(attr);
        if (val) return norm(val);
      }
    }

    const titleish = $cell.attr('title') || $cell.attr('aria-label');
    if (titleish) return norm(titleish);

    return norm($cell.text());
  }

  function valueMatchesRule(value, rule) {
    const v = normKey(value);
    const w = normKey(rule.when);
    if (!v || !w) return false;
    return rule.match === 'contains' ? v.includes(w) : v === w;
  }

  function findRuleForSection($rowsInSection) {
    if (!LEVEL_2_LABEL_CONFIG.enabled || !LEVEL_2_LABEL_CONFIG.rules) return null;

    const values = new Set();

    $rowsInSection.filter('tr[id]').each(function () {
      const val = getSelectorFieldValue($(this));
      if (val) values.add(val);
    });

    if (values.size === 0) {
      $rowsInSection.each(function () {
        const val = getSelectorFieldValue($(this));
        if (val) values.add(val);
      });
    }

    for (const val of values) {
      for (const rule of LEVEL_2_LABEL_CONFIG.rules) {
        if (valueMatchesRule(val, rule)) return rule;
      }
    }
    return null;
  }

  function applyLevel2LabelRewrites($tbody, runId) {
    if (!LEVEL_2_LABEL_CONFIG.enabled) return;

    const $l1 = $tbody.find('tr.kn-table-group.kn-group-level-1');
    if (!$l1.length) return;

    for (let idx = 0; idx < $l1.length; idx++) {
      const $start = $l1.eq(idx);
      const $nextL1 = idx + 1 < $l1.length ? $l1.eq(idx + 1) : null;

      const $rowsInSection = $nextL1 ? $start.nextUntil($nextL1).addBack() : $start.nextAll().addBack();

      const rule = findRuleForSection($rowsInSection);
      if (!rule?.renames) continue;

      $rowsInSection.filter('tr.kn-table-group.kn-group-level-2').each(function () {
        const $groupRow = $(this);

        if ($groupRow.data(`scwL2Rewrite_${runId}`)) return;
        $groupRow.data(`scwL2Rewrite_${runId}`, true);

        const $td = $groupRow.children('td').first();
        if (!$td.length) return;

        const currentLabel = norm($td.text());
        const newLabel = rule.renames[currentLabel];

        if (newLabel) {
          const $a = $td.find('a');
          if ($a.length) $a.text(newLabel);
          else $td.text(newLabel);
        }
      });

      $rowsInSection
        .filter('tr.scw-level-total-row.scw-subtotal[data-scw-subtotal-level="2"]')
        .each(function () {
          const $tr = $(this);
          const gl = norm($tr.attr('data-scw-group-label'));
          const replacement = rule.renames[gl];
          if (!replacement) return;

          $tr.attr('data-scw-group-label', replacement);
          $tr.find('.scw-level-total-label strong').text(replacement);
        });
    }
  }

  // ======================
  // GROUP BOUNDARY DETECTION
  // ======================

  function getGroupBlock($groupRow, levelNum) {
    const nodes = [];
    let current = $groupRow[0].nextElementSibling;

    while (current) {
      if (current.classList.contains('kn-table-group')) {
        const match = current.className.match(/kn-group-level-(\d+)/);
        const currentLevel = match ? parseInt(match[1], 10) : null;
        if (currentLevel !== null && currentLevel <= levelNum) break;
      }
      nodes.push(current);
      current = current.nextElementSibling;
    }

    return $(nodes);
  }

  // ======================
  // CAMERA LIST BUILDER (USED FOR BOTH L4 + L3)
  // ======================

  function buildCameraListHtml($rows) {
    const items = [];
    const rows = $rows.get();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const prefix = getRowCellText(row, CONCAT.prefixFieldKey);
      const numRaw = getRowCellText(row, CONCAT.numberFieldKey);
      if (!prefix || !numRaw) continue;

      const digits = numRaw.replace(/\D/g, '');
      const num = parseInt(digits, 10);
      if (!Number.isFinite(num)) continue;

      const prefixUpper = prefix.toUpperCase();
      items.push({ prefix: prefixUpper, num, text: `${prefixUpper}${digits}` });
    }

    if (!items.length) return '';

    items.sort((a, b) => (a.prefix === b.prefix ? a.num - b.num : a.prefix < b.prefix ? -1 : 1));
    return items.map((it) => escapeHtml(it.text)).join(', ');
  }

  // ======================
  // FIELD_2019 INJECTION (L4)
  // ======================

  function injectField2019IntoLevel4Header({ level, $groupRow, $rowsToSum, runId }) {
    if (level !== 4 || !$groupRow.length || !$rowsToSum.length) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    labelCell.querySelectorAll('.scw-l4-2019').forEach((n) => n.remove());
    labelCell.querySelectorAll('br.scw-l4-2019-br').forEach((n) => n.remove());

    const firstRow = $rowsToSum[0];
    const fieldCell = firstRow ? firstRow.querySelector('td.field_2019') : null;
    if (!fieldCell) return;

    let html = sanitizeAllowOnlyBrAndB(decodeEntities(fieldCell.innerHTML || ''));
    const fieldPlain = plainTextFromLimitedHtml(html);
    if (!fieldPlain) return;

    const currentLabelPlain = getLabelCellTextWithoutInjected(labelCell);

    const looksLikeSameText =
      currentLabelPlain &&
      (currentLabelPlain === fieldPlain || currentLabelPlain.includes(fieldPlain) || fieldPlain.includes(currentLabelPlain));

    if (looksLikeSameText) {
      labelCell.innerHTML = `<span class="scw-l4-2019">${html}</span>`;
      $groupRow.data('scwL4_2019_RunId', runId);
      return;
    }

    const br = document.createElement('br');
    br.className = 'scw-l4-2019-br';
    labelCell.appendChild(br);

    const span = document.createElement('span');
    span.className = 'scw-l4-2019';
    span.innerHTML = html;
    labelCell.appendChild(span);

    $groupRow.data('scwL4_2019_RunId', runId);
  }

  // ======================
  // CONCAT INJECTION (L4 "drop")
  // ======================

  function injectConcatIntoHeader({ level, contextKey, $groupRow, $rowsToSum, runId }) {
    if (!CONCAT.enabled || level !== CONCAT.onlyLevel || contextKey !== CONCAT.onlyContextKey) return;
    if ($groupRow.data('scwConcatRunId') === runId) return;
    $groupRow.data('scwConcatRunId', runId);

    const cameraListHtml = buildCameraListHtml($rowsToSum);
    if (!cameraListHtml) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    const injected = labelCell.querySelector('.scw-l4-2019');
    let baseHtml = '';

    if (injected) {
      baseHtml = injected.innerHTML || '';
    } else {
      baseHtml = getLabelCellHtmlWithoutInjected(labelCell);
      baseHtml = sanitizeAllowOnlyBrAndB(decodeEntities(baseHtml));
    }

    const composed =
      `<div class="scw-concat-cameras">` +
      `${sanitizeAllowOnlyBrAndB(decodeEntities(baseHtml))}` +
      `<br /><b style="color:orange;"> (${cameraListHtml})</b>` +
      `</div>`;

    labelCell.innerHTML = composed;
  }

  // ======================
  // CONCAT INJECTION (L3 Mounting Hardware)
  // ======================

  function injectConcatIntoLevel3HeaderForMounting({ $groupRow, $rowsToSum, runId }) {
    if (!CONCAT.enabled) return;
    if (!CONCAT_L3_FOR_MOUNTING.enabled) return;
    if (!$groupRow.length || !$rowsToSum.length) return;

    if ($groupRow.data('scwConcatL3MountRunId') === runId) return;
    $groupRow.data('scwConcatL3MountRunId', runId);

    const cameraListHtml = buildCameraListHtml($rowsToSum);
    if (!cameraListHtml) return;

    const $labelCell = $groupRow.children('td').first();
    if (!$labelCell.length) return;

    const currentHtml = $labelCell.html() || '';
    const sanitizedBase = sanitizeAllowOnlyBrAndB(decodeEntities(currentHtml));

    $labelCell.html(
      `<div class="scw-concat-cameras ${CONCAT_L3_FOR_MOUNTING.cssClass}">` +
        `${sanitizedBase}<br />` +
        `<b style="color:orange;">(${cameraListHtml})</b>` +
        `</div>`
    );
  }

  // ======================
  // EACH COLUMN
  // ======================

  function injectEachIntoLevel3Header({ level, $groupRow, $rowsToSum, runId }) {
    if (!EACH_COLUMN.enabled || level !== 3) return;
    if (!$groupRow.length || !$rowsToSum.length) return;
    if ($groupRow.data('scwL3EachRunId') === runId) return;
    $groupRow.data('scwL3EachRunId', runId);

    const $target = $groupRow.find(`td.${EACH_COLUMN.fieldKey}`);
    if (!$target.length) return;

    const firstRow = $rowsToSum[0];
    const num = getRowNumericValue(firstRow, EACH_COLUMN.fieldKey);
    if (!Number.isFinite(num)) return;

    $target.html(`
      <div class="scw-each">
        <div class="scw-each__label">each</div>
        <div>${escapeHtml(formatMoney(num))}</div>
      </div>
    `);
  }

  // ======================
  // ROW BUILDERS
  // ======================

  function buildSubtotalRow({
    $cellsTemplate,
    $rowsToSum,
    labelOverride,
    level,
    contextKey,
    groupLabel,
    qtyFieldKey,
    costFieldKey,
    costSourceKey,
    totals,
    hideQtyCost,
  }) {
    const leftText = labelOverride || groupLabel || '';

    const qty = totals?.[qtyFieldKey] ?? sumField($rowsToSum, qtyFieldKey);
    const cost = totals?.[costSourceKey] ?? sumField($rowsToSum, costSourceKey);

    const $row = $(`
      <tr
        class="scw-level-total-row scw-subtotal scw-subtotal--level-${level}${hideQtyCost ? ' scw-hide-qty-cost' : ''}"
        data-scw-subtotal-level="${level}"
        data-scw-context="${escapeHtml(contextKey || 'default')}"
        data-scw-group-label="${escapeHtml(groupLabel || '')}"
      >
        <td class="scw-level-total-label"><strong>${escapeHtml(leftText)}</strong></td>
      </tr>
    `);

    $row.append($cellsTemplate.clone());

    $row.find(`td.${qtyFieldKey}`).html(`<strong>${Math.round(qty)}</strong>`);
    $row.find(`td.${costFieldKey}`).html(`<strong>${escapeHtml(formatMoney(cost))}</strong>`);
    $row.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();

    return $row;
  }

  // ======================
  // MAIN PROCESSOR
  // ======================

  function addGroupTotalsRuleDriven(view) {
    const runId = Date.now();
    const $tbody = $(`#${view.key} .kn-table tbody`);
    if (!$tbody.length || $tbody.find('.kn-tr-nodata').length) return;

    nearestL2Cache = new WeakMap();
    normKeyCache.clear();
    rowCache = new WeakMap();

    $tbody
      .find('tr')
      .removeData(['scwConcatRunId', 'scwConcatL3MountRunId', 'scwL4_2019_RunId', 'scwL3EachRunId', 'scwHeaderCellsAdded']);

    $tbody.find('tr.scw-level-total-row').remove();
    $tbody
      .find(`tr.kn-table-group.kn-group-level-3.${L2_SPECIALS.classOnLevel3}`)
      .removeClass(L2_SPECIALS.classOnLevel3);

    // ✅ Reorder L2 groups BEFORE computing blocks/totals and BEFORE label rewrites
    reorderLevel2GroupsBySortField($tbody, view.key, runId);

    const $firstDataRow = $tbody.find('tr[id]').first();
    if (!$firstDataRow.length) return;

    const $cellsTemplate = $firstDataRow.find('td:gt(0)').clone().empty();
    const $allGroupRows = $tbody.find('tr.kn-table-group');

    const sectionContext = {
      level2: { label: null, recordId: null },
      key: 'default',
      rule: null,
      hideLevel3Summary: false,
      hideQtyCostColumns: false,
    };

    const footerQueue = [];
    let shouldHideSubtotalFilter = false;

    $allGroupRows.each(function () {
      const $groupRow = $(this);
      const match = this.className.match(/kn-group-level-(\d+)/);
      if (!match) return;

      const level = parseInt(match[1], 10);

      if (level === 2) {
        const info = getLevel2InfoFromGroupRow($groupRow);
        sectionContext.level2 = info;
        sectionContext.key = contextKeyFromLevel2Info(info);
        sectionContext.rule = getLevel2Rule(info);
        sectionContext.hideLevel3Summary = Boolean(sectionContext.rule?.hideLevel3Summary);
        sectionContext.hideQtyCostColumns = Boolean(sectionContext.rule?.hideQtyCostColumns);
        shouldHideSubtotalFilter = shouldHideSubtotalFilter || Boolean(sectionContext.rule?.hideSubtotalFilter);

        applyLevel2Styling($groupRow, sectionContext.rule);
      }

      const $groupBlock = getGroupBlock($groupRow, level);
      if (!$groupBlock.length) return;

      const $rowsToSum = $groupBlock.filter('tr[id]');
      if (!$rowsToSum.length) return;

      const totals = sumFields($rowsToSum, [QTY_FIELD_KEY, LABOR_FIELD_KEY, HARDWARE_FIELD_KEY, COST_FIELD_KEY]);

      if (level === 1) {
        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }
        $groupRow.find(`td.${QTY_FIELD_KEY}`).html('<strong>Qty</strong>');
        $groupRow.find(`td.${COST_FIELD_KEY}`).html('<strong>Cost</strong>');
        $groupRow.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();
      }

      if (level === 3) {
        $groupRow.removeClass('scw-hide-level3-header').show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        if (sectionContext.hideLevel3Summary) {
          $groupRow.addClass('scw-hide-level3-header');
          return;
        }

        if (HIDE_LEVEL3_WHEN_FIELD_BLANK.enabled) {
          const labelText = getGroupLabelText($groupRow);
          if (isBlankish(labelText)) {
            $groupRow.addClass('scw-hide-level3-header');
            return;
          }
        }

        const nearestL2 = getNearestLevel2Info($groupRow);
        const isMounting =
          (L2_SPECIALS.mountingHardwareId && nearestL2.recordId === L2_SPECIALS.mountingHardwareId) ||
          (!L2_SPECIALS.mountingHardwareId && norm(nearestL2.label) === norm(L2_SPECIALS.mountingHardwareLabel));

        if (isMounting) {
          $groupRow.addClass(L2_SPECIALS.classOnLevel3);
          injectConcatIntoLevel3HeaderForMounting({ $groupRow, $rowsToSum, runId });
        }

        const qty = totals[QTY_FIELD_KEY];
        const hardware = totals[HARDWARE_FIELD_KEY];

        $groupRow.find(`td.${QTY_FIELD_KEY}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${COST_FIELD_KEY}`).html(`<strong>${escapeHtml(formatMoney(hardware))}</strong>`);
        $groupRow.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();

        if (sectionContext.hideQtyCostColumns) {
          $groupRow.addClass('scw-hide-qty-cost');
        }

        injectEachIntoLevel3Header({ level, $groupRow, $rowsToSum, runId });
      }

      if (level === 4) {
        $groupRow.removeClass(HIDE_LEVEL4_WHEN_HEADER_BLANK.cssClass).show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        if (HIDE_LEVEL4_WHEN_HEADER_BLANK.enabled) {
          const headerText = getGroupLabelText($groupRow);

          let field2019Text = '';
          if (HIDE_LEVEL4_WHEN_HEADER_BLANK.requireField2019AlsoBlank) {
            const firstRow = $rowsToSum[0];
            const cell2019 = firstRow ? firstRow.querySelector('td.field_2019') : null;
            field2019Text = cell2019 ? norm(cell2019.textContent || '') : '';
          }

          if (
            isBlankish(headerText) &&
            (!HIDE_LEVEL4_WHEN_HEADER_BLANK.requireField2019AlsoBlank || isBlankish(field2019Text))
          ) {
            $groupRow.addClass(HIDE_LEVEL4_WHEN_HEADER_BLANK.cssClass);
          }
        }

        injectField2019IntoLevel4Header({ level, $groupRow, $rowsToSum, runId });

        const qty = totals[QTY_FIELD_KEY];
        const labor = totals[LABOR_FIELD_KEY];

        $groupRow.find(`td.${QTY_FIELD_KEY}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${COST_FIELD_KEY}`).html(`<strong>${escapeHtml(formatMoney(labor))}</strong>`);
        $groupRow.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();

        if (sectionContext.hideQtyCostColumns) {
          $groupRow.addClass('scw-hide-qty-cost');
        }

        injectConcatIntoHeader({ level, contextKey: sectionContext.key, $groupRow, $rowsToSum, runId });
      }

      if (level === 1 || level === 2) {
        const levelInfo = level === 2 ? sectionContext.level2 : getLevel2InfoFromGroupRow($groupRow);

        if (level === 2 && shouldHideLevel2Footer(levelInfo)) {
          return;
        }

        footerQueue.push({
          level,
          label: levelInfo.label,
          contextKey: sectionContext.key,
          hideQtyCostColumns: sectionContext.hideQtyCostColumns,
          $groupBlock,
          $cellsTemplate,
          $rowsToSum,
          totals,
        });
      }
    });

    const footersByAnchor = new Map();
    for (const item of footerQueue) {
      const anchorEl = item.$groupBlock.last()[0];
      if (!anchorEl) continue;
      if (!footersByAnchor.has(anchorEl)) footersByAnchor.set(anchorEl, []);
      footersByAnchor.get(anchorEl).push(item);
    }

    const anchors = Array.from(footersByAnchor.keys())
      .sort((a, b) => {
        if (a === b) return 0;
        const pos = a.compareDocumentPosition(b);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
      })
      .reverse();

    for (const anchorEl of anchors) {
      const items = footersByAnchor.get(anchorEl);

      items.sort((a, b) =>
        a.level === 2 && b.level === 1 ? -1 : a.level === 1 && b.level === 2 ? 1 : b.level - a.level
      );

      const fragment = document.createDocumentFragment();

      for (const item of items) {
        const $row = buildSubtotalRow({
          $cellsTemplate: item.$cellsTemplate,
          $rowsToSum: item.$rowsToSum,
          labelOverride: item.level === 1 ? `${item.label} — Subtotal` : null,
          level: item.level,
          contextKey: item.contextKey,
          groupLabel: item.label,
          qtyFieldKey: QTY_FIELD_KEY,
          costFieldKey: COST_FIELD_KEY,
          costSourceKey: COST_FIELD_KEY,
          totals: item.totals,
          hideQtyCost: item.hideQtyCostColumns,
        });

        fragment.appendChild($row[0]);
      }

      anchorEl.parentNode.insertBefore(fragment, anchorEl.nextSibling);
    }

    applyLevel2LabelRewrites($tbody, runId);
    if (shouldHideSubtotalFilter) {
      hideSubtotalFilter(view.key);
    }
  }

  function hideSubtotalFilter(viewId) {
    const viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    const filterSelectors = ['.kn-filters .kn-filter', '.kn-table-filters .kn-filter', '.kn-records-nav .kn-filter'];

    const filters = viewEl.querySelectorAll(filterSelectors.join(', '));
    for (const filter of filters) {
      if (filter.dataset.scwHideSubtotalFilter === '1') continue;
      const text = normKey(filter.textContent || '');
      if (text.includes('subtotal')) {
        filter.style.display = 'none';
        filter.dataset.scwHideSubtotalFilter = '1';
      }
    }
  }

  // ======================
  // FIELD_2019 NORMALIZE (FOR GROUPING)
  // ======================

  function normalizeField2019ForGrouping(viewId) {
    const cells = document.querySelectorAll(`#${viewId} .kn-table td.field_2019`);
    for (const cell of cells) {
      if (cell.dataset.scwNormalized === '1') continue;

      let html = sanitizeAllowOnlyBrAndB(decodeEntities(cell.innerHTML || ''));
      html = normalizeBrVariants(html)
        .replace(/\s*<br\s*\/?>\s*/gi, '<br />')
        .replace(/\s*<b>\s*/gi, '<b>')
        .replace(/\s*<\/b>\s*/gi, '</b>')
        .trim();

      cell.innerHTML = html;
      cell.dataset.scwNormalized = '1';
    }
  }

  // ======================
  // EVENT BINDING
  // ======================

  function bindForView(viewId) {
    const ev = `knack-records-render.${viewId}${EVENT_NS}`;
    $(document)
      .off(ev)
      .on(ev, function (event, view) {
        if (!document.getElementById(viewId)) return;

        injectCssOnce();
        normalizeField2019ForGrouping(viewId);

        requestAnimationFrame(() => {
          try {
            addGroupTotalsRuleDriven(view);
          } catch (error) {
            console.error(`[SCW totals][${viewId}] error:`, error);
          }
        });
      });
  }

  VIEW_IDS.forEach(bindForView);
})();
