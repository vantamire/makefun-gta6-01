// VICE HARBOR v7 — the gta6-01 entry program (Node 22, standard library only).
//
// The game lives in this directory's game/ folder: a 3D open-world crime
// game (three.js vendored under game/vendor/, every other file its own
// source) that opens offline in a desktop browser at game/index.html.
// This program hands it in: it copies game/ and screenshots/ from beside
// this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// v7 is a fresh implementation of the same game, built carefully from the
// ground up: four districts (a canal city centre, a north industrial
// yard, south houses and a west boardwalk with a pier and a marina),
// twelve data-driven missions, a full wanted system with police cruisers,
// roadblocks and a helicopter, ten vehicle kinds, pedestrians and dogs,
// combat with a pistol and a scattergun, a three-station procedural
// radio, day-night cycling, jump pads and stunt pay, near-miss bonuses,
// a walk-in garage, a localStorage save, and a GTA-style HUD — a big
// circular rotating minimap bottom-left, "$00000000" money top-right with
// wanted stars and a clock, a hero portrait with health and armor bars
// top-left, and fireball explosions on hard crashes.
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the rest refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files in all; a path under game/ over 1000 bytes; game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
const GATE = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function main() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, GATE));
}

main();
