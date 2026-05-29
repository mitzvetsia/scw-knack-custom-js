/*** WORKSHEET V2 — STATE *****************************************************
 *
 * localStorage-backed per-L1 open/closed state for the v2 worksheet
 * accordion. Matches v1's persistence conventions:
 *
 *   Storage key: scw:ws-v2-collapse:<sceneId>:<sourceViewKey>
 *   Stored as JSON: { <l1Id>: 'open' | 'closed', ... }
 *
 * Default behavior at first render:
 *   - If recordCount < DEFAULT_OPEN_THRESHOLD → all L1s default open.
 *   - Otherwise → all L1s default closed, user clicks one to open.
 *
 * Exclusive behavior: only ONE L1 may be 'open' at a time per view —
 * opening a second L1 implicitly closes the first. Matches v1's
 * view_3610 / view_3921 settings (exclusive: true).
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  var DEFAULT_OPEN_THRESHOLD = 30;
  var STORAGE_PREFIX = 'scw:ws-v2-collapse:';

  function getSceneId() {
    var bodyId = document.body && document.body.id;
    if (bodyId) {
      var m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    var sceneEl = document.querySelector('[id^="kn-scene_"]');
    if (sceneEl) {
      var m2 = sceneEl.id.match(/scene_\d+/);
      if (m2) return m2[0];
    }
    return 'scene_unknown';
  }

  function storageKey(sourceViewKey) {
    return STORAGE_PREFIX + getSceneId() + ':' + sourceViewKey;
  }

  function loadRaw(sourceViewKey) {
    try {
      return JSON.parse(localStorage.getItem(storageKey(sourceViewKey)) || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveRaw(sourceViewKey, state) {
    try {
      localStorage.setItem(storageKey(sourceViewKey), JSON.stringify(state));
    } catch (e) { /* quota / private mode — silent */ }
  }

  /**
   * Apply persisted state to a freshly built group tree. Mutates each
   * L1 node, adding `.isOpen` (boolean).
   *
   * If no persisted state exists for a view, apply defaults: all open
   * if total record count < DEFAULT_OPEN_THRESHOLD, else all closed.
   *
   * @param {string} sourceViewKey
   * @param {Array<Object>} l1List  — group tree from groups.buildGroupTree
   */
  function applyOpenState(sourceViewKey, l1List) {
    var state = loadRaw(sourceViewKey);
    var hasPersistedState = Object.keys(state).length > 0;

    var total = 0;
    for (var i = 0; i < l1List.length; i++) total += l1List[i].recordCount || 0;
    var defaultOpen = total < DEFAULT_OPEN_THRESHOLD;

    for (var j = 0; j < l1List.length; j++) {
      var l1 = l1List[j];
      if (hasPersistedState && state[l1.id]) {
        l1.isOpen = state[l1.id] === 'open';
      } else {
        l1.isOpen = defaultOpen;
      }
    }
  }

  /**
   * Toggle a single L1's open/closed state in storage. Enforces
   * exclusive semantics — opening one L1 closes all others. Returns
   * the new state map.
   */
  function toggleL1(sourceViewKey, l1Id) {
    var state = loadRaw(sourceViewKey);
    var currentlyOpen = state[l1Id] === 'open';

    // Wipe and re-set — exclusive accordion means only one L1 is
    // ever in the 'open' slot. Closed L1s persist as 'closed' so
    // the next render's defaults logic stays honored.
    var next = {};
    if (!currentlyOpen) next[l1Id] = 'open';
    // Don't bother recording explicit 'closed' for every group — an
    // empty state is treated as "use defaults", which avoids storage
    // bloat as more L1s appear over time. The presence/absence of
    // exactly one 'open' is all we need.

    saveRaw(sourceViewKey, next);
    return next;
  }

  /**
   * Force a specific L1 open (exclusive — closes any other open L1).
   * Used by render.js when a cascade moves a record into a different
   * MDF/IDF and we need to make sure the new L1 is visible.
   */
  function setOpenExclusive(sourceViewKey, l1Id) {
    if (!l1Id) return;
    var next = {};
    next[l1Id] = 'open';
    saveRaw(sourceViewKey, next);
  }

  ns.state = {
    applyOpenState:   applyOpenState,
    toggleL1:         toggleL1,
    setOpenExclusive: setOpenExclusive,
    DEFAULT_OPEN_THRESHOLD: DEFAULT_OPEN_THRESHOLD
  };
})();
/*** END WORKSHEET V2 — STATE *************************************************/
