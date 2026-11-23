// Solmar Bay dev server: serves the static game folder on localhost.
// Usage: node serve.ts [--port 8080]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// [extension, Content-Type] — everything the game folder can serve.
const MIME_ROWS = [
  ['.html', 'text/html'],
  ['.js', 'text/javascript'],
  ['.mjs', 'text/javascript'],
  ['.css', 'text/css'],
  ['.json', 'application/json'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
];
const MIME = Object.fromEntries(MIME_ROWS);

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function portFromArgs() {
  const at = process.argv.indexOf('--port');
  const value = at >= 0 ? Number(process.argv[at + 1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : 8080;
}

function mimeFor(file) {
  const dot = file.lastIndexOf('.');
  const ext = dot >= 0 ? file.slice(dot) : '';
  return MIME[ext] || 'application/octet-stream';
}

function safeJoin(pathname) {
  const decoded = decodeURIComponent(pathname);
  const rel = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  // join() normalises '..' away, and the startsWith(root) check below
  // turns any escape attempt into a 403 instead of a file leak.
  return join(root, rel);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const file = safeJoin(url.pathname);
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const data = await readFile(file);
    // Dev server: never cache, so edits show up on the next reload.
    res.writeHead(200, {'Content-Type': mimeFor(file), 'Cache-Control': 'no-cache'});
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

const port = portFromArgs();
server.listen(port, () => {
  console.log(`Solmar Bay at http://localhost:${port}/`);
});
