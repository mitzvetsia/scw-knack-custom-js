// ============================================================
// Inline-edit checkbox layout improvements
// ============================================================
//
// For Knack connection fields whose inline-edit input type is
// "Checkbox" (e.g. field_1957 Connected Devices), Knack opens a
// popover with one checkbox per candidate. When the candidate
// list is long (view_3586 can have 180+) three things go wrong:
//
//   1. Label text wraps underneath the checkbox instead of
//      continuing under the first text line.
//   2. The list renders single-column, which pushes the popover
//      off-screen.
//   3. An earlier implementation of this module fixed (2) with a
//      document-wide MutationObserver that watched childList +
//      attribute changes across the full body subtree. On pages
//      with many cards (view_3586) that observer fired on every
//      re-render, and the late application of the multi-column
//      class produced a visible 1-col → 2-col reflow.
//
// This revision:
//   - Watches only `document.body`'s direct childList for popover
//     additions (Knack's drop library appends popovers to body),
//     so the 180-row worksheet's DOM churn no longer runs this
//     observer's callback.
//   - Applies the multi-column grid class immediately when the
//     popover opens, before Knack finishes painting the options,
//     so there is no 1-col → 2-col reflow.
//   - Drops the `:has(...)` popover-width CSS in favour of a
//     class added directly to `.kn-popover` by JS — cheaper for
//     the style engine.
//   - Per-popover observers are attribute-scoped to the popover
//     element only (catch re-opens) and per-list observers are
//     short-lived (disconnect after Knack finishes rendering).
//
(function () {
  'use strict';

  var STYLE_ID           = 'scw-inline-checkbox-layout-css';
  var MULTI_COL_CLASS    = 'scw-checkbox-multi-col';
  var WIDE_POPOVER_CLASS = 'scw-popover-wide';
  var ITEM_THRESHOLD     = 20;
  var LIST_WATCH_MS      = 800;  // how long to watch a list for async item paints

  // ── CSS (injected once) ─────────────────────────────────────
  if (!document.getElementById(STYLE_ID)) {
    var css = [
      // Fix checkbox label indentation: wrapped lines align with the
      // text, not under the checkbox.
      '.kn-popover .conn_inputs label.option.checkbox {',
      '  display: flex; align-items: flex-start; gap: 4px; line-height: 1.4;',
      '}',
      '.kn-popover .conn_inputs label.option.checkbox input[type="checkbox"] {',
      '  flex-shrink: 0; margin-top: 3px;',
      '}',
      '.kn-popover .conn_inputs label.option.checkbox span {',
      '  flex: 1; min-width: 0;',
      '}',

      // Multi-column grid (applied by JS when item count > threshold).
      '.kn-popover .conn_inputs.' + MULTI_COL_CLASS + ' {',
      '  display: grid;',
      '  grid-template-columns: 1fr 1fr;',
      '  gap: 2px 20px;',
      '  max-height: 70vh;',
      '  overflow-y: auto;',
      '}',

      // Wider popover when multi-column — class set by JS on the
      // popover element itself (avoids costly :has()).
      '.kn-popover.' + WIDE_POPOVER_CLASS + ' {',
      '  max-width: 90vw;',
      '  width: max-content;',
      '}',
      '.kn-popover.' + WIDE_POPOVER_CLASS + ' .drop-content {',
      '  max-width: 90vw;',
      '}',
    ].join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Apply / remove multi-column based on current item count ──
  function apply(popover, list) {
    var items = list.querySelectorAll(':scope > .control');
    var multi = items.length > ITEM_THRESHOLD;
    list.classList.toggle(MULTI_COL_CLASS, multi);
    popover.classList.toggle(WIDE_POPOVER_CLASS, multi);
  }

  function processPopover(popover) {
    var lists = popover.querySelectorAll('.conn_inputs');
    if (!lists.length) return;

    // Immediate pass: catches content that's already painted (the usual
    // case when Knack is fast) and applies the multi-column grid before
    // the browser's first paint of the popover — no 1-col → 2-col reflow.
    for (var i = 0; i < lists.length; i++) {
      apply(popover, lists[i]);
    }

    // Short-lived per-list observer in case Knack paints items async.
    // Scoped to the list only, childList only, auto-disconnects.
    for (var j = 0; j < lists.length; j++) {
      (function (list) {
        var obs = new MutationObserver(function () { apply(popover, list); });
        obs.observe(list, { childList: true });
        setTimeout(function () { obs.disconnect(); }, LIST_WATCH_MS);
      })(lists[j]);
    }
  }

  // ── Per-popover tracking ────────────────────────────────────
  // Knack's drop library typically creates one popover per connection
  // cell and toggles `drop-open` on open/close. We track each popover
  // once, process it on the current open state, and re-process on
  // each subsequent open.
  var seen = new WeakSet();

  function trackPopover(popover) {
    if (seen.has(popover)) return;
    seen.add(popover);

    if (popover.classList.contains('drop-open')) processPopover(popover);

    var obs = new MutationObserver(function () {
      if (popover.classList.contains('drop-open')) processPopover(popover);
    });
    obs.observe(popover, { attributes: true, attributeFilter: ['class'] });
  }

  // ── Top-level: catch popovers appended to <body> ───────────
  // childList only (no subtree, no attribute observation). view_3586's
  // per-card DOM churn happens deep inside the view, not at body level,
  // so this observer stays cold.
  var bodyObs = new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var added = mutations[m].addedNodes;
      for (var n = 0; n < added.length; n++) {
        var node = added[n];
        if (node.nodeType !== 1) continue;
        if (node.classList && node.classList.contains('kn-popover')) {
          trackPopover(node);
        }
      }
    }
  });
  bodyObs.observe(document.body, { childList: true });

  // Pick up any popovers that already exist when this script loads.
  var existing = document.body.querySelectorAll(':scope > .kn-popover');
  for (var e = 0; e < existing.length; e++) trackPopover(existing[e]);
})();
