////************* DTO: Unified Products (field_2246) from 2193/2194/2195 *************////
(function () {
  "use strict";

  // ======================
  // CONFIG
  // ======================
  const EVENT_NS = ".scwUnifiedProducts";
  const CONFIG = {
    SCENES: [], // e.g. ['scene_123'] or leave [] for all scenes
    VIEWS: ["view_3329"],

    // parent product fields
    PARENTS: ["field_2193", "field_2194", "field_2195"],

    // unified field
    UNIFIED: "field_2246",

    // when this field changes, unified must be cleared
    RESET_ON_FIELD: "field_2223",

    // If unified is SINGLE connection, pick first non-empty in this order:
    SINGLE_PRIORITY: ["field_2193", "field_2194", "field_2195"],

    // Hide unified visually but keep it in the DOM
    HIDE_UNIFIED_FIELD: true,

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

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function inAllowedScene(sceneKey) {
    if (!CONFIG.SCENES || !CONFIG.SCENES.length) return true;
    return CONFIG.SCENES.includes(sceneKey);
  }

  // ======================
  // DOM HELPERS
  // ======================
  function $viewRoot(viewId) {
    return $(`#${viewId}`);
  }

  function getSelect($view, viewId, fieldKey) {
    // Standard Knack form select id: `${viewId}-${fieldKey}`
    return $view.find(`#${viewId}-${fieldKey}`).first();
  }

  function getHiddenConn($view, fieldKey) {
    // Hidden "connection" input that Knack submits
    return $view.find(`#kn-input-${fieldKey} input.connection[name='${fieldKey}']`).first();
  }

  function isMultiSelect($select) {
    return !!$select.prop("multiple");
  }

  function chosenUpdate($select) {
    // Chosen legacy + newer event names
    $select.trigger("liszt:updated");
    $select.trigger("chosen:updated");
  }

  function encodeConnValue(ids, isMulti) {
    const payload = isMulti ? ids : (ids[0] || "");
    return encodeURIComponent(JSON.stringify(payload));
  }

  // Read selected IDs AND their display labels from a parent select
  function readSelectedIdToLabelMap($select) {
    const out = {};
    if (!$select || !$select.length) return out;

    // Works for both single and multi
    $select.find("option:selected").each(function () {
      const id = $(this).attr("value") || "";
      const label = ($(this).text() || "").trim();
      if (id) out[id] = label || id;
    });

    return out;
  }

  function mergeMaps(...maps) {
    const out = {};
    maps.forEach((m) => {
      Object.keys(m || {}).forEach((k) => {
        if (!out[k]) out[k] = m[k];
      });
    });
    return out;
  }

  // Ensure unified select contains <option value="id">Label</option> for each selected id
  function ensureOptions($unifiedSelect, idToLabel) {
    if (!$unifiedSelect || !$unifiedSelect.length) return;

    Object.keys(idToLabel).forEach((id) => {
      if (!$unifiedSelect.find(`option[value="${id}"]`).length) {
        const label = idToLabel[id] || id;
        $unifiedSelect.append(new Option(label, id, false, false));
      } else {
        // If option exists but is blank, update label
        const $opt = $unifiedSelect.find(`option[value="${id}"]`).first();
        if (!($opt.text() || "").trim()) $opt.text(idToLabel[id] || id);
      }
    });
  }

  // Hide unified input row visually, without removing it from DOM
  function safeHideUnifiedField($view) {
    if (!CONFIG.HIDE_UNIFIED_FIELD) return;

    const $wrap = $view.find(`#kn-input-${CONFIG.UNIFIED}`).first();
    if (!$wrap.length) return;

    // keep it in DOM; avoid display:none
    $wrap.css({
      position: "absolute",
      left: "-99999px",
      top: "auto",
      width: "1px",
      height: "1px",
      overflow: "hidden"
    });

    // also hide chosen container if present
    $wrap.find(".chzn-container, .chosen-container").css({
      position: "absolute",
      left: "-99999px",
      top: "auto",
      width: "1px",
      height: "1px",
      overflow: "hidden"
    });
  }

  // ======================
  // CORE: set unified based on parents
  // ======================
  function computeUnionIdsAndLabels($view, viewId) {
    const parentSelects = CONFIG.PARENTS.map((fk) => [fk, getSelect($view, viewId, fk)]);
    const maps = parentSelects.map(([, $sel]) => readSelectedIdToLabelMap($sel));
    const idToLabel = mergeMaps(...maps);

    const unionIds = uniq(Object.keys(idToLabel));

    return { unionIds, idToLabel };
  }

  function computeSinglePick(unionIds, $view, viewId) {
    // Pick first non-empty in priority order
    for (const fk of CONFIG.SINGLE_PRIORITY) {
      const $sel = getSelect($view, viewId, fk);
      const ids = asArray($sel.val());
      if (ids.length) return [ids[0]];
    }
    return unionIds.length ? [unionIds[0]] : [];
  }

  function setUnifiedFromParents($view, viewId) {
    const $unifiedSelect = getSelect($view, viewId, CONFIG.UNIFIED);
    const $unifiedHidden = getHiddenConn($view, CONFIG.UNIFIED);

    if (!$unifiedSelect.length || !$unifiedHidden.length) {
      log("Missing unified select/hidden for", CONFIG.UNIFIED);
      return;
    }

    const { unionIds, idToLabel } = computeUnionIdsAndLabels($view, viewId);

    // WAIT CONDITION: only run after any parent has a selection.
    // If all empty, clear unified.
    if (!unionIds.length) {
      const isMulti = isMultiSelect($unifiedSelect);
      const encodedClear = encodeConnValue([], isMulti);

      $unifiedSelect.val(isMulti ? [] : "").trigger("change");
      $unifiedHidden.val(encodedClear).trigger("change");
      chosenUpdate($unifiedSelect);
      return;
    }

    const unifiedIsMulti = isMultiSelect($unifiedSelect);
    const finalIds = unifiedIsMulti ? unionIds : computeSinglePick(unionIds, $view, viewId);

    // Make sure Chosen has the options available so it can display selections
    ensureOptions($unifiedSelect, idToLabel);

    // Apply selection to the SELECT (so UI updates)
    $unifiedSelect.val(unifiedIsMulti ? finalIds : (finalIds[0] || "")).trigger("change");

    // Also set hidden explicitly (so Knack definitely submits it)
    const encoded = encodeConnValue(finalIds, unifiedIsMulti);
    $unifiedHidden.val(encoded).trigger("change");

    chosenUpdate($unifiedSelect);

    log("Unified set", { unifiedIsMulti, finalIds, encoded });
  }

  // ✅ NEW: clear unified immediately (select + hidden)
  function clearUnifiedField($view, viewId) {
    const $unifiedSelect = getSelect($view, viewId, CONFIG.UNIFIED);
    const $unifiedHidden = getHiddenConn($view, CONFIG.UNIFIED);

    if (!$unifiedSelect.length || !$unifiedHidden.length) return;

    const isMulti = isMultiSelect($unifiedSelect);
    const clearedVal = isMulti ? [] : "";

    // Clear visible select
    $unifiedSelect.val(clearedVal).trigger("change");

    // Clear hidden connection (Knack submission source)
    const encodedClear = encodeConnValue([], isMulti);
    $unifiedHidden.val(encodedClear).trigger("change");

    chosenUpdate($unifiedSelect);

    log("Unified field cleared due to reset trigger");
  }

  // ======================
  // BINDING
  // ======================
  function bind(viewId) {
    const $view = $viewRoot(viewId);
    if (!$view.length) return;

    // Keep unified hidden but present
    safeHideUnifiedField($view);

    const sync = debounce(() => setUnifiedFromParents($view, viewId), 80);

    // 🔁 RESET: clear unified whenever field_2223 changes
    if (CONFIG.RESET_ON_FIELD) {
      const $resetSel = getSelect($view, viewId, CONFIG.RESET_ON_FIELD);
      if ($resetSel.length) {
        $resetSel
          .off(`change${EVENT_NS}-reset`)
          .on(`change${EVENT_NS}-reset`, function () {
            clearUnifiedField($view, viewId);
          });
      }
    }

    // Bind to parent field changes only (your sequencing request)
    CONFIG.PARENTS.forEach((fk) => {
      const $sel = getSelect($view, viewId, fk);
      if (!$sel.length) return;

      $sel.off(`change${EVENT_NS}`).on(`change${EVENT_NS}`, sync);
      $sel.off(`blur${EVENT_NS}`).on(`blur${EVENT_NS}`, sync);
    });

    // Initial pass (will clear unified unless parents already have values)
    sync();
  }

  // Enable on view render
  $(document).on(`knack-scene-render.any${EVENT_NS}`, function (event, scene) {
    if (!inAllowedScene(scene.key)) return;

    CONFIG.VIEWS.forEach((viewId) => {
      $(document)
        .off(`knack-view-render.${viewId}${EVENT_NS}`)
        .on(`knack-view-render.${viewId}${EVENT_NS}`, function () {
          bind(viewId);
        });
    });
  });
})();
