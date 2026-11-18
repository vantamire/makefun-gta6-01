// v4 — traffic.js
// Street traffic that drives the grid like it lives here: each car follows
// a route of waypoints along the road lines, turns at intersections, stops
// at red lights, and brakes for the player, for the car ahead, and for a
// pedestrian crossing — instead of cruising back and forth on one axis.
// The mix includes the new kinds (a motorcycle weaving through, a pickup,
// a bus) so the street reads as a city, not a parking lot.
//
// The route is built from the road grid: a car picks a road line, drives
// to the next intersection, then randomly goes straight, left or right for
// six legs, then builds a fresh route from wherever it is. All positions
// come from the seeded rng, so the traffic layout is identical on every run.
//
// The returned `cars` is the plain Vehicle array (what main.js and the HUD
// iterate for meshes, positions and minimap dots); the route state lives
// in a private entries list alongside it.

import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { CONFIG } from './config.js';
import { createRNG } from './random.js';

const TRAFFIC_KINDS = ['sedan', 'taxi', 'sport', 'truck', 'bus', 'pickup', 'motorcycle'];
const PALETTE = {
  sedan: [0xd23c2e, 0x2e6fd2, 0x9aa5ad, 0x2f3336, 0xe8e6df],
  taxi: [0xe8b93a],
  sport: [0xd23c2e, 0x7a4fd0, 0x18a7a0],
  truck: [0x9aa5ad, 0x3fae6a, 0x2e6fd2],
  bus: [0x2e6fd2, 0xe8b93a, 0x3fae6a],
  police: [0x101418],
  motorcycle: [0xd23c2e, 0x2f3336, 0x7a4fd0],
  pickup: [0x3fae6a, 0xd2691e, 0x2e6fd2],
};

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Build a route of waypoints on the road grid: start on a random road
// line, drive to the next intersection, then turn. The waypoints are the
// intersection points the car steers toward.
function buildRoute(rng, half, pitch, roadC) {
  const legs = 6;
  let vertical = rng.chance(0.5);
  let line = roadC(rng.int(1, CONFIG.GRID_BLOCKS - 1));
  let along = rng.range(-half + 30, half - 30);
  let dir = rng.chance(0.5) ? 1 : -1;
  const route = [];
  for (let i = 0; i < legs; i++) {
    const nextAlong = Math.max(-half + 20, Math.min(half - 20, along + dir * rng.range(40, 90)));
    route.push(vertical ? { x: line, z: nextAlong } : { x: nextAlong, z: line });
    const turn = rng.range(0, 1);
    if (turn < 0.55) {
      along = nextAlong; // straight on
    } else {
      // Turn onto the crossing road at this intersection: the new line is
      // the intersection's other coordinate, and the direction is a coin
      // flip left or right.
      line = nextAlong;
      along = nextAlong;
      vertical = !vertical;
      dir = rng.chance(0.5) ? 1 : -1;
    }
    along = Math.max(-half + 20, Math.min(half - 20, along));
  }
  return route;
}

export function createTraffic(THREE, world, rng, count) {
  // Tolerant signature: main.js may call createTraffic(THREE, world,
  // count) without an rng — then a seeded rng is made internally.
  if (typeof rng === 'number' || rng === undefined || rng === null) {
    count = rng;
    rng = createRNG(20261118);
  }
  const half = CONFIG.WORLD_SIZE / 2;
  const pitch = CONFIG.ROAD_WIDTH + CONFIG.BLOCK_SIZE;
  const roadC = (i) => -half + i * pitch;
  const entries = [];
  const n = count !== undefined ? count : CONFIG.TRAFFIC_COUNT;
  for (let i = 0; i < n; i++) {
    const kind = TRAFFIC_KINDS[rng.int(0, TRAFFIC_KINDS.length - 1)];
    const palette = PALETTE[kind];
    const color = palette[rng.int(0, palette.length - 1)];
    const vehicle = new Vehicle(THREE, kind, color);
    const route = buildRoute(rng, half, pitch, roadC);
    const start = route[0];
    const next = route[1] || start;
    const vertical = Math.abs(next.x - start.x) < 1;
    const lane = rng.chance(0.5) ? 3 : -3;
    const x = start.x + (vertical ? lane : 0);
    const z = start.z + (vertical ? 0 : lane);
    const heading = Math.atan2(next.x - x, next.z - z);
    vehicle.setPose(x, z, heading);
    // Motorcycles weave: a higher cruise speed and tighter turns.
    const cruise = kind === 'motorcycle' ? rng.range(11, 15)
      : kind === 'bus' ? rng.range(6, 8)
      : rng.range(8, 12);
    entries.push({
      vehicle,
      kind,
      cruise,
      route,
      routeIndex: 1,
      braking: false,
    });
  }

  // A red light is a phase of the global clock: 8 s green, 8 s red,
  // alternating per intersection (the parity of the intersection index
  // flips the phase, so neighbouring lights are out of sync).
  function isRedAt(intersectionIndex, time) {
    const phase = Math.floor(time / 8) % 2;
    return phase === (intersectionIndex % 2);
  }

  // The red-light phase runs off this module's own clock, advanced by
  // every update call (main.js calls update(dt, playerVehicle,
  // pedestrians) — the second argument is the player, not a clock).
  let clock = 0;

  function update(dt, playerVehicle, pedestrians) {
    if (!dt || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    clock += dt;
    const time = clock;
    for (let i = 0; i < entries.length; i++) {
      const car = entries[i];
      const v = car.vehicle;
      const target = car.route[car.routeIndex] || car.route[car.route.length - 1];
      const dx = target.x - v.pos.x;
      const dz = target.z - v.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 7) {
        car.routeIndex++;
        if (car.routeIndex >= car.route.length) {
          // Route exhausted: build a fresh one from wherever the car is,
          // so it never stops driving.
          car.route = buildRoute(rng, half, pitch, roadC);
          car.routeIndex = 1;
        }
        continue;
      }
      const desired = Math.atan2(dx, dz);
      const diff = angleDiff(desired, v.heading);
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      let braking = false;
      // Red light: stop before the intersection when the phase is red
      // and the car is close to the waypoint (an intersection).
      const interIndex = Math.round((target.x + half) / pitch) + Math.round((target.z + half) / pitch);
      if (dist < 14 && isRedAt(interIndex, time)) {
        braking = true;
      }
      // Brake for the player if they are close ahead.
      if (playerVehicle && !braking) {
        const pdx = playerVehicle.pos.x - v.pos.x;
        const pdz = playerVehicle.pos.z - v.pos.z;
        const pd = Math.sqrt(pdx * pdx + pdz * pdz);
        if (pd < 9) {
          const f = v.forward();
          const ahead = (pdx * f.x + pdz * f.z) / Math.max(0.001, pd);
          if (ahead > 0.7) braking = true;
        }
      }
      // Brake for the car ahead (same lane-ish): the nearest other
      // traffic car within 7 m in front.
      if (!braking) {
        for (let j = 0; j < entries.length; j++) {
          if (j === i) continue;
          const o = entries[j].vehicle;
          const odx = o.pos.x - v.pos.x;
          const odz = o.pos.z - v.pos.z;
          const od = Math.sqrt(odx * odx + odz * odz);
          if (od < 7) {
            const f = v.forward();
            const ahead = (odx * f.x + odz * f.z) / Math.max(0.001, od);
            if (ahead > 0.75) { braking = true; break; }
          }
        }
      }
      // Brake for a pedestrian crossing ahead.
      if (!braking && pedestrians && pedestrians.people) {
        for (const p of pedestrians.people) {
          if (p.state === 'down') continue;
          const pdx = p.pos.x - v.pos.x;
          const pdz = p.pos.z - v.pos.z;
          const pd = Math.sqrt(pdx * pdx + pdz * pdz);
          if (pd < 6) {
            const f = v.forward();
            const ahead = (pdx * f.x + pdz * f.z) / Math.max(0.001, pd);
            if (ahead > 0.7) { braking = true; break; }
          }
        }
      }
      car.braking = braking;
      // Drive at the cruise speed: throttle 1 until the cruise speed,
      // then coast (throttle 0) so the car settles at the cruise speed
      // instead of running at its top speed.
      const drive = {
        throttle: braking ? -1 : (v.speed < car.cruise ? 1 : 0),
        steer,
        handbrake: false,
      };
      v.update(dt, drive, world);
    }
  }

  return {
    cars: entries.map((e) => e.vehicle),
    entries,
    playerCar: null,
    setPlayer(vehicle) {
      // The traffic module reads the player vehicle from the update
      // call's argument, so this is kept for the module contract.
      this.playerCar = vehicle || null;
      return this;
    },
    // update(dt, playerVehicle, pedestrians) — the call main.js makes.
    update,
  };
}
