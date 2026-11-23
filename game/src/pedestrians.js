// The people of Solmar Bay: they walk the sidewalks, cross at the corners,
// run from gunfire and fast cars, and fall over when hit. Same box-and-sphere
// construction as Rico, in a few different shirts.
import * as THREE from 'three';
import { CITY, PEDS } from './config.js';

const SKINS = [0xe8b48a, 0xc98a5a, 0x8a5a3a, 0xf2d0b0];
const SHIRTS = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x8a5fd9, 0xff7a2b];

export function makePedMesh(rng) {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({color: SKINS[Math.floor(rng.next() * SKINS.length)]});
  const shirtMat = new THREE.MeshLambertMaterial({color: SHIRTS[Math.floor(rng.next() * SHIRTS.length)]});
  const legsMat = new THREE.MeshLambertMaterial({color: 0x2b3242});
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirtMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.2), legsMat);
  legL.position.set(-0.14, 0.33, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);
  group.userData.legL = legL;
  group.userData.legR = legR;
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
    state: 'walk',
    downTimer: 0,
    target: null,
    mesh: null,
    walkPhase: rng.next() * 10,
  };
}

// Walk the sidewalk; at a crossing, sometimes turn onto the other one.
export function stepPed(walker, dt, rng, danger) {
  if (walker.state === 'down') {
    walker.downTimer -= dt;
    if (walker.downTimer <= 0) {
      walker.state = 'walk';
      walker.speed = PEDS.walkSpeed;
    }
    return;
  }
  if (danger && walker.state !== 'flee') {
    walker.state = 'flee';
    walker.speed = PEDS.fleeSpeed;
    walker.angle = Math.atan2(walker.x - danger.x, walker.z - danger.z);
  }
  if (walker.state === 'flee' && !danger) walker.state = 'walk';
  const speed = walker.state === 'flee' ? PEDS.fleeSpeed : walker.speed;
  walker.x += Math.sin(walker.angle) * speed * dt;
  walker.z += Math.cos(walker.angle) * speed * dt;
  walker.walkPhase += dt * speed * 3;
  if (Math.abs(walker.x) > CITY.half || Math.abs(walker.z) > CITY.half) walker.angle += Math.PI;
  const near = CITY.roads.find((r) => Math.abs((Math.abs(Math.sin(walker.angle)) > 0.5 ? walker.x : walker.z) - r) < 0.8);
  if (near !== undefined && rng.next() < dt * 0.2) {
    walker.angle += rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  }
}

export function knockPedDown(walker) {
  walker.state = 'down';
  walker.downTimer = 6;
  walker.speed = 0;
}
