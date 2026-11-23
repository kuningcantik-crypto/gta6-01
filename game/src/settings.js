// Player settings: quality, volume, camera and HUD toggles, kept in
// localStorage under one key so they survive a reload. The game reads
// them at boot and the settings panel edits them live — nothing here
// touches the save file or the mission state.

export const SETTINGS_KEY = 'solmar-settings-v1';

export const DEFAULT_SETTINGS = {
  // 'auto' drops to the light renderer when the frame rate sags.
  quality: 'auto',
  // 0..1, scales every sound the audio module makes.
  volume: 0.8,
  // Flip the camera orbit direction.
  invertCamera: false,
  // Show the frames-per-second counter in the HUD corner.
  showFps: false,
  // Rain and lightning on or off; off keeps the sky clear all day.
  weatherOn: true,
  // Keep the minimap on screen, or hide it for a cleaner view.
  showMinimap: true,
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeIntoDefaults(saved) {
  const out = {...DEFAULT_SETTINGS};
  if (!isRecord(saved)) return out;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const incoming = saved[key];
    if (incoming !== undefined && typeof incoming === typeof DEFAULT_SETTINGS[key]) out[key] = incoming;
  }
  return out;
}

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {...DEFAULT_SETTINGS};
    return mergeIntoDefaults(JSON.parse(raw));
  } catch (err) {
    // A corrupt settings blob is not worth a crash: play with defaults.
    return {...DEFAULT_SETTINGS};
  }
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    // Private mode or a full store: settings just don't persist.
  }
}

// One setting at a time, validated against the default's type so a
// stray value can never slip in from a hand-edited store.
export function setSetting(settings, key, value) {
  if (!(key in DEFAULT_SETTINGS)) return settings;
  if (typeof value !== typeof DEFAULT_SETTINGS[key]) return settings;
  const next = {...settings, [key]: value};
  saveSettings(next);
  return next;
}

export function qualityMode(settings) {
  if (settings.quality === 'low') return 'low';
  if (settings.quality === 'high') return 'high';
  return 'auto';
}

// Back to the defaults, persisted at once.
export function resetSettings() {
  const fresh = {...DEFAULT_SETTINGS};
  saveSettings(fresh);
  return fresh;
}
