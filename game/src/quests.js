// VICE HARBOR v7 — the twelve missions.
// A small data-driven engine: each quest is a list of steps, and the
// engine walks them in order, shows a beacon at the current target,
// and pays out on completion. Step kinds: reach a point, collect
// several points, enter a vehicle, drive a vehicle somewhere, ram
// fleeing cars to a stop, and race a rival through checkpoints. The
// quest list (names, pay, blurbs) comes from settings.js; the steps
// and the time limits live here, next to the code that runs them.

import { QUESTS } from './settings.js';

// Checkpoint sets, in city coordinates (the grid runs -222..222).
const CP = {
  getaway: [
    { x: -150, z: -150 }, { x: 150, z: 150 }, { x: -150, z: 150 },
  ],
  courier: [
    { x: -120, z: -120 }, { x: 120, z: -120 }, { x: 0, z: 0 },
    { x: -120, z: 120 }, { x: 120, z: 120 },
  ],
  race: [
    { x: -150, z: -150 }, { x: 150, z: -150 }, { x: 150, z: 150 }, { x: 0, z: 150 },
  ],
  bridge: [
    { x: 0, z: 180 }, { x: 0, z: 0 }, { x: 0, z: -150 }, { x: -150, z: -200 },
  ],
  airport: [
    { x: 100, z: 100 }, { x: -100, z: 0 }, { x: 100, z: -100 },
    { x: -100, z: -150 }, { x: -182, z: -182 },
  ],
  dockCrates: [
    { x: -150, z: -180 }, { x: -120, z: -170 }, { x: -180, z: -160 }, { x: -100, z: -190 },
  ],
};

// Step lists per quest id. `time` is the whole quest's limit in seconds.
const STEPS = {
  getaway: {
    time: 180,
    steps: [
      { type: 'enter', vehicle: 'any', label: 'Steal any car' },
      { type: 'reach', points: CP.getaway, label: 'Hit the checkpoints' },
    ],
  },
  cab: {
    time: 180,
    steps: [
      { type: 'reach', points: [{ x: -100, z: 100 }], label: 'Pick up the passenger' },
      { type: 'reach', points: [{ x: 150, z: -150 }], label: 'Drop them off across town' },
    ],
  },
  courier: {
    time: 180,
    steps: [
      { type: 'collect', points: CP.courier, label: 'Collect the 5 parcels' },
    ],
  },
  heist: {
    time: 240,
    heat: 2,
    steps: [
      { type: 'enter', vehicle: 'truck', label: 'Steal the armored van from Coral Bank' },
      { type: 'deliver', vehicle: 'truck', x: 292, z: 30, label: 'Deliver the van to the pier' },
    ],
  },
  pizza: {
    time: 240,
    steps: [
      { type: 'reach', points: [{ x: 224, z: 60 }], label: 'Grab the pizzas at the boardwalk pizzeria' },
      { type: 'reach', points: [{ x: 200, z: 120 }], label: 'Deliver pizza 1 (on foot is fine)' },
      { type: 'reach', points: [{ x: -120, z: -60 }], label: 'Deliver pizza 2' },
      { type: 'reach', points: [{ x: 60, z: 180 }], label: 'Deliver pizza 3 — hot!' },
    ],
  },
  race: {
    time: 200,
    steps: [
      { type: 'race', points: CP.race, label: 'Beat the rival through 4 checkpoints' },
    ],
  },
  vigilante: {
    time: 200,
    steps: [
      { type: 'ram', count: 2, label: 'Ram the 2 fleeing cars to a stop' },
    ],
  },
  nightcab: {
    time: 300,
    night: true,
    steps: [
      { type: 'fare', count: 3, label: 'Three fares, one night — pick up, drop off' },
    ],
  },
  dockside: {
    time: 240,
    steps: [
      { type: 'collect', points: CP.dockCrates, label: 'Haul the 4 crates from the yard' },
      { type: 'reach', points: [{ x: 262, z: 46 }], label: 'Drop the crates at the marina' },
    ],
  },
  bridge: {
    time: 180,
    steps: [
      { type: 'reach', points: CP.bridge, label: 'Sprint the checkpoints, houses to cranes' },
    ],
  },
  casino: {
    time: 240,
    heat: 3,
    steps: [
      { type: 'enter', vehicle: 'cart', label: 'Lift the cash cart from the Golden Anchor' },
      { type: 'deliver', vehicle: 'cart', x: -6, z: 144, label: 'Lose the tail — reach the safehouse' },
    ],
  },
  airport: {
    time: 240,
    heat: 1,
    steps: [
      { type: 'reach', points: CP.airport, label: 'Run the sealed case to the airstrip' },
    ],
  },
};

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

// A glowing diamond beacon + a light beam, parked at the current
// target so the player can see where to go from anywhere in the city.
function makeBeacon(THREE) {
  const group = new THREE.Group();
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xcc9900, emissiveIntensity: 1.4 }),
  );
  gem.position.y = 6;
  group.add(gem);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.6, 42, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23c, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = 21;
  group.add(beam);
  group.visible = false;
  return { group, gem };
}

export function makeQuests(city, THREE) {
  const beacon = makeBeacon(THREE);
  city.group.add(beacon.group);
  let active = null;

  // --- rival + fleeing-car helpers (race and vigilante) ---
  function spawnRival(ctx, start) {
    const { Vehicle } = ctx.vehicles;
    const rival = new Vehicle(THREE, city, 'sport', start.x, start.z, 0, 0x2e6fd2);
    city.group.add(rival.mesh);
    return rival;
  }

  function spawnFleeing(ctx, from) {
    const { Vehicle } = ctx.vehicles;
    const kinds = ['sedan', 'sport'];
    const cars = [];
    for (let i = 0; i < 2; i += 1) {
      const angle = (i / 2) * Math.PI * 2 + 0.6;
      const x = from.x + Math.sin(angle) * 24;
      const z = from.z + Math.cos(angle) * 24;
      const car = new Vehicle(THREE, city, kinds[i], x, z, angle, i === 0 ? 0xd23c2e : 0xe8b93a);
      car.speed = 12;
      car.stopped = false;
      city.group.add(car.mesh);
      cars.push(car);
    }
    return cars;
  }

  function removeCar(car) {
    if (!car) return;
    city.group.remove(car.mesh);
  }

  const quests = {
    list: QUESTS,
    active: null,
    timeLeft: 0,

    start(i, ctx) {
      if (active) return false;
      const def = QUESTS[i];
      if (!def || !STEPS[def.id]) return false;
      const spec = STEPS[def.id];
      const state = {
        def,
        spec,
        stepIdx: 0,
        timeLeft: spec.time,
        collected: new Set(),
        rival: null,
        rivalCp: 0,
        fleeing: null,
        farePhase: 'pickup',
        fareDone: 0,
        fareTarget: null,
        started: false,
      };
      if (spec.night && ctx.setClock) ctx.setClock(22);
      if (spec.heat) ctx.law.add(spec.heat);
      if (def.id === 'race') {
        state.rival = spawnRival(ctx, { x: 6, z: 40 });
      }
      if (def.id === 'vigilante') {
        state.fleeing = spawnFleeing(ctx, { x: ctx.hero.pos.x, z: ctx.hero.pos.z });
      }
      active = state;
      quests.active = state;
      quests.timeLeft = state.timeLeft;
      if (ctx.toast) ctx.toast(`${def.name} — ${def.blurb}`);
      return true;
    },

    // The current target point for the minimap (null when none).
    target() {
      if (!active) return null;
      const step = active.spec.steps[active.stepIdx];
      if (!step) return null;
      if (step.type === 'reach' || step.type === 'collect') {
        const pts = step.points;
        for (let k = 0; k < pts.length; k += 1) {
          if (!active.collected.has(`${active.stepIdx}:${k}`)) return pts[k];
        }
        return pts[pts.length - 1];
      }
      if (step.type === 'deliver') return { x: step.x, z: step.z };
      if (step.type === 'enter') {
        if (step.vehicle === 'truck') return { x: 46, z: -58 };
        if (step.vehicle === 'cart') return { x: 12, z: -200 };
        return null;
      }
      if (step.type === 'race') {
        const pts = step.points;
        return pts[Math.min(active.rivalCp, pts.length - 1)] || null;
      }
      if (step.type === 'ram') {
        if (active.fleeing) {
          const moving = active.fleeing.find((c) => !c.stopped);
          if (moving) return { x: moving.pos.x, z: moving.pos.z };
        }
        return null;
      }
      if (step.type === 'fare') {
        return active.fareTarget;
      }
      return null;
    },

    hint() {
      if (!active) return '';
      const step = active.spec.steps[active.stepIdx];
      if (!step) return '';
      if (step.type === 'fare') {
        const left = active.spec.steps[0].count - active.fareDone;
        return active.farePhase === 'pickup'
          ? `Night Cab — pick up fare ${active.fareDone + 1} of ${active.spec.steps[0].count}`
          : `Night Cab — drop fare ${active.fareDone + 1} off (${left} to go)`;
      }
      if (step.type === 'collect') {
        const done = [...active.collected].filter((k) => k.startsWith(`${active.stepIdx}:`)).length;
        return `${step.label} — ${done}/${step.points.length}`;
      }
      if (step.type === 'ram') {
        const stopped = (active.fleeing || []).filter((c) => c.stopped).length;
        return `${step.label} — ${stopped}/2 stopped`;
      }
      return step.label;
    },

    _advance(ctx) {
      active.stepIdx += 1;
      if (active.stepIdx >= active.spec.steps.length) {
        return quests._finish(ctx, 'complete', active);
      }
      return null;
    },

    _finish(ctx, result, state) {
      if (state.rival) removeCar(state.rival);
      if (state.fleeing) state.fleeing.forEach(removeCar);
      beacon.group.visible = false;
      const pay = result === 'complete' ? state.def.pay : 0;
      active = null;
      quests.active = null;
      quests.timeLeft = 0;
      return { result, job: state.def, pay };
    },

    _heroPos(ctx) {
      const hero = ctx.hero;
      const car = hero.car;
      return car ? { x: car.pos.x, z: car.pos.z } : { x: hero.pos.x, z: hero.pos.z };
    },

    update(dt, ctx) {
      if (!active) {
        beacon.group.visible = false;
        return null;
      }
      active.timeLeft -= dt;
      quests.timeLeft = Math.max(0, active.timeLeft);
      if (active.timeLeft <= 0) {
        return quests._finish(ctx, 'failed', active);
      }
      const step = active.spec.steps[active.stepIdx];
      const pos = quests._heroPos(ctx);
      const hero = ctx.hero;

      // Keep the beacon on the current target.
      const tgt = quests.target();
      if (tgt) {
        beacon.group.visible = true;
        beacon.group.position.set(tgt.x, 0, tgt.z);
        beacon.gem.rotation.y += dt * 2;
      } else {
        beacon.group.visible = false;
      }

      if (step.type === 'reach') {
        for (let k = 0; k < step.points.length; k += 1) {
          const key = `${active.stepIdx}:${k}`;
          if (active.collected.has(key)) continue;
          const p = step.points[k];
          if (dist(pos.x, pos.z, p.x, p.z) < 9) {
            active.collected.add(key);
            if (ctx.sound) ctx.sound.pickup();
          }
        }
        const allDone = step.points.every((_, k) => active.collected.has(`${active.stepIdx}:${k}`));
        if (allDone) {
          const r = quests._advance(ctx);
          if (r) return r;
        }
      } else if (step.type === 'collect') {
        for (let k = 0; k < step.points.length; k += 1) {
          const key = `${active.stepIdx}:${k}`;
          if (active.collected.has(key)) continue;
          const p = step.points[k];
          if (dist(pos.x, pos.z, p.x, p.z) < 8) {
            active.collected.add(key);
            if (ctx.sound) ctx.sound.pickup();
          }
        }
        const allDone = step.points.every((_, k) => active.collected.has(`${active.stepIdx}:${k}`));
        if (allDone) {
          const r = quests._advance(ctx);
          if (r) return r;
        }
      } else if (step.type === 'enter') {
        const want = step.vehicle;
        if (want === 'any' && hero.car) {
          const r = quests._advance(ctx);
          if (r) return r;
        } else if (want === 'truck' && hero.car === ctx.truck) {
          const r = quests._advance(ctx);
          if (r) return r;
        } else if (want === 'cart' && hero.car === ctx.cart) {
          const r = quests._advance(ctx);
          if (r) return r;
        }
      } else if (step.type === 'deliver') {
        const want = step.vehicle === 'truck' ? ctx.truck : ctx.cart;
        if (hero.car === want && dist(pos.x, pos.z, step.x, step.z) < 12) {
          const r = quests._advance(ctx);
          if (r) return r;
        }
      } else if (step.type === 'race') {
        // Rival autopilot: steer at the next checkpoint.
        const rival = active.rival;
        if (rival) {
          const pts = step.points;
          const cp = pts[Math.min(active.rivalCp, pts.length - 1)];
          const dx = cp.x - rival.pos.x;
          const dz = cp.z - rival.pos.z;
          const wantHeading = Math.atan2(dx, dz);
          let diff = wantHeading - rival.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          rival.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
          rival.drive(dt, { fwd: 1, back: 0, steer: 0, brake: 0 }, 30);
          if (dist(rival.pos.x, rival.pos.z, cp.x, cp.z) < 10) {
            active.rivalCp += 1;
          }
          if (active.rivalCp >= pts.length) {
            // The rival finished first.
            return quests._finish(ctx, 'failed', active);
          }
        }
        for (let k = 0; k < step.points.length; k += 1) {
          const key = `${active.stepIdx}:${k}`;
          if (active.collected.has(key)) continue;
          const p = step.points[k];
          if (dist(pos.x, pos.z, p.x, p.z) < 10) {
            active.collected.add(key);
            if (ctx.sound) ctx.sound.pickup();
          }
        }
        const allDone = step.points.every((_, k) => active.collected.has(`${active.stepIdx}:${k}`));
        if (allDone) {
          const r = quests._advance(ctx);
          if (r) return r;
        }
      } else if (step.type === 'ram') {
        const cars = active.fleeing || [];
        const playerCar = hero.car;
        for (const car of cars) {
          if (car.stopped) continue;
          // Flee: drive away from the player.
          const dx = car.pos.x - pos.x;
          const dz = car.pos.z - pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const wantHeading = Math.atan2(dx, dz);
          let diff = wantHeading - car.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
          car.drive(dt, { fwd: 1, back: 0, steer: 0, brake: 0 }, 26);
          // Rammed: the player's car hits it at speed.
          if (playerCar && dist(car.pos.x, car.pos.z, pos.x, pos.z) < 3.4 && Math.abs(playerCar.speed) > 8) {
            car.stopped = true;
            car.speed = 0;
            if (ctx.sound) ctx.sound.crash();
            if (ctx.blast) ctx.blast(car.pos.x, car.pos.z, 1.2);
          }
        }
        const allStopped = cars.length > 0 && cars.every((c) => c.stopped);
        if (allStopped) {
          const r = quests._advance(ctx);
          if (r) return r;
        }
      } else if (step.type === 'fare') {
        if (!active.fareTarget) {
          // A new fare: a pickup point near the player.
          const px = pos.x + (Math.sin(active.fareDone * 2.1) * 120);
          const pz = pos.z + (Math.cos(active.fareDone * 1.7) * 120);
          active.fareTarget = {
            x: Math.max(-200, Math.min(200, px)),
            z: Math.max(-200, Math.min(200, pz)),
          };
          active.farePhase = 'pickup';
        }
        const t = active.fareTarget;
        if (dist(pos.x, pos.z, t.x, t.z) < 9) {
          if (active.farePhase === 'pickup') {
            active.farePhase = 'dropoff';
            active.fareTarget = {
              x: Math.max(-200, Math.min(200, -t.x + 60)),
              z: Math.max(-200, Math.min(200, -t.z + 60)),
            };
            if (ctx.toast) ctx.toast('Passenger in — drive them across town.');
          } else {
            active.fareDone += 1;
            active.fareTarget = null;
            if (ctx.sound) ctx.sound.pickup();
            if (active.fareDone >= step.count) {
              const r = quests._advance(ctx);
              if (r) return r;
            }
          }
        }
      }
      return null;
    },
  };

  return quests;
}
