////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_466']; // add more views
  const BUCKET_FIELD_KEY = 'field_133';
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID = 'scw-bucket-visibility-css';

  // Readable mapping
  const BUCKET_RULES_HUMAN = {
    //cameras or readers
    '6481e5ba38f283002898113c': [
	['field_133',  'REL_equipment bucket'],
	['field_956',  'FLAG_product status'],
	['field_1563', 'FLAG_type of system'],
	['field_35',   'INPUT_product name'],
	['field_56',   'INPUT_sku'],
	['field_57',   'INPUT_description'],
	['field_74',   'INPUT_default quantity'],
	['field_146',  'INPUT_retail price'],
	['field_1562', 'FLAG_eligible for discount'],
	['field_1926', 'INPUT_source'],
	//install relevant
	['field_2021', 'INPUT_default labor description'],
	['field_2166', 'INPUT_default sub bid'],
	['field_1517', 'INPUT_default installation hours'],
	['field_2220', 'FLAG_deliverables schema'],
	['field_2232', 'FLAG: map incoming camera or reader connections'],
	['field_2242', 'FLAG_limit to quantity 1'],
    ],


    //networking or headend
    '647953bb54b4e1002931ed97': [
	['field_133',  'REL_equipment bucket'],
	['field_956',  'FLAG_product status'],
	['field_1563', 'FLAG_type of system'],
	['field_35',   'INPUT_product name'],
	['field_56',   'INPUT_sku'],
	['field_57',   'INPUT_description'],
	['field_74',   'INPUT_default quantity'],
	['field_146',  'INPUT_retail price'],
	['field_1562', 'FLAG_eligible for discount'],
	['field_1926', 'INPUT_source'],
	//install relevant
	['field_2021', 'INPUT_default labor description'],
	['field_2166', 'INPUT_default sub bid'],
	['field_1517', 'INPUT_default installation hours'],
	['field_2220', 'FLAG_deliverables schema'],
	['field_2232', 'FLAG: map incoming camera or reader connections'],
	['field_2242', 'FLAG_limit to quantity 1'],
    ],
    ],
    //other equipment
    '5df12ce036f91b0015404d78': [
	['field_133',  'REL_equipment bucket'],
	['field_956',  'FLAG_product status'],
	['field_1563', 'FLAG_type of system'],
	['field_35',   'INPUT_product name'],
	['field_56',   'INPUT_sku'],
	['field_57',   'INPUT_description'],
	['field_74',   'INPUT_default quantity'],
	['field_146',  'INPUT_retail price'],
	['field_1562', 'FLAG_eligible for discount'],
	['field_1926', 'INPUT_source'],
	//install relevant
	['field_2021', 'INPUT_default labor description'],
	['field_2166', 'INPUT_default sub bid'],
	['field_1517', 'INPUT_default installation hours'],
	['field_2220', 'FLAG_deliverables schema'],
	['field_2232', 'FLAG: map incoming camera or reader connections'],
	['field_2242', 'FLAG_limit to quantity 1'],
    ],
    //service
    '6977caa7f246edf67b52cbcd': [
    ],
    //assumptions
    '697b7a023a31502ec68b3303': [
	['field_133',  'REL_equipment bucket'],
	['field_956',  'FLAG_product status'],
	['field_1563', 'FLAG_type of system'],
	['field_35',   'INPUT_product name'],

	//install relevant
	['field_2021', 'INPUT_default labor description'],
    ],
    //licenses
    '645554dce6f3a60028362a6a': [
	['field_133',  'REL_equipment bucket'],
	['field_956',  'FLAG_product status'],
	['field_1563', 'FLAG_type of system'],
	['field_35',   'INPUT_product name'],
	['field_56',   'INPUT_sku'],
	['field_57',   'INPUT_description'],
	['field_74',   'INPUT_default quantity'],
	['field_146',  'INPUT_retail price'],
	['field_1562', 'FLAG_eligible for discount'],
	['field_1926', 'INPUT_source'],

    ],
  };

const ALL_FIELD_KEYS = [
  'field_35','field_56','field_57','field_2021','field_133','field_146','field_2166','field_956','field_1926','field_2232','field_2242','field_1562','field_2205','field_2236','field_974','field_2220','field_1655','field_1563','field_1841','field_74','field_1667','field_1554','field_1582','field_1754','field_1755','field_1909','field_1928','field_1517','field_2075','field_2249',
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


