// boot.js — VICE HARBOR v8, the boot and the one game loop.
// Builds the shared state, wires the town, the roads, the cars, the
// crowd, the hero, the police, the jobs, the sound board and the HUD,
// runs the third-person follow camera, the dusk-to-night clock, and
// the game modes: menu | play | pause | busted | wasted.
// ?seed=N fixes the world seed. ?shot=start|drive|chase|end stages
// one screenshot scene instead of the interactive loop, renders it
// once, and sets window.__shotReady for the capture script.

import * as THREE from 'three';
import { makeSeededRandom, hashString, clampNum, wrapAngle, dist } from './seed.js';
import { TUNE } from './tune.js';
import { buildTown, townTick } from './town.js';
import { makeRoads } from './roads.js';
import { makeFleet, drivePhysics, makeEffects, collideBuildings } from './cars.js';
import { makeCrowd } from './crowd.js';
import { makeHero } from './hero.js';
import { makeLaw } from './law.js';
import { makeJobs } from './jobs.js';
import { makeHud } from './face.js';
import { makeKeys } from './keys.js';
import { makeSoundBoard } from './sound.js';
import { stageShot, SHOT_LIST } from './stage.js';

const SAVE_KEY = 'viceharbor-v8-save';
const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1', 10) || 1;
const SHOT = params.get('shot');

const rng = makeSeededRandom(hashString('vice-harbor-v8') ^ SEED);

// ---------- renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8a4a52, 90, 520);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 12, -20);

// ---------- sky dome (gradient that follows the clock) ----------
const skyUniforms = {
  topColor: { value: new THREE.Color(0x2e1a4e) },
  midColor: { value: new THREE.Color(0xc65a3c) },
  botColor: { value: new THREE.Color(0x3a1a2a) },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(900, 24, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 topColor; uniform vec3 midColor; uniform vec3 botColor;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.12 ? mix(midColor, topColor, smoothstep(0.12, 0.65, h))
                          : mix(botColor, midColor, smoothstep(-0.08, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  }),
);
scene.add(sky);

// ---------- lights ----------
const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
sun.position.set(-160, 90, 60);
scene.add(sun);
const hemi = new THREE.HemisphereLight(0x8a5aa8, 0x3a2a1a, 0.85);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x8aa0ff, 0.0);
moon.position.set(120, 160, -80);
scene.add(moon);

// ---------- shared state ----------
const G = {
  scene, camera, renderer, rng,
  timeSec: 0,
  clockMinutes: TUNE.startClock,
  events: [],
  mode: 'menu',
  camYaw: Math.PI,
  camPitch: 0.3,
  camDist: 12,
  noticeText: '',
  objectiveText: '',
  save: { money: TUNE.startMoney, jobsDone: [], x: 0, z: 10, health: 100, armor: 0 },
  world: null,
  hud: null,
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (typeof s.money === 'number') G.save = { ...G.save, ...s };
    return true;
  } catch {
    return false;
  }
}
G.saveGame = function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(G.save));
  } catch { /* storage unavailable */ }
};
G.setClock = function setClock(minutes) {
  G.clockMinutes = minutes;
};

const hadSave = loadSave();

// ---------- world ----------
const roads = makeRoads();
const town = buildTown(G);
const colliders = town.colliders;
const fleet = makeFleet(G, roads, colliders);
const crowd = makeCrowd(G, roads);
const fx = makeEffects(G);
const heroApi = makeHero(G, colliders);
const hero = heroApi.hero;
hero.money = G.save.money;
hero.health = G.save.health;
hero.armor = G.save.armor;
hero.x = G.save.x;
hero.z = G.save.z;
const law = makeLaw(G, fleet, roads, colliders);
const hud = makeHud(G);
G.hud = hud;
const keys = makeKeys();
const sound = makeSoundBoard();

const jobs = makeJobs(G, {
  hero,
  fleet,
  law,
  fx,
  roads,
  notify: (t) => hud.showNotice(t, '#ffd23c'),
  setClock: G.setClock,
});

G.world = { town, roads, fleet, crowd, hero: heroApi, law, jobs, fx, colliders };

// ---------- day / night ----------
const DUSK = { top: new THREE.Color(0x2e1a4e), mid: new THREE.Color(0xc65a3c), bot: new THREE.Color(0x3a1a2a), fog: new THREE.Color(0x8a4a52), sun: 2.4, hemi: 0.85, moon: 0 };
const NIGHT = { top: new THREE.Color(0x060818), mid: new THREE.Color(0x141a38), bot: new THREE.Color(0x05060f), fog: new THREE.Color(0x0c1024), sun: 0.15, hemi: 0.3, moon: 0.9 };
const DAY = { top: new THREE.Color(0x3a6ab0), mid: new THREE.Color(0x9ac8e8), bot: new THREE.Color(0xc8a878), fog: new THREE.Color(0x9ab8d0), sun: 2.8, hemi: 1.1, moon: 0 };

function applyClock() {
  const m = G.clockMinutes % (24 * 60);
  // 0-5 night, 5-7 dawn, 7-17 day, 17-20 dusk, 20-24 night
  let a, b, t;
  if (m < 300) { a = NIGHT; b = NIGHT; t = 0; }
  else if (m < 420) { a = NIGHT; b = DAY; t = (m - 300) / 120; }
  else if (m < 1020) { a = DAY; b = DAY; t = 0; }
  else if (m < 1200) { a = DAY; b = DUSK; t = (m - 1020) / 180; }
  else { a = DUSK; b = NIGHT; t = (m - 1200) / 240; }
  const lerp = (ca, cb) => ca.clone().lerp(cb, t);
  skyUniforms.topColor.value.copy(lerp(a.top, b.top));
  skyUniforms.midColor.value.copy(lerp(a.mid, b.mid));
  skyUniforms.botColor.value.copy(lerp(a.bot, b.bot));
  scene.fog.color.copy(lerp(a.fog, b.fog));
  sun.intensity = a.sun + (b.sun - a.sun) * t;
  hemi.intensity = a.hemi + (b.hemi - a.hemi) * t;
  moon.intensity = a.moon + (b.moon - a.moon) * t;
  // sun swings across the sky with the clock
  const sunAngle = ((m - 360) / 1440) * Math.PI * 2;
  sun.position.set(Math.cos(sunAngle) * 220, 60 + Math.sin(sunAngle) * 140, 80);
  scene.background = null;
}

// ---------- camera ----------
function updateCamera(dt) {
  const target = hero.car
    ? { x: hero.car.x, z: hero.car.z, y: 2.2 }
    : { x: hero.x, z: hero.z, y: 2.0 };
  // orbit with the mouse drag; wheel zooms
  G.camYaw -= keys.orbitDX * 0.005;
  G.camPitch = clampNum(G.camPitch + keys.orbitDY * 0.004, 0.08, 1.1);
  G.camDist = clampNum(G.camDist + keys.wheelDelta * 0.01, 7, 22);
  // when driving, ease the camera behind the car
  if (hero.car) {
    const behind = hero.car.heading + Math.PI;
    let dy = wrapAngle(behind - G.camYaw);
    G.camYaw += dy * Math.min(1, dt * 1.6);
  }
  const cy = Math.sin(G.camPitch);
  const ch = Math.cos(G.camPitch);
  const cx = target.x + Math.sin(G.camYaw) * ch * G.camDist;
  const cz = target.z + Math.cos(G.camYaw) * ch * G.camDist;
  camera.position.set(cx, target.y + cy * G.camDist, cz);
  camera.lookAt(target.x, target.y + 0.5, target.z);
}

// ---------- interactions ----------
let lastNearMiss = 0;
function checkNearMiss(dt) {
  if (!hero.car || Math.abs(hero.car.speed) < 20) return;
  lastNearMiss -= dt;
  if (lastNearMiss > 0) return;
  for (const c of fleet.cars) {
    if (c === hero.car || c.wrecked) continue;
    const d = dist(hero.x, hero.z, c.x, c.z);
    if (d > 2.6 && d < 5.2) {
      const ahead = Math.sin(hero.car.heading) * (c.x - hero.x) + Math.cos(hero.car.heading) * (c.z - hero.z);
      if (ahead > 0) {
        hero.money += TUNE.nearMissBonus;
        hud.showNotice(`+$${TUNE.nearMissBonus} NEAR MISS`, '#7dff9e');
        lastNearMiss = 1.2;
        break;
      }
    }
  }
}

function carSkids(dt) {
  if (!hero.car || Math.abs(hero.car.speed) < 12) return;
  const steer = keys.anyDown(TUNE.keys.left) ? -1 : keys.anyDown(TUNE.keys.right) ? 1 : 0;
  if (steer !== 0 && Math.abs(hero.car.speed) > 18) {
    fx.spawnSkid(hero.car.x - Math.sin(hero.car.heading) * 1.2, hero.car.z - Math.cos(hero.car.heading) * 1.2, hero.car.heading);
  }
}

function handleInput(dt) {
  const k = TUNE.keys;
  if (keys.anyPressed(k.pause)) {
    if (G.mode === 'play') openPause();
    else if (G.mode === 'pause') closeMenu();
    return;
  }
  if (G.mode !== 'play') return;
  if (keys.anyPressed(k.photo)) {
    hud.setPhoto(true);
    setTimeout(() => hud.setPhoto(false), 1200);
    return;
  }
  if (keys.anyPressed(k.radio)) {
    sound.setRadio(!G.radioOn);
    G.radioOn = !G.radioOn;
    hud.showNotice(G.radioOn ? 'RADIO ON' : 'RADIO OFF', '#cfd4de');
  }

  if (hero.car) {
    const car = hero.car;
    const input = {
      throttle: (keys.anyDown(k.forward) ? 1 : 0) + (keys.anyDown(k.back) ? -1 : 0),
      brake: keys.isDown('Space'),
      steer: (keys.anyDown(k.left) ? -1 : 0) + (keys.anyDown(k.right) ? 1 : 0),
    };
    drivePhysics(car, input, dt, colliders, roads);
    hero.x = car.x;
    hero.z = car.z;
    hero.heading = car.heading;
    if (keys.anyPressed(k.enter)) {
      heroApi.exitCar();
      hud.showNotice('On foot', '#cfd4de');
    }
    if (keys.anyPressed(k.horn)) sound.horn();
    if (car.health <= 0 && !car.wrecked) {
      car.wrecked = true;
      fx.spawnExplosion(car.x, 0.5, car.z, 1.4);
      sound.blast();
      heroApi.exitCar();
      heroApi.damage(35);
      law.addWanted(1);
      hud.showNotice('YOUR CAR BLEW UP', '#ff5a3c');
    }
  } else {
    // on foot
    const axis = keys.moveAxis();
    const camFwdX = -Math.sin(G.camYaw);
    const camFwdZ = -Math.cos(G.camYaw);
    const camRightX = Math.cos(G.camYaw);
    const camRightZ = -Math.sin(G.camYaw);
    const mx = camRightX * axis.x + camFwdX * axis.z;
    const mz = camRightZ * axis.x + camFwdZ * axis.z;
    heroApi.walkTick(dt, { x: mx, z: mz }, keys.anyDown(k.run), keys.wasPressed(k.jump));
    if (keys.anyPressed(k.enter)) {
      const car = fleet.nearestCar(hero.x, hero.z, 4.5);
      if (car) {
        const wasOccupied = car.driver && !car.parked;
        if (wasOccupied) {
          law.addWanted(1);
          hud.showNotice('CARJACKED — +1 ★', '#ff5a3c');
          crowd.scare(car.x, car.z, 12);
        }
        heroApi.enterCar(car);
        sound.click();
      }
    }
    if (keys.anyPressed(k.punch)) {
      const target = heroApi.punch([...crowd.peds, ...law.footCops]);
      if (target) {
        target.health -= TUNE.punchDamage;
        sound.thud();
        if (target.health <= 0) {
          target.state = 'down';
          target.downTimer = 6;
          target.mesh.rotation.x = -Math.PI / 2;
          target.mesh.position.y = 0.3;
          law.addWanted(1);
          hud.showNotice('ASSAULT — +1 ★', '#ff5a3c');
        }
      }
    }
    if (keys.anyPressed(k.weapon)) {
      hero.weaponDrawn = !hero.weaponDrawn;
      sound.click();
    }
    if (keys.anyPressed(k.swap)) {
      const order = ['pistol', 'scatter', 'smg'];
      const i = order.indexOf(hero.weapon);
      hero.weapon = order[(i + 1) % order.length];
      hero.weaponDrawn = true;
      sound.click();
    }
    if (keys.anyPressed(k.reload)) {
      const spec = TUNE.weapons[hero.weapon];
      const need = spec.mag - hero.mag[hero.weapon];
      const take = Math.min(need, hero.ammo[hero.weapon]);
      hero.mag[hero.weapon] += take;
      hero.ammo[hero.weapon] -= take;
      hero.reloadTimer = 0.5;
      sound.click();
    }
    if (keys.mouseDown && hero.weaponDrawn && hero.fireTimer <= 0 && hero.reloadTimer <= 0) {
      const targets = [...crowd.peds, ...law.footCops];
      const res = heroApi.shoot(targets, TUNE.weapons[hero.weapon].spread);
      if (res) {
        sound.shot();
        law.addWanted(1);
        crowd.scare(hero.x, hero.z, 30);
        if (res.hit) {
          res.hit.health -= res.damage;
          if (res.hit.health <= 0) {
            res.hit.state = 'down';
            res.hit.downTimer = 8;
            res.hit.mesh.rotation.x = -Math.PI / 2;
            res.hit.mesh.position.y = 0.3;
          }
        }
      }
    }
  }
}

// ---------- menus ----------
let currentMenu = null;
function closeMenu() {
  if (currentMenu) {
    currentMenu.remove();
    currentMenu = null;
  }
  G.mode = 'play';
  sound.start();
}

function jobListHtml() {
  return jobs.available.map((j) => `
    <div class="vh-job" data-job="${j.id}">
      <div><b>${j.title}</b><small>${j.where}</small></div>
      <span>$${j.pay}</span>
    </div>`).join('');
}

function openStart() {
  G.mode = 'menu';
  const m = hud.menu(`
    <h1>VICE HARBOR</h1>
    <h2>An open-world crime story — v8</h2>
    <p>Rex Dalton is back in the harbor after three years away. Mama Lou
    has work for him — ten jobs, from a cab fare to the Golden Anchor
    casino. Steal any car, outrun the Harbor PD, and make the city yours.</p>
    <p><b>Jobs open:</b></p>
    ${jobListHtml() || '<p>All jobs done — free roam the city.</p>'}
    <button class="vh-btn" id="vh-start">Free Roam</button>
    ${hadSave ? '<button class="vh-btn alt" id="vh-continue">Continue</button>' : ''}
    <p class="vh-keys"><b>WASD</b> move &nbsp; <b>Shift</b> run &nbsp; <b>E</b> enter / steal car &nbsp;
    <b>F</b> punch &nbsp; <b>Q</b> draw weapon &nbsp; <b>X</b> swap &nbsp; <b>R</b> reload &nbsp;
    <b>Esc</b> pause &nbsp; <b>V</b> photo &nbsp; <b>M</b> radio &nbsp; drag mouse to look</p>
  `);
  currentMenu = m;
  m.querySelector('#vh-start').addEventListener('click', () => { sound.start(); closeMenu(); });
  const cont = m.querySelector('#vh-continue');
  if (cont) cont.addEventListener('click', () => { sound.start(); closeMenu(); });
  m.querySelectorAll('.vh-job').forEach((elx) => {
    elx.addEventListener('click', () => {
      sound.start();
      closeMenu();
      jobs.start(elx.dataset.job);
    });
  });
}

function openPause() {
  G.mode = 'pause';
  const m = hud.menu(`
    <h1>PAUSED</h1>
    <h2>Vice Harbor</h2>
    <p>Money <b>${hud.fmtMoney(hero.money)}</b> · Jobs done <b>${jobs.done.size}/10</b> · Wanted <b>${'★'.repeat(law.wanted)}${'☆'.repeat(5 - law.wanted)}</b></p>
    <p><b>Jobs open:</b></p>
    ${jobListHtml() || '<p>All jobs done — free roam the city.</p>'}
    <button class="vh-btn" id="vh-resume">Resume</button>
    <button class="vh-btn alt" id="vh-quit">Save &amp; Menu</button>
  `);
  currentMenu = m;
  m.querySelector('#vh-resume').addEventListener('click', closeMenu);
  m.querySelector('#vh-quit').addEventListener('click', () => {
    saveProgress();
    closeMenu();
    openStart();
  });
  m.querySelectorAll('.vh-job').forEach((elx) => {
    elx.addEventListener('click', () => {
      closeMenu();
      jobs.start(elx.dataset.job);
    });
  });
}

function openEnd(kind) {
  G.mode = kind;
  const fine = kind === 'busted' ? TUNE.bustFine : TUNE.wastedFine;
  hero.money = Math.max(0, hero.money - fine);
  law.setWanted(0);
  const title = kind === 'busted' ? 'BUSTED' : 'WASTED';
  const m = hud.menu(`
    <h1>${title}</h1>
    <h2>The Harbor PD thanks you for the $${fine} fine</h2>
    <p>You wake up outside the precinct with a lighter wallet and a
    clean record. The city is still out there.</p>
    <button class="vh-btn" id="vh-again">Back to the streets</button>
  `);
  currentMenu = m;
  m.querySelector('#vh-again').addEventListener('click', () => {
    hero.health = 100;
    hero.armor = 0;
    hero.dead = false;
    hero.x = -P0;
    hero.z = P0;
    if (hero.car) heroApi.exitCar();
    hero.mesh.position.set(hero.x, 0, hero.z);
    saveProgress();
    closeMenu();
  });
}
const P0 = TUNE.pitch * 0.5;

function saveProgress() {
  G.save.money = Math.round(hero.money);
  G.save.health = Math.round(hero.health);
  G.save.armor = Math.round(hero.armor);
  G.save.x = hero.x;
  G.save.z = hero.z;
  G.save.jobsDone = [...jobs.done];
  G.saveGame();
}

// ---------- render ----------
function renderFrame(dt) {
  townTick(town, dt, G.timeSec);
  fx.tick(dt);
  updateCamera(dt);
  applyClock();
  renderer.render(scene, camera);
}
G.renderFrame = renderFrame;

// ---------- main loop ----------
let last = performance.now();
let saveTimer = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.mode === 'menu' || G.mode === 'pause' || G.mode === 'busted' || G.mode === 'wasted') {
    // idle animation behind the menus: slow orbit around downtown
    G.timeSec += dt;
    G.camYaw += dt * 0.02;
    camera.position.set(Math.sin(G.camYaw) * 120, 42, Math.cos(G.camYaw) * 120);
    camera.lookAt(0, 8, 0);
    townTick(town, dt, G.timeSec);
    renderer.render(scene, camera);
    keys.endFrame();
    return;
  }
  G.timeSec += dt;
  G.clockMinutes += (dt / 60) * (1440 / (TUNE.dayMinutes * 60)) * 60 / 60;
  G.clockMinutes = G.clockMinutes % (24 * 60);

  handleInput(dt);
  fleet.trafficTick(dt);
  crowd.pedTick(dt, { x: hero.x, z: hero.z }, hero.car ? Math.abs(hero.car.speed) : hero.speed2d);
  law.update(dt, hero, fx);
  jobs.update(dt);
  heroApi.tick(dt);
  checkNearMiss(dt);
  carSkids(dt);
  sound.tick(dt, hero.car ? Math.abs(hero.car.speed) / 46 : 0, !!hero.car, law.wanted);

  // events from the law module
  for (const ev of G.events) {
    if (ev.type === 'busted') openEnd('busted');
  }
  G.events.length = 0;

  // death
  if (hero.dead && hero.deadTimer <= 0) openEnd('wasted');

  // HUD
  const target = jobs.currentTarget();
  hud.update(dt, {
    hero, law, town,
    target,
    clockMinutes: G.clockMinutes,
    bustText: law.bustProgress > 0 ? `BUSTED IN ${Math.ceil(TUNE.bustHoldSeconds - law.bustProgress)}…` : '',
  });
  const active = jobs.active;
  hud.setObjective(active ? `${active.label}${active.timer > 0 ? ` — ${Math.ceil(active.timer)}s` : ''}` : (G.objectiveText || ''));

  renderFrame(dt);
  saveTimer += dt;
  if (saveTimer > 12) {
    saveTimer = 0;
    saveProgress();
  }
  keys.endFrame();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle for play-testing (read-only state inspection).
window.__vh = G;

// ---------- start ----------
applyClock();
if (SHOT && SHOT_LIST.includes(SHOT)) {
  G.mode = 'play';
  // the world needs one traffic tick so cars sit on their routes
  fleet.trafficTick(0.016);
  stageShot(G, SHOT);
} else {
  openStart();
  requestAnimationFrame(loop);
}
