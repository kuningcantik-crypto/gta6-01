// Cars: building them, driving them, traffic that follows the road grid,
// and police cars that chase the player. All meshes are plain boxes and
// cylinders — no model files.
import * as THREE from 'three';
import { CAR, CITY, PALETTE } from './config.js';

// A low-poly car from boxes: body, cabin, four wheels, headlights.
export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? PALETTE.police : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.6, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1a2733 }),
  );
  cabin.position.set(0, 1.15, -0.2); cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    light.position.set(x, 0.6, 2.22);
    group.add(light);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.55, -0.2);
    bar.name = 'lightbar';
    group.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar2.position.set(0, 1.55, -0.2);
    bar2.name = 'lightbar2';
    group.add(bar2);
  }
  group.userData.wheels = wheels;
  return group;
}

export function makeCar(kind, color, x, z, angle, rng) {
  return {
    id: `${kind}-${Math.floor(rng.next() * 1e9)}`,
    kind, // 'traffic' | 'parked' | 'police' | 'player'
    color,
    x, z, angle,
    speed: 0,
    steer: 0,
    // traffic AI
    road: null, dir: 1, target: null,
    // police AI
    damage: 0, smoke: false, sirenPhase: 0,
    mesh: null,
  };
}

// Pick a road and a starting point on it for a traffic car.
export function placeTrafficCar(car, rng) {
  const horizontal = rng.next() < 0.5;
  const road = CITY.roads[Math.floor(rng.next() * CITY.roads.length)];
  const along = rng.range(-CITY.half + 10, CITY.half - 10);
  car.road = road;
  car.dir = rng.next() < 0.5 ? 1 : -1;
  if (horizontal) {
    car.x = along; car.z = road + (car.dir > 0 ? 2.5 : -2.5);
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.x = road + (car.dir > 0 ? 2.5 : -2.5); car.z = along;
    car.angle = car.dir > 0 ? 0 : Math.PI;
  }
  car.speed = 7 + rng.next() * 4;
}

// Advance one traffic car along its road; at an intersection it may turn.
export function stepTrafficCar(car, dt, rng) {
  const forward = { x: Math.sin(car.angle), z: Math.cos(car.angle) };
  car.x += forward.x * car.speed * dt;
  car.z += forward.z * car.speed * dt;
  // At an intersection (near a crossing road coordinate), sometimes turn.
  const nearRoad = CITY.roads.find((r) => Math.abs((Math.abs(Math.sin(car.angle)) > 0.5 ? car.x : car.z) - r) < 1.2);
  if (nearRoad !== undefined && rng.next() < dt * 0.25) {
    const turn = rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    car.angle += turn;
  }
  // Wrap around the city edge instead of driving into the ocean.
  if (car.x > CITY.half) { car.x = CITY.half; car.angle = Math.PI; }
  if (car.x < -CITY.half) { car.x = -CITY.half; car.angle = 0; }
  if (car.z > CITY.half) { car.z = CITY.half; car.angle = -Math.PI / 2; }
  if (car.z < -CITY.half) { car.z = -CITY.half; car.angle = Math.PI / 2; }
}

// Arcade driving physics for the player's car. Returns true on a hard hit.
// `tune` is the garage engine level (0–3): +12% top speed per level.
// A wrecked car (low condition) loses top speed too.
export function stepPlayerCar(car, input, dt, collide, tune) {
  const forward = input.held.up ? 1 : 0;
  const back = input.held.down ? 1 : 0;
  const steerInput = (input.held.left ? 1 : 0) - (input.held.right ? 1 : 0);
  const condition = (car.condition ?? 100) / 100;
  const maxSpeed = CAR.maxSpeed * (1 + 0.12 * (tune || 0)) * (0.55 + 0.45 * condition);
  if (forward) car.speed += CAR.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
  if (!forward && !back) car.speed -= Math.sign(car.speed) * CAR.grip * dt * 0.6;
  if (Math.abs(car.speed) < 0.2 && !forward && !back) car.speed = 0;
  car.speed = Math.max(-CAR.maxReverse, Math.min(maxSpeed, car.speed));
  const steerAmount = steerInput * CAR.steer * dt * Math.min(1, Math.abs(car.speed) / 6) * Math.sign(car.speed || 1);
  car.angle += steerAmount;
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  const hit = collide(nx, nz, CAR.radius);
  if (hit) {
    if (Math.abs(car.speed) > 12) { /* hard hit handled by caller via speed */ }
    car.speed *= 0.3;
  } else {
    car.x = nx; car.z = nz;
  }
  return hit && Math.abs(car.speed) > 4;
}

// A police car steers toward the player and rams — but it respects the
// city: it will not drive through a building, and it eases off once it has
// caught up, instead of pinning the player forever. Returns true on contact.
export function stepPoliceCar(car, targetX, targetZ, dt, collide) {
  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const dist = Math.hypot(dx, dz) || 1;
  const wanted = Math.atan2(dx, dz);
  let diff = wanted - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  const speed = dist < 6 ? 4 : dist > 30 ? 26 : 20;
  car.speed += (speed - car.speed) * dt * 1.2;
  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  if (collide && collide(nx, nz, 1.8)) {
    // Blocked by a building: stop and edge around it instead of phasing through.
    car.speed *= 0.4;
    car.angle += Math.sign(diff || 1) * 0.6 * dt;
  } else {
    car.x = nx; car.z = nz;
  }
  car.sirenPhase += dt * 6;
  return dist < 3.2;
}
