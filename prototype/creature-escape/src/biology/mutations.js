// Curated mutation library. Every entry is DATA consumed by the general
// compatibility engine in anatomy.js — there are no per-pair special cases.
//
// Shared vocabulary (see README "Biology model"):
//   slot          exclusive slot ('frame' = body plan, 'nervous' = nervous system).
//                 A later pick in an exclusive slot REPLACES the earlier one in the
//                 current anatomy; the evolution history keeps both.
//   mass          contributes to total body mass (affects turn/stop, climbing).
//   appendages    limb budget consumed (frames define `appendageBudget`).
//   protrusion    rigid external geometry size (affects compression folding).
//   occupies      geometry zones this structure fills.
//   needsClear    geometry zones that must be free of OTHER structures for this
//                 structure to operate. Occupied → status 'obstructed'.
//   provides      capability tags (numbers) the ACTIVE structure contributes.
//   pool          a shared resource pool this structure draws from.
//   stats         additive stat deltas.
//   phase         staging per the design doc (1 = prove the biology, 2, 3).

export const MUTATIONS = [
  // ---------------------------------------------------------------- A. Locomotion / body plan
  { id: 'agile-frame', name: 'Agile Multi-Limbed Frame', category: 'locomotion', phase: 1,
    slot: 'frame', appendageBudget: 6, mass: 10,
    stats: { speed: 8, turn: 8, stop: 7, force: 3, reposition: 8 },
    provides: { frame: 1, attackCadence: 2 },
    text: 'Rapid direction changes, continuous attacks, precise repositioning.' },
  { id: 'battering-frame', name: 'Heavy Battering Frame', category: 'locomotion', phase: 1,
    slot: 'frame', appendageBudget: 4, mass: 40,
    stats: { speed: 4, turn: 2, stop: 2, force: 9, reposition: 2 },
    provides: { frame: 1, charge: 2 },
    text: 'Low, dense body with powerful forward momentum and broad charges.' },
  { id: 'crab-limbs', name: 'Lateral Crab Limbs', category: 'locomotion', phase: 2,
    slot: 'frame', appendageBudget: 6, mass: 20,
    stats: { speed: 5, turn: 6, stop: 6, force: 5, reposition: 6, lateral: 8 },
    provides: { frame: 1, lateralAttack: 1 } },
  { id: 'serpentine-body', name: 'Serpentine Body', category: 'locomotion', phase: 2,
    slot: 'frame', appendageBudget: 2, mass: 15,
    stats: { speed: 6, turn: 9, stop: 5, force: 4, reposition: 5 },
    provides: { frame: 1, narrowPassage: 1 } },
  { id: 'spring-limbs', name: 'Spring-Loaded Limbs', category: 'locomotion', phase: 2,
    appendages: 2, mass: 8, stats: { leap: 8, airControl: -4 }, provides: { leap: 1 } },
  { id: 'anchoring-limbs', name: 'Anchoring Limbs', category: 'locomotion', phase: 2,
    appendages: 2, mass: 10, stats: { knockbackResist: 6, reposition: -3 }, provides: { brace: 1 } },
  { id: 'climbing-pads', name: 'Adhesive Climbing Pads', category: 'locomotion', phase: 2,
    mass: 2, climbCapacity: 45, provides: { climb: 1 },
    text: 'Traverse walls/ceilings while total mass stays within the pads\' supported capacity.' },
  { id: 'compression-folds', name: 'Compression Folds', category: 'locomotion', phase: 2,
    mass: 3, foldLimit: 2, provides: { compress: 1 },
    text: 'Fold through tight spaces unless rigid protrusions exceed what the folding anatomy can tuck.' },

  // ---------------------------------------------------------------- B. Primary offense
  { id: 'venomous-fangs', name: 'Venomous Fangs', category: 'offense', phase: 1,
    mass: 2, protrusion: 1, occupies: ['mouth-inner'], needsClear: ['mouth-front'],
    provides: { bite: 1, venomDelivery: 1 }, attack: { kind: 'bite', damage: 4, speed: 7 },
    text: 'Delivers venom through a compatible bite.' },
  { id: 'heavy-tusks', name: 'Heavy Tusks', category: 'offense', phase: 1,
    mass: 12, protrusion: 3, occupies: ['mouth-front'],
    provides: { thrust: 1, sweep: 1 }, attack: { kind: 'thrust', damage: 7, speed: 3 },
    text: 'Powerful forward thrusts and sweeps; fills the front of the mouth.' },
  { id: 'crushing-mandibles', name: 'Crushing Mandibles', category: 'offense', phase: 2,
    mass: 8, protrusion: 2, occupies: ['mouth-inner', 'mouth-front'],
    provides: { grip: 1, crush: 1, feedFast: 1 }, attack: { kind: 'crush', damage: 6, speed: 4 } },
  { id: 'retractable-claws', name: 'Retractable Claws', category: 'offense', phase: 1,
    mass: 3, appendages: 2, occupies: ['limb-tips'], needsClear: ['limb-tips'],
    provides: { slash: 1 }, attack: { kind: 'slash', damage: 3, speed: 9 },
    text: 'Rapid close-range slashes; needs free limb tips.' },
  { id: 'scythe-limbs', name: 'Scythe Limbs', category: 'offense', phase: 2,
    mass: 10, appendages: 2, protrusion: 3, occupies: ['limb-lateral'],
    provides: { sweep: 2 }, attack: { kind: 'sweep', damage: 8, speed: 3, arc: 3, commitSpeedCap: 6 },
    text: 'Wide committed sweeps. The arc is fixed: faster movement overshoots it.' },
  { id: 'impact-hammers', name: 'Impact Hammers', category: 'offense', phase: 2,
    mass: 14, appendages: 2, occupies: ['limb-tips'],
    provides: { stagger: 2 }, attack: { kind: 'hammer', damage: 9, speed: 2 } },
  { id: 'whip-tendrils', name: 'Barbed Whip Tendrils', category: 'offense', phase: 2,
    mass: 4, appendages: 1, protrusion: 2, occupies: ['dorsal'],
    provides: { reach: 2, pull: 1 }, attack: { kind: 'whip', damage: 4, speed: 5, reach: 2, tightSpacePenalty: 0.5 } },

  // ---------------------------------------------------------------- C. Defense / survival
  { id: 'dense-carapace', name: 'Dense Carapace', category: 'defense', phase: 1,
    mass: 30, occupies: ['dorsal'], stats: { armor: 6, turn: -2, stop: -2, speed: -1, reposition: -2 },
    provides: { armor: 6 }, text: 'Strong protection; the mass impairs agility.' },
  { id: 'flexible-chitin', name: 'Flexible Chitin', category: 'defense', phase: 2,
    mass: 8, stats: { armor: 3 }, provides: { armor: 3 } },
  { id: 'reactive-spines', name: 'Reactive Spines', category: 'defense', phase: 2,
    mass: 6, protrusion: 2, occupies: ['dorsal'], provides: { thorns: 3 } },
  { id: 'distributed-organs', name: 'Distributed Vital Organs', category: 'defense', phase: 2,
    mass: 5, provides: { noCriticalCore: 1 }, stats: { regenMultiplier: -0.5 } },
  { id: 'regenerative-tissue', name: 'Regenerative Tissue', category: 'defense', phase: 2,
    mass: 4, provides: { regen: 2 }, upkeep: 1 },

  // ---------------------------------------------------------------- D. Senses
  { id: 'chem-sensors', name: 'Chemical Sensor Tendrils', category: 'senses', phase: 1,
    mass: 1, occupies: ['head-sensor'], provides: { senseChemical: 2, track: 1 },
    text: 'Detect biological trails, feeding opportunities and chemical traces.' },
  { id: 'vibration-skin', name: 'Vibration-Sensing Skin', category: 'senses', phase: 2,
    mass: 2, provides: { senseVibration: 2 } },
  { id: 'heat-pits', name: 'Heat-Sensing Pits', category: 'senses', phase: 2,
    mass: 1, occupies: ['head-sensor'], provides: { senseHeat: 2 } },
  { id: 'sensory-network', name: 'Distributed Sensory Network', category: 'senses', phase: 2,
    mass: 3, exposed: true, provides: { awareness: 2 } },

  // ---------------------------------------------------------------- E. Feeding / metabolism
  { id: 'stomach-folds', name: 'Expandable Stomach Folds', category: 'metabolism', phase: 1,
    mass: 4, provides: { stomachCapacity: 3 }, text: 'Increases in-run stomach inventory capacity.' },
  { id: 'efficient-digestion', name: 'Efficient Digestion', category: 'metabolism', phase: 1,
    mass: 2, provides: { digestEfficiency: 0.5 }, text: 'Extracts more Metabolic Reserve from suitable biomass.' },
  { id: 'acid-chamber', name: 'Acidic Digestion Chamber', category: 'metabolism', phase: 2,
    mass: 5, pool: 'acid', provides: { digestHardMaterial: 1, acidSupply: 1 } },
  { id: 'reserve-sac', name: 'Emergency Reserve Sac', category: 'metabolism', phase: 3,
    mass: 6, volume: 2, provides: { reserveCapacity: 30 } },
  { id: 'detox-organ', name: 'Detoxification Organ', category: 'metabolism', phase: 2,
    mass: 3, upkeep: 1, provides: { detox: 2 } },

  // ---------------------------------------------------------------- F. Ability-chain organs
  { id: 'venom-gland', name: 'Venom Gland', category: 'chain', phase: 1,
    mass: 2, volume: 1, pool: 'venom', provides: { venomSupply: 1 },
    text: 'Supplies venom to compatible delivery mechanisms; delivers nothing by itself.' },
  { id: 'acid-sacs', name: 'Acid Sacs', category: 'chain', phase: 2,
    mass: 4, volume: 1, pool: 'acid', provides: { acidSupply: 1, acidAttack: 1 },
    attack: { kind: 'acid-spit', damage: 5, speed: 5, poolCost: 1 } },
  { id: 'electric-nodes', name: 'Electric Nodes', category: 'chain', phase: 3,
    mass: 3, volume: 1, pool: 'charge', provides: { shock: 1 } },
  { id: 'spore-sac', name: 'Spore Sac', category: 'chain', phase: 3,
    mass: 3, volume: 1, provides: { sporeCloud: 1 } },
  { id: 'chain-catalyst', name: 'Chain Catalyst Organ', category: 'chain', phase: 3,
    mass: 3, volume: 2, provides: { chainCatalyst: 1 }, upkeep: 1 },

  // ---------------------------------------------------------------- G. Utility / environment
  { id: 'fine-tendrils', name: 'Fine Manipulator Tendrils', category: 'utility', phase: 1,
    mass: 1, appendages: 1, provides: { manipulateFine: 1 },
    text: 'Operate small controls, keycards and delicate objects.' },
  { id: 'gripping-limbs', name: 'Heavy Gripping Limbs', category: 'utility', phase: 2,
    mass: 12, appendages: 2, provides: { manipulateHeavy: 1 }, stats: { fineInterference: 1 } },
  { id: 'corrosive-secretion', name: 'Corrosive Secretion', category: 'utility', phase: 2,
    mass: 2, pool: 'acid', provides: { dissolve: 1 } },
  { id: 'electrogenic-contact', name: 'Electrogenic Contact Organ', category: 'utility', phase: 3,
    mass: 3, pool: 'charge', provides: { shortMachinery: 1 } },

  // ---------------------------------------------------------------- H. Neural / behavioral
  { id: 'limb-controllers', name: 'Independent Limb Controllers', category: 'neural', phase: 1,
    mass: 1, provides: { multiAppendageCoordination: 1 }, upkeep: 1,
    text: 'Coordinated attacks from multiple appendages at a metabolic cost.' },
  { id: 'reflex-nervous', name: 'Reflex-Dominant Nervous System', category: 'neural', phase: 2,
    slot: 'nervous', mass: 0, stats: { reaction: 4, precision: -3 }, provides: { reflex: 1 } },
  { id: 'pursuit-response', name: 'Predatory Pursuit Response', category: 'neural', phase: 2,
    mass: 0, provides: { pursuit: 2, overcommitRisk: 1 } },
  { id: 'pain-overdrive', name: 'Pain-Triggered Overdrive', category: 'neural', phase: 3,
    mass: 0, provides: { overdrive: 1 }, upkeep: 1 }
];

export const MUTATION_INDEX = Object.fromEntries(MUTATIONS.map(m => [m.id, m]));
export const PHASE1_IDS = MUTATIONS.filter(m => m.phase === 1).map(m => m.id);

export function getMutation(id) {
  const m = MUTATION_INDEX[id];
  if (!m) throw new Error('Unknown mutation: ' + id);
  return m;
}
