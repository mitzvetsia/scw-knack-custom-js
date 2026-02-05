/////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/**
 * SCW Totals Script - Refactored (multi-view + multi-field + modular features)
 * Base: Your working Version 2.0 (Last Updated: 2026-02-02/03c)
 * Refactor: 2026-02-03 (config-driven + feature pipeline)
 *
 * PATCH (2026-02-05):
 *  - ✅ NEW: Level-1 footer “Single Row, Stacked Values” layout:
 *      Pre-Discount, Discounts (field_2267), Final Total
 *    (keeps ONE L1 footer row; makes discount obvious; proposal-grade)
 *
 * PATCH (2026-02-03d):
 *  - ✅ FIX: Level-1 subtotal row background sometimes white on label TD
 *    Force row-level background + td inherit (scoped to configured views).
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG (ONLY PLACE YOU SHOULD EDIT FOR NEW VIEWS / FIELDS)
  // ============================================================

  const CONFIG = {
    // Bind on these views (easy add)
    views: {
      view_3301: {
        keys: {
          // columns used for totals output
          qty: 'field_1964',
          labor: 'field_2028',
          hardware: 'field_2201',
          cost: 'field_2203',

          // ✅ discount amount (sum at L1 for stacked footer)
          discount: 'field_2267',

          // fields used for injections / grouping / context
          field2019: 'field_2019',        // limited HTML injected into L4 header
          prefix: 'field_2240',           // camera prefix
          number: 'field_1951',           // camera number
          l2Sort: 'field_2218',           // numeric sort order for L2 blocks
          l2Selector: 'field_2228',       // section "Video / Access Control" selector used for label rewrites
          l3BlankLabelField: 'field_2208' // (kept for compatibility; blank check is header label text)
        },
      },
      view_3341: {
        keys: {
          qty: 'field_1964',
          labor: 'field_2028',
          hardware: 'field_2201',
          cost: 'field_2203',
          discount: 'field_2267',
          field2019: 'field_2019',
          prefix: 'field_2240',
          number: 'field_1951',
          l2Sort: 'field_2218',
          l2Selector: 'field_2228',
          l3BlankLabelField: 'field_2208'
        },
      },
      view_3371: {
        keys: {
          qty: 'field_1964',
          labor: 'field_2028',
          hardware: 'field_2201',
          cost: 'field_2203',
          discount: 'field_2267',
          field2019: 'field_2019',
          prefix: 'field_2240',
          number: 'field_1951',
          l2Sort: 'field_2218',
          l2Selector: 'field_2228',
          l3BlankLabelField: 'field_2208'
        },
      },
    },

    // Your CSS references explicit scene scope; keep it explicit
    styleSceneIds: ['scene_1096'],

    // Feature flags (global defaults; can override per view if needed)
    features: {
      l2Sort: { enabled: true, missingSortGoesLast: true },
      hideL3WhenBlank: { enabled: true },

      hideBlankL4Headers: {
        enabled: true,
        cssClass: 'scw-hide-level4-header',
        requireField2019AlsoBlank: true,
      },

      hideL2Footer: {
        enabled: true,
        labels: ['Assumptions'],
        recordIds: ['697b7a023a31502ec68b3303'],
      },

      // L2 label rewriting (per L1 section)
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

      // "each" column injection
      eachColumn: { enabled: false, fieldKey: 'field_1960' },

      // concat injection for drop context on L4
      concat: { enabled: true, onlyContextKey: 'drop', onlyLevel: 4 },

      // concat injection for mounting hardware on L3
      concatL3Mounting: {
        enabled: true,
        level2Label: 'Mounting Hardware',
        level: 3,
        cssClass: 'scw-concat-cameras--mounting',
      },
    },

    // Context mapping by L2 label/id
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

        'Services': 'services',
      },
    },

    // Section rules (Services / Assumptions etc.)
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

    // Mounting hardware behaviors
    l2Specials: {
      mountingHardwareId: '',
      mountingHardwareLabel: 'Mounting Hardware',
      classOnLevel3: 'scw-level3--mounting-hardware',
    },

    debug: false,
    eventNs: '.scwTotals',
    cssId: 'scw-totals-css',
  };

  // ============================================================
  // SMALL UTILITIES (shared)
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

  function formatMoneyAbs(n) {
    const num = Math.abs(Number(n || 0));
    return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
  }

  function log(ctx, ...args) {
    if (!CONFIG.debug) return;
    // eslint-disable-next-line no-console
    console.log(`[SCW totals][${ctx.viewId}]`, ...args);
  }

  // ============================================================
  // LIMITED HTML SANITIZE (Allow only <b> and <br>)
  // ============================================================

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

    // NOTE: Qty/Cost hide CSS assumes consistent keys across views. If you vary them per view later,
    // we can generate per-view blocks.
    const anyView = CONFIG.views[viewIds[0]];
    const QTY_FIELD_KEY = anyView?.keys?.qty || 'field_1964';
    const COST_FIELD_KEY = anyView?.keys?.cost || 'field_2203';

    const style = document.createElement('style');
    style.id = CONFIG.cssId;

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
   ✅ NEW: L1 stacked footer layout (single row)
   ============================================================ */
${sel('tr.scw-subtotal--level-1 td.scw-level-total-label')} { text-align: left !important; }
${sel('tr.scw-subtotal--level-1 td.scw-l1-stack-cell')} { text-align: right !important; }

.scw-l1-stack { display: inline-block; text-align: right; line-height: 1.25; }
.scw-l1-stack__line { display: flex; gap: 10px; justify-content: flex-end; }
.scw-l1-stack__k { opacity: .75; font-weight: 600; }
.scw-l1-stack__v { font-weight: 700; }

.scw-l1-stack__pre .scw-l1-stack__k,
.scw-l1-stack__pre .scw-l1-stack__v { color: rgba(255,255,255,.78); }

.scw-l1-stack__disc .scw-l1-stack__k,
.scw-l1-stack__disc .scw-l1-stack__v { color: #ffcf7a; } /* amber (readable on SCW blue) */

.scw-l1-stack__final .scw-l1-stack__k,
.scw-l1-stack__final .scw-l1-stack__v { color: #ffffff; font-weight: 900; }

.scw-l1-stack__final .scw-l1-stack__v { font-size: 18px; }

/* ============================================================
   YOUR PROVIDED CSS — APPLIED TO ALL CONFIG.views
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

/* ✅ PATCH (2026-02-03d): force L1 subtotal row background to apply to all TDs */
${sel('tr.scw-level-total-row.scw-subtotal--level-1')} {
  background: RGB(7, 70, 124, 1) !important;
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

  // ============================================================
  // FEATURE: Record-ID extraction
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
    const id = level2Info.recordId ? level2Info.recordId.trim() : '';
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

    // explicit hook for assumptions record-id bucket
    if (rule.key === 'assumptions') {
      $groupRow.addClass('scw-l2--assumptions-id');
    }

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

  function getNearestLevel2Info(caches, $row) {
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
  }

  // ============================================================
  // FEATURE: Level-2 Label Rewriting
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
  // FEATURE: L2 group reorder (Option 2) — within each L1 section
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
  // FEATURE: Camera list builder (used for both L4 + L3 mounting)
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

  // ============================================================
  // FEATURE: Field2019 injection (L4)
  // ============================================================

  function injectField2019IntoLevel4Header(ctx, { level, $groupRow, $rowsToSum, runId }) {
    if (level !== 4 || !$groupRow.length || !$rowsToSum.length) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    labelCell.querySelectorAll('.scw-l4-2019').forEach((n) => n.remove());
    labelCell.querySelectorAll('br.scw-l4-2019-br').forEach((n) => n.remove());

    const firstRow = $rowsToSum[0];
    const fieldCell = firstRow ? firstRow.querySelector(`td.${ctx.keys.field2019}`) : null;
    if (!fieldCell) return;

    const html = sanitizeAllowOnlyBrAndB(decodeEntities(fieldCell.innerHTML || ''));
    const fieldPlain = plainTextFromLimitedHtml(html);
    if (!fieldPlain) return;

    const currentLabelPlain = getLabelCellTextWithoutInjected(labelCell);

    const looksLikeSameText =
      currentLabelPlain &&
      (currentLabelPlain === fieldPlain ||
        currentLabelPlain.includes(fieldPlain) ||
        fieldPlain.includes(currentLabelPlain));

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

  // ============================================================
  // FEATURE: Concat injection (L4 drop)
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
  // FEATURE: Each column injection (L3)
  // ============================================================

  function injectEachIntoLevel3Header(ctx, caches, { level, $groupRow, $rowsToSum, runId }) {
    const opt = ctx.features.eachColumn;
    if (!opt?.enabled || level !== 3) return;
    if (!$groupRow.length || !$rowsToSum.length) return;
    if ($groupRow.data('scwL3EachRunId') === runId) return;
    $groupRow.data('scwL3EachRunId', runId);

    const $target = $groupRow.find(`td.${opt.fieldKey}`);
    if (!$target.length) return;

    const firstRow = $rowsToSum[0];
    const num = getRowNumericValue(caches, firstRow, opt.fieldKey);
    if (!Number.isFinite(num)) return;

    $target.html(`
      <div class="scw-each">
        <div class="scw-each__label">each</div>
        <div>${escapeHtml(formatMoney(num))}</div>
      </div>
    `);
  }

  // ============================================================
  // FEATURE: Build subtotal row
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
    const costKey = ctx.keys.cost;
    const laborKey = ctx.keys.labor;
    const hardwareKey = ctx.keys.hardware;

    const discountKey = ctx.keys.discount;

    const qty = totals?.[qtyKey] ?? sumField(caches, $rowsToSum, qtyKey);
    const cost = totals?.[costKey] ?? sumField(caches, $rowsToSum, costKey);

    const discountRaw =
      (discountKey && Number.isFinite(totals?.[discountKey]))
        ? totals[discountKey]
        : (discountKey ? sumField(caches, $rowsToSum, discountKey) : 0);

    const discount = Number.isFinite(discountRaw) ? discountRaw : 0;
    const hasDiscount = Math.abs(discount) > 0.004;

    // Final = Pre-Discount + discountSigned (supports either sign convention)
    const finalTotal = cost + (hasDiscount ? discount : 0);

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

    // Default behavior (L2 + anything else)
    $row.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
    $row.find(`td.${costKey}`).html(`<strong>${escapeHtml(formatMoney(cost))}</strong>`);
    $row.find(`td.${hardwareKey},td.${laborKey}`).empty();

    // ✅ L1: override cost cell with stacked values (single row)
    if (level === 1) {
      const $qtyCell = $row.find(`td.${qtyKey}`);
      const $costCell = $row.find(`td.${costKey}`);

      // Keep columns aligned but make the stacked values the focus
      $qtyCell.empty();
      $row.find(`td.${hardwareKey},td.${laborKey}`).empty();

      $costCell
        .addClass('scw-l1-stack-cell')
        .html(
          hasDiscount
            ? `
              <div class="scw-l1-stack">
                <div class="scw-l1-stack__line scw-l1-stack__pre">
                  <span class="scw-l1-stack__k">Pre-Discount:</span>
                  <span class="scw-l1-stack__v">${escapeHtml(formatMoney(cost))}</span>
                </div>
                <div class="scw-l1-stack__line scw-l1-stack__disc">
                  <span class="scw-l1-stack__k">Discounts:</span>
                  <span class="scw-l1-stack__v">–${escapeHtml(formatMoneyAbs(discount))}</span>
                </div>
                <div class="scw-l1-stack__line scw-l1-stack__final">
                  <span class="scw-l1-stack__k">Final Total:</span>
                  <span class="scw-l1-stack__v">${escapeHtml(formatMoney(finalTotal))}</span>
                </div>
              </div>
            `
            : `
              <div class="scw-l1-stack">
                <div class="scw-l1-stack__line scw-l1-stack__final">
                  <span class="scw-l1-stack__k">Subtotal:</span>
                  <span class="scw-l1-stack__v">${escapeHtml(formatMoney(cost))}</span>
                </div>
              </div>
            `
        );
    }

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
  // FEATURE: Normalize field_2019 HTML for grouping (view-scoped)
  // ============================================================

  function normalizeField2019ForGrouping(ctx) {
    const key = ctx.keys.field2019;
    const cells = ctx.$root.find(`.kn-table td.${key}`).get();

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

  // ============================================================
  // MAIN PROCESSOR (pipeline over the view)
  // ============================================================

  function runTotalsPipeline(ctx) {
    const runId = Date.now();
    const $tbody = ctx.$tbody;
    if (!$tbody.length || $tbody.find('.kn-tr-nodata').length) return;

    normKeyCache.clear();
    const caches = makeRunCaches();

    // Clear per-run tags and previous totals
    $tbody
      .find('tr')
      .removeData([
        'scwConcatRunId',
        'scwConcatL3MountRunId',
        'scwL4_2019_RunId',
        'scwL3EachRunId',
        'scwHeaderCellsAdded',
        'scwL2Rewrite_' + runId,
      ]);

    $tbody.find('tr.scw-level-total-row').remove();
    $tbody
      .find(`tr.kn-table-group.kn-group-level-3.${ctx.l2Specials.classOnLevel3}`)
      .removeClass(ctx.l2Specials.classOnLevel3);

    // ✅ L2 reorder BEFORE computing blocks/totals and BEFORE label rewrites
    reorderLevel2GroupsBySortField(ctx, $tbody, runId);

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

    const qtyKey = ctx.keys.qty;
    const laborKey = ctx.keys.labor;
    const hardwareKey = ctx.keys.hardware;
    const costKey = ctx.keys.cost;
    const discountKey = ctx.keys.discount;

    $allGroupRows.each(function () {
      const $groupRow = $(this);
      const match = this.className.match(/kn-group-level-(\d+)/);
      if (!match) return;

      const level = parseInt(match[1], 10);

      if (level === 2) {
        const info = getLevel2InfoFromGroupRow($groupRow);
        sectionContext.level2 = info;
        sectionContext.key = contextKeyFromLevel2Info(ctx, info);
        sectionContext.rule = getLevel2Rule(ctx, info);
        sectionContext.hideLevel3Summary = Boolean(sectionContext.rule?.hideLevel3Summary);
        sectionContext.hideQtyCostColumns = Boolean(sectionContext.rule?.hideQtyCostColumns);
        shouldHideSubtotalFilterFlag =
          shouldHideSubtotalFilterFlag || Boolean(sectionContext.rule?.hideSubtotalFilter);

        applyLevel2Styling($groupRow, sectionContext.rule);
      }

      const $groupBlock = getGroupBlock($groupRow, level);
      if (!$groupBlock.length) return;

      const $rowsToSum = $groupBlock.filter('tr[id]');
      if (!$rowsToSum.length) return;

      // ✅ include discount field so L1 can use it (harmless for other levels)
      const totals = sumFields(caches, $rowsToSum, [qtyKey, laborKey, hardwareKey, costKey, discountKey].filter(Boolean));

      // --- Level 1 header gets "Qty/Cost" headings
      if (level === 1) {
        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }
        $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>');
        $groupRow.find(`td.${costKey}`).html('<strong>Cost</strong>');
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();
      }

      // --- Level 3 product headers
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

        // Hide L3 header when blank-ish label
        if (ctx.features.hideL3WhenBlank?.enabled) {
          const labelText = getGroupLabelText($groupRow);
          if (isBlankish(labelText)) {
            $groupRow.addClass('scw-hide-level3-header');
            return;
          }
        }

        // Mounting detection by nearest L2 label/id
        const nearestL2 = getNearestLevel2Info(caches, $groupRow);
        const isMounting =
          (ctx.l2Specials.mountingHardwareId && nearestL2.recordId === ctx.l2Specials.mountingHardwareId) ||
          (!ctx.l2Specials.mountingHardwareId &&
            norm(nearestL2.label) === norm(ctx.l2Specials.mountingHardwareLabel));

        if (isMounting) {
          $groupRow.addClass(ctx.l2Specials.classOnLevel3);
          injectConcatIntoLevel3HeaderForMounting(ctx, caches, { $groupRow, $rowsToSum, runId });
        }

        const qty = totals[qtyKey];
        const hardware = totals[hardwareKey];

        $groupRow.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${costKey}`).html(`<strong>${escapeHtml(formatMoney(hardware))}</strong>`);
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();

        if (sectionContext.hideQtyCostColumns) {
          $groupRow.addClass('scw-hide-qty-cost');
        }

        injectEachIntoLevel3Header(ctx, caches, { level, $groupRow, $rowsToSum, runId });
      }

      // --- Level 4 install description headers
      if (level === 4) {
        const blankL4Opt = ctx.features.hideBlankL4Headers;
        $groupRow.removeClass(blankL4Opt?.cssClass || 'scw-hide-level4-header').show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        // Hide stray blank L4 header rows (optional)
        if (blankL4Opt?.enabled) {
          const headerText = getGroupLabelText($groupRow);

          let field2019Text = '';
          if (blankL4Opt.requireField2019AlsoBlank) {
            const firstRow = $rowsToSum[0];
            const cell2019 = firstRow ? firstRow.querySelector(`td.${ctx.keys.field2019}`) : null;
            field2019Text = cell2019 ? norm(cell2019.textContent || '') : '';
          }

          if (isBlankish(headerText) && (!blankL4Opt.requireField2019AlsoBlank || isBlankish(field2019Text))) {
            $groupRow.addClass(blankL4Opt.cssClass);
          }
        }

        injectField2019IntoLevel4Header(ctx, { level, $groupRow, $rowsToSum, runId });

        const qty = totals[qtyKey];
        const labor = totals[laborKey];

        $groupRow.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${costKey}`).html(`<strong>${escapeHtml(formatMoney(labor))}</strong>`);
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();

        if (sectionContext.hideQtyCostColumns) {
          $groupRow.addClass('scw-hide-qty-cost');
        }

        injectConcatIntoHeader(ctx, caches, {
          level,
          contextKey: sectionContext.key,
          $groupRow,
          $rowsToSum,
          runId,
        });
      }

      // Queue footers for L1 & L2
      if (level === 1 || level === 2) {
        const levelInfo = level === 2 ? sectionContext.level2 : getLevel2InfoFromGroupRow($groupRow);

        // ✅ Hide L2 footer subtotal row when assumptions label OR record id matches
        if (level === 2 && shouldHideLevel2Footer(ctx, levelInfo)) {
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

    // Insert footers bottom-up, with L2 before L1 at same anchor
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
        return pos & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : pos & Node.DOCUMENT_POSITION_PRECEDING
          ? 1
          : 0;
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

        fragment.appendChild($row[0]);
      }

      anchorEl.parentNode.insertBefore(fragment, anchorEl.nextSibling);
    }

    // Label rewrites after totals insertion
    applyLevel2LabelRewrites(ctx, $tbody, runId);

    // Hide subtotal filter if requested by any L2 rule
    if (shouldHideSubtotalFilterFlag) {
      hideSubtotalFilter(ctx);
    }

    log(ctx, 'runTotalsPipeline complete', { runId });
  }

  // ============================================================
  // EVENT BINDING (multi-view)
  // ============================================================

  function bindForView(viewId) {
    const ev = `knack-records-render.${viewId}${CONFIG.eventNs}`;

    $(document)
      .off(ev)
      .on(ev, function (event, view) {
        const ctx = buildCtx(viewId, view);
        if (!ctx) return;

        injectCssOnce();
        normalizeField2019ForGrouping(ctx);

        requestAnimationFrame(() => {
          try {
            runTotalsPipeline(ctx);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`[SCW totals][${viewId}] error:`, error);
          }
        });
      });
  }

  Object.keys(CONFIG.views).forEach(bindForView);
})();
