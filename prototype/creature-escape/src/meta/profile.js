// Persistent, out-of-run progression. Written IMMEDIATELY whenever something
// is committed (Imprints, secured items, unlocks). The reward ledger lives
// here — not in the run save — so a reward committed just before a crash is
// never granted twice when the older run save is reloaded.

export const PROFILE_KEY = 'creature-escape:profile';
export const RUN_KEY = 'creature-escape:run';

export function emptyProfile() {
  return { version: 1, imprints: 0, storage: [], unlocks: [], ledger: {}, runsPlayed: 0, escapes: 0, deaths: 0 };
}

export function createProfile(store) {
  let data = store.get(PROFILE_KEY) || emptyProfile();
  const save = () => store.set(PROFILE_KEY, data);

  return {
    get data() { return data; },
    save,
    reset() { data = emptyProfile(); save(); },

    // Idempotent commit: returns true only the FIRST time eventId is seen for this run.
    commit(runId, eventId, apply) {
      const seen = data.ledger[runId] || (data.ledger[runId] = []);
      if (seen.includes(eventId)) return false;
      seen.push(eventId);
      if (apply) apply(data);
      save();
      return true;
    },
    hasCommitted(runId, eventId) { return (data.ledger[runId] || []).includes(eventId); },
    addImprints(n) { data.imprints += n; save(); },
    secureItems(items) { data.storage.push(...items); save(); },
    forgetRunLedger(runId) { delete data.ledger[runId]; save(); }
  };
}

// Storage adapters: browser localStorage or an in-memory map for tests.
export function memoryStore() {
  const map = new Map();
  return {
    get: k => (map.has(k) ? JSON.parse(map.get(k)) : null),
    set: (k, v) => map.set(k, JSON.stringify(v)),
    remove: k => map.delete(k),
    // Simulate a crash: snapshot and restore raw contents.
    snapshot: () => new Map(map),
    restore: snap => { map.clear(); for (const [k, v] of snap) map.set(k, v); }
  };
}

export function localStorageStore(ls) {
  return {
    get: k => { try { const v = ls.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
    set: (k, v) => { try { ls.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    remove: k => { try { ls.removeItem(k); } catch { /* ignore */ } }
  };
}
