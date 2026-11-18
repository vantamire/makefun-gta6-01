# VICE HARBOR

[![VICE HARBOR — Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/vantamire/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An entry for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on
[make.fun](https://make.fun): a complete 3D open-world crime game that runs
offline in a desktop browser from its own static files.

VICE HARBOR is a sun-soaked harbor city at dusk. Explore it on foot or by
car, steal any parked car, run three missions (Getaway Driver, Taxi Rush,
Package Run), build a wanted level and outrun the Harbor PD cruisers that
come for you, while traffic cruises the grid and pedestrians stroll the
sidewalks. A HUD with money, wanted stars, a live minimap, objective,
timer and speedometer keeps it all in view; a save remembers your money.

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
- **E** — enter / exit car · **M** — missions · **P** — pause · **H** — horn
- **Mouse drag** — orbit camera · **Wheel** — zoom

## Build

`main.ts` (Node 22, standard library only) hands the entry in: it copies
`game/` and `screenshots/` to `/output` and writes `/output/dossier.json`.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
