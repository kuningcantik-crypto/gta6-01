// Shared CDP client for the Solmar Bay test harnesses (screenshots, FPS,
// mission, mobile and desktop play tests). One Chrome, one tab, one
// WebSocket: the harness launches headless Chrome with SwiftShader,
// opens a tab, and drives it through the DevTools protocol — no extra
// dependencies, just Node's built-in WebSocket and fetch.
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const CHROME_BIN = process.env.CHROME || 'google-chrome';
const CDP_TIMEOUT_MS = 30000;
const PIXEL7_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chromeFlags(port, profile, width, height) {
  return [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--disable-extensions',
    '--mute-audio',
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--disable-dev-shm-usage',
  ];
}

export async function launchChrome({width = 1280, height = 800} = {}) {
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = `/tmp/chrome-profile-${port}`;
  const proc = spawn(CHROME_BIN, chromeFlags(port, profile, width, height), {stdio: 'ignore'});
  const base = `http://127.0.0.1:${port}`;
  // Wait for the DevTools endpoint: up to 60 tries, 250 ms apart.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${base}/json/version`);
      if (res.ok) break;
    } catch {
      // Not up yet.
    }
    if (attempt === 59) {
      proc.kill('SIGKILL');
      throw new Error('Chrome did not come up on the DevTools port');
    }
    await sleep(250);
  }
  return {
    port,
    proc,
    base,
    close() {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    },
  };
}

// Open one tab on a URL and wire it up: Page, Runtime and Log domains,
// device metrics, and (for phones) touch emulation. The returned tab
// carries eval, keys, touch, screenshots and a console-error trap.
export async function openTab(browser, url, {width = 1280, height = 800, mobile = false} = {}) {
  const res = await fetch(`${browser.base}/json/new?${encodeURIComponent(url)}`, {method: 'PUT'});
  if (!res.ok) throw new Error(`Could not open a tab for ${url}: ${res.status}`);
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('CDP WebSocket failed to open'));
  });

  let nextId = 1;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const {resolve, reject, timer} = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const detail = msg.params.exceptionDetails;
      errors.push(`exception: ${detail.text} ${detail.exception?.description || ''}`.trim());
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push(`log: ${msg.params.entry.text} ${msg.params.entry.url || ''}`.trim());
    }
  };

  async function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timed out after ${CDP_TIMEOUT_MS / 1000} s: ${method}`));
      }, CDP_TIMEOUT_MS);
      pending.set(id, {resolve, reject, timer});
      ws.send(JSON.stringify({id, method, params}));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: mobile ? 2 : 1, mobile,
  });
  if (mobile) {
    await send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
    await send('Emulation.setUserAgentOverride', {userAgent: PIXEL7_UA});
  }

  const tab = {
    consoleErrors() {
      return [...errors];
    },
    async evalJs(expression) {
      const out = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
      if (out.exceptionDetails) {
        throw new Error(`eval failed: ${JSON.stringify(out.exceptionDetails)}`);
      }
      return out.result ? out.result.value : undefined;
    },
    async waitFor(expression, timeoutMs = 60000) {
      // 60 s default: the game compiles shaders under SwiftShader on
      // first load, and a cold VM can take a while to get there.
      // NOTE: the expression is wrapped in !!() so the result is always
      // a boolean. Evaluating the raw value would make CDP serialise
      // the whole __solmar state (which holds THREE meshes with
      // circular references) and the call would never resolve.
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          if (await tab.evalJs(`!!(${expression})`)) return true;
        } catch {
          // Expression not ready yet — keep polling.
        }
        await sleep(250);
      }
      throw new Error(`waitFor timed out after ${timeoutMs} ms: ${expression}`);
    },
    async keyDown(code, key) {
      await send('Input.dispatchKeyEvent', {type: 'rawKeyDown', code, key: key ?? code});
    },
    async keyUp(code, key) {
      await send('Input.dispatchKeyEvent', {type: 'keyUp', code, key: key ?? code});
    },
    async tapKey(code, key, holdMs = 60) {
      await tab.keyDown(code, key);
      await sleep(holdMs);
      await tab.keyUp(code, key);
    },
    async screenshot(path) {
      const shot = await send('Page.captureScreenshot', {format: 'jpeg', quality: 80});
      await writeFile(path, Buffer.from(shot.data, 'base64'));
    },
    async touchTap(x, y) {
      await send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
      await send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    },
    async touchDrag(x0, y0, x1, y1, steps = 10) {
      await send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: x0, y: y0, id: 1}]});
      for (let i = 1; i <= steps; i += 1) {
        const x = x0 + ((x1 - x0) * i) / steps;
        const y = y0 + ((y1 - y0) * i) / steps;
        await send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y, id: 1}]});
        await sleep(16);
      }
      await send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    },
    async close() {
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    },
  };

  await send('Page.navigate', {url});
  return tab;
}
