// The HUD: cash, health, respect, wanted stars, mission header, dispatch
// panel, weapon slots, crew, district, car identity, radio, clock,
// dialogue and a live minimap. All DOM — the 3D canvas stays clean.
// Every number is read from the live simulation state; nothing is faked.
// Text is only rewritten when it changes, and the minimap repaints at
// 10 Hz.
import { CITY, CREW, MISSIONS, RADIO, WANTED, districtAt, heatLabel, rankFor } from './config.js';
import { currentMission, nextStepLabel, objectiveLabel, stepTarget } from './missions.js';
import { loadBest, unitName } from './world.js';

function clockText(minutes) {
  const total = Math.floor(minutes);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const day = ['FRI', 'SAT', 'SUN'][Math.floor(total / (60 * 24)) % 3];
  return `${day} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function timerText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function gearLabel(speed) {
  const v = Math.abs(speed);
  if (v < 0.5) return 'N';
  return `G${Math.min(5, 1 + Math.floor(v / 6))}`;
}

export function createHud(state, callbacks) {
  const $ = (id) => document.getElementById(id);
  const el = {
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
    ticker: $('ticker'), pauseStats: $('pause-stats'),
    flash: $('flash'), flashTitle: $('flash-title'), flashReward: $('flash-reward'),
    screens: {title: $('screen-title'), pause: $('screen-pause'), wasted: $('screen-wasted'),
      busted: $('screen-busted'), complete: $('screen-complete'),
      garage: $('screen-garage'), missions: $('screen-missions')},
    titleCash: $('title-cash'), titleMission: $('title-mission'), titleBest: $('title-best'),
    finalCash: $('final-cash'), finalMissions: $('final-missions'),
    garageList: $('garage-list'), garageMsg: $('garage-msg'),
    missionsList: $('missions-list'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let messageTimer = 0;
  let mapTimer = 0;
  // Solmar Bay wire: rotating city news and street tips along the bottom
  // of the screen, a fresh line every six seconds of play.
  const TICKER_LINES = [
    'SOLMAR WIRE — SBPD: "Report suspicious vans. Reward $150."',
    'SOLMAR WIRE — Pier Ferris wheel reopens Friday. Free rides for crew.',
    'SOLMAR WIRE — Lucia Voss seen at the Grand Solmar. "Just visiting."',
    'SOLMAR WIRE — Street race at the pier tonight. SBPD will be watching.',
    'SOLMAR WIRE — Tip: hold Shift to sprint, Space to jump a fence.',
    'SOLMAR WIRE — The Gold Rush job pays $1,200. Ask Lucia at the pier.',
    'SOLMAR WIRE — Ferry to Isla Verde delayed again. Locals not surprised.',
    'SOLMAR WIRE — Respect opens doors: new guns at 250, 600, 1,200 RP.',
  ];
  let tickerIndex = 0;
  let tickerTimer = 6;
  const cache = {};
  // Diagnostics handle for headless tests (backdrop-guard timing).
  window.__hudCache = cache;
  const setText = (key, node, text) => {
    if (cache[key] !== text) {
      cache[key] = text;
      node.textContent = text;
    }
  };
  const setHtml = (key, node, html) => {
    if (cache[key] !== html) {
      cache[key] = html;
      node.innerHTML = html;
    }
  };

  function showMessage(text, seconds) {
    el.message.textContent = text;
    el.message.style.opacity = '1';
    messageTimer = seconds || 3;
  }
  function showGarageMessage(text) {
    if (el.garageMsg) el.garageMsg.textContent = text || '';
  }

  function paintMinimap() {
    const size = 180;
    const scale = size / (CITY.half * 2 + 40);
    const toMap = (x, z) => [size / 2 + x * scale, size / 2 + z * scale];
    mapCtx.clearRect(0, 0, size, size);
    mapCtx.fillStyle = '#274b2e';
    mapCtx.fillRect(0, 0, size, size);
    mapCtx.fillStyle = '#1e7fa8';
    const [, beachY] = toMap(0, CITY.beachZ);
    mapCtx.fillRect(0, beachY, size, size - beachY);
    mapCtx.fillStyle = '#e8cf9a';
    mapCtx.fillRect(0, beachY - 4, size, 4);
    mapCtx.strokeStyle = '#3a3f47';
    mapCtx.lineWidth = 5;
    for (const c of CITY.roads) {
      const [x1, y1] = toMap(c, -CITY.half);
      const [x2, y2] = toMap(c, CITY.half);
      mapCtx.beginPath();
      mapCtx.moveTo(x1, y1);
      mapCtx.lineTo(x2, y2);
      mapCtx.stroke();
      const [x3, y3] = toMap(-CITY.half, c);
      const [x4, y4] = toMap(CITY.half, c);
      mapCtx.beginPath();
      mapCtx.moveTo(x3, y3);
      mapCtx.lineTo(x4, y4);
      mapCtx.stroke();
    }
    mapCtx.fillStyle = '#8a8f98';
    for (const col of state.colliders) {
      const [x, y] = toMap(col.x0, col.z0);
      mapCtx.fillRect(x, y, (col.x1 - col.x0) * scale, (col.z1 - col.z0) * scale);
    }
    // Heat glow: the hotter Rico's current district, the wider the red
    // haze around him on the map.
    const heat = state.districtHeat[districtAt(state.player.x, state.player.z).name] || 0;
    if (heat > 0) {
      const [hx, hy] = toMap(state.player.x, state.player.z);
      mapCtx.fillStyle = 'rgba(255, 68, 68, ' + Math.min(0.35, heat / 300) + ')';
      mapCtx.beginPath();
      mapCtx.arc(hx, hy, 8 + heat * 0.25, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Police search zone (Eyes Out reveal) — a red dashed ring around Rico.
    if (state.player.eyesTimer > 0) {
      const [px, py] = toMap(state.player.x, state.player.z);
      mapCtx.strokeStyle = '#ff4444';
      mapCtx.lineWidth = 2;
      mapCtx.setLineDash([4, 4]);
      mapCtx.beginPath();
      mapCtx.arc(px, py, 60 * scale, 0, Math.PI * 2);
      mapCtx.stroke();
      mapCtx.setLineDash([]);
    }
    // Mission beacon.
    const target = stepTarget(state);
    if (target) {
      const [x, y] = toMap(target.x, target.z);
      mapCtx.fillStyle = '#ffd76e';
      mapCtx.beginPath();
      mapCtx.arc(x, y, 5, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.strokeStyle = '#ffd76e';
      mapCtx.lineWidth = 2;
      mapCtx.beginPath();
      mapCtx.arc(x, y, 9, 0, Math.PI * 2);
      mapCtx.stroke();
    }
    // Cars, police (red), roadblocks (orange), courier target (white ring).
    for (const car of state.cars) {
      if (car.kind === 'player') continue;
      const [x, y] = toMap(car.x, car.z);
      if (car === state.targetCar) {
        mapCtx.strokeStyle = '#fff';
        mapCtx.lineWidth = 2;
        mapCtx.beginPath();
        mapCtx.arc(x, y, 5, 0, Math.PI * 2);
        mapCtx.stroke();
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
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
    mapCtx.fillStyle = '#fff';
    mapCtx.font = 'bold 11px system-ui, sans-serif';
    mapCtx.fillText('N', 6, 14);
  }

  // Cash, health, respect rank, wanted stars and the clock.
  function refreshVitals(rico) {
    setText('cash', el.cash, `$${rico.cash.toLocaleString('en-US')}`);
    el.healthFill.style.width = `${Math.max(0, rico.health)}%`;
    setText('hp', el.healthText, `HP ${Math.ceil(Math.max(0, rico.health))}`);
    const {rank, next} = rankFor(rico.rp || 0);
    setText('rank', el.respectName, `RANK · ${rank.name}`);
    const span = next ? next.rp - rank.rp : 100;
    const prog = next ? Math.min(100, ((rico.rp - rank.rp) / span) * 100) : 100;
    el.respectFill.style.width = `${prog}%`;
    setText('rp', el.respectText, next
      ? `${rico.rp.toLocaleString('en-US')} / ${next.rp.toLocaleString('en-US')} RP`
      : `${rico.rp.toLocaleString('en-US')} RP — max rank`);
    setText('stars', el.stars, '★'.repeat(rico.wanted) + '☆'.repeat(WANTED.maxStars - rico.wanted));
    el.stars.style.color = rico.wanted > 0 ? '#ffcf3d' : 'rgba(255,255,255,0.35)';
    setText('clock', el.clock, clockText(state.clockMinutes));
  }

  // Weapon slots: owned weapons show ammo, locked ones show the RP gate.
  function refreshWeapons(rico) {
    const html = rico.weapons.map((w, i) => {
      const cls = `slot${i === rico.weaponIndex ? ' current' : ''}${w.owned ? '' : ' locked'}`;
      const ammo = !w.owned ? `LOCKED · ${w.unlockRp} RP` : (w.id === 'fists' ? '∞' : `${w.mag} / ${w.ammo}`);
      return `<div class="${cls}"><span>${i + 1} ${w.short}</span><span class="ammo">${ammo}</span></div>`;
    }).join('');
    setHtml('weapons', el.weapons, html);
  }

  // Mission header: chapter, title, stage bar, objective, next step, timer.
  function refreshMissionHeader() {
    const mission = currentMission(state);
    if (!mission) {
      setText('mch', el.missionChapter, 'FREE ROAM');
      setText('mt', el.missionTitle, 'Solmar Bay is yours');
      el.missionStageFill.style.width = '100%';
      setText('mo', el.missionObjective, 'Cause chaos or enjoy the sunset.');
      setText('mn', el.missionNext, '');
      setText('mtimer', el.missionTimer, '');
      return;
    }
    setText('mch', el.missionChapter, `${mission.chapter} · MISSION ${state.missionIndex + 1}/${MISSIONS.length} · ${mission.giver}`);
    setText('mt', el.missionTitle, mission.title);
    const step = mission.steps[state.missionStep];
    el.missionStageFill.style.width = `${(state.missionStep / mission.steps.length) * 100}%`;
    setText('mo', el.missionObjective, objectiveLabel(state));
    setText('mn', el.missionNext, nextStepLabel(state));
    const timed = step && (step.kind === 'race' || step.kind === 'timed') && step.seconds;
    setText('mtimer', el.missionTimer, timed ? `⏱ ${timerText(state.missionTimer)}` : '');
  }

  // How close a unit is decides its tactic: ramming up close, pursuit
  // at mid range, responding from far away.
  const TACTICS = [[10, 'RAMMING'], [40, 'PURSUIT'], [Infinity, 'RESPONDING']];
  function tacticFor(distance) {
    return TACTICS.find(([limit]) => distance < limit)[1];
  }

  // Dispatch panel: real police units with distance + tactic.
  function refreshDispatch(rico) {
    const police = state.cars.filter((c) => c.kind === 'police' && !c.disabled);
    const totalUnits = police.length + (state.heli.active ? 1 : 0);
    const rows = [];
    if (state.heli.active) {
      const d = Math.round(Math.hypot(state.heli.x - rico.x, state.heli.z - rico.z));
      rows.push(`<div class="unit"><span>AIR ONE</span><span>${d} m</span><span class="tactic">SPOTLIGHT</span></div>`);
    }
    for (const car of police) {
      const d = Math.round(Math.hypot(car.x - rico.x, car.z - rico.z));
      const tactic = car.roadblock ? 'ROADBLOCK' : tacticFor(d);
      rows.push(`<div class="unit"><span>${unitName(car)}</span><span>${d} m</span><span class="tactic">${tactic}</span></div>`);
    }
    setText('dtitle', el.dispatchTitle, rico.wanted > 0
      ? `SBPD DISPATCH — ${totalUnits} UNIT${totalUnits === 1 ? '' : 'S'} · ${rico.wanted}★`
      : 'SBPD DISPATCH — CLEAR');
    setHtml('drows', el.dispatchRows, rows.length
      ? rows.join('')
      : '<div class="unit"><span>No units on you.</span><span></span><span></span></div>');
  }

  // Crew abilities with live cooldowns, and the district + heat readout.
  function refreshCrewAndDistrict(rico) {
    const crewHtml = CREW.map((c) => {
      const cd = rico.crew[c.id] || 0;
      return `<div class="ability"><span><b>${c.key}</b> ${c.name} — ${c.who}</span><span class="cd">${cd > 0 ? Math.ceil(cd) + 's' : 'READY'}</span></div>`;
    }).join('');
    setHtml('crew', el.crewRows, crewHtml);
    const d = districtAt(rico.x, rico.z);
    const heat = state.districtHeat[d.name] || 0;
    setText('dn', el.districtName, d.name);
    setText('dr', el.districtRoad, d.road);
    setText('dh', el.districtHeat, `${heatLabel(heat)} · HEAT ${heat}`);
  }

  // Car identity + speed, the crosshair, and the radio line.
  function refreshCarAndRadio(rico, screen) {
    if (rico.car) {
      setText('speed', el.speed, `${Math.round(Math.abs(rico.car.speed) * 3.6)} km/h`);
      setText('cname', el.carName, rico.car.name || 'STOLEN CAR');
      setText('ccond', el.carCond, `CONDITION ${Math.round(rico.car.condition ?? 100)}% · ${gearLabel(rico.car.speed)} · TUNE ${rico.garage.tune}`);
      el.crosshair.style.display = 'none';
    } else {
      setText('speed', el.speed, '');
      setText('cname', el.carName, '');
      setText('ccond', el.carCond, '');
      // No crosshair in staged screenshots — it is a gameplay aid, not a prop.
      el.crosshair.style.display = (screen === 'play' && !window.__isShot) ? 'block' : 'none';
    }
    const station = RADIO[rico.radioStation];
    const track = station.tracks[Math.floor(state.time / 45) % station.tracks.length];
    setText('radio', el.radioLine, `♪ ${station.name} — "${track}"`);
  }

  // Dialogue box, the transient message line, and the mission-complete flash.
  function refreshDialogueAndFlash(dt) {
    if (state.dialogue && state.dialogue.timer > 0) {
      el.dialogue.style.display = 'flex';
      setText('dport', el.dialoguePortrait, (state.dialogue.name || 'L')[0]);
      setText('dname', el.dialogueName, `${state.dialogue.name} · ${state.dialogue.role}`);
      setText('dtext', el.dialogueText, `“${state.dialogue.text}”`);
    } else {
      el.dialogue.style.display = 'none';
    }
    if (messageTimer > 0) {
      messageTimer -= dt;
      if (messageTimer <= 0) el.message.style.opacity = '0';
    }
    if (!state.missionFlash) {
      el.flash.style.display = 'none';
      return;
    }
    el.flash.style.display = 'block';
    setText('ft', el.flashTitle, state.missionFlash.title);
    setText('fr', el.flashReward, `+$${state.missionFlash.reward}`);
    state.missionFlash.timer -= dt;
    if (state.missionFlash.timer <= 0) {
      state.missionFlash = null;
      el.flash.style.display = 'none';
    }
  }

  // The news ticker along the bottom, turning over every six seconds.
  function refreshTicker(dt) {
    if (!el.ticker) return;
    tickerTimer -= dt;
    if (tickerTimer > 0) return;
    tickerTimer = 6;
    tickerIndex = (tickerIndex + 1) % TICKER_LINES.length;
    setText('ticker', el.ticker, TICKER_LINES[tickerIndex]);
  }

  // Lifetime numbers on the pause screen, from state.stats.
  function refreshPauseStats() {
    if (!el.pauseStats || !state.stats) return;
    const s = state.stats;
    const minutes = Math.floor(s.timePlayed / 60);
    const seconds = Math.floor(s.timePlayed % 60).toString().padStart(2, '0');
    setHtml('pstats', el.pauseStats,
      '<div>Jobs done: ' + s.missionsDone + ' / ' + MISSIONS.length + '</div>' +
      '<div>Cash earned: $' + s.cashEarned.toLocaleString('en-US') + ' · Respect earned: ' + s.rpEarned + ' RP</div>' +
      '<div>Distance: ' + s.distanceKm.toFixed(1) + ' km · Time: ' + minutes + ':' + seconds + '</div>' +
      '<div>Shots fired: ' + s.shotsFired + ' · Cruisers wrecked: ' + s.copsWrecked + ' · Pedestrians down: ' + s.pedsDown + '</div>');
  }

  function refreshScreens(dt, screen) {
    const rico = state.player;
    // Minimap at 10 Hz — full-rate 2D painting is wasted work. Always draw
    // once, so screenshot staging (dt = 0) still paints it.
    mapTimer += dt;
    if (mapTimer > 0.1 || !cache.mapDrawn) {
      mapTimer = 0;
      cache.mapDrawn = true;
      paintMinimap();
    }
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
    for (const [name, node] of Object.entries(el.screens)) {
      if (node) node.style.display = name === shown ? 'flex' : 'none';
    }
    if (state.garageOpen) {
      const g = rico.garage;
      setHtml('glist', el.garageList,
        `<div>Cash: $${rico.cash.toLocaleString('en-US')}</div>` +
        `<div>Engine tune: level ${g.tune} / 3 — top speed +${g.tune * 12}%</div>` +
        `<div>Armour: level ${g.armor} / 2 — ram damage −${g.armor * 25}%</div>` +
        `<div>Car: ${rico.car ? `${rico.car.name || 'car'} — condition ${Math.round(rico.car.condition ?? 100)}%` : 'no car with you'}</div>` +
        `<div>Weapon: ${rico.weapons[rico.weaponIndex].name} — ${rico.weapons[rico.weaponIndex].mag} in mag, ${rico.weapons[rico.weaponIndex].ammo} reserve</div>`);
    }
    if (state.missionsOpen) {
      const list = MISSIONS.map((m, i) => {
        const cls = i < state.missionIndex ? 'done' : (i === state.missionIndex ? 'current' : 'locked');
        const mark = i < state.missionIndex ? '✓' : (i === state.missionIndex ? '▶' : '·');
        return `<div class="${cls}">${mark} ${i + 1}. ${m.title} — ${m.giver} · $${m.reward} · ${m.rp} RP</div>`;
      }).join('');
      setHtml('mlist', el.missionsList, list);
    }
    if (screen === 'title') {
      setText('tcash', el.titleCash, `$${rico.cash.toLocaleString('en-US')}`);
      const m = currentMission(state);
      setText('tmiss', el.titleMission, m ? `Next job: ${m.title}` : 'Story complete — free roam');
      const best = loadBest();
      setText('tbest', el.titleBest, best && (best.cash > 0 || best.missions > 0)
        ? `Best run: $${best.cash.toLocaleString('en-US')} · ${best.missions} / ${MISSIONS.length} jobs`
        : '');
    }
    if (screen === 'pause') refreshPauseStats();
    if (screen === 'complete') {
      setText('fcash', el.finalCash, `$${rico.cash.toLocaleString('en-US')}`);
      setText('fmiss', el.finalMissions, `${state.missionIndex} / ${MISSIONS.length} jobs done`);
    }
  }

  function update(dt, screen) {
    const rico = state.player;
    // The in-game HUD only exists during play; menus get a clean frame.
    el.hud.style.display = screen === 'play' ? 'block' : 'none';
    // The keyboard hint is a play aid, not a screenshot prop.
    if (el.controls) el.controls.style.display = window.__isShot ? 'none' : '';
    refreshVitals(rico);
    refreshWeapons(rico);
    refreshMissionHeader();
    refreshDispatch(rico);
    refreshCrewAndDistrict(rico);
    refreshCarAndRadio(rico, screen);
    refreshDialogueAndFlash(dt);
    refreshTicker(dt);
    refreshScreens(dt, screen);
  }

  // Wire the menu buttons.
  const bind = (id, fn) => {
    const node = $(id);
    if (node) node.addEventListener('click', fn);
  };
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
    const node = $(id);
    if (node) {
      node.addEventListener('click', (event) => {
        if (event.target === node && performance.now() - (cache.shownAt || 0) > 1500) fn();
      });
    }
  };
  backdrop('screen-garage', () => callbacks.onGarageClose());
  backdrop('screen-missions', () => callbacks.onMissionsClose());
  for (const btn of document.querySelectorAll('[data-garage]')) {
    btn.addEventListener('click', () => callbacks.onGarageBuy(btn.getAttribute('data-garage')));
  }

  return {update, showMessage, showGarageMessage};
}
