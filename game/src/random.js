// Seeded dice for Solmar Bay. One stream per seed, so a given seed always
// deals the same city, the same traffic and the same screenshots. The
// stream is a xorshift32 generator warmed up at construction, which keeps
// early draws from clustering near the seed value.
export function createRandom(seedValue) {
  let word = (seedValue >>> 0) || 0x9e3779b9;
  // Warm the state so the first draws do not betray the seed.
  for (let i = 0; i < 8; i += 1) {
    word ^= word << 13;
    word ^= word >>> 17;
    word ^= word << 5;
    word >>>= 0;
  }
  function draw() {
    word ^= word << 13;
    word ^= word >>> 17;
    word ^= word << 5;
    word >>>= 0;
    return word / 4294967296;
  }
  const dice = {
    next: draw,
    range(low, high) {
      return low + draw() * (high - low);
    },
    int(low, high) {
      return low + Math.floor(draw() * (high - low + 1));
    },
    pick(entries) {
      return entries[Math.floor(draw() * entries.length)];
    },
    chance(p) {
      return draw() < p;
    },
    coin() {
      return draw() < 0.5;
    },
  };
  return dice;
}
