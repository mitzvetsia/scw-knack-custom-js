// Run state machine. The run object is plain JSON; every action mutates it in
// place and returns a list of log lines. Save = serialise the object. Load =
// parse it. The route and all random outcomes are either pre-generated
// (generator.js) or drawn from the serialised RNG, so resuming is exact.

import { createRng } from '../rng.js';
import { resolveBiology } from '../biology/anatomy.js';
import { getMutation } from '../biology/mutations.js';
import { generateRun } from './generator.js';
import { AREA_INDEX, ENEMIES, ITEMS } from './areas.js';

export const PHASES = {
  CHOOSE: 'choose',     // at a junction (or a single-step preview): pick a route
  AREA: 'area',         // inside an area: fight / feed / loot / evolve / leave
  EXIT: 'exit',         // zone-exit challenge: pick a solution path
  DEAD: 'dead',
  ESCAPED: 'escaped'
};

const BASE_HP = 30;
const BASE_RESERVE = 20;

export function createRun(profile, seed, opts = {}) {
  const runId = `run-${seed}-${profile.data.runsPlayed + 1}`;
  profile.data.runsPlayed += 1; profile.save();
  const route = generateRun(seed, opts);
  const run = {
    runId, seed, rngState: route.rngState, rules: route.rules, zones: route.zones,
    pos: { zone: 0, step: 0 },
    phase: PHASES.CHOOSE,
    current: null,            // the area instance the creature is in
    creature: { history: [] },
    hp: BASE_HP, maxHp: BASE_HP, reserve: BASE_RESERVE, maxReserve: BASE_RESERVE,
    stomach: [],              // item ids carried inside the creature (persist through the run)
    areaItems: {},            // instanceId -> item ids lying in that area (at risk until the zone is completed)
    zoneLoot: [],             // instanceIds of this zone's visited areas (their items secure on zone completion)
    offers: [],               // current mutation offers
    offersTaken: 0,
    encounter: null,          // { enemies: [{slot,type,name,hp,maxHp,attack,armor,poison}], turn, poolUsed }
    ledger: [],               // mirror of committed event ids for display
    log: [],
    imprintsThisRun: 0
  };
  log(run, `Containment breach. ${run.zones.length} zones between you and the surface.`);
  // Starter evolution: a seeded 3-way offer before the first area.
  const r = createRng(seed ^ 0x5eed);
  run.offers = r.shuffle(route.zones[0].steps[0].options[0].offerOrder).slice(0, 3);
  run.starter = true;
  return run;
}

export function bio(run) { return resolveBiology(run.creature.history); }
export function currentStep(run) { return run.zones[run.pos.zone].steps[run.pos.step]; }
function rngOf(run) { const r = createRng(run.seed); r.setState(run.rngState); return r; }
function keepRng(run, r) { run.rngState = r.getState(); }
export function log(run, line) { run.log.push(line); if (run.log.length > 200) run.log.shift(); return line; }

// ---- Reward commits: profile ledger is the source of truth (idempotent).
function commit(run, profile, eventId, apply) {
  const fresh = profile.commit(run.runId, eventId, apply);
  if (fresh && !run.ledger.includes(eventId)) run.ledger.push(eventId);
  return fresh;
}
function grantImprints(run, profile, eventId, n, why) {
  if (commit(run, profile, eventId, d => { d.imprints += n; })) {
    run.imprintsThisRun += n;
    log(run, `+${n} Imprints (${why}) — committed.`);
  }
}

// ---- Views for the UI.
export function routeOptions(run) {
  const step = currentStep(run);
  return step.options.map((o, i) => {
    const area = AREA_INDEX[o.areaId];
    return { index: i, instanceId: o.instanceId, name: o.name, type: o.type, clue: o.clue, risk: area.risk,
      skip: o.skip, tight: !!area.tight, hint: riskHint(area) };
  });
}
function riskHint(area) {
  const r = area.risk >= 4 ? 'very dangerous' : area.risk >= 3 ? 'dangerous' : area.risk >= 1 ? 'some risk' : 'quiet';
  const reward = area.rewards?.offers >= 2 ? 'rich rewards' : area.rewards?.offers === 1 ? 'a reward' : area.skip ? 'skips ahead' : 'unknown';
  return `${r}, ${reward}`;
}

// ---- Actions -----------------------------------------------------------------
export function chooseRoute(run, profile, optionIndex) {
  if (run.phase !== PHASES.CHOOSE) throw new Error('Not at a route choice');
  const step = currentStep(run);
  const inst = step.options[optionIndex];
  if (!inst) throw new Error('No such option');
  enterArea(run, profile, inst);
}

function enterArea(run, profile, inst) {
  const area = AREA_INDEX[inst.areaId];
  run.current = inst.instanceId;
  if (!run.areaItems[inst.instanceId] && !profile.hasCommitted(run.runId, `${inst.instanceId}:items-placed`)) {
    run.areaItems[inst.instanceId] = inst.items.slice();
    commit(run, profile, `${inst.instanceId}:items-placed`);
  }
  run.areaItems[inst.instanceId] = run.areaItems[inst.instanceId] || [];
  if (!run.zoneLoot.includes(inst.instanceId)) run.zoneLoot.push(inst.instanceId);
  log(run, `— ${area.name}. ${area.layout}`);

  const b = bio(run);
  if (b.upkeep) { run.reserve = Math.max(0, run.reserve - b.upkeep); log(run, `Metabolic upkeep: -${b.upkeep} reserve.`); }

  if (area.type === 'exit') { run.phase = PHASES.EXIT; run.encounter = null; return; }

  if (area.hazard) {
    const bypass = area.hazard.bypass.some(id => b.abilities.some(a => a.id === id && !a.flags.includes('limited')) || (b.capabilities[id] || 0) > 0);
    if (bypass) log(run, 'Your anatomy slips through the hazard untouched.');
    else { run.hp -= area.hazard.damage; log(run, `The hazard tears at you: -${area.hazard.damage} HP.`); }
    if (run.hp <= 0) return die(run, profile, 'hazard');
  }

  const enemies = inst.enemies
    .filter(e => !profile.hasCommitted(run.runId, `${inst.instanceId}:kill:${e.slot}`))
    .map(e => { const t = ENEMIES[e.type]; const z = run.pos.zone; const hp = t.hp + e.hpVariance + z * 2;
      return { slot: e.slot, type: e.type, name: t.name, hp, maxHp: hp, attack: t.attack + Math.floor(z / 2), armor: t.armor, poison: null }; });
  run.encounter = { enemies, turn: 0, poolUsed: {} };
  run.phase = PHASES.AREA;
  if (enemies.length) log(run, `${enemies.map(e => e.name).join(', ')} — hostile.`);
  else log(run, 'Nothing hostile here.');
  refreshOffers(run, profile, inst, area);
}

function refreshOffers(run, profile, inst, area) {
  const slots = area.rewards?.offers || 0;
  const offersId = `${inst.instanceId}:offers`;
  if (!slots || profile.hasCommitted(run.runId, offersId)) { run.offers = []; return; }
  // Deterministic: pre-shuffled order filtered by what the creature already has.
  const have = new Set(run.creature.history);
  run.offers = inst.offerOrder.filter(id => !have.has(id)).slice(0, Math.min(slots, run.rules.offersPerArea));
}

export function attack(run, profile, abilityId, targetSlot) {
  requireArea(run);
  const b = bio(run);
  const ability = b.abilities.find(a => a.id === abilityId && a.kind === 'attack');
  if (!ability) throw new Error('No such active attack: ' + abilityId);
  const enemy = run.encounter.enemies.find(e => e.slot === targetSlot && e.hp > 0);
  if (!enemy) throw new Error('No such living target');
  const inst = instance(run);
  const area = AREA_INDEX[inst.areaId];
  const r = rngOf(run);

  // Resource gating (pools, reserve).
  if (ability.pool) {
    const used = run.encounter.poolUsed[ability.pool] || 0;
    const pool = b.pools[ability.pool];
    if (!pool || used + ability.poolCost > pool.capacity) throw new Error(`${ability.pool} pool exhausted for this encounter`);
    run.encounter.poolUsed[ability.pool] = used + ability.poolCost;
  }
  if (ability.reserveCost) {
    if (run.reserve < ability.reserveCost) throw new Error('Not enough metabolic reserve');
    run.reserve -= ability.reserveCost;
  }

  let hitChance = 0.85 + (ability.hitChanceModifier || 0);
  if (area.tight && ability.tightSpacePenalty) hitChance *= ability.tightSpacePenalty;
  const hit = r.next() < hitChance;
  if (hit) {
    const dmg = Math.max(1, ability.damage + r.int(-1, 1) - enemy.armor);
    enemy.hp -= dmg;
    log(run, `${ability.name} hits ${enemy.name} for ${dmg}.`);
    for (const fx of ability.effects) {
      if (fx.type === 'poison' && enemy.hp > 0) { enemy.poison = { damagePerTurn: fx.damagePerTurn, turns: fx.turns }; log(run, `${enemy.name} is envenomed.`); }
    }
  } else {
    log(run, `${ability.name} misses${ability.flags.includes('overshoot') ? ' — the sweep overshoots' : ''}.`);
    if (ability.flags.includes('overrun')) { run.encounter.exposed = true; }
  }
  if (enemy.hp <= 0) onKill(run, profile, inst, enemy);
  enemyTurn(run, profile, b, r);
  keepRng(run, r);
  if (run.phase === PHASES.AREA && run.encounter.enemies.every(e => e.hp <= 0)) log(run, 'The area is clear.');
}

function onKill(run, profile, inst, enemy) {
  const t = ENEMIES[enemy.type];
  log(run, `${enemy.name} is down.`);
  const killId = `${inst.instanceId}:kill:${enemy.slot}`;
  if (commit(run, profile, killId, d => { d.imprints += t.imprints; })) {
    run.imprintsThisRun += t.imprints;
    log(run, `+${t.imprints} Imprints (kill) — committed.`);
    for (const drop of t.drops || []) { run.areaItems[inst.instanceId].push(drop); log(run, `${ITEMS[drop].name} drops to the floor.`); }
    if (t.biomass) { run.areaItems[inst.instanceId].push(`biomass:${enemy.slot}:${t.biomass}`); }
  }
}

function enemyTurn(run, profile, b, r) {
  const enc = run.encounter;
  enc.turn += 1;
  for (const e of enc.enemies) {
    if (e.hp <= 0) continue;
    if (e.poison) {
      e.hp -= e.poison.damagePerTurn; log(run, `Venom burns ${e.name} for ${e.poison.damagePerTurn}.`);
      if (--e.poison.turns <= 0) e.poison = null;
      if (e.hp <= 0) { onKill(run, profile, instance(run), e); continue; }
    }
    const dodge = enc.exposed ? 0 : Math.min(0.5, (b.stats.reposition || 0) * 0.05);
    if (r.next() < dodge) { log(run, `You slip ${e.name}'s attack.`); continue; }
    const dmg = Math.max(0, e.attack + r.int(0, 1) - Math.floor((b.capabilities.armor || 0) / 2));
    if (dmg > 0) { run.hp -= dmg; log(run, `${e.name} hits you for ${dmg}.`); }
    else log(run, `${e.name}'s attack glances off your armor.`);
  }
  enc.exposed = false;
  if (run.hp <= 0) die(run, profile, 'killed');
}

export function eat(run, profile, itemRef) {
  requireArea(run);
  const inst = instance(run);
  const b = bio(run);
  const floor = run.areaItems[inst.instanceId];
  let idx = floor.indexOf(itemRef);
  let biomass = 0;
  if (idx >= 0 && itemRef.startsWith('biomass:')) { biomass = Number(itemRef.split(':')[2]); floor.splice(idx, 1); }
  else if (idx >= 0 && ITEMS[itemRef]?.biomass) { biomass = ITEMS[itemRef].biomass; floor.splice(idx, 1); }
  else {
    const s = run.stomach.indexOf(itemRef);
    if (s >= 0 && ITEMS[itemRef]?.biomass) { biomass = ITEMS[itemRef].biomass; run.stomach.splice(s, 1); }
    else throw new Error('Nothing edible by that name here');
  }
  const gain = Math.round(biomass * b.digestEfficiency);
  run.reserve = Math.min(run.maxReserve, run.reserve + gain);
  run.hp = Math.min(run.maxHp, run.hp + Math.floor(gain / 2));
  log(run, `You feed: +${gain} reserve, +${Math.floor(gain / 2)} HP.`);
}

export function swallow(run, profile, itemId) {
  requireArea(run);
  const inst = instance(run);
  const floor = run.areaItems[inst.instanceId];
  const idx = floor.indexOf(itemId);
  if (idx < 0 || !ITEMS[itemId]) throw new Error('No such item in this area');
  const b = bio(run);
  const used = run.stomach.reduce((s, id) => s + ITEMS[id].size, 0);
  if (used + ITEMS[itemId].size > b.stomachCapacity) throw new Error(`Stomach full (${used}/${b.stomachCapacity})`);
  floor.splice(idx, 1);
  run.stomach.push(itemId);
  log(run, `${ITEMS[itemId].name} swallowed — safe inside you for the run.`);
}

export function takeMutation(run, profile, mutationId) {
  if (!run.offers.includes(mutationId)) throw new Error('Not on offer');
  if (run.starter && run.phase === PHASES.CHOOSE) {
    commit(run, profile, 'run:starter-offer');
    run.starter = false;
  } else {
    requireArea(run);
    const inst = instance(run);
    if (run.encounter.enemies.some(e => e.hp > 0)) throw new Error('Clear the area before evolving');
    commit(run, profile, `${inst.instanceId}:offers`);
  }
  run.creature.history.push(mutationId);
  run.offers = [];
  run.offersTaken += 1;
  const m = getMutation(mutationId);
  const b = bio(run);
  const entry = b.anatomy.find(e => e.id === mutationId && e.status !== 'replaced');
  log(run, `Evolved: ${m.name}${entry && entry.status !== 'active' ? ` — ${entry.status}: ${entry.reason}` : ''}.`);
  for (const line of b.explanations) log(run, `  · ${line}`);
}

export function leaveArea(run, profile) {
  requireArea(run);
  if (run.encounter.enemies.some(e => e.hp > 0)) throw new Error('Hostiles still standing');
  const inst = instance(run);
  const area = AREA_INDEX[inst.areaId];
  grantImprints(run, profile, `${inst.instanceId}:cleared`, area.rewards?.imprints || 0, 'area cleared');
  advance(run, 1 + (inst.skip || 0));
}

function advance(run, steps) {
  const zone = run.zones[run.pos.zone];
  run.pos.step = Math.min(zone.steps.length - 1, run.pos.step + steps);
  run.current = null; run.encounter = null; run.offers = [];
  run.phase = PHASES.CHOOSE;
  const step = currentStep(run);
  if (step.kind === 'exit') log(run, `Ahead: ${step.options[0].name} — the way out of the ${zone.theme}.`);
  else if (step.kind === 'junction') log(run, 'The route forks.');
}

export function exitPaths(run) {
  if (run.phase !== PHASES.EXIT) return [];
  const inst = instance(run);
  const area = AREA_INDEX[inst.areaId];
  const b = bio(run);
  return area.paths.map(p => ({ ...p, available: pathAvailable(run, b, p) }));
}
function pathAvailable(run, b, p) {
  const n = p.needs;
  if (n.ability && !b.abilities.some(a => a.id === n.ability && !a.flags.includes('limited'))) return false;
  if (n.capability && !(b.capabilities[n.capability] > 0)) return false;
  if (n.item && !run.stomach.includes(n.item) && !(run.areaItems[run.current] || []).includes(n.item)) return false;
  if (n.stat && !(b.stats[n.stat[0]] >= n.stat[1])) return false;
  return true;
}

export function solveExit(run, profile, pathId) {
  if (run.phase !== PHASES.EXIT) throw new Error('Not at a zone exit');
  const path = exitPaths(run).find(p => p.id === pathId);
  if (!path) throw new Error('No such path');
  if (!path.available) throw new Error('That path is not open to this anatomy');
  const b = bio(run);
  if (path.cost.item) {
    const s = run.stomach.indexOf(path.cost.item);
    if (s >= 0) run.stomach.splice(s, 1); else { const f = run.areaItems[run.current]; f.splice(f.indexOf(path.cost.item), 1); }
  }
  if (path.cost.hp) { run.hp -= path.cost.hp; log(run, `${path.name}: -${path.cost.hp} HP.`); }
  if (path.cost.reserve) { run.reserve = Math.max(0, run.reserve - path.cost.reserve); log(run, `${path.name}: -${path.cost.reserve} reserve.`); }
  if (path.cost.pool && !b.pools[path.cost.pool]) throw new Error('No pool');
  if (run.hp <= 0) return die(run, profile, 'exit challenge');
  log(run, `${path.name} — the ${AREA_INDEX[instance(run).areaId].name} opens.`);
  completeZone(run, profile);
}

function completeZone(run, profile) {
  const zone = run.zones[run.pos.zone];
  // Items left lying in this zone's areas become SECURED now.
  const loose = [];
  for (const id of run.zoneLoot) {
    for (const item of run.areaItems[id] || []) if (ITEMS[item]) loose.push(item);
    run.areaItems[id] = [];
  }
  const zoneId = `zone:${zone.index}:complete`;
  if (commit(run, profile, zoneId, d => { d.storage.push(...loose); d.imprints += 5; })) {
    run.imprintsThisRun += 5;
    log(run, `Zone complete: +5 Imprints; ${loose.length} loose item(s) secured to storage.`);
  }
  run.zoneLoot = [];
  if (run.pos.zone === run.zones.length - 1) return escape(run, profile);
  run.pos.zone += 1; run.pos.step = 0;
  run.current = null; run.encounter = null; run.offers = [];
  run.phase = PHASES.CHOOSE;
  log(run, `You push into the ${run.zones[run.pos.zone].theme}.`);
}

function escape(run, profile) {
  run.phase = PHASES.ESCAPED;
  const bonus = 20 + run.zones.length * 5;
  if (commit(run, profile, 'run:escaped', d => { d.imprints += bonus; d.storage.push(...run.stomach); d.escapes += 1; })) {
    run.imprintsThisRun += bonus;
    log(run, `You breach the perimeter. ESCAPED. +${bonus} Imprints; ${run.stomach.length} stomach item(s) moved to storage.`);
  }
  run.stomach = [];
}

function die(run, profile, cause) {
  run.phase = PHASES.DEAD;
  run.hp = 0;
  if (commit(run, profile, 'run:died', d => { d.deaths += 1; })) {
    log(run, `You die (${cause}). Stomach contents and unsecured items are lost; ${run.imprintsThisRun} Imprints earned this run stay committed.`);
  }
  run.stomach = [];
}

// ---- Helpers
function requireArea(run) { if (run.phase !== PHASES.AREA) throw new Error('Not inside an area'); }
export function instance(run) {
  const step = currentStep(run);
  return step.options.find(o => o.instanceId === run.current);
}
export function isOver(run) { return run.phase === PHASES.DEAD || run.phase === PHASES.ESCAPED; }
export function serialize(run) { return JSON.parse(JSON.stringify(run)); }
export function deserialize(obj) { return JSON.parse(JSON.stringify(obj)); }
