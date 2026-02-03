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

    // bucket field: when this changes, clear ALL parents + unified
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

  function readSelectedIdToLabelMap($select) {
    const out = {};
    if (!$select || !$select.length) return out;

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

  function ensureOptions($unifiedSelect, idToLabel) {
    if (!$unifiedSelect || !$unifiedSelect.length) return;

    Object.keys(idToLabel).forEach((id) => {
      if (!$unifiedSelect.find(`option[value="${id}"]`).length) {
        const label = idToLabel[id] || id;
        $unifiedSelect.append(new Option(label, id, false, false));
      } else {
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

    $wrap.css({
      position: "absolute",
      left: "-99999px",
      top: "auto",
      width: "1px",
      height: "1px",
      overflow: "hidden"
    });

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

    ensureOptions($unifiedSelect, idToLabel);

    $unifiedSelect.val(unifiedIsMulti ? finalIds : (finalIds[0] || "")).trigger("change");

    const encoded = encodeConnValue(finalIds, unifiedIsMulti);
    $unifiedHidden.val(encoded).trigger("change");

    chosenUpdate($unifiedSelect);

    log("Unified set", { unifiedIsMulti, finalIds, encoded });
  }

  // ======================
  // CLEAR HELPERS
  // ======================
  function clearConnField($view, viewId, fieldKey) {
    const $sel = getSelect($view, viewId, fieldKey);
    const $hidden = getHiddenConn($view, fieldKey);

    // Parent fields might not have the hidden connection input in the same shape as UNIFIED,
    // but if it exists we clear it too.
    const hasSelect = $sel && $sel.length;
    const hasHidden = $hidden && $hidden.length;

    if (!hasSelect && !hasHidden) return;

    let isMulti = false;
    if (hasSelect) isMulti = isMultiSelect($sel);

    const clearedVal = isMulti ? [] : "";

    if (hasSelect) {
      $sel.val(clearedVal).trigger("change");
      chosenUpdate($sel);
    }

    if (hasHidden) {
      const encodedClear = encodeConnValue([], isMulti);
      $hidden.val(encodedClear).trigger("change");
    }

    log("Cleared field", fieldKey);
  }

  function clearUnifiedField($view, viewId) {
    clearConnField($view, viewId, CONFIG.UNIFIED);
  }

  function clearAllParents($view, viewId) {
    CONFIG.PARENTS.forEach((fk) => clearConnField($view, viewId, fk));
  }

  function clearParentsAndUnified($view, viewId) {
    clearAllParents($view, viewId);
    clearUnifiedField($view, viewId);
  }

  // ======================
  // BINDING
  // ======================
  function bind(viewId) {
    const $view = $viewRoot(viewId);
    if (!$view.length) return;

    safeHideUnifiedField($view);

    const sync = debounce(() => setUnifiedFromParents($view, viewId), 80);

    // ✅ RESET: when bucket changes, clear ALL parent product fields AND unified
    if (CONFIG.RESET_ON_FIELD) {
      const $bucket = getSelect($view, viewId, CONFIG.RESET_ON_FIELD);
      if ($bucket.length) {
        $bucket
          .off(`change${EVENT_NS}-reset`)
          .on(`change${EVENT_NS}-reset`, function () {
            clearParentsAndUnified($view, viewId);

            // optional: one more pass to ensure unified stays cleared
            // (since parents are now empty, sync will clear unified anyway)
            sync();
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
