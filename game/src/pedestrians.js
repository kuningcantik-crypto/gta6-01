// Pedestrians: ordinary people of Solmar Bay who walk the sidewalks,
// cross at intersections, flee from gunfire and fast cars, and fall when hit.
import * as THREE from 'three';
import { CITY, PEDS } from './config.js';

const SKIN = [0xe8b48a, 0xc98a5a, 0x8a5a3a, 0xf2d0b0];
const SHIRT = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x8a5fd9, 0xff7a2b];

export function makePedMesh(rng) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: SKIN[Math.floor(rng.next() * SKIN.length)] });
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRT[Math.floor(rng.next() * SHIRT.length)] });
  const legs = new THREE.MeshLambertMaterial({ color: 0x2b3242 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  body.position.y = 1.05; body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.62; head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), legs);
  legL.position.set(-0.14, 0.33, 0); group.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; group.add(legR);
  group.userData.legL = legL; group.userData.legR = legR;
  return group;
}

export function makePed(rng) {
  const road = CITY.roads[Math.floor(rng.next() * CITY.roads.length)];
  const along = rng.range(-CITY.half + 10, CITY.half - 10);
  const horizontal = rng.next() < 0.5;
  return {
    x: horizontal ? along : road + 8,
    z: horizontal ? road + 8 : along,
    angle: rng.next() * Math.PI * 2,
    speed: PEDS.walkSpeed * rng.range(0.8, 1.3),
    state: 'walk', // 'walk' | 'flee' | 'down'
    downTimer: 0,
    target: null,
    mesh: null,
    walkPhase: rng.next() * 10,
  };
}

// Walk along a sidewalk; pick a new direction at intersections.
export function stepPed(ped, dt, rng, danger) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) { ped.state = 'walk'; ped.speed = PEDS.walkSpeed; }
    return;
  }
  if (danger && ped.state !== 'flee') {
    ped.state = 'flee';
    ped.speed = PEDS.fleeSpeed;
    ped.angle = Math.atan2(ped.x - danger.x, ped.z - danger.z);
  }
  if (ped.state === 'flee' && !danger) ped.state = 'walk';
  const speed = ped.state === 'flee' ? PEDS.fleeSpeed : ped.speed;
  ped.x += Math.sin(ped.angle) * speed * dt;
  ped.z += Math.cos(ped.angle) * speed * dt;
  ped.walkPhase += dt * speed * 3;
  // Stay inside the city; turn around at the edge.
  if (Math.abs(ped.x) > CITY.half || Math.abs(ped.z) > CITY.half) ped.angle += Math.PI;
  // At an intersection, sometimes turn onto the crossing sidewalk.
  const near = CITY.roads.find((r) => Math.abs((Math.abs(Math.sin(ped.angle)) > 0.5 ? ped.x : ped.z) - r) < 0.8);
  if (near !== undefined && rng.next() < dt * 0.2) ped.angle += rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
}

export function knockPedDown(ped) {
  ped.state = 'down';
  ped.downTimer = 6;
  ped.speed = 0;
}
