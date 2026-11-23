// Shared CDP client for the Solmar Bay test harnesses (screenshots, FPS,
// mission tests, touch smoke tests). Node 24 stdlib only.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME_BIN || 'google-chrome';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each launch gets a fresh debugging port and profile, so a lingering
// Chrome from an earlier (killed) run can never be mistaken for this one.
export async function launchChrome(width, height, mobile) {
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = `/tmp/chrome-profile-${port}`;
  const args = [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-sandbox',
    '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--disable-extensions', '--mute-audio',
    `--window-size=${width},${height}`, '--hide-scrollbars',
  ];
  if (mobile) args.push('--user-agent=Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0 Mobile Safari/537.36');
  const child = spawn(CHROME, args, { stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { child, port };
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome did not start');
}

export async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    const timer = setTimeout(() => {
      pending.delete(mid);
      reject(new Error(`CDP timeout: ${method}`));
    }, 30000);
    pending.set(mid, (msg) => { clearTimeout(timer); resolve(msg); });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  return { ws, send, events };
}

export async function newTab(send, url, width, height, mobile) {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } else {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  }
  await send('Page.navigate', { url });
}

export async function evalJs(send, expression, awaitPromise = false) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (res.result?.exceptionDetails) return { error: res.result.exceptionDetails };
  return res.result?.result?.value;
}

export function consoleErrors(events) {
  const out = [];
  for (const e of events) {
    if (e.method === 'Runtime.exceptionThrown') {
      out.push(`EXCEPTION: ${e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text}`);
    }
    if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') {
      out.push(`CONSOLE ERROR: ${e.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
    if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
      out.push(`LOG ERROR: ${e.params.entry.text} ${e.params.entry.url || ''}`);
    }
  }
  return out;
}

export async function waitFor(send, expr, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await evalJs(send, expr);
    if (v) return true;
    await sleep(250);
  }
  return false;
}

export async function keyDown(send, code, k) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0 });
}
export async function keyUp(send, code, k) {
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0 });
}
export async function tapKey(send, code, k) {
  await keyDown(send, code, k); await sleep(60); await keyUp(send, code, k);
}

export async function screenshot(send, path, quality = 80) {
  const res = await send('Page.captureScreenshot', { format: 'jpeg', quality });
  writeFileSync(path, Buffer.from(res.result.data, 'base64'));
  return path;
}

export async function touchTap(send, x, y) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
