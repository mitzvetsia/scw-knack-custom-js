/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE ************************/

// Replace *whatever* is rendered in field_1946 cells with an icon
// Runs on all grid views within the target scenes

(function () {
  const SCENE_IDS = ["scene_1085", "scene_1116"];

  const FIELD_KEY = "field_1946";

  const ICON_HTML =
    '<span style="display:inline-flex; align-items:center; justify-content:center; gap:4px; vertical-align:middle;">' +
      '<i class="fa fa-server" aria-hidden="true" title="Changing Location" style="font-size:22px; line-height:1;"></i>' +
      '<span style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:0; line-height:1;">' +
        '<i class="fa fa-level-up" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
        '<i class="fa fa-level-down" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
      '</span>' +
    '</span>';

  // Inject CSS once
  function injectCssOnce() {
    const id = "scw-field1946-icon-css";
    if (document.getElementById(id)) return;

    const selectors = SCENE_IDS
      .map(s => `#kn-${s} td.${FIELD_KEY}`)
      .join(", ");

    const css = `
      ${selectors} {
        display: table-cell !important;
        text-align: center;
        vertical-align: middle;
      }
    `;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getCurrentSceneId() {
    const bodyId = $('body').attr('id');
    if (bodyId && bodyId.includes('scene_')) {
      const m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    return null;
  }

  function replaceIconsInScene(sceneId) {
    const $scene = $(`#kn-${sceneId}`);
    if (!$scene.length) return;

    $scene.find(`table.kn-table tbody td.${FIELD_KEY}`).each(function () {
      const $cell = $(this);

      // Content-based idempotency: only skip if the icon is actually present.
      // jQuery .data() flags persist on reused DOM elements even after Knack
      // replaces cell innerHTML during inline edits, so we check the real DOM.
      if ($cell.find(".fa-server").length) return;

      $cell.empty().append(ICON_HTML);
    });
  }

  // Runs replacement for whichever target scene is active
  function replaceIfActiveScene() {
    const current = getCurrentSceneId();
    if (current && SCENE_IDS.indexOf(current) !== -1) {
      replaceIconsInScene(current);
    }
  }

  // MutationObserver catches views that render after the scene event fires
  const observerByScene = {};

  function startObserverForScene(sceneId) {
    if (observerByScene[sceneId]) return;

    let raf = 0;
    const obs = new MutationObserver(() => {
      const current = getCurrentSceneId();
      if (current !== sceneId) return;

      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => replaceIconsInScene(sceneId));
    });

    obs.observe(document.body, { childList: true, subtree: true });
    observerByScene[sceneId] = obs;
  }

  // ---- Event listeners for inline-edit recovery ----
  // knack-cell-update fires after a single cell inline edit completes.
  // knack-view-render fires when model.fetch() refreshes a whole view.
  // Both run replacement synchronously (no RAF) so the text-to-icon swap
  // happens in the same frame Knack fires the event — no visible flash.
  const NS = ".scwReplaceIcon";

  function bindInlineEditListeners() {
    $(document)
      .off("knack-cell-update" + NS)
      .on("knack-cell-update" + NS, replaceIfActiveScene);

    $(document)
      .off("knack-view-render" + NS)
      .on("knack-view-render" + NS, replaceIfActiveScene);
  }

  SCENE_IDS.forEach((sceneId) => {
    SCW.onSceneRender(sceneId, function () {
      injectCssOnce();
      replaceIconsInScene(sceneId);
      startObserverForScene(sceneId);
      bindInlineEditListeners();
    }, 'replace-content-with-icon');
  });

  // Handle case where scene is already rendered on load
  const initialScene = getCurrentSceneId();
  if (SCENE_IDS.indexOf(initialScene) !== -1) {
    injectCssOnce();
    replaceIconsInScene(initialScene);
    startObserverForScene(initialScene);
    bindInlineEditListeners();
  }
})();

/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE **************************/
