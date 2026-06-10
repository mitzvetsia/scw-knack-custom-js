/*** BID REVIEW V2 — COLUMN COLLAPSE ******************************************
 *
 * Port of v1's collapsible bid (subcontractor) columns. A reviewer can fold
 * a bid column down to a thin vertical strip to get it out of the way; the
 * strip carries a « expand handle to bring it back. State is per
 * sowId::pkgId, persisted to localStorage so it survives grid re-renders
 * and reloads.
 *
 * DOM contract (set by card.js):
 *   - every bid cell (header th bands + body td) carries
 *     .scw-bid-review-v2__pkg-col + data-pkg-id
 *   - the title-band th also carries the collapse (») + expand («) controls
 *
 * Public API:
 *   ns.columnCollapse.isCollapsed(sowId, pkgId)
 *   ns.columnCollapse.applyToSection(sectionEl, sowId, pkgIds)
 *   ns.columnCollapse.wire()
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  function sceneId() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function key(sowId, pkgId) {
    return 'scw:br-v2:colcollapse:' + sceneId() + ':' + (sowId || '') + ':' + (pkgId || '');
  }

  function isCollapsed(sowId, pkgId) {
    try { return localStorage.getItem(key(sowId, pkgId)) === '1'; }
    catch (e) { return false; }
  }
  function store(sowId, pkgId, collapsed) {
    try {
      if (collapsed) localStorage.setItem(key(sowId, pkgId), '1');
      else localStorage.removeItem(key(sowId, pkgId));
    } catch (e) {}
  }

  function sectionFor(sowId) {
    return document.querySelector('.scw-bid-review-v2__sow[data-sow-id="' + sowId + '"]');
  }

  // Toggle the --collapsed class on every cell in one bid column.
  function paintColumn(section, pkgId, collapsed) {
    if (!section) return;
    var cells = section.querySelectorAll(
      '.scw-bid-review-v2__pkg-col[data-pkg-id="' + pkgId + '"]');
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.toggle('scw-bid-review-v2__pkg-col--collapsed', collapsed);
    }
  }

  function setCollapsed(sowId, pkgId, collapsed) {
    store(sowId, pkgId, collapsed);
    paintColumn(sectionFor(sowId), pkgId, collapsed);
  }

  // Re-assert persisted collapse state across a section's columns. Called
  // after each render (card.js) since the body/thead are rebuilt.
  function applyToSection(section, sowId, pkgIds) {
    if (!section || !pkgIds) return;
    for (var i = 0; i < pkgIds.length; i++) {
      if (isCollapsed(sowId, pkgIds[i])) paintColumn(section, pkgIds[i], true);
    }
  }

  function wire() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-colcollapse-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-colcollapse-bound', '1');
    document.addEventListener('click', function (e) {
      var ctl = e.target && e.target.closest && e.target.closest(
        '[data-scw-br-v2-colcollapse], [data-scw-br-v2-colexpand]');
      if (!ctl) return;
      e.preventDefault();
      e.stopPropagation();
      var collapse = ctl.hasAttribute('data-scw-br-v2-colcollapse');
      var attr = collapse ? 'data-scw-br-v2-colcollapse' : 'data-scw-br-v2-colexpand';
      var pair = (ctl.getAttribute(attr) || '').split('::');
      if (pair.length === 2) setCollapsed(pair[0], pair[1], collapse);
    });
  }

  ns.columnCollapse = {
    isCollapsed:    isCollapsed,
    setCollapsed:   setCollapsed,
    applyToSection: applyToSection,
    wire:           wire
  };
})();
/*** END BID REVIEW V2 — COLUMN COLLAPSE **************************************/
