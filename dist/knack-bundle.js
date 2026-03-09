// src/config.js
window.SCW = window.SCW || {};
window.SCW.CONFIG = window.SCW.CONFIG || {
  VERSION: "dev",
  MAKE_PHOTO_MOVE_WEBHOOK: "https://hook.us1.make.com/7oetygbj2g2hu5fspgtt5kcydjojid81"
};
window.SCW = window.SCW || {};

(function initBindingsHelpers(namespace) {
  function normalizeNamespace(ns) {
    if (!ns) return '.scw';
    return ns.startsWith('.') ? ns : `.${ns}`;
  }

  namespace.onViewRender = function onViewRender(viewId, handler, ns) {
    if (!viewId || typeof handler !== 'function') return;
    const eventName = `knack-view-render.${viewId}${normalizeNamespace(ns)}`;
    $(document).off(eventName).on(eventName, handler);
  };

  namespace.onSceneRender = function onSceneRender(sceneId, handler, ns) {
    if (!sceneId || typeof handler !== 'function') return;
    const eventName = `knack-scene-render.${sceneId}${normalizeNamespace(ns)}`;
    $(document).off(eventName).on(eventName, handler);
  };
})(window.SCW);
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

    $('[id^="view_"]').filter(':visible').each(function () {
      // Only match canonical view IDs (view_1234)
      if (!/^view_\d+$/.test(this.id)) return;

      var rect = this.getBoundingClientRect();
      var dist = Math.abs(rect.top);
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
  }

  /**
   * SCROLL RESTORE (anchor): Scroll so the saved view element is at
   * the same viewport offset it had before the edit.
   * Returns true if the anchor was found and scroll was applied.
   */
  function restoreFromAnchor() {
    if (!_savedAnchor) return false;
    var anchor = _savedAnchor;
    _savedAnchor = null;

    var el = document.getElementById(anchor.id);
    if (!el || !$(el).is(':visible')) return false;

    var rect = el.getBoundingClientRect();
    var drift = rect.top - anchor.topOffset;

    // Only adjust if the drift is meaningful (> 5px)
    if (Math.abs(drift) > 5) {
      $(window).scrollTop($(window).scrollTop() + drift);
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
        $(window).scrollTop(pos);
      }
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
    clearPendingState();
    setTimeout(restore, 300);
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
    save();            // pixel position (for reload / SPA nav fallback)
    saveAnchor();      // contextual anchor (for post-edit restore)
    _pendingEdit = true;

    // Tell group-collapse to stop auto-enhancing from its own
    // MutationObserver and view-render timer — we'll call it
    // explicitly once all views have settled.
    if (window.SCW && window.SCW.groupCollapse) {
      window.SCW.groupCollapse.suppress(true);
    }

    // Safety net: if no knack-view-render fires within 3s (e.g.,
    // Knack updated the cell in-place without a full view re-render),
    // run restore anyway so we don't stay stuck.
    if (_safetyTimer) clearTimeout(_safetyTimer);
    _safetyTimer = setTimeout(function () {
      _safetyTimer = null;
      if (_pendingEdit) {
        runPostEditRestore();
      }
    }, SAFETY_TIMEOUT_MS);
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
    // Clear timers (we may have been called by either settle or safety)
    if (_settleTimer) { clearTimeout(_settleTimer); _settleTimer = null; }
    if (_safetyTimer) { clearTimeout(_safetyTimer); _safetyTimer = null; }

    // Capture the frozen page key before any async work
    var frozenPageKey = _savedAnchor ? _savedAnchor.pageKey : getPageKey();

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
          // Primary: anchor-based restore (reliable when layout changes)
          var anchorWorked = restoreFromAnchor();

          // Fallback: pixel-based restore using frozen page key
          if (!anchorWorked) {
            restoreWithFrozenKey(frozenPageKey);
          }

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
// ============================================================
// Remember KTL hide/show view collapsed / open state
// ============================================================
//
// KTL adds hide/show toggle buttons to Knack views. By default
// the state resets on every page load. This feature persists
// each view's collapsed/open state in localStorage so it
// survives refreshes and session navigation.
//
// How it works:
//   1. A MutationObserver detects when KTL injects its buttons.
//   2. On detection, any saved state that differs from KTL's
//      default is restored by programmatically clicking the
//      toggle button.
//   3. User clicks on KTL buttons are captured (delegated) and
//      the resulting state is saved to localStorage.
//
// Storage key format:
//   scw:ktlHideShow:<viewKey>  →  "open" | "collapsed"
//
// Global API:
//   SCW.ktlHideShowState.clearAll()  – remove all saved states
//   SCW.ktlHideShowState.clear(key)  – remove state for one view
//
(function () {
  'use strict';

  var STORAGE_PREFIX = 'scw:ktlHideShow:';
  var EVENT_NS = '.scwKtlHideShowState';

  // ── helpers ──

  function viewKeyFromButtonId(id) {
    // hideShow_view_1234_button  →  view_1234
    var m = (id || '').match(/^hideShow_(view_\d+)_button$/);
    return m ? m[1] : null;
  }

  function arrowIdFromViewKey(viewKey) {
    return 'hideShow_' + viewKey + '_arrow';
  }

  function isCollapsed(viewKey) {
    var $arrow = $('#' + arrowIdFromViewKey(viewKey));
    // .ktlUp = content is hidden/collapsed
    return $arrow.hasClass('ktlUp');
  }

  function saveState(viewKey, collapsed) {
    try {
      localStorage.setItem(
        STORAGE_PREFIX + viewKey,
        collapsed ? 'collapsed' : 'open'
      );
    } catch (e) { /* quota / private mode */ }
  }

  function loadState(viewKey) {
    try {
      return localStorage.getItem(STORAGE_PREFIX + viewKey); // "open" | "collapsed" | null
    } catch (e) {
      return null;
    }
  }

  function clearState(viewKey) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + viewKey);
    } catch (e) { /* ignore */ }
  }

  function clearAll() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(STORAGE_PREFIX) === 0) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  // ── restore ──

  // Set of view keys already restored this scene render,
  // prevents double-clicking if observer fires multiple times.
  var restoredThisRender = {};

  function restoreIfNeeded(viewKey) {
    if (restoredThisRender[viewKey]) return;

    var saved = loadState(viewKey);
    if (!saved) return; // no saved preference — keep KTL default

    var currentlyCollapsed = isCollapsed(viewKey);
    var wantCollapsed = saved === 'collapsed';

    if (currentlyCollapsed === wantCollapsed) {
      // Already matches — just mark as handled
      restoredThisRender[viewKey] = true;
      return;
    }

    // Click the button to toggle to the desired state
    restoredThisRender[viewKey] = true;
    var $btn = $('#hideShow_' + viewKey + '_button');
    if ($btn.length) {
      $btn[0].click();
    }
  }

  function restoreAllVisible() {
    $('[id^="hideShow_view_"][id$="_button"].ktlHideShowButton').each(function () {
      var viewKey = viewKeyFromButtonId(this.id);
      if (viewKey) restoreIfNeeded(viewKey);
    });
  }

  // ── capture user clicks ──

  $(document)
    .off('click' + EVENT_NS, '.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]')
    .on('click' + EVENT_NS, '.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]', function () {
      var viewKey = viewKeyFromButtonId(this.id);
      if (!viewKey) return;

      // KTL toggles the class synchronously on click, but let's
      // read after a micro-task to be safe.
      var vk = viewKey;
      setTimeout(function () {
        saveState(vk, isCollapsed(vk));
      }, 50);
    });

  // ── MutationObserver: detect KTL button injection ──

  var pendingRaf = 0;
  var observer = new MutationObserver(function () {
    if (pendingRaf) cancelAnimationFrame(pendingRaf);
    pendingRaf = requestAnimationFrame(function () {
      pendingRaf = 0;
      restoreAllVisible();
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ── scene render: reset the "already restored" guard ──

  $(document).on('knack-scene-render.any' + EVENT_NS, function () {
    restoredThisRender = {};
  });

  // ── initial pass (in case KTL buttons already exist) ──

  $(document).ready(function () {
    setTimeout(restoreAllVisible, 500);
  });

  // ── expose API ──

  window.SCW = window.SCW || {};
  window.SCW.ktlHideShowState = {
    clear: function (viewKey) { clearState(viewKey); },
    clearAll: clearAll
  };
})();
/******************  Global Style Overrides  ***************/
(function () {
  'use strict';

  /* ── KTL hide/show button color palette ── */
  const KTL_DEFAULT_COLOR = '#295f91';

  /* Per-view colour overrides are now driven by the _hsvcolor= keyword
     in each view's description.  See extract-hsv-color.js.              */

  const id = 'scw-global-styles-css';
  if (document.getElementById(id)) return;

  const css = `

    /* H1 headings */
    h1:not(.kn-title) {
      color: #07467c;
      font-weight: 800;
      margin-bottom: 0.5em;
      margin-top: 55px;
      font-size: 28px !important;
      opacity: .8;
      overflow: visible !important;
    }

    /* H2 headings */
    h2:not(.kn-title) {
      font-weight: 800 !important;
      color: #07467c !important;
      font-size: 20px !important;
      margin-top: 30px !important;
    }

    /* Pull section-header H2s tight against the ktlHideShowButton that follows */
    .kn-rich_text:has(+ .kn-view .ktlHideShowButton) h2 {
      margin-bottom: -15px !important;
    }

    /* KTL hide/show (shrink) button */
    a.ktlShrinkLink {
      font-size: 14px !important;
    }

    /* ─── Modern Accordion: view wrapper ─── */
    section.ktlBoxWithBorder {
      border-radius: 14px !important;
      overflow: hidden !important;
      margin: 8px 10px !important;
      box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06);
      transition: box-shadow 200ms ease;
    }
    section.ktlBoxWithBorder:hover {
      box-shadow: 0 2px 6px rgba(0,0,0,.10), 0 1px 3px rgba(0,0,0,.08);
    }

    /* ─── Modern Accordion: header button ─── */
    .ktlHideShowButton[id^="hideShow_view_"][id$="_button"] {
      position: relative;
      display: flex !important;
      align-items: center;
      width: 100%;
      font-weight: 600;
      font-size: 14px !important;
      color: #fff;
      background-color: ${KTL_DEFAULT_COLOR};
      border-radius: 0 !important;
      padding: 10px 40px 10px 14px !important;
      border: 0 !important;
      box-sizing: border-box;
      transition: background-color 180ms ease, filter 180ms ease;
      cursor: pointer;
    }
    .ktlHideShowButton[id^="hideShow_view_"][id$="_button"]:hover {
      filter: brightness(1.08);
    }

    /* ─── Modern Accordion: chevron arrow ─── */
    span.ktlArrow[id^="hideShow_view_"][id$="_arrow"] {
      position: absolute;
      right: 14px;
      top: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.1em;
      height: 1.1em;
      transform-origin: 50% 50%;
      transition: transform 220ms ease;
    }
    /* Collapsed state (.ktlUp = content hidden) — chevron points right */
    span.ktlArrow[id^="hideShow_view_"][id$="_arrow"].ktlUp {
      transform: translateY(-50%) rotate(-90deg);
    }
    /* Expanded state (.ktlDown = content visible) — chevron points down */
    span.ktlArrow[id^="hideShow_view_"][id$="_arrow"].ktlDown {
      transform: translateY(-50%) rotate(0deg);
    }

    /* ─── Modern Accordion: branded view wrapper ─── */
    .kn-view:has(.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]) {
      margin-bottom: 2px !important;
      background-color: ${KTL_DEFAULT_COLOR};
      max-width: 100%;
      padding: 5px 5px 10px 5px !important;
      border-radius: 14px !important;
      transition: background-color 180ms ease;
    }

    /* Per-view color overrides now applied dynamically by extract-hsv-color.js */

    /* Submit buttons — only inside KTL hide/show views */
    .kn-view:has(.ktlHideShowButton) input[type=submit],
    .kn-view:has(.ktlHideShowButton) .kn-submit button.kn-button.is-primary {
      font-size: 14px !important;
      width: 80% !important;
      display: block !important;
      margin-left: auto !important;
      margin-right: auto !important;
      background-color: rgba(237,131,38,.9) !important;
    }


    /* Menu buttons */
    .kn-menu div.control:not(.has-addons) a.kn-link.kn-button {
      background-color: rgba(237,131,38, 1) !important;
      color: white !important;
      font-weight: 600 !important;
      padding: 10px !important;
      width: 33% !important;
    }
    .kn-menu .control:not(.has-addons) {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 50px;
      width: 100% !important;
    }
  `;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*************  Global Style Overrides  **************************/
// ============================================================
// Inline-edit checkbox layout improvements
// ============================================================
//
// 1. Fix text indentation: when a checkbox label wraps to multiple
//    lines, subsequent lines align with the start of the text
//    (not under the checkbox itself).
//
// 2. Multi-column: when a checkbox list has more than 20 items
//    the list switches to a two-column grid so it fits on screen.
//    A scrollable max-height is also applied for very long lists.
//
(function () {
  'use strict';

  var STYLE_ID = 'scw-inline-checkbox-layout-css';
  var MULTI_COL_CLASS = 'scw-checkbox-multi-col';
  var ITEM_THRESHOLD = 20;

  // ---- inject CSS (once) ----
  if (!document.getElementById(STYLE_ID)) {
    var css = [
      // --- Fix label indentation ---
      // Make the label a flex row so checkbox stays left and text wraps within its own lane.
      '.kn-popover .conn_inputs label.option.checkbox {',
      '  display: flex;',
      '  align-items: flex-start;',
      '  gap: 4px;',
      '  line-height: 1.4;',
      '}',
      '.kn-popover .conn_inputs label.option.checkbox input[type="checkbox"] {',
      '  flex-shrink: 0;',
      '  margin-top: 3px;',
      '}',
      '.kn-popover .conn_inputs label.option.checkbox span {',
      '  flex: 1;',
      '  min-width: 0;',
      '}',

      // --- Multi-column grid (applied via JS class) ---
      '.kn-popover .conn_inputs.' + MULTI_COL_CLASS + ' {',
      '  display: grid;',
      '  grid-template-columns: 1fr 1fr;',
      '  gap: 2px 20px;',
      '}',
      // Widen the popover so two columns have room
      '.drop.kn-popover:has(.' + MULTI_COL_CLASS + ') {',
      '  max-width: 90vw;',
      '  width: max-content;',
      '}',
      '.drop.kn-popover:has(.' + MULTI_COL_CLASS + ') .drop-content {',
      '  max-width: 90vw;',
      '}',
      // Scrollable container for very long lists
      '.kn-popover .conn_inputs.' + MULTI_COL_CLASS + ' {',
      '  max-height: 70vh;',
      '  overflow-y: auto;',
      '}',
    ].join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- observe popover checkbox lists and apply multi-column class ----
  function processPopover(popover) {
    var lists = popover.querySelectorAll('.conn_inputs');
    for (var i = 0; i < lists.length; i++) {
      var items = lists[i].querySelectorAll(':scope > .control');
      if (items.length > ITEM_THRESHOLD) {
        lists[i].classList.add(MULTI_COL_CLASS);
      } else {
        lists[i].classList.remove(MULTI_COL_CLASS);
      }
    }
  }

  // Use MutationObserver to catch popovers as they open
  var observer = new MutationObserver(function (mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var mutation = mutations[m];

      // Check for class changes (drop-open being added)
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        var el = mutation.target;
        if (el.classList.contains('kn-popover') && el.classList.contains('drop-open')) {
          processPopover(el);
        }
      }

      // Check for newly added popover nodes
      if (mutation.type === 'childList') {
        for (var n = 0; n < mutation.addedNodes.length; n++) {
          var node = mutation.addedNodes[n];
          if (node.nodeType === 1) {
            if (node.classList.contains('kn-popover')) {
              processPopover(node);
            }
            var nested = node.querySelectorAll
              ? node.querySelectorAll('.kn-popover')
              : [];
            for (var k = 0; k < nested.length; k++) {
              processPopover(nested[k]);
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
})();
/*****************  Extract _hsvcolor keyword from view descriptions  *************/
(function () {
  'use strict';

  const COLOR_KEYWORDS = {
    'documentation':          '#4A4F9C',
    'project-scope-details':  '#3F6E70',
    'passive-info':           '#5F6B7A',
  };

  const STYLE_ID = 'scw-hsv-color-overrides-css';
  const EVENT_NS = '.scwHsvColor';

  // Optional debug toggle
  const DEBUG = false;
  function log() { if (DEBUG) console.log.apply(console, arguments); }

  /**
   * Resolve a raw _hsvcolor value (keyword name or hex literal) to a
   * CSS colour string, or return null if unrecognised.
   */
  function resolveColorValue(raw) {
    if (!raw) return null;
    var v = raw.trim().toLowerCase();
    if (COLOR_KEYWORDS[v]) return COLOR_KEYWORDS[v];
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
    return null;
  }

  /**
   * Try to pull the _hsvcolor value from KTL's pre-parsed keyword cache.
   *
   * KTL strips all underscore-prefixed keywords from view descriptions
   * at init time (via cleanUpKeywords) and stores the parsed results in
   * window.ktlKeywords[viewKey].  By the time our render handler fires
   * the raw description no longer contains _hsvcolor=…, so we must read
   * from the cache instead.
   *
   * The cache structure is:
   *   ktlKeywords[viewKey]._hsvcolor = [ entry, … ]
   * where each entry is an object:
   *   { params: [["project-scope-details"]], paramStr: "[project-scope-details]" }
   * i.e. entry.params is an array of arrays (parameter groups).
   */
  function readFromKtlKeywords(viewKey) {
    try {
      var kw = window.ktlKeywords;
      if (!kw) return null;
      var vkw = kw[viewKey];
      if (!vkw || !vkw._hsvcolor) return null;

      var entries = vkw._hsvcolor;
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var val;

        if (typeof entry === 'string') {
          val = entry;
        } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          // Object with .params array — params[0] is itself an array.
          var p = entry.params;
          if (Array.isArray(p) && p.length > 0) {
            val = Array.isArray(p[0]) ? p[0][0] : p[0];
          }
          // Also try paramStr as a direct fallback.
          if (!val && entry.paramStr) {
            val = entry.paramStr.replace(/^\[|\]$/g, '');
          }
        } else if (Array.isArray(entry)) {
          val = Array.isArray(entry[0]) ? entry[0][0] : entry[0];
        }
        var resolved = resolveColorValue(val);
        if (resolved) return resolved;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /**
   * Find a view model reliably by view key (e.g., "view_3477")
   */
  function getViewModelByKey(viewKey) {
    try {
      // 1) If the view is rendered, Knack.views is usually the best source
      if (window.Knack && Knack.views && Knack.views[viewKey] && Knack.views[viewKey].model) {
        return Knack.views[viewKey].model;
      }

      // 2) Fall back to current scene view collection
      const scene = Knack && Knack.router && Knack.router.scene_view;
      const collection = scene && scene.model && scene.model.views;
      if (!collection || !collection.models) return null;

      // Search by "key" (NOT by .get(viewKey))
      for (let i = 0; i < collection.models.length; i++) {
        const m = collection.models[i];
        if (m && m.attributes && m.attributes.key === viewKey) return m;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract the _hsvcolor= value from a Knack view's description.
   * Accepted formats:
   *   _hsvcolor=documentation
   *   _hsvcolor=#cc3300
   *
   * Strategy:
   *   1. Read from KTL's pre-parsed keyword cache (primary — works after
   *      KTL has stripped the description).
   *   2. Fall back to raw description parsing (covers the case where KTL
   *      is not loaded or has not yet initialised).
   */
  function extractHsvColor(viewKey) {
    try {
      // ── Strategy 1: KTL keyword cache ──
      var fromKtl = readFromKtlKeywords(viewKey);
      if (fromKtl) return fromKtl;

      // ── Strategy 2: raw description (fallback) ──
      const viewModel = getViewModelByKey(viewKey);
      if (!viewModel) { log('[hsv] no viewModel for', viewKey); return null; }

      const desc = viewModel.attributes && viewModel.attributes.description;
      if (!desc) { log('[hsv] no description for', viewKey); return null; }

      // Normalize <br> to whitespace
      const text = String(desc).replace(/<br\s*\/?>/gi, ' ');

      const match = text.match(/_hsvcolor=([^\s<]+)/i);
      if (!match) { log('[hsv] no _hsvcolor token for', viewKey); return null; }

      return resolveColorValue(match[1]);
    } catch (e) {
      return null;
    }
  }

  function applyHsvColors() {
    const buttons = document.querySelectorAll(
      '.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]'
    );

    const rules = [];

    Array.prototype.forEach.call(buttons, function (btn) {
      const m = btn.id.match(/^hideShow_(view_\d+)_button$/);
      if (!m) return;

      const viewKey = m[1];
      const color = extractHsvColor(viewKey);
      if (!color) return;

      rules.push(
        '/* ── ' + viewKey + ' via _hsvcolor ── */\n' +
        '#hideShow_' + viewKey + '_button.ktlHideShowButton { background-color: ' + color + ' !important; }\n' +
        // wrapper: best-effort (Knack view wrapper)
        '#' + viewKey + ' { background-color: ' + color + ' !important; }\n' +
        // original intent: only when it contains KTL button (works in modern Chrome)
        '#' + viewKey + ':has(.ktlHideShowButton) { background-color: ' + color + ' !important; }'
      );
    });

    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();

    if (!rules.length) { log('[hsv] no rules generated'); return; }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = rules.join('\n');
    document.head.appendChild(style);

    log('[hsv] applied rules:', rules.length);
  }

  // KTL often injects after the render event; do a short delayed pass.
  function applySoon() {
    applyHsvColors();
    setTimeout(applyHsvColors, 50);
    setTimeout(applyHsvColors, 250);
  }

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      applySoon();
    });
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      applyHsvColors();
    });

  // Also run once on load (covers direct page hits + cached renders)
  $(function () {
    applySoon();
  });

  window.SCW = window.SCW || {};
  window.SCW.extractHsvColor = extractHsvColor;
})();
/*************  Extract _hsvcolor keyword from view descriptions  ************/
/**
 * ─── Primary Accordion Style ───────────────────────────────────────────
 *
 * Wraps every KTL hide/show section in a unified accordion card so the
 * header and body share one container — eliminating the "small dropdown
 * on top of a big purple bar" problem.
 *
 * DOM STRUCTURE PRODUCED
 *   <div class="scw-ktl-accordion [is-expanded]"
 *        style="--scw-accent:…; --scw-accent-rgb:…">
 *     <div class="scw-ktl-accordion__header" role="button" tabindex="0">
 *       <span class="scw-acc-icon">…</span>
 *       <span class="scw-acc-title">…</span>
 *       <span class="scw-acc-count">…</span>
 *       <span class="scw-acc-chevron">…</span>
 *     </div>
 *     <div class="scw-ktl-accordion__body">
 *       <!-- original .kn-view is moved here -->
 *     </div>
 *   </div>
 *
 * The original .ktlHideShowButton stays in the DOM (KTL is source of
 * truth for toggle state) but is visually hidden.  Clicking our header
 * forwards to buttonEl.click().
 *
 * ────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  var DEBUG = false;
  function log() { if (DEBUG) console.debug.apply(console, ['[ktl-accordion]'].concat(Array.prototype.slice.call(arguments))); }

  var EVENT_NS   = '.scwKtlAccordion';
  var STYLE_ID   = 'scw-ktl-accordion-css';
  var ENHANCED   = 'data-scw-ktl-accordion';
  var OPT_OUT    = 'data-scw-no-accordion';
  var BTN_SEL    = '.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]';

  // ── SVG icons ──
  var DEFAULT_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '</svg>';

  var CHEVRON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 12 15 18 9"/>' +
    '</svg>';

  // ───────────────────────────────────────────────────
  //  CSS injection (once)
  // ───────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      /* ══════════════════════════════════════════════════
         1) The accordion card container — our wrapper owns
            the visual card (background, border, radius, shadow).
         ══════════════════════════════════════════════════ */
      '.scw-ktl-accordion {',
      '  --scw-accent: #295f91;',
      '  --scw-accent-rgb: 41, 95, 145;',
      '  background: #fff;',
      '  border: 1px solid rgba(0,0,0,.08);',
      '  border-radius: 14px;',
      '  box-shadow: 0 2px 12px rgba(0,0,0,.06);',
      '  overflow: hidden;',
      '  margin: 10px 0;',
      '  max-width: 100%;',
      '}',

      /* ══════════════════════════════════════════════════
         2) Neutralize legacy styles ONLY inside our wrapper
            so unenhanced KTL sections are untouched.
         ══════════════════════════════════════════════════ */

      /* Cancel the global :has(.ktlHideShowButton) legacy rule on the
         .kn-view host element itself — this is the source of the
         accent-colored background slab. */
      '.kn-view.scw-ktl-accordion-host,',
      '.kn-view.scw-ktl-accordion-host:has(.ktlHideShowButton) {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '  padding: 0 !important;',
      '  margin: 0 !important;',
      '  border-radius: 0 !important;',
      '  box-shadow: none !important;',
      '  max-width: 100% !important;',
      '  overflow: visible !important;',
      '}',

      /* Cancel legacy slab on ktlBoxWithBorder containers */
      'section.ktlBoxWithBorder.scw-ktl-accordion-host,',
      '.scw-ktl-accordion .ktlBoxWithBorder,',
      '.scw-ktl-accordion section.ktlBoxWithBorder {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '}',

      /* Also kill inner .kn-view and ktlHideShowSection chrome */
      '.scw-ktl-accordion .kn-view,',
      '.scw-ktl-accordion .kn-view[id^="view_"] {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '  padding: 0 !important;',
      '  margin: 0 !important;',
      '  border-radius: 0 !important;',
      '  box-shadow: none !important;',
      '  max-width: 100% !important;',
      '  overflow: visible !important;',
      '}',

      '.scw-ktl-accordion .ktlHideShowSection {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '  padding: 0 !important;',
      '  margin: 0 !important;',
      '  border-radius: 0 !important;',
      '  box-shadow: none !important;',
      '  border: none !important;',
      '  overflow: visible !important;',
      '}',

      /* Visually hide the original KTL button (accessible) */
      '.scw-ktl-accordion ' + BTN_SEL + ' {',
      '  position: absolute !important;',
      '  width: 1px !important;',
      '  height: 1px !important;',
      '  padding: 0 !important;',
      '  margin: -1px !important;',
      '  overflow: hidden !important;',
      '  clip: rect(0,0,0,0) !important;',
      '  white-space: nowrap !important;',
      '  border: 0 !important;',
      '  background: transparent !important;',
      '  color: inherit !important;',
      '}',

      /* ══════════════════════════════════════════════════
         3) Header row
         ══════════════════════════════════════════════════ */
      '.scw-ktl-accordion__header {',
      '  position: relative;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  width: 100%;',
      '  min-height: 44px;',
      '  padding: 14px 16px 14px 22px;',
      '  margin: 0;',
      '  background: transparent;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  box-sizing: border-box;',
      '  transition: background 180ms ease;',
      '}',

      /* Left accent bar */
      '.scw-ktl-accordion__header::before {',
      '  content: "";',
      '  position: absolute;',
      '  left: 0;',
      '  top: 0;',
      '  bottom: 0;',
      '  width: 6px;',
      '  background: var(--scw-accent);',
      '  border-radius: 14px 0 0 0;',
      '}',

      /* hover */
      '.scw-ktl-accordion__header:hover {',
      '  background: rgba(var(--scw-accent-rgb), 0.06);',
      '}',

      /* expanded state on the wrapper */
      '.scw-ktl-accordion.is-expanded .scw-ktl-accordion__header {',
      '  background: rgba(var(--scw-accent-rgb), 0.10);',
      '}',
      '.scw-ktl-accordion.is-expanded .scw-ktl-accordion__header:hover {',
      '  background: rgba(var(--scw-accent-rgb), 0.14);',
      '}',

      /* Expanded accent bar — round bottom-left too */
      '.scw-ktl-accordion:not(.is-expanded) .scw-ktl-accordion__header::before {',
      '  border-radius: 14px 0 0 14px;',
      '}',

      /* focus-visible */
      '.scw-ktl-accordion__header:focus-visible {',
      '  outline: 2px solid var(--scw-accent);',
      '  outline-offset: -2px;',
      '}',

      /* ── icon ── */
      '.scw-ktl-accordion__header .scw-acc-icon {',
      '  flex: 0 0 auto;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 28px;',
      '  margin-right: 6px;',
      '  color: var(--scw-accent);',
      '  opacity: .75;',
      '}',

      /* ── title ── */
      '.scw-ktl-accordion__header .scw-acc-title {',
      '  flex: 1 1 auto;',
      '  padding: 0 8px 0 0;',
      '  font-size: 14px;',
      '  font-weight: 600;',
      '  color: #1a1a1a;',
      '  line-height: 1.4;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  text-align: left;',
      '}',

      /* ── count pill ── */
      '.scw-ktl-accordion__header .scw-acc-count {',
      '  flex: 0 0 auto;',
      '  display: inline-block;',
      '  padding: 4px 10px;',
      '  margin-right: 8px;',
      '  font-size: 12px;',
      '  font-weight: 600;',
      '  line-height: 1.4;',
      '  border-radius: 999px;',
      '  background: rgba(var(--scw-accent-rgb), 0.12);',
      '  border: 1px solid rgba(var(--scw-accent-rgb), 0.22);',
      '  color: rgb(var(--scw-accent-rgb));',
      '}',

      /* ── chevron ── */
      '.scw-ktl-accordion__header .scw-acc-chevron {',
      '  flex: 0 0 auto;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 24px;',
      '  color: var(--scw-accent);',
      '  transition: transform 220ms ease;',
      '  transform: rotate(0deg);',
      '}',
      '.scw-ktl-accordion:not(.is-expanded) .scw-acc-chevron {',
      '  transform: rotate(-90deg);',
      '}',

      /* ══════════════════════════════════════════════════
         4) Body — ALWAYS neutral white; accent stays in header only.
            Collapses when closed (via JS in syncState).
         ══════════════════════════════════════════════════ */
      '.scw-ktl-accordion__body {',
      '  padding: 10px 12px 14px 12px;',
      '  background: #fff !important;',
      '  overflow-x: auto;',
      '}',

      /* Legacy accent containers inside the body — targeted instead of
         wildcard * so table striping and other content backgrounds
         are preserved. */
      '.scw-ktl-accordion__body > .kn-view,',
      '.scw-ktl-accordion__body .ktlBoxWithBorder,',
      '.scw-ktl-accordion__body .ktlHideShowSection,',
      '.scw-ktl-accordion__body .view-header {',
      '  background: transparent !important;',
      '  background-color: transparent !important;',
      '}',

      /* ══════════════════════════════════════════════════
         5) Hide duplicate KTL header and shrink link
         ══════════════════════════════════════════════════ */

      /* Hide the view-header that contains the KTL button (duplicate title) */
      '.scw-ktl-accordion .view-header:has(.ktlHideShowButton) {',
      '  display: none !important;',
      '}',

      /* Hide shrink link — our chevron replaces it */
      '.scw-ktl-accordion a.ktlShrinkLink {',
      '  display: none !important;',
      '}',
    ].join('\n');

    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ───────────────────────────────────────────────────
  //  Helpers
  // ───────────────────────────────────────────────────
  function viewKeyFromButtonId(id) {
    var m = (id || '').match(/^hideShow_(view_\d+)_button$/);
    return m ? m[1] : null;
  }

  function arrowForViewKey(viewKey) {
    return document.getElementById('hideShow_' + viewKey + '_arrow');
  }

  /** Is the KTL section currently expanded?
   *  Primary: check computed display of the KTL hide/show section.
   *  Fallback: check arrow class.
   */
  function isExpanded(viewKey) {
    // Check the actual KTL section visibility (source of truth)
    var section = document.querySelector('.hideShow_' + viewKey + '.ktlHideShowSection');
    if (section) {
      var disp = getComputedStyle(section).display;
      return disp !== 'none';
    }
    // Fallback to arrow class
    var arrow = arrowForViewKey(viewKey);
    if (!arrow) return true;
    return arrow.classList.contains('ktlDown');
  }

  /** Read the effective background-color from the KTL button. */
  function readAccentColor(btn) {
    var raw = getComputedStyle(btn).backgroundColor;
    if (!raw || raw === 'rgba(0, 0, 0, 0)' || raw === 'transparent') return null;
    return raw;
  }

  /**
   * Parse an rgb(r,g,b) or rgba(r,g,b,a) string into "r, g, b" for use
   * in rgba(var(--scw-accent-rgb), alpha).
   */
  function parseRgb(cssColor) {
    if (!cssColor) return null;
    var m = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    return m[1] + ', ' + m[2] + ', ' + m[3];
  }

  /** Extract title text from KTL button, stripping arrow text. */
  function readTitle(btn) {
    var clone = btn.cloneNode(true);
    var arrows = clone.querySelectorAll('.ktlArrow');
    for (var i = 0; i < arrows.length; i++) arrows[i].remove();
    var text = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    return text || 'Section';
  }

  /** Best-effort record count from content container. */
  function computeCount(viewKey) {
    var viewEl = document.getElementById(viewKey);
    if (!viewEl) return null;

    var tbody = viewEl.querySelector('table.kn-table tbody');
    if (tbody) {
      var rows = tbody.querySelectorAll('tr');
      var real = 0;
      for (var i = 0; i < rows.length; i++) {
        if (!rows[i].classList.contains('kn-tr-nodata') &&
            !rows[i].classList.contains('kn-table-group') &&
            !rows[i].classList.contains('kn-table-totals')) {
          real++;
        }
      }
      return real > 0 ? real : null;
    }

    var paging = viewEl.querySelector('.kn-entries-summary');
    if (paging) {
      var m = (paging.textContent || '').match(/of\s+(\d+)/);
      if (m) return parseInt(m[1], 10) || null;
    }

    return null;
  }

  // ───────────────────────────────────────────────────
  //  Build accordion header
  // ───────────────────────────────────────────────────
  function buildHeader(btn, viewKey) {
    var header = document.createElement('div');
    header.className = 'scw-ktl-accordion__header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'true');
    header.setAttribute('data-view-key', viewKey);

    var iconWrap = document.createElement('span');
    iconWrap.className = 'scw-acc-icon';
    iconWrap.innerHTML = DEFAULT_ICON_SVG;
    header.appendChild(iconWrap);

    var titleWrap = document.createElement('span');
    titleWrap.className = 'scw-acc-title';
    titleWrap.textContent = readTitle(btn);
    header.appendChild(titleWrap);

    var countWrap = document.createElement('span');
    countWrap.className = 'scw-acc-count';
    countWrap.style.display = 'none';
    header.appendChild(countWrap);

    var chevronWrap = document.createElement('span');
    chevronWrap.className = 'scw-acc-chevron';
    chevronWrap.innerHTML = CHEVRON_SVG;
    header.appendChild(chevronWrap);

    return header;
  }

  function syncState(wrapper, header, viewKey) {
    var expanded = isExpanded(viewKey);
    wrapper.classList.toggle('is-expanded', expanded);
    header.setAttribute('aria-expanded', String(expanded));

    // Toggle body visibility via JS (not CSS) so the KTL button
    // inside the body stays clickable when we need to expand.
    var bodyEl = wrapper.querySelector('.scw-ktl-accordion__body');
    if (bodyEl) bodyEl.style.display = expanded ? '' : 'none';

    // Count pill
    var countEl = header.querySelector('.scw-acc-count');
    if (countEl) {
      var count = computeCount(viewKey);
      if (count !== null) {
        countEl.textContent = count;
        countEl.style.display = '';
      } else {
        countEl.style.display = 'none';
      }
    }

    // Refresh accent color (may change after hsv override injection)
    var btn = document.getElementById('hideShow_' + viewKey + '_button');
    if (btn) {
      var accent = readAccentColor(btn);
      if (accent) {
        wrapper.style.setProperty('--scw-accent', accent);
        var rgb = parseRgb(accent);
        if (rgb) wrapper.style.setProperty('--scw-accent-rgb', rgb);
      }
    }
  }

  // ───────────────────────────────────────────────────
  //  Header click binding
  // ───────────────────────────────────────────────────

  /**
   * Bind (or re-bind) the accordion header so clicks toggle the given
   * KTL button.  Uses a data attribute to store a mutable reference key
   * and a shared map so re-binding after a view refresh is cheap —
   * we just swap the button reference, no need to replace listeners.
   */
  var _btnRefs = {};   // viewKey → current button element

  function bindHeader(wrap, hdr, btnEl, vKey) {
    _btnRefs[vKey] = btnEl;               // always update to latest button

    // Track listeners on the DOM element itself so we correctly re-attach
    // after SPA navigations that destroy and recreate accordion headers.
    if (hdr.getAttribute('data-scw-bound') === '1') return;
    hdr.setAttribute('data-scw-bound', '1');

    function triggerToggle() {
      if (hdr.dataset.scwBusy === '1') return;
      hdr.dataset.scwBusy = '1';
      setTimeout(function () { hdr.dataset.scwBusy = '0'; }, 150);

      var bodyEl = wrap.querySelector('.scw-ktl-accordion__body');
      if (bodyEl) bodyEl.style.display = '';

      _btnRefs[vKey].click();             // always use current reference

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          syncState(wrap, hdr, vKey);
        });
      });
    }

    hdr.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      triggerToggle();
    });
    hdr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        triggerToggle();
      }
    });
  }

  /** Update the button reference for an existing header (after view re-render). */
  function rebindHeader(wrap, hdr, btnEl, vKey) {
    bindHeader(wrap, hdr, btnEl, vKey);
  }

  // ───────────────────────────────────────────────────
  //  Enhancement pass
  // ───────────────────────────────────────────────────
  function enhance() {
    var buttons = document.querySelectorAll(BTN_SEL);

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];

      // Opt-out check
      if (btn.hasAttribute(OPT_OUT)) continue;
      var knView = btn.closest('.kn-view');
      if (knView && knView.hasAttribute(OPT_OUT)) continue;

      // Already enhanced?
      if (btn.getAttribute(ENHANCED) === '1') {
        // Sync state for existing wrapper
        var existingWrapper = btn.closest('.scw-ktl-accordion');
        if (existingWrapper) {
          var existingHeader = existingWrapper.querySelector('.scw-ktl-accordion__header');
          if (existingHeader) {
            var vk = existingHeader.getAttribute('data-view-key');
            syncState(existingWrapper, existingHeader, vk);
          }
        }
        continue;
      }

      var viewKey = viewKeyFromButtonId(btn.id);
      if (!viewKey) continue;

      // ── Re-rendered inside existing accordion? ──
      // After an inline-edit refresh, Knack may replace the DOM inside
      // #view_XXXX (innerHTML swap) OR replace the entire element.
      //
      // Case 1: button is still inside an existing wrapper (innerHTML swap).
      // Case 2: button is outside, but an orphaned wrapper with a matching
      //         data-view-key header exists (element replacement).
      //
      // In both cases, re-adopt the button into the existing wrapper
      // instead of creating a duplicate.
      var existingAncestor = btn.closest('.scw-ktl-accordion');
      if (!existingAncestor) {
        var orphanHdr = document.querySelector(
          '.scw-ktl-accordion__header[data-view-key="' + viewKey + '"]'
        );
        if (orphanHdr) existingAncestor = orphanHdr.closest('.scw-ktl-accordion');
      }

      if (existingAncestor) {
        btn.setAttribute(ENHANCED, '1');
        var existingHdr = existingAncestor.querySelector('.scw-ktl-accordion__header');
        if (existingHdr) {
          // Move the new view element into the existing wrapper's body
          var existingBody = existingAncestor.querySelector('.scw-ktl-accordion__body');
          var wrapTarget = knView || btn.parentNode;
          if (existingBody && wrapTarget && wrapTarget.parentNode !== existingBody) {
            // Place wrapper right before the new view element so position is preserved
            wrapTarget.parentNode.insertBefore(existingAncestor, wrapTarget);
            existingBody.appendChild(wrapTarget);
          }
          // Neutralize legacy accent on the (possibly new) .kn-view host
          if (knView) {
            knView.classList.add('scw-ktl-accordion-host');
            knView.style.setProperty('background', 'transparent', 'important');
            knView.style.setProperty('background-color', 'transparent', 'important');
            knView.style.setProperty('padding', '0', 'important');
            knView.style.setProperty('border-radius', '0', 'important');
            knView.style.setProperty('box-shadow', 'none', 'important');
            knView.style.setProperty('margin', '0', 'important');
          }
          // Re-bind the header click to the NEW button element
          rebindHeader(existingAncestor, existingHdr, btn, viewKey);
          syncState(existingAncestor, existingHdr, viewKey);
        }
        log('re-adopted (post-refresh)', viewKey);
        continue;
      }

      log('enhancing', viewKey);

      // Mark button as enhanced
      btn.setAttribute(ENHANCED, '1');

      // Read accent color BEFORE any DOM changes (computed style is still
      // accurate while the button is visible).
      var accent = readAccentColor(btn);
      var accentRgb = parseRgb(accent);

      // ── Build the wrapper structure ──
      // Determine the node to wrap — the .kn-view that contains the button.
      var wrapTarget = knView || btn.parentNode;

      // Cancel the legacy accent background on the .kn-view host.
      // KTL injects ID-based rules like #view_3507 { background-color: … !important }
      // which beat any class selector.  Inline !important is the only way to win.
      if (knView) {
        knView.classList.add('scw-ktl-accordion-host');
        knView.style.setProperty('background', 'transparent', 'important');
        knView.style.setProperty('background-color', 'transparent', 'important');
        knView.style.setProperty('padding', '0', 'important');
        knView.style.setProperty('border-radius', '0', 'important');
        knView.style.setProperty('box-shadow', 'none', 'important');
        knView.style.setProperty('margin', '0', 'important');
        // Also neutralize any ancestor .kn-view that matches :has()
        var ancestor = knView.parentElement;
        while (ancestor) {
          if (ancestor.classList && ancestor.classList.contains('kn-view')) {
            ancestor.classList.add('scw-ktl-accordion-host');
            ancestor.style.setProperty('background', 'transparent', 'important');
            ancestor.style.setProperty('background-color', 'transparent', 'important');
          }
          ancestor = ancestor.parentElement;
        }
      }

      // Create our wrapper card
      var wrapper = document.createElement('div');
      wrapper.className = 'scw-ktl-accordion';
      if (accent) wrapper.style.setProperty('--scw-accent', accent);
      if (accentRgb) wrapper.style.setProperty('--scw-accent-rgb', accentRgb);

      // Build header
      var header = buildHeader(btn, viewKey);

      // Create body container
      var body = document.createElement('div');
      body.className = 'scw-ktl-accordion__body';

      // Insert wrapper where the wrapTarget currently sits,
      // then move wrapTarget into the body.
      wrapTarget.parentNode.insertBefore(wrapper, wrapTarget);
      wrapper.appendChild(header);
      wrapper.appendChild(body);
      body.appendChild(wrapTarget);

      // Forward clicks from our header to the KTL button.
      bindHeader(wrapper, header, btn, viewKey);

      // Initial state sync
      syncState(wrapper, header, viewKey);

      // MutationObserver on content for count updates
      (function (wrap, hdr, vKey) {
        var viewEl = document.getElementById(vKey);
        if (!viewEl) return;
        var countRaf = 0;
        var contentObs = new MutationObserver(function () {
          if (countRaf) cancelAnimationFrame(countRaf);
          countRaf = requestAnimationFrame(function () {
            countRaf = 0;
            syncState(wrap, hdr, vKey);
          });
        });
        contentObs.observe(viewEl, { childList: true, subtree: true });
      })(wrapper, header, viewKey);
    }
  }

  // ───────────────────────────────────────────────────
  //  Lifecycle
  // ───────────────────────────────────────────────────
  injectCss();

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      setTimeout(enhance, 80);
    });

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      setTimeout(enhance, 80);
    });

  // Global MutationObserver to catch KTL buttons added outside
  // normal Knack render events (e.g., lazy KTL init).
  var globalRaf = 0;
  var globalObs = new MutationObserver(function () {
    if (globalRaf) cancelAnimationFrame(globalRaf);
    globalRaf = requestAnimationFrame(function () {
      globalRaf = 0;
      enhance();
    });
  });
  globalObs.observe(document.body, { childList: true, subtree: true });

  $(document).ready(function () {
    setTimeout(enhance, 300);
  });

  // ── Expose API ──
  window.SCW = window.SCW || {};
  window.SCW.ktlAccordion = {
    /** Force re-enhancement pass */
    refresh: enhance,
    /** Toggle debug logging */
    debug: function (on) { DEBUG = !!on; }
  };
})();
/**************************************************************************************************
 * LEGACY / RATKING SEGMENT
 * Goal: Make boundaries between “features” obvious without changing behavior.
 * Note: This file mixes global handlers, per-view hacks, and legacy utilities.
 **************************************************************************************************/

/**************************************************************************************************
 * FEATURE: Modal backdrop click-to-close DISABLE (possibly obsolete)
 * - DEPRECATE? Knack now has “keep open till action”
 * - Purpose: prevents closing modal when clicking outside it
 **************************************************************************************************/
(function modalBackdropClickDisable() {
  $(document).on('knack-scene-render.any', function (event, scene) {
    $('.kn-modal-bg').off('click');
  });
})();
/*** END FEATURE: Modal backdrop click-to-close DISABLE ************************************************/
/**************************************************************************************************
 * FEATURE: Default field value injection (single-purpose hacks)
 **************************************************************************************************/

/** Default: view_1519 sets field_932 */
(function defaultValue_view1519_field932() {
  $(document).on('knack-view-render.view_1519', function (event, view, data) {
    setTimeout(function () {
      $('input#field_932').attr('value', '5deebcd9525d220015a14e1f'); // works
    }, 1);
  });
})();

/** Default: modal view_1328 sets field_737 */
(function defaultValue_modal1328_field737() {
  $(document).on('knack-modal-render.view_1328', function (event, view, record) {
    setTimeout(function () {
      $('input#field_737').attr('value', 'Create_Project');
    }, 1);
  });
})();

/** Default: scene_208 sets field_877 */
(function defaultValue_scene208_field877() {
  $(document).on('knack-scene-render.scene_208', function (event, view, record) {
    setTimeout(function () {
      $('input#field_877').attr('value', 'Deputy 8.0');
    }, 1);
  });
})();

/** Default: modal view_1457 sets field_737 */
(function defaultValue_modal1457_field737() {
  $(document).on('knack-modal-render.view_1457', function (event, view, record) {
    setTimeout(function () {
      $('input#field_737').attr('value', 'Create_Project');
    }, 1);
  });
})();

/*** END FEATURE: Default field value injection *********************************************************/
/**************************************************************************************************
 * FEATURE: Post-inline-edit behavior (refresh / spinner / alerts)
 **************************************************************************************************/

/** Inline edit: view_1991 shows spinner + minor hash tweak */
(function inlineEdit_view1991_spinner() {
  $(document).on('knack-cell-update.view_1991', function (event, view, data) {
    setTimeout(function () { location.hash = location.hash + "#"; }, 100);
    Knack.showSpinner();
  });
})();

/** Record update: view_1493 alerts + fetches view model */
(function recordUpdate_view1493_alertAndFetch() {
  $(document).on('knack-record-update.view_1493', function (event, view, record) {
    alert("Click 'OK' to update equipment total");
    Knack.views["view_1493"].model.fetch();
    console.log("hello world");
    console.log(Knack.views);
  });
})();

/*** END FEATURE: Post-inline-edit behavior *************************************************************/
/**************************************************************************************************
 * FEATURE: Timepicker initialization (per-view list)
 * - Applies timepicker to .ui-timepicker-input when view renders
 **************************************************************************************************/
(function timepickerInit_perViewList() {
  var view_names = ["view_832"]; // add view numbers as necessary

  view_names.forEach(function bindToUpdate1(selector_view_name) {
    $(document).on('knack-view-render.' + selector_view_name, function (event, view, data) {
      $(document).ready(function () {
        $('.ui-timepicker-input').timepicker({
          minTime: '09:30:00', // change as necessary
          maxTime: '16:30:00'
        });
      });
    });
  });
})();
/*** END FEATURE: Timepicker initialization **************************************************************/
/**************************************************************************************************
 * FEATURE: view_1509 UI text tweaks (discount description / label helpers)
 **************************************************************************************************/
(function discountCopyTweaks_view1509() {
  $(document).on('knack-view-render.view_1509', function (event, view) {
    // Add discount description
    $('<div><hr></br></div>').insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(3)');

    // Modify text around discount amount
    $('<span>-</span>').insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span');

    $('<span> discount for Annual plan = </span>').insertAfter('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span:nth-child(2)');
  });
})();
/*** END FEATURE: view_1509 UI tweaks *********************************************************************/
/**************************************************************************************************
 * FEATURE: Record update => “hash bump” refresh (micro-hacks)
 **************************************************************************************************/
(function hashBump_onRecordUpdate() {
  $(document).on('knack-record-update.view_2074', function (event, view, record) { location.hash = location.hash + "#"; });
  $(document).on('knack-record-update.view_2083', function (event, view, record) { location.hash = location.hash + "#"; });
  $(document).on('knack-record-update.view_2078', function (event, view, record) { location.hash = location.hash + "#"; });
  $(document).on('knack-record-update.view_2084', function (event, view, record) { location.hash = location.hash + "#"; });
})();
/*** END FEATURE: Record update => hash bump **************************************************************/
/**************************************************************************************************
 * FEATURE: Odd scene_776 stub (currently non-functional)
 **************************************************************************************************/
(function scene776_stub() {
  $(document).on('knack-scene-render.scene_776', function (event, view, data) {
    $('').click(function () { // ⚠ selector is empty -> does nothing
      $('#view_hide').show();
    });
  });
})();
/*** END FEATURE: Odd scene_776 stub ************************************************************************/
/////*********** PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/**
 * SCW Totals Script - Refactored (multi-view + multi-field + modular features)
 * Base: Your working Version 2.0 (Last Updated: 2026-02-02/03c)
 * Refactor: 2026-02-03 (config-driven + feature pipeline)
 *
 * PATCH (2026-02-05h):
 *  - ✅ FIX: L1 footer line colors not applying
 *    Root cause: selectors like `${sel('tr.scw-subtotal--level-1')} .child`
 *    expand to `#viewA tr..., #viewB tr... .child` (the `.child` only applies to the LAST selector).
 *    Fix: use robust, non-view-scoped selectors on the subtotal row itself:
 *      `tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-...`
 *
 * PATCH (2026-02-05j):
 *  - ✅ L1 footer as TRUE TABLE ROWS (Subtotal / Discount / Total)
 *  - ✅ If L1 has NO discount: show ONLY "Total" (hide subtotal + discount rows)
 *  - ✅ L1 group label appears ABOVE totals lines and spans across the row (not squished into a narrow TD)
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG (ONLY PLACE YOU SHOULD EDIT FOR NEW VIEWS / FIELDS)
  // ============================================================

  const CONFIG = {
    views: {
      view_3301: {
        showProjectTotals: true,
        keys: {
          qty: 'field_1964',
          labor: 'field_2028',
          hardware: 'field_2201',
          cost: 'field_2203',
          discount: 'field_2267',
          field2019: 'field_2019',
          prefix: 'field_2240',
          number: 'field_1951',
          l2Sort: 'field_2218',
          l2Selector: 'field_2228',
          l3BlankLabelField: 'field_2208',
        },
      },
      view_3341: {
        showProjectTotals: true,
        keys: {
          qty: 'field_1964',
          labor: 'field_2028',
          hardware: 'field_2201',
          cost: 'field_2203',
          discount: 'field_2267',
          field2019: 'field_2019',
          prefix: 'field_2240',
          number: 'field_1951',
          l2Sort: 'field_2218',
          l2Selector: 'field_2228',
          l3BlankLabelField: 'field_2208',
        },
      },
      view_3371: {
        showProjectTotals: false,
        keys: {
          qty: 'field_1964',
          labor: 'field_2028',
          hardware: 'field_2201',
          cost: 'field_2203',
          discount: 'field_2267',
          field2019: 'field_2019',
          prefix: 'field_2240',
          number: 'field_1951',
          l2Sort: 'field_2218',
          l2Selector: 'field_2228',
          l3BlankLabelField: 'field_2208',
        },
      },
    },

    styleSceneIds: ['scene_1096'],

    features: {
      l2Sort: { enabled: true, missingSortGoesLast: true },
      hideL3WhenBlank: { enabled: true },

      hideBlankL4Headers: {
        enabled: true,
        cssClass: 'scw-hide-level4-header',
        requireField2019AlsoBlank: true,
      },

      hideL2Footer: {
        enabled: true,
        labels: ['Assumptions'],
        recordIds: ['697b7a023a31502ec68b3303'],
      },

      level2LabelRewrite: {
        enabled: true,
        rules: [
          {
            when: 'Video',
            match: 'exact',
            renames: {
              'Camera or Reader': 'Cameras',
              'Networking or Headend': 'NVRs, Switches, and Networking',
            },
          },
          {
            when: 'Access Control',
            match: 'exact',
            renames: {
              'Camera or Reader': 'Entries',
              'Networking or Headend': 'AC Controllers, Switches, and Networking',
            },
          },
          {
            when: 'video',
            match: 'contains',
            renames: {
              'Networking or Headend': 'NVR, Switches, and Networking',
            },
          },
        ],
      },

      eachColumn: { enabled: false, fieldKey: 'field_1960' },

      concat: { enabled: true, onlyContextKey: 'drop', onlyLevel: 4 },

      concatL3Mounting: {
        enabled: true,
        level2Label: 'Mounting Hardware',
        level: 3,
        cssClass: 'scw-concat-cameras--mounting',
      },
    },

    l2Context: {
      byId: {},
      byLabel: {
        'Cameras & Cabling': 'drop',
        'Cameras and Cabling': 'drop',
        'Cameras or Cabling': 'drop',
        'Camera or Reader': 'drop',
        'Cameras': 'drop',
        'Entries': 'drop',

        'Networking or Headend': 'headend',
        'Networking & Headend': 'headend',
        'NVRs, Switches, and Networking': 'headend',
        'NVR, Switches, and Networking': 'headend',
        'AC Controllers, Switches, and Networking': 'headend',

        Services: 'services',
      },
    },

    l2SectionRules: [
      {
        key: 'services',
        recordIds: ['6977caa7f246edf67b52cbcd'],
        labels: ['Services'],
        hideLevel3Summary: true,
        hideQtyCostColumns: true,
        hideSubtotalFilter: true,
        headerBackground: '',
        headerTextColor: '',
      },
      {
        key: 'assumptions',
        recordIds: ['697b7a023a31502ec68b3303'],
        labels: ['Assumptions'],
        hideLevel3Summary: true,
        hideQtyCostColumns: true,
        hideSubtotalFilter: true,
        headerBackground: '#f0f7ff',
        headerTextColor: '',
      },
    ],

    l2Specials: {
      mountingHardwareId: '',
      mountingHardwareLabel: 'Mounting Hardware',
      classOnLevel3: 'scw-level3--mounting-hardware',
    },

    debug: false,
    eventNs: '.scwTotals',
    cssId: 'scw-totals-css',
  };

  // ============================================================
  // SMALL UTILITIES
  // ============================================================

  const decoderElement = document.createElement('textarea');
  const htmlEscapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  const htmlEscapeRegex = /[&<>"']/g;

  function escapeHtml(str) {
    return String(str ?? '').replace(htmlEscapeRegex, (char) => htmlEscapeMap[char]);
  }

  function decodeEntities(str) {
    decoderElement.innerHTML = str;
    return decoderElement.value;
  }

  function norm(s) {
    return String(s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const normKeyCache = new Map();
  function normKey(s) {
    const key = String(s);
    if (normKeyCache.has(key)) return normKeyCache.get(key);
    const result = norm(s).toLowerCase();
    normKeyCache.set(key, result);
    return result;
  }

  function isBlankish(v) {
    const t = norm(v);
    return !t || t === '-' || t === '—' || t === '–';
  }

  function formatMoney(n) {
    const num = Number(n || 0);
    return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
  }

  function formatMoneyAbs(n) {
    const num = Math.abs(Number(n || 0));
    return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
  }

  function log(ctx, ...args) {
    if (!CONFIG.debug) return;
    // eslint-disable-next-line no-console
    console.log(`[SCW totals][${ctx.viewId}]`, ...args);
  }

  // ============================================================
  // LIMITED HTML SANITIZE (Allow only <b> and <br>)
  // ============================================================

  const sanitizeRegex = /<\/?strong\b[^>]*>/gi;
  const removeTagsRegex = /<(?!\/?(br|b)\b)[^>]*>/gi;

  function normalizeBrVariants(html) {
    if (!html) return '';
    return String(html)
      .replace(/<\/\s*br\s*>/gi, '<br />')
      .replace(/<\s*br\s*\/?\s*>/gi, '<br />');
  }

  function normalizeBoldSpacing(html) {
    if (!html) return '';
    let out = String(html);
    out = out.replace(/([^\s>])\s*<b\b/gi, '$1 <b');
    out = out.replace(/<\/b>\s*([^\s<])/gi, '</b> $1');
    return out;
  }

  function sanitizeAllowOnlyBrAndB(html) {
    if (!html) return '';
    return normalizeBoldSpacing(
      normalizeBrVariants(html)
        .replace(sanitizeRegex, (tag) => tag.replace(/strong/gi, 'b'))
        .replace(removeTagsRegex, '')
        .replace(/<\/\s*br\s*>/gi, '<br />')
        .replace(/<\s*br\s*\/?\s*>/gi, '<br />')
    );
  }

  function plainTextFromLimitedHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return norm(tmp.textContent || '');
  }

  // ============================================================
  // ROW CACHE (per run)
  // ============================================================

  function makeRunCaches() {
    return {
      rowCache: new WeakMap(),
      nearestL2Cache: new WeakMap(),
    };
  }

  function getRowCache(caches, row) {
    let cache = caches.rowCache.get(row);
    if (!cache) {
      cache = { cells: new Map(), nums: new Map(), texts: new Map() };
      caches.rowCache.set(row, cache);
    }
    return cache;
  }

  function getRowCell(caches, row, fieldKey) {
    const cache = getRowCache(caches, row);
    if (cache.cells.has(fieldKey)) return cache.cells.get(fieldKey);
    const cell = row.querySelector(`td.${fieldKey}`);
    cache.cells.set(fieldKey, cell || null);
    return cell;
  }

  function getRowCellText(caches, row, fieldKey) {
    const cache = getRowCache(caches, row);
    if (cache.texts.has(fieldKey)) return cache.texts.get(fieldKey);
    const cell = getRowCell(caches, row, fieldKey);
    const text = cell ? cell.textContent.trim() : '';
    cache.texts.set(fieldKey, text);
    return text;
  }

  function getRowNumericValue(caches, row, fieldKey) {
    const cache = getRowCache(caches, row);
    if (cache.nums.has(fieldKey)) return cache.nums.get(fieldKey);
    const cell = getRowCell(caches, row, fieldKey);
    const value = cell ? parseFloat(cell.textContent.replace(/[^\d.-]/g, '')) : NaN;
    cache.nums.set(fieldKey, value);
    return value;
  }

  function sumField(caches, $rows, fieldKey) {
    let total = 0;
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const num = getRowNumericValue(caches, rows[i], fieldKey);
      if (Number.isFinite(num)) total += num;
    }
    return total;
  }

  function sumFields(caches, $rows, fieldKeys) {
    const totals = {};
    fieldKeys.forEach((key) => (totals[key] = 0));
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const key of fieldKeys) {
        const num = getRowNumericValue(caches, row, key);
        if (Number.isFinite(num)) totals[key] += num;
      }
    }
    return totals;
  }

  // ============================================================
  // DOM HELPERS (view-scoped only)
  // ============================================================

  function buildCtx(viewId, view) {
    const vcfg = CONFIG.views[viewId];
    if (!vcfg) return null;

    const root = document.getElementById(viewId);
    if (!root) return null;

    const $root = $(root);
    const $tbody = $root.find('.kn-table tbody');

    return {
      viewId,
      view,
      $root,
      $tbody,
      keys: vcfg.keys,
      showProjectTotals: vcfg.showProjectTotals !== false,
      features: CONFIG.features,
      l2Context: CONFIG.l2Context,
      l2SectionRules: CONFIG.l2SectionRules,
      l2Specials: CONFIG.l2Specials,
    };
  }

  function getGroupLabelText($groupRow) {
    const $td = $groupRow.children('td').first();
    return $td.length ? norm($td.text()) : '';
  }

  function getLabelCellTextWithoutInjected(labelCell) {
    const clone = labelCell.cloneNode(true);
    clone.querySelectorAll('.scw-l4-2019, br.scw-l4-2019-br').forEach((n) => n.remove());
    return norm(clone.textContent || '');
  }

  function getLabelCellHtmlWithoutInjected(labelCell) {
    const clone = labelCell.cloneNode(true);
    clone.querySelectorAll('.scw-l4-2019, br.scw-l4-2019-br').forEach((n) => n.remove());
    // If a previous run wrapped the cell in .scw-concat-cameras, unwrap to
    // the original label text so we don't nest camera lists on re-runs.
    const prevConcat = clone.querySelector('.scw-concat-cameras');
    if (prevConcat) {
      // The camera list is inside the <b> tag — remove it to get the base label
      const camB = prevConcat.querySelector('b');
      if (camB) { const prevBr = camB.previousElementSibling; if (prevBr && prevBr.tagName === 'BR') prevBr.remove(); camB.remove(); }
      // Unwrap: replace the .scw-concat-cameras div with its remaining children
      while (prevConcat.firstChild) prevConcat.parentNode.insertBefore(prevConcat.firstChild, prevConcat);
      prevConcat.remove();
    }
    return clone.innerHTML || '';
  }

  // ============================================================
  // ✅ COLUMN META: real colCount + indices of qty/cost columns
  // ============================================================

  function computeColumnMeta(ctx) {
    const firstRow = ctx.$root.find('.kn-table tbody tr[id]').first()[0];
    const colCount = firstRow ? firstRow.querySelectorAll('td').length : 0;

    let qtyIdx = -1;
    let costIdx = -1;

    const ths = ctx.$root.find('.kn-table thead th').get();
    if (ths && ths.length) {
      qtyIdx = ths.findIndex((th) => th.classList && th.classList.contains(ctx.keys.qty));
      costIdx = ths.findIndex((th) => th.classList && th.classList.contains(ctx.keys.cost));
    }

    if (firstRow) {
      const tds = Array.from(firstRow.querySelectorAll('td'));
      if (qtyIdx < 0) qtyIdx = tds.findIndex((td) => td.classList && td.classList.contains(ctx.keys.qty));
      if (costIdx < 0) costIdx = tds.findIndex((td) => td.classList && td.classList.contains(ctx.keys.cost));
    }

    return { colCount: Math.max(colCount, 0), qtyIdx, costIdx };
  }

  // ============================================================
  // FEATURE: CSS injection (multi-view safe)
  // ============================================================

  let cssInjected = false;
  function injectCssOnce() {
    if (cssInjected) return;

    if (document.getElementById(CONFIG.cssId)) {
      cssInjected = true;
      return;
    }

    cssInjected = true;

    const sceneSelectors = (CONFIG.styleSceneIds || []).map((id) => `#kn-${id}`).join(', ');
    const viewIds = Object.keys(CONFIG.views);

    function sel(suffix) {
      return viewIds.map((id) => `#${id} ${suffix}`.trim()).join(', ');
    }

    const anyView = CONFIG.views[viewIds[0]];
    const QTY_FIELD_KEY = anyView?.keys?.qty || 'field_1964';
    const COST_FIELD_KEY = anyView?.keys?.cost || 'field_2203';

    const style = document.createElement('style');
    style.id = CONFIG.cssId;

    style.textContent = `
/* ============================================================
   SCW Totals helper CSS
   ============================================================ */
tr.scw-level-total-row.scw-subtotal td { vertical-align: middle; }
tr.scw-level-total-row.scw-subtotal .scw-level-total-label { white-space: nowrap; }

.scw-concat-cameras { line-height: 1.2; }
.scw-concat-cameras--mounting { line-height: 1.15; }

.scw-l4-2019 { display: inline-block; margin-top: 2px; line-height: 1.2; }
.scw-l4-2019-br { line-height: 0; }

.scw-l4-2019 b,
.scw-concat-cameras b,
.scw-l4-2019 strong,
.scw-concat-cameras strong { font-weight: 800 !important; }

.scw-each { line-height: 1.1; }
.scw-each__label { font-weight: 700; opacity: .9; margin-bottom: 2px; }

tr.scw-hide-level3-header { display: none !important; }
tr.scw-hide-level4-header { display: none !important; }

/* ✅ Hide Qty/Cost content while preserving column layout
   ✅ GUARD: never hide qty/cost on L1 subtotal rows */
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${QTY_FIELD_KEY},
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${COST_FIELD_KEY} { visibility: hidden !important; }

/* ============================================================
   ✅ L1 footer layout (true rows)
   ============================================================ */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line-row td { background: inherit !important; }

/* title sits ABOVE the first totals row and can wrap */
tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-title{
  text-align: right;
  font-weight: 700;
  margin: 6px 0 0px;
  Vertical-align: bottom;
  white-space: normal;
  overflow-wrap: anywhere;
}

/* label/value align to the right */
tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-label{
  text-align: right;
  opacity: .85;
  font-weight: 600;
  white-space: nowrap;
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-value{
  text-align: right;
  font-weight: 700;
  white-space: nowrap;
}

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--sub .scw-l1-label,
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--sub .scw-l1-value{
  color: #07467c !important;
}

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--disc .scw-l1-label,
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--disc .scw-l1-value{
  color: orange !important;
}

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--final .scw-l1-label,
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--final .scw-l1-value{
  color: #07467c !important;
  font-weight: 900 !important;
}

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--final .scw-l1-value{
  font-size: 18px;
}

/* 80px whitespace ABOVE the first L1 footer row */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-first-row td{
  border-top: 20px solid transparent !important;
  border-bottom: 5px solid #07467c !important;
}

/* 80px whitespace BELOW the last L1 footer row */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-last-row td{
  border-bottom: 60px solid #fff !important;
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-value {
  display: inline-block;
  min-width: 120px;
  text-align: right;
}

/* Hide view_3342 (data source for field_2302) visually but keep in DOM */
#view_3342 {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
  padding: 0 !important;
  margin: -1px !important;
}

/* ============================================================
   Project Grand Totals
   ============================================================ */
tr.scw-level-total-row.scw-project-totals.scw-project-totals-first-row .scw-l1-title {
  font-size: 2.2em !important;
  font-weight: 600 !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals-first-row td {
  border-top: 20px solid transparent !important;
  border-bottom: 5px solid #07467c !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals-last-row td {
  border-bottom: 60px solid #fff !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals--grand .scw-l1-label {
  font-size: 21px !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals--grand .scw-l1-value {
  font-size: 23px !important;
}


/* ============================================================
   YOUR PROVIDED CSS — APPLIED TO ALL CONFIG.views
   ============================================================ */

/********************* OVERAL -- GRID ***********************/
${sceneSelectors} h2 {font-weight: 800; color: #07467c; font-size: 24px;}

${sel('.kn-pagination .kn-select')} { display: none !important; }
${sel('> div.kn-records-nav > div.level > div.level-left > div.kn-entries-summary')} { display: none !important; }

/* This hides all data rows (leaves only group headers + totals rows) */
${sel('.kn-table tbody tr[id]')} { display: none !important; }

/* Hide vertical borders in the grid */
${sel('.kn-table th')},
${sel('.kn-table td')} { border-left: none !important; border-right: none !important; }

${sel('.kn-table tbody td')} { vertical-align: middle; }
/********************* OVERAL -- GRID ***********************/


/********************* LEVEL 1 (MDF/IDF) *********************/
${sceneSelectors} .kn-table-group.kn-group-level-1 {
  font-size: 16px;
  font-weight: 600;
  background-color: white !important;
  color: #07467c !important;
  padding-right: 20% !important;
  padding-left: 20px !important;
  padding-top: 30px !important;
  padding-bottom: 0px !important;
  text-align: center !important;
}
${sceneSelectors} .kn-table-group.kn-group-level-1 td:first-child {font-size: 24px; font-weight: 200 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-1 td {border-bottom-width: 20px !important; border-color: #07467c !important;}

${sel('tr.scw-subtotal--level-1 td')} {
  background: RGB(7, 70, 124, 1);
  border-top:0px solid #dadada;
  font-weight:600;
  color: #07467c;
  text-align: right;
  border-bottom-width: 0px;
  border-color: #07467c;
  font-size: 16px;
}

/* ✅ PATCH: force L1 subtotal row background to apply to al TDs */
${sel('tr.scw-level-total-row.scw-subtotal--level-1')} {
  background: transparent !important;
}
${sel('tr.scw-level-total-row.scw-subtotal--level-1 td')} {
  background: inherit !important;
}

${sel('tr.scw-grand-total-sep td')} { height:10px; background:transparent; border:none !important; }
${sel('tr.scw-grand-total-row td')} {
  background:white;
  border-top:2px solid #bbb !important;
  font-weight:800;
  color: #07467c;
  font-size: 20px;
  text-align: right;
}
/********************* LEVEL 1 (MDF/IDF) ***********************/

/*** Promoted L2 (blank L1 → L2 acts as L1) ***/
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-promoted-l2-as-l1 {
  font-size: 16px;
  font-weight: 600;
  background-color: white !important;
  color: #07467c !important;
  padding-right: 20% !important;
  padding-left: 20px !important;
  padding-top: 30px !important;
  padding-bottom: 0px !important;
  text-align: center !important;
}
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-promoted-l2-as-l1 td:first-child {font-size: 24px; font-weight: 200 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-promoted-l2-as-l1 td {border-bottom-width: 20px !important; border-color: #07467c !important; border-top: 0 !important;}

/********************* LEVEL 2 (BUCKET) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-2 {
  font-size: 16px;
  font-weight: 400 !important;
  background-color: aliceblue !important;
  color: #07467c;
}
${sceneSelectors} .kn-table-group.kn-group-level-2 td {padding: 5px 0px 5px 20px !important; border-top: 20px solid transparent !important;}
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-l2--assumptions td {font-weight: 600 !important;}

${sel('tr.scw-subtotal--level-2 td')} {
  background: aliceblue;
  border-top:1px solid #dadada;
  font-weight:800 !important;
  color: #07467c;
  text-align: center !important;
  border-bottom-width: 20px !important;
  border-color: transparent;
}
${sel('tr.scw-subtotal--level-2 td:first-child')} {text-align: right !important;}
/********************* LEVEL 2 (BUCKET) ***********************/


/********************* LEVEL 3 (PRODUCT) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-3 {background-color: white !important; color: #07467c;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td {padding-top: 10px !important; font-weight: 300 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:first-child {font-size: 20px;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:nth-last-child(-n+3) {font-weight:600 !important;}

${sel('tr.kn-table-group.kn-group-level-3.scw-level3--mounting-hardware td:first-child')} {
  padding-left: 80px !important;
  font-size: 14px !important;
  font-weight: 400 !important;
}
/********************* LEVEL 3 (PRODUCT) ***********************/


/********************* LEVEL 4 (INSTALL DESCRIPTION) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-4 {background-color: white !important; color: #07467c;}
${sceneSelectors} .kn-table-group.kn-group-level-4 td:nth-last-child(-n+3) {font-weight:600 !important; color: #07467c !important;}
${sceneSelectors} .kn-table-group.kn-group-level-4 td {padding-top: 5px !important; font-weight: 300;}
${sceneSelectors} .kn-table-group.kn-group-level-4 td:first-child {padding-left:80px !important;}

.scw-l4-2019 b {font-weight: 600 !important;}

/* Connected Devices on L3 headers */
.scw-l3-connected-br { line-height: 0; }
.scw-l3-connected-devices { display: block; margin-top: 5px; padding-left: 40px; line-height: 1.2; font-size: 12px; }
.scw-l3-connected-devices b { font-weight: 800 !important; }
/********************* LEVEL 4 (INSTALL DESCRIPTION) ***********************/
`;

    document.head.appendChild(style);
  }

  // ============================================================
  // FEATURE: Record-ID extraction + L2 helpers
  // ============================================================

  function extractRecordIdFromElement(el) {
    if (!el) return null;

    const direct = el.getAttribute('data-record-id') || el.getAttribute('data-id');
    if (direct) return direct.trim();

    const nested = el.querySelector('[data-record-id],[data-id]');
    if (nested) {
      const nestedId = nested.getAttribute('data-record-id') || nested.getAttribute('data-id');
      if (nestedId) return nestedId.trim();
    }

    const a = el.querySelector('a[href]');
    if (a) {
      const href = a.getAttribute('href') || '';
      const patterns = [/\/records\/([A-Za-z0-9]+)/i, /\/record\/([A-Za-z0-9]+)/i, /[?&]id=([A-Za-z0-9]+)/i];
      for (const pattern of patterns) {
        const match = href.match(pattern);
        if (match?.[1]) return match[1];
      }
    }

    return null;
  }

  function getLevel2InfoFromGroupRow($groupRow) {
    const el = $groupRow[0];
    if (!el) return { label: null, recordId: null };

    const td = el.querySelector('td:first-child');
    const label = td ? norm(td.textContent) : null;
    const recordId = extractRecordIdFromElement(td);

    return { label, recordId };
  }

  function contextKeyFromLevel2Info(ctx, level2Info) {
    const id = level2Info?.recordId;
    const label = level2Info?.label;

    if (id && ctx.l2Context.byId[id]) return ctx.l2Context.byId[id];
    if (label && ctx.l2Context.byLabel[label]) return ctx.l2Context.byLabel[label];
    return 'default';
  }

  function matchesLevel2Rule(level2Info, rule) {
    if (!level2Info || !rule) return false;

    const id = (level2Info.recordId || '').trim();
    if (id && Array.isArray(rule.recordIds) && rule.recordIds.includes(id)) return true;

    const label = norm(level2Info.label);
    if (!label || !Array.isArray(rule.labels)) return false;

    return rule.labels.some((entry) => norm(entry) === label);
  }

  function getLevel2Rule(ctx, level2Info) {
    for (const rule of ctx.l2SectionRules) {
      if (matchesLevel2Rule(level2Info, rule)) return rule;
    }
    return null;
  }

  function applyLevel2Styling($groupRow, rule) {
    if (!rule || !$groupRow?.length) return;
    $groupRow.addClass(`scw-l2--${rule.key}`);

    if (rule.key === 'assumptions') $groupRow.addClass('scw-l2--assumptions-id');

    if (rule.headerBackground) $groupRow.css('background-color', rule.headerBackground);
    if (rule.headerTextColor) $groupRow.css('color', rule.headerTextColor);
  }

  function shouldHideLevel2Footer(ctx, level2Info) {
    const opt = ctx.features.hideL2Footer;
    if (!opt?.enabled) return false;

    const id = (level2Info?.recordId || '').trim();
    if (id && (opt.recordIds || []).includes(id)) return true;

    const labelKey = normKey(level2Info?.label || '');
    if (!labelKey) return false;

    return (opt.labels || []).some((l) => normKey(l) === labelKey);
  }

  // ============================================================
  // FEATURE: Nearest L2 cache
  // ============================================================

  function makeNearestLevel2InfoFinder() {
    return function getNearestLevel2Info(caches, $row) {
      const el = $row[0];
      if (caches.nearestL2Cache.has(el)) return caches.nearestL2Cache.get(el);

      let current = el.previousElementSibling;
      while (current) {
        const classList = current.classList;
        if (classList.contains('kn-group-level-2')) {
          const result = getLevel2InfoFromGroupRow($(current));
          caches.nearestL2Cache.set(el, result);
          return result;
        }
        if (classList.contains('kn-group-level-1')) break;
        current = current.previousElementSibling;
      }

      const result = { label: null, recordId: null };
      caches.nearestL2Cache.set(el, result);
      return result;
    };
  }
  const getNearestLevel2Info = makeNearestLevel2InfoFinder();

  // ============================================================
  // FEATURE: L2 Label rewriting
  // ============================================================

  function getSelectorFieldValue(ctx, $row) {
    const selectorKey = ctx.keys.l2Selector;
    const $cell = $row.find(`td.${selectorKey}`).first();
    if (!$cell.length) return '';

    const attrs = ['data-raw-value', 'data-value', 'data-id', 'data-record-id'];
    for (const attr of attrs) {
      const val = $cell.attr(attr);
      if (val) return norm(val);
    }

    const $nested = $cell.find('[data-raw-value],[data-value],[data-id],[data-record-id]').first();
    if ($nested.length) {
      for (const attr of attrs) {
        const val = $nested.attr(attr);
        if (val) return norm(val);
      }
    }

    const titleish = $cell.attr('title') || $cell.attr('aria-label');
    if (titleish) return norm(titleish);

    return norm($cell.text());
  }

  function valueMatchesRule(value, rule) {
    const v = normKey(value);
    const w = normKey(rule.when);
    if (!v || !w) return false;
    return rule.match === 'contains' ? v.includes(w) : v === w;
  }

  function findRuleForSection(ctx, $rowsInSection) {
    const opt = ctx.features.level2LabelRewrite;
    if (!opt?.enabled || !opt.rules) return null;

    const values = new Set();

    $rowsInSection.filter('tr[id]').each(function () {
      const val = getSelectorFieldValue(ctx, $(this));
      if (val) values.add(val);
    });

    if (values.size === 0) {
      $rowsInSection.each(function () {
        const val = getSelectorFieldValue(ctx, $(this));
        if (val) values.add(val);
      });
    }

    for (const val of values) {
      for (const rule of opt.rules) {
        if (valueMatchesRule(val, rule)) return rule;
      }
    }
    return null;
  }

  function applyLevel2LabelRewrites(ctx, $tbody, runId) {
    const opt = ctx.features.level2LabelRewrite;
    if (!opt?.enabled) return;

    const $l1 = $tbody.find('tr.kn-table-group.kn-group-level-1');
    if (!$l1.length) return;

    for (let idx = 0; idx < $l1.length; idx++) {
      const $start = $l1.eq(idx);
      const $nextL1 = idx + 1 < $l1.length ? $l1.eq(idx + 1) : null;

      const $rowsInSection = $nextL1 ? $start.nextUntil($nextL1).addBack() : $start.nextAll().addBack();

      const rule = findRuleForSection(ctx, $rowsInSection);
      if (!rule?.renames) continue;

      $rowsInSection.filter('tr.kn-table-group.kn-group-level-2').each(function () {
        const $groupRow = $(this);

        if ($groupRow.data(`scwL2Rewrite_${runId}`)) return;
        $groupRow.data(`scwL2Rewrite_${runId}`, true);

        const $td = $groupRow.children('td').first();
        if (!$td.length) return;

        const currentLabel = norm($td.text());
        const newLabel = rule.renames[currentLabel];

        if (newLabel) {
          const $a = $td.find('a');
          if ($a.length) $a.text(newLabel);
          else $td.text(newLabel);
        }
      });

      $rowsInSection
        .filter('tr.scw-level-total-row.scw-subtotal[data-scw-subtotal-level="2"]')
        .each(function () {
          const $tr = $(this);
          const gl = norm($tr.attr('data-scw-group-label'));
          const replacement = rule.renames[gl];
          if (!replacement) return;

          $tr.attr('data-scw-group-label', replacement);
          $tr.find('.scw-level-total-label strong').text(replacement);
        });
    }
  }

  // ============================================================
  // FEATURE: Group boundary detection
  // ============================================================

  function getGroupBlock($groupRow, levelNum) {
    const nodes = [];
    let current = $groupRow[0].nextElementSibling;

    while (current) {
      if (current.classList.contains('kn-table-group')) {
        const match = current.className.match(/kn-group-level-(\d+)/);
        const currentLevel = match ? parseInt(match[1], 10) : null;
        if (currentLevel !== null && currentLevel <= levelNum) break;
      }
      nodes.push(current);
      current = current.nextElementSibling;
    }

    return $(nodes);
  }

  // ============================================================
  // FEATURE: L2 group reorder — within each L1 section
  // ============================================================

  function getSortValueForL2Block(ctx, l2HeaderEl, stopEl) {
    const sortKey = ctx.keys.l2Sort;
    let cur = l2HeaderEl.nextElementSibling;

    while (cur && cur !== stopEl) {
      if (cur.id && cur.tagName === 'TR') {
        const cell = cur.querySelector(`td.${sortKey}`);
        if (cell) {
          const raw = norm(cell.textContent || '');
          const num = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
          if (Number.isFinite(num)) return num;
        }
      }

      if (cur.classList?.contains('kn-table-group')) {
        const m = cur.className.match(/kn-group-level-(\d+)/);
        const lvl = m ? parseInt(m[1], 10) : null;
        if (lvl !== null && lvl <= 2) break;
      }
      cur = cur.nextElementSibling;
    }

    return null;
  }

  // ============================================================
  // FEATURE: L1 group reorder — alphabetical, blank labels last
  // ============================================================

  function reorderLevel1Groups($tbody) {
    const tbody = $tbody?.[0];
    if (!tbody) return;

    const l1Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1'));
    if (l1Headers.length < 2) return;

    const blocks = l1Headers.map((l1El, idx) => {
      const nextL1El = idx + 1 < l1Headers.length ? l1Headers[idx + 1] : null;
      const nodes = [];
      let n = l1El;
      while (n && n !== nextL1El) {
        nodes.push(n);
        n = n.nextElementSibling;
      }
      const label = norm(l1El.querySelector('td')?.textContent || '');
      return { idx, label, nodes };
    });

    blocks.sort((a, b) => {
      const aBlank = a.label === '';
      const bBlank = b.label === '';
      if (aBlank !== bBlank) return aBlank ? 1 : -1;
      return a.label.localeCompare(b.label);
    });

    const frag = document.createDocumentFragment();
    for (const block of blocks) {
      for (const n of block.nodes) frag.appendChild(n);
    }
    tbody.appendChild(frag);
  }

  function reorderLevel2GroupsBySortField(ctx, $tbody, runId) {
    const opt = ctx.features.l2Sort;
    if (!opt?.enabled) return;

    const tbody = $tbody?.[0];
    if (!tbody) return;

    const stampKey = 'scwL2ReorderStamp';
    if (tbody.dataset[stampKey] === String(runId)) return;
    tbody.dataset[stampKey] = String(runId);

    const l1Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1'));
    if (!l1Headers.length) return;

    const missing = opt.missingSortGoesLast ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

    for (let i = 0; i < l1Headers.length; i++) {
      const l1El = l1Headers[i];
      const nextL1El = i + 1 < l1Headers.length ? l1Headers[i + 1] : null;

      const sectionNodes = [];
      let cur = l1El.nextElementSibling;
      while (cur && cur !== nextL1El) {
        sectionNodes.push(cur);
        cur = cur.nextElementSibling;
      }
      if (!sectionNodes.length) continue;

      const l2Headers = sectionNodes.filter(
        (n) => n.classList && n.classList.contains('kn-table-group') && n.classList.contains('kn-group-level-2')
      );
      if (l2Headers.length < 2) continue;

      const firstL2 = l2Headers[0];

      const prefixNodes = [];
      cur = l1El.nextElementSibling;
      while (cur && cur !== nextL1El && cur !== firstL2) {
        prefixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      const blocks = l2Headers.map((l2El, idx) => {
        const nextL2El = idx + 1 < l2Headers.length ? l2Headers[idx + 1] : null;

        const nodes = [];
        let n = l2El;
        while (n && n !== nextL1El && n !== nextL2El) {
          nodes.push(n);
          n = n.nextElementSibling;
        }

        const sortVal = getSortValueForL2Block(ctx, l2El, nextL2El || nextL1El);
        return { idx, sortVal, nodes };
      });

      const lastBlock = blocks[blocks.length - 1];
      const lastBlockLastNode = lastBlock.nodes[lastBlock.nodes.length - 1];

      const suffixNodes = [];
      cur = lastBlockLastNode ? lastBlockLastNode.nextElementSibling : null;
      while (cur && cur !== nextL1El) {
        suffixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      blocks.sort((a, b) => {
        const av = Number.isFinite(a.sortVal) ? a.sortVal : missing;
        const bv = Number.isFinite(b.sortVal) ? b.sortVal : missing;
        if (av !== bv) return av - bv;
        return a.idx - b.idx;
      });

      const frag = document.createDocumentFragment();
      for (const n of prefixNodes) frag.appendChild(n);
      for (const block of blocks) for (const n of block.nodes) frag.appendChild(n);
      for (const n of suffixNodes) frag.appendChild(n);

      if (nextL1El) tbody.insertBefore(frag, nextL1El);
      else tbody.appendChild(frag);
    }
  }

  // ============================================================
  // FEATURE: Camera list builder
  // ============================================================

  function buildCameraListHtml(ctx, caches, $rows) {
    const items = [];
    const rows = $rows.get();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const prefix = getRowCellText(caches, row, ctx.keys.prefix);
      const numRaw = getRowCellText(caches, row, ctx.keys.number);
      if (!prefix || !numRaw) continue;

      const digits = numRaw.replace(/\D/g, '');
      const num = parseInt(digits, 10);
      if (!Number.isFinite(num)) continue;

      const prefixUpper = prefix.toUpperCase();
      items.push({ prefix: prefixUpper, num, text: `${prefixUpper}${digits}` });
    }

    if (!items.length) return '';

    items.sort((a, b) => (a.prefix === b.prefix ? a.num - b.num : a.prefix < b.prefix ? -1 : 1));
    return items.map((it) => escapeHtml(it.text)).join(', ');
  }

  // ============================================================
  // FEATURE: Field2019 injection (L4)
  // ============================================================

  function injectField2019IntoLevel4Header(ctx, { level, $groupRow, $rowsToSum, runId }) {
    if (level !== 4 || !$groupRow.length || !$rowsToSum.length) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    labelCell.querySelectorAll('.scw-l4-2019').forEach((n) => n.remove());
    labelCell.querySelectorAll('br.scw-l4-2019-br').forEach((n) => n.remove());

    const firstRow = $rowsToSum[0];
    const fieldCell = firstRow ? firstRow.querySelector(`td.${ctx.keys.field2019}`) : null;
    if (!fieldCell) return;

    const html = sanitizeAllowOnlyBrAndB(decodeEntities(fieldCell.innerHTML || ''));
    const fieldPlain = plainTextFromLimitedHtml(html);
    if (!fieldPlain) return;

    const currentLabelPlain = getLabelCellTextWithoutInjected(labelCell);

    const looksLikeSameText =
      currentLabelPlain &&
      (currentLabelPlain === fieldPlain ||
        currentLabelPlain.includes(fieldPlain) ||
        fieldPlain.includes(currentLabelPlain));

    if (looksLikeSameText) {
      labelCell.innerHTML = `<span class="scw-l4-2019">${html}</span>`;
      $groupRow.data('scwL4_2019_RunId', runId);
      return;
    }

    const br = document.createElement('br');
    br.className = 'scw-l4-2019-br';
    labelCell.appendChild(br);

    const span = document.createElement('span');
    span.className = 'scw-l4-2019';
    span.innerHTML = html;
    labelCell.appendChild(span);

    $groupRow.data('scwL4_2019_RunId', runId);
  }

  // ============================================================
  // FEATURE: Concat injection (L4 drop)
  // ============================================================

  function injectConcatIntoHeader(ctx, caches, { level, contextKey, $groupRow, $rowsToSum, runId }) {
    const opt = ctx.features.concat;
    if (!opt?.enabled || level !== opt.onlyLevel || contextKey !== opt.onlyContextKey) return;
    if ($groupRow.data('scwConcatRunId') === runId) return;
    $groupRow.data('scwConcatRunId', runId);

    const cameraListHtml = buildCameraListHtml(ctx, caches, $rowsToSum);
    if (!cameraListHtml) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    // Strip previously injected camera wrapper to avoid nesting on re-runs
    const prevConcat = labelCell.querySelector('.scw-concat-cameras');
    if (prevConcat) {
      const camB = prevConcat.querySelector('b');
      if (camB) { const prevBr = camB.previousElementSibling; if (prevBr && prevBr.tagName === 'BR') prevBr.remove(); camB.remove(); }
      while (prevConcat.firstChild) prevConcat.parentNode.insertBefore(prevConcat.firstChild, prevConcat);
      prevConcat.remove();
    }

    const injected = labelCell.querySelector('.scw-l4-2019');
    let baseHtml = '';

    if (injected) baseHtml = injected.innerHTML || '';
    else {
      baseHtml = getLabelCellHtmlWithoutInjected(labelCell);
      baseHtml = sanitizeAllowOnlyBrAndB(decodeEntities(baseHtml));
    }

    const composed =
      `<div class="scw-concat-cameras">` +
      `${sanitizeAllowOnlyBrAndB(decodeEntities(baseHtml))}` +
      `<br /><b style="color:orange;"> (${cameraListHtml})</b>` +
      `</div>`;

    labelCell.innerHTML = composed;
  }

  // ============================================================
  // FEATURE: Concat injection (L3 mounting hardware)
  // ============================================================

  function injectConcatIntoLevel3HeaderForMounting(ctx, caches, { $groupRow, $rowsToSum, runId }) {
    const opt = ctx.features.concatL3Mounting;
    if (!ctx.features.concat?.enabled) return;
    if (!opt?.enabled) return;
    if (!$groupRow.length || !$rowsToSum.length) return;

    if ($groupRow.data('scwConcatL3MountRunId') === runId) return;
    $groupRow.data('scwConcatL3MountRunId', runId);

    const cameraListHtml = buildCameraListHtml(ctx, caches, $rowsToSum);
    if (!cameraListHtml) return;

    const $labelCell = $groupRow.children('td').first();
    if (!$labelCell.length) return;

    // Strip previously injected camera wrapper to avoid nesting on re-runs
    const labelEl = $labelCell[0];
    const prevConcat = labelEl.querySelector('.scw-concat-cameras');
    if (prevConcat) {
      const camB = prevConcat.querySelector('b');
      if (camB) { const prevBr = camB.previousElementSibling; if (prevBr && prevBr.tagName === 'BR') prevBr.remove(); camB.remove(); }
      while (prevConcat.firstChild) prevConcat.parentNode.insertBefore(prevConcat.firstChild, prevConcat);
      prevConcat.remove();
    }

    const currentHtml = $labelCell.html() || '';
    const sanitizedBase = sanitizeAllowOnlyBrAndB(decodeEntities(currentHtml));

    $labelCell.html(
      `<div class="scw-concat-cameras ${opt.cssClass}">` +
        `${sanitizedBase}<br />` +
        `<b style="color:orange;">(${cameraListHtml})</b>` +
        `</div>`
    );
  }

  // ============================================================
  // FEATURE: Each column injection (L3)
  // ============================================================

  function injectEachIntoLevel3Header(ctx, caches, { level, $groupRow, $rowsToSum, runId }) {
    const opt = ctx.features.eachColumn;
    if (!opt?.enabled || level !== 3) return;
    if (!$groupRow.length || !$rowsToSum.length) return;
    if ($groupRow.data('scwL3EachRunId') === runId) return;
    $groupRow.data('scwL3EachRunId', runId);

    const $target = $groupRow.find(`td.${opt.fieldKey}`);
    if (!$target.length) return;

    const firstRow = $rowsToSum[0];
    const num = getRowNumericValue(caches, firstRow, opt.fieldKey);
    if (!Number.isFinite(num)) return;

    $target.html(`
      <div class="scw-each">
        <div class="scw-each__label">each</div>
        <div>${escapeHtml(formatMoney(num))}</div>
      </div>
    `);
  }

  // ============================================================
  // FEATURE: Connected Devices injection (L3)
  // ============================================================

  function injectConnectedDevicesIntoLevel3Header(ctx, caches, { $groupRow, $rowsToSum, runId }) {
    if ($groupRow.data('scwL3ConnDevRunId') === runId) return;
    $groupRow.data('scwL3ConnDevRunId', runId);

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    // Clean up previous injection
    labelCell.querySelectorAll('.scw-l3-connected-devices, br.scw-l3-connected-br').forEach(function (n) { n.remove(); });

    const rows = $rowsToSum.get();
    const devices = [];

    for (let i = 0; i < rows.length; i++) {
      const cell = getRowCell(caches, rows[i], 'field_1957');
      if (!cell) continue;
      // Replace <br> with a delimiter before reading text, so multi-value cells split properly
      const html = cell.innerHTML || '';
      const parts = html.replace(/<br\s*\/?>/gi, '|||').split('|||');
      for (let j = 0; j < parts.length; j++) {
        const tmp = document.createElement('span');
        tmp.innerHTML = parts[j];
        const text = norm(tmp.textContent || '');
        if (!text || isBlankish(text)) continue;
        devices.push(text);
      }
    }

    if (!devices.length) return;

    const br = document.createElement('br');
    br.className = 'scw-l3-connected-br';
    labelCell.appendChild(br);

    const span = document.createElement('span');
    span.className = 'scw-l3-connected-devices';
    span.innerHTML = '<b style="color:orange;">(' + escapeHtml(devices.join(', ')) + ')</b>';
    labelCell.appendChild(span);
  }

  // ============================================================
  // ✅ FEATURE: Build L1 footer as TRUE ROWS
  // ============================================================

function buildLevel1FooterRows(ctx, {
  titleText,
  subtotalText,
  discountText,
  totalText,
  hasDiscount,
  contextKey,
  groupLabel,
}) {
  const { colCount } = computeColumnMeta(ctx);

  function makeTrBase(extraClasses) {
    return $(`
      <tr
        class="scw-level-total-row scw-subtotal scw-subtotal--level-1 kn-table-totals ${extraClasses || ''}"
        data-scw-subtotal-level="1"
        data-scw-context="${escapeHtml(contextKey || 'default')}"
        data-scw-group-label="${escapeHtml(groupLabel || '')}"
      ></tr>
    `);
  }

function makeTitleRow(title, isFirst) {
  const { colCount } = computeColumnMeta(ctx);
  const cols = Math.max(colCount, 1);

  const $tr = makeTrBase(`scw-l1-title-row${isFirst ? ' scw-l1-first-row' : ''}`);

  // Match the line-row geometry: big left span + one trailing value cell.
  const leftSpan = Math.max(cols - 1, 1);

  $tr.append(`
    <td class="scw-l1-titlecell" colspan="${leftSpan}">
      <div class="scw-l1-title">${escapeHtml(title)}</div>
    </td>
  `);

  // trailing cell = same "slot" as totals value column
  $tr.append(`<td class="scw-l1-valuecell"></td>`);

  return $tr;
}






function makeLineRow({ label, value, rowType, isFirst, isLast }) {
  const meta = computeColumnMeta(ctx);
  const colCount = Math.max(meta.colCount || 0, 1);

  // costIdx is 0-based within the row. If we can’t find it, fall back to last column.
  const costIdx = Number.isFinite(meta.costIdx) && meta.costIdx >= 1 ? meta.costIdx : (colCount - 1);

  const $tr = makeTrBase(
    `scw-l1-line-row scw-l1-line--${rowType}` +
      `${isFirst ? ' scw-l1-first-row' : ''}` +
      `${isLast ? ' scw-l1-last-row' : ''}`
  );

  // Label cell spans from col 0 up through the column BEFORE cost.
  const labelSpan = Math.max(costIdx, 1);
  $tr.append(`
    <td class="scw-l1-labelcell" colspan="${labelSpan}">
      <div class="scw-l1-label">${escapeHtml(label)}</div>
    </td>
  `);

  // Cost cell: put the value in the actual cost column
  $tr.append(`
    <td class="${ctx.keys.cost} scw-l1-valuecell">
      <div class="scw-l1-value">${escapeHtml(value)}</div>
    </td>
  `);

  // Tail cells AFTER cost (only if cost isn’t the last column)
  const tailSpan = colCount - (labelSpan + 1);
  if (tailSpan > 0) {
    $tr.append(`<td colspan="${tailSpan}"></td>`);
  }

  return $tr;
}


  const title = norm(titleText || '');
  const rows = [];

  // Build the list (unmarked), then mark first/last
  if (title) rows.push(makeTitleRow(title, false));

  if (!hasDiscount) {
    rows.push(makeLineRow({ label: 'Total', value: totalText, rowType: 'final', isFirst: false, isLast: false }));
  } else {
    rows.push(
      makeLineRow({ label: 'Subtotal', value: subtotalText, rowType: 'sub', isFirst: false, isLast: false }),
      makeLineRow({ label: 'Discount', value: discountText, rowType: 'disc', isFirst: false, isLast: false }),
      makeLineRow({ label: 'Total', value: totalText, rowType: 'final', isFirst: false, isLast: false })
    );
  }

  // ✅ mark first + last emitted rows
  if (rows.length) {
    rows[0].addClass('scw-l1-first-row');
    rows[rows.length - 1].addClass('scw-l1-last-row');
  }

  return rows;
}


  // ============================================================
  // FEATURE: Build Project Grand Total Rows
  // ============================================================

  function readDomFieldValue(fieldKey, viewId) {
    const scope = viewId ? `#${viewId} ` : '';
    const $el = $(scope + `.kn-detail.field_${fieldKey} .kn-detail-body`);
    if (!$el.length) return 0;
    const raw = $el.first().text().replace(/[^0-9.\-]/g, '');
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : 0;
  }

  function buildProjectTotalRows(ctx, caches, $tbody) {
    if (!ctx.showProjectTotals) return [];

    const $allDataRows = $tbody.find('tr[id]');
    if (!$allDataRows.length) return [];

    const hardwareKey = ctx.keys.hardware;   // field_2201
    const discountKey = ctx.keys.discount;   // field_2267
    const laborKey = ctx.keys.labor;         // field_2028

    const equipmentSubtotal = sumField(caches, $allDataRows, hardwareKey);
    const lineItemDiscounts = Math.abs(sumField(caches, $allDataRows, 'field_2303'));
    const proposalDiscount = Math.abs(readDomFieldValue('2302', 'view_3342'));
    const equipmentTotal = equipmentSubtotal - lineItemDiscounts - proposalDiscount;
    const installationTotal = sumField(caches, $allDataRows, laborKey);
    const grandTotal = equipmentTotal + installationTotal;

    const hasAnyDiscount = lineItemDiscounts !== 0 || proposalDiscount !== 0;

    const meta = computeColumnMeta(ctx);
    const cols = Math.max(meta.colCount || 0, 1);
    const safeCostIdx = Number.isFinite(meta.costIdx) && meta.costIdx >= 1
      ? meta.costIdx
      : (cols - 1);

    function makeTr(extraClasses) {
      return $(`
        <tr
          class="scw-level-total-row scw-subtotal scw-subtotal--level-1 scw-project-totals kn-table-totals ${extraClasses || ''}"
          data-scw-subtotal-level="project"
        ></tr>
      `);
    }

    function makeTitleRow(title) {
      const leftSpan = Math.max(cols - 1, 1);
      const $tr = makeTr('scw-l1-title-row scw-project-totals-first-row');
      $tr.append(`
        <td class="scw-l1-titlecell" colspan="${leftSpan}">
          <div class="scw-l1-title">${escapeHtml(title)}</div>
        </td>
      `);
      $tr.append('<td class="scw-l1-valuecell"></td>');
      return $tr;
    }

    function makeLineRow({ label, value, rowType, isLast, extraClass }) {
      const labelSpan = Math.max(safeCostIdx, 1);
      const cls = `scw-l1-line-row scw-l1-line--${rowType}`
        + (isLast ? ' scw-project-totals-last-row' : '')
        + (extraClass ? ` ${extraClass}` : '');
      const $tr = makeTr(cls);

      $tr.append(`
        <td class="scw-l1-labelcell" colspan="${labelSpan}">
          <div class="scw-l1-label">${escapeHtml(label)}</div>
        </td>
      `);

      $tr.append(`
        <td class="${ctx.keys.cost} scw-l1-valuecell">
          <div class="scw-l1-value">${escapeHtml(value)}</div>
        </td>
      `);

      const tailSpan = cols - (labelSpan + 1);
      if (tailSpan > 0) {
        $tr.append(`<td colspan="${tailSpan}"></td>`);
      }

      return $tr;
    }

    const rows = [];

    rows.push(makeTitleRow('Project Totals'));

    if (hasAnyDiscount) {
      rows.push(makeLineRow({
        label: 'Equipment Subtotal',
        value: formatMoney(equipmentSubtotal),
        rowType: 'sub',
        isLast: false,
      }));

      if (lineItemDiscounts !== 0) {
        rows.push(makeLineRow({
          label: 'Line Item Discounts',
          value: '\u2013' + formatMoneyAbs(lineItemDiscounts),
          rowType: 'disc',
          isLast: false,
        }));
      }

      if (proposalDiscount !== 0) {
        rows.push(makeLineRow({
          label: 'Proposal Discount',
          value: '\u2013' + formatMoneyAbs(proposalDiscount),
          rowType: 'disc',
          isLast: false,
        }));
      }
    }

    rows.push(makeLineRow({
      label: 'Equipment Total',
      value: formatMoney(equipmentTotal),
      rowType: 'final',
      isLast: false,
    }));

    rows.push(makeLineRow({
      label: 'Installation Total',
      value: formatMoney(installationTotal),
      rowType: 'final',
      isLast: false,
    }));

    rows.push(makeLineRow({
      label: 'Grand Total',
      value: formatMoney(grandTotal),
      rowType: 'final',
      isLast: true,
      extraClass: 'scw-project-totals--grand',
    }));

    return rows;
  }

  // ============================================================
  // FEATURE: Build subtotal row
  // ============================================================

  function buildSubtotalRow(ctx, caches, {
    $cellsTemplate,
    $rowsToSum,
    labelOverride,
    level,
    contextKey,
    groupLabel,
    totals,
    hideQtyCost,
  }) {
    const leftText = labelOverride || groupLabel || '';

    const qtyKey = ctx.keys.qty;
    const costKey = ctx.keys.cost;
    const laborKey = ctx.keys.labor;
    const hardwareKey = ctx.keys.hardware;

    const qty = totals?.[qtyKey] ?? sumField(caches, $rowsToSum, qtyKey);
    const cost = totals?.[costKey] ?? sumField(caches, $rowsToSum, costKey);

    // ✅ L1: return 1 or 3 rows
    if (level === 1) {
      const hardware = sumField(caches, $rowsToSum, hardwareKey);       // field_2201
      const labor = sumField(caches, $rowsToSum, laborKey);           // field_2028
      const subtotal = hardware + labor;

      if (Math.abs(subtotal) < 0.01) return $();

      const discountL1 = Math.abs(sumField(caches, $rowsToSum, 'field_2303'));
      const hasDiscount = discountL1 > 0.004;
      const finalTotal = subtotal - discountL1;

      const titleText = norm(leftText || '').replace(/\s+—\s*Subtotal\s*$/i, '');

      const rows = buildLevel1FooterRows(ctx, {
        titleText,
        subtotalText: formatMoney(subtotal),
        discountText: '–' + formatMoneyAbs(discountL1),
        totalText: formatMoney(hasDiscount ? finalTotal : subtotal),
        hasDiscount,
        contextKey,
        groupLabel,
      });

      return $(rows.map(($r) => $r[0]));
    }

    // non-L1 subtotal rows (existing behavior)
    const safeHideQtyCost = Boolean(hideQtyCost);

    const $row = $(`
      <tr
        class="scw-level-total-row scw-subtotal scw-subtotal--level-${level} kn-table-totals${safeHideQtyCost ? ' scw-hide-qty-cost' : ''}"
        data-scw-subtotal-level="${level}"
        data-scw-context="${escapeHtml(contextKey || 'default')}"
        data-scw-group-label="${escapeHtml(groupLabel || '')}"
      >
        <td class="scw-level-total-label"><strong>${escapeHtml(leftText)}</strong></td>
      </tr>
    `);

    $row.append($cellsTemplate.clone());

    const hardware = sumField(caches, $rowsToSum, hardwareKey);
    const labor = sumField(caches, $rowsToSum, laborKey);
    const subtotalL2 = hardware + labor;

    $row.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
    $row.find(`td.${costKey}`).html(`<strong>${escapeHtml(formatMoney(subtotalL2))}</strong>`);
    $row.find(`td.${hardwareKey},td.${laborKey}`).empty();

    return $row;
  }

  // ============================================================
  // FEATURE: Hide subtotal filter when requested by L2 rule
  // ============================================================

  function hideSubtotalFilter(ctx) {
    const viewEl = ctx.$root?.[0];
    if (!viewEl) return;

    const filterSelectors = ['.kn-filters .kn-filter', '.kn-table-filters .kn-filter', '.kn-records-nav .kn-filter'];
    const filters = viewEl.querySelectorAll(filterSelectors.join(', '));

    for (const filter of filters) {
      if (filter.dataset.scwHideSubtotalFilter === '1') continue;
      const text = normKey(filter.textContent || '');
      if (text.includes('subtotal')) {
        filter.style.display = 'none';
        filter.dataset.scwHideSubtotalFilter = '1';
      }
    }
  }

  // ============================================================
  // FEATURE: Normalize field_2019 HTML for grouping (view-scoped)
  // ============================================================

  function normalizeField2019ForGrouping(ctx) {
    const key = ctx.keys.field2019;
    const cells = ctx.$root.find(`.kn-table td.${key}`).get();

    for (const cell of cells) {
      if (cell.dataset.scwNormalized === '1') continue;

      let html = sanitizeAllowOnlyBrAndB(decodeEntities(cell.innerHTML || ''));
      html = normalizeBrVariants(html)
        .replace(/\s*<br\s*\/?>\s*/gi, '<br />')
        .replace(/\s*<b>\s*/gi, '<b>')
        .replace(/\s*<\/b>\s*/gi, '</b>')
        .trim();

      cell.innerHTML = html;
      cell.dataset.scwNormalized = '1';
    }
  }

  // ============================================================
  // MAIN PROCESSOR
  // ============================================================

  function runTotalsPipeline(ctx) {
    const runId = Date.now();
    const $tbody = ctx.$tbody;
    if (!$tbody.length || $tbody.find('.kn-tr-nodata').length) return;

    normKeyCache.clear();
    const caches = makeRunCaches();

    $tbody
      .find('tr')
      .removeData([
        'scwConcatRunId',
        'scwConcatL3MountRunId',
        'scwL4_2019_RunId',
        'scwL3EachRunId',
        'scwL3ConnDevRunId',
        // NOTE: scwHeaderCellsAdded is intentionally NOT cleared here.
        // The appended <td> cells persist on group-header rows across
        // re-runs, so the guard must persist too — otherwise the safety-
        // net re-run appends a second set of cells (double Qty/Cost).
        'scwL2Rewrite_' + runId,
      ]);

    $tbody.find('tr.scw-level-total-row').remove();
    $tbody
      .find(`tr.kn-table-group.kn-group-level-3.${ctx.l2Specials.classOnLevel3}`)
      .removeClass(ctx.l2Specials.classOnLevel3);

    reorderLevel1Groups($tbody);
    reorderLevel2GroupsBySortField(ctx, $tbody, runId);

    const $firstDataRow = $tbody.find('tr[id]').first();
    if (!$firstDataRow.length) return;

    const $cellsTemplate = $firstDataRow.find('td:gt(0)').clone().empty();
    const $allGroupRows = $tbody.find('tr.kn-table-group');

    const sectionContext = {
      level2: { label: null, recordId: null },
      key: 'default',
      rule: null,
      hideLevel3Summary: false,
      hideQtyCostColumns: false,
    };

    const footerQueue = [];
    let shouldHideSubtotalFilterFlag = false;
    let hasAnyNonZeroL1Subtotal = false;

    const qtyKey = ctx.keys.qty;
    const laborKey = ctx.keys.labor;
    const hardwareKey = ctx.keys.hardware;
    const costKey = ctx.keys.cost;
    const discountKey = ctx.keys.discount;

    let blankL1Active = false;

    $allGroupRows.each(function () {
      const $groupRow = $(this);
      const match = this.className.match(/kn-group-level-(\d+)/);
      if (!match) return;

      const level = parseInt(match[1], 10);

      if (level === 2) {
        const info = getLevel2InfoFromGroupRow($groupRow);
        sectionContext.level2 = info;
        sectionContext.key = contextKeyFromLevel2Info(ctx, info);
        sectionContext.rule = getLevel2Rule(ctx, info);
        sectionContext.hideLevel3Summary = Boolean(sectionContext.rule?.hideLevel3Summary);
        sectionContext.hideQtyCostColumns = Boolean(sectionContext.rule?.hideQtyCostColumns);
        shouldHideSubtotalFilterFlag =
          shouldHideSubtotalFilterFlag || Boolean(sectionContext.rule?.hideSubtotalFilter);

        if (blankL1Active) {
          // Promote L2 to L1: mark for styling (applied after totals computed)
          $groupRow.addClass('scw-promoted-l2-as-l1');

          // Rename "Assumptions" → "General Project Assumptions" when promoted
          if (sectionContext.rule?.key === 'assumptions') {
            const $td = $groupRow.children('td').first();
            if ($td.length) {
              const $a = $td.find('a');
              if ($a.length) $a.text('General Project Assumptions');
              else $td.text('General Project Assumptions');
            }
            sectionContext.level2 = Object.assign({}, sectionContext.level2, { label: 'General Project Assumptions' });
          }
        } else {
          applyLevel2Styling($groupRow, sectionContext.rule);
        }
      }

      const $groupBlock = getGroupBlock($groupRow, level);
      if (!$groupBlock.length) return;

      const $rowsToSum = $groupBlock.filter('tr[id]');
      if (!$rowsToSum.length) return;

      const totals = sumFields(
        caches,
        $rowsToSum,
        [qtyKey, laborKey, hardwareKey, costKey, discountKey, 'field_2303'].filter(Boolean)
      );

      if (level === 1) {
        const l1Label = getGroupLabelText($groupRow);

        if (isBlankish(l1Label)) {
          // Blank L1: hide its header and promote child L2s to act as L1
          $groupRow.hide();
          blankL1Active = true;
          return; // skip L1 header styling and footer push
        }

        // Non-blank L1: reset promotion flag
        blankL1Active = false;

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        const l1Subtotal = (totals[hardwareKey] || 0) + (totals[laborKey] || 0);
        if (Math.abs(l1Subtotal) >= 0.01) hasAnyNonZeroL1Subtotal = true;

        $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>').addClass('scw-l1-header-qty');
        $groupRow.find(`td.${costKey}`).html('<strong>Cost</strong>').addClass('scw-l1-header-cost');
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();
      }

      // Promoted L2 → L1 header styling (needs totals, so placed after sumFields)
      if (level === 2 && blankL1Active) {
        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        const l2Subtotal = (totals[hardwareKey] || 0) + (totals[laborKey] || 0);
        if (Math.abs(l2Subtotal) >= 0.01) {
          hasAnyNonZeroL1Subtotal = true;
          $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>').addClass('scw-l1-header-qty');
          $groupRow.find(`td.${costKey}`).html('<strong>Cost</strong>').addClass('scw-l1-header-cost');
        }
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();
      }

      if (level === 3) {
        $groupRow.removeClass('scw-hide-level3-header').show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        if (sectionContext.hideLevel3Summary) {
          $groupRow.addClass('scw-hide-level3-header');
          return;
        }

        if (ctx.features.hideL3WhenBlank?.enabled) {
          const labelText = getGroupLabelText($groupRow);
          if (isBlankish(labelText)) {
            $groupRow.addClass('scw-hide-level3-header');
            return;
          }
        }

        const nearestL2 = getNearestLevel2Info(caches, $groupRow);
        const isMounting =
          (ctx.l2Specials.mountingHardwareId && nearestL2.recordId === ctx.l2Specials.mountingHardwareId) ||
          (!ctx.l2Specials.mountingHardwareId &&
            norm(nearestL2.label) === norm(ctx.l2Specials.mountingHardwareLabel));

        if (isMounting) {
          $groupRow.addClass(ctx.l2Specials.classOnLevel3);
          injectConcatIntoLevel3HeaderForMounting(ctx, caches, { $groupRow, $rowsToSum, runId });
        }

        const qty = totals[qtyKey];
        const hardware = totals[hardwareKey];

        $groupRow.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${costKey}`).html(`<strong>${escapeHtml(formatMoney(hardware))}</strong>`);
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();

        if (sectionContext.hideQtyCostColumns) $groupRow.addClass('scw-hide-qty-cost');

        injectEachIntoLevel3Header(ctx, caches, { level, $groupRow, $rowsToSum, runId });
        injectConnectedDevicesIntoLevel3Header(ctx, caches, { $groupRow, $rowsToSum, runId });
      }

      if (level === 4) {
        const blankL4Opt = ctx.features.hideBlankL4Headers;
        $groupRow.removeClass(blankL4Opt?.cssClass || 'scw-hide-level4-header').show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        if (blankL4Opt?.enabled) {
          const headerText = getGroupLabelText($groupRow);

          let field2019Text = '';
          if (blankL4Opt.requireField2019AlsoBlank) {
            const firstRow = $rowsToSum[0];
            const cell2019 = firstRow ? firstRow.querySelector(`td.${ctx.keys.field2019}`) : null;
            field2019Text = cell2019 ? norm(cell2019.textContent || '') : '';
          }

          if (isBlankish(headerText) && (!blankL4Opt.requireField2019AlsoBlank || isBlankish(field2019Text))) {
            $groupRow.addClass(blankL4Opt.cssClass);
          }
        }

        injectField2019IntoLevel4Header(ctx, { level, $groupRow, $rowsToSum, runId });

        const qty = totals[qtyKey];
        const labor = totals[laborKey];

        $groupRow.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${costKey}`).html(`<strong>${escapeHtml(formatMoney(labor))}</strong>`);
        $groupRow.find(`td.${hardwareKey},td.${laborKey}`).empty();

        if (sectionContext.hideQtyCostColumns) $groupRow.addClass('scw-hide-qty-cost');

        injectConcatIntoHeader(ctx, caches, {
          level,
          contextKey: sectionContext.key,
          $groupRow,
          $rowsToSum,
          runId,
        });
      }

      if (level === 1 || level === 2) {
        const levelInfo = level === 2 ? sectionContext.level2 : getLevel2InfoFromGroupRow($groupRow);

        if (level === 2 && !blankL1Active && shouldHideLevel2Footer(ctx, levelInfo)) return;

        // When L2 is promoted (blankL1Active), use level 1 for footer rules
        const effectiveLevel = (level === 2 && blankL1Active) ? 1 : level;

        footerQueue.push({
          level: effectiveLevel,
          label: levelInfo.label,
          contextKey: sectionContext.key,
          hideQtyCostColumns: effectiveLevel === 2 ? sectionContext.hideQtyCostColumns : false,
          $groupBlock,
          $cellsTemplate,
          $rowsToSum,
          totals,
        });
      }
    });

    const footersByAnchor = new Map();
    for (const item of footerQueue) {
      const anchorEl = item.$groupBlock.last()[0];
      if (!anchorEl) continue;
      if (!footersByAnchor.has(anchorEl)) footersByAnchor.set(anchorEl, []);
      footersByAnchor.get(anchorEl).push(item);
    }

    const anchors = Array.from(footersByAnchor.keys())
      .sort((a, b) => {
        if (a === b) return 0;
        const pos = a.compareDocumentPosition(b);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
      })
      .reverse();

    for (const anchorEl of anchors) {
      const items = footersByAnchor.get(anchorEl);

      items.sort((a, b) =>
        a.level === 2 && b.level === 1 ? -1 : a.level === 1 && b.level === 2 ? 1 : b.level - a.level
      );

      const fragment = document.createDocumentFragment();

      for (const item of items) {
        const $row = buildSubtotalRow(ctx, caches, {
          $cellsTemplate: item.$cellsTemplate,
          $rowsToSum: item.$rowsToSum,
          labelOverride: item.level === 1 ? `${item.label} — Subtotal` : null,
          level: item.level,
          contextKey: item.contextKey,
          groupLabel: item.label,
          totals: item.totals,
          hideQtyCost: item.hideQtyCostColumns,
        });

        // ✅ MULTI-ROW SAFE (L1 can return 1 or 3 rows)
        $row.each(function () {
          fragment.appendChild(this);
        });
      }

      anchorEl.parentNode.insertBefore(fragment, anchorEl.nextSibling);
    }

    applyLevel2LabelRewrites(ctx, $tbody, runId);

    if (shouldHideSubtotalFilterFlag) hideSubtotalFilter(ctx);

    if (!hasAnyNonZeroL1Subtotal) {
      $tbody.find('.scw-l1-header-qty, .scw-l1-header-cost').empty();
    }

    // ✅ Project Grand Total rows — appended to end of tbody
    refreshProjectTotals(ctx, caches, $tbody);

    log(ctx, 'runTotalsPipeline complete', { runId });
  }

  // Standalone refresh so view_3342 render can re-trigger it
  const _lastPipelineState = {};

  function refreshProjectTotals(ctx, caches, $tbody) {
    // Guard: skip if $tbody has been detached from the live DOM
    // (can happen when view_3342 fires while a view is mid-re-render).
    if (!$tbody.length || !document.contains($tbody[0])) return;

    // Store state so view_3342 handler can re-invoke
    _lastPipelineState[ctx.viewId] = { ctx, caches, $tbody };

    $tbody.find('tr.scw-project-totals').remove();

    const grandTotalRows = buildProjectTotalRows(ctx, caches, $tbody);
    if (grandTotalRows.length) {
      const gtFragment = document.createDocumentFragment();
      for (const $r of grandTotalRows) {
        $r.each(function () { gtFragment.appendChild(this); });
      }
      $tbody[0].appendChild(gtFragment);
    }
  }

  // ============================================================
  // EVENT BINDING (multi-view)
  // ============================================================

  // Pending safety-net state per view.
  const _safetyState = {};

  function bindForView(viewId) {
    const ev = `knack-records-render.${viewId}${CONFIG.eventNs}`;

    $(document)
      .off(ev)
      .on(ev, function (event, view) {
        // Tear down any prior safety-net timers / observer for this view.
        const prev = _safetyState[viewId];
        if (prev) {
          prev.timers.forEach(clearTimeout);
          if (prev.obs) prev.obs.disconnect();
        }
        _safetyState[viewId] = { timers: [], obs: null };

        let pipelineRunning = false;

        function executePipeline() {
          // Always re-acquire DOM context so we never touch a detached tbody.
          const ctx = buildCtx(viewId, view);
          if (!ctx) return;

          injectCssOnce();
          normalizeField2019ForGrouping(ctx);

          pipelineRunning = true;
          try {
            runTotalsPipeline(ctx);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`[SCW totals][${viewId}] error:`, error);
          } finally {
            pipelineRunning = false;
          }
        }

        function totalsAreMissing() {
          var root = document.getElementById(viewId);
          if (!root) return false;
          var $tbody = $(root).find('.kn-table tbody');
          return $tbody.length && !$tbody.find('tr.scw-level-total-row').length;
        }

        // Run the pipeline synchronously — the DOM is ready when
        // knack-records-render fires, so there is no reason to defer.
        executePipeline();

        // Safety net 1: staggered timer checks at 300ms and 1200ms.
        // Covers Knack async re-renders that wipe our injected rows.
        [300, 1200].forEach(function (ms) {
          var t = setTimeout(function () {
            if (totalsAreMissing()) executePipeline();
          }, ms);
          _safetyState[viewId].timers.push(t);
        });

        // Safety net 2: short-lived MutationObserver on the view root.
        // Catches Knack wiping tbody content between our timer checks.
        var viewRoot = document.getElementById(viewId);
        if (viewRoot) {
          var obsDebounce = 0;
          var obs = new MutationObserver(function () {
            if (pipelineRunning) return;          // we caused this mutation
            if (obsDebounce) clearTimeout(obsDebounce);
            obsDebounce = setTimeout(function () {
              obsDebounce = 0;
              if (totalsAreMissing()) executePipeline();
            }, 80);
          });
          obs.observe(viewRoot, { childList: true, subtree: true });
          _safetyState[viewId].obs = obs;

          // Disconnect observer after 3s — we only need it for the initial
          // settle period.  Keeps long-lived overhead at zero.
          var disconnectTimer = setTimeout(function () { obs.disconnect(); }, 3000);
          _safetyState[viewId].timers.push(disconnectTimer);
        }
      });
  }

  Object.keys(CONFIG.views).forEach(bindForView);

  // When view_3342 (detail view with field_2302) renders, refresh project totals
  $(document).on('knack-view-render.view_3342' + CONFIG.eventNs, function () {
    Object.keys(_lastPipelineState).forEach(function (viewId) {
      const s = _lastPipelineState[viewId];
      if (s && s.ctx.showProjectTotals) {
        refreshProjectTotals(s.ctx, s.caches, s.$tbody);
      }
    });
  });
})();/////*********** BID ITEMS GRID VIEW (effective Q1 2026) ***************//////
/**
 * SCW Bid Items Grid Script - Adapted from proposal-grid.js
 * Simplified: labor-only subtotals, no hardware/cost/discount columns,
 * no field2019 injection, no hideL3WhenBlank, no hideBlankL4Headers.
 *
 * Created: 2026-03-03
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG (ONLY PLACE YOU SHOULD EDIT FOR NEW VIEWS / FIELDS)
  // ============================================================

  const CONFIG = {
    views: {
      view_3550: {
        showProjectTotals: true,
        keys: {
          qty: 'field_2399',
          rate: 'field_2400',
          labor: 'field_2401',
          prefix: 'field_2361',
          number: 'field_2362',
          field2409: 'field_2409',
          l2Sort: 'field_2218',
          l2Selector: 'field_2228',
        },
      },
    },

    styleSceneIds: ['scene_1149'],

    features: {
      l2Sort: { enabled: true, missingSortGoesLast: true },

      level2LabelRewrite: {
        enabled: true,
        rules: [
          {
            when: 'Video',
            match: 'exact',
            renames: {
              'Camera or Reader': 'Cameras',
              'Networking or Headend': 'NVRs, Switches, and Networking',
            },
          },
          {
            when: 'Access Control',
            match: 'exact',
            renames: {
              'Camera or Reader': 'Entries',
              'Networking or Headend': 'AC Controllers, Switches, and Networking',
            },
          },
          {
            when: 'video',
            match: 'contains',
            renames: {
              'Networking or Headend': 'NVR, Switches, and Networking',
            },
          },
        ],
      },

      concat: { enabled: true, onlyContextKey: 'drop', onlyLevel: 3 },

      concatL3Mounting: {
        enabled: true,
        level2Label: 'Mounting Hardware',
        level: 3,
        cssClass: 'scw-concat-cameras--mounting',
      },

      hideL2Footer: {
        enabled: true,
        labels: ['Assumptions'],
        recordIds: ['697b7a023a31502ec68b3303'],
      },
    },

    l2Context: {
      byId: {},
      byLabel: {
        'Cameras & Cabling': 'drop',
        'Cameras and Cabling': 'drop',
        'Cameras or Cabling': 'drop',
        'Camera or Reader': 'drop',
        'Cameras': 'drop',
        'Entries': 'drop',

        'Networking or Headend': 'headend',
        'Networking & Headend': 'headend',
        'NVRs, Switches, and Networking': 'headend',
        'NVR, Switches, and Networking': 'headend',
        'AC Controllers, Switches, and Networking': 'headend',

        Services: 'services',
      },
    },

    l2SectionRules: [
      {
        key: 'services',
        recordIds: ['6977caa7f246edf67b52cbcd'],
        labels: ['Services'],
        hideLevel3Summary: true,
        hideQtyCostColumns: true,
        hideSubtotalFilter: true,
        headerBackground: '',
        headerTextColor: '',
      },
      {
        key: 'assumptions',
        recordIds: ['697b7a023a31502ec68b3303'],
        labels: ['Assumptions'],
        hideLevel3Summary: true,
        hideQtyCostColumns: true,
        hideSubtotalFilter: true,
        headerBackground: '#f0f7ff',
        headerTextColor: '',
      },
    ],

    l2Specials: {
      mountingHardwareId: '',
      mountingHardwareLabel: 'Mounting Hardware',
      classOnLevel3: 'scw-level3--mounting-hardware',
    },

    debug: false,
    eventNs: '.scwBidItems',
    cssId: 'scw-bid-items-css',
  };

  // ============================================================
  // SMALL UTILITIES
  // ============================================================

  const decoderElement = document.createElement('textarea');
  const htmlEscapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  const htmlEscapeRegex = /[&<>"']/g;

  function escapeHtml(str) {
    return String(str ?? '').replace(htmlEscapeRegex, (char) => htmlEscapeMap[char]);
  }

  function decodeEntities(str) {
    decoderElement.innerHTML = str;
    return decoderElement.value;
  }

  function norm(s) {
    return String(s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const normKeyCache = new Map();
  function normKey(s) {
    const key = String(s);
    if (normKeyCache.has(key)) return normKeyCache.get(key);
    const result = norm(s).toLowerCase();
    normKeyCache.set(key, result);
    return result;
  }

  function isBlankish(v) {
    const t = norm(v);
    return !t || t === '-' || t === '—' || t === '–';
  }

  function formatMoney(n) {
    const num = Number(n || 0);
    return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
  }

  function log(ctx, ...args) {
    if (!CONFIG.debug) return;
    // eslint-disable-next-line no-console
    console.log(`[SCW bid-items][${ctx.viewId}]`, ...args);
  }

  // ============================================================
  // LIMITED HTML SANITIZE (Allow only <b> and <br>)
  // ============================================================

  const sanitizeRegex = /<\/?strong\b[^>]*>/gi;
  const removeTagsRegex = /<(?!\/?(br|b)\b)[^>]*>/gi;

  function normalizeBrVariants(html) {
    if (!html) return '';
    return String(html)
      .replace(/<\/\s*br\s*>/gi, '<br />')
      .replace(/<\s*br\s*\/?\s*>/gi, '<br />');
  }

  function normalizeBoldSpacing(html) {
    if (!html) return '';
    let out = String(html);
    out = out.replace(/([^\s>])\s*<b\b/gi, '$1 <b');
    out = out.replace(/<\/b>\s*([^\s<])/gi, '</b> $1');
    return out;
  }

  function sanitizeAllowOnlyBrAndB(html) {
    if (!html) return '';
    return normalizeBoldSpacing(
      normalizeBrVariants(html)
        .replace(sanitizeRegex, (tag) => tag.replace(/strong/gi, 'b'))
        .replace(removeTagsRegex, '')
        .replace(/<\/\s*br\s*>/gi, '<br />')
        .replace(/<\s*br\s*\/?\s*>/gi, '<br />')
    );
  }

  function plainTextFromLimitedHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = String(html || '');
    return norm(tmp.textContent || '');
  }

  // ============================================================
  // ROW CACHE (per run)
  // ============================================================

  function makeRunCaches() {
    return {
      rowCache: new WeakMap(),
      nearestL2Cache: new WeakMap(),
    };
  }

  function getRowCache(caches, row) {
    let cache = caches.rowCache.get(row);
    if (!cache) {
      cache = { cells: new Map(), nums: new Map(), texts: new Map() };
      caches.rowCache.set(row, cache);
    }
    return cache;
  }

  function getRowCell(caches, row, fieldKey) {
    const cache = getRowCache(caches, row);
    if (cache.cells.has(fieldKey)) return cache.cells.get(fieldKey);
    const cell = row.querySelector(`td.${fieldKey}`);
    cache.cells.set(fieldKey, cell || null);
    return cell;
  }

  function getRowCellText(caches, row, fieldKey) {
    const cache = getRowCache(caches, row);
    if (cache.texts.has(fieldKey)) return cache.texts.get(fieldKey);
    const cell = getRowCell(caches, row, fieldKey);
    const text = cell ? cell.textContent.trim() : '';
    cache.texts.set(fieldKey, text);
    return text;
  }

  function getRowNumericValue(caches, row, fieldKey) {
    const cache = getRowCache(caches, row);
    if (cache.nums.has(fieldKey)) return cache.nums.get(fieldKey);
    const cell = getRowCell(caches, row, fieldKey);
    const value = cell ? parseFloat(cell.textContent.replace(/[^\d.-]/g, '')) : NaN;
    cache.nums.set(fieldKey, value);
    return value;
  }

  function sumField(caches, $rows, fieldKey) {
    let total = 0;
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const num = getRowNumericValue(caches, rows[i], fieldKey);
      if (Number.isFinite(num)) total += num;
    }
    return total;
  }

  function sumFields(caches, $rows, fieldKeys) {
    const totals = {};
    fieldKeys.forEach((key) => (totals[key] = 0));
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const key of fieldKeys) {
        const num = getRowNumericValue(caches, row, key);
        if (Number.isFinite(num)) totals[key] += num;
      }
    }
    return totals;
  }

  function avgField(caches, $rows, fieldKey) {
    let total = 0;
    let count = 0;
    const rows = $rows.get();
    for (let i = 0; i < rows.length; i++) {
      const num = getRowNumericValue(caches, rows[i], fieldKey);
      if (Number.isFinite(num) && num !== 0) {
        total += num;
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }

  // ============================================================
  // DOM HELPERS (view-scoped only)
  // ============================================================

  function buildCtx(viewId, view) {
    const vcfg = CONFIG.views[viewId];
    if (!vcfg) return null;

    const root = document.getElementById(viewId);
    if (!root) return null;

    const $root = $(root);
    const $tbody = $root.find('.kn-table tbody');

    return {
      viewId,
      view,
      $root,
      $tbody,
      keys: vcfg.keys,
      showProjectTotals: vcfg.showProjectTotals !== false,
      features: CONFIG.features,
      l2Context: CONFIG.l2Context,
      l2SectionRules: CONFIG.l2SectionRules,
      l2Specials: CONFIG.l2Specials,
    };
  }

  function getGroupLabelText($groupRow) {
    const $td = $groupRow.children('td').first();
    return $td.length ? norm($td.text()) : '';
  }

  // ============================================================
  // COLUMN META: real colCount + indices of qty/labor columns
  // ============================================================

  function computeColumnMeta(ctx) {
    const firstRow = ctx.$root.find('.kn-table tbody tr[id]').first()[0];
    const colCount = firstRow ? firstRow.querySelectorAll('td').length : 0;

    let qtyIdx = -1;
    let laborIdx = -1;

    const ths = ctx.$root.find('.kn-table thead th').get();
    if (ths && ths.length) {
      qtyIdx = ths.findIndex((th) => th.classList && th.classList.contains(ctx.keys.qty));
      laborIdx = ths.findIndex((th) => th.classList && th.classList.contains(ctx.keys.labor));
    }

    if (firstRow) {
      const tds = Array.from(firstRow.querySelectorAll('td'));
      if (qtyIdx < 0) qtyIdx = tds.findIndex((td) => td.classList && td.classList.contains(ctx.keys.qty));
      if (laborIdx < 0) laborIdx = tds.findIndex((td) => td.classList && td.classList.contains(ctx.keys.labor));
    }

    return { colCount: Math.max(colCount, 0), qtyIdx, laborIdx };
  }

  // ============================================================
  // FEATURE: CSS injection (multi-view safe)
  // ============================================================

  let cssInjected = false;
  function injectCssOnce() {
    if (cssInjected) return;

    if (document.getElementById(CONFIG.cssId)) {
      cssInjected = true;
      return;
    }

    cssInjected = true;

    const sceneSelectors = (CONFIG.styleSceneIds || []).map((id) => `#kn-${id}`).join(', ');
    const viewIds = Object.keys(CONFIG.views);

    function sel(suffix) {
      return viewIds.map((id) => `#${id} ${suffix}`.trim()).join(', ');
    }

    const anyView = CONFIG.views[viewIds[0]];
    const QTY_FIELD_KEY = anyView?.keys?.qty || 'field_2399';
    const RATE_FIELD_KEY = anyView?.keys?.rate || 'field_2400';
    const LABOR_FIELD_KEY = anyView?.keys?.labor || 'field_2401';

    const style = document.createElement('style');
    style.id = CONFIG.cssId;

    style.textContent = `
/* ============================================================
   SCW Bid Items Grid helper CSS
   ============================================================ */
tr.scw-level-total-row.scw-subtotal td { vertical-align: middle; }
tr.scw-level-total-row.scw-subtotal .scw-level-total-label { white-space: nowrap; }

.scw-concat-cameras { line-height: 1.2; }
.scw-concat-cameras--mounting { line-height: 1.15; }

.scw-concat-cameras b,
.scw-concat-cameras strong { font-weight: 800 !important; }

.scw-l3-2409 { display: inline; line-height: 1.2; }
.scw-l3-2409 b,
.scw-l3-2409 strong { font-weight: 800 !important; }

/* Hide the raw field_2409 column (data lives in data rows for injection) */
th.field_2409, td.field_2409 { display: none !important; }

tr.scw-hide-level3-header { display: none !important; }

/* Prevent KTL ktlDisplayNone_hc from collapsing hidden-column cells in our
   custom rows.  Group headers don't get the class so their cells stay visible;
   subtotals DO get it, causing column-count mismatch.  Force table-cell so
   every row keeps the same column structure. */
tr.scw-level-total-row td.ktlDisplayNone_hc { display: table-cell !important; }

/* Hide Qty/Rate content while preserving column layout
   GUARD: never hide on L1 subtotal rows */
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${QTY_FIELD_KEY} { visibility: hidden !important; }
tr.scw-hide-qty-cost:not(.scw-subtotal--level-1) td.${RATE_FIELD_KEY} { visibility: hidden !important; }
tr.scw-hide-cost td.${LABOR_FIELD_KEY} { visibility: hidden !important; }

/* ============================================================
   L1 footer layout (true rows)
   ============================================================ */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line-row td { background: inherit !important; }

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-title{
  text-align: right;
  font-weight: 700;
  margin: 6px 0 0px;
  vertical-align: bottom;
  white-space: normal;
  overflow-wrap: anywhere;
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-label{
  text-align: right;
  opacity: .85;
  font-weight: 600;
  white-space: nowrap;
}

tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-value{
  text-align: right;
  font-weight: 700;
  white-space: nowrap;
}

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--final .scw-l1-label,
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--final .scw-l1-value{
  color: #07467c !important;
  font-weight: 900 !important;
}

tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-line--final .scw-l1-value{
  font-size: 18px;
}

/* 80px whitespace ABOVE the first L1 footer row */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-first-row td{
  border-top: 20px solid transparent !important;
  border-bottom: 5px solid #07467c !important;
}

/* 80px whitespace BELOW the last L1 footer row */
tr.scw-level-total-row.scw-subtotal--level-1.scw-l1-last-row td{
  border-bottom: 60px solid #fff !important;
}

tr.scw-level-total-row.scw-subtotal--level-1 td.scw-l1-valuecell {
  text-align: center !important;
}
tr.scw-level-total-row.scw-subtotal--level-1 .scw-l1-value {
  text-align: center;
}

/* ============================================================
   Project Grand Totals
   ============================================================ */
tr.scw-level-total-row.scw-project-totals.scw-project-totals-first-row .scw-l1-title {
  font-size: 2.2em !important;
  font-weight: 600 !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals-first-row td {
  border-top: 20px solid transparent !important;
  border-bottom: 5px solid #07467c !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals-last-row td {
  border-bottom: 60px solid #fff !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals--grand .scw-l1-label {
  font-size: 21px !important;
}

tr.scw-level-total-row.scw-project-totals.scw-project-totals--grand .scw-l1-value {
  font-size: 23px !important;
}

/* ============================================================
   VIEW-SCOPED CSS — APPLIED TO ALL CONFIG.views
   ============================================================ */

/********************* OVERALL -- GRID ***********************/
${sceneSelectors} h2 {font-weight: 800; color: #07467c; font-size: 24px;}

${sel('.kn-pagination .kn-select')} { display: none !important; }
${sel('> div.kn-records-nav > div.level > div.level-left > div.kn-entries-summary')} { display: none !important; }

/* This hides all data rows (leaves only group headers + totals rows) */
${sel('.kn-table tbody tr[id]')} { display: none !important; }

/* Hide vertical borders in the grid */
${sel('.kn-table th')},
${sel('.kn-table td')} { border-left: none !important; border-right: none !important; }

${sel('.kn-table tbody td')} { vertical-align: middle; }
/********************* OVERALL -- GRID ***********************/


/********************* LEVEL 1 (MDF/IDF) *********************/
${sceneSelectors} .kn-table-group.kn-group-level-1 {
  font-size: 16px;
  font-weight: 600;
  background-color: white !important;
  color: #07467c !important;
  padding-right: 20% !important;
  padding-left: 20px !important;
  padding-top: 30px !important;
  padding-bottom: 0px !important;
  text-align: center !important;
}
${sceneSelectors} .kn-table-group.kn-group-level-1 td:first-child {font-size: 24px; font-weight: 200 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-1 td {border-bottom-width: 20px !important; border-color: #07467c !important;}

${sel('tr.scw-subtotal--level-1 td')} {
  background: RGB(7, 70, 124, 1);
  border-top:0px solid #dadada;
  font-weight:600;
  color: #07467c;
  text-align: right;
  border-bottom-width: 0px;
  border-color: #07467c;
  font-size: 16px;
}

${sel('tr.scw-level-total-row.scw-subtotal--level-1')} {
  background: transparent !important;
}
${sel('tr.scw-level-total-row.scw-subtotal--level-1 td')} {
  background: inherit !important;
}

${sel('tr.scw-grand-total-sep td')} { height:10px; background:transparent; border:none !important; }
${sel('tr.scw-grand-total-row td')} {
  background:white;
  border-top:2px solid #bbb !important;
  font-weight:800;
  color: #07467c;
  font-size: 20px;
  text-align: right;
}
/********************* LEVEL 1 (MDF/IDF) ***********************/

/*** Promoted L2 (blank L1 → L2 acts as L1) ***/
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-promoted-l2-as-l1 {
  font-size: 16px;
  font-weight: 600;
  background-color: white !important;
  color: #07467c !important;
  padding-right: 20% !important;
  padding-left: 20px !important;
  padding-top: 30px !important;
  padding-bottom: 0px !important;
  text-align: center !important;
}
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-promoted-l2-as-l1 td:first-child {font-size: 24px; font-weight: 200 !important;}
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-promoted-l2-as-l1 td {border-bottom-width: 20px !important; border-color: #07467c !important; border-top: 0 !important;}

/********************* LEVEL 2 (BUCKET) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-2 {
  font-size: 16px;
  font-weight: 400 !important;
  background-color: aliceblue !important;
  color: #07467c;
}
${sceneSelectors} .kn-table-group.kn-group-level-2 td {padding: 5px 0px 5px 20px !important; border-top: 20px solid transparent !important;}
${sceneSelectors} .kn-table-group.kn-group-level-2.scw-l2--assumptions td {font-weight: 600 !important;}

${sel('tr.scw-subtotal--level-2 td')} {
  background: aliceblue;
  border-top:1px solid #dadada;
  font-weight:800 !important;
  color: #07467c;
  text-align: center !important;
  border-bottom-width: 20px !important;
  border-color: transparent;
}
${sel('tr.scw-subtotal--level-2 td:first-child')} {text-align: right !important;}
/********************* LEVEL 2 (BUCKET) ***********************/


/********************* LEVEL 3 (INSTALL DESCRIPTION) ***********************/
${sceneSelectors} .kn-table-group.kn-group-level-3 {background-color: white !important; color: #07467c;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:nth-last-child(-n+3) {font-weight:600 !important; color: #07467c !important;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td {padding-top: 5px !important; font-weight: 300;}
${sceneSelectors} .kn-table-group.kn-group-level-3 td:first-child {padding-left:80px !important;}

${sel('tr.kn-table-group.kn-group-level-3.scw-level3--mounting-hardware td:first-child')} {
  font-size: 14px !important;
  font-weight: 400 !important;
}
/********************* LEVEL 3 (INSTALL DESCRIPTION) ***********************/
`;

    document.head.appendChild(style);
  }

  // ============================================================
  // FEATURE: Record-ID extraction + L2 helpers
  // ============================================================

  function extractRecordIdFromElement(el) {
    if (!el) return null;

    const direct = el.getAttribute('data-record-id') || el.getAttribute('data-id');
    if (direct) return direct.trim();

    const nested = el.querySelector('[data-record-id],[data-id]');
    if (nested) {
      const nestedId = nested.getAttribute('data-record-id') || nested.getAttribute('data-id');
      if (nestedId) return nestedId.trim();
    }

    const a = el.querySelector('a[href]');
    if (a) {
      const href = a.getAttribute('href') || '';
      const patterns = [/\/records\/([A-Za-z0-9]+)/i, /\/record\/([A-Za-z0-9]+)/i, /[?&]id=([A-Za-z0-9]+)/i];
      for (const pattern of patterns) {
        const match = href.match(pattern);
        if (match?.[1]) return match[1];
      }
    }

    return null;
  }

  function getLevel2InfoFromGroupRow($groupRow) {
    const el = $groupRow[0];
    if (!el) return { label: null, recordId: null };

    const td = el.querySelector('td:first-child');
    const label = td ? norm(td.textContent) : null;
    const recordId = extractRecordIdFromElement(td);

    return { label, recordId };
  }

  function contextKeyFromLevel2Info(ctx, level2Info) {
    const id = level2Info?.recordId;
    const label = level2Info?.label;

    if (id && ctx.l2Context.byId[id]) return ctx.l2Context.byId[id];
    if (label && ctx.l2Context.byLabel[label]) return ctx.l2Context.byLabel[label];
    return 'default';
  }

  function matchesLevel2Rule(level2Info, rule) {
    if (!level2Info || !rule) return false;

    const id = (level2Info.recordId || '').trim();
    if (id && Array.isArray(rule.recordIds) && rule.recordIds.includes(id)) return true;

    const label = norm(level2Info.label);
    if (!label || !Array.isArray(rule.labels)) return false;

    return rule.labels.some((entry) => norm(entry) === label);
  }

  function getLevel2Rule(ctx, level2Info) {
    for (const rule of ctx.l2SectionRules) {
      if (matchesLevel2Rule(level2Info, rule)) return rule;
    }
    return null;
  }

  function applyLevel2Styling($groupRow, rule) {
    if (!rule || !$groupRow?.length) return;
    $groupRow.addClass(`scw-l2--${rule.key}`);

    if (rule.key === 'assumptions') $groupRow.addClass('scw-l2--assumptions-id');

    if (rule.headerBackground) $groupRow.css('background-color', rule.headerBackground);
    if (rule.headerTextColor) $groupRow.css('color', rule.headerTextColor);
  }

  function shouldHideLevel2Footer(ctx, level2Info) {
    const opt = ctx.features.hideL2Footer;
    if (!opt?.enabled) return false;

    const id = (level2Info?.recordId || '').trim();
    if (id && (opt.recordIds || []).includes(id)) return true;

    const labelKey = normKey(level2Info?.label || '');
    if (!labelKey) return false;

    return (opt.labels || []).some((l) => normKey(l) === labelKey);
  }

  // ============================================================
  // FEATURE: Nearest L2 cache
  // ============================================================

  function makeNearestLevel2InfoFinder() {
    return function getNearestLevel2Info(caches, $row) {
      const el = $row[0];
      if (caches.nearestL2Cache.has(el)) return caches.nearestL2Cache.get(el);

      let current = el.previousElementSibling;
      while (current) {
        const classList = current.classList;
        if (classList.contains('kn-group-level-2')) {
          const result = getLevel2InfoFromGroupRow($(current));
          caches.nearestL2Cache.set(el, result);
          return result;
        }
        if (classList.contains('kn-group-level-1')) break;
        current = current.previousElementSibling;
      }

      const result = { label: null, recordId: null };
      caches.nearestL2Cache.set(el, result);
      return result;
    };
  }
  const getNearestLevel2Info = makeNearestLevel2InfoFinder();

  // ============================================================
  // FEATURE: L2 Label rewriting
  // ============================================================

  function getSelectorFieldValue(ctx, $row) {
    const selectorKey = ctx.keys.l2Selector;
    const $cell = $row.find(`td.${selectorKey}`).first();
    if (!$cell.length) return '';

    const attrs = ['data-raw-value', 'data-value', 'data-id', 'data-record-id'];
    for (const attr of attrs) {
      const val = $cell.attr(attr);
      if (val) return norm(val);
    }

    const $nested = $cell.find('[data-raw-value],[data-value],[data-id],[data-record-id]').first();
    if ($nested.length) {
      for (const attr of attrs) {
        const val = $nested.attr(attr);
        if (val) return norm(val);
      }
    }

    const titleish = $cell.attr('title') || $cell.attr('aria-label');
    if (titleish) return norm(titleish);

    return norm($cell.text());
  }

  function valueMatchesRule(value, rule) {
    const v = normKey(value);
    const w = normKey(rule.when);
    if (!v || !w) return false;
    return rule.match === 'contains' ? v.includes(w) : v === w;
  }

  function findRuleForSection(ctx, $rowsInSection) {
    const opt = ctx.features.level2LabelRewrite;
    if (!opt?.enabled || !opt.rules) return null;

    const values = new Set();

    $rowsInSection.filter('tr[id]').each(function () {
      const val = getSelectorFieldValue(ctx, $(this));
      if (val) values.add(val);
    });

    if (values.size === 0) {
      $rowsInSection.each(function () {
        const val = getSelectorFieldValue(ctx, $(this));
        if (val) values.add(val);
      });
    }

    for (const val of values) {
      for (const rule of opt.rules) {
        if (valueMatchesRule(val, rule)) return rule;
      }
    }
    return null;
  }

  function applyLevel2LabelRewrites(ctx, $tbody, runId) {
    const opt = ctx.features.level2LabelRewrite;
    if (!opt?.enabled) return;

    const $l1 = $tbody.find('tr.kn-table-group.kn-group-level-1');
    if (!$l1.length) return;

    for (let idx = 0; idx < $l1.length; idx++) {
      const $start = $l1.eq(idx);
      const $nextL1 = idx + 1 < $l1.length ? $l1.eq(idx + 1) : null;

      const $rowsInSection = $nextL1 ? $start.nextUntil($nextL1).addBack() : $start.nextAll().addBack();

      const rule = findRuleForSection(ctx, $rowsInSection);
      if (!rule?.renames) continue;

      $rowsInSection.filter('tr.kn-table-group.kn-group-level-2').each(function () {
        const $groupRow = $(this);

        if ($groupRow.data(`scwL2Rewrite_${runId}`)) return;
        $groupRow.data(`scwL2Rewrite_${runId}`, true);

        const $td = $groupRow.children('td').first();
        if (!$td.length) return;

        const currentLabel = norm($td.text());
        const newLabel = rule.renames[currentLabel];

        if (newLabel) {
          const $a = $td.find('a');
          if ($a.length) $a.text(newLabel);
          else $td.text(newLabel);
        }
      });

      $rowsInSection
        .filter('tr.scw-level-total-row.scw-subtotal[data-scw-subtotal-level="2"]')
        .each(function () {
          const $tr = $(this);
          const gl = norm($tr.attr('data-scw-group-label'));
          const replacement = rule.renames[gl];
          if (!replacement) return;

          $tr.attr('data-scw-group-label', replacement);
          $tr.find('.scw-level-total-label strong').text(replacement);
        });
    }
  }

  // ============================================================
  // FEATURE: Group boundary detection
  // ============================================================

  function getGroupBlock($groupRow, levelNum) {
    const nodes = [];
    let current = $groupRow[0].nextElementSibling;

    while (current) {
      if (current.classList.contains('kn-table-group')) {
        const match = current.className.match(/kn-group-level-(\d+)/);
        const currentLevel = match ? parseInt(match[1], 10) : null;
        if (currentLevel !== null && currentLevel <= levelNum) break;
      }
      nodes.push(current);
      current = current.nextElementSibling;
    }

    return $(nodes);
  }

  // ============================================================
  // FEATURE: L1 group reorder — alphabetical, blank labels last
  // ============================================================

  function reorderLevel1Groups($tbody) {
    const tbody = $tbody?.[0];
    if (!tbody) return;

    const l1Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1'));
    if (l1Headers.length < 2) return;

    const blocks = l1Headers.map((l1El, idx) => {
      const nextL1El = idx + 1 < l1Headers.length ? l1Headers[idx + 1] : null;
      const nodes = [];
      let n = l1El;
      while (n && n !== nextL1El) {
        nodes.push(n);
        n = n.nextElementSibling;
      }
      const label = norm(l1El.querySelector('td')?.textContent || '');
      return { idx, label, nodes };
    });

    blocks.sort((a, b) => {
      const aBlank = a.label === '';
      const bBlank = b.label === '';
      if (aBlank !== bBlank) return aBlank ? 1 : -1;
      return a.label.localeCompare(b.label);
    });

    const frag = document.createDocumentFragment();
    for (const block of blocks) {
      for (const n of block.nodes) frag.appendChild(n);
    }
    tbody.appendChild(frag);
  }

  // ============================================================
  // FEATURE: L2 group reorder — within each L1 section
  // ============================================================

  function getSortValueForL2Block(ctx, l2HeaderEl, stopEl) {
    const sortKey = ctx.keys.l2Sort;
    let cur = l2HeaderEl.nextElementSibling;

    while (cur && cur !== stopEl) {
      if (cur.id && cur.tagName === 'TR') {
        const cell = cur.querySelector(`td.${sortKey}`);
        if (cell) {
          const raw = norm(cell.textContent || '');
          const num = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
          if (Number.isFinite(num)) return num;
        }
      }

      if (cur.classList?.contains('kn-table-group')) {
        const m = cur.className.match(/kn-group-level-(\d+)/);
        const lvl = m ? parseInt(m[1], 10) : null;
        if (lvl !== null && lvl <= 2) break;
      }
      cur = cur.nextElementSibling;
    }

    return null;
  }

  function reorderLevel2GroupsBySortField(ctx, $tbody, runId) {
    const opt = ctx.features.l2Sort;
    if (!opt?.enabled) return;

    const tbody = $tbody?.[0];
    if (!tbody) return;

    const stampKey = 'scwL2ReorderStamp';
    if (tbody.dataset[stampKey] === String(runId)) return;
    tbody.dataset[stampKey] = String(runId);

    const l1Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1'));
    if (!l1Headers.length) return;

    const missing = opt.missingSortGoesLast ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

    for (let i = 0; i < l1Headers.length; i++) {
      const l1El = l1Headers[i];
      const nextL1El = i + 1 < l1Headers.length ? l1Headers[i + 1] : null;

      const sectionNodes = [];
      let cur = l1El.nextElementSibling;
      while (cur && cur !== nextL1El) {
        sectionNodes.push(cur);
        cur = cur.nextElementSibling;
      }
      if (!sectionNodes.length) continue;

      const l2Headers = sectionNodes.filter(
        (n) => n.classList && n.classList.contains('kn-table-group') && n.classList.contains('kn-group-level-2')
      );
      if (l2Headers.length < 2) continue;

      const firstL2 = l2Headers[0];

      const prefixNodes = [];
      cur = l1El.nextElementSibling;
      while (cur && cur !== nextL1El && cur !== firstL2) {
        prefixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      const blocks = l2Headers.map((l2El, idx) => {
        const nextL2El = idx + 1 < l2Headers.length ? l2Headers[idx + 1] : null;

        const nodes = [];
        let n = l2El;
        while (n && n !== nextL1El && n !== nextL2El) {
          nodes.push(n);
          n = n.nextElementSibling;
        }

        const sortVal = getSortValueForL2Block(ctx, l2El, nextL2El || nextL1El);
        return { idx, sortVal, nodes };
      });

      const lastBlock = blocks[blocks.length - 1];
      const lastBlockLastNode = lastBlock.nodes[lastBlock.nodes.length - 1];

      const suffixNodes = [];
      cur = lastBlockLastNode ? lastBlockLastNode.nextElementSibling : null;
      while (cur && cur !== nextL1El) {
        suffixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      blocks.sort((a, b) => {
        const av = Number.isFinite(a.sortVal) ? a.sortVal : missing;
        const bv = Number.isFinite(b.sortVal) ? b.sortVal : missing;
        if (av !== bv) return av - bv;
        return a.idx - b.idx;
      });

      const frag = document.createDocumentFragment();
      for (const n of prefixNodes) frag.appendChild(n);
      for (const block of blocks) for (const n of block.nodes) frag.appendChild(n);
      for (const n of suffixNodes) frag.appendChild(n);

      if (nextL1El) tbody.insertBefore(frag, nextL1El);
      else tbody.appendChild(frag);
    }
  }

  // ============================================================
  // FEATURE: Camera list builder
  // ============================================================

  function buildCameraListHtml(ctx, caches, $rows) {
    const items = [];
    const rows = $rows.get();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const prefix = getRowCellText(caches, row, ctx.keys.prefix);
      const numRaw = getRowCellText(caches, row, ctx.keys.number);
      if (!prefix || !numRaw) continue;

      const digits = numRaw.replace(/\D/g, '');
      const num = parseInt(digits, 10);
      if (!Number.isFinite(num)) continue;

      const prefixUpper = prefix.toUpperCase();
      items.push({ prefix: prefixUpper, num, text: `${prefixUpper}${digits}` });
    }

    if (!items.length) return '';

    items.sort((a, b) => (a.prefix === b.prefix ? a.num - b.num : a.prefix < b.prefix ? -1 : 1));
    return items.map((it) => escapeHtml(it.text)).join(', ');
  }

  // ============================================================
  // FEATURE: Field2409 injection (L3)
  // ============================================================

  function injectField2409IntoLevel3Header(ctx, { $groupRow, $rowsToSum, runId }) {
    if (!$groupRow.length || !$rowsToSum.length) return;
    if (!ctx.keys.field2409) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    const firstRow = $rowsToSum[0];
    const fieldCell = firstRow ? firstRow.querySelector(`td.${ctx.keys.field2409}`) : null;
    if (!fieldCell) return;

    const html = sanitizeAllowOnlyBrAndB(decodeEntities(fieldCell.innerHTML || ''));
    const fieldPlain = plainTextFromLimitedHtml(html);
    if (!fieldPlain) return;

    // field_2409 IS the L3 grouping field — always replace the label cell
    // with the HTML-preserved version (Knack strips <b>/<br> from headers).
    labelCell.innerHTML = `<span class="scw-l3-2409">${html}</span>`;
    $groupRow.data('scwL3_2409_RunId', runId);
  }

  // ============================================================
  // FEATURE: Concat injection (L3 drop)
  // ============================================================

  function injectConcatIntoHeader(ctx, caches, { level, contextKey, $groupRow, $rowsToSum, runId }) {
    const opt = ctx.features.concat;
    if (!opt?.enabled || level !== opt.onlyLevel || contextKey !== opt.onlyContextKey) return;
    if ($groupRow.data('scwConcatRunId') === runId) return;
    $groupRow.data('scwConcatRunId', runId);

    const cameraListHtml = buildCameraListHtml(ctx, caches, $rowsToSum);
    if (!cameraListHtml) return;

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    // Strip previously injected camera wrapper to avoid nesting on re-runs
    const prevConcat = labelCell.querySelector('.scw-concat-cameras');
    if (prevConcat) {
      const camB = prevConcat.querySelector('b');
      if (camB) { const prevBr = camB.previousElementSibling; if (prevBr && prevBr.tagName === 'BR') prevBr.remove(); camB.remove(); }
      while (prevConcat.firstChild) prevConcat.parentNode.insertBefore(prevConcat.firstChild, prevConcat);
      prevConcat.remove();
    }

    // If field2409 was already injected, use its content as the base HTML
    const injected = labelCell.querySelector('.scw-l3-2409');
    let baseHtml = '';

    if (injected) {
      baseHtml = injected.innerHTML || '';
    } else {
      baseHtml = sanitizeAllowOnlyBrAndB(decodeEntities(labelCell.innerHTML || ''));
    }

    const composed =
      `<div class="scw-concat-cameras">` +
      `${sanitizeAllowOnlyBrAndB(decodeEntities(baseHtml))}` +
      `<br /><b style="color:orange;"> (${cameraListHtml})</b>` +
      `</div>`;

    labelCell.innerHTML = composed;
  }

  // ============================================================
  // FEATURE: Concat injection (L3 mounting hardware)
  // ============================================================

  function injectConcatIntoLevel3HeaderForMounting(ctx, caches, { $groupRow, $rowsToSum, runId }) {
    const opt = ctx.features.concatL3Mounting;
    if (!ctx.features.concat?.enabled) return;
    if (!opt?.enabled) return;
    if (!$groupRow.length || !$rowsToSum.length) return;

    if ($groupRow.data('scwConcatL3MountRunId') === runId) return;
    $groupRow.data('scwConcatL3MountRunId', runId);

    const cameraListHtml = buildCameraListHtml(ctx, caches, $rowsToSum);
    if (!cameraListHtml) return;

    const $labelCell = $groupRow.children('td').first();
    if (!$labelCell.length) return;

    // Strip previously injected camera wrapper to avoid nesting on re-runs
    const labelEl = $labelCell[0];
    const prevConcat = labelEl.querySelector('.scw-concat-cameras');
    if (prevConcat) {
      const camB = prevConcat.querySelector('b');
      if (camB) { const prevBr = camB.previousElementSibling; if (prevBr && prevBr.tagName === 'BR') prevBr.remove(); camB.remove(); }
      while (prevConcat.firstChild) prevConcat.parentNode.insertBefore(prevConcat.firstChild, prevConcat);
      prevConcat.remove();
    }

    const currentHtml = $labelCell.html() || '';
    const sanitizedBase = sanitizeAllowOnlyBrAndB(decodeEntities(currentHtml));

    $labelCell.html(
      `<div class="scw-concat-cameras ${opt.cssClass}">` +
        `${sanitizedBase}<br />` +
        `<b style="color:orange;">(${cameraListHtml})</b>` +
        `</div>`
    );
  }

  // ============================================================
  // FEATURE: Build L1 footer as TRUE ROWS (qty + rate avg + labor)
  // ============================================================

  function buildLevel1FooterRows(ctx, {
    titleText,
    qtyText,
    totalText,
    contextKey,
    groupLabel,
  }) {
    const meta = computeColumnMeta(ctx);
    const cols = Math.max(meta.colCount || 0, 1);

    // Use actual column indices so values land under the correct headers.
    // Fallback: assume qty is 3rd-to-last, labor is 2nd-to-last (old behaviour).
    const safeQtyIdx = Number.isFinite(meta.qtyIdx) && meta.qtyIdx >= 1 ? meta.qtyIdx : Math.max(cols - 3, 1);
    const safeLaborIdx = Number.isFinite(meta.laborIdx) && meta.laborIdx >= 1 ? meta.laborIdx : Math.max(cols - 2, safeQtyIdx + 1);

    function makeTrBase(extraClasses) {
      return $(`
        <tr
          class="scw-level-total-row scw-subtotal scw-subtotal--level-1 kn-table-totals ${extraClasses || ''}"
          data-scw-subtotal-level="1"
          data-scw-context="${escapeHtml(contextKey || 'default')}"
          data-scw-group-label="${escapeHtml(groupLabel || '')}"
        ></tr>
      `);
    }

    function makeTitleRow(title, isFirst) {
      const $tr = makeTrBase(`scw-l1-title-row${isFirst ? ' scw-l1-first-row' : ''}`);

      $tr.append(`
        <td class="scw-l1-titlecell" colspan="${cols}">
          <div class="scw-l1-title">${escapeHtml(title)}</div>
        </td>
      `);

      return $tr;
    }

    function makeLineRow({ label, value, rowType, isFirst, isLast }) {
      const $tr = makeTrBase(
        `scw-l1-line-row scw-l1-line--${rowType}` +
          `${isFirst ? ' scw-l1-first-row' : ''}` +
          `${isLast ? ' scw-l1-last-row' : ''}`
      );

      // Label spans from col 0 up to (but not including) the labor column
      const labelSpan = Math.max(safeLaborIdx, 1);
      $tr.append(`
        <td class="scw-l1-labelcell" colspan="${labelSpan}">
          <div class="scw-l1-label">${escapeHtml(label)}</div>
        </td>
      `);

      // Labor/cost cell at the actual labor column position
      $tr.append(`
        <td class="${ctx.keys.labor} scw-l1-valuecell">
          <div class="scw-l1-value">${escapeHtml(value)}</div>
        </td>
      `);

      // Tail cells after labor (if labor isn't the last column)
      const tailSpan = cols - safeLaborIdx - 1;
      if (tailSpan > 0) {
        $tr.append(`<td class="scw-l1-valuecell" colspan="${tailSpan}"></td>`);
      }

      return $tr;
    }

    const title = norm(titleText || '');
    const rows = [];

    rows.push(makeLineRow({
      label: title ? `${titleText} — Subtotal` : 'Subtotal',
      value: totalText,
      rowType: 'final',
      isFirst: false,
      isLast: false,
    }));

    if (rows.length) {
      rows[0].addClass('scw-l1-first-row');
      rows[rows.length - 1].addClass('scw-l1-last-row');
    }

    return rows;
  }

  // ============================================================
  // FEATURE: Build Project Grand Total Rows (qty + labor)
  // ============================================================

  function buildProjectTotalRows(ctx, caches, $tbody) {
    if (!ctx.showProjectTotals) return [];

    const $allDataRows = $tbody.find('tr[id]');
    if (!$allDataRows.length) return [];

    const qtyKey = ctx.keys.qty;
    const laborKey = ctx.keys.labor;

    const grandQty = sumField(caches, $allDataRows, qtyKey);
    const grandTotal = sumField(caches, $allDataRows, laborKey);

    const meta = computeColumnMeta(ctx);
    const cols = Math.max(meta.colCount || 0, 1);
    const safeQtyIdx = Number.isFinite(meta.qtyIdx) && meta.qtyIdx >= 1 ? meta.qtyIdx : Math.max(cols - 3, 1);
    const safeLaborIdx = Number.isFinite(meta.laborIdx) && meta.laborIdx >= 1 ? meta.laborIdx : Math.max(cols - 2, safeQtyIdx + 1);

    function makeTr(extraClasses) {
      return $(`
        <tr
          class="scw-level-total-row scw-subtotal scw-subtotal--level-1 scw-project-totals kn-table-totals ${extraClasses || ''}"
          data-scw-subtotal-level="project"
        ></tr>
      `);
    }

    function makeTitleRow(title) {
      const $tr = makeTr('scw-l1-title-row scw-project-totals-first-row');
      $tr.append(`
        <td class="scw-l1-titlecell" colspan="${cols}">
          <div class="scw-l1-title">${escapeHtml(title)}</div>
        </td>
      `);
      return $tr;
    }

    function makeLineRow({ label, qtyValue, value, rowType, isLast, extraClass }) {
      const labelSpan = Math.max(safeQtyIdx, 1);
      const cls = `scw-l1-line-row scw-l1-line--${rowType}`
        + (isLast ? ' scw-project-totals-last-row' : '')
        + (extraClass ? ` ${extraClass}` : '');
      const $tr = makeTr(cls);

      $tr.append(`
        <td class="scw-l1-labelcell" colspan="${labelSpan}">
          <div class="scw-l1-label">${escapeHtml(label)}</div>
        </td>
      `);

      $tr.append(`
        <td class="${qtyKey} scw-l1-valuecell">
          <div class="scw-l1-value">${escapeHtml(qtyValue || '')}</div>
        </td>
      `);

      const gapSpan = safeLaborIdx - safeQtyIdx - 1;
      if (gapSpan > 0) {
        $tr.append(`<td colspan="${gapSpan}"></td>`);
      }

      $tr.append(`
        <td class="${laborKey} scw-l1-valuecell">
          <div class="scw-l1-value">${escapeHtml(value)}</div>
        </td>
      `);

      const tailSpan = cols - safeLaborIdx - 1;
      if (tailSpan > 0) {
        $tr.append(`<td colspan="${tailSpan}"></td>`);
      }

      return $tr;
    }

    const rows = [];

    rows.push(makeTitleRow('Bid Total'));

    rows.push(makeLineRow({
      label: 'Grand Total',
      qtyValue: '',
      value: formatMoney(grandTotal),
      rowType: 'final',
      isLast: true,
      extraClass: 'scw-project-totals--grand',
    }));

    return rows;
  }

  // ============================================================
  // FEATURE: Build subtotal row (qty + rate avg + labor; rate excluded from L1 footer)
  // ============================================================

  function buildSubtotalRow(ctx, caches, {
    $cellsTemplate,
    $rowsToSum,
    labelOverride,
    level,
    contextKey,
    groupLabel,
    totals,
    hideQtyCost,
  }) {
    const leftText = labelOverride || groupLabel || '';

    const qtyKey = ctx.keys.qty;
    const rateKey = ctx.keys.rate;
    const laborKey = ctx.keys.labor;

    const qty = totals?.[qtyKey] ?? sumField(caches, $rowsToSum, qtyKey);
    const rateAvg = avgField(caches, $rowsToSum, rateKey);

    // L1: return footer rows with qty, rate avg, and labor total
    if (level === 1) {
      const labor = sumField(caches, $rowsToSum, laborKey);

      const titleText = norm(leftText || '').replace(/\s+—\s*Subtotal\s*$/i, '');

      const rows = buildLevel1FooterRows(ctx, {
        titleText,
        qtyText: String(Math.round(qty)),
        totalText: formatMoney(labor),
        contextKey,
        groupLabel,
      });

      return $(rows.map(($r) => $r[0]));
    }

    // non-L1 subtotal rows (L2/L3)
    const safeHideQtyCost = Boolean(hideQtyCost);

    const $row = $(`
      <tr
        class="scw-level-total-row scw-subtotal scw-subtotal--level-${level} kn-table-totals${safeHideQtyCost ? ' scw-hide-qty-cost' : ''}"
        data-scw-subtotal-level="${level}"
        data-scw-context="${escapeHtml(contextKey || 'default')}"
        data-scw-group-label="${escapeHtml(groupLabel || '')}"
      >
        <td class="scw-level-total-label"><strong>${escapeHtml(leftText)}</strong></td>
      </tr>
    `);

    $row.append($cellsTemplate.clone());

    const labor = sumField(caches, $rowsToSum, laborKey);

    $row.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
    $row.find(`td.${rateKey}`).html(`<strong>${escapeHtml(formatMoney(rateAvg))}</strong>`);
    $row.find(`td.${laborKey}`).html(`<strong>${escapeHtml(formatMoney(labor))}</strong>`);

    return $row;
  }

  // ============================================================
  // FEATURE: Hide subtotal filter when requested by L2 rule
  // ============================================================

  function hideSubtotalFilter(ctx) {
    const viewEl = ctx.$root?.[0];
    if (!viewEl) return;

    const filterSelectors = ['.kn-filters .kn-filter', '.kn-table-filters .kn-filter', '.kn-records-nav .kn-filter'];
    const filters = viewEl.querySelectorAll(filterSelectors.join(', '));

    for (const filter of filters) {
      if (filter.dataset.scwHideSubtotalFilter === '1') continue;
      const text = normKey(filter.textContent || '');
      if (text.includes('subtotal')) {
        filter.style.display = 'none';
        filter.dataset.scwHideSubtotalFilter = '1';
      }
    }
  }

  // ============================================================
  // MAIN PROCESSOR
  // ============================================================

  function runTotalsPipeline(ctx) {
    const runId = Date.now();
    const $tbody = ctx.$tbody;
    if (!$tbody.length || $tbody.find('.kn-tr-nodata').length) return;

    normKeyCache.clear();
    const caches = makeRunCaches();

    $tbody
      .find('tr')
      .removeData([
        'scwConcatRunId',
        'scwConcatL3MountRunId',
        'scwL3_2409_RunId',
        'scwL2Rewrite_' + runId,
      ]);

    $tbody.find('tr.scw-level-total-row').remove();
    $tbody
      .find(`tr.kn-table-group.kn-group-level-3.${ctx.l2Specials.classOnLevel3}`)
      .removeClass(ctx.l2Specials.classOnLevel3);

    reorderLevel1Groups($tbody);
    reorderLevel2GroupsBySortField(ctx, $tbody, runId);

    const $firstDataRow = $tbody.find('tr[id]').first();
    if (!$firstDataRow.length) return;

    const $cellsTemplate = $firstDataRow.find('td:gt(0)').clone().empty();
    const $allGroupRows = $tbody.find('tr.kn-table-group');

    const sectionContext = {
      level2: { label: null, recordId: null },
      key: 'default',
      rule: null,
      hideLevel3Summary: false,
      hideQtyCostColumns: false,
    };

    const footerQueue = [];
    let shouldHideSubtotalFilterFlag = false;
    let hasAnyNonZeroL1Subtotal = false;

    const qtyKey = ctx.keys.qty;
    const rateKey = ctx.keys.rate;
    const laborKey = ctx.keys.labor;

    let blankL1Active = false;

    $allGroupRows.each(function () {
      const $groupRow = $(this);
      const match = this.className.match(/kn-group-level-(\d+)/);
      if (!match) return;

      const level = parseInt(match[1], 10);

      if (level === 2) {
        const info = getLevel2InfoFromGroupRow($groupRow);
        sectionContext.level2 = info;
        sectionContext.key = contextKeyFromLevel2Info(ctx, info);
        sectionContext.rule = getLevel2Rule(ctx, info);

        // On re-runs the label may have been rewritten (e.g. "Assumptions" →
        // "General Project Assumptions"), so getLevel2Rule misses.  Recover
        // from the rule key persisted on the first run.
        if (!sectionContext.rule) {
          const savedKey = $groupRow.data('scwL2RuleKey');
          if (savedKey) {
            sectionContext.rule = ctx.l2SectionRules.find((r) => r.key === savedKey) || null;
          }
        }
        if (sectionContext.rule) $groupRow.data('scwL2RuleKey', sectionContext.rule.key);

        sectionContext.hideLevel3Summary = Boolean(sectionContext.rule?.hideLevel3Summary);
        sectionContext.hideQtyCostColumns = Boolean(sectionContext.rule?.hideQtyCostColumns);
        shouldHideSubtotalFilterFlag =
          shouldHideSubtotalFilterFlag || Boolean(sectionContext.rule?.hideSubtotalFilter);

        if (blankL1Active) {
          $groupRow.addClass('scw-promoted-l2-as-l1');

          if (sectionContext.rule?.key === 'assumptions') {
            const $td = $groupRow.children('td').first();
            if ($td.length) {
              const $a = $td.find('a');
              if ($a.length) $a.text('General Project Assumptions');
              else $td.text('General Project Assumptions');
            }
            sectionContext.level2 = Object.assign({}, sectionContext.level2, { label: 'General Project Assumptions' });
          }
        } else {
          applyLevel2Styling($groupRow, sectionContext.rule);
        }
      }

      const $groupBlock = getGroupBlock($groupRow, level);
      if (!$groupBlock.length) return;

      const $rowsToSum = $groupBlock.filter('tr[id]');
      if (!$rowsToSum.length) return;

      const totals = sumFields(
        caches,
        $rowsToSum,
        [qtyKey, laborKey].filter(Boolean)
      );

      if (level === 1) {
        const l1Label = getGroupLabelText($groupRow);

        if (isBlankish(l1Label)) {
          $groupRow.hide();
          blankL1Active = true;
          return;
        }

        blankL1Active = false;

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        const l1Labor = totals[laborKey] || 0;
        if (Math.abs(l1Labor) >= 0.01) hasAnyNonZeroL1Subtotal = true;

        $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>').addClass('scw-l1-header-qty');
        $groupRow.find(`td.${rateKey}`).html('<strong>Rate</strong>').addClass('scw-l1-header-rate');
        $groupRow.find(`td.${laborKey}`).html('<strong>Cost</strong>').addClass('scw-l1-header-cost');
      }

      if (level === 2 && blankL1Active) {
        const isPromotedAssumptions = sectionContext.rule?.key === 'assumptions';

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        if (!isPromotedAssumptions) {
          const l2Labor = totals[laborKey] || 0;
          if (Math.abs(l2Labor) >= 0.01) {
            hasAnyNonZeroL1Subtotal = true;
            $groupRow.find(`td.${qtyKey}`).html('<strong>Qty</strong>').addClass('scw-l1-header-qty');
            $groupRow.find(`td.${rateKey}`).html('<strong>Rate</strong>').addClass('scw-l1-header-rate');
            $groupRow.find(`td.${laborKey}`).html('<strong>Cost</strong>').addClass('scw-l1-header-cost');
          }
        }
      }

      if (level === 3) {
        $groupRow.removeClass('scw-hide-level3-header').show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        // Inject field_2409 HTML into every L3 header (preserves <b> and <br>
        // that Knack would otherwise strip from the group label).
        injectField2409IntoLevel3Header(ctx, { $groupRow, $rowsToSum, runId });

        if (sectionContext.hideLevel3Summary) {
          if (sectionContext.hideQtyCostColumns) $groupRow.addClass('scw-hide-qty-cost');
          if (sectionContext.rule?.key === 'assumptions') {
            $groupRow.addClass('scw-hide-cost');
            $rowsToSum.addClass('scw-hide-cost');
          }
          return;
        }

        const nearestL2 = getNearestLevel2Info(caches, $groupRow);
        const isMounting =
          (ctx.l2Specials.mountingHardwareId && nearestL2.recordId === ctx.l2Specials.mountingHardwareId) ||
          (!ctx.l2Specials.mountingHardwareId &&
            norm(nearestL2.label) === norm(ctx.l2Specials.mountingHardwareLabel));

        if (isMounting) {
          $groupRow.addClass(ctx.l2Specials.classOnLevel3);
          injectConcatIntoLevel3HeaderForMounting(ctx, caches, { $groupRow, $rowsToSum, runId });
        }

        const qty = totals[qtyKey];
        const labor = totals[laborKey];
        const rateAvg = avgField(caches, $rowsToSum, rateKey);

        $groupRow.find(`td.${qtyKey}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${rateKey}`).html(`<strong>${escapeHtml(formatMoney(rateAvg))}</strong>`);
        $groupRow.find(`td.${laborKey}`).html(`<strong>${escapeHtml(formatMoney(labor))}</strong>`);

        if (sectionContext.hideQtyCostColumns) $groupRow.addClass('scw-hide-qty-cost');

        injectConcatIntoHeader(ctx, caches, {
          level,
          contextKey: sectionContext.key,
          $groupRow,
          $rowsToSum,
          runId,
        });
      }

      if (level === 1 || level === 2) {
        const levelInfo = level === 2 ? sectionContext.level2 : getLevel2InfoFromGroupRow($groupRow);

        // Skip all non-promoted L2 subtotal footers
        if (level === 2 && !blankL1Active) return;
        // Skip promoted Assumptions L2 footer (no subtotal wanted)
        if (level === 2 && blankL1Active && sectionContext.rule?.key === 'assumptions') return;

        const effectiveLevel = (level === 2 && blankL1Active) ? 1 : level;

        footerQueue.push({
          level: effectiveLevel,
          label: levelInfo.label,
          contextKey: sectionContext.key,
          hideQtyCostColumns: effectiveLevel === 2 ? sectionContext.hideQtyCostColumns : false,
          $groupBlock,
          $cellsTemplate,
          $rowsToSum,
          totals,
        });
      }
    });

    const footersByAnchor = new Map();
    for (const item of footerQueue) {
      const anchorEl = item.$groupBlock.last()[0];
      if (!anchorEl) continue;
      if (!footersByAnchor.has(anchorEl)) footersByAnchor.set(anchorEl, []);
      footersByAnchor.get(anchorEl).push(item);
    }

    const anchors = Array.from(footersByAnchor.keys())
      .sort((a, b) => {
        if (a === b) return 0;
        const pos = a.compareDocumentPosition(b);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
      })
      .reverse();

    for (const anchorEl of anchors) {
      const items = footersByAnchor.get(anchorEl);

      items.sort((a, b) =>
        a.level === 2 && b.level === 1 ? -1 : a.level === 1 && b.level === 2 ? 1 : b.level - a.level
      );

      const fragment = document.createDocumentFragment();

      for (const item of items) {
        const $row = buildSubtotalRow(ctx, caches, {
          $cellsTemplate: item.$cellsTemplate,
          $rowsToSum: item.$rowsToSum,
          labelOverride: item.level === 1 ? `${item.label} — Subtotal` : null,
          level: item.level,
          contextKey: item.contextKey,
          groupLabel: item.label,
          totals: item.totals,
          hideQtyCost: item.hideQtyCostColumns,
        });

        $row.each(function () {
          fragment.appendChild(this);
        });
      }

      anchorEl.parentNode.insertBefore(fragment, anchorEl.nextSibling);
    }

    applyLevel2LabelRewrites(ctx, $tbody, runId);

    if (shouldHideSubtotalFilterFlag) hideSubtotalFilter(ctx);

    if (!hasAnyNonZeroL1Subtotal) {
      $tbody.find('.scw-l1-header-qty, .scw-l1-header-rate, .scw-l1-header-cost').empty();
    }

    refreshProjectTotals(ctx, caches, $tbody);

    log(ctx, 'runTotalsPipeline complete', { runId });
  }

  // Standalone refresh for project totals
  const _lastPipelineState = {};

  function refreshProjectTotals(ctx, caches, $tbody) {
    if (!$tbody.length || !document.contains($tbody[0])) return;

    _lastPipelineState[ctx.viewId] = { ctx, caches, $tbody };

    $tbody.find('tr.scw-project-totals').remove();

    const grandTotalRows = buildProjectTotalRows(ctx, caches, $tbody);
    if (grandTotalRows.length) {
      const gtFragment = document.createDocumentFragment();
      for (const $r of grandTotalRows) {
        $r.each(function () { gtFragment.appendChild(this); });
      }
      $tbody[0].appendChild(gtFragment);
    }
  }

  // ============================================================
  // EVENT BINDING (multi-view)
  // ============================================================

  const _safetyState = {};

  function bindForView(viewId) {
    const ev = `knack-records-render.${viewId}${CONFIG.eventNs}`;

    $(document)
      .off(ev)
      .on(ev, function (event, view) {
        const prev = _safetyState[viewId];
        if (prev) {
          prev.timers.forEach(clearTimeout);
          if (prev.obs) prev.obs.disconnect();
        }
        _safetyState[viewId] = { timers: [], obs: null };

        let pipelineRunning = false;

        function executePipeline() {
          const ctx = buildCtx(viewId, view);
          if (!ctx) return;

          injectCssOnce();

          pipelineRunning = true;
          try {
            runTotalsPipeline(ctx);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`[SCW bid-items][${viewId}] error:`, error);
          } finally {
            pipelineRunning = false;
          }
        }

        function totalsAreMissing() {
          var root = document.getElementById(viewId);
          if (!root) return false;
          var $tbody = $(root).find('.kn-table tbody');
          return $tbody.length && !$tbody.find('tr.scw-level-total-row').length;
        }

        executePipeline();

        [300, 1200].forEach(function (ms) {
          var t = setTimeout(function () {
            if (totalsAreMissing()) executePipeline();
          }, ms);
          _safetyState[viewId].timers.push(t);
        });

        var viewRoot = document.getElementById(viewId);
        if (viewRoot) {
          var obsDebounce = 0;
          var obs = new MutationObserver(function () {
            if (pipelineRunning) return;
            if (obsDebounce) clearTimeout(obsDebounce);
            obsDebounce = setTimeout(function () {
              obsDebounce = 0;
              if (totalsAreMissing()) executePipeline();
            }, 80);
          });
          obs.observe(viewRoot, { childList: true, subtree: true });
          _safetyState[viewId].obs = obs;

          var disconnectTimer = setTimeout(function () { obs.disconnect(); }, 3000);
          _safetyState[viewId].timers.push(disconnectTimer);
        }
      });
  }

  Object.keys(CONFIG.views).forEach(bindForView);
})();
/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **********************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  // Per-scene overrides.  openIfFewerThan = record threshold below which
  // groups default to OPEN instead of collapsed.  Scenes not listed here
  // use DEFAULT_THRESHOLD.
  const SCENE_OVERRIDES = {
    scene_1085: { openIfFewerThan: 30 },
    scene_1116: { openIfFewerThan: 30 },
    scene_1140: { openIfFewerThan: 30 },
  };
  const DEFAULT_THRESHOLD = 30;
  const EVENT_NS = '.scwGroupCollapse';

  const COLLAPSED_BY_DEFAULT = true;
  const PERSIST_STATE = true;

  // ── Suppression flag ──
  // When true, automatic enhancement from MutationObserver and
  // knack-view-render is suppressed. The post-edit coordinator in
  // preserve-scroll-on-refresh.js sets this during the coordinated
  // restoration window to prevent premature enhancement on
  // intermediate DOM states and layout-shifting flicker.
  let _suppressAutoEnhance = false;

  // Record count badge: off by default, list view IDs to enable
  const RECORD_COUNT_VIEWS = ['view_3359'];

  // Per-view background color overrides (keys = view IDs)
  const VIEW_OVERRIDES = {
    view_3374: { L1bg: '#124E85' },
    view_3325: { L1bg: '#124E85' },
    view_3331: { L1bg: '#124E85' },
    view_3475: { L1bg: '#5F6B7A' },

  };

  // ======================
  // STATE (localStorage)
  // ======================
  function storageKey(sceneId, viewId) {
    return `scw:collapse:${sceneId}:${viewId}`;
  }
  function loadState(sceneId, viewId) {
    if (!PERSIST_STATE) return {};
    try {
      return JSON.parse(localStorage.getItem(storageKey(sceneId, viewId)) || '{}');
    } catch {
      return {};
    }
  }
  function saveState(sceneId, viewId, state) {
    if (!PERSIST_STATE) return;
    try {
      localStorage.setItem(storageKey(sceneId, viewId), JSON.stringify(state));
    } catch {}
  }

  // ======================
  // COLOR HELPERS
  // ======================
  /** Convert a hex colour string to [r, g, b]. */
  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    // Handle rgba(r,g,b,a) format
    var rgbaMatch = hex.match && hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbaMatch) return [+rgbaMatch[1], +rgbaMatch[2], +rgbaMatch[3]];
    var n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Default L1 accent colour (orange)
  var DEFAULT_L1_ACCENT = '#ed8326';

  // SVG chevron icon matching the KTL accordion language
  var CHEVRON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 12 15 18 9"/></svg>';

  // ======================
  // CSS (ONCE, SCENE-SCOPED)
  // ======================
  function injectCssOnce() {
    const id = 'scw-group-collapse-css';
    if (document.getElementById(id)) return;

    // Helper: simple descendant selector (no longer scene-scoped — works everywhere)
    const s = (sel) => sel;

    const css = `
      /* Vertical-align all table cells in group-collapse scenes */
      ${s('.scw-group-collapse-enabled table td')} {
        vertical-align: middle !important;
      }

      /* Override Knack's per-level indent on data-row cells (hierarchy is
         already communicated by the styled group headers). */
      ${s('.scw-group-collapse-enabled table tbody tr:not(.kn-table-group) td[style*="padding-left"]')} {
        padding-left: 8px !important;
      }

      ${s('.scw-group-collapse-enabled tr.scw-group-header')} {
        cursor: pointer;
        user-select: none;
      }

      /* ── Collapse icon (SVG chevron) ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-collapse-icon')} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        margin-right: 8px;
        line-height: 1;
        vertical-align: middle;
        border-radius: 4px;
        transition: transform 220ms ease, background 150ms ease;
        transform: rotate(0deg);
        flex-shrink: 0;
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-collapse-icon svg')} {
        display: block;
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header.scw-collapsed .scw-collapse-icon')} {
        transform: rotate(-90deg);
      }

      /* ── L1 chevron colours ── */
      ${s('.scw-group-collapse-enabled tr.kn-group-level-1.scw-group-header .scw-collapse-icon')} {
        color: var(--scw-grp-accent, ${DEFAULT_L1_ACCENT});
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-1.scw-group-header:hover .scw-collapse-icon')} {
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.10);
      }

      /* ── L2 chevron colours ── */
      ${s('.scw-group-collapse-enabled tr.kn-group-level-2.scw-group-header .scw-collapse-icon')} {
        color: #07467c;
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-2.scw-group-header:hover .scw-collapse-icon')} {
        background: rgba(7,70,124,0.08);
      }

      ${s('.scw-group-collapse-enabled tr.scw-group-header > td')} {
        position: relative;
      }

      /* ══════════════════════════════════════════════════
         L1 — Modern tinted accent style
         Uses CSS custom properties set per-row in JS:
           --scw-grp-accent      (hex colour)
           --scw-grp-accent-rgb  (r, g, b)
         ══════════════════════════════════════════════════ */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header')} {
        font-size: 13px;
        font-weight: 600 !important;
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.08) !important;
        color: #1e293b !important;
        text-align: left !important;
        transition: background 180ms ease;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td')},
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td *')} {
        color: #1e293b !important;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header > td')} {
        padding: 10px 14px !important;
        border-bottom: 1px solid rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.15);
        border-left: 4px solid var(--scw-grp-accent, ${DEFAULT_L1_ACCENT});
      }

      /* L1 hover */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:hover')} {
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.13) !important;
        filter: none;
      }

      /* L1 collapsed */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed')} {
        font-size: 13px;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed > td')} {
        border-bottom: 1px solid rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.10);
      }

      /* L1 expanded — stronger tint, larger text, no bottom border
         (content flows directly beneath) */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed)')} {
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.15) !important;
        font-size: 14px;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) > td')} {
        padding: 12px 14px !important;
        border-bottom: none;
        box-shadow: none;
      }

      /* ── Bridge: content rows beneath an expanded L1 ──
         Continue the left accent border on the first content row
         so the header and content feel like one unit.
         Also replace the worksheet card's grey border-top with accent. */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) + tr:not(.kn-table-group) > td')} {
        border-left: 4px solid rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.30);
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) + tr:not(.kn-table-group) .scw-ws-card')} {
        border-top-color: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.25);
      }

      /* Vertical separation between stacked L1 rows */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header + .kn-table-group.kn-group-level-1.scw-group-header > td')} {
        border-top: 3px solid #fff;
      }

      /* ══════════════════════════════════════════════════
         L2 — Refined nested subgroup
         ══════════════════════════════════════════════════ */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header')} {
        font-size: 13px;
        font-weight: 500 !important;
        background-color: #f8fafc !important;
        color: #0f4c75 !important;
        transition: background 180ms ease;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td')} {
        padding: 8px 14px 8px 32px !important;
        border-bottom: 1px solid rgba(7,70,124,.10);
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td:after')} {
        content: "";
        position: absolute;
        left: 16px;
        top: 7px;
        bottom: 7px;
        width: 3px;
        border-radius: 2px;
        background: rgba(7,70,124,.22);
        pointer-events: none;
        transition: background 180ms ease;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td')},
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header > td *')} {
        color: #0f4c75 !important;
      }

      /* L2 hover */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:hover')} {
        background-color: #f1f5f9 !important;
        filter: none;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:hover > td:after')} {
        background: rgba(7,70,124,.35);
      }

      /* L2 collapsed */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed > td')} {
        border-bottom: 1px solid rgba(7,70,124,.06);
      }

      /* L2 expanded */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:not(.scw-collapsed)')} {
        background-color: #f1f5f9 !important;
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:not(.scw-collapsed) > td')} {
        padding: 9px 14px 9px 32px !important;
        box-shadow: inset 0 -1px 2px rgba(7,70,124,.04);
        border-bottom: 1px solid rgba(7,70,124,.10);
      }
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header:not(.scw-collapsed) > td:after')} {
        background: rgba(7,70,124,.35);
      }

      /* Vertical separation between stacked L2 rows */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-2.scw-group-header + .kn-table-group.kn-group-level-2.scw-group-header > td')} {
        border-top: 2px solid #fff;
      }

      /* ── Record count badge ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-record-count')} {
        display: inline-block;
        margin-left: .6em;
        padding: 1px 8px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
        border-radius: 10px;
        vertical-align: middle;
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-1.scw-group-header .scw-record-count')} {
        background: rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.14);
        color: var(--scw-grp-accent, ${DEFAULT_L1_ACCENT});
        border: 1px solid rgba(var(--scw-grp-accent-rgb, 237,131,38), 0.22);
      }
      ${s('.scw-group-collapse-enabled tr.kn-group-level-2.scw-group-header .scw-record-count')} {
        background: rgba(7,70,124,.08);
        color: #0f4c75;
        border: 1px solid rgba(7,70,124,.15);
      }

      /* ── Per-view accent overrides via CSS custom properties ──
         (Set inline on each L1 tr in JS; static overrides kept for
          view-scoped CSS specificity as a fallback.) */
      ${Object.entries(VIEW_OVERRIDES).map(([viewId, o]) => {
        var parts = [];
        if (o.L1bg) {
          var rgb = hexToRgb(o.L1bg);
          parts.push(
            '#' + viewId + ' .kn-table-group.kn-group-level-1.scw-group-header {' +
            ' --scw-grp-accent: ' + o.L1bg + ';' +
            ' --scw-grp-accent-rgb: ' + rgb.join(',') + '; }'
          );
        }
        if (o.L2bg) {
          parts.push('#' + viewId + ' .kn-table-group.kn-group-level-2.scw-group-header { background-color: ' + o.L2bg + ' !important; }');
        }
        if (o.L2color) {
          parts.push(
            '#' + viewId + ' .kn-table-group.kn-group-level-2.scw-group-header > td,' +
            '#' + viewId + ' .kn-table-group.kn-group-level-2.scw-group-header > td * { color: ' + o.L2color + ' !important; }'
          );
        }
        return parts.length ? '/* Per-view overrides: ' + viewId + ' */\n' + parts.join('\n') : '';
      }).join('\n')}
    `;

    const style = document.createElement('style');
    style.id = id;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ======================
  // GROUP ROW HELPERS
  // ======================
  const GROUP_ROW_SEL =
    'tr.kn-table-group.kn-group-level-1, tr.kn-table-group.kn-group-level-2';

  function getGroupLevel($tr) {
    return $tr.hasClass('kn-group-level-2') ? 2 : 1;
  }

  function ensureIcon($tr) {
    const $cell = $tr.children('td,th').first();
    if (!$cell.find('.scw-collapse-icon').length) {
      $cell.prepend('<span class="scw-collapse-icon" aria-hidden="true">' + CHEVRON_SVG + '</span>');
    }
  }

  function ensureRecordCount($tr, viewId) {
    if (!RECORD_COUNT_VIEWS.length) return;
    if (!RECORD_COUNT_VIEWS.includes(viewId)) return;
    const $cell = $tr.children('td,th').first();

    const $block = rowsUntilNextRelevantGroup($tr);
    const count = $block.not('.kn-table-group, .kn-table-totals').length;

    // Skip DOM update if badge already shows the correct count (avoids MutationObserver loop)
    const $existing = $cell.find('.scw-record-count');
    if ($existing.length && $existing.text() === String(count)) return;

    $existing.remove();
    if (count > 0) {
      $cell.append('<span class="scw-record-count">' + count + '</span>');
    }
  }

  function getRowLabelText($tr) {
    return $tr
      .clone()
      .find('.scw-collapse-icon, .scw-record-count')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getParentLevel1Label($tr) {
    const $l1 = $tr.prevAll('tr.kn-table-group.kn-group-level-1').first();
    return $l1.length ? getRowLabelText($l1) : '';
  }

  function buildKey($tr, level) {
    const label = getRowLabelText($tr);
    if (level === 2) {
      const parent = getParentLevel1Label($tr);
      return `L2:${parent}::${label}`;
    }
    return `L1:${label}`;
  }

  function rowsUntilNextRelevantGroup($headerRow) {
    const isLevel2 = $headerRow.hasClass('kn-group-level-2');
    let $rows = $();

    $headerRow.nextAll('tr').each(function () {
      const $tr = $(this);

      if (isLevel2) {
        if ($tr.hasClass('kn-table-group')) return false;
        $rows = $rows.add($tr);
        return;
      }

      if ($tr.hasClass('kn-group-level-1')) return false;
      $rows = $rows.add($tr);
    });

    return $rows;
  }

  function restoreLevel2StatesUnderLevel1($level1Header) {
    rowsUntilNextRelevantGroup($level1Header)
      .filter('tr.kn-table-group.kn-group-level-2.scw-group-header')
      .each(function () {
        const $l2 = $(this);
        const collapsed = $l2.hasClass('scw-collapsed');
        rowsUntilNextRelevantGroup($l2).toggle(!collapsed);
      });
  }

  // NEW: when collapsing L1, force-collapse all child L2 headers and persist
  function collapseAllLevel2UnderLevel1($level1Header, sceneId, viewId, state) {
    rowsUntilNextRelevantGroup($level1Header)
      .filter('tr.kn-table-group.kn-group-level-2.scw-group-header')
      .each(function () {
        const $l2 = $(this);

        // force state + class (chevron rotation handled by CSS)
        $l2.addClass('scw-collapsed');

        // hide its detail rows (even though L1 is hiding everything, this keeps it consistent)
        rowsUntilNextRelevantGroup($l2).hide();

        // persist
        const key = buildKey($l2, 2);
        state[key] = 1;
      });
  }

  function setCollapsed($header, collapsed) {
    const isLevel2 = $header.hasClass('kn-group-level-2');

    $header.toggleClass('scw-collapsed', collapsed);
    // Chevron rotation is handled entirely by CSS (rotate -90deg when .scw-collapsed)

    if (isLevel2) {
      rowsUntilNextRelevantGroup($header).toggle(!collapsed);
      return;
    }

    rowsUntilNextRelevantGroup($header).toggle(!collapsed);

    if (!collapsed) restoreLevel2StatesUnderLevel1($header);
  }

  // ======================
  // SCENE DETECTION
  // ======================
  function getCurrentSceneId() {
    const bodyId = $('body').attr('id');
    if (bodyId && bodyId.includes('scene_')) {
      const m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    const $fallback = $('[id*="scene_"]').filter(':visible').first();
    if ($fallback.length) {
      const m = ($fallback.attr('id') || '').match(/scene_\d+/);
      if (m) return m[0];
    }
    return null;
  }

  function isEnabledScene(sceneId) {
    return !!sceneId;
  }

  // ======================
  // ENHANCE GRIDS
  // ======================

  // Track views whose stale localStorage has been cleared this session.
  // Cleared once per page load so below-threshold views always start open,
  // but manual collapses during the session are still persisted and respected.
  const thresholdCleared = new Set();

  function enhanceAllGroupedGrids(sceneId) {
    if (!isEnabledScene(sceneId)) return;

    const $sceneRoot = $(`#kn-${sceneId}`);
    if (!$sceneRoot.length) return;

    const cfg = SCENE_OVERRIDES[sceneId] || {};
    const threshold = cfg.openIfFewerThan || DEFAULT_THRESHOLD;
    const viewRecordCounts = {};

    $sceneRoot.find(GROUP_ROW_SEL).each(function () {
      const $tr = $(this);
      const $view = $tr.closest('.kn-view[id^="view_"]');
      const viewId = $view.attr('id') || 'unknown_view';

      $view.addClass('scw-group-collapse-enabled');

      // Cache record count per view (count once, exclude group headers and totals)
      if (!(viewId in viewRecordCounts)) {
        var allTr = $view.find('table tbody tr').length;
        var groupTr = $view.find('table tbody tr.kn-table-group').length;
        var totalsTr = $view.find('table tbody tr.kn-table-totals').length;
        viewRecordCounts[viewId] = allTr - groupTr - totalsTr;
      }

      const belowThreshold = threshold > 0 && viewRecordCounts[viewId] < threshold;

      // On first encounter this session, clear stale localStorage for
      // below-threshold views so the "default open" behaviour takes effect.
      if (belowThreshold && !thresholdCleared.has(viewId)) {
        thresholdCleared.add(viewId);
        try { localStorage.removeItem(storageKey(sceneId, viewId)); } catch (e) {}
      }

      const state = loadState(sceneId, viewId);

      $tr.addClass('scw-group-header');
      ensureIcon($tr);

      const level = getGroupLevel($tr);

      // Set CSS custom properties for L1 accent colour
      if (level === 1) {
        var overrides = VIEW_OVERRIDES[viewId];
        var accent = (overrides && overrides.L1bg) || DEFAULT_L1_ACCENT;
        var rgb = hexToRgb(accent);
        this.style.setProperty('--scw-grp-accent', accent);
        this.style.setProperty('--scw-grp-accent-rgb', rgb.join(','));
      }

      ensureRecordCount($tr, viewId);

      const key = buildKey($tr, level);
      const shouldCollapse = key in state ? !!state[key] : (belowThreshold ? false : COLLAPSED_BY_DEFAULT);

      setCollapsed($tr, shouldCollapse);
    });
  }

  // ======================
  // CLICK HANDLER
  // ======================
  function bindClicksOnce() {
    $(document)
      .off('click' + EVENT_NS, GROUP_ROW_SEL)
      .on('click' + EVENT_NS, GROUP_ROW_SEL, function (e) {
        if ($(e.target).closest('a,button,input,select,textarea,label').length) return;

        const sceneId = getCurrentSceneId();
        if (!isEnabledScene(sceneId)) return;

        const $tr = $(this);
        if (!$tr.closest(`#kn-${sceneId}`).length) return;

        const $view = $tr.closest('.kn-view[id^="view_"]');
        const viewId = $view.attr('id') || 'unknown_view';

        $view.addClass('scw-group-collapse-enabled');

        $tr.addClass('scw-group-header');
        ensureIcon($tr);

        const level = getGroupLevel($tr);
        const key = buildKey($tr, level);

        const state = loadState(sceneId, viewId);
        const collapseNow = !$tr.hasClass('scw-collapsed');

        // apply collapse/expand
        setCollapsed($tr, collapseNow);

        // NEW: if this was an L1 collapse, also collapse all nested L2 groups + persist
        if (level === 1 && collapseNow) {
          collapseAllLevel2UnderLevel1($tr, sceneId, viewId, state);
        }

        state[key] = collapseNow ? 1 : 0;
        saveState(sceneId, viewId, state);
      });
  }

  // ======================
  // MUTATION OBSERVER
  // ======================
  const observerByScene = {};

  function startObserverForScene(sceneId) {
    if (!isEnabledScene(sceneId) || observerByScene[sceneId]) return;

    let debounceTimer = 0;
    const obs = new MutationObserver(() => {
      // Skip during coordinated post-edit restoration (coordinator
      // calls enhance() explicitly at the right time).
      if (_suppressAutoEnhance) return;

      const current = getCurrentSceneId();
      if (!isEnabledScene(current)) return;
      if (current !== sceneId) return;

      // Use 100ms debounce (not RAF ~16ms) so Knack's multi-step
      // async DOM updates settle before we try to enhance.  RAF was
      // too eager and could fire between batched row insertions.
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = 0;
        enhanceAllGroupedGrids(sceneId);
      }, 100);
    });

    obs.observe(document.body, { childList: true, subtree: true });
    observerByScene[sceneId] = obs;
  }

  // ======================
  // INIT
  // ======================
  injectCssOnce();
  bindClicksOnce();

  // Bind to ALL scene renders so every scene gets accordions
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      var sceneId = getCurrentSceneId();
      if (isEnabledScene(sceneId)) {
        enhanceAllGroupedGrids(sceneId);
        startObserverForScene(sceneId);
      }
    });

  // Re-enhance after ANY view re-render (e.g. after inline-edit refresh).
  // The MutationObserver alone is unreliable because Knack's async
  // re-render can cause it to fire at intermediate DOM states.
  // Delay 200ms so device-worksheet's transformView (150ms) runs first.
  var viewRenderTimer = 0;
  $(document)
    .off('knack-view-render' + EVENT_NS)
    .on('knack-view-render' + EVENT_NS, function () {
      // Skip during coordinated post-edit restoration
      if (_suppressAutoEnhance) return;
      var sceneId = getCurrentSceneId();
      if (!isEnabledScene(sceneId)) return;
      if (viewRenderTimer) clearTimeout(viewRenderTimer);
      viewRenderTimer = setTimeout(function () {
        viewRenderTimer = 0;
        enhanceAllGroupedGrids(sceneId);
      }, 200);
    });

  const initialScene = getCurrentSceneId();
  if (isEnabledScene(initialScene)) {
    enhanceAllGroupedGrids(initialScene);
    startObserverForScene(initialScene);
  }

  // ── Expose API for coordination with post-edit restore ──
  window.SCW = window.SCW || {};
  window.SCW.groupCollapse = {
    /** Run enhancement pass for current scene (idempotent — safe to call
     *  multiple times; existing chevrons/state are preserved). */
    enhance: function () {
      var sceneId = getCurrentSceneId();
      if (isEnabledScene(sceneId)) {
        enhanceAllGroupedGrids(sceneId);
      }
    },
    /** Suppress/resume automatic enhancement from MutationObserver and
     *  knack-view-render timer.  Used by the post-edit coordinator to
     *  prevent premature enhancement on intermediate DOM states. */
    suppress: function (val) { _suppressAutoEnhance = !!val; }
  };
})();
/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3329']; // add more views
  const BUCKET_FIELD_KEY = 'field_2223';
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID = 'scw-bucket-visibility-css';

  // Readable mapping
  const BUCKET_RULES_HUMAN = {
    //cameras or readers
    '6481e5ba38f283002898113c': [
      ['field_2182', 'REL_scope of work'],
      ['field_2211', 'REL_mdf-idf_mandatory single select'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2193', 'REL_products_cameras+cabling'],
      ['field_2206', 'REL_product accessories'],
      ['field_2241', 'INPUT_DROP: Pre-fix'],
      ['field_2184', 'INPUT_DROP: label number'],
      ['field_2186', 'INPUT_DROP: mount_cable_both'],
      ['field_2246', 'REL_unified product field'],
      ['field_2187', 'INPUT_DROP: variables'],
    ],
    //networking or headend
    '647953bb54b4e1002931ed97': [
      ['field_2182', 'REL_scope of work'],
      ['field_2180', 'REL_mdf-idf_mandatory multi select'],
      ['field_2194', 'REL_products_for networking'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2246', 'REL_unified product field'],
      ['field_2206', 'REL_product accessories'],
    ],
    //other equipment
    '5df12ce036f91b0015404d78': [
      ['field_2182', 'REL_scope of work'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2195', 'REL_products_for other equipment'],
      ['field_2246', 'REL_unified product field'],
      ['field_2183', 'INPUT_product quantity'],
    ],
    //service
    '6977caa7f246edf67b52cbcd': [
      ['field_2182', 'REL_scope of work'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2233', 'INPUT_exepcted sub bid #'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2210', 'INPUT_service description'],
    ],
    //assumptions
    '697b7a023a31502ec68b3303': [
      ['field_2182', 'REL_scope of work'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2248', 'REL_products for assumptions'],
    ],
    //licenses
    '645554dce6f3a60028362a6a': [
      ['field_2182', 'REL_scope of work'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2224', 'REL_products for licenses'],
    ],
  };

  const ALL_FIELD_KEYS = [
    'field_2182','field_2180','field_2188','field_2193','field_2194','field_2183','field_2210','field_2224','field_2248','field_2250',
    'field_2206','field_2195','field_2241','field_2184','field_2186','field_2187','field_2204', 'field_2211','field_2233','field_2246',
  ];

  function compileRules(human) {
    const out = {};
    Object.keys(human || {}).forEach((bucket) => {
      out[bucket] = (human[bucket] || [])
        .map((x) => (Array.isArray(x) ? x[0] : x))
        .filter(Boolean);
    });
    return out;
  }
  const BUCKET_RULES = compileRules(BUCKET_RULES_HUMAN);

  // ============================================================
  // ✅ EARLY CSS: inject immediately so there’s no initial “flash”
  // ============================================================
  function injectGlobalCssOnce() {
    let el = document.getElementById(CSS_ID);
    if (el) return;

    el = document.createElement('style');
    el.id = CSS_ID;

    // Hide all fields inside the target views immediately.
    // Then only show ones marked scw-visible, plus the bucket input failsafe.
    const blocks = VIEW_IDS.map((viewId) => `
#${viewId} .kn-input { display: none !important; }
#${viewId} .kn-input.scw-visible { display: block !important; }
#${viewId} #kn-input-${BUCKET_FIELD_KEY} { display: block !important; } /* bucket always visible */
    `.trim()).join('\n\n');

    el.appendChild(document.createTextNode('\n' + blocks + '\n'));
    document.head.appendChild(el);
  }

  // Run ASAP (before Knack paints the view)
  injectGlobalCssOnce();

  // ======================
  // DOM helpers
  // ======================
  function $wrapForKeyWithinScope($scope, key) {
    let $w = $scope.find('#kn-input-' + key);
    if ($w.length) return $w;

    $w = $scope.find('.kn-input[data-input-id="' + key + '"]');
    if ($w.length) return $w;

    return $();
  }

  function hideField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.removeClass('scw-visible');
  }

  function showField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.addClass('scw-visible');
  }

  function hideAllExceptBucket($scope) {
    ALL_FIELD_KEYS.forEach((k) => {
      if (k === BUCKET_FIELD_KEY) return;
      hideField($scope, k);
    });
    showField($scope, BUCKET_FIELD_KEY);
  }

  function findBucketSelectInScope($scope, viewId) {
    let $sel = $scope.find('#' + viewId + '-' + BUCKET_FIELD_KEY);
    if ($sel.length) return $sel;
    return $scope.find('select[name="' + BUCKET_FIELD_KEY + '"]');
  }

  function getBucketValue($scope, viewId) {
    const $sel = findBucketSelectInScope($scope, viewId);
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, viewId) {
    const bucketValue = getBucketValue($scope, viewId);

    hideAllExceptBucket($scope);
    if (!bucketValue) return;

    (BUCKET_RULES[bucketValue] || []).forEach((k) => showField($scope, k));
  }

  // ======================
  // Binding strategy
  // ======================
  function bindDelegatedChange(viewId) {
    const sel = `#${viewId} select[name="${BUCKET_FIELD_KEY}"], #${viewId} #${viewId}-${BUCKET_FIELD_KEY}`;

    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $bucketWrap = $(this).closest('.kn-input');
        const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
          ? $bucketWrap.closest('form, .kn-form, .kn-view')
          : $('#' + viewId);

        applyRules($scope, viewId);
      });
  }

  function initView(viewId) {
    bindDelegatedChange(viewId);

    const $view = $('#' + viewId);
    const $bucketWrap = $view.find('#kn-input-' + BUCKET_FIELD_KEY);
    const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
      ? $bucketWrap.closest('form, .kn-form, .kn-view')
      : $view;

    applyRules($scope, viewId);
  }

  VIEW_IDS.forEach((viewId) => {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        initView(viewId);
      });
  });
})();

////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////


////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3451)***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3451']; // add more views
  const BUCKET_FIELD_KEY = 'field_2223';
  const EVENT_NS = '.scwBucketRules3451';
  const CSS_ID = 'scw-bucket-visibility-css-3451';

  // Readable mapping
  const BUCKET_RULES_HUMAN = {
    //cameras or readers
    '6481e5ba38f283002898113c': [
      ['field_2182', 'REL_scope of work'],
      ['field_2211', 'REL_mdf-idf_mandatory single select'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2193', 'REL_products_cameras+cabling'],
      ['field_2206', 'REL_product accessories'],
      ['field_2241', 'INPUT_DROP: Pre-fix'],
      ['field_2184', 'INPUT_DROP: label number'],
      ['field_2186', 'INPUT_DROP: mount_cable_both'],
      ['field_2246', 'REL_unified product field'],
      ['field_2187', 'INPUT_DROP: variables'],
    ],
    //networking or headend
    '647953bb54b4e1002931ed97': [
      ['field_2182', 'REL_scope of work'],
      ['field_2180', 'REL_mdf-idf_mandatory multi select'],
      ['field_2194', 'REL_products_for networking'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2246', 'REL_unified product field'],
      ['field_2206', 'REL_product accessories'],
    ],
    //other equipment
    '5df12ce036f91b0015404d78': [
      ['field_2182', 'REL_scope of work'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2195', 'REL_products_for other equipment'],
      ['field_2246', 'REL_unified product field'],
      ['field_2183', 'INPUT_product quantity'],
    ],
    //service
    '6977caa7f246edf67b52cbcd': [
      ['field_2182', 'REL_scope of work'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2233', 'INPUT_exepcted sub bid #'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2210', 'INPUT_service description'],
    ],
    //assumptions
    '697b7a023a31502ec68b3303': [
      ['field_2182', 'REL_scope of work'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2248', 'REL_products for assumptions'],
    ],
    //licenses
    '645554dce6f3a60028362a6a': [
      ['field_2182', 'REL_scope of work'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2224', 'REL_products for licenses'],
    ],
  };

  const ALL_FIELD_KEYS = [
    'field_2182','field_2180','field_2188','field_2193','field_2194','field_2183','field_2210','field_2224','field_2248','field_2250',
    'field_2206','field_2195','field_2241','field_2184','field_2186','field_2187','field_2204', 'field_2211','field_2233','field_2246',
  ];

  function compileRules(human) {
    const out = {};
    Object.keys(human || {}).forEach((bucket) => {
      out[bucket] = (human[bucket] || [])
        .map((x) => (Array.isArray(x) ? x[0] : x))
        .filter(Boolean);
    });
    return out;
  }
  const BUCKET_RULES = compileRules(BUCKET_RULES_HUMAN);

  // ============================================================
  // EARLY CSS: inject immediately so there's no initial "flash"
  // ============================================================
  function injectGlobalCssOnce() {
    let el = document.getElementById(CSS_ID);
    if (el) return;

    el = document.createElement('style');
    el.id = CSS_ID;

    // Hide all fields inside the target views immediately.
    // Then only show ones marked scw-visible, plus the bucket input failsafe.
    const blocks = VIEW_IDS.map((viewId) => `
#${viewId} .kn-input { display: none !important; }
#${viewId} .kn-input.scw-visible { display: block !important; }
#${viewId} #kn-input-${BUCKET_FIELD_KEY} { display: block !important; } /* bucket always visible */
    `.trim()).join('\n\n');

    el.appendChild(document.createTextNode('\n' + blocks + '\n'));
    document.head.appendChild(el);
  }

  // Run ASAP (before Knack paints the view)
  injectGlobalCssOnce();

  // ======================
  // DOM helpers
  // ======================
  function $wrapForKeyWithinScope($scope, key) {
    let $w = $scope.find('#kn-input-' + key);
    if ($w.length) return $w;

    $w = $scope.find('.kn-input[data-input-id="' + key + '"]');
    if ($w.length) return $w;

    return $();
  }

  function hideField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.removeClass('scw-visible');
  }

  function showField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.addClass('scw-visible');
  }

  function hideAllExceptBucket($scope) {
    ALL_FIELD_KEYS.forEach((k) => {
      if (k === BUCKET_FIELD_KEY) return;
      hideField($scope, k);
    });
    showField($scope, BUCKET_FIELD_KEY);
  }

  function findBucketSelectInScope($scope, viewId) {
    let $sel = $scope.find('#' + viewId + '-' + BUCKET_FIELD_KEY);
    if ($sel.length) return $sel;
    return $scope.find('select[name="' + BUCKET_FIELD_KEY + '"]');
  }

  function getBucketValue($scope, viewId) {
    const $sel = findBucketSelectInScope($scope, viewId);
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, viewId) {
    const bucketValue = getBucketValue($scope, viewId);

    hideAllExceptBucket($scope);
    if (!bucketValue) return;

    (BUCKET_RULES[bucketValue] || []).forEach((k) => showField($scope, k));
  }

  // ======================
  // Binding strategy
  // ======================
  function bindDelegatedChange(viewId) {
    const sel = `#${viewId} select[name="${BUCKET_FIELD_KEY}"], #${viewId} #${viewId}-${BUCKET_FIELD_KEY}`;

    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $bucketWrap = $(this).closest('.kn-input');
        const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
          ? $bucketWrap.closest('form, .kn-form, .kn-view')
          : $('#' + viewId);

        applyRules($scope, viewId);
      });
  }

  function initView(viewId) {
    bindDelegatedChange(viewId);

    const $view = $('#' + viewId);
    const $bucketWrap = $view.find('#kn-input-' + BUCKET_FIELD_KEY);
    const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
      ? $bucketWrap.closest('form, .kn-form, .kn-view')
      : $view;

    applyRules($scope, viewId);
  }

  VIEW_IDS.forEach((viewId) => {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        initView(viewId);
      });
  });
})();

////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3451)***************//////


////************* HIGHLIGHT DUPLICATE CELLS view_3313 - BUILD SOW PAGE  ***************//////


$(document).on('knack-view-render.view_3313', function () {

  const FIELD_KEY = 'field_1950';
  const DUP_BG = '#ffe2e2'; // light red highlight

  const valueMap = {};

  // Gather values from the column
  $('#view_3313 td.' + FIELD_KEY).each(function () {
    const value = $(this).text().trim();

    if (!value) return;

    if (!valueMap[value]) {
      valueMap[value] = [];
    }

    valueMap[value].push(this);
  });

  // Highlight duplicates
  Object.keys(valueMap).forEach(value => {
    if (valueMap[value].length > 1) {
      valueMap[value].forEach(cell => {
        $(cell).css({
          'background-color': DUP_BG,
          'font-weight': '600'
        });
      });
    }
  });

});
////************* HIGHLIGHT DUPLICATE CELLS view_3313 - BUILD SOW PAGE  ***************//////
/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE ************************/

// Replace *whatever* is rendered in target field cells with an icon
// Runs on all grid views within the target scenes

(function () {
  const SCENE_IDS = ["scene_1085", "scene_1116", "scene_1140"];

  const FIELD_KEYS = ["field_1946", "field_2375"];

  const ICON_HTML =
    '<span style="display:inline-flex; align-items:center; justify-content:center; gap:4px; vertical-align:middle;">' +
      '<i class="fa fa-server" aria-hidden="true" title="Changing Location" style="font-size:22px; line-height:1;"></i>' +
      '<span style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:0; line-height:1;">' +
        '<i class="fa fa-level-up" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
        '<i class="fa fa-level-down" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
      '</span>' +
    '</span>';

  // Inject CSS once
  function injectCssOnce() {
    const id = "scw-replace-icon-css";
    if (document.getElementById(id)) return;

    const selectors = SCENE_IDS
      .flatMap(s => FIELD_KEYS.map(f => `#kn-${s} td.${f}`))
      .join(", ");

    const css = `
      ${selectors} {
        display: table-cell !important;
        text-align: center;
        vertical-align: middle;
      }
    `;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function getCurrentSceneId() {
    const bodyId = $('body').attr('id');
    if (bodyId && bodyId.includes('scene_')) {
      const m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    return null;
  }

  function replaceIconsInScene(sceneId) {
    const $scene = $(`#kn-${sceneId}`);
    if (!$scene.length) return;

    const fieldSelector = FIELD_KEYS.map(f => `table.kn-table tbody td.${f}`).join(", ");

    $scene.find(fieldSelector).each(function () {
      const $cell = $(this);

      // Content-based idempotency: only skip if the icon is actually present.
      // jQuery .data() flags persist on reused DOM elements even after Knack
      // replaces cell innerHTML during inline edits, so we check the real DOM.
      if ($cell.find(".fa-server").length) return;

      $cell.empty().append(ICON_HTML);
    });
  }

  // Runs replacement for whichever target scene is active
  function replaceIfActiveScene() {
    const current = getCurrentSceneId();
    if (current && SCENE_IDS.indexOf(current) !== -1) {
      replaceIconsInScene(current);
    }
  }

  // MutationObserver catches DOM changes that aren't covered by Knack events.
  // Runs synchronously (no requestAnimationFrame) so replacement happens
  // before the browser paints — the idempotency check prevents infinite loops.
  const observerByScene = {};

  function startObserverForScene(sceneId) {
    if (observerByScene[sceneId]) return;

    const obs = new MutationObserver(() => {
      const current = getCurrentSceneId();
      if (current !== sceneId) return;

      replaceIconsInScene(sceneId);
    });

    obs.observe(document.body, { childList: true, subtree: true });
    observerByScene[sceneId] = obs;
  }

  // ---- Event listeners for inline-edit recovery ----
  //
  // Knack triggers namespaced events like "knack-cell-update.view_123"
  // and "knack-view-render.view_456".  In jQuery, .trigger("evt.ns")
  // only fires handlers bound with matching namespace OR no namespace.
  // Our old binding (.on("knack-cell-update.scwReplaceIcon")) used a
  // non-matching namespace so it NEVER fired — all recovery was done
  // by the MutationObserver with a 1-frame RAF delay (= visible flash).
  //
  // Fix: bind with NO namespace so we catch every view's events.
  // Use the named function reference for .off() cleanup instead.

  function bindKnackEventListeners() {
    $(document)
      .off("knack-cell-update", replaceIfActiveScene)
      .on("knack-cell-update", replaceIfActiveScene);

    $(document)
      .off("knack-view-render", replaceIfActiveScene)
      .on("knack-view-render", replaceIfActiveScene);
  }

  SCENE_IDS.forEach((sceneId) => {
    SCW.onSceneRender(sceneId, function () {
      injectCssOnce();
      replaceIconsInScene(sceneId);
      startObserverForScene(sceneId);
      bindKnackEventListeners();
    }, 'replace-content-with-icon');
  });

  // Handle case where scene is already rendered on load
  const initialScene = getCurrentSceneId();
  if (SCENE_IDS.indexOf(initialScene) !== -1) {
    injectCssOnce();
    replaceIconsInScene(initialScene);
    startObserverForScene(initialScene);
    bindKnackEventListeners();
  }
})();

/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE **************************/
/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 and view_3341 **************************/

(function () {
  const VIEW_IDS = ['view_3301', 'view_3341','view_3550'];
  const LIMIT_VALUE = '1000';
  const EVENT_NS = '.scwLimit1000';

  VIEW_IDS.forEach((VIEW_ID) => {
    $(document)
      .off(`knack-view-render.${VIEW_ID}${EVENT_NS}`)
      .on(`knack-view-render.${VIEW_ID}${EVENT_NS}`, function () {
        const $view = $('#' + VIEW_ID);
        if (!$view.length) return;

        // Run-once guard per view instance
        if ($view.data('scwLimitSet')) return;
        $view.data('scwLimitSet', true);

        const $limit = $view.find('select[name="limit"]');
        if (!$limit.length) return;

        if ($limit.val() !== LIMIT_VALUE) {
          $limit.val(LIMIT_VALUE).trigger('change');
        }
      });
  });
})();


/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 **************************/
/***************************** DISABLE QUANTITY CELL ON DESIGNATED QUANTITY 1 ONLY LINE ITEM TYPES *******************************/
(function () {
  // ============================================================
  // SCW / Knack: Row-based cell locks (multi-view, multi-rule)
  // - Locks target cells on specific rows based on a detect field value
  // - Prevents inline edit by killing events in CAPTURE phase
  // - Adds per-rule message tooltip + optional “Locked” badge
  // - Avoids rewriting cell HTML (safe for REL/connection fields like field_1957)
  // ============================================================

  const EVENT_NS = ".scwRowLocks";

  // ============================================================
  // CONFIG
  // ============================================================
  const VIEWS = [
    {
      viewId: "view_3332",
      rules: [
        {
          detectFieldKey: "field_2230",      // qty limit boolean
          when: "yes",
          lockFieldKeys: ["field_1964"],     // lock qty
          message: "Qty locked (must be 1)"
        },
        {
          detectFieldKey: "field_2231",      // <-- was field_2232; field_2231 exists in your DOM
          when: "no",
          lockFieldKeys: ["field_1957"],     // lock map connections field
          message: "This field is locked until map connections = Yes"
        }
      ]
    }
  ];

  // ============================================================
  // INTERNALS
  // ============================================================
  const LOCK_ATTR = "data-scw-locked";
  const LOCK_MSG_ATTR = "data-scw-locked-msg";
  const LOCK_CLASS = "scw-cell-locked";
  const ROW_CLASS = "scw-row-has-locks";

  function normText(s) {
    return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function readCellValue($cell) {
    return normText($cell.text());
  }

  function matchesWhen(cellVal, when) {
    if (typeof when === "function") return !!when(cellVal);
    if (when === true) return cellVal === "yes" || cellVal === "true" || cellVal === "1";
    if (when === false) return cellVal === "no" || cellVal === "false" || cellVal === "0" || cellVal === "";
    return cellVal === normText(String(when));
  }

  // Safer lock: do NOT replace the cell HTML (important for REL/connection fields)
  function lockTd($td, msg) {
    if (!$td || !$td.length) return;
    if ($td.attr(LOCK_ATTR) === "1") return;

    const m = (msg || "N/A").trim();

    $td
      .attr(LOCK_ATTR, "1")
      .attr(LOCK_MSG_ATTR, m)
      .addClass(LOCK_CLASS)
      .attr("title", m);

    // Remove common Knack/KTL inline-edit hooks
    $td.removeClass("cell-edit ktlInlineEditableCellsStyle");
    $td.find(".cell-edit, .ktlInlineEditableCellsStyle").removeClass("cell-edit ktlInlineEditableCellsStyle");

    // Belt-and-suspenders: if KTL uses pointer events, kill them in locked cells
    // (We also have capture-blocker below.)
  }

  function applyLocksForView(viewCfg) {
    const { viewId, rules } = viewCfg;
    const $view = $("#" + viewId);
    if (!$view.length) return;

    const $tbody = $view.find("table.kn-table-table tbody");
    if (!$tbody.length) return;

    $tbody.find("tr").each(function () {
      const $tr = $(this);

      // Skip group/header rows
      if ($tr.hasClass("kn-table-group") || $tr.hasClass("kn-table-group-container")) return;

      let rowLocked = false;

      rules.forEach((rule) => {
        const $detect = $tr.find(`td.${rule.detectFieldKey}`);
        if (!$detect.length) return;

        const cellVal = readCellValue($detect);
        if (!matchesWhen(cellVal, rule.when)) return;

        (rule.lockFieldKeys || []).forEach((fk) => {
          const $td = $tr.find(`td.${fk}`);
          if ($td.length) {
            lockTd($td, rule.message);
            rowLocked = true;
          }
        });
      });

      if (rowLocked) $tr.addClass(ROW_CLASS);
    });
  }

  function applyWithRetries(viewCfg, tries = 12) {
    let i = 0;
    (function tick() {
      i++;
      applyLocksForView(viewCfg);
      if (i < tries) setTimeout(tick, 250);
    })();
  }

  // Capture-phase event killer: blocks Knack’s delegated inline-edit before it runs
  function installCaptureBlockerOnce() {
    if (window.__scwRowLocksCaptureInstalled) return;
    window.__scwRowLocksCaptureInstalled = true;

    const kill = (e) => {
      const td = e.target.closest && e.target.closest(`td[${LOCK_ATTR}="1"]`);
      if (!td) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return false;
    };

    ["mousedown", "mouseup", "click", "dblclick", "touchstart", "keydown"].forEach((evt) => {
      document.addEventListener(evt, kill, true); // capture phase
    });
  }

  // MutationObserver per view: if KTL/Knack re-renders tbody, re-apply locks
  function installObserver(viewCfg) {
    const { viewId } = viewCfg;
    const $view = $("#" + viewId);
    if (!$view.length) return;

    if ($view.data("scwRowLocksObserver")) return;
    $view.data("scwRowLocksObserver", true);

    const el = $view.find("table.kn-table-table tbody").get(0);
    if (!el) return;

    const obs = new MutationObserver(() => applyLocksForView(viewCfg));
    obs.observe(el, { childList: true, subtree: true });
  }

  function bindTriggers(viewCfg) {
    const { viewId, rules } = viewCfg;

    const triggers = new Set();
    rules.forEach((r) => (r.triggerFieldKeys || []).forEach((k) => triggers.add(k)));
    if (triggers.size === 0) triggers.add("*");

    $(document)
      .off(`click${EVENT_NS}`, `#${viewId} td`)
      .on(`click${EVENT_NS}`, `#${viewId} td`, function () {
        const $td = $(this);
        const cls = ($td.attr("class") || "").split(/\s+/);

        const triggered = triggers.has("*") || cls.some((c) => triggers.has(c));
        if (!triggered) return;

        setTimeout(() => applyLocksForView(viewCfg), 50);
        setTimeout(() => applyLocksForView(viewCfg), 300);
      });
  }

  function injectLockCssOnce() {
    const id = "scw-row-locks-css";
    if (document.getElementById(id)) return;

    const css = `
      /* Locked look + no interaction */
      td.${LOCK_CLASS} {
        position: relative;
        cursor: not-allowed !important;
      }
      td.${LOCK_CLASS} * {
        cursor: not-allowed !important;
      }

      /* Hide any KTL inline-edit hover affordance inside locked cells */
      td.${LOCK_CLASS} .ktlInlineEditableCellsStyle,
      td.${LOCK_CLASS} .cell-edit {
        pointer-events: none !important;
      }

      /* Optional: add a small badge */
      td.${LOCK_CLASS}::after{
        content: "N/A";
        position: absolute;
        top: 2px;
        right: 4px;
        font-size: 10px;
        opacity: .7;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(0,0,0,.06);
      }

      td.scw-cell-locked {
        background-color: slategray;
      }

      /* Hide only the Knack-rendered value */
      td.field_1964.scw-cell-locked span[class^="col-"] {
         visibility: hidden;
      }


      /* Tooltip bubble using per-cell message */
      td.${LOCK_CLASS}:hover::before{
        content: attr(${LOCK_MSG_ATTR});
        position: absolute;
        bottom: 100%;
        left: 0;
        margin-bottom: 6px;
        max-width: 260px;
        white-space: normal;
        font-size: 12px;
        line-height: 1.2;
        padding: 6px 8px;
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,.15);
        background: #fff;
        color: #111;
        z-index: 999999;
      }
    `;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // INIT
  // ============================================================
  injectLockCssOnce();
  installCaptureBlockerOnce();

  VIEWS.forEach((viewCfg) => {
    const viewId = viewCfg.viewId;

    $(document)
      .off(`knack-view-render.${viewId}${EVENT_NS}`)
      .on(`knack-view-render.${viewId}${EVENT_NS}`, function () {
        applyWithRetries(viewCfg);
        installObserver(viewCfg);
        bindTriggers(viewCfg);
      });
  });
})();

/***************************** DISABLE QUANTITY CELL ON DESIGNATED QUANTITY 1 ONLY LINE ITEM TYPES *******************************/
/***************************** CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *****************************/
/**
 * SCW / Knack: Row-based conditional cell grayout (view_3505)
 *
 * Reads the hidden field_2366 (REL_proposal bucket) on each row
 * and applies per-bucket grayout rules:
 *
 *  "Other Services"  → gray out all cells EXCEPT field_2415, field_2409, field_2400, field_2399
 *  "Assumptions"     → gray out all cells EXCEPT field_2415, field_2409, field_2401;
 *                      field_2409 gets a distinctive background;
 *                      grayed cells have their content hidden so the
 *                      description column visually dominates the row.
 *
 * Approach mirrors lock-fields.js: capture-phase event blocker,
 * MutationObserver, retried application on render.
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const VIEW_IDS = ['view_3505'];

  // Detect field (hidden column with the bucket connection value)
  const DETECT_FIELD = 'field_2366';

  // Sort field (in DOM but not visible)
  const SORT_FIELD = 'field_2218';

  // Connection record IDs (more reliable than text matching)
  const BUCKET_OTHER_SERVICES = '6977caa7f246edf67b52cbcd';
  const BUCKET_ASSUMPTIONS    = '697b7a023a31502ec68b3303';

  // Display labels for the detect-field cell
  const BUCKET_LABELS = {
    [BUCKET_OTHER_SERVICES]: 'SERVICE',
    [BUCKET_ASSUMPTIONS]:    'ASSUMPTION',
  };

  // All editable/visible column field keys in this view (excluding the hidden detect field)
  const ALL_COLUMN_KEYS = [
    'field_2415', // REL_bid
    'field_2379', // PRODUCT
    'field_2380', // Connected Devices
    'field_2409', // Install Labor Description
    'field_2412', // Survey Notes
    'field_2376', // Power Available
    'field_2400', // Labor
    'field_2399', // Qty
    'field_2401', // Labor Total
  ];

  // Per-row conditional locks (applied to ALL rows regardless of bucket)
  // Each rule: if detectField matches `when`, gray+lock the target field
  const ROW_LOCKS = [
    {
      detectField: 'field_2373',
      when: 'yes',
      lockField: 'field_2399',   // Qty
    },
    {
      detectField: 'field_2374',
      whenNot: 'yes',
      lockField: 'field_2380',   // Connected Devices
    },
  ];

  // Rules: which fields stay ACTIVE (not grayed) per bucket
  const RULES = {
    [BUCKET_OTHER_SERVICES]: {
      activeFields: ['field_2415', 'field_2409', 'field_2412', 'field_2400', 'field_2399', 'field_2401'],
      rowClass: 'scw-row--services',
    },
    [BUCKET_ASSUMPTIONS]: {
      activeFields: ['field_2415', 'field_2409', 'field_2412'],
      rowClass: 'scw-row--assumptions',
    },
  };

  // ============================================================
  // CONSTANTS
  // ============================================================
  const EVENT_NS      = '.scwCondGray';
  const GRAY_ATTR     = 'data-scw-cond-grayed';
  const GRAY_CLASS    = 'scw-cond-grayed';
  const ROW_PROCESSED = 'data-scw-cond-processed';

  // ============================================================
  // CSS
  // ============================================================
  function injectCssOnce() {
    const id = 'scw-cond-grayout-css';
    if (document.getElementById(id)) return;

    const css = `
      /* ── Grayed-out cell ── */
      td.${GRAY_CLASS} {
        position: relative;
        background-color: #708090 !important;   /* slategray */
        border-color: #708090 !important;
        cursor: not-allowed !important;
      }
      td.${GRAY_CLASS} * {
        cursor: not-allowed !important;
      }

      /* Kill KTL inline-edit affordance */
      td.${GRAY_CLASS} .ktlInlineEditableCellsStyle,
      td.${GRAY_CLASS} .cell-edit {
        pointer-events: none !important;
      }

      /* ── Hide content in all grayed cells ── */
      td.${GRAY_CLASS} span[class^="col-"] {
        visibility: hidden;
      }

      /* Distinctive background on the active description cell for assumption rows */
      tr.scw-row--assumptions td.field_2409 {
        background-color: #e8f0fe !important;   /* light blue tint */
      }

      /* ── Bucket label overlay in PRODUCT (field_2379) cell ── */
      td.field_2379[data-scw-bucket-label] {
        position: relative;
      }
      td.field_2379[data-scw-bucket-label]::after {
        content: attr(data-scw-bucket-label);
        position: absolute;
        top: 50%;
        left: 8px;
        transform: translateY(-50%);
        font-weight: 700;
        font-size: 14px;
        color: #1e4d78;
        white-space: nowrap;
      }
    `;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // DETECTION
  // ============================================================

  /**
   * Returns the connection-value record ID from the detect cell,
   * e.g. "697b7a023a31502ec68b3303" for Assumptions.
   * Falls back to normalized text if no span[data-kn] is found.
   */
  function readBucketId($detectTd) {
    const $span = $detectTd.find('span[data-kn="connection-value"]');
    if ($span.length) {
      // The record ID is used as the span's class
      const cls = ($span.attr('class') || '').trim();
      if (cls) return cls;
    }
    return '';
  }

  // ============================================================
  // APPLY / REMOVE
  // ============================================================
  function grayTd($td) {
    if (!$td || !$td.length) return;
    if ($td.attr(GRAY_ATTR) === '1') return;

    $td
      .attr(GRAY_ATTR, '1')
      .addClass(GRAY_CLASS);

    // Strip Knack/KTL inline-edit hooks
    $td.removeClass('cell-edit ktlInlineEditableCellsStyle');
    $td.find('.cell-edit, .ktlInlineEditableCellsStyle')
      .removeClass('cell-edit ktlInlineEditableCellsStyle');
  }

  function clearRow($tr) {
    $tr.find(`td[${GRAY_ATTR}="1"]`).each(function () {
      $(this)
        .removeAttr(GRAY_ATTR)
        .removeClass(GRAY_CLASS);
    });
    // Remove all possible row classes
    Object.values(RULES).forEach(function (rule) {
      $tr.removeClass(rule.rowClass);
    });
    $tr.removeAttr(ROW_PROCESSED);
  }

  function normText(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // Read a yes/no value from a cell, handling text, checkboxes, and Knack booleans
  function readBool($cell) {
    // Checkbox input
    var $chk = $cell.find('input[type="checkbox"]');
    if ($chk.length) return $chk.is(':checked') ? 'yes' : 'no';
    // Knack boolean icon (thumbs-up / thumbs-down, check / x)
    if ($cell.find('.kn-icon-yes, .fa-check, .fa-thumbs-up').length) return 'yes';
    if ($cell.find('.kn-icon-no, .fa-times, .fa-thumbs-down').length) return 'no';
    // Fall back to text
    return normText($cell.text());
  }

  function applyRowLocks($tr) {
    ROW_LOCKS.forEach(function (lock) {
      var $detect = $tr.find('td.' + lock.detectField);
      if (!$detect.length) return;
      var val = readBool($detect);
      var shouldLock = false;
      if (lock.when !== undefined)    shouldLock = (val === normText(lock.when));
      if (lock.whenNot !== undefined) shouldLock = (val !== normText(lock.whenNot));
      if (!shouldLock) return;
      var $td = $tr.find('td.' + lock.lockField);
      if ($td.length) grayTd($td);
    });
  }

  function processRow($tr) {
    // Skip group/header rows
    if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

    // ── Bucket-based grayout ──
    const $detectTd = $tr.find('td.' + DETECT_FIELD);
    if (!$detectTd.length) {
      applyRowLocks($tr);
      return;
    }

    const bucketId = readBucketId($detectTd);
    if (!bucketId) {
      applyRowLocks($tr);
      return;
    }

    const rule = RULES[bucketId];
    if (!rule) {
      clearRow($tr);
      // Per-row locks run AFTER clearRow so they aren't wiped
      applyRowLocks($tr);
      return;
    }

    const activeSet = new Set(rule.activeFields || []);

    // Gray every column not in the active set
    ALL_COLUMN_KEYS.forEach(function (fieldKey) {
      if (activeSet.has(fieldKey)) return;
      const $td = $tr.find('td.' + fieldKey);
      if ($td.length) grayTd($td);
    });

    // Show bucket label in the PRODUCT cell only (first td.field_2379).
    // The second td.field_2379 is the *connected* Mounting Accs. — skip it.
    var label = BUCKET_LABELS[bucketId];
    if (label) {
      var $allProduct = $tr.find('td.field_2379');
      if ($allProduct.length) {
        $allProduct.first().attr('data-scw-bucket-label', label);
      }
    }

    // Apply row-level class
    $tr.addClass(rule.rowClass);
    $tr.attr(ROW_PROCESSED, '1');

    // Per-row locks run last so they can override activeFields
    applyRowLocks($tr);
  }

  // ============================================================
  // VIEW-LEVEL APPLICATION
  // ============================================================
  function applyForView(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;

    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

    $tbody.find('tr').each(function () {
      processRow($(this));
    });
  }

  // ============================================================
  // SORT ROWS BY SORT_FIELD
  // ============================================================
  function sortRows(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;
    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

    // Collect groups: each group starts with a group-header row,
    // followed by its data rows until the next group-header.
    var allRows = $tbody.children('tr').toArray();
    var groups = [];
    var current = null;

    allRows.forEach(function (row) {
      var $r = $(row);
      if ($r.hasClass('kn-table-group') || $r.hasClass('kn-table-group-container')) {
        current = { header: row, rows: [] };
        groups.push(current);
      } else if (current) {
        current.rows.push(row);
      } else {
        // Rows before any group header — treat as their own group
        if (!groups.length || groups[groups.length - 1].header) {
          current = { header: null, rows: [] };
          groups.push(current);
        }
        current.rows.push(row);
      }
    });

    // Sort data rows within each group
    var comparator = function (a, b) {
      var aVal = $(a).find('td.' + SORT_FIELD).text().trim();
      var bVal = $(b).find('td.' + SORT_FIELD).text().trim();
      var aNum = parseFloat(aVal);
      var bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return aVal.localeCompare(bVal);
    };

    groups.forEach(function (g) {
      if (g.rows.length > 1) g.rows.sort(comparator);
    });

    // Re-append in order: header then sorted rows
    groups.forEach(function (g) {
      if (g.header) $tbody.append(g.header);
      g.rows.forEach(function (row) { $tbody.append(row); });
    });
  }

  function applyWithRetries(viewId, tries) {
    tries = tries || 12;
    var i = 0;
    (function tick() {
      i++;
      applyForView(viewId);
      if (i < tries) setTimeout(tick, 250);
    })();
  }

  // ============================================================
  // CAPTURE-PHASE EVENT BLOCKER
  // (shared with lock-fields.js via the same attribute)
  // ============================================================
  function installCaptureBlockerOnce() {
    if (window.__scwCondGrayCaptureInstalled) return;
    window.__scwCondGrayCaptureInstalled = true;

    var kill = function (e) {
      var td = e.target.closest && e.target.closest('td[' + GRAY_ATTR + '="1"]');
      if (!td) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      return false;
    };

    ['mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'keydown'].forEach(function (evt) {
      document.addEventListener(evt, kill, true); // capture phase
    });
  }

  // ============================================================
  // MUTATION OBSERVER (re-apply when Knack/KTL re-renders tbody)
  // ============================================================
  function installObserver(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;
    if ($view.data('scwCondGrayObserver')) return;
    $view.data('scwCondGrayObserver', true);

    var el = $view.find('table.kn-table-table tbody').get(0);
    if (!el) return;

    var obs = new MutationObserver(function () {
      applyForView(viewId);
    });
    obs.observe(el, { childList: true, subtree: true });
  }

  // ============================================================
  // INIT
  // ============================================================
  injectCssOnce();
  installCaptureBlockerOnce();

  VIEW_IDS.forEach(function (viewId) {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        sortRows(viewId);
        applyWithRetries(viewId);
        installObserver(viewId);
      });
  });
})();
/***************************** /CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
/***************************** CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
/**
 * SCW / Knack: Row-based conditional cell grayout (view_3456 — SOW)
 *
 * Reads the hidden field_2219 (REL_proposal bucket) on each row
 * and applies per-bucket grayout rules:
 *
 *  "Other Services"  → gray out all cells; inject bucket label +
 *                      field_2020 (Labor Description) into field_1949.
 *  "Assumptions"     → gray out all cells; inject bucket label +
 *                      field_2020 (Labor Description) into field_1949.
 *
 * Approach mirrors lock-fields.js: capture-phase event blocker,
 * MutationObserver, retried application on render.
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const VIEW_IDS = ['view_3456'];

  // Detect field (hidden column with the bucket connection value)
  const DETECT_FIELD = 'field_2219';

  // Sort field (in DOM but not visible)
  const SORT_FIELD = 'field_2218';

  // Connection record IDs (more reliable than text matching)
  const BUCKET_OTHER_SERVICES = '6977caa7f246edf67b52cbcd';
  const BUCKET_ASSUMPTIONS    = '697b7a023a31502ec68b3303';

  // Display labels for the detect-field cell
  const BUCKET_LABELS = {
    [BUCKET_OTHER_SERVICES]: 'SERVICE',
    [BUCKET_ASSUMPTIONS]:    'ASSUMPTION',
  };

  // All editable/visible column field keys in this view (excluding the hidden detect field)
  const ALL_COLUMN_KEYS = [
    'field_1949', // PRODUCT (bucket label + labor description target)
    'field_1957', // Connected Devices
    'field_1960', // Unit Price
    'field_2020', // INPUT_Labor Description (hidden)
    'field_1953', // SCW Notes
    //'field_2376', // Power Available
    'field_2261', // Cust Disc %
    'field_2262', // Cust Disc $$ Each
    'field_1964', // Qty
    'field_2303', // Applied Disc
    'field_2269', // total Line Price
  ];

  // Per-row conditional locks (applied to ALL rows regardless of bucket)
  // Each rule: if detectField matches `when`, gray+lock the target field
  const ROW_LOCKS = [
    {
      detectField: 'field_2230', // FLAG_only quantity one per record
      when: 'yes',
      lockField: 'field_1964',   // Qty
    },
    {
      detectField: 'field_2231', // FLAG_map camera or reader connections
      whenNot: 'yes',
      lockField: 'field_1957',   // Connected Devices
    },
  ];

  // Rules: which fields stay ACTIVE (not grayed) per bucket
  const RULES = {
    [BUCKET_OTHER_SERVICES]: {
      activeFields: [],
      rowClass: 'scw-row--services',
    },
    [BUCKET_ASSUMPTIONS]: {
      activeFields: [],
      rowClass: 'scw-row--assumptions',
    },
  };

  // ============================================================
  // CONSTANTS
  // ============================================================
  const EVENT_NS      = '.scwCondGray';
  const GRAY_ATTR     = 'data-scw-cond-grayed';
  const GRAY_CLASS    = 'scw-cond-grayed';
  const ROW_PROCESSED = 'data-scw-cond-processed';

  // ============================================================
  // CSS
  // ============================================================
  function injectCssOnce() {
    const id = 'scw-sow-cond-grayout-css';
    if (document.getElementById(id)) return;

    const css = `
      /* ── Grayed-out cell ── */
      td.${GRAY_CLASS} {
        position: relative;
        background-color: #708090 !important;   /* slategray */
        border-color: #708090 !important;
        cursor: not-allowed !important;
      }
      td.${GRAY_CLASS} * {
        cursor: not-allowed !important;
      }

      /* Kill KTL inline-edit affordance */
      td.${GRAY_CLASS} .ktlInlineEditableCellsStyle,
      td.${GRAY_CLASS} .cell-edit {
        pointer-events: none !important;
      }

      /* ── Hide content in all grayed cells ── */
      td.${GRAY_CLASS} span[class^="col-"] {
        visibility: hidden;
      }

      /* Distinctive background on the active description cell for assumption rows */
      tr.scw-row--assumptions td.field_2409 {
        background-color: #e8f0fe !important;   /* light blue tint */
      }

      /* ── Bucket label overlay in PRODUCT (field_1949) cell ── */
      td.field_1949[data-scw-bucket-label] {
        position: relative;
      }
      td.field_1949[data-scw-bucket-label]::after {
        content: attr(data-scw-bucket-label);
        position: absolute;
        top: 50%;
        left: 8px;
        transform: translateY(-50%);
        font-weight: 700;
        font-size: 14px;
        color: #1e4d78;
        white-space: nowrap;
      }
    `;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // DETECTION
  // ============================================================

  /**
   * Returns the connection-value record ID from the detect cell,
   * e.g. "697b7a023a31502ec68b3303" for Assumptions.
   * Falls back to normalized text if no span[data-kn] is found.
   */
  function readBucketId($detectTd) {
    const $span = $detectTd.find('span[data-kn="connection-value"]');
    if ($span.length) {
      // The record ID is used as the span's class
      const cls = ($span.attr('class') || '').trim();
      if (cls) return cls;
    }
    return '';
  }

  // ============================================================
  // APPLY / REMOVE
  // ============================================================
  function grayTd($td) {
    if (!$td || !$td.length) return;
    if ($td.attr(GRAY_ATTR) === '1') return;

    $td
      .attr(GRAY_ATTR, '1')
      .addClass(GRAY_CLASS);

    // Strip Knack/KTL inline-edit hooks
    $td.removeClass('cell-edit ktlInlineEditableCellsStyle');
    $td.find('.cell-edit, .ktlInlineEditableCellsStyle')
      .removeClass('cell-edit ktlInlineEditableCellsStyle');
  }

  function clearRow($tr) {
    $tr.find(`td[${GRAY_ATTR}="1"]`).each(function () {
      $(this)
        .removeAttr(GRAY_ATTR)
        .removeClass(GRAY_CLASS);
    });
    // Remove all possible row classes
    Object.values(RULES).forEach(function (rule) {
      $tr.removeClass(rule.rowClass);
    });
    $tr.removeAttr(ROW_PROCESSED);
  }

  function normText(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  // Read a yes/no value from a cell, handling text, checkboxes, and Knack booleans
  function readBool($cell) {
    // Checkbox input
    var $chk = $cell.find('input[type="checkbox"]');
    if ($chk.length) return $chk.is(':checked') ? 'yes' : 'no';
    // Knack boolean icon (thumbs-up / thumbs-down, check / x)
    if ($cell.find('.kn-icon-yes, .fa-check, .fa-thumbs-up').length) return 'yes';
    if ($cell.find('.kn-icon-no, .fa-times, .fa-thumbs-down').length) return 'no';
    // Fall back to text
    return normText($cell.text());
  }

  function applyRowLocks($tr) {
    ROW_LOCKS.forEach(function (lock) {
      var $detect = $tr.find('td.' + lock.detectField);
      if (!$detect.length) return;
      var val = readBool($detect);
      var shouldLock = false;
      if (lock.when !== undefined)    shouldLock = (val === normText(lock.when));
      if (lock.whenNot !== undefined) shouldLock = (val !== normText(lock.whenNot));
      if (!shouldLock) return;
      var $td = $tr.find('td.' + lock.lockField);
      if ($td.length) grayTd($td);
    });
  }

  function processRow($tr) {
    // Skip group/header rows
    if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

    // ── Bucket-based grayout ──
    const $detectTd = $tr.find('td.' + DETECT_FIELD);
    if (!$detectTd.length) {
      applyRowLocks($tr);
      return;
    }

    const bucketId = readBucketId($detectTd);
    if (!bucketId) {
      applyRowLocks($tr);
      return;
    }

    const rule = RULES[bucketId];
    if (!rule) {
      clearRow($tr);
      // Per-row locks run AFTER clearRow so they aren't wiped
      applyRowLocks($tr);
      return;
    }

    const activeSet = new Set(rule.activeFields || []);

    // Gray every column not in the active set
    ALL_COLUMN_KEYS.forEach(function (fieldKey) {
      if (activeSet.has(fieldKey)) return;
      const $td = $tr.find('td.' + fieldKey);
      if ($td.length) grayTd($td);
    });

    // Show bucket label + labor description in the PRODUCT (field_1949) cell.
    // field_2020 (INPUT_Labor Description) is read if present in the DOM.
    var label = BUCKET_LABELS[bucketId];
    if (label) {
      var $laborDesc = $tr.find('td.field_2020');
      var laborText = $laborDesc.length ? $laborDesc.text().trim() : '';
      var combined = laborText ? label + ' \u2014 ' + laborText : label;
      var $target = $tr.find('td.field_1949');
      if ($target.length) {
        $target.first().attr('data-scw-bucket-label', combined);
      }
    }

    // Apply row-level class
    $tr.addClass(rule.rowClass);
    $tr.attr(ROW_PROCESSED, '1');

    // Per-row locks run last so they can override activeFields
    applyRowLocks($tr);
  }

  // ============================================================
  // VIEW-LEVEL APPLICATION
  // ============================================================
  function applyForView(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;

    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

    $tbody.find('tr').each(function () {
      processRow($(this));
    });
  }

  // ============================================================
  // SORT ROWS BY SORT_FIELD
  // ============================================================
  function sortRows(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;
    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

    // Collect groups: each group starts with a group-header row,
    // followed by its data rows until the next group-header.
    var allRows = $tbody.children('tr').toArray();
    var groups = [];
    var current = null;

    allRows.forEach(function (row) {
      var $r = $(row);
      if ($r.hasClass('kn-table-group') || $r.hasClass('kn-table-group-container')) {
        current = { header: row, rows: [] };
        groups.push(current);
      } else if (current) {
        current.rows.push(row);
      } else {
        // Rows before any group header — treat as their own group
        if (!groups.length || groups[groups.length - 1].header) {
          current = { header: null, rows: [] };
          groups.push(current);
        }
        current.rows.push(row);
      }
    });

    // Sort data rows within each group
    var comparator = function (a, b) {
      var aVal = $(a).find('td.' + SORT_FIELD).text().trim();
      var bVal = $(b).find('td.' + SORT_FIELD).text().trim();
      var aNum = parseFloat(aVal);
      var bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return aVal.localeCompare(bVal);
    };

    groups.forEach(function (g) {
      if (g.rows.length > 1) g.rows.sort(comparator);
    });

    // Re-append in order: header then sorted rows
    groups.forEach(function (g) {
      if (g.header) $tbody.append(g.header);
      g.rows.forEach(function (row) { $tbody.append(row); });
    });
  }

  function applyWithRetries(viewId, tries) {
    tries = tries || 12;
    var i = 0;
    (function tick() {
      i++;
      applyForView(viewId);
      if (i < tries) setTimeout(tick, 250);
    })();
  }

  // ============================================================
  // CAPTURE-PHASE EVENT BLOCKER
  // (shared with lock-fields.js via the same attribute)
  // ============================================================
  function installCaptureBlockerOnce() {
    if (window.__scwCondGrayCaptureInstalled) return;
    window.__scwCondGrayCaptureInstalled = true;

    var kill = function (e) {
      var td = e.target.closest && e.target.closest('td[' + GRAY_ATTR + '="1"]');
      if (!td) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      return false;
    };

    ['mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'keydown'].forEach(function (evt) {
      document.addEventListener(evt, kill, true); // capture phase
    });
  }

  // ============================================================
  // MUTATION OBSERVER (re-apply when Knack/KTL re-renders tbody)
  // ============================================================
  function installObserver(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;
    if ($view.data('scwCondGrayObserver')) return;
    $view.data('scwCondGrayObserver', true);

    var el = $view.find('table.kn-table-table tbody').get(0);
    if (!el) return;

    var obs = new MutationObserver(function () {
      applyForView(viewId);
    });
    obs.observe(el, { childList: true, subtree: true });
  }

  // ============================================================
  // INIT
  // ============================================================
  injectCssOnce();
  installCaptureBlockerOnce();

  VIEW_IDS.forEach(function (viewId) {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        sortRows(viewId);
        applyWithRetries(viewId);
        installObserver(viewId);
      });
  });
})();
/***************************** /CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
/*************  // view_3332 - truncate field_1949 with click-to-expand **********************/

// view_3332 - truncate field_1949 with click-to-expand
(function () {
  const VIEW_ID = 'view_3332';
  const FIELD_CLASS = 'field_1949';
  const MAX = 100;

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function applyTruncate(viewEl) {
    const cells = viewEl.querySelectorAll(`td.${FIELD_CLASS}`);
    cells.forEach((td) => {
      // Avoid double-processing on re-render/pagination
      if (td.dataset.scwTruncated === '1') return;

      const full = (td.textContent || '').trim();
      if (!full) return;

      // If short already, leave it
      if (full.length <= MAX) {
        td.dataset.scwTruncated = '1';
        return;
      }

      const preview = full.slice(0, MAX);

      td.dataset.scwTruncated = '1';
      td.dataset.scwFull = full;
      td.dataset.scwPreview = preview;
      td.dataset.scwExpanded = '0';

      td.innerHTML = `
        <a href="#" class="scw-trunc-toggle" style="text-decoration: underline;">
          <span class="scw-trunc-text">${escapeHtml(preview)}…</span>
        </a>
      `;
    });
  }

  // On view render, truncate
  $(document).on(`knack-view-render.${VIEW_ID}`, function (e, view) {
    const viewEl = document.getElementById(VIEW_ID);
    if (!viewEl) return;
    applyTruncate(viewEl);
  });

  // Delegate click handler (works after pagination/filter refresh)
  $(document).on('click', `#${VIEW_ID} td.${FIELD_CLASS} .scw-trunc-toggle`, function (e) {
    e.preventDefault();

    const td = this.closest(`td.${FIELD_CLASS}`);
    if (!td) return;

    const expanded = td.dataset.scwExpanded === '1';
    const nextText = expanded ? (td.dataset.scwPreview + '…') : td.dataset.scwFull;

    td.dataset.scwExpanded = expanded ? '0' : '1';

    // Keep it clickable for toggling back
    this.querySelector('.scw-trunc-text').textContent = nextText;
  });
})();


/*************  // view_3332 - truncate field_1949 with click-to-expand **************************/


/***************************** SURVEY / PROJECT FORM - network device mapping *******************/
/* testing*/

const checkboxStateByView = {};

function enableCheckboxSelectSync({ viewId, selectFieldId }) {
  checkboxStateByView[viewId] = checkboxStateByView[viewId] || [];

  $(document).on(`knack-view-render.${viewId}`, function () {
    console.log(`✅ View ${viewId} rendered`);

    const $selectInput = $(`#${viewId}-${selectFieldId}`);
    if (!$selectInput.length) {
      console.error(`❌ Select input not found in ${viewId}`);
      return;
    }

    // ✅ Force open to trigger Knack to populate options
    $selectInput.trigger('focus').trigger('mousedown');

    // ✅ MutationObserver for normal (multi-option) cases
    const observer = new MutationObserver(() => {
      const options = $selectInput.find('option');
      if (options.length === 0) return;

      console.log(`📋 ${options.length} options detected in ${viewId}`);
      syncSelectedToCheckboxState(options, viewId);
      observer.disconnect();
      renderCheckboxes();
      bindCheckboxListeners();
    });

    observer.observe($selectInput[0], { childList: true, subtree: true });

    // ✅ Fallback polling in case only one quote and Knack injects slowly
    const fallbackPoll = setInterval(() => {
      const options = $selectInput.find('option');
      if (options.length > 0) {
        clearInterval(fallbackPoll);
        console.log(`⏳ Fallback: camera options detected in ${viewId}`);
        syncSelectedToCheckboxState(options, viewId);
        renderCheckboxes();
        bindCheckboxListeners();
      }
    }, 100);

    // ✅ Handle quote field change (clear + wait for new camera list)
    $(document).off(`change.quote-${viewId}`);
    $(document).on(`change.quote-${viewId}`, `#${viewId}-field_1864`, function () {
      console.log(`🔁 Quote field changed in ${viewId}`);

      $(`#custom-checkboxes-${viewId} input[type="checkbox"]:checked`).each(function () {
        const val = $(this).val();
        const label = $(this).parent().text().trim();
        if (!checkboxStateByView[viewId].some(o => o.value === val)) {
          checkboxStateByView[viewId].push({ value: val, label });
        }
      });

      const reobserve = new MutationObserver(() => {
        const options = $selectInput.find('option');
        if (options.length === 0) return;

        reobserve.disconnect();
        renderCheckboxes();
        bindCheckboxListeners();
      });

      $selectInput.trigger('focus').trigger('mousedown');
      reobserve.observe($selectInput[0], { childList: true, subtree: true });
    });

    function syncSelectedToCheckboxState(options, viewId) {
      options.filter(':selected').each(function () {
        const val = $(this).val();
        const label = $(this).text();
        if (!checkboxStateByView[viewId].some(o => o.value === val)) {
          checkboxStateByView[viewId].push({ value: val, label });
        }
      });
    }

    function renderCheckboxes() {
      const $chosen = $selectInput.siblings('.chzn-container');
      if ($chosen.length) $chosen.hide();

      $(`#custom-checkboxes-${viewId}`).remove();

      $selectInput.find('option').prop('selected', false);
      checkboxStateByView[viewId].forEach(({ value }) => {
        $selectInput.find(`option[value="${value}"]`).prop('selected', true);
      });
      $selectInput.trigger('change').trigger('chosen:updated');

      let html = `<div id="custom-checkboxes-${viewId}" style="margin-top:10px;">`;
      const seen = {};

      checkboxStateByView[viewId].forEach(({ value, label }) => {
        html += `<label style="display:block;margin:5px 0;">
                   <input type="checkbox" value="${value}" checked> ${label}
                 </label>`;
        seen[value] = true;
      });

      $selectInput.find('option').each(function () {
        const val = $(this).val();
        const label = $(this).text();
        if (!seen[val]) {
          html += `<label style="display:block;margin:5px 0;">
                     <input type="checkbox" value="${val}"> ${label}
                   </label>`;
        }
      });

      html += '</div>';
      $selectInput.after(html);
    }

    function bindCheckboxListeners() {
      $(document).off(`change.checkbox-${viewId}`);
      $(document).on(`change.checkbox-${viewId}`, `#custom-checkboxes-${viewId} input[type="checkbox"]`, function () {
        $selectInput.find('option').prop('selected', false);
        checkboxStateByView[viewId] = [];

        $(`#custom-checkboxes-${viewId} input[type="checkbox"]:checked`).each(function () {
          const val = $(this).val();
          const label = $(this).parent().text().trim();
          checkboxStateByView[viewId].push({ value: val, label });
          $selectInput.find(`option[value="${val}"]`).prop('selected', true);
        });

        $selectInput.trigger('change').trigger('chosen:updated');
      });
    }
  });
}

// ✅ Activate for each view
enableCheckboxSelectSync({
  viewId: 'view_2688',
  selectFieldId: 'field_1656'
});

enableCheckboxSelectSync({
  viewId: 'view_2697',
  selectFieldId: 'field_1656'
});

/*




/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: NO WATTBOX SECTION *******************/

// Working version + Different message for each situation 🎯

$(document).on('knack-view-render.view_3094', function(event, view, data) {
  console.log('✅ View 3094 loaded');

  const uploadFields = ['field_1808_upload', 'field_1809_upload'];

  uploadFields.forEach(function(inputFieldId) {
    const $uploadWrapper = $('#' + inputFieldId).parent('.kn-file-upload');
    const $fileInput = $('#' + inputFieldId);

    let existingFilename = '';

    if ($uploadWrapper.length && $fileInput.length) {
      console.log('🔎 Upload wrapper exists for', inputFieldId);

      // Style wrapper
      $uploadWrapper.css({
        position: 'relative',
        width: '100%',
        height: '150px',
        minHeight: '150px',
        backgroundColor: 'rgba(255, 0, 0, 0.2)', // Default RED
        transition: 'background-color 0.5s ease'
      });

      $fileInput.css({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
        zIndex: 2
      });

      // Add overlay (only once)
      if ($uploadWrapper.find('.upload-message').length === 0) {
        $uploadWrapper.append(`
          <div class="upload-message" style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px dashed #1890ff;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            color: #1890ff;
            text-align: center;
            pointer-events: none;
            z-index: 1;
          ">
            📂 Drop your file here or click to upload
          </div>
        `);
      }

      function getFilenameFromAsset(assetElement) {
        if (!assetElement) return '';
        const link = assetElement.querySelector('a');
        if (link) {
          return link.innerText.trim();
        } else {
          return assetElement.innerText.replace(/remove/i, '').trim();
        }
      }

      function setUploadMessage(currentFilename, newFilename = '', mode = 'normal') {
        const $message = $uploadWrapper.find('.upload-message');

        if (mode === 'uploading-new') {
          // Uploading a file where none existed
          $message.html(`
            <div style="padding: 20px;">
              📂 Please click UPDATE to upload this file:<br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (mode === 'uploading-replacement') {
          // Replacing an existing file
          $message.html(`
            <div style="padding: 20px;">
              ♻️ Click UPDATE to replace <br><strong>${currentFilename}</strong><br> with <br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (currentFilename) {
          // File already uploaded
          $message.html(`
            <div style="padding: 20px;">
              📄 Good Job!
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(0, 128, 0, 0.2)'); // GREEN
        } else {
          // Default state (no file)
          $message.html(`📂 Drop your file here or click to upload`);
          $uploadWrapper.css('background-color', 'rgba(255, 0, 0, 0.2)'); // RED
        }
      }

      function hideAssetCurrent() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        if (assetCurrentNow) {
          $(assetCurrentNow).hide();
        }
      }

      function checkExistingUpload() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        const filename = getFilenameFromAsset(assetCurrentNow);

        console.log('📦 Existing upload detected for', inputFieldId, ':', filename);

        if (filename) {
          existingFilename = filename;
          setUploadMessage(existingFilename);
        } else {
          setUploadMessage('');
        }

        hideAssetCurrent();
      }

      checkExistingUpload();

      // MutationObserver for each upload field
      const observeTarget = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
      if (observeTarget) {
        const observer = new MutationObserver(function(mutationsList, observer) {
          for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              console.log('🛰️ Upload updated for', inputFieldId);

              const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
              const filename = getFilenameFromAsset(assetCurrentNow);

              console.log('🛰️ Found filename:', filename);

              if (filename) {
                if (existingFilename && filename !== existingFilename) {
                  // Replacing an existing file
                  setUploadMessage(existingFilename, filename, 'uploading-replacement');
                } else if (!existingFilename) {
                  // Uploading a new file where there was none
                  setUploadMessage('', filename, 'uploading-new');
                } else {
                  // No change
                  existingFilename = filename;
                  setUploadMessage(filename);
                }
              } else {
                setUploadMessage('', '', 'empty');
              }

              hideAssetCurrent();
            }
          }
        });

        observer.observe(observeTarget, { childList: true, subtree: true });
        console.log('🔭 Observer initialized for', inputFieldId);
      } else {
        console.log('🚫 No observer target for', inputFieldId);
      }

    } else {
      console.log('🚫 Upload wrapper or input not found for', inputFieldId);
    }
  });

});


/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: NO WATTBOX SECTION *******************/




/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: YES WATTBOX SECTION *******************/

// Working version + Different message for each situation 🎯

$(document).on('knack-view-render.view_3297', function(event, view, data) {
  console.log('✅ View 3297 loaded');

  const uploadFields = ['field_1808_upload', 'field_1809_upload', 'field_1930_upload'];

  uploadFields.forEach(function(inputFieldId) {
    const $uploadWrapper = $('#' + inputFieldId).parent('.kn-file-upload');
    const $fileInput = $('#' + inputFieldId);

    let existingFilename = '';

    if ($uploadWrapper.length && $fileInput.length) {
      console.log('🔎 Upload wrapper exists for', inputFieldId);

      // Style wrapper
      $uploadWrapper.css({
        position: 'relative',
        width: '100%',
        height: '150px',
        minHeight: '150px',
        backgroundColor: 'rgba(255, 0, 0, 0.2)', // Default RED
        transition: 'background-color 0.5s ease'
      });

      $fileInput.css({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
        zIndex: 2
      });

      // Add overlay (only once)
      if ($uploadWrapper.find('.upload-message').length === 0) {
        $uploadWrapper.append(`
          <div class="upload-message" style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px dashed #1890ff;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            color: #1890ff;
            text-align: center;
            pointer-events: none;
            z-index: 1;
          ">
            📂 Drop your file here or click to upload
          </div>
        `);
      }

      function getFilenameFromAsset(assetElement) {
        if (!assetElement) return '';
        const link = assetElement.querySelector('a');
        if (link) {
          return link.innerText.trim();
        } else {
          return assetElement.innerText.replace(/remove/i, '').trim();
        }
      }

      function setUploadMessage(currentFilename, newFilename = '', mode = 'normal') {
        const $message = $uploadWrapper.find('.upload-message');

        if (mode === 'uploading-new') {
          // Uploading a file where none existed
          $message.html(`
            <div style="padding: 20px;">
              📂 Please click UPDATE to upload this file:<br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (mode === 'uploading-replacement') {
          // Replacing an existing file
          $message.html(`
            <div style="padding: 20px;">
              ♻️ Click UPDATE to replace <br><strong>${currentFilename}</strong><br> with <br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (currentFilename) {
          // File already uploaded
          $message.html(`
            <div style="padding: 20px;">
              📄 Good Job!
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(0, 128, 0, 0.2)'); // GREEN
        } else {
          // Default state (no file)
          $message.html(`📂 Drop your file here or click to upload`);
          $uploadWrapper.css('background-color', 'rgba(255, 0, 0, 0.2)'); // RED
        }
      }

      function hideAssetCurrent() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        if (assetCurrentNow) {
          $(assetCurrentNow).hide();
        }
      }

      function checkExistingUpload() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        const filename = getFilenameFromAsset(assetCurrentNow);

        console.log('📦 Existing upload detected for', inputFieldId, ':', filename);

        if (filename) {
          existingFilename = filename;
          setUploadMessage(existingFilename);
        } else {
          setUploadMessage('');
        }

        hideAssetCurrent();
      }

      checkExistingUpload();

      // MutationObserver for each upload field
      const observeTarget = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
      if (observeTarget) {
        const observer = new MutationObserver(function(mutationsList, observer) {
          for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              console.log('🛰️ Upload updated for', inputFieldId);

              const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
              const filename = getFilenameFromAsset(assetCurrentNow);

              console.log('🛰️ Found filename:', filename);

              if (filename) {
                if (existingFilename && filename !== existingFilename) {
                  // Replacing an existing file
                  setUploadMessage(existingFilename, filename, 'uploading-replacement');
                } else if (!existingFilename) {
                  // Uploading a new file where there was none
                  setUploadMessage('', filename, 'uploading-new');
                } else {
                  // No change
                  existingFilename = filename;
                  setUploadMessage(filename);
                }
              } else {
                setUploadMessage('', '', 'empty');
              }

              hideAssetCurrent();
            }
          }
        });

        observer.observe(observeTarget, { childList: true, subtree: true });
        console.log('🔭 Observer initialized for', inputFieldId);
      } else {
        console.log('🚫 No observer target for', inputFieldId);
      }

    } else {
      console.log('🚫 Upload wrapper or input not found for', inputFieldId);
    }
  });

});


/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: NO WATTBOX SECTION *******************/




// PM REVIEW SYSTEM QUESTIONNAIRE
$(document).on('knack-scene-render.scene_1003', function (event, scene) {
//$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-info-bar").hide();
//$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});





// NEW Q1 2024 Technician SOW View
$(document).on('knack-scene-render.scene_915', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});




// NEW Q2 2023 Customer Quote View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_828', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});

// NEW Q2 2023 Scope of Work-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_833', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
$(".kn-menu.view_44").hide();
});

// NEW Q3 2023 DRAFT Quote View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_873', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});

// NEW Q2 2023 DRAFT Scope of Work-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_886', function (event, scene) {
$(".kn-back-link").hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
$(".kn-menu.view_44").hide();
});





// Project Summary View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_292', function (event, scene) {
//$('.kn-back-link').hide();
//$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
//$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});



// Customer Quote View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_212', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});

// Request site Visit View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_733', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});



// Customer Project Summary View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_401', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu").hide();


});

// Customer Camera Location Sign Off-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_689', function (event, scene) {
$(".kn-back-link").hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu").hide();


});

// Customer Final Approval Sign Off-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_696', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
// $(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu").hide();


});
/**************************************************************************************************
 * FEATURE: McGandy’s Experiment (scene_213) — margin/cost math
 * ⚠ Contains likely bug: document.querySelector('text#field_1365') should probably be input#field_1365
 **************************************************************************************************/
(function mcgandyExperiment_scene213() {
  SCW.onSceneRender('scene_213', function (event, view, record) {
    setTimeout(function () {

      // subcontractor cost changed
      $('input#field_1364').change(function () {
        var subcontractor_cost = $(this).val();
        var survey_cost = document.querySelector('input#field_1363').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var margin = document.querySelector('input#field_1365').value;
        var marked_up_labor = Math.round(total_cost / (1 - margin));

        var install_total = Knack.models['view_507'].toJSON().field_343.replaceAll(',', '').replaceAll('$', '');
        var fees_added = document.querySelector('input#field_1251').value.replaceAll(',', '');
        var more_fees_to_add = Math.round((marked_up_labor - install_total) + Math.round(fees_added));

        $('input#field_1366').val(marked_up_labor);
        $('input#field_1580').val(more_fees_to_add);
      });

      // survey cost changed
      $('input#field_1363').change(function () {
        var survey_cost = $(this).val();
        var subcontractor_cost = document.querySelector('input#field_1364').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var margin = document.querySelector('text#field_1365').value; // ⚠ likely wrong selector
        var marked_up_labor = Math.round(total_cost / (1 - margin));

        $('input#field_1366').val(marked_up_labor);
        $('input#field_1365').keyup();
      });

      // marked up labor changed -> update margin
      $('input#field_1366').change(function () {
        var marked_up_labor = $(this).val();
        var survey_cost = document.querySelector('input#field_1363').value;
        var subcontractor_cost = document.querySelector('input#field_1364').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var margin = Math.abs(Math.round(marked_up_labor - total_cost) / marked_up_labor);
        var margin_rounded = Math.round((margin + Number.EPSILON) * 100) / 100;

        $('input#field_1365').val(margin_rounded);
        $('input#field_1365').keyup();
      });

      // margin changed -> update marked up labor
      $('input#field_1365').change(function () {
        var margin = $(this).val();
        var survey_cost = document.querySelector('input#field_1363').value;
        var subcontractor_cost = document.querySelector('input#field_1364').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var marked_up_labor = Math.round(total_cost / (1 - margin));

        $('input#field_1366').val(marked_up_labor);
        $('input#field_1366').keyup();
      });

    }, 1);
  }, 'mcgandy-experiment');
})();
/*** END FEATURE: McGandy’s Experiment ********************************************************************/


/**************************************************************************************************
 * FEATURE: Instructions placement (move .kn-instructions under labels)
 ***********************************************************************************************/
(function instructionsPlacement_allForms() {
  $(document).on('knack-view-render.form', function (event, view, data) {
    $("#" + view.key + " .kn-instructions").each(function () {
      var inputLabel = $(this).closest(".kn-input").find(".kn-label");
      $(this).insertAfter(inputLabel);
    });
  });
})();
/*** END FEATURE: Instructions placement ***************************************************************/

/**************************************************************************************************
 * FEATURE: Quote / publish gating refresh & scroll preservation (legacy bundle)
 * - Contains multiple “rerender scene_view + restore scroll” handlers
 ***********************************************************************************************/

/** Submit quote details form when equipment table changes (view_2830 -> submit view_2833) */
(function submitFormOnCellUpdate_view2830() {
  $(document).ready(function () {
    $(document).on('knack-cell-update.view_2830', function (event, view, record) {
      var scrollPosition = $(window).scrollTop();

      $('#view_2833 button[type=submit]').submit();

      setTimeout(function () {
        $(window).scrollTop(scrollPosition);
      }, 2000);
    });
  });
})();

/** Force rerender on equipment table edits (view_2911) */
(function rerenderOnCellUpdate_view2911_restoreScroll() {
  $(document).ready(function () {
    $(document).on('knack-cell-update.view_2911', function (event, view, record) {
      var scrollPosition = $(window).scrollTop();
      Knack.router.scene_view.render();
      setTimeout(function () {
        $(window).scrollTop(scrollPosition);
      }, 2000);
    });
  });
})();

/** Force rerender on drops table edits (view_2835) */
(function rerenderOnCellUpdate_view2835_restoreScroll() {
  $(document).ready(function () {
    $(document).on('knack-cell-update.view_2835', function (event, view, record) {
      var scrollPosition = $(window).scrollTop();
      Knack.router.scene_view.render();
      setTimeout(function () {
        $(window).scrollTop(scrollPosition);
      }, 500);
    });
  });
})();

/** Enhanced scroll anchoring for view_2835 changes (uses requestAnimationFrame) */
(function rerenderAndScrollTo_view2835_onFieldChange() {
  $(document).ready(function () {
    let previousFieldValue = null;
    let scrolling = false;

    function scrollToView2835() {
      const $v = $("#view_2835");
      if (!$v.length) return false;
      window.scrollTo(0, $v.offset().top);
      return true;
    }

    $(document).on("knack-cell-update.view_2835", function (event, view, record) {
      const currentFieldValue = record.field_60;

      if (previousFieldValue === null) previousFieldValue = currentFieldValue;
      if (previousFieldValue === currentFieldValue) return;

      previousFieldValue = currentFieldValue;

      if (scrolling) return;
      scrolling = true;

      Knack.router.scene_view.render();

      requestAnimationFrame(() => {
        scrollToView2835();
        requestAnimationFrame(() => {
          scrollToView2835();
          setTimeout(() => {
            scrollToView2835();
            scrolling = false;
          }, 200);
        });
      });
    });
  });
})();

/** Enhanced rerender for view_2911 changes only when certain fields change */
(function rerenderOnWatchedFields_view2911() {
  $(document).ready(function () {
    const watchedFields = ["field_128", "field_129", "field_301"];
    const prevByRecordId = {};
    let scrolling = false;

    function scrollToView2911() {
      const $v = $("#view_2911");
      if (!$v.length) return false;
      const headerOffset = 0;
      window.scrollTo(0, $v.offset().top - headerOffset);
      return true;
    }

    function getRecordId(record) {
      return record && (record.id || record._id || record.record_id);
    }

    function snapshot(record) {
      const snap = {};
      watchedFields.forEach((f) => { snap[f] = record ? record[f] : undefined; });
      return snap;
    }

    function changed(prevSnap, nextSnap) {
      if (!prevSnap) return true;
      return watchedFields.some((f) => prevSnap[f] !== nextSnap[f]);
    }

    $(document).on("knack-cell-update.view_2911", function (event, view, record) {
      const rid = getRecordId(record);
      if (!rid) return;

      const nextSnap = snapshot(record);
      const prevSnap = prevByRecordId[rid];

      if (!changed(prevSnap, nextSnap)) return;

      prevByRecordId[rid] = nextSnap;

      if (scrolling) return;
      scrolling = true;

      Knack.router.scene_view.render();

      requestAnimationFrame(() => {
        scrollToView2911();
        requestAnimationFrame(() => {
          scrollToView2911();
          setTimeout(() => {
            scrollToView2911();
            scrolling = false;
          }, 250);
        });
      });
    });
  });
})();

/*** END FEATURE: Quote/publish gating refresh bundle ******************************************************/
/*************  Exception Grid: hide if empty, warn if any records  ************************/
(function () {
  'use strict';

  const VIEW_PAIRS = [
    { primary: 'view_3364', follow: 'view_3359' },
    { primary: 'view_3466', follow: 'view_3467' },
  ];

  const EVENT_NS = '.scwExceptionGrid';
  const WARNING_BG = '#7a0f16';
  const WARNING_FG = '#ffffff';
  const RADIUS = 20;

  /* ── look-ups keyed by view id ── */
  const pairByPrimary = {};
  const pairByFollow  = {};
  VIEW_PAIRS.forEach(function (p) {
    pairByPrimary[p.primary] = p;
    pairByFollow[p.follow]   = p;
  });

  function injectCssOnce() {
    const id = 'scw-exception-grid-css';
    if (document.getElementById(id)) return;

    const css = VIEW_PAIRS.map(function (p) {
      return `
      #${p.primary}.scw-exception-grid-active:has(.ktlHideShowButton){
        margin-bottom: 0px !important;
        background-color: ${WARNING_BG} !important;
        max-width: 100% !important;

        border-top-left-radius: ${RADIUS}px !important;
        border-top-right-radius: ${RADIUS}px !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;

        overflow: hidden !important;
      }

      #${p.primary}.scw-exception-grid-active .ktlHideShowButton{
        position: relative !important;
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
	font-size: 12px !important;
	font-weight: 400 !important;

        width: 100% !important;
        background-color: ${WARNING_BG} !important;
        color: ${WARNING_FG} !important;

        padding: 12px 56px 12px 18px !important;
        border: 0 !important;
        box-shadow: none !important;
        box-sizing: border-box !important;

        border-top-left-radius: ${RADIUS}px !important;
        border-top-right-radius: 0 !important;
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
      }

      #${p.primary}.scw-exception-grid-active .ktlHideShowButton *{
        color: ${WARNING_FG} !important;
      }

      /* LEFT icon – centered */
      #${p.primary}.scw-exception-grid-active .ktlHideShowButton::before{
        content: "\u26A0\uFE0F";
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.1em;
        line-height: 1;
        transform: translateY(-.02em);
        margin-right: 12px;
      }

      /* RIGHT icon – positioned */
      #${p.primary}.scw-exception-grid-active .ktlHideShowButton::after{
        content: "\u26A0\uFE0F";
        position: absolute;
        right: 32px;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 1.1em;
        line-height: 1;
        pointer-events: none;
      }

      #${p.primary}.scw-exception-grid-active .ktlHideShowButton .ktlArrow{
        position: absolute;
        right: 12px;
        top: 0;
        bottom: 0;
        margin: auto 0;
        height: 1em;
      }

      #${p.primary}.scw-exception-grid-active .ktlHideShowButton:hover{
        filter: brightness(1.06);
      }

      #${p.follow}.scw-exception-follow-connected{
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
      }`;
    }).join('\n');

    const style = document.createElement('style');
    style.id = id;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function removeOnlyPrimaryView(pair) {
    $('#' + pair.primary).remove();
    syncFollowView(pair, false);
  }

  function syncFollowView(pair, active) {
    const $follow = $('#' + pair.follow);
    if (!$follow.length) return;
    $follow.toggleClass('scw-exception-follow-connected', !!active);
  }

  function gridHasRealRows($view) {
    const $rows = $view.find('tbody tr');
    if (!$rows.length) return false;
    return !$rows.filter('.kn-tr-nodata').length;
  }

  function markPrimaryActive(pair) {
    const $primary = $('#' + pair.primary);
    if (!$primary.length) return;
    $primary.addClass('scw-exception-grid-active');
    syncFollowView(pair, true);
  }

  function handlePrimary(view, data) {
    if (!view) return;
    const pair = pairByPrimary[view.key];
    if (!pair) return;

    const $primary = $('#' + pair.primary);
    if (!$primary.length) return;

    if (data && typeof data.total_records === 'number') {
      if (data.total_records === 0) removeOnlyPrimaryView(pair);
      else markPrimaryActive(pair);
      return;
    }

    if (gridHasRealRows($primary)) markPrimaryActive(pair);
    else removeOnlyPrimaryView(pair);
  }

  function syncIfFollowRendersLater(view) {
    if (!view) return;
    const pair = pairByFollow[view.key];
    if (!pair) return;
    const active = $('#' + pair.primary).hasClass('scw-exception-grid-active');
    syncFollowView(pair, active);
  }

  injectCssOnce();

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view, data) {
      handlePrimary(view, data);
      syncIfFollowRendersLater(view);
    });
})();
/*************  Exception Grid: hide if empty, warn if any records  **************************/
////************* DTO: Unified Products (field_2246) from 2193/2194/2195 *************////
(function () {
  "use strict";

  // ======================
  // CONFIG
  // ======================
  const EVENT_NS = ".scwUnifiedProducts";
  const CONFIG = {
    SCENES: [], // e.g. ['scene_123'] or leave [] for all scenes
    VIEWS: ["view_3329","view_3544","view_3451"],

    // parent product fields
    PARENTS: ["field_2193", "field_2194", "field_2195"],

    // unified field
    UNIFIED: "field_2246",

    // bucket field: when this changes, clear ALL parents + unified
    RESET_ON_FIELD: "field_2223",

    // If unified is SINGLE connection, pick first non-empty in this order:
    SINGLE_PRIORITY: ["field_2193", "field_2194", "field_2195"],

    // Hide unified visually but keep it in the DOM
    HIDE_UNIFIED_FIELD: true,

    DEBUG: false
  };

  // ======================
  // UTILS
  // ======================
  function log(...args) {
    if (CONFIG.DEBUG && window.console) console.log("[scwUnified2246]", ...args);
  }

  function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
  }

  function asArray(v) {
    if (!v) return [];
    return Array.isArray(v) ? v.filter(Boolean) : [v].filter(Boolean);
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function inAllowedScene(sceneKey) {
    if (!CONFIG.SCENES || !CONFIG.SCENES.length) return true;
    return CONFIG.SCENES.includes(sceneKey);
  }

  // ======================
  // DOM HELPERS
  // ======================
  function $viewRoot(viewId) {
    return $(`#${viewId}`);
  }

  function getSelect($view, viewId, fieldKey) {
    // Standard Knack form select id: `${viewId}-${fieldKey}`
    return $view.find(`#${viewId}-${fieldKey}`).first();
  }

  function getHiddenConn($view, fieldKey) {
    // Hidden "connection" input that Knack submits
    return $view.find(`#kn-input-${fieldKey} input.connection[name='${fieldKey}']`).first();
  }

  function isMultiSelect($select) {
    return !!$select.prop("multiple");
  }

  function chosenUpdate($select) {
    // Chosen legacy + newer event names
    $select.trigger("liszt:updated");
    $select.trigger("chosen:updated");
  }

  function encodeConnValue(ids, isMulti) {
    const payload = isMulti ? ids : (ids[0] || "");
    return encodeURIComponent(JSON.stringify(payload));
  }

  function readSelectedIdToLabelMap($select) {
    const out = {};
    if (!$select || !$select.length) return out;

    $select.find("option:selected").each(function () {
      const id = $(this).attr("value") || "";
      const label = ($(this).text() || "").trim();
      if (id) out[id] = label || id;
    });

    return out;
  }

  function mergeMaps(...maps) {
    const out = {};
    maps.forEach((m) => {
      Object.keys(m || {}).forEach((k) => {
        if (!out[k]) out[k] = m[k];
      });
    });
    return out;
  }

  function ensureOptions($unifiedSelect, idToLabel) {
    if (!$unifiedSelect || !$unifiedSelect.length) return;

    Object.keys(idToLabel).forEach((id) => {
      if (!$unifiedSelect.find(`option[value="${id}"]`).length) {
        const label = idToLabel[id] || id;
        $unifiedSelect.append(new Option(label, id, false, false));
      } else {
        const $opt = $unifiedSelect.find(`option[value="${id}"]`).first();
        if (!($opt.text() || "").trim()) $opt.text(idToLabel[id] || id);
      }
    });
  }

  // Hide unified input row visually, without removing it from DOM
  function safeHideUnifiedField($view) {
    if (!CONFIG.HIDE_UNIFIED_FIELD) return;

    const $wrap = $view.find(`#kn-input-${CONFIG.UNIFIED}`).first();
    if (!$wrap.length) return;

    $wrap.css({
      position: "absolute",
      left: "-99999px",
      top: "auto",
      width: "1px",
      height: "1px",
      overflow: "hidden"
    });

    $wrap.find(".chzn-container, .chosen-container").css({
      position: "absolute",
      left: "-99999px",
      top: "auto",
      width: "1px",
      height: "1px",
      overflow: "hidden"
    });
  }

  // ======================
  // CORE: set unified based on parents
  // ======================
  function computeUnionIdsAndLabels($view, viewId) {
    const parentSelects = CONFIG.PARENTS.map((fk) => [fk, getSelect($view, viewId, fk)]);
    const maps = parentSelects.map(([, $sel]) => readSelectedIdToLabelMap($sel));
    const idToLabel = mergeMaps(...maps);

    const unionIds = uniq(Object.keys(idToLabel));

    return { unionIds, idToLabel };
  }

  function computeSinglePick(unionIds, $view, viewId) {
    for (const fk of CONFIG.SINGLE_PRIORITY) {
      const $sel = getSelect($view, viewId, fk);
      const ids = asArray($sel.val());
      if (ids.length) return [ids[0]];
    }
    return unionIds.length ? [unionIds[0]] : [];
  }

  function setUnifiedFromParents($view, viewId) {
    const $unifiedSelect = getSelect($view, viewId, CONFIG.UNIFIED);
    const $unifiedHidden = getHiddenConn($view, CONFIG.UNIFIED);

    if (!$unifiedSelect.length || !$unifiedHidden.length) {
      log("Missing unified select/hidden for", CONFIG.UNIFIED);
      return;
    }

    const { unionIds, idToLabel } = computeUnionIdsAndLabels($view, viewId);

    if (!unionIds.length) {
      const isMulti = isMultiSelect($unifiedSelect);
      const encodedClear = encodeConnValue([], isMulti);

      $unifiedSelect.val(isMulti ? [] : "").trigger("change");
      $unifiedHidden.val(encodedClear).trigger("change");
      chosenUpdate($unifiedSelect);
      return;
    }

    const unifiedIsMulti = isMultiSelect($unifiedSelect);
    const finalIds = unifiedIsMulti ? unionIds : computeSinglePick(unionIds, $view, viewId);

    ensureOptions($unifiedSelect, idToLabel);

    $unifiedSelect.val(unifiedIsMulti ? finalIds : (finalIds[0] || "")).trigger("change");

    const encoded = encodeConnValue(finalIds, unifiedIsMulti);
    $unifiedHidden.val(encoded).trigger("change");

    chosenUpdate($unifiedSelect);

    log("Unified set", { unifiedIsMulti, finalIds, encoded });
  }

  // ======================
  // CLEAR HELPERS
  // ======================
  function clearConnField($view, viewId, fieldKey) {
    const $sel = getSelect($view, viewId, fieldKey);
    const $hidden = getHiddenConn($view, fieldKey);

    // Parent fields might not have the hidden connection input in the same shape as UNIFIED,
    // but if it exists we clear it too.
    const hasSelect = $sel && $sel.length;
    const hasHidden = $hidden && $hidden.length;

    if (!hasSelect && !hasHidden) return;

    let isMulti = false;
    if (hasSelect) isMulti = isMultiSelect($sel);

    const clearedVal = isMulti ? [] : "";

    if (hasSelect) {
      $sel.val(clearedVal).trigger("change");
      chosenUpdate($sel);
    }

    if (hasHidden) {
      const encodedClear = encodeConnValue([], isMulti);
      $hidden.val(encodedClear).trigger("change");
    }

    log("Cleared field", fieldKey);
  }

  function clearUnifiedField($view, viewId) {
    clearConnField($view, viewId, CONFIG.UNIFIED);
  }

  function clearAllParents($view, viewId) {
    CONFIG.PARENTS.forEach((fk) => clearConnField($view, viewId, fk));
  }

  function clearParentsAndUnified($view, viewId) {
    clearAllParents($view, viewId);
    clearUnifiedField($view, viewId);
  }

  // ======================
  // BINDING
  // ======================
  function bind(viewId) {
    const $view = $viewRoot(viewId);
    if (!$view.length) return;

    safeHideUnifiedField($view);

    const sync = debounce(() => setUnifiedFromParents($view, viewId), 80);

    // ✅ RESET: when bucket changes, clear ALL parent product fields AND unified
    if (CONFIG.RESET_ON_FIELD) {
      const $bucket = getSelect($view, viewId, CONFIG.RESET_ON_FIELD);
      if ($bucket.length) {
        $bucket
          .off(`change${EVENT_NS}-reset`)
          .on(`change${EVENT_NS}-reset`, function () {
            clearParentsAndUnified($view, viewId);

            // optional: one more pass to ensure unified stays cleared
            // (since parents are now empty, sync will clear unified anyway)
            sync();
          });
      }
    }

    // Bind to parent field changes only (your sequencing request)
    CONFIG.PARENTS.forEach((fk) => {
      const $sel = getSelect($view, viewId, fk);
      if (!$sel.length) return;

      $sel.off(`change${EVENT_NS}`).on(`change${EVENT_NS}`, sync);
      $sel.off(`blur${EVENT_NS}`).on(`blur${EVENT_NS}`, sync);
    });

    // Initial pass (will clear unified unless parents already have values)
    sync();
  }

  // Enable on view render
  $(document).on(`knack-scene-render.any${EVENT_NS}`, function (event, scene) {
    if (!inAllowedScene(scene.key)) return;

    CONFIG.VIEWS.forEach((viewId) => {
      $(document)
        .off(`knack-view-render.${viewId}${EVENT_NS}`)
        .on(`knack-view-render.${viewId}${EVENT_NS}`, function () {
          bind(viewId);
        });
    });
  });
})();
// ============================================================
// Force specific fields to always display as negative numbers
// Targets: field_2301, field_2290
// ==========================================================
(function () {
  var FIELDS = ['field_2301', 'field_2290','field_2267','field_2303','field_2262'];

  function processCell($el) {
    if ($el.data('scwNeg')) return;
    var raw = $el.text().replace(/[^0-9.\-]/g, '');
    var num = parseFloat(raw);
    if (!isFinite(num) || num === 0) return;
    var abs = Math.abs(num);
    var formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $el.html('<span class="scw-force-neg">-$' + formatted + '</span>');
    $el.data('scwNeg', true);
  }

  function forceNegative() {
    FIELDS.forEach(function (fieldClass) {
      // Table cells
      $('td.' + fieldClass).each(function () { processCell($(this)); });
      // Detail views
      $('.kn-detail.' + fieldClass + ' .kn-detail-body').each(function () { processCell($(this)); });
    });
  }

  $(document).on('knack-scene-render.any', forceNegative);
  $(document).on('knack-view-render.any', forceNegative);
  $(document).on('knack-records-render.any', forceNegative);
})();
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
    try {
      if (Knack.views[viewId] && Knack.views[viewId].model && typeof Knack.views[viewId].model.fetch === 'function') {
        Knack.views[viewId].model.fetch();
      }
    } catch (e) {
      console.warn('[scw-refresh-on-edit] Could not refresh ' + viewId, e);
    }
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
////************* SCW: FORM BUCKET → FIELD VISIBILITY (KTL rebuild-proof) *************////
(function () {
  'use strict';

  // ============================================================
  // CONFIG (multi-form ready)
  // ============================================================
  const EVENT_NS = '.scwBucketRules';
  const OBS_NS   = '.scwBucketRulesObserver';

  const FORMS = [
    {
      viewKey: 'view_466',
      bucketFieldKey: 'field_133',

      bucketRulesHuman: {

//cameras or readers
        '6481e5ba38f283002898113c': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_56','INPUT_sku'],
          ['field_57','INPUT_description'],
          ['field_74','INPUT_default quantity'],
          ['field_146','INPUT_retail price'],
          ['field_1562','FLAG_eligible for discount'],
          ['field_1926','INPUT_source'],
          ['field_2021','INPUT_default labor description'],
          ['field_2166','INPUT_default sub bid'],
          ['field_1517','INPUT_default installation hours'],
          ['field_2220','FLAG_deliverables schema'],
        ],

//networking or headend
        '647953bb54b4e1002931ed97': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_56','INPUT_sku'],
          ['field_57','INPUT_description'],
          ['field_74','INPUT_default quantity'],
          ['field_146','INPUT_retail price'],
          ['field_1562','FLAG_eligible for discount'],
          ['field_1926','INPUT_source'],
          ['field_2021','INPUT_default labor description'],
          ['field_2166','INPUT_default sub bid'],
          ['field_1517','INPUT_default installation hours'],
          ['field_2220','FLAG_deliverables schema'],
          ['field_2232','FLAG: map incoming camera or reader connections'],
          ['field_2242','FLAG_limit to quantity 1'],
        ],

//other equipment
        '5df12ce036f91b0015404d78': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_56','INPUT_sku'],
          ['field_57','INPUT_description'],
          ['field_74','INPUT_default quantity'],
          ['field_146','INPUT_retail price'],
          ['field_1562','FLAG_eligible for discount'],
          ['field_1926','INPUT_source'],
          ['field_2021','INPUT_default labor description'],
          ['field_2166','INPUT_default sub bid'],
          ['field_1517','INPUT_default installation hours'],
          ['field_2220','FLAG_deliverables schema'],
        ],

//mounting hardware
        '594a94536877675816984cb9': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_56','INPUT_sku'],
          ['field_57','INPUT_description'],
          ['field_74','INPUT_default quantity'],
          ['field_146','INPUT_retail price'],
          ['field_1562','FLAG_eligible for discount'],
          ['field_1926','INPUT_source'],
        ],

//other services
        '6977caa7f246edf67b52cbcd': [],

//assumptions
        '697b7a023a31502ec68b3303': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_2021','INPUT_default labor description'],
        ],

//licenses
        '645554dce6f3a60028362a6a': [
          ['field_133','REL_equipment bucket'],
          ['field_956','FLAG_product status'],
          ['field_1563','FLAG_type of system'],
          ['field_35','INPUT_product name'],
          ['field_56','INPUT_sku'],
          ['field_57','INPUT_description'],
          ['field_74','INPUT_default quantity'],
          ['field_146','INPUT_retail price'],
          ['field_1562','FLAG_eligible for discount'],
          ['field_1926','INPUT_source'],
        ],
      },

      allFieldKeys: [
        'field_35','field_56','field_57','field_2021','field_133','field_146','field_2166','field_956','field_1926','field_2232',
        'field_2242','field_1562','field_2205','field_2236','field_974','field_2220','field_1655','field_1563','field_1841','field_74',
        'field_1667','field_1554','field_1582','field_1754','field_1755','field_1909','field_1928','field_1517','field_2075','field_2249',
      ],
    },
  ];

  // ============================================================
  // Helpers
  // ============================================================
  function compileRules(human) {
    const out = {};
    Object.keys(human || {}).forEach((bucket) => {
      out[bucket] = (human[bucket] || [])
        .map((x) => (Array.isArray(x) ? x[0] : x))
        .filter(Boolean);
    });
    return out;
  }

  function viewRoots(cfg) {
    // We will re-init against BOTH the Knack view and the KTL wrapper.
    // KTL can move/rebuild the form, so we treat either as valid roots.
    return [
      `#${cfg.viewKey}`,
      `.hideShow_${cfg.viewKey}`,
    ];
  }

  function findActiveScopes(cfg) {
    const roots = viewRoots(cfg).join(',');
    const $roots = $(roots);

    // Prefer a real <form> if present. Return 0..n scopes (because KTL may duplicate briefly).
    const scopes = [];
    $roots.each(function () {
      const $root = $(this);
      const $forms = $root.find('form');
      if ($forms.length) {
        $forms.each(function () { scopes.push($(this)); });
      } else if ($root.find('.kn-input').length) {
        scopes.push($root);
      }
    });

    // De-dupe by DOM node
    const seen = new Set();
    return scopes.filter(($s) => {
      const el = $s.get(0);
      if (!el || seen.has(el)) return false;
      seen.add(el);
      return true;
    });
  }

  function $wrap($scope, key) {
    // Works in your DOM (id="kn-input-field_35", data-input-id="field_35")
    let $w = $scope.find('#kn-input-' + key);
    if ($w.length) return $w;
    $w = $scope.find('.kn-input[data-input-id="' + key + '"]');
    if ($w.length) return $w;
    return $();
  }

  // ============================================================
  // HARD OVERRIDE VISIBILITY (inline style)
  // ============================================================
  function forceHide($scope, key) {
    const $w = $wrap($scope, key);
    if ($w.length) $w.css('display', 'none');
  }

  function forceShow($scope, key) {
    const $w = $wrap($scope, key);
    if ($w.length) $w.css('display', '');
  }

  function hideAllExceptBucket($scope, cfg) {
    (cfg.allFieldKeys || []).forEach((k) => {
      if (k === cfg.bucketFieldKey) return;
      forceHide($scope, k);
    });
    forceShow($scope, cfg.bucketFieldKey);
  }

  function findBucketSelect($scope, cfg) {
    // Underlying select (hidden by Chosen) is still there and has the value (you confirmed .val() works).
    let $sel = $scope.find('#' + cfg.viewKey + '-' + cfg.bucketFieldKey);
    if ($sel.length) return $sel;
    $sel = $scope.find('select[name="' + cfg.bucketFieldKey + '"]');
    if ($sel.length) return $sel;
    return $();
  }

  function getBucketValue($scope, cfg) {
    const $sel = findBucketSelect($scope, cfg);
    return (($sel.val() || '') + '').trim();
  }

  function applyRulesToScope($scope, cfg) {
    const bucketValue = getBucketValue($scope, cfg);

    hideAllExceptBucket($scope, cfg);
    if (!bucketValue) return;

    const keys = cfg._compiledRules[bucketValue] || [];
    keys.forEach((k) => forceShow($scope, k));
  }

  // ============================================================
  // BINDINGS (delegated + chosen-safe)
  // ============================================================
  function bindChangeHandlers(cfg) {
    const roots = viewRoots(cfg).join(', ');
    const sel = `${roots} select[name="${cfg.bucketFieldKey}"], ${roots} #${cfg.viewKey}-${cfg.bucketFieldKey}`;

    // Underlying select change
    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $scopes = findActiveScopes(cfg);
        $scopes.forEach(($s) => applyRulesToScope($s, cfg));
      });

    // Chosen UI clicks can change value without firing a normal change immediately in some setups.
    // Re-apply after user interacts with the chosen container.
    $(document)
      .off('click' + EVENT_NS, `${roots} #${cfg.viewKey}_${cfg.bucketFieldKey}_chzn, ${roots} #${cfg.viewKey}_${cfg.bucketFieldKey}_chzn *`)
      .on('click' + EVENT_NS, `${roots} #${cfg.viewKey}_${cfg.bucketFieldKey}_chzn, ${roots} #${cfg.viewKey}_${cfg.bucketFieldKey}_chzn *`, function () {
        setTimeout(function () {
          const $scopes = findActiveScopes(cfg);
          $scopes.forEach(($s) => applyRulesToScope($s, cfg));
        }, 0);
      });
  }

  // ============================================================
  // INIT + RE-INIT (handles KTL “rebuild/move”)
  // ============================================================
  function initEverywhere(cfg) {
    if (!cfg._compiledRules) cfg._compiledRules = compileRules(cfg.bucketRulesHuman || {});
    bindChangeHandlers(cfg);

    const $scopes = findActiveScopes(cfg);
    if (!$scopes.length) return;

    $scopes.forEach(($s) => {
      applyRulesToScope($s, cfg);

      // KTL / Chosen / persistent forms: value can settle a beat later
      setTimeout(() => applyRulesToScope($s, cfg), 50);
      setTimeout(() => applyRulesToScope($s, cfg), 250);
      setTimeout(() => applyRulesToScope($s, cfg), 800);
    });
  }

  // ============================================================
  // MutationObserver: re-run when KTL rebuilds or moves nodes
  // ============================================================
  function installObservers() {
    // Single observer for the whole document (cheap enough)
    const target = document.body;
    if (!target) return;

    // Avoid double-install
    if (window.__scwBucketRulesObserverInstalled) return;
    window.__scwBucketRulesObserverInstalled = true;

    const obs = new MutationObserver(function (mutations) {
      // Only act if something relevant was added/removed
      for (const m of mutations) {
        if (!m.addedNodes || !m.addedNodes.length) continue;

        // If any mutation touches our view or KTL wrapper, re-init.
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;

          // quick checks (fast)
          if (node.id && typeof node.id === 'string' && node.id.startsWith('view_')) {
            FORMS.forEach(initEverywhere);
            return;
          }
          if (node.classList && [...node.classList].some((c) => c.startsWith('hideShow_view_'))) {
            FORMS.forEach(initEverywhere);
            return;
          }

          // deeper check: if it contains our view
          if (node.querySelector && (node.querySelector('#view_466') || node.querySelector('.hideShow_view_466'))) {
            FORMS.forEach(initEverywhere);
            return;
          }
        }
      }
    });

    obs.observe(target, { childList: true, subtree: true });

    // store for debugging if needed
    window.__scwBucketRulesObserver = obs;
  }

  // ============================================================
  // Hooks
  // ============================================================
  FORMS.forEach((cfg) => {
    $(document)
      .off('knack-view-render.' + cfg.viewKey + EVENT_NS)
      .on('knack-view-render.' + cfg.viewKey + EVENT_NS, function () {
        initEverywhere(cfg);
      });
  });

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      FORMS.forEach(initEverywhere);
    });

  // KTL toggles can rebuild without a Knack re-render
  $(document)
    .off('click' + EVENT_NS, '#hideShow_view_466_button, #hideShow_view_466_shrink_link')
    .on('click' + EVENT_NS, '#hideShow_view_466_button, #hideShow_view_466_shrink_link', function () {
      setTimeout(() => FORMS.forEach(initEverywhere), 50);
    });

  // Boot
  installObservers();
  $(function () { FORMS.forEach(initEverywhere); });
  setTimeout(() => FORMS.forEach(initEverywhere), 250);
  setTimeout(() => FORMS.forEach(initEverywhere), 1000);
})();
////************* /SCW: FORM BUCKET → FIELD VISIBILITY *************////
////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3544']; // add more views
  const BUCKET_FIELD_KEY = 'field_2223';
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID = 'scw-bucket-visibility-css-survey-bid';

  // Readable mapping
  const BUCKET_RULES_HUMAN = {
    //cameras or readers
    '6481e5ba38f283002898113c': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2211', 'REL_mdf-idf_mandatory single select'],
      ['field_2193', 'REL_products_cameras+cabling'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2241', 'INPUT_DROP: Pre-fix'],
      ['field_2184', 'INPUT_DROP: label number'],
      ['field_2186', 'INPUT_DROP: mount_cable_both'],
      ['field_2187', 'INPUT_DROP: variables'],
      ['field_2432', 'INPUT_survey notes'],
      ['field_2233', 'INPUT_expected sub bid #'],
      ['field_2246', 'REL_unified product field'],
    ],
    //networking or headend
    '647953bb54b4e1002931ed97': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2180', 'REL_mdf-idf_mandatory multi select'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2194', 'REL_products_for networking'],
      ['field_2233', 'INPUT_expected sub bid #'],
      ['field_2432', 'INPUT_survey notes'],
    ],
    //other equipment
    '5df12ce036f91b0015404d78': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2195', 'REL_products_for other equipment'],
      ['field_2233', 'INPUT_expected sub bid #'],
      ['field_2432', 'INPUT_survey notes'],
      ['field_2246', 'REL_unified product field'],
      ['field_2183', 'INPUT_product quantity'],
    ],
    //service
    '6977caa7f246edf67b52cbcd': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2233', 'INPUT_expected sub bid #'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2210', 'INPUT_service description'],
      ['field_2432', 'INPUT_survey notes'],
    ],
    //assumptions
    '697b7a023a31502ec68b3303': [
      ['field_2181', 'REL_project'],
      ['field_2427', 'REL_bid'],
      ['field_2250', 'REL_mdf-idf optional multi-select'],
      ['field_2210', 'INPUT_service description'],
      ['field_2432', 'INPUT_survey notes'],
    ],
    //licenses
    '645554dce6f3a60028362a6a': [
      ['field_2427', 'REL_bid'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2224', 'REL_products for licenses'],
    ],
  };

  const ALL_FIELD_KEYS = [
    'field_2427','field_2180','field_2194','field_2183','field_2210','field_2224','field_2248','field_2250','field_2432','field_2181',
    'field_2206','field_2195','field_2241','field_2184','field_2186','field_2187','field_2211','field_2233','field_2246',
  ];

  function compileRules(human) {
    const out = {};
    Object.keys(human || {}).forEach((bucket) => {
      out[bucket] = (human[bucket] || [])
        .map((x) => (Array.isArray(x) ? x[0] : x))
        .filter(Boolean);
    });
    return out;
  }
  const BUCKET_RULES = compileRules(BUCKET_RULES_HUMAN);

  // ============================================================
  // ✅ EARLY CSS: inject immediately so there’s no initial “flash”
  // ============================================================
  function injectGlobalCssOnce() {
    let el = document.getElementById(CSS_ID);
    if (el) return;

    el = document.createElement('style');
    el.id = CSS_ID;

    // Hide all fields inside the target views immediately.
    // Then only show ones marked scw-visible, plus the bucket input failsafe.
    const blocks = VIEW_IDS.map((viewId) => `
#${viewId} .kn-input { display: none !important; }
#${viewId} .kn-input.scw-visible { display: block !important; }
#${viewId} #kn-input-${BUCKET_FIELD_KEY} { display: block !important; } /* bucket always visible */
    `.trim()).join('\n\n');

    el.appendChild(document.createTextNode('\n' + blocks + '\n'));
    document.head.appendChild(el);
  }

  // Run ASAP (before Knack paints the view)
  injectGlobalCssOnce();

  // ======================
  // DOM helpers
  // ======================
  function $wrapForKeyWithinScope($scope, key) {
    let $w = $scope.find('#kn-input-' + key);
    if ($w.length) return $w;

    $w = $scope.find('.kn-input[data-input-id="' + key + '"]');
    if ($w.length) return $w;

    return $();
  }

  function hideField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.removeClass('scw-visible');
  }

  function showField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.addClass('scw-visible');
  }

  function hideAllExceptBucket($scope) {
    ALL_FIELD_KEYS.forEach((k) => {
      if (k === BUCKET_FIELD_KEY) return;
      hideField($scope, k);
    });
    showField($scope, BUCKET_FIELD_KEY);
  }

  function findBucketSelectInScope($scope, viewId) {
    let $sel = $scope.find('#' + viewId + '-' + BUCKET_FIELD_KEY);
    if ($sel.length) return $sel;
    return $scope.find('select[name="' + BUCKET_FIELD_KEY + '"]');
  }

  function getBucketValue($scope, viewId) {
    const $sel = findBucketSelectInScope($scope, viewId);
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, viewId) {
    const bucketValue = getBucketValue($scope, viewId);

    hideAllExceptBucket($scope);
    if (!bucketValue) return;

    (BUCKET_RULES[bucketValue] || []).forEach((k) => showField($scope, k));
  }

  // ======================
  // Binding strategy
  // ======================
  function bindDelegatedChange(viewId) {
    const sel = `#${viewId} select[name="${BUCKET_FIELD_KEY}"], #${viewId} #${viewId}-${BUCKET_FIELD_KEY}`;

    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $bucketWrap = $(this).closest('.kn-input');
        const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
          ? $bucketWrap.closest('form, .kn-form, .kn-view')
          : $('#' + viewId);

        applyRules($scope, viewId);
      });
  }

  function initView(viewId) {
    bindDelegatedChange(viewId);

    const $view = $('#' + viewId);
    const $bucketWrap = $view.find('#kn-input-' + BUCKET_FIELD_KEY);
    const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
      ? $bucketWrap.closest('form, .kn-form, .kn-view')
      : $view;

    applyRules($scope, viewId);
  }

  VIEW_IDS.forEach((viewId) => {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        initView(viewId);
      });
  });
})();

////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////


/* ── Style Detail Labels ─────────────────────────────────────────────
 *  Adds custom styling to .kn-detail-label elements within specified scenes.
 *  To apply the style to additional scenes, add the scene ID to the array below.
 * ──────────────────────────────────────────────────────────────────── */
(function styleDetailLabels() {
  var SCENE_IDS = [
    'scene_1096',
  ];

  var CSS_ID = 'scw-detail-label-css';

  function injectCSS() {
    if (document.getElementById(CSS_ID)) return;

    var selectors = SCENE_IDS.map(function (id) {
      return '#kn-' + id + ' .kn-detail-label';
    }).join(',\n');

    var style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent =
      selectors + ' {\n' +
      '  background-color: aliceblue;\n' +
      '  width: 15%;\n' +
      '  text-align: center;\n' +
      '  vertical-align: middle;\n' +
      '}\n';
    document.head.appendChild(style);
  }

  SCENE_IDS.forEach(function (sceneId) {
    SCW.onSceneRender(sceneId, injectCSS, 'styleDetailLabels');
  });
})();
/***************************** GOOGLE TAG MANAGER — SCENE-SPECIFIC INJECTION ****************************/
(function () {
  var GTM_ID = "GTM-5XL9S9J";
  var SCENES = ["scene_1096","scene_828","scene_833"];

  var headInjected = false;

  function injectHead() {
    if (headInjected) return;
    if (document.getElementById("gtm-head-script")) return;
    headInjected = true;

    var script = document.createElement("script");
    script.id = "gtm-head-script";
    script.textContent =
      "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':" +
      "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0]," +
      "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=" +
      "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);" +
      "})(window,document,'script','dataLayer','" + GTM_ID + "');";

    // Insert as high in <head> as possible
    var first = document.head.firstChild;
    if (first) {
      document.head.insertBefore(script, first);
    } else {
      document.head.appendChild(script);
    }
  }

  function injectBody() {
    if (document.getElementById("gtm-body-noscript")) return;

    var ns = document.createElement("noscript");
    ns.id = "gtm-body-noscript";
    ns.innerHTML =
      '<iframe src="https://www.googletagmanager.com/ns.html?id=' + GTM_ID + '"' +
      ' height="0" width="0" style="display:none;visibility:hidden"></iframe>';

    // Insert immediately after the opening <body> tag
    var first = document.body.firstChild;
    if (first) {
      document.body.insertBefore(ns, first);
    } else {
      document.body.appendChild(ns);
    }
  }

  SCENES.forEach(function (sceneId) {
    $(document).on("knack-scene-render." + sceneId, function () {
      injectHead();
      injectBody();
    });
  });
})();
/***************************** GOOGLE TAG MANAGER — SCENE-SPECIFIC INJECTION *******************************/
// src/features/jotform-embed-sow-photos.js
// ---------------------------------------------------------------------------
//// Embeds JotForm "Bulk Add Photos" forms in a modal overlay, pre-populating
// a hidden JotForm field with the current record ID.
//
// Configurable for multiple views — each entry in FORM_CONFIGS defines
// the target view, JotForm form, hidden field name, and URL-hash pattern
// used to extract the record ID.
// ---------------------------------------------------------------------------
(function jotformEmbedSowPhotos() {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────────
  var MODAL_ID  = 'scw-jotform-modal';
  var STYLE_ID  = 'scw-jotform-modal-css';

  var FORM_CONFIGS = [
    {
      menuViewId:    'view_3482',
      linkText:      'Bulk Add Photos',
      jotformId:     '260564849468170',
      fieldName:     'sowID',
      hashPattern:   /scope-of-work-details\/([a-f0-9]{24})/
    },
    {
      menuViewId:    'view_3532',
      linkText:      'Bulk Add Photos',
      jotformId:     '260564849468170',
      fieldName:     'surveyID',
      hashPattern:   /site-survey-request-details\/([a-f0-9]{24})/
    }
  ];

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Extract a record ID from the current URL hash using the given pattern. */
  function getRecordId(hashPattern) {
    var hash = window.location.hash || '';
    var match = hash.match(hashPattern);
    return match ? match[1] : '';
  }

  /** Build the JotForm iframe URL with optional pre-population. */
  function buildJotformUrl(jotformId, fieldName, recordId) {
    var base = 'https://form.jotform.com/' + jotformId;
    if (recordId) {
      base += '?' + encodeURIComponent(fieldName) + '=' + encodeURIComponent(recordId);
    }
    return base;
  }

  // ── CSS (injected once) ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var M = '#' + MODAL_ID;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      M + ' {',
      '  position: fixed; top: 0; left: 0; width: 100%; height: 100%;',
      '  z-index: 10000; display: flex; align-items: center; justify-content: center;',
      '}',
      M + ' .scw-jf-backdrop {',
      '  position: absolute; top: 0; left: 0; width: 100%; height: 100%;',
      '  background: rgba(0,0,0,0.55);',
      '}',
      M + ' .scw-jf-dialog {',
      '  position: relative; width: 90%; max-width: 800px; height: 85vh;',
      '  background: #fff; border-radius: 6px; box-shadow: 0 4px 24px rgba(0,0,0,0.25);',
      '  display: flex; flex-direction: column; overflow: hidden;',
      '}',
      M + ' .scw-jf-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 10px 16px; background: #07467c;',
      '}',
      M + ' .scw-jf-header h3 {',
      '  margin: 0; font-size: 15px; font-weight: 600; color: #fff;',
      '}',
      M + ' .scw-jf-close {',
      '  background: none; border: none; font-size: 20px; cursor: pointer;',
      '  color: rgba(255,255,255,0.8); padding: 0 4px; line-height: 1;',
      '}',
      M + ' .scw-jf-close:hover { color: #fff; }',
      M + ' .scw-jf-body {',
      '  flex: 1; overflow: hidden; position: relative;',
      '}',
      // Loading spinner — sits behind the iframe, visible until form loads
      M + ' .scw-jf-loader {',
      '  position: absolute; top: 0; left: 0; width: 100%; height: 100%;',
      '  display: flex; flex-direction: column; align-items: center; justify-content: center;',
      '  background: #fff; color: #07467c;',
      '}',
      M + ' .scw-jf-spinner {',
      '  width: 36px; height: 36px; border: 3px solid #e0e0e0;',
      '  border-top-color: #07467c; border-radius: 50%;',
      '  animation: scwJfSpin .8s linear infinite;',
      '}',
      M + ' .scw-jf-loader span {',
      '  margin-top: 12px; font-size: 13px; color: #666;',
      '}',
      '@keyframes scwJfSpin { to { transform: rotate(360deg); } }',
      M + ' .scw-jf-body iframe {',
      '  position: relative; z-index: 1;',
      '  width: 100%; height: 100%; border: none;',
      '  opacity: 0; transition: opacity .25s ease;',
      '}',
      M + ' .scw-jf-body iframe.scw-jf-loaded {',
      '  opacity: 1;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Modal lifecycle ──────────────────────────────────────────────────────
  function openModal(jotformUrl) {
    // Prevent duplicates
    closeModal();
    injectStyles();

    var modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.innerHTML = [
      '<div class="scw-jf-backdrop"></div>',
      '<div class="scw-jf-dialog">',
      '  <div class="scw-jf-header">',
      '    <h3>Bulk Add Photos</h3>',
      '    <button class="scw-jf-close" title="Close">&times;</button>',
      '  </div>',
      '  <div class="scw-jf-body">',
      '    <div class="scw-jf-loader"><div class="scw-jf-spinner"></div><span>Loading form&hellip;</span></div>',
      '    <iframe src="' + jotformUrl + '" allowfullscreen></iframe>',
      '  </div>',
      '</div>',
    ].join('');

    document.body.appendChild(modal);

    // Hide loader once the iframe content is ready
    var iframe = modal.querySelector('iframe');
    iframe.addEventListener('load', function () {
      iframe.classList.add('scw-jf-loaded');
    });

    // Close handlers
    modal.querySelector('.scw-jf-backdrop').addEventListener('click', closeModal);
    modal.querySelector('.scw-jf-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', onEscKey);
  }

  function closeModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();
    document.removeEventListener('keydown', onEscKey);
  }

  function onEscKey(e) {
    if (e.key === 'Escape' || e.keyCode === 27) closeModal();
  }

  // ── Event binding ────────────────────────────────────────────────────────
  FORM_CONFIGS.forEach(function (cfg) {
    SCW.onViewRender(cfg.menuViewId, function (event, view) {
      // Find the menu link by its visible text instead of positional class
      var $link = $('#' + cfg.menuViewId).find('a.kn-link').filter(function () {
        return $(this).text().trim() === cfg.linkText;
      });
      if (!$link.length) return;

      // Replace the inline javascript: href with a safe no-op
      $link.attr('href', '#');

      $link.off('click.scwJotform').on('click.scwJotform', function (e) {
        e.preventDefault();
        e.stopPropagation();

        var recordId   = getRecordId(cfg.hashPattern);
        var jotformUrl = buildJotformUrl(cfg.jotformId, cfg.fieldName, recordId);

        openModal(jotformUrl);
      });
    }, 'jotformEmbed.' + cfg.menuViewId);
  });
})();
/*************  Edit Button on Grouped Headers – view_3561  **********************/
(function () {
  'use strict';

  var VIEW_ID = 'view_3561';
  var EVENT_NS = '.scwEditBtnGroupHeader';
  var CSS_ID = 'scw-edit-btn-group-header-css';
  var BUTTON_CLASS = 'scw-group-edit-btn';
  var LINK_COL_CLASS = 'knTableColumn__link';

  // ── CSS ──────────────────────────────────────────────────────────────
  function injectCssOnce() {
    if (document.getElementById(CSS_ID)) return;
    var style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = [
      '#' + VIEW_ID + ' td.' + LINK_COL_CLASS + ',',
      '#' + VIEW_ID + ' th.' + LINK_COL_CLASS + ' {',
      '  display: none !important;',
      '}',

      '.' + BUTTON_CLASS + ' {',
      '  display: inline-block;',
      '  margin-left: 10px;',
      '  padding: 2px 10px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  line-height: 1.6;',
      '  color: var(--scw-grp-accent, #295f91);',
      '  background: rgba(var(--scw-grp-accent-rgb, 41,95,145), .08);',
      '  border: 1px solid rgba(var(--scw-grp-accent-rgb, 41,95,145), .20);',
      '  border-radius: 4px;',
      '  cursor: pointer;',
      '  vertical-align: middle;',
      '  transition: background 120ms ease;',
      '}',
      '.' + BUTTON_CLASS + ':hover {',
      '  background: rgba(var(--scw-grp-accent-rgb, 41,95,145), .16);',
      '}',

      '#kn-input-field_2423 {',
      '  position: absolute !important;',
      '  left: -9999px !important;',
      '  height: 0 !important;',
      '  overflow: hidden !important;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function getEditHrefForGroup($headerRow) {
    // Walk subsequent rows until the next group header; grab the first edit link.
    var href = null;
    $headerRow.nextAll('tr').each(function () {
      var $tr = $(this);
      if ($tr.hasClass('kn-table-group')) return false; // stop at next group
      var $link = $tr.find('td.' + LINK_COL_CLASS + ' a.kn-link-page');
      if ($link.length) {
        href = $link.attr('href');
        return false;
      }
    });
    return href;
  }

  function addButtons() {
    var $view = $('#' + VIEW_ID);
    if (!$view.length) return;

    $view.find('tr.kn-table-group').each(function () {
      var $tr = $(this);
      if ($tr.find('.' + BUTTON_CLASS).length) return; // already added

      var href = getEditHrefForGroup($tr);
      if (!href) return;

      var $cell = $tr.children('td').first();
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = BUTTON_CLASS;
      btn.textContent = 'Edit';
      btn.setAttribute('data-href', href);
      $cell.append(btn);
    });
  }

  // ── Auto-select Survey Request in Add DOC_photo modal (view_3563) ───
  var ADD_PHOTO_VIEW = 'view_3563';

  function waitForFieldAndSelect(srId, attempts) {
    if (attempts <= 0) {
      console.log('[SCW] gave up after all attempts. srId=' + srId);
      return;
    }
    var $select = $('#' + ADD_PHOTO_VIEW + '-field_2423');
    var $option = $select.find('option[value="' + srId + '"]');

    if (!$option.length) {
      setTimeout(function () { waitForFieldAndSelect(srId, attempts - 1); }, 250);
      return;
    }

    var optionIndex = $option.index();

    // The Chosen container ID for this multi-select field
    // e.g. view_3563_field_2423_chzn
    var chznId = ADD_PHOTO_VIEW + '_field_2423_chzn';
    var $chosenContainer = $('#' + chznId);

    if (!$chosenContainer.length) {
      console.log('[SCW] Chosen container #' + chznId + ' not found');
      return;
    }

    // Activate the dropdown by clicking the search input
    $chosenContainer.find('.search-field input').trigger('focus').trigger('click');

    // Click the result item by its Chosen-generated ID (e.g. …_chzn_o_12)
    setTimeout(function () {
      var resultId = chznId + '_o_' + optionIndex;
      var $resultItem = $('#' + resultId);
      console.log('[SCW] clicking result #' + resultId + ', found=' + $resultItem.length + ', text=' + $resultItem.text());
      if ($resultItem.length) {
        $resultItem.trigger('mouseup');
      }
    }, 150);
  }

  // ── Click handler (delegated) ───────────────────────────────────────
  $(document)
    .off('click' + EVENT_NS, '.' + BUTTON_CLASS)
    .on('click' + EVENT_NS, '.' + BUTTON_CLASS, function (e) {
      e.preventDefault();
      e.stopPropagation();
      var href = $(this).attr('data-href');
      if (!href) return;

      // Grab the SR record ID from the current page URL before navigating
      var currentHash = window.location.hash || '';
      var srMatch = currentHash.match(/site-survey-request-details\/([a-f0-9]{24})/);
      var srId = srMatch ? srMatch[1] : '';
      console.log('[SCW] Edit clicked. hash=' + currentHash + ', srId=' + srId + ', href=' + href);

      window.location.hash = href.replace(/^#/, '');

      // Poll for the form + chosen options to be ready (up to ~5 seconds)
      if (srId) {
        waitForFieldAndSelect(srId, 20);
      }
    });

  // ── Init on view render ─────────────────────────────────────────────
  injectCssOnce();

  $(document).on('knack-view-render.' + VIEW_ID, function () {
    addButtons();
  });
})();
/*************  Edit Button on Grouped Headers – view_3561  **************************/
/*************  Inline Photo Rows – view_3512  **********************/
/**
 * After view_3512 renders, injects a photo-preview row beneath every
 * data row in the grid.
 *
 * Data is read entirely from the DOM — no API calls.
 *
 * For each line-item row we union the connected photo record IDs found
 * in two columns:
 *   - field_771  (PICs)           → span[id][data-kn="connection-value"] > img
 *   - field_2445 (CONFIG_photo type) → span[id][data-kn="connection-value"] > span
 *
 * Each photo record gets its own card showing:
 *   - The image (or an upload-placeholder if no image)
 *   - The photo-type label from field_2445 underneath
 *
 * Clicking any photo card navigates to the edit-doc-photo page
 * for that specific photo record.
 *
 * Knack Builder Setup (per view):
 *   - field_771 (PICs) must have "Click the thumbnail to view the full-size
 *     image" enabled. Without this, Knack does not render the <img> element
 *     with `data-kn-img-gallery` in the DOM, and photos will appear as empty
 *     upload placeholders even when an image is attached to the record.
 *   - field_2445 (CONFIG_photo type), field_2446 (Required), field_2447
 *     (Completed), and field_114 (INPUT_notes) should be included in the
 *     view — they are hidden via CSS but their DOM data is read for metadata.
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var TARGET_VIEWS = ['view_3512', 'view_3505', 'view_3559'];
  var CSS_ID       = 'scw-inline-photo-row-css';
  var ROW_CLS      = 'scw-inline-photo-row';
  var STRIP_CLS    = 'scw-inline-photo-strip';
  var CARD_CLS     = 'scw-inline-photo-card';
  var IMG_CLS      = 'scw-inline-photo-img';
  var TYPE_CLS     = 'scw-inline-photo-type';
  var EMPTY_CLS    = 'scw-inline-photo-empty';
  var ADD_BTN_CLS  = 'scw-inline-photo-add';
  var REQ_CLS      = 'scw-inline-photo-required';
  var REQ_CHIP_CLS = 'scw-inline-photo-req-chip';
  var REQ_CHIP_GREEN_CLS = 'scw-inline-photo-req-chip-green';
  var MISSING_CLS  = 'scw-inline-photo-missing';
  var DRAG_SRC_CLS = 'scw-photo-drag-source';
  var DROP_OK_CLS  = 'scw-photo-drop-target';
  var DROP_HOVER_CLS = 'scw-photo-drop-hover';
  var PENDING_CLS  = 'scw-photo-pending';
  var CONFIRM_CLS  = 'scw-photo-confirm-overlay';

  // Columns to hide in the original table (we show the data inline instead)
  var HIDE_COLS = ['field_114', 'field_2445', 'field_2446', 'field_2447'];
  var NOTES_CLS = 'scw-inline-photo-notes';

  // View-specific add-photo URL path segments
  var ADD_PHOTO_PATHS = {
    'view_3559': 'add-photo-to-mdf-idf'
  };
  var DEFAULT_ADD_PATH = 'add-photo-to-survey-line-item';

  // ── CSS ─────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* The injected <tr> — background/border controlled by
         device-worksheet.js so the pair reads as one unit */
      '.' + ROW_CLS + ' {',
      '  background: transparent;',
      '}',
      '.' + ROW_CLS + ' > td {',
      '  padding: 10px 20px 14px 16px !important;',
      '}',

      /* Wrapper — mimics .scw-ws-field layout so photos align with field values */
      '.scw-inline-photo-field {',
      '  display: flex;',
      '  gap: 8px;',
      '  align-items: flex-start;',
      '}',

      /* "Photos" label — matches .scw-ws-field-label styling */
      '.scw-inline-photo-label {',
      '  flex: 0 0 auto;',
      '  min-width: 100px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  color: #4b5563;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.3px;',
      '  padding-top: 5px;',
      '  white-space: nowrap;',
      '}',

      /* Flex strip for photo cards */
      '.' + STRIP_CLS + ' {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 12px;',
      '  align-items: flex-start;',
      '  flex: 1;',
      '  min-width: 0;',
      '}',

      /* Card wrapper */
      '.' + CARD_CLS + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '}',

      /* Override Knack default ".kn-content img { max-width:100% }" */
      '.kn-content .' + IMG_CLS + ' {',
      '  max-width: none;',
      '}',

      /* Photo image — natural width, capped height */
      '.' + IMG_CLS + ' {',
      '  width: auto;',
      '  max-height: 200px;',
      '  border-radius: 6px;',
      '  border: 1px solid #ddd;',
      '  box-shadow: 0 1px 4px rgba(0,0,0,.08);',
      '  cursor: pointer;',
      '  transition: transform 120ms ease, box-shadow 120ms ease;',
      '}',
      '.' + IMG_CLS + ':hover {',
      '  transform: scale(1.03);',
      '  box-shadow: 0 3px 12px rgba(0,0,0,.15);',
      '}',

      /* Empty photo placeholder (no image uploaded yet) */
      '.' + EMPTY_CLS + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 6px;',
      '  width: 200px;',
      '  height: 200px;',
      '  border: 2px dashed #cbd5e1;',
      '  border-radius: 6px;',
      '  background: #f8fafc;',
      '  color: #94a3b8;',
      '  font-size: 12px;',
      '  cursor: pointer;',
      '  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;',
      '}',
      '.' + EMPTY_CLS + ':hover {',
      '  border-color: #295f91;',
      '  color: #295f91;',
      '  background: #eff6ff;',
      '}',
      '.' + EMPTY_CLS + ' .scw-empty-icon {',
      '  font-size: 28px;',
      '  line-height: 1;',
      '}',

      /* Photo type label beneath image */
      '.' + TYPE_CLS + ' {',
      '  margin-top: 4px;',
      '  width: 100%;',
      '  min-width: 80px;',
      '  padding: 3px 6px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  line-height: 1.3;',
      '  color: #475569;',
      '  background: #e2e8f0;',
      '  border-radius: 3px;',
      '  text-align: center;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '}',

      /* Add-photo button (end of strip) */
      '.' + ADD_BTN_CLS + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 4px;',
      '  width: 56px;',
      '  min-height: 200px;',
      '  border: 2px dashed #cbd5e1;',
      '  border-radius: 6px;',
      '  background: #f8fafc;',
      '  color: #94a3b8;',
      '  font-size: 11px;',
      '  cursor: pointer;',
      '  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;',
      '  flex-shrink: 0;',
      '}',
      '.' + ADD_BTN_CLS + ':hover {',
      '  border-color: #295f91;',
      '  color: #295f91;',
      '  background: #eff6ff;',
      '}',
      '.' + ADD_BTN_CLS + ' .scw-add-icon {',
      '  font-size: 28px;',
      '  line-height: 1;',
      '  font-weight: 300;',
      '}',

      /* When the add button is the only item in the strip (no photos),
         make it square — height matches width */
      '.' + ADD_BTN_CLS + '.scw-photo-add-solo {',
      '  min-height: 56px;',
      '  height: 56px;',
      '}',

      /* Required chip */
      '.' + REQ_CHIP_CLS + ' {',
      '  margin-top: 2px;',
      '  width: 100%;',
      '  padding: 2px 6px;',
      '  font-size: 9px;',
      '  font-weight: 700;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.5px;',
      '  text-align: center;',
      '  color: #fff;',
      '  border-radius: 3px;',
      '  box-sizing: border-box;',
      '}',

      /* Green chip — required + completed */
      '.' + REQ_CHIP_GREEN_CLS + ' { background: #16a34a; }',

      /* Red chip — required + not completed */
      '.' + REQ_CHIP_CLS + ':not(.' + REQ_CHIP_GREEN_CLS + ') { background: #dc2626; }',

      /* Missing required photo — card-level highlight */
      '.' + MISSING_CLS + ' {',
      '  border-color: #dc2626 !important;',
      '  background: #fef2f2 !important;',
      '  color: #dc2626 !important;',
      '}',
      '.' + MISSING_CLS + ':hover {',
      '  border-color: #b91c1c !important;',
      '  background: #fee2e2 !important;',
      '  color: #b91c1c !important;',
      '}',

      /* Required photo that IS completed — subtle indicator on image border */
      '.' + CARD_CLS + '.' + REQ_CLS + ' .' + IMG_CLS + ' {',
      '  border-color: #16a34a;',
      '}',

      /* ── Drag-and-drop states ── */

      /* Source card while dragging */
      '.' + DRAG_SRC_CLS + ' {',
      '  opacity: 0.45;',
      '  transform: scale(0.95);',
      '  transition: opacity 150ms ease, transform 150ms ease;',
      '}',

      /* Valid drop target highlight (pulsing green dashed border) */
      '.' + DROP_OK_CLS + ' .' + EMPTY_CLS + ' {',
      '  border-color: #16a34a !important;',
      '  border-width: 2px !important;',
      '  border-style: dashed !important;',
      '  background: #f0fdf4 !important;',
      '  color: #16a34a !important;',
      '  animation: scw-pulse-border 1.2s ease-in-out infinite;',
      '}',
      '@keyframes scw-pulse-border {',
      '  0%, 100% { border-color: #16a34a; }',
      '  50% { border-color: #86efac; }',
      '}',

      /* Drop target hover — bolder highlight */
      '.' + DROP_HOVER_CLS + ' .' + EMPTY_CLS + ' {',
      '  border-color: #15803d !important;',
      '  border-width: 3px !important;',
      '  border-style: solid !important;',
      '  background: #dcfce7 !important;',
      '  color: #15803d !important;',
      '  box-shadow: 0 0 0 3px rgba(22,163,74,0.2);',
      '  animation: none;',
      '}',

      /* Helper text shown on valid targets during drag */
      '.' + DROP_OK_CLS + ' .scw-drop-helper {',
      '  display: block;',
      '}',
      '.scw-drop-helper {',
      '  display: none;',
      '  font-size: 10px;',
      '  font-weight: 600;',
      '  margin-top: 4px;',
      '  text-align: center;',
      '  color: #16a34a;',
      '}',

      /* Pending state after drop */
      '.' + PENDING_CLS + ' {',
      '  position: relative;',
      '  pointer-events: none;',
      '}',
      '.' + PENDING_CLS + ' .' + EMPTY_CLS + ' {',
      '  border-color: #3b82f6 !important;',
      '  background: #eff6ff !important;',
      '  color: #3b82f6 !important;',
      '  animation: none;',
      '}',

      /* Confirmation overlay */
      '.' + CONFIRM_CLS + ' {',
      '  position: absolute;',
      '  top: 0; left: 0; right: 0; bottom: 0;',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 6px;',
      '  background: rgba(255,255,255,0.95);',
      '  border-radius: 6px;',
      '  border: 2px solid #3b82f6;',
      '  z-index: 10;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-text {',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  color: #1e40af;',
      '  text-align: center;',
      '  padding: 0 8px;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-btns {',
      '  display: flex;',
      '  gap: 6px;',
      '}',
      '.' + CONFIRM_CLS + ' button {',
      '  padding: 4px 12px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  border-radius: 4px;',
      '  border: none;',
      '  cursor: pointer;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-yes {',
      '  background: #16a34a;',
      '  color: #fff;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-yes:hover {',
      '  background: #15803d;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-no {',
      '  background: #e2e8f0;',
      '  color: #475569;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-no:hover {',
      '  background: #cbd5e1;',
      '}',

      /* Notes beneath the card — truncated to two lines */
      '.' + NOTES_CLS + ' {',
      '  margin-top: 2px;',
      '  max-width: 200px;',
      '  padding: 2px 6px;',
      '  font-size: 10px;',
      '  line-height: 1.3;',
      '  color: #64748b;',
      '  text-align: center;',
      '  box-sizing: border-box;',
      '  display: -webkit-box;',
      '  -webkit-line-clamp: 2;',
      '  -webkit-box-orient: vertical;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  word-break: break-word;',
      '}',

      '/* Hide the raw connected-field columns we now display inline */',
      '#view_3512 th.field_114,',
      '#view_3512 td.field_114,',
      '#view_3512 th.field_2445,',
      '#view_3512 td.field_2445,',
      '#view_3512 th.field_2446,',
      '#view_3512 td.field_2446,',
      '#view_3512 th.field_2447,',
      '#view_3512 td.field_2447,',
      '#view_3505 th.field_114,',
      '#view_3505 td.field_114,',
      '#view_3505 th.field_2445,',
      '#view_3505 td.field_2445,',
      '#view_3505 th.field_2446,',
      '#view_3505 td.field_2446,',
      '#view_3505 th.field_2447,',
      '#view_3505 td.field_2447,',
      '#view_3559 th.field_114,',
      '#view_3559 td.field_114,',
      '#view_3559 th.field_2445,',
      '#view_3559 td.field_2445,',
      '#view_3559 th.field_2446,',
      '#view_3559 td.field_2446,',
      '#view_3559 th.field_2447,',
      '#view_3559 td.field_2447 {',
      '  display: none !important;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Swap thumb_14 → original in an S3 image URL. */
  function toOriginalUrl(url) {
    return url.replace('/thumb_14/', '/original/');
  }

  /** Column count for colspan. */
  function colCount(table) {
    var row = table.querySelector('thead tr');
    if (!row) return 21;
    var n = 0;
    var cells = row.children;
    for (var i = 0; i < cells.length; i++) {
      n += parseInt(cells[i].getAttribute('colspan') || '1', 10);
    }
    return n;
  }

  /**
   * Extract the survey request record ID from the current URL hash.
   * URL pattern: #subcontractor-portal/site-survey-request-details/{surveyRequestId}/...
   */
  function getSurveyRequestId() {
    var hash = window.location.hash || '';
    var match = hash.match(/site-survey-request-details\/([a-f0-9]{24})/);
    return match ? match[1] : '';
  }

  /** Build the edit-doc-photo hash path for a photo record. */
  function editPhotoHash(photoRecordId) {
    var surveyId = getSurveyRequestId();
    if (!surveyId) return '';
    return 'subcontractor-portal/site-survey-request-details/' +
      surveyId + '/edit-doc-photo/' + photoRecordId;
  }

  /** Build the add-photo hash path (view-specific segment). */
  function addPhotoHash(lineItemId, viewId) {
    var surveyId = getSurveyRequestId();
    if (!surveyId) return '';
    var pathSegment = (viewId && ADD_PHOTO_PATHS[viewId]) || DEFAULT_ADD_PATH;
    return 'subcontractor-portal/site-survey-request-details/' +
      surveyId + '/' + pathSegment + '/' + lineItemId;
  }

  /**
   * Find a cell by data-field-key (works for field_771 which has
   * a colon in its CSS class making querySelector unreliable).
   */
  function findCellByFieldKey(tr, fieldKey) {
    var cells = tr.getElementsByTagName('td');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute('data-field-key') === fieldKey) return cells[i];
    }
    return null;
  }

  // ── Photo record extraction ─────────────────────────────────────

  /**
   * Extract all connected photo records from a single line-item row.
   *
   * Returns an array of { id, imgUrl, type, required, completed }
   * sorted by: missing-required first, then type, then id.
   */
  function extractPhotoRecords(tr) {
    var map = {}; // photoRecordId → { imgUrl, type, required, completed }

    /** Ensure a record entry exists in the map. */
    function ensure(rid) {
      if (!map[rid]) {
        map[rid] = { id: rid, imgUrl: '', type: '', typeId: '', required: false, completed: false, notes: '' };
      }
      return map[rid];
    }

    // 1) field_771 — images
    var imgCell = findCellByFieldKey(tr, 'field_771');
    if (imgCell) {
      var imgSpans = imgCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var i = 0; i < imgSpans.length; i++) {
        var rid = (imgSpans[i].id || '').trim();
        if (!rid) continue;
        var rec = ensure(rid);
        var img = imgSpans[i].querySelector('img[data-kn-img-gallery]');
        rec.imgUrl = img ? img.getAttribute('data-kn-img-gallery') : '';
      }
    }

    // 2) field_2445 — photo type (CONFIG_photo type)
    var typeCell = tr.querySelector('td.field_2445');
    if (typeCell) {
      var outerSpans = typeCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var j = 0; j < outerSpans.length; j++) {
        var rid2 = (outerSpans[j].id || '').trim();
        if (!rid2) continue;
        var inner = outerSpans[j].querySelector('span[data-kn="connection-value"]');
        var rec2 = ensure(rid2);
        rec2.type = inner ? inner.textContent.trim() : '';
        rec2.typeId = inner ? (inner.id || '').trim() : '';
      }
    }

    // 3) field_2446 — required (Yes/No)
    var reqCell = tr.querySelector('td.field_2446');
    if (reqCell) {
      var reqSpans = reqCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var r = 0; r < reqSpans.length; r++) {
        var rid3 = (reqSpans[r].id || '').trim();
        if (!rid3) continue;
        var val = (reqSpans[r].textContent || '').trim().toLowerCase();
        ensure(rid3).required = (val === 'yes');
      }
    }

    // 4) field_2447 — completed (Yes/No)
    var compCell = tr.querySelector('td.field_2447');
    if (compCell) {
      var compSpans = compCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var c = 0; c < compSpans.length; c++) {
        var rid4 = (compSpans[c].id || '').trim();
        if (!rid4) continue;
        var cval = (compSpans[c].textContent || '').trim().toLowerCase();
        ensure(rid4).completed = (cval === 'yes');
      }
    }

    // 5) field_114 — INPUT_notes
    var notesCell = tr.querySelector('td.field_114');
    if (notesCell) {
      var notesSpans = notesCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var n = 0; n < notesSpans.length; n++) {
        var rid5 = (notesSpans[n].id || '').trim();
        if (!rid5) continue;
        ensure(rid5).notes = (notesSpans[n].textContent || '').trim();
      }
    }

    // Convert to sorted array
    var arr = [];
    for (var k in map) {
      if (map.hasOwnProperty(k)) arr.push(map[k]);
    }

    // Sort: missing-required (required + incomplete) first, then required, then by type, then id
    arr.sort(function (a, b) {
      var aMissing = (a.required && !a.completed) ? 0 : 1;
      var bMissing = (b.required && !b.completed) ? 0 : 1;
      if (aMissing !== bMissing) return aMissing - bMissing;
      var aReq = a.required ? 0 : 1;
      var bReq = b.required ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.id.localeCompare(b.id);
    });

    return arr;
  }

  // ── Drag-and-drop handlers ─────────────────────────────────────

  var dragSourceCard = null;

  /** Find the parent strip element for a card. */
  function getStrip(card) {
    var el = card.parentElement;
    while (el && !el.classList.contains(STRIP_CLS)) el = el.parentElement;
    return el;
  }

  /** Highlight all valid empty-required targets in the same strip. */
  function highlightTargets(strip, sourceId) {
    var cards = strip.querySelectorAll('.' + CARD_CLS);
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.getAttribute('data-photo-id') === sourceId) continue;
      if (c.getAttribute('data-photo-has-image') === 'true') continue;
      if (c.getAttribute('data-photo-required') !== 'true') continue;
      c.classList.add(DROP_OK_CLS);
    }
  }

  /** Clear all drag highlights. */
  function clearHighlights() {
    var all = document.querySelectorAll('.' + DROP_OK_CLS + ', .' + DROP_HOVER_CLS);
    for (var i = 0; i < all.length; i++) {
      all[i].classList.remove(DROP_OK_CLS, DROP_HOVER_CLS);
    }
  }

  function handleDragStart(e) {
    dragSourceCard = e.currentTarget;
    dragSourceCard.classList.add(DRAG_SRC_CLS);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', dragSourceCard.getAttribute('data-photo-id'));

    var strip = getStrip(dragSourceCard);
    if (strip) highlightTargets(strip, dragSourceCard.getAttribute('data-photo-id'));
  }

  function handleDragEnd() {
    if (dragSourceCard) dragSourceCard.classList.remove(DRAG_SRC_CLS);
    clearHighlights();
    dragSourceCard = null;
  }

  function handleDragOver(e) {
    var card = e.currentTarget;
    if (!card.classList.contains(DROP_OK_CLS)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleDragEnter(e) {
    var card = e.currentTarget;
    if (!card.classList.contains(DROP_OK_CLS)) return;
    e.preventDefault();
    card.classList.add(DROP_HOVER_CLS);
  }

  function handleDragLeave(e) {
    var card = e.currentTarget;
    // Only remove hover if actually leaving the card (not entering a child)
    if (card.contains(e.relatedTarget)) return;
    card.classList.remove(DROP_HOVER_CLS);
  }

  function handleDrop(e) {
    e.preventDefault();
    var targetCard = e.currentTarget;
    if (!targetCard.classList.contains(DROP_OK_CLS)) return;
    if (!dragSourceCard) return;

    var sourceId = dragSourceCard.getAttribute('data-photo-id');
    var sourceType = dragSourceCard.getAttribute('data-photo-type') || '';
    var targetId = targetCard.getAttribute('data-photo-id');
    var targetType = targetCard.getAttribute('data-photo-type') || 'this slot';

    clearHighlights();
    if (dragSourceCard) dragSourceCard.classList.remove(DRAG_SRC_CLS);

    // Build metadata payload — no mutation assumptions
    var sourceRequired = dragSourceCard.getAttribute('data-photo-required') === 'true';
    var sourceNotes = dragSourceCard.getAttribute('data-photo-notes') || '';
    var targetRequired = targetCard.getAttribute('data-photo-required') === 'true';
    var targetNotes = targetCard.getAttribute('data-photo-notes') || '';
    var detail = {
      sourceRecordId: sourceId,
      sourcePhotoType: sourceType,
      sourceRequired: sourceRequired,
      sourceNotes: sourceNotes,
      targetRecordId: targetId,
      targetPhotoType: targetType,
      targetRequired: targetRequired,
      targetNotes: targetNotes,
      surveyRequestId: getSurveyRequestId()
    };

    // Show confirmation overlay on the target card
    showConfirmation(targetCard, detail);
  }

  /** Show a confirmation overlay on the target card before dispatching. */
  function showConfirmation(card, detail) {
    card.style.position = 'relative';
    var overlay = document.createElement('div');
    overlay.className = CONFIRM_CLS;
    overlay.innerHTML =
      '<div class="scw-confirm-text">Use this photo for<br><b>' +
      detail.targetPhotoType + '</b>?</div>' +
      '<div class="scw-confirm-btns">' +
        '<button class="scw-confirm-yes">Confirm</button>' +
        '<button class="scw-confirm-no">Cancel</button>' +
      '</div>';

    overlay.querySelector('.scw-confirm-yes').addEventListener('click', function () {
      overlay.remove();
      dispatchPhotoDrop(card, detail);
    });

    overlay.querySelector('.scw-confirm-no').addEventListener('click', function () {
      overlay.remove();
    });

    card.appendChild(overlay);
  }

  /**
   * Dispatch the photo-drop to the registered handler.
   *
   * Default: POST metadata to the configured Make webhook.
   * Override: set window.SCW.onPhotoDrop = function(detail, ui) { … }
   *
   *   detail — { sourceRecordId, sourcePhotoType, targetRecordId,
   *              targetPhotoType, surveyRequestId }
   *
   *   ui     — { setPending(), setSuccess(), setError(msg) }
   *            Helper to control the target card's visual state.
   */
  function dispatchPhotoDrop(card, detail) {
    var ui = buildDropUI(card);

    // Check for custom callback first
    if (window.SCW && typeof window.SCW.onPhotoDrop === 'function') {
      window.SCW.onPhotoDrop(detail, ui);
      return;
    }

    // Default: POST to Make webhook
    var webhookUrl = (window.SCW && window.SCW.CONFIG && window.SCW.CONFIG.MAKE_PHOTO_MOVE_WEBHOOK) || '';
    if (!webhookUrl) {
      console.error('[SCW] No MAKE_PHOTO_MOVE_WEBHOOK configured and no onPhotoDrop callback registered');
      return;
    }

    ui.setPending();

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detail)
    })
    .then(function (resp) {
      if (!resp.ok) throw new Error('Webhook returned ' + resp.status);
      return resp.json().catch(function () { return {}; });
    })
    .then(function () {
      ui.setSuccess();
    })
    .catch(function (err) {
      console.error('[SCW] Photo drop handler error:', err);
      ui.setError('Failed — click to retry');
    });
  }

  /**
   * Build a UI control object for the target card.
   * Lets the callback (or default handler) drive visual state
   * without touching DOM directly.
   */
  function buildDropUI(card) {
    var emptyEl = card.querySelector('.' + EMPTY_CLS);

    // Inject spinner keyframes if not present
    if (!document.getElementById('scw-spin-keyframes')) {
      var kf = document.createElement('style');
      kf.id = 'scw-spin-keyframes';
      kf.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
      document.head.appendChild(kf);
    }

    return {
      /** Show spinning gear + "Processing…" */
      setPending: function () {
        card.classList.add(PENDING_CLS);
        if (emptyEl) {
          emptyEl.innerHTML =
            '<span class="scw-empty-icon" style="animation: spin 1s linear infinite">&#9881;</span>' +
            '<span>Processing\u2026</span>';
        }
      },

      /** Clear pending state and refresh the parent view. */
      setSuccess: function () {
        card.classList.remove(PENDING_CLS);
        if (typeof Knack !== 'undefined' && Knack.views) {
          for (var vi = 0; vi < TARGET_VIEWS.length; vi++) {
            var v = Knack.views[TARGET_VIEWS[vi]];
            if (v && v.model) v.model.fetch();
          }
        }
      },

      /** Show warning icon + message. Click retries the last dispatchPhotoDrop. */
      setError: function (msg) {
        card.classList.remove(PENDING_CLS);
        if (emptyEl) {
          emptyEl.innerHTML =
            '<span class="scw-empty-icon">&#9888;</span>' +
            '<span>' + (msg || 'Error') + '</span>';
          emptyEl.style.cursor = 'pointer';
        }
      }
    };
  }

  // ── DOM injection ───────────────────────────────────────────────

  function processView(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    var table = viewEl.querySelector('table.kn-table');
    if (!table) return;

    var cols = colCount(table);
    var rows = table.querySelectorAll('tbody tr');

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];

      // Skip group headers and already-injected rows
      if (tr.classList.contains('kn-table-group')) continue;
      if (tr.classList.contains(ROW_CLS)) continue;

      // Skip rows without a record ID
      var lineItemId = tr.getAttribute('id');
      if (!lineItemId) continue;

      // Get the label for alt text
      var labelCell = tr.querySelector('td.field_2364') || tr.querySelector('td.field_1642');
      var labelText = labelCell ? (labelCell.textContent || '').trim() : '';

      // Extract all connected photo records
      var photos = extractPhotoRecords(tr);

      // Build the injected row
      var photoTr = document.createElement('tr');
      photoTr.className = ROW_CLS;
      var td = document.createElement('td');
      td.setAttribute('colspan', String(cols));

      var strip = document.createElement('div');
      strip.className = STRIP_CLS;

      // ── "+" Add photo button (appended at end of strip) ──
      var addBtn = document.createElement('div');
      addBtn.className = ADD_BTN_CLS;
      addBtn.innerHTML =
        '<span class="scw-add-icon">+</span>' +
        '<span>Add</span>';
      addBtn.title = 'Add a new photo record';
      (function (lid, vid) {
        addBtn.addEventListener('click', function () {
          var h = addPhotoHash(lid, vid);
          if (h) window.location.hash = h;
        });
      })(lineItemId, viewId);

      if (photos.length === 0) {
        addBtn.classList.add('scw-photo-add-solo');
      }

      if (photos.length > 0) {
        // ── Has connected photo records ──
        for (var p = 0; p < photos.length; p++) {
          var photo = photos[p];
          var isMissing = photo.required && !photo.completed;
          var card = document.createElement('div');
          card.className = CARD_CLS;
          if (photo.required) card.classList.add(REQ_CLS);

          // Data attributes for drag-and-drop
          card.setAttribute('data-photo-id', photo.id);
          card.setAttribute('data-photo-type', photo.type || '');
          card.setAttribute('data-photo-type-id', photo.typeId || '');
          card.setAttribute('data-photo-required', photo.required ? 'true' : 'false');
          card.setAttribute('data-photo-has-image', photo.imgUrl ? 'true' : 'false');
          card.setAttribute('data-photo-notes', photo.notes || '');

          if (photo.imgUrl) {
            // Photo with image — draggable source
            card.setAttribute('draggable', 'true');
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragend', handleDragEnd);

            var imgEl = document.createElement('img');
            imgEl.className = IMG_CLS;
            imgEl.src = photo.imgUrl;
            imgEl.alt = labelText
              ? (photo.type || 'Photo') + ' for ' + labelText
              : 'Site survey photo';
            imgEl.title = 'Drag to an empty required slot, or click to edit';
            (function (rid) {
              imgEl.addEventListener('click', function () {
                var h = editPhotoHash(rid);
                if (h) window.location.hash = h;
              });
            })(photo.id);
            card.appendChild(imgEl);
          } else {
            // Photo record exists but no image uploaded — potential drop target
            var empty = document.createElement('div');
            empty.className = EMPTY_CLS;
            if (isMissing) empty.classList.add(MISSING_CLS);
            empty.innerHTML =
              '<span class="scw-empty-icon">&#128247;</span>' +
              '<span>' + (isMissing ? 'Required' : 'Upload photo') + '</span>';
            empty.title = photo.type
              ? 'Upload: ' + photo.type
              : 'Click to edit photo';
            (function (rid) {
              empty.addEventListener('click', function () {
                var h = editPhotoHash(rid);
                if (h) window.location.hash = h;
              });
            })(photo.id);
            card.appendChild(empty);

            // Drop helper text (hidden until drag starts)
            if (photo.required && !photo.completed) {
              var helper = document.createElement('div');
              helper.className = 'scw-drop-helper';
              helper.textContent = 'Drop to use for ' + (photo.type || 'this slot');
              card.appendChild(helper);
            }

            // Drop target events
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('dragenter', handleDragEnter);
            card.addEventListener('dragleave', handleDragLeave);
            card.addEventListener('drop', handleDrop);
          }

          // Photo type label beneath
          if (photo.type) {
            var typeEl = document.createElement('div');
            typeEl.className = TYPE_CLS;
            typeEl.textContent = photo.type;
            typeEl.title = photo.type;
            card.appendChild(typeEl);
          }

          // Required chip — red if incomplete, green with checkmark if complete
          if (photo.required) {
            var chip = document.createElement('div');
            chip.className = REQ_CHIP_CLS;
            if (photo.completed) {
              chip.classList.add(REQ_CHIP_GREEN_CLS);
              chip.textContent = '\u2713 Required';
            } else {
              chip.textContent = 'Required';
            }
            card.appendChild(chip);
          }

          // Notes beneath the card
          if (photo.notes) {
            var notesEl = document.createElement('div');
            notesEl.className = NOTES_CLS;
            notesEl.textContent = photo.notes;
            notesEl.title = photo.notes;
            card.appendChild(notesEl);
          }

          strip.appendChild(card);
        }
      }

      // ── Append "+" button at the end ──
      strip.appendChild(addBtn);

      // Wrap strip in a field-like layout with a "Photos" label
      var fieldWrapper = document.createElement('div');
      fieldWrapper.className = 'scw-inline-photo-field';

      var photoLabel = document.createElement('div');
      photoLabel.className = 'scw-inline-photo-label';
      photoLabel.textContent = 'Photos';

      fieldWrapper.appendChild(photoLabel);
      fieldWrapper.appendChild(strip);

      td.appendChild(fieldWrapper);
      photoTr.appendChild(td);
      tr.parentNode.insertBefore(photoTr, tr.nextSibling);
    }
  }

  // ── Init ────────────────────────────────────────────────────────
  injectCss();

  for (var v = 0; v < TARGET_VIEWS.length; v++) {
    (function (vid) {
      $(document).on('knack-view-render.' + vid, function () {
        processView(vid);
      });
    })(TARGET_VIEWS[v]);
  }
})();
/*************  Inline Photo Rows – view_3512  **********************/
// ============================================================
// Boolean Chips – one-click toggle chips (stacked in one column)
// ============================================================
//
// Replaces Yes/No boolean columns with compact chip elements
// stacked vertically inside a single "host" column. The other
// source columns are hidden. Clicking a chip instantly toggles
// the value (Yes↔No) and saves via Knack's internal APIs.
// Knack's native inline-edit popup is suppressed for these cells.
//
// CONFIGURATION
//   Edit BOOL_CHIP_CONFIG below to add views and fields.
//   `hostFieldKey` is the column where all chips are rendered.
//   `hideFieldKeys` lists columns to hide (their data is read first).
//
(function () {
  'use strict';

  // ============================================================
  // CONFIG – add views / fields here
  // ============================================================
  var BOOL_CHIP_CONFIG = {
    views: [
      {
        viewId: 'view_3512',
        // All chips render stacked inside the Exterior column
        hostFieldKey: 'field_2372',
        // These columns get hidden (header + cells)
        hideFieldKeys: ['field_2370', 'field_2371'],
        fields: [
          { label: 'Exterior',         fieldKey: 'field_2372' },
          { label: 'Existing Cabling', fieldKey: 'field_2370' },
          { label: 'Plenum',           fieldKey: 'field_2371' }
        ]
      },
      {
        viewId: 'view_3505',
        hostFieldKey: 'field_2372',
        hideFieldKeys: ['field_2370', 'field_2371'],
        fields: [
          { label: 'Exterior',         fieldKey: 'field_2372' },
          { label: 'Existing Cabling', fieldKey: 'field_2370' },
          { label: 'Plenum',           fieldKey: 'field_2371' }
        ]
      }
    ]
  };

  // ============================================================
  // CONSTANTS
  // ============================================================
  var STYLE_ID       = 'scw-bool-chips-css';
  var CHIP_CLASS     = 'scw-bool-chip';
  var CHIP_STACK     = 'scw-chip-stack';
  var PROCESSED_ATTR = 'data-scw-chip-processed';
  var EVENT_NS       = '.scwBoolChips';

  // ============================================================
  // CSS – injected once
  // ============================================================
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var hiddenSelectors = [];
    BOOL_CHIP_CONFIG.views.forEach(function (viewCfg) {
      (viewCfg.hideFieldKeys || []).forEach(function (fk) {
        var sel = '#' + viewCfg.viewId;
        hiddenSelectors.push(sel + ' th.' + fk);
        hiddenSelectors.push(sel + ' td.' + fk);
        hiddenSelectors.push(sel + ' th[data-field-key="' + fk + '"]');
        hiddenSelectors.push(sel + ' td[data-field-key="' + fk + '"]');
      });
    });

    var css = [
      /* ---- chip stack container ---- */
      '.' + CHIP_STACK + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 3px;',
      '}',

      /* ---- base chip ---- */
      '.' + CHIP_CLASS + ' {',
      '  display: inline-block;',
      '  padding: 1px 8px;',
      '  border-radius: 10px;',
      '  font-size: 11px;',
      '  font-weight: 500;',
      '  line-height: 1.5;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  transition: background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;',
      '  white-space: nowrap;',
      '  border: 1px solid transparent;',
      '  text-align: center;',
      '}',

      /* ---- yes state (warm amber — action, not warning) ---- */
      '.' + CHIP_CLASS + '.is-yes {',
      '  background-color: #fffbeb;',
      '  color: #92400e;',
      '  border-color: #fde68a;',
      '}',
      '.' + CHIP_CLASS + '.is-yes:hover {',
      '  background-color: #fef3c7;',
      '  box-shadow: 0 1px 3px rgba(146,64,14,0.15);',
      '}',

      /* ---- no state ---- */
      '.' + CHIP_CLASS + '.is-no {',
      '  background-color: #f9fafb;',
      '  color: #9ca3af;',
      '  border-color: #d1d5db;',
      '}',
      '.' + CHIP_CLASS + '.is-no:hover {',
      '  background-color: #f3f4f6;',
      '  color: #6b7280;',
      '  box-shadow: 0 1px 3px rgba(0,0,0,0.08);',
      '}',

      /* ---- saving flash ---- */
      '.' + CHIP_CLASS + '.is-saving {',
      '  opacity: 0.6;',
      '  pointer-events: none;',
      '}',

      /* ---- suppress Knack inline-edit on managed cells ---- */
      'td[' + PROCESSED_ATTR + '] .kn-edit-col,',
      'td[' + PROCESSED_ATTR + '] .kn-td-edit {',
      '  display: none !important;',
      '}'
    ];

    /* ---- hide source columns ---- */
    if (hiddenSelectors.length) {
      css.push(hiddenSelectors.join(',\n') + ' {');
      css.push('  display: none !important;');
      css.push('}');
    }

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css.join('\n');
    document.head.appendChild(style);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  /** Normalize cell text for Yes/No detection. */
  function normalizeBool(text) {
    var t = (text || '').replace(/[\u00a0\u200b]/g, ' ').trim().toLowerCase();
    if (t === 'yes' || t === 'true') return 'yes';
    if (t === 'no' || t === 'false') return 'no';
    return null;
  }

  /** Build a chip element. */
  function createChip(label, value, fieldKey) {
    var chip = document.createElement('span');
    chip.className = CHIP_CLASS + (value === 'yes' ? ' is-yes' : ' is-no');
    chip.setAttribute('data-field', fieldKey);
    chip.setAttribute('data-value', value);
    chip.textContent = label;
    return chip;
  }

  /**
   * Get the record id for a table row.
   */
  function getRecordId(tr) {
    var trId = tr.id || '';
    var match = trId.match(/[0-9a-f]{24}/i);
    return match ? match[0] : null;
  }

  /**
   * Update a field value via Knack's internal APIs.
   */
  function saveFieldValue(viewId, recordId, fieldKey, boolValue) {
    var data = {};
    data[fieldKey] = boolValue === 'yes';

    var view = Knack.views[viewId];
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      view.model.updateRecord(recordId, data);
      return;
    }

    if (typeof Knack !== 'undefined' && Knack.models) {
      var modelKey = Object.keys(Knack.models).find(function (key) {
        var m = Knack.models[key];
        return m && m.data && m.data.find && m.data.find(function (r) {
          return r.id === recordId;
        });
      });

      if (modelKey) {
        var model = Knack.models[modelKey];
        if (typeof model.save === 'function') {
          data.id = recordId;
          model.save(data);
          return;
        }
      }
    }

    $.ajax({
      url: Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
           '/views/' + viewId + '/records/' + recordId,
      type: 'PUT',
      headers: {
        'X-Knack-Application-Id': Knack.application_id,
        'x-knack-rest-api-key': 'knack',
        'Authorization': Knack.getUserToken()
      },
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: function () {
        if (Knack.views[viewId] && Knack.views[viewId].model &&
            typeof Knack.views[viewId].model.fetch === 'function') {
          Knack.views[viewId].model.fetch();
        }
      },
      error: function (xhr) {
        console.warn('[scw-bool-chips] Save failed for ' + recordId, xhr.responseText);
      }
    });
  }

  /** Find which view config a <td> belongs to. */
  function findViewForCell(td) {
    var $view = $(td).closest('[id^="view_"]');
    if (!$view.length) return null;
    var viewId = $view.attr('id');
    for (var v = 0; v < BOOL_CHIP_CONFIG.views.length; v++) {
      if (BOOL_CHIP_CONFIG.views[v].viewId === viewId) return BOOL_CHIP_CONFIG.views[v];
    }
    return null;
  }

  // ============================================================
  // CHIP TRANSFORMATION — stacked in host column
  // ============================================================

  /**
   * Read a boolean value from a (possibly hidden) cell in the row.
   */
  function readBoolFromRow($tr, fieldKey) {
    var $td = $tr.find('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]');
    if (!$td.length) return null;
    // If this cell already has a chip, read from the chip's data-value
    var $chip = $td.find('.' + CHIP_CLASS);
    if ($chip.length) return $chip.attr('data-value') || null;
    // Otherwise read raw text
    return normalizeBool($td.text());
  }

  /** Transform rows: stack all field chips into the host column. */
  function transformView(viewCfg) {
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;

    var hostFK = viewCfg.hostFieldKey;
    var $rows = $view.find('table.kn-table-table tbody tr, table.kn-table tbody tr');
    if (!$rows.length) return;

    // Rename the host column header to something generic
    var $hostTh = $view.find('th.' + hostFK + ', th[data-field-key="' + hostFK + '"]');
    if ($hostTh.length && !$hostTh.attr('data-scw-relabeled')) {
      $hostTh.find('.kn-sort-link, a').first().text('Survey');
      $hostTh.attr('data-scw-relabeled', '1');
    }

    $rows.each(function () {
      var $tr = $(this);
      if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

      var $hostTd = $tr.find('td.' + hostFK + ', td[data-field-key="' + hostFK + '"]');
      if (!$hostTd.length) return;

      // Skip if already processed and chips still present
      if ($hostTd.attr(PROCESSED_ATTR) === '1' && $hostTd.find('.' + CHIP_CLASS).length) return;

      // Read boolean values for ALL fields from their respective cells
      var chipData = [];
      viewCfg.fields.forEach(function (fieldCfg) {
        var val = readBoolFromRow($tr, fieldCfg.fieldKey);
        if (val) {
          chipData.push({ label: fieldCfg.label, value: val, fieldKey: fieldCfg.fieldKey });
        }
      });

      if (!chipData.length) return;

      // Build the stacked chip container
      var stack = document.createElement('div');
      stack.className = CHIP_STACK;
      chipData.forEach(function (d) {
        stack.appendChild(createChip(d.label, d.value, d.fieldKey));
      });

      $hostTd.empty().append(stack);
      $hostTd.attr(PROCESSED_ATTR, '1');
    });
  }

  // ============================================================
  // ONE-CLICK TOGGLE
  // ============================================================
  // We use a single capturing-phase click listener that:
  //   1. Stops Knack's inline-edit from opening (stopPropagation)
  //   2. Performs the toggle + save directly
  // A jQuery delegated handler would never fire because
  // stopPropagation in capture phase kills bubbling.

  function handleChipToggle(chip) {
    var td = chip.closest('td');
    if (!td) return;

    var fieldKey     = chip.getAttribute('data-field') || '';
    var currentValue = chip.getAttribute('data-value') || 'no';
    var newValue     = currentValue === 'yes' ? 'no' : 'yes';

    var viewCfg = findViewForCell(td);
    if (!viewCfg) return;

    var fieldCfg = null;
    for (var i = 0; i < viewCfg.fields.length; i++) {
      if (viewCfg.fields[i].fieldKey === fieldKey) {
        fieldCfg = viewCfg.fields[i];
        break;
      }
    }
    if (!fieldCfg) return;

    // Instantly update just this chip in-place
    var newChip = createChip(fieldCfg.label, newValue, fieldCfg.fieldKey);
    newChip.classList.add('is-saving');
    chip.parentNode.replaceChild(newChip, chip);

    setTimeout(function () { newChip.classList.remove('is-saving'); }, 400);

    // Also update the hidden source cell so re-renders stay in sync
    var $tr = $(td).closest('tr');
    var $srcTd = $tr.find('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]').not(td);
    if ($srcTd.length) {
      $srcTd.text(newValue === 'yes' ? 'Yes' : 'No');
    }

    // Save
    var tr = td.closest('tr');
    var recordId = tr ? getRecordId(tr) : null;
    if (recordId) {
      saveFieldValue(viewCfg.viewId, recordId, fieldCfg.fieldKey, newValue);
    } else {
      console.warn('[scw-bool-chips] Could not determine record ID for save');
    }
  }

  // Capture-phase click: block Knack + toggle
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.' + CHIP_CLASS);
    if (!chip) return;
    var td = chip.closest('td');
    if (!td || !td.hasAttribute(PROCESSED_ATTR)) return;

    e.stopPropagation();
    e.preventDefault();
    handleChipToggle(chip);
  }, true);

  // Capture-phase mousedown: block Knack's inline-edit trigger
  document.addEventListener('mousedown', function (e) {
    var chip = e.target.closest('.' + CHIP_CLASS);
    if (!chip) return;
    var td = chip.closest('td');
    if (!td || !td.hasAttribute(PROCESSED_ATTR)) return;

    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ============================================================
  // INIT – bind to knack-view-render for each configured view
  // ============================================================
  function init() {
    injectStyles();

    BOOL_CHIP_CONFIG.views.forEach(function (viewCfg) {
      var viewId = viewCfg.viewId;

      $(document)
        .off('knack-view-render.' + viewId + EVENT_NS)
        .on('knack-view-render.' + viewId + EVENT_NS, function () {
          transformView(viewCfg);
        });

      $(document)
        .off('knack-cell-update.' + viewId + EVENT_NS)
        .on('knack-cell-update.' + viewId + EVENT_NS, function () {
          setTimeout(function () { transformView(viewCfg); }, 100);
        });

      if ($('#' + viewId).length) {
        transformView(viewCfg);
      }
    });
  }

  if (document.readyState === 'loading') {
    $(document).ready(init);
  } else {
    init();
  }
})();
// ============================================================
// End Boolean Chips
// ============================================================
// ============================================================
// Device Worksheet – compact summary row + expandable detail
// ============================================================
//
// Transforms flat table rows into a two-part layout:
//   1. SUMMARY ROW – always-visible, compact bar with key bid
//      fields that are directly inline-editable.
//   2. DETAIL PANEL – accordion-expandable section with the full
//      set of remaining editable fields (survey, mounting, etc.)
//
// A chevron on the summary row toggles the detail panel and the
// associated inline-photo row (injected by inline-photo-row.js).
//
// INLINE-EDIT PRESERVATION STRATEGY
//   The actual <td> elements are *moved* (reparented) into the
//   worksheet layout — NOT cloned.  This keeps all of Knack's
//   jQuery event bindings alive.  When Knack fires cell-edit or
//   re-renders the view, the whole table is replaced and this
//   script re-runs from scratch.
//
// CONFIGURATION
//   Edit WORKSHEET_CONFIG below. Each entry maps semantic field
//   names to Knack field keys for a given view.
//
(function () {
  'use strict';

  // ============================================================
  // CONFIG – plug in field keys per view here
  // ============================================================
  var WORKSHEET_CONFIG = {
    views: [
      {
        viewId: 'view_3512',
        fields: {
          // ── Summary row (always visible, primary edit surface) ──
          bid:              'field_2415',   // Bid (column 1)
          move:             'field_2375',   // Move icon (column 2)
          label:            'field_2364',   // Label
          product:          'field_2379',   // Product (column 4)
          laborDescription: 'field_2409',   // Labor Description
          labor:            'field_2400',   // Labor $

          // ── Detail panel (expandable) ──
          mounting:         'field_2379',   // Mounting Acces. (column 5 — same field, different column-index)
          connections:      'field_2381',   // connected to
          scwNotes:         'field_2418',   // SCW Notes
          surveyNotes:      'field_2412',   // Survey Notes
          exterior:         'field_2372',   // Exterior (chip host)
          existingCabling:  'field_2370',   // Existing Cabling
          plenum:           'field_2371',   // Plenum
          mountingHeight:   'field_2455',   // Mounting Height
          dropLength:       'field_2367',   // Drop Length
          conduitFeet:      'field_2368',   // Conduit Linear Feet
          warningCount:     'field_2454'    // Warning count (shown as chit on header)
        },
        columnIndices: {
          product:  4,
          mounting: 5
        }
      },
      {
        viewId: 'view_3505',
        fields: {
          bid:              'field_2415',
          move:             'field_2375',
          label:            'field_2364',
          product:          'field_2379',
          laborDescription: 'field_2409',
          labor:            'field_2400',
          quantity:         'field_2399',   // Qty (summary, inline-edit)
          extended:         'field_2401',   // Extended / Labor Total (summary, read-only)

          mounting:         'field_2379',
          connections:      'field_2380',
          scwNotes:         'field_2418',
          surveyNotes:      'field_2412',
          exterior:         'field_2372',
          existingCabling:  'field_2370',
          plenum:           'field_2371',
          warningCount:     'field_2454'    // Warning count (shown as chit on header)
        },
        columnIndices: {
          product:  3,
          mounting: 4
        }
      },
      {
        viewId: 'view_3559',
        fields: {
          // ── Summary row ──
          label:            'field_1642',   // DISPLAY_mdf_idf_name (composite identity)

          // ── Detail panel ──
          mdfIdf:           'field_1641',   // MDF/IDF (radio chips: HEADEND, IDF)
          mdfNumber:        'field_2458',   // ## (read-only)
          name:             'field_1943',   // Name (textarea, direct-edit)
          surveyNotes:      'field_2457'    // Survey Notes (textarea, direct-edit)
        },
        // Fields whose changes feed the label formula — saving any of
        // these triggers a lightweight GET to refresh the header text.
        headerTriggerFields: ['field_1641', 'field_2458', 'field_1943']
      }
    ]
  };

  // ============================================================
  // CONSTANTS
  // ============================================================
  var STYLE_ID       = 'scw-device-worksheet-css';
  var WORKSHEET_ROW  = 'scw-ws-row';
  var PROCESSED_ATTR = 'data-scw-worksheet';
  var EVENT_NS       = '.scwDeviceWorksheet';
  var P              = 'scw-ws';  // class prefix

  // SVG chevron (matches group-collapse.js style)
  var CHEVRON_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 2 8 6 4 10"/></svg>';

  // ============================================================
  // CSS – injected once
  // ============================================================
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = `
/* ── Hide the original data row (cells moved out, shell stays) ── */
tr[${PROCESSED_ATTR}="1"] {
  display: none !important;
}

/* ── Kill ALL residual Knack hover / striping ── */
tr.${WORKSHEET_ROW},
tr.${WORKSHEET_ROW}:hover,
tr.scw-inline-photo-row,
tr.scw-inline-photo-row:hover,
tr[data-scw-worksheet],
tr[data-scw-worksheet]:hover {
  background: none !important;
  background-color: transparent !important;
}
tr.${WORKSHEET_ROW} > td,
tr.${WORKSHEET_ROW}:hover > td,
tr.scw-inline-photo-row > td,
tr.scw-inline-photo-row:hover > td,
tr[data-scw-worksheet] > td,
tr[data-scw-worksheet]:hover > td {
  background: none !important;
  background-color: transparent !important;
}

/* ── Worksheet row <td> — zero padding so the card fills it ── */
.${WORKSHEET_ROW} > td {
  padding: 0 !important;
  border: none !important;
}

/* ── Photo row — part of the same visual unit ── */
tr.scw-inline-photo-row > td {
  padding: 10px 16px 14px 16px !important;
  border: none !important;
  border-bottom: 2px solid #e2e8f0 !important;
}

/* ── Card wrapper ── */
.${P}-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-top: 2px solid #e2e8f0;
}

/* ── Bottom separator between record groups (card + photo row) ── */
.${WORKSHEET_ROW}.${P}-last > td {
  border-bottom: 2px solid #e2e8f0 !important;
}

/* ================================================================
   SUMMARY BAR – single-row layout
   [checkbox] [chevron] [label · product] [labor desc] → push right → [bid] [labor] [qty] [ext] [move]
   ================================================================ */
.${P}-summary {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  min-height: 38px;
}
.${P}-summary:hover {
  background: #f1f5f9;
}

/* Right-aligned group: bid, labor, qty, ext, move pushed to far right */
.${P}-sum-right {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 0;
}
/* Each field group in the right section gets fixed width for vertical alignment */
.${P}-sum-right .${P}-sum-group {
  width: 80px;
  min-width: 80px;
}
/* Bid group can be a bit narrower */
.${P}-sum-right .${P}-sum-group--bid {
  width: 70px;
  min-width: 70px;
}
/* Bid field grows in height when multiple selections are present */
.${P}-sum-group--bid td.${P}-sum-field {
  height: auto;
  min-height: 30px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
/* Qty group narrower */
.${P}-sum-right .${P}-sum-group--qty {
  width: 50px;
  min-width: 50px;
}
/* Fields inside right groups stretch to fill their group */
.${P}-sum-right td.${P}-sum-field,
.${P}-sum-right td.${P}-sum-field-ro {
  width: 100%;
  min-width: 0;
}

/* Hide labor, qty, extended for Assumptions rows (keeps space for alignment) */
tr.scw-row--assumptions .${P}-sum-group--labor,
tr.scw-row--assumptions .${P}-sum-group--qty,
tr.scw-row--assumptions .${P}-sum-group--ext {
  visibility: hidden;
}

/* ── KTL bulk-edit checkbox cell ── */
td.${P}-sum-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  flex: 0 0 auto;
  padding: 0 4px !important;
  border: none !important;
  background: transparent !important;
  min-width: 20px;
}
td.${P}-sum-check input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
}

/* Clickable toggle zone (chevron + identity) — fixed width so labor desc aligns */
.${P}-toggle-zone {
  display: flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  flex: 0 0 auto;
  min-width: 0;
}
.${P}-toggle-zone:hover .${P}-chevron {
  color: #6b7280;
}

/* Chevron toggle */
.${P}-chevron {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: #9ca3af;
  transition: transform 200ms ease, color 150ms ease;
  transform: rotate(0deg);
}
.${P}-chevron.${P}-collapsed {
  transform: rotate(0deg);
}
.${P}-chevron.${P}-expanded {
  transform: rotate(90deg);
  color: #6b7280;
}

/* Label + Product identity block */
.${P}-identity {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex: 0 1 auto;
  min-width: 0;
}

/* Warning chit (field_2454 count > 0) */
.${P}-warn-chit {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px 1px 5px;
  font-size: 12px;
  font-weight: 700;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.4;
}
.${P}-warn-chit svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}
/* Wrapper so chit + product share the product's fixed width */
.${P}-product-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}
#view_3512 .${P}-product-group {
  width: 300px;
  min-width: 300px;
  max-width: 300px;
}
#view_3505 .${P}-product-group {
  width: 400px;
  min-width: 400px;
  max-width: 400px;
}
.${P}-product-group > td.${P}-sum-product {
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Label td in summary — primary styling, fixed width for alignment */
td.${P}-sum-label-cell,
td.${P}-sum-label-cell:hover {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #1e4d78;
  cursor: pointer !important;
  border: none !important;
  background: transparent !important;
  padding: 0 2px;
  white-space: nowrap;
  width: 80px;
  min-width: 80px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* view_3559: wider label (no product column, label IS the identity) */
#view_3559 td.${P}-sum-label-cell,
#view_3559 td.${P}-sum-label-cell:hover {
  width: 400px;
  min-width: 400px;
  max-width: 400px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}

/* Product td in summary — fixed width so labor desc and right fields align vertically */
td.${P}-sum-product,
td.${P}-sum-product:hover {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #1e4d78;
  cursor: pointer !important;
  border: none !important;
  background: transparent !important;
  padding: 0 2px;
  width: 400px;
  min-width: 400px;
  max-width: 400px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
/* view_3512: product width managed by product-group wrapper */

/* Separator dot */
.${P}-sum-sep {
  color: #d1d5db;
  font-size: 12px;
  user-select: none;
  flex-shrink: 0;
}

/* ── Standardized editable field cell height ── */
td.${P}-sum-field {
  display: inline-flex;
  align-items: center;
  position: relative;
  padding: 2px 8px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  white-space: nowrap;
  height: 30px;
  min-width: 40px;
  box-sizing: border-box;
  transition: border-color 0.15s, background-color 0.15s;
}
td.${P}-sum-field.cell-edit:hover,
td.${P}-sum-field.ktlInlineEditableCellsStyle:hover {
  background-color: #dbeafe !important;
  border-color: #93c5fd !important;
  cursor: pointer;
}
/* Empty summary fields */
td.${P}-sum-field.${P}-empty {
  color: #9ca3af;
  font-style: italic;
}

/* Read-only summary field (non-editable, e.g. Extended total) */
td.${P}-sum-field-ro {
  display: inline-flex;
  align-items: center;
  position: relative;
  padding: 2px 8px;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  white-space: nowrap;
  height: 30px;
  min-width: 40px;
  box-sizing: border-box;
}

/* Labor desc field — fills available space between identity and right-aligned fields */
td.${P}-sum-field--desc {
  white-space: normal;
  word-break: break-word;
  height: auto;
  min-height: 30px;
}

/* Summary field label (tiny, above or inline) */
.${P}-sum-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #374151;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Summary field group: label + value stacked */
.${P}-sum-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  min-width: 0;
  flex-shrink: 0;
}

/* Labor desc group — fills middle space, pushes right group to far right */
.${P}-sum-group--fill {
  flex: 1 1 auto;
  min-width: 80px;
}

/* Move td sits at the right end */
td.${P}-sum-move {
  display: inline-flex;
  align-items: center;
  padding: 0 4px;
  border: none !important;
  background: transparent !important;
  flex-shrink: 0;
}

/* ── Synthetic group divider bars ── */
tr.scw-synth-divider > td {
  height: 6px;
  padding: 0 !important;
  background: #d1d5db;
  border: none !important;
  line-height: 0;
  font-size: 0;
}

/* ================================================================
   DETAIL PANEL – expandable section
   ================================================================ */
.${P}-detail {
  display: none;
  border-top: 1px solid #e5e7eb;
}
.${P}-detail.${P}-open {
  display: block;
}

/* ── Sections grid ── */
.${P}-sections {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
/* Narrow the Equipment Details (left) section so Survey Details
   starts roughly aligned with Labor Description in the summary bar. */
#view_3512 .${P}-sections {
  grid-template-columns: 455px 1fr;
}
#view_3505 .${P}-sections {
  grid-template-columns: 555px 1fr;
}
@media (max-width: 900px) {
  .${P}-sections,
  #view_3512 .${P}-sections,
  #view_3505 .${P}-sections {
    grid-template-columns: 1fr;
  }
}

/* ── Individual section ── */
.${P}-section {
  padding: 14px 20px 14px 16px;
  border-right: 1px solid #e5e7eb;
  min-width: 0;
}
.${P}-section:last-child {
  border-right: none;
}

.${P}-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #4b5563;
  padding-bottom: 6px;
  margin-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
}

/* ── Field row inside a section ── */
.${P}-field {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: flex-start;
  min-height: 24px;
}
.${P}-field:last-child {
  margin-bottom: 0;
}

.${P}-field-label {
  flex: 0 0 100px;
  width: 100px;
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-top: 5px;
  white-space: pre-line;
  line-height: 1.3;
}

/* ── The moved <td> becomes the field value container ── */
.${P}-field-value {
  flex: 1;
  font-size: 13px;
  color: #1f2937;
  line-height: 1.5;
  min-width: 0;
  word-break: break-word;
}

td.${P}-field-value {
  display: block;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  min-height: 28px;
}

/* ── Editable hover affordance ── */
td.${P}-field-value.cell-edit,
td.${P}-field-value.ktlInlineEditableCellsStyle {
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}
td.${P}-field-value.cell-edit:hover,
td.${P}-field-value.ktlInlineEditableCellsStyle:hover {
  background-color: #f0f6ff !important;
  border-color: #93c5fd !important;
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25);
}

/* ── Chip host td — invisible cell, chips aligned with fields ── */
td.${P}-chip-host {
  display: block !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  min-height: 0 !important;
}
td.${P}-chip-host:hover {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

.${P}-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 0;
}

/* ── Notes fields — allow more vertical space ── */
td.${P}-field-value--notes {
  font-size: 13px;
  line-height: 1.5;
  max-height: 120px;
  overflow-y: auto;
}

/* ── Empty field value ── */
.${P}-field-value--empty {
  color: #9ca3af;
  font-style: italic;
}

/* ── Radio chips (Mounting Height) ── */
.${P}-radio-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 0;
}
.${P}-radio-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.5;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
  border: 1px solid transparent;
  text-align: center;
}
.${P}-radio-chip.is-selected {
  background-color: #dbeafe;
  color: #1e40af;
  border-color: #93c5fd;
}
.${P}-radio-chip.is-selected:hover {
  background-color: #bfdbfe;
  box-shadow: 0 1px 3px rgba(30,64,175,0.15);
}
.${P}-radio-chip.is-unselected {
  background-color: #f9fafb;
  color: #9ca3af;
  border-color: #d1d5db;
}
.${P}-radio-chip.is-unselected:hover {
  background-color: #f3f4f6;
  color: #6b7280;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.${P}-radio-chip.is-saving {
  opacity: 0.6;
  pointer-events: none;
}

/* ── Direct-edit inputs (type-and-save text fields) ── */
.${P}-direct-input,
.${P}-direct-textarea {
  width: 100%;
  font-size: 13px;
  font-family: inherit;
  color: #1f2937;
  line-height: 1.5;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
  outline: none;
}
.${P}-direct-input:focus,
.${P}-direct-textarea:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25);
}
.${P}-direct-input.is-saving,
.${P}-direct-textarea.is-saving {
  background-color: #f0fdf4;
  border-color: #86efac;
}
.${P}-direct-input.is-error,
.${P}-direct-textarea.is-error {
  background-color: #fef2f2;
  border-color: #fca5a5;
  box-shadow: 0 0 0 2px rgba(252, 165, 165, 0.25);
}
.${P}-direct-error {
  font-size: 11px;
  color: #dc2626;
  margin-top: 3px;
  line-height: 1.3;
}
.${P}-direct-textarea {
  resize: vertical;
  min-height: 48px;
  max-height: 120px;
}

/* ── Summary bar direct-edit input wrapper ── */
.${P}-sum-input-wrap {
  width: 100%;
  min-width: 0;
  position: relative;
}
.${P}-sum-input-wrap .${P}-direct-input {
  height: 28px;
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}
.${P}-sum-input-wrap .${P}-direct-textarea {
  padding: 2px 6px;
  font-size: 12px;
  line-height: 1.3;
  resize: none;
  min-height: 36px;
  max-height: 120px;
  overflow-y: auto;
}
.${P}-sum-input-wrap .${P}-direct-error {
  position: absolute;
  top: 100%;
  left: 0;
  white-space: nowrap;
  z-index: 10;
  background: #fff;
  padding: 2px 4px;
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* ── Photo row hidden when detail collapsed ── */
tr.scw-inline-photo-row.${P}-photo-hidden {
  display: none !important;
}
`;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  function findCell(tr, fieldKey, colIndex) {
    var cells = tr.querySelectorAll(
      'td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]'
    );
    if (!cells.length) return null;
    if (colIndex != null) {
      for (var i = 0; i < cells.length; i++) {
        var ci = cells[i].getAttribute('data-column-index');
        if (ci !== null && parseInt(ci, 10) === colIndex) return cells[i];
      }
    }
    return cells[0];
  }

  function isCellEmpty(td) {
    if (!td) return true;
    var text = (td.textContent || '').replace(/[\u00a0\s]/g, '').trim();
    return text.length === 0 && !td.querySelector('img');
  }

  function getRecordId(tr) {
    var trId = tr.id || '';
    var match = trId.match(/[0-9a-f]{24}/i);
    return match ? match[0] : null;
  }

  // ============================================================
  // EXPANDED STATE PERSISTENCE (across inline-edit re-renders)
  // ============================================================
  //
  // Device-worksheet panels start collapsed after every transformView.
  // Without persistence, an inline edit causes all expanded panels to
  // close — losing the user's context.
  //
  // On knack-cell-update (BEFORE re-render): scan worksheet rows and
  // save which record IDs have expanded detail panels.
  // At the end of transformView (AFTER rebuild): re-expand saved panels.

  var _expandedState = {};  // viewId → [recordId, ...]

  /** Scan current worksheet rows for open detail panels and save their
   *  record IDs so they can be re-expanded after transformView. */
  function captureExpandedState(viewId) {
    var expanded = [];
    var wsRows = document.querySelectorAll('#' + viewId + ' tr.' + WORKSHEET_ROW);
    for (var i = 0; i < wsRows.length; i++) {
      var detail = wsRows[i].querySelector('.' + P + '-detail.' + P + '-open');
      if (detail) {
        var rid = getRecordId(wsRows[i]);
        if (rid) expanded.push(rid);
      }
    }
    _expandedState[viewId] = expanded;
  }

  /** Capture expanded state for ALL configured worksheet views.
   *  Called on ANY knack-cell-update because refresh-on-inline-edit.js
   *  may refresh sibling views — not just the one that was edited. */
  function captureAllExpandedStates() {
    WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
      captureExpandedState(viewCfg.viewId);
    });
  }

  /** Re-expand detail panels for previously-expanded records.
   *  Called at the end of transformView after new worksheet rows
   *  have been built. Uses record ID (24-char hex) for stable
   *  identity across re-renders. */
  function restoreExpandedState(viewId) {
    var expanded = _expandedState[viewId];
    if (!expanded || !expanded.length) return;

    // Build a lookup set for O(1) checks
    var expandedSet = {};
    for (var i = 0; i < expanded.length; i++) {
      expandedSet[expanded[i]] = true;
    }

    var wsRows = document.querySelectorAll('#' + viewId + ' tr.' + WORKSHEET_ROW);
    for (var j = 0; j < wsRows.length; j++) {
      var rid = getRecordId(wsRows[j]);
      if (rid && expandedSet[rid]) {
        toggleDetail(wsRows[j]);
      }
    }

    delete _expandedState[viewId];
  }

  // ============================================================
  // BUILD DETAIL PANEL HELPERS
  // ============================================================

  var GRAYED_CLASS = 'scw-cond-grayed';

  function buildFieldRow(label, td, opts) {
    opts = opts || {};

    // If the cell was grayed out by the conditional-grayout script,
    // remove it from the detail panel entirely (keep summary graying).
    if (td && td.classList.contains(GRAYED_CLASS)) return null;

    // If skipEmpty is set, omit the field entirely when the cell is blank.
    if (opts.skipEmpty && (!td || isCellEmpty(td))) return null;

    var row = document.createElement('div');
    row.className = P + '-field';

    var lbl = document.createElement('div');
    lbl.className = P + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    if (td && !isCellEmpty(td)) {
      td.classList.add(P + '-field-value');
      if (opts.notes) td.classList.add(P + '-field-value--notes');
      row.appendChild(td);
    } else if (td) {
      td.classList.add(P + '-field-value');
      td.classList.add(P + '-field-value--empty');
      if (opts.notes) td.classList.add(P + '-field-value--notes');
      row.appendChild(td);
    } else {
      var placeholder = document.createElement('div');
      placeholder.className = P + '-field-value ' + P + '-field-value--empty';
      placeholder.textContent = '\u2014';
      row.appendChild(placeholder);
    }

    return row;
  }

  function buildSection(title) {
    var section = document.createElement('div');
    section.className = P + '-section';

    if (title) {
      var titleEl = document.createElement('div');
      titleEl.className = P + '-section-title';
      titleEl.textContent = title;
      section.appendChild(titleEl);
    }

    return section;
  }

  // ============================================================
  // RADIO CHIPS – single-select chip UI for multiple-choice fields
  // ============================================================
  var RADIO_CHIP_CLASS = P + '-radio-chip';
  var RADIO_CHIPS_ATTR = 'data-scw-radio-chips';

  var MOUNTING_HEIGHT_OPTIONS = ["Under 16'", "16' - 24'", "Over 24'"];
  var MDF_IDF_OPTIONS = ['HEADEND', 'IDF'];

  /** Read current value from a cell's text content. */
  function readCellText(td) {
    if (!td) return '';
    return (td.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim();
  }

  /** Build radio chip elements for a set of options. */
  function buildRadioChips(td, fieldKey, options) {
    var currentVal = readCellText(td);
    var container = document.createElement('div');
    container.className = P + '-radio-chips';
    container.setAttribute('data-field', fieldKey);

    for (var i = 0; i < options.length; i++) {
      var chip = document.createElement('span');
      chip.className = RADIO_CHIP_CLASS;
      chip.setAttribute('data-option', options[i]);
      chip.setAttribute('data-field', fieldKey);
      chip.textContent = options[i];

      if (currentVal === options[i]) {
        chip.classList.add('is-selected');
      } else {
        chip.classList.add('is-unselected');
      }
      container.appendChild(chip);
    }
    return container;
  }

  /** Build a field row that uses radio chips instead of the raw cell. */
  function buildRadioChipRow(label, td, fieldKey, options) {
    if (td && td.classList.contains(GRAYED_CLASS)) return null;

    var row = document.createElement('div');
    row.className = P + '-field';

    var lbl = document.createElement('div');
    lbl.className = P + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    var valueWrapper = document.createElement('div');
    valueWrapper.className = P + '-field-value';
    valueWrapper.style.border = 'none';
    valueWrapper.style.padding = '0';
    valueWrapper.style.background = 'transparent';

    var chips = buildRadioChips(td, fieldKey, options);
    valueWrapper.appendChild(chips);

    // Keep the original td hidden so Knack's data binding stays alive
    if (td) {
      td.style.display = 'none';
      td.setAttribute(RADIO_CHIPS_ATTR, '1');
      valueWrapper.appendChild(td);
    }

    row.appendChild(valueWrapper);
    return row;
  }

  // ============================================================
  // DIRECT-EDIT INPUTS – type-and-save text fields
  // ============================================================
  var DIRECT_EDIT_ATTR = 'data-scw-direct-edit';
  var DIRECT_INPUT_CLASS = P + '-direct-input';
  var DIRECT_TEXTAREA_CLASS = P + '-direct-textarea';

  /** Read the display text from a td, stripping whitespace. */
  function readFieldText(td) {
    if (!td) return '';
    return (td.textContent || '').replace(/[\u00a0]/g, ' ').trim();
  }

  /** Build an editable field row with a native input or textarea. */
  function buildEditableFieldRow(label, td, fieldKey, opts) {
    opts = opts || {};
    if (td && td.classList.contains(GRAYED_CLASS)) return null;
    if (opts.skipEmpty && (!td || isCellEmpty(td))) return null;

    var row = document.createElement('div');
    row.className = P + '-field';

    var lbl = document.createElement('div');
    lbl.className = P + '-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    var valueWrapper = document.createElement('div');
    valueWrapper.className = P + '-field-value';
    valueWrapper.style.border = 'none';
    valueWrapper.style.padding = '0';
    valueWrapper.style.background = 'transparent';

    var currentVal = readFieldText(td);
    var input;

    if (opts.notes) {
      input = document.createElement('textarea');
      input.className = DIRECT_TEXTAREA_CLASS;
      input.value = currentVal;
      input.rows = 2;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = DIRECT_INPUT_CLASS;
      input.value = currentVal;
    }

    input.setAttribute('data-field', fieldKey);
    input.setAttribute(DIRECT_EDIT_ATTR, '1');

    valueWrapper.appendChild(input);

    // Keep the original td hidden so Knack data binding stays alive
    if (td) {
      td.style.display = 'none';
      td.setAttribute(DIRECT_EDIT_ATTR, '1');
      valueWrapper.appendChild(td);
    }

    row.appendChild(valueWrapper);
    return row;
  }

  /** Parse an error message from a Knack API response. */
  function parseKnackError(xhr) {
    try {
      var body = JSON.parse(xhr.responseText || '{}');
      // Knack returns { errors: [{ message: "..." }] } or { errors: [{ field: "...", message: "..." }] }
      if (body.errors && body.errors.length) {
        return body.errors.map(function (e) { return e.message || e; }).join('; ');
      }
      if (body.message) return body.message;
    } catch (ignored) {}
    return 'Save failed';
  }

  /** Show an error message below a direct-edit input, with red styling. */
  function showInputError(input, message, previousValue) {
    // Remove saving state, add error state
    input.classList.remove('is-saving');
    input.classList.add('is-error');

    // Revert value
    input.value = previousValue;

    // Update hidden td back to previous value
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    if (hiddenTd) {
      hiddenTd.textContent = previousValue;
    }

    // Show error message element
    var existing = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (existing) existing.remove();

    var errEl = document.createElement('div');
    errEl.className = P + '-direct-error';
    errEl.textContent = message;
    if (wrapper) wrapper.appendChild(errEl);

    // Auto-clear after 4 seconds
    setTimeout(function () {
      input.classList.remove('is-error');
      if (errEl.parentNode) errEl.remove();
    }, 4000);
  }

  /** Show success feedback on input. */
  function showInputSuccess(input) {
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    // Remove any lingering error
    var wrapper = input.parentNode;
    var errEl = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (errEl) errEl.remove();

    setTimeout(function () {
      input.classList.remove('is-saving');
      // Re-evaluate conditional formatting after save completes.
      // The hidden td has already been updated with the new value;
      // recalculate whether the field still meets a danger/warning
      // condition and update the input background accordingly.
      refreshInputConditionalColor(input);
    }, 600);
  }

  /**
   * After a successful save, recalculate the conditional background
   * color (danger/warning) for a direct-edit input based on the
   * updated value in its hidden td.  Clears the color when the
   * condition no longer applies.
   */
  function refreshInputConditionalColor(input) {
    var wrapper = input.parentNode;
    if (!wrapper) return;
    var hiddenTd = wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']');
    if (!hiddenTd) return;
    var fieldKey = input.getAttribute('data-field');
    if (!fieldKey) return;

    // Find the view config that governs this input
    var viewEl = input.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (!viewId) return;

    // Look up the dynamic-cell-color rules via the exposed API,
    // or fall back to a local check using the same logic.
    var COLORS_MAP = {
      danger:  'rgb(248, 215, 218)',
      warning: 'rgb(255, 243, 205)'
    };

    // Determine the applicable rule for this field from our
    // inline knowledge of the color rules applied by dynamic-cell-colors.
    // field_2400 = danger when empty, field_2409 = danger when empty,
    // field_2399 = warning when zero, etc.
    var isEmpty = (function () {
      var raw = (hiddenTd.textContent || '').replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ').trim();
      return raw === '' || raw === '-' || raw === '\u2014';
    })();
    var isZero = (function () {
      var raw = (hiddenTd.textContent || '').replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ').trim();
      return /^[$]?0+(\.0+)?$/.test(raw);
    })();

    // Check if the dynamic-cell-colors module has rules for this field
    // by inspecting the hidden td's current classes and inline styles.
    // If the td had a danger/warning class, remove or re-apply it.
    var dangerCls = 'scw-cell-danger';
    var warningCls = 'scw-cell-warning';

    // The rules: look up from config knowledge
    var conditionMet = false;
    var conditionColor = null;

    // field_2400 (labor) → danger when empty, warning when zero
    // field_2409 (labor desc) → danger when empty
    // field_2415 (bid), field_771 (photos) → warning when empty
    // field_2399 (qty) → warning when zero
    if (fieldKey === 'field_2400') {
      if (isEmpty) { conditionMet = true; conditionColor = 'danger'; }
      else if (isZero) { conditionMet = true; conditionColor = 'warning'; }
    } else if (fieldKey === 'field_2409') {
      conditionMet = isEmpty;
      conditionColor = 'danger';
    } else if (fieldKey === 'field_2415' || fieldKey === 'field_771') {
      conditionMet = isEmpty;
      conditionColor = 'warning';
    } else if (fieldKey === 'field_2399') {
      conditionMet = isZero;
      conditionColor = 'warning';
    }

    // Update hidden td classes (so the condition is reflected in DOM)
    hiddenTd.classList.remove(dangerCls, warningCls);
    if (conditionMet && conditionColor === 'danger') {
      hiddenTd.classList.add(dangerCls);
      hiddenTd.style.backgroundColor = COLORS_MAP.danger;
    } else if (conditionMet && conditionColor === 'warning') {
      hiddenTd.classList.add(warningCls);
      hiddenTd.style.backgroundColor = COLORS_MAP.warning;
    } else {
      hiddenTd.style.backgroundColor = '';
    }

    // Update the visible input's background
    if (conditionMet && COLORS_MAP[conditionColor]) {
      input.style.backgroundColor = COLORS_MAP[conditionColor];
    } else {
      // Restore the default direct-edit background (light blue tint
      // from the build step or transparent)
      input.style.backgroundColor = 'rgba(134, 182, 223, 0.1)';
    }
  }

  // Number fields that need client-side validation
  var NUMBER_FIELDS = ['field_2367', 'field_2368', 'field_2400', 'field_2399', 'field_2458'];

  // ============================================================
  // SOFT HEADER REFRESH
  // ============================================================
  //
  // For views whose header label is a Knack formula (e.g. view_3559's
  // field_1642 = composite of field_1641 + field_2458 + field_1943),
  // we read the recalculated formula from the PUT response after
  // saving a trigger field and patch the label td in place.
  //
  // The view-level GET endpoint does NOT return formula fields, so
  // the label must come from the PUT response itself.
  //
  // We also cache the last-known label per record so that if Knack
  // re-renders the view (via model change events), we can re-apply
  // the label in transformView without another round-trip.

  var _labelCache = {};  // recordId → label text

  /** Look up the viewCfg that owns a given viewId. */
  function viewCfgFor(viewId) {
    var views = WORKSHEET_CONFIG.views;
    for (var i = 0; i < views.length; i++) {
      if (views[i].viewId === viewId) return views[i];
    }
    return null;
  }

  /** Returns true if fieldKey is a header-trigger field for viewId. */
  function isHeaderTrigger(viewId, fieldKey) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.headerTriggerFields) return false;
    return cfg.headerTriggerFields.indexOf(fieldKey) !== -1;
  }

  /** Extract the label text from a Knack API response object. */
  function extractLabelFromResponse(viewId, resp) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.fields.label) return '';
    var labelField = cfg.fields.label;
    var raw = resp[labelField + '_raw'] || resp[labelField] || '';
    return typeof raw === 'string'
      ? raw.replace(/<[^>]*>/g, '').trim()
      : String(raw);
  }

  /** Patch the label td text for a single record in the DOM. */
  function applyLabelText(viewId, recordId, txt) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.fields.label) return;
    var labelField = cfg.fields.label;

    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    // Find ALL label tds in the view, then match by closest row id
    var allLabels = viewEl.querySelectorAll(
      'td.' + labelField + ', td[data-field-key="' + labelField + '"]'
    );
    for (var i = 0; i < allLabels.length; i++) {
      var row = allLabels[i].closest('tr.' + WORKSHEET_ROW);
      if (row && getRecordId(row) === recordId) {
        allLabels[i].textContent = txt;
        console.log('[scw-ws-header] Applied label for ' + recordId + ': "' + txt + '"');
        return;
      }
    }
    console.warn('[scw-ws-header] Label td not found for ' + recordId);
  }

  /**
   * Called at the end of transformView — re-apply any cached labels
   * that Knack's re-render may have wiped with stale formula data.
   */
  function restoreCachedLabels(viewId) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.fields.label) return;
    var labelField = cfg.fields.label;

    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    var allLabels = viewEl.querySelectorAll(
      'td.' + labelField + ', td[data-field-key="' + labelField + '"]'
    );
    for (var i = 0; i < allLabels.length; i++) {
      var row = allLabels[i].closest('tr.' + WORKSHEET_ROW);
      if (!row) continue;
      var rid = getRecordId(row);
      if (rid && _labelCache[rid]) {
        var current = (allLabels[i].textContent || '').trim();
        if (!current || current === '\u00a0') {
          allLabels[i].textContent = _labelCache[rid];
          console.log('[scw-ws-header] Restored cached label for ' + rid + ': "' + _labelCache[rid] + '"');
        }
      }
    }
  }

  /** Save a direct-edit field value.
   *  For header-trigger fields, always uses AJAX PUT so we can read
   *  the recalculated formula from the response.  For other fields,
   *  prefers model.updateRecord to avoid a full re-render.
   *  Calls onSuccess(resp) or onError(message) when done. */
  function saveDirectEditValue(viewId, recordId, fieldKey, value, onSuccess, onError) {
    if (typeof Knack === 'undefined') return;

    var data = {};
    data[fieldKey] = value;
    var trigger = isHeaderTrigger(viewId, fieldKey);

    // Non-trigger fields: prefer model.updateRecord (no re-render)
    if (!trigger) {
      var view = Knack.views[viewId];
      if (view && view.model && typeof view.model.updateRecord === 'function') {
        view.model.updateRecord(recordId, data);
        if (onSuccess) onSuccess(null);
        return;
      }
    }

    // Trigger fields (or fallback): direct AJAX PUT
    $.ajax({
      url: Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
           '/views/' + viewId + '/records/' + recordId,
      type: 'PUT',
      headers: {
        'X-Knack-Application-Id': Knack.application_id,
        'x-knack-rest-api-key': 'knack',
        'Authorization': Knack.getUserToken()
      },
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: function (resp) {
        if (onSuccess) onSuccess(resp);
      },
      error: function (xhr) {
        var msg = parseKnackError(xhr);
        console.warn('[scw-ws-direct] Save failed for ' + recordId, xhr.responseText);
        if (onError) onError(msg);
      }
    });
  }

  /** Handle save for a direct-edit input. */
  function handleDirectEditSave(input) {
    var fieldKey = input.getAttribute('data-field') || '';
    var newValue = input.value;

    // Capture previous value before overwriting hidden td
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var previousValue = hiddenTd ? readFieldText(hiddenTd) : '';

    // Client-side validation for number fields
    if (NUMBER_FIELDS.indexOf(fieldKey) !== -1) {
      var trimmed = newValue.trim().replace(/[$,]/g, '');
      if (trimmed !== '' && isNaN(Number(trimmed))) {
        showInputError(input, 'Please enter a number', previousValue);
        return;
      }
    }

    // Optimistically update hidden td
    if (hiddenTd) {
      hiddenTd.textContent = newValue;
    }

    // Visual feedback — start saving
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    var errEl = wrapper ? wrapper.querySelector('.' + P + '-direct-error') : null;
    if (errEl) errEl.remove();

    // Find record ID and view ID
    var wsTr = input.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = input.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveDirectEditValue(viewId, recordId, fieldKey, newValue,
        function (resp) {
          showInputSuccess(input);
          if (resp && isHeaderTrigger(viewId, fieldKey)) {
            var txt = extractLabelFromResponse(viewId, resp);
            console.log('[scw-ws-header] PUT response label: "' + txt + '"');
            if (txt) {
              _labelCache[recordId] = txt;
              applyLabelText(viewId, recordId, txt);
            }
          }
        },
        function (msg) { showInputError(input, msg, previousValue); }
      );
    }
  }

  // ── Keydown handler for direct-edit inputs: save on Enter ──
  document.addEventListener('keydown', function (e) {
    var target = e.target;
    if (!target.hasAttribute(DIRECT_EDIT_ATTR)) return;

    if (e.key === 'Enter') {
      // For textareas, Shift+Enter inserts newline; Enter alone saves
      if (target.tagName === 'TEXTAREA' && e.shiftKey) return;

      e.preventDefault();
      e.stopPropagation();
      // Mark as just-saved so blur handler doesn't double-fire
      target._scwJustSaved = true;
      handleDirectEditSave(target);
      target.blur();
    }

    if (e.key === 'Escape') {
      // Revert to the hidden td value
      target._scwJustSaved = true; // prevent blur save
      var wrapper = target.parentNode;
      var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
      if (hiddenTd) {
        target.value = readFieldText(hiddenTd);
      }
      target.blur();
    }
  }, true);

  // ── Blur handler: save when focus leaves ──
  document.addEventListener('focusout', function (e) {
    var target = e.target;
    if (!target.hasAttribute(DIRECT_EDIT_ATTR)) return;

    // Skip if Enter/Escape already handled it
    if (target._scwJustSaved) {
      target._scwJustSaved = false;
      return;
    }

    // Check if value actually changed
    var wrapper = target.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var originalVal = hiddenTd ? readFieldText(hiddenTd) : '';
    if (target.value !== originalVal) {
      handleDirectEditSave(target);
    }
  }, true);

  // ── Capture-phase click/mousedown: block Knack inline-edit on direct-edit inputs ──
  document.addEventListener('click', function (e) {
    if (e.target.hasAttribute(DIRECT_EDIT_ATTR)) {
      e.stopPropagation();
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    if (e.target.hasAttribute(DIRECT_EDIT_ATTR)) {
      e.stopPropagation();
    }
  }, true);

  /** Save a radio chip selection via Knack's internal API. */
  function saveRadioValue(viewId, recordId, fieldKey, value, onSuccess) {
    var data = {};
    data[fieldKey] = value;
    var trigger = isHeaderTrigger(viewId, fieldKey);

    // Non-trigger: prefer model.updateRecord (no re-render)
    if (!trigger) {
      var view = typeof Knack !== 'undefined' && Knack.views ? Knack.views[viewId] : null;
      if (view && view.model && typeof view.model.updateRecord === 'function') {
        view.model.updateRecord(recordId, data);
        if (onSuccess) onSuccess(null);
        return;
      }
    }

    // Trigger fields (or fallback): AJAX PUT — response has the formula
    if (typeof Knack !== 'undefined') {
      $.ajax({
        url: Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
             '/views/' + viewId + '/records/' + recordId,
        type: 'PUT',
        headers: {
          'X-Knack-Application-Id': Knack.application_id,
          'x-knack-rest-api-key': 'knack',
          'Authorization': Knack.getUserToken()
        },
        contentType: 'application/json',
        data: JSON.stringify(data),
        success: function (resp) {
          if (onSuccess) onSuccess(resp);
        },
        error: function (xhr) {
          console.warn('[scw-ws-radio] Save failed for ' + recordId, xhr.responseText);
        }
      });
    }
  }

  // ── Capture-phase click handler for radio chips ──
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.' + RADIO_CHIP_CLASS);
    if (!chip) return;

    e.stopPropagation();
    e.preventDefault();

    var newValue = chip.getAttribute('data-option') || '';
    var fieldKey = chip.getAttribute('data-field') || '';
    var container = chip.closest('.' + P + '-radio-chips');
    if (!container) return;

    // Update chip states
    var allChips = container.querySelectorAll('.' + RADIO_CHIP_CLASS);
    for (var i = 0; i < allChips.length; i++) {
      allChips[i].classList.remove('is-selected', 'is-unselected');
      if (allChips[i].getAttribute('data-option') === newValue) {
        allChips[i].classList.add('is-selected', 'is-saving');
      } else {
        allChips[i].classList.add('is-unselected');
      }
    }
    setTimeout(function () {
      var saving = container.querySelectorAll('.is-saving');
      for (var j = 0; j < saving.length; j++) saving[j].classList.remove('is-saving');
    }, 400);

    // Update hidden td text so re-renders stay in sync
    var hiddenTd = container.parentNode.querySelector('td[' + RADIO_CHIPS_ATTR + ']');
    if (hiddenTd) {
      hiddenTd.textContent = newValue;
    }

    // Find record ID and view ID, then save
    var wsTr = chip.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = chip.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveRadioValue(viewId, recordId, fieldKey, newValue, function (resp) {
        if (resp && isHeaderTrigger(viewId, fieldKey)) {
          var txt = extractLabelFromResponse(viewId, resp);
          console.log('[scw-ws-header] Radio PUT response label: "' + txt + '"');
          if (txt) {
            _labelCache[recordId] = txt;
            applyLabelText(viewId, recordId, txt);
          }
        }
      });
    }
  }, true);

  // ── Capture-phase mousedown: block Knack inline-edit trigger ──
  document.addEventListener('mousedown', function (e) {
    var chip = e.target.closest('.' + RADIO_CHIP_CLASS);
    if (!chip) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ============================================================
  // SUMMARY BAR DIRECT-EDIT INPUT
  // ============================================================

  /** Build a direct-edit input that replaces a summary bar td.
   *  Returns a wrapper div containing the input + hidden td.
   *  opts.multiline — use a textarea instead of a single-line input. */
  function buildSummaryEditInput(td, fieldKey, opts) {
    opts = opts || {};
    var wrapper = document.createElement('div');
    wrapper.className = P + '-sum-input-wrap';

    var currentVal = readFieldText(td);
    var input;

    if (opts.multiline) {
      input = document.createElement('textarea');
      input.className = DIRECT_TEXTAREA_CLASS;
      input.value = currentVal;
      input.rows = 4;
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = DIRECT_INPUT_CLASS;
      input.value = currentVal;
    }
    input.setAttribute('data-field', fieldKey);
    input.setAttribute(DIRECT_EDIT_ATTR, '1');

    // Propagate conditional formatting (e.g. red background) from the td
    if (td) {
      var bgColor = td.style.backgroundColor;
      if (bgColor) {
        input.style.backgroundColor = bgColor;
      }
      // Also check computed style in case Knack rules applied via class
      var computed = window.getComputedStyle(td);
      var compBg = computed.backgroundColor;
      if (compBg && compBg !== 'rgba(0, 0, 0, 0)' && compBg !== 'transparent') {
        input.style.backgroundColor = compBg;
      }
    }

    wrapper.appendChild(input);

    if (td) {
      td.style.display = 'none';
      td.setAttribute(DIRECT_EDIT_ATTR, '1');
      wrapper.appendChild(td);
    }

    return wrapper;
  }

  // ============================================================
  // BUILD SUMMARY BAR
  // ============================================================

  function buildSummaryBar(tr, viewCfg) {
    var f = viewCfg.fields;
    var ci = viewCfg.columnIndices || {};

    var bar = document.createElement('div');
    bar.className = P + '-summary';

    // ── KTL / legacy bulk-edit checkbox (if present) ──
    var checkTd = tr.querySelector('td > input[type="checkbox"]');
    if (checkTd) {
      var checkCell = checkTd.closest('td');
      checkCell.classList.add(P + '-sum-check');
      bar.appendChild(checkCell);
    }

    // ── Toggle zone: chevron + identity ──
    var toggleZone = document.createElement('span');
    toggleZone.className = P + '-toggle-zone';

    var chevron = document.createElement('span');
    chevron.className = P + '-chevron ' + P + '-collapsed';
    chevron.innerHTML = CHEVRON_SVG;
    toggleZone.appendChild(chevron);

    var identity = document.createElement('span');
    identity.className = P + '-identity';

    var labelTd = findCell(tr, f.label);
    if (labelTd) {
      labelTd.classList.add(P + '-sum-label-cell');
      identity.appendChild(labelTd);
    }

    var productTd = findCell(tr, f.product, ci.product);
    if (productTd) {
      var sep0 = document.createElement('span');
      sep0.className = P + '-sum-sep';
      sep0.textContent = '\u00b7';
      identity.appendChild(sep0);

      var productGroup = document.createElement('span');
      productGroup.className = P + '-product-group';

      // Warning chit (field_2454, view_3512 only)
      if (f.warningCount) {
        var warnTd = findCell(tr, f.warningCount);
        var warnVal = warnTd ? parseFloat((warnTd.textContent || '').replace(/[^0-9.-]/g, '')) : 0;
        if (warnVal > 0) {
          var chit = document.createElement('span');
          chit.className = P + '-warn-chit';
          chit.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 9.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.507l-3.22-3.22a.75.75 0 00-1.06 0l-3.22 3.22-1.72-1.72a.75.75 0 00-1.06 0L2.5 12.993v1.757zM12.75 7a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clip-rule="evenodd"/></svg>'
            + Math.round(warnVal);
          productGroup.appendChild(chit);
        }
      }

      productTd.classList.add(P + '-sum-product');
      productGroup.appendChild(productTd);
      identity.appendChild(productGroup);
    }

    toggleZone.appendChild(identity);
    bar.appendChild(toggleZone);

    // ── Labor Desc (inline, fills middle space — direct-edit) ──
    var laborDescTd = findCell(tr, f.laborDescription);
    if (laborDescTd) {
      var ldGroup = document.createElement('span');
      ldGroup.className = P + '-sum-group ' + P + '-sum-group--fill';
      var ldLabel = document.createElement('span');
      ldLabel.className = P + '-sum-label';
      ldLabel.textContent = 'Labor Desc';
      ldGroup.appendChild(ldLabel);
      ldGroup.appendChild(buildSummaryEditInput(laborDescTd, f.laborDescription, { multiline: true }));
      bar.appendChild(ldGroup);
    }

    // ── Right-aligned group: bid, labor, qty, ext, move ──
    var rightGroup = document.createElement('span');
    rightGroup.className = P + '-sum-right';

    // Bid
    var bidTd = findCell(tr, f.bid);
    if (bidTd) {
      var bidGroup = document.createElement('span');
      bidGroup.className = P + '-sum-group ' + P + '-sum-group--bid';
      var bidLabel = document.createElement('span');
      bidLabel.className = P + '-sum-label';
      bidLabel.textContent = 'Bid';
      bidGroup.appendChild(bidLabel);
      bidTd.classList.add(P + '-sum-field');
      if (isCellEmpty(bidTd)) bidTd.classList.add(P + '-empty');
      bidGroup.appendChild(bidTd);
      rightGroup.appendChild(bidGroup);
    }

    // Labor $ (direct-edit)
    var laborTd = findCell(tr, f.labor);
    if (laborTd) {
      var labGroup = document.createElement('span');
      labGroup.className = P + '-sum-group ' + P + '-sum-group--labor';
      var labLabel = document.createElement('span');
      labLabel.className = P + '-sum-label';
      labLabel.textContent = 'Labor';
      labGroup.appendChild(labLabel);
      labGroup.appendChild(buildSummaryEditInput(laborTd, f.labor));
      rightGroup.appendChild(labGroup);
    }

    // Qty (view_3505 only, direct-edit)
    if (f.quantity) {
      var qtyTd = findCell(tr, f.quantity);
      if (qtyTd) {
        var qtyGroup = document.createElement('span');
        qtyGroup.className = P + '-sum-group ' + P + '-sum-group--qty';
        var qtyLabel = document.createElement('span');
        qtyLabel.className = P + '-sum-label';
        qtyLabel.textContent = 'Qty';
        qtyGroup.appendChild(qtyLabel);
        qtyGroup.appendChild(buildSummaryEditInput(qtyTd, f.quantity));
        rightGroup.appendChild(qtyGroup);
      }
    }

    // Extended (view_3505 only, read-only)
    if (f.extended) {
      var extTd = findCell(tr, f.extended);
      if (extTd) {
        var extGroup = document.createElement('span');
        extGroup.className = P + '-sum-group ' + P + '-sum-group--ext';
        var extLabel = document.createElement('span');
        extLabel.className = P + '-sum-label';
        extLabel.textContent = 'Extended';
        extGroup.appendChild(extLabel);
        extTd.classList.add(P + '-sum-field-ro');
        extGroup.appendChild(extTd);
        rightGroup.appendChild(extGroup);
      }
    }

    // Move
    var moveTd = findCell(tr, f.move);
    if (moveTd) {
      moveTd.classList.add(P + '-sum-move');
      rightGroup.appendChild(moveTd);
    }

    bar.appendChild(rightGroup);

    return bar;
  }

  // ============================================================
  // BUILD DETAIL PANEL
  // ============================================================

  function buildDetailPanel(tr, viewCfg) {
    var f = viewCfg.fields;
    var ci = viewCfg.columnIndices || {};

    var detail = document.createElement('div');
    detail.className = P + '-detail';

    var sections = document.createElement('div');
    sections.className = P + '-sections';

    // Helper: append a field row only if it wasn't grayed out (null)
    function addRow(section, row) {
      if (row) section.appendChild(row);
    }

    // ── Left column: Equipment Details ──
    var equipSection = buildSection('');

    if (f.mdfIdf) {
      addRow(equipSection, buildRadioChipRow('MDF/IDF',
        findCell(tr, f.mdfIdf), f.mdfIdf, MDF_IDF_OPTIONS));
    }

    if (f.mdfNumber) {
      addRow(equipSection, buildFieldRow('##',
        findCell(tr, f.mdfNumber)));
    }

    addRow(equipSection, buildEditableFieldRow('Mounting\nHardware',
      findCell(tr, f.mounting, ci.mounting), f.mounting, { skipEmpty: true }));

    if (f.name) {
      addRow(equipSection, buildEditableFieldRow('Name',
        findCell(tr, f.name), f.name, { notes: true }));
    }

    addRow(equipSection, buildEditableFieldRow('SCW Notes',
      findCell(tr, f.scwNotes), f.scwNotes, { notes: true }));

    sections.appendChild(equipSection);

    // ── Right column: Survey Details ──
    var surveySection = buildSection('Survey Details');

    if (f.connections) {
      addRow(surveySection, buildFieldRow('Connected to',
        findCell(tr, f.connections)));
    }

    // Chip stack (boolean chips for exterior/cabling/plenum)
    var chipHostTd = findCell(tr, f.exterior);
    if (chipHostTd && !chipHostTd.classList.contains(GRAYED_CLASS)) {
      var chipStack = chipHostTd.querySelector('.scw-chip-stack');
      if (chipStack) {
        var chipFieldRow = document.createElement('div');
        chipFieldRow.className = P + '-field';

        var chipLabel = document.createElement('div');
        chipLabel.className = P + '-field-label';
        chipLabel.textContent = '';
        chipFieldRow.appendChild(chipLabel);

        chipHostTd.classList.add(P + '-chip-host');
        chipHostTd.classList.add(P + '-field-value');
        chipHostTd.innerHTML = '';
        var chipsRow = document.createElement('div');
        chipsRow.className = P + '-chips';
        while (chipStack.firstChild) {
          chipsRow.appendChild(chipStack.firstChild);
        }
        chipHostTd.appendChild(chipsRow);
        chipFieldRow.appendChild(chipHostTd);
        surveySection.appendChild(chipFieldRow);
      } else {
        addRow(surveySection, buildFieldRow('Exterior',
          chipHostTd));
      }
    }

    if (f.mountingHeight) {
      addRow(surveySection, buildRadioChipRow('Mounting\nHeight',
        findCell(tr, f.mountingHeight), f.mountingHeight, MOUNTING_HEIGHT_OPTIONS));
    }

    if (f.dropLength) {
      addRow(surveySection, buildEditableFieldRow('Drop Length',
        findCell(tr, f.dropLength), f.dropLength));
    }

    if (f.conduitFeet) {
      addRow(surveySection, buildEditableFieldRow('Conduit Ft',
        findCell(tr, f.conduitFeet), f.conduitFeet));
    }

    addRow(surveySection, buildEditableFieldRow('Survey\nNotes',
      findCell(tr, f.surveyNotes), f.surveyNotes, { notes: true }));

    sections.appendChild(surveySection);

    detail.appendChild(sections);

    return detail;
  }

  // ============================================================
  // ACCORDION TOGGLE
  // ============================================================

  function toggleDetail(wsTr) {
    var detail = wsTr.querySelector('.' + P + '-detail');
    var chevron = wsTr.querySelector('.' + P + '-chevron');
    if (!detail) return;

    var isOpen = detail.classList.contains(P + '-open');

    if (isOpen) {
      // Collapse
      detail.classList.remove(P + '-open');
      if (chevron) {
        chevron.classList.remove(P + '-expanded');
        chevron.classList.add(P + '-collapsed');
      }
      // Hide the photo row too
      var photoRow = wsTr.nextElementSibling;
      if (photoRow && photoRow.classList.contains('scw-inline-photo-row')) {
        photoRow.classList.add(P + '-photo-hidden');
      }
    } else {
      // Expand
      detail.classList.add(P + '-open');
      if (chevron) {
        chevron.classList.remove(P + '-collapsed');
        chevron.classList.add(P + '-expanded');
      }
      // Show the photo row
      var photoRow2 = wsTr.nextElementSibling;
      if (photoRow2 && photoRow2.classList.contains('scw-inline-photo-row')) {
        photoRow2.classList.remove(P + '-photo-hidden');
      }
    }
  }

  // ============================================================
  // BUILD FULL WORKSHEET CARD
  // ============================================================

  function buildWorksheetCard(tr, viewCfg) {
    var card = document.createElement('div');
    card.className = P + '-card';

    // Summary bar (always visible)
    var summary = buildSummaryBar(tr, viewCfg);
    card.appendChild(summary);

    // Detail panel (expandable)
    var detail = buildDetailPanel(tr, viewCfg);
    card.appendChild(detail);

    return card;
  }

  // ============================================================
  // TRANSFORM VIEW
  // ============================================================

  function transformView(viewCfg) {
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;

    var table = $view.find('table.kn-table-table, table.kn-table')[0];
    if (!table) return;

    table.classList.remove('is-striped', 'ktlTable--rowHover', 'is-bordered');

    var thead = table.querySelector('thead');
    if (thead) thead.style.display = 'none';

    var $rows = $(table).find('tbody > tr');

    $rows.each(function () {
      var tr = this;

      if (tr.classList.contains('kn-table-group')) return;
      if (tr.classList.contains('scw-inline-photo-row')) return;
      if (tr.classList.contains(WORKSHEET_ROW)) return;

      var recordId = getRecordId(tr);
      if (!recordId) return;
      if (tr.getAttribute(PROCESSED_ATTR) === '1') return;

      var card = buildWorksheetCard(tr, viewCfg);

      var wsTr = document.createElement('tr');
      wsTr.className = WORKSHEET_ROW;
      wsTr.id = tr.id;
      tr.removeAttribute('id');

      // Propagate bucket row classes so worksheet CSS can react
      if (tr.classList.contains('scw-row--assumptions')) wsTr.classList.add('scw-row--assumptions');
      if (tr.classList.contains('scw-row--services'))    wsTr.classList.add('scw-row--services');

      // Tag rows with empty MDF/IDF (move) field BEFORE the td is moved
      var moveTd = findCell(tr, viewCfg.fields.move);
      if (isCellEmpty(moveTd)) wsTr.setAttribute('data-scw-no-move', '1');

      var wsTd = document.createElement('td');

      var headerRow = table.querySelector('thead tr');
      var colCount = 1;
      if (headerRow) {
        colCount = 0;
        var cells = headerRow.children;
        for (var i = 0; i < cells.length; i++) {
          colCount += parseInt(cells[i].getAttribute('colspan') || '1', 10);
        }
      }
      wsTd.setAttribute('colspan', String(colCount));
      wsTd.appendChild(card);
      wsTr.appendChild(wsTd);

      tr.parentNode.insertBefore(wsTr, tr.nextSibling);
      tr.setAttribute(PROCESSED_ATTR, '1');
    });

    // After all rows are processed, hide photo rows for collapsed items
    // and set up the bottom border on the last row of each record group
    var wsRows = table.querySelectorAll('tr.' + WORKSHEET_ROW);
    for (var j = 0; j < wsRows.length; j++) {
      var ws = wsRows[j];
      var photoRow = ws.nextElementSibling;
      if (photoRow && photoRow.classList.contains('scw-inline-photo-row')) {
        // Start collapsed — hide the photo row
        photoRow.classList.add(P + '-photo-hidden');
      }
    }

    // ── SYNTHETIC GROUP HEADERS for ungrouped Assumptions / Services ──
    // In view_3505, rows with an empty MDF/IDF connection (field_2375)
    // that are Assumptions or Services get collected under synthetic
    // group-header rows placed FIRST in the table (before MDF/IDF groups).
    if (viewCfg.viewId === 'view_3505') {
      var tbody = table.querySelector('tbody');
      var colSpan = 1;
      var hdr = table.querySelector('thead tr');
      if (hdr) {
        colSpan = 0;
        var hCells = hdr.children;
        for (var ci = 0; ci < hCells.length; ci++) {
          colSpan += parseInt(hCells[ci].getAttribute('colspan') || '1', 10);
        }
      }

      // Pale blue accent for synthetic groups (matches view accordion style)
      var SYNTH_ACCENT = '#5b9bd5';
      var SYNTH_ACCENT_RGB = '91,155,213';

      // Remove empty native Knack group headers (blank MDF/IDF value)
      // and any orphaned photo rows directly beneath them.
      var nativeGroups = tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1');
      for (var gi = 0; gi < nativeGroups.length; gi++) {
        var grp = nativeGroups[gi];
        if (grp.classList.contains('scw-synthetic-group')) continue;
        var labelText = (grp.textContent || '').replace(/\s+/g, ' ').trim();
        if (labelText.length === 0) {
          // Remove orphaned photo rows that follow this empty header
          var sib = grp.nextElementSibling;
          while (sib && !sib.classList.contains('kn-table-group') &&
                 !sib.classList.contains(WORKSHEET_ROW)) {
            var toRemove = sib;
            sib = sib.nextElementSibling;
            toRemove.remove();
          }
          grp.remove();
        }
      }

      // Helper: build a gray divider row
      function makeDivider() {
        var divTr = document.createElement('tr');
        divTr.className = 'scw-synth-divider';
        var divTd = document.createElement('td');
        divTd.setAttribute('colspan', String(colSpan));
        divTr.appendChild(divTd);
        return divTr;
      }

      // Build synthetic groups in reverse so insertions at top keep order:
      // Project Assumptions first, then Project Services.
      var buckets = [
        { cls: 'scw-row--services',    label: 'Project Services' },
        { cls: 'scw-row--assumptions', label: 'Project Assumptions' }
      ];

      // Track the last inserted row to place the bottom divider after
      var lastInsertedRow = null;
      var anySyntheticBuilt = false;

      buckets.forEach(function (bucket) {
        // Find worksheet rows that belong to this bucket AND have no MDF/IDF.
        var candidates = tbody.querySelectorAll(
          'tr.' + WORKSHEET_ROW + '.' + bucket.cls + '[data-scw-no-move="1"]'
        );
        if (!candidates.length) return;

        anySyntheticBuilt = true;

        // Build a synthetic kn-table-group row styled with pale blue accent
        var groupTr = document.createElement('tr');
        groupTr.className = 'kn-table-group kn-group-level-1 scw-group-header scw-synthetic-group';
        groupTr.style.cssText = '--scw-grp-accent: ' + SYNTH_ACCENT +
          '; --scw-grp-accent-rgb: ' + SYNTH_ACCENT_RGB + ';';
        var groupTd = document.createElement('td');
        groupTd.setAttribute('colspan', String(colSpan));
        groupTd.textContent = bucket.label;
        groupTr.appendChild(groupTd);

        // Collect rows to move (snapshot to avoid live-NodeList issues)
        var rowsToMove = [];
        for (var k = 0; k < candidates.length; k++) {
          var wsRow = candidates[k];
          var origRow = wsRow.previousElementSibling;
          var photoRows = [];
          var nxt = wsRow.nextElementSibling;
          while (nxt && nxt.classList.contains('scw-inline-photo-row')) {
            photoRows.push(nxt);
            nxt = nxt.nextElementSibling;
          }
          rowsToMove.push({
            orig: (origRow && origRow.getAttribute(PROCESSED_ATTR) === '1') ? origRow : null,
            ws: wsRow,
            photos: photoRows
          });
        }

        // Insert the group header at the very top of tbody
        var firstChild = tbody.firstChild;
        tbody.insertBefore(groupTr, firstChild);

        // Insert each row set right after the group header (in order)
        var insertRef = groupTr;
        for (var m = 0; m < rowsToMove.length; m++) {
          var set = rowsToMove[m];
          if (set.orig) {
            insertRef.parentNode.insertBefore(set.orig, insertRef.nextSibling);
            insertRef = set.orig;
          }
          insertRef.parentNode.insertBefore(set.ws, insertRef.nextSibling);
          insertRef = set.ws;
          for (var p = 0; p < set.photos.length; p++) {
            insertRef.parentNode.insertBefore(set.photos[p], insertRef.nextSibling);
            insertRef = set.photos[p];
          }
        }
        lastInsertedRow = insertRef;
      });

      // Insert gray divider bars around the synthetic section
      if (anySyntheticBuilt) {
        // Bottom divider: after the last synthetic group's rows
        if (lastInsertedRow && lastInsertedRow.nextSibling) {
          tbody.insertBefore(makeDivider(), lastInsertedRow.nextSibling);
        } else if (lastInsertedRow) {
          tbody.appendChild(makeDivider());
        }
      }
    }

    // ── RESTORE EXPANDED STATE ──
    // Re-expand detail panels that were open before the inline-edit
    // re-render.  Must run AFTER all worksheet rows + photo rows are
    // built so toggleDetail can find and show the photo row too.
    restoreExpandedState(viewCfg.viewId);

    // ── RE-APPLY GROUP COLLAPSE STATE ──
    // transformView creates new DOM rows that are visible by default.
    // Group-collapse may have already run and set .scw-collapsed on
    // headers before these rows existed.  Explicitly re-enhance so
    // collapsed groups properly hide their new content rows.
    if (window.SCW && window.SCW.groupCollapse && window.SCW.groupCollapse.enhance) {
      window.SCW.groupCollapse.enhance();
    }

    // ── RESTORE CACHED HEADER LABELS ──
    // If a trigger-field save caused this re-render, the rebuilt DOM
    // may have stale formula data.  Re-apply labels from our cache
    // (populated from the PUT response) now that the DOM is stable.
    restoreCachedLabels(viewCfg.viewId);
  }

  // ============================================================
  // DELEGATED CLICK HANDLER FOR ACCORDION TOGGLE
  // ============================================================
  // ONLY the toggle-zone (chevron + identity) toggles the detail
  // panel.  All other clicks in the summary bar are left alone so
  // Knack / KTL inline edit can work without interference.

  $(document).on('click' + EVENT_NS, '.' + P + '-toggle-zone', function (e) {
    e.preventDefault();
    var wsTr = this.closest('tr.' + WORKSHEET_ROW);
    if (wsTr) {
      toggleDetail(wsTr);
    }
  });

  // ============================================================
  // INIT
  // ============================================================

  function init() {
    injectStyles();

    WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
      var viewId = viewCfg.viewId;

      $(document)
        .off('knack-view-render.' + viewId + EVENT_NS)
        .on('knack-view-render.' + viewId + EVENT_NS, function () {
          setTimeout(function () { transformView(viewCfg); }, 150);
        });

      $(document)
        .off('knack-cell-update.' + viewId + EVENT_NS)
        .on('knack-cell-update.' + viewId + EVENT_NS, function () {
          // Capture expanded panel state BEFORE Knack re-renders.
          // transformView will restore it after rebuilding.
          captureExpandedState(viewId);
        });

      if ($('#' + viewId).length) {
        setTimeout(function () { transformView(viewCfg); }, 150);
      }
    });
  }

  // Capture ALL worksheet view states on ANY cell-update, because
  // refresh-on-inline-edit.js may trigger model.fetch() on sibling
  // views — causing them to re-render even though the edit wasn't
  // on their view.  The per-view handler above handles the edited
  // view; this generic handler covers the cross-refresh case.
  $(document)
    .off('knack-cell-update' + EVENT_NS + 'All')
    .on('knack-cell-update' + EVENT_NS + 'All', function () {
      captureAllExpandedStates();
    });

  if (document.readyState === 'loading') {
    $(document).ready(init);
  } else {
    init();
  }

  // ── Expose API for coordination with post-edit restore ──
  window.SCW = window.SCW || {};
  window.SCW.deviceWorksheet = {
    /** Capture expanded panel state for all worksheet views. */
    captureState: captureAllExpandedStates,
    /** Force re-transform a view (idempotent). */
    refresh: function (viewId) {
      WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
        if (!viewId || viewCfg.viewId === viewId) {
          transformView(viewCfg);
        }
      });
    }
  };
})();
// ============================================================
// End Device Worksheet
// ============================================================
/*************************** DYNAMIC CELL COLORS – EMPTY / ZERO FIELD HIGHLIGHTING *******************************/
(function () {
  'use strict';

  const EVENT_NS = '.scwDynCellColors';

  // ===========================================================
  // PALETTE
  // ===========================================================
  const COLORS = {
    good:    '#d4edda', // pale green
    bad:     '#f8d7da', // pale red
    danger:  '#f8d7da', // alias for bad – pale red
    warning: '#fff3cd'  // pale yellow
  };

  const COLOR_CLASSES = {
    good:    'scw-cell-good',
    bad:     'scw-cell-bad',
    danger:  'scw-cell-danger',
    warning: 'scw-cell-warning'
  };

  const ALL_COLOR_CLASSES = Object.values(COLOR_CLASSES).join(' ');

  // ===========================================================
  // VIEW / FIELD CONFIG
  // Each view entry contains an array of rules.
  //   fieldKey  – the Knack field id (matched via data-field-key attribute)
  //   when      – "empty" | "zero" (what triggers the color)
  //   color     – key from COLORS (or a raw CSS color string)
  // ===========================================================
  const VIEWS = [
    {
      viewId: 'view_3505',
      rules: [
        { fieldKey: 'field_2400', when: 'empty', color: 'danger'  },
        { fieldKey: 'field_2400', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_2415', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2399', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_771', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2409', when: 'empty', color: 'danger' }
      ]
    },
    {
      viewId: 'view_3512',
      rules: [
        { fieldKey: 'field_2400', when: 'empty', color: 'danger'  },
        { fieldKey: 'field_2400', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_2415', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2399', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_771', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2409', when: 'empty', color: 'danger' }
      ]
    },
    {
      viewId: 'view_3517',
      rules: [
        { fieldKey: 'field_2400', when: 'empty', color: 'danger'  },
        { fieldKey: 'field_2400', when: 'zero',  color: 'warning' },
        { fieldKey: 'field_2415', when: 'empty', color: 'warning' },
        { fieldKey: 'field_2399', when: 'zero',  color: 'warning' }
      ]
    }
  ];

  // ============================================================
  // HELPERS
  // ============================================================

  /** Resolve a color key to a CSS value. */
  function resolveColor(colorKey) {
    return COLORS[colorKey] || colorKey;
  }

  /**
   * Normalize cell text by replacing non-breaking spaces and other
   * invisible / zero-width characters with regular spaces, then trim.
   */
  function normalizeText(raw) {
    return raw.replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ').trim();
  }

  /** Return true when the cell should be considered "empty". */
  function isCellEmpty($td) {
    // Connection / image fields: if real <img> elements exist the cell
    // has content regardless of surrounding text.
    if ($td.find('img').length) return false;

    var t = normalizeText($td.text());
    return t === '' || t === '-' || t === '—';
  }

  /** Return true when the cell text represents zero. */
  function isZero(text) {
    const t = normalizeText(text);
    // Handle plain "0", "$0", "$0.00", "0.00", "0.0", etc.
    return /^[\$]?0+(\.0+)?$/.test(t);
  }

  function matchesCondition($td, when) {
    if (when === 'empty') return isCellEmpty($td);
    if (when === 'zero')  return isZero($td.text());
    return false;
  }

  // ============================================================
  // INJECT STYLES (so color classes win over worksheet !important)
  // ============================================================
  (function injectColorStyles() {
    if (document.getElementById('scw-dyn-cell-color-css')) return;
    var style = document.createElement('style');
    style.id = 'scw-dyn-cell-color-css';
    // Selectors use tr.scw-ws-row .scw-ws-card td (0,3,2) to beat
    // the worksheet's tr.scw-ws-row .scw-ws-card td (0,2,1) even
    // when the worksheet stylesheet appears later in the DOM.
    style.textContent =
      'tr.scw-ws-row .scw-ws-card td.scw-cell-good,    tr td.scw-cell-good    { background-color: ' + COLORS.good    + ' !important; }\n' +
      'tr.scw-ws-row .scw-ws-card td.scw-cell-bad,     tr td.scw-cell-bad     { background-color: ' + COLORS.bad     + ' !important; }\n' +
      'tr.scw-ws-row .scw-ws-card td.scw-cell-danger,  tr td.scw-cell-danger  { background-color: ' + COLORS.danger  + ' !important; }\n' +
      'tr.scw-ws-row .scw-ws-card td.scw-cell-warning, tr td.scw-cell-warning { background-color: ' + COLORS.warning + ' !important; }\n';
    document.head.appendChild(style);
  })();

  // ============================================================
  // CORE
  // ============================================================

  function applyColorsForView(viewCfg) {
    var viewId = viewCfg.viewId;
    var rules  = viewCfg.rules;
    var $view  = $('#' + viewId);
    if (!$view.length) return;

    var $rows = $view.find('table.kn-table-table tbody tr');
    if (!$rows.length) return;

    $rows.each(function () {
      var $tr = $(this);

      // Skip group / header rows
      if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

      rules.forEach(function (rule) {
        var $td = $tr.find('td[data-field-key="' + rule.fieldKey + '"]');
        if (!$td.length) return;

        if (matchesCondition($td, rule.when)) {
          $td.removeClass(ALL_COLOR_CLASSES);
          var cls = COLOR_CLASSES[rule.color];
          if (cls) $td.addClass(cls);
          $td.css('background-color', resolveColor(rule.color));
        }
      });
    });
  }

  function applyWithRetries(viewCfg, tries) {
    tries = tries || 12;
    var i = 0;
    (function tick() {
      i++;
      applyColorsForView(viewCfg);
      if (i < tries) setTimeout(tick, 250);
    })();
  }

  // Re-apply after KTL / Knack tbody mutations
  function installObserver(viewCfg) {
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;
    if ($view.data('scwDynColorsObs')) return;
    $view.data('scwDynColorsObs', true);

    var el = $view.find('table.kn-table-table tbody').get(0);
    if (!el) return;

    var obs = new MutationObserver(function () {
      applyColorsForView(viewCfg);
    });
    obs.observe(el, { childList: true, subtree: true });
  }

  // ============================================================
  // INIT
  // ============================================================
  VIEWS.forEach(function (viewCfg) {
    var viewId = viewCfg.viewId;

    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        applyWithRetries(viewCfg);
        installObserver(viewCfg);
      });
  });
})();
/***************************** DYNAMIC CELL COLORS – EMPTY / ZERO FIELD HIGHLIGHTING *******************************/

(function () {
  const applyCheckboxGrid = () => {
    document.querySelectorAll('#connection-picker-checkbox-field_739').forEach(container => {
      if (!container.classList.contains('multi-column-processed')) {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(4, 1fr)';
        container.style.gap = '0.5em';
        container.classList.add('multi-column-processed');

        container.querySelectorAll('.control').forEach(ctrl => {
          ctrl.style.marginBottom = '0.25em';
        });
      }
    });
  };

  // MutationObserver to watch for popups / form changes
  const observer = new MutationObserver(() => applyCheckboxGrid());

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Apply once on DOM ready
  document.addEventListener('DOMContentLoaded', applyCheckboxGrid);
})();


/**************************************************************************************************
 * FEATURE: “Scene section” expand/collapse (legacy)
 * - Toggles view sections using .view-header as a clickable accordion
 **************************************************************************************************/

/** BINDINGS: call addSceneExpandCollapse(view) on view render */
(function bind_sceneExpandCollapse() {
  // Admin
  $(document).on('knack-view-render.view_1218', function (event, view, data) { addSceneExpandCollapse(view); });

  // Micah's Shit
  $(document).on('knack-view-render.view_1190', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1584', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1559', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1380', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_760',  function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1212', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_462',  function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1049', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1314', function (event, view, data) { addSceneExpandCollapse(view); });

  // Project Dashboard
  $(document).on('knack-view-render.view_1224', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1498', function (event, view, data) { addSceneExpandCollapse(view); });

  // Job Reports (AVL / TRIAD)
  $(document).on('knack-view-render.view_845',  function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1231', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1257', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1420', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1392', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1418', function (event, view, data) { addSceneExpandCollapse(view); });

  // Job Reports > In Work
  $(document).on('knack-view-render.view_1302', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1309', function (event, view, data) { addSceneExpandCollapse(view); });

  // Service Calls & Troubleshooting
  $(document).on('knack-view-render.view_1361', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1411', function (event, view, data) { addSceneExpandCollapse(view); });

  // Project Summary
  $(document).on('knack-view-render.view_1185', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1368', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_1710', function (event, view, data) { addSceneExpandCollapse(view); });
  $(document).on('knack-view-render.view_899',  function (event, view, data) { addSceneExpandCollapse(view); });

  // Build Quote
  $(document).on('knack-view-render.view_2812', function (event, view, data) { addSceneExpandCollapse(view); });

})();

/** IMPLEMENTATION: addSceneExpandCollapse(view) */
var addSceneExpandCollapse = function (view) {
  $('#' + view.key + ' .view-header').css("cursor", "pointer");

  $('#' + view.key + " .view-header h2").each(function () {
    if ($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }
  });

  // Collapse by default
  $('#' + view.key + ' .view-header').nextUntil('.view-header').toggle();

  // Toggle on click (+/-)
  $('#' + view.key + ' .view-header').click(function () {
    $(this).nextUntil('.view-header').toggle();

    if ($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
};

/** DUPLICATE/ALT IMPLEMENTATION (kept for legacy reasons)
 * - addSceneExpandCollapseMultiple is functionally the same as addSceneExpandCollapse
 */
var addSceneExpandCollapseMultiple = function (view) {
  $('#' + view.key + ' .view-header').css("cursor", "pointer");

  $('#' + view.key + " .view-header h2").each(function () {
    if ($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o"; ></i>&nbsp;' + RowText);
    }
  });

  $('#' + view.key + ' .view-header').nextUntil('.view-header').toggle();

  $('#' + view.key + ' .view-header').click(function () {
    $(this).nextUntil('.view-header').toggle();

    if ($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
};
/*** END FEATURE: “Scene section” expand/collapse *********************************************************/


/**************************************************************************************************
 * FEATURE: Add row selection checkboxes to a table (utility)
 * ⚠ NOTE: This function is defined AGAIN later in your original blob.
 * Keeping one canonical copy is strongly recommended.
 **************************************************************************************************/
var addCheckboxes = function (view) {
  // add checkbox in header (select/unselect all)
  $('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');

  $('#' + view.key + '.kn-table thead input').change(function () {
    $('.' + view.key + '.kn-table tbody tr input').each(function () {
      $(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
    });
  });

  // add checkbox to each row in the table body
  $('#' + view.key + '.kn-table tbody tr').each(function () {
    $(this).prepend('<td><input type="checkbox"></td>');
  });
};
/*** END FEATURE: Add row selection checkboxes ************************************************************/


/**************************************************************************************************
 * FEATURE: Add row selection checkboxes to a table (utility)
 * ⚠ NOTE: This function is defined AGAIN later in your original blob.
 * Keeping one canonical copy is strongly recommended.
 **************************************************************************************************/
var addCheckboxes = function (view) {
  // add checkbox in header (select/unselect all)
  $('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');

  $('#' + view.key + '.kn-table thead input').change(function () {
    $('.' + view.key + '.kn-table tbody tr input').each(function () {
      $(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
    });
  });

  // add checkbox to each row in the table body
  $('#' + view.key + '.kn-table tbody tr').each(function () {
    $(this).prepend('<td><input type="checkbox"></td>');
  });
};
/*** END FEATURE: Add row selection checkboxes ************************************************************/



/**************************************************************************************************
 * FEATURE: Bulk actions on table rows (Assign Photos to Run / Get Photos from TLS)
 * - Uses addCheckboxes(view) utility above
 * ⚠ NOTE: Original had stray “P” after Knack.hideSpinner(); leaving as-is is unsafe.
 **************************************************************************************************/

/** view_2179: Assign Photos to Run (Make/Integromat webhook) */
(function assignPhotosToRun_view2179() {
  $(document).on('knack-view-render.view_2179', function (event, view) {
    $('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="assignphotos"">Assign Photos to Run</button>')
      .insertAfter('#view_2179 > div.view-header > h2');

    addCheckboxes(view);

    $('#assignphotos').click(function () {
      var record_ids = [];
      var runID = window.location.href.split('/')[window.location.href.split('/').length - 2];

      $('#' + view.key + ' tbody input[type=checkbox]:checked').each(function () {
        record_ids.push($(this).closest('tr').attr('id'));
      });

      commandURL = "https://hook.integromat.com/ecrm451p73bbgy6it4iu8iwpnpqh1vdf?recordid=" + record_ids + "&runID=" + runID;

      $.get(commandURL, function (data, status) {
        Knack.hideSpinner();
      });

      Knack.showSpinner();

      var selectedRecords = record_ids.length;

      setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
      alert('Integromat is updating ' + selectedRecords + ' records. Depending on how many photos you are updating this could take a few minutes');
      Knack.hideSpinner(); // ⚠ removed stray “P”
    });
  });
})();

/** view_1378: Get Photos from TLS WO (Make/Integromat webhook) */
(function getPhotosFromTLS_view1378() {
  $(document).on('knack-view-render.view_1378', function (event, view) {
    $('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="getTLSPhotos"">Get Photos from TLS WO</button>')
      .insertAfter('#view_1378 > div.view-header > h2');

    $('#getTLSPhotos').click(function () {
      var projectID = window.location.href.split('/')[window.location.href.split('/').length - 2];
      var tlWO = prompt("What is the TLS WO ID?:");

      commandURL = "https://hook.integromat.com/bp83h6wunhoa9oc2ubm5hwklbc8u775i?projectID=" + projectID + "&tlWO=" + tlWO;

      $.get(commandURL, function (data, status) {
        Knack.hideSpinner();
      });

      Knack.showSpinner();

      setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
      alert('Integromat is going to download photos from ' + tlWO + ' . Depending on how many photos there are it could take a moment for this to complete. ');
      Knack.hideSpinner(); // ⚠ removed stray “P”
    });
  });
})();
