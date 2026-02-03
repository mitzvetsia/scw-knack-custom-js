////************* DTO: Unified Products (field_2246) = UNION of 2193/2194/2195 *************////
/**
 * SCW - Unified Product Connection Union
 *
 * Goal:
 *  - field_2246 (REL_unified product field) should always contain the UNION of:
 *      - field_2193 (REL_products_cameras+cabling)      [single]
 *      - field_2194 (REL_products_for networking)       [single]
 *      - field_2195 (REL_products_for other equipment)  [multi]
 *
 * Why this works even when the select has no options loaded:
 *  - Knack submits connection values via: input.connection[name="field_xxxx"]
 *  - That input expects URL-encoded JSON:
 *      single: "recordId"
 *      multi : ["id1","id2",...]
 *
 * Supports:
 *  - Multiple views, scenes
 *  - Chosen pickers
 *  - Debounced updates to avoid event storms
 */

(function () {
  "use strict";

  // ======================
  // CONFIG
  // ======================
  const EVENT_NS = ".scwUnifiedProducts";
  const CONFIG = {
    // If you want to scope to specific scenes, add them here. Leave empty for all.
    SCENES: [],

    // Views containing the form(s)
    VIEWS: ["view_3329"],

    // Parent product connection fields
    PARENT_FIELDS: ["field_2193", "field_2194", "field_2195"],

    // Unified connection field (should be MULTI connection in Knack for true union)
    UNIFIED_FIELD: "field_2246",

    // Debug logging
    DEBUG: false
  };

  // ======================
  // UTILS
  // ======================
  function log(...args) {
    if (CONFIG.DEBUG && window.console) console.log("[scwUnified2246]", ...args);
  }

  function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
  }

  function asArray(v) {
    if (!v) return [];
    return Array.isArray(v) ? v.filter(Boolean) : [v].filter(Boolean);
  }

  function encodeConnValue(ids, isMulti) {
    const payload = isMulti ? ids : (ids[0] || "");
    return encodeURIComponent(JSON.stringify(payload));
  }

  function debounce(fn, wait) {
    let t;
    return function debounced(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function inAllowedScene(sceneKey) {
    if (!CONFIG.SCENES || !CONFIG.SCENES.length) return true;
    return CONFIG.SCENES.includes(sceneKey);
  }

  // ======================
  // DOM HELPERS (Chosen + Knack)
  // ======================
  function $viewRoot(viewId) {
    return $(`#${viewId}`);
  }

  function getSelect($view, viewId, fieldKey) {
    // Common Knack form select id is `${viewId}-${fieldKey}`
    return $view.find(`#${viewId}-${fieldKey}, #${fieldKey}, select[name='${fieldKey}']`).first();
  }

  function getHiddenConn($view, fieldKey) {
    // The hidden input actually submitted by Knack for connection fields
    return $view.find(`#kn-input-${fieldKey} input.connection[name='${fieldKey}']`).first();
  }

  function isMultiSelect($select) {
    return !!$select.prop("multiple");
  }

  function updateChosen($select) {
    // Chosen legacy + newer events
    $select.trigger("liszt:updated");
    $select.trigger("chosen:updated");
  }

  // ======================
  // CORE LOGIC
  // ======================
  function readParentIds($view, viewId) {
    const ids = CONFIG.PARENT_FIELDS.flatMap((fk) => {
      const $sel = getSelect($view, viewId, fk);
      return asArray($sel.val());
    });
    return uniq(ids);
  }

  function unifiedIsMulti($view, viewId) {
    const $sel = getSelect($view, viewId, CONFIG.UNIFIED_FIELD);
    return isMultiSelect($sel);
  }

  function setUnified($view, viewId) {
    const ids = readParentIds($view, viewId);

    const $hidden = getHiddenConn($view, CONFIG.UNIFIED_FIELD);
    if (!$hidden.length) {
      log("No hidden connection input found for", CONFIG.UNIFIED_FIELD);
      return;
    }

    const multi = unifiedIsMulti($view, viewId);
    const encoded = encodeConnValue(ids, multi);

    // Guard: avoid loops
    if ($hidden.data("scwSetting")) return;

    // No-op if already correct
    if (($hidden.val() || "") === encoded) return;

    log("Setting unified field:", { ids, multi, encoded });

    $hidden.data("scwSetting", 1);
    $hidden.val(encoded).trigger("change");

    // Best-effort: refresh chosen UI (may still show Select if options aren't loaded)
    const $unifiedSelect = getSelect($view, viewId, CONFIG.UNIFIED_FIELD);
    if ($unifiedSelect.length) updateChosen($unifiedSelect);

    $hidden.data("scwSetting", 0);
  }

  function bindView(viewId) {
    const $view = $viewRoot(viewId);
    if (!$view.length) return;

    const sync = debounce(() => setUnified($view, viewId), 50);

    // Bind parent changes
    CONFIG.PARENT_FIELDS.forEach((fk) => {
      const $sel = getSelect($view, viewId, fk);
      if (!$sel.length) return;

      $sel.off(`change${EVENT_NS}`).on(`change${EVENT_NS}`, function () {
        sync();
      });

      // Some pickers fire blur/input as well; cheap coverage
      $sel.off(`blur${EVENT_NS}`).on(`blur${EVENT_NS}`, function () {
        sync();
      });
    });

    // Initial
    sync();
  }

  // ======================
  // EVENT WIRING (multi-view, multi-scene)
  // ======================
  // If you want strict scene scoping, replace ".any" with your scene key(s).
  $(document).on(`knack-scene-render.any${EVENT_NS}`, function (event, scene) {
    if (!inAllowedScene(scene.key)) return;

    CONFIG.VIEWS.forEach((viewId) => {
      // Hook on view render so DOM exists
      $(document)
        .off(`knack-view-render.${viewId}${EVENT_NS}`)
        .on(`knack-view-render.${viewId}${EVENT_NS}`, function () {
          bindView(viewId);
        });
    });
  });

})();
