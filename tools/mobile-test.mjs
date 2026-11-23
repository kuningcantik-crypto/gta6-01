// Mobile smoke test: 390x844 phone viewport, touch the New Game button,
// drag the virtual joystick, hold GAS, tap WPN/ACT, and confirm the player
// and car actually respond — plus a mobile screenshot for visual check.
// Usage: node tools/mobile-test.mjs [out.jpg]
import { launchChrome, connect, newTab, evalJs, consoleErrors, sleep, waitFor, screenshot } from './cdp-lib.mjs';

const OUT = process.argv[2] || '/tmp/mobile.jpg';
const { child, port } = await launchChrome(390, 844, true);
try {
  const { send, events } = await connect(port);
  await newTab(send, 'http://127.0.0.1:8080/?seed=7', 390, 844, true);
  const booted = await waitFor(send, '!!window.__solmar', 60000);
  if (!booted) throw new Error('game did not boot');
  const S = (expr) => `(() => { const s = window.__solmar; return ${expr}; })()`;

  // Is the touch UI actually shown? It appears on first touchstart.
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 700, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(500);
  const touchVisible = await evalJs(send, `document.body.classList.contains('touch') && getComputedStyle(document.getElementById('touch-ui')).display !== 'none'`);
  console.log(`${touchVisible ? 'PASS' : 'FAIL'} touch UI appears on first touch`);

  // Tap New Game via touch (button centre from the live layout).
  const btn = await evalJs(send, `(() => { const r = document.getElementById('btn-new').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: btn.x, y: btn.y, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // The first frame after New Game can take seconds under SwiftShader;
  // poll for the title screen actually hiding instead of a fixed sleep.
  const started = await waitFor(send, `document.getElementById('screen-title').style.display === 'none'`, 15000);
  console.log(`${started ? 'PASS' : 'FAIL'} New Game starts by touch`);

  // Virtual joystick: press in the joystick, drag up, hold — Rico must walk.
  // Wait until the joystick has a real size (HUD visible after first frame).
  await waitFor(send, `document.getElementById('joystick').getBoundingClientRect().width > 0`, 10000);
  const joy = await evalJs(send, `(() => { const r = document.getElementById('joystick').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const p0 = await evalJs(send, S(`({x: s.state.player.x, z: s.state.player.z})`));
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joy.x, y: joy.y, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: joy.x, y: joy.y - 45, id: 1 }] });
  await sleep(300);
  const heldDuring = await evalJs(send, `window.__touchState().held.up`);
  await sleep(2500);
  const p1 = await evalJs(send, S(`({x: s.state.player.x, z: s.state.player.z})`));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1500);
  const touchAfter = await evalJs(send, `window.__touchState()`);
  console.log(`${touchAfter.joyVec.x === 0 && touchAfter.joyVec.y === 0 && !touchAfter.held.up ? 'PASS' : 'FAIL'} joystick releases cleanly (vec=${JSON.stringify(touchAfter.joyVec)} held.up=${touchAfter.held.up})`);
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  console.log(`${heldDuring ? 'PASS' : 'FAIL'} joystick sets held.up (=${heldDuring})`);
  console.log(`${moved > 1 ? 'PASS' : 'FAIL'} joystick walks the player (${moved.toFixed(1)} m in ~3 s)`);

  // GAS button: put Rico in a car first, then hold GAS and watch speed rise.
  await evalJs(send, S(`s.putInCar(-44, -100, 0), s.teleport(-44, -100)`));
  const gas = await evalJs(send, `(() => { const r = document.getElementById('btn-gas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gas.x, y: gas.y, id: 2 }] });
  await sleep(300);
  const gasHeld = await evalJs(send, `window.__touchState().held.up`);
  await sleep(2500);
  const speed = await evalJs(send, S(`Math.abs(s.state.player.car ? s.state.player.car.speed : 0)`));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log(`${gasHeld ? 'PASS' : 'FAIL'} GAS button holds up (=${gasHeld})`);
  console.log(`${speed > 3 ? 'PASS' : 'FAIL'} GAS accelerates the car (${speed.toFixed(1)} m/s)`);

  // WPN button cycles the weapon; JOBS opens the mission list.
  const wpn = await evalJs(send, `(() => { const r = document.getElementById('btn-wpn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const w0 = await evalJs(send, S(`s.state.player.weaponIndex`));
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: wpn.x, y: wpn.y, id: 3 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1500);
  const w1 = await evalJs(send, S(`s.state.player.weaponIndex`));
  console.log(`${w1 !== w0 ? 'PASS' : 'FAIL'} WPN cycles weapon (${w0} -> ${w1})`);
  const msn = await evalJs(send, `(() => { const r = document.getElementById('btn-msn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: msn.x, y: msn.y, id: 4 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // At ~1 FPS under SwiftShader, poll for the state instead of a fixed sleep.
  let jobsOpen = await waitFor(send, `window.__solmar.state.missionsOpen === true`, 8000);
  if (!jobsOpen) {
    // One retry — a tap can land between frames and be swallowed.
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: msn.x, y: msn.y, id: 4 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    jobsOpen = await waitFor(send, `window.__solmar.state.missionsOpen === true`, 8000);
  }
  console.log(`${jobsOpen ? 'PASS' : 'FAIL'} JOBS opens the mission list`);
  // Close via the overlay's Close button (the JOBS key sits under the
  // overlay while it is open, so the button/backdrop is the way out).
  const closeBtn = await evalJs(send, `(() => { const r = document.getElementById('btn-missions-close').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: closeBtn.x, y: closeBtn.y, id: 4 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const jobsClosed = await waitFor(send, `window.__solmar.state.missionsOpen === false`, 10000);
  console.log(`${jobsClosed ? 'PASS' : 'FAIL'} Close button closes the mission list`);

  await screenshot(send, OUT);
  console.log('mobile screenshot:', OUT);
  const errs = consoleErrors(events);
  console.log('console errors:', errs.length ? errs : 'none');
} finally {
  child.kill();
}
