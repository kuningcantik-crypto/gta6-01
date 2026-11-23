// The job board in code: which contract Rico is running, which stage
// of it, where the beacon should point, and what the HUD ought to
// print. This module only reads state and nudges the job counters —
// it never paints anything and never reads the keyboard.
import { MISSIONS } from './config.js';

// The contract Rico is currently running, or nothing once the story ends.
export function currentMission(state) {
  const job = MISSIONS[state.missionIndex];
  return job === undefined ? null : job;
}

// The stage of that contract Rico is on right now.
export function currentStep(state) {
  const job = currentMission(state);
  if (job === null) return null;
  const stage = job.steps[state.missionStep];
  return stage === undefined ? null : stage;
}

function itemAt(list, index) {
  const items = list || [];
  const item = items[index || 0];
  return item === undefined ? null : item;
}

// Target rules for the legs that need special handling; every other
// kind points at its own position.
const TARGET_RULES = {
  collect(state, stage) {
    const spot = itemAt(stage.spots, state.missionCollected);
    return spot === null ? null : {x: spot.x, z: spot.z, label: stage.label};
  },
  race(state, stage) {
    const gate = itemAt(stage.checkpoints, state.raceIndex);
    return gate === null ? null : {x: gate.x, z: gate.z, label: stage.label};
  },
  ram(state, stage) {
    if (!state.targetCar) return null;
    return {x: state.targetCar.x, z: state.targetCar.z, label: stage.label};
  },
};

// Where the beacon should point for the stage in progress, or nothing
// when the stage has no place on the map. Collect legs point at the next
// uncollected spot, race legs at the next gate, ram legs follow the
// courier car, and every other kind points at its own position.
export function stepTarget(state) {
  const stage = currentStep(state);
  if (stage === null) return null;
  const rule = TARGET_RULES[stage.kind];
  if (rule) return rule(state, stage);
  if (!stage.pos) return null;
  return {x: stage.pos.x, z: stage.pos.z, label: stage.label};
}

// Live progress text for the counted stage kinds; other legs just show
// their own label.
function legProgress(state, stage) {
  switch (stage.kind) {
    case 'collect': {
      const done = state.missionCollected || 0;
      return stage.label.replace(/\(\d+\/\d+\)/, '(' + done + '/' + stage.count + ')');
    }
    case 'race': {
      const total = (stage.checkpoints || []).length;
      const done = state.raceIndex || 0;
      return 'Race the Neon circuit (' + done + '/' + total + ' gates)';
    }
    case 'eliminate': {
      const done = state.eliminated || 0;
      return 'Disable police cars (' + done + '/' + stage.count + ')';
    }
    default:
      return stage.label;
  }
}

// The objective line the HUD shows for the stage in progress.
export function objectiveLabel(state) {
  const job = currentMission(state);
  const stage = currentStep(state);
  if (job === null || stage === null) {
    return 'Solmar Bay is yours. Free roam — cause chaos or enjoy the sunset.';
  }
  return job.title + ': ' + legProgress(state, stage);
}

// The stage after this one, for the HUD's NEXT line.
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

function clearLegCounters(state) {
  state.missionCollected = 0;
  state.missionHold = 0;
  state.raceIndex = 0;
  state.eliminated = 0;
}

// Called when a stage (re)starts: per-stage counters and the clock reset.
export function startStep(state) {
  const stage = currentStep(state);
  clearLegCounters(state);
  state.missionTimer = stage !== null && stage.seconds ? stage.seconds : 0;
  if (stage !== null && stage.kind === 'ram') state.targetCar = null;
  if (stage !== null && stage.wantedOnStart) {
    state.player.wanted = Math.max(state.player.wanted, stage.wantedOnStart);
    state.player.crimeTimer = 0;
  }
  const job = currentMission(state);
  if (job !== null && job.dialogue && state.missionStep === 0) {
    sayLine(state, job.dialogue[0], job.giver, 'Fixer');
  }
}

function bankReward(state, job) {
  const rpGain = job.rp || job.reward;
  state.player.cash += job.reward;
  state.player.rp = (state.player.rp || 0) + rpGain;
  if (state.stats) {
    state.stats.missionsDone += 1;
    state.stats.cashEarned += job.reward;
    state.stats.rpEarned += rpGain;
  }
}

// Close out a finished job: pay up, move to the next contract, and
// flash the result. Returns 'mission', or 'done' when the story ends.
function finishJob(state, job) {
  bankReward(state, job);
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

// Move the job machine one stage on. Returns 'step' when a stage
// completes, 'mission' when a whole job completes, 'done' when the
// story ends.
export function advanceMission(state) {
  const job = currentMission(state);
  if (job === null) return null;
  state.missionStep += 1;
  clearLegCounters(state);
  if (state.missionStep < job.steps.length) {
    startStep(state);
    return 'step';
  }
  return finishJob(state, job);
}
