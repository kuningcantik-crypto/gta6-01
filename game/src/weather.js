// Cuaca Solmar Bay: pagi cerah, siang berawan, sore hujan, dan malam
// bisa badai petir sebelum kembali cerah menjelang subuh. Jadwalnya
// mengikuti jam di dalam game, jadi run dengan seed yang sama selalu
// melihat langit yang sama di jam yang sama — screenshot tetap bisa
// direproduksi. Hujan hanya mengubah cahaya, suara, dan suasana; model
// mengemudi tidak pernah ikut berubah.

export const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'storm'];

// Fase langit sepanjang hari: tiap fase mulai pada jam tertentu dan
// bertahan sampai fase berikutnya dimulai. Jam 23 kembali cerah agar
// malam larut tetap terang bulan.
const DAY_PHASES = [
  {start: 0, kind: 'clear'},
  {start: 14, kind: 'cloudy'},
  {start: 18, kind: 'rain'},
  {start: 20, kind: 'storm'},
  {start: 23, kind: 'clear'},
];

export function weatherForHour(hour) {
  let found = DAY_PHASES[0].kind;
  for (let i = 0; i < DAY_PHASES.length; i += 1) {
    if (hour >= DAY_PHASES[i].start) found = DAY_PHASES[i].kind;
  }
  return found;
}

export function createWeather() {
  return {
    kind: 'clear',
    // 0 saat kering, merangkak ke 1 selagi hujan membasahi jalan.
    wetness: 0,
    // 0..1, seberapa deras hujan turun saat ini.
    rain: 0,
    // Detik sampai petir berikutnya; 0 berarti petir menyambar sekarang.
    boltIn: 6,
    // Seberapa terang kilat terakhir, memudar kembali ke 0.
    boltGlow: 0,
    // Berapa lama langit ini sudah bertahan, untuk transisi yang halus.
    heldFor: 0,
  };
}

const DIM_PER_KIND = {storm: 0.45, rain: 0.6, cloudy: 0.8, clear: 1};

// Seberapa redup matahari untuk satu jenis cuaca. Renderer melakukan
// lerp menuju nilai ini, jadi pergantian langit tidak pernah mendadak.
export function skyDim(kind) {
  const dim = DIM_PER_KIND[kind];
  return dim === undefined ? 1 : dim;
}

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function easeToward(now, goal, dt) {
  const step = goal > now ? dt / 4 : dt / 8;
  return now + Math.max(-step, Math.min(step, goal - now));
}

const RAIN_TARGET = {storm: 1, rain: 0.65, cloudy: 0, clear: 0};

// Majukan cuaca sebesar dt detik pada jam tertentu. Mengembalikan true
// saat jenis cuacanya berganti, supaya pemanggil bisa mengumumkannya
// sekali saja.
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
  // Petir dulu: badai menghitung mundur ke sambaran berikutnya.
  if (weather.kind === 'storm') {
    weather.boltIn -= dt;
    if (weather.boltIn <= 0) {
      weather.boltGlow = 1;
      weather.boltIn = 4 + rng.next() * 9;
    }
  }
  if (weather.boltGlow > 0) {
    weather.boltGlow = Math.max(0, weather.boltGlow - dt * 2.2);
  }
  // Lalu hujan: deras naik cepat, reda pelan.
  const goal = RAIN_TARGET[weather.kind];
  weather.rain = easeToward(weather.rain, goal, dt);
  // Jalan basah ikut: cepat basah saat hujan, kering pelan setelahnya.
  const drying = goal > 0 ? dt / 20 : -dt / 40;
  weather.wetness = clamp01(weather.wetness + drying);
  return changed;
}

const LABEL_PER_KIND = {storm: 'STORM', rain: 'RAIN', cloudy: 'CLOUDY', clear: 'CLEAR'};

export function weatherLabel(weather) {
  return LABEL_PER_KIND[weather.kind] || 'CLEAR';
}

// Satu baris ticker radio saat langit berubah.
const CHATTER_PER_KIND = {
  storm: 'SBPD: "Storm over the bay — drive careful, Solmar."',
  rain: 'SOLMAR WIRE — Rain moving in off the water.',
  cloudy: 'SOLMAR WIRE — Clouds building over the plaza.',
  clear: 'SOLMAR WIRE — Skies clearing over the bay.',
};

export function weatherChatter(kind) {
  return CHATTER_PER_KIND[kind] || CHATTER_PER_KIND.clear;
}
