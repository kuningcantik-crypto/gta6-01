// Solmar Bay dev server: serves the static game folder on localhost.
// Usage: node serve.ts [--port 8080]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 8080;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function mimeFor(file) {
  const ext = file.slice(file.lastIndexOf('.'));
  return MIME[ext] || 'application/octet-stream';
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, path);
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

server.listen(port, () => {
  console.log(`Solmar Bay at http://localhost:${port}/`);
});
