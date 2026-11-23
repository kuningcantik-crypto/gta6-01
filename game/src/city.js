// The city of Solmar Bay: roads, blocks of buildings with lit windows,
// sidewalks, palms, lamps, a beach, a pier and the ocean. All geometry is
// procedural — no model files, no network.
//
// Performance: everything repeated (road dashes, sidewalks, lamps, palms,
// roofs, pier posts, umbrellas) is one InstancedMesh per part with shared
// geometry/material, so the whole city paints in ~90 draw calls instead of
// ~900. Buildings stay individual meshes (distinct window textures).
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

const M4 = new THREE.Matrix4();
const Q0 = new THREE.Quaternion();
const V3 = new THREE.Vector3();
const S3 = new THREE.Vector3();

function setInstance(mesh, i, x, y, z, sx, sy, sz, ry = 0) {
  Q0.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  M4.compose(V3.set(x, y, z), Q0, S3.set(sx, sy, sz));
  mesh.setMatrixAt(i, M4);
}

function buildingTexture(rng, baseColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 8; y < 248; y += 18) g.fillRect(0, y, 128, 3);
  for (let y = 14; y < 250; y += 18) {
    for (let x = 10; x < 120; x += 22) {
      const lit = rng.next() < 0.45;
      g.fillStyle = lit ? 'rgba(255, 214, 130, 0.95)' : 'rgba(30, 40, 60, 0.85)';
      g.fillRect(x, y, 12, 10);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textTexture(text, bg, fg, size) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg; g.font = `bold ${size || 56}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Build the city into `scene`. Returns colliders (building AABBs), the road
// coordinates, and named landmark positions the world and missions use.
export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';

  // Shared geometry/materials — one of each, reused everywhere.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const lineMat = new THREE.MeshLambertMaterial({ color: PALETTE.roadLine });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e4f });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x222831 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });

  // Ground, beach and ocean.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 80, CITY.half * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0x6f8f5a }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 20);
  ground.receiveShadow = true;
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 80, 34),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0, CITY.beachZ + 8);
  sand.receiveShadow = true;
  group.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.half * 2 + 80, 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.ocean, transparent: true, opacity: 0.92 }),
  );
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, -0.4, CITY.oceanZ + 60);
  ocean.name = 'ocean';
  group.add(ocean);

  // Roads: one plane per direction per road (14 meshes, shared material).
  for (const c of CITY.roads) {
    for (const [w, l, x, z, rot] of [
      [CITY.roadWidth, CITY.half * 2, c, 0, 0],
      [CITY.roadWidth, CITY.half * 2, 0, c, Math.PI / 2],
    ]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(l, w), roadMat);
      road.rotation.x = -Math.PI / 2; road.rotation.z = rot;
      road.position.set(x, 0.01, z); road.receiveShadow = true;
      group.add(road);
    }
  }
  // Dashed centre lines: ONE instanced mesh for all ~420 dashes.
  const dashTs = [];
  for (let t = -CITY.half + 8; t < CITY.half; t += 12) dashTs.push(t);
  const dashes = new THREE.InstancedMesh(unitBox, lineMat, dashTs.length * CITY.roads.length * 2);
  let di = 0;
  for (const c of CITY.roads) {
    for (const t of dashTs) {
      setInstance(dashes, di++, t, 0.03, c, 4, 0.06, 0.5);
      setInstance(dashes, di++, c, 0.03, t, 0.5, 0.06, 4);
    }
  }
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);
  // Sidewalk strips: one instanced mesh for all 28 strips.
  const walks = new THREE.InstancedMesh(unitBox, walkMat, CITY.roads.length * 4);
  let wi = 0;
  for (const c of CITY.roads) {
    for (const off of [-CITY.roadWidth / 2 - 2, CITY.roadWidth / 2 + 2]) {
      setInstance(walks, wi++, 0, 0.02, c + off, CITY.half * 2, 0.05, 4);
      setInstance(walks, wi++, c + off, 0.02, 0, 4, 0.05, CITY.half * 2);
    }
  }
  walks.instanceMatrix.needsUpdate = true;
  walks.receiveShadow = true;
  group.add(walks);

  // Buildings: one or two per block, varied heights, window textures.
  const textures = PALETTE.building.map((c) => buildingTexture(rng, `#${c.toString(16).padStart(6, '0')}`));
  const roofSpots = [];
  let buildingCount = 0;
  for (const bx of CITY.blockCentres) {
    for (const bz of CITY.blockCentres) {
      // The plaza at the centre stays open; the bank block keeps one tower.
      if (bx === 0 && bz === 0) continue;
      const n = rng.next() < 0.55 ? 2 : 1;
      for (let i = 0; i < n; i += 1) {
        const w = rng.range(14, 24);
        const d = rng.range(14, 24);
        const h = rng.range(10, 42);
        const ox = n === 2 ? (i === 0 ? -9 : 9) : 0;
        const oz = n === 2 ? (i === 0 ? -9 : 9) : 0;
        const x = bx + ox;
        const z = bz + oz;
        const mat = new THREE.MeshLambertMaterial({ map: textures[Math.floor(rng.next() * textures.length)] });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        b.castShadow = true; b.receiveShadow = true;
        group.add(b);
        roofSpots.push({ x, y: h + 0.25, z, w: w + 0.6, d: d + 0.6, h });
        colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
        buildingCount += 1;
      }
    }
  }
  // Roofs + rooftop AC boxes: instanced.
  const roofs = new THREE.InstancedMesh(unitBox, roofMat, roofSpots.length);
  roofSpots.forEach((r, i) => setInstance(roofs, i, r.x, r.y, r.z, r.w, 0.5, r.d));
  roofs.instanceMatrix.needsUpdate = true;
  group.add(roofs);
  const acSpots = roofSpots.filter(() => rng.next() < 0.5);
  const acs = new THREE.InstancedMesh(unitBox, acMat, Math.max(1, acSpots.length));
  acSpots.forEach((r, i) => setInstance(acs, i, r.x + 3, r.h + 1, r.z - 2, 2.4, 1.2, 2));
  acs.instanceMatrix.needsUpdate = true;
  group.add(acs);

  // Landmark towers: the Solmar Bank tower and the hotel, taller and named.
  function landmark(x, z, w, h, d, label, bg, fg) {
    const mat = new THREE.MeshLambertMaterial({ map: buildingTexture(rng, '#e8e0d0') });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z); b.castShadow = true;
    group.add(b);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.9, 3, 0.4),
      new THREE.MeshBasicMaterial({ map: textTexture(label, bg, fg, 44) }),
    );
    sign.position.set(x, h + 2, z + d / 2 + 0.3);
    group.add(sign);
    colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
  }
  landmark(CITY.bank.x, CITY.bank.z, 22, 46, 22, 'SOLMAR BANK', '#123a6b', '#ffd76e');
  landmark(130, -78, 20, 38, 20, 'HOTEL PALMA', '#5b2b6b', '#ffffff');

  // The Neon Pier: deck out over the ocean, with a sign and lamps.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4a });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 40), pierMat);
  pier.position.set(CITY.pier.x, 0.8, CITY.pier.z + 12);
  pier.castShadow = true; pier.receiveShadow = true;
  group.add(pier);
  const pierSign = new THREE.Mesh(
    new THREE.BoxGeometry(12, 3, 0.4),
    new THREE.MeshBasicMaterial({ map: textTexture('NEON PIER', '#0b1e3a', '#ff5fa2', 48) }),
  );
  pierSign.position.set(CITY.pier.x, 7, CITY.pier.z - 6);
  group.add(pierSign);
  const pierPosts = [];
  for (let z = CITY.pier.z - 2; z < CITY.pier.z + 30; z += 8) {
    pierPosts.push([CITY.pier.x - 6, z]);
    pierPosts.push([CITY.pier.x + 6, z]);
  }
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), lampMat, pierPosts.length);
  pierPosts.forEach(([x, z], i) => setInstance(posts, i, x, 3.5, z, 1, 1, 1));
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  // Palms along the beach and plaza — trunks and leaves instanced.
  const palmSpots = [];
  for (let x = -165; x <= 174; x += 26) palmSpots.push([x, 176]);
  palmSpots.push([-8, 8], [8, -8], [-8, -8], [8, 8]);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat, palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    setInstance(trunks, i, x, 3, z, 1, 1, 1);
    trunks.setMatrixAt(i, M4);
  });
  trunks.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  group.add(trunks);
  const leafGeo = new THREE.ConeGeometry(1.1, 3.4, 4);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, palmSpots.length * 5);
  let li = 0;
  const leafQ = new THREE.Quaternion();
  const leafE = new THREE.Euler();
  for (const [x, z] of palmSpots) {
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      leafE.set(-Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9);
      leafQ.setFromEuler(leafE);
      M4.compose(
        V3.set(x + Math.cos(a) * 1.2, 6.4, z + Math.sin(a) * 1.2),
        leafQ, S3.set(1, 1, 1),
      );
      leaves.setMatrixAt(li++, M4);
    }
  }
  leaves.instanceMatrix.needsUpdate = true;
  group.add(leaves);

  // Beach umbrellas: coloured canopies over the sand, instanced.
  const umbrellaSpots = [];
  for (let i = 0; i < 8; i += 1) umbrellaSpots.push([-140 + i * 38, 190 + (i % 2) * 6]);
  const uPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 5), lampMat, umbrellaSpots.length);
  umbrellaSpots.forEach(([x, z], i) => setInstance(uPoles, i, x, 1.3, z, 1, 1, 1));
  uPoles.instanceMatrix.needsUpdate = true;
  group.add(uPoles);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 1.1, 8), canopyMat, umbrellaSpots.length);
  const canopyColors = [0xff5fa2, 0xffd76e, 0x2bd97a, 0x2b6fd9];
  umbrellaSpots.forEach(([x, z], i) => {
    setInstance(canopies, i, x, 3, z, 1, 1, 1);
    canopies.setColorAt(i, new THREE.Color(canopyColors[i % canopyColors.length]));
  });
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  group.add(canopies);

  // Lamps along the roads: poles and glowing heads, instanced.
  const lampSpots = [];
  for (const c of CITY.roads) {
    for (let t = -140; t <= 140; t += 52) lampSpots.push([c + 8, t]);
  }
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), lampMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6), lampHeadMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    setInstance(poles, i, x, 3, z, 1, 1, 1);
    setInstance(heads, i, x, 6.1, z, 1, 1, 1);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  group.add(poles);
  group.add(heads);

  // Billboards with the city's own names.
  function billboard(x, z, ry, text, bg, fg) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(16, 4, 0.4),
      new THREE.MeshBasicMaterial({ map: textTexture(text, bg, fg, 52) }),
    );
    board.position.set(x, 9, z); board.rotation.y = ry;
    group.add(board);
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), lampMat);
    leg1.position.set(x - 6, 3.5, z); group.add(leg1);
    const leg2 = leg1.clone(); leg2.position.x = x + 6; group.add(leg2);
  }
  billboard(-52, -170, 0, 'SOLMAR BAY', '#0b1e3a', '#ffd76e');
  billboard(104, 170, Math.PI, 'VISIT NEON PIER', '#5b1040', '#ffffff');

  // Clouds: soft white flattened spheres drifting in the sky, shared geometry.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const clouds = [];
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j += 1) {
      const s = new THREE.Mesh(cloudGeo, cloudMat);
      s.position.set(j * 5 - 5, rng.range(-1, 1), rng.range(-2, 2));
      s.scale.set(rng.range(4, 8), rng.range(1.8, 3.6), rng.range(4, 8));
      cloud.add(s);
    }
    cloud.position.set(rng.range(-220, 220), rng.range(55, 80), rng.range(-220, 220));
    cloud.name = 'cloud';
    group.add(cloud);
    clouds.push(cloud);
  }

  scene.add(group);
  return { colliders, buildingCount, clouds };
}
