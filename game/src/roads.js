// roads.js — the street grid of Vice Harbor.
// Roads run on the centre-lines x = k*pitch and z = k*pitch. Traffic
// cars follow them; this module answers "where is the nearest road",
// "am I on one", and hands out seeded routes for the traffic.

import { rangeInt, pick, clampNum } from './seed.js';
import { TUNE } from './tune.js';

export function makeRoads() {
  const P = TUNE.pitch;
  const B = TUNE.blocks;
  const lines = [];
  for (let k = -B; k <= B; k++) lines.push(k * P);
  const edge = (B + 0.5) * P;

  function nearestLine(v) {
    let best = lines[0];
    let bd = Infinity;
    for (const l of lines) {
      const d = Math.abs(v - l);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  // Snap a point to the closest road centre-line, keeping its axis.
  function snap(x, z) {
    const dx = Math.abs(x - nearestLine(x));
    const dz = Math.abs(z - nearestLine(z));
    if (dx <= dz) return { x: nearestLine(x), z, axis: 'v' };
    return { x, z: nearestLine(z), axis: 'h' };
  }

  function onRoad(x, z) {
    const dx = Math.abs(x - nearestLine(x));
    const dz = Math.abs(z - nearestLine(z));
    return Math.min(dx, dz) <= TUNE.roadHalf + 0.6;
  }

  function inBounds(x, z) {
    return Math.abs(x) <= edge && Math.abs(z) <= edge && x <= TUNE.waterX - 4;
  }

  // A route is a list of road points; a car drives straight to each in
  // turn, turning at intersections. Directions are axis-aligned.
  function makeRoute(rng, startX, startZ) {
    const pts = [];
    let { x, z, axis } = snap(startX, startZ);
    pts.push({ x, z });
    const legs = rangeInt(rng, 3, 6);
    for (let i = 0; i < legs; i++) {
      const turn = pick(rng, [-1, 1]);
      if (axis === 'v') {
        // travelling along z; turn onto a horizontal road
        const nz = nearestLine(z + turn * P * rangeInt(rng, 1, 3));
        z = clampNum(nz, -B * P, B * P);
        axis = 'h';
      } else {
        const nx = nearestLine(x + turn * P * rangeInt(rng, 1, 3));
        x = clampNum(nx, -B * P, B * P);
        axis = 'v';
      }
      pts.push({ x, z });
    }
    return pts;
  }

  // A random road position, used to spawn traffic and parked cars.
  function randomRoadPoint(rng) {
    const axis = pick(rng, ['v', 'h']);
    const line = pick(rng, lines);
    const along = rangeInt(rng, -B, B) * P + rangeInt(rng, -20, 20);
    return axis === 'v'
      ? { x: line + pick(rng, [-2.5, 2.5]), z: along }
      : { x: along, z: line + pick(rng, [-2.5, 2.5]) };
  }

  return { lines, edge, nearestLine, snap, onRoad, inBounds, makeRoute, randomRoadPoint };
}
