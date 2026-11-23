// Screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot, so the frame is what a short session really looks
// like — and the same seed always gives the same frame.
import { STEP } from './config.js';
import { stepWorld } from './world.js';

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Drive toward a list of road waypoints, steering like a player would.
// If the car gets wedged on a corner, it reverses out and tries again.
function driveAutopilot(world, input, waypoints, seconds) {
  let wp = 0;
  let stuckTimer = 0;
  let reversing = 0;
  let lastX = world.player.car ? world.player.car.x : 0;
  let lastZ = world.player.car ? world.player.car.z : 0;
  for (let i = 0; i < seconds / STEP; i += 1) {
    const car = world.player.car;
    if (!car) break;
    const target = waypoints[Math.min(wp, waypoints.length - 1)];
    if (Math.hypot(target.x - car.x, target.z - car.z) < 6 && wp < waypoints.length - 1) wp += 1;
    if (Math.hypot(car.x - lastX, car.z - lastZ) < 0.05 && Math.abs(car.speed) < 1) stuckTimer += STEP;
    else stuckTimer = 0;
    lastX = car.x;
    lastZ = car.z;
    if (stuckTimer > 2 && reversing <= 0) reversing = 1.5;
    input.clear();
    if (reversing > 0) {
      reversing -= STEP;
      input.set('down', true);
      input.set('left', true);
    } else {
      const desired = Math.atan2(target.x - car.x, target.z - car.z);
      const diff = normAngle(desired - car.angle);
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

function putPlayerInCar(world, x, z, angle) {
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

// Set `world` to the named scene and return how to paint it.
export function stageShot(name, world, input) {
  if (name === 'play') {
    world.dialogue = {name: 'Lucia', role: 'Fixer', text: 'Rico, welcome home. First rule of Solmar: wheels before words. Steal a car and meet me at the Neon Pier.', timer: 60};
    putPlayerInCar(world, -52, -100, 0);
    driveAutopilot(world, input, [
      {x: -52, z: 0}, {x: -52, z: 104}, {x: -52, z: 150},
    ], 22);
    return {screen: 'play', mode: 'follow', cameraYaw: world.player.angle};
  }
  if (name === 'chase') {
    world.missionIndex = 2;
    world.missionStep = 0;
    world.player.wanted = 3;
    world.player.crimeTimer = 0;
    world.dialogue = {name: 'Mira', role: 'Driver', text: 'You want to drive for us? Prove it. Get the cops on your tail — then shake them at the safehouse.', timer: 60};
    putPlayerInCar(world, 52, 100, Math.PI);
    // Straight north on one road: no corner to wedge on, and only 8 s of
    // driving, so the police have just caught up — the car is still moving
    // fast, with the helicopter cone overhead, when the frame is taken.
    // Three stars keeps the heli up without roadblocks.
    driveAutopilot(world, input, [
      {x: 52, z: -52}, {x: 52, z: -140},
    ], 8);
    return {screen: 'play', mode: 'follow', cameraYaw: world.player.angle};
  }
  if (name === 'end') {
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
  }
  for (let i = 0; i < 3 / STEP; i += 1) stepWorld(world, input, STEP, null, Math.PI);
  return {screen: 'title', mode: 'aerial', cameraYaw: 0};
}
