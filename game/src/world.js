// The world: everything that happens in Solmar Bay — driving, walking,
// traffic, pedestrians, police, wanted levels, combat, missions, pickups,
// radio, respect, crew abilities, the police helicopter, roadblocks and
// saving. The renderer only paints this state; it never decides it.
import { BEST_KEY, CAR, CAR_NAMES, CITY, COMBAT, CREW, MISSIONS, PEDS, PLAYER, RADIO, TRAFFIC, WANTED, WEAPONS, districtAt } from './config.js';
import { createRandom } from './random.js';
import { makeCar, placeTrafficCar, stepPlayerCar, stepPoliceCar, stepTrafficCar } from './vehicles.js';
import { knockPedDown, makePed, stepPed } from './pedestrians.js';
import { stepPlayerOnFoot } from './player.js';
import { advanceMission, currentMission, currentStep, sayLine, startStep, stepTarget } from './missions.js';

function hitsBlock(x, z, r, blocks) {
  for (const c of blocks) {
    const cx = Math.max(c.x0, Math.min(x, c.x1));
    const cz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// Named police units, handed out in spawn order so the dispatch panel can
// show real callsigns, distances and tactics.
const UNIT_NAMES = ['KITE-1', 'CORAL-48', 'BARRACUDA-18', 'GULL-8', 'BULWARK-2', 'TIDE-7'];
export function unitName(car) {
  if (car.roadblock) return `BULWARK-${car.unitNo || 2}`;
  return UNIT_NAMES[(car.unitNo || 0) % UNIT_NAMES.length];
}

function newPlayer() {
  return {
    x: 0, z: 30, y: 0, vy: 0, angle: Math.PI,
    health: PLAYER.maxHealth, cash: PLAYER.startCash,
    wanted: 0, crimeTimer: 99, decayTimer: 0,
    onFoot: true, car: null, ammo: COMBAT.ammo,
    reloadTimer: 0, shootTimer: 0, punchTimer: 0,
    bustedTimer: 0, moving: false, running: false, walkPhase: 0,
    rp: 0, radioStation: 0,
    weapons: WEAPONS.map((w) => ({
      ...w, owned: w.unlockRp === 0, ammo: w.startAmmo || 0,
      mag: w.id === 'fists' ? Infinity : w.mag,
    })),
    weaponIndex: 1,
    garage: {tune: 0, armor: 0},
    crew: {plates: 0, fix: 0, eyes: 0},
    eyesTimer: 0,
  };
}

const PARKED_COLORS = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x8a5fd9, 0xff7a2b];
const TRAFFIC_COLORS = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x222222, 0x8a5fd9];

// Parked cars along the roads, ready to steal.
function spawnParkedCars(state, rng) {
  const spots = [
    [-44, -100], [60, 60], [8, -52], [-96, 20], [112, -20], [-8, 130], [44, -130],
  ];
  spots.forEach(([x, z], i) => {
    const car = makeCar('parked', PARKED_COLORS[i % PARKED_COLORS.length], x, z, rng.next() * Math.PI * 2, rng);
    car.id = `parked-${state.cars.length}`;
    car.name = CAR_NAMES[i % CAR_NAMES.length];
    car.condition = 100;
    state.cars.push(car);
  });
}

function spawnTraffic(state, rng) {
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const car = makeCar('traffic', TRAFFIC_COLORS[i % TRAFFIC_COLORS.length], 0, 0, 0, rng);
    car.id = `traffic-${i}`;
    car.name = CAR_NAMES[i % CAR_NAMES.length];
    car.condition = 100;
    placeTrafficCar(car, rng);
    state.cars.push(car);
  }
}

function spawnPickups(state) {
  const spots = [
    [-78, -52], [52, 26], [-26, 104], [104, 0], [-104, 78], [26, -104], [78, 130], [-130, -26],
  ];
  for (const [x, z] of spots) state.pickups.push({x, z, taken: false, respawn: 0});
}

// Lifetime numbers for the pause screen: money and respect earned,
// how far Rico has travelled, and what he has wrecked along the way.
function newStats() {
  return {cashEarned: 0, rpEarned: 0, pedsDown: 0, copsWrecked: 0, shotsFired: 0, missionsDone: 0, timePlayed: 0, distanceKm: 0, lastX: null, lastZ: null};
}

export function createWorld(seed) {
  const rng = createRandom(seed);
  const state = {
    seed,
    rng,
    time: 0,
    clockMinutes: 17 * 60,
    colliders: [],
    player: newPlayer(),
    cars: [],
    peds: [],
    pickups: [],
    missionIndex: 0,
    missionStep: 0,
    missionCollected: 0,
    missionHold: 0,
    missionTimer: 0,
    raceIndex: 0,
    eliminated: 0,
    targetCar: null,
    dialogue: null,
    heli: {active: false, x: 0, z: 0, y: 42, angle: 0, rotor: 0},
    districtHeat: {},
    fx: [],
    missionFlash: null,
    allMissionsDone: false,
    passenger: false,
    wasted: false,
    busted: false,
    message: '',
    saveTimer: 0,
    events: [],
    garageOpen: false,
    missionsOpen: false,
    stats: newStats(),
    tipsShown: {},
  };
  spawnParkedCars(state, rng);
  spawnTraffic(state, rng);
  for (let i = 0; i < PEDS.count; i += 1) state.peds.push(makePed(rng));
  spawnPickups(state);
  return state;
}

export function spawnFx(state, x, y, z, kind) {
  state.fx.push({x, y: y || 1, z, kind, t: 0});
  if (state.fx.length > 24) state.fx.shift();
}

export function addWanted(state, stars, audio) {
  const rico = state.player;
  const before = rico.wanted;
  rico.wanted = Math.min(WANTED.maxStars, rico.wanted + stars);
  rico.crimeTimer = 0;
  const d = districtAt(rico.x, rico.z).name;
  state.districtHeat[d] = Math.min(100, (state.districtHeat[d] || 0) + stars * 8);
  if (rico.wanted > before && audio) audio.siren(true);
  if (before === 0 && rico.wanted > 0) maybeTip(state, 'wanted');
}

// State mutations go through these helpers, so the economy, the event
// feed and car damage each have one place that changes them.
function grantCash(state, amount) {
  state.player.cash += amount;
  state.stats.cashEarned += amount;
}
function spendCash(state, amount) {
  state.player.cash -= amount;
}
function fineCash(state, amount) {
  state.player.cash = Math.max(0, state.player.cash - amount);
}
function grantRp(state, amount) {
  state.player.rp += amount;
  state.stats.rpEarned += amount;
}
function pushMessage(state, text) {
  state.events.push({type: 'message', text});
}
function hurtCar(car, amount) {
  car.damage = (car.damage || 0) + amount;
  car.condition = Math.max(0, 100 - (car.damage || 0));
  return car.damage;
}
function repairCar(car) {
  car.damage = 0;
  car.condition = 100;
}

// First-time street tips: each one shows once per game, the first time its
// situation comes up, so a new player learns the ropes without a tutorial
// screen getting in the way.
const TIPS = [
  {key: 'car', text: 'Cars are faster than feet — but stealing one in front of a cop is a crime.'},
  {key: 'wanted', text: 'Wanted! Break line of sight and the stars fade. Plates (Z) drop one star.'},
  {key: 'weapon', text: 'New guns live in slots 1-7. Q cycles the ones you own.'},
  {key: 'health', text: 'Health is low — find a green cross pickup, or visit the hospital.'},
  {key: 'garage', text: 'Safehouse garage. Press G near here to tune, armour and repair the ride.'},
];
function maybeTip(state, key) {
  const tip = TIPS.find((t) => t.key === key);
  if (!tip || state.tipsShown[key]) return;
  state.tipsShown[key] = true;
  pushMessage(state, 'TIP — ' + tip.text);
}

export function currentWeapon(state) {
  return state.player.weapons[state.player.weaponIndex];
}

export function unlockWeapons(state) {
  for (const w of state.player.weapons) {
    if (!w.owned && state.player.rp >= w.unlockRp) {
      w.owned = true;
      w.ammo = w.startAmmo || 0;
      w.mag = w.mag;
      pushMessage(state, `Unlocked: ${w.name}! Press ${state.player.weapons.indexOf(w) + 1} to equip.`);
      maybeTip(state, 'weapon');
    }
  }
}

function nearestCar(state, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.kind === 'player') continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function callUnits(state, audio) {
  const rico = state.player;
  const wanted = Math.min(WANTED.maxPolice, rico.wanted * WANTED.policePerStar);
  const active = state.cars.filter((c) => c.kind === 'police' && !c.disabled && !c.roadblock).length;
  for (let i = active; i < wanted; i += 1) {
    const road = CITY.roads[Math.floor(state.rng.next() * CITY.roads.length)];
    const angle = state.rng.next() * Math.PI * 2;
    const x = rico.x + Math.sin(angle) * 70;
    const z = rico.z + Math.cos(angle) * 70;
    const car = makeCar('police', 0x1c2b4a, Math.max(-CITY.half, Math.min(CITY.half, x)), Math.max(-CITY.half, Math.min(CITY.half, z)), angle, state.rng);
    car.unitNo = state.cars.filter((c) => c.kind === 'police').length;
    car.condition = 100;
    state.cars.push(car);
  }
  if (audio) audio.siren(rico.wanted > 0);
}

// Where the two roadblock cruisers go: on the nearest road ahead of Rico.
function roadblockPlacement(state) {
  const rico = state.player;
  const aheadX = rico.x + Math.sin(rico.angle) * 46;
  const aheadZ = rico.z + Math.cos(rico.angle) * 46;
  const vertical = Math.abs(Math.sin(rico.angle)) > Math.abs(Math.cos(rico.angle));
  const along = vertical ? aheadX : aheadZ;
  let nearest = CITY.roads[0];
  for (const r of CITY.roads) {
    if (Math.abs(along - r) < Math.abs(along - nearest)) nearest = r;
  }
  return {road: nearest, vertical, aheadX, aheadZ};
}

function layBlocks(state) {
  const rico = state.player;
  const blocks = state.cars.filter((c) => c.roadblock);
  if (rico.wanted < 4) {
    if (blocks.length > 0) state.cars = state.cars.filter((c) => !c.roadblock);
    return;
  }
  if (blocks.length >= 2) return;
  const spot = roadblockPlacement(state);
  for (let i = blocks.length; i < 2; i += 1) {
    const car = makeCar('police', 0x1c2b4a, 0, 0, 0, state.rng);
    car.roadblock = true;
    car.unitNo = 2 + i;
    car.condition = 100;
    if (spot.vertical) {
      car.x = spot.road;
      car.z = spot.aheadZ + (i === 0 ? -4 : 4);
      car.angle = Math.PI / 2;
    } else {
      car.x = spot.aheadX + (i === 0 ? -4 : 4);
      car.z = spot.road;
      car.angle = 0;
    }
    state.cars.push(car);
  }
  pushMessage(state, 'Roadblock ahead! The SBPD sealed the road.');
}

function flyChopper(state) {
  const rico = state.player;
  const heli = state.heli;
  if (rico.wanted >= 3 && !heli.active) {
    heli.active = true;
    heli.x = rico.x + 40;
    heli.z = rico.z - 40;
    heli.y = 42;
    pushMessage(state, 'Air One has you in the light!');
  } else if (rico.wanted < 3 && heli.active) {
    heli.active = false;
    return;
  }
  if (!heli.active) return;
  const t = state.time * 0.5;
  heli.x += (rico.x + Math.sin(t) * 18 - heli.x) * 0.03;
  heli.z += (rico.z + Math.cos(t) * 18 - heli.z) * 0.03;
  heli.angle = Math.atan2(rico.x - heli.x, rico.z - heli.z);
  heli.rotor += 0.35;
}

function climbIn(state, audio) {
  const rico = state.player;
  const car = nearestCar(state, rico.x, rico.z, 4);
  if (!car) return false;
  if (car.kind === 'traffic') {
    addWanted(state, 1, audio);
    pushMessage(state, 'Car stolen! The cops are on you.');
  }
  if (car.kind === 'police') {
    addWanted(state, 2, audio);
    pushMessage(state, 'You stole a police cruiser!');
  }
  car.kind = 'player';
  rico.car = car;
  maybeTip(state, 'car');
  rico.onFoot = false;
  rico.x = car.x;
  rico.z = car.z;
  rico.angle = car.angle;
  if (audio) audio.click();
  return true;
}

function climbOut(state) {
  const rico = state.player;
  if (!rico.car) return;
  const car = rico.car;
  car.kind = 'parked';
  car.speed = 0;
  rico.x = car.x + Math.sin(car.angle + Math.PI / 2) * 3;
  rico.z = car.z + Math.cos(car.angle + Math.PI / 2) * 3;
  rico.angle = car.angle;
  rico.car = null;
  rico.onFoot = true;
  rico.y = 0;
  rico.vy = 0;
}

function wreckCruiser(state, car, audio) {
  if (car.disabled) return;
  car.disabled = true;
  car.speed = 0;
  state.stats.copsWrecked += 1;
  spawnFx(state, car.x, 1, car.z, 'explosion');
  grantCash(state, 50);
  grantRp(state, 25);
  unlockWeapons(state);
  pushMessage(state, 'Police car disabled! +$50');
  const step = currentStep(state);
  if (step && step.kind === 'eliminate') state.eliminated = (state.eliminated || 0) + 1;
  if (audio) audio.crash();
}

// Pick the best thing in the firing cone: nearest along the aim, with a
// penalty for how far off-centre it is. Returns {kind, ref, dist} or null.
function pickTarget(state, camYaw, range) {
  const rico = state.player;
  const dirX = Math.sin(camYaw);
  const dirZ = Math.cos(camYaw);
  let best = null;
  let bestScore = Infinity;
  const consider = (x, z, kind, ref) => {
    const dx = x - rico.x;
    const dz = z - rico.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range || dist < 0.5) return;
    const along = dx * dirX + dz * dirZ;
    const side = Math.abs(dx * dirZ - dz * dirX);
    if (along < 0 || side > 1.2 + dist * 0.05) return;
    const score = dist + side * 4;
    if (score < bestScore) {
      bestScore = score;
      best = {kind, ref, dist};
    }
  };
  for (const ped of state.peds) {
    if (ped.state !== 'down') consider(ped.x, ped.z, 'ped', ped);
  }
  for (const car of state.cars) {
    if (car !== rico.car) consider(car.x, car.z, 'car', car);
  }
  return best;
}

function detonateRpg(state, car, audio) {
  spawnFx(state, car.x, 1.5, car.z, 'explosion');
  for (const other of state.cars) {
    if (other === state.player.car) continue;
    if (Math.hypot(other.x - car.x, other.z - car.z) >= 9) continue;
    other.damage = (other.damage || 0) + 120;
    if (other.kind === 'police' && other.damage >= 100) wreckCruiser(state, other, audio);
  }
  for (const ped of state.peds) {
    if (Math.hypot(ped.x - car.x, ped.z - car.z) < 8) knockPedDown(ped);
  }
  addWanted(state, 2, audio);
}

function openFire(state, camYaw, audio) {
  const rico = state.player;
  const weapon = currentWeapon(state);
  if (weapon.id === 'fists') {
    throwPunch(state, audio);
    return;
  }
  if (rico.reloadTimer > 0 || rico.shootTimer > 0) return;
  if (weapon.mag <= 0) {
    if (weapon.ammo > 0) {
      rico.reloadTimer = COMBAT.reloadSeconds;
      pushMessage(state, 'Reloading…');
    } else {
      pushMessage(state, `${weapon.name} is dry — no reserve ammo.`);
    }
    return;
  }
  weapon.mag -= 1;
  state.stats.shotsFired += 1;
  rico.shootTimer = weapon.cooldown;
  if (audio) audio.shot();
  const range = weapon.id === 'sniper' ? 120 : COMBAT.range;
  const best = pickTarget(state, camYaw, range);
  if (!best) return;
  if (best.kind === 'ped') {
    knockPedDown(best.ref);
    state.player.cash += 15;
    addWanted(state, 1, audio);
    pushMessage(state, 'Pedestrian down. +$15');
    return;
  }
  const car = best.ref;
  if (weapon.id === 'rpg') {
    detonateRpg(state, car, audio);
    return;
  }
  hurtCar(car, weapon.damage);
  if (car.kind === 'police' && car.damage >= 100) {
    wreckCruiser(state, car, audio);
  } else if (car.kind === 'traffic') {
    car.speed = 0;
    car.stalled = 3;
    addWanted(state, 1, audio);
  } else if (car.kind === 'police') {
    addWanted(state, 1, audio);
  } else if (car === state.targetCar && car.damage >= 100) {
    car.disabled = true;
    car.speed = 0;
    spawnFx(state, car.x, 1, car.z, 'explosion');
  }
}

function throwPunch(state, audio) {
  const rico = state.player;
  if (rico.punchTimer > 0) return;
  rico.punchTimer = 0.5;
  if (audio) audio.punch();
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - rico.x, ped.z - rico.z) < 2.2) {
      knockPedDown(ped);
      grantCash(state, 15);
      addWanted(state, 1, audio);
      pushMessage(state, 'Knocked out! +$15');
      return;
    }
  }
}

function spawnCourier(state) {
  if (state.targetCar) return;
  const step = currentStep(state);
  const pos = (step && step.pos) || {x: 104, z: 52};
  const car = makeCar('traffic', 0xeeeeee, pos.x, pos.z, Math.PI / 2, state.rng);
  car.id = `courier-${Math.floor(state.rng.next() * 1e9)}`;
  car.name = 'COURIER COMET';
  car.target = true;
  car.damage = 0;
  car.condition = 100;
  car.speed = 10;
  state.cars.push(car);
  state.targetCar = car;
  pushMessage(state, 'Courier spotted — white Comet, north side!');
}

// Advance one step and play the right sting: the mission-complete fanfare
// when a whole mission finished, the pickup blip for a step inside one.
function advanceStep(state, audio) {
  const result = advanceMission(state);
  if (!audio) return result;
  if (result === 'mission') audio.mission();
  else audio.pickup();
  return result;
}

// One handler per step kind. Each gets the state, the audio handle, the
// step itself, Rico, and a "within radius" test — and returns nothing;
// advancing is the handler's job.
// Which DJ line comes next, across all stations.
let djCount = 0;

const STEP_HANDLERS = {
  goto(state, audio, step, rico, within) {
    if (step.anyCar) {
      if (rico.car) {
        advanceMission(state);
        if (audio) audio.mission();
      }
      return;
    }
    if (within(step.pos, 6)) advanceStep(state, audio);
  },
  timed(state, audio, step, rico, within) {
    if (within(step.pos, 6)) advanceStep(state, audio);
  },
  collect(state, audio, step, rico, within) {
    const spots = step.spots || [];
    const spot = spots[state.missionCollected || 0];
    if (!spot || !within(spot, 4)) return;
    state.missionCollected += 1;
    grantCash(state, 25);
    if (audio) audio.pickup();
    pushMessage(state, `Package ${state.missionCollected}/${step.count} collected. +$25`);
    if (state.missionCollected >= step.count) {
      if (advanceMission(state) === 'mission' && audio) audio.mission();
    }
  },
  wanted(state, audio, step, rico) {
    if (rico.wanted >= step.stars) {
      advanceMission(state);
      if (audio) audio.pickup();
    }
  },
  pickup(state, audio, step, rico, within) {
    if (!within(step.pos, 4)) return;
    state.passenger = true;
    advanceMission(state);
    if (audio) audio.pickup();
    pushMessage(state, 'Passenger aboard. Drive carefully.');
  },
  deliver(state, audio, step, rico, within) {
    if (!state.passenger || !within(step.pos, 6)) return;
    state.passenger = false;
    if (advanceMission(state) === 'mission' && audio) audio.mission();
  },
  hold(state, audio, step, rico, within) {
    if (!within(step.pos, 5)) {
      state.missionHold = Math.max(0, state.missionHold - 1 / 60);
      return;
    }
    state.missionHold += 1 / 60;
    if (rico.wanted < 4) {
      rico.wanted = 4;
      rico.crimeTimer = 0;
    }
    if (state.missionHold < step.seconds) return;
    grantCash(state, 200);
    if (advanceMission(state) === 'mission' && audio) audio.mission();
    pushMessage(state, 'Vault cracked! +$200 — run!');
  },
  race(state, audio, step, rico, within) {
    const checkpoints = step.checkpoints || [];
    const cp = checkpoints[state.raceIndex || 0];
    if (!cp || !within(cp, 7)) return;
    state.raceIndex += 1;
    if (audio) audio.pickup();
    pushMessage(state, `Gate ${state.raceIndex}/${checkpoints.length}!`);
    if (state.raceIndex < checkpoints.length) return;
    if (advanceMission(state) === 'mission' && audio) audio.mission();
  },
  ram(state, audio, step, rico) {
    spawnCourier(state);
    const t = state.targetCar;
    if (!t || !(t.disabled || (t.damage || 0) >= 100)) return;
    grantCash(state, 150);
    pushMessage(state, 'Courier stopped! Cargo secured. +$150');
    if (advanceMission(state) === 'mission' && audio) audio.mission();
  },
  eliminate(state, audio, step) {
    if ((state.eliminated || 0) < step.count) return;
    if (advanceMission(state) === 'mission' && audio) audio.mission();
  },
};

function tickSteps(state, audio) {
  const mission = currentMission(state);
  const step = currentStep(state);
  if (!mission || !step) return;
  const rico = state.player;
  const within = (pos, radius) => pos && Math.hypot(rico.x - pos.x, rico.z - pos.z) < radius;
  const handler = STEP_HANDLERS[step.kind];
  if (handler) handler(state, audio, step, rico, within);
}

// Clocks and cooldowns: world time, weapon timers, reload, crime and crew
// cooldowns, the mission timer, and ageing visual effects.
function stepTimers(state, dt) {
  const rico = state.player;
  state.time += dt;
  state.stats.timePlayed += dt;
  const moved = Math.hypot(rico.x - (state.stats.lastX ?? rico.x), rico.z - (state.stats.lastZ ?? rico.z));
  state.stats.distanceKm += moved / 1000;
  state.stats.lastX = rico.x;
  state.stats.lastZ = rico.z;
  state.clockMinutes += dt / 10;
  state.events = [];
  rico.shootTimer = Math.max(0, rico.shootTimer - dt);
  rico.punchTimer = Math.max(0, rico.punchTimer - dt);
  if (rico.reloadTimer > 0) {
    rico.reloadTimer -= dt;
    if (rico.reloadTimer <= 0) {
      const w = currentWeapon(state);
      const magSize = WEAPONS[state.weaponIndex].mag;
      const moved = Math.min(magSize - w.mag, w.ammo);
      w.mag += moved;
      w.ammo -= moved;
    }
  }
  rico.crimeTimer += dt;
  for (const k of Object.keys(rico.crew)) rico.crew[k] = Math.max(0, rico.crew[k] - dt);
  if (rico.eyesTimer > 0) rico.eyesTimer -= dt;
  if (state.dialogue && state.dialogue.timer > 0) state.dialogue.timer -= dt;
  const step = currentStep(state);
  if (step && (step.kind === 'race' || step.kind === 'timed') && step.seconds) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      startStep(state);
      pushMessage(state, 'Out of time — the job resets. Try again.');
    }
  }
  for (const fx of state.fx) fx.t += dt;
  state.fx = state.fx.filter((fx) => fx.t < 1.2);
}

// Weapon switching: number keys 1–7, Q cycles owned weapons, C changes radio.
function handleWeaponKeys(state, input, audio) {
  const rico = state.player;
  for (let i = 0; i < 7; i += 1) {
    if (!input.wasPressed(`w${i + 1}`)) continue;
    const w = rico.weapons[i];
    if (w.owned) {
      rico.weaponIndex = i;
      pushMessage(state, `${w.name} equipped.`);
    } else {
      pushMessage(state, `${w.name} is locked — reach ${w.unlockRp} RP.`);
    }
  }
  if (input.wasPressed('cycleWeapon')) {
    const owned = rico.weapons.map((w, i) => (w.owned ? i : -1)).filter((i) => i >= 0);
    const at = owned.indexOf(rico.weaponIndex);
    rico.weaponIndex = owned[(at + 1) % owned.length];
    pushMessage(state, `${currentWeapon(state).name} equipped.`);
  }
  if (input.wasPressed('radio')) {
    rico.radioStation = (rico.radioStation + 1) % RADIO.length;
    if (audio) audio.setRadio(rico.radioStation);
    const station = RADIO[rico.radioStation];
    pushMessage(state, `♪ ${station.name} — ${station.genre}`);
    if (station.lines && station.lines.length) {
      const line = station.lines[djCount % station.lines.length];
      djCount += 1;
      sayLine(state, line, station.dj, 'DJ');
    }
  }
}

// Crew abilities: Z plates, X roadside repair, V police-vision.
function handleCrewKeys(state, input) {
  const rico = state.player;
  if (input.wasPressed('plates') && rico.crew.plates <= 0) {
    if (rico.wanted > 0) {
      rico.wanted = Math.max(0, rico.wanted - 1);
      rico.crew.plates = CREW[0].cooldown;
      pushMessage(state, 'Mira swapped the plates — one star gone.');
    } else {
      pushMessage(state, 'No heat to lose right now.');
    }
  }
  if (input.wasPressed('fix') && rico.crew.fix <= 0) {
    if (rico.car && (rico.car.condition || 100) < 100 && rico.cash >= 50) {
      spendCash(state, 50);
      repairCar(rico.car);
      rico.crew.fix = CREW[1].cooldown;
      pushMessage(state, 'Lio patched the car up. -$50');
    } else if (!rico.car) {
      pushMessage(state, 'Quick Fix needs a car.');
    }
  }
  if (input.wasPressed('eyes') && rico.crew.eyes <= 0) {
    rico.eyesTimer = 10;
    rico.crew.eyes = CREW[2].cooldown;
    pushMessage(state, "Kiki's eyes are out — police revealed.");
  }
}

// The courier target car just drives its own route.
function stepTrafficCars(state, dt) {
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    if (car === state.targetCar) {
      stepTrafficCar(car, dt, state.rng);
      continue;
    }
    if (car.stalled > 0) {
      car.stalled -= dt;
      continue;
    }
    let ahead = false;
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
      const side = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
      if (along > 0 && along < 9 && side < 3) {
        ahead = true;
        break;
      }
    }
    const savedSpeed = car.speed;
    if (ahead) car.speed = Math.max(0, car.speed - 8 * dt);
    stepTrafficCar(car, dt, state.rng);
    if (ahead) car.speed = savedSpeed;
  }
}

// Police: dispatch units, roadblocks and the helicopter, then step each
// cruiser. A ram dents the player, it does not delete them: total ram
// damage is capped so a pile-up is survivable and escapable.
function stepPoliceForce(state, dt, collide, audio) {
  const rico = state.player;
  callUnits(state, audio);
  layBlocks(state);
  flyChopper(state);
  let policeNear = false;
  let ramHits = 0;
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.disabled || car.roadblock) continue;
    const hit = stepPoliceCar(car, rico.x, rico.z, dt, collide);
    if (hit) {
      policeNear = true;
      if (rico.car) ramHits += 1;
      else rico.bustedTimer += dt;
    }
    if (car.damage >= 100) wreckCruiser(state, car, audio);
  }
  if (ramHits > 0 && rico.car) {
    rico.health -= Math.min(3, ramHits * 1.0) * dt * (1 - 0.25 * rico.garage.armor);
    rico.car.condition = Math.max(0, (rico.car.condition ?? 100) - ramHits * 0.4 * dt);
  }
  if (!policeNear && rico.onFoot) rico.bustedTimer = Math.max(0, rico.bustedTimer - dt * 2);
  if (rico.bustedTimer >= WANTED.bustSeconds) {
    state.busted = true;
    fineCash(state, 150);
    rico.wanted = 0;
  }
}

// Ambient life: pedestrians flee danger, cash pickups respawn, wanted
// decays when Rico stays clean, and health slowly regenerates out of trouble.
function stepAmbient(state, dt, audio) {
  const rico = state.player;
  const danger = (rico.wanted > 0 || rico.car) && Math.abs(rico.car ? rico.car.speed : 0) > 4
    ? {x: rico.x, z: rico.z} : null;
  for (const ped of state.peds) {
    const nearDanger = danger && Math.hypot(ped.x - danger.x, ped.z - danger.z) < 18;
    stepPed(ped, dt, state.rng, nearDanger ? danger : null);
  }
  for (const pickup of state.pickups) {
    if (pickup.taken) {
      pickup.respawn -= dt;
      if (pickup.respawn <= 0) pickup.taken = false;
      continue;
    }
    if (Math.hypot(pickup.x - rico.x, pickup.z - rico.z) < 2.5) {
      pickup.taken = true;
      pickup.respawn = 60;
      grantCash(state, 25);
      grantRp(state, 5);
      if (audio) audio.pickup();
      pushMessage(state, 'Cash found! +$25');
    }
  }
  if (rico.health < 30 && rico.health > 0) maybeTip(state, 'health');
  if (!state.garageOpen && Math.hypot(rico.x + 130, rico.z + 130) < 12) maybeTip(state, 'garage');
  if (rico.crimeTimer > WANTED.decayDelay) {
    rico.decayTimer += dt;
    if (rico.decayTimer >= WANTED.decayInterval && rico.wanted > 0) {
      rico.wanted -= 1;
      rico.decayTimer = 0;
      if (rico.wanted === 0 && audio) audio.siren(false);
    }
  } else {
    rico.decayTimer = 0;
  }
  if (rico.wanted === 0 && rico.health < PLAYER.maxHealth) rico.health = Math.min(PLAYER.maxHealth, rico.health + 2 * dt);
  if (rico.health <= 0) {
    state.wasted = true;
    fineCash(state, 100);
  }
}


// One fixed simulation step.
// Pedestrians the player's car clips at speed go down — and it is a crime.
function checkPedHits(state, audio, beforeSpeed) {
  const rico = state.player;
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - rico.x, ped.z - rico.z) >= 2 || beforeSpeed <= 5) continue;
    knockPedDown(ped);
    state.stats.pedsDown += 1;
    addWanted(state, 1, audio);
    pushMessage(state, 'You hit a pedestrian!');
  }
}

// Car-to-car bumps: separate the two cars, trade speed for damage, and let
// the mission and police logic react to what got hit.
function resolveCarBumps(state, collide, audio) {
  const rico = state.player;
  for (const car of state.cars) {
    if (car === rico.car || car.kind === 'player') continue;
    const d = Math.hypot(car.x - rico.x, car.z - rico.z);
    if (d >= 3.4 || d <= 0.01) continue;
    const push = (3.4 - d) / 2;
    const nx = (car.x - rico.x) / d;
    const nz = (car.z - rico.z) / d;
    if (car.kind === 'police') {
      // A police ram bounces the cruiser off instead of shoving Rico
      // sideways off the road — the player keeps their line, the cop
      // loses the shove. Traffic still gets shoved, as before.
      car.x += nx * push * 2;
      car.z += nz * push * 2;
    } else {
      car.x += nx * push;
      car.z += nz * push;
      if (!collide(rico.car.x - nx * push, rico.car.z - nz * push, CAR.radius)) {
        rico.car.x -= nx * push;
        rico.car.z -= nz * push;
        rico.x = rico.car.x;
        rico.z = rico.car.z;
      }
    }
    const impact = Math.abs(rico.car.speed) + Math.abs(car.speed || 0);
    rico.car.speed *= 0.6;
    rico.car.condition = Math.max(0, (rico.car.condition ?? 100) - impact * 0.15);
    if (car.kind === 'traffic') car.speed = Math.max(0, car.speed - 4);
    if (car === state.targetCar) {
      hurtCar(car, impact * 1.6);
      spawnFx(state, car.x, 1, car.z, 'crash');
      if (car.damage >= 100 && !car.disabled) {
        car.disabled = true;
        car.speed = 0;
        spawnFx(state, car.x, 1.5, car.z, 'explosion');
      }
    }
    if (car.kind === 'police') {
      hurtCar(car, impact * 0.8);
      if (car.damage >= 100 && !car.disabled) wreckCruiser(state, car, audio);
      // A bump with a police car raises the heat — but only once per
      // scrape, not once per frame of contact.
      if (state.time - (state.lastBumpWanted || -99) > 5) {
        state.lastBumpWanted = state.time;
        addWanted(state, 1, audio);
      }
    }
  }
}

// Driving and walking: the car physics or the on-foot step, plus shooting,
// punching and the reload key. Garage and job-list toggles live in main.js:
// they must work while the world is frozen behind their overlays.
function driveSystem(ctx) {
  const {state, input, dt, audio, camYaw, collide} = ctx;
  const rico = state.player;
  if (!rico.car) {
    stepPlayerOnFoot(rico, input, dt, camYaw, collide);
    if (input.takeShoot()) openFire(state, camYaw, audio);
    if (input.wasPressed('punch')) throwPunch(state, audio);
  } else {
    const beforeSpeed = Math.abs(rico.car.speed);
    const hardHit = stepPlayerCar(rico.car, input, dt, collide, rico.garage.tune);
    if (hardHit) {
      rico.car.condition = Math.max(0, (rico.car.condition ?? 100) - 4);
      spawnFx(state, rico.car.x, 1, rico.car.z, 'crash');
      if (audio) audio.crash();
    }
    rico.x = rico.car.x;
    rico.z = rico.car.z;
    rico.angle = rico.car.angle;
    checkPedHits(state, audio, beforeSpeed);
    resolveCarBumps(state, collide, audio);
  }
  if (input.wasPressed('reload') && currentWeapon(state).mag < WEAPONS[state.weaponIndex].mag && rico.reloadTimer <= 0) {
    rico.reloadTimer = COMBAT.reloadSeconds;
  }
}

// The simulation is a list of systems, run in order every fixed step. Each
// one takes the same context object — state, input, dt, audio, camera yaw
// and the collision test — so the order is data, not a long function body.
const SYSTEMS = [
  (ctx) => stepTimers(ctx.state, ctx.dt),
  (ctx) => {
    if (ctx.input.wasPressed('enter')) {
      if (ctx.state.player.car) climbOut(ctx.state);
      else climbIn(ctx.state, ctx.audio);
    }
  },
  (ctx) => handleWeaponKeys(ctx.state, ctx.input, ctx.audio),
  (ctx) => handleCrewKeys(ctx.state, ctx.input),
  driveSystem,
  (ctx) => stepTrafficCars(ctx.state, ctx.dt),
  (ctx) => stepPoliceForce(ctx.state, ctx.dt, ctx.collide, ctx.audio),
  (ctx) => stepAmbient(ctx.state, ctx.dt, ctx.audio),
  (ctx) => {
    tickSteps(ctx.state, ctx.audio);
    unlockWeapons(ctx.state);
  },
  (ctx) => {
    ctx.state.saveTimer += ctx.dt;
    if (ctx.state.saveTimer > 15) {
      ctx.state.saveTimer = 0;
      saveGame(ctx.state);
    }
  },
];

// One fixed simulation step.
export function stepWorld(state, input, dt, audio, camYaw) {
  const collide = (x, z, r) => {
    if (Math.abs(x) > CITY.half || z > CITY.beachZ + 24 || z < -CITY.half) return true;
    return hitsBlock(x, z, r, state.colliders);
  };
  const ctx = {state, input, dt, audio, camYaw, collide};
  for (const system of SYSTEMS) system(ctx);
  return state.events;
}

// The garage shelf: each purchase names its price, the message when Rico
// cannot afford it, a check that returns a problem string or null, the
// effect, and the success line for the HUD.
const GARAGE_SHELF = [
  {
    kind: 'repair', price: 100, shortage: 'repair costs $100',
    check: (rico) => !rico.car ? 'Repair needs a car.'
      : (rico.car.condition ?? 100) >= 100 ? 'Car is already in perfect shape.' : null,
    apply: (state, rico) => repairCar(rico.car),
    message: () => 'Repaired to 100% condition.',
  },
  {
    kind: 'tune', price: 400, shortage: 'engine tune costs $400',
    check: (rico) => rico.garage.tune >= 3 ? 'Engine is maxed out (Tune 3).' : null,
    apply: (state, rico) => { rico.garage.tune += 1; },
    message: (rico) => `Engine tuned to level ${rico.garage.tune} — faster top speed.`,
  },
  {
    kind: 'armor', price: 300, shortage: 'armour costs $300',
    check: (rico) => rico.garage.armor >= 2 ? 'Armour is maxed out.' : null,
    apply: (state, rico) => { rico.garage.armor += 1; },
    message: (rico) => `Armour fitted (level ${rico.garage.armor}) — rams hurt less.`,
  },
  {
    kind: 'ammo', price: 80, shortage: 'ammo costs $80',
    check: (rico, state) => currentWeapon(state).id === 'fists' ? 'Fists need no ammo.' : null,
    apply: (state, rico) => {
      const w = currentWeapon(state);
      w.ammo += w.mag * 2;
    },
    message: (rico, state) => `Bought ammo for the ${currentWeapon(state).name}.`,
  },
];

// Garage purchases. Returns a message for the HUD, or null if it failed.
export function buyGarage(state, kind) {
  const rico = state.player;
  const item = GARAGE_SHELF.find((entry) => entry.kind === kind);
  if (!item) return null;
  const problem = item.check(rico, state);
  if (problem) return problem;
  if (rico.cash < item.price) return `Not enough cash — ${item.shortage}.`;
  spendCash(state, item.price);
  item.apply(state, rico);
  return item.message(rico, state);
}

// Read and write a dotted path ('player.cash') on the state object.
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

// The save file, as [key, state path, fallback when the save lacks it].
// 'keep' means the current value (a fresh game keeps its own cash and spot).
const SAVE_SCALARS = [
  ['cash', 'player.cash', 'keep'],
  ['rp', 'player.rp', 0],
  ['missionIndex', 'missionIndex', 0],
  ['missionStep', 'missionStep', 0],
  ['x', 'player.x', 'keep'],
  ['z', 'player.z', 'keep'],
  ['allMissionsDone', 'allMissionsDone', false],
  ['radioStation', 'player.radioStation', 0],
  ['weaponIndex', 'player.weaponIndex', 1],
];

export function saveGame(state) {
  try {
    const data = {};
    for (const [key, path] of SAVE_SCALARS) data[key] = getPath(state, path);
    data.garage = state.player.garage;
    data.weapons = state.player.weapons.map((w) => ({owned: w.owned, ammo: w.ammo, mag: w.mag}));
    data.districtHeat = state.districtHeat;
    window.localStorage.setItem('solmar-bay.save.v1', JSON.stringify(data));
    saveBest(state);
  } catch {
    // storage unavailable — the game still runs, it just cannot save
  }
}

// Best run so far: the most cash ever held and the most jobs ever done,
// kept across sessions so the title screen can brag about it.
export function saveBest(state) {
  try {
    const prev = loadBest() || {cash: 0, missions: 0};
    const best = {
      cash: Math.max(prev.cash, state.player.cash),
      missions: Math.max(prev.missions, state.missionIndex),
    };
    window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // storage unavailable — the game still runs, it just cannot remember
  }
}

export function loadBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem('solmar-bay.save.v1');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function applySave(state, save) {
  if (!save) return;
  for (const [key, path, fallback] of SAVE_SCALARS) {
    const base = fallback === 'keep' ? getPath(state, path) : fallback;
    const value = save[key] ?? base;
    setPath(state, path, key === 'allMissionsDone' ? !!value : value);
  }
  if (save.garage) state.player.garage = {...state.player.garage, ...save.garage};
  if (Array.isArray(save.weapons)) {
    for (let i = 0; i < save.weapons.length; i += 1) {
      const sw = save.weapons[i];
      const w = state.player.weapons[i];
      if (!w || !sw) continue;
      w.owned = !!sw.owned;
      w.ammo = sw.ammo ?? 0;
      w.mag = sw.mag ?? w.mag;
    }
  }
  state.districtHeat = save.districtHeat ?? {};
  startStep(state);
}

export function resetWorld(state) {
  const fresh = createWorld(state.seed);
  fresh.colliders = state.colliders;
  return fresh;
}

// Reset in place so the renderer and HUD, which hold this same object,
// keep working: every field is replaced, the object identity is not.
export function resetInPlace(state, seed) {
  const fresh = createWorld(seed);
  for (const key of Object.keys(fresh)) {
    if (key === 'colliders' || key === 'rng') continue;
    state[key] = fresh[key];
  }
  state.time = 0;
  startStep(state);
}
