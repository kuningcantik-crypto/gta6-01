// The mission machine: which mission Rico is on, which step of it, where the
// beacon should point, and what the HUD should say. It only reads state and
// moves the mission counters — it never touches the renderer or the input.
import { MISSIONS } from './config.js';

export function currentMission(state) {
  return MISSIONS[state.missionIndex] || null;
}

export function currentStep(state) {
  const mission = currentMission(state);
  if (!mission) return null;
  return mission.steps[state.missionStep] || null;
}

// Where the beacon should point for the step in progress, or null when the
// step has no place on the map.
export function stepTarget(state) {
  const step = currentStep(state);
  if (!step) return null;
  if (step.kind === 'collect') {
    const spot = (step.spots || [])[state.missionCollected || 0];
    return spot ? {x: spot.x, z: spot.z, label: step.label} : null;
  }
  if (step.kind === 'race') {
    const gate = (step.checkpoints || [])[state.raceIndex || 0];
    return gate ? {x: gate.x, z: gate.z, label: step.label} : null;
  }
  if (step.kind === 'ram') {
    if (state.targetCar) return {x: state.targetCar.x, z: state.targetCar.z, label: step.label};
    return step.pos ? {x: step.pos.x, z: step.pos.z, label: step.label} : null;
  }
  if (step.pos) return {x: step.pos.x, z: step.pos.z, label: step.label};
  return null;
}

// The objective line the HUD shows for the step in progress.
export function objectiveLabel(state) {
  const mission = currentMission(state);
  const step = currentStep(state);
  if (!mission || !step) return 'Solmar Bay is yours. Free roam — cause chaos or enjoy the sunset.';
  if (step.kind === 'collect') {
    const shown = step.label.replace(/\(\d+\/\d+\)/, `(${state.missionCollected || 0}/${step.count})`);
    return `${mission.title}: ${shown}`;
  }
  if (step.kind === 'race') {
    const total = (step.checkpoints || []).length;
    return `${mission.title}: Race the Neon circuit (${state.raceIndex || 0}/${total} gates)`;
  }
  if (step.kind === 'eliminate') {
    return `${mission.title}: Disable police cars (${state.eliminated || 0}/${step.count})`;
  }
  return `${mission.title}: ${step.label}`;
}

// The step after this one, for the HUD's NEXT line.
export function nextStepLabel(state) {
  const mission = currentMission(state);
  if (!mission) return 'Free roam';
  const following = mission.steps[state.missionStep + 1];
  if (following) return `NEXT: ${following.label}`;
  const nextJob = MISSIONS[state.missionIndex + 1];
  if (nextJob) return `NEXT JOB: ${nextJob.title} — ${nextJob.giver}`;
  return 'NEXT: Own the city';
}

// Queue a giver's line for the HUD dialogue box.
export function sayLine(state, text, name, role) {
  state.dialogue = {name: name || 'Lucia', role: role || 'Fixer', text, timer: 7};
}

// Called when a step (re)starts: per-step counters and the clock reset.
export function startStep(state) {
  const step = currentStep(state);
  state.missionCollected = 0;
  state.missionHold = 0;
  state.raceIndex = 0;
  state.eliminated = 0;
  state.missionTimer = step && step.seconds ? step.seconds : 0;
  if (step && step.kind === 'ram') state.targetCar = null;
  if (step && step.wantedOnStart) {
    state.player.wanted = Math.max(state.player.wanted, step.wantedOnStart);
    state.player.crimeTimer = 0;
  }
  const mission = currentMission(state);
  if (mission && mission.dialogue && state.missionStep === 0) {
    sayLine(state, mission.dialogue[0], mission.giver, 'Fixer');
  }
}

// Move the mission machine one step on. Returns 'step' when a step completes,
// 'mission' when a whole mission completes, 'done' when the story ends.
export function advanceMission(state) {
  const mission = currentMission(state);
  if (!mission) return null;
  state.missionStep += 1;
  state.missionCollected = 0;
  state.missionHold = 0;
  state.raceIndex = 0;
  state.eliminated = 0;
  if (state.missionStep < mission.steps.length) {
    startStep(state);
    return 'step';
  }
  state.player.cash += mission.reward;
  state.player.rp = (state.player.rp || 0) + (mission.rp || mission.reward);
  state.missionIndex += 1;
  state.missionStep = 0;
  state.missionFlash = {title: `${mission.title} — complete`, reward: mission.reward, timer: 4};
  state.targetCar = null;
  const next = MISSIONS[state.missionIndex];
  if (next && next.dialogue) sayLine(state, next.dialogue[0], next.giver, 'Fixer');
  if (state.missionIndex >= MISSIONS.length) {
    state.player.cash += 1000;
    state.allMissionsDone = true;
    state.missionFlash = {title: 'You own Solmar Bay', reward: 1000, timer: 6};
    return 'done';
  }
  startStep(state);
  return 'mission';
}
