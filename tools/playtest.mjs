// Desktop play test with REAL keyboard input: New Game, walk, enter a car
// with one E press (and stay in), drive, weapon locks, radio, crew
// plates, garage, jobs, pause, photo mode, save and continue.
//
//   node tools/playtest.mjs   (needs the dev server on :8080)
import { launchChrome, openTab } from './cdp-lib.mjs';

const URL = process.env.GAME_URL || 'http://localhost:8080/?seed=7';
const failures = [];

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function holdKey(tab, code, key, ms) {
  await tab.keyDown(code, key);
  await sleep(ms);
  await tab.keyUp(code, key);
}

// Poll a page expression until it is true; false on timeout instead
// of throwing, so one flaky check cannot abort the whole test.
async function poll(tab, expr, timeoutMs = 5000) {
  try {
    await tab.waitFor(expr, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

// Wait until the real frame loop has run at least once after the call.
async function waitFrame(tab) {
  const t0 = await tab.evalJs('__solmar.state.time');
  await poll(tab, `__solmar.state.time !== ${t0}`, 5000);
}

const browser = await launchChrome({width: 1280, height: 800});
try {
  const tab = await openTab(browser, URL);
  try {
    await tab.waitFor('window.__solmar');

    // Boot: a fresh game starts with $120 and no car.
    await tab.evalJs(`document.getElementById('btn-new').click()`);
    await sleep(800);
    const cash0 = await tab.evalJs('__solmar.state.player.cash');
    check('New Game cash is $120', cash0 === 120, `$${cash0}`);

    // Walk: hold W for two seconds, Rico must cover ground.
    const p0 = await tab.evalJs('({x: __solmar.state.player.x, z: __solmar.state.player.z})');
    await holdKey(tab, 'KeyW', 'w', 2000);
    const p1 = await tab.evalJs('({x: __solmar.state.player.x, z: __solmar.state.player.z})');
    const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    check('W walks >3 m', walked > 3, `${walked.toFixed(2)} m`);

    // Enter a car: walk up to one, press E once. One press must enter
    // AND stay in — the edge is consumed on first read, so the same
    // press must not exit again.
    await tab.evalJs(`(() => {
      const p = __solmar.state.player;
      const car = __solmar.state.cars.find((c) => Math.hypot(c.x - p.x, c.z - p.z) < 8) || __solmar.state.cars[0];
      __solmar.teleport(car.x, car.z + 2);
    })()`);
    await tab.tapKey('KeyE', 'e');
    // The press is processed by the real frame loop, which runs at a
    // few FPS under SwiftShader — poll instead of a fixed sleep.
    await tab.waitFor('!!__solmar.state.player.car', 5000);
    const inCar = await tab.evalJs('!!__solmar.state.player.car');
    check('one E press enters car and stays in', inCar === true);

    // Drive: hold W for three seconds, the car must be moving fast.
    await holdKey(tab, 'KeyW', 'w', 3000);
    const speed = await tab.evalJs('Math.abs(__solmar.state.player.car ? __solmar.state.player.car.speed : 0)');
    check('W drives >5 m/s', speed > 5, `${speed.toFixed(1)} m/s`);

    // Weapon locks: Digit3 is the SMG, locked at 0 RP; at 300 RP it
    // opens and selects. For the locked case wait a full frame, then
    // confirm the press was processed and still refused.
    await tab.tapKey('Digit3', '3');
    await waitFrame(tab);
    const wLocked = await tab.evalJs('__solmar.state.player.weaponIndex');
    check('Digit3 locked at 0 RP', wLocked !== 2, `weaponIndex=${wLocked}`);
    await tab.evalJs('__solmar.state.player.rp = 300; __solmar.step(10)');
    await tab.tapKey('Digit3', '3');
    const wOpened = await poll(tab, '__solmar.state.player.weaponIndex === 2');
    const wOpen = await tab.evalJs('__solmar.state.player.weaponIndex');
    check('Digit3 selects SMG at 300 RP', wOpened && wOpen === 2, `weaponIndex=${wOpen}`);

    // Radio cycles on C; plates drop a star. Poll for the cycle: under
    // SwiftShader a frame can take half a second, so a fixed sleep is flaky.
    const radio0 = await tab.evalJs('__solmar.state.player.radioStation');
    await tab.tapKey('KeyC', 'c');
    await tab.waitFor(`__solmar.state.player.radioStation !== ${radio0}`, 5000);
    const radio1 = await tab.evalJs('__solmar.state.player.radioStation');
    check('C cycles radio', radio1 !== radio0, `${radio0} -> ${radio1}`);
    await tab.evalJs('__solmar.setWanted(2)');
    await tab.tapKey('KeyZ', 'z');
    const platesOk = await poll(tab, '__solmar.state.player.wanted === 1');
    const wanted = await tab.evalJs('__solmar.state.player.wanted');
    check('Z plates drop a star 2 -> 1', platesOk && wanted === 1, `wanted=${wanted}`);

    // Garage: at the safehouse, G opens it and a tune purchase lands.
    // Each toggle is polled for its effect: under SwiftShader a frame
    // can take half a second, so a fixed sleep both misses the frame
    // and lets two quick taps collapse into a single toggle.
    await tab.evalJs('__solmar.teleport(-130, -128); __solmar.step(5)');
    await tab.tapKey('KeyG', 'g');
    const garageOpen = await poll(tab, '__solmar.state.garageOpen');
    check('G opens garage at safehouse', garageOpen === true);
    // A tune costs $400 and a fresh game only has $120 — fund Rico
    // first, or the purchase (correctly) refuses.
    await tab.evalJs('__solmar.state.player.cash = 1000');
    await tab.evalJs(`document.querySelector('[data-garage="tune"]').click()`);
    await sleep(300);
    const tune = await tab.evalJs('__solmar.state.player.garage.tune');
    check('buy tune -> tune is 1', tune === 1, `tune=${tune}`);
    await tab.tapKey('KeyG', 'g');
    const garageClosed = await poll(tab, '!__solmar.state.garageOpen');
    check('G closes garage', garageClosed === true);

    // Jobs list, pause/resume, photo mode.
    await tab.tapKey('KeyM', 'm');
    const jobsOpen = await poll(tab, '__solmar.state.missionsOpen');
    check('M opens jobs', jobsOpen === true);
    await tab.tapKey('KeyM', 'm');
    const jobsClosed = await poll(tab, '!__solmar.state.missionsOpen');
    check('M closes jobs', jobsClosed === true);
    await tab.tapKey('Escape', 'Escape');
    const paused = await poll(tab, `document.getElementById('screen-pause').style.display === 'flex'`);
    check('Esc pauses', paused === true);
    await tab.tapKey('Escape', 'Escape');
    const resumed = await poll(tab, `document.getElementById('screen-pause').style.display === 'none'`);
    check('Esc resumes', resumed === true);
    await tab.tapKey('KeyH', 'h');
    const photo = await poll(tab, `document.body.classList.contains('photo-mode')`);
    check('H photo mode', photo === true);
    await tab.tapKey('KeyH', 'h');

    // Save and continue: set a marker state, let the autosave (every
    // 15 game-seconds) persist it, reload the page, continue, and the
    // marker must be back.
    await tab.evalJs(`(() => {
      const p = __solmar.state.player;
      p.cash = 777;
      __solmar.setMission(3);
      p.garage.tune = 1;
    })()`);
    await tab.evalJs('__solmar.step(1000)');
    const saveWritten = await tab.evalJs(`localStorage.getItem('solmar-bay.save.v1') !== null`);
    check('autosave writes a save', saveWritten === true);
    await tab.evalJs('location.reload()');
    // The old page's __solmar can answer a poll before the navigation
    // even starts, so wait for the NEW page's DOM instead: the Continue
    // button only exists once the fresh document has parsed.
    await tab.waitFor(`document.getElementById('btn-continue') !== null`, 30000);
    await tab.waitFor('window.__solmar');
    await sleep(800);
    await tab.evalJs(`document.getElementById('btn-continue').click()`);
    await sleep(800);
    const restored = await tab.evalJs('({cash: __solmar.state.player.cash, mission: __solmar.state.missionIndex, tune: __solmar.state.player.garage.tune})');
    check('save/continue restores cash 777, mission 3, tune 1',
      restored.cash === 777 && restored.mission === 3 && restored.tune === 1, JSON.stringify(restored));

    const errors = tab.consoleErrors();
    check('0 console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await tab.close();
  }
} finally {
  browser.close();
}

console.log(failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILURES: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
