// ============================================================
// Scene 1116 – soft-refresh view_3418 on any view change
// ============================================================
//
// Listens for data-mutation events (cell update, record
// create / update / delete) on every view inside scene_1116.
// When any of those fires, view_3418 is refreshed via
// model.fetch() so only that view re-renders – not the page.
//
(function () {
  'use strict';

  var SCENE_ID  = 'scene_1116';
  var TARGET    = 'view_3418';
  var EVENT_NS  = '.scwScene1116Refresh';
  var DEBOUNCE_MS = 300;

  var DATA_EVENTS = [
    'knack-cell-update',
    'knack-record-update',
    'knack-record-create',
    'knack-record-delete',
  ];

  var timer = 0;

  function refreshTarget() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      try {
        var v = Knack.views[TARGET];
        if (v && v.model && typeof v.model.fetch === 'function') {
          v.model.fetch();
        }
      } catch (e) {
        console.warn('[scw-scene-1116-refresh] Could not refresh ' + TARGET, e);
      }
    }, DEBOUNCE_MS);
  }

  function getVisibleViewIds() {
    var ids = [];
    $('[id^="view_"]').each(function () {
      if (/^view_\d+$/.test(this.id)) ids.push(this.id);
    });
    return ids;
  }

  $(document).on('knack-scene-render.' + SCENE_ID + EVENT_NS, function () {
    var views = getVisibleViewIds();

    views.forEach(function (viewId) {
      if (viewId === TARGET) return;

      DATA_EVENTS.forEach(function (evt) {
        var name = evt + '.' + viewId + EVENT_NS;
        $(document).off(name).on(name, refreshTarget);
      });
    });
  });
})();
