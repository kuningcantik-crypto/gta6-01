// CDP harness for Solmar Bay: screenshots, FPS measurement, console-error
// checks and ad-hoc evaluation against the running game.
//
//   node tools/cdp.mjs fps [url] [seconds]   — rAF frame stats + __rendererInfo
//   node tools/cdp.mjs shot <name> [url]     — wait for __shotReady, save screenshots/<name>.jpg
//   node tools/cdp.mjs eval "<expr>" [url]   — print the evaluated value
import { mkdir } from 'node:fs/promises';
import { launchChrome, openTab } from './cdp-lib.mjs';

const BASE = process.env.GAME_URL || 'http://localhost:8080';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTab(url, opts, fn) {
  const browser = await launchChrome(opts);
  try {
    const tab = await openTab(browser, url, opts);
    try {
      return await fn(tab);
    } finally {
      await tab.close();
    }
  } finally {
    browser.close();
  }
}

// Sample requestAnimationFrame deltas for a few seconds, then report the
// mean frame time, the p95, the FPS, and the renderer's draw calls.
async function measureFps(tab, seconds) {
  const frames = Math.max(30, Math.floor(seconds * 60));
  const stats = await tab.evalJs(`new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    let n = 0;
    function frame(t) {
      deltas.push(t - last);
      last = t;
      n += 1;
      if (n < ${frames}) requestAnimationFrame(frame);
      else {
        const sorted = [...deltas].sort((a, b) => a - b);
        const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        resolve({
          frames: n,
          meanMs: Number(mean.toFixed(2)),
          p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
          fps: Number((1000 / mean).toFixed(1)),
        });
      }
    }
    requestAnimationFrame(frame);
  })`);
  const info = await tab.evalJs('window.__rendererInfo ? window.__rendererInfo() : null');
  return {...stats, renderer: info};
}

async function doFps(url, seconds) {
  const result = await withTab(url, {}, async (tab) => {
    await tab.waitFor('window.__solmar');
    await tab.evalJs('__solmar.start(true)');
    // Warm up a few frames before measuring, so the first-frame jank
    // (shader compile, texture upload) does not poison the numbers.
    await tab.evalJs(`new Promise((r) => { let n = 0; (function f() { if (++n >= 3) r(); else requestAnimationFrame(f); })(); })`);
    return measureFps(tab, seconds);
  });
  console.log(JSON.stringify(result, null, 2));
}

async function doShot(name, url) {
  const out = `screenshots/${name}.jpg`;
  await mkdir('screenshots', {recursive: true});
  await withTab(url, {}, async (tab) => {
    await tab.waitFor('window.__shotReady', 60000);
    await tab.screenshot(out);
  });
  console.log(`saved ${out}`);
}

async function doEval(expression, url) {
  const result = await withTab(url, {}, async (tab) => {
    await tab.waitFor('window.__solmar');
    return tab.evalJs(expression);
  });
  console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
}

const [cmd, arg, arg2] = process.argv.slice(2);
if (cmd === 'fps') {
  await doFps(arg || `${BASE}/?seed=7`, Number(arg2 || 3));
} else if (cmd === 'shot') {
  if (!arg) throw new Error('usage: node tools/cdp.mjs shot <name> [url]');
  await doShot(arg, arg2 || `${BASE}/?shot=${arg}&seed=7`);
} else if (cmd === 'eval') {
  if (!arg) throw new Error('usage: node tools/cdp.mjs eval "<expr>" [url]');
  await doEval(arg, arg2 || `${BASE}/?seed=7`);
} else {
  console.log('usage:');
  console.log('  node tools/cdp.mjs fps [url] [seconds]   — frame-time stats + draw calls');
  console.log('  node tools/cdp.mjs shot <name> [url]     — wait for __shotReady, save screenshots/<name>.jpg');
  console.log('  node tools/cdp.mjs eval "<expr>" [url]   — print the evaluated value');
  process.exit(1);
}
