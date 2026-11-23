// Shared CDP client for the Solmar Bay test harnesses (screenshots, FPS,
// mission tests, touch smoke tests). Node 24 stdlib only.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME_BIN || 'google-chrome';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromeFlags(port, profile, width, height, mobile) {
  const flags = [
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
  ];
  if (mobile) {
    flags.push('--user-agent=Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0 Mobile Safari/537.36');
  }
  return flags;
}

// Each launch gets a fresh debugging port and profile, so a lingering
// Chrome from an earlier (killed) run can never be mistaken for this one.
export async function launchChrome(width, height, mobile) {
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = `/tmp/chrome-profile-${port}`;
  const child = spawn(CHROME, chromeFlags(port, profile, width, height, mobile), {stdio: 'ignore'});
  let up = false;
  for (let i = 0; i < 60 && !up; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      up = res.ok;
    } catch { /* not up yet */ }
    if (!up) await sleep(250);
  }
  if (!up) throw new Error('Chrome did not start');
  return {child, port};
}

export async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let nextId = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    const handler = msg.id ? pending.get(msg.id) : null;
    if (handler) {
      pending.delete(msg.id);
      handler(msg);
    } else if (msg.method) {
      events.push(msg);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(mid);
      reject(new Error(`CDP timeout: ${method}`));
    }, 30000);
    pending.set(mid, (msg) => { clearTimeout(timer); resolve(msg); });
    ws.send(JSON.stringify({id: mid, method, params}));
  });
  return {ws, send, events};
}

export async function newTab(send, url, width, height, mobile) {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 2, mobile: true});
    await send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
  } else {
    await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  }
  await send('Page.navigate', {url});
}

export async function evalJs(send, expression, awaitPromise = false) {
  const res = await send('Runtime.evaluate', {expression, awaitPromise, returnByValue: true});
  if (res.result?.exceptionDetails) return {error: res.result.exceptionDetails};
  return res.result?.result?.value;
}

export function consoleErrors(events) {
  const out = [];
  for (const e of events) {
    if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails;
      out.push(`EXCEPTION: ${d?.exception?.description || d?.text}`);
    } else if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
      out.push(`CONSOLE ERROR: ${e.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    } else if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
      out.push(`LOG ERROR: ${e.params.entry.text} ${e.params.entry.url || ''}`);
    }
  }
  return out;
}

export async function waitFor(send, expr, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evalJs(send, expr)) return true;
    await sleep(250);
  }
  return false;
}

function virtualKey(k) {
  return k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0;
}
export async function keyDown(send, code, k) {
  await send('Input.dispatchKeyEvent', {type: 'keyDown', code, key: k, windowsVirtualKeyCode: virtualKey(k)});
}
export async function keyUp(send, code, k) {
  await send('Input.dispatchKeyEvent', {type: 'keyUp', code, key: k, windowsVirtualKeyCode: virtualKey(k)});
}
export async function tapKey(send, code, k) {
  await keyDown(send, code, k);
  await sleep(60);
  await keyUp(send, code, k);
}

export async function screenshot(send, path, quality = 80) {
  const res = await send('Page.captureScreenshot', {format: 'jpeg', quality});
  writeFileSync(path, Buffer.from(res.result.data, 'base64'));
  return path;
}

export async function touchTap(send, x, y) {
  await send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
  await send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
}

// Drag one finger from (x0, y0) to (x1, y1) and lift it. The caller
// decides how long to hold the drag by sleeping between the calls.
export async function touchDrag(send, x0, y0, x1, y1, id = 1) {
  await send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: x0, y: y0, id}]});
  await send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x1, y: y1, id}]});
  await send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
}
