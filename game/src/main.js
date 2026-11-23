// Solmar Bay — boot and the one loop. Input is read every frame, the
// world advances in fixed 1/60 s steps, and the renderer paints what
// is there. The game moves between title, play, paused, wasted, busted
// and complete.
//
// ?seed=N fixes the city and traffic. ?shot=start|play|chase|end (with
// &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
//
// window.__solmar is a diagnostics handle for headless tests (FPS,
// mission and touch smoke tests): it exposes the live state and a way
// to step the simulation without a real keyboard. It changes nothing
// about the game.
import { CITY, STEP, STORY_INTRO } from './config.js';
import { createInput, createScriptedInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createRenderer } from './render.js';
import { applySave, buyGarage, createWorld, loadGame, resetInPlace, saveGame, stepWorld } from './world.js';
import { currentMission, currentStep, stepTarget } from './missions.js';
import { createTouchControls } from './touch.js';
import { stageShot } from './shots.js';
import { loadSettings, setSetting } from './settings.js';

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
let settings = loadSettings();

// Everything about the current session that is not world state: which
// screen is up, where the camera looks, how far the frame loop has
// session, and whether the slow-frame watchdog has fired.
const session = {
  screen: 'title',
  camYaw: state.player.angle,
  acc: 0,
  last: performance.now(),
  done: false,
  shooting: false,
  photo: false,
  lowFx: false,
  slow: 0,
  lastWall: performance.now(),
};

function showStatus(message) {
  status.textContent = message;
}

function beginGame(fresh) {
  if (fresh) {
    resetInPlace(state, seed);
    saveGame(state);
  } else applySave(state, loadGame());
  session.done = false;
  session.screen = 'play';
  session.camYaw = state.player.angle;
  audio.unlock();
  audio.setRadio(state.player.radioStation || 0);
  hud.showMessage(fresh ? 'New game. Lucia is waiting — find a car.' : 'Welcome back to Solmar Bay.', 4);
  showStatus(`Playing. ${STORY_INTRO}`);
}

function wakeAtHospital() {
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

function applySettings() {
  audio.setVolume(settings.volume);
  if (settings.quality === 'low') renderer.setQuality('low');
}

const hud = createHud(state, {
  onNewGame: () => beginGame(true),
  onContinue: () => beginGame(false),
  onResume: () => { session.screen = 'play'; },
  onRestart: () => {
    wakeAtHospital();
    session.screen = 'play';
  },
  onTitle: () => { session.screen = 'title'; },
  onFreeRoam: () => { session.screen = 'play'; },
  onGarageClose: () => { state.garageOpen = false; },
  onMissionsClose: () => { state.missionsOpen = false; },
  onSettingsClose: () => { state.settingsOpen = false; },
  onSetting: (key) => {
    const cycles = {
      quality: ['auto', 'high', 'low'],
      volume: [0.8, 0.5, 1, 0.2],
    };
    if (cycles[key]) {
      const options = cycles[key];
      const next = options[(options.indexOf(settings[key]) + 1) % options.length];
      settings = setSetting(settings, key, next);
    } else {
      settings = setSetting(settings, key, !settings[key]);
    }
    applySettings();
    hud.setSettings(settings);
  },
  onGarageBuy: (kind) => {
    hud.showGarageMessage(buyGarage(state, kind));
    saveGame(state);
  },
});
applySettings();
hud.setSettings(settings);

createTouchControls(input, {
  onCamera: () => { session.camYaw += Math.PI * 0.5; },
});

// Overlay toggles live here, not in stepWorld: the world is frozen
// while an overlay is open, so stepWorld would never read the key
// that is supposed to close it. Only while playing, not on the title
// screen.
function toggleOverlays() {
  if (input.wasPressed('missions')) state.missionsOpen = !state.missionsOpen;
  if (input.wasPressed('settings')) state.settingsOpen = !state.settingsOpen;
  if (input.wasPressed('photo') && session.screen === 'play') {
    session.photo = !session.photo;
    hud.setPhotoMode(session.photo);
  }
  if (input.wasPressed('garage')) {
    if (Math.hypot(state.player.x - CITY.safehouse.x, state.player.z - CITY.safehouse.z) < 10) {
      state.garageOpen = !state.garageOpen;
    } else {
      hud.showMessage('Garage is at the safehouse — north-west corner.', 3);
    }
  }
}

// Fold a heading difference back into the ±π range.
function wrapDelta(diff) {
  let out = diff;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

// The camera follows the player's heading, nudged by mouse movement,
// and only turns while the player is actually moving.
function chaseCamera(frameDt) {
  const invert = settings.invertCamera ? -1 : 1;
  session.camYaw -= input.takeMouseDX() * 0.0035 * invert;
  const diff = wrapDelta(state.player.angle - session.camYaw);
  const speed = state.player.car ? Math.abs(state.player.car.speed) : (state.player.moving ? 6 : 0);
  if (speed > 2) session.camYaw += diff * Math.min(1, frameDt * 1.8);
}

// After the world steps: wasted and busted end the session, and finishing
// the last job opens the complete screen once.
function resolveScreen() {
  if (state.wasted) {
    session.screen = 'wasted';
    showStatus('Wasted.');
  } else if (state.busted) {
    session.screen = 'busted';
    showStatus('Busted.');
  } else if (state.allMissionsDone && !session.done) {
    session.done = true;
    session.screen = 'complete';
  }
}

// One frame of play: read the pause/overlay keys, step the world in
// fixed 1/60 s slices, drain world events into the HUD, and update
// the screens.
function playFrame(frameDt) {
  // Pause is read BEFORE the step loop: endFrame() at the end of the
  // frame would otherwise clear the press before this check ever saw it.
  if (input.wasPressed('pause')) {
    if (session.screen === 'play') session.screen = 'pause';
    else if (session.screen === 'pause') session.screen = 'play';
  }
  // Leaving play (pause, wasted, busted, complete) always exits photo
  // mode, so an overlay can never be hidden behind a hidden HUD.
  if (session.screen !== 'play' && session.photo) {
    session.photo = false;
    hud.setPhotoMode(false);
  }
  if (session.screen === 'play') {
    toggleOverlays();
    chaseCamera(frameDt);
    // Garage, job-list and settings overlays freeze the world while open.
    if (!state.garageOpen && !state.missionsOpen && !state.settingsOpen) {
      session.acc += frameDt;
      while (session.acc >= STEP) {
        stepWorld(state, input, STEP, audio, session.camYaw);
        session.acc -= STEP;
        for (const event of state.events) {
          if (event.type === 'message') hud.showMessage(event.text, 3);
        }
        if (state.player.shootTimer > 0.18) renderer.flash();
      }
    }
    // Drop any presses that arrived while the world was frozen, so a
    // stale key cannot fire the moment an overlay closes.
    input.endFrame();
    resolveScreen();
    audio.engine(state.player.car ? Math.abs(state.player.car.speed) / 30 : 0, !!state.player.car);
    audio.siren(state.player.wanted > 0);
    audio.rain(settings.weatherOn ? state.weather.rain : 0);
  } else if (session.screen === 'title') {
    state.time += frameDt;
    session.camYaw = state.player.angle;
  }
  renderer.render(frameDt, session.camYaw, session.screen === 'title' ? 'aerial' : 'follow', null);
  hud.update(frameDt, session.screen);
}

// Anti-lag: sustained slow frames trigger the low-effects mode once.
// ?perf=off disables it (used by the FPS harness for raw comparisons).
// Wall-clock time, not the capped frame delta: at 1 FPS the capped
// delta would take 16 real seconds to notice 4 slow seconds.
function watchFps(now) {
  if (session.lowFx || session.screen !== 'play' || params.get('perf') === 'off') {
    session.lastWall = now;
    return;
  }
  const wallDt = (now - session.lastWall) / 1000;
  session.lastWall = now;
  if (wallDt > 0.08) session.slow += wallDt;
  else session.slow = Math.max(0, session.slow - wallDt);
  if (session.slow > 4) {
    session.lowFx = true;
    renderer.setQuality('low');
    hud.showMessage('Performance mode on — effects reduced to keep it smooth.', 4);
  }
}

function runGame() {
  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min(0.25, (now - session.last) / 1000);
    session.last = now;
    playFrame(frameDt);
    watchFps(now);
  }
  requestAnimationFrame(frame);
}

function runShot(name) {
  window.__isShot = true;
  const scene = stageShot(name, state, input);
  session.screen = scene.screen;
  session.camYaw = scene.cameraYaw ?? state.player.angle;
  let painted = 0;
  function paint() {
    renderer.render(0, session.camYaw, scene.mode, scene.fixedCamera);
    hud.update(0, session.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

// Diagnostics handle for headless tests (FPS, missions, touch).
// Read-only except for the explicit test helpers below; the game never
// uses it.
function makeTestHandle() {
  const fakeInput = {
    held: {},
    wasPressed: () => false,
    takeShoot() {
      const s = session.shooting;
      session.shooting = false;
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
      session.shooting = true;
    },
    step(n, held = {}, yaw = 0) {
      fakeInput.held = held;
      for (let i = 0; i < n; i += 1) stepWorld(state, fakeInput, STEP, null, yaw);
    },
    reset() {
      resetInPlace(state, seed);
    },
    start(fresh) {
      beginGame(fresh);
    },
  };
}

window.__solmar = makeTestHandle();

if (shotName) runShot(shotName);
else runGame();
