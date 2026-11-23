// Solmar Bay — a sun-soaked open-world crime game in the spirit of GTA 6.
// Every tuning number, colour and story beat in one place. Nothing here names,
// copies or borrows from any commercial game: the city, people and story are original.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';

// The city is a grid of blocks. Roads run at these coordinates on both axes;
// blocks sit between them. The beach and ocean lie south, past z = BEACH_Z.
export const CITY = {
  roads: [-156, -104, -52, 0, 52, 104, 156],
  roadWidth: 12,
  blockCentres: [-130, -78, -26, 26, 78, 130],
  blockSize: 40,
  half: 182,
  beachZ: 182,
  oceanZ: 210,
  pier: { x: 0, z: 196 },
  safehouse: { x: -130, z: -130 },
  hospital: { x: 130, z: -130 },
  bank: { x: 26, z: -26 },
  hideout: { x: -156, z: 156 },
  plaza: { x: 0, z: 0 },
  hotel: { x: 130, z: -78 },
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

export const TRAFFIC = { count: 12, speed: 9, parkedCount: 7 };
export const PEDS = { count: 26, walkSpeed: 1.6, fleeSpeed: 4.2 };
export const WANTED = {
  maxStars: 5,
  decayDelay: 25, // seconds without a crime before stars start falling
  decayInterval: 10, // seconds per star lost while clean
  policePerStar: 1,
  maxPolice: 5,
  bustDistance: 2.2,
  bustSeconds: 2.5,
};

export const COMBAT = { ammo: 12, reloadSeconds: 1.6, range: 60, damage: 34 };

// Seven weapon slots. The first two are Rico's from the start; the rest
// unlock as his respect rank grows (see RESPECT_RANKS) and come with ammo.
// Every slot is a real weapon: switching changes damage, fire rate and ammo.
export const WEAPONS = [
  { id: 'fists', name: 'FISTS', short: 'FISTS', damage: 0, cooldown: 0.5, mag: Infinity, unlockRp: 0 },
  { id: 'pistol', name: '.38 PISTOL', short: '.38', damage: 34, cooldown: 0.22, mag: 12, unlockRp: 0, startAmmo: 60 },
  { id: 'smg', name: 'SMG', short: 'SMG', damage: 16, cooldown: 0.09, mag: 30, unlockRp: 250, startAmmo: 90 },
  { id: 'shotgun', name: '12G PUMP', short: '12G', damage: 70, cooldown: 0.7, mag: 6, unlockRp: 600, startAmmo: 24 },
  { id: 'ar', name: 'AR-15', short: 'AR', damage: 28, cooldown: 0.12, mag: 30, unlockRp: 1200, startAmmo: 120 },
  { id: 'rpg', name: 'RPG-7', short: 'RPG', damage: 120, cooldown: 1.2, mag: 1, unlockRp: 2500, startAmmo: 5 },
  { id: 'sniper', name: 'LONGSHOT .50', short: '.50', damage: 150, cooldown: 1.0, mag: 5, unlockRp: 5000, startAmmo: 15 },
];

// Respect: RP is earned from jobs, takedowns and pickups. Ranks gate weapons.
export const RESPECT_RANKS = [
  { rp: 0, name: 'DRIVER' },
  { rp: 250, name: 'HUSTLER' },
  { rp: 600, name: 'FIXER' },
  { rp: 1200, name: 'SHOT CALLER' },
  { rp: 2500, name: 'KINGPIN' },
  { rp: 5000, name: 'LEGEND OF SOLMAR' },
];
export function rankFor(rp) {
  let rank = RESPECT_RANKS[0];
  let next = null;
  for (let i = 0; i < RESPECT_RANKS.length; i += 1) {
    if (rp >= RESPECT_RANKS[i].rp) rank = RESPECT_RANKS[i];
    else { next = RESPECT_RANKS[i]; break; }
  }
  return { rank, next };
}

// Radio: four original stations. The track line rotates every 45 s of play.
export const RADIO = [
  { name: 'OMBO 98.4', genre: 'Island Pop', tracks: ['Guava Sunrise — Vela Roja', 'Salt Air — Kip Sorrento', 'Tangerine Mile — The Palms'] },
  { name: 'RADIO MANGO 99.1', genre: 'Salsa & Cumbia', tracks: ['Arepa Lights — Kip Sorrento', 'Malecón Mirage — Vela Roja', 'Baila Solmar — Los Brisa'] },
  { name: 'CELESTE 98.1', genre: 'Chillwave', tracks: ['Neon Pier — Mira Kesang', 'Low Tide — Celeste', 'Golden Hour — DJ Palma'] },
  { name: 'BASSLINE 101.7', genre: 'Hip-Hop', tracks: ['Kingpin — Rico Vane', 'Fast Money — Nacho', 'Run the Block — Lil Tía'] },
];

// Districts: named by where the player stands. Standing is per-district
// heat the player builds by causing trouble there (0–100, shown in HUD).
export const DISTRICTS = [
  { name: 'NEON PIER', road: 'Pier Walk', x0: -30, z0: 182, x1: 30, z1: 230 },
  { name: 'KUMALA STRAND', road: 'Strand Boulevard', x0: -182, z0: 156, x1: 182, z1: 182 },
  { name: 'OLD TOWN', road: 'Calle Rosa', x0: -182, z0: -182, x1: -52, z1: 52 },
  { name: 'BRISA SOUND', road: 'Harbour Road', x0: 52, z0: -182, x1: 182, z1: 52 },
  { name: 'SOLTERRA STRAND', road: 'Tangerine Mile', x0: -52, z0: 52, x1: 182, z1: 156 },
  { name: 'PALMA HEIGHTS', road: 'Palm Court', x0: -52, z0: -182, x1: 52, z1: -52 },
  { name: 'CENTRAL PLAZA', road: 'Plaza Mayor', x0: -52, z0: -52, x1: 52, z1: 52 },
];
export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return d;
  }
  return DISTRICTS[6];
}

// Car names: every stealable car gets a name from its paint + index.
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

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// The crew: real abilities with cooldowns, bound to keys.
export const CREW = [
  { id: 'plates', name: 'SWAP PLATES', who: 'Mira · Driver', key: 'Z', cooldown: 60, desc: 'Lose 1 wanted star' },
  { id: 'fix', name: 'QUICK FIX', who: 'Lio · Mechanic', key: 'X', cooldown: 45, desc: 'Repair your car ($50)' },
  { id: 'eyes', name: 'EYES OUT', who: 'Kiki · Lookout', key: 'V', cooldown: 60, desc: 'Reveal the police search zone (10 s)' },
];

// The story: twelve missions, each a chain of steps. A step is a place to
// reach (goto), a thing to collect (collect), a wanted level to earn
// (wanted), a passenger to pick up and drop off (pickup / deliver), a timed
// hold (hold), a race through checkpoints against the clock (race), a car
// to smash until it stops (ram), police cars to disable (eliminate), or a
// place to reach before the clock runs out (timed).
export const MISSIONS = [
  {
    id: 'welcome', title: 'Welcome to Solmar', giver: 'Lucia', chapter: 'CH.1',
    brief: 'Lucia needs wheels. Steal a car and drive to the Neon Pier to meet her.',
    reward: 150, rp: 150,
    dialogue: ['Rico, welcome home. First rule of Solmar: wheels before words. Steal a car and meet me at the Neon Pier.'],
    steps: [
      { kind: 'goto', label: 'Steal a car (walk up to one, press E)', pos: null, anyCar: true },
      { kind: 'goto', label: 'Drive to the Neon Pier', pos: { x: 0, z: 196 } },
    ],
  },
  {
    id: 'packages', title: 'Package Run', giver: 'Lucia', chapter: 'CH.1',
    brief: 'Three packages are stashed around the city. Collect them all — and stay out of trouble.',
    reward: 250, rp: 150,
    dialogue: ['Three packages, three corners of the city. No noise, no heat. Bring them back and the money is yours.'],
    steps: [
      { kind: 'collect', label: 'Collect the packages (0/3)', pos: { x: -130, z: 26 }, count: 3,
        spots: [{ x: -130, z: 26 }, { x: 78, z: -78 }, { x: 130, z: 78 }] },
    ],
  },
  {
    id: 'getaway', title: 'Getaway Driver', giver: 'Mira', chapter: 'CH.2',
    brief: 'The cops are onto you. Earn heat, then lose them at the safehouse.',
    reward: 300, rp: 200,
    dialogue: ['You want to drive for us? Prove it. Get the cops on your tail — then shake them at the safehouse.'],
    steps: [
      { kind: 'wanted', label: 'Get the cops on you (2 stars)', stars: 2 },
      { kind: 'goto', label: 'Lose the heat at the safehouse', pos: { x: -130, z: -130 } },
    ],
  },
  {
    id: 'taxi', title: 'Taxi Hustle', giver: 'Lio', chapter: 'CH.2',
    brief: 'A fare is waiting at the plaza. Pick them up, drop them at the airport hotel.',
    reward: 200, rp: 150,
    dialogue: ['Easy money, Rico. A fare at the plaza, hotel on the north side. Drive like you own the road — because soon you will.'],
    steps: [
      { kind: 'pickup', label: 'Pick up the fare at the plaza', pos: { x: 0, z: 0 } },
      { kind: 'deliver', label: 'Drop the fare at the hotel', pos: { x: 130, z: -78 } },
    ],
  },
  {
    id: 'bigscore', title: 'The Big Score', giver: 'Lucia', chapter: 'CH.3',
    brief: 'Hit the Solmar Bank vault, grab the cash, and vanish at the safehouse. The whole force will come.',
    reward: 800, rp: 400,
    dialogue: ['The bank, Rico. Five minutes inside, then we vanish. The whole force will come — so drive like your life depends on it.'],
    steps: [
      { kind: 'goto', label: 'Reach the Solmar Bank', pos: { x: 26, z: -26 } },
      { kind: 'hold', label: 'Crack the vault — hold position', pos: { x: 26, z: -26 }, seconds: 5 },
      { kind: 'goto', label: 'Escape to the safehouse', pos: { x: -130, z: -130 } },
    ],
  },
  {
    id: 'streetrace', title: 'Neon Nights Street Race', giver: 'Mira', chapter: 'CH.3',
    brief: 'Five checkpoints, one clock. Beat the best time on the Neon circuit and take the pot.',
    reward: 450, rp: 300,
    dialogue: ['Street race, midnight, five gates. The pot is fat and the cops love a race. Beat the clock and the money is yours.'],
    steps: [
      { kind: 'race', label: 'Race the Neon circuit (0/5 gates)', seconds: 100,
        checkpoints: [{ x: 0, z: 104 }, { x: 104, z: 104 }, { x: 104, z: -104 }, { x: -104, z: -104 }, { x: -104, z: 104 }] },
    ],
  },
  {
    id: 'ramraid', title: 'Ram the Courier', giver: 'Nacho', chapter: 'CH.4',
    brief: 'A courier is moving product across town in a white Comet. Ram it until it stops — then take the cargo.',
    reward: 400, rp: 300,
    dialogue: ['White Comet, north side, moving fast. Put it in a wall, Rico. Ram it till it stops — the cargo is worth the noise.'],
    steps: [
      { kind: 'ram', label: 'Ram the courier car until it stops', pos: { x: 104, z: 52 } },
    ],
  },
  {
    id: 'loseheat', title: 'Lose the Heat', giver: 'Kiki', chapter: 'CH.4',
    brief: 'Three stars and a helicopter overhead. Get to the beach hideout before the net closes.',
    reward: 350, rp: 250,
    dialogue: ['Air One has you in the light, Rico. Three stars is a net, not a chase. Get to the beach hideout — fast, before it closes.'],
    steps: [
      { kind: 'wanted', label: 'Draw the heat (3 stars)', stars: 3 },
      { kind: 'timed', label: 'Reach the beach hideout', pos: { x: -156, z: 156 }, seconds: 45 },
    ],
  },
  {
    id: 'shootout', title: 'Pier Shootout', giver: 'Lucia', chapter: 'CH.5',
    brief: 'The pier is crawling with cruisers. Disable three police cars — however you like — and own the waterfront.',
    reward: 500, rp: 350,
    dialogue: ['They took the pier, Rico. Take it back. Three cruisers disabled and the waterfront is ours again.'],
    steps: [
      { kind: 'eliminate', label: 'Disable police cars (0/3)', count: 3 },
    ],
  },
  {
    id: 'delivery', title: 'Midnight Delivery', giver: 'Tía Rosa', chapter: 'CH.5',
    brief: 'A package for the hotel, and the clock is the boss. Pick it up at the plaza and deliver in time.',
    reward: 400, rp: 250,
    dialogue: ['Mijo, the hotel waits for no one. Plaza pickup, hotel drop, seventy seconds. Drive like the package is your heart.'],
    steps: [
      { kind: 'pickup', label: 'Pick up the package at the plaza', pos: { x: 0, z: 0 } },
      { kind: 'timed', label: 'Deliver to the Hotel Palma', pos: { x: 130, z: -78 }, seconds: 70 },
    ],
  },
  {
    id: 'escort', title: "Lucia's Run", giver: 'Lucia', chapter: 'CH.6',
    brief: 'Lucia needs an escort to the pier — and the cops know it. Pick her up, keep her safe, get her there in time.',
    reward: 550, rp: 400,
    dialogue: ['I need wheels and a guardian, Rico. Pick me up at the plaza, get me to the pier in ninety seconds — the cops know my name.'],
    steps: [
      { kind: 'pickup', label: 'Pick up Lucia at the plaza', pos: { x: 0, z: 0 } },
      { kind: 'timed', label: 'Escort Lucia to the Neon Pier', pos: { x: 0, z: 196 }, seconds: 90, wantedOnStart: 2 },
    ],
  },
  {
    id: 'goldrush', title: 'The Gold Rush', giver: 'Lucia', chapter: 'CH.6',
    brief: 'The final job: crack the bank, grab three gold caches across the city, and vanish at the pier. Everything is on the line.',
    reward: 1200, rp: 600,
    dialogue: ['This is the one, Rico. Bank, three caches, pier. The whole city will be watching — make it count.'],
    steps: [
      { kind: 'goto', label: 'Reach the Solmar Bank', pos: { x: 26, z: -26 } },
      { kind: 'hold', label: 'Crack the vault — hold position', pos: { x: 26, z: -26 }, seconds: 5 },
      { kind: 'collect', label: 'Grab the gold caches (0/3)', pos: { x: -130, z: 26 }, count: 3,
        spots: [{ x: -130, z: 26 }, { x: 78, z: -78 }, { x: 130, z: 78 }] },
      { kind: 'goto', label: 'Vanish at the Neon Pier', pos: { x: 0, z: 196 } },
    ],
  },
];

export const STORY_INTRO =
  'Solmar Bay — a sun-soaked city of neon, palms and fast money. You are Rico Vane, fresh out of the north, with $120 and a name to make. Lucia has work for you. Twelve jobs stand between you and the big score.';
