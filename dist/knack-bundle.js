// src/config.js
window.SCW = window.SCW || {};
window.SCW.CONFIG = window.SCW.CONFIG || {
  VERSION: "dev",
  MAKE_PHOTO_MOVE_WEBHOOK: "https://hook.us1.make.com/7oetygbj2g2hu5fspgtt5kcydjojid81",
  MAKE_DELETE_RECORD_WEBHOOK: "https://hook.us1.make.com/uyxdq04zudssvoatvnwywxcjxxil15q7"
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

// ── Authenticated Knack AJAX wrapper ─────────────────────────
// Detects 401/403 "Invalid token" responses and shows a
// non-intrusive toast prompting the user to log out and back in.
(function (namespace) {
  var TOAST_ID = 'scw-session-toast';
  var RETURN_KEY = 'scw-session-return';
  var _toastVisible = false;

  /** After login, redirect back to the page the user was on. */
  function checkReturnRedirect() {
    var returnHash = sessionStorage.getItem(RETURN_KEY);
    if (returnHash && window.location.hash !== '#logout') {
      sessionStorage.removeItem(RETURN_KEY);
      window.location.hash = returnHash;
    }
  }
  // Run on load — if we're returning from a re-login, restore the page
  checkReturnRedirect();

  function showSessionToast() {
    if (_toastVisible) return;
    _toastVisible = true;

    var el = document.createElement('div');
    el.id = TOAST_ID;
    el.innerHTML =
      '<span>Session expired &mdash; save failed. Please log out and back in.</span>' +
      '<button id="scw-session-logout">Log out &amp; come back</button>' +
      '<button id="scw-session-dismiss">&times;</button>';

    var css =
      '#' + TOAST_ID + '{' +
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100000;' +
        'display:flex;align-items:center;gap:12px;' +
        'background:#b91c1c;color:#fff;padding:12px 20px;border-radius:8px;' +
        'font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.35);}' +
      '#scw-session-logout{' +
        'background:#fff;color:#b91c1c;border:none;border-radius:4px;' +
        'padding:6px 14px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;}' +
      '#scw-session-dismiss{' +
        'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;' +
        'padding:0 0 0 4px;line-height:1;}';

    var style = document.createElement('style');
    style.textContent = css;
    el.prepend(style);

    document.body.appendChild(el);

    document.getElementById('scw-session-logout').addEventListener('click', function () {
      // Save current page so we can return after re-login
      sessionStorage.setItem(RETURN_KEY, window.location.hash);
      window.location.hash = '#logout';
    });
    document.getElementById('scw-session-dismiss').addEventListener('click', function () {
      el.remove();
      _toastVisible = false;
    });
  }

  /**
   * SCW.knackAjax(options)
   *
   * Drop-in wrapper around $.ajax that:
   *   1. Auto-adds Knack auth headers
   *   2. Detects 401/403 auth failures and shows a reload toast
   *   3. Still calls the caller's error/success callbacks
   *
   * Options are the same as $.ajax, except:
   *   - `headers` are merged with the Knack auth headers (caller wins)
   *   - An extra `error403` callback can be provided (called on auth failures only)
   */
  namespace.knackAjax = function knackAjax(opts) {
    if (typeof Knack === 'undefined') return;

    var callerError = opts.error;

    var defaults = {
      contentType: 'application/json',
      headers: {
        'X-Knack-Application-Id': Knack.application_id,
        'x-knack-rest-api-key': 'knack',
        'Authorization': Knack.getUserToken()
      }
    };

    // Merge headers — caller overrides win
    var merged = $.extend(true, {}, defaults, opts);

    merged.error = function (xhr) {
      if (xhr.status === 401 || xhr.status === 403) {
        var body = '';
        try { body = xhr.responseText || ''; } catch (e) { /* ignore */ }
        if (/invalid token|reauthenticate/i.test(body)) {
          console.warn('[SCW] Auth expired — prompting reload');
          showSessionToast();
        }
      }
      if (typeof callerError === 'function') callerError.apply(this, arguments);
    };

    return $.ajax(merged);
  };

  /**
   * Build a standard Knack record URL for a view-based PUT/GET.
   */
  namespace.knackRecordUrl = function (viewId, recordId) {
    return Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
           '/views/' + viewId + '/records/' + recordId;
  };

  // ── Global 401/403 interceptor ──
  // Catches auth failures from ANY AJAX/fetch call (including KTL bulk ops)
  // and shows the session-expired toast.

  // 1) jQuery $.ajax errors
  $(document).ajaxError(function (event, xhr, settings) {
    if (xhr.status === 401 || xhr.status === 403) {
      var url = settings.url || '';
      if (url.indexOf('knack.com') !== -1 || url.indexOf('/v1/') !== -1) {
        showSessionToast();
      }
    }
  });

  // 2) fetch() errors — KTL uses fetch for bulk delete/write operations
  var _origFetch = window.fetch;
  if (typeof _origFetch === 'function') {
    window.fetch = function scwFetchInterceptor(input, init) {
      return _origFetch.apply(this, arguments).then(function (response) {
        if (response.status === 401 || response.status === 403) {
          var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
          if (url.indexOf('knack.com') !== -1 || url.indexOf('/v1/') !== -1) {
            console.warn('[SCW] Auth failure (' + response.status + ') on fetch: ' + url);
            showSessionToast();
          }
        }
        return response;
      });
    };
  }
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
// ============================================================
// Remember KTL hide/show view collapsed / open state
// ================================================================
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

    // Skip views managed by ktl-accordion.js — it has its own
    // persistence and restoring here would fight it (toggling the
    // button inverts the state ktl-accordion already set).
    var btn = document.getElementById('hideShow_' + viewKey + '_button');
    if (btn && btn.closest('.scw-ktl-accordion')) {
      restoredThisRender[viewKey] = true;
      return;
    }

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
    var $btn = $(btn);
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
  // Scoped to #knack-dist (Knack's main content area) instead of
  // document.body to avoid firing on unrelated DOM mutations.
  // Debounced at 200ms (was rAF ~16ms) since button injection
  // happens in batches and we only need to run once after they settle.

  var obsTimer = 0;
  var observer = new MutationObserver(function () {
    if (obsTimer) clearTimeout(obsTimer);
    obsTimer = setTimeout(function () {
      obsTimer = 0;
      restoreAllVisible();
    }, 200);
  });

  var obsRoot = document.getElementById('knack-dist') || document.body;
  observer.observe(obsRoot, { childList: true, subtree: true });

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

    /* Hide KTL bulk-ops controls on scene 1140 */
    #kn-scene_1140 .ktlAddonsDiv {
      display: none !important;
    }
  `;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*************  Global Style Overrides  **************************/
/*** Per-scene visual tweaks — organized by scene ID ***/
(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  //  CSS
  // ══════════════════════════════════════════════════════════════
  var STYLE_ID = 'scw-scene-tweaks-css';
  if (!document.getElementById(STYLE_ID)) {
    var css = `
/* ══════════════════════════════════════════════════════════════
   SCENE 1116 — Sales Edit Proposal
   ══════════════════════════════════════════════════════════════ */

/* ── Totals details view (view_3418) — card ── */
#view_3418 {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  padding: 20px 24px 16px;
  margin-bottom: 0;
}
/* Hide original Knack detail content — replaced by custom layout */
#view_3418 .view-header {
  display: none !important;
}
#view_3418 .kn-details-column {
  display: none !important;
}

/* ── Custom totals layout ── */
.scw-totals-custom {
  font-variant-numeric: tabular-nums;
}
.scw-totals-section-hdr {
  font-size: 12px;
  font-weight: 700;
  color: #163C6E;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 14px 0 4px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 2px;
}
.scw-totals-section-hdr:first-child {
  padding-top: 0;
}
.scw-totals-section-hdr + .scw-totals-subtotal {
  border-top: none;
}
.scw-totals-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 5px 12px;
  font-size: 14px;
}
.scw-totals-row-label {
  color: #64748b;
  font-weight: 500;
}
.scw-totals-row-value {
  font-weight: 500;
  color: #1e293b;
}
.scw-totals-row.is-discount .scw-totals-row-value {
  color: #16a34a;
  font-style: italic;
}
.scw-totals-subtotal {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 12px;
  border-top: 1px solid #e5e7eb;
  margin-top: 2px;
}
.scw-totals-subtotal-label {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.scw-totals-subtotal-value {
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
}
.scw-totals-grand {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 12px 12px 4px;
  border-top: 2px solid #163C6E;
  margin-top: 8px;
}
.scw-totals-grand-label {
  font-size: 13px;
  font-weight: 700;
  color: #163C6E;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.scw-totals-grand-value {
  font-size: 22px;
  font-weight: 800;
  color: #163C6E;
}

/* view_3492 / view_3490 form styling handled by inline-form-recompose.js */
`;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════════════════
  //  JS — restructure view_3418 into grouped financial summary
  // ══════════════════════════════════════════════════════════════
  var NS = '.scwSceneTweaks';

  function createSectionHeader(text) {
    var div = document.createElement('div');
    div.className = 'scw-totals-section-hdr';
    div.textContent = text;
    return div;
  }

  function createRow(label, value, modifier) {
    var div = document.createElement('div');
    div.className = 'scw-totals-row' + (modifier ? ' is-' + modifier : '');
    var lbl = document.createElement('span');
    lbl.className = 'scw-totals-row-label';
    lbl.textContent = label;
    var val = document.createElement('span');
    val.className = 'scw-totals-row-value';
    val.textContent = value;
    div.appendChild(lbl);
    div.appendChild(val);
    return div;
  }

  function createSubtotal(label, value) {
    var div = document.createElement('div');
    div.className = 'scw-totals-subtotal';
    var lbl = document.createElement('span');
    lbl.className = 'scw-totals-subtotal-label';
    lbl.textContent = label;
    var val = document.createElement('span');
    val.className = 'scw-totals-subtotal-value';
    val.textContent = value;
    div.appendChild(lbl);
    div.appendChild(val);
    return div;
  }

  function createGrandTotal(label, value) {
    var div = document.createElement('div');
    div.className = 'scw-totals-grand';
    var lbl = document.createElement('span');
    lbl.className = 'scw-totals-grand-label';
    lbl.textContent = label;
    var val = document.createElement('span');
    val.className = 'scw-totals-grand-value';
    val.textContent = value;
    div.appendChild(lbl);
    div.appendChild(val);
    return div;
  }

  // ── Frontend calculation config ──
  var EQUIPMENT_VIEWS = ['view_3586', 'view_3588'];   // device line-item grids
  var HARDWARE_VIEWS  = ['view_3604'];                 // mounting hardware grid
  var ALL_VIEWS       = EQUIPMENT_VIEWS.concat(HARDWARE_VIEWS);
  var LUMP_DISCOUNT_FIELD = 'field_2290';              // additional lump sum discount (view_3490 form)

  /** Parse a currency / number string into a float. Returns 0 for non-numeric. */
  function parseNum(text) {
    if (!text) return 0;
    var raw = String(text).replace(/[^0-9.\-]/g, '');
    var n = parseFloat(raw);
    return isFinite(n) ? n : 0;
  }

  /** Sum a field across all td cells with data-field-key in the given views.
   *  Device-worksheet moves td elements from original rows into card panels,
   *  but each cell appears exactly once per record in the DOM tree. */
  function sumViewField(viewIds, fieldKey) {
    var total = 0;
    for (var v = 0; v < viewIds.length; v++) {
      var container = document.getElementById(viewIds[v]);
      if (!container) { console.log('[scw-totals] container not found:', viewIds[v]); continue; }
      var cells = container.querySelectorAll('td[data-field-key="' + fieldKey + '"]');
      console.log('[scw-totals]', viewIds[v], fieldKey, '→', cells.length, 'cells');
      for (var i = 0; i < cells.length; i++) {
        var val = parseNum(cells[i].textContent);
        console.log('  [' + i + ']', cells[i].textContent.trim(), '→', val);
        total += val;
      }
    }
    console.log('[scw-totals] SUM', fieldKey, '=', total);
    return total;
  }

  /** Read the lump sum discount from the view_3490 form input. */
  function getLumpDiscount() {
    var input = document.querySelector('#view_3490 #' + LUMP_DISCOUNT_FIELD);
    if (input) return parseNum(input.value);
    var wrapped = document.querySelector('#view_3490 input[name="' + LUMP_DISCOUNT_FIELD + '"]');
    if (wrapped) return parseNum(wrapped.value);
    return 0;
  }

  function formatMoney(n) {
    return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Calculate totals from Knack model data and build the custom layout. */
  function restructureTotals() {
    var view = document.getElementById('view_3418');
    if (!view) return;

    // Remove previous custom layout if rebuilding after re-render
    var existing = view.querySelector('.scw-totals-custom');
    if (existing) existing.remove();

    // ── Calculate from DOM cells ──
    var retail       = sumViewField(ALL_VIEWS, 'field_1960');        // retail price (devices + hardware)
    var lineDiscount = sumViewField(EQUIPMENT_VIEWS, 'field_2303');  // device applied discount
    var hwDiscount   = sumViewField(HARDWARE_VIEWS, 'field_2267');   // hardware effective discount
    var lumpDiscount = getLumpDiscount();
    var discount     = Math.abs(lineDiscount) + Math.abs(hwDiscount) + Math.abs(lumpDiscount);
    var discountPct  = retail > 0 ? (discount / retail * 100) : 0;
    var eqSubtotal   = retail - discount;
    var installTotal = sumViewField(EQUIPMENT_VIEWS, 'field_2028');  // per-row installation fee
    var projTotal    = eqSubtotal + installTotal;

    var layout = document.createElement('div');
    layout.className = 'scw-totals-custom';

    var h2 = document.createElement('h2');
    h2.textContent = 'Totals';
    h2.style.cssText = 'font-size:18px;font-weight:700;color:#163C6E;margin:0 0 12px;';
    layout.appendChild(h2);

    // ── EQUIPMENT ──
    layout.appendChild(createSectionHeader('Equipment'));
    layout.appendChild(createRow('Retail', formatMoney(retail)));
    if (discount > 0) {
      var discountDisplay = '- ' + formatMoney(discount);
      if (discountPct > 0) discountDisplay += ' (' + discountPct.toFixed(1) + '%)';
      layout.appendChild(createRow('Discount', discountDisplay, 'discount'));
    }
    layout.appendChild(createSubtotal('Subtotal', formatMoney(eqSubtotal)));

    // ── INSTALLATION ──
    layout.appendChild(createSectionHeader('Installation'));
    layout.appendChild(createSubtotal('Subtotal', formatMoney(installTotal)));

    // ── PROJECT TOTAL ──
    layout.appendChild(createGrandTotal('Project Total', formatMoney(projTotal)));

    view.appendChild(layout);
  }

  // Expose for external callers (e.g. refresh-view-on-form-submit.js)
  window.SCW = window.SCW || {};
  SCW.restructureTotals = restructureTotals;

  // ── Bind ──
  // Debounced wrapper so we only run once after all views finish rendering
  var _totalsTimer = null;
  function debouncedTotals() {
    clearTimeout(_totalsTimer);
    _totalsTimer = setTimeout(restructureTotals, 300);
  }

  if (window.SCW && SCW.onViewRender) {
    // Trigger after the totals container renders
    SCW.onViewRender('view_3418', debouncedTotals, NS);
    // Trigger after each equipment/hardware grid renders (these contain the actual data cells)
    for (var ev = 0; ev < ALL_VIEWS.length; ev++) {
      SCW.onViewRender(ALL_VIEWS[ev], debouncedTotals, NS);
    }
  } else {
    $(document).ready(function () {
      setTimeout(restructureTotals, 1000);
    });
  }
})();
/*** Percent Field Format — global % field handling ***/
/*** TEMPORARILY DISABLED — revisit later ***/
(function () {
  'use strict';
  return; // ← disabled: all percent field manipulation paused

  var NS = '.scwPctFmt';
  var APPLIED_ATTR = 'data-scw-pct';
  var SUBMIT_BOUND = 'data-scw-pct-submit';

  // ══════════════════════════════════════════════════════════════
  //  CONFIG — field IDs that are percent fields (Knack stores decimal)
  // ══════════════════════════════════════════════════════════════

  var PERCENT_FIELDS = [
    'field_2276',
    'field_2261'
  ];

  var PCT_SET = {};
  for (var i = 0; i < PERCENT_FIELDS.length; i++) {
    PCT_SET[PERCENT_FIELDS[i]] = true;
  }

  // ══════════════════════════════════════════════════════════════
  //  CONVERSION HELPERS
  // ══════════════════════════════════════════════════════════════

  /** Knack raw (0.05) → display whole number ("5"). */
  function knackToDisplay(raw) {
    var s = String(raw).replace(/[%\s]/g, '');
    var num = parseFloat(s);
    if (isNaN(num)) return raw;
    return String(Math.round(num * 100 * 10000) / 10000);
  }

  // ══════════════════════════════════════════════════════════════
  //  STRATEGY
  // ══════════════════════════════════════════════════════════════
  //
  // Knack reads the DOM input value on form submit (not its model).
  // So we must keep the input value as something Knack accepts as
  // a valid number, and swap to the decimal right before submit.
  //
  //   On load:   Knack raw 0.05 → display "5" in input
  //   Editing:   user types "5" (plain number, no conversion)
  //   On submit: capture-phase handler converts "5" → "0.05",
  //              Knack reads "0.05", saves it as 5%
  //   After re-render: 0.05 → display "5" again

  function convertFormPctInputs(form) {
    for (var j = 0; j < PERCENT_FIELDS.length; j++) {
      var inp = form.querySelector('#' + PERCENT_FIELDS[j]);
      if (!inp) continue;
      var num = parseFloat(String(inp.value).replace(/[%\s]/g, ''));
      if (!isNaN(num)) {
        inp.value = String(num / 100);
      }
    }
  }

  function enhanceInput(input) {
    if (input.getAttribute(APPLIED_ATTR)) return;
    // Only enhance form inputs — skip inline grid edits (inside table cells)
    if (input.closest && input.closest('.kn-table-table')) return;
    input.setAttribute(APPLIED_ATTR, '1');

    // Convert Knack's raw decimal to whole number for display
    input.value = knackToDisplay(input.value);
  }

  // Global capture-phase click interceptor on submit buttons.
  // Fires before Knack's jQuery click handler reads the input values.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.kn-submit button[type="submit"]');
    if (!btn) return;
    var form = btn.closest('form');
    if (!form) return;
    // Only convert if this form has percent inputs
    var hasPct = false;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      if (form.querySelector('#' + PERCENT_FIELDS[i])) { hasPct = true; break; }
    }
    if (hasPct) convertFormPctInputs(form);
  }, true);  // capture phase

  /** Scan the page (or a container) for percent field inputs and enhance them. */
  function scan(container) {
    var root = container || document;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      var inp = root.querySelector('#' + PERCENT_FIELDS[i]);
      if (inp) enhanceInput(inp);
    }
  }

  /** Convert percent inputs to Knack values before submit.
   *  Only needed for programmatic submits (e.g. inline-form-recompose)
   *  where the button click bypasses the normal submit flow. */
  function prepareForSubmit(container) {
    var root = container || document;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      var inp = root.querySelector('#' + PERCENT_FIELDS[i]);
      if (!inp) continue;
      if (inp._scwPctConverted) continue;
      inp._scwPctConverted = true;
      var num = parseFloat(String(inp.value).replace(/[%\s]/g, ''));
      if (!isNaN(num)) {
        inp.value = String(num / 100);
      }
      // Clear flag after a tick
      (function (el) {
        setTimeout(function () { el._scwPctConverted = false; }, 100);
      })(inp);
    }
  }

  /** Re-scan and format after a view re-renders (Knack resets to raw values). */
  function reformatAfterRender(container) {
    var root = container || document;
    for (var i = 0; i < PERCENT_FIELDS.length; i++) {
      var inp = root.querySelector('#' + PERCENT_FIELDS[i]);
      if (inp) {
        inp.removeAttribute(APPLIED_ATTR);
        enhanceInput(inp);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════

  function init() {
    // Scan on any scene render
    $(document).on('knack-scene-render.any' + NS, function () {
      setTimeout(scan, 200);
    });

    // Also scan now in case scenes are already rendered
    scan();
  }

  // ══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════════

  window.SCW = window.SCW || {};
  SCW.pctFormat = {
    isPercentField: function (fieldId) { return !!PCT_SET[fieldId]; },
    prepareForSubmit: prepareForSubmit,
    reformatAfterRender: reformatAfterRender,
    scan: scan
  };

  if (window.SCW && SCW.onSceneRender) {
    init();
  } else {
    $(document).ready(init);
  }
})();
/*** Inline Form Recompose — restyle native Knack forms into a compact panel ***/
(function () {
  'use strict';

  var P = 'scw-ifc';          // prefix for CSS classes
  var NS = '.scwInlineForm';   // event namespace
  var STYLE_ID = P + '-css';
  var APPLIED_ATTR = 'data-' + P;

  // ══════════════════════════════════════════════════════════════
  //  CONFIG — each entry describes one compact panel
  // ══════════════════════════════════════════════════════════════
  var PANELS = [
    {
      scene: 'scene_1116',
      hostViewId: 'view_3418',         // panel inserted beside/after this view
      moduleTitle: 'Adjust Pricing',
      layout: 'side-by-side',          // grid: totals left, controls right
      forms: [
        {
          viewId: 'view_3492',
          compactLabel: 'Global Discount %',
          enterToSubmit: true,
          hideButton: true
        },
        {
          viewId: 'view_3490',
          compactLabel: 'Additional Lump Sum Discount',
          enterToSubmit: true,
          hideButton: true,
          fields: {
            field_2290: { format: 'currency' }
          },
          textareaLabel: 'Discount Note / Reason'
        }
      ]
    }
  ];

  // ══════════════════════════════════════════════════════════════
  //  CSS
  // ══════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = `
/* ── Side-by-side layout ── */
.${P}-layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 16px;
  align-items: stretch;
}
.${P}-layout-left {
  display: flex;
  flex-direction: column;
}
.${P}-layout-left > * {
  flex: 1;
}
.${P}-layout-right {
  display: flex;
  flex-direction: column;
}

/* ── Pricing panel (right column) ── */
.${P}-panel {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  padding: 20px 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
}

/* ── Module title (h2) ── */
.${P}-title {
  font-size: 18px;
  font-weight: 700;
  color: #163C6E;
  margin: 0 0 20px;
}

/* ── Form section ── */
.${P}-panel .${P}-section {
  padding: 0 0 16px;
}
.${P}-panel .${P}-section + .${P}-section {
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}
.${P}-panel .${P}-section:last-child {
  padding-bottom: 0;
}

/* Section label — uppercase control label */
.${P}-label {
  font-size: 11px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

/* ── Textarea group (label + textarea in shared border) ── */
.${P}-ta-group {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  overflow: hidden;
  margin-top: 8px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.${P}-ta-group:focus-within {
  border-color: #163C6E;
  box-shadow: 0 0 0 2px rgba(22,60,110,0.10);
}
.${P}-ta-label {
  font-size: 12px;
  color: #94a3b8;
  padding: 8px 10px 0;
  font-style: italic;
}
.${P}-ta-group textarea {
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}
.${P}-ta-group textarea:focus {
  box-shadow: none !important;
  border: none !important;
}

/* ── Hide native Knack form chrome ── */
.${P}-section .view-header {
  display: none !important;
}
.${P}-section .kn-input > label {
  display: none !important;
}
.${P}-section .kn-instructions,
.${P}-section .kn-form-group .kn-help-text {
  display: none !important;
}
.${P}-section .kn-form-group {
  margin: 0 !important;
  padding: 0 !important;
}
.${P}-section .kn-input {
  margin-bottom: 4px !important;
  padding: 0 !important;
}
.${P}-section .kn-input:last-of-type {
  margin-bottom: 0 !important;
}
.${P}-section .kn-submit {
  margin: 4px 0 0 !important;
  padding: 0 !important;
}
/* Hidden submit button (still in DOM for programmatic click) */
.${P}-section.${P}-hide-btn .kn-submit {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  overflow: hidden !important;
  clip: rect(0,0,0,0) !important;
  white-space: nowrap !important;
  border: 0 !important;
  padding: 0 !important;
  margin: -1px !important;
}

/* ── Restyle native inputs ── */
.${P}-section input[type="text"],
.${P}-section input[type="number"],
.${P}-section input[type="email"],
.${P}-section select {
  font-size: 15px !important;
  font-weight: 500 !important;
  padding: 8px 12px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  background: #fff !important;
  color: #1e293b !important;
  outline: none !important;
  box-shadow: none !important;
  transition: background 0.4s, border-color 0.2s, box-shadow 0.2s;
  height: auto !important;
  line-height: 1.4 !important;
  width: 100% !important;
  max-width: 100% !important;
  font-variant-numeric: tabular-nums;
}
.${P}-section input[type="text"]:hover,
.${P}-section input[type="number"]:hover {
  border-color: #9ca3af !important;
}
.${P}-section input[type="text"]:focus,
.${P}-section input[type="number"]:focus {
  border-color: #163C6E !important;
  box-shadow: 0 0 0 2px rgba(22,60,110,0.10) !important;
}

.${P}-section textarea {
  width: 100% !important;
  font-size: 14px !important;
  padding: 6px 10px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 6px !important;
  background: #fff !important;
  color: #1e293b !important;
  outline: none !important;
  box-shadow: none !important;
  min-height: 48px;
  resize: vertical;
  line-height: 1.5 !important;
  font-family: inherit !important;
  transition: background 0.4s, border-color 0.2s, box-shadow 0.2s;
}
.${P}-section textarea:hover {
  border-color: #9ca3af !important;
}
.${P}-section textarea:focus {
  border-color: #163C6E !important;
  box-shadow: 0 0 0 2px rgba(22,60,110,0.10) !important;
}

/* ── Submit button ── */
.${P}-section .kn-submit button,
.${P}-section .kn-submit input[type="submit"] {
  font-size: 12px !important;
  font-weight: 600 !important;
  padding: 6px 14px !important;
  background: #163C6E !important;
  color: #fff !important;
  border: none !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  white-space: nowrap;
  transition: background 0.15s;
  line-height: 1.4 !important;
  height: auto !important;
  width: auto !important;
}
.${P}-section .kn-submit button:hover,
.${P}-section .kn-submit input[type="submit"]:hover {
  background: rgb(7, 70, 124) !important;
}

/* ── Hide native success/confirmation ── */
.${P}-section .kn-form-confirmation {
  display: none !important;
}
.${P}-section .kn-message.is-danger,
.${P}-section .kn-message.error {
  font-size: 12px !important;
  padding: 6px 12px !important;
  border-radius: 6px !important;
  margin: 6px 0 0 !important;
  background: #fef2f2 !important;
  border: 1px solid #fca5a5 !important;
  color: #991b1b !important;
}

/* ── Hint text ── */
.${P}-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 6px;
}
`;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════════════════
  //  HELPERS
  // ══════════════════════════════════════════════════════════════

  function findSubmitBtn(viewEl) {
    return viewEl.querySelector('.kn-submit button[type="submit"], .kn-submit input[type="submit"]');
  }

  function findFormInputs(viewEl) {
    return viewEl.querySelectorAll(
      '.kn-input input[type="text"], .kn-input input[type="number"], ' +
      '.kn-input input[type="email"], .kn-input textarea, .kn-input select'
    );
  }

  function flashInputs(viewId) {
    var el = document.getElementById(viewId);
    if (!el) return;
    var inputs = findFormInputs(el);
    for (var i = 0; i < inputs.length; i++) {
      (function (inp) {
        inp.style.setProperty('background', '#dcfce7', 'important');
        inp.style.setProperty('border-color', '#4ade80', 'important');
        inp.style.setProperty('transition', 'background 0.5s, border-color 0.5s', 'important');
        setTimeout(function () {
          inp.style.removeProperty('background');
          inp.style.removeProperty('border-color');
          setTimeout(function () { inp.style.removeProperty('transition'); }, 600);
        }, 1500);
      })(inputs[i]);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  FIELD FORMATTING — currency display (percent handled by SCW.pctFormat)
  // ══════════════════════════════════════════════════════════════

  function applyCurrencyFormatting(viewEl, fieldsCfg) {
    if (!fieldsCfg) return;
    for (var fieldId in fieldsCfg) {
      if (!fieldsCfg.hasOwnProperty(fieldId)) continue;
      if (fieldsCfg[fieldId].format !== 'currency') continue;
      var inp = viewEl.querySelector('#' + fieldId);
      if (!inp || inp.getAttribute('data-scw-cur')) continue;
      inp.setAttribute('data-scw-cur', '1');

      var num = parseFloat(String(inp.value).replace(/[$,\s]/g, ''));
      if (!isNaN(num)) inp.value = '$' + num.toFixed(2);

      (function (input) {
        $(input).off('focus' + NS).on('focus' + NS, function () {
          input.value = String(input.value).replace(/[$,\s]/g, '');
          input.select();
        });
        $(input).off('blur' + NS).on('blur' + NS, function () {
          if (input._scwSubmitting) { input._scwSubmitting = false; return; }
          var n = parseFloat(String(input.value).replace(/[$,\s]/g, ''));
          if (!isNaN(n)) input.value = '$' + n.toFixed(2);
        });
      })(inp);
    }
  }

  function prepareCurrencyForSubmit(viewId) {
    var cfg = VIEW_FIELDS[viewId];
    if (!cfg) return;
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;
    for (var fieldId in cfg) {
      if (!cfg.hasOwnProperty(fieldId)) continue;
      if (cfg[fieldId].format !== 'currency') continue;
      var inp = viewEl.querySelector('#' + fieldId);
      if (!inp) continue;
      inp._scwSubmitting = true;
      var n = parseFloat(String(inp.value).replace(/[$,\s]/g, ''));
      if (!isNaN(n)) inp.value = String(n);
      $(inp).trigger('change');
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  LAYOUT — side-by-side wrapper
  // ══════════════════════════════════════════════════════════════

  function ensureLayout(panelCfg) {
    var layoutId = P + '-layout-' + panelCfg.scene;
    var layout = document.getElementById(layoutId);
    var hostView = document.getElementById(panelCfg.hostViewId);
    if (!hostView) return null;

    if (layout) {
      // Verify hostView is still inside our layout
      if (hostView.closest('#' + layoutId)) {
        return {
          layout: layout,
          left: layout.querySelector('.' + P + '-layout-left'),
          right: layout.querySelector('.' + P + '-layout-right')
        };
      }
      // hostView was recreated outside layout — tear down and rebuild
      layout.remove();
    }

    layout = document.createElement('div');
    layout.id = layoutId;
    layout.className = P + '-layout';

    var left = document.createElement('div');
    left.className = P + '-layout-left';

    var right = document.createElement('div');
    right.className = P + '-layout-right';

    hostView.parentNode.insertBefore(layout, hostView);
    left.appendChild(hostView);
    layout.appendChild(left);
    layout.appendChild(right);

    return { layout: layout, left: left, right: right };
  }

  // ══════════════════════════════════════════════════════════════
  //  CORE — enhance one form view in-place, move into panel
  // ══════════════════════════════════════════════════════════════

  function enhanceForm(section, formCfg) {
    var viewEl = document.getElementById(formCfg.viewId);
    if (!viewEl) return false;
    if (viewEl.getAttribute(APPLIED_ATTR) === '1') return false;

    var submitBtn = findSubmitBtn(viewEl);
    var inputs = findFormInputs(viewEl);
    if (!inputs.length) return false;

    viewEl.setAttribute(APPLIED_ATTR, '1');

    if (formCfg.hideButton) {
      section.classList.add(P + '-hide-btn');
    }

    if (submitBtn && formCfg.buttonLabel) {
      submitBtn.textContent = formCfg.buttonLabel;
    }

    // Move the entire view element into our section
    section.appendChild(viewEl);

    // Apply currency formatting
    applyCurrencyFormatting(viewEl, formCfg.fields);

    // Wrap textarea with floating label
    if (formCfg.textareaLabel) {
      var ta = viewEl.querySelector('.kn-input textarea');
      if (ta && !ta.getAttribute('data-scw-ta-wrapped')) {
        ta.setAttribute('data-scw-ta-wrapped', '1');
        var taGroup = document.createElement('div');
        taGroup.className = P + '-ta-group';
        var taLabelEl = document.createElement('div');
        taLabelEl.className = P + '-ta-label';
        taLabelEl.textContent = formCfg.textareaLabel;
        ta.parentNode.insertBefore(taGroup, ta);
        taGroup.appendChild(taLabelEl);
        taGroup.appendChild(ta);
      }
    }

    // On form submit: flash inputs green, lock scroll
    $(document).off('knack-form-submit.' + formCfg.viewId + NS)
               .on('knack-form-submit.' + formCfg.viewId + NS, function () {
      formCfg._submitAt = Date.now();

      flashInputs(formCfg.viewId);
      formCfg._flashOnRender = true;

      // Re-format after Knack re-renders with raw values
      var vid = formCfg.viewId;
      var fCfg = formCfg.fields;
      setTimeout(function () {
        var v = document.getElementById(vid);
        if (v) applyCurrencyFormatting(v, fCfg);
        if (SCW.pctFormat) SCW.pctFormat.reformatAfterRender(v);
      }, 1200);
      setTimeout(function () {
        var v = document.getElementById(vid);
        if (v) applyCurrencyFormatting(v, fCfg);
        if (SCW.pctFormat) SCW.pctFormat.reformatAfterRender(v);
      }, 2500);

      // Lock scroll
      var savedY = window.scrollY;
      var origScrollTo = window.scrollTo;
      var origScrollIntoView = Element.prototype.scrollIntoView;
      window.scrollTo = function () {};
      Element.prototype.scrollIntoView = function () {};
      setTimeout(function () {
        window.scrollTo = origScrollTo;
        Element.prototype.scrollIntoView = origScrollIntoView;
        window.scrollTo(0, savedY);
      }, 2000);
    });

    return true;
  }

  // ══════════════════════════════════════════════════════════════
  //  PANEL BUILDER
  // ══════════════════════════════════════════════════════════════

  function buildPanel(panelCfg) {
    // Delay rebuild if a form just submitted
    for (var d = 0; d < panelCfg.forms.length; d++) {
      var fc = panelCfg.forms[d];
      if (fc._submitAt && (Date.now() - fc._submitAt) < 800) {
        setTimeout(function () { buildPanel(panelCfg); }, 800);
        return;
      }
    }

    var hostView = document.getElementById(panelCfg.hostViewId);
    if (!hostView) return;

    // Set up side-by-side layout if configured
    var cols = null;
    if (panelCfg.layout === 'side-by-side') {
      cols = ensureLayout(panelCfg);
      if (!cols) return;
    }

    // Check if panel already exists and all forms are intact
    var panelId = P + '-' + panelCfg.scene;
    var existingPanel = document.getElementById(panelId);
    if (existingPanel) {
      var allApplied = true;
      for (var c = 0; c < panelCfg.forms.length; c++) {
        var fvEl = document.getElementById(panelCfg.forms[c].viewId);
        if (fvEl && fvEl.getAttribute(APPLIED_ATTR) !== '1') {
          allApplied = false;
          break;
        }
      }
      if (allApplied) return;
      // A form was re-rendered — rebuild the panel
      var insertRef = cols ? cols.right : hostView.parentNode;
      for (var r = 0; r < panelCfg.forms.length; r++) {
        var fv = document.getElementById(panelCfg.forms[r].viewId);
        if (fv && fv.parentElement && fv.parentElement.closest('.' + P + '-panel')) {
          insertRef.insertBefore(fv, existingPanel);
          fv.removeAttribute(APPLIED_ATTR);
        }
      }
      existingPanel.remove();
    }

    // Build the panel
    var panel = document.createElement('div');
    panel.className = P + '-panel';
    panel.id = panelId;

    if (panelCfg.moduleTitle) {
      var title = document.createElement('h2');
      title.className = P + '-title';
      title.textContent = panelCfg.moduleTitle;
      panel.appendChild(title);
    }

    var hasContent = false;
    for (var i = 0; i < panelCfg.forms.length; i++) {
      var formCfg = panelCfg.forms[i];

      var section = document.createElement('div');
      section.className = P + '-section';

      // Check for textarea
      var hasTextarea = false;
      var viewEl = document.getElementById(formCfg.viewId);
      if (viewEl) {
        hasTextarea = !!viewEl.querySelector('.kn-input textarea');
      }

      // Add compact label
      if (formCfg.compactLabel) {
        var label = document.createElement('div');
        label.className = P + '-label';
        label.textContent = formCfg.compactLabel;
        section.appendChild(label);
      }

      if (enhanceForm(section, formCfg)) {
        // Add hint text
        if (formCfg.enterToSubmit) {
          var hint = document.createElement('div');
          hint.className = P + '-hint';
          hint.textContent = hasTextarea
            ? 'press tab or enter to apply \u00b7 shift+enter for newline'
            : 'press tab or enter to apply';
          section.appendChild(hint);
        }
        panel.appendChild(section);
        hasContent = true;
      }
    }

    if (!hasContent) return;

    // Insert panel
    if (cols) {
      cols.right.appendChild(panel);
    } else {
      hostView.insertAdjacentElement('afterend', panel);
    }

    // Flash green on forms that just submitted
    for (var fi = 0; fi < panelCfg.forms.length; fi++) {
      if (panelCfg.forms[fi]._flashOnRender) {
        panelCfg.forms[fi]._flashOnRender = false;
        flashInputs(panelCfg.forms[fi].viewId);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════

  var ENTER_SUBMIT_VIEWS = {};
  var VIEW_FIELDS = {};
  for (var pi = 0; pi < PANELS.length; pi++) {
    for (var fi2 = 0; fi2 < PANELS[pi].forms.length; fi2++) {
      var fc = PANELS[pi].forms[fi2];
      if (fc.enterToSubmit) ENTER_SUBMIT_VIEWS[fc.viewId] = true;
      if (fc.fields) VIEW_FIELDS[fc.viewId] = fc.fields;
    }
  }

  // Document-level keydown (capture phase) — survives Knack re-renders
  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return;
    var isTextarea = (tag === 'textarea');

    var isEnter = (e.key === 'Enter' || e.keyCode === 13);
    var isTab = (e.key === 'Tab' || e.keyCode === 9);

    if (!isEnter && !isTab) return;
    if (isTextarea && isEnter && e.shiftKey) return;

    var el = e.target;
    while (el && el !== document.body) {
      if (el.id && ENTER_SUBMIT_VIEWS[el.id]) {
        var btn = findSubmitBtn(el);
        if (btn) {
          e.preventDefault();
          e.stopImmediatePropagation();
          prepareCurrencyForSubmit(el.id);
          if (SCW.pctFormat) SCW.pctFormat.prepareForSubmit(el);
          flashInputs(el.id);
          btn.click();
        }
        return;
      }
      el = el.parentElement;
    }
  }, true);

  function init() {
    injectStyles();

    for (var p = 0; p < PANELS.length; p++) {
      var panelCfg = PANELS[p];

      SCW.onSceneRender(panelCfg.scene, (function (cfg) {
        return function () {
          setTimeout(function () { buildPanel(cfg); }, 150);
        };
      })(panelCfg), NS);

      // Bind on each form's view render
      for (var f = 0; f < panelCfg.forms.length; f++) {
        SCW.onViewRender(panelCfg.forms[f].viewId, (function (cfg) {
          return function () {
            setTimeout(function () { buildPanel(cfg); }, 150);
          };
        })(panelCfg), NS);
      }

    }
  }

  if (window.SCW && SCW.onViewRender) {
    init();
  } else {
    $(document).ready(init);
  }
})();
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
  var DISABLED_ACCORDION_SCENES = { scene_828: true, scene_833: true, scene_873: true, scene_1149: true };

  // Views where the record count pill is hidden (set to true to hide)
  var HIDE_COUNT = {};

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
      '  width: 100%;',
      '  max-width: 100%;',
      '}',
      /* When expanded, allow dropdowns (Chosen.js) to overflow */
      '.scw-ktl-accordion.is-expanded {',
      '  overflow: visible;',
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
      /* Let dropdowns overflow the body when accordion is open */
      '.scw-ktl-accordion.is-expanded > .scw-ktl-accordion__body {',
      '  overflow: visible;',
      '}',

      /* Ensure tables stretch to fill the accordion body */
      '.scw-ktl-accordion__body .kn-table-wrapper {',
      '  width: 100%;',
      '}',
      '.scw-ktl-accordion__body table.kn-table {',
      '  width: 100%;',
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
      // If device-worksheet has transformed this view, count only the
      // worksheet rows (scw-ws-row) — otherwise we'd double-count
      // because the original Knack <tr> rows are hidden but still present.
      var wsRows = tbody.querySelectorAll('tr.scw-ws-row');
      if (wsRows.length) return wsRows.length;

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
    // Skip expand/collapse sync while applySavedState is active —
    // prevents the MutationObserver from undoing the restored state.
    if (!_restoreActive) {
      var expanded = isExpanded(viewKey);
      wrapper.classList.toggle('is-expanded', expanded);
      header.setAttribute('aria-expanded', String(expanded));

      var bodyEl = wrapper.querySelector('.scw-ktl-accordion__body');
      if (bodyEl) bodyEl.style.display = expanded ? '' : 'none';
    }

    // Count pill (hidden for views listed in HIDE_COUNT)
    var countEl = header.querySelector('.scw-acc-count');
    if (countEl) {
      if (HIDE_COUNT[viewKey]) {
        countEl.style.display = 'none';
      } else {
        var count = computeCount(viewKey);
        if (count !== null) {
          countEl.textContent = count;
          countEl.style.display = '';
        } else {
          countEl.style.display = 'none';
        }
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

  // ── Persistent accordion state ──────────────────────────────
  // Accordion state is stored in localStorage so it survives
  // browser close, not just page refreshes.
  // The in-memory _savedCollapsed is still used as a fast-path
  // for the coordinated post-edit restore flow.

  var STORAGE_KEY = 'scw_ktl_accordion_state';
  var _savedCollapsed = null;  // transient snapshot for post-edit flow
  var _restoreActive = false;  // suppress syncState during restore window

  // Migrate from sessionStorage → localStorage (one-time)
  try {
    var legacy = sessionStorage.getItem(STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) { /* ignore */ }

  /** Read persisted state from localStorage. */
  function loadPersistedState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  /** Write state to localStorage. */
  function persistState(stateMap) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateMap));
    } catch (e) { /* quota / unavailable */ }
  }

  /** Scan current DOM and persist accordion states.
   *  Returns a map of viewKey → true (collapsed) / false (expanded).
   *  Both states are recorded so applySavedState can distinguish
   *  "user explicitly left this open" from "never toggled (no entry)". */
  function persistCurrentState() {
    var stateMap = {};
    var wrappers = document.querySelectorAll('.scw-ktl-accordion');
    for (var i = 0; i < wrappers.length; i++) {
      var hdr = wrappers[i].querySelector('.scw-ktl-accordion__header');
      if (!hdr) continue;
      var vk = hdr.getAttribute('data-view-key');
      if (vk) {
        stateMap[vk] = !wrappers[i].classList.contains('is-expanded');
      }
    }
    persistState(stateMap);
    return stateMap;
  }

  function snapshotState() {
    _savedCollapsed = persistCurrentState();
    log('snapshotState', _savedCollapsed);
  }

  function applySavedState() {
    // Use in-memory snapshot if available (post-edit flow),
    // otherwise fall back to sessionStorage (page refresh).
    var saved = _savedCollapsed || loadPersistedState();
    var isPostEdit = !!_savedCollapsed;   // in-memory snapshot = post-edit
    _savedCollapsed = null;

    if (!saved) return;

    // Block syncState from overriding our state while we apply it
    // (MutationObserver fires enhance→syncState on each DOM change).
    _restoreActive = true;

    var wrappers = document.querySelectorAll('.scw-ktl-accordion');
    var touched = false;
    for (var i = 0; i < wrappers.length; i++) {
      var hdr = wrappers[i].querySelector('.scw-ktl-accordion__header');
      if (!hdr) continue;
      var vk = hdr.getAttribute('data-view-key');
      if (!vk) continue;

      // Only restore views that are EXPLICITLY in the saved map.
      // Views not in the map keep whatever state KTL set as default
      // (respects _hsv=1,false / _hsv=1,true).
      //
      // For the post-edit flow (in-memory snapshot), the snapshot
      // captured the full DOM state including defaults, so every
      // visible accordion has an entry — this guard only matters
      // for the sessionStorage path (page load / navigation) where
      // un-toggled views correctly have no entry.
      if (!(vk in saved)) {
        log('skipped (no saved entry, keeping KTL default)', vk);
        continue;
      }

      var section = document.querySelector('.hideShow_' + vk + '.ktlHideShowSection');
      var arrow = document.getElementById('hideShow_' + vk + '_arrow');

      if (saved[vk]) {
        // This accordion was collapsed — collapse it again
        wrappers[i].classList.remove('is-expanded');
        hdr.setAttribute('aria-expanded', 'false');
        var bodyEl = wrappers[i].querySelector('.scw-ktl-accordion__body');
        if (bodyEl) bodyEl.style.display = 'none';
        if (section) section.style.display = 'none';
        if (arrow) {
          arrow.classList.remove('ktlDown');
          arrow.classList.add('ktlUp');
        }
        log('restored collapsed', vk);
        touched = true;
      } else {
        // This accordion was expanded — force it open.
        // Use explicit 'block' (not '') so KTL's own hidden state
        // doesn't bleed through when the inline style is removed.
        wrappers[i].classList.add('is-expanded');
        hdr.setAttribute('aria-expanded', 'true');
        var bodyOpen = wrappers[i].querySelector('.scw-ktl-accordion__body');
        if (bodyOpen) bodyOpen.style.display = '';
        if (section) section.style.display = 'block';
        if (arrow) {
          arrow.classList.remove('ktlUp');
          arrow.classList.add('ktlDown');
        }
        log('restored expanded', vk);
        touched = true;
      }
    }

    // Keep the guard up long enough for MutationObserver + rAF to settle,
    // but only if we actually changed something.  Shorter guard (300ms)
    // avoids blocking ktl-hide-show-state.js from restoring user prefs
    // stored in localStorage.
    if (touched) {
      setTimeout(function () { _restoreActive = false; }, 300);
    } else {
      _restoreActive = false;
    }
  }

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
          persistCurrentState();   // persist toggle to sessionStorage
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

      // Scene exclusion — skip accordion enhancement on disabled scenes
      var knScene = btn.closest('.kn-scene');
      if (knScene) {
        var sceneId = (knScene.id || '').replace('kn-', '');
        if (DISABLED_ACCORDION_SCENES[sceneId]) continue;
      }

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
      setTimeout(function () {
        enhance();
        applySavedState();
      }, 80);
    });

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      setTimeout(function () {
        enhance();
        applySavedState();
      }, 80);
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

  // Persist collapsed state before page unload (refresh / close)
  window.addEventListener('beforeunload', persistCurrentState);

  $(document).ready(function () {
    setTimeout(function () {
      enhance();
      // Restore collapsed state from sessionStorage after initial build
      applySavedState();
    }, 300);
  });

  // ── Expose API ──
  window.SCW = window.SCW || {};
  window.SCW.ktlAccordion = {
    /** Force re-enhancement pass */
    refresh: enhance,
    /** Snapshot current collapsed/expanded state (call before re-render) */
    saveState: snapshotState,
    /** Apply saved state after re-render (call after enhance/refresh) */
    restoreState: applySavedState,
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
      l3Sort: { enabled: true, fieldKey: 'field_2203', descending: true, missingSortGoesLast: true },
      hideL3WhenBlank: { enabled: true },

      hideBlankL4Headers: {
        enabled: true,
        cssClass: 'scw-hide-level4-header',
        requireField2019AlsoBlank: true,
      },

      hideL2Footer: {
        enabled: true,
        labels: ['Assumptions', 'General Project Assumptions'],
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
        labels: ['Assumptions', 'General Project Assumptions'],
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

.scw-l4-2019 { display: block; line-height: 1.2; }

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
  // FEATURE: L3 group reorder — within each L2 section by cost
  // ============================================================

  function getSortValueForL3Block(fieldKey, l3HeaderEl, stopEl) {
    let cur = l3HeaderEl.nextElementSibling;
    let total = 0;
    let found = false;

    while (cur && cur !== stopEl) {
      if (cur.id && cur.tagName === 'TR') {
        const cell = cur.querySelector('td.' + fieldKey);
        if (cell) {
          const num = parseFloat((cell.textContent || '').replace(/[^\d.-]/g, ''));
          if (Number.isFinite(num)) { total += num; found = true; }
        }
      }

      if (cur.classList?.contains('kn-table-group')) {
        const m = cur.className.match(/kn-group-level-(\d+)/);
        const lvl = m ? parseInt(m[1], 10) : null;
        if (lvl !== null && lvl <= 3) break;
      }
      cur = cur.nextElementSibling;
    }

    return found ? total : null;
  }

  function reorderLevel3GroupsBySortField(ctx, $tbody, runId) {
    const opt = ctx.features.l3Sort;
    if (!opt?.enabled) return;

    const tbody = $tbody?.[0];
    if (!tbody) return;

    const stampKey = 'scwL3ReorderStamp';
    if (tbody.dataset[stampKey] === String(runId)) return;
    tbody.dataset[stampKey] = String(runId);

    const fieldKey = opt.fieldKey;
    const desc = opt.descending === true;
    const missing = opt.missingSortGoesLast ? (desc ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY) : 0;

    const l2Headers = Array.from(tbody.querySelectorAll('tr.kn-table-group.kn-group-level-2'));
    if (!l2Headers.length) return;

    for (let i = 0; i < l2Headers.length; i++) {
      const l2El = l2Headers[i];

      // Find the boundary: next L2 or next L1
      const nextBoundary = (function () {
        let n = l2El.nextElementSibling;
        while (n) {
          if (n.classList.contains('kn-table-group')) {
            const m = n.className.match(/kn-group-level-(\d+)/);
            const lvl = m ? parseInt(m[1], 10) : null;
            if (lvl !== null && lvl <= 2) return n;
          }
          n = n.nextElementSibling;
        }
        return null;
      })();

      // Collect all nodes in this L2 section
      const sectionNodes = [];
      let cur = l2El.nextElementSibling;
      while (cur && cur !== nextBoundary) {
        sectionNodes.push(cur);
        cur = cur.nextElementSibling;
      }
      if (!sectionNodes.length) continue;

      const l3Headers = sectionNodes.filter(
        (n) => n.classList && n.classList.contains('kn-table-group') && n.classList.contains('kn-group-level-3')
      );
      if (l3Headers.length < 2) continue;

      const firstL3 = l3Headers[0];

      // Nodes between L2 header and first L3 (prefix)
      const prefixNodes = [];
      cur = l2El.nextElementSibling;
      while (cur && cur !== nextBoundary && cur !== firstL3) {
        prefixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      const blocks = l3Headers.map((l3El, idx) => {
        const nextL3El = idx + 1 < l3Headers.length ? l3Headers[idx + 1] : null;

        const nodes = [];
        let n = l3El;
        while (n && n !== nextBoundary && n !== nextL3El) {
          nodes.push(n);
          n = n.nextElementSibling;
        }

        const sortVal = getSortValueForL3Block(fieldKey, l3El, nextL3El || nextBoundary);
        return { idx, sortVal, nodes };
      });

      const lastBlock = blocks[blocks.length - 1];
      const lastBlockLastNode = lastBlock.nodes[lastBlock.nodes.length - 1];

      // Nodes after last L3 block (suffix — e.g. subtotal rows)
      const suffixNodes = [];
      cur = lastBlockLastNode ? lastBlockLastNode.nextElementSibling : null;
      while (cur && cur !== nextBoundary) {
        suffixNodes.push(cur);
        cur = cur.nextElementSibling;
      }

      blocks.sort((a, b) => {
        const av = a.sortVal !== null ? a.sortVal : missing;
        const bv = b.sortVal !== null ? b.sortVal : missing;
        if (av !== bv) return desc ? (bv - av) : (av - bv);
        return a.idx - b.idx;
      });

      const frag = document.createDocumentFragment();
      for (const n of prefixNodes) frag.appendChild(n);
      for (const block of blocks) for (const n of block.nodes) frag.appendChild(n);
      for (const n of suffixNodes) frag.appendChild(n);

      if (nextBoundary) tbody.insertBefore(frag, nextBoundary);
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
  // FEATURE: Synthesize missing L4 group headers
  // ============================================================
  // Knack sometimes fails to emit L4 group headers, leaving data
  // rows orphaned (hidden by CSS with no header to display their
  // field_2019 content). This function detects orphan data rows
  // within each L3 block and creates synthetic L4 headers so the
  // rest of the pipeline can process them normally.

  function synthesizeMissingL4Headers(ctx) {
    const $tbody = ctx.$tbody;
    const l3Headers = $tbody[0].querySelectorAll('tr.kn-table-group.kn-group-level-3');
    if (!l3Headers.length) return;

    for (let i = 0; i < l3Headers.length; i++) {
      const l3El = l3Headers[i];
      let current = l3El.nextElementSibling;
      let currentL4 = null;
      const orphanRuns = [];  // groups of consecutive orphan data rows
      let currentRun = null;

      while (current) {
        if (current.classList.contains('kn-table-group')) {
          const m = current.className.match(/kn-group-level-(\d+)/);
          const lvl = m ? parseInt(m[1], 10) : null;
          if (lvl !== null && lvl <= 3) break; // end of L3 block
          if (lvl === 4) {
            currentL4 = current;
            currentRun = null;
          }
        } else if (current.id && current.tagName === 'TR') {
          // Data row — check if it's covered by an L4 header
          if (!currentL4) {
            if (!currentRun) {
              currentRun = { rows: [] };
              orphanRuns.push(currentRun);
            }
            currentRun.rows.push(current);
          }
        }
        current = current.nextElementSibling;
      }

      if (!orphanRuns.length) continue;

      // For each orphan run, group consecutive rows by field_2019 value
      // so rows with the same description share one synthetic L4 header.
      const field2019Key = ctx.keys.field2019;

      for (const run of orphanRuns) {
        const groups = [];
        let lastKey = null;
        let lastGroup = null;

        for (const row of run.rows) {
          const cell = row.querySelector('td.' + field2019Key);
          const key = cell ? norm(cell.textContent || '') : '';

          if (key === lastKey && lastGroup) {
            lastGroup.rows.push(row);
          } else {
            lastGroup = { key: key, rows: [row] };
            groups.push(lastGroup);
            lastKey = key;
          }
        }

        for (const group of groups) {
          const tr = document.createElement('tr');
          tr.className = 'kn-table-group kn-group-level-4 scw-synthetic-l4';
          const td = document.createElement('td');
          td.setAttribute('colspan', '100');
          // Leave the label empty — injectField2019IntoLevel4Header will
          // populate it from the data row's field_2019 content.
          td.textContent = '';
          tr.appendChild(td);
          group.rows[0].parentNode.insertBefore(tr, group.rows[0]);
        }
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
    // Remove synthetic L4 headers from previous runs so they're rebuilt fresh
    $tbody.find('tr.scw-synthetic-l4').remove();
    $tbody
      .find(`tr.kn-table-group.kn-group-level-3.${ctx.l2Specials.classOnLevel3}`)
      .removeClass(ctx.l2Specials.classOnLevel3);

    reorderLevel1Groups($tbody);
    reorderLevel2GroupsBySortField(ctx, $tbody, runId);
    reorderLevel3GroupsBySortField(ctx, $tbody, runId);

    // Synthesize missing L4 headers before the main pipeline processes groups
    synthesizeMissingL4Headers(ctx);

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
})();/*** PROPOSAL PDF EXPORT — scene_1096 ***/
(function () {
  'use strict';

  var SCENE_ID = 'scene_1096';
  var WEBHOOK_URL = 'https://hook.us1.make.com/ozk2uk1e58upnpsj0fx1bmdg387ekvf5';
  var BUTTON_ID = 'scw-proposal-pdf-btn';
  var VIEW_IDS = ['view_3301', 'view_3341', 'view_3371'];

  // Reuse the same field keys as proposal-grid.js
  var KEYS = {
    qty: 'field_1964',
    labor: 'field_2028',
    hardware: 'field_2201',
    cost: 'field_2203',
    discount: 'field_2267',
    lineItemDiscount: 'field_2303',
    description: 'field_2019',
    prefix: 'field_2240',
    number: 'field_1951',
    connectedDevices: 'field_1957',
  };

  // ── Helpers ──

  function norm(s) {
    return String(s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseMoney(text) {
    var raw = String(text || '').replace(/[^0-9.\-]/g, '');
    var n = parseFloat(raw);
    return isFinite(n) ? n : 0;
  }

  function formatMoney(n) {
    var num = Number(n || 0);
    return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function cellText(row, fieldKey) {
    var td = row.querySelector('td.' + fieldKey);
    return td ? norm(td.textContent) : '';
  }

  function cellNum(row, fieldKey) {
    return parseMoney(cellText(row, fieldKey));
  }

  function groupLabelText(tr) {
    var td = tr.querySelector('td:first-child');
    return td ? norm(td.textContent) : '';
  }

  function isVisible(tr) {
    return tr.style.display !== 'none' && !tr.classList.contains('scw-hide-level3-header') && !tr.classList.contains('scw-hide-level4-header');
  }

  // ── DOM scraper: walk the rendered tbody and build the JSON ──

  function scrapeView(viewId) {
    var root = document.getElementById(viewId);
    if (!root) return null;

    var tbody = root.querySelector('.kn-table tbody');
    if (!tbody) return null;

    var rows = Array.from(tbody.children);
    if (!rows.length) return null;

    var sections = [];
    var currentL1 = null;
    var currentL2 = null;
    var currentL3 = null;

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];

      // Skip data rows (hidden in proposal view) and subtotal rows (we rebuild totals from headers)
      if (tr.id && !tr.classList.contains('kn-table-group') && !tr.classList.contains('scw-level-total-row')) continue;

      // ── L1 group header ──
      if (tr.classList.contains('kn-group-level-1')) {
        var l1Label = groupLabelText(tr);
        // Skip blank/hidden L1 headers (promoted L2 scenario)
        if (tr.style.display === 'none') {
          // Blank L1 — subsequent L2s are promoted. We still create a placeholder.
          currentL1 = { level: 1, label: '', promoted: true, buckets: [], footer: null };
          sections.push(currentL1);
        } else {
          currentL1 = { level: 1, label: l1Label, promoted: false, buckets: [], footer: null };
          sections.push(currentL1);
        }
        currentL2 = null;
        currentL3 = null;
        continue;
      }

      // ── L2 group header ──
      if (tr.classList.contains('kn-group-level-2')) {
        var l2Label = groupLabelText(tr);
        var isPromoted = tr.classList.contains('scw-promoted-l2-as-l1');

        currentL2 = {
          level: 2,
          label: l2Label,
          isPromoted: isPromoted,
          products: [],
          footer: null,
        };

        if (isPromoted) {
          // Promoted L2 acts as its own L1
          currentL1 = { level: 1, label: l2Label, promoted: true, buckets: [], footer: null };
          sections.push(currentL1);
        }

        if (currentL1) currentL1.buckets.push(currentL2);
        currentL3 = null;
        continue;
      }

      // ── L3 group header ──
      if (tr.classList.contains('kn-group-level-3')) {
        if (!isVisible(tr)) continue;

        var l3Label = groupLabelText(tr);
        var l3Qty = parseMoney(norm((tr.querySelector('td.' + KEYS.qty) || {}).textContent || ''));
        var l3Cost = norm((tr.querySelector('td.' + KEYS.cost) || {}).textContent || '');

        // Extract connected devices if present
        var connDevSpan = tr.querySelector('.scw-l3-connected-devices');
        var connDevices = [];
        if (connDevSpan) {
          var connText = norm(connDevSpan.textContent).replace(/^\(/, '').replace(/\)$/, '');
          if (connText) connDevices = connText.split(',').map(function (s) { return norm(s); }).filter(Boolean);
        }

        var isMounting = tr.classList.contains('scw-level3--mounting-hardware');

        currentL3 = {
          level: 3,
          label: l3Label,
          qty: l3Qty,
          cost: l3Cost,
          connectedDevices: connDevices,
          isMountingHardware: isMounting,
          lineItems: [],
        };

        if (currentL2) currentL2.products.push(currentL3);
        continue;
      }

      // ── L4 group header ──
      if (tr.classList.contains('kn-group-level-4')) {
        if (!isVisible(tr)) continue;

        var labelCell = tr.querySelector('td:first-child');
        var l4Label = labelCell ? norm(labelCell.textContent) : '';

        // Extract rich description (the .scw-l4-2019 span or the full label cell)
        var descSpan = tr.querySelector('.scw-l4-2019');
        var description = '';
        if (descSpan) {
          description = descSpan.innerHTML || '';
        }

        // Extract camera list if present
        var camB = tr.querySelector('.scw-concat-cameras b');
        var cameraList = '';
        if (camB) {
          cameraList = norm(camB.textContent).replace(/^\(/, '').replace(/\)$/, '');
        }

        var l4Qty = parseMoney(norm((tr.querySelector('td.' + KEYS.qty) || {}).textContent || ''));
        var l4Cost = norm((tr.querySelector('td.' + KEYS.cost) || {}).textContent || '');

        var lineItem = {
          level: 4,
          label: l4Label,
          description: description,
          qty: l4Qty,
          cost: l4Cost,
          cameraList: cameraList,
        };

        if (currentL3) currentL3.lineItems.push(lineItem);
        continue;
      }

      // ── L2 subtotal row ──
      if (tr.classList.contains('scw-subtotal--level-2')) {
        var l2FooterLabel = norm(tr.getAttribute('data-scw-group-label') || '');
        var l2FooterQty = parseMoney(norm((tr.querySelector('td.' + KEYS.qty) || {}).textContent || ''));
        var l2FooterCost = norm((tr.querySelector('td.' + KEYS.cost) || {}).textContent || '');

        if (currentL2) {
          currentL2.footer = {
            label: l2FooterLabel,
            qty: l2FooterQty,
            cost: l2FooterCost,
          };
        }
        continue;
      }

      // ── L1 footer rows ──
      if (tr.classList.contains('scw-subtotal--level-1') && !tr.classList.contains('scw-project-totals')) {
        if (!currentL1) continue;

        if (!currentL1.footer) {
          var titleDiv = tr.querySelector('.scw-l1-title');
          currentL1.footer = {
            title: titleDiv ? norm(titleDiv.textContent) : currentL1.label,
            hasDiscount: false,
            lines: [],
          };
        }

        var lineLabel = tr.querySelector('.scw-l1-label');
        var lineValue = tr.querySelector('.scw-l1-value');
        if (lineLabel && lineValue) {
          var type = 'final';
          if (tr.classList.contains('scw-l1-line--sub')) type = 'sub';
          else if (tr.classList.contains('scw-l1-line--disc')) { type = 'disc'; currentL1.footer.hasDiscount = true; }

          currentL1.footer.lines.push({
            type: type,
            label: norm(lineLabel.textContent),
            value: norm(lineValue.textContent),
          });
        }
        continue;
      }

      // ── Project totals ──
      // (handled separately below)
    }

    // ── Scrape project totals ──
    var projectTotals = null;
    var ptRows = tbody.querySelectorAll('tr.scw-project-totals');
    if (ptRows.length) {
      projectTotals = { title: 'Project Totals', lines: [] };
      for (var p = 0; p < ptRows.length; p++) {
        var ptr = ptRows[p];
        var ptTitle = ptr.querySelector('.scw-l1-title');
        if (ptTitle) {
          projectTotals.title = norm(ptTitle.textContent);
          continue;
        }
        var ptLabel = ptr.querySelector('.scw-l1-label');
        var ptValue = ptr.querySelector('.scw-l1-value');
        if (ptLabel && ptValue) {
          var ptType = 'final';
          if (ptr.classList.contains('scw-l1-line--sub')) ptType = 'sub';
          else if (ptr.classList.contains('scw-l1-line--disc')) ptType = 'disc';

          projectTotals.lines.push({
            type: ptType,
            label: norm(ptLabel.textContent),
            value: norm(ptValue.textContent),
          });
        }
      }
    }

    return {
      viewId: viewId,
      sections: sections,
      projectTotals: projectTotals,
    };
  }

  function scrapeAllViews() {
    var result = { views: [] };

    for (var i = 0; i < VIEW_IDS.length; i++) {
      var data = scrapeView(VIEW_IDS[i]);
      if (data && data.sections.length) {
        result.views.push(data);
      }
    }

    // Use the first view that has project totals
    for (var j = 0; j < result.views.length; j++) {
      if (result.views[j].projectTotals) {
        result.projectTotals = result.views[j].projectTotals;
        break;
      }
    }

    return result;
  }

  // ── Send to webhook ──

  function sendToWebhook(data, $btn) {
    $btn.prop('disabled', true).text('Sending…');

    var jsonStr = JSON.stringify(data);
    console.log('[SCW PDF Export] payload size:', jsonStr.length, 'bytes');
    console.log('[SCW PDF Export] payload:', data);

    $.ajax({
      url: WEBHOOK_URL,
      type: 'POST',
      contentType: 'application/json',
      data: jsonStr,
      crossDomain: true,
      success: function (resp, status, xhr) {
        console.log('[SCW PDF Export] success:', status, resp);
        $btn.text('Sent ✓').css('background', '#28a745');
        setTimeout(function () {
          $btn.prop('disabled', false).text('Generate PDF').css('background', '');
        }, 3000);
      },
      error: function (xhr, status, err) {
        console.error('[SCW PDF Export] webhook error:', status, err, 'HTTP', xhr.status, xhr.responseText);
        // If CORS blocked, xhr.status is 0 — try fallback with no preflight
        if (xhr.status === 0) {
          console.log('[SCW PDF Export] Retrying with text/plain to avoid CORS preflight…');
          $.ajax({
            url: WEBHOOK_URL,
            type: 'POST',
            contentType: 'text/plain',
            data: jsonStr,
            crossDomain: true,
            success: function () {
              console.log('[SCW PDF Export] fallback success');
              $btn.text('Sent ✓').css('background', '#28a745');
              setTimeout(function () {
                $btn.prop('disabled', false).text('Generate PDF').css('background', '');
              }, 3000);
            },
            error: function (xhr2, status2, err2) {
              console.error('[SCW PDF Export] fallback also failed:', status2, err2);
              $btn.text('Error — retry?').css('background', '#dc3545');
              setTimeout(function () {
                $btn.prop('disabled', false).text('Generate PDF').css('background', '');
              }, 4000);
            },
          });
          return;
        }
        $btn.text('Error — retry?').css('background', '#dc3545');
        setTimeout(function () {
          $btn.prop('disabled', false).text('Generate PDF').css('background', '');
        }, 4000);
      },
    });
  }

  // ── Button injection ──

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;

    var sceneEl = document.getElementById('kn-' + SCENE_ID);
    if (!sceneEl) return;

    var $btn = $('<button></button>')
      .attr('id', BUTTON_ID)
      .text('Generate PDF')
      .css({
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        padding: '12px 24px',
        fontSize: '15px',
        fontWeight: 700,
        color: '#fff',
        background: '#07467c',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,.25)',
      });

    $btn.on('mouseenter', function () { $(this).css('opacity', 0.9); });
    $btn.on('mouseleave', function () { $(this).css('opacity', 1); });

    $btn.on('click', function () {
      console.log('[SCW PDF Export] Button clicked — scraping views:', VIEW_IDS);
      var payload = scrapeAllViews();
      console.log('[SCW PDF Export] Scraped', payload.views.length, 'views, sections:', payload.views.map(function (v) { return v.viewId + ':' + v.sections.length; }));
      if (!payload.views.length) {
        console.warn('[SCW PDF Export] No data found. Views in DOM:', VIEW_IDS.map(function (id) { return id + '=' + !!document.getElementById(id); }));
        alert('No proposal data found on this page.');
        return;
      }
      sendToWebhook(payload, $btn);
    });

    $(sceneEl).append($btn);
  }

  // ── Bind to scene render ──

  $(document).on('knack-scene-render.' + SCENE_ID, function () {
    // Delay slightly so proposal-grid.js pipeline finishes first
    setTimeout(injectButton, 1500);
  });
})();
/////*********** BID ITEMS GRID VIEW (effective Q1 2026) ***************//////
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

  // Record count badge: list view IDs to enable
  const RECORD_COUNT_VIEWS = ['view_3359', 'view_3313', 'view_3505', 'view_3512', 'view_3610'];

  // Per-view background color overrides (keys = view IDs)
  const VIEW_OVERRIDES = {
    view_3374: { L1bg: '#124E85' },
    view_3325: { L1bg: '#124E85' },
    view_3331: { L1bg: '#124E85' },
    view_3475: { L1bg: '#5F6B7A' },
    view_3596: { defaultOpen: true },
  };

  // Views to SKIP — group-collapse will NOT enhance these views.
  // Proposal grids manage their own grouping UI via proposal-grid.js.
  const SKIP_VIEWS = new Set([
    'view_3301',
    'view_3341',
    'view_3371',
    'view_3550',
  ]);

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
      /* Flex layout lives on an inner wrapper so the TD keeps
         display:table-cell and respects its colspan. */
      ${s('.scw-group-collapse-enabled tr.scw-group-header > td > .scw-group-inner')} {
        display: flex;
        align-items: center;
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
        padding: 10px 14px 10px 10px !important;
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
        padding: 12px 10px !important;
        border-bottom: none;
        box-shadow: none;
      }

      /* ── Bridge: content rows beneath an expanded L1 ──
         Continue the left accent border on the first content row
         so the header and content feel like one unit.
         Also replace the worksheet card's grey border-top with accent. */
      ${s('.scw-group-collapse-enabled .kn-table-group.kn-group-level-1.scw-group-header:not(.scw-collapsed) + tr:not(.kn-table-group) > td:first-child')} {
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

      /* ── Badge wrapper (right-aligned) ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-group-badges')} {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      /* ── Warning count badge ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-warning-count')} {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 8px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
        border-radius: 10px;
        background: rgba(220, 38, 38, 0.12);
        color: #dc2626;
        border: 1px solid rgba(220, 38, 38, 0.22);
      }
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-warning-count svg')} {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }

      /* ── Record count badge ── */
      ${s('.scw-group-collapse-enabled tr.scw-group-header .scw-record-count')} {
        display: inline-block;
        padding: 1px 8px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
        border-radius: 10px;
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

  function ensureInnerWrap($tr) {
    const $cell = $tr.children('td,th').first();
    if (!$cell.children('.scw-group-inner').length) {
      $cell.wrapInner('<div class="scw-group-inner"></div>');
    }
    // Strip Knack's inline padding-left so our CSS rules control it
    $cell[0] && $cell[0].style.removeProperty('padding-left');
    // Fix colspan="0" — HTML5 treats 0 as 1, breaking full-row span.
    // Recalculate from thead every time since Knack may re-render rows.
    var table = $tr.closest('table')[0];
    if (table) {
      var headerRow = table.querySelector('thead tr');
      if (headerRow) {
        var colCount = 0;
        var hCells = headerRow.children;
        for (var i = 0; i < hCells.length; i++) {
          colCount += parseInt(hCells[i].getAttribute('colspan') || '1', 10);
        }
        var cur = parseInt($cell.attr('colspan') || '1', 10);
        if (colCount > 0 && cur < colCount) {
          $cell.attr('colspan', colCount);
        }
      }
    }
  }

  function ensureIcon($tr) {
    const $cell = $tr.children('td,th').first();
    var $inner = $cell.children('.scw-group-inner');
    var $target = $inner.length ? $inner : $cell;
    if (!$target.find('.scw-collapse-icon').length) {
      $target.prepend('<span class="scw-collapse-icon" aria-hidden="true">' + CHEVRON_SVG + '</span>');
    }
  }

  var WARNING_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  function ensureBadges($tr, viewId) {
    if (!RECORD_COUNT_VIEWS.length) return;
    if (!RECORD_COUNT_VIEWS.includes(viewId)) return;
    const $cell = $tr.children('td,th').first();

    const $block = rowsUntilNextRelevantGroup($tr);
    // For worksheet views, count only scw-ws-row to avoid double-counting
    const $wsRows = $block.filter('tr.scw-ws-row');
    const count = $wsRows.length
      ? $wsRows.length
      : $block.not('.kn-table-group, .kn-table-totals, .scw-inline-photo-row, .scw-synth-divider').length;

    // Count accessory mismatch warnings within this group's rows
    var warnCount = 0;
    if ($wsRows.length) {
      $wsRows.each(function () {
        if (this.querySelector('.scw-cr-hdr-warning')) warnCount++;
      });
    }

    // Skip DOM update if badges already show the correct values
    const $wrapper = $cell.find('.scw-group-badges');
    if ($wrapper.length) {
      var existingCount = $wrapper.find('.scw-record-count').text();
      var existingWarn = $wrapper.find('.scw-warning-count').attr('data-count') || '0';
      if (existingCount === String(count) && existingWarn === String(warnCount)) return;
    }

    $wrapper.remove();

    if (count > 0 || warnCount > 0) {
      var html = '<span class="scw-group-badges">';
      if (warnCount > 0) {
        html += '<span class="scw-warning-count" data-count="' + warnCount + '" title="' + warnCount + ' accessory mismatch warning' + (warnCount > 1 ? 's' : '') + '">' + WARNING_SVG + warnCount + '</span>';
      }
      if (count > 0) {
        html += '<span class="scw-record-count">' + count + '</span>';
      }
      html += '</span>';
      var $inner = $cell.children('.scw-group-inner');
      ($inner.length ? $inner : $cell).append(html);
    }
  }

  function getRowLabelText($tr) {
    return $tr
      .clone()
      .find('.scw-collapse-icon, .scw-group-badges')
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

  var DISABLED_SCENES = { scene_828: true, scene_833: true, scene_873: true };

  function isEnabledScene(sceneId) {
    return !!sceneId && !DISABLED_SCENES[sceneId];
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

      if (SKIP_VIEWS.has(viewId)) return;

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
      // below-threshold or defaultOpen views so the "default open" behaviour takes effect.
      var viewOverrides = VIEW_OVERRIDES[viewId];
      var viewDefaultOpen = viewOverrides && viewOverrides.defaultOpen;
      if ((belowThreshold || viewDefaultOpen) && !thresholdCleared.has(viewId)) {
        thresholdCleared.add(viewId);
        try { localStorage.removeItem(storageKey(sceneId, viewId)); } catch (e) {}
      }

      const state = loadState(sceneId, viewId);

      $tr.addClass('scw-group-header');
      ensureInnerWrap($tr);
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

      ensureBadges($tr, viewId);

      const key = buildKey($tr, level);
      var viewOverrides = VIEW_OVERRIDES[viewId];
      var viewDefaultOpen = viewOverrides && viewOverrides.defaultOpen;
      const shouldCollapse = key in state ? !!state[key] : ((belowThreshold || viewDefaultOpen) ? false : COLLAPSED_BY_DEFAULT);

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

        if (SKIP_VIEWS.has(viewId)) return;

        $view.addClass('scw-group-collapse-enabled');

        $tr.addClass('scw-group-header');
        ensureInnerWrap($tr);
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

    // Scope observer to the scene container instead of document.body.
    // This avoids firing on DOM mutations in other scenes / unrelated UI.
    var sceneRoot = document.getElementById('kn-' + sceneId);
    obs.observe(sceneRoot || document.body, { childList: true, subtree: true });
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
/*** SELECT-ALL CHECKBOXES — native <thead> + group header checkboxes ***/
(function () {
  'use strict';

  var STYLE_ID  = 'scw-select-all-css';
  var HEADER_ATTR = 'data-scw-sa-header';
  var GROUP_ATTR  = 'data-scw-sa-grp';
  var CB_SELECTOR =
    '.kn-table-bulk-checkbox input[type="checkbox"], ' +
    'input.ktlCheckbox-row[type="checkbox"]';

  // ───────────────────────────────────────────────
  //  CSS
  // ───────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;

    var css = [
      /* ── Sticky <thead> ── */
      '.kn-table thead {',
      '  position: sticky;',
      '  top: 0;',
      '  z-index: 5;',
      '}',
      '.kn-table thead th {',
      '  background: #fafafa;',
      '  border-bottom: 2px solid #dbdbdb;',
      '  padding: 8px 10px;',
      '  font-size: 0.85rem;',
      '  font-weight: 600;',
      '  color: #363636;',
      '  white-space: normal;',
      '  vertical-align: middle;',
      '}',
      '.kn-table thead th .kn-sort {',
      '  color: #363636;',
      '  text-decoration: none;',
      '}',
      '.kn-table thead th .kn-sort:hover {',
      '  color: #000;',
      '}',
      '.kn-table thead .ktlCheckboxHeaderCell {',
      '  text-align: center;',
      '  vertical-align: middle;',
      '}',

      /* ── Group header checkbox ── */
      '.scw-sa-grp-check {',
      '  display: inline-flex !important;',
      '  align-items: center;',
      '  justify-content: center;',
      '  flex: 0 0 auto;',
      '  min-width: 20px;',
      '  padding: 0 4px;',
      '  margin-right: 4px;',
      '  visibility: visible !important;',
      '  opacity: 1 !important;',
      '  order: -1;',
      '}',
      '.scw-sa-grp-check input[type="checkbox"] {',
      '  margin: 0;',
      '  cursor: pointer;',
      '  display: inline-block !important;',
      '  opacity: 1 !important;',
      '  visibility: visible !important;',
      '  position: static !important;',
      '}',
      'tr.scw-group-header > td { overflow: visible !important; }',
      '.scw-sa-grp-check input[type="checkbox"] {',
      '  pointer-events: auto;',
      '}',

      '/* ── Normalize ALL KTL + SCW checkboxes to fixed 15px ── */',
      '.kn-table thead input.ktlCheckbox[type="checkbox"],',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"],',
      '.scw-sa-grp-check input[type="checkbox"],',
      'tr.kn-table-group.scw-group-header input[type="checkbox"] {',
      '  appearance: none !important;',
      '  -webkit-appearance: none !important;',
      '  -moz-appearance: none !important;',
      '  width: 15px !important;',
      '  height: 15px !important;',
      '  min-width: 15px !important;',
      '  min-height: 15px !important;',
      '  max-width: 15px !important;',
      '  max-height: 15px !important;',
      '  flex-shrink: 0 !important;',
      '  box-sizing: border-box !important;',
      '  border: 1.5px solid #9ca3af !important;',
      '  border-radius: 3px !important;',
      '  background: #fff !important;',
      '  cursor: pointer;',
      '  position: relative !important;',
      '  vertical-align: middle !important;',
      '  outline: none !important;',
      '}',
      '.kn-table thead input.ktlCheckbox[type="checkbox"]:checked,',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"]:checked,',
      '.scw-sa-grp-check input[type="checkbox"]:checked,',
      'tr.kn-table-group.scw-group-header input[type="checkbox"]:checked {',
      '  background: #07467c !important;',
      '  border-color: #07467c !important;',
      '}',
      '.kn-table thead input.ktlCheckbox[type="checkbox"]:checked::after,',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"]:checked::after,',
      '.scw-sa-grp-check input[type="checkbox"]:checked::after,',
      'tr.kn-table-group.scw-group-header input[type="checkbox"]:checked::after {',
      '  content: "" !important;',
      '  position: absolute !important;',
      '  left: 4px !important;',
      '  top: 1px !important;',
      '  width: 5px !important;',
      '  height: 9px !important;',
      '  border: solid #fff !important;',
      '  border-width: 0 2px 2px 0 !important;',
      '  transform: rotate(45deg) !important;',
      '}',
      '.kn-table thead input.ktlCheckbox[type="checkbox"]:indeterminate,',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"]:indeterminate,',
      '.scw-sa-grp-check input[type="checkbox"]:indeterminate,',
      'tr.kn-table-group.scw-group-header input[type="checkbox"]:indeterminate {',
      '  background: #07467c !important;',
      '  border-color: #07467c !important;',
      '}',
      '.kn-table thead input.ktlCheckbox[type="checkbox"]:indeterminate::after,',
      '.kn-table tbody input.ktlCheckbox-row[type="checkbox"]:indeterminate::after,',
      '.scw-sa-grp-check input[type="checkbox"]:indeterminate::after,',
      'tr.kn-table-group.scw-group-header input[type="checkbox"]:indeterminate::after {',
      '  content: "" !important;',
      '  position: absolute !important;',
      '  left: 2px !important;',
      '  top: 5px !important;',
      '  width: 9px !important;',
      '  height: 2px !important;',
      '  background: #fff !important;',
      '  border: none !important;',
      '  transform: none !important;',
      '}',
    ].join('\n');

    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ───────────────────────────────────────────────
  //  Helpers
  // ───────────────────────────────────────────────

  function findCheckboxes(container) {
    return container.querySelectorAll(CB_SELECTOR);
  }

  function syncCheckbox(cb, targets) {
    if (!targets.length) return;
    var allChecked = true;
    var anyChecked = false;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].checked) anyChecked = true;
      else allChecked = false;
    }
    cb.checked = allChecked;
    cb.indeterminate = !allChecked && anyChecked;
  }

  /**
   * After a bulk .checked assignment, sync KTL's visual state that it
   * normally manages via its own change handlers:
   *  - bulkEditSelectedRow class on each row's <td> elements
   *  - KTL's "Delete Selected: N" button text
   *  - Header column bulk-edit checkboxes visibility
   */
  function syncKtlBulkState(viewEl) {
    var rows = viewEl.querySelectorAll('table.kn-table tbody tr');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.classList.contains('kn-table-group') ||
          row.classList.contains('kn-table-totals')) continue;

      var cb = row.querySelector(CB_SELECTOR);
      var tds = row.querySelectorAll('td');
      for (var t = 0; t < tds.length; t++) {
        if (cb && cb.checked) {
          tds[t].classList.add('bulkEditSelectedRow');
        } else {
          tds[t].classList.remove('bulkEditSelectedRow');
        }
      }
    }

    var checkedCount = viewEl.querySelectorAll(CB_SELECTOR + ':checked').length;

    var viewKey = viewEl.id;
    var delBtn = document.getElementById('ktl-bulk-delete-selected-' + viewKey);
    if (delBtn) {
      if (checkedCount > 0) {
        delBtn.textContent = 'Delete Selected: ' + checkedCount;
        delBtn.style.display = '';
      } else {
        delBtn.style.display = 'none';
      }
    }

    syncHeaderCboxVisibility(viewEl, checkedCount > 0);
  }

  /**
   * Show or hide the KTL bulkEditHeaderCbox checkboxes in <thead>.
   * KTL normally manages this via its own master-selector handler, but
   * our code intercepts those events (stopImmediatePropagation). So we
   * must replicate header checkbox visibility after any selection change.
   */
  function syncHeaderCboxVisibility(viewEl, anyChecked) {
    var ths = viewEl.querySelectorAll('thead th');
    for (var t = 0; t < ths.length; t++) {
      // Skip hidden <th>s (worksheet reorder hides non-summary columns)
      if (ths[t].style.display === 'none') continue;
      var hdrSpans = ths[t].querySelectorAll('.table-fixed-label');
      for (var s = 0; s < hdrSpans.length; s++) {
        var sp = hdrSpans[s];
        var hcb = sp.querySelector('.bulkEditHeaderCbox');
        if (!hcb) continue;
        if (anyChecked) {
          sp.classList.add('bulkEditTh');
          sp.style.display = 'inline-flex';
        } else {
          sp.classList.remove('bulkEditTh');
          sp.style.display = '';
        }
      }
    }
  }

  // Bulk-operation flag — suppresses per-checkbox change handler during
  // select-all / group-select to avoid N×handler calls.
  var _bulkOp = false;

  // ───────────────────────────────────────────────
  //  1) Wire native <thead> master selector
  // ───────────────────────────────────────────────

  function enhanceViews() {
    var accordions = document.querySelectorAll('.scw-ktl-accordion__header');

    for (var i = 0; i < accordions.length; i++) {
      var header = accordions[i];
      var viewKey = header.getAttribute('data-view-key');
      if (!viewKey) continue;

      var viewEl = document.getElementById(viewKey);
      if (!viewEl) continue;
      if (viewEl.getAttribute(HEADER_ATTR) === '1') continue;

      var hasCheckboxes = findCheckboxes(viewEl).length > 0;
      if (!hasCheckboxes) continue;

      var nativeMaster = viewEl.querySelector('thead input.masterSelector');
      if (!nativeMaster) continue;

      viewEl.setAttribute(HEADER_ATTR, '1');

      // Override native master click with fast bulk-set.
      // e.stopImmediatePropagation() prevents KTL's slow per-row handler.
      (function (master, vKey) {
        $(master).off('click.scwSaMaster').on('click.scwSaMaster', function (e) {
          e.stopImmediatePropagation();
          var el = document.getElementById(vKey);
          if (!el) return;
          var cbs = findCheckboxes(el);
          if (!cbs.length) return;

          _bulkOp = true;
          var shouldCheck = master.checked;
          for (var k = 0; k < cbs.length; k++) {
            cbs[k].checked = shouldCheck;
          }
          _bulkOp = false;
          master.indeterminate = false;
          syncKtlBulkState(el);

          // Notify KTL — same as group handler: fire change on each
          // row checkbox so KTL's internal bulk-edit state updates.
          for (var j = 0; j < cbs.length; j++) {
            cbs[j].dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        // Sync master state + header checkbox visibility on any row checkbox change
        $(viewEl).off('change.scwSaHeader').on('change.scwSaHeader', 'input[type="checkbox"]', function () {
          if (_bulkOp) return;
          var el = document.getElementById(vKey);
          if (!el) return;
          syncCheckbox(master, findCheckboxes(el));
          var any = el.querySelectorAll(CB_SELECTOR + ':checked').length > 0;
          syncHeaderCboxVisibility(el, any);
        });

        syncCheckbox(master, findCheckboxes(viewEl));
      })(nativeMaster, viewKey);
    }
  }

  // ───────────────────────────────────────────────
  //  2) Group header checkboxes
  // ───────────────────────────────────────────────

  function rowsInGroup(headerTr) {
    var isL2 = headerTr.classList.contains('kn-group-level-2');
    var rows = [];
    var next = headerTr.nextElementSibling;

    while (next) {
      if (next.classList.contains('kn-table-group')) {
        if (isL2) break;
        if (next.classList.contains('kn-group-level-1')) break;
      }
      if (!next.classList.contains('kn-table-group') &&
          !next.classList.contains('kn-table-totals')) {
        rows.push(next);
      }
      next = next.nextElementSibling;
    }
    return rows;
  }

  function enhanceGroupHeaders() {
    var groupHeaders = document.querySelectorAll('tr.kn-table-group.scw-group-header');

    for (var i = 0; i < groupHeaders.length; i++) {
      var tr = groupHeaders[i];
      if (tr.getAttribute(GROUP_ATTR) === '1') {
        if (tr.querySelector('.scw-sa-grp-check')) continue;
        tr.removeAttribute(GROUP_ATTR);
      }

      var rows = rowsInGroup(tr);
      var hasCheckboxes = false;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].querySelector(CB_SELECTOR)) { hasCheckboxes = true; break; }
      }
      if (!hasCheckboxes) continue;

      tr.setAttribute(GROUP_ATTR, '1');

      var oldBtn = tr.querySelector('.scw-select-all-btn');
      if (oldBtn) oldBtn.remove();

      var checkWrap = document.createElement('span');
      checkWrap.className = 'scw-sa-grp-check';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('aria-label', 'Select all rows in this group');
      cb.title = 'Select / deselect group';
      checkWrap.appendChild(cb);

      var td = tr.querySelector('td');
      if (!td) continue;
      var inner = td.querySelector('.scw-group-inner');
      var target = inner || td;
      target.insertBefore(checkWrap, target.firstChild);

      (function (checkbox, headerRow) {
        checkbox.addEventListener('click', function (e) {
          e.stopPropagation();
          e.stopImmediatePropagation();

          var groupRows = rowsInGroup(headerRow);
          var targets = [];
          for (var g = 0; g < groupRows.length; g++) {
            var cbs = groupRows[g].querySelectorAll(CB_SELECTOR);
            for (var c = 0; c < cbs.length; c++) targets.push(cbs[c]);
          }
          if (!targets.length) return;

          _bulkOp = true;
          var shouldCheck = checkbox.checked;
          for (var k = 0; k < targets.length; k++) {
            targets[k].checked = shouldCheck;
          }
          _bulkOp = false;
          checkbox.indeterminate = false;

          var vEl = headerRow.closest('[id^="view_"]');
          if (vEl) {
            syncKtlBulkState(vEl);
            var nativeMaster = vEl.querySelector('thead input.masterSelector');
            if (nativeMaster) syncCheckbox(nativeMaster, findCheckboxes(vEl));
          }

          // Notify KTL that selection changed — KTL tracks selected rows
          // internally via change handlers that our stopImmediatePropagation
          // blocked.  Fire change on each target so KTL's bulk-edit column
          // targeting works.
          for (var n = 0; n < targets.length; n++) {
            targets[n].dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        var parentTable = headerRow.closest('table');
        if (parentTable) {
          $(parentTable).off('change.scwSaGrp' + i).on('change.scwSaGrp' + i, 'input[type="checkbox"]', function () {
            if (_bulkOp) return;
            var groupRows = rowsInGroup(headerRow);
            var targets = [];
            for (var g = 0; g < groupRows.length; g++) {
              var cbs = groupRows[g].querySelectorAll(CB_SELECTOR);
              for (var c = 0; c < cbs.length; c++) targets.push(cbs[c]);
            }
            syncCheckbox(checkbox, targets);
          });
        }
      })(cb, tr);

      var initRows = rowsInGroup(tr);
      var initTargets = [];
      for (var ir = 0; ir < initRows.length; ir++) {
        var initCbs = initRows[ir].querySelectorAll(CB_SELECTOR);
        for (var ic = 0; ic < initCbs.length; ic++) initTargets.push(initCbs[ic]);
      }
      syncCheckbox(cb, initTargets);
    }
  }

  // ───────────────────────────────────────────────
  //  Lifecycle
  // ───────────────────────────────────────────────
  injectCss();

  function enhance() {
    enhanceViews();
    enhanceGroupHeaders();
  }

  // 1. Worksheet views — event-driven, no blind timer
  document.addEventListener('scw-worksheet-ready', function () {
    requestAnimationFrame(enhance);
  });

  // 2. Post-inline-edit — event-driven, replaces 1200ms blind timer
  document.addEventListener('scw-post-edit-ready', function () {
    requestAnimationFrame(enhance);
  });

  // 3. Non-worksheet views — short debounce after view render
  var _viewRenderTimer = null;
  $(document)
    .off('knack-view-render.any.scwSelectAll')
    .on('knack-view-render.any.scwSelectAll', function () {
      if (_viewRenderTimer) clearTimeout(_viewRenderTimer);
      _viewRenderTimer = setTimeout(function () {
        _viewRenderTimer = null;
        enhance();
      }, 100);
    });
})();
/*** END SELECT-ALL CHECKBOXES ***/
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

  // Assumptions bucket: field_2210 only visible when field_2248 includes "Custom Assumption"
  const ASSUMPTIONS_BUCKET_ID = '697b7a023a31502ec68b3303';
  const CUSTOM_ASSUMPTION_RECORD = '69ce7098172caa5786d3767d';
  const ASSUMPTION_TYPE_FIELD = 'field_2248';
  const ASSUMPTION_DESC_FIELD = 'field_2210';
  const CUSTOM_ASSUMPTION_LABEL = 'detail custom assumption:';

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
      ['field_2462', 'FLAG_use existing cabling'],
      ['field_2246', 'REL_unified product field'],
      ['field_2187', 'INPUT_DROP: variables'],
      ['field_2466', 'field_2466'],
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
    'field_2182','field_2180','field_2188','field_2193','field_2194','field_2183','field_2210','field_2224','field_2248','field_2250','field_2462',
    'field_2206','field_2195','field_2241','field_2184','field_2187','field_2204', 'field_2211','field_2233','field_2246','field_2466',
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

  function getFieldValues($scope, viewId, fieldKey) {
    var $sel = $scope.find('#' + viewId + '-' + fieldKey);
    if (!$sel.length) $sel = $scope.find('select[name="' + fieldKey + '"]');
    var val = $sel.val();
    if (Array.isArray(val)) return val;
    return val ? [val] : [];
  }

  function applyRules($scope, viewId) {
    const bucketValue = getBucketValue($scope, viewId);

    hideAllExceptBucket($scope);
    if (!bucketValue) return;

    (BUCKET_RULES[bucketValue] || []).forEach((k) => showField($scope, k));

    // Assumptions bucket: show field_2210 + rename label when field_2248 includes Custom Assumption
    if (bucketValue === ASSUMPTIONS_BUCKET_ID) {
      var typeVals = getFieldValues($scope, viewId, ASSUMPTION_TYPE_FIELD);
      if (typeVals.indexOf(CUSTOM_ASSUMPTION_RECORD) !== -1) {
        showField($scope, ASSUMPTION_DESC_FIELD);
        var $descWrap = $wrapForKeyWithinScope($scope, ASSUMPTION_DESC_FIELD);
        var $label = $descWrap.find('label:first');
        if ($label.length && $label.text().trim() !== CUSTOM_ASSUMPTION_LABEL) {
          $label.text(CUSTOM_ASSUMPTION_LABEL);
        }
      } else {
        hideField($scope, ASSUMPTION_DESC_FIELD);
      }
    }
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

    // Re-evaluate when assumption type field changes (multi-select)
    const typeSel = `#${viewId} select[name="${ASSUMPTION_TYPE_FIELD}"], #${viewId} #${viewId}-${ASSUMPTION_TYPE_FIELD}`;
    $(document)
      .off('change' + EVENT_NS + '-type', typeSel)
      .on('change' + EVENT_NS + '-type', typeSel, function () {
        const $scope = $(this).closest('form, .kn-form, .kn-view').length
          ? $(this).closest('form, .kn-form, .kn-view')
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
      ['field_2462', 'FLAG_use existing cabling'],
      ['field_2246', 'REL_unified product field'],
      ['field_2187', 'INPUT_DROP: variables'],
      ['field_2466', 'field_2466'],
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
    'field_2182','field_2180','field_2188','field_2193','field_2194','field_2183','field_2210','field_2224','field_2248','field_2250','field_2462',
    'field_2206','field_2195','field_2241','field_2184','field_2187','field_2204', 'field_2211','field_2233','field_2246','field_2466',
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

  // Removed: applyWithRetries (12×250ms polling loop).
  // The MutationObserver on tbody already re-applies after DOM changes.

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

    var obsTimer = 0;
    var obs = new MutationObserver(function () {
      if (obsTimer) clearTimeout(obsTimer);
      obsTimer = setTimeout(function () { obsTimer = 0; applyForView(viewId); }, 150);
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
        applyForView(viewId);
        installObserver(viewId);
      });
  });
})();
/***************************** /CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
/***************************** CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/
/**
 * SCW / Knack: Row-based conditional cell grayout (view_3456, view_3610 — SOW)
 *
 * Per-view configs drive bucket detection, column grayout, row locks,
 * and bucket-label injection.
 *
 *  view_3456: grays ALL cells for Services/Assumptions; replaces product
 *             cell content with "SERVICE — <labor desc>" via ::after.
 *  view_3610: selective grayout; preserves product cell; prefixes
 *             "ASSUMPTION" / "SERVICE" label above product via ::before.
 *
 * Approach: capture-phase event blocker, MutationObserver, retried
 * application on render.
 */
(function () {
  'use strict';

  // ============================================================
  // SHARED BUCKET IDS
  // ============================================================
  const BUCKET_OTHER_SERVICES = '6977caa7f246edf67b52cbcd';
  const BUCKET_ASSUMPTIONS    = '697b7a023a31502ec68b3303';

  const BUCKET_LABELS = {
    [BUCKET_OTHER_SERVICES]: 'SERVICE',
    [BUCKET_ASSUMPTIONS]:    'ASSUMPTION',
  };

  // ============================================================
  // PER-VIEW CONFIGS
  // ============================================================
  const VIEW_CONFIGS = [
    {
      viewId: 'view_3456',
      detectField: 'field_2219',
      sortField: 'field_2218',
      labelTarget: 'field_1949',
      // 'replace' = gray product cell, overlay label+desc via ::after
      labelMode: 'replace',
      laborDescField: 'field_2020',
      allColumnKeys: [
        'field_1949', // PRODUCT
        'field_1957', // Connected Devices
        'field_1960', // Unit Price
        'field_2020', // INPUT_Labor Description
        'field_1953', // SCW Notes
        'field_2261', // Cust Disc %
        'field_2262', // Cust Disc $$ Each
        'field_1964', // Qty
        'field_2303', // Applied Disc
        'field_2269', // total Line Price
      ],
      rowLocks: [
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
      ],
      rules: {
        [BUCKET_OTHER_SERVICES]: {
          activeFields: [],
          rowClass: 'scw-row--services',
        },
        [BUCKET_ASSUMPTIONS]: {
          activeFields: [],
          rowClass: 'scw-row--assumptions',
        },
      },
    },
    {
      viewId: 'view_3610',
      detectField: 'field_2219',
      sortField: 'field_2218',
      labelTarget: 'field_1949',
      labelMode: 'prefix',
      laborDescField: null,
      allColumnKeys: [
        'field_2020', // Labor Description
        'field_2154', // SOW
        'field_1964', // Qty
        'field_2150', // Sub Bid
        'field_2151', // Sub Bid Total
        'field_1973', // +Hrs
        'field_1997', // Hrs Ttl
        'field_1974', // +Mat
        'field_2146', // Mat Ttl
        'field_2028', // Install Fee
        'field_1953', // SCW Notes
        'field_1957', // Connected Devices
        'field_2207', // Mounting Hardware
      ],
      rowLocks: [
        {
          detectField: 'field_2230',
          when: 'yes',
          lockField: 'field_1964',   // Qty
        },
        {
          detectField: 'field_2231',
          whenNot: 'yes',
          lockField: 'field_1957',   // Connected Devices
        },
      ],
      rules: {
        [BUCKET_OTHER_SERVICES]: {
          activeFields: ['field_2020', 'field_2154', 'field_2150', 'field_2151', 'field_1964', 'field_1973', 'field_1997', 'field_1974', 'field_2146', 'field_2028', 'field_1953'],
          rowClass: 'scw-row--services',
        },
        [BUCKET_ASSUMPTIONS]: {
          activeFields: ['field_2020', 'field_2154', 'field_1953'],
          rowClass: 'scw-row--assumptions',
        },
      },
    },
    {
      viewId: 'view_3586',
      detectField: 'field_2219',
      sortField: 'field_2218',
      labelTarget: 'field_1949',
      labelMode: 'prefix',
      laborDescField: null,
      allColumnKeys: [
        'field_1949', // PRODUCT
        'field_1957', // Connected Devices
        'field_1960', // Retail Price
        'field_2020', // Labor Description
        'field_1953', // SCW Notes
        'field_2261', // Cust Disc %
        'field_2262', // Cust Disc $
        'field_1964', // Qty
        'field_2303', // Applied Disc
        'field_2269', // Line Item Total
      ],
      rowLocks: [
        {
          detectField: 'field_2230',
          when: 'yes',
          lockField: 'field_1964',   // Qty
        },
        {
          detectField: 'field_2231',
          whenNot: 'yes',
          lockField: 'field_1957',   // Connected Devices
        },
      ],
      rules: {
        [BUCKET_OTHER_SERVICES]: {
          activeFields: ['field_2020', 'field_1953', 'field_1964', 'field_2261', 'field_2262', 'field_2303', 'field_2269', 'field_1960'],
          rowClass: 'scw-row--services',
        },
        [BUCKET_ASSUMPTIONS]: {
          activeFields: ['field_2020', 'field_1953'],
          rowClass: 'scw-row--assumptions',
        },
      },
    },
  ];

  // ============================================================
  // CONSTANTS
  // ============================================================
  const EVENT_NS      = '.scwCondGray';
  const GRAY_ATTR     = 'data-scw-cond-grayed';
  const GRAY_CLASS    = 'scw-cond-grayed';
  const HIDDEN_CLASS  = 'scw-cond-hidden';
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

      /* ── Fully hidden cell (no gray bg, content invisible, clicks blocked) ── */
      td.${HIDDEN_CLASS} {
        position: relative;
        cursor: default !important;
      }
      td.${HIDDEN_CLASS} > * {
        visibility: hidden !important;
      }
      td.${HIDDEN_CLASS} .cell-edit,
      td.${HIDDEN_CLASS} .ktlInlineEditableCellsStyle {
        pointer-events: none !important;
      }

      /* ── view_3456: bucket label + labor desc REPLACES product cell via ::after ── */
      #view_3456 td.field_1949[data-scw-bucket-label] {
        position: relative;
      }
      #view_3456 td.field_1949[data-scw-bucket-label]::after {
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

      /* view_3610 label injection is handled by device-worksheet bucketRules */
    `;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // DETECTION
  // ============================================================
  function readBucketId($detectTd) {
    const $span = $detectTd.find('span[data-kn="connection-value"]');
    if ($span.length) {
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

  function hideTd($td) {
    if (!$td || !$td.length) return;
    if ($td.hasClass(HIDDEN_CLASS)) return;

    $td
      .attr(GRAY_ATTR, '1')       // reuse attr so capture blocker applies
      .addClass(HIDDEN_CLASS);

    $td.removeClass('cell-edit ktlInlineEditableCellsStyle');
    $td.find('.cell-edit, .ktlInlineEditableCellsStyle')
      .removeClass('cell-edit ktlInlineEditableCellsStyle');
  }

  function clearRow($tr, cfg) {
    $tr.find('td[' + GRAY_ATTR + '="1"]').each(function () {
      $(this)
        .removeAttr(GRAY_ATTR)
        .removeClass(GRAY_CLASS)
        .removeClass(HIDDEN_CLASS);
    });
    Object.values(cfg.rules).forEach(function (rule) {
      $tr.removeClass(rule.rowClass);
    });
    $tr.removeAttr(ROW_PROCESSED);
  }

  function normText(s) {
    return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function readBool($cell) {
    var $chk = $cell.find('input[type="checkbox"]');
    if ($chk.length) return $chk.is(':checked') ? 'yes' : 'no';
    if ($cell.find('.kn-icon-yes, .fa-check, .fa-thumbs-up').length) return 'yes';
    if ($cell.find('.kn-icon-no, .fa-times, .fa-thumbs-down').length) return 'no';
    return normText($cell.text());
  }

  function applyRowLocks($tr, cfg) {
    (cfg.rowLocks || []).forEach(function (lock) {
      var $detect = $tr.find('td.' + lock.detectField).first();
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

  function processRow($tr, cfg) {
    if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

    var $detectTd = $tr.find('td.' + cfg.detectField);
    if (!$detectTd.length) {
      applyRowLocks($tr, cfg);
      return;
    }

    var bucketId = readBucketId($detectTd);
    if (!bucketId) {
      applyRowLocks($tr, cfg);
      return;
    }

    var rule = cfg.rules[bucketId];
    if (!rule) {
      clearRow($tr, cfg);
      applyRowLocks($tr, cfg);
      return;
    }

    var activeSet  = new Set(rule.activeFields || []);
    var hiddenSet  = new Set(rule.hiddenFields || []);

    // Hide or gray every column not in the active set
    cfg.allColumnKeys.forEach(function (fieldKey) {
      if (activeSet.has(fieldKey)) return;
      var $td = $tr.find('td.' + fieldKey);
      if (!$td.length) return;
      if (hiddenSet.has(fieldKey)) { hideTd($td); } else { grayTd($td); }
    });

    // Hide fields listed in hiddenFields that aren't in allColumnKeys (e.g. labelTarget)
    hiddenSet.forEach(function (fieldKey) {
      if (cfg.allColumnKeys.indexOf(fieldKey) !== -1) return;  // already handled above
      if (activeSet.has(fieldKey)) return;
      var $td = $tr.find('td.' + fieldKey);
      if ($td.length) hideTd($td);
    });

    // ── Bucket label injection ──
    var label = BUCKET_LABELS[bucketId];
    if (label) {
      var $target = $tr.find('td.' + cfg.labelTarget);

      if (cfg.labelMode === 'replace') {
        // view_3456: combine label + labor desc, show via ::after on grayed product cell
        var laborField = cfg.laborDescField;
        var laborText = '';
        if (laborField) {
          var $laborDesc = $tr.find('td.' + laborField);
          laborText = $laborDesc.length ? $laborDesc.text().trim() : '';
        }
        var combined = laborText ? label + ' \u2014 ' + laborText : label;
        if ($target.length) {
          $target.first().attr('data-scw-bucket-label', combined);
        }
      } else if (cfg.labelMode === 'prefix') {
        // prefix mode: show label above product text via ::before, product stays visible
        if ($target.length) {
          $target.first().attr('data-scw-bucket-label', label);
        }
      }
    }

    $tr.addClass(rule.rowClass);
    $tr.attr(ROW_PROCESSED, '1');

    applyRowLocks($tr, cfg);
  }

  // ============================================================
  // VIEW-LEVEL APPLICATION
  // ============================================================
  function applyForView(cfg) {
    var $view = $('#' + cfg.viewId);
    if (!$view.length) return;

    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

    $tbody.find('tr').each(function () {
      processRow($(this), cfg);
    });
  }

  // ============================================================
  // SORT ROWS BY SORT_FIELD
  // ============================================================
  function sortRows(cfg) {
    if (!cfg.sortField) return;

    var $view = $('#' + cfg.viewId);
    if (!$view.length) return;
    var $tbody = $view.find('table.kn-table-table tbody');
    if (!$tbody.length) return;

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
        if (!groups.length || groups[groups.length - 1].header) {
          current = { header: null, rows: [] };
          groups.push(current);
        }
        current.rows.push(row);
      }
    });

    var sortField = cfg.sortField;
    var comparator = function (a, b) {
      var aVal = $(a).find('td.' + sortField).text().trim();
      var bVal = $(b).find('td.' + sortField).text().trim();
      var aNum = parseFloat(aVal);
      var bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return aVal.localeCompare(bVal);
    };

    groups.forEach(function (g) {
      if (g.rows.length > 1) g.rows.sort(comparator);
    });

    groups.forEach(function (g) {
      if (g.header) $tbody.append(g.header);
      g.rows.forEach(function (row) { $tbody.append(row); });
    });
  }

  // Removed: applyWithRetries (12×250ms polling loop).
  // The MutationObserver on tbody already re-applies after DOM changes.

  // ============================================================
  // CAPTURE-PHASE EVENT BLOCKER
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
      document.addEventListener(evt, kill, true);
    });
  }

  // ============================================================
  // MUTATION OBSERVER
  // ============================================================
  function installObserver(cfg) {
    var $view = $('#' + cfg.viewId);
    if (!$view.length) return;
    if ($view.data('scwCondGrayObserver')) return;
    $view.data('scwCondGrayObserver', true);

    var el = $view.find('table.kn-table-table tbody').get(0);
    if (!el) return;

    var obsTimer = 0;
    var obs = new MutationObserver(function () {
      if (obsTimer) clearTimeout(obsTimer);
      obsTimer = setTimeout(function () { obsTimer = 0; applyForView(cfg); }, 150);
    });
    obs.observe(el, { childList: true, subtree: true });
  }

  // ============================================================
  // INIT
  // ============================================================
  injectCssOnce();
  installCaptureBlockerOnce();

  VIEW_CONFIGS.forEach(function (cfg) {
    $(document)
      .off('knack-view-render.' + cfg.viewId + EVENT_NS)
      .on('knack-view-render.' + cfg.viewId + EVENT_NS, function () {
        sortRows(cfg);
        applyForView(cfg);
        installObserver(cfg);
      });
  });
})();
/***************************** /CONDITIONAL ROW GRAYOUT BY BUCKET TYPE *******************************/


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

enableCheckboxSelectSync({
  viewId: 'view_3544',
  selectFieldId: 'field_2180'
});

enableCheckboxSelectSync({
  viewId: 'view_3619',
  selectFieldId: 'field_2180'
});

enableCheckboxSelectSync({
  viewId: 'view_3627',
  selectFieldId: 'field_2180'
});

enableCheckboxSelectSync({
  viewId: 'view_3544',
  selectFieldId: 'field_2250'
});

enableCheckboxSelectSync({
  viewId: 'view_3619',
  selectFieldId: 'field_2250'
});

enableCheckboxSelectSync({
  viewId: 'view_3627',
  selectFieldId: 'field_2250'
});

/*




/***************************** SURVEY / PROJECT FORM: drag + drop View / Location Upload fields *******************/

(function () {
  'use strict';

  /**
   * Enhance upload fields in a Knack form view with drag-and-drop
   * styling and status messages (red = empty, green = uploaded,
   * orange = pending replacement).
   */
  function enhanceUploadFields(uploadFields) {
    uploadFields.forEach(function (inputFieldId) {
      var $uploadWrapper = $('#' + inputFieldId).parent('.kn-file-upload');
      var $fileInput = $('#' + inputFieldId);

      var existingFilename = '';

      if (!$uploadWrapper.length || !$fileInput.length) return;

      // Style wrapper
      $uploadWrapper.css({
        position: 'relative',
        width: '100%',
        height: '150px',
        minHeight: '150px',
        backgroundColor: 'rgba(255, 0, 0, 0.2)',
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
        $uploadWrapper.append(
          '<div class="upload-message" style="' +
            'position: absolute; top: 0; left: 0; right: 0; bottom: 0;' +
            'display: flex; align-items: center; justify-content: center;' +
            'border: 2px dashed #1890ff; border-radius: 8px;' +
            'font-size: 16px; font-weight: 500; color: #1890ff;' +
            'text-align: center; pointer-events: none; z-index: 1;">' +
            'Drop your file here or click to upload' +
          '</div>'
        );
      }

      function getFilenameFromAsset(assetElement) {
        if (!assetElement) return '';
        var link = assetElement.querySelector('a');
        if (link) return link.innerText.trim();
        return assetElement.innerText.replace(/remove/i, '').trim();
      }

      function setUploadMessage(currentFilename, newFilename, mode) {
        newFilename = newFilename || '';
        mode = mode || 'normal';
        var $message = $uploadWrapper.find('.upload-message');

        if (mode === 'uploading-new') {
          $message.html(
            '<div style="padding: 20px;">Please click UPDATE to upload this file:<br><strong>' +
            newFilename + '</strong></div>'
          );
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)');
        } else if (mode === 'uploading-replacement') {
          $message.html(
            '<div style="padding: 20px;">Click UPDATE to replace <br><strong>' +
            currentFilename + '</strong><br> with <br><strong>' + newFilename + '</strong></div>'
          );
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)');
        } else if (currentFilename) {
          $message.html('<div style="padding: 20px;">Good Job!</div>');
          $uploadWrapper.css('background-color', 'rgba(0, 128, 0, 0.2)');
        } else {
          $message.html('Drop your file here or click to upload');
          $uploadWrapper.css('background-color', 'rgba(255, 0, 0, 0.2)');
        }
      }

      function hideAssetCurrent() {
        var el = document.getElementById(inputFieldId);
        if (!el) return;
        var knInput = el.closest('.kn-input');
        if (!knInput) return;
        var asset = knInput.querySelector('.kn-asset-current');
        if (asset) $(asset).hide();
      }

      function checkExistingUpload() {
        var el = document.getElementById(inputFieldId);
        if (!el) return;
        var knInput = el.closest('.kn-input');
        if (!knInput) return;
        var asset = knInput.querySelector('.kn-asset-current');
        var filename = getFilenameFromAsset(asset);

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
      var el = document.getElementById(inputFieldId);
      var knInput = el ? el.closest('.kn-input') : null;
      var observeTarget = knInput ? knInput.querySelector('.kn-asset-current') : null;

      if (observeTarget) {
        var observer = new MutationObserver(function () {
          var asset = knInput.querySelector('.kn-asset-current');
          var filename = getFilenameFromAsset(asset);

          if (filename) {
            if (existingFilename && filename !== existingFilename) {
              setUploadMessage(existingFilename, filename, 'uploading-replacement');
            } else if (!existingFilename) {
              setUploadMessage('', filename, 'uploading-new');
            } else {
              existingFilename = filename;
              setUploadMessage(filename);
            }
          } else {
            setUploadMessage('', '', 'empty');
          }
          hideAssetCurrent();
        });

        observer.observe(observeTarget, { childList: true, subtree: true });
      }
    });
  }

  // ── View configs: viewId → upload field IDs ──
  var VIEW_CONFIGS = [
    { viewId: 'view_3094', fields: ['field_1808_upload', 'field_1809_upload'] },
    { viewId: 'view_3297', fields: ['field_1808_upload', 'field_1809_upload', 'field_1930_upload'] }
  ];

  VIEW_CONFIGS.forEach(function (cfg) {
    $(document).on('knack-view-render.' + cfg.viewId, function () {
      enhanceUploadFields(cfg.fields);
    });
  });
})();

/***************************** /SURVEY / PROJECT FORM: drag + drop Upload fields *******************/


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
        var margin = document.querySelector('input#field_1365').value;
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
    VIEWS: ["view_3329","view_3544","view_3451","view_3619","view_3627"],

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
/*** Recalculate totals on scene_1116 after inline edits or form submissions ***/
(function () {
  'use strict';

  var SCENE = 'scene_1116';
  var TARGET_VIEW = 'view_3418';
  var FORM_VIEWS = ['view_3492', 'view_3490'];
  // Source grid views whose data feeds the totals panel
  var SOURCE_VIEWS = ['view_3586', 'view_3588', 'view_3604'];
  var NS = '.scwRefreshTarget';
  var OVERLAY_ID = 'scw-totals-refresh-overlay';

  // ── Loading overlay on view_3418 ──
  var OVERLAY_STYLE_ID = 'scw-totals-refresh-css';
  function injectOverlayStyle() {
    if (document.getElementById(OVERLAY_STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = OVERLAY_STYLE_ID;
    s.textContent = [
      '#' + OVERLAY_ID + ' {',
      '  position: absolute; top: 0; left: 0; right: 0; bottom: 0;',
      '  display: flex; align-items: center; justify-content: center;',
      '  background: rgba(255,255,255,.78);',
      '  color: #555; font-size: 13px; font-weight: 500; letter-spacing: .3px;',
      '  border-radius: 8px; z-index: 5;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showRefreshing() {
    injectOverlayStyle();
    var el = document.getElementById(TARGET_VIEW);
    if (!el) return;
    // Ensure positioned parent for the overlay
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
    }
    // Don't add a duplicate
    if (document.getElementById(OVERLAY_ID)) return;
    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.textContent = 'Refreshing\u2026';
    el.appendChild(overlay);
  }

  function hideRefreshing() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
  }

  /**
   * Refresh the source grid views so their DOM updates with fresh data.
   * scene-tweaks.js already binds onViewRender for these grids → restructureTotals,
   * so totals recalculate automatically once the grids re-render.
   */
  function refreshSourceGrids() {
    if (typeof Knack === 'undefined') return;

    var pending = 0;
    var fetched = false;

    SOURCE_VIEWS.forEach(function (viewId) {
      var view = Knack.views && Knack.views[viewId];
      if (view && view.model && typeof view.model.fetch === 'function') {
        pending++;
        fetched = true;
        $(document).one('knack-view-render.' + viewId + NS + 'Grid', function () {
          pending--;
          if (pending <= 0) hideRefreshing();
        });
        console.log('[scw-refresh] Fetching source grid ' + viewId);
        view.model.fetch();
      }
    });

    if (!fetched) {
      // Fallback: just recalculate from current DOM
      console.log('[scw-refresh] No source grids available, recalculating from DOM');
      if (window.SCW && typeof SCW.restructureTotals === 'function') {
        SCW.restructureTotals();
      }
      hideRefreshing();
    }

    // Safety timeout — clear overlay after 10s no matter what
    setTimeout(hideRefreshing, 10000);
  }

  // ── Immediate submit-button click interception (capture phase) ──
  // knack-form-submit fires AFTER the AJAX round-trip completes.
  // We intercept the actual button click so the overlay appears instantly.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button[type="submit"]');
    if (!btn) return;
    var form = btn.closest('form');
    if (!form) return;
    var isTargetForm = false;
    for (var i = 0; i < FORM_VIEWS.length; i++) {
      if (form.closest('#' + FORM_VIEWS[i])) { isTargetForm = true; break; }
    }
    if (isTargetForm) {
      console.log('[scw-refresh] Submit button clicked — showing overlay');
      showRefreshing();
    }
  }, true); // capture phase — fires before Knack's handler

  // --- form submissions (knack-form-submit.viewId) ---
  // By the time this fires, the save is done — refresh the source grids.
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-form-submit.' + formViewId + NS)
               .on('knack-form-submit.' + formViewId + NS, function () {
      console.log('[scw-refresh] Form submit detected on ' + formViewId);
      refreshSourceGrids();
    });
  });

  // --- record create / update on form views ---
  FORM_VIEWS.forEach(function (formViewId) {
    $(document).off('knack-record-create.' + formViewId + NS)
               .on('knack-record-create.' + formViewId + NS, function () {
      console.log('[scw-refresh] Record create detected on ' + formViewId);
      refreshSourceGrids();
    });
    $(document).off('knack-record-update.' + formViewId + NS)
               .on('knack-record-update.' + formViewId + NS, function () {
      console.log('[scw-refresh] Record update detected on ' + formViewId);
      refreshSourceGrids();
    });
  });

  /** Recalculate totals from current DOM (for cell updates / direct edits). */
  function recalcTotals() {
    if (window.SCW && typeof SCW.restructureTotals === 'function') {
      SCW.restructureTotals();
    }
  }

  /** Debounced version for rapid-fire events (e.g. multiple cell updates). */
  var debounceTimer = null;
  function recalcDebounced() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recalcTotals, 300);
  }

  // --- inline edits on any view in the scene (standard Knack cell-update) ---
  // Cell updates change DOM in-place, so recalc from DOM is sufficient.
  $(document).on('knack-scene-render.' + SCENE, function () {
    var views = [];
    $('[id^="view_"]').each(function () {
      if (/^view_\d+$/.test(this.id)) views.push(this.id);
    });

    views.forEach(function (viewId) {
      $(document).off('knack-cell-update.' + viewId + NS)
                 .on('knack-cell-update.' + viewId + NS, function () {
        console.log('[scw-refresh] Cell update detected on ' + viewId);
        recalcDebounced();
      });
    });
  });

  // --- device-worksheet direct edits (AJAX PUT / model.updateRecord) ---
  $(document).off('scw-record-saved' + NS)
             .on('scw-record-saved' + NS, function () {
    if (typeof Knack !== 'undefined' && Knack.views && Knack.views[TARGET_VIEW]) {
      console.log('[scw-refresh] Direct edit save detected');
      setTimeout(recalcTotals, 1000);
      setTimeout(recalcTotals, 3000);
    }
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

      // KTL / Chosen / persistent forms: value can settle a beat later.
      // Single rAF recheck instead of 3 blind timers (50/250/800ms).
      requestAnimationFrame(() => applyRulesToScope($s, cfg));
    });
  }

  // ============================================================
  // MutationObserver: re-run when KTL rebuilds or moves nodes
  // ============================================================
  function installObservers() {
    // Scope to #knack-dist (Knack's content area) instead of document.body
    const target = document.getElementById('knack-dist') || document.body;
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

  // Boot — observer + view-render/scene-render hooks cover re-init.
  installObservers();
  $(function () { FORMS.forEach(initEverywhere); });
})();
////************* /SCW: FORM BUCKET → FIELD VISIBILITY *************////
////*************** DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3544', 'view_3619', 'view_3627']; // add more views
  const BUCKET_FIELD_KEY = 'field_2223';
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID = 'scw-bucket-visibility-css-survey-bid';

  // Assumptions bucket: field_2210 only visible when field_2248 = "Custom Assumption"
  const ASSUMPTIONS_BUCKET_ID = '697b7a023a31502ec68b3303';
  const CUSTOM_ASSUMPTION_RECORD = '69ce7098172caa5786d3767d';
  const ASSUMPTION_TYPE_FIELD = 'field_2248';
  const ASSUMPTION_DESC_FIELD = 'field_2210';

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
      ['field_2462', 'FLAG_use existing cabling'],
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
      ['field_2432', 'INPUT_survey notes'],
      ['field_2248', 'INPUT_assumptions'],
    ],
    //licenses
    '645554dce6f3a60028362a6a': [
      ['field_2427', 'REL_bid'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2224', 'REL_products for licenses'],
    ],
  };

  const ALL_FIELD_KEYS = [
    'field_2427','field_2180','field_2194','field_2183','field_2210','field_2224','field_2248','field_2250','field_2432','field_2181','field_2462',
    'field_2206','field_2195','field_2241','field_2184','field_2187','field_2211','field_2233','field_2246',
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

  function getFieldValue($scope, viewId, fieldKey) {
    let $sel = $scope.find('#' + viewId + '-' + fieldKey);
    if (!$sel.length) $sel = $scope.find('select[name="' + fieldKey + '"]');
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, viewId) {
    const bucketValue = getBucketValue($scope, viewId);

    hideAllExceptBucket($scope);
    if (!bucketValue) return;

    (BUCKET_RULES[bucketValue] || []).forEach((k) => showField($scope, k));

    // Assumptions bucket: show field_2210 only when field_2248 = Custom Assumption
    if (bucketValue === ASSUMPTIONS_BUCKET_ID) {
      var typeVal = getFieldValue($scope, viewId, ASSUMPTION_TYPE_FIELD);
      if (typeVal === CUSTOM_ASSUMPTION_RECORD) {
        showField($scope, ASSUMPTION_DESC_FIELD);
      } else {
        hideField($scope, ASSUMPTION_DESC_FIELD);
      }
    }
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

    // Re-evaluate when assumption type field changes
    const typeSel = `#${viewId} select[name="${ASSUMPTION_TYPE_FIELD}"], #${viewId} #${viewId}-${ASSUMPTION_TYPE_FIELD}`;

    $(document)
      .off('change' + EVENT_NS + '-type', typeSel)
      .on('change' + EVENT_NS + '-type', typeSel, function () {
        const $scope = $(this).closest('form, .kn-form, .kn-view').length
          ? $(this).closest('form, .kn-form, .kn-view')
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
  var TARGET_VIEWS = ['view_3512', 'view_3505', 'view_3559', 'view_3577', 'view_3602', 'view_3313', 'view_3586', 'view_3588', 'view_3596', 'view_3608', 'view_3610', 'view_3617'];
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
    'view_3313': 'add-photo-to-sow-line-item',
    'view_3610': 'add-photo-to-sow-line-item',
    'view_3586': 'add-photo-to-sow-line-item',
    'view_3559': 'add-photo-to-mdf-idf',
    'view_3577': 'add-photo-to-mdf-idf2',
    'view_3602': 'add-photo-to-mdf-idf2',
    'view_3588': 'add-photo-to-sow-line-item2',
    'view_3596': 'add-photo-to-sow-line-item3',
    'view_3608': 'add-photo-to-sow-line-item2',
    'view_3617': 'add-photo-to-mdf-idf4'
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
      '#view_3559 td.field_2447,',
      '#view_3577 th.field_114,',
      '#view_3577 td.field_114,',
      '#view_3577 th.field_2445,',
      '#view_3577 td.field_2445,',
      '#view_3577 th.field_2446,',
      '#view_3577 td.field_2446,',
      '#view_3577 th.field_2447,',
      '#view_3577 td.field_2447,',
      '#view_3602 th.field_114,',
      '#view_3602 td.field_114,',
      '#view_3602 th.field_2445,',
      '#view_3602 td.field_2445,',
      '#view_3602 th.field_2446,',
      '#view_3602 td.field_2446,',
      '#view_3602 th.field_2447,',
      '#view_3602 td.field_2447,',
      '#view_3313 th.field_114,',
      '#view_3313 td.field_114,',
      '#view_3313 th.field_2445,',
      '#view_3313 td.field_2445,',
      '#view_3313 th.field_2446,',
      '#view_3313 td.field_2446,',
      '#view_3313 th.field_2447,',
      '#view_3313 td.field_2447,',
      '#view_3610 th.field_114,',
      '#view_3610 td.field_114,',
      '#view_3610 th.field_2445,',
      '#view_3610 td.field_2445,',
      '#view_3610 th.field_2446,',
      '#view_3610 td.field_2446,',
      '#view_3610 th.field_2447,',
      '#view_3610 td.field_2447,',
      '#view_3586 th.field_114,',
      '#view_3586 td.field_114,',
      '#view_3586 th.field_2445,',
      '#view_3586 td.field_2445,',
      '#view_3586 th.field_2446,',
      '#view_3586 td.field_2446,',
      '#view_3586 th.field_2447,',
      '#view_3586 td.field_2447,',
      '#view_3588 th.field_114,',
      '#view_3588 td.field_114,',
      '#view_3588 th.field_2445,',
      '#view_3588 td.field_2445,',
      '#view_3588 th.field_2446,',
      '#view_3588 td.field_2446,',
      '#view_3588 th.field_2447,',
      '#view_3588 td.field_2447 {',
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

  /**
   * Extract the SOW base path from the current URL hash.
   * Supported URL patterns:
   *   #team-calendar/project-dashboard/{id}/build-sow/{id}/...
   *   #team-calendar/project-dashboard/{id}/build-quote/{id}/...
   *   #sales-portal/company-details/{id}/scope-of-work-details/{id}/...
   */
  function getBuildSowBasePath() {
    var hash = window.location.hash || '';
    var patterns = [
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/build-(?:sow|quote)\/[a-f0-9]{24})/,
      /(sales-portal\/company-details\/[a-f0-9]{24}\/scope-of-work-details\/[a-f0-9]{24})/,
      /(proposals\/scope-of-work\/[a-f0-9]{24})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = hash.match(patterns[i]);
      if (match) return match[1];
    }
    return '';
  }

  // Views that use the build-sow URL structure instead of survey
  var SOW_VIEWS = { 'view_3313': true, 'view_3577': true, 'view_3602': true, 'view_3586': true, 'view_3588': true, 'view_3610': true, 'view_3596': true };

  /** Build the edit-photo hash path for a photo record. */
  function editPhotoHash(photoRecordId, viewId) {
    if (viewId && SOW_VIEWS[viewId]) {
      var sowBase = getBuildSowBasePath();
      if (!sowBase) return '';
      // sales-portal/scope-of-work-details uses edit-doc-photo2; build-sow/build-quote uses edit-photo
      var editSlug = sowBase.indexOf('scope-of-work-details') !== -1 ? 'edit-doc-photo2' : 'edit-photo';
      return sowBase + '/' + editSlug + '/' + photoRecordId;
    }
    var surveyId = getSurveyRequestId();
    if (!surveyId) return '';
    return 'subcontractor-portal/site-survey-request-details/' +
      surveyId + '/edit-doc-photo/' + photoRecordId;
  }

  /** Build the add-photo hash path (view-specific segment). */
  function addPhotoHash(lineItemId, viewId) {
    if (viewId && SOW_VIEWS[viewId]) {
      var sowBase = getBuildSowBasePath();
      if (!sowBase) return '';
      var pathSegment = ADD_PHOTO_PATHS[viewId] || DEFAULT_ADD_PATH;
      return sowBase + '/' + pathSegment + '/' + lineItemId;
    }
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
            (function (rid, vid) {
              imgEl.addEventListener('click', function () {
                var h = editPhotoHash(rid, vid);
                if (h) window.location.hash = h;
              });
            })(photo.id, viewId);
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
            (function (rid, vid) {
              empty.addEventListener('click', function () {
                var h = editPhotoHash(rid, vid);
                if (h) window.location.hash = h;
              });
            })(photo.id, viewId);
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
        // These columns get hidden (header + cells);
        // field_2370 handled by device-worksheet (toggleChit in header)
        hideFieldKeys: ['field_2371'],
        fields: [
          { label: 'Exterior',         fieldKey: 'field_2372' },
          { label: 'Plenum',           fieldKey: 'field_2371' }
        ]
      },
      {
        viewId: 'view_3505',
        hostFieldKey: 'field_2372',
        hideFieldKeys: ['field_2371'],
        fields: [
          { label: 'Exterior',         fieldKey: 'field_2372' },
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

      /* ---- yes state (hunter green — matches radio chips & cabling chits) ---- */
      '.' + CHIP_CLASS + '.is-yes {',
      '  background-color: #1a6b3c;',
      '  color: #ffffff;',
      '  border-color: #145230;',
      '}',
      '.' + CHIP_CLASS + '.is-yes:hover {',
      '  background-color: #145230;',
      '  box-shadow: 0 1px 3px rgba(20,82,48,0.25);',
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
    if (match) return match[0];

    // In the worksheet context the chip lives in a card row (tr.scw-ws-row)
    // which doesn't carry the record ID. Walk backwards to find the
    // original Knack data row whose id contains the record hash.
    var prev = tr.previousElementSibling;
    while (prev) {
      var prevId = prev.id || '';
      var prevMatch = prevId.match(/[0-9a-f]{24}/i);
      if (prevMatch) return prevMatch[0];
      prev = prev.previousElementSibling;
    }
    return null;
  }

  /**
   * Update a field value via Knack's internal APIs.
   */
  function saveFieldValue(viewId, recordId, fieldKey, boolValue, onDone) {
    var data = {};
    // Knack Yes/No fields expect string "Yes"/"No", not boolean true/false
    data[fieldKey] = boolValue === 'yes' ? 'Yes' : 'No';

    // Always use direct AJAX PUT — model.updateRecord silently fails
    // in the worksheet context where rows are restructured.
    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId),
      type: 'PUT',
      data: JSON.stringify(data),
      success: function (resp) {
        // Sync the changed field into Knack's Backbone model so
        // subsequent re-renders don't revert the value.
        if (typeof SCW.syncKnackModel === 'function') {
          SCW.syncKnackModel(viewId, recordId, resp, fieldKey, data[fieldKey]);
        }
        if (onDone) onDone();
      },
      error: function (xhr) {
        console.warn('[scw-bool-chips] Save failed for ' + recordId, xhr.responseText);
        if (onDone) onDone();
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

    // Also update the hidden source cell so re-renders stay in sync.
    // In the worksheet context the chip host td is inside the card row
    // (tr.scw-ws-row), but the hidden field tds are in the ORIGINAL
    // data row (previousElementSibling).  Search both rows.
    var $tr = $(td).closest('tr');
    var $srcTd = $tr.find('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]').not(td);
    if (!$srcTd.length) {
      var prevTr = $tr[0] && $tr[0].previousElementSibling;
      if (prevTr) {
        $srcTd = $(prevTr).find('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]');
      }
    }
    if ($srcTd.length) {
      $srcTd.text(newValue === 'yes' ? 'Yes' : 'No');
    }

    // Save — remove is-saving (pointer-events: none) only after the
    // save completes, not on a blind 400ms timer.
    var tr = td.closest('tr');
    var recordId = tr ? getRecordId(tr) : null;
    if (recordId) {
      saveFieldValue(viewCfg.viewId, recordId, fieldCfg.fieldKey, newValue, function () {
        newChip.classList.remove('is-saving');
      });
    } else {
      newChip.classList.remove('is-saving');
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
/*** DELETE INTERCEPT — fire accessory IDs to webhook before record deletion ***/
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  // Connection fields whose linked record IDs should be sent to the
  // webhook when the parent record is deleted.
  var CONNECTION_FIELDS = ['field_1958'];

  // Webhook URL — reuses the existing delete record webhook.
  function getWebhookUrl() {
    return (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_DELETE_RECORD_WEBHOOK) || '';
  }

  // Delete confirm message patterns
  var SINGLE_DELETE_RE = /are you sure you want to delete this/i;
  var BULK_DELETE_RE = /are you sure you want to permanently delete \d+ records/i;

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Get connected accessory record IDs from the DOM.
   * The connected-records widget renders .scw-cr-remove buttons with
   * data-record-id on each accessory item inside the worksheet row.
   */
  function getConnectedIdsFromDOM(recordId) {
    var ids = [];

    // The device worksheet creates a tr.scw-ws-row with the same record ID.
    // The original hidden Knack <tr> also has this ID, so getElementById
    // may return the wrong one. Query specifically for the worksheet row.
    var wsRow = document.querySelector('tr.scw-ws-row[id="' + recordId + '"]');
    if (wsRow) {
      var buttons = wsRow.querySelectorAll('.scw-cr-remove[data-record-id]');
      for (var i = 0; i < buttons.length; i++) {
        var rid = buttons[i].getAttribute('data-record-id');
        if (rid) ids.push(rid);
      }
    }

    // Fallback: search any <tr> with this ID
    if (!ids.length) {
      var rows = document.querySelectorAll('tr[id="' + recordId + '"]');
      for (var r = 0; r < rows.length; r++) {
        var btns = rows[r].querySelectorAll('.scw-cr-remove[data-record-id]');
        for (var b = 0; b < btns.length; b++) {
          var id = btns[b].getAttribute('data-record-id');
          if (id) ids.push(id);
        }
      }
    }

    console.log('[SCW][delete-intercept] DOM lookup for ' + recordId + ': found ' + ids.length + ' accessory IDs', ids);
    return ids;
  }

  /**
   * Fire-and-forget webhook with the accessory record IDs.
   */
  function fireWebhook(deletedRecordIds, accessoryIds) {
    var url = getWebhookUrl();
    if (!url) {
      console.warn('[SCW][delete-intercept] No webhook URL configured');
      return;
    }

    var payload = {
      deletedRecordIds: deletedRecordIds,
      accessoryRecordIds: accessoryIds
    };

    console.log('[SCW][delete-intercept] Sending to webhook:', payload);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      if (!resp.ok) {
        console.warn('[SCW][delete-intercept] Webhook responded ' + resp.status);
      }
    }).catch(function (err) {
      console.warn('[SCW][delete-intercept] Webhook failed:', err);
    });
  }

  // ============================================================
  // TRACK WHICH ROW THE USER CLICKED (for single delete)
  // ============================================================

  var _lastClickedRecordId = null;

  // Capture clicks on delete icons / links BEFORE the confirm dialog fires.
  // Uses capture phase so we see it before Knack's handler calls confirm().
  document.addEventListener('click', function (e) {
    // Knack delete links are <a> with class "kn-link-delete" or inside
    // a td.kn-table-link with a trash icon. Walk up to the <tr>.
    var link = e.target.closest('a.kn-link-delete, .kn-link-delete, td.kn-table-link a');
    if (!link) {
      _lastClickedRecordId = null;
      return;
    }

    var tr = link.closest('tr[id]');
    if (tr && /^[a-f0-9]{24}$/.test(tr.id)) {
      _lastClickedRecordId = tr.id;
      console.log('[SCW][delete-intercept] Tracked click on record ' + tr.id);
    }
  }, true); // capture phase

  // ============================================================
  // GET BULK-SELECTED RECORD IDs (for KTL bulk delete)
  // ============================================================

  function getBulkSelectedRecordIds() {
    var ids = [];
    // KTL marks selected rows with .bulkEditSelectedRow on <td> elements
    var cells = document.querySelectorAll('td.bulkEditSelectedRow');
    var seen = {};
    for (var i = 0; i < cells.length; i++) {
      var tr = cells[i].closest('tr[id]');
      if (tr && /^[a-f0-9]{24}$/.test(tr.id) && !seen[tr.id]) {
        seen[tr.id] = true;
        ids.push(tr.id);
      }
    }

    // Also check for selected rows via Knack's own checkbox selection
    if (!ids.length) {
      var checked = document.querySelectorAll('tr .kn-table-bulk-checkbox input:checked');
      for (var c = 0; c < checked.length; c++) {
        var row = checked[c].closest('tr[id]');
        if (row && /^[a-f0-9]{24}$/.test(row.id) && !seen[row.id]) {
          seen[row.id] = true;
          ids.push(row.id);
        }
      }
    }

    return ids;
  }

  // ============================================================
  // window.confirm INTERCEPT
  // ============================================================

  var _origConfirm = window.confirm;

  window.confirm = function (msg) {
    var result = _origConfirm.call(window, msg);

    // Only act if user clicked OK
    if (!result) return result;

    var deletedRecordIds = [];

    if (BULK_DELETE_RE.test(msg)) {
      // KTL bulk delete
      deletedRecordIds = getBulkSelectedRecordIds();
      console.log('[SCW][delete-intercept] Bulk delete confirmed — ' + deletedRecordIds.length + ' records:', deletedRecordIds);

    } else if (SINGLE_DELETE_RE.test(msg)) {
      // Single record delete
      if (_lastClickedRecordId) {
        deletedRecordIds = [_lastClickedRecordId];
        console.log('[SCW][delete-intercept] Single delete confirmed — record:', _lastClickedRecordId);
      } else {
        console.warn('[SCW][delete-intercept] Single delete confirmed but no record ID captured');
      }
    }

    if (!deletedRecordIds.length) return result;

    // Collect all accessory IDs across all deleted records
    var allAccessoryIds = [];
    for (var i = 0; i < deletedRecordIds.length; i++) {
      var accessories = getConnectedIdsFromDOM(deletedRecordIds[i]);
      if (accessories.length) {
        console.log('[SCW][delete-intercept] Record ' + deletedRecordIds[i] + ' has accessories:', accessories);
        allAccessoryIds = allAccessoryIds.concat(accessories);
      }
    }

    if (allAccessoryIds.length) {
      fireWebhook(deletedRecordIds, allAccessoryIds);
    } else {
      console.log('[SCW][delete-intercept] No connected accessories found for deleted records');
    }

    return result;
  };

  console.log('[SCW][delete-intercept] Installed — patched window.confirm to monitor delete confirmations');
})();
/*** CONNECTED RECORDS EDITOR ***/
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  var STYLE_ID = 'scw-connected-records-css';

  var CONFIG = {
    views: [
      {
        parentViewId: 'view_3313',
        connectionField: 'field_1958',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item',
        warningField: 'field_2244',
        parentConnectionField: 'field_2464'   // connection FROM accessory back TO parent
      },
      {
        parentViewId: 'view_3610',
        connectionField: 'field_1958',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item',
        editSlug: 'edit-scope-line-item2',
        warningField: 'field_2244',
        parentConnectionField: 'field_2464'
      },
      {
        parentViewId: 'view_3586',
        connectionField: 'field_1958',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item',
        itemSlug: 'edit-accessory-line-item2',
        warningField: 'field_2244',
        parentConnectionField: 'field_2464'
      },
      {
        parentViewId: 'view_3588',
        connectionField: 'field_1958',
        label: 'Mounting\nHardware',
        addSlug: 'add-accessory-line-item2',
        editSlug: 'add-photo-to-sow-line-item2',
        itemSlug: 'edit-accessory-line-item2',
        warningField: 'field_2244',
        parentConnectionField: 'field_2464'
      }
    ]
  };

  // ==========================================================
  // CSS
  // ============================================================

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    var css = `
      .scw-cr-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 200px;
      }

      .scw-cr-item {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 3px 6px;
        border-radius: 4px;
        background: rgba(0,0,0,0.03);
        transition: background 0.15s;
        width: 100%;
        box-sizing: border-box;
      }
      .scw-cr-item:hover {
        background: rgba(0,0,0,0.06);
      }

      .scw-cr-item-warn {
        background: #fff3cd !important;
        border-left: 3px solid #d97706;
      }
      .scw-cr-item-warn:hover {
        background: #ffecb3 !important;
      }

      .scw-cr-link {
        flex: 1 1 0%;
        min-width: 0;
        font-size: 12px;
        line-height: 1.3;
        color: #1a73e8;
        text-decoration: none;
        padding: 2px 4px;
        word-break: break-word;
      }
      .scw-cr-link:hover {
        text-decoration: underline;
      }

      .scw-cr-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        background: none;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        color: #999;
        padding: 0;
        flex-shrink: 0;
        transition: color 0.15s, background 0.15s;
      }
      .scw-cr-remove:hover {
        color: #d93025;
        background: rgba(217,48,37,0.08);
      }
      .scw-cr-remove svg {
        width: 14px;
        height: 14px;
      }
      .scw-cr-item.scw-cr-deleting {
        opacity: 0.5;
        pointer-events: none;
      }

      .scw-cr-add {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: none;
        border: 1px dashed rgba(0,0,0,0.2);
        border-radius: 4px;
        cursor: pointer;
        color: #666;
        font-size: 11px;
        padding: 3px 8px;
        margin-top: 2px;
        transition: color 0.15s, border-color 0.15s;
      }
      .scw-cr-add:hover {
        color: #1a73e8;
        border-color: #1a73e8;
      }

      .scw-cr-empty {
        font-size: 11px;
        color: #999;
        font-style: italic;
        padding: 2px 4px;
      }

      .scw-cr-warning {
        color: #d97706;
        font-size: 14px;
        flex-shrink: 0;
        line-height: 1;
      }

      .scw-cr-hdr-warning {
        color: #b45309;
        display: inline-flex;
        align-items: center;
        margin-left: 10px;
        flex-shrink: 0;
        padding-top: 5px;
      }
      .scw-cr-hdr-warning svg {
        width: 18px;
        height: 18px;
      }

      /* ── Delete confirmation modal ── */
      .scw-cr-modal-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.45);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: scwCrFadeIn 0.15s ease-out;
      }
      @keyframes scwCrFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .scw-cr-modal {
        background: #fff;
        border-radius: 12px;
        padding: 28px 32px 24px;
        max-width: 380px;
        width: 90%;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        text-align: center;
      }
      .scw-cr-modal__icon {
        font-size: 36px;
        margin-bottom: 12px;
      }
      .scw-cr-modal__msg {
        font-size: 15px;
        font-weight: 600;
        color: #333;
        margin-bottom: 8px;
      }
      .scw-cr-modal__name {
        font-size: 13px;
        color: #666;
        margin-bottom: 20px;
        word-break: break-word;
      }
      .scw-cr-modal__btns {
        display: flex;
        gap: 10px;
        justify-content: center;
      }
      .scw-cr-modal__btn {
        padding: 8px 20px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: background 0.15s, transform 0.1s;
      }
      .scw-cr-modal__btn:active {
        transform: scale(0.97);
      }
      .scw-cr-modal__btn--cancel {
        background: #f1f3f4;
        color: #333;
      }
      .scw-cr-modal__btn--cancel:hover {
        background: #e0e2e4;
      }
      .scw-cr-modal__btn--confirm {
        background: #d93025;
        color: #fff;
      }
      .scw-cr-modal__btn--confirm:hover {
        background: #b71c1c;
      }

      /* Hide parent-connection field on add-accessory form before JS runs */
      #view_3580 #kn-input-field_2464,
      #view_3590 #kn-input-field_2464 {
        display: none !important;
      }
    `;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // DOM READING
  // ============================================================

  var REMOVE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  /**
   * Extract record ID from a connection link href.
   * Knack hrefs look like: #pages/scene_xxx/.../view_xxx/recordId
   * The record ID is the last 24-char hex segment.
   */
  function extractRecordId(href) {
    if (!href) return '';
    var match = href.match(/([a-f0-9]{24})(?:[\/]?$)/);
    return match ? match[1] : '';
  }

  /**
   * Extract connection data from a field <td> element.
   * Handles two Knack DOM formats:
   *   1) <a data-kn="connection-link"> wrapping <span data-kn="connection-value">
   *   2) Bare <span data-kn="connection-value"> (no anchor wrapper)
   * Returns [{text, href, recordId}].
   */
  function readLinksFromTd(td) {
    var links = [];

    // Format 1: anchor-wrapped connection links
    var anchors = td.querySelectorAll('a[data-kn="connection-link"]');
    if (anchors.length) {
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        var span = a.querySelector('span[data-kn="connection-value"]');
        var text = span ? span.textContent.trim() : a.textContent.trim();
        var href = a.getAttribute('href') || '';
        var recId = '';
        if (span && span.id && /^[a-f0-9]{24}$/.test(span.id)) {
          recId = span.id;
        } else {
          recId = extractRecordId(href);
        }
        if (text && text !== '&nbsp;' && text !== '\u00a0') {
          links.push({ text: text, href: href, recordId: recId });
        }
      }
      return links;
    }

    // Format 2: bare spans (no anchor wrapper) — e.g. field_1958
    var spans = td.querySelectorAll('span[data-kn="connection-value"]');
    for (var j = 0; j < spans.length; j++) {
      var sp = spans[j];
      var spText = sp.textContent.trim();
      var spId = (sp.id && /^[a-f0-9]{24}$/.test(sp.id)) ? sp.id : '';
      if (spText && spText !== '&nbsp;' && spText !== '\u00a0') {
        links.push({ text: spText, href: '', recordId: spId });
      }
    }
    return links;
  }

  function readConnectionLinks(tr, fieldKey) {
    // When duplicate columns exist for the same field key, querySelector
    // returns the first (possibly empty) td.  Try all matching tds and
    // return the first set that contains actual connection data.
    var tds = tr.querySelectorAll('td.' + fieldKey);
    if (!tds.length) return [];

    for (var t = 0; t < tds.length; t++) {
      var links = readLinksFromTd(tds[t]);
      if (links.length) return links;
    }
    // No td had links — return empty from the first td (preserves old behavior)
    return [];
  }

  /**
   * Build the base path for SOW/quote pages from the current hash.
   * Mirrors inline-photo-row.js getBuildSowBasePath().
   */
  function getBuildSowBasePath() {
    var hash = window.location.hash || '';
    var patterns = [
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/build-(?:sow|quote)\/[a-f0-9]{24})/,
      /(sales-portal\/company-details\/[a-f0-9]{24}\/scope-of-work-details\/[a-f0-9]{24})/,
      /(proposals\/scope-of-work\/[a-f0-9]{24})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = hash.match(patterns[i]);
      if (match) return match[1];
    }
    return '';
  }

  /**
   * Build the add-accessory URL for a parent record.
   *
   * Primary: search action column links in the row (preserves ?ref= params).
   * Fallback: derive from an edit link by replacing editSlug with addSlug.
   * Last resort: construct from hash base path + addSlug + recordId.
   */
  function findAddUrl(tr, slug, editSlug, recordId) {
    // Primary: search action column links in the row
    var anchors = tr.querySelectorAll('td.kn-table-link a');
    for (var i = 0; i < anchors.length; i++) {
      var href = anchors[i].getAttribute('href') || '';
      if (href.indexOf(slug) !== -1) return href;
    }

    // Fallback: derive from an edit link by replacing editSlug with addSlug
    if (editSlug) {
      for (var j = 0; j < anchors.length; j++) {
        var editHref = anchors[j].getAttribute('href') || '';
        if (editHref.indexOf(editSlug) !== -1) {
          return editHref.replace(editSlug, slug);
        }
      }
    }

    // Last resort: build from hash base path (for views without action column links)
    if (recordId) {
      var basePath = getBuildSowBasePath();
      if (basePath) return '#' + basePath + '/' + slug + '/' + recordId;
    }

    return '';
  }

  // ============================================================
  // KNACK API HELPERS
  // ============================================================

  /**
   * Find the Knack object key that owns a given field key.
   * Searches Knack.objects (Backbone collection) at runtime.
   * Returns the object key (e.g. 'object_123') or null.
   */
  function getObjectKeyForField(fieldKey) {
    try {
      var models = Knack.objects.models;
      for (var i = 0; i < models.length; i++) {
        var fields = models[i].attributes.fields;
        for (var j = 0; j < fields.length; j++) {
          if (fields[j].key === fieldKey) return models[i].attributes.key;
        }
      }
    } catch (e) {
      console.warn('[SCW][CR-DELETE] Could not search Knack.objects:', e);
    }
    return null;
  }

  /**
   * Clear a field on a record via Knack's internal model API.
   * Uses the scene/view REST endpoint (CORS-safe within Knack).
   * Tries Knack.views[viewId].model.updateRecord first, then
   * falls back to a direct scene/view PUT.
   * Returns a Promise that resolves on success or rejects on error.
   */
  function clearFieldOnRecord(viewId, recordId, fieldKey) {
    var data = {};
    data[fieldKey] = '';

    // Approach 1: Knack's internal model API
    try {
      var viewObj = Knack.views[viewId];
      if (viewObj && viewObj.model && typeof viewObj.model.updateRecord === 'function') {
        return new Promise(function (resolve, reject) {
          viewObj.model.updateRecord(recordId, data, {
            success: function () { resolve(); },
            error: function () { reject(new Error('updateRecord failed')); }
          });
        });
      }
    } catch (e) {
      console.warn('[SCW][CR-DELETE] updateRecord not available:', e);
    }

    // Approach 2: Direct scene/view PUT (CORS-safe)
    return new Promise(function (resolve, reject) {
      SCW.knackAjax({
        url: SCW.knackRecordUrl(viewId, recordId),
        type: 'PUT',
        data: JSON.stringify(data),
        success: function () { resolve(); },
        error: function (xhr) { reject(new Error('PUT ' + xhr.status)); }
      });
    });
  }

  // ============================================================
  // DELETE CONFIRMATION + WEBHOOK
  // ============================================================

  /**
   * Show a confirmation modal. Returns a Promise that resolves
   * true (delete) or false (cancel).
   */
  function confirmDelete(recordName) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'scw-cr-modal-overlay';

      overlay.innerHTML =
        '<div class="scw-cr-modal">' +
          '<div class="scw-cr-modal__icon">\u26A0\uFE0F</div>' +
          '<div class="scw-cr-modal__msg">Are you fucking sure you want to delete this?</div>' +
          '<div class="scw-cr-modal__name"></div>' +
          '<div class="scw-cr-modal__btns">' +
            '<button class="scw-cr-modal__btn scw-cr-modal__btn--cancel">Cancel</button>' +
            '<button class="scw-cr-modal__btn scw-cr-modal__btn--confirm">Remove</button>' +
          '</div>' +
        '</div>';

      // Set name safely via textContent to avoid XSS
      overlay.querySelector('.scw-cr-modal__name').textContent = recordName;

      function close(result) {
        overlay.remove();
        resolve(result);
      }

      overlay.querySelector('.scw-cr-modal__btn--cancel').addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); close(false);
      });
      overlay.querySelector('.scw-cr-modal__btn--confirm').addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); close(true);
      });

      // Click outside modal = cancel
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(false);
      });

      // Escape key = cancel
      function onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          close(false);
        }
      }
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);

      // Auto-focus cancel button
      overlay.querySelector('.scw-cr-modal__btn--cancel').focus();
    });
  }

  /**
   * Find the CONFIG entry that owns a given record ID (by checking which
   * view's widget contains the itemEl).  Falls back to the first entry.
   */
  function findCfgForItem(itemEl) {
    for (var i = 0; i < CONFIG.views.length; i++) {
      var cfg = CONFIG.views[i];
      var viewEl = itemEl.closest('#' + cfg.parentViewId);
      if (viewEl) return cfg;
    }
    return CONFIG.views[0] || null;
  }

  /**
   * Disconnect the accessory record from its parent (clear the back-
   * connection field) then delete it via the Make webhook.
   *
   * Clearing the parent connection BEFORE delete prevents Knack from
   * cascading the delete up to the parent record.
   *
   * @param {string} recordId   - The 24-char record ID to delete
   * @param {string} recordName - Display name (for logging)
   * @param {HTMLElement} itemEl - The .scw-cr-item element (for UI state)
   */
  function deleteRecord(recordId, recordName, itemEl) {
    var webhookUrl = (window.SCW && window.SCW.CONFIG && window.SCW.CONFIG.MAKE_DELETE_RECORD_WEBHOOK) || '';
    if (!webhookUrl) {
      console.error('[SCW] No MAKE_DELETE_RECORD_WEBHOOK configured');
      return;
    }

    var cfg = findCfgForItem(itemEl);
    var parentField = cfg ? cfg.parentConnectionField : null;

    console.log('[SCW][CR-DELETE] deleteRecord called', {
      recordId: recordId,
      recordName: recordName,
      parentConnectionField: parentField
    });

    // Visual pending state
    itemEl.classList.add('scw-cr-deleting');

    // Step 1: Clear the parent connection field so Knack can't cascade
    var disconnectPromise;
    var viewId = cfg ? cfg.parentViewId : null;
    if (parentField && viewId) {
      console.log('[SCW][CR-DELETE] Disconnecting: clearing', parentField,
                  'on', recordId, 'via', viewId);
      disconnectPromise = clearFieldOnRecord(viewId, recordId, parentField)
        .then(function () {
          console.log('[SCW][CR-DELETE] Disconnect succeeded');
        })
        .catch(function (err) {
          console.warn('[SCW][CR-DELETE] Disconnect failed, proceeding with delete anyway:', err);
        });
    } else {
      disconnectPromise = Promise.resolve();
    }

    // Step 2: After disconnect, send the delete webhook
    disconnectPromise.then(function () {
      console.log('[SCW][CR-DELETE] Sending webhook POST…');
      return fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: recordId, recordName: recordName })
      });
    })
    .then(function (resp) {
      console.log('[SCW][CR-DELETE] Webhook response status:', resp.status);
      if (!resp.ok) throw new Error('Webhook returned ' + resp.status);
      return resp.json().catch(function () { return {}; });
    })
    .then(function (body) {
      console.log('[SCW][CR-DELETE] Webhook response body:', body);

      // Remove the item from the DOM
      itemEl.remove();

      // Trigger preservation pipeline + refresh parent views
      $(document).trigger('knack-cell-update.scwScrollPreserve');
      CONFIG.views.forEach(function (cfg) {
        var viewObj = Knack.views[cfg.parentViewId];
        if (viewObj && viewObj.model && viewObj.model.fetch) {
          viewObj.model.fetch();
        }
      });
    })
    .catch(function (err) {
      console.error('[SCW][CR-DELETE] Delete record error:', err);
      itemEl.classList.remove('scw-cr-deleting');
      alert('Delete failed: ' + err.message);
    });
  }

  /**
   * Handle trash icon click: confirm, then delete via webhook.
   */
  function onDeleteClick(recordId, recordName, itemEl) {
    console.log('[SCW][CR-DELETE] onDeleteClick fired', {
      recordId: recordId,
      recordName: recordName
    });
    confirmDelete(recordName).then(function (confirmed) {
      console.log('[SCW][CR-DELETE] Confirmation result:', confirmed);
      if (!confirmed) return;
      deleteRecord(recordId, recordName, itemEl);
    });
  }

  // ============================================================
  // WARNING ICON — async field check on connected records
  // ============================================================

  var WARNING_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  /**
   * Build a map of recordId → boolean from a warning field cell in the DOM.
   * Reads per-record span[id][data-kn="connection-value"] elements (same
   * pattern as inline-photo-row's extractPhotoRecords reads field_2446).
   * Falls back to reading the cell's plain text when no per-record spans exist.
   */
  function buildWarningMap(tr, warningFieldKey) {
    var map = {};
    if (!tr || !warningFieldKey) return map;

    var cell = tr.querySelector('td[data-field-key="' + warningFieldKey + '"]');
    if (!cell) return map;

    // Per-record connection-value spans (preferred — like photo strip)
    var spans = cell.querySelectorAll('span[id][data-kn="connection-value"]');
    if (spans.length > 0) {
      for (var i = 0; i < spans.length; i++) {
        var rid = (spans[i].id || '').trim();
        if (!rid) continue;
        var val = (spans[i].textContent || '').trim().toLowerCase();
        map[rid] = (val === 'yes' || val === 'true');
      }
    } else {
      // Single value for all items (fallback)
      var plainVal = (cell.textContent || '').trim().toLowerCase();
      map._all = (plainVal === 'yes' || plainVal === 'true');
    }

    return map;
  }

  /**
   * If the warning map indicates this record should show a warning,
   * prepend a warning icon to the item element.
   */
  function applyWarningIcon(warningMap, recordId, itemEl) {
    var isYes = warningMap.hasOwnProperty(recordId)
      ? warningMap[recordId]
      : (warningMap._all || false);

    if (!isYes) {
      itemEl.classList.add('scw-cr-item-warn');
      var icon = document.createElement('span');
      icon.className = 'scw-cr-warning';
      icon.innerHTML = WARNING_SVG;
      icon.title = 'Accessory does not match parent product';
      var linkEl = itemEl.querySelector('.scw-cr-link');
      if (linkEl) {
        itemEl.insertBefore(icon, linkEl);
      }
      return true; // warning was applied
    }
    return false; // no warning
  }

  // ============================================================
  // WIDGET BUILDER
  // ============================================================

  function findConfig(viewId) {
    for (var i = 0; i < CONFIG.views.length; i++) {
      if (CONFIG.views[i].parentViewId === viewId) return CONFIG.views[i];
    }
    return null;
  }

  /**
   * Build the connected-records widget for a detail panel.
   * Called from device-worksheet.js renderDetailField.
   * @param {string} viewId   - Parent view ID (e.g. 'view_3313')
   * @param {string} recordId - Parent record ID (24-char hex)
   * @param {string} fieldKey - Connection field key (e.g. 'field_1963')
   * @param {HTMLElement} tr  - The original Knack table row
   * @returns {HTMLElement|null}
   */
  function buildWidget(viewId, recordId, fieldKey, tr) {
    var cfg = findConfig(viewId);
    if (!cfg || !tr) return null;

    var container = document.createElement('div');
    container.className = 'scw-ws-field';

    // Label
    var label = document.createElement('div');
    label.className = 'scw-ws-field-label';
    label.textContent = cfg.label;
    container.appendChild(label);

    // Value container (the list)
    var valueDiv = document.createElement('div');
    valueDiv.className = 'scw-ws-field-value scw-cr-list';
    container.appendChild(valueDiv);

    // Read links from DOM
    var links = readConnectionLinks(tr, fieldKey);
    var addUrl = findAddUrl(tr, cfg.addSlug, cfg.editSlug, recordId);

    console.log('[SCW][CR-DELETE] buildWidget links for', viewId, fieldKey, links.map(function (l) {
      return { text: l.text, recordId: l.recordId, href: l.href };
    }));

    // Build warning map from DOM (like photo strip reads field_2446)
    var warningMap = cfg.warningField ? buildWarningMap(tr, cfg.warningField) : {};

    // Render items
    var hasAnyWarning = false;
    if (links.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'scw-cr-empty';
      empty.textContent = '\u2014';
      valueDiv.appendChild(empty);
    } else {
      for (var i = 0; i < links.length; i++) {
        var item = document.createElement('div');
        item.className = 'scw-cr-item';

        var linkEl;
        var itemHref = links[i].href;

        // Rewrite item href when itemSlug is configured
        if (cfg.itemSlug && links[i].recordId) {
          if (itemHref) {
            // Replace the slug portion in existing href (e.g. add-photo-to-sow-line-item2 → edit-accessory-line-item2)
            itemHref = itemHref.replace(/\/[^\/]+\/([a-f0-9]{24})\/?$/, '/' + cfg.itemSlug + '/$1');
          } else if (addUrl) {
            // Construct from addUrl by swapping in the accessory record ID
            itemHref = addUrl.replace(/[a-f0-9]{24}\/?$/, links[i].recordId);
          }
          // Fallback: if regex didn't match, construct from current hash path
          if (cfg.itemSlug && links[i].recordId && itemHref === links[i].href) {
            var hashBase = (window.location.hash || '').replace(/\/[^\/]+\/[a-f0-9]{24}\/?$/, '');
            if (hashBase) itemHref = hashBase + '/' + cfg.itemSlug + '/' + links[i].recordId;
          }
        }

        if (itemHref) {
          linkEl = document.createElement('a');
          linkEl.href = itemHref;
        } else {
          linkEl = document.createElement('span');
        }
        linkEl.className = 'scw-cr-link';
        linkEl.textContent = links[i].text;
        linkEl.title = links[i].text;
        item.appendChild(linkEl);

        // Trash icon (only if we have a record ID)
        if (links[i].recordId) {
          var delBtn = document.createElement('button');
          delBtn.className = 'scw-cr-remove';
          delBtn.title = 'Delete';
          delBtn.innerHTML = REMOVE_SVG;
          delBtn.setAttribute('data-record-id', links[i].recordId);
          delBtn.setAttribute('data-record-name', links[i].text);
          (function (rid, rname, el, btn) {
            btn.addEventListener('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              onDeleteClick(rid, rname, el);
            });
          })(links[i].recordId, links[i].text, item, delBtn);
          item.appendChild(delBtn);
        }

        // Warning icon from DOM data (no API call needed)
        if (cfg.warningField && links[i].recordId) {
          if (applyWarningIcon(warningMap, links[i].recordId, item)) {
            hasAnyWarning = true;
          }
        }

        valueDiv.appendChild(item);
      }
    }

    // "+ Add" button
    if (addUrl) {
      var addBtn = document.createElement('a');
      addBtn.className = 'scw-cr-add';
      addBtn.textContent = '+ Add';
      addBtn.href = addUrl;
      valueDiv.appendChild(addBtn);
    }

    // Return element + warning state so the caller can add header warning
    container._hasWarning = hasAnyWarning;
    return container;
  }

  // ============================================================
  // AUTO-POPULATE PARENT CONNECTION ON ADD FORM
  // ============================================================
  //
  // When add-accessory-line-item form (view_3580) renders,
  // grab the parent scope line item ID from the URL hash
  // and set field_2464 (connection back to parent).

  function initAddAccessoryForm(viewId) {
    $(document).on('knack-view-render.' + viewId, function (event, view, data) {
      var hash = window.location.hash || '';
      // URL: #.../add-accessory-line-item/{parentRecordId} or add-accessory-line-item2/...
      var match = hash.match(/add-accessory-line-item[2]?\/([a-f0-9]{24})/);
      if (!match) return;

      var parentId = match[1];

      setTimeout(function () {
        // field_2464 is a Chosen.js connection select — set the <select> value,
        // update the hidden connection input, and trigger Chosen to refresh.
        var $select = $('#' + viewId + '-field_2464');
        var $hidden = $('#kn-input-field_2464 input.connection[name="field_2464"]');

        $select.val(parentId);
        $select.trigger('chosen:updated');
        $select.trigger('liszt:updated');
        $hidden.val(parentId);
        $select.trigger('change');
      }, 1);

      // On form submit, trigger the scroll/accordion preservation pipeline
      // so the parent page restores accordion state after Knack re-renders.
      $('#' + viewId + ' form').off('submit.scwCR').on('submit.scwCR', function () {
        $(document).trigger('knack-cell-update.scwScrollPreserve');
      });
    });
  }

  initAddAccessoryForm('view_3580');
  initAddAccessoryForm('view_3590');

  // ============================================================
  // PUBLIC API
  // ============================================================

  window.SCW = window.SCW || {};
  SCW.connectedRecords = {
    buildWidget: function (viewId, recordId, fieldKey, tr) {
      injectStyles();
      return buildWidget(viewId, recordId, fieldKey, tr);
    }
  };

})();
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
  // CONFIG – declarative field descriptors per view
  // ============================================================
  //
  // Field descriptor shape (string shorthand or object):
  //   key            – Knack field id  (required)
  //   type           – 'readOnly' | 'directEdit' | 'singleChip' | 'multiChip' | 'toggleChit' | 'chipStack'
  //   summary        – true if the field appears in the summary bar
  //   label          – display label (summary group or detail row)
  //   group          – 'fill' | 'right' (summary bar placement)
  //   groupCls       – extra CSS class on the summary group wrapper
  //   readOnlySummary – render as read-only in summary (no edit affordance)
  //   multiline      – for directEdit: use textarea
  //   options        – for chip types: array of option labels
  //   notes          – detail textarea/notes styling
  //   skipEmpty      – hide detail row if cell is empty
  //   columnIndex    – disambiguate duplicate field keys (e.g. product vs mounting)
  //   feeTrigger     – true if saving this field should refresh the fee
  //   headerTrigger  – true if saving this field should refresh the label
  //   productStyle   – true to apply product identity styling in summary
  //
  // summaryLayout – ordered array of field names rendered in the summary bar
  //   (label and product are handled structurally by the toggle zone)
  // detailLayout  – { left: [...], right: [...] } for detail panel columns
  //
  // ── Layout defaults — views only need to specify properties that differ ──
  var LAYOUT_DEFAULTS = {
    productGroupWidth: '300px',    // fixed width or 'flex'
    productGroupLayout: 'row',     // 'row' | 'column'
    productEditable: false,        // true = editable-field styling on product td
    identityWidth: null,           // null = auto, or '366px' etc.
    labelWidth: '80px',            // label td width
    detailGrid: '1fr 1fr',        // grid-template-columns for detail sections
  };

  var WORKSHEET_CONFIG = {
    views: [
      {
        viewId: 'view_3512',
        layout: { detailGrid: '455px 1fr' },
        hideDeleteWhenFieldNotBlank: 'field_2404',
        fields: {
          // ── Summary row ──
          bid:              { key: 'field_2415', type: 'readOnly',   summary: true, label: 'Bid',   group: 'right', groupCls: 'sum-group--bid' },
          move:             { key: 'field_2375', type: 'moveIcon',   summary: true },
          label:            { key: 'field_2364', type: 'readOnly',   summary: true },
          product:          { key: 'field_2379', type: 'readOnly',   summary: true, productStyle: true, columnIndex: 4 },
          laborDescription: { key: 'field_2409', type: 'directEdit', summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          existingCabling:  { key: 'field_2370', type: 'toggleChit', summary: true, feeTrigger: true },
          labor:            { key: 'field_2400', type: 'directEdit', summary: true, label: 'Labor', group: 'right', groupCls: 'sum-group--labor', feeTrigger: true },
          warningCount:     { key: 'field_2454', type: 'warningChit' },

          // ── Detail panel ──
          mounting:         { key: 'field_2463', type: 'readOnly',   columnIndex: 6 },
          connections:      { key: 'field_2381', type: 'readOnly' },
          scwNotes:         { key: 'field_2418', type: 'readOnly' },
          surveyNotes:      { key: 'field_2412', type: 'directEdit', notes: true },
          exterior:         { key: 'field_2372', type: 'chipStack' },
          plenum:           { key: 'field_2371', type: 'readOnly' },
          mountingHeight:   { key: 'field_2455', type: 'singleChip', options: ["Under 16'", "16' - 24'", "Over 24'"] },
          dropLength:       { key: 'field_2367', type: 'directEdit' },
          conduitFeet:      { key: 'field_2368', type: 'directEdit' }
        },
        summaryLayout: ['laborDescription', 'existingCabling', 'bid', 'labor'],
        detailLayout: {
          left:  ['mounting', 'scwNotes'],
          right: ['connections', 'exterior', 'mountingHeight', 'dropLength', 'conduitFeet', 'surveyNotes']
        }
      },
      {
        viewId: 'view_3505',
        layout: { productGroupWidth: '400px', detailGrid: '555px 1fr' },
        hideDeleteWhenFieldNotBlank: 'field_2404',
        fields: {
          bid:              { key: 'field_2415', type: 'readOnly',   summary: true, label: 'Bid',   group: 'right', groupCls: 'sum-group--bid' },
          move:             { key: 'field_2375', type: 'moveIcon',   summary: true },
          label:            { key: 'field_2364', type: 'readOnly',   summary: true },
          product:          { key: 'field_2379', type: 'readOnly',   summary: true, productStyle: true, columnIndex: 3 },
          laborDescription: { key: 'field_2409', type: 'directEdit', summary: true, label: 'Labor Desc', group: 'fill', multiline: true, showWhenFieldIsYes: 'field_2478' },
          existingCabling:  { key: 'field_2370', type: 'toggleChit', summary: true, feeTrigger: true },
          labor:            { key: 'field_2400', type: 'directEdit', summary: true, label: 'Labor', group: 'right', groupCls: 'sum-group--labor', feeTrigger: true, showWhenFieldIsYes: 'field_2478' },
          quantity:         { key: 'field_2399', type: 'directEdit', summary: true, label: 'Qty',   group: 'right', groupCls: 'sum-group--qty', feeTrigger: true, showWhenFieldIsYes: 'field_2478' },
          extended:         { key: 'field_2401', type: 'readOnly',   summary: true, label: 'Ext', group: 'right', groupCls: 'sum-group--ext', readOnlySummary: true, showWhenFieldIsYes: 'field_2478' },
          warningCount:     { key: 'field_2454', type: 'warningChit' },

          mounting:         { key: 'field_2463', type: 'readOnly' },
          connections:      { key: 'field_2380', type: 'readOnly' },
          scwNotes:         { key: 'field_2418', type: 'readOnly' },
          surveyNotes:      { key: 'field_2412', type: 'directEdit', notes: true },
          exterior:         { key: 'field_2372', type: 'chipStack' },
          plenum:           { key: 'field_2371', type: 'readOnly' }
        },
        summaryLayout: ['laborDescription', 'existingCabling', 'quantity', 'labor', 'extended', 'bid'],
        detailLayout: {
          left:  ['mounting', 'scwNotes'],
          right: ['connections', 'exterior', 'surveyNotes']
        },
        bucketField: 'field_2366',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_2379'],
            label: 'SERVICE',
            descLabel: 'Service',
            hideProduct: true,
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_2379', 'field_2400', 'field_2399', 'field_2401'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            hideProduct: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ]
      },
      {
        viewIds: ['view_3559', 'view_3577', 'view_3617'],
        layout: { labelWidth: '400px' },
        fields: {
          label:            { key: 'field_1642', type: 'readOnly',   summary: true },

          mdfIdf:           { key: 'field_1641', type: 'singleChip', options: ['HEADEND', 'IDF'], segmented: true, headerTrigger: true },
          mdfNumber:        { key: 'field_2458', type: 'directEdit', headerTrigger: true },
          name:             { key: 'field_1943', type: 'directEdit', headerTrigger: true },
          surveyNotes:      { key: 'field_2457', type: 'directEdit', summary: true, label: 'Survey Notes', group: 'fill', multiline: true },
          notes:            { key: 'field_1643', type: 'directEdit' }
        },
        summaryLayout: ['surveyNotes'],
        detailLayout: {
          left:  ['mdfIdf', 'mdfNumber', 'name'],
          right: ['notes']
        }
      },
      {
        viewId: 'view_3602',
        layout: { labelWidth: '400px' },
        fields: {
          label:            { key: 'field_1642', type: 'readOnly',   summary: true },

          mdfIdf:           { key: 'field_1641', type: 'singleChip', options: ['HEADEND', 'IDF'], segmented: true, headerTrigger: true },
          mdfNumber:        { key: 'field_2458', type: 'readOnly',   headerTrigger: true },
          name:             { key: 'field_1943', type: 'directEdit', headerTrigger: true },
          notes:            { key: 'field_1643', type: 'directEdit', notes: true }
        },
        summaryLayout: [],
        detailLayout: {
          left:  ['mdfIdf', 'mdfNumber', 'name'],
          right: ['notes']
        }
      },
      {
        viewId: 'view_3575',
        layout: { /* defaults are fine */ },
        comparisonLayout: true,
        fields: {
          // ── Summary row ──
          label:            { key: 'field_2365', type: 'readOnly',   summary: true },
          product:          { key: 'field_2379', type: 'readOnly',   summary: true, productStyle: true },
          laborDescription: { key: 'field_2409', type: 'directEdit', summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          labor:            { key: 'field_2400', type: 'directEdit', summary: true, label: 'Labor', group: 'right', groupCls: 'sum-group--labor' },

          // ── Detail comparison – SCW side ──
          connections:      { key: 'field_2381', type: 'readOnly' },
          dropLength:       { key: 'field_2367', type: 'readOnly' },
          exterior:         { key: 'field_2372', type: 'chipStack' },
          existingCabling:  { key: 'field_2370', type: 'readOnly' },
          plenum:           { key: 'field_2371', type: 'readOnly' },
          mountingHeight:   { key: 'field_2455', type: 'singleChip', options: ["Under 16'", "16' - 24'", "Over 24'"] },
          conduitFeet:      { key: 'field_2368', type: 'readOnly' },
          scwNotes:         { key: 'field_2412', type: 'readOnly' },

          // ── Detail comparison – Survey side ──
          surveyLabel:      { key: 'field_1950', type: 'readOnly' },
          surveyProduct:    { key: 'field_1958', type: 'readOnly' },
          surveyConnections:{ key: 'field_2197', type: 'readOnly' },
          surveyDropLength: { key: 'field_1965', type: 'readOnly' },
          surveyChips:      { key: 'field_1972', type: 'readOnly' },
          surveyNotes:      { key: 'field_1953', type: 'readOnly' }
        },
        summaryLayout: ['laborDescription', 'labor']
      },
      {
        viewId: 'view_3313',
        layout: { productGroupWidth: '280px', productGroupLayout: 'column', productEditable: true },
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          sow:              { key: 'field_2154', type: 'readOnly',    summary: true, label: 'SOW',  group: 'right', groupCls: 'sum-group--sow' },
          mountCableBoth:   { key: 'field_1968', type: 'readOnly',    summary: true, label: 'MCB',  group: 'pre',   groupCls: 'sum-group--mcb' },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          laborCategory:    { key: 'field_2462', type: 'readOnly',    summary: true, label: 'Cat',  group: 'right', groupCls: 'sum-group--cat' },
          laborVariables:   { key: 'field_1972', type: 'multiChip',   summary: true, label: 'Vars', group: 'right', groupCls: 'sum-group--vars',
                              options: ['Exterior', 'High Traffic', 'Plenum'], feeTrigger: true },
          existingCabling:  { key: 'field_2461', type: 'toggleChit',  summary: true, feeTrigger: true },
          subBid:           { key: 'field_2150', type: 'directEdit',  summary: true, label: 'Sub Bid', group: 'right', groupCls: 'sum-group--sub-bid', feeTrigger: true },
          plusHrs:           { key: 'field_1973', type: 'directEdit',  summary: true, label: '+Hrs', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true },
          plusMat:           { key: 'field_1974', type: 'directEdit',  summary: true, label: '+Mat', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true },
          installFee:       { key: 'field_2028', type: 'readOnly',    summary: true, label: 'Fee',  group: 'right', groupCls: 'sum-group--fee', readOnlySummary: true },
          move:             { key: 'field_1946', type: 'moveIcon',    summary: true },

          // ── Detail panel ──
          dropPrefix:       { key: 'field_2240', type: 'readOnly' },
          dropNumber:       { key: 'field_1951', type: 'directEdit' },
          dropLength:       { key: 'field_1965', type: 'directEdit',  feeTrigger: true },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' },
          connectedDevice:  { key: 'field_2197', type: 'nativeEdit' },
          scwNotes:         { key: 'field_1953', type: 'directEdit',  notes: true }
        },
        summaryLayout: ['mountCableBoth', 'laborDescription', 'existingCabling',
                         'laborCategory', 'laborVariables', 'subBid', 'plusHrs', 'plusMat', 'installFee', 'sow'],
        detailLayout: {
          left:  ['dropPrefix', 'dropNumber', 'mountingHardware'],
          right: ['connectedDevice', 'dropLength', 'scwNotes']
        }
      },
      {
        viewIds: ['view_3610'],
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', productEditable: true, identityWidth: '366px' },
        fields: {
          // ── Summary row ──
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true, columnIndex: 3 },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Labor Desc', group: 'fill', multiline: true },
          sow:              { key: 'field_2154', type: 'readOnly',    summary: true, label: 'SOW',  group: 'right', groupCls: 'sum-group--sow' },
          quantity:         { key: 'field_1964', type: 'directEdit',  summary: true, label: 'Qty',  group: 'right', groupCls: 'sum-group--qty', feeTrigger: true, alwaysEditable: true },
          subBid:           { key: 'field_2150', type: 'directEdit',  summary: true, label: 'Sub Bid', group: 'right', groupCls: 'sum-group--sub-bid', feeTrigger: true,
                              stackWith: 'subBidTotal' },
          subBidTotal:      { key: 'field_2151', type: 'readOnly',    label: 'TOTAL' },
          plusHrs:           { key: 'field_1973', type: 'directEdit',  summary: true, label: '+Hrs', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true,
                              stackWith: 'hrsTtl' },
          hrsTtl:           { key: 'field_1997', type: 'readOnly',    label: 'TOTAL' },
          plusMat:           { key: 'field_1974', type: 'directEdit',  summary: true, label: '+Mat', group: 'right', groupCls: 'sum-group--narrow', feeTrigger: true,
                              stackWith: 'matTtl' },
          matTtl:           { key: 'field_2146', type: 'readOnly',    label: 'TOTAL' },
          installFee:       { key: 'field_2028', type: 'readOnly',    summary: true, label: 'Fee',  group: 'right', groupCls: 'sum-group--fee', readOnlySummary: true },
          move:             { key: 'field_1946', type: 'moveIcon',    summary: true },

          // ── Detail panel ──
          scwNotes:         { key: 'field_1953', type: 'directEdit',  notes: true },
          connectedDevice:  { key: 'field_1957', type: 'nativeEdit' },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' }
        },
        summaryLayout: ['laborDescription', 'quantity', 'subBid', 'plusHrs', 'plusMat', 'installFee', 'sow'],
        detailLayout: {
          left:  ['connectedDevice', 'mountingHardware'],
          right: ['scwNotes']
        },
        conditionalHide: [
          {
            whenLocked: 'field_1964',
            hideFields: ['field_2151', 'field_1997', 'field_2146']
          }
        ],
        bucketField: 'field_2219',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_1949'],
            label: 'SERVICE',
            descLabel: 'Service',
            hideProduct: true,
            hideDetailFields: ['field_1958'],
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_1949', 'field_1964', 'field_2150', 'field_2151', 'field_1973', 'field_1997', 'field_1974', 'field_2146', 'field_2028'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            hideProduct: true,
            hideDetailFields: ['field_1958'],
            showProductInDetail: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ]
      },
      {
        viewId: 'view_3586',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', productEditable: true, identityWidth: '366px' },
        stackedSummary: false,
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          scwNotes:         { key: 'field_1953', type: 'directEdit',  summary: true, label: 'SCW Notes', group: 'fill', multiline: true },
          lineItemTotal:    { key: 'field_2269', type: 'readOnly',    summary: true, label: 'Total',    group: 'right', groupCls: 'sum-group--total', readOnlySummary: true },
          move:             { key: 'field_1946', type: 'moveIcon',    summary: true },

          // ── Detail panel ──
          retailPrice:      { key: 'field_1960', type: 'readOnly' },
          quantity:         { key: 'field_1964', type: 'directEdit', feeTrigger: true },
          customDiscPct:    { key: 'field_2261', type: 'directEdit', feeTrigger: true },
          customDiscDlr:    { key: 'field_2262', type: 'directEdit', feeTrigger: true },
          appliedDiscount:  { key: 'field_2303', type: 'readOnly' },
          connectedDevice:  { key: 'field_1957', type: 'nativeEdit' },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' },
          laborDescription: { key: 'field_2020', type: 'directEdit',  notes: true }
        },
        summaryLayout: ['scwNotes', 'lineItemTotal'],
        detailLayout: {
          left:  ['retailPrice', 'quantity', 'customDiscPct', 'appliedDiscount', 'connectedDevice', 'mountingHardware'],
          right: ['laborDescription']
        },
        bucketField: 'field_2219',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_1949', 'field_1953'],
            label: 'SERVICE',
            summarySwapField: 'field_2020',       // replace scwNotes with laborDescription in summary
            summarySwapReadOnly: true,
            hideDetail: true,                     // suppress detail sections, keep photos only
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_1949', 'field_1953', 'field_1964', 'field_2261', 'field_2262', 'field_2303', 'field_2269', 'field_1960'],
            label: 'ASSUMPTION',
            summarySwapField: 'field_2020',
            summarySwapReadOnly: true,
            hideDetail: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ]
      },
      {
        viewId: 'view_3588',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', productEditable: true, identityWidth: '366px' },
        stackedSummary: false,
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          scwNotes:         { key: 'field_1953', type: 'directEdit',  summary: true, label: 'SCW Notes', group: 'fill', multiline: true },
          existingCabling:  { key: 'field_2461', type: 'toggleChit',  summary: true, feeTrigger: true },
          exteriorChit:     { key: 'field_1984', type: 'toggleChit',  summary: true, feeTrigger: true, chitLabel: 'Exterior' },
          lineItemTotal:    { key: 'field_2269', type: 'readOnly',    summary: true, label: 'Total',    group: 'right', groupCls: 'sum-group--total', readOnlySummary: true },
          move:             { key: 'field_1946', type: 'moveIcon',    summary: true },

          // ── Detail panel – left ──
          retailPrice:      { key: 'field_1960', type: 'readOnly' },
          discountDlr:      { key: 'field_2261', type: 'directEdit', feeTrigger: true },
          appliedDiscount:  { key: 'field_2303', type: 'readOnly' },
          total:            { key: 'field_2269', type: 'readOnly' },
          dropPrefix:       { key: 'field_2240', type: 'directEdit' },
          dropNumber:       { key: 'field_1951', type: 'directEdit' },

          // ── Detail panel – right ──
          connectedDevice:  { key: 'field_2197', type: 'nativeEdit' },
          mountingHardware: { key: 'field_1958', type: 'connectedRecords' },
          dropLength:       { key: 'field_1965', type: 'directEdit', skipEmpty: true },
          laborDescription: { key: 'field_2020', type: 'directEdit', skipEmpty: true, notes: true }
        },
        summaryLayout: ['scwNotes', 'existingCabling', 'exteriorChit', 'lineItemTotal'],
        detailLayout: {
          left:   ['dropPrefix', 'dropNumber', 'retailPrice', 'discountDlr', 'appliedDiscount', 'total'],
          right:  ['connectedDevice', 'mountingHardware', 'dropLength', 'laborDescription']
        }
      },
      {
        viewId: 'view_3596',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', identityWidth: '366px' },
        stackedSummary: false,
        photoAlwaysVisible: true,
        qtyBadgeField: 'field_1964',
        bucketField: 'field_2219',
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          laborDescription: { key: 'field_2020', type: 'directEdit',  summary: true, label: 'Description of Work', group: 'fill', multiline: true },
          existingCabling:  { key: 'field_2461', type: 'toggleChit',  summary: true, showOnlyIfYes: true },

          // ── Detail panel ──
          connectedDevice:  { key: 'field_2197', type: 'readOnly' },
          mountingHardware: { key: 'field_1958', type: 'readOnly' },
          scwNotes:         { key: 'field_1953', type: 'readOnly',  notes: true }
        },
        summaryLayout: ['laborDescription', 'existingCabling'],
        detailLayout: {
          left:  ['connectedDevice', 'scwNotes'],
          right: ['mountingHardware']
        },
        syntheticGroupsPosition: 'bottom',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_1949'],
            label: 'SERVICE',
            descLabel: 'Service',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_1949'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ],
        // When bucket is NOT cameras/readers, use view_3608-style config
        bucketOverride: {
          keepBuckets: ['6481e5ba38f283002898113c'],   // cameras or readers
          fields: {
            product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
            laborDescription: { key: 'field_2020', type: 'readOnly',  summary: true, label: '\u00a0', group: 'fill', multiline: true },
            connectedDevice:  { key: 'field_1957', type: 'readOnly',    summary: true, label: 'Connected Devices', showWhenFieldIsYes: 'field_2231' },
            mountingHardware: { key: 'field_1958', type: 'readOnly' },
            scwNotes:         { key: 'field_1953', type: 'readOnly',  notes: true }
          },
          summaryLayout: ['laborDescription', 'connectedDevice'],
          detailLayout: {
            left:  ['scwNotes'],
            right: ['mountingHardware']
          }
        }
      },
      {
        viewId: 'view_3608',
        layout: { productGroupWidth: 'flex', productGroupLayout: 'column', identityWidth: '366px' },
        stackedSummary: false,
        photoAlwaysVisible: true,
        fields: {
          // ── Summary row ──
          label:            { key: 'field_1950', type: 'readOnly',    summary: true },
          product:          { key: 'field_1949', type: 'readOnly',    summary: true, productStyle: true },
          laborDescription: { key: 'field_2020', type: 'readOnly',  summary: true, label: 'Description of Work', group: 'fill', multiline: true },
          connectedDevice:  { key: 'field_1957', type: 'readOnly',    summary: true, label: 'Connected Devices', showWhenFieldIsYes: 'field_2231' },

          // ── Detail panel ──
          mountingHardware: { key: 'field_1958', type: 'readOnly' },
          scwNotes:         { key: 'field_1953', type: 'readOnly',  notes: true }
        },
        summaryLayout: ['laborDescription', 'connectedDevice'],
        detailLayout: {
          left:  ['scwNotes'],
          right: ['mountingHardware']
        },
        bucketField: 'field_2219',
        syntheticGroupsPosition: 'bottom',
        bucketRules: {
          '6977caa7f246edf67b52cbcd': {           // Other Services
            hideFields: ['field_1949'],
            label: 'SERVICE',
            descLabel: 'Service',
            descLabelWhenSynthetic: '\u00a0',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--services',
          },
          '697b7a023a31502ec68b3303': {           // Assumptions
            hideFields: ['field_1949'],
            label: 'ASSUMPTION',
            descLabel: 'Assumption',
            descLabelWhenSynthetic: '\u00a0',
            hideProduct: true,
            hideDetail: true,
            rowClass: 'scw-row--assumptions',
          },
        },
        syntheticBucketGroups: [
          { cls: 'scw-row--services',    label: 'Project Wide Services' },
          { cls: 'scw-row--assumptions', label: 'Project Wide Assumptions' },
        ]
      }
    ]
  };

  // ── Normalise config ──
  //  1. Expand viewIds → one entry per viewId (shared fields/layout by reference)
  //  2. Merge layout defaults so every view has a complete layout object
  //  3. Compute derived arrays (feeTriggerFields, headerTriggerFields)

  // Step 1: Expand viewIds
  var expandedViews = [];
  WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
    var ids = viewCfg.viewIds || (viewCfg.viewId ? [viewCfg.viewId] : []);
    ids.forEach(function (id) {
      // Shallow copy so each entry has its own viewId but shares fields etc.
      var copy = {};
      for (var k in viewCfg) { if (viewCfg.hasOwnProperty(k)) copy[k] = viewCfg[k]; }
      copy.viewId = id;
      delete copy.viewIds;
      expandedViews.push(copy);
    });
  });
  WORKSHEET_CONFIG.views = expandedViews;

  // Step 2: Merge layout defaults
  WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
    var merged = {};
    for (var dk in LAYOUT_DEFAULTS) {
      if (LAYOUT_DEFAULTS.hasOwnProperty(dk)) merged[dk] = LAYOUT_DEFAULTS[dk];
    }
    var src = viewCfg.layout || {};
    for (var sk in src) {
      if (src.hasOwnProperty(sk)) merged[sk] = src[sk];
    }
    viewCfg.layout = merged;
  });

  // Step 3: Compute derived arrays from field descriptors
  WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
    var feeTriggers = [];
    var headerTriggers = [];
    var f = viewCfg.fields;
    Object.keys(f).forEach(function (name) {
      var desc = f[name];
      if (typeof desc === 'string') { f[name] = { key: desc, type: 'readOnly' }; desc = f[name]; }
      if (desc.feeTrigger)    feeTriggers.push(desc.key);
      if (desc.headerTrigger) headerTriggers.push(desc.key);
    });
    if (feeTriggers.length)    viewCfg.feeTriggerFields  = feeTriggers;
    if (headerTriggers.length) viewCfg.headerTriggerFields = headerTriggers;
  });

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
/* ── Hide raw Knack rows until transformView processes them ── */
/* Prevents flash of unstyled/duplicate inputs during re-render */
${WORKSHEET_CONFIG.views.map(function (v) {
  return '#' + v.viewId + ' tbody > tr:not([${PROCESSED_ATTR}]):not(.${WORKSHEET_ROW}):not(.kn-table-group):not(.scw-inline-photo-row):not(.kn-table-totals) { visibility: hidden; height: 0; overflow: hidden; }';
}).join('\n')}

/* ── Hide the original data row (cells moved out, shell stays) ── */
tr[${PROCESSED_ATTR}="1"] {
  display: none !important;
}

/* ── Hide Existing Cabling column header (moved to summary bar as toggleChit) ── */
#view_3512 th.field_2370,
#view_3505 th.field_2370 {
  display: none !important;
}

/* ── Kill ALL residual Knack hover / striping ── */
tr.${WORKSHEET_ROW},
tr.${WORKSHEET_ROW}:hover,
tr.scw-inline-photo-row,
tr.scw-inline-photo-row:hover,
tr[data-scw-worksheet],
tr[data-scw-worksheet]:hover {
}
tr.${WORKSHEET_ROW} > td:not(.bulkEditSelectedRow),
tr.${WORKSHEET_ROW}:hover > td:not(.bulkEditSelectedRow),
tr.scw-inline-photo-row > td,
tr.scw-inline-photo-row:hover > td {
  background: #fff !important;
  background-color: #fff !important;
}
tr[data-scw-worksheet] > td:not(.bulkEditSelectedRow),
tr[data-scw-worksheet]:hover > td:not(.bulkEditSelectedRow) {
  background: none !important;
  background-color: transparent !important;
}

/* ── Worksheet row <td> — zero padding so the card fills it ── */
.${WORKSHEET_ROW} > td {
  padding: 0 !important;
  border: none !important;
}

/* ── Photo row — original <tr> hidden; content moved into card ── */
tr.scw-inline-photo-row.${P}-photo-absorbed {
  display: none !important;
}
tr.scw-inline-photo-row > td {
  padding: 20px 16px 50px 16px !important;
  border: none !important;
  border-bottom: 2px solid #e2e8f0 !important;
}

/* ── Photo content moved inside card ── */
.${P}-photo-wrap {
  padding: 20px 16px 50px 70px;
  background: #fff;
}
.${P}-photo-wrap.${P}-photo-hidden {
  display: none;
}

/* ── Card wrapper ── */
.${P}-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  min-width: 0;
  overflow: hidden;
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
  flex-wrap: wrap;
  gap: 6px;
  padding: 15px 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  min-height: 38px;
  min-width: 0;
  transition: background 0.15s, box-shadow 0.2s;
}
.${P}-summary:hover {
  background: #f1f5f9;
}

/* ── Expanded: header + detail + photo strip pop out as one unit ── */
tr.${WORKSHEET_ROW}:has(.${P}-open) {
  z-index: 1;
  position: relative;
}
.${P}-card:has(.${P}-open) {
  box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
  border-radius: 8px;
  border: 1px solid #d1d5db;
  margin-bottom: 10px;
}
/* Remove internal borders when expanded */
.${P}-card:has(.${P}-open) .${P}-summary {
  background: #fff;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
}
/* Photo wrap gets bottom border-radius when card is expanded */
.${P}-card:has(.${P}-open) .${P}-photo-wrap:not(.${P}-photo-hidden) {
  border-radius: 0 0 8px 8px;
}
/* If no photo wrap visible, detail gets bottom radius */
.${P}-card:has(.${P}-open) .${P}-detail:last-child,
.${P}-card:has(.${P}-open) .${P}-detail:has(+ .${P}-photo-wrap.${P}-photo-hidden) {
  border-radius: 0 0 8px 8px;
}

/* Right-aligned group: bid, labor, qty, ext, move pushed to far right */
.${P}-sum-right {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4px;
  margin-left: auto;
  flex-shrink: 1;
  min-width: 0;
}
/* Each field group in the right section gets fixed width for vertical alignment */
.${P}-sum-right .${P}-sum-group {
  width: fit-content;
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
/* Fields inside right groups stretch to fill their group */
.${P}-sum-right td.${P}-sum-field,
.${P}-sum-right td.${P}-sum-field-ro {
  width: 100%;
  min-width: 0;
  height: fit-content;
}

/* ── KTL bulk-edit checkbox cell ── */
td.${P}-sum-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  flex: 0 0 auto;
  padding: 5px 4px 0 4px !important;
  border: none !important;
  background: transparent !important;
  min-width: 20px;
}
td.${P}-sum-check input[type="checkbox"] {
  width: 15px !important;
  height: 15px !important;
  margin: 2px 0 0;
  cursor: pointer;
}

/* Clickable toggle zone (chevron + identity) — fixed width so labor desc aligns */
.${P}-toggle-zone {
  display: flex;
  align-items: flex-start;
  align-self: flex-start;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  flex: 0 1 auto;
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
  padding-top: 5px;
}
.${P}-chevron.${P}-collapsed {
  transform: rotate(0deg);
}
.${P}-chevron.${P}-expanded {
  transform: rotate(90deg);
  color: #6b7280;
}

/* Fixed-width warning slot between chevron and identity — always present */
.${P}-warn-slot {
  flex: 0 0 18px;
  width: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
}
.${P}-warn-slot:empty {
  visibility: hidden;
}
.${P}-warn-slot .scw-cr-hdr-warning {
  margin-left: 0;
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
/* Product group column layout variant */
.${P}-product-group--column {
  flex-direction: column;
  align-items: stretch;
  gap: 0;
}
.${P}-product-group--column > td.${P}-sum-product {
  width: 100% !important;
  flex: none;
}
/* Product group flex variant (fills identity width) */
.${P}-product-group--flex {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  max-width: none;
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
  background: rgba(134, 182, 223, 0.1);
  white-space: nowrap;
  height: 30px;
  min-width: 40px;
  box-sizing: border-box;
  transition: border-color 0.15s, background-color 0.15s;
}
td.${P}-sum-field.cell-edit:hover,
td.${P}-sum-field.ktlInlineEditableCellsStyle:hover {
  background-color: rgba(134, 182, 223, 0.18) !important;
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
  padding: 2px 8px !important;
  font-size: 14px;
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

/* Labor desc group — fills middle space, pushes right group to far right.
   align-self:stretch makes it match the tallest sibling (e.g. stacked chips). */
.${P}-sum-group--fill {
  flex: 1 1 0;
  min-width: 150px;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  margin-left: 10px;
}
/* Fill td + textarea stretch to fill the group height */
.${P}-sum-group--fill td.${P}-sum-direct-edit {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
}
.${P}-sum-group--fill td.${P}-sum-direct-edit .${P}-direct-textarea {
  flex: 0 0 auto;
}

/* Move td sits at the right end */
td.${P}-sum-move {
  display: inline-flex !important;
  align-items: center;
  align-self: flex-start;
  padding: 0 4px;
  border: none !important;
  background: transparent !important;
  flex-shrink: 0;
}

/* ── Delete button (extracted from Knack row) ── */
.${P}-sum-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  flex-shrink: 0;
  padding: 5px 4px 0 4px;
  border: none !important;
  background: transparent !important;
}
.${P}-sum-delete a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 14px;
  transition: color 150ms ease;
}
.${P}-sum-delete a:hover {
  color: #ef4444;
}

/* ── Cabling group alignment (match variables column) ── */
.${P}-sum-group--cabling {
  align-self: stretch;
  display: flex;
  align-items: center;
}

/* ── Toggle chit (boolean, inline in summary bar) ── */
.${P}-cabling-chit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.02em;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  border: 1px solid transparent;
  text-align: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
  height: 100%;
  box-sizing: border-box;
  vertical-align: middle;
}
.${P}-cabling-chit.is-yes {
  background: #059669;
  color: #ffffff;
  border-color: #047857;
  box-shadow: 0 1px 2px rgba(5, 150, 105, 0.2);
}
.${P}-cabling-chit.is-yes:hover {
  background: #047857;
  box-shadow: 0 2px 4px rgba(5, 150, 105, 0.3);
}
.${P}-cabling-chit.is-no {
  background: #ffffff;
  color: #6b7280;
  border-color: #d1d5db;
}
.${P}-cabling-chit.is-no:hover {
  background: #f9fafb;
  color: #374151;
  border-color: #9ca3af;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.${P}-cabling-chit.is-saving {
  opacity: 0.6;
  pointer-events: none;
}
.${P}-cabling-chit.is-readonly {
  cursor: default;
  pointer-events: none;
}

/* ── Summary chip host td — visible for KTL bulk-edit but visually transparent ── */
td.${P}-sum-chip-host {
  display: inline-flex !important;
  align-items: center;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: 0 !important;
  min-height: 0 !important;
  vertical-align: middle;
}
td.${P}-sum-chip-host:hover,
td.${P}-sum-chip-host.ktlInlineEditableCellsStyle,
td.${P}-sum-chip-host.cell-edit {
  background: transparent !important;
}
/* KTL bulk-edit highlight on chip host */
td.${P}-sum-chip-host.ktlInlineEditableCellsStyle:hover,
td.${P}-sum-chip-host.bulkEditSelectSrc {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
  border-radius: 4px !important;
}
/* When KTL bulk-edit is active on chip hosts, disable chit/chip interaction */
td.${P}-sum-chip-host.bulkEditSelectSrc .${P}-cabling-chit,
td.${P}-sum-chip-host.bulkEditSelectSrc .${P}-radio-chip {
  pointer-events: none !important;
  cursor: cell !important;
}

/* ── field_1972 (Labor Variables): ensure no blue background leaks through ── */
#view_3313 .${P}-sum-group--vars td,
#view_3313 .${P}-sum-group--vars td[style] {
}

/* ── Summary-bar radio chips (Labor Variables) ── */
.${P}-sum-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
  align-self: center;
}
.${P}-sum-chips .${P}-radio-chip {
  flex: 1 1 calc(50% - 2px);
  min-width: 0;
  text-align: center;
  box-sizing: border-box;
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
  border-top: 10px solid #ffffff;
}
.${P}-detail.${P}-open {
  display: block;
}

/* ── Sections grid ── */
.${P}-sections {
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1fr);
  gap: 0;
  overflow: hidden;
}
@media (max-width: 1200px) {
  .${P}-sections {
    grid-template-columns: 1fr;
  }
}

/* ── Individual section ── */
.${P}-section {
  padding: 14px 20px 14px 70px;
  min-width: 0;
}
.${P}-section:last-child {
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
  min-height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  text-align: left !important;
  justify-content: flex-start !important;
}

/* ── Editable field affordance (border + background only for editable cells) ── */
td.${P}-field-value.cell-edit,
td.${P}-field-value.ktlInlineEditableCellsStyle {
  border: 1px solid #e5e7eb;
  background: rgba(134, 182, 223, 0.1);
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}
td.${P}-field-value.cell-edit:hover,
td.${P}-field-value.ktlInlineEditableCellsStyle:hover {
  background-color: rgba(134, 182, 223, 0.18) !important;
  border-color: #93c5fd !important;
  box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.25);
}
/* Detail-section direct-edit inputs/textareas — blue tint to match summary bar */
.${P}-detail .${P}-direct-input,
.${P}-detail .${P}-direct-textarea {
  background-color: rgba(134, 182, 223, 0.1);
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

/* ── Radio chips (Mounting Height / Labor Variables) ── */
.${P}-radio-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 0;
}
.${P}-radio-chip {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.02em;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
  white-space: nowrap;
  border: 1px solid transparent;
  text-align: center;
}
.${P}-radio-chip.is-selected {
  background: #059669;
  color: #ffffff;
  border-color: #047857;
  box-shadow: 0 1px 2px rgba(5, 150, 105, 0.2);
}
.${P}-radio-chip.is-selected:hover {
  background: #047857;
  box-shadow: 0 2px 4px rgba(5, 150, 105, 0.3);
}
.${P}-radio-chip.is-unselected {
  background: #ffffff;
  color: #6b7280;
  border-color: #d1d5db;
}
.${P}-radio-chip.is-unselected:hover {
  background: #f9fafb;
  color: #374151;
  border-color: #9ca3af;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
.${P}-radio-chip.is-saving {
  opacity: 0.6;
  pointer-events: none;
}

/* ── Segmented toggle (either/or style) ── */
.${P}-radio-chips.${P}-segmented {
  gap: 0;
  flex-wrap: nowrap;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip {
  border-radius: 0;
  border-right-width: 0;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip:first-child {
  border-radius: 6px 0 0 6px;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip:last-child {
  border-radius: 0 6px 6px 0;
  border-right-width: 1px;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip.is-unselected {
  border-color: #d1d5db;
}
.${P}-radio-chips.${P}-segmented .${P}-radio-chip.is-selected + .${P}-radio-chip.is-unselected {
  border-left-color: #047857;
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
  background: rgba(134, 182, 223, 0.1);
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
  background-color: #dcfce7 !important;
  border-color: #4ade80 !important;
}
.${P}-direct-input.is-error,
.${P}-direct-textarea.is-error {
  background-color: #fef2f2 !important;
  border-color: #fca5a5 !important;
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
  min-height: 28px;
  max-height: 200px;
  overflow: hidden;
}

/* ── Summary bar inline direct-edit inputs ── */
td.${P}-sum-direct-edit {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
}
td.${P}-sum-direct-edit .${P}-direct-input,
td.${P}-sum-direct-edit .${P}-direct-textarea {
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 500;
  width: 100%;
  box-sizing: border-box;
  display: block;
}
td.${P}-sum-direct-edit .${P}-direct-input {
  height: 28px;
}
td.${P}-sum-direct-edit .${P}-direct-textarea {
  resize: vertical;
  min-height: 28px;
  max-height: none;
  line-height: 1.3;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow: hidden;
}
td.${P}-sum-direct-edit .${P}-direct-error {
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
/* When KTL bulk-edit copy mode is active (KTL adds bulkEditSelectSrc
   to cell-edit tds), disable input interaction so td handles clicks. */
td.${P}-sum-direct-edit.bulkEditSelectSrc {
  cursor: cell !important;
}
td.${P}-sum-direct-edit.bulkEditSelectSrc .${P}-direct-input,
td.${P}-sum-direct-edit.bulkEditSelectSrc .${P}-direct-textarea {
  pointer-events: none !important;
  cursor: cell !important;
}

/* ── KTL bulk-edit selected-row yellow highlight ──
   KTL adds .bulkEditSelectedRow to the moved tds inside the card.
   Use :has() to detect that and make all opaque layers transparent,
   then paint the outer td yellow.  Works identically across all
   worksheet views (3512, 3505, 3313). */
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) > td {
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-card {
  background: transparent;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-summary,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-summary:hover {
  background: transparent;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-field:not(.bulkEditSelectedRow) {
  background: transparent !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-field.cell-edit:not(.bulkEditSelectedRow):hover,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-field.ktlInlineEditableCellsStyle:not(.bulkEditSelectedRow):hover {
  background-color: transparent !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-product:not(.bulkEditSelectedRow) {
  background: transparent !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-product.cell-edit:not(.bulkEditSelectedRow):hover,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-sum-product.ktlInlineEditableCellsStyle:not(.bulkEditSelectedRow):hover {
  background-color: transparent !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-field-value:not(.bulkEditSelectedRow) {
  background: transparent;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-field-value.cell-edit:not(.bulkEditSelectedRow),
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) td.${P}-field-value.ktlInlineEditableCellsStyle:not(.bulkEditSelectedRow) {
  background: transparent;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-direct-input,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-direct-textarea {
  background-color: transparent !important;
}
/* Detail-panel: hidden td still receives bulkEditSelectedRow from KTL —
   propagate yellow to the visible wrapper via :has() */
.${P}-field-value:has(td.bulkEditSelectedRow) {
  background-color: rgb(255, 253, 204) !important;
}
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-comp-row > .${P}-comp-val:last-child,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val,
tr.${WORKSHEET_ROW}:has(td.bulkEditSelectedRow) .${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val:last-child {
  background: transparent;
}


/* ── Photo row hidden when detail collapsed (legacy fallback) ── */
tr.scw-inline-photo-row.${P}-photo-hidden {
  display: none !important;
}

/* ================================================================
   COMPARISON LAYOUT (view_3575) – side-by-side SCW vs Survey
   ================================================================ */
.${P}-comp {
  display: grid;
  grid-template-columns: 110px 1fr 1fr;
  gap: 0;
  padding: 8px 16px 12px;
}
.${P}-comp-header {
  display: contents;
}
.${P}-comp-header > div {
  padding: 8px 8px 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #4b5563;
  border-bottom: 2px solid #e5e7eb;
}
.${P}-comp-row {
  display: contents;
}
.${P}-comp-row > div {
  padding: 6px 8px;
  border-bottom: 1px solid #f3f4f6;
  min-height: 28px;
  display: flex;
  align-items: flex-start;
}
.${P}-comp-label {
  font-size: 11px;
  font-weight: 600;
  color: #4b5563;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  padding-top: 10px !important;
  white-space: pre-line;
  line-height: 1.3;
}
.${P}-comp-val {
  min-width: 0;
  word-break: break-word;
}
.${P}-comp-val > td.${P}-field-value {
  display: block;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #fff;
  min-height: 24px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.${P}-comp-text {
  display: block;
  padding: 4px 8px;
  font-size: 13px;
  color: #1f2937;
  line-height: 1.5;
}
.${P}-comp-text--empty {
  color: #9ca3af;
  font-style: italic;
}

/* Survey column subtle background to visually distinguish sides */
.${P}-comp-row > .${P}-comp-val:last-child {
  background: #fafbfc;
}

/* Highlight mismatched rows for quick discrepancy identification */
.${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val {
  background: #fffbeb;
}
.${P}-comp-row.${P}-comp-mismatch > .${P}-comp-val:last-child {
  background: #fef3c7;
}

/* ── Product editable styling (shared class, applied via layout.productEditable) ── */
td.${P}-sum-product--editable,
td.${P}-sum-product--editable:hover {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  border: 1px solid #e5e7eb !important;
  border-radius: 4px;
  background: rgba(134, 182, 223, 0.1) !important;
  padding: 2px 8px;
  height: auto;
  min-height: 30px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s, background-color 0.15s;
}
td.${P}-sum-product--editable.cell-edit:hover,
td.${P}-sum-product--editable.ktlInlineEditableCellsStyle:hover {
  background-color: rgba(134, 182, 223, 0.18) !important;
  border-color: #93c5fd !important;
  cursor: pointer;
}
td.${P}-sum-product--editable.bulkEditSelectSrc {
  outline-offset: 1px;
  cursor: cell !important;
  background-color: rgb(255, 253, 204) !important;
}



/* Fee label — align with value text (match td padding-left) */
.${P}-sum-group--fee > .${P}-sum-label {
  padding-left: 8px;
  text-align: center;
  width: 100%;
}

/* Per-group width overrides (scoped under .sum-right for specificity) */
.${P}-sum-right .${P}-sum-group--qty {
  width: min-content;
  min-width: 36px;
}
/* Hide Qty label when its cell is grayed out (locked) */
.${P}-sum-group--qty:has(td.scw-cond-grayed) > .${P}-sum-label {
  visibility: hidden;
}
.${P}-sum-right .${P}-sum-group--labor {
  width: 75px;
  min-width: 75px;
}
.${P}-sum-right .${P}-sum-group--ext {
  width: min-content;
  min-width: 36px;
}
.${P}-sum-right .${P}-sum-group--narrow {
  width: 50px;
  min-width: 50px;
}
.${P}-sum-right .${P}-sum-group--sub-bid {
  width: min-content;
  min-width: 70px;
}
.${P}-sum-right .${P}-sum-group--cat {
  width: 70px;
  min-width: 70px;
}
.${P}-sum-right .${P}-sum-group--vars {
  width: 100px;
  min-width: 100px;
  overflow: hidden;
}
.${P}-sum-right .${P}-sum-group--fee {
  width: min-content;
  min-width: 70px;
}
.${P}-sum-right .${P}-sum-group--sow {
  width: 100px;
  min-width: 100px;
  flex-shrink: 0;
}
.${P}-sum-right .${P}-sum-group--qty-badge {
  min-width: 110px;
  align-items: center;
}
.${P}-sum-group--qty-badge td.${P}-sum-field-ro {
  justify-content: center;
}
/* Center Connected Devices text */
.${P}-sum-group[data-scw-fields="field_1957"] {
  align-items: center;
}
.${P}-sum-group[data-scw-fields="field_1957"] td {
  justify-content: center;
}
/* SOW field grows in height to show multiple connection values */
.${P}-sum-group--sow td.${P}-sum-field {
  height: auto;
  min-height: 30px;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
.${P}-sum-group--mcb {
  width: 80px;
  min-width: 80px;
}

@media (max-width: 900px) {
  .${P}-comp {
    grid-template-columns: 90px 1fr 1fr;
  }
}

/* ── Stacked pair groups (label → input → TTL label → value, single column) ── */
.${P}-sum-group--stacked-pair {
  display: flex !important;
  flex-direction: column !important;
  align-items: center;
  gap: 0;
}
/* TOTAL label — padding above, minimal below, centered */
.${P}-sum-label--ttl {
  margin-top: 8px;
  margin-bottom: 0;
  text-align: center;
  width: 100%;
}
/* Read-only total in stacked pair — match Fee value size, centered */
.${P}-sum-group--stacked-pair .${P}-sum-field-ro {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  padding: 0 4px !important;
  justify-content: center;
  width: 100%;
}

/* view_3586 right-group widths — compact to leave room for SCW Notes fill */
.${P}-sum-right .${P}-sum-group--retail {
  width: min-content;
  min-width: 60px;
}
.${P}-sum-right .${P}-sum-group--disc-pct {
  width: 55px;
  min-width: 55px;
}
.${P}-sum-right .${P}-sum-group--disc-dlr {
  width: 60px;
  min-width: 60px;
}
.${P}-sum-right .${P}-sum-group--applied {
  width: min-content;
  min-width: 60px;
}
.${P}-sum-right .${P}-sum-group--total {
  width: 90px;
  min-width: 90px;
}

/* ── Non-stacked alignment: push checkbox/chevron/product down by label height ── */
.${P}-summary:not(.${P}-summary--stacked) td.${P}-sum-check,
.${P}-summary:not(.${P}-summary--stacked) .${P}-toggle-zone {
  margin-top: 12px;
}
/* Non-stacked fill textarea — stretches to match tallest sibling, grows for extra text */
.${P}-summary:not(.${P}-summary--stacked) .${P}-sum-group--fill .${P}-direct-textarea {
  min-height: 28px;
  max-height: none;
}

/* ── Bucket chit wrapper (empty label + chit, aligned with field columns) ── */
.${P}-bucket-chit-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  flex-shrink: 0;
}
/* ── Bucket chit (SERVICE / ASSUMPTION) — teal pill matching radio-chip shape ── */
.${P}-bucket-chit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  background: #2f6f73;
  border-radius: 10px;
  border: 1px solid transparent;
  white-space: nowrap;
  padding: 1px 8px;
  line-height: 1.5;
  flex-shrink: 0;
  min-width: 40px;
}
/* Bucket chit present — product flexes automatically within fixed identity */

/* ── Worksheet <thead> column styling ── */
.${P}-thead-styled tr {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
}
.${P}-thead-styled th {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem !important;
  text-align: center !important;
  padding: 6px 10px !important;
  line-height: 1.2;
  box-sizing: border-box !important;
  white-space: nowrap;
  background: rgb(7, 70, 124) !important;
  color: #fff !important;
  border: none !important;
  border-right: 1px solid rgba(255,255,255,0.2) !important;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
}
.${P}-thead-styled th:last-child {
  border-right: none !important;
}
.${P}-thead-styled th a,
.${P}-thead-styled th a span,
.${P}-thead-styled th span {
  color: #fff !important;
}
.${P}-thead-styled th:hover {
  background: rgb(10, 90, 155) !important;
}
.${P}-thead-styled th .table-fixed-label {
  justify-content: center;
}
.${P}-thead-styled th .kn-sort {
  justify-content: center;
  margin-top: 5px;
}
/* Widen checkbox header to align over row checkboxes (covers checkbox + chevron area) */
.${P}-thead-styled .ktlCheckboxHeaderCell {
  width: 48px !important;
  min-width: 48px !important;
  background: rgb(7, 70, 124) !important;
  border: none !important;
}
/* Stack bulk-edit checkbox below the label text */
.${P}-thead-styled th .table-fixed-label.bulkEditTh {
  flex-direction: column !important;
  align-items: center !important;
  gap: 2px;
}
.${P}-thead-styled th .bulkEditHeaderCbox {
  margin: 0 auto !important;
  text-align: center;
}

/* ══════════════════════════════════════════════════════════════════
   AUTO-GENERATED PER-VIEW LAYOUT RULES
   Driven by the layout block in each WORKSHEET_CONFIG entry.
   ══════════════════════════════════════════════════════════════════ */
${WORKSHEET_CONFIG.views.map(function (v) {
  var id = v.viewId;
  var L = v.layout;
  var rules = [];

  // ── Product group width ──
  if (L.productGroupWidth && L.productGroupWidth !== 'flex') {
    var w = L.productGroupWidth;
    rules.push(
      '#' + id + ' .' + P + '-product-group {' +
      ' width: ' + w + '; min-width: ' + w + '; max-width: ' + w + '; }'
    );
  }

  // ── Label width (when non-default) ──
  if (L.labelWidth && L.labelWidth !== LAYOUT_DEFAULTS.labelWidth) {
    rules.push(
      '#' + id + ' td.' + P + '-sum-label-cell,' +
      '#' + id + ' td.' + P + '-sum-label-cell:hover {' +
      ' width: ' + L.labelWidth + '; min-width: ' + L.labelWidth + '; max-width: ' + L.labelWidth + ';' +
      ' white-space: normal; word-break: break-word; line-height: 1.3; }'
    );
  }

  // ── Identity width ──
  if (L.identityWidth) {
    var iw = L.identityWidth;
    rules.push(
      '#' + id + ' .' + P + '-identity {' +
      ' width: ' + iw + '; max-width: ' + iw + '; flex: 0 1 ' + iw + '; min-width: 0; }'
    );
  }

  // ── Detail grid columns (when non-default) ──
  if (L.detailGrid && L.detailGrid !== LAYOUT_DEFAULTS.detailGrid) {
    // Replace bare "1fr" with "minmax(0,1fr)" so columns can shrink below content width
    var safeGrid = L.detailGrid.replace(/(?<!\S)1fr(?!\S)/g, 'minmax(0,1fr)');
    rules.push(
      '#' + id + ' .' + P + '-sections { grid-template-columns: ' + safeGrid + '; }'
    );
    rules.push(
      '@media (max-width: 900px) { #' + id + ' .' + P + '-sections { grid-template-columns: 1fr; } }'
    );
  }

  return rules.length
    ? '/* ── ' + id + ' (auto-generated) ── */\n' + rules.join('\n')
    : '';
}).filter(Boolean).join('\n\n')}

/* ── view_3596: summary border on top, not bottom ── */
#view_3596 .${P}-summary {
  border-bottom: none;
  border-top: 1px solid #e5e7eb;
}
#view_3596 .${P}-sum-group--fill .${P}-sum-label {
  display: none;
}
#view_3596 .${P}-bucket-override .${P}-sum-group--fill .${P}-sum-label {
  display: block;
}
#view_3596 .${P}-bucket-override .${P}-identity {
  gap: 0;
}
#view_3596 .${P}-bucket-override .${P}-sum-sep {
  display: none !important;
}
#view_3596 .${P}-bucket-override td.${P}-sum-field-ro {
  padding-left: 0 !important;
}
#view_3596 .scw-inline-photo-label {
  display: none;
}

/* ── view_3596: disable clicks on detail links and photo strip ── */
#view_3596 .${P}-detail a,
#view_3596 .${P}-photo-wrap a,
#view_3596 .${P}-photo-wrap .scw-inline-photo-card {
  pointer-events: none;
  cursor: default;
  color: inherit;
  text-decoration: none;
}

/* ── view_3608: summary border on top, not bottom ── */
#view_3608 .${P}-summary {
  border-bottom: none;
  border-top: 1px solid #e5e7eb;
}
#view_3608 .${P}-sum-group--fill .${P}-sum-label {
  display: none;
}
#view_3608 .${P}-identity {
  gap: 0;
}
#view_3608 .${P}-sum-sep {
  display: none !important;
}
#view_3608 td.${P}-sum-field-ro {
  padding-left: 0 !important;
}
#view_3608 .scw-row--assumptions .${P}-sum-group--fill .${P}-sum-label,
#view_3608 .scw-row--services .${P}-sum-group--fill .${P}-sum-label {
  display: block;
}
#view_3608 .scw-inline-photo-label {
  display: none;
}
/* ── view_3608: disable clicks on detail links and photo strip ── */
#view_3608 .${P}-detail a,
#view_3608 .${P}-photo-wrap a,
#view_3608 .${P}-photo-wrap .scw-inline-photo-card {
  pointer-events: none;
  cursor: default;
  color: inherit;
  text-decoration: none;
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

  /** Check if a td is editable via Knack or KTL inline-edit classes. */
  function isCellEditable(td) {
    if (!td) return false;
    return td.classList.contains('cell-edit') || td.classList.contains('ktlInlineEditableCellsStyle');
  }

  /** Check if a td has been explicitly locked/grayed by conditional modules. */
  function isCellLocked(td) {
    if (!td) return false;
    return td.classList.contains('scw-cond-grayed') || td.classList.contains('scw-cell-locked');
  }

  function getRecordId(tr) {
    var trId = tr.id || '';
    var match = trId.match(/[0-9a-f]{24}/i);
    return match ? match[0] : null;
  }

  // ── Bucket detection for per-view conditional field hiding ──

  /**
   * Return the true label text of a Knack group-header row, ignoring any
   * elements injected by group-collapse (collapse icons, record-count badges).
   */
  function getGroupLabelText(groupRow) {
    var td = groupRow.querySelector('td');
    if (!td) return '';
    var clone = td.cloneNode(true);
    var extras = clone.querySelectorAll('.scw-collapse-icon, .scw-group-badges');
    for (var i = 0; i < extras.length; i++) extras[i].remove();
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Read the bucket connection record ID from a detect cell.
   * Knack renders connection values as <span data-kn="connection-value" class="<recordId>">.
   */
  function readBucketId(tr, bucketField) {
    var td = tr.querySelector('td.' + bucketField);
    if (!td) return '';
    var span = td.querySelector('span[data-kn="connection-value"]');
    if (span) {
      var cls = (span.getAttribute('class') || '').trim();
      if (cls) return cls;
    }
    return '';
  }

  /**
   * Apply bucket rules to a worksheet card's summary bar.
   * Hides summary groups whose data-scw-fields contain any field in rule.hideFields,
   * and injects the bucket label into the product area.
   */
  function applyBucketRules(card, tr, viewCfg) {
    if (!viewCfg.bucketField || !viewCfg.bucketRules) return;

    var bucketId = readBucketId(tr, viewCfg.bucketField);
    if (!bucketId) return;

    var rule = viewCfg.bucketRules[bucketId];
    if (!rule) return;

    // ── Hide summary groups containing fields in hideFields ──
    var hideSet = new Set(rule.hideFields || []);
    if (hideSet.size) {
      var groups = card.querySelectorAll('[data-scw-fields]');
      for (var i = 0; i < groups.length; i++) {
        var fields = groups[i].getAttribute('data-scw-fields').split(' ');
        for (var j = 0; j < fields.length; j++) {
          if (hideSet.has(fields[j])) {
            groups[i].style.display = 'none';
            break;
          }
        }
      }
    }

    // ── Inject bucket chit to the left of product ──
    if (rule.label) {
      var identity = card.querySelector('.' + P + '-identity');
      var productDesc = viewCfg.fields && viewCfg.fields.product;
      var productHidden = productDesc && hideSet.has(productDesc.key);
      if (identity) {
        if (productHidden && (rule.summarySwapField || rule.hideProduct)) {
          // Hide identity — the fill group spans full width and
          // carries the bucket label via descLabel.
          identity.style.display = 'none';
        } else if (!productHidden) {
          // Product visible — inject teal pill chit beside it
          var chitGroup = document.createElement('span');
          chitGroup.className = P + '-bucket-chit-group';
          chitGroup.style.visibility = 'visible';
          var chitLabel = document.createElement('span');
          chitLabel.className = P + '-sum-label';
          chitLabel.innerHTML = '&nbsp;';
          chitGroup.appendChild(chitLabel);

          var chitEl = document.createElement('span');
          chitEl.className = P + '-bucket-chit';
          chitEl.textContent = rule.label;
          chitGroup.appendChild(chitEl);

          identity.insertBefore(chitGroup, identity.firstChild);
        }
      }
    }

    // ── Override labor-desc label per bucket ──
    if (rule.descLabel) {
      var ldDesc = viewCfg.fields && viewCfg.fields.laborDescription;
      if (ldDesc) {
        var ldGroup = card.querySelector('[data-scw-fields="' + ldDesc.key + '"] > .' + P + '-sum-label');
        if (ldGroup) ldGroup.textContent = rule.descLabel;
      }
    }

    // ── Swap summary field with another field (read-only) ──
    // e.g. replace scwNotes (field_1953) with laborDescription (field_2020)
    if (rule.summarySwapField) {
      // Find the swap source td anywhere in the card (usually in detail panel)
      var swapTd = card.querySelector('td[data-field-key="' + rule.summarySwapField + '"]');
      var swapText = '';
      if (swapTd) {
        var swapSpan = swapTd.querySelector('span[class^="col-"]');
        swapText = (swapSpan || swapTd).textContent.replace(/^\s+|\s+$/g, '').replace(/\u00a0/g, '');
      }
      // Find the hidden summary group for the field being replaced
      // (it was hidden above via hideFields — un-hide it and replace content)
      var hiddenGroups = card.querySelectorAll('[data-scw-fields]');
      for (var hg = 0; hg < hiddenGroups.length; hg++) {
        var hgFields = hiddenGroups[hg].getAttribute('data-scw-fields').split(' ');
        for (var hf = 0; hf < hgFields.length; hf++) {
          if (hideSet.has(hgFields[hf]) && hiddenGroups[hg].classList.contains(P + '-sum-group--fill')) {
            // Un-hide and replace with swap field content
            hiddenGroups[hg].style.display = '';
            hiddenGroups[hg].setAttribute('data-scw-fields', rule.summarySwapField);
            // Remove old label + td, build fresh read-only content
            hiddenGroups[hg].innerHTML = '';
            var swLabelText = rule.label
              ? rule.label.charAt(0).toUpperCase() + rule.label.slice(1).toLowerCase()
              : '\u00a0';
            var swLabel = document.createElement('span');
            swLabel.className = P + '-sum-label';
            swLabel.textContent = swLabelText;
            hiddenGroups[hg].appendChild(swLabel);
            var swVal = document.createElement('span');
            swVal.className = P + '-sum-field-ro ' + P + '-sum-field--desc ' + P + '-sum-direct-edit';
            swVal.style.cssText = 'white-space: pre-wrap; cursor: default;';
            swVal.textContent = swapText || '\u00a0';
            hiddenGroups[hg].appendChild(swVal);
            break;
          }
        }
      }
    }

    // ── Hide detail sections (keep photo wraps only) ──
    if (rule.hideDetail) {
      var detSections = card.querySelector('.' + P + '-sections');
      if (detSections) detSections.style.display = 'none';
    }

    // ── Hide specific fields from the detail panel ──
    if (rule.hideDetailFields && rule.hideDetailFields.length) {
      var detailEl = card.querySelector('.' + P + '-detail');
      if (detailEl) {
        for (var hdf = 0; hdf < rule.hideDetailFields.length; hdf++) {
          var hdfKey = rule.hideDetailFields[hdf];
          // Detail fields are wrapped in .scw-ws-field divs containing a td
          var hdfTd = detailEl.querySelector('td[data-field-key="' + hdfKey + '"]');
          if (hdfTd) {
            var hdfField = hdfTd.closest('.' + P + '-field');
            if (hdfField) hdfField.style.display = 'none';
          }
        }
      }
    }

    // ── Show product field in detail panel (for Assumptions) ──
    if (rule.showProductInDetail) {
      var pDesc = viewCfg.fields && viewCfg.fields.product;
      if (pDesc) {
        var pTd = card.querySelector('td[data-field-key="' + pDesc.key + '"]');
        var pText = '';
        if (pTd) {
          var pSpan = pTd.querySelector('span[class^="col-"]');
          pText = (pSpan || pTd).textContent.replace(/^\s+|\s+$/g, '').replace(/\u00a0/g, '');
        }
        if (pText) {
          var detSect = card.querySelector('.' + P + '-sections > .' + P + '-section');
          if (detSect) {
            var pField = document.createElement('div');
            pField.className = P + '-field';
            var pLabel = document.createElement('div');
            pLabel.className = P + '-field-label';
            pLabel.textContent = 'Product';
            pField.appendChild(pLabel);
            var pVal = document.createElement('div');
            pVal.className = P + '-field-value';
            pVal.style.cssText = 'white-space: normal; word-break: break-word;';
            pVal.textContent = pText;
            pField.appendChild(pVal);
            detSect.insertBefore(pField, detSect.firstChild);
          }
        }
      }
    }
  }

  /**
   * Apply conditional field hiding based on whether a trigger field is locked.
   * When the lock/grayout modules have grayed or locked the trigger field,
   * hide individual field tds (and their associated labels in stacked pairs).
   * If every field in a group is hidden, hides the entire group.
   */
  function applyConditionalHide(card, tr, viewCfg) {
    if (!viewCfg.conditionalHide) return;

    viewCfg.conditionalHide.forEach(function (rule) {
      // Look for the trigger field td — it may be in the card (moved by
      // buildWorksheetCard) or still in the original tr.
      var triggerTd = card.querySelector('td[data-field-key="' + rule.whenLocked + '"]')
                   || card.querySelector('td.' + rule.whenLocked)
                   || tr.querySelector('td.' + rule.whenLocked);
      if (!triggerTd) return;

      var locked = triggerTd.classList.contains('scw-cond-grayed')
                || triggerTd.classList.contains('scw-cell-locked');
      if (!locked) return;

      // Hide the trigger field's label (e.g. "Qty" label when qty is locked)
      var triggerGroup = triggerTd.closest('[data-scw-fields]');
      if (triggerGroup) {
        var triggerLabel = triggerGroup.querySelector('.' + P + '-sum-label');
        if (triggerLabel) triggerLabel.style.display = 'none';
      }

      var hideSet = new Set(rule.hideFields || []);

      // Find each target td by data-field-key and hide it.
      // In stacked pairs, also hide the preceding TOTAL label.
      hideSet.forEach(function (fieldKey) {
        var td = card.querySelector('td[data-field-key="' + fieldKey + '"]');
        if (!td) return;

        var group = td.closest('[data-scw-fields]');
        if (!group) return;

        var groupFields = group.getAttribute('data-scw-fields').split(' ');
        var allHidden = groupFields.every(function (f) { return hideSet.has(f); });

        if (allHidden) {
          // Every field in this group is hidden — hide the whole group
          group.style.display = 'none';
        } else {
          // Hide just this td. If it's a TOTAL in a stacked pair, also
          // hide the preceding TTL label.
          td.style.display = 'none';
          var prev = td.previousElementSibling;
          if (prev && prev.classList.contains(P + '-sum-label--ttl')) {
            prev.style.display = 'none';
          }
        }
      });
    });
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

  // localStorage helpers for persisting accordion state across page refreshes
  function wsStorageKey(viewId) { return 'scw:ws-expanded:' + viewId; }
  function loadWsState(viewId) {
    try { return JSON.parse(localStorage.getItem(wsStorageKey(viewId)) || '[]'); }
    catch (e) { return []; }
  }
  function saveWsState(viewId, expanded) {
    try { localStorage.setItem(wsStorageKey(viewId), JSON.stringify(expanded)); }
    catch (e) {}
  }

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
    saveWsState(viewId, expanded);
  }

  /** Capture expanded state for ALL configured worksheet views.
   *  Called on ANY knack-cell-update because refresh-on-inline-edit.js
   *  may refresh sibling views — not just the one that was edited. */
  function captureAllExpandedStates() {
    WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
      // Skip views not in the current DOM — avoids unnecessary
      // querySelectorAll on views that aren't on this page.
      if (!document.getElementById(viewCfg.viewId)) return;
      captureExpandedState(viewCfg.viewId);
    });
  }

  /** Re-expand detail panels for previously-expanded records.
   *  Called at the end of transformView after new worksheet rows
   *  have been built. Uses record ID (24-char hex) for stable
   *  identity across re-renders. */
  function restoreExpandedState(viewId) {
    // Prefer in-memory state (inline edit); fall back to localStorage (page refresh)
    var expanded = _expandedState[viewId];
    if (!expanded || !expanded.length) {
      expanded = loadWsState(viewId);
    }
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
  var MULTI_CHIP_ATTR  = 'data-multi';

  /** Read current value from a cell's text content. */
  function readCellText(td) {
    if (!td) return '';
    return (td.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim();
  }

  /** Resolve a field descriptor to its Knack key. */
  function fieldKey(viewCfg, name) {
    if (!viewCfg || !viewCfg.fields) return null;
    var desc = viewCfg.fields[name];
    if (!desc) return null;
    return typeof desc === 'string' ? desc : desc.key;
  }

  /** Get the descriptor object for a field name. */
  function fieldDesc(viewCfg, name) {
    if (!viewCfg || !viewCfg.fields) return null;
    var desc = viewCfg.fields[name];
    if (!desc) return null;
    if (typeof desc === 'string') return { key: desc, type: 'readOnly' };
    return desc;
  }

  /** Build radio/multi chip elements for a set of options.
   *  multi=true → multiple chips can be selected (toggle behavior). */
  function buildRadioChips(td, fKey, options, multi) {
    var currentVal = readCellText(td);
    var container = document.createElement('div');
    container.className = P + '-radio-chips';
    container.setAttribute('data-field', fKey);

    // For multi-chip, parse comma-separated values
    var selectedSet = {};
    if (multi) {
      container.setAttribute(MULTI_CHIP_ATTR, '1');
      var parts = currentVal.split(',');
      for (var j = 0; j < parts.length; j++) {
        var trimmed = parts[j].replace(/[\u00a0\s]+/g, ' ').trim();
        if (trimmed) selectedSet[trimmed] = true;
      }
    }

    for (var i = 0; i < options.length; i++) {
      var chip = document.createElement('span');
      chip.className = RADIO_CHIP_CLASS;
      chip.setAttribute('data-option', options[i]);
      chip.setAttribute('data-field', fKey);
      chip.textContent = options[i];

      var isSelected = multi
        ? !!selectedSet[options[i]]
        : (currentVal === options[i]);

      if (isSelected) {
        chip.classList.add('is-selected');
      } else {
        chip.classList.add('is-unselected');
      }
      container.appendChild(chip);
    }
    return container;
  }

  /** Build a field row that uses radio chips instead of the raw cell. */
  function buildRadioChipRow(label, td, fKey, options, multi, opts) {
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

    var chips = buildRadioChips(td, fKey, options, multi);
    if (opts && opts.segmented) chips.classList.add(P + '-segmented');
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
      input.rows = 4;
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
    input._scwPrev = previousValue;

    // Update hidden td back to previous value (detail panel)
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    if (hiddenTd) {
      hiddenTd.textContent = previousValue;
    }
    // Update hidden span (summary bar)
    var hiddenSpan = wrapper ? wrapper.querySelector('span[style*="display"]') : null;
    if (hiddenSpan) hiddenSpan.textContent = previousValue;

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

  // ============================================================
  // CONDITIONAL CELL COLOR EVALUATOR (shared by render + save)
  // ============================================================
  //
  // Pure-logic function: given a field key and its text value,
  // returns the conditional color key ('danger', 'warning') or
  // null.  Used both at initial render (to set input bg without
  // getComputedStyle) and after saves (refreshInputConditionalColor).
  //
  // Rules mirror dynamic-cell-colors.js for the direct-edit fields
  // that device-worksheet manages.

  var COND_COLORS_MAP = {
    danger:  'rgb(248, 215, 218)',
    warning: 'rgb(255, 243, 205)'
  };

  var COND_DEFAULT_BG = 'rgba(134, 182, 223, 0.1)';

  function evaluateConditionalColor(fieldKey, rawText) {
    var cleaned = (rawText || '').replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ').trim();
    var isEmpty = cleaned === '' || cleaned === '-' || cleaned === '\u2014';
    var isZero = /^[$]?0+(\.0+)?$/.test(cleaned);

    if (fieldKey === 'field_2400') {
      if (isEmpty) return 'danger';
      if (isZero)  return 'warning';
    } else if (fieldKey === 'field_2409') {
      if (isEmpty) return 'danger';
    } else if (fieldKey === 'field_2415' || fieldKey === 'field_771') {
      if (isEmpty) return 'warning';
    } else if (fieldKey === 'field_2399') {
      if (isZero) return 'warning';
    }
    return null;
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
    var fieldKey = input.getAttribute('data-field');
    if (!fieldKey) return;

    // Read value from hidden td (detail panel) or input itself (summary bar)
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var rawText = hiddenTd ? (hiddenTd.textContent || '') : (input.value || '');

    var conditionColor = evaluateConditionalColor(fieldKey, rawText);

    // The element to update classes/styles on
    var styleTd = hiddenTd || wrapper;
    var dangerCls = 'scw-cell-danger';
    var warningCls = 'scw-cell-warning';

    styleTd.classList.remove(dangerCls, warningCls);
    if (conditionColor === 'danger') {
      styleTd.classList.add(dangerCls);
      styleTd.style.backgroundColor = COND_COLORS_MAP.danger;
    } else if (conditionColor === 'warning') {
      styleTd.classList.add(warningCls);
      styleTd.style.backgroundColor = COND_COLORS_MAP.warning;
    } else {
      styleTd.style.backgroundColor = '';
    }

    // Update the visible input's background
    if (conditionColor && COND_COLORS_MAP[conditionColor]) {
      input.style.backgroundColor = COND_COLORS_MAP[conditionColor];
    } else {
      input.style.backgroundColor = COND_DEFAULT_BG;
    }
  }

  // Number fields that need client-side validation
  var NUMBER_FIELDS = ['field_2367', 'field_2368', 'field_2400', 'field_2399', 'field_2458',
                       'field_2150', 'field_1973', 'field_1974', 'field_1951', 'field_1965',
                       'field_1964'];

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

  /** Returns true if fieldKey affects the calculated Install Fee. */
  function isFeeTrigger(viewId, fieldKey) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !cfg.feeTriggerFields) return false;
    return cfg.feeTriggerFields.indexOf(fieldKey) !== -1;
  }

  /** After a fee-trigger save, patch the Fee cell from the API response
   *  and re-evaluate danger styling on Sub Bid / +Hrs / +Mat groups. */
  /**
   * After a feeTrigger save, patch calculated/readOnly cells in-place
   * from the PUT response instead of doing a full view refresh.
   * This avoids the gray-out / opacity fade that blocks back-to-back edits.
   */
  function patchCalculatedCells(viewId, recordId, resp) {
    if (!resp) return;
    var cfg = viewCfgFor(viewId);
    if (!cfg) return;

    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    // Find the worksheet card for this record
    var cards = viewEl.querySelectorAll('.' + P + '-card');
    var card = null;
    for (var ci = 0; ci < cards.length; ci++) {
      var row = cards[ci].closest('tr');
      if (row && getRecordId(row) === recordId) { card = cards[ci]; break; }
    }
    if (!card) return;

    // Patch each readOnly summary field that has a value in the response
    var f = cfg.fields;
    Object.keys(f).forEach(function (name) {
      var desc = f[name];
      if (desc.type !== 'readOnly' || !desc.summary) return;
      var fk = desc.key;
      // Try _raw first (Knack's formatted value), then plain
      var raw = resp[fk + '_raw'];
      var val = raw != null ? raw : resp[fk];
      if (val == null) return;
      // Strip HTML tags if present
      var txt = (typeof val === 'string') ? val.replace(/<[^>]*>/g, '').trim() : String(val);

      // Find the td inside the card (summary bar)
      var td = card.querySelector('td.' + fk + ', td[data-field-key="' + fk + '"]');
      if (!td) return;
      // Update the span inside the td (Knack's value wrapper) or the td itself
      var span = td.querySelector('span[class^="col-"]');
      if (span) {
        span.textContent = txt;
      } else {
        td.textContent = txt;
      }
    });

    console.log('[scw-ws] Patched calculated cells for ' + recordId + ' in ' + viewId);
  }

  /** Extract the label text from a Knack API response object. */
  function extractLabelFromResponse(viewId, resp) {
    var cfg = viewCfgFor(viewId);
    var labelField = fieldKey(cfg, 'label');
    if (!labelField) return '';
    var raw = resp[labelField + '_raw'] || resp[labelField] || '';
    return typeof raw === 'string'
      ? raw.replace(/<[^>]*>/g, '').trim()
      : String(raw);
  }

  /**
   * Fetch the record via the VIEW-level API and apply the label.
   * Uses the same-origin view URL to avoid CORS issues.
   */
  function fetchAndApplyLabel(viewId, recordId) {
    var cfg = viewCfgFor(viewId);
    if (!cfg || !fieldKey(cfg, 'label')) return;
    if (typeof Knack === 'undefined') return;

    console.log('[scw-ws-header] Fetching label via view API for ' + recordId);

    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId),
      type: 'GET',
      success: function (resp) {
        var txt = extractLabelFromResponse(viewId, resp);
        console.log('[scw-ws-header] View API label for ' + recordId + ': "' + txt + '"');
        if (txt) {
          _labelCache[recordId] = txt;
          applyLabelText(viewId, recordId, txt);
        }
      },
      error: function (xhr) {
        console.warn('[scw-ws-header] View GET failed for ' + recordId, xhr.status);
      }
    });
  }

  /** Patch the label td text for a single record in the DOM. */
  function applyLabelText(viewId, recordId, txt) {
    var cfg = viewCfgFor(viewId);
    var labelField = fieldKey(cfg, 'label');
    if (!labelField) return;

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
    var labelField = fieldKey(cfg, 'label');
    if (!labelField) return;

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

  /** Sync a single field value into Knack's internal Backbone model so
   *  KTL bulk edit (and any other code reading from the model) sees the
   *  correct value after an AJAX PUT save.
   *
   *  IMPORTANT: only update the ONE field that changed. Merging the full
   *  API response would write HTML-formatted display values into model
   *  attributes, corrupting subsequent model.updateRecord calls. */
  function syncKnackModel(viewId, recordId, resp, fieldKey, value) {
    try {
      var view = Knack.views[viewId];
      if (!view || !view.model) return;
      var m = view.model;

      // Find the Backbone record — try multiple paths
      var record = typeof m.get === 'function' ? m.get(recordId) : null;
      if (!record && m.data && typeof m.data.get === 'function') {
        record = m.data.get(recordId);
      }
      if (!record) {
        var arr = m.models || (m.data && m.data.models) || [];
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i].id === recordId) { record = arr[i]; break; }
        }
      }
      if (!record) return;

      var attrs = record.attributes || record;

      // Use _raw value from the response (clean server format) when available,
      // otherwise fall back to the value we sent.
      var rawVal = (resp && resp[fieldKey + '_raw'] != null) ? resp[fieldKey + '_raw'] : value;
      attrs[fieldKey] = rawVal;
      attrs[fieldKey + '_raw'] = rawVal;
    } catch (ex) {
      // Silently ignore — model sync is best-effort
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
    var feeTrig = isFeeTrigger(viewId, fieldKey);

    // Non-trigger fields: prefer model.updateRecord (no re-render)
    if (!trigger && !feeTrig) {
      var view = Knack.views[viewId];
      if (view && view.model && typeof view.model.updateRecord === 'function') {
        view.model.updateRecord(recordId, data);
        $(document).trigger('scw-record-saved');
        if (onSuccess) onSuccess(null);
        return;
      }
    }

    // Trigger / fee-trigger fields (or fallback): direct AJAX PUT
    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId),
      type: 'PUT',
      data: JSON.stringify(data),
      success: function (resp) {
        if (feeTrig) patchCalculatedCells(viewId, recordId, resp);
        if (trigger) fetchAndApplyLabel(viewId, recordId);
        // Sync Knack's internal model so KTL bulk edit reads correct values.
        // Merge the full API response into the Backbone model so every
        // field format (_raw, display, etc.) matches what Knack expects.
        syncKnackModel(viewId, recordId, resp, fieldKey, value);
        $(document).trigger('scw-record-saved');
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

    // Percent fields: user types whole number (6), Knack expects decimal (0.06)
    if (window.SCW && SCW.pctFormat && SCW.pctFormat.isPercentField(fieldKey)) {
      var pctNum = parseFloat(String(newValue).replace(/[%\s]/g, ''));
      if (!isNaN(pctNum)) newValue = String(pctNum / 100);
    }

    // Capture previous value: from hidden td (detail panel) or _scwPrev (summary bar)
    var wrapper = input.parentNode;
    var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
    var previousValue = hiddenTd ? readFieldText(hiddenTd) : (input._scwPrev || '');

    // Client-side validation for number fields
    if (NUMBER_FIELDS.indexOf(fieldKey) !== -1) {
      var trimmed = newValue.trim().replace(/[$,]/g, '');
      if (trimmed !== '' && isNaN(Number(trimmed))) {
        showInputError(input, 'Please enter a number', previousValue);
        return;
      }
    }

    // Optimistically update backing store
    if (hiddenTd) {
      hiddenTd.textContent = newValue;
    }
    input._scwPrev = newValue;
    // Update hidden span (summary bar) so dynamic-cell-colors sees new value
    var hiddenSpan = wrapper ? wrapper.querySelector('span[style*="display"]') : null;
    if (hiddenSpan) hiddenSpan.textContent = newValue;

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
        function () {
          showInputSuccess(input);
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
      // Revert to the original value
      target._scwJustSaved = true; // prevent blur save
      var wrapper = target.parentNode;
      var hiddenTd = wrapper ? wrapper.querySelector('td[' + DIRECT_EDIT_ATTR + ']') : null;
      target.value = hiddenTd ? readFieldText(hiddenTd) : (target._scwPrev || '');
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
    var originalVal = hiddenTd ? readFieldText(hiddenTd) : (target._scwPrev || '');
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

  /** Save a radio/multi chip selection via Knack's internal API.
   *  value may be a string (single chip) or an array (multi chip). */
  function saveRadioValue(viewId, recordId, fieldKey, value, onSuccess) {
    var data = {};
    data[fieldKey] = value;
    var trigger = isHeaderTrigger(viewId, fieldKey);
    var feeTrig = isFeeTrigger(viewId, fieldKey);

    // Non-trigger: prefer model.updateRecord (no re-render)
    if (!trigger && !feeTrig) {
      var view = typeof Knack !== 'undefined' && Knack.views ? Knack.views[viewId] : null;
      if (view && view.model && typeof view.model.updateRecord === 'function') {
        view.model.updateRecord(recordId, data);
        if (onSuccess) onSuccess(null);
        return;
      }
    }

    // Trigger / fee-trigger fields (or fallback): AJAX PUT — response has the formula
    if (typeof Knack !== 'undefined') {
      SCW.knackAjax({
        url: SCW.knackRecordUrl(viewId, recordId),
        type: 'PUT',
        data: JSON.stringify(data),
        success: function (resp) {
          if (feeTrig) patchCalculatedCells(viewId, recordId, resp);
          if (trigger) fetchAndApplyLabel(viewId, recordId);
          syncKnackModel(viewId, recordId, resp, fieldKey, value);
          if (onSuccess) onSuccess(resp);
        },
        error: function (xhr) {
          console.warn('[scw-ws-radio] Save failed for ' + recordId, xhr.responseText);
        }
      });
    }
  }

  // ── Capture-phase click handler for radio / multi chips ──
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.' + RADIO_CHIP_CLASS);
    if (!chip) return;

    // Let KTL bulk-edit handle the click when active
    var chipTd = chip.closest('td');
    if (chipTd && chipTd.classList.contains('bulkEditSelectSrc')) return;

    e.stopPropagation();
    e.preventDefault();

    var clickedOption = chip.getAttribute('data-option') || '';
    var fk = chip.getAttribute('data-field') || '';
    var container = chip.closest('.' + P + '-radio-chips');
    if (!container) return;

    var isMulti = container.getAttribute(MULTI_CHIP_ATTR) === '1';
    var allChips = container.querySelectorAll('.' + RADIO_CHIP_CLASS);
    var saveValue;

    if (isMulti) {
      // Toggle the clicked chip independently
      chip.classList.toggle('is-selected');
      chip.classList.toggle('is-unselected');
      chip.classList.add('is-saving');

      // Collect all selected options as an array
      var selected = [];
      for (var i = 0; i < allChips.length; i++) {
        if (allChips[i].classList.contains('is-selected')) {
          selected.push(allChips[i].getAttribute('data-option'));
        }
      }
      saveValue = selected;
    } else {
      // Single-select radio behavior
      for (var j = 0; j < allChips.length; j++) {
        allChips[j].classList.remove('is-selected', 'is-unselected');
        if (allChips[j].getAttribute('data-option') === clickedOption) {
          allChips[j].classList.add('is-selected', 'is-saving');
        } else {
          allChips[j].classList.add('is-unselected');
        }
      }
      saveValue = clickedOption;
    }

    setTimeout(function () {
      var saving = container.querySelectorAll('.is-saving');
      for (var k = 0; k < saving.length; k++) saving[k].classList.remove('is-saving');
    }, 400);

    // Update source td text so re-renders stay in sync
    var hiddenTd = container.closest('td[' + RADIO_CHIPS_ATTR + ']')
                || container.parentNode.querySelector('td[' + RADIO_CHIPS_ATTR + ']');
    var textValue = isMulti ? saveValue.join(', ') : saveValue;
    if (hiddenTd) {
      var hSpan = hiddenTd.querySelector('span[style*="display"]');
      if (hSpan) hSpan.textContent = textValue;
      else hiddenTd.textContent = textValue;
    }

    // Find record ID and view ID, then save
    var wsTr = chip.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = chip.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveRadioValue(viewId, recordId, fk, saveValue);
    }
  }, true);

  // ── Capture-phase mousedown: block Knack inline-edit trigger on chips ──
  document.addEventListener('mousedown', function (e) {
    var chip = e.target.closest('.' + RADIO_CHIP_CLASS);
    if (!chip) return;
    var chipTd = chip.closest('td');
    if (chipTd && chipTd.classList.contains('bulkEditSelectSrc')) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ── Capture-phase: block Knack inline-edit on chip host td and container ──
  document.addEventListener('click', function (e) {
    var host = e.target.closest('td.' + P + '-sum-chip-host');
    if (host && !host.classList.contains('bulkEditSelectSrc')) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    var host = e.target.closest('td.' + P + '-sum-chip-host');
    if (host && !host.classList.contains('bulkEditSelectSrc')) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  // ── Capture-phase click handler for cabling toggle chit ──
  var CABLING_CHIT_SEL = '.' + P + '-cabling-chit';
  document.addEventListener('click', function (e) {
    var chit = e.target.closest(CABLING_CHIT_SEL);
    if (!chit) return;

    // Let KTL bulk-edit handle the click when active
    var chitTd = chit.closest('td');
    if (chitTd && chitTd.classList.contains('bulkEditSelectSrc')) return;

    e.stopPropagation();
    e.preventDefault();

    var fieldKey = chit.getAttribute('data-field') || '';
    var isYes = chit.classList.contains('is-yes');
    var newBool = isYes ? 'No' : 'Yes';

    // Toggle visual state
    chit.classList.remove('is-yes', 'is-no');
    chit.classList.add(newBool === 'Yes' ? 'is-yes' : 'is-no', 'is-saving');
    setTimeout(function () { chit.classList.remove('is-saving'); }, 400);

    // Update source td (chit may be inside or beside the td)
    var srcTd = chit.closest('td[data-scw-cabling-src]')
             || chit.parentNode.querySelector('td[data-scw-cabling-src]');
    if (srcTd) {
      var hiddenSpan = srcTd.querySelector('span[style*="display"]');
      if (hiddenSpan) hiddenSpan.textContent = newBool;
    }

    // Save
    var wsTr = chit.closest('tr.' + WORKSHEET_ROW);
    if (!wsTr) return;
    var recordId = getRecordId(wsTr);
    var viewEl = chit.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;
    if (recordId && viewId) {
      saveRadioValue(viewId, recordId, fieldKey, newBool);
    }
  }, true);
  document.addEventListener('mousedown', function (e) {
    var chitEl = e.target.closest(CABLING_CHIT_SEL);
    if (!chitEl) return;
    var chitTd = chitEl.closest('td');
    if (chitTd && chitTd.classList.contains('bulkEditSelectSrc')) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  // ============================================================
  // SUMMARY BAR DIRECT-EDIT  (in-place input inside existing td)
  // ============================================================

  /** Inject a direct-edit input into an existing summary bar td.
   *  The td stays visible in the DOM with all its Knack/KTL classes
   *  so bulk-edit can still discover it.  The original span content
   *  is hidden; the previous value is stashed on input._scwPrev.
   *  opts.multiline — use a textarea that wraps and auto-grows. */
  function injectSummaryDirectEdit(td, fieldKey, opts) {
    opts = opts || {};
    // Guard against duplicate injection
    if (td.querySelector('[' + DIRECT_EDIT_ATTR + ']')) return;
    var currentVal = readFieldText(td);
    td.classList.add(P + '-sum-direct-edit');

    // Compute conditional background color from the field value
    // instead of reading getComputedStyle on the td.  This avoids
    // forced style recalculations entirely — the color is derived
    // from pure logic (field key + text value) using the same rules
    // as dynamic-cell-colors.js, rather than asking the browser to
    // resolve the computed style of each td in the document.
    var condColor = evaluateConditionalColor(fieldKey, currentVal);

    // Keep a hidden span with the text value so dynamic-cell-colors
    // (which reads $td.text()) still sees the real content.
    var existingSpan = td.querySelector('span');
    if (existingSpan) {
      existingSpan.style.display = 'none';
    } else {
      var hiddenSpan = document.createElement('span');
      hiddenSpan.style.display = 'none';
      hiddenSpan.textContent = currentVal;
      td.appendChild(hiddenSpan);
    }

    var input;
    if (opts.multiline) {
      input = document.createElement('textarea');
      input.className = DIRECT_TEXTAREA_CLASS;
      input.value = currentVal;
      input.rows = opts.rows || 4;

      // Auto-grow: resize textarea to fit content
      function autoGrow() {
        input.style.height = 'auto';
        var sh = input.scrollHeight;
        input.style.height = sh > 0 ? (sh + 'px') : '';
      }
      input.addEventListener('input', autoGrow);
      // Initial size — use multiple deferred calls because the first
      // requestAnimationFrame may fire before the browser has finished
      // laying out the container (scrollHeight returns 0 in that case).
      requestAnimationFrame(autoGrow);
      setTimeout(autoGrow, 50);
      setTimeout(autoGrow, 200);
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.className = DIRECT_INPUT_CLASS;
      input.value = currentVal;
    }
    input.setAttribute('data-field', fieldKey);
    input.setAttribute(DIRECT_EDIT_ATTR, '1');
    input._scwPrev = currentVal;

    // Apply conditional background color to the input
    if (condColor && COND_COLORS_MAP[condColor]) {
      input.style.backgroundColor = COND_COLORS_MAP[condColor];
    }

    td.appendChild(input);
  }

  // ============================================================
  // SUMMARY GROUP HELPER
  // ============================================================

  /** Append a labelled summary-bar group to a parent element.
   *  opts.readOnly   — use read-only styling (no edit affordance)
   *  opts.directEdit — inject a type-and-save input
   *  opts.fieldKey   — field key for direct-edit save target
   *  opts.cls        — extra CSS class for the group wrapper */
  function appendSumGroup(parent, label, td, opts) {
    opts = opts || {};
    if (!td) return null;
    var group = document.createElement('span');
    group.className = P + '-sum-group' + (opts.cls ? ' ' + opts.cls : '');
    if (opts.fieldKey) group.setAttribute('data-scw-fields', opts.fieldKey);
    var lbl = document.createElement('span');
    lbl.className = P + '-sum-label';
    lbl.textContent = label;
    group.appendChild(lbl);
    td.classList.add(opts.readOnly ? (P + '-sum-field-ro') : (P + '-sum-field'));
    if (isCellEmpty(td)) td.classList.add(P + '-empty');
    if (opts.directEdit && opts.fieldKey) {
      injectSummaryDirectEdit(td, opts.fieldKey);
    }
    group.appendChild(td);

    // Inherit Knack's text-align setting (e.g. center) so the value
    // AND label honour the column alignment configured in the builder.
    // The td uses display:inline-flex (text-align is ignored by flex),
    // so we translate text-align into the flex equivalents.
    var tdAlign = td.style.textAlign || getComputedStyle(td).textAlign;
    if (tdAlign === 'center' || tdAlign === 'right') {
      var flexAlign = tdAlign === 'center' ? 'center' : 'flex-end';
      group.style.alignItems = flexAlign;         // centers label + td within the group column
      td.style.justifyContent = flexAlign;        // centers content inside the td (which is width:100%)
      lbl.style.textAlign = tdAlign;              // centers the label text
    }

    parent.appendChild(group);
    return group;
  }

  // ============================================================
  // BUILD SUMMARY BAR
  // ============================================================

  /** Render a single field into the summary bar based on its descriptor type. */
  function renderSummaryField(target, tr, name, desc, viewCfg) {
    var td = findCell(tr, desc.key, desc.columnIndex);

    switch (desc.type) {
      case 'readOnly':
        if (desc.group === 'fill') {
          // Fill group — read-only version of the stretchy middle field
          if (!td) break;
          var roFillGroup = document.createElement('span');
          roFillGroup.className = P + '-sum-group ' + P + '-sum-group--fill';
          roFillGroup.setAttribute('data-scw-fields', desc.key);
          var roFillLabel = document.createElement('span');
          roFillLabel.className = P + '-sum-label';
          roFillLabel.textContent = desc.label || name;
          roFillGroup.appendChild(roFillLabel);
          td.classList.add(P + '-sum-field-ro');
          if (desc.multiline) td.classList.add(P + '-sum-field--desc');
          if (isCellEmpty(td)) td.classList.add(P + '-empty');
          roFillGroup.appendChild(td);
          target.appendChild(roFillGroup);
        } else if (desc.readOnlySummary) {
          appendSumGroup(target, desc.label || name, td,
            { cls: desc.groupCls ? (P + '-' + desc.groupCls) : undefined, readOnly: true, fieldKey: desc.key });
        } else {
          appendSumGroup(target, desc.label || name, td,
            { cls: desc.groupCls ? (P + '-' + desc.groupCls) : undefined, fieldKey: desc.key });
        }
        break;

      case 'directEdit':
        // Editable if Knack/KTL has cell-edit on the td, or if the field
        // is flagged alwaysEditable (and not locked by conditional modules).
        var _knackEditable = isCellEditable(td)
          || (desc.alwaysEditable && td && !isCellLocked(td));
        if (desc.group === 'fill') {
          // Fill group — special layout (fills middle space)
          if (!td) break;
          var ldGroup = document.createElement('span');
          ldGroup.className = P + '-sum-group ' + P + '-sum-group--fill';
          ldGroup.setAttribute('data-scw-fields', desc.key);
          var ldLabel = document.createElement('span');
          ldLabel.className = P + '-sum-label';
          ldLabel.textContent = desc.label || name;
          ldGroup.appendChild(ldLabel);
          if (_knackEditable) {
            td.classList.add(P + '-sum-field');
            td.classList.add(P + '-sum-field--desc');
            injectSummaryDirectEdit(td, desc.key, { multiline: !!desc.multiline, rows: 1 });
          } else {
            td.classList.add(P + '-sum-field-ro');
            if (desc.multiline) td.classList.add(P + '-sum-field--desc');
            if (isCellEmpty(td)) td.classList.add(P + '-empty');
          }
          ldGroup.appendChild(td);
          target.appendChild(ldGroup);
        } else if (desc.stackWith && viewCfg) {
          // Stacked pair — editable field on top, read-only total below
          if (!td) break;
          var pairDesc = fieldDesc(viewCfg, desc.stackWith);
          var pairTd = pairDesc ? findCell(tr, pairDesc.key, pairDesc.columnIndex) : null;
          var pairGroup = document.createElement('span');
          pairGroup.className = P + '-sum-group ' + P + '-sum-group--stacked-pair'
            + (desc.groupCls ? ' ' + P + '-' + desc.groupCls : '');
          var pairFields = [desc.key];
          if (pairDesc) pairFields.push(pairDesc.key);
          pairGroup.setAttribute('data-scw-fields', pairFields.join(' '));
          // Top: label + editable field
          var topLbl = document.createElement('span');
          topLbl.className = P + '-sum-label';
          topLbl.textContent = desc.label || name;
          pairGroup.appendChild(topLbl);
          if (_knackEditable) {
            td.classList.add(P + '-sum-field');
            injectSummaryDirectEdit(td, desc.key);
          } else {
            td.classList.add(P + '-sum-field-ro');
            if (isCellEmpty(td)) td.classList.add(P + '-empty');
          }
          pairGroup.appendChild(td);
          // Bottom: TTL label + read-only value
          if (pairTd) {
            var btmLbl = document.createElement('span');
            btmLbl.className = P + '-sum-label ' + P + '-sum-label--ttl';
            btmLbl.textContent = pairDesc.label || desc.stackWith;
            pairGroup.appendChild(btmLbl);
            pairTd.classList.add(P + '-sum-field-ro');
            if (isCellEmpty(pairTd)) pairTd.classList.add(P + '-empty');
            pairGroup.appendChild(pairTd);
          }
          target.appendChild(pairGroup);
        } else {
          if (_knackEditable) {
            appendSumGroup(target, desc.label || name, td,
              { cls: desc.groupCls ? (P + '-' + desc.groupCls) : undefined,
                directEdit: true, fieldKey: desc.key });
          } else {
            appendSumGroup(target, desc.label || name, td,
              { cls: desc.groupCls ? (P + '-' + desc.groupCls) : undefined,
                readOnly: true, fieldKey: desc.key });
          }
        }
        break;

      case 'multiChip':
      case 'singleChip':
        if (!td) break;
        var isMulti = (desc.type === 'multiChip');
        var chipsGroup = document.createElement('span');
        chipsGroup.className = P + '-sum-group' + (desc.groupCls ? ' ' + P + '-' + desc.groupCls : '');
        chipsGroup.setAttribute('data-scw-fields', desc.key);
        var chipsLabel = document.createElement('span');
        chipsLabel.className = P + '-sum-label';
        chipsLabel.textContent = desc.label || name;
        chipsGroup.appendChild(chipsLabel);
        // Hide original text content but keep td visible for KTL
        var chipSpan = td.querySelector('span');
        if (chipSpan) { chipSpan.style.display = 'none'; }
        else {
          var chipHidden = document.createElement('span');
          chipHidden.style.display = 'none';
          chipHidden.textContent = readCellText(td);
          td.appendChild(chipHidden);
        }
        var chips = buildRadioChips(td, desc.key, desc.options || [], isMulti);
        if (desc.segmented) chips.classList.add(P + '-segmented');
        chips.classList.add(P + '-sum-chips');
        td.textContent = '';
        if (chipSpan) td.appendChild(chipSpan);
        td.appendChild(chips);
        td.classList.add(P + '-sum-chip-host');
        td.setAttribute(RADIO_CHIPS_ATTR, '1');
        chipsGroup.appendChild(td);
        target.appendChild(chipsGroup);
        break;

      case 'toggleChit':
        if (!td) break;
        var chitVal = (td.textContent || '').replace(/[\u00a0\s]/g, '').trim().toLowerCase();
        var isChitYes = (chitVal === 'yes' || chitVal === 'true');
        // Skip rendering entirely when showOnlyIfYes and value is not yes
        if (desc.showOnlyIfYes && !isChitYes) break;
        var chit = document.createElement('span');
        var chitCls = P + '-cabling-chit ' + (isChitYes ? 'is-yes' : 'is-no');
        if (!desc.feeTrigger) chitCls += ' is-readonly';
        chit.className = chitCls;
        chit.setAttribute('data-field', desc.key);
        chit.innerHTML = desc.chitLabel || 'Existing Cabling';
        var chitSpan = td.querySelector('span');
        if (chitSpan) { chitSpan.style.display = 'none'; }
        td.textContent = '';
        if (chitSpan) td.appendChild(chitSpan);
        td.appendChild(chit);
        td.classList.add(P + '-sum-chip-host');
        td.setAttribute('data-scw-cabling-src', '1');
        var chitWrap = document.createElement('span');
        chitWrap.className = P + '-sum-group ' + P + '-sum-group--cabling';
        chitWrap.setAttribute('data-scw-fields', desc.key);
        var chitLabel = document.createElement('span');
        chitLabel.className = P + '-sum-label';
        chitLabel.innerHTML = '&nbsp;';
        chitWrap.appendChild(chitLabel);
        chitWrap.appendChild(td);
        target.appendChild(chitWrap);
        break;
    }
  }

  function buildSummaryBar(tr, viewCfg) {
    var f = viewCfg.fields;
    var layout = viewCfg.summaryLayout || [];

    var bar = document.createElement('div');
    bar.className = P + '-summary';

    // Detect stacked labels early — needed for vertical alignment of all elements
    // Views can opt out via stackedSummary: false (alignment handled by CSS margin-top)
    var hasStackedFields = viewCfg.stackedSummary !== false && layout.some(function (n) {
      var d = fieldDesc(viewCfg, n);
      return d && d.group === 'right' && d.label;
    });
    if (hasStackedFields) bar.classList.add(P + '-summary--stacked');

    // ── KTL / legacy bulk-edit checkbox (if present) ──
    var checkTd = tr.querySelector('td > input[type="checkbox"]');
    if (checkTd) {
      var checkCell = checkTd.closest('td');
      checkCell.classList.add(P + '-sum-check');
      if (hasStackedFields) {
        // Wrap in column-flex with empty label so checkbox aligns with value row
        var checkWrap = document.createElement('span');
        checkWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;';
        var checkSpacer = document.createElement('span');
        checkSpacer.className = P + '-sum-label';
        checkSpacer.innerHTML = '&nbsp;';
        checkWrap.appendChild(checkSpacer);
        checkWrap.appendChild(checkCell);
        bar.appendChild(checkWrap);
      } else {
        bar.appendChild(checkCell);
      }
    }

    // ── Toggle zone: chevron + identity (label + product) ──
    var toggleZone = document.createElement('span');
    toggleZone.className = P + '-toggle-zone';
    if (hasStackedFields) {
      toggleZone.style.alignSelf = 'flex-start';
      toggleZone.style.alignItems = 'flex-start';
    }

    var chevron = document.createElement('span');
    chevron.className = P + '-chevron ' + P + '-collapsed';
    chevron.innerHTML = CHEVRON_SVG;
    if (hasStackedFields) {
      // Wrap in column-flex with empty label so chevron aligns with value row
      var chevWrap = document.createElement('span');
      chevWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;';
      var chevSpacer = document.createElement('span');
      chevSpacer.className = P + '-sum-label';
      chevSpacer.innerHTML = '&nbsp;';
      chevWrap.appendChild(chevSpacer);
      chevWrap.appendChild(chevron);
      toggleZone.appendChild(chevWrap);
    } else {
      toggleZone.appendChild(chevron);
    }

    // Fixed-width warning slot — always present so layout never shifts
    var warnSlot = document.createElement('span');
    warnSlot.className = P + '-warn-slot';
    if (hasStackedFields) {
      var slotWrap = document.createElement('span');
      slotWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;';
      var slotSpacer = document.createElement('span');
      slotSpacer.className = P + '-sum-label';
      slotSpacer.innerHTML = '&nbsp;';
      slotWrap.appendChild(slotSpacer);
      slotWrap.appendChild(warnSlot);
      toggleZone.appendChild(slotWrap);
    } else {
      toggleZone.appendChild(warnSlot);
    }

    var identity = document.createElement('span');
    identity.className = P + '-identity';

    // Warning chit — always reserve space so layout stays consistent;
    // hidden (visibility:hidden) when count is 0.
    var warnDesc = fieldDesc(viewCfg, 'warningCount');
    if (warnDesc) {
      var warnTd = findCell(tr, warnDesc.key);
      var warnVal = warnTd ? parseFloat((warnTd.textContent || '').replace(/[^0-9.-]/g, '')) : 0;
      var warnChit = document.createElement('span');
      warnChit.className = P + '-warn-chit';
      if (warnVal > 0) {
        warnChit.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 9.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.507l-3.22-3.22a.75.75 0 00-1.06 0l-3.22 3.22-1.72-1.72a.75.75 0 00-1.06 0L2.5 12.993v1.757zM12.75 7a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clip-rule="evenodd"/></svg>'
            + Math.round(warnVal);
      } else {
        warnChit.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 9.5c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.507l-3.22-3.22a.75.75 0 00-1.06 0l-3.22 3.22-1.72-1.72a.75.75 0 00-1.06 0L2.5 12.993v1.757zM12.75 7a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z" clip-rule="evenodd"/></svg>0';
        warnChit.style.visibility = 'hidden';
      }
      identity.appendChild(warnChit);
    }

    var labelDesc = fieldDesc(viewCfg, 'label');
    if (labelDesc) {
      var labelTd = findCell(tr, labelDesc.key, labelDesc.columnIndex);
      if (labelTd) {
        labelTd.classList.add(P + '-sum-label-cell');
        identity.appendChild(labelTd);
      }
    }

    var productDesc = fieldDesc(viewCfg, 'product');
    if (productDesc && productDesc.summary) {
      var productTd = findCell(tr, productDesc.key, productDesc.columnIndex);
      if (productTd) {
        var sep0 = document.createElement('span');
        sep0.className = P + '-sum-sep';
        sep0.textContent = '\u00b7';
        identity.appendChild(sep0);

        var productGroup = document.createElement('span');
        productGroup.className = P + '-product-group';
        // Apply layout-driven classes
        var pgLayout = viewCfg.layout || {};
        if (pgLayout.productGroupLayout === 'column') {
          productGroup.classList.add(P + '-product-group--column');
        }
        if (pgLayout.productGroupWidth === 'flex') {
          productGroup.classList.add(P + '-product-group--flex');
        }
        productGroup.setAttribute('data-scw-fields', productDesc.key);

        // Empty label so product aligns vertically with editable field values
        // Only needed when there's no label-cell; when there IS a
        // label-cell (view_3313) the identity wrapper handles alignment.
        if (hasStackedFields && !labelDesc) {
          var prodLabel = document.createElement('span');
          prodLabel.className = P + '-sum-label';
          prodLabel.innerHTML = '&nbsp;';
          productGroup.appendChild(prodLabel);
        }

        productTd.classList.add(P + '-sum-product');
        if (pgLayout.productEditable) {
          productTd.classList.add(P + '-sum-product--editable');
        }

        // view_3596: qty badge — rendered in rightGroup below
        var qtyBadgeVal = 0;
        if (viewCfg.qtyBadgeField) {
          var qtyCell = findCell(tr, viewCfg.qtyBadgeField);
          if (qtyCell) {
            qtyBadgeVal = parseInt((qtyCell.textContent || '').trim(), 10) || 0;
          }
        }

        productGroup.appendChild(productTd);

        // Render identity-grouped fields below the product
        // Text fields (readOnly/directEdit) render as block text;
        // chits collect into a single inline-flex row.
        // Scan ALL fields (not just summaryLayout) for identity group.
        var idChits = [];
        var fieldNames = Object.keys(viewCfg.fields);
        for (var ig = 0; ig < fieldNames.length; ig++) {
          var igDesc = fieldDesc(viewCfg, fieldNames[ig]);
          if (!igDesc || igDesc.group !== 'identity') continue;

          if (igDesc.type === 'toggleChit') {
            // Collect chits for the inline row below
            var chitTd = findCell(tr, igDesc.key, igDesc.columnIndex);
            if (chitTd) {
              var chitText = (chitTd.textContent || '').replace(/[\u00a0\s]/g, '').trim().toLowerCase();
              if (chitText === 'yes' || chitText === 'true') {
                idChits.push({ name: layout[ig], desc: igDesc });
              }
            }
          } else {
            // Text field — render as a block element directly in productGroup
            var idTd = findCell(tr, igDesc.key, igDesc.columnIndex);
            if (idTd && !isCellEmpty(idTd)) {
              idTd.style.cssText = 'display:block;font-size:13px;font-weight:400;color:#374151;' +
                'white-space:normal;word-break:break-word;line-height:1.4;margin-top:2px;padding:0;' +
                'border:none;background:transparent;';
              productGroup.appendChild(idTd);
            }
          }
        }
        if (idChits.length) {
          var idRow = document.createElement('span');
          idRow.style.cssText = 'display:inline-flex;gap:4px;margin-top:4px;flex-wrap:wrap;';
          for (var idf = 0; idf < idChits.length; idf++) {
            renderSummaryField(idRow, tr, idChits[idf].name, idChits[idf].desc, viewCfg);
          }
          if (idRow.childNodes.length) productGroup.appendChild(idRow);
        }

        identity.appendChild(productGroup);
      }
    }

    if (hasStackedFields && labelDesc) {
      // Wrap entire identity so label-cell, separator, and product all
      // drop down together — keeps them aligned with checkbox & chevron.
      var idWrap = document.createElement('span');
      idWrap.style.cssText = 'display:inline-flex;flex-direction:column;align-self:flex-start;';
      var idSpacer = document.createElement('span');
      idSpacer.className = P + '-sum-label';
      idSpacer.innerHTML = '&nbsp;';
      idWrap.appendChild(idSpacer);
      idWrap.appendChild(identity);
      toggleZone.appendChild(idWrap);
    } else {
      toggleZone.appendChild(identity);
    }
    bar.appendChild(toggleZone);

    // ── Walk summaryLayout: dispatch each field to its type builder ──
    var rightGroup = document.createElement('span');
    rightGroup.className = P + '-sum-right';

    for (var i = 0; i < layout.length; i++) {
      var name = layout[i];
      var desc = fieldDesc(viewCfg, name);
      if (!desc || !desc.summary) continue;

      // Skip identity-grouped fields (rendered inside product group above)
      if (desc.group === 'identity') continue;
      // Route to the right container based on group
      var container = (desc.group === 'fill' || desc.group === 'pre') ? bar : rightGroup;
      renderSummaryField(container, tr, name, desc, viewCfg);
    }

    // ── Qty badge (far right, before move/delete) ──
    if (qtyBadgeVal > 1) {
      var qtyTd = document.createElement('td');
      qtyTd.textContent = qtyBadgeVal;
      appendSumGroup(rightGroup, 'Quantity', qtyTd, { readOnly: true, cls: P + '-sum-group--qty-badge' });
    }

    // ── Move icon (structural — always last before delete) ──
    var moveDesc = fieldDesc(viewCfg, 'move');
    if (moveDesc && moveDesc.type === 'moveIcon') {
      var moveTd = findCell(tr, moveDesc.key);
      if (moveTd) {
        if (!moveTd.querySelector('.fa-server')) {
          moveTd.innerHTML =
            '<span style="display:inline-flex; align-items:center; justify-content:center; gap:4px; vertical-align:middle;">' +
              '<i class="fa fa-server" aria-hidden="true" title="Changing Location" style="font-size:22px; line-height:1;"></i>' +
              '<span style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center; gap:0; line-height:1;">' +
                '<i class="fa fa-level-up" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
                '<i class="fa fa-level-down" aria-hidden="true" style="font-size:14px; line-height:1; display:block; color:rgba(237,131,38,1);"></i>' +
              '</span>' +
            '</span>';
        }
        moveTd.classList.add(P + '-sum-move');
        var moveWrap = document.createElement('span');
        moveWrap.className = P + '-sum-group ' + P + '-sum-group--move';
        var moveLabel = document.createElement('span');
        moveLabel.className = P + '-sum-label';
        moveLabel.innerHTML = '&nbsp;';
        moveWrap.appendChild(moveLabel);
        moveWrap.appendChild(moveTd);
        rightGroup.appendChild(moveWrap);
      }
    }

    // ── Delete link (if Knack provides one in this grid) ──
    var deleteLink = tr.querySelector('a.kn-link-delete');
    if (deleteLink) {
      var deleteTd = deleteLink.closest('td');

      var deleteWrap = document.createElement('span');
      deleteWrap.className = P + '-sum-delete';
      deleteWrap.appendChild(deleteLink);
      if (hasStackedFields) {
        var delCol = document.createElement('span');
        delCol.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;align-self:flex-start;';
        var delSpacer = document.createElement('span');
        delSpacer.className = P + '-sum-label';
        delSpacer.innerHTML = '&nbsp;';
        delCol.appendChild(delSpacer);
        delCol.appendChild(deleteWrap);
        rightGroup.appendChild(delCol);
      } else {
        rightGroup.appendChild(deleteWrap);
      }
      if (deleteTd && !deleteTd.children.length) {
        deleteTd.style.display = 'none';
      }
    }

    bar.appendChild(rightGroup);

    return bar;
  }

  // ============================================================
  // BUILD DETAIL PANEL (data-driven from detailLayout)
  // ============================================================

  // Label map for detail rows — maps field names to display labels.
  // Falls back to a prettified version of the field name if not listed.
  var DETAIL_LABELS = {
    mounting:         'Mounting\nHardware',
    mountingHardware: 'Mounting\nHardware',
    connections:      'Connected to',
    connectedDevice:  'Connected\nDevice',
    scwNotes:         'SCW Notes',
    surveyNotes:      'Survey\nNotes',
    exterior:         'Exterior',
    existingCabling:  'Existing Cabling',
    plenum:           'Plenum',
    mountingHeight:   'Mounting\nHeight',
    dropLength:       'Drop Length',
    conduitFeet:      'Conduit Ft',
    mdfIdf:           'MDF/IDF',
    mdfNumber:        '##',
    name:             'Name',
    dropPrefix:       'Drop Prefix',
    dropNumber:       'Label #',
    laborDescription: 'Labor\nDesc',
    retailPrice:      'Retail Price',
    quantity:         'Qty',
    customDiscPct:    'Custom\nDisc %',
    discountDlr:      'Line Item Discount %',
    appliedDiscount:  'Applied\nDiscount',
    total:            'Total'
  };

  /** Render a single field into a detail section based on its descriptor type. */
  function renderDetailField(section, tr, name, desc, viewId) {
    var td = findCell(tr, desc.key, desc.columnIndex);
    var label = DETAIL_LABELS[name] || desc.label || name;

    switch (desc.type) {
      case 'readOnly':
        // Strip inline-edit affordance — this field is read-only
        if (td) {
          td.classList.remove('cell-edit', 'ktlInlineEditableCellsStyle');
        }
        var row = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty, notes: !!desc.notes });
        if (row) section.appendChild(row);
        break;

      case 'nativeEdit':
        // Preserve Knack's native inline-edit (cell-edit class stays).
        // Used for connection fields that open Knack's modal picker.
        var neRow = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty, notes: !!desc.notes });
        if (neRow) section.appendChild(neRow);
        break;

      case 'directEdit':
        // Editable if Knack/KTL has cell-edit on the td, or if the field
        // is flagged alwaysEditable (and not locked by conditional modules).
        var _detailEditable = isCellEditable(td)
          || (desc.alwaysEditable && td && !isCellLocked(td));
        if (!_detailEditable) {
          var roRow = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty, notes: !!desc.notes });
          if (roRow) section.appendChild(roRow);
        } else {
          if (desc.skipEmpty && (!td || isCellEmpty(td))) break;
          var editRow = buildEditableFieldRow(label, td, desc.key, { notes: !!desc.notes });
          if (editRow) section.appendChild(editRow);
        }
        break;

      case 'singleChip':
      case 'multiChip':
        var chipRow = buildRadioChipRow(label, td, desc.key, desc.options || [], desc.type === 'multiChip', { segmented: !!desc.segmented });
        if (chipRow) section.appendChild(chipRow);
        break;

      case 'connectedRecords':
        // Connected records widget (e.g. mounting hardware in view_3313)
        if (window.SCW && SCW.connectedRecords && typeof SCW.connectedRecords.buildWidget === 'function') {
          var recordId = getRecordId(tr);
          var crWidget = SCW.connectedRecords.buildWidget(viewId, recordId, desc.key, tr);
          if (crWidget) {
            section.appendChild(crWidget);
          } else {
            var crFallback = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty });
            if (crFallback) section.appendChild(crFallback);
          }
        } else {
          var crFallback2 = buildFieldRow(label, td, { skipEmpty: !!desc.skipEmpty });
          if (crFallback2) section.appendChild(crFallback2);
        }
        break;

      case 'chipStack':
        // Boolean chip stack (exterior/cabling/plenum) injected by boolean-chips.js
        if (!td || td.classList.contains(GRAYED_CLASS)) break;
        var chipStack = td.querySelector('.scw-chip-stack');
        if (chipStack) {
          var chipFieldRow = document.createElement('div');
          chipFieldRow.className = P + '-field';

          var chipLabel = document.createElement('div');
          chipLabel.className = P + '-field-label';
          chipLabel.textContent = '';
          chipFieldRow.appendChild(chipLabel);

          td.classList.add(P + '-chip-host');
          td.classList.add(P + '-field-value');
          td.innerHTML = '';
          var chipsRow = document.createElement('div');
          chipsRow.className = P + '-chips';
          while (chipStack.firstChild) {
            chipsRow.appendChild(chipStack.firstChild);
          }
          td.appendChild(chipsRow);
          chipFieldRow.appendChild(td);
          section.appendChild(chipFieldRow);
        } else {
          var fallbackRow = buildFieldRow(label, td);
          if (fallbackRow) section.appendChild(fallbackRow);
        }
        break;
    }
  }

  function buildDetailPanel(tr, viewCfg) {
    var layout = viewCfg.detailLayout;
    if (!layout) return null;

    var detail = document.createElement('div');
    detail.className = P + '-detail';

    var sections = document.createElement('div');
    sections.className = P + '-sections';

    var sides = ['left', 'center', 'right'];
    for (var s = 0; s < sides.length; s++) {
      var side = sides[s];
      var fieldNames = layout[side];
      if (!fieldNames || !fieldNames.length) continue;

      var section = buildSection('');

      for (var i = 0; i < fieldNames.length; i++) {
        var name = fieldNames[i];
        var desc = fieldDesc(viewCfg, name);
        if (!desc) continue;
        renderDetailField(section, tr, name, desc, viewCfg.viewId);
      }

      sections.appendChild(section);
    }

    detail.appendChild(sections);
    return detail;
  }

  // ============================================================
  // BUILD COMPARISON DETAIL PANEL (view_3575)
  // ============================================================
  //
  // Side-by-side layout: Label | SCW Bid value | Survey value
  // for quick visual discrepancy identification.
  //
  // `snapshots` contains text values for fields that were already
  // moved into the summary bar (label, product).

  function buildComparisonDetailPanel(tr, viewCfg, snapshots) {
    // Resolve field keys from descriptors
    var f = {};
    Object.keys(viewCfg.fields).forEach(function (name) {
      var desc = viewCfg.fields[name];
      f[name] = typeof desc === 'string' ? desc : desc.key;
    });

    var detail = document.createElement('div');
    detail.className = P + '-detail';

    var comp = document.createElement('div');
    comp.className = P + '-comp';

    // ── Column headers ──
    var hdr = document.createElement('div');
    hdr.className = P + '-comp-header';
    var hdrLabel = document.createElement('div');
    hdrLabel.className = P + '-comp-label';
    hdr.appendChild(hdrLabel);
    var hdrScw = document.createElement('div');
    hdrScw.textContent = 'SCW Bid';
    hdr.appendChild(hdrScw);
    var hdrSurvey = document.createElement('div');
    hdrSurvey.textContent = 'Survey';
    hdr.appendChild(hdrSurvey);
    comp.appendChild(hdr);

    // ── Helper: build a standard comparison row ──
    function addCompRow(label, scwTd, surveyTd, opts) {
      opts = opts || {};
      var row = document.createElement('div');
      row.className = P + '-comp-row';

      // Label column
      var lbl = document.createElement('div');
      lbl.className = P + '-comp-label';
      lbl.textContent = label;
      row.appendChild(lbl);

      // SCW value column
      var scwVal = document.createElement('div');
      scwVal.className = P + '-comp-val';
      var scwText = '';
      if (scwTd && !scwTd.classList.contains(GRAYED_CLASS)) {
        scwText = readCellText(scwTd);
        scwTd.classList.add(P + '-field-value');
        if (opts.notes) scwTd.classList.add(P + '-field-value--notes');
        scwVal.appendChild(scwTd);
      } else if (opts.scwSnapshot != null) {
        scwText = opts.scwSnapshot;
        var span = document.createElement('span');
        span.className = P + '-comp-text' + (scwText ? '' : ' ' + P + '-comp-text--empty');
        span.textContent = scwText || '\u2014';
        scwVal.appendChild(span);
      } else {
        scwVal.innerHTML = '<span class="' + P + '-comp-text ' + P + '-comp-text--empty">\u2014</span>';
      }
      row.appendChild(scwVal);

      // Survey value column
      var survVal = document.createElement('div');
      survVal.className = P + '-comp-val';
      var survText = '';
      if (surveyTd && !surveyTd.classList.contains(GRAYED_CLASS)) {
        survText = readCellText(surveyTd);
        surveyTd.classList.add(P + '-field-value');
        if (opts.notes) surveyTd.classList.add(P + '-field-value--notes');
        survVal.appendChild(surveyTd);
      } else if (!opts.emptyRight) {
        survVal.innerHTML = '<span class="' + P + '-comp-text ' + P + '-comp-text--empty">\u2014</span>';
      }
      row.appendChild(survVal);

      // Mismatch highlight (when both sides have comparable values)
      if (!opts.skipMismatch && scwText && survText &&
          scwText.toLowerCase() !== survText.toLowerCase()) {
        row.classList.add(P + '-comp-mismatch');
      }

      comp.appendChild(row);
      return row;
    }

    // ── LABEL ──
    addCompRow('Label',
      findCell(tr, f.label),          // may be null if summary took it
      findCell(tr, f.surveyLabel),
      { scwSnapshot: snapshots.label }
    );

    // ── PRODUCT ──
    addCompRow('Product',
      findCell(tr, f.product),        // may be null if summary took it
      findCell(tr, f.surveyProduct),
      { scwSnapshot: snapshots.product }
    );

    // ── CONNECTED TO ──
    addCompRow('Connected To',
      findCell(tr, f.connections),
      findCell(tr, f.surveyConnections)
    );

    // ── DROP LENGTH ──
    addCompRow('Drop Length',
      findCell(tr, f.dropLength),
      findCell(tr, f.surveyDropLength)
    );

    // ── BOOLEAN CHIPS (unlabelled) ──
    // SCW side: reconstituted chip stack (exterior / existing cabling / plenum)
    // Survey side: field_1972 (TBD placeholder)
    var chipsRow = document.createElement('div');
    chipsRow.className = P + '-comp-row';

    var chipsLabel = document.createElement('div');
    chipsLabel.className = P + '-comp-label';
    chipsLabel.textContent = '';
    chipsRow.appendChild(chipsLabel);

    // SCW chips
    var chipsScwVal = document.createElement('div');
    chipsScwVal.className = P + '-comp-val';
    var chipHostTd = findCell(tr, f.exterior);
    if (chipHostTd && !chipHostTd.classList.contains(GRAYED_CLASS)) {
      var chipStack = chipHostTd.querySelector('.scw-chip-stack');
      if (chipStack) {
        chipHostTd.classList.add(P + '-chip-host');
        chipHostTd.classList.add(P + '-field-value');
        chipHostTd.innerHTML = '';
        var chipsWrap = document.createElement('div');
        chipsWrap.className = P + '-chips';
        while (chipStack.firstChild) {
          chipsWrap.appendChild(chipStack.firstChild);
        }
        chipHostTd.appendChild(chipsWrap);
        chipsScwVal.appendChild(chipHostTd);
      } else {
        chipHostTd.classList.add(P + '-field-value');
        chipsScwVal.appendChild(chipHostTd);
      }
    }
    chipsRow.appendChild(chipsScwVal);

    // Survey chips placeholder
    var chipsSurvVal = document.createElement('div');
    chipsSurvVal.className = P + '-comp-val';
    var surveyChipsTd = findCell(tr, f.surveyChips);
    if (surveyChipsTd && !surveyChipsTd.classList.contains(GRAYED_CLASS)) {
      surveyChipsTd.classList.add(P + '-field-value');
      chipsSurvVal.appendChild(surveyChipsTd);
    } else {
      chipsSurvVal.innerHTML = '<span class="' + P + '-comp-text ' + P + '-comp-text--empty">\u2014</span>';
    }
    chipsRow.appendChild(chipsSurvVal);
    comp.appendChild(chipsRow);

    // ── MOUNT HEIGHT (radio chips, SCW only) ──
    var mhRow = document.createElement('div');
    mhRow.className = P + '-comp-row';

    var mhLabel = document.createElement('div');
    mhLabel.className = P + '-comp-label';
    mhLabel.textContent = 'Mount Height';
    mhRow.appendChild(mhLabel);

    var mhScwVal = document.createElement('div');
    mhScwVal.className = P + '-comp-val';
    var mhTd = findCell(tr, f.mountingHeight);
    if (mhTd && !mhTd.classList.contains(GRAYED_CLASS)) {
      var mhWrapper = document.createElement('div');
      mhWrapper.className = P + '-field-value';
      mhWrapper.style.border = 'none';
      mhWrapper.style.padding = '0';
      mhWrapper.style.background = 'transparent';
      var mhDesc = fieldDesc(viewCfg, 'mountingHeight');
      var mhOpts = (mhDesc && mhDesc.options) || ["Under 16'", "16' - 24'", "Over 24'"];
      var mhChips = buildRadioChips(mhTd, f.mountingHeight, mhOpts);
      mhWrapper.appendChild(mhChips);
      mhTd.style.display = 'none';
      mhTd.setAttribute(RADIO_CHIPS_ATTR, '1');
      mhWrapper.appendChild(mhTd);
      mhScwVal.appendChild(mhWrapper);
    }
    mhRow.appendChild(mhScwVal);

    var mhSurvVal = document.createElement('div');
    mhSurvVal.className = P + '-comp-val';
    mhRow.appendChild(mhSurvVal);
    comp.appendChild(mhRow);

    // ── CONDUIT FEET (SCW only) ──
    addCompRow('Conduit Feet',
      findCell(tr, f.conduitFeet),
      null,
      { emptyRight: true }
    );

    // ── SURVEY NOTES ──
    addCompRow('Survey Notes',
      findCell(tr, f.scwNotes),
      findCell(tr, f.surveyNotes),
      { notes: true }
    );

    detail.appendChild(comp);
    return detail;
  }

  // (buildSimpleDetailPanel removed — merged into generic buildDetailPanel)

  // ============================================================
  // ACCORDION TOGGLE
  // ============================================================

  function toggleDetail(wsTr) {
    var detail = wsTr.querySelector('.' + P + '-detail');
    var chevron = wsTr.querySelector('.' + P + '-chevron');
    if (!detail) return;

    var isOpen = detail.classList.contains(P + '-open');

    var keepPhoto = wsTr.hasAttribute('data-scw-photo-always');

    if (isOpen) {
      // Collapse
      detail.classList.remove(P + '-open');
      if (chevron) {
        chevron.classList.remove(P + '-expanded');
        chevron.classList.add(P + '-collapsed');
      }
      // Hide the in-card photo wrapper on collapse.
      // For photoAlwaysVisible views, only keep it visible if there are
      // actual uploaded images (not just required placeholders / "+ Add").
      var hasRealPhotos = false;
      if (keepPhoto) {
        var pw = wsTr.querySelector('.' + P + '-photo-wrap');
        hasRealPhotos = pw && pw.querySelector('.scw-inline-photo-card[data-photo-has-image="true"]');
      }
      if (!keepPhoto || !hasRealPhotos) {
        var photoWrap = wsTr.querySelector('.' + P + '-photo-wrap');
        if (photoWrap) photoWrap.classList.add(P + '-photo-hidden');
        // Legacy: also hide sibling photo row if not absorbed
        var photoRow = wsTr.nextElementSibling;
        if (photoRow && photoRow.classList.contains('scw-inline-photo-row')) {
          photoRow.classList.add(P + '-photo-hidden');
        }
      }
    } else {
      // Expand
      detail.classList.add(P + '-open');
      if (chevron) {
        chevron.classList.remove(P + '-collapsed');
        chevron.classList.add(P + '-expanded');
      }
      // Show the in-card photo wrapper
      var photoWrap2 = wsTr.querySelector('.' + P + '-photo-wrap');
      if (photoWrap2) photoWrap2.classList.remove(P + '-photo-hidden');
      // Legacy: also show sibling photo row if not absorbed
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

    // For comparison layouts, snapshot field text values that appear
    // in both the summary and detail BEFORE the summary moves them.
    var snapshots = null;
    if (viewCfg.comparisonLayout) {
      snapshots = {};
      var labelK = fieldKey(viewCfg, 'label');
      var prodK  = fieldKey(viewCfg, 'product');
      var prodDesc = fieldDesc(viewCfg, 'product');
      if (labelK) snapshots.label   = readCellText(findCell(tr, labelK));
      if (prodK)  snapshots.product = readCellText(findCell(tr, prodK, prodDesc ? prodDesc.columnIndex : undefined));
    }

    // Pre-clone cells whose field key appears in BOTH the summary and
    // detail layouts.  The summary builder moves the original <td> out of
    // the <tr>, so the detail builder would find nothing.  Cloned cells
    // are appended (hidden) to the <tr> so findCell still works for the
    // detail pass.
    var _sharedClones = [];
    if (viewCfg.detailLayout && viewCfg.summaryLayout) {
      var summaryKeys = {};
      viewCfg.summaryLayout.forEach(function (n) {
        var d = fieldDesc(viewCfg, n);
        if (d) summaryKeys[d.key] = true;
      });
      var sides = ['left', 'center', 'right'];
      for (var si = 0; si < sides.length; si++) {
        var names = (viewCfg.detailLayout[sides[si]] || []);
        for (var di = 0; di < names.length; di++) {
          var dd = fieldDesc(viewCfg, names[di]);
          if (dd && summaryKeys[dd.key]) {
            var origTd = findCell(tr, dd.key, dd.columnIndex);
            if (origTd) {
              var clone = origTd.cloneNode(true);
              clone.style.display = 'none';
              _sharedClones.push(clone);
              tr.appendChild(clone);
            }
          }
        }
      }
    }

    // Summary bar (always visible)
    var summary = buildSummaryBar(tr, viewCfg);
    card.appendChild(summary);

    // Un-hide cloned cells so the detail builder can render them normally
    for (var ci = 0; ci < _sharedClones.length; ci++) {
      _sharedClones[ci].style.display = '';
    }

    // Detail panel (expandable)
    var detail;
    if (viewCfg.comparisonLayout) {
      detail = buildComparisonDetailPanel(tr, viewCfg, snapshots);
    } else {
      detail = buildDetailPanel(tr, viewCfg);
    }
    if (detail) card.appendChild(detail);

    // ── Accessory mismatch header warning ──
    // If any connected-records widget flagged a warning, place icon in the
    // fixed-width warn-slot (between chevron and identity) so it never shifts layout.
    var crWidgets = card.querySelectorAll('.scw-ws-field > .scw-cr-list');
    for (var w = 0; w < crWidgets.length; w++) {
      var parentField = crWidgets[w].parentElement;
      if (parentField && parentField._hasWarning) {
        var warnIcon = document.createElement('span');
        warnIcon.className = 'scw-cr-hdr-warning';
        warnIcon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        warnIcon.title = 'Accessory mismatch — one or more accessories do not match parent product';

        var slot = card.querySelector('.' + P + '-warn-slot');
        if (slot) slot.appendChild(warnIcon);
        break;
      }
    }

    // ── Apply bucket-based field hiding + label injection ──
    applyBucketRules(card, tr, viewCfg);

    // ── Apply conditional field hiding (e.g. hide totals when qty=1) ──
    applyConditionalHide(card, tr, viewCfg);

    // ── Apply showWhenFieldIsYes visibility ──
    var fNames = Object.keys(viewCfg.fields);
    for (var swi = 0; swi < fNames.length; swi++) {
      var swDesc = viewCfg.fields[fNames[swi]];
      if (!swDesc.showWhenFieldIsYes) continue;
      var guardTd = tr.querySelector('td.' + swDesc.showWhenFieldIsYes)
                 || card.querySelector('td[data-field-key="' + swDesc.showWhenFieldIsYes + '"]');
      var guardVal = guardTd ? (guardTd.textContent || '').replace(/[\u00a0\s]/g, '').trim().toLowerCase() : '';
      if (guardVal !== 'yes' && guardVal !== 'true') {
        var targetGroup = card.querySelector('[data-scw-fields="' + swDesc.key + '"]');
        if (targetGroup) targetGroup.style.display = 'none';
      }
    }

    return card;
  }

  // ============================================================
  // TRANSFORM VIEW
  // ============================================================

  function transformView(viewCfg) {
    if (viewCfg.disabled) return;
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;

    var table = $view.find('table.kn-table-table, table.kn-table')[0];
    if (!table) return;

    table.classList.remove('is-striped', 'ktlTable--rowHover', 'is-bordered', 'can-overflow-x');

    // Also remove can-overflow-x from table wrapper div if present
    var tableWrapper = table.parentElement;
    if (tableWrapper) tableWrapper.classList.remove('can-overflow-x');

    var thead = table.querySelector('thead');
    if (thead) thead.style.display = '';

    var $rows = $(table).find('tbody > tr');

    // ── Hoist colCount — same for every row, no need to recompute ──
    // Must run BEFORE thead reordering so colspan reflects full column count.
    var headerRow = table.querySelector('thead tr');
    var colCount = 1;
    if (headerRow) {
      colCount = 0;
      var hCells = headerRow.children;
      for (var ci = 0; ci < hCells.length; ci++) {
        colCount += parseInt(hCells[ci].getAttribute('colspan') || '1', 10);
      }
    }

    // ── Reorder & filter <thead> columns to match summary bar layout ──
    // Width application is deferred until after PHASE 3 so we can measure
    // the actual rendered summary-bar group widths instead of guessing.
    // (thead columns are content-width only — no measured-width lock)

    if (headerRow) {
      var L = viewCfg.layout;

      // Build desired field-key order + labels from view config:
      //   [checkbox] [label] [product] [summaryLayout fields...] [move]
      var desiredFields = [];
      var thLabels = {};   // field_key → display label

      var _labelDesc = fieldDesc(viewCfg, 'label');
      if (_labelDesc) desiredFields.push(_labelDesc.key);

      var _productDesc = fieldDesc(viewCfg, 'product');
      if (_productDesc) desiredFields.push(_productDesc.key);

      var _summaryLayout = viewCfg.summaryLayout || [];
      for (var si = 0; si < _summaryLayout.length; si++) {
        var _name = _summaryLayout[si];
        var _desc = fieldDesc(viewCfg, _name);
        if (!_desc || desiredFields.indexOf(_desc.key) !== -1) continue;
        desiredFields.push(_desc.key);
        if (_desc.label) thLabels[_desc.key] = _desc.label;
      }

      var _moveDesc = fieldDesc(viewCfg, 'move');
      if (_moveDesc) desiredFields.push(_moveDesc.key);

      // Index <th> elements by field key
      var thByField = {};
      var checkboxTh = null;
      var allThs = [];
      for (var ti = headerRow.children.length - 1; ti >= 0; ti--) {
        allThs.unshift(headerRow.children[ti]);
      }

      for (var tj = 0; tj < allThs.length; tj++) {
        var _th = allThs[tj];
        if (_th.classList.contains('ktlCheckboxHeaderCell')) {
          checkboxTh = _th;
          continue;
        }
        var _cls = _th.className.split(/\s+/);
        var _fk = null;
        for (var tc = 0; tc < _cls.length; tc++) {
          var _c = _cls[tc];
          if (_c.indexOf('field_') === 0) {
            _fk = _c.indexOf(':') !== -1 ? _c.substring(0, _c.indexOf(':')) : _c;
            break;
          }
        }
        if (_fk) thByField[_fk] = _th;
      }

      // Hide all non-checkbox <th>s, then show + reorder desired ones
      for (var tk = 0; tk < allThs.length; tk++) {
        if (allThs[tk] !== checkboxTh) allThs[tk].style.display = 'none';
      }

      thead.classList.add(P + '-thead-styled');

      if (checkboxTh) headerRow.appendChild(checkboxTh);

      for (var di = 0; di < desiredFields.length; di++) {
        var _fKey = desiredFields[di];
        if (_fKey === 'field_1946') continue; // hide move/MDF field from sort header
        var _showTh = thByField[_fKey];
        if (!_showTh) continue;

        _showTh.style.display = '';
        _showTh.style.width = '';
        _showTh.style.minWidth = '';
        _showTh.style.maxWidth = '';

        // Inject bulk-edit checkbox into field_1984 (Exterior Mounting)
        // KTL doesn't add one but it should match field_2461 (Existing Cabling)
        if (_fKey === 'field_1984') {
          var _fl = _showTh.querySelector('.table-fixed-label');
          if (_fl && !_fl.querySelector('.bulkEditHeaderCbox')) {
            _fl.classList.add('bulkEditTh');
            _fl.style.display = 'inline-flex';
            var _cb = document.createElement('input');
            _cb.type = 'checkbox';
            _cb.className = 'ktlCheckbox bulkEditHeaderCbox ktlDisplayNone ktlCheckbox-header ktlCheckbox-table ktlCheckbox-bulkops bulkEditCb';
            _cb.setAttribute('aria-label', 'Select column');
            _cb.setAttribute('data-ktl-bulkops', '1');
            _fl.appendChild(_cb);
          }
        }

        // Rename label to match summary bar display name
        var _tl = thLabels[_fKey];
        if (_tl) {
          var _labelSpan = _showTh.querySelector('.kn-sort > span');
          if (!_labelSpan) _labelSpan = _showTh.querySelector('.table-fixed-label > span');
          if (_labelSpan) _labelSpan.textContent = _tl;
        }

        headerRow.appendChild(_showTh);
      }

      // ── Sync header checkbox visibility with row selections ──
      // KTL's own listeners break when we reorder <th> elements.
      // Watch for any checkbox change in the entire view and toggle
      // ktlDisplayNone on header bulk-edit checkboxes accordingly.
      (function (viewEl, hRow) {
        function syncHeaderCboxes() {
          // Any selection checkbox checked? (row-level, group-level, or master)
          var anyChecked = viewEl.querySelector(
            'input.ktlCheckbox:checked'
          );
          var hCboxes = hRow.querySelectorAll('.bulkEditHeaderCbox');
          for (var ci = 0; ci < hCboxes.length; ci++) {
            if (anyChecked) {
              hCboxes[ci].classList.remove('ktlDisplayNone');
            } else {
              hCboxes[ci].classList.add('ktlDisplayNone');
            }
          }
        }
        $($view).off('change.scwBulkSync').on('change.scwBulkSync', 'input[type="checkbox"]', syncHeaderCboxes);
      })($view[0], headerRow);

    }

    // ── PHASE 1: READ — filter eligible rows, collect DOM-read data ──
    //
    // Conditional cell colors (danger/warning) are now computed from
    // field values using evaluateConditionalColor() instead of reading
    // getComputedStyle() on each td.  This eliminates ALL forced style
    // recalculations from the render path — the color is derived from
    // pure logic (field key + text value), not from the browser's
    // computed style resolution.
    //
    // Bucket and move-field info are also collected here (DOM tree
    // reads with no layout cost) so Phase 2 can build cards without
    // any reads from the live document.
    var eligible = [];

    $rows.each(function () {
      var tr = this;
      if (tr.classList.contains('kn-table-group')) return;
      if (tr.classList.contains('scw-inline-photo-row')) return;
      if (tr.classList.contains(WORKSHEET_ROW)) return;
      if (!getRecordId(tr)) return;
      if (tr.getAttribute(PROCESSED_ATTR) === '1') return;

      // Pre-read bucket and move-field info (DOM reads, no layout cost)
      var preBucketRowClass = '';
      if (viewCfg.bucketField && viewCfg.bucketRules) {
        var rowBucketId = readBucketId(tr, viewCfg.bucketField);
        var rowBucketRule = rowBucketId ? viewCfg.bucketRules[rowBucketId] : null;
        if (rowBucketRule && rowBucketRule.rowClass) {
          preBucketRowClass = rowBucketRule.rowClass;
        }
      }
      var hasNoMove = false;
      if (viewCfg.syntheticBucketGroups) {
        var prev = tr.previousElementSibling;
        while (prev && !prev.classList.contains('kn-table-group')) {
          prev = prev.previousElementSibling;
        }
        if (!prev) {
          hasNoMove = true;
        } else {
          hasNoMove = getGroupLabelText(prev).length === 0;
        }
      }

      eligible.push({ tr: tr, bucketCls: preBucketRowClass, hasNoMove: hasNoMove });
    });

    // ── Sort eligible rows by field_2218 (ascending), then field_1960 (descending) ──
    eligible.sort(function (a, b) {
      var tdA = a.tr.querySelector('td.field_2218');
      var tdB = b.tr.querySelector('td.field_2218');
      var vA = tdA ? parseFloat((tdA.textContent || '').replace(/[^0-9.\-]/g, '')) : Infinity;
      var vB = tdB ? parseFloat((tdB.textContent || '').replace(/[^0-9.\-]/g, '')) : Infinity;
      if (isNaN(vA)) vA = Infinity;
      if (isNaN(vB)) vB = Infinity;
      if (vA !== vB) return vA - vB;

      // Tiebreaker: field_1960 descending (highest first)
      var pA = a.tr.querySelector('td.field_1960');
      var pB = b.tr.querySelector('td.field_1960');
      var pVA = pA ? parseFloat((pA.textContent || '').replace(/[^0-9.\-]/g, '')) : -Infinity;
      var pVB = pB ? parseFloat((pB.textContent || '').replace(/[^0-9.\-]/g, '')) : -Infinity;
      if (isNaN(pVA)) pVA = -Infinity;
      if (isNaN(pVB)) pVB = -Infinity;
      return pVB - pVA;
    });

    // ── PHASE 2: BUILD — construct cards from collected data ──
    //
    // buildWorksheetCard reparents <td> elements into the card DOM,
    // which mutates the source rows.  Conditional colors are computed
    // from field values (evaluateConditionalColor), not from the
    // browser's computed style, so these mutations cause zero forced
    // style recalculations.
    var pendingInserts = [];

    for (var ri = 0; ri < eligible.length; ri++) {
      var entry = eligible[ri];
      var tr = entry.tr;

      // Per-row bucket override: swap fields/layouts when row's bucket
      // doesn't match the keepBuckets whitelist (e.g. cameras/readers).
      var effectiveCfg = viewCfg;
      if (viewCfg.bucketOverride && viewCfg.bucketField) {
        var rowBucket = readBucketId(tr, viewCfg.bucketField);
        var keep = viewCfg.bucketOverride.keepBuckets || [];
        if (rowBucket && keep.indexOf(rowBucket) === -1) {
          // Build a shallow copy with overridden fields/layouts
          effectiveCfg = {};
          for (var ck in viewCfg) {
            if (viewCfg.hasOwnProperty(ck)) effectiveCfg[ck] = viewCfg[ck];
          }
          effectiveCfg.fields = viewCfg.bucketOverride.fields;
          effectiveCfg.summaryLayout = viewCfg.bucketOverride.summaryLayout;
          effectiveCfg.detailLayout = viewCfg.bucketOverride.detailLayout;
        }
      }
      var card = buildWorksheetCard(tr, effectiveCfg);
      if (effectiveCfg !== viewCfg) {
        card.classList.add(P + '-bucket-override');
      }

      // Override descLabel for synthetic-group rows (no MDF/IDF assigned)
      if (entry.hasNoMove && entry.bucketCls && viewCfg.bucketRules) {
        var rules = viewCfg.bucketRules;
        for (var bk in rules) {
          if (rules.hasOwnProperty(bk) && rules[bk].rowClass === entry.bucketCls && rules[bk].descLabelWhenSynthetic) {
            var ldDesc = viewCfg.fields && viewCfg.fields.laborDescription;
            if (ldDesc) {
              var ldLabel = card.querySelector('[data-scw-fields="' + ldDesc.key + '"] > .' + P + '-sum-label');
              if (ldLabel) ldLabel.textContent = rules[bk].descLabelWhenSynthetic;
            }
            break;
          }
        }
      }

      var wsTr = document.createElement('tr');
      wsTr.className = WORKSHEET_ROW;
      wsTr.id = tr.id;
      tr.removeAttribute('id');

      if (entry.bucketCls) wsTr.classList.add(entry.bucketCls);
      if (entry.hasNoMove) wsTr.setAttribute('data-scw-no-move', '1');
      if (viewCfg.photoAlwaysVisible) wsTr.setAttribute('data-scw-photo-always', '1');

      var wsTd = document.createElement('td');
      wsTd.setAttribute('colspan', String(colCount));
      wsTd.appendChild(card);
      wsTr.appendChild(wsTd);

      tr.setAttribute(PROCESSED_ATTR, '1');
      pendingInserts.push({ wsTr: wsTr, sourceTr: tr });
    }

    // ── Reorder source <tr> elements by field_2218 sort value ──
    // Sort within each group section so group headers stay in place.
    if (pendingInserts.length > 1) {
      // Tag each insert with its group header ref before any DOM changes
      for (var gi = 0; gi < pendingInserts.length; gi++) {
        var src = pendingInserts[gi].sourceTr;
        var hdr = src.previousElementSibling;
        while (hdr && !hdr.classList.contains('kn-table-group')) {
          hdr = hdr.previousElementSibling;
        }
        pendingInserts[gi]._groupHdr = hdr || null; // null = no group (flat view)
        // Capture trailing photo row before detach
        var nxt = src.nextElementSibling;
        if (nxt && nxt.classList.contains('scw-inline-photo-row')) {
          pendingInserts[gi]._photoRow = nxt;
        }
      }

      // Detach all source rows (and their photo rows) from the DOM
      for (var di = 0; di < pendingInserts.length; di++) {
        if (pendingInserts[di]._photoRow) pendingInserts[di]._photoRow.parentNode.removeChild(pendingInserts[di]._photoRow);
        pendingInserts[di].sourceTr.parentNode.removeChild(pendingInserts[di].sourceTr);
      }

      // Re-insert in sorted order, grouped by their original group header.
      // For each insert, append after its group header (or at end of tbody for flat views).
      // Since pendingInserts is already sorted by field_2218 and we process in order,
      // rows within each group section end up in the correct sorted position.
      var _tbody = table.querySelector('tbody');
      for (var ri2 = 0; ri2 < pendingInserts.length; ri2++) {
        var _ins = pendingInserts[ri2];
        var _hdr = _ins._groupHdr;
        // Find the last data row already reinserted under this group header
        // (or the header itself) and insert after it.
        var insertAfter = _hdr || null;
        if (insertAfter) {
          var _sib = insertAfter.nextElementSibling;
          while (_sib && !_sib.classList.contains('kn-table-group')) {
            insertAfter = _sib;
            _sib = _sib.nextElementSibling;
          }
          insertAfter.parentNode.insertBefore(_ins.sourceTr, insertAfter.nextSibling);
        } else {
          _tbody.appendChild(_ins.sourceTr);
        }
        if (_ins._photoRow) {
          _ins.sourceTr.parentNode.insertBefore(_ins._photoRow, _ins.sourceTr.nextSibling);
        }
      }
    }

    // ── PHASE 3: INSERT — batch all DOM insertions in one pass ──
    //
    // Batching avoids interleaving writes with the reads that happened
    // in Phase 1.  The browser can coalesce these mutations into a
    // single reflow instead of reflowing after each insertion.
    for (var pi = 0; pi < pendingInserts.length; pi++) {
      var ins = pendingInserts[pi];
      ins.sourceTr.parentNode.insertBefore(ins.wsTr, ins.sourceTr.nextSibling);
    }

    // After all rows are processed, absorb photo row content into the
    // card div so header + detail + photos form one shadow-able unit.
    var wsRows = table.querySelectorAll('tr.' + WORKSHEET_ROW);
    for (var j = 0; j < wsRows.length; j++) {
      var ws = wsRows[j];
      var card = ws.querySelector('.' + P + '-card');
      var photoRow = ws.nextElementSibling;
      if (photoRow && photoRow.classList.contains('scw-inline-photo-row') && card) {
        // Move photo content into the card
        var photoWrap = document.createElement('div');
        photoWrap.className = P + '-photo-wrap' + (viewCfg.photoAlwaysVisible ? '' : ' ' + P + '-photo-hidden');
        var photoTd = photoRow.querySelector('td');
        if (photoTd) {
          while (photoTd.firstChild) {
            photoWrap.appendChild(photoTd.firstChild);
          }
        }
        card.appendChild(photoWrap);
        // Mark the original photo <tr> as absorbed so it stays hidden
        photoRow.classList.add(P + '-photo-absorbed');

        // For photoAlwaysVisible views, hide the strip when there
        // are no actual uploaded photos (only placeholders / "+ Add" button).
        if (viewCfg.photoAlwaysVisible && !photoWrap.querySelector('.scw-inline-photo-card[data-photo-has-image="true"]')) {
          photoWrap.classList.add(P + '-photo-hidden');
        }
      }
    }

    // ── SYNTHETIC GROUP HEADERS for ungrouped Assumptions / Services ──
    // Rows with an empty MDF/IDF (move) field that are Assumptions or
    // Services get collected under synthetic group-header rows placed
    // FIRST in the table (before MDF/IDF groups).
    if (viewCfg.syntheticBucketGroups && viewCfg.syntheticBucketGroups.length) {
      var tbody = table.querySelector('tbody');

      // Clean up any synthetic groups / dividers from a previous render
      // (model.fetch re-renders the view but our injected rows may survive)
      var staleGroups = tbody.querySelectorAll('tr.scw-synthetic-group, tr.scw-synth-divider');
      for (var si = 0; si < staleGroups.length; si++) staleGroups[si].remove();

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
      // and any orphaned non-worksheet rows directly beneath them.
      // Bucket rows (services/assumptions) and non-bucket rows alike
      // are left in place — the synthetic builder will relocate bucket
      // rows, and a later pass creates an "Unassigned" group for the rest.
      var nativeGroups = tbody.querySelectorAll('tr.kn-table-group.kn-group-level-1');
      for (var gi = 0; gi < nativeGroups.length; gi++) {
        var grp = nativeGroups[gi];
        if (grp.classList.contains('scw-synthetic-group')) continue;
        var labelText = getGroupLabelText(grp);
        if (labelText.length === 0) {
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
      var buckets = viewCfg.syntheticBucketGroups;

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

        // Insert the group header at top or bottom of tbody
        if (viewCfg.syntheticGroupsPosition === 'bottom') {
          tbody.appendChild(groupTr);
        } else {
          var firstChild = tbody.firstChild;
          tbody.insertBefore(groupTr, firstChild);
        }

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

      // Collect orphaned non-bucket rows (regular line items with no
      // MDF/IDF) and place them under an "Unassigned" group header.
      var bucketClasses = {};
      for (var bi = 0; bi < buckets.length; bi++) {
        bucketClasses[buckets[bi].cls] = true;
      }
      var orphanCandidates = tbody.querySelectorAll(
        'tr.' + WORKSHEET_ROW + '[data-scw-no-move="1"]'
      );
      var orphanRows = [];
      for (var oi = 0; oi < orphanCandidates.length; oi++) {
        var oRow = orphanCandidates[oi];
        var isBucketRow = false;
        for (var bk in bucketClasses) {
          if (oRow.classList.contains(bk)) { isBucketRow = true; break; }
        }
        if (!isBucketRow) orphanRows.push(oRow);
      }
      if (orphanRows.length) {
        anySyntheticBuilt = true;

        // Build "Unassigned" group header
        var unassignedTr = document.createElement('tr');
        unassignedTr.className = 'kn-table-group kn-group-level-1 scw-group-header scw-synthetic-group';
        unassignedTr.style.cssText = '--scw-grp-accent: ' + SYNTH_ACCENT +
          '; --scw-grp-accent-rgb: ' + SYNTH_ACCENT_RGB + ';';
        var unassignedTd = document.createElement('td');
        unassignedTd.setAttribute('colspan', String(colSpan));
        unassignedTd.textContent = 'Unassigned';
        unassignedTr.appendChild(unassignedTd);

        // Insert at top of tbody (before other synthetic groups)
        tbody.insertBefore(unassignedTr, tbody.firstChild);

        // Move orphan rows (and their associated orig/photo rows) under the header
        var oInsertRef = unassignedTr;
        for (var oj = 0; oj < orphanRows.length; oj++) {
          var oWs = orphanRows[oj];
          var oOrig = oWs.previousElementSibling;
          if (oOrig && oOrig.getAttribute(PROCESSED_ATTR) === '1') {
            oInsertRef.parentNode.insertBefore(oOrig, oInsertRef.nextSibling);
            oInsertRef = oOrig;
          }
          oInsertRef.parentNode.insertBefore(oWs, oInsertRef.nextSibling);
          oInsertRef = oWs;
          var oNxt = oWs.nextElementSibling;
          while (oNxt && oNxt.classList.contains('scw-inline-photo-row')) {
            var oPhoto = oNxt;
            oNxt = oNxt.nextElementSibling;
            oInsertRef.parentNode.insertBefore(oPhoto, oInsertRef.nextSibling);
            oInsertRef = oPhoto;
          }
        }
        lastInsertedRow = oInsertRef;
      }

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

    // ── THEAD SIZING ──
    // Let each <th> size to its content naturally (no measured-width lock).
    // The thead is for sorting/bulk-edit only — it doesn't need to align
    // pixel-perfectly with the summary bars below.

    // ── RESTORE EXPANDED STATE ──
    // Re-expand detail panels that were open before the inline-edit
    // re-render.  Must run AFTER all worksheet rows + photo rows are
    // built so toggleDetail can find and show the photo row too.
    // Clear stale localStorage for views that no longer default open
    // (prevents previously-expanded-all state from persisting)
    if (!viewCfg.defaultOpen && !_expandedState[viewCfg.viewId]) {
      try { localStorage.removeItem(wsStorageKey(viewCfg.viewId)); } catch (e) {}
    }

    restoreExpandedState(viewCfg.viewId);

    // ── DEFAULT OPEN ──
    // If the view config sets defaultOpen: true, expand ALL rows that
    // are still collapsed after restore (first render, not re-render).
    if (viewCfg.defaultOpen) {
      var allWsRows = table.querySelectorAll('tr.' + WORKSHEET_ROW);
      for (var doi = 0; doi < allWsRows.length; doi++) {
        var dDetail = allWsRows[doi].querySelector('.' + P + '-detail');
        if (dDetail && !dDetail.classList.contains(P + '-open')) {
          toggleDetail(allWsRows[doi]);
        }
      }
    }

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

    // ── NOTIFY DEPENDENT MODULES ──
    // Dispatch a custom event so modules like select-all-checkboxes can
    // run exactly once after the worksheet DOM is stable, instead of
    // relying on blind timers or a body-level MutationObserver.
    document.dispatchEvent(new CustomEvent('scw-worksheet-ready', {
      detail: { viewId: viewCfg.viewId }
    }));
  }

  // ============================================================
  // DELEGATED CLICK HANDLER FOR ACCORDION TOGGLE
  // ============================================================
  // ONLY the toggle-zone (chevron + identity) toggles the detail
  // panel.  All other clicks in the summary bar are left alone so
  // Knack / KTL inline edit can work without interference.

  $(document).on('click' + EVENT_NS, '.' + P + '-toggle-zone', function (e) {
    // Let clicks on the product cell pass through to KTL / Knack inline-edit
    var target = e.target;
    if (target.closest('.' + P + '-sum-product') || target.closest('.' + P + '-product-group')) {
      return;
    }
    e.preventDefault();
    var wsTr = this.closest('tr.' + WORKSHEET_ROW);
    if (wsTr) {
      toggleDetail(wsTr);
      // Persist accordion state to localStorage after toggle
      var viewEl = wsTr.closest('.kn-view');
      if (viewEl) captureExpandedState(viewEl.id);
    }
  });

  // ============================================================
  // HIDE-DELETE SYNC (cross-view)
  // ============================================================

  /**
   * For views with hideDeleteWhenFieldNotBlank, hide the delete link
   * on each row where the specified field is not blank.
   * Called after any worksheet view transforms.
   */
  function syncDeleteVisibility() {
    WORKSHEET_CONFIG.views.forEach(function (viewCfg) {
      if (!viewCfg.hideDeleteWhenFieldNotBlank) return;
      var $view = $('#' + viewCfg.viewId);
      if (!$view.length) return;

      var fieldKey = viewCfg.hideDeleteWhenFieldNotBlank;
      var cards = $view[0].querySelectorAll('.' + P + '-card');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var tr = card.closest('tr');
        var td = null;
        // The field td lives in the original Knack data row (previousElementSibling of scw-ws-row)
        if (tr) {
          var dataTr = tr.previousElementSibling;
          if (dataTr) {
            td = dataTr.querySelector('td.' + fieldKey) || dataTr.querySelector('td[data-field-key="' + fieldKey + '"]');
          }
          if (!td) td = tr.querySelector('td.' + fieldKey) || tr.querySelector('td[data-field-key="' + fieldKey + '"]');
        }
        if (!td) td = card.querySelector('td.' + fieldKey) || card.querySelector('td[data-field-key="' + fieldKey + '"]');
        var val = td ? (td.textContent || '').replace(/[\u00a0\s]/g, '').trim() : '';
        var del = card.querySelector('.' + P + '-sum-delete');
        if (del) {
          del.style.display = val ? 'none' : '';
        }
      }
    });
  }

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
          setTimeout(function () { transformView(viewCfg); syncDeleteVisibility(); }, 150);
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
  window.SCW.syncKnackModel = syncKnackModel;
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
/*** GRID DIRECT-EDIT — type-and-save inputs for standard Knack grids ***/
(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────
  var CONFIG = {
    // viewId → array of { key, number?, multiline? }
    'view_32': [
      { key: 'field_32' },
      { key: 'field_71' },
      { key: 'field_960' },
      { key: 'field_98', number: true },
      { key: 'field_1730', number: true },
      { key: 'field_12', number: true },
      { key: 'field_1734', number: true }
    ]
  };

  var PREFIX = 'scw-gde';
  var EDIT_ATTR = 'data-scw-grid-edit';
  var STYLE_ID = PREFIX + '-css';
  var OBSERVER_KEY = 'scwGdeObs';

  // ── CSS ────────────────────────────────────────────────────────
  var CSS = '\
td.' + PREFIX + '-cell {\
  position: relative;\
  padding: 0 !important;\
}\
td.' + PREFIX + '-cell > .kn-value,\
td.' + PREFIX + '-cell > span {\
  display: none !important;\
}\
.' + PREFIX + '-input {\
  position: absolute;\
  top: 0;\
  left: 0;\
  width: 100%;\
  height: 100%;\
  box-sizing: border-box;\
  border: none;\
  padding: 4px 6px;\
  font-size: 13px;\
  font-family: inherit;\
  background: transparent;\
  outline: none;\
  transition: background-color 0.15s;\
  overflow: hidden;\
  resize: none;\
}\
.' + PREFIX + '-textarea {\
  display: block;\
  width: 100%;\
  min-height: 100%;\
  box-sizing: border-box;\
  border: none;\
  padding: 4px 6px;\
  font-size: 13px;\
  font-family: inherit;\
  background: transparent;\
  outline: none;\
  transition: background-color 0.15s;\
  overflow: hidden;\
  resize: none;\
  line-height: 1.3;\
  white-space: pre-wrap;\
  word-wrap: break-word;\
}\
.' + PREFIX + '-input:focus,\
.' + PREFIX + '-textarea:focus {\
  background: rgba(74, 144, 217, 0.06);\
}\
.' + PREFIX + '-input.is-saving,\
.' + PREFIX + '-textarea.is-saving {\
  background: #e8f5e9;\
}\
.' + PREFIX + '-input.is-error,\
.' + PREFIX + '-textarea.is-error {\
  background: #fdecea;\
}\
.' + PREFIX + '-error {\
  position: absolute;\
  top: 100%;\
  left: 0;\
  white-space: nowrap;\
  z-index: 10;\
  background: #fff;\
  color: #c62828;\
  font-size: 11px;\
  padding: 2px 6px;\
  border-radius: 2px;\
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);\
}\
td.' + PREFIX + '-cell.bulkEditSelectSrc {\
  cursor: cell !important;\
}\
td.' + PREFIX + '-cell.bulkEditSelectSrc .' + PREFIX + '-input,\
td.' + PREFIX + '-cell.bulkEditSelectSrc .' + PREFIX + '-textarea {\
  pointer-events: none !important;\
  cursor: cell !important;\
}\
';

  // ── Inject styles ──────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  // ── Get configured fields for a view ─────────────────────────
  function getFields(viewId) {
    return CONFIG[viewId] || [];
  }

  // ── Auto-resize textarea to fit content ─────────────────────────
  function autoResize(el) {
    if (el.tagName !== 'TEXTAREA') return;
    el.style.height = '0';
    el.style.height = el.scrollHeight + 'px';
  }

  // ── Read cell text ─────────────────────────────────────────────
  function readCellText(td) {
    if (!td) return '';
    // Try kn-value span first
    var span = td.querySelector('.kn-value');
    if (span) return (span.textContent || '').replace(/[\u00a0]/g, ' ').trim();
    return (td.textContent || '').replace(/[\u00a0]/g, ' ').trim();
  }

  // ── Get record ID from table row ──────────────────────────────
  function getRecordId(tr) {
    // Knack grid rows: <tr id="5abcdef1234567890abcdef">
    return (tr && tr.id) ? tr.id : null;
  }

  // ── Parse Knack error ─────────────────────────────────────────
  function parseKnackError(xhr) {
    try {
      var body = JSON.parse(xhr.responseText || '{}');
      if (body.errors && body.errors.length) {
        return body.errors.map(function (e) { return e.message || e; }).join('; ');
      }
      if (body.message) return body.message;
    } catch (ignored) {}
    return 'Save failed';
  }

  // ── Save value via Knack API ──────────────────────────────────
  function saveValue(viewId, recordId, fieldKey, value, onSuccess, onError) {
    if (typeof Knack === 'undefined') return;

    var data = {};
    data[fieldKey] = value;

    // Prefer model.updateRecord — no re-render
    var view = Knack.views[viewId];
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      view.model.updateRecord(recordId, data);
      if (onSuccess) onSuccess(null);
      return;
    }

    // Fallback: direct AJAX PUT
    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId),
      type: 'PUT',
      data: JSON.stringify(data),
      success: function (resp) { if (onSuccess) onSuccess(resp); },
      error: function (xhr) {
        var msg = parseKnackError(xhr);
        console.warn('[' + PREFIX + '] Save failed for ' + recordId, xhr.responseText);
        if (onError) onError(msg);
      }
    });
  }

  // ── Visual feedback helpers ────────────────────────────────────
  function showSuccess(input) {
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    var wrapper = input.closest('td');
    var errEl = wrapper ? wrapper.querySelector('.' + PREFIX + '-error') : null;
    if (errEl) errEl.remove();
    setTimeout(function () { input.classList.remove('is-saving'); }, 600);
  }

  function showError(input, message, previousValue) {
    input.classList.remove('is-saving');
    input.classList.add('is-error');
    input.value = previousValue;
    input._scwPrev = previousValue;

    var wrapper = input.closest('td');
    var existing = wrapper ? wrapper.querySelector('.' + PREFIX + '-error') : null;
    if (existing) existing.remove();

    var errEl = document.createElement('div');
    errEl.className = PREFIX + '-error';
    errEl.textContent = message;
    if (wrapper) wrapper.appendChild(errEl);

    setTimeout(function () {
      input.classList.remove('is-error');
      if (errEl.parentNode) errEl.remove();
    }, 4000);
  }

  // ── Handle save ────────────────────────────────────────────────
  function handleSave(input) {
    var fieldKey = input.getAttribute('data-field') || '';
    var newValue = input.value;
    var previousValue = input._scwPrev || '';

    // Client-side number validation
    if (input.hasAttribute('data-number')) {
      var trimmed = newValue.trim().replace(/[$,]/g, '');
      if (trimmed !== '' && isNaN(Number(trimmed))) {
        showError(input, 'Please enter a number', previousValue);
        return;
      }
    }

    input._scwPrev = newValue;
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    var wrapper = input.closest('td');
    var errEl = wrapper ? wrapper.querySelector('.' + PREFIX + '-error') : null;
    if (errEl) errEl.remove();

    // Find record ID and view ID
    var tr = input.closest('tr');
    var recordId = getRecordId(tr);
    var viewEl = input.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;

    if (recordId && viewId) {
      saveValue(viewId, recordId, fieldKey, newValue,
        function () { showSuccess(input); },
        function (msg) { showError(input, msg, previousValue); }
      );
    }
  }

  // ── Inject inputs into a single view ──────────────────────────
  function enhanceView(viewId) {
    var $view = document.getElementById(viewId);
    if (!$view) return;

    var fields = getFields(viewId);
    if (!fields.length) {
      console.log('[' + PREFIX + '] No fields configured for ' + viewId);
      return;
    }

    var rows = $view.querySelectorAll('table.kn-table tbody tr');
    if (!rows.length) return;

    var pendingResize = [];
    var cellsEnhanced = 0;
    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      if (!tr.id) continue; // skip non-record rows

      for (var f = 0; f < fields.length; f++) {
        var field = fields[f];
        var td = tr.querySelector('td[data-field-key="' + field.key + '"]');
        if (!td || td.classList.contains(PREFIX + '-cell')) continue; // already enhanced

        var currentVal = readCellText(td);
        td.classList.add(PREFIX + '-cell');

        var input;
        if (field.number) {
          input = document.createElement('input');
          input.type = 'text';
          input.className = PREFIX + '-input';
          input.value = currentVal;
          input.setAttribute('data-number', '1');
        } else {
          // Use textarea for text fields so they auto-grow
          input = document.createElement('textarea');
          input.className = PREFIX + '-textarea';
          input.value = currentVal;
          input.rows = 1;
          input.addEventListener('input', function () { autoResize(this); });
        }

        input.setAttribute('data-field', field.key);
        input.setAttribute(EDIT_ATTR, '1');
        input._scwPrev = currentVal;

        td.appendChild(input);
        if (input.tagName === 'TEXTAREA') pendingResize.push(input);
        cellsEnhanced++;
      }
    }

    // Nothing to do — all cells already enhanced (observer re-fire)
    if (!cellsEnhanced) return;

    // Defer autoResize until after browser layout so scrollHeight is accurate
    if (pendingResize.length) {
      requestAnimationFrame(function () {
        for (var i = 0; i < pendingResize.length; i++) autoResize(pendingResize[i]);
      });
    }

    console.log('[' + PREFIX + '] Enhanced ' + viewId + ' with ' + cellsEnhanced + ' cells (' + fields.length + ' field types)');
  }

  // ── MutationObserver for re-render handling ────────────────────
  function installObserver(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;
    if (viewEl.dataset[OBSERVER_KEY]) return; // already observing
    viewEl.dataset[OBSERVER_KEY] = '1';

    var debounceTimer;
    var obs = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { enhanceView(viewId); }, 150);
    });

    obs.observe(viewEl, { childList: true, subtree: true });
  }

  // ── Global event handlers (capture phase) ─────────────────────

  // Keydown: Enter saves, Escape reverts
  document.addEventListener('keydown', function (e) {
    var target = e.target;
    if (!target.hasAttribute(EDIT_ATTR)) return;

    if (e.key === 'Enter') {
      if (target.tagName === 'TEXTAREA' && e.shiftKey) return; // Shift+Enter = newline
      e.preventDefault();
      e.stopPropagation();
      target._scwJustSaved = true;
      handleSave(target);
      target.blur();
    }

    if (e.key === 'Escape') {
      target._scwJustSaved = true;
      target.value = target._scwPrev || '';
      target.blur();
    }

    // Tab / Shift+Tab: move down/up the same column
    if (e.key === 'Tab') {
      var fieldKey = target.getAttribute('data-field');
      var currentTr = target.closest('tr');
      if (!fieldKey || !currentTr) return;

      e.preventDefault();
      e.stopPropagation();

      // Save current if changed
      if (target.value !== (target._scwPrev || '')) {
        target._scwJustSaved = true;
        handleSave(target);
      }

      // Find next/prev row's same-field input
      var siblingTr = e.shiftKey ? currentTr.previousElementSibling : currentTr.nextElementSibling;
      while (siblingTr && !siblingTr.id) {
        siblingTr = e.shiftKey ? siblingTr.previousElementSibling : siblingTr.nextElementSibling;
      }
      if (siblingTr) {
        var nextInput = siblingTr.querySelector('[' + EDIT_ATTR + '][data-field="' + fieldKey + '"]');
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }
  }, true);

  // Blur: auto-save if value changed
  document.addEventListener('focusout', function (e) {
    var target = e.target;
    if (!target.hasAttribute(EDIT_ATTR)) return;

    if (target._scwJustSaved) {
      target._scwJustSaved = false;
      return;
    }

    if (target.value !== (target._scwPrev || '')) {
      handleSave(target);
    }
  }, true);

  // Block Knack inline-edit on our inputs
  document.addEventListener('click', function (e) {
    if (e.target.hasAttribute(EDIT_ATTR)) e.stopPropagation();
  }, true);
  document.addEventListener('mousedown', function (e) {
    if (e.target.hasAttribute(EDIT_ATTR)) e.stopPropagation();
  }, true);

  // ── Bind to view renders ──────────────────────────────────────
  var VIEW_IDS = Object.keys(CONFIG);
  VIEW_IDS.forEach(function (viewId) {
    $(document).on('knack-view-render.' + viewId + '.scwGridDirectEdit', function (event, view) {
      injectStyles();
      enhanceView(viewId);
      installObserver(viewId);
    });
  });

  console.log('[' + PREFIX + '] Grid direct-edit module loaded for: ' + VIEW_IDS.join(', '));
})();
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
  //   fieldKey         – the Knack field id to COLOR (matched via data-field-key)
  //   when             – "empty" | "zero" (what triggers the color)
  //   color            – key from COLORS (or a raw CSS color string)
  //   triggerFieldKey  – (optional) check the condition on THIS field instead
  //                      of fieldKey.  Useful for cross-field rules such as
  //                      "when Fee is $0 → color Sub Bid as danger".
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
    },
    {
      viewId: 'view_3313',
      rules: [
        // SOW empty → warning on SOW cell
        { fieldKey: 'field_2154', when: 'empty', color: 'warning' },
        // Fee ($0 / empty) → danger on Sub Bid, +Hrs, +Mat
        { fieldKey: 'field_2150', triggerFieldKey: 'field_2028', when: 'empty', color: 'danger' },
        { fieldKey: 'field_2150', triggerFieldKey: 'field_2028', when: 'zero',  color: 'danger' },
        { fieldKey: 'field_1973', triggerFieldKey: 'field_2028', when: 'empty', color: 'danger' },
        { fieldKey: 'field_1973', triggerFieldKey: 'field_2028', when: 'zero',  color: 'danger' },
        { fieldKey: 'field_1974', triggerFieldKey: 'field_2028', when: 'empty', color: 'danger' },
        { fieldKey: 'field_1974', triggerFieldKey: 'field_2028', when: 'zero',  color: 'danger' }
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
      'tr.scw-ws-row .scw-ws-card td.scw-cell-warning, tr td.scw-cell-warning { background-color: ' + COLORS.warning + ' !important; }\n' +
      '';
    document.head.appendChild(style);
  })();

  // ============================================================
  // CORE
  // ============================================================

  /** Collect the unique set of target fieldKeys for a rule list. */
  function targetFieldKeys(rules) {
    var seen = {};
    rules.forEach(function (r) { seen[r.fieldKey] = true; });
    return Object.keys(seen);
  }

  function applyColorsForView(viewCfg) {
    var viewId = viewCfg.viewId;
    var rules  = viewCfg.rules;
    var $view  = $('#' + viewId);
    if (!$view.length) return;

    var $rows = $view.find('table.kn-table-table tbody tr');
    if (!$rows.length) return;

    var targets = targetFieldKeys(rules);

    $rows.each(function () {
      var $tr = $(this);

      // Skip group / header rows
      if ($tr.hasClass('kn-table-group') || $tr.hasClass('kn-table-group-container')) return;

      // Clear previous dynamic colors on all target cells so that
      // cross-field rules (triggerFieldKey) are properly removed when
      // the trigger condition no longer holds.
      targets.forEach(function (fk) {
        var $td = $tr.find('td[data-field-key="' + fk + '"]');
        if ($td.length) {
          $td.removeClass(ALL_COLOR_CLASSES);
          $td.css('background-color', '');
          // Clear direct-edit input bg too
          $td.find('.scw-ws-direct-input, .scw-ws-direct-textarea').css('background-color', '');
        }
      });

      // Apply matching rules (last match for a given cell wins)
      rules.forEach(function (rule) {
        var $td = $tr.find('td[data-field-key="' + rule.fieldKey + '"]');
        if (!$td.length) return;

        // Determine which cell to test the condition against
        var $check = rule.triggerFieldKey
          ? $tr.find('td[data-field-key="' + rule.triggerFieldKey + '"]')
          : $td;
        if (!$check.length) return;

        if (matchesCondition($check, rule.when)) {
          $td.removeClass(ALL_COLOR_CLASSES);
          var cls = COLOR_CLASSES[rule.color];
          if (cls) $td.addClass(cls);
          var color = resolveColor(rule.color);
          $td.css('background-color', color);
          // Propagate to direct-edit inputs so they don't mask the td color
          $td.find('.scw-ws-direct-input, .scw-ws-direct-textarea').css('background-color', color);
        }
      });
    });
  }

  // Re-apply after KTL / Knack tbody mutations (debounced)
  function installObserver(viewCfg) {
    var $view = $('#' + viewCfg.viewId);
    if (!$view.length) return;
    if ($view.data('scwDynColorsObs')) return;
    $view.data('scwDynColorsObs', true);

    var el = $view.find('table.kn-table-table tbody').get(0);
    if (!el) return;

    var debounceTimer = 0;
    var obs = new MutationObserver(function () {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        debounceTimer = 0;
        applyColorsForView(viewCfg);
      }, 150);
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
        applyColorsForView(viewCfg);
        installObserver(viewCfg);
      });
  });
})();
/***************************** DYNAMIC CELL COLORS – EMPTY / ZERO FIELD HIGHLIGHTING *******************************/
/*************************** REVENUE TIER PROGRESS BAR *******************************/
(function () {
  'use strict';

  var EVENT_NS = '.scwRevTierProgress';
  var STYLE_ID = 'scw-revenue-tier-progress-css';
  var VIEW_IDS = ['view_352', 'view_256', 'view_325', 'view_383'];

  /* ── field keys ─────────────────────────────────────── */
  var FIELD_FLOOR    = 'field_324';   // Floor
  var FIELD_UPPER    = 'field_325';   // Upper Limit
  var FIELD_REVENUE  = 'field_415';   // Total Revenue from Schedule
  var FIELD_NEEDED   = 'field_417';   // Amount needed to unlock tier
  var FIELD_GRP_SORT = 'field_419';   // Group sort     (desc – highest first)
  var FIELD_ROW_SORT = 'field_323';   // Row sort       (asc  – lowest first / Sequence)

  /* ── colors ─────────────────────────────────────────── */
  var COLOR_GREEN   = '#b6dfca';  // green – at/above upper
  var COLOR_PARTIAL = '#f5d89a';  // warm amber – partial progress

  /* ── helpers ────────────────────────────────────────── */
  function parseCurrency(text) {
    if (!text) return NaN;
    var cleaned = text.replace(/[^0-9.\-]/g, '');
    return cleaned === '' ? NaN : parseFloat(cleaned);
  }

  function cellText($td) {
    return ($td.find('span').first().text() || $td.text()).trim();
  }

  /* ── inject CSS once ────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '/* Revenue-tier progress bar */',
      '.scw-rev-tier-cell {',
      '  position: relative;',
      '}',

      /* Track — the background "rail" for the progress bar */
      '.scw-rev-tier-track {',
      '  position: relative;',
      '  height: 22px;',
      '  background: #e9ecef;',
      '  border-radius: 12px;',
      '  overflow: hidden;',
      '  box-shadow: inset 0 1px 2px rgba(0,0,0,.08);',
      '  min-width: 60px;',
      '}',

      /* Fill — the colored portion inside the track */
      '.scw-rev-tier-fill {',
      '  position: absolute;',
      '  top: 0; left: 0; bottom: 0;',
      '  border-radius: 12px;',
      '  pointer-events: none;',
      '  transition: width .3s ease;',
      '  min-width: 0;',
      '}',

      /* Label text — sits centered over the track */
      '.scw-rev-tier-label {',
      '  position: absolute;',
      '  top: 0; left: 0; right: 0; bottom: 0;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  font-weight: 600;',
      '  font-size: 11px;',
      '  white-space: nowrap;',
      '  color: #333;',
      '  text-shadow: 0 0 3px rgba(255,255,255,.7);',
      '  z-index: 1;',
      '}',
      '.scw-rev-tier-label svg {',
      '  vertical-align: -2px;',
      '  margin-right: 3px;',
      '}',

      /* "needed to unlock" text — no track, just inline */
      '.scw-rev-tier-needed {',
      '  font-weight: 600;',
      '  font-size: 12px;',
      '  white-space: nowrap;',
      '}',

      /* Target badge in accordion group header */
      '.scw-rev-tier-target {',
      '  margin-left: auto;',
      '  color: #355e3b;',
      '  white-space: nowrap;',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  var CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  /* ── helpers: column count for colspan fix ──────────── */
  function getColCount($table) {
    var hCells = $table.find('thead th');
    var n = 0;
    hCells.each(function () {
      n += parseInt($(this).attr('colspan') || '1', 10);
    });
    return n || hCells.length || 1;
  }

  /* ── sort groups + rows within groups ───────────────── */
  function sortGroupRows($table) {
    var $tbody = $table.find('tbody');
    var groups = [];
    var currentGroup = null;

    /* Collect groups and their data rows */
    $tbody.children('tr').each(function () {
      var $row = $(this);
      if ($row.hasClass('kn-table-group')) {
        currentGroup = { header: $row, rows: [] };
        groups.push(currentGroup);
      } else if (currentGroup) {
        currentGroup.rows.push($row);
      }
    });

    if (groups.length === 0) return;

    /* ── 1. Sort rows WITHIN each group by field_323 (Sequence) asc ── */
    groups.forEach(function (group) {
      if (group.rows.length < 2) return;
      group.rows.sort(function (a, b) {
        var aSeq = parseCurrency(cellText(a.find('td[data-field-key="' + FIELD_ROW_SORT + '"]')));
        var bSeq = parseCurrency(cellText(b.find('td[data-field-key="' + FIELD_ROW_SORT + '"]')));
        if (isNaN(aSeq)) aSeq = Infinity;
        if (isNaN(bSeq)) bSeq = Infinity;
        return aSeq - bSeq;
      });
    });

    /* ── 2. Sort GROUPS by field_419 desc (use max value from rows) ── */
    groups.sort(function (a, b) {
      var aMax = -Infinity;
      var bMax = -Infinity;
      a.rows.forEach(function ($r) {
        var v = parseCurrency(cellText($r.find('td[data-field-key="' + FIELD_GRP_SORT + '"]')));
        if (!isNaN(v) && v > aMax) aMax = v;
      });
      b.rows.forEach(function ($r) {
        var v = parseCurrency(cellText($r.find('td[data-field-key="' + FIELD_GRP_SORT + '"]')));
        if (!isNaN(v) && v > bMax) bMax = v;
      });
      return bMax - aMax;  /* descending */
    });

    /* ── 3. Re-insert everything in sorted order ── */
    groups.forEach(function (group) {
      $tbody.append(group.header);
      group.rows.forEach(function ($row) {
        $tbody.append($row);
      });
    });
  }

  /* ── format number as currency ──────────────────────── */
  function formatCurrency(n) {
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ── inject average field_419 into each group header ── */
  function injectGroupTargets($table) {
    var $tbody = $table.find('tbody');
    var currentHeader = null;
    var rows = [];

    function flush() {
      if (!currentHeader || !rows.length) return;
      /* Remove any previously injected badge */
      currentHeader.find('.scw-rev-tier-target').remove();

      var sum = 0, count = 0;
      rows.forEach(function ($r) {
        var v = parseCurrency(cellText($r.find('td[data-field-key="' + FIELD_GRP_SORT + '"]')));
        if (!isNaN(v)) { sum += v; count++; }
      });
      if (count === 0) return;
      var avg = sum / count;
      var $inner = currentHeader.find('.scw-group-inner');
      if (!$inner.length) $inner = currentHeader.find('td').first();
      $inner.append('<span class="scw-rev-tier-target">Target: ' + formatCurrency(avg) + '</span>');
    }

    $tbody.children('tr').each(function () {
      var $row = $(this);
      if ($row.hasClass('kn-table-group')) {
        flush();
        currentHeader = $row;
        rows = [];
      } else {
        rows.push($row);
      }
    });
    flush();
  }

  /* ── core logic ─────────────────────────────────────── */
  function applyProgress(viewId) {
    var $view = $('#' + viewId);
    if (!$view.length) return;

    var $table = $view.find('table.kn-table').first();
    var colCount = getColCount($table);

    /* Fix group-header colspan so accordion rows span full width */
    $table.find('tr.kn-table-group td').each(function () {
      var $cell = $(this);
      var cur = parseInt($cell.attr('colspan') || '1', 10);
      if (cur < colCount) {
        $cell.attr('colspan', colCount);
      }
    });

    /* Sort rows within each accordion group before applying progress bars */
    sortGroupRows($table);

    /* Inject average target into each group header */
    injectGroupTargets($table);

    $table.find('tbody tr:not(.kn-table-group)').each(function () {
      var $row = $(this);
      var $floorTd   = $row.find('td[data-field-key="' + FIELD_FLOOR   + '"]');
      var $upperTd   = $row.find('td[data-field-key="' + FIELD_UPPER   + '"]');
      var $revTd     = $row.find('td[data-field-key="' + FIELD_REVENUE + '"]');
      var $neededTd  = $row.find('td[data-field-key="' + FIELD_NEEDED  + '"]');
      if (!$revTd.length) return;

      var floor   = parseCurrency(cellText($floorTd));
      var upper   = parseCurrency(cellText($upperTd));
      var revenue = parseCurrency(cellText($revTd));

      if (isNaN(revenue) || isNaN(floor)) return;

      /* Reset */
      $revTd.addClass('scw-rev-tier-cell');
      $revTd.find('.scw-rev-tier-track').remove();
      $revTd.find('.scw-rev-tier-needed').remove();
      var $span = $revTd.find('span').first();
      $span.css('display', '');
      $revTd.css('text-align', '');

      if (revenue < floor) {
        /* ── below floor → show amount needed to unlock ── */
        var neededVal = cellText($neededTd);
        $span.css('display', 'none');
        $revTd.css('text-align', 'center');
        $revTd.append('<span class="scw-rev-tier-needed">' + neededVal + ' needed to unlock tier!</span>');

      } else {
        /* ── at or above floor → show progress bar ── */
        var pct, labelText, fillColor;

        if (isNaN(upper) || upper <= floor || revenue >= upper) {
          pct = 100;
          labelText = CHECK_SVG + '100% Achieved!';
          fillColor = COLOR_GREEN;
        } else {
          pct = ((revenue - floor) / (upper - floor)) * 100;
          pct = Math.max(0, Math.min(100, pct));
          labelText = Math.round(pct) + '% Achieved';
          fillColor = pct >= 100 ? COLOR_GREEN : COLOR_PARTIAL;
        }

        $span.css('display', 'none');
        $revTd.css('text-align', 'center');

        var $track = $('<div class="scw-rev-tier-track"></div>');
        var $fill  = $('<div class="scw-rev-tier-fill"></div>');
        var $label = $('<span class="scw-rev-tier-label"></span>');

        $fill.css({ width: pct + '%', background: fillColor });
        $label.html(labelText);
        $track.append($fill).append($label);
        $revTd.append($track);
      }
    });
  }

  /* ── bind ────────────────────────────────────────────── */
  injectStyles();

  VIEW_IDS.forEach(function (viewId) {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.'  + viewId + EVENT_NS, function () {
        applyProgress(viewId);

        /* Re-apply after Knack DOM mutations (inline edits, etc.) */
        var el = document.getElementById(viewId);
        if (!el || $(el).data('scwRevTierObs')) return;

        var timer = 0;
        var obs = new MutationObserver(function () {
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () { timer = 0; applyProgress(viewId); }, 150);
        });
        obs.observe(el, { childList: true, subtree: true });
        $(el).data('scwRevTierObs', true);
      });
  });

})();

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
