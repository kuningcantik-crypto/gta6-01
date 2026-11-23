// Solmar Bay foot traffic: ordinary people who wander the pavements,
// bolt when they hear gunfire or a speeding engine, and end up flat on
// the asphalt when something hits them. They share Rico's boxy build,
// dressed in a handful of different shirts.
import * as THREE from 'three';
import { CITY, PEDS } from './config.js';

// Skin and shirt tones, keyed so a figure picks one by name.
const SKIN_TONES = {pale: 0xf2d0b0, tan: 0xe8b48a, bronze: 0xc98a5a, deep: 0x8a5a3a};
const SHIRT_TONES = {red: 0xd93a2b, blue: 0x2b6fd9, gold: 0xf2c230, green: 0x2bd97a, white: 0xeeeeee, purple: 0x8a5fd9, orange: 0xff7a2b};
const TROUSER_TONE = 0x2b3242;

function pickTone(table, rng) {
  const names = Object.keys(table);
  return table[names[Math.floor(rng.next() * names.length)]];
}

// A limb that hangs from its top edge: the geometry is shifted down so
// rotating the mesh swings it like a real arm or leg.
function danglingLimb(size, fabric, offsetX, hipY) {
  const [w, h, d] = size;
  const shape = new THREE.BoxGeometry(w, h, d);
  shape.translate(0, -h / 2, 0);
  const limb = new THREE.Mesh(shape, fabric);
  limb.position.set(offsetX, hipY, 0);
  return limb;
}

// One passer-by, assembled from a parts list so the torso, head and
// limbs are data rather than a dozen near-identical statements.
export function makePedMesh(rng) {
  const figure = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({color: pickTone(SKIN_TONES, rng)});
  const shirt = new THREE.MeshLambertMaterial({color: pickTone(SHIRT_TONES, rng)});
  const trousers = new THREE.MeshLambertMaterial({color: TROUSER_TONE});

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  figure.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  figure.add(head);

  const leftLeg = danglingLimb([0.2, 0.65, 0.2], trousers, -0.14, 0.65);
  const rightLeg = danglingLimb([0.2, 0.65, 0.2], trousers, 0.14, 0.65);
  leftLeg.castShadow = true;
  rightLeg.castShadow = true;
  figure.add(leftLeg, rightLeg);
  figure.userData.legL = leftLeg;
  figure.userData.legR = rightLeg;
  return figure;
}

// Drop a stroller on a pavement: pick a road, then a point along it, and
// face a random direction. Half of them walk across the road's line,
// half along it.
export function makePed(rng) {
  const road = rng.pick(CITY.roads);
  const along = rng.range(-CITY.half + 10, CITY.half - 10);
  const across = rng.next() < 0.5;
  return {
    x: across ? along : road + 8,
    z: across ? road + 8 : along,
    angle: rng.next() * Math.PI * 2,
    speed: PEDS.walkSpeed * rng.range(0.8, 1.3),
    state: 'walk',
    downTimer: 0,
    target: null,
    mesh: null,
    walkPhase: rng.next() * 10,
  };
}

// The heading that runs straight away from a threat.
function awayFrom(stroller, danger) {
  return Math.atan2(stroller.x - danger.x, stroller.z - danger.z);
}

// One handler per mood. Each decides whether the stroller stays where it
// is this step (true) or keeps moving (false).
const MOODS = {
  down(stroller, dt) {
    stroller.downTimer -= dt;
    if (stroller.downTimer <= 0) {
      stroller.state = 'walk';
      stroller.speed = PEDS.walkSpeed;
    }
    return true;
  },
  walk(stroller, dt, danger) {
    if (!danger) return false;
    stroller.state = 'flee';
    stroller.speed = PEDS.fleeSpeed;
    stroller.angle = awayFrom(stroller, danger);
    return false;
  },
  flee(stroller, dt, danger) {
    if (danger) return false;
    // The scare passes but the legs keep running for a while — a
    // rattled stroller holds its fleeing pace until it is knocked down.
    stroller.state = 'walk';
    return false;
  },
};

// Is this coordinate close to a road line on either axis?
function nearRoadLine(value) {
  return CITY.roads.find((line) => Math.abs(value - line) < 0.8);
}

// Move one stroller a step: mood first, then stride, then maybe a turn
// at a crossing.
export function stepPed(stroller, dt, rng, danger) {
  const held = MOODS[stroller.state](stroller, dt, danger);
  if (held) return;
  const pace = stroller.state === 'flee' ? PEDS.fleeSpeed : stroller.speed;
  stroller.x += Math.sin(stroller.angle) * pace * dt;
  stroller.z += Math.cos(stroller.angle) * pace * dt;
  stroller.walkPhase += dt * pace * 3;
  if (Math.abs(stroller.x) > CITY.half || Math.abs(stroller.z) > CITY.half) stroller.angle += Math.PI;
  const alongAxis = Math.abs(Math.sin(stroller.angle)) > 0.5 ? stroller.x : stroller.z;
  if (nearRoadLine(alongAxis) !== undefined && rng.next() < dt * 0.2) {
    stroller.angle += rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  }
}

export function knockPedDown(stroller) {
  stroller.state = 'down';
  stroller.downTimer = 6;
  stroller.speed = 0;
}
