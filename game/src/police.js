// VICE HARBOR — police.js
// The wanted system: 0–5 stars, Harbor PD cruisers that spawn behind the
// player, chase, ram, and bust the player on foot. Wanted decays when the
// player stays quiet and far from every cruiser. Cops are Vehicle('police')
// cars with a flashing red/blue light bar and a siren flag the main loop
// feeds into the audio engine.

import * as THREE from 'three';
import { Vehicle, mulberry32 } from './vehicles.js';

const MAX_WANTED = 5;
const DECAY_SECONDS = 20; // quiet seconds far from cops to lose one star
const FAR_DISTANCE = 30; // "far from the cops" for decay
const RAM_DISTANCE = 3.4;
const BUST_DISTANCE = 2.4;

const BLOCK = 40;
const ROAD = 12;
const BLOCKS = 8;
const PITCH = BLOCK + ROAD; // 52
const HALF = (BLOCKS * BLOCK + (BLOCKS + 1) * ROAD) / 2; // 214

function defaultRoadCentres() {
  // Must match the world builder: roads sit at -HALF - ROAD/2 + k*PITCH
  // (world.js places them there); the +ROAD/2 form lands 12 m off, on the
  // blocks, where cruisers would spawn inside buildings.
  const centres = [];
  for (let k = 0; k <= BLOCKS; k += 1) centres.push(-HALF - ROAD / 2 + k * PITCH);
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

function readPlayer(player) {
  if (!player) return null;
  // The player object, or a bare { pos, ... } stand-in.
  const pos = player.pos || (player.mesh && player.mesh.position)
    || (player.vehicle && player.vehicle.pos) || null;
  if (!pos) return null;
  const vehicle = player.vehicle || player.currentVehicle || null;
  const onFoot = player.onFoot !== undefined
    ? !!player.onFoot
    : !vehicle;
  return {
    pos,
    heading: player.heading || (vehicle ? vehicle.heading : 0) || 0,
    speed: Math.abs(player.speed || (vehicle ? vehicle.speed : 0) || 0),
    onFoot,
    vehicle: vehicle || null,
    vehicleTopSpeed: vehicle ? (vehicle.topSpeed || 26) : 0,
  };
}

/**
 * @param {object} THREEImpl the three.js module (or the imported one)
 * @param {object} world the world object ({ group, bounds, colliders })
 * @returns {{
 *   wanted, stars, copCars, busted, siren, lastRamAt,
 *   addWanted(n), update(dt, player, vehicles), reset()
 * }}
 *   `siren` is true while any star is active (the main loop passes it to
 *   audio.siren()). `busted` is set when a cop touches the player on foot;
 *   the main loop reads it and calls reset() to clear the bust.
 */
export function createPolice(THREEImpl, world) {
  const T = THREEImpl || THREE;
  const rng = mulberry32(424242);
  const roadCentres = defaultRoadCentres();
  const bounds = (world && world.bounds) || { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };
  const colliders = (world && world.colliders) || [];

  const police = {
    wanted: 0,
    stars: 0,
    copCars: [], // Vehicle('police') instances currently on the road
    busted: false,
    siren: false,
    lastRamAt: -Infinity,
    time: 0,
    _quietTimer: 0,
    _ramCooldownUntil: -Infinity,

    /** Raise (or lower, with a negative n) the wanted level, clamped 0–5. */
    addWanted(n) {
      police.wanted = clamp(police.wanted + (n | 0), 0, MAX_WANTED);
      police.stars = police.wanted;
      police.siren = police.wanted > 0;
      police._quietTimer = 0;
      return police.wanted;
    },

    /** Clear everything: no stars, no cops, no bust (after a bust or a reset). */
    reset() {
      police.wanted = 0;
      police.stars = 0;
      police.siren = false;
      police.busted = false;
      police._quietTimer = 0;
      for (const cop of police.copCars) {
        if (cop.mesh && cop.mesh.parent) cop.mesh.parent.remove(cop.mesh);
      }
      police.copCars = [];
      return police;
    },

    _spawnCopNear(playerInfo) {
      const cop = new Vehicle(T, 'police');
      cop.driver = 'police';
      cop.onCrash = null;
      // Spawn on a road intersection ~40 units behind the player, so the
      // siren arrives a beat after the crime instead of on top of it.
      let x;
      let z;
      if (playerInfo) {
        const behindX = playerInfo.pos.x - Math.sin(playerInfo.heading) * 42;
        const behindZ = playerInfo.pos.z - Math.cos(playerInfo.heading) * 42;
        // Snap to the nearest road centre lines: cops spawn on roads.
        x = clamp(nearestCentre(behindX, roadCentres), bounds.minX + 4, bounds.maxX - 4);
        z = clamp(nearestCentre(behindZ, roadCentres), bounds.minZ + 4, bounds.maxZ - 4);
        // A little jitter so two fresh cops never share a spawn point.
        x += (rng() - 0.5) * 10;
        z += (rng() - 0.5) * 10;
      } else {
        x = roadCentres[Math.floor(rng() * roadCentres.length)];
        z = roadCentres[Math.floor(rng() * roadCentres.length)];
      }
      cop.setPose(x, z, rng() * Math.PI * 2);
      cop.speed = 12;
      police.copCars.push(cop);
      if (world && world.group && typeof world.group.add === 'function') {
        world.group.add(cop.mesh);
      }
      return cop;
    },

    _removeCop(cop) {
      const idx = police.copCars.indexOf(cop);
      if (idx >= 0) police.copCars.splice(idx, 1);
      if (cop.mesh && cop.mesh.parent) cop.mesh.parent.remove(cop.mesh);
    },

    _ensureCopCount(playerInfo) {
      // 1 star = 1 cruiser, 2 stars = 2, 3+ stars = 3.
      const want = police.wanted <= 0 ? 0 : police.wanted === 1 ? 1 : police.wanted === 2 ? 2 : 3;
      while (police.copCars.length < want) police._spawnCopNear(playerInfo);
      while (police.copCars.length > want) {
        // Drop the cruiser farthest from the player first.
        let far = police.copCars[0];
        let farD = -1;
        for (const cop of police.copCars) {
          const d = playerInfo
            ? Math.hypot(cop.pos.x - playerInfo.pos.x, cop.pos.z - playerInfo.pos.z)
            : 0;
          if (d > farD) { farD = d; far = cop; }
        }
        police._removeCop(far);
      }
    },

    _pushOutOfBuildings(cop) {
      const r = cop.radius;
      for (const c of colliders) {
        if (!c) continue;
        const minX = c.minX ?? -Infinity;
        const maxX = c.maxX ?? Infinity;
        const minZ = c.minZ ?? -Infinity;
        const maxZ = c.maxZ ?? Infinity;
        const cx = Math.max(minX, Math.min(cop.pos.x, maxX));
        const cz = Math.max(minZ, Math.min(cop.pos.z, maxZ));
        const dx = cop.pos.x - cx;
        const dz = cop.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-8) {
          // Centre inside the building: shove out along the shortest side.
          const sides = [
            [cop.pos.x - minX, () => { cop.pos.x = minX - r; }],
            [maxX - cop.pos.x, () => { cop.pos.x = maxX + r; }],
            [cop.pos.z - minZ, () => { cop.pos.z = minZ - r; }],
            [maxZ - cop.pos.z, () => { cop.pos.z = maxZ + r; }],
          ];
          sides.sort((a, b) => a[0] - b[0]);
          sides[0][1]();
        } else {
          const d = Math.sqrt(d2);
          cop.pos.x += (dx / d) * (r - d);
          cop.pos.z += (dz / d) * (r - d);
        }
        cop.speed *= 0.6; // scraping a wall scrubs speed, no bounce
      }
    },

    /**
     * @param {number} dt seconds
     * @param {object} player the player ({ pos, heading, speed, onFoot, vehicle })
     * @param {Vehicle[]} [vehicles] other cars on the road (unused for now,
     *   kept so the main loop can pass its vehicle list unchanged)
     */
    update(dt, player, vehicles) {
      if (!dt || dt <= 0) return police;
      dt = Math.min(dt, 0.05);
      police.time += dt;
      const info = readPlayer(player);
      police._ensureCopCount(info);
      if (police.copCars.length === 0) return police;

      // Pursuit speed: at 3+ stars the cruisers are slightly faster than
      // the player's car, so escaping takes corners, not a straight line.
      const playerTop = info ? info.vehicleTopSpeed : 26;
      const chaseSpeed = police.wanted >= 3
        ? Math.max(30, playerTop + 2)
        : police.wanted === 2 ? 27 : 23;

      let nearestCopDist = Infinity;
      let rammed = false;

      for (let ci = 0; ci < police.copCars.length; ci += 1) {
        const cop = police.copCars[ci];
        if (!info) {
          // No player to chase (menu / paused): idle in place, lights on.
          cop.speed = Math.max(0, cop.speed - 10 * dt);
          cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
          cop.pos.z += Math.cos(cop.heading) * cop.speed * dt;
          continue;
        }
        const dx = info.pos.x - cop.pos.x;
        const dz = info.pos.z - cop.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < nearestCopDist) nearestCopDist = dist;

        // Steer toward the player, with a limited turn rate so a sharp
        // corner at speed actually shakes a cruiser.
        const desired = Math.atan2(dx, dz);
        const turnRate = 2.4 / (1 + Math.abs(cop.speed) * 0.02);
        cop.heading = angleTowards(cop.heading, desired, turnRate * dt);

        // Chase, but ease off inside ramming range so cops shove rather
        // than orbit the player at full speed.
        const targetSpeed = dist < 6 ? chaseSpeed * 0.55 : chaseSpeed;
        if (cop.speed < targetSpeed) cop.speed += 14 * dt;
        else if (cop.speed > targetSpeed) cop.speed -= 10 * dt;

        cop.pos.x += Math.sin(cop.heading) * cop.speed * dt;
        cop.pos.z += Math.cos(cop.heading) * cop.speed * dt;
        police._pushOutOfBuildings(cop);

        // Stay inside the city.
        cop.pos.x = clamp(cop.pos.x, bounds.minX + 2, bounds.maxX - 2);
        cop.pos.z = clamp(cop.pos.z, bounds.minZ + 2, bounds.maxZ - 2);
        cop.mesh.rotation.y = cop.heading;
        cop.roll(dt);

        // Flash the light bar: red and blue alternate.
        if (cop.lightBarRed && cop.lightBarBlue) {
          const flash = Math.sin(police.time * 14 + ci * Math.PI) > 0;
          cop.lightBarRed.emissiveIntensity = flash ? 2.4 : 0.25;
          cop.lightBarBlue.emissiveIntensity = flash ? 0.25 : 2.4;
        }

        // Ram: contact with the player's car shoves it and slows it down.
        if (!info.onFoot && info.vehicle && dist < RAM_DISTANCE) {
          rammed = true;
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
          // Ramming the player in a chase is a crime in itself — a small
          // wanted bump, throttled so one long shove is not five stars.
          if (police.time > police._ramCooldownUntil && police.wanted < MAX_WANTED) {
            police._ramCooldownUntil = police.time + 4;
            police.wanted = Math.min(MAX_WANTED, police.wanted + 1);
            police.stars = police.wanted;
            police.siren = true;
          }
          // Keep the cruiser from sitting inside the player's car.
          cop.pos.x -= pushX * 1.2;
          cop.pos.z -= pushZ * 1.2;
          cop.speed *= 0.7;
        }

        // Bust: a cruiser touching the player on foot ends the run.
        if (info.onFoot && dist < BUST_DISTANCE) {
          police.busted = true;
        }
      }

      // Wanted decay: 20 quiet seconds with every cruiser far away loses
      // one star. Any contact, ram or near cop resets the clock.
      if (info && !rammed && nearestCopDist > FAR_DISTANCE && !police.busted) {
        police._quietTimer += dt;
        if (police._quietTimer >= DECAY_SECONDS && police.wanted > 0) {
          police.wanted -= 1;
          police.stars = police.wanted;
          police.siren = police.wanted > 0;
          police._quietTimer = 0;
        }
      } else {
        police._quietTimer = 0;
      }
      return police;
    },
  };
  return police;
}
