// v4 — vehicles.js
// Drivable arcade machines that READ as vehicles from the follow camera:
// cars with a stepped hood and trunk, a pale glass cabin, chrome bumpers
// and grille, fat headlights and a full-width tail-light strip, mirrors,
// and a light bar on the police cruisers — plus a motorcycle (two wheels
// in line, a rider who appears when you climb on) and a pickup with an
// open bed. Per-kind handling, handbrake slides, building collisions
// and city bounds. The player module drives one Vehicle through
// enter()/exit(); traffic and police reuse this same class, so every
// machine on the road looks, steers and spins alike.
//
// Heading convention (shared by every system): heading 0 faces +Z, and
// the forward vector is (sin(heading), 0, cos(heading)); the mesh is
// rotated with rotation.y = heading.
//
// The mesh is built from a parts table, not a chain of per-part calls:
// each kind lists its boxes (size, material, position) and the builder
// walks the table, so adding a kind is a new row instead of a new
// method. Dusk extras: brake lights that flare when you brake, and a
// real headlight beam on the player's machine.

import * as THREE from 'three';
import { mulberry32 } from './random.js';
import { CONFIG } from './config.js';

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
// thing on the road, the truck is a slow battering ram, the bus is a long
// slow wall of glass that still has to be steered around, and the bike
// is the quickest thing through traffic — and the easiest to crash.
export const VEHICLE_SPECS = {
  sedan: { length: 4.4, width: 1.9, height: 0.55, topSpeed: 26, accel: 14, reverseTop: 9, turn: 1.9, wheels: 4 },
  taxi: { length: 4.4, width: 1.9, height: 0.55, topSpeed: 24, accel: 13, reverseTop: 9, turn: 1.9, wheels: 4 },
  sport: { length: 4.2, width: 2.0, height: 0.5, topSpeed: 34, accel: 21, reverseTop: 10, turn: 2.3, wheels: 4 },
  truck: { length: 6.6, width: 2.4, height: 0.7, topSpeed: 18, accel: 9, reverseTop: 7, turn: 1.4, wheels: 4 },
  bus: { length: 8.5, width: 2.5, height: 0.8, topSpeed: 17, accel: 8, reverseTop: 6, turn: 1.2, wheels: 4 },
  police: { length: 4.6, width: 2.0, height: 0.55, topSpeed: 30, accel: 17, reverseTop: 10, turn: 2.1, wheels: 4 },
  motorcycle: { length: 2.2, width: 0.7, height: 0.5, topSpeed: 32, accel: 24, reverseTop: 6, turn: 2.6, wheels: 2 },
  pickup: { length: 5.2, width: 2.0, height: 0.6, topSpeed: 25, accel: 15, reverseTop: 9, turn: 1.8, wheels: 4 },
};

const KIND_COLORS = {
  sedan: [0xd23c2e, 0x2e6fd2, 0x9aa5ad, 0x2f3336, 0xe8e6df],
  taxi: [0xe8b93a],
  sport: [0xd23c2e, 0x7a4fd0, 0x18a7a0, 0xe8e6df],
  truck: [0x9aa5ad, 0x3fae6a, 0x2e6fd2],
  bus: [0x2e6fd2, 0xe8b93a, 0x3fae6a, 0xd23c2e],
  police: [0x101418], // black-and-white body is painted in two tones below
  motorcycle: [0xd23c2e, 0x2f3336, 0x7a4fd0, 0xe8b93a],
  pickup: [0x3fae6a, 0xd2691e, 0x2e6fd2, 0x9aa5ad],
};

// Shared geometries / materials so a street full of machines stays cheap.
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
let _bikeWheelGeo = null;
let _glassMat = null;
let _tyreMat = null;
let _hubMat = null;
function sharedMats(T) {
  if (!_wheelGeo) {
    // Big wheels (r 0.38) so they are visible from the follow camera,
    // with a bright hub that shows the spin.
    _wheelGeo = new T.CylinderGeometry(0.38, 0.38, 0.3, 16);
    _bikeWheelGeo = new T.CylinderGeometry(0.34, 0.34, 0.16, 16);
    // Pale glass, low metalness: high-metal glass mirrors the dusk and
    // reads as a black hole. This reads as windows instead.
    _glassMat = new T.MeshStandardMaterial({ color: 0x7aa8c4, roughness: 0.3, metalness: 0.35 });
    _tyreMat = new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.95, metalness: 0 });
    _hubMat = new T.MeshStandardMaterial({ color: 0xd7dde3, roughness: 0.2, metalness: 0.9 });
  }
  return { wheelGeo: _wheelGeo, bikeWheelGeo: _bikeWheelGeo, glassMat: _glassMat, tyreMat: _tyreMat, hubMat: _hubMat };
}

// ---------------------------------------------------------------------------
// Input reading: accepts the game's input object in several shapes so the
// machine never breaks if the input module changes its API.
// ---------------------------------------------------------------------------

// Drive keys, by direction: the machine reads the live key set through these.
const DRIVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
};

function anyKey(input, codes) {
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
    || anyKey(input, DRIVE_KEYS.up);
  const down = input.down === true || input.back === true || input.brake === true
    || anyKey(input, DRIVE_KEYS.down);
  const left = input.left === true || anyKey(input, DRIVE_KEYS.left);
  const right = input.right === true || anyKey(input, DRIVE_KEYS.right);
  const handbrake = input.handbrake === true || input.space === true
    || anyKey(input, DRIVE_KEYS.handbrake);
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
// Mesh building: one parts table per kind.
// ---------------------------------------------------------------------------
// A part spec is [size, material, position, flags]:
//   size: [w, h, d] for a box.
//   material: 'body' (the paint), 'glass', 'chrome' (bumpers and grille),
//     'head', 'tail' (the full-width rear strip), 'hood', 'trunk',
//     'skirt', 'mirror', 'fender', 'door' (police white), 'cargo'
//     (truck box), 'bed' (pickup open bed), 'rail' (bed rails), 'dest'
//     (bus destination band), 'sign' (taxi roof board), 'bar' (police
//     light-bar base), 'lightRed' / 'lightBlue' (the bar's flashing
//     halves — stored on the vehicle for the chase flash), 'check' (taxi
//     checker squares), 'tank' (bike fuel tank), 'seat' (bike saddle),
//     'bars' (bike handlebars).
//   position: [x, y, z] relative to the centre (forward is +Z).
//   flags: 'shadow' casts a shadow; 'bar' marks the light-bar halves.
function bodyParts(kind, s) {
  const L = s.length;
  const W = s.width;
  const H = s.height;
  // Every four-wheeler gets the same silhouette bones: stepped hood up
  // front, a trunk at the back, chrome bumpers and grille, mirrors, side
  // skirts, fender flares over the wheels, fat headlights and a tail
  // strip that runs the whole width of the rear — so the rear view (what
  // the follow camera sees) reads as a car, not a box.
  const bones = [
    // Stepped hood (front) and trunk (rear): lower than the cabin, so
    // the silhouette has three levels instead of one flat slab.
    [[W * 0.94, 0.3, L * 0.26], 'hood', [0, 0.68, L * 0.36], []],
    [[W * 0.94, 0.3, L * 0.24], 'trunk', [0, 0.68, -L * 0.37], []],
    // Chrome bumpers, front and back.
    [[W * 0.98, 0.2, 0.16], 'chrome', [0, 0.42, L / 2 + 0.02], []],
    [[W * 0.98, 0.2, 0.16], 'chrome', [0, 0.42, -L / 2 - 0.02], []],
    // Grille: dark bar between the headlights.
    [[W * 0.5, 0.16, 0.08], 'grille', [0, 0.62, L / 2 + 0.03], []],
    // Headlights (warm white, fat) and the full-width tail strip.
    [[0.5, 0.16, 0.1], 'head', [-W / 2 + 0.34, 0.68, L / 2 + 0.02], []],
    [[0.5, 0.16, 0.1], 'head', [W / 2 - 0.34, 0.68, L / 2 + 0.02], []],
    [[W * 0.92, 0.14, 0.08], 'tail', [0, 0.68, -L / 2 - 0.02], []],
    // Side mirrors on the cabin front corners.
    [[0.12, 0.1, 0.2], 'mirror', [-W / 2 - 0.04, 1.02, L * 0.14], []],
    [[0.12, 0.1, 0.2], 'mirror', [W / 2 + 0.04, 1.02, L * 0.14], []],
    // Side skirts along the lower flanks.
    [[0.08, 0.14, L * 0.62], 'skirt', [-W / 2 - 0.01, 0.36, 0], []],
    [[0.08, 0.14, L * 0.62], 'skirt', [W / 2 + 0.01, 0.36, 0], []],
    // Fender flares over the four wheel arches.
    [[0.5, 0.07, 0.95], 'fender', [-W / 2 + 0.06, 0.82, L / 2 - 0.85], []],
    [[0.5, 0.07, 0.95], 'fender', [W / 2 - 0.06, 0.82, L / 2 - 0.85], []],
    [[0.5, 0.07, 0.95], 'fender', [-W / 2 + 0.06, 0.82, -L / 2 + 0.85], []],
    [[0.5, 0.07, 0.95], 'fender', [W / 2 - 0.06, 0.82, -L / 2 + 0.85], []],
  ];
  if (kind === 'motorcycle') {
    // A bike: fuel tank, saddle, handlebars, a small fairing and a
    // single round headlight. Two wheels in line (built by _buildWheels).
    return [
      [[W * 0.9, 0.35, L * 0.3], 'tank', [0, 0.82, L * 0.08], ['shadow']],
      [[W * 0.8, 0.14, L * 0.28], 'seat', [0, 0.78, -L * 0.28], []],
      [[W * 1.4, 0.06, 0.06], 'bars', [0, 1.02, L * 0.38], []],
      [[W * 0.7, 0.4, 0.08], 'fairing', [0, 0.72, L * 0.46], []],
      [[0.28, 0.2, 0.08], 'head', [0, 0.78, L / 2 + 0.02], []],
      [[W * 0.6, 0.12, 0.08], 'tail', [0, 0.72, -L / 2 - 0.02], []],
    ];
  }
  if (kind === 'pickup') {
    return [
      // Glass cab up front + an open bed behind, with low side rails.
      [[W * 0.86, 0.5, L * 0.32], 'glass', [0, 1.02, L * 0.28], ['shadow']],
      [[W * 0.8, 0.12, L * 0.3], 'body', [0, 1.32, L * 0.28], []],
      [[W * 0.9, 0.4, L * 0.42], 'bed', [0, 0.62, -L * 0.24], []],
      [[0.08, 0.35, L * 0.42], 'rail', [-W * 0.47, 0.95, -L * 0.24], []],
      [[0.08, 0.35, L * 0.42], 'rail', [W * 0.47, 0.95, -L * 0.24], []],
      [[W * 0.94, 0.35, 0.08], 'rail', [0, 0.95, -L * 0.45], []],
      ...bones,
    ];
  }
  if (kind === 'truck') {
    return [
      // Glass cab up front + tall cargo box behind, with ribs.
      [[W * 0.92, 0.9, 1.5], 'glass', [0, 1.15, L / 2 - 0.9], ['shadow']],
      [[W * 0.92, 0.16, 1.5], 'body', [0, 1.66, L / 2 - 0.9], []],
      [[W * 0.96, 1.5, L * 0.55], 'cargo', [0, 1.35, -L * 0.16], ['shadow']],
      [[0.14, 1.5, L * 0.55], 'rib', [-W * 0.49, 1.35, -L * 0.16], []],
      [[0.14, 1.5, L * 0.55], 'rib', [W * 0.49, 1.35, -L * 0.16], []],
      ...bones,
    ];
  }
  if (kind === 'bus') {
    return [
      // A long pale glass band down both sides under a body-colour roof,
      // so it reads as a bus from the street instead of a stretched van.
      [[W * 0.9, 0.62, L * 0.74], 'glass', [0, 1.18, -L * 0.04], ['shadow']],
      [[W * 0.94, 0.14, L * 0.9], 'body', [0, 1.56, -L * 0.02], []],
      // A pale destination band above the windshield.
      [[W * 0.6, 0.22, 0.1], 'dest', [0, 1.3, L / 2 + 0.02], []],
      ...bones,
    ];
  }
  const parts = [
    // Ordinary car: pale glasshouse + body-colour roof, so the cabin
    // reads against the paint instead of melting into it.
    [[W * 0.86, 0.5, L * 0.48], 'glass', [0, 1.02, -L * 0.04], ['shadow']],
    [[W * 0.8, 0.12, L * 0.48 * 0.92], 'body', [0, 1.32, -L * 0.04], []],
    // Windshield + rear window: slightly brighter glass planes on the
    // cabin's front and back faces.
    [[W * 0.8, 0.44, 0.06], 'windshield', [0, 1.02, L * 0.2], []],
    [[W * 0.8, 0.44, 0.06], 'windshield', [0, 1.02, -L * 0.28], []],
    ...bones,
  ];
  if (kind === 'taxi') {
    // Roof sign: the classic lit taxi board.
    parts.push([[0.34, 0.22, 0.7], 'sign', [0, 1.48, -L * 0.04], []]);
    // Black-and-white checker band along both flanks.
    for (let i = 0; i < 6; i++) {
      const z = -L * 0.28 + i * (L * 0.56 / 6);
      const c = i % 2 === 0 ? 'checkW' : 'checkB';
      parts.push([[0.06, 0.14, L * 0.56 / 6], c, [-W / 2 - 0.01, 0.58, z], []]);
      parts.push([[0.06, 0.14, L * 0.56 / 6], c, [W / 2 + 0.01, 0.58, z], []]);
    }
  }
  if (kind === 'sport') {
    // Rear spoiler: a thin wing on two short supports above the trunk —
    // the supercar cue. The reference's red sports car wears one, and
    // the low stance (height 0.5) plus the wing is what makes a sport
    // car read as a sport car from the follow camera.
    parts.push([[W * 0.92, 0.07, 0.5], 'spoiler', [0, 1.18, -L / 2 + 0.35], ['shadow']]);
    parts.push([[0.08, 0.32, 0.08], 'spoiler', [-W * 0.3, 1.0, -L / 2 + 0.35], []]);
    parts.push([[0.08, 0.32, 0.08], 'spoiler', [W * 0.3, 1.0, -L / 2 + 0.35], []]);
  }
  if (kind === 'police') {
    // White doors on a black body + a bigger red/blue light bar.
    parts.push([[W + 0.02, H * 0.92, L * 0.52], 'door', [0, 0.55, -L * 0.02], []]);
    parts.push([[W * 0.62, 0.12, 0.52], 'bar', [0, 1.44, -L * 0.04], []]);
    parts.push([[W * 0.28, 0.2, 0.44], 'lightRed', [-W * 0.17, 1.58, -L * 0.04], ['bar']]);
    parts.push([[W * 0.28, 0.2, 0.44], 'lightBlue', [W * 0.17, 1.58, -L * 0.04], ['bar']]);
  }
  return parts;
}

  // ---------------------------------------------------------------------------
  // Vehicle
  // ---------------------------------------------------------------------------
  export class Vehicle {
    constructor(THREE, kind, color, opts) {
      this.THREE = THREE;
      this.kind = kind;
      this.spec = VEHICLE_SPECS[kind] || VEHICLE_SPECS.sedan;
      const palette = KIND_COLORS[kind] || CAR_COLORS;
      this.color = color !== undefined ? color : palette[0];
      this.isBike = kind === 'motorcycle';
      this.pos = { x: 0, y: 0, z: 0 };
      this.heading = 0;
      this.speed = 0;
      this.steerAngle = 0;
      this.occupied = false;
      this.lastCrash = 0;
      this.radius = Math.max(this.spec.length, this.spec.width) / 2 * 0.9;
      this._mats = sharedMats(THREE);
      this.mesh = new THREE.Group();
      this.paintMeshes = [];
      this._buildBody(THREE, opts || {});
      this._buildWheels(THREE);
      if (this.isBike) this._buildRider(THREE);
      // A real headlight beam for the player's machine: a spotlight the
      // caller switches on with setHeadlights(true). It is a child of the
      // mesh so it swings with the car.
      const spot = new THREE.SpotLight(0xffe6a8, 0, 42, 0.5, 0.5, 1.2);
      spot.position.set(0, 1.0, this.spec.length / 2);
      spot.target.position.set(0, 0, this.spec.length / 2 + 18);
      spot.visible = false;
      this.mesh.add(spot);
      this.mesh.add(spot.target);
      this.headlight = spot;
      this.mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    }

    // Build the body from the kind's parts table.
    _buildBody(THREE, opts) {
      const s = this.spec;
      const paint = stdMat(this.color);
      const dark = stdMat(0x14161a);
      const chrome = stdMat(0xd7dde3, { roughness: 0.15, metalness: 0.95 });
      const cargo = stdMat(0xf2f0ea, { roughness: 0.7, metalness: 0.05 });
      const white = stdMat(0xf2ede2, { roughness: 0.6, metalness: 0.05 });
      const tail = new THREE.MeshBasicMaterial({ color: 0xff2e2e });
      const head = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
      const dest = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
      const sign = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
      const windshield = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, roughness: 0.25, metalness: 0.4 });
      const red = new THREE.MeshBasicMaterial({ color: 0xff2e2e });
      const blue = new THREE.MeshBasicMaterial({ color: 0x2e6fd2 });
      this.tailMat = tail;
      this.lightBarRed = null;
      this.lightBarBlue = null;
      const mats = {
        body: paint, hood: paint, trunk: paint, skirt: paint, fender: paint,
        rib: paint, bed: paint, rail: paint, fairing: paint, tank: paint,
        spoiler: paint,
        glass: this._mats.glassMat, windshield, chrome, cargo, door: white,
        dest, sign, checkW: white, checkB: dark, bar: dark, seat: dark,
        grille: dark, mirror: paint, head, tail, lightRed: red, lightBlue: blue,
        bars: chrome,
      };
      // The chassis: the main body-colour box everything else sits on
      // (the bike has no chassis — its tank and saddle ARE the body).
      if (!this.isBike) {
        const chassis = new THREE.Mesh(boxGeo(s.width, s.height, s.length), paint);
        chassis.position.y = 0.55;
        chassis.castShadow = true;
        this.mesh.add(chassis);
        this.paintMeshes.push(chassis);
      }
      for (const [size, matName, pos, flags] of bodyParts(this.kind, s)) {
        const mesh = new THREE.Mesh(boxGeo(size[0], size[1], size[2]), mats[matName] || paint);
        mesh.position.set(pos[0], pos[1], pos[2]);
        if (flags && flags.includes('shadow')) mesh.castShadow = true;
        if (matName === 'body' || matName === 'hood' || matName === 'trunk'
          || matName === 'skirt' || matName === 'fender' || matName === 'rib'
          || matName === 'bed' || matName === 'rail' || matName === 'fairing'
          || matName === 'tank' || matName === 'mirror' || matName === 'spoiler') {
          this.paintMeshes.push(mesh);
        }
        if (flags && flags.includes('bar')) {
          if (matName === 'lightRed') this.lightBarRed = mesh;
          if (matName === 'lightBlue') this.lightBarBlue = mesh;
        }
        this.mesh.add(mesh);
      }
    }

    // Four wheels (front pair steers) or two in line for the bike.
    _buildWheels(THREE) {
      const s = this.spec;
      const { wheelGeo, bikeWheelGeo, tyreMat, hubMat } = this._mats;
      this.steerGroups = [];
      this.spinGroups = [];
      const makeWheel = (x, z, geo, steerable) => {
        const steer = new THREE.Group();
        steer.position.set(x, steerable ? 0.38 : 0.38, z);
        const spin = new THREE.Group();
        const tyre = new THREE.Mesh(geo, tyreMat);
        tyre.rotation.z = Math.PI / 2;
        spin.add(tyre);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, geo === bikeWheelGeo ? 0.2 : 0.34, 10), hubMat);
        hub.rotation.z = Math.PI / 2;
        spin.add(hub);
        steer.add(spin);
        this.mesh.add(steer);
        if (steerable) this.steerGroups.push(steer);
        this.spinGroups.push(spin);
        return steer;
      };
      if (this.isBike) {
        makeWheel(0, s.length * 0.35, bikeWheelGeo, true);
        makeWheel(0, -s.length * 0.35, bikeWheelGeo, false);
        return;
      }
      const hw = s.width / 2 - 0.1;
      const fl = s.length / 2 - 0.85;
      makeWheel(-hw, fl, wheelGeo, true);
      makeWheel(hw, fl, wheelGeo, true);
      makeWheel(-hw, -fl, wheelGeo, false);
      makeWheel(hw, -fl, wheelGeo, false);
    }

    // The bike rider: torso, helmet and arms, hidden until someone climbs
    // on — so a parked bike reads as empty and a ridden bike reads as a
    // rider, not a floating ghost machine.
    _buildRider(THREE) {
      const rider = new THREE.Group();
      const torso = new THREE.Mesh(boxGeo(0.42, 0.55, 0.24), stdMat(0x2a2d33));
      torso.position.set(0, 1.12, -0.12);
      rider.add(torso);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), stdMat(0xd23c2e));
      helmet.position.set(0, 1.52, -0.08);
      rider.add(helmet);
      for (const sx of [-1, 1]) {
        const arm = new THREE.Mesh(boxGeo(0.09, 0.09, 0.5), stdMat(0x2a2d33));
        arm.position.set(sx * 0.24, 1.22, 0.28);
        arm.rotation.x = -0.5;
        rider.add(arm);
      }
      rider.visible = false;
      this.mesh.add(rider);
      this.rider = rider;
    }

    forward() {
      return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
    }

    setPose(x, z, heading) {
      this.pos.x = x;
      this.pos.y = 0;
      this.pos.z = z;
      this.heading = heading;
      this.mesh.position.set(x, 0, z);
      this.mesh.rotation.y = heading;
    }

    roll(dt, steer) {
      const s = this.spec;
      this.steerAngle = steer * 0.42;
      for (const g of this.steerGroups) g.rotation.y = this.steerAngle;
      const spin = (this.speed * dt) / 0.38;
      for (const g of this.spinGroups) g.rotation.x += spin;
    }

    setHeadlights(on) {
      if (this.headlight) this.headlight.visible = !!on;
    }

    enter() {
      this.occupied = true;
      if (this.rider) this.rider.visible = true;
    }

    exit() {
      this.occupied = false;
      if (this.rider) this.rider.visible = false;
    }

    stop() {
      this.speed = 0;
    }

    repaint(color) {
      this.color = color;
      const paint = stdMat(color);
      for (const m of this.paintMeshes) m.material = paint;
    }

    onCrash(intensity) {
      this.lastCrash = intensity;
      return intensity;
    }

    // Arcade drive: acceleration, drag, reverse, handbrake slides, and
    // building + bounds collisions. Returns the impact speed when a wall
    // is hit (0 otherwise) so the caller can play the crash sound.
    update(dt, input, world) {
      const s = this.spec;
      const drive = readDriveInput(input);
      const prevSpeed = this.speed;
      // Accelerate / brake / reverse.
      if (drive.throttle > 0) {
        this.speed += s.accel * dt;
      } else if (drive.throttle < 0) {
        if (this.speed > 0.5) this.speed -= s.accel * 1.4 * dt; // brake
        else this.speed -= s.accel * 0.7 * dt; // reverse
      }
      // Handbrake: kill speed fast and loosen the rear — a slide.
      if (drive.handbrake) {
        this.speed *= Math.max(0, 1 - 2.2 * dt);
      }
      // Drag + caps.
      this.speed *= Math.max(0, 1 - 0.35 * dt);
      const top = this.speed >= 0 ? s.topSpeed : s.reverseTop;
      if (Math.abs(this.speed) > top) this.speed = Math.sign(this.speed) * top;
      if (Math.abs(this.speed) < 0.05 && drive.throttle === 0) this.speed = 0;
      // Steering authority falls with speed (a parked car turns on the
      // spot; a fast one does not), and the handbrake loosens it back up.
      let authority = 1 / (1 + Math.abs(this.speed) * 0.06);
      if (drive.handbrake) authority *= 1.6;
      const dir = this.speed >= 0 ? 1 : -1;
      this.heading += drive.steer * s.turn * authority * dir * dt;
      const f = this.forward();
      this.pos.x += f.x * this.speed * dt;
      this.pos.z += f.z * this.speed * dt;
      // The mesh rides at pos.y, not at a forced 0: a car launched off a
      // jump pad keeps its height while main.js runs the vertical
      // physics, and lands back on the road when the arc ends. Parked,
      // traffic and police cars never leave pos.y at 0, so nothing else
      // changes.
      this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.rotation.y = this.heading;
      this.roll(dt, drive.steer);
      // Brake lights flare while the brake key is held and the car is
      // moving forward — the follow camera sees the stop.
      if (this.tailMat) {
        this.tailMat.color.setHex(drive.throttle < 0 && this.speed > 0.5 ? 0xff6b6b : 0xff2e2e);
      }
      let impact = 0;
      if (world) {
        // Building collisions: circle vs AABB, pushed out along the
        // smallest penetration axis; the speed into the wall is lost.
        if (world.colliders) {
          for (const c of world.colliders) {
            const cx = Math.max(c.minX, Math.min(this.pos.x, c.maxX));
            const cz = Math.max(c.minZ, Math.min(this.pos.z, c.maxZ));
            const dx = this.pos.x - cx;
            const dz = this.pos.z - cz;
            const d2 = dx * dx + dz * dz;
            const r = this.radius;
            if (d2 < r * r && d2 > 0.000001) {
              const d = Math.sqrt(d2);
              const push = r - d;
              this.pos.x += (dx / d) * push;
              this.pos.z += (dz / d) * push;
              this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
              if (Math.abs(prevSpeed) > 6) impact = Math.max(impact, Math.abs(prevSpeed));
              this.speed *= 0.4;
            }
          }
        }
        // City bounds: the beach is open to the water, but the car stops
        // at the shoreline (the water is not drivable).
        if (world.bounds) {
          const b = world.bounds;
          if (this.pos.x < b.minX) { this.pos.x = b.minX; this.speed *= 0.5; }
          if (this.pos.x > b.maxX) { this.pos.x = b.maxX; this.speed *= 0.5; }
          if (this.pos.z < b.minZ) { this.pos.z = b.minZ; this.speed *= 0.5; }
          if (this.pos.z > b.maxZ) { this.pos.z = b.maxZ; this.speed *= 0.5; }
          this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
        }
      }
      if (impact > 0) this.onCrash(impact);
      return impact;
    }
  }

// ---------------------------------------------------------------------------
// Spawners
// ---------------------------------------------------------------------------

// Parked cars along the roads: a seeded pick of kind + colour, parked
// parallel to the road, so the street is full but the layout is identical
// on every run.
export function spawnParkedCars(THREE, world, rng, count) {
  const kinds = ['sedan', 'taxi', 'sport', 'truck', 'bus', 'pickup', 'motorcycle'];
  const cars = [];
  const half = CONFIG.WORLD_SIZE / 2;
  const pitch = CONFIG.ROAD_WIDTH + CONFIG.BLOCK_SIZE;
  const roadC = (i) => -half + i * pitch;
  for (let i = 0; i < count; i++) {
    const kind = rng.choice(kinds);
    const palette = KIND_COLORS[kind];
    const color = palette[rng.int(0, palette.length - 1)];
    const car = new Vehicle(THREE, kind, color);
    const vertical = rng.chance(0.5);
    const line = roadC(rng.int(1, CONFIG.GRID_BLOCKS - 1));
    const along = rng.range(-half + 30, half - 30);
    const side = rng.chance(0.5) ? 3 : -3;
    const heading = vertical
      ? (rng.chance(0.5) ? 0 : Math.PI)
      : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    if (vertical) car.setPose(line + side, along, heading);
    else car.setPose(along, line + side, heading);
    cars.push(car);
  }
  return cars;
}

// The armored truck the Harbor Heist mission revolves around: a slow,
// heavy truck parked by the pier, waiting to be rammed. `armored` marks
// it so the mission can tell it apart from any other truck.
export function spawnArmoredTruck(THREE, world, rng) {
  const truck = new Vehicle(THREE, 'truck', 0x9aa5ad);
  truck.armored = true;
  const half = CONFIG.WORLD_SIZE / 2;
  const pitch = CONFIG.ROAD_WIDTH + CONFIG.BLOCK_SIZE;
  const roadC = (i) => -half + i * pitch;
  truck.setPose(roadC(6) + 3, roadC(2) + 10, Math.PI / 2);
  return truck;
}
