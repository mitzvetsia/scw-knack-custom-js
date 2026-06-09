/*** BID REVIEW V2 — TOOLBAR **************************************************
 *
 * Ports the v2 device-worksheet toolbar onto the comparison grid —
 * everything EXCEPT the show/hide photos toggle:
 *
 *   - Expand all / Collapse all : open / fold every SOW section + L1 group
 *   - Summary only              : SOW sections open, every L1 group folded
 *                                 to its header (high-level summary)
 *   - + Add to SOW              : reuse Knack's "Add to Scope" link
 *   - + Add Photos              : SCW.bulkUpload modal (SOW photo context)
 *
 * Reuses worksheet-v2's .scw-ws-v2-toolbar* CSS (injected globally at load)
 * so the bar looks identical to the Build-SOW grid.
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
  function each(nodeList, fn) {
    for (var i = 0; i < nodeList.length; i++) fn(nodeList[i], i);
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
      '<div class="scw-ws-v2-toolbar-group" role="group" aria-label="View mode">' +
        btn('expand',  'Expand all',   'Open every SOW section + group') +
        // "Summary only" temporarily deprecated — per-L1 summary panels
        // aren't enabled on the comparison grid yet. Re-add once they are.
      '</div>' +
      '<div class="scw-ws-v2-toolbar-spacer"></div>' +
      '<div class="scw-ws-v2-toolbar-group scw-ws-v2-toolbar-group--cta">' +
        btn('add-sow',    '+ Add to SOW', 'Add a new SOW line item', true) +
        btn('add-photos', '+ Add Photos', 'Bulk upload photos to this SOW', true) +
      '</div>';
    return bar;
  }

  // ── expand / collapse / summary ──────────────────────────────
  function hideGroupRows(head, hidden) {
    var n = head.nextElementSibling;
    while (n && !n.classList.contains('scw-bid-review-v2__group-header')) {
      if (n.classList.contains('scw-bid-review-v2__row') ||
          n.classList.contains('scw-bid-review-v2__subgroup-header')) {
        n.classList.toggle('scw-bid-review-v2__row--hidden', hidden);
        n.classList.toggle('scw-bid-review-v2__subgroup-header--hidden', hidden);
      }
      n = n.nextElementSibling;
    }
  }

  function expandAll(c) {
    each(c.querySelectorAll('.scw-bid-review-v2__sow'), function (s) {
      s.classList.remove('scw-bid-review-v2__sow--collapsed');
      var h = s.querySelector('.scw-bid-review-v2__sow-header');
      if (h) h.setAttribute('aria-expanded', 'true');
    });
    each(c.querySelectorAll('.scw-bid-review-v2__group-header'), function (head) {
      head.classList.remove('scw-bid-review-v2__group-header--collapsed');
      head.setAttribute('aria-expanded', 'true');
      hideGroupRows(head, false);
    });
  }

  function collapseAll(c) {
    each(c.querySelectorAll('.scw-bid-review-v2__sow'), function (s) {
      s.classList.add('scw-bid-review-v2__sow--collapsed');
      var h = s.querySelector('.scw-bid-review-v2__sow-header');
      if (h) h.setAttribute('aria-expanded', 'false');
    });
  }

  function summaryOnly(c) {
    each(c.querySelectorAll('.scw-bid-review-v2__sow'), function (s) {
      s.classList.remove('scw-bid-review-v2__sow--collapsed');
      var h = s.querySelector('.scw-bid-review-v2__sow-header');
      if (h) h.setAttribute('aria-expanded', 'true');
    });
    each(c.querySelectorAll('.scw-bid-review-v2__group-header'), function (head) {
      head.classList.add('scw-bid-review-v2__group-header--collapsed');
      head.setAttribute('aria-expanded', 'false');
      hideGroupRows(head, true);
    });
  }

  function isFullyExpanded(c) {
    return !c.querySelector(
      '.scw-bid-review-v2__sow--collapsed, .scw-bid-review-v2__group-header--collapsed');
  }

  function refreshLabels(c, bar) {
    var expandBtn = bar.querySelector('[data-scw-br-v2-tb="expand"]');
    if (expandBtn) {
      expandBtn.textContent = isFullyExpanded(c) ? 'Collapse all' : 'Expand all';
    }
  }

  // ── + Add to SOW — reuse Knack's own "Add to Scope" link ──────
  function handleAddSow() {
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
    if (!bar) {
      bar = build();
      var body = c.querySelector('.scw-bid-review-v2-body');
      if (body) c.insertBefore(bar, body);
      else c.appendChild(bar);

      bar.addEventListener('click', function (e) {
        var t = e.target && e.target.closest && e.target.closest('[data-scw-br-v2-tb]');
        if (!t || !bar.contains(t)) return;
        var action = t.getAttribute('data-scw-br-v2-tb');
        var cont = getContainer();
        if (!cont) return;
        if (action === 'expand') {
          if (isFullyExpanded(cont)) collapseAll(cont); else expandAll(cont);
          var sb = bar.querySelector('[data-scw-br-v2-tb="summary"]');
          if (sb) sb.classList.remove('scw-ws-v2-toolbar-btn--active');
        } else if (action === 'summary') {
          var on = t.classList.toggle('scw-ws-v2-toolbar-btn--active');
          if (on) summaryOnly(cont); else expandAll(cont);
        } else if (action === 'add-sow') {
          handleAddSow();
        } else if (action === 'add-photos') {
          handleAddPhotos();
        }
        refreshLabels(cont, bar);
      });
    }
    refreshLabels(c, bar);
  }

  ns.toolbar = { mount: mount };
})();
/*** END BID REVIEW V2 — TOOLBAR **********************************************/
