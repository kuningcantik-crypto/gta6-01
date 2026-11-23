// Procedural sound: everything is synthesized with WebAudio, no audio
// files at all. An engine hum, a police siren, gunshots, a punch, a pickup
// chime, a mission sting, and a soft sunset pad under the title screen.
// One chord per radio station — switching station retunes the pad.
const RADIO_CHORDS = [
  [220, 277.18, 329.63],
  [196, 246.94, 293.66],
  [174.61, 220, 261.63],
  [146.83, 185, 220],
];

export function createAudio() {
  let ac = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let padNodes = null;
  let enabled = false;

  function ensure() {
    if (ac) return true;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    return true;
  }
  function unlock() {
    if (!ensure()) return;
    if (ac.state === 'suspended') ac.resume();
    enabled = true;
    startEngine();
    startPad();
  }
  function startEngine() {
    if (engineOsc) return;
    engineOsc = ac.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineGain = ac.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ac.destination);
    engineOsc.start();
  }
  function startPad() {
    if (padNodes) return;
    startPadWith(RADIO_CHORDS[0]);
  }
  function startPadWith(freqs) {
    padNodes = [];
    const gain = ac.createGain();
    gain.gain.value = 0.035;
    gain.connect(ac.destination);
    for (const freq of freqs) {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start();
      padNodes.push(osc);
    }
  }
  function blip(freq, seconds, type, volume) {
    if (!ac || !enabled) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + seconds);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + seconds);
  }
  function noise(seconds, volume) {
    if (!ac || !enabled) return;
    const len = Math.floor(ac.sampleRate * seconds);
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(ac.destination);
    src.start();
  }
  // One-shot effects, as data: each recipe is a list of steps, and each
  // step names its player (blip or noise), the delay in milliseconds before
  // it fires, and the arguments. One player function runs them all.
  const SFX = {
    shot: [{fn: 'noise', at: 0, args: [0.12, 0.3]}],
    punch: [
      {fn: 'noise', at: 0, args: [0.08, 0.2]},
      {fn: 'blip', at: 0, args: [120, 0.08, 'square', 0.1]},
    ],
    pickup: [
      {fn: 'blip', at: 0, args: [880, 0.12, 'sine', 0.18]},
      {fn: 'blip', at: 90, args: [1320, 0.18, 'sine', 0.15]},
    ],
    mission: [
      {fn: 'blip', at: 0, args: [523, 0.25, 'triangle', 0.16]},
      {fn: 'blip', at: 110, args: [659, 0.25, 'triangle', 0.16]},
      {fn: 'blip', at: 220, args: [784, 0.25, 'triangle', 0.16]},
    ],
    crash: [{fn: 'noise', at: 0, args: [0.25, 0.25]}],
    click: [{fn: 'blip', at: 0, args: [600, 0.05, 'square', 0.08]}],
  };
  function playStep(step) {
    if (step.fn === 'noise') noise(...step.args);
    else blip(...step.args);
  }
  function playSfx(recipe) {
    for (const step of recipe) {
      if (step.at > 0) setTimeout(() => playStep(step), step.at);
      else playStep(step);
    }
  }
  const sfx = {};
  for (const [name, recipe] of Object.entries(SFX)) sfx[name] = () => playSfx(recipe);
  return {
    unlock,
    setRadio(station) {
      if (!ac || !enabled || !padNodes) return;
      for (const osc of padNodes) {
        try {
          osc.stop();
        } catch {
          // already stopped
        }
      }
      padNodes = null;
      startPadWith(RADIO_CHORDS[station % RADIO_CHORDS.length]);
    },
    engine(speed01, driving) {
      if (!ac || !engineGain) return;
      const target = enabled && driving ? 0.05 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ac.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 110, ac.currentTime, 0.1);
    },
    siren(on) {
      if (!ac || !enabled) return;
      if (on && !sirenOsc) {
        sirenOsc = ac.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ac.createGain();
        sirenGain.gain.value = 0.045;
        const lfo = ac.createOscillator();
        lfo.frequency.value = 0.6;
        const lfoGain = ac.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenOsc.frequency.value = 700;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(ac.destination);
        sirenOsc.start();
        lfo.start();
      } else if (!on && sirenOsc) {
        try {
          sirenOsc.stop();
        } catch {
          // already stopped
        }
        sirenOsc = null;
        sirenGain = null;
      }
    },
    ...sfx,
  };
}
