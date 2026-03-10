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
