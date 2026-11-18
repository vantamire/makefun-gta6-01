// VICE HARBOR — missions.js
// Four completable jobs, each with checkpoints, a time limit and a payout:
// Getaway Driver, Taxi Rush, Package Run and Harbor Heist. Checkpoints are
// marked in the world by a pulsing light beacon + a floating diamond (built
// lazily from G.THREE / G.scene on the first update, so this module also
// runs logic-only with no renderer), and the HUD is fed through G.hud when
// it exists.
//
// Positions are deterministic: road intersections from the city grid, with
// the player's spawn as the anchor. This module never teleports the player
// and never throws if another system is absent.
//
// v2: Harbor Heist — steal the armored truck from Coral Bank (road
// intersection 46, -58) and deliver it to the pier (236, 30). The wanted
// heat lands when the truck is stolen (main.js applies it on entry), not
// at mission start; the same fix applies to Getaway Driver, whose 1 star
// now lands when the player steals their first car instead of at the
// briefing, so the mission is survivable on foot.

import * as THREE from 'three';

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

// Seeded RNG (mulberry32), local so this file loads standalone.
function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function defaultRoadCentres() {
  // Must match the world builder: roads sit in the middle of the gaps
  // between blocks, at -HALF + k*PITCH (world.js places them there); the
  // -HALF - ROAD/2 form lands 6 m off, on the blocks, where checkpoints
  // would sit unreachable behind buildings.
  const centres = [];
  for (let k = 0; k <= BLOCKS; k += 1) centres.push(-HALF + k * PITCH);
  return centres;
}

function gridIntersections() {
  const centres = defaultRoadCentres();
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

/**
 * @param {object} world the world object ({ spawnPoints, bounds })
 * @returns {{
 *   list, active, lastResult, markerPos, onComplete,
 *   start(i, G?), update(dt, player, G)
 * }}
 *   `active` is null or the running mission with checkpointIndex, timeLeft
 *   and (taxi/heist) phase. `lastResult` holds { mission, payout, timeLeft }
 *   (or { mission, payout: 0, failed: true }) after a mission ends.
 *   Assign `missions.onComplete = (result) => ...` to be told when one ends.
 */
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

  const getawayPoints = farIntersections(playerSpawn, 3, 120);
  const taxiPickup = intersections
    .filter((p) => dist2D(p, playerSpawn) >= 40 && dist2D(p, playerSpawn) <= 140)
    .sort((a, b) => dist2D(a, playerSpawn) - dist2D(b, playerSpawn))[0]
    || { x: 52, z: 52 };
  const taxiDropoff = intersections
    .slice()
    .sort((a, b) => dist2D(b, taxiPickup) - dist2D(a, taxiPickup))[0]
    || { x: -208, z: -208 };
  // Package spots: prefer the world's own mission points when published.
  let packagePoints;
  if (Array.isArray(spawn.mission) && spawn.mission.length >= 5) {
    packagePoints = spawn.mission.slice(0, 5).map((p) => (
      Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z }
    ));
  } else {
    packagePoints = farIntersections(playerSpawn, 5, 50);
  }

  const list = [
    {
      id: 'getaway',
      title: 'Getaway Driver',
      briefing: 'Steal any car and hit all 3 checkpoints across the city before the clock runs out. The heat lands when you steal the car.',
      payout: 500,
      reward: 500,
      startPos: { ...playerSpawn },
      checkpoints: getawayPoints.map((p, i) => ({ x: p.x, z: p.z, label: `Checkpoint ${i + 1}/3` })),
      timeLimit: 150,
    },
    {
      id: 'taxi',
      title: 'Taxi Rush',
      briefing: 'Pick up the passenger at the marker, then deliver them to the far side of town. Fast, smooth, no shortcuts through buildings.',
      payout: 350,
      reward: 350,
      startPos: { ...taxiPickup },
      checkpoints: [
        { x: taxiPickup.x, z: taxiPickup.z, label: 'Pick up the passenger' },
        { x: taxiDropoff.x, z: taxiDropoff.z, label: 'Drop off the passenger' },
      ],
      timeLimit: 120,
    },
    {
      id: 'package',
      title: 'Package Run',
      briefing: 'On foot: collect 5 glowing packages stashed around the city. No car, no backup — just legs and a deadline.',
      payout: 300,
      reward: 300,
      startPos: { ...playerSpawn },
      checkpoints: packagePoints.map((p, i) => ({ x: p.x, z: p.z, label: `Package ${i + 1}/5` })),
      timeLimit: 180,
    },
    {
      id: 'heist',
      title: 'Harbor Heist',
      briefing: 'Steal the armored truck from Coral Bank and deliver it to the pier. The moment you take the truck, 2 stars come for you.',
      payout: 650,
      reward: 650,
      startPos: { ...HEIST_TRUCK_POS },
      checkpoints: [
        { x: HEIST_TRUCK_POS.x, z: HEIST_TRUCK_POS.z, label: 'Steal the armored truck' },
        { x: HEIST_PIER_POS.x, z: HEIST_PIER_POS.z, label: 'Deliver the truck to the pier' },
      ],
      timeLimit: 180,
    },
  ];

  const missions = {
    list,
    active: null,
    lastResult: null,
    // Current objective marker position ({x, z}) for the minimap/HUD, or null.
    markerPos: null,
    // Fixed heist spots, for the main loop (it spawns the truck here).
    heistTruckPos: { ...HEIST_TRUCK_POS },
    heistPierPos: { ...HEIST_PIER_POS },
    // Assignable: missions.onComplete = (result) => ...
    onComplete: null,
    _beacon: null,
    _diamond: null,
    _beaconMat: null,
    _diamondMat: null,
    _scene: null,
    _pendingHeat: 0,
    _lastHintAt: -Infinity,

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
        phase: def.id === 'taxi' ? 'pickup' : def.id === 'heist' ? 'steal' : 'drive',
        // Set by the main loop when the theft that starts the heat happens.
        heatApplied: false,
      };
      this._placeMarkers(this.active.checkpoints[0]);
      // No wanted heat here on purpose (v2): the heat lands on the theft —
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

    /**
     * @param {number} dt seconds
     * @param {object} player the player ({ pos, ... })
     * @param {object} G the shared game state ({ hud, audio, police, money, ... })
     */
    update(dt, player, G) {
      if (!this.active) return missions;
      if (!dt || dt <= 0) return missions;
      dt = Math.min(dt, 0.05);
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
        const t = (missions._time = (missions._time || 0) + dt);
        this._beaconMat.opacity = 0.24 + 0.14 * Math.sin(t * 4);
        if (this._diamond) {
          this._diamond.position.set(this.markerPos.x, 3.2 + Math.sin(t * 2.2) * 0.5, this.markerPos.z);
          this._diamond.rotation.y += dt * 2.4;
        }
      }

      active.timeLeft -= dt;
      if (active.timeLeft <= 0) {
        active.timeLeft = 0;
        this._finish(G, true);
        return missions;
      }

      const pos = playerPosOf(player);
      if (!pos) {
        hudObjective(G, active.checkpoints[active.checkpointIndex]?.label || active.title, 0, active.timeLeft);
        return missions;
      }

      const checkpoint = active.checkpoints[active.checkpointIndex];
      if (!checkpoint) {
        this._finish(G, false);
        return missions;
      }
      const dist = dist2D(pos, checkpoint);
      // Reach radius: generous in a car (6), tight on foot (3.5); taxi
      // pickup is 4 by the book, so 4.5 covers the marker comfortably;
      // the heist pier takes the truck's size into account (8).
      const reach = active.id === 'package' ? 3.5
        : active.id === 'taxi' && active.phase === 'pickup' ? 4.5
        : active.id === 'heist' && active.phase === 'deliver' ? 8
        : 6;

      if (dist <= reach) {
        if (active.id === 'taxi' && active.phase === 'pickup') {
          active.phase = 'dropoff';
          active.checkpointIndex = 1;
          this._placeMarkers(active.checkpoints[1]);
          hudSay(G, 'Passenger aboard — deliver them across town!');
          try {
            if (G && G.audio && typeof G.audio.pickup === 'function') G.audio.pickup();
          } catch { /* sound is garnish */ }
        } else if (active.id === 'heist' && active.phase === 'steal') {
          active.phase = 'deliver';
          active.checkpointIndex = 1;
          this._placeMarkers(active.checkpoints[1]);
          hudSay(G, 'Truck spotted — get in and drive it to the pier!');
          try {
            if (G && G.audio && typeof G.audio.pickup === 'function') G.audio.pickup();
          } catch { /* sound is garnish */ }
        } else if (active.id === 'heist' && active.phase === 'deliver') {
          // The drop-off only counts in the armored truck itself.
          const inTruck = player && player.vehicle && player.vehicle.armored;
          if (inTruck) {
            this._finish(G, false);
            return missions;
          }
          // Throttled hint, not a per-frame toast.
          const now = missions._time || 0;
          if (now - this._lastHintAt > 5) {
            this._lastHintAt = now;
            hudSay(G, 'You need the armored truck — go back and steal it!');
          }
        } else if (active.id === 'package') {
          active.checkpointIndex += 1;
          try {
            if (G && G.audio && typeof G.audio.pickup === 'function') G.audio.pickup();
          } catch { /* sound is garnish */ }
          if (active.checkpointIndex >= active.checkpoints.length) {
            this._finish(G, false);
            return missions;
          }
          this._placeMarkers(active.checkpoints[active.checkpointIndex]);
          hudSay(G, `Package ${active.checkpointIndex}/5 collected!`);
        } else {
          // Getaway checkpoint.
          active.checkpointIndex += 1;
          try {
            if (G && G.audio && typeof G.audio.pickup === 'function') G.audio.pickup();
          } catch { /* sound is garnish */ }
          if (active.checkpointIndex >= active.checkpoints.length) {
            this._finish(G, false);
            return missions;
          }
          this._placeMarkers(active.checkpoints[active.checkpointIndex]);
          hudSay(G, `${checkpoint.label} reached — ${active.checkpoints.length - active.checkpointIndex} to go!`);
        }
      }

      const current = active.checkpoints[active.checkpointIndex];
      const currentDist = current ? dist2D(pos, current) : 0;
      const objective = active.id === 'taxi' && active.phase === 'pickup'
        ? 'Pick up the passenger'
        : active.id === 'package'
          ? `Collect package ${active.checkpointIndex + 1}/5`
          : active.id === 'heist' && active.phase === 'steal'
            ? 'Steal the armored truck'
            : active.id === 'heist'
              ? 'Deliver the truck to the pier'
              : active.id === 'taxi'
                ? 'Deliver the passenger'
                : current?.label || active.title;
      hudObjective(G, `${active.title}: ${objective}`, currentDist, active.timeLeft);
      return missions;
    },
  };
  return missions;
}
