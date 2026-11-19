// town.js — builds Vice Harbor, the city itself.
// A seeded grid of districts: downtown towers in the middle, the north
// yards, the south houses, and the east boardwalk with its pier, marina
// and ferris wheel. Every texture is painted on a canvas at load time,
// so the game ships no image files and works fully offline.

import * as THREE from 'three';
import { range, rangeInt, pick, chance, clampNum } from './seed.js';
import { TUNE } from './tune.js';

function canvasTexture(w, h, painter) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  painter(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function facadeTexture(rng, base, floors, litRatio) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // grime at the bottom
    const grad = g.createLinearGradient(0, h - 40, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = grad;
    g.fillRect(0, h - 40, w, 40);
    const cols = 5;
    const rows = Math.max(3, floors);
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < litRatio;
        g.fillStyle = lit ? '#ffd98a' : '#1c2438';
        g.fillRect(c * cw + 4, r * ch + 5, cw - 8, ch - 10);
        if (lit && rng() < 0.4) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(c * cw + 4, r * ch + 5 + (ch - 10) * 0.45, cw - 8, (ch - 10) * 0.2);
        }
      }
    }
  });
}

function graffitiTexture(rng, words) {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = '#b8a88f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 30; i++) g.fillRect(rng() * w, rng() * h, 20 + rng() * 40, 2);
    const colors = ['#ff2e88', '#2effc4', '#ffe14d', '#7a5cff', '#ff6a00'];
    const tags = pick(rng, words).split(' ');
    g.textAlign = 'center';
    tags.forEach((t, i) => {
      g.save();
      g.translate(w * (0.2 + i * 0.28), h * (0.35 + rng() * 0.35));
      g.rotate((rng() - 0.5) * 0.5);
      g.font = `900 ${26 + rng() * 14}px system-ui, sans-serif`;
      g.fillStyle = colors[(i + rangeInt(rng, 0, 4)) % colors.length];
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.lineWidth = 4;
      g.strokeText(t, 0, 0);
      g.fillText(t, 0, 0);
      g.restore();
    });
  });
}

function billboardTexture(rng, lines, accent) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#14101f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, 0, w, 14);
    g.fillRect(0, h - 14, w, 14);
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.font = '900 64px system-ui, sans-serif';
    g.fillText(lines[0], w / 2, 108);
    g.fillStyle = accent;
    g.font = '800 34px system-ui, sans-serif';
    g.fillText(lines[1], w / 2, 168);
    g.fillStyle = '#cfc8e8';
    g.font = '600 22px system-ui, sans-serif';
    g.fillText(lines[2] || '', w / 2, 210);
  });
}

function roadTexture(rng) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#23232b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 200; i++) g.fillRect(rng() * w, rng() * h, 2, 2);
    // centre dashes, both directions
    g.fillStyle = '#e8c33a';
    g.fillRect(w / 2 - 3, 0, 6, 60);
    g.fillRect(w / 2 - 3, 96, 6, 60);
    g.fillRect(w / 2 - 3, 192, 6, 60);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(8, 0, 3, h);
    g.fillRect(w - 11, 0, 3, h);
  });
}

const DISTRICTS = {
  downtown: { hMin: 26, hMax: 78, palette: ['#7a6a8a', '#5d6b7a', '#8a5f6a', '#6b7a8a', '#74655a'] },
  yards: { hMin: 8, hMax: 16, palette: ['#6a5a4a', '#5a5a52', '#715a3a', '#4a5560'] },
  south: { hMin: 6, hMax: 12, palette: ['#a8896a', '#8a7a6a', '#9a8a7a', '#b08a6a'] },
  boardwalk: { hMin: 8, hMax: 20, palette: ['#c47a5a', '#7a9a8a', '#d0a05a', '#8a6a9a'] },
};

function districtAt(rng, bx, bz) {
  if (bx >= 3) return 'boardwalk';
  if (bz <= -3) return 'yards';
  if (bz >= 3) return 'south';
  if (Math.abs(bx) <= 1 && Math.abs(bz) <= 1) return 'downtown';
  return chance(rng, 0.5) ? 'downtown' : 'south';
}

export function buildTown(G) {
  const rng = G.rng;
  const scene = G.scene;
  const group = new THREE.Group();
  group.name = 'town';
  scene.add(group);

  const P = TUNE.pitch;
  const R = TUNE.roadHalf;
  const B = TUNE.blocks;

  const colliders = []; // {x, z, hw, hd}
  const landmarks = {};
  const animated = { ferris: null, beacon: null, water: null };

  // ---------- ground ----------
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(TUNE.groundSize, TUNE.groundSize), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = false;
  group.add(ground);

  // ---------- sea ----------
  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x1d4a6b, roughness: 0.25, metalness: 0.55,
    emissive: 0x0a2438, emissiveIntensity: 0.5,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(260, TUNE.groundSize), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(TUNE.waterX + 130, -0.6, 0);
  group.add(sea);
  animated.water = sea;

  // beach strip
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(26, TUNE.groundSize),
    new THREE.MeshLambertMaterial({ color: 0xc9a86a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(TUNE.waterX - 13, 0.0, 0);
  group.add(sand);

  // ---------- roads ----------
  const roadTex = roadTexture(rng);
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadLen = (B * 2 + 1) * P;
  for (let k = -B; k <= B; k++) {
    const c = k * P;
    const v = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, R * 2), roadMat.clone());
    v.material.map = roadTex.clone();
    v.material.map.repeat.set(roadLen / 16, 1);
    v.material.map.needsUpdate = true;
    v.rotation.x = -Math.PI / 2;
    v.position.set(0, 0.02, c);
    group.add(v);
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, roadLen), roadMat.clone());
    hz.material.map = roadTex.clone();
    hz.material.map.repeat.set(1, roadLen / 16);
    hz.material.map.needsUpdate = true;
    hz.rotation.x = -Math.PI / 2;
    hz.position.set(c, 0.02, 0);
    group.add(hz);
  }

  // sidewalks: pale strips along every road
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x8a8578 });
  for (let k = -B; k <= B; k++) {
    const c = k * P;
    const a = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 3), walkMat);
    a.rotation.x = -Math.PI / 2;
    a.position.set(0, 0.03, c + R + 1.5);
    group.add(a);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, 3), walkMat);
    b.rotation.x = -Math.PI / 2;
    b.position.set(0, 0.03, c - R - 1.5);
    group.add(b);
    const d = new THREE.Mesh(new THREE.PlaneGeometry(3, roadLen), walkMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(c + R + 1.5, 0.03, 0);
    group.add(d);
    const e = new THREE.Mesh(new THREE.PlaneGeometry(3, roadLen), walkMat);
    e.rotation.x = -Math.PI / 2;
    e.position.set(c - R - 1.5, 0.03, 0);
    group.add(e);
  }

  // ---------- buildings, block by block ----------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const graffitiWords = ['VICE', 'HARBOR', 'REX', 'TURBO', 'KINGS', 'NEON', 'DUSK'];
  for (let bx = -B; bx < B; bx++) {
    for (let bz = -B; bz < B; bz++) {
      const district = districtAt(rng, bx, bz);
      const spec = DISTRICTS[district];
      const cx = (bx + 0.5) * P;
      const cz = (bz + 0.5) * P;
      // the boardwalk's east row is the promenade, not buildings
      if (district === 'boardwalk' && bx === B - 1) continue;
      const lots = district === 'downtown' ? 1 : rangeInt(rng, 1, 2);
      for (let l = 0; l < lots; l++) {
        const w = range(rng, 16, 30);
        const d = range(rng, 16, 30);
        const h = range(rng, spec.hMin, spec.hMax);
        const ox = lots === 1 ? 0 : (l === 0 ? -11 : 11);
        const oz = lots === 1 ? 0 : (l === 0 ? -9 : 9);
        const x = cx + ox;
        const z = cz + oz;
        const floors = Math.max(2, Math.round(h / 4));
        const tex = facadeTexture(rng, pick(rng, spec.palette), floors, 0.42);
        const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
        const mesh = new THREE.Mesh(boxGeo, [side, side, roofMat, roofMat, side, side]);
        mesh.scale.set(w, h, d);
        mesh.position.set(x, h / 2, z);
        group.add(mesh);
        colliders.push({ x, z, hw: w / 2 + 0.4, hd: d / 2 + 0.4 });
        // rooftop props on tall towers
        if (h > 40 && chance(rng, 0.6)) {
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(2.2, 2.2, 4, 8),
            new THREE.MeshLambertMaterial({ color: 0x4a4a52 }),
          );
          tank.position.set(x + w * 0.2, h + 2, z - d * 0.2);
          group.add(tank);
          const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff2a3c }),
          );
          beacon.position.set(x - w * 0.25, h + 1.2, z + d * 0.2);
          group.add(beacon);
        }
        // graffiti on low walls
        if (h < 22 && chance(rng, 0.55)) {
          const gtex = graffitiTexture(rng, graffitiWords);
          const wall = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 6),
            new THREE.MeshLambertMaterial({ map: gtex }),
          );
          wall.position.set(x + w / 2 + 0.06, 3, z);
          wall.rotation.y = Math.PI / 2;
          group.add(wall);
        }
      }
    }
  }

  // ---------- landmarks ----------
  // Coral Bank (downtown, mission hub)
  const bank = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ color: 0x9a8a6a, roughness: 0.7, metalness: 0.2 }),
  );
  bank.scale.set(30, 22, 24);
  bank.position.set(0, 11, -P * 0.5);
  group.add(bank);
  colliders.push({ x: 0, z: -P * 0.5, hw: 15.4, hd: 12.4 });
  landmarks.bank = { x: 0, z: -P * 0.5 };

  // Golden Anchor casino (boardwalk)
  const casino = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({
      color: 0x8a1f3c, roughness: 0.5, metalness: 0.3,
      emissive: 0x3c0a18, emissiveIntensity: 0.6,
    }),
  );
  casino.scale.set(26, 18, 20);
  casino.position.set(P * 2.5, 9, P * 1.5);
  group.add(casino);
  colliders.push({ x: P * 2.5, z: P * 1.5, hw: 13.4, hd: 10.4 });
  landmarks.casino = { x: P * 2.5, z: P * 1.5 };

  // Mama Lou's Bar (south)
  const bar = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ color: 0x4a3a5a, roughness: 0.8 }),
  );
  bar.scale.set(20, 10, 16);
  bar.position.set(-P * 1.5, 5, P * 2.5);
  group.add(bar);
  colliders.push({ x: -P * 1.5, z: P * 2.5, hw: 10.4, hd: 8.4 });
  landmarks.bar = { x: -P * 1.5, z: P * 2.5 };

  // Safehouse (south-west)
  const safe = new THREE.Mesh(
    boxGeo,
    new THREE.MeshStandardMaterial({ color: 0x5a6a4a, roughness: 0.85 }),
  );
  safe.scale.set(18, 9, 14);
  safe.position.set(-P * 2.5, 4.5, P * 3.5);
  group.add(safe);
  colliders.push({ x: -P * 2.5, z: P * 3.5, hw: 9.4, hd: 7.4 });
  landmarks.safehouse = { x: -P * 2.5, z: P * 3.5 };

  // Airstrip (north-west corner, a flat runway)
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 16),
    new THREE.MeshLambertMaterial({ color: 0x2c2c34 }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(-P * 3.5, 0.04, -P * 3.5);
  group.add(runway);
  landmarks.airstrip = { x: -P * 3.5, z: -P * 3.5 };

  // ---------- billboards ----------
  const boards = [
    { x: P * 0.5, z: -P * 2.5, ry: 0, lines: ['VICE HARBOR', 'LIVE FREE', 'est. 1987'], accent: '#ff2e88' },
    { x: -P * 2.5, z: P * 0.5, ry: Math.PI / 2, lines: ['TAXI', 'CALL 555-0187', '24 HOURS'], accent: '#ffe14d' },
    { x: P * 1.5, z: P * 3.5, ry: Math.PI, lines: ['GOLDEN ANCHOR', 'CASINO • HOTEL', 'WIN BIG'], accent: '#2effc4' },
  ];
  for (const b of boards) {
    const tex = billboardTexture(rng, b.lines, b.accent);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 14, 6),
      new THREE.MeshLambertMaterial({ color: 0x3a3a42 }),
    );
    pole.position.set(b.x, 7, b.z);
    group.add(pole);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 11),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    board.position.set(b.x, 18, b.z);
    board.rotation.y = b.ry;
    group.add(board);
    colliders.push({ x: b.x, z: b.z, hw: 1, hd: 1 });
  }

  // ---------- boardwalk: pier, ferris wheel, palms, stalls ----------
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(34, 300), deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(P * 3.5 + 8, 0.06, 0);
  group.add(deck);

  const pier = new THREE.Mesh(new THREE.PlaneGeometry(10, 60), deckMat);
  pier.rotation.x = -Math.PI / 2;
  pier.position.set(TUNE.waterX + 28, 0.3, P * 0.5);
  group.add(pier);
  landmarks.pier = { x: TUNE.waterX + 28, z: P * 0.5 };

  // ferris wheel
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(P * 3.5 + 6, 26, -P * 1.5);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(16, 0.8, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0xff5a7a, roughness: 0.5, emissive: 0x57101e, emissiveIntensity: 0.5 }),
  );
  wheelGroup.add(rim);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 32, 6),
      new THREE.MeshLambertMaterial({ color: 0xd8d8e0 }),
    );
    spoke.rotation.z = a;
    wheelGroup.add(spoke);
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2.4, 2.4),
      new THREE.MeshStandardMaterial({ color: pick(rng, [0xffe14d, 0x2effc4, 0x7a5cff, 0xff6a00]), roughness: 0.5 }),
    );
    cab.position.set(Math.cos(a) * 16, Math.sin(a) * 16, 0);
    wheelGroup.add(cab);
  }
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0x2a2a30 }),
  );
  axle.rotation.x = Math.PI / 2;
  wheelGroup.add(axle);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 26, 1.2), new THREE.MeshLambertMaterial({ color: 0x3a3a42 }));
  legL.position.set(-8, -13, 0);
  legL.rotation.z = 0.3;
  wheelGroup.add(legL);
  const legR = legL.clone();
  legR.position.x = 8;
  legR.rotation.z = -0.3;
  wheelGroup.add(legR);
  group.add(wheelGroup);
  animated.ferris = wheelGroup;
  landmarks.wheel = { x: P * 3.5 + 6, z: -P * 1.5 };

  // lighthouse at the pier tip
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 3.5, 22, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.7 }),
  );
  tower.position.set(TUNE.pierX, 11, P * 0.5);
  group.add(tower);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  lamp.position.set(TUNE.pierX, 23, P * 0.5);
  group.add(lamp);
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.14,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(TUNE.pierX + 30, 23, P * 0.5);
  group.add(beam);
  animated.beacon = beam;
  colliders.push({ x: TUNE.pierX, z: P * 0.5, hw: 4, hd: 4 });

  // palms along the boardwalk
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2a7a3a });
  for (let i = 0; i < 14; i++) {
    const px = P * 3.5 + 2 + range(rng, -4, 4);
    const pz = -220 + i * 34 + range(rng, -6, 6);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 9, 6), trunkMat);
    trunk.position.set(px, 4.5, pz);
    trunk.rotation.z = (rng() - 0.5) * 0.15;
    group.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6, 4), leafMat);
      const a = (f / 5) * Math.PI * 2;
      frond.position.set(px + Math.cos(a) * 2.4, 9.2, pz + Math.sin(a) * 2.4);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      group.add(frond);
    }
  }

  // food stalls
  for (let i = 0; i < 5; i++) {
    const sx = P * 3.5 - 4;
    const sz = -140 + i * 70;
    const stall = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({
      color: pick(rng, [0xff6a00, 0x2effc4, 0xffe14d, 0xff2e88]), roughness: 0.7,
    }));
    stall.scale.set(6, 3.4, 5);
    stall.position.set(sx, 1.7, sz);
    group.add(stall);
    const awn = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 3),
      new THREE.MeshLambertMaterial({ color: 0xf0ead8, side: THREE.DoubleSide }),
    );
    awn.position.set(sx, 3.8, sz);
    awn.rotation.x = -0.4;
    group.add(awn);
    colliders.push({ x: sx, z: sz, hw: 3.4, hd: 2.9 });
  }

  // ---------- streetlights ----------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (let k = -B; k <= B; k++) {
    for (let m = -B; m <= B; m += 2) {
      const x = k * P + R + 2.2;
      const z = m * P;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 7, 6), poleMat);
      pole.position.set(x, 3.5, z);
      group.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.18), poleMat);
      arm.position.set(x - 1, 6.9, z);
      group.add(arm);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), headMat);
      head.position.set(x - 2, 6.8, z);
      group.add(head);
    }
  }

  // ---------- boats in the marina ----------
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.4 });
  for (let i = 0; i < 6; i++) {
    const bx = TUNE.waterX + 14 + range(rng, 0, 26);
    const bz = -160 + i * 55 + range(rng, -8, 8);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 10), hullMat);
    hull.position.set(bx, 0.2, bz);
    hull.rotation.y = range(rng, -0.3, 0.3);
    group.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 4), new THREE.MeshLambertMaterial({ color: 0x3a5a7a }));
    cabin.position.set(bx, 1.6, bz);
    group.add(cabin);
  }

  // ---------- city edge fence (keeps the player in) ----------
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x3a3a42 });
  const edge = (B + 0.5) * P + 4;
  const fenceN = new THREE.Mesh(new THREE.BoxGeometry(edge * 2, 3, 1), fenceMat);
  fenceN.position.set(0, 1.5, -edge);
  group.add(fenceN);
  const fenceS = fenceN.clone();
  fenceS.position.z = edge;
  group.add(fenceS);
  const fenceW = new THREE.Mesh(new THREE.BoxGeometry(1, 3, edge * 2), fenceMat);
  fenceW.position.set(-edge, 1.5, 0);
  group.add(fenceW);

  return { colliders, landmarks, animated, group };
}

export function townTick(town, dt, timeSec) {
  if (town.animated.ferris) town.animated.ferris.rotation.z += dt * 0.12;
  if (town.animated.beacon) town.animated.beacon.rotation.y = timeSec * 0.5;
  if (town.animated.water) town.animated.water.position.y = -0.6 + Math.sin(timeSec * 0.7) * 0.12;
}
