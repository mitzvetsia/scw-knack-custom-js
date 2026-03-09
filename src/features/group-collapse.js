/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **********************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  // Per-scene config. openIfFewerThan = record threshold below which groups
  // default to OPEN instead of collapsed. Set to 0 to always collapse.
  const SCENE_CONFIG = {
    scene_1085: { openIfFewerThan: 30 },
    scene_1116: { openIfFewerThan: 30 },
    scene_1140: { openIfFewerThan: 30 },
  };
  const SCENE_IDS = Object.keys(SCENE_CONFIG);
  const EVENT_NS = '.scwGroupCollapse';

  const COLLAPSED_BY_DEFAULT = true;
  const PERSIST_STATE = true;

  // Record count badge: off by default, list view IDs to enable
  const RECORD_COUNT_VIEWS = ['view_3359'];

  // Per-view background color overrides (keys = view IDs)
  const VIEW_OVERRIDES = {
    view_3374: { L1bg: '#124E85' },
    view_3325: { L1bg: '#124E85' },
    view_3331: { L1bg: '#124E85' },
    view_3475: { L1bg: '#5F6B7A' },

  };

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

    // Helper: expand a descendant selector for every configured scene so that
    // comma-separated CSS selectors scope correctly to each scene root.
    const s = (sel) =>
      SCENE_IDS.map((id) => `#kn-${id} ${sel}`).join(',\n      ');

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

      /* L1 expanded — slightly stronger tint */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed)')} {
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.12) !important;
        font-size: 13px;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) > td')} {
        padding: 11px 14px !important;
        box-shadow: inset 0 -1px 3px rgba(0,0,0,.04);
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

      /* ── Record count badge ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-record-count')} {
        display: inline-block;
        margin-left: .6em;
        padding: 1px 8px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
        border-radius: 10px;
        vertical-align: middle;
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

  function ensureIcon($tr) {
    const $cell = $tr.children('td,th').first();
    if (!$cell.find('.scw-collapse-icon').length) {
      $cell.prepend('<span class="scw-collapse-icon" aria-hidden="true">' + CHEVRON_SVG + '</span>');
    }
  }

  function ensureRecordCount($tr, viewId) {
    if (!RECORD_COUNT_VIEWS.length) return;
    if (!RECORD_COUNT_VIEWS.includes(viewId)) return;
    const $cell = $tr.children('td,th').first();

    const $block = rowsUntilNextRelevantGroup($tr);
    const count = $block.not('.kn-table-group, .kn-table-totals').length;

    // Skip DOM update if badge already shows the correct count (avoids MutationObserver loop)
    const $existing = $cell.find('.scw-record-count');
    if ($existing.length && $existing.text() === String(count)) return;

    $existing.remove();
    if (count > 0) {
      $cell.append('<span class="scw-record-count">' + count + '</span>');
    }
  }

  function getRowLabelText($tr) {
    return $tr
      .clone()
      .find('.scw-collapse-icon, .scw-record-count')
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

  function isEnabledScene(sceneId) {
    return !!sceneId && SCENE_IDS.includes(sceneId);
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

    const cfg = SCENE_CONFIG[sceneId] || {};
    const threshold = cfg.openIfFewerThan || 0;
    const viewRecordCounts = {};

    $sceneRoot.find(GROUP_ROW_SEL).each(function () {
      const $tr = $(this);
      const $view = $tr.closest('.kn-view[id^="view_"]');
      const viewId = $view.attr('id') || 'unknown_view';

      $view.addClass('scw-group-collapse-enabled');

      // Cache record count per view (count once, exclude group headers and totals)
      if (!(viewId in viewRecordCounts)) {
        var allTr = $view.find('table tbody tr').length;
        var groupTr = $view.find('table tbody tr.kn-table-group').length;
        var totalsTr = $view.find('table tbody tr.kn-table-totals').length;
        viewRecordCounts[viewId] = allTr - groupTr - totalsTr;
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

      ensureRecordCount($tr, viewId);

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

        $view.addClass('scw-group-collapse-enabled');

        $tr.addClass('scw-group-header');
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

    let raf = 0;
    const obs = new MutationObserver(() => {
      const current = getCurrentSceneId();
      if (!isEnabledScene(current)) return;
      if (current !== sceneId) return;

      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => enhanceAllGroupedGrids(sceneId));
    });

    obs.observe(document.body, { childList: true, subtree: true });
    observerByScene[sceneId] = obs;
  }

  // ======================
  // INIT
  // ======================
  injectCssOnce();
  bindClicksOnce();

  SCENE_IDS.forEach((sceneId) => {
    $(document)
      .off(`knack-scene-render.${sceneId}${EVENT_NS}`)
      .on(`knack-scene-render.${sceneId}${EVENT_NS}`, function () {
        enhanceAllGroupedGrids(sceneId);
        startObserverForScene(sceneId);
      });
  });

  const initialScene = getCurrentSceneId();
  if (isEnabledScene(initialScene)) {
    enhanceAllGroupedGrids(initialScene);
    startObserverForScene(initialScene);
  }
})();
/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
