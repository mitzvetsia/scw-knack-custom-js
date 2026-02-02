(function () {
  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3364'];
  const EVENT_NS = '.scwHideEmptyGrid_v2';

  // Flip these as needed:
  const REMOVE_SCOPE = 'group'; 
  // 'view'  = remove #view_3364 only
  // 'group' = remove the closest .view-group wrapper (usually what you want)

  const DEBUG = true;

  // ======================
  // HELPERS
  // ======================
  function log(...args) {
    if (DEBUG && window.console) console.log('[scwHideEmptyGrid]', ...args);
  }

  function markRunning($view) {
    if (!DEBUG) return;
    // red outline shows script is touching the view at all
    $view.css('outline', '2px dashed red');
  }

  function findRemovalTarget($view) {
    if (REMOVE_SCOPE === 'group') {
      const $group = $view.closest('.view-group');
      if ($group.length) return $group;
    }
    return $view; // fallback
  }

  function hasNoData($view) {
    // Your exact DOM signal
    return $view.find('tbody tr.kn-tr-nodata, tbody td.kn-td-nodata').length > 0;
  }

  function hideIfEmpty(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) {
      log('View not found in DOM yet:', viewId);
      return false;
    }

    markRunning($view);

    const empty = hasNoData($view);
    log('Evaluated', viewId, { empty });

    if (!empty) return false;

    const $target = findRemovalTarget($view);
    log('Removing target:', $target.get(0));

    $target.remove();
    return true;
  }

  // ======================
  // OBSERVER (handles KTL rebuilds)
  // ======================
  const OBS_BY_VIEW = new Map();

  function stopObserver(viewId) {
    const obs = OBS_BY_VIEW.get(viewId);
    if (obs) obs.disconnect();
    OBS_BY_VIEW.delete(viewId);
  }

  function startObserver(viewId) {
    stopObserver(viewId);

    // Try immediately
    hideIfEmpty(viewId);

    // Observe the *document body* because KTL sometimes swaps nodes above the view
    const obs = new MutationObserver(function () {
      // Each mutation: try again, and stop if we removed it
      const removed = hideIfEmpty(viewId);
      if (removed) stopObserver(viewId);
    });

    obs.observe(document.body, { childList: true, subtree: true });
    OBS_BY_VIEW.set(viewId, obs);

    log('Observer started for', viewId);
  }

  // ======================
  // HOOKS
  // ======================
  function init() {
    VIEW_IDS.forEach(startObserver);
  }

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, init);

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view) {
      if (!view || !VIEW_IDS.includes(view.key)) return;
      log('knack-view-render fired for', view.key);
      startObserver(view.key);
    });

  // Also run once on DOM ready (in case events already fired)
  $(init);
})();
