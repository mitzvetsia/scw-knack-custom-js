/*** WORKSHEET V2 — RENDER ****************************************************
 *
 * Phase 1+2 render: build one card per record using card.js's
 * buildCard, swap into the v2 panel body. Editable inputs are stamped
 * with the data-* attrs that edit.js's delegated handler consumes.
 *
 * Mutating strategy is "blow away the body, rebuild from scratch on
 * every notify". Simple and correct for the current row counts.
 * Phase 3+ may switch to keyed updates if rebuild cost becomes
 * visible at scale, but for ~100 row grids the cost is trivial.
 *
 * If the user is mid-edit on an input when a re-render fires, the
 * rebuild would lose their typing. Guard: skip the rebuild while
 * focus is on a .scw-ws-v2-input inside our panel; reschedule when
 * focus leaves. The skip is harmless because the next notify (from
 * the user's own commit) will re-render with the same data.
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

  // Track per-view "pending re-render due to focused input" so we can
  // resume the moment focus leaves. Key: sourceViewKey, value: latest
  // records snapshot that was skipped.
  var pending = Object.create(null);

  function hasFocusInPanel(container) {
    var a = document.activeElement;
    if (!a || !container) return false;
    if (!a.hasAttribute || !a.hasAttribute('data-scw-ws-v2-field')) return false;
    return container.contains(a);
  }

  /**
   * Render or re-render the v2 panel for one source view. Idempotent
   * — replaces the body content each call; the container + banner
   * scaffold is built once and reused.
   */
  function renderView(sourceViewKey, records) {
    var container = document.getElementById('scw-ws-v2-' + sourceViewKey);
    if (!container) return;

    var body  = container.querySelector('.scw-ws-v2-body');
    var count = container.querySelector('.scw-ws-v2-count');
    if (!body) return;

    if (count) {
      count.textContent = records.length + ' record' + (records.length === 1 ? '' : 's');
    }

    // If the user is actively editing one of our inputs, defer the
    // rebuild — otherwise their typing would get blown away. The
    // focusout listener at the bottom of this file resumes the
    // deferred render the moment focus leaves.
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

    if (!ns.card || typeof ns.card.buildCard !== 'function') {
      body.innerHTML = '<div class="scw-ws-v2-empty">card.js not loaded.</div>';
      return;
    }

    // Build into a DocumentFragment so the tbody / body only takes
    // one reflow at insert time.
    var frag = document.createDocumentFragment();
    for (var i = 0; i < records.length; i++) {
      frag.appendChild(ns.card.buildCard(records[i], sourceViewKey));
    }

    body.innerHTML = '';
    body.appendChild(frag);
  }

  // Resume deferred renders when focus leaves the panel.
  document.addEventListener('focusout', function () {
    // Defer one tick so document.activeElement settles to the new
    // target (which may still be inside the panel for tab-between-
    // inputs movement).
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
