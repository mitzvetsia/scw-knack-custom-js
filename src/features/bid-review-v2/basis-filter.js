/*** BID REVIEW V2 — BASIS COLUMN FILTER **************************************
 *
 * The basis-bid dropdown (sub-bid-diff panel, persisted to the SOW's
 * field_2942) controls WHICH bid columns the comparison grid shows: once a
 * basis bid is chosen for a SOW, only that bid's column renders — every
 * other bid column is hidden. A "Show all bids" toggle in the basis
 * column's title band brings the others back (persisted per SOW in
 * localStorage), and "Show basis only" re-hides them.
 *
 * NO basis chosen, or the K1 "no subcontractor bid" sentinel → EVERY bid
 * column hides. K1 means self-perform, so a subcontractor column is showing
 * numbers that do not apply to this SOW; and with no basis designated at all,
 * the columns were reading as though one of them were already the price. Both
 * states confused reviewers, so the sub-bid side of the grid goes away and the
 * toggle (parked in the SOW column's title band, since there's no basis column
 * to hang it on) reads "Show bids (N)" to bring them back.
 *
 * A basis that isn't one of this grid's packages → nothing hides, no toggle.
 *
 * Three modes, all honouring the same per-SOW "show all" opt-in:
 *   'all'   — no basis / K1: hide every bid column.
 *   'basis' — valid basis + 2+ columns: hide every column except the basis.
 *   'none'  — nothing to filter.
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
  // Synthetic grid id from transform.js — read through the namespace so the
  // two can't drift, with the literal as the fallback if transform hasn't
  // published yet.
  var NO_SOW = (ns.transform && ns.transform.NO_SOW) || '__no_sow__';
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

  /** Which filtering mode applies to this SOW right now — the single place
   *  the rules live, so applyToSection and hiddenFor can never disagree.
   *  Returns { mode: 'all'|'basis'|'none', basis }. */
  function modeFor(sowId, pkgIds) {
    // The synthetic "Bid items (no matching SOW)" grid (transform.js NO_SOW)
    // is ALL bid columns and has no SOW record, so it can never have a basis.
    // 'all' mode would hide every column and empty the one grid whose entire
    // job is making sure orphan bid items are never silently dropped.
    if (!sowId || sowId === NO_SOW) return { mode: 'none', basis: '' };

    var basis = basisOf(sowId);
    // No basis designated, or K1 (self-perform — no subcontractor bid exists
    // for this SOW): the whole sub-bid side of the grid is inapplicable.
    if (!basis || basis === K1_ID) {
      return { mode: pkgIds.length ? 'all' : 'none', basis: basis };
    }
    // A basis that isn't a column here — nothing to single out, leave as-is.
    if (pkgIds.indexOf(basis) === -1) return { mode: 'none', basis: basis };
    // One column that IS the basis: already showing only the basis.
    if (pkgIds.length < 2) return { mode: 'none', basis: basis };
    return { mode: 'basis', basis: basis };
  }

  /** Pkg id → true for every bid column the filter currently hides for this
   *  SOW, or null when no filtering applies. Pure read, same rules as
   *  applyToSection — transform.buildState uses it to bucket rows whose only
   *  bid cells sit on hidden columns into the Removed subgroup. In 'all' mode
   *  that means bid-only rows collapse into Removed too, which is the point:
   *  with no applicable sub bid they have nothing left to show. */
  function hiddenFor(sowId, pkgIds) {
    if (!sowId || !pkgIds || !pkgIds.length) return null;
    var m = modeFor(sowId, pkgIds);
    if (m.mode === 'none') return null;
    if (userShowAll(sowId)) return null;
    var out = Object.create(null);
    for (var i = 0; i < pkgIds.length; i++) {
      if (m.mode === 'all' || pkgIds[i] !== m.basis) out[pkgIds[i]] = true;
    }
    return out;
  }

  /** Row bucketing depends on which columns are visible (hiddenFor above) —
   *  after a toggle or basis change the grid must REBUILD, not just repaint,
   *  so husk rows move between the main grid and the Removed subgroup. */
  function rebuildGrid() {
    if (ns.data && typeof ns.data.notifyDebounced === 'function') {
      ns.data.notifyDebounced();
    }
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

    var m = modeFor(sowId, pkgIds);
    var basis = m.basis;
    var hideAll = (m.mode === 'all');
    var canFilter = (m.mode !== 'none');
    var filtering = canFilter && !userShowAll(sowId);

    var cells = section.querySelectorAll('.scw-bid-review-v2__pkg-col[data-pkg-id]');
    for (var i = 0; i < cells.length; i++) {
      var pid = cells[i].getAttribute('data-pkg-id');
      cells[i].classList.toggle(HIDE_CLS,
        filtering && (hideAll || pid !== basis));
    }
    // Let CSS/other features know the sub-bid side is gone for this SOW.
    section.classList.toggle('scw-bid-review-v2__sow--no-bids', filtering && hideAll);

    // Full-width rows (docs band, L1/L2 group headers) declare
    // colspan = packages + 3. Under table-layout:fixed the colspan defines
    // the table's column count, so with N bid columns display:none'd the
    // table still reserves N phantom columns and the visible ones don't
    // stretch — dead space on the right. Shrink those colspans to the
    // visible column count while filtering; restore from the stamped
    // original when the filter lifts (cells are rebuilt each render, so
    // stamps never go stale).
    var fullSpan = pkgIds.length + 3;
    var hiddenN = filtering ? (hideAll ? pkgIds.length : pkgIds.length - 1) : 0;
    var spans = section.querySelectorAll('td[colspan], th[colspan]');
    for (var sp = 0; sp < spans.length; sp++) {
      var sc = spans[sp];
      var orig = parseInt(sc.getAttribute('data-scw-orig-colspan') || '', 10);
      if (!isFinite(orig)) {
        orig = parseInt(sc.getAttribute('colspan') || '1', 10) || 1;
        if (orig !== fullSpan) continue;   // not a full-width row
        sc.setAttribute('data-scw-orig-colspan', String(orig));
      }
      sc.colSpan = orig - hiddenN;
    }

    // Toggle pill — lives in the basis column's title band th. Remove any
    // stale instance first (basis may have moved to a different column).
    var old = section.querySelectorAll('.' + TOGGLE_CLS);
    for (var o = 0; o < old.length; o++) old[o].parentNode.removeChild(old[o]);
    if (!canFilter) return;
    // In 'all' mode there is no basis column to hang the pill on, so it parks
    // in the SOW column's title band — the only header cell guaranteed to be
    // visible. Without this the hidden bids would be unreachable, which
    // matters most in the no-basis state: those columns are exactly what a
    // reviewer reads to CHOOSE a basis.
    var th = hideAll
      ? section.querySelector(
          '.scw-bid-review-v2__th--sow.scw-bid-review-v2__head-cell--title')
      : section.querySelector(
          '.scw-bid-review-v2__head-cell--title[data-pkg-id="' + basis + '"]');
    if (!th) return;
    var n = pkgIds.length;
    var others = n - 1;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = TOGGLE_CLS +
      (filtering ? ' ' + TOGGLE_CLS + '--filtering' : '');
    btn.setAttribute('data-scw-br-v2-basis-toggle', sowId);
    if (hideAll) {
      var why = (basis === K1_ID)
        ? 'K1 Bid is the basis — this SOW is self-performed, so no ' +
          'subcontractor bid applies.'
        : 'No basis bid has been chosen for this SOW yet.';
      if (filtering) {
        btn.textContent = 'Show bid' + (n === 1 ? '' : 's') + ' (' + n + ')';
        btn.title = why + ' ' + n + ' bid column' + (n === 1 ? ' is' : 's are') +
          ' hidden. Click to show ' + (n === 1 ? 'it' : 'them') + '.';
      } else {
        btn.textContent = 'Hide bid' + (n === 1 ? '' : 's');
        btn.title = why + ' Click to hide the bid column' +
          (n === 1 ? '' : 's') + ' again.';
      }
    } else if (filtering) {
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
      rebuildGrid();
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
      setTimeout(function () { reapply(sowId); rebuildGrid(); }, 0);
    });
  }

  ns.basisFilter = {
    applyToSection: applyToSection,
    hiddenFor:      hiddenFor,
    wire:           wire
  };
})();
/*** END BID REVIEW V2 — BASIS COLUMN FILTER **********************************/
