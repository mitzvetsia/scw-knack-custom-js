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

  // Views whose MDF/IDF (L1) groups ALWAYS default open, regardless of
  // record count — overrides the DEFAULT_OPEN_THRESHOLD. The survey/bid
  // worksheet (view_3505) is a fill-in-the-field doc: techs want every
  // MDF/IDF expanded so they can scan all locations at once (the
  // line-item CARDS default collapsed instead — see render.js
  // CARDS_DEFAULT_OPEN). Persisted user state still wins over this.
  var GROUPS_DEFAULT_OPEN = { view_3505: 1 };

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
    var defaultOpen = GROUPS_DEFAULT_OPEN[sourceViewKey] ||
                      total < DEFAULT_OPEN_THRESHOLD;

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
    // Flip just THIS L1\'s state — leave every other L1\'s entry
    // alone. Write the new state explicitly (\'open\' or \'closed\')
    // so applyOpenState\'s default-open fallback can\'t fight us:
    // on small datasets where defaultOpen=true, omitting the
    // marker would silently re-open the L1 on every render.
    state[l1Id] = currentlyOpen ? 'closed' : 'open';
    saveRaw(sourceViewKey, state);
    return state;
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

  /**
   * Force every L1 in `l1Ids` to OPEN (non-exclusive). Used by the
   * toolbar\'s "Expand all" action so individual L1 toggles still
   * work afterward without the CSS-override conflict.
   */
  function setAllOpen(sourceViewKey, l1Ids) {
    var next = {};
    for (var i = 0; i < l1Ids.length; i++) next[l1Ids[i]] = 'open';
    saveRaw(sourceViewKey, next);
    return next;
  }

  /** Force every L1 in `l1Ids` to CLOSED. Explicit "closed" marker
   *  beats the default-open threshold logic. */
  function setAllClosed(sourceViewKey, l1Ids) {
    var next = {};
    for (var i = 0; i < l1Ids.length; i++) next[l1Ids[i]] = 'closed';
    saveRaw(sourceViewKey, next);
    return next;
  }

  // ── Per-card (line-item) open state — persisted, per record ────────────
  // Only the field-facing install worksheets remember which INDIVIDUAL
  // cards a user has opened, across page loads. Everywhere else, card
  // expand/collapse is DOM-only and resets on re-render (unchanged). On
  // these views a brand-new page load — or a record nobody has ever
  // opened — defaults COLLAPSED (so its photo strip stays hidden too,
  // per the CSS rule that reveals strips only on open cards); only a
  // record the user has explicitly opened before reopens automatically
  // when they return.
  var CARD_PERSIST_VIEWS = { view_4093: 1, view_4056: 1 };
  var CARD_STORAGE_PREFIX = 'scw:ws-v2-cardopen:';

  function cardStorageKey(sourceViewKey) {
    return CARD_STORAGE_PREFIX + getSceneId() + ':' + sourceViewKey;
  }

  function persistsCardOpen(sourceViewKey) {
    return !!CARD_PERSIST_VIEWS[sourceViewKey];
  }

  /** Map of recordId → 1 for every card the user has left open on this
   *  view. Empty (not "all open") is the correct default for a view/record
   *  this function has never seen. */
  function loadOpenCardIds(sourceViewKey) {
    if (!persistsCardOpen(sourceViewKey)) return {};
    try {
      var raw = JSON.parse(localStorage.getItem(cardStorageKey(sourceViewKey)) || '{}');
      return (raw && typeof raw === 'object') ? raw : {};
    } catch (e) {
      return {};
    }
  }

  /** Record a single card's open/closed state. No-ops on views that don't
   *  persist card state (safe to call unconditionally from shared UI). */
  function setCardOpen(sourceViewKey, recordId, open) {
    if (!persistsCardOpen(sourceViewKey) || !recordId) return;
    try {
      var state = loadOpenCardIds(sourceViewKey);
      if (open) state[recordId] = 1;
      else delete state[recordId];
      localStorage.setItem(cardStorageKey(sourceViewKey), JSON.stringify(state));
    } catch (e) { /* quota / private mode — silent */ }
  }

  ns.state = {
    applyOpenState:   applyOpenState,
    toggleL1:         toggleL1,
    setOpenExclusive: setOpenExclusive,
    setAllOpen:       setAllOpen,
    setAllClosed:     setAllClosed,
    DEFAULT_OPEN_THRESHOLD: DEFAULT_OPEN_THRESHOLD,
    persistsCardOpen: persistsCardOpen,
    loadOpenCardIds:  loadOpenCardIds,
    setCardOpen:      setCardOpen
  };
})();
/*** END WORKSHEET V2 — STATE *************************************************/
