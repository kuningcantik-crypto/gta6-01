// Procedural sound: everything is synthesized with WebAudio, no audio
// files at all. An engine hum, a police siren, gunshots, a punch, a
// pickup chime, a mission sting, rain on the roof, and a soft sunset pad
// under the title screen. One chord per radio station — switching station
// retunes the pad.
const NOTE_FREQ = {
  A3: 220, 'C#4': 277.18, E4: 329.63,
  G3: 196, B3: 246.94, D4: 293.66,
  F3: 174.61, C4: 261.63,
  D3: 146.83, 'F#3': 185,
  E3: 164.81, 'G#3': 207.65,
};
const CHORD_NAMES = [
  ['A3', 'C#4', 'E4'],
  ['G3', 'B3', 'D4'],
  ['F3', 'A3', 'C4'],
  ['D3', 'F#3', 'A3'],
  ['E3', 'G#3', 'B3'],
];
const RADIO_CHORDS = CHORD_NAMES.map((names) => names.map((n) => NOTE_FREQ[n]));

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let padNotes = null;
  let rainNode = null;
  let rainGain = null;
  let live = false;
  let volume = 0.8;

  function ensureContext() {
    if (ctx !== null) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (!ensureContext()) return;
    if (ctx.state === 'suspended') ctx.resume();
    live = true;
    startEngineHum();
    startPad();
  }

  function startEngineHum() {
    if (engineOsc !== null) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
  }

  function startPad() {
    if (padNotes !== null) return;
    tunePad(RADIO_CHORDS[0]);
  }

  function tunePad(freqs) {
    padNotes = [];
    // One shared gain bus for the three pad voices, so a volume change
    // (or a station switch) moves the whole chord at once.
    const bus = ctx.createGain();
    bus.gain.value = 0.035 * volume;
    bus.connect(ctx.destination);
    for (const f of freqs) {
      const voice = ctx.createOscillator();
      voice.type = 'sine';
      voice.frequency.value = f;
      voice.connect(bus);
      voice.start();
      padNotes.push(voice);
    }
  }

  function playTone(freq, seconds, shape, loud) {
    if (ctx === null || !live) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = shape || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime((loud || 0.15) * volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function playNoise(seconds, loud) {
    if (ctx === null || !live) return;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = loud * volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  // One-shot effects, as small scripts: each entry names its instrument
  // (tone or noise), the delay before it fires, and the arguments.
  // A single runner plays every script.
  // {play, at, args}
  const SOUND_SCRIPTS = {
    shot: [{play: 'noise', at: 0, args: [0.12, 0.3]}],
    punch: [
      {play: 'noise', at: 0, args: [0.08, 0.2]},
      {play: 'tone', at: 0, args: [120, 0.08, 'square', 0.1]},
    ],
    pickup: [
      {play: 'tone', at: 0, args: [880, 0.12, 'sine', 0.18]},
      {play: 'tone', at: 90, args: [1320, 0.18, 'sine', 0.15]},
    ],
    mission: [
      {play: 'tone', at: 0, args: [523, 0.25, 'triangle', 0.16]},
      {play: 'tone', at: 110, args: [659, 0.25, 'triangle', 0.16]},
      {play: 'tone', at: 220, args: [784, 0.25, 'triangle', 0.16]},
    ],
    crash: [{play: 'noise', at: 0, args: [0.25, 0.25]}],
    click: [{play: 'tone', at: 0, args: [600, 0.05, 'square', 0.08]}],
    horn: [
      {play: 'tone', at: 0, args: [370, 0.18, 'sawtooth', 0.1]},
      {play: 'tone', at: 0, args: [466, 0.18, 'sawtooth', 0.1]},
    ],
  };

  function runStep(step) {
    if (step.play === 'noise') playNoise(step.args[0], step.args[1]);
    else playTone(step.args[0], step.args[1], step.args[2], step.args[3]);
  }

  function runScript(script) {
    for (const step of script) {
      if (step.at > 0) setTimeout(() => runStep(step), step.at);
      else runStep(step);
    }
  }

  const effects = {};
  for (const name of Object.keys(SOUND_SCRIPTS)) {
    effects[name] = () => runScript(SOUND_SCRIPTS[name]);
  }

  function silenceVoices(voices) {
    for (const v of voices) {
      try {
        v.stop();
      } catch {
        // already stopped
      }
    }
  }

  return {
    unlock,
    setVolume(level) {
      volume = Math.max(0, Math.min(1, level));
    },
    setRadio(station) {
      if (ctx === null || !live || padNotes === null) return;
      silenceVoices(padNotes);
      padNotes = null;
      tunePad(RADIO_CHORDS[station % RADIO_CHORDS.length]);
    },
    engine(speed01, driving) {
      if (ctx === null || engineGain === null) return;
      const target = live && driving ? 0.05 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target * volume, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 110, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (ctx === null || !live) return;
      if (on && sirenOsc === null) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        const level = ctx.createGain();
        level.gain.value = 0.045 * volume;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.6;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain);
        lfoGain.connect(sirenOsc.frequency);
        sirenOsc.frequency.value = 700;
        sirenOsc.connect(level);
        level.connect(ctx.destination);
        sirenOsc.start();
        lfo.start();
      } else if (!on && sirenOsc !== null) {
        try {
          sirenOsc.stop();
        } catch {
          // already stopped
        }
        sirenOsc = null;
      }
    },
    // Looping rain hiss, driven by the weather system: 0 is silent.
    rain(level) {
      if (ctx === null || !live) return;
      if (level > 0 && rainNode === null) {
        const len = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
        rainNode = ctx.createBufferSource();
        rainNode.buffer = buffer;
        rainNode.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        rainGain = ctx.createGain();
        rainGain.gain.value = 0;
        rainNode.connect(filter);
        filter.connect(rainGain);
        rainGain.connect(ctx.destination);
        rainNode.start();
      }
      if (rainGain !== null) {
        rainGain.gain.setTargetAtTime(level * 0.12 * volume, ctx.currentTime, 0.5);
      }
      if (level <= 0 && rainNode !== null) {
        try {
          rainNode.stop();
        } catch {
          // already stopped
        }
        rainNode = null;
        rainGain = null;
      }
    },
    ...effects,
  };
}
