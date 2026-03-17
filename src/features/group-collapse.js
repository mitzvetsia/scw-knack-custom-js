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

  // Record count badge: list view IDs to enable
  const RECORD_COUNT_VIEWS = ['view_3359', 'view_3313', 'view_3505', 'view_3332'];

  // Per-view background color overrides (keys = view IDs)
  const VIEW_OVERRIDES = {
    view_3374: { L1bg: '#124E85' },
    view_3325: { L1bg: '#124E85' },
    view_3331: { L1bg: '#124E85' },
    view_3475: { L1bg: '#5F6B7A' },

  };

  // Views to SKIP — group-collapse will NOT enhance these views.
  // Proposal grids manage their own grouping UI via proposal-grid.js.
  const SKIP_VIEWS = new Set([
    'view_3301',
    'view_3341',
    'view_3371',
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

  // ======================
  // COLOR HELPERS
  // ======================
  /** Convert a hex colour string to [r, g, b]. */
  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    // Handle rgba(r,g,b,a) format
    var rgbaMatch = hex.match && hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbaMatch) return [+rgbaMatch[1], +rgbaMatch[2], +rgbaMatch[3]];
    var n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Default L1 accent colour (orange)
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

      /* ── L1 chevron colours ── */
      ${s('.scw-group-collapse-enabled tr.kn-group-level-1.scw-group-header .scw-collapse-icon')} {
        color: var(--scw-grp-accent, ${DEFAULT_L1_ACCENT});
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-1.scw-group-header:hover .scw-collapse-icon')} {
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.10);
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
         L1 — Modern tinted accent style
         Uses CSS custom properties set per-row in JS:
           --scw-grp-accent      (hex colour)
           --scw-grp-accent-rgb  (r, g, b)
         ══════════════════════════════════════════════════ */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header')} {
        font-size: 13px;
        font-weight: 600 !important;
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.08) !important;
        color: #1e293b !important;
        text-align: left !important;
        transition: background 180ms ease;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td')},
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td *')} {
        color: #1e293b !important;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td')} {
        padding: 10px 14px !important;
        border-bottom: 1px solid rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.15);
        border-left: 4px solid var(--scw-grp-accent, ${DEFAULT_L1_ACCENT});
      }

      /* L1 hover */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:hover')} {
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.13) !important;
        filter: none;
      }

      /* L1 collapsed */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed')} {
        font-size: 13px;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed > td')} {
        border-bottom: 1px solid rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.10);
      }

      /* L1 expanded — stronger tint, larger text, no bottom border
         (content flows directly beneath) */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed)')} {
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.15) !important;
        font-size: 14px;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) > td')} {
        padding: 12px 14px !important;
        border-bottom: none;
        box-shadow: none;
      }

      /* ── Bridge: content rows beneath an expanded L1 ──
         Continue the left accent border on the first content row
         so the header and content feel like one unit.
         Also replace the worksheet card's grey border-top with accent. */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) + tr:not(.kn-table-group) > td')} {
        border-left: 4px solid rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.30);
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) + tr:not(.kn-table-group) .scw-ws-card')} {
        border-top-color: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.25);
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
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.14);
        color: var(--scw-grp-accent, ${DEFAULT_L1_ACCENT});
        border: 1px solid rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.22);
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-2.scw-group-header .scw-record-count')} {
        background: rgba(7,70,124,.08);
        color: #0f4c75;
        border: 1px solid rgba(7,70,124,.15);
      }

      /* ── Per-view accent overrides via CSS custom properties ──
         (Set inline on each L1 tr in JS; static overrides kept for
          view-scoped CSS specificity as a fallback.) */
      ${Object.entries(VIEW_OVERRIDES).map(([viewId, o]) => {
        var parts = [];
        if (o.L1bg) {
          var rgb = hexToRgb(o.L1bg);
          parts.push(
            '#' + viewId + ' .kn-table-group.kn-group-level-1.scw-group-header {' +
            ' --scw-grp-accent: ' + o.L1bg + ';' +
            ' --scw-grp-accent-rgb: ' + rgb.join(',') + '; }'
          );
        }
        if (o.L2bg) {
          parts.push('#' + viewId + ' .kn-table-group.kn-group-level-2.scw-group-header { background-color: ' + o.L2bg + ' !important; }');
        }
        if (o.L2color) {
          parts.push(
            '#' + viewId + ' .kn-table-group.kn-group-level-2.scw-group-header > td,' +
            '#' + viewId + ' .kn-table-group.kn-group-level-2.scw-group-header > td * { color: ' + o.L2color + ' !important; }'
          );
        }
        return parts.length ? '/* Per-view overrides: ' + viewId + ' */\n' + parts.join('\n') : '';
      }).join('\n')}
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
    if (!RECORD_COUNT_VIEWS.length) return;
    if (!RECORD_COUNT_VIEWS.includes(viewId)) return;
    const $cell = $tr.children('td,th').first();

    const $block = rowsUntilNextRelevantGroup($tr);
    // For worksheet views, count only scw-ws-row to avoid double-counting
    const $wsRows = $block.filter('tr.scw-ws-row');
    const count = $wsRows.length
      ? $wsRows.length
      : $block.not('.kn-table-group, .kn-table-totals, .scw-inline-photo-row, .scw-synth-divider').length;

    // Count accessory mismatch warnings within this group's rows
    var warnCount = 0;
    if ($wsRows.length) {
      $wsRows.each(function () {
        if (this.querySelector('.scw-cr-hdr-warning')) warnCount++;
      });
    }

    // Skip DOM update if badges already show the correct values
    const $wrapper = $cell.find('.scw-group-badges');
    if ($wrapper.length) {
      var existingCount = $wrapper.find('.scw-record-count').text();
      var existingWarn = $wrapper.find('.scw-warning-count').attr('data-count') || '0';
      if (existingCount === String(count) && existingWarn === String(warnCount)) return;
    }

    $wrapper.remove();

    if (count > 0 || warnCount > 0) {
      var html = '<span class="scw-group-badges">';
      if (warnCount > 0) {
        html += '<span class="scw-warning-count" data-count="' + warnCount + '" title="' + warnCount + ' accessory mismatch warning' + (warnCount > 1 ? 's' : '') + '">' + WARNING_SVG + warnCount + '</span>';
      }
      if (count > 0) {
        html += '<span class="scw-record-count">' + count + '</span>';
      }
      html += '</span>';
      var $inner = $cell.children('.scw-group-inner');
      ($inner.length ? $inner : $cell).append(html);
    }
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

    const cfg = SCENE_OVERRIDES[sceneId] || {};
    const threshold = cfg.openIfFewerThan || DEFAULT_THRESHOLD;
    const viewRecordCounts = {};
    const viewColCounts = {};

    $sceneRoot.find(GROUP_ROW_SEL).each(function () {
      const $tr = $(this);
      const $view = $tr.closest('.kn-view[id^="view_"]');
      const viewId = $view.attr('id') || 'unknown_view';

      if (SKIP_VIEWS.has(viewId)) return;

      $view.addClass('scw-group-collapse-enabled');

      // Cache record count per view (count once, exclude group headers and totals)
      if (!(viewId in viewRecordCounts)) {
        var allTr = $view.find('table tbody tr').length;
        var groupTr = $view.find('table tbody tr.kn-table-group').length;
        var totalsTr = $view.find('table tbody tr.kn-table-totals').length;
        viewRecordCounts[viewId] = allTr - groupTr - totalsTr;
      }

      // Fix colspan="0" on group header TDs — HTML5 treats 0 as 1,
      // so group headers only span one column instead of the full table.
      // Calculate the real column count from thead and set it explicitly.
      if (!viewColCounts[viewId]) {
        var headerRow = $view.find('table thead tr')[0];
        if (headerRow) {
          var count = 0;
          var hCells = headerRow.children;
          for (var ci = 0; ci < hCells.length; ci++) {
            count += parseInt(hCells[ci].getAttribute('colspan') || '1', 10);
          }
          viewColCounts[viewId] = count;
        }
      }
      if (viewColCounts[viewId]) {
        var $td = $tr.children('td').first();
        var cur = parseInt($td.attr('colspan') || '1', 10);
        if (cur < viewColCounts[viewId]) {
          $td.attr('colspan', viewColCounts[viewId]);
        }
      }

      const belowThreshold = threshold > 0 && viewRecordCounts[viewId] < threshold;

      // On first encounter this session, clear stale localStorage for
      // below-threshold views so the "default open" behaviour takes effect.
      if (belowThreshold && !thresholdCleared.has(viewId)) {
        thresholdCleared.add(viewId);
        try { localStorage.removeItem(storageKey(sceneId, viewId)); } catch (e) {}
      }

      const state = loadState(sceneId, viewId);

      $tr.addClass('scw-group-header');
      ensureInnerWrap($tr);
      ensureIcon($tr);

      const level = getGroupLevel($tr);

      // Set CSS custom properties for L1 accent colour
      if (level === 1) {
        var overrides = VIEW_OVERRIDES[viewId];
        var accent = (overrides && overrides.L1bg) || DEFAULT_L1_ACCENT;
        var rgb = hexToRgb(accent);
        this.style.setProperty('--scw-grp-accent', accent);
        this.style.setProperty('--scw-grp-accent-rgb', rgb.join(','));
      }

      ensureBadges($tr, viewId);

      const key = buildKey($tr, level);
      const shouldCollapse = key in state ? !!state[key] : (belowThreshold ? false : COLLAPSED_BY_DEFAULT);

      setCollapsed($tr, shouldCollapse);
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

      const current = getCurrentSceneId();
      if (!isEnabledScene(current)) return;
      if (current !== sceneId) return;

      // Use 100ms debounce (not RAF ~16ms) so Knack's multi-step
      // async DOM updates settle before we try to enhance.  RAF was
      // too eager and could fire between batched row insertions.
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = 0;
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
    suppress: function (val) { _suppressAutoEnhance = !!val; }
  };
})();
/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
