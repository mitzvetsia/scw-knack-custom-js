////************* SCW: FORM BUCKET → FIELD VISIBILITY (Knack + KTL safe) *************////
/**
 * What this fixes (everywhere):
 *  - Works whether the view root is #view_466 (normal Knack) OR a KTL wrapper like .hideShow_view_466
 *  - CSS no-flash works for both root types
 *  - Change bindings work even if KTL wraps/moves the form
 *  - Scope detection is resilient (section/form/.kn-view)
 *
 * Add more views/pages by adding more entries to FORMS[] (supports multiple).
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG (multi-form ready)
  // ============================================================
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID   = 'scw-bucket-visibility-css';

  const FORMS = [
    {
      viewKey: 'view_466',
      bucketFieldKey: 'field_133',

      // Readable mapping (your existing rules)
      bucketRulesHuman: {
        // cameras or readers
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
          // install relevant
          ['field_2021', 'INPUT_default labor description'],
          ['field_2166', 'INPUT_default sub bid'],
          ['field_1517', 'INPUT_default installation hours'],
          ['field_2220', 'FLAG_deliverables schema'],
          ['field_2232', 'FLAG: map incoming camera or reader connections'],
          ['field_2242', 'FLAG_limit to quantity 1'],
        ],

        // networking or headend
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
          // install relevant
          ['field_2021', 'INPUT_default labor description'],
          ['field_2166', 'INPUT_default sub bid'],
          ['field_1517', 'INPUT_default installation hours'],
          ['field_2220', 'FLAG_deliverables schema'],
          ['field_2232', 'FLAG: map incoming camera or reader connections'],
          ['field_2242', 'FLAG_limit to quantity 1'],
        ],

        // other equipment
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
          // install relevant
          ['field_2021', 'INPUT_default labor description'],
          ['field_2166', 'INPUT_default sub bid'],
          ['field_1517', 'INPUT_default installation hours'],
          ['field_2220', 'FLAG_deliverables schema'],
          ['field_2232', 'FLAG: map incoming camera or reader connections'],
          ['field_2242', 'FLAG_limit to quantity 1'],
        ],

        // service
        '6977caa7f246edf67b52cbcd': [
          // (intentionally empty per your rules)
        ],

        // assumptions
        '697b7a023a31502ec68b3303': [
          ['field_133',  'REL_equipment bucket'],
          ['field_956',  'FLAG_product status'],
          ['field_1563', 'FLAG_type of system'],
          ['field_35',   'INPUT_product name'],
          // install relevant
          ['field_2021', 'INPUT_default labor description'],
        ],

        // licenses
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
      },

      // All field keys in the form (used for hide-all baseline)
      allFieldKeys: [
        'field_35','field_56','field_57','field_2021','field_133','field_146','field_2166','field_956','field_1926','field_2232',
        'field_2242','field_1562','field_2205','field_2236','field_974','field_2220','field_1655','field_1563','field_1841','field_74',
        'field_1667','field_1554','field_1582','field_1754','field_1755','field_1909','field_1928','field_1517','field_2075','field_2249',
      ],
    },

    // ✅ Add more pages/views like this:
    // { viewKey:'view_XXXX', bucketFieldKey:'field_YYYY', bucketRulesHuman:{...}, allFieldKeys:[...] },
  ];

  // ============================================================
  // Helpers
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

  // “View root” selectors that cover:
  //  - Normal Knack: #view_466
  //  - KTL wrapper: .hideShow_view_466
  //  - Occasional variants: [data-view-key="view_466"]
  function rootSelectorsFor(viewKey) {
    return [
      `#${viewKey}`,
      `.hideShow_${viewKey}`,
      `[data-view-key="${viewKey}"]`,
      // sometimes KTL/other wrappers include view key as class:
      `.${viewKey}`,
    ];
  }

  function resolveRoots(viewKey) {
    const sels = rootSelectorsFor(viewKey);
    const $roots = $(sels.join(',')).filter(function () {
      // keep only roots that actually contain inputs for this view render
      return $(this).find('.kn-input, form').length > 0;
    });
    return $roots;
  }

  function pickScope($root) {
    // Prefer the actual form element when present
    const $form = $root.find('form').first();
    if ($form.length) return $form;

    // Otherwise, something reasonable
    const $scope = $root.closest('section, .kn-view, .kn-form');
    return $scope.length ? $scope : $root;
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

  function findBucketSelectInScope($scope, cfg) {
    // In your DOM: id="view_466-field_133" and name="field_133"
    let $sel = $scope.find('#' + cfg.viewKey + '-' + cfg.bucketFieldKey);
    if ($sel.length) return $sel;

    $sel = $scope.find('select[name="' + cfg.bucketFieldKey + '"]');
    if ($sel.length) return $sel;

    // fallback: hidden connection input exists too, but select is what we want
    return $();
  }

  function getBucketValue($scope, cfg) {
    const $sel = findBucketSelectInScope($scope, cfg);
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, cfg) {
    const bucketValue = getBucketValue($scope, cfg);

    hideAllExceptBucket($scope, cfg);
    if (!bucketValue) return;

    const rules = cfg._bucketRulesCompiled || {};
    (rules[bucketValue] || []).forEach((k) => showField($scope, k));
  }

  // ============================================================
  // ✅ EARLY CSS (no flash) — covers normal + KTL wrappers
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
  // Binding (delegated, resilient)
  // ============================================================
  function bindDelegatedChange(cfg) {
    const roots = rootSelectorsFor(cfg.viewKey).join(', ');
    const sel = `${roots} select[name="${cfg.bucketFieldKey}"], ${roots} #${cfg.viewKey}-${cfg.bucketFieldKey}`;

    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $root = $(this).closest(roots);
        const $scope = $root.length ? pickScope($root) : $(this).closest('form, section, .kn-form, .kn-view');
        applyRules($scope, cfg);
      });
  }

  function initViewEverywhere(cfg) {
    // compile once
    if (!cfg._bucketRulesCompiled) cfg._bucketRulesCompiled = compileRules(cfg.bucketRulesHuman || {});

    bindDelegatedChange(cfg);

    // apply to all discovered roots (normal + KTL)
    const $roots = resolveRoots(cfg.viewKey);
    if (!$roots.length) return;

    $roots.each(function () {
      const $root = $(this);
      const $scope = pickScope($root);
      applyRules($scope, cfg);
    });
  }

  // ============================================================
  // Wire up to Knack render events (works in modal/page/KTL)
  // ============================================================
  FORMS.forEach((cfg) => {
    $(document)
      .off('knack-view-render.' + cfg.viewKey + EVENT_NS)
      .on('knack-view-render.' + cfg.viewKey + EVENT_NS, function () {
        initViewEverywhere(cfg);
      });
  });

  // ============================================================
  // Extra safety: if KTL shrink/expand toggles DOM without a re-render,
  // re-apply rules after clicking the shrink link.
  // ============================================================
  $(document)
    .off('click' + EVENT_NS, 'a.ktlShrinkLink')
    .on('click' + EVENT_NS, 'a.ktlShrinkLink', function () {
      // small delay so KTL can finish toggling
      setTimeout(function () {
        FORMS.forEach(initViewEverywhere);
      }, 50);
    });
})();
////************* /SCW: FORM BUCKET → FIELD VISIBILITY *************////
