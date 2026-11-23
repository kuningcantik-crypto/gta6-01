// The renderer: a golden-hour three.js scene — sun, sky, shadows, ocean and
// clouds — plus a chase camera that follows Rico on foot and in the car.
// It only paints the world's state; the world module decides the state.
//
// Speed: the shadow map is 1024 and its frustum follows the player (a tight
// 100 m box instead of the whole 400 m city), the pixel ratio is capped
// (1 on phones), and particles live in a single reused THREE.Points pool.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { buildCity } from './city.js';
import { makeCarMesh } from './vehicles.js';
import { makePedMesh } from './pedestrians.js';
import { makePlayerMesh } from './player.js';
import { stepTarget } from './missions.js';

const POOL_SIZE = 300;

// --- particles ---------------------------------------------------------------
// One THREE.Points pool, reused for crashes, explosions and the
// mission-complete burst. Nothing is allocated per frame.
function createParticlePool(scene) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(POOL_SIZE * 3);
  const col = new Float32Array(POOL_SIZE * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({size: 0.9, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false}),
  );
  points.frustumCulled = false;
  scene.add(points);
  const vel = new Float32Array(POOL_SIZE * 3);
  const life = new Float32Array(POOL_SIZE);
  let cursor = 0;
  const palette = {
    crash: [0xffb347, 0xd9d9d9, 0xff7a2b],
    explosion: [0xff5a2b, 0xffd76e, 0x333333],
    gold: [0xffd76e, 0xfff2b0, 0x7dff9a],
    smoke: [0x777777, 0x999999],
  };
  return {
    burst(x, y, z, kind, count) {
      const colors = palette[kind] || [0xffffff];
      for (let n = 0; n < count; n += 1) {
        const i = cursor;
        cursor = (cursor + 1) % POOL_SIZE;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        const heading = Math.random() * Math.PI * 2;
        const speed = kind === 'smoke' ? 1 + Math.random() : 3 + Math.random() * 7;
        vel[i * 3] = Math.cos(heading) * speed;
        vel[i * 3 + 1] = 2 + Math.random() * (kind === 'smoke' ? 2 : 6);
        vel[i * 3 + 2] = Math.sin(heading) * speed;
        life[i] = 0.6 + Math.random() * 0.7;
        const c = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
    advance(dt) {
      let alive = false;
      for (let i = 0; i < POOL_SIZE; i += 1) {
        if (life[i] <= 0) continue;
        alive = true;
        life[i] -= dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] -= 9 * dt;
        if (pos[i * 3 + 1] < 0.1) {
          pos[i * 3 + 1] = 0.1;
          vel[i * 3 + 1] = 0;
        }
        if (life[i] <= 0) pos[i * 3 + 1] = -100;
      }
      if (alive) geo.attributes.position.needsUpdate = true;
    },
  };
}

// --- per-frame sync helpers --------------------------------------------------
function syncPlayerFigure(mesh, p) {
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.y = p.angle;
  mesh.visible = p.onFoot;
  const swing = p.onFoot && p.moving ? Math.sin(p.walkPhase) * 0.6 : 0;
  mesh.userData.legL.rotation.x = swing;
  mesh.userData.legR.rotation.x = -swing;
  mesh.userData.armL.rotation.x = -swing * 0.8;
  mesh.userData.armR.rotation.x = swing * 0.8;
}

function syncCarFigures(scene, figures, cars, dt) {
  const seen = new Set();
  for (const car of cars) {
    let mesh = figures.get(car.id);
    if (!mesh) {
      mesh = makeCarMesh(car.color, car.kind === 'police');
      scene.add(mesh);
      figures.set(car.id, mesh);
    }
    seen.add(car.id);
    mesh.position.set(car.x, 0, car.z);
    mesh.rotation.y = car.angle;
    mesh.visible = true;
    mesh.rotation.z = car.disabled ? 0.12 : 0;
    if (car.kind === 'police' && !car.disabled) {
      const bar = mesh.getObjectByName('lightbar');
      const bar2 = mesh.getObjectByName('lightbar2');
      if (bar && bar2) {
        const on = Math.sin(car.sirenPhase) > 0;
        bar.visible = on;
        bar2.visible = !on;
      }
    }
    for (const wheel of mesh.userData.wheels || []) wheel.rotation.x += car.speed * dt * 0.8;
  }
  for (const [id, mesh] of figures) {
    if (!seen.has(id)) mesh.visible = false;
  }
}

function syncPedFigures(figures, peds) {
  peds.forEach((ped, i) => {
    const mesh = figures[i];
    mesh.position.set(ped.x, 0, ped.z);
    mesh.rotation.y = ped.angle;
    if (ped.state === 'down') {
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 0.3;
      return;
    }
    mesh.rotation.x = 0;
    mesh.position.y = 0;
    const swing = Math.sin(ped.walkPhase) * 0.5;
    mesh.userData.legL.rotation.x = swing;
    mesh.userData.legR.rotation.x = -swing;
  });
}

function syncPickups(figures, pickups, time, dt) {
  pickups.forEach((pickup, i) => {
    const mesh = figures[i];
    mesh.visible = !pickup.taken;
    mesh.rotation.y += dt * 2;
    mesh.position.y = 0.8 + Math.sin(time * 2 + i) * 0.15;
  });
}

function syncBeacon(beacon, diamond, state, dt) {
  const target = stepTarget(state);
  if (!target || state.allMissionsDone) {
    beacon.visible = false;
    return;
  }
  beacon.visible = true;
  beacon.position.set(target.x, 0, target.z);
  diamond.rotation.y += dt * 2;
  diamond.position.y = 8 + Math.sin(state.time * 2) * 0.5;
}

// The waterfront moves: the wheel turns (cabins stay upright) and the
// boats sail their lanes, bobbing on the swell.
function syncWaterfront(scene, time) {
  const rotor = scene.getObjectByName('ferris-rotor');
  if (rotor) {
    rotor.rotation.z = time * 0.12;
    for (const cabin of rotor.userData.cabins || []) cabin.rotation.z = -rotor.rotation.z;
  }
  for (let i = 0; i < 3; i += 1) {
    const boat = scene.getObjectByName('boat-' + i);
    if (!boat) continue;
    const {lane, speed, phase} = boat.userData;
    const span = 260;
    const x = (((time * speed + phase) % span) + span) % span - span / 2;
    boat.position.x = x;
    boat.position.z = lane;
    boat.rotation.z = Math.sin(time * 0.8 + phase) * 0.03;
    boat.rotation.x = Math.sin(time * 0.6 + phase * 2) * 0.02;
  }
}

function syncHeli(heli, pool, state) {
  const h = state.heli;
  heli.visible = !!h.active;
  if (!h.active) return;
  heli.position.set(h.x, h.y, h.z);
  heli.rotation.y = h.angle;
  heli.userData.rotor.rotation.y = h.rotor;
  heli.userData.rotor2.rotation.y = h.rotor + Math.PI / 2;
  pool.position.y = -h.y + 0.15;
  const cone = heli.userData.cone;
  cone.scale.y = h.y / 42;
  cone.position.y = -h.y / 2;
}

// --- camera ------------------------------------------------------------------
function placeCamera(camera, state, yaw, mode, fixed) {
  const p = state.player;
  if (mode === 'fixed' && fixed) {
    camera.position.set(fixed.x, fixed.y, fixed.z);
    camera.lookAt(fixed.lookX, fixed.lookY, fixed.lookZ);
    return;
  }
  if (mode === 'aerial') {
    const t = state.time * 0.05;
    camera.position.set(Math.sin(t) * 120, 70, Math.cos(t) * 120);
    camera.lookAt(0, 0, 40);
    return;
  }
  const driving = !!p.car;
  const heliUp = !!state.heli.active;
  // With the helicopter up, pull the camera back and up so the heli and its
  // spotlight cone are in frame with the chase.
  const dist = driving ? (heliUp ? 19 : 15) : 9;
  const height = driving ? (heliUp ? 9.5 : 6.5) : 4.2;
  camera.position.set(p.x - Math.sin(yaw) * dist, height, p.z - Math.cos(yaw) * dist);
  camera.lookAt(p.x + Math.sin(yaw) * 6, 1.8, p.z + Math.cos(yaw) * 6);
}

export function createRenderer(canvas, state) {
  const params = new URLSearchParams(window.location.search);
  const quality = params.get('quality') || 'high';
  const smallScreen = window.innerWidth < 700;
  // Quality knobs (also the auto performance mode's levers): antialiasing,
  // shadows and ACES tone mapping are the expensive per-pixel effects.
  const aaOn = quality !== 'low' && !smallScreen && params.get('aa') !== '0';
  const shadowsOn = quality !== 'low' && params.get('shadow') !== '0';
  const toneOn = quality !== 'low' && params.get('tm') !== '0';
  const renderer = new THREE.WebGLRenderer({canvas, antialias: aaOn, preserveDrawingBuffer: true});
  const prParam = Number(params.get('pr') || 0);
  renderer.setPixelRatio(prParam > 0 ? prParam : Math.min(window.devicePixelRatio || 1, smallScreen ? 1 : 1.5));
  renderer.shadowMap.enabled = shadowsOn;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = toneOn ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(0xff9e5e, 120, 420);

  // Dusk sky dome: a gradient shell, so the horizon is never a flat colour.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0.0, '#16294f');
  gradient.addColorStop(0.35, '#5a3a6e');
  gradient.addColorStop(0.62, '#c65a4e');
  gradient.addColorStop(0.8, '#ff9e5e');
  gradient.addColorStop(1.0, '#ffd9a0');
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(700, 16, 12),
    new THREE.MeshBasicMaterial({map: skyTex, side: THREE.BackSide, fog: false}),
  );
  scene.add(dome);
  // Low sun disc + glow in the direction the light comes from.
  for (const [radius, color, opacity] of [[70, 0xffb347, 0.22], [26, 0xffe9b0, 1]]) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({color, transparent: opacity < 1, opacity, fog: false, depthWrite: false}),
    );
    disc.position.set(520, 95, -320);
    disc.lookAt(0, 40, 0);
    scene.add(disc);
  }

  // Golden-hour sun. The shadow frustum follows the player, so shadows stay
  // crisp where the camera is instead of smearing across the whole city.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.0);
  sun.position.set(120, 90, -80);
  sun.castShadow = true;
  const shadowRes = Number(params.get('shadowSize') || 1024);
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6b4a, 0.75));
  // Warm dusk fill from the west so faces and cars never go black.
  const fill = new THREE.DirectionalLight(0xff8a5e, 0.5);
  fill.position.set(-80, 30, 60);
  scene.add(fill);

  const city = buildCity(scene, state.rng);
  state.colliders = city.colliders;

  const playerFigure = makePlayerMesh();
  scene.add(playerFigure);
  const carFigures = new Map();
  const pedFigures = state.peds.map((ped) => {
    const mesh = makePedMesh(state.rng);
    scene.add(mesh);
    ped.mesh = mesh;
    return mesh;
  });
  const pickupFigures = state.pickups.map((pickup) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.7),
      new THREE.MeshLambertMaterial({color: 0xffd76e, emissive: 0x664400}),
    );
    mesh.position.set(pickup.x, 0.8, pickup.z);
    scene.add(mesh);
    return mesh;
  });

  // Mission beacon: a column of light and a floating diamond over the target.
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({color: 0xffd76e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false}),
  );
  beam.position.y = 30;
  beacon.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({color: 0xffd76e}),
  );
  diamond.position.y = 8;
  beacon.add(diamond);
  scene.add(beacon);

  // Police helicopter: body, tail, spinning rotor, and a spotlight cone
  // that tracks the player on the ground. Shown when wanted >= 3.
  const heli = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.4, 4.2),
    new THREE.MeshLambertMaterial({color: 0x1c2b4a}),
  );
  body.castShadow = true;
  heli.add(body);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 3.4),
    new THREE.MeshLambertMaterial({color: 0x1c2b4a}),
  );
  tail.position.set(0, 0.2, -3.4);
  heli.add(tail);
  const skid = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.15, 3.0),
    new THREE.MeshLambertMaterial({color: 0x222222}),
  );
  skid.position.y = -0.9;
  heli.add(skid);
  const rotorA = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.08, 0.4),
    new THREE.MeshLambertMaterial({color: 0x111111}),
  );
  rotorA.position.y = 1.0;
  heli.add(rotorA);
  const rotorB = rotorA.clone();
  rotorB.rotation.y = Math.PI / 2;
  heli.add(rotorB);
  heli.userData.rotor = rotorA;
  heli.userData.rotor2 = rotorB;
  const coneHeight = 42;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, coneHeight, 16, 1, true),
    new THREE.MeshBasicMaterial({color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false}),
  );
  cone.position.y = -coneHeight / 2;
  heli.add(cone);
  heli.userData.cone = cone;
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(7, 20),
    new THREE.MeshBasicMaterial({color: 0xfff2b0, transparent: true, opacity: 0.28, depthWrite: false}),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -coneHeight + 0.1;
  heli.add(pool);
  heli.userData.pool = pool;
  heli.visible = false;
  scene.add(heli);

  const particles = createParticlePool(scene);

  // Muzzle flash light, reused for gunfire.
  const muzzleLight = new THREE.PointLight(0xffe9a8, 0, 30);
  scene.add(muzzleLight);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  let smokeClock = 0;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // Test/diagnostics handle: draw calls and triangles for FPS profiling.
  window.__rendererInfo = () => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  });

  return {
    scene,
    camera,
    cityData: city,
    spawnParticles: (x, y, z, kind, count) => particles.burst(x, y, z, kind, count),
    // Auto performance mode: sheds the most expensive effects at runtime
    // (shadows, pixel ratio, tone mapping). Antialiasing is fixed at
    // context creation, so it is only a startup knob (?aa=0 / ?quality=low).
    setQuality(level) {
      if (level === 'low') {
        renderer.shadowMap.enabled = false;
        // Dynamic resolution: render at 75% and upscale — the standard
        // low-end lever, and the one that actually moves SwiftShader FPS.
        renderer.setPixelRatio(0.75);
        renderer.toneMapping = THREE.NoToneMapping;
        scene.traverse((o) => {
          if (o.material) o.material.needsUpdate = true;
        });
      }
      return level;
    },
    quality: () => ({aa: aaOn, shadows: renderer.shadowMap.enabled, toneMapping: renderer.toneMapping !== THREE.NoToneMapping}),
    flash() {
      muzzleLight.position.set(state.player.x, 2, state.player.z);
      muzzleLight.intensity = 60;
    },
    // Paint one frame. `cameraYaw` is the orbit angle; `mode` is 'follow',
    // 'aerial' (title screen) or 'fixed' (screenshot staging).
    render(dt, cameraYaw, mode, fixedCamera) {
      const p = state.player;
      for (const fx of state.fx) {
        if (fx.t < 0.05) particles.burst(fx.x, fx.y, fx.z, fx.kind, fx.kind === 'explosion' ? 40 : 18);
      }
      particles.advance(dt);
      syncPlayerFigure(playerFigure, p);
      syncCarFigures(scene, carFigures, state.cars, dt);
      // Wrecked player car smokes.
      if (p.car && (p.car.condition ?? 100) < 30) {
        smokeClock -= dt;
        if (smokeClock <= 0) {
          smokeClock = 0.25;
          particles.burst(p.car.x, 1.5, p.car.z, 'smoke', 3);
        }
      }
      syncPedFigures(pedFigures, state.peds);
      syncPickups(pickupFigures, state.pickups, state.time, dt);
      syncBeacon(beacon, diamond, state, dt);
      syncHeli(heli, heli.userData.pool, state);
      syncWaterfront(scene, state.time);
      // Ocean shimmer and drifting clouds.
      const ocean = scene.getObjectByName('ocean');
      if (ocean) ocean.position.y = -0.4 + Math.sin(state.time * 0.5) * 0.1;
      for (const cloud of city.clouds) {
        cloud.position.x += dt * 1.2;
        if (cloud.position.x > 260) cloud.position.x = -260;
      }
      if (muzzleLight.intensity > 0) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 400);

      placeCamera(camera, state, cameraYaw, mode, fixedCamera);
      // Shadow frustum follows the player (or the camera target on title).
      const focusX = mode === 'aerial' ? 0 : p.x;
      const focusZ = mode === 'aerial' ? 40 : p.z;
      sun.position.set(focusX + 90, 90, focusZ - 60);
      sun.target.position.set(focusX, 0, focusZ);
      renderer.render(scene, camera);
    },
  };
}
