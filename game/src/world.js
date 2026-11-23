// The world: everything that happens in Solmar Bay — driving, walking,
// traffic, pedestrians, police, wanted levels, combat, missions, pickups,
// radio, respect, crew abilities, the police helicopter, roadblocks and
// saving. The renderer only paints this state; it never decides it.
import { CAR, CAR_NAMES, CITY, COMBAT, CREW, MISSIONS, PEDS, PLAYER, RADIO, TRAFFIC, WANTED, WEAPONS, districtAt } from './config.js';
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
      state.events.push({type: 'message', text: `Unlocked: ${w.name}! Press ${state.player.weapons.indexOf(w) + 1} to equip.`});
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
  state.events.push({type: 'message', text: 'Roadblock ahead! The SBPD sealed the road.'});
}

function flyChopper(state) {
  const rico = state.player;
  const heli = state.heli;
  if (rico.wanted >= 3 && !heli.active) {
    heli.active = true;
    heli.x = rico.x + 40;
    heli.z = rico.z - 40;
    heli.y = 42;
    state.events.push({type: 'message', text: 'Air One has you in the light!'});
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
    state.events.push({type: 'message', text: 'Car stolen! The cops are on you.'});
  }
  if (car.kind === 'police') {
    addWanted(state, 2, audio);
    state.events.push({type: 'message', text: 'You stole a police cruiser!'});
  }
  car.kind = 'player';
  rico.car = car;
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
  spawnFx(state, car.x, 1, car.z, 'explosion');
  state.player.cash += 50;
  state.player.rp += 25;
  unlockWeapons(state);
  state.events.push({type: 'message', text: 'Police car disabled! +$50'});
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
      state.events.push({type: 'message', text: 'Reloading…'});
    } else {
      state.events.push({type: 'message', text: `${weapon.name} is dry — no reserve ammo.`});
    }
    return;
  }
  weapon.mag -= 1;
  rico.shootTimer = weapon.cooldown;
  if (audio) audio.shot();
  const range = weapon.id === 'sniper' ? 120 : COMBAT.range;
  const best = pickTarget(state, camYaw, range);
  if (!best) return;
  if (best.kind === 'ped') {
    knockPedDown(best.ref);
    state.player.cash += 15;
    addWanted(state, 1, audio);
    state.events.push({type: 'message', text: 'Pedestrian down. +$15'});
    return;
  }
  const car = best.ref;
  if (weapon.id === 'rpg') {
    detonateRpg(state, car, audio);
    return;
  }
  car.damage = (car.damage || 0) + weapon.damage;
  car.condition = Math.max(0, 100 - (car.damage || 0));
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
      rico.cash += 15;
      addWanted(state, 1, audio);
      state.events.push({type: 'message', text: 'Knocked out! +$15'});
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
  state.events.push({type: 'message', text: 'Courier spotted — white Comet, north side!'});
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

function tickSteps(state, audio) {
  const mission = currentMission(state);
  const step = currentStep(state);
  if (!mission || !step) return;
  const rico = state.player;
  const within = (pos, radius) => pos && Math.hypot(rico.x - pos.x, rico.z - pos.z) < radius;
  switch (step.kind) {
    case 'goto':
      if (step.anyCar) {
        if (rico.car) {
          advanceMission(state);
          if (audio) audio.mission();
        }
      } else if (within(step.pos, 6)) {
        advanceStep(state, audio);
      }
      return;
    case 'timed':
      if (within(step.pos, 6)) advanceStep(state, audio);
      return;
    case 'collect': {
      const spots = step.spots || [];
      const spot = spots[state.missionCollected || 0];
      if (!spot || !within(spot, 4)) return;
      state.missionCollected += 1;
      rico.cash += 25;
      if (audio) audio.pickup();
      state.events.push({type: 'message', text: `Package ${state.missionCollected}/${step.count} collected. +$25`});
      if (state.missionCollected >= step.count) {
        if (advanceMission(state) === 'mission' && audio) audio.mission();
      }
      return;
    }
    case 'wanted':
      if (rico.wanted >= step.stars) {
        advanceMission(state);
        if (audio) audio.pickup();
      }
      return;
    case 'pickup':
      if (!within(step.pos, 4)) return;
      state.passenger = true;
      advanceMission(state);
      if (audio) audio.pickup();
      state.events.push({type: 'message', text: 'Passenger aboard. Drive carefully.'});
      return;
    case 'deliver':
      if (state.passenger && within(step.pos, 6)) {
        state.passenger = false;
        if (advanceMission(state) === 'mission' && audio) audio.mission();
      }
      return;
    case 'hold':
      if (within(step.pos, 5)) {
        state.missionHold += 1 / 60;
        if (rico.wanted < 4) {
          rico.wanted = 4;
          rico.crimeTimer = 0;
        }
        if (state.missionHold >= step.seconds) {
          rico.cash += 200;
          if (advanceMission(state) === 'mission' && audio) audio.mission();
          state.events.push({type: 'message', text: 'Vault cracked! +$200 — run!'});
        }
      } else {
        state.missionHold = Math.max(0, state.missionHold - 1 / 60);
      }
      return;
    case 'race': {
      const checkpoints = step.checkpoints || [];
      const cp = checkpoints[state.raceIndex || 0];
      if (!cp || !within(cp, 7)) return;
      state.raceIndex += 1;
      if (audio) audio.pickup();
      state.events.push({type: 'message', text: `Gate ${state.raceIndex}/${checkpoints.length}!`});
      if (state.raceIndex >= checkpoints.length) {
        if (advanceMission(state) === 'mission' && audio) audio.mission();
      }
      return;
    }
    case 'ram': {
      spawnCourier(state);
      const t = state.targetCar;
      if (!t || !(t.disabled || (t.damage || 0) >= 100)) return;
      rico.cash += 150;
      state.events.push({type: 'message', text: 'Courier stopped! Cargo secured. +$150'});
      if (advanceMission(state) === 'mission' && audio) audio.mission();
      return;
    }
    case 'eliminate':
      if ((state.eliminated || 0) >= step.count) {
        if (advanceMission(state) === 'mission' && audio) audio.mission();
      }
      return;
    default:
      return;
  }
}

// Clocks and cooldowns: world time, weapon timers, reload, crime and crew
// cooldowns, the mission timer, and ageing visual effects.
function stepTimers(state, dt) {
  const rico = state.player;
  state.time += dt;
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
      state.events.push({type: 'message', text: 'Out of time — the job resets. Try again.'});
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
      state.events.push({type: 'message', text: `${w.name} equipped.`});
    } else {
      state.events.push({type: 'message', text: `${w.name} is locked — reach ${w.unlockRp} RP.`});
    }
  }
  if (input.wasPressed('cycleWeapon')) {
    const owned = rico.weapons.map((w, i) => (w.owned ? i : -1)).filter((i) => i >= 0);
    const at = owned.indexOf(rico.weaponIndex);
    rico.weaponIndex = owned[(at + 1) % owned.length];
    state.events.push({type: 'message', text: `${currentWeapon(state).name} equipped.`});
  }
  if (input.wasPressed('radio')) {
    rico.radioStation = (rico.radioStation + 1) % RADIO.length;
    if (audio) audio.setRadio(rico.radioStation);
    state.events.push({type: 'message', text: `♪ ${RADIO[rico.radioStation].name} — ${RADIO[rico.radioStation].genre}`});
  }
}

// Crew abilities: Z plates, X roadside repair, V police-vision.
function handleCrewKeys(state, input) {
  const rico = state.player;
  if (input.wasPressed('plates') && rico.crew.plates <= 0) {
    if (rico.wanted > 0) {
      rico.wanted = Math.max(0, rico.wanted - 1);
      rico.crew.plates = CREW[0].cooldown;
      state.events.push({type: 'message', text: 'Mira swapped the plates — one star gone.'});
    } else {
      state.events.push({type: 'message', text: 'No heat to lose right now.'});
    }
  }
  if (input.wasPressed('fix') && rico.crew.fix <= 0) {
    if (rico.car && (rico.car.condition || 100) < 100 && rico.cash >= 50) {
      rico.cash -= 50;
      rico.car.condition = 100;
      rico.car.damage = 0;
      rico.crew.fix = CREW[1].cooldown;
      state.events.push({type: 'message', text: 'Lio patched the car up. -$50'});
    } else if (!rico.car) {
      state.events.push({type: 'message', text: 'Quick Fix needs a car.'});
    }
  }
  if (input.wasPressed('eyes') && rico.crew.eyes <= 0) {
    rico.eyesTimer = 10;
    rico.crew.eyes = CREW[2].cooldown;
    state.events.push({type: 'message', text: "Kiki's eyes are out — police revealed."});
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
    rico.cash = Math.max(0, rico.cash - 150);
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
      rico.cash += 25;
      rico.rp += 5;
      if (audio) audio.pickup();
      state.events.push({type: 'message', text: 'Cash found! +$25'});
    }
  }
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
    rico.cash = Math.max(0, rico.cash - 100);
  }
}


// One fixed simulation step.
export function stepWorld(state, input, dt, audio, camYaw) {
  const rico = state.player;
  stepTimers(state, dt);

  const collide = (x, z, r) => {
    if (Math.abs(x) > CITY.half || z > CITY.beachZ + 24 || z < -CITY.half) return true;
    return hitsBlock(x, z, r, state.colliders);
  };

  if (input.wasPressed('enter')) {
    if (rico.car) climbOut(state);
    else climbIn(state, audio);
  }

  handleWeaponKeys(state, input, audio);
  handleCrewKeys(state, input);
  // Garage and job-list toggles live in main.js: they must work while the
  // world is frozen behind their overlays.

  if (rico.car) {
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
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - rico.x, ped.z - rico.z) < 2 && beforeSpeed > 5) {
        knockPedDown(ped);
        addWanted(state, 1, audio);
        state.events.push({type: 'message', text: 'You hit a pedestrian!'});
      }
    }
    // Car-to-car bumps.
    for (const car of state.cars) {
      if (car === rico.car || car.kind === 'player') continue;
      const d = Math.hypot(car.x - rico.x, car.z - rico.z);
      if (d < 3.4 && d > 0.01) {
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
          car.damage = (car.damage || 0) + impact * 1.6;
          car.condition = Math.max(0, 100 - car.damage);
          spawnFx(state, car.x, 1, car.z, 'crash');
          if (car.damage >= 100 && !car.disabled) {
            car.disabled = true;
            car.speed = 0;
            spawnFx(state, car.x, 1.5, car.z, 'explosion');
          }
        }
        if (car.kind === 'police') {
          car.damage = (car.damage || 0) + impact * 0.8;
          car.condition = Math.max(0, 100 - (car.damage || 0));
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
  } else {
    stepPlayerOnFoot(rico, input, dt, camYaw, collide);
    if (input.takeShoot()) openFire(state, camYaw, audio);
    if (input.wasPressed('punch')) throwPunch(state, audio);
  }
  if (input.wasPressed('reload') && currentWeapon(state).mag < WEAPONS[state.weaponIndex].mag && rico.reloadTimer <= 0) {
    rico.reloadTimer = COMBAT.reloadSeconds;
  }
// Traffic: each car follows its road, braking when something is ahead.
  // Traffic.
  stepTrafficCars(state, dt);

  // Police.
  stepPoliceForce(state, dt, collide, audio);

  // Pedestrians, pickups, wanted decay and health.
  stepAmbient(state, dt, audio);

  tickSteps(state, audio);
  unlockWeapons(state);

  // Periodic autosave.
  state.saveTimer += dt;
  if (state.saveTimer > 15) {
    state.saveTimer = 0;
    saveGame(state);
  }
  return state.events;
}

// Garage purchases. Returns a message for the HUD, or null if it failed.
export function buyGarage(state, kind) {
  const rico = state.player;
  const g = rico.garage;
  if (kind === 'repair') {
    if (!rico.car) return 'Repair needs a car.';
    if ((rico.car.condition ?? 100) >= 100) return 'Car is already in perfect shape.';
    if (rico.cash < 100) return 'Not enough cash — repair costs $100.';
    rico.cash -= 100;
    rico.car.condition = 100;
    rico.car.damage = 0;
    return 'Repaired to 100% condition.';
  }
  if (kind === 'tune') {
    if (g.tune >= 3) return 'Engine is maxed out (Tune 3).';
    if (rico.cash < 400) return 'Not enough cash — engine tune costs $400.';
    rico.cash -= 400;
    g.tune += 1;
    return `Engine tuned to level ${g.tune} — faster top speed.`;
  }
  if (kind === 'armor') {
    if (g.armor >= 2) return 'Armour is maxed out.';
    if (rico.cash < 300) return 'Not enough cash — armour costs $300.';
    rico.cash -= 300;
    g.armor += 1;
    return `Armour fitted (level ${g.armor}) — rams hurt less.`;
  }
  if (kind === 'ammo') {
    const w = currentWeapon(state);
    if (w.id === 'fists') return 'Fists need no ammo.';
    if (rico.cash < 80) return 'Not enough cash — ammo costs $80.';
    rico.cash -= 80;
    w.ammo += w.mag * 2;
    return `Bought ammo for the ${w.name}.`;
  }
  return null;
}

export function saveGame(state) {
  try {
    const data = {
      cash: state.player.cash,
      rp: state.player.rp,
      missionIndex: state.missionIndex,
      missionStep: state.missionStep,
      x: state.player.x,
      z: state.player.z,
      allMissionsDone: state.allMissionsDone,
      radioStation: state.player.radioStation,
      garage: state.player.garage,
      weapons: state.player.weapons.map((w) => ({owned: w.owned, ammo: w.ammo, mag: w.mag})),
      weaponIndex: state.player.weaponIndex,
      districtHeat: state.districtHeat,
    };
    window.localStorage.setItem('solmar-bay.save.v1', JSON.stringify(data));
  } catch {
    // storage unavailable — the game still runs, it just cannot save
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
  state.player.cash = save.cash ?? state.player.cash;
  state.player.rp = save.rp ?? 0;
  state.missionIndex = save.missionIndex ?? 0;
  state.missionStep = save.missionStep ?? 0;
  state.player.x = save.x ?? state.player.x;
  state.player.z = save.z ?? state.player.z;
  state.allMissionsDone = !!save.allMissionsDone;
  state.player.radioStation = save.radioStation ?? 0;
  if (save.garage) state.player.garage = {...state.player.garage, ...save.garage};
  if (Array.isArray(save.weapons)) {
    save.weapons.forEach((sw, i) => {
      if (!state.player.weapons[i] || !sw) return;
      state.player.weapons[i].owned = !!sw.owned;
      state.player.weapons[i].ammo = sw.ammo ?? 0;
      state.player.weapons[i].mag = sw.mag ?? state.player.weapons[i].mag;
    });
  }
  state.player.weaponIndex = save.weaponIndex ?? 1;
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
