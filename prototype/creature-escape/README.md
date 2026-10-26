# Creature Escape — Phase 1 prototype

A playable, dependency-free prototype of the escape-run roguelike described in the
design brief. It proves the three things the brief says must work before the
mutation library grows: **one authoritative biological state**, **procedural routes
over handcrafted areas**, and **save/resume that never duplicates a reward**.

- `index.html` — the game. Serve the folder (`npm run serve` → http://localhost:8080)
  because the page uses ES modules; opening the file directly will not load them.
- `npm test` (`node tests/run.js`) — 22 acceptance tests, including the ten required
  mutation combinations, crash-safe reward commits, and exact resume.
- No framework, no bundler, no npm dependencies. Node 18+ for the tests.

## Layout

```
src/rng.js                  seeded, serialisable PRNG (state is part of the run save)
src/biology/mutations.js    the 42 curated mutations as DATA, tagged with phase 1/2/3
src/biology/anatomy.js      resolveBiology(history): history → anatomy → capabilities
src/biology/abilities.js    ability chains derived from active capabilities
src/run/areas.js            handcrafted area library, enemies, items, exit challenges
src/run/generator.js        seeded route generation (zones, junctions, offers, rosters)
src/run/state.js            run state machine, actions, idempotent reward commits
src/meta/profile.js         persistent profile: Imprints, storage, reward ledger
src/game.js                 API used by the UI and the tests
tests/run.js                acceptance tests
```

## Run structure (as implemented)

| Rule from the brief | Implementation |
|---|---|
| 3–5 zones per attempt | `generator.js` `RULES.zones` |
| 5–10 areas per zone, last one is the exit challenge | `RULES.areasPerZone`; exit step always appended |
| Handcrafted areas, procedural order/branching | `areas.js` is the library; the generator only picks and orders |
| Junctions offer meaningful, distinct alternatives | 2–3 options of different types (specimen / rampage / shortcut / resource / encounter), always one safer option |
| Visible clues, hidden details | every area has `clue` (shown) and `hidden` (not shown); the UI adds a coarse risk/reward hint |
| Zone exit is a constrained strategic challenge, not a boss | exit areas list solution `paths` gated on abilities, capabilities, items or stats, each with a cost; a brute-force fallback is always available but expensive |
| Run lengths differ | tested: ≥8 distinct total lengths across 50 seeds |

Everything random about an area (enemy roster and HP variance, item placement, the
mutation-offer ordering) is rolled **at generation time** from the run seed. Combat
rolls use the serialised RNG state. That is what makes resume exact.

## Save, death, currency, items

| System | Rule | Where |
|---|---|---|
| Mid-run save | the whole run object is JSON; every action persists it | `game.js` `act()` → `save()` |
| Resume, not reroll | route, rosters, offers and RNG state are all in the save | test "Resume continues the SAME route" |
| Imprints | committed to the profile the moment they are earned | `profile.commit` + `grantImprints` |
| No duplicate rewards | each grant has a deterministic event id (`<areaInstance>:kill:<slot>`, `…:cleared`, `zone:N:complete`, `run:escaped`); the ledger lives in the **profile**, which is written before the run save, so a crash between the two cannot re-grant | test "A crash between reward commit and run save…" |
| Items in the stomach | carried for the run; moved to storage on escape; lost on death | `swallow`, `escape`, `die` |
| Items outside the stomach | stay in their area; secured to persistent storage when the zone's exit is solved; lost on death before that | `completeZone` |
| Death | ends the run; profile keeps Imprints, storage, unlocks | `die` |
| Escape | run completes, bonus Imprints, stomach resolved to storage | `escape` |

The UI labels items as *Inside you (safe for the run)* vs *In this area (lost if you
die before the zone exit)* so the player always knows what is secured.

## Biology model (system ownership)

`resolveBiology(history)` is the **only** place that decides what the creature can
do. Combat, the UI, exit challenges and hazards all read its result. It returns four
distinct layers, exactly as the brief separates them:

1. **history** — every choice in order (never deleted; a replaced frame still appears).
2. **anatomy** — each structure with a status: `active`, `replaced` (exclusive slot taken
   by a newer pick), `unsupported` (not enough appendages), `obstructed` (geometry),
   `impaired` (capacity exceeded, e.g. too heavy to climb), `limited` (partially works,
   e.g. folding blocked by protrusions) — plus a human-readable `reason`.
3. **capabilities** — the summed `provides` tags of operating structures, plus stats,
   mass, shared resource pools and metabolic upkeep.
4. **abilities** — the chains that can actually execute (a venomous bite exists only when
   an active bite **and** a venom supply are both present).

There are no per-pair special cases. Each outcome comes from a general rule over the
mutation data:

| Rule | Data fields | Example |
|---|---|---|
| exclusive slots | `slot` | second frame replaces the first |
| appendage budget | `appendageBudget` on frames, `appendages` on limb structures | Gripping Limbs + Fine Tendrils on a 2-limb body |
| geometry capacity | `occupies` + `ZONE_CAPACITY` | Claws and Hammers both want `limb-tips` |
| geometry obstruction | `needsClear` vs others' `occupies` | Tusks fill `mouth-front`, the fangs' bite needs it clear |
| mass vs capacity | `mass`, `climbCapacity` | Carapace makes the climbing pads useless |
| protrusion vs fold limit | `protrusion`, `foldLimit` | Tusks limit Compression Folds |
| shared pools | `pool` | Acid Sacs and Corrosive Secretion share `acid` |
| speed vs commit cap | `attack.commitSpeedCap` | Agile frame overshoots the scythe arc |
| supply → delivery chains | `venomSupply` + `venomDelivery` + active `bite` | Venom Gland alone delivers nothing |
| behaviour coupling | `track` + `overcommitRisk` | chemical tracking + pursuit response = pursuit-lock |

The ten combinations in the brief are the first ten tests in `tests/run.js`.

## What is in Phase 1

All 42 mutations exist as data and resolve without error, but only the Phase 1
twelve (Agile Frame, Battering Frame, Venomous Fangs, Heavy Tusks, Retractable Claws,
Dense Carapace, Chemical Sensor Tendrils, Expandable Stomach Folds, Efficient
Digestion, Venom Gland, Fine Manipulator Tendrils, Independent Limb Controllers) are
offered during a run (`generator.js` `RULES.mutationPhase`). Setting that to 2 or 3
widens the offer pool with no other change — the compatibility engine already covers
them, and the Phase 2/3 combinations are already tested.

Combat is deliberately simple (turn-based, hit chance, armor, poison, dodge from
repositioning) so the biology layer stays the interesting part. Enemies scale mildly
with zone depth. The autoplay balance sweep in the tests reports roughly 60% escapes
for a safest-route, best-attack policy; tune in `areas.js` and `state.js` constants.

## Not built yet (deliberately)

- Real-time movement, animation, AI pathing, a creature model — the prototype is a
  text/panel game; the biology output is designed to drive those systems later.
- Specimen trait harvesting as mutations (the drop is an item for now).
- Unlocks spent with Imprints between runs (currency accrues, nothing to buy yet).
- Phase 2/3 area interactions for senses and electric/spore chains (the abilities
  derive; hazards and exits only consult the Phase 1–2 ones).
