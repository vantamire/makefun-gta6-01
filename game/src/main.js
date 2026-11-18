// VICE HARBOR v7 — the boot and the one game loop.
// A Harbor builds the shared state, wires the city, the hero, the
// traffic, the crowd, the police, the missions, the sound board and the
// HUD, runs the third-person follow camera, and owns the game modes:
// 'menu' | 'play' | 'pause' | 'busted' | 'done'.
//
// ?seed=N fixes the world seed. ?shot=start|drive|chase|end stages one
// screenshot scene instead of the interactive loop, renders it once,
// and sets window.__shotReady for the capture script.

import * as THREE from 'three';
import { CFG, QUESTS } from './settings.js';
import { Rng, clamp } from './rng.js';
import { buildMetropolis } from './metropolis.js';
import { Vehicle, parkVehicles, makeArmoredVan, makeCashCart, readDriveInput } from './vehicles.js';
import { makeStreets } from './streets.js';
import { makePedestrians } from './pedestrians.js';
import { Protagonist } from './protagonist.js';
import { makePolice } from './cops.js';
import {
  makeControls,
  ACT_CONFIRM, ACT_PAUSE, ACT_ENTER, ACT_MENU, ACT_CAM,
  ACT_HIT, ACT_GUN, ACT_RELOAD, ACT_PHOTO, ACT_RADIO, ACT_SWAP,
} from './controls.js';
import { makeHud } from './hud.js';
import { makeQuests } from './quests.js';
import { makeSoundBoard } from './audio.js';
import { composeShot, SHOT_LIST, makeBlast } from './scenes.js';

const STEP = 1 / 60;
const FRAME_CAP = 0.25;
const SAVE_KEY = CFG.SAVE_KEY;

const query = new URLSearchParams(window.location.search);
const shotName = query.get('shot');
const seedArg = Number.parseInt(query.get('seed') ?? '', 10);
const worldSeed = Number.isInteger(seedArg) ? seedArg : CFG.WORLD_SEED;

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');

function announce(text) {
  if (statusLine) statusLine.textContent = text;
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { money: 0 };
    const data = JSON.parse(raw);
    return { money: typeof data.money === 'number' ? data.money : 0 };
  } catch {
    return { money: 0 };
  }
}

function storeSave(money) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ money }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

// The follow camera: ease the yaw toward the thing being followed, keep
// a steady distance and height, and widen the field of view with speed.
function placeCamera(camera, focus, yaw, dist, height) {
  const cx = focus.x - Math.sin(yaw) * dist;
  const cz = focus.z - Math.cos(yaw) * dist;
  camera.position.set(cx, height, cz);
  camera.lookAt(focus.x, 1.6, focus.z);
}

class Harbor {
  constructor() {
    this.world = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.input = null;
    this.city = null;
    this.hero = null;
    this.hud = null;
    this._dice = new Rng(777);
    this._acc = 0;
    this._last = 0;
    this._hornAt = -Infinity;
    this._vy = 0;
    this._airT = 0;
    this._nearAt = -Infinity;
    this._blasts = [];
    this._tracers = [];
    this._yaw = 0;
    this._dist = 8;
    this._orbit = 0;
  }

  async start() {
    this._makeRenderer();
    this._makeCity();
    this._makeWorld();
    this._makeSystems();
    this._wireHud();
    this._wireResize();
    if (shotName && SHOT_LIST.includes(shotName)) {
      this._stage(shotName);
      return;
    }
    this._loop();
  }

  _makeRenderer() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(1280, 720, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CFG.SKY_LOW);
    this.scene.fog = new THREE.Fog(CFG.FOG_COL, CFG.FOG_NEAR, CFG.FOG_FAR);
    this.camera = new THREE.PerspectiveCamera(70, 1280 / 720, 0.1, 1200);
  }

  _makeCity() {
    this.city = buildMetropolis(THREE, worldSeed);
    this.scene.add(this.city.group);
  }

  _makeWorld() {
    const saved = loadSave();
    this.world = {
      THREE,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      input: null,
      city: this.city,
      hero: null,
      parked: [],
      truck: null,
      cart: null,
      traffic: null,
      crowd: null,
      police: null,
      quests: null,
      hud: null,
      sound: null,
      vehicles: { Vehicle },
      money: saved.money,
      hour: CFG.DAY_START,
      mode: 'menu',
      time: 0,
    };
    this.input = makeControls(canvas);
    this.world.input = this.input;
    this.hero = new Protagonist(THREE, this.city);
    this.world.hero = this.hero;
    this.scene.add(this.hero.mesh);
    // Spawn on the sidewalk north of the east-west road at z=18,
    // facing east into the sunset.
    this.hero.teleport(0, 27, Math.PI / 2);
    this.hud = makeHud();
    this.world.hud = this.hud;
    // Staging hooks for scenes.js: step the world, start a mission,
    // and spawn an explosion without reaching into Harbor internals.
    this.world.advance = (dt, scripted) => this.step(dt, scripted);
    this.world.startQuest = (i) => this._beginQuest(i);
    this.world.blast = (x, z, scale) => this.spawnBlast(x, z, scale);
  }

  _makeSystems() {
    const W = this.world;
    W.parked = parkVehicles(THREE, this.city, new Rng(worldSeed + 21), 26);
    W.truck = makeArmoredVan(THREE, this.city, new Rng(worldSeed + 31));
    W.cart = makeCashCart(THREE, this.city, new Rng(worldSeed + 33));
    W.traffic = makeStreets(THREE, this.city, new Rng(worldSeed + 41), CFG.FLOW_N);
    W.crowd = makePedestrians(THREE, this.city, new Rng(worldSeed + 51), CFG.CROWD_N);
    W.police = makePolice(THREE, this.city);
    W.quests = makeQuests(this.city, THREE);
    W.sound = makeSoundBoard();
    // Traffic honks when the player's car blocks the road ahead.
    W.traffic.onHonk(() => {
      if (W.mode === 'play') W.sound.horn();
    });
    // A knock-down in the crowd draws the law.
    W.crowd.onHit = () => {
      if (W.mode === 'play') W.police.add(1);
    };
  }

  _wireHud() {
    const W = this.world;
    this.hud.bind({
      onStart: () => this._startPlay(),
      onResume: () => this._resume(),
      onRetry: () => this._retry(),
      onContinue: () => {
        this.hud.hideDone();
        W.mode = 'play';
      },
      onMissionPick: (i) => this._beginQuest(i),
    });
    this.hud.showStart();
  }

  _wireResize() {
    const fit = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', fit);
    fit();
  }

  _startPlay() {
    this.hud.hideStart();
    this.world.mode = 'play';
    this.world.sound.ensure();
    announce('VICE HARBOR — explore the city, run missions, outrun the law.');
  }

  _resume() {
    this.hud.hidePause();
    this.world.mode = 'play';
  }

  _retry() {
    const W = this.world;
    this.hud.hideBusted();
    W.police.reset();
    W.hero.health = 100;
    W.hero.armor = 50;
    if (W.hero.car) {
      const car = W.hero.exitVehicle();
      if (car) car.setPose(W.hero.pos.x + 2, W.hero.pos.z, 0);
    }
    W.hero.teleport(0, 27, Math.PI / 2);
    W.mode = 'play';
  }

  _beginQuest(i) {
    const W = this.world;
    if (W.mode !== 'play') return;
    if (W.quests.start(i, this._questCtx())) {
      this.hud.hideMissionMenu();
      W.sound.blip();
    }
  }

  _questCtx() {
    const W = this.world;
    return {
      THREE,
      hero: W.hero,
      city: W.city,
      law: W.police,
      hud: W.hud,
      sound: W.sound,
      traffic: W.traffic,
      parked: W.parked,
      truck: W.truck,
      cart: W.cart,
      vehicles: W.vehicles,
      time: W.time,
      bank: (n) => { W.money += n; storeSave(W.money); },
      toast: (m) => W.hud.showMessage(m, 3.5),
      blast: (x, z, s) => this.spawnBlast(x, z, s),
      setClock: (h) => {
        W.hour = h;
        W.city.setClock(h);
      },
    };
  }

  // ---- effects ----
  spawnBlast(x, z, scale) {
    const blast = makeBlast(THREE, x, z, scale);
    this.scene.add(blast.group);
    this._blasts.push(blast);
    this.world.sound.boom();
    return blast;
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a0, transparent: true, opacity: 0.95,
    }));
    this.scene.add(line);
    this._tracers.push({ line, t: 0, life: 0.12 });
  }

  _stepEffects(dt) {
    for (let i = this._blasts.length - 1; i >= 0; i -= 1) {
      const b = this._blasts[i];
      b.t += dt;
      const k = b.t / b.life;
      b.group.scale.setScalar(1 + k * 1.6);
      b.sprite.material.opacity = Math.max(0, 1 - k);
      b.light.intensity = Math.max(0, 3 * (1 - k));
      if (b.t >= b.life) {
        this.scene.remove(b.group);
        this._blasts.splice(i, 1);
      }
    }
    for (let i = this._tracers.length - 1; i >= 0; i -= 1) {
      const t = this._tracers[i];
      t.t += dt;
      t.line.material.opacity = Math.max(0, 0.95 * (1 - t.t / t.life));
      if (t.t >= t.life) {
        this.scene.remove(t.line);
        this._tracers.splice(i, 1);
      }
    }
  }

  _onCrash(speed) {
    const W = this.world;
    if (speed < 9) return;
    W.sound.crash();
    if (speed > 20 && W.hero.car) {
      const c = W.hero.car;
      this.spawnBlast(c.pos.x, c.pos.z, 2.2);
      W.police.add(1);
    }
  }

  // ---- shooting ----
  _resolveShot(shot) {
    const W = this.world;
    const ox = shot.origin.x;
    const oz = shot.origin.z;
    const dx = shot.dir.x;
    const dz = shot.dir.z;
    let best = null;
    let bestD = shot.range;
    let bestKind = null;
    let bestTarget = null;
    const testPoint = (x, z, radius, kind, target) => {
      const rx = x - ox;
      const rz = z - oz;
      const along = rx * dx + rz * dz;
      if (along < 0 || along > shot.range) return;
      const perp = Math.abs(rx * dz - rz * dx);
      if (perp < radius + along * shot.spread * 2 && along < bestD) {
        bestD = along;
        best = { x, z };
        bestKind = kind;
        bestTarget = target;
      }
    };
    for (const p of W.crowd.people) {
      if (p.state === 'down') continue;
      testPoint(p.pos.x, p.pos.z, 0.9, 'person', p);
    }
    for (const car of [...W.parked, ...W.traffic.cars, ...W.police.cops]) {
      testPoint(car.pos.x, car.pos.z, car.spec.len * 0.5, 'car', car);
    }
    if (W.truck) testPoint(W.truck.pos.x, W.truck.pos.z, 3.2, 'car', W.truck);
    if (W.cart) testPoint(W.cart.pos.x, W.cart.pos.z, 3.2, 'car', W.cart);
    if (!best) return null;
    return { kind: bestKind, target: bestTarget, point: best, dist: bestD };
  }

  _fireWeapon() {
    const W = this.world;
    const shot = W.hero.shoot();
    if (!shot) return;
    if (shot.empty) {
      W.sound.dry();
      W.hud.showMessage('Click — out of ammo. Press R to reload.', 2);
      return;
    }
    W.sound.shot();
    const pellets = shot.pellets || 1;
    let anyHit = false;
    for (let p = 0; p < pellets; p += 1) {
      const fan = (this._dice.next() - 0.5) * shot.spread * 2;
      const baseAng = Math.atan2(shot.dir.z, shot.dir.x);
      const dir = {
        x: shot.dir.x + Math.cos(baseAng + Math.PI / 2) * fan,
        z: shot.dir.z + Math.sin(baseAng + Math.PI / 2) * fan,
      };
      const dl = Math.hypot(dir.x, dir.z) || 1;
      dir.x /= dl;
      dir.z /= dl;
      const one = { ...shot, dir };
      const hit = this._resolveShot(one);
      const end = hit
        ? { x: hit.point.x, y: 1.2, z: hit.point.z }
        : { x: shot.origin.x + dir.x * shot.range, y: 1.2, z: shot.origin.z + dir.z * shot.range };
      this.spawnTracer(shot.origin, end);
      if (hit && !anyHit) {
        anyHit = true;
        if (hit.kind === 'person') {
          W.crowd.knockDown(hit.target);
          W.police.add(1);
          W.hud.showMessage('You shot a pedestrian — the cops are coming!', 2.5);
        } else if (hit.kind === 'car') {
          const car = hit.target;
          this.spawnBlast(car.pos.x, car.pos.z, 2.6);
          W.police.add(1);
          if (car === W.truck) W.hud.showMessage('The armored van is burning!', 2.5);
        }
      }
    }
  }

  _doPunch() {
    const W = this.world;
    const at = W.hero.punch();
    let best = null;
    let bestD = 1.9;
    for (const p of W.crowd.people) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.pos.x - at.x, p.pos.z - at.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      W.crowd.shove(best, W.hero.pos.x, W.hero.pos.z);
      W.sound.thud();
      W.police.add(1);
    }
  }

  // ---- enter / exit ----
  _nearestCar(maxD) {
    const W = this.world;
    let best = null;
    let bestD = maxD;
    const all = [...W.parked, W.truck, W.cart, ...W.traffic.cars].filter(Boolean);
    for (const car of all) {
      const d = Math.hypot(car.pos.x - W.hero.pos.x, car.pos.z - W.hero.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  _enterExit() {
    const W = this.world;
    if (W.hero.car) {
      W.hero.exitVehicle();
      W.sound.thud();
      return;
    }
    const car = this._nearestCar(4);
    if (!car) return;
    if (W.parked.includes(car) || car === W.truck || car === W.cart) W.police.add(1);
    W.hero.enterVehicle(car);
    W.sound.blip();
    if (car === W.truck) W.hud.showMessage('You stole the armored van!', 2.5);
    if (car === W.cart) W.hud.showMessage('You lifted the cash cart!', 2.5);
  }

  // ---- camera ----
  _updateCamera(dt) {
    const W = this.world;
    const drag = this.input.takeDrag();
    this._yaw += drag.x * 0.004;
    const wheel = this.input.takeWheel();
    this._dist = clamp(this._dist + wheel * 0.005, 5, 14);
    if (W.mode === 'menu') {
      this._orbit += dt * CFG.MENU_ORBIT_SPEED;
      const r = CFG.MENU_ORBIT_R;
      const cx = W.hero.pos.x + Math.sin(this._orbit) * r;
      const cz = W.hero.pos.z + Math.cos(this._orbit) * r;
      this.camera.position.set(cx, CFG.MENU_ORBIT_H, cz);
      this.camera.lookAt(W.hero.pos.x, 1.6, W.hero.pos.z);
      return;
    }
    const inCar = !!W.hero.car;
    const follow = inCar ? W.hero.car : W.hero;
    const wantYaw = follow.heading;
    let diff = wantYaw - this._yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this._yaw += diff * Math.min(1, dt * (inCar ? 2.2 : 3.2));
    const dist = inCar ? this._dist + 2 : this._dist;
    const height = inCar ? 3.6 : 3.0;
    placeCamera(this.camera, follow.pos, this._yaw, dist, height);
    const speed = inCar ? Math.abs(follow.speed) : W.hero.speed;
    const wantFov = 70 + clamp(speed / 36, 0, 1) * 9;
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
  }

  // ---- one fixed step ----
  step(dt, scripted) {
    const W = this.world;
    W.time += dt;
    W.hour = (W.hour + dt * 24 / CFG.DAY_S) % 24;
    W.city.setClock(W.hour);
    this.scene.fog.color.copy(W.city.fogColor);
    this.scene.background.copy(W.city.skyColor);
    W.city.update(dt);

    const actions = scripted ? (scripted.actions || 0) : this.input.takeActions();
    const digit = scripted ? 0 : this.input.takeDigit();

    if (W.mode === 'menu') {
      if (actions & ACT_CONFIRM) this._startPlay();
      this._updateCamera(dt);
      return;
    }
    if (W.mode === 'pause') {
      if (actions & ACT_PAUSE) this._resume();
      return;
    }
    if (W.mode === 'busted') {
      if (actions & ACT_CONFIRM) this._retry();
      return;
    }
    if (W.mode === 'done') {
      if (actions & ACT_CONFIRM) {
        this.hud.hideDone();
        W.mode = 'play';
      }
      return;
    }

    // ---- play ----
    if (actions & ACT_PAUSE) {
      W.mode = 'pause';
      this.hud.showPause();
      return;
    }
    if (actions & ACT_MENU) {
      if (this.hud.menuOpen()) this.hud.hideMissionMenu();
      else this.hud.showMissionMenu(W.quests.list, W.quests.active ? W.quests.active.def.id : null);
    }
    if (digit >= 1 && digit <= QUESTS.length && this.hud.menuOpen()) {
      this._beginQuest(digit - 1);
    }
    if (actions & ACT_CAM) {
      this._dist = this._dist > 9 ? 7 : 11;
    }
    if (actions & ACT_PHOTO) {
      this.hud.setPhoto(!this.hud.photoOn());
    }
    if (actions & ACT_RADIO) {
      const name = W.sound.radioNext();
      W.hud.showMessage(`Radio: ${name}`, 2);
    }
    if (actions & ACT_ENTER) this._enterExit();
    if (actions & ACT_HIT) {
      if (W.hero.weapon !== 'none') this._fireWeapon();
      else this._doPunch();
    }
    if (actions & ACT_GUN) W.hero.drawWeapon();
    if (actions & ACT_SWAP) W.hero.cycleWeapon();
    if (actions & ACT_RELOAD) {
      if (W.hero.reload()) W.sound.reload();
    }

    // Driving or walking.
    if (W.hero.car) {
      const drive = scripted && scripted.drive ? scripted.drive : readDriveInput(this.input);
      const car = W.hero.car;
      const before = car.speed;
      car.drive(dt, drive, null);
      if (car.crashed) {
        car.crashed = false;
        this._onCrash(Math.abs(before));
      }
      W.sound.engine(Math.abs(car.speed) / car.spec.top);
      // Jump pads: launch the car.
      for (const pad of W.city.jumpPads) {
        const d = Math.hypot(car.pos.x - pad.x, car.pos.z - pad.z);
        if (d < 3.4 && Math.abs(car.speed) > 8 && this._vy === 0) {
          this._vy = CFG.PAD_LIFT;
        }
      }
      // Air time + stunt pay.
      if (this._vy !== 0 || car.pos.y > 0.01) {
        this._vy -= CFG.PAD_GRAV * dt;
        car.pos.y = Math.max(0, (car.pos.y || 0) + this._vy * dt);
        this._airT += dt;
        car.sync();
        if (car.pos.y === 0 && this._airT > CFG.STUNT_MIN_AIR) {
          const pay = Math.min(CFG.STUNT_PAY_CAP, Math.floor(this._airT * CFG.STUNT_PAY_PER_SEC));
          W.money += pay;
          W.hud.showMessage(`Stunt! +$${pay}`, 2);
          W.sound.pickup();
        }
        if (car.pos.y === 0) {
          this._vy = 0;
          this._airT = 0;
        }
      }
      // Near miss: flashing past a traffic car at speed.
      const near = W.traffic.nearestTo(car.pos.x, car.pos.z, CFG.MISS_RANGE + 2);
      if (near && Math.abs(car.speed) > CFG.MISS_MIN_SPEED && W.time - this._nearAt > CFG.MISS_COOLDOWN) {
        W.money += CFG.MISS_PAY;
        this._nearAt = W.time;
        W.hud.showMessage(`Near miss! +$${CFG.MISS_PAY}`, 1.5);
      }
      // Horn.
      if (this.input.isDown(CFG.KEYS.HORN) && W.time - this._hornAt > 0.9) {
        this._hornAt = W.time;
        W.sound.horn();
      }
    } else {
      W.hero.update(dt, this.input, W.city, this._yaw);
      W.sound.engineOff();
    }

    // World systems.
    const playerCar = W.hero.car;
    W.traffic.setPlayer(playerCar);
    W.traffic.update(dt);
    W.crowd.update(dt, playerCar, W.police.cops);
    W.police.update(dt, W.hero, W.parked);
    W.sound.siren(W.police.cops.length > 0);
    W.sound.rotor(!!W.police.heli);

    // Missions.
    const outcome = W.quests.update(dt, this._questCtx());
    if (outcome) {
      if (outcome.result === 'complete') {
        W.money += outcome.pay;
        storeSave(W.money);
        W.sound.win();
        this.hud.showDone(`${outcome.job.id.toUpperCase()} — $${outcome.pay} banked`);
        W.mode = 'done';
      } else {
        W.sound.thud();
        W.hud.showMessage('Mission failed — try again from the M menu.', 3.5);
      }
    }

    // Busted?
    if (W.hero.health <= 0) {
      W.mode = 'busted';
      this.hud.showBusted();
      W.sound.engineOff();
    }

    this._stepEffects(dt);
    this._updateCamera(dt);
    this._refreshHud(dt);
  }

  // One HUD refresh from the shared state, so the loop and the
  // screenshot staging paint the same frame.
  _refreshHud(dt) {
    const W = this.world;
    const target = W.quests.target();
    W.hud.refresh({
      money: W.money,
      wanted: W.police.wanted,
      hour: W.hour,
      health: W.hero.health,
      armor: W.hero.armor,
      stamina: W.hero.stamina,
      weapon: W.hero.weapon,
      ammo: W.hero.ammo,
      reloading: W.hero.reloading,
      speed: W.hero.car ? W.hero.car.speed : 0,
      onFoot: !W.hero.car,
      objective: W.quests.hint(),
      map: {
        city: W.city,
        x: W.hero.pos.x,
        z: W.hero.pos.z,
        heading: W.hero.car ? W.hero.car.heading : W.hero.heading,
        target,
        blips: W.police.cops.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      },
    }, W.quests.timeLeft);
    W.hud.tickMessage(dt);
  }

  _loop() {
    const loop = (t) => {
      const now = t / 1000;
      if (!this._last) this._last = now;
      const dt = Math.min(FRAME_CAP, now - this._last);
      this._last = now;
      this._acc += dt;
      let guard = 0;
      while (this._acc >= STEP && guard < 8) {
        this.step(STEP);
        this._acc -= STEP;
        guard += 1;
      }
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---- screenshot staging ----
  _stage(name) {
    composeShot(name, this.world);
    // A staged shot renders a single frame, so the loop's camera and
    // HUD updates never run: position the camera on the staged scene
    // (a long dt lets the follow yaw settle) and paint the HUD once,
    // so the minimap, money and stars are drawn before the capture.
    this._updateCamera(0.5);
    this._updateCamera(0.5);
    this._refreshHud(1 / 60);
    this.renderer.render(this.scene, this.camera);
    window.__shotReady = true;
  }
}

const harbor = new Harbor();
harbor.start();
