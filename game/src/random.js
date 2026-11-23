// Solmar Bay's seeded dice: one stream per seed, so the same seed always
// deals the same city, the same traffic and the same screenshots. The
// stream is splitmix32 — a counter folded through two multiply-xorshifts —
// which throws nearby seeds far apart from the very first draw.
export function createRandom(seedValue) {
  let state = (seedValue >>> 0) || 0x2545f491;
  const stream = {
    next() {
      state = (state + 0x9e3779b9) >>> 0;
      let mixed = state;
      mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
      mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
      mixed ^= mixed >>> 15;
      return (mixed >>> 0) / 4294967296;
    },
  };
  const api = {
    next: () => stream.next(),
    range(low, high) {
      return low + stream.next() * (high - low);
    },
    int(low, high) {
      return low + Math.floor(stream.next() * (high - low + 1));
    },
    pick(entries) {
      return entries[Math.floor(stream.next() * entries.length)];
    },
    chance(p) {
      return stream.next() < p;
    },
    coin() {
      return stream.next() < 0.5;
    },
  };
  return api;
}
