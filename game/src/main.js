// Solmar Bay — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// The game moves between title, play, paused, wasted, busted and complete.
//
// ?seed=N fixes the city and traffic. ?shot=start|play|chase|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
//
// window.__solmar is a diagnostics handle for headless tests (FPS, mission
// and touch smoke tests): it exposes the live state and a way to step the
// simulation without a real keyboard. It changes nothing about the game.
import { CITY, STEP, STORY_INTRO } from './config.js';
import { createInput, createScriptedInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createRenderer } from './render.js';
import { applySave, buyGarage, createWorld, loadGame, resetInPlace, saveGame, stepWorld } from './world.js';
import { currentMission, currentStep, stepTarget } from './missions.js';
import { createTouchControls } from './touch.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedArg = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedArg) ? seedArg : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createWorld(seed);
const renderer = createRenderer(canvas, state);
const audio = createAudio();
const input = shotName ? createScriptedInput() : createInput(canvas);

let screen = 'title';
let cameraYaw = state.player.angle;
let stepAccumulator = 0;
let lastFrame = performance.now();
let completeShown = false;
let testShoot = false;
// Auto performance mode: if frames stay slow, shed expensive effects once.
let lowEffects = false;
let slowTime = 0;
let lastWall = performance.now();

function announce(message) {
  status.textContent = message;
}

function startGame(fresh) {
  if (fresh) resetInPlace(state, seed);
  else applySave(state, loadGame());
  completeShown = false;
  screen = 'play';
  cameraYaw = state.player.angle;
  audio.unlock();
  audio.setRadio(state.player.radioStation || 0);
  hud.showMessage(fresh ? 'New game. Lucia is waiting — find a car.' : 'Welcome back to Solmar Bay.', 4);
  announce(`Playing. ${STORY_INTRO}`);
}

function respawn() {
  const p = state.player;
  if (p.car) {
    p.car.kind = 'parked';
    p.car.speed = 0;
    p.car = null;
  }
  p.onFoot = true;
  p.x = 130;
  p.z = -130;
  p.y = 0;
  p.vy = 0;
  p.angle = Math.PI;
  p.health = 100;
  p.wanted = 0;
  p.bustedTimer = 0;
  state.wasted = false;
  state.busted = false;
  saveGame(state);
  hud.showMessage('You woke up at St. Palma Hospital. The city is still yours.', 4);
}

const hud = createHud(state, {
  onNewGame: () => startGame(true),
  onContinue: () => startGame(false),
  onResume: () => { screen = 'play'; },
  onRestart: () => {
    respawn();
    screen = 'play';
  },
  onTitle: () => { screen = 'title'; },
  onFreeRoam: () => { screen = 'play'; },
  onGarageClose: () => { state.garageOpen = false; },
  onMissionsClose: () => { state.missionsOpen = false; },
  onGarageBuy: (kind) => {
    hud.showGarageMessage(buyGarage(state, kind));
    saveGame(state);
  },
});

createTouchControls(input, {
  onCamera: () => { cameraYaw += Math.PI * 0.5; },
});

// Overlay toggles live here, not in stepWorld: the world is frozen while
// an overlay is open, so stepWorld would never read the key that is
// supposed to close it. Only while playing, not on the title screen.
function handleOverlayKeys() {
  if (input.wasPressed('missions')) state.missionsOpen = !state.missionsOpen;
  if (input.wasPressed('garage')) {
    if (Math.hypot(state.player.x - CITY.safehouse.x, state.player.z - CITY.safehouse.z) < 10) {
      state.garageOpen = !state.garageOpen;
    } else {
      hud.showMessage('Garage is at the safehouse — north-west corner.', 3);
    }
  }
}

// The camera follows the player's heading, nudged by mouse movement, and
// only turns while the player is actually moving.
function followCamera(frameDt) {
  cameraYaw -= input.takeMouseDX() * 0.0035;
  let diff = state.player.angle - cameraYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const speed = state.player.car ? Math.abs(state.player.car.speed) : (state.player.moving ? 6 : 0);
  if (speed > 2) cameraYaw += diff * Math.min(1, frameDt * 1.8);
}

// After the world steps: wasted and busted end the run, and finishing the
// last job opens the complete screen once.
function updateScreenAfterPlay() {
  if (state.wasted) {
    screen = 'wasted';
    announce('Wasted.');
  } else if (state.busted) {
    screen = 'busted';
    announce('Busted.');
  } else if (state.allMissionsDone && !completeShown) {
    completeShown = true;
    screen = 'complete';
  }
}

// One frame of play: read the pause/overlay keys, step the world in fixed
// 1/60 s slices, drain world events into the HUD, and update the screens.
function playFrame(frameDt) {
  // Pause is read BEFORE the step loop: endFrame() at the end of the
  // frame would otherwise clear the press before this check ever saw it.
  if (input.wasPressed('pause')) {
    if (screen === 'play') screen = 'pause';
    else if (screen === 'pause') screen = 'play';
  }
  if (screen === 'play') {
    handleOverlayKeys();
    followCamera(frameDt);
    // Garage and job-list overlays freeze the world while open.
    if (!state.garageOpen && !state.missionsOpen) {
      stepAccumulator += frameDt;
      while (stepAccumulator >= STEP) {
        stepWorld(state, input, STEP, audio, cameraYaw);
        stepAccumulator -= STEP;
        for (const event of state.events) {
          if (event.type === 'message') hud.showMessage(event.text, 3);
        }
        if (state.player.shootTimer > 0.18) renderer.flash();
      }
    }
    // Drop any presses that arrived while the world was frozen, so a
    // stale key cannot fire the moment an overlay closes.
    input.endFrame();
    updateScreenAfterPlay();
    audio.engine(state.player.car ? Math.abs(state.player.car.speed) / 30 : 0, !!state.player.car);
    audio.siren(state.player.wanted > 0);
  } else if (screen === 'title') {
    state.time += frameDt;
    cameraYaw = state.player.angle;
  }
  renderer.render(frameDt, cameraYaw, screen === 'title' ? 'aerial' : 'follow', null);
  hud.update(frameDt, screen);
}

// Anti-lag: sustained slow frames trigger the low-effects mode once.
// ?perf=off disables it (used by the FPS harness for raw comparisons).
// Wall-clock time, not the capped frame delta: at 1 FPS the capped
// delta would take 16 real seconds to notice 4 slow seconds.
function watchPerformance(now) {
  if (lowEffects || screen !== 'play' || params.get('perf') === 'off') {
    lastWall = now;
    return;
  }
  const wallDt = (now - lastWall) / 1000;
  lastWall = now;
  if (wallDt > 0.08) slowTime += wallDt;
  else slowTime = Math.max(0, slowTime - wallDt);
  if (slowTime > 4) {
    lowEffects = true;
    renderer.setQuality('low');
    hud.showMessage('Performance mode on — effects reduced to keep it smooth.', 4);
  }
}

function runGame() {
  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;
    playFrame(frameDt);
    watchPerformance(now);
  }
  requestAnimationFrame(frame);
}

function runShot(name) {
  window.__isShot = true;
  const scene = stageShot(name, state, input);
  screen = scene.screen;
  cameraYaw = scene.cameraYaw ?? state.player.angle;
  let painted = 0;
  function paint() {
    renderer.render(0, cameraYaw, scene.mode, scene.fixedCamera);
    hud.update(0, screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// Diagnostics handle for headless tests (FPS, missions, touch). Read-only
// except for the explicit test helpers below; the game never uses it.
function buildTestHandle() {
  const fakeInput = {
    held: {},
    wasPressed: () => false,
    takeShoot() {
      const s = testShoot;
      testShoot = false;
      return s;
    },
    endFrame() {},
  };
  return {
    state,
    input,
    mission() {
      const m = currentMission(state);
      const s = currentStep(state);
      if (!m) return {done: true, missionIndex: state.missionIndex, allMissionsDone: state.allMissionsDone};
      return {
        id: m.id, title: m.title, missionIndex: state.missionIndex,
        step: state.missionStep, stepKind: s ? s.kind : null, stepLabel: s ? s.label : null,
        target: stepTarget(state), timer: state.missionTimer,
        raceIndex: state.raceIndex, eliminated: state.eliminated,
        collected: state.missionCollected, cash: state.player.cash, rp: state.player.rp,
        allMissionsDone: state.allMissionsDone,
      };
    },
    setMission(index) {
      state.missionIndex = index;
      state.missionStep = 0;
      state.missionCollected = 0;
      state.missionHold = 0;
      state.raceIndex = 0;
      state.eliminated = 0;
      state.targetCar = null;
      state.allMissionsDone = false;
      const step = currentStep(state);
      state.missionTimer = step && step.seconds ? step.seconds : 0;
    },
    teleport(x, z) {
      const p = state.player;
      p.x = x;
      p.z = z;
      if (p.car) {
        p.car.x = x;
        p.car.z = z;
      }
    },
    putInCar(x, z, angle) {
      const car = state.cars.find((c) => Math.hypot(c.x - x, c.z - z) < 6) || state.cars[0];
      car.kind = 'player';
      car.x = x;
      car.z = z;
      car.angle = angle;
      car.speed = 0;
      const p = state.player;
      p.car = car;
      p.onFoot = false;
      p.x = car.x;
      p.z = car.z;
      p.angle = car.angle;
      return car.id;
    },
    setWanted(n) {
      state.player.wanted = n;
      state.player.crimeTimer = 0;
    },
    fire() {
      testShoot = true;
    },
    step(n, held = {}, yaw = 0) {
      fakeInput.held = held;
      for (let i = 0; i < n; i += 1) stepWorld(state, fakeInput, STEP, null, yaw);
    },
    reset() {
      resetInPlace(state, seed);
    },
    start(fresh) {
      startGame(fresh);
    },
  };
}

window.__solmar = buildTestHandle();

if (shotName) runShot(shotName);
else runGame();
