/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 and view_3341 **************************/

(function () {
  const VIEW_IDS = ['view_3301', 'view_3341', 'view_3550', 'view_3586', 'view_3610', 'view_3896'];
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
    // change-record-limit.js
    'view_3301', 'view_3341', 'view_3550', 'view_3586', 'view_3610', 'view_3896',
    // import-unique-items-btn.js
    'view_3913',
    // bid-review (CFG.viewKey, sowItemsViewKey, bidPackagesViewKey)
    'view_3680', 'view_3728', 'view_3573'
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
          view.model.fetch();
        }
      });
  });
})();


/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 **************************/
