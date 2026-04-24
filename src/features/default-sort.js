/*** FEATURE: Default Sort Override ********************************************
 *
 * Sets a default sort on specified Knack views the first time they render in
 * a session. After the initial override the feature stays out of the way so
 * the user can freely click column headers to re-sort.
 *
 *   Config shape:
 *     { viewId: 'view_3586',
 *       sort: [{ field: 'field_2240', order: 'asc' },
 *              { field: 'field_1951', order: 'asc' }] }
 *
 * Note: device-worksheet views also apply a client-side sort at render time
 * (see rowSort in device-worksheet.js). This feature only affects the
 * server-side query; keep the two in sync if you want pagination and display
 * order to match.
 *
 *******************************************************************************/
(function () {
  'use strict';

  var NS = '.scwDefaultSort';

  var DEFAULT_SORTS = [
    {
      viewId: 'view_3586',
      sort: [
        { field: 'field_2240', order: 'asc' },
        { field: 'field_1951', order: 'asc' }
      ]
    },
    {
      viewId: 'view_3450',
      sort: [
        { field: 'field_2240', order: 'asc' },
        { field: 'field_1951', order: 'asc' }
      ]
    }
  ];

  // Track which views we've already applied the default sort for so we don't
  // fight the user after they click a column header to re-sort.
  var _applied = {};

  function sortsMatch(current, target) {
    if (!current) return false;
    var arr = Array.isArray(current) ? current : [current];
    if (arr.length !== target.length) return false;
    for (var i = 0; i < target.length; i++) {
      if (!arr[i] || arr[i].field !== target[i].field || arr[i].order !== target[i].order) {
        return false;
      }
    }
    return true;
  }

  function applyDefault(cfg) {
    if (_applied[cfg.viewId]) return;
    if (typeof Knack === 'undefined') return;
    var view = Knack.views && Knack.views[cfg.viewId];
    if (!view || !view.model) return;

    var modelView = view.model.view;
    if (!modelView) return;

    var current = (modelView.source && modelView.source.sort) || modelView.sort;
    if (sortsMatch(current, cfg.sort)) {
      _applied[cfg.viewId] = true;
      return;
    }

    _applied[cfg.viewId] = true;

    var sortArr = cfg.sort.slice();
    if (modelView.source) modelView.source.sort = sortArr;
    modelView.sort = sortArr;

    // NOTE: intentionally NOT calling view.model.fetch() here. Refetching
    // to change the server-side sort doubles the initial load cost: a
    // second HTTP round-trip for every view_3586 record plus a full
    // knack-view-render cycle, which re-runs every feature bound to this
    // view (device-worksheet card rebuild for ~180 rows, group-collapse,
    // etc.). It's the primary contributor to the ~3.6s INP on scene_1116.
    //
    // Safe to skip because:
    //  - device-worksheet.js applies its own client-side rowSort on every
    //    render, so the visible order is correct regardless of the order
    //    the server sent.
    //  - rows_per_page on these views is 1000 and the underlying record
    //    set is <200, so pagination isn't happening — server-side sort
    //    order has no user-visible effect.
    //  - Setting modelView.sort above still persists the preference, so
    //    any native fetch Knack triggers later (filter change, column
    //    header click being overridden, etc.) uses the right sort.
  }

  DEFAULT_SORTS.forEach(function (cfg) {
    $(document)
      .off('knack-view-render.' + cfg.viewId + NS)
      .on('knack-view-render.' + cfg.viewId + NS, function () {
        applyDefault(cfg);
      });
  });
})();
/*** END FEATURE: Default Sort Override ****************************************/
