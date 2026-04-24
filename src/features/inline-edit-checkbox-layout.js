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

      // Multi-column layout (applied by JS when item count > threshold).
      // CSS columns flow top-to-bottom within each column, then into the
      // next column — so a sorted list reads 1, 2, 3 down the left column
      // and 4, 5, 6 down the right. Grid would instead read 1, 2 across
      // the top row, which breaks scanning a sorted list.
      '.kn-popover .conn_inputs.' + MULTI_COL_CLASS + ' {',
      '  column-count: 2;',
      '  column-gap: 20px;',
      '  max-height: 70vh;',
      '  overflow-y: auto;',
      '}',
      // Keep each checkbox row intact — no splitting across columns.
      '.kn-popover .conn_inputs.' + MULTI_COL_CLASS + ' > .control {',
      '  break-inside: avoid;',
      '  -webkit-column-break-inside: avoid;',
      '  page-break-inside: avoid;',
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

  // Re-scan the popover for .conn_inputs lists and apply the multi-col
  // class. Cheap: two querySelectorAlls + a class toggle.
  function scanPopover(popover) {
    var lists = popover.querySelectorAll('.conn_inputs');
    for (var i = 0; i < lists.length; i++) apply(popover, lists[i]);
  }

  // ── Per-popover tracking ────────────────────────────────────
  // Knack's drop library creates one popover per connection cell and
  // toggles `drop-open` on open/close. On first open Knack fetches
  // candidate records from the server — that can take several seconds
  // — before painting the checkbox list, so a time-boxed observer can
  // disconnect too early and miss the paint. Instead, keep a subtree
  // childList observer live for as long as the popover is open, then
  // disconnect when `drop-open` is removed. rAF-debounced so a burst
  // of item paints coalesces into a single scan per frame.
  var seen = new WeakSet();

  // Per-list anchor for shift-click range selection. WeakMap auto-GCs
  // when the list element is removed from the DOM.
  var lastCheckbox = new WeakMap();

  // Shift-click range selection. Click delegation on the popover — one
  // listener per popover. Pattern: click A, then shift-click B, and
  // every checkbox between A and B (DOM order) takes B's new checked
  // state. change events are dispatched on the in-between inputs so
  // Knack's internal model syncs before the user hits save.
  function onPopoverClick(e) {
    var cb = e.target;
    if (!cb || cb.tagName !== 'INPUT' || cb.type !== 'checkbox') return;
    var list = cb.closest('.conn_inputs');
    if (!list) return;

    var anchor = lastCheckbox.get(list);

    if (e.shiftKey && anchor && anchor !== cb && list.contains(anchor)) {
      var all = Array.prototype.slice.call(
        list.querySelectorAll('input[type="checkbox"]')
      );
      var ai = all.indexOf(anchor);
      var bi = all.indexOf(cb);
      if (ai >= 0 && bi >= 0) {
        var lo = Math.min(ai, bi);
        var hi = Math.max(ai, bi);
        // Target state = what the user's click just produced on cb.
        // (The click event fires after the native toggle, so cb.checked
        // already reflects the new value.)
        var target = cb.checked;
        for (var i = lo; i <= hi; i++) {
          var node = all[i];
          if (node !== cb && node.checked !== target) {
            node.checked = target;
            node.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        // Shift-clicking labels typically selects text between the two
        // clicks — clear it so the user doesn't see a weird highlight.
        try { window.getSelection().removeAllRanges(); } catch (_) {}
      }
    }

    lastCheckbox.set(list, cb);
  }

  function trackPopover(popover) {
    if (seen.has(popover)) return;
    seen.add(popover);

    var openObs = null;

    function stopOpenObs() {
      if (openObs) { openObs.disconnect(); openObs = null; }
    }

    function startOpenObs() {
      stopOpenObs();
      scanPopover(popover);  // immediate pass (catches cached/preloaded content)
      var pending = false;
      openObs = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          scanPopover(popover);
        });
      });
      openObs.observe(popover, { childList: true, subtree: true });
    }

    if (popover.classList.contains('drop-open')) startOpenObs();

    var classObs = new MutationObserver(function () {
      if (popover.classList.contains('drop-open')) startOpenObs();
      else stopOpenObs();
    });
    classObs.observe(popover, { attributes: true, attributeFilter: ['class'] });

    popover.addEventListener('click', onPopoverClick);
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
