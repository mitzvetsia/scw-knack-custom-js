// ============================================================
// Preserve scroll position across page refreshes
// ============================================================
//
// Saves the current scroll position to sessionStorage before
// the page unloads and restores it when the page loads again.
//
// The position is keyed by the current URL path + hash so each
// Knack page remembers its own scroll position independently.
//
// Global API (optional):
//   SCW.scrollPreserve.save()    – manually save current position
//   SCW.scrollPreserve.restore() – manually restore saved position
//   SCW.scrollPreserve.clear()   – clear the saved position
//
(function () {
  var STORAGE_KEY = 'scw_scroll_position';

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

  // Save position right before the page unloads (refresh / close / navigate away)
  window.addEventListener('beforeunload', save);

  // Restore position once the page is ready.
  // Use a short delay so Knack views have time to render content that
  // affects page height before we scroll.
  $(document).ready(function () {
    setTimeout(restore, 300);
  });

  // Also restore after every Knack scene render, since Knack is a SPA and
  // hash-based navigation can re-render without a full page load.
  $(document).on('knack-scene-render.any.scwScrollPreserve', function () {
    setTimeout(restore, 300);
  });

  // Expose on the SCW namespace
  window.SCW = window.SCW || {};
  window.SCW.scrollPreserve = {
    save: save,
    restore: restore,
    clear: clear
  };
})();
