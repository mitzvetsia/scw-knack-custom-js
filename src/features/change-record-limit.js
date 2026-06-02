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
    'view_3596', 'view_3602', 'view_3608', 'view_3800', 'view_3915'
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
    'view_3596', 'view_3602', 'view_3608', 'view_3800', 'view_3915',
    // import-unique-items-btn.js
    'view_3913',
    // bid-review (CFG.viewKey, sowItemsViewKey, bidPackagesViewKey, docFilesViewKey)
    'view_3680', 'view_3921', 'view_3573'
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
