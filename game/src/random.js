// Seeded deterministic RNG (mulberry32) plus small helpers. Every random
// choice in the world, traffic and missions flows from WORLD_SEED so a
// screenshot staged from the same seed reproduces exactly.
// v2: angleLerp — shortest-arc heading interpolation for the follow camera.

// mulberry32: fast, small, deterministic 32-bit PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RNG object with convenience helpers built on one seeded stream.
export class RNG {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  // Float in [0, 1).
  float() { return this.next(); }
  // Float in [min, max).
  range(min, max) { return min + this.next() * (max - min); }
  // Integer in [min, max] inclusive.
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  // Random element of an array.
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  // True with probability p.
  chance(p) { return this.next() < p; }
  // Deterministic Fisher-Yates shuffle (returns a new array).
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}

export function createRNG(seed) {
  return new RNG(seed);
}

// Backwards-compatible factory used by the starter-era callers.
export function createRandom(seed) {
  return mulberry32(seed);
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest-arc interpolation between two headings (radians): the result
// never spins the long way around the circle. t in [0, 1].
export function angleLerp(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
