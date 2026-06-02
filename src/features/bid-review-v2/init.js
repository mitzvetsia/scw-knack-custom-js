/*** BID REVIEW V2 — INIT *****************************************************
 *
 * Mounts the v2 panel beneath v1's bid-review grid on scene_1155.
 * Subscribes to Knack render events for every source view so the panel
 * re-renders whenever any underlying data changes.
 *
 * Mount sequence:
 *   1. On scene render, look for v1's #bid-review-matrix. If present,
 *      insert v2's panel as its next sibling.
 *   2. If v1 hasn't mounted yet (race), fall back to the gridAnchorView
 *      (#view_3970) so v2 still appears on the page. The next render
 *      will move it next to v1 once v1 mounts.
 *   3. Idempotent — re-running tryMount on subsequent renders is a no-op
 *      thanks to the container-id guard.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns || !ns.CONFIG || !ns.CONFIG.enabled) return;
  if (!ns.CONFIG.fieldKeys) {
    // v1 config never loaded — bid-review/config.js not on this scene.
    // Bail silently. v2 is scoped to scene_1155 where v1 lives.
    return;
  }

  function buildPanel() {
    var panel = document.createElement('div');
    panel.id = ns.CONFIG.mountId;
    panel.className = 'scw-bid-review-v2';

    var banner = document.createElement('div');
    banner.className = 'scw-bid-review-v2-banner';
    banner.innerHTML =
      '<span class="scw-bid-review-v2-pill">v2 preview</span>' +
      '<span>' + ns.CONFIG.bannerLabel + '</span>' +
      '<span class="scw-bid-review-v2-count">0 records</span>';
    panel.appendChild(banner);

    var body = document.createElement('div');
    body.className = 'scw-bid-review-v2-body';
    body.innerHTML = '<div class="scw-bid-review-v2-empty">' +
      'Waiting for source views to load…</div>';
    panel.appendChild(body);

    return panel;
  }

  function tryMount() {
    if (document.getElementById(ns.CONFIG.mountId)) return;
    var anchor = document.querySelector(ns.CONFIG.mountAfterSelector);
    if (!anchor) {
      anchor = document.querySelector(ns.CONFIG.mountFallbackSelector);
    }
    if (!anchor) return;
    var panel = buildPanel();
    anchor.insertAdjacentElement('afterend', panel);

    if (ns.CONFIG.replaceV1) {
      document.documentElement.setAttribute('data-scw-bid-review-v2-replace', '1');
    }

    // Initial paint — v1 may have already loaded the records.
    if (ns.data && ns.render) ns.render.renderSnapshot(ns.data.readAll());
  }

  function init() {
    // Inject CSS (styles.js self-injects if not present)
    if (ns.data) ns.data.attachListeners();
    if (ns.edit && typeof ns.edit.wire === 'function') ns.edit.wire();
    if (ns.data && ns.render) {
      ns.data.subscribe(function (snapshot) {
        ns.render.renderSnapshot(snapshot);
      });
    }

    // Mount on scene render so the anchor element exists.
    var sceneKey = ns.CONFIG.sceneKey;
    if (sceneKey && window.SCW && typeof SCW.onSceneRender === 'function') {
      SCW.onSceneRender(sceneKey, function () {
        // Defer one tick — v1's init.js also mounts on scene render and
        // we want v2 to land beneath it, not above it.
        setTimeout(tryMount, 0);
      }, 'scwBidReviewV2');
    } else {
      // Fallback: try once now, and again on document ready.
      tryMount();
      $(document).ready(tryMount);
    }
  }

  if (window.SCW && SCW.CONFIG && SCW.CONFIG.debug) {
    console.log('[scw-br-v2] init', { config: ns.CONFIG });
  }
  init();
})();
/*** END BID REVIEW V2 — INIT *************************************************/
