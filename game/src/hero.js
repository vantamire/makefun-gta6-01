// hero.js — Rex Dalton, the player.
// On foot he walks, runs, jumps, punches and shoots; in a car he
// drives it. He has health and armor, three weapons, and a habit of
// stealing whatever is parked nearby.

import * as THREE from 'three';
import { clampNum, wrapAngle, dist } from './seed.js';
import { TUNE } from './tune.js';

function makeHeroMesh() {
  const g = new THREE.Group();
  // red leather jacket, dark jeans, the look of a getaway driver
  const jacket = new THREE.MeshStandardMaterial({ color: 0x8a1f2a, roughness: 0.55 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2a3242, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.36), jacket);
  body.position.y = 1.18;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12), skin);
  head.position.y = 1.84;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 }),
  );
  hair.position.y = 1.88;
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.28), jeans);
  legL.position.set(0.17, 0.4, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = -0.17;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), jacket);
  armL.position.set(0.44, 1.18, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = -0.44;
  g.add(armR);
  // the pistol in his right hand when drawn
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.8 }));
  gun.add(barrel);
  gun.position.set(-0.44, 0.85, 0.3);
  gun.visible = false;
  g.add(gun);
  g.userData = { legL, legR, armL, armR, gun, body };
  return g;
}

export function makeHero(G, colliders) {
  const scene = G.scene;
  const mesh = makeHeroMesh();
  scene.add(mesh);

  const hero = {
    mesh,
    x: 0, z: 10,
    y: 0, vy: 0,
    heading: Math.PI,
    health: 100,
    armor: 0,
    money: TUNE.startMoney,
    car: null, // the car he is driving, or null on foot
    weapon: 'pistol',
    weaponDrawn: false,
    ammo: { pistol: 48, scatter: 12, smg: 90 },
    mag: { pistol: 12, scatter: 6, smg: 30 },
    fireTimer: 0,
    reloadTimer: 0,
    punchTimer: 0,
    walkPhase: 0,
    dead: false,
    deadTimer: 0,
    speed2d: 0,
  };

  function damage(amount) {
    if (hero.dead) return;
    let rest = amount;
    if (hero.armor > 0) {
      const absorbed = Math.min(hero.armor, rest * 0.6);
      hero.armor -= absorbed;
      rest -= absorbed;
    }
    hero.health -= rest;
    if (hero.health <= 0) {
      hero.health = 0;
      hero.dead = true;
      hero.deadTimer = 2.2;
    }
  }

  function heal(amount) {
    hero.health = clampNum(hero.health + amount, 0, 100);
  }

  function addArmor(amount) {
    hero.armor = clampNum(hero.armor + amount, 0, 100);
  }

  // Move on foot. `move` is {x, z} in camera space, -1..1.
  function walkTick(dt, move, running, jumping) {
    if (hero.dead) return;
    const speed = running ? TUNE.runSpeed : TUNE.walkSpeed;
    const mx = move.x;
    const mz = move.z;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      const nx = mx / Math.max(1, len);
      const nz = mz / Math.max(1, len);
      hero.heading = Math.atan2(nx, nz);
      const ox = hero.x + nx * speed * dt;
      const oz = hero.z + nz * speed * dt;
      // building collision
      let px = ox;
      let pz = oz;
      for (const c of colliders) {
        const cx = clampNum(px, c.x - c.hw, c.x + c.hw);
        const cz = clampNum(pz, c.z - c.hd, c.z + c.hd);
        const dx = px - cx;
        const dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.81) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            px = cx + (dx / d) * 0.9;
            pz = cz + (dz / d) * 0.9;
          } else {
            px = hero.x;
            pz = hero.z;
          }
        }
      }
      hero.x = clampNum(px, -260, 260);
      hero.z = clampNum(pz, -260, 260);
      hero.speed2d = speed;
      hero.walkPhase += dt * speed * 1.6;
    } else {
      hero.speed2d = 0;
    }
    // jump + gravity
    if (jumping && hero.y <= 0.01) hero.vy = TUNE.jumpSpeed;
    hero.vy -= 22 * dt;
    hero.y += hero.vy * dt;
    if (hero.y <= 0) { hero.y = 0; hero.vy = 0; }
    mesh.position.set(hero.x, hero.y, hero.z);
    mesh.rotation.y = hero.heading;
    const swing = hero.speed2d > 0 ? Math.sin(hero.walkPhase) * 0.5 : 0;
    mesh.userData.legL.rotation.x = swing;
    mesh.userData.legR.rotation.x = -swing;
    mesh.userData.armL.rotation.x = hero.weaponDrawn ? -1.2 : -swing * 0.7;
    mesh.userData.armR.rotation.x = hero.weaponDrawn ? -1.2 : swing * 0.7;
  }

  // Hitscan shot. Returns the hit point or null. Targets: peds, cops, cars.
  function shoot(targets, spread) {
    const spec = TUNE.weapons[hero.weapon];
    if (hero.mag[hero.weapon] <= 0) return null;
    hero.mag[hero.weapon] -= 1;
    hero.fireTimer = spec.rate;
    const dirX = Math.sin(hero.heading) + (Math.random() - 0.5) * spread * 2;
    const dirZ = Math.cos(hero.heading) + (Math.random() - 0.5) * spread * 2;
    const dl = Math.hypot(dirX, dirZ);
    const dx = dirX / dl;
    const dz = dirZ / dl;
    let best = null;
    let bd = spec.range;
    for (const t of targets) {
      if (t.dead || t.wrecked) continue;
      const rx = t.x - hero.x;
      const rz = t.z - hero.z;
      const along = rx * dx + rz * dz;
      if (along < 1 || along > bd) continue;
      const perp = Math.abs(rx * dz - rz * dx);
      if (perp < 1.6) { bd = along; best = t; }
    }
    const endX = hero.x + dx * bd;
    const endZ = hero.z + dz * bd;
    return { hit: best, endX, endZ, along: bd, damage: spec.damage };
  }

  function punch(targets) {
    hero.punchTimer = 0.35;
    let best = null;
    let bd = TUNE.punchRange;
    for (const t of targets) {
      if (t.dead) continue;
      const d = dist(hero.x, hero.z, t.x, t.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  function enterCar(car) {
    hero.car = car;
    car.parked = false;
    car.driver = true;
    mesh.visible = false;
  }

  function exitCar() {
    const car = hero.car;
    if (!car) return;
    hero.car = null;
    car.driver = false;
    hero.x = car.x - Math.sin(car.heading) * 2.4;
    hero.z = car.z - Math.cos(car.heading) * 2.4;
    hero.heading = car.heading;
    mesh.visible = true;
    mesh.position.set(hero.x, 0, hero.z);
    mesh.rotation.y = hero.heading;
  }

  function tick(dt) {
    hero.fireTimer = Math.max(0, hero.fireTimer - dt);
    hero.reloadTimer = Math.max(0, hero.reloadTimer - dt);
    hero.punchTimer = Math.max(0, hero.punchTimer - dt);
    if (hero.dead) hero.deadTimer -= dt;
    mesh.userData.gun.visible = hero.weaponDrawn && !hero.car;
  }

  return {
    hero, damage, heal, addArmor, walkTick, shoot, punch,
    enterCar, exitCar, tick,
  };
}
