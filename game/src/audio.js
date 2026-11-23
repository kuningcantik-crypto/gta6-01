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
    shot() {
      noise(0.12, 0.3);
    },
    punch() {
      noise(0.08, 0.2);
      blip(120, 0.08, 'square', 0.1);
    },
    pickup() {
      blip(880, 0.12, 'sine', 0.18);
      setTimeout(() => blip(1320, 0.18, 'sine', 0.15), 90);
    },
    mission() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.16), i * 110));
    },
    crash() {
      noise(0.25, 0.25);
    },
    click() {
      blip(600, 0.05, 'square', 0.08);
    },
  };
}
