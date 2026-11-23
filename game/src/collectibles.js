// Hidden stashes: cash packages tucked into Solmar Bay's corners —
// behind the lighthouse, under the pier, on rooftops you can only reach
// on foot. Finding one pays cash and respect, and the HUD keeps score.
// A stash field is plain data; the world sweeps it every frame and the
// renderer paints the ones still waiting.

export const STASH_REWARD_CASH = 250;
export const STASH_REWARD_RP = 25;
export const STASH_PICKUP_RADIUS = 3.5;

// Twenty hiding spots, picked for variety: alleys, the beach, the pier,
// the plaza, rooftops edges and the docks. The field takes twelve of
// them per game, shuffled by the world's own random stream so every
// seeded run hides them in the same places.
export const STASH_SPOTS = [
  {x: -150, z: -150, hint: 'behind the north-west wall'},
  {x: 150, z: -150, hint: 'by the north-east fence'},
  {x: -150, z: 150, hint: 'behind the south-west wall'},
  {x: 150, z: 150, hint: 'by the south-east fence'},
  {x: -130, z: 60, hint: 'in the alley off Tangerine Mile'},
  {x: 130, z: -60, hint: 'behind the hotel dumpsters'},
  {x: 0, z: 196, hint: 'at the very end of the pier'},
  {x: -26, z: 182, hint: 'under the beach boardwalk'},
  {x: 78, z: 182, hint: 'behind the lifeguard hut'},
  {x: -78, z: -182, hint: 'by the north docks'},
  {x: 104, z: -130, hint: 'in the car park stairwell'},
  {x: -104, z: 130, hint: 'behind the plaza kiosk'},
  {x: 26, z: 78, hint: 'in the plaza flowerbeds'},
  {x: -52, z: -130, hint: 'under the overpass shadow'},
  {x: 156, z: 26, hint: 'on the east promenade'},
  {x: -156, z: -26, hint: 'on the west promenade'},
  {x: 52, z: 156, hint: 'by the south beach steps'},
  {x: -26, z: -156, hint: 'behind the north market'},
  {x: 130, z: 104, hint: 'in the marina office yard'},
  {x: -130, z: -104, hint: 'in the old bus depot'},
];

export function createStashField(rng, count = 12) {
  const spots = STASH_SPOTS.slice();
  // Fisher-Yates with the world's stream: deterministic per seed.
  for (let i = spots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = spots[i];
    spots[i] = spots[j];
    spots[j] = tmp;
  }
  const chosen = spots.slice(0, count);
  return {
    list: chosen.map((spot, i) => ({id: i, x: spot.x, z: spot.z, hint: spot.hint, found: false})),
    found: 0,
    total: chosen.length,
  };
}

// Walk or drive within reach of a stash and it is yours. Returns the
// stashes collected on this sweep so the caller can pay out and announce.
export function sweepStashes(field, x, z) {
  const collected = [];
  for (const stash of field.list) {
    if (stash.found) continue;
    const dx = stash.x - x;
    const dz = stash.z - z;
    if (dx * dx + dz * dz < STASH_PICKUP_RADIUS * STASH_PICKUP_RADIUS) {
      stash.found = true;
      field.found += 1;
      collected.push(stash);
    }
  }
  return collected;
}

export function stashesLeft(field) {
  return field.total - field.found;
}

// "7 / 12" for the HUD counter.
export function stashProgress(field) {
  return `${field.found} / ${field.total}`;
}

// Start the hunt over: every stash hidden again, count back to zero.
// Used when a new game begins.
export function resetStashField(field) {
  for (const stash of field.list) stash.found = false;
  field.found = 0;
}

// The next unfound stash, for the HUD hint line. Cycles as they are found.
export function nextStashHint(field) {
  const open = field.list.find((s) => !s.found);
  return open ? open.hint : null;
}
