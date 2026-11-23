// The people of Solmar Bay: they stroll the sidewalks, cross at the
// corners, sprint away from gunfire and fast cars, and go down when hit.
// Same box-and-sphere build as Rico, in a few different shirts.
import * as THREE from 'three';
import { CITY, PEDS } from './config.js';

const SKIN_TONES = [0xe8b48a, 0xc98a5a, 0x8a5a3a, 0xf2d0b0];
const SHIRT_COLORS = [0xd93a2b, 0x2b6fd9, 0xf2c230, 0x2bd97a, 0xeeeeee, 0x8a5fd9, 0xff7a2b];

function hangingLimb(w, h, d, material, x, y) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0);
  const part = new THREE.Mesh(geo, material);
  part.position.set(x, y, 0);
  return part;
}

export function makePedMesh(rng) {
  const figure = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({color: SKIN_TONES[Math.floor(rng.next() * SKIN_TONES.length)]});
  const shirt = new THREE.MeshLambertMaterial({color: SHIRT_COLORS[Math.floor(rng.next() * SHIRT_COLORS.length)]});
  const pants = new THREE.MeshLambertMaterial({color: 0x2b3242});

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  figure.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  figure.add(head);

  const legL = hangingLimb(0.2, 0.65, 0.2, pants, -0.14, 0.65);
  const legR = hangingLimb(0.2, 0.65, 0.2, pants, 0.14, 0.65);
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

// State machine for one pedestrian. A downed ped counts down and gets
// up; a walking ped that notices danger turns and runs; a fleeing ped
// with no danger in sight slows back to a stroll. Returns true when the
// ped stays down this step.
function advancePedState(walker, dt, danger) {
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
  if (advancePedState(walker, dt, danger)) return;
  const pace = walker.state === 'flee' ? PEDS.fleeSpeed : walker.speed;
  walker.x += Math.sin(walker.angle) * pace * dt;
  walker.z += Math.cos(walker.angle) * pace * dt;
  walker.walkPhase += dt * pace * 3;
  if (Math.abs(walker.x) > CITY.half || Math.abs(walker.z) > CITY.half) walker.angle += Math.PI;
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
