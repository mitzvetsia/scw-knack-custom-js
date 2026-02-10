// ============================================================
// Refresh other views when an inline edit is made
// ============================================================
//
// CONFIG FORMAT:
//   triggers  – views whose inline edits trigger a refresh
//   refresh   – (optional) specific views to refresh
//   refreshAllExcept – (optional) refresh ALL views on the page EXCEPT these
//
//   Use ONE of "refresh" or "refreshAllExcept" per rule.
//
(function () {
  var RULES = [
    // Example: inline edit in view_100 refreshes view_200 and view_300
    // {
    //   triggers: ['view_100'],
    //   refresh: ['view_200', 'view_300'],
    // },

    // Example: inline edit in view_400 refreshes every other view on the page
    // {
    //   triggers: ['view_400'],
    //   refreshAllExcept: ['view_400'],
    // },
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
    try {
      if (Knack.views[viewId] && Knack.views[viewId].model && typeof Knack.views[viewId].model.fetch === 'function') {
        Knack.views[viewId].model.fetch();
      }
    } catch (e) {
      console.warn('[scw-refresh-on-edit] Could not refresh ' + viewId, e);
    }
  }

  // Build a lookup: triggerViewId → array of rules
  var triggerMap = {};
  RULES.forEach(function (rule) {
    (rule.triggers || []).forEach(function (viewId) {
      if (!triggerMap[viewId]) triggerMap[viewId] = [];
      triggerMap[viewId].push(rule);
    });
  });

  // Bind one handler per trigger view
  Object.keys(triggerMap).forEach(function (viewId) {
    $(document).on('knack-cell-update.' + viewId, function () {
      var rules = triggerMap[viewId];
      rules.forEach(function (rule) {
        var targets;

        if (rule.refresh) {
          targets = rule.refresh;
        } else if (rule.refreshAllExcept) {
          var excluded = {};
          rule.refreshAllExcept.forEach(function (id) { excluded[id] = true; });
          targets = getVisibleViewIds().filter(function (id) { return !excluded[id]; });
        } else {
          return;
        }

        targets.forEach(function (targetId) {
          refreshView(targetId);
        });
      });
    });
  });
})();
