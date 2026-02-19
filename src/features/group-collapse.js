/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
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
  // CSS (ONCE, SCENE-SCOPED)
  // ======================
  function injectCssOnce() {
    const id = 'scw-group-collapse-css';
    if (document.getElementById(id)) return;

    // Helper: expand a descendant selector for every configured scene so that
    // comma-separated CSS selectors scope correctly to each scene root.
    const s = (sel) =>
      SCENE_IDS.map((id) => `#kn-${id} ${sel}`).join(',\n      ');

    const L1 = {
      fontSize: '12px',
      fontWeight: '400',
      bg: '#1a5a8e',
      color: '#ffffff',
      tdPadding: '3px 5px',
      collapsedOpacity: '0.92',
      textalign: 'left',
    };

    const L2 = {
      fontSize: '14px',
      fontWeight: '400',
      bg: '#f3f8ff',
      color: '#07467c',
      tdPadding: '4px 14px 4px 26px',
      collapsedOpacity: '0.90',
    };

    const css = `
      /* Vertical-align all table cells in group-collapse scenes */
      ${s('table td')} {
        vertical-align: middle !important;
      }

      ${s('.scw-group-collapse-enabled tr.scw-group-header')} {
        cursor: pointer;
        user-select: none;
      }

      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-collapse-icon')} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.25em;
        height: 1.25em;
        margin-right: .5em;
        font-weight: 900;
        line-height: 1;
        vertical-align: middle;
        transform-origin: 50% 55%;
        transition: transform 160ms ease, opacity 160ms ease;
        opacity: .95;
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header.scw-collapsed .scw-collapse-icon')} {
        transform: rotate(0deg);
        opacity: .9;
      }

      ${s('.scw-group-collapse-enabled tr.scw-group-header > td')} {
        position: relative;
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header > td:before')} {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 6px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 160ms ease;
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header:hover > td:before')} {
        opacity: 1;
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header:focus-within > td:before')} {
        opacity: 1;
        outline: 2px solid rgba(7,70,124,.28);
        outline-offset: -2px;
      }

      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header')} {
        font-size: ${L1.fontSize};
        font-weight: ${L1.fontWeight} !important;
        background-color: ${L1.bg} !important;
        color: ${L1.color} !important;
        text-align: ${L1.textalign} !important;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td')} {
        padding: ${L1.tdPadding} !important;
        border-bottom: 1px solid rgba(255,255,255,.14);
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td:before')} {
        box-shadow: 0 1px 0 rgba(255,255,255,.10) inset, 0 1px 10px rgba(0,0,0,.10);
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed')} {
        opacity: ${L1.collapsedOpacity};
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td')},
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td *')} {
        color: ${L1.color} !important;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:hover')} {
        filter: brightness(1.06);
      }
      /* L1 collapsed — thin divider, accordion-like */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed > td')} {
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      /* L1 expanded — more padding, soft inner shadow */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) > td')} {
        padding: 14px 5px !important;
        box-shadow: inset 0 1px 4px rgba(0,0,0,.08);
      }

      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header')} {
        font-size: ${L2.fontSize};
        font-weight: ${L2.fontWeight} !important;
        background-color: ${L2.bg} !important;
        color: ${L2.color} !important;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td')} {
        padding: ${L2.tdPadding} !important;
        border-bottom: 1px solid rgba(7,70,124,.12);
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td:after')} {
        content: "";
        position: absolute;
        left: 12px;
        top: 8px;
        bottom: 8px;
        width: 3px;
        border-radius: 2px;
        background: rgba(7,70,124,.28);
        pointer-events: none;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed')} {
        opacity: ${L2.collapsedOpacity};
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td')},
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td *')} {
        color: ${L2.color} !important;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:hover')} {
        filter: brightness(0.985);
      }
      /* L2 collapsed — thin divider, accordion-like */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed > td')} {
        border-bottom: 1px solid rgba(7,70,124,.06);
      }
      /* L2 expanded — more padding, subtle tint, soft inner shadow */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:not(.scw-collapsed) > td')} {
        padding: 14px 14px 14px 26px !important;
        background: #f7f9fb !important;
        box-shadow: inset 0 1px 3px rgba(7,70,124,.06);
        border-bottom: 1px solid rgba(7,70,124,.10);
      }

      /* Record count badge */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-record-count')} {
        display: inline-block;
        margin-left: .6em;
        padding: 0px 7px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
        border-radius: 10px;
        vertical-align: middle;
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-1.scw-group-header .scw-record-count')} {
        background: rgba(255,255,255,.22);
        color: #ffffff;
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-2.scw-group-header .scw-record-count')} {
        background: rgba(7,70,124,.12);
        color: #07467c;
      }

      /* KTL arrows: collapsed (.ktlUp) => DOWN; open (.ktlDown) => RIGHT */
      ${s('span.ktlArrow[id^="hideShow_view_"][id$="_arrow"]')} {
        display: inline-block;
        transition: transform 160ms ease, opacity 160ms ease;
        transform-origin: 50% 50%;
      }
      ${s('span.ktlArrow[id^="hideShow_view_"][id$="_arrow"].ktlUp')} {
        transform: rotate(-90deg);
        opacity: .95;
      }
      ${s('span.ktlArrow[id^="hideShow_view_"][id$="_arrow"].ktlDown')} {
        transform: rotate(180deg);
        opacity: 1;
      }

      ${Object.entries(VIEW_OVERRIDES).map(([viewId, o]) => `
        /* Per-view overrides: ${viewId} */
        ${o.L1bg ? `#${viewId} .kn-table-group.kn-group-level-1.scw-group-header { background-color: ${o.L1bg} !important; }` : ''}
        ${o.L1color ? `
          #${viewId} .kn-table-group.kn-group-level-1.scw-group-header > td,
          #${viewId} .kn-table-group.kn-group-level-1.scw-group-header > td * { color: ${o.L1color} !important; }
        ` : ''}
        ${o.L2bg ? `#${viewId} .kn-table-group.kn-group-level-2.scw-group-header { background-color: ${o.L2bg} !important; }` : ''}
        ${o.L2color ? `
          #${viewId} .kn-table-group.kn-group-level-2.scw-group-header > td,
          #${viewId} .kn-table-group.kn-group-level-2.scw-group-header > td * { color: ${o.L2color} !important; }
        ` : ''}
      `).join('')}
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
      $cell.prepend('<span class="scw-collapse-icon" aria-hidden="true">▼</span>');
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

        // force state + class
        $l2.addClass('scw-collapsed');
        $l2.find('.scw-collapse-icon').text('▶');

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
    $header.find('.scw-collapse-icon').text(collapsed ? '▶' : '▼');

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
