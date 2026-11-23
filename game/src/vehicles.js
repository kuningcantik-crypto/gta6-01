// Cars: building them from boxes and cylinders, driving them, traffic
// that follows the road grid, and police cars that chase the player.
// Every mesh is plain geometry — no model files anywhere.
import * as THREE from 'three';
import { CAR, CITY, PALETTE } from './config.js';

function part(w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

const WHEEL_SPOTS = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];

// A low-poly vehicle from boxes: body, cabin, four wheels, headlights.
export function makeCarMesh(color, isPolice) {
  const car = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({color: isPolice ? PALETTE.police : color});
  const body = part(2.0, 0.65, 4.4, paint, 0, 0.55, 0);
  body.castShadow = true;
  car.add(body);
  const glass = new THREE.MeshLambertMaterial({color: 0x1a2733});
  const cabin = part(1.7, 0.6, 2.2, glass, 0, 1.15, -0.2);
  cabin.castShadow = true;
  car.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const tyre = new THREE.MeshLambertMaterial({color: 0x111111});
  const wheels = WHEEL_SPOTS.map(([wx, wz]) => {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    car.add(wheel);
    return wheel;
  });
  const lampMat = new THREE.MeshBasicMaterial({color: 0xfff2b0});
  for (const side of [-0.6, 0.6]) car.add(part(0.4, 0.18, 0.1, lampMat, side, 0.6, 2.22));
  if (isPolice) {
    const red = part(1.1, 0.16, 0.4, new THREE.MeshBasicMaterial({color: 0xff2222}), 0, 1.55, -0.2);
    red.name = 'lightbar';
    const blue = part(1.1, 0.16, 0.4, new THREE.MeshBasicMaterial({color: 0x2244ff}), 0, 1.55, -0.2);
    blue.name = 'lightbar2';
    car.add(red, blue);
  }
  car.userData.wheels = wheels;
  return car;
}

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

// Pick a road and a starting point on it for a traffic vehicle.
export function placeTrafficCar(vehicle, rng) {
  const eastWest = rng.next() < 0.5;
  const road = CITY.roads[Math.floor(rng.next() * CITY.roads.length)];
  const along = rng.range(-CITY.half + 10, CITY.half - 10);
  vehicle.road = road;
  vehicle.dir = rng.next() < 0.5 ? 1 : -1;
  const lane = vehicle.dir > 0 ? 2.5 : -2.5;
  if (eastWest) {
    vehicle.x = along;
    vehicle.z = road + lane;
    vehicle.angle = vehicle.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    vehicle.x = road + lane;
    vehicle.z = along;
    vehicle.angle = vehicle.dir > 0 ? 0 : Math.PI;
  }
  vehicle.speed = 7 + rng.next() * 4;
}

function clampToLimits(vehicle, topSpeed) {
  if (vehicle.speed > topSpeed) vehicle.speed = topSpeed;
  if (vehicle.speed < -CAR.maxReverse) vehicle.speed = -CAR.maxReverse;
}

// Advance one traffic vehicle along its road; at an intersection it may turn.
export function stepTrafficCar(vehicle, dt, rng) {
  const fx = Math.sin(vehicle.angle);
  const fz = Math.cos(vehicle.angle);
  vehicle.x += fx * vehicle.speed * dt;
  vehicle.z += fz * vehicle.speed * dt;
  const across = Math.abs(fx) > 0.5 ? vehicle.x : vehicle.z;
  const crossing = CITY.roads.find((r) => Math.abs(across - r) < 1.2);
  if (crossing !== undefined && rng.next() < dt * 0.25) {
    vehicle.angle += rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  }
  // Wrap around the city edge instead of driving into the ocean.
  // Each entry is [axis, edge, the heading to take when past it].
  const BOUNDS = [
    ['x', CITY.half, Math.PI],
    ['x', -CITY.half, 0],
    ['z', CITY.half, -Math.PI / 2],
    ['z', -CITY.half, Math.PI / 2],
  ];
  for (const [axis, edge, turn] of BOUNDS) {
    const past = edge > 0 ? vehicle[axis] > edge : vehicle[axis] < edge;
    if (past) {
      vehicle[axis] = edge;
      vehicle.angle = turn;
    }
  }
}

// Arcade driving physics for the player's vehicle. Returns true on a hard hit.
// `tune` is the garage engine level (0–3): +12% top speed per level.
export function stepPlayerCar(vehicle, input, dt, collide, tune) {
  const gas = input.held.up ? 1 : 0;
  const brake = input.held.down ? 1 : 0;
  const steerInput = (input.held.left ? 1 : 0) - (input.held.right ? 1 : 0);
  const condition = (vehicle.condition ?? 100) / 100;
  const topSpeed = CAR.maxSpeed * (1 + 0.12 * (tune || 0)) * (0.55 + 0.45 * condition);
  // Gas, brake and coasting: speed chases the top speed the car's
  // condition and garage tune allow. A wrecked vehicle loses top speed too.
  if (gas) vehicle.speed += CAR.accel * dt;
  if (brake) vehicle.speed -= (vehicle.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
  if (gas === 0 && brake === 0) {
    vehicle.speed -= Math.sign(vehicle.speed) * CAR.grip * dt * 0.6;
    if (Math.abs(vehicle.speed) < 0.2) vehicle.speed = 0;
  }
  clampToLimits(vehicle, topSpeed);
  // Steering bites harder the faster the car goes, and reverses with it.
  const bite = Math.min(1, Math.abs(vehicle.speed) / 6) * Math.sign(vehicle.speed || 1);
  vehicle.angle += steerInput * CAR.steer * dt * bite;
  // Move along the heading; a wall stops the car dead instead of letting
  // it phase through.
  const nx = vehicle.x + Math.sin(vehicle.angle) * vehicle.speed * dt;
  const nz = vehicle.z + Math.cos(vehicle.angle) * vehicle.speed * dt;
  const hit = collide(nx, nz, CAR.radius);
  if (hit) vehicle.speed *= 0.3;
  else {
    vehicle.x = nx;
    vehicle.z = nz;
  }
  return hit && Math.abs(vehicle.speed) > 4;
}

// Angles wrap at ±π; this keeps any heading difference in range.
function angleDiff(a) {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

function cruiseSpeed(dist) {
  if (dist < 6) return 4;
  if (dist <= 30) return 20;
  return 26;
}

// A police vehicle steers toward the player and rams — but it respects
// the city: it will not drive through a building, and it eases off once
// it has caught up, instead of pinning the player forever. Returns true
// on contact.
export function stepPoliceCar(vehicle, targetX, targetZ, dt, collide) {
  const dx = targetX - vehicle.x;
  const dz = targetZ - vehicle.z;
  const dist = Math.hypot(dx, dz) || 1;
  const wanted = Math.atan2(dx, dz);
  const diff = angleDiff(wanted - vehicle.angle);
  vehicle.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  vehicle.speed += (cruiseSpeed(dist) - vehicle.speed) * dt * 1.2;
  const nx = vehicle.x + Math.sin(vehicle.angle) * vehicle.speed * dt;
  const nz = vehicle.z + Math.cos(vehicle.angle) * vehicle.speed * dt;
  if (collide && collide(nx, nz, 1.8)) {
    // Blocked by a building: stop and edge around it instead of phasing through.
    vehicle.speed *= 0.4;
    vehicle.angle += Math.sign(diff || 1) * 0.6 * dt;
  } else {
    vehicle.x = nx;
    vehicle.z = nz;
  }
  vehicle.sirenPhase += dt * 6;
  return dist < 3.2;
}
