// The city: roads, blocks, instanced buildings, palms, lamps, ocean,
// beach, pier, clouds and signs. Buildings are THREE.InstancedMesh (one
// draw call per facade colour), so the whole city costs a handful of
// calls instead of hundreds. Everything is placed from the seeded RNG, so
// ?seed=N rebuilds the same city every time.
import * as THREE from 'three';
import { CITY, DISTRICTS, PALETTE } from './config.js';

const GROUND_COLOR = 0x6b7c5e;
const ROAD_COLOR = 0x33363d;
const LINE_COLOR = 0xf5d76e;
const SAND_COLOR = 0xe8cf9a;
const WATER_COLOR = 0x2a7fa8;

function solidBox(w, h, d, color, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({color, ...opts}),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function groundPlane(w, d, color, opts = {}) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({color, ...opts}),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

// One InstancedMesh per facade colour: a whole district's towers in a
// single draw call. Windows are a canvas texture, shared by every tower.
function windowTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      ctx.fillStyle = rng.next() < 0.55 ? '#2a2f3a' : '#ffd76e';
      ctx.fillRect(x, y, 10, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Add one InstancedMesh from a list of matrices to the scene.
function placeInstanced(scene, geo, mat, matrices, shadow = false) {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

// A flat matrix: position on the ground, lying face-up, scaled to (w, d).
function flatMatrix(x, z, w, d) {
  const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  m.premultiply(new THREE.Matrix4().makeTranslation(x, 0.02, z));
  m.multiply(new THREE.Matrix4().makeScale(w, d, 1));
  return m;
}

function paveRoads(scene) {
  const ground = groundPlane(CITY.half * 2 + 60, CITY.half * 2 + 60, GROUND_COLOR);
  scene.add(ground);
  for (const c of CITY.roads) {
    const v = groundPlane(CITY.roadWidth, CITY.half * 2, ROAD_COLOR);
    v.position.set(c, 0.01, 0);
    scene.add(v);
    const h = groundPlane(CITY.half * 2, CITY.roadWidth, ROAD_COLOR);
    h.position.set(0, 0.01, c);
    scene.add(h);
  }
  // Centre dashes: one InstancedMesh for all ~420 of them, not 420 meshes.
  const dashMatrices = [];
  for (const c of CITY.roads) {
    for (let d = -CITY.half + 6; d < CITY.half; d += 12) {
      dashMatrices.push(flatMatrix(c, d, 0.5, 3));
      dashMatrices.push(flatMatrix(d, c, 3, 0.5));
    }
  }
  placeInstanced(scene, new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({color: LINE_COLOR}), dashMatrices);
}

function raiseBlocks(scene, rng) {
  const colliders = [];
  const winTex = windowTexture(rng);
  const palette = [0x9aa3ad, 0xb0a89a, 0x8a9bb0, 0xa89080, 0x7a8a9a, 0xc0b49a];
  const byColour = new Map();
  const trimMatrices = [];
  const rooftopMatrices = [];
  for (const bx of CITY.blockCentres) {
    for (const bz of CITY.blockCentres) {
      if (bx === 0 && bz === 0) continue; // central plaza stays open
      const isLandmark = (bx === 26 && bz === -26) || (bx === 130 && bz === -78);
      const bw = isLandmark ? 34 : 24 + rng.next() * 8;
      const bd = isLandmark ? 34 : 24 + rng.next() * 8;
      const height = isLandmark ? 26 : 6 + rng.next() * 16;
      const color = isLandmark ? 0xd8c49a : rng.pick(palette);
      const m = new THREE.Matrix4().makeTranslation(bx, height / 2, bz);
      const s = new THREE.Matrix4().makeScale(bw / 16, height / 16, bd / 16);
      m.multiply(s);
      if (!byColour.has(color)) byColour.set(color, []);
      byColour.get(color).push(m);
      // Roof trim + a rooftop box, so towers read as buildings, not slabs.
      // Both are instanced below, not one mesh per block.
      trimMatrices.push(
        new THREE.Matrix4().makeTranslation(bx, height + 0.25, bz)
          .multiply(new THREE.Matrix4().makeScale(bw + 0.6, 0.5, bd + 0.6)),
      );
      if (rng.next() < 0.7) {
        rooftopMatrices.push(
          new THREE.Matrix4().makeTranslation(
            bx + (rng.next() - 0.5) * (bw - 8), height + 1.5, bz + (rng.next() - 0.5) * (bd - 8),
          ).multiply(new THREE.Matrix4().makeScale(4, 3, 4)),
        );
      }
      colliders.push({x0: bx - bw / 2, x1: bx + bw / 2, z0: bz - bd / 2, z1: bz + bd / 2});
    }
  }
  // One InstancedMesh per colour.
  const unit = new THREE.BoxGeometry(16, 16, 16);
  for (const [color, matrices] of byColour) {
    const material = new THREE.MeshLambertMaterial({color, map: winTex});
    const inst = new THREE.InstancedMesh(unit, material, matrices.length);
    matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }
  placeInstanced(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({color: 0x6b5a44}), trimMatrices, true);
  placeInstanced(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({color: 0x8a8f98}), rooftopMatrices, true);
  return {colliders};
}

function labelTexture(text, bg = '#1b2b4a', fg = '#ffd76e') {
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

function plantSigns(scene) {
  // District name boards on posts at the plaza corners.
  const spots = [
    {x: -8, z: -8, text: 'CENTRAL PLAZA', ry: Math.PI / 4},
    {x: 120, z: -68, text: 'HOTEL ROW', ry: -Math.PI / 3},
    {x: 16, z: -16, text: 'BANK DISTRICT', ry: Math.PI / 2},
    {x: -120, z: -120, text: 'SAFEHOUSE', ry: Math.PI / 4},
  ];
  for (const s of spots) {
    const post = solidBox(0.3, 3, 0.3, 0x444444);
    post.position.set(s.x, 1.5, s.z);
    scene.add(post);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2.5),
      new THREE.MeshBasicMaterial({map: labelTexture(s.text), side: THREE.DoubleSide}),
    );
    board.position.set(s.x, 3.4, s.z);
    board.rotation.y = s.ry;
    scene.add(board);
  }
}

function plantPalms(scene, rng) {
  const trunkMat = new THREE.MeshLambertMaterial({color: 0x7a5a3a});
  const leafMat = new THREE.MeshLambertMaterial({color: 0x3f8a4a, side: THREE.DoubleSide});
  const spots = [];
  // Beach row.
  for (let x = -170; x <= 170; x += 18) spots.push([x + (rng.next() - 0.5) * 8, 186 + rng.next() * 6]);
  // Roadside palms.
  for (let i = 0; i < 26; i += 1) {
    const road = rng.pick(CITY.roads);
    spots.push([road + (rng.next() < 0.5 ? -9 : 9), -170 + rng.next() * 340]);
  }
  // One instanced trunk and one instanced leaf set for every palm, instead
  // of seven meshes per tree.
  const trunkMatrices = [];
  const leafMatrices = [];
  for (const [x, z] of spots) {
    const yaw = rng.next() * Math.PI * 2;
    const trunk = new THREE.Matrix4().makeRotationY(yaw);
    trunk.setPosition(x, 2.5, z);
    trunkMatrices.push(trunk);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      // World orientation is the palm's yaw times the leaf's own tilt:
      // Ry(yaw) * Ry(-a) * Rx(0.5), i.e. Euler(0.5, yaw - a, 0, 'YXZ').
      // The leaf offset rotates the same way: angle (a - yaw).
      const leafQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, yaw - a, 0, 'YXZ'));
      leafMatrices.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x + Math.cos(a - yaw) * 1.4, 5.2, z + Math.sin(a - yaw) * 1.4),
        leafQuat,
        new THREE.Vector3(1, 1, 1),
      ));
    }
  }
  placeInstanced(scene, new THREE.CylinderGeometry(0.25, 0.4, 5, 6), trunkMat, trunkMatrices, true);
  placeInstanced(scene, new THREE.PlaneGeometry(3.4, 0.9), leafMat, leafMatrices);
}

function plantLamps(scene) {
  const poleMat = new THREE.MeshLambertMaterial({color: 0x2a2f3a});
  const bulbMat = new THREE.MeshBasicMaterial({color: 0xffe9b0});
  const poleMatrices = [];
  const bulbMatrices = [];
  for (const c of CITY.roads) {
    for (let d = -CITY.half + 26; d < CITY.half; d += 52) {
      poleMatrices.push(new THREE.Matrix4().makeTranslation(c + 7, 3, d));
      bulbMatrices.push(new THREE.Matrix4().makeTranslation(c + 7, 6.2, d));
    }
  }
  placeInstanced(scene, new THREE.CylinderGeometry(0.12, 0.12, 6, 6), poleMat, poleMatrices);
  placeInstanced(scene, new THREE.SphereGeometry(0.35, 8, 6), bulbMat, bulbMatrices);
}

function buildWaterfront(scene, rng) {
  // Beach strip and the ocean beyond it.
  const sand = groundPlane(CITY.half * 2 + 60, 30, SAND_COLOR);
  sand.position.set(0, 0.02, CITY.beachZ + 8);
  scene.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 120),
    new THREE.MeshLambertMaterial({color: WATER_COLOR}),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.4, CITY.oceanZ + 40);
  ocean.name = 'ocean';
  scene.add(ocean);
  // Beach umbrellas: striped cones on poles along the sand, purely
  // decorative — they never move and never collide with anything.
  const umbrellaColors = [0xff5fa2, 0xffd76e, 0x7dd8ff, 0xff7a2b];
  for (let i = 0; i < 4; i += 1) {
    const ux = -120 + i * 80;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6),
      new THREE.MeshLambertMaterial({color: 0x8a6b4a}),
    );
    pole.position.set(ux, 1.1, 188);
    scene.add(pole);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1, 8),
      new THREE.MeshLambertMaterial({color: umbrellaColors[i % umbrellaColors.length]}),
    );
    canopy.position.set(ux, 2.6, 188);
    scene.add(canopy);
  }
  // Pier: wooden deck on posts, out into the water at x = 0.
  const deck = solidBox(8, 0.6, 34, 0x8a6b4a);
  deck.position.set(0, 0.8, 196);
  scene.add(deck);
  for (let z = 182; z <= 210; z += 7) {
    for (const x of [-3.4, 3.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6), new THREE.MeshLambertMaterial({color: 0x6b4a2a}));
      post.position.set(x, -0.2, z);
      scene.add(post);
    }
  }
  // Boats that cruise the bay: each is a group the renderer sails along
  // its lane, bobbing gently. Lanes sit beyond the pier so the boats never
  // cross the beach.
  for (const [i, lane, speed, phase, color] of [
    [0, 232, 2.2, 0, 0xe8e8e8],
    [1, 242, 1.6, 90, 0xff8a5e],
    [2, 252, 2.8, 170, 0x7dd8ff],
  ]) {
    const boat = new THREE.Group();
    boat.name = 'boat-' + i;
    boat.userData = {lane, speed, phase};
    const hull = solidBox(3, 1.2, 8, color);
    hull.position.set(0, 0.2, 0);
    boat.add(hull);
    const cabin = solidBox(2, 1, 3, 0xffffff);
    cabin.position.set(0, 1.2, 0);
    boat.add(cabin);
    boat.position.set(phase - 130, 0, lane);
    scene.add(boat);
  }
}

// The pier Ferris wheel: two legs, a rim with spokes, and eight cabins
// that hang from the rim. The rim group spins in render.js; the cabins
// counter-rotate there so they stay upright.
function buildFerrisWheel(scene) {
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
  scene.add(wheel);
}

// The pier lighthouse: a striped tower with a lamp room, and a beam on a
// pivot the renderer sweeps across the bay.
function buildLighthouse(scene) {
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
  // The beam: a translucent cone, apex at the lamp, sweeping with its pivot.
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
  scene.add(tower);
}

function buildPlaza(scene) {
  // Central plaza: a paved disc with a fountain, kept open for the action.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(16, 24),
    new THREE.MeshLambertMaterial({color: 0x9a938a}),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 0.02, 0);
  disc.receiveShadow = true;
  scene.add(disc);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4.4, 1, 20),
    new THREE.MeshLambertMaterial({color: 0x7a8a9a}),
  );
  rim.position.set(0, 0.5, 0);
  scene.add(rim);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 20),
    new THREE.MeshLambertMaterial({color: 0x2a7fa8}),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 1.05, 0);
  scene.add(water);
}

function driftClouds(scene, rng) {
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
    scene.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}

export function buildCity(scene, rng) {
  paveRoads(scene);
  const {colliders} = raiseBlocks(scene, rng);
  plantSigns(scene);
  plantPalms(scene, rng);
  plantLamps(scene);
  buildWaterfront(scene, rng);
  buildFerrisWheel(scene);
  buildLighthouse(scene);
  buildPlaza(scene);
  const clouds = driftClouds(scene, rng);
  return {colliders, clouds};
}
