// Solmar Bay tuning, all in one place. Every number that shapes the
// city, the cars, the fights and the story lives in this file; the rest
// of the game only ever reads values from here and never hard-codes a
// tuning number of its own. The city, the people and the story are all
// original — nothing here names, copies or borrows from any commercial game.
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';

// The city is a grid. Roads run along these lines on both axes; blocks
// sit between them. The beach and the ocean lie south, past the last road.
export const CITY = {
  roads: [-156, -104, -52, 0, 52, 104, 156],
  roadWidth: 12,
  blockCentres: [-130, -78, -26, 26, 78, 130],
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
// unlock as his respect rank grows and arrive with reserve ammo.
// Switching changes damage, fire rate and magazine size — every slot is
// a real weapon.
export const WEAPONS = [
  {id: 'fists', name: 'FISTS', short: 'FISTS', damage: 0, cooldown: 0.5, mag: Infinity, unlockRp: 0, startAmmo: 0},
  {id: 'pistol', name: '.38 PISTOL', short: '.38', damage: 34, cooldown: 0.22, mag: 12, unlockRp: 0, startAmmo: 60},
  {id: 'smg', name: 'SMG', short: 'SMG', damage: 16, cooldown: 0.09, mag: 30, unlockRp: 250, startAmmo: 90},
  {id: 'shotgun', name: '12G PUMP', short: '12G', damage: 70, cooldown: 0.7, mag: 6, unlockRp: 600, startAmmo: 24},
  {id: 'ar', name: 'AR-15', short: 'AR', damage: 28, cooldown: 0.12, mag: 30, unlockRp: 1200, startAmmo: 120},
  {id: 'rpg', name: 'RPG-7', short: 'RPG', damage: 120, cooldown: 1.2, mag: 1, unlockRp: 2500, startAmmo: 5},
  {id: 'sniper', name: 'LONGSHOT .50', short: '.50', damage: 150, cooldown: 1.0, mag: 5, unlockRp: 5000, startAmmo: 15},
];

// Respect: RP comes from jobs, takedowns and pickups. Ranks gate weapons.
export const RESPECT_RANKS = [
  {rp: 0, name: 'DRIVER'},
  {rp: 250, name: 'HUSTLER'},
  {rp: 600, name: 'FIXER'},
  {rp: 1200, name: 'SHOT CALLER'},
  {rp: 2500, name: 'KINGPIN'},
  {rp: 5000, name: 'LEGEND OF SOLMAR'},
];
export function rankFor(rp) {
  let current = RESPECT_RANKS[0];
  let nextOne = null;
  let i = 0;
  while (i < RESPECT_RANKS.length) {
    const entry = RESPECT_RANKS[i];
    if (rp < entry.rp) {
      nextOne = entry;
      break;
    }
    current = entry;
    i += 1;
  }
  return {rank: current, next: nextOne};
}

// Radio: five original stations. The track line turns over every 45 s.
// Each station carries a DJ and a couple of spoken lines: switching
// station drops a line from the DJ into the dialogue box, like a real
// radio handover.
export const RADIO = [
  {
    name: 'OMBO 98.4', genre: 'Island Pop',
    tracks: ['Guava Sunrise — Vela Roja', 'Salt Air — Kip Sorrento', 'Tangerine Mile — The Palms'],
    dj: 'DJ Palma',
    lines: [
      'Good evening, Solmar — this is Palma, and the tide is high.',
      'Palma here. The sunset is doing half my job tonight.',
    ],
  },
  {
    name: 'RADIO MANGO 99.1', genre: 'Salsa & Cumbia',
    tracks: ['Arepa Lights — Kip Sorrento', 'Malecón Mirage — Vela Roja', 'Baila Solmar — Los Brisa'],
    dj: 'DJ Mango',
    lines: [
      '¡Buenas noches! Mango here — turn it up, the night is young.',
      'Mango on the mic. If your hips are not moving, check your pulse.',
    ],
  },
  {
    name: 'CELESTE 98.1', genre: 'Chillwave',
    tracks: ['Neon Pier — Mira Kesang', 'Low Tide — Celeste', 'Golden Hour — DJ Palma'],
    dj: 'Celeste',
    lines: [
      "You're listening to Celeste. Breathe in, Solmar. Breathe out.",
      'Celeste here — low tide, low lights, low worries.',
    ],
  },
  {
    name: 'BASSLINE 101.7', genre: 'Hip-Hop',
    tracks: ['Kingpin — Rico Vane', 'Fast Money — Nacho', 'Run the Block — Lil Tía'],
    dj: 'DJ Nacho',
    lines: [
      'Bassline 101.7 — Nacho on the decks. Run the block, Rico.',
      'Nacho here. That last track was for everyone with a warrant.',
    ],
  },
  {
    name: 'TIDE FM 97.3', genre: 'Surf Rock & Indie',
    tracks: ['Boardwalk Static — The Breakers', 'Saltwater Static — Kip Sorrento', 'Pier Lights — Mira Kesang'],
    dj: 'DJ Waverly',
    lines: [
      'Tide FM — Waverly here, riding the static off the bay.',
      'Waverly on the mic. If the surf is up, the volume goes up too.',
    ],
  },
];

// Districts, named by where the player stands. Heat is per-district
// trouble Rico builds up (0–100, shown in the HUD).
export const DISTRICTS = [
  {name: 'NEON PIER', road: 'Pier Walk', x0: -30, z0: 182, x1: 30, z1: 230},
  {name: 'KUMALA STRAND', road: 'Strand Boulevard', x0: -182, z0: 156, x1: 182, z1: 182},
  {name: 'OLD TOWN', road: 'Calle Rosa', x0: -182, z0: -182, x1: -52, z1: 52},
  {name: 'BRISA SOUND', road: 'Harbour Road', x0: 52, z0: -182, x1: 182, z1: 52},
  {name: 'SOLTERRA STRAND', road: 'Tangerine Mile', x0: -52, z0: 52, x1: 182, z1: 156},
  {name: 'PALMA HEIGHTS', road: 'Palm Court', x0: -52, z0: -182, x1: 52, z1: -52},
  {name: 'CENTRAL PLAZA', road: 'Plaza Mayor', x0: -52, z0: -52, x1: 52, z1: 52},
];
export function districtAt(x, z) {
  const zone = DISTRICTS.find((d) => x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1);
  return zone || DISTRICTS[DISTRICTS.length - 1];
}

// The heat word the HUD shows for a district's trouble level.
export function heatLabel(heat) {
  if (heat < 30) return 'NEUTRAL';
  if (heat < 60) return 'WARM';
  return 'HOT';
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
export const CREW = [
  {id: 'plates', name: 'SWAP PLATES', who: 'Mira · Driver', key: 'Z', cooldown: 60, desc: 'Lose 1 wanted star'},
  {id: 'fix', name: 'QUICK FIX', who: 'Lio · Mechanic', key: 'X', cooldown: 45, desc: 'Repair your car ($50)'},
  {id: 'eyes', name: 'EYES OUT', who: 'Kiki · Lookout', key: 'V', cooldown: 60, desc: 'Reveal the police search zone (10 s)'},
];

// A job is a title, a giver, a chapter, a brief, a payout in cash and
// respect, one opening line, and a chain of steps. A step is a place to
// reach (goto), a thing to collect (collect), a wanted level to earn
// (wanted), a passenger to pick up and drop off (pickup / deliver), a
// timed hold (hold), a race through gates against the clock (race), a
// car to smash until it stops (ram), police cars to disable (eliminate),
// or a place to reach before the clock runs out (timed).
function job(id, title, giver, chapter, brief, reward, rp, line, steps) {
  return {id, title, giver, chapter, brief, reward, rp, dialogue: [line], steps};
}
// Steps as compact calls: move(kind, label, place, extra) expands into
// the step object the mission machine reads. place is a coordinate pair,
// or null for steps with no place on the map (anyCar, wanted, eliminate).
function at(x, z) { return {x, z}; }
function move(kind, label, place, extra = {}) {
  const built = {kind, label};
  for (const key of Object.keys(extra)) built[key] = extra[key];
  if (place) built.pos = place;
  return built;
}
export const MISSIONS = [
  job('welcome', 'Welcome to Solmar', 'Lucia', 'CH.1',
    'Lucia needs wheels. Steal a car and drive to the Neon Pier to meet her.',
    150, 150,
    'Rico, welcome home. First rule of Solmar: wheels before words. Steal a car and meet me at the Neon Pier.',
    [
      move('goto', 'Steal a car (walk up to one, press E)', null, {anyCar: true}),
      move('goto', 'Drive to the Neon Pier', at(0, 196)),
    ]),
  job('packages', 'Package Run', 'Lucia', 'CH.1',
    'Three packages are stashed around the city. Collect them all — and stay out of trouble.',
    250, 150,
    'Three packages, three corners of the city. No noise, no heat. Bring them back and the money is yours.',
    [
      move('collect', 'Collect the packages (0/3)', at(-130, 26), {count: 3,
        spots: [at(-130, 26), at(78, -78), at(130, 78)]}),
    ]),
  job('getaway', 'Getaway Driver', 'Mira', 'CH.2',
    'The cops are onto you. Earn heat, then lose them at the safehouse.',
    300, 200,
    'You want to drive for us? Prove it. Get the cops on your tail — then shake them at the safehouse.',
    [
      move('wanted', 'Get the cops on you (2 stars)', null, {stars: 2}),
      move('goto', 'Lose the heat at the safehouse', at(-130, -130)),
    ]),
  job('taxi', 'Taxi Hustle', 'Lio', 'CH.2',
    'A fare is waiting at the plaza. Pick them up, drop them at the airport hotel.',
    200, 150,
    'Easy money, Rico. A fare at the plaza, hotel on the north side. Drive like you own the road — because soon you will.',
    [
      move('pickup', 'Pick up the fare at the plaza', at(0, 0)),
      move('deliver', 'Drop the fare at the hotel', at(130, -78)),
    ]),
  job('bigscore', 'The Big Score', 'Lucia', 'CH.3',
    'Hit the Solmar Bank vault, grab the cash, and vanish at the safehouse. The whole force will come.',
    800, 400,
    'The bank, Rico. Five minutes inside, then we vanish. The whole force will come — so drive like your life depends on it.',
    [
      move('goto', 'Reach the Solmar Bank', at(26, -26)),
      move('hold', 'Crack the vault — hold position', at(26, -26), {seconds: 5}),
      move('goto', 'Escape to the safehouse', at(-130, -130)),
    ]),
  job('streetrace', 'Neon Nights Street Race', 'Mira', 'CH.3',
    'Five checkpoints, one clock. Beat the best time on the Neon circuit and take the pot.',
    450, 300,
    'Street race, midnight, five gates. The pot is fat and the cops love a race. Beat the clock and the money is yours.',
    [
      move('race', 'Race the Neon circuit (0/5 gates)', null, {seconds: 100,
        checkpoints: [at(0, 104), at(104, 104), at(104, -104), at(-104, -104), at(-104, 104)]}),
    ]),
  job('ramraid', 'Ram the Courier', 'Nacho', 'CH.4',
    'A courier is moving product across town in a white Comet. Ram it until it stops — then take the cargo.',
    400, 300,
    'White Comet, north side, moving fast. Put it in a wall, Rico. Ram it till it stops — the cargo is worth the noise.',
    [
      move('ram', 'Ram the courier car until it stops', at(104, 52)),
    ]),
  job('loseheat', 'Lose the Heat', 'Kiki', 'CH.4',
    'Three stars and a helicopter overhead. Get to the beach hideout before the net closes.',
    350, 250,
    'Air One has you in the light, Rico. Three stars is a net, not a chase. Get to the beach hideout — fast, before it closes.',
    [
      move('wanted', 'Draw the heat (3 stars)', null, {stars: 3}),
      move('timed', 'Reach the beach hideout', at(-156, 156), {seconds: 45}),
    ]),
  job('shootout', 'Pier Shootout', 'Lucia', 'CH.5',
    'The pier is crawling with cruisers. Disable three police cars — however you like — and own the waterfront.',
    500, 350,
    'They took the pier, Rico. Take it back. Three cruisers disabled and the waterfront is ours again.',
    [
      move('eliminate', 'Disable police cars (0/3)', null, {count: 3}),
    ]),
  job('delivery', 'Midnight Delivery', 'Tía Rosa', 'CH.5',
    'A package for the hotel, and the clock is the boss. Pick it up at the plaza and deliver in time.',
    400, 250,
    'Mijo, the hotel waits for no one. Plaza pickup, hotel drop, seventy seconds. Drive like the package is your heart.',
    [
      move('pickup', 'Pick up the package at the plaza', at(0, 0)),
      move('timed', 'Deliver to the Hotel Palma', at(130, -78), {seconds: 70}),
    ]),
  job('escort', "Lucia's Run", 'Lucia', 'CH.6',
    'Lucia needs an escort to the pier — and the cops know it. Pick her up, keep her safe, get her there in time.',
    550, 400,
    'I need wheels and a guardian, Rico. Pick me up at the plaza, get me to the pier in ninety seconds — the cops know my name.',
    [
      move('pickup', 'Pick up Lucia at the plaza', at(0, 0)),
      move('timed', 'Escort Lucia to the Neon Pier', at(0, 196), {seconds: 90, wantedOnStart: 2}),
    ]),
  job('goldrush', 'The Gold Rush', 'Lucia', 'CH.6',
    'The final job: crack the bank, grab three gold caches across the city, and vanish at the pier. Everything is on the line.',
    1200, 600,
    'This is the one, Rico. Bank, three caches, pier. The whole city will be watching — make it count.',
    [
      move('goto', 'Reach the Solmar Bank', at(26, -26)),
      move('hold', 'Crack the vault — hold position', at(26, -26), {seconds: 5}),
      move('collect', 'Grab the gold caches (0/3)', at(-130, 26), {count: 3,
        spots: [at(-130, 26), at(78, -78), at(130, 78)]}),
      move('goto', 'Vanish at the Neon Pier', at(0, 196)),
    ]),
];

export const STORY_INTRO =
  'Solmar Bay — a sun-soaked city of neon, palms and fast money. You are Rico Vane, fresh out of the north, with $120 and a name to make. ' +
  'Lucia has work for you. Twelve jobs stand between you and the big score.';
