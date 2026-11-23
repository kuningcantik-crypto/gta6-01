// Trem Solmar Bay: dua gerbong mengitari bujur sangkar jalan di
// x = ±104 dan z = ±104, melewati plaza, hotel, dan marina. Trem berjalan
// di rel tengah jalan, pelan dan mantap, dan tidak pernah berhenti untuk
// apa pun — mereka pemandangan dengan jadwal, bukan lalu lintas, jadi
// tidak pernah bertabrakan dengan Rico, polisi, atau mobil lain.
// Lintasannya parametrik: tiap gerbong punya jarak tempuh di sepanjang
// loop dan kecepatan, dan posisi adalah geometri murni dari jarak itu.

export const TRAM_LOOP_HALF = 104;
export const TRAM_SPEED = 7;
export const TRAM_CAR_LENGTH = 9;

// Keliling loop: empat sisi, masing-masing 208 m.
export const TRAM_LOOP_LENGTH = 8 * TRAM_LOOP_HALF;

const SIDE = 2 * TRAM_LOOP_HALF;

// Empat sisi loop, berlawanan arah jarum jam mulai dari sudut barat
// daya. Tiap sisi: [x awal, z awal, langkah x, langkah z, hadap].
const SIDE_ROWS = [
  [-TRAM_LOOP_HALF, TRAM_LOOP_HALF, 1, 0, Math.PI / 2],
  [TRAM_LOOP_HALF, TRAM_LOOP_HALF, 0, -1, 0],
  [TRAM_LOOP_HALF, -TRAM_LOOP_HALF, -1, 0, -Math.PI / 2],
  [-TRAM_LOOP_HALF, -TRAM_LOOP_HALF, 0, 1, Math.PI],
];
const LOOP_SIDES = SIDE_ROWS.map(([fromX, fromZ, stepX, stepZ, heading]) =>
  ({fromX, fromZ, stepX, stepZ, heading}));

// Nama dan posisi empat halte di sudut-sudut loop.
// [x, z, name]
const STOP_ROWS = [
  [-TRAM_LOOP_HALF, TRAM_LOOP_HALF, 'Plaza South'],
  [TRAM_LOOP_HALF, TRAM_LOOP_HALF, 'Marina East'],
  [TRAM_LOOP_HALF, -TRAM_LOOP_HALF, 'Hotel North'],
  [-TRAM_LOOP_HALF, -TRAM_LOOP_HALF, 'Docks West'],
];
const STOPS = STOP_ROWS.map(([x, z, name]) => ({x, z, name}));

export function createTram() {
  return {
    cars: [
      {along: 0, speed: TRAM_SPEED, line: 'A'},
      {along: TRAM_LOOP_LENGTH / 2, speed: TRAM_SPEED, line: 'B'},
    ],
  };
}

// Jarak di sepanjang loop -> posisi dunia dan hadap. Loop berjalan
// berlawanan arah jarum jam, mulai dari sudut barat daya menuju timur
// menyusuri jalan selatan dulu.
export function tramPose(along) {
  const total = TRAM_LOOP_LENGTH;
  const d = ((along % total) + total) % total;
  const leg = Math.floor(d / SIDE);
  const side = LOOP_SIDES[leg];
  const run = d - leg * SIDE;
  return {
    x: side.fromX + side.stepX * run,
    z: side.fromZ + side.stepZ * run,
    angle: side.heading,
  };
}

export function tickTram(tram, dt) {
  for (const car of tram.cars) {
    car.along += car.speed * dt;
    if (car.along >= TRAM_LOOP_LENGTH) car.along -= TRAM_LOOP_LENGTH;
  }
}

// Posisi tiap gerbong trem saat ini, untuk renderer.
export function tramPoses(tram) {
  return tram.cars.map((car) => {
    const pose = tramPose(car.along);
    return {x: pose.x, z: pose.z, angle: pose.angle, line: car.line};
  });
}

// Jarak tempuh halte ke-i di sepanjang loop, untuk perhitungan ETA.
// Halte duduk di tengah tiap sisi loop, jadi halte ke-i berada pada
// jarak i * 208 + 104 meter dari titik awal.
function stopAlong(stopIndex) {
  return (stopIndex % 4) * SIDE + SIDE / 2;
}

// Detik sampai sebuah gerbong trem mencapai halte sudut, untuk baris
// HUD. Trem cukup pelan sehingga jawabannya biasanya "masih lama".
export function tramEta(tram, stopIndex) {
  const at = stopAlong(stopIndex);
  let soonest = Infinity;
  for (const car of tram.cars) {
    let ahead = at - car.along;
    if (ahead < 0) ahead += TRAM_LOOP_LENGTH;
    soonest = Math.min(soonest, ahead / car.speed);
  }
  return Math.round(soonest);
}

// Halte trem terdekat dari sebuah titik, untuk baris "trem berikutnya"
// di HUD. Halte duduk di empat sudut loop.
export function nearestTramStop(x, z) {
  let best = STOPS[0];
  let bestD = Infinity;
  for (const stop of STOPS) {
    const d = Math.hypot(stop.x - x, stop.z - z);
    if (d < bestD) {
      best = stop;
      bestD = d;
    }
  }
  return {name: best.name, dist: Math.round(bestD)};
}
