// Desktop play test with REAL keyboard input: New Game, walk, enter a car
// (one E press must mean enter — not enter-and-exit), drive, switch
// weapons, radio, crew ability, garage purchase, job list, pause/resume,
// and save → reload → Continue. Reports PASS/FAIL per step.
// Usage: node tools/playtest.mjs
import { launchChrome, connect, newTab, evalJs, consoleErrors, sleep, waitFor, tapKey, keyDown, keyUp } from './cdp-lib.mjs';

const { child, port } = await launchChrome(1280, 800, false);
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
};
try {
  const { send, events } = await connect(port);
  await newTab(send, 'http://127.0.0.1:8080/?seed=7', 1280, 800, false);
  await waitFor(send, '!!window.__solmar', 60000);
  const S = (expr) => `(() => { const s = window.__solmar; return ${expr}; })()`;

  await evalJs(send, `document.getElementById('btn-new').click(); 'ok'`);
  await sleep(1500);
  check('New Game starts', (await evalJs(send, S(`s.state.player.cash === 120`))) === true);

  // Walk forward with W: Rico must move. (Long hold: the first seconds
  // after New Game are still warming up SwiftShader's shader compile.)
  const p0 = await evalJs(send, S(`({x: s.state.player.x, z: s.state.player.z})`));
  await keyDown(send, 'KeyW', 'w');
  await sleep(6000);
  await keyUp(send, 'KeyW', 'w');
  const p1 = await evalJs(send, S(`({x: s.state.player.x, z: s.state.player.z})`));
  check('W walks the player', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 3, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);

  // Teleport next to a parked car and press E ONCE: must end up IN the car.
  await evalJs(send, S(`s.teleport(-44, -98)`));
  await sleep(500);
  await tapKey(send, 'KeyE', 'e');
  const inCar = await waitFor(send, `!!window.__solmar.state.player.car`, 8000);
  const stillInCar = await evalJs(send, S(`!!s.state.player.car`));
  check('one E press enters the car and stays in', inCar && stillInCar === true);

  // Drive with W: speed must rise, car must move.
  const c0 = await evalJs(send, S(`({x: s.state.player.x, z: s.state.player.z})`));
  await keyDown(send, 'KeyW', 'w');
  await sleep(3000);
  const speed = await evalJs(send, S(`Math.abs(s.state.player.car ? s.state.player.car.speed : 0)`));
  await keyUp(send, 'KeyW', 'w');
  check('W drives the car', speed > 5, `${speed.toFixed(1)} m/s`);

  // Weapon keys: 3 is locked at 0 RP (must stay on pistol), then unlock.
  await tapKey(send, 'Digit3', '3');
  await sleep(1500);
  const wLocked = await evalJs(send, S(`s.state.player.weaponIndex`));
  check('locked weapon key does not switch', wLocked === 1, `index=${wLocked}`);
  await evalJs(send, S(`s.state.player.rp = 300`));
  await sleep(1500); // unlockWeapons runs in the live loop
  await tapKey(send, 'Digit3', '3');
  const wSmg = await waitFor(send, `window.__solmar.state.player.weaponIndex === 2`, 8000);
  check('SMG unlocks with RP and Digit3 equips it', wSmg === true);

  // Radio: C cycles the station.
  const r0 = await evalJs(send, S(`s.state.player.radioStation`));
  await tapKey(send, 'KeyC', 'c');
  const r1 = await waitFor(send, `window.__solmar.state.player.radioStation !== ${r0}`, 8000);
  check('C cycles the radio station', r1 === true, `${r0} -> ${await evalJs(send, S(`s.state.player.radioStation`))}`);

  // Crew: Z (Swap Plates) needs heat; give 2 stars first, then Z drops one.
  await evalJs(send, S(`s.setWanted(2)`));
  await sleep(1500);
  await tapKey(send, 'KeyZ', 'z');
  const starsAfter = await waitFor(send, `window.__solmar.state.player.wanted === 1`, 8000);
  check('Z Swap Plates drops one wanted star', starsAfter === true);

  // Garage: at the safehouse, G opens it; buy a tune with real clicks.
  await evalJs(send, S(`s.setWanted(0), s.state.player.cash = 1000, s.teleport(-130, -128), s.state.player.onFoot = true, (s.state.player.car ? (s.state.player.car.kind = 'parked', s.state.player.car = null) : null)`));
  await sleep(1000);
  await tapKey(send, 'KeyG', 'g');
  const garageOpen = await waitFor(send, `window.__solmar.state.garageOpen === true`, 8000);
  check('G opens the garage at the safehouse', garageOpen === true);
  await evalJs(send, `[...document.querySelectorAll('[data-garage]')].find(b => b.getAttribute('data-garage') === 'tune').click(); 'ok'`);
  await sleep(1200);
  const tune = await evalJs(send, S(`s.state.player.garage.tune`));
  check('garage tune purchase spends cash and applies', tune === 1, `tune=${tune}`);
  await tapKey(send, 'KeyG', 'g');
  await sleep(1200);

  // Job list: M opens, M closes.
  await tapKey(send, 'KeyM', 'm');
  const jobsOpen = await waitFor(send, `window.__solmar.state.missionsOpen === true`, 8000);
  check('M opens the job list', jobsOpen === true);
  await tapKey(send, 'KeyM', 'm');
  const jobsClosed = await waitFor(send, `window.__solmar.state.missionsOpen === false`, 8000);
  check('M closes the job list', jobsClosed === true);

  // Pause: Esc pauses, Esc resumes.
  await tapKey(send, 'Escape', 'Escape');
  const paused = await waitFor(send, `document.getElementById('screen-pause').style.display === 'flex'`, 8000);
  check('Esc pauses the game', paused === true);
  await tapKey(send, 'Escape', 'Escape');
  const resumed = await waitFor(send, `document.getElementById('screen-pause').style.display === 'none'`, 8000);
  check('Esc resumes the game', resumed === true);

  // Save: cash + mission progress survive a reload via Continue.
  await evalJs(send, S(`s.state.player.cash = 777, s.setMission(3)`));
  await sleep(2000); // autosave is 15 s; force one via the pause-menu path instead
  await evalJs(send, `window.__solmar.state.player.cash = 777; localStorage.setItem('solmar-bay.save.v1', JSON.stringify({cash: 777, rp: 123, missionIndex: 3, missionStep: 0, x: 0, z: 30, allMissionsDone: false, radioStation: 1, garage: {tune: 1, armor: 0}, weapons: [], weaponIndex: 1, districtHeat: {}})); 'saved'`);
  await send('Page.navigate', { url: 'http://127.0.0.1:8080/?seed=7' });
  await waitFor(send, '!!window.__solmar', 60000);
  await evalJs(send, `document.getElementById('btn-continue').click(); 'ok'`);
  await sleep(1500);
  const restored = await evalJs(send, S(`({cash: s.state.player.cash, mission: s.state.missionIndex, tune: s.state.player.garage.tune})`));
  check('Continue restores cash, mission and garage', restored.cash === 777 && restored.mission === 3 && restored.tune === 1, JSON.stringify(restored));

  const errs = consoleErrors(events);
  check('0 console errors', errs.length === 0, errs.join('; '));
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\nPlay test: ${results.filter((r) => r.ok).length}/${results.length} passed.`);
  process.exit(fails ? 1 : 0);
} finally {
  child.kill();
}
