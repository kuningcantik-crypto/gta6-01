// Procedural sound: everything is synthesized with WebAudio, no audio
// files at all. An engine hum, a police siren, gunshots, a punch, a
// pickup chime, a mission sting, rain on the roof, and a soft sunset pad
// under the title screen. One chord per radio station — switching station
// retunes the pad.
const RADIO_CHORDS = [
  [220, 277.18, 329.63],
  [196, 246.94, 293.66],
  [174.61, 220, 261.63],
  [146.83, 185, 220],
  [164.81, 207.65, 246.94],
];

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
  const SOUND_SCRIPTS = {
    shot: [['noise', 0, [0.12, 0.3]]],
    punch: [
      ['noise', 0, [0.08, 0.2]],
      ['tone', 0, [120, 0.08, 'square', 0.1]],
    ],
    pickup: [
      ['tone', 0, [880, 0.12, 'sine', 0.18]],
      ['tone', 90, [1320, 0.18, 'sine', 0.15]],
    ],
    mission: [
      ['tone', 0, [523, 0.25, 'triangle', 0.16]],
      ['tone', 110, [659, 0.25, 'triangle', 0.16]],
      ['tone', 220, [784, 0.25, 'triangle', 0.16]],
    ],
    crash: [['noise', 0, [0.25, 0.25]]],
    click: [['tone', 0, [600, 0.05, 'square', 0.08]]],
    horn: [
      ['tone', 0, [370, 0.18, 'sawtooth', 0.1]],
      ['tone', 0, [466, 0.18, 'sawtooth', 0.1]],
    ],
  };

  function runStep(step) {
    const [kind, , args] = step;
    if (kind === 'noise') playNoise(args[0], args[1]);
    else playTone(args[0], args[1], args[2], args[3]);
  }

  function runScript(script) {
    for (const step of script) {
      if (step[1] > 0) setTimeout(() => runStep(step), step[1]);
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
