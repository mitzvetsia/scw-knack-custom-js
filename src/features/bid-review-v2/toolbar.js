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

  // ── + Add Photos — SCW.bulkUpload modal (SOW context) ─────────
  function buildSowBasePath() {
    var hash = window.location.hash || '';
    var patterns = [
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/build-(?:sow|quote)\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/review-bids\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/deploy\/[a-f0-9]{24})/,
      /(sales-portal\/company-details\/[a-f0-9]{24}\/scope-of-work-details\/[a-f0-9]{24})/,
      /(proposals\/scope-of-work\/[a-f0-9]{24})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = hash.match(patterns[i]);
      if (m) return m[1];
    }
    return '';
  }

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

    var hash = window.location.hash || '';
    var contexts = [
      { linkField: 'projectID', hashPattern: /project-dashboard\/([a-f0-9]{24})/ },
      { linkField: 'sowID',     hashPattern: /(?:scope-of-work-details|build-sow)\/([a-f0-9]{24})/ }
    ];
    var recordId = '', linkField = '';
    for (var c = 0; c < contexts.length; c++) {
      var m = hash.match(contexts[c].hashPattern);
      if (m && m[1]) { recordId = m[1]; linkField = contexts[c].linkField; break; }
    }
    if (!recordId) {
      var base = buildSowBasePath();
      var fb = base && base.match(/\/([a-f0-9]{24})\/?$/);
      if (fb) { recordId = fb[1]; linkField = viewCfg.linkField || 'sowID'; }
    }
    if (!recordId) {
      alert('Could not determine record id from URL — open the bulk-photo modal from a SOW or project page.');
      return;
    }
    bu.open($.extend({}, viewCfg, { linkField: linkField }), recordId);
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
    });
  }

  ns.toolbar = { mount: mount };
})();
/*** END BID REVIEW V2 — TOOLBAR **********************************************/
