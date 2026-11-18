// v4 — VICE HARBOR, the city itself, built procedurally in one pass.
// A sun-soaked harbor town at dusk: low shopfronts with BIG readable
// signs, mid-rise blocks and stepped towers, a beach with a wooden
// boardwalk (food stalls, a ferris wheel, an arcade), a marina with
// moored boats, a pier and a lighthouse. Every texture is drawn on a
// canvas at build time — no image files, no network.
//
// New in v4: the boardwalk district along the beach, a rotating ferris
// wheel, and a full day/night cycle — the sun, sky, fog and lamps follow
// the hour (world.setHour), so dusk slides into night and back to day.
//
// The builder returns the live world: the THREE group, the road list the
// minimap and traffic read, the building meshes, the AABB colliders the
// cars and the player slide against, the spawn points, the playable
// bounds, a setHour() for the day/night cycle, and a tick() that keeps
// the harbour moving (bobbing boats, the sweeping lighthouse beam, the
// turning ferris wheel).
//
// Layout contract (shared with traffic, pedestrians, police, missions):
// an 8x8 grid of 40 m blocks, 12 m roads, road centres every 52 m from
// -214 to +202; the beach, boardwalk and water run along the east (+X) edge.

import { CONFIG } from './config.js';
import { SeededRandom } from './random.js';

// The three.js module, captured when buildCity runs so the texture
// helpers below can build CanvasTextures without threading it through.
let T = null;

function canvasEl(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texFromCanvas(canvas, repeatX, repeatY) {
  const tex = new T.CanvasTexture(canvas);
  tex.wrapS = T.RepeatWrapping;
  tex.wrapT = T.RepeatWrapping;
  if (repeatX) tex.repeat.set(repeatX, repeatY || repeatX);
  tex.anisotropy = 4;
  return tex;
}

// One building face: rows of BIG windows, most of them lit warm or cool
// at dusk, over a bright wall with a darker ground floor — the bottom
// strip reads as shopfronts with awnings, which is what makes a street
// feel like a street instead of a stack of boxes.
function paintFacade(rng, baseColor, litRatio) {
  const c = canvasEl(128, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  const shade = ctx.createLinearGradient(0, 0, 128, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.22)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  shade.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 128, 256);
  // Floor slabs: thin dark lines between storeys.
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (let r = 0; r < 14; r++) ctx.fillRect(0, 10 + r * 17 + 13, 128, 2);
  const litColors = ['#ffd98a', '#ffe9b0', '#9fd8ff', '#ffb36b', '#fff3c4', '#ff9d7a'];
  for (let r = 0; r < 13; r++) {
    for (let col = 0; col < 6; col++) {
      const x = 7 + col * 20;
      const y = 10 + r * 17;
      const lit = rng.chance(litRatio);
      ctx.fillStyle = lit ? rng.choice(litColors) : 'rgba(16,20,32,0.85)';
      ctx.fillRect(x, y, 14, 11);
    }
  }
  // Ground floor: big shop windows, mostly lit, under an awning stripe.
  ctx.fillStyle = 'rgba(8,8,14,0.9)';
  ctx.fillRect(0, 228, 128, 28);
  for (let col = 0; col < 4; col++) {
    ctx.fillStyle = rng.chance(0.75) ? rng.choice(['#ffd98a', '#9fd8ff', '#fff3c4']) : 'rgba(20,24,36,0.9)';
    ctx.fillRect(6 + col * 31, 234, 24, 16);
  }
  ctx.fillStyle = rng.choice(['#d23c2e', '#2e6fd2', '#3fae6a', '#e8b93a']);
  ctx.fillRect(0, 224, 128, 5);
  return c;
}

// Glowing sign text on a dark band (hotels, casinos, bars...).
function paintNeon(text, color) {
  const c = canvasEl(256, 64);
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

// A big shopfront sign: huge readable name on a bright band, the way a
// real street shop shouts its name at the sidewalk.
function paintShopSign(name, bg, fg) {
  const c = canvasEl(512, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(0, 0, 512, 8);
  ctx.fillRect(0, 88, 512, 8);
  ctx.font = '900 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(name, 256, 52);
  return c;
}

// A graffiti tag: a big bold word in a bright spray colour, drawn several
// times with slight offsets and low alpha so it reads as spray paint
// instead of a printed label, plus a scribble underline. The reference
// screenshot's big tiled wall is covered in tags like this.
function paintGraffiti(word, color, rng) {
  const c = canvasEl(512, 256);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 256);
  ctx.save();
  ctx.translate(256, 140);
  ctx.rotate(-0.06);
  ctx.font = 'italic 900 92px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = color;
    ctx.fillText(word, rng.range(-4, 4), rng.range(-4, 4));
  }
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = color;
  ctx.fillText(word, 0, 0);
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(60, 200);
  ctx.bezierCurveTo(180, 180, 320, 220, 450, 195);
  ctx.stroke();
  ctx.restore();
  return c;
}

// A green street-name blade, white letters, like a real intersection sign.
function paintStreetBlade(name) {
  const c = canvasEl(256, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1d5c2e';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, 250, 58);
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 128, 34);
  return c;
}

// A red octagon STOP sign.
function paintStop() {
  const c = canvasEl(128, 128);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#c81e1e';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = 64 + Math.cos(a) * 58;
    const y = 64 + Math.sin(a) * 58;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.font = '900 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('STOP', 64, 66);
  return c;
}

// A big roadside billboard: headline + subline on a bold background.
function paintBillboard(headline, subline, bg, fg) {
  const c = canvasEl(512, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 5; i++) ctx.fillRect(0, 30 + i * 46, 512, 8);
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(headline, 256, 108);
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(subline, 256, 182);
  return c;
}

// Asphalt: speckled dark grey, pale edge lines, a dashed yellow centre.
function paintAsphalt() {
  const c = canvasEl(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2e38';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const g = 30 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgb(${g},${g + 2},${g + 8})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  ctx.fillStyle = '#c8c4b8';
  ctx.fillRect(4, 0, 3, 128);
  ctx.fillRect(121, 0, 3, 128);
  ctx.fillStyle = '#e8c33c';
  ctx.fillRect(62, 8, 4, 44);
  ctx.fillRect(62, 76, 4, 44);
  return c;
}

// Zebra crossing: white bars running both ways across the junction.
function paintCrossing() {
  const c = canvasEl(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2b2e38';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(240,240,235,0.92)';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(6 + i * 25, 8, 13, 112);
    ctx.fillRect(8, 6 + i * 25, 112, 13);
  }
  return c;
}

// Sidewalk paving: pale slabs with dark joints.
function paintPaving() {
  const c = canvasEl(128, 128);
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

// Beach sand with speckles.
function paintSand() {
  const c = canvasEl(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(180,150,100,0.5)' : 'rgba(240,220,170,0.5)';
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  return c;
}

// Boardwalk planks: warm wood with dark gaps and pale nail lines.
function paintPlanks() {
  const c = canvasEl(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a6a45';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#7a5c38' : '#96764e';
    ctx.fillRect(0, i * 16, 128, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, i * 16 + 14, 128, 2);
  }
  return c;
}

// Soft radial glow for the sun sprite.
function paintGlow() {
  const c = canvasEl(256, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,220,160,0.95)');
  g.addColorStop(0.35, 'rgba(255,170,90,0.5)');
  g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return c;
}

// A striped awning for a boardwalk stall (red/white or teal/white).
function paintAwning(colorA, colorB) {
  const c = canvasEl(256, 64);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? colorA : colorB;
    ctx.fillRect(i * 32, 0, 32, 64);
  }
  return c;
}

// Warmer, brighter walls than the old purple-grey set: brick, sand, teal,
// cream and coral, so the street reads in the dusk instead of sinking.
const WALL_COLORS = [
  '#a06a4f', '#b09a6a', '#4f8a7a', '#c9b896', '#b06a5a',
  '#5f7a9a', '#8a7a5b', '#7a9a5b', '#9a6b8a', '#6b8a9a',
  '#c08a4f', '#7a6b4f', '#8a5f6b', '#5f8a6b',
];
const NEON_TEXTS = [
  { text: 'HOTEL', color: '#ff4fd8' },
  { text: 'CASINO', color: '#ffd23c' },
  { text: 'BAR', color: '#3ce0ff' },
  { text: 'PIZZA', color: '#ff6b3c' },
  { text: 'CLUB', color: '#b44dff' },
  { text: 'MOTEL', color: '#3cff9e' },
  { text: '24H', color: '#ff3c5a' },
  { text: 'TACOS', color: '#ffb36b' },
];
const SHOP_NAMES = [
  { name: 'PIZZA', bg: '#7a1e1e', fg: '#ffd23c' },
  { name: '24H MART', bg: '#123a5c', fg: '#ffffff' },
  { name: 'TACOS', bg: '#8a5a1e', fg: '#ffe9b0' },
  { name: 'DONUTS', bg: '#a03a7a', fg: '#ffffff' },
  { name: 'BAR', bg: '#1e2a3a', fg: '#3ce0ff' },
  { name: 'LIQUOR', bg: '#3a2a5c', fg: '#ffb36b' },
  { name: 'CLUB NEON', bg: '#2a0a3a', fg: '#ff4fd8' },
  { name: 'BURGER', bg: '#5c2a10', fg: '#ffd23c' },
];
const STREET_LABELS = ['OCEAN DR', 'HARBOR AVE', 'PALM ST', 'SUNSET BLVD'];
const LANDMARK_NAMES = ['SUNSET TOWER', 'HARBOR PLAZA', 'CORAL BANK'];
const ADVERTS = [
  { headline: 'VICE HARBOR', subline: 'THE SUN NEVER SETS ON FUN', bg: '#1c1440', fg: '#ffd23c', x: -110, z: -162, rot: 0 },
  { headline: 'CORAL COLA', subline: 'TASTE THE HARBOR', bg: '#0d3a5c', fg: '#3ce0ff', x: 110, z: 58, rot: Math.PI / 2 },
  { headline: 'SUNSET CASINO', subline: 'WIN BIG ON THE PIER', bg: '#4a1030', fg: '#ff4fd8', x: -58, z: 162, rot: Math.PI },
  { headline: 'PIER 30', subline: 'FISH • BOATS • SUNSET', bg: '#123a2a', fg: '#3cff9e', x: 162, z: -110, rot: -Math.PI / 2 },
];
// Boardwalk food stalls (name, colours, position along the walk).
const STALLS = [
  { name: 'PIZZA', bg: '#7a1e1e', fg: '#ffd23c', z: -140 },
  { name: 'TACOS', bg: '#8a5a1e', fg: '#ffe9b0', z: -84 },
  { name: 'ICE CREAM', bg: '#a03a7a', fg: '#ffffff', z: -20 },
  { name: 'BURGER', bg: '#5c2a10', fg: '#ffd23c', z: 44 },
  { name: 'DONUTS', bg: '#7a1e5c', fg: '#ffffff', z: 108 },
  { name: 'LEMONADE', bg: '#1e5c3a', fg: '#ffe9b0', z: 168 },
];

// Day/night keyframes, indexed by hour of day. Each stop holds the sun
// (colour + strength), the hemisphere + ambient light, the fog, the sky
// gradient, and how strongly the street lamps glow.
const DAY_STOPS = [
  {
    hour: 0, sun: 0x1a2a4a, sunI: 0.15, hemiSky: 0x1a2440, hemiGround: 0x0a0a12, hemiI: 0.5,
    amb: 0x1a1a2a, fog: 0x0d0d1a, top: 0x050510, mid: 0x0d0d24, horizon: 0x1a1a3a, lamp: 0.35, sunDisc: 0.05,
  },
  {
    hour: 6, sun: 0xff9d6b, sunI: 0.9, hemiSky: 0x7a6a9a, hemiGround: 0x2a2018, hemiI: 0.7,
    amb: 0x35304a, fog: 0x4a3a5a, top: 0x2a2a5a, mid: 0x8a4a6e, horizon: 0xff9d5a, lamp: 0.15, sunDisc: 0.9,
  },
  {
    hour: 12, sun: 0xfff2d0, sunI: 1.8, hemiSky: 0x9ab8e0, hemiGround: 0x5a6a4a, hemiI: 1.1,
    amb: 0x5a5a6a, fog: 0x8a9ab0, top: 0x3a6ab0, mid: 0x7ab0d8, horizon: 0xcfe8f0, lamp: 0.05, sunDisc: 1,
  },
  {
    hour: 18.5, sun: 0xffb36b, sunI: 1.5, hemiSky: 0x8a6fd0, hemiGround: 0x2c2118, hemiI: 0.95,
    amb: 0x40355e, fog: 0x3a2a55, top: 0x1c1440, mid: 0x8a3a6e, horizon: 0xff7a3d, lamp: 0.1, sunDisc: 1,
  },
  {
    hour: 21, sun: 0x4a3a6a, sunI: 0.5, hemiSky: 0x3a3a6a, hemiGround: 0x1a1420, hemiI: 0.6,
    amb: 0x2a2438, fog: 0x1c1630, top: 0x0a0a24, mid: 0x2a1a44, horizon: 0x4a2a4a, lamp: 0.25, sunDisc: 0.25,
  },
  {
    hour: 24, sun: 0x1a2a4a, sunI: 0.15, hemiSky: 0x1a2440, hemiGround: 0x0a0a12, hemiI: 0.5,
    amb: 0x1a1a2a, fog: 0x0d0d1a, top: 0x050510, mid: 0x0d0d24, horizon: 0x1a1a3a, lamp: 0.35, sunDisc: 0.05,
  },
];

export function createWorld(THREE, seed) {
  T = THREE;
  const rng = new SeededRandom(seed === undefined ? CONFIG.WORLD_SEED : seed);
  const group = new THREE.Group();
  group.name = 'ViceHarborCity';

  const pitch = CONFIG.CITY_PITCH;
  const half = CONFIG.WORLD_SIZE / 2;
  const beachX0 = half;
  const boardX0 = beachX0 + 2;
  const boardX1 = boardX0 + CONFIG.BOARDWALK_WIDTH;
  const beachX1 = half + CONFIG.BEACH_WIDTH;
  const waterX1 = beachX1 + CONFIG.WATER_WIDTH;

  const colliders = [];
  const roads = [];
  const buildings = [];
  const boats = [];
  let lighthouseBeam = null;
  let ferrisWheel = null;

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const asphaltTex = texFromCanvas(paintAsphalt());
  const crossTex = texFromCanvas(paintCrossing());
  const paveTex = texFromCanvas(paintPaving());
  paveTex.repeat.set(8, 8);
  const sandTex = texFromCanvas(paintSand());
  sandTex.repeat.set(6, 24);
  const plankTex = texFromCanvas(paintPlanks());
  plankTex.repeat.set(2, 40);

  // ---- ground: dusk-olive grass base under the whole map ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(waterX1 + half + 40, CONFIG.WORLD_SIZE + 80),
    new THREE.MeshLambertMaterial({ color: CONFIG.GROUND_COLOR })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((waterX1 - half) / 2, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  // ---- roads: one long strip per grid line, both directions ----
  // Road centres sit in the middle of the gaps between blocks, at
  // -214 + 52*i. (An off-by-6 m placement would overlap the blocks on
  // one side and leave a grass strip on the other.)
  const roadLen = CONFIG.WORLD_SIZE + CONFIG.ROAD_WIDTH;
  for (let i = 0; i <= CONFIG.GRID_BLOCKS; i++) {
    const c = -half + i * pitch;
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.ROAD_WIDTH, roadLen),
      new THREE.MeshLambertMaterial({ map: asphaltTex.clone() }));
    ns.material.map.repeat.set(1, Math.round(roadLen / 12));
    ns.material.map.needsUpdate = true;
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(c, 0.02, 0);
    ns.receiveShadow = true;
    group.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, CONFIG.ROAD_WIDTH),
      new THREE.MeshLambertMaterial({ map: asphaltTex.clone() }));
    ew.material.map.repeat.set(Math.round(roadLen / 12), 1);
    ew.material.map.needsUpdate = true;
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.02, c);
    ew.receiveShadow = true;
    group.add(ew);
    roads.push({ x: c, z: 0, vertical: true });
    roads.push({ x: 0, z: c, vertical: false });
  }

  // ---- zebra crosswalks at every intersection ----
  const crossMat = new THREE.MeshLambertMaterial({ map: crossTex });
  for (let i = 0; i <= CONFIG.GRID_BLOCKS; i++) {
    for (let j = 0; j <= CONFIG.GRID_BLOCKS; j++) {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 11.5), crossMat);
      cross.rotation.x = -Math.PI / 2;
      cross.position.set(-half + i * pitch, 0.04, -half + j * pitch);
      cross.receiveShadow = true;
      group.add(cross);
    }
  }

  // ---- shared prop geometries / materials ----
  const paveMat = new THREE.MeshLambertMaterial({ map: paveTex });
  const curbMat = new THREE.MeshLambertMaterial({ color: 0xb9b2a4 });
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 2.6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const leafMat2 = new THREE.MeshLambertMaterial({ color: 0x6a9a3a });
  const leafMat3 = new THREE.MeshLambertMaterial({ color: 0x2e7d46 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7d46 });
  const lampPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const lampHeadGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poolGeo = new THREE.CircleGeometry(2.4, 12);
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xffc233, transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa5ad });
  const tankMat = new THREE.MeshLambertMaterial({ color: 0x8a6b4f });
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3e });
  const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xd23c2e });
  const plankMat = new THREE.MeshLambertMaterial({ map: plankTex });

  const facadeMats = [];
  for (let i = 0; i < WALL_COLORS.length; i++) {
    const tex = new THREE.CanvasTexture(paintFacade(rng, WALL_COLORS[i], 0.45 + rng.range(0, 0.25)));
    facadeMats.push(new THREE.MeshLambertMaterial({ map: tex }));
  }
  const neonMats = NEON_TEXTS.map((s) => {
    const tex = new THREE.CanvasTexture(paintNeon(s.text, s.color));
    return new THREE.MeshBasicMaterial({ map: tex });
  });
  const shopMats = SHOP_NAMES.map((s) => {
    const tex = new THREE.CanvasTexture(paintShopSign(s.name, s.bg, s.fg));
    return new THREE.MeshBasicMaterial({ map: tex });
  });
  // Graffiti tags for the shopfront walls: spray-paint words in bright
  // colours on a transparent decal, so the tag reads as paint on the
  // wall instead of a solid board.
  const GRAFFITI_TAGS = [
    ['HARBOR', '#ff4fd8'], ['VICE', '#3ce0ff'], ['KREW', '#ffd23c'],
    ['187', '#ff6b3c'], ['SOUTH', '#7dff5a'],
  ];
  const graffitiMats = GRAFFITI_TAGS.map(([word, color]) => {
    const tex = new THREE.CanvasTexture(paintGraffiti(word, color, rng));
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  });

  // A natural leafy tree: trunk + a cluster of three foliage blobs at
  // slightly different heights and offsets, so the canopy reads as a
  // tree instead of a ball on a stick.
  function makeLeafyTree(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.3;
    trunk.castShadow = true;
    g.add(trunk);
    const blobs = [
      [0, 3.4, 0, 1.7, leafMat],
      [0.9, 2.9, 0.4, 1.2, leafMat2],
      [-0.8, 3.0, -0.4, 1.15, leafMat3],
    ];
    for (const [bx, by, bz, r, m] of blobs) {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m);
      blob.scale.set(1, 0.8, 1);
      blob.position.set(bx, by, bz);
      blob.castShadow = true;
      g.add(blob);
    }
    g.position.set(x, 0, z);
    g.scale.setScalar(s || 1);
    return g;
  }

  // A palm: a leaning trunk with six drooping fronds and a coconut
  // cluster, so it reads as a palm from the street.
  function makePalm(x, z, lean) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.6;
    trunk.rotation.z = lean || 0;
    trunk.castShadow = true;
    g.add(trunk);
    const topY = 3.2;
    const topX = -(lean || 0) * 3.2;
    // A dark crown at the top anchors the fronds, so they read as a
    // palm head instead of loose sticks.
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), frondMat);
    crown.scale.set(1, 0.6, 1);
    crown.position.set(topX, topY, 0);
    g.add(crown);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      // Wide, short, steeply drooping fronds — narrow flat blades read
      // as crossed sticks from the street.
      const frond = new THREE.Mesh(boxGeo, frondMat);
      frond.scale.set(0.5, 0.06, 1.9);
      frond.position.set(topX + Math.sin(a) * 0.85, topY - 0.35, Math.cos(a) * 0.85);
      frond.rotation.y = a;
      frond.rotation.x = 0.9;
      frond.castShadow = true;
      g.add(frond);
    }
    const nuts = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0x8a6b3a }));
    nuts.position.set(topX, topY - 0.25, 0);
    g.add(nuts);
    g.position.set(x, 0, z);
    return g;
  }

  // A street lamp with a warm pool of light on the ground beneath it.
  function makeLamp(x, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
    pole.position.y = 2.6;
    pole.castShadow = true;
    g.add(pole);
    const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
    head.position.y = 5.3;
    g.add(head);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.06;
    g.add(pool);
    g.position.set(x, 0, z);
    return g;
  }

  // Traffic-light kit: pole, arm, and a head with red/amber/green lamps.
  function makeSignal(x, z, rotY, greenOn) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.6, 6), lampPoleMat);
    pole.position.y = 2.8;
    pole.castShadow = true;
    g.add(pole);
    const arm = new THREE.Mesh(boxGeo, lampPoleMat);
    arm.scale.set(3.4, 0.14, 0.14);
    arm.position.set(1.7, 5.4, 0);
    g.add(arm);
    const head = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x1c1e20 }));
    head.scale.set(0.5, 1.4, 0.5);
    head.position.set(3.2, 4.9, 0);
    g.add(head);
    const lampCols = [0xff2e2e, 0xffc233, 0x2fd35a];
    for (let i = 0; i < 3; i++) {
      const lit = (i === 2 && greenOn) || (i === 0 && !greenOn);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: lit ? lampCols[i] : 0x331111 })
      );
      lamp.position.set(3.2, 5.35 - i * 0.45, 0.26);
      g.add(lamp);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  }

  // A park bench: seat, back, two legs.
  function makeBench(x, z, rotY) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(boxGeo, benchMat);
    seat.scale.set(2.0, 0.12, 0.55);
    seat.position.y = 0.45;
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(boxGeo, benchMat);
    back.scale.set(2.0, 0.55, 0.1);
    back.position.set(0, 0.8, -0.26);
    g.add(back);
    for (const sx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(boxGeo, lampPoleMat);
      leg.scale.set(0.1, 0.45, 0.5);
      leg.position.set(sx, 0.22, 0);
      g.add(leg);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  }

  // A bus shelter: glass back, roof, bench.
  function makeShelter(x, z, rotY) {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.35,
    }));
    glass.scale.set(3.2, 2.2, 0.1);
    glass.position.set(0, 1.3, -0.8);
    g.add(glass);
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(3.6, 0.14, 2.0);
    roof.position.set(0, 2.5, 0);
    roof.castShadow = true;
    g.add(roof);
    const seat = new THREE.Mesh(boxGeo, benchMat);
    seat.scale.set(2.6, 0.12, 0.5);
    seat.position.set(0, 0.5, -0.5);
    g.add(seat);
    for (const sx of [-1.6, 1.6]) {
      const post = new THREE.Mesh(boxGeo, lampPoleMat);
      post.scale.set(0.12, 2.5, 0.12);
      post.position.set(sx, 1.25, 0.8);
      g.add(post);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  }

  // A street-name blade on a pole at an intersection corner.
  function makeStreetBlade(x, z, rotY, name) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), lampPoleMat);
    pole.position.y = 1.7;
    pole.castShadow = true;
    g.add(pole);
    const tex = new THREE.CanvasTexture(paintStreetBlade(name));
    const blade = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.65),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    blade.position.y = 3.2;
    g.add(blade);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  }

  // A STOP sign on a pole at an intersection corner.
  function makeStopSign(x, z, rotY) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), lampPoleMat);
    pole.position.y = 1.3;
    g.add(pole);
    const tex = new THREE.CanvasTexture(paintStop());
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    face.position.y = 2.9;
    g.add(face);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    return g;
  }

  // A boardwalk food stall: counter, striped awning, glowing sign.
  function makeStall(stall, x) {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    counter.scale.set(3.4, 1.1, 2.0);
    counter.position.y = 0.55;
    counter.castShadow = true;
    g.add(counter);
    const awnTex = new THREE.CanvasTexture(paintAwning(stall.bg, '#f2ede2'));
    const awning = new THREE.Mesh(
      new THREE.PlaneGeometry(3.8, 1.1),
      new THREE.MeshBasicMaterial({ map: awnTex, side: THREE.DoubleSide })
    );
    awning.position.set(0, 2.6, 1.1);
    awning.rotation.x = -0.5;
    g.add(awning);
    for (const px of [-1.7, 1.7]) {
      const post = new THREE.Mesh(boxGeo, lampPoleMat);
      post.scale.set(0.1, 2.6, 0.1);
      post.position.set(px, 1.3, 1.0);
      g.add(post);
    }
    const signTex = new THREE.CanvasTexture(paintShopSign(stall.name, stall.bg, stall.fg));
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.6),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    sign.position.set(0, 3.1, 0.4);
    g.add(sign);
    g.position.set(x, 0, stall.z);
    g.rotation.y = -Math.PI / 2;
    return g;
  }

  // The ferris wheel: two A-frame legs, a hub, a rim with spokes, and
  // eight gondolas that stay upright as the wheel turns. The wheel group
  // is returned so tick() can rotate it.
  function makeFerrisWheel(x, z) {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xd23c2e });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0xffd23c });
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x3ce0ff });
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(boxGeo, frameMat);
      leg.scale.set(0.5, 13, 0.5);
      leg.position.set(sx * 3.4, 6.5, 0);
      leg.rotation.z = -sx * 0.28;
      leg.castShadow = true;
      g.add(leg);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 8.4, 8), lampPoleMat);
    axle.rotation.x = Math.PI / 2;
    axle.position.y = 13;
    g.add(axle);
    const wheel = new THREE.Group();
    wheel.position.y = 13;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(11, 0.28, 8, 32), rimMat);
    wheel.add(rim);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(boxGeo, rimMat);
      spoke.scale.set(0.22, 22, 0.22);
      spoke.rotation.z = a;
      wheel.add(spoke);
      const cabin = new THREE.Group();
      const cab = new THREE.Mesh(boxGeo, cabinMat);
      cab.scale.set(1.6, 1.4, 1.4);
      cab.castShadow = true;
      cabin.add(cab);
      const hanger = new THREE.Mesh(boxGeo, lampPoleMat);
      hanger.scale.set(0.12, 1.0, 0.12);
      hanger.position.y = 1.1;
      cabin.add(hanger);
      cabin.position.set(Math.sin(a) * 11, Math.cos(a) * 11, 0);
      wheel.add(cabin);
      cabin.userData.wheelAngle = a;
    }
    g.add(wheel);
    g.position.set(x, 0, z);
    g.userData.wheel = wheel;
    return g;
  }

  // ---- blocks: sidewalks, buildings, rooftops, props ----
  let landmarkIndex = 0;
  for (let bx = 0; bx < CONFIG.GRID_BLOCKS; bx++) {
    for (let bz = 0; bz < CONFIG.GRID_BLOCKS; bz++) {
      const cx = -half + CONFIG.ROAD_WIDTH / 2 + bx * pitch + CONFIG.BLOCK_SIZE / 2;
      const cz = -half + CONFIG.ROAD_WIDTH / 2 + bz * pitch + CONFIG.BLOCK_SIZE / 2;
      const slab = new THREE.Mesh(boxGeo, paveMat);
      slab.scale.set(CONFIG.BLOCK_SIZE + 2, 0.3, CONFIG.BLOCK_SIZE + 2);
      slab.position.set(cx, 0.15, cz);
      slab.receiveShadow = true;
      group.add(slab);
      // Pale curb frame around the sidewalk slab, so the pavement reads
      // as raised from the road instead of a flat colour change.
      const curbLen = CONFIG.BLOCK_SIZE + 2;
      for (const [cw, cd, ox, oz] of [
        [curbLen, 0.5, 0, -curbLen / 2], [curbLen, 0.5, 0, curbLen / 2],
        [0.5, curbLen, -curbLen / 2, 0], [0.5, curbLen, curbLen / 2, 0],
      ]) {
        const curb = new THREE.Mesh(boxGeo, curbMat);
        curb.scale.set(cw || 0.5, 0.42, cd || 0.5);
        curb.position.set(cx + ox, 0.21, cz + oz);
        group.add(curb);
      }

      // Two to four buildings per block, in three height bands: low
      // shopfronts, mid-rise blocks, and the odd tower — so the skyline
      // steps instead of marching in a flat row.
      const count = rng.int(2, 4);
      const spots = rng.shuffle([
        [-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22],
      ]).slice(0, count);
      for (const [ox, oz] of spots) {
        const w = rng.range(8, 14);
        const d = rng.range(8, 14);
        const band = rng.range(0, 1);
        let h;
        let isLandmark = false;
        if (band < 0.42) {
          h = rng.range(4, 9); // low shopfront
        } else if (band < 0.85) {
          h = rng.range(10, 22); // mid-rise
        } else {
          h = rng.range(28, 46); // tower
          isLandmark = rng.chance(0.2);
        }
        const mat = facadeMats[rng.int(0, facadeMats.length - 1)];
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d);
        b.position.set(cx + ox * CONFIG.BLOCK_SIZE, h / 2 + 0.3, cz + oz * CONFIG.BLOCK_SIZE);
        b.castShadow = true;
        b.receiveShadow = true;
        group.add(b);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.4, 0.4, d + 0.4);
        roof.position.set(b.position.x, h + 0.5, b.position.z);
        roof.castShadow = true;
        group.add(roof);
        // Stepped towers: a smaller top storey, so the skyline is not a
        // row of flat slabs.
        if (h > 26) {
          const top = new THREE.Mesh(boxGeo, mat);
          top.scale.set(w * 0.6, rng.range(4, 7), d * 0.6);
          top.position.set(b.position.x, h + 0.7 + top.scale.y / 2, b.position.z);
          top.castShadow = true;
          group.add(top);
          const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 6, 5), lampPoleMat);
          antenna.position.set(b.position.x + w * 0.2, h + top.scale.y + 3.4, b.position.z);
          group.add(antenna);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xff2e2e }));
          tip.position.set(b.position.x + w * 0.2, h + top.scale.y + 6.5, b.position.z);
          group.add(tip);
        } else if (rng.chance(0.55)) {
          // Rooftop clutter on ordinary buildings: AC box or water tower.
          if (rng.chance(0.5)) {
            const ac = new THREE.Mesh(boxGeo, acMat);
            ac.scale.set(rng.range(1.4, 2.4), 0.9, rng.range(1.2, 2));
            ac.position.set(
              b.position.x + rng.range(-w / 4, w / 4),
              h + 1.15,
              b.position.z + rng.range(-d / 4, d / 4)
            );
            ac.castShadow = true;
            group.add(ac);
          } else {
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10), tankMat);
            tank.position.set(b.position.x, h + 1.8, b.position.z);
            tank.castShadow = true;
            group.add(tank);
            const cone = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.1, 10), roofMat);
            cone.position.set(b.position.x, h + 3.4, b.position.z);
            group.add(cone);
          }
        }
        // BIG shop sign on the street face of low shopfronts — the name
        // reads from across the road.
        if (h <= 9) {
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(w * 0.95, 11), 1.9),
            shopMats[rng.int(0, shopMats.length - 1)]
          );
          sign.position.set(b.position.x, 3.4, b.position.z + d / 2 + 0.06);
          group.add(sign);
          // A graffiti tag low on the same wall, like the reference's
          // tagged tiled wall — spray paint on the brick, not a board.
          if (rng.chance(0.55)) {
            const tag = new THREE.Mesh(
              new THREE.PlaneGeometry(Math.min(w * 0.6, 6), 3),
              graffitiMats[rng.int(0, graffitiMats.length - 1)]
            );
            tag.position.set(
              b.position.x + rng.range(-w / 4, w / 4),
              1.5,
              b.position.z + d / 2 + 0.07
            );
            group.add(tag);
          }
        } else if (h > 10 && rng.chance(0.5)) {
          // Neon sign on the street face of taller buildings.
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(w * 0.9, 10), 2.4),
            neonMats[rng.int(0, neonMats.length - 1)]
          );
          sign.position.set(b.position.x, h * 0.82, b.position.z + d / 2 + 0.06);
          group.add(sign);
        }
        // Landmark name plate on the tallest towers.
        if (isLandmark && landmarkIndex < LANDMARK_NAMES.length) {
          const tex = new THREE.CanvasTexture(paintNeon(LANDMARK_NAMES[landmarkIndex], '#ffd23c'));
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

      // One palm on one corner of the block, one leafy tree in the
      // courtyard gap, and two street lamps with warm light pools so
      // the streets are lit on both sides at dusk.
      const corner = rng.choice([[-1, -1], [1, -1], [-1, 1], [1, 1]]);
      const px = cx + corner[0] * (CONFIG.BLOCK_SIZE / 2 - 2);
      const pz = cz + corner[1] * (CONFIG.BLOCK_SIZE / 2 - 2);
      group.add(makePalm(px, pz, rng.range(-0.1, 0.1)));
      for (const [lx, lz] of [
        [cx - corner[0] * (CONFIG.BLOCK_SIZE / 2 - 2), cz - corner[1] * (CONFIG.BLOCK_SIZE / 2 - 2)],
        [cx + corner[0] * (CONFIG.BLOCK_SIZE / 2 - 2), cz - corner[1] * (CONFIG.BLOCK_SIZE / 2 - 2)],
      ]) {
        group.add(makeLamp(lx, lz));
      }
      // A leafy tree in the courtyard gap of some blocks.
      if (rng.chance(0.5)) {
        group.add(makeLeafyTree(
          cx + rng.range(-8, 8),
          cz + rng.range(-8, 8),
          rng.range(0.9, 1.25)
        ));
      }
      // A bench on the sidewalk of some blocks, facing the road.
      if (rng.chance(0.3)) {
        group.add(makeBench(
          cx + rng.choice([-1, 1]) * (CONFIG.BLOCK_SIZE / 2 - 1.5),
          cz + rng.range(-12, 12),
          rng.choice([0, Math.PI / 2, Math.PI, -Math.PI / 2])
        ));
      }
      // A red hydrant on a corner of some blocks.
      if (rng.chance(0.25)) {
        const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), hydrantMat);
        hyd.position.set(
          cx + rng.choice([-1, 1]) * (CONFIG.BLOCK_SIZE / 2 - 3),
          0.65,
          cz + rng.choice([-1, 1]) * (CONFIG.BLOCK_SIZE / 2 - 3)
        );
        group.add(hyd);
      }
    }
  }

  // ---- traffic lights at the busiest central intersections ----
  const lightSpots = [
    [-110, -58, 0, true], [-58, -110, Math.PI / 2, false],
    [46, -58, Math.PI, true], [98, 46, -Math.PI / 2, false],
    [-6, 98, 0, true], [-58, 46, Math.PI / 2, false],
    [46, 98, Math.PI, true], [98, -110, -Math.PI / 2, false],
    [-162, 46, 0, true], [-110, 150, Math.PI / 2, false],
    [150, -58, Math.PI, true], [-6, -162, -Math.PI / 2, false],
  ];
  for (const [lx, lz, rot, green] of lightSpots) {
    group.add(makeSignal(lx + 7, lz + 7, rot, green));
  }

  // ---- street-name blades + STOP signs at four central corners ----
  const signSpots = [
    [-58, -58, 'OCEAN DR', 0], [46, -58, 'HARBOR AVE', Math.PI / 2],
    [-58, 46, 'PALM ST', Math.PI], [46, 46, 'SUNSET BLVD', -Math.PI / 2],
  ];
  for (const [sx, sz, name, rot] of signSpots) {
    group.add(makeStreetBlade(sx + 7.5, sz + 7.5, rot, name));
    group.add(makeStopSign(sx - 7.5, sz + 7.5, rot + Math.PI / 2));
  }

  // ---- bus shelters along the main roads ----
  group.add(makeShelter(-58 + 4.5, -110 - 4.5, 0));
  group.add(makeShelter(46 - 4.5, 46 + 4.5, Math.PI));
  group.add(makeShelter(98 + 4.5, -6 - 4.5, Math.PI / 2));
  group.add(makeShelter(-110 - 4.5, 98 + 4.5, -Math.PI / 2));

  // ---- roadside billboards ----
  for (const bb of ADVERTS) {
    const board = new THREE.Group();
    const tex = new THREE.CanvasTexture(paintBillboard(bb.headline, bb.subline, bb.bg, bb.fg));
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 8),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    face.position.y = 9;
    face.castShadow = true;
    board.add(face);
    const back = new THREE.Mesh(boxGeo, roofMat);
    back.scale.set(16.4, 8.4, 0.3);
    back.position.y = 9;
    back.position.z = -0.2;
    board.add(back);
    for (const sx of [-6, 6]) {
      const leg = new THREE.Mesh(boxGeo, lampPoleMat);
      leg.scale.set(0.5, 5.5, 0.5);
      leg.position.set(sx, 2.75, -0.2);
      board.add(leg);
    }
    board.position.set(bb.x, 0, bb.z);
    board.rotation.y = bb.rot;
    group.add(board);
    colliders.push({
      minX: bb.x - 1, maxX: bb.x + 1, minZ: bb.z - 1, maxZ: bb.z + 1,
    });
  }

  // ---- beach strip + water (east edge) ----
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.BEACH_WIDTH, CONFIG.WORLD_SIZE + 40),
    new THREE.MeshLambertMaterial({ map: sandTex })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set((beachX0 + beachX1) / 2, 0.03, 0);
  sand.receiveShadow = true;
  group.add(sand);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.WATER_WIDTH, CONFIG.WORLD_SIZE + 120),
    new THREE.MeshLambertMaterial({ color: CONFIG.WATER_COLOR, transparent: true, opacity: 0.9 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((beachX1 + waterX1) / 2, 0.01, 0);
  group.add(water);

  // Sun streak on the water: a long additive glow under the sunset.
  const streak = new THREE.Mesh(
    new THREE.PlaneGeometry(88, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff9d4d, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  streak.rotation.x = -Math.PI / 2;
  streak.position.set(beachX1 + 44, 0.06, 120);
  group.add(streak);

  // Palms along the beach.
  for (let i = 0; i < 14; i++) {
    const z = -CONFIG.WORLD_SIZE / 2 + 20 + i * (CONFIG.WORLD_SIZE / 13);
    const x = beachX0 + 4 + rng.range(0, 6);
    group.add(makePalm(x, z, rng.range(-0.12, 0.12)));
  }

  // Beach umbrellas: striped cones on poles.
  const umbrellaMat = new THREE.MeshLambertMaterial({ color: 0xff6b3c, side: THREE.DoubleSide });
  const umbrellaMat2 = new THREE.MeshLambertMaterial({ color: 0x3ce0ff, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const z = -160 + i * 44 + rng.range(-6, 6);
    const x = beachX0 + 9 + rng.range(0, 8);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5), trunkMat);
    pole.position.set(x, 1.1, z);
    group.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.9, 8), i % 2 ? umbrellaMat : umbrellaMat2);
    canopy.position.set(x, 2.5, z);
    canopy.castShadow = true;
    group.add(canopy);
  }

  // ---- boardwalk district: plank deck, food stalls, lamps, benches ----
  const walkDeck = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.BOARDWALK_WIDTH, CONFIG.WORLD_SIZE + 20),
    new THREE.MeshLambertMaterial({ map: plankTex })
  );
  walkDeck.rotation.x = -Math.PI / 2;
  walkDeck.position.set((boardX0 + boardX1) / 2, 0.08, 0);
  walkDeck.receiveShadow = true;
  group.add(walkDeck);
  // Support posts under the deck edge, every 24 m.
  for (let z = -200; z <= 200; z += 24) {
    for (const px of [boardX0 + 0.4, boardX1 - 0.4]) {
      const post = new THREE.Mesh(boxGeo, benchMat);
      post.scale.set(0.3, 0.5, 0.3);
      post.position.set(px, 0.05, z);
      group.add(post);
    }
  }
  // Food stalls along the walk, signs facing the beach.
  const stallX = (boardX0 + boardX1) / 2;
  for (const stall of STALLS) {
    group.add(makeStall(stall, stallX));
    colliders.push({
      minX: stallX - 2, maxX: stallX + 2,
      minZ: stall.z - 1.4, maxZ: stall.z + 1.4,
    });
  }
  // Lamps and benches on the boardwalk, so it glows at night.
  for (let z = -180; z <= 180; z += 45) {
    group.add(makeLamp(boardX0 + 1.2, z));
    if (z % 90 === 0) group.add(makeBench(boardX1 - 1.6, z + 12, Math.PI / 2));
  }

  // ---- ferris wheel on the sand beside the boardwalk ----
  const wheelGroup = makeFerrisWheel(beachX0 + 20, -60);
  ferrisWheel = wheelGroup.userData.wheel;
  group.add(wheelGroup);
  colliders.push({
    minX: beachX0 + 20 - 4, maxX: beachX0 + 20 + 4,
    minZ: -60 - 4, maxZ: -60 + 4,
  });
  // A small arcade hut next to the wheel.
  const arcade = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x2a0a3a }));
  arcade.scale.set(8, 5, 6);
  arcade.position.set(beachX0 + 18, 2.5, -34);
  arcade.castShadow = true;
  group.add(arcade);
  const arcadeSign = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 1.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(paintNeon('ARCADE', '#ff4fd8')) })
  );
  arcadeSign.position.set(beachX0 + 18, 4.4, -37.1);
  arcadeSign.rotation.y = Math.PI;
  group.add(arcadeSign);
  colliders.push({
    minX: beachX0 + 18 - 4, maxX: beachX0 + 18 + 4,
    minZ: -34 - 3, maxZ: -34 + 3,
  });

  // ---- boats bobbing on the water (east of the beach) ----
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e6df });
  const hullMat2 = new THREE.MeshLambertMaterial({ color: 0x2e6fd2 });
  const sailMat = new THREE.MeshLambertMaterial({ color: 0xfff3c4, side: THREE.DoubleSide });
  const mastMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  const boatSpots = [
    { x: beachX1 + 26, z: -84, hull: hullMat, sail: true },
    { x: beachX1 + 48, z: 12, hull: hullMat2, sail: false },
    { x: beachX1 + 34, z: 96, hull: hullMat, sail: true },
    { x: beachX1 + 60, z: -150, hull: hullMat2, sail: true },
    { x: beachX1 + 20, z: 150, hull: hullMat, sail: false },
  ];
  for (let i = 0; i < boatSpots.length; i++) {
    const spot = boatSpots[i];
    const boat = new THREE.Group();
    boat.name = 'boat';
    const hull = new THREE.Mesh(boxGeo, spot.hull);
    hull.scale.set(6.5, 1.1, 2.4);
    hull.position.y = 0.4;
    hull.castShadow = true;
    boat.add(hull);
    const cabin = new THREE.Mesh(boxGeo, mastMat);
    cabin.scale.set(2.2, 0.9, 1.6);
    cabin.position.set(-0.8, 1.3, 0);
    boat.add(cabin);
    if (spot.sail) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.4, 6), mastMat);
      mast.position.set(0.6, 3.4, 0);
      boat.add(mast);
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

  // ---- marina: a second pier with moored boats in slips ----
  const marina = new THREE.Group();
  const marinaDeck = new THREE.Mesh(boxGeo, benchMat);
  marinaDeck.scale.set(34, 0.5, 6);
  marinaDeck.position.set(beachX1 + 17, 0.6, -120);
  marinaDeck.castShadow = true;
  marinaDeck.receiveShadow = true;
  marina.add(marinaDeck);
  for (let i = 0; i < 5; i++) {
    const post = new THREE.Mesh(boxGeo, benchMat);
    post.scale.set(0.5, 1.4, 0.5);
    post.position.set(beachX1 + 4 + i * 7, 0, -120 + (i % 2 === 0 ? 2.6 : -2.6));
    marina.add(post);
  }
  group.add(marina);
  // Two moored boats in the marina slips.
  for (let i = 0; i < 2; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(boxGeo, i === 0 ? hullMat : hullMat2);
    hull.scale.set(5.5, 1.0, 2.2);
    hull.position.y = 0.4;
    hull.castShadow = true;
    boat.add(hull);
    const cabin = new THREE.Mesh(boxGeo, mastMat);
    cabin.scale.set(1.8, 0.8, 1.4);
    cabin.position.set(-0.6, 1.2, 0);
    boat.add(cabin);
    boat.position.set(beachX1 + 12 + i * 14, 0.15, -120 + (i % 2 === 0 ? 5 : -5));
    boat.rotation.y = Math.PI / 2;
    group.add(boat);
    boats.push({ mesh: boat, baseY: 0.15, phase: 5 + i * 1.7 });
  }

  // ---- pier jutting into the water ----
  const pier = new THREE.Group();
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x7a5c3e });
  const pierDeck = new THREE.Mesh(boxGeo, pierMat);
  pierDeck.scale.set(46, 0.5, 8);
  pierDeck.position.set(beachX1 + 23, 0.6, 30);
  pierDeck.castShadow = true;
  pierDeck.receiveShadow = true;
  pier.add(pierDeck);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(boxGeo, pierMat);
    post.scale.set(0.6, 1.4, 0.6);
    post.position.set(beachX1 + 4 + i * 8, 0, 30 + (i % 2 === 0 ? 3.4 : -3.4));
    pier.add(post);
  }
  const shack = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xd8cfc0 }));
  shack.scale.set(5, 3.4, 4);
  shack.position.set(beachX1 + 42, 2.3, 30);
  shack.castShadow = true;
  pier.add(shack);
  const shackSign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 1.1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(paintNeon('PIER', '#3ce0ff')) })
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
  tower.castShadow = true;
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
  const beamGeo = new THREE.ConeGeometry(3.2, 26, 12, 1, true);
  beamGeo.translate(0, -13, 0);
  lighthouseBeam = new THREE.Mesh(beamGeo, beamMat);
  lighthouseBeam.rotation.z = Math.PI / 2;
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

  // ---- clouds: thin, warm, low — dusk clouds, not cartoon puffs ----
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffd9c0, transparent: true, opacity: 0.26 });
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const puffs = rng.int(3, 5);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.scale.set(rng.range(10, 20), rng.range(1.4, 2.4), rng.range(5, 8));
      puff.position.set(p * rng.range(8, 12) - puffs * 5, rng.range(-0.8, 0.8), rng.range(-3, 3));
      cloud.add(puff);
    }
    cloud.position.set(rng.range(-half - 60, waterX1), rng.range(48, 68), rng.range(-half - 40, half + 40));
    group.add(cloud);
    clouds.push({ mesh: cloud, drift: rng.range(0.4, 1.1) });
  }

  // ---- dusk sky dome (smooth three-stop gradient) + sun disc + glow ----
  // The sun sits EAST over the water, low: the drive and chase cameras
  // face east, so they look straight into the sunset instead of a flat
  // red band. Violet on top, a magenta band, then burnt orange at the
  // horizon — a smooth blend, no hard line.
  const skyGeo = new THREE.SphereGeometry(560, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x1c1440) },
      mid: { value: new THREE.Color(0x8a3a6e) },
      horizon: { value: new THREE.Color(0xff7a3d) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vP; void main(){ float t = clamp(normalize(vP).y * 1.7 + 0.1, 0.0, 1.0); vec3 c = t < 0.42 ? mix(horizon, mid, t / 0.42) : mix(mid, top, (t - 0.42) / 0.58); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.position.set(0, 0, 0);
  group.add(sky);

  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 1 });
  const sun = new THREE.Mesh(new THREE.CircleGeometry(20, 24), sunMat);
  sun.position.set(300, 34, 120);
  sun.lookAt(0, 20, 0);
  group.add(sun);
  const glowMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(paintGlow()),
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(230, 230, 1);
  glow.position.set(300, 34, 120);
  group.add(glow);

  // ---- lighting (sunlight comes from the east, over the water) ----
  // The sun casts real shadows — long dusk shadows from the buildings
  // are half the San Andreas look.
  const hemi = new THREE.HemisphereLight(CONFIG.HEMI_SKY, CONFIG.HEMI_GROUND, CONFIG.HEMI_INTENSITY);
  group.add(hemi);
  const sunLight = new THREE.DirectionalLight(CONFIG.SUN_COLOR, CONFIG.SUN_INTENSITY);
  sunLight.position.set(160, 90, 80);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -260;
  sunLight.shadow.camera.right = 260;
  sunLight.shadow.camera.top = 260;
  sunLight.shadow.camera.bottom = -260;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 520;
  sunLight.shadow.bias = -0.0006;
  group.add(sunLight);
  group.add(sunLight.target);
  const amb = new THREE.AmbientLight(CONFIG.AMBIENT, 0.6);
  group.add(amb);

  // ---- day/night: setHour(hour) lerps the lighting rig between stops ----
  const _c1 = new THREE.Color();
  const _c2 = new THREE.Color();
  function lerpColor(hexA, hexB, t, target) {
    _c1.set(hexA);
    _c2.set(hexB);
    target.copy(_c1).lerp(_c2, t);
    return target;
  }
  function setHour(hour, scene) {
    const h = ((hour % 24) + 24) % 24;
    let a = DAY_STOPS[DAY_STOPS.length - 1];
    let b = DAY_STOPS[0];
    for (let i = 0; i < DAY_STOPS.length - 1; i++) {
      if (h >= DAY_STOPS[i].hour && h <= DAY_STOPS[i + 1].hour) {
        a = DAY_STOPS[i];
        b = DAY_STOPS[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, b.hour - a.hour);
    const t = Math.min(1, Math.max(0, (h - a.hour) / span));
    lerpColor(a.sun, b.sun, t, sunLight.color);
    sunLight.intensity = a.sunI + (b.sunI - a.sunI) * t;
    lerpColor(a.hemiSky, b.hemiSky, t, hemi.color);
    lerpColor(a.hemiGround, b.hemiGround, t, hemi.groundColor);
    hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * t;
    lerpColor(a.amb, b.amb, t, amb.color);
    if (scene && scene.fog) lerpColor(a.fog, b.fog, t, scene.fog.color);
    lerpColor(a.top, b.top, t, skyMat.uniforms.top.value);
    lerpColor(a.mid, b.mid, t, skyMat.uniforms.mid.value);
    lerpColor(a.horizon, b.horizon, t, skyMat.uniforms.horizon.value);
    poolMat.opacity = a.lamp + (b.lamp - a.lamp) * t;
    const disc = a.sunDisc + (b.sunDisc - a.sunDisc) * t;
    sunMat.opacity = disc;
    glowMat.opacity = disc;
    streak.material.opacity = 0.28 * disc;
    return h;
  }
  // Start at dusk (18:30), the game's signature look.
  setHour(CONFIG.DAY_START_HOUR, null);

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

  // ---- jump pads ----
  // Two glowing launch pads sit flat on the grid, one on a north-south
  // road and one on an east-west road, so the player meets one whichever
  // way they drive. A pad is a low orange ramp strip with three white
  // chevrons pointing the launch direction; driving over it at any speed
  // throws the car into the air (main.js does the vertical physics and
  // pays the stunt). The pads pulse in tick() so they read from afar.
  const jumpPads = [];
  const padDefs = [
    { x: roadC(2), z: roadC(5), alongX: false },
    { x: roadC(5), z: roadC(3), alongX: true },
  ];
  const padMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 0.9, roughness: 0.4 });
  const chevronMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.5, roughness: 0.5 });
  for (const def of padDefs) {
    const pad = new THREE.Group();
    const strip = new THREE.Mesh(new THREE.BoxGeometry(def.alongX ? 3 : 8, 0.18, def.alongX ? 8 : 3), padMat);
    strip.position.y = 0.09;
    pad.add(strip);
    // Three chevrons across the strip, pointing the launch direction.
    for (let c = -1; c <= 1; c++) {
      const chev = new THREE.Mesh(new THREE.BoxGeometry(def.alongX ? 0.5 : 1.6, 0.08, def.alongX ? 1.6 : 0.5), chevronMat);
      chev.position.set(def.alongX ? c * 0.9 : c * 2.2, 0.22, def.alongX ? c * 2.2 : c * 0.9);
      chev.rotation.y = def.alongX ? Math.PI / 4 : -Math.PI / 4;
      pad.add(chev);
    }
    // A low lip at the far edge so the pad reads as a ramp, not a plate.
    const lip = new THREE.Mesh(new THREE.BoxGeometry(def.alongX ? 0.4 : 8, 0.5, def.alongX ? 8 : 0.4), padMat);
    lip.position.set(def.alongX ? 1.4 : 0, 0.25, def.alongX ? 0 : 1.4);
    pad.add(lip);
    pad.position.set(def.x, 0, def.z);
    group.add(pad);
    jumpPads.push({ x: def.x, z: def.z, radius: 4.5, mesh: pad, mat: padMat });
  }

  const bounds = {
    minX: -half - CONFIG.ROAD_WIDTH,
    maxX: waterX1 - 6,
    minZ: -half - CONFIG.ROAD_WIDTH,
    maxZ: half + CONFIG.ROAD_WIDTH,
  };

  // Animate the harbour: boats bob on the swell, the lighthouse beam
  // sweeps, the ferris wheel turns, and the clouds drift east.
  function tick(dt, time) {
    if (!dt) return;
    for (const b of boats) {
      b.mesh.position.y = b.baseY + Math.sin(time * 0.7 + b.phase) * 0.12;
      b.mesh.rotation.z = Math.sin(time * 0.5 + b.phase) * 0.03;
      b.mesh.rotation.x = Math.sin(time * 0.6 + b.phase * 1.3) * 0.02;
    }
    if (lighthouseBeam) lighthouseBeam.rotation.y = time * 0.35;
    if (ferrisWheel) {
      ferrisWheel.rotation.z = time * 0.12;
      // Gondolas stay upright: counter-rotate each cabin.
      for (const child of ferrisWheel.children) {
        if (child.userData && child.userData.wheelAngle !== undefined) {
          child.rotation.z = -time * 0.12;
        }
      }
    }
    for (const c of clouds) {
      c.mesh.position.x += c.drift * dt;
      if (c.mesh.position.x > waterX1 + 80) c.mesh.position.x = -half - 80;
    }
    // The jump pads breathe: their glow swells and fades so a driver
    // spots them a block away at dusk.
    for (const pad of jumpPads) {
      pad.mat.emissiveIntensity = 0.7 + Math.sin(time * 3 + pad.x) * 0.35;
    }
  }

  return { group, roads, buildings, colliders, spawnPoints, bounds, rng, boats, lighthouseBeam, tick, setHour, jumpPads };
}
