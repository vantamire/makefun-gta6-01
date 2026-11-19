// law.js — the Harbor PD.
// A wanted level from 0 to 5 stars. Cruisers hunt the player, foot
// cops run him down on the street, roadblocks cut the avenues at
// 3 stars, and a helicopter with a searchlight circles at 4 and 5.
// Get caught and it's BUSTED; get your health to zero and it's WASTED.

import * as THREE from 'three';
import { range, rangeInt, pick, chance, clampNum, wrapAngle, angleLerp, dist } from './seed.js';
import { TUNE } from './tune.js';
import { makeCarMesh, collideBuildings } from './cars.js';

function makeFootCopMesh() {
  const g = new THREE.Group();
  const navy = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.36), navy);
  body.position.y = 1.18;
  g.add(body);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffd23c }));
  badge.position.set(0.16, 1.35, 0.19);
  g.add(badge);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), skin);
  head.position.y = 1.84;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), navy);
  cap.position.y = 2.02;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.28), navy);
  legL.position.set(0.17, 0.4, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = -0.17;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), navy);
  armL.position.set(0.44, 1.18, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = -0.44;
  g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

function makeHeliMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.6, 5.2),
    new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.5, metalness: 0.3 }),
  );
  g.add(body);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.9, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.15, metalness: 0.6 }),
  );
  glass.position.set(0, 0.3, 2.0);
  g.add(glass);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 4.6),
    new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.5 }),
  );
  tail.position.set(0, 0.3, -4.4);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.5 }));
  fin.position.set(0, 0.9, -6.4);
  g.add(fin);
  const rotor = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.4 });
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.5), bladeMat);
    blade.rotation.y = (i * Math.PI) / 2;
    rotor.add(blade);
  }
  rotor.position.y = 1.1;
  g.add(rotor);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 4.4),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
  skidL.position.set(1.0, -1.0, 0);
  g.add(skidL);
  const skidR = skidL.clone();
  skidR.position.x = -1.0;
  g.add(skidR);
  // searchlight cone
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(4.5, 26, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.13,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  cone.position.y = -14;
  cone.rotation.x = Math.PI;
  g.add(cone);
  const spot = new THREE.SpotLight(0xfff2b0, 120, 60, 0.35, 0.4, 1.2);
  spot.position.y = -1;
  g.add(spot);
  g.userData = { rotor, cone, spot };
  return g;
}

export function makeLaw(G, fleet, roads, colliders) {
  const rng = G.rng;
  const scene = G.scene;
  let wanted = 0;
  let quietTimer = 0;
  let decayTimer = 0;
  let bustProgress = 0;
  let blockTimer = 0;

  const cops = []; // cruiser cars driven by the PD
  const footCops = [];
  let heli = null;
  let heliAngle = 0;
  const roadblocks = [];

  function setWanted(n) {
    wanted = clampNum(n, 0, TUNE.maxStars);
    quietTimer = 0;
    decayTimer = 0;
  }
  function addWanted(n) {
    setWanted(wanted + n);
  }

  function spawnCruiserNear(x, z) {
    const a = rng() * Math.PI * 2;
    const d = range(rng, 45, 70);
    const p = roads.snap(x + Math.sin(a) * d, z + Math.cos(a) * d);
    const car = fleet.addCar('cruiser', p.x, p.z, rng() * Math.PI * 2, { driver: true });
    car.cop = true;
    car.route = null;
    cops.push(car);
    return car;
  }

  function spawnFootCop(x, z) {
    const mesh = makeFootCopMesh();
    const a = rng() * Math.PI * 2;
    const d = range(rng, 18, 30);
    mesh.position.set(x + Math.sin(a) * d, 0, z + Math.cos(a) * d);
    scene.add(mesh);
    const cop = {
      mesh, x: mesh.position.x, z: mesh.position.z,
      heading: rng() * Math.PI * 2, speed: 7.5, phase: rng() * 6,
    };
    footCops.push(cop);
    return cop;
  }

  function spawnHeli() {
    if (heli) return;
    const mesh = makeHeliMesh();
    scene.add(mesh);
    heli = { mesh, angle: 0, height: 42 };
  }

  function removeHeli() {
    if (!heli) return;
    scene.remove(heli.mesh);
    heli = null;
  }

  function spawnRoadblock(x, z, heading) {
    // two cruisers parked across the road ahead of the player
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    const bx = x + fx * 55;
    const bz = z + fz * 55;
    const blocks = [];
    for (const s of [-3.4, 3.4]) {
      const car = fleet.addCar('cruiser', bx + rx * s, bz + rz * s, heading + Math.PI / 2, { parked: true, driver: false });
      car.roadblock = true;
      blocks.push(car);
    }
    roadblocks.push({ cars: blocks, timer: 26 });
  }

  function clearRoadblocks() {
    for (const rb of roadblocks) {
      for (const c of rb.cars) {
        c.wrecked = true;
        scene.remove(c.mesh);
        const idx = fleet.cars.indexOf(c);
        if (idx >= 0) fleet.cars.splice(idx, 1);
      }
    }
    roadblocks.length = 0;
  }

  function update(dt, hero, fx) {
    // --- wanted decay when the player stays quiet and unseen ---
    if (wanted > 0) {
      let seen = false;
      for (const c of cops) if (dist(hero.x, hero.z, c.x, c.z) < 55) { seen = true; break; }
      if (!seen) {
        quietTimer += dt;
        if (quietTimer > TUNE.decayQuietSeconds) {
          decayTimer += dt;
          if (decayTimer > TUNE.decayStepSeconds) {
            decayTimer = 0;
            setWanted(wanted - 1);
          }
        }
      } else {
        quietTimer = 0;
        decayTimer = 0;
      }
    }

    // --- cruisers: keep the right number hunting ---
    const wantCruisers = TUNE.cruiserCount[wanted];
    while (cops.length < wantCruisers) spawnCruiserNear(hero.x, hero.z);
    while (cops.length > wantCruisers) {
      const c = cops.pop();
      c.wrecked = true;
      scene.remove(c.mesh);
      const idx = fleet.cars.indexOf(c);
      if (idx >= 0) fleet.cars.splice(idx, 1);
    }

    // --- cruiser pursuit ---
    for (const c of cops) {
      if (c.wrecked) continue;
      const dx = hero.x - c.x;
      const dz = hero.z - c.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const wantHeading = Math.atan2(dx, dz);
      c.heading = angleLerp(c.heading, wantHeading, dt * 1.8);
      const targetSpeed = d > 10 ? 34 : 24;
      c.speed += (targetSpeed - c.speed) * dt * 0.7;
      const nx = c.x + Math.sin(c.heading) * c.speed * dt;
      const nz = c.z + Math.cos(c.heading) * c.speed * dt;
      const fixed = collideBuildings(nx, nz, 1.5, colliders);
      c.x = fixed.x;
      c.z = fixed.z;
      if (fixed.hit) c.speed *= 0.6;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
      const spin = (c.speed * dt) / 0.36;
      for (const w of c.mesh.userData.wheels || []) w.rotation.x += spin;
      // ramming the player's car damages it
      if (hero.car && dist(hero.x, hero.z, c.x, c.z) < 3.4) {
        hero.car.health -= 14 * dt;
        hero.car.speed *= 0.94;
        if (fx && chance(rng, dt * 2)) fx.spawnSmoke(hero.car.x, 1.4, hero.car.z);
      }
      // light bar blink
      const lb = c.mesh.userData.lightbar;
      if (lb) {
        const on = Math.floor(G.timeSec * 6) % 2 === 0;
        lb.red.material.color.setHex(on ? 0xff2a3c : 0x4a0a12);
        lb.blue.material.color.setHex(on ? 0x141a4a : 0x2a6aff);
      }
    }

    // --- foot cops when the player is on foot ---
    const wantFoot = hero.car ? 0 : Math.min(2, wanted);
    while (footCops.length < wantFoot) spawnFootCop(hero.x, hero.z);
    while (footCops.length > wantFoot) {
      const f = footCops.pop();
      scene.remove(f.mesh);
    }
    for (const f of footCops) {
      const dx = hero.x - f.x;
      const dz = hero.z - f.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const wantHeading = Math.atan2(dx, dz);
      f.heading = angleLerp(f.heading, wantHeading, dt * 5);
      f.x += Math.sin(f.heading) * f.speed * dt;
      f.z += Math.cos(f.heading) * f.speed * dt;
      f.mesh.position.set(f.x, 0, f.z);
      f.mesh.rotation.y = f.heading;
      f.phase += dt * 9;
      const swing = Math.sin(f.phase) * 0.5;
      f.mesh.userData.legL.rotation.x = swing;
      f.mesh.userData.legR.rotation.x = -swing;
      f.mesh.userData.armL.rotation.x = -swing * 0.7;
      f.mesh.userData.armR.rotation.x = swing * 0.7;
    }

    // --- bust: a cop (car or foot) close to the player on foot ---
    if (wanted > 0 && !hero.car && !hero.dead) {
      let close = false;
      for (const c of cops) if (dist(hero.x, hero.z, c.x, c.z) < TUNE.bustDistance) close = true;
      for (const f of footCops) if (dist(hero.x, hero.z, f.x, f.z) < TUNE.bustDistance) close = true;
      if (close) {
        bustProgress += dt;
        if (bustProgress >= TUNE.bustHoldSeconds) {
          bustProgress = 0;
          G.events.push({ type: 'busted' });
        }
      } else {
        bustProgress = Math.max(0, bustProgress - dt * 2);
      }
    } else {
      bustProgress = 0;
    }

    // --- helicopter ---
    if (wanted >= TUNE.heliAtStars) {
      spawnHeli();
    } else {
      removeHeli();
    }
    if (heli) {
      heliAngle += dt * 0.35;
      const hx = hero.x + Math.sin(heliAngle) * 26;
      const hz = hero.z + Math.cos(heliAngle) * 26;
      heli.mesh.position.set(hx, heli.height + Math.sin(G.timeSec * 0.8) * 1.5, hz);
      heli.mesh.rotation.y = Math.atan2(hero.x - hx, hero.z - hz);
      heli.mesh.userData.rotor.rotation.y += dt * 22;
      heli.mesh.userData.spot.target.position.set(hero.x, 0, hero.z);
      heli.mesh.userData.spot.target.updateMatrixWorld();
    }

    // --- roadblocks ---
    if (wanted >= TUNE.roadblockAtStars && hero.car && Math.abs(hero.car.speed) > 12) {
      blockTimer -= dt;
      if (blockTimer <= 0) {
        blockTimer = 14;
        spawnRoadblock(hero.x, hero.z, hero.car.heading);
      }
    } else {
      blockTimer = 4;
    }
    for (let i = roadblocks.length - 1; i >= 0; i--) {
      roadblocks[i].timer -= dt;
      if (roadblocks[i].timer <= 0) {
        for (const c of roadblocks[i].cars) {
          c.wrecked = true;
          scene.remove(c.mesh);
          const idx = fleet.cars.indexOf(c);
          if (idx >= 0) fleet.cars.splice(idx, 1);
        }
        roadblocks.splice(i, 1);
      }
    }
  }

  return {
    get wanted() { return wanted; },
    get bustProgress() { return bustProgress; },
    setWanted, addWanted, update, clearRoadblocks,
    cops, footCops,
    get heli() { return heli; },
  };
}
