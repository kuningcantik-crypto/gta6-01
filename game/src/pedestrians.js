// The people of Solmar Bay: they stroll the sidewalks, cross at the
// corners, sprint away from gunfire and fast cars, and go down when hit.
// Same box-and-sphere build as Rico, in a few different shirts.
import * as THREE from 'three';
import { CITY, PEDS } from './config.js';

const SKINS = [0xe8b48a, 0xc98a5a, 0x8a5a3a, 0xf2d0b0];
const SHIRTS = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x8a5fd9, 0xff7a2b];

function personLimb(width, height, depth, material, x, y) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  geo.translate(0, -height / 2, 0);
  const part = new THREE.Mesh(geo, material);
  part.position.set(x, y, 0);
  return part;
}

export function makePedMesh(rng) {
  const figure = new THREE.Group();
  const skinTone = SKINS[Math.floor(rng.next() * SKINS.length)];
  const shirtTone = SHIRTS[Math.floor(rng.next() * SHIRTS.length)];
  const skin = new THREE.MeshLambertMaterial({color: skinTone});
  const shirt = new THREE.MeshLambertMaterial({color: shirtTone});
  const pants = new THREE.MeshLambertMaterial({color: 0x2b3242});

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  figure.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  figure.add(head);

  const legL = personLimb(0.2, 0.65, 0.2, pants, -0.14, 0.65);
  const legR = personLimb(0.2, 0.65, 0.2, pants, 0.14, 0.65);
  legL.castShadow = true;
  legR.castShadow = true;
  figure.add(legL, legR);
  figure.userData.legL = legL;
  figure.userData.legR = legR;
  return figure;
}

export function makePed(rng) {
  const road = CITY.roads[Math.floor(rng.next() * CITY.roads.length)];
  const along = rng.range(-CITY.half + 10, CITY.half - 10);
  const horizontal = rng.next() < 0.5;
  const speed = PEDS.walkSpeed * rng.range(0.8, 1.3);
  return {
    x: horizontal ? along : road + 8,
    z: horizontal ? road + 8 : along,
    angle: rng.next() * Math.PI * 2,
    speed,
    state: 'walk',
    downTimer: 0,
    target: null,
    mesh: null,
    walkPhase: rng.next() * 10,
  };
}

// What a pedestrian does this step, by state. A downed ped counts down
// and gets up; a walking ped that notices danger turns and runs; a fleeing
// ped with no danger in sight slows back to a stroll.
function updatePedState(walker, dt, danger) {
  if (walker.state === 'down') {
    walker.downTimer -= dt;
    if (walker.downTimer <= 0) {
      walker.state = 'walk';
      walker.speed = PEDS.walkSpeed;
    }
    return true;
  }
  if (walker.state === 'walk' && danger) {
    walker.state = 'flee';
    walker.speed = PEDS.fleeSpeed;
    walker.angle = Math.atan2(walker.x - danger.x, walker.z - danger.z);
    return false;
  }
  if (walker.state === 'flee' && !danger) {
    // A ped that stops fleeing keeps its running pace until it is
    // knocked down — nerves do not settle instantly in Solmar Bay.
    walker.state = 'walk';
  }
  return false;
}

// Walk the sidewalk; at a crossing, sometimes turn onto the other one.
export function stepPed(walker, dt, rng, danger) {
  const down = updatePedState(walker, dt, danger);
  if (down) return;
  const pace = walker.state === 'flee' ? PEDS.fleeSpeed : walker.speed;
  walker.x += Math.sin(walker.angle) * pace * dt;
  walker.z += Math.cos(walker.angle) * pace * dt;
  walker.walkPhase += dt * pace * 3;
  const outOfTown = Math.abs(walker.x) > CITY.half || Math.abs(walker.z) > CITY.half;
  if (outOfTown) walker.angle += Math.PI;
  const axisValue = Math.abs(Math.sin(walker.angle)) > 0.5 ? walker.x : walker.z;
  const crossing = CITY.roads.find((r) => Math.abs(axisValue - r) < 0.8);
  if (crossing !== undefined && rng.next() < dt * 0.2) {
    walker.angle += rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  }
}

export function knockPedDown(walker) {
  walker.state = 'down';
  walker.downTimer = 6;
  walker.speed = 0;
}
