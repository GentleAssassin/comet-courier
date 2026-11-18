// Comet Courier — best-game-01 entry point.
//
// This file is the program the grader runs. It does three things, in
// order, using only the Node standard library:
//   1. copies the playable game in game/ beside this file into the
//      output directory,
//   2. copies the four real screenshots in screenshots/ beside it,
//   3. writes dossier.json into that same output directory, using
//      buildDossier from the kit's vendored library in
//      vendor/makefun-game.ts (copied unchanged from the kit).
//
// The game itself is plain static files: game/index.html plus
// game/main.js, with no network requests and no build step. A desktop
// browser opens game/index.html and plays it offline.
//
// How to run it outside the grader:
//   mkdir -p /tmp/comet-out && MAKEFUN_OUTPUT_DIR=/tmp/comet-out node main.ts
// Inside the grader, MAKEFUN_OUTPUT_DIR is unset and the output
// directory is /output. Either way the two runs must write the same
// bytes, so there is no timestamp, random value, or absolute path in
// anything written here.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Directory holding this file — game/ and screenshots/ live beside it.
const here = fileURLToPath(new URL('.', import.meta.url));

// Grader output, or the local stand-in named by the environment.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Caps from the competition's gate (see kit RULES.txt): the text cap
// is the only one that shapes the dossier's bytes; the rest refuse
// an entry the scorer would refuse anyway.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

const gameSrc = join(here, 'game');
if (!existsSync(gameSrc)) {
  console.error('Comet Courier: game/ not found next to main.ts');
  process.exit(1);
}

const shotsSrc = join(here, 'screenshots');
if (!existsSync(shotsSrc)) {
  console.error('Comet Courier: screenshots/ not found next to main.ts');
  process.exit(1);
}

// Fresh output directory, then the two plain copies.
mkdirSync(outDir, { recursive: true });
cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });

// The dossier is built from the copied files, so what the judge
// reads is exactly what was handed in.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_CAPS));

console.log(`Comet Courier: wrote game/, screenshots/ and dossier.json to ${outDir}`);
