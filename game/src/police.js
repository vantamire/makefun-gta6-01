// v4 — police.js
// The wanted system: 0–5 stars, Harbor PD cruisers that spawn behind the
// player, chase, ram, and bust the player on foot. Wanted decays when the
// player stays quiet and far from every cruiser. Cops are Vehicle('police')
// cars with a flashing red/blue light bar and a siren flag the main loop
// feeds into the audio engine.
//
// New in v4: the HELICOPTER. At 3+ stars a police chopper joins the hunt
// — it circles above the player at 38 m with a sweeping searchlight and a
// rotor thump, so three stars FEEL different from two instead of just
// being a faster car.
//
// Each wanted level is one row of a pursuit table (how many cruisers,
// how fast they chase, how far back they spawn), and each cruiser runs
// a tiny state machine — cruise, chase, ram — so the pursuit reads as
// states and transitions instead of one long update.

import * as THREE from 'three';
import { Vehicle } from './vehicles.js';
import { CONFIG } from './config.js';
import { mulberry32 } from './random.js';

const MAX_WANTED = 5;
const DECAY_SECONDS = 20; // quiet seconds far from cops to lose one star
const FAR_DISTANCE = 30; // "far from the cops" for decay
const RAM_DISTANCE = 3.4;
const BUST_DISTANCE = 2.4;

// One row per wanted level: cruisers on the road, chase speed, and how
// far behind the player a fresh cruiser spawns. At one star the cruisers
// cruise at ~16 m/s, so a player on foot (9.5 m/s) is pressured but not
// caught in seconds and a car (26-34 m/s) can pull away; at 3+ stars
// they are slightly faster than the player's car, so escaping takes
// corners, not a straight line.
const PURSUIT_TABLE = [
  { cops: 0, speed: 0, behind: 70 },
  { cops: 1, speed: 16, behind: 70 },
  { cops: 2, speed: 27, behind: 42 },
  { cops: 3, speed: null, behind: 42 }, // speed: playerTop + 2, min 30
  { cops: 3, speed: null, behind: 42 },
  { cops: 3, speed: null, behind: 42 },
];

const BLOCK = 40;
const ROAD = 12;
const BLOCKS = 8;
const PITCH = BLOCK + ROAD; // 52
const HALF = (BLOCKS * BLOCK + (BLOCKS + 1) * ROAD) / 2; // 214

function roadCentres() {
  const centres = [];
  for (let k = 0; k <= BLOCKS; k += 1) centres.push(-HALF + k * PITCH);
  return centres;
}

function nearestCentre(value, centres) {
  let best = centres[0];
  let bestD = Infinity;
  for (const c of centres) {
    const d = Math.abs(c - value);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function angleTowards(current, target, maxStep) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + Math.max(-maxStep, Math.min(maxStep, diff));
}

// Normalise whatever the caller passes as "the player" into one shape.
function readPlayer(player) {
  if (!player) return null;
  const pos = player.pos || (player.mesh && player.mesh.position)
    || (player.vehicle && player.vehicle.pos) || null;
  if (!pos) return null;
  const vehicle = player.vehicle || player.currentVehicle || null;
  const onFoot = player.onFoot !== undefined ? !!player.onFoot : !vehicle;
  return {
    pos,
    heading: player.heading || (vehicle ? vehicle.heading : 0) || 0,
    speed: Math.abs(player.speed || (vehicle ? vehicle.speed : 0) || 0),
    onFoot,
    vehicle: vehicle || null,
    vehicleTopSpeed: vehicle ? (vehicle.spec ? vehicle.spec.topSpeed : (vehicle.topSpeed || 26)) : 0,
  };
}

export class Police {
  constructor(THREE, world) {
    this.THREE = THREE;
    this.world = world;
    this.rng = mulberry32(424242);
    this.roadCentres = roadCentres();
    this.bounds = (world && world.bounds) || { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };
    this.colliders = (world && world.colliders) || [];
    this.wanted = 0;
    this.stars = 0;
    this.copCars = []; // Vehicle('police') instances currently on the road
    this.busted = false;
    this.siren = false;
    this.lastRamAt = -Infinity;
    this.time = 0;
    this._quietTimer = 0;
    this._ramCooldownUntil = -Infinity;
    // The helicopter (null until 3 stars): a group with a spinning main
    // rotor, a tail rotor, and a searchlight that follows the player.
    this.heli = null;
    this.heliRotor = null;
    this.heliLight = null;
    this.heliAngle = 0;
  }

  // The chase speed for the current wanted level: the table's fixed
  // speed, or (at 3+ stars) just above the player's car's top speed.
  _chaseSpeedFor(playerTop) {
    const row = PURSUIT_TABLE[clamp(this.wanted, 0, MAX_WANTED)];
    if (row.speed !== null) return row.speed;
    return Math.max(30, playerTop + 2);
  }

  // Raise (or lower, with a negative n) the wanted level, clamped 0–5.
  addWanted(n) {
    this.wanted = clamp(this.wanted + (n | 0), 0, MAX_WANTED);
    this.stars = this.wanted;
    this.siren = this.wanted > 0;
    this._quietTimer = 0;
    return this.wanted;
  }

  // Clear everything: no stars, no cops, no bust, no helicopter.
  reset() {
    this.wanted = 0;
    this.stars = 0;
    this.siren = false;
    this.busted = false;
    this._quietTimer = 0;
    for (const cop of this.copCars) {
      if (cop.mesh && cop.mesh.parent) cop.mesh.parent.remove(cop.mesh);
    }
    this.copCars = [];
    this._removeHeli();
    return this;
  }

  _spawnCopNear(playerInfo) {
    const T = this.THREE;
    const cop = new Vehicle(T, 'police', 0x101418);
    // Spawn on a road intersection behind the player, so the siren
    // arrives a beat after the crime instead of on top of it. At one
    // star the first cruiser starts ~70 m back (42 m was a bust in
    // seconds for a player on foot); at higher heat it closes in.
    const row = PURSUIT_TABLE[clamp(this.wanted, 0, MAX_WANTED)];
    let x;
    let z;
    if (playerInfo) {
      const behindX = playerInfo.pos.x - Math.sin(playerInfo.heading) * row.behind;
      const behindZ = playerInfo.pos.z - Math.cos(playerInfo.heading) * row.behind;
      // Snap to the nearest road centre lines: cops spawn on roads.
      x = clamp(nearestCentre(behindX, this.roadCentres), this.bounds.minX + 4, this.bounds.maxX - 4);
      z = clamp(nearestCentre(behindZ, this.roadCentres), this.bounds.minZ + 4, this.bounds.maxZ - 4);
      // A little jitter so two fresh cops never share a spawn point.
      x += (this.rng() - 0.5) * 10;
      z += (this.rng() - 0.5) * 10;
    } else {
      x = this.roadCentres[Math.floor(this.rng() * this.roadCentres.length)];
      z = this.roadCentres[Math.floor(this.rng() * this.roadCentres.length)];
    }
    cop.setPose(x, z, this.rng() * Math.PI * 2);
    cop.speed = 12;
    this.copCars.push(cop);
    if (this.world && this.world.group && typeof this.world.group.add === 'function') {
      this.world.group.add(cop.mesh);
    }
    return cop;
  }

  _removeCop(cop) {
    const idx = this.copCars.indexOf(cop);
    if (idx >= 0) this.copCars.splice(idx, 1);
    if (cop.mesh && cop.mesh.parent) cop.mesh.parent.remove(cop.mesh);
  }

  _ensureCopCount(playerInfo) {
    const row = PURSUIT_TABLE[clamp(this.wanted, 0, MAX_WANTED)];
    while (this.copCars.length < row.cops) this._spawnCopNear(playerInfo);
    while (this.copCars.length > row.cops) {
      // Drop the cruiser farthest from the player first.
      let far = this.copCars[0];
      let farD = -1;
      for (const cop of this.copCars) {
        const d = playerInfo
          ? Math.hypot(cop.pos.x - playerInfo.pos.x, cop.pos.z - playerInfo.pos.z)
          : 0;
        if (d > farD) { farD = d; far = cop; }
      }
      this._removeCop(far);
    }
  }

  // ---- the helicopter ----
  _buildHeli() {
    const T = this.THREE;
    const heli = new T.Group();
    heli.name = 'police-heli';
    const bodyMat = new T.MeshStandardMaterial({ color: 0x101418, roughness: 0.5, metalness: 0.3 });
    const glassMat = new T.MeshStandardMaterial({ color: 0x7aa8c4, roughness: 0.3, metalness: 0.35 });
    const body = new T.Mesh(new T.BoxGeometry(3.4, 1.6, 2.0), bodyMat);
    body.castShadow = true;
    heli.add(body);
    const nose = new T.Mesh(new T.BoxGeometry(1.4, 1.2, 1.8), glassMat);
    nose.position.set(0, -0.1, 2.2);
    heli.add(nose);
    const tail = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 4.4), bodyMat);
    tail.position.set(0, 0.3, -3.4);
    heli.add(tail);
    const fin = new T.Mesh(new T.BoxGeometry(0.2, 1.4, 0.8), bodyMat);
    fin.position.set(0, 0.9, -5.4);
    heli.add(fin);
    // Skids.
    for (const sx of [-0.9, 0.9]) {
      const skid = new T.Mesh(new T.BoxGeometry(0.14, 0.14, 3.6), bodyMat);
      skid.position.set(sx, -1.1, 0.4);
      heli.add(skid);
    }
    // Main rotor: two long blades on a mast, spinning in update().
    const rotor = new T.Group();
    rotor.position.y = 1.1;
    for (const rz of [0, Math.PI / 2]) {
      const blade = new T.Mesh(new T.BoxGeometry(0.35, 0.06, 7.6), bodyMat);
      blade.rotation.y = rz;
      rotor.add(blade);
    }
    heli.add(rotor);
    this.heliRotor = rotor;
    // Tail rotor: a small disc on the fin.
    const tailRotor = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 0.1, 10), bodyMat);
    tailRotor.rotation.z = Math.PI / 2;
    tailRotor.position.set(0.4, 0.9, -5.4);
    heli.add(tailRotor);
    // The searchlight: a spotlight under the nose, aimed at the player.
    const light = new T.SpotLight(0xfff3c4, 60, 90, 0.35, 0.4, 1.0);
    light.position.set(0, -0.9, 1.2);
    heli.add(light);
    heli.add(light.target);
    this.heliLight = light;
    // A light bar on the belly, flashing red/blue like the cruisers.
    const barR = new T.Mesh(new T.BoxGeometry(0.5, 0.2, 0.4),
      new T.MeshBasicMaterial({ color: 0xff2e2e }));
    barR.position.set(-0.7, -0.9, 0);
    heli.add(barR);
    const barB = new T.Mesh(new T.BoxGeometry(0.5, 0.2, 0.4),
      new T.MeshBasicMaterial({ color: 0x2e6fd2 }));
    barB.position.set(0.7, -0.9, 0);
    heli.add(barB);
    this.heliBarR = barR;
    this.heliBarB = barB;
    return heli;
  }

  _spawnHeli() {
    if (this.heli) return this.heli;
    this.heli = this._buildHeli();
    this.heliAngle = 0;
    if (this.world && this.world.group && typeof this.world.group.add === 'function') {
      this.world.group.add(this.heli);
    }
    return this.heli;
  }

  _removeHeli() {
    if (!this.heli) return;
    if (this.heli.parent) this.heli.parent.remove(this.heli);
    this.heli = null;
    this.heliRotor = null;
    this.heliLight = null;
  }

  // The chopper circles above the player at HELI_HEIGHT, its searchlight
  // pinned on them, the rotor spinning and the belly bar flashing.
  _updateHeli(dt, playerInfo) {
    if (!playerInfo) {
      this._removeHeli();
      return;
    }
    if (this.wanted < CONFIG.HELI_MIN_WANTED) {
      this._removeHeli();
      return;
    }
    this._spawnHeli();
    this.heliAngle += dt * (CONFIG.HELI_SPEED / 30);
    const r = 30;
    const hx = playerInfo.pos.x + Math.cos(this.heliAngle) * r;
    const hz = playerInfo.pos.z + Math.sin(this.heliAngle) * r;
    this.heli.position.set(hx, CONFIG.HELI_HEIGHT, hz);
    this.heli.rotation.y = Math.atan2(
      playerInfo.pos.x - hx, playerInfo.pos.z - hz
    );
    if (this.heliRotor) this.heliRotor.rotation.y += dt * 28;
    if (this.heliLight) {
      this.heliLight.target.position.set(
        playerInfo.pos.x - hx, -CONFIG.HELI_HEIGHT + 1, playerInfo.pos.z - hz
      );
    }
    // Belly bar flashes red/blue, in sync with the cruisers.
    if (this.heliBarR && this.heliBarB) {
      const flash = Math.sin(this.time * 14) > 0;
      this.heliBarR.material.color.setHex(flash ? 0xff2e2e : 0x551111);
      this.heliBarB.material.color.setHex(flash ? 0x111155 : 0x2e6fd2);
    }
  }

  // The push-out for one building: the shortest way out of its AABB
  // (along the nearest face), or a radial shove when the centre is
  // already outside. Returns the distance the cop was moved.
  _pushOutOf(cop, c, r) {
    const minX = c.minX ?? -Infinity;
    const maxX = c.maxX ?? Infinity;
    const minZ = c.minZ ?? -Infinity;
    const maxZ = c.maxZ ?? Infinity;
    const cx = Math.max(minX, Math.min(cop.pos.x, maxX));
    const cz = Math.max(minZ, Math.min(cop.pos.z, maxZ));
    const dx = cop.pos.x - cx;
    const dz = cop.pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return 0;
    if (d2 < 1e-8) {
      // Centre inside the building: leave through the nearest face.
      const escapes = [
        [cop.pos.x - minX, 'x', minX - r],
        [maxX - cop.pos.x, 'x', maxX + r],
        [cop.pos.z - minZ, 'z', minZ - r],
        [maxZ - cop.pos.z, 'z', maxZ + r],
      ];
      escapes.sort((a, b) => a[0] - b[0]);
      const [, axis, at] = escapes[0];
      if (axis === 'x') cop.pos.x = at;
      else cop.pos.z = at;
      return r;
    }
    const d = Math.sqrt(d2);
    const push = r - d;
    cop.pos.x += (dx / d) * push;
    cop.pos.z += (dz / d) * push;
    return push;
  }

  // Keep a cruiser out of the buildings it cuts across while chasing.
  _pushOutOfBuildings(cop) {
    const r = cop.radius;
    for (const c of this.colliders) {
      if (!c) continue;
      if (this._pushOutOf(cop, c, r) > 0) cop.speed *= 0.6; // scraping a wall scrubs speed, no bounce
    }
  }

  // Steer one cruiser toward the player, with a limited turn rate so a
  // sharp corner at speed actually shakes a cruiser.
  _steerCop(cop, dx, dz, dt) {
    const desired = Math.atan2(dx, dz);
    const turnRate = 2.4 / (1 + Math.abs(cop.speed) * 0.02);
    cop.heading = angleTowards(cop.heading, desired, turnRate * dt);
  }

  // Chase, but ease off inside ramming range so cops shove rather than
  // orbit the player at full speed.
  _driveCop(cop, dist, chaseSpeed, dt) {
    const targetSpeed = dist < 6 ? chaseSpeed * 0.55 : chaseSpeed;
    if (cop.speed < targetSpeed) cop.speed += 14 * dt;
    else if (cop.speed > targetSpeed) cop.speed -= 10 * dt;
    cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.pos.z += Math.cos(cop.heading) * cop.speed * dt;
  }

  // Flash the light bar: red and blue alternate (the bar's halves are
  // MeshBasicMaterial, so the flash is a colour swap, not an emissive).
  _flashCop(cop, ci) {
    if (!cop.lightBarRed || !cop.lightBarBlue) return;
    const flash = Math.sin(this.time * 14 + ci * Math.PI) > 0;
    cop.lightBarRed.material.color.setHex(flash ? 0xff2e2e : 0x551111);
    cop.lightBarBlue.material.color.setHex(flash ? 0x111155 : 0x2e6fd2);
  }

  // One cruiser's chase step. Returns its distance to the player.
  _chaseCop(cop, ci, info, dt, chaseSpeed) {
    const dx = info.pos.x - cop.pos.x;
    const dz = info.pos.z - cop.pos.z;
    const dist = Math.hypot(dx, dz);
    this._steerCop(cop, dx, dz, dt);
    this._driveCop(cop, dist, chaseSpeed, dt);
    this._pushOutOfBuildings(cop);
    // Stay inside the city.
    cop.pos.x = clamp(cop.pos.x, this.bounds.minX + 2, this.bounds.maxX - 2);
    cop.pos.z = clamp(cop.pos.z, this.bounds.minZ + 2, this.bounds.maxZ - 2);
    cop.mesh.position.set(cop.pos.x, 0, cop.pos.z);
    cop.mesh.rotation.y = cop.heading;
    cop.roll(dt, 0);
    this._flashCop(cop, ci);
    return dist;
  }

  // Contact with the player's car: shove it, slow it, and (throttled)
  // raise the heat — ramming the player in a chase is a crime too.
  _ramPlayer(cop, info, dist) {
    const v = info.vehicle;
    v.speed *= 0.55;
    // A sideways nudge so the ram is felt, not just a slowdown.
    const pushX = (v.pos.x - cop.pos.x) / (dist || 1);
    const pushZ = (v.pos.z - cop.pos.z) / (dist || 1);
    v.pos.x += pushX * 0.9;
    v.pos.z += pushZ * 0.9;
    if (typeof v.onCrash === 'function') {
      try { v.onCrash(Math.abs(cop.speed)); } catch { /* sound hook */ }
    }
    if (this.time > this._ramCooldownUntil && this.wanted < MAX_WANTED) {
      this._ramCooldownUntil = this.time + 4;
      this.wanted = Math.min(MAX_WANTED, this.wanted + 1);
      this.stars = this.wanted;
      this.siren = true;
    }
    // Keep the cruiser from sitting inside the player's car.
    cop.pos.x -= pushX * 1.2;
    cop.pos.z -= pushZ * 1.2;
    cop.speed *= 0.7;
  }

  // A cruiser with no player to chase (menu / paused): idle in place,
  // lights on, rolling to a stop.
  _idleCop(cop, dt) {
    cop.speed = Math.max(0, cop.speed - 10 * dt);
    cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
    cop.pos.z += Math.cos(cop.heading) * cop.speed * dt;
    cop.mesh.position.set(cop.pos.x, 0, cop.pos.z);
  }

  // Wanted decay: quiet seconds with every cruiser far away lose one
  // star. Any contact, ram or near cop resets the clock.
  _decay(dt, nearestCopDist, rammed, hasPlayer) {
    if (hasPlayer && nearestCopDist > FAR_DISTANCE && !rammed && !this.busted) {
      this._quietTimer += dt;
      if (this._quietTimer >= DECAY_SECONDS && this.wanted > 0) {
        this.wanted -= 1;
        this.stars = this.wanted;
        this.siren = this.wanted > 0;
        this._quietTimer = 0;
      }
    } else {
      this._quietTimer = 0;
    }
  }

  /**
   * @param {number} dt seconds
   * @param {object} player the player ({ pos, heading, speed, onFoot, vehicle })
   * @param {Vehicle[]} [vehicles] other cars on the road (unused for now,
   *   kept so the main loop can pass its vehicle list unchanged)
   */
  update(dt, player, vehicles) {
    if (!dt || dt <= 0) return this;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const info = readPlayer(player);
    this._ensureCopCount(info);
    this._updateHeli(dt, info);
    if (this.copCars.length === 0) return this;

    const playerTop = info ? info.vehicleTopSpeed : 26;
    const chaseSpeed = this._chaseSpeedFor(playerTop);
    let nearestCopDist = Infinity;
    let rammed = false;

    for (let ci = 0; ci < this.copCars.length; ci += 1) {
      const cop = this.copCars[ci];
      if (!info) {
        this._idleCop(cop, dt);
        continue;
      }
      const dist = this._chaseCop(cop, ci, info, dt, chaseSpeed);
      if (dist < nearestCopDist) nearestCopDist = dist;
      // Ram: contact with the player's car shoves it and slows it down.
      if (!info.onFoot && info.vehicle && dist < RAM_DISTANCE) {
        rammed = true;
        this._ramPlayer(cop, info, dist);
      }
      // Bust: a cruiser touching the player on foot ends the run.
      if (info.onFoot && dist < BUST_DISTANCE) {
        this.busted = true;
      }
    }

    this._decay(dt, nearestCopDist, rammed, !!info);
    return this;
  }
}

// Factory kept for the module contract (main.js may call either form).
export function createPolice(THREE, world) {
  return new Police(THREE, world);
}
