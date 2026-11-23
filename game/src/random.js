// Deterministic dice for Solmar Bay. One mulberry32 stream per seed, so a
// given seed always deals the same city, the same traffic and the same
// screenshots — the world never surprises the tests twice differently.
export function createRandom(seedValue) {
  let state = seedValue >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let mix = Math.imul(state ^ (state >>> 15), 1 | state);
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix;
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  }
  const dice = {
    next,
    range(lo, hi) {
      return lo + next() * (hi - lo);
    },
    int(lo, hi) {
      return Math.floor(dice.range(lo, hi + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
  };
  return dice;
}
