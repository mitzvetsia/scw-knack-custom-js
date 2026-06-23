/*** SUB-BID DIFF — INIT *****************************************************
 *
 * Mounts the sub-bid diff review panel on scene_1155 (bid review), beneath
 * the v2 comparison grid. Re-renders whenever the source views tick.
 *
 * Phase 1: read-only review surface. Phase 2 will stamp the computed diff
 * onto the SOW and surface it in the Publish-as-Final modal.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.subBidDiff;
  if (!ns || !ns.CONFIG || !ns.CONFIG.enabled) return;
  var C = ns.CONFIG;
  // No bid-review config on this scene → not scene_1155. Bail.
  if (!C.bidViewKey || !C.sowItemsViewKey) return;

  // ── collapse state (persisted per scene) ───────────────────────────────
  function collapseKey() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return 'scw:sub-bid-diff:collapsed:' + (m ? m[0] : 'default');
  }
  function loadCollapsed() {
    try { return localStorage.getItem(collapseKey()) === '1'; } catch (e) { return false; }
  }
  function saveCollapsed(v) {
    try { localStorage.setItem(collapseKey(), v ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function buildPanel() {
    var panel = document.createElement('div');
    panel.id = C.mountId;
    panel.className = 'scw-sub-bid-diff';
    if (loadCollapsed()) panel.setAttribute('data-collapsed', '1');
    panel.innerHTML =
      '<div class="scw-sbd-banner" data-scw-sbd-toggle role="button" tabindex="0" ' +
        'title="Show / hide the sub-bid diff">' +
        '<span class="scw-sbd-caret-top" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
          'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="6 9 12 15 18 9"></polyline></svg></span>' +
        '<span class="scw-sbd-pill">diff</span>' +
        '<span class="scw-sbd-banner__title">Sub-Bid vs SOW</span>' +
        '<span class="scw-sbd-summary"></span>' +
        '<span class="scw-sbd-banner__spacer"></span>' +
      '</div>' +
      '<div class="scw-sbd-body">' +
        '<div class="scw-sbd-empty">Waiting for bid + SOW views to load…</div>' +
      '</div>';
    return panel;
  }

  // Collapse toggle — bound once at the document level.
  function bindChrome() {
    if (document.documentElement.hasAttribute('data-scw-sbd-chrome-bound')) return;
    document.documentElement.setAttribute('data-scw-sbd-chrome-bound', '1');
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-scw-sbd-toggle]');
      if (!t) return;
      var panel = document.getElementById(C.mountId);
      if (!panel) return;
      var collapsed = panel.getAttribute('data-collapsed') === '1';
      if (collapsed) panel.removeAttribute('data-collapsed');
      else panel.setAttribute('data-collapsed', '1');
      saveCollapsed(!collapsed);
    });
  }

  function tryMount() {
    if (document.getElementById(C.mountId)) return true;
    // Mount at the TOP of the bid-review area — ABOVE the comparison grid —
    // since the diff is the decision surface, not an afterthought. Anchor on
    // v1's stable grid root (#bid-review-matrix, hidden when v2 replaces it),
    // then the v2 grid, then the configured grid anchor view.
    var anchor =
      document.querySelector('#bid-review-matrix') ||
      document.getElementById('scw-bid-review-v2') ||
      document.getElementById((window.SCW.bidReview &&
        window.SCW.bidReview.CONFIG &&
        window.SCW.bidReview.CONFIG.gridAnchorView) || 'view_3970');
    if (!anchor) return false;
    anchor.insertAdjacentElement('beforebegin', buildPanel());
    bindChrome();
    ns.render.bindOnce();
    ns.render.render();
    return true;
  }

  // Render on every source-view tick. Reuse the v2 data layer's subscribe
  // (already debounced + listening to the right views) when present;
  // otherwise bind our own listeners to the three source views.
  function wireData() {
    var v2 = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.data;
    if (v2 && typeof v2.subscribe === 'function') {
      v2.subscribe(function () {
        if (tryMount()) ns.render.render();
      });
      return;
    }
    var keys = [C.bidViewKey, C.sowItemsViewKey, C.bidPkgViewKey];
    var nsEvt = C.eventNs;
    var timer = null;
    function tick() {
      if (timer) return;
      timer = (window.requestAnimationFrame || setTimeout)(function () {
        timer = null;
        if (tryMount()) ns.render.render();
      }, 0);
    }
    keys.forEach(function (k) {
      $(document)
        .off('knack-view-render.' + k + nsEvt).on('knack-view-render.' + k + nsEvt, tick)
        .off('knack-cell-update.' + k + nsEvt).on('knack-cell-update.' + k + nsEvt, tick);
    });
  }

  function boot() {
    tryMount();
    wireData();
  }

  // Mount on scene render (and immediately, in case the scene already
  // rendered before this module loaded).
  if (window.SCW.onSceneRender && C.sceneKey) {
    SCW.onSceneRender(C.sceneKey, boot, C.eventNs);
  }
  $(document).off('knack-scene-render.any' + C.eventNs)
    .on('knack-scene-render.any' + C.eventNs, function () {
      if ((document.body.id || '').indexOf(C.sceneKey) !== -1) boot();
    });
  // Late-load safety: if the scene is already up, boot now.
  if ((document.body.id || '').indexOf(C.sceneKey || '@@') !== -1) boot();
})();
/*** END SUB-BID DIFF — INIT *************************************************/
