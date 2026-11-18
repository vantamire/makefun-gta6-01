// VICE HARBOR v7 — the city, built again from scratch.
// A deterministic harbor city on a 9-by-9 block grid: 36 m blocks,
// 12 m streets, 48 m pitch, 444 m across. Five quarters share the
// grid — tower downtown in the middle, container yards to the north,
// low houses to the south, beach shops along the east edge, and the
// casino strip crowning the north side — and past the east edge lie
// sand, the boardwalk, the sea, the pier, the marina and a little
// airstrip tucked into the north-west corner. Facades are painted on
// canvas (graffiti, shopfronts, billboards, neon), the streets carry
// lamps, hydrants, dumpsters, benches and booths, and two jump pads
// glow on the grid. A walk-in carport garage sits among the south
// houses. The clock drives the sun, the sky and the lamps.
//
// Everything below is written as small builders that share one
// context object, so each quarter can be read on its own. The map
// object returned at the end is what the rest of the game reads:
// road lines, collision circles, quarter helpers, jump pads, and the
// clock.

import { CFG } from './settings.js';
import { Rng, clamp, lerp } from './rng.js';

const GRID = CFG.GRID_BLOCKS;
const BLK_M = CFG.BLOCK_M;
const RD_M = CFG.ROAD_M;
const STEP_M = CFG.GRID_PITCH;
const SPAN = CFG.CITY_SPAN / 2;
const SAND_W = CFG.SAND_M;
const BOARD_W = CFG.WALK_M;

const GRAFFITI = ['HARBOR', 'VICE', 'KREW', '187', 'SOUTH', 'PIER 9', 'DOCK', 'NOVA', 'ANCHOR', 'GOLD'];
const SHOPS = ['TACOS', 'PIZZA', '24H MART', 'DONUTS', 'BAR', 'BURGER', 'LAUNDRY', 'PAWN', 'SUSHI', 'GYM'];
const ADS = ['VICE COLA', 'PIER 9', 'TAXI', 'SUNSET FM', 'HARBOR BANK', 'MOTO X', 'GOLDEN ANCHOR'];
const GLOW_WORDS = ['OPEN', 'EAT', '24H', 'BAR', 'HOTEL', 'CLUB', 'SLOTS', 'WIN'];

// Road centre lines: -SPAN + k*STEP_M for k = 0..GRID.
export function streetLines() {
  const out = [];
  for (let k = 0; k <= GRID; k++) out.push(-SPAN + k * STEP_M);
  return out;
}

// Paint a canvas and turn it into a texture.
function makeTex(T, w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Scale a hex colour toward black by f.
function shade(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// A building face: wall colour, lit and dark windows, and a shopfront
// or a graffiti tag near the ground floor.
function facadeTex(T, rng, base, tag, sign) {
  return makeTex(T, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = shade(base, 1);
    ctx.fillRect(0, 0, w, h);
    // Weathering: faint vertical streaks down the wall.
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + rng.next() * 0.06})`;
      ctx.fillRect(rng.next() * w, 0, 2 + rng.next() * 5, h);
    }
    // Windows: 6 across, 8 down, some lit warm.
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 14 + col * 40;
        const y = 12 + row * 30;
        ctx.fillStyle = rng.next() < 0.42 ? '#ffd98a' : '#20242e';
        ctx.fillRect(x, y, 24, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(x, y, 24, 3);
      }
    }
    // Ground floor: a shopfront, or a tag sprayed on the wall.
    if (sign) {
      ctx.fillStyle = '#101018';
      ctx.fillRect(8, h - 52, w - 16, 44);
      ctx.fillStyle = rng.next() < 0.5 ? '#ffd23c' : '#ff5a8a';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(sign, w / 2, h - 20);
    } else if (tag) {
      ctx.save();
      ctx.translate(20 + rng.next() * 60, 60 + rng.next() * 120);
      ctx.rotate((rng.next() - 0.5) * 0.25);
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = rng.pick(['#ff4fd8', '#7dff9e', '#4dc9ff', '#ffd23c']);
      ctx.textAlign = 'left';
      ctx.fillText(tag, 0, 0);
      ctx.restore();
    }
  });
}

// A big billboard face: bright ground, bold words.
function adTex(T, rng, words) {
  return makeTex(T, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = rng.pick(['#d23c2e', '#2e6fd2', '#e8b93a', '#3fae6a', '#7a4fd0', '#111']);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '900 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(words, w / 2, h / 2 + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, h - 18, w, 18);
  });
}

// A neon plate: dark ground, one glowing word.
function neonTex(T, rng, word) {
  return makeTex(T, 256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#0c0c18';
    ctx.fillRect(0, 0, w, h);
    const col = rng.pick(['#ff4fd8', '#4dc9ff', '#ffd23c', '#7dff9e']);
    ctx.shadowColor = col;
    ctx.shadowBlur = 22;
    ctx.fillStyle = col;
    ctx.font = '900 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(word, w / 2, h / 2 + 18);
  });
}

// ---- shared context -------------------------------------------------

function makeCtx(T, seed) {
  const ctx = {
    T,
    rng: new Rng(seed),
    group: new T.Group(),
    solids: [],
    pads: [],
    lamps: [],
    ferris: null,
    beacon: null,
    sun: null,
    hemi: null,
    sky: null,
    pulse: 0,
    hour: CFG.DAY_START,
    xs: streetLines(),
    zs: streetLines(),
  };
  ctx.group.name = 'city';
  return ctx;
}

function solid(ctx, x, z, r) {
  ctx.solids.push({ x, z, r });
}

function mat(ctx, color, rough = 0.9, metal = 0) {
  return new ctx.T.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function box(ctx, w, h, d, material, x, y, z, ry = 0) {
  const m = new ctx.T.Mesh(new ctx.T.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.group.add(m);
  return m;
}

function cyl(ctx, rt, rb, h, material, x, y, z, seg = 10) {
  const m = new ctx.T.Mesh(new ctx.T.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.group.add(m);
  return m;
}

function flat(ctx, w, d, material, x, y, z) {
  const m = new ctx.T.Mesh(new ctx.T.PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  ctx.group.add(m);
  return m;
}

// ---- ground: grass, roads, sidewalks, sand, boardwalk, sea --------

function buildGround(ctx) {
  const { xs, zs } = ctx;
  flat(ctx, SPAN * 2 + SAND_W + CFG.SEA_M + 60, SPAN * 2 + 60, mat(ctx, CFG.GRASS_COL, 1), (SAND_W + CFG.SEA_M) / 2, -0.05, 0);

  const roadMat = mat(ctx, CFG.ROAD_COL, 0.95);
  const walkMat = mat(ctx, CFG.WALK_COL, 0.95);
  const dashMat = mat(ctx, 0xd8c95a, 0.9);
  for (const cx of xs) {
    flat(ctx, RD_M, SPAN * 2, roadMat, cx, 0, 0);
    for (let z = -SPAN + 8; z < SPAN - 8; z += 16) {
      flat(ctx, 0.6, 5, dashMat, cx, 0.01, z);
    }
  }
  for (const cz of zs) {
    flat(ctx, SPAN * 2, RD_M, roadMat, 0, 0, cz);
    for (let x = -SPAN + 8; x < SPAN - 8; x += 16) {
      flat(ctx, 5, 0.6, dashMat, x, 0.01, cz);
    }
  }
  // Sidewalk skirts around every block.
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const cx = -SPAN + RD_M + i * STEP_M + BLK_M / 2;
      const cz = -SPAN + RD_M + j * STEP_M + BLK_M / 2;
      flat(ctx, BLK_M + 4, BLK_M + 4, walkMat, cx, 0.005, cz);
    }
  }

  // Beach sand, boardwalk planks, sea — east of the city.
  flat(ctx, SAND_W, SPAN * 2 + 40, mat(ctx, CFG.SAND_COL, 1), SPAN + SAND_W / 2, 0, 0);
  flat(ctx, BOARD_W, SPAN * 2, mat(ctx, CFG.PLANK_COL, 0.95), SPAN + 2, 0.02, 0);
  for (let z = -SPAN; z < SPAN; z += 6) {
    flat(ctx, BOARD_W, 0.35, mat(ctx, 0x5a4028, 1), SPAN + 2, 0.03, z);
  }
  const sea = new ctx.T.Mesh(
    new ctx.T.PlaneGeometry(CFG.SEA_M + 120, SPAN * 2 + 220),
    new ctx.T.MeshStandardMaterial({ color: CFG.SEA_COL, roughness: 0.25, metalness: 0.35 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(SPAN + SAND_W + CFG.SEA_M / 2 + 20, -0.4, 0);
  sea.receiveShadow = true;
  ctx.group.add(sea);
}

// ---- sky dome + sun + ambient ---------------------------------------

function buildSky(ctx) {
  const T = ctx.T;
  ctx.sky = new T.Mesh(
    new T.SphereGeometry(900, 24, 16),
    new T.MeshBasicMaterial({ color: CFG.SKY_LOW, side: T.BackSide, fog: false }),
  );
  ctx.group.add(ctx.sky);
  ctx.sun = new T.DirectionalLight(CFG.SUN_COL, CFG.SUN_STR);
  ctx.sun.castShadow = true;
  ctx.sun.shadow.mapSize.set(2048, 2048);
  ctx.sun.shadow.camera.left = -260;
  ctx.sun.shadow.camera.right = 260;
  ctx.sun.shadow.camera.top = 260;
  ctx.sun.shadow.camera.bottom = -260;
  ctx.sun.shadow.camera.far = 900;
  ctx.group.add(ctx.sun);
  ctx.group.add(ctx.sun.target);
  ctx.hemi = new T.HemisphereLight(CFG.HEMI_TOP, CFG.HEMI_BOT, CFG.HEMI_STR);
  ctx.group.add(ctx.hemi);
  ctx.group.add(new T.AmbientLight(CFG.AMBIENT_COL, 0.6));
}

// ---- buildings --------------------------------------------------------

const WALL_BASES = [0x8a7f74, 0x6e7d8a, 0x9a8a6a, 0x7a6a8a, 0x5e6a7a, 0x8a6a5a];

function quarter(i, j) {
  if (j <= 1) return 'yard';
  if (j >= 7) return 'house';
  if (i >= 7) return 'beach';
  return 'town';
}

function erect(ctx, cx, cz, w, h, d, kind) {
  const r = ctx.rng;
  const T = ctx.T;
  const base = r.pick(WALL_BASES);
  const sign = kind === 'beach' || (kind === 'town' && r.chance(0.45)) ? r.pick(SHOPS) : null;
  const tag = !sign && r.chance(0.6) ? r.pick(GRAFFITI) : null;
  const side = new T.MeshStandardMaterial({ map: facadeTex(T, r, base, tag, sign), roughness: 0.9 });
  const cap = mat(ctx, shade(base, 0.75), 0.95);
  const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), [side, side, cap, cap, side, side]);
  mesh.position.set(cx, h / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.group.add(mesh);
  solid(ctx, cx, cz, Math.max(w, d) * 0.62);
  box(ctx, w + 0.8, 0.5, d + 0.8, cap, cx, h + 0.25, cz);
  // Billboard crowns on tall downtown towers.
  if (kind === 'town' && h > 34 && r.chance(0.5)) {
    const board = new T.Mesh(
      new T.PlaneGeometry(16, 8),
      new T.MeshStandardMaterial({ map: adTex(T, r, r.pick(ADS)), roughness: 0.8 }),
    );
    board.position.set(cx, h + 5, cz - d / 2 - 0.2);
    board.rotation.y = Math.PI;
    ctx.group.add(board);
    box(ctx, 0.5, 5, 0.5, mat(ctx, 0x333333, 0.9), cx - 6, h + 2.5, cz - d / 2 - 0.4);
    box(ctx, 0.5, 5, 0.5, mat(ctx, 0x333333, 0.9), cx + 6, h + 2.5, cz - d / 2 - 0.4);
  }
  // Neon plate on beachfront shops.
  if (kind === 'beach' && r.chance(0.6)) {
    const glow = neonTex(T, r, r.pick(GLOW_WORDS));
    const plate = new T.Mesh(
      new T.PlaneGeometry(7, 2.6),
      new T.MeshStandardMaterial({ map: glow, roughness: 0.4, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.7 }),
    );
    plate.position.set(cx, 5.5, cz - d / 2 - 0.15);
    plate.rotation.y = Math.PI;
    ctx.group.add(plate);
  }
  return mesh;
}

function buildYard(ctx, cx, cz) {
  const r = ctx.rng;
  const w = 26 + r.next() * 6;
  const d = 18 + r.next() * 6;
  erect(ctx, cx, cz, w, 9 + r.next() * 4, d, 'yard');
  for (let k = 0; k < 3; k++) {
    const cc = r.pick([0xd23c2e, 0x2e6fd2, 0xe8b93a, 0x3fae6a]);
    const ox = cx - 12 + k * 9;
    const oz = cz + 13;
    box(ctx, 7, 2.6, 2.6, mat(ctx, cc, 0.7, 0.3), ox, 1.3, oz, r.next() * 0.2);
    solid(ctx, ox, oz, 3.6);
  }
  if (r.chance(0.5)) {
    const lx = cx + 12;
    const lz = cz - 10;
    const crane = mat(ctx, 0xe8b93a, 0.6, 0.4);
    box(ctx, 0.8, 22, 0.8, crane, lx, 11, lz);
    box(ctx, 0.8, 22, 0.8, crane, lx + 4, 11, lz);
    box(ctx, 16, 0.8, 0.8, crane, lx + 2, 22, lz);
    box(ctx, 1.4, 1.4, 1.4, mat(ctx, 0x333333, 0.8), lx + 12, 19, lz);
    solid(ctx, lx, lz, 3);
  }
}

function buildHouses(ctx, cx, cz) {
  const r = ctx.rng;
  const T = ctx.T;
  for (let k = 0; k < 2; k++) {
    const hx = cx - 8 + k * 16;
    const hz = cz + (r.next() - 0.5) * 8;
    const hw = 9 + r.next() * 3;
    const hd = 8 + r.next() * 3;
    const hh = 5.5 + r.next() * 2;
    const side = new T.MeshStandardMaterial({
      map: facadeTex(T, r, r.pick([0xc9a06a, 0x8a9a7a, 0xb08a8a, 0x9a8a6a]), null, null),
      roughness: 0.95,
    });
    const house = new T.Mesh(new T.BoxGeometry(hw, hh, hd), side);
    house.position.set(hx, hh / 2, hz);
    house.castShadow = true;
    house.receiveShadow = true;
    ctx.group.add(house);
    const roof = new T.Mesh(new T.BoxGeometry(hw + 1, 0.4, hd + 1), mat(ctx, 0x5a3a2a, 0.95));
    roof.position.set(hx, hh + 1.1, hz);
    roof.rotation.z = 0.32;
    roof.castShadow = true;
    ctx.group.add(roof);
    solid(ctx, hx, hz, Math.max(hw, hd) * 0.6);
  }
}

function buildTowers(ctx, cx, cz, kind) {
  const r = ctx.rng;
  const count = 1 + Math.floor(r.next() * 3);
  for (let k = 0; k < count; k++) {
    const bx = cx + (r.next() - 0.5) * 16;
    const bz = cz + (r.next() - 0.5) * 16;
    const bw = 12 + r.next() * 8;
    const bd = 12 + r.next() * 8;
    const bh = kind === 'beach'
      ? 10 + r.next() * 12
      : 16 + r.next() * (r.chance(0.25) ? 44 : 18);
    erect(ctx, bx, bz, bw, bh, bd, kind);
  }
}

function buildBlocks(ctx) {
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const cx = -SPAN + RD_M + i * STEP_M + BLK_M / 2;
      const cz = -SPAN + RD_M + j * STEP_M + BLK_M / 2;
      const kind = quarter(i, j);
      if (kind === 'yard') buildYard(ctx, cx, cz);
      else if (kind === 'house') buildHouses(ctx, cx, cz);
      else buildTowers(ctx, cx, cz, kind);
    }
  }
}

// ---- the Golden Anchor casino, crowning the north edge --------------

function buildCasino(ctx) {
  const r = ctx.rng;
  const T = ctx.T;
  const cx = 0;
  const cz = -SPAN + 6;
  const base = new T.Mesh(new T.BoxGeometry(46, 20, 30),
    new T.MeshStandardMaterial({ color: 0x2a1a3a, roughness: 0.6, metalness: 0.3 }));
  base.position.set(cx, 10, cz);
  base.castShadow = true;
  base.receiveShadow = true;
  ctx.group.add(base);
  solid(ctx, cx, cz, 24);
  box(ctx, 48, 1.2, 32, mat(ctx, 0xe8b93a, 0.4, 0.7), cx, 20.6, cz);
  const signTex = neonTex(T, r, 'GOLDEN ANCHOR');
  const sign = new T.Mesh(
    new T.PlaneGeometry(30, 6),
    new T.MeshStandardMaterial({ map: signTex, roughness: 0.4, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.9 }),
  );
  sign.position.set(cx, 14, cz + 15.2);
  ctx.group.add(sign);
  box(ctx, 16, 0.5, 8, mat(ctx, 0x111122, 0.7), cx, 4.2, cz + 18);
  for (let k = 0; k < 4; k++) {
    box(ctx, 0.3, 4.2, 0.3, mat(ctx, 0x888888, 0.6, 0.5), cx - 12 + k * 8, 2.1, cz + 21);
  }
  for (let k = 0; k < 6; k++) {
    const glow = new T.Mesh(new T.PlaneGeometry(2.4, 3.4),
      new T.MeshStandardMaterial({ color: 0xff5a8a, emissive: 0xff2a6a, emissiveIntensity: 1.1 }));
    glow.position.set(cx - 18 + k * 7.2, 2.2, cz + 15.1);
    ctx.group.add(glow);
  }
}

// ---- airstrip in the north-west corner -------------------------------

function buildStrip(ctx) {
  const T = ctx.T;
  const sx = -SPAN + 40;
  const sz = -SPAN + 40;
  const tarmac = flat(ctx, 70, 14, mat(ctx, 0x22242c, 0.95), sx, 0.02, sz);
  tarmac.rotation.z = 0.35;
  for (let s = -30; s < 30; s += 10) {
    const mark = flat(ctx, 5, 0.8, mat(ctx, 0xf5f0e0, 0.9), sx + s * Math.cos(0.35), 0.03, sz + s * Math.sin(0.35));
    mark.rotation.z = 0.35;
  }
  const fus = new T.Mesh(new T.CylinderGeometry(1.6, 1.6, 14, 12), mat(ctx, 0xe8e6df, 0.4, 0.5));
  fus.rotation.z = Math.PI / 2;
  fus.rotation.y = 0.35;
  fus.position.set(sx - 8, 1.8, sz + 12);
  fus.castShadow = true;
  ctx.group.add(fus);
  const wing = new T.Mesh(new T.BoxGeometry(4, 0.3, 18), mat(ctx, 0x2e6fd2, 0.5, 0.4));
  wing.position.set(sx - 8, 1.6, sz + 12);
  wing.rotation.y = 0.35;
  ctx.group.add(wing);
  const tail = new T.Mesh(new T.BoxGeometry(3.4, 3, 0.4), mat(ctx, 0xd23c2e, 0.5, 0.4));
  tail.position.set(sx - 15, 3.2, sz + 12);
  tail.rotation.y = 0.35;
  ctx.group.add(tail);
  solid(ctx, sx - 8, sz + 12, 8);
}

// ---- boardwalk: stalls, ferris wheel, arcade -------------------------

function buildBoardwalk(ctx) {
  const stallCols = [0xff5a8a, 0x7dff9e, 0x4dc9ff, 0xffd23c];
  for (let s = 0; s < 6; s++) {
    const z = -120 + s * 48;
    const col = stallCols[s % stallCols.length];
    box(ctx, 5, 3, 4, mat(ctx, col, 0.85), SPAN + 2, 1.5, z);
    box(ctx, 5.6, 0.3, 4.6, mat(ctx, 0xf5f0e0, 0.9), SPAN + 2, 3.2, z);
    solid(ctx, SPAN + 2, z, 3.4);
  }
  // Ferris wheel at the north end of the boardwalk.
  const wx = SPAN + 2;
  const wz = -160;
  const wheel = new ctx.T.Group();
  wheel.position.set(wx, 14, wz);
  wheel.add(new ctx.T.Mesh(new ctx.T.TorusGeometry(11, 0.5, 8, 28), mat(ctx, 0xffd23c, 0.5, 0.4)));
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2;
    const spoke = new ctx.T.Mesh(new ctx.T.BoxGeometry(0.35, 22, 0.35), mat(ctx, 0xeeeeee, 0.6));
    spoke.rotation.z = a + Math.PI / 2;
    wheel.add(spoke);
    const cab = new ctx.T.Mesh(new ctx.T.BoxGeometry(2.2, 2.2, 2.2), mat(ctx, 0xff5a8a, 0.7));
    cab.position.set(Math.cos(a) * 11, Math.sin(a) * 11, 0);
    wheel.add(cab);
  }
  ctx.group.add(wheel);
  ctx.ferris = wheel;
  box(ctx, 0.9, 14, 0.9, mat(ctx, 0x555555, 0.8), wx - 3, 7, wz);
  box(ctx, 0.9, 14, 0.9, mat(ctx, 0x555555, 0.8), wx + 3, 7, wz);
  solid(ctx, wx, wz, 4);
  // Arcade block on the boardwalk.
  box(ctx, 14, 7, 10, mat(ctx, 0x7a4fd0, 0.85), SPAN + 2, 3.5, 60);
  solid(ctx, SPAN + 2, 60, 8);
}

// ---- pier + marina + lighthouse ---------------------------------------

function buildPier(ctx) {
  const pierZ = 30;
  for (let x = SPAN; x < SPAN + 78; x += 4) {
    box(ctx, 4, 0.5, 12, mat(ctx, CFG.PLANK_COL, 0.95), x + 2, 0.35, pierZ);
  }
  for (let x = SPAN + 6; x < SPAN + 78; x += 12) {
    cyl(ctx, 0.35, 0.35, 2.4, mat(ctx, 0x5a4028, 0.9), x, -0.8, pierZ - 5);
    cyl(ctx, 0.35, 0.35, 2.4, mat(ctx, 0x5a4028, 0.9), x, -0.8, pierZ + 5);
  }
  for (let b = 0; b < 4; b++) {
    const bx = SPAN + 34 + b * 16;
    const bz = pierZ + (b % 2 === 0 ? -14 : 16);
    const hull = new ctx.T.Mesh(new ctx.T.BoxGeometry(9, 1.6, 3.4), mat(ctx, 0xf5f0e0, 0.6));
    hull.position.set(bx, 0.2, bz);
    hull.castShadow = true;
    ctx.group.add(hull);
    box(ctx, 3, 1.6, 2.4, mat(ctx, 0x2e6fd2, 0.6), bx - 1, 1.8, bz);
    cyl(ctx, 0.12, 0.12, 6, mat(ctx, 0x888888, 0.6), bx + 2, 4, bz, 6);
  }
  const lx = SPAN + 76;
  const lz = pierZ;
  cyl(ctx, 2.2, 2.8, 14, mat(ctx, 0xf5f0e0, 0.8), lx, 7, lz, 12);
  cyl(ctx, 2.6, 2.6, 1.2, mat(ctx, 0xd23c2e, 0.7), lx, 14.6, lz, 12);
  const lamp = new ctx.T.Mesh(new ctx.T.SphereGeometry(1.1, 12, 10),
    new ctx.T.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 2 }));
  lamp.position.set(lx, 16.2, lz);
  ctx.group.add(lamp);
  const beam = new ctx.T.Mesh(
    new ctx.T.ConeGeometry(3.5, 60, 12, 1, true),
    new ctx.T.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.12, side: ctx.T.DoubleSide, depthWrite: false }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(lx + 30, 16.2, lz);
  ctx.group.add(beam);
  ctx.beacon = beam;
  solid(ctx, lx, lz, 3.4);
}

// ---- safehouse carport garage -----------------------------------------

function buildGarage(ctx) {
  const safeX = -198 + 4 * STEP_M;
  const safeZ = -SPAN + RD_M + 7 * STEP_M + BLK_M / 2;
  const garage = new ctx.T.Group();
  garage.position.set(safeX, 0, safeZ);
  const wallMat = mat(ctx, 0x6e7d8a, 0.9);
  const back = new ctx.T.Mesh(new ctx.T.BoxGeometry(14, 5, 0.5), wallMat);
  back.position.set(0, 2.5, -5);
  back.castShadow = true;
  garage.add(back);
  const left = new ctx.T.Mesh(new ctx.T.BoxGeometry(0.5, 5, 10), wallMat);
  left.position.set(-7, 2.5, 0);
  left.castShadow = true;
  garage.add(left);
  const right = new ctx.T.Mesh(new ctx.T.BoxGeometry(0.5, 5, 10), wallMat);
  right.position.set(7, 2.5, 0);
  right.castShadow = true;
  garage.add(right);
  const roof = new ctx.T.Mesh(new ctx.T.BoxGeometry(15, 0.4, 11), mat(ctx, 0x3a3f4a, 0.95));
  roof.position.set(0, 5.2, 0);
  roof.castShadow = true;
  garage.add(roof);
  const bench = new ctx.T.Mesh(new ctx.T.BoxGeometry(4, 1, 1.2), mat(ctx, 0x8a6a45, 0.9));
  bench.position.set(-5, 0.5, -4);
  garage.add(bench);
  const board = new ctx.T.Mesh(new ctx.T.BoxGeometry(3, 2, 0.2), mat(ctx, 0x333333, 0.9));
  board.position.set(-5, 2.4, -4.7);
  garage.add(board);
  cyl(ctx, 0.3, 0.3, 2.2, mat(ctx, 0xe8b93a, 0.6, 0.4), 3, 1.1, -3, 8);
  cyl(ctx, 0.3, 0.3, 2.2, mat(ctx, 0xe8b93a, 0.6, 0.4), 3, 1.1, 3, 8);
  const pad = new ctx.T.Mesh(
    new ctx.T.CylinderGeometry(1.2, 1.2, 0.15, 20),
    new ctx.T.MeshStandardMaterial({ color: 0x7dff9e, emissive: 0x2fbf5a, emissiveIntensity: 0.9 }),
  );
  pad.position.set(0, 0.1, 0);
  garage.add(pad);
  ctx.group.add(garage);
  solid(ctx, safeX - 7, safeZ, 2.2);
  solid(ctx, safeX + 7, safeZ, 2.2);
  solid(ctx, safeX, safeZ - 5, 2.2);
  return { x: safeX, z: safeZ };
}

// ---- street props, trees, palms ---------------------------------------

function buildProps(ctx) {
  const r = ctx.rng;
  const { xs, zs } = ctx;
  for (const cx of xs) {
    for (const cz of zs) {
      if (r.chance(0.5)) continue;
      const lx = cx + (r.chance(0.5) ? 7.5 : -7.5);
      const lz = cz + (r.chance(0.5) ? 7.5 : -7.5);
      cyl(ctx, 0.14, 0.18, 6.5, mat(ctx, 0x2a2f38, 0.7, 0.4), lx, 3.25, lz, 6);
      const head = new ctx.T.Mesh(
        new ctx.T.SphereGeometry(0.42, 10, 8),
        new ctx.T.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 0.9 }),
      );
      head.position.set(lx, 6.6, lz);
      ctx.group.add(head);
      ctx.lamps.push(head);
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = xs[Math.floor(r.next() * xs.length)] + (r.next() - 0.5) * 10;
    const z = zs[Math.floor(r.next() * zs.length)] + (r.next() - 0.5) * 10;
    const kind = r.int(0, 6);
    if (kind === 0) {
      cyl(ctx, 0.35, 0.4, 1, mat(ctx, 0xd23c2e, 0.7), x, 0.5, z, 8);
    } else if (kind === 1) {
      box(ctx, 2.2, 1.4, 1.4, mat(ctx, 0x2f6e3a, 0.8), x, 0.7, z);
      solid(ctx, x, z, 1.4);
    } else if (kind === 2) {
      cyl(ctx, 0.3, 0.45, 0.9, mat(ctx, 0xff7a1a, 0.7), x, 0.45, z, 8);
    } else if (kind === 3) {
      box(ctx, 2.4, 0.5, 0.9, mat(ctx, 0x8a6a45, 0.9), x, 0.45, z);
      box(ctx, 0.3, 0.9, 0.9, mat(ctx, 0x555555, 0.8), x - 1, 0.45, z);
      box(ctx, 0.3, 0.9, 0.9, mat(ctx, 0x555555, 0.8), x + 1, 0.45, z);
    } else if (kind === 4) {
      box(ctx, 3.4, 0.2, 1.6, mat(ctx, 0x4d8fd1, 0.6), x, 2.6, z);
      box(ctx, 0.15, 2.6, 1.6, mat(ctx, 0x888888, 0.6), x - 1.6, 1.3, z);
      box(ctx, 0.15, 2.6, 1.6, mat(ctx, 0x888888, 0.6), x + 1.6, 1.3, z);
    } else if (kind === 5) {
      box(ctx, 1.2, 2.4, 1.2, mat(ctx, 0x4d8fd1, 0.4, 0.4), x, 1.2, z);
      box(ctx, 1.4, 0.15, 1.4, mat(ctx, 0xd23c2e, 0.7), x, 2.5, z);
      solid(ctx, x, z, 0.9);
    } else {
      box(ctx, 0.9, 1.1, 0.5, mat(ctx, 0x2e6fd2, 0.7), x, 0.55, z);
      solid(ctx, x, z, 0.7);
    }
  }
  for (let i = 0; i < 22; i++) {
    const x = -SPAN + r.next() * SPAN * 2;
    const z = 150 + r.next() * 66;
    cyl(ctx, 0.22, 0.3, 2.4, mat(ctx, 0x5a4028, 0.95), x, 1.2, z, 6);
    const crown = new ctx.T.Mesh(
      new ctx.T.SphereGeometry(1.8 + r.next(), 10, 8),
      mat(ctx, 0x3f6e2e, 0.95),
    );
    crown.position.set(x, 3.6, z);
    crown.castShadow = true;
    ctx.group.add(crown);
  }
  for (let i = 0; i < 10; i++) {
    const z = -180 + i * 40;
    cyl(ctx, 0.2, 0.28, 5, mat(ctx, 0x8a6a45, 0.95), SPAN + 8, 2.5, z, 6);
    for (let f = 0; f < 5; f++) {
      const frond = new ctx.T.Mesh(new ctx.T.BoxGeometry(0.3, 0.15, 3.2), mat(ctx, 0x3f7a2e, 0.95));
      frond.position.set(SPAN + 8, 5.2, z);
      frond.rotation.y = (f / 5) * Math.PI * 2;
      frond.rotation.x = 0.5;
      ctx.group.add(frond);
    }
  }
}

// ---- jump pads ---------------------------------------------------------

function buildPads(ctx) {
  const { xs, zs } = ctx;
  const defs = [
    { x: xs[3], z: zs[4] },
    { x: xs[6], z: zs[6] },
  ];
  for (const p of defs) {
    const pad = new ctx.T.Mesh(
      new ctx.T.CylinderGeometry(3, 3, 0.3, 20),
      new ctx.T.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff6a00, emissiveIntensity: 1.2 }),
    );
    pad.position.set(p.x, 0.15, p.z);
    ctx.group.add(pad);
    ctx.pads.push({ x: p.x, z: p.z, mesh: pad });
  }
}

// ---- assemble ----------------------------------------------------------

export function buildMetropolis(THREE, seed) {
  const ctx = makeCtx(THREE, seed);
  buildGround(ctx);
  buildSky(ctx);
  buildBlocks(ctx);
  buildCasino(ctx);
  buildStrip(ctx);
  buildBoardwalk(ctx);
  buildPier(ctx);
  const home = buildGarage(ctx);
  buildProps(ctx);
  buildPads(ctx);

  const skyHi = new THREE.Color(CFG.SKY_TOP);
  const skyLo = new THREE.Color(CFG.SKY_LOW);
  const fogBase = new THREE.Color(CFG.FOG_COL);
  const skyDay = new THREE.Color(0x7fb2e8);
  const fogDay = new THREE.Color(0x9ab8d8);
  const skyNight = new THREE.Color(0x0a0a20);
  const fogNight = new THREE.Color(0x0c0c22);

  const metro = {
    group: ctx.group,
    limits: { minX: -SPAN, maxX: SPAN + SAND_W, minZ: -SPAN, maxZ: SPAN },
    half: SPAN,
    pitch: STEP_M,
    block: BLK_M,
    road: RD_M,
    roadXs: ctx.xs,
    roadZs: ctx.zs,
    solids: ctx.solids,
    jumpPads: ctx.pads,
    pierPos: { x: SPAN + 70, z: 30 },
    marinaPos: { x: SPAN + 40, z: 46 },
    safehouse: home,
    casinoPos: { x: 0, z: -SPAN + 6 },
    stripPos: { x: -SPAN + 40, z: -SPAN + 40 },
    hour: ctx.hour,
    fogColor: new THREE.Color(CFG.FOG_COL),
    skyColor: new THREE.Color(CFG.SKY_LOW),
    lampGlow: 1,
    setClock(h) {
      const hr = ((h % 24) + 24) % 24;
      const dayT = (hr - 6) / 12;
      const lift = Math.sin(dayT * Math.PI);
      const duskAmt = clamp(1 - Math.abs(hr - 18.5) / 2.5, 0, 1);
      const darkAmt = clamp(1 - lift * 2.2, 0, 1);
      const ang = ((hr - 6) / 12) * Math.PI;
      ctx.sun.position.set(Math.cos(ang) * 400, Math.max(30, Math.sin(ang) * 380 + 20), 120);
      ctx.sun.target.position.set(0, 0, 0);
      // The base is lifted so the dusk frame still reads: the sun sits
      // nearly on the horizon at 18:30, and the shadowed faces would
      // go black on the base alone.
      ctx.sun.intensity = 0.45 + lift * 1.4;
      ctx.sun.color.setHex(lift > 0.05 ? CFG.SUN_COL : 0x8a9fd0);
      ctx.hemi.intensity = 0.5 + lift * 0.7;
      const sky = new THREE.Color();
      if (duskAmt > 0.4) sky.copy(skyLo).lerp(skyHi, 0.55);
      else if (lift > 0.1) sky.copy(skyDay);
      else sky.copy(skyNight);
      ctx.sky.material.color.copy(sky);
      const fog = new THREE.Color();
      if (duskAmt > 0.4) fog.copy(fogBase);
      else if (lift > 0.1) fog.copy(fogDay);
      else fog.copy(fogNight);
      metro.fogColor = fog;
      metro.skyColor = sky;
      const glow = clamp(duskAmt + darkAmt, 0, 1);
      for (const head of ctx.lamps) head.material.emissiveIntensity = 0.15 + glow * 1.4;
      metro.lampGlow = glow;
      ctx.hour = hr;
      metro.hour = hr;
      return hr;
    },
    update(dt) {
      ctx.pulse += dt;
      if (ctx.ferris) ctx.ferris.rotation.z += dt * 0.25;
      if (ctx.beacon) ctx.beacon.rotation.y += dt * 0.5;
      for (const p of ctx.pads) {
        p.mesh.material.emissiveIntensity = 1 + Math.sin(ctx.pulse * 2.5) * 0.5;
      }
    },
    // The nearest point on a road centre line to (x, z), for spawning
    // a car or a pedestrian where the streets actually are.
    nearestRoad(x, z) {
      let bestX = ctx.xs[0];
      let bestDx = Math.abs(x - ctx.xs[0]);
      for (const cx of ctx.xs) {
        const d = Math.abs(x - cx);
        if (d < bestDx) { bestDx = d; bestX = cx; }
      }
      let bestZ = ctx.zs[0];
      let bestDz = Math.abs(z - ctx.zs[0]);
      for (const cz of ctx.zs) {
        const d = Math.abs(z - cz);
        if (d < bestDz) { bestDz = d; bestZ = cz; }
      }
      if (bestDx <= bestDz) return { x: bestX, z };
      return { x, z: bestZ };
    },
    // A random point on a road line, for spawning.
    randomRoadPoint(r) {
      const vertical = r.chance(0.5);
      const line = vertical
        ? ctx.xs[Math.floor(r.next() * ctx.xs.length)]
        : ctx.zs[Math.floor(r.next() * ctx.zs.length)];
      const along = -SPAN + 10 + r.next() * (SPAN * 2 - 20);
      return vertical ? { x: line, z: along } : { x: along, z: line };
    },
    isRoad(x, z) {
      for (const cx of ctx.xs) if (Math.abs(x - cx) < RD_M / 2 + 0.5) return true;
      for (const cz of ctx.zs) if (Math.abs(z - cz) < RD_M / 2 + 0.5) return true;
      return false;
    },
    sidewalkPoint(r) {
      const i = Math.floor(r.next() * (ctx.xs.length - 1));
      const j = Math.floor(r.next() * (ctx.zs.length - 1));
      const x0 = ctx.xs[i] + RD_M / 2 + 1.6;
      const x1 = ctx.xs[i + 1] - RD_M / 2 - 1.6;
      const z0 = ctx.zs[j] + RD_M / 2 + 1.6;
      const z1 = ctx.zs[j + 1] - RD_M / 2 - 1.6;
      const edge = Math.floor(r.next() * 4);
      const t = r.next();
      if (edge === 0) return { x: x0 + (x1 - x0) * t, z: z0 };
      if (edge === 1) return { x: x0 + (x1 - x0) * t, z: z1 };
      if (edge === 2) return { x: x0, z: z0 + (z1 - z0) * t };
      return { x: x1, z: z0 + (z1 - z0) * t };
    },
    resolveCircle(x, z, radius) {
      let px = x;
      let pz = z;
      for (const s of ctx.solids) {
        const dx = px - s.x;
        const dz = pz - s.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const min = s.r + radius;
        if (d < min && d > 0.0001) {
          px = s.x + (dx / d) * min;
          pz = s.z + (dz / d) * min;
        }
      }
      px = clamp(px, -SPAN + 2, SPAN + SAND_W - 2);
      pz = clamp(pz, -SPAN + 2, SPAN - 2);
      return { x: px, z: pz };
    },
  };

  metro.setClock(CFG.DAY_START);
  return metro;
}
