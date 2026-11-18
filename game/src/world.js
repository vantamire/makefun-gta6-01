// VICE HARBOR — procedural 3D city. One seeded pass builds the whole
// slice of town: road grid with lane markings, sidewalks, ~70 buildings
// with canvas-generated window textures (several heights, a few landmark
// towers, neon signs), street lights, palm trees, a beach strip with water
// and a pier on the east edge, distant skyline silhouettes, clouds, and
// dusk lighting (hemisphere + directional sun, fog, sky gradient).
// All textures are procedural canvas textures — no image files.
// v2: the sun sits EAST over the water (the drive/chase cameras face it),
// 3 bobbing boats + a lighthouse with a rotating beam at the pier end,
// and two guaranteed parked cars right by the player spawn.

import { CONFIG } from './config.js';
import { RNG } from './random.js';

// ---------- canvas texture helpers ----------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(canvas, repeatX, repeatY) {
  const THREE = window.__VICE_THREE__;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeatX) tex.repeat.set(repeatX, repeatY || repeatX);
  tex.anisotropy = 4;
  return tex;
}

// Building facade: rows of lit/unlit windows on a coloured wall.
function facadeTexture(rng, baseColor, litRatio) {
  const c = makeCanvas(128, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  // Subtle vertical shading.
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 14;
  const litColors = ['#ffd98a', '#ffe9b0', '#9fd8ff', '#ffb36b', '#fff3c4'];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = 8 + col * 19;
      const y = 10 + r * 17;
      const lit = rng.chance(litRatio);
      ctx.fillStyle = lit ? rng.pick(litColors) : 'rgba(12,16,28,0.85)';
      ctx.fillRect(x, y, 12, 9);
    }
  }
  return c;
}

// Neon sign strip: glowing text on a dark band.
function neonTexture(text, color) {
  const c = makeCanvas(256, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d0a18';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 34);
  return c;
}

// Road surface: asphalt with a dashed centre line and edge lines.
function roadTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2e38';
  ctx.fillRect(0, 0, 128, 128);
  // Asphalt speckle.
  for (let i = 0; i < 260; i++) {
    const g = 30 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgb(${g},${g + 2},${g + 8})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  // Edge lines.
  ctx.fillStyle = '#c8c4b8';
  ctx.fillRect(4, 0, 3, 128);
  ctx.fillRect(121, 0, 3, 128);
  // Dashed centre line.
  ctx.fillStyle = '#e8c33c';
  ctx.fillRect(62, 8, 4, 44);
  ctx.fillRect(62, 76, 4, 44);
  return c;
}

// Sidewalk / plaza paving.
function pavementTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8f8a80';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 32); ctx.lineTo(128, i * 32); ctx.stroke();
  }
  return c;
}

// Sand with a few speckles.
function sandTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(180,150,100,0.5)' : 'rgba(240,220,170,0.5)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return c;
}

// ---------- world builder ----------

const BUILDING_COLORS = [
  '#6b5b7a', '#7a6b8a', '#5b6b7a', '#8a6b5b', '#6b7a5b',
  '#7a5b6b', '#4f5f7a', '#8a7a5b', '#5b7a6b', '#746a8f',
];
const NEON_SIGNS = [
  { text: 'HOTEL', color: '#ff4fd8' },
  { text: 'CASINO', color: '#ffd23c' },
  { text: 'BAR', color: '#3ce0ff' },
  { text: 'PIZZA', color: '#ff6b3c' },
  { text: 'CLUB', color: '#b44dff' },
  { text: 'MOTEL', color: '#3cff9e' },
  { text: '24H', color: '#ff3c5a' },
];
const LANDMARKS = ['SUNSET TOWER', 'HARBOR PLAZA', 'CORAL BANK'];

export function createWorld(THREE, seed) {
  window.__VICE_THREE__ = THREE;
  const rng = new RNG(seed === undefined ? CONFIG.WORLD_SEED : seed);
  const group = new THREE.Group();
  group.name = 'ViceHarborCity';

  const pitch = CONFIG.CITY_PITCH;
  const half = CONFIG.WORLD_SIZE / 2;
  const beachX0 = half; // beach starts at the east edge of the grid
  const beachX1 = half + CONFIG.BEACH_WIDTH;
  const waterX1 = beachX1 + CONFIG.WATER_WIDTH;

  const colliders = [];
  const roads = [];
  const buildings = [];
  // Animated harbour props, driven by world.tick(dt, time).
  const boats = [];
  let lighthouseBeam = null;

  // Shared geometries / materials (keeps draw calls low).
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roadTex = canvasTexture(roadTexture());
  const paveTex = canvasTexture(pavementTexture());
  paveTex.repeat.set(8, 8);
  const sandTex = canvasTexture(sandTexture());
  sandTex.repeat.set(6, 24);

  // ---- ground: dusk-olive grass base under the whole map ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(waterX1 + half + 40, CONFIG.WORLD_SIZE + 80),
    new THREE.MeshLambertMaterial({ color: CONFIG.GROUND_COLOR })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((waterX1 - half) / 2, -0.05, 0);
  ground.receiveShadow = false;
  group.add(ground);

  // ---- roads: one long strip per grid line, both directions ----
  // Road centres sit in the middle of the gaps between blocks: block bz
  // spans -208+52*bz .. -168+52*bz, so the gap (and its road) is centred
  // at -214+52*i. (v1 centred roads 6 m off, overlapping the blocks on
  // one side and leaving a grass strip on the other — cars drove
  // half on the sidewalk.)
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const roadLen = CONFIG.WORLD_SIZE + CONFIG.ROAD_WIDTH;
  for (let i = 0; i <= CONFIG.GRID_BLOCKS; i++) {
    const c = -half + i * pitch;
    // North-south road.
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.ROAD_WIDTH, roadLen), roadMat.clone());
    ns.material.map = roadTex.clone();
    ns.material.map.repeat.set(1, Math.round(roadLen / 12));
    ns.material.map.needsUpdate = true;
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.02, 0);
    group.add(ns);
    // East-west road.
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, CONFIG.ROAD_WIDTH), roadMat.clone());
    ew.material.map = roadTex.clone();
    ew.material.map.repeat.set(Math.round(roadLen / 12), 1);
    ew.material.map.needsUpdate = true;
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.02, c);
    group.add(ew);
    roads.push({ x: c, z: 0, vertical: true });
    roads.push({ x: 0, z: c, vertical: false });
  }

  // ---- blocks: sidewalks + buildings ----
  const paveMat = new THREE.MeshLambertMaterial({ map: paveTex });
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 2.6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const palmTopGeo = new THREE.SphereGeometry(1.5, 7, 5);
  const palmTopMat = new THREE.MeshLambertMaterial({ color: 0x2e7d46 });
  const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const lampHeadGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });

  const facadeMats = [];
  for (let i = 0; i < 10; i++) {
    const tex = new THREE.CanvasTexture(facadeTexture(rng, BUILDING_COLORS[i], 0.45));
    facadeMats.push(new THREE.MeshLambertMaterial({ map: tex }));
  }
  const neonMats = NEON_SIGNS.map((s) => {
    const tex = new THREE.CanvasTexture(neonTexture(s.text, s.color));
    return new THREE.MeshBasicMaterial({ map: tex });
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });

  let landmarkIndex = 0;
  for (let bx = 0; bx < CONFIG.GRID_BLOCKS; bx++) {
    for (let bz = 0; bz < CONFIG.GRID_BLOCKS; bz++) {
      const cx = -half + CONFIG.ROAD_WIDTH / 2 + bx * pitch + CONFIG.BLOCK_SIZE / 2;
      const cz = -half + CONFIG.ROAD_WIDTH / 2 + bz * pitch + CONFIG.BLOCK_SIZE / 2;
      // Sidewalk slab for the whole block.
      const slab = new THREE.Mesh(boxGeo, paveMat);
      slab.scale.set(CONFIG.BLOCK_SIZE + 2, 0.3, CONFIG.BLOCK_SIZE + 2);
      slab.position.set(cx, 0.15, cz);
      group.add(slab);

      // 1-4 buildings per block, leaving a courtyard gap.
      const count = rng.int(1, 3);
      const spots = rng.shuffle([
        [-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22],
      ]).slice(0, count);
      for (const [ox, oz] of spots) {
        const w = rng.range(9, 15);
        const d = rng.range(9, 15);
        let h = rng.range(7, 22);
        let isLandmark = false;
        if (rng.chance(0.07)) {
          h = rng.range(30, 46);
          isLandmark = true;
        }
        const mat = facadeMats[rng.int(0, facadeMats.length - 1)];
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(cx + ox * CONFIG.BLOCK_SIZE, h / 2 + 0.3, cz + oz * CONFIG.BLOCK_SIZE);
        group.add(b);
        // Roof cap.
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.4, 0.4, d + 0.4);
        roof.position.set(b.position.x, h + 0.5, b.position.z);
        group.add(roof);
        // Neon sign on some mid/high buildings.
        if (h > 10 && rng.chance(0.4)) {
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(w * 0.9, 10), 2.4),
            neonMats[rng.int(0, neonMats.length - 1)]
          );
          sign.position.set(b.position.x, h * 0.82, b.position.z + d / 2 + 0.06);
          group.add(sign);
        }
        // Landmark name plate on the tallest towers.
        if (isLandmark && landmarkIndex < LANDMARKS.length) {
          const tex = new THREE.CanvasTexture(
            neonTexture(LANDMARKS[landmarkIndex], '#ffd23c')
          );
          const plate = new THREE.Mesh(
            new THREE.PlaneGeometry(14, 3),
            new THREE.MeshBasicMaterial({ map: tex })
          );
          plate.position.set(b.position.x, h - 2, b.position.z + d / 2 + 0.06);
          group.add(plate);
          landmarkIndex++;
        }
        buildings.push(b);
        colliders.push({
          minX: b.position.x - w / 2,
          maxX: b.position.x + w / 2,
          minZ: b.position.z - d / 2,
          maxZ: b.position.z + d / 2,
        });
      }

      // Palms and lamps around the block corners.
      const corner = rng.pick([[-1, -1], [1, -1], [-1, 1], [1, 1]]);
      const px = cx + corner[0] * (CONFIG.BLOCK_SIZE / 2 - 2);
      const pz = cz + corner[1] * (CONFIG.BLOCK_SIZE / 2 - 2);
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(px, 1.6, pz);
      group.add(trunk);
      const top = new THREE.Mesh(palmTopGeo, palmTopMat);
      top.scale.set(1, 0.55, 1);
      top.position.set(px, 3.1, pz);
      group.add(top);
      const lamp = new THREE.Mesh(lampPoleGeo, lampPoleMat);
      lamp.position.set(cx - corner[0] * (CONFIG.BLOCK_SIZE / 2 - 2), 2.9, cz - corner[1] * (CONFIG.BLOCK_SIZE / 2 - 2));
      group.add(lamp);
      const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
      head.position.set(lamp.position.x, 5.6, lamp.position.z);
      group.add(head);
    }
  }

  // ---- beach strip + water (east edge) ----
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.BEACH_WIDTH, CONFIG.WORLD_SIZE + 40),
    new THREE.MeshLambertMaterial({ map: sandTex })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((beachX0 + beachX1) / 2, 0.03, 0);
  group.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.WATER_WIDTH, CONFIG.WORLD_SIZE + 120),
    new THREE.MeshLambertMaterial({ color: CONFIG.WATER_COLOR, transparent: true, opacity: 0.9 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((beachX1 + waterX1) / 2, 0.01, 0);
  group.add(water);

  // Palms along the beach.
  for (let i = 0; i < 14; i++) {
    const z = -CONFIG.WORLD_SIZE / 2 + 20 + i * (CONFIG.WORLD_SIZE / 13);
    const x = beachX0 + 4 + rng.range(0, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1.6, z);
    trunk.rotation.z = rng.range(-0.12, 0.12);
    group.add(trunk);
    const top = new THREE.Mesh(palmTopGeo, palmTopMat);
    top.scale.set(1.15, 0.6, 1.15);
    top.position.set(x, 3.1, z);
    group.add(top);
  }

  // ---- boats bobbing on the water (east of the beach) ----
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e6df });
  const hullMat2 = new THREE.MeshLambertMaterial({ color: 0x2e6fd2 });
  const sailMat = new THREE.MeshLambertMaterial({ color: 0xfff3c4, side: THREE.DoubleSide });
  const mastMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  const boatSpots = [
    { x: beachX1 + 26, z: -84, hull: hullMat, sail: true },
    { x: beachX1 + 48, z: 12, hull: hullMat2, sail: false },
    { x: beachX1 + 34, z: 96, hull: hullMat, sail: true },
  ];
  for (let i = 0; i < boatSpots.length; i++) {
    const spot = boatSpots[i];
    const boat = new THREE.Group();
    boat.name = 'boat';
    const hull = new THREE.Mesh(boxGeo, spot.hull);
    hull.scale.set(6.5, 1.1, 2.4);
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(boxGeo, mastMat);
    cabin.scale.set(2.2, 0.9, 1.6);
    cabin.position.set(-0.8, 1.3, 0);
    boat.add(cabin);
    if (spot.sail) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.4, 6), mastMat);
      mast.position.set(0.6, 3.4, 0);
      boat.add(mast);
      // Triangular sail: a flattened cone reads as a sail at dusk.
      const sail = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.4, 4), sailMat);
      sail.scale.set(1, 1, 0.18);
      sail.position.set(0.6, 4.4, 0);
      sail.rotation.y = Math.PI / 4;
      boat.add(sail);
    }
    boat.position.set(spot.x, 0.15, spot.z);
    boat.rotation.y = rng.range(-0.5, 0.5);
    group.add(boat);
    boats.push({ mesh: boat, baseY: 0.15, phase: i * 2.1 });
  }

  // ---- pier jutting into the water ----
  const pier = new THREE.Group();
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3e });
  const pierDeck = new THREE.Mesh(boxGeo, pierMat);
  pierDeck.scale.set(46, 0.5, 8);
  pierDeck.position.set(beachX1 + 23, 0.6, 30);
  pier.add(pierDeck);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(boxGeo, pierMat);
    post.scale.set(0.6, 1.4, 0.6);
    post.position.set(beachX1 + 4 + i * 8, 0, 30 + (i % 2 === 0 ? 3.4 : -3.4));
    pier.add(post);
  }
  // Small shack at the pier end.
  const shack = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xd8cfc0 }));
  shack.scale.set(5, 3.4, 4);
  shack.position.set(beachX1 + 42, 2.3, 30);
  pier.add(shack);
  const shackSign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(neonTexture('PIER', '#3ce0ff')) })
  );
  shackSign.position.set(beachX1 + 42, 3.6, 27.9);
  shackSign.rotation.y = Math.PI;
  pier.add(shackSign);
  group.add(pier);

  // ---- lighthouse at the pier end, with a rotating beam ----
  const lightX = beachX1 + 44;
  const lightZ = 30;
  const towerMat = new THREE.MeshLambertMaterial({ color: 0xf2ede2 });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xd23c2e });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.9, 15, 12), towerMat);
  tower.position.set(lightX, 7.5, lightZ);
  group.add(tower);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 2.2, 12), bandMat);
  band.position.set(lightX, 9.5, lightZ);
  group.add(band);
  const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.8, 12),
    new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
  lampRoom.position.set(lightX, 15.9, lightZ);
  group.add(lampRoom);
  const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  lampGlow.position.set(lightX, 15.9, lightZ);
  group.add(lampGlow);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  // Cone apex at the lamp, widening out over the water: translate the
  // geometry so the apex sits at the origin, then lay it along +X.
  const beamGeo = new THREE.ConeGeometry(3.2, 26, 12, 1, true);
  beamGeo.translate(0, -13, 0);
  lighthouseBeam = new THREE.Mesh(beamGeo, beamMat);
  lighthouseBeam.rotation.z = Math.PI / 2; // cone axis along +X
  lighthouseBeam.position.set(lightX, 15.9, lightZ);
  group.add(lighthouseBeam);

  // ---- distant skyline silhouettes (outside the playable grid) ----
  const skylineMat = new THREE.MeshBasicMaterial({ color: 0x241a3e });
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2;
    const r = half + 90 + rng.range(0, 60);
    const w = rng.range(14, 30);
    const h = rng.range(18, 70);
    const s = new THREE.Mesh(boxGeo, skylineMat);
    s.scale.set(w, h, w);
    s.position.set(Math.cos(angle) * r, h / 2, Math.sin(angle) * r);
    group.add(s);
  }

  // ---- clouds: flat white blobs high up ----
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const puffs = rng.int(3, 5);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.scale.set(rng.range(8, 16), rng.range(2.5, 4.5), rng.range(6, 10));
      puff.position.set(p * rng.range(6, 10) - puffs * 4, rng.range(-1, 1), rng.range(-4, 4));
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-half - 60, waterX1), rng.range(55, 80), rng.range(-half - 40, half + 40));
    group.add(cloud);
  }

  // ---- dusk sky dome (gradient) + sun disc ----
  // The sun sits EAST over the water: the drive and chase cameras face
  // east, so they look straight into the sunset instead of a flat red band.
  const skyGeo = new THREE.SphereGeometry(560, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(CONFIG.SKY_TOP) },
      horizon: { value: new THREE.Color(CONFIG.SKY_HORIZON) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float t = clamp(normalize(vP).y * 1.6 + 0.12, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(t, 0.8)), 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.set(0, 0, 0);
  group.add(sky);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(16, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false })
  );
  sun.position.set(300, 46, 120);
  sun.lookAt(0, 20, 0);
  group.add(sun);

  // ---- lighting (sunlight comes from the east, over the water) ----
  const hemi = new THREE.HemisphereLight(CONFIG.HEMI_SKY, CONFIG.HEMI_GROUND, CONFIG.HEMI_INTENSITY);
  group.add(hemi);
  const sunLight = new THREE.DirectionalLight(CONFIG.SUN_COLOR, CONFIG.SUN_INTENSITY);
  sunLight.position.set(160, 90, 80);
  group.add(sunLight);
  const amb = new THREE.AmbientLight(CONFIG.AMBIENT, 0.6);
  group.add(amb);

  // ---- spawn points ----
  // Road centres are the gap centres: -214 + 52*i (see the roads section).
  const roadC = (i) => -half + i * pitch;
  const spawnPoints = {
    player: [roadC(4), roadC(4) + 4],
    cars: [],
    mission: [roadC(6), roadC(2)],
  };
  // Two guaranteed parked cars right by the player spawn (road at x = -6,
  // player at (-6, -2)): one a few metres down the road — inside E's 4 m
  // reach, so the first press works — and one a little further along it,
  // so E finds a car within seconds of starting.
  const px = spawnPoints.player[0];
  const pz = spawnPoints.player[1];
  spawnPoints.cars.push([px + 2, pz + 3, 0]);
  spawnPoints.cars.push([px - 3, pz + 10, Math.PI]);
  for (let i = 0; i < 8; i++) {
    const vertical = rng.chance(0.5);
    const line = roadC(rng.int(1, CONFIG.GRID_BLOCKS - 1));
    const along = rng.range(-half + 30, half - 30);
    const heading = vertical ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    spawnPoints.cars.push(vertical ? [line + (rng.chance(0.5) ? 3 : -3), along, heading] : [along, line + (rng.chance(0.5) ? 3 : -3), heading]);
  }

  const bounds = {
    minX: -half - CONFIG.ROAD_WIDTH,
    maxX: waterX1 - 6,
    minZ: -half - CONFIG.ROAD_WIDTH,
    maxZ: half + CONFIG.ROAD_WIDTH,
  };

  // Animate the harbour: boats bob on the swell, the lighthouse beam sweeps.
  function tick(dt, time) {
    if (!dt) return;
    for (const b of boats) {
      b.mesh.position.y = b.baseY + Math.sin(time * 0.7 + b.phase) * 0.12;
      b.mesh.rotation.z = Math.sin(time * 0.5 + b.phase) * 0.03;
      b.mesh.rotation.x = Math.sin(time * 0.6 + b.phase * 1.3) * 0.02;
    }
    if (lighthouseBeam) lighthouseBeam.rotation.y = time * 0.35;
  }

  return { group, roads, buildings, colliders, spawnPoints, bounds, rng, boats, lighthouseBeam, tick };
}
