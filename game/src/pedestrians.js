// VICE HARBOR v6 — the pedestrians.
// Low-poly people who stroll the sidewalks on seeded waypoints, pause to
// look around, cross at the crosswalks, and sprint away from a fast car —
// the player's or a police cruiser's. A shove (the player's F punch)
// knocks one down for ~2 s, after which they scramble up and flee. Three
// stray dogs trot the streets, sniff, and bolt from traffic. Cheap by
// design: shared geometries and a small cached set of materials for the
// whole crowd, with variety from scale, shirt, skin, trousers, hats and
// the odd shoulder bag. One in six people strolls the boardwalk instead
// of the city, and a few work the industrial yards, the south houses and
// the casino strip.

import { CFG } from './settings.js';
import { Rng, steerToward } from './rng.js';

const SHIRTS = [
  0xd23c2e, 0x2e6fd2, 0xe8b93a, 0x3fae6a, 0x7a4fd0, 0xe8e6df, 0x18a7a0,
  0xd2691e, 0xff5a8a, 0x9be62e, 0xff8c1a, 0x2ee6c8, 0xff3c5a, 0x7ac2ff, 0xc94f7c,
];
const SKINS = [0xc68e5f, 0x8a5a3b, 0xe8b88a, 0x6e4530, 0xd9a066, 0xa06a42];
const TROUSERS = [0x2a2f38, 0x3a3f4a, 0x5a4632, 0x2e4a3a, 0x6b6b7a, 0x1e2a3a];
const HAIRS = [0x201510, 0x3a2a1a, 0x6b6b6b, 0x111111, 0x8a5a2a];

let sharedParts = null;
const shirtCache = new Map();
const skinCache = new Map();
const pantsCache = new Map();

function sharedArt(T) {
  if (!sharedParts) {
    sharedParts = {
      legs: new T.BoxGeometry(0.44, 0.62, 0.26),
      body: new T.BoxGeometry(0.52, 0.72, 0.3),
      head: new T.SphereGeometry(0.21, 10, 8),
      arm: new T.BoxGeometry(0.11, 0.6, 0.11),
      cap: new T.CylinderGeometry(0.22, 0.23, 0.09, 10),
      bag: new T.BoxGeometry(0.22, 0.3, 0.12),
    };
  }
  return sharedParts;
}

function cachedMaterial(T, cache, color, rough) {
  if (!cache.has(color)) {
    cache.set(color, new T.MeshStandardMaterial({ color, roughness: rough ?? 0.85 }));
  }
  return cache.get(color);
}

function buildWalkerMesh(T, rng) {
  const art = sharedArt(T);
  const shirt = rng.pick(SHIRTS);
  const skin = rng.pick(SKINS);
  const pants = rng.pick(TROUSERS);
  const hairCol = rng.pick(HAIRS);
  const g = new T.Group();
  g.name = 'walker';
  const pieces = [
    [art.legs, cachedMaterial(T, pantsCache, pants, 0.9), 0, 0.31, 0],
    [art.body, cachedMaterial(T, shirtCache, shirt), 0, 0.98, 0],
    [art.head, cachedMaterial(T, skinCache, skin, 0.7), 0, 1.52, 0],
  ];
  for (const [geo, m, x, y, z] of pieces) {
    const mesh = new T.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
  }
  // Hair cap so heads are not bare spheres.
  const hair = new T.Mesh(
    new T.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new T.MeshStandardMaterial({ color: hairCol, roughness: 0.95 }),
  );
  hair.position.y = 1.56;
  g.add(hair);
  const armL = new T.Mesh(art.arm, cachedMaterial(T, shirtCache, shirt));
  armL.position.set(-0.33, 0.98, 0);
  const armR = new T.Mesh(art.arm, cachedMaterial(T, shirtCache, shirt));
  armR.position.set(0.33, 0.98, 0);
  g.add(armL, armR);
  // Hats: a cap with a brim, or a beanie, on about a third of the crowd.
  const hatRoll = rng.next();
  if (hatRoll < 0.2) {
    const cap = new T.Mesh(art.cap, new T.MeshStandardMaterial({
      color: rng.chance(0.5) ? 0xd23c2e : 0x2e6fd2, roughness: 0.9,
    }));
    cap.position.y = 1.68;
    g.add(cap);
    const brim = new T.Mesh(new T.BoxGeometry(0.24, 0.03, 0.16), cap.material);
    brim.position.set(0, 1.65, 0.24);
    g.add(brim);
  } else if (hatRoll < 0.35) {
    const beanie = new T.Mesh(
      new T.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new T.MeshStandardMaterial({ color: rng.chance(0.5) ? 0x3fae6a : 0x7a4fd0, roughness: 0.95 }),
    );
    beanie.position.y = 1.56;
    g.add(beanie);
  }
  // A shoulder bag on about one in five.
  if (rng.next() < 0.2) {
    const bag = new T.Mesh(art.bag, new T.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
    bag.position.set(0.32, 0.85, 0);
    g.add(bag);
  }
  g.scale.setScalar(0.95 + rng.next() * 0.2);
  g.userData.arms = [armL, armR];
  return g;
}

// One pedestrian: a state machine (stroll | wait | run | down) walking
// between sidewalk waypoints.
class Walker {
  constructor(T, rng, xs, zs, area) {
    this.rng = rng;
    this.xs = xs;
    this.zs = zs;
    this.area = area; // 'city' | 'boardwalk' | 'yard' | 'house' | 'casino'
    this.mesh = buildWalkerMesh(T, rng);
    const start = this._spot(rng);
    this.mesh.position.set(start.x, 0, start.z);
    this.pos = this.mesh.position;
    this.heading = rng.next() * Math.PI * 2;
    this.walkSpeed = 1.0 + rng.next() * 1.0;
    // Joggers: about one in eight walks at a run, for a livelier street.
    this.jogger = rng.next() < 0.12;
    if (this.jogger) this.walkSpeed = 2.6 + rng.next() * 0.8;
    // Phone zombies: about one in six stops to stare at a phone.
    this.phone = rng.next() < 0.16;
    if (this.phone) {
      const phone = new T.Mesh(
        new T.BoxGeometry(0.09, 0.17, 0.02),
        new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
      );
      phone.position.set(0.3, 1.18, 0.2);
      this.mesh.add(phone);
    }
    this.speed = 0;
    this.state = 'stroll';
    this.target = this._spot(rng);
    this.waitT = rng.next() * 2;
    this.runT = 0;
    this.downT = 0;
    this.phase = rng.next() * Math.PI * 2;
    this.fleeX = 1;
    this.fleeZ = 0;
    this.fleeAfterDown = false;
    this.mesh.rotation.y = this.heading;
  }

  _spot(rng) {
    const { xs, zs } = this;
    if (this.area === 'boardwalk') {
      return { x: 222 + 2 + (rng.next() - 0.5) * 6, z: -180 + rng.next() * 360 };
    }
    if (this.area === 'yard') {
      return { x: -180 + rng.next() * 360, z: -210 + rng.next() * 36 };
    }
    if (this.area === 'house') {
      return { x: -180 + rng.next() * 360, z: 150 + rng.next() * 60 };
    }
    if (this.area === 'casino') {
      return { x: -60 + rng.next() * 120, z: -210 + rng.next() * 24 };
    }
    const i = Math.floor(rng.next() * (xs.length - 1));
    const j = Math.floor(rng.next() * (zs.length - 1));
    const edge = Math.floor(rng.next() * 4);
    const t = rng.next();
    const x0 = xs[i] + 7.6;
    const x1 = xs[i + 1] - 7.6;
    const z0 = zs[j] + 7.6;
    const z1 = zs[j + 1] - 7.6;
    if (edge === 0) return { x: x0 + (x1 - x0) * t, z: z0 };
    if (edge === 1) return { x: x0 + (x1 - x0) * t, z: z1 };
    if (edge === 2) return { x: x0, z: z0 + (z1 - z0) * t };
    return { x: x1, z: z0 + (z1 - z0) * t };
  }

  _nextTarget() {
    if (this.rng.next() < CFG.CROSS_CHANCE) {
      // Cross at a road line to the far sidewalk.
      const alongRoad = this.rng.next() < 0.5;
      const HALF = 222;
      if (alongRoad) {
        const c = this.xs[Math.floor(this.rng.next() * this.xs.length)];
        const along = -HALF + 20 + this.rng.next() * (HALF * 2 - 40);
        const side = this.pos.x < c ? 1 : -1;
        return { x: c + side * 7.6, z: along };
      }
      const c = this.zs[Math.floor(this.rng.next() * this.zs.length)];
      const along = -HALF + 20 + this.rng.next() * (HALF * 2 - 40);
      const side = this.pos.z < c ? 1 : -1;
      return { x: along, z: c + side * 7.6 };
    }
    return this._spot(this.rng);
  }

  step(dt, ctx) {
    const { rng } = this;
    if (this.state === 'down') {
      this.downT -= dt;
      if (this.downT > 0) return;
      this.mesh.rotation.z = 0;
      this.mesh.rotation.y = this.heading;
      if (this.fleeAfterDown) {
        this.fleeAfterDown = false;
        this.state = 'run';
        this.runT = 2.2;
        this.heading = Math.atan2(this.fleeX, this.fleeZ);
      } else {
        this.state = 'stroll';
        this.walkSpeed = Math.max(0.8, this.walkSpeed * 0.85);
        this.target = this._nextTarget();
      }
      return;
    }
    if (this.state === 'run') {
      this.runT -= dt;
      const runSpeed = 4.2;
      this.speed = runSpeed;
      this.pos.x += this.fleeX * runSpeed * dt;
      this.pos.z += this.fleeZ * runSpeed * dt;
      this.heading = Math.atan2(this.fleeX, this.fleeZ);
      this.mesh.rotation.y = this.heading;
      this.pos.x = Math.max(ctx.bounds.minX + 2, Math.min(ctx.bounds.maxX - 2, this.pos.x));
      this.pos.z = Math.max(ctx.bounds.minZ + 2, Math.min(ctx.bounds.maxZ - 2, this.pos.z));
      if (this.runT <= 0) {
        this.state = 'stroll';
        this.target = this._nextTarget();
      }
      return;
    }
    if (this.state === 'wait') {
      this.speed = 0;
      this.waitT -= dt;
      if (this.waitT <= 0) {
        this.state = 'stroll';
        this.target = this._nextTarget();
      }
      return;
    }
    // Stroll toward the waypoint; on arrival, sometimes pause — and
    // phone zombies stop longer to stare at their screen.
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.6) {
      if (rng.next() < 0.35 || (this.phone && rng.next() < 0.3)) {
        this.state = 'wait';
        this.waitT = this.phone ? 3 + rng.next() * 4 : 1 + rng.next() * 3;
        this.speed = 0;
      } else {
        this.target = this._nextTarget();
      }
      return;
    }
    this.heading = steerToward(this.heading, Math.atan2(dx, dz), 3 * dt);
    this.speed = this.walkSpeed;
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.rotation.y = this.heading;
  }
}

// A stray dog: trots around, sniffs, bolts from cars.
class Dog {
  constructor(T, rng) {
    this.rng = rng;
    const g = new T.Group();
    const coat = new T.MeshStandardMaterial({ color: rng.pick([0x8a6a45, 0x3a3a3a, 0xc9a06a]), roughness: 0.95 });
    const body = new T.Mesh(new T.BoxGeometry(0.9, 0.4, 0.35), coat);
    body.position.y = 0.42;
    body.castShadow = true;
    g.add(body);
    const head = new T.Mesh(new T.BoxGeometry(0.35, 0.3, 0.3), coat);
    head.position.set(0.55, 0.55, 0);
    g.add(head);
    const snout = new T.Mesh(new T.BoxGeometry(0.25, 0.15, 0.18), coat);
    snout.position.set(0.8, 0.48, 0);
    g.add(snout);
    for (const [lx, lz] of [[0.32, 0.14], [0.32, -0.14], [-0.32, 0.14], [-0.32, -0.14]]) {
      const leg = new T.Mesh(new T.BoxGeometry(0.1, 0.4, 0.1), coat);
      leg.position.set(lx, 0.2, lz);
      g.add(leg);
    }
    const tail = new T.Mesh(new T.BoxGeometry(0.35, 0.08, 0.08), coat);
    tail.position.set(-0.6, 0.6, 0);
    tail.rotation.z = 0.6;
    g.add(tail);
    this.mesh = g;
    this.pos = g.position;
    const start = { x: -180 + rng.next() * 360, z: -180 + rng.next() * 360 };
    this.pos.set(start.x, 0, start.z);
    this.heading = rng.next() * Math.PI * 2;
    this.speed = 0;
    this.state = 'trot';
    this.target = start;
    this.timer = 2 + rng.next() * 4;
    this.fleeX = 1;
    this.fleeZ = 0;
  }

  step(dt, threats, bounds) {
    if (this.state === 'bolt') {
      this.timer -= dt;
      this.speed = 6;
      this.pos.x += this.fleeX * 6 * dt;
      this.pos.z += this.fleeZ * 6 * dt;
      this.pos.x = Math.max(bounds.minX + 2, Math.min(bounds.maxX - 2, this.pos.x));
      this.pos.z = Math.max(bounds.minZ + 2, Math.min(bounds.maxZ - 2, this.pos.z));
      this.mesh.rotation.y = Math.atan2(this.fleeX, this.fleeZ) - Math.PI / 2;
      if (this.timer <= 0) this.state = 'trot';
      return;
    }
    for (const t of threats) {
      if (!t || !t.pos) continue;
      const dx = this.pos.x - t.pos.x;
      const dz = this.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 7 && Math.abs(t.speed || 0) > 5) {
        this.state = 'bolt';
        this.timer = 1.6;
        this.fleeX = dx / (d || 1);
        this.fleeZ = dz / (d || 1);
        return;
      }
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.state = this.state === 'sniff' ? 'trot' : 'sniff';
      this.timer = 2 + this.rng.next() * 4;
      if (this.state === 'trot') {
        this.target = { x: -180 + this.rng.next() * 360, z: -180 + this.rng.next() * 360 };
      }
    }
    if (this.state === 'trot') {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.5) {
        this.heading = steerToward(this.heading, Math.atan2(dx, dz), 4 * dt);
        this.speed = 2.2;
        this.pos.x += Math.sin(this.heading) * this.speed * dt;
        this.pos.z += Math.cos(this.heading) * this.speed * dt;
        this.mesh.rotation.y = this.heading - Math.PI / 2;
      } else {
        this.speed = 0;
      }
    } else {
      this.speed = 0;
    }
  }
}

export function makePedestrians(THREE, city, rng, n) {
  const xs = city.roadXs;
  const zs = city.roadZs;
  const bounds = city.limits;
  const people = [];
  const count = Math.max(0, n | 0);
  for (let i = 0; i < count; i += 1) {
    const area = i % 6 === 5 ? 'boardwalk'
      : i % 11 === 10 ? 'yard'
      : i % 13 === 12 ? 'house'
      : i % 17 === 16 ? 'casino'
      : 'city';
    const person = new Walker(THREE, rng, xs, zs, area);
    people.push(person);
    city.group.add(person.mesh);
  }
  const dogs = [];
  for (let i = 0; i < 3; i += 1) {
    const dog = new Dog(THREE, rng);
    dogs.push(dog);
    city.group.add(dog.mesh);
  }

  const crowd = {
    people,
    dogs,
    playerCar: null,
    onHit: null,
    lastHit: null,
    time: 0,

    setPlayer(car) {
      crowd.playerCar = car || null;
      return crowd;
    },

    knockDown(person) {
      if (!person || person.state === 'down') return;
      person.state = 'down';
      person.downT = 3.5;
      person.fleeAfterDown = false;
      person.speed = 0;
      person.mesh.rotation.z = Math.PI / 2;
      person.mesh.rotation.y = person.heading;
      crowd.lastHit = { person, at: crowd.time };
      if (typeof crowd.onHit === 'function') {
        try { crowd.onHit(person); } catch { /* a hook must never break the crowd */ }
      }
    },

    shove(person, fromX, fromZ) {
      if (!person || person.state === 'down') return false;
      person.state = 'down';
      person.downT = 2.0;
      person.fleeAfterDown = true;
      const dx = person.pos.x - (fromX ?? person.pos.x);
      const dz = person.pos.z - (fromZ ?? person.pos.z);
      const d = Math.hypot(dx, dz) || 1;
      person.fleeX = dx / d;
      person.fleeZ = dz / d;
      person.speed = 0;
      person.mesh.rotation.z = Math.PI / 2;
      person.mesh.rotation.y = person.heading;
      crowd.lastHit = { person, at: crowd.time };
      return true;
    },

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
      if (!dt || dt <= 0) return crowd;
      dt = Math.min(dt, 0.05);
      crowd.time += dt;
      const player = playerCar || crowd.playerCar;
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
      const ctx = { bounds };

      for (const p of people) {
        if (p.state !== 'run' && p.state !== 'down') {
          const threat = crowd._nearestThreat(p, threats);
          if (threat) {
            p.state = 'run';
            p.runT = 1.4;
            p.fleeX = threat.dx / (threat.dist || 1);
            p.fleeZ = threat.dz / (threat.dist || 1);
          }
        }
        p.step(dt, ctx);
        if (carIsThreat && p.state !== 'down') {
          const dx = p.pos.x - playerPos.x;
          const dz = p.pos.z - playerPos.z;
          if (dx * dx + dz * dz < 2.2 * 2.2) crowd.knockDown(p);
        }
        const swing = Math.sin(crowd.time * (p.state === 'run' ? 11 : 6) + p.phase)
          * (p.speed > 0.1 ? 0.55 : 0);
        const arms = p.mesh.userData.arms;
        if (arms) {
          arms[0].rotation.x = swing;
          arms[1].rotation.x = -swing;
        }
        p.mesh.position.y = p.speed > 0.1 ? Math.abs(Math.sin(crowd.time * 6 + p.phase)) * 0.04 : 0;
      }
      for (const dog of dogs) dog.step(dt, threats, bounds);
      return crowd;
    },
  };
  return crowd;
}
