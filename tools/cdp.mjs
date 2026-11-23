// CDP harness for Solmar Bay: screenshots, FPS measurement, console-error
// capture, keyboard/touch input injection. Node 24 stdlib only.
// Usage:
//   node tools/cdp.mjs fps [url] [seconds] [keys]   -- measure FPS while holding keys
//   node tools/cdp.mjs shot <url> <out.jpg> [w] [h] [mobile] -- wait for __shotReady, screenshot
//   node tools/cdp.mjs eval <url> <js-expr>         -- print Runtime.evaluate result
import { launchChrome, connect, newTab, evalJs, consoleErrors, waitFor, keyDown, keyUp, screenshot, sleep } from './cdp-lib.mjs';

const argAt = (i, fallback = undefined) => process.argv[i] ?? fallback;

async function measureFps(send, seconds) {
  const expr = `new Promise((resolve) => {
    const deltas = [];
    let frames = 0;
    let last = performance.now();
    const t0 = last;
    const tick = (now) => {
      frames += 1;
      deltas.push(now - last);
      last = now;
      if (now - t0 < ${seconds * 1000}) {
        requestAnimationFrame(tick);
      } else {
        deltas.sort((a, b) => a - b);
        const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        resolve({
          fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1),
          avgMs: +mean.toFixed(2),
          p95Ms: +deltas[Math.floor(deltas.length * 0.95)].toFixed(2),
          frames,
          calls: (window.__rendererInfo ? window.__rendererInfo() : null),
        });
      }
    };
    requestAnimationFrame(tick);
  })`;
  return evalJs(send, expr, true);
}

async function runWithBrowser(width, height, mobile, body) {
  const {child, port} = await launchChrome(width, height, mobile);
  try {
    const {send, events} = await connect(port);
    return await body(send, events);
  } finally {
    child.kill();
  }
}

async function doFps() {
  const url = argAt(3, 'http://127.0.0.1:8080/');
  const seconds = Number(argAt(4, 6));
  const keys = (argAt(5, '')).split(',').filter(Boolean);
  const fw = Number(process.env.FPS_W || 1280);
  const fh = Number(process.env.FPS_H || 800);
  await runWithBrowser(fw, fh, false, async (send, events) => {
    await newTab(send, url, fw, fh, false);
    await sleep(2500);
    if (!process.env.FPS_TITLE) {
      await evalJs(send, `document.getElementById('btn-new')?.click(); 'ok'`);
      // Warm up: the first play-view frames compile shaders under
      // SwiftShader and can take seconds each. Wait until 3 real frames
      // have completed, so the measurement window is steady-state, not
      // compile stall.
      await evalJs(send, `new Promise((r) => { let n = 0; const tick = () => { if (++n >= 3) r('warmed'); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })`, true);
    }
    for (const k of keys) await keyDown(send, `Key${k}`, k.toLowerCase());
    const result = await measureFps(send, seconds);
    for (const k of keys) await keyUp(send, `Key${k}`, k.toLowerCase());
    console.log(JSON.stringify({url, seconds, keys, ...result, consoleErrors: consoleErrors(events)}, null, 2));
  });
}

async function doShot() {
  const url = argAt(3);
  const out = argAt(4);
  if (!url || !out) {
    console.log('usage: cdp.mjs shot <url> <out.jpg> [w] [h] [mobile]');
    process.exit(1);
  }
  const width = Number(argAt(5, 1280));
  const height = Number(argAt(6, 800));
  const mobile = argAt(7) === 'mobile';
  await runWithBrowser(width, height, mobile, async (send, events) => {
    await newTab(send, url, width, height, mobile);
    const ready = await waitFor(send, 'window.__shotReady === true');
    if (!ready) console.log('WARN: __shotReady never set; screenshotting anyway');
    await sleep(400);
    await screenshot(send, out);
    console.log(JSON.stringify({out, ready, consoleErrors: consoleErrors(events)}, null, 2));
  });
}

async function doEval() {
  const url = argAt(3);
  const expr = argAt(4);
  await runWithBrowser(1280, 800, false, async (send, events) => {
    await newTab(send, url, 1280, 800, false);
    // The game module can take a while to boot under SwiftShader; wait for
    // the diagnostics handle instead of assuming a fixed sleep is enough.
    const booted = await waitFor(send, '!!window.__solmar', 60000);
    if (!booted) console.log('WARN: __solmar never appeared; evaluating anyway');
    const v = await evalJs(send, expr, true);
    console.log(JSON.stringify(v, null, 2));
    const errs = consoleErrors(events);
    if (errs.length) console.log('ERRORS:', JSON.stringify(errs, null, 2));
  });
}

const COMMANDS = {fps: doFps, shot: doShot, eval: doEval};
const cmd = process.argv[2];
const run = COMMANDS[cmd];
if (!run) {
  console.log('usage: cdp.mjs fps|shot|eval ...');
  process.exit(1);
}
await run();
