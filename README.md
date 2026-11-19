# VICE HARBOR

[![VICE HARBOR — Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on
[make.fun](https://make.fun): a complete 3D open-world crime game that runs
offline in a desktop browser from its own static files.

VICE HARBOR is a sun-soaked harbor city at dusk. Rex Dalton is back after
three years away, and Mama Lou has work for him. Explore the city on foot
or by car, steal any parked car (or carjack a moving one), run ten missions
from a cab fare to the Golden Anchor casino, and outrun the Harbor PD —
cruisers, foot cops, roadblocks, and, at 4 stars, the police helicopter
with its searchlight — while traffic cruises the grid and pedestrians
stroll the sidewalks and the boardwalk.

## The city

Four districts on one grid: downtown towers in the middle, the north
industrial yards, the south houses, and the east boardwalk with its
wooden deck, food stalls, palms, marina, pier, lighthouse, and a
turning ferris wheel. Graffiti tags cover the shopfront walls, billboards
read VICE HARBOR, TAXI and GOLDEN ANCHOR, and the sun sets over the water
while the streetlights come on. A full day runs 8 minutes, starting at
dusk 18:30, and the sky, the fog and the lights follow the clock.

## What you can do

- **Drive anything:** sedans, taxis, sport coupes, vans, pickups, buses,
  limos, a motorcycle and the armored truck — each with its own
  acceleration, top speed and grip. Arcade handling with drift, skid
  marks, near-miss bonuses (+$10) and damage that ends in a fireball.
- **On foot:** walk, run, jump, punch (F), and three weapons — pistol,
  scattergun and SMG (Q to draw, X to swap, R to reload, click to fire).
- **Wanted, 0–5 stars:** stealing a car with a driver, punching or
  shooting a pedestrian, and ramming the police all raise the heat.
  The PD answers with cruisers that ram, foot cops that run you down,
  roadblocks across the avenues at 3 stars, and the helicopter at 4.
  Get caught and it's BUSTED; hit zero health and it's WASTED.
- **Ten missions, one story:** Homecoming, Cab Fare, Package Run,
  Getaway, Pizza Rush, Street Race against a rival AI car, Harbor
  Heist, Vigilante, Night Cab after dark, and the Casino Caper ($700,
  lift the cash cart and reach the safehouse at 3 stars). Timed runs,
  checkpoints, chases and escapes, with a beacon, a minimap blip and
  an objective line for every step.
- **The HUD:** a portrait with health and armor bars top-left, money,
  wanted stars and the clock top-right, and a big circular rotating
  minimap showing the roads, the water, the mission target, the cops
  and the helicopter. Press V for a clean photo mode.
- **Sound and save:** a procedural WebAudio engine hum, sirens, gunfire,
  explosions, pickup chimes and a synthwave radio (M). Progress —
  money, finished jobs, position and health — saves to localStorage.

## How it is built

Three.js 0.179.1 vendored under `game/vendor/`. The game is plain
static files under `game/` with no build step and no network request:
`game/index.html` opens in desktop Chrome and plays. The source is
split into one file per system — `boot.js` (the loop and the camera),
`town.js` (the city), `roads.js` (the street grid), `cars.js`
(vehicles, driving, traffic, explosions), `crowd.js` (pedestrians and
dogs), `hero.js` (Rex), `law.js` (the police), `jobs.js` (the story),
`face.js` (the HUD and menus), `keys.js` (input), `sound.js` (audio),
`stage.js` (the four screenshots) — all deterministic from a seeded
RNG, so `?seed=1` always builds the same harbor.

Play it with `node serve.ts` (http://localhost:8080), or open
`game/index.html` from any static server. Keyboard and mouse.

## Screenshots

1. **1-start.jpg** — Rex on foot beside his red coupe at dusk.
2. **2-drive.jpg** — driving the coupe down the main avenue.
3. **3-chase.jpg** — a three-star chase: cruisers on the tail, the
   helicopter overhead, a fireball blooming ahead.
4. **4-end.jpg** — night at the safehouse after the Casino Caper.
