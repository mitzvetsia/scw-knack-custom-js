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

      /* =========================
         1) GLOBAL SECTION HEADERS (KTL hide/show)
      ========================= */
      ${S} .ktlHideShowButton {
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
        background: #0b4f82 !important;
=======
        background: #07467c !important;
>>>>>>> theirs
=======
        background: #07467c !important;
>>>>>>> theirs
=======
        background: #07467c !important;
>>>>>>> theirs
=======
        background: #07467c !important;
>>>>>>> theirs
=======
        background: #07467c !important;
>>>>>>> theirs
        color: #fff !important;
        font-weight: 650 !important;
        border-radius: 10px !important;
        padding: 10px 14px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
        width: 100% !important;
>>>>>>> theirs
        letter-spacing: 0.2px !important;
      }

      ${S} .kn-view .view-header .kn-title {
        margin-bottom: 10px !important;
      }

      ${S} .ktlHideShowSection.ktlBoxWithBorder {
        border: 1px solid rgba(0,0,0,.10) !important;
        border-radius: 12px !important;
        padding: 12px !important;
        background: #ffffff !important;
      }

      ${S} .ktlArrow,
      ${S} .ktlHideShowButton .ktlArrow {
        color: rgba(255,255,255,.85) !important;
      }

      /* =========================
         2) TABLE BASELINE (calmer grid)
      ========================= */
      ${S} .kn-table {
        border-radius: 12px !important;
        overflow: hidden !important;
      }

      ${S} .kn-table thead th {
        background: #f2f5f8 !important;
        color: #243447 !important;
        font-weight: 650 !important;
        border-bottom: 1px solid rgba(0,0,0,.10) !important;
      }

      ${S} .kn-table td,
      ${S} .kn-table th {
        border-color: rgba(0,0,0,.08) !important;
      }

      ${S} .kn-table td {
        color: #1f2d3d !important;
        line-height: 1.35 !important;
      }

      ${S} .kn-table tbody tr:nth-child(even) td {
        background: #fafafa !important;
      }

=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        letter-spacing: 0.2px !important;
      }

      ${S} .ktlHideShowButton .ktlArrow {
<<<<<<< ours
        margin-left: auto !important;
=======
        position: absolute !important;
        right: 14px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
>>>>>>> theirs
      }

      ${S} .kn-view .view-header .kn-title {
        margin-bottom: 10px !important;
        width: 100% !important;
        max-width: 100% !important;
        display: block !important;
      }

      ${S} .kn-view .view-header {
        width: 100% !important;
        max-width: 100% !important;
        display: block !important;
<<<<<<< ours
=======
        position: relative !important;
>>>>>>> theirs
      }

      ${S} .ktlHideShowSection.ktlBoxWithBorder {
        border: 1px solid rgba(0,0,0,.10) !important;
        border-radius: 12px !important;
        padding: 12px !important;
        background: #ffffff !important;
      }

      ${S} .ktlArrow,
      ${S} .ktlHideShowButton .ktlArrow {
        color: rgba(255,255,255,.85) !important;
      }

      /* =========================
         2) TABLE BASELINE (calmer grid)
      ========================= */
      ${S} .kn-table {
        border-radius: 12px !important;
        overflow: hidden !important;
      }

      ${S} .kn-table thead th {
        background: #f2f5f8 !important;
        color: #243447 !important;
        font-weight: 650 !important;
        border-bottom: 1px solid rgba(0,0,0,.10) !important;
      }

      ${S} .kn-table td,
      ${S} .kn-table th {
        border-color: rgba(0,0,0,.08) !important;
      }

      ${S} .kn-table td {
        color: #1f2d3d !important;
        line-height: 1.35 !important;
      }

      ${S} .kn-table tbody tr:nth-child(even) td {
        background: #fafafa !important;
      }

<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
      ${S} .kn-table tbody tr:hover td {
        background: #f1f7fc !important;
      }

<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
=======
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        letter-spacing: 0.2px !important;
      }

      ${S} .ktlHideShowButton .ktlArrow {
        margin-left: auto !important;
      }

      ${S} .kn-view .view-header .kn-title {
        margin-bottom: 10px !important;
        width: 100% !important;
        max-width: 100% !important;
        display: block !important;
      }

      ${S} .ktlHideShowSection.ktlBoxWithBorder {
        border: 1px solid rgba(0,0,0,.10) !important;
        border-radius: 12px !important;
        padding: 12px !important;
        background: #ffffff !important;
      }

      ${S} .ktlArrow,
      ${S} .ktlHideShowButton .ktlArrow {
        color: rgba(255,255,255,.85) !important;
      }

      /* =========================
         2) TABLE BASELINE (calmer grid)
      ========================= */
      ${S} .kn-table {
        border-radius: 12px !important;
        overflow: hidden !important;
      }

      ${S} .kn-table thead th {
        background: #f2f5f8 !important;
        color: #243447 !important;
        font-weight: 650 !important;
        border-bottom: 1px solid rgba(0,0,0,.10) !important;
      }

      ${S} .kn-table td,
      ${S} .kn-table th {
        border-color: rgba(0,0,0,.08) !important;
      }

      ${S} .kn-table td {
        color: #1f2d3d !important;
        line-height: 1.35 !important;
      }

      ${S} .kn-table tbody tr:nth-child(even) td {
        background: #fafafa !important;
      }

      ${S} .kn-table tbody tr:hover td {
        background: #f1f7fc !important;
      }

>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
      /* =========================
         3) GROUP HEADER HIERARCHY (Knack grouped rows)
      ========================= */
      ${S} .kn-table-group > td {
        border-top: 1px solid rgba(0,0,0,.10) !important;
        border-bottom: 1px solid rgba(0,0,0,.10) !important;
      }

<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
      ${S} .kn-table-group.kn-group-level-1 > td {
<<<<<<< ours
        background: #3f6e9a !important;
=======
        background: #07467c !important;
>>>>>>> theirs
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
      ${S} .kn-table-group.kn-group-level-1,
      ${S} .kn-table-group.kn-group-level-1 > td,
      ${S} .kn-table-group.kn-group-level-1 > th {
        background: #07467c !important;
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
=======
      ${S} tr.kn-table-group.kn-group-level-1,
      ${S} tr.kn-table-group.kn-group-level-1 > td,
      ${S} tr.kn-table-group.kn-group-level-1 > th,
      ${S} tr.kn-table-group.kn-group-level-1 td,
      ${S} tr.kn-table-group.kn-group-level-1 th {
        background: #07467c !important;
>>>>>>> theirs
        color: #ffffff !important;
        font-weight: 700 !important;
        font-size: 1.05em !important;
        padding-top: 12px !important;
        padding-bottom: 12px !important;
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
        border-left: 6px solid #1f4f7a !important;
=======
        border-left: 6px solid #07467c !important;
>>>>>>> theirs
=======
        border-left: 6px solid #07467c !important;
>>>>>>> theirs
=======
        border-left: 6px solid #07467c !important;
>>>>>>> theirs
=======
        border-left: 6px solid #07467c !important;
>>>>>>> theirs
      }

      ${S} .kn-table-group.kn-group-level-2 > td {
=======
        border-left: 6px solid #07467c !important;
      }

      ${S} tr.kn-table-group.kn-group-level-2 > td,
      ${S} tr.kn-table-group.kn-group-level-2 > th,
      ${S} tr.kn-table-group.kn-group-level-2 td,
      ${S} tr.kn-table-group.kn-group-level-2 th {
>>>>>>> theirs
        background: #eef4f9 !important;
        color: #1f2d3d !important;
        font-weight: 600 !important;
        font-size: 0.98em !important;
        padding-top: 10px !important;
        padding-bottom: 10px !important;
        border-left: 6px solid #9fc0de !important;
      }

      ${S} .kn-table-group.kn-group-level-3 > td {
        background: #f6f8fb !important;
        color: #2b3a4a !important;
        font-weight: 600 !important;
        font-size: 0.95em !important;
        border-left: 6px solid #d7e3ee !important;
      }

      ${S} .kn-table-group.kn-group-level-4 > td {
        background: #fbfcfe !important;
        color: #2b3a4a !important;
        font-weight: 600 !important;
        font-size: 0.93em !important;
        border-left: 6px solid #e9f0f7 !important;
      }

      ${S} tr.scw-group-header.kn-group-level-1 > td {}
      ${S} tr.scw-group-header.kn-group-level-2 > td {}

      /* =========================
         5) OPTIONAL: Collapsed/expanded affordance
      ========================= */
      ${S} .scw-group-header.is-expanded > td {
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.18) !important;
      }

      ${S} .scw-group-header.is-collapsed > td {
        opacity: 0.95 !important;
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
    $header.toggleClass('is-collapsed', collapsed);
    $header.toggleClass('is-expanded', !collapsed);
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
