// THE single authoritative biological state.
//
//   evolution history  →  current anatomy  →  active capabilities  →  ability chains
//
// Combat, UI, AI and inventory never decide for themselves what the creature can
// do: they call resolveBiology(history) and read the result. Nothing in here is
// a per-pair special case — every outcome falls out of general rules evaluated
// over the mutation data (slots, geometry zones, appendage budget, mass,
// resource pools, capability dependencies).

import { getMutation } from './mutations.js';
import { deriveAbilities } from './abilities.js';

// Baseline specimen body used when no frame mutation has been chosen.
export const BASELINE_FRAME = {
  id: 'baseline-body', name: 'Baseline Specimen Body', appendageBudget: 4, mass: 15,
  stats: { speed: 5, turn: 5, stop: 5, force: 3, reposition: 4 }
};

// How many structures a geometry zone can host before the next one is obstructed.
const ZONE_CAPACITY = {
  'mouth-front': 1, 'mouth-inner': 1, 'limb-tips': 1, 'limb-lateral': 1,
  'head-sensor': 2, 'dorsal': 3
};

// Shared resource pools: structures that list `pool` draw from the same budget.
const POOLS = {
  venom: { capacity: 4, perTurn: 1 },
  acid: { capacity: 3, perTurn: 1 },
  charge: { capacity: 3, perTurn: 1 }
};

const MASS_PENALTY_START = 30;   // above this total mass, turn/stop/reposition degrade
const MASS_PENALTY_STEP = 15;    // one point per step

const STAT_KEYS = ['speed', 'turn', 'stop', 'force', 'reposition', 'armor', 'lateral', 'leap',
  'airControl', 'knockbackResist', 'reaction', 'precision', 'regenMultiplier', 'fineInterference'];

export function resolveBiology(history) {
  const explanations = [];
  const anatomy = []; // [{ id, name, status, reason }]

  // ---- 1. History → anatomy. Exclusive slots: the newer pick replaces the older.
  const slotOwner = {};
  history.forEach((id, idx) => {
    const m = getMutation(id);
    const entry = { id, name: m.name, order: idx + 1, status: 'active', reason: null, def: m };
    if (m.slot) {
      const prev = slotOwner[m.slot];
      if (prev) {
        prev.status = 'replaced';
        prev.reason = `Replaced by ${m.name} (one ${m.slot} at a time).`;
        explanations.push(`${prev.name} is no longer part of the body: ${prev.reason}`);
      }
      slotOwner[m.slot] = entry;
    }
    anatomy.push(entry);
  });

  const frameEntry = slotOwner.frame;
  const frame = frameEntry ? frameEntry.def : BASELINE_FRAME;
  const present = () => anatomy.filter(e => e.status !== 'replaced');

  // ---- 2. Appendage budget (frames define it; limb-using structures consume it).
  let freeAppendages = frame.appendageBudget;
  for (const e of present()) {
    const need = e.def.appendages || 0;
    if (!need) continue;
    if (need > freeAppendages) {
      e.status = 'unsupported';
      e.reason = `Needs ${need} appendage(s); the ${frame.name} has ${freeAppendages} free.`;
      explanations.push(`${e.name} is unsupported: ${e.reason}`);
    } else {
      freeAppendages -= need;
    }
  }

  // ---- 3. Geometry: zone capacity, then needsClear obstruction.
  const zoneUse = {};
  for (const e of present()) {
    if (e.status !== 'active') continue;
    for (const z of e.def.occupies || []) {
      const cap = ZONE_CAPACITY[z] ?? 1;
      zoneUse[z] = zoneUse[z] || [];
      if (zoneUse[z].length >= cap) {
        e.status = 'obstructed';
        e.reason = `No room: ${z} is already taken by ${zoneUse[z].map(x => x.name).join(', ')}.`;
        explanations.push(`${e.name} is obstructed: ${e.reason}`);
        break;
      }
      zoneUse[z].push(e);
    }
  }
  for (const e of present()) {
    if (e.status !== 'active') continue;
    for (const z of e.def.needsClear || []) {
      const blockers = (zoneUse[z] || []).filter(x => x !== e);
      if (blockers.length) {
        e.status = 'obstructed';
        e.reason = `${blockers.map(b => b.name).join(', ')} physically block(s) the ${z} geometry it needs.`;
        explanations.push(`${e.name} is obstructed: ${e.reason}`);
        break;
      }
    }
  }

  // ---- 4. Mass and stats. Obstructed structures still weigh something.
  const material = present().filter(e => e.status !== 'unsupported');
  const mass = (frameEntry ? 0 : BASELINE_FRAME.mass) + material.reduce((s, e) => s + (e.def.mass || 0), 0);
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = 0;
  Object.assign(stats, frame.stats);
  for (const e of material) {
    if (e.status !== 'active' || e.def.slot === 'frame') continue;
    for (const [k, v] of Object.entries(e.def.stats || {})) stats[k] = (stats[k] || 0) + v;
  }
  const massPenalty = mass > MASS_PENALTY_START ? Math.floor((mass - MASS_PENALTY_START) / MASS_PENALTY_STEP) : 0;
  if (massPenalty) {
    stats.turn -= massPenalty; stats.stop -= massPenalty; stats.reposition -= massPenalty;
    explanations.push(`Total mass ${mass} slows turning and stopping (-${massPenalty}).`);
  }
  for (const k of ['speed', 'turn', 'stop', 'force', 'reposition']) stats[k] = Math.max(0, Math.min(10, stats[k]));

  // ---- 5. Capacity-conditioned structures (general checks, data-driven).
  const maxProtrusion = Math.max(0, ...material.map(e => e.def.protrusion || 0));
  for (const e of material) {
    if (e.status !== 'active') continue;
    if (e.def.climbCapacity !== undefined && mass > e.def.climbCapacity) {
      e.status = 'impaired';
      e.reason = `Body mass ${mass} exceeds the ${e.def.climbCapacity} the pads can hold on a wall.`;
      explanations.push(`${e.name} is impaired: ${e.reason}`);
    }
    if (e.def.foldLimit !== undefined && maxProtrusion > e.def.foldLimit) {
      const culprit = material.find(x => (x.def.protrusion || 0) === maxProtrusion);
      e.status = 'limited';
      e.reason = `${culprit.name} protrudes ${maxProtrusion} (fold limit ${e.def.foldLimit}); only wider gaps can be folded through.`;
      explanations.push(`${e.name} is limited: ${e.reason}`);
    }
  }

  // ---- 6. Capabilities: sum `provides` of operating structures.
  const capabilities = {};
  const contributes = e => e.status === 'active' || e.status === 'limited' || e.status === 'impaired';
  for (const e of material) {
    if (!contributes(e)) continue;
    const scale = e.status === 'active' ? 1 : e.status === 'limited' ? 0.5 : 0;
    for (const [k, v] of Object.entries(e.def.provides || {})) {
      capabilities[k] = (capabilities[k] || 0) + v * scale;
    }
  }
  if (!frameEntry) capabilities.frame = 1;

  // ---- 7. Shared resource pools.
  const pools = {};
  for (const e of material) {
    if (!contributes(e) || !e.def.pool) continue;
    const p = e.def.pool;
    pools[p] = pools[p] || { ...POOLS[p], members: [] };
    pools[p].members.push(e.name);
  }
  for (const [p, info] of Object.entries(pools)) {
    if (info.members.length > 1) {
      explanations.push(`${info.members.join(' and ')} share the ${p} pool (${info.capacity} units, ${info.perTurn}/turn): output is limited across both.`);
    }
  }

  // ---- 8. Metabolic upkeep (reserve drained per area).
  const upkeep = material.filter(contributes).reduce((s, e) => s + (e.def.upkeep || 0), 0);

  const result = {
    history: anatomy.map(e => ({ order: e.order, id: e.id, name: e.name })),
    anatomy: anatomy.map(e => ({ id: e.id, name: e.name, status: e.status, reason: e.reason, category: e.def.category })),
    frame: { id: frame.id, name: frame.name, appendageBudget: frame.appendageBudget, freeAppendages },
    stats, mass, capabilities, pools, upkeep,
    stomachCapacity: 3 + (capabilities.stomachCapacity || 0),
    digestEfficiency: 1 + (capabilities.digestEfficiency || 0),
    explanations
  };
  result.abilities = deriveAbilities(result, anatomy);
  return result;
}

// Convenience for the UI: one line per anatomy entry.
export function describeAnatomy(bio) {
  return bio.anatomy.map(e => `${e.name}: ${e.status}${e.reason ? ' — ' + e.reason : ''}`);
}
