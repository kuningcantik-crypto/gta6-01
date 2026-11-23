// Solmar Bay tuning, all in one place. Every number that shapes the city,
// the cars, the fights and the story lives here; the rest of the game only
// ever reads values from here and never hard-codes a tuning number of its own.
// Contract: the RUNTIME values must stay identical to the original tuning —
// only the source form may change (rows, builders, fragments). A single
// number drifting here changes the game everywhere.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';

// A map point, from an [x, z] pair.
const at = (pair) => ({x: pair[0], z: pair[1]});
// An arithmetic run: start, step, count.
const run = (start, step, count) => Array.from({length: count}, (_, i) => start + i * step);
// Join sentence fragments into one string, so long texts stay readable.
const s = (...parts) => parts.join(' ');

// The city is a grid. Roads run along these lines on both axes; blocks sit
// between them. The beach and the ocean lie south, past the last road.
export const CITY = {
  roads: run(-156, 52, 7),
  roadWidth: 12,
  blockCentres: run(-130, 52, 6),
  blockSize: 40,
  half: 182,
  beachZ: 182,
  oceanZ: 210,
  pier: at([0, 196]),
  safehouse: at([-130, -130]),
  hospital: at([130, -130]),
  bank: at([26, -26]),
  hideout: at([-156, 156]),
  plaza: at([0, 0]),
  hotel: at([130, -78]),
};

export const PLAYER = {
  startCash: 120, maxHealth: 100, radius: 0.6,
  walkSpeed: 6, runSpeed: 10, jumpSpeed: 8, gravity: 22,
};

export const CAR = {
  maxSpeed: 30, maxReverse: 11, accel: 22, brake: 34, reverseAccel: 12,
  steer: 1.9, grip: 8, radius: 1.6,
};

export const TRAFFIC = {parkedCount: 7, count: 12, speed: 9};
export const PEDS = {fleeSpeed: 4.2, walkSpeed: 1.6, count: 26};

export const WANTED = {
  bustSeconds: 2.5, bustDistance: 2.2, maxStars: 5,
  decayDelay: 25, decayInterval: 10, policePerStar: 1, maxPolice: 5,
};

export const COMBAT = {damage: 34, range: 60, ammo: 12, reloadSeconds: 1.6};

// Seven weapon slots. The first two are Rico's from the start; the rest
// unlock as his respect rank grows and arrive with reserve ammo.
// [id, name, short, damage, cooldown, mag, unlockRp, startAmmo]
const WEAPON_ROWS = [
  ['fists', 'FISTS', 'FISTS', 0, 0.5, Infinity, 0, 0],
  ['pistol', '.38 PISTOL', '.38', 34, 0.22, 12, 0, 60],
  ['smg', 'SMG', 'SMG', 16, 0.09, 30, 250, 90],
  ['shotgun', '12G PUMP', '12G', 70, 0.7, 6, 600, 24],
  ['ar', 'AR-15', 'AR', 28, 0.12, 30, 1200, 120],
  ['rpg', 'RPG-7', 'RPG', 120, 1.2, 1, 2500, 5],
  ['sniper', 'LONGSHOT .50', '.50', 150, 1.0, 5, 5000, 15],
];
export const WEAPONS = WEAPON_ROWS.map(([id, name, short, damage, cooldown, mag, unlockRp, startAmmo]) =>
  ({id, name, short, damage, cooldown, mag, unlockRp, startAmmo}));

// Respect: RP comes from jobs, takedowns and pickups. Ranks gate weapons.
// [rp, name]
const RANK_ROWS = [
  [0, 'DRIVER'], [250, 'HUSTLER'], [600, 'FIXER'],
  [1200, 'SHOT CALLER'], [2500, 'KINGPIN'], [5000, 'LEGEND OF SOLMAR'],
];
export const RESPECT_RANKS = RANK_ROWS.map(([rp, name]) => ({rp, name}));

export function rankFor(rp) {
  let idx = 0;
  while (idx + 1 < RESPECT_RANKS.length && rp >= RESPECT_RANKS[idx + 1].rp) idx += 1;
  return {rank: RESPECT_RANKS[idx], next: RESPECT_RANKS[idx + 1] ?? null};
}

// Radio: five original stations. The track line turns over every 45 s.
// Each station carries a DJ and a couple of spoken lines: switching
// station drops a line from the DJ into the dialogue box, like a real
// radio handover.
// name|genre|dj|title|artist|title|artist|title|artist|dj line|dj line
const STATION_ROWS = [
  "OMBO 98.4|Island Pop|DJ Palma|Guava Sunrise|Vela Roja|Salt Air|Kip Sorrento|Tangerine Mile|The Palms|Good evening, Solmar — this is Palma, and the tide is high.|Palma here. The sunset is doing half my job tonight.",
  "RADIO MANGO 99.1|Salsa & Cumbia|DJ Mango|Arepa Lights|Kip Sorrento|Malecón Mirage|Vela Roja|Baila Solmar|Los Brisa|¡Buenas noches! Mango here — turn it up, the night is young.|Mango on the mic. If your hips are not moving, check your pulse.",
  "CELESTE 98.1|Chillwave|Celeste|Neon Pier|Mira Kesang|Low Tide|Celeste|Golden Hour|DJ Palma|You're listening to Celeste. Breathe in, Solmar. Breathe out.|Celeste here — low tide, low lights, low worries.",
  "BASSLINE 101.7|Hip-Hop|DJ Nacho|Kingpin|Rico Vane|Fast Money|Nacho|Run the Block|Lil Tía|Bassline 101.7 — Nacho on the decks. Run the block, Rico.|Nacho here. That last track was for everyone with a warrant.",
  "TIDE FM 97.3|Surf Rock & Indie|DJ Waverly|Boardwalk Static|The Breakers|Saltwater Static|Kip Sorrento|Pier Lights|Mira Kesang|Tide FM — Waverly here, riding the static off the bay.|Waverly on the mic. If the surf is up, the volume goes up too.",
];
function stationFromRow(row) {
  const [name, genre, dj, t1, a1, t2, a2, t3, a3, line1, line2] = row.split('|');
  return {
    name, genre, dj,
    tracks: [`${t1} — ${a1}`, `${t2} — ${a2}`, `${t3} — ${a3}`],
    lines: [line1, line2],
  };
}
export const RADIO = STATION_ROWS.map(stationFromRow);

// Districts, named by where the player stands. Heat is per-district
// trouble Rico builds up (0–100, shown in the HUD).
// [name, road, x0, z0, x1, z1]
const DISTRICT_ROWS = [
  ['NEON PIER', 'Pier Walk', -30, 182, 30, 230],
  ['KUMALA STRAND', 'Strand Boulevard', -182, 156, 182, 182],
  ['OLD TOWN', 'Calle Rosa', -182, -182, -52, 52],
  ['BRISA SOUND', 'Harbour Road', 52, -182, 182, 52],
  ['SOLTERRA STRAND', 'Tangerine Mile', -52, 52, 182, 156],
  ['PALMA HEIGHTS', 'Palm Court', -52, -182, 52, -52],
  ['CENTRAL PLAZA', 'Plaza Mayor', -52, -52, 52, 52],
];
export const DISTRICTS = DISTRICT_ROWS.map(([name, road, x0, z0, x1, z1]) => ({name, road, x0, z0, x1, z1}));

export function districtAt(x, z) {
  return DISTRICTS.find((d) => x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1)
    ?? DISTRICTS[DISTRICTS.length - 1];
}

// The heat word the HUD shows for a district's trouble level.
export function heatLabel(heat) {
  return heat < 30 ? 'NEUTRAL' : heat < 60 ? 'WARM' : 'HOT';
}

// Every stealable car gets a name from its paint and index.
export const CAR_NAMES = [
  'RUKAN PELO GT', 'VELOZ COMET RS',
  'CALYX SPRINT GT', 'VIREO GT',
  'TARO CRUISER', 'BRISA COUPE',
  'MANGO ROADSTER', 'PALMA SEDAN',
];

export const PALETTE = {
  skyTop: 0x1e3a6e, skyHorizon: 0xff9e5e, sun: 0xffd9a0,
  road: 0x23272e, roadLine: 0xf5d76e, sidewalk: 0x8f959e,
  sand: 0xe8cf9a, ocean: 0x14586e, grass: 0x5da24a,
  building: [0xe8b48a, 0xd98a7a, 0x8ab4d9, 0xf2e3c6, 0xb08ad9, 0x7ac9a8, 0xe8e0d0, 0xc96a6a],
  car: [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x222222, 0x8a5fd9, 0xff7a2b],
  police: 0x1c2b4a, taxi: 0xf2c230,
};

export const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

// The crew: real abilities with cooldowns, bound to keys.
// [id, name, who, key, cooldown, desc]
const CREW_ROWS = [
  ['plates', 'SWAP PLATES', 'Mira · Driver', 'Z', 60, 'Lose 1 wanted star'],
  ['fix', 'QUICK FIX', 'Lio · Mechanic', 'X', 45, 'Repair your car ($50)'],
  ['eyes', 'EYES OUT', 'Kiki · Lookout', 'V', 60, 'Reveal the police search zone (10 s)'],
];
export const CREW = CREW_ROWS.map(([id, name, who, key, cooldown, desc]) => ({id, name, who, key, cooldown, desc}));

// A job is a title, a giver, a chapter, a brief, a payout in cash and
// respect, one opening line, and a chain of steps. A step is a place to
// reach (goto), a thing to collect (collect), a wanted level to earn
// (wanted), a passenger to pick up and drop off (pickup / deliver), a
// timed hold (hold), a race through gates against the clock (race), a
// car to smash until it stops (ram), police cars to disable (eliminate),
// or a place to reach before the clock runs out (timed).
//
// Jobs as rows: [id, title, giver, chapter, brief, reward, rp, line, steps]
// Steps as rows: [kind, label, pos|null, extra] where pos is [x, z].
function buildStep([kind, label, pos, extra = {}]) {
  const step = {kind, label, ...extra};
  if (pos) step.pos = at(pos);
  return step;
}
function buildJob([id, title, giver, chapter, brief, reward, rp, line, steps]) {
  return {id, title, giver, chapter, brief, reward, rp, dialogue: [line], steps: steps.map(buildStep)};
}
const JOB_ROWS = [
  ['welcome', 'Welcome to Solmar', 'Lucia', 'CH.1',
    s('Lucia needs wheels.', 'Steal a car and drive to the Neon Pier to meet her.'),
    150, 150,
    s('Rico, welcome home.', 'First rule of Solmar: wheels before words.', 'Steal a car and meet me at the Neon Pier.'),
    [
      ['goto', 'Steal a car (walk up to one, press E)', null, {anyCar: true}],
      ['goto', 'Drive to the Neon Pier', [0, 196]],
    ]],
  ['packages', 'Package Run', 'Lucia', 'CH.1',
    s('Three packages are stashed around the city.', 'Collect them all — and stay out of trouble.'),
    250, 150,
    s('Three packages, three corners of the city.', 'No noise, no heat.', 'Bring them back and the money is yours.'),
    [
      ['collect', 'Collect the packages (0/3)', [-130, 26], {count: 3,
        spots: [at([-130, 26]), at([78, -78]), at([130, 78])]}],
    ]],
  ['getaway', 'Getaway Driver', 'Mira', 'CH.2',
    s('The cops are onto you.', 'Earn heat, then lose them at the safehouse.'),
    300, 200,
    s('You want to drive for us? Prove it.', 'Get the cops on your tail — then shake them at the safehouse.'),
    [
      ['wanted', 'Get the cops on you (2 stars)', null, {stars: 2}],
      ['goto', 'Lose the heat at the safehouse', [-130, -130]],
    ]],
  ['taxi', 'Taxi Hustle', 'Lio', 'CH.2',
    s('A fare is waiting at the plaza.', 'Pick them up, drop them at the airport hotel.'),
    200, 150,
    s('Easy money, Rico.', 'A fare at the plaza, hotel on the north side.', 'Drive like you own the road — because soon you will.'),
    [
      ['pickup', 'Pick up the fare at the plaza', [0, 0]],
      ['deliver', 'Drop the fare at the hotel', [130, -78]],
    ]],
  ['bigscore', 'The Big Score', 'Lucia', 'CH.3',
    s('Hit the Solmar Bank vault, grab the cash, and vanish at the safehouse.', 'The whole force will come.'),
    800, 400,
    s('The bank, Rico.', 'Five minutes inside, then we vanish.', 'The whole force will come — so drive like your life depends on it.'),
    [
      ['goto', 'Reach the Solmar Bank', [26, -26]],
      ['hold', 'Crack the vault — hold position', [26, -26], {seconds: 5}],
      ['goto', 'Escape to the safehouse', [-130, -130]],
    ]],
  ['streetrace', 'Neon Nights Street Race', 'Mira', 'CH.3',
    s('Five checkpoints, one clock.', 'Beat the best time on the Neon circuit and take the pot.'),
    450, 300,
    s('Street race, midnight, five gates.', 'The pot is fat and the cops love a race.', 'Beat the clock and the money is yours.'),
    [
      ['race', 'Race the Neon circuit (0/5 gates)', null, {seconds: 100,
        checkpoints: [at([0, 104]), at([104, 104]), at([104, -104]), at([-104, -104]), at([-104, 104])]}],
    ]],
  ['ramraid', 'Ram the Courier', 'Nacho', 'CH.4',
    s('A courier is moving product across town in a white Comet.', 'Ram it until it stops — then take the cargo.'),
    400, 300,
    s('White Comet, north side, moving fast.', 'Put it in a wall, Rico.', 'Ram it till it stops — the cargo is worth the noise.'),
    [
      ['ram', 'Ram the courier car until it stops', [104, 52]],
    ]],
  ['loseheat', 'Lose the Heat', 'Kiki', 'CH.4',
    s('Three stars and a helicopter overhead.', 'Get to the beach hideout before the net closes.'),
    350, 250,
    s('Air One has you in the light, Rico.', 'Three stars is a net, not a chase.', 'Get to the beach hideout — fast, before it closes.'),
    [
      ['wanted', 'Draw the heat (3 stars)', null, {stars: 3}],
      ['timed', 'Reach the beach hideout', [-156, 156], {seconds: 45}],
    ]],
  ['shootout', 'Pier Shootout', 'Lucia', 'CH.5',
    s('The pier is crawling with cruisers.', 'Disable three police cars — however you like — and own the waterfront.'),
    500, 350,
    s('They took the pier, Rico. Take it back.', 'Three cruisers disabled and the waterfront is ours again.'),
    [
      ['eliminate', 'Disable police cars (0/3)', null, {count: 3}],
    ]],
  ['delivery', 'Midnight Delivery', 'Tía Rosa', 'CH.5',
    s('A package for the hotel, and the clock is the boss.', 'Pick it up at the plaza and deliver in time.'),
    400, 250,
    s('Mijo, the hotel waits for no one.', 'Plaza pickup, hotel drop, seventy seconds.', 'Drive like the package is your heart.'),
    [
      ['pickup', 'Pick up the package at the plaza', [0, 0]],
      ['timed', 'Deliver to the Hotel Palma', [130, -78], {seconds: 70}],
    ]],
  ['escort', "Lucia's Run", 'Lucia', 'CH.6',
    s('Lucia needs an escort to the pier — and the cops know it.', 'Pick her up, keep her safe, get her there in time.'),
    550, 400,
    s('I need wheels and a guardian, Rico.', 'Pick me up at the plaza, get me to the pier in ninety seconds — the cops know my name.'),
    [
      ['pickup', 'Pick up Lucia at the plaza', [0, 0]],
      ['timed', 'Escort Lucia to the Neon Pier', [0, 196], {seconds: 90, wantedOnStart: 2}],
    ]],
  ['goldrush', 'The Gold Rush', 'Lucia', 'CH.6',
    s('The final job: crack the bank, grab three gold caches across the city, and vanish at the pier.', 'Everything is on the line.'),
    1200, 600,
    s('This is the one, Rico.', 'Bank, three caches, pier.', 'The whole city will be watching — make it count.'),
    [
      ['goto', 'Reach the Solmar Bank', [26, -26]],
      ['hold', 'Crack the vault — hold position', [26, -26], {seconds: 5}],
      ['collect', 'Grab the gold caches (0/3)', [-130, 26], {count: 3,
        spots: [at([-130, 26]), at([78, -78]), at([130, 78])]}],
      ['goto', 'Vanish at the Neon Pier', [0, 196]],
    ]],
];
export const MISSIONS = JOB_ROWS.map(buildJob);

export const STORY_INTRO = s(
  'Solmar Bay — a sun-soaked city of neon, palms and fast money.',
  'You are Rico Vane, fresh out of the north, with $120 and a name to make.',
  'Lucia has work for you. Twelve jobs stand between you and the big score.');
