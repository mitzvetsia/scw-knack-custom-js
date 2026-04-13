// ============================================================
// Modal Scroll Restore
// ============================================================
// After submitting a form in a Knack modal, the parent page
// re-renders and scrolls to the top.  This module captures the
// scroll position when a modal opens and restores it after the
// modal closes and parent views have settled.
//
// Works on all pages — no per-scene configuration needed.
//
// Lifecycle:
//   1. MutationObserver detects kn-modal-bg added to DOM → save scrollY
//   2. MutationObserver detects kn-modal-bg removed from DOM → pending restore
//   3. Debounce on knack-view-render events (parent views re-rendering)
//   4. After settle, restore scrollY via requestAnimationFrame
//   5. Safety timeout if no view-renders fire (modal closed without submit)
// ============================================================
(function () {
  'use strict';

  var _savedScrollY = null;
  var _pendingRestore = false;
  var _settleTimer = null;
  var _safetyTimer = null;

  // ms after the last knack-view-render to consider views settled
  var SETTLE_MS = 400;
  // fallback restore if no view-renders fire after modal close
  var SAFETY_MS = 800;

  // ── Save / Restore helpers ────────────────────────────────

  function saveScroll() {
    _savedScrollY = window.scrollY || window.pageYOffset || 0;
  }

  function doRestore() {
    clearTimers();
    var pos = _savedScrollY;
    _savedScrollY = null;
    _pendingRestore = false;

    if (typeof pos === 'number' && pos > 0) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          window.scrollTo(0, pos);
        });
      });
    }
  }

  function clearTimers() {
    if (_settleTimer) { clearTimeout(_settleTimer); _settleTimer = null; }
    if (_safetyTimer) { clearTimeout(_safetyTimer); _safetyTimer = null; }
  }

  function startPendingRestore() {
    _pendingRestore = true;
    // Safety: restore even if no view-renders fire (e.g., modal closed
    // without submitting, or Knack didn't refresh parent views).
    _safetyTimer = setTimeout(doRestore, SAFETY_MS);
  }

  // ── View-render debounce during pending restore ───────────

  $(document).on('knack-view-render.scwModalScroll', function () {
    if (!_pendingRestore) return;
    // Reset both timers: each view-render restarts the settle window
    if (_settleTimer) clearTimeout(_settleTimer);
    if (_safetyTimer) clearTimeout(_safetyTimer);
    _settleTimer = setTimeout(doRestore, SETTLE_MS);
  });

  // ── MutationObserver: detect modal open / close ───────────

  function isModalBg(node) {
    if (node.nodeType !== 1) return false;
    // Knack uses class="kn-modal-bg" with optional index suffix on the id
    return node.id ? node.id.indexOf('kn-modal-bg') === 0
                   : (node.className && typeof node.className === 'string' &&
                      node.className.indexOf('kn-modal-bg') !== -1);
  }

  function initObserver() {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];

        for (var a = 0; a < m.addedNodes.length; a++) {
          if (isModalBg(m.addedNodes[a])) {
            saveScroll();
            return;
          }
        }

        for (var r = 0; r < m.removedNodes.length; r++) {
          if (isModalBg(m.removedNodes[r])) {
            if (_savedScrollY !== null) {
              startPendingRestore();
            }
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Start observing once the body is available
  if (document.body) {
    initObserver();
  } else {
    document.addEventListener('DOMContentLoaded', initObserver);
  }
})();
