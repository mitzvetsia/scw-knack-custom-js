////************* SCW: FORM BUCKET → FIELD VISIBILITY (KTL rebuild-proof) *************////
(function () {
  'use strict';

  // ============================================================
  // CONFIG (multi-form ready)
  // ============================================================
  const EVENT_NS = '.scwBucketRules';
  const OBS_NS   = '.scwBucketRulesObserver';

  const FORMS = [
    {
      viewKey: 'view_466',
      bucketFieldKey: 'field_133',

      bucketRulesHuman: {

//cameras or readers
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
        ],

//networking or headend
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

//other equipment
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
        ],

//mounting hardware
        '594a94536877675816984cb9': [
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

//other services
        '6977caa7f246edf67b52cbcd': [],

//assumptions
        '697b7a023a31502ec68b3303': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_2021','INPUT_default labor description'],
        ],

//licenses
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

  function viewRoots(cfg) {
    // We will re-init against BOTH the Knack view and the KTL wrapper.
    // KTL can move/rebuild the form, so we treat either as valid roots.
    return [
      `#${cfg.viewKey}`,
      `.hideShow_${cfg.viewKey}`,
    ];
  }

  function findActiveScopes(cfg) {
    const roots = viewRoots(cfg).join(',');
    const $roots = $(roots);

    // Prefer a real <form> if present. Return 0..n scopes (because KTL may duplicate briefly).
    const scopes = [];
    $roots.each(function () {
      const $root = $(this);
      const $forms = $root.find('form');
      if ($forms.length) {
        $forms.each(function () { scopes.push($(this)); });
      } else if ($root.find('.kn-input').length) {
        scopes.push($root);
      }
    });

    // De-dupe by DOM node
    const seen = new Set();
    return scopes.filter(($s) => {
      const el = $s.get(0);
      if (!el || seen.has(el)) return false;
      seen.add(el);
      return true;
    });
  }

  function $wrap($scope, key) {
    // Works in your DOM (id="kn-input-field_35", data-input-id="field_35")
    let $w = $scope.find('#kn-input-' + key);
    if ($w.length) return $w;
    $w = $scope.find('.kn-input[data-input-id="' + key + '"]');
    if ($w.length) return $w;
    return $();
  }

  // ============================================================
  // HARD OVERRIDE VISIBILITY (inline style)
  // ============================================================
  function forceHide($scope, key) {
    const $w = $wrap($scope, key);
    if ($w.length) $w.css('display', 'none');
  }

  function forceShow($scope, key) {
    const $w = $wrap($scope, key);
    if ($w.length) $w.css('display', '');
  }

  function hideAllExceptBucket($scope, cfg) {
    (cfg.allFieldKeys || []).forEach((k) => {
      if (k === cfg.bucketFieldKey) return;
      forceHide($scope, k);
    });
    forceShow($scope, cfg.bucketFieldKey);
  }

  function findBucketSelect($scope, cfg) {
    // Underlying select (hidden by Chosen) is still there and has the value (you confirmed .val() works).
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

  function applyRulesToScope($scope, cfg) {
    const bucketValue = getBucketValue($scope, cfg);

    hideAllExceptBucket($scope, cfg);
    if (!bucketValue) return;

    const keys = cfg._compiledRules[bucketValue] || [];
    keys.forEach((k) => forceShow($scope, k));
  }

  // ============================================================
  // BINDINGS (delegated + chosen-safe)
  // ============================================================
  function bindChangeHandlers(cfg) {
    const roots = viewRoots(cfg).join(', ');
    const sel = `${roots} select[name="${cfg.bucketFieldKey}"], ${roots} #${cfg.viewKey}-${cfg.bucketFieldKey}`;

    // Underlying select change
    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $scopes = findActiveScopes(cfg);
        $scopes.forEach(($s) => applyRulesToScope($s, cfg));
      });

    // Chosen UI clicks can change value without firing a normal change immediately in some setups.
    // Re-apply after user interacts with the chosen container.
    $(document)
      .off('click' + EVENT_NS, `${roots} #${cfg.viewKey}_${cfg.bucketFieldKey}_chzn, ${roots} #${cfg.viewKey}_${cfg.bucketFieldKey}_chzn *`)
      .on('click' + EVENT_NS, `${roots} #${cfg.viewKey}_${cfg.bucketFieldKey}_chzn, ${roots} #${cfg.viewKey}_${cfg.bucketFieldKey}_chzn *`, function () {
        setTimeout(function () {
          const $scopes = findActiveScopes(cfg);
          $scopes.forEach(($s) => applyRulesToScope($s, cfg));
        }, 0);
      });
  }

  // ============================================================
  // INIT + RE-INIT (handles KTL “rebuild/move”)
  // ============================================================
  function initEverywhere(cfg) {
    if (!cfg._compiledRules) cfg._compiledRules = compileRules(cfg.bucketRulesHuman || {});
    bindChangeHandlers(cfg);

    const $scopes = findActiveScopes(cfg);
    if (!$scopes.length) return;

    $scopes.forEach(($s) => {
      applyRulesToScope($s, cfg);

      // KTL / Chosen / persistent forms: value can settle a beat later
      setTimeout(() => applyRulesToScope($s, cfg), 50);
      setTimeout(() => applyRulesToScope($s, cfg), 250);
      setTimeout(() => applyRulesToScope($s, cfg), 800);
    });
  }

  // ============================================================
  // MutationObserver: re-run when KTL rebuilds or moves nodes
  // ============================================================
  function installObservers() {
    // Single observer for the whole document (cheap enough)
    const target = document.body;
    if (!target) return;

    // Avoid double-install
    if (window.__scwBucketRulesObserverInstalled) return;
    window.__scwBucketRulesObserverInstalled = true;

    const obs = new MutationObserver(function (mutations) {
      // Only act if something relevant was added/removed
      for (const m of mutations) {
        if (!m.addedNodes || !m.addedNodes.length) continue;

        // If any mutation touches our view or KTL wrapper, re-init.
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;

          // quick checks (fast)
          if (node.id && typeof node.id === 'string' && node.id.startsWith('view_')) {
            FORMS.forEach(initEverywhere);
            return;
          }
          if (node.classList && [...node.classList].some((c) => c.startsWith('hideShow_view_'))) {
            FORMS.forEach(initEverywhere);
            return;
          }

          // deeper check: if it contains our view
          if (node.querySelector && (node.querySelector('#view_466') || node.querySelector('.hideShow_view_466'))) {
            FORMS.forEach(initEverywhere);
            return;
          }
        }
      }
    });

    obs.observe(target, { childList: true, subtree: true });

    // store for debugging if needed
    window.__scwBucketRulesObserver = obs;
  }

  // ============================================================
  // Hooks
  // ============================================================
  FORMS.forEach((cfg) => {
    $(document)
      .off('knack-view-render.' + cfg.viewKey + EVENT_NS)
      .on('knack-view-render.' + cfg.viewKey + EVENT_NS, function () {
        initEverywhere(cfg);
      });
  });

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      FORMS.forEach(initEverywhere);
    });

  // KTL toggles can rebuild without a Knack re-render
  $(document)
    .off('click' + EVENT_NS, '#hideShow_view_466_button, #hideShow_view_466_shrink_link')
    .on('click' + EVENT_NS, '#hideShow_view_466_button, #hideShow_view_466_shrink_link', function () {
      setTimeout(() => FORMS.forEach(initEverywhere), 50);
    });

  // Boot
  installObservers();
  $(function () { FORMS.forEach(initEverywhere); });
  setTimeout(() => FORMS.forEach(initEverywhere), 250);
  setTimeout(() => FORMS.forEach(initEverywhere), 1000);
})();
////************* /SCW: FORM BUCKET → FIELD VISIBILITY *************////
