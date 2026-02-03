////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3329']; // add more views
  const BUCKET_FIELD_KEY = 'field_2223';
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID = 'scw-bucket-visibility-css';

  // Readable mapping
  const BUCKET_RULES_HUMAN = {
    //cameras or readers
    '6481e5ba38f283002898113c': [
      ['field_2182', 'REL_scope of work'],
      ['field_2211', 'REL_mdf-idf_required'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2193', 'REL_products_cameras+cabling'],
      ['field_2206', 'REL_product accessories'],
      ['field_2241', 'INPUT_DROP: Pre-fix'],
      ['field_2184', 'INPUT_DROP: label number'],
      ['field_2186', 'INPUT_DROP: mount_cable_both'],
      ['field_2187', 'INPUT_DROP: variables'],
    ],
    //networking or headend
    '647953bb54b4e1002931ed97': [
      ['field_2182', 'REL_scope of work'],
      ['field_2211', 'REL_mdf-idf_required'],
      ['field_2194', 'REL_products_for networking'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2206', 'REL_product accessories'],
    ],
    //other equipment
    '5df12ce036f91b0015404d78': [
      ['field_2182', 'REL_scope of work'],
      ['field_2211', 'REL_mdf-idf_required'],
      ['field_2195', 'REL_products_for other equipment'],
      ['field_2183', 'INPUT_product quantity'],
    ],
    //service
    '6977caa7f246edf67b52cbcd': [
      ['field_2182', 'REL_scope of work'],
      ['field_2180', 'REL_mdf-idf_optional'],
      ['field_2233', 'INPUT_exepcted sub bid #'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2210', 'INPUT_service description'],
    ],
    //assumptions
    '6977ad1234ba695a17190963': [
      ['field_2182', 'REL_scope of work'],
      ['field_2204', 'REL_assumptions'],
    ],
    //licenses
    '645554dce6f3a60028362a6a': [
      ['field_2182', 'REL_scope of work'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2224', 'REL_products for licenses'],
    ],
  };

  const ALL_FIELD_KEYS = [
    'field_2182','field_2180','field_2188','field_2193','field_2194','field_2183','field_2210','field_2224',
    'field_2206','field_2195','field_2241','field_2184','field_2186','field_2187','field_2204', 'field_2211','field_2233',
  ];

  function compileRules(human) {
    const out = {};
    Object.keys(human || {}).forEach((bucket) => {
      out[bucket] = (human[bucket] || [])
        .map((x) => (Array.isArray(x) ? x[0] : x))
        .filter(Boolean);
    });
    return out;
  }
  const BUCKET_RULES = compileRules(BUCKET_RULES_HUMAN);

  // ============================================================
  // ✅ EARLY CSS: inject immediately so there’s no initial “flash”
  // ============================================================
  function injectGlobalCssOnce() {
    let el = document.getElementById(CSS_ID);
    if (el) return;

    el = document.createElement('style');
    el.id = CSS_ID;

    // Hide all fields inside the target views immediately.
    // Then only show ones marked scw-visible, plus the bucket input failsafe.
    const blocks = VIEW_IDS.map((viewId) => `
#${viewId} .kn-input { display: none !important; }
#${viewId} .kn-input.scw-visible { display: block !important; }
#${viewId} #kn-input-${BUCKET_FIELD_KEY} { display: block !important; } /* bucket always visible */
    `.trim()).join('\n\n');

    el.appendChild(document.createTextNode('\n' + blocks + '\n'));
    document.head.appendChild(el);
  }

  // Run ASAP (before Knack paints the view)
  injectGlobalCssOnce();

  // ======================
  // DOM helpers
  // ======================
  function $wrapForKeyWithinScope($scope, key) {
    let $w = $scope.find('#kn-input-' + key);
    if ($w.length) return $w;

    $w = $scope.find('.kn-input[data-input-id="' + key + '"]');
    if ($w.length) return $w;

    return $();
  }

  function hideField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.removeClass('scw-visible');
  }

  function showField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.addClass('scw-visible');
  }

  function hideAllExceptBucket($scope) {
    ALL_FIELD_KEYS.forEach((k) => {
      if (k === BUCKET_FIELD_KEY) return;
      hideField($scope, k);
    });
    showField($scope, BUCKET_FIELD_KEY);
  }

  function findBucketSelectInScope($scope, viewId) {
    let $sel = $scope.find('#' + viewId + '-' + BUCKET_FIELD_KEY);
    if ($sel.length) return $sel;
    return $scope.find('select[name="' + BUCKET_FIELD_KEY + '"]');
  }

  function getBucketValue($scope, viewId) {
    const $sel = findBucketSelectInScope($scope, viewId);
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, viewId) {
    const bucketValue = getBucketValue($scope, viewId);

    hideAllExceptBucket($scope);
    if (!bucketValue) return;

    (BUCKET_RULES[bucketValue] || []).forEach((k) => showField($scope, k));
  }

  // ======================
  // Binding strategy
  // ======================
  function bindDelegatedChange(viewId) {
    const sel = `#${viewId} select[name="${BUCKET_FIELD_KEY}"], #${viewId} #${viewId}-${BUCKET_FIELD_KEY}`;

    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $bucketWrap = $(this).closest('.kn-input');
        const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
          ? $bucketWrap.closest('form, .kn-form, .kn-view')
          : $('#' + viewId);

        applyRules($scope, viewId);
      });
  }

  function initView(viewId) {
    bindDelegatedChange(viewId);

    const $view = $('#' + viewId);
    const $bucketWrap = $view.find('#kn-input-' + BUCKET_FIELD_KEY);
    const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
      ? $bucketWrap.closest('form, .kn-form, .kn-view')
      : $view;

    applyRules($scope, viewId);
  }

  VIEW_IDS.forEach((viewId) => {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        initView(viewId);
      });
  });
})();

////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////





(function () {
  "use strict";

  // ============================================================
  // CONFIG (multi-scene / multi-view ready)
  // ============================================================
  const CONFIG = [
    {
      scenes: ["any"],            // or ["scene_123", "scene_456"]
      viewIds: ["view_XXXX"],     // <-- put your form view id(s) here
      parentFieldKeys: ["field_2193", "field_2194", "field_2195"],
      unifiedFieldKey: "field_2246",
    },
  ];

  const EVENT_NS = ".scwUnifiedProducts";

  // ============================================================
  // Helpers
  // ============================================================
  function sceneMatches(sceneKey, allowed) {
    return !allowed || !allowed.length || allowed.includes("any") || allowed.includes(sceneKey);
  }

  function getSelectEl($scope, fieldKey) {
    // Typical: #field_#### exists
    // Fallbacks cover some Knack render variants
    return $scope
      .find(`#${fieldKey}, select[name='${fieldKey}'], .kn-input-${fieldKey} select`)
      .first();
  }

  function asArray(val) {
    if (!val) return [];
    return Array.isArray(val) ? val.filter(Boolean) : [val].filter(Boolean);
  }

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  function sameSet(a, b) {
    const A = uniq(asArray(a)).sort();
    const B = uniq(asArray(b)).sort();
    if (A.length !== B.length) return false;
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return false;
    return true;
  }

  // ============================================================
  // Core
  // ============================================================
  function computeUnifiedIds($view, cfg) {
    const ids = cfg.parentFieldKeys.flatMap((fk) => {
      const $sel = getSelectEl($view, fk);
      return asArray($sel.val());
    });
    return uniq(ids);
  }

  function setUnifiedFieldValue($view, cfg, unifiedIds) {
    const $unified = getSelectEl($view, cfg.unifiedFieldKey);
    if (!$unified.length) return;

    // Prevent endless change loops
    if ($unified.data("scw-setting")) return;

    // Determine if unified select is multi or single
    const isMulti = $unified.prop("multiple");

    // If nothing selected: for multi use [], for single use ""
    const nextVal = isMulti ? unifiedIds : (unifiedIds[0] || "");

    // If unchanged, do nothing
    if (sameSet($unified.val(), nextVal)) return;

    $unified.data("scw-setting", 1);
    $unified.val(nextVal).trigger("change");
    $unified.data("scw-setting", 0);
  }

  function syncUnifiedField($view, cfg) {
    const unifiedIds = computeUnifiedIds($view, cfg);
    setUnifiedFieldValue($view, cfg, unifiedIds);
  }

  // Wait until unified field has options loaded (Knack can populate later),
  // then set value. This avoids the “value won’t stick because option isn’t in DOM yet” problem.
  function syncWithRetry($view, cfg, attemptsLeft) {
    const $unified = getSelectEl($view, cfg.unifiedFieldKey);
    if (!$unified.length) return;

    const unifiedIds = computeUnifiedIds($view, cfg);
    if (!unifiedIds.length) {
      setUnifiedFieldValue($view, cfg, unifiedIds);
      return;
    }

    // Check whether the unified select currently has all needed option values.
    // If not, retry shortly (Knack often injects options after render / after filters resolve).
    const optionVals = new Set($unified.find("option").map((_, o) => $(o).attr("value")).get().filter(Boolean));
    const missing = unifiedIds.some((id) => !optionVals.has(id));

    if (!missing) {
      setUnifiedFieldValue($view, cfg, unifiedIds);
      return;
    }

    if (attemptsLeft <= 0) {
      // Failsafe: still attempt; if Knack rejects, at least we tried
      setUnifiedFieldValue($view, cfg, unifiedIds);
      return;
    }

    setTimeout(() => syncWithRetry($view, cfg, attemptsLeft - 1), 150);
  }

  // ============================================================
  // Wire-up
  // ============================================================
  CONFIG.forEach((cfg) => {
    cfg.viewIds.forEach((viewId) => {
      $(document).on(`knack-view-render.${viewId}${EVENT_NS}`, function () {
        const sceneKey = (Knack.router && Knack.router.scene_key) || "";
        if (!sceneMatches(sceneKey, cfg.scenes)) return;

        const $view = $(`#${viewId}`);
        if (!$view.length) return;

        // Bind changes on all parent fields
        cfg.parentFieldKeys.forEach((fk) => {
          const $sel = getSelectEl($view, fk);
          if (!$sel.length) return;

          $sel.off(`change${EVENT_NS}`).on(`change${EVENT_NS}`, function () {
            // Use retry because the unified field options may be filtered / async-loaded
            syncWithRetry($view, cfg, 12);
          });
        });

        // Initial sync on render (edit forms / prefilled values)
        syncWithRetry($view, cfg, 12);
      });
    });
  });
})();

