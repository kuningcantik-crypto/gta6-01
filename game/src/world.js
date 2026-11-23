// Dunia Solmar Bay: semua yang terjadi di kota — mengemudi, berjalan
// kaki, lalu lintas, pejalan kaki, polisi, tingkat wanted, perkelahian,
// misi, pickup, radio, respect, kemampuan kru, helikopter polisi,
// roadblock, dan penyimpanan. Renderer hanya melukis state ini; ia
// tidak pernah memutuskan apa pun.
import { BEST_KEY, CAR, CAR_NAMES, CITY, COMBAT, CREW, MISSIONS, PEDS, PLAYER, RADIO, TRAFFIC, WANTED, WEAPONS, districtAt } from './config.js';
import { createRandom } from './random.js';
import { createStashField, sweepStashes, STASH_REWARD_CASH, STASH_REWARD_RP } from './collectibles.js';
import { createWeather, tickWeather, weatherChatter } from './weather.js';
import { createTram, tickTram } from './tram.js';
import { makeCar, placeTrafficCar, stepPlayerCar, stepPoliceCar, stepTrafficCar } from './vehicles.js';
import { knockPedDown, makePed, stepPed } from './pedestrians.js';
import { stepPlayerOnFoot } from './player.js';
import { advanceMission, currentMission, currentStep, sayLine, startStep, stepTarget } from './missions.js';

// Benar bila lingkaran berjari-jari r di (x, z) menyentuh kotak gedung mana pun.
function blocksHit(x, z, r, blocks) {
  for (const block of blocks) {
    const nearX = x < block.x0 ? block.x0 : x > block.x1 ? block.x1 : x;
    const nearZ = z < block.z0 ? block.z0 : z > block.z1 ? block.z1 : z;
    const dx = x - nearX;
    const dz = z - nearZ;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// Callsign unit polisi, dibagikan sesuai urutan spawn supaya panel
// dispatch bisa menampilkan nama, jarak, dan taktik yang nyata.
const UNIT_CALLS = ['KITE-1', 'CORAL-48', 'BARRACUDA-18', 'GULL-8', 'BULWARK-2', 'TIDE-7'];
export function unitName(car) {
  if (car.roadblock) return 'BULWARK-' + (car.unitNo || 2);
  return UNIT_CALLS[(car.unitNo || 0) % UNIT_CALLS.length];
}

function newRico() {
  const arsenal = WEAPONS.map((w) => {
    const copy = {...w};
    copy.owned = w.unlockRp === 0;
    copy.ammo = w.startAmmo || 0;
    copy.mag = w.id === 'fists' ? Infinity : w.mag;
    return copy;
  });
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

const PAINT_PARKED = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x8a5fd9, 0xff7a2b];
const PAINT_FLOW = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x222222, 0x8a5fd9];

// Mobil parkir di pinggir jalan, siap dicuri.
function parkStarterCars(state, rng) {
  const bays = [
    [-44, -100], [60, 60], [8, -52], [-96, 20], [112, -20], [-8, 130], [44, -130],
  ];
  for (let i = 0; i < bays.length; i += 1) {
    const [x, z] = bays[i];
    // Mobil parkir sejajar jalan: arah acak dibulatkan ke mata angin
    // terdekat, supaya mobil curian melaju menyusuri jalan, bukan
    // menyerong ke gedung terdekat.
    const drawn = rng.next() * Math.PI * 2;
    const heading = Math.round(drawn / (Math.PI / 2)) * (Math.PI / 2);
    const car = makeCar('parked', PAINT_PARKED[i % PAINT_PARKED.length], x, z, heading, rng);
    car.id = 'parked-' + state.cars.length;
    car.name = CAR_NAMES[i % CAR_NAMES.length];
    car.condition = 100;
    state.cars.push(car);
  }
}

function seedTraffic(state, rng) {
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const car = makeCar('traffic', PAINT_FLOW[i % PAINT_FLOW.length], 0, 0, 0, rng);
    car.id = 'traffic-' + i;
    car.name = CAR_NAMES[i % CAR_NAMES.length];
    car.condition = 100;
    placeTrafficCar(car, rng);
    state.cars.push(car);
  }
}

function dropCashSpots(state) {
  const spots = [
    [-78, -52], [52, 26], [-26, 104], [104, 0], [-104, 78], [26, -104], [78, 130], [-130, -26],
  ];
  for (const [x, z] of spots) {
    state.pickups.push({x, z, taken: false, respawn: 0});
  }
}

// Angka seumur hidup untuk layar jeda: uang dan respect yang diraih,
// jarak yang ditempuh, dan apa saja yang dihancurkan di jalan.
function newLedger() {
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
    player: newRico(),
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
    stats: newLedger(),
    tipsShown: {},
    stashes: createStashField(rng),
    weather: createWeather(),
    tram: createTram(),
  };
  parkStarterCars(state, rng);
  seedTraffic(state, rng);
  for (let i = 0; i < PEDS.count; i += 1) state.peds.push(makePed(rng));
  dropCashSpots(state);
  return state;
}

export function spawnFx(state, x, y, z, kind) {
  state.fx.push({x, y: y || 1, z, kind, t: 0});
  while (state.fx.length > 24) state.fx.shift();
}

export function addWanted(state, stars, audio) {
  const rico = state.player;
  const before = rico.wanted;
  rico.wanted = Math.min(WANTED.maxStars, rico.wanted + stars);
  rico.crimeTimer = 0;
  const district = districtAt(rico.x, rico.z).name;
  const heat = state.districtHeat[district] || 0;
  state.districtHeat[district] = Math.min(100, heat + stars * 8);
  if (rico.wanted > before && audio) audio.siren(true);
  if (before === 0 && rico.wanted > 0) flashTip(state, 'wanted');
}

// Uang, respect, pesan, dan kerusakan mobil masing-masing berubah di
// tepat satu tempat, supaya ekonomi dan feed event tetap konsisten.
function giveCash(state, amount) {
  state.player.cash += amount;
  state.stats.cashEarned += amount;
}
function spendCash(state, amount) {
  state.player.cash -= amount;
}
function fineCash(state, amount) {
  const left = state.player.cash - amount;
  state.player.cash = left > 0 ? left : 0;
}
function giveRp(state, amount) {
  state.player.rp += amount;
  state.stats.rpEarned += amount;
}
function announce(state, text) {
  state.events.push({type: 'message', text});
}
function hurtCar(car, amount) {
  const total = (car.damage || 0) + amount;
  car.damage = total;
  car.condition = Math.max(0, 100 - total);
  return total;
}
function fixCar(car) {
  car.damage = 0;
  car.condition = 100;
}

// Tips jalanan pertama kali: tiap tips muncul sekali per game, saat
// situasinya pertama kali terjadi, supaya pemain baru belajar tanpa
// layar tutorial yang menghalangi.
const TIP_LINES = [
  {key: 'car', text: 'Cars are faster than feet — but stealing one in front of a cop is a crime.'},
  {key: 'wanted', text: 'Wanted! Break line of sight and the stars fade. Plates (Z) drop one star.'},
  {key: 'weapon', text: 'New guns live in slots 1-7. Q cycles the ones you own.'},
  {key: 'health', text: 'Health is low — find a green cross pickup, or visit the hospital.'},
  {key: 'garage', text: 'Safehouse garage. Press G near here to tune, armour and repair the ride.'},
];
function flashTip(state, key) {
  const tip = TIP_LINES.find((t) => t.key === key);
  if (!tip || state.tipsShown[key]) return;
  state.tipsShown[key] = true;
  announce(state, 'TIP — ' + tip.text);
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
    announce(state, 'Unlocked: ' + w.name + '! Press ' + (i + 1) + ' to equip.');
    flashTip(state, 'weapon');
  }
}

function nearestCar(state, x, z, maxDist) {
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

function sendPatrols(state, audio) {
  const rico = state.player;
  const wanted = Math.min(WANTED.maxPolice, rico.wanted * WANTED.policePerStar);
  let onDuty = 0;
  let totalPolice = 0;
  for (const c of state.cars) {
    if (c.kind !== 'police') continue;
    totalPolice += 1;
    if (!c.disabled && !c.roadblock) onDuty += 1;
  }
  for (let i = onDuty; i < wanted; i += 1) {
    const angle = state.rng.next() * Math.PI * 2;
    const x = rico.x + Math.sin(angle) * 70;
    const z = rico.z + Math.cos(angle) * 70;
    const clampedX = Math.max(-CITY.half, Math.min(CITY.half, x));
    const clampedZ = Math.max(-CITY.half, Math.min(CITY.half, z));
    const car = makeCar('police', 0x1c2b4a, clampedX, clampedZ, angle, state.rng);
    car.unitNo = totalPolice;
    totalPolice += 1;
    car.condition = 100;
    state.cars.push(car);
  }
  if (audio) audio.siren(rico.wanted > 0);
}

// Posisi dua cruiser roadblock: di jalan terdekat di depan Rico.
function blockSite(state) {
  const rico = state.player;
  const aheadX = rico.x + Math.sin(rico.angle) * 46;
  const aheadZ = rico.z + Math.cos(rico.angle) * 46;
  const vertical = Math.abs(Math.sin(rico.angle)) > Math.abs(Math.cos(rico.angle));
  const along = vertical ? aheadX : aheadZ;
  let nearest = CITY.roads[0];
  for (let i = 1; i < CITY.roads.length; i += 1) {
    const r = CITY.roads[i];
    if (Math.abs(along - r) < Math.abs(along - nearest)) nearest = r;
  }
  return {road: nearest, vertical, aheadX, aheadZ};
}

function raiseRoadblocks(state) {
  const rico = state.player;
  const blocks = [];
  for (const c of state.cars) {
    if (c.roadblock) blocks.push(c);
  }
  if (rico.wanted < 4) {
    if (blocks.length > 0) state.cars = state.cars.filter((c) => !c.roadblock);
    return;
  }
  if (blocks.length >= 2) return;
  const spot = blockSite(state);
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
  announce(state, 'Roadblock ahead! The SBPD sealed the road.');
}

function circleHeli(state) {
  const rico = state.player;
  const heli = state.heli;
  if (rico.wanted >= 3 && !heli.active) {
    heli.active = true;
    heli.x = rico.x + 40;
    heli.z = rico.z - 40;
    heli.y = 42;
    announce(state, 'Air One has you in the light!');
  } else if (rico.wanted < 3 && heli.active) {
    heli.active = false;
    return;
  }
  if (!heli.active) return;
  const t = state.time * 0.5;
  const hoverX = rico.x + Math.sin(t) * 18;
  const hoverZ = rico.z + Math.cos(t) * 18;
  heli.x += (hoverX - heli.x) * 0.03;
  heli.z += (hoverZ - heli.z) * 0.03;
  heli.angle = Math.atan2(rico.x - heli.x, rico.z - heli.z);
  heli.rotor += 0.35;
}
function getInCar(state, audio) {
  const rico = state.player;
  const car = nearestCar(state, rico.x, rico.z, 4);
  if (car === null) return false;
  if (car.kind === 'traffic') {
    addWanted(state, 1, audio);
    announce(state, 'Car stolen! The cops are on you.');
  }
  if (car.kind === 'police') {
    addWanted(state, 2, audio);
    announce(state, 'You stole a police cruiser!');
  }
  car.kind = 'player';
  rico.car = car;
  flashTip(state, 'car');
  rico.onFoot = false;
  rico.x = car.x;
  rico.z = car.z;
  rico.angle = car.angle;
  if (audio) audio.click();
  return true;
}

function getOutOfCar(state) {
  const rico = state.player;
  if (rico.car === null || rico.car === undefined) return;
  const car = rico.car;
  car.kind = 'parked';
  car.speed = 0;
  const sideX = Math.sin(car.angle + Math.PI / 2) * 3;
  const sideZ = Math.cos(car.angle + Math.PI / 2) * 3;
  rico.x = car.x + sideX;
  rico.z = car.z + sideZ;
  rico.angle = car.angle;
  rico.car = null;
  rico.onFoot = true;
  rico.y = 0;
  rico.vy = 0;
}

function disableCruiser(state, car, audio) {
  if (car.disabled) return;
  car.disabled = true;
  car.speed = 0;
  state.stats.copsWrecked += 1;
  spawnFx(state, car.x, 1, car.z, 'explosion');
  giveCash(state, 50);
  giveRp(state, 25);
  unlockWeapons(state);
  announce(state, 'Police car disabled! +$50');
  const step = currentStep(state);
  if (step !== null && step.kind === 'eliminate') state.eliminated = (state.eliminated || 0) + 1;
  if (audio) audio.crash();
}

// Pick the best thing in the firing cone: nearest along the aim, with a
// penalty for how far off-centre it is. Returns {kind, ref, dist} or null.
function aimAt(state, camYaw, range) {
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
    if (score >= bestScore) return;
    bestScore = score;
    best = {kind, ref, dist};
  };
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (ped.state !== 'down') consider(ped.x, ped.z, 'ped', ped);
  }
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car !== rico.car) consider(car.x, car.z, 'car', car);
  }
  return best;
}

function blowUpRpg(state, car, audio) {
  spawnFx(state, car.x, 1.5, car.z, 'explosion');
  for (let i = 0; i < state.cars.length; i += 1) {
    const other = state.cars[i];
    if (other === state.player.car) continue;
    if (Math.hypot(other.x - car.x, other.z - car.z) >= 9) continue;
    other.damage = (other.damage || 0) + 120;
    if (other.kind === 'police' && other.damage >= 100) disableCruiser(state, other, audio);
  }
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (Math.hypot(ped.x - car.x, ped.z - car.z) < 8) knockPedDown(ped);
  }
  addWanted(state, 2, audio);
}

function fireWeapon(state, camYaw, audio) {
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
      announce(state, 'Reloading…');
    } else {
      announce(state, weapon.name + ' is dry — no reserve ammo.');
    }
    return;
  }
  weapon.mag -= 1;
  state.stats.shotsFired += 1;
  rico.shootTimer = weapon.cooldown;
  if (audio) audio.shot();
  const range = weapon.id === 'sniper' ? 120 : COMBAT.range;
  const best = aimAt(state, camYaw, range);
  if (best === null) return;
  if (best.kind === 'ped') {
    knockPedDown(best.ref);
    giveCash(state, 15);
    addWanted(state, 1, audio);
    announce(state, 'Pedestrian down. +$15');
    return;
  }
  const car = best.ref;
  if (weapon.id === 'rpg') {
    blowUpRpg(state, car, audio);
    return;
  }
  hurtCar(car, weapon.damage);
  if (car.kind === 'police' && car.damage >= 100) {
    disableCruiser(state, car, audio);
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
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - rico.x, ped.z - rico.z) >= 2.2) continue;
    knockPedDown(ped);
    giveCash(state, 15);
    addWanted(state, 1, audio);
    announce(state, 'Knocked out! +$15');
    return;
  }
}

function sendCourier(state) {
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
  announce(state, 'Courier spotted — white Comet, north side!');
}

// Advance one step and play the right sting: the mission-complete
// fanfare when a whole mission finished, the pickup blip for a step
// inside one.
function moveMissionOn(state, audio) {
  const result = advanceMission(state);
  if (audio === null || audio === undefined) return result;
  if (result === 'mission') audio.mission();
  else audio.pickup();
  return result;
}

// One branch per step kind. Each gets the state, the audio handle, the
// step itself, Rico, and a "within radius" test — and returns nothing;
// advancing is the branch's job.
let djLine = 0;

function runStepLogic(state, audio) {
  const mission = currentMission(state);
  const step = currentStep(state);
  if (mission === null || step === null) return;
  const rico = state.player;
  const within = (pos, radius) => pos !== null && pos !== undefined && Math.hypot(rico.x - pos.x, rico.z - pos.z) < radius;
  switch (step.kind) {
    case 'goto': {
      if (step.anyCar) {
        if (rico.car) {
          advanceMission(state);
          if (audio) audio.mission();
        }
        break;
      }
      if (within(step.pos, 6)) moveMissionOn(state, audio);
      break;
    }
    case 'timed': {
      if (within(step.pos, 6)) moveMissionOn(state, audio);
      break;
    }
    case 'collect': {
      const spots = step.spots || [];
      const spot = spots[state.missionCollected || 0];
      if (spot === undefined || !within(spot, 4)) break;
      state.missionCollected += 1;
      giveCash(state, 25);
      if (audio) audio.pickup();
      announce(state, 'Package ' + state.missionCollected + '/' + step.count + ' collected. +$25');
      if (state.missionCollected >= step.count && advanceMission(state) === 'mission' && audio) audio.mission();
      break;
    }
    case 'wanted': {
      if (rico.wanted >= step.stars) {
        advanceMission(state);
        if (audio) audio.pickup();
      }
      break;
    }
    case 'pickup': {
      if (!within(step.pos, 4)) break;
      state.passenger = true;
      advanceMission(state);
      if (audio) audio.pickup();
      announce(state, 'Passenger aboard. Drive carefully.');
      break;
    }
    case 'deliver': {
      if (!state.passenger || !within(step.pos, 6)) break;
      state.passenger = false;
      if (advanceMission(state) === 'mission' && audio) audio.mission();
      break;
    }
    case 'hold': {
      if (!within(step.pos, 5)) {
        state.missionHold = Math.max(0, state.missionHold - 1 / 60);
        break;
      }
      state.missionHold += 1 / 60;
      if (rico.wanted < 4) {
        rico.wanted = 4;
        rico.crimeTimer = 0;
      }
      if (state.missionHold < step.seconds) break;
      giveCash(state, 200);
      if (advanceMission(state) === 'mission' && audio) audio.mission();
      announce(state, 'Vault cracked! +$200 — run!');
      break;
    }
    case 'race': {
      const checkpoints = step.checkpoints || [];
      const cp = checkpoints[state.raceIndex || 0];
      if (cp === undefined || !within(cp, 7)) break;
      state.raceIndex += 1;
      if (audio) audio.pickup();
      announce(state, 'Gate ' + state.raceIndex + '/' + checkpoints.length + '!');
      if (state.raceIndex >= checkpoints.length && advanceMission(state) === 'mission' && audio) audio.mission();
      break;
    }
    case 'ram': {
      sendCourier(state);
      const t = state.targetCar;
      if (t === null || t === undefined || !(t.disabled || (t.damage || 0) >= 100)) break;
      giveCash(state, 150);
      announce(state, 'Courier stopped! Cargo secured. +$150');
      if (advanceMission(state) === 'mission' && audio) audio.mission();
      break;
    }
    case 'eliminate': {
      if ((state.eliminated || 0) >= step.count && advanceMission(state) === 'mission' && audio) audio.mission();
      break;
    }
    default:
      break;
  }
}

// Clocks and cooldowns: world time, weapon timers, reload, crime and
// crew cooldowns, the mission timer, and ageing visual effects.
function tickClocks(state, dt) {
  const rico = state.player;
  state.time += dt;
  state.stats.timePlayed += dt;
  const lastX = state.stats.lastX === null || state.stats.lastX === undefined ? rico.x : state.stats.lastX;
  const lastZ = state.stats.lastZ === null || state.stats.lastZ === undefined ? rico.z : state.stats.lastZ;
  const travelled = Math.hypot(rico.x - lastX, rico.z - lastZ);
  state.stats.distanceKm += travelled / 1000;
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
      const magSize = WEAPONS[state.player.weaponIndex].mag;
      const loaded = Math.min(magSize - w.mag, w.ammo);
      w.mag += loaded;
      w.ammo -= loaded;
    }
  }
  rico.crimeTimer += dt;
  for (const key of Object.keys(rico.crew)) {
    const left = rico.crew[key] - dt;
    rico.crew[key] = left > 0 ? left : 0;
  }
  if (rico.eyesTimer > 0) rico.eyesTimer -= dt;
  if (state.dialogue !== null && state.dialogue !== undefined && state.dialogue.timer > 0) {
    state.dialogue.timer -= dt;
  }
  const step = currentStep(state);
  const timedOut = step !== null && (step.kind === 'race' || step.kind === 'timed') && step.seconds;
  if (timedOut) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      startStep(state);
      announce(state, 'Out of time — the job resets. Try again.');
    }
  }
  for (let i = 0; i < state.fx.length; i += 1) state.fx[i].t += dt;
  state.fx = state.fx.filter((fx) => fx.t < 1.2);
}

// Weapon switching: number keys 1–7, Q cycles owned weapons, C changes radio.
function readWeaponKeys(state, input, audio) {
  const rico = state.player;
  for (let slot = 0; slot < 7; slot += 1) {
    if (!input.wasPressed('w' + (slot + 1))) continue;
    const w = rico.weapons[slot];
    if (w.owned) {
      rico.weaponIndex = slot;
      announce(state, w.name + ' equipped.');
    } else {
      announce(state, w.name + ' is locked — reach ' + w.unlockRp + ' RP.');
    }
  }
  if (input.wasPressed('cycleWeapon')) {
    const owned = [];
    for (let i = 0; i < rico.weapons.length; i += 1) {
      if (rico.weapons[i].owned) owned.push(i);
    }
    const at = owned.indexOf(rico.weaponIndex);
    rico.weaponIndex = owned[(at + 1) % owned.length];
    announce(state, currentWeapon(state).name + ' equipped.');
  }
  if (input.wasPressed('radio')) {
    rico.radioStation = (rico.radioStation + 1) % RADIO.length;
    if (audio) audio.setRadio(rico.radioStation);
    const station = RADIO[rico.radioStation];
    announce(state, '♪ ' + station.name + ' — ' + station.genre);
    if (station.lines && station.lines.length > 0) {
      const line = station.lines[djLine % station.lines.length];
      djLine += 1;
      sayLine(state, line, station.dj, 'DJ');
    }
  }
}

// Crew abilities: Z plates, X roadside repair, V police-vision.
function readCrewKeys(state, input) {
  const rico = state.player;
  if (input.wasPressed('plates') && rico.crew.plates <= 0) {
    if (rico.wanted > 0) {
      rico.wanted = Math.max(0, rico.wanted - 1);
      rico.crew.plates = CREW[0].cooldown;
      announce(state, 'Mira swapped the plates — one star gone.');
    } else {
      announce(state, 'No heat to lose right now.');
    }
  }
  if (input.wasPressed('fix') && rico.crew.fix <= 0) {
    const needsCar = rico.car === null || rico.car === undefined;
    const needsCash = rico.car && (rico.car.condition || 100) < 100 && rico.cash >= 50;
    if (needsCar) {
      announce(state, 'Quick Fix needs a car.');
    } else if (needsCash) {
      spendCash(state, 50);
      fixCar(rico.car);
      rico.crew.fix = CREW[1].cooldown;
      announce(state, 'Lio patched the car up. -$50');
    }
  }
  if (input.wasPressed('eyes') && rico.crew.eyes <= 0) {
    rico.eyesTimer = 10;
    rico.crew.eyes = CREW[2].cooldown;
    announce(state, "Kiki's eyes are out — police revealed.");
  }
}

// Traffic cars drive their roads; the courier target car just drives its
// own route. A car with a car ahead of it brakes instead of rear-ending it.
function moveTraffic(state, dt) {
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

// Police: dispatch units, roadblocks and the helicopter, then step each
// cruiser. A ram dents the player, it does not delete them: total ram
// damage is capped so a pile-up is survivable and escapable.
function movePolice(state, dt, collide, audio) {
  const rico = state.player;
  sendPatrols(state, audio);
  raiseRoadblocks(state);
  circleHeli(state);
  let copTouching = false;
  let ramCount = 0;
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car.kind !== 'police' || car.disabled || car.roadblock) continue;
    const hit = stepPoliceCar(car, rico.x, rico.z, dt, collide);
    if (hit) {
      copTouching = true;
      if (rico.car) ramCount += 1;
      else rico.bustedTimer += dt;
    }
    if (car.damage >= 100) disableCruiser(state, car, audio);
  }
  if (ramCount > 0 && rico.car) {
    const armorCut = 1 - 0.25 * rico.garage.armor;
    rico.health -= Math.min(3, ramCount * 1.0) * dt * armorCut;
    rico.car.condition = Math.max(0, (rico.car.condition ?? 100) - ramCount * 0.4 * dt);
  }
  if (!copTouching && rico.onFoot) rico.bustedTimer = Math.max(0, rico.bustedTimer - dt * 2);
  if (rico.bustedTimer >= WANTED.bustSeconds) {
    state.busted = true;
    fineCash(state, 150);
    rico.wanted = 0;
  }
}

// Ambient life: pedestrians flee danger, cash pickups respawn, wanted
// decays when Rico stays clean, and health slowly regenerates out of
// trouble.
function runAmbient(state, dt, audio) {
  const rico = state.player;
  const speeding = rico.car !== null && rico.car !== undefined && Math.abs(rico.car.speed) > 4;
  const threat = (rico.wanted > 0 || rico.car) && speeding ? {x: rico.x, z: rico.z} : null;
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
    if (Math.hypot(pickup.x - rico.x, pickup.z - rico.z) < 2.5) {
      pickup.taken = true;
      pickup.respawn = 60;
      giveCash(state, 25);
      giveRp(state, 5);
      if (audio) audio.pickup();
      announce(state, 'Cash found! +$25');
    }
  }
  if (rico.health < 30 && rico.health > 0) flashTip(state, 'health');
  const nearGarage = Math.hypot(rico.x + 130, rico.z + 130) < 12;
  if (!state.garageOpen && nearGarage) flashTip(state, 'garage');
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
  if (rico.wanted === 0 && rico.health < PLAYER.maxHealth) {
    rico.health = Math.min(PLAYER.maxHealth, rico.health + 2 * dt);
  }
  if (rico.health <= 0) {
    state.wasted = true;
    fineCash(state, 100);
  }
}

// Pedestrians the player's car clips at speed go down — and it is a crime.
function runOverPeds(state, audio, speedBefore) {
  const rico = state.player;
  for (let i = 0; i < state.peds.length; i += 1) {
    const ped = state.peds[i];
    if (ped.state === 'down') continue;
    const near = Math.hypot(ped.x - rico.x, ped.z - rico.z) < 2;
    if (!near || speedBefore <= 5) continue;
    knockPedDown(ped);
    state.stats.pedsDown += 1;
    addWanted(state, 1, audio);
    announce(state, 'You hit a pedestrian!');
  }
}

// Car-to-car bumps: separate the two cars, trade speed for damage, and
// let the mission and police logic react to what got hit.
function bumpCars(state, collide, audio) {
  const rico = state.player;
  for (let i = 0; i < state.cars.length; i += 1) {
    const car = state.cars[i];
    if (car === rico.car || car.kind === 'player') continue;
    const d = Math.hypot(car.x - rico.x, car.z - rico.z);
    if (d >= 3.4 || d <= 0.01) continue;
    const shove = (3.4 - d) / 2;
    const nx = (car.x - rico.x) / d;
    const nz = (car.z - rico.z) / d;
    if (car.kind === 'police') {
      // A police ram bounces the cruiser off instead of shoving Rico
      // sideways off the road — the player keeps their line, the cop
      // loses the shove. Traffic still gets shoved, as before.
      car.x += nx * shove * 2;
      car.z += nz * shove * 2;
    } else {
      car.x += nx * shove;
      car.z += nz * shove;
      const backX = rico.car.x - nx * shove;
      const backZ = rico.car.z - nz * shove;
      if (!collide(backX, backZ, CAR.radius)) {
        rico.car.x = backX;
        rico.car.z = backZ;
        rico.x = rico.car.x;
        rico.z = rico.car.z;
      }
    }
    const impact = Math.abs(rico.car.speed) + Math.abs(car.speed || 0);
    rico.car.speed *= 0.6;
    const wear = (rico.car.condition ?? 100) - impact * 0.15;
    rico.car.condition = Math.max(0, wear);
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
      if (car.damage >= 100 && !car.disabled) disableCruiser(state, car, audio);
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
// shooting, punching and the reload key. Garage and job-list toggles live
// in main.js: they must work while the world is frozen behind their
// overlays.
function driveOrWalk(ctx) {
  const state = ctx.state;
  const input = ctx.input;
  const dt = ctx.dt;
  const audio = ctx.audio;
  const camYaw = ctx.camYaw;
  const collide = ctx.collide;
  const rico = state.player;
  if (rico.car === null || rico.car === undefined) {
    stepPlayerOnFoot(rico, input, dt, camYaw, collide);
    if (input.takeShoot()) fireWeapon(state, camYaw, audio);
    if (input.wasPressed('punch')) throwPunch(state, audio);
  } else {
    const speedBefore = Math.abs(rico.car.speed);
    const hardHit = stepPlayerCar(rico.car, input, dt, collide, rico.garage.tune);
    if (hardHit) {
      const wear = (rico.car.condition ?? 100) - 4;
      rico.car.condition = Math.max(0, wear);
      spawnFx(state, rico.car.x, 1, rico.car.z, 'crash');
      if (audio) audio.crash();
    }
    rico.x = rico.car.x;
    rico.z = rico.car.z;
    rico.angle = rico.car.angle;
    runOverPeds(state, audio, speedBefore);
    bumpCars(state, collide, audio);
  }
  const weapon = currentWeapon(state);
  const magFull = weapon.mag >= WEAPONS[state.player.weaponIndex].mag;
  if (input.wasPressed('reload') && !magFull && rico.reloadTimer <= 0) {
    rico.reloadTimer = COMBAT.reloadSeconds;
  }
}

// The living city: the sky turns, the trams loop, and hidden stashes
// pay out when Rico walks over them. None of this touches missions or
// wanted levels — it is the city breathing around the story.
function tickWorldLife(state, dt, audio) {
  const skyChanged = tickWeather(state.weather, dt, state.clockMinutes, state.rng);
  if (skyChanged && state.weather.kind !== 'clear') {
    announce(state, weatherChatter(state.weather.kind));
  }
  tickTram(state.tram, dt);
  const found = sweepStashes(state.stashes, state.player.x, state.player.z);
  for (const stash of found) {
    giveCash(state, STASH_REWARD_CASH);
    giveRp(state, STASH_REWARD_RP);
    announce(state, `Hidden stash found! +$${STASH_REWARD_CASH} (+${STASH_REWARD_RP} RP)`);
    spawnFx(state, stash.x, 1.2, stash.z, 'pickup');
    if (audio) audio.pickup();
  }
}

// The simulation is a list of systems, run in order every fixed step.
// Each one takes the same context object — state, input, dt, audio,
// camera yaw and the collision test — so the order is data, not a long
// function body.
const SYSTEMS = [
  function clocks(ctx) { tickClocks(ctx.state, ctx.dt); },
  function enterExit(ctx) {
    if (ctx.input.wasPressed('enter')) {
      if (ctx.state.player.car) getOutOfCar(ctx.state);
      else getInCar(ctx.state, ctx.audio);
    }
  },
  function weapons(ctx) { readWeaponKeys(ctx.state, ctx.input, ctx.audio); },
  function crew(ctx) { readCrewKeys(ctx.state, ctx.input); },
  function drive(ctx) { driveOrWalk(ctx); },
  function traffic(ctx) { moveTraffic(ctx.state, ctx.dt); },
  function police(ctx) { movePolice(ctx.state, ctx.dt, ctx.collide, ctx.audio); },
  function ambient(ctx) { runAmbient(ctx.state, ctx.dt, ctx.audio); },
  function missions(ctx) {
    runStepLogic(ctx.state, ctx.audio);
    unlockWeapons(ctx.state);
  },
  function worldLife(ctx) { tickWorldLife(ctx.state, ctx.dt, ctx.audio); },
  function autosave(ctx) {
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
    return blocksHit(x, z, r, state.colliders);
  };
  const ctx = {state, input, dt, audio, camYaw, collide};
  for (const system of SYSTEMS) system(ctx);
  return state.events;
}

// The garage shelf: each purchase names its price, the message when Rico
// cannot afford it, a check that returns a problem string or null, the
// effect, and the success line for the HUD.
// Garage catalogue: what each upgrade costs, when it is refused, what it
// does, and what the HUD should say. buyGarage walks this table.
const GARAGE_ITEMS = {
  repair: {
    price: 100, shortage: 'repair costs $100',
    guard: (rico) => !rico.car ? 'Repair needs a car.'
      : (rico.car.condition ?? 100) >= 100 ? 'Car is already in perfect shape.' : null,
    apply: (state, rico) => fixCar(rico.car),
    note: () => 'Repaired to 100% condition.',
  },
  tune: {
    price: 400, shortage: 'engine tune costs $400',
    guard: (rico) => rico.garage.tune >= 3 ? 'Engine is maxed out (Tune 3).' : null,
    apply: (state, rico) => { rico.garage.tune += 1; },
    note: (rico) => `Engine tuned to level ${rico.garage.tune} — faster top speed.`,
  },
  armor: {
    price: 300, shortage: 'armour costs $300',
    guard: (rico) => rico.garage.armor >= 2 ? 'Armour is maxed out.' : null,
    apply: (state, rico) => { rico.garage.armor += 1; },
    note: (rico) => `Armour fitted (level ${rico.garage.armor}) — rams hurt less.`,
  },
  ammo: {
    price: 80, shortage: 'ammo costs $80',
    guard: (rico, state) => currentWeapon(state).id === 'fists' ? 'Fists need no ammo.' : null,
    apply: (state, rico) => {
      const w = currentWeapon(state);
      w.ammo += w.mag * 2;
    },
    note: (rico, state) => `Bought ammo for the ${currentWeapon(state).name}.`,
  },
};

// Garage purchases. Returns a message for the HUD, or null if it failed.
export function buyGarage(state, kind) {
  const rico = state.player;
  const item = GARAGE_ITEMS[kind];
  if (!item) return null;
  const problem = item.guard(rico, state);
  if (problem) return problem;
  if (rico.cash < item.price) return `Not enough cash — ${item.shortage}.`;
  spendCash(state, item.price);
  item.apply(state, rico);
  return item.note(rico, state);
}

// Read and write a dotted path ('player.cash') on the state object.
function getDotted(obj, path) {
  let cursor = obj;
  for (const key of path.split('.')) {
    if (cursor == null) return cursor;
    cursor = cursor[key];
  }
  return cursor;
}
function setDotted(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let target = obj;
  for (const key of keys) target = target[key];
  target[last] = value;
}

// The save file, as {key, path, fallback} rows.
// 'keep' means the current value (a fresh game keeps its own cash and spot).
const SAVE_FIELDS = [
  {key: 'cash', path: 'player.cash', fallback: 'keep'},
  {key: 'rp', path: 'player.rp', fallback: 0},
  {key: 'missionIndex', path: 'missionIndex', fallback: 0},
  {key: 'missionStep', path: 'missionStep', fallback: 0},
  {key: 'x', path: 'player.x', fallback: 'keep'},
  {key: 'z', path: 'player.z', fallback: 'keep'},
  {key: 'allMissionsDone', path: 'allMissionsDone', fallback: false},
  {key: 'radioStation', path: 'player.radioStation', fallback: 0},
  {key: 'weaponIndex', path: 'player.weaponIndex', fallback: 1},
];

export function saveGame(state) {
  try {
    const data = {};
    for (const field of SAVE_FIELDS) data[field.key] = getDotted(state, field.path);
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
  for (const field of SAVE_FIELDS) {
    const base = field.fallback === 'keep' ? getDotted(state, field.path) : field.fallback;
    const stored = save[field.key];
    const value = stored === undefined || stored === null ? base : stored;
    setDotted(state, field.path, field.key === 'allMissionsDone' ? !!value : value);
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
