// The job board in code: which contract Rico is running, which leg of
// it, where the beacon should point, and what the HUD ought to print.
// This module only ever reads state and nudges the job counters — it
// never paints anything and never reads the keyboard.
import { MISSIONS } from './config.js';

// The contract Rico is currently running, or nothing once the story ends.
export function currentMission(state) {
  const job = MISSIONS[state.missionIndex];
  return job === undefined ? null : job;
}

// The leg of that contract Rico is on right now.
export function currentStep(state) {
  const job = currentMission(state);
  if (job === null) return null;
  const leg = job.steps[state.missionStep];
  return leg === undefined ? null : leg;
}

function nthItem(list, index) {
  const items = list || [];
  const item = items[index || 0];
  return item === undefined ? null : item;
}

// Where the beacon should point for the leg in progress, or nothing
// when the leg has no place on the map. Collect legs point at the next
// uncollected spot, race legs at the next gate, ram legs follow the
// courier car, and every other kind points at its own position.
const TARGET_FOR = {
  collect(state, leg) {
    const spot = nthItem(leg.spots, state.missionCollected);
    return spot === null ? null : {x: spot.x, z: spot.z, label: leg.label};
  },
  race(state, leg) {
    const gate = nthItem(leg.checkpoints, state.raceIndex);
    return gate === null ? null : {x: gate.x, z: gate.z, label: leg.label};
  },
  ram(state, leg) {
    if (!state.targetCar) return null;
    return {x: state.targetCar.x, z: state.targetCar.z, label: leg.label};
  },
};

export function stepTarget(state) {
  const leg = currentStep(state);
  if (leg === null) return null;
  const resolve = TARGET_FOR[leg.kind];
  if (resolve) return resolve(state, leg);
  if (!leg.pos) return null;
  return {x: leg.pos.x, z: leg.pos.z, label: leg.label};
}

function progressText(state, leg) {
  if (leg.kind === 'collect') {
    const total = leg.count;
    const done = state.missionCollected || 0;
    return leg.label.replace(/\(\d+\/\d+\)/, '(' + done + '/' + total + ')');
  }
  if (leg.kind === 'race') {
    const total = (leg.checkpoints || []).length;
    const done = state.raceIndex || 0;
    return 'Race the Neon circuit (' + done + '/' + total + ' gates)';
  }
  if (leg.kind === 'eliminate') {
    const done = state.eliminated || 0;
    return 'Disable police cars (' + done + '/' + leg.count + ')';
  }
  return leg.label;
}

// The objective line the HUD shows for the leg in progress. Counted
// legs (collect, race, eliminate) show live progress; the rest show the
// leg's own label.
export function objectiveLabel(state) {
  const job = currentMission(state);
  const leg = currentStep(state);
  if (job === null || leg === null) {
    return 'Solmar Bay is yours. Free roam — cause chaos or enjoy the sunset.';
  }
  return job.title + ': ' + progressText(state, leg);
}

// The leg after this one, for the HUD's NEXT line.
export function nextStepLabel(state) {
  const job = currentMission(state);
  if (job === null) return 'Free roam';
  const following = job.steps[state.missionStep + 1];
  if (following !== undefined) return 'NEXT: ' + following.label;
  const nextJob = MISSIONS[state.missionIndex + 1];
  if (nextJob !== undefined) return 'NEXT JOB: ' + nextJob.title + ' — ' + nextJob.giver;
  return 'NEXT: Own the city';
}

// Queue a giver's line for the HUD dialogue box.
export function sayLine(state, text, name, role) {
  state.dialogue = {name: name || 'Lucia', role: role || 'Fixer', text, timer: 7};
}

function zeroLegCounters(state) {
  state.missionCollected = 0;
  state.missionHold = 0;
  state.raceIndex = 0;
  state.eliminated = 0;
}

// Called when a leg (re)starts: per-leg counters and the clock reset.
export function startStep(state) {
  const leg = currentStep(state);
  zeroLegCounters(state);
  state.missionTimer = leg !== null && leg.seconds ? leg.seconds : 0;
  if (leg !== null && leg.kind === 'ram') state.targetCar = null;
  if (leg !== null && leg.wantedOnStart) {
    state.player.wanted = Math.max(state.player.wanted, leg.wantedOnStart);
    state.player.crimeTimer = 0;
  }
  const job = currentMission(state);
  if (job !== null && job.dialogue && state.missionStep === 0) {
    sayLine(state, job.dialogue[0], job.giver, 'Fixer');
  }
}

function payOut(state, job) {
  const rpGain = job.rp || job.reward;
  state.player.cash += job.reward;
  state.player.rp = (state.player.rp || 0) + rpGain;
  if (state.stats) {
    state.stats.missionsDone += 1;
    state.stats.cashEarned += job.reward;
    state.stats.rpEarned += rpGain;
  }
}

// Move the job machine one leg on. Returns 'step' when a leg
// completes, 'mission' when a whole job completes, 'done' when the
// story ends.
export function advanceMission(state) {
  const job = currentMission(state);
  if (job === null) return null;
  state.missionStep += 1;
  zeroLegCounters(state);
  if (state.missionStep < job.steps.length) {
    startStep(state);
    return 'step';
  }
  payOut(state, job);
  state.missionIndex += 1;
  state.missionStep = 0;
  state.missionFlash = {title: job.title + ' — complete', reward: job.reward, timer: 4};
  state.targetCar = null;
  const next = MISSIONS[state.missionIndex];
  if (next !== undefined && next.dialogue) sayLine(state, next.dialogue[0], next.giver, 'Fixer');
  if (state.missionIndex >= MISSIONS.length) {
    state.player.cash += 1000;
    state.allMissionsDone = true;
    state.missionFlash = {title: 'You own Solmar Bay', reward: 1000, timer: 6};
    return 'done';
  }
  startStep(state);
  return 'mission';
}
