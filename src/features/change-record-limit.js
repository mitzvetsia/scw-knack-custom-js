/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 and view_3341 **************************/

(function () {
  const VIEW_IDS = ['view_3301', 'view_3341', 'view_3550', 'view_3450'];
  const LIMIT_VALUE = '1000';
  const LIMIT_NUM = 1000;
  const EVENT_NS = '.scwLimit1000';

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
