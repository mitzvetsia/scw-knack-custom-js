/*** SUB-BID DIFF — INIT *****************************************************
 *
 * On scene_1155 (bid review), injects a compact per-SOW diff block INTO each
 * SOW section of the v2 comparison grid (under its header) — so each review
 * is co-located with the SOW it belongs to, not a detached top panel.
 *
 * Re-injects on every source-view tick (v2 rebuilds its section innerHTML on
 * each tick, wiping our block), deferred one frame so it runs AFTER v2's
 * synchronous rebuild. The diff is computed here; the basis (field_2942) +
 * snapshot (field_2941) it stamps travel on the SOW and gate Publish-as-Final.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.subBidDiff;
  if (!ns || !ns.CONFIG || !ns.CONFIG.enabled) return;
  var C = ns.CONFIG;
  // No bid-review config on this scene → not scene_1155. Bail.
  if (!C.bidViewKey || !C.sowItemsViewKey) return;

  // Coalesce ticks into one deferred render that runs after v2 rebuilds.
  var _scheduled = false;
  function scheduleRender() {
    if (_scheduled) return;
    _scheduled = true;
    (window.requestAnimationFrame || function (f) { setTimeout(f, 16); })(function () {
      _scheduled = false;
      try { ns.render.render(); } catch (e) { /* fail soft */ }
    });
  }

  // Re-inject on every source-view tick. Bind the source-view render events
  // directly (so we catch v2's render even if we subscribed after its first
  // data notify) AND subscribe to the v2 data layer when present.
  // A DATA-change tick: mark the buildState memo dirty, then render. Only the
  // real data signals (v2 notify + Knack view-render / cell-update) call this;
  // the timed load retries call scheduleRender() alone, so they reuse the
  // cached state and just inject into any late-appearing sections instead of
  // recomputing the ~800-line transform each time (the slow-load fix).
  function dirtyRender() {
    if (ns.render && typeof ns.render.markDirty === 'function') ns.render.markDirty();
    scheduleRender();
  }

  function wireData() {
    var v2 = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.data;
    if (v2 && typeof v2.subscribe === 'function') v2.subscribe(dirtyRender);
    var keys = [C.bidViewKey, C.sowItemsViewKey, C.bidPkgViewKey];
    var nsEvt = C.eventNs;
    keys.forEach(function (k) {
      $(document)
        .off('knack-view-render.' + k + nsEvt).on('knack-view-render.' + k + nsEvt, dirtyRender)
        .off('knack-cell-update.' + k + nsEvt).on('knack-cell-update.' + k + nsEvt, dirtyRender);
    });
  }

  function boot() {
    ns.render.bindOnce();
    wireData();
    // Initial inject + a few retries to catch v2 rendering its sections late.
    scheduleRender();
    [150, 500, 1200].forEach(function (ms) { setTimeout(scheduleRender, ms); });
  }

  if (window.SCW.onSceneRender && C.sceneKey) {
    SCW.onSceneRender(C.sceneKey, boot, C.eventNs);
  }
  $(document).off('knack-scene-render.any' + C.eventNs)
    .on('knack-scene-render.any' + C.eventNs, function () {
      if ((document.body.id || '').indexOf(C.sceneKey) !== -1) boot();
    });
  if ((document.body.id || '').indexOf(C.sceneKey || '@@') !== -1) boot();
})();
/*** END SUB-BID DIFF — INIT *************************************************/
