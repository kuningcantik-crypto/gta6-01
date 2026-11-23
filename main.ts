// Build the Solmar Bay dossier for make.fun. The game folder and the
// four screenshots are copied into the output directory first, then the
// kit's buildDossier reads them back and writes dossier.json. The dossier
// is derived from the game files themselves — title, description and
// controls come from the page and the source, not from this script.
import { buildDossier } from './vendor/makefun-game.ts';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR
  ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
  : resolve(here, 'out');

// The kit's limits for this entry: how much text, how many screenshots,
// how many game files, and how big they may be.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: {max: 4, max_bytes: 262144},
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function isJpeg(name) {
  return /\.jpe?g$/i.test(name);
}

// The four screenshots, in order, from the screenshots folder. Exactly
// four, all present — the dossier needs one frame per scene. The names
// sort alphabetically into scene order (1-start, 2-play, 3-chase, 4-end),
// which is the order the judges see them in.
async function collectShots(shotDir) {
  const names = (await readdir(shotDir)).filter(isJpeg).sort();
  const shots = names.map((name) => join(shotDir, name));
  if (shots.length !== 4) {
    throw new Error(`Need exactly 4 screenshots in ${shotDir}, found ${shots.length}`);
  }
  for (const shot of shots) {
    if (!existsSync(shot)) throw new Error(`Screenshot missing: ${shot}`);
  }
  return shots;
}

async function build() {
  const gameDir = join(here, 'game');
  const shotDir = join(here, 'screenshots');
  const entrypoint = join(gameDir, 'src', 'main.js');
  if (!existsSync(entrypoint)) throw new Error(`Game entrypoint missing: ${entrypoint}`);
  const shots = await collectShots(shotDir);
  await mkdir(outDir, {recursive: true});
  await cp(gameDir, join(outDir, 'game'), {recursive: true});
  await cp(shotDir, join(outDir, 'screenshots'), {recursive: true});
  const dossier = buildDossier(outDir, CAPS);
  await writeFile(join(outDir, 'dossier.json'), dossier);
  const shotNames = shots.map((f) => basename(f)).join(', ');
  console.log(`Wrote dossier to ${join(outDir, 'dossier.json')} (${dossier.length} bytes, ${shotNames})`);
}

await build();
