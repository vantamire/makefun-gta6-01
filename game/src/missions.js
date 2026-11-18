// v4 — missions.js
// Seven completable jobs, each with checkpoints, a time limit and a
// payout: Getaway Driver, Taxi Rush, Package Run, Harbor Heist — plus
// three new ones: Pizza Delivery (pick up at the pizzeria, deliver to
// three addresses), Street Race (beat a rival AI car to three
// checkpoints), and Vigilante (ram two fleeing cars to a stop).
// Checkpoints are marked in the world by a pulsing light beacon + a
// floating diamond (built lazily from G.THREE / G.scene on the first
// update, so this module also runs logic-only with no renderer), and the
// HUD is fed through G.hud when it exists.
//
// Positions are deterministic: road intersections from the city grid,
// with the player's spawn as the anchor. This module never teleports the
// player and never throws if another system is absent.
//
// The wanted heat lands on the theft, not at the briefing: stealing the
// getaway car (or the armored truck) is what brings the stars, so a
// player on foot is never busted before they can reach a car.
//
// Structure: each job is a builder function (time limit, briefing, and
// how its checkpoints are picked) plus an advancer (what happens when
// the player reaches a checkpoint). The mission catalogue (id, title,
// payout) lives in config.js MISSION_DEFS, so the facts live in exactly
// one place.

import * as THREE from 'three';
import { MISSION_DEFS } from './config.js';
import { Vehicle } from './vehicles.js';
import { mulberry32 } from './random.js';

// City grid (shared with the world builder): 8x8 blocks of 40, roads 12
// wide, road centres every 52.
const BLOCK = 40;
const ROAD = 12;
const BLOCKS = 8;
const PITCH = BLOCK + ROAD; // 52
const HALF = (BLOCKS * BLOCK + (BLOCKS + 1) * ROAD) / 2; // 214

// Harbor Heist fixed spots. The truck parks at a road intersection by
// Coral Bank; the pier drop-off is the sand at the pier's foot, where a
// truck can actually drive (the deck itself is raised).
export const HEIST_TRUCK_POS = { x: 46, z: -58 };
export const HEIST_PIER_POS = { x: 236, z: 30 };
// The pizzeria (Pizza Delivery pickup) sits at a road intersection in
// the north-west quarter, by a PIZZA shop sign.
export const PIZZA_SHOP_POS = { x: -110, z: -110 };

function roadCentres() {
  const centres = [];
  for (let k = 0; k <= BLOCKS; k += 1) centres.push(-HALF + k * PITCH);
  return centres;
}

function gridIntersections() {
  const centres = roadCentres();
  const pts = [];
  for (const x of centres) {
    for (const z of centres) pts.push({ x, z });
  }
  return pts;
}

// Player position in whatever shape the player module hands us.
function playerPosOf(player) {
  if (!player) return null;
  if (player.pos) return player.pos;
  if (player.mesh && player.mesh.position) return player.mesh.position;
  if (player.vehicle && player.vehicle.pos) return player.vehicle.pos;
  return null;
}

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function clamp01(v) {
  return Math.max(-1, Math.min(1, v));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function hudSay(G, message) {
  if (!G || !G.hud) return;
  try {
    if (typeof G.hud.showMessage === 'function') G.hud.showMessage(message);
    else if (typeof G.hud.message === 'function') G.hud.message(message);
  } catch { /* HUD quirks must never fail a mission */ }
}

function hudObjective(G, objective, distance, timeLeft) {
  if (!G || !G.hud) return;
  try {
    if (typeof G.hud.update === 'function') G.hud.update(objective, distance, timeLeft);
  } catch { /* see above */ }
}

function addWantedHeat(G, n) {
  try {
    if (G && G.police && typeof G.police.addWanted === 'function') G.police.addWanted(n);
    else if (G && typeof G.wanted === 'number') G.wanted = Math.max(0, Math.min(5, G.wanted + n));
  } catch { /* wanted is a garnish, not the mission */ }
}

// How close the player must be to count as "at" a checkpoint. Generous
// in a car (6), tight on foot (3.5); the taxi pickup is 4.5 so the marker
// is comfortable from the driver's seat; the heist pier takes the truck's
// size into account (8).
const REACH = {
  package: 3.5,
  'taxi:pickup': 4.5,
  'heist:deliver': 8,
  fallback: 6,
};

function reachFor(active) {
  const keyed = REACH[`${active.id}:${active.phase}`];
  if (keyed !== undefined) return keyed;
  if (REACH[active.id] !== undefined) return REACH[active.id];
  return REACH.fallback;
}

// The objective line the HUD shows for the running job, by job and phase.
const OBJECTIVE_LINES = {
  'taxi:pickup': () => 'Pick up the passenger',
  taxi: () => 'Deliver the passenger',
  package: (active) => `Collect package ${active.checkpointIndex + 1}/5`,
  'heist:steal': () => 'Steal the armored truck',
  heist: () => 'Deliver the truck to the pier',
  'pizza:pickup': () => 'Pick up the pizzas',
  pizza: (active) => `Deliver pizza ${active.checkpointIndex}/3`,
  race: (active) => `Race checkpoint ${active.checkpointIndex + 1}/3 — beat the rival!`,
  vigilante: (active) => `Stop the fleeing cars (${active.stopped || 0}/2)`,
};

function objectiveLine(active) {
  const keyed = OBJECTIVE_LINES[`${active.id}:${active.phase}`]
    || OBJECTIVE_LINES[active.id];
  if (keyed) return keyed(active);
  const current = active.checkpoints[active.checkpointIndex];
  return current?.label || active.title;
}

export function createMissions(world) {
  const rng = mulberry32(20261118);
  const intersections = gridIntersections();
  const spawn = (world && world.spawnPoints) || {};
  const playerSpawn = Array.isArray(spawn.player)
    ? { x: spawn.player[0], z: spawn.player[1] }
    : { x: 0, z: 0 };

  // Spread the checkpoints across the city, deterministically.
  function farIntersections(anchor, count, minDist) {
    const pool = intersections
      .filter((p) => dist2D(p, anchor) >= minDist)
      .sort(() => rng() - 0.5);
    const picked = [];
    for (const p of pool) {
      if (picked.length >= count) break;
      if (picked.every((q) => dist2D(p, q) >= 90)) picked.push(p);
    }
    // Fallback: any far intersections, even close together.
    for (const p of pool) {
      if (picked.length >= count) break;
      if (!picked.includes(p)) picked.push(p);
    }
    return picked;
  }

  // Per-job play facts: time limit, briefing, and how its checkpoints
  // are picked. The menu facts (id, title, payout) come from
  // MISSION_DEFS, so the catalogue lives in exactly one place.
  const builders = {
    getaway: () => {
      const pts = farIntersections(playerSpawn, 3, 120);
      return {
        timeLimit: 150,
        briefing: 'Steal any car and hit all 3 checkpoints across the city before the clock runs out. The heat lands when you steal the car.',
        startPos: { ...playerSpawn },
        checkpoints: pts.map((p, i) => ({ x: p.x, z: p.z, label: `Checkpoint ${i + 1}/3` })),
      };
    },
    taxi: () => {
      const pickup = intersections
        .filter((p) => dist2D(p, playerSpawn) >= 40 && dist2D(p, playerSpawn) <= 140)
        .sort((a, b) => dist2D(a, playerSpawn) - dist2D(b, playerSpawn))[0]
        || { x: 52, z: 52 };
      const dropoff = intersections
        .slice()
        .sort((a, b) => dist2D(b, pickup) - dist2D(a, pickup))[0]
        || { x: -208, z: -208 };
      return {
        timeLimit: 120,
        briefing: 'Pick up the passenger at the marker, then deliver them to the far side of town. Fast, smooth, no shortcuts through buildings.',
        startPos: { ...pickup },
        checkpoints: [
          { x: pickup.x, z: pickup.z, label: 'Pick up the passenger' },
          { x: dropoff.x, z: dropoff.z, label: 'Drop off the passenger' },
        ],
      };
    },
    package: () => {
      let pts;
      if (Array.isArray(spawn.mission) && spawn.mission.length >= 5) {
        pts = spawn.mission.slice(0, 5).map((p) => (
          Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z }
        ));
      } else {
        pts = farIntersections(playerSpawn, 5, 50);
      }
      return {
        timeLimit: 180,
        briefing: 'On foot: collect 5 glowing packages stashed around the city. No car, no backup — just legs and a deadline.',
        startPos: { ...playerSpawn },
        checkpoints: pts.map((p, i) => ({ x: p.x, z: p.z, label: `Package ${i + 1}/5` })),
      };
    },
    heist: () => ({
      timeLimit: 180,
      briefing: 'Steal the armored truck from Coral Bank and deliver it to the pier. The moment you take the truck, 2 stars come for you.',
      startPos: { ...HEIST_TRUCK_POS },
      checkpoints: [
        { x: HEIST_TRUCK_POS.x, z: HEIST_TRUCK_POS.z, label: 'Steal the armored truck' },
        { x: HEIST_PIER_POS.x, z: HEIST_PIER_POS.z, label: 'Deliver the truck to the pier' },
      ],
    }),
    pizza: () => {
      const deliveries = farIntersections(PIZZA_SHOP_POS, 3, 100);
      return {
        timeLimit: 150,
        briefing: 'Pick up three pizzas at the pizzeria, then deliver them to three addresses across town. Hot and fast — the clock is the tip.',
        startPos: { ...PIZZA_SHOP_POS },
        checkpoints: [
          { x: PIZZA_SHOP_POS.x, z: PIZZA_SHOP_POS.z, label: 'Pick up the pizzas' },
          ...deliveries.map((p, i) => ({ x: p.x, z: p.z, label: `Delivery ${i + 1}/3` })),
        ],
      };
    },
    race: () => {
      const pts = farIntersections(playerSpawn, 3, 100);
      return {
        timeLimit: 150,
        briefing: 'Street race: beat the rival to all 3 checkpoints. He drives the same route — out-drive him, don\'t just out-run him.',
        startPos: { ...playerSpawn },
        checkpoints: pts.map((p, i) => ({ x: p.x, z: p.z, label: `Race checkpoint ${i + 1}/3` })),
      };
    },
    vigilante: () => ({
      timeLimit: 180,
      briefing: 'Two cars are fleeing the scene. Ram them to a stop — hit each one hard while you are moving. The pistol helps, but the bumper is free.',
      startPos: { ...playerSpawn },
      checkpoints: [{ x: playerSpawn.x, z: playerSpawn.z, label: 'Stop the fleeing cars' }],
    }),
  };

  const list = MISSION_DEFS.map((def) => {
    const build = builders[def.id];
    const built = build ? build() : { timeLimit: 120, briefing: '', startPos: { ...playerSpawn }, checkpoints: [] };
    return {
      ...def,
      reward: def.payout,
      briefing: built.briefing,
      timeLimit: built.timeLimit,
      startPos: built.startPos,
      checkpoints: built.checkpoints,
    };
  });

  // What happens when the player reaches the current checkpoint, by job
  // and phase. Each advancer returns true when the mission ended on this
  // step (so update() can stop), false when it continues.
  const advancers = {
    'taxi:pickup': (m, G) => {
      m.active.phase = 'dropoff';
      m.active.checkpointIndex = 1;
      m._placeMarkers(m.active.checkpoints[1]);
      hudSay(G, 'Passenger aboard — deliver them across town!');
      m._ping(G);
      return false;
    },
    'heist:steal': (m, G) => {
      m.active.phase = 'deliver';
      m.active.checkpointIndex = 1;
      m._placeMarkers(m.active.checkpoints[1]);
      hudSay(G, 'Truck spotted — get in and drive it to the pier!');
      m._ping(G);
      return false;
    },
    'heist:deliver': (m, G, player) => {
      // The drop-off only counts in the armored truck itself.
      const inTruck = player && player.vehicle && player.vehicle.armored;
      if (inTruck) {
        m._finish(G, false);
        return true;
      }
      // Throttled hint, not a per-frame toast.
      if (m._time - m._lastHintAt > 5) {
        m._lastHintAt = m._time;
        hudSay(G, 'You need the armored truck — go back and steal it!');
      }
      return false;
    },
    'pizza:pickup': (m, G) => {
      m.active.phase = 'deliver';
      m.active.checkpointIndex = 1;
      m._placeMarkers(m.active.checkpoints[1]);
      hudSay(G, 'Pizzas loaded — three deliveries to go!');
      m._ping(G);
      return false;
    },
  };

  const missions = {
    list,
    active: null,
    lastResult: null,
    // Current objective marker position ({x, z}) for the minimap/HUD, or null.
    markerPos: null,
    // Fixed heist spots, for the main loop (it spawns the truck here).
    heistTruckPos: { ...HEIST_TRUCK_POS },
    heistPierPos: { ...HEIST_PIER_POS },
    pizzaShopPos: { ...PIZZA_SHOP_POS },
    // The race rival and the vigilante fleeing cars (Vehicles), or null
    // when those jobs are not running — the main loop and the HUD read
    // them for the scene and the minimap.
    rival: null,
    fleeing: [],
    // Assignable: missions.onComplete = (result) => ...
    onComplete: null,
    _beacon: null,
    _diamond: null,
    _beaconMat: null,
    _diamondMat: null,
    _scene: null,
    _pendingHeat: 0,
    _lastHintAt: -Infinity,
    _time: 0,

    _ping(G) {
      try {
        if (G && G.audio && typeof G.audio.pickup === 'function') G.audio.pickup();
      } catch { /* sound is garnish */ }
    },

    _buildMarkers(G) {
      const T = (G && G.THREE) || THREE;
      const scene = G && (G.scene || (G.world && G.world.group));
      if (!T || !scene || typeof scene.add !== 'function') return false;
      if (this._beacon) return true;
      // Glowing vertical beacon: a tall additive cylinder the player can
      // see over the rooftops from anywhere in the city.
      const beaconGeo = new T.CylinderGeometry(1.1, 1.1, 34, 12, 1, true);
      this._beaconMat = new T.MeshBasicMaterial({
        color: 0xffc233, transparent: true, opacity: 0.26,
        blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false,
      });
      this._beacon = new T.Mesh(beaconGeo, this._beaconMat);
      // Floating diamond that bobs and spins above the exact spot.
      const diamondGeo = new T.OctahedronGeometry(1.0);
      this._diamondMat = new T.MeshBasicMaterial({ color: 0xffd34d });
      this._diamond = new T.Mesh(diamondGeo, this._diamondMat);
      this._scene = scene;
      scene.add(this._beacon);
      scene.add(this._diamond);
      return true;
    },

    _placeMarkers(checkpoint) {
      if (!checkpoint) {
        this.markerPos = null;
        return;
      }
      this.markerPos = { x: checkpoint.x, z: checkpoint.z };
      if (this._beacon) this._beacon.position.set(checkpoint.x, 17, checkpoint.z);
      if (this._diamond) this._diamond.position.set(checkpoint.x, 3.2, checkpoint.z);
    },

    _removeMarkers() {
      if (this._scene) {
        if (this._beacon) this._scene.remove(this._beacon);
        if (this._diamond) this._scene.remove(this._diamond);
      }
      this._beacon = null;
      this._diamond = null;
      this._beaconMat = null;
      this._diamondMat = null;
      this._scene = null;
      this.markerPos = null;
    },

    // The race rival: a purple sport car that drives the same checkpoints
    // as the player, a touch slower than the player's top speed, so the
    // race is won by driving well, not by having a faster car.
    _spawnRival(G) {
      const T = (G && G.THREE) || THREE;
      const rival = new Vehicle(T, 'sport', 0x7a4fd0);
      rival.setPose(playerSpawn.x + 4, playerSpawn.z - 6, Math.PI / 2);
      rival.cruise = 20;
      rival.checkpointIndex = 0;
      this.rival = rival;
      const group = world && world.group;
      if (group && typeof group.add === 'function') group.add(rival.mesh);
      return rival;
    },

    _removeRival() {
      if (!this.rival) return;
      if (this.rival.mesh && this.rival.mesh.parent) this.rival.mesh.parent.remove(this.rival.mesh);
      this.rival = null;
    },

    // The vigilante fleeing cars: two sedans that bolt away from the
    // player as soon as the job starts.
    _spawnFleeing(G) {
      const T = (G && G.THREE) || THREE;
      this.fleeing = [];
      const group = world && world.group;
      for (let i = 0; i < 2; i++) {
        const car = new Vehicle(T, 'sedan', i === 0 ? 0x2f3336 : 0xe8e6df);
        car.setPose(playerSpawn.x + 20 + i * 8, playerSpawn.z + 30 + i * 6, Math.PI / 2);
        car.stopped = false;
        this.fleeing.push(car);
        if (group && typeof group.add === 'function') group.add(car.mesh);
      }
      return this.fleeing;
    },

    _removeFleeing() {
      for (const car of this.fleeing) {
        if (car.mesh && car.mesh.parent) car.mesh.parent.remove(car.mesh);
      }
      this.fleeing = [];
    },

    // Drive the rival toward its next checkpoint with a simple
    // steer-toward controller, at its cruise speed. Returns true when
    // the rival just reached the final checkpoint (it won the race).
    _driveRival(dt) {
      const rival = this.rival;
      if (!rival || !this.active || this.active.id !== 'race') return false;
      const cps = this.active.checkpoints;
      const target = cps[rival.checkpointIndex];
      if (!target) return false;
      const dx = target.x - rival.pos.x;
      const dz = target.z - rival.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6) {
        rival.checkpointIndex += 1;
        if (rival.checkpointIndex >= cps.length) return true; // rival won
        return false;
      }
      const desired = Math.atan2(dx, dz);
      const steer = clamp01(angleDiff(desired, rival.heading) * 2.2);
      const drive = {
        throttle: rival.speed < (rival.cruise || 20) ? 1 : 0,
        steer,
        handbrake: false,
      };
      rival.update(dt, drive, world);
      return false;
    },

    // Drive the fleeing cars away from the player: each one steers away
    // from the player's position and runs at ~18 m/s. A fleeing car is
    // "stopped" when the player (in a vehicle, moving fast) rams it, or
    // when the player's pistol hits it (the main loop calls
    // missions.stopFleeing(car) for the pistol case).
    _driveFleeing(dt, player) {
      if (!this.active || this.active.id !== 'vigilante') return;
      const pos = playerPosOf(player);
      if (!pos) return;
      for (const car of this.fleeing) {
        if (car.stopped) continue;
        const dx = car.pos.x - pos.x;
        const dz = car.pos.z - pos.z;
        const away = Math.atan2(dx, dz);
        const steer = clamp01(angleDiff(away, car.heading) * 2.0);
        const drive = {
          throttle: car.speed < 18 ? 1 : 0,
          steer,
          handbrake: false,
        };
        car.update(dt, drive, world);
        // Ram check: the player's vehicle, moving fast, within 3.5 m.
        const pv = player && player.vehicle;
        if (pv && !player.onFoot && Math.abs(pv.speed || 0) > 8) {
          const d = Math.hypot(car.pos.x - pv.pos.x, car.pos.z - pv.pos.z);
          if (d < 3.5) this.stopFleeing(car, null);
        }
      }
    },

    // Mark one fleeing car stopped (rammed or shot). When both are
    // stopped, the job completes.
    stopFleeing(car, G) {
      if (!car || car.stopped) return;
      car.stopped = true;
      car.speed = 0;
      this.active.stopped = (this.active.stopped || 0) + 1;
      hudSay(G, `Fleeing car stopped (${this.active.stopped}/2)!`);
      this._ping(G);
      if (this.active.stopped >= 2) this._finish(G, false);
    },

    /** Start mission `i` (index into list, or an id string like 'taxi'). */
    start(i, G) {
      if (this.active) return null; // finish or fail the running job first
      const def = typeof i === 'string'
        ? list.find((m) => m.id === i)
        : list[i];
      if (!def) return null;
      this.active = {
        ...def,
        checkpoints: def.checkpoints.map((c) => ({ ...c })),
        checkpointIndex: 0,
        timeLeft: def.timeLimit,
        phase: def.id === 'taxi' ? 'pickup' : def.id === 'heist' ? 'steal'
          : def.id === 'pizza' ? 'pickup' : 'drive',
        stopped: 0,
        // Set by the main loop when the theft that starts the heat happens.
        heatApplied: false,
      };
      this._placeMarkers(this.active.checkpoints[0]);
      // Spawn the job's extra actors.
      if (def.id === 'race') this._spawnRival(G);
      if (def.id === 'vigilante') this._spawnFleeing(G);
      // No wanted heat here on purpose: the heat lands on the theft —
      // stealing the getaway car, or the armored truck — so a player on
      // foot is not busted before they can reach a car.
      hudSay(G, `${def.title} — ${def.briefing}`);
      return this.active;
    },

    _finish(G, failed) {
      const active = this.active;
      if (!active) return;
      this.active = null;
      this._removeMarkers();
      this._removeRival();
      this._removeFleeing();
      if (failed) {
        this.lastResult = { mission: active.id, payout: 0, timeLeft: 0, failed: true };
        hudSay(G, `Mission failed — ${active.title}. Out of time.`);
        hudObjective(G, '', 0, 0);
      } else {
        const payout = active.payout;
        if (G && typeof G.money === 'number') G.money += payout;
        this.lastResult = { mission: active.id, payout, timeLeft: Math.max(0, active.timeLeft) };
        hudSay(G, `Mission complete — ${active.title}! +$${payout}`);
        hudObjective(G, '', 0, 0);
        try {
          if (G && G.audio && typeof G.audio.success === 'function') G.audio.success();
        } catch { /* sound is garnish */ }
      }
      if (typeof this.onComplete === 'function') {
        try { this.onComplete(this.lastResult); } catch { /* the callback is the caller's */ }
      }
    },

    // The player reached the current checkpoint: advance the job, or
    // finish it. Returns true when the mission ended on this step.
    _onCheckpoint(G, player) {
      const active = this.active;
      const checkpoint = active.checkpoints[active.checkpointIndex];
      const handler = advancers[`${active.id}:${active.phase}`];
      if (handler) return handler(this, G, player);
      // Getaway / package / pizza / race checkpoints: advance, or finish
      // on the last one.
      active.checkpointIndex += 1;
      this._ping(G);
      if (active.checkpointIndex >= active.checkpoints.length) {
        this._finish(G, false);
        return true;
      }
      this._placeMarkers(active.checkpoints[active.checkpointIndex]);
      if (active.id === 'package') {
        hudSay(G, `Package ${active.checkpointIndex}/5 collected!`);
      } else if (active.id === 'pizza') {
        hudSay(G, `Delivery ${active.checkpointIndex}/3 done — next address!`);
      } else if (active.id === 'race') {
        hudSay(G, `Race checkpoint ${active.checkpointIndex}/3 — keep ahead of the rival!`);
      } else {
        hudSay(G, `${checkpoint.label} reached — ${active.checkpoints.length - active.checkpointIndex} to go!`);
      }
      return false;
    },

    /**
     * @param {number} dt seconds
     * @param {object} player the player ({ pos, ... })
     * @param {object} G the shared game state ({ hud, audio, police, money, ... })
     */
    update(dt, player, G) {
      if (!this.active) return missions;
      if (!dt || dt <= 0) return missions;
      dt = Math.min(dt, 0.05);
      this._time += dt;
      const active = this.active;

      // Deferred wanted heat (start() was called before G existed).
      if (this._pendingHeat > 0 && G) {
        addWantedHeat(G, this._pendingHeat);
        this._pendingHeat = 0;
      }

      // Markers appear as soon as the renderer exists.
      if (!this._beacon && G) this._buildMarkers(G);
      if (this._beacon && this.markerPos) {
        this._beacon.position.set(this.markerPos.x, 17, this.markerPos.z);
        this._beaconMat.opacity = 0.24 + 0.14 * Math.sin(this._time * 4);
        if (this._diamond) {
          this._diamond.position.set(this.markerPos.x, 3.2 + Math.sin(this._time * 2.2) * 0.5, this.markerPos.z);
          this._diamond.rotation.y += dt * 2.4;
        }
      }

      active.timeLeft -= dt;
      if (active.timeLeft <= 0) {
        active.timeLeft = 0;
        this._finish(G, true);
        return missions;
      }

      // The race rival drives its own checkpoints — if it finishes first,
      // the player loses the race.
      if (active.id === 'race' && this._driveRival(dt)) {
        hudSay(G, 'The rival beat you to the finish — race lost!');
        this._finish(G, true);
        return missions;
      }
      // The vigilante fleeing cars run from the player.
      if (active.id === 'vigilante') this._driveFleeing(dt, player);

      const pos = playerPosOf(player);
      if (!pos) {
        hudObjective(G, objectiveLine(active), 0, active.timeLeft);
        return missions;
      }

      // The vigilante job has no checkpoints to walk to: it ends when
      // both fleeing cars are stopped (stopFleeing finishes it).
      if (active.id === 'vigilante') {
        hudObjective(G, objectiveLine(active), 0, active.timeLeft);
        return missions;
      }

      const checkpoint = active.checkpoints[active.checkpointIndex];
      if (!checkpoint) {
        this._finish(G, false);
        return missions;
      }
      const dist = dist2D(pos, checkpoint);
      if (dist <= reachFor(active)) {
        if (this._onCheckpoint(G, player)) return missions;
      }

      const current = active.checkpoints[active.checkpointIndex];
      const currentDist = current ? dist2D(pos, current) : 0;
      hudObjective(G, `${active.title}: ${objectiveLine(active)}`, currentDist, active.timeLeft);
      return missions;
    },
  };
  return missions;
}
