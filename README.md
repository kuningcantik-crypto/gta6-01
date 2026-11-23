# Solmar Bay — Open World

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kuningcantik-crypto/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kuningcantik-crypto/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A 3D open-world crime game for make.fun's **gta6-01** bounty ($1,666). Rico Vane, $120, and twelve jobs between him and the big score — in a golden-hour coastal city with live police, a helicopter, carjacking, garage upgrades, respect ranks, radio, crew abilities and full mobile controls. One static site on three.js, no build step.

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

## Play

```bash
node serve.ts            # http://localhost:8080
```

Any static server works for `game/` too. Progress lives in the browser (localStorage, key `solmar-bay.save.v1`).

`?seed=N` rebuilds the identical city and traffic every time — the screenshots and the headless tests both run on seed 7.

## The game

You are **Rico Vane**, fresh out of the north. Lucia has work for you: twelve jobs, from a welcome package run at the pier to a $1,200 gold heist at the bank — plus a $1,000 story bonus when the last one lands.

- **Open world** — a sun-soaked coastal city: plaza, bank, hotel, hospital, pier and beach, with traffic, pedestrians, a working ocean and a drifting-cloud sky.
- **Twelve story missions** — fetch, pickup, taxi, race, ram, holdout and shootout jobs, each with its own giver, dialogue and reward.
- **Live police** — a wanted system (1–5 stars) with a real SBPD dispatch panel: named units, distances and tactics, a helicopter with a spotlight cone at 3 stars, roadblocks at 4, and busted/wasted consequences.
- **Driving** — carjacking, seven parked cars to steal, police cruisers to disable, and garage upgrades at the safehouse (engine tune, armour, repairs, ammo) that stay with Rico.
- **Combat** — seven weapons (fists to RPG) unlocked by respect rank, a respect ladder from Driver to Legend of Solmar, and three crew abilities: clean plates, roadside repair, and police-vision.
- **Radio** — five stations with named tracks, switched with C.
- **Mobile** — a virtual joystick plus GAS / BRKE / ACT / WPN / CAM / JOBS multi-touch buttons; the HUD reflows for phones.
- **Living city** — twelve hidden cash stashes to hunt (the HUD hints at the next one), weather that turns the afternoon cloudy and the evening to rain and lightning, two trams looping the city on rails, and a settings panel (O) for quality, volume, weather, minimap, FPS counter and camera inversion.
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
| O | Settings (quality, volume, weather, minimap, FPS, camera) |
| Space | Jump |
| Shift | Run |
| Esc | Pause |

On mobile the joystick moves Rico and the touch buttons drive, act, switch weapons, rotate the camera and open the job list.

## Missions

1. Welcome to Solmar (Lucia) · 2. Package Run (Lucia) · 3. Getaway Driver (Mira) · 4. Taxi Hustle (Lio) · 5. The Big Score (Lucia) · 6. Neon Nights Street Race (Mira) · 7. Ram the Courier (Nacho) · 8. Lose the Heat (Kiki) · 9. Pier Shootout (Lucia) · 10. Midnight Delivery (Tía Rosa) · 11. Lucia's Run (Lucia) · 12. The Gold Rush (Lucia).

## Build

```bash
node main.ts              # writes out/dossier.json + copies game/ and screenshots/
```

`main.ts` needs the four screenshots in `screenshots/` (seed 7, 1280×800). Regenerate them one scene at a time with the CDP harness:

```bash
node tools/cdp.mjs shot start   # ?shot=start&seed=7
node tools/cdp.mjs shot play    # ?shot=play&seed=7
node tools/cdp.mjs shot chase   # ?shot=chase&seed=7
node tools/cdp.mjs shot end     # ?shot=end&seed=7
```

Headless checks (each launches its own headless Chrome with a fresh profile):

```bash
node tools/cdp.mjs fps            # frame-time stats + draw calls
node tools/mission-test.mjs       # all 12 missions
node tools/playtest.mjs           # desktop play with real keys
node tools/mobile-test.mjs        # 390×844 viewport, real touch events
node tools/collectibles-test.mjs  # stashes, weather, trams, settings
```

If a run is killed mid-flight, stray Chromes can starve the VM — clean them up before the next batch: `pkill -f 'chrome-profile-'`.

## Tech

three.js (vendored) + vanilla JavaScript modules, no build step. The game is a static site: `game/index.html` + `game/src/*.js`.

## License

MIT — see [LICENSE](LICENSE).
