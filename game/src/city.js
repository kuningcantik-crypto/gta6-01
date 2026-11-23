// Solmar Bay, built: streets, blocks, instanced towers, palms,
// lamps, the beach and sea, the pier, clouds, signs, tram rails and
// stops. Towers share one InstancedMesh per facade colour, so the
// whole city costs a handful of draw calls instead of hundreds. Every
// position comes from the seeded RNG, so ?seed=N always rebuilds the
// same city.
import * as THREE from 'three';
import { CITY, DISTRICTS, PALETTE } from './config.js';

const GRASS_TONE = 0x6b7c5e;
const ROAD_TONE = 0x33363d;
const LINE_TONE = 0xf5d76e;
const SAND_TONE = 0xe8cf9a;
const SEA_TONE = 0x2a7fa8;

// A solid box that casts and catches shadows.
function brick(w, h, d, color, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({color, ...opts}),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A flat sheet lying on the ground, catching shadows.
function sheet(w, d, color, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({color, ...opts}),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

// One InstancedMesh from a list of matrices, added to the stage.
function batch(stage, geo, mat, matrices, shadow = false) {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  for (let i = 0; i < matrices.length; i += 1) mesh.setMatrixAt(i, matrices[i]);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  stage.add(mesh);
  return mesh;
}

// A flat matrix: a ground-facing quad at (x, z), scaled (w, d).
function flatQuad(x, z, w, d) {
  const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  m.premultiply(new THREE.Matrix4().makeTranslation(x, 0.02, z));
  m.multiply(new THREE.Matrix4().makeScale(w, d, 1));
  return m;
}

// Window texture: one shared canvas gives every tower lit windows
// without a texture per building.
function windowTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  let y = 8;
  while (y < 248) {
    let x = 8;
    while (x < 120) {
      ctx.fillStyle = rng.next() < 0.55 ? '#2a2f3a' : '#ffd76e';
      ctx.fillRect(x, y, 10, 10);
      x += 16;
    }
    y += 16;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A sign board texture with centred text.
function signTexture(text, bg = '#1b2b4a', fg = '#ffd76e') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = fg;
  ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function paveRoads(stage) {
  const lawn = sheet(CITY.half * 2 + 60, CITY.half * 2 + 60, GRASS_TONE);
  stage.add(lawn);
  for (let i = 0; i < CITY.roads.length; i += 1) {
    const c = CITY.roads[i];
    const v = sheet(CITY.roadWidth, CITY.half * 2, ROAD_TONE);
    v.position.set(c, 0.01, 0);
    stage.add(v);
    const h = sheet(CITY.half * 2, CITY.roadWidth, ROAD_TONE);
    h.position.set(0, 0.01, c);
    stage.add(h);
  }
  // Centre dashes: one InstancedMesh for ~420 dashes, not 420 meshes.
  const dashMatrices = [];
  for (const c of CITY.roads) {
    for (let d = -CITY.half + 6; d < CITY.half; d += 12) {
      dashMatrices.push(flatQuad(c, d, 0.5, 3));
      dashMatrices.push(flatQuad(d, c, 3, 0.5));
    }
  }
  batch(stage, new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({color: LINE_TONE}), dashMatrices);
}

// Tram rails: two steel strips down the middle of the loop road
// (x = ±104, z = ±104), plus a stop board at each corner.
function setRails(stage) {
  const half = 104;
  const steel = new THREE.MeshLambertMaterial({color: 0x5a5f68});
  const railMatrices = [];
  for (const side of [-half, half]) {
    for (const off of [-0.9, 0.9]) {
      railMatrices.push(flatQuad(side + off, 0, 0.35, half * 2));
      railMatrices.push(flatQuad(0, side + off, half * 2, 0.35));
    }
  }
  batch(stage, new THREE.PlaneGeometry(1, 1), steel, railMatrices);
  const stops = [
    {x: -half - 8, z: half, text: 'TRAM · PLAZA SOUTH'},
    {x: half + 8, z: half, text: 'TRAM · MARINA EAST'},
    {x: half + 8, z: -half, text: 'TRAM · HOTEL NORTH'},
    {x: -half - 8, z: -half, text: 'TRAM · DOCKS WEST'},
  ];
  for (const s of stops) {
    const post = brick(0.25, 2.6, 0.25, 0x2a7fa8);
    post.position.set(s.x, 1.3, s.z);
    stage.add(post);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 1.6),
      new THREE.MeshBasicMaterial({map: signTexture(s.text, '#14586e', '#ffffff'), side: THREE.DoubleSide}),
    );
    board.position.set(s.x, 3, s.z);
    board.rotation.y = Math.PI / 4;
    stage.add(board);
  }
}

// Towers, one InstancedMesh per facade colour. Returns the collision
// boxes the world uses to keep cars and feet out of buildings.
function raiseTowers(stage, rng) {
  const colliders = [];
  const skin = windowTexture(rng);
  const facades = [0x9aa3ad, 0xb0a89a, 0x8a9bb0, 0xa89080, 0x7a8a9a, 0xc0b49a];
  const byColour = new Map();
  const trimMatrices = [];
  const roofMatrices = [];
  for (const bx of CITY.blockCentres) {
    for (const bz of CITY.blockCentres) {
      if (bx === 0 && bz === 0) continue; // the central plaza stays open
      const landmark = (bx === 26 && bz === -26) || (bx === 130 && bz === -78);
      const bw = landmark ? 34 : 24 + rng.next() * 8;
      const bd = landmark ? 34 : 24 + rng.next() * 8;
      const height = landmark ? 26 : 6 + rng.next() * 16;
      const color = landmark ? 0xd8c49a : rng.pick(facades);
      const m = new THREE.Matrix4().makeTranslation(bx, height / 2, bz);
      m.multiply(new THREE.Matrix4().makeScale(bw / 16, height / 16, bd / 16));
      if (!byColour.has(color)) byColour.set(color, []);
      byColour.get(color).push(m);
      // Roof trim and a rooftop box, so towers read as buildings.
      // Both are instanced below, not one mesh per block.
      const trim = new THREE.Matrix4().makeTranslation(bx, height + 0.25, bz);
      trim.multiply(new THREE.Matrix4().makeScale(bw + 0.6, 0.5, bd + 0.6));
      trimMatrices.push(trim);
      if (rng.next() < 0.7) {
        const roof = new THREE.Matrix4().makeTranslation(
          bx + (rng.next() - 0.5) * (bw - 8), height + 1.5, bz + (rng.next() - 0.5) * (bd - 8),
        );
        roof.multiply(new THREE.Matrix4().makeScale(4, 3, 4));
        roofMatrices.push(roof);
      }
      colliders.push({x0: bx - bw / 2, x1: bx + bw / 2, z0: bz - bd / 2, z1: bz + bd / 2});
    }
  }
  const unit = new THREE.BoxGeometry(16, 16, 16);
  for (const [color, matrices] of byColour) {
    const material = new THREE.MeshLambertMaterial({color, map: skin});
    const inst = new THREE.InstancedMesh(unit, material, matrices.length);
    matrices.forEach((mat, i) => inst.setMatrixAt(i, mat));
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    stage.add(inst);
  }
  batch(stage, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({color: 0x6b5a44}), trimMatrices, true);
  batch(stage, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({color: 0x8a8f98}), roofMatrices, true);
  return {colliders};
}

function plantSigns(stage) {
  // District name boards on posts, at the plaza corners.
  const spots = [
    {x: -8, z: -8, text: 'CENTRAL PLAZA', ry: Math.PI / 4},
    {x: 120, z: -68, text: 'HOTEL ROW', ry: -Math.PI / 3},
    {x: 16, z: -16, text: 'BANK DISTRICT', ry: Math.PI / 2},
    {x: -120, z: -120, text: 'SAFEHOUSE', ry: Math.PI / 4},
  ];
  for (let i = 0; i < spots.length; i += 1) {
    const s = spots[i];
    const post = brick(0.3, 3, 0.3, 0x444444);
    post.position.set(s.x, 1.5, s.z);
    stage.add(post);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2.5),
      new THREE.MeshBasicMaterial({map: signTexture(s.text), side: THREE.DoubleSide}),
    );
    board.position.set(s.x, 3.4, s.z);
    board.rotation.y = s.ry;
    stage.add(board);
  }
}

function plantPalms(stage, rng) {
  const trunkMat = new THREE.MeshLambertMaterial({color: 0x7a5a3a});
  const leafMat = new THREE.MeshLambertMaterial({color: 0x3f8a4a, side: THREE.DoubleSide});
  const spots = [];
  // Beach row, one palm every 18 m with a jittered spot.
  for (let x = -170; x <= 170; x += 18) {
    spots.push([x + (rng.next() - 0.5) * 8, 186 + rng.next() * 6]);
  }
  // Roadside palms, one side of a random road each.
  for (let i = 0; i < 26; i += 1) {
    const road = rng.pick(CITY.roads);
    const side = rng.next() < 0.5 ? -9 : 9;
    spots.push([road + side, -170 + rng.next() * 340]);
  }
  // One instanced trunk and one instanced leaf set per palm,
  // not seven meshes per tree.
  const trunkMatrices = [];
  const leafMatrices = [];
  for (const [x, z] of spots) {
    const yaw = rng.next() * Math.PI * 2;
    const trunk = new THREE.Matrix4().makeRotationY(yaw);
    trunk.setPosition(x, 2.5, z);
    trunkMatrices.push(trunk);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      // The leaf's world orientation is the palm yaw times the leaf
      // tilt: Ry(yaw) * Ry(-a) * Rx(0.5), alias Euler(0.5, yaw - a, 0, 'YXZ').
      // The leaf offset rotates the same way: angle (a - yaw).
      const leafQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, yaw - a, 0, 'YXZ'));
      leafMatrices.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x + Math.cos(a - yaw) * 1.4, 5.2, z + Math.sin(a - yaw) * 1.4),
        leafQuat,
        new THREE.Vector3(1, 1, 1),
      ));
    }
  }
  batch(stage, new THREE.CylinderGeometry(0.25, 0.4, 5, 6), trunkMat, trunkMatrices, true);
  batch(stage, new THREE.PlaneGeometry(3.4, 0.9), leafMat, leafMatrices);
}

function setLamps(stage) {
  const poleMat = new THREE.MeshLambertMaterial({color: 0x2a2f3a});
  const bulbMat = new THREE.MeshBasicMaterial({color: 0xffe9b0});
  // One lamp post per road, every 52 m: pole matrix and bulb matrix
  // share the same street position, 3 m apart in height.
  const lampSpots = [];
  for (const c of CITY.roads) {
    for (let d = -CITY.half + 26; d < CITY.half; d += 52) {
      lampSpots.push({x: c + 7, z: d});
    }
  }
  const poleMatrices = lampSpots.map((s) => new THREE.Matrix4().makeTranslation(s.x, 3, s.z));
  const bulbMatrices = lampSpots.map((s) => new THREE.Matrix4().makeTranslation(s.x, 6.2, s.z));
  batch(stage, new THREE.CylinderGeometry(0.12, 0.12, 6, 6), poleMat, poleMatrices);
  batch(stage, new THREE.SphereGeometry(0.35, 8, 6), bulbMat, bulbMatrices);
}

// Beach umbrellas: colourful cones on poles along the sand, pure
// decoration — they never move and never collide.
function plantUmbrellas(stage) {
  const umbrellaColors = [0xff5fa2, 0xffd76e, 0x7dd8ff, 0xff7a2b];
  for (let i = 0; i < 4; i += 1) {
    const ux = -120 + i * 80;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6),
      new THREE.MeshLambertMaterial({color: 0x8a6b4a}),
    );
    pole.position.set(ux, 1.1, 188);
    stage.add(pole);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1, 8),
      new THREE.MeshLambertMaterial({color: umbrellaColors[i % umbrellaColors.length]}),
    );
    canopy.position.set(ux, 2.6, 188);
    stage.add(canopy);
  }
}

function buildShore(stage, rng) {
  // Sand sheet and the sea behind it.
  const sand = sheet(CITY.half * 2 + 60, 30, SAND_TONE);
  sand.position.set(0, 0.02, CITY.beachZ + 8);
  stage.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 120),
    new THREE.MeshLambertMaterial({color: SEA_TONE}),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.4, CITY.oceanZ + 40);
  ocean.name = 'ocean';
  stage.add(ocean);
  plantUmbrellas(stage);
  // The pier: a wooden deck on posts, reaching out to sea at x = 0.
  const deck = brick(8, 0.6, 34, 0x8a6b4a);
  deck.position.set(0, 0.8, 196);
  stage.add(deck);
  for (let z = 182; z <= 210; z += 7) {
    for (const x of [-3.4, 3.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6), new THREE.MeshLambertMaterial({color: 0x6b4a2a}));
      post.position.set(x, -0.2, z);
      stage.add(post);
    }
  }
  // Boats sailing the bay: each boat is a group the renderer moves
  // along its lane while it rocks gently. The lanes sit behind the
  // pier so no boat ever crosses the beach.
  const boats = [
    [0, 232, 2.2, 0, 0xe8e8e8],
    [1, 242, 1.6, 90, 0xff8a5e],
    [2, 252, 2.8, 170, 0x7dd8ff],
  ];
  for (const [i, lane, speed, phase, color] of boats) {
    const boat = new THREE.Group();
    boat.name = 'boat-' + i;
    boat.userData = {lane, speed, phase};
    const hull = brick(3, 1.2, 8, color);
    hull.position.set(0, 0.2, 0);
    boat.add(hull);
    const cabin = brick(2, 1, 3, 0xffffff);
    cabin.position.set(0, 1.2, 0);
    boat.add(cabin);
    boat.position.set(phase - 130, 0, lane);
    stage.add(boat);
  }
}

// The ferris wheel on the pier: legs, a turning rotor, spokes and
// cabins. The rotor group spins in render.js; the cabins counter-spin
// there so they stay upright.
function buildWheel(stage) {
  const wheel = new THREE.Group();
  wheel.name = 'ferris-wheel';
  wheel.position.set(0, 0, 210);
  const legMat = new THREE.MeshLambertMaterial({color: 0xd8d8e0});
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12.5, 0.5), legMat);
    leg.position.set(side * 2.1, 6.2, 0);
    leg.rotation.z = -side * 0.18;
    wheel.add(leg);
  }
  const rotor = new THREE.Group();
  rotor.name = 'ferris-rotor';
  rotor.position.set(0, 11, 0);
  const rimMat = new THREE.MeshLambertMaterial({color: 0xff5fa2});
  const rim = new THREE.Mesh(new THREE.TorusGeometry(9, 0.25, 6, 32), rimMat);
  rotor.add(rim);
  const spokeMat = new THREE.MeshLambertMaterial({color: 0xffe9b0});
  for (let i = 0; i < 4; i += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, 17.6, 0.3), spokeMat);
    spoke.rotation.z = (i * Math.PI) / 4;
    rotor.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 10), spokeMat);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);
  const cabinColors = [0xff5fa2, 0xffd76e, 0x7dd8ff, 0x9dff8a];
  const cabins = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 1.4, 1.4),
      new THREE.MeshLambertMaterial({color: cabinColors[i % cabinColors.length]}),
    );
    cabin.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0);
    rotor.add(cabin);
    cabins.push(cabin);
  }
  rotor.userData.cabins = cabins;
  wheel.add(rotor);
  stage.add(wheel);
}

// The pier lighthouse: a striped tower with a lamp room, and a beam
// on a pivot the renderer sweeps across the bay.
function buildBeacon(stage) {
  const tower = new THREE.Group();
  tower.name = 'lighthouse';
  tower.position.set(6, 0, 208);
  const stripeA = new THREE.MeshLambertMaterial({color: 0xf2e3c6});
  const stripeB = new THREE.MeshLambertMaterial({color: 0xd93a2b});
  for (let i = 0; i < 5; i += 1) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6 - i * 0.12, 1.8 - i * 0.12, 2.4, 10),
      i % 2 ? stripeB : stripeA,
    );
    seg.position.y = 1.2 + i * 2.4;
    tower.add(seg);
  }
  const lampRoom = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 1.6, 10),
    new THREE.MeshLambertMaterial({color: 0x1a2733}),
  );
  lampRoom.position.y = 13.2;
  tower.add(lampRoom);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 10, 8),
    new THREE.MeshBasicMaterial({color: 0xfff2b0}),
  );
  lamp.position.y = 13.2;
  tower.add(lamp);
  // The beam: a see-through cone, tip at the lamp, swept by the pivot.
  const pivot = new THREE.Group();
  pivot.name = 'lighthouse-beam-pivot';
  pivot.position.set(0, 13.2, 0);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(3.5, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false}),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(13, 0, 0);
  pivot.add(beam);
  tower.add(pivot);
  stage.add(tower);
}

function buildPlaza(stage) {
  // Central plaza: a paved disc with a fountain, left open for action.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(16, 24),
    new THREE.MeshLambertMaterial({color: 0x9a938a}),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 0.02, 0);
  disc.receiveShadow = true;
  stage.add(disc);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.4, 1, 20),
    new THREE.MeshLambertMaterial({color: 0x7a8a9a}),
  );
  rim.position.set(0, 0.5, 0);
  stage.add(rim);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 20),
    new THREE.MeshLambertMaterial({color: 0x2a7fa8}),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 1.05, 0);
  stage.add(water);
}

function driftClouds(stage, rng) {
  const clouds = [];
  const mat = new THREE.MeshLambertMaterial({color: 0xffd9c0, transparent: true, opacity: 0.85});
  for (let i = 0; i < 8; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + rng.next() * 5, 8, 6), mat);
      puff.position.set(j * 7 - 7, rng.next() * 2, (rng.next() - 0.5) * 6);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(-240 + rng.next() * 480, 55 + rng.next() * 25, -200 + rng.next() * 320);
    stage.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

export function buildCity(stage, rng) {
  paveRoads(stage);
  const {colliders} = raiseTowers(stage, rng);
  setRails(stage);
  plantSigns(stage);
  plantPalms(stage, rng);
  setLamps(stage);
  buildShore(stage, rng);
  buildWheel(stage);
  buildBeacon(stage);
  buildPlaza(stage);
  const clouds = driftClouds(stage, rng);
  return {colliders, clouds};
}
