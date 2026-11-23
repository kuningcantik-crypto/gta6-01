// Seeded dice for Solmar Bay. One stream per seed, so a given seed
// always deals the same city, the same traffic and the same screenshots.
// The stream is splitmix32: a counter hashed with a few xors and
// multiplies, which spreads nearby seeds far apart from the first draw.
export function createRandom(seedValue) {
  let counter = (seedValue >>> 0) || 0x2545f491;
  function draw() {
    counter = (counter + 0x9e3779b9) >>> 0;
    let word = counter;
    word = Math.imul(word ^ (word >>> 16), 0x21f0aaad);
    word = Math.imul(word ^ (word >>> 15), 0x735a2d97);
    word ^= word >>> 15;
    return (word >>> 0) / 4294967296;
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
