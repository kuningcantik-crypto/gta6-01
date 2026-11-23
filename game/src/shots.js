// Screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of seconds,
// steered by a simple autopilot, so the frame is what a short session
// really looks like — and the same seed always gives the same frame.
import { STEP } from './config.js';
import { stepWorld } from './world.js';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// How far along the waypoint list Rico is, and whether the car has
// wedged itself: no movement at low speed for two seconds means stuck.
function waypointProgress(car, waypoints, next, lastX, lastZ, stuckFor, dt) {
  const goal = waypoints[Math.min(next, waypoints.length - 1)];
  if (Math.hypot(goal.x - car.x, goal.z - car.z) < 6 && next < waypoints.length - 1) next += 1;
  const moved = Math.hypot(car.x - lastX, car.z - lastZ);
  const stuck = moved < 0.05 && Math.abs(car.speed) < 1 ? stuckFor + dt : 0;
  return {next, stuck};
}

// Steer a car through a list of road waypoints the way a player would.
// If the car gets wedged on a corner, it backs out and tries again.
function autopilotDrive(world, input, waypoints, seconds) {
  let next = 0;
  let stuckFor = 0;
  let backingUp = 0;
  let prevX = world.player.car ? world.player.car.x : 0;
  let prevZ = world.player.car ? world.player.car.z : 0;
  const total = Math.floor(seconds / STEP);
  for (let i = 0; i < total; i += 1) {
    const car = world.player.car;
    if (!car) break;
    const goal = waypoints[Math.min(next, waypoints.length - 1)];
    const progress = waypointProgress(car, waypoints, next, prevX, prevZ, stuckFor, STEP);
    next = progress.next;
    stuckFor = progress.stuck;
    prevX = car.x;
    prevZ = car.z;
    if (stuckFor > 2 && backingUp <= 0) backingUp = 1.5;
    input.clear();
    if (backingUp > 0) {
      backingUp -= STEP;
      input.set('down', true);
      input.set('left', true);
    } else {
      const want = Math.atan2(goal.x - car.x, goal.z - car.z);
      const diff = wrapAngle(want - car.angle);
      // Only accelerate when roughly lined up and slow enough to turn, so
      // the car stays on the road instead of swinging onto the sidewalk
      // (and into pedestrians).
      if (Math.abs(diff) < 0.35 && Math.abs(car.speed) < 22) input.set('up', true);
      if (Math.abs(diff) > 0.35 && Math.abs(car.speed) > 5) input.set('down', true);
      if (diff > 0.12) input.set('left', true);
      else if (diff < -0.12) input.set('right', true);
    }
    stepWorld(world, input, STEP, null, car.angle);
    input.endFrame();
  }
}

function seatPlayer(world, x, z, angle) {
  const car = world.cars.find((c) => Math.hypot(c.x - x, c.z - z) < 6) || world.cars[0];
  car.kind = 'player';
  // Snap onto the road centreline, facing along it, so the autopilot
  // starts on tarmac instead of wedged against a building.
  car.x = x;
  car.z = z;
  car.angle = angle;
  car.speed = 0;
  const rico = world.player;
  rico.car = car;
  rico.onFoot = false;
  rico.x = car.x;
  rico.z = car.z;
  rico.angle = car.angle;
  return car;
}

// A driving scene: stage the dialogue and the wanted level, seat Rico in
// a car on a road, and let the autopilot drive the waypoints for a fixed
// number of seconds. The frame is what the drive really looks like.
function drivingScene(world, input, spec) {
  if (spec.dialogue) {
    world.dialogue = {name: spec.dialogue[0], role: spec.dialogue[1], text: spec.dialogue[2], timer: 60};
  }
  if (spec.missionIndex !== undefined) {
    world.missionIndex = spec.missionIndex;
    world.missionStep = 0;
  }
  if (spec.wanted !== undefined) {
    world.player.wanted = spec.wanted;
    world.player.crimeTimer = 0;
  }
  seatPlayer(world, spec.carAt[0], spec.carAt[1], spec.carAt[2]);
  autopilotDrive(world, input, spec.waypoints, spec.seconds);
  return {screen: 'play', mode: 'follow', cameraYaw: world.player.angle};
}

// The four scenes, as data: each one stages the world and says how to
// paint it. An unknown name falls back to the title scene.
const SCENES = {
  play(world, input) {
    return drivingScene(world, input, {
      dialogue: ['Lucia', 'Fixer', 'Rico, welcome home. First rule of Solmar: wheels before words. Steal a car and meet me at the Neon Pier.'],
      carAt: [-52, -100, 0],
      waypoints: [{x: -52, z: 0}, {x: -52, z: 104}, {x: -52, z: 150}],
      seconds: 22,
    });
  },
  chase(world, input) {
    // Straight north on one road: no corner to wedge on, and only 8 s of
    // driving, so the police have just caught up — the car is still moving
    // fast, with the helicopter cone overhead, when the frame is taken.
    // Three stars keeps the heli up without roadblocks.
    return drivingScene(world, input, {
      dialogue: ['Mira', 'Driver', 'You want to drive for us? Prove it. Get the cops on your tail — then shake them at the safehouse.'],
      missionIndex: 2, wanted: 3,
      carAt: [52, 100, Math.PI],
      waypoints: [{x: 52, z: -52}, {x: 52, z: -140}],
      seconds: 8,
    });
  },
  end(world, input) {
    world.player.cash = 5200;
    world.player.rp = 3400;
    world.missionIndex = 12;
    world.allMissionsDone = true;
    world.missionFlash = {title: 'The Gold Rush — complete', reward: 1200, timer: 6};
    world.player.x = 0;
    world.player.z = 188;
    world.player.angle = Math.PI;
    for (let i = 0; i < 2 / STEP; i += 1) stepWorld(world, input, STEP, null, Math.PI);
    return {
      screen: 'play', mode: 'fixed',
      fixedCamera: {x: 0, y: 5.5, z: 168, lookX: 0, lookY: 3, lookZ: 196},
    };
  },
  start(world, input) {
    for (let i = 0; i < 3 / STEP; i += 1) stepWorld(world, input, STEP, null, Math.PI);
    return {screen: 'title', mode: 'aerial', cameraYaw: 0};
  },
};

// Set `world` to the named scene and return how to paint it.
export function stageShot(name, world, input) {
  const scene = SCENES[name] || SCENES.start;
  return scene(world, input);
}
