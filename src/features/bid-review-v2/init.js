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

  // Delegated click handler for L1 group header rows — toggles the
  // --collapsed modifier on the <tr> and hides all sibling rows that
  // belong to the same group until the next group header.
  function wireGroupCollapse() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-collapse-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-collapse-bound', '1');

    document.addEventListener('click', function (e) {
      var head = e.target.closest && e.target.closest('.scw-bid-review-v2__group-header');
      if (!head) return;
      // Don't intercept clicks on inputs / buttons inside the header.
      if (e.target.closest('input, button, select, textarea, a')) return;
      var collapsed = head.classList.toggle('scw-bid-review-v2__group-header--collapsed');
      head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      var n = head.nextElementSibling;
      while (n && !n.classList.contains('scw-bid-review-v2__group-header')) {
        if (n.classList.contains('scw-bid-review-v2__row') ||
            n.classList.contains('scw-bid-review-v2__subgroup-header')) {
          n.classList.toggle('scw-bid-review-v2__row--hidden', collapsed);
          n.classList.toggle('scw-bid-review-v2__subgroup-header--hidden', collapsed);
        }
        n = n.nextElementSibling;
      }
    });
  }

  // Delegated click on an expandable data row — toggle an expand <tr>
  // beneath it that mounts worksheet-v2's card for the matching SOW
  // item record. Reuses the same edit pipeline used on the build-SOW
  // page so the experience is identical (chips, picker, photos,
  // accessories, direct PUTs).
  function wireRowExpand() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-rowexpand-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-rowexpand-bound', '1');

    document.addEventListener('click', function (e) {
      var row = e.target.closest && e.target.closest('.scw-bid-review-v2__row--expandable');
      if (!row) return;
      // Don't intercept clicks on interactive elements inside the row.
      if (e.target.closest('input, button, select, textarea, a')) return;
      // Don't intercept clicks on the L1 group header (handled separately).
      if (e.target.closest('.scw-bid-review-v2__group-header')) return;
      toggleRowExpand(row);
    });
  }

  function toggleRowExpand(row) {
    var next = row.nextElementSibling;
    var isOpen = next && next.classList &&
      next.classList.contains('scw-bid-review-v2__expand-row');
    if (isOpen) {
      next.parentNode.removeChild(next);
      row.setAttribute('aria-expanded', 'false');
      row.classList.remove('scw-bid-review-v2__row--open');
      return;
    }
    var sowItemId = row.getAttribute('data-sow-item-id');
    if (!sowItemId) return;
    var sowRec = lookupSowRecord(sowItemId);
    if (!sowRec) {
      console.warn('[scw-br-v2] SOW item not found in model:', sowItemId);
      return;
    }

    var expand = document.createElement('tr');
    expand.className = 'scw-bid-review-v2__expand-row';
    expand.setAttribute('data-expand-for', sowItemId);
    var td = document.createElement('td');
    td.colSpan = row.children.length;
    td.className = 'scw-bid-review-v2__expand-cell';
    expand.appendChild(td);
    row.parentNode.insertBefore(expand, row.nextSibling);
    row.classList.add('scw-bid-review-v2__row--open');
    row.setAttribute('aria-expanded', 'true');

    mountWorksheetV2Card(td, sowRec);
  }

  // Find the full Backbone-style attributes hash for a SOW item id.
  // Prefer the live model so we always see the freshest values; fall
  // back to the snapshot the v2 grid was rendered against.
  function lookupSowRecord(sowItemId) {
    try {
      var sowViewKey = (ns.CONFIG.sourceViewKeys || [])[1];
      var v = sowViewKey && Knack.views && Knack.views[sowViewKey];
      if (v && v.model && v.model.data && typeof v.model.data.get === 'function') {
        var m = v.model.data.get(sowItemId);
        if (m && m.attributes) return m.attributes;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  function mountWorksheetV2Card(hostTd, sowRec) {
    var wsv2 = window.SCW && SCW.worksheetV2;
    if (!wsv2 || !wsv2.card || typeof wsv2.card.buildCard !== 'function') {
      hostTd.innerHTML =
        '<div class="scw-bid-review-v2__expand-loading">' +
          'worksheet-v2 not available — open the SOW Line Items page ' +
          'and reload to use the inline editor.' +
        '</div>';
      return;
    }
    // Force the card open so the user lands directly in the editor,
    // not on the summary header.
    var card;
    try {
      card = wsv2.card.buildCard(sowRec, (ns.CONFIG.sourceViewKeys || [])[1]);
    } catch (err) {
      console.warn('[scw-br-v2] worksheet-v2 buildCard threw', err);
      hostTd.innerHTML =
        '<div class="scw-bid-review-v2__expand-loading">' +
          'Failed to render the worksheet-v2 card — see console.' +
        '</div>';
      return;
    }
    card.classList.add('scw-ws-v2-card--open');
    hostTd.appendChild(card);
  }

  function init() {
    // Inject CSS (styles.js self-injects if not present)
    if (ns.data) ns.data.attachListeners();
    if (ns.edit && typeof ns.edit.wire === 'function') ns.edit.wire();
    wireGroupCollapse();
    wireRowExpand();
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
