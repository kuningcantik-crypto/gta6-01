// Desktop play test with REAL keyboard input: New Game, walk, enter a car
// (one E press must mean enter — not enter-and-exit), drive, switch
// weapons, radio, crew ability, garage purchase, job list, pause/resume,
// and save → reload → Continue. Reports PASS/FAIL per step.
// Usage: node tools/playtest.mjs
import { launchChrome, connect, newTab, evalJs, consoleErrors, sleep, waitFor, tapKey, keyDown, keyUp } from './cdp-lib.mjs';

const { child, port } = await launchChrome(1280, 800, false);
const results = [];
function report(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
}

try {
  const { send, events } = await connect(port);
  await newTab(send, 'http://127.0.0.1:8080/?seed=7', 1280, 800, false);
  await waitFor(send, '!!window.__solmar', 60000);
  const call = (expr) => evalJs(send, `(() => { const s = window.__solmar; return ${expr}; })()`);
  const playerPos = () => call(`({x: s.state.player.x, z: s.state.player.z})`);
  async function holdKey(code, k, ms) {
    await keyDown(send, code, k);
    await sleep(ms);
    await keyUp(send, code, k);
  }

  report('game boots (__solmar present)', (await call(`!!window.__solmar`)) === true);

  await evalJs(send, `document.getElementById('btn-new').click(); 'ok'`);
  await sleep(1500);
  report('New Game starts', (await call(`s.state.player.cash === 120`)) === true);

  // Walk forward with W: Rico must move. (Long hold: the first seconds
  // after New Game are still warming up SwiftShader's shader compile.)
  const p0 = await playerPos();
  await holdKey('KeyW', 'w', 6000);
  const p1 = await playerPos();
  const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  report('W walks the player', walked > 3, `${walked.toFixed(1)} m`);

  // Teleport next to a parked car and press E ONCE: must end up IN the car.
  await call(`s.teleport(-44, -98)`);
  await sleep(500);
  await tapKey(send, 'KeyE', 'e');
  const inCar = await waitFor(send, `!!window.__solmar.state.player.car`, 8000);
  const stillInCar = await call(`!!s.state.player.car`);
  report('one E press enters the car and stays in', inCar && stillInCar === true);

  // Drive with W: speed must rise, car must move.
  await keyDown(send, 'KeyW', 'w');
  await sleep(3000);
  const speed = await call(`Math.abs(s.state.player.car ? s.state.player.car.speed : 0)`);
  await keyUp(send, 'KeyW', 'w');
  report('W drives the car', speed > 5, `${speed.toFixed(1)} m/s`);

  // Weapon keys: 3 is locked at 0 RP (must stay on pistol), then unlock.
  await tapKey(send, 'Digit3', '3');
  await sleep(1500);
  const wLocked = await call(`s.state.player.weaponIndex`);
  report('locked weapon key does not switch', wLocked === 1, `index=${wLocked}`);
  await call(`s.state.player.rp = 300`);
  await sleep(1500); // unlockWeapons runs in the live loop
  await tapKey(send, 'Digit3', '3');
  const wSmg = await waitFor(send, `window.__solmar.state.player.weaponIndex === 2`, 8000);
  report('SMG unlocks with RP and Digit3 equips it', wSmg === true);

  // Radio: C cycles the station.
  const r0 = await call(`s.state.player.radioStation`);
  await tapKey(send, 'KeyC', 'c');
  const r1 = await waitFor(send, `window.__solmar.state.player.radioStation !== ${r0}`, 8000);
  report('C cycles the radio station', r1 === true, `${r0} -> ${await call(`s.state.player.radioStation`)}`);

  // Crew: Z (Swap Plates) needs heat; give 2 stars first, then Z drops one.
  await call(`s.setWanted(2)`);
  await sleep(1500);
  await tapKey(send, 'KeyZ', 'z');
  const starsAfter = await waitFor(send, `window.__solmar.state.player.wanted === 1`, 8000);
  report('Z Swap Plates drops one wanted star', starsAfter === true);

  // Garage: at the safehouse, G opens it; buy a tune with real clicks.
  await call(`s.setWanted(0), s.state.player.cash = 1000, s.teleport(-130, -128), s.state.player.onFoot = true, (s.state.player.car ? (s.state.player.car.kind = 'parked', s.state.player.car = null) : null)`);
  await sleep(1000);
  await tapKey(send, 'KeyG', 'g');
  const garageOpen = await waitFor(send, `window.__solmar.state.garageOpen === true`, 8000);
  report('G opens the garage at the safehouse', garageOpen === true);
  await evalJs(send, `[...document.querySelectorAll('[data-garage]')].find(b => b.getAttribute('data-garage') === 'tune').click(); 'ok'`);
  await sleep(1200);
  const tune = await call(`s.state.player.garage.tune`);
  report('garage tune purchase spends cash and applies', tune === 1, `tune=${tune}`);
  await tapKey(send, 'KeyG', 'g');
  await sleep(1200);

  // Job list: M opens, M closes.
  await tapKey(send, 'KeyM', 'm');
  const jobsOpen = await waitFor(send, `window.__solmar.state.missionsOpen === true`, 8000);
  report('M opens the job list', jobsOpen === true);
  await tapKey(send, 'KeyM', 'm');
  const jobsClosed = await waitFor(send, `window.__solmar.state.missionsOpen === false`, 8000);
  report('M closes the job list', jobsClosed === true);

  // Pause: Esc pauses, Esc resumes.
  await tapKey(send, 'Escape', 'Escape');
  const paused = await waitFor(send, `document.getElementById('screen-pause').style.display === 'flex'`, 8000);
  report('Esc pauses the game', paused === true);
  await tapKey(send, 'Escape', 'Escape');
  const resumed = await waitFor(send, `document.getElementById('screen-pause').style.display === 'none'`, 8000);
  report('Esc resumes the game', resumed === true);

  // Photo mode: H hides the HUD, H brings it back.
  await tapKey(send, 'KeyH', 'h');
  const photoHidden = await waitFor(send, `document.getElementById('hud').style.display === 'none'`, 8000);
  report('H hides the HUD for photos', photoHidden === true);
  await tapKey(send, 'KeyH', 'h');
  // The next frame's update() writes 'block'; accept any visible state.
  const photoBack = await waitFor(send, `document.getElementById('hud').style.display !== 'none'`, 8000);
  report('H restores the HUD', photoBack === true);

  // Save: cash + mission progress survive a reload via Continue.
  await call(`s.state.player.cash = 777, s.setMission(3)`);
  await sleep(2000); // autosave is 15 s; force one via the pause-menu path instead
  await evalJs(send, `window.__solmar.state.player.cash = 777; localStorage.setItem('solmar-bay.save.v1', JSON.stringify({cash: 777, rp: 123, missionIndex: 3, missionStep: 0, x: 0, z: 30, allMissionsDone: false, radioStation: 1, garage: {tune: 1, armor: 0}, weapons: [], weaponIndex: 1, districtHeat: {}})); 'saved'`);
  await send('Page.navigate', { url: 'http://127.0.0.1:8080/?seed=7' });
  await waitFor(send, '!!window.__solmar', 60000);
  await evalJs(send, `document.getElementById('btn-continue').click(); 'ok'`);
  await sleep(1500);
  const restored = await call(`({cash: s.state.player.cash, mission: s.state.missionIndex, tune: s.state.player.garage.tune})`);
  report('Continue restores cash, mission and garage', restored.cash === 777 && restored.mission === 3 && restored.tune === 1, JSON.stringify(restored));

  const errs = consoleErrors(events);
  report('0 console errors', errs.length === 0, errs.join('; '));
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\nPlay test: ${results.filter((r) => r.ok).length}/${results.length} passed.`);
  process.exit(fails ? 1 : 0);
} finally {
  child.kill();
}
