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
// SCROLL STRATEGY:
//
//   Pixel-based scroll restoration is unreliable after inline edits
//   because accordion expand/collapse changes the total page height.
//   A saved position of 2500px may point to completely different
//   content after groups re-expand.
//
//   Instead, for post-edit restoration we use ANCHOR-BASED SCROLLING:
//     • Before the edit, find the Knack view element (.kn-view)
//       closest to the viewport top and record its offset.
//     • After restoration, find that same element (by its stable ID)
//       and scroll so it sits at the same viewport offset.
//
//   Pixel-based save/restore is kept for page reloads and SPA
//   navigations where the layout doesn't change.
//
// LIFECYCLE (post-inline-edit):
//
//   ┌─ knack-cell-update ─────────────────────────────────────┐
//   │  • Save pixel scroll + anchor (view ID + viewport offset)│
//   │  • Suppress group-collapse auto-enhancement              │
//   │  • Enter "pending edit" mode                             │
//   │  • Start safety timeout (3s fallback)                    │
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
//   │  6. Restore scroll via anchor (contextual), then pixel  │
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

  // ══════════════════════════════════════════════════════════
  //  Debug instrumentation
  //  Toggle from console: SCW.scrollPreserve.debug = true
  //  Shows timestamped lifecycle events so you can see exactly
  //  what happens during scroll save/restore sequences.
  // ══════════════════════════════════════════════════════════
  var _debug = false;
  var _debugT0 = 0;  // timestamp of the cell-update that started the sequence

  function log(label, data) {
    if (!_debug) return;
    var elapsed = _debugT0 ? '+' + (Date.now() - _debugT0) + 'ms' : 't0';
    if (data !== undefined) {
      console.log('%c[scroll] ' + elapsed + ' %c' + label, 'color:#888', 'color:#1a73e8', data);
    } else {
      console.log('%c[scroll] ' + elapsed + ' %c' + label, 'color:#888', 'color:#1a73e8');
    }
  }

  // ── How long after the LAST knack-view-render to wait before
  //    considering all views settled.  300ms balances speed with
  //    reliability — Knack's model.fetch() calls go out in parallel
  //    so their view-renders cluster within ~200ms of each other. ──
  var SETTLE_MS = 300;

  // ── Max time to poll for DOM readiness before giving up. ──
  var POLL_MAX_MS = 2000;
  var POLL_INTERVAL_MS = 50;

  // ── Safety: if no knack-view-render fires within this window
  //    after a cell-update, run restore anyway and clear the
  //    pending-edit flag so future renders aren't stuck. ──
  var SAFETY_TIMEOUT_MS = 3000;

  // ══════════════════════════════════════════════════════════
  //  Pixel-based scroll helpers (sessionStorage, keyed by URL)
  //  Used for page reloads and SPA navigations.
  // ══════════════════════════════════════════════════════════

  function getPageKey() {
    return window.location.pathname + window.location.hash;
  }

  function save() {
    try {
      var pos = $(window).scrollTop();
      var data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      data[getPageKey()] = pos;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      log('save pixel', { pos: pos, key: getPageKey() });
    } catch (e) {
      // sessionStorage may be unavailable in some contexts
    }
  }

  function restore() {
    try {
      var data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      var pos = data[getPageKey()];
      if (typeof pos === 'number' && pos > 0) {
        log('restore pixel', { target: pos, before: $(window).scrollTop(), key: getPageKey() });
        $(window).scrollTop(pos);
        log('restore pixel done', { actual: $(window).scrollTop(), wanted: pos });
      } else {
        log('restore pixel — no saved position', { key: getPageKey() });
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
  //  Anchor-based scroll (for post-inline-edit)
  // ══════════════════════════════════════════════════════════
  //
  //  Instead of relying on an absolute pixel position (which
  //  breaks when accordion expand/collapse changes page height),
  //  we identify the Knack view element nearest the viewport top
  //  and record how far it was from the top of the viewport.
  //
  //  After the edit + accordion rebuild, we find the same element
  //  (by its stable view_XXXX ID) and scroll so it sits at the
  //  same offset.  This works even if content ABOVE the anchor
  //  changed height.
  //
  //  Fallback: if the anchor element can't be found (deleted view,
  //  navigation), we fall back to pixel-based restore.

  var _savedAnchor = null;   // { id, topOffset, pageKey }

  /**
   * STATE CAPTURE: Find the nearest visible view to viewport top.
   * Called on knack-cell-update, BEFORE any DOM changes.
   */
  function saveAnchor() {
    var best = null;
    var bestDist = Infinity;
    var candidates = [];

    $('[id^="view_"]').filter(':visible').each(function () {
      // Only match canonical view IDs (view_1234)
      if (!/^view_\d+$/.test(this.id)) return;

      var rect = this.getBoundingClientRect();
      var dist = Math.abs(rect.top);
      if (_debug) candidates.push({ id: this.id, top: Math.round(rect.top), dist: Math.round(dist) });
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          id: this.id,
          topOffset: rect.top   // px from viewport top (can be negative)
        };
      }
    });

    if (best) {
      // Freeze the page key at capture time so a later hash change
      // doesn't cause restore to look up a different storage entry.
      best.pageKey = getPageKey();
    }
    _savedAnchor = best;
    log('save anchor', best
      ? { anchor: best.id, topOffset: Math.round(best.topOffset), candidates: candidates.length }
      : 'no visible views found');
    if (_debug && candidates.length <= 10) log('  candidates', candidates);
  }

  /**
   * SCROLL RESTORE (anchor): Scroll so the saved view element is at
   * the same viewport offset it had before the edit.
   * Returns true if the anchor was found and scroll was applied.
   */
  function restoreFromAnchor() {
    if (!_savedAnchor) {
      log('restore anchor — no saved anchor');
      return false;
    }
    var anchor = _savedAnchor;
    _savedAnchor = null;

    var el = document.getElementById(anchor.id);
    if (!el || !$(el).is(':visible')) {
      log('restore anchor FAILED — element not found or hidden', { id: anchor.id });
      return false;
    }

    var rect = el.getBoundingClientRect();
    var drift = rect.top - anchor.topOffset;
    var scrollBefore = $(window).scrollTop();

    log('restore anchor', {
      id: anchor.id,
      savedOffset: Math.round(anchor.topOffset),
      currentOffset: Math.round(rect.top),
      drift: Math.round(drift),
      scrollBefore: scrollBefore
    });

    // Only adjust if the drift is meaningful (> 5px)
    if (Math.abs(drift) > 5) {
      $(window).scrollTop(scrollBefore + drift);
      log('restore anchor applied', {
        scrollAfter: $(window).scrollTop(),
        wanted: scrollBefore + drift
      });
    } else {
      log('restore anchor — drift < 5px, no adjustment needed');
    }
    return true;
  }

  /**
   * SCROLL RESTORE (pixel, with frozen key): Restore using the page
   * key captured at save time, not the current URL.  This handles
   * the case where the hash changed between save and restore.
   */
  function restoreWithFrozenKey(frozenKey) {
    try {
      var data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      var pos = data[frozenKey];
      if (typeof pos === 'number' && pos > 0) {
        log('restore pixel (frozen key)', { target: pos, before: $(window).scrollTop(), key: frozenKey });
        $(window).scrollTop(pos);
        log('restore pixel done', { actual: $(window).scrollTop(), wanted: pos });
      } else {
        log('restore pixel (frozen key) — no saved position', { key: frozenKey });
      }
    } catch (e) {
      // ignore
    }
  }

  // ══════════════════════════════════════════════════════════
  //  Non-edit triggers (page load, SPA navigation, unload)
  //  These are simple — no coordination needed.
  //
  //  IMPORTANT: document.ready and knack-scene-render can both
  //  fire on page load.  We debounce them into a single restore
  //  and clear the saved position after restoring, so a stale
  //  position can't be restored a second time after the user
  //  has already scrolled.
  // ══════════════════════════════════════════════════════════

  // Save position right before the page unloads (refresh / close)
  window.addEventListener('beforeunload', save);

  var _navRestoreTimer = null;

  /** Schedule a single debounced restore for navigation / page load.
   *  Clears the saved position after restoring so it can't fire twice. */
  function scheduleNavRestore() {
    if (_navRestoreTimer) clearTimeout(_navRestoreTimer);
    _navRestoreTimer = setTimeout(function () {
      _navRestoreTimer = null;
      restore();
      clear();   // consumed — don't restore this stale position again
    }, 300);
  }

  // Restore on initial page load (short delay for content layout)
  $(document).ready(function () {
    scheduleNavRestore();
  });

  // Restore after SPA hash-navigation scene renders
  $(document).on('knack-scene-render.any.scwScrollPreserve', function () {
    // Clear pending-edit flag on navigation (stale if user navigated away)
    clearPendingState();
    scheduleNavRestore();
  });

  // ══════════════════════════════════════════════════════════
  //  Post-inline-edit coordination
  // ══════════════════════════════════════════════════════════

  var _pendingEdit = false;   // true between cell-update and restore completion
  var _settleTimer = null;    // debounce timer for view-render settling
  var _safetyTimer = null;    // fallback if no view-render ever fires

  /** Clean up all pending state and re-enable group-collapse. */
  function clearPendingState() {
    _pendingEdit = false;
    _savedAnchor = null;
    if (_settleTimer) { clearTimeout(_settleTimer); _settleTimer = null; }
    if (_safetyTimer) { clearTimeout(_safetyTimer); _safetyTimer = null; }
    if (window.SCW && window.SCW.groupCollapse) {
      window.SCW.groupCollapse.suppress(false);
    }
  }

  // ── STATE CAPTURE: Save scroll + anchor, suppress auto-enhancement ──
  // Fires BEFORE Knack re-renders views, so the scroll position and
  // accordion state in localStorage are both accurate at this moment.
  $(document).on('knack-cell-update.scwScrollPreserve', function () {
    _debugT0 = Date.now();
    log('=== CELL UPDATE ===', { scrollTop: $(window).scrollTop(), pageHeight: document.body.scrollHeight });
    save();            // pixel position (for reload / SPA nav fallback)
    saveAnchor();      // contextual anchor (for post-edit restore)
    _pendingEdit = true;

    // Tell group-collapse to stop auto-enhancing from its own
    // MutationObserver and view-render timer — we'll call it
    // explicitly once all views have settled.
    if (window.SCW && window.SCW.groupCollapse) {
      window.SCW.groupCollapse.suppress(true);
    }

    // Snapshot KTL accordion collapsed/expanded state before re-render
    if (window.SCW && window.SCW.ktlAccordion && window.SCW.ktlAccordion.saveState) {
      window.SCW.ktlAccordion.saveState();
    }

    // Safety net: if no knack-view-render fires within 3s (e.g.,
    // Knack updated the cell in-place without a full view re-render),
    // run restore anyway so we don't stay stuck.
    if (_safetyTimer) clearTimeout(_safetyTimer);
    _safetyTimer = setTimeout(function () {
      _safetyTimer = null;
      if (_pendingEdit) {
        log('SAFETY TIMEOUT — no view-render in ' + SAFETY_TIMEOUT_MS + 'ms, forcing restore');
        runPostEditRestore();
      }
    }, SAFETY_TIMEOUT_MS);
  });

  // ── SETTLE DETECTION: Debounce view-renders to find the quiet point ──
  //
  // Only the POST-EDIT path listens for view-renders here.
  // Non-edit view re-renders (KTL refresh, grid-direct-edit, etc.)
  // must NOT trigger pixel restore — the saved position goes stale
  // as soon as the user scrolls, and restoring it would yank them
  // back to a previous position.  Scene-render + document.ready
  // already cover the navigation / page-load cases.
  var _viewRenderCount = 0;
  $(document).on('knack-view-render.scwScrollPreserve', function (e, view) {
    if (!_pendingEdit) return;  // ignore non-edit view renders

    var viewId = (view && view.key) || 'unknown';
    _viewRenderCount++;
    log('view-render #' + _viewRenderCount + ' (pending edit)', {
      viewId: viewId,
      resettingSettleTimer: SETTLE_MS + 'ms'
    });
    // Coordinated post-edit flow: reset settle timer on each render.
    // The restore sequence runs SETTLE_MS after the LAST view-render,
    // ensuring all async-fetched views have finished.
    if (_settleTimer) clearTimeout(_settleTimer);
    _settleTimer = setTimeout(runPostEditRestore, SETTLE_MS);
  });

  // ══════════════════════════════════════════════════════════
  //  Post-edit restoration sequence
  // ══════════════════════════════════════════════════════════

  function runPostEditRestore() {
    log('--- runPostEditRestore START ---', {
      trigger: _settleTimer ? 'settle' : 'safety',
      viewRenders: _viewRenderCount,
      pageHeight: document.body.scrollHeight,
      scrollTop: $(window).scrollTop()
    });
    _viewRenderCount = 0;

    // Clear timers (we may have been called by either settle or safety)
    if (_settleTimer) { clearTimeout(_settleTimer); _settleTimer = null; }
    if (_safetyTimer) { clearTimeout(_safetyTimer); _safetyTimer = null; }

    // Capture the frozen page key before any async work
    var frozenPageKey = _savedAnchor ? _savedAnchor.pageKey : getPageKey();

    // Step 1: Verify DOM readiness — poll until tables have content rows.
    log('step 1: polling for DOM readiness');
    pollForDOM(function () {
      log('step 1 done: DOM ready', { pageHeight: document.body.scrollHeight });

      // Step 2: Re-enable group-collapse auto-enhancement
      log('step 2: re-enable group-collapse');
      if (window.SCW && window.SCW.groupCollapse) {
        window.SCW.groupCollapse.suppress(false);
      }

      // Step 3: REBUILD GROUPED ACCORDIONS
      var heightBefore = document.body.scrollHeight;
      log('step 3: group-collapse enhance', { pageHeight: heightBefore });
      if (window.SCW && window.SCW.groupCollapse) {
        window.SCW.groupCollapse.enhance();
      }
      var heightAfterGC = document.body.scrollHeight;
      if (heightAfterGC !== heightBefore) {
        log('step 3: page height CHANGED by group-collapse', {
          before: heightBefore, after: heightAfterGC, delta: heightAfterGC - heightBefore
        });
      }

      // Step 4: SYNC KTL ACCORDIONS
      log('step 4: KTL accordion refresh');
      if (window.SCW && window.SCW.ktlAccordion) {
        window.SCW.ktlAccordion.refresh();
        if (window.SCW.ktlAccordion.restoreState) {
          window.SCW.ktlAccordion.restoreState();
        }
      }
      var heightAfterKTL = document.body.scrollHeight;
      if (heightAfterKTL !== heightAfterGC) {
        log('step 4: page height CHANGED by KTL accordion', {
          before: heightAfterGC, after: heightAfterKTL, delta: heightAfterKTL - heightAfterGC
        });
      }

      // Step 5: RESTORE SCROLL POSITION
      log('step 5: waiting 2 rAF frames for layout');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var heightAtRestore = document.body.scrollHeight;
          log('step 5: restoring scroll', {
            pageHeight: heightAtRestore,
            scrollBefore: $(window).scrollTop()
          });

          // Primary: anchor-based restore (reliable when layout changes)
          var anchorWorked = restoreFromAnchor();

          // Fallback: pixel-based restore using frozen page key
          if (!anchorWorked) {
            log('anchor failed — falling back to pixel restore');
            restoreWithFrozenKey(frozenPageKey);
          }

          var scrollAfterRestore = $(window).scrollTop();
          _pendingEdit = false;

          // Signal that post-edit restoration is complete
          document.dispatchEvent(new CustomEvent('scw-post-edit-ready'));

          // Step 6: DRIFT CHECK — detect if something moves the scroll
          // AFTER we restored it (e.g., a late MutationObserver, KTL
          // re-render, or browser auto-scroll).  Log after a short delay.
          if (_debug) {
            var checkScroll = scrollAfterRestore;
            setTimeout(function () {
              var now = $(window).scrollTop();
              var heightNow = document.body.scrollHeight;
              if (Math.abs(now - checkScroll) > 3) {
                log('POST-RESTORE DRIFT DETECTED', {
                  restoredTo: checkScroll,
                  nowAt: now,
                  drift: now - checkScroll,
                  heightAtRestore: heightAtRestore,
                  heightNow: heightNow,
                  heightDelta: heightNow - heightAtRestore
                });
              } else {
                log('=== RESTORE COMPLETE (stable) ===', {
                  finalScroll: now, pageHeight: heightNow
                });
              }
            }, 500);
          }
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

  // Debug mode — getter/setter on the public API so you can toggle
  // from the console:  SCW.scrollPreserve.debug = true
  Object.defineProperty(window.SCW.scrollPreserve, 'debug', {
    get: function () { return _debug; },
    set: function (val) {
      _debug = !!val;
      if (_debug) {
        console.log(
          '%c[scroll] Debug ON — edit any cell to see the full restore timeline.',
          'color:#1a73e8; font-weight:bold'
        );
      }
    }
  });
})();
