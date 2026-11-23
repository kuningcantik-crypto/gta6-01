# Solmar Bay — Open World

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kuningcantik-crypto/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kuningcantik-crypto/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A 3D open-world crime game for make.fun's **gta6-01** bounty ($1,666): twelve story missions, a live police dispatch with helicopter and roadblocks, carjacking and garage upgrades, respect ranks, radio stations, crew abilities, and full mobile controls — all in one static HTML/JS game built on three.js.

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

## Play

```bash
node serve.ts            # http://localhost:8080
```

Or open `game/index.html` through any static server. Progress saves in the browser (localStorage, key `solmar-bay.save.v1`).

Add `?seed=N` to the URL to rebuild the same city and traffic every time — the screenshots and the headless tests both use seed 7.

## The game

You are **Rico Vane**, fresh out of the north with $120 and a name to make. Lucia has work for you: twelve jobs stand between you and the big score, from a welcome package run at the pier to a $1,200 gold heist at the bank.

- **Open world** — a golden-hour coastal city: plaza, bank, hotel, hospital, pier and beach, with traffic, pedestrians, a working ocean and a drifting-cloud sky.
- **Twelve story missions** — fetch, pickup, taxi, race, ram, holdout and shootout jobs, each with its own giver, dialogue and reward, plus a $1,000 story bonus at the end.
- **Live police** — a wanted system (1–5 stars) with a real SBPD dispatch panel: named units, distances and tactics, a helicopter with a spotlight cone at 3 stars, roadblocks at 4, and busted/wasted consequences.
- **Driving** — carjacking, seven parked cars to steal, police cruisers to disable, garage upgrades at the safehouse (engine tune, armour, repairs, ammo) that persist with Rico.
- **Combat** — seven weapons (fists to RPG) unlocked by respect rank, a respect ladder from Driver to Legend, and three crew abilities: clean plates, roadside repair, and police-vision.
- **Radio** — four stations with named tracks, switched with C.
- **Mobile** — a virtual joystick plus GAS / BRKE / ACT / WPN / CAM / JOBS multi-touch buttons; the HUD reflows for phones.
- **Performance** — instanced city geometry, a shadow frustum that follows the player, capped pixel ratio, and an automatic low-effects mode when frames stay slow.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| E | Enter / exit car |
| Mouse click | Shoot |
| F | Punch |
| R | Reload |
| 1–7, Q | Switch / cycle weapon |
| C | Change radio station |
| Z / X / V | Crew: clean plates / roadside repair / police-vision |
| G | Garage (at the safehouse) |
| M | Mission list |
| Space | Jump |
| Shift | Run |
| Esc | Pause |

On mobile the joystick moves Rico and the touch buttons drive, act, switch weapons, rotate the camera and open the job list.

## Missions

1. Welcome to Solmar (Lucia) — 2. Package Run (Lucia) — 3. The Getaway (Mira) — 4. Taxi Driver (Lio) — 5. The Big Score (Lucia) — 6. Street Race (Mira) — 7. Ram Raid (Nacho) — 8. Lose the Heat (Kiki) — 9. The Shootout (Lucia) — 10. Special Delivery (Tía Rosa) — 11. The Escort (Lucia) — 12. The Gold Rush (Lucia).

## Build

```bash
node main.ts              # writes out/dossier.json + copies game/ and screenshots/
```

`main.ts` needs the four screenshots in `screenshots/` (seed 7, 1280×800). Regenerate them with:

```bash
node tools/shots.mjs      # renders 1-start, 2-play, 3-chase, 4-end via headless Chrome
```

Headless checks:

```bash
node tools/mission-test.mjs   # all 12 missions
node tools/playtest.mjs       # desktop play
node tools/mobile-test.mjs    # 390×844 viewport, real touch events
```

## Tech

three.js (vendored) + vanilla JavaScript modules, no build step. The game is a static site: `game/index.html` + `game/src/*.js`.

## License

MIT — see [LICENSE](LICENSE).
