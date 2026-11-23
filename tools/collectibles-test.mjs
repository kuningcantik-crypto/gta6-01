// Headless smoke test for the living-city systems: hidden stashes,
// weather, the tram loop and the settings panel. Runs against the dev
// server on port 8080 with the seeded world, seed 7.
//
//   node tools/collectibles-test.mjs
import { launchChrome, connect, newTab, evalJs, consoleErrors, sleep, waitFor, tapKey, screenshot } from './cdp-lib.mjs';

const BASE = 'http://127.0.0.1:8080/?seed=7';
const results = [];

function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

function stashProbe() {
  return `(() => { const s = window.__solmar; return {found: s.state.stashes.found, total: s.state.stashes.total, first: s.state.stashes.list[0], cash: s.state.player.cash}; })()`;
}

async function main() {
  const {child, port} = await launchChrome(1280, 800);
  const {send, events} = await connect(port);
  await newTab(send, BASE, 1280, 800);
  await waitFor(send, '!!window.__solmar', 60000);
  await evalJs(send, `window.__solmar.start(true)`);
  await sleep(500);

  // 1. Stashes exist, twelve of them, none found yet.
  const before = await evalJs(send, stashProbe());
  check('stash field has 12 hidden stashes', before.total === 12 && before.found === 0, `total=${before.total} found=${before.found}`);

  // 2. Walking onto the first stash collects it and pays $250.
  const first = before.first;
  await evalJs(send, `window.__solmar.teleport(${first.x}, ${first.z})`);
  await evalJs(send, `window.__solmar.step(30, {})`);
  const after = await evalJs(send, stashProbe());
  check('walking onto a stash collects it (+$250)', after.found === 1 && after.cash === before.cash + 250, `found=${after.found} cash=${after.cash}`);

  // 3. Weather at 17:00 is cloudy and dry; at 19:00 it rains.
  const wx17 = await evalJs(send, `(() => { const w = window.__solmar.state.weather; return {kind: w.kind, rain: w.rain}; })()`);
  check('weather is cloudy and dry at 17:00', wx17.kind === 'cloudy' && wx17.rain === 0, JSON.stringify(wx17));
  await evalJs(send, `window.__solmar.state.clockMinutes = 19 * 60`);
  await evalJs(send, `window.__solmar.step(600, {})`);
  const wx19 = await evalJs(send, `(() => { const w = window.__solmar.state.weather; return {kind: w.kind, rain: +w.rain.toFixed(2)}; })()`);
  check('weather turns to rain at 19:00', wx19.kind === 'rain' && wx19.rain > 0.3, JSON.stringify(wx19));

  // 4. The trams move along the loop.
  const tramA = await evalJs(send, `(() => { const t = window.__solmar.state.tram; return t.cars.map((c) => +c.along.toFixed(1)); })()`);
  await evalJs(send, `window.__solmar.step(300, {})`);
  const tramB = await evalJs(send, `(() => { const t = window.__solmar.state.tram; return t.cars.map((c) => +c.along.toFixed(1)); })()`);
  const moved = tramA.every((a, i) => Math.abs(tramB[i] - a) > 20);
  check('both trams advance along the loop', moved, `before=${tramA} after=${tramB}`);

  // 5. Settings: O opens the panel, a row button flips a setting and it persists.
  await tapKey(send, 'KeyO', 'o');
  await sleep(400);
  const open = await evalJs(send, `document.getElementById('screen-settings').style.display`);
  check('O opens the settings screen', open === 'flex', `display=${open}`);
  const savedBefore = await evalJs(send, `localStorage.getItem('solmar-settings-v1')`);
  await evalJs(send, `document.querySelector('[data-setting="showFps"]').click()`);
  await sleep(200);
  const savedAfter = await evalJs(send, `localStorage.getItem('solmar-settings-v1')`);
  const parsed = savedAfter ? JSON.parse(savedAfter) : {};
  check('flipping FPS persists to localStorage', parsed.showFps === true, `before=${savedBefore} after=${savedAfter}`);
  const fpsShown = await evalJs(send, `document.getElementById('fps-line').style.display`);
  check('FPS line appears once enabled', fpsShown === 'block', `display=${fpsShown}`);

  // 6. The city-life HUD lines are on screen.
  const cityLines = await evalJs(send, `(() => { const el = document.getElementById('stash-line'); return el ? el.textContent : ''; })()`);
  check('stash HUD line shows the hunt', cityLines.includes('STASHES 1 / 12'), cityLines);

  const errs = consoleErrors(events);
  check('0 console errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await screenshot(send, '/tmp/citylife.jpg');
  const fails = results.filter((r) => !r).length;
  console.log(`\nCity-life test: ${results.length - fails}/${results.length} passed.`);
  process.exit(fails ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
