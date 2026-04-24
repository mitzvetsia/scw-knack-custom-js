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
  var ITEM_THRESHOLD     = 20;   // below this → single column, no multi-col class
  var ROWS_PER_COLUMN    = 20;   // target density: ~20 rows per column
  var MAX_COLUMNS        = 6;    // hard cap; above this, each column gets more rows
  var COLUMN_WIDTH_PX    = 220;  // target visual width per column (drives list min-width)
  var COLUMN_GAP_PX      = 20;   // keeps in sync with CSS column-gap below

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
      //
      // `column-count` itself is set inline by apply() so it can scale
      // with the number of items (~30 rows per column, up to MAX_COLUMNS).
      //
      // `contain: layout style` isolates layout + style recalc to this
      // container. Without it, every :checked state flip on a 180-item
      // list forces the browser to re-evaluate column break points
      // across the entire list (with break-inside: avoid below making
      // this worse), which was the main contributor to the ~1.5s INP
      // on checkbox clicks inside the field_1957 picker.
      '.kn-popover .conn_inputs.' + MULTI_COL_CLASS + ' {',
      '  contain: layout style;',
      '  column-gap: 20px;',
      '  max-height: 70vh;',
      '  overflow-y: auto;',
      '}',
      // Keep each checkbox row intact — no splitting across columns.
      '.kn-popover .conn_inputs.' + MULTI_COL_CLASS + ' > .control {',
      '  break-inside: avoid;',
      '  -webkit-column-break-inside: avoid;',
      '  page-break-inside: avoid;',
      '  contain: layout style;',
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
  // Columns scale with item count: ceil(count / ROWS_PER_COLUMN),
  // clamped to [2, MAX_COLUMNS]. Below ITEM_THRESHOLD the popover
  // stays single-column and narrow. The subtree observer may fire
  // several times per user action (e.g. Knack adds a "X selected"
  // counter node to the popover on check), so memoize the last
  // applied count per list and bail early when nothing changed —
  // that way the observer's callback stays near-zero cost on clicks.
  var lastAppliedCount = new WeakMap();

  function apply(popover, list) {
    var count = list.querySelectorAll(':scope > .control').length;
    if (lastAppliedCount.get(list) === count) return;
    lastAppliedCount.set(list, count);

    var multi = count > ITEM_THRESHOLD;
    list.classList.toggle(MULTI_COL_CLASS, multi);
    popover.classList.toggle(WIDE_POPOVER_CLASS, multi);
    if (multi) {
      var cols = Math.max(
        2,
        Math.min(MAX_COLUMNS, Math.ceil(count / ROWS_PER_COLUMN))
      );
      list.style.columnCount = String(cols);
      // Force the list wide enough for the columns to breathe. The
      // popover itself is `width: max-content`, so it grows to match.
      list.style.minWidth =
        (cols * COLUMN_WIDTH_PX + (cols - 1) * COLUMN_GAP_PX) + 'px';
    } else {
      list.style.columnCount = '';
      list.style.minWidth = '';
    }
  }

  // Re-scan the popover for .conn_inputs lists and apply the multi-col
  // class. Cheap: two querySelectorAlls + a class toggle.
  function scanPopover(popover) {
    var lists = popover.querySelectorAll('.conn_inputs');
    for (var i = 0; i < lists.length; i++) apply(popover, lists[i]);
  }

  // Reorder .control children so already-checked items come first —
  // because CSS columns flow in DOM order, this puts selected items at
  // the top of the leftmost column. Runs once per popover open (not per
  // mutation), so new selections the user makes don't shuffle while
  // they're clicking; the reorder applies on the NEXT open.
  //
  // Returns true if the list had items and was reordered.
  function reorderSelectedFirst(list) {
    var controls = list.querySelectorAll(':scope > .control');
    if (!controls.length) return false;

    var checkedFrag = document.createDocumentFragment();
    var otherFrag = document.createDocumentFragment();
    for (var i = 0; i < controls.length; i++) {
      var cb = controls[i].querySelector('input[type="checkbox"]');
      if (cb && cb.checked) checkedFrag.appendChild(controls[i]);
      else otherFrag.appendChild(controls[i]);
    }
    list.appendChild(checkedFrag);
    list.appendChild(otherFrag);
    return true;
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

  // Shift-click range selection, hooked at the document level in CAPTURE
  // phase on `mousedown`. Two reasons for this choice:
  //   1. Capture phase runs before any bubble-phase handler can call
  //      stopPropagation — so a popover-scoped listener that the drop
  //      library or KTL might block is avoided.
  //   2. Hooking mousedown (not click) fires before the native checkbox
  //      toggle. We preventDefault on shift+mousedown, then flip the
  //      range manually with the correct target state. This also
  //      sidesteps the label→input click-synthesis quirk where the
  //      synthesized click on the input may lose the shiftKey flag.
  function resolveCheckbox(target) {
    if (!target || !target.closest) return null;
    if (target.tagName === 'INPUT' && target.type === 'checkbox') return target;
    // Click on label text / span: find the input inside the label.
    var label = target.closest('label');
    if (!label) return null;
    var input = label.querySelector('input[type="checkbox"]');
    return (input && input.type === 'checkbox') ? input : null;
  }

  // Window during which the click events immediately following a shift-
  // range mousedown should be suppressed. We preventDefault on mousedown,
  // but that only stops the native toggle when the user clicked the
  // checkbox INPUT directly — if they clicked the label's text, the
  // browser synthesizes a click on the input AFTER our mousedown, which
  // toggles the last box back to its original state. Suppressing the
  // click event that follows fixes the off-by-one on the shift-clicked
  // box.
  var _shiftHandledUntil = 0;
  var SHIFT_CLICK_SUPPRESS_MS = 300;

  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;                     // left-click only
    var cb = resolveCheckbox(e.target);
    if (!cb) return;
    var list = cb.closest('.conn_inputs');
    if (!list) return;

    if (e.shiftKey) {
      var anchor = lastCheckbox.get(list);
      if (anchor && anchor !== cb && list.contains(anchor)) {
        // Cancel the native toggle so we can apply the range state
        // ourselves (including the clicked box, with no double-toggle).
        e.preventDefault();
        _shiftHandledUntil = (performance.now ? performance.now() : Date.now())
                             + SHIFT_CLICK_SUPPRESS_MS;

        var all = Array.prototype.slice.call(
          list.querySelectorAll('input[type="checkbox"]')
        );
        var ai = all.indexOf(anchor);
        var bi = all.indexOf(cb);
        if (ai >= 0 && bi >= 0) {
          var lo = Math.min(ai, bi);
          var hi = Math.max(ai, bi);
          // Target state = what a plain click on cb would have produced.
          // mousedown fires before the toggle, so cb.checked is the OLD
          // state; invert it.
          var target = !cb.checked;
          for (var i = lo; i <= hi; i++) {
            var node = all[i];
            if (node.checked !== target) {
              node.checked = target;
              node.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
          try { window.getSelection().removeAllRanges(); } catch (_) {}
        }
        lastCheckbox.set(list, cb);
        return;
      }
      // Shift held but no usable anchor — fall through and treat as a
      // plain click (sets anchor, native toggle runs normally).
    }

    lastCheckbox.set(list, cb);
  }, true);

  // Click suppressor — kills the label→input synthesized click (and the
  // raw click on the label itself) that would otherwise re-toggle the
  // shift-clicked box after our mousedown handler set it manually.
  document.addEventListener('click', function (e) {
    var now = performance.now ? performance.now() : Date.now();
    if (now > _shiftHandledUntil) return;
    var cb = resolveCheckbox(e.target);
    if (!cb || !cb.closest('.conn_inputs')) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  function trackPopover(popover) {
    if (seen.has(popover)) return;
    seen.add(popover);

    var shellObs = null;  // brief subtree watch for .conn_inputs to appear
    var listObs = null;   // narrow watch on .conn_inputs once it's found
    // Once-per-open flag set of lists whose checked items have been
    // reordered to the front for the current open cycle. Cleared on
    // close so the next open re-runs the reorder.
    var reorderedThisOpen = new WeakSet();

    function stopOpenObs() {
      if (shellObs) { shellObs.disconnect(); shellObs = null; }
      if (listObs)  { listObs.disconnect();  listObs  = null; }
      reorderedThisOpen = new WeakSet();
    }

    // Observer factory with rAF debouncing so a burst of mutations
    // coalesces into a single scan per frame.
    function makeDebouncedScan() {
      var pending = false;
      return function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          scanPopover(popover);
          maybeReorder();
        });
      };
    }

    // Once the .conn_inputs list exists, stop watching the popover
    // subtree (which fires on every Knack DOM tweak during clicks) and
    // watch the list itself for direct childList changes only. That's
    // the only thing we actually need to react to — Knack appending
    // option rows as the candidates fetch resolves.
    function promoteToListObserver() {
      var list = popover.querySelector('.conn_inputs');
      if (!list) return false;
      if (shellObs) { shellObs.disconnect(); shellObs = null; }
      if (listObs)  { listObs.disconnect();  listObs  = null; }
      listObs = new MutationObserver(makeDebouncedScan());
      listObs.observe(list, { childList: true });
      return true;
    }

    function startOpenObs() {
      stopOpenObs();
      scanPopover(popover);  // immediate pass (catches cached/preloaded content)
      maybeReorder();
      // If the list is already in the DOM, go straight to the narrow
      // per-list observer. Otherwise watch the popover subtree briefly
      // until it appears, then promote.
      if (!promoteToListObserver()) {
        shellObs = new MutationObserver(function () {
          // Keep scanning for layout updates until the list is there.
          scanPopover(popover);
          if (promoteToListObserver()) maybeReorder();
        });
        shellObs.observe(popover, { childList: true, subtree: true });
      }
    }

    // Reorder each list to selected-first — but only the first time we
    // see items for a given list in this open cycle, so the user's
    // in-progress selections don't shuffle under their cursor.
    function maybeReorder() {
      var lists = popover.querySelectorAll('.conn_inputs');
      for (var i = 0; i < lists.length; i++) {
        var list = lists[i];
        if (reorderedThisOpen.has(list)) continue;
        if (reorderSelectedFirst(list)) reorderedThisOpen.add(list);
      }
    }

    if (popover.classList.contains('drop-open')) startOpenObs();

    var classObs = new MutationObserver(function () {
      if (popover.classList.contains('drop-open')) startOpenObs();
      else stopOpenObs();
    });
    classObs.observe(popover, { attributes: true, attributeFilter: ['class'] });
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
