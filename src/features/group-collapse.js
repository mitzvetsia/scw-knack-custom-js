/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const SCENE_IDS = ['scene_1085']; // add more scenes as needed
  const EVENT_NS = '.scwGroupCollapse';

  const COLLAPSED_BY_DEFAULT = true;
  const PERSIST_STATE = true;

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

    const sceneScopes = (SCENE_IDS || [])
      .map((s) => `#kn-${s}`)
      .join(', ');
    const S = sceneScopes || '';

    // ---------- THEME TOKENS ----------
    const L1 = {
      fontSize: '16px',
      fontWeight: '600',
      bg: '#07467c',
      color: '#ffffff',
      tdPadding: '10px 14px',
      collapsedOpacity: '0.92',
      textalign: 'left',
    };

    const L2 = {
      fontSize: '14px',
      fontWeight: '600',
      bg: '#f3f8ff',
      color: '#07467c',
      tdPadding: '10px 14px 10px 26px',
      collapsedOpacity: '0.90',
    };

    const css = `
      /* ==========================================================================
         Guardrails: only apply styling inside enabled scenes AND views touched
         by this feature (scw-group-collapse-enabled is added by JS).
         ========================================================================== */
      ${S} .scw-group-collapse-enabled tr.scw-group-header {
        cursor: pointer;
        user-select: none;
      }

      /* ===== Caret/icon polish (inline; only affects our injected .scw-collapse-icon) ===== */
      ${S} .scw-group-collapse-enabled tr.scw-group-header .scw-collapse-icon {
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
      ${S} .scw-group-collapse-enabled tr.scw-group-header.scw-collapsed .scw-collapse-icon {
        transform: rotate(0deg);
        opacity: .9;
      }

      /* ===== Shared cell polish ===== */
      ${S} .scw-group-collapse-enabled tr.scw-group-header > td {
        position: relative;
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header > td:before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 6px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 160ms ease;
      }

      /* Hover/focus: subtle */
      ${S} .scw-group-collapse-enabled tr.scw-group-header:hover > td:before {
        opacity: 1;
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header:focus-within > td:before {
        opacity: 1;
        outline: 2px solid rgba(7,70,124,.28);
        outline-offset: -2px;
      }

      /* ===== LEVEL 1 ===== */
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header {
        font-size: ${L1.fontSize};
        font-weight: ${L1.fontWeight} !important;
        background-color: ${L1.bg} !important;
        color: ${L1.color} !important;
        text-align: ${L1.textalign} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td {
        padding: ${L1.tdPadding} !important;
        border-bottom: 1px solid rgba(255,255,255,.14);
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td:before {
        box-shadow: 0 1px 0 rgba(255,255,255,.10) inset, 0 1px 10px rgba(0,0,0,.10);
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed {
        opacity: ${L1.collapsedOpacity};
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td,
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td * {
        color: ${L1.color} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:hover {
        filter: brightness(1.06);
      }

      /* ===== LEVEL 2 ===== */
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header {
        font-size: ${L2.fontSize};
        font-weight: ${L2.fontWeight} !important;
        background-color: ${L2.bg} !important;
        color: ${L2.color} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td {
        padding: ${L2.tdPadding} !important;
        border-bottom: 1px solid rgba(7,70,124,.12);
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td:after {
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
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed {
        opacity: ${L2.collapsedOpacity};
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td,
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td * {
        color: ${L2.color} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:hover {
        filter: brightness(0.985);
      }

      /* ==========================================================================
         ✅ KTL Hide/Show Arrow Fix (ONLY this element)
         - Collapsed (no .ktlDown): points RIGHT
         - Expanded (.ktlDown): points DOWN
         ========================================================================== */
      ${S} #hideShow_view_3332_arrow {
        display: inline-block;
        transition: transform 160ms ease;
        transform-origin: 50% 50%;
      }
      ${S} #hideShow_view_3332_arrow.ktlDown {
        transform: rotate(0deg); /* ◀ → ▼ */
      }
      ${S} #hideShow_view_3332_arrow:not(.ktlDown) {
        transform: rotate(0deg); /* ◀ → ▶ */
      }
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

  function getRowLabelText($tr) {
    return $tr
      .clone()
      .find('.scw-collapse-icon')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Parent Level-1 label for a Level-2 row (prevents key collisions across sections)
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

  // Collect rows controlled by a header row
  function rowsUntilNextRelevantGroup($headerRow) {
    const isLevel2 = $headerRow.hasClass('kn-group-level-2');
    let $rows = $();

    $headerRow.nextAll('tr').each(function () {
      const $tr = $(this);

      if (isLevel2) {
        // Level 2: stop at ANY next group row (L1 or L2)
        if ($tr.hasClass('kn-table-group')) return false;
        $rows = $rows.add($tr);
        return;
      }

      // Level 1: stop only at NEXT Level 1
      if ($tr.hasClass('kn-group-level-1')) return false;

      $rows = $rows.add($tr);
    });

    return $rows;
  }

  // When expanding a Level-1 group, restore Level-2 collapsed states beneath it
  function restoreLevel2StatesUnderLevel1($level1Header) {
    const $sectionRows = rowsUntilNextRelevantGroup($level1Header);

    $sectionRows
      .filter('tr.kn-table-group.kn-group-level-2.scw-group-header')
      .each(function () {
        const $l2 = $(this);
        const l2Collapsed = $l2.hasClass('scw-collapsed');
        rowsUntilNextRelevantGroup($l2).toggle(!l2Collapsed);
      });
  }

  function setCollapsed($header, collapsed) {
    const isLevel2 = $header.hasClass('kn-group-level-2');

    $header.toggleClass('scw-collapsed', collapsed);
    $header.find('.scw-collapse-icon').text(collapsed ? '▶' : '▼');

    if (isLevel2) {
      // Level 2 controls only its own detail rows
      rowsUntilNextRelevantGroup($header).toggle(!collapsed);
      return;
    }

    // Level 1 hides/shows the entire section...
    rowsUntilNextRelevantGroup($header).toggle(!collapsed);

    // ...but when expanding, we must re-hide children of collapsed Level-2 groups
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
  function enhanceAllGroupedGrids(sceneId) {
    if (!isEnabledScene(sceneId)) return;

    // Scope to the scene root
    const $sceneRoot = $(`#kn-${sceneId}`);
    if (!$sceneRoot.length) return;

    $sceneRoot.find(GROUP_ROW_SEL).each(function () {
      const $tr = $(this);
      const $view = $tr.closest('.kn-view[id^="view_"]');
      const viewId = $view.attr('id') || 'unknown_view';

      $view.addClass('scw-group-collapse-enabled');

      const state = loadState(sceneId, viewId);

      $tr.addClass('scw-group-header');
      ensureIcon($tr);

      const level = getGroupLevel($tr);
      const key = buildKey($tr, level);
      const shouldCollapse = key in state ? !!state[key] : COLLAPSED_BY_DEFAULT;

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

        setCollapsed($tr, collapseNow);
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
