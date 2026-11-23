// Solmar Bay alive: driving, walking, traffic, pedestrians, police,
// wanted stars, fights, missions, pickups, radio, respect, crew
// abilities, the police helicopter, roadblocks and saving. The
// renderer only paints this state; it never decides anything.
import { BEST_KEY, CAR, CAR_NAMES, CITY, COMBAT, CREW, MISSIONS, PEDS, PLAYER, RADIO, TRAFFIC, WANTED, WEAPONS, districtAt } from './config.js';
import { createRandom } from './random.js';
import { createStashField, sweepStashes, STASH_REWARD_CASH, STASH_REWARD_RP } from './collectibles.js';
import { createWeather, tickWeather, weatherChatter } from './weather.js';
import { createTram, tickTram } from './tram.js';
import { makeCar, placeTrafficCar, stepPlayerCar, stepPoliceCar, stepTrafficCar } from './vehicles.js';
import { knockPedDown, makePed, stepPed } from './pedestrians.js';
import { stepPlayerOnFoot } from './player.js';
import { advanceMission, currentMission, currentStep, sayLine, startStep, stepTarget } from './missions.js';

// True when the circle of radius r at (x, z) touches any building box.
function circleHitsBox(x, z, r, boxes) {
  for (const box of boxes) {
    const nearX = Math.max(box.x0, Math.min(x, box.x1));
    const nearZ = Math.max(box.z0, Math.min(z, box.z1));
    const dx = x - nearX;
    const dz = z - nearZ;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// Police callsigns, handed out in spawn order so the dispatch panel
// can show a real name, distance and tactic per unit.
const UNIT_TAGS = ['KITE-1', 'CORAL-48', 'BARRACUDA-18', 'GULL-8', 'BULWARK-2', 'TIDE-7'];
export function unitName(car) {
  if (car.roadblock) return 'BULWARK-' + (car.unitNo || 2);
  return UNIT_TAGS[(car.unitNo || 0) % UNIT_TAGS.length];
}

// Rico, fresh off the bus: on foot, $120, no heat, fists and a pistol.
function freshRico() {
  const arsenal = WEAPONS.map((w) => ({
    ...w,
    owned: w.unlockRp === 0,
    ammo: w.startAmmo || 0,
    mag: w.id === 'fists' ? Infinity : w.mag,
  }));
  return {
    x: 0, z: 30, y: 0, vy: 0, angle: Math.PI,
    health: PLAYER.maxHealth, cash: PLAYER.startCash,
    wanted: 0, crimeTimer: 99, decayTimer: 0,
    onFoot: true, car: null, ammo: COMBAT.ammo,
    reloadTimer: 0, shootTimer: 0, punchTimer: 0,
    bustedTimer: 0, moving: false, running: false, walkPhase: 0,
    rp: 0, radioStation: 0,
    weapons: arsenal,
    weaponIndex: 1,
    garage: {tune: 0, armor: 0},
    crew: {plates: 0, fix: 0, eyes: 0},
    eyesTimer: 0,
  };
}

const PARKED_PAINTS = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x8a5fd9, 0xff7a2b];
const FLOW_PAINTS = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x222222, 0x8a5fd9];

// Parked cars along the kerbs, ready to steal.
function parkStarters(state, rng) {
  const bays = [
    {x: -44, z: -100}, {x: 60, z: 60}, {x: 8, z: -52}, {x: -96, z: 20},
    {x: 112, z: -20}, {x: -8, z: 130}, {x: 44, z: -130},
  ];
  for (let i = 0; i < bays.length; i += 1) {
    const bay = bays[i];
    // Parked parallel to the road: snap the heading to the nearest
    // cardinal direction, so a stolen car drives along a street
    // instead of slewing into the nearest building.
    const drawn = rng.next() * Math.PI * 2;
    const heading = Math.round(drawn / (Math.PI / 2)) * (Math.PI / 2);
    const car = makeCar('parked', PARKED_PAINTS[i % PARKED_PAINTS.length], bay.x, bay.z, heading, rng);
    car.id = 'parked-' + state.cars.length;
    car.name = CAR_NAMES[i % CAR_NAMES.length];
    car.condition = 100;
    state.cars.push(car);
  }
}

function fillTraffic(state, rng) {
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const car = makeCar('traffic', FLOW_PAINTS[i % FLOW_PAINTS.length], 0, 0, 0, rng);
    car.id = 'traffic-' + i;
    car.name = CAR_NAMES[i % CAR_NAMES.length];
    car.condition = 100;
    placeTrafficCar(car, rng);
    state.cars.push(car);
  }
}

function scatterCash(state) {
  const spots = [
    {x: -78, z: -52}, {x: 52, z: 26}, {x: -26, z: 104}, {x: 104, z: 0},
    {x: -104, z: 78}, {x: 26, z: -104}, {x: 78, z: 130}, {x: -130, z: -26},
  ];
  for (const spot of spots) {
    state.pickups.push({x: spot.x, z: spot.z, taken: false, respawn: 0});
  }
}

// Lifetime numbers for the pause screen: money and respect earned,
// distance driven, and everything wrecked along the way.
function freshLedger() {
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
    player: freshRico(),
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
    stats: freshLedger(),
    tipsShown: {},
    stashes: createStashField(rng),
    weather: createWeather(),
    tram: createTram(),
  };
  parkStarters(state, rng);
  fillTraffic(state, rng);
  for (let i = 0; i < PEDS.count; i += 1) state.peds.push(makePed(rng));
  scatterCash(state);
  return state;
}

export function spawnFx(state, x, y, z, kind) {
  state.fx.push({x, y: y || 1, z, kind, t: 0});
  while (state.fx.length > 24) state.fx.shift();
}

export function addWanted(state, stars, audio) {
  const driver = state.player;
  const before = driver.wanted;
  driver.wanted = Math.min(WANTED.maxStars, driver.wanted + stars);
  driver.crimeTimer = 0;
  const district = districtAt(driver.x, driver.z).name;
  const heat = state.districtHeat[district] || 0;
  state.districtHeat[district] = Math.min(100, heat + stars * 8);
  if (driver.wanted > before && audio) audio.siren(true);
  if (before === 0 && driver.wanted > 0) flashTip(state, 'wanted');
}

// Cash, respect, messages and car damage each change in exactly one
// place, so the economy and the event feed stay consistent.
function credit(state, amount) {
  state.player.cash += amount;
  state.stats.cashEarned += amount;
}
function debit(state, amount) {
  state.player.cash -= amount;
}
function penalize(state, amount) {
  const left = state.player.cash - amount;
  state.player.cash = left > 0 ? left : 0;
}
function awardRp(state, amount) {
  state.player.rp += amount;
  state.stats.rpEarned += amount;
}
function tell(state, text) {
  state.events.push({type: 'message', text});
}
function damageCar(car, amount) {
  const total = (car.damage || 0) + amount;
  car.damage = total;
  car.condition = Math.max(0, 100 - total);
  return total;
}
function repairCar(car) {
  car.damage = 0;
  car.condition = 100;
}

// First-time street tips: each one fires once per game, when its
// situation first happens, so a new player learns without a tutorial
// screen in the way.
const TIPS = {
  car: 'Cars are faster than feet — but stealing one in front of a cop is a crime.',
  wanted: 'Wanted! Break line of sight and the stars fade. Plates (Z) drop one star.',
  weapon: 'New guns live in slots 1-7. Q cycles the ones you own.',
  health: 'Health is low — find a green cross pickup, or visit the hospital.',
  garage: 'Safehouse garage. Press G near here to tune, armour and repair the ride.',
};
function flashTip(state, key) {
  const tip = TIPS[key];
  if (!tip || state.tipsShown[key]) return;
  state.tipsShown[key] = true;
  tell(state, 'TIP — ' + tip);
}

export function currentWeapon(state) {
  return state.player.weapons[state.player.weaponIndex];
}

export function unlockWeapons(state) {
  for (let i = 0; i < state.player.weapons.length; i += 1) {
    const w = state.player.weapons[i];
    if (w.owned || state.player.rp < w.unlockRp) continue;
    w.owned = true;
    w.ammo = w.startAmmo || 0;
    tell(state, 'Unlocked: ' + w.name + '! Press ' + (i + 1) + ' to equip.');
    flashTip(state, 'weapon');
  }
}

function closestCar(state, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.kind === 'player') continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d >= bestD) continue;
    best = car;
    bestD = d;
  }
  return best;
}

function dispatchCruisers(state, audio) {
  const driver = state.player;
  const wanted = Math.min(WANTED.maxPolice, driver.wanted * WANTED.policePerStar);
  let onDuty = 0;
  let totalPolice = 0;
  for (const c of state.cars) {
    if (c.kind !== 'police') continue;
    totalPolice += 1;
    if (!c.disabled && !c.roadblock) onDuty += 1;
  }
  for (let i = onDuty; i < wanted; i += 1) {
    const angle = state.rng.next() * Math.PI * 2;
    const x = driver.x + Math.sin(angle) * 70;
    const z = driver.z + Math.cos(angle) * 70;
    const clampedX = Math.max(-CITY.half, Math.min(CITY.half, x));
    const clampedZ = Math.max(-CITY.half, Math.min(CITY.half, z));
    const car = makeCar('police', 0x1c2b4a, clampedX, clampedZ, angle, state.rng);
    car.unitNo = totalPolice;
    totalPolice += 1;
    car.condition = 100;
    state.cars.push(car);
  }
  if (audio) audio.siren(driver.wanted > 0);
}

// Where the two roadblock cruisers go: the nearest road ahead of Rico.
function pickBlockPoint(state) {
  const driver = state.player;
  const aheadX = driver.x + Math.sin(driver.angle) * 46;
  const aheadZ = driver.z + Math.cos(driver.angle) * 46;
  const vertical = Math.abs(Math.sin(driver.angle)) > Math.abs(Math.cos(driver.angle));
  const along = vertical ? aheadX : aheadZ;
  let nearest = CITY.roads[0];
  for (let i = 1; i < CITY.roads.length; i += 1) {
    const r = CITY.roads[i];
    if (Math.abs(along - r) < Math.abs(along - nearest)) nearest = r;
  }
  return {road: nearest, vertical, aheadX, aheadZ};
}

function holdRoadblocks(state) {
  const driver = state.player;
  const blocks = [];
  for (const c of state.cars) {
    if (c.roadblock) blocks.push(c);
  }
  if (driver.wanted < 4) {
    if (blocks.length > 0) state.cars = state.cars.filter((c) => !c.roadblock);
    return;
  }
  if (blocks.length >= 2) return;
  const spot = pickBlockPoint(state);
  for (let i = blocks.length; i < 2; i += 1) {
    const car = makeCar('police', 0x1c2b4a, 0, 0, 0, state.rng);
    car.roadblock = true;
    car.unitNo = 2 + i;
    car.condition = 100;
    const offset = i === 0 ? -4 : 4;
    if (spot.vertical) {
      car.x = spot.road;
      car.z = spot.aheadZ + offset;
      car.angle = Math.PI / 2;
    } else {
      car.x = spot.aheadX + offset;
      car.z = spot.road;
      car.angle = 0;
    }
    state.cars.push(car);
  }
  tell(state, 'Roadblock ahead! The SBPD sealed the road.');
}

function orbitHeli(state) {
  const driver = state.player;
  const heli = state.heli;
  if (driver.wanted >= 3 && !heli.active) {
    heli.active = true;
    heli.x = driver.x + 40;
    heli.z = driver.z - 40;
    heli.y = 42;
    tell(state, 'Air One has you in the light!');
  } else if (driver.wanted < 3 && heli.active) {
    heli.active = false;
    return;
  }
  if (!heli.active) return;
  const t = state.time * 0.5;
  const hoverX = driver.x + Math.sin(t) * 18;
  const hoverZ = driver.z + Math.cos(t) * 18;
  heli.x += (hoverX - heli.x) * 0.03;
  heli.z += (hoverZ - heli.z) * 0.03;
  heli.angle = Math.atan2(driver.x - heli.x, driver.z - heli.z);
  heli.rotor += 0.35;
}

function climbIn(state, audio) {
  const driver = state.player;
  const car = closestCar(state, driver.x, driver.z, 4);
  if (car === null) return false;
  if (car.kind === 'traffic') {
    addWanted(state, 1, audio);
    tell(state, 'Car stolen! The cops are on you.');
  }
  if (car.kind === 'police') {
    addWanted(state, 2, audio);
    tell(state, 'You stole a police cruiser!');
  }
  car.kind = 'player';
  driver.car = car;
  flashTip(state, 'car');
  driver.onFoot = false;
  driver.x = car.x;
  driver.z = car.z;
  driver.angle = car.angle;
  if (audio) audio.click();
  return true;
}

function climbOut(state) {
  const driver = state.player;
  if (driver.car === null || driver.car === undefined) return;
  const car = driver.car;
  car.kind = 'parked';
  car.speed = 0;
  const sideX = Math.sin(car.angle + Math.PI / 2) * 3;
  const sideZ = Math.cos(car.angle + Math.PI / 2) * 3;
  driver.x = car.x + sideX;
  driver.z = car.z + sideZ;
  driver.angle = car.angle;
  driver.car = null;
  driver.onFoot = true;
  driver.y = 0;
  driver.vy = 0;
}

function wreckCruiser(state, car, audio) {
  if (car.disabled) return;
  car.disabled = true;
  car.speed = 0;
  state.stats.copsWrecked += 1;
  spawnFx(state, car.x, 1, car.z, 'explosion');
  credit(state, 50);
  awardRp(state, 25);
  unlockWeapons(state);
  tell(state, 'Police car disabled! +$50');
  const step = currentStep(state);
  if (step !== null && step.kind === 'eliminate') state.eliminated = (state.eliminated || 0) + 1;
  if (audio) audio.crash();
}

// Pick the best thing in the firing cone: nearest along the aim, with
// a penalty for how far off-centre it is. Returns {kind, ref, dist}
// or null.
function pickTarget(state, camYaw, range) {
  const driver = state.player;
  const dirX = Math.sin(camYaw);
  const dirZ = Math.cos(camYaw);
  const candidates = [];
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (ped.state !== 'down') candidates.push({kind: 'ped', ref: ped, x: ped.x, z: ped.z});
  }
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car !== driver.car) candidates.push({kind: 'car', ref: car, x: car.x, z: car.z});
  }
  let best = null;
  let bestScore = Infinity;
  for (const cand of candidates) {
    const dx = cand.x - driver.x;
    const dz = cand.z - driver.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range || dist < 0.5) continue;
    const along = dx * dirX + dz * dirZ;
    const side = Math.abs(dx * dirZ - dz * dirX);
    if (along < 0 || side > 1.2 + dist * 0.05) continue;
    const score = dist + side * 4;
    if (score >= bestScore) continue;
    bestScore = score;
    best = {kind: cand.kind, ref: cand.ref, dist};
  }
  return best;
}

function detonateRpg(state, car, audio) {
  spawnFx(state, car.x, 1.5, car.z, 'explosion');
  for (let i = 0; i < state.cars.length; i += 1) {
    const other = state.cars[i];
    if (other === state.player.car) continue;
    if (Math.hypot(other.x - car.x, other.z - car.z) >= 9) continue;
    other.damage = (other.damage || 0) + 120;
    if (other.kind === 'police' && other.damage >= 100) wreckCruiser(state, other, audio);
  }
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (Math.hypot(ped.x - car.x, ped.z - car.z) < 8) knockPedDown(ped);
  }
  addWanted(state, 2, audio);
}

function shoot(state, camYaw, audio) {
  const driver = state.player;
  const weapon = currentWeapon(state);
  if (weapon.id === 'fists') {
    swingFist(state, audio);
    return;
  }
  if (driver.reloadTimer > 0 || driver.shootTimer > 0) return;
  if (weapon.mag <= 0) {
    if (weapon.ammo > 0) {
      driver.reloadTimer = COMBAT.reloadSeconds;
      tell(state, 'Reloading…');
    } else {
      tell(state, weapon.name + ' is dry — no reserve ammo.');
    }
    return;
  }
  weapon.mag -= 1;
  state.stats.shotsFired += 1;
  driver.shootTimer = weapon.cooldown;
  if (audio) audio.shot();
  const range = weapon.id === 'sniper' ? 120 : COMBAT.range;
  const best = pickTarget(state, camYaw, range);
  if (best === null) return;
  if (best.kind === 'ped') {
    knockPedDown(best.ref);
    credit(state, 15);
    addWanted(state, 1, audio);
    tell(state, 'Pedestrian down. +$15');
    return;
  }
  const car = best.ref;
  if (weapon.id === 'rpg') {
    detonateRpg(state, car, audio);
    return;
  }
  damageCar(car, weapon.damage);
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

function swingFist(state, audio) {
  const driver = state.player;
  if (driver.punchTimer > 0) return;
  driver.punchTimer = 0.5;
  if (audio) audio.punch();
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - driver.x, ped.z - driver.z) >= 2.2) continue;
    knockPedDown(ped);
    credit(state, 15);
    addWanted(state, 1, audio);
    tell(state, 'Knocked out! +$15');
    return;
  }
}

function releaseCourier(state) {
  if (state.targetCar !== null && state.targetCar !== undefined) return;
  const step = currentStep(state);
  const pos = (step !== null && step.pos) || {x: 104, z: 52};
  const car = makeCar('traffic', 0xeeeeee, pos.x, pos.z, Math.PI / 2, state.rng);
  car.id = 'courier-' + Math.floor(state.rng.next() * 1e9);
  car.name = 'COURIER COMET';
  car.target = true;
  car.damage = 0;
  car.condition = 100;
  car.speed = 10;
  state.cars.push(car);
  state.targetCar = car;
  tell(state, 'Courier spotted — white Comet, north side!');
}

// Advance one step and play the right sting: the mission-complete
// fanfare when a whole mission finished, the pickup blip for a step
// inside one.
function pushMission(state, audio) {
  const result = advanceMission(state);
  if (audio === null || audio === undefined) return result;
  if (result === 'mission') audio.mission();
  else audio.pickup();
  return result;
}

// One handler per step kind. Each gets the state, the audio handle,
// the step itself, Rico, and a "within radius" test — and returns
// nothing; advancing is the handler's job.
let djTurn = 0;

const STEP_HANDLERS = {
  goto(state, audio, step, driver, within) {
    if (step.anyCar) {
      if (driver.car) {
        advanceMission(state);
        if (audio) audio.mission();
      }
      return;
    }
    if (within(step.pos, 6)) pushMission(state, audio);
  },
  timed(state, audio, step, driver, within) {
    if (within(step.pos, 6)) pushMission(state, audio);
  },
  collect(state, audio, step, driver, within) {
    const spots = step.spots || [];
    const spot = spots[state.missionCollected || 0];
    if (spot === undefined || !within(spot, 4)) return;
    state.missionCollected += 1;
    credit(state, 25);
    if (audio) audio.pickup();
    tell(state, 'Package ' + state.missionCollected + '/' + step.count + ' collected. +$25');
    if (state.missionCollected >= step.count && advanceMission(state) === 'mission' && audio) audio.mission();
  },
  wanted(state, audio, step, driver) {
    if (driver.wanted >= step.stars) {
      advanceMission(state);
      if (audio) audio.pickup();
    }
  },
  pickup(state, audio, step, driver, within) {
    if (!within(step.pos, 4)) return;
    state.passenger = true;
    advanceMission(state);
    if (audio) audio.pickup();
    tell(state, 'Passenger aboard. Drive carefully.');
  },
  deliver(state, audio, step, driver, within) {
    if (!state.passenger || !within(step.pos, 6)) return;
    state.passenger = false;
    if (advanceMission(state) === 'mission' && audio) audio.mission();
  },
  hold(state, audio, step, driver, within) {
    if (!within(step.pos, 5)) {
      state.missionHold = Math.max(0, state.missionHold - 1 / 60);
      return;
    }
    state.missionHold += 1 / 60;
    if (driver.wanted < 4) {
      driver.wanted = 4;
      driver.crimeTimer = 0;
    }
    if (state.missionHold < step.seconds) return;
    credit(state, 200);
    if (advanceMission(state) === 'mission' && audio) audio.mission();
    tell(state, 'Vault cracked! +$200 — run!');
  },
  race(state, audio, step, driver, within) {
    const checkpoints = step.checkpoints || [];
    const cp = checkpoints[state.raceIndex || 0];
    if (cp === undefined || !within(cp, 7)) return;
    state.raceIndex += 1;
    if (audio) audio.pickup();
    tell(state, 'Gate ' + state.raceIndex + '/' + checkpoints.length + '!');
    if (state.raceIndex >= checkpoints.length && advanceMission(state) === 'mission' && audio) audio.mission();
  },
  ram(state, audio) {
    releaseCourier(state);
    const t = state.targetCar;
    if (t === null || t === undefined || !(t.disabled || (t.damage || 0) >= 100)) return;
    credit(state, 150);
    tell(state, 'Courier stopped! Cargo secured. +$150');
    if (advanceMission(state) === 'mission' && audio) audio.mission();
  },
  eliminate(state, audio, step) {
    if ((state.eliminated || 0) >= step.count && advanceMission(state) === 'mission' && audio) audio.mission();
  },
};

function driveMission(state, audio) {
  const mission = currentMission(state);
  const step = currentStep(state);
  if (mission === null || step === null) return;
  const driver = state.player;
  const within = (pos, radius) => pos !== null && pos !== undefined && Math.hypot(driver.x - pos.x, driver.z - pos.z) < radius;
  const handle = STEP_HANDLERS[step.kind];
  if (handle) handle(state, audio, step, driver, within);
}

// A finished reload tops the magazine up from the reserve.
function finishReload(state) {
  const w = currentWeapon(state);
  const magSize = WEAPONS[state.player.weaponIndex].mag;
  const loaded = Math.min(magSize - w.mag, w.ammo);
  w.mag += loaded;
  w.ammo -= loaded;
}

// Clocks and cooldowns: world time, weapon timers, reload, crime and
// crew cooldowns, the mission timer, and ageing visual effects.
function advanceClocks(state, dt) {
  const driver = state.player;
  state.time += dt;
  state.stats.timePlayed += dt;
  const lastX = state.stats.lastX === null || state.stats.lastX === undefined ? driver.x : state.stats.lastX;
  const lastZ = state.stats.lastZ === null || state.stats.lastZ === undefined ? driver.z : state.stats.lastZ;
  const travelled = Math.hypot(driver.x - lastX, driver.z - lastZ);
  state.stats.distanceKm += travelled / 1000;
  state.stats.lastX = driver.x;
  state.stats.lastZ = driver.z;
  state.clockMinutes += dt / 10;
  state.events = [];
  driver.shootTimer = Math.max(0, driver.shootTimer - dt);
  driver.punchTimer = Math.max(0, driver.punchTimer - dt);
  if (driver.reloadTimer > 0) {
    driver.reloadTimer -= dt;
    if (driver.reloadTimer <= 0) finishReload(state);
  }
  driver.crimeTimer += dt;
  for (const key of Object.keys(driver.crew)) {
    const left = driver.crew[key] - dt;
    driver.crew[key] = left > 0 ? left : 0;
  }
  if (driver.eyesTimer > 0) driver.eyesTimer -= dt;
  if (state.dialogue !== null && state.dialogue !== undefined && state.dialogue.timer > 0) {
    state.dialogue.timer -= dt;
  }
  const step = currentStep(state);
  const timedOut = step !== null && (step.kind === 'race' || step.kind === 'timed') && step.seconds;
  if (timedOut) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      startStep(state);
      tell(state, 'Out of time — the job resets. Try again.');
    }
  }
  for (let i = 0; i < state.fx.length; i += 1) state.fx[i].t += dt;
  state.fx = state.fx.filter((fx) => fx.t < 1.2);
}

// Weapon switching: number keys 1–7, Q cycles owned weapons, C changes radio.
function handleArsenalKeys(state, input, audio) {
  const driver = state.player;
  for (let slot = 0; slot < 7; slot += 1) {
    if (!input.wasPressed('w' + (slot + 1))) continue;
    const w = driver.weapons[slot];
    if (w.owned) {
      driver.weaponIndex = slot;
      tell(state, w.name + ' equipped.');
    } else {
      tell(state, w.name + ' is locked — reach ' + w.unlockRp + ' RP.');
    }
  }
  if (input.wasPressed('cycleWeapon')) {
    const owned = [];
    for (let i = 0; i < driver.weapons.length; i += 1) {
      if (driver.weapons[i].owned) owned.push(i);
    }
    const at = owned.indexOf(driver.weaponIndex);
    driver.weaponIndex = owned[(at + 1) % owned.length];
    tell(state, currentWeapon(state).name + ' equipped.');
  }
  if (input.wasPressed('radio')) {
    driver.radioStation = (driver.radioStation + 1) % RADIO.length;
    if (audio) audio.setRadio(driver.radioStation);
    const station = RADIO[driver.radioStation];
    tell(state, '♪ ' + station.name + ' — ' + station.genre);
    if (station.lines && station.lines.length > 0) {
      const line = station.lines[djTurn % station.lines.length];
      djTurn += 1;
      sayLine(state, line, station.dj, 'DJ');
    }
  }
}

// Crew abilities: Z plates, X roadside repair, V police-vision.
function handleCrewKeys(state, input) {
  const driver = state.player;
  if (input.wasPressed('plates') && driver.crew.plates <= 0) {
    if (driver.wanted > 0) {
      driver.wanted = Math.max(0, driver.wanted - 1);
      driver.crew.plates = CREW[0].cooldown;
      tell(state, 'Mira swapped the plates — one star gone.');
    } else {
      tell(state, 'No heat to lose right now.');
    }
  }
  if (input.wasPressed('fix') && driver.crew.fix <= 0) {
    const needsCar = driver.car === null || driver.car === undefined;
    const needsCash = driver.car && (driver.car.condition || 100) < 100 && driver.cash >= 50;
    if (needsCar) {
      tell(state, 'Quick Fix needs a car.');
    } else if (needsCash) {
      debit(state, 50);
      repairCar(driver.car);
      driver.crew.fix = CREW[1].cooldown;
      tell(state, 'Lio patched the car up. -$50');
    }
  }
  if (input.wasPressed('eyes') && driver.crew.eyes <= 0) {
    driver.eyesTimer = 10;
    driver.crew.eyes = CREW[2].cooldown;
    tell(state, "Kiki's eyes are out — police revealed.");
  }
}

// Traffic cars drive their roads; the courier target car just drives
// its own route. A car with a car ahead of it brakes instead of
// rear-ending it.
function flowTraffic(state, dt) {
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car.kind !== 'traffic') continue;
    if (car === state.targetCar) {
      stepTrafficCar(car, dt, state.rng);
      continue;
    }
    if (car.stalled > 0) {
      car.stalled -= dt;
      continue;
    }
    let blocked = false;
    for (let j = 0; j < state.cars.length; j += 1) {
      const other = state.cars[j];
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
      const side = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
      if (along > 0 && along < 9 && side < 3) {
        blocked = true;
        break;
      }
    }
    const cruiseSpeed = car.speed;
    if (blocked) car.speed = Math.max(0, car.speed - 8 * dt);
    stepTrafficCar(car, dt, state.rng);
    if (blocked) car.speed = cruiseSpeed;
  }
}

// Police: dispatch units, roadblocks and the helicopter, then step
// each cruiser. A ram dents the player, it does not delete them:
// total ram damage is capped so a pile-up is survivable and escapable.
function runPolice(state, dt, collide, audio) {
  const driver = state.player;
  dispatchCruisers(state, audio);
  holdRoadblocks(state);
  orbitHeli(state);
  let copTouching = false;
  let ramCount = 0;
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car.kind !== 'police' || car.disabled || car.roadblock) continue;
    const hit = stepPoliceCar(car, driver.x, driver.z, dt, collide);
    if (hit) {
      copTouching = true;
      if (driver.car) ramCount += 1;
      else driver.bustedTimer += dt;
    }
    if (car.damage >= 100) wreckCruiser(state, car, audio);
  }
  if (ramCount > 0 && driver.car) {
    const armorCut = 1 - 0.25 * driver.garage.armor;
    driver.health -= Math.min(3, ramCount * 1.0) * dt * armorCut;
    driver.car.condition = Math.max(0, (driver.car.condition ?? 100) - ramCount * 0.4 * dt);
  }
  if (!copTouching && driver.onFoot) driver.bustedTimer = Math.max(0, driver.bustedTimer - dt * 2);
  if (driver.bustedTimer >= WANTED.bustSeconds) {
    state.busted = true;
    penalize(state, 150);
    driver.wanted = 0;
  }
}

// Ambient life: pedestrians flee danger, cash pickups respawn, wanted
// decays when Rico stays clean, and health slowly regenerates out of
// trouble.
function runStreetLife(state, dt, audio) {
  const driver = state.player;
  const speeding = driver.car !== null && driver.car !== undefined && Math.abs(driver.car.speed) > 4;
  const threat = (driver.wanted > 0 || driver.car) && speeding ? {x: driver.x, z: driver.z} : null;
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    const nearThreat = threat !== null && Math.hypot(ped.x - threat.x, ped.z - threat.z) < 18;
    stepPed(ped, dt, state.rng, nearThreat ? threat : null);
  }
  for (let i = 0; i < state.pickups.length; i += 1) {
    const pickup = state.pickups[i];
    if (pickup.taken) {
      pickup.respawn -= dt;
      if (pickup.respawn <= 0) pickup.taken = false;
      continue;
    }
    if (Math.hypot(pickup.x - driver.x, pickup.z - driver.z) < 2.5) {
      pickup.taken = true;
      pickup.respawn = 60;
      credit(state, 25);
      awardRp(state, 5);
      if (audio) audio.pickup();
      tell(state, 'Cash found! +$25');
    }
  }
  if (driver.health < 30 && driver.health > 0) flashTip(state, 'health');
  const nearGarage = Math.hypot(driver.x + 130, driver.z + 130) < 12;
  if (!state.garageOpen && nearGarage) flashTip(state, 'garage');
  if (driver.crimeTimer > WANTED.decayDelay) {
    driver.decayTimer += dt;
    if (driver.decayTimer >= WANTED.decayInterval && driver.wanted > 0) {
      driver.wanted -= 1;
      driver.decayTimer = 0;
      if (driver.wanted === 0 && audio) audio.siren(false);
    }
  } else {
    driver.decayTimer = 0;
  }
  if (driver.wanted === 0 && driver.health < PLAYER.maxHealth) {
    driver.health = Math.min(PLAYER.maxHealth, driver.health + 2 * dt);
  }
  if (driver.health <= 0) {
    state.wasted = true;
    penalize(state, 100);
  }
}

// Pedestrians the player's car clips at speed go down — and it is a crime.
function checkPedStrikes(state, audio, speedBefore) {
  const driver = state.player;
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (ped.state === 'down') continue;
    const near = Math.hypot(ped.x - driver.x, ped.z - driver.z) < 2;
    if (!near || speedBefore <= 5) continue;
    knockPedDown(ped);
    state.stats.pedsDown += 1;
    addWanted(state, 1, audio);
    tell(state, 'You hit a pedestrian!');
  }
}

// Car-to-car bumps: separate the two cars, trade speed for damage, and
// let the mission and police logic react to what got hit.
function resolveBumps(state, collide, audio) {
  const driver = state.player;
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car === driver.car || car.kind === 'player') continue;
    const d = Math.hypot(car.x - driver.x, car.z - driver.z);
    if (d >= 3.4 || d <= 0.01) continue;
    const shove = (3.4 - d) / 2;
    const nx = (car.x - driver.x) / d;
    const nz = (car.z - driver.z) / d;
    if (car.kind === 'police') {
      // A police ram bounces the cruiser off instead of shoving Rico
      // sideways off the road — the player keeps their line, the cop
      // loses the shove. Traffic still gets shoved, as before.
      car.x += nx * shove * 2;
      car.z += nz * shove * 2;
    } else {
      car.x += nx * shove;
      car.z += nz * shove;
      const backX = driver.car.x - nx * shove;
      const backZ = driver.car.z - nz * shove;
      if (!collide(backX, backZ, CAR.radius)) {
        driver.car.x = backX;
        driver.car.z = backZ;
        driver.x = driver.car.x;
        driver.z = driver.car.z;
      }
    }
    const impact = Math.abs(driver.car.speed) + Math.abs(car.speed || 0);
    driver.car.speed *= 0.6;
    const wear = (driver.car.condition ?? 100) - impact * 0.15;
    driver.car.condition = Math.max(0, wear);
    if (car.kind === 'traffic') car.speed = Math.max(0, car.speed - 4);
    if (car === state.targetCar) {
      damageCar(car, impact * 1.6);
      spawnFx(state, car.x, 1, car.z, 'crash');
      if (car.damage >= 100 && !car.disabled) {
        car.disabled = true;
        car.speed = 0;
        spawnFx(state, car.x, 1.5, car.z, 'explosion');
      }
    }
    if (car.kind === 'police') {
      damageCar(car, impact * 0.8);
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

// Driving and walking: the car physics or the on-foot step, plus
// shooting, punching and the reload key. Garage and job-list toggles
// live in main.js: they must work while the world is frozen behind
// their overlays.
function moveRico(ctx) {
  const state = ctx.state;
  const input = ctx.input;
  const dt = ctx.dt;
  const audio = ctx.audio;
  const camYaw = ctx.camYaw;
  const collide = ctx.collide;
  const driver = state.player;
  if (driver.car === null || driver.car === undefined) {
    stepPlayerOnFoot(driver, input, dt, camYaw, collide);
    if (input.takeShoot()) shoot(state, camYaw, audio);
    if (input.wasPressed('punch')) swingFist(state, audio);
  } else {
    const speedBefore = Math.abs(driver.car.speed);
    const hardHit = stepPlayerCar(driver.car, input, dt, collide, driver.garage.tune);
    if (hardHit) {
      const wear = (driver.car.condition ?? 100) - 4;
      driver.car.condition = Math.max(0, wear);
      spawnFx(state, driver.car.x, 1, driver.car.z, 'crash');
      if (audio) audio.crash();
    }
    driver.x = driver.car.x;
    driver.z = driver.car.z;
    driver.angle = driver.car.angle;
    checkPedStrikes(state, audio, speedBefore);
    resolveBumps(state, collide, audio);
  }
  const weapon = currentWeapon(state);
  const magFull = weapon.mag >= WEAPONS[state.player.weaponIndex].mag;
  if (input.wasPressed('reload') && !magFull && driver.reloadTimer <= 0) {
    driver.reloadTimer = COMBAT.reloadSeconds;
  }
}

// The living city: the sky turns, the trams loop, and hidden stashes
// pay out when Rico walks over them. None of this touches missions or
// wanted levels — it is the city breathing around the story.
function breatheCity(state, dt, audio) {
  const skyChanged = tickWeather(state.weather, dt, state.clockMinutes, state.rng);
  if (skyChanged && state.weather.kind !== 'clear') {
    tell(state, weatherChatter(state.weather.kind));
  }
  tickTram(state.tram, dt);
  const found = sweepStashes(state.stashes, state.player.x, state.player.z);
  for (const stash of found) {
    credit(state, STASH_REWARD_CASH);
    awardRp(state, STASH_REWARD_RP);
    tell(state, `Hidden stash found! +$${STASH_REWARD_CASH} (+${STASH_REWARD_RP} RP)`);
    spawnFx(state, stash.x, 1.2, stash.z, 'pickup');
    if (audio) audio.pickup();
  }
}

// The simulation is a pipeline of systems, run in order every fixed
// step. Each one takes the same context object — state, input, dt,
// audio, camera yaw and the collision test — so the order is data,
// not a long function body.
const PIPELINE = [
  {name: 'clocks', run: (ctx) => advanceClocks(ctx.state, ctx.dt)},
  {name: 'enterExit', run: (ctx) => {
    if (ctx.input.wasPressed('enter')) {
      if (ctx.state.player.car) climbOut(ctx.state);
      else climbIn(ctx.state, ctx.audio);
    }
  }},
  {name: 'weapons', run: (ctx) => handleArsenalKeys(ctx.state, ctx.input, ctx.audio)},
  {name: 'crew', run: (ctx) => handleCrewKeys(ctx.state, ctx.input)},
  {name: 'drive', run: (ctx) => moveRico(ctx)},
  {name: 'traffic', run: (ctx) => flowTraffic(ctx.state, ctx.dt)},
  {name: 'police', run: (ctx) => runPolice(ctx.state, ctx.dt, ctx.collide, ctx.audio)},
  {name: 'ambient', run: (ctx) => runStreetLife(ctx.state, ctx.dt, ctx.audio)},
  {name: 'missions', run: (ctx) => {
    driveMission(ctx.state, ctx.audio);
    unlockWeapons(ctx.state);
  }},
  {name: 'worldLife', run: (ctx) => breatheCity(ctx.state, ctx.dt, ctx.audio)},
  {name: 'autosave', run: (ctx) => {
    ctx.state.saveTimer += ctx.dt;
    if (ctx.state.saveTimer > 15) {
      ctx.state.saveTimer = 0;
      saveGame(ctx.state);
    }
  }},
];

// One fixed simulation step.
export function stepWorld(state, input, dt, audio, camYaw) {
  const collide = (x, z, r) => {
    if (Math.abs(x) > CITY.half || z > CITY.beachZ + 24 || z < -CITY.half) return true;
    return circleHitsBox(x, z, r, state.colliders);
  };
  const ctx = {state, input, dt, audio, camYaw, collide};
  for (const system of PIPELINE) system.run(ctx);
  return state.events;
}

// The garage shelf: each purchase names its price, the message when
// Rico cannot afford it, a check that returns a problem string or
// null, the effect, and the success line for the HUD.
const GARAGE_MENU = [
  {
    id: 'repair', price: 100, shortage: 'repair costs $100',
    guard: (driver) => !driver.car ? 'Repair needs a car.'
      : (driver.car.condition ?? 100) >= 100 ? 'Car is already in perfect shape.' : null,
    apply: (state, driver) => repairCar(driver.car),
    note: () => 'Repaired to 100% condition.',
  },
  {
    id: 'tune', price: 400, shortage: 'engine tune costs $400',
    guard: (driver) => driver.garage.tune >= 3 ? 'Engine is maxed out (Tune 3).' : null,
    apply: (state, driver) => { driver.garage.tune += 1; },
    note: (driver) => `Engine tuned to level ${driver.garage.tune} — faster top speed.`,
  },
  {
    id: 'armor', price: 300, shortage: 'armour costs $300',
    guard: (driver) => driver.garage.armor >= 2 ? 'Armour is maxed out.' : null,
    apply: (state, driver) => { driver.garage.armor += 1; },
    note: (driver) => `Armour fitted (level ${driver.garage.armor}) — rams hurt less.`,
  },
  {
    id: 'ammo', price: 80, shortage: 'ammo costs $80',
    guard: (driver, state) => currentWeapon(state).id === 'fists' ? 'Fists need no ammo.' : null,
    apply: (state, driver) => {
      const w = currentWeapon(state);
      w.ammo += w.mag * 2;
    },
    note: (driver, state) => `Bought ammo for the ${currentWeapon(state).name}.`,
  },
];

// Garage purchases. Returns a message for the HUD, or null if it failed.
export function buyGarage(state, kind) {
  const driver = state.player;
  const item = GARAGE_MENU.find((entry) => entry.id === kind);
  if (!item) return null;
  const problem = item.guard(driver, state);
  if (problem) return problem;
  if (driver.cash < item.price) return `Not enough cash — ${item.shortage}.`;
  debit(state, item.price);
  item.apply(state, driver);
  return item.note(driver, state);
}

// Read and write a dotted path ('player.cash') on the state object.
function readPath(obj, path) {
  let cursor = obj;
  for (const key of path.split('.')) {
    if (cursor == null) return cursor;
    cursor = cursor[key];
  }
  return cursor;
}
function writePath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = obj;
  for (const key of keys) target = target[key];
  target[last] = value;
}

// The save file, as [key, path, fallback] rows.
// 'keep' means the current value (a fresh game keeps its own cash and spot).
const SAVE_ROWS = [
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
    for (const [key, path] of SAVE_ROWS) data[key] = readPath(state, path);
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
  if (save === null || save === undefined) return;
  for (const [key, path, fallback] of SAVE_ROWS) {
    const base = fallback === 'keep' ? readPath(state, path) : fallback;
    const stored = save[key];
    const value = stored === undefined || stored === null ? base : stored;
    writePath(state, path, key === 'allMissionsDone' ? !!value : value);
  }
  if (save.garage) state.player.garage = {...state.player.garage, ...save.garage};
  if (Array.isArray(save.weapons)) {
    for (let i = 0; i < save.weapons.length; i += 1) {
      const sw = save.weapons[i];
      const w = state.player.weapons[i];
      if (w === undefined || sw === undefined || sw === null) continue;
      w.owned = !!sw.owned;
      w.ammo = sw.ammo === undefined || sw.ammo === null ? 0 : sw.ammo;
      w.mag = sw.mag === undefined || sw.mag === null ? w.mag : sw.mag;
    }
  }
  state.districtHeat = save.districtHeat === undefined || save.districtHeat === null ? {} : save.districtHeat;
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
