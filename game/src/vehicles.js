// Cars: building them from boxes and cylinders, driving them, traffic
// that follows the road grid, and police cars that chase the player.
// All meshes are plain geometry — no model files.
import * as THREE from 'three';
import { CAR, CITY, PALETTE } from './config.js';

// A low-poly vehicle from boxes: body, cabin, four wheels, headlights.
export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({color: isPolice ? PALETTE.police : color});
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const glass = new THREE.MeshLambertMaterial({color: 0x1a2733});
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glass);
  cabin.position.set(0, 1.15, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({color: 0x111111});
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  const lampMat = new THREE.MeshBasicMaterial({color: 0xfff2b0});
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lampMat);
    lamp.position.set(x, 0.6, 2.22);
    group.add(lamp);
  }
  if (isPolice) {
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshBasicMaterial({color: 0xff2222}),
    );
    red.position.set(0, 1.55, -0.2);
    red.name = 'lightbar';
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshBasicMaterial({color: 0x2244ff}),
    );
    blue.position.set(0, 1.55, -0.2);
    blue.name = 'lightbar2';
    group.add(blue);
  }
  group.userData.wheels = wheels;
  return group;
}

export function makeCar(kind, color, x, z, angle, rng) {
  return {
    id: `${kind}-${Math.floor(rng.next() * 1e9)}`,
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
  const horizontal = rng.next() < 0.5;
  const road = CITY.roads[Math.floor(rng.next() * CITY.roads.length)];
  const along = rng.range(-CITY.half + 10, CITY.half - 10);
  vehicle.road = road;
  vehicle.dir = rng.next() < 0.5 ? 1 : -1;
  if (horizontal) {
    vehicle.x = along;
    vehicle.z = road + (vehicle.dir > 0 ? 2.5 : -2.5);
    vehicle.angle = vehicle.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    vehicle.x = road + (vehicle.dir > 0 ? 2.5 : -2.5);
    vehicle.z = along;
    vehicle.angle = vehicle.dir > 0 ? 0 : Math.PI;
  }
  vehicle.speed = 7 + rng.next() * 4;
}

// Advance one traffic vehicle along its road; at an intersection it may turn.
export function stepTrafficCar(vehicle, dt, rng) {
  const fx = Math.sin(vehicle.angle);
  const fz = Math.cos(vehicle.angle);
  vehicle.x += fx * vehicle.speed * dt;
  vehicle.z += fz * vehicle.speed * dt;
  const across = Math.abs(fx) > 0.5 ? vehicle.x : vehicle.z;
  const nearRoad = CITY.roads.find((r) => Math.abs(across - r) < 1.2);
  if (nearRoad !== undefined && rng.next() < dt * 0.25) {
    vehicle.angle += rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  }
  // Wrap around the city edge instead of driving into the ocean.
  if (vehicle.x > CITY.half) {
    vehicle.x = CITY.half;
    vehicle.angle = Math.PI;
  }
  if (vehicle.x < -CITY.half) {
    vehicle.x = -CITY.half;
    vehicle.angle = 0;
  }
  if (vehicle.z > CITY.half) {
    vehicle.z = CITY.half;
    vehicle.angle = -Math.PI / 2;
  }
  if (vehicle.z < -CITY.half) {
    vehicle.z = -CITY.half;
    vehicle.angle = Math.PI / 2;
  }
}

// Arcade driving physics for the player's vehicle. Returns true on a hard hit.
// `tune` is the garage engine level (0–3): +12% top speed per level.
// A wrecked vehicle (low condition) loses top speed too.
export function stepPlayerCar(vehicle, input, dt, collide, tune) {
  const gas = input.held.up ? 1 : 0;
  const brake = input.held.down ? 1 : 0;
  const steerInput = (input.held.left ? 1 : 0) - (input.held.right ? 1 : 0);
  const condition = (vehicle.condition ?? 100) / 100;
  const topSpeed = CAR.maxSpeed * (1 + 0.12 * (tune || 0)) * (0.55 + 0.45 * condition);
  if (gas) vehicle.speed += CAR.accel * dt;
  if (brake) vehicle.speed -= (vehicle.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
  if (!gas && !brake) vehicle.speed -= Math.sign(vehicle.speed) * CAR.grip * dt * 0.6;
  if (Math.abs(vehicle.speed) < 0.2 && !gas && !brake) vehicle.speed = 0;
  vehicle.speed = Math.max(-CAR.maxReverse, Math.min(topSpeed, vehicle.speed));
  const steerAmount = steerInput * CAR.steer * dt * Math.min(1, Math.abs(vehicle.speed) / 6) * Math.sign(vehicle.speed || 1);
  vehicle.angle += steerAmount;
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

// A police vehicle steers toward the player and rams — but it respects the
// city: it will not drive through a building, and it eases off once it has
// caught up, instead of pinning the player forever. Returns true on contact.
export function stepPoliceCar(vehicle, targetX, targetZ, dt, collide) {
  const dx = targetX - vehicle.x;
  const dz = targetZ - vehicle.z;
  const dist = Math.hypot(dx, dz) || 1;
  const wanted = Math.atan2(dx, dz);
  let diff = wanted - vehicle.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  vehicle.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  const cruise = dist < 6 ? 4 : dist > 30 ? 26 : 20;
  vehicle.speed += (cruise - vehicle.speed) * dt * 1.2;
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
