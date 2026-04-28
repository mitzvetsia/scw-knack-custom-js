/*************  Heavy-grid rendering perf — CSS containment + content-visibility + load mask  *************/
(function () {
  'use strict';

  // Views known to render hundreds of rows on scene load.  group-collapse
  // hides closed L1 groups via display:none (zero layout cost), but the
  // initial paint and any tall open group still go through full layout.
  // CSS containment isolates each grid's layout work from the rest of the
  // page; content-visibility lets the browser skip layout/paint for rows
  // that aren't in the viewport.
  //
  // Load mask (added 2026-04): on first render, several modules stack
  // mutations on top of each other — device-worksheet rebuilds rows into
  // worksheet cards, group-collapse wraps groups into accordions, inline-
  // photo-row injects photo strips, dynamic-cell-colors paints chips, etc.
  // Each fires off knack-view-render and the user sees the table flicker
  // through several intermediate states. We hide the tbody until
  // device-worksheet emits 'scw-worksheet-ready' (the latest of the
  // transforms in practice), then flip the visibility back. A safety
  // timeout reveals after 5s no matter what so a stalled transform can't
  // leave the grid permanently blank.
  var VIEWS = ['view_3586', 'view_3610'];
  var READY_CLS    = 'scw-grid-ready';
  var SAFETY_MS    = 5000;
  var STYLE_ID     = 'scw-heavy-grid-perf-css';
  var NS           = '.scwHeavyGridPerf';

  if (document.getElementById(STYLE_ID)) return;

  var perfRules = VIEWS.map(function (vid) {
    return [
      '#' + vid + ' .kn-table-wrapper,',
      '#' + vid + ' .kn-table {',
      '  contain: layout style;',
      '}',
      '#' + vid + ' tbody tr:not(.kn-table-group):not(.kn-table-totals) {',
      '  content-visibility: auto;',
      '  contain-intrinsic-size: auto 36px;',
      '}'
    ].join('\n');
  }).join('\n\n');

  // Load-mask rules. Hides the tbody (data + group rows) until the view
  // gets `.scw-grid-ready`. Header / filter / nav rows above the table
  // stay visible so the user still sees the column headers and any
  // surrounding chrome (filter pills, etc.) immediately.
  var maskRules = VIEWS.map(function (vid) {
    return [
      '#' + vid + ':not(.' + READY_CLS + ') .kn-table tbody {',
      '  visibility: hidden;',
      '}'
    ].join('\n');
  }).join('\n\n');

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = perfRules + '\n\n' + maskRules;
  document.head.appendChild(style);

  // Track per-view safety timers so a re-render doesn't leak old timers.
  var safetyTimers = Object.create(null);

  function reveal(viewId) {
    if (!viewId || VIEWS.indexOf(viewId) === -1) return;
    var el = document.getElementById(viewId);
    if (el) el.classList.add(READY_CLS);
    if (safetyTimers[viewId]) {
      clearTimeout(safetyTimers[viewId]);
      delete safetyTimers[viewId];
    }
  }

  function armSafetyTimer(viewId) {
    if (!viewId || VIEWS.indexOf(viewId) === -1) return;
    if (safetyTimers[viewId]) clearTimeout(safetyTimers[viewId]);
    safetyTimers[viewId] = setTimeout(function () { reveal(viewId); }, SAFETY_MS);
  }

  // device-worksheet emits this when its transform completes for a view.
  // Latest transform in the chain in practice — group-collapse, inline-
  // photo-row, etc. all run before this fires (they're hooked off the
  // same knack-view-render).
  document.addEventListener('scw-worksheet-ready', function (e) {
    var viewId = e && e.detail && e.detail.viewId;
    reveal(viewId);
  });

  // Re-add the loading state on every view render so a refresh / inline-
  // edit refetch goes through the same hide-then-reveal cycle. Removes
  // the ready class first; scw-worksheet-ready re-adds it.
  $(document).off('knack-view-render.any' + NS)
    .on('knack-view-render.any' + NS, function (ev, view) {
      var viewId = view && view.key;
      if (!viewId || VIEWS.indexOf(viewId) === -1) return;
      var el = document.getElementById(viewId);
      if (el) el.classList.remove(READY_CLS);
      armSafetyTimer(viewId);
    });
})();
/*************  Heavy-grid rendering perf  *************/
