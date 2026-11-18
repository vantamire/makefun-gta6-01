// VICE HARBOR — vehicles.js
// Drivable arcade cars: box-built bodies with spinning / steering wheels,
// per-kind handling, handbrake slides, building collisions and city bounds.
// The player module drives one Vehicle through enter()/exit(); traffic and
// police reuse this same class so every car on the road behaves alike.
//
// Heading convention (shared by every system): heading 0 faces +Z, and the
// forward vector is (sin(heading), 0, cos(heading)); mesh.rotation.y = heading.

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — local on purpose, so this file loads standalone.
// ---------------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CAR_COLORS = [
  0xd23c2e, // harbor red
  0x2e6fd2, // ocean blue
  0xe8b93a, // taxi yellow
  0x2f3336, // asphalt black
  0xe8e6df, // pearl white
  0x3fae6a, // palm green
  0x7a4fd0, // neon purple
  0xd2691e, // sunset orange
  0x9aa5ad, // silver grey
  0x18a7a0, // lagoon teal
];

// Handling + size per kind. topSpeed is m/s; the sport car is the fastest
// thing on the road, the truck is a slow battering ram.
export const VEHICLE_SPECS = {
  sedan: { topSpeed: 26, accel: 14, reverseTop: 9, length: 4.4, width: 1.9, height: 0.55, turn: 1.9 },
  taxi: { topSpeed: 24, accel: 13, reverseTop: 9, length: 4.4, width: 1.9, height: 0.55, turn: 1.9 },
  sport: { topSpeed: 34, accel: 21, reverseTop: 10, length: 4.2, width: 2.0, height: 0.5, turn: 2.3 },
  truck: { topSpeed: 18, accel: 9, reverseTop: 7, length: 6.6, width: 2.4, height: 0.7, turn: 1.4 },
  police: { topSpeed: 30, accel: 17, reverseTop: 10, length: 4.6, width: 2.0, height: 0.55, turn: 2.1 },
};

const KIND_COLORS = {
  sedan: [0xd23c2e, 0x2e6fd2, 0x9aa5ad, 0x2f3336, 0xe8e6df],
  taxi: [0xe8b93a],
  sport: [0xd23c2e, 0x7a4fd0, 0x18a7a0, 0xe8e6df],
  truck: [0x9aa5ad, 0x3fae6a, 0x2e6fd2],
  police: [0x101418], // black-and-white body is painted in two tones below
};

// Shared geometries / materials so a street full of cars stays cheap.
const _geoCache = new Map();
function boxGeo(w, h, d) {
  const key = `b${w}|${h}|${d}`;
  if (!_geoCache.has(key)) _geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return _geoCache.get(key);
}
const _matCache = new Map();
function stdMat(color, opts) {
  const key = `${color}|${JSON.stringify(opts || {})}`;
  if (!_matCache.has(key)) {
    _matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...(opts || {}) }));
  }
  return _matCache.get(key);
}
let _wheelGeo = null;
let _glassMat = null;
let _tyreMat = null;
let _hubMat = null;
function sharedMats(T) {
  if (!_wheelGeo) {
    _wheelGeo = new T.CylinderGeometry(0.34, 0.34, 0.26, 14);
    _glassMat = new T.MeshStandardMaterial({ color: 0x0e1a24, roughness: 0.15, metalness: 0.7 });
    _tyreMat = new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, metalness: 0 });
    _hubMat = new T.MeshStandardMaterial({ color: 0xb9c0c7, roughness: 0.3, metalness: 0.8 });
  }
  return { wheelGeo: _wheelGeo, glassMat: _glassMat, tyreMat: _tyreMat, hubMat: _hubMat };
}

// ---------------------------------------------------------------------------
// Input reading: accepts the game's input object in several shapes so the
// car never breaks if the input module changes its API.
// ---------------------------------------------------------------------------
function keyDown(input, codes) {
  if (!input) return false;
  if (input.keys instanceof Set) {
    for (const c of codes) if (input.keys.has(c)) return true;
    return false;
  }
  if (input.keys && typeof input.keys === 'object') {
    for (const c of codes) if (input.keys[c]) return true;
    return false;
  }
  return false;
}

export function readDriveInput(input) {
  if (!input) return { throttle: 0, steer: 0, handbrake: false };
  // Direct numeric form: { throttle, steer, handbrake }
  if (typeof input.throttle === 'number' || typeof input.steer === 'number') {
    return {
      throttle: Math.max(-1, Math.min(1, input.throttle || 0)),
      steer: Math.max(-1, Math.min(1, input.steer || 0)),
      handbrake: !!input.handbrake,
    };
  }
  const up = input.up === true || input.forward === true || input.accelerate === true
    || keyDown(input, ['KeyW', 'ArrowUp']);
  const down = input.down === true || input.back === true || input.brake === true
    || keyDown(input, ['KeyS', 'ArrowDown']);
  const left = input.left === true || keyDown(input, ['KeyA', 'ArrowLeft']);
  const right = input.right === true || keyDown(input, ['KeyD', 'ArrowRight']);
  const handbrake = input.handbrake === true || input.space === true
    || keyDown(input, ['Space']);
  let steer = (right ? 1 : 0) - (left ? 1 : 0);
  if (typeof input.direction === 'function') steer = input.direction();
  else if (typeof input.steerAxis === 'number') steer = input.steerAxis;
  return {
    throttle: (up ? 1 : 0) - (down ? 1 : 0),
    steer: Math.max(-1, Math.min(1, steer)),
    handbrake,
  };
}

// ---------------------------------------------------------------------------
// Vehicle
// ---------------------------------------------------------------------------
export class Vehicle {
  constructor(THREEImpl, kind, color) {
    const T = THREEImpl || THREE;
    this.THREE = T;
    this.kind = VEHICLE_SPECS[kind] ? kind : 'sedan';
    this.spec = VEHICLE_SPECS[this.kind];
    const palette = KIND_COLORS[this.kind];
    this.color = color !== undefined && color !== null
      ? color
      : palette[Math.floor(Math.random() * palette.length)];
    // Length/width the rest of the game uses for parking, ramming and culling.
    this.length = this.spec.length;
    this.width = this.spec.width;
    this.radius = this.length * 0.42; // collision circle, slightly forgiving
    this.topSpeed = this.spec.topSpeed;

    this.mesh = new T.Group();
    this.mesh.name = `car-${this.kind}`;
    this.pos = this.mesh.position; // alias: pos IS the mesh position
    this.heading = 0;
    this.speed = 0; // signed m/s along the forward vector
    this.steerAngle = 0;
    this.skidding = false;
    this.occupied = false; // true while the player sits in this car
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.onCrash = null; // optional hook: onCrash(impactSpeed)
    this.onEnter = null;
    this.onExit = null;
    this._crashCooldown = 0;
    this._buildMesh(T);
  }

  _buildMesh(T) {
    const s = this.spec;
    const shared = sharedMats(T);
    const bodyMat = stdMat(this.color);
    const isPolice = this.kind === 'police';
    const isTaxi = this.kind === 'taxi';
    const isTruck = this.kind === 'truck';

    // Main body: long axis along Z, the forward axis (heading 0 faces +Z).
    const body = new T.Mesh(boxGeo(s.width, s.height, s.length), bodyMat);
    body.position.y = 0.55;
    body.castShadow = true;
    this.mesh.add(body);

    if (isTruck) {
      // Cab up front + tall cargo box behind.
      const cab = new T.Mesh(boxGeo(s.width * 0.92, 0.9, 1.5), shared.glassMat);
      cab.position.set(0, 1.15, s.length / 2 - 0.9);
      cab.castShadow = true;
      this.mesh.add(cab);
      const cabRoof = new T.Mesh(boxGeo(s.width * 0.92, 0.16, 1.5), bodyMat);
      cabRoof.position.set(0, 1.66, s.length / 2 - 0.9);
      this.mesh.add(cabRoof);
      const cargo = new T.Mesh(boxGeo(s.width * 0.96, 1.5, s.length * 0.55), stdMat(0xd8d3c8, { roughness: 0.8, metalness: 0.1 }));
      cargo.position.set(0, 1.35, -s.length * 0.16);
      cargo.castShadow = true;
      this.mesh.add(cargo);
    } else {
      // Cabin: dark glasshouse + body-colour roof, so the windows read clearly.
      const cabinLen = s.length * 0.48;
      const cabin = new T.Mesh(boxGeo(s.width * 0.86, 0.5, cabinLen), shared.glassMat);
      cabin.position.set(0, 1.02, -s.length * 0.04);
      cabin.castShadow = true;
      this.mesh.add(cabin);
      const roof = new T.Mesh(boxGeo(s.width * 0.8, 0.12, cabinLen * 0.92), bodyMat);
      roof.position.set(0, 1.32, -s.length * 0.04);
      this.mesh.add(roof);
    }

    // Bumpers (bars across the width, at the front and rear ends).
    const bumperMat = stdMat(0x1c1e20, { roughness: 0.7, metalness: 0.2 });
    for (const z of [s.length / 2 + 0.02, -s.length / 2 - 0.02]) {
      const bumper = new T.Mesh(boxGeo(s.width * 0.98, 0.22, 0.18), bumperMat);
      bumper.position.set(0, 0.38, z);
      this.mesh.add(bumper);
    }

    // Headlights (warm white, emissive) and taillights (red, emissive).
    const headMat = new T.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 0.9 });
    const tailMat = new T.MeshStandardMaterial({ color: 0x7a0d0d, emissive: 0xd21f1f, emissiveIntensity: 0.9 });
    for (const x of [-s.width / 2 + 0.28, s.width / 2 - 0.28]) {
      const head = new T.Mesh(boxGeo(0.34, 0.14, 0.1), headMat);
      head.position.set(x, 0.62, s.length / 2 + 0.02);
      this.mesh.add(head);
      const tail = new T.Mesh(boxGeo(0.34, 0.14, 0.1), tailMat);
      tail.position.set(x, 0.62, -s.length / 2 - 0.02);
      this.mesh.add(tail);
    }

    if (isTaxi) {
      // Roof sign: the classic lit taxi board.
      const sign = new T.Mesh(boxGeo(0.34, 0.22, 0.7),
        new T.MeshStandardMaterial({ color: 0x111111, emissive: 0xffc233, emissiveIntensity: 0.7 }));
      sign.position.set(0, 1.48, -s.length * 0.04);
      this.mesh.add(sign);
    }

    if (isPolice) {
      // White doors on a black body + a red/blue light bar.
      const doorMat = stdMat(0xe8e6df, { roughness: 0.5, metalness: 0.3 });
      const doors = new T.Mesh(boxGeo(s.width + 0.02, s.height * 0.92, s.length * 0.52), doorMat);
      doors.position.set(0, 0.55, -s.length * 0.02);
      this.mesh.add(doors);
      this.lightBarRed = new T.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 1.6 });
      this.lightBarBlue = new T.MeshStandardMaterial({ color: 0x000055, emissive: 0x2040ff, emissiveIntensity: 1.6 });
      const barBase = new T.Mesh(boxGeo(s.width * 0.6, 0.1, 0.5), stdMat(0x111111));
      barBase.position.set(0, 1.44, -s.length * 0.04);
      this.mesh.add(barBase);
      const red = new T.Mesh(boxGeo(s.width * 0.26, 0.16, 0.42), this.lightBarRed);
      red.position.set(-s.width * 0.16, 1.56, -s.length * 0.04);
      this.mesh.add(red);
      const blue = new T.Mesh(boxGeo(s.width * 0.26, 0.16, 0.42), this.lightBarBlue);
      blue.position.set(s.width * 0.16, 1.56, -s.length * 0.04);
      this.mesh.add(blue);
    } else {
      this.lightBarRed = null;
      this.lightBarBlue = null;
    }

    // Four wheels: steer group (front only) > spin group > tyre + hub.
    // Spinning rotates about the axle (local X); steering yaws the group.
    this.wheels = [];
    this.frontWheels = [];
    const wheelZ = s.length / 2 - 0.85;
    for (const [sx, sz, front] of [
      [-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false],
    ]) {
      const steerGroup = new T.Group();
      steerGroup.position.set(sx * (s.width / 2 - 0.05), 0.34, sz * wheelZ);
      const spinGroup = new T.Group();
      const tyre = new T.Mesh(shared.wheelGeo, shared.tyreMat);
      tyre.rotation.z = Math.PI / 2; // cylinder axis Y -> axle along X
      tyre.castShadow = true;
      const hub = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.28, 10), shared.hubMat);
      hub.rotation.z = Math.PI / 2;
      spinGroup.add(tyre);
      spinGroup.add(hub);
      steerGroup.add(spinGroup);
      this.mesh.add(steerGroup);
      const wheel = { steerGroup, spinGroup, front };
      this.wheels.push(wheel);
      if (front) this.frontWheels.push(wheel);
    }
  }

  /** Forward unit vector on the ground plane. */
  forward(out) {
    const v = out || new this.THREE.Vector3();
    v.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    return v;
  }

  /** Place the car exactly (used by spawning, traffic and police). */
  setPose(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.mesh.rotation.y = heading;
    return this;
  }

  /** Spin the wheels to match the current speed (also called by update). */
  roll(dt) {
    if (!dt) return;
    const spin = (this.speed / 0.34) * dt;
    for (const w of this.wheels) w.spinGroup.rotation.x += spin;
  }

  /** Player gets in: the player module calls this, then drives via update(). */
  enter(who) {
    this.occupied = true;
    this.driver = who || 'player';
    if (typeof this.onEnter === 'function') this.onEnter(this);
    return this;
  }

  /** Player gets out: the car keeps rolling a little, then coasts to a stop. */
  exit() {
    this.occupied = false;
    this.driver = null;
    if (typeof this.onExit === 'function') this.onExit(this);
    return this;
  }

  stop() {
    this.speed = 0;
    return this;
  }

  // -- collision helpers ----------------------------------------------------
  _collideCircle(world) {
    if (!world || !world.colliders) return;
    const r = this.radius;
    const x = this.pos.x;
    const z = this.pos.z;
    for (const c of world.colliders) {
      if (!c) continue;
      const minX = c.minX ?? c.x ?? -Infinity;
      const maxX = c.maxX ?? (c.x !== undefined && c.w !== undefined ? c.x + c.w : Infinity);
      const minZ = c.minZ ?? c.z ?? -Infinity;
      const maxZ = c.maxZ ?? (c.z !== undefined && c.d !== undefined ? c.z + c.d : Infinity);
      const cx = Math.max(minX, Math.min(x, maxX));
      const cz = Math.max(minZ, Math.min(z, maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      // Inside the box (centre within it): push out along the smallest axis.
      if (d2 < 1e-8) {
        const pushL = x - minX;
        const pushR = maxX - x;
        const pushB = z - minZ;
        const pushF = maxZ - z;
        const m = Math.min(pushL, pushR, pushB, pushF);
        if (m === pushL) this.pos.x = minX - r;
        else if (m === pushR) this.pos.x = maxX + r;
        else if (m === pushB) this.pos.z = minZ - r;
        else this.pos.z = maxZ + r;
      } else {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
      }
      this._crash(Math.abs(this.speed));
      this.speed *= -0.25; // small bounce off the wall
    }
  }

  _crash(impactSpeed) {
    if (impactSpeed < 5 || this._crashCooldown > 0) return;
    this._crashCooldown = 0.6;
    if (typeof this.onCrash === 'function') {
      try { this.onCrash(impactSpeed); } catch { /* a sound hook must never break driving */ }
    }
  }

  _clampBounds(world) {
    const b = (world && world.bounds) || { minX: -214, maxX: 214, minZ: -214, maxZ: 214 };
    const m = this.length / 2 + 0.5;
    let hit = false;
    if (this.pos.x < b.minX + m) { this.pos.x = b.minX + m; hit = true; }
    if (this.pos.x > b.maxX - m) { this.pos.x = b.maxX - m; hit = true; }
    if (this.pos.z < b.minZ + m) { this.pos.z = b.minZ + m; hit = true; }
    if (this.pos.z > b.maxZ - m) { this.pos.z = b.maxZ - m; hit = true; }
    if (hit) {
      this._crash(Math.abs(this.speed));
      this.speed *= -0.2;
    }
  }

  /**
   * Advance the car one frame.
   * @param {number} dt seconds (clamped by the caller to a sane max)
   * @param {object|null} input drive input, or null to coast (traffic and
   *   parked cars call update with null and steer themselves via setPose)
   * @param {object} world the world object ({ colliders, bounds })
   */
  update(dt, input, world) {
    if (!dt || dt <= 0) return this;
    dt = Math.min(dt, 0.05);
    if (this._crashCooldown > 0) this._crashCooldown -= dt;

    const drive = readDriveInput(input);
    const s = this.spec;
    const speedAbs = Math.abs(this.speed);

    // Steering: full lock at a crawl, fading as speed rises so fast cars
    // stay stable; the handbrake brings the lock back for a slide.
    const steerAuthority = 1 / (1 + speedAbs * 0.055);
    const targetSteer = drive.steer * (drive.handbrake ? 1.35 : 1);
    this.steerAngle += (targetSteer * 0.55 - this.steerAngle) * Math.min(1, dt * 10);
    const turnRate = s.turn * steerAuthority * (drive.handbrake ? 1.9 : 1);
    const dirSign = this.speed >= 0 ? 1 : -1;
    this.heading += this.steerAngle * turnRate * dirSign * dt;
    this.skidding = drive.handbrake && speedAbs > 8;

    // Acceleration curve: strong off the line, easing near the top speed.
    if (drive.throttle > 0) {
      const headroom = Math.max(0, 1 - this.speed / s.topSpeed);
      this.speed += s.accel * (0.35 + 0.65 * headroom) * dt;
      if (this.speed > s.topSpeed) this.speed = s.topSpeed;
    } else if (drive.throttle < 0) {
      if (this.speed > 0.5) {
        // Braking while moving forward.
        this.speed -= s.accel * 1.6 * dt;
        if (this.speed < 0) this.speed = 0;
      } else {
        // Already stopped: reverse, capped well below forward speed.
        this.speed -= s.accel * 0.7 * dt;
        if (this.speed < -s.reverseTop) this.speed = -s.reverseTop;
      }
    }

    // Drag + rolling resistance; the handbrake scrubs speed hard.
    const drag = drive.handbrake ? 1.6 : 0.25;
    this.speed -= this.speed * drag * dt;
    if (!drive.throttle && speedAbs < 0.15 && Math.abs(this.speed) < 0.15) this.speed = 0;

    // Integrate.
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;

    // Handbrake slide: a little sideways drift while skidding, for feel.
    if (this.skidding) {
      const slide = this.speed * 0.12 * this.steerAngle;
      this.pos.x += Math.cos(this.heading) * slide * dt;
      this.pos.z -= Math.sin(this.heading) * slide * dt;
    }

    this._collideCircle(world);
    this._clampBounds(world);

    this.mesh.rotation.y = this.heading;
    for (const w of this.frontWheels) w.steerGroup.rotation.y = this.steerAngle * 0.9;
    this.roll(dt);
    return this;
  }
}

// ---------------------------------------------------------------------------
// Parked cars
// ---------------------------------------------------------------------------
export function spawnParkedCars(THREEImpl, world, n) {
  const T = THREEImpl || THREE;
  const rng = mulberry32(1337);
  const count = Math.max(0, n | 0);
  const cars = [];
  const kinds = ['sedan', 'sedan', 'taxi', 'sport', 'sedan', 'truck'];

  // Prefer the world's own parking spots when it published them.
  const spots = world && Array.isArray(world.spawnPoints && world.spawnPoints.cars)
    ? world.spawnPoints.cars
    : null;

  // Fallback: park along road edges on the city grid (8x8 blocks of 40,
  // roads 12 wide, road centres every 52 from -220 to 196, as world.js
  // places them).
  const roadCentres = [];
  for (let k = 0; k <= 8; k += 1) roadCentres.push(-220 + k * 52);

  for (let i = 0; i < count; i += 1) {
    let x;
    let z;
    let heading;
    if (spots && spots[i]) {
      const spot = spots[i];
      if (Array.isArray(spot)) {
        [x, z, heading] = spot;
      } else {
        x = spot.x; z = spot.z; heading = spot.heading || 0;
      }
    } else {
      const alongRoad = rng() < 0.5;
      const centre = roadCentres[Math.floor(rng() * roadCentres.length)];
      const along = -200 + rng() * 400;
      const side = rng() < 0.5 ? -1 : 1;
      if (alongRoad) {
        x = centre + side * 4.2;
        z = along;
        heading = side > 0 ? 0 : Math.PI;
      } else {
        x = along;
        z = centre + side * 4.2;
        heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const car = new Vehicle(T, kind);
    car.setPose(x, z, heading === undefined ? 0 : heading);
    car.driver = null;
    cars.push(car);
  }
  return cars;
}
