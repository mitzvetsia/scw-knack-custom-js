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
  // Load mask (extended 2026-05): originally only view_3586/view_3610 got
  // a mask. In practice EVERY device-worksheet view suffers the same
  // multi-phase render: device-worksheet rebuilds source rows into
  // worksheet cards (~150ms), group-collapse wraps groups (~100-200ms),
  // inline-photo-row injects photo strips (immediate-after-render),
  // dynamic-cell-colors paints chips (~150ms debounce), bid-revision-
  // inject appends review UI (~400ms). Each fires off the same
  // knack-view-render and the user sees the table flicker through every
  // intermediate state. Cover ALL worksheet views with the same mask
  // and delay the reveal a hair past scw-worksheet-ready so the late
  // downstream modules complete under the mask too.
  //
  // Keep this list in sync with WORKSHEET_CONFIG.views in
  // device-worksheet.js — that's the canonical list of views that emit
  // scw-worksheet-ready. Adding a view here without device-worksheet
  // owning it will mask the tbody and never reveal it (5s safety timer
  // recovers, but is ugly).
  var VIEWS = [
    'view_3313',
    'view_3450',
    'view_3505',
    'view_3512',
    'view_3559',
    'view_3575',
    // 'view_3577' — REMOVED: device-worksheet no longer owns this view (its
    // V1 transform was disabled to isolate v2 perf), so it never emits
    // scw-worksheet-ready. Masking it here would hide the tbody until the 5s
    // safety timer fires. Let it render plainly.
    'view_3586',
    // 'view_3610' — REMOVED: hidden + fully replaced by the v2 worksheet
    // (source view_3962). device-worksheet no longer owns it, so it never
    // emits scw-worksheet-ready; masking would hide its tbody until the 5s
    // safety timer. Candidate for deletion from the Knack scene entirely.
    'view_3596',
    'view_3997',
    'view_3602',
    'view_3608',
    'view_3610',
    'view_3617',
    'view_3800',
    'view_3803',
    'view_3915',
    'view_4056',
    'view_3921',
    'view_3932',
    'view_4060'
  ];

  // Delay between scw-worksheet-ready firing and the tbody reveal.
  // Calibrated to outlast the typical downstream-module debounces:
  //   group-collapse           — 100ms mutation debounce + up to 200ms render delay
  //   dynamic-cell-colors      — 150ms mutation debounce
  //   inline-photo-row         — synchronous on knack-view-render
  //   bid-revision-inject      — 400ms (but that one is rare/limited)
  // 200ms covers the first three; bid-revision-inject's 400ms still
  // beats the mask but is on a small subset of rows and is acceptable.
  var REVEAL_DELAY_MS = 200;
  var READY_CLS       = 'scw-grid-ready';
  var SAFETY_MS       = 5000;
  var STYLE_ID        = 'scw-heavy-grid-perf-css';
  var NS              = '.scwHeavyGridPerf';

  if (document.getElementById(STYLE_ID)) return;

  // contain:layout style is heavy-handed — only safe on the largest grids
  // where the layout-isolation win is worth the trade-offs. content-
  // visibility is safe more broadly. Keep the heavyweight rules on the
  // two views that originally needed them.
  var CONTAIN_VIEWS = ['view_3586', 'view_3610'];

  var perfRules = CONTAIN_VIEWS.map(function (vid) {
    return [
      '#' + vid + ' .kn-table-wrapper,',
      '#' + vid + ' .kn-table {',
      '  contain: layout style;',
      '}',
      // content-visibility:auto + a 36px intrinsic-size estimate works
      // for typical data rows but BREAKS any row whose actual rendered
      // height is much larger than the estimate — the browser uses the
      // estimate to decide on-screen vs off-screen, decides the row is
      // "off", and skips painting the content. Result: a blank row at
      // estimated height.
      //
      // The injected summary panels (.scw-mdf-summary-row), our card
      // rows (.scw-ws-row), and inline-photo strips (.scw-inline-photo-
      // row) are all much taller than 36px and were rendering blank
      // under this rule. Exclude every injected row class along with
      // Knack's own group / totals rows.
      '#' + vid + ' tbody tr:not(.kn-table-group)' +
                          ':not(.kn-table-totals)' +
                          ':not(.scw-ws-row)' +
                          ':not(.scw-inline-photo-row)' +
                          ':not(.scw-mdf-summary-row)' +
                          ':not(.scw-synth-divider)' +
                          ':not(.scw-mounting-product-line)' +
                          ' {',
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

  // Per-view timers — both the safety cap and the reveal delay are
  // tracked separately so re-renders can't leak old timers OR cause
  // an in-flight reveal to fire after a later render's mask was applied.
  var safetyTimers = Object.create(null);
  var revealTimers = Object.create(null);

  function reveal(viewId) {
    if (!viewId || VIEWS.indexOf(viewId) === -1) return;
    var el = document.getElementById(viewId);
    if (el) el.classList.add(READY_CLS);
    if (safetyTimers[viewId]) {
      clearTimeout(safetyTimers[viewId]);
      delete safetyTimers[viewId];
    }
    if (revealTimers[viewId]) {
      clearTimeout(revealTimers[viewId]);
      delete revealTimers[viewId];
    }
  }

  function scheduleReveal(viewId) {
    if (!viewId || VIEWS.indexOf(viewId) === -1) return;
    if (revealTimers[viewId]) clearTimeout(revealTimers[viewId]);
    revealTimers[viewId] = setTimeout(function () {
      delete revealTimers[viewId];
      reveal(viewId);
    }, REVEAL_DELAY_MS);
  }

  function armSafetyTimer(viewId) {
    if (!viewId || VIEWS.indexOf(viewId) === -1) return;
    if (safetyTimers[viewId]) clearTimeout(safetyTimers[viewId]);
    safetyTimers[viewId] = setTimeout(function () { reveal(viewId); }, SAFETY_MS);
  }

  // device-worksheet emits this when its transform completes for a view.
  // It's the EARLIEST safe point — but several debounced downstream
  // modules (group-collapse, dynamic-cell-colors, inline-photo-row)
  // still have outstanding work. Wait REVEAL_DELAY_MS so they land
  // under the mask too.
  document.addEventListener('scw-worksheet-ready', function (e) {
    var viewId = e && e.detail && e.detail.viewId;
    scheduleReveal(viewId);
  });

  // Re-add the loading state on every view render so a refresh / inline-
  // edit refetch goes through the same hide-then-reveal cycle. Removes
  // the ready class first; scw-worksheet-ready re-adds it via
  // scheduleReveal.
  $(document).off('knack-view-render.any' + NS)
    .on('knack-view-render.any' + NS, function (ev, view) {
      var viewId = view && view.key;
      if (!viewId || VIEWS.indexOf(viewId) === -1) return;
      var el = document.getElementById(viewId);
      if (el) el.classList.remove(READY_CLS);
      // Cancel any in-flight reveal from the previous render — its
      // mask got reapplied, so the old reveal would expose stale state.
      if (revealTimers[viewId]) {
        clearTimeout(revealTimers[viewId]);
        delete revealTimers[viewId];
      }
      armSafetyTimer(viewId);
    });
})();
/*************  Heavy-grid rendering perf  *************/
