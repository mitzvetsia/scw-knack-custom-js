// ============================================================
// Preserve scroll position + coordinated post-edit restoration
// ============================================================
//
// This module has two jobs:
//
// 1) SCROLL PRESERVATION — Save/restore the browser scroll
//    position across page reloads, SPA navigations, and inline
//    edits.  Position is keyed by URL path+hash in sessionStorage.
//
// 2) POST-INLINE-EDIT COORDINATOR — After a Knack inline edit
//    triggers view re-renders, this module orchestrates the
//    restoration sequence so that:
//      a) Grouped table accordions (group-collapse) are rebuilt
//      b) KTL accordion wrappers are re-synced
//      c) Scroll position is restored AFTER layout is stable
//
//    Without coordination, these three tasks run on independent
//    blind timers (80ms / 200ms / 500ms) that race against
//    Knack's async re-render and against each other — causing
//    accordions to not reinitialize and scroll to restore against
//    stale layout heights.
//
// LIFECYCLE (post-inline-edit):
//
//   ┌─ knack-cell-update ─────────────────────────────────────┐
//   │  • Save scroll position (before DOM changes)            │
//   │  • Suppress group-collapse auto-enhancement             │
//   │  • Enter "pending edit" mode                            │
//   └─────────────────────────────────────────────────────────┘
//           │
//           ▼
//   ┌─ knack-view-render (one or more) ──────────────────────┐
//   │  • Reset settle timer (300ms after LAST view-render)    │
//   │  • Group-collapse and scroll-restore are suppressed     │
//   └─────────────────────────────────────────────────────────┘
//           │
//           ▼  (300ms quiet period — all views settled)
//   ┌─ runPostEditRestore() ─────────────────────────────────┐
//   │  1. Poll for DOM readiness (tables with rows exist)     │
//   │  2. Re-enable group-collapse auto-enhancement           │
//   │  3. Run group-collapse enhancement (rebuild accordions) │
//   │  4. Run KTL accordion refresh (re-adopt wrappers)       │
//   │  5. Wait 2 rAF frames (layout stabilizes)               │
//   │  6. Restore scroll position                             │
//   │  7. Clear "pending edit" mode                           │
//   └─────────────────────────────────────────────────────────┘
//
// Global API:
//   SCW.scrollPreserve.save()    – manually save current position
//   SCW.scrollPreserve.restore() – manually restore saved position
//   SCW.scrollPreserve.clear()   – clear the saved position
//
(function () {
  'use strict';

  var STORAGE_KEY = 'scw_scroll_position';

  // ── How long after the LAST knack-view-render to wait before
  //    considering all views settled.  300ms balances speed with
  //    reliability — Knack's model.fetch() calls go out in parallel
  //    so their view-renders cluster within ~200ms of each other. ──
  var SETTLE_MS = 300;

  // ── Max time to poll for DOM readiness before giving up. ──
  var POLL_MAX_MS = 2000;
  var POLL_INTERVAL_MS = 50;

  // ══════════════════════════════════════════════════════════
  //  Scroll position helpers (sessionStorage, keyed by URL)
  // ══════════════════════════════════════════════════════════

  function getPageKey() {
    return window.location.pathname + window.location.hash;
  }

  function save() {
    try {
      var data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      data[getPageKey()] = $(window).scrollTop();
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // sessionStorage may be unavailable in some contexts
    }
  }

  function restore() {
    try {
      var data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      var pos = data[getPageKey()];
      if (typeof pos === 'number' && pos > 0) {
        $(window).scrollTop(pos);
      }
    } catch (e) {
      // ignore
    }
  }

  function clear() {
    try {
      var data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      delete data[getPageKey()];
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // ignore
    }
  }

  // ══════════════════════════════════════════════════════════
  //  Non-edit triggers (page load, SPA navigation, unload)
  //  These are simple — no coordination needed.
  // ══════════════════════════════════════════════════════════

  // Save position right before the page unloads (refresh / close)
  window.addEventListener('beforeunload', save);

  // Restore on initial page load (short delay for content layout)
  $(document).ready(function () {
    setTimeout(restore, 300);
  });

  // Restore after SPA hash-navigation scene renders
  $(document).on('knack-scene-render.any.scwScrollPreserve', function () {
    // Clear pending-edit flag on navigation (stale if user navigated away)
    _pendingEdit = false;
    if (window.SCW && window.SCW.groupCollapse) {
      window.SCW.groupCollapse.suppress(false);
    }
    setTimeout(restore, 300);
  });

  // ══════════════════════════════════════════════════════════
  //  Post-inline-edit coordination
  // ══════════════════════════════════════════════════════════

  var _pendingEdit = false;   // true between cell-update and restore completion
  var _settleTimer = null;    // debounce timer for view-render settling

  // ── STATE CAPTURE: Save scroll + suppress premature auto-enhancement ──
  // Fires BEFORE Knack re-renders views, so the scroll position and
  // accordion state in localStorage are both accurate at this moment.
  $(document).on('knack-cell-update.scwScrollPreserve', function () {
    save();
    _pendingEdit = true;

    // Tell group-collapse to stop auto-enhancing from its own
    // MutationObserver and view-render timer — we'll call it
    // explicitly once all views have settled.
    if (window.SCW && window.SCW.groupCollapse) {
      window.SCW.groupCollapse.suppress(true);
    }
  });

  // ── SETTLE DETECTION: Debounce view-renders to find the quiet point ──
  $(document).on('knack-view-render.scwScrollPreserve', function () {
    if (_pendingEdit) {
      // Coordinated post-edit flow: reset settle timer on each render.
      // The restore sequence runs SETTLE_MS after the LAST view-render,
      // ensuring all async-fetched views have finished.
      if (_settleTimer) clearTimeout(_settleTimer);
      _settleTimer = setTimeout(runPostEditRestore, SETTLE_MS);
    } else {
      // Normal view-render (not post-edit): simple debounced restore.
      // 500ms allows device-worksheet + group-collapse independent
      // timers to finish before we scroll.
      debouncedRestore(500);
    }
  });

  // Simple debounced restore for non-edit view renders
  var _restoreTimer = null;
  function debouncedRestore(delay) {
    if (_restoreTimer) clearTimeout(_restoreTimer);
    _restoreTimer = setTimeout(function () {
      _restoreTimer = null;
      restore();
    }, delay);
  }

  // ══════════════════════════════════════════════════════════
  //  Post-edit restoration sequence
  // ══════════════════════════════════════════════════════════

  function runPostEditRestore() {
    _settleTimer = null;

    // Step 1: Verify DOM readiness — poll until tables have content rows.
    // Knack's async re-render may not be fully complete even after
    // knack-view-render fires (e.g., grouped rows added in batches).
    pollForDOM(function () {

      // Step 2: Re-enable group-collapse auto-enhancement
      //         (so MutationObserver works normally going forward)
      if (window.SCW && window.SCW.groupCollapse) {
        window.SCW.groupCollapse.suppress(false);
      }

      // Step 3: REBUILD GROUPED ACCORDIONS — run group-collapse
      //         enhancement which reads saved state from localStorage
      //         and applies collapsed/expanded classes + row visibility.
      //         This is idempotent — safe if group-collapse already ran.
      if (window.SCW && window.SCW.groupCollapse) {
        window.SCW.groupCollapse.enhance();
      }

      // Step 4: SYNC KTL ACCORDIONS — ensure accordion wrappers
      //         are re-adopted after view DOM replacement.
      if (window.SCW && window.SCW.ktlAccordion) {
        window.SCW.ktlAccordion.refresh();
      }

      // Step 5: RESTORE SCROLL POSITION — wait 2 requestAnimationFrame
      //         cycles so the browser has painted the updated layout
      //         (expanded/collapsed rows, accordion bodies) before we
      //         scroll.  This is the minimum reliable wait for layout
      //         stability without a blind timeout.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          restore();
          _pendingEdit = false;
        });
      });
    });
  }

  // ══════════════════════════════════════════════════════════
  //  DOM readiness polling
  // ══════════════════════════════════════════════════════════
  //
  // After knack-view-render, the view's primary DOM is usually present,
  // but other transforms (device-worksheet, proposal-grid) may still be
  // in flight.  We poll for at least one visible table with data rows
  // as a heuristic for "the page has meaningful content."
  //
  // If no tables exist (e.g., the page has only forms/details), the
  // poll exits immediately so we don't block restoration on a condition
  // that can never be met.

  function pollForDOM(callback) {
    var elapsed = 0;

    function check() {
      // If the page has no tables at all, proceed immediately
      var $tables = $('table.kn-table:visible');
      if ($tables.length === 0) {
        callback();
        return;
      }

      // Check if any visible table has data rows
      var hasContent = false;
      $tables.each(function () {
        if ($(this).find('tbody tr').not('.kn-tr-nodata').length > 0) {
          hasContent = true;
          return false; // break
        }
      });

      if (hasContent || elapsed >= POLL_MAX_MS) {
        callback();
      } else {
        elapsed += POLL_INTERVAL_MS;
        setTimeout(check, POLL_INTERVAL_MS);
      }
    }

    // Small initial delay to let synchronous DOM updates flush
    setTimeout(check, 20);
  }

  // ══════════════════════════════════════════════════════════
  //  Expose API on SCW namespace
  // ══════════════════════════════════════════════════════════
  window.SCW = window.SCW || {};
  window.SCW.scrollPreserve = {
    save: save,
    restore: restore,
    clear: clear
  };
})();
