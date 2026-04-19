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
// Detection strategies (belt-and-suspenders):
//   A. knack-scene-render — if the scene is inside kn-page-modal,
//      a modal just opened → save scroll.
//   B. knack-view-render — if _modalWasOpen and the modal DOM is
//      gone, modal just closed → start pending restore.
//   C. MutationObserver — catches kn-modal-bg / kn-page-modal
//      elements being added/removed from the DOM.
//   D. Click interception — save scroll preemptively when the user
//      clicks a kn-link-page that might open a modal.
// ============================================================
(function () {
  'use strict';

  var _savedScrollY = null;
  var _modalWasOpen = false;
  var _pendingRestore = false;
  var _settleTimer = null;
  var _safetyTimer = null;

  // ms after the last knack-view-render to consider views settled
  var SETTLE_MS = 400;
  // fallback restore if no view-renders fire after modal close
  var SAFETY_MS = 1500;

  // ── Guard state — re-apply scroll if late renders move it ─
  var _guardPos = 0;
  var _guardUntil = 0;
  // Duration after restore during which late view-renders re-apply scroll
  var GUARD_MS = 1500;

  // ── Helpers ───────────────────────────────────────────

  function saveScroll() {
    _savedScrollY = window.scrollY || window.pageYOffset || 0;
  }

  function isModalPresent() {
    var el = document.querySelector('[id^="kn-modal-bg"], [id^="kn-page-modal"]');
    if (!el) return false;
    // Element exists — check it's actually visible (not hidden/display:none)
    try {
      var s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    } catch (e) {
      return true; // assume present if getComputedStyle fails
    }
  }

  function applyScroll(pos) {
    window.scrollTo(0, pos);
  }

  function doRestore() {
    clearTimers();
    var pos = _savedScrollY;
    _savedScrollY = null;
    _pendingRestore = false;
    _modalWasOpen = false;

    if (typeof pos === 'number' && pos > 0) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          applyScroll(pos);
          // Enter guard mode — re-apply if late Knack/KTL renders move scroll
          _guardPos = pos;
          _guardUntil = Date.now() + GUARD_MS;
        });
      });
    }
  }

  function clearTimers() {
    if (_settleTimer) { clearTimeout(_settleTimer); _settleTimer = null; }
    if (_safetyTimer) { clearTimeout(_safetyTimer); _safetyTimer = null; }
  }

  function startPendingRestore() {
    if (_pendingRestore) return;
    _pendingRestore = true;
    _modalWasOpen = false;
    _safetyTimer = setTimeout(doRestore, SAFETY_MS);
  }

  // ── Strategy A: Scene-render hooks ────────────────────

  $(document).on('knack-scene-render.any.scwModalScroll', function (event, scene) {
    var sceneId = scene && scene.key;
    if (!sceneId) return;

    var sceneEl = document.getElementById('kn-' + sceneId);
    var inModal = sceneEl && sceneEl.closest('[id^="kn-page-modal"]');

    if (inModal) {
      // Modal scene just rendered — save parent page scroll
      if (!_modalWasOpen && !_pendingRestore) {
        saveScroll();
        _modalWasOpen = true;
      }
    } else if (_modalWasOpen) {
      // Parent scene re-rendering after modal close
      startPendingRestore();
    }
  });

  // ── Strategy B: View-render hooks ─────────────────────

  $(document).on('knack-view-render.scwModalScroll', function () {
    // Detect modal close: was open, now the DOM element is gone
    if (_modalWasOpen && !isModalPresent()) {
      startPendingRestore();
    }

    // Guard mode: a late view-render after restore moved the scroll —
    // re-apply the saved position.  Stops after GUARD_MS or if the
    // user scrolls manually (wheel / touch — see listeners below).
    if (!_pendingRestore && _guardUntil && Date.now() < _guardUntil) {
      setTimeout(function () {
        if (Date.now() > _guardUntil) return;
        var current = window.scrollY || window.pageYOffset || 0;
        if (Math.abs(current - _guardPos) > 50) {
          applyScroll(_guardPos);
        }
      }, 60);
      return;
    }

    if (!_pendingRestore) return;
    // Debounce: each view-render restarts the settle window
    if (_settleTimer) clearTimeout(_settleTimer);
    if (_safetyTimer) clearTimeout(_safetyTimer);
    _settleTimer = setTimeout(doRestore, SETTLE_MS);
  });

  // ── Strategy C: MutationObserver for modal add/remove ─

  function isModalEl(node) {
    if (node.nodeType !== 1) return false;
    var id = typeof node.id === 'string' ? node.id : '';
    if (!id) return false;
    return id.indexOf('kn-modal-bg') === 0 ||
           id.indexOf('kn-page-modal') === 0;
  }

  function initObserver() {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];

        for (var a = 0; a < m.addedNodes.length; a++) {
          if (isModalEl(m.addedNodes[a])) {
            if (!_modalWasOpen && !_pendingRestore) {
              saveScroll();
              _modalWasOpen = true;
            }
            return;
          }
        }

        for (var r = 0; r < m.removedNodes.length; r++) {
          if (isModalEl(m.removedNodes[r])) {
            if (_modalWasOpen || _savedScrollY !== null) {
              startPendingRestore();
            }
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Strategy D: Click interception on modal-opening links ─

  $(document).on('click.scwModalScroll', '.kn-link-page, .scw-acc-action-btn', function () {
    if (_modalWasOpen || _pendingRestore) return;
    // Save scroll preemptively; confirm modal opened after a short delay
    saveScroll();
    setTimeout(function () {
      if (isModalPresent()) {
        _modalWasOpen = true;
      } else {
        // No modal opened — navigation or inline action; clear saved scroll
        _savedScrollY = null;
      }
    }, 300);
  });

  // ── Cancel guard on user-initiated scroll ──────────────

  function cancelGuard() { _guardUntil = 0; }
  window.addEventListener('wheel', cancelGuard, { passive: true });
  window.addEventListener('touchmove', cancelGuard, { passive: true });

  // ── Init ──────────────────────────────────────────────

  if (document.body) {
    initObserver();
  } else {
    document.addEventListener('DOMContentLoaded', initObserver);
  }
})();
