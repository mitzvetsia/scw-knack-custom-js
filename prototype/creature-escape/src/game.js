// Top-level API shared by the browser UI and the node tests.
import { createProfile, RUN_KEY } from './meta/profile.js';
import * as S from './run/state.js';
import { ITEMS } from './run/areas.js';

export function createGame(store) {
  const profile = createProfile(store);
  let run = null;

  const api = {
    profile,
    get run() { return run; },
    newRun(seed, opts) { run = S.createRun(profile, seed, opts); api.save(); return run; },
    resume() { const saved = store.get(RUN_KEY); run = saved ? S.deserialize(saved) : null; return run; },
    hasSave() { return !!store.get(RUN_KEY); },
    save() { if (run) store.set(RUN_KEY, S.serialize(run)); },
    abandon() { run = null; store.remove(RUN_KEY); },

    // Every action: mutate, then persist. If the process dies between the
    // profile commit (inside the action) and this save, the profile ledger
    // still refuses to re-grant the same event on reload.
    act(type, ...args) {
      if (!run) throw new Error('No run');
      const fn = { choose: S.chooseRoute, attack: S.attack, eat: S.eat, swallow: S.swallow,
        evolve: S.takeMutation, leave: S.leaveArea, exit: S.solveExit }[type];
      if (!fn) throw new Error('Unknown action ' + type);
      fn(run, profile, ...args);
      if (S.isOver(run)) store.remove(RUN_KEY); else api.save();
      return run;
    },

    view() {
      if (!run) return null;
      const b = S.bio(run);
      const inst = run.current ? S.instance(run) : null;
      return {
        phase: run.phase, zone: run.zones[run.pos.zone], pos: run.pos, zoneCount: run.zones.length,
        stepCount: run.zones[run.pos.zone].steps.length,
        hp: run.hp, maxHp: run.maxHp, reserve: run.reserve, maxReserve: run.maxReserve,
        bio: b, offers: run.offers, encounter: run.encounter, current: inst,
        routeOptions: run.phase === S.PHASES.CHOOSE ? S.routeOptions(run) : [],
        exitPaths: S.exitPaths(run),
        stomach: run.stomach.map(id => ITEMS[id]),
        floor: inst ? (run.areaItems[inst.instanceId] || []) : [],
        atRisk: run.zoneLoot.flatMap(id => (run.areaItems[id] || []).filter(x => ITEMS[x]).map(x => ITEMS[x])),
        storage: profile.data.storage.map(id => ITEMS[id]),
        imprints: profile.data.imprints, imprintsThisRun: run.imprintsThisRun,
        log: run.log.slice(-40)
      };
    }
  };
  return api;
}

export { ITEMS };
