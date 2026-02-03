////************* SCW: FORM BUCKET → FIELD VISIBILITY (KTL + persistent safe) *************////
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID   = 'scw-bucket-visibility-css';

  const FORMS = [
    {
      viewKey: 'view_466',
      bucketFieldKey: 'field_133',

      bucketRulesHuman: {
        '6481e5ba38f283002898113c': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_56','INPUT_sku'],
          ['field_57','INPUT_description'],
          ['field_74','INPUT_default quantity'],
          ['field_146','INPUT_retail price'],
          ['field_1562','FLAG_eligible for discount'],
          ['field_1926','INPUT_source'],
          ['field_2021','INPUT_default labor description'],
          ['field_2166','INPUT_default sub bid'],
          ['field_1517','INPUT_default installation hours'],
          ['field_2220','FLAG_deliverables schema'],
          ['field_2232','FLAG: map incoming camera or reader connections'],
          ['field_2242','FLAG_limit to quantity 1'],
        ],

        '647953bb54b4e1002931ed97': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_56','INPUT_sku'],
          ['field_57','INPUT_description'],
          ['field_74','INPUT_default quantity'],
          ['field_146','INPUT_retail price'],
          ['field_1562','FLAG_eligible for discount'],
          ['field_1926','INPUT_source'],
          ['field_2021','INPUT_default labor description'],
          ['field_2166','INPUT_default sub bid'],
          ['field_1517','INPUT_default installation hours'],
          ['field_2220','FLAG_deliverables schema'],
          ['field_2232','FLAG: map incoming camera or reader connections'],
          ['field_2242','FLAG_limit to quantity 1'],
        ],

        '5df12ce036f91b0015404d78': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_56','INPUT_sku'],
          ['field_57','INPUT_description'],
          ['field_74','INPUT_default quantity'],
          ['field_146','INPUT_retail price'],
          ['field_1562','FLAG_eligible for discount'],
          ['field_1926','INPUT_source'],
          ['field_2021','INPUT_default labor description'],
          ['field_2166','INPUT_default sub bid'],
          ['field_1517','INPUT_default installation hours'],
          ['field_2220','FLAG_deliverables schema'],
          ['field_2232','FLAG: map incoming camera or reader connections'],
          ['field_2242','FLAG_limit to quantity 1'],
        ],

        '6977caa7f246edf67b52cbcd': [
          // intentionally empty
        ],

        '697b7a023a31502ec68b3303': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_2021','INPUT_default labor description'],
        ],

        '645554dce6f3a60028362a6a': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_56','INPUT_sku'],
          ['field_57','INPUT_description'],
          ['field_74','INPUT_default quantity'],
          ['field_146','INPUT_retail price'],
          ['field_1562','FLAG_eligible for discount'],
          ['field_1926','INPUT_source'],
        ],
      },

      allFieldKeys: [
        'field_35','field_56','field_57','field_2021','field_133','field_146','field_2166','field_956','field_1926','field_2232',
        'field_2242','field_1562','field_2205','field_2236','field_974','field_2220','field_1655','field_1563','field_1841','field_74',
        'field_1667','field_1554','field_1582','field_1754','field_1755','field_1909','field_1928','field_1517','field_2075','field_2249',
      ],
    },
  ];

  // ============================================================
  // Utilities
  // ============================================================
  function compileRules(human) {
    const out = {};
    Object.keys(human || {}).forEach((bucket) => {
      out[bucket] = (human[bucket] || [])
        .map((x) => (Array.isArray(x) ? x[0] : x))
        .filter(Boolean);
    });
    return out;
  }

  function rootSelectorsFor(viewKey) {
    // In your DOM you have BOTH:
    //   <div class="kn-form ... view_466" id="view_466">
    //   <section class="hideShow_view_466 ...">
    return [
      `#${viewKey}`,
      `.hideShow_${viewKey}`,
      `.kn-view.${viewKey}`, // extra safety
    ];
  }

  function findRoots(cfg) {
    const sels = rootSelectorsFor(cfg.viewKey).join(',');
    return $(sels).filter(function () {
      return $(this).find('#kn-input-' + cfg.bucketFieldKey).length > 0;
    });
  }

  function pickScope($root) {
    // Prefer the form element if present; otherwise operate on the root.
    const $form = $root.find('form').first();
    return $form.length ? $form : $root;
  }

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

  function hideAllExceptBucket($scope, cfg) {
    (cfg.allFieldKeys || []).forEach((k) => {
      if (k === cfg.bucketFieldKey) return;
      hideField($scope, k);
    });
    showField($scope, cfg.bucketFieldKey);
  }

  function findBucketSelect($scope, cfg) {
    // Underlying select (hidden by Chosen) is still the source of truth.
    let $sel = $scope.find('#' + cfg.viewKey + '-' + cfg.bucketFieldKey);
    if ($sel.length) return $sel;

    $sel = $scope.find('select[name="' + cfg.bucketFieldKey + '"]');
    if ($sel.length) return $sel;

    return $();
  }

  function getBucketValue($scope, cfg) {
    const $sel = findBucketSelect($scope, cfg);
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, cfg) {
    const bucketValue = getBucketValue($scope, cfg);

    hideAllExceptBucket($scope, cfg);

    // If bucket isn't set yet (common on first paint), just keep bucket visible.
    if (!bucketValue) return;

    (cfg._compiledRules[bucketValue] || []).forEach((k) => showField($scope, k));
  }

  // ============================================================
  // ✅ EARLY CSS (no flash)
  // ============================================================
  function injectGlobalCssOnce() {
    let el = document.getElementById(CSS_ID);
    if (el) return;

    el = document.createElement('style');
    el.id = CSS_ID;

    const blocks = FORMS.map((cfg) => {
      const roots = rootSelectorsFor(cfg.viewKey).join(', ');
      return `
${roots} .kn-input { display: none !important; }
${roots} .kn-input.scw-visible { display: block !important; }
${roots} #kn-input-${cfg.bucketFieldKey} { display: block !important; } /* bucket always visible */
      `.trim();
    }).join('\n\n');

    el.appendChild(document.createTextNode('\n' + blocks + '\n'));
    document.head.appendChild(el);
  }
  injectGlobalCssOnce();

  // ============================================================
  // Binding (Chosen-safe delegated handler)
  // ============================================================
  function bindDelegatedChange(cfg) {
    const roots = rootSelectorsFor(cfg.viewKey).join(', ');
    const sel = `${roots} select[name="${cfg.bucketFieldKey}"], ${roots} #${cfg.viewKey}-${cfg.bucketFieldKey}`;

    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $root = $(this).closest(roots);
        const $scope = $root.length ? pickScope($root) : $(this).closest('form, .kn-form, .kn-view, section');
        applyRules($scope, cfg);
      });
  }

  // ============================================================
  // “Boot” (runs even if you missed knack-view-render)
  // ============================================================
  function initEverywhere(cfg) {
    if (!cfg._compiledRules) cfg._compiledRules = compileRules(cfg.bucketRulesHuman || {});
    bindDelegatedChange(cfg);

    const $roots = findRoots(cfg);
    if (!$roots.length) return;

    $roots.each(function () {
      const $root = $(this);
      const $scope = pickScope($root);

      // Apply immediately…
      applyRules($scope, cfg);

      // …and again shortly after (covers late Chosen/value set + persistent form quirks)
      setTimeout(() => applyRules($scope, cfg), 50);
      setTimeout(() => applyRules($scope, cfg), 250);
    });
  }

  // ============================================================
  // Hooks
  // ============================================================
  FORMS.forEach((cfg) => {
    // Standard Knack render hook
    $(document)
      .off('knack-view-render.' + cfg.viewKey + EVENT_NS)
      .on('knack-view-render.' + cfg.viewKey + EVENT_NS, function () {
        initEverywhere(cfg);
      });
  });

  // Scene render hook (catches cases where view-render already happened)
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      FORMS.forEach(initEverywhere);
    });

  // Immediate + delayed boots (catches late bundle load / KTL persistent forms)
  $(function () { FORMS.forEach(initEverywhere); });
  setTimeout(() => FORMS.forEach(initEverywhere), 250);
  setTimeout(() => FORMS.forEach(initEverywhere), 1000);

  // KTL shrink/expand can toggle without re-render
  $(document)
    .off('click' + EVENT_NS, '#hideShow_view_466_button, #hideShow_view_466_shrink_link')
    .on('click' + EVENT_NS, '#hideShow_view_466_button, #hideShow_view_466_shrink_link', function () {
      setTimeout(() => FORMS.forEach(initEverywhere), 50);
    });
})();
////************* /SCW: FORM BUCKET → FIELD VISIBILITY testing.... *************////
