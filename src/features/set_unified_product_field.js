////************* DTO: Unified Products (field_2246) from 2193/2194/2195 *************////
(function () {
  "use strict";

  // ======================
  // CONFIG
  // ======================
  const EVENT_NS = ".scwUnifiedProducts";
  const CONFIG = {
    SCENES: [], // e.g. ['scene_123'] or leave [] for all scenes
    VIEWS: ["view_3329","view_3544","view_3451","view_3619","view_3627","view_3748"],

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
    if (CONFIG.DEBUG && window.console) SCW.debug("[scwUnified2246]", ...args);
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

    // The unified <select>'s Chosen UI is hidden off-screen by
    // safeHideUnifiedField (position: absolute; left: -99999px). Calling
    // chosenUpdate on it does a full rebuild proportional to the option
    // count — ensureOptions only ever appends, never removes, so the
    // option list grows for the lifetime of the form. Skip the rebuild
    // when the field is hidden; Knack reads the submitted value from the
    // hidden connection input ($unifiedHidden) anyway, so the Chosen UI
    // is irrelevant.
    const unifiedIsHidden = !!CONFIG.HIDE_UNIFIED_FIELD;

    if (!unionIds.length) {
      const isMulti = isMultiSelect($unifiedSelect);

      // Skip the entire clear path when the unified field is already empty.
      const cur = $unifiedSelect.val();
      const alreadyEmpty = !cur || (Array.isArray(cur) && cur.length === 0);
      if (alreadyEmpty) {
        log("Skipped unified clear (already empty)");
        return;
      }

      const encodedClear = encodeConnValue([], isMulti);
      $unifiedSelect.val(isMulti ? [] : "").trigger("change");
      $unifiedHidden.val(encodedClear).trigger("change");
      if (!unifiedIsHidden) chosenUpdate($unifiedSelect);
      return;
    }

    const unifiedIsMulti = isMultiSelect($unifiedSelect);
    const finalIds = unifiedIsMulti ? unionIds : computeSinglePick(unionIds, $view, viewId);

    ensureOptions($unifiedSelect, idToLabel);

    $unifiedSelect.val(unifiedIsMulti ? finalIds : (finalIds[0] || "")).trigger("change");

    const encoded = encodeConnValue(finalIds, unifiedIsMulti);
    $unifiedHidden.val(encoded).trigger("change");

    if (!unifiedIsHidden) chosenUpdate($unifiedSelect);

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

    // Skip work if the field is already empty. Chosen.js rebuilds are
    // O(N options), so on dropdowns with 200+ products each call costs
    // hundreds of ms. On a bucket change where parents weren't selected
    // yet, this turns the cascade from 4 rebuilds into 0.
    const cur = hasSelect ? $sel.val() : null;
    const alreadyEmpty = !cur || (Array.isArray(cur) && cur.length === 0);
    if (alreadyEmpty) {
      log("Skipped clear (already empty)", fieldKey);
      return;
    }

    const clearedVal = isMulti ? [] : "";
    // Skip Chosen rebuilds for the off-screen unified <select> — its UI
    // is invisible, and the rebuild cost grows with option count
    // (ensureOptions is append-only).
    const isHiddenUnified = (fieldKey === CONFIG.UNIFIED) && !!CONFIG.HIDE_UNIFIED_FIELD;

    if (hasSelect) {
      $sel.val(clearedVal).trigger("change");
      if (!isHiddenUnified) chosenUpdate($sel);
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

    // ✅ RESET: when bucket changes, clear ALL parent product fields AND unified.
    //
    // The clearing cascade is deferred via setTimeout(0) so it runs in a
    // separate task AFTER the browser paints the bucket pick. INP is the
    // worst phase of the interaction's click → next-paint round trip;
    // anything synchronous inside the change handler (or in rAF, which
    // runs *before* paint) lands in that window. setTimeout pushes the
    // Chosen rebuilds on the 3 parent product selects to a later tick so
    // they stop dominating the bucket-pick INP.
    //
    // Why this is safe even though the work is "deferred":
    //   - applyRules in the visibility module (still rAF, runs pre-paint)
    //     immediately hides the parent product fields that aren't part of
    //     the new bucket — so the user never sees stale parent values.
    //   - The unified field is permanently hidden off-screen
    //     (HIDE_UNIFIED_FIELD), so its UI state is invisible to the user.
    //   - The PUT for form-submit reads from the hidden connection input
    //     (which we set synchronously inside the cleared-tick anyway, just
    //     one task later). The form can't be submitted faster than the
    //     setTimeout(0) tick, so submit data stays consistent.
    //
    // A per-view flag coalesces overlapping change events within the
    // same tick (defensive — Chosen normally fires one change per pick).
    if (CONFIG.RESET_ON_FIELD) {
      const $bucket = getSelect($view, viewId, CONFIG.RESET_ON_FIELD);
      if ($bucket.length) {
        const TICK_FLAG = "_scwUnifiedResetPending_" + viewId;
        $bucket
          .off(`change${EVENT_NS}-reset`)
          .on(`change${EVENT_NS}-reset`, function () {
            if ($view[0] && $view[0][TICK_FLAG]) return;
            if ($view[0]) $view[0][TICK_FLAG] = true;
            setTimeout(function () {
              if ($view[0]) $view[0][TICK_FLAG] = false;
              clearParentsAndUnified($view, viewId);
              // One more pass to ensure unified stays cleared. With the
              // already-empty guard in setUnifiedFromParents, this is a
              // no-op once the cascade has settled.
              sync();
            }, 0);
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
