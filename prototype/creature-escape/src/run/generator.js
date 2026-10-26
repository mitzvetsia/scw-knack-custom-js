// Procedural ROUTE over handcrafted areas. Generated completely up front from
// the run seed (enemy rosters, item placement, mutation offer order), so a
// saved run resumes exactly; nothing is rerolled on load.

import { createRng } from '../rng.js';
import { AREAS, ZONE_THEMES } from './areas.js';
import { MUTATIONS } from '../biology/mutations.js';

const RULES = {
  zones: [3, 5],
  areasPerZone: [5, 10],      // including the exit challenge
  junctionChance: 0.5,        // chance a step is a 2–3 way choice
  offersPerArea: 3,           // offer slots filled at arrival from the shuffled order
  mutationPhase: 1            // which mutations are in the offer pool
};

export function generateRun(seed, opts = {}) {
  const rules = { ...RULES, ...opts };
  const rng = createRng(seed);
  const pool = MUTATIONS.filter(m => m.phase <= rules.mutationPhase).map(m => m.id);
  const byType = t => AREAS.filter(a => a.type === t);
  const zoneCount = rng.int(rules.zones[0], rules.zones[1]);
  const zones = [];
  let instanceCounter = 0;

  const makeInstance = (area, zoneIdx, stepIdx) => {
    const instanceId = `z${zoneIdx + 1}s${stepIdx + 1}-${area.id}-${++instanceCounter}`;
    // Everything random about the area is decided NOW.
    const enemies = (area.enemies || []).map((e, i) => ({ slot: i, type: e, hpVariance: rng.int(-1, 2) }));
    const items = (area.items || []).slice();
    const offerOrder = rng.shuffle(pool);
    return { instanceId, areaId: area.id, type: area.type, name: area.name, clue: area.clue,
      enemies, items, offerOrder, skip: area.skip || 0 };
  };

  for (let z = 0; z < zoneCount; z++) {
    const areaCount = rng.int(rules.areasPerZone[0], rules.areasPerZone[1]);
    const steps = [];
    let lastTypes = [];
    for (let s = 0; s < areaCount - 1; s++) {
      const junction = rng.next() < rules.junctionChance;
      if (junction) {
        // Meaningful alternatives: distinct types, at least one safer option.
        const types = rng.shuffle(['specimen', 'rampage', 'shortcut', 'resource', 'encounter']);
        const count = rng.int(2, 3);
        const chosen = [];
        for (const t of types) {
          if (chosen.length >= count) break;
          if (t === 'shortcut' && s >= areaCount - 3) continue; // nothing to skip near the exit
          chosen.push(t);
        }
        if (!chosen.some(t => t === 'resource' || t === 'encounter')) chosen[chosen.length - 1] = 'resource';
        const options = chosen.map(t => makeInstance(rng.pick(byType(t)), z, s));
        steps.push({ kind: 'junction', options });
      } else {
        const t = rng.next() < 0.7 ? 'encounter' : rng.pick(['rampage', 'resource']);
        const candidates = byType(t).filter(a => !lastTypes.includes(a.id));
        steps.push({ kind: 'single', options: [makeInstance(rng.pick(candidates.length ? candidates : byType(t)), z, s)] });
      }
      lastTypes = steps[steps.length - 1].options.map(o => o.areaId);
    }
    steps.push({ kind: 'exit', options: [makeInstance(rng.pick(byType('exit')), z, areaCount - 1)] });
    zones.push({ index: z, theme: ZONE_THEMES[z] || `Sector ${z + 1}`, steps });
  }

  return { seed, rngState: rng.getState(), zones, rules: { offersPerArea: rules.offersPerArea } };
}

export function routeSummary(route) {
  return route.zones.map(z => `${z.theme}: ${z.steps.length} areas (${z.steps.filter(s => s.kind === 'junction').length} junctions)`);
}
