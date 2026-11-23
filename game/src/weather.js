// Weather over Solmar Bay: the day runs clear in the morning, clouds
// roll in after lunch, and the evening can turn to rain and lightning
// before clearing again at night. The schedule is driven by the in-game
// clock, so a seeded run always sees the same sky at the same hour —
// screenshots stay reproducible. Rain never touches the driving model;
// it is light, sound and mood only.

export const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'storm'];

// Hour of day -> weather, as [hour, kind] boundaries. The bay is sunny
// while Rico works the morning jobs, grey through the afternoon, and
// wettest when the night missions start.
const SKY_SCHEDULE = [
  [0, 'clear'],
  [14, 'cloudy'],
  [18, 'rain'],
  [20, 'storm'],
  [23, 'clear'],
];

export function weatherForHour(hour) {
  let kind = 'clear';
  for (const [at, name] of SKY_SCHEDULE) {
    if (hour >= at) kind = name;
  }
  return kind;
}

export function createWeather() {
  return {
    kind: 'clear',
    // 0 in dry weather, rising toward 1 as rain settles in.
    wetness: 0,
    // 0..1, how hard the rain is falling right now.
    rain: 0,
    // Seconds until the next lightning bolt; 0 means one fires now.
    boltIn: 6,
    // How bright the last bolt still is, fading back to 0.
    boltGlow: 0,
    // Seconds the current sky has held, for smooth transitions.
    heldFor: 0,
  };
}

// How much the sky dims the sun for a weather kind: clear is full sun,
// storm is a heavy grey. The renderer lerps toward this.
export function skyDim(kind) {
  if (kind === 'storm') return 0.45;
  if (kind === 'rain') return 0.6;
  if (kind === 'cloudy') return 0.8;
  return 1;
}

// Advance the weather by dt seconds at the given clock hour. Returns
// true when the kind changed, so the caller can announce it once.
export function tickWeather(weather, dt, clockMinutes, rng) {
  const hour = Math.floor(clockMinutes / 60) % 24;
  const want = weatherForHour(hour);
  let changed = false;
  if (want !== weather.kind) {
    weather.kind = want;
    weather.heldFor = 0;
    changed = true;
  }
  weather.heldFor += dt;
  const targetRain = weather.kind === 'storm' ? 1 : weather.kind === 'rain' ? 0.65 : 0;
  const rate = targetRain > weather.rain ? dt / 4 : dt / 8;
  weather.rain += Math.max(-rate, Math.min(rate, targetRain - weather.rain));
  weather.wetness += (targetRain > 0 ? dt / 20 : -dt / 40);
  if (weather.wetness < 0) weather.wetness = 0;
  if (weather.wetness > 1) weather.wetness = 1;
  if (weather.kind === 'storm') {
    weather.boltIn -= dt;
    if (weather.boltIn <= 0) {
      weather.boltGlow = 1;
      weather.boltIn = 4 + rng.next() * 9;
    }
  }
  if (weather.boltGlow > 0) weather.boltGlow = Math.max(0, weather.boltGlow - dt * 2.2);
  return changed;
}

export function weatherLabel(weather) {
  if (weather.kind === 'storm') return 'STORM';
  if (weather.kind === 'rain') return 'RAIN';
  if (weather.kind === 'cloudy') return 'CLOUDY';
  return 'CLEAR';
}

// A ticker line for the radio crawl when the sky turns.
export function weatherChatter(kind) {
  if (kind === 'storm') return 'SBPD: "Storm over the bay — drive careful, Solmar."';
  if (kind === 'rain') return 'SOLMAR WIRE — Rain moving in off the water.';
  if (kind === 'cloudy') return 'SOLMAR WIRE — Clouds building over the plaza.';
  return 'SOLMAR WIRE — Skies clearing over the bay.';
}
