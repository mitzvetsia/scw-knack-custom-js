/*** FEATURE: Default Sort Override ********************************************
 *
 * Sets a default sort on specified Knack views the first time they render in
 * a session. After the initial override the feature stays out of the way so
 * the user can freely click column headers to re-sort.
 *
 *   Config shape:
 *     { viewId: 'view_3586', field: 'field_1953', order: 'asc' }
 *
 *******************************************************************************/
(function () {
  'use strict';

  var NS = '.scwDefaultSort';

  var DEFAULT_SORTS = [
    { viewId: 'view_3586', field: 'field_1953', order: 'asc' }
  ];

  // Track which views we've already applied the default sort for so we don't
  // fight the user after they click a column header to re-sort.
  var _applied = {};

  function sortsMatch(current, field, order) {
    if (!current) return false;
    if (Array.isArray(current)) {
      if (!current.length) return false;
      var first = current[0];
      return first && first.field === field && first.order === order;
    }
    return current.field === field && current.order === order;
  }

  function applyDefault(cfg) {
    if (_applied[cfg.viewId]) return;
    if (typeof Knack === 'undefined') return;
    var view = Knack.views && Knack.views[cfg.viewId];
    if (!view || !view.model) return;

    var modelView = view.model.view;
    if (!modelView) return;

    var current = (modelView.source && modelView.source.sort) || modelView.sort;
    if (sortsMatch(current, cfg.field, cfg.order)) {
      _applied[cfg.viewId] = true;
      return;
    }

    _applied[cfg.viewId] = true;

    var sortArr = [{ field: cfg.field, order: cfg.order }];
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
