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

async function collectShots(shotDir) {
  const names = (await readdir(shotDir)).filter((n) => /\.jpe?g$/i.test(n)).sort();
  const shots = names.map((name) => join(shotDir, name));
  if (shots.length !== 4 || !shots.every((f) => existsSync(f))) {
    throw new Error(`Need exactly 4 screenshots in ${shotDir}, found ${shots.length}`);
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
  const caps = {
    text_max_bytes: 163840,
    screenshots: {max: 4, max_bytes: 262144},
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  };
  const dossier = buildDossier(outDir, caps);
  await writeFile(join(outDir, 'dossier.json'), dossier);
  console.log(`Wrote dossier to ${join(outDir, 'dossier.json')} (${dossier.length} bytes, ${shots.map((f) => basename(f)).join(', ')})`);
}

await build();
