// Procedural sound: everything is synthesized with WebAudio, no audio
// files at all. An engine hum, a police siren, gunshots, a punch, a
// pickup chime, a mission sting, rain on the roof, and a soft sunset pad
// under the title screen. One chord per radio station — switching station
// retunes the pad.
const STATION_CHORDS = [
  [220, 277.18, 329.63],
  [196, 246.94, 293.66],
  [174.61, 220, 261.63],
  [146.83, 185, 220],
  [164.81, 207.65, 246.94],
];

export function createAudio() {
  let ctx = null;
  let motor = null;
  let motorLevel = null;
  let wail = null;
  let wailLevel = null;
  let padVoices = null;
  let rainSrc = null;
  let rainLevel = null;
  let live = false;
  let volume = 0.8;

  function openContext() {
    if (ctx !== null) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (!openContext()) return;
    if (ctx.state === 'suspended') ctx.resume();
    live = true;
    startMotor();
    startPad();
  }

  function startMotor() {
    if (motor !== null) return;
    motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 50;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 320;
    motorLevel = ctx.createGain();
    motorLevel.gain.value = 0;
    motor.connect(lowpass);
    lowpass.connect(motorLevel);
    motorLevel.connect(ctx.destination);
    motor.start();
  }

  function startPad() {
    if (padVoices !== null) return;
    retunePad(STATION_CHORDS[0]);
  }

  function retunePad(freqs) {
    padVoices = [];
    const bus = ctx.createGain();
    bus.gain.value = 0.035 * volume;
    bus.connect(ctx.destination);
    for (let i = 0; i < freqs.length; i += 1) {
      const voice = ctx.createOscillator();
      voice.type = 'sine';
      voice.frequency.value = freqs[i];
      voice.connect(bus);
      voice.start();
      padVoices.push(voice);
    }
  }

  function tone(freq, seconds, shape, loud) {
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

  function burst(seconds, loud) {
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

  // One-shot effects, as small scripts: each entry is a note, and a note
  // names its instrument (tone or burst), the delay before it fires, and
  // the arguments. A single runner plays every script.
  const SCRIPTS = {
    shot: [['burst', 0, [0.12, 0.3]]],
    punch: [
      ['burst', 0, [0.08, 0.2]],
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
    crash: [['burst', 0, [0.25, 0.25]]],
    click: [['tone', 0, [600, 0.05, 'square', 0.08]]],
    horn: [
      ['tone', 0, [370, 0.18, 'sawtooth', 0.1]],
      ['tone', 0, [466, 0.18, 'sawtooth', 0.1]],
    ],
  };

  function playNote(note) {
    const [kind, , args] = note;
    if (kind === 'burst') burst(args[0], args[1]);
    else tone(args[0], args[1], args[2], args[3]);
  }

  function playScript(script) {
    for (let i = 0; i < script.length; i += 1) {
      const note = script[i];
      if (note[1] > 0) setTimeout(() => playNote(note), note[1]);
      else playNote(note);
    }
  }

  const effects = {};
  const names = Object.keys(SCRIPTS);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    effects[name] = () => playScript(SCRIPTS[name]);
  }

  function stopVoices(voices) {
    for (let i = 0; i < voices.length; i += 1) {
      try {
        voices[i].stop();
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
      if (ctx === null || !live || padVoices === null) return;
      stopVoices(padVoices);
      padVoices = null;
      retunePad(STATION_CHORDS[station % STATION_CHORDS.length]);
    },
    engine(speed01, driving) {
      if (ctx === null || motorLevel === null) return;
      const target = live && driving ? 0.05 + speed01 * 0.06 : 0;
      motorLevel.gain.setTargetAtTime(target * volume, ctx.currentTime, 0.1);
      motor.frequency.setTargetAtTime(50 + speed01 * 110, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (ctx === null || !live) return;
      if (on && wail === null) {
        wail = ctx.createOscillator();
        wail.type = 'triangle';
        wailLevel = ctx.createGain();
        wailLevel.gain.value = 0.045 * volume;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.6;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain);
        lfoGain.connect(wail.frequency);
        wail.frequency.value = 700;
        wail.connect(wailLevel);
        wailLevel.connect(ctx.destination);
        wail.start();
        lfo.start();
      } else if (!on && wail !== null) {
        try {
          wail.stop();
        } catch {
          // already stopped
        }
        wail = null;
        wailLevel = null;
      }
    },
    // Looping rain hiss, driven by the weather system: 0 is silent.
    rain(level) {
      if (ctx === null || !live) return;
      if (level > 0 && rainSrc === null) {
        const len = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
        rainSrc = ctx.createBufferSource();
        rainSrc.buffer = buffer;
        rainSrc.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        rainLevel = ctx.createGain();
        rainLevel.gain.value = 0;
        rainSrc.connect(filter);
        filter.connect(rainLevel);
        rainLevel.connect(ctx.destination);
        rainSrc.start();
      }
      if (rainLevel !== null) {
        rainLevel.gain.setTargetAtTime(level * 0.12 * volume, ctx.currentTime, 0.5);
      }
      if (level <= 0 && rainSrc !== null) {
        try {
          rainSrc.stop();
        } catch {
          // already stopped
        }
        rainSrc = null;
        rainLevel = null;
      }
    },
    ...effects,
  };
}
