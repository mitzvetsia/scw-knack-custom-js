// ============================================================
// Scene-View Refresh
// Refresh target views when trigger views are inline-edited
// OR form-submitted.
// ============================================================
//
// CONFIG: one entry per scene.
//   scene         – the Knack scene key (e.g. 'scene_1116')
//   triggerViews  – views whose edits / submits trigger a refresh
//                   (empty [] = any view in the scene triggers)
//   refreshViews  – views to refresh when triggered
//                   (empty [] = refresh all other visible views)
//
(function () {
  var RULES = [
    {
      scene: 'scene_1116',
      triggerViews: [],
      refreshViews: ['view_3418'],
    },
    // ---- add more rules here ----
    // {
    //   scene: 'scene_XXXX',
    //   triggerViews: ['view_1234'],
    //   refreshViews: ['view_5678', 'view_9012'],
    // },
  ];

  // Inline-edit event (bound per-view so we know which view triggered)
  var INLINE_EVENT = 'knack-cell-update';

  // Form events (bound scene-wide — form views may not be in the DOM at render)
  var FORM_EVENTS = [
    'knack-record-update',
    'knack-record-create',
  ];

  var NS = '.scwSceneViewRefresh';

  function getVisibleViewIds() {
    var ids = [];
    $('[id^="view_"]').each(function () {
      var id = this.id;
      if (/^view_\d+$/.test(id)) ids.push(id);
    });
    return ids;
  }

  function refreshView(viewId) {
    try {
      if (
        Knack.views[viewId] &&
        Knack.views[viewId].model &&
        typeof Knack.views[viewId].model.fetch === 'function'
      ) {
        Knack.views[viewId].model.fetch();
      }
    } catch (e) {
      console.warn('[scw-scene-view-refresh] Could not refresh ' + viewId, e);
    }
  }

  function toSet(arr) {
    var s = {};
    (arr || []).forEach(function (id) { s[id] = true; });
    return s;
  }

  function getTargets(rule, hasRefreshFilter, triggerViewId) {
    if (hasRefreshFilter) {
      return rule.refreshViews;
    }
    return getVisibleViewIds().filter(function (id) {
      return id !== triggerViewId;
    });
  }

  RULES.forEach(function (rule) {
    var triggerSet = toSet(rule.triggerViews);
    var hasTriggerFilter = rule.triggerViews && rule.triggerViews.length > 0;
    var hasRefreshFilter = rule.refreshViews && rule.refreshViews.length > 0;

    $(document).on('knack-scene-render.' + rule.scene, function () {
      var views = getVisibleViewIds();

      // --- Inline edits: bind per visible trigger view ---
      var triggers = hasTriggerFilter
        ? views.filter(function (id) { return triggerSet[id]; })
        : views;

      triggers.forEach(function (triggerViewId) {
        var fullEvent = INLINE_EVENT + '.' + triggerViewId + NS;
        $(document).off(fullEvent);
        $(document).on(fullEvent, function () {
          getTargets(rule, hasRefreshFilter, triggerViewId).forEach(refreshView);
        });
      });

      // --- Form submits: bind scene-wide (form views may not exist yet) ---
      FORM_EVENTS.forEach(function (eventName) {
        var fullEvent = eventName + NS;
        $(document).off(fullEvent);
        $(document).on(fullEvent, function () {
          if (hasRefreshFilter) {
            rule.refreshViews.forEach(refreshView);
          }
        });
      });
    });
  });
})();
