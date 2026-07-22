/////*********** PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/**
 * SCW Totals Script - Refactored (multi-view + multi-field + modular features)
 * Base: Your working Version 2.0 (Last Updated: 2026-02-02/03c)
 * Refactor: 2026-02-03 (config-driven + feature pipeline)
 *
 * PATCH (2026-02-05h):
 *  - ✅ FIX: L1 footer line colors not applying
 *    Root cause: selectors like `${sel('tr.scw-subtotal--level-1')} .child`
 *    expand to `#viewA tr..., #viewB tr... .child` (the `.child` only applies to the LAST selector).
 *    Fix: use robust, non-view-scoped selectors on the subtotal row itself:
 *      `tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-...`
 *
 * PATCH (2026-02-05j):
 *  - ✅ L1 footer as TRUE TABLE ROWS (Subtotal / Discount / Total)
 *  - ✅ If L1 has NO discount: show ONLY "Total" (hide subtotal + discount rows)
 *  - ✅ L1 group label appears ABOVE totals lines and spans across the row (not squished into a narrow TD)
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG (ONLY PLACE YOU SHOULD EDIT FOR NEW VIEWS / FIELDS)
  // ============================================================

  const CONFIG = {
    views: {
      view_3301: {
        showProjectTotals: true,
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
          l3BlankLabelField: 'field_2208',
        },
      },
      view_3341: {
        showProjectTotals: true,
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
          l3BlankLabelField: 'field_2208',
        },
      },
      view_3371: {
        showProjectTotals: false,
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
          l3BlankLabelField: 'field_2208',
        },
      },
    },

    styleSceneIds: ['scene_1096'],

    features: {
      l2Sort: { enabled: true, missingSortGoesLast: true },
      l3Sort: { enabled: true, fieldKey: 'field_2203', descending: true, missingSortGoesLast: true },
      hideL3WhenBlank: { enabled: true },

      hideBlankL4Headers: {
        enabled: true,
        cssClass: 'scw-hide-level4-header',
        requireField2019AlsoBlank: true,
      },

      hideL2Footer: {
        enabled: true,
        labels: ['Assumptions', 'General Project Assumptions'],
        recordIds: ['697b7a023a31502ec68b3303'],
      },

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

      eachColumn: { enabled: false, fieldKey: 'field_1960' },

      concat: { enabled: true, onlyContextKey: 'drop', onlyLevel: 4 },

      concatL3Mounting: {
        enabled: true,
        level2Label: 'Mounting Hardware',
        level: 3,
        cssClass: 'scw-concat-cameras--mounting',
      },

      // Relocate accessories (rows with field_2464 → parent line item)
      // so they render immediately below their parent device instead of
      // in their own "Mounting Hardware" L2 section. The subtotal
      // pipeline counts rows by physical position, so moved brackets
      // get rolled into their new L3 group's totals automatically.
      // Empty Mounting Hardware L2/L3 headers are hidden after the move.
      relocateAccessoriesToParents: {
        enabled: true,
        parentConnectionField: 'field_2464',
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
        labels: ['Assumptions', 'General Project Assumptions'],
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
    eventNs: '.scwTotals',
    cssId: 'scw-totals-css',
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

  function formatMoneyAbs(n) {
    const num = Math.abs(Number(n || 0));
    return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
  }

  function log(ctx, ...args) {
    if (!CONFIG.debug) return;
    // eslint-disable-next-line no-console
    SCW.debug(`[SCW totals][${ctx.viewId}]`, ...args);
  }

  // ============================================================
  // LIMITED HTML SANITIZE
  //   Allowed: <b>, <br>, <ul>, <ol>, <li>
  //   Everything else is stripped. <strong> is rewritten to <b>.
  // ============================================================

  const sanitizeRegex = /<\/?strong\b[^>]*>/gi;
  const removeTagsRegex = /<(?!\/?(br|b|ul|ol|li)\b)[^>]*>/gi;

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

  // Product-label hygiene for customer-facing surfaces:
  //  1. Strip trailing designator-list parentheticals ("(RA-I-4, RA-I-5,
  //     RA-I-6)" / "(E-14)") that earlier passes baked into the name —
  //     they duplicate the per-row meta and the appended orange callout.
  //  2. Collapse a duplicated trailing SKU token ("…Scout- PMB26B
  //     PMB26B") — products whose NAME already ends with the SKU get it
  //     appended again by the name+SKU display formula (field_2208).
  function cleanProductLabel(s) {
    let out = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const desigList =
      /\s*\(\s*[A-Za-z]{1,6}-(?:[A-Za-z]{1,6}-)?\d+[A-Za-z]?\s*(?:,\s*[A-Za-z]{1,6}-(?:[A-Za-z]{1,6}-)?\d+[A-Za-z]?\s*)*\)$/;
    while (desigList.test(out)) out = out.replace(desigList, '').trim();
    out = out.replace(/(\s\S+)\1$/, '$1');
    return out;
  }

  // Sign-exact sum: prefers the Backbone model's numeric `<field>_raw`
  // and falls back to the cell parse. Needed for CO credit rows — their
  // NEGATIVE discount cells (e.g. "−$55.00") can parse positive from the
  // rendered text, which inflated Line Item Discounts and shorted the
  // Equipment/Grand totals (observed 2026-07-16: $110 = 2 × the credit
  // row's $55 discount).
  function sumFieldSigned(ctx, caches, $rows, fieldKey) {
    const byId = {};
    try {
      const v = typeof Knack !== 'undefined' && Knack.views && Knack.views[ctx.viewId];
      const models = v && v.model && v.model.data && v.model.data.models;
      if (models) models.forEach((m) => { byId[m.id] = m.attributes || {}; });
    } catch (e) { /* model unavailable — cell fallback below */ }
    let total = 0;
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const rec = byId[rows[i].id];
      const raw = rec ? rec[fieldKey + '_raw'] : undefined;
      if (typeof raw === 'number' && Number.isFinite(raw)) { total += raw; continue; }
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

  function getLabelCellTextWithoutInjected(labelCell) {
    const clone = labelCell.cloneNode(true);
    clone.querySelectorAll('.scw-l4-2019, br.scw-l4-2019-br').forEach((n) => n.remove());
    return norm(clone.textContent || '');
  }

  function getLabelCellHtmlWithoutInjected(labelCell) {
    const clone = labelCell.cloneNode(true);
    clone.querySelectorAll('.scw-l4-2019, br.scw-l4-2019-br').forEach((n) => n.remove());
    // If a previous run wrapped the cell in .scw-concat-cameras, unwrap to
    // the original label text so we don't nest camera lists on re-runs.
    const prevConcat = clone.querySelector('.scw-concat-cameras');
    if (prevConcat) {
      // The camera list is inside the <b> tag — remove it to get the base label
      const camB = prevConcat.querySelector('b');
      if (camB) { const prevBr = camB.previousElementSibling; if (prevBr && prevBr.tagName === 'BR') prevBr.remove(); camB.remove(); }
      // Unwrap: replace the .scw-concat-cameras div with its remaining children
      while (prevConcat.firstChild) prevConcat.parentNode.insertBefore(prevConcat.firstChild, prevConcat);
      prevConcat.remove();
    }
    return clone.innerHTML || '';
  }

  // ============================================================
  // ✅ COLUMN META: real colCount + indices of qty/cost columns
  // ============================================================

  function computeColumnMeta(ctx) {
    const firstRow = ctx.$root.find('.kn-table tbody tr[id]').first()[0];
    const colCount = firstRow ? firstRow.querySelectorAll('td').length : 0;

    let qtyIdx = -1;
    let costIdx = -1;

    const ths = ctx.$root.find('.kn-table thead th').get();
    if (ths && ths.length) {
      qtyIdx = ths.findIndex((th) => th.classList && th.classList.contains(ctx.keys.qty));
      costIdx = ths.findIndex((th) => th.classList && th.classList.contains(ctx.keys.cost));
    }

    if (firstRow) {
      const tds = Array.from(firstRow.querySelectorAll('td'));
      if (qtyIdx < 0) qtyIdx = tds.findIndex((td) => td.classList && td.classList.contains(ctx.keys.qty));
      if (costIdx < 0) costIdx = tds.findIndex((td) => td.classList && td.classList.contains(ctx.keys.cost));
    }

    return { colCount: Math.max(colCount, 0), qtyIdx, costIdx };
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
    const QTY_FIELD_KEY = anyView?.keys?.qty || 'field_1964';
    const COST_FIELD_KEY = anyView?.keys?.cost || 'field_2203';

    const style = document.createElement('style');
    style.id = CONFIG.cssId;

    style.textContent = `
/* ============================================================
   SCW Totals helper CSS
   ============================================================ */
.scw-tbd { color: #94a3b8; font-style: italic; font-weight: 600; }
tr.scw-level-total-row.scw-subtotal td { vertical-align: middle; }
tr.scw-level-total-row.scw-subtotal .scw-level-total-label { white-space: nowrap; }

.scw-concat-cameras { line-height: 1.2; }
.scw-concat-cameras--mounting { line-height: 1.15; }

.scw-l4-2019 { display: block; line-height: 1.2; }

.scw-l4-2019 b,
.scw-concat-cameras b,
.scw-l4-2019 strong,
.scw-concat-cameras strong { font-weight: 800 !important; }

.scw-each { line-height: 1.1; }
.scw-each__label { font-weight: 700; opacity: .9; margin-bottom: 2px; }

tr.scw-hide-level3-header { display: none !important; }
tr.scw-hide-level4-header { display: none !important; }

/* ✅ Hide Qty/Cost content while preserving column layout
   ✅ GUARD: never hide qty/cost on L1 subtotal rows */
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${QTY_FIELD_KEY},
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${COST_FIELD_KEY} { visibility: hidden !important; }

/* The qty sum on L2 subtotal rows is suppressed by emptying the cell
   in JS (buildSubtotalRow) — keeping the td intact preserves the
   aliceblue background between the (now-extended) label cell and the
   cost cell. No visibility:hidden rule here on purpose: that would
   hide the cell's background too, leaving a white gap. */

/* ============================================================
   ✅ L1 footer layout (true rows)
   ============================================================ */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line-row td { background: inherit !important; }

/* title sits ABOVE the first totals row and can wrap */
tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-title{
  text-align: right;
  font-weight: 700;
  margin: 6px 0 0px;
  Vertical-align: bottom;
  white-space: normal;
  overflow-wrap: anywhere;
}

/* label/value align to the right */
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

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--sub .scw-l1-label,
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--sub .scw-l1-value{
  color: #07467c !important;
}

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--disc .scw-l1-label,
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--disc .scw-l1-value{
  color: orange !important;
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

/* Tight spacing inside the per-L1 footer cluster (Subtotal → Discount
   → Total), matching the project-totals Equipment Subtotal cluster.
   Excludes the project-totals block via :not(.scw-project-totals)
   since those rows have their own spacing rules above. */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--sub:not(.scw-project-totals) td,
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--disc:not(.scw-project-totals) td {
  border-bottom: 0 !important;
  padding-bottom: 0 !important;
}
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--sub:not(.scw-project-totals)
  + tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line-row:not(.scw-project-totals) td,
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--disc:not(.scw-project-totals)
  + tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line-row:not(.scw-project-totals) td {
  border-top: 0 !important;
  padding-top: 0 !important;
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-value {
  display: inline-block;
  min-width: 120px;
  text-align: right;
}

/* Hide view_3342 (data source for field_2302) visually but keep in DOM */
#view_3342 {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
  padding: 0 !important;
  margin: -1px !important;
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

/* Extra breathing room below Equipment Total and Installation Total. */
tr.scw-level-total-row.scw-project-totals.scw-project-totals--equipment-total td,
tr.scw-level-total-row.scw-project-totals.scw-project-totals--installation-total td {
  border-bottom: 14px solid transparent !important;
}

/* Tight spacing between Proposal Discount and Grand Total —
   Proposal Discount drops directly into the Grand Total visually. */
tr.scw-level-total-row.scw-project-totals.scw-project-totals--proposal-discount td {
  border-bottom: 0 !important;
  padding-bottom: 0 !important;
}
tr.scw-level-total-row.scw-project-totals.scw-project-totals--proposal-discount
  + tr.scw-level-total-row.scw-project-totals.scw-project-totals--grand td {
  border-top: 0 !important;
  padding-top: 0 !important;
}

/* Client-facing discount reason (field_2291) beneath the Proposal Discount
   amount. Muted + italic so it reads as a note, not another total line. */
.scw-l1-disc-note {
  margin-top: 3px;
  font-size: 12px;
  font-style: italic;
  font-weight: 400;
  line-height: 1.3;
  color: #64748b;
  text-align: right;
  white-space: normal;
  max-width: 340px;
  margin-left: auto;
}

/* Tight spacing inside the Equipment Subtotal → Line Item Discounts →
   Equipment Total cluster, mirroring Proposal Discount → Grand Total. */
tr.scw-level-total-row.scw-project-totals.scw-project-totals--equipment-subtotal td,
tr.scw-level-total-row.scw-project-totals.scw-project-totals--line-item-discounts td {
  border-bottom: 0 !important;
  padding-bottom: 0 !important;
}
tr.scw-level-total-row.scw-project-totals.scw-project-totals--equipment-subtotal
  + tr.scw-level-total-row.scw-project-totals td,
tr.scw-level-total-row.scw-project-totals.scw-project-totals--line-item-discounts
  + tr.scw-level-total-row.scw-project-totals td {
  border-top: 0 !important;
  padding-top: 0 !important;
}


/* ============================================================
   YOUR PROVIDED CSS — APPLIED TO ALL CONFIG.views
   ============================================================ */

/********************* OVERAL -- GRID ***********************/
${sceneSelectors} h2 {font-weight: 800; color: #07467c; font-size: 24px;}

${sel('.kn-pagination .kn-select')} { display: none !important; }
${sel('> div.kn-records-nav > div.level > div.level-left > div.kn-entries-summary')} { display: none !important; }

/* This hides all data rows (leaves only group headers + totals rows) */
${sel('.kn-table tbody tr[id]')} { display: none !important; }

/* Hold the grid hidden until the first SETTLED pipeline run (accessory
   relocation done, or nothing to relocate). The accessory→parent
   connection (field_2464) isn't in this view's own model — it's
   harvested from a sibling view that hydrates asynchronously — so the
   first paint would otherwise show brackets in their own "Mounting
   Hardware" section and then repaint them under their parent camera.
   JS adds .scw-grid-ready once relocation settles; a fallback timer
   reveals regardless so the grid never stays hidden. visibility (not
   display) keeps the layout box so there's no CLS jump on reveal. */
${sel('.kn-table')} { visibility: hidden; }
${viewIds.map((id) => `#${id}.scw-grid-ready .kn-table`).join(', ')} { visibility: visible !important; }

/* Hide vertical borders in the grid */
${sel('.kn-table th')},
${sel('.kn-table td')} { border-left: none !important; border-right: none !important; }

${sel('.kn-table tbody td')} { vertical-align: middle; }
/********************* OVERAL -- GRID ***********************/


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

/* ✅ PATCH: force L1 subtotal row background to apply to al TDs */
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

/* Connected Devices on L3 headers */
.scw-l3-connected-br { line-height: 0; }
.scw-l3-connected-devices { display: block; margin-top: 5px; padding-left: 40px; line-height: 1.2; font-size: 12px; }
.scw-l3-connected-devices b { font-weight: 800 !important; }
/********************* LEVEL 4 (INSTALL DESCRIPTION) ***********************/

/* Accessory relocation: rows moved out of the Mounting Hardware
   section to sit under their parent L3 camera/device group. A
   synthetic L4 row (tr.scw-mounting-l4) is still inserted as a
   structural marker — postProcessMountingClusters scans for it to
   find each cluster boundary — but it renders display:none so the
   "Mounting Hardware" label doesn't appear above the per-product
   bracket lines. The original Mounting Hardware L2/L3 headers are
   empty and hidden via .scw-empty-group-header. */
${sel('tr.scw-empty-group-header')} { display: none !important; }
${sel('tr.scw-mounting-l4')} { display: none !important; }
/* Mounting hardware: one synthetic product line per bracket type under
   each "Mounting Hardware" L4 sub-header. The actual tr[id] bracket
   rows stay hidden by the global tr[id] rule above (they're still
   needed in the DOM for the pipeline's L3 cost sum). */
${sel('tr.scw-mounting-product-line td')} {
  color: #07467c !important;
  font-size: 14px !important;
  font-weight: 500 !important;
}
${sel('tr.scw-mounting-product-line td:first-child')} {
  padding-left: 80px !important;
}
/* Install-labor sub-line beneath a mounting-hardware equipment line (e.g. a
   rack enclosure's "Install and assemble…" row). Matches the lighter,
   slightly-smaller install-description styling (.scw-l4-2019: weight 300,
   color #07467c) and nests one indent deeper than the equipment line. */
${sel('tr.scw-mounting-labor-line td')} {
  color: #07467c !important;
  font-size: 13px !important;
  font-weight: 300 !important;
  line-height: 1.2 !important;
}
${sel('tr.scw-mounting-labor-line td:first-child')} {
  padding-left: 80px !important;
}
.scw-mounting-product-name {
  font-weight: 500;
  color: #07467c;
  font-size: 14px;
}

/* SOW header details — kept rendered so isInstallationMasked() can read
   field_2725, but hidden from users so it doesn't take up space on the
   proposal page. */
#view_3861 { display: none !important; }

/* Knack writes style="flex-basis: undefined%" on Details views whose
   column width wasn't set in the page builder. Browsers treat that as
   invalid → fall back to auto → columns collapse to content width.
   Force them back to full-width so the labels/values render at a
   readable size. */
#view_3883 .kn-details-column,
#view_3883 .kn-details-group { flex-basis: 100% !important; }
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
  // FEATURE: L3 group reorder — within each L2 section by cost
  // ============================================================

  function getSortValueForL3Block(fieldKey, l3HeaderEl, stopEl) {
    let cur = l3HeaderEl.nextElementSibling;
    let total = 0;
    let found = false;

    while (cur && cur !== stopEl) {
      if (cur.id && cur.tagName === 'TR') {
        const cell = cur.querySelector('td.' + fieldKey);
        if (cell) {
          const num = parseFloat((cell.textContent || '').replace(/[^\d.-]/g, ''));
          if (Number.isFinite(num)) { total += num; found = true; }
        }
      }

      if (cur.classList?.contains('kn-table-group')) {
        const m = cur.className.match(/kn-group-level-(\d+)/);
        const lvl = m ? parseInt(m[1], 10) : null;
        if (lvl !== null && lvl <= 3) break;
      }
      cur = cur.nextElementSibling;
    }

    return found ? total : null;
  }

  function reorderLevel3GroupsBySortField(ctx, $tbody, runId) {
    const opt = ctx.features.l3Sort;
    if (!opt?.enabled) return;

    const tbody = $tbody?.[0];
    if (!tbody) return;

    const stampKey = 'scwL3ReorderStamp';
    if (tbody.dataset[stampKey] === String(runId)) return;
    tbody.dataset[stampKey] = String(runId);

    const fieldKey = opt.fieldKey;
    const desc = opt.descending === true;
    const missing = opt.missingSortGoesLast ? (desc ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY) : 0;

    const l2Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-2'));
    if (!l2Headers.length) return;

    for (let i = 0; i < l2Headers.length; i++) {
      const l2El = l2Headers[i];

      // Find the boundary: next L2 or next L1
      const nextBoundary = (function () {
        let n = l2El.nextElementSibling;
        while (n) {
          if (n.classList.contains('kn-table-group')) {
            const m = n.className.match(/kn-group-level-(\d+)/);
            const lvl = m ? parseInt(m[1], 10) : null;
            if (lvl !== null && lvl <= 2) return n;
          }
          n = n.nextElementSibling;
        }
        return null;
      })();

      // Collect all nodes in this L2 section
      const sectionNodes = [];
      let cur = l2El.nextElementSibling;
      while (cur && cur !== nextBoundary) {
        sectionNodes.push(cur);
        cur = cur.nextElementSibling;
      }
      if (!sectionNodes.length) continue;

      const l3Headers = sectionNodes.filter(
        (n) => n.classList && n.classList.contains('kn-table-group') && n.classList.contains('kn-group-level-3')
      );
      if (l3Headers.length < 2) continue;

      const firstL3 = l3Headers[0];

      // Nodes between L2 header and first L3 (prefix)
      const prefixNodes = [];
      cur = l2El.nextElementSibling;
      while (cur && cur !== nextBoundary && cur !== firstL3) {
        prefixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      const blocks = l3Headers.map((l3El, idx) => {
        const nextL3El = idx + 1 < l3Headers.length ? l3Headers[idx + 1] : null;

        const nodes = [];
        let n = l3El;
        while (n && n !== nextBoundary && n !== nextL3El) {
          nodes.push(n);
          n = n.nextElementSibling;
        }

        const sortVal = getSortValueForL3Block(fieldKey, l3El, nextL3El || nextBoundary);
        return { idx, sortVal, nodes };
      });

      const lastBlock = blocks[blocks.length - 1];
      const lastBlockLastNode = lastBlock.nodes[lastBlock.nodes.length - 1];

      // Nodes after last L3 block (suffix — e.g. subtotal rows)
      const suffixNodes = [];
      cur = lastBlockLastNode ? lastBlockLastNode.nextElementSibling : null;
      while (cur && cur !== nextBoundary) {
        suffixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      blocks.sort((a, b) => {
        const av = a.sortVal !== null ? a.sortVal : missing;
        const bv = b.sortVal !== null ? b.sortVal : missing;
        if (av !== bv) return desc ? (bv - av) : (av - bv);
        return a.idx - b.idx;
      });

      const frag = document.createDocumentFragment();
      for (const n of prefixNodes) frag.appendChild(n);
      for (const block of blocks) for (const n of block.nodes) frag.appendChild(n);
      for (const n of suffixNodes) frag.appendChild(n);

      if (nextBoundary) tbody.insertBefore(frag, nextBoundary);
      else tbody.appendChild(frag);
    }
  }

  // ============================================================
  // FEATURE: Camera list builder
  // ============================================================

  // Cam/reader bucket check off a data row's field_2218 connection span —
  // shared by both drop-label emitters (cluster product lines + standalone
  // mounting L3 headers) so only camera/reader lineage ever prints a label.
  const SCW_CAM_READER_BUCKET_ID = '6481e5ba38f283002898113c';
  function rowIsCamReaderBucket(rowEl) {
    if (!rowEl) return false;
    const span = rowEl.querySelector('td.field_2218 span[data-kn="connection-value"]');
    const id = span ? String(span.id || span.className || '').trim() : '';
    return id === SCW_CAM_READER_BUCKET_ID;
  }

  // For an ACCESSORY row: true unless its field_2464 parent resolves to a
  // non-cam/reader row. Accessories of NVRs/switches can carry prefix/number
  // junk COPIED INTO THEIR OWN CELLS at creation (e.g. "I-"/"32" from an
  // Admiral Pro typed as channel count), so their own cells can't be trusted
  // as a drop label source. Unresolvable parents fail open (keep the row).
  function accessoryRowParentIsCamReader(rowEl) {
    const pSpan = rowEl.querySelector('td.field_2464 span[data-kn="connection-value"]');
    const pid = pSpan ? String(pSpan.className || '').trim() : '';
    if (!/^[a-f0-9]{24}$/i.test(pid)) return true;
    const tbody = rowEl.closest('tbody');
    const parent = tbody ? tbody.querySelector('tr[id="' + pid + '"]') : null;
    if (!parent) return true;
    return rowIsCamReaderBucket(parent);
  }

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

    // Our synthetic L4 "Mounting Hardware" header (inserted by
    // postProcessMountingClusters under a parent camera's L3) inherits
    // the 'drop' context from its enclosing L2, which would otherwise
    // hit this branch and append orange parent labels like "(E-27)"
    // to the "Mounting Hardware" group label. Those labels belong on
    // the individual mounting-box product-line rows below this header
    // (handled in postProcessMountingClusters at the per-product
    // build step), NOT on the group header itself — that header is
    // just a section divider.
    // Skip mounting-hardware synthetic L4 section headers — the orange
    // parent labels for accessories belong on the per-product rows below
    // (added in postProcessMountingClusters), not on the section divider.
    // Regular synthetic L4s (labor-collapsed camera labor) ARE eligible:
    // those wrap real camera data rows and should get the (E-1, E-2)
    // parent-list label like their non-synthetic siblings.
    if ($groupRow.hasClass('scw-mounting-l4')) return;

    const cameraListHtml = buildCameraListHtml(ctx, caches, $rowsToSum);
    if (!cameraListHtml) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    // Strip previously injected camera wrapper to avoid nesting on re-runs
    const prevConcat = labelCell.querySelector('.scw-concat-cameras');
    if (prevConcat) {
      const camB = prevConcat.querySelector('b');
      if (camB) { const prevBr = camB.previousElementSibling; if (prevBr && prevBr.tagName === 'BR') prevBr.remove(); camB.remove(); }
      while (prevConcat.firstChild) prevConcat.parentNode.insertBefore(prevConcat.firstChild, prevConcat);
      prevConcat.remove();
    }

    const injected = labelCell.querySelector('.scw-l4-2019');
    let baseHtml = '';

    if (injected) baseHtml = injected.innerHTML || '';
    else {
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

    // buildCameraListHtml reads prefix/number off the rows' OWN cells, but
    // an NVR/switch accessory can carry copied junk there (see
    // accessoryRowParentIsCamReader) — drop rows whose parent isn't a
    // cam/reader before building the label.
    const eligibleRows = $rowsToSum.get().filter(accessoryRowParentIsCamReader);
    if (!eligibleRows.length) return;

    const cameraListHtml = buildCameraListHtml(ctx, caches, $(eligibleRows));
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
  // FEATURE: Connected Devices injection (L3)
  // ============================================================

  function injectConnectedDevicesIntoLevel3Header(ctx, caches, { $groupRow, $rowsToSum, runId }) {
    if ($groupRow.data('scwL3ConnDevRunId') === runId) return;
    $groupRow.data('scwL3ConnDevRunId', runId);

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    // Clean up previous injection
    labelCell.querySelectorAll('.scw-l3-connected-devices, br.scw-l3-connected-br').forEach(function (n) { n.remove(); });

    const rows = $rowsToSum.get();
    const devices = [];

    // The field_1957 array on an NVR/switch can include devices that belong
    // to a DIFFERENT SOW on the same project (the connection is per-record,
    // not per-SOW). This view is filtered to the current SOW, so only show
    // connected devices whose record is actually a row in this grid. Each
    // connection span's class is the connected record's 24-hex id; each data
    // row's <tr> id is its record id — build the row-id set once per tbody.
    const tbody = $groupRow[0].closest('tbody');
    let viewRowIds = tbody && tbody._scwConnDevRowIds;
    if (!viewRowIds || (tbody && tbody._scwConnDevRowIdsRun !== runId)) {
      viewRowIds = {};
      if (tbody) {
        const dataRows = tbody.querySelectorAll('tr[id]');
        for (let r = 0; r < dataRows.length; r++) {
          const id = dataRows[r].id;
          if (/^[0-9a-f]{24}$/i.test(id)) viewRowIds[id] = true;
        }
        tbody._scwConnDevRowIds = viewRowIds;
        tbody._scwConnDevRowIdsRun = runId;
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const cell = getRowCell(caches, rows[i], 'field_1957');
      if (!cell) continue;
      const spans = cell.querySelectorAll('span[data-kn="connection-value"]');
      for (let j = 0; j < spans.length; j++) {
        const recId = (spans[j].className || '').trim();
        // Skip connections whose record isn't in this view (other SOW).
        // Fail open when the id doesn't look like a record id.
        if (/^[0-9a-f]{24}$/i.test(recId) && !viewRowIds[recId]) continue;
        const text = norm(spans[j].textContent || '');
        if (!text || isBlankish(text)) continue;
        devices.push(text);
      }
    }

    if (!devices.length) return;

    const br = document.createElement('br');
    br.className = 'scw-l3-connected-br';
    labelCell.appendChild(br);

    const span = document.createElement('span');
    span.className = 'scw-l3-connected-devices';
    span.innerHTML = '<b style="color:orange;">(' + escapeHtml(devices.join(', ')) + ')</b>';
    labelCell.appendChild(span);
  }

  // ============================================================
  // ✅ FEATURE: Build L1 footer as TRUE ROWS
  // ============================================================

function buildLevel1FooterRows(ctx, {
  titleText,
  subtotalText,
  discountText,
  totalText,
  hasDiscount,
  contextKey,
  groupLabel,
}) {
  const { colCount } = computeColumnMeta(ctx);

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
  const { colCount } = computeColumnMeta(ctx);
  const cols = Math.max(colCount, 1);

  const $tr = makeTrBase(`scw-l1-title-row${isFirst ? ' scw-l1-first-row' : ''}`);

  // Match the line-row geometry: big left span + one trailing value cell.
  const leftSpan = Math.max(cols - 1, 1);

  $tr.append(`
    <td class="scw-l1-titlecell" colspan="${leftSpan}">
      <div class="scw-l1-title">${escapeHtml(title)}</div>
    </td>
  `);

  // trailing cell = same "slot" as totals value column
  $tr.append(`<td class="scw-l1-valuecell"></td>`);

  return $tr;
}






function makeLineRow({ label, value, rowType, isFirst, isLast }) {
  const meta = computeColumnMeta(ctx);
  const colCount = Math.max(meta.colCount || 0, 1);

  // costIdx is 0-based within the row. If we can’t find it, fall back to last column.
  const costIdx = Number.isFinite(meta.costIdx) && meta.costIdx >= 1 ? meta.costIdx : (colCount - 1);

  const $tr = makeTrBase(
    `scw-l1-line-row scw-l1-line--${rowType}` +
      `${isFirst ? ' scw-l1-first-row' : ''}` +
      `${isLast ? ' scw-l1-last-row' : ''}`
  );

  // Label cell spans from col 0 up through the column BEFORE cost.
  const labelSpan = Math.max(costIdx, 1);
  $tr.append(`
    <td class="scw-l1-labelcell" colspan="${labelSpan}">
      <div class="scw-l1-label">${escapeHtml(label)}</div>
    </td>
  `);

  // Cost cell: put the value in the actual cost column
  $tr.append(`
    <td class="${ctx.keys.cost} scw-l1-valuecell">
      <div class="scw-l1-value">${escapeHtml(value)}</div>
    </td>
  `);

  // Tail cells AFTER cost (only if cost isn’t the last column)
  const tailSpan = colCount - (labelSpan + 1);
  if (tailSpan > 0) {
    $tr.append(`<td colspan="${tailSpan}"></td>`);
  }

  return $tr;
}


  const title = norm(titleText || '');
  const rows = [];

  // Build the list (unmarked), then mark first/last
  if (title) rows.push(makeTitleRow(title, false));

  if (!hasDiscount) {
    rows.push(makeLineRow({ label: 'Total', value: totalText, rowType: 'final', isFirst: false, isLast: false }));
  } else {
    rows.push(
      makeLineRow({ label: 'Subtotal', value: subtotalText, rowType: 'sub', isFirst: false, isLast: false }),
      makeLineRow({ label: 'Discount', value: discountText, rowType: 'disc', isFirst: false, isLast: false }),
      makeLineRow({ label: 'Total', value: totalText, rowType: 'final', isFirst: false, isLast: false })
    );
  }

  // ✅ mark first + last emitted rows
  if (rows.length) {
    rows[0].addClass('scw-l1-first-row');
    rows[rows.length - 1].addClass('scw-l1-last-row');
  }

  return rows;
}


  // ============================================================
  // FEATURE: Build Project Grand Total Rows
  // ============================================================

  function readDomFieldValue(fieldKey, viewId) {
    const scope = viewId ? `#${viewId} ` : '';
    const $el = $(scope + `.kn-detail.field_${fieldKey} .kn-detail-body`);
    if (!$el.length) return 0;
    const raw = $el.first().text().replace(/[^0-9.\-]/g, '');
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : 0;
  }

  function readDomFieldText(fieldKey, viewId) {
    const scope = viewId ? `#${viewId} ` : '';
    const $el = $(scope + `.kn-detail.field_${fieldKey} .kn-detail-body`);
    if (!$el.length) return '';
    return ($el.first().text() || '').replace(/\s+/g, ' ').trim();
  }

  function buildProjectTotalRows(ctx, caches, $tbody) {
    if (!ctx.showProjectTotals) return [];

    const $allDataRows = $tbody.find('tr[id]');
    if (!$allDataRows.length) return [];

    const hardwareKey = ctx.keys.hardware;   // field_2201
    const discountKey = ctx.keys.discount;   // field_2267
    const laborKey = ctx.keys.labor;         // field_2028

    const equipmentSubtotal = sumField(caches, $allDataRows, hardwareKey);
    // SIGNED sum (no Math.abs): on a CO, a Remove-action credit row carries
    // a NEGATIVE line discount that must reduce the total discount — abs
    // (or a sign-mangled cell parse) double-counted it and shorted the
    // Equipment/Grand totals. Base proposals only have positive discounts,
    // so this is behavior-preserving there.
    const lineItemDiscounts = sumFieldSigned(ctx, caches, $allDataRows, 'field_2303');
    const proposalDiscount = Math.abs(readDomFieldValue('2302', 'view_3342'));
    // Client-facing discount reason (field_2291) — shown beneath the
    // Proposal Discount amount only when a discount is actually applied.
    const proposalDiscountNote = readDomFieldText('2291', 'view_3342');
    // Proposal Discount is rendered AFTER Installation Total and applied
    // only at the Grand Total. It is NOT subtracted from Equipment Total
    // — equipment-side math stays equipmentSubtotal − lineItemDiscounts.
    const equipmentTotal = equipmentSubtotal - lineItemDiscounts;
    const installationTotal = sumField(caches, $allDataRows, laborKey);
    const grandTotal = equipmentTotal + installationTotal - proposalDiscount;

    // Publish-payload fallback: proposal-pdf-export scrapes these totals
    // back OUT of the synthetic rows below, but that scrape can come up
    // empty (observed on CO previews), which shipped blank equipment /
    // installation / grand totals to Make. Stash the exact computed
    // numbers so extractSummaryFields can read them directly. On a CO
    // these are the NET values — Remove-action credit rows are negative
    // amounts inside the same sums.
    window.SCW = window.SCW || {};
    window.SCW.proposalGridTotals = {
      viewId: ctx.viewId,
      equipmentSubtotal: equipmentSubtotal,
      lineItemDiscounts: lineItemDiscounts,
      proposalDiscount: proposalDiscount,
      equipmentTotal: equipmentTotal,
      installationTotal: installationTotal,
      grandTotal: grandTotal,
      at: Date.now()
    };

    const hasAnyDiscount = lineItemDiscounts !== 0 || proposalDiscount !== 0;

    const meta = computeColumnMeta(ctx);
    const cols = Math.max(meta.colCount || 0, 1);
    const safeCostIdx = Number.isFinite(meta.costIdx) && meta.costIdx >= 1
      ? meta.costIdx
      : (cols - 1);

    function makeTr(extraClasses) {
      return $(`
        <tr
          class="scw-level-total-row scw-subtotal scw-subtotal--level-1 scw-project-totals kn-table-totals ${extraClasses || ''}"
          data-scw-subtotal-level="project"
        ></tr>
      `);
    }

    function makeTitleRow(title) {
      const leftSpan = Math.max(cols - 1, 1);
      const $tr = makeTr('scw-l1-title-row scw-project-totals-first-row');
      $tr.append(`
        <td class="scw-l1-titlecell" colspan="${leftSpan}">
          <div class="scw-l1-title">${escapeHtml(title)}</div>
        </td>
      `);
      $tr.append('<td class="scw-l1-valuecell"></td>');
      return $tr;
    }

    function makeLineRow({ label, value, rowType, isLast, extraClass, note }) {
      const labelSpan = Math.max(safeCostIdx, 1);
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
        <td class="${ctx.keys.cost} scw-l1-valuecell">
          <div class="scw-l1-value">${escapeHtml(value)}</div>
          ${note ? `<div class="scw-l1-disc-note">${escapeHtml(note)}</div>` : ''}
        </td>
      `);

      const tailSpan = cols - (labelSpan + 1);
      if (tailSpan > 0) {
        $tr.append(`<td colspan="${tailSpan}"></td>`);
      }

      return $tr;
    }

    const rows = [];

    // A change order's totals aren't "project" totals — they're the CO's
    // net change. Flip the headline labels when any row carries a CO
    // Action (field_2965); base proposals keep the classic labels. The
    // publish pipeline scrapes these labels verbatim, so the published
    // HTML / PDF / e-sign agreement inherit the flip automatically.
    const isChangeOrder = $allDataRows.toArray().some((tr) => {
      const td = tr.querySelector('td.field_2965');
      return !!td && /add|remove/i.test(td.textContent || '');
    });

    rows.push(makeTitleRow(isChangeOrder ? 'Change Order Totals' : 'Project Totals'));

    if (hasAnyDiscount) {
      rows.push(makeLineRow({
        label: 'Equipment Subtotal',
        value: formatMoney(equipmentSubtotal),
        rowType: 'sub',
        isLast: false,
        extraClass: 'scw-project-totals--equipment-subtotal',
      }));

      if (lineItemDiscounts !== 0) {
        rows.push(makeLineRow({
          label: 'Line Item Discounts',
          value: '\u2013' + formatMoneyAbs(lineItemDiscounts),
          rowType: 'disc',
          isLast: false,
          extraClass: 'scw-project-totals--line-item-discounts',
        }));
      }
    }

    // On a CO these figures are NET deltas (adds minus credits), not
    // totals of anything — label them accordingly.
    rows.push(makeLineRow({
      label: isChangeOrder ? 'Equipment Net' : 'Equipment Total',
      value: formatMoney(equipmentTotal),
      rowType: 'final',
      isLast: false,
      extraClass: 'scw-project-totals--equipment-total',
    }));

    rows.push(makeLineRow({
      label: isChangeOrder ? 'Installation Net' : 'Installation Total',
      value: formatMoney(installationTotal),
      rowType: 'final',
      isLast: false,
      extraClass: 'scw-project-totals--installation-total',
    }));

    // Proposal Discount sits BETWEEN Installation Total and Grand Total
    // \u2014 it is a project-wide discount, not specifically a labor or
    // equipment discount. Visually it reduces the Grand Total only.
    if (proposalDiscount !== 0) {
      rows.push(makeLineRow({
        label: 'Proposal Discount',
        value: '\u2013' + formatMoneyAbs(proposalDiscount),
        rowType: 'disc',
        isLast: false,
        extraClass: 'scw-project-totals--proposal-discount',
        note: proposalDiscountNote,
      }));
    }

    rows.push(makeLineRow({
      label: isChangeOrder ? 'Change Order Total' : 'Grand Total',
      value: formatMoney(grandTotal),
      rowType: 'final',
      isLast: true,
      extraClass: 'scw-project-totals--grand',
    }));

    return rows;
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

    const qty = totals?.[qtyKey] ?? sumField(caches, $rowsToSum, qtyKey);
    const cost = totals?.[costKey] ?? sumField(caches, $rowsToSum, costKey);

    // ✅ L1: return 1 or 3 rows
    if (level === 1) {
      const hardware = sumField(caches, $rowsToSum, hardwareKey);       // field_2201
      const labor = sumField(caches, $rowsToSum, laborKey);           // field_2028
      const subtotal = hardware + labor;

      if (Math.abs(subtotal) < 0.01) return $();

      const discountL1 = Math.abs(sumField(caches, $rowsToSum, 'field_2303'));
      const hasDiscount = discountL1 > 0.004;
      const finalTotal = subtotal - discountL1;

      const titleText = norm(leftText || '').replace(/\s+—\s*Subtotal\s*$/i, '');

      const rows = buildLevel1FooterRows(ctx, {
        titleText,
        subtotalText: formatMoney(subtotal),
        discountText: '–' + formatMoneyAbs(discountL1),
        totalText: formatMoney(hasDiscount ? finalTotal : subtotal),
        hasDiscount,
        contextKey,
        groupLabel,
      });

      return $(rows.map(($r) => $r[0]));
    }

    // non-L1 subtotal rows (existing behavior)
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

    // Right-align the bucket label by extending it via colspan across
    // every empty cell up to (but not including) the qty cell. Without
    // this the label sits on the far left of the row inside a narrow
    // first td — text-align: right alone has nothing to align against.
    // The intermediate cells are removed because the label's colspan
    // now occupies their column slots; column-width alignment with
    // other rows comes from those rows still having all their cells.
    const $labelTd = $row.find('td.scw-level-total-label');
    const $qtyTd   = $row.find(`td.${qtyKey}`);
    if ($labelTd.length && $qtyTd.length) {
      const $allTds = $row.find('td');
      const labelIdx = $allTds.index($labelTd[0]);
      const qtyIdx   = $allTds.index($qtyTd[0]);
      if (qtyIdx > labelIdx + 1) {
        $labelTd.attr('colspan', qtyIdx - labelIdx);
        $allTds.slice(labelIdx + 1, qtyIdx).remove();
      }
    }

    const hardware = sumField(caches, $rowsToSum, hardwareKey);
    const labor = sumField(caches, $rowsToSum, laborKey);
    const subtotalL2 = hardware + labor;

    // Default behaviour: empty the qty cell. No qty roll-up makes sense
    // across mixed product types in most buckets (see CSS comment
    // above). Using empty() keeps the <td> in place so its aliceblue
    // background still paints between the label and cost cells;
    // visibility:hidden would have hidden the cell box and left a
    // white gap.
    //
    // Cameras/Readers exception: the bucket's contextKey is 'drop' and
    // every L3 group inside is a uniform device-count sum. Total
    // device count IS meaningful there (and matches the eye-test of
    // adding up the L3 header qtys), so we surface it on the subtotal
    // row instead of blanking it out. Other buckets stay blank.
    const isCamerasReadersBucket = contextKey === 'drop';
    if (isCamerasReadersBucket) {
      $row.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
    } else {
      $row.find(`td.${qtyKey}`).empty();
    }
    $row.find(`td.${costKey}`).html(`<strong>${escapeHtml(formatMoney(subtotalL2))}</strong>`);
    $row.find(`td.${hardwareKey},td.${laborKey}`).empty();

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
  // FEATURE: Synthesize missing L2/L3 (ancestor) group headers
  // ============================================================
  // Knack suppresses a sub-group header when its value matches the one it
  // already emitted — so when the L1 (MDF/IDF) changes but the L2 (bucket) /
  // L3 (product) values are identical to a PRIOR group, Knack drops those
  // headers and the data row lands directly under the L1 header. Data rows are
  // display:none, so the item is invisible but still sums into the totals.
  //
  // The orphan row only carries bucket id (field_2218) + labor desc
  // (field_2019) + rate (field_1960) — not the product/bucket *labels* — so we
  // key each properly-rendered product group by those three and clone the
  // matching twin group's L2/L3 headers in front of the orphan. (synthesizeMissing
  // L4Headers, which runs next, then fills in the L4 from field_2019.)
  function synthesizeMissingAncestorHeaders(ctx) {
    const tbody = ctx.$tbody[0];
    if (!tbody) return;

    function sigOf(row) {
      const bSpan = row.querySelector('td.field_2218 span[data-kn="connection-value"]');
      const bId = bSpan ? norm(bSpan.id || bSpan.className || '') : '';
      const dCell = row.querySelector('td.' + ctx.keys.field2019);
      const desc = dCell ? normKey(dCell.textContent || '') : '';
      const rCell = row.querySelector('td.field_1960');
      const rate = rCell ? norm(rCell.textContent || '') : '';
      return bId + '|' + desc + '|' + rate;
    }

    const registry = Object.create(null); // sig → { l2, l3 }
    let lastL2 = null, lastL3 = null;
    let l2SinceL1 = false, l3SinceL1 = false;

    // Clone a group header down to just its label cell (full-width colspan) so
    // the main pipeline rebuilds the data cells cleanly. The source header may
    // already carry appended Qty/Cost cells from an earlier pipeline pass —
    // cloning those verbatim leaves duplicate trailing columns.
    function pristineHeaderClone(srcRow) {
      const clone = srcRow.cloneNode(true);
      const tds = clone.querySelectorAll('td');
      for (let t = tds.length - 1; t >= 1; t--) tds[t].remove();
      if (tds[0]) tds[0].setAttribute('colspan', '100');
      return clone;
    }

    const rows = Array.prototype.slice.call(tbody.children);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.classList) continue;

      if (row.classList.contains('kn-table-group')) {
        const m = row.className.match(/kn-group-level-(\d+)/);
        const lvl = m ? parseInt(m[1], 10) : null;
        if (lvl === 1) { l2SinceL1 = false; l3SinceL1 = false; }
        else if (lvl === 2) { lastL2 = row; l2SinceL1 = true; l3SinceL1 = false; }
        else if (lvl === 3) { lastL3 = row; l3SinceL1 = true; }
        continue;
      }

      if (!row.id) continue;
      if (row.classList.contains('scw-relocated-accessory') ||
          row.classList.contains('scw-mounting-product-line') ||
          row.classList.contains('scw-level-total-row')) continue;

      // Has its own L3 header since the last L1 — but Knack may still have
      // suppressed the L2 header above it: Knack only re-emits a group
      // header when that field's value actually changes, not on every
      // outer-group (L1) boundary. If this L1's first bucket is the SAME
      // bucket as the previous L1's last bucket (e.g. two adjacent MDF/IDF
      // sections both ending/starting on "Camera or Reader"), the L2 header
      // never renders here even though L3 (a different product name each
      // time) renders fine. Repair that before treating the row as a
      // template.
      if (l3SinceL1 && lastL3) {
        if (!l2SinceL1 && lastL2) {
          const newL2 = pristineHeaderClone(lastL2);
          newL2.classList.add('scw-synthetic-l2');
          lastL3.parentNode.insertBefore(newL2, lastL3);
          lastL2 = newL2;
          l2SinceL1 = true;
        }
        const sig = sigOf(row);
        if (!registry[sig]) registry[sig] = { l2: lastL2, l3: lastL3 };
        continue;
      }

      // Fully orphaned — missing L2 and/or L3 of its own. Clone the
      // matching twin group's headers.
      const tmpl = registry[sigOf(row)];
      if (!tmpl) continue; // no known twin → leave as-is (can't reconstruct)

      let newL2 = null, newL3 = null;
      if (!l2SinceL1 && tmpl.l2) {
        newL2 = pristineHeaderClone(tmpl.l2);
        newL2.classList.add('scw-synthetic-l2');
        row.parentNode.insertBefore(newL2, row);
      }
      if (!l3SinceL1 && tmpl.l3) {
        newL3 = pristineHeaderClone(tmpl.l3);
        newL3.classList.add('scw-synthetic-l3');
        row.parentNode.insertBefore(newL3, row);
      }
      // Cover any subsequent identical rows in this orphan group.
      if (newL2) { lastL2 = newL2; l2SinceL1 = true; }
      if (newL3) { lastL3 = newL3; l3SinceL1 = true; }
    }
  }

  // ============================================================
  // FEATURE: Synthesize missing L4 group headers
  // ============================================================
  // Knack sometimes fails to emit L4 group headers, leaving data
  // rows orphaned (hidden by CSS with no header to display their
  // field_2019 content). This function detects orphan data rows
  // within each L3 block and creates synthetic L4 headers so the
  // rest of the pipeline can process them normally.

  function synthesizeMissingL4Headers(ctx) {
    const $tbody = ctx.$tbody;
    const l3Headers = $tbody[0].querySelectorAll('tr.kn-table-group.kn-group-level-3');
    if (!l3Headers.length) return;

    for (let i = 0; i < l3Headers.length; i++) {
      const l3El = l3Headers[i];
      let current = l3El.nextElementSibling;
      let currentL4 = null;
      const orphanRuns = [];  // groups of consecutive orphan data rows
      let currentRun = null;

      while (current) {
        if (current.classList.contains('kn-table-group')) {
          const m = current.className.match(/kn-group-level-(\d+)/);
          const lvl = m ? parseInt(m[1], 10) : null;
          if (lvl !== null && lvl <= 3) break; // end of L3 block
          if (lvl === 4) {
            currentL4 = current;
            currentRun = null;
          }
        } else if (current.id && current.tagName === 'TR') {
          // Data row — check if it's covered by an L4 header
          if (!currentL4) {
            if (!currentRun) {
              currentRun = { rows: [] };
              orphanRuns.push(currentRun);
            }
            currentRun.rows.push(current);
          }
        }
        current = current.nextElementSibling;
      }

      if (!orphanRuns.length) continue;

      // For each orphan run, group consecutive rows by field_2019 value
      // so rows with the same description share one synthetic L4 header.
      const field2019Key = ctx.keys.field2019;

      for (const run of orphanRuns) {
        const groups = [];
        let lastKey = null;
        let lastGroup = null;

        for (const row of run.rows) {
          const cell = row.querySelector('td.' + field2019Key);
          const key = cell ? norm(cell.textContent || '') : '';

          if (key === lastKey && lastGroup) {
            lastGroup.rows.push(row);
          } else {
            lastGroup = { key: key, rows: [row] };
            groups.push(lastGroup);
            lastKey = key;
          }
        }

        for (const group of groups) {
          const tr = document.createElement('tr');
          tr.className = 'kn-table-group kn-group-level-4 scw-synthetic-l4';
          const td = document.createElement('td');
          td.setAttribute('colspan', '100');
          // Leave the label empty — injectField2019IntoLevel4Header will
          // populate it from the data row's field_2019 content.
          td.textContent = '';
          tr.appendChild(td);
          group.rows[0].parentNode.insertBefore(tr, group.rows[0]);
        }
      }
    }
  }

  // ============================================================
  // FEATURE: Relocate accessories under their parent line item
  // ============================================================
  //
  // Accessory line items (records with field_2464 pointing back to a
  // parent device) are rendered by default under their own "Mounting
  // Hardware" L2 section. The product team prefers them grouped under
  // the device they accessorize, so the customer sees "Camera +
  // bracket" together rather than two disconnected sections.
  //
  // Implementation: build a child→parent map by scanning every Knack
  // view on the page for one that exposes field_2464_raw (the proposal
  // grid view doesn't include field_2464 as a column, so its own model
  // doesn't carry the connection — but the sibling SOW_line_items
  // accordion view does). Then move each accessory's <tr> to
  // immediately follow its parent's <tr>, and mark empty L2/L3 group
  // headers so they hide.
  //
  // Runs BEFORE synthesizeMissingL4Headers so the L4 synthesizer
  // creates a header for the relocated row inside its new L3 group.

  function buildParentConnectionMap(ctx, parentField, knownIds) {
    const map = Object.create(null);

    function harvest(models) {
      if (!models) return;
      for (let i = 0; i < models.length; i++) {
        const attrs = models[i].attributes || models[i];
        const childId = attrs.id;
        if (!childId || !knownIds[childId]) continue;
        const parentRaw = attrs[parentField + '_raw'];
        if (!parentRaw || !parentRaw.length) continue;
        const parentId = parentRaw[0] && parentRaw[0].id;
        if (!parentId || parentId === childId) continue;
        if (!map[childId]) map[childId] = parentId;
      }
    }

    // Try the primary view first
    const primaryModels =
      ctx.view && ctx.view.model && ctx.view.model.data && ctx.view.model.data.models;
    harvest(primaryModels);

    // If the primary view didn't expose field_2464_raw for any row,
    // fall through to every other view on the page and harvest from
    // whichever one carries the connection field.
    if (!Object.keys(map).length && typeof Knack !== 'undefined' && Knack.views) {
      for (const viewKey in Knack.views) {
        if (viewKey === ctx.viewId) continue;
        const v = Knack.views[viewKey];
        const m = v && v.model && v.model.data && v.model.data.models;
        if (!m || !m.length) continue;
        const sample = m[0].attributes || m[0];
        if (sample[parentField + '_raw'] === undefined) continue;
        harvest(m);
        if (Object.keys(map).length) break;
      }
    }

    return map;
  }

  function relocateAccessoriesToParents(ctx) {
    const opt = ctx.features.relocateAccessoriesToParents;
    if (!opt?.enabled) return;

    const tbody = ctx.$tbody[0];
    if (!tbody) return;

    // ── Pre-pass: dedupe orphan scw-mounting-l4 headers ───────────
    // Each pipeline run inserts an L4 "Mounting Hardware" header for
    // every parent that has at least one accessory. The reuse-scan
    // below walks backwards from endOfBlock for up to 50 rows looking
    // for an existing L4 to reuse — but if a parent has more than 50
    // sibling rows OR the previous L4 ended up at an unexpected DOM
    // position (e.g. KTL re-rendered the tbody between pipeline
    // runs), the scan misses the existing L4 and creates a new one,
    // leaving us with TWO "Mounting Hardware" sub-sections inside
    // the same parent block.
    //
    // Walk each L3 group's range up front and remove all but the
    // FIRST scw-mounting-l4 header in each block. Safe because the
    // pipeline rebuilds the L4 contents from scratch anyway via
    // postProcessMountingClusters.
    const l3Headers = tbody.querySelectorAll('tr.kn-table-group.kn-group-level-3');
    for (let i = 0; i < l3Headers.length; i++) {
      const l3 = l3Headers[i];
      let cur = l3.nextElementSibling;
      let firstL4Seen = false;
      while (cur) {
        if (cur.classList && cur.classList.contains('kn-table-group')) {
          const m = cur.className.match(/kn-group-level-(\d+)/);
          const lvl = m ? parseInt(m[1], 10) : 99;
          if (lvl <= 3) break;        // next L1/L2/L3 — done with this block
          if (cur.classList.contains('scw-mounting-l4')) {
            if (firstL4Seen) {
              const dup = cur;
              cur = cur.nextElementSibling;
              dup.remove();
              continue;
            }
            firstL4Seen = true;
          }
        }
        cur = cur.nextElementSibling;
      }
    }

    const parentField = opt.parentConnectionField || 'field_2464';

    // Build id → <tr> map for fast lookup
    const rowById = Object.create(null);
    const knownIds = Object.create(null);
    const dataRows = tbody.querySelectorAll('tr[id]');
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      if (r.id && r.id.indexOf('kn-') !== 0) {
        rowById[r.id] = r;
        knownIds[r.id] = true;
      }
    }

    const parentMap = buildParentConnectionMap(ctx, parentField, knownIds);
    if (!Object.keys(parentMap).length) {
      log(ctx, 'relocateAccessoriesToParents: no field_2464_raw connections found on any view');
      return;
    }

    // For each accessory's parent row, find the enclosing L3 group
    // header. We cluster all accessories at the END of the L3 group
    // rather than interleaving them between the camera rows — that way
    // the existing consolidated labor L4 header (e.g. "Mount Camera &
    // Cabling (I-1, I-2, I-3, I-4, I-5)") stays intact, and the
    // brackets render as a labelled "Mounting Hardware" sub-section
    // under the camera group.
    function findEnclosingL3(row) {
      let cur = row.previousElementSibling;
      while (cur) {
        if (cur.classList && cur.classList.contains('kn-table-group')) {
          const m = cur.className.match(/kn-group-level-(\d+)/);
          if (m) {
            const lvl = parseInt(m[1], 10);
            if (lvl === 3) return cur;
            if (lvl < 3) return null;
          }
        }
        cur = cur.previousElementSibling;
      }
      return null;
    }

    // Group: l3HeaderEl → ordered list of {childRow, parentId}
    const groupedByL3 = new Map();

    for (const childId in parentMap) {
      const parentId = parentMap[childId];
      const childRow = rowById[childId];
      const parentRow = rowById[parentId];
      if (!childRow || !parentRow) continue;
      if (childRow === parentRow) continue;
      if (childRow.parentNode !== tbody) continue;
      if (parentRow.parentNode !== tbody) continue;

      const l3 = findEnclosingL3(parentRow);

      // Capture the bracket's CURRENT L3 group header text (its own
      // product name as Knack rendered it — e.g. "Electrical Mounting
      // Bracket") before we move the row out of that group. The
      // post-process pass reads this back via data-scw-product-name.
      //
      // Some accessory records carry no product name of their own (blank
      // field_1958), so Knack renders them with no distinct L3 group —
      // findEnclosingL3 then walks back past them and lands on whatever
      // L3 header happens to sit above, which is the PARENT camera's own
      // group. Stamping that borrowed label produced bogus per-camera
      // "product" lines in the Mounting Hardware rollup (13 identical
      // brackets split into a 3-unit line mislabeled with the camera's own
      // name and a 10-unit line with no label at all, instead of one
      // 13-unit line). ownL3 === l3 is the precise signal that we found
      // the PARENT's group, not the bracket's own — skip the stamp so
      // these fall through to postProcessMountingClusters' shared fallback
      // label instead of a wrong or inconsistent one.
      const ownL3 = findEnclosingL3(childRow);
      if (ownL3 && ownL3 !== l3 && !childRow.getAttribute('data-scw-product-name')) {
        const ownLabelCell = ownL3.querySelector('td');
        if (ownLabelCell) {
          // Read from a CLONE with injected decorations stripped. On
          // safety-net re-runs the L3 header already carries the orange
          // camera-list <b>(RA-I-4, …)</b> from the previous pass's
          // concat step — reading it raw BAKED the designator list into
          // the product name, which then repeated on every surface
          // (mounting rollup line, What's-Changing manifest, e-sign).
          const ownClone = ownLabelCell.cloneNode(true);
          ownClone
            .querySelectorAll('.scw-concat-cameras, .scw-mounting-parents, .scw-l3-connected-devices')
            .forEach((el) => el.remove());
          const productName = cleanProductLabel(ownClone.textContent);
          if (productName) {
            childRow.setAttribute('data-scw-product-name', productName);
          }
        }
      }

      if (!l3) continue;
      if (!groupedByL3.has(l3)) groupedByL3.set(l3, []);
      groupedByL3.get(l3).push({ childRow, parentId });
    }

    let movedCount = 0;

    groupedByL3.forEach(function (accessories, l3Header) {
      // Walk forward to the first node that is the next L1/L2/L3 group
      // header — that's where the L3 block ends. Insertion point sits
      // immediately before it.
      let endOfBlock = l3Header.nextElementSibling;
      while (endOfBlock) {
        if (endOfBlock.classList && endOfBlock.classList.contains('kn-table-group')) {
          const m = endOfBlock.className.match(/kn-group-level-(\d+)/);
          if (m && parseInt(m[1], 10) <= 3) break;
        }
        endOfBlock = endOfBlock.nextElementSibling;
      }

      // Look for an existing scw-mounting-l4 header at the tail of this
      // block so re-runs don't duplicate it.
      let l4Header = null;
      const probe = endOfBlock ? endOfBlock.previousElementSibling : tbody.lastElementChild;
      // Scan backwards a few rows in case the previous run already put
      // accessories + header here.
      let scan = probe;
      let scanDepth = 0;
      while (scan && scanDepth < 50) {
        if (scan.classList && scan.classList.contains('scw-mounting-l4')) { l4Header = scan; break; }
        if (scan.classList && scan.classList.contains('kn-table-group')) {
          const m = scan.className.match(/kn-group-level-(\d+)/);
          if (m && parseInt(m[1], 10) <= 3) break;
        }
        scan = scan.previousElementSibling;
        scanDepth++;
      }

      if (!l4Header) {
        l4Header = document.createElement('tr');
        l4Header.className = 'kn-table-group kn-group-level-4 scw-synthetic-l4 scw-mounting-l4';
        const td = document.createElement('td');
        td.setAttribute('colspan', '100');
        td.textContent = 'Mounting Hardware';
        l4Header.appendChild(td);
        tbody.insertBefore(l4Header, endOfBlock);
      }

      // Place each accessory right after the previous insertion point so
      // they preserve their original order.
      let insertAfter = l4Header;
      for (let i = 0; i < accessories.length; i++) {
        const { childRow, parentId } = accessories[i];
        childRow.classList.add('scw-relocated-accessory');
        childRow.setAttribute('data-scw-parent-id', parentId);
        if (childRow !== insertAfter.nextSibling) {
          tbody.insertBefore(childRow, insertAfter.nextSibling);
          movedCount++;
        }
        insertAfter = childRow;
      }
    });

    if (movedCount > 0) {
      markEmptyGroupHeaders(tbody);
      log(ctx, 'Relocated', movedCount, 'accessory rows under their parent L3 group');
    }
  }

  // Walk every L2/L3 group header and, if no data rows live between
  // it and the next same-or-higher-level header, tag it with a class
  // so CSS can hide it. Runs after relocateAccessoriesToParents.
  function markEmptyGroupHeaders(tbody) {
    const headers = tbody.querySelectorAll(
      'tr.kn-table-group.kn-group-level-2, tr.kn-table-group.kn-group-level-3'
    );
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const lvlMatch = h.className.match(/kn-group-level-(\d+)/);
      if (!lvlMatch) continue;
      const level = parseInt(lvlMatch[1], 10);

      let cur = h.nextElementSibling;
      let hasData = false;
      while (cur) {
        if (cur.classList && cur.classList.contains('kn-table-group')) {
          const m = cur.className.match(/kn-group-level-(\d+)/);
          const lvl = m ? parseInt(m[1], 10) : 99;
          if (lvl <= level) break;
        } else if (cur.tagName === 'TR' && cur.id && cur.id.indexOf('kn-') !== 0) {
          hasData = true;
          break;
        }
        cur = cur.nextElementSibling;
      }

      if (hasData) {
        h.classList.remove('scw-empty-group-header');
      } else {
        h.classList.add('scw-empty-group-header');
        // Hide any orphaned child group rows too. When a product's only
        // line item is relocated as an accessory under another product,
        // Knack leaves the product's L4 labor-description row behind. With
        // the L3 header hidden but the L4 visible, that labor text floats
        // "disembodied" under nothing, with no qty/cost. Hide the whole
        // remnant.
        if (level === 3) {
          let child = h.nextElementSibling;
          while (child) {
            if (child.classList && child.classList.contains('kn-table-group')) {
              const cm = child.className.match(/kn-group-level-(\d+)/);
              if (cm && parseInt(cm[1], 10) <= 3) break;
              child.classList.add('scw-empty-group-header');
            } else if (child.tagName === 'TR' && child.id && child.id.indexOf('kn-') !== 0) {
              break;
            }
            child = child.nextElementSibling;
          }
        }
      }
    }
  }

  // ============================================================
  // FEATURE: Post-process mounting hardware clusters
  // ============================================================
  //
  // After the main subtotal pipeline runs, the L3 camera/device
  // groups have their qty and cost cells written based on summing
  // ALL data rows below them — which now includes relocated
  // bracket rows. That inflates the L3 Qty (cameras + brackets) and
  // the synthetic "Mounting Hardware" L4 displays $0 cost because
  // the L4 cell-write logic uses labor (field_2028, which is $0 for
  // brackets) instead of hardware/line-item-total.
  //
  // This pass walks each .scw-mounting-l4 cluster, groups the
  // accessory rows by product, rolls them up into one
  // representative row per product, hides the duplicates, fixes
  // the L4 header cost, and fixes the parent L3 Qty (cameras only).
  // It runs AFTER the main pipeline has computed totals, so it
  // doesn't affect the sums (L3 cost still correctly includes the
  // brackets because those tr[id]s remain in the DOM and were
  // counted by the pipeline).

  function postProcessMountingClusters(ctx) {
    const tbody = ctx.$tbody[0];
    if (!tbody) return;

    const qtyKey = ctx.keys.qty;
    const costKey = ctx.keys.cost;
    const hardwareKey = ctx.keys.hardware; // field_2201 — equipment-only extended price
    const laborKey = ctx.keys.labor;       // field_2028 — install price extended
    const descFieldKey = 'field_2019';     // DISPLAY_labor description
    const prefixKey = ctx.keys.prefix; // field_2240
    const numberKey = ctx.keys.number; // field_1951

    // Build id → tr map so we can look up each bracket's parent row to
    // pull its prefix + drop number for the parent-label list.
    const rowById = Object.create(null);
    const allDataRows = tbody.querySelectorAll('tr[id]');
    for (let i = 0; i < allDataRows.length; i++) {
      const r = allDataRows[i];
      if (r.id && r.id.indexOf('kn-') !== 0) rowById[r.id] = r;
    }

    function readCellText(row, fieldKey) {
      if (!row || !fieldKey) return '';
      const cell = row.querySelector('td.' + fieldKey);
      return cell ? (cell.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    // Given an array of bracket rows, build "I-1, I-2, E-3" from their
    // parent rows' prefix + number cells. Mirrors buildCameraListHtml.
    // Only CAM/READER parents contribute a drop label — an NVR/switch record
    // carrying stray values in Drop Prefix/# (e.g. 32 typed on an Admiral
    // Pro as channel count) produced a bogus "(I-32)" tag on its accessories.
    function buildParentLabelList(rows) {
      const items = [];
      for (let i = 0; i < rows.length; i++) {
        const parentId = rows[i].getAttribute('data-scw-parent-id');
        const parent = parentId ? rowById[parentId] : null;
        if (!parent) continue;
        if (!rowIsCamReaderBucket(parent)) continue;   // cam/reader drops only
        const prefix = readCellText(parent, prefixKey);
        const numRaw = readCellText(parent, numberKey);
        if (!prefix || !numRaw) continue;
        const digits = numRaw.replace(/\D/g, '');
        const num = parseInt(digits, 10);
        if (!Number.isFinite(num)) continue;
        const prefixUpper = prefix.toUpperCase();
        items.push({ prefix: prefixUpper, num, text: prefixUpper + num });
      }
      if (!items.length) return '';
      items.sort((a, b) => (a.prefix === b.prefix ? a.num - b.num : a.prefix < b.prefix ? -1 : 1));
      return items.map((it) => it.text).join(', ');
    }

    function readNum(row, fieldKey) {
      const cell = row.querySelector('td.' + fieldKey);
      if (!cell) return 0;
      const m = (cell.textContent || '').replace(/[^0-9.\-]/g, '');
      const n = parseFloat(m);
      return Number.isFinite(n) ? n : 0;
    }

    function writeCellHtml(row, fieldKey, html) {
      const cell = row.querySelector('td.' + fieldKey);
      if (cell) cell.innerHTML = html;
    }

    // Clean up any synthetic product-line rows left over from a previous
    // pipeline run — relocateAccessoriesToParents can shift things around
    // and leave orphan rows in unexpected positions.
    tbody.querySelectorAll('tr.scw-mounting-product-line, tr.scw-mounting-labor-line').forEach(function (n) {
      n.remove();
    });

    // ── Pass 1: roll up accessory rows by product under each .scw-mounting-l4
    const l4s = tbody.querySelectorAll('tr.scw-mounting-l4');
    for (let i = 0; i < l4s.length; i++) {
      const l4 = l4s[i];

      // Walk forward to collect bracket rows until next L3+ header
      const accessoryRows = [];
      let cur = l4.nextElementSibling;
      while (cur) {
        if (cur.classList && cur.classList.contains('kn-table-group')) {
          const m = cur.className.match(/kn-group-level-(\d+)/);
          if (m && parseInt(m[1], 10) <= 3) break;
        } else if (cur.tagName === 'TR' && cur.id && cur.id.indexOf('kn-') !== 0) {
          accessoryRows.push(cur);
        }
        cur = cur.nextElementSibling;
      }

      if (!accessoryRows.length) continue;

      // Group by product display name (field_1958)
      const byProduct = Object.create(null);
      const productOrder = [];
      for (let j = 0; j < accessoryRows.length; j++) {
        const r = accessoryRows[j];
        // Product name was stashed on the row at relocation time —
        // read from data-scw-product-name (captured from the bracket's
        // original L3 group header text). Fall back to td.field_1958
        // in case the row exists but wasn't stamped.
        // cleanProductLabel de-bakes designator lists / doubled SKUs that
        // rows stamped by OLDER passes may still carry.
        let productName = cleanProductLabel(r.getAttribute('data-scw-product-name') || '');
        if (!productName) {
          const productCell = r.querySelector('td.field_1958');
          productName = productCell ? cleanProductLabel(productCell.textContent) : '';
        }
        // No resolvable product name from either source — a real gap in the
        // accessory's own data, not something to leave as an empty-string
        // group key. Rows with no name would otherwise group under '' just
        // fine on their own, but silently rendering with a blank label reads
        // as broken. Fall back to the L4 cluster's own label ("Mounting
        // Hardware") so they still merge into ONE line with a real name.
        if (!productName) productName = 'Mounting Hardware';
        if (!byProduct[productName]) {
          byProduct[productName] = [];
          productOrder.push(productName);
        }
        byProduct[productName].push(r);
      }

      let totalQty = 0;
      let totalCost = 0;

      // Build one synthetic product-line row per bracket product, inserted
      // immediately after the "Mounting Hardware" L4 header. The original
      // tr[id] bracket rows stay in the DOM (hidden by the global tr[id]
      // rule) so the pipeline's L3 cost sum still sees them.
      const colCount = (l4.querySelectorAll('td') || []).length || 12;
      let insertAfter = l4;

      for (let p = 0; p < productOrder.length; p++) {
        const productName = productOrder[p];
        const rows = byProduct[productName];
        let groupQty = 0;
        let groupCost = 0;
        let groupLabor = 0;
        let laborDesc = '';
        // Mask-independent "this accessory carries install labor" flag.
        // On masked grids zeroLaborCells() runs BEFORE this pass and sets
        // every td.laborKey to "$0.00" (so groupLabor is 0), but it stamps
        // data-scw-had-labor="1" on rows that originally had labor. Gate the
        // synthetic labor line on hadLabor, not groupLabor, so the line shows
        // on masked grids too — applyTBDLabels() masks its cost to TBD after.
        let hadLabor = false;
        for (let k = 0; k < rows.length; k++) {
          groupQty += readNum(rows[k], qtyKey);
          // Sum the EQUIPMENT extended price (field_2201), not the line-item
          // total (field_2203). Most mounting hardware has no install labor
          // so the two are equal, but an accessory that carries its own
          // install (e.g. a Server Rack Enclosure: $515 equipment + $506
          // install = $1,021 total) must show the equipment price here — the
          // install labor is represented separately on its own line below.
          groupCost += readNum(rows[k], hardwareKey);
          const rowLabor = readNum(rows[k], laborKey);
          groupLabor += rowLabor;
          const rowHadLabor =
            rowLabor > 0 || rows[k].getAttribute('data-scw-had-labor') === '1';
          if (rowHadLabor) {
            hadLabor = true;
            // The install-description field (field_2019) is NOT zeroed by
            // zeroLaborCells, so it's readable on masked grids too.
            if (!laborDesc) {
              const dcell = rows[k].querySelector('td.' + descFieldKey);
              if (dcell) laborDesc = (dcell.textContent || '').replace(/\s+/g, ' ').trim();
            }
          }
        }
        totalQty += groupQty;
        totalCost += groupCost;

        // Reuse an existing synthetic line if a previous run already built
        // one for this product under this L4 cluster.
        let line = null;
        const probe = insertAfter.nextElementSibling;
        if (
          probe &&
          probe.classList &&
          probe.classList.contains('scw-mounting-product-line') &&
          // Compare CLEANED both sides — lines built by older passes may
          // carry the dirty (list-baked) attribute value.
          cleanProductLabel(probe.getAttribute('data-scw-product') || '') === productName
        ) {
          line = probe;
        }

        const parentLabels = buildParentLabelList(rows);
        const labelHtml =
          escapeHtml(productName) +
          (parentLabels
            ? ' <b class="scw-mounting-parents" style="color:orange;">(' +
              escapeHtml(parentLabels) +
              ')</b>'
            : '');

        if (!line) {
          line = document.createElement('tr');
          line.className = 'scw-mounting-product-line';
          line.setAttribute('data-scw-product', productName);

          // Build a row that matches the L4 column layout: product name in
          // the first cell, qty in td.qtyKey, cost in td.costKey, all
          // others blank.
          const tdNames = ['<td>' + labelHtml + '</td>'];
          const otherCells = l4.querySelectorAll('td');
          for (let c = 1; c < otherCells.length; c++) {
            const ref = otherCells[c];
            const cls = ref.className || '';
            if (cls.indexOf(qtyKey) !== -1) {
              tdNames.push('<td class="' + cls + '" style="text-align:center;">' + Math.round(groupQty) + '</td>');
            } else if (cls.indexOf(costKey) !== -1) {
              tdNames.push('<td class="' + cls + '" style="text-align:center;">' + escapeHtml(formatMoney(groupCost)) + '</td>');
            } else {
              tdNames.push('<td class="' + cls + '"></td>');
            }
          }
          line.innerHTML = tdNames.join('');
          tbody.insertBefore(line, insertAfter.nextSibling);
        } else {
          // Update label, qty, and cost in place
          const firstTd = line.querySelector('td');
          if (firstTd) firstTd.innerHTML = labelHtml;
          const q = line.querySelector('td.' + qtyKey);
          const c = line.querySelector('td.' + costKey);
          if (q) q.textContent = String(Math.round(groupQty));
          if (c) c.textContent = formatMoney(groupCost);
        }

        insertAfter = line;

        // If this accessory carries its own install labor (e.g. a rack
        // enclosure: equipment on the line above, install labor here), emit
        // a labor sub-line right beneath the equipment line — mirroring how
        // a normal product shows equipment then an indented labor line. The
        // original relocated row stays in the DOM (hidden) so subtotals are
        // unaffected; this row is display-only.
        if (hadLabor && laborDesc) {
          const laborRow = document.createElement('tr');
          laborRow.className = 'scw-mounting-labor-line';
          laborRow.setAttribute('data-scw-product', productName);
          const ltds = ['<td>' + escapeHtml(laborDesc) + '</td>'];
          const lcells = l4.querySelectorAll('td');
          for (let lc = 1; lc < lcells.length; lc++) {
            const lref = lcells[lc];
            const lcls = lref.className || '';
            if (lcls.indexOf(costKey) !== -1) {
              ltds.push('<td class="' + lcls + '" style="text-align:center;">' + escapeHtml(formatMoney(groupLabor)) + '</td>');
            } else {
              ltds.push('<td class="' + lcls + '"></td>');
            }
          }
          laborRow.innerHTML = ltds.join('');
          tbody.insertBefore(laborRow, insertAfter.nextSibling);
          insertAfter = laborRow;
        }
      }

      // The L4 "Mounting Hardware" label-row is now just a section
      // header above the per-product lines. Blank its qty/cost cells so
      // we don't duplicate the totals shown on the product lines below.
      writeCellHtml(l4, qtyKey, '');
      writeCellHtml(l4, costKey, '');
    }

    // ── Pass 2: fix L3 Qty AND cost for groups that now contain
    // accessories. The camera's product subtotal should reflect the
    // PARENT DEVICES ONLY — relocated mounting brackets are itemized on
    // their own synthetic lines below and still roll into the L2/grand
    // totals (which sum every tr[id]), so excluding them here removes the
    // double-show from the camera number without dropping them from the
    // proposal total.
    const l3s = tbody.querySelectorAll('tr.kn-table-group.kn-group-level-3');
    for (let i = 0; i < l3s.length; i++) {
      const l3 = l3s[i];
      let nonAccessoryQty = 0;
      let nonAccessoryCost = 0;
      let hasAccessory = false;
      let cur = l3.nextElementSibling;
      while (cur) {
        if (cur.classList && cur.classList.contains('kn-table-group')) {
          const m = cur.className.match(/kn-group-level-(\d+)/);
          if (m && parseInt(m[1], 10) <= 3) break;
        } else if (cur.tagName === 'TR' && cur.id && cur.id.indexOf('kn-') !== 0) {
          if (cur.classList.contains('scw-relocated-accessory')) {
            hasAccessory = true;
          } else {
            nonAccessoryQty += readNum(cur, qtyKey);
            nonAccessoryCost += readNum(cur, hardwareKey);
          }
        }
        cur = cur.nextElementSibling;
      }
      if (hasAccessory) {
        writeCellHtml(l3, qtyKey, '<strong>' + Math.round(nonAccessoryQty) + '</strong>');
        writeCellHtml(l3, costKey, '<strong>' + escapeHtml(formatMoney(nonAccessoryCost)) + '</strong>');
      }
    }

    // ── Pass 3: fix L2 subtotal Qty for footers whose section contains
    // relocated accessories. The pipeline-built L2 footer summed every
    // tr[id] under the L2 (cameras + brackets); recompute as cameras only.
    const l2Footers = tbody.querySelectorAll('tr.scw-subtotal--level-2');
    for (let i = 0; i < l2Footers.length; i++) {
      const footer = l2Footers[i];

      // Walk backwards to the L2 group header that owns this footer
      let header = footer.previousElementSibling;
      while (header) {
        if (header.classList && header.classList.contains('kn-table-group')) {
          const m = header.className.match(/kn-group-level-(\d+)/);
          if (m && parseInt(m[1], 10) <= 2) break;
        }
        header = header.previousElementSibling;
      }
      if (!header) continue;

      // Sum non-accessory tr[id] qty between this L2 header and the footer
      let nonAccessoryQty = 0;
      let hasAccessory = false;
      let cur = header.nextElementSibling;
      while (cur && cur !== footer) {
        if (cur.tagName === 'TR' && cur.id && cur.id.indexOf('kn-') !== 0) {
          if (cur.classList.contains('scw-relocated-accessory')) {
            hasAccessory = true;
          } else {
            nonAccessoryQty += readNum(cur, qtyKey);
          }
        }
        cur = cur.nextElementSibling;
      }

      if (hasAccessory) {
        const qtyCell = footer.querySelector('td.' + qtyKey);
        if (qtyCell) qtyCell.innerHTML = '<strong>' + Math.round(nonAccessoryQty) + '</strong>';
      }
    }
  }

  // ============================================================
  // CHANGE ORDER — removal treatment + Change Summary manifest
  // ============================================================
  // On a CO's proposal, rows with CO Action (field_2965) = Remove are
  // CREDITS and Add rows are new charges. Two layers, both derived
  // inside every pipeline run:
  //
  //   1. IN-PLACE row treatment — Remove rows tint rose (plus their
  //      product header when the whole block is removed) with a solid
  //      "REMOVED FROM INSTALL SCOPE — CREDIT" banner row spanning the
  //      table above each contiguous removed block; Add rows tint pale
  //      green. Rows are never MOVED: two earlier attempts (post-pass
  //      module, in-pipeline re-sectioning) both ended with the removed
  //      item eaten by downstream machinery (accessory relocation /
  //      header hiding). Banner rows are synthetic inserts that are
  //      cleared + re-inserted every pass. Visibility beats layout.
  //
  //   2. "WHAT'S CHANGING" manifest ABOVE the grid — the at-a-glance
  //      layer: Adding / Removing columns with per-item designator +
  //      location signposts, subtotals, and the net change. Names and
  //      amounts are read off the grid's own headers/cells so the
  //      manifest can't disagree with the itemized list. The published
  //      HTML/PDF inherits it all via the publish payload's DOM scrape.
  //
  // Fails safe: no field_2965 values anywhere (base proposals) → no-op.

  const CO_RM = {
    rowCls:     'scw-co-rm-row',
    addCls:     'scw-co-add-row',
    bannerCls:  'scw-co-rm-banner',
    summaryId:  'scw-co-change-summary',
    styleId:    'scw-co-rm-css',
  };

  function coRmInjectCss() {
    if (document.getElementById(CO_RM.styleId)) return;
    const viewSel = Object.keys(CONFIG.views)
      .map((v) => `#${v} .field_2965, #${v} .field_2966`).join(', ');
    const s = document.createElement('style');
    s.id = CO_RM.styleId;
    s.textContent = `
${viewSel} { display: none !important; }
tr.${CO_RM.rowCls} td { background: #fff1f2 !important; }
tr.${CO_RM.rowCls} td:first-child { box-shadow: inset 4px 0 0 #e11d48; }
tr.kn-table-group.${CO_RM.rowCls} td { background: #ffe4e6 !important; }
tr.${CO_RM.addCls} td { background: #f0fdf4 !important; }
tr.${CO_RM.addCls} td:first-child { box-shadow: inset 4px 0 0 #059669; }
tr.${CO_RM.bannerCls} td {
  background: #e11d48 !important; color: #fff; padding: 3px 12px;
  border: 0;
  font: 700 10px/1.7 system-ui, -apple-system, sans-serif;
  letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;
}
#${CO_RM.summaryId} {
  margin: 0 0 16px; border: 1px solid #dbe4ee; border-radius: 10px;
  overflow: hidden; background: #fff;
  font-family: system-ui, -apple-system, sans-serif;
}
#${CO_RM.summaryId} .scw-cos-title {
  padding: 9px 16px 8px; background: #163C6E; color: #fff;
  font-size: 13px; font-weight: 800; letter-spacing: .05em;
  text-transform: uppercase;
  cursor: pointer; user-select: none;
  display: flex; align-items: center; gap: 8px;
}
#${CO_RM.summaryId} .scw-cos-chevron {
  margin-left: auto; font-size: 12px; line-height: 1;
  transition: transform 0.15s ease;
}
#${CO_RM.summaryId}.scw-cos-collapsed .scw-cos-chevron { transform: rotate(-90deg); }
#${CO_RM.summaryId}.scw-cos-collapsed .scw-cos-desc,
#${CO_RM.summaryId}.scw-cos-collapsed .scw-cos-cols { display: none; }
/* Docked below the ops-stepper row: ~2/3 of the page wide, so the Add /
   Remove columns sit comfortably side by side. */
#${CO_RM.summaryId}.scw-cos--docked {
  margin: 12px 0 4px; width: 66%; min-width: 560px; max-width: 100%;
}
#${CO_RM.summaryId} .scw-cos-desc {
  padding: 8px 16px; background: #f0f4fa; color: #334155;
  font-size: 12px; line-height: 1.45; border-bottom: 1px solid #dbe4ee;
}
#${CO_RM.summaryId} .scw-cos-desc b { color: #163C6E; }
#${CO_RM.summaryId} .scw-cos-cols { display: flex; flex-wrap: wrap; }
#${CO_RM.summaryId} .scw-cos-col { flex: 1 1 320px; min-width: 280px; padding: 12px 16px; }
#${CO_RM.summaryId} .scw-cos-col--add { box-shadow: inset 4px 0 0 #059669; }
#${CO_RM.summaryId} .scw-cos-col--rm  { box-shadow: inset 4px 0 0 #e11d48; background: #fff7f7; }
#${CO_RM.summaryId} .scw-cos-head {
  font-size: 11px; font-weight: 800; letter-spacing: .07em;
  text-transform: uppercase; margin-bottom: 8px;
}
#${CO_RM.summaryId} .scw-cos-col--add .scw-cos-head { color: #065f46; }
#${CO_RM.summaryId} .scw-cos-col--rm  .scw-cos-head { color: #9f1239; }
#${CO_RM.summaryId} table.scw-cos-table { width: 100%; border-collapse: collapse; }
#${CO_RM.summaryId} table.scw-cos-table td {
  padding: 4px 6px; font-size: 12.5px; color: #1e293b;
  border-bottom: 1px solid #eef2f7; vertical-align: top;
}
#${CO_RM.summaryId} td.scw-cos-qty { width: 42px; text-align: right; color: #64748b; white-space: nowrap; }
#${CO_RM.summaryId} td.scw-cos-amt { width: 96px; text-align: right; font-weight: 600; white-space: nowrap; }
#${CO_RM.summaryId} .scw-cos-col--rm td.scw-cos-amt { color: #be123c; }
#${CO_RM.summaryId} .scw-cos-lbl { color: #64748b; font-size: 11.5px; }
#${CO_RM.summaryId} .scw-cos-meta {
  display: block; color: #64748b; font-size: 11px; margin-top: 1px;
}
#${CO_RM.summaryId} tr.scw-cos-sub td {
  border-bottom: 0; padding-top: 7px;
  font-weight: 800; font-size: 12.5px;
}
#${CO_RM.summaryId} .scw-cos-net {
  display: flex; justify-content: flex-end; align-items: baseline; gap: 10px;
  padding: 9px 16px; border-top: 1px solid #dbe4ee; background: #f8fafc;
  font-size: 13px; font-weight: 800; color: #163C6E;
}
#${CO_RM.summaryId} .scw-cos-net-label {
  font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: #64748b;
}
#${CO_RM.summaryId} .scw-cos-desc .scw-cos-g { color: #059669; }
#${CO_RM.summaryId} .scw-cos-desc .scw-cos-r { color: #e11d48; }`;
    document.head.appendChild(s);
  }

  // ── What's-Changing panel: collapsible + docked under the ops stepper ──
  // The panel is collapsible (title row toggles; chevron + localStorage
  // persistence) and, when the scene hosts the Ops Actions stepper ("Issue
  // Change Order"), the panel docks directly beneath it instead of sitting
  // above the grid. Safe for publishing: view_3345 (the stepper host) is in
  // the publish scrape's skipViews, and scrapeCoChangeSummary looks the
  // panel up scene-wide, so it's still captured for the PDF/esign manifest.
  const CO_SUM_COLLAPSE_KEY = 'scwCoSummaryCollapsed';
  const CO_SUM_AUTO_COLLAPSE_PX = 300;
  function coRmMountSummary(summary) {
    // Dock directly BENEATH the ops stepper ("Issue Change Order") inside
    // its column — that's otherwise dead space next to the (taller)
    // published-proposal column, so the panel fills it instead of pushing
    // the whole page down. Columns stack/flow via their own flex-basis.
    const stepper = document.querySelector('.scw-ops-stepper');
    if (stepper) {
      if (summary.previousElementSibling !== stepper) {
        stepper.parentNode.insertBefore(summary, stepper.nextSibling);
      }
      summary.classList.add('scw-cos--docked');
    }
    const title = summary.querySelector('.scw-cos-title');
    if (title && !title.querySelector('.scw-cos-chevron')) {
      const ch = document.createElement('span');
      ch.className = 'scw-cos-chevron';
      ch.textContent = '▾';
      title.appendChild(ch);
    }
    // Collapse state: an explicit user choice (stored) wins; with no stored
    // choice, auto-collapse when the expanded panel runs tall (>300px) so a
    // long CO doesn't bury the page — the header + Net change stay visible.
    let stored = null;
    try { stored = window.localStorage.getItem(CO_SUM_COLLAPSE_KEY); }
    catch (e) { /* ignore */ }
    if (stored === '1') {
      summary.classList.add('scw-cos-collapsed');
    } else if (stored === '0') {
      summary.classList.remove('scw-cos-collapsed');
    } else {
      summary.classList.remove('scw-cos-collapsed');
      if (summary.offsetHeight > CO_SUM_AUTO_COLLAPSE_PX) {
        summary.classList.add('scw-cos-collapsed');
      }
    }
  }
  if (!document.documentElement.hasAttribute('data-scw-cos-collapse')) {
    document.documentElement.setAttribute('data-scw-cos-collapse', '1');
    // CAPTURE phase — other document-level capture handlers on these scenes
    // can stop propagation before a bubble-phase listener would ever fire.
    document.addEventListener('click', function (e) {
      const t = e.target && e.target.closest &&
        e.target.closest('#' + CO_RM.summaryId + ' .scw-cos-title');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const summary = t.closest('#' + CO_RM.summaryId);
      if (!summary) return;
      const collapsed = !summary.classList.contains('scw-cos-collapsed');
      summary.classList.toggle('scw-cos-collapsed', collapsed);
      try { window.localStorage.setItem(CO_SUM_COLLAPSE_KEY, collapsed ? '1' : '0'); }
      catch (err) { /* ignore */ }
    }, true);
  }

  function coRmActionTxt(tr) {
    const td = tr.querySelector('td.field_2965');
    return td ? (td.textContent || '').trim() : '';
  }
  function coRmIsRemoveTr(tr) { return /remove/i.test(coRmActionTxt(tr)); }
  function coRmIsAddTr(tr)    { return /add/i.test(coRmActionTxt(tr)); }

  const coRmEsc = (v) => String(v == null ? '' : v)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const coRmMoney = (n) => (n < 0 ? '−' : '') + '$' +
    Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function sectionCoRemovals(ctx) {
    const tbody = ctx.$tbody[0];
    if (!tbody) return;
    const root = tbody.closest('.kn-view') || document.getElementById(ctx.viewId);

    // Column hiding for field_2965/2966 lives in this CSS — inject
    // unconditionally so base proposals never show a blank CO Action
    // column. Tint/banner rules are class-scoped, so harmless on base.
    coRmInjectCss();

    // Clear banner rows from the previous pass before snapshotting rows.
    Array.prototype.slice.call(tbody.querySelectorAll('tr.' + CO_RM.bannerCls))
      .forEach((b) => b.remove());

    // ── Layer 1: IN-PLACE row treatment (no moving — ever) ─────────────
    const allRows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
    const isDataRow = (tr) => tr.tagName === 'TR' && tr.id && tr.id.indexOf('kn-') !== 0;
    const groupLevel = (tr) => {
      if (!tr.classList || !tr.classList.contains('kn-table-group')) return 0;
      const m = tr.className.match(/kn-group-level-(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    };

    // Rose tint on Remove-action rows, pale green on Add-action rows.
    // classList.toggle untags recycled <tr>s from previous runs.
    let anyAction = false;
    allRows.forEach((tr) => {
      if (!isDataRow(tr)) return;
      const isRm  = coRmIsRemoveTr(tr);
      const isAdd = !isRm && coRmIsAddTr(tr);
      anyAction = anyAction || isRm || isAdd;
      tr.classList.toggle(CO_RM.rowCls, isRm);
      tr.classList.toggle(CO_RM.addCls, isAdd);
    });

    // Group headers whose ENTIRE block is removed (level ≥2) tint rose so
    // the removed unit reads as one band with its header. Headers stay in
    // place. Fully-removed headers also join the banner runs below.
    const removedHeaders = new Set();
    for (let i = 0; i < allRows.length; i++) {
      const lvl = groupLevel(allRows[i]);
      if (lvl < 2) continue;
      let j = i + 1;
      let dataCount = 0, removeCount = 0;
      while (j < allRows.length) {
        const l2 = groupLevel(allRows[j]);
        if (l2 && l2 <= lvl) break;
        if (isDataRow(allRows[j])) {
          dataCount++;
          if (coRmIsRemoveTr(allRows[j])) removeCount++;
        }
        j++;
      }
      const fullyRemoved = dataCount > 0 && dataCount === removeCount;
      allRows[i].classList.toggle(CO_RM.rowCls, fullyRemoved);
      if (fullyRemoved) removedHeaders.add(allRows[i]);
    }

    // One "Removed from install scope — credit" banner bar spanning the
    // table ABOVE each contiguous removed block (the fully-removed header
    // when the whole block goes, otherwise the removed row itself).
    const table = tbody.closest('table');
    const colCount = (table && table.querySelectorAll('thead th').length) || 12;
    const isRemovedish = (el) => removedHeaders.has(el) ||
      (isDataRow(el) && el.classList.contains(CO_RM.rowCls));
    let prevRemoved = false;
    allRows.forEach((el) => {
      const r = isRemovedish(el);
      if (r && !prevRemoved) {
        const btr = document.createElement('tr');
        btr.className = CO_RM.bannerCls;
        const btd = document.createElement('td');
        btd.colSpan = colCount;
        btd.textContent = 'Removed from install scope — credit';
        btr.appendChild(btd);
        el.parentNode.insertBefore(btr, el);
      }
      prevRemoved = r;
    });

    // ── Layer 2: Change Summary manifest above the grid ────────────────
    // Entries are derived from the GRID rows themselves — product from the
    // enclosing L3 group header, location from the enclosing L1 header —
    // so the manifest always names things exactly the way the itemized
    // list below does. (The view's model doesn't carry the product
    // connection; the grid's product names only exist as group headers.)
    // Money is DISCOUNT-NET per line (model-preferred; see `amt` below)
    // so Net change ties to the Project Total.
    const modelById = {};
    try {
      const v = typeof Knack !== 'undefined' && Knack.views && Knack.views[ctx.viewId];
      const models = v && v.model && v.model.data && v.model.data.models;
      if (models) models.forEach((m) => { modelById[m.id] = m.attributes || {}; });
    } catch (e) { /* model unavailable — designators skipped */ }

    const cleanTxt = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const readTxt = (rec, key) =>
      String(rec[key] == null ? '' : rec[key]).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const connLabel = (rec, key) => {
      const raw = rec[key + '_raw'];
      if (Array.isArray(raw) && raw.length && raw[0]) return String(raw[0].identifier || '').trim();
      return readTxt(rec, key);
    };
    const cellNum = (tr, key) => {
      const td = tr.querySelector('td.' + key);
      const n = td ? parseFloat(cleanTxt(td.textContent).replace(/[^0-9.\-]/g, '')) : NaN;
      return isFinite(n) ? n : 0;
    };
    // First group header at exactly wantLvl walking up from tr; '' when the
    // walk passes a shallower header first (no such ancestor).
    const enclosingGroupLabel = (tr, wantLvl) => {
      let p = tr.previousElementSibling;
      while (p) {
        const l = groupLevel(p);
        if (l && l <= wantLvl) {
          if (l !== wantLvl) return '';
          const td = p.querySelector('td');
          return td ? cleanTxt(td.textContent) : '';
        }
        p = p.previousElementSibling;
      }
      return '';
    };

    const adds = [], removes = [];
    allRows.forEach((tr) => {
      if (!isDataRow(tr)) return;
      const rec = modelById[tr.id] || {};
      // Relocated accessory rows carry their own product name (set before
      // the move); everything else reads its enclosing L3 header.
      // cleanProductLabel strips designator lists baked into the name by
      // older passes and collapses doubled trailing SKUs.
      const product = cleanProductLabel(tr.getAttribute('data-scw-product-name') || '') ||
        cleanProductLabel(enclosingGroupLabel(tr, 3));
      const prefix = connLabel(rec, ctx.keys.prefix);
      const number = readTxt(rec, ctx.keys.number);
      // Line value is the LINE ITEM TOTAL (field_2203 = install fee +
      // discount-net equipment) so the manifest's Net change equals the
      // Change Order Total — one number everywhere the customer looks.
      // The previous labor+field_2269 composition silently dropped the
      // equipment side on grids whose model doesn't carry field_2269
      // (view_3341 doesn't) — observed 2026-07-17 as Net change $1,338
      // (labor only) vs Change Order Total $878. (If a proposal-level
      // discount is ever applied to a CO, the totals will differ by that
      // amount — the manifest is per-line and can't carry it.)
      let amt;
      if (typeof rec['field_2203_raw'] === 'number') {
        amt = Number(rec['field_2203_raw']) || 0;
      } else {
        amt = cellNum(tr, 'field_2203');
      }
      const entry = {
        product: product,
        desig: prefix ? prefix + number : '',
        loc: enclosingGroupLabel(tr, 1),
        qty: cellNum(tr, ctx.keys.qty) || 1,
        amt: amt,
      };
      if (coRmIsRemoveTr(tr)) removes.push(entry);
      // Adds: only rows with something to show (skips assumptions text rows).
      else if (entry.product || entry.amt) adds.push(entry);
    });

    // Document-wide lookup — once docked under the ops stepper the panel
    // lives OUTSIDE this view's root; a root-scoped lookup would recreate a
    // duplicate above the grid on the next pipeline run.
    let summary = document.getElementById(CO_RM.summaryId);
    if (!anyAction) {
      // Base proposal — no CO Action values anywhere. No manifest.
      if (summary) summary.remove();
      return;
    }
    if (root) {
      if (!summary) {
        summary = document.createElement('div');
        summary.id = CO_RM.summaryId;
        const table = root.querySelector('table');
        (table ? table.parentNode : root).insertBefore(summary, table || root.firstChild);
      }
      // Merge identical products (same product + location) into one row —
      // an accessory add otherwise lists the same bracket once per camera,
      // which reads as a wall of repeated text on the agreement. Qty and
      // amounts sum; designators join into the meta line.
      const groupEntries = (list) => {
        const byKey = new Map();
        list.forEach((e) => {
          const key = e.product + '¦' + e.loc;
          const g = byKey.get(key);
          if (g) {
            g.qty += e.qty;
            g.amt += e.amt;
            if (e.desig) g.desigs.push(e.desig);
          } else {
            byKey.set(key, Object.assign({}, e, { desigs: e.desig ? [e.desig] : [] }));
          }
        });
        return Array.from(byKey.values()).map((g) => {
          g.desig = g.desigs.join(', ');
          return g;
        });
      };
      const addsG = groupEntries(adds);
      const removesG = groupEntries(removes);
      // Item counts stay the TOTAL number of line items (qty sum), not the
      // number of merged display rows.
      const countOf = (list) => list.reduce((t, e) => t + (e.qty || 1), 0);

      // Location in the meta line is only useful when the CO touches more
      // than one location — otherwise it's the same string on every row.
      const locSet = new Set(
        addsG.concat(removesG).map((e) => e.loc).filter(Boolean));
      const showLoc = locSet.size > 1;
      const itemRows = (list) => list.map((e) => {
        const meta = [e.desig, showLoc ? e.loc : ''].filter(Boolean).join(' · ');
        return `<tr><td>${coRmEsc(e.product || '(item)')}` +
          (meta ? `<span class="scw-cos-meta">${coRmEsc(meta)}</span>` : '') +
          `</td><td class="scw-cos-qty">${e.qty}</td>` +
          `<td class="scw-cos-amt">${coRmEsc(coRmMoney(e.amt))}</td></tr>`;
      }).join('');
      const subRow = (label, total) =>
        `<tr class="scw-cos-sub"><td>${coRmEsc(label)}</td><td></td>` +
        `<td class="scw-cos-amt">${coRmEsc(coRmMoney(total))}</td></tr>`;
      const addTotal = addsG.reduce((t, e) => t + e.amt, 0);
      const rmTotal  = removesG.reduce((t, e) => t + e.amt, 0);

      summary.innerHTML =
        `<div class="scw-cos-title">Change Order — What's Changing</div>` +
        `<div class="scw-cos-desc">This change order amends the previously approved ` +
          `installation scope. In the itemized list below, added items are shaded ` +
          `<b class="scw-cos-g">green</b>; removed items are shaded ` +
          `<b class="scw-cos-r">red</b> and credited back.</div>` +
        `<div class="scw-cos-cols">` +
          (addsG.length ?
            `<div class="scw-cos-col scw-cos-col--add">` +
              `<div class="scw-cos-head">Adding to install scope (${countOf(addsG)})</div>` +
              `<table class="scw-cos-table"><tbody>${itemRows(addsG)}${subRow('Subtotal — additions', addTotal)}</tbody></table>` +
            `</div>` : '') +
          (removesG.length ?
            `<div class="scw-cos-col scw-cos-col--rm">` +
              `<div class="scw-cos-head">Removing from install scope — credit (${countOf(removesG)})</div>` +
              `<table class="scw-cos-table"><tbody>${itemRows(removesG)}${subRow('Subtotal — credits', rmTotal)}</tbody></table>` +
            `</div>` : '') +
        `</div>` +
        `<div class="scw-cos-net"><span class="scw-cos-net-label">Net change</span>` +
        `<span>${coRmEsc(coRmMoney(addTotal + rmTotal))}</span></div>`;

      // Collapse state + chevron + dock under the ops stepper (innerHTML
      // rebuild above wiped the chevron; re-mount is idempotent).
      coRmMountSummary(summary);
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
        'scwL4_2019_RunId',
        'scwL3EachRunId',
        'scwL3ConnDevRunId',
        // NOTE: scwHeaderCellsAdded is intentionally NOT cleared here.
        // The appended <td> cells persist on group-header rows across
        // re-runs, so the guard must persist too — otherwise the safety-
        // net re-run appends a second set of cells (double Qty/Cost).
        'scwL2Rewrite_' + runId,
      ]);

    $tbody.find('tr.scw-level-total-row').remove();
    // Remove synthetic headers from previous runs so they're rebuilt fresh
    $tbody.find('tr.scw-synthetic-l4, tr.scw-synthetic-l2, tr.scw-synthetic-l3').remove();
    $tbody
      .find(`tr.kn-table-group.kn-group-level-3.${ctx.l2Specials.classOnLevel3}`)
      .removeClass(ctx.l2Specials.classOnLevel3);

    reorderLevel1Groups($tbody);
    reorderLevel2GroupsBySortField(ctx, $tbody, runId);
    reorderLevel3GroupsBySortField(ctx, $tbody, runId);

    // Move accessory rows (field_2464 → parent) under their parent
    // device row, before L4 synthesis so synthesized headers respect
    // the new row positions.
    relocateAccessoriesToParents(ctx);

    // Rebuild L2/L3 headers Knack suppressed for items identical to a prior
    // group (so the orphaned data row gets its bucket + product headers back),
    // THEN synthesize any missing L4 headers on top.
    synthesizeMissingAncestorHeaders(ctx);
    synthesizeMissingL4Headers(ctx);

    // CO: in-place rose tint + chips on Remove-action rows, removal badges
    // on group headers, and the "What's Changing" manifest above the grid.
    // Never moves a row. Runs after header synthesis so the manifest can
    // read product names off the L3 headers. No-op on base proposals.
    sectionCoRemovals(ctx);

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
    const laborKey = ctx.keys.labor;
    const hardwareKey = ctx.keys.hardware;
    const costKey = ctx.keys.cost;
    const discountKey = ctx.keys.discount;

    let blankL1Active = false;

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

        if (blankL1Active) {
          // Promote L2 to L1: mark for styling (applied after totals computed)
          $groupRow.addClass('scw-promoted-l2-as-l1');

          // Rename "Assumptions" → "General Project Assumptions" when promoted
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

      const totals = sumFields(
        caches,
        $rowsToSum,
        [qtyKey, laborKey, hardwareKey, costKey, discountKey, 'field_2303'].filter(Boolean)
      );

      if (level === 1) {
        const l1Label = getGroupLabelText($groupRow);

        if (isBlankish(l1Label)) {
          // Blank L1: hide its header and promote child L2s to act as L1
          $groupRow.hide();
          blankL1Active = true;
          return; // skip L1 header styling and footer push
        }

        // Non-blank L1: reset promotion flag
        blankL1Active = false;

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        const l1Subtotal = (totals[hardwareKey] || 0) + (totals[laborKey] || 0);
        if (Math.abs(l1Subtotal) >= 0.01) hasAnyNonZeroL1Subtotal = true;

        $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>').addClass('scw-l1-header-qty');
        $groupRow.find(`td.${costKey}`).html('<strong>Cost</strong>').addClass('scw-l1-header-cost');
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();
      }

      // Promoted L2 → L1 header styling (needs totals, so placed after sumFields)
      if (level === 2 && blankL1Active) {
        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        const l2Subtotal = (totals[hardwareKey] || 0) + (totals[laborKey] || 0);
        if (Math.abs(l2Subtotal) >= 0.01) {
          hasAnyNonZeroL1Subtotal = true;
          $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>').addClass('scw-l1-header-qty');
          $groupRow.find(`td.${costKey}`).html('<strong>Cost</strong>').addClass('scw-l1-header-cost');
        }
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();
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

        if (ctx.features.hideL3WhenBlank?.enabled) {
          const labelText = getGroupLabelText($groupRow);
          if (isBlankish(labelText)) {
            $groupRow.addClass('scw-hide-level3-header');
            return;
          }
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

        const qty = totals[qtyKey];
        const hardware = totals[hardwareKey];

        $groupRow.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${costKey}`).html(`<strong>${escapeHtml(formatMoney(hardware))}</strong>`);
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();

        if (sectionContext.hideQtyCostColumns) $groupRow.addClass('scw-hide-qty-cost');

        injectEachIntoLevel3Header(ctx, caches, { level, $groupRow, $rowsToSum, runId });
        injectConnectedDevicesIntoLevel3Header(ctx, caches, { $groupRow, $rowsToSum, runId });
      }

      if (level === 4) {
        const blankL4Opt = ctx.features.hideBlankL4Headers;
        $groupRow.removeClass(blankL4Opt?.cssClass || 'scw-hide-level4-header').show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

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

        if (level === 2 && !blankL1Active && shouldHideLevel2Footer(ctx, levelInfo)) return;

        // When L2 is promoted (blankL1Active), use level 1 for footer rules
        const effectiveLevel = (level === 2 && blankL1Active) ? 1 : level;

        footerQueue.push({
          level: effectiveLevel,
          label: levelInfo.label,
          contextKey: sectionContext.key,
          hideQtyCostColumns: effectiveLevel === 2 ? sectionContext.hideQtyCostColumns : false,
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

        // ✅ MULTI-ROW SAFE (L1 can return 1 or 3 rows)
        $row.each(function () {
          fragment.appendChild(this);
        });
      }

      anchorEl.parentNode.insertBefore(fragment, anchorEl.nextSibling);
    }

    applyLevel2LabelRewrites(ctx, $tbody, runId);

    if (shouldHideSubtotalFilterFlag) hideSubtotalFilter(ctx);

    if (!hasAnyNonZeroL1Subtotal) {
      $tbody.find('.scw-l1-header-qty, .scw-l1-header-cost').empty();
    }

    // Post-process the relocated mounting hardware: roll up brackets
    // per product, fix the L4 cost cell (uses labor by default, which
    // is $0 for brackets), and de-double-count the parent L3 Qty.
    postProcessMountingClusters(ctx);

    // ✅ Project Grand Total rows — appended to end of tbody
    refreshProjectTotals(ctx, caches, $tbody);

    log(ctx, 'runTotalsPipeline complete', { runId });
  }

  // Standalone refresh so view_3342 render can re-trigger it
  const _lastPipelineState = {};

  function refreshProjectTotals(ctx, caches, $tbody) {
    // Guard: skip if $tbody has been detached from the live DOM
    // (can happen when view_3342 fires while a view is mid-re-render).
    if (!$tbody.length || !document.contains($tbody[0])) return;

    // Store state so view_3342 handler can re-invoke
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

    if (isInstallationMasked()) applyTBDLabels(ctx);
  }

  // ============================================================
  // FEATURE: Mask installation values with "TBD"
  // When field_2725 (FLAG_released to sales) in view_3861 is not
  // "Yes", zero out labor cells BEFORE the pipeline so all sums
  // exclude installation, then label the zeroed cells as "TBD"
  // after. Sales-facing viewers shouldn't see install figures
  // until Ops has explicitly released the quote.
  // ============================================================

  function isInstallationMasked() {
    // Ops bypass — view_3345 (the Ops stepper host) is role-gated by Knack
    // to Ops users. When Knack's display rule excludes a viewer from a
    // view, depending on the rule configuration the view either renders
    // hidden (display:none) or is removed from the DOM entirely. Treat
    // both as "not Ops" by checking presence AND visibility.
    var ops = document.getElementById('view_3345');
    if (ops && ops.offsetParent !== null) return false;

    var view = document.getElementById('view_3861');
    if (view) {
      var cell = view.querySelector('.kn-detail.field_2725 .kn-detail-body');
      if (cell) return !/^yes$/i.test((cell.textContent || '').trim());
    }
    if (typeof Knack !== 'undefined' && Knack.views && Knack.views.view_3861) {
      var model = Knack.views.view_3861.model;
      var attrs = model && (model.attributes || (model.toJSON && model.toJSON()) || {});
      if (attrs.field_2725 !== undefined) {
        return !/^yes$/i.test(String(attrs.field_2725).replace(/<[^>]*>/g, '').trim());
      }
    }
    // Default to MASKED when we can't read the validation state.
    // Knack's role rules can omit view_3861 from the DOM entirely for
    // Sales viewers, in which case we have no signal to read field_2725
    // from. The safe behavior is to mask labor (treat as not-yet-
    // validated) rather than leak numbers. The Ops bypass above ensures
    // Ops still sees real numbers.
    return true;
  }

  function zeroLaborCells(ctx) {
    var $view = $(document.getElementById(ctx.viewId));
    if (!$view.length) return;
    var laborKey = ctx.keys.labor;
    $view.find('tr[id] td.' + laborKey).each(function () {
      var val = parseFloat(this.textContent.replace(/[^0-9.\-]/g, '')) || 0;
      if (val !== 0) {
        $(this).closest('tr').attr('data-scw-had-labor', '1');
      }
      this.textContent = '$0.00';
    });
  }

  function applyTBDLabels(ctx) {
    var viewRoot = document.getElementById(ctx.viewId);
    if (!viewRoot) return;
    var $view = $(viewRoot);
    var laborKey = ctx.keys.labor;
    var costKey = ctx.keys.cost;
    var TBD = '<span class="scw-tbd">TBD</span>';

    // Data-row labor cells → TBD
    $view.find('tr[id] td.' + laborKey).each(function () {
      $(this).html(TBD);
    });

    // L4 group cost cells → TBD. Mask applies uniformly: once the
    // bid isn't validated, every install-labor cell reads TBD,
    // regardless of whether descendant data rows happened to have
    // non-zero labor originally. Previously we only masked L4s whose
    // rows had labor, which left mounting-hardware sections showing
    // "$0.00" alongside masked-TBD siblings.
    $view.find('tr.kn-table-group.kn-group-level-4').each(function () {
      var $costCell = $(this).find('td.' + costKey);
      if ($costCell.length) $costCell.html('<strong>' + TBD + '</strong>');
    });

    // Synthetic mounting-hardware install-labor lines (e.g. a rack
    // enclosure's "Install and assemble…" line). postProcessMountingClusters
    // builds these with a $0.00 cost on masked grids (labor cells were
    // zeroed pre-pipeline); mask that cost to TBD like every other labor cell.
    $view.find('tr.scw-mounting-labor-line').each(function () {
      var $costCell = $(this).find('td.' + costKey);
      if ($costCell.length) $costCell.html(TBD);
    });

    // Installation Total AND Grand Total → TBD. The grand total sums in
    // install labor (grandTotal = equipment + installation − discount), so
    // while labor is unreleased it can't show a real number — it reads "TBD",
    // not the equipment-only figure.
    $view.find('tr.scw-project-totals').each(function () {
      var $tr = $(this);
      var label = ($tr.find('.scw-l1-labelcell').text() || '').trim().toLowerCase();
      if (label.indexOf('installation') !== -1 || label.indexOf('grand total') !== -1 ||
          label.indexOf('change order total') !== -1) {
        $tr.find('.scw-l1-valuecell').html('<strong>' + TBD + '</strong>');
      }
    });
  }

  // ============================================================
  // EVENT BINDING (multi-view)
  // ============================================================

  // Pending safety-net state per view.
  const _safetyState = {};

  function bindForView(viewId) {
    const ev = `knack-records-render.${viewId}${CONFIG.eventNs}`;

    $(document)
      .off(ev)
      .on(ev, function (event, view) {
        // Tear down any prior safety-net timers / observer for this view.
        const prev = _safetyState[viewId];
        if (prev) {
          prev.timers.forEach(clearTimeout);
          if (prev.obs) prev.obs.disconnect();
        }
        _safetyState[viewId] = { timers: [], obs: null };

        let pipelineRunning = false;

        function executePipeline() {
          // Always re-acquire DOM context so we never touch a detached tbody.
          const ctx = buildCtx(viewId, view);
          if (!ctx) return;

          // CO bands: un-band BEFORE transforming. The pipeline's grouping
          // walk anchors synthetic rows (mounting clusters, subtotals,
          // totals) relative to row order — running it on a band-reordered
          // tbody strands them at the top of the table, disconnected from
          // their section. co-band-mockup.js re-bands via the applyView
          // hook at the end of this pass.
          try {
            if (window.SCW && window.SCW.coBands && window.SCW.coBands.suspend) {
              window.SCW.coBands.suspend(viewId);
            }
          } catch (coErr) { /* banding is presentational — never block the pipeline */ }

          injectCssOnce();
          normalizeField2019ForGrouping(ctx);

          // Pre-pipeline: zero out labor cells so sums exclude installation
          var masked = isInstallationMasked();
          if (masked) zeroLaborCells(ctx);

          pipelineRunning = true;
          try {
            runTotalsPipeline(ctx);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`[SCW totals][${viewId}] error:`, error);
          } finally {
            pipelineRunning = false;
          }

          // Post-pipeline: replace zeroed labor with TBD labels
          if (masked) applyTBDLabels(ctx);

          // CO bands: re-apply synchronously on the fresh output (no
          // timer gap for another pass to sneak into). No-op on base
          // proposals — the module keys off the scw-co-add/rm-row
          // classes this pipeline just stamped.
          try {
            if (window.SCW && window.SCW.coBands && window.SCW.coBands.applyView) {
              window.SCW.coBands.applyView(viewId);
            }
          } catch (coErr2) { /* banding is presentational — never block reveal */ }

          // Reveal the grid only once relocation has settled (or there
          // was nothing to relocate). Until then it stays
          // visibility:hidden so accessories never flash in their own
          // section and then repaint under their parent camera — and so
          // the camera line cost is never shown in its transient
          // bracket-inclusive state. A fallback timer below force-reveals
          // in case relocation can never settle (orphan accessories whose
          // parent lives in another view).
          if (!pipelineIncomplete()) {
            const rootEl = document.getElementById(viewId);
            if (rootEl) rootEl.classList.add('scw-grid-ready');
          }
        }

        function totalsAreMissing() {
          var root = document.getElementById(viewId);
          if (!root) return false;
          var $tbody = $(root).find('.kn-table tbody');
          return $tbody.length && !$tbody.find('tr.scw-level-total-row').length;
        }

        // Detects the first-load race where the pipeline ran before the
        // secondary view holding field_2464_raw had hydrated — relocate-
        // AccessoriesToParents returned an empty parentMap, so no rows
        // got moved under the synthetic L4 cluster. totalsAreMissing()
        // doesn't catch this because totals DO get written; the mounting
        // structure is the part that's missing. Re-runs are safe — the
        // pipeline is idempotent.
        function mountingStructureMissing() {
          var feat = CONFIG.features && CONFIG.features.relocateAccessoriesToParents;
          if (!feat || !feat.enabled) return false;
          var parentField = feat.parentConnectionField || 'field_2464';
          var root = document.getElementById(viewId);
          if (!root) return false;
          var tbody = root.querySelector('.kn-table tbody');
          if (!tbody) return false;

          var knownIds = Object.create(null);
          var rows = tbody.querySelectorAll('tr[id]');
          for (var i = 0; i < rows.length; i++) {
            if (rows[i].id && rows[i].id.indexOf('kn-') !== 0) {
              knownIds[rows[i].id] = rows[i];
            }
          }
          if (typeof Knack === 'undefined' || !Knack.views) return false;

          for (var viewKey in Knack.views) {
            var v = Knack.views[viewKey];
            var m = v && v.model && v.model.data && v.model.data.models;
            if (!m || !m.length) continue;
            for (var j = 0; j < m.length; j++) {
              var attrs = m[j].attributes || m[j];
              var childId = attrs && attrs.id;
              var childRow = childId && knownIds[childId];
              if (!childRow) continue;
              var raw = attrs[parentField + '_raw'];
              if (!raw || !raw.length || !raw[0] || !raw[0].id) continue;
              var parentId = raw[0].id;
              if (parentId === childId) continue;
              // Only flag as "missing" if the parent row is actually in
              // this tbody — otherwise relocation will never succeed
              // (orphan accessories whose parent lives in a different
              // view), and saying "incomplete" here would make the
              // sibling-render listener re-fire executePipeline on
              // every Knack view-render until the 30s deadline, which
              // shows up as a UI freeze on busy scenes like the
              // proposal-preview page.
              if (!knownIds[parentId]) continue;
              if (!childRow.classList.contains('scw-relocated-accessory')) {
                return true;
              }
            }
          }
          return false;
        }

        function pipelineIncomplete() {
          return totalsAreMissing() || mountingStructureMissing();
        }

        // Run the pipeline synchronously — the DOM is ready when
        // knack-records-render fires, so there is no reason to defer.
        executePipeline();

        // Safety net 1: staggered timer checks. 300ms / 1200ms catch
        // Knack async re-renders that wipe our injected rows; 3000ms /
        // 6000ms / 12000ms cover slow-loading secondary views (the one
        // that exposes field_2464_raw for accessory→parent relocation),
        // which on first scene load can hydrate well after the initial
        // pipeline run.
        [300, 1200, 3000, 6000, 12000].forEach(function (ms) {
          var t = setTimeout(function () {
            if (pipelineIncomplete()) executePipeline();
          }, ms);
          _safetyState[viewId].timers.push(t);
        });

        // Fallback reveal: never leave the grid hidden. If relocation can
        // never settle (e.g. orphan accessories whose parent row lives in
        // a different view), executePipeline won't add .scw-grid-ready on
        // its own, so force it after a short grace period. The common case
        // reveals far sooner — as soon as the first settled run completes.
        var revealFallback = setTimeout(function () {
          var rootEl = document.getElementById(viewId);
          if (rootEl) rootEl.classList.add('scw-grid-ready');
        }, 2500);
        _safetyState[viewId].timers.push(revealFallback);

        // Safety net 2: short-lived MutationObserver on the view root.
        // Catches Knack wiping tbody content between our timer checks.
        var viewRoot = document.getElementById(viewId);
        if (viewRoot) {
          var obsDebounce = 0;
          var obs = new MutationObserver(function () {
            if (pipelineRunning) return;          // we caused this mutation
            if (obsDebounce) clearTimeout(obsDebounce);
            obsDebounce = setTimeout(function () {
              obsDebounce = 0;
              if (pipelineIncomplete()) executePipeline();
            }, 80);
          });
          obs.observe(viewRoot, { childList: true, subtree: true });
          _safetyState[viewId].obs = obs;

          // Disconnect observer after 4s — we only need it for the initial
          // settle period.  Keeps long-lived overhead at zero. Bumped from
          // 3s so the observer is still live when the 3000ms timer fires.
          var disconnectTimer = setTimeout(function () { obs.disconnect(); }, 4000);
          _safetyState[viewId].timers.push(disconnectTimer);
        }

        // Safety net 3: listen for ANY sibling view render. The view
        // that exposes field_2464_raw lives elsewhere on the page (the
        // proposal-grid view itself doesn't include that column in its
        // model). On first scene load it can hydrate after our 12s
        // timer tail expires — and when it finally lands, we want to
        // re-run the pipeline so accessories actually relocate under
        // their parents. Debounced + auto-disengages after 30s and
        // after mounting structure looks settled.
        var siblingNs = '.scwProposalGridSibling_' + viewId;
        var siblingDebounce = 0;
        $(document).off('knack-view-render' + siblingNs);
        $(document).on('knack-view-render' + siblingNs, function (_e, view) {
          if (pipelineRunning) return;
          if (view && view.key === viewId) return;     // our own view; already handled
          if (siblingDebounce) clearTimeout(siblingDebounce);
          siblingDebounce = setTimeout(function () {
            siblingDebounce = 0;
            if (pipelineIncomplete()) executePipeline();
          }, 120);
        });
        var siblingKill = setTimeout(function () {
          $(document).off('knack-view-render' + siblingNs);
        }, 30000);
        _safetyState[viewId].timers.push(siblingKill);
      });
  }

  Object.keys(CONFIG.views).forEach(bindForView);

  // Catch-up pass: if the bundle finished loading AFTER Knack already
  // emitted knack-records-render.view_XXXX (common on slow connections
  // or large scenes), our handler missed the initial event entirely
  // and the safety-nets inside it were never armed. For each configured
  // view that's already rendered with data, trigger the event once so
  // bindForView's handler runs.
  Object.keys(CONFIG.views).forEach(function (viewId) {
    var attempts = 0;
    var maxAttempts = 20;          // ~6s total at 300ms cadence
    var intervalMs = 300;
    var iv = setInterval(function () {
      attempts++;
      var view = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewId] : null;
      var rendered = view && view.model && view.model.data
        && (Array.isArray(view.model.data) ? view.model.data.length
                                            : (view.model.data.models && view.model.data.models.length));
      var root = document.getElementById(viewId);
      var hasDataRows = !!(root && root.querySelector('tbody tr[id]'));
      var hasTotals = !!(root && root.querySelector('tbody tr.scw-level-total-row'));

      if (rendered && hasDataRows && !hasTotals) {
        $(document).trigger('knack-records-render.' + viewId, [view]);
        clearInterval(iv);
      } else if (hasTotals || attempts >= maxAttempts) {
        clearInterval(iv);
      }
    }, intervalMs);
  });

  // When view_3342 (detail view with field_2302) renders, refresh project totals
  $(document).on('knack-view-render.view_3342' + CONFIG.eventNs, function () {
    Object.keys(_lastPipelineState).forEach(function (viewId) {
      const s = _lastPipelineState[viewId];
      if (s && s.ctx.showProjectTotals) {
        refreshProjectTotals(s.ctx, s.caches, s.$tbody);
      }
    });
  });
})();