// Solmar Bay's seeded dice: one stream per seed, so the same seed always
// deals the same city, the same traffic and the same screenshots. The
// stream is splitmix32 — a counter folded through two multiply-xorshifts —
// which throws nearby seeds far apart from the very first draw.
function scramble(v) {
  let m = Math.imul(v ^ (v >>> 16), 0x21f0aaad);
  m = Math.imul(m ^ (m >>> 15), 0x735a2d97);
  return (m ^ (m >>> 15)) >>> 0;
}

export function createRandom(seedValue) {
  // The stream's state: a counter that advances by the golden gamma on
  // every draw, then gets scrambled. Zero is a legal seed only on paper —
  // it would still work, but the fallback keeps the first draws far apart.
  let state = (seedValue >>> 0) || 0x2545f491;
  const draw = () => {
    state = (state + 0x9e3779b9) >>> 0;
    return scramble(state) / 4294967296;
  };
  return {
    next: draw,
    range: (lo, hi) => lo + draw() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(draw() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(draw() * list.length)],
    chance: (p) => draw() < p,
    coin: () => draw() < 0.5,
  };
}
