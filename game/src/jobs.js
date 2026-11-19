// jobs.js — the story and the missions of VICE HARBOR.
// Rex Dalton comes home to the harbor after three years away. Mama Lou,
// who runs the bar on Southside, has work for him: ten jobs that climb
// from a cab fare to the Golden Anchor casino. Each job is a chain of
// steps — go here, pick that up, lose the cops, bring it home — and
// each pays cash when the last step lands.

import { dist, clampNum } from './seed.js';
import { TUNE, JOB_BOARD } from './tune.js';

const P = TUNE.pitch;

function at(x, z) {
  return { x, z };
}

// The job scripts. Landmarks come from the town builder; districts
// are the grid: downtown centre, yards north, south houses, boardwalk east.
const SCRIPTS = {
  homecoming: {
    brief: 'Mama Lou is waiting at her bar on Southside. Drive over and say hello.',
    steps: [
      { type: 'goto', ...at(-P * 1.5, P * 2.5), radius: 6, label: "Reach Mama Lou's Bar" },
    ],
  },
  cabfare: {
    brief: 'A fare is waiting downtown. Pick them up, then drop them at the boardwalk. Fast.',
    time: 100,
    steps: [
      { type: 'goto', ...at(P * 0.5, -P * 1.5), radius: 6, label: 'Pick up the fare downtown' },
      { type: 'goto', ...at(P * 3.5, P * 0.5), radius: 6, label: 'Drop the fare at the boardwalk' },
    ],
  },
  packagerun: {
    brief: 'A sealed package in the north yards. Take it to the airstrip. No questions.',
    steps: [
      { type: 'goto', ...at(-P * 2.5, -P * 3.5), radius: 6, label: 'Collect the package in the north yards' },
      { type: 'goto', ...at(-P * 3.5, -P * 3.5), radius: 8, label: 'Deliver it to the airstrip' },
    ],
  },
  getaway: {
    brief: 'The crew hit Coral Bank. Pick up the driver and lose the cops at the safehouse.',
    steps: [
      { type: 'goto', ...at(0, -P * 0.5), radius: 7, label: 'Pick up the crew at Coral Bank', onArrive: 'heat2' },
      { type: 'goto', ...at(-P * 2.5, P * 3.5), radius: 8, label: 'Reach the safehouse', needStars: 0 },
    ],
  },
  pizzarush: {
    brief: 'Three pizzas, three doors, two minutes. The ovens are already hot.',
    time: 130,
    steps: [
      { type: 'goto', ...at(P * 1.5, P * 2.5), radius: 6, label: 'Pizza 1 — Southside flats' },
      { type: 'goto', ...at(-P * 0.5, -P * 2.5), radius: 6, label: 'Pizza 2 — Downtown tower' },
      { type: 'goto', ...at(P * 2.5, -P * 0.5), radius: 6, label: 'Pizza 3 — Boardwalk arcade' },
    ],
  },
  streetrace: {
    brief: 'A rival in a yellow sport car wants to race the boardwalk loop. Beat him to the line.',
    steps: [
      { type: 'race', points: [at(P * 3.5, -P * 2.5), at(P * 0.5, -P * 3.5), at(-P * 2.5, -P * 1.5), at(-P * 2.5, P * 2.5), at(P * 1.5, P * 3.5), at(P * 3.5, P * 0.5)], label: 'Race the rival through the checkpoints' },
    ],
  },
  harborheist: {
    brief: 'An armored truck leaves Coral Bank at dusk. Take it, and park it on the pier.',
    steps: [
      { type: 'goto', ...at(0, -P * 0.5), radius: 7, label: 'Find the armored truck at Coral Bank', onArrive: 'heat2' },
      { type: 'goto', ...at(TUNE.waterX + 28, P * 0.5), radius: 8, label: 'Deliver the truck to the pier' },
    ],
  },
  vigilante: {
    brief: 'Two joyriders are tearing up downtown. Ram them to a stop. The PD looks away.',
    steps: [
      { type: 'ram', count: 2, label: 'Stop the joyriders (ram them until they smoke)' },
    ],
  },
  nightcab: {
    brief: 'Night shift. A fare downtown needs the airport run. Keep it smooth after dark.',
    night: true,
    time: 120,
    steps: [
      { type: 'goto', ...at(P * 0.5, P * 0.5), radius: 6, label: 'Pick up the night fare downtown' },
      { type: 'goto', ...at(-P * 3.5, -P * 3.5), radius: 8, label: 'Drop them at the airstrip' },
    ],
  },
  casinocaper: {
    brief: 'Lift the cash cart from the Golden Anchor and reach the safehouse at 3 stars. The big one.',
    steps: [
      { type: 'goto', ...at(P * 2.5, P * 1.5), radius: 7, label: 'Grab the cash cart at the Golden Anchor', onArrive: 'heat3' },
      { type: 'goto', ...at(-P * 2.5, P * 3.5), radius: 8, label: 'Reach the safehouse with the cash' },
    ],
  },
};

export function makeJobs(G, ctx) {
  // ctx: { hero, fleet, law, fx, notify(text), setClock(minutes), roads }
  const done = new Set(G.save?.jobsDone || []);
  let active = null; // { id, script, step, timer, rival, targets }
  let available = JOB_BOARD.filter((j) => !done.has(j.id));

  function start(id) {
    const script = SCRIPTS[id];
    const board = JOB_BOARD.find((j) => j.id === id);
    if (!script || !board) return false;
    if (script.night) ctx.setClock(22 * 60 + 15);
    active = {
      id, script, step: 0,
      timer: script.time || 0,
      label: script.steps[0].label,
      rival: null, targets: [],
      raceIdx: 0,
    };
    if (id === 'streetrace') spawnRival();
    if (id === 'vigilante') spawnJoyriders();
    ctx.notify(`${board.title} — ${board.brief}`);
    return true;
  }

  function spawnRival() {
    const car = ctx.fleet.addCar('sport', P * 3.5, P * 0.5 + 6, Math.PI, { color: 0xffe14d });
    car.rival = true;
    active.rival = car;
    active.rivalIdx = 0;
  }

  function spawnJoyriders() {
    for (let i = 0; i < 2; i++) {
      const car = ctx.fleet.addCar(i === 0 ? 'sport' : 'sedan', P * 0.5 + i * 10, -P * 1.5, 0, { color: i === 0 ? 0x2effc4 : 0xff6a00 });
      car.joyrider = true;
      car.fleeing = true;
      active.targets.push(car);
    }
  }

  function abort() {
    if (!active) return;
    if (active.rival) {
      active.rival.wrecked = true;
      G.scene.remove(active.rival.mesh);
      const idx = ctx.fleet.cars.indexOf(active.rival);
      if (idx >= 0) ctx.fleet.cars.splice(idx, 1);
    }
    active = null;
  }

  function complete() {
    const board = JOB_BOARD.find((j) => j.id === active.id);
    const pay = board.pay;
    ctx.hero.money += pay;
    done.add(active.id);
    ctx.notify(`JOB DONE — ${board.title}  +$${pay}`);
    ctx.fx.spawnSmoke(ctx.hero.x, 2, ctx.hero.z);
    active = null;
    available = JOB_BOARD.filter((j) => !done.has(j.id));
    G.save.jobsDone = [...done];
    G.saveGame();
  }

  function fail(reason) {
    ctx.notify(`JOB FAILED — ${reason}`);
    abort();
  }

  function currentTarget() {
    if (!active) return null;
    const step = active.script.steps[active.step];
    if (!step) return null;
    if (step.type === 'race') return step.points[active.raceIdx] || null;
    if (step.type === 'ram') return active.targets[0] || null;
    return { x: step.x, z: step.z };
  }

  function update(dt) {
    if (!active) return;
    const hero = ctx.hero;
    const step = active.script.steps[active.step];
    if (active.timer > 0) {
      active.timer -= dt;
      if (active.timer <= 0) { fail('Out of time'); return; }
    }
    if (!step) { complete(); return; }

    if (step.type === 'goto') {
      const d = dist(hero.x, hero.z, step.x, step.z);
      active.label = step.label;
      if (d < step.radius) {
        if (step.onArrive === 'heat2') ctx.law.setWanted(2);
        if (step.onArrive === 'heat3') ctx.law.setWanted(3);
        active.step += 1;
        if (active.step >= active.script.steps.length) { complete(); return; }
        ctx.notify(active.script.steps[active.step].label);
      }
    } else if (step.type === 'race') {
      const pts = step.points;
      const target = pts[active.raceIdx];
      if (!target) { complete(); return; }
      active.label = `Checkpoint ${active.raceIdx + 1}/${pts.length} — ${step.label}`;
      const d = dist(hero.x, hero.z, target.x, target.z);
      if (d < 9) {
        active.raceIdx += 1;
        if (active.raceIdx >= pts.length) {
          // did the rival finish first?
          if (active.rival && active.rivalIdx >= pts.length) { fail('The rival beat you to the line'); return; }
          complete();
          return;
        }
        ctx.notify(`Checkpoint ${active.raceIdx}/${pts.length}`);
      }
      // rival drives the checkpoints
      if (active.rival && !active.rival.wrecked) {
        const r = active.rival;
        const rp = pts[Math.min(active.rivalIdx, pts.length - 1)];
        const dx = rp.x - r.x;
        const dz = rp.z - r.z;
        const rd = Math.sqrt(dx * dx + dz * dz);
        if (rd < 9) {
          active.rivalIdx += 1;
        } else {
          const want = Math.atan2(dx, dz);
          r.heading += ((((want - r.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * dt * 2.4);
          r.speed += (30 - r.speed) * dt * 0.6;
          r.x += Math.sin(r.heading) * r.speed * dt;
          r.z += Math.cos(r.heading) * r.speed * dt;
          r.mesh.position.set(r.x, 0, r.z);
          r.mesh.rotation.y = r.heading;
        }
      }
    } else if (step.type === 'ram') {
      const alive = active.targets.filter((c) => !c.wrecked && c.health > 0);
      active.label = `${step.label} — ${alive.length} left`;
      // joyriders flee from the player
      for (const c of alive) {
        const dx = c.x - hero.x;
        const dz = c.z - hero.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const want = Math.atan2(dx, dz);
        c.heading += ((((want - c.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * dt * 2.0);
        c.speed += (26 - c.speed) * dt * 0.5;
        c.x += Math.sin(c.heading) * c.speed * dt;
        c.z += Math.cos(c.heading) * c.speed * dt;
        c.mesh.position.set(c.x, 0, c.z);
        c.mesh.rotation.y = c.heading;
        // ramming damage when the player hits them
        if (d < 4.2 && hero.car) {
          c.health -= 30 * dt * (Math.abs(hero.car.speed) / 20 + 0.5);
          if (c.health <= 0 && !c.wrecked) {
            c.wrecked = true;
            ctx.fx.spawnExplosion(c.x, 0.5, c.z, 0.8);
            ctx.law.addWanted(0);
            ctx.notify('Joyrider stopped!');
          }
        }
      }
      if (alive.length === 0) { complete(); return; }
    }

    // escaping with heat: the safehouse step clears wanted on arrival
    if (active.script.steps[active.step]?.needStars === 0 && ctx.law.wanted > 0) {
      // keep the heat until arrival; nothing to do here
    }
  }

  return {
    get active() { return active; },
    get done() { return done; },
    get available() { return available; },
    start, abort, update, currentTarget,
    board: JOB_BOARD,
  };
}
