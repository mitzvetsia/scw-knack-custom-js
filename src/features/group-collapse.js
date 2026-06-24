/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **********************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  // Per-scene overrides.  openIfFewerThan = record threshold below which
  // groups default to OPEN instead of collapsed.  Scenes not listed here
  // use DEFAULT_THRESHOLD.
  const SCENE_OVERRIDES = {
    scene_1085: { openIfFewerThan: 30 },
    scene_1116: { openIfFewerThan: 30 },
    scene_1140: { openIfFewerThan: 30 },
  };
  const DEFAULT_THRESHOLD = 30;
  const EVENT_NS = '.scwGroupCollapse';

  const COLLAPSED_BY_DEFAULT = true;
  const PERSIST_STATE = true;

  // ── Suppression flag ──
  // When true, automatic enhancement from MutationObserver and
  // knack-view-render is suppressed. The post-edit coordinator in
  // preserve-scroll-on-refresh.js sets this during the coordinated
  // restoration window to prevent premature enhancement on
  // intermediate DOM states and layout-shifting flicker.
  let _suppressAutoEnhance = false;

  // Coalesce window: after an enhance pass runs, redundant secondary
  // triggers (the knack-view-render timer, the MutationObserver, and the
  // post-edit coordinator's explicit call) skip if one ran within this
  // window. device-worksheet's transformView calls enhance() inline, so
  // the 2-3 follow-up passes that used to re-run on every inline edit —
  // each a full O(rows) accordion rebuild that shifted layout under the
  // scroll-restore — now collapse into that single pass.
  let _lastEnhanceAt = 0;
  const ENHANCE_COALESCE_MS = 350;
  function recentlyEnhanced() {
    return (Date.now() - _lastEnhanceAt) < ENHANCE_COALESCE_MS;
  }

  // Record count badge: list view IDs to enable
  const RECORD_COUNT_VIEWS = ['view_3359', 'view_3313', 'view_3512'];

  // Per-view configuration. `theme` is a named preset defined in
  // _design-tokens.js — it sets a `data-scw-l1-theme` attribute on the
  // view container, which CSS uses to retone --scw-grp-accent and
  // --scw-grp-accent-rgb within that subtree. Adding a new colour:
  // append a [data-scw-l1-theme="..."] block to _design-tokens.js, then
  // reference it here by name. Mixing in flags like `exclusive` and
  // `defaultOpen` is fine.
  const VIEW_OVERRIDES = {
    view_3374: { theme: 'sow-blue' },
    view_3325: { theme: 'sow-blue' },
    view_3331: { theme: 'sow-blue' },
    view_3475: { theme: 'slate' },
    view_3596: { defaultOpen: true },
    view_3997: { defaultOpen: true },
    // Device worksheet views — groups default expanded
    view_3512: { defaultOpen: true },
    // view_3505 (survey worksheet) removed — fully v2.
    view_3313: { defaultOpen: true },
    view_3602: { defaultOpen: true },
    view_3575: { defaultOpen: true },
    view_3608: { defaultOpen: true },
    view_3800: { defaultOpen: true },
    // Exclusive accordion: only one L1 (MDF/IDF) group open at a time.
    // Prevents a single large group from pushing every other group off
    // the viewport. Starts all-collapsed so the user picks where to work.
    // `startAllCollapsed: true` suppresses the "auto-open first L1 when
    // none are open" branch of exclusive enforcement, so a fresh load
    // (no saved state) shows every group collapsed.
    // view_3586 + view_3610 (sales/ops build SOW) removed — fully v2;
    // worksheet-v2 owns grouping/collapse on those pages.
    view_3921: { exclusive: true },
  };

  // Views to SKIP — group-collapse will NOT enhance these views.
  // Proposal grids manage their own grouping UI via proposal-grid.js.
  const SKIP_VIEWS = new Set([
    'view_3301',
    'view_3341',
    'view_3371',
    'view_3550',
  ]);

  // ======================
  // STATE (localStorage)
  // ======================
  function storageKey(sceneId, viewId) {
    return `scw:collapse:${sceneId}:${viewId}`;
  }
  function loadState(sceneId, viewId) {
    if (!PERSIST_STATE) return {};
    try {
      return JSON.parse(localStorage.getItem(storageKey(sceneId, viewId)) || '{}');
    } catch {
      return {};
    }
  }
  function saveState(sceneId, viewId, state) {
    if (!PERSIST_STATE) return;
    try {
      localStorage.setItem(storageKey(sceneId, viewId), JSON.stringify(state));
    } catch {}
  }

  // L1 accent fallback used in CSS var() second arguments. The real
  // value comes from _design-tokens.js (--scw-grp-accent at :root, or
  // a per-view theme via [data-scw-l1-theme=...]). This literal is the
  // belt-and-suspenders default if the tokens file failed to load.
  var DEFAULT_L1_ACCENT = '#ed8326';

  // SVG chevron icon matching the KTL accordion language
  var CHEVRON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 12 15 18 9"/></svg>';

  // ======================
  // CSS (ONCE, SCENE-SCOPED)
  // ======================
  function injectCssOnce() {
    const id = 'scw-group-collapse-css';
    if (document.getElementById(id)) return;

    // Helper: simple descendant selector (no longer scene-scoped — works everywhere)
    const s = (sel) => sel;

    const css = `
      /* Vertical-align all table cells in group-collapse scenes */
      ${s('.scw-group-collapse-enabled table td')} {
        vertical-align: middle !important;
      }

      /* Override Knack's per-level indent on data-row cells (hierarchy is
         already communicated by the styled group headers). */
      ${s('.scw-group-collapse-enabled table tbody tr:not(.kn-table-group) td[style*="padding-left"]')} {
        padding-left: 8px !important;
      }

      ${s('.scw-group-collapse-enabled tr.scw-group-header')} {
        cursor: pointer;
        user-select: none;
      }

      /* ── Collapse icon (SVG chevron) ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-collapse-icon')} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        margin-right: 8px;
        line-height: 1;
        vertical-align: middle;
        border-radius: 4px;
        transition: transform 220ms ease, background 150ms ease;
        transform: rotate(0deg);
        flex-shrink: 0;
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-collapse-icon svg')} {
        display: block;
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header.scw-collapsed .scw-collapse-icon')} {
        transform: rotate(-90deg);
      }

      /* ── L1 chevron colour — neutral slate, no per-view accent ── */
      ${s('.scw-group-collapse-enabled tr.kn-group-level-1.scw-group-header .scw-collapse-icon')} {
        color: #475569;
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-1.scw-group-header:hover .scw-collapse-icon')} {
        background: rgba(71, 85, 105, 0.10);
      }

      /* ── L2 chevron colours ── */
      ${s('.scw-group-collapse-enabled tr.kn-group-level-2.scw-group-header .scw-collapse-icon')} {
        color: #07467c;
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-2.scw-group-header:hover .scw-collapse-icon')} {
        background: rgba(7,70,124,0.08);
      }

      ${s('.scw-group-collapse-enabled tr.scw-group-header > td')} {
        position: relative;
      }
      /* Flex layout lives on an inner wrapper so the TD keeps
         display:table-cell and respects its colspan. */
      ${s('.scw-group-collapse-enabled tr.scw-group-header > td > .scw-group-inner')} {
        display: flex;
        align-items: center;
      }

      /* ══════════════════════════════════════════════════
         L1 — Bid-review aesthetic: flat slate-100 background,
         per-view accent expressed only through the left border,
         chevron, and count pill. No tinted-fill ramping on
         expand/collapse — multiple stacked L1s don't wash the
         page in accent color, and themed L1s (orange/slate/navy)
         differ only in the accent line, not the entire fill.
         ══════════════════════════════════════════════════ */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header')} {
        font-size: 13px;
        font-weight: 700 !important;
        background: #f1f5f9 !important;
        color: #334155 !important;
        text-align: left !important;
        transition: background 150ms ease;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td')},
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td *')} {
        color: #334155 !important;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td')} {
        padding: 10px 12px !important;
        border-bottom: 1px solid #cbd5e1;
      }

      /* L1 hover — slightly darker slate, no accent wash */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:hover')} {
        background: #e8edf3 !important;
        filter: none;
      }

      /* L1 collapsed/expanded — same chrome. Bid-review's calm
         aesthetic doesn't change size or fill on toggle; the
         chevron rotation alone signals state. */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed > td')} {
        border-bottom: 1px solid #cbd5e1;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) > td')} {
        border-bottom: 1px solid #cbd5e1;
        box-shadow: none;
      }

      /* Vertical separation between stacked L1 rows */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header + .kn-table-group.kn-group-level-1.scw-group-header > td')} {
        border-top: 3px solid #fff;
      }

      /* ══════════════════════════════════════════════════
         L2 — Refined nested subgroup
         ══════════════════════════════════════════════════ */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header')} {
        font-size: 13px;
        font-weight: 500 !important;
        background-color: #f8fafc !important;
        color: #0f4c75 !important;
        transition: background 180ms ease;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td')} {
        padding: 8px 14px 8px 32px !important;
        border-bottom: 1px solid rgba(7,70,124,.10);
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td:after')} {
        content: "";
        position: absolute;
        left: 16px;
        top: 7px;
        bottom: 7px;
        width: 3px;
        border-radius: 2px;
        background: rgba(7,70,124,.22);
        pointer-events: none;
        transition: background 180ms ease;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td')},
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td *')} {
        color: #0f4c75 !important;
      }

      /* L2 hover */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:hover')} {
        background-color: #f1f5f9 !important;
        filter: none;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:hover > td:after')} {
        background: rgba(7,70,124,.35);
      }

      /* L2 collapsed */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed > td')} {
        border-bottom: 1px solid rgba(7,70,124,.06);
      }

      /* L2 expanded */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:not(.scw-collapsed)')} {
        background-color: #f1f5f9 !important;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:not(.scw-collapsed) > td')} {
        padding: 9px 14px 9px 32px !important;
        box-shadow: inset 0 -1px 2px rgba(7,70,124,.04);
        border-bottom: 1px solid rgba(7,70,124,.10);
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:not(.scw-collapsed) > td:after')} {
        background: rgba(7,70,124,.35);
      }

      /* Vertical separation between stacked L2 rows */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header + .kn-table-group.kn-group-level-2.scw-group-header > td')} {
        border-top: 2px solid #fff;
      }

      /* ── Badge wrapper (right-aligned) ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-group-badges')} {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      /* ── Warning count badge ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-warning-count')} {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 8px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
        border-radius: 10px;
        background: rgba(220, 38, 38, 0.12);
        color: #dc2626;
        border: 1px solid rgba(220, 38, 38, 0.22);
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-warning-count svg')} {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }

      /* ── Record count badge ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-record-count')} {
        display: inline-block;
        padding: 1px 8px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
        border-radius: 10px;
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-1.scw-group-header .scw-record-count')} {
        background: rgba(71, 85, 105, 0.10);
        color: #475569;
        border: 1px solid rgba(71, 85, 105, 0.20);
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-2.scw-group-header .scw-record-count')} {
        background: rgba(7,70,124,.08);
        color: #0f4c75;
        border: 1px solid rgba(7,70,124,.15);
      }

      /* Per-view L1 accent variation is handled by the token system —
         see VIEW_OVERRIDES below + _design-tokens.js. The 9-rule
         coupling that used to live here is gone. */
    `;

    const style = document.createElement('style');
    style.id = id;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ======================
  // GROUP ROW HELPERS
  // ======================
  const GROUP_ROW_SEL =
    'tr.kn-table-group.kn-group-level-1, tr.kn-table-group.kn-group-level-2';

  function getGroupLevel($tr) {
    return $tr.hasClass('kn-group-level-2') ? 2 : 1;
  }

  function ensureInnerWrap($tr) {
    const $cell = $tr.children('td,th').first();
    if (!$cell.children('.scw-group-inner').length) {
      $cell.wrapInner('<div class="scw-group-inner"></div>');
    }
    // Strip Knack's inline padding-left so our CSS rules control it
    $cell[0] && $cell[0].style.removeProperty('padding-left');
    // Fix colspan="0" — HTML5 treats 0 as 1, breaking full-row span.
    // Recalculate from thead every time since Knack may re-render rows.
    var table = $tr.closest('table')[0];
    if (table) {
      var headerRow = table.querySelector('thead tr');
      if (headerRow) {
        var colCount = 0;
        var hCells = headerRow.children;
        for (var i = 0; i < hCells.length; i++) {
          colCount += parseInt(hCells[i].getAttribute('colspan') || '1', 10);
        }
        var cur = parseInt($cell.attr('colspan') || '1', 10);
        if (colCount > 0 && cur < colCount) {
          $cell.attr('colspan', colCount);
        }
      }
    }
  }

  function ensureIcon($tr) {
    const $cell = $tr.children('td,th').first();
    var $inner = $cell.children('.scw-group-inner');
    var $target = $inner.length ? $inner : $cell;
    if (!$target.find('.scw-collapse-icon').length) {
      $target.prepend('<span class="scw-collapse-icon" aria-hidden="true">' + CHEVRON_SVG + '</span>');
    }
  }

  var WARNING_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  function ensureBadges($tr, viewId) {
    const $cell = $tr.children('td,th').first();

    const $block = rowsUntilNextRelevantGroup($tr);
    // For worksheet views, count only scw-ws-row to avoid double-counting
    const $wsRows = $block.filter('tr.scw-ws-row');

    // Record count is opt-in per view (RECORD_COUNT_VIEWS). The warning
    // rollup, by contrast, runs on EVERY worksheet view (any group with
    // scw-ws-row children) so MDF/IDF group headers summarise issues
    // everywhere worksheet cards render — not just the count-enabled
    // views. Non-worksheet grids not opted into counts bail early.
    var showCount = RECORD_COUNT_VIEWS.indexOf(viewId) !== -1;
    if (!showCount && !$wsRows.length) return;

    const count = !showCount ? 0 : ($wsRows.length
      ? $wsRows.length
      : $block.not('.kn-table-group, .kn-table-totals, .scw-inline-photo-row, .scw-synth-divider').length);

    // Roll up per-record warnings within this group and break them down by
    // type so the badge tooltip says WHAT needs attention, not just how many.
    // Sources: the shared warn-slot chits (.scw-cr-hdr-warning, tagged with
    // data-scw-warn-type by device-worksheet) and the field_2454 photo
    // warning chit (.scw-ws-warn-chit--active → type "photos"). warnCount is
    // distinct flagged rows; warnTally counts rows per type (a row with two
    // warning types contributes to both).
    var warnCount = 0;
    var warnTally = {};
    var warnOrder = [];
    function bumpTally(type) {
      if (warnTally[type] === undefined) { warnTally[type] = 0; warnOrder.push(type); }
      warnTally[type]++;
    }
    $wsRows.each(function () {
      var types = {};
      var hdrs = this.querySelectorAll('.scw-cr-hdr-warning');
      for (var hi = 0; hi < hdrs.length; hi++) {
        types[hdrs[hi].getAttribute('data-scw-warn-type') || 'other'] = true;
      }
      if (this.querySelector('.scw-ws-warn-chit--active')) types.photos = true;
      var keys = Object.keys(types);
      if (!keys.length) return;
      warnCount++;
      for (var ki = 0; ki < keys.length; ki++) bumpTally(keys[ki]);
    });

    // Build the breakdown signature so we can skip redundant DOM writes.
    var warnSig = warnOrder.map(function (t) { return t + ':' + warnTally[t]; }).join(',');

    // Skip DOM update if badges already show the correct values
    const $wrapper = $cell.find('.scw-group-badges');
    if ($wrapper.length) {
      var existingCount = $wrapper.find('.scw-record-count').text();
      var existingWarn = $wrapper.find('.scw-warning-count').attr('data-sig') || '';
      if (existingCount === String(count) && existingWarn === warnSig) return;
    }

    $wrapper.remove();

    if (count > 0 || warnCount > 0) {
      var html = '<span class="scw-group-badges">';
      if (warnCount > 0) {
        html += '<span class="scw-warning-count" data-count="' + warnCount +
          '" data-sig="' + warnSig + '" title="' + escAttr(buildWarnTitle(warnCount, warnOrder, warnTally)) +
          '">' + WARNING_SVG + warnCount + '</span>';
      }
      if (count > 0) {
        html += '<span class="scw-record-count">' + count + '</span>';
      }
      html += '</span>';
      var $inner = $cell.children('.scw-group-inner');
      ($inner.length ? $inner : $cell).append(html);
    }
  }

  // type → [singular, plural] phrasing for the warning rollup tooltip.
  var WARN_LABELS = {
    discontinued: ['discontinued product', 'discontinued products'],
    accessory:    ['accessory mismatch', 'accessory mismatches'],
    photos:       ['item missing required photos', 'items missing required photos'],
    other:        ['other warning', 'other warnings']
  };

  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // "3 line items need attention in this group:\n• 2 discontinued products\n• 1 accessory mismatch"
  function buildWarnTitle(total, order, tally) {
    var lines = [
      total + ' line item' + (total > 1 ? 's' : '') + ' need' + (total > 1 ? '' : 's') +
        ' attention in this group:'
    ];
    for (var i = 0; i < order.length; i++) {
      var t = order[i];
      var n = tally[t];
      var phrase = WARN_LABELS[t] || [t, t];
      lines.push('• ' + n + ' ' + (n > 1 ? phrase[1] : phrase[0]));
    }
    return lines.join('\n');
  }

  function getRowLabelText($tr) {
    return $tr
      .clone()
      .find('.scw-collapse-icon, .scw-group-badges')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getParentLevel1Label($tr) {
    const $l1 = $tr.prevAll('tr.kn-table-group.kn-group-level-1').first();
    return $l1.length ? getRowLabelText($l1) : '';
  }

  function buildKey($tr, level) {
    const label = getRowLabelText($tr);
    if (level === 2) {
      const parent = getParentLevel1Label($tr);
      return `L2:${parent}::${label}`;
    }
    return `L1:${label}`;
  }

  function rowsUntilNextRelevantGroup($headerRow) {
    const isLevel2 = $headerRow.hasClass('kn-group-level-2');
    let $rows = $();

    $headerRow.nextAll('tr').each(function () {
      const $tr = $(this);

      if (isLevel2) {
        if ($tr.hasClass('kn-table-group')) return false;
        $rows = $rows.add($tr);
        return;
      }

      if ($tr.hasClass('kn-group-level-1')) return false;
      $rows = $rows.add($tr);
    });

    return $rows;
  }

  function restoreLevel2StatesUnderLevel1($level1Header) {
    rowsUntilNextRelevantGroup($level1Header)
      .filter('tr.kn-table-group.kn-group-level-2.scw-group-header')
      .each(function () {
        const $l2 = $(this);
        const collapsed = $l2.hasClass('scw-collapsed');
        rowsUntilNextRelevantGroup($l2).toggle(!collapsed);
      });
  }

  // NEW: when collapsing L1, force-collapse all child L2 headers and persist
  function collapseAllLevel2UnderLevel1($level1Header, sceneId, viewId, state) {
    rowsUntilNextRelevantGroup($level1Header)
      .filter('tr.kn-table-group.kn-group-level-2.scw-group-header')
      .each(function () {
        const $l2 = $(this);

        // force state + class (chevron rotation handled by CSS)
        $l2.addClass('scw-collapsed');

        // hide its detail rows (even though L1 is hiding everything, this keeps it consistent)
        rowsUntilNextRelevantGroup($l2).hide();

        // persist
        const key = buildKey($l2, 2);
        state[key] = 1;
      });
  }

  function setCollapsed($header, collapsed) {
    const isLevel2 = $header.hasClass('kn-group-level-2');

    $header.toggleClass('scw-collapsed', collapsed);
    // Chevron rotation is handled entirely by CSS (rotate -90deg when .scw-collapsed)

    if (isLevel2) {
      rowsUntilNextRelevantGroup($header).toggle(!collapsed);
      return;
    }

    rowsUntilNextRelevantGroup($header).toggle(!collapsed);

    if (!collapsed) restoreLevel2StatesUnderLevel1($header);
  }

  // ======================
  // SCENE DETECTION
  // ======================
  function getCurrentSceneId() {
    const bodyId = $('body').attr('id');
    if (bodyId && bodyId.includes('scene_')) {
      const m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    const $fallback = $('[id*="scene_"]').filter(':visible').first();
    if ($fallback.length) {
      const m = ($fallback.attr('id') || '').match(/scene_\d+/);
      if (m) return m[0];
    }
    return null;
  }

  var DISABLED_SCENES = { scene_828: true, scene_833: true, scene_873: true };

  function isEnabledScene(sceneId) {
    return !!sceneId && !DISABLED_SCENES[sceneId];
  }

  // ======================
  // ENHANCE GRIDS
  // ======================

  // Track views whose stale localStorage has been cleared this session.
  // Cleared once per page load so below-threshold views always start open,
  // but manual collapses during the session are still persisted and respected.
  const thresholdCleared = new Set();

  function enhanceAllGroupedGrids(sceneId) {
    if (!isEnabledScene(sceneId)) return;

    const $sceneRoot = $(`#kn-${sceneId}`);
    if (!$sceneRoot.length) return;

    _lastEnhanceAt = Date.now();

    const cfg = SCENE_OVERRIDES[sceneId] || {};
    const threshold = cfg.openIfFewerThan || DEFAULT_THRESHOLD;
    const viewRecordCounts = {};

    $sceneRoot.find(GROUP_ROW_SEL).each(function () {
      const $tr = $(this);
      const $view = $tr.closest('.kn-view[id^="view_"]');
      const viewId = $view.attr('id') || 'unknown_view';

      if (SKIP_VIEWS.has(viewId)) return;

      $view.addClass('scw-group-collapse-enabled');

      // Apply the named L1 theme to the view container, if any. CSS
      // selectors on [data-scw-l1-theme="..."] in _design-tokens.js
      // shadow --scw-grp-accent and --scw-grp-accent-rgb within this
      // subtree, which retones the entire L1 system (background,
      // border, hover, chevron, bridge, badge) — no per-row JS needed.
      var viewCfg = VIEW_OVERRIDES[viewId];
      if (viewCfg && viewCfg.theme) {
        if ($view.attr('data-scw-l1-theme') !== viewCfg.theme) {
          $view.attr('data-scw-l1-theme', viewCfg.theme);
        }
      } else if ($view.attr('data-scw-l1-theme')) {
        $view.removeAttr('data-scw-l1-theme');
      }

      // Cache record count per view (count once, exclude group headers and totals)
      if (!(viewId in viewRecordCounts)) {
        var allTr = $view.find('table tbody tr').length;
        var groupTr = $view.find('table tbody tr.kn-table-group').length;
        var totalsTr = $view.find('table tbody tr.kn-table-totals').length;
        viewRecordCounts[viewId] = allTr - groupTr - totalsTr;
      }

      // Exclusive accordions manage open/close purely through persisted
      // state + single-open enforcement. The "below-threshold → default
      // open" behaviour fights that: it force-opens every group, the
      // accordion then collapses all but the first, and the stale-state
      // clear below wipes the user's saved choice — so on refresh the
      // view always snaps back to "first group open". Treat exclusive
      // views as never-below-threshold so neither the clear nor the
      // default-open path runs for them; their state survives refresh.
      var isExclusiveView = !!(VIEW_OVERRIDES[viewId] && VIEW_OVERRIDES[viewId].exclusive);
      const belowThreshold = !isExclusiveView && threshold > 0 && viewRecordCounts[viewId] < threshold;

      // On first encounter this session, clear stale localStorage for
      // below-threshold or defaultOpen views so the "default open" behaviour takes effect.
      var viewOverrides = VIEW_OVERRIDES[viewId];
      var viewDefaultOpen = viewOverrides && viewOverrides.defaultOpen;
      if ((belowThreshold || viewDefaultOpen) && !thresholdCleared.has(viewId)) {
        thresholdCleared.add(viewId);
        try { localStorage.removeItem(storageKey(sceneId, viewId)); } catch (e) {}
      }

      const state = loadState(sceneId, viewId);

      $tr.addClass('scw-group-header');
      ensureInnerWrap($tr);
      ensureIcon($tr);

      const level = getGroupLevel($tr);

      // L1 accent variables come from the cascade — :root default in
      // _design-tokens.js, optionally shadowed by data-scw-l1-theme
      // on the view container (set above). No per-row inline styles.

      ensureBadges($tr, viewId);

      const key = buildKey($tr, level);
      var viewOverrides = VIEW_OVERRIDES[viewId];
      var viewDefaultOpen = viewOverrides && viewOverrides.defaultOpen;
      const shouldCollapse = key in state ? !!state[key] : ((belowThreshold || viewDefaultOpen) ? false : COLLAPSED_BY_DEFAULT);

      setCollapsed($tr, shouldCollapse);
    });

    // Exclusive-accordion enforcement: for views flagged exclusive,
    // guarantee exactly one L1 group is open after enhance runs.
    //  - >1 open: collapse the extras (handles stale localStorage from
    //    before the flag was introduced, or multi-open left by other
    //    code paths).
    //  - 0 open: open the first L1. Since the main loop above already
    //    honours persisted state per-key, a returning user's last-opened
    //    L1 is already open here; this branch only fires on a fresh
    //    visit (no saved state) or after a user explicitly collapsed
    //    everything.
    Object.keys(viewRecordCounts).forEach(function (vid) {
      var vo = VIEW_OVERRIDES[vid];
      if (!vo || !vo.exclusive) return;
      var $view = $('#' + vid);
      if (!$view.length) return;
      var $allL1 = $view.find(
        'tr.kn-table-group.kn-group-level-1.scw-group-header'
      );
      if (!$allL1.length) return;
      var $openL1 = $allL1.not('.scw-collapsed');
      var state = loadState(sceneId, vid);
      if ($openL1.length === 0) {
        // Views flagged startAllCollapsed skip the auto-open-first
        // behaviour — they intentionally land with every L1 collapsed
        // until the user picks one.
        if (vo.startAllCollapsed) return;
        var $first = $allL1.first();
        setCollapsed($first, false);
        state[buildKey($first, 1)] = 0;
        saveState(sceneId, vid, state);
      } else if ($openL1.length > 1) {
        $openL1.slice(1).each(function () {
          var $other = $(this);
          setCollapsed($other, true);
          state[buildKey($other, 1)] = 1;
        });
        saveState(sceneId, vid, state);
      }
    });
  }

  // Exclusive-accordion: close every other L1 header in the same view
  // when one opens. Called from the click handler.
  function closeOtherL1sInView($openedHeader, $view, sceneId, viewId, state) {
    var $others = $view.find(
      'tr.kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed)'
    );
    $others.each(function () {
      if (this === $openedHeader[0]) return;
      var $o = $(this);
      setCollapsed($o, true);
      state[buildKey($o, 1)] = 1;
    });
  }

  // ======================
  // CLICK HANDLER
  // ======================
  function bindClicksOnce() {
    $(document)
      .off('click' + EVENT_NS, GROUP_ROW_SEL)
      .on('click' + EVENT_NS, GROUP_ROW_SEL, function (e) {
        if ($(e.target).closest('a,button,input,select,textarea,label').length) return;

        const sceneId = getCurrentSceneId();
        if (!isEnabledScene(sceneId)) return;

        const $tr = $(this);
        if (!$tr.closest(`#kn-${sceneId}`).length) return;

        const $view = $tr.closest('.kn-view[id^="view_"]');
        const viewId = $view.attr('id') || 'unknown_view';

        if (SKIP_VIEWS.has(viewId)) return;

        $view.addClass('scw-group-collapse-enabled');

        $tr.addClass('scw-group-header');
        ensureInnerWrap($tr);
        ensureIcon($tr);

        const level = getGroupLevel($tr);
        const key = buildKey($tr, level);

        const state = loadState(sceneId, viewId);
        const collapseNow = !$tr.hasClass('scw-collapsed');

        // apply collapse/expand
        setCollapsed($tr, collapseNow);

        // NEW: if this was an L1 collapse, also collapse all nested L2 groups + persist
        if (level === 1 && collapseNow) {
          collapseAllLevel2UnderLevel1($tr, sceneId, viewId, state);
        }

        state[key] = collapseNow ? 1 : 0;

        // Exclusive accordion: opening an L1 group closes every other
        // L1 in the view. Only runs on expand (collapseNow === false).
        var viewOverrides = VIEW_OVERRIDES[viewId];
        if (!collapseNow && level === 1 && viewOverrides && viewOverrides.exclusive) {
          closeOtherL1sInView($tr, $view, sceneId, viewId, state);
        }

        saveState(sceneId, viewId, state);
      });
  }

  // ======================
  // MUTATION OBSERVER
  // ======================
  const observerByScene = {};

  function startObserverForScene(sceneId) {
    if (!isEnabledScene(sceneId) || observerByScene[sceneId]) return;

    let debounceTimer = 0;
    const obs = new MutationObserver(() => {
      // Skip during coordinated post-edit restoration (coordinator
      // calls enhance() explicitly at the right time).
      if (_suppressAutoEnhance) return;
      // Skip while any device-worksheet transformView is mid-pass —
      // its mutations would re-fire this observer on top of the
      // inline enhance() call transformView already makes.
      if (window.SCW && window.SCW.deviceWorksheet &&
          window.SCW.deviceWorksheet.isAnyTransforming &&
          window.SCW.deviceWorksheet.isAnyTransforming()) return;

      const current = getCurrentSceneId();
      if (!isEnabledScene(current)) return;
      if (current !== sceneId) return;

      // Use 100ms debounce (not RAF ~16ms) so Knack's multi-step
      // async DOM updates settle before we try to enhance.  RAF was
      // too eager and could fire between batched row insertions.
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = 0;
        // Skip redundant passes during a fresh enhance window (intermediate
        // DOM states during transformView etc.). A later mutation outside
        // the window still re-enhances.
        if (recentlyEnhanced()) return;
        enhanceAllGroupedGrids(sceneId);
      }, 100);
    });

    // Scope observer to the scene container instead of document.body.
    // This avoids firing on DOM mutations in other scenes / unrelated UI.
    var sceneRoot = document.getElementById('kn-' + sceneId);
    obs.observe(sceneRoot || document.body, { childList: true, subtree: true });
    observerByScene[sceneId] = obs;
  }

  // ======================
  // INIT
  // ======================
  injectCssOnce();
  bindClicksOnce();

  // Bind to ALL scene renders so every scene gets accordions
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      var sceneId = getCurrentSceneId();
      if (isEnabledScene(sceneId)) {
        enhanceAllGroupedGrids(sceneId);
        startObserverForScene(sceneId);
      }
    });

  // Re-enhance after ANY view re-render (e.g. after inline-edit refresh).
  // The MutationObserver alone is unreliable because Knack's async
  // re-render can cause it to fire at intermediate DOM states.
  // Delay 200ms so device-worksheet's transformView (150ms) runs first.
  var viewRenderTimer = 0;
  $(document)
    .off('knack-view-render' + EVENT_NS)
    .on('knack-view-render' + EVENT_NS, function () {
      // Skip during coordinated post-edit restoration
      if (_suppressAutoEnhance) return;
      var sceneId = getCurrentSceneId();
      if (!isEnabledScene(sceneId)) return;
      if (viewRenderTimer) clearTimeout(viewRenderTimer);
      viewRenderTimer = setTimeout(function () {
        viewRenderTimer = 0;
        // Skip if an enhance pass already ran (e.g. device-worksheet's
        // transformView called enhance() inline) — avoids a second full
        // accordion rebuild on every inline edit.
        if (recentlyEnhanced()) return;
        // Also skip if any transformView is still mid-pass — the
        // inline enhance() at the end of transformView will cover it.
        if (window.SCW && window.SCW.deviceWorksheet &&
            window.SCW.deviceWorksheet.isAnyTransforming &&
            window.SCW.deviceWorksheet.isAnyTransforming()) return;
        enhanceAllGroupedGrids(sceneId);
      }, 200);
    });

  const initialScene = getCurrentSceneId();
  if (isEnabledScene(initialScene)) {
    enhanceAllGroupedGrids(initialScene);
    startObserverForScene(initialScene);
  }

  // ── Expose API for coordination with post-edit restore ──
  window.SCW = window.SCW || {};
  window.SCW.groupCollapse = {
    /** Run enhancement pass for current scene (idempotent — safe to call
     *  multiple times; existing chevrons/state are preserved). */
    enhance: function () {
      var sceneId = getCurrentSceneId();
      if (isEnabledScene(sceneId)) {
        enhanceAllGroupedGrids(sceneId);
      }
    },
    /** Suppress/resume automatic enhancement from MutationObserver and
     *  knack-view-render timer.  Used by the post-edit coordinator to
     *  prevent premature enhancement on intermediate DOM states. */
    suppress: function (val) { _suppressAutoEnhance = !!val; },
    /** True if an enhance pass ran within the coalesce window — lets the
     *  post-edit coordinator skip its own redundant enhance() call. */
    recentlyEnhanced: recentlyEnhanced
  };
})();
/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
