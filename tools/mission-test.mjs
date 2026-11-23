// Headless mission test: plays every one of the 12 Solmar Bay missions
// through window.__solmar, plus the heli, the roadblocks, the SMG unlock
// and the radio. Each mission is driven by its own step kind — teleport
// to the target and step — except ram and eliminate, which are driven
// into their targets by hand.
//
//   node tools/mission-test.mjs   (needs the dev server on :8080)
import { launchChrome, openTab } from './cdp-lib.mjs';

const URL = process.env.GAME_URL || 'http://localhost:8080/?seed=7';
const failures = [];
const results = [];

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Expected per-mission payouts, from the reference run: the job reward
// plus the step bonuses (collect +$25 a package, vault +$200, courier
// +$150, one disabled cruiser +$50 cash and +$25 RP).
const EXPECTED_CASH = [150, 325, 300, 200, 1000, 450, 550, 350, 650, 400, 550, 2475];
const EXPECTED_RP = [150, 150, 200, 150, 400, 300, 300, 250, 425, 250, 400, 600];

async function driveStep(tab, kind) {
  // One driver iteration for the current step. Returns true when the
  // mission index moved (the step — or the mission — completed).
  const before = await tab.evalJs('__solmar.mission()');
  const missionIndex = before.missionIndex;
  if (kind === 'goto' || kind === 'timed' || kind === 'pickup' || kind === 'deliver') {
    const target = before.target;
    if (target === null) {
      // "Steal a car": find the nearest car and climb in.
      const car = await tab.evalJs(`(() => {
        const p = __solmar.state.player;
        let best = null; let bestD = 1e9;
        for (const c of __solmar.state.cars) {
          if (c.kind === 'police') continue;
          const d = Math.hypot(c.x - p.x, c.z - p.z);
          if (d < bestD) { best = c; bestD = d; }
        }
        return best ? {x: best.x, z: best.z, angle: best.angle} : null;
      })()`);
      if (car) await tab.evalJs(`__solmar.putInCar(${car.x}, ${car.z}, ${car.angle})`);
      await tab.evalJs('__solmar.step(5)');
    } else {
      await tab.evalJs(`__solmar.teleport(${target.x}, ${target.z})`);
      await tab.evalJs('__solmar.step(5)');
    }
  } else if (kind === 'collect' || kind === 'race') {
    const target = before.target;
    if (target !== null) {
      await tab.evalJs(`__solmar.teleport(${target.x}, ${target.z})`);
      await tab.evalJs('__solmar.step(5)');
    } else {
      await tab.evalJs('__solmar.step(5)');
    }
  } else if (kind === 'wanted') {
    await tab.evalJs('__solmar.setWanted(3)');
    await tab.evalJs('__solmar.step(10)');
  } else if (kind === 'hold') {
    const target = before.target;
    if (target !== null) await tab.evalJs(`__solmar.teleport(${target.x}, ${target.z})`);
    await tab.evalJs('__solmar.step(360)');
  } else if (kind === 'ram') {
    await ramTarget(tab, 'courier');
  } else if (kind === 'eliminate') {
    await shootCruisers(tab);
  } else {
    await tab.evalJs('__solmar.step(10)');
  }
  const after = await tab.evalJs('__solmar.mission()');
  return after.missionIndex !== missionIndex || after.allMissionsDone;
}

// Ram a target car until it stops: put Rico's car a short run-up away,
// facing the target, and drive straight into it. A few hits disable it.
// Police cruisers move (they chase Rico), so each attempt re-aims from
// the target's CURRENT position with a short run-up — a long run-up at
// a stale position just misses. The burst stops the moment the mission
// moves on, so it never keeps ramming (and collecting collateral) after
// the job is done.
async function ramTarget(tab, which) {
  const startMission = await tab.evalJs('__solmar.state.missionIndex');
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ((await tab.evalJs('__solmar.state.missionIndex')) !== startMission) return;
    const info = await tab.evalJs(`(() => {
      const state = __solmar.state;
      const t = '${which}' === 'courier' ? state.targetCar
        : state.cars.find((c) => c.kind === 'police' && !c.disabled);
      if (!t) return null;
      return {x: t.x, z: t.z, damage: t.damage || 0, disabled: !!t.disabled};
    })()`);
    if (!info) {
      await tab.evalJs('__solmar.step(30)');
      continue;
    }
    if (info.disabled) return;
    // Keep the heat up while hunting cruisers, or they stop spawning.
    if (which === 'police') await tab.evalJs('if (__solmar.state.player.wanted < 2) __solmar.setWanted(3)');
    const p = await tab.evalJs('({x: __solmar.state.player.x, z: __solmar.state.player.z})');
    const angle = Math.atan2(info.x - p.x, info.z - p.z);
    const back = 8;
    const startX = info.x - Math.sin(angle) * back;
    const startZ = info.z - Math.cos(angle) * back;
    await tab.evalJs(`__solmar.putInCar(${startX}, ${startZ}, ${angle})`);
    await tab.evalJs(`__solmar.step(45, {up: true}, ${angle})`);
    if (which === 'police' && (await tab.evalJs('__solmar.state.eliminated')) >= 3) return;
  }
}

// Disable cruisers by shooting, not ramming: the pistol does 34 damage
// a hit, so three aimed hits wreck a cruiser (100 damage). Each shot
// re-aims from the cruiser's current position — cruisers move — and
// Rico stands 12 m off, on foot, so no cruiser can close in and bust
// him while he shoots.
async function shootCruisers(tab) {
  // Stop the moment the mission moves on: state.eliminated resets to 0
  // when the next mission starts, so without this the loop would keep
  // wrecking cruisers (and banking their bonuses) long after the job
  // was done.
  const startMission = await tab.evalJs('__solmar.state.missionIndex');
  for (let round = 0; round < 60; round += 1) {
    if ((await tab.evalJs('__solmar.state.missionIndex')) !== startMission) return;
    if ((await tab.evalJs('__solmar.state.eliminated')) >= 3) return;
    const target = await tab.evalJs(`(() => {
      const state = __solmar.state;
      let best = null; let bestD = 1e9;
      for (const c of state.cars) {
        if (c.kind !== 'police' || c.disabled) continue;
        const d = Math.hypot(c.x - state.player.x, c.z - state.player.z);
        if (d < bestD) { best = c; bestD = d; }
      }
      return best ? {x: best.x, z: best.z, damage: best.damage || 0} : null;
    })()`);
    if (!target) {
      await tab.evalJs('__solmar.setWanted(3)');
      await tab.evalJs('__solmar.step(120)');
      continue;
    }
    // Always fight on foot from a 12 m standoff: shooting from the car
    // is unreliable, and the standoff keeps every cruiser in range
    // while staying out of busting distance.
    const p = await tab.evalJs('({x: __solmar.state.player.x, z: __solmar.state.player.z})');
    const yaw = Math.atan2(target.x - p.x, target.z - p.z);
    const standX = target.x - Math.sin(yaw) * 12;
    const standZ = target.z - Math.cos(yaw) * 12;
    await tab.evalJs(`__solmar.state.player.car = null; __solmar.state.player.onFoot = true; __solmar.teleport(${standX}, ${standZ})`);
    await tab.evalJs('__solmar.fire()');
    await tab.evalJs(`__solmar.step(15, {}, ${yaw})`);
  }
}

async function playMission(tab, index) {
  // Cash/RP come from the player directly: mission() omits them once
  // the last mission is done (it returns only {done, missionIndex}).
  const before = await tab.evalJs('({cash: __solmar.state.player.cash, rp: __solmar.state.player.rp, title: (__solmar.mission().title || "done")})');
  const cash0 = before.cash;
  const rp0 = before.rp;
  await tab.evalJs(`__solmar.setMission(${index})`);
  for (let iter = 0; iter < 500; iter += 1) {
    const m = await tab.evalJs('__solmar.mission()');
    if (m.missionIndex !== index || m.allMissionsDone) break;
    if (m.stepKind === null) {
      await tab.evalJs('__solmar.step(10)');
      continue;
    }
    await driveStep(tab, m.stepKind);
  }
  const after = await tab.evalJs('({cash: __solmar.state.player.cash, rp: __solmar.state.player.rp, missionIndex: __solmar.state.missionIndex, allMissionsDone: __solmar.state.allMissionsDone})');
  const done = after.missionIndex !== index || after.allMissionsDone;
  const cashDelta = after.cash - cash0;
  const rpDelta = after.rp - rp0;
  results.push({index, title: before.title, done, cashDelta, rpDelta});
  check(`mission ${index + 1} ${before.title}`, done, `cash +${cashDelta} (want +${EXPECTED_CASH[index]}), rp +${rpDelta} (want +${EXPECTED_RP[index]})`);
  if (done && cashDelta !== EXPECTED_CASH[index]) {
    console.log(`  NOTE cash delta differs: got +${cashDelta}, expected +${EXPECTED_CASH[index]}`);
  }
  if (done && rpDelta !== EXPECTED_RP[index]) {
    console.log(`  NOTE rp delta differs: got +${rpDelta}, expected +${EXPECTED_RP[index]}`);
  }
}

const browser = await launchChrome({width: 1280, height: 800});
try {
  const tab = await openTab(browser, URL);
  try {
    await tab.waitFor('window.__solmar');
    await tab.evalJs(`document.getElementById('btn-new').click()`);
    await sleep(1000);

    for (let i = 0; i < 12; i += 1) await playMission(tab, i);
    const allDone = await tab.evalJs('__solmar.mission()');
    check('all 12 missions complete', allDone.allMissionsDone === true, `missionIndex=${allDone.missionIndex}`);

    // The helicopter comes up at three stars, roadblocks at four.
    await tab.evalJs('__solmar.setWanted(3)');
    await tab.evalJs('__solmar.step(120)');
    const heliUp = await tab.evalJs('!!__solmar.state.heli.active');
    check('heli at 3 stars', heliUp === true);
    await tab.evalJs('__solmar.setWanted(4)');
    await tab.evalJs('__solmar.step(120)');
    const blocks = await tab.evalJs('__solmar.state.cars.filter((c) => c.roadblock).length');
    check('roadblocks at 4 stars', blocks >= 1, `${blocks} roadblock(s)`);

    // Respect unlocks the SMG well before 650 RP; at 650 it is owned.
    await tab.evalJs('__solmar.state.player.rp = 650; __solmar.step(10)');
    const smgOwned = await tab.evalJs('__solmar.state.player.weapons[2].owned');
    check('SMG owned at 650 RP', smgOwned === true);

    // The radio cycles with a real C keypress. Poll: under SwiftShader
    // a frame can take half a second, so a fixed sleep is flaky.
    const radio0 = await tab.evalJs('__solmar.state.player.radioStation');
    await tab.tapKey('KeyC', 'c');
    await tab.waitFor(`__solmar.state.player.radioStation !== ${radio0}`, 5000);
    const radio1 = await tab.evalJs('__solmar.state.player.radioStation');
    check('radio cycles on C', radio1 !== radio0, `${radio0} -> ${radio1}`);

    const errors = tab.consoleErrors();
    check('0 console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await tab.close();
  }
} finally {
  browser.close();
}

console.log(failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILURES: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
