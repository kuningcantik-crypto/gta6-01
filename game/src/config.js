// Solmar Bay tuning, all in one place. Every number that shapes the city,
// the cars, the fights and the story lives here; the rest of the game only
// reads values from this module and never hard-codes a tuning number.
// The city, the people and the story are all original — nothing here names,
// copies or borrows from any commercial game.
export const STEP = 1/60;
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';

// The city is a grid. Roads run along these lines on both axes; blocks sit
// between them. The beach and the ocean lie south, past the last road.
const ROAD_LINES = [-156,-104,-52,0,52,104,156];
const BLOCK_MIDS = [-130,-78,-26,26,78,130];
export const CITY = {
  roads: ROAD_LINES,
  roadWidth: 12,
  blockCentres: BLOCK_MIDS,
  blockSize: 40,
  half: 182,
  beachZ: 182,
  oceanZ: 210,
  pier: {x: 0, z: 196},
  safehouse: {x: -130, z: -130},
  hospital: {x: 130, z: -130},
  bank: {x: 26, z: -26},
  hideout: {x: -156, z: 156},
  plaza: {x: 0, z: 0},
  hotel: {x: 130, z: -78},
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  jumpSpeed: 8,
  gravity: 22,
  radius: 0.6,
  maxHealth: 100,
  startCash: 120,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 30,
  maxReverse: 11,
  steer: 1.9,
  grip: 8,
  radius: 1.6,
};

export const TRAFFIC = {count: 12, speed: 9, parkedCount: 7};
export const PEDS = {count: 26, walkSpeed: 1.6, fleeSpeed: 4.2};
export const WANTED = {
  maxStars: 5,
  decayDelay: 25,
  decayInterval: 10,
  policePerStar: 1,
  maxPolice: 5,
  bustDistance: 2.2,
  bustSeconds: 2.5,
};

export const COMBAT = {ammo: 12, reloadSeconds: 1.6, range: 60, damage: 34};

// Seven weapon slots. The first two are Rico's from the start; the rest
// unlock as his respect rank grows and arrive with reserve ammo. Switching
// changes damage, fire rate and magazine size — every slot is a real weapon.
const WEAPON_ROWS = [
  ['fists', 'FISTS', 'FISTS', 0, 0.5, Infinity, 0, 0],
  ['pistol', '.38 PISTOL', '.38', 34, 0.22, 12, 0, 60],
  ['smg', 'SMG', 'SMG', 16, 0.09, 30, 250, 90],
  ['shotgun', '12G PUMP', '12G', 70, 0.7, 6, 600, 24],
  ['ar', 'AR-15', 'AR', 28, 0.12, 30, 1200, 120],
  ['rpg', 'RPG-7', 'RPG', 120, 1.2, 1, 2500, 5],
  ['sniper', 'LONGSHOT .50', '.50', 150, 1.0, 5, 5000, 15],
];
export const WEAPONS = WEAPON_ROWS.map((row) => ({
  id: row[0], name: row[1], short: row[2], damage: row[3],
  cooldown: row[4], mag: row[5], unlockRp: row[6], startAmmo: row[7],
}));

// Respect: RP comes from jobs, takedowns and pickups. Ranks gate weapons.
const RANK_ROWS = [
  [0, 'DRIVER'],
  [250, 'HUSTLER'],
  [600, 'FIXER'],
  [1200, 'SHOT CALLER'],
  [2500, 'KINGPIN'],
  [5000, 'LEGEND OF SOLMAR'],
];
export const RESPECT_RANKS = RANK_ROWS.map(([rp, name]) => ({rp, name}));
export function rankFor(rp) {
  let current = RESPECT_RANKS[0];
  let nextOne = null;
  for (const entry of RESPECT_RANKS) {
    if (rp < entry.rp) {
      nextOne = entry;
      break;
    }
    current = entry;
  }
  return {rank: current, next: nextOne};
}

// Radio: four original stations. The track line turns over every 45 s.
const STATION_ROWS = [
  ['OMBO 98.4', 'Island Pop', ['Guava Sunrise — Vela Roja', 'Salt Air — Kip Sorrento', 'Tangerine Mile — The Palms']],
  ['RADIO MANGO 99.1', 'Salsa & Cumbia', ['Arepa Lights — Kip Sorrento', 'Malecón Mirage — Vela Roja', 'Baila Solmar — Los Brisa']],
  ['CELESTE 98.1', 'Chillwave', ['Neon Pier — Mira Kesang', 'Low Tide — Celeste', 'Golden Hour — DJ Palma']],
  ['BASSLINE 101.7', 'Hip-Hop', ['Kingpin — Rico Vane', 'Fast Money — Nacho', 'Run the Block — Lil Tía']],
];
export const RADIO = STATION_ROWS.map(([name, genre, tracks]) => ({name, genre, tracks}));

// Districts, named by where the player stands. Heat is per-district trouble
// Rico builds up (0–100, shown in the HUD).
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
  for (const zone of DISTRICTS) {
    if (x >= zone.x0 && x <= zone.x1 && z >= zone.z0 && z <= zone.z1) return zone;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

// Every stealable car gets a name from its paint and index.
export const CAR_NAMES = [
  'RUKAN PELO GT', 'VELOZ COMET RS', 'CALYX SPRINT GT', 'VIREO GT',
  'TARO CRUISER', 'BRISA COUPE', 'MANGO ROADSTER', 'PALMA SEDAN',
];

export const PALETTE = {
  skyTop: 0x1e3a6e,
  skyHorizon: 0xff9e5e,
  sun: 0xffd9a0,
  road: 0x23272e,
  roadLine: 0xf5d76e,
  sidewalk: 0x8f959e,
  sand: 0xe8cf9a,
  ocean: 0x14586e,
  grass: 0x5da24a,
  building: [0xe8b48a, 0xd98a7a, 0x8ab4d9, 0xf2e3c6, 0xb08ad9, 0x7ac9a8, 0xe8e0d0, 0xc96a6a],
  car: [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x222222, 0x8a5fd9, 0xff7a2b],
  police: 0x1c2b4a,
  taxi: 0xf2c230,
};

export const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

// The crew: real abilities with cooldowns, bound to keys.
const CREW_ROWS = [
  ['plates', 'SWAP PLATES', 'Mira · Driver', 'Z', 60, 'Lose 1 wanted star'],
  ['fix', 'QUICK FIX', 'Lio · Mechanic', 'X', 45, 'Repair your car ($50)'],
  ['eyes', 'EYES OUT', 'Kiki · Lookout', 'V', 60, 'Reveal the police search zone (10 s)'],
];
export const CREW = CREW_ROWS.map(([id, name, who, key, cooldown, desc]) => ({id, name, who, key, cooldown, desc}));

// The story: twelve jobs for Rico Vane, each a chain of steps. A step is a
// place to reach (goto), a thing to collect (collect), a wanted level to earn
// (wanted), a passenger to pick up and drop off (pickup / deliver), a timed
// hold (hold), a race through gates against the clock (race), a car to smash
// until it stops (ram), police cars to disable (eliminate), or a place to
// reach before the clock runs out (timed).
function mission(id, title, giver, chapter, brief, reward, rp, line, steps) {
  return {id, title, giver, chapter, brief, reward, rp, dialogue: [line], steps};
}
export const MISSIONS = [
  mission('welcome', 'Welcome to Solmar', 'Lucia', 'CH.1',
    'Lucia needs wheels. Steal a car and drive to the Neon Pier to meet her.',
    150, 150,
    'Rico, welcome home. First rule of Solmar: wheels before words. Steal a car and meet me at the Neon Pier.',
    [
      {kind: 'goto', label: 'Steal a car (walk up to one, press E)', pos: null, anyCar: true},
      {kind: 'goto', label: 'Drive to the Neon Pier', pos: {x: 0, z: 196}},
    ]),
  mission('packages', 'Package Run', 'Lucia', 'CH.1',
    'Three packages are stashed around the city. Collect them all — and stay out of trouble.',
    250, 150,
    'Three packages, three corners of the city. No noise, no heat. Bring them back and the money is yours.',
    [
      {kind: 'collect', label: 'Collect the packages (0/3)', pos: {x: -130, z: 26}, count: 3,
        spots: [{x: -130, z: 26}, {x: 78, z: -78}, {x: 130, z: 78}]},
    ]),
  mission('getaway', 'Getaway Driver', 'Mira', 'CH.2',
    'The cops are onto you. Earn heat, then lose them at the safehouse.',
    300, 200,
    'You want to drive for us? Prove it. Get the cops on your tail — then shake them at the safehouse.',
    [
      {kind: 'wanted', label: 'Get the cops on you (2 stars)', stars: 2},
      {kind: 'goto', label: 'Lose the heat at the safehouse', pos: {x: -130, z: -130}},
    ]),
  mission('taxi', 'Taxi Hustle', 'Lio', 'CH.2',
    'A fare is waiting at the plaza. Pick them up, drop them at the airport hotel.',
    200, 150,
    'Easy money, Rico. A fare at the plaza, hotel on the north side. Drive like you own the road — because soon you will.',
    [
      {kind: 'pickup', label: 'Pick up the fare at the plaza', pos: {x: 0, z: 0}},
      {kind: 'deliver', label: 'Drop the fare at the hotel', pos: {x: 130, z: -78}},
    ]),
  mission('bigscore', 'The Big Score', 'Lucia', 'CH.3',
    'Hit the Solmar Bank vault, grab the cash, and vanish at the safehouse. The whole force will come.',
    800, 400,
    'The bank, Rico. Five minutes inside, then we vanish. The whole force will come — so drive like your life depends on it.',
    [
      {kind: 'goto', label: 'Reach the Solmar Bank', pos: {x: 26, z: -26}},
      {kind: 'hold', label: 'Crack the vault — hold position', pos: {x: 26, z: -26}, seconds: 5},
      {kind: 'goto', label: 'Escape to the safehouse', pos: {x: -130, z: -130}},
    ]),
  mission('streetrace', 'Neon Nights Street Race', 'Mira', 'CH.3',
    'Five checkpoints, one clock. Beat the best time on the Neon circuit and take the pot.',
    450, 300,
    'Street race, midnight, five gates. The pot is fat and the cops love a race. Beat the clock and the money is yours.',
    [
      {kind: 'race', label: 'Race the Neon circuit (0/5 gates)', seconds: 100,
        checkpoints: [{x: 0, z: 104}, {x: 104, z: 104}, {x: 104, z: -104}, {x: -104, z: -104}, {x: -104, z: 104}]},
    ]),
  mission('ramraid', 'Ram the Courier', 'Nacho', 'CH.4',
    'A courier is moving product across town in a white Comet. Ram it until it stops — then take the cargo.',
    400, 300,
    'White Comet, north side, moving fast. Put it in a wall, Rico. Ram it till it stops — the cargo is worth the noise.',
    [
      {kind: 'ram', label: 'Ram the courier car until it stops', pos: {x: 104, z: 52}},
    ]),
  mission('loseheat', 'Lose the Heat', 'Kiki', 'CH.4',
    'Three stars and a helicopter overhead. Get to the beach hideout before the net closes.',
    350, 250,
    'Air One has you in the light, Rico. Three stars is a net, not a chase. Get to the beach hideout — fast, before it closes.',
    [
      {kind: 'wanted', label: 'Draw the heat (3 stars)', stars: 3},
      {kind: 'timed', label: 'Reach the beach hideout', pos: {x: -156, z: 156}, seconds: 45},
    ]),
  mission('shootout', 'Pier Shootout', 'Lucia', 'CH.5',
    'The pier is crawling with cruisers. Disable three police cars — however you like — and own the waterfront.',
    500, 350,
    'They took the pier, Rico. Take it back. Three cruisers disabled and the waterfront is ours again.',
    [
      {kind: 'eliminate', label: 'Disable police cars (0/3)', count: 3},
    ]),
  mission('delivery', 'Midnight Delivery', 'Tía Rosa', 'CH.5',
    'A package for the hotel, and the clock is the boss. Pick it up at the plaza and deliver in time.',
    400, 250,
    'Mijo, the hotel waits for no one. Plaza pickup, hotel drop, seventy seconds. Drive like the package is your heart.',
    [
      {kind: 'pickup', label: 'Pick up the package at the plaza', pos: {x: 0, z: 0}},
      {kind: 'timed', label: 'Deliver to the Hotel Palma', pos: {x: 130, z: -78}, seconds: 70},
    ]),
  mission('escort', "Lucia's Run", 'Lucia', 'CH.6',
    'Lucia needs an escort to the pier — and the cops know it. Pick her up, keep her safe, get her there in time.',
    550, 400,
    'I need wheels and a guardian, Rico. Pick me up at the plaza, get me to the pier in ninety seconds — the cops know my name.',
    [
      {kind: 'pickup', label: 'Pick up Lucia at the plaza', pos: {x: 0, z: 0}},
      {kind: 'timed', label: 'Escort Lucia to the Neon Pier', pos: {x: 0, z: 196}, seconds: 90, wantedOnStart: 2},
    ]),
  mission('goldrush', 'The Gold Rush', 'Lucia', 'CH.6',
    'The final job: crack the bank, grab three gold caches across the city, and vanish at the pier. Everything is on the line.',
    1200, 600,
    'This is the one, Rico. Bank, three caches, pier. The whole city will be watching — make it count.',
    [
      {kind: 'goto', label: 'Reach the Solmar Bank', pos: {x: 26, z: -26}},
      {kind: 'hold', label: 'Crack the vault — hold position', pos: {x: 26, z: -26}, seconds: 5},
      {kind: 'collect', label: 'Grab the gold caches (0/3)', pos: {x: -130, z: 26}, count: 3,
        spots: [{x: -130, z: 26}, {x: 78, z: -78}, {x: 130, z: 78}]},
      {kind: 'goto', label: 'Vanish at the Neon Pier', pos: {x: 0, z: 196}},
    ]),
];

export const STORY_INTRO =
  'Solmar Bay — a sun-soaked city of neon, palms and fast money. You are Rico Vane, fresh out of the north, with $120 and a name to make. ' +
  'Lucia has work for you. Twelve jobs stand between you and the big score.';
