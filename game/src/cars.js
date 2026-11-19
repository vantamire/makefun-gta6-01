// cars.js — every vehicle in Vice Harbor.
// Builds the meshes for each kind (sedan, taxi, sport, van, pickup,
// bus, limo, bike, cruiser, armored truck), runs the arcade driving
// physics, the traffic that cruises the grid, the parked cars you can
// steal, and the explosions and skid marks when it all goes wrong.

import * as THREE from 'three';
import { range, rangeInt, pick, chance, clampNum, wrapAngle, angleLerp, dist } from './seed.js';
import { TUNE } from './tune.js';

const BODY_COLORS = {
  sedan: [0x3a6ab0, 0x8a8a92, 0x2a2a30, 0x7a3a3a, 0x4a7a5a],
  taxi: [0xffc21c],
  sport: [0xd21f2b, 0xff6a00, 0x1f8aff, 0xf0e8d8],
  van: [0x6a6a72, 0x8a5a2a, 0x3a5a7a],
  pickup: [0x7a2a2a, 0x2a4a6a, 0x5a5a5a],
  bus: [0x2a6a8a, 0x8a6a2a],
  limo: [0x14141a],
  bike: [0xc21f2b, 0x1f1f24, 0x2a6ab0],
  cruiser: [0xf0f0f0],
  armored: [0x3a4a3a],
};

const SIZES = {
  sedan: { l: 4.4, w: 1.9, h: 1.35 },
  taxi: { l: 4.4, w: 1.9, h: 1.35 },
  sport: { l: 4.6, w: 2.0, h: 1.1 },
  van: { l: 5.0, w: 2.1, h: 2.1 },
  pickup: { l: 5.0, w: 2.0, h: 1.7 },
  bus: { l: 9.5, w: 2.5, h: 2.9 },
  limo: { l: 7.2, w: 2.0, h: 1.4 },
  bike: { l: 2.2, w: 0.8, h: 1.2 },
  cruiser: { l: 4.6, w: 2.0, h: 1.4 },
  armored: { l: 6.0, w: 2.4, h: 2.6 },
};

function box(w, h, d, color, rough = 0.55, metal = 0.35) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }),
  );
  return m;
}

function wheelMesh() {
  const w = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10),
    new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.9 }),
  );
  w.rotation.z = Math.PI / 2;
  return w;
}

// Build a car mesh. `kind` picks the shape, `color` the paint.
// The mesh faces +Z when heading = 0 (forward is +Z in local space).
export function makeCarMesh(kind, color) {
  const g = new THREE.Group();
  const s = SIZES[kind];
  const paint = color ?? pick(Math, BODY_COLORS[kind]);
  const L = s.l, W = s.w, H = s.h;

  if (kind === 'bike') {
    const body = box(0.5, 0.5, L, paint);
    body.position.y = 0.55;
    g.add(body);
    const tank = box(0.45, 0.35, 0.9, 0x1a1a1a);
    tank.position.set(0, 0.85, 0.2);
    g.add(tank);
    const seat = box(0.4, 0.15, 0.7, 0x1a1a1a);
    seat.position.set(0, 0.85, -0.5);
    g.add(seat);
    const f = wheelMesh(); f.position.set(0, 0.36, L / 2 - 0.3); g.add(f);
    const r = wheelMesh(); r.position.set(0, 0.36, -L / 2 + 0.3); g.add(r);
    const rider = new THREE.Group();
    const torso = box(0.5, 0.6, 0.3, 0x2a2a30);
    torso.position.y = 1.25; rider.add(torso);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xd21f2b, roughness: 0.3 }));
    helm.position.y = 1.75; rider.add(helm);
    g.add(rider);
    g.userData.rider = rider;
    return g;
  }

  // body: lower slab + cabin
  const lower = box(W, H * 0.55, L, paint);
  lower.position.y = H * 0.28 + 0.35;
  g.add(lower);
  const hood = box(W * 0.92, H * 0.22, L * 0.28, paint);
  hood.position.set(0, H * 0.62, L * 0.32);
  g.add(hood);
  const cabin = box(W * 0.86, H * 0.5, L * 0.42, 0x1a2233);
  cabin.position.set(0, H * 0.72, -L * 0.05);
  cabin.material = new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.15, metalness: 0.6 });
  g.add(cabin);
  // chrome bumpers + grille
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.25, metalness: 0.9 });
  const fb = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.16, 0.18), chrome);
  fb.position.set(0, 0.42, L / 2);
  g.add(fb);
  const rb = fb.clone();
  rb.position.z = -L / 2;
  g.add(rb);
  // headlights + full-width tail strip
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), headMat);
  hl.position.set(W * 0.32, 0.72, L / 2 + 0.01);
  g.add(hl);
  const hr = hl.clone(); hr.position.x = -W * 0.32; g.add(hr);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.14, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xff2a3c }));
  tail.position.set(0, 0.72, -L / 2 - 0.01);
  g.add(tail);

  if (kind === 'sport') {
    const spoiler = box(W * 0.9, 0.08, 0.3, 0x14141a);
    spoiler.position.set(0, H * 0.95, -L / 2 + 0.25);
    g.add(spoiler);
    const strutL = box(0.08, 0.3, 0.08, 0x14141a);
    strutL.position.set(W * 0.35, H * 0.78, -L / 2 + 0.25);
    g.add(strutL);
    const strutR = strutL.clone(); strutR.position.x = -W * 0.35; g.add(strutR);
    const vent = box(W * 0.5, 0.06, 0.5, 0x14141a);
    vent.position.set(0, H * 0.68, L * 0.15);
    g.add(vent);
  }
  if (kind === 'taxi') {
    const sign = box(0.7, 0.22, 0.4, 0xffe14d);
    sign.position.set(0, H * 1.05, -L * 0.05);
    g.add(sign);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W * 1.01, 0.3, L * 0.98),
      new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    stripe.position.y = H * 0.4;
    g.add(stripe);
  }
  if (kind === 'cruiser') {
    const doors = new THREE.Mesh(new THREE.BoxGeometry(W * 1.01, 0.5, L * 0.4),
      new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.5 }));
    doors.position.y = H * 0.45;
    g.add(doors);
    const bar = box(1.1, 0.18, 0.3, 0x1a1a1a);
    bar.position.set(0, H * 1.02, -L * 0.05);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xff2a3c }));
    red.position.set(-0.3, 1.14 * H, -L * 0.05);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x2a6aff }));
    blue.position.set(0.3, 1.14 * H, -L * 0.05);
    g.add(blue);
    g.userData.lightbar = { red, blue };
  }
  if (kind === 'bus') {
    for (let i = 0; i < 4; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.15, metalness: 0.6 }));
      win.position.set(W / 2 + 0.01, 1.9, -3 + i * 2);
      g.add(win);
      const win2 = win.clone(); win2.position.x = -W / 2 - 0.01; g.add(win2);
    }
  }
  if (kind === 'armored') {
    const vault = box(W * 0.94, H * 0.9, L * 0.6, 0x2a3a2a);
    vault.position.set(0, H * 0.7, -L * 0.15);
    g.add(vault);
  }
  if (kind === 'pickup') {
    const bed = box(W * 0.9, 0.5, L * 0.4, 0x1a1a1a);
    bed.position.set(0, H * 0.55, -L * 0.28);
    g.add(bed);
  }

  // wheels
  const wy = 0.36;
  const wx = W / 2 - 0.1;
  const wz = L / 2 - 0.85;
  const wheels = [];
  for (const [sx, sz] of [[wx, wz], [-wx, wz], [wx, -wz], [-wx, -wz]]) {
    const w = wheelMesh();
    w.position.set(sx, wy, sz);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.userData.size = s;
  return g;
}

// Circle (x,z,r) against building AABBs. Pushes the circle out and
// returns the corrected position plus whether a hit happened.
export function collideBuildings(x, z, r, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = clampNum(x, c.x - c.hw, c.x + c.hw);
    const nz = clampNum(z, c.z - c.hd, c.z + c.hd);
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smaller axis
        const px = c.hw + r - Math.abs(x - c.x);
        const pz = c.hd + r - Math.abs(z - c.z);
        if (px < pz) x = c.x + (x > c.x ? 1 : -1) * (c.hw + r);
        else z = c.z + (z > c.z ? 1 : -1) * (c.hd + r);
      }
    }
  }
  return { x, z, hit };
}

// Arcade driving: throttle/brake/steer in [-1,1]. Mutates car.
export function drivePhysics(car, input, dt, colliders, roads) {
  const spec = TUNE.carKinds[car.kind];
  const onRoad = roads.onRoad(car.x, car.z);
  const grip = spec.grip * (onRoad ? 1 : 0.55);
  const top = spec.top * (onRoad ? 1 : 0.6);
  if (input.throttle > 0) car.speed += spec.accel * input.throttle * dt;
  if (input.throttle < 0) car.speed += spec.accel * 0.7 * input.throttle * dt;
  if (input.brake) {
    const s = Math.sign(car.speed);
    car.speed -= s * spec.brake * dt;
    if (Math.sign(car.speed) !== s) car.speed = 0;
  }
  // drag + rolling resistance
  car.speed -= car.speed * 0.35 * dt;
  if (Math.abs(car.speed) < 0.05 && input.throttle === 0) car.speed = 0;
  car.speed = clampNum(car.speed, -top * 0.45, top);
  // steering: less bite at speed, none at standstill
  const steerAuthority = clampNum(Math.abs(car.speed) / 8, 0, 1);
  car.heading += input.steer * grip * steerAuthority * dt * (car.speed >= 0 ? 1 : -1) * 0.55;
  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = collideBuildings(nx, nz, 1.5, colliders);
  if (fixed.hit) {
    // scrape: lose speed, take a little damage
    car.speed *= 0.55;
    car.health -= Math.abs(car.speed) * 0.35;
    car.scraped = true;
  } else {
    car.scraped = false;
  }
  car.x = clampNum(fixed.x, -roads.edge, roads.edge);
  car.z = clampNum(fixed.z, -roads.edge, roads.edge);
  car.x = Math.min(car.x, TUNE.waterX - 3);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // wheel spin + steering visual
  const spin = (car.speed * dt) / 0.36;
  for (const w of car.mesh.userData.wheels || []) w.rotation.x += spin;
  const front = (car.mesh.userData.wheels || []).slice(0, 2);
  for (const w of front) w.rotation.y = input.steer * 0.4;
}

export function makeFleet(G, roads, colliders) {
  const rng = G.rng;
  const scene = G.scene;
  const cars = [];
  const trafficKinds = ['sedan', 'sedan', 'taxi', 'van', 'pickup', 'bus', 'limo', 'sedan', 'sport'];

  function addCar(kind, x, z, heading, opts = {}) {
    const color = opts.color ?? pick(rng, BODY_COLORS[kind]);
    const mesh = makeCarMesh(kind, color);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    const car = {
      kind, mesh, color, x, z, heading,
      speed: 0, health: 100,
      parked: !!opts.parked,
      driver: opts.driver !== false,
      route: opts.route || null,
      routeIdx: 0,
      cruise: range(rng, 11, 17),
      wrecked: false,
      scraped: false,
      id: cars.length,
    };
    cars.push(car);
    return car;
  }

  // traffic on the roads
  for (let i = 0; i < TUNE.trafficCount; i++) {
    const p = roads.randomRoadPoint(rng);
    const kind = pick(rng, trafficKinds);
    const heading = chance(rng, 0.5) ? 0 : Math.PI / 2;
    const car = addCar(kind, p.x, p.z, heading, { route: roads.makeRoute(rng, p.x, p.z) });
    car.routeIdx = 1;
  }
  // parked cars along the kerb
  for (let i = 0; i < TUNE.parkedCount; i++) {
    const p = roads.randomRoadPoint(rng);
    const kind = pick(rng, ['sedan', 'sport', 'pickup', 'taxi', 'van']);
    const heading = chance(rng, 0.5) ? 0 : Math.PI / 2;
    addCar(kind, p.x, p.z, heading, { parked: true, driver: false });
  }
  // the hero car: a red sport coupe near the start
  const heroCar = addCar('sport', 6, 14, Math.PI, { parked: true, driver: false, color: 0xd21f2b });

  function nearestCar(x, z, maxD, wantParked) {
    let best = null;
    let bd = maxD;
    for (const c of cars) {
      if (c.wrecked) continue;
      if (wantParked !== undefined && c.parked !== wantParked) continue;
      const d = dist(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function trafficTick(dt) {
    for (const c of cars) {
      if (c.wrecked || c.parked || !c.route) continue;
      const target = c.route[c.routeIdx];
      if (!target) continue;
      const dx = target.x - c.x;
      const dz = target.z - c.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 3) {
        c.routeIdx = (c.routeIdx + 1) % c.route.length;
        continue;
      }
      const want = Math.atan2(dx, dz);
      c.heading = angleLerp(c.heading, want, dt * 2.2);
      // slow for the car ahead
      let slow = false;
      for (const o of cars) {
        if (o === c || o.wrecked) continue;
        const od = dist(c.x, c.z, o.x, o.z);
        if (od < 7) {
          const ahead = Math.sin(c.heading) * (o.x - c.x) + Math.cos(c.heading) * (o.z - c.z);
          if (ahead > 0) { slow = true; break; }
        }
      }
      const targetSpeed = slow ? 0 : c.cruise;
      c.speed += (targetSpeed - c.speed) * dt * 0.8;
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      const spin = (c.speed * dt) / 0.36;
      for (const w of c.mesh.userData.wheels || []) w.rotation.x += spin;
    }
  }

  return { cars, heroCar, addCar, nearestCar, trafficTick };
}

// ---------- effects: explosions, smoke, skid marks ----------
export function makeEffects(G) {
  const scene = G.scene;
  const live = [];

  function spawnExplosion(x, y, z, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, y + 1, z);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.6 * scale, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb13c, transparent: true, opacity: 0.95 }),
    );
    group.add(core);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(2.6 * scale, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.7 }),
    );
    group.add(shell);
    const light = new THREE.PointLight(0xff8a2a, 60, 40, 1.6);
    group.add(light);
    scene.add(group);
    live.push({ group, core, shell, light, t: 0, life: 0.9, kind: 'blast', scale });
    // flying debris
    for (let i = 0; i < 10; i++) {
      const bit = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.3, 0.3),
        new THREE.MeshBasicMaterial({ color: pick(G.rng, [0x2a2a2a, 0xff6a00, 0x8a8a8a]) }),
      );
      bit.position.set(x, y + 1, z);
      bit.userData.v = {
        x: (G.rng() - 0.5) * 14, y: G.rng() * 12 + 4, z: (G.rng() - 0.5) * 14,
      };
      scene.add(bit);
      live.push({ group: bit, t: 0, life: 1.1, kind: 'debris' });
    }
    return group;
  }

  function spawnSmoke(x, y, z) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x2a2a2e, transparent: true, opacity: 0.55 }),
    );
    puff.position.set(x, y, z);
    scene.add(puff);
    live.push({ group: puff, t: 0, life: 2.2, kind: 'smoke' });
  }

  const skidMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.5 });
  function spawnSkid(x, z, heading) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.2), skidMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -heading;
    m.position.set(x, 0.05, z);
    scene.add(m);
    live.push({ group: m, t: 0, life: 14, kind: 'skid' });
  }

  function tick(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      e.t += dt;
      if (e.t >= e.life) {
        scene.remove(e.group);
        live.splice(i, 1);
        continue;
      }
      const k = e.t / e.life;
      if (e.kind === 'blast') {
        e.core.scale.setScalar(1 + k * 1.6);
        e.core.material.opacity = 0.95 * (1 - k);
        e.shell.scale.setScalar(1 + k * 2.6);
        e.shell.material.opacity = 0.7 * (1 - k);
        e.light.intensity = 60 * (1 - k);
      } else if (e.kind === 'debris') {
        e.group.position.x += e.group.userData.v.x * dt;
        e.group.position.y += e.group.userData.v.y * dt;
        e.group.position.z += e.group.userData.v.z * dt;
        e.group.userData.v.y -= 22 * dt;
        if (e.group.position.y < 0.2) e.group.position.y = 0.2;
        e.group.rotation.x += dt * 5;
      } else if (e.kind === 'smoke') {
        e.group.position.y += dt * 1.6;
        e.group.scale.setScalar(1 + k * 2.2);
        e.group.material.opacity = 0.55 * (1 - k);
      } else if (e.kind === 'skid') {
        e.group.material.opacity = 0.5 * (1 - k * 0.6);
      }
    }
  }

  return { spawnExplosion, spawnSmoke, spawnSkid, tick };
}
