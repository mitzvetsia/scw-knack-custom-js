// Ability chains: the triggers/effects that can execute given the ACTIVE
// capabilities. Derived, never stored. A supply organ (Venom Gland) is useless
// without an active delivery structure; a delivery structure (Venomous Fangs)
// whose bite is obstructed delivers nothing — the chain simply does not form.

export function deriveAbilities(bio, anatomy) {
  const caps = bio.capabilities;
  const abilities = [];
  const operating = anatomy.filter(e => e.status === 'active' || e.status === 'limited' || e.status === 'impaired');
  const note = s => bio.explanations.push(s);

  // --- Attacks come from structures that define one and are ACTIVE.
  for (const e of operating) {
    const atk = e.def.attack;
    if (!atk || e.status !== 'active') continue;
    const a = {
      id: atk.kind, name: `${e.name} ${atk.kind}`, source: e.id, kind: 'attack',
      damage: atk.damage, speed: atk.speed, effects: [], flags: [], pool: null
    };
    if (atk.poolCost) { a.pool = e.def.pool; a.poolCost = atk.poolCost; }
    if (atk.kind === 'bite' && (caps.venomSupply || 0) > 0 && (caps.venomDelivery || 0) > 0) {
      a.effects.push({ type: 'poison', damagePerTurn: 2, turns: 3, pool: 'venom' });
      a.name += ' (venomous)';
    }
    if (atk.commitSpeedCap !== undefined && bio.stats.speed > atk.commitSpeedCap) {
      a.flags.push('overshoot');
      a.hitChanceModifier = -0.2;
      note(`${e.name}: movement speed ${bio.stats.speed} exceeds the sweep's commit cap ${atk.commitSpeedCap}; the arc stays ${atk.arc} wide, so fast approaches overshoot (hit chance -20%).`);
    }
    if (atk.tightSpacePenalty) a.tightSpacePenalty = atk.tightSpacePenalty;
    abilities.push(a);
  }

  // Supply organs with no active delivery mechanism.
  if ((caps.venomSupply || 0) > 0 && !abilities.some(a => a.effects.some(f => f.type === 'poison'))) {
    const fangs = anatomy.find(e => e.id === 'venomous-fangs');
    note(fangs
      ? `Venom cannot be delivered: ${fangs.name} is ${fangs.status} (${fangs.reason}).`
      : 'Venom Gland has no compatible delivery mechanism; venom is produced but never delivered.');
  }

  // Every body can at least maul; real attack structures supersede it.
  if (!abilities.some(a => a.kind === 'attack')) {
    abilities.push({ id: 'maul', name: 'Baseline maul', source: 'baseline-body', kind: 'attack', damage: 4, speed: 5, effects: [], flags: [] });
  }

  // --- Frame-derived attacks.
  if ((caps.charge || 0) > 0) {
    abilities.push({ id: 'charge', name: 'Battering charge', source: 'frame', kind: 'attack',
      damage: 4 + bio.stats.force, speed: bio.stats.speed, effects: [{ type: 'stagger', turns: 1 }],
      flags: bio.stats.stop <= 2 ? ['overrun'] : [] });
    if (bio.stats.stop <= 2) note('Charges are forceful but the body cannot stop quickly: a missed charge leaves the creature exposed for a turn.');
  }

  // --- Coordinated multi-appendage strikes.
  const attacks = abilities.filter(a => a.kind === 'attack' && !a.pool);
  if ((caps.multiAppendageCoordination || 0) > 0 && attacks.length >= 2) {
    const [a1, a2] = attacks.slice().sort((x, y) => y.damage - x.damage);
    abilities.push({ id: 'combined-strike', name: `Combined strike (${a1.name} + ${a2.name})`, source: 'limb-controllers',
      kind: 'attack', damage: a1.damage + Math.floor(a2.damage / 2), speed: Math.min(a1.speed, a2.speed),
      effects: [...a1.effects, ...a2.effects], flags: ['metabolic'], reserveCost: 3 });
  }

  // --- Utility / traversal chains.
  if ((caps.manipulateFine || 0) > 0) {
    const interfered = (bio.stats.fineInterference || 0) > 0;
    abilities.push({ id: 'interact-fine', name: 'Operate delicate controls', kind: 'utility', source: 'fine-tendrils',
      flags: interfered ? ['slow'] : [] });
    if (interfered) note('Heavy Gripping Limbs crowd the fine tendrils: delicate interactions take an extra turn.');
  }
  if ((caps.manipulateHeavy || 0) > 0) abilities.push({ id: 'interact-heavy', name: 'Lift / drag / throw heavy objects', kind: 'utility', source: 'gripping-limbs', flags: [] });
  if ((caps.dissolve || 0) > 0) abilities.push({ id: 'dissolve', name: 'Dissolve designated materials', kind: 'utility', source: 'corrosive-secretion', pool: 'acid', poolCost: 1, flags: [] });
  if ((caps.climb || 0) > 0) abilities.push({ id: 'climb', name: 'Climb walls and ceilings', kind: 'traversal', source: 'climbing-pads', flags: [] });
  else if (anatomy.some(e => e.id === 'climbing-pads' && e.status === 'impaired')) note('Climbing is unavailable until mass drops within the pads\' capacity.');
  if ((caps.compress || 0) >= 1) abilities.push({ id: 'compress', name: 'Fold through tight gaps', kind: 'traversal', source: 'compression-folds', flags: [] });
  else if ((caps.compress || 0) > 0) abilities.push({ id: 'compress', name: 'Fold through tight gaps (wide gaps only)', kind: 'traversal', source: 'compression-folds', flags: ['limited'] });
  if ((caps.narrowPassage || 0) > 0) abilities.push({ id: 'narrow', name: 'Slip through narrow passages', kind: 'traversal', source: 'serpentine-body', flags: [] });

  // --- Perception / behaviour chains.
  if ((caps.track || 0) > 0) {
    const over = (caps.overcommitRisk || 0) > 0;
    abilities.push({ id: 'track', name: 'Track prey by chemical trail', kind: 'sense', source: 'chem-sensors',
      flags: over ? ['pursuit-lock'] : [] });
    if (over) note('Chemical tracking plus the Predatory Pursuit Response: the creature follows trails relentlessly and may commit into a trap or an ambush before it can disengage.');
  }
  if ((caps.senseHeat || 0) > 0) abilities.push({ id: 'sense-heat', name: 'See warm targets in the dark', kind: 'sense', source: 'heat-pits', flags: ['heat-masking-limited'] });
  if ((caps.senseVibration || 0) > 0) abilities.push({ id: 'sense-vibration', name: 'Feel movement through surfaces', kind: 'sense', source: 'vibration-skin', flags: [] });

  // --- Chain extension (Reserve Sac + Catalyst).
  if ((caps.chainCatalyst || 0) > 0) {
    const extended = (caps.reserveCapacity || 0) > 0;
    abilities.push({ id: 'chain-extend', name: extended ? 'Extended ability chains' : 'Catalyzed ability chain', kind: 'passive',
      source: 'chain-catalyst', flags: extended ? ['extended'] : [] });
    if (extended) note('Emergency Reserve Sac feeds the Chain Catalyst Organ: chains can run an extra link, at the cost of the organ volume and upkeep both organs claim.');
  }

  return abilities;
}
