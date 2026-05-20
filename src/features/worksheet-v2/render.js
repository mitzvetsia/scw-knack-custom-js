/*** WORKSHEET V2 — RENDER ****************************************************
 *
 * Phase 3.B render: group tree (L1 MDF/IDF accordion → L2 proposal
 * bucket sub-headers → record cards). Replaces Phase 3.A's flat
 * card list.
 *
 * Composition: render.js owns the OUTER structure (group container,
 * L1 header bar, L2 sub-header, card list slot). card.js owns the
 * per-record card. groups.js handles the data transform. state.js
 * handles open/closed persistence.
 *
 * Mid-edit guard preserved from prior phases — if the user is
 * focused on a v2 input when a re-notify fires, defer the rebuild
 * until focus leaves. The whole tree gets rebuilt on every notify
 * for simplicity; keyed updates can come later if perf demands it.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // Defer renders while the user is mid-edit so typing isn't blown
  // away by a sibling-triggered re-notify.
  var pending = Object.create(null);

  function hasFocusInPanel(container) {
    var a = document.activeElement;
    if (!a || !container) return false;
    if (!a.hasAttribute || !a.hasAttribute('data-scw-ws-v2-field')) return false;
    return container.contains(a);
  }

  // ── Chevron used in L1 headers ──
  var L1_CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  function buildL1Header(l1, sourceViewKey) {
    var head = document.createElement('button');
    head.type = 'button';
    head.className = 'scw-ws-v2-l1-head' +
      (l1.isOpen ? ' scw-ws-v2-l1-head--open' : '') +
      (l1.isSynthetic ? ' scw-ws-v2-l1-head--synthetic' : '');
    head.setAttribute('data-scw-ws-v2-l1-toggle', l1.id);
    head.setAttribute('data-scw-ws-v2-view', sourceViewKey);
    head.setAttribute('aria-expanded', l1.isOpen ? 'true' : 'false');

    head.innerHTML =
      '<span class="scw-ws-v2-l1-chevron">' + L1_CHEVRON_SVG + '</span>' +
      '<span class="scw-ws-v2-l1-label">' + escapeHtml(l1.label) + '</span>' +
      '<span class="scw-ws-v2-l1-count">' + l1.recordCount + '</span>';

    return head;
  }

  function buildL2Header(l2) {
    var sub = document.createElement('div');
    sub.className = 'scw-ws-v2-l2-head';
    sub.innerHTML =
      '<span class="scw-ws-v2-l2-label">' + escapeHtml(l2.label) + '</span>' +
      '<span class="scw-ws-v2-l2-count">' + l2.records.length + '</span>';
    return sub;
  }

  function buildL1Block(l1, sourceViewKey) {
    var block = document.createElement('section');
    block.className = 'scw-ws-v2-l1' +
      (l1.isOpen ? ' scw-ws-v2-l1--open' : '') +
      (l1.isSynthetic ? ' scw-ws-v2-l1--synthetic' : '');
    block.setAttribute('data-scw-ws-v2-l1', l1.id);

    block.appendChild(buildL1Header(l1, sourceViewKey));

    // Body — populated even when collapsed so opening is a CSS toggle
    // (no rebuild on every accordion click). Cheap for typical row
    // counts; revisit if a single L1 ever exceeds a few hundred rows.
    var body = document.createElement('div');
    body.className = 'scw-ws-v2-l1-body';

    if (ns.card && typeof ns.card.buildCard === 'function') {
      for (var i = 0; i < l1.l2.length; i++) {
        var l2 = l1.l2[i];
        body.appendChild(buildL2Header(l2));
        for (var j = 0; j < l2.records.length; j++) {
          body.appendChild(ns.card.buildCard(l2.records[j], sourceViewKey));
        }
      }
    }

    block.appendChild(body);
    return block;
  }

  function renderView(sourceViewKey, records) {
    var container = document.getElementById('scw-ws-v2-' + sourceViewKey);
    if (!container) return;

    var body  = container.querySelector('.scw-ws-v2-body');
    var count = container.querySelector('.scw-ws-v2-count');
    if (!body) return;

    if (count) {
      count.textContent = records.length + ' record' + (records.length === 1 ? '' : 's');
    }

    if (hasFocusInPanel(container)) {
      pending[sourceViewKey] = records;
      return;
    }
    delete pending[sourceViewKey];

    if (!records.length) {
      body.innerHTML = '<div class="scw-ws-v2-empty">No records loaded from ' +
        escapeHtml(sourceViewKey) + ' yet.</div>';
      return;
    }

    if (!ns.groups || typeof ns.groups.buildGroupTree !== 'function') {
      body.innerHTML = '<div class="scw-ws-v2-empty">groups.js not loaded.</div>';
      return;
    }

    var tree = ns.groups.buildGroupTree(records);
    if (ns.state && typeof ns.state.applyOpenState === 'function') {
      ns.state.applyOpenState(sourceViewKey, tree);
    } else {
      tree.forEach(function (l1) { l1.isOpen = true; });
    }

    var frag = document.createDocumentFragment();
    for (var i = 0; i < tree.length; i++) {
      frag.appendChild(buildL1Block(tree[i], sourceViewKey));
    }

    body.innerHTML = '';
    body.appendChild(frag);
  }

  // Resume deferred renders when focus leaves the panel.
  document.addEventListener('focusout', function () {
    setTimeout(function () {
      Object.keys(pending).forEach(function (key) {
        var container = document.getElementById('scw-ws-v2-' + key);
        if (!container || hasFocusInPanel(container)) return;
        var records = pending[key];
        delete pending[key];
        renderView(key, records);
      });
    }, 0);
  }, true);

  ns.render = {
    renderView: renderView
  };
})();
/*** END WORKSHEET V2 — RENDER ************************************************/
