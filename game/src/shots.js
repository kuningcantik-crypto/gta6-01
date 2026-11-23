// Screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame.
import { STEP } from './config.js';
import { stepWorld } from './world.js';

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Drive toward a list of road waypoints, steering like a player would.
// If the car gets wedged on a corner, it reverses out and tries again.
function driveAutopilot(state, input, waypoints, seconds) {
  let wp = 0;
  let stuckTimer = 0;
  let reversing = 0;
  let lastX = state.player.car ? state.player.car.x : 0;
  let lastZ = state.player.car ? state.player.car.z : 0;
  for (let i = 0; i < seconds / STEP; i += 1) {
    const car = state.player.car;
    if (!car) break;
    const target = waypoints[Math.min(wp, waypoints.length - 1)];
    if (Math.hypot(target.x - car.x, target.z - car.z) < 6 && wp < waypoints.length - 1) wp += 1;
    if (Math.hypot(car.x - lastX, car.z - lastZ) < 0.05 && Math.abs(car.speed) < 1) stuckTimer += STEP;
    else stuckTimer = 0;
    lastX = car.x; lastZ = car.z;
    if (stuckTimer > 2 && reversing <= 0) reversing = 1.5;
    input.clear();
    if (reversing > 0) {
      reversing -= STEP;
      input.set('down', true);
      input.set('left', true);
    } else {
      // Slow down for turns: only accelerate when roughly lined up and
      // already slow enough to turn, so the car stays on the road instead
      // of swinging onto the sidewalk (and into pedestrians).
      const desired = Math.atan2(target.x - car.x, target.z - car.z);
      const diff = normAngle(desired - car.angle);
      if (Math.abs(diff) < 0.35 && Math.abs(car.speed) < 22) input.set('up', true);
      if (Math.abs(diff) > 0.35 && Math.abs(car.speed) > 5) input.set('down', true);
      if (diff > 0.12) input.set('left', true);
      else if (diff < -0.12) input.set('right', true);
    }
    stepWorld(state, input, STEP, null, car.angle);
    input.endFrame();
  }
}

function putPlayerInCar(state, x, z, angle) {
  const car = state.cars.find((c) => Math.hypot(c.x - x, c.z - z) < 6) || state.cars[0];
  car.kind = 'player';
  // Snap onto the road centreline, facing along it, so the autopilot
  // starts on tarmac instead of wedged against a building.
  car.x = x; car.z = z; car.angle = angle; car.speed = 0;
  const p = state.player;
  p.car = car; p.onFoot = false;
  p.x = car.x; p.z = car.z; p.angle = car.angle;
  return car;
}

// Set `state` to the named scene and return how to paint it.
export function stageShot(name, state, input) {
  if (name === 'play') {
    state.dialogue = { name: 'Lucia', role: 'Fixer', text: 'Rico, welcome home. First rule of Solmar: wheels before words. Steal a car and meet me at the Neon Pier.', timer: 60 };
    putPlayerInCar(state, -52, -100, 0); // road x=-52, heading south toward the beach
    driveAutopilot(state, input, [
      { x: -52, z: 0 }, { x: -52, z: 104 }, { x: -52, z: 150 },
    ], 22);
    return { screen: 'play', mode: 'follow', cameraYaw: state.player.angle };
  }
  if (name === 'chase') {
    state.missionIndex = 2; // Getaway Driver
    state.missionStep = 0;
    state.player.wanted = 3;
    state.player.crimeTimer = 0;
    state.dialogue = { name: 'Mira', role: 'Driver', text: 'You want to drive for us? Prove it. Get the cops on your tail — then shake them at the safehouse.', timer: 60 };
    putPlayerInCar(state, 52, 100, Math.PI); // road x=52, heading north
    // Straight north on one road: no corner to wedge on, and only 8 s of
    // driving, so the police have just caught up — the car is still moving
    // fast, with the helicopter cone overhead, when the frame is taken.
    // Three stars keeps the heli up without roadblocks.
    driveAutopilot(state, input, [
      { x: 52, z: -52 }, { x: 52, z: -140 },
    ], 8);
    return { screen: 'play', mode: 'follow', cameraYaw: state.player.angle };
  }
  if (name === 'end') {
    // Mission complete at the Neon Pier at sunset.
    state.player.cash = 5200;
    state.player.rp = 3400;
    state.missionIndex = 12;
    state.allMissionsDone = true;
    state.missionFlash = { title: 'The Gold Rush — complete', reward: 1200, timer: 6 };
    state.player.x = 0; state.player.z = 188; state.player.angle = Math.PI;
    for (let i = 0; i < 2 / STEP; i += 1) stepWorld(state, input, STEP, null, Math.PI);
    return {
      screen: 'play', mode: 'fixed',
      fixedCamera: { x: 0, y: 5.5, z: 168, lookX: 0, lookY: 3, lookZ: 196 },
    };
  }
  // start (default): title screen over the city at golden hour.
  for (let i = 0; i < 3 / STEP; i += 1) stepWorld(state, input, STEP, null, Math.PI);
  return { screen: 'title', mode: 'aerial', cameraYaw: 0 };
}
