// VICE HARBOR — traffic.js
// Ambient traffic: cars that cruise rectangular loops around city blocks on
// the road grid, slow near intersections, and yield when the player's car is
// right ahead of them. Built on the shared Vehicle class so traffic cars
// look, steer and spin exactly like the player's cars.

import * as THREE from 'three';
import { Vehicle, mulberry32 } from './vehicles.js';

// City grid (shared with the world builder): 8x8 blocks of 40, roads 12
// wide, road centres every 52. Re-derived from the world when it tells us
// more, so this file never breaks if the grid constants move.
const BLOCK = 40;
const ROAD = 12;
const BLOCKS = 8;
const PITCH = BLOCK + ROAD; // 52
const HALF = (BLOCKS * BLOCK + (BLOCKS + 1) * ROAD) / 2; // 214

function defaultRoadCentres() {
  // Must match the world builder: roads sit in the middle of the gaps
  // between blocks, at -HALF + k*PITCH (world.js places them there); the
  // -HALF - ROAD/2 form lands 6 m off, on the blocks, where traffic
  // would drive through buildings.
  const centres = [];
  for (let k = 0; k <= BLOCKS; k += 1) centres.push(-HALF + k * PITCH);
  return centres;
}

// Pull road centre lines out of world.roads, whatever shape the world
// builder used for a segment ({x1,z1,x2,z2} / {start,end} / {axis,at,...}).
function roadCentresFromWorld(world) {
  const xs = new Set();
  const zs = new Set();
  const roads = world && Array.isArray(world.roads) ? world.roads : null;
  if (roads) {
    for (const r of roads) {
      if (!r) continue;
      let x1; let z1; let x2; let z2;
      if (typeof r.x1 === 'number') { x1 = r.x1; z1 = r.z1; x2 = r.x2; z2 = r.z2; }
      else if (r.start && r.end) { x1 = r.start.x; z1 = r.start.z; x2 = r.end.x; z2 = r.end.z; }
      else if (r.from && r.to) { x1 = r.from.x; z1 = r.from.z; x2 = r.to.x; z2 = r.to.z; }
      else if (typeof r.axis === 'string' && typeof r.at === 'number') {
        if (r.axis === 'x') zs.add(r.at);
        else xs.add(r.at);
        continue;
      } else if (typeof r.x === 'number' && typeof r.z === 'number') {
        // A point (e.g. an intersection marker): not a road line.
        continue;
      } else continue;
      if (x1 === undefined || z1 === undefined || x2 === undefined || z2 === undefined) continue;
      if (Math.abs(x2 - x1) < 0.001) xs.add((x1 + x2) / 2); // vertical road
      else if (Math.abs(z2 - z1) < 0.001) zs.add((z1 + z2) / 2); // horizontal road
    }
  }
  const xsArr = [...xs].sort((a, b) => a - b);
  const zsArr = [...zs].sort((a, b) => a - b);
  // Fall back to the grid if the world gave us nothing usable.
  return {
    xs: xsArr.length >= 2 ? xsArr : defaultRoadCentres(),
    zs: zsArr.length >= 2 ? zsArr : defaultRoadCentres(),
  };
}

// A loop is the rectangle of four roads around one block, driven on the
// right-hand side (inset by the lane offset). Stored as corner points in
// driving order plus per-segment lengths for distance-based motion.
function buildLoop(xs, zs, i, j, lane, clockwise) {
  const x0 = xs[i] + lane;
  const x1 = xs[i + 1] - lane;
  const z0 = zs[j] + lane;
  const z1 = zs[j + 1] - lane;
  let pts = [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ];
  if (!clockwise) pts = pts.slice().reverse();
  const segs = [];
  let total = 0;
  for (let k = 0; k < pts.length; k += 1) {
    const a = pts[k];
    const b = pts[(k + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push({ a, b, len });
    total += len;
  }
  return { pts, segs, total };
}

function positionOnLoop(loop, dist) {
  let d = ((dist % loop.total) + loop.total) % loop.total;
  for (const seg of loop.segs) {
    if (d <= seg.len || seg === loop.segs[loop.segs.length - 1]) {
      const t = seg.len > 0 ? Math.min(1, d / seg.len) : 0;
      const x = seg.a.x + (seg.b.x - seg.a.x) * t;
      const z = seg.a.z + (seg.b.z - seg.a.z) * t;
      const heading = Math.atan2(seg.b.x - seg.a.x, seg.b.z - seg.a.z);
      // Distance to the next corner (for the intersection slow-down).
      const toCorner = seg.len - d;
      return { x, z, heading, toCorner };
    }
    d -= seg.len;
  }
  const p = loop.pts[0];
  return { x: p.x, z: p.z, heading: 0, toCorner: 0 };
}

const TRAFFIC_KINDS = ['sedan', 'sedan', 'sedan', 'taxi', 'sport', 'truck', 'sedan'];

/**
 * @param {object} THREEImpl the three.js module (or the imported one)
 * @param {object} world the world object ({ roads, group, bounds })
 * @param {number} n how many traffic cars to spawn
 * @returns {{ cars: Vehicle[], update(dt, playerCar?, pedestrians?), playerCar, setPlayer }}
 *   update's optional second argument is the player's current Vehicle (or
 *   any { pos, speed, heading } object); setPlayer() stores it instead.
 *   The optional third argument is the pedestrians system ({ people }):
 *   traffic slows for a pedestrian crossing in front of a car.
 */
export function createTraffic(THREEImpl, world, n) {
  const T = THREEImpl || THREE;
  const rng = mulberry32(20261118);
  const { xs, zs } = roadCentresFromWorld(world);
  const lane = 2.6; // right-hand lane offset from the road centre line
  const count = Math.max(0, n | 0);
  const cars = [];

  for (let i = 0; i < count; i += 1) {
    const bi = Math.floor(rng() * (xs.length - 1));
    const bj = Math.floor(rng() * (zs.length - 1));
    const clockwise = rng() < 0.5;
    const loop = buildLoop(xs, zs, bi, bj, lane, clockwise);
    const kind = TRAFFIC_KINDS[Math.floor(rng() * TRAFFIC_KINDS.length)];
    const car = new Vehicle(T, kind);
    car.driver = 'traffic';
    const baseSpeed = 8 + rng() * 5; // 8–13 m/s, per-car variation
    const entry = {
      car,
      loop,
      dist: rng() * loop.total,
      baseSpeed,
      speed: baseSpeed,
      phase: rng() * Math.PI * 2, // sine wobble so the flow looks alive
      slowTimer: 0,
    };
    const pose = positionOnLoop(loop, entry.dist);
    car.setPose(pose.x, pose.z, pose.heading);
    car.speed = baseSpeed;
    cars.push(entry);
    if (world && world.group && typeof world.group.add === 'function') {
      world.group.add(car.mesh);
    }
  }

  const traffic = {
    cars: cars.map((e) => e.car),
    // Exposed so the main loop can wire the player's car once and forget it.
    playerCar: null,
    setPlayer(car) {
      traffic.playerCar = car || null;
      return traffic;
    },

    update(dt, playerCar, pedestrians) {
      if (!dt || dt <= 0) return traffic;
      dt = Math.min(dt, 0.05);
      const player = playerCar || traffic.playerCar;
      // Player forward vector, for the "car ahead of the player" check.
      let pfx = 0;
      let pfz = 1;
      let playerPos = null;
      let playerSpeed = 0;
      if (player && player.pos) {
        playerPos = player.pos;
        playerSpeed = Math.abs(player.speed || 0);
        const h = player.heading || 0;
        pfx = Math.sin(h);
        pfz = Math.cos(h);
      }
      // Pedestrians on the road: traffic slows for anyone crossing ahead
      // instead of driving through them (v2 — the crowd and the cars
      // finally notice each other).
      const walkers = pedestrians && pedestrians.people ? pedestrians.people : null;
      const now = (traffic._time = (traffic._time || 0) + dt);

      for (const entry of cars) {
        const { car, loop } = entry;
        // Base flow: a gentle sine so cars bunch and stretch like real traffic.
        let factor = 0.74 + 0.26 * Math.sin(now * 0.8 + entry.phase);
        // Slow briefly at intersections (approaching a corner).
        const ahead = positionOnLoop(loop, entry.dist + entry.baseSpeed * 1.2);
        if (ahead.toCorner < 9) factor *= 0.55 + 0.45 * (ahead.toCorner / 9);
        // Yield to a pedestrian crossing just ahead of this car.
        if (walkers) {
          const fx = Math.sin(car.heading);
          const fz = Math.cos(car.heading);
          for (const p of walkers) {
            if (p.state === 'down') continue;
            const dx = p.pos.x - car.pos.x;
            const dz = p.pos.z - car.pos.z;
            const along = dx * fx + dz * fz;
            if (along > 0 && along < 7) {
              const side = Math.abs(dx * fz - dz * fx);
              if (side < 2.2) { factor *= 0.25; break; }
            }
          }
        }
        // Yield: a traffic car sitting just ahead of the player's car slows
        // down instead of being rear-ended at full speed.
        if (playerPos && playerSpeed > 2) {
          const dx = car.pos.x - playerPos.x;
          const dz = car.pos.z - playerPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 9 && dist > 0.01) {
            const along = (dx * pfx + dz * pfz) / dist; // +1 = straight ahead
            if (along > 0.45) factor *= 0.3;
          }
        }
        entry.speed = entry.baseSpeed * factor;
        entry.dist += entry.speed * dt;
        const pose = positionOnLoop(loop, entry.dist);
        car.setPose(pose.x, pose.z, pose.heading);
        car.speed = entry.speed;
        car.roll(dt);
        for (const w of car.frontWheels) w.steerGroup.rotation.y = 0;
      }
      return traffic;
    },
  };
  return traffic;
}
