// Procedural sound: everything is synthesized with WebAudio, no audio
// files at all. An engine hum, a police siren, gunshots, a punch, a
// pickup chime, a mission sting, and a soft sunset pad under the title
// screen. One chord per radio station — switching station retunes the pad.
const STATION_CHORDS = [
  [220, 277.18, 329.63],
  [196, 246.94, 293.66],
  [174.61, 220, 261.63],
  [146.83, 185, 220],
];

export function createAudio() {
  let ctx = null;
  let motor = null;
  let motorLevel = null;
  let wail = null;
  let wailLevel = null;
  let padVoices = null;
  let live = false;

  function openContext() {
    if (ctx) return true;
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
    if (motor) return;
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
    if (padVoices) return;
    retunePad(STATION_CHORDS[0]);
  }
  function retunePad(freqs) {
    padVoices = [];
    const bus = ctx.createGain();
    bus.gain.value = 0.035;
    bus.connect(ctx.destination);
    for (const freq of freqs) {
      const voice = ctx.createOscillator();
      voice.type = 'sine';
      voice.frequency.value = freq;
      voice.connect(bus);
      voice.start();
      padVoices.push(voice);
    }
  }
  function tone(freq, seconds, shape, volume) {
    if (!ctx || !live) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = shape || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }
  function burst(seconds, volume) {
    if (!ctx || !live) return;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }
  // One-shot effects, as small scripts: each entry is a list of notes,
  // and a note names its instrument (tone or burst), the delay before it
  // fires, and the arguments. A single runner plays every script.
  const SCRIPTS = {
    shot: [{play: 'burst', after: 0, with: [0.12, 0.3]}],
    punch: [
      {play: 'burst', after: 0, with: [0.08, 0.2]},
      {play: 'tone', after: 0, with: [120, 0.08, 'square', 0.1]},
    ],
    pickup: [
      {play: 'tone', after: 0, with: [880, 0.12, 'sine', 0.18]},
      {play: 'tone', after: 90, with: [1320, 0.18, 'sine', 0.15]},
    ],
    mission: [
      {play: 'tone', after: 0, with: [523, 0.25, 'triangle', 0.16]},
      {play: 'tone', after: 110, with: [659, 0.25, 'triangle', 0.16]},
      {play: 'tone', after: 220, with: [784, 0.25, 'triangle', 0.16]},
    ],
    crash: [{play: 'burst', after: 0, with: [0.25, 0.25]}],
    click: [{play: 'tone', after: 0, with: [600, 0.05, 'square', 0.08]}],
    horn: [
      {play: 'tone', after: 0, with: [370, 0.18, 'sawtooth', 0.1]},
      {play: 'tone', after: 0, with: [466, 0.18, 'sawtooth', 0.1]},
    ],
  };
  function playNote(note) {
    if (note.play === 'burst') burst(...note.with);
    else tone(...note.with);
  }
  function playScript(script) {
    for (const note of script) {
      if (note.after > 0) setTimeout(() => playNote(note), note.after);
      else playNote(note);
    }
  }
  const effects = {};
  for (const [name, script] of Object.entries(SCRIPTS)) {
    effects[name] = () => playScript(script);
  }
  return {
    unlock,
    setRadio(station) {
      if (!ctx || !live || !padVoices) return;
      for (const voice of padVoices) {
        try {
          voice.stop();
        } catch {
          // already stopped
        }
      }
      padVoices = null;
      retunePad(STATION_CHORDS[station % STATION_CHORDS.length]);
    },
    engine(speed01, driving) {
      if (!ctx || !motorLevel) return;
      const target = live && driving ? 0.05 + speed01 * 0.06 : 0;
      motorLevel.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      motor.frequency.setTargetAtTime(50 + speed01 * 110, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!ctx || !live) return;
      if (on && !wail) {
        wail = ctx.createOscillator();
        wail.type = 'triangle';
        wailLevel = ctx.createGain();
        wailLevel.gain.value = 0.045;
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
      } else if (!on && wail) {
        try {
          wail.stop();
        } catch {
          // already stopped
        }
        wail = null;
        wailLevel = null;
      }
    },
    ...effects,
  };
}
