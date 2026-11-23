// Cuaca Solmar Bay: pagi cerah, siang berawan, sore hujan, dan malam
// bisa badai petir sebelum kembali cerah menjelang subuh. Jadwalnya
// mengikuti jam di dalam game, jadi run dengan seed yang sama selalu
// melihat langit yang sama di jam yang sama — screenshot tetap bisa
// direproduksi. Hujan hanya mengubah cahaya, suara, dan suasana; model
// mengemudi tidak pernah ikut berubah.

export const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'storm'];

// Fase langit sepanjang hari: [jam mulai, jenis]. Jam 23 kembali cerah
// agar malam larut tetap terang bulan. Fase dipilih murni dari jam di
// dalam game, jadi dua run dengan seed yang sama melihat langit yang
// sama di jam yang sama.
const PHASE_ROWS = [
  [0, 'clear'],
  [14, 'cloudy'],
  [18, 'rain'],
  [20, 'storm'],
  [23, 'clear'],
];
const DAY_PHASES = PHASE_ROWS.map(([start, kind]) => ({start, kind}));

export function weatherForHour(hour) {
  let current = DAY_PHASES[0].kind;
  for (const phase of DAY_PHASES) {
    if (hour >= phase.start) current = phase.kind;
  }
  return current;
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

// Per jenis cuaca: [jenis, redup matahari, target hujan, label].
const KIND_ROWS = [
  ['clear', 1, 0, 'CLEAR'],
  ['cloudy', 0.8, 0, 'CLOUDY'],
  ['rain', 0.6, 0.65, 'RAIN'],
  ['storm', 0.45, 1, 'STORM'],
];
const KIND_TABLE = Object.fromEntries(KIND_ROWS.map(([kind, dim, rain, label]) => [kind, {dim, rain, label}]));

// Seberapa redup matahari untuk satu jenis cuaca. Renderer melakukan
// lerp menuju nilai ini, jadi pergantian langit tidak pernah mendadak.
export function skyDim(kind) {
  return KIND_TABLE[kind] ? KIND_TABLE[kind].dim : 1;
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
  const goal = KIND_TABLE[weather.kind].rain;
  weather.rain = easeToward(weather.rain, goal, dt);
  // Jalan basah ikut: cepat basah saat hujan, kering pelan setelahnya.
  const drying = goal > 0 ? dt / 20 : -dt / 40;
  weather.wetness = clamp01(weather.wetness + drying);
  return changed;
}

export function weatherLabel(weather) {
  return KIND_TABLE[weather.kind] ? KIND_TABLE[weather.kind].label : 'CLEAR';
}

// Satu baris ticker radio saat langit berubah.
const CHATTER_ROWS = [
  ['storm', 'SBPD: "Storm over the bay — drive careful, Solmar."'],
  ['rain', 'SOLMAR WIRE — Rain moving in off the water.'],
  ['cloudy', 'SOLMAR WIRE — Clouds building over the plaza.'],
  ['clear', 'SOLMAR WIRE — Skies clearing over the bay.'],
];
const CHATTER = Object.fromEntries(CHATTER_ROWS);

export function weatherChatter(kind) {
  return CHATTER[kind] || CHATTER.clear;
}
