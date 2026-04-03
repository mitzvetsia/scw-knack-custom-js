////*************** DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3544', 'view_3619', 'view_3627']; // add more views
  const BUCKET_FIELD_KEY = 'field_2223';
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID = 'scw-bucket-visibility-css-survey-bid';

  // Assumptions bucket: field_2210 only visible when field_2248 = "Custom Assumption"
  const ASSUMPTIONS_BUCKET_ID = '697b7a023a31502ec68b3303';
  const CUSTOM_ASSUMPTION_RECORD = '69ce7098172caa5786d3767d';
  const ASSUMPTION_TYPE_FIELD = 'field_2248';
  const ASSUMPTION_DESC_FIELD = 'field_2210';

  // Readable mapping
  const BUCKET_RULES_HUMAN = {
    //cameras or readers
    '6481e5ba38f283002898113c': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2211', 'REL_mdf-idf_mandatory single select'],
      ['field_2193', 'REL_products_cameras+cabling'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2241', 'INPUT_DROP: Pre-fix'],
      ['field_2184', 'INPUT_DROP: label number'],
      ['field_2462', 'FLAG_use existing cabling'],
      ['field_2187', 'INPUT_DROP: variables'],
      ['field_2432', 'INPUT_survey notes'],
      ['field_2233', 'INPUT_expected sub bid #'],
      ['field_2246', 'REL_unified product field'],
    ],
    //networking or headend
    '647953bb54b4e1002931ed97': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2180', 'REL_mdf-idf_mandatory multi select'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2194', 'REL_products_for networking'],
      ['field_2233', 'INPUT_expected sub bid #'],
      ['field_2432', 'INPUT_survey notes'],
    ],
    //other equipment
    '5df12ce036f91b0015404d78': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2195', 'REL_products_for other equipment'],
      ['field_2233', 'INPUT_expected sub bid #'],
      ['field_2432', 'INPUT_survey notes'],
      ['field_2246', 'REL_unified product field'],
      ['field_2183', 'INPUT_product quantity'],
    ],
    //service
    '6977caa7f246edf67b52cbcd': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2233', 'INPUT_expected sub bid #'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2210', 'INPUT_service description'],
      ['field_2432', 'INPUT_survey notes'],
    ],
    //assumptions
    '697b7a023a31502ec68b3303': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2432', 'INPUT_survey notes'],
      ['field_2248', 'INPUT_assumptions'],
    ],
    //licenses
    '645554dce6f3a60028362a6a': [
      ['field_2427', 'REL_bid'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2224', 'REL_products for licenses'],
    ],
  };

  const ALL_FIELD_KEYS = [
    'field_2427','field_2180','field_2194','field_2183','field_2210','field_2224','field_2248','field_2250','field_2432','field_2181','field_2462',
    'field_2206','field_2195','field_2241','field_2184','field_2187','field_2211','field_2233','field_2246',
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

  function getFieldValue($scope, viewId, fieldKey) {
    let $sel = $scope.find('#' + viewId + '-' + fieldKey);
    if (!$sel.length) $sel = $scope.find('select[name="' + fieldKey + '"]');
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, viewId) {
    const bucketValue = getBucketValue($scope, viewId);

    hideAllExceptBucket($scope);
    if (!bucketValue) return;

    (BUCKET_RULES[bucketValue] || []).forEach((k) => showField($scope, k));

    // Assumptions bucket: show field_2210 only when field_2248 = Custom Assumption
    if (bucketValue === ASSUMPTIONS_BUCKET_ID) {
      var typeVal = getFieldValue($scope, viewId, ASSUMPTION_TYPE_FIELD);
      if (typeVal === CUSTOM_ASSUMPTION_RECORD) {
        showField($scope, ASSUMPTION_DESC_FIELD);
      } else {
        hideField($scope, ASSUMPTION_DESC_FIELD);
      }
    }
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

    // Re-evaluate when assumption type field changes
    const typeSel = `#${viewId} select[name="${ASSUMPTION_TYPE_FIELD}"], #${viewId} #${viewId}-${ASSUMPTION_TYPE_FIELD}`;

    $(document)
      .off('change' + EVENT_NS + '-type', typeSel)
      .on('change' + EVENT_NS + '-type', typeSel, function () {
        const $scope = $(this).closest('form, .kn-form, .kn-view').length
          ? $(this).closest('form, .kn-form, .kn-view')
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


