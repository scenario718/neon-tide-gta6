// Neon Tide — hand-in program for the make.fun gta6-01 bounty (Node 22,
// standard library only, no build step, no network).
//
// The game itself is the game/ folder beside this file: plain static files
// (game/index.html plus its ES modules under game/src/) that a desktop
// browser plays fully offline. This program's one job is to hand that game
// in: copy game/ and screenshots/ into the output directory and write the
// dossier the judge reads, using the vendored make.fun library.
//
// Run it the way the grader does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (MAKEFUN_OUTPUT_DIR stands in for /output outside the grader's container.)
// It runs twice and writes the same bytes both times: the copies are plain
// file copies and the dossier is a pure function of the files copied.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, mirrored so a hand-in this program writes is one the
// scorer accepts: at most 4 screenshots of at most 256 KiB each, at most
// 993 files and 48 MiB under game/, no game/ path over 1,000 bytes, and the
// dossier text capped at 160 KiB (text_max_bytes is the one that shapes
// bytes; the rest make buildDossier refuse what the scorer would refuse).
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(outDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outDir, 'game'), { recursive: true });

const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outDir, DOSSIER_LIMITS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

// A one-line receipt for whoever ran the hand-in (the grader ignores it):
// where the game went and how large the dossier came out.
console.log(`neon-tide: game + screenshots copied to ${outDir}, dossier.json ${dossier.length} bytes`);
