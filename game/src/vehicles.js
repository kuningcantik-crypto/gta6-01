// Vehicles: boxy cars assembled from primitives, arcade driving for
// the player, traffic that cruises the grid, and cruisers that hunt
// Rico down. No model files — every car is boxes and cylinders.
import * as THREE from 'three';
import { CAR, CITY, PALETTE } from './config.js';

// Corner posts of the four wheels, as {x, z} pairs.
const WHEEL_CORNERS = [
  {x: -0.95, z: 1.45},
  {x: 0.95, z: 1.45},
  {x: -0.95, z: -1.45},
  {x: 0.95, z: -1.45},
];

function boxPart(size, fabric, at) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), fabric);
  mesh.position.set(at[0], at[1], at[2]);
  return mesh;
}

// A low-poly car from a parts list: shell, glasshouse, wheels, lamps,
// and a light bar when it is a cruiser.
export function makeCarMesh(color, isPolice) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({color: isPolice ? PALETTE.police : color});
  const glass = new THREE.MeshLambertMaterial({color: 0x1a2733});
  const shell = boxPart([2.0, 0.65, 4.4], paint, [0, 0.55, 0]);
  shell.castShadow = true;
  car.add(shell);
  const cabin = boxPart([1.7, 0.6, 2.2], glass, [0, 1.15, -0.2]);
  cabin.castShadow = true;
  car.add(cabin);

  const tyreShape = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const tyre = new THREE.MeshLambertMaterial({color: 0x111111});
  const wheels = [];
  for (const corner of WHEEL_CORNERS) {
    const wheel = new THREE.Mesh(tyreShape, tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(corner.x, 0.38, corner.z);
    car.add(wheel);
    wheels.push(wheel);
  }

  const lampGlow = new THREE.MeshBasicMaterial({color: 0xfff2b0});
  for (const side of [-0.6, 0.6]) car.add(boxPart([0.4, 0.18, 0.1], lampGlow, [side, 0.6, 2.22]));

  if (isPolice) {
    const barColors = [0xff2222, 0x2244ff];
    const barNames = ['lightbar', 'lightbar2'];
    barColors.forEach((tone, i) => {
      const bar = boxPart([1.1, 0.16, 0.4], new THREE.MeshBasicMaterial({color: tone}), [0, 1.55, -0.2]);
      bar.name = barNames[i];
      car.add(bar);
    });
  }
  car.userData.wheels = wheels;
  return car;
}

// One car record. Everything starts still; traffic and police fill in
// their own motion later.
export function makeCar(kind, color, x, z, angle, rng) {
  return {
    id: kind + '-' + Math.floor(rng.next() * 1e9),
    kind,
    color,
    x, z, angle,
    speed: 0,
    steer: 0,
    road: null, dir: 1, target: null,
    damage: 0, smoke: false, sirenPhase: 0,
    mesh: null,
  };
}

// Set a traffic car loose on a random road, in a random direction, in
// the right-hand lane for that direction.
export function placeTrafficCar(ride, rng) {
  const eastWest = rng.next() < 0.5;
  const road = rng.pick(CITY.roads);
  const along = rng.range(-CITY.half + 10, CITY.half - 10);
  ride.road = road;
  ride.dir = rng.next() < 0.5 ? 1 : -1;
  const lane = ride.dir > 0 ? 2.5 : -2.5;
  if (eastWest) {
    ride.x = along;
    ride.z = road + lane;
    ride.angle = ride.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    ride.x = road + lane;
    ride.z = along;
    ride.angle = ride.dir > 0 ? 0 : Math.PI;
  }
  ride.speed = 7 + rng.next() * 4;
}

function holdSpeed(ride, topSpeed) {
  if (ride.speed > topSpeed) ride.speed = topSpeed;
  if (ride.speed < -CAR.maxReverse) ride.speed = -CAR.maxReverse;
}

// When a car runs off the map it turns back in instead of sailing
// into the sea. Each edge knows the heading to take when crossed.
function turnBackAtEdge(ride) {
  const violated = (axis, limit) => (limit > 0 ? ride[axis] > limit : ride[axis] < limit);
  const headings = {
    'x+': Math.PI,
    'x-': 0,
    'z+': -Math.PI / 2,
    'z-': Math.PI / 2,
  };
  for (const axis of ['x', 'z']) {
    for (const sign of [1, -1]) {
      const limit = sign * CITY.half;
      if (!violated(axis, limit)) continue;
      ride[axis] = limit;
      ride.angle = headings[axis + (sign > 0 ? '+' : '-')];
    }
  }
}

// One traffic car cruising its road; at a junction it may swing onto
// the crossing street.
export function stepTrafficCar(ride, dt, rng) {
  const fx = Math.sin(ride.angle);
  const fz = Math.cos(ride.angle);
  ride.x += fx * ride.speed * dt;
  ride.z += fz * ride.speed * dt;
  const across = Math.abs(fx) > 0.5 ? ride.x : ride.z;
  const junction = CITY.roads.find((line) => Math.abs(across - line) < 1.2);
  if (junction !== undefined && rng.next() < dt * 0.25) {
    ride.angle += rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  }
  turnBackAtEdge(ride);
}

// Pedals: gas pulls speed up, brake pulls it down (or reverses when
// nearly stopped), and coasting bleeds it off with grip.
function workPedals(ride, input, dt, topSpeed) {
  const gas = input.held.up ? 1 : 0;
  const brake = input.held.down ? 1 : 0;
  if (gas) ride.speed += CAR.accel * dt;
  if (brake) ride.speed -= (ride.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
  if (gas === 0 && brake === 0) {
    ride.speed -= Math.sign(ride.speed) * CAR.grip * dt * 0.6;
    if (Math.abs(ride.speed) < 0.2) ride.speed = 0;
  }
  holdSpeed(ride, topSpeed);
}

// The wheel: steering bites more the faster the car moves, and flips
// when reversing.
function workWheel(ride, input, dt) {
  const turn = (input.held.left ? 1 : 0) - (input.held.right ? 1 : 0);
  const bite = Math.min(1, Math.abs(ride.speed) / 6) * Math.sign(ride.speed || 1);
  ride.angle += turn * CAR.steer * dt * bite;
}

// Arcade driving for Rico's car. Returns true on a hard wall hit.
// `tune` is the garage engine level (0–3): +12% top speed per level.
export function stepPlayerCar(ride, input, dt, collide, tune) {
  const condition = (ride.condition ?? 100) / 100;
  const topSpeed = CAR.maxSpeed * (1 + 0.12 * (tune || 0)) * (0.55 + 0.45 * condition);
  workPedals(ride, input, dt, topSpeed);
  workWheel(ride, input, dt);
  // Roll forward; a wall stops the car dead instead of letting it
  // phase through a building.
  const nx = ride.x + Math.sin(ride.angle) * ride.speed * dt;
  const nz = ride.z + Math.cos(ride.angle) * ride.speed * dt;
  const hit = collide(nx, nz, CAR.radius);
  if (hit) ride.speed *= 0.3;
  else {
    ride.x = nx;
    ride.z = nz;
  }
  return hit && Math.abs(ride.speed) > 4;
}

// Fold any heading difference back into the ±π range.
function wrapAngle(a) {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

// How fast a cruiser wants to go, by how far away Rico is.
function chasePace(dist) {
  const bands = [
    {within: 6, pace: 4},
    {within: 30, pace: 20},
    {within: Infinity, pace: 26},
  ];
  for (const band of bands) {
    if (dist < band.within || (band.within === 30 && dist <= 30)) return band.pace;
  }
  return 26;
}

// A cruiser steers at Rico and rams — but it respects the city: it
// will not drive through a building, and it eases off once it has
// caught up instead of pinning the player forever. Returns true on
// contact.
export function stepPoliceCar(ride, targetX, targetZ, dt, collide) {
  const dx = targetX - ride.x;
  const dz = targetZ - ride.z;
  const dist = Math.hypot(dx, dz) || 1;
  const wanted = Math.atan2(dx, dz);
  const diff = wrapAngle(wanted - ride.angle);
  ride.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  ride.speed += (chasePace(dist) - ride.speed) * dt * 1.2;
  const nx = ride.x + Math.sin(ride.angle) * ride.speed * dt;
  const nz = ride.z + Math.cos(ride.angle) * ride.speed * dt;
  if (collide && collide(nx, nz, 1.8)) {
    // Blocked by a building: stop and edge around it instead of phasing through.
    ride.speed *= 0.4;
    ride.angle += Math.sign(diff || 1) * 0.6 * dt;
  } else {
    ride.x = nx;
    ride.z = nz;
  }
  ride.sirenPhase += dt * 6;
  return dist < 3.2;
}
