// Mobile smoke test: 390x844 phone viewport, touch the New Game button,
// drag the virtual joystick, hold GAS, tap WPN/ACT, and confirm the player
// and car actually respond — plus a mobile screenshot for visual check.
// Usage: node tools/mobile-test.mjs [out.jpg]
import { launchChrome, connect, newTab, evalJs, consoleErrors, sleep, waitFor, screenshot, touchDrag, touchTap } from './cdp-lib.mjs';

const OUT = process.argv[2] || '/tmp/mobile.jpg';
const {child, port} = await launchChrome(390, 844, true);
let passes = 0;
let total = 0;
function verdict(name, ok, extra = '') {
  total += 1;
  if (ok) passes += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
}

try {
  const {send, events} = await connect(port);
  await newTab(send, 'http://127.0.0.1:8080/?seed=7', 390, 844, true);
  const booted = await waitFor(send, '!!window.__solmar', 60000);
  if (!booted) throw new Error('game did not boot');
  const call = (expr) => evalJs(send, `(() => { const s = window.__solmar; return ${expr}; })()`);
  const centreOf = (id) => evalJs(send, `(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const playerPos = () => call(`({x: s.state.player.x, z: s.state.player.z})`);
  async function fingerDown(x, y, id) {
    await send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id}]});
  }
  async function fingerMove(x, y, id) {
    await send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y, id}]});
  }
  async function fingerUp() {
    await send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  }

  // Is the touch UI actually shown? It appears on first touchstart.
  await touchTap(send, 195, 700);
  await sleep(500);
  const touchVisible = await evalJs(send, `document.body.classList.contains('touch') && getComputedStyle(document.getElementById('touch-ui')).display !== 'none'`);
  verdict('touch UI appears on first touch', touchVisible);

  // Tap New Game via touch (button centre from the live layout).
  const btn = await centreOf('btn-new');
  await touchTap(send, btn.x, btn.y);
  // The first frame after New Game can take seconds under SwiftShader;
  // poll for the title screen actually hiding instead of a fixed sleep.
  const started = await waitFor(send, `document.getElementById('screen-title').style.display === 'none'`, 15000);
  verdict('New Game starts by touch', started);

  // Virtual joystick: press in the joystick, drag up, hold — Rico must walk.
  // Wait until the joystick has a real size (HUD visible after first frame).
  await waitFor(send, `document.getElementById('joystick').getBoundingClientRect().width > 0`, 10000);
  const joy = await centreOf('joystick');
  const p0 = await playerPos();
  await fingerDown(joy.x, joy.y, 1);
  await fingerMove(joy.x, joy.y - 45, 1);
  await sleep(300);
  const heldDuring = await evalJs(send, `window.__touchState().held.up`);
  await sleep(2500);
  const p1 = await playerPos();
  await fingerUp();
  await sleep(1500);
  // A second, shorter drag confirms the stick recentres after release.
  await touchDrag(send, joy.x, joy.y, joy.x, joy.y - 20, 5);
  const recentred = await evalJs(send, `window.__touchState().joyVec.x === 0 && window.__touchState().joyVec.y === 0`);
  const touchAfter = await evalJs(send, `window.__touchState()`);
  verdict('joystick releases cleanly', touchAfter.joyVec.x === 0 && touchAfter.joyVec.y === 0 && !touchAfter.held.up, `vec=${JSON.stringify(touchAfter.joyVec)} held.up=${touchAfter.held.up}`);
  verdict('joystick recentres after a second drag', recentred);
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  verdict('joystick sets held.up', heldDuring, `=${heldDuring}`);
  verdict('joystick walks the player', moved > 1, `${moved.toFixed(1)} m in ~3 s`);

  // GAS button: put Rico in a car first, then hold GAS and watch speed rise.
  await call(`s.putInCar(-44, -100, 0), s.teleport(-44, -100)`);
  const gas = await centreOf('btn-gas');
  await fingerDown(gas.x, gas.y, 2);
  await sleep(300);
  const gasHeld = await evalJs(send, `window.__touchState().held.up`);
  await sleep(2500);
  const speed = await call(`Math.abs(s.state.player.car ? s.state.player.car.speed : 0)`);
  await fingerUp();
  verdict('GAS button holds up', gasHeld, `=${gasHeld}`);
  verdict('GAS accelerates the car', speed > 3, `${speed.toFixed(1)} m/s`);

  // WPN button cycles the weapon; JOBS opens the mission list.
  const wpn = await centreOf('btn-wpn');
  const w0 = await call(`s.state.player.weaponIndex`);
  await touchTap(send, wpn.x, wpn.y);
  await sleep(1500);
  const w1 = await call(`s.state.player.weaponIndex`);
  verdict('WPN cycles weapon', w1 !== w0, `${w0} -> ${w1}`);
  const msn = await centreOf('btn-msn');
  await touchTap(send, msn.x, msn.y);
  // At ~1 FPS under SwiftShader, poll for the state instead of a fixed sleep.
  let jobsOpen = await waitFor(send, `window.__solmar.state.missionsOpen === true`, 8000);
  if (!jobsOpen) {
    // One retry — a tap can land between frames and be swallowed.
    await touchTap(send, msn.x, msn.y);
    jobsOpen = await waitFor(send, `window.__solmar.state.missionsOpen === true`, 8000);
  }
  verdict('JOBS opens the mission list', jobsOpen);
  // Close via the overlay's Close button (the JOBS key sits under the
  // overlay while it is open, so the button/backdrop is the way out).
  const closeBtn = await centreOf('btn-missions-close');
  await touchTap(send, closeBtn.x, closeBtn.y);
  const jobsClosed = await waitFor(send, `window.__solmar.state.missionsOpen === false`, 10000);
  verdict('Close button closes the mission list', jobsClosed);

  await screenshot(send, OUT);
  console.log('mobile screenshot:', OUT);
  const errs = consoleErrors(events);
  console.log('console errors:', errs.length ? errs : 'none');
  console.log(`Mobile test: ${passes}/${total} passed.`);
  process.exit(passes === total ? 0 : 1);
} finally {
  child.kill();
}
