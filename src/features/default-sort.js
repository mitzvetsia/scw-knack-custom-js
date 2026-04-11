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

    if (typeof view.model.fetch === 'function') {
      view.model.fetch();
    }
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
