// VICE HARBOR — pedestrians.js
// Sidewalk life: low-poly people who stroll block perimeters on seeded
// waypoints, pause to look around, and sprint away from the road when a
// fast car bears down on them. Cheap by design — shared geometries and a
// small cached set of shirt materials for the whole crowd.

import * as THREE from 'three';
import { mulberry32 } from './vehicles.js';

// City grid (shared with the world builder): 8x8 blocks of 40, roads 12
// wide, road centres every 52. Sidewalks sit just off the road edge.
const BLOCK = 40;
const ROAD = 12;
const BLOCKS = 8;
const PITCH = BLOCK + ROAD; // 52
const HALF = (BLOCKS * BLOCK + (BLOCKS + 1) * ROAD) / 2; // 214
const SIDEWALK = ROAD / 2 + 1.6; // distance from a road centre line

function defaultRoadCentres() {
  // Must match the world builder: roads sit at -HALF - ROAD/2 + k*PITCH
  // (world.js places them there); the +ROAD/2 form lands 12 m off, on the
  // blocks, where pedestrians would walk through buildings.
  const centres = [];
  for (let k = 0; k <= BLOCKS; k += 1) centres.push(-HALF - ROAD / 2 + k * PITCH);
  return centres;
}

// -- shared art: one body, one head, one legs geometry for every person ----
let _bodyGeo = null;
let _headGeo = null;
let _legsGeo = null;
let _armGeo = null;
const _shirtMats = new Map();
let _skinMat = null;
let _legsMat = null;

const SHIRT_COLORS = [
  0xd23c2e, 0x2e6fd2, 0xe8b93a, 0x3fae6a, 0x7a4fd0,
  0xe8e6df, 0x18a7a0, 0xd2691e, 0x5a6b7a, 0xc94f7c,
];
const SKIN_COLORS = [0xc68e5f, 0x8a5a3b, 0xe8b88a, 0x6e4530, 0xd9a066];

function sharedArt(T) {
  if (!_bodyGeo) {
    _bodyGeo = new T.BoxGeometry(0.52, 0.72, 0.3);
    _headGeo = new T.SphereGeometry(0.21, 10, 8);
    _legsGeo = new T.BoxGeometry(0.44, 0.62, 0.26);
    _armGeo = new T.BoxGeometry(0.11, 0.6, 0.11);
    _legsMat = new T.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 });
  }
  return { bodyGeo: _bodyGeo, headGeo: _headGeo, legsGeo: _legsGeo, armGeo: _armGeo, legsMat: _legsMat };
}

function shirtMat(T, color) {
  if (!_shirtMats.has(color)) {
    _shirtMats.set(color, new T.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }));
  }
  return _shirtMats.get(color);
}

function skinMat(T, color) {
  if (!_skinMat) _skinMat = new Map();
  if (!_skinMat.has(color)) {
    _skinMat.set(color, new T.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 }));
  }
  return _skinMat.get(color);
}

function buildPersonMesh(T, rng) {
  const art = sharedArt(T);
  const shirt = SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)];
  const skin = SKIN_COLORS[Math.floor(rng() * SKIN_COLORS.length)];
  const group = new T.Group();
  group.name = 'pedestrian';

  const legs = new T.Mesh(art.legsGeo, art.legsMat);
  legs.position.y = 0.31;
  legs.castShadow = true;
  const body = new T.Mesh(art.bodyGeo, shirtMat(T, shirt));
  body.position.y = 0.98;
  body.castShadow = true;
  const head = new T.Mesh(art.headGeo, skinMat(T, skin));
  head.position.y = 1.52;
  head.castShadow = true;
  // A little hair cap so heads are not bare spheres.
  const hair = new T.Mesh(
    new T.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new T.MeshStandardMaterial({ color: 0x201510, roughness: 0.95 }),
  );
  hair.position.y = 1.56;
  const armL = new T.Mesh(art.armGeo, shirtMat(T, shirt));
  armL.position.set(-0.33, 0.98, 0);
  const armR = new T.Mesh(art.armGeo, shirtMat(T, shirt));
  armR.position.set(0.33, 0.98, 0);

  group.add(legs, body, head, hair, armL, armR);
  group.userData.arms = [armL, armR];
  return group;
}

// Pick a random point on a block's sidewalk rectangle (inset SIDEWALK from
// the surrounding road centre lines, i.e. just off the road edge).
function randomSidewalkPoint(rng, xs, zs) {
  const i = Math.floor(rng() * (xs.length - 1));
  const j = Math.floor(rng() * (zs.length - 1));
  const x0 = xs[i] + SIDEWALK;
  const x1 = xs[i + 1] - SIDEWALK;
  const z0 = zs[j] + SIDEWALK;
  const z1 = zs[j + 1] - SIDEWALK;
  const edge = Math.floor(rng() * 4);
  const t = rng();
  if (edge === 0) return { x: x0 + (x1 - x0) * t, z: z0 };
  if (edge === 1) return { x: x0 + (x1 - x0) * t, z: z1 };
  if (edge === 2) return { x: x0, z: z0 + (z1 - z0) * t };
  return { x: x1, z: z0 + (z1 - z0) * t };
}

/**
 * @param {object} THREEImpl the three.js module (or the imported one)
 * @param {object} world the world object ({ group, bounds })
 * @param {number} n how many pedestrians to spawn
 * @returns {{ people, update(dt, playerCar?), playerCar, onHit, lastHit }}
 *   update's optional second argument is the player's current Vehicle (or
 *   any { pos, speed } object); setPlayer() stores it instead. When a
 *   fast car hits a pedestrian, the person is knocked down, `lastHit` is
 *   set to { person, at } and `onHit(person)` is called if assigned —
 *   the main loop can turn that into a wanted-level bump.
 */
export function createPedestrians(THREEImpl, world, n) {
  const T = THREEImpl || THREE;
  const rng = mulberry32(777001);
  const xs = defaultRoadCentres();
  const zs = defaultRoadCentres();
  const bounds = (world && world.bounds) || { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };
  const count = Math.max(0, n | 0);
  const people = [];

  for (let i = 0; i < count; i += 1) {
    const start = randomSidewalkPoint(rng, xs, zs);
    const mesh = buildPersonMesh(T, rng);
    mesh.position.set(start.x, 0, start.z);
    const person = {
      mesh,
      pos: mesh.position, // alias, like Vehicle.pos
      heading: rng() * Math.PI * 2,
      walkSpeed: 1.1 + rng() * 0.8,
      speed: 0,
      state: 'walk', // 'walk' | 'pause' | 'flee' | 'down'
      waypoint: randomSidewalkPoint(rng, xs, zs),
      pauseTimer: rng() * 2,
      fleeTimer: 0,
      downTimer: 0,
      phase: rng() * Math.PI * 2, // walk-cycle phase for the arm swing
    };
    mesh.rotation.y = person.heading;
    people.push(person);
    if (world && world.group && typeof world.group.add === 'function') {
      world.group.add(mesh);
    }
  }

  const peds = {
    people,
    playerCar: null,
    // Assignable hook: peds.onHit = (person) => police.addWanted(1)
    onHit: null,
    // Last knock-down, or null: { person, at } with `at` = peds.time.
    lastHit: null,
    time: 0,

    setPlayer(car) {
      peds.playerCar = car || null;
      return peds;
    },

    /** Knock one pedestrian down (a car hit them). Public so the main loop
     *  can also trigger it from its own collision check. */
    knockDown(person) {
      if (!person || person.state === 'down') return;
      person.state = 'down';
      person.downTimer = 3.5;
      person.speed = 0;
      person.mesh.rotation.z = Math.PI / 2; // flat on the sidewalk
      person.mesh.rotation.y = person.heading;
      peds.lastHit = { person, at: peds.time };
      if (typeof peds.onHit === 'function') {
        try { peds.onHit(person); } catch { /* a hook must never break the crowd */ }
      }
    },

    update(dt, playerCar) {
      if (!dt || dt <= 0) return peds;
      dt = Math.min(dt, 0.05);
      peds.time += dt;
      const player = playerCar || peds.playerCar;
      const playerPos = player && player.pos ? player.pos : null;
      const playerSpeed = player ? Math.abs(player.speed || 0) : 0;
      // Only a moving car scares people; a parked car (or the player on
      // foot, speed 0) lets them stroll.
      const carIsThreat = !!playerPos && playerSpeed > 6;

      for (const p of people) {
        if (p.state === 'down') {
          p.downTimer -= dt;
          if (p.downTimer <= 0) {
            // Dust off and carry on, a little shaken (and slower).
            p.state = 'walk';
            p.mesh.rotation.z = 0;
            p.mesh.rotation.y = p.heading;
            p.walkSpeed = Math.max(0.8, p.walkSpeed * 0.85);
            p.waypoint = randomSidewalkPoint(rng, xs, zs);
          }
          continue;
        }

        // Flee: a fast car within ~8 units sends them running away from
        // the road (away from the car, clamped inside the city).
        if (carIsThreat && p.state !== 'flee') {
          const dx = p.pos.x - playerPos.x;
          const dz = p.pos.z - playerPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 8) {
            p.state = 'flee';
            p.fleeTimer = 1.4;
            p.fleeX = dx / (dist || 1);
            p.fleeZ = dz / (dist || 1);
          }
        }

        if (p.state === 'flee') {
          p.fleeTimer -= dt;
          const runSpeed = 4.2;
          p.speed = runSpeed;
          p.pos.x += p.fleeX * runSpeed * dt;
          p.pos.z += p.fleeZ * runSpeed * dt;
          p.heading = Math.atan2(p.fleeX, p.fleeZ);
          p.mesh.rotation.y = p.heading;
          // Keep them inside the city; at the edge, turn back in.
          p.pos.x = Math.max(bounds.minX + 2, Math.min(bounds.maxX - 2, p.pos.x));
          p.pos.z = Math.max(bounds.minZ + 2, Math.min(bounds.maxZ - 2, p.pos.z));
          if (p.fleeTimer <= 0) {
            p.state = 'walk';
            p.waypoint = randomSidewalkPoint(rng, xs, zs);
          }
        } else if (p.state === 'pause') {
          p.speed = 0;
          p.pauseTimer -= dt;
          if (p.pauseTimer <= 0) {
            p.state = 'walk';
            p.waypoint = randomSidewalkPoint(rng, xs, zs);
          }
        } else {
          // Walk toward the waypoint; on arrival, sometimes pause and
          // look around before picking the next one.
          const dx = p.waypoint.x - p.pos.x;
          const dz = p.waypoint.z - p.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.6) {
            if (rng() < 0.35) {
              p.state = 'pause';
              p.pauseTimer = 1 + rng() * 3;
              p.speed = 0;
            } else {
              p.waypoint = randomSidewalkPoint(rng, xs, zs);
            }
          } else {
            const targetHeading = Math.atan2(dx, dz);
            // Turn smoothly toward the waypoint instead of snapping.
            let diff = targetHeading - p.heading;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            p.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
            p.speed = p.walkSpeed;
            p.pos.x += Math.sin(p.heading) * p.speed * dt;
            p.pos.z += Math.cos(p.heading) * p.speed * dt;
            p.mesh.rotation.y = p.heading;
          }
        }

        // Hit check: a fast car clipping a pedestrian knocks them down.
        if (carIsThreat) {
          const dx = p.pos.x - playerPos.x;
          const dz = p.pos.z - playerPos.z;
          if (dx * dx + dz * dz < 2.2 * 2.2) peds.knockDown(p);
        }

        // Walk-cycle: arms swing with the stride, faster when fleeing.
        const swing = Math.sin(peds.time * (p.state === 'flee' ? 11 : 6) + p.phase)
          * (p.speed > 0.1 ? 0.55 : 0);
        const arms = p.mesh.userData.arms;
        if (arms) {
          arms[0].rotation.x = swing;
          arms[1].rotation.x = -swing;
        }
        // Little bob while moving.
        p.mesh.position.y = p.speed > 0.1 ? Math.abs(Math.sin(peds.time * 6 + p.phase)) * 0.04 : 0;
      }
      return peds;
    },
  };
  return peds;
}
