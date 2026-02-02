(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const CONFIG = {
    removeEntireView: true, // true = remove #view_3364 block; false = remove only KTL section wrapper
    viewIds: ['view_3364'],
  };

  const EVENT_NS = '.scwHideEmptyGrid';
  const OBS_BY_VIEW = new Map(); // viewId -> MutationObserver

  // ======================
  // CORE
  // ======================
  function isEmptyGrid($view) {
    return $view.find('tbody tr.kn-tr-nodata').length > 0;
  }

  function removeEmpty($view, viewId) {
    if (CONFIG.removeEntireView) {
      $view.remove();
      return true;
    }

    // remove only the KTL wrapper section inside the view (keeps header/title)
    const $section = $view.find('section.hideShow_' + viewId);
    if ($section.length) $section.remove();
    else $view.find('.kn-table-wrapper').closest('section, .kn-table-wrapper').remove();

    return true;
  }

  function evaluate(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) return;

    if (isEmptyGrid($view)) {
      // stop observing once removed
      stopObserver(viewId);
      removeEmpty($view, viewId);
    }
  }

  function startObserver(viewId) {
    stopObserver(viewId);

    const el = document.getElementById(viewId);
    if (!el) return;

    // Evaluate immediately (in case "No data" already exists)
    evaluate(viewId);

    const obs = new MutationObserver(function () {
      // Any DOM change inside the view: re-check for no-data row
      evaluate(viewId);
    });

    obs.observe(el, { childList: true, subtree: true });
    OBS_BY_VIEW.set(viewId, obs);
  }

  function stopObserver(viewId) {
    const obs = OBS_BY_VIEW.get(viewId);
    if (obs) obs.disconnect();
    OBS_BY_VIEW.delete(viewId);
  }

  function initAll() {
    CONFIG.viewIds.forEach(startObserver);
  }

  // ======================
  // HOOKS (multiple ways)
  // ======================
  // 1) Immediately on DOM ready (helps when script loads late)
  $(initAll);

  // 2) On any scene render (Knack page navigation)
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      initAll();
    });

  // 3) On view render (Knack refreshes)
  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view) {
      if (!view || !CONFIG.viewIds.includes(view.key)) return;
      // Kick the observer again because KTL sometimes rebuilds nodes
      startObserver(view.key);
    });
})();
