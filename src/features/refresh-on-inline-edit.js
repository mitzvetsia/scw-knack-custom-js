// ============================================================
// Refresh other views when an inline edit is made
// ==========================================================
//
// CONFIG: one entry per scene.
//   scene           – the scene to apply the rule to
//   triggerExcept   – (optional) views that should NOT trigger a refresh
//   refreshExcept   – (optional) views that should NOT be refreshed
//
// Any inline edit on a view in the scene (except triggerExcept)
// refreshes all other views in the scene (except refreshExcept).
//
(function () {
  var RULES = [
    {
      scene: 'scene_1085',
      triggerExcept: [],
      refreshExcept: [],
    },
  ];

  // ---- nothing below needs editing ----

  function getVisibleViewIds() {
    var ids = [];
    $('[id^="view_"]').each(function () {
      var id = this.id;
      if (/^view_\d+$/.test(id)) ids.push(id);
    });
    return ids;
  }

  function refreshView(viewId) {
    var v = Knack.views[viewId];
    if (!v || !v.model || typeof v.model.fetch !== 'function') return;
    // Some Knack views (menu, header, rich-text) have models but no data
    // source. Backbone throws "A url property or function must be
    // specified" when fetch() is called on them — noisy and harmless.
    // Probe the URL up front; if it's missing or throws, skip silently.
    try {
      var url = (typeof v.model.url === 'function') ? v.model.url.call(v.model) : v.model.url;
      if (!url) return;
    } catch (e) {
      return;
    }
    try { v.model.fetch(); } catch (e) { /* swallow */ }
  }

  function toSet(arr) {
    var s = {};
    (arr || []).forEach(function (id) { s[id] = true; });
    return s;
  }

  RULES.forEach(function (rule) {
    var triggerExcluded = toSet(rule.triggerExcept);
    var refreshExcluded = toSet(rule.refreshExcept);

    $(document).on('knack-scene-render.' + rule.scene, function () {
      var views = getVisibleViewIds();

      views.forEach(function (viewId) {
        if (triggerExcluded[viewId]) return;

        $(document).off('knack-cell-update.' + viewId + '.scwRefresh');
        $(document).on('knack-cell-update.' + viewId + '.scwRefresh', function () {
          var targets = getVisibleViewIds().filter(function (id) {
            return id !== viewId && !refreshExcluded[id];
          });
          targets.forEach(refreshView);
        });
      });
    });
  });
})();
