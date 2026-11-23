// Cash stashes hidden around Solmar Bay: find one on foot or by car and
// it pays out cash plus respect. The field is plain data — the world
// sweeps it each frame, the renderer paints the ones still waiting.
export const STASH_REWARD_CASH = 250;
export const STASH_REWARD_RP = 25;
export const STASH_PICKUP_RADIUS = 3.5;

// Twenty hiding spots as "x,z|hint" rows, chosen for variety: city
// corners, the beach, the pier, the plaza, the docks. Each game hides
// twelve of them, shuffled with the world's own stream so a seeded run
// always hides them in the same places.
const SPOT_ROWS = [
  '-150,-150|behind the north-west wall',
  '150,-150|by the north-east fence',
  '-150,150|behind the south-west wall',
  '150,150|by the south-east fence',
  '-130,60|in the alley off Tangerine Mile',
  '130,-60|behind the hotel dumpsters',
  '0,196|at the very end of the pier',
  '-26,182|under the beach boardwalk',
  '78,182|behind the lifeguard hut',
  '-78,-182|by the north docks',
  '104,-130|in the car park stairwell',
  '-104,130|behind the plaza kiosk',
  '26,78|in the plaza flowerbeds',
  '-52,-130|under the overpass shadow',
  '156,26|on the east promenade',
  '-156,-26|on the west promenade',
  '52,156|by the south beach steps',
  '-26,-156|behind the north market',
  '130,104|in the marina office yard',
  '-130,-104|in the old bus depot',
];

function parseSpot(row) {
  const [coords, hint] = row.split('|');
  const [x, z] = coords.split(',').map(Number);
  return [x, z, hint];
}
export const STASH_SPOTS = SPOT_ROWS.map(parseSpot);

function shuffledSpots(rng) {
  const pool = STASH_SPOTS.map(([x, z, hint]) => ({x, z, hint}));
  let i = pool.length - 1;
  while (i > 0) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
    i -= 1;
  }
  return pool;
}

export function createStashField(rng, count = 12) {
  const picked = shuffledSpots(rng).slice(0, count);
  return {
    list: picked.map((spot, i) => ({id: i, x: spot.x, z: spot.z, hint: spot.hint, found: false})),
    found: 0,
    total: picked.length,
  };
}

// Sweep the field from (x, z): every stash in reach is collected, and the
// collected ones come back so the caller can pay out and announce them.
export function sweepStashes(field, x, z) {
  const radiusSq = STASH_PICKUP_RADIUS * STASH_PICKUP_RADIUS;
  const taken = [];
  for (const stash of field.list) {
    if (stash.found) continue;
    const dx = stash.x - x;
    const dz = stash.z - z;
    if (dx * dx + dz * dz >= radiusSq) continue;
    stash.found = true;
    field.found += 1;
    taken.push(stash);
  }
  return taken;
}

export function stashesLeft(field) {
  return field.total - field.found;
}

export function stashProgress(field) {
  return `${field.found} / ${field.total}`;
}

// New game: hide everything again, counter back to zero.
export function resetStashField(field) {
  for (const stash of field.list) stash.found = false;
  field.found = 0;
}

// Hint line for the HUD: the next stash still out there, or null when done.
export function nextStashHint(field) {
  const open = field.list.find((s) => !s.found);
  return open ? open.hint : null;
}
