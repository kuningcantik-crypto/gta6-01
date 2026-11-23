// The HUD: cash, health, respect, wanted stars, mission header, dispatch
// traffic, crew cooldowns, district, minimap, radio, dialogue, ticker,
// stash and weather lines, FPS line, and every overlay (title, pause,
// wasted, busted, complete, garage, missions, settings). Nothing here
// touches the world — it only reads the state and paints DOM. Updates
// are cached so identical values never touch the DOM twice.
import { CITY, CREW, MISSIONS, RADIO, WEAPONS, districtAt, heatLabel, rankFor } from './config.js';
import { nearestTramStop, tramEta } from './tram.js';
import { nextStashHint, stashProgress } from './collectibles.js';
import { weatherLabel } from './weather.js';
import { loadBest, unitName } from './world.js';
//
// The DOM elements are fetched once, up front. If an element is missing
// the HUD degrades gracefully rather than crashing the game: a missing
// element simply never gets painted.
const ELEMENT_IDS = [
  ['cash', 'cash'], ['healthFill', 'health-fill'], ['healthText', 'health-text'],
  ['respectName', 'respect-name'], ['respectFill', 'respect-fill'], ['respectText', 'respect-text'],
  ['dispatchTitle', 'dispatch-title'], ['dispatchRows', 'dispatch-rows'],
  ['crewRows', 'crew-rows'], ['stars', 'stars'], ['clock', 'clock'],
  ['weapons', 'weapons'], ['missionChapter', 'mission-chapter'],
  ['missionTitle', 'mission-title'], ['stageFill', 'mission-stage-fill'],
  ['missionObjective', 'mission-objective'], ['missionNext', 'mission-next'],
  ['missionTimer', 'mission-timer'], ['districtName', 'district-name'],
  ['districtRoad', 'district-road'], ['districtHeat', 'district-heat'],
  ['carName', 'car-name'], ['carCond', 'car-cond'], ['speed', 'speed'],
  ['radioLine', 'radio-line'], ['dialogue', 'dialogue'],
  ['dialoguePortrait', 'dialogue-portrait'], ['dialogueName', 'dialogue-name'],
  ['dialogueText', 'dialogue-text'], ['message', 'message'],
  ['minimap', 'minimap'], ['crosshair', 'crosshair'], ['ticker', 'ticker'],
  ['pauseStats', 'pause-stats'], ['stashLine', 'stash-line'],
  ['weatherChip', 'weather-chip'], ['tramLine', 'tram-line'], ['fpsLine', 'fps-line'],
  ['settingsRows', 'settings-rows'],
  ['flash', 'flash'], ['flashTitle', 'flash-title'], ['flashReward', 'flash-reward'],
  ['titleCash', 'title-cash'], ['titleMission', 'title-mission'],
  ['titleBest', 'title-best'], ['finalCash', 'final-cash'],
  ['finalMissions', 'final-missions'], ['garageList', 'garage-list'],
  ['garageMsg', 'garage-msg'], ['missionsList', 'missions-list'],
  ['photoHint', 'photo-hint'],
];
const SCREEN_IDS = [
  ['title', 'screen-title'], ['pause', 'screen-pause'],
  ['wasted', 'screen-wasted'], ['busted', 'screen-busted'],
  ['complete', 'screen-complete'], ['garage', 'screen-garage'],
  ['missions', 'screen-missions'], ['settings', 'screen-settings'],
];
const BUTTON_IDS = [
  ['new', 'btn-new'], ['continue', 'btn-continue'],
  ['resume', 'btn-resume'], ['restart', 'btn-restart'],
  ['title', 'btn-title'], ['free', 'btn-free'],
  ['garageClose', 'btn-garage-close'],
  ['missionsClose', 'btn-missions-close'],
  ['settingsClose', 'btn-settings-close'],
];

const DAYS = ['FRI', 'SAT', 'SUN'];

function hudTimeText(minutes) {
  const dayIndex = Math.floor(minutes / (24 * 60)) % DAYS.length;
  const hh = Math.floor(minutes / 60) % 24;
  const mm = Math.floor(minutes % 60);
  return `${DAYS[dayIndex]} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function padMoney(n) {
  return `$${n.toLocaleString('en-US')}`;
}

function secondsText(s) {
  const seconds = Math.max(0, Math.ceil(s));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function gearLabel(speed) {
  if (speed <= 0.5) return 'N';
  return `G${Math.min(5, Math.floor(speed / 6) + 1)}`;
}

function starLine(stars) {
  let line = '';
  for (let i = 0; i < 5; i += 1) line += i < stars ? '★' : '☆';
  return line;
}

function radioLineText(station, time) {
  const track = station.tracks[Math.floor(time / 45) % station.tracks.length];
  return `♪ ${station.name} — "${track}"`;
}

function starsInZone(state) {
  return state.player.wanted > 0;
}

// The SBPD dispatch band: how many units are out, what they're doing,
// and how hot the search is. The band depends on the wanted level: the
// first two bands keep three units circling the player's district, while
// 3+ stars bring in Air One and the roadblock units.
function tacticFor(wanted) {
  if (wanted < 2) return 'RESPONDING';
  if (wanted < 3) return 'PURSUIT';
  return 'RAMMING';
}

function dispatchLines(state) {
  const wanted = state.player.wanted;
  const heliUp = wanted >= 3 && state.heli && state.heli.active;
  const lines = [];
  if (heliUp) lines.push(`AIR ONE · ON STATION · ${tacticFor(wanted)}`);
  const cruisers = state.cars.filter((c) => c.kind === 'police');
  const chasing = cruisers.filter((p) => p.state !== 'search');
  const searching = cruisers.filter((p) => p.state === 'search');
  for (const unit of chasing) {
    lines.push(`${unitName(unit)} · ${tacticFor(wanted)} · ${Math.round(Math.hypot(unit.x - state.player.x, unit.z - state.player.z))}m`);
  }
  for (const unit of searching) {
    lines.push(`${unitName(unit)} · SEARCHING · ${Math.round(Math.hypot(unit.x - state.player.x, unit.z - state.player.z))}m`);
  }
  while (lines.length < 3) lines.push('SBPD · PATROL · CITYWIDE');
  return lines.slice(0, 4);
}

// The wire: rolling news items, one every 6 s. Written as one text
// block and split, so the rotation is one editable list.
const WIRE_TEXT = [
  'SOLMAR WIRE — SBPD: "Report suspicious vans. Reward $150."',
  'SOLMAR WIRE — Pier Ferris wheel reopens Friday. Free rides for crew.',
  'SOLMAR WIRE — Lucia Voss seen at the Grand Solmar. "Just visiting."',
  'SOLMAR WIRE — Street race at the pier tonight. SBPD will be watching.',
  'SOLMAR WIRE — Tip: hold Shift to sprint, Space to jump a fence.',
  'SOLMAR WIRE — The Gold Rush job pays $1,200. Ask Lucia at the pier.',
  'SOLMAR WIRE — Ferry to Isla Verde delayed again. Locals not surprised.',
  'SOLMAR WIRE — Respect opens doors: new guns at 250, 600, 1,200 RP.',
].join('\n');
const WIRE_LINES = WIRE_TEXT.split('\n');

export function createHud(state, callbacks) {
  const elements = {};
  for (const [key, id] of ELEMENT_IDS) elements[key] = document.getElementById(id);
  const screens = {};
  for (const [key, id] of SCREEN_IDS) screens[key] = document.getElementById(id);
  const buttons = {};
  for (const [key, id] of BUTTON_IDS) buttons[key] = document.getElementById(id);

  // The canvas for the minimap. On a small screen its width is read from
  // the attribute, not the element's rendered size.
  const map = elements.minimap;
  const mapCtx = map !== null ? map.getContext('2d') : null;

  const cache = {};
  let currentScreen = null;
  let lastScreenChange = 0;
  let wireIndex = 0;
  let wireTimer = 0;
  let msgTimer = null;
  let garageMsgTimer = null;
  let prevSettings = null;
  let liveSettings = null;
  let frame = 0;
  let fpsTimer = 0;

  // Text setters write through a cache: a value that didn't change costs
  // nothing, so update() is cheap even at 60 fps.
  function setText(key, node, text) {
    if (node === null) return;
    if (cache[key] === text) return;
    cache[key] = text;
    node.textContent = text;
  }

  function setHtml(key, node, html) {
    if (node === null) return;
    if (cache[key] === html) return;
    cache[key] = html;
    node.innerHTML = html;
  }

  function paintVitals(time) {
    const player = state.player;
    setText('cash', elements.cash, padMoney(player.cash));
    const hp = Math.max(0, Math.round(player.health));
    setText('healthText', elements.healthText, `HP ${hp}`);
    if (elements.healthFill !== null) {
      const width = `${player.health}%`;
      if (cache.healthWidth !== width) {
        cache.healthWidth = width;
        elements.healthFill.style.width = width;
      }
    }
    const rank = rankFor(player.rp);
    setText('respectName', elements.respectName, `RANK · ${rank.rank.name}`);
    if (elements.respectFill !== null) {
      const filled = rank.next ? ((player.rp - rank.rank.rp) / (rank.next.rp - rank.rank.rp)) * 100 : 100;
      const width = `${Math.min(100, Math.max(0, filled))}%`;
      if (cache.respectWidth !== width) {
        cache.respectWidth = width;
        elements.respectFill.style.width = width;
      }
    }
    setText('respectText', elements.respectText, rank.next ? `${player.rp} / ${rank.next.rp} RP` : `${player.rp} RP`);
    setText('clock', elements.clock, hudTimeText(state.clockMinutes));
    setText('stars', elements.stars, starLine(player.wanted));
    if (elements.weapons !== null) {
      const parts = [];
      for (let i = 0; i < WEAPONS.length; i += 1) {
        const w = WEAPONS[i];
        if (i === 0 || player.rp >= w.unlockRp) {
          parts.push(`<span class="${i === player.weaponIndex ? 'active' : ''}">${i + 1}. ${w.short}</span>`);
        }
      }
      setHtml('weapons', elements.weapons, parts.join(' '));
    }
  }

  function paintMission(time) {
    const job = MISSIONS[Math.min(state.missionIndex, MISSIONS.length - 1)];
    const mission = state.missionIndex >= MISSIONS.length ? null : job;
    setText('missionChapter', elements.missionChapter, mission ? mission.chapter : 'SOLMAR');
    setText('missionTitle', elements.missionTitle, mission ? mission.title : 'ALL MISSIONS DONE');
    const step = mission ? mission.steps[Math.min(state.missionStep, mission.steps.length - 1)] : null;
    setText('missionObjective', elements.missionObjective, step ? step.label : '—');
    const nextStep = mission && state.missionStep + 1 < mission.steps.length ? mission.steps[state.missionStep + 1] : null;
    setText('missionNext', elements.missionNext, nextStep ? `Next: ${nextStep.label}` : '');
    if (mission !== null && elements.stageFill !== null) {
      const width = `${(state.missionStep / mission.steps.length) * 100}%`;
      if (cache.stageWidth !== width) {
        cache.stageWidth = width;
        elements.stageFill.style.width = width;
      }
    }
    const remaining = state.missionTimer > 0 ? state.missionTimer : null;
    setText('missionTimer', elements.missionTimer, remaining === null ? '' : secondsText(remaining));
  }

  function paintDispatchCrew(time) {
    setHtml('dispatchRows', elements.dispatchRows, dispatchLines(state)
      .map((line) => `<div class="dispatch-row">${line}</div>`).join(''));
    if (elements.dispatchTitle !== null) {
      const title = starsInZone(state) ? 'SBPD DISPATCH — HOT' : 'SBPD DISPATCH';
      setText('dispatchTitle', elements.dispatchTitle, title);
    }
    if (elements.crewRows !== null) {
      const rows = CREW.map((member) => {
        const cd = (state.player.crew && state.player.crew[member.id]) || 0;
        const status = cd <= 0 ? 'READY' : `${Math.ceil(cd)}s`;
        return `<div class="crew-row"><span class="crew-key">${member.key}</span><span class="crew-name">${member.name}</span><span class="crew-who">${member.who}</span><span class="crew-cd">${status}</span></div>`;
      });
      setHtml('crewRows', elements.crewRows, rows.join(''));
    }
  }

  function paintCityLife(time) {
    const player = state.player;
    const district = districtAt(player.x, player.z);
    setText('districtName', elements.districtName, district.name);
    setText('districtRoad', elements.districtRoad, district.road);
    const heat = state.districtHeat ? state.districtHeat[district.name] || 0 : 0;
    setText('districtHeat', elements.districtHeat, `HEAT ${heatLabel(heat)}`);
    setText('weatherChip', elements.weatherChip, `${weatherLabel(state.weather)} ${Math.round(state.clockMinutes / 60) % 24}:00`);
    setText('tramLine', elements.tramLine, `TRAM ${nearestTramStop(player.x, player.z).name} · ${tramEta(state.tram, 0)}s`);
  }

  function paintCarRadio(time) {
    if (state.player.car !== null && state.player.car !== undefined) {
      const car = state.player.car;
      const name = state.player.carName || 'RUKAN PELO GT';
      setText('carName', elements.carName, `${name} — ${gearLabel(Math.abs(car.speed))}`);
      setText('carCond', elements.carCond, `COND ${Math.round(car.cond || 100)}%`);
      setText('speed', elements.speed, `${Math.round(Math.abs(car.speed) * 3.6)}`);
    } else {
      setText('carName', elements.carName, 'ON FOOT');
      setText('carCond', elements.carCond, 'PRESS E TO ENTER');
      setText('speed', elements.speed, `${Math.round(state.player.speed || 0)}`);
    }
    setText('radioLine', elements.radioLine, radioLineText(RADIO[state.player.radioStation], state.time));
  }

  function paintDialogueFlash(time) {
    const dialogue = state.dialogue;
    if (dialogue !== null && dialogue !== undefined && dialogue.timer > 0) {
      setText('dialoguePortrait', elements.dialoguePortrait, dialogue.name[0]);
      setText('dialogueName', elements.dialogueName, `${dialogue.name} — ${dialogue.role}`);
      setText('dialogueText', elements.dialogueText, `“${dialogue.text}”`);
      if (elements.dialogue !== null) elements.dialogue.style.display = 'block';
    } else if (elements.dialogue !== null) {
      elements.dialogue.style.display = 'none';
    }
    const flash = state.missionFlash;
    if (flash !== null && flash !== undefined && flash.timer > 0) {
      setText('flashTitle', elements.flashTitle, flash.title);
      setText('flashReward', elements.flashReward, `+${padMoney(flash.reward)}`);
      if (elements.flash !== null) elements.flash.style.display = 'block';
    } else if (elements.flash !== null) {
      elements.flash.style.display = 'none';
    }
  }

  function paintTicker(time, dt) {
    wireTimer += dt;
    if (wireTimer >= 6) {
      wireTimer = 0;
      wireIndex = (wireIndex + 1) % WIRE_LINES.length;
    }
    setText('ticker', elements.ticker, WIRE_LINES[wireIndex]);
    if (state.stashes !== null && state.stashes !== undefined) {
      const hint = nextStashHint(state.stashes);
      setText('stashLine', elements.stashLine,
        hint === null ? `◆ STASHES ${stashProgress(state.stashes)} — all found!`
          : `◆ STASHES ${stashProgress(state.stashes)} — next: ${hint}`);
    }
    if (elements.fpsLine !== null) {
      const show = liveSettings !== null && liveSettings.showFps;
      if (show) {
        fpsTimer += dt;
        if (fpsTimer >= 0.5) {
          fpsTimer = 0;
          const fps = Math.round(1 / Math.max(0.001, dt));
          setText('fpsLine', elements.fpsLine, `FPS ${fps}`);
        }
        elements.fpsLine.style.display = 'block';
      } else {
        elements.fpsLine.style.display = 'none';
      }
    }
  }

  // The minimap: a fixed 180px frame, drawn at 10 Hz. The city is
  // squashed to the frame with a single scale, then every layer is
  // painted: the sand and the sea, the roads, the building blocks as
  // shadows, the tram line, the police and the helicopter, and finally
  // Rico as a small green arrow.
  function paintMinimap(time, dt) {
    if (mapCtx === null) return;
    if (liveSettings !== null && liveSettings.showMinimap === false) {
      map.style.display = 'none';
      return;
    }
    map.style.display = 'block';
    frame += 1;
    if (frame % 6 !== 0) return;
    const W = map.width;
    const H = map.height;
    const span = (CITY.half * 2 + 40) / 2;
    const scale = W / (span * 2);
    const toX = (x) => (x + span) * scale;
    const toZ = (z) => (z + span) * scale;
    mapCtx.clearRect(0, 0, W, H);
    mapCtx.fillStyle = '#1e4a3a';
    mapCtx.fillRect(0, 0, W, H);
    mapCtx.fillStyle = '#e8cf9a';
    mapCtx.fillRect(0, toZ(CITY.beachZ), W, H - toZ(CITY.beachZ));
    mapCtx.fillStyle = '#14586e';
    mapCtx.fillRect(0, toZ(CITY.oceanZ), W, H - toZ(CITY.oceanZ));
    mapCtx.fillStyle = '#3a3f47';
    for (const road of CITY.roads) {
      mapCtx.fillRect(toX(road - CITY.roadWidth / 2), 0, CITY.roadWidth * scale, H);
      mapCtx.fillRect(0, toZ(road - CITY.roadWidth / 2), W, CITY.roadWidth * scale);
    }
    mapCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    mapCtx.lineWidth = 1;
    for (const road of CITY.roads) {
      mapCtx.beginPath();
      mapCtx.moveTo(toX(road), 0);
      mapCtx.lineTo(toX(road), H);
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(0, toZ(road));
      mapCtx.lineTo(W, toZ(road));
      mapCtx.stroke();
    }
    if (state.player.eyesTimer > 0) {
      mapCtx.beginPath();
      mapCtx.arc(toX(state.player.x), toZ(state.player.z), 40 * scale, 0, Math.PI * 2);
      mapCtx.strokeStyle = '#f2c230';
      mapCtx.lineWidth = 2;
      mapCtx.stroke();
    }
    mapCtx.fillStyle = '#f2c230';
    for (const [x, z] of [[-156, 156], [156, 156]]) {
      mapCtx.beginPath();
      mapCtx.arc(toX(x), toZ(z), 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    for (const car of state.cars || []) {
      mapCtx.fillStyle = car.kind === 'police' ? '#ff4444' : car.kind === 'roadblock' ? '#ff9900' : '#cccccc';
      mapCtx.fillRect(toX(car.x) - 2, toZ(car.z) - 2, 4, 4);
    }
    if (state.heli && state.heli.active) {
      mapCtx.fillStyle = '#ffffff';
      mapCtx.font = 'bold 10px sans-serif';
      mapCtx.fillText('H', toX(state.heli.x) - 3, toZ(state.heli.z) + 3);
    }
    const px = toX(state.player.x);
    const pz = toZ(state.player.z);
    mapCtx.save();
    mapCtx.translate(px, pz);
    mapCtx.rotate(-state.player.angle);
    mapCtx.fillStyle = '#00ff66';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
    mapCtx.fillStyle = '#ffffff';
    mapCtx.font = 'bold 9px sans-serif';
    mapCtx.fillText('N', W - 10, 12);
  }

  // Which overlay is visible is decided here, every frame: the session
  // screen wins, unless a garage/jobs/settings overlay is open — those
  // sit on top of play. Switching screens also refreshes the garage
  // and job lists, so they never show stale prices or checkmarks.
  function paintScreens(screen) {
    const overlay = state.garageOpen ? 'garage'
      : state.missionsOpen ? 'missions'
      : state.settingsOpen ? 'settings'
      : screen;
    if (overlay !== currentScreen) {
      if (overlay === 'garage') refreshGarage();
      if (overlay === 'missions') refreshMissions();
      showScreen(overlay);
    }
    if (overlay === 'complete' || overlay === 'wasted') {
      if (elements.finalCash !== null) elements.finalCash.textContent = padMoney(state.player.cash);
      if (elements.finalMissions !== null) elements.finalMissions.textContent = `${state.missionIndex} / ${MISSIONS.length}`;
    }
    if (screen === 'title') {
      const best = loadBest();
      setText('titleCash', elements.titleCash, `CASH ${padMoney(state.player.cash)}`);
      setText('titleMission', elements.titleMission, state.missionIndex >= MISSIONS.length ? 'ALL MISSIONS DONE' : `NEXT: ${MISSIONS[state.missionIndex].title}`);
      setText('titleBest', elements.titleBest, best ? `BEST: ${padMoney(best.cash)} · ${best.missions} MISSIONS` : '');
    }
    if (screen === 'pause') {
      setText('pauseStats', elements.pauseStats, `CASH ${padMoney(state.player.cash)} · MISSIONS ${state.missionIndex} / ${MISSIONS.length} · RP ${state.player.rp}`);
    }
  }

  // An overlay becomes the only visible one; anything else hides.
  function showScreen(name) {
    currentScreen = name;
    lastScreenChange = performance.now();
    for (const key of Object.keys(screens)) {
      if (screens[key] === null) continue;
      screens[key].style.display = key === name ? 'flex' : 'none';
    }
  }

  // A click on the backdrop (not the panel) closes an overlay, but only
  // after it has been open for 1.5 s — so the click that opened it does
  // not close it again.
  function wireBackdrop(screen, close) {
    if (screen === null) return;
    screen.addEventListener('click', (event) => {
      if (event.target === screen && performance.now() - lastScreenChange > 1500) close();
    });
  }

  function wireButton(button, action) {
    if (button !== null) button.addEventListener('click', action);
  }

  function showMessage(text, ms = 3000) {
    if (elements.message === null) return;
    elements.message.textContent = text;
    elements.message.style.display = 'block';
    if (msgTimer !== null) clearTimeout(msgTimer);
    msgTimer = setTimeout(() => {
      elements.message.style.display = 'none';
    }, ms);
  }

  function showGarageMessage(text, ms = 3000) {
    if (elements.garageMsg === null) return;
    elements.garageMsg.textContent = text;
    elements.garageMsg.style.display = 'block';
    if (garageMsgTimer !== null) clearTimeout(garageMsgTimer);
    garageMsgTimer = setTimeout(() => {
      elements.garageMsg.style.display = 'none';
    }, ms);
  }

  function setSettings(settings) {
    const same = prevSettings !== null
      && prevSettings.quality === settings.quality
      && prevSettings.volume === settings.volume
      && prevSettings.invertCamera === settings.invertCamera
      && prevSettings.showFps === settings.showFps
      && prevSettings.weatherOn === settings.weatherOn
      && prevSettings.showMinimap === settings.showMinimap;
    if (same) return;
    prevSettings = {...settings};
    liveSettings = prevSettings;
    if (elements.settingsRows === null) return;
    const rows = [
      ['quality', 'GRAPHICS QUALITY', settings.quality.toUpperCase()],
      ['volume', 'VOLUME', `${Math.round(settings.volume * 100)}%`],
      ['weatherOn', 'WEATHER', settings.weatherOn ? 'ON' : 'OFF'],
      ['showMinimap', 'MINIMAP', settings.showMinimap ? 'ON' : 'OFF'],
      ['showFps', 'FPS COUNTER', settings.showFps ? 'ON' : 'OFF'],
      ['invertCamera', 'INVERT CAMERA', settings.invertCamera ? 'ON' : 'OFF'],
    ];
    elements.settingsRows.innerHTML = rows.map(([key, label, value]) =>
      `<div class="settings-row"><span>${label}</span><button data-setting="${key}">${value}</button></div>`).join('');
    elements.settingsRows.querySelectorAll('[data-setting]').forEach((button) => {
      button.addEventListener('click', () => callbacks.onSetting(button.dataset.setting));
    });
  }

  function setPhotoMode(on) {
    if (elements.photoHint !== null) elements.photoHint.style.display = on ? 'block' : 'none';
    document.body.classList.toggle('photo-mode', on);
  }

  // The garage and job lists are painted on demand, not every frame:
  // they only change when the player buys or finishes something.
  function refreshGarage() {
    if (elements.garageList === null) return;
    const player = state.player;
    const tune = player.tune || 0;
    const armor = player.armor || 0;
    const items = [
      ['repair', 'REPAIR CAR', '$100', player.car ? `${Math.round(player.car.cond || 100)}%` : '—'],
      ['tune', 'TUNE ENGINE', '$400', `LVL ${tune}/3 · +12% TOP SPEED`],
      ['armor', 'ADD ARMOR', '$300', `LVL ${armor}/2 · −25% DAMAGE`],
      ['ammo', 'BUY AMMO', '$80', `${player.ammo || 0} ROUNDS`],
    ];
    elements.garageList.innerHTML = items.map(([key, name, price, note]) =>
      `<div class="garage-row"><span>${name}</span><span>${note}</span><span>${price}</span><button data-garage="${key}">BUY</button></div>`).join('');
    elements.garageList.querySelectorAll('[data-garage]').forEach((button) => {
      button.addEventListener('click', () => callbacks.onGarageBuy(button.dataset.garage));
    });
  }

  function refreshMissions() {
    if (elements.missionsList === null) return;
    elements.missionsList.innerHTML = MISSIONS.map((job, i) => {
      const mark = i < state.missionIndex ? '✓' : i === state.missionIndex ? '▶' : '·';
      return `<div class="mission-row"><span>${mark} ${job.chapter} — ${job.title}</span><span>${padMoney(job.reward)} · ${job.rp} RP</span></div>`;
    }).join('');
  }

  wireButton(buttons.new, () => callbacks.onNewGame());
  wireButton(buttons.continue, () => callbacks.onContinue());
  wireButton(buttons.resume, () => callbacks.onResume());
  wireButton(buttons.restart, () => callbacks.onRestart());
  wireButton(buttons.title, () => callbacks.onTitle());
  wireButton(buttons.free, () => callbacks.onFreeRoam());
  wireButton(buttons.garageClose, () => callbacks.onGarageClose());
  wireButton(buttons.missionsClose, () => callbacks.onMissionsClose());
  wireButton(buttons.settingsClose, () => callbacks.onSettingsClose());
  // The four static garage buttons in the HTML (repair/tune/armor/ammo)
  // are wired once here; the rows refreshGarage builds get their own
  // listeners each time the list is rebuilt.
  document.querySelectorAll('#screen-garage [data-garage]').forEach((button) => {
    button.addEventListener('click', () => callbacks.onGarageBuy(button.dataset.garage));
  });
  wireBackdrop(screens.garage, () => callbacks.onGarageClose());
  wireBackdrop(screens.missions, () => callbacks.onMissionsClose());
  wireBackdrop(screens.settings, () => callbacks.onSettingsClose());
  wireBackdrop(screens.pause, () => callbacks.onResume());

  // The HUD caches painted values in window.__hudCache, so the smoke
  // tests can read what was last painted without querying the DOM.
  window.__hudCache = cache;

  return {
    update(dt, screen) {
      paintVitals(state.time);
      paintMission(state.time);
      paintDispatchCrew(state.time);
      paintCityLife(state.time);
      paintCarRadio(state.time);
      paintDialogueFlash(state.time);
      paintTicker(state.time, dt);
      paintMinimap(state.time, dt);
      paintScreens(screen);
    },
    showMessage,
    showGarageMessage,
    setSettings,
    setPhotoMode,
    showScreen,
    refreshGarage,
    refreshMissions,
  };
}
