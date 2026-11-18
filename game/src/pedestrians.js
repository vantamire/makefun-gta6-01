// v4 — pedestrians.js
// Sidewalk life: low-poly people who stroll the block sidewalks on seeded
// waypoints, pause to look around, cross at the crosswalks, and sprint
// away from the road when a fast car — the player's or a police cruiser's
// — bears down on them. A shove (the player's F punch, or the new pistol)
// knocks one down for a couple of seconds, after which they scramble up
// and flee. New in v4: a share of the crowd strolls the BOARDWALK instead
// of the city streets — ambling along the planks, pausing at the food
// stalls — so the harbour district feels lived-in too.
//
// Cheap by design: one shared geometry per body part for the whole crowd,
// a small cached set of materials, and per-person variety from scale,
// shirt, skin, trousers, hats and the odd shoulder bag. Each person is a
// Walker object with its own tiny state machine (walk / pause / flee /
// down) driven by one step() method.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRNG } from './random.js';

// City grid (shared with the world builder): 8x8 blocks of 40, roads 12
// wide, road centres every 52. Sidewalks sit just off the road edge.
const BLOCK = 40;
const ROAD = 12;
const BLOCKS = 8;
const PITCH = BLOCK + ROAD; // 52
const HALF = (BLOCKS * BLOCK + (BLOCKS + 1) * ROAD) / 2; // 214
const SIDEWALK = ROAD / 2 + 1.6; // distance from a road centre line
const BOARDWALK_X = 221; // centre of the boardwalk deck (see world.js)

function roadCentres() {
  const centres = [];
  for (let k = 0; k <= BLOCKS; k += 1) centres.push(-HALF + k * PITCH);
  return centres;
}

const SHIRT_COLORS = [
  0xd23c2e, 0x2e6fd2, 0xe8b93a, 0x3fae6a, 0x7a4fd0,
  0xe8e6df, 0x18a7a0, 0xd2691e, 0xff5a8a, 0x9be62e,
  0xff8c1a, 0x2ee6c8, 0xff3c5a, 0x7ac2ff, 0xc94f7c,
];
const SKIN_COLORS = [0xc68e5f, 0x8a5a3b, 0xe8b88a, 0x6e4530, 0xd9a066, 0xa06a42];
const PANTS_COLORS = [0x2a2f38, 0x3a3f4a, 0x5a4632, 0x2e4a3a, 0x6b6b7a, 0x1e2a3a];
const HAIR_COLORS = [0x201510, 0x3a2a1a, 0x6b6b6b, 0x111111, 0x8a5a2a];

// One shared geometry per body part, plus a material cache keyed by
// colour, so a crowd of sixty costs little more than a crowd of six.
let _art = null;
const _matCache = new Map();
function art(T) {
  if (!_art) {
    _art = {
      bodyGeo: new T.BoxGeometry(0.52, 0.72, 0.3),
      headGeo: new T.SphereGeometry(0.21, 10, 8),
      legsGeo: new T.BoxGeometry(0.44, 0.62, 0.26),
      armGeo: new T.BoxGeometry(0.11, 0.6, 0.11),
      capGeo: new T.CylinderGeometry(0.22, 0.23, 0.09, 10),
      bagGeo: new T.BoxGeometry(0.22, 0.3, 0.12),
    };
  }
  return _art;
}
function cachedMat(T, color, roughness) {
  const key = `${color}|${roughness ?? 0.85}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new T.MeshStandardMaterial({ color, roughness: roughness ?? 0.85, metalness: 0 }));
  }
  return _matCache.get(key);
}

// Build one person's figure: legs, torso, head with a hair cap, arms,
// and a hat or a bag on a share of the crowd. People are not all the
// same height — the scale spreads, so the crowd reads as individuals.
function buildFigure(T, rng) {
  const a = art(T);
  const shirt = SHIRT_COLORS[rng.int(0, SHIRT_COLORS.length - 1)];
  const skin = SKIN_COLORS[rng.int(0, SKIN_COLORS.length - 1)];
  const pants = PANTS_COLORS[rng.int(0, PANTS_COLORS.length - 1)];
  const hairColor = HAIR_COLORS[rng.int(0, HAIR_COLORS.length - 1)];
  const group = new T.Group();
  group.name = 'pedestrian';
  const part = (geo, mat, x, y, z) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  part(a.legsGeo, cachedMat(T, pants, 0.9), 0, 0.31, 0);
  part(a.bodyGeo, cachedMat(T, shirt), 0, 0.98, 0);
  part(a.headGeo, cachedMat(T, skin, 0.7), 0, 1.52, 0);
  // Hair cap so heads are not bare spheres.
  const hair = new T.Mesh(
    new T.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new T.MeshStandardMaterial({ color: hairColor, roughness: 0.95 })
  );
  hair.position.y = 1.56;
  group.add(hair);
  const armL = part(a.armGeo, cachedMat(T, shirt), -0.33, 0.98, 0);
  const armR = part(a.armGeo, cachedMat(T, shirt), 0.33, 0.98, 0);
  // Hats: a cap (with a brim) or a beanie on about a third of the crowd.
  const hatRoll = rng.range(0, 1);
  if (hatRoll < 0.2) {
    const capMat = new T.MeshStandardMaterial({ color: rng.chance(0.5) ? 0xd23c2e : 0x2e6fd2, roughness: 0.9 });
    part(a.capGeo, capMat, 0, 1.68, 0);
    const brim = new T.Mesh(new T.BoxGeometry(0.24, 0.03, 0.16), capMat);
    brim.position.set(0, 1.65, 0.24);
    group.add(brim);
  } else if (hatRoll < 0.35) {
    const beanie = new T.Mesh(
      new T.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new T.MeshStandardMaterial({ color: rng.chance(0.5) ? 0x3fae6a : 0x7a4fd0, roughness: 0.95 })
    );
    beanie.position.y = 1.56;
    group.add(beanie);
  }
  // A shoulder bag on about one in five.
  if (rng.chance(0.2)) {
    part(a.bagGeo, new T.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }), 0.32, 0.85, 0);
  }
  group.scale.setScalar(0.95 + rng.range(0, 0.2));
  group.userData.arms = [armL, armR];
  return group;
}

// Pick a random point on a block's sidewalk rectangle (inset SIDEWALK from
// the surrounding road centre lines, i.e. just off the road edge).
function sidewalkPoint(rng, xs, zs) {
  const i = rng.int(0, xs.length - 2);
  const j = rng.int(0, zs.length - 2);
  const x0 = xs[i] + SIDEWALK;
  const x1 = xs[i + 1] - SIDEWALK;
  const z0 = zs[j] + SIDEWALK;
  const z1 = zs[j + 1] - SIDEWALK;
  const edge = rng.int(0, 3);
  const t = rng.range(0, 1);
  if (edge === 0) return { x: x0 + (x1 - x0) * t, z: z0 };
  if (edge === 1) return { x: x0 + (x1 - x0) * t, z: z1 };
  if (edge === 2) return { x: x0, z: z0 + (z1 - z0) * t };
  return { x: x1, z: z0 + (z1 - z0) * t };
}

// A point on the sidewalk directly across one road from `from`: the
// person crosses at a road line (where the crosswalks are) instead of
// cutting diagonally across a block.
function crosswalkPoint(rng, xs, zs, from) {
  if (rng.chance(0.5)) {
    const c = xs[rng.int(0, xs.length - 1)];
    const along = -HALF + 20 + rng.range(0, HALF * 2 - 40);
    const side = from.x < c ? 1 : -1;
    return { x: c + side * SIDEWALK, z: along };
  }
  const c = zs[rng.int(0, zs.length - 1)];
  const along = -HALF + 20 + rng.range(0, HALF * 2 - 40);
  const side = from.z < c ? 1 : -1;
  return { x: along, z: c + side * SIDEWALK };
}

// A point on the boardwalk deck, for the harbour strollers.
function boardwalkPoint(rng) {
  return {
    x: BOARDWALK_X + rng.range(-3, 3),
    z: rng.range(-HALF + 20, HALF - 20),
  };
}

// The next waypoint for a person: a boardwalk stroller stays on the
// boardwalk; a city walker usually picks another block's sidewalk and
// sometimes crosses to the far side of the road they stand by.
function pickWaypoint(rng, xs, zs, from, district) {
  if (district === 'boardwalk') return boardwalkPoint(rng);
  if (rng.chance(CONFIG.PED_CROSSWALK_CHANCE)) return crosswalkPoint(rng, xs, zs, from);
  return sidewalkPoint(rng, xs, zs);
}

// Turn `heading` toward `target` at most `rate` radians per second.
function turnToward(heading, target, rate, dt) {
  let diff = target - heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return heading + Math.max(-rate * dt, Math.min(rate * dt, diff));
}

// One person: a tiny state machine (walk / pause / flee / down) with a
// mesh, a position alias, and the timers the main loop and the shots
// staging poke at.
class Walker {
  constructor(T, rng, xs, zs, district) {
    this.district = district;
    const start = district === 'boardwalk'
      ? boardwalkPoint(rng)
      : sidewalkPoint(rng, xs, zs);
    this.mesh = buildFigure(T, rng);
    this.mesh.position.set(start.x, 0, start.z);
    this.pos = this.mesh.position; // alias, like Vehicle.pos
    this.heading = rng.range(0, Math.PI * 2);
    this.walkSpeed = 1.0 + rng.range(0, 1.0);
    this.speed = 0;
    this.state = 'walk';
    this.waypoint = pickWaypoint(rng, xs, zs, this.pos, district);
    this.pauseTimer = rng.range(0, 2);
    this.fleeTimer = 0;
    this.downTimer = 0;
    this.fleeX = 1;
    this.fleeZ = 0;
    this.fleeAfterDown = false;
    this.phase = rng.range(0, Math.PI * 2);
    this.mesh.rotation.y = this.heading;
  }

  step(dt, ctx) {
    const { rng, xs, zs, bounds } = ctx;
    switch (this.state) {
      case 'down': {
        this.downTimer -= dt;
        if (this.downTimer > 0) return;
        this.mesh.rotation.z = 0;
        this.mesh.rotation.y = this.heading;
        if (this.fleeAfterDown) {
          this.fleeAfterDown = false;
          this.state = 'flee';
          this.fleeTimer = 2.2;
          this.heading = Math.atan2(this.fleeX, this.fleeZ);
        } else {
          this.state = 'walk';
          this.walkSpeed = Math.max(0.8, this.walkSpeed * 0.85);
          this.waypoint = pickWaypoint(rng, xs, zs, this.pos, this.district);
        }
        return;
      }
      case 'flee': {
        this.fleeTimer -= dt;
        const runSpeed = 4.2;
        this.speed = runSpeed;
        this.pos.x += this.fleeX * runSpeed * dt;
        this.pos.z += this.fleeZ * runSpeed * dt;
        this.heading = Math.atan2(this.fleeX, this.fleeZ);
        this.mesh.rotation.y = this.heading;
        this.pos.x = Math.max(bounds.minX + 2, Math.min(bounds.maxX - 2, this.pos.x));
        this.pos.z = Math.max(bounds.minZ + 2, Math.min(bounds.maxZ - 2, this.pos.z));
        if (this.fleeTimer <= 0) {
          this.state = 'walk';
          this.waypoint = pickWaypoint(rng, xs, zs, this.pos, this.district);
        }
        return;
      }
      case 'pause': {
        this.speed = 0;
        this.pauseTimer -= dt;
        if (this.pauseTimer <= 0) {
          this.state = 'walk';
          this.waypoint = pickWaypoint(rng, xs, zs, this.pos, this.district);
        }
        return;
      }
      default: { // walk
        const dx = this.waypoint.x - this.pos.x;
        const dz = this.waypoint.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.6) {
          if (rng.chance(0.35)) {
            this.state = 'pause';
            this.pauseTimer = 1 + rng.range(0, 3);
            this.speed = 0;
          } else {
            this.waypoint = pickWaypoint(rng, xs, zs, this.pos, this.district);
          }
          return;
        }
        this.heading = turnToward(this.heading, Math.atan2(dx, dz), 3, dt);
        this.speed = this.walkSpeed;
        this.pos.x += Math.sin(this.heading) * this.speed * dt;
        this.pos.z += Math.cos(this.heading) * this.speed * dt;
        this.mesh.rotation.y = this.heading;
      }
    }
  }
}

// A stray dog: a small quadruped that trots the sidewalks, nose to the
// ground, and bolts when a fast car comes near. It reuses the walkers'
// waypoint system (sidewalkPoint / pickWaypoint) so it stays on the
// pavements, and it is small enough to read as a dog at a glance — a
// low body, a head with floppy ears, four trotting legs and a wagging
// tail. Three of them live in the city.
class Dog {
  constructor(T, rng, xs, zs) {
    const start = sidewalkPoint(rng, xs, zs);
    const coat = [0x8a5a2b, 0x3a3a3a, 0xd9c08a][rng.int(0, 2)];
    const mat = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.9 });
    this.mesh = new THREE.Group();
    // Low body, head up front, tail at the back.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.85), mat);
    body.position.y = 0.35;
    this.mesh.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.3), mat);
    head.position.set(0, 0.55, 0.5);
    this.mesh.add(head);
    // Floppy ears and a dark nose.
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.14), dark);
      ear.position.set(side * 0.14, 0.62, 0.48);
      ear.rotation.z = side * 0.3;
      this.mesh.add(ear);
    }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), dark);
    nose.position.set(0, 0.52, 0.67);
    this.mesh.add(nose);
    // Four legs, kept so the update loop can trot them.
    this.legs = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), dark);
        leg.position.set(sx * 0.18, 0.15, sz * 0.3);
        this.mesh.add(leg);
        this.legs.push(leg);
      }
    }
    this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), mat);
    this.tail.position.set(0, 0.45, -0.55);
    this.tail.rotation.x = -0.5;
    this.mesh.add(this.tail);
    this.mesh.position.set(start.x, 0, start.z);
    this.pos = this.mesh.position;
    this.heading = rng.range(0, Math.PI * 2);
    this.trotSpeed = 2.0 + rng.range(0, 0.8);
    this.speed = 0;
    this.state = 'trot';
    this.waypoint = pickWaypoint(rng, xs, zs, this.pos, 'city');
    this.sniffTimer = rng.range(0, 3);
    this.fleeTimer = 0;
    this.fleeX = 1;
    this.fleeZ = 0;
    this.phase = rng.range(0, Math.PI * 2);
    this.mesh.rotation.y = this.heading;
  }

  step(dt, ctx) {
    const { rng, xs, zs, bounds } = ctx;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      this.speed = 5.5;
      this.pos.x += this.fleeX * this.speed * dt;
      this.pos.z += this.fleeZ * this.speed * dt;
      this.heading = Math.atan2(this.fleeX, this.fleeZ);
      this.mesh.rotation.y = this.heading;
      this.pos.x = Math.max(bounds.minX + 2, Math.min(bounds.maxX - 2, this.pos.x));
      this.pos.z = Math.max(bounds.minZ + 2, Math.min(bounds.maxZ - 2, this.pos.z));
      if (this.fleeTimer <= 0) {
        this.state = 'trot';
        this.waypoint = pickWaypoint(rng, xs, zs, this.pos, 'city');
      }
      return;
    }
    if (this.state === 'sniff') {
      this.speed = 0;
      this.sniffTimer -= dt;
      // Head down, tail still wagging.
      this.mesh.children[1].position.y = 0.42;
      if (this.sniffTimer <= 0) {
        this.state = 'trot';
        this.mesh.children[1].position.y = 0.55;
        this.waypoint = pickWaypoint(rng, xs, zs, this.pos, 'city');
      }
      return;
    }
    // Trot toward the waypoint; stop to sniff now and then.
    const dx = this.waypoint.x - this.pos.x;
    const dz = this.waypoint.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      if (rng.chance(0.3)) {
        this.state = 'sniff';
        this.sniffTimer = 1 + rng.range(0, 2);
        this.speed = 0;
      } else {
        this.waypoint = pickWaypoint(rng, xs, zs, this.pos, 'city');
      }
      return;
    }
    this.heading = turnToward(this.heading, Math.atan2(dx, dz), 4, dt);
    this.speed = this.trotSpeed;
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.rotation.y = this.heading;
  }
}

export function createPedestrians(THREE, world, rng, n) {
  // Tolerant signature: createPedestrians(THREE, world, count) without
  // an rng makes a seeded one internally.
  if (typeof rng === 'number' || rng === undefined || rng === null) {
    n = rng;
    rng = createRNG(777001);
  }
  const xs = roadCentres();
  const zs = roadCentres();
  const bounds = (world && world.bounds) || { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };
  const count = Math.max(0, n | 0);
  const people = [];
  for (let i = 0; i < count; i += 1) {
    // One in six people strolls the boardwalk instead of the city.
    const district = i % 6 === 5 ? 'boardwalk' : 'city';
    const person = new Walker(THREE, rng, xs, zs, district);
    people.push(person);
    if (world && world.group && typeof world.group.add === 'function') {
      world.group.add(person.mesh);
    }
  }
  // Three stray dogs trot the city sidewalks.
  const dogs = [];
  for (let i = 0; i < 3; i += 1) {
    const dog = new Dog(THREE, rng, xs, zs);
    dogs.push(dog);
    if (world && world.group && typeof world.group.add === 'function') {
      world.group.add(dog.mesh);
    }
  }

  const peds = {
    people,
    dogs,
    playerCar: null,
    onHit: null,
    lastHit: null,
    time: 0,

    setPlayer(car) {
      peds.playerCar = car || null;
      return peds;
    },

    // Knock one pedestrian down (a car hit them). Public so the main loop
    // can also trigger it from its own collision check.
    knockDown(person) {
      if (!person || person.state === 'down') return;
      person.state = 'down';
      person.downTimer = 3.5;
      person.fleeAfterDown = false;
      person.speed = 0;
      person.mesh.rotation.z = Math.PI / 2; // flat on the sidewalk
      person.mesh.rotation.y = person.heading;
      peds.lastHit = { person, at: peds.time };
      if (typeof peds.onHit === 'function') {
        try { peds.onHit(person); } catch { /* a hook must never break the crowd */ }
      }
    },

    // Shove one pedestrian (the player's F punch): they stumble and fall
    // for ~2 s, then scramble up and flee from the shover. `fromX/fromZ`
    // is where the punch came from, so the flee direction is away.
    shove(person, fromX, fromZ) {
      if (!person || person.state === 'down') return false;
      person.state = 'down';
      person.downTimer = 2.0;
      person.fleeAfterDown = true;
      const dx = person.pos.x - (fromX ?? person.pos.x);
      const dz = person.pos.z - (fromZ ?? person.pos.z);
      const d = Math.hypot(dx, dz) || 1;
      person.fleeX = dx / d;
      person.fleeZ = dz / d;
      person.speed = 0;
      person.mesh.rotation.z = Math.PI / 2;
      person.mesh.rotation.y = person.heading;
      peds.lastHit = { person, at: peds.time };
      return true;
    },

    // The nearest fast vehicle (player car or cruiser) threatening `p`.
    _nearestThreat(p, threats) {
      let best = null;
      let bestD = 9;
      for (const t of threats) {
        if (!t || !t.pos) continue;
        const dx = p.pos.x - t.pos.x;
        const dz = p.pos.z - t.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < bestD) { bestD = dist; best = { dx, dz, dist }; }
      }
      return best;
    },

    update(dt, playerCar, copCars) {
      if (!dt || dt <= 0) return peds;
      dt = Math.min(dt, 0.05);
      peds.time += dt;
      const player = playerCar || peds.playerCar;
      // Everything that can scare the crowd: the player's car when it is
      // moving fast, plus every police cruiser on the road.
      const threats = [];
      if (player && player.pos && Math.abs(player.speed || 0) > 6) threats.push(player);
      if (Array.isArray(copCars)) {
        for (const cop of copCars) {
          if (cop && cop.pos && Math.abs(cop.speed || 0) > 4) threats.push(cop);
        }
      }
      const playerPos = player && player.pos ? player.pos : null;
      const playerSpeed = player ? Math.abs(player.speed || 0) : 0;
      const carIsThreat = !!playerPos && playerSpeed > 6;
      const ctx = { rng, xs, zs, bounds };

      for (const p of people) {
        // A fast vehicle within ~9 units sends them running away from it.
        if (p.state !== 'flee' && p.state !== 'down') {
          const threat = peds._nearestThreat(p, threats);
          if (threat) {
            p.state = 'flee';
            p.fleeTimer = 1.4;
            p.fleeX = threat.dx / (threat.dist || 1);
            p.fleeZ = threat.dz / (threat.dist || 1);
          }
        }
        p.step(dt, ctx);

        // Hit check: a fast car clipping a pedestrian knocks them down.
        if (carIsThreat && p.state !== 'down') {
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
      // The dogs trot, sniff and bolt from fast cars just like the crowd.
      for (const d of dogs) {
        if (d.state !== 'flee') {
          const threat = peds._nearestThreat(d, threats);
          if (threat) {
            d.state = 'flee';
            d.fleeTimer = 1.6;
            d.fleeX = threat.dx / (threat.dist || 1);
            d.fleeZ = threat.dz / (threat.dist || 1);
          }
        }
        d.step(dt, ctx);
        // Trot cycle: diagonal legs swing together; the tail wags.
        const trot = Math.sin(peds.time * 10 + d.phase) * (d.speed > 0.1 ? 0.5 : 0);
        d.legs[0].rotation.x = trot;
        d.legs[3].rotation.x = trot;
        d.legs[1].rotation.x = -trot;
        d.legs[2].rotation.x = -trot;
        d.tail.rotation.y = Math.sin(peds.time * 6 + d.phase) * 0.5;
        d.mesh.position.y = d.speed > 0.1 ? Math.abs(Math.sin(peds.time * 10 + d.phase)) * 0.03 : 0;
      }
      return peds;
    },
  };
  return peds;
}
