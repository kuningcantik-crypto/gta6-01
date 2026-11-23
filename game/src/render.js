// The renderer: a golden-hour three.js scene — sun, sky, shadows, ocean,
// clouds — and a chase camera that follows Rico on foot and in the car.
// It paints the world's state and nothing else; the world decides the state.
//
// Performance: the shadow map is 1024 and its frustum follows the player
// (a tight 100 m box instead of the whole 400 m city), the pixel ratio is
// capped (1 on phones), and the particle pool is a single THREE.Points.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { buildCity } from './city.js';
import { makeCarMesh } from './vehicles.js';
import { makePedMesh } from './pedestrians.js';
import { makePlayerMesh } from './player.js';
import { stepTarget } from './missions.js';

const PARTICLE_MAX = 300;

export function createRenderer(canvas, state) {
  const params = new URLSearchParams(window.location.search);
  const quality = params.get('quality') || 'high';
  const isSmallScreen = window.innerWidth < 700;
  // Quality knobs (also the auto performance mode's levers): antialiasing,
  // shadows and ACES tone mapping are the expensive per-pixel effects.
  let useAA = quality !== 'low' && !isSmallScreen && params.get('aa') !== '0';
  let useShadows = quality !== 'low' && params.get('shadow') !== '0';
  let useToneMapping = quality !== 'low' && params.get('tm') !== '0';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: useAA, preserveDrawingBuffer: true });
  const prParam = Number(params.get('pr') || 0);
  renderer.setPixelRatio(prParam > 0 ? prParam : Math.min(window.devicePixelRatio || 1, isSmallScreen ? 1 : 1.5));
  renderer.shadowMap.enabled = useShadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = useToneMapping ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(0xff9e5e, 120, 420);

  // Dusk sky dome: a gradient shell, so the horizon is never a flat colour.
  // One draw call, no fog — the city sits inside it.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0.0, '#16294f');
  skyGrad.addColorStop(0.35, '#5a3a6e');
  skyGrad.addColorStop(0.62, '#c65a4e');
  skyGrad.addColorStop(0.8, '#ff9e5e');
  skyGrad.addColorStop(1.0, '#ffd9a0');
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(700, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(skyDome);
  // Low sun disc + glow in the direction the light comes from.
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(70, 24),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.22, fog: false, depthWrite: false }),
  );
  sunGlow.position.set(520, 95, -320);
  sunGlow.lookAt(0, 40, 0);
  scene.add(sunGlow);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }),
  );
  sunDisc.position.set(520, 95, -320);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);

  // Golden-hour sun. The shadow frustum follows the player, so shadows stay
  // crisp where the camera is instead of smearing across the whole city.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.0);
  sun.position.set(120, 90, -80);
  sun.castShadow = true;
  const shadowSize = Number(params.get('shadowSize') || 1024);
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6b4a, 0.75));
  // Warm dusk fill from the west so faces and cars never go black.
  const fill = new THREE.DirectionalLight(0xff8a5e, 0.5);
  fill.position.set(-80, 30, 60);
  scene.add(fill);

  const cityData = buildCity(scene, state.rng);
  state.colliders = cityData.colliders;

  // Player figure.
  const playerMesh = makePlayerMesh();
  scene.add(playerMesh);

  // Cars: one mesh per car, created lazily and keyed by car id.
  const carMeshes = new Map();
  function carMeshFor(car) {
    let mesh = carMeshes.get(car.id);
    if (!mesh) {
      mesh = makeCarMesh(car.color, car.kind === 'police');
      scene.add(mesh);
      carMeshes.set(car.id, mesh);
    }
    return mesh;
  }

  // Pedestrians.
  const pedMeshes = state.peds.map((ped) => {
    const mesh = makePedMesh(state.rng);
    scene.add(mesh);
    ped.mesh = mesh;
    return mesh;
  });

  // Cash pickups: spinning gold stacks.
  const pickupMeshes = state.pickups.map((pickup) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.7),
      new THREE.MeshLambertMaterial({ color: 0xffd76e, emissive: 0x664400 }),
    );
    mesh.position.set(pickup.x, 0.8, pickup.z);
    scene.add(mesh);
    return mesh;
  });

  // Mission beacon: a column of light and a floating diamond over the target.
  const beacon = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd76e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  beacon.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xffd76e }),
  );
  diamond.position.y = 8;
  beacon.add(diamond);
  scene.add(beacon);

  // Police helicopter: body, tail, spinning rotor, and a spotlight cone
  // that tracks the player on the ground. Shown when wanted >= 3.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.4, 4.2),
    new THREE.MeshLambertMaterial({ color: 0x1c2b4a }),
  );
  heliBody.castShadow = true;
  heli.add(heliBody);
  const heliTail = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 3.4),
    new THREE.MeshLambertMaterial({ color: 0x1c2b4a }),
  );
  heliTail.position.set(0, 0.2, -3.4);
  heli.add(heliTail);
  const heliSkid = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.15, 3.0),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  heliSkid.position.y = -0.9;
  heli.add(heliSkid);
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.08, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  rotor.position.y = 1.0;
  heli.add(rotor);
  const rotor2 = rotor.clone();
  rotor2.rotation.y = Math.PI / 2;
  heli.add(rotor2);
  heli.userData.rotor = rotor;
  heli.userData.rotor2 = rotor2;
  // Spotlight cone from the heli down to the street, plus a light pool.
  const coneHeight = 42;
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7, coneHeight, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -coneHeight / 2;
  heli.add(cone);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(7, 20),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -coneHeight + 0.1;
  heli.add(pool);
  heli.visible = false;
  scene.add(heli);

  // Particles: one THREE.Points pool, reused for crashes, explosions and
  // the mission-complete burst. No allocation per frame.
  const particleGeo = new THREE.BufferGeometry();
  const particlePos = new Float32Array(PARTICLE_MAX * 3);
  const particleCol = new Float32Array(PARTICLE_MAX * 3);
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(particleCol, 3));
  const particleMat = new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.frustumCulled = false;
  scene.add(particles);
  const pVel = new Float32Array(PARTICLE_MAX * 3);
  const pLife = new Float32Array(PARTICLE_MAX);
  let pCursor = 0;
  function spawnParticles(x, y, z, kind, count) {
    const colors = {
      crash: [0xffb347, 0xd9d9d9, 0xff7a2b],
      explosion: [0xff5a2b, 0xffd76e, 0x333333],
      gold: [0xffd76e, 0xfff2b0, 0x7dff9a],
      smoke: [0x777777, 0x999999],
    }[kind] || [0xffffff];
    for (let n = 0; n < count; n += 1) {
      const i = pCursor;
      pCursor = (pCursor + 1) % PARTICLE_MAX;
      particlePos[i * 3] = x;
      particlePos[i * 3 + 1] = y;
      particlePos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const sp = kind === 'smoke' ? 1 + Math.random() : 3 + Math.random() * 7;
      pVel[i * 3] = Math.cos(a) * sp;
      pVel[i * 3 + 1] = 2 + Math.random() * (kind === 'smoke' ? 2 : 6);
      pVel[i * 3 + 2] = Math.sin(a) * sp;
      pLife[i] = 0.6 + Math.random() * 0.7;
      const c = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
      particleCol[i * 3] = c.r; particleCol[i * 3 + 1] = c.g; particleCol[i * 3 + 2] = c.b;
    }
    particleGeo.attributes.position.needsUpdate = true;
    particleGeo.attributes.color.needsUpdate = true;
  }
  function stepParticles(dt) {
    let any = false;
    for (let i = 0; i < PARTICLE_MAX; i += 1) {
      if (pLife[i] <= 0) continue;
      any = true;
      pLife[i] -= dt;
      particlePos[i * 3] += pVel[i * 3] * dt;
      particlePos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
      particlePos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      pVel[i * 3 + 1] -= 9 * dt;
      if (particlePos[i * 3 + 1] < 0.1) { particlePos[i * 3 + 1] = 0.1; pVel[i * 3 + 1] = 0; }
      if (pLife[i] <= 0) particlePos[i * 3 + 1] = -100; // park dead particles underground
    }
    if (any) particleGeo.attributes.position.needsUpdate = true;
  }

  // Muzzle flash light, reused for gunfire.
  const flashLight = new THREE.PointLight(0xffe9a8, 0, 30);
  scene.add(flashLight);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  const tmpTarget = new THREE.Vector3();
  let smokeTimer = 0;

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
    cityData,
    spawnParticles,
    // Auto performance mode: sheds the most expensive effects at runtime
    // (shadows, pixel ratio, tone mapping). Antialiasing is fixed at context
    // creation, so it is only a startup knob (?aa=0 / ?quality=low).
    setQuality(level) {
      if (level === 'low') {
        renderer.shadowMap.enabled = false;
        // Dynamic resolution: render at 75% and upscale — the standard
        // low-end lever, and the one that actually moves SwiftShader FPS.
        renderer.setPixelRatio(0.75);
        renderer.toneMapping = THREE.NoToneMapping;
        scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      }
      return level;
    },
    quality: () => ({ aa: useAA, shadows: renderer.shadowMap.enabled, toneMapping: renderer.toneMapping !== THREE.NoToneMapping }),
    flash() {
      flashLight.position.set(state.player.x, 2, state.player.z);
      flashLight.intensity = 60;
    },
    // Paint one frame. `cameraYaw` is the orbit angle; `mode` is 'follow',
    // 'aerial' (title screen) or 'fixed' (screenshot staging).
    render(dt, cameraYaw, mode, fixedCamera) {
      const p = state.player;
      // Consume fx bursts the world queued this frame.
      for (const fx of state.fx) {
        if (fx.t < 0.05) spawnParticles(fx.x, fx.y, fx.z, fx.kind, fx.kind === 'explosion' ? 40 : 18);
      }
      stepParticles(dt);
      // Sync the player figure.
      playerMesh.position.set(p.x, p.y, p.z);
      playerMesh.rotation.y = p.angle;
      playerMesh.visible = p.onFoot;
      if (p.onFoot && p.moving) {
        const swing = Math.sin(p.walkPhase) * 0.6;
        playerMesh.userData.legL.rotation.x = swing;
        playerMesh.userData.legR.rotation.x = -swing;
        playerMesh.userData.armL.rotation.x = -swing * 0.8;
        playerMesh.userData.armR.rotation.x = swing * 0.8;
      } else {
        playerMesh.userData.legL.rotation.x = 0;
        playerMesh.userData.legR.rotation.x = 0;
        playerMesh.userData.armL.rotation.x = 0;
        playerMesh.userData.armR.rotation.x = 0;
      }
      // Sync cars.
      const seenCars = new Set();
      for (const car of state.cars) {
        const mesh = carMeshFor(car);
        seenCars.add(car.id);
        mesh.position.set(car.x, 0, car.z);
        mesh.rotation.y = car.angle;
        mesh.visible = true;
        if (car.kind === 'police' && !car.disabled) {
          const bar = mesh.getObjectByName('lightbar');
          const bar2 = mesh.getObjectByName('lightbar2');
          if (bar && bar2) {
            const on = Math.sin(car.sirenPhase) > 0;
            bar.visible = on; bar2.visible = !on;
          }
        }
        if (car.disabled) mesh.rotation.z = 0.12;
        else mesh.rotation.z = 0;
        // The courier target gets a red roof marker so the player can spot it.
        const wheels = mesh.userData.wheels || [];
        for (const wheel of wheels) wheel.rotation.x += car.speed * dt * 0.8;
      }
      // Hide meshes of cars that no longer exist (e.g. after a reset).
      for (const [id, mesh] of carMeshes) {
        if (!seenCars.has(id)) mesh.visible = false;
      }
      // Wrecked player car smokes.
      if (p.car && (p.car.condition ?? 100) < 30) {
        smokeTimer -= dt;
        if (smokeTimer <= 0) {
          smokeTimer = 0.25;
          spawnParticles(p.car.x, 1.5, p.car.z, 'smoke', 3);
        }
      }
      // Sync pedestrians.
      for (let i = 0; i < state.peds.length; i += 1) {
        const ped = state.peds[i];
        const mesh = pedMeshes[i];
        mesh.position.set(ped.x, 0, ped.z);
        mesh.rotation.y = ped.angle;
        if (ped.state === 'down') {
          mesh.rotation.x = Math.PI / 2;
          mesh.position.y = 0.3;
        } else {
          mesh.rotation.x = 0;
          mesh.position.y = 0;
          const swing = Math.sin(ped.walkPhase) * 0.5;
          mesh.userData.legL.rotation.x = swing;
          mesh.userData.legR.rotation.x = -swing;
        }
      }
      // Pickups spin and bob.
      for (let i = 0; i < state.pickups.length; i += 1) {
        const pickup = state.pickups[i];
        const mesh = pickupMeshes[i];
        mesh.visible = !pickup.taken;
        mesh.rotation.y += dt * 2;
        mesh.position.y = 0.8 + Math.sin(state.time * 2 + i) * 0.15;
      }
      // Beacon over the mission target.
      const target = stepTarget(state);
      if (target && !state.allMissionsDone) {
        beacon.visible = true;
        beacon.position.set(target.x, 0, target.z);
        diamond.rotation.y += dt * 2;
        diamond.position.y = 8 + Math.sin(state.time * 2) * 0.5;
      } else {
        beacon.visible = false;
      }
      // Helicopter.
      const h = state.heli;
      heli.visible = !!h.active;
      if (h.active) {
        heli.position.set(h.x, h.y, h.z);
        heli.rotation.y = h.angle;
        heli.userData.rotor.rotation.y = h.rotor;
        heli.userData.rotor2.rotation.y = h.rotor + Math.PI / 2;
        // The spotlight pool sits on the street under the heli.
        pool.position.y = -h.y + 0.15;
        cone.scale.y = h.y / 42;
        cone.position.y = -h.y / 2;
      }
      // Ocean shimmer and drifting clouds.
      const ocean = scene.getObjectByName('ocean');
      if (ocean) ocean.position.y = -0.4 + Math.sin(state.time * 0.5) * 0.1;
      for (const cloud of cityData.clouds) {
        cloud.position.x += dt * 1.2;
        if (cloud.position.x > 260) cloud.position.x = -260;
      }
      if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 400);

      // Camera.
      if (mode === 'fixed' && fixedCamera) {
        camera.position.set(fixedCamera.x, fixedCamera.y, fixedCamera.z);
        camera.lookAt(fixedCamera.lookX, fixedCamera.lookY, fixedCamera.lookZ);
      } else if (mode === 'aerial') {
        const t = state.time * 0.05;
        camera.position.set(Math.sin(t) * 120, 70, Math.cos(t) * 120);
        camera.lookAt(0, 0, 40);
      } else {
        const driving = !!p.car;
        // With the helicopter up, pull the camera back and up so the heli
        // and its spotlight cone are in frame with the chase.
        const heliUp = !!state.heli.active;
        const dist = driving ? (heliUp ? 19 : 15) : 9;
        const height = driving ? (heliUp ? 9.5 : 6.5) : 4.2;
        const backX = -Math.sin(cameraYaw) * dist;
        const backZ = -Math.cos(cameraYaw) * dist;
        tmpTarget.set(p.x, 1.5, p.z);
        camera.position.set(p.x + backX, height, p.z + backZ);
        camera.lookAt(p.x + Math.sin(cameraYaw) * 6, 1.8, p.z + Math.cos(cameraYaw) * 6);
      }
      // Shadow frustum follows the player (or the camera target on title).
      const focusX = mode === 'aerial' ? 0 : p.x;
      const focusZ = mode === 'aerial' ? 40 : p.z;
      sun.position.set(focusX + 90, 90, focusZ - 60);
      sun.target.position.set(focusX, 0, focusZ);
      renderer.render(scene, camera);
    },
  };
}
