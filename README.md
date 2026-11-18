# VICE HARBOR

[![VICE HARBOR — Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on
[make.fun](https://make.fun): a complete 3D open-world crime game that runs
offline in a desktop browser from its own static files.

VICE HARBOR is a sun-soaked harbor city at dusk, the sun setting east over
the water. Explore it on foot or by car, steal any parked car, run seven
missions (Getaway Driver, Taxi Rush, Package Run, Harbor Heist — steal the
armored truck from Coral Bank and deliver it to the pier while 2 stars
chase you — plus Pizza Delivery, a Street Race against a rival AI car, and
Vigilante: ram two fleeing cars to a stop), build a wanted level and outrun
the Harbor PD cruisers — and, at 3+ stars, the police helicopter circling
above with its searchlight — while traffic cruises the grid and
pedestrians stroll the sidewalks and the boardwalk. On foot you can shove
a pedestrian with F (and earn a star for it), or draw the pistol with Q
and fire it. A save remembers your money. Boats bob on the water, the
ferris wheel turns on the boardwalk, and the lighthouse beam sweeps the pier.

## What's new in v4

- **A fresh implementation, plus a second district:** the harbor boardwalk
  — a plank deck with food stalls, a turning ferris wheel, an arcade hut,
  a marina with moored boats, beach umbrellas and palms — and a share of
  the crowd strolls it instead of the city streets.
- **More machines:** a motorcycle (two wheels, a rider who appears when
  you climb on) and a pickup with an open bed join the sedans, taxis,
  sport cars, trucks, buses and police cruisers. The sport car wears a
  rear spoiler, and every car has a stepped hood and trunk, pale glass
  cabin, chrome bumpers and grille, fat headlights and a full-width
  tail-light strip.
- **A weapon:** Q draws the pistol (12-round magazine, F fires a hitscan
  shot with a tracer and a muzzle flash, R reloads). Shooting a pedestrian
  or a cop raises the heat; shooting a vehicle sets off a fireball; a
  pistol hit stops a fleeing car in the Vigilante mission.
- **A day/night cycle:** the sun, sky, fog and street lamps follow the
  in-game hour — dusk at boot, then night, dawn and day, a full day every
  8 minutes. The HUD clock reads the same hour.
- **A police helicopter:** at 3+ stars a chopper joins the hunt, circling
  above the player with a sweeping searchlight and a flashing belly bar.
- **Three new missions:** Pizza Delivery ($300), Street Race ($450, beat
  the rival AI car to three checkpoints), Vigilante ($400, ram two
  fleeing cars to a stop). Seven missions in all.
- **Jump pads and stunt pay:** two glowing orange pads on the grid launch
  the car into the air — a real flight pays by the second (up to $200).
  Flashing past a traffic car at speed without touching it pays a
  $10 near-miss bonus.
- **Stray dogs:** three dogs trot the sidewalks, sniff the ground, wag
  their tails and bolt when a fast car comes near.
- **Photo mode:** press V to hide every piece of HUD chrome for a clean
  screenshot of the city, and V again to bring it back.
- **Closer to the reference:** graffiti tags on the shopfront walls, a
  fireball explosion on hard crashes, and the chase screenshot stages a
  blast ahead of the red sport car with the cruisers flanking it and the
  helicopter above.
- **Traffic that lives:** cars follow waypoint routes along the grid,
  turn at intersections, stop at red lights, and brake for the player,
  for the car ahead, and for pedestrians crossing.

## What's new in v3.2

- **A visible hero:** the player is a chunky third-person character now —
  burgundy open jacket over a white tee, blue jeans, sneakers, red cap
  worn backwards — and the menu camera orbits close behind them instead
  of floating over the city from 170 m up.
- **Cars that look like cars:** stepped hood and trunk, pale glass cabin
  with windshield and roof, chrome bumpers and grille, fat headlights and
  a full-width tail-light strip, mirrors, side skirts, fender flares, and
  four big wheels with silver hubs that spin and steer. The player's car
  is bright harbor red with its headlights on; police cruisers are
  black-and-white with a bigger light bar; taxis wear a checker band.
- **A denser city:** low shopfronts with BIG readable signs (PIZZA,
  24H MART, TACOS, DONUTS...), mid-rise blocks and towers, brighter
  warmer walls with bigger lit windows, pale sidewalk curbs, street-name
  blades and STOP signs, traffic lights at twelve junctions, and natural
  trees (leafy canopies, palms with fronds) instead of lollipops.
- **Closer camera:** the follow camera sits 7.5 m back and low, GTA-style,
  so the character, the car and the street fill the frame.
- **A real street map:** the minimap draws wide pale roads on dark land
  with yellow centre dashes, a bigger player arrow and mission diamond.
- **More life:** 56 pedestrians in brighter clothes and 26 traffic cars;
  every screenshot stages pedestrians crossing the road and another car
  ahead, so the streets are never empty.

## Play

Serve `game/` with any static server and open `game/index.html`, or run
the included server from the repository root:

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No network request is
made: three.js is vendored under `game/vendor/`, every texture is drawn on
canvas, and every sound is synthesized with WebAudio.

## Controls

- **W A S D** — move / drive · **Shift** — run · **Space** — handbrake
- **E** — enter / exit car · **M** — missions · **1-7** — pick a mission
- **F** — punch / fire the pistol · **Q** — draw / holster the pistol
- **R** — reload the pistol · **C** — camera: follow / free orbit
- **Mouse drag** — orbit camera · **Wheel** — zoom
- **P** — pause · **H** — horn · **Enter** — start / resume / continue

The camera follows behind the car while driving (drag to look around; it
eases back) and kicks its field of view wider with speed. Crashes and
police rams dent your health and armor; health recovers after a quiet
spell. Hard crashes set off a fireball.

## Build

`main.ts` (Node 22, standard library only) hands the entry in: it copies
`game/` and `screenshots/` to `/output` and writes `/output/dossier.json`.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
