# Solmar Bay — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kuningcantik-crypto/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kuningcantik-crypto/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 3D open-world crime game in the spirit of GTA 6, built for the
make.fun `gta6-01` bounty. A sun-soaked city to explore on foot and by car,
with traffic, pedestrians, cars to steal, a wanted level with police, a
police helicopter and roadblocks, twelve story missions, combat, radio,
respect ranks, a garage, a crew, a HUD with a live minimap, a start screen
and a save. Nothing here names, copies or borrows from any commercial game —
the city (Solmar Bay), the people (Rico Vane, Lucia) and the story are all
original.

## Play it

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Open the page in desktop Chrome, or on a phone: touch controls appear
automatically — a virtual joystick on the left, GAS / brake and action
buttons on the right, all multi-touch.

- **WASD** move / drive · **E** enter or exit a car · **Mouse click** shoot ·
  **F** punch · **R** reload · **Space** jump · **Shift** run · **Esc** pause
- **1–7** weapons · **Q** cycle weapon · **C** radio · **Z / X / V** crew
  abilities · **G** garage (at the safehouse) · **M** job list

## What's in it

- `game/` — the game itself: plain static files, no build step, no network
  requests. `game/index.html` plus ES modules under `game/src/`, with
  three.js r160 vendored under `game/vendor/`.
- `main.ts` — the entry program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the vendored make.fun
  library (`vendor/makefun-game.ts`).
- `screenshots/` — four real renders of the game (seed 7, 1280×800):
  title, driving, police chase, mission complete.
- `tools/` — the headless test harness (mission, desktop play and mobile
  touch tests, run against Chrome over CDP).

## Systems

- **12 missions** — Welcome to Solmar, Package Run, Getaway Driver, Taxi
  Hustle, The Big Score, Neon Nights Street Race, Ram the Courier, Lose the
  Heat, Pier Shootout, Midnight Delivery, Lucia's Run, and the bank-heist
  finale The Gold Rush. Cash + respect (RP) rewards, with a $1,000 bonus
  for finishing the story.
- **Police** — wanted stars 0–5, police cruisers that chase and ram, a
  helicopter with a spotlight at 3+ stars, roadblocks at 4+ stars, busted
  and wasted screens.
- **Weapons** — 7 slots (fists, pistol, SMG, shotgun, AR, RPG, sniper),
  unlocked by respect rank.
- **Radio** — 4 stations with rotating tracks; **respect** — 6 ranks from
  DRIVER to LEGEND OF SOLMAR; **garage** — repair, engine tune and armour;
  **crew** — three abilities with cooldowns.
- **Performance** — instanced city geometry (~186 draw calls in play),
  a player-following shadow frustum, capped pixel ratio, and an automatic
  low-effects mode when frames stay slow.

## License

MIT — see `LICENSE`.
