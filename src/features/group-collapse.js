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
      tdPadding: '6px 12px',
      collapsedOpacity: '0.92',
      textalign: 'center',
      divider: 'rgba(255, 255, 255, 0.18)',
      shadow: 'rgba(8, 25, 44, 0.2)',
    };

    const L2 = {
      fontSize: '14px',
      fontWeight: '500',
      bg: 'aliceblue',
      color: '#07467c',
      tdPadding: '6px 12px 6px 24px',
      collapsedOpacity: '0.88',
      accent: 'rgba(7, 70, 124, 0.35)',
      divider: 'rgba(7, 70, 124, 0.12)',
    };

    const css = `
      /* ===== Shared group header behavior ===== */
      ${S} .scw-group-collapse-enabled tr.scw-group-header {
        cursor: pointer;
        user-select: none;
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header .scw-collapse-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.6em;
        height: 1.6em;
        margin-right: 0.4em;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 700;
<<<<<<< ours
        vertical-align: middle;
        transition: transform 160ms ease, background-color 160ms ease;
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header .scw-collapse-icon::before {
        content: '▸';
        font-size: 0.85rem;
=======
>>>>>>> theirs
        line-height: 1;
        vertical-align: middle;
        flex-shrink: 0;
        transition: transform 160ms ease, background-color 160ms ease;
      }
<<<<<<< ours
      ${S} .scw-group-collapse-enabled tr.scw-group-header:not(.scw-collapsed) .scw-collapse-icon::before {
=======
      ${S} .scw-group-collapse-enabled tr.scw-group-header:not(.scw-collapsed) .scw-collapse-icon {
>>>>>>> theirs
        transform: rotate(90deg);
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header:hover .scw-collapse-icon {
        background-color: rgba(255, 255, 255, 0.18);
      }
      ${S} .scw-group-collapse-enabled tr.scw-group-header:focus-within .scw-collapse-icon {
        box-shadow: 0 0 0 2px rgba(7, 70, 124, 0.35);
      }

      /* ===== LEVEL 1 (MDF / IDF) ===== */
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header {
        font-size: ${L1.fontSize};
        font-weight: ${L1.fontWeight} !important;
        color: ${L1.color} !important;
        text-align: ${L1.textalign} !important;
        letter-spacing: 0.02em;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td {
        padding: ${L1.tdPadding} !important;
        background-color: ${L1.bg} !important;
        border-bottom: 1px solid ${L1.divider};
        box-shadow: 0 1px 0 ${L1.shadow};
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td:first-child {
        border-top-left-radius: 6px;
        border-bottom-left-radius: 6px;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td:last-child {
        border-top-right-radius: 6px;
        border-bottom-right-radius: 6px;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed {
        opacity: ${L1.collapsedOpacity};
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td,
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td * {
        color: ${L1.color} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:hover > td {
        filter: brightness(1.05);
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:focus-within > td {
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
      }

      /* ===== LEVEL 2 (Bucket) ===== */
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header {
        font-size: ${L2.fontSize};
        font-weight: ${L2.fontWeight} !important;
        color: ${L2.color} !important;
        letter-spacing: 0.01em;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td {
        padding: ${L2.tdPadding} !important;
        background-color: ${L2.bg} !important;
        border-bottom: 1px solid ${L2.divider};
        position: relative;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td::before {
        content: '';
        position: absolute;
        left: 8px;
        top: 6px;
        bottom: 6px;
        width: 3px;
        border-radius: 2px;
        background-color: ${L2.accent};
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed {
        opacity: ${L2.collapsedOpacity};
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td,
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td * {
        color: ${L2.color} !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:hover > td {
        background-color: #e7f1fb !important;
      }
      ${S} .scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:focus-within > td {
        box-shadow: inset 0 0 0 2px rgba(7, 70, 124, 0.2);
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
      $cell.prepend('<span class="scw-collapse-icon" aria-hidden="true">▸</span>');
    }
  }

  function getRowLabel($tr) {
    return $tr
      .clone()
      .find('.scw-collapse-icon')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildKey($tr, level) {
    const label = getRowLabel($tr);
    if (level === 2) {
      const $parent = $tr.prevAll('tr.kn-group-level-1').first();
      if ($parent.length) {
        const parentLabel = getRowLabel($parent);
        return `L1:${parentLabel}|L2:${label}`;
      }
    }
    return `L${level}:${label}`;
  }

  // 🔑 LEVEL-AWARE ROW COLLECTION (THIS IS THE BIG FIX)
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

      // Level 1: stop only at NEXT Level 1
      if ($tr.hasClass('kn-group-level-1')) return false;

      $rows = $rows.add($tr);
    });

    return $rows;
  }

  function setCollapsed($header, collapsed) {
    $header.toggleClass('scw-collapsed', collapsed);
    rowsUntilNextRelevantGroup($header).toggle(!collapsed);
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

    $(GROUP_ROW_SEL).each(function () {
      const $tr = $(this);
      const $view = $tr.closest('.kn-view[id^="view_"]');
      $view.addClass('scw-group-collapse-enabled');
      const viewId = $view.attr('id') || 'unknown_view';

      const state = loadState(sceneId, viewId);

      $tr.addClass('scw-group-header');
      ensureIcon($tr);

      const level = getGroupLevel($tr);
      const key = buildKey($tr, level);
      const shouldCollapse =
        key in state ? !!state[key] : COLLAPSED_BY_DEFAULT;

      setCollapsed($tr, shouldCollapse);
    });
  }

  // ======================
  // CLICK HANDLER (DELEGATED)
  // ======================
  function bindClicksOnce() {
    $(document)
      .off('click' + EVENT_NS, GROUP_ROW_SEL)
      .on('click' + EVENT_NS, GROUP_ROW_SEL, function (e) {
        if ($(e.target).closest('a,button,input,select,textarea,label').length) return;

        const sceneId = getCurrentSceneId();
        if (!isEnabledScene(sceneId)) return;

        const $tr = $(this);
        const $view = $tr.closest('.kn-view[id^="view_"]');
        const viewId = $view.attr('id') || 'unknown_view';

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
      if (!isEnabledScene(getCurrentSceneId())) return;
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
