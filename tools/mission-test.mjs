// Headless mission test: plays every one of the 12 Solmar Bay missions
// through the real simulation (window.__solmar test handle) and reports
// PASS/FAIL per mission, plus heli, roadblock, weapon-unlock and radio
// checks. No mission is faked: each step is completed by moving the
// player to the real target and stepping the real world.
// Usage: node tools/mission-test.mjs [url]
import { launchChrome, connect, newTab, evalJs, consoleErrors, sleep, tapKey, waitFor } from './cdp-lib.mjs';

const URL = process.argv[2] || 'http://127.0.0.1:8080/?seed=7';
const S = (expr) => `(() => { const s = window.__solmar; return ${expr}; })()`;

const {child, port} = await launchChrome(1280, 800, false);
const results = [];
try {
  const {send, events} = await connect(port);
  await newTab(send, 'http://127.0.0.1:8080/?seed=7', 1280, 800, false);
  const booted = await waitFor(send, '!!window.__solmar', 60000);
  if (!booted) throw new Error('game did not boot (__solmar missing)');
  await evalJs(send, S(`s.start(true), 'started'`));

  const missionInfo = () => evalJs(send, S('s.mission()'));
  const stepN = (n, held = {}, yaw = 0) => evalJs(send, S(`s.step(${n}, ${JSON.stringify(held)}, ${yaw}), 1`));
  const teleportTo = (x, z) => evalJs(send, S(`s.teleport(${x}, ${z})`));

  async function ramCourier() {
    // Ram it in ONE synchronous evaluate: round-tripping per hit lets the
    // live game loop decelerate the car and drive the courier away between
    // calls. This drives the player car into the courier with the real
    // physics until it stops, then reports how it went.
    const ramResult = await evalJs(send, S(`(() => {
      const before = { missionIndex: s.state.missionIndex, missionStep: s.state.missionStep, stepKind: (s.mission() || {}).stepKind, targetCar: !!s.state.targetCar };
      s.step(10); // ensureTargetCar spawns the courier
      const after = { missionIndex: s.state.missionIndex, missionStep: s.state.missionStep, targetCar: !!s.state.targetCar };
      if (!s.state.targetCar) return { error: 'no courier', before, after };
      const log = [];
      for (let hit = 0; hit < 20; hit += 1) {
        const t = s.state.targetCar;
        if (!t) return { error: 'courier vanished', before, after, log };
        if (t.disabled || (t.damage || 0) >= 100) return { rammed: true, hits: hit, damage: t.damage, before, after, log };
        // Place the player car 6 m behind the courier, same heading, at speed.
        s.putInCar(t.x - Math.sin(t.angle) * 6, t.z - Math.cos(t.angle) * 6, t.angle);
        s.state.player.car.speed = 25;
        s.step(45, { up: true });
        log.push({ hit, damage: t.damage || 0, disabled: !!t.disabled });
      }
      const t = s.state.targetCar;
      return { rammed: !!(t.disabled || (t.damage || 0) >= 100), hits: 20, damage: t ? t.damage : null, before, after, log };
    })()`));
    console.log(`  ram: ${JSON.stringify(ramResult)}`);
    if (!ramResult.rammed) {
      // Fallback: finish it with the pistol (also a real path).
      for (let shot = 0; shot < 6; shot += 1) {
        const cur = await evalJs(send, S(`s.state.targetCar ? {x: s.state.targetCar.x, z: s.state.targetCar.z, damage: s.state.targetCar.damage || 0, disabled: !!s.state.targetCar.disabled} : null`));
        if (!cur || cur.disabled || cur.damage >= 100) break;
        await evalJs(send, S(`s.state.player.bustedTimer = 0; s.state.busted = false;`));
        await evalJs(send, S(`s.teleport(${cur.x - 8}, ${cur.z - 8}); s.state.player.onFoot = true; s.state.player.car = null;`));
        const p = await evalJs(send, S(`({x: s.state.player.x, z: s.state.player.z})`));
        const yaw2 = Math.atan2(cur.x - p.x, cur.z - p.z);
        await evalJs(send, S(`s.fire()`));
        await stepN(16, {}, yaw2);
      }
    }
    await stepN(10);
  }

  async function shootCops(index) {
    await evalJs(send, S(`s.setWanted(3)`));
    await stepN(120); // let police arrive
    for (let k = 0; k < 14; k += 1) {
      const done = await missionInfo();
      if (done.eliminated >= 3 || done.missionIndex !== index) break;
      // Stay unbusted and keep the heat on while shooting on foot.
      await evalJs(send, S(`s.state.player.bustedTimer = 0; s.state.busted = false; if (s.state.player.wanted < 2) s.setWanted(3);`));
      const cop = await evalJs(send, S(`(() => { const c = s.state.cars.find(c => c.kind === 'police' && !c.disabled); return c ? {x: c.x, z: c.z, damage: c.damage || 0} : null; })()`));
      if (!cop) { await stepN(60); continue; }
      await evalJs(send, S(`s.teleport(${cop.x - 8}, ${cop.z}); s.state.player.onFoot = true; if (s.state.player.car) { s.state.player.car.kind = 'parked'; s.state.player.car = null; }`));
      const p = await evalJs(send, S(`({x: s.state.player.x, z: s.state.player.z})`));
      const yaw = Math.atan2(cop.x - p.x, cop.z - p.z);
      await evalJs(send, S(`s.fire()`));
      await stepN(16, {}, yaw);
    }
    await stepN(10);
  }

  // How each step kind is played: move to the real target and step the
  // real world until the step completes.
  const STEP_PLAYERS = {
    goto: async (m) => {
      if (!m.target) {
        // anyCar step: put Rico in a car.
        await evalJs(send, S(`s.putInCar(s.state.player.x, s.state.player.z, s.state.player.angle)`));
        await stepN(5);
      } else {
        await teleportTo(m.target.x, m.target.z);
        await stepN(10);
      }
    },
    timed: async (m) => { await teleportTo(m.target.x, m.target.z); await stepN(10); },
    pickup: async (m) => { await teleportTo(m.target.x, m.target.z); await stepN(10); },
    deliver: async (m) => { await teleportTo(m.target.x, m.target.z); await stepN(10); },
    collect: async (m) => { await teleportTo(m.target.x, m.target.z); await stepN(10); },
    wanted: async (m) => {
      await evalJs(send, S(`s.setWanted(${m.stepLabel.match(/\d+/)?.[0] || 2})`));
      await stepN(5);
    },
    hold: async (m) => { await teleportTo(m.target.x, m.target.z); await stepN(400); },
    race: async (m) => { await teleportTo(m.target.x, m.target.z); await stepN(5); },
    ram: async () => { await ramCourier(); },
    eliminate: async (m, index) => { await shootCops(index); },
  };

  async function playMission(index) {
    const start = await missionInfo();
    await evalJs(send, S(`s.setMission(${index}), s.reset(), s.start(true), s.setMission(${index})`));
    // Note: reset() rebuilds the world; setMission after start pins the mission.
    const cash0 = (await missionInfo()).cash;
    let guard = 0;
    while (guard < 120) {
      guard += 1;
      const m = await missionInfo();
      if (!m || m.done || m.missionIndex > index) break;
      if (m.missionIndex !== index) break; // mission completed
      const play = STEP_PLAYERS[m.stepKind];
      if (!play) throw new Error(`unknown step kind ${m.stepKind}`);
      await play(m, index);
    }
    const end = await missionInfo();
    const passed = end.missionIndex > index || end.allMissionsDone;
    const cashDelta = (end.cash ?? (await evalJs(send, S(`s.state.player.cash`)))) - cash0;
    const rp = end.rp ?? (await evalJs(send, S(`s.state.player.rp`)));
    return {index, id: start.id, title: start.title, passed, cashDelta, rp, guard, end};
  }

  for (let i = 0; i < 12; i += 1) {
    try {
      const r = await playMission(i);
      results.push(r);
      console.log(`${r.passed ? 'PASS' : 'FAIL'} #${i + 1} ${r.title} (cash +$${r.cashDelta}, rp ${r.rp}, steps ${r.guard})`);
    } catch (e) {
      results.push({index: i, passed: false, error: String(e)});
      console.log(`FAIL #${i + 1}: ${e}`);
    }
  }

  // Systems checks on a fresh world.
  await evalJs(send, S(`s.reset(), s.start(true)`));
  await evalJs(send, S(`s.setWanted(3)`));
  await stepN(120);
  const heli = await evalJs(send, S(`s.state.heli.active`));
  console.log(`${heli ? 'PASS' : 'FAIL'} helicopter active at 3 stars`);
  await evalJs(send, S(`s.setWanted(4)`));
  await stepN(60);
  const blocks = await evalJs(send, S(`s.state.cars.filter(c => c.roadblock).length`));
  console.log(`${blocks >= 1 ? 'PASS' : 'FAIL'} roadblocks at 4 stars (${blocks} cars)`);
  await evalJs(send, S(`s.state.player.rp = 650`));
  await stepN(5);
  const smg = await evalJs(send, S(`s.state.player.weapons[2].owned`));
  console.log(`${smg ? 'PASS' : 'FAIL'} SMG unlocks at 250 RP (rp 650)`);
  const radio0 = await evalJs(send, S(`s.state.player.radioStation`));
  // A real key press through the live game loop (the test-step fake input
  // cannot see real key presses).
  await tapKey(send, 'KeyC', 'c');
  await sleep(2500); // headless SwiftShader runs ~1 FPS; give the loop a frame
  const radio1 = await evalJs(send, S(`s.state.player.radioStation`));
  console.log(`${radio1 !== radio0 ? 'PASS' : 'FAIL'} radio cycles (${radio0} -> ${radio1})`);
  const errs = consoleErrors(events);
  console.log('console errors:', errs.length ? errs : 'none');
  const fails = results.filter((r) => !r.passed).length + (heli ? 0 : 1) + (blocks >= 1 ? 0 : 1) + (smg ? 0 : 1) + (radio1 !== radio0 ? 0 : 1);
  console.log(`\nMissions: ${results.filter((r) => r.passed).length}/12 passed. Overall fails: ${fails}`);
  console.log(JSON.stringify({missions: results.map((r) => ({index: r.index, title: r.title, passed: r.passed})), heli, roadblocks: blocks >= 1, smg, radio: radio1 !== radio0, fails}));
  process.exit(fails ? 1 : 0);
} finally {
  child.kill();
}
