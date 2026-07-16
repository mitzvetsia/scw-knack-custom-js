/*** BID REVIEW V2 — TOOLBAR **************************************************
 *
 * Comparison-grid toolbar. CTA actions only — the expand/collapse-all
 * control now lives per-SOW (in each SOW header, wired in init.js), since
 * it folds the MDF/IDF groups WITHIN one SOW rather than the whole grid.
 *
 *   - + Add to SOW  : reuse Knack's "Add to Scope" link
 *   - + Add Photos  : SCW.bulkUpload modal (SOW photo context)
 *
 * Reuses worksheet-v2's .scw-ws-v2-toolbar* CSS (injected globally).
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function getContainer() {
    return document.getElementById(ns.CONFIG && ns.CONFIG.mountId);
  }

  function btn(action, label, title, cta) {
    return '<button type="button" class="scw-ws-v2-toolbar-btn' +
      (cta ? ' scw-ws-v2-toolbar-btn--cta' : '') + '" ' +
      'data-scw-br-v2-tb="' + action + '" title="' + esc(title) + '">' +
      esc(label) + '</button>';
  }

  function build() {
    var bar = document.createElement('div');
    bar.className = 'scw-ws-v2-toolbar scw-bid-review-v2__toolbar';
    bar.innerHTML =
      '<div class="scw-ws-v2-toolbar-group" role="group" aria-label="View">' +
        // Expand⇄collapse every line item's detail panel across the whole
        // grid. Label flips with the live state (syncLabels below). Same
        // idiom as worksheet-v2's "Expand line items" button.
        '<button type="button" class="scw-ws-v2-toolbar-btn" ' +
          'data-scw-br-v2-tb="rows-toggle" ' +
          'title="Open or close every line item’s detail panel">' +
          'Expand line items</button>' +
      '</div>' +
      '<div class="scw-ws-v2-toolbar-spacer"></div>' +
      '<div class="scw-ws-v2-toolbar-group scw-ws-v2-toolbar-group--cta">' +
        btn('add-sow',    '+ Add to SOW', 'Add a new SOW line item', true) +
        btn('add-photos', '+ Add Photos', 'Bulk upload photos to this SOW', true) +
      '</div>';
    return bar;
  }

  // ── + Add to SOW — reuse Knack's own "Add to Scope" link ──────
  // view_4001 is the dedicated add-to-SOW menu view on scene_1155
  // (hidden by hide-data-source-views.js); its link opens the
  // view_4002 multi-add form. Clicking the hidden anchor still
  // navigates — Knack hash links don't need the element visible.
  var ADD_SOW_MENU_VIEW = 'view_4001';

  function handleAddSow() {
    var menuLink = document.querySelector(
      '#' + ADD_SOW_MENU_VIEW + ' a.kn-link-page, ' +
      '#' + ADD_SOW_MENU_VIEW + ' a.kn-link, ' +
      '#' + ADD_SOW_MENU_VIEW + ' a[href]'
    );
    if (menuLink) {
      menuLink.click();
      return;
    }
    // Fallback: text-match any add link on the page (pre-view_4001 behavior).
    var candidates = [
      'Add to Scope', 'Add Line Item', 'Add SOW Line Item',
      'Add Scope of Work Line Item', 'Add Bid Item', 'Add Survey Item'
    ];
    var anchors = document.querySelectorAll('a.kn-link, .kn-link-page, a');
    for (var ci = 0; ci < anchors.length; ci++) {
      var txt = (anchors[ci].textContent || '').trim();
      for (var ti = 0; ti < candidates.length; ti++) {
        if (txt.toLowerCase() === candidates[ti].toLowerCase() &&
            anchors[ci].getAttribute('href')) {
          anchors[ci].click();
          return;
        }
      }
    }
    alert('Could not find the "Add to Scope" link on this page. ' +
          'Make sure the Knack details/menu link is enabled on the scene.');
  }

  // ── + Add Photos — SCW.bulkUpload modal (project context) ─────
  function handleAddPhotos() {
    var bu = window.SCW && window.SCW.bulkUpload;
    if (!bu || typeof bu.open !== 'function' || !bu.config) {
      alert('Bulk upload is not loaded. Refresh the page and try again.');
      return;
    }
    var views = bu.config.VIEWS || [];
    var viewCfg = null;
    for (var i = 0; i < views.length; i++) {
      if (views[i].menuViewId === 'view_3482') { viewCfg = views[i]; break; }
    }
    if (!viewCfg) { alert('Bulk upload config for SOW photos not found.'); return; }

    // The bid-review comparison grid (scene_1155) is always PROJECT-scoped:
    // canonical route #team-calendar/project-dashboard/<projectId>/review-bids/
    // <projectId>, top-level routes carry the project id as the only 24-hex
    // segment. Resolve like v1's getProjectId and always label it projectID.
    var hash = (window.location.hash || '').split('?')[0];
    var recordId = '';
    var m = hash.match(/project-dashboard\/([a-f0-9]{24})/i);
    if (m) recordId = m[1];
    else { m = hash.match(/[a-f0-9]{24}/i); if (m) recordId = m[0]; }
    if (!recordId) {
      alert('Could not determine record id from URL — open the bulk-photo modal from a SOW or project page.');
      return;
    }
    bu.open($.extend({}, viewCfg, { linkField: 'projectID' }), recordId);
  }

  /** Mount the toolbar once, between the banner and the grid body. The bar
   *  lives outside .scw-bid-review-v2-body so it survives body re-renders. */
  function mount() {
    var c = getContainer();
    if (!c) return;
    var bar = c.querySelector(':scope > .scw-bid-review-v2__toolbar');
    if (bar) return;
    bar = build();
    var body = c.querySelector('.scw-bid-review-v2-body');
    if (body) c.insertBefore(bar, body);
    else c.appendChild(bar);

    bar.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-scw-br-v2-tb]');
      if (!t || !bar.contains(t)) return;
      var action = t.getAttribute('data-scw-br-v2-tb');
      if (action === 'add-sow') handleAddSow();
      else if (action === 'add-photos') handleAddPhotos();
      else if (action === 'rows-toggle') {
        if (typeof ns.toggleAllRows === 'function') ns.toggleAllRows(syncLabels);
        syncLabels();
      }
    });

    // Floating bottom-right dock for the CTA cluster once the toolbar
    // scrolls off the top — shared worksheet-v2 helper (clones the
    // buttons; clicks proxy back to the originals wired above).
    var wsTb = window.SCW && SCW.worksheetV2 && SCW.worksheetV2.toolbar;
    if (wsTb && typeof wsTb.attachFloatingCtas === 'function') {
      wsTb.attachFloatingCtas(bar, c);
    }

    syncLabels();
  }

  /** Keep the "Expand/Collapse line items" label in sync with the live grid
   *  state — any row open ⇒ the next click collapses everything, else it
   *  expands. Called on mount, after every render, and after each row toggle. */
  function syncLabels() {
    var c = getContainer();
    if (!c) return;
    var bar = c.querySelector(':scope > .scw-bid-review-v2__toolbar');
    if (!bar) return;
    var b = bar.querySelector('[data-scw-br-v2-tb="rows-toggle"]');
    if (!b) return;
    var open = (typeof ns.anyRowOpen === 'function') && ns.anyRowOpen();
    b.textContent = open ? 'Collapse line items' : 'Expand line items';
  }

  ns.toolbar = { mount: mount, syncLabels: syncLabels };
})();
/*** END BID REVIEW V2 — TOOLBAR **********************************************/
