/*** BID REVIEW V2 — STATE ****************************************************
 *
 * In-memory state for the v2 panel. Mirrors worksheet-v2/state.js but
 * the bid-review grid has different persistence needs (no L1 accordion
 * like the worksheet — instead per-SOW section open/closed + per-row
 * expand-panel open/closed). Starts minimal; grows as features land.
 *
 * Persistence model:
 *   - SOW section open/closed: localStorage, keyed by scene + sowId.
 *   - Row expand panel: in-memory only (cleared on full re-render).
 *   - In-flight edit lock: in-memory (read by render to defer rebuild
 *     while a user is mid-edit).
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns) return;

  var STORAGE_PREFIX = 'scw:bid-review-v2-sow-collapse:';

  function getSceneId() {
    var bodyId = document.body && document.body.id;
    if (bodyId) {
      var m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    return 'scene_unknown';
  }

  function storageKey() {
    return STORAGE_PREFIX + getSceneId();
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); }
    catch (e) { return {}; }
  }

  function save(state) {
    try { localStorage.setItem(storageKey(), JSON.stringify(state)); }
    catch (e) { /* quota / private mode — silent */ }
  }

  function isSowOpen(sowId) {
    var s = load();
    // Default: open. Users explicitly collapse sections; we don't
    // hide them by default because the grid IS the SOW comparison.
    return s[sowId] !== 'closed';
  }

  function toggleSow(sowId) {
    var s = load();
    s[sowId] = s[sowId] === 'closed' ? 'open' : 'closed';
    save(s);
    return s[sowId];
  }

  // In-memory expand state for the per-row expand panel (photo viewer
  // + bid-cell detail). Cleared on full re-render.
  var _expandedRows = Object.create(null);

  function isRowExpanded(rowId) { return !!_expandedRows[rowId]; }
  function setRowExpanded(rowId, expanded) {
    if (expanded) _expandedRows[rowId] = true;
    else delete _expandedRows[rowId];
  }
  function clearExpandedRows() { _expandedRows = Object.create(null); }

  ns.state = {
    isSowOpen:        isSowOpen,
    toggleSow:        toggleSow,
    isRowExpanded:    isRowExpanded,
    setRowExpanded:   setRowExpanded,
    clearExpandedRows: clearExpandedRows
  };
})();
/*** END BID REVIEW V2 — STATE ************************************************/
