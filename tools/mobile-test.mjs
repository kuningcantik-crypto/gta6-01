// Mobile smoke test: 390x844 phone viewport, touch the New Game button,
// walk with the joystick, drive with GAS, cycle weapons, open the jobs
// list. Everything through real CDP touch events — the same input path
// a phone uses.
//
//   node tools/mobile-test.mjs   (needs the dev server on :8080)
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

const browser = await launchChrome({width: 390, height: 844});
try {
  const tab = await openTab(browser, URL, {width: 390, height: 844, mobile: true});
  try {
    await tab.waitFor('window.__solmar');

    // The touch UI only appears once the page has seen a real touch.
    await tab.touchTap(195, 400);
    await sleep(300);
    const touchOn = await tab.evalJs(`document.body.classList.contains('touch')`);
    check('touch class appears', touchOn === true);
    const uiVisible = await tab.evalJs(`getComputedStyle(document.getElementById('touch-ui')).display`);
    check('touch UI visible', uiVisible !== 'none', uiVisible);

    // New Game by touch: tap the button's centre.
    const btn = await tab.evalJs(`(() => {
      const r = document.getElementById('btn-new').getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    await tab.touchTap(btn.x, btn.y);
    await sleep(1000);
    const titleGone = await tab.evalJs(`document.getElementById('screen-title').style.display === 'none'`);
    check('New Game by touch', titleGone === true);

    // Joystick: drag up from the pad centre and hold — Rico walks.
    const pad = await tab.evalJs(`(() => {
      const r = document.getElementById('joystick').getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    const start = await tab.evalJs('({x: __solmar.state.player.x, z: __solmar.state.player.z})');
    await tab.touchDrag(pad.x, pad.y, pad.x, pad.y - 40, 8);
    await sleep(1500);
    // Release the stick: the drag's touchEnd should already have done
    // this, but a synthetic pointerup makes sure the held actions are
    // really cleared before the next check reads them.
    await tab.evalJs(`(() => {
      const el = document.getElementById('joystick');
      el.dispatchEvent(new PointerEvent('pointerup', {pointerId: 1, bubbles: true}));
    })()`);
    const moved = await tab.evalJs('({x: __solmar.state.player.x, z: __solmar.state.player.z})');
    const walked = Math.hypot(moved.x - start.x, moved.z - start.z);
    check('joystick walks >1 m', walked > 1, `${walked.toFixed(2)} m`);

    // GAS: hold the button, the car must pick up speed.
    await tab.evalJs(`(() => {
      const p = __solmar.state.player;
      const car = __solmar.state.cars.find((c) => Math.hypot(c.x - p.x, c.z - p.z) < 8) || __solmar.state.cars[0];
      __solmar.putInCar(car.x, car.z, car.angle);
    })()`);
    const gas = await tab.evalJs(`(() => {
      const r = document.getElementById('btn-gas').getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    await tab.evalJs(`(() => {
      const b = document.getElementById('btn-gas');
      b.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 2, bubbles: true}));
    })()`);
    await sleep(2000);
    const speed = await tab.evalJs('Math.abs(__solmar.state.player.car ? __solmar.state.player.car.speed : 0)');
    await tab.evalJs(`(() => {
      const b = document.getElementById('btn-gas');
      b.dispatchEvent(new PointerEvent('pointerup', {pointerId: 2, bubbles: true}));
    })()`);
    check('GAS accelerates >3 m/s', speed > 3, `${speed.toFixed(1)} m/s`);

    // WPN cycles the weapon; JOBS opens the mission list.
    const w0 = await tab.evalJs('__solmar.state.player.weaponIndex');
    const wpn = await tab.evalJs(`(() => {
      const r = document.getElementById('btn-wpn').getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    await tab.touchTap(wpn.x, wpn.y);
    await sleep(300);
    const w1 = await tab.evalJs('__solmar.state.player.weaponIndex');
    check('WPN cycles weapon', w1 !== w0, `${w0} -> ${w1}`);

    const msn = await tab.evalJs(`(() => {
      const r = document.getElementById('btn-msn').getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    await tab.touchTap(msn.x, msn.y);
    // The jobs list opens on the tap's click, and the frame loop runs
    // at a few FPS under SwiftShader — poll instead of assuming a
    // fixed delay.
    await tab.waitFor('__solmar.state.missionsOpen', 5000);
    const jobsOpen = await tab.evalJs('__solmar.state.missionsOpen');
    check('JOBS opens missions', jobsOpen === true);
    const closed = await tab.evalJs(`(() => {
      document.getElementById('btn-missions-close').click();
      return __solmar.state.missionsOpen;
    })()`);
    check('Close button closes missions', closed === false);

    const errors = tab.consoleErrors();
    check('0 console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await tab.screenshot('/tmp/mobile.jpg');
    console.log('saved /tmp/mobile.jpg');
  } finally {
    await tab.close();
  }
} finally {
  browser.close();
}

console.log(failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILURES: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
