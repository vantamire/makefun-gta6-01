# VICE HARBOR

[![VICE HARBOR — Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on
[make.fun](https://make.fun): a complete 3D open-world crime game that runs
offline in a desktop browser from its own static files.

VICE HARBOR is a sun-soaked harbor city at dusk, the sun setting east over
the water. Explore it on foot or by car, steal any parked car, run four
missions (Getaway Driver, Taxi Rush, Package Run, and the new Harbor Heist —
steal the armored truck from Coral Bank and deliver it to the pier while
2 stars chase you), build a wanted level and outrun the Harbor PD cruisers
that come for you, while traffic cruises the grid and pedestrians stroll
the sidewalks. On foot you can shove a pedestrian with F (and earn a star
for it). A HUD with money, wanted stars, a live minimap, objective,
timer and speedometer keeps it all in view; a save remembers your money.
Boats bob on the water and the lighthouse beam sweeps the pier.

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
- **E** — enter / exit car · **M** — missions · **1-4** — pick a mission
- **F** — punch / shove a pedestrian · **C** — camera: follow / free orbit
- **Mouse drag** — orbit camera · **Wheel** — zoom
- **P** — pause · **H** — horn · **Enter** — start / resume / continue

The camera follows behind the car while driving (drag to look around; it
eases back) and kicks its field of view wider with speed.

## Build

`main.ts` (Node 22, standard library only) hands the entry in: it copies
`game/` and `screenshots/` to `/output` and writes `/output/dossier.json`.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
