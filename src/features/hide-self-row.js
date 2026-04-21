/*** FEATURE: Hide self-row ***/
/**
 * For the target view(s) listed below, hides any row whose record ID
 * matches the record ID currently shown by the companion source view
 * (a Knack details view). Prevents a SOW from listing itself in a
 * "related SOWs" grid, etc.
 */
(function () {
  'use strict';

  var EVENT_NS = '.scwHideSelfRow';
  var STYLE_ID = 'scw-hide-self-row-css';

  var CONFIG = [
    // Hide the current SOW's own row from view_3869 when it appears
    // there alongside its sibling SOW options. Also hides the Knack
    // "Showing X of Y" entries summary since the count is misleading
    // once the self-row is excluded.
    { targetView: 'view_3869', sourceView: 'view_3827', hideEntriesSummary: true }
  ];

  // Inject scoped CSS for views that opt into hideEntriesSummary.
  (function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var selectors = CONFIG
      .filter(function (r) { return r.hideEntriesSummary; })
      .map(function (r) { return '#' + r.targetView + ' .kn-entries-summary'; });
    if (!selectors.length) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = selectors.join(',\n') + ' { display: none !important; }';
    document.head.appendChild(s);
  })();

  function getSourceRecordId(sourceViewId) {
    try {
      var v = Knack.views && Knack.views[sourceViewId];
      if (v && v.model && v.model.attributes && v.model.attributes.id) {
        return v.model.attributes.id;
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function applyRule(rule) {
    var targetEl = document.getElementById(rule.targetView);
    if (!targetEl) return;
    var recordId = getSourceRecordId(rule.sourceView);
    if (!recordId) return;
    var selfRow = targetEl.querySelector('tr[id="' + recordId + '"]');
    if (selfRow) selfRow.style.display = 'none';
  }

  function applyAll() {
    for (var i = 0; i < CONFIG.length; i++) applyRule(CONFIG[i]);
  }

  CONFIG.forEach(function (rule) {
    $(document)
      .off('knack-view-render.' + rule.targetView + EVENT_NS)
      .on('knack-view-render.' + rule.targetView + EVENT_NS, function () {
        setTimeout(function () { applyRule(rule); }, 200);
      });

    $(document)
      .off('knack-view-render.' + rule.sourceView + EVENT_NS)
      .on('knack-view-render.' + rule.sourceView + EVENT_NS, function () {
        setTimeout(function () { applyRule(rule); }, 200);
      });
  });

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      setTimeout(applyAll, 800);
    });
})();
