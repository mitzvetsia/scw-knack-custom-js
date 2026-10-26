// Handcrafted area library. Layouts are authored; the ROUTE through them is
// procedural (generator.js). Each area declares what the player can see about
// it at a junction (`clue`) and what they cannot (`hidden`).
//
// type: encounter | specimen | rampage | shortcut | resource | exit
// tight: true means whip/scythe-style reach attacks are penalised and
// compression/narrow traversal can bypass part of the fight.

export const ENEMIES = {
  guard:    { id: 'guard',    name: 'Security guard',   hp: 10, attack: 3, armor: 0, biomass: 3, imprints: 2 },
  handler:  { id: 'handler',  name: 'Animal handler',   hp: 6,  attack: 2, armor: 0, biomass: 3, imprints: 1, drops: ['keycard'] },
  drone:    { id: 'drone',    name: 'Suppression drone',hp: 8,  attack: 3, armor: 1, biomass: 0, imprints: 3 },
  tech:     { id: 'tech',     name: 'Lab technician',   hp: 5,  attack: 1, armor: 0, biomass: 2, imprints: 1, drops: ['sample-vial'] },
  specimen: { id: 'specimen', name: 'Rival specimen',   hp: 22, attack: 5, armor: 1, biomass: 8, imprints: 8, drops: ['specimen-trait'] },
  swarm:    { id: 'swarm',    name: 'Lab rat swarm',    hp: 4,  attack: 1, armor: 0, biomass: 2, imprints: 1 }
};

export const ITEMS = {
  keycard:        { id: 'keycard',        name: 'Access keycard',      size: 1, value: 4, use: 'exit' },
  'sample-vial':  { id: 'sample-vial',    name: 'Sealed sample vial',  size: 1, value: 6 },
  'specimen-trait': { id: 'specimen-trait', name: 'Harvested specimen trait', size: 2, value: 15 },
  'nutrient-brick': { id: 'nutrient-brick', name: 'Nutrient brick',   size: 1, value: 2, biomass: 6 },
  'coolant-cell': { id: 'coolant-cell',   name: 'Coolant cell',        size: 2, value: 8 },
  'research-drive': { id: 'research-drive', name: 'Research drive',   size: 1, value: 12 }
};

export const AREAS = [
  // --- encounters
  { id: 'holding-corridor', type: 'encounter', name: 'Holding corridor', tight: true,
    layout: 'A narrow corridor of empty holding cells. Cover on both sides, no room to sweep.',
    clue: 'Patrol footsteps; a narrow passage.', hidden: 'Two guards, one of them carrying a keycard.',
    enemies: ['guard', 'handler'], items: [], risk: 2, rewards: { imprints: 2, offers: 1 } },
  { id: 'observation-deck', type: 'encounter', name: 'Observation deck', tight: false,
    layout: 'A wide glass-walled deck above the enclosures. Open floor, a drone dock in the corner.',
    clue: 'Open space; a charging whine.', hidden: 'A suppression drone and a technician.',
    enemies: ['drone', 'tech'], items: ['research-drive'], risk: 3, rewards: { imprints: 3, offers: 1 } },
  { id: 'decon-showers', type: 'encounter', name: 'Decontamination showers', tight: true,
    layout: 'Tiled stalls and chemical nozzles. Wet floor, poor footing for heavy bodies.',
    clue: 'Chemical smell; a single set of footsteps.', hidden: 'One guard; acidic residue that fine tendrils can harvest.',
    enemies: ['guard'], items: ['sample-vial'], risk: 1, rewards: { imprints: 1, offers: 1 } },
  // --- specimen (dangerous, high reward)
  { id: 'rival-enclosure', type: 'specimen', name: 'Rival enclosure', tight: false,
    layout: 'A reinforced enclosure with a second escaped specimen inside. Broad floor, nothing to hide behind.',
    clue: 'Something large is breathing behind the shutter. Reward glints beyond it.', hidden: 'A full-strength rival specimen; its trait can be harvested.',
    enemies: ['specimen'], items: [], risk: 5, rewards: { imprints: 6, offers: 2 } },
  { id: 'vivisection-theatre', type: 'specimen', name: 'Vivisection theatre', tight: false,
    layout: 'A surgical theatre. A restrained specimen is breaking its straps.',
    clue: 'Alarms, restraint straps snapping. Surgical stores visible.', hidden: 'A wounded rival specimen and a technician; several vials.',
    enemies: ['specimen', 'tech'], items: ['sample-vial', 'sample-vial'], risk: 4, rewards: { imprints: 5, offers: 2 } },
  // --- rampage (many weak enemies, biomass)
  { id: 'rat-storage', type: 'rampage', name: 'Live-stock storage', tight: false,
    layout: 'Stacked cages of lab animals. The floor crawls once the cages give.',
    clue: 'Squealing. Lots of it. Easy biomass.', hidden: 'Three rat swarms and a handler; a nutrient brick on the shelf.',
    enemies: ['swarm', 'swarm', 'swarm', 'handler'], items: ['nutrient-brick'], risk: 2, rewards: { imprints: 3, offers: 1 } },
  { id: 'cafeteria', type: 'rampage', name: 'Staff cafeteria', tight: false,
    layout: 'Tables, a serving line, two exits. Staff scatter when the door gives.',
    clue: 'Many voices; food smells.', hidden: 'Two technicians and a guard; nutrient bricks everywhere.',
    enemies: ['tech', 'tech', 'guard'], items: ['nutrient-brick', 'nutrient-brick'], risk: 2, rewards: { imprints: 3, offers: 1 } },
  // --- shortcut (hazard, skips ahead)
  { id: 'vent-crawl', type: 'shortcut', name: 'Ventilation crawl', tight: true, skip: 1,
    layout: 'A maintenance vent that bypasses the next section. Fans, heat, no room to fight.',
    layoutNote: 'Compression folds or a narrow body pass freely; anything else takes fan damage.',
    clue: 'A vent grille, warm air. Skips ahead.', hidden: 'Fan blades deal damage unless the body can fold or slip through.',
    enemies: [], items: [], risk: 3, hazard: { damage: 6, bypass: ['compress', 'narrow', 'climb'] }, rewards: { imprints: 1, offers: 0 } },
  { id: 'coolant-channel', type: 'shortcut', name: 'Coolant channel', tight: true, skip: 1,
    layout: 'A drainage channel under the floor. Caustic coolant ankle deep.',
    clue: 'A drainage grate; chemical burn smell. Skips ahead.', hidden: 'Caustic coolant; corrosion-resistant or detoxifying bodies ignore it.',
    enemies: [], items: ['coolant-cell'], risk: 3, hazard: { damage: 5, bypass: ['dissolve', 'detox'] }, rewards: { imprints: 1, offers: 0 } },
  // --- resource (low risk, items / offers)
  { id: 'sample-archive', type: 'resource', name: 'Sample archive', tight: false,
    layout: 'Refrigerated racks of sealed samples. Nobody home.',
    clue: 'Cold air; no voices. Supplies.', hidden: 'Several vials and a research drive; a cabinet needing fine manipulation.',
    enemies: [], items: ['sample-vial', 'sample-vial', 'research-drive'], risk: 0, rewards: { imprints: 1, offers: 2 } },
  { id: 'feeding-station', type: 'resource', name: 'Feeding station', tight: false,
    layout: 'Automated feeders and a biomass hopper.',
    clue: 'Food smells; machinery humming. Supplies.', hidden: 'Nutrient bricks; a handler on break.',
    enemies: ['handler'], items: ['nutrient-brick', 'nutrient-brick', 'nutrient-brick'], risk: 1, rewards: { imprints: 1, offers: 1 } },
  // --- zone exit challenges (constrained, strategic; not boss fights)
  { id: 'pressure-lock', type: 'exit', name: 'Pressure lock', tight: true,
    layout: 'A sealed bulkhead with a keypad, a hinge seam, and a turret covering the approach.',
    clue: 'Zone exit.', hidden: '',
    paths: [
      { id: 'keypad', name: 'Work the keypad', needs: { ability: 'interact-fine' }, cost: {} },
      { id: 'keycard', name: 'Swipe a keycard', needs: { item: 'keycard' }, cost: { item: 'keycard' } },
      { id: 'force', name: 'Batter the hinge', needs: { stat: ['force', 7] }, cost: { hp: 4 } },
      { id: 'dissolve', name: 'Dissolve the seam', needs: { ability: 'dissolve' }, cost: { pool: 'acid' } },
      { id: 'brute', name: 'Claw at it under turret fire', needs: {}, cost: { hp: 10, reserve: 5 } }
    ] },
  { id: 'cargo-lift', type: 'exit', name: 'Cargo lift', tight: false,
    layout: 'A freight lift in a shaft. The call panel is dead; the counterweight cable and the shaft walls are exposed.',
    clue: 'Zone exit.', hidden: '',
    paths: [
      { id: 'climb', name: 'Climb the shaft', needs: { ability: 'climb' }, cost: {} },
      { id: 'cable', name: 'Haul the counterweight cable', needs: { ability: 'interact-heavy' }, cost: { reserve: 4 } },
      { id: 'keycard', name: 'Override with a keycard', needs: { item: 'keycard' }, cost: { item: 'keycard' } },
      { id: 'leap', name: 'Leap between ledges', needs: { stat: ['speed', 7] }, cost: { hp: 3 } },
      { id: 'brute', name: 'Wedge the car and wait', needs: {}, cost: { hp: 8, reserve: 6 } }
    ] },
  { id: 'quarantine-gate', type: 'exit', name: 'Quarantine gate', tight: true,
    layout: 'A gas-flooded airlock. The vents can be shut, the glass broken, or the gas endured.',
    clue: 'Zone exit.', hidden: '',
    paths: [
      { id: 'vents', name: 'Shut the vents', needs: { ability: 'interact-fine' }, cost: {} },
      { id: 'detox', name: 'Walk through the gas', needs: { capability: 'detox' }, cost: {} },
      { id: 'glass', name: 'Break the glass', needs: { stat: ['force', 6] }, cost: { hp: 3 } },
      { id: 'track', name: 'Follow a technician\'s trail to the service hatch', needs: { ability: 'track' }, cost: { reserve: 3 } },
      { id: 'brute', name: 'Endure the gas', needs: {}, cost: { hp: 9, reserve: 4 } }
    ] }
];

export const AREA_INDEX = Object.fromEntries(AREAS.map(a => [a.id, a]));

export const ZONE_THEMES = [
  'Containment Wing', 'Processing Labs', 'Maintenance Sublevel', 'Loading Bays', 'Surface Perimeter'
];
