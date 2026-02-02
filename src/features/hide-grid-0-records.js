(function () {
  const VIEW_IDS = ['view_3364'];
  const EVENT_NS = '.scwHideEmptyGrid';

  function hideIfEmpty(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) return;

    const hasNoDataRow = $view.find('tbody tr.kn-tr-nodata').length > 0;

    if (hasNoDataRow) {
      $view.remove(); // nukes the whole block including the header
    }
  }

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view) {
      if (!view || !VIEW_IDS.includes(view.key)) return;
      hideIfEmpty(view.key);
    });
})();
