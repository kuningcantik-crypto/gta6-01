// Headless smoke test for the living-city systems: hidden stashes,
// weather, trams, and the settings panel. Drives the real game through
// window.__solmar and real key events — nothing is stubbed.
//
//   node tools/collectibles-test.mjs   (needs the dev server on :8080)
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

const browser = await launchChrome({width: 1280, height: 800});
try {
  const tab = await openTab(browser, URL);
  try {
    await tab.waitFor('window.__solmar');
    await tab.evalJs(`document.getElementById('btn-new').click()`);
    await sleep(1000);

    // 1. Hidden stashes: twelve hidden, one pays $250 the moment Rico
    // walks over it.
    const stash0 = await tab.evalJs('__solmar.state.stashes.list[0]');
    const cashBefore = await tab.evalJs('__solmar.state.player.cash');
    await tab.evalJs(`__solmar.teleport(${stash0.x}, ${stash0.z})`);
    await tab.evalJs('__solmar.step(30)');
    const afterStash = await tab.evalJs('({found: __solmar.state.stashes.found, cash: __solmar.state.player.cash})');
    check('stash pickup pays $250', afterStash.found === 1 && afterStash.cash === cashBefore + 250,
      `found=${afterStash.found} cash=${afterStash.cash} (was ${cashBefore})`);
    // The HUD repaints on the real frame loop, not on __solmar.step —
    // give it a moment (SwiftShader runs at a few FPS) before reading.
    await sleep(2000);
    const stashLine = await tab.evalJs(`document.getElementById('stash-line').textContent`);
    check('stash HUD line', stashLine.includes('STASHES 1 / 12'), stashLine);

    // 2. Weather follows the clock: 17:00 is cloudy and dry, 19:00 is
    // raining within ten game-seconds of the hour changing.
    await tab.evalJs('__solmar.state.clockMinutes = 17 * 60; __solmar.step(60)');
    const w17 = await tab.evalJs('({kind: __solmar.state.weather.kind, rain: __solmar.state.weather.rain})');
    check('weather 17:00 cloudy and dry', w17.kind === 'cloudy' && w17.rain < 0.05, JSON.stringify(w17));
    await tab.evalJs('__solmar.state.clockMinutes = 19 * 60; __solmar.step(600)');
    const w19 = await tab.evalJs('({kind: __solmar.state.weather.kind, rain: __solmar.state.weather.rain})');
    check('weather 19:00 raining', (w19.kind === 'rain' || w19.kind === 'storm') && w19.rain > 0.3, JSON.stringify(w19));

    // 3. Trams keep their schedule: five game-seconds is 35 m of track.
    const along0 = await tab.evalJs('__solmar.state.tram.cars[0].along');
    await tab.evalJs('__solmar.step(300)');
    const along1 = await tab.evalJs('__solmar.state.tram.cars[0].along');
    const moved = (((along1 - along0) % 832) + 832) % 832;
    check('trams advance >20 m in 300 steps', moved > 20, `${along0.toFixed(1)} -> ${along1.toFixed(1)} (${moved.toFixed(1)} m)`);

    // 4. Settings: O opens the panel, toggling FPS persists to
    // localStorage, and the FPS line actually appears.
    await tab.tapKey('KeyO', 'o');
    await sleep(500);
    await tab.evalJs(`document.querySelector('[data-setting="showFps"]').click()`);
    await sleep(500);
    const saved = await tab.evalJs(`JSON.parse(localStorage.getItem('solmar-settings-v1') || '{}').showFps`);
    const fpsDisplay = await tab.evalJs(`getComputedStyle(document.getElementById('fps-line')).display`);
    check('settings showFps persists + line shows', saved === true && fpsDisplay === 'block',
      `saved=${saved} display=${fpsDisplay}`);

    // 5. A still frame of the living city, for the eye.
    await tab.screenshot('/tmp/citylife.jpg');
    console.log('saved /tmp/citylife.jpg');
  } finally {
    await tab.close();
  }
} finally {
  browser.close();
}

console.log(failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILURES: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
