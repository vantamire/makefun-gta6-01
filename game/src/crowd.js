// crowd.js — the people of Vice Harbor.
// Pedestrians stroll the sidewalks, cross at corners, panic and run
// when a car screams past or a gun goes off, and three stray dogs trot
// the blocks, sniffing the ground and bolting from fast traffic.

import * as THREE from 'three';
import { range, rangeInt, pick, chance, clampNum, wrapAngle, angleLerp, dist } from './seed.js';
import { TUNE } from './tune.js';

const SHIRTS = [0xd21f2b, 0x2a6ab0, 0xffe14d, 0x2effc4, 0xf0e8d8, 0x7a5cff, 0xff6a00, 0x4a7a5a];
const PANTS = [0x2a2a30, 0x3a4a6a, 0x5a4a3a, 0x1a1a1a];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

function makePersonMesh(rng) {
  const g = new THREE.Group();
  const shirt = pick(rng, SHIRTS);
  const pants = pick(rng, PANTS);
  const skin = pick(rng, SKINS);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.85, 0.34),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 }),
  );
  body.position.y = 1.15;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 10),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }),
  );
  head.position.y = 1.78;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 10, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: pick(rng, [0x1a1a1a, 0x3a2a1a, 0x6a6a6a, 0x8a4a2a]), roughness: 0.95 }),
  );
  hair.position.y = 1.82;
  g.add(hair);
  const legL = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.75, 0.26),
    new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 }),
  );
  legL.position.set(0.16, 0.38, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = -0.16;
  g.add(legR);
  const armL = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.7, 0.2),
    new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 }),
  );
  armL.position.set(0.42, 1.15, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = -0.42;
  g.add(armR);
  g.userData = { legL, legR, armL, armR, head };
  return g;
}

function makeDogMesh() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.1), fur);
  body.position.y = 0.55;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.45), fur);
  head.position.set(0, 0.75, 0.65);
  g.add(head);
  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.12), fur);
  earL.position.set(0.16, 0.95, 0.6);
  g.add(earL);
  const earR = earL.clone();
  earR.position.x = -0.16;
  g.add(earR);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), fur);
  tail.position.set(0, 0.7, -0.7);
  tail.rotation.x = -0.7;
  g.add(tail);
  const legs = [];
  for (const [sx, sz] of [[0.18, 0.4], [-0.18, 0.4], [0.18, -0.4], [-0.18, -0.4]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), fur);
    leg.position.set(sx, 0.25, sz);
    g.add(leg);
    legs.push(leg);
  }
  g.userData = { legs, tail };
  return g;
}

export function makeCrowd(G, roads) {
  const rng = G.rng;
  const scene = G.scene;
  const peds = [];
  const dogs = [];

  function sidewalkPoint() {
    const line = pick(rng, roads.lines);
    const along = rangeInt(rng, -TUNE.blocks, TUNE.blocks) * TUNE.pitch + range(rng, -20, 20);
    const side = pick(rng, [-1, 1]) * (TUNE.roadHalf + 1.5);
    return chance(rng, 0.5)
      ? { x: line + side, z: along }
      : { x: along, z: line + side };
  }

  for (let i = 0; i < TUNE.pedCount; i++) {
    const p = sidewalkPoint();
    const mesh = makePersonMesh(rng);
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    const dest = sidewalkPoint();
    peds.push({
      mesh, x: p.x, z: p.z, heading: rng() * Math.PI * 2,
      speed: range(rng, 1.2, 2.2), dest,
      state: 'walk', health: 100, walkPhase: rng() * 6, downTimer: 0,
    });
  }

  for (let i = 0; i < TUNE.dogCount; i++) {
    const p = sidewalkPoint();
    const mesh = makeDogMesh();
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    dogs.push({
      mesh, x: p.x, z: p.z, heading: rng() * Math.PI * 2,
      speed: range(rng, 2, 3.2), dest: sidewalkPoint(),
      state: 'trot', sniff: range(rng, 0, 4), phase: rng() * 6,
    });
  }

  function scare(x, z, radius) {
    for (const p of peds) {
      if (p.state === 'down') continue;
      if (dist(x, z, p.x, p.z) < radius) {
        p.state = 'flee';
        p.fleeFrom = { x, z };
        p.fleeTimer = range(rng, 2.5, 5);
      }
    }
    for (const d of dogs) {
      if (dist(x, z, d.x, d.z) < radius) {
        d.state = 'bolt';
        d.fleeFrom = { x, z };
        d.fleeTimer = range(rng, 2, 4);
      }
    }
  }

  function nearestPed(x, z, maxD) {
    let best = null;
    let bd = maxD;
    for (const p of peds) {
      if (p.state === 'down') continue;
      const d = dist(x, z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function pedTick(dt, playerPos, playerSpeed) {
    for (const p of peds) {
      if (p.state === 'down') {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.state = 'walk';
          p.mesh.rotation.x = 0;
          p.mesh.position.y = 0;
          p.health = 100;
        }
        continue;
      }
      let speed = p.speed;
      let tx = p.dest.x;
      let tz = p.dest.z;
      if (p.state === 'flee') {
        p.fleeTimer -= dt;
        speed = 6.5;
        const away = Math.atan2(p.x - p.fleeFrom.x, p.z - p.fleeFrom.z);
        tx = p.x + Math.sin(away) * 20;
        tz = p.z + Math.cos(away) * 20;
        if (p.fleeTimer <= 0) { p.state = 'walk'; p.dest = sidewalkPoint(); }
      } else if (playerPos && dist(playerPos.x, playerPos.z, p.x, p.z) < 4 && playerSpeed > 14) {
        p.state = 'flee';
        p.fleeFrom = { x: playerPos.x, z: playerPos.z };
        p.fleeTimer = 3;
      }
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1.5) {
        if (p.state === 'walk') p.dest = sidewalkPoint();
        continue;
      }
      const want = Math.atan2(dx, dz);
      p.heading = angleLerp(p.heading, want, dt * 4);
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      p.x = clampNum(p.x, -roads.edge, roads.edge);
      p.z = clampNum(p.z, -roads.edge, roads.edge);
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      p.walkPhase += dt * speed * 3.2;
      const swing = Math.sin(p.walkPhase) * 0.45;
      p.mesh.userData.legL.rotation.x = swing;
      p.mesh.userData.legR.rotation.x = -swing;
      p.mesh.userData.armL.rotation.x = -swing * 0.7;
      p.mesh.userData.armR.rotation.x = swing * 0.7;
    }

    for (const d of dogs) {
      d.phase += dt * 6;
      let speed = d.speed;
      let tx = d.dest.x;
      let tz = d.dest.z;
      if (d.state === 'bolt') {
        d.fleeTimer -= dt;
        speed = 9;
        const away = Math.atan2(d.x - d.fleeFrom.x, d.z - d.fleeFrom.z);
        tx = d.x + Math.sin(away) * 24;
        tz = d.z + Math.cos(away) * 24;
        if (d.fleeTimer <= 0) { d.state = 'trot'; d.dest = sidewalkPoint(); }
      } else {
        d.sniff -= dt;
        if (d.sniff <= 0) {
          d.state = 'sniff';
          d.sniff = range(rng, 2, 5);
        }
        if (d.state === 'sniff') {
          d.mesh.userData.tail.rotation.x = -0.7 + Math.sin(d.phase * 0.4) * 0.1;
          continue;
        }
      }
      const dx = tx - d.x;
      const dz = tz - d.z;
      const dd = Math.sqrt(dx * dx + dz * dz);
      if (dd < 1.5) { d.dest = sidewalkPoint(); continue; }
      const want = Math.atan2(dx, dz);
      d.heading = angleLerp(d.heading, want, dt * 5);
      d.x += Math.sin(d.heading) * speed * dt;
      d.z += Math.cos(d.heading) * speed * dt;
      d.x = clampNum(d.x, -roads.edge, roads.edge);
      d.z = clampNum(d.z, -roads.edge, roads.edge);
      d.mesh.position.set(d.x, 0, d.z);
      d.mesh.rotation.y = d.heading;
      const trot = Math.sin(d.phase) * 0.5;
      d.mesh.userData.legs[0].rotation.x = trot;
      d.mesh.userData.legs[3].rotation.x = trot;
      d.mesh.userData.legs[1].rotation.x = -trot;
      d.mesh.userData.legs[2].rotation.x = -trot;
      d.mesh.userData.tail.rotation.y = Math.sin(d.phase * 0.8) * 0.5;
    }
  }

  return { peds, dogs, pedTick, scare, nearestPed, sidewalkPoint };
}
