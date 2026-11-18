// VICE HARBOR v6 — deterministic math and random numbers.
// Every system draws from here, so the whole city rebuilds identically
// from one seed. Nothing in this file knows about three.js, the city or
// the game loop: it is pure arithmetic, and it can be reasoned about on
// its own. The world seed flows in from settings.js; each system takes
// its own stream by adding a tag, so no two systems share a sequence.

export function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed turn from `a` toward `b`, capped at `maxStep` radians.
export function steerToward(a, b, maxStep) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (d > maxStep) return a + maxStep;
  if (d < -maxStep) return a - maxStep;
  return b;
}

export function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// FNV-1a hash: turns a short label into a stable 32-bit seed.
export function hashLabel(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: a tiny deterministic generator. One stream per system.
export function makeStream(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this._next = makeStream(seed);
  }

  next() {
    return this._next();
  }

  range(min, max) {
    return min + this._next() * (max - min);
  }

  int(min, max) {
    return min + Math.floor(this._next() * (max - min + 1));
  }

  pick(arr) {
    return arr[Math.floor(this._next() * arr.length)];
  }

  chance(p) {
    return this._next() < p;
  }

  shuffled(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this._next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  // A bell-ish value in [-1, 1] (sum of three uniforms, recentred).
  bell() {
    return (this._next() + this._next() + this._next() - 1.5) / 1.5;
  }

  // A standard-normal value (Box-Muller on two uniforms), for the
  // natural variation a crowd or a city wants: most values near zero,
  // a few far out. Deterministic, like everything else in this file.
  gauss() {
    let u = 0;
    while (u === 0) u = this._next();
    const v = this._next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Pick one entry from `items` with probability proportional to
  // `weights` (same length, non-negative, at least one positive).
  weightedPick(items, weights) {
    let total = 0;
    for (const w of weights) total += w;
    let roll = this._next() * total;
    for (let i = 0; i < items.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

export function makeRng(seed) {
  return new Rng(seed);
}
