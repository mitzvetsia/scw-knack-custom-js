/////*********** BID ITEMS GRID VIEW (effective Q1 2026) ***************//////
/**
 * SCW Bid Items Grid Script - Adapted from proposal-grid.js
 * Simplified: labor-only subtotals, no hardware/cost/discount columns,
 * no field2019 injection, no hideL3WhenBlank, no hideBlankL4Headers.
 *
 * Created: 2026-03-03
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG (ONLY PLACE YOU SHOULD EDIT FOR NEW VIEWS / FIELDS)
  // ============================================================

  const CONFIG = {
    views: {
      view_3550: {
        showProjectTotals: true,
        keys: {
          qty: 'field_2399',
          rate: 'field_2400',
          labor: 'field_2401',
          prefix: 'field_2361',
          number: 'field_2362',
          field2409: 'field_2409',
          product: 'field_2365',  // product / item name — shown above the labor desc
          subBidRequired: 'field_2478',  // "sub bid required" (No = present but not bid)
          l2Sort: 'field_2218',
          l2Selector: 'field_2228',
          conduit: 'field_2368',  // per-row conduit feet — summed into the L3 drop header
        },
      },
    },

    styleSceneIds: ['scene_1149'],

    features: {
      l2Sort: { enabled: true, missingSortGoesLast: true },

      level2LabelRewrite: {
        enabled: true,
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
      },

      concat: { enabled: true, onlyContextKey: 'drop', onlyLevel: 3 },

      concatL3Mounting: {
        enabled: true,
        level2Label: 'Mounting Hardware',
        level: 3,
        cssClass: 'scw-concat-cameras--mounting',
      },

      hideL2Footer: {
        enabled: true,
        labels: ['Assumptions'],
        recordIds: ['697b7a023a31502ec68b3303'],
      },
    },

    l2Context: {
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

        Services: 'services',
      },
    },

    l2SectionRules: [
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
    ],

    l2Specials: {
      mountingHardwareId: '',
      mountingHardwareLabel: 'Mounting Hardware',
      classOnLevel3: 'scw-level3--mounting-hardware',
    },

    debug: false,
    eventNs: '.scwBidItems',
    cssId: 'scw-bid-items-css',
  };

  // ============================================================
  // SMALL UTILITIES
  // ============================================================

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

  function formatMoney(n) {
    const num = Number(n || 0);
    return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
  }

  function log(ctx, ...args) {
    if (!CONFIG.debug) return;
    // eslint-disable-next-line no-console
    SCW.debug(`[SCW bid-items][${ctx.viewId}]`, ...args);
  }

  // ============================================================
  // LIMITED HTML SANITIZE (Allow only <b> and <br>)
  // ============================================================

  const sanitizeRegex = /<\/?strong\b[^>]*>/gi;
  const removeTagsRegex = /<(?!\/?(br|b)\b)[^>]*>/gi;

  function normalizeBrVariants(html) {
    if (!html) return '';
    return String(html)
      .replace(/<\/\s*br\s*>/gi, '<br />')
      .replace(/<\s*br\s*\/?\s*>/gi, '<br />');
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

  // ============================================================
  // ROW CACHE (per run)
  // ============================================================

  function makeRunCaches() {
    return {
      rowCache: new WeakMap(),
      nearestL2Cache: new WeakMap(),
    };
  }

  function getRowCache(caches, row) {
    let cache = caches.rowCache.get(row);
    if (!cache) {
      cache = { cells: new Map(), nums: new Map(), texts: new Map() };
      caches.rowCache.set(row, cache);
    }
    return cache;
  }

  function getRowCell(caches, row, fieldKey) {
    const cache = getRowCache(caches, row);
    if (cache.cells.has(fieldKey)) return cache.cells.get(fieldKey);
    const cell = row.querySelector(`td.${fieldKey}`);
    cache.cells.set(fieldKey, cell || null);
    return cell;
  }

  function getRowCellText(caches, row, fieldKey) {
    const cache = getRowCache(caches, row);
    if (cache.texts.has(fieldKey)) return cache.texts.get(fieldKey);
    const cell = getRowCell(caches, row, fieldKey);
    const text = cell ? cell.textContent.trim() : '';
    cache.texts.set(fieldKey, text);
    return text;
  }

  function getRowNumericValue(caches, row, fieldKey) {
    const cache = getRowCache(caches, row);
    if (cache.nums.has(fieldKey)) return cache.nums.get(fieldKey);
    const cell = getRowCell(caches, row, fieldKey);
    const value = cell ? parseFloat(cell.textContent.replace(/[^\d.-]/g, '')) : NaN;
    cache.nums.set(fieldKey, value);
    return value;
  }

  function sumField(caches, $rows, fieldKey) {
    let total = 0;
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const num = getRowNumericValue(caches, rows[i], fieldKey);
      if (Number.isFinite(num)) total += num;
    }
    return total;
  }

  function sumFields(caches, $rows, fieldKeys) {
    const totals = {};
    fieldKeys.forEach((key) => (totals[key] = 0));
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const key of fieldKeys) {
        const num = getRowNumericValue(caches, row, key);
        if (Number.isFinite(num)) totals[key] += num;
      }
    }
    return totals;
  }

  function avgField(caches, $rows, fieldKey) {
    let total = 0;
    let count = 0;
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const num = getRowNumericValue(caches, rows[i], fieldKey);
      if (Number.isFinite(num) && num !== 0) {
        total += num;
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }

  // ============================================================
  // DOM HELPERS (view-scoped only)
  // ============================================================

  function buildCtx(viewId, view) {
    const vcfg = CONFIG.views[viewId];
    if (!vcfg) return null;

    const root = document.getElementById(viewId);
    if (!root) return null;

    const $root = $(root);
    const $tbody = $root.find('.kn-table tbody');

    return {
      viewId,
      view,
      $root,
      $tbody,
      keys: vcfg.keys,
      showProjectTotals: vcfg.showProjectTotals !== false,
      features: CONFIG.features,
      l2Context: CONFIG.l2Context,
      l2SectionRules: CONFIG.l2SectionRules,
      l2Specials: CONFIG.l2Specials,
    };
  }

  function getGroupLabelText($groupRow) {
    const $td = $groupRow.children('td').first();
    return $td.length ? norm($td.text()) : '';
  }

  // ============================================================
  // COLUMN META: real colCount + indices of qty/labor columns
  // ============================================================

  function computeColumnMeta(ctx) {
    const firstRow = ctx.$root.find('.kn-table tbody tr[id]').first()[0];
    const colCount = firstRow ? firstRow.querySelectorAll('td').length : 0;

    let qtyIdx = -1;
    let laborIdx = -1;

    const ths = ctx.$root.find('.kn-table thead th').get();
    if (ths && ths.length) {
      qtyIdx = ths.findIndex((th) => th.classList && th.classList.contains(ctx.keys.qty));
      laborIdx = ths.findIndex((th) => th.classList && th.classList.contains(ctx.keys.labor));
    }

    if (firstRow) {
      const tds = Array.from(firstRow.querySelectorAll('td'));
      if (qtyIdx < 0) qtyIdx = tds.findIndex((td) => td.classList && td.classList.contains(ctx.keys.qty));
      if (laborIdx < 0) laborIdx = tds.findIndex((td) => td.classList && td.classList.contains(ctx.keys.labor));
    }

    // Visible-column variants. Columns hidden per-cell by CSS class
    // (field_2409, field_2478) or KTL column-hiding never render — but a
    // colspan can't skip them, so footer rows built with LOGICAL counts lay
    // out wider than the data rows and their value cell drifts one column
    // right of Cost. Count only ths that actually render.
    let visibleColCount = 0;
    let visibleQtyIdx = -1;
    let visibleLaborIdx = -1;
    for (let i = 0; i < ths.length; i++) {
      let hidden = false;
      try { hidden = window.getComputedStyle(ths[i]).display === 'none'; } catch (e) { /* count as visible */ }
      if (hidden) continue;
      if (i === qtyIdx) visibleQtyIdx = visibleColCount;
      if (i === laborIdx) visibleLaborIdx = visibleColCount;
      visibleColCount++;
    }
    // Whole table hidden mid-render → every th reads display:none and the
    // visible metrics are meaningless. Fall back to the logical ones.
    if (!visibleColCount) {
      visibleColCount = colCount;
      visibleQtyIdx = qtyIdx;
      visibleLaborIdx = laborIdx;
    }

    return {
      colCount: Math.max(colCount, 0), qtyIdx, laborIdx,
      visibleColCount: Math.max(visibleColCount, 0), visibleQtyIdx, visibleLaborIdx,
    };
  }

  // ============================================================
  // FEATURE: CSS injection (multi-view safe)
  // ============================================================

  let cssInjected = false;
  function injectCssOnce() {
    if (cssInjected) return;

    if (document.getElementById(CONFIG.cssId)) {
      cssInjected = true;
      return;
    }

    cssInjected = true;

    const sceneSelectors = (CONFIG.styleSceneIds || []).map((id) => `#kn-${id}`).join(', ');
    const viewIds = Object.keys(CONFIG.views);

    function sel(suffix) {
      return viewIds.map((id) => `#${id} ${suffix}`.trim()).join(', ');
    }

    const anyView = CONFIG.views[viewIds[0]];
    const QTY_FIELD_KEY = anyView?.keys?.qty || 'field_2399';
    const RATE_FIELD_KEY = anyView?.keys?.rate || 'field_2400';
    const LABOR_FIELD_KEY = anyView?.keys?.labor || 'field_2401';

    const style = document.createElement('style');
    style.id = CONFIG.cssId;

    style.textContent = `
/* ============================================================
   SCW Bid Items Grid helper CSS
   ============================================================ */
tr.scw-level-total-row.scw-subtotal td { vertical-align: middle; }
tr.scw-level-total-row.scw-subtotal .scw-level-total-label { white-space: nowrap; }

.scw-concat-cameras { line-height: 1.2; }
.scw-concat-cameras--mounting { line-height: 1.15; }

.scw-concat-cameras b,
.scw-concat-cameras strong { font-weight: 800 !important; }

.scw-l3-2409 { display: inline; line-height: 1.2; }
.scw-l3-2409 b,
.scw-l3-2409 strong { font-weight: 800 !important; }

/* Product name(s) shown above the labor description on an L3 header. */
.scw-l3-product { font-weight: 800 !important; color: #07467c; line-height: 1.3; }
/* Hide the raw field_2478 ("sub bid required") column — read as a data source. */
th.field_2478, td.field_2478 { display: none !important; }
/* An L3 group whose every item is no-sub-bid — hidden; items move to the
   "Other Associated Equipment" section below. */
tr.scw-assoc-hidden { display: none !important; }
/* "Other Associated Equipment" callout (no Rate/Qty/Cost columns). */
tr.scw-assoc-equip-head td {
  padding-left: 20px !important; padding-top: 14px !important;
  font-weight: 600 !important; color: #475569 !important; font-style: italic;
}
tr.scw-assoc-equip-list td { padding-left: 40px !important; padding-top: 2px !important; }
tr.scw-assoc-equip-list .scw-l3-product { font-weight: 600 !important; color: #334155; }

/* Hide the raw field_2409 column (data lives in data rows for injection) */
th.field_2409, td.field_2409 { display: none !important; }

tr.scw-hide-level3-header { display: none !important; }

/* Prevent KTL ktlDisplayNone_hc from collapsing hidden-column cells in our
   custom rows.  Group headers don't get the class so their cells stay visible;
   subtotals DO get it, causing column-count mismatch.  Force table-cell so
   every row keeps the same column structure. */
tr.scw-level-total-row td.ktlDisplayNone_hc { display: table-cell !important; }

/* Hide Qty/Rate content while preserving column layout
   GUARD: never hide on L1 subtotal rows */
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${QTY_FIELD_KEY} { visibility: hidden !important; }
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${RATE_FIELD_KEY} { visibility: hidden !important; }
tr.scw-hide-cost td.${LABOR_FIELD_KEY} { visibility: hidden !important; }

/* ============================================================
   L1 footer layout (true rows)
   ============================================================ */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line-row td { background: inherit !important; }

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-title{
  text-align: right;
  font-weight: 700;
  margin: 6px 0 0px;
  vertical-align: bottom;
  white-space: normal;
  overflow-wrap: anywhere;
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-label{
  text-align: right;
  opacity: .85;
  font-weight: 600;
  white-space: nowrap;
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-value{
  text-align: right;
  font-weight: 700;
  white-space: nowrap;
}

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--final .scw-l1-label,
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--final .scw-l1-value{
  color: #07467c !important;
  font-weight: 900 !important;
}

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--final .scw-l1-value{
  font-size: 18px;
}

/* 80px whitespace ABOVE the first L1 footer row */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-first-row td{
  border-top: 20px solid transparent !important;
  border-bottom: 5px solid #07467c !important;
}

/* 80px whitespace BELOW the last L1 footer row */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-last-row td{
  border-bottom: 60px solid #fff !important;
}

tr.scw-level-total-row.scw-subtotal--level-1 td.scw-l1-valuecell {
  text-align: center !important;
}
tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-value {
  text-align: center;
}

/* ============================================================
   Project Grand Totals
   ============================================================ */
tr.scw-level-total-row.scw-project-totals.scw-project-totals-first-row .scw-l1-title {
  font-size: 2.2em !important;
  font-weight: 600 !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals-first-row td {
  border-top: 20px solid transparent !important;
  border-bottom: 5px solid #07467c !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals-last-row td {
  border-bottom: 60px solid #fff !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals--grand .scw-l1-label {
  font-size: 21px !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals--grand .scw-l1-value {
  font-size: 23px !important;
}

/* ============================================================
   VIEW-SCOPED CSS — APPLIED TO ALL CONFIG.views
   ============================================================ */

/********************* OVERALL -- GRID ***********************/
${sceneSelectors} h2 {font-weight: 800; color: #07467c; font-size: 24px;}

${sel('.kn-pagination .kn-select')} { display: none !important; }
${sel('> div.kn-records-nav > div.level > div.level-left > div.kn-entries-summary')} { display: none !important; }

/* This hides all data rows (leaves only group headers + totals rows) */
${sel('.kn-table tbody tr[id]')} { display: none !important; }

/* Hide vertical borders in the grid */
${sel('.kn-table th')},
${sel('.kn-table td')} { border-left: none !important; border-right: none !important; }

${sel('.kn-table tbody td')} { vertical-align: middle; }
/********************* OVERALL -- GRID ***********************/


/********************* LEVEL 1 (MDF/IDF) *********************/
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
  border-top:0px solid #dadada;
  font-weight:600;
  color: #07467c;
  text-align: right;
  border-bottom-width: 0px;
  border-color: #07467c;
  font-size: 16px;
}

${sel('tr.scw-level-total-row.scw-subtotal--level-1')} {
  background: transparent !important;
}
${sel('tr.scw-level-total-row.scw-subtotal--level-1 td')} {
  background: inherit !important;
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

/*** Promoted L2 (blank L1 → L2 acts as L1) ***/
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-promoted-l2-as-l1 {
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
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-promoted-l2-as-l1 td:first-child {font-size: 24px; font-weight: 200 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-promoted-l2-as-l1 td {border-bottom-width: 20px !important; border-color: #07467c !important; border-top: 0 !important;}

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


/********************* LEVEL 3 (INSTALL DESCRIPTION) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-3 {background-color: white !important; color: #07467c;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:nth-last-child(-n+3) {font-weight:600 !important; color: #07467c !important;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td {padding-top: 5px !important; font-weight: 300;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:first-child {padding-left:80px !important;}

${sel('tr.kn-table-group.kn-group-level-3.scw-level3--mounting-hardware td:first-child')} {
  font-size: 14px !important;
  font-weight: 400 !important;
}
/********************* LEVEL 3 (INSTALL DESCRIPTION) ***********************/
`;

    document.head.appendChild(style);
  }

  // ============================================================
  // FEATURE: Record-ID extraction + L2 helpers
  // ============================================================

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

  function contextKeyFromLevel2Info(ctx, level2Info) {
    const id = level2Info?.recordId;
    const label = level2Info?.label;

    if (id && ctx.l2Context.byId[id]) return ctx.l2Context.byId[id];
    if (label && ctx.l2Context.byLabel[label]) return ctx.l2Context.byLabel[label];
    return 'default';
  }

  function matchesLevel2Rule(level2Info, rule) {
    if (!level2Info || !rule) return false;

    const id = (level2Info.recordId || '').trim();
    if (id && Array.isArray(rule.recordIds) && rule.recordIds.includes(id)) return true;

    const label = norm(level2Info.label);
    if (!label || !Array.isArray(rule.labels)) return false;

    return rule.labels.some((entry) => norm(entry) === label);
  }

  function getLevel2Rule(ctx, level2Info) {
    for (const rule of ctx.l2SectionRules) {
      if (matchesLevel2Rule(level2Info, rule)) return rule;
    }
    return null;
  }

  function applyLevel2Styling($groupRow, rule) {
    if (!rule || !$groupRow?.length) return;
    $groupRow.addClass(`scw-l2--${rule.key}`);

    if (rule.key === 'assumptions') $groupRow.addClass('scw-l2--assumptions-id');

    if (rule.headerBackground) $groupRow.css('background-color', rule.headerBackground);
    if (rule.headerTextColor) $groupRow.css('color', rule.headerTextColor);
  }

  function shouldHideLevel2Footer(ctx, level2Info) {
    const opt = ctx.features.hideL2Footer;
    if (!opt?.enabled) return false;

    const id = (level2Info?.recordId || '').trim();
    if (id && (opt.recordIds || []).includes(id)) return true;

    const labelKey = normKey(level2Info?.label || '');
    if (!labelKey) return false;

    return (opt.labels || []).some((l) => normKey(l) === labelKey);
  }

  // ============================================================
  // FEATURE: Nearest L2 cache
  // ============================================================

  function makeNearestLevel2InfoFinder() {
    return function getNearestLevel2Info(caches, $row) {
      const el = $row[0];
      if (caches.nearestL2Cache.has(el)) return caches.nearestL2Cache.get(el);

      let current = el.previousElementSibling;
      while (current) {
        const classList = current.classList;
        if (classList.contains('kn-group-level-2')) {
          const result = getLevel2InfoFromGroupRow($(current));
          caches.nearestL2Cache.set(el, result);
          return result;
        }
        if (classList.contains('kn-group-level-1')) break;
        current = current.previousElementSibling;
      }

      const result = { label: null, recordId: null };
      caches.nearestL2Cache.set(el, result);
      return result;
    };
  }
  const getNearestLevel2Info = makeNearestLevel2InfoFinder();

  // ============================================================
  // FEATURE: L2 Label rewriting
  // ============================================================

  function getSelectorFieldValue(ctx, $row) {
    const selectorKey = ctx.keys.l2Selector;
    const $cell = $row.find(`td.${selectorKey}`).first();
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

  function findRuleForSection(ctx, $rowsInSection) {
    const opt = ctx.features.level2LabelRewrite;
    if (!opt?.enabled || !opt.rules) return null;

    const values = new Set();

    $rowsInSection.filter('tr[id]').each(function () {
      const val = getSelectorFieldValue(ctx, $(this));
      if (val) values.add(val);
    });

    if (values.size === 0) {
      $rowsInSection.each(function () {
        const val = getSelectorFieldValue(ctx, $(this));
        if (val) values.add(val);
      });
    }

    for (const val of values) {
      for (const rule of opt.rules) {
        if (valueMatchesRule(val, rule)) return rule;
      }
    }
    return null;
  }

  function applyLevel2LabelRewrites(ctx, $tbody, runId) {
    const opt = ctx.features.level2LabelRewrite;
    if (!opt?.enabled) return;

    const $l1 = $tbody.find('tr.kn-table-group.kn-group-level-1');
    if (!$l1.length) return;

    for (let idx = 0; idx < $l1.length; idx++) {
      const $start = $l1.eq(idx);
      const $nextL1 = idx + 1 < $l1.length ? $l1.eq(idx + 1) : null;

      const $rowsInSection = $nextL1 ? $start.nextUntil($nextL1).addBack() : $start.nextAll().addBack();

      const rule = findRuleForSection(ctx, $rowsInSection);
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

  // ============================================================
  // FEATURE: Group boundary detection
  // ============================================================

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

  // ============================================================
  // FEATURE: L1 group reorder — alphabetical, blank labels last
  // ============================================================

  function reorderLevel1Groups($tbody) {
    const tbody = $tbody?.[0];
    if (!tbody) return;

    const l1Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1'));
    if (l1Headers.length < 2) return;

    const blocks = l1Headers.map((l1El, idx) => {
      const nextL1El = idx + 1 < l1Headers.length ? l1Headers[idx + 1] : null;
      const nodes = [];
      let n = l1El;
      while (n && n !== nextL1El) {
        nodes.push(n);
        n = n.nextElementSibling;
      }
      const label = norm(l1El.querySelector('td')?.textContent || '');
      return { idx, label, nodes };
    });

    blocks.sort((a, b) => {
      const aBlank = a.label === '';
      const bBlank = b.label === '';
      if (aBlank !== bBlank) return aBlank ? 1 : -1;
      return a.label.localeCompare(b.label);
    });

    const frag = document.createDocumentFragment();
    for (const block of blocks) {
      for (const n of block.nodes) frag.appendChild(n);
    }
    tbody.appendChild(frag);
  }

  // ============================================================
  // FEATURE: L2 group reorder — within each L1 section
  // ============================================================

  function getSortValueForL2Block(ctx, l2HeaderEl, stopEl) {
    const sortKey = ctx.keys.l2Sort;
    let cur = l2HeaderEl.nextElementSibling;

    while (cur && cur !== stopEl) {
      if (cur.id && cur.tagName === 'TR') {
        const cell = cur.querySelector(`td.${sortKey}`);
        if (cell) {
          const raw = norm(cell.textContent || '');
          const num = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
          if (Number.isFinite(num)) return num;
        }
      }

      if (cur.classList?.contains('kn-table-group')) {
        const m = cur.className.match(/kn-group-level-(\d+)/);
        const lvl = m ? parseInt(m[1], 10) : null;
        if (lvl !== null && lvl <= 2) break;
      }
      cur = cur.nextElementSibling;
    }

    return null;
  }

  function reorderLevel2GroupsBySortField(ctx, $tbody, runId) {
    const opt = ctx.features.l2Sort;
    if (!opt?.enabled) return;

    const tbody = $tbody?.[0];
    if (!tbody) return;

    const stampKey = 'scwL2ReorderStamp';
    if (tbody.dataset[stampKey] === String(runId)) return;
    tbody.dataset[stampKey] = String(runId);

    const l1Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1'));
    if (!l1Headers.length) return;

    const missing = opt.missingSortGoesLast ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

    for (let i = 0; i < l1Headers.length; i++) {
      const l1El = l1Headers[i];
      const nextL1El = i + 1 < l1Headers.length ? l1Headers[i + 1] : null;

      const sectionNodes = [];
      let cur = l1El.nextElementSibling;
      while (cur && cur !== nextL1El) {
        sectionNodes.push(cur);
        cur = cur.nextElementSibling;
      }
      if (!sectionNodes.length) continue;

      const l2Headers = sectionNodes.filter(
        (n) => n.classList && n.classList.contains('kn-table-group') && n.classList.contains('kn-group-level-2')
      );
      if (l2Headers.length < 2) continue;

      const firstL2 = l2Headers[0];

      const prefixNodes = [];
      cur = l1El.nextElementSibling;
      while (cur && cur !== nextL1El && cur !== firstL2) {
        prefixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      const blocks = l2Headers.map((l2El, idx) => {
        const nextL2El = idx + 1 < l2Headers.length ? l2Headers[idx + 1] : null;

        const nodes = [];
        let n = l2El;
        while (n && n !== nextL1El && n !== nextL2El) {
          nodes.push(n);
          n = n.nextElementSibling;
        }

        const sortVal = getSortValueForL2Block(ctx, l2El, nextL2El || nextL1El);
        return { idx, sortVal, nodes };
      });

      const lastBlock = blocks[blocks.length - 1];
      const lastBlockLastNode = lastBlock.nodes[lastBlock.nodes.length - 1];

      const suffixNodes = [];
      cur = lastBlockLastNode ? lastBlockLastNode.nextElementSibling : null;
      while (cur && cur !== nextL1El) {
        suffixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      blocks.sort((a, b) => {
        const av = Number.isFinite(a.sortVal) ? a.sortVal : missing;
        const bv = Number.isFinite(b.sortVal) ? b.sortVal : missing;
        if (av !== bv) return av - bv;
        return a.idx - b.idx;
      });

      const frag = document.createDocumentFragment();
      for (const n of prefixNodes) frag.appendChild(n);
      for (const block of blocks) for (const n of block.nodes) frag.appendChild(n);
      for (const n of suffixNodes) frag.appendChild(n);

      if (nextL1El) tbody.insertBefore(frag, nextL1El);
      else tbody.appendChild(frag);
    }
  }

  // ============================================================
  // FEATURE: Heal orphaned camera ("drop") rows
  // ============================================================
  //
  // Knack groups this view natively by MDF/bucket but the view is SORTED by
  // a non-group field (field_2404). When that sort places a bucket's rows
  // such that Knack never opens a group header for them, the rows render as
  // raw "prefix" rows directly under the L1 header — with no L2 "Camera or
  // Reader" header and no L3 drop header. The concat/reorder key off those
  // headers, so the orphaned cameras get skipped entirely (observed: HEADEND
  // cameras rendering ungrouped while every other MDF's cameras grouped fine).
  //
  // Self-heal: for each L1 section, gather the prefix DROP rows (rows before
  // the first L2 header that carry a drop prefix), and splice them into a
  // proper "Camera or Reader" L2+L3 block cloned from a working one so the
  // existing pipeline (sort into position + concat) handles them identically.
  function healOrphanDropGroups(ctx, $tbody, caches) {
    const tbody = $tbody && $tbody[0];
    if (!tbody || !ctx.features.concat?.enabled) return;
    const dropCtx = ctx.features.concat.onlyContextKey; // 'drop'

    // Locate a template drop L2 header + its following L3 header to clone.
    let tmplL2 = null, tmplL3 = null;
    const allL2 = tbody.querySelectorAll('tr.kn-table-group.kn-group-level-2');
    for (const l2 of allL2) {
      if (contextKeyFromLevel2Info(ctx, getLevel2InfoFromGroupRow($(l2))) !== dropCtx) continue;
      const nxt = l2.nextElementSibling;
      if (nxt && nxt.classList?.contains('kn-group-level-3')) { tmplL2 = l2; tmplL3 = nxt; break; }
    }
    if (!tmplL2 || !tmplL3) return; // nothing to clone from — can't heal safely

    const l1Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1'));
    for (let i = 0; i < l1Headers.length; i++) {
      const l1El = l1Headers[i];
      const nextL1El = i + 1 < l1Headers.length ? l1Headers[i + 1] : null;

      // Walk to the first L2 header, collecting drop-prefix data rows on the way.
      const prefixDrops = [];
      let cur = l1El.nextElementSibling;
      while (cur && cur !== nextL1El) {
        if (cur.classList?.contains('kn-table-group')) {
          const m = cur.className.match(/kn-group-level-(\d+)/);
          if (m && parseInt(m[1], 10) <= 2) break; // reached the first L2 — stop
        }
        if (cur.id && cur.tagName === 'TR' && getRowCellText(caches, cur, ctx.keys.prefix)) {
          prefixDrops.push(cur);
        }
        cur = cur.nextElementSibling;
      }
      if (!prefixDrops.length) continue;

      // Build a fresh "Camera or Reader" L2 + L3 from the template.
      const newL2 = tmplL2.cloneNode(true);
      const newL3 = tmplL3.cloneNode(true);
      $(newL2).removeData(); $(newL3).removeData();
      newL2.classList.remove('scw-promoted-l2-as-l1'); // never promoted here
      // Strip any injected camera-concat content so it re-injects fresh.
      const cc = newL3.querySelector('.scw-concat-cameras');
      if (cc) { while (cc.firstChild) cc.parentNode.insertBefore(cc.firstChild, cc); cc.remove(); }

      const ref = prefixDrops[0];
      ref.parentNode.insertBefore(newL2, ref);
      newL2.parentNode.insertBefore(newL3, ref);
      // Pull every drop-prefix row up directly under the new L3 (consecutive).
      let after = newL3;
      for (const r of prefixDrops) { after.parentNode.insertBefore(r, after.nextSibling); after = r; }
    }
  }

  // ============================================================
  // FEATURE: Heal orphaned L3 data rows (blank L3-group value)
  // ============================================================
  //
  // field_2409 is the L3 grouping field. Knack only opens a group header when
  // the group value CHANGES — and "blank == blank" reads as unchanged even
  // across an L2 boundary, so when two consecutive L3 groups both have a blank
  // field_2409 (e.g. an NVR under "Networking or Headend" followed by a Rack
  // under "Other Equipment"), Knack suppresses the SECOND group's L3 header.
  // The pipeline hides every raw data row and surfaces equipment ONLY through
  // L3 headers, so the headerless row disappears from the proposal entirely
  // while still counting toward the totals (observed: a "$445 Rack added during
  // survey" line vanishing). healOrphanDropGroups only covers camera/drop rows.
  //
  // Self-heal generally: walk the tbody; any data row sitting directly under an
  // L2 header with no L3 in between gets a synthetic, empty L3 header spliced in
  // before it. The normal pipeline then fills that header from the row's own
  // data (product name from field_2365, rate/qty/cost), so the orphan renders
  // identically to every other L3 line. Consecutive blank-group rows share the
  // one synthesized header. Idempotent: on re-runs the row already has an L3
  // above it, so nothing new is inserted.
  function healOrphanLevel3(ctx, $tbody) {
    const tbody = $tbody && $tbody[0];
    if (!tbody) return;
    function levelOf(tr) {
      if (!tr.classList || !tr.classList.contains('kn-table-group')) return null;
      const m = tr.className.match(/kn-group-level-(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    }
    function isDataRow(tr) {
      return tr.tagName === 'TR' && tr.id &&
        !tr.classList.contains('kn-table-group') &&
        !tr.classList.contains('scw-level-total-row');
    }
    let lastHeaderLevel = 0;
    const rows = Array.from(tbody.children);
    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      const lvl = levelOf(tr);
      if (lvl != null) { lastHeaderLevel = lvl; continue; }
      // A data row whose nearest preceding header is the L2 (level 2) is an
      // orphan — give it a synthetic L3. After that, the cluster is "under an
      // L3", so siblings in the same blank group don't each get one.
      if (isDataRow(tr) && lastHeaderLevel === 2) {
        const synth = document.createElement('tr');
        synth.className = 'kn-table-group kn-group-level-3 scw-l3-orphan-healed';
        synth.appendChild(document.createElement('td'));
        tr.parentNode.insertBefore(synth, tr);
        lastHeaderLevel = 3;
      }
    }
  }

  // ============================================================
  // FEATURE: Camera list builder
  // ============================================================

  function buildCameraListHtml(ctx, caches, $rows) {
    const items = [];
    const rows = $rows.get();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const prefix = getRowCellText(caches, row, ctx.keys.prefix);
      const numRaw = getRowCellText(caches, row, ctx.keys.number);
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

  // Sum conduit feet (ctx.keys.conduit) across the rows under an L3 drop
  // header AND collect the per-row camera labels for the rows that
  // actually contribute conduit. Used to append an "approximately
  // XX' of conduit included for CAM-1 and CAM-2" note after the
  // concatenated camera list. Returns {total: 0, labels: []} when the
  // field isn't configured for the view or no row has a non-zero value.
  function sumConduitFeet(ctx, caches, $rows) {
    if (!ctx.keys?.conduit) return { total: 0, labels: [] };
    let total = 0;
    const contributors = [];
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const raw = getRowCellText(caches, row, ctx.keys.conduit);
      if (!raw) continue;
      const n = parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
      if (!Number.isFinite(n) || n <= 0) continue;
      total += n;
      // Build the per-row camera label using the same shape as
      // buildCameraListHtml so the conduit-note list matches the
      // camera-list formatting exactly.
      const prefix = getRowCellText(caches, row, ctx.keys.prefix);
      const numRaw = getRowCellText(caches, row, ctx.keys.number);
      if (prefix && numRaw) {
        const digits = numRaw.replace(/\D/g, '');
        const num = parseInt(digits, 10);
        if (Number.isFinite(num)) {
          contributors.push({
            prefix: prefix.toUpperCase(),
            num,
            text: prefix.toUpperCase() + digits
          });
        }
      }
    }
    contributors.sort((a, b) =>
      (a.prefix === b.prefix ? a.num - b.num : a.prefix < b.prefix ? -1 : 1));
    return { total, labels: contributors.map((c) => c.text) };
  }

  // Knack renders L2 group headers as a single <td colspan="N"> where
  // N is its default group-row-width — usually short of the actual
  // table column count, which leaves the Rate / Qty / Cost columns
  // uncovered. The ice-blue (and any other) row background then
  // appears to "stop after Rate". Bump the colspan to match the
  // thead's total <th> count so the row paints edge-to-edge.
  //
  // Multi-TD rows (e.g. L1 with explicit Rate/Qty/Cost cells) already
  // span all columns by virtue of having one TD per column — skip
  // those to avoid clobbering the per-cell layout.
  function extendGroupRowToFullWidth($tbody, $groupRow) {
    const $cells = $groupRow.children('td');
    if ($cells.length !== 1) return;
    const $table = $tbody.closest('table');
    const total = $table.find('thead th').length;
    if (!total) return;
    const current = parseInt($cells.attr('colspan') || '1', 10);
    if (current >= total) return;
    $cells.attr('colspan', total);
  }

  // Format an array of labels as "A", "A and B", or "A, B, and C".
  // Used by the conduit note suffix.
  function formatLabelList(labels) {
    if (!labels || !labels.length) return '';
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels[0] + ' and ' + labels[1];
    return labels.slice(0, -1).join(', ') + ', and ' + labels[labels.length - 1];
  }

  // ============================================================
  // FEATURE: Field2409 injection (L3)
  // ============================================================

  function injectField2409IntoLevel3Header(ctx, { $groupRow, $rowsToSum, runId }) {
    if (!$groupRow.length || !$rowsToSum.length) return;
    if (!ctx.keys.field2409) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    const firstRow = $rowsToSum[0];
    const fieldCell = firstRow ? firstRow.querySelector(`td.${ctx.keys.field2409}`) : null;
    if (!fieldCell) return;

    const html = sanitizeAllowOnlyBrAndB(decodeEntities(fieldCell.innerHTML || ''));
    const fieldPlain = plainTextFromLimitedHtml(html);
    if (!fieldPlain) return;

    // field_2409 IS the L3 grouping field — always replace the label cell
    // with the HTML-preserved version (Knack strips <b>/<br> from headers).
    labelCell.innerHTML = `<span class="scw-l3-2409">${html}</span>`;
    $groupRow.data('scwL3_2409_RunId', runId);
  }

  // ============================================================
  // FEATURE: Product-name injection (L3) — show WHAT is being installed
  // ============================================================
  // The bid grid hides the per-product data rows and shows only L3 (labor-
  // description) headers, so the actual products were invisible — and a group
  // of products with a blank labor description rendered as an empty header.
  // We surface the distinct product name(s) (field_2365) of the group's rows
  // as a bold line ABOVE the labor description. Skipped for cameras ('drop',
  // already listed by the concat feature) and Mounting Hardware (its own
  // concat); Services/Assumptions return before this runs.
  // True when "sub bid required" (field_2478) on a row is explicitly No —
  // i.e. the item will be PRESENT but the sub isn't bidding it separately.
  function rowIsIncluded(ctx, row) {
    if (!ctx.keys.subBidRequired) return false;
    const cell = row.querySelector(`td.${ctx.keys.subBidRequired}`);
    if (!cell) return false;
    return norm(cell.textContent || '').toLowerCase() === 'no';
  }

  // Rows that count toward money totals — no-sub-bid items never contribute a
  // labor/cost amount, so they're dropped from every sum/average.
  function filterBillable(ctx, $rows) {
    if (!ctx.keys.subBidRequired) return $rows;
    return $rows.filter((i, el) => !rowIsIncluded(ctx, el));
  }

  // Lists the NON-included product name(s) above the labor description, and
  // returns true when EVERY product row in the group is "included" (no sub bid
  // required) — those items are pulled into the "Other Associated Equipment"
  // section instead, so the caller hides this (now-empty) L3 header.
  function injectProductNamesIntoLevel3Header(ctx, { $groupRow, $rowsToSum, runId }) {
    if (!ctx.keys.product) return false;
    if ($groupRow.data('scwProdNamesRunId') === runId) {
      return Boolean($groupRow.data('scwProdNamesAllIncluded'));
    }
    $groupRow.data('scwProdNamesRunId', runId);

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return false;

    // Distinct NON-included product names in row order (included items move to
    // the associated-equipment section).
    const counts = new Map();
    let rowCount = 0, includedCount = 0;
    $rowsToSum.each(function () {
      const cell = this.querySelector(`td.${ctx.keys.product}`);
      if (!cell) return;
      const name = norm(cell.textContent || '');
      if (!name) return;
      rowCount++;
      if (rowIsIncluded(ctx, this)) { includedCount++; return; }
      counts.set(name, (counts.get(name) || 0) + 1);
    });

    const allIncluded = rowCount > 0 && includedCount === rowCount;
    $groupRow.data('scwProdNamesAllIncluded', allIncluded);

    // Idempotent: strip any prior injection (+ its trailing <br>) first.
    const prev = labelCell.querySelector('.scw-l3-product');
    if (prev) {
      const br = prev.nextElementSibling;
      if (br && br.tagName === 'BR') br.remove();
      prev.remove();
    }

    if (counts.size) {
      const parts = [];
      counts.forEach((count, name) => {
        parts.push(escapeHtml(name) + (count > 1 ? ` (×${count})` : ''));
      });
      const wrap = document.createElement('span');
      wrap.className = 'scw-l3-product';
      wrap.innerHTML = parts.join('<br>');
      labelCell.insertBefore(document.createElement('br'), labelCell.firstChild);
      labelCell.insertBefore(wrap, labelCell.firstChild);
    }

    return allIncluded;
  }

  // ============================================================
  // FEATURE: "Other Associated Equipment" section (sub bid not required)
  // ============================================================
  // Collect every "included" (field_2478 = No) item in each L1 section into a
  // single "Other Associated Equipment" callout at the BOTTOM of that section
  // (just above its subtotal), with no Rate/Qty/Cost columns — these items will
  // be present but aren't separately bid. Runs after subtotals are inserted.
  function buildAssociatedEquipmentSections(ctx, $tbody) {
    if (!ctx.keys.subBidRequired || !ctx.keys.product) return;
    const tbody = $tbody[0];
    if (!tbody) return;
    const SECT = 'scw-assoc-equip';
    tbody.querySelectorAll('tr.' + SECT).forEach((el) => el.remove());

    const meta = computeColumnMeta(ctx);
    const cols = Math.max(meta.colCount || 0, 1);

    const l1Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1'));
    l1Headers.forEach((l1El, idx) => {
      const nextL1 = idx + 1 < l1Headers.length ? l1Headers[idx + 1] : null;
      const counts = new Map();
      let anchor = null; // first L1 subtotal in this section → insert above it
      let cur = l1El.nextElementSibling;
      // Track the current L2 section: Assumptions / Services rows are NOT
      // equipment — they stay as their own independent line items and must
      // never be rolled into "Other Expected SCW Provided Equipment". Their
      // L2 group header carries scw-l2--assumptions / scw-l2--services
      // (applyLevel2Styling).
      let inNonEquipL2 = false;
      while (cur && cur !== nextL1) {
        if (cur.classList.contains('kn-table-group') &&
            cur.classList.contains('kn-group-level-2')) {
          inNonEquipL2 = cur.classList.contains('scw-l2--assumptions') ||
                         cur.classList.contains('scw-l2--services');
        }
        if (!anchor && cur.classList.contains('scw-subtotal--level-1')) anchor = cur;
        const isData = cur.id &&
          !cur.classList.contains('kn-table-group') &&
          !cur.classList.contains('scw-level-total-row');
        if (isData && !inNonEquipL2) {
          const sb = cur.querySelector(`td.${ctx.keys.subBidRequired}`);
          if (sb && norm(sb.textContent || '').toLowerCase() === 'no') {
            const pc = cur.querySelector(`td.${ctx.keys.product}`);
            const name = pc ? norm(pc.textContent || '') : '';
            if (name) counts.set(name, (counts.get(name) || 0) + 1);
          }
        }
        cur = cur.nextElementSibling;
      }
      if (!counts.size) return;

      const parts = [];
      counts.forEach((c, name) => parts.push(escapeHtml(name) + (c > 1 ? ` (×${c})` : '')));

      const $head = $(
        `<tr class="kn-table-group kn-group-level-2 ${SECT} ${SECT}-head">` +
        `<td colspan="${cols}">Other Expected SCW Provided Equipment</td></tr>`
      );
      const $list = $(
        `<tr class="${SECT} ${SECT}-list"><td colspan="${cols}">` +
        `<span class="scw-l3-product">${parts.join('<br>')}</span></td></tr>`
      );
      const ref = anchor || nextL1;
      if (ref) {
        tbody.insertBefore($head[0], ref);
        tbody.insertBefore($list[0], ref);
      } else {
        tbody.appendChild($head[0]);
        tbody.appendChild($list[0]);
      }
    });
  }

  // ============================================================
  // FEATURE: Concat injection (L3 drop)
  // ============================================================

  function injectConcatIntoHeader(ctx, caches, { level, contextKey, $groupRow, $rowsToSum, runId }) {
    const opt = ctx.features.concat;
    if (!opt?.enabled || level !== opt.onlyLevel || contextKey !== opt.onlyContextKey) return;
    if ($groupRow.data('scwConcatRunId') === runId) return;
    $groupRow.data('scwConcatRunId', runId);

    const cameraListHtml = buildCameraListHtml(ctx, caches, $rowsToSum);
    if (!cameraListHtml) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    // Strip previously injected camera wrapper to avoid nesting on re-runs.
    // Conduit note must be removed FIRST: it's an <i> tag, and the
    // sanitizer's allow-list is <br>/<b>-only — if the <i> survives the
    // unwrap below, its text gets sanitized to plain text in baseHtml
    // and we end up with duplicate conduit copy on each re-render.
    const prevConcat = labelCell.querySelector('.scw-concat-cameras');
    if (prevConcat) {
      const condI = prevConcat.querySelector('.scw-concat-conduit');
      if (condI) {
        const prevCondBr = condI.previousElementSibling;
        if (prevCondBr && prevCondBr.tagName === 'BR') prevCondBr.remove();
        condI.remove();
      }
      const camB = prevConcat.querySelector('b');
      if (camB) { const prevBr = camB.previousElementSibling; if (prevBr && prevBr.tagName === 'BR') prevBr.remove(); camB.remove(); }
      while (prevConcat.firstChild) prevConcat.parentNode.insertBefore(prevConcat.firstChild, prevConcat);
      prevConcat.remove();
    }

    // If field2409 was already injected, use its content as the base HTML
    const injected = labelCell.querySelector('.scw-l3-2409');
    let baseHtml = '';

    if (injected) {
      baseHtml = injected.innerHTML || '';
    } else {
      baseHtml = sanitizeAllowOnlyBrAndB(decodeEntities(labelCell.innerHTML || ''));
    }

    // Conduit total across the drops under this L3 header — only rendered
    // when at least one row reports a non-zero conduit-feet value. Sits
    // inside .scw-concat-cameras so the strip-on-re-run logic above
    // cleans it up alongside the camera list. Tagged .scw-concat-conduit
    // so the strip can find and remove it specifically.
    const { total: conduitTotal, labels: conduitLabels } = sumConduitFeet(ctx, caches, $rowsToSum);
    const conduitForSuffix = conduitLabels.length
      ? ` for ${escapeHtml(formatLabelList(conduitLabels))}`
      : '';
    const conduitNote = conduitTotal > 0
      ? `<br /><i class="scw-concat-conduit" style="color:#6b7280;">approximately ${Math.round(conduitTotal)}' of conduit included${conduitForSuffix}</i>`
      : '';

    const composed =
      `<div class="scw-concat-cameras">` +
      `${sanitizeAllowOnlyBrAndB(decodeEntities(baseHtml))}` +
      `<br /><b style="color:orange;"> (${cameraListHtml})</b>` +
      conduitNote +
      `</div>`;

    labelCell.innerHTML = composed;
  }

  // ============================================================
  // FEATURE: Concat injection (L3 mounting hardware)
  // ============================================================

  function injectConcatIntoLevel3HeaderForMounting(ctx, caches, { $groupRow, $rowsToSum, runId }) {
    const opt = ctx.features.concatL3Mounting;
    if (!ctx.features.concat?.enabled) return;
    if (!opt?.enabled) return;
    if (!$groupRow.length || !$rowsToSum.length) return;

    if ($groupRow.data('scwConcatL3MountRunId') === runId) return;
    $groupRow.data('scwConcatL3MountRunId', runId);

    const cameraListHtml = buildCameraListHtml(ctx, caches, $rowsToSum);
    if (!cameraListHtml) return;

    const $labelCell = $groupRow.children('td').first();
    if (!$labelCell.length) return;

    // Strip previously injected camera wrapper to avoid nesting on re-runs
    const labelEl = $labelCell[0];
    const prevConcat = labelEl.querySelector('.scw-concat-cameras');
    if (prevConcat) {
      const camB = prevConcat.querySelector('b');
      if (camB) { const prevBr = camB.previousElementSibling; if (prevBr && prevBr.tagName === 'BR') prevBr.remove(); camB.remove(); }
      while (prevConcat.firstChild) prevConcat.parentNode.insertBefore(prevConcat.firstChild, prevConcat);
      prevConcat.remove();
    }

    const currentHtml = $labelCell.html() || '';
    const sanitizedBase = sanitizeAllowOnlyBrAndB(decodeEntities(currentHtml));

    $labelCell.html(
      `<div class="scw-concat-cameras ${opt.cssClass}">` +
        `${sanitizedBase}<br />` +
        `<b style="color:orange;">(${cameraListHtml})</b>` +
        `</div>`
    );
  }

  // ============================================================
  // FEATURE: Build L1 footer as TRUE ROWS (qty + rate avg + labor)
  // ============================================================

  function buildLevel1FooterRows(ctx, {
    titleText,
    qtyText,
    totalText,
    contextKey,
    groupLabel,
  }) {
    const meta = computeColumnMeta(ctx);
    // Visible metrics only: these rows are laid out with colspans, which
    // can't skip CSS-hidden columns — logical counts push the value cell
    // right of the Cost column (the "offset subtotal" bug).
    const cols = Math.max(meta.visibleColCount || 0, 1);

    // Use actual column indices so values land under the correct headers.
    // Fallback: assume qty is 3rd-to-last, labor is 2nd-to-last (old behaviour).
    const safeQtyIdx = Number.isFinite(meta.visibleQtyIdx) && meta.visibleQtyIdx >= 1 ? meta.visibleQtyIdx : Math.max(cols - 3, 1);
    const safeLaborIdx = Number.isFinite(meta.visibleLaborIdx) && meta.visibleLaborIdx >= 1 ? meta.visibleLaborIdx : Math.max(cols - 2, safeQtyIdx + 1);

    function makeTrBase(extraClasses) {
      return $(`
        <tr
          class="scw-level-total-row scw-subtotal scw-subtotal--level-1 kn-table-totals ${extraClasses || ''}"
          data-scw-subtotal-level="1"
          data-scw-context="${escapeHtml(contextKey || 'default')}"
          data-scw-group-label="${escapeHtml(groupLabel || '')}"
        ></tr>
      `);
    }

    function makeTitleRow(title, isFirst) {
      const $tr = makeTrBase(`scw-l1-title-row${isFirst ? ' scw-l1-first-row' : ''}`);

      $tr.append(`
        <td class="scw-l1-titlecell" colspan="${cols}">
          <div class="scw-l1-title">${escapeHtml(title)}</div>
        </td>
      `);

      return $tr;
    }

    function makeLineRow({ label, value, rowType, isFirst, isLast }) {
      const $tr = makeTrBase(
        `scw-l1-line-row scw-l1-line--${rowType}` +
          `${isFirst ? ' scw-l1-first-row' : ''}` +
          `${isLast ? ' scw-l1-last-row' : ''}`
      );

      // Label spans from col 0 up to (but not including) the labor column
      const labelSpan = Math.max(safeLaborIdx, 1);
      $tr.append(`
        <td class="scw-l1-labelcell" colspan="${labelSpan}">
          <div class="scw-l1-label">${escapeHtml(label)}</div>
        </td>
      `);

      // Labor/cost cell at the actual labor column position
      $tr.append(`
        <td class="${ctx.keys.labor} scw-l1-valuecell">
          <div class="scw-l1-value">${escapeHtml(value)}</div>
        </td>
      `);

      // Tail cells after labor (if labor isn't the last column)
      const tailSpan = cols - safeLaborIdx - 1;
      if (tailSpan > 0) {
        $tr.append(`<td class="scw-l1-valuecell" colspan="${tailSpan}"></td>`);
      }

      return $tr;
    }

    const title = norm(titleText || '');
    const rows = [];

    rows.push(makeLineRow({
      label: title ? `${titleText} — Subtotal` : 'Subtotal',
      value: totalText,
      rowType: 'final',
      isFirst: false,
      isLast: false,
    }));

    if (rows.length) {
      rows[0].addClass('scw-l1-first-row');
      rows[rows.length - 1].addClass('scw-l1-last-row');
    }

    return rows;
  }

  // ============================================================
  // FEATURE: Build Project Grand Total Rows (qty + labor)
  // ============================================================

  function buildProjectTotalRows(ctx, caches, $tbody) {
    if (!ctx.showProjectTotals) return [];

    const $allDataRows = $tbody.find('tr[id]');
    if (!$allDataRows.length) return [];

    const qtyKey = ctx.keys.qty;
    const laborKey = ctx.keys.labor;

    // No-sub-bid items contribute no labor — exclude them from the grand total.
    const $billableRows = filterBillable(ctx, $allDataRows);
    const grandQty = sumField(caches, $billableRows, qtyKey);
    const grandTotal = sumField(caches, $billableRows, laborKey);

    const meta = computeColumnMeta(ctx);
    // Visible metrics — same colspan-vs-hidden-columns reasoning as
    // buildLevel1FooterRows.
    const cols = Math.max(meta.visibleColCount || 0, 1);
    const safeQtyIdx = Number.isFinite(meta.visibleQtyIdx) && meta.visibleQtyIdx >= 1 ? meta.visibleQtyIdx : Math.max(cols - 3, 1);
    const safeLaborIdx = Number.isFinite(meta.visibleLaborIdx) && meta.visibleLaborIdx >= 1 ? meta.visibleLaborIdx : Math.max(cols - 2, safeQtyIdx + 1);

    function makeTr(extraClasses) {
      return $(`
        <tr
          class="scw-level-total-row scw-subtotal scw-subtotal--level-1 scw-project-totals kn-table-totals ${extraClasses || ''}"
          data-scw-subtotal-level="project"
        ></tr>
      `);
    }

    function makeTitleRow(title) {
      const $tr = makeTr('scw-l1-title-row scw-project-totals-first-row');
      $tr.append(`
        <td class="scw-l1-titlecell" colspan="${cols}">
          <div class="scw-l1-title">${escapeHtml(title)}</div>
        </td>
      `);
      return $tr;
    }

    function makeLineRow({ label, qtyValue, value, rowType, isLast, extraClass }) {
      const labelSpan = Math.max(safeQtyIdx, 1);
      const cls = `scw-l1-line-row scw-l1-line--${rowType}`
        + (isLast ? ' scw-project-totals-last-row' : '')
        + (extraClass ? ` ${extraClass}` : '');
      const $tr = makeTr(cls);

      $tr.append(`
        <td class="scw-l1-labelcell" colspan="${labelSpan}">
          <div class="scw-l1-label">${escapeHtml(label)}</div>
        </td>
      `);

      $tr.append(`
        <td class="${qtyKey} scw-l1-valuecell">
          <div class="scw-l1-value">${escapeHtml(qtyValue || '')}</div>
        </td>
      `);

      const gapSpan = safeLaborIdx - safeQtyIdx - 1;
      if (gapSpan > 0) {
        $tr.append(`<td colspan="${gapSpan}"></td>`);
      }

      $tr.append(`
        <td class="${laborKey} scw-l1-valuecell">
          <div class="scw-l1-value">${escapeHtml(value)}</div>
        </td>
      `);

      const tailSpan = cols - safeLaborIdx - 1;
      if (tailSpan > 0) {
        $tr.append(`<td colspan="${tailSpan}"></td>`);
      }

      return $tr;
    }

    const rows = [];

    rows.push(makeTitleRow('Bid Total'));

    rows.push(makeLineRow({
      label: 'Grand Total',
      qtyValue: '',
      value: formatMoney(grandTotal),
      rowType: 'final',
      isLast: true,
      extraClass: 'scw-project-totals--grand',
    }));

    return rows;
  }

  // ============================================================
  // FEATURE: Build subtotal row (qty + rate avg + labor; rate excluded from L1 footer)
  // ============================================================

  function buildSubtotalRow(ctx, caches, {
    $cellsTemplate,
    $rowsToSum,
    labelOverride,
    level,
    contextKey,
    groupLabel,
    totals,
    hideQtyCost,
  }) {
    const leftText = labelOverride || groupLabel || '';

    const qtyKey = ctx.keys.qty;
    const rateKey = ctx.keys.rate;
    const laborKey = ctx.keys.labor;

    const qty = totals?.[qtyKey] ?? sumField(caches, $rowsToSum, qtyKey);
    const rateAvg = avgField(caches, $rowsToSum, rateKey);

    // L1: return footer rows with qty, rate avg, and labor total
    if (level === 1) {
      const labor = sumField(caches, $rowsToSum, laborKey);

      const titleText = norm(leftText || '').replace(/\s+—\s*Subtotal\s*$/i, '');

      const rows = buildLevel1FooterRows(ctx, {
        titleText,
        qtyText: String(Math.round(qty)),
        totalText: formatMoney(labor),
        contextKey,
        groupLabel,
      });

      return $(rows.map(($r) => $r[0]));
    }

    // non-L1 subtotal rows (L2/L3)
    const safeHideQtyCost = Boolean(hideQtyCost);

    const $row = $(`
      <tr
        class="scw-level-total-row scw-subtotal scw-subtotal--level-${level} kn-table-totals${safeHideQtyCost ? ' scw-hide-qty-cost' : ''}"
        data-scw-subtotal-level="${level}"
        data-scw-context="${escapeHtml(contextKey || 'default')}"
        data-scw-group-label="${escapeHtml(groupLabel || '')}"
      >
        <td class="scw-level-total-label"><strong>${escapeHtml(leftText)}</strong></td>
      </tr>
    `);

    $row.append($cellsTemplate.clone());

    const labor = sumField(caches, $rowsToSum, laborKey);

    $row.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
    $row.find(`td.${rateKey}`).html(`<strong>${escapeHtml(formatMoney(rateAvg))}</strong>`);
    $row.find(`td.${laborKey}`).html(`<strong>${escapeHtml(formatMoney(labor))}</strong>`);

    return $row;
  }

  // ============================================================
  // FEATURE: Hide subtotal filter when requested by L2 rule
  // ============================================================

  function hideSubtotalFilter(ctx) {
    const viewEl = ctx.$root?.[0];
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

  // ============================================================
  // FEATURE: Split L3 (labor-description) groups by rate
  // ============================================================
  // The grid is Knack-grouped at L3 by field_2409 alone, so items with the
  // same labor description but DIFFERENT rates land in one group — the
  // header then shows an averaged rate against a summed cost, which reads
  // as a wrong bill line to the subcontractor. Split such groups so every
  // rendered L3 line is one (labor description + rate) pair: qty and cost
  // are summed within the pair, and the rate shown is the pair's actual
  // rate. Split headers are tagged .scw-l3-rate-split and rebuilt from
  // scratch on every pipeline run (idempotent under re-renders).
  function splitLevel3GroupsByRate(ctx, $tbody, caches) {
    const rateKey = ctx.keys.rate;
    if (!rateKey || !$tbody.length) return;

    // Fresh slate — re-derive the splits from the data rows every run.
    $tbody.find('tr.kn-table-group.kn-group-level-3.scw-l3-rate-split').remove();

    const l3Headers = $tbody.find('tr.kn-table-group.kn-group-level-3').get();
    for (const headerEl of l3Headers) {
      // Skip sections whose L3 money is hidden (Services / Assumptions) —
      // rate has no meaning there and splits would just duplicate headers.
      let l2El = headerEl.previousElementSibling;
      while (l2El && !(l2El.classList.contains('kn-table-group') &&
                       l2El.classList.contains('kn-group-level-2'))) {
        l2El = l2El.previousElementSibling;
      }
      if (l2El) {
        const rule = getLevel2Rule(ctx, getLevel2InfoFromGroupRow($(l2El)));
        if (rule && rule.hideLevel3Summary) continue;
      }

      const rows = getGroupBlock($(headerEl), 3).filter('tr[id]').get();
      if (rows.length < 2) continue;

      // Partition billable rows by rate (first-seen order). No-sub-bid rows
      // carry no money — keep them with the first partition so the product
      // list / associated-equipment features still see them.
      const freeRows = [];
      const byRate = new Map();
      const partitions = [];
      for (const row of rows) {
        if (rowIsIncluded(ctx, row)) { freeRows.push(row); continue; }
        const key = getRowNumericValue(caches, row, rateKey).toFixed(2);
        let part = byRate.get(key);
        if (!part) { part = []; byRate.set(key, part); partitions.push(part); }
        part.push(row);
      }
      if (partitions.length < 2) continue;   // one rate (or all free) — no split
      partitions[0] = freeRows.concat(partitions[0]);

      // Reflow: original header keeps partition 0; each further partition
      // gets a fresh bare L3 header (the pipeline enhances it like any
      // other — cells template, field_2409 label injection, sums).
      let anchor = headerEl;
      partitions.forEach((partRows, idx) => {
        if (idx > 0) {
          const head = document.createElement('tr');
          head.className = 'kn-table-group kn-group-level-3 scw-l3-rate-split';
          head.appendChild(document.createElement('td'));
          anchor.after(head);
          anchor = head;
        }
        for (const row of partRows) { anchor.after(row); anchor = row; }
      });
    }
  }

  // ============================================================
  // MAIN PROCESSOR
  // ============================================================

  function runTotalsPipeline(ctx) {
    const runId = Date.now();
    const $tbody = ctx.$tbody;
    if (!$tbody.length || $tbody.find('.kn-tr-nodata').length) return;

    normKeyCache.clear();
    const caches = makeRunCaches();

    $tbody
      .find('tr')
      .removeData([
        'scwConcatRunId',
        'scwConcatL3MountRunId',
        'scwL3_2409_RunId',
        'scwL2Rewrite_' + runId,
      ]);

    $tbody.find('tr.scw-level-total-row').remove();
    $tbody
      .find(`tr.kn-table-group.kn-group-level-3.${ctx.l2Specials.classOnLevel3}`)
      .removeClass(ctx.l2Specials.classOnLevel3);

    reorderLevel1Groups($tbody);
    healOrphanDropGroups(ctx, $tbody, caches);
    healOrphanLevel3(ctx, $tbody);
    reorderLevel2GroupsBySortField(ctx, $tbody, runId);
    // After heal/reorder, before group processing: one rendered L3 line
    // per (labor description + rate) pair.
    splitLevel3GroupsByRate(ctx, $tbody, caches);

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
    let shouldHideSubtotalFilterFlag = false;
    let hasAnyNonZeroL1Subtotal = false;

    const qtyKey = ctx.keys.qty;
    const rateKey = ctx.keys.rate;
    const laborKey = ctx.keys.labor;

    let blankL1Active = false;

    $allGroupRows.each(function () {
      const $groupRow = $(this);
      const match = this.className.match(/kn-group-level-(\d+)/);
      if (!match) return;

      const level = parseInt(match[1], 10);

      if (level === 2) {
        // Extend the L2 row's single TD to span every column so the
        // ice-blue header background paints across the FULL row width
        // instead of stopping at the Knack-default colspan (which
        // omits the trailing Rate / Qty / Cost columns).
        extendGroupRowToFullWidth($tbody, $groupRow);

        const info = getLevel2InfoFromGroupRow($groupRow);
        sectionContext.level2 = info;
        sectionContext.key = contextKeyFromLevel2Info(ctx, info);
        sectionContext.rule = getLevel2Rule(ctx, info);

        // On re-runs the label may have been rewritten (e.g. "Assumptions" →
        // "General Project Assumptions"), so getLevel2Rule misses.  Recover
        // from the rule key persisted on the first run.
        if (!sectionContext.rule) {
          const savedKey = $groupRow.data('scwL2RuleKey');
          if (savedKey) {
            sectionContext.rule = ctx.l2SectionRules.find((r) => r.key === savedKey) || null;
          }
        }
        if (sectionContext.rule) $groupRow.data('scwL2RuleKey', sectionContext.rule.key);

        sectionContext.hideLevel3Summary = Boolean(sectionContext.rule?.hideLevel3Summary);
        sectionContext.hideQtyCostColumns = Boolean(sectionContext.rule?.hideQtyCostColumns);
        shouldHideSubtotalFilterFlag =
          shouldHideSubtotalFilterFlag || Boolean(sectionContext.rule?.hideSubtotalFilter);

        if (blankL1Active) {
          $groupRow.addClass('scw-promoted-l2-as-l1');

          if (sectionContext.rule?.key === 'assumptions') {
            const $td = $groupRow.children('td').first();
            if ($td.length) {
              const $a = $td.find('a');
              if ($a.length) $a.text('General Project Assumptions');
              else $td.text('General Project Assumptions');
            }
            sectionContext.level2 = Object.assign({}, sectionContext.level2, { label: 'General Project Assumptions' });
          }
        } else {
          applyLevel2Styling($groupRow, sectionContext.rule);
        }
      }

      const $groupBlock = getGroupBlock($groupRow, level);
      if (!$groupBlock.length) return;

      const $rowsToSum = $groupBlock.filter('tr[id]');
      if (!$rowsToSum.length) return;

      // Billable subset — no-sub-bid items never add a labor amount, so all
      // money math (group totals, rate avg, subtotals) runs over this set.
      const $billable = filterBillable(ctx, $rowsToSum);

      const totals = sumFields(
        caches,
        $billable,
        [qtyKey, laborKey].filter(Boolean)
      );

      if (level === 1) {
        const l1Label = getGroupLabelText($groupRow);

        if (isBlankish(l1Label)) {
          $groupRow.hide();
          blankL1Active = true;
          return;
        }

        blankL1Active = false;

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        const l1Labor = totals[laborKey] || 0;
        if (Math.abs(l1Labor) >= 0.01) hasAnyNonZeroL1Subtotal = true;

        $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>').addClass('scw-l1-header-qty');
        $groupRow.find(`td.${rateKey}`).html('<strong>Rate</strong>').addClass('scw-l1-header-rate');
        $groupRow.find(`td.${laborKey}`).html('<strong>Cost</strong>').addClass('scw-l1-header-cost');
      }

      if (level === 2 && blankL1Active) {
        const isPromotedAssumptions = sectionContext.rule?.key === 'assumptions';

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        if (!isPromotedAssumptions) {
          const l2Labor = totals[laborKey] || 0;
          if (Math.abs(l2Labor) >= 0.01) {
            hasAnyNonZeroL1Subtotal = true;
            $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>').addClass('scw-l1-header-qty');
            $groupRow.find(`td.${rateKey}`).html('<strong>Rate</strong>').addClass('scw-l1-header-rate');
            $groupRow.find(`td.${laborKey}`).html('<strong>Cost</strong>').addClass('scw-l1-header-cost');
          }
        }
      }

      if (level === 3) {
        $groupRow.removeClass('scw-hide-level3-header').show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        // Inject field_2409 HTML into every L3 header (preserves <b> and <br>
        // that Knack would otherwise strip from the group label).
        injectField2409IntoLevel3Header(ctx, { $groupRow, $rowsToSum, runId });

        if (sectionContext.hideLevel3Summary) {
          if (sectionContext.hideQtyCostColumns) $groupRow.addClass('scw-hide-qty-cost');
          if (sectionContext.rule?.key === 'assumptions') {
            $groupRow.addClass('scw-hide-cost');
            $rowsToSum.addClass('scw-hide-cost');
          }
          return;
        }

        const nearestL2 = getNearestLevel2Info(caches, $groupRow);
        const isMounting =
          (ctx.l2Specials.mountingHardwareId && nearestL2.recordId === ctx.l2Specials.mountingHardwareId) ||
          (!ctx.l2Specials.mountingHardwareId &&
            norm(nearestL2.label) === norm(ctx.l2Specials.mountingHardwareLabel));

        if (isMounting) {
          $groupRow.addClass(ctx.l2Specials.classOnLevel3);
          injectConcatIntoLevel3HeaderForMounting(ctx, caches, { $groupRow, $rowsToSum, runId });
        }

        // Show the product name(s) above the labor description — except for
        // cameras ('drop', listed by concat) and Mounting Hardware (own concat).
        // Returns true when the whole group is "included" (no sub bid required).
        let allIncluded = false;
        if (!isMounting && sectionContext.key !== 'drop') {
          allIncluded = injectProductNamesIntoLevel3Header(ctx, { $groupRow, $rowsToSum, runId });
        }

        const qty = totals[qtyKey];
        const labor = totals[laborKey];
        const rateAvg = avgField(caches, $billable, rateKey);

        $groupRow.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${rateKey}`).html(`<strong>${escapeHtml(formatMoney(rateAvg))}</strong>`);
        $groupRow.find(`td.${laborKey}`).html(`<strong>${escapeHtml(formatMoney(labor))}</strong>`);

        // Whole group is no-sub-bid → hide this L3 header; its items render in
        // the "Other Associated Equipment" section at the bottom of the L1.
        if (allIncluded) $groupRow.addClass('scw-assoc-hidden');

        if (sectionContext.hideQtyCostColumns) $groupRow.addClass('scw-hide-qty-cost');

        injectConcatIntoHeader(ctx, caches, {
          level,
          contextKey: sectionContext.key,
          $groupRow,
          $rowsToSum,
          runId,
        });
      }

      if (level === 1 || level === 2) {
        const levelInfo = level === 2 ? sectionContext.level2 : getLevel2InfoFromGroupRow($groupRow);

        // Skip all non-promoted L2 subtotal footers
        if (level === 2 && !blankL1Active) return;
        // Skip promoted Assumptions L2 footer (no subtotal wanted)
        if (level === 2 && blankL1Active && sectionContext.rule?.key === 'assumptions') return;

        const effectiveLevel = (level === 2 && blankL1Active) ? 1 : level;

        footerQueue.push({
          level: effectiveLevel,
          label: levelInfo.label,
          contextKey: sectionContext.key,
          hideQtyCostColumns: effectiveLevel === 2 ? sectionContext.hideQtyCostColumns : false,
          $groupBlock,
          $cellsTemplate,
          $rowsToSum: $billable,
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
        const $row = buildSubtotalRow(ctx, caches, {
          $cellsTemplate: item.$cellsTemplate,
          $rowsToSum: item.$rowsToSum,
          labelOverride: item.level === 1 ? `${item.label} — Subtotal` : null,
          level: item.level,
          contextKey: item.contextKey,
          groupLabel: item.label,
          totals: item.totals,
          hideQtyCost: item.hideQtyCostColumns,
        });

        $row.each(function () {
          fragment.appendChild(this);
        });
      }

      anchorEl.parentNode.insertBefore(fragment, anchorEl.nextSibling);
    }

    applyLevel2LabelRewrites(ctx, $tbody, runId);

    // Collect no-sub-bid items into "Other Associated Equipment" sections at
    // the bottom of each L1 (after subtotals exist so we can anchor above them).
    buildAssociatedEquipmentSections(ctx, $tbody);

    if (shouldHideSubtotalFilterFlag) hideSubtotalFilter(ctx);

    if (!hasAnyNonZeroL1Subtotal) {
      $tbody.find('.scw-l1-header-qty, .scw-l1-header-rate, .scw-l1-header-cost').empty();
    }

    refreshProjectTotals(ctx, caches, $tbody);

    log(ctx, 'runTotalsPipeline complete', { runId });
  }

  // Standalone refresh for project totals
  const _lastPipelineState = {};

  function refreshProjectTotals(ctx, caches, $tbody) {
    if (!$tbody.length || !document.contains($tbody[0])) return;

    _lastPipelineState[ctx.viewId] = { ctx, caches, $tbody };

    $tbody.find('tr.scw-project-totals').remove();

    const grandTotalRows = buildProjectTotalRows(ctx, caches, $tbody);
    if (grandTotalRows.length) {
      const gtFragment = document.createDocumentFragment();
      for (const $r of grandTotalRows) {
        $r.each(function () { gtFragment.appendChild(this); });
      }
      $tbody[0].appendChild(gtFragment);
    }
  }

  // ============================================================
  // EVENT BINDING (multi-view)
  // ============================================================

  const _safetyState = {};

  function bindForView(viewId) {
    const ev = `knack-records-render.${viewId}${CONFIG.eventNs}`;

    $(document)
      .off(ev)
      .on(ev, function (event, view) {
        const prev = _safetyState[viewId];
        if (prev) {
          prev.timers.forEach(clearTimeout);
          if (prev.obs) prev.obs.disconnect();
        }
        _safetyState[viewId] = { timers: [], obs: null };

        let pipelineRunning = false;

        function executePipeline() {
          const ctx = buildCtx(viewId, view);
          if (!ctx) return;

          injectCssOnce();

          pipelineRunning = true;
          try {
            runTotalsPipeline(ctx);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`[SCW bid-items][${viewId}] error:`, error);
          } finally {
            pipelineRunning = false;
          }
        }

        function totalsAreMissing() {
          var root = document.getElementById(viewId);
          if (!root) return false;
          var $tbody = $(root).find('.kn-table tbody');
          return $tbody.length && !$tbody.find('tr.scw-level-total-row').length;
        }

        executePipeline();

        [300, 1200].forEach(function (ms) {
          var t = setTimeout(function () {
            if (totalsAreMissing()) executePipeline();
          }, ms);
          _safetyState[viewId].timers.push(t);
        });

        var viewRoot = document.getElementById(viewId);
        if (viewRoot) {
          var obsDebounce = 0;
          var obs = new MutationObserver(function () {
            if (pipelineRunning) return;
            if (obsDebounce) clearTimeout(obsDebounce);
            obsDebounce = setTimeout(function () {
              obsDebounce = 0;
              if (totalsAreMissing()) executePipeline();
            }, 80);
          });
          obs.observe(viewRoot, { childList: true, subtree: true });
          _safetyState[viewId].obs = obs;

          var disconnectTimer = setTimeout(function () { obs.disconnect(); }, 3000);
          _safetyState[viewId].timers.push(disconnectTimer);
        }
      });
  }

  Object.keys(CONFIG.views).forEach(bindForView);
})();
