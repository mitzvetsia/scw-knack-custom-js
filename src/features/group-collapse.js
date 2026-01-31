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
      fontSize: '18px',
      fontWeight: '200',
      bg: '#07467c',
      color: '#ffffff',
      tdPadding: '8px 12px',
      collapsedOpacity: '0.92',
      textalign: 'left',
    };

    const L2 = {
      fontSize: '15px',
      fontWeight: '400',
      bg: 'aliceblue',
      color: '#07467c',
      tdPadding: '10px 0px 10px 50px',
      collapsedOpacity: '0.88',
    };

    const css = `
      /* ===== Shared group header behavior ===== */
      ${S} tr.scw-group-header {
        cursor: pointer;
        user-select: none;
      }
      ${S} tr.scw-group-header .scw-collapse-icon {
        display: inline-block;
        width: 1.2em;
        text-align: center;
        margin-right: .35em;
        font-weight: 700;
      }

      /* ===== LEVEL 1 (MDF / IDF) ===== */
      ${S} .kn-table-group.kn-group-level-1.scw-group-header {
        font-size: ${L1.fontSize};
        font-weight: ${L1.fontWeight} !important;
        background-color: ${L1.bg} !important;
        color: ${L1.color} !important;
        text-align: ${L1.textalign} !important;
      }
      ${S} .kn-table-group.kn-group-level-1.scw-group-header > td {
        padding: ${L1.tdPadding} !important;
        text-align: ${L1.textalign} !important;
      }
      ${S} .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed {
        opacity: ${L1.collapsedOpacity};
      }
      ${S} .kn-table-group.kn-group-level-1.scw-group-header > td,
      ${S} .kn-table-group.kn-group-level-1.scw-group-header > td * {
        color: ${L1.color} !important;
      }

      /* ===== LEVEL 2 (Bucket) ===== */
      ${S} .kn-table-group.kn-group-level-2.scw-group-header {
        font-size: ${L2.fontSize};
        font-weight: ${L2.fontWeight} !important;
        background-color: ${L2.bg} !important;
        color: ${L2.color} !important;
      }
      ${S} .kn-table-group.kn-group-level-2.scw-group-header > td {
        padding: ${L2.tdPadding} !important;
      }
      ${S} .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed {
        opacity: ${L2.collapsedOpacity};
      }
      ${S} .kn-table-group.kn-group-level-2.scw-group-header > td,
      ${S} .kn-table-group.kn-group-level-2.scw-group-header > td * {
        color: ${L2.color} !important;
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

  function buildKey($tr, level) {
    const label = $tr
      .clone()
      .find('.scw-collapse-icon')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
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
    $header.find('.scw-collapse-icon').text(collapsed ? '▶' : '▼');
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

