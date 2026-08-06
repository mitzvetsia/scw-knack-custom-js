/*** BID REVIEW V2 — BASIS COLUMN FILTER **************************************
 *
 * The basis-bid dropdown (sub-bid-diff panel, persisted to the SOW's
 * field_2942) controls WHICH bid columns the comparison grid shows: once a
 * basis bid is chosen for a SOW, only that bid's column renders — every
 * other bid column is hidden. A "Show all bids" toggle in the basis
 * column's title band brings the others back (persisted per SOW in
 * localStorage), and "Show basis only" re-hides them.
 *
 * No basis chosen (or the K1 "no subcontractor bid" sentinel, or a basis
 * that isn't one of this grid's packages) → nothing hides, no toggle.
 *
 * DOM contract (set by card.js): every bid column cell — the four header
 * band <th>s and each body <td> — carries .scw-bid-review-v2__pkg-col +
 * data-pkg-id. Hiding a column = display:none on that whole set, same
 * selector family column-collapse.js paints.
 *
 * Public API:
 *   ns.basisFilter.applyToSection(sectionEl, sowId, pkgIds)
 *   ns.basisFilter.wire()
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  var K1_ID = 'K1';
  var HIDE_CLS   = 'scw-bid-review-v2__pkg-col--basis-hidden';
  var TOGGLE_CLS = 'scw-bid-review-v2__basis-toggle';

  function sceneId() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function storeKey(sowId) {
    return 'scw:br-v2:basisfilter-showall:' + sceneId() + ':' + (sowId || '');
  }
  function userShowAll(sowId) {
    try { return localStorage.getItem(storeKey(sowId)) === '1'; }
    catch (e) { return false; }
  }
  function setUserShowAll(sowId, on) {
    try {
      if (on) localStorage.setItem(storeKey(sowId), '1');
      else localStorage.removeItem(storeKey(sowId));
    } catch (e) {}
  }

  /** Current basis bid id for a SOW. Prefers sub-bid-diff's own resolver
   *  (session pick → persisted field_2942 → K1 snapshot) so the filter
   *  always agrees with the dropdown; falls back to reading field_2942
   *  straight off the SOW records view when sub-bid-diff isn't loaded. */
  function basisOf(sowId) {
    var sbd = window.SCW.subBidDiff;
    if (sbd && sbd.render && typeof sbd.render.basisFor === 'function') {
      try { return sbd.render.basisFor(sowId) || ''; } catch (e) {}
    }
    try {
      var C = (sbd && sbd.CONFIG) || {};
      var viewKey = C.basisBidView || 'view_3918';
      var fld = C.basisBidField || 'field_2942';
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i].attributes || {};
        if (a.id !== sowId) continue;
        var raw = a[fld + '_raw'];
        if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
        if (raw && raw.id) return raw.id;
        return '';
      }
    } catch (e2) {}
    return '';
  }

  function sectionFor(sowId) {
    return document.querySelector('.scw-bid-review-v2__sow[data-sow-id="' + sowId + '"]');
  }

  /** Distinct pkg ids present in a section's column cells (fallback when
   *  the caller doesn't supply them, e.g. re-apply on a basis change). */
  function collectPkgIds(section) {
    var out = [], seen = {};
    var cells = section.querySelectorAll('.scw-bid-review-v2__pkg-col[data-pkg-id]');
    for (var i = 0; i < cells.length; i++) {
      var pid = cells[i].getAttribute('data-pkg-id');
      if (pid && !seen[pid]) { seen[pid] = 1; out.push(pid); }
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  /** Paint one section: hide every non-basis bid column (unless the user
   *  opted into "show all"), and sync the toggle pill in the basis
   *  column's title-band cell. Idempotent — safe to re-run on every
   *  render and on every basis change. */
  function applyToSection(section, sowId, pkgIds) {
    if (!section || !sowId) return;
    if (!pkgIds || !pkgIds.length) pkgIds = collectPkgIds(section);

    var basis = basisOf(sowId);
    var valid = !!basis && basis !== K1_ID && pkgIds.indexOf(basis) !== -1;
    // Filtering is only meaningful with a valid basis and 2+ bid columns.
    var canFilter = valid && pkgIds.length >= 2;
    var filtering = canFilter && !userShowAll(sowId);

    var cells = section.querySelectorAll('.scw-bid-review-v2__pkg-col[data-pkg-id]');
    for (var i = 0; i < cells.length; i++) {
      var pid = cells[i].getAttribute('data-pkg-id');
      cells[i].classList.toggle(HIDE_CLS, filtering && pid !== basis);
    }

    // Toggle pill — lives in the basis column's title band th. Remove any
    // stale instance first (basis may have moved to a different column).
    var old = section.querySelectorAll('.' + TOGGLE_CLS);
    for (var o = 0; o < old.length; o++) old[o].parentNode.removeChild(old[o]);
    if (!canFilter) return;
    var th = section.querySelector(
      '.scw-bid-review-v2__head-cell--title[data-pkg-id="' + basis + '"]');
    if (!th) return;
    var others = pkgIds.length - 1;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = TOGGLE_CLS +
      (filtering ? ' ' + TOGGLE_CLS + '--filtering' : '');
    btn.setAttribute('data-scw-br-v2-basis-toggle', sowId);
    if (filtering) {
      btn.textContent = 'Show all bids (+' + others + ')';
      btn.title = 'This is the basis bid — ' + others + ' other bid column' +
        (others === 1 ? ' is' : 's are') + ' hidden. Click to show all bids.';
    } else {
      btn.textContent = 'Show basis only';
      btn.title = 'Hide the ' + others + ' non-basis bid column' +
        (others === 1 ? '' : 's') + ' and show only this bid.';
    }
    th.appendChild(btn);
  }

  function reapply(sowId) {
    var section = sectionFor(sowId);
    if (section) applyToSection(section, sowId, null);
  }

  function wire() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-basisfilter-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-basisfilter-bound', '1');

    // Toggle pill — flip the per-SOW "show all" preference and repaint.
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest &&
        e.target.closest('[data-scw-br-v2-basis-toggle]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var sowId = btn.getAttribute('data-scw-br-v2-basis-toggle');
      if (!sowId) return;
      setUserShowAll(sowId, !userShowAll(sowId));
      reapply(sowId);
    });

    // Basis dropdown change (sub-bid-diff selector) — repaint the section
    // once sub-bid-diff's own change handler has recorded the new pick
    // (both are document-level 'change' listeners; the timeout guarantees
    // ordering regardless of bind order).
    document.addEventListener('change', function (e) {
      var sel = e.target && e.target.closest &&
        e.target.closest('[data-scw-sbd-basis]');
      if (!sel) return;
      var sowId = sel.getAttribute('data-sow-id');
      if (!sowId) return;
      setTimeout(function () { reapply(sowId); }, 0);
    });
  }

  ns.basisFilter = {
    applyToSection: applyToSection,
    wire:           wire
  };
})();
/*** END BID REVIEW V2 — BASIS COLUMN FILTER **********************************/
