// CDP harness for Solmar Bay: screenshots, FPS measurement, console-error
// capture, keyboard/touch input injection. Node 24 stdlib only.
// Usage:
//   node tools/cdp.mjs fps [url] [seconds] [keys]   -- measure FPS while holding keys
//   node tools/cdp.mjs shot <url> <out.jpg> [w] [h] [mobile] -- wait for __shotReady, screenshot
//   node tools/cdp.mjs eval <url> <js-expr>         -- print Runtime.evaluate result
import { launchChrome, connect, newTab, evalJs, consoleErrors, waitFor, keyDown, keyUp, screenshot, sleep } from './cdp-lib.mjs';

async function measureFps(send, seconds) {
  const expr = `new Promise((resolve) => {
    let frames = 0; const t0 = performance.now();
    const times = [];
    let last = t0;
    function tick(now) {
      frames += 1; times.push(now - last); last = now;
      if (now - t0 < ${seconds * 1000}) requestAnimationFrame(tick);
      else {
        times.sort((a, b) => a - b);
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        resolve({ fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1),
          avgMs: +avg.toFixed(2), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2),
          frames, calls: (window.__rendererInfo ? window.__rendererInfo() : null) });
      }
    }
    requestAnimationFrame(tick);
  })`;
  return evalJs(send, expr, true);
}

const cmd = process.argv[2];

if (cmd === 'fps') {
  const url = process.argv[3] || 'http://127.0.0.1:8080/';
  const seconds = Number(process.argv[4] || 6);
  const keys = (process.argv[5] || '').split(',').filter(Boolean);
  const fw = Number(process.env.FPS_W || 1280);
  const fh = Number(process.env.FPS_H || 800);
  const { child, port } = await launchChrome(fw, fh, false);
  try {
    const { send, events } = await connect(port);
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
    console.log(JSON.stringify({ url, seconds, keys, ...result, consoleErrors: consoleErrors(events) }, null, 2));
  } finally { child.kill(); }
} else if (cmd === 'shot') {
  const url = process.argv[3];
  const out = process.argv[4];
  const width = Number(process.argv[5] || 1280);
  const height = Number(process.argv[6] || 800);
  const mobile = process.argv[7] === 'mobile';
  const { child, port } = await launchChrome(width, height, mobile);
  try {
    const { send, events } = await connect(port);
    await newTab(send, url, width, height, mobile);
    const ready = await waitFor(send, 'window.__shotReady === true');
    if (!ready) console.log('WARN: __shotReady never set; screenshotting anyway');
    await sleep(400);
    await screenshot(send, out);
    console.log(JSON.stringify({ out, ready, consoleErrors: consoleErrors(events) }, null, 2));
  } finally { child.kill(); }
} else if (cmd === 'eval') {
  const url = process.argv[3];
  const expr = process.argv[4];
  const { child, port } = await launchChrome(1280, 800, false);
  try {
    const { send, events } = await connect(port);
    await newTab(send, url, 1280, 800, false);
    // The game module can take a while to boot under SwiftShader; wait for
    // the diagnostics handle instead of assuming a fixed sleep is enough.
    const booted = await waitFor(send, '!!window.__solmar', 60000);
    if (!booted) console.log('WARN: __solmar never appeared; evaluating anyway');
    const v = await evalJs(send, expr, true);
    console.log(JSON.stringify(v, null, 2));
    const errs = consoleErrors(events);
    if (errs.length) console.log('ERRORS:', JSON.stringify(errs, null, 2));
  } finally { child.kill(); }
} else {
  console.log('usage: cdp.mjs fps|shot|eval ...');
  process.exit(1);
}
