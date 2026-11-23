// Procedural sound: everything is synthesized with WebAudio, no audio files.
// Engine hum, police siren, gunshot, punch, pickup chime, mission sting and
// a soft sunset pad for the title screen.
// One chord per radio station — switching station retunes the pad.
const RADIO_CHORDS = [
  [220, 277.18, 329.63], // OMBO island pop: A major
  [196, 246.94, 293.66], // Mango salsa: G major
  [174.61, 220, 261.63], // Celeste chillwave: F major
  [146.83, 185, 220], // Bassline hip-hop: D minor
];

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let padNodes = null;
  let enabled = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return false; }
    return true;
  }
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    enabled = true;
    startEngine();
    startPad();
  }
  function startEngine() {
    if (engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 50;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 320;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(filter); filter.connect(engineGain); engineGain.connect(ctx.destination);
    engineOsc.start();
  }
  function startPad() {
    if (padNodes) return;
    startPadWith(RADIO_CHORDS[0]);
  }
  function startPadWith(freqs) {
    padNodes = [];
    const gain = ctx.createGain(); gain.gain.value = 0.035;
    gain.connect(ctx.destination);
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = freq;
      osc.connect(gain); osc.start();
      padNodes.push(osc);
    });
  }
  function blip(freq, seconds, type, volume) {
    if (!ctx || !enabled) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + seconds);
  }
  function noise(seconds, volume) {
    if (!ctx || !enabled) return;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = volume;
    src.connect(gain); gain.connect(ctx.destination);
    src.start();
  }
  return {
    unlock,
    setRadio(station) {
      if (!ctx || !enabled || !padNodes) return;
      for (const osc of padNodes) { try { osc.stop(); } catch { /* already stopped */ } }
      padNodes = null;
      startPadWith(RADIO_CHORDS[station % RADIO_CHORDS.length]);
    },
    engine(speed01, driving) {
      if (!ctx || !engineGain) return;
      const target = enabled && driving ? 0.05 + speed01 * 0.06 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 110, ctx.currentTime, 0.1);
    },
    siren(on) {
      if (!ctx || !enabled) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain(); sirenGain.gain.value = 0.045;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.6;
        const lfoGain = ctx.createGain(); lfoGain.gain.value = 220;
        lfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
        sirenOsc.frequency.value = 700;
        sirenOsc.connect(sirenGain); sirenGain.connect(ctx.destination);
        sirenOsc.start(); lfo.start();
      } else if (!on && sirenOsc) {
        try { sirenOsc.stop(); } catch { /* already stopped */ }
        sirenOsc = null; sirenGain = null;
      }
    },
    shot() { noise(0.12, 0.3); },
    punch() { noise(0.08, 0.2); blip(120, 0.08, 'square', 0.1); },
    pickup() { blip(880, 0.12, 'sine', 0.18); setTimeout(() => blip(1320, 0.18, 'sine', 0.15), 90); },
    mission() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.16), i * 110)); },
    crash() { noise(0.25, 0.25); },
    click() { blip(600, 0.05, 'square', 0.08); },
  };
}
