/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 and view_3341 **************************/

(function () {
  // Device-worksheet views are listed here too — Knack's default 25/page
  // hides records that the worksheet renderer never gets to transform,
  // which silently breaks group-collapse and sort. Forcing 1000/page
  // makes the worksheet operate on the complete dataset.
  const VIEW_IDS = [
    // Misc views forced full-page
    'view_3301', 'view_3341', 'view_3550', 'view_3586', 'view_3610', 'view_3896', 'view_3926',
    // worksheet-v2 source view (mirrors view_3610 — same cap rationale)
    'view_3962',
    // All WORKSHEET_CONFIG views from device-worksheet.js
    'view_3313', 'view_3450', 'view_3505', 'view_3512', 'view_3575',
    'view_3596', 'view_3997', 'view_3602', 'view_3608', 'view_3800', 'view_4093',
    // "WHAT WE'RE INSTALLING" worksheet (same install object as view_4093)
    'view_4056',
    // bid-review-v2 SOURCE views. v2 reads these straight off their
    // on-scene Backbone models (Knack.views[k].model.data.models), so a
    // page cap means v2's diff runs on PARTIAL data — e.g. a SOW item
    // whose bid record sits on an unloaded page gets misclassified as
    // "Removed / Not surveyed". v1 loads its own copy via API, but that
    // doesn't bump these on-scene models, so force them here.
    'view_3680', 'view_3921', 'view_3573', 'view_3822', 'view_3818',
    // review-bids DOC_photos delete-plumbing grid (worksheet-v2/photos.js
    // Path 1 clicks kn-link-delete rows in it — full page = every photo's
    // row present in the DOM; the grid itself is hidden by photos.js)
    'view_4098',
    // Change Order scene: CO line items (v2 source), MDF/IDF locations,
    // project install items (removal source), project SOW/proposal items
    // (adoption source). All read whole via the Backbone model.
    'view_4079', 'view_4084', 'view_4086', 'view_4088',
    // Sub portal Manage Change Order page (scene_1374) — 1:1 analogues of
    // the four CO scene views above, same full-model rationale.
    'view_4112', 'view_4114', 'view_4116', 'view_4118'
  ];
  const LIMIT_VALUE = '1000';
  const LIMIT_NUM = 1000;
  const EVENT_NS = '.scwLimit1000';

  // Views forced to 1000 records/page elsewhere in the codebase. The
  // per-page navigator is meaningless on these views (everything fits in
  // one page) — hide the pagination control on each so the UI doesn't
  // display "Page 1 of 1" / orphan arrows. Kept as a single union list
  // so there's exactly one place to update when another module starts
  // forcing full pages.
  const FORCED_FULL_PAGE_VIEWS = [
    // change-record-limit.js — misc views
    'view_3301', 'view_3341', 'view_3550', 'view_3586', 'view_3610', 'view_3896', 'view_3926',
    // worksheet-v2 source view
    'view_3962',
    // change-record-limit.js — device-worksheet views
    'view_3313', 'view_3450', 'view_3505', 'view_3512', 'view_3575',
    'view_3596', 'view_3997', 'view_3602', 'view_3608', 'view_3800', 'view_4093',
    // "WHAT WE'RE INSTALLING" worksheet (same install object as view_4093)
    'view_4056',
    // import-unique-items-btn.js
    'view_3913',
    // bid-review source/compare views (now also in VIEW_IDS above)
    'view_3680', 'view_3921', 'view_3573', 'view_3822', 'view_3818',
    // review-bids DOC_photos delete-plumbing grid (see VIEW_IDS above)
    'view_4098',
    // Change Order scene views (see VIEW_IDS above)
    'view_4079', 'view_4084', 'view_4086', 'view_4088',
    // Sub portal Manage Change Order views (see VIEW_IDS above)
    'view_4112', 'view_4114', 'view_4116', 'view_4118'
  ];

  (function injectHidePaginationCss() {
    const ID = 'scw-hide-forced-full-page-pagination-css';
    if (document.getElementById(ID)) return;
    const sel = FORCED_FULL_PAGE_VIEWS
      .map(v => '#' + v + ' .kn-pagination.level-right')
      .join(',\n');
    const s = document.createElement('style');
    s.id = ID;
    s.textContent = sel + ' { display: none !important; }';
    document.head.appendChild(s);
  })();

  // Pre-fetch limit push — on ANY view render, sweep every listed view and
  // stamp rows_per_page=1000 on models that haven't fetched yet. Knack
  // renders a scene's views serially, so by the time the FIRST view fires
  // its render event, later views' models usually exist but haven't built
  // their fetch request — stamping them now means their FIRST fetch loads
  // the full page. Without this, every listed view loads twice on scene
  // entry (Builder-default page size first, then our 1000/page refetch) —
  // double network, double render, and the partial first load is what
  // bid-review-v2's truncation repair exists to mop up. The per-view
  // handlers below remain as the safety net for models that appear late.
  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      if (typeof Knack === 'undefined' || !Knack.views) return;
      for (var i = 0; i < VIEW_IDS.length; i++) {
        var v = Knack.views[VIEW_IDS[i]];
        var mv = v && v.model && v.model.view;
        if (!mv) continue;
        if (mv.rows_per_page === LIMIT_NUM || mv.rows_per_page === LIMIT_VALUE) continue;
        mv.rows_per_page = LIMIT_NUM;
        if (mv.source) mv.source.limit = LIMIT_NUM;
      }
    });

  VIEW_IDS.forEach((VIEW_ID) => {
    $(document)
      .off(`knack-view-render.${VIEW_ID}${EVENT_NS}`)
      .on(`knack-view-render.${VIEW_ID}${EVENT_NS}`, function () {
        const $view = $('#' + VIEW_ID);
        if (!$view.length) return;

        // Run-once guard per view instance
        if ($view.data('scwLimitSet')) return;
        $view.data('scwLimitSet', true);

        // Strategy 1: DOM dropdown exists — use it
        const $limit = $view.find('select[name="limit"]');
        if ($limit.length) {
          if ($limit.val() !== LIMIT_VALUE) {
            $limit.val(LIMIT_VALUE).trigger('change');
          }
          return;
        }

        // Strategy 2: No dropdown — set rows_per_page on the Knack view model
        // and re-fetch (same pattern as default-sort.js)
        if (typeof Knack === 'undefined') return;
        var view = Knack.views && Knack.views[VIEW_ID];
        if (!view || !view.model) return;

        var modelView = view.model.view;
        if (!modelView) return;

        // Already at the desired limit — nothing to do
        if (modelView.rows_per_page === LIMIT_NUM ||
            modelView.rows_per_page === LIMIT_VALUE) return;

        modelView.rows_per_page = LIMIT_NUM;
        if (modelView.source) modelView.source.limit = LIMIT_NUM;

        if (typeof view.model.fetch === 'function') {
          // Probe the URL before fetching — some Knack view models lack
          // a usable URL (form views, partially-initialised models on
          // the current page render tick), and Backbone.sync throws
          // synchronously which bubbles up as an Uncaught Error that
          // can put Knack into a render loop. Skip silently if no URL.
          try {
            var url = (typeof view.model.url === 'function')
              ? view.model.url.call(view.model)
              : view.model.url;
            if (!url) return;
          } catch (e) {
            return;
          }
          try { view.model.fetch(); } catch (e) { /* swallow */ }
        }
      });
  });
})();


/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 **************************/
