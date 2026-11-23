// Player settings: quality, volume, camera and HUD toggles, kept in
// localStorage under one key so they survive a reload. The game reads
// them at boot and the settings panel edits them live — nothing here
// touches the save file or the mission state.

export const SETTINGS_KEY = 'solmar-settings-v1';

// [key, default] — the order is the panel's order.
const FIELD_ROWS = [
  ['quality', 'auto'],
  ['volume', 0.8],
  ['invertCamera', false],
  ['showFps', false],
  ['weatherOn', true],
  ['showMinimap', true],
];
export const DEFAULT_SETTINGS = Object.fromEntries(FIELD_ROWS);

function looksLikeRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fillDefaults(saved) {
  const out = {...DEFAULT_SETTINGS};
  if (!looksLikeRecord(saved)) return out;
  for (const [key, fallback] of FIELD_ROWS) {
    const incoming = saved[key];
    if (incoming !== undefined && typeof incoming === typeof fallback) out[key] = incoming;
  }
  return out;
}

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {...DEFAULT_SETTINGS};
    return fillDefaults(JSON.parse(raw));
  } catch {
    // A corrupt settings blob is not worth a crash: play with defaults.
    return {...DEFAULT_SETTINGS};
  }
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full store: settings just don't persist.
  }
}

// One setting at a time, validated against the default's type so a
// stray value can never slip in from a hand-edited store. An unknown key
// or a wrong-typed value leaves the settings object untouched and
// returns it as-is — the caller can always use the return value.
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
