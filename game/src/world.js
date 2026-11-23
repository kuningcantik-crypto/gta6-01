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

function circleHitsCollider(x, z, r, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.x0, Math.min(x, c.x1));
    const cz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// Named police units, assigned in spawn order so the dispatch panel can
// show real callsigns, distances and tactics.
const UNIT_NAMES = ['KITE-1', 'CORAL-48', 'BARRACUDA-18', 'GULL-8', 'BULWARK-2', 'TIDE-7'];
export function unitName(car) {
  if (car.roadblock) return `BULWARK-${car.unitNo || 2}`;
  return UNIT_NAMES[(car.unitNo || 0) % UNIT_NAMES.length];
}

export function createWorld(seed) {
  const rng = createRandom(seed);
  const state = {
    seed,
    rng,
    time: 0,
    clockMinutes: 17 * 60, // in-game clock starts at 17:00, dusk
    colliders: [],
    player: {
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
      garage: { tune: 0, armor: 0 },
      crew: { plates: 0, fix: 0, eyes: 0 },
      eyesTimer: 0,
    },
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
    heli: { active: false, x: 0, z: 0, y: 42, angle: 0, rotor: 0 },
    districtHeat: {},
    fx: [], // particle bursts for the renderer: {x, y, z, kind, t}
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
  // Parked cars along the roads, ready to steal.
  const parkedSpots = [
    [-44, -100], [60, 60], [8, -52], [-96, 20], [112, -20], [-8, 130], [44, -130],
  ];
  for (const [x, z] of parkedSpots) {
    const car = makeCar('parked', 0xd93a2b, x, z, rng.next() * Math.PI * 2, rng);
    car.id = `parked-${state.cars.length}`;
    car.color = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x8a5fd9, 0xff7a2b][state.cars.length % 7];
    car.name = CAR_NAMES[state.cars.length % CAR_NAMES.length];
    car.condition = 100;
    state.cars.push(car);
  }
  // Traffic.
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const car = makeCar('traffic', 0xcccccc, 0, 0, 0, rng);
    car.id = `traffic-${i}`;
    car.color = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x222222, 0x8a5fd9][i % 7];
    car.name = CAR_NAMES[i % CAR_NAMES.length];
    car.condition = 100;
    placeTrafficCar(car, rng);
    state.cars.push(car);
  }
  // Pedestrians.
  for (let i = 0; i < PEDS.count; i += 1) state.peds.push(makePed(rng));
  // Cash pickups scattered around the city.
  const pickupSpots = [
    [-78, -52], [52, 26], [-26, 104], [104, 0], [-104, 78], [26, -104], [78, 130], [-130, -26],
  ];
  for (const [x, z] of pickupSpots) state.pickups.push({ x, z, taken: false, respawn: 0 });
  return state;
}

export function spawnFx(state, x, y, z, kind) {
  state.fx.push({ x, y: y || 1, z, kind, t: 0 });
  if (state.fx.length > 24) state.fx.shift();
}

export function addWanted(state, stars, audio) {
  const p = state.player;
  const before = p.wanted;
  p.wanted = Math.min(WANTED.maxStars, p.wanted + stars);
  p.crimeTimer = 0;
  // District heat: trouble follows Rico by neighbourhood.
  const d = districtAt(p.x, p.z).name;
  state.districtHeat[d] = Math.min(100, (state.districtHeat[d] || 0) + stars * 8);
  if (p.wanted > before && audio) audio.siren(true);
}

export function currentWeapon(state) {
  return state.player.weapons[state.player.weaponIndex];
}

export function unlockWeapons(state) {
  // Weapons unlock the moment Rico's respect reaches their RP gate.
  for (const w of state.player.weapons) {
    if (!w.owned && state.player.rp >= w.unlockRp) {
      w.owned = true;
      w.ammo = w.startAmmo || 0;
      w.mag = w.mag;
      state.events.push({ type: 'message', text: `Unlocked: ${w.name}! Press ${state.player.weapons.indexOf(w) + 1} to equip.` });
    }
  }
}

function nearestCar(state, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.kind === 'player') continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

function spawnPolice(state, audio) {
  const p = state.player;
  const wanted = Math.min(WANTED.maxPolice, p.wanted * WANTED.policePerStar);
  const current = state.cars.filter((c) => c.kind === 'police' && !c.disabled && !c.roadblock).length;
  for (let i = current; i < wanted; i += 1) {
    const road = CITY.roads[Math.floor(state.rng.next() * CITY.roads.length)];
    const angle = state.rng.next() * Math.PI * 2;
    const car = makeCar('police', 0x1c2b4a, p.x + Math.sin(angle) * 70, p.z + Math.cos(angle) * 70, angle, state.rng);
    car.x = Math.max(-CITY.half, Math.min(CITY.half, car.x));
    car.z = Math.max(-CITY.half, Math.min(CITY.half, car.z));
    car.unitNo = state.cars.filter((c) => c.kind === 'police').length;
    car.condition = 100;
    state.cars.push(car);
  }
  if (p.wanted > 0 && audio) audio.siren(true);
  if (p.wanted === 0 && audio) audio.siren(false);
}

function manageRoadblocks(state) {
  const p = state.player;
  const blocks = state.cars.filter((c) => c.roadblock);
  if (p.wanted >= 4 && blocks.length < 2) {
    // Two cruisers parked across the road ahead of the player.
    const heading = p.angle;
    const aheadX = p.x + Math.sin(heading) * 46;
    const aheadZ = p.z + Math.cos(heading) * 46;
    // Snap onto the nearest road axis of travel.
    const vertical = Math.abs(Math.sin(heading)) > Math.abs(Math.cos(heading));
    const road = CITY.roads.reduce((best, r) => (Math.abs((vertical ? aheadX : aheadZ) - r) < Math.abs((vertical ? aheadX : aheadZ) - best) ? r : best), CITY.roads[0]);
    for (let i = 0; i < 2 - blocks.length; i += 1) {
      const car = makeCar('police', 0x1c2b4a, 0, 0, 0, state.rng);
      car.roadblock = true;
      car.unitNo = 2 + i;
      car.condition = 100;
      if (vertical) { car.x = road; car.z = aheadZ + (i === 0 ? -4 : 4); car.angle = Math.PI / 2; }
      else { car.x = aheadX + (i === 0 ? -4 : 4); car.z = road; car.angle = 0; }
      state.cars.push(car);
    }
    state.events.push({ type: 'message', text: 'Roadblock ahead! The SBPD sealed the road.' });
  } else if (p.wanted < 4 && blocks.length > 0) {
    state.cars = state.cars.filter((c) => !c.roadblock);
  }
}

function manageHeli(state) {
  const p = state.player;
  const heli = state.heli;
  if (p.wanted >= 3) {
    if (!heli.active) {
      heli.active = true;
      heli.x = p.x + 40; heli.z = p.z - 40; heli.y = 42;
      state.events.push({ type: 'message', text: 'Air One has you in the light!' });
    }
  } else if (heli.active) {
    heli.active = false;
  }
  if (heli.active) {
    // Circle above the player, spotlight tracking them.
    const t = state.time * 0.5;
    const tx = p.x + Math.sin(t) * 18;
    const tz = p.z + Math.cos(t) * 18;
    heli.x += (tx - heli.x) * 0.03;
    heli.z += (tz - heli.z) * 0.03;
    heli.angle = Math.atan2(p.x - heli.x, p.z - heli.z);
    heli.rotor += 0.35;
  }
}

function enterCar(state, audio) {
  const p = state.player;
  const car = nearestCar(state, p.x, p.z, 4);
  if (!car) return false;
  if (car.kind === 'traffic') {
    addWanted(state, 1, audio);
    state.events.push({ type: 'message', text: 'Car stolen! The cops are on you.' });
  }
  if (car.kind === 'police') {
    addWanted(state, 2, audio);
    state.events.push({ type: 'message', text: 'You stole a police cruiser!' });
  }
  car.kind = 'player';
  p.car = car;
  p.onFoot = false;
  p.x = car.x; p.z = car.z; p.angle = car.angle;
  if (audio) audio.click();
  return true;
}

function exitCar(state) {
  const p = state.player;
  if (!p.car) return;
  const car = p.car;
  car.kind = 'parked';
  car.speed = 0;
  p.x = car.x + Math.sin(car.angle + Math.PI / 2) * 3;
  p.z = car.z + Math.cos(car.angle + Math.PI / 2) * 3;
  p.angle = car.angle;
  p.car = null;
  p.onFoot = true;
  p.y = 0; p.vy = 0;
}

function disablePoliceCar(state, car, audio) {
  if (car.disabled) return;
  car.disabled = true;
  car.speed = 0;
  spawnFx(state, car.x, 1, car.z, 'explosion');
  state.player.cash += 50;
  state.player.rp += 25;
  unlockWeapons(state);
  state.events.push({ type: 'message', text: 'Police car disabled! +$50' });
  const step = currentStep(state);
  if (step && step.kind === 'eliminate') {
    state.eliminated = (state.eliminated || 0) + 1;
  }
  if (audio) audio.crash();
}

function shoot(state, cameraYaw, audio) {
  const p = state.player;
  const weapon = currentWeapon(state);
  if (weapon.id === 'fists') { punch(state, audio); return; }
  if (p.reloadTimer > 0 || p.shootTimer > 0) return;
  if (weapon.mag <= 0) {
    if (weapon.ammo > 0) {
      p.reloadTimer = COMBAT.reloadSeconds;
      state.events.push({ type: 'message', text: 'Reloading…' });
    } else {
      state.events.push({ type: 'message', text: `${weapon.name} is dry — no reserve ammo.` });
    }
    return;
  }
  weapon.mag -= 1;
  p.shootTimer = weapon.cooldown;
  if (audio) audio.shot();
  const range = weapon.id === 'sniper' ? 120 : COMBAT.range;
  const dirX = Math.sin(cameraYaw);
  const dirZ = Math.cos(cameraYaw);
  // Nearest target roughly in the firing line.
  let best = null;
  let bestScore = Infinity;
  const consider = (x, z, kind, ref) => {
    const dx = x - p.x;
    const dz = z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range || dist < 0.5) return;
    const along = dx * dirX + dz * dirZ;
    const side = Math.abs(dx * dirZ - dz * dirX);
    if (along < 0 || side > 1.2 + dist * 0.05) return;
    const score = dist + side * 4;
    if (score < bestScore) { bestScore = score; best = { kind, ref, dist }; }
  };
  for (const ped of state.peds) if (ped.state !== 'down') consider(ped.x, ped.z, 'ped', ped);
  for (const car of state.cars) {
    if (car === p.car) continue;
    consider(car.x, car.z, 'car', car);
  }
  if (!best) return;
  if (best.kind === 'ped') {
    knockPedDown(best.ref);
    state.player.cash += 15;
    addWanted(state, 1, audio);
    state.events.push({ type: 'message', text: 'Pedestrian down. +$15' });
  } else {
    const car = best.ref;
    if (weapon.id === 'rpg') {
      // Explosive round: everything near the impact goes up.
      spawnFx(state, car.x, 1.5, car.z, 'explosion');
      for (const other of state.cars) {
        if (other === p.car) continue;
        if (Math.hypot(other.x - car.x, other.z - car.z) < 9) {
          other.damage = (other.damage || 0) + 120;
          if (other.kind === 'police' && other.damage >= 100) disablePoliceCar(state, other, audio);
        }
      }
      for (const ped of state.peds) {
        if (Math.hypot(ped.x - car.x, ped.z - car.z) < 8) knockPedDown(ped);
      }
      addWanted(state, 2, audio);
      return;
    }
    car.damage = (car.damage || 0) + weapon.damage;
    car.condition = Math.max(0, 100 - (car.damage || 0));
    if (car.kind === 'police' && car.damage >= 100) {
      disablePoliceCar(state, car, audio);
    } else if (car.kind === 'traffic') {
      car.speed = 0; car.stalled = 3;
      addWanted(state, 1, audio);
    } else if (car.kind === 'police') {
      addWanted(state, 1, audio);
    } else if (car === state.targetCar && car.damage >= 100) {
      car.disabled = true; car.speed = 0;
      spawnFx(state, car.x, 1, car.z, 'explosion');
    }
  }
}

function punch(state, audio) {
  const p = state.player;
  if (p.punchTimer > 0) return;
  p.punchTimer = 0.5;
  if (audio) audio.punch();
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - p.x, ped.z - p.z) < 2.2) {
      knockPedDown(ped);
      p.cash += 15;
      addWanted(state, 1, audio);
      state.events.push({ type: 'message', text: 'Knocked out! +$15' });
      return;
    }
  }
}

function ensureTargetCar(state) {
  if (state.targetCar) return;
  const step = currentStep(state);
  const pos = (step && step.pos) || { x: 104, z: 52 };
  const car = makeCar('traffic', 0xeeeeee, pos.x, pos.z, Math.PI / 2, state.rng);
  car.id = `courier-${Math.floor(state.rng.next() * 1e9)}`;
  car.name = 'COURIER COMET';
  car.target = true;
  car.damage = 0;
  car.condition = 100;
  car.speed = 10;
  state.cars.push(car);
  state.targetCar = car;
  state.events.push({ type: 'message', text: 'Courier spotted — white Comet, north side!' });
}

function checkMissionStep(state, audio) {
  const mission = currentMission(state);
  const step = currentStep(state);
  if (!mission || !step) return;
  const p = state.player;
  const near = (pos, radius) => pos && Math.hypot(p.x - pos.x, p.z - pos.z) < radius;
  if (step.kind === 'goto' && step.anyCar) {
    if (p.car) { advanceMission(state); if (audio) audio.mission(); }
    return;
  }
  if (step.kind === 'goto' && near(step.pos, 6)) {
    if (advanceMission(state) === 'mission' && audio) audio.mission();
    else if (audio) audio.pickup();
    return;
  }
  if (step.kind === 'timed' && near(step.pos, 6)) {
    if (advanceMission(state) === 'mission' && audio) audio.mission();
    else if (audio) audio.pickup();
    return;
  }
  if (step.kind === 'collect') {
    const spots = step.spots || [];
    const spot = spots[state.missionCollected || 0];
    if (spot && near(spot, 4)) {
      state.missionCollected += 1;
      p.cash += 25;
      if (audio) audio.pickup();
      state.events.push({ type: 'message', text: `Package ${state.missionCollected}/${step.count} collected. +$25` });
      if (state.missionCollected >= step.count) {
        if (advanceMission(state) === 'mission' && audio) audio.mission();
      }
    }
    return;
  }
  if (step.kind === 'wanted' && p.wanted >= step.stars) {
    advanceMission(state);
    if (audio) audio.pickup();
    return;
  }
  if (step.kind === 'pickup' && near(step.pos, 4)) {
    state.passenger = true;
    advanceMission(state);
    if (audio) audio.pickup();
    state.events.push({ type: 'message', text: 'Passenger aboard. Drive carefully.' });
    return;
  }
  if (step.kind === 'deliver' && state.passenger && near(step.pos, 6)) {
    state.passenger = false;
    if (advanceMission(state) === 'mission' && audio) audio.mission();
    return;
  }
  if (step.kind === 'hold') {
    if (near(step.pos, 5)) {
      state.missionHold += 1 / 60;
      if (p.wanted < 4) { p.wanted = 4; p.crimeTimer = 0; }
      if (state.missionHold >= step.seconds) {
        p.cash += 200;
        if (advanceMission(state) === 'mission' && audio) audio.mission();
        state.events.push({ type: 'message', text: 'Vault cracked! +$200 — run!' });
      }
    } else {
      state.missionHold = Math.max(0, state.missionHold - 1 / 60);
    }
    return;
  }
  if (step.kind === 'race') {
    const checkpoints = step.checkpoints || [];
    const cp = checkpoints[state.raceIndex || 0];
    if (cp && near(cp, 7)) {
      state.raceIndex += 1;
      if (audio) audio.pickup();
      state.events.push({ type: 'message', text: `Gate ${state.raceIndex}/${checkpoints.length}!` });
      if (state.raceIndex >= checkpoints.length) {
        if (advanceMission(state) === 'mission' && audio) audio.mission();
      }
    }
    return;
  }
  if (step.kind === 'ram') {
    ensureTargetCar(state);
    const t = state.targetCar;
    if (t && (t.disabled || (t.damage || 0) >= 100)) {
      p.cash += 150;
      state.events.push({ type: 'message', text: 'Courier stopped! Cargo secured. +$150' });
      if (advanceMission(state) === 'mission' && audio) audio.mission();
    }
    return;
  }
  if (step.kind === 'eliminate') {
    if ((state.eliminated || 0) >= step.count) {
      if (advanceMission(state) === 'mission' && audio) audio.mission();
    }
  }
}

// One fixed simulation step.
export function stepWorld(state, input, dt, audio, cameraYaw) {
  const p = state.player;
  state.time += dt;
  state.clockMinutes += dt / 10; // 1 game minute per 10 real seconds
  state.events = [];
  p.shootTimer = Math.max(0, p.shootTimer - dt);
  p.punchTimer = Math.max(0, p.punchTimer - dt);
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      const w = currentWeapon(state);
      // Refill the magazine from reserve ammo.
      const magSize = WEAPONS[state.weaponIndex].mag;
      const moved = Math.min(magSize - w.mag, w.ammo);
      w.mag += moved;
      w.ammo -= moved;
    }
  }
  p.crimeTimer += dt;
  // Crew cooldowns tick down; the Eyes Out reveal window too.
  for (const k of Object.keys(p.crew)) p.crew[k] = Math.max(0, p.crew[k] - dt);
  if (p.eyesTimer > 0) p.eyesTimer -= dt;
  if (state.dialogue && state.dialogue.timer > 0) state.dialogue.timer -= dt;
  // Mission clocks: race and timed steps run against the clock.
  const step = currentStep(state);
  if (step && (step.kind === 'race' || step.kind === 'timed') && step.seconds) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      startStep(state);
      state.events.push({ type: 'message', text: 'Out of time — the job resets. Try again.' });
    }
  }
  // Fx bursts age out.
  for (const fx of state.fx) fx.t += dt;
  state.fx = state.fx.filter((fx) => fx.t < 1.2);

  const collide = (x, z, r) => {
    if (Math.abs(x) > CITY.half || z > CITY.beachZ + 24 || z < -CITY.half) return true;
    return circleHitsCollider(x, z, r, state.colliders);
  };

  if (input.wasPressed('enter')) {
    if (p.car) exitCar(state);
    else enterCar(state, audio);
  }

  // Weapon switching: number keys 1–7, Q cycles owned weapons.
  for (let i = 0; i < 7; i += 1) {
    if (input.wasPressed(`w${i + 1}`)) {
      const w = p.weapons[i];
      if (w.owned) { p.weaponIndex = i; state.events.push({ type: 'message', text: `${w.name} equipped.` }); }
      else state.events.push({ type: 'message', text: `${w.name} is locked — reach ${w.unlockRp} RP.` });
    }
  }
  if (input.wasPressed('cycleWeapon')) {
    const owned = p.weapons.map((w, i) => (w.owned ? i : -1)).filter((i) => i >= 0);
    const at = owned.indexOf(p.weaponIndex);
    p.weaponIndex = owned[(at + 1) % owned.length];
    state.events.push({ type: 'message', text: `${currentWeapon(state).name} equipped.` });
  }
  // Radio: C cycles stations.
  if (input.wasPressed('radio')) {
    p.radioStation = (p.radioStation + 1) % RADIO.length;
    if (audio) audio.setRadio(p.radioStation);
    state.events.push({ type: 'message', text: `♪ ${RADIO[p.radioStation].name} — ${RADIO[p.radioStation].genre}` });
  }
  // Crew abilities.
  if (input.wasPressed('plates') && p.crew.plates <= 0) {
    if (p.wanted > 0) {
      p.wanted = Math.max(0, p.wanted - 1);
      p.crew.plates = CREW[0].cooldown;
      state.events.push({ type: 'message', text: 'Mira swapped the plates — one star gone.' });
    } else {
      state.events.push({ type: 'message', text: 'No heat to lose right now.' });
    }
  }
  if (input.wasPressed('fix') && p.crew.fix <= 0) {
    if (p.car && (p.car.condition || 100) < 100 && p.cash >= 50) {
      p.cash -= 50;
      p.car.condition = 100;
      p.car.damage = 0;
      p.crew.fix = CREW[1].cooldown;
      state.events.push({ type: 'message', text: 'Lio patched the car up. -$50' });
    } else if (!p.car) {
      state.events.push({ type: 'message', text: 'Quick Fix needs a car.' });
    }
  }
  if (input.wasPressed('eyes') && p.crew.eyes <= 0) {
    p.eyesTimer = 10;
    p.crew.eyes = CREW[2].cooldown;
    state.events.push({ type: 'message', text: "Kiki's eyes are out — police revealed." });
  }
  // (Garage / job-list toggles live in main.js: they must work while the
  // world is frozen behind their overlays.)

  if (p.car) {
    const beforeSpeed = Math.abs(p.car.speed);
    const hardHit = stepPlayerCar(p.car, input, dt, collide, p.garage.tune);
    if (hardHit) {
      p.car.condition = Math.max(0, (p.car.condition ?? 100) - 4);
      spawnFx(state, p.car.x, 1, p.car.z, 'crash');
      if (audio) audio.crash();
    }
    p.x = p.car.x; p.z = p.car.z; p.angle = p.car.angle;
    // Hitting a pedestrian while driving.
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - p.x, ped.z - p.z) < 2 && beforeSpeed > 5) {
        knockPedDown(ped);
        addWanted(state, 1, audio);
        state.events.push({ type: 'message', text: 'You hit a pedestrian!' });
      }
    }
    // Car-to-car bumps.
    for (const car of state.cars) {
      if (car === p.car || car.kind === 'player') continue;
      const d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const nx = (car.x - p.x) / d;
        const nz = (car.z - p.z) / d;
        if (car.kind === 'police') {
          // A police ram bounces the cruiser off instead of shoving Rico
          // sideways off the road — the player keeps their line, the cop
          // loses the shove. (Traffic still gets shoved, as before.)
          car.x += nx * push * 2; car.z += nz * push * 2;
        } else {
          car.x += nx * push; car.z += nz * push;
          // Push the player's car back too, so a ram shoves it instead of
          // letting the other car phase through it and pin it in place.
          if (!collide(p.car.x - nx * push, p.car.z - nz * push, CAR.radius)) {
            p.car.x -= nx * push; p.car.z -= nz * push;
            p.x = p.car.x; p.z = p.car.z;
          }
        }
        const impact = Math.abs(p.car.speed) + Math.abs(car.speed || 0);
        p.car.speed *= 0.6;
        p.car.condition = Math.max(0, (p.car.condition ?? 100) - impact * 0.15);
        if (car.kind === 'traffic') { car.speed = Math.max(0, car.speed - 4); }
        // Ramming the courier smashes it up — the Ram the Courier job.
        if (car === state.targetCar) {
          car.damage = (car.damage || 0) + impact * 1.6;
          car.condition = Math.max(0, 100 - car.damage);
          spawnFx(state, car.x, 1, car.z, 'crash');
          if (car.damage >= 100 && !car.disabled) {
            car.disabled = true; car.speed = 0;
            spawnFx(state, car.x, 1.5, car.z, 'explosion');
          }
        }
        if (car.kind === 'police') {
          car.damage = (car.damage || 0) + impact * 0.8;
          car.condition = Math.max(0, 100 - (car.damage || 0));
          if (car.damage >= 100 && !car.disabled) disablePoliceCar(state, car, audio);
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
    stepPlayerOnFoot(p, input, dt, cameraYaw, collide);
    if (input.takeShoot()) shoot(state, cameraYaw, audio);
    if (input.wasPressed('punch')) punch(state, audio);
  }
  if (input.wasPressed('reload') && currentWeapon(state).mag < WEAPONS[state.weaponIndex].mag && p.reloadTimer <= 0) {
    p.reloadTimer = COMBAT.reloadSeconds;
  }

  // Traffic.
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    if (car === state.targetCar) {
      // The courier keeps driving its road, fleeing the player.
      stepTrafficCar(car, dt, state.rng);
      continue;
    }
    if (car.stalled > 0) { car.stalled -= dt; continue; }
    // Slow down for a car ahead on the same road.
    let ahead = false;
    for (const other of state.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const along = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
      const side = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
      if (along > 0 && along < 9 && side < 3) { ahead = true; break; }
    }
    const savedSpeed = car.speed;
    if (ahead) car.speed = Math.max(0, car.speed - 8 * dt);
    stepTrafficCar(car, dt, state.rng);
    if (ahead) car.speed = savedSpeed;
  }

  // Police.
  spawnPolice(state, audio);
  manageRoadblocks(state);
  manageHeli(state);
  let policeNear = false;
  let ramHits = 0;
  for (const car of state.cars) {
    if (car.kind !== 'police' || car.disabled || car.roadblock) continue;
    const hit = stepPoliceCar(car, p.x, p.z, dt, collide);
    if (hit) {
      policeNear = true;
      if (p.car) ramHits += 1;
      else p.bustedTimer += dt;
    }
    if (car.damage >= 100) disablePoliceCar(state, car, audio);
  }
  // A ram dents the player, it does not delete them: total ram damage is
  // capped so a pile-up is survivable and escapable. Armour softens it.
  if (ramHits > 0 && p.car) {
    p.health -= Math.min(3, ramHits * 1.0) * dt * (1 - 0.25 * p.garage.armor);
    p.car.condition = Math.max(0, (p.car.condition ?? 100) - ramHits * 0.4 * dt);
  }
  if (!policeNear && p.onFoot) p.bustedTimer = Math.max(0, p.bustedTimer - dt * 2);
  if (p.bustedTimer >= WANTED.bustSeconds) {
    state.busted = true;
    p.cash = Math.max(0, p.cash - 150);
    p.wanted = 0;
  }

  // Pedestrians flee from gunfire, fast cars and the wanted player.
  const danger = (p.wanted > 0 || p.car) && Math.abs(p.car ? p.car.speed : 0) > 4
    ? { x: p.x, z: p.z } : null;
  for (const ped of state.peds) {
    const nearDanger = danger && Math.hypot(ped.x - danger.x, ped.z - danger.z) < 18;
    stepPed(ped, dt, state.rng, nearDanger ? danger : null);
  }

  // Cash pickups.
  for (const pickup of state.pickups) {
    if (pickup.taken) {
      pickup.respawn -= dt;
      if (pickup.respawn <= 0) pickup.taken = false;
      continue;
    }
    if (Math.hypot(pickup.x - p.x, pickup.z - p.z) < 2.5) {
      pickup.taken = true;
      pickup.respawn = 60;
      p.cash += 25;
      p.rp += 5;
      if (audio) audio.pickup();
      state.events.push({ type: 'message', text: 'Cash found! +$25' });
    }
  }

  // Wanted decay when the player stays clean.
  if (p.crimeTimer > WANTED.decayDelay) {
    p.decayTimer += dt;
    if (p.decayTimer >= WANTED.decayInterval && p.wanted > 0) {
      p.wanted -= 1;
      p.decayTimer = 0;
      if (p.wanted === 0 && audio) audio.siren(false);
    }
  } else {
    p.decayTimer = 0;
  }

  // Slow health regeneration out of trouble.
  if (p.wanted === 0 && p.health < PLAYER.maxHealth) p.health = Math.min(PLAYER.maxHealth, p.health + 2 * dt);
  if (p.health <= 0) {
    state.wasted = true;
    p.cash = Math.max(0, p.cash - 100);
  }

  checkMissionStep(state, audio);
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
  const p = state.player;
  const g = p.garage;
  if (kind === 'repair') {
    if (!p.car) return 'Repair needs a car.';
    if ((p.car.condition ?? 100) >= 100) return 'Car is already in perfect shape.';
    if (p.cash < 100) return 'Not enough cash — repair costs $100.';
    p.cash -= 100; p.car.condition = 100; p.car.damage = 0;
    return 'Repaired to 100% condition.';
  }
  if (kind === 'tune') {
    if (g.tune >= 3) return 'Engine is maxed out (Tune 3).';
    if (p.cash < 400) return 'Not enough cash — engine tune costs $400.';
    p.cash -= 400; g.tune += 1;
    return `Engine tuned to level ${g.tune} — faster top speed.`;
  }
  if (kind === 'armor') {
    if (g.armor >= 2) return 'Armour is maxed out.';
    if (p.cash < 300) return 'Not enough cash — armour costs $300.';
    p.cash -= 300; g.armor += 1;
    return `Armour fitted (level ${g.armor}) — rams hurt less.`;
  }
  if (kind === 'ammo') {
    const w = currentWeapon(state);
    if (w.id === 'fists') return 'Fists need no ammo.';
    if (p.cash < 80) return 'Not enough cash — ammo costs $80.';
    p.cash -= 80;
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
      weapons: state.player.weapons.map((w) => ({ owned: w.owned, ammo: w.ammo, mag: w.mag })),
      weaponIndex: state.player.weaponIndex,
      districtHeat: state.districtHeat,
    };
    window.localStorage.setItem('solmar-bay.save.v1', JSON.stringify(data));
  } catch { /* storage unavailable */ }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem('solmar-bay.save.v1');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
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
  if (save.garage) state.player.garage = { ...state.player.garage, ...save.garage };
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
