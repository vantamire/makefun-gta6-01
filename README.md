# VICE HARBOR

[![VICE HARBOR — Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on
[make.fun](https://make.fun): a complete 3D open-world crime game that runs
offline in a desktop browser from its own static files.

VICE HARBOR is a sun-soaked harbor city at dusk, the sun setting east over
the water. Explore it on foot or by car, steal any parked car, run twelve
missions (Getaway Driver, Taxi Rush, Package Run, Harbor Heist — steal the
armored truck from Coral Bank and deliver it to the pier while 2 stars
chase you — plus Pizza Delivery, a Street Race against a rival AI car,
Vigilante: ram two fleeing cars to a stop, Night Cab, Dockside Dash,
Bridge Run, Casino Caper — lift the cash cart from the Golden Anchor and
reach the safehouse at 3 stars for the biggest score in town ($700) — and
Airport Run ($480)), build a wanted level
and outrun the Harbor PD cruisers — and, at 3+ stars, the police
helicopter circling above with its searchlight and the striped
roadblocks the PD throws across the avenues — while traffic cruises the
grid and pedestrians stroll the sidewalks and the boardwalk. On foot you
can shove a pedestrian with F (and earn a star for it), or draw the
pistol with Q and fire it, or cycle to the scattergun or the SMG with X. A save
remembers your money. Boats bob on the water, the ferris wheel turns on
the boardwalk, and the lighthouse beam sweeps the pier.

## What's new in v7

- **A fresh implementation, plus a fourth district:** the west boardwalk
  (wooden deck, food stalls, a rotating ferris wheel, an arcade, a
  marina with boats, beach umbrellas and palms, and a pier over the
  water) joins downtown, the north industrial yards and the south houses.
- **Two new machines:** a motorcycle (two wheels, a rider, quick and
  twitchy) and an open-bed pickup join the sedans, taxis, sport cars,
  buses, vans, limos, trucks and police cruisers. The sport car wears a
  rear spoiler, and every car has a stepped hood and trunk, pale glass
  cabin, chrome bumpers and grille, fat headlights and a full-width
  tail-light strip.
- **Two new missions:** Casino Caper ($700, lift the cash cart from the
  Golden Anchor and reach the safehouse at 3 stars) and Airport Run
  ($480, run a sealed case to the airstrip at 1 star). Twelve missions in
  all.
- **Day and night:** the sun, the sky, the fog and the streetlights follow
  an in-game clock (a full day is 8 minutes, starting at dusk 18:30),
  and the HUD clock reads the same time. Night Cab runs after dark.
- **A police helicopter that hunts:** at 3+ stars it orbits above you
  with a searchlight, a blinking belly bar and a rotor sound, on top of
  the cruisers and the roadblocks.
- **Jump pads and stunt pay:** two glowing orange pads on the grid launch
  the car into the air — a real flight pays by the second (up to $200).
  Flashing past a traffic car at speed without touching it pays a
  $10 near-miss bonus.
- **Stray dogs:** three dogs trot the sidewalks, sniff the ground, wag
  their tails and bolt when a fast car comes near.
- **Photo mode:** press V to hide every piece of HUD chrome for a clean
  screenshot of the city, and V again to bring it back.
- **Closer to the reference:** a hero portrait with a health bar
  top-left, graffiti tags on the shopfront walls, a fireball explosion on
  hard crashes, and the chase screenshot stages a blast ahead of the red
  sport car with the cruisers flanking it and the helicopter above.
- **Traffic that lives:** cars follow waypoint routes along the grid,
  brake for the car ahead and for red lights, and honk when you block
  them. Pedestrians cross at the lights, stroll the sidewalks and the
  boardwalk, and dive out of the way of a speeding car.

## How to play

Open `game/index.html` in a desktop browser (or `node serve.ts` and visit
http://localhost:8080). Click **START ENGINE** or press Enter.

- **W A S D** — move / drive · **Shift** — run · **Space** — handbrake
- **E** — enter / exit car · **M** — missions · **F** — punch / fire
- **Q** — draw weapon · **X** — swap weapon · **R** — reload
- **N** — radio · **C** — camera · **H** — horn · **V** — photo mode
- **P** — pause · **1–0** — pick a mission · **Enter** — start / continue

Steal a parked car with E, then drive to the glowing beacon. Finish a
mission to bank the payout — the money is saved in your browser. Get
busted (health hits zero with the cops on you) and you lose the heat but
keep the cash. The wanted level climbs when you steal, shove, shoot or
crash hard; at 3+ stars the helicopter and the roadblocks join the hunt.

## Screenshots

Four real renders of the game, taken in desktop Chrome from the staged
scenes in `shots.json` (seed 1, 1280×720):

1. `1-start.jpg` — the hero on the sidewalk at dusk, the red sport car
   ahead, pedestrians crossing, the menu up.
2. `2-drive.jpg` — the hero driving the red sport car, the Taxi Rush
   mission live, traffic and pedestrians ahead.
3. `3-chase.jpg` — 3 stars, cruisers flanking, the helicopter above and a
   fireball going off ahead of the red sport car.
4. `4-end.jpg` — the hero on foot beside the red sport car at sunset, the
   mission-complete overlay up with $500 banked.

## Determinism

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json`. Run it twice with `MAKEFUN_OUTPUT_DIR` set and the
output is byte-identical: the world is seeded, the screenshots are fixed
captures, and no clock or random value leaks into the output.

## Tech

- three.js 0.179.1, vendored under `game/vendor/` — no CDN, no network.
- Node 22, standard library only for `main.ts` and `serve.ts`.
- WebAudio for the engine, sirens, radio and effects — all synthesized,
  no audio files.
