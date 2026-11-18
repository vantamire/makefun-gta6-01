// VICE HARBOR v4 — deterministic math toolkit.
// Every system draws from the same seeded generator, so one seed always
// rebuilds the same harbor, the same crowd and the same screenshots.
// Nothing here touches the DOM or three.js: pure numbers, easy to test.

/** Clamp `v` into the closed interval [lo, hi]. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Linear interpolation between `a` and `b` at `t` (0..1). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest-path interpolation between two headings (radians). */
export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  const TAU = Math.PI * 2;
  let x = a % TAU;
  if (x <= -Math.PI) x += TAU;
  if (x > Math.PI) x -= TAU;
  return x;
}

/** mulberry32: a tiny seeded PRNG with a good spread for its size. */
export function mulberry32(seed) {
  let s = seed | 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x = (x + Math.imul(x ^ (x >>> 7), x | 61)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded random stream with convenience draws. Systems carry their own
 * instance (city layout, crowd, traffic) so one system's draws never
 * disturb another's sequence.
 */
export class SeededRandom {
  constructor(seed) {
    this._next = mulberry32(seed);
    this._gaussSpare = null;
  }

  /** Uniform float in [0, 1). */
  next() {
    return this._next();
  }

  /** Uniform float in [min, max). */
  range(min, max) {
    return min + this._next() * (max - min);
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** One element of `arr`, uniformly. */
  choice(arr) {
    return arr[Math.floor(this._next() * arr.length)];
  }

  /** True with probability `p`. */
  chance(p) {
    return this._next() < p;
  }

  /** A shuffled copy of `arr` (Fisher-Yates). */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** Approximately normal value (mean 0, stddev 1) via Box-Muller. */
  gaussian() {
    if (this._gaussSpare !== null) {
      const v = this._gaussSpare;
      this._gaussSpare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = this._next();
    v = this._next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this._gaussSpare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  }

  /** Pick an index from `weights` (non-negative numbers, need not sum to 1). */
  weighted(weights) {
    let total = 0;
    for (const w of weights) total += w;
    let r = this._next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
}

// Backwards-friendly aliases (the old name was RNG).
export { SeededRandom as RNG };
export function createRNG(seed) {
  return new SeededRandom(seed);
}
export function createRandom(seed) {
  return mulberry32(seed);
}
