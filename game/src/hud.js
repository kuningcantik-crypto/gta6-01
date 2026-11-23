// The HUD: cash, health, respect, wanted stars, mission header, dispatch
// panel, weapon slots, crew, district, car identity, radio, clock, dialogue
// and a live minimap. All DOM — the 3D canvas stays clean. Every number is
// read from the live simulation state; nothing is faked. Text is only
// rewritten when it changes, and the minimap repaints at 10 Hz.
import { CITY, CREW, MISSIONS, RADIO, WANTED, districtAt, rankFor } from './config.js';
import { currentMission, nextStepLabel, objectiveLabel, stepTarget } from './missions.js';
import { unitName } from './world.js';

function fmtClock(minutes) {
  const total = Math.floor(minutes);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const day = ['FRI', 'SAT', 'SUN'][Math.floor(total / (60 * 24)) % 3];
  return `${day} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function fmtTimer(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function gearFor(speed) {
  const v = Math.abs(speed);
  if (v < 0.5) return 'N';
  return `G${Math.min(5, 1 + Math.floor(v / 6))}`;
}

export function createHud(state, callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'), controls: $('controls'),
    cash: $('cash'), healthFill: $('health-fill'), healthText: $('health-text'),
    respectName: $('respect-name'), respectFill: $('respect-fill'), respectText: $('respect-text'),
    dispatchTitle: $('dispatch-title'), dispatchRows: $('dispatch-rows'),
    crewRows: $('crew-rows'),
    stars: $('stars'), clock: $('clock'), weapons: $('weapons'),
    missionChapter: $('mission-chapter'), missionTitle: $('mission-title'),
    missionStageFill: $('mission-stage-fill'), missionObjective: $('mission-objective'),
    missionNext: $('mission-next'), missionTimer: $('mission-timer'),
    districtName: $('district-name'), districtRoad: $('district-road'), districtHeat: $('district-heat'),
    carName: $('car-name'), carCond: $('car-cond'), speed: $('speed'),
    radioLine: $('radio-line'),
    dialogue: $('dialogue'), dialoguePortrait: $('dialogue-portrait'),
    dialogueName: $('dialogue-name'), dialogueText: $('dialogue-text'),
    message: $('message'), minimap: $('minimap'), crosshair: $('crosshair'),
    flash: $('flash'), flashTitle: $('flash-title'), flashReward: $('flash-reward'),
    screens: { title: $('screen-title'), pause: $('screen-pause'), wasted: $('screen-wasted'),
      busted: $('screen-busted'), complete: $('screen-complete'),
      garage: $('screen-garage'), missions: $('screen-missions') },
    titleCash: $('title-cash'), titleMission: $('title-mission'),
    finalCash: $('final-cash'), finalMissions: $('final-missions'),
    garageList: $('garage-list'), garageMsg: $('garage-msg'),
    missionsList: $('missions-list'),
  };
  const mapCtx = els.minimap.getContext('2d');
  let messageTimer = 0;
  let mapTimer = 0;
  const cache = {};
  // Diagnostics handle for headless tests (backdrop-guard timing).
  window.__hudCache = cache;
  const setText = (key, el, text) => {
    if (cache[key] !== text) { cache[key] = text; el.textContent = text; }
  };
  const setHtml = (key, el, html) => {
    if (cache[key] !== html) { cache[key] = html; el.innerHTML = html; }
  };

  function showMessage(text, seconds) {
    els.message.textContent = text;
    els.message.style.opacity = '1';
    messageTimer = seconds || 3;
  }
  function showGarageMessage(text) {
    if (els.garageMsg) els.garageMsg.textContent = text || '';
  }

  function drawMinimap() {
    const size = 180;
    const scale = size / (CITY.half * 2 + 40);
    const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    mapCtx.clearRect(0, 0, size, size);
    mapCtx.fillStyle = '#274b2e'; mapCtx.fillRect(0, 0, size, size);
    // Ocean and beach at the south edge.
    mapCtx.fillStyle = '#1e7fa8';
    const [, beachY] = toMap(0, CITY.beachZ);
    mapCtx.fillRect(0, beachY, size, size - beachY);
    mapCtx.fillStyle = '#e8cf9a';
    mapCtx.fillRect(0, beachY - 4, size, 4);
    // Roads.
    mapCtx.strokeStyle = '#3a3f47'; mapCtx.lineWidth = 5;
    for (const c of CITY.roads) {
      const [x1, y1] = toMap(c, -CITY.half);
      const [x2, y2] = toMap(c, CITY.half);
      mapCtx.beginPath(); mapCtx.moveTo(x1, y1); mapCtx.lineTo(x2, y2); mapCtx.stroke();
      const [x3, y3] = toMap(-CITY.half, c);
      const [x4, y4] = toMap(CITY.half, c);
      mapCtx.beginPath(); mapCtx.moveTo(x3, y3); mapCtx.lineTo(x4, y4); mapCtx.stroke();
    }
    // Buildings.
    mapCtx.fillStyle = '#8a8f98';
    for (const col of state.colliders) {
      const [x, y] = toMap(col.x0, col.z0);
      mapCtx.fillRect(x, y, (col.x1 - col.x0) * scale, (col.z1 - col.z0) * scale);
    }
    // Police search zone (Eyes Out reveal) — a red dashed ring around Rico.
    if (state.player.eyesTimer > 0) {
      const [px, py] = toMap(state.player.x, state.player.z);
      mapCtx.strokeStyle = '#ff4444'; mapCtx.lineWidth = 2;
      mapCtx.setLineDash([4, 4]);
      mapCtx.beginPath(); mapCtx.arc(px, py, 60 * scale, 0, Math.PI * 2); mapCtx.stroke();
      mapCtx.setLineDash([]);
    }
    // Mission beacon.
    const target = stepTarget(state);
    if (target) {
      const [x, y] = toMap(target.x, target.z);
      mapCtx.fillStyle = '#ffd76e';
      mapCtx.beginPath(); mapCtx.arc(x, y, 5, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.strokeStyle = '#ffd76e'; mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(x, y, 9, 0, Math.PI * 2); mapCtx.stroke();
    }
    // Cars, police (red), roadblocks (orange), courier target (white ring).
    for (const car of state.cars) {
      if (car.kind === 'player') continue;
      const [x, y] = toMap(car.x, car.z);
      if (car === state.targetCar) {
        mapCtx.strokeStyle = '#fff'; mapCtx.lineWidth = 2;
        mapCtx.beginPath(); mapCtx.arc(x, y, 5, 0, Math.PI * 2); mapCtx.stroke();
      }
      mapCtx.fillStyle = car.kind === 'police' ? (car.roadblock ? '#ff9a3d' : '#ff4444') : '#dfe6ee';
      mapCtx.fillRect(x - 2, y - 2, 4, 4);
    }
    // Helicopter blip.
    if (state.heli.active) {
      const [x, y] = toMap(state.heli.x, state.heli.z);
      mapCtx.fillStyle = '#ffd76e';
      mapCtx.font = 'bold 12px system-ui, sans-serif';
      mapCtx.fillText('H', x - 4, y + 4);
    }
    // Player arrow.
    const [px, py] = toMap(state.player.x, state.player.z);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(Math.atan2(Math.sin(state.player.angle), Math.cos(state.player.angle)));
    mapCtx.fillStyle = '#2bd97a';
    mapCtx.beginPath(); mapCtx.moveTo(0, -7); mapCtx.lineTo(5, 6); mapCtx.lineTo(-5, 6); mapCtx.closePath(); mapCtx.fill();
    mapCtx.restore();
    // North marker.
    mapCtx.fillStyle = '#fff'; mapCtx.font = 'bold 11px system-ui, sans-serif';
    mapCtx.fillText('N', 6, 14);
  }

  function update(dt, screen) {
    const p = state.player;
    // The in-game HUD only exists during play; menus get a clean frame.
    els.hud.style.display = screen === 'play' ? 'block' : 'none';
    // The keyboard hint is a play aid, not a screenshot prop.
    if (els.controls) els.controls.style.display = window.__isShot ? 'none' : '';
    setText('cash', els.cash, `$${p.cash.toLocaleString('en-US')}`);
    els.healthFill.style.width = `${Math.max(0, p.health)}%`;
    setText('hp', els.healthText, `HP ${Math.ceil(Math.max(0, p.health))}`);
    // Respect rank + RP bar.
    const { rank, next } = rankFor(p.rp || 0);
    setText('rank', els.respectName, `RANK · ${rank.name}`);
    const span = next ? next.rp - rank.rp : 100;
    const prog = next ? Math.min(100, ((p.rp - rank.rp) / span) * 100) : 100;
    els.respectFill.style.width = `${prog}%`;
    setText('rp', els.respectText, next
      ? `${p.rp.toLocaleString('en-US')} / ${next.rp.toLocaleString('en-US')} RP`
      : `${p.rp.toLocaleString('en-US')} RP — max rank`);
    // Wanted stars + clock.
    setText('stars', els.stars, '★'.repeat(p.wanted) + '☆'.repeat(WANTED.maxStars - p.wanted));
    els.stars.style.color = p.wanted > 0 ? '#ffcf3d' : 'rgba(255,255,255,0.35)';
    setText('clock', els.clock, fmtClock(state.clockMinutes));
    // Weapon slots.
    const wHtml = p.weapons.map((w, i) => {
      const cls = `slot${i === p.weaponIndex ? ' current' : ''}${w.owned ? '' : ' locked'}`;
      const ammo = !w.owned ? `LOCKED · ${w.unlockRp} RP` : (w.id === 'fists' ? '∞' : `${w.mag} / ${w.ammo}`);
      return `<div class="${cls}"><span>${i + 1} ${w.short}</span><span class="ammo">${ammo}</span></div>`;
    }).join('');
    setHtml('weapons', els.weapons, wHtml);
    // Mission header.
    const mission = currentMission(state);
    if (mission) {
      setText('mch', els.missionChapter, `${mission.chapter} · MISSION ${state.missionIndex + 1}/${MISSIONS.length} · ${mission.giver}`);
      setText('mt', els.missionTitle, mission.title);
      const step = mission.steps[state.missionStep];
      const stagePct = ((state.missionStep) / mission.steps.length) * 100;
      els.missionStageFill.style.width = `${stagePct}%`;
      setText('mo', els.missionObjective, objectiveLabel(state));
      setText('mn', els.missionNext, nextStepLabel(state));
      const timed = step && (step.kind === 'race' || step.kind === 'timed') && step.seconds;
      setText('mtimer', els.missionTimer, timed ? `⏱ ${fmtTimer(state.missionTimer)}` : '');
    } else {
      setText('mch', els.missionChapter, 'FREE ROAM');
      setText('mt', els.missionTitle, 'Solmar Bay is yours');
      els.missionStageFill.style.width = '100%';
      setText('mo', els.missionObjective, 'Cause chaos or enjoy the sunset.');
      setText('mn', els.missionNext, '');
      setText('mtimer', els.missionTimer, '');
    }
    // Dispatch panel: real police units with distance + tactic.
    const police = state.cars.filter((c) => c.kind === 'police' && !c.disabled);
    const totalUnits = police.length + (state.heli.active ? 1 : 0);
    const unitRows = [];
    if (state.heli.active) {
      const d = Math.round(Math.hypot(state.heli.x - p.x, state.heli.z - p.z));
      unitRows.push(`<div class="unit"><span>AIR ONE</span><span>${d} m</span><span class="tactic">SPOTLIGHT</span></div>`);
    }
    for (const car of police) {
      const d = Math.round(Math.hypot(car.x - p.x, car.z - p.z));
      const tactic = car.roadblock ? 'ROADBLOCK' : (d < 10 ? 'RAMMING' : (d < 40 ? 'PURSUIT' : 'RESPONDING'));
      unitRows.push(`<div class="unit"><span>${unitName(car)}</span><span>${d} m</span><span class="tactic">${tactic}</span></div>`);
    }
    setText('dtitle', els.dispatchTitle, p.wanted > 0
      ? `SBPD DISPATCH — ${totalUnits} UNIT${totalUnits === 1 ? '' : 'S'} · ${p.wanted}★`
      : 'SBPD DISPATCH — CLEAR');
    setHtml('drows', els.dispatchRows, unitRows.length
      ? unitRows.join('')
      : '<div class="unit"><span>No units on you.</span><span></span><span></span></div>');
    // Crew abilities with live cooldowns.
    const crewHtml = CREW.map((c) => {
      const cd = p.crew[c.id] || 0;
      return `<div class="ability"><span><b>${c.key}</b> ${c.name} — ${c.who}</span><span class="cd">${cd > 0 ? Math.ceil(cd) + 's' : 'READY'}</span></div>`;
    }).join('');
    setHtml('crew', els.crewRows, crewHtml);
    // District.
    const d = districtAt(p.x, p.z);
    const heat = state.districtHeat[d.name] || 0;
    setText('dn', els.districtName, d.name);
    setText('dr', els.districtRoad, d.road);
    setText('dh', els.districtHeat, `${heat < 30 ? 'NEUTRAL' : heat < 60 ? 'WARM' : 'HOT'} · HEAT ${heat}`);
    // Car identity + speed.
    if (p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 3.6);
      setText('speed', els.speed, `${kmh} km/h`);
      setText('cname', els.carName, p.car.name || 'STOLEN CAR');
      const cond = Math.round(p.car.condition ?? 100);
      setText('ccond', els.carCond, `CONDITION ${cond}% · ${gearFor(p.car.speed)} · TUNE ${p.garage.tune}`);
      els.crosshair.style.display = 'none';
    } else {
      setText('speed', els.speed, '');
      setText('cname', els.carName, '');
      setText('ccond', els.carCond, '');
      // No crosshair in staged screenshots — it is a gameplay aid, not a prop.
      els.crosshair.style.display = (screen === 'play' && !window.__isShot) ? 'block' : 'none';
    }
    // Radio line.
    const station = RADIO[p.radioStation];
    const track = station.tracks[Math.floor(state.time / 45) % station.tracks.length];
    setText('radio', els.radioLine, `♪ ${station.name} — "${track}"`);
    // Dialogue box.
    if (state.dialogue && state.dialogue.timer > 0) {
      els.dialogue.style.display = 'flex';
      setText('dport', els.dialoguePortrait, (state.dialogue.name || 'L')[0]);
      setText('dname', els.dialogueName, `${state.dialogue.name} · ${state.dialogue.role}`);
      setText('dtext', els.dialogueText, `“${state.dialogue.text}”`);
    } else {
      els.dialogue.style.display = 'none';
    }
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) els.message.style.opacity = '0';
    }
    if (state.missionFlash) {
      els.flash.style.display = 'block';
      setText('ft', els.flashTitle, state.missionFlash.title);
      setText('fr', els.flashReward, `+$${state.missionFlash.reward}`);
      state.missionFlash.timer -= dt;
      if (state.missionFlash.timer <= 0) {
        state.missionFlash = null;
        els.flash.style.display = 'none';
      }
    } else {
      els.flash.style.display = 'none';
    }
    // Minimap at 10 Hz — full-rate 2D painting is wasted work. Always draw
    // once, so screenshot staging (dt = 0) still paints it.
    mapTimer += dt;
    if (mapTimer > 0.1 || !cache.mapDrawn) { mapTimer = 0; cache.mapDrawn = true; drawMinimap(); }
    // Screens: garage / missions overlays sit above play.
    const shown = state.garageOpen ? 'garage' : (state.missionsOpen ? 'missions' : screen);
    if (shown !== cache.shown) {
      cache.shown = shown;
      // When an overlay opens under a finger, the same tap's click event
      // would land on the backdrop and instantly close it again — the
      // backdrop handler ignores clicks for a while after a screen change.
      // 1500 ms, not 500: on a slow device the click handler itself can
      // run late (a busy frame), so the window must cover the whole tap.
      cache.shownAt = performance.now();
    }
    for (const [name, el] of Object.entries(els.screens)) {
      if (el) el.style.display = name === shown ? 'flex' : 'none';
    }
    if (state.garageOpen) {
      const g = p.garage;
      setHtml('glist', els.garageList,
        `<div>Cash: $${p.cash.toLocaleString('en-US')}</div>` +
        `<div>Engine tune: level ${g.tune} / 3 — top speed +${g.tune * 12}%</div>` +
        `<div>Armour: level ${g.armor} / 2 — ram damage −${g.armor * 25}%</div>` +
        `<div>Car: ${p.car ? `${p.car.name || 'car'} — condition ${Math.round(p.car.condition ?? 100)}%` : 'no car with you'}</div>` +
        `<div>Weapon: ${p.weapons[p.weaponIndex].name} — ${p.weapons[p.weaponIndex].mag} in mag, ${p.weapons[p.weaponIndex].ammo} reserve</div>`);
    }
    if (state.missionsOpen) {
      const list = MISSIONS.map((m, i) => {
        const cls = i < state.missionIndex ? 'done' : (i === state.missionIndex ? 'current' : 'locked');
        const mark = i < state.missionIndex ? '✓' : (i === state.missionIndex ? '▶' : '·');
        return `<div class="${cls}">${mark} ${i + 1}. ${m.title} — ${m.giver} · $${m.reward} · ${m.rp} RP</div>`;
      }).join('');
      setHtml('mlist', els.missionsList, list);
    }
    if (screen === 'title') {
      setText('tcash', els.titleCash, `$${p.cash.toLocaleString('en-US')}`);
      const m = currentMission(state);
      setText('tmiss', els.titleMission, m ? `Next job: ${m.title}` : 'Story complete — free roam');
    }
    if (screen === 'complete') {
      setText('fcash', els.finalCash, `$${p.cash.toLocaleString('en-US')}`);
      setText('fmiss', els.finalMissions, `${state.missionIndex} / ${MISSIONS.length} jobs done`);
    }
  }

  // Wire the menu buttons.
  const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  bind('btn-new', () => callbacks.onNewGame());
  bind('btn-continue', () => callbacks.onContinue());
  bind('btn-resume', () => callbacks.onResume());
  bind('btn-restart', () => callbacks.onRestart());
  bind('btn-title', () => callbacks.onTitle());
  bind('btn-free', () => callbacks.onFreeRoam());
  bind('btn-garage-close', () => callbacks.onGarageClose());
  bind('btn-missions-close', () => callbacks.onMissionsClose());
  // Tapping the dimmed backdrop (not a button) also closes the overlays —
  // on touch the JOBS/GAS buttons sit under the overlay, so the backdrop
  // is the way out besides the Close button.
  const backdrop = (id, fn) => {
    const el = $(id);
    if (el) el.addEventListener('click', (event) => {
      if (event.target === el && performance.now() - (cache.shownAt || 0) > 1500) fn();
    });
  };
  backdrop('screen-garage', () => callbacks.onGarageClose());
  backdrop('screen-missions', () => callbacks.onMissionsClose());
  for (const btn of document.querySelectorAll('[data-garage]')) {
    btn.addEventListener('click', () => callbacks.onGarageBuy(btn.getAttribute('data-garage')));
  }

  return { update, showMessage, showGarageMessage };
}
