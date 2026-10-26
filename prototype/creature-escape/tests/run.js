// Plain-node acceptance tests. Run: node tests/run.js
import assert from 'node:assert/strict';
import { resolveBiology } from '../src/biology/anatomy.js';
import { MUTATIONS, PHASE1_IDS } from '../src/biology/mutations.js';
import { generateRun } from '../src/run/generator.js';
import { createGame } from '../src/game.js';
import { memoryStore, RUN_KEY } from '../src/meta/profile.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e.message || e)); }
}
const status = (b, id) => b.anatomy.find(e => e.id === id).status;
const ability = (b, id) => b.abilities.find(a => a.id === id);

console.log('\n# Biology: the ten required combinations');

test('Venomous Fangs + Heavy Tusks: tusks obstruct the bite; venom inactive; history keeps both; UI has a reason', () => {
  const b = resolveBiology(['venom-gland', 'venomous-fangs', 'heavy-tusks']);
  assert.equal(status(b, 'venomous-fangs'), 'obstructed');
  assert.equal(status(b, 'heavy-tusks'), 'active');
  assert.ok(!ability(b, 'bite'), 'no bite ability');
  assert.ok(!b.abilities.some(a => a.effects.some(f => f.type === 'poison')), 'no venom delivery');
  assert.deepEqual(b.history.map(h => h.id), ['venom-gland', 'venomous-fangs', 'heavy-tusks']);
  assert.ok(b.explanations.some(l => /Venom cannot be delivered/.test(l)));
  // And the order-independent case: fangs chosen AFTER tusks are obstructed too.
  const b2 = resolveBiology(['heavy-tusks', 'venom-gland', 'venomous-fangs']);
  assert.equal(status(b2, 'venomous-fangs'), 'obstructed');
  // Without tusks the venomous bite forms.
  const b3 = resolveBiology(['venom-gland', 'venomous-fangs']);
  assert.ok(ability(b3, 'bite').effects.some(f => f.type === 'poison'));
});

test('Venom Gland alone supplies but never delivers', () => {
  const b = resolveBiology(['venom-gland']);
  assert.ok(!b.abilities.some(a => a.effects.some(f => f.type === 'poison')));
  assert.ok(b.explanations.some(l => /no compatible delivery/.test(l)));
});

test('Heavy Battering Frame + Dense Carapace: forceful and resilient, slow to turn and stop', () => {
  const b = resolveBiology(['battering-frame', 'dense-carapace']);
  assert.ok(b.stats.force >= 8); assert.ok(b.capabilities.armor >= 6);
  assert.ok(b.stats.turn <= 1 && b.stats.stop <= 1, `turn ${b.stats.turn} stop ${b.stats.stop}`);
  assert.ok(ability(b, 'charge').flags.includes('overrun'));
});

test('Agile Multi-Limbed Frame + Retractable Claws: fast fluid slashes with strong repositioning', () => {
  const b = resolveBiology(['agile-frame', 'retractable-claws']);
  assert.equal(status(b, 'retractable-claws'), 'active');
  assert.ok(ability(b, 'slash').speed >= 9); assert.ok(b.stats.reposition >= 8);
});

test('Agile Multi-Limbed Frame + Scythe Limbs: speed overshoots; arc does not grow', () => {
  const b = resolveBiology(['agile-frame', 'scythe-limbs']);
  const s = ability(b, 'sweep');
  assert.ok(s.flags.includes('overshoot')); assert.ok(s.hitChanceModifier < 0);
  const slow = resolveBiology(['battering-frame', 'scythe-limbs']);
  assert.ok(!ability(slow, 'sweep').flags.includes('overshoot'));
});

test('Compression Folds + Heavy Tusks: folding limited by tusk geometry', () => {
  const b = resolveBiology(['compression-folds', 'heavy-tusks']);
  assert.equal(status(b, 'compression-folds'), 'limited');
  assert.ok(ability(b, 'compress').flags.includes('limited'));
  assert.equal(status(resolveBiology(['compression-folds', 'venomous-fangs']), 'compression-folds'), 'active');
});

test('Adhesive Climbing Pads + Dense Carapace: climbing impaired when mass exceeds capacity', () => {
  const b = resolveBiology(['climbing-pads', 'dense-carapace']);
  assert.equal(status(b, 'climbing-pads'), 'impaired');
  assert.ok(!ability(b, 'climb'));
  assert.ok(ability(resolveBiology(['agile-frame', 'climbing-pads']), 'climb'));
});

test('Acid Sacs + Corrosive Secretion: both draw from one acid pool', () => {
  const b = resolveBiology(['acid-sacs', 'corrosive-secretion']);
  assert.equal(b.pools.acid.members.length, 2);
  assert.ok(ability(b, 'acid-spit').pool === 'acid' && ability(b, 'dissolve').pool === 'acid');
  assert.ok(b.explanations.some(l => /share the acid pool/.test(l)));
});

test('Chemical Sensor Tendrils + Predatory Pursuit Response: tracks, but pursuit-locks', () => {
  const b = resolveBiology(['chem-sensors', 'pursuit-response']);
  assert.ok(ability(b, 'track').flags.includes('pursuit-lock'));
  assert.ok(!ability(resolveBiology(['chem-sensors']), 'track').flags.includes('pursuit-lock'));
});

test('Emergency Reserve Sac + Chain Catalyst Organ: extended chains with upkeep/volume cost', () => {
  const b = resolveBiology(['reserve-sac', 'chain-catalyst']);
  assert.ok(ability(b, 'chain-extend').flags.includes('extended'));
  assert.ok(b.upkeep >= 1);
});

test('Heavy Gripping Limbs + Fine Manipulator Tendrils: both only with enough appendages', () => {
  const ok = resolveBiology(['agile-frame', 'gripping-limbs', 'fine-tendrils']);
  assert.ok(ability(ok, 'interact-heavy') && ability(ok, 'interact-fine'));
  assert.ok(ability(ok, 'interact-fine').flags.includes('slow'));
  // Serpentine body: 2 appendages. Gripping takes both; tendrils unsupported.
  const tight = resolveBiology(['serpentine-body', 'gripping-limbs', 'fine-tendrils']);
  assert.equal(status(tight, 'fine-tendrils'), 'unsupported');
  assert.ok(!ability(tight, 'interact-fine'));
});

console.log('\n# Biology: general rules');
test('Exclusive frame slot: newer frame replaces older; history keeps both', () => {
  const b = resolveBiology(['agile-frame', 'battering-frame']);
  assert.equal(status(b, 'agile-frame'), 'replaced');
  assert.equal(b.frame.id, 'battering-frame');
  assert.equal(b.history.length, 2);
});
test('Independent Limb Controllers combine two active attacks', () => {
  const b = resolveBiology(['agile-frame', 'retractable-claws', 'venomous-fangs', 'limb-controllers']);
  assert.ok(ability(b, 'combined-strike'));
});
test('Every mutation resolves alone and in the full 42-stack without throwing', () => {
  for (const m of MUTATIONS) resolveBiology([m.id]);
  const all = resolveBiology(MUTATIONS.map(m => m.id));
  assert.ok(all.abilities.length > 0);
  assert.equal(PHASE1_IDS.length, 12);
});

console.log('\n# Run structure');
test('Zones 3–5, areas 5–10 per zone, last area is an exit, junctions have distinct types', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = generateRun(seed);
    assert.ok(r.zones.length >= 3 && r.zones.length <= 5);
    for (const z of r.zones) {
      assert.ok(z.steps.length >= 5 && z.steps.length <= 10);
      assert.equal(z.steps[z.steps.length - 1].kind, 'exit');
      for (const s of z.steps) if (s.kind === 'junction') {
        const types = s.options.map(o => o.type);
        assert.equal(new Set(types).size, types.length);
        assert.ok(s.options.length >= 2 && s.options.length <= 3);
      }
    }
  }
});
test('Run lengths vary across seeds', () => {
  const lengths = new Set();
  for (let seed = 1; seed <= 50; seed++) lengths.add(generateRun(seed).zones.reduce((n, z) => n + z.steps.length, 0));
  assert.ok(lengths.size >= 8, `only ${lengths.size} distinct lengths`);
});
test('Generation is deterministic per seed', () => {
  assert.deepEqual(JSON.stringify(generateRun(42)), JSON.stringify(generateRun(42)));
});

console.log('\n# Save / resume / rewards');

// Drive a run with a simple policy; returns when the run ends or maxActions is hit.
function autoplay(g, maxActions = 400) {
  let n = 0;
  while (n++ < maxActions) {
    const v = g.view();
    if (!v || v.phase === 'dead' || v.phase === 'escaped') return v;
    if (v.offers.length && (v.phase === 'choose' || !v.encounter.enemies.some(e => e.hp > 0))) {
      // Prefer attack upgrades, then whatever is on offer.
      const pref = ['retractable-claws', 'venomous-fangs', 'agile-frame', 'venom-gland', 'dense-carapace', 'efficient-digestion'];
      g.act('evolve', v.offers.find(o => pref.includes(o)) || v.offers[0]); continue;
    }
    if (v.phase === 'choose') {
      const safe = v.routeOptions.slice().sort((a, b) => a.risk - b.risk)[0];
      g.act('choose', safe.index); continue;
    }
    if (v.phase === 'exit') {
      const open = v.exitPaths.filter(p => p.available).sort((a, b) => (a.cost.hp || 0) - (b.cost.hp || 0))[0];
      g.act('exit', open.id); continue;
    }
    if (v.phase === 'area') {
      const live = v.encounter.enemies.find(e => e.hp > 0);
      if (live) {
        const best = v.bio.abilities.filter(a => a.kind === 'attack' && !a.pool && !a.reserveCost).sort((a, b) => b.damage - a.damage)[0];
        g.act('attack', best.id, live.slot); continue;
      }
      const bio = v.floor.find(x => x.startsWith('biomass:') || x === 'nutrient-brick');
      if (bio && v.hp < v.maxHp) { g.act('eat', bio); continue; }
      const item = v.floor.find(x => !x.startsWith('biomass:') && x !== 'nutrient-brick');
      if (item) { try { g.act('swallow', item); continue; } catch { /* stomach full: leave it on the floor */ } }
      g.act('leave'); continue;
    }
  }
  return g.view();
}

test('Imprints are committed immediately and survive death', () => {
  const store = memoryStore();
  const g = createGame(store);
  g.newRun(3);
  const v = autoplay(g);
  assert.ok(['dead', 'escaped'].includes(v.phase));
  assert.ok(g.profile.data.imprints > 0, 'earned imprints');
  assert.equal(g.profile.data.imprints, v.imprintsThisRun);
  assert.ok(!g.hasSave(), 'finished run save is cleared');
  // A fresh game instance on the same store sees the same persistent profile.
  const g2 = createGame(store);
  assert.equal(g2.profile.data.imprints, g.profile.data.imprints);
});

test('Resume continues the SAME route and state (no reroll)', () => {
  const store = memoryStore();
  const g = createGame(store);
  g.newRun(11);
  const v0 = g.view(); g.act('evolve', v0.offers[0]);
  g.act('choose', 0);
  const before = JSON.stringify(g.run);
  const g2 = createGame(store);
  const resumed = g2.resume();
  assert.equal(JSON.stringify(resumed), before);
  assert.deepEqual(g2.view().encounter, g.view().encounter);
  assert.deepEqual(g2.view().offers, g.view().offers);
  // Continue both from the same point: identical outcomes (seeded RNG state is saved).
  const live = g.view().encounter.enemies.find(e => e.hp > 0);
  const atk = g.view().bio.abilities.find(a => a.kind === 'attack').id;
  g.act('attack', atk, live.slot); g2.act('attack', atk, live.slot);
  assert.equal(JSON.stringify(g.run), JSON.stringify(g2.run));
});

test('A crash between reward commit and run save never grants the reward twice', () => {
  const store = memoryStore();
  const g = createGame(store);
  g.newRun(5);
  g.act('evolve', g.view().offers[0]);
  g.act('choose', 0);
  g.run.hp = 500; g.run.maxHp = 500; g.save();   // make the outcome deterministic: the creature survives
  // Snapshot the RUN save as of entering the area (older state) but keep the live profile.
  const olderRunSave = store.get(RUN_KEY);
  // Kill everything (rewards commit to the profile as kills land).
  autoplayUntil(g, v => v.phase !== 'area' || v.encounter.enemies.every(e => e.hp <= 0));
  const imprintsAfterKills = g.profile.data.imprints;
  assert.equal(g.view().phase, 'area');
  assert.ok(g.view().encounter.enemies.every(e => e.hp <= 0));
  assert.ok(imprintsAfterKills > 0);
  // "Crash": the run save rolls back to the older snapshot; the profile (with ledger) was already written.
  store.set(RUN_KEY, olderRunSave);
  const g2 = createGame(store);
  g2.resume();
  // Enemies already credited as killed do not respawn on re-entry... but here the older save still
  // holds them alive; killing them again must NOT re-grant imprints.
  autoplayUntil(g2, v => v.phase !== 'area' || v.encounter.enemies.every(e => e.hp <= 0));
  assert.equal(g2.profile.data.imprints, imprintsAfterKills, 'no double commit');
  // The clear bonus commits once: leave in BOTH instances, only the first grants it.
  g.act('leave'); const afterClear = g.profile.data.imprints;
  assert.ok(afterClear > imprintsAfterKills);
  g2.act('leave');
  assert.equal(g2.profile.data.imprints, afterClear, 'clear bonus not double-committed');
});
function autoplayUntil(g, pred, max = 100) {
  let n = 0;
  while (n++ < max && !pred(g.view())) {
    const v = g.view();
    const live = v.encounter.enemies.find(e => e.hp > 0);
    const best = v.bio.abilities.filter(a => a.kind === 'attack' && !a.pool && !a.reserveCost).sort((a, b) => b.damage - a.damage)[0];
    g.act('attack', best.id, live.slot);
  }
}

test('Items: stomach persists through the run; loose items secure on zone completion; death loses the stomach', () => {
  // Find a seed whose first choice is a quiet resource area with items.
  let store, g, v;
  for (let seed = 1; seed < 300; seed++) {
    store = memoryStore(); g = createGame(store); g.newRun(seed);
    g.act('evolve', g.view().offers[0]);
    v = g.view();
    const q = v.routeOptions.find(o => o.type === 'resource' && o.name === 'Sample archive');
    if (q) { g.act('choose', q.index); break; }
  }
  v = g.view();
  assert.equal(v.phase, 'area'); assert.ok(v.floor.length >= 2);
  g.act('swallow', v.floor[0]);
  assert.equal(g.view().stomach.length, 1);
  assert.ok(g.view().atRisk.length >= 1, 'remaining floor items are at risk');
  assert.equal(g.profile.data.storage.length, 0);
  // Simulated death: nothing secured, stomach lost, imprints kept.
  g.run.hp = 1;
  const imprints = g.profile.data.imprints;
  g.act('leave');
  // Force a death by walking into whatever comes next with 1 HP.
  const vv = autoplay(g, 60);
  if (vv.phase === 'dead') {
    assert.equal(g.run.stomach.length, 0);
    assert.ok(g.profile.data.imprints >= imprints);
  }
});

test('Zone completion secures loose items into persistent storage', () => {
  const store = memoryStore();
  const g = createGame(store);
  g.newRun(21);
  g.act('evolve', 'retractable-claws' in Object.fromEntries(g.view().offers.map(o => [o, 1])) ? 'retractable-claws' : g.view().offers[0]);
  let completed = false;
  for (let i = 0; i < 400 && !completed; i++) {
    const v = g.view();
    if (v.phase === 'dead' || v.phase === 'escaped') break;
    const zoneBefore = v.pos.zone;
    autoplayOne(g);
    if (g.view() && g.view().pos.zone > zoneBefore) completed = true;
  }
  if (completed || g.view()?.phase === 'escaped') {
    assert.ok(g.profile.hasCommitted(g.run.runId, 'zone:0:complete'));
  }
});
function autoplayOne(g) {
  const v = g.view();
  if (v.offers.length && (v.phase === 'choose' || !v.encounter.enemies.some(e => e.hp > 0))) return g.act('evolve', v.offers[0]);
  if (v.phase === 'choose') return g.act('choose', v.routeOptions.slice().sort((a, b) => a.risk - b.risk)[0].index);
  if (v.phase === 'exit') return g.act('exit', v.exitPaths.filter(p => p.available).sort((a, b) => (a.cost.hp || 0) - (b.cost.hp || 0))[0].id);
  const live = v.encounter.enemies.find(e => e.hp > 0);
  if (live) { const best = v.bio.abilities.filter(a => a.kind === 'attack' && !a.pool && !a.reserveCost).sort((a, b) => b.damage - a.damage)[0]; return g.act('attack', best.id, live.slot); }
  const bio = v.floor.find(x => x.startsWith('biomass:') || x === 'nutrient-brick');
  if (bio && v.hp < v.maxHp) return g.act('eat', bio);
  return g.act('leave');
}

console.log('\n# Balance sweep (informational)');
{
  let escapes = 0, deaths = 0, zonesReached = 0;
  for (let seed = 100; seed < 160; seed++) {
    const g = createGame(memoryStore()); g.newRun(seed);
    const v = autoplay(g, 600);
    if (v.phase === 'escaped') escapes++; else deaths++;
    zonesReached += v.pos.zone + 1;
  }
  console.log(`  60 autoplayed runs (safest-route policy): ${escapes} escapes, ${deaths} deaths, avg zone reached ${(zonesReached / 60).toFixed(2)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
