




/////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/**
 * SCW Totals Script - Optimized Version
 * Version: 2.0 - Fixed WeakMap.clear() issue
 * Last Updated: 2025-01-26
 *
 * PATCHES:
 *  - Hide Level-3 header row when product-name group label is blank-ish (grouped by field_2208)
 *  - Restore camera concat for "drop" (Cameras/Entries) by expanding L2_CONTEXT.byLabel variants
 *  - L4 field_2019 injection is non-destructive (never hides L4 header)
 *  - ✅ NEW: When Level-2 is "Mounting Hardware", inject camera label list into Level-3 header (not Level-4)
 *  - ✅ FIX: Mounting Hardware L3 concat gating is centralized + normalized (no brittle string match inside injector)
 *  - ✅ NEW PATCH (2026-01-30): Hide stray blank Level-4 header rows (Knack creates a group for empty L4 grouping values)
 */
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================

  const VIEW_IDS = ['view_3301', 'view_3341'];
  const EVENT_NS = '.scwTotals';

  // Field keys
  const QTY_FIELD_KEY = 'field_1964';
  const LABOR_FIELD_KEY = 'field_2028';
  const HARDWARE_FIELD_KEY = 'field_2201';
  const COST_FIELD_KEY = 'field_2203';

  // ✅ Hide L3 group header if product-name group label is blank-ish
  const HIDE_LEVEL3_WHEN_FIELD_BLANK = {
    enabled: true,
    fieldKey: 'field_2208',
  };

  // ✅ NEW: Hide stray blank Level-4 headers
  // (Knack creates a Level-4 group for empty grouping values; we hide header-only if there’s no usable label.)
  const HIDE_LEVEL4_WHEN_HEADER_BLANK = {
    enabled: true,
    cssClass: 'scw-hide-level4-header',
    // If field_2019 has meaningful text, we keep the header (because injectField2019IntoLevel4Header may fill it).
    requireField2019AlsoBlank: true,
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

  // ✅ NEW: For Mounting Hardware, inject camera list into Level-3 header (not Level-4)
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

  const sanitizeRegex = /<\/?strong\b[^>]*>/gi;
  const removeTagsRegex = /<(?!\/?(br|b)\b)[^>]*>/gi;

  function sanitizeAllowOnlyBrAndB(html) {
    if (!html) return '';
    return html
      .replace(sanitizeRegex, (tag) => tag.replace(/strong/gi, 'b'))
      .replace(removeTagsRegex, '');
  }

  function formatMoney(n) {
    const num = Number(n || 0);
    return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
  }

  function sumField($rows, fieldKey) {
    let total = 0;
    const rows = $rows.get();

    for (let i = 0; i < rows.length; i++) {
      const cell = rows[i].querySelector(`td.${fieldKey}`);
      if (!cell) continue;
      const num = parseFloat(cell.textContent.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(num)) total += num;
    }
    return total;
  }

  function norm(s) {
    return String(s || '').replace(/\u00A0/g, ' ').trim();
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

  // ✅ NEW: read group label text (works for L3/L4)
  function getGroupLabelText($groupRow) {
    const $td = $groupRow.children('td').first();
    return $td.length ? norm($td.text()) : '';
  }

  let cssInjected = false;
  function injectCssOnce() {
    if (cssInjected) return;
    cssInjected = true;

    const style = document.createElement('style');
    style.id = 'scw-totals-css';
    style.textContent = `
      tr.scw-level-total-row.scw-subtotal td { vertical-align: middle; }
      tr.scw-level-total-row.scw-subtotal .scw-level-total-label { white-space: nowrap; }
      .scw-concat-cameras { line-height: 1.2; }
      .scw-l4-2019 { line-height: 1.2; }
      .scw-each { line-height: 1.1; }
      .scw-each__label { font-weight: 700; opacity: .9; margin-bottom: 2px; }

      /* hard-hide L3 header rows when flagged */
      tr.scw-hide-level3-header { display: none !important; }

      /* optional: slightly tighter list for Mounting Hardware L3 */
      .scw-concat-cameras--mounting { line-height: 1.15; }

      /* ✅ NEW: hard-hide stray blank L4 header rows when flagged */
      tr.scw-hide-level4-header { display: none !important; }
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
      const prefixCell = row.querySelector(`td.${CONCAT.prefixFieldKey}`);
      const numCell = row.querySelector(`td.${CONCAT.numberFieldKey}`);
      if (!prefixCell || !numCell) continue;

      const prefix = prefixCell.textContent.trim();
      const numRaw = numCell.textContent.trim();
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

  function injectConcatIntoHeader({ level, contextKey, $groupRow, $rowsToSum, runId }) {
    if (!CONCAT.enabled || level !== CONCAT.onlyLevel || contextKey !== CONCAT.onlyContextKey) return;
    if ($groupRow.data('scwConcatRunId') === runId) return;
    $groupRow.data('scwConcatRunId', runId);

    const cameraListHtml = buildCameraListHtml($rowsToSum);
    if (!cameraListHtml) return;

    const $labelCell = $groupRow.find('td:first');
    if (!$labelCell.length) return;

    const currentHtml = $labelCell.html() || '';
    const sanitizedBase = sanitizeAllowOnlyBrAndB(decodeEntities(currentHtml));

    $labelCell.html(
      `<div class="scw-concat-cameras">${sanitizedBase}<br/><b style="color:orange;"> (${cameraListHtml})</b></div>`
    );
  }

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
        `${sanitizedBase}<br/>` +
        `<b style="color:orange;">(${cameraListHtml})</b>` +
        `</div>`
    );
  }

  // ======================
  // FIELD_2019 INJECTION
  // ======================

  function injectField2019IntoLevel4Header({ level, $groupRow, $rowsToSum, runId }) {
    if (level !== 4 || !$groupRow.length || !$rowsToSum.length) return;
    if ($groupRow.data('scwL4_2019_RunId') === runId) return;
    $groupRow.data('scwL4_2019_RunId', runId);

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    const firstRow = $rowsToSum[0];
    const fieldCell = firstRow ? firstRow.querySelector('td.field_2019') : null;
    if (!fieldCell) return;

    let html = sanitizeAllowOnlyBrAndB(decodeEntities(fieldCell.innerHTML || ''));

    const textContent = html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?b>/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .trim();

    if (!textContent) return;

    labelCell.innerHTML = `<div class="scw-l4-2019">${html}</div>`;
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
    const cell = firstRow.querySelector(`td.${EACH_COLUMN.fieldKey}`);
    if (!cell) return;

    const num = parseFloat(cell.textContent.replace(/[^\d.-]/g, ''));
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
  }) {
    const leftText = labelOverride || groupLabel || '';

    const qty = sumField($rowsToSum, qtyFieldKey);
    const cost = sumField($rowsToSum, costSourceKey);

    const $row = $(`
      <tr
        class="scw-level-total-row scw-subtotal scw-subtotal--level-${level}"
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

    $tbody
      .find('tr')
      .removeData([
        'scwConcatRunId',
        'scwConcatL3MountRunId',
        'scwL4_2019_RunId',
        'scwL3EachRunId',
        'scwHeaderCellsAdded',
      ]);

    $tbody.find('tr.scw-level-total-row').remove();
    $tbody
      .find(`tr.kn-table-group.kn-group-level-3.${L2_SPECIALS.classOnLevel3}`)
      .removeClass(L2_SPECIALS.classOnLevel3);

    const $firstDataRow = $tbody.find('tr[id]').first();
    if (!$firstDataRow.length) return;

    const $cellsTemplate = $firstDataRow.find('td:gt(0)').clone().empty();
    const $allGroupRows = $tbody.find('tr.kn-table-group');

    const sectionContext = {
      level2: { label: null, recordId: null },
      key: 'default',
    };

    const footerQueue = [];

    $allGroupRows.each(function () {
      const $groupRow = $(this);
      const match = this.className.match(/kn-group-level-(\d+)/);
      if (!match) return;

      const level = parseInt(match[1], 10);

      if (level === 2) {
        const info = getLevel2InfoFromGroupRow($groupRow);
        sectionContext.level2 = info;
        sectionContext.key = contextKeyFromLevel2Info(info);
      }

      const $groupBlock = getGroupBlock($groupRow, level);
      if (!$groupBlock.length) return;

      const $rowsToSum = $groupBlock.filter('tr[id]');
      if (!$rowsToSum.length) return;

      // Level 1: Headers only
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

      // Level 3
      if (level === 3) {
        $groupRow.removeClass('scw-hide-level3-header').show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        if (HIDE_LEVEL3_WHEN_FIELD_BLANK.enabled) {
          const labelText = getGroupLabelText($groupRow);
          if (isBlankish(labelText)) {
            $groupRow.addClass('scw-hide-level3-header');
            return; // Level-4 will still be processed
          }
        }

        const nearestL2 = getNearestLevel2Info($groupRow);

        const isMounting =
          (L2_SPECIALS.mountingHardwareId && nearestL2.recordId === L2_SPECIALS.mountingHardwareId) ||
          (!L2_SPECIALS.mountingHardwareId &&
            norm(nearestL2.label) === norm(L2_SPECIALS.mountingHardwareLabel));

        if (isMounting) {
          $groupRow.addClass(L2_SPECIALS.classOnLevel3);
          injectConcatIntoLevel3HeaderForMounting({ $groupRow, $rowsToSum, runId });
        }

        const qty = sumField($rowsToSum, QTY_FIELD_KEY);
        const hardware = sumField($rowsToSum, HARDWARE_FIELD_KEY);

        $groupRow.find(`td.${QTY_FIELD_KEY}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${COST_FIELD_KEY}`).html(`<strong>${escapeHtml(formatMoney(hardware))}</strong>`);
        $groupRow.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();

        injectEachIntoLevel3Header({ level, $groupRow, $rowsToSum, runId });
      }

      // Level 4
      if (level === 4) {
        // reset any prior hide flag this run
        $groupRow.removeClass(HIDE_LEVEL4_WHEN_HEADER_BLANK.cssClass).show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        // ✅ NEW PATCH: hide stray blank L4 header rows
        if (HIDE_LEVEL4_WHEN_HEADER_BLANK.enabled) {
          const headerText = getGroupLabelText($groupRow);

          let field2019Text = '';
          if (HIDE_LEVEL4_WHEN_HEADER_BLANK.requireField2019AlsoBlank) {
            const firstRow = $rowsToSum[0];
            const cell2019 = firstRow ? firstRow.querySelector('td.field_2019') : null;
            field2019Text = cell2019 ? norm(cell2019.textContent || '') : '';
          }

          if (isBlankish(headerText) && (!HIDE_LEVEL4_WHEN_HEADER_BLANK.requireField2019AlsoBlank || isBlankish(field2019Text))) {
            $groupRow.addClass(HIDE_LEVEL4_WHEN_HEADER_BLANK.cssClass);
            // DO NOT return; keep totals/subtotals working for these rows
          }
        }

        injectField2019IntoLevel4Header({ level, $groupRow, $rowsToSum, runId });

        const qty = sumField($rowsToSum, QTY_FIELD_KEY);
        const labor = sumField($rowsToSum, LABOR_FIELD_KEY);

        $groupRow.find(`td.${QTY_FIELD_KEY}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${COST_FIELD_KEY}`).html(`<strong>${escapeHtml(formatMoney(labor))}</strong>`);
        $groupRow.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();

        injectConcatIntoHeader({ level, contextKey: sectionContext.key, $groupRow, $rowsToSum, runId });
      }

      // Queue footers for L1 and L2
      if (level === 1 || level === 2) {
        footerQueue.push({
          level,
          label: getLevel2InfoFromGroupRow($groupRow).label,
          contextKey: sectionContext.key,
          $groupBlock,
          $cellsTemplate,
          $rowsToSum,
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
        });

        fragment.appendChild($row[0]);
      }

      anchorEl.parentNode.insertBefore(fragment, anchorEl.nextSibling);
    }

    applyLevel2LabelRewrites($tbody, runId);
  }

  // ======================
  // FIELD_2019 NORMALIZE
  // ======================

  function normalizeField2019ForGrouping(viewId) {
    const cells = document.querySelectorAll(`#${viewId} .kn-table td.field_2019`);
    for (const cell of cells) {
      let html = sanitizeAllowOnlyBrAndB(decodeEntities(cell.innerHTML || ''));
      html = html
        .replace(/\s*<br\s*\/?>\s*/gi, '<br>')
        .replace(/\s*<b>\s*/gi, '<b>')
        .replace(/\s*<\/b>\s*/gi, '</b>')
        .trim();
      cell.innerHTML = html;
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
