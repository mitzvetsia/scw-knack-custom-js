/////************* PROPOSAL VIEW OF SOW (effective Q1 2026) *****************//////
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
 *      `tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-totals-grid__...`
 */
(function () {
  'use strict';

  // ============================================================
  // Externalized modules (COMMONJS)
  // ============================================================
  // These modules should be created under src/features/proposal-grid/
  // - config.js
  // - utils.js
  // - css.js
  const CONFIG = require('./proposal-grid/config');
  const utils = require('./proposal-grid/utils');
  const { injectCssOnce } = require('./proposal-grid/css');

  // Local aliases used throughout the rest of this file (to keep existing code unchanged)
  const {
    escapeHtml,
    decodeEntities,
    norm,
    normKey,
    isBlankish,
    formatMoney,
    formatMoneyAbs,
    log,
    clearNormKeyCache,
  } = utils;

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

    const finalTotal = cost + (hasDiscount ? discount : 0);

    const safeHideQtyCost = level === 1 ? false : Boolean(hideQtyCost);

    const $row = $(`
      <tr
        class="scw-level-total-row scw-subtotal scw-subtotal--level-${level}${safeHideQtyCost ? ' scw-hide-qty-cost' : ''}"
        data-scw-subtotal-level="${level}"
        data-scw-context="${escapeHtml(contextKey || 'default')}"
        data-scw-group-label="${escapeHtml(groupLabel || '')}"
      >
        <td class="scw-level-total-label"><strong>${escapeHtml(leftText)}</strong></td>
      </tr>
    `);

    $row.append($cellsTemplate.clone());

    $row.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
    $row.find(`td.${costKey}`).html(`<strong>${escapeHtml(formatMoney(cost))}</strong>`);
    $row.find(`td.${hardwareKey},td.${laborKey}`).empty();

    if (level === 1) {
      if (Math.abs(cost) < 0.01) {
        $row.css('display', 'none');
        return $row;
      }

      const $qtyCell = $row.find(`td.${qtyKey}`);
      const $laborCell = $row.find(`td.${laborKey}`);
      const $hardwareCell = $row.find(`td.${hardwareKey}`);
      const $costCell = $row.find(`td.${costKey}`);

      $qtyCell.addClass('scw-l1-qty-cell');

      $laborCell.empty();
      $hardwareCell.empty();

      $costCell.attr('colspan', '3').addClass('scw-l1-totals-span');
      $laborCell.css('display', 'none');
      $hardwareCell.css('display', 'none');

      $costCell.html(
        hasDiscount
          ? `
            <div class="scw-l1-totals-grid">
              <div class="scw-l1-totals-grid__label scw-l1-totals-grid__pre">Pre-Discount:</div>
              <div class="scw-l1-totals-grid__value scw-l1-totals-grid__pre">${escapeHtml(formatMoney(cost))}</div>

              <div class="scw-l1-totals-grid__label scw-l1-totals-grid__disc">Discounts:</div>
              <div class="scw-l1-totals-grid__value scw-l1-totals-grid__disc">–${escapeHtml(formatMoneyAbs(discount))}</div>

              <div class="scw-l1-totals-grid__label scw-l1-totals-grid__final">Final Total:</div>
              <div class="scw-l1-totals-grid__value scw-l1-totals-grid__final">${escapeHtml(formatMoney(finalTotal))}</div>
            </div>
          `
          : `
            <div class="scw-l1-totals-grid">
              <div class="scw-l1-totals-grid__label scw-l1-totals-grid__final">Subtotal:</div>
              <div class="scw-l1-totals-grid__value scw-l1-totals-grid__final">${escapeHtml(formatMoney(cost))}</div>
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
  // MAIN PROCESSOR
  // ============================================================

  function runTotalsPipeline(ctx) {
    const runId = Date.now();
    const $tbody = ctx.$tbody;
    if (!$tbody.length || $tbody.find('.kn-tr-nodata').length) return;

    // was: normKeyCache.clear();
    clearNormKeyCache();
    const caches = makeRunCaches();

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
    let hasAnyNonZeroL1Subtotal = false;

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

      const totals = sumFields(
        caches,
        $rowsToSum,
        [qtyKey, laborKey, hardwareKey, costKey, discountKey].filter(Boolean)
      );

      if (level === 1) {
        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        const l1Cost = totals[costKey] || 0;
        if (Math.abs(l1Cost) >= 0.01) hasAnyNonZeroL1Subtotal = true;

        $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>').addClass('scw-l1-header-qty');
        $groupRow.find(`td.${costKey}`).html('<strong>Cost</strong>').addClass('scw-l1-header-cost');
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

        if (level === 2 && shouldHideLevel2Footer(ctx, levelInfo)) return;

        footerQueue.push({
          level,
          label: levelInfo.label,
          contextKey: sectionContext.key,
          hideQtyCostColumns: level === 2 ? sectionContext.hideQtyCostColumns : false,
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

        fragment.appendChild($row[0]);
      }

      anchorEl.parentNode.insertBefore(fragment, anchorEl.nextSibling);
    }

    applyLevel2LabelRewrites(ctx, $tbody, runId);

    if (shouldHideSubtotalFilterFlag) hideSubtotalFilter(ctx);

    if (!hasAnyNonZeroL1Subtotal) {
      $tbody.find('.scw-l1-header-qty, .scw-l1-header-cost').empty();
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