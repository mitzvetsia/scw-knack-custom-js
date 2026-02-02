(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3364']; // add more view ids as needed
  const EVENT_NS = '.scwHideEmptyGridSimple';

  function hideView(viewId) {
    $('#' + viewId).remove(); // removes header + table + whitespace
  }

  function viewHasNoDataRow(viewId) {
    const $view = $('#' + viewId);
    return $view.find('tbody tr.kn-tr-nodata, tbody td.kn-td-nodata').length > 0;
  }

  // ======================
  // EVENT
  // ======================
  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view, data) {
      if (!view || !VIEW_IDS.includes(view.key)) return;

      // Preferred: Knack-provided count
      if (data && typeof data.total_records === 'number' && data.total_records === 0) {
        hideView(view.key);
        return;
      }

      // Fallback: DOM signal ("No data" row)
      if (viewHasNoDataRow(view.key)) {
        hideView(view.key);
      }
    });
})();
