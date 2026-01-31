/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 and view_3341 **************************/

(function () {
  const VIEW_IDS = ['view_3301', 'view_3341'];
  const LIMIT_VALUE = '1000';
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

        const $limit = $view.find('select[name="limit"]');
        if (!$limit.length) return;

        if ($limit.val() !== LIMIT_VALUE) {
          $limit.val(LIMIT_VALUE).trigger('change');
        }
      });
  });
})();


/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 **************************/
