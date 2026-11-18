// v4 — main.js
// VICE HARBOR — boot and the one game loop. A Game object builds the
// shared state G, wires world → player → vehicles / traffic /
// pedestrians / police / missions / audio / hud, runs the third-person
// camera, and owns the game states: 'menu' | 'playing' | 'paused' |
// 'busted' | 'mission-complete'.
//
// ?seed=N fixes the world seed. ?shot=start|drive|chase|end stages that
// screenshot scene instead of the interactive loop, renders it, and sets
// window.__shotReady for the capture.
//
// New in v4: a full DAY/NIGHT cycle (the sun, sky, fog and lamps follow
// the in-game hour — dusk is the default, and the game runs a whole day
// in 8 minutes); a WEAPON (Q draws the pistol, F fires a hitscan shot
// with a tracer and a muzzle flash, R reloads); and EXPLOSIONS — a hard
// crash (or a pistol hit on a fuel tank, i.e. any vehicle) sets off a
// fireball that lights the street, the way the reference screenshot's
// explosion does.
//
// The other builders' systems (vehicles, traffic, pedestrians, police,
// missions, audio) are loaded with dynamic import() guarded by try/catch,
// so the game still runs if one of them is missing.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRNG, angleLerp } from './random.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Input, ACTION_PAUSE, ACTION_ENTER_EXIT, ACTION_MISSION_MENU, ACTION_CONFIRM, ACTION_CAMERA, ACTION_PUNCH, ACTION_WEAPON, ACTION_RELOAD, ACTION_PHOTO } from './input.js';
import { HUD } from './hud.js';
import { applyPixelRatio, resizeToCanvas, approachFov } from './render.js';
import { stageShot, SHOT_NAMES, makeFireball } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY = 'vice-harbor.save';
const HEALTH_REGEN_DELAY = 6; // quiet seconds before health starts coming back
const HEALTH_REGEN_RATE = 3; // health per second while recovering
const HORN_COOLDOWN = 0.9; // seconds between horn honks

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CONFIG.WORLD_SEED;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { money: 0 };
    const data = JSON.parse(raw);
    return { money: typeof data.money === 'number' ? data.money : 0 };
  } catch {
    return { money: 0 };
  }
}

function writeSave(money) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ money }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

// Load one optional system module; warn and continue when it is missing.
async function loadSystem(path) {
  try {
    return await import(path);
  } catch (err) {
    console.warn('[VICE HARBOR] optional system not loaded:', path, err && err.message ? err.message : err);
    return null;
  }
}

class Game {
  constructor() {
    // Shared game state — the contract every system reads and writes.
    // Systems that need a live reference (shots.js, hud.js, missions.js)
    // read it off this object, so its field names are the game's API.
    this.G = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.input = null;
    this.world = null;
    this.player = null;
    this.hud = null;
    this._vehiclesMod = null;
    this._accumulator = 0;
    this._last = 0;
    this._hornAt = -Infinity;
    // Stunt state: vertical velocity and air time while the car is
    // airborne off a jump pad, and the last near-miss payout time so
    // the same traffic car cannot pay twice in one pass.
    this._vy = 0;
    this._airTime = 0;
    this._nearMissAt = -Infinity;
    this._nearMissCar = null;
    // Live explosions and pistol tracers: each entry is { sprite, light,
    // t, life } (explosions) or { line, t, life } (tracers), animated in
    // the frame loop and removed when their life runs out.
    this._explosions = [];
    this._tracers = [];
  }

  async start() {
    this._buildRenderer();
    this._buildWorld();
    this._buildState();
    await this._loadSystems();
    this._bindHud();
    this._bindResize();
    if (shot && SHOT_NAMES.includes(shot)) {
      this._stageShot(shot);
      return;
    }
    this._runLoop();
  }

  _buildRenderer() {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(1280, 720, false);
    applyPixelRatio(renderer);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Shadows on — the dusk sun throws long shadows off the towers.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(CONFIG.FOG_COLOR, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 1200);
    camera.position.set(40, 30, 60);
    this.camera = camera;
  }

  _buildWorld() {
    const input = new Input(canvas);
    const world = createWorld(THREE, seed);
    this.scene.add(world.group);
    const player = new Player(THREE, world);
    this.scene.add(player.mesh);
    this.input = input;
    this.world = world;
    this.player = player;
    this.hud = new HUD();
  }

  _buildState() {
    const save = readSave();
    this.G = {
      THREE, scene: this.scene, camera: this.camera, renderer: this.renderer,
      clock: new THREE.Clock(),
      input: this.input, world: this.world, player: this.player,
      vehicles: [], traffic: null, pedestrians: null, police: null,
      missions: null, hud: this.hud, audio: null,
      money: save.money, wanted: 0, time: 0, state: 'menu',
      health: 100, armor: 50, _lastDamageAt: -Infinity,
      playerVehicle: null,
      cameraYaw: 0, cameraPitch: 0.22, cameraDist: 7.5,
      // Camera: 'follow' eases behind the car while driving (drag adds a
      // decaying offset); 'orbit' is the old free camera. On foot it is
      // always a free orbit. Closer and lower (GTA-style) — 7.5 m back,
      // a low 0.22 pitch — so the character and the car fill the frame
      // and the city crowds the screen instead of empty road.
      cameraMode: 'follow', camOffset: 0,
      heistTruck: null,
      // The in-game hour (18.5 = 18:30 dusk at boot); the day/night
      // cycle advances it, and the HUD clock reads it.
      hour: CONFIG.DAY_START_HOUR,
    };
  }

  // ---- explosions + tracers ----
  // A fireball at (x, z): a big radial-gradient sprite plus a point
  // light, growing and fading over ~1 s. Used for hard crashes and for
  // pistol hits on a vehicle.
  spawnExplosion(x, z, scale) {
    const boom = makeFireball(THREE, x, z, scale || 7);
    this.scene.add(boom.sprite);
    this.scene.add(boom.light);
    this._explosions.push({ sprite: boom.sprite, light: boom.light, t: 0, life: 1.0, base: scale || 7 });
    if (this.G && this.G.audio) {
      try { this.G.audio.crash(); } catch (e) { /* audio is best-effort */ }
    }
    return boom;
  }

  // A pistol tracer: a bright line from the muzzle to the hit point,
  // fading in a tenth of a second, plus a small muzzle flash.
  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      from.x, from.y, from.z, to.x, to.y, to.z,
    ], 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.95,
    }));
    this.scene.add(line);
    this._tracers.push({ line, t: 0, life: 0.12 });
    // Muzzle flash: a small fireball at the muzzle, gone in a blink.
    const flash = makeFireball(THREE, from.x, from.z, 1.6);
    flash.sprite.position.y = from.y;
    this.scene.add(flash.sprite);
    this._explosions.push({ sprite: flash.sprite, light: null, t: 0, life: 0.08, base: 1.6 });
  }

  // Animate the live explosions and tracers; called once per frame.
  _updateEffects(dt) {
    for (let i = this._explosions.length - 1; i >= 0; i--) {
      const e = this._explosions[i];
      e.t += dt;
      const k = e.t / e.life;
      if (k >= 1) {
        this.scene.remove(e.sprite);
        if (e.light) this.scene.remove(e.light);
        this._explosions.splice(i, 1);
        continue;
      }
      const s = e.base * (0.6 + k * 1.4);
      e.sprite.scale.set(s, s, 1);
      e.sprite.material.opacity = 1 - k;
      if (e.light) e.light.intensity = 60 * (1 - k);
    }
    for (let i = this._tracers.length - 1; i >= 0; i--) {
      const tr = this._tracers[i];
      tr.t += dt;
      const k = tr.t / tr.life;
      if (k >= 1) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        this._tracers.splice(i, 1);
        continue;
      }
      tr.line.material.opacity = 0.95 * (1 - k);
    }
  }

  // A crash thud (and a dent in the health/armor bars) for any car the
  // player drives into a wall: the hook reads G.audio at crash time, so
  // it works once audio loads. A HARD crash also sets off a fireball —
  // the reference screenshot's explosion, live in the game.
  _onPlayerCrash(impactSpeed) {
    const G = this.G;
    if (G.audio) { try { G.audio.crash(); } catch (e) { /* ignore */ } }
    this.damage(Math.max(0, (impactSpeed || 0) * 0.4));
    const v = G.playerVehicle;
    if (v && impactSpeed > 12) {
      this.spawnExplosion(v.pos.x, v.pos.z, 8);
    }
  }

  _wireCrashHook(vehicle) {
    vehicle.onCrash = () => { this._onPlayerCrash(Math.abs(vehicle.speed || 0)); };
  }

  async _loadSystems() {
    const G = this.G;
    const { scene, world } = this;

    const vehiclesMod = await loadSystem('./vehicles.js');
    this._vehiclesMod = vehiclesMod;
    if (vehiclesMod && typeof vehiclesMod.spawnParkedCars === 'function') {
      try {
        const rng = createRNG(CONFIG.WORLD_SEED + 7);
        G.vehicles = vehiclesMod.spawnParkedCars(THREE, world, rng, 10) || [];
      } catch (err) {
        console.warn('[VICE HARBOR] spawnParkedCars failed:', err);
        G.vehicles = [];
      }
    }
    for (const v of G.vehicles) {
      scene.add(v.mesh);
      this._wireCrashHook(v);
    }

    const trafficMod = await loadSystem('./traffic.js');
    if (trafficMod && typeof trafficMod.createTraffic === 'function') {
      try {
        const rng = createRNG(CONFIG.WORLD_SEED + 11);
        G.traffic = trafficMod.createTraffic(THREE, world, rng, CONFIG.TRAFFIC_COUNT);
        if (G.traffic && G.traffic.cars) for (const c of G.traffic.cars) scene.add(c.mesh);
      } catch (err) {
        console.warn('[VICE HARBOR] createTraffic failed:', err);
      }
    }

    const pedMod = await loadSystem('./pedestrians.js');
    if (pedMod && typeof pedMod.createPedestrians === 'function') {
      try {
        const rng = createRNG(CONFIG.WORLD_SEED + 13);
        G.pedestrians = pedMod.createPedestrians(THREE, world, rng, CONFIG.PEDESTRIAN_COUNT);
        if (G.pedestrians && G.pedestrians.people) for (const p of G.pedestrians.people) scene.add(p.mesh);
      } catch (err) {
        console.warn('[VICE HARBOR] createPedestrians failed:', err);
      }
    }

    const policeMod = await loadSystem('./police.js');
    if (policeMod && typeof policeMod.createPolice === 'function') {
      try {
        G.police = policeMod.createPolice(THREE, world);
        if (G.police && G.police.copCars) for (const c of G.police.copCars) scene.add(c.mesh);
      } catch (err) {
        console.warn('[VICE HARBOR] createPolice failed:', err);
      }
    }

    const missionsMod = await loadSystem('./missions.js');
    if (missionsMod && typeof missionsMod.createMissions === 'function') {
      try {
        G.missions = missionsMod.createMissions(world);
        if (G.missions && G.missions.marker) scene.add(G.missions.marker);
        G.missions.onComplete = (result) => this._onMissionComplete(result);
      } catch (err) {
        console.warn('[VICE HARBOR] createMissions failed:', err);
      }
    }

    const audioMod = await loadSystem('./audio.js');
    if (audioMod && audioMod.AudioEngine) {
      try {
        G.audio = new audioMod.AudioEngine();
      } catch (err) {
        console.warn('[VICE HARBOR] AudioEngine failed:', err);
      }
    }
  }

  // missions.js finishes a job by calling onComplete(lastResult) and
  // banks the payout into G.money itself — so this handler only shows
  // the result and changes state, and never adds the payout twice.
  _onMissionComplete(result) {
    const G = this.G;
    if (!result) return;
    if (result.failed) {
      this.hud.showMessage('Mission failed — press M to try another');
      return;
    }
    writeSave(G.money);
    G.state = 'mission-complete';
    const def = (G.missions.list || []).find((mm) => mm.id === result.mission) || {};
    const title = def.title || 'Mission';
    this.hud.showMissionComplete(title + ' complete — $' + result.payout + ' banked.');
    if (G.audio) { try { G.audio.success(); } catch (e) { /* ignore */ } }
    announce('Mission complete. $' + result.payout + ' earned.');
  }

  _bindHud() {
    this.hud.bind({
      onStart: () => this._startPlaying(),
      onResume: () => this._resumeGame(),
      onRetry: () => this._restartAfterBusted(),
      onContinue: () => { this.hud.hideMissionComplete(); this.G.state = 'playing'; },
      onMissionPick: (i) => this._startMission(i),
    });
  }

  // ---- health / armor ----
  // Armor soaks damage first; health recovers slowly after a quiet spell.
  // Health never kills the player on its own (no surprise game-over from
  // one bad crash) — the bars are pressure, not a second bust meter.
  damage(amount) {
    const G = this.G;
    if (!(amount > 0)) return;
    G._lastDamageAt = G.time;
    let rest = amount;
    if (G.armor > 0) {
      const soaked = Math.min(G.armor, rest);
      G.armor -= soaked;
      rest -= soaked;
    }
    G.health = Math.max(0, G.health - rest);
  }

  // ---- wanted helper (keeps G.wanted in sync with the police system) ----
  addWanted(n) {
    const G = this.G;
    if (G.police && typeof G.police.addWanted === 'function') {
      G.police.addWanted(n);
      if (typeof G.police.wanted === 'number') G.wanted = G.police.wanted;
    } else {
      G.wanted = Math.max(0, Math.min(CONFIG.WANTED_MAX, G.wanted + n));
    }
  }

  // ---- camera ----
  _updateCamera(dt) {
    const G = this.G;
    const { input, camera, player } = this;
    const drag = input.consumeDrag();
    G.cameraPitch = Math.max(0.08, Math.min(1.1, G.cameraPitch + drag.dy * 0.004));
    const wheel = input.consumeWheel();
    if (wheel !== 0) G.cameraDist = Math.max(5, Math.min(20, G.cameraDist + wheel * 0.01));

    const driving = !!(G.playerVehicle && !player.onFoot);
    if (driving && G.cameraMode === 'follow') {
      // Behind-car follow: ease the yaw toward (heading + PI) so the car
      // always drives away from the camera after a turn; a mouse drag
      // adds an offset that decays back to straight behind the car.
      G.camOffset -= drag.dx * 0.005;
      G.camOffset *= Math.exp(-dt * 0.9);
      const desired = G.playerVehicle.heading + Math.PI + G.camOffset;
      G.cameraYaw = angleLerp(G.cameraYaw, desired, 1 - Math.exp(-dt * 2.4));
    } else {
      // Free orbit (on foot, or C toggled to orbit while driving).
      G.cameraYaw -= drag.dx * 0.005;
      if (driving) G.camOffset = 0;
    }
    // FOV kick with speed: 62 at rest, ~72 flat out.
    const speed01 = driving
      ? Math.min(1, Math.abs(G.playerVehicle.speed || 0) / CONFIG.CAR_MAX_SPEED)
      : 0;
    approachFov(camera, 62 + speed01 * 10, dt, 3);

    const target = driving
      ? G.playerVehicle.pos
      : player.pos;
    const dist = G.cameraDist;
    const cx = target.x + Math.sin(G.cameraYaw) * Math.cos(G.cameraPitch) * dist;
    const cz = target.z + Math.cos(G.cameraYaw) * Math.cos(G.cameraPitch) * dist;
    const cy = 1.6 + Math.sin(G.cameraPitch) * dist;
    const k = 1 - Math.min(1, dt * 8);
    camera.position.x = camera.position.x * k + cx * (1 - k);
    camera.position.y = camera.position.y * k + cy * (1 - k);
    camera.position.z = camera.position.z * k + cz * (1 - k);
    camera.lookAt(target.x, target.y + 1.6, target.z);
  }

  // ---- enter / exit car ----
  _nearestVehicle(maxDist) {
    const { player } = this;
    let best = null;
    let bestD = maxDist;
    for (const v of this.G.vehicles) {
      const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  _enterExitCar() {
    const G = this.G;
    const { player, hud } = this;
    if (player.onFoot) {
      const v = this._nearestVehicle(4);
      if (!v) {
        hud.showMessage('No car nearby — find one on the road');
        return;
      }
      player.enterVehicle(v);
      G.playerVehicle = v;
      if (typeof v.setHeadlights === 'function') v.setHeadlights(true);
      if (G.audio) G.audio.blip();
      hud.showMessage('Car stolen — drive!');
      announce('In a car. W A S D to drive.');
      // Theft heat: the crime is the theft, so the wanted level lands
      // when the player gets into a car during a mission — not at the
      // briefing, when they may still be on foot with no car.
      const active = G.missions && G.missions.active;
      if (active && !active.heatApplied) {
        if (active.id === 'getaway') {
          active.heatApplied = true;
          this.addWanted(1);
          hud.showMessage('Car stolen — the heat is on!');
        } else if (active.id === 'heist' && v.armored) {
          active.heatApplied = true;
          this.addWanted(2);
          hud.showMessage('Armored truck stolen — 2 stars on you!');
        }
      }
    } else {
      const v = G.playerVehicle;
      if (v && typeof v.setHeadlights === 'function') v.setHeadlights(false);
      player.exitVehicle();
      G.playerVehicle = null;
      if (v) v.speed = 0;
      hud.showMessage('On foot');
    }
  }

  // ---- on-foot combat (F): punch with fists, fire with the pistol ----
  _doPunch() {
    const G = this.G;
    const { player, hud } = this;
    if (!player.onFoot) return;
    // Pistol drawn: F fires a hitscan shot.
    if (player.weapon === 'pistol') {
      this._doShoot();
      return;
    }
    if (typeof player.punch !== 'function' || !player.punch()) return;
    let best = null;
    let bestD = 2.2;
    if (G.pedestrians && G.pedestrians.people) {
      for (const p of G.pedestrians.people) {
        if (p.state === 'down') continue;
        const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
        if (d < bestD) { bestD = d; best = p; }
      }
    }
    if (G.audio) { try { G.audio.thud(); } catch (e) { /* ignore */ } }
    if (best && G.pedestrians && typeof G.pedestrians.shove === 'function') {
      G.pedestrians.shove(best, player.pos.x, player.pos.z);
      this.addWanted(1);
      hud.showMessage('You shoved a pedestrian — the cops noticed!');
      announce('You shoved a pedestrian. Wanted level up.');
    }
  }

  // Fire the pistol: the tracer + muzzle flash, the gunshot sound, and
  // the hit — a pedestrian goes down, a fleeing car stops, a cop or a
  // bystander notices, and a hit on any vehicle sets off a fireball.
  _doShoot() {
    const G = this.G;
    const { player, hud } = this;
    const cops = G.police ? G.police.copCars : null;
    const result = player.shoot(G.pedestrians, G.vehicles, cops);
    if (!result) return; // reloading / cooling down / not drawn
    if (result.empty) {
      if (G.audio) { try { G.audio.dryfire(); } catch (e) { /* ignore */ } }
      hud.showMessage('Out of ammo — press R to reload');
      return;
    }
    this.spawnTracer(result.from, result.to);
    if (G.audio) { try { G.audio.gunshot(); } catch (e) { /* ignore */ } }
    if (result.hit === 'pedestrian' && result.person) {
      G.pedestrians.shove(result.person, player.pos.x, player.pos.z);
      this.addWanted(1);
      hud.showMessage('You shot a pedestrian — the cops are coming!');
    } else if (result.hit === 'cop' && result.cop) {
      this.addWanted(1);
      hud.showMessage('You shot at the police!');
    } else if (result.hit === 'vehicle' && result.vehicle) {
      // A hit on a vehicle: the fuel tank goes up.
      this.spawnExplosion(result.to.x, result.to.z, 6);
      this.addWanted(1);
      // The vigilante job: a pistol hit stops a fleeing car.
      if (G.missions && G.missions.active && G.missions.active.id === 'vigilante'
        && G.missions.fleeing && G.missions.fleeing.includes(result.vehicle)) {
        G.missions.stopFleeing(result.vehicle, G);
      }
    }
  }

  // ---- missions ----
  _startMission(i) {
    const G = this.G;
    const { hud } = this;
    if (!G.missions || typeof G.missions.start !== 'function') {
      hud.showMessage('Missions not loaded yet');
      return;
    }
    try {
      const started = G.missions.start(i, G);
      const m = started || null;
      if (!m) return;
      hud.showMessage((m.title || 'Mission') + ' — ' + (m.objective || m.brief || ''));
      announce('Mission started.');
      // Harbor Heist: park the armored truck at its spot (or put it
      // back there if a failed run moved it).
      if (m.id === 'heist' && this._vehiclesMod && typeof this._vehiclesMod.spawnArmoredTruck === 'function') {
        const spot = G.missions.heistTruckPos || { x: 46, z: -58 };
        if (!G.heistTruck) {
          const rng = createRNG(CONFIG.WORLD_SEED + 17);
          const truck = this._vehiclesMod.spawnArmoredTruck(THREE, G.world, rng);
          truck.setPose(spot.x, spot.z, Math.PI / 2);
          this.scene.add(truck.mesh);
          G.vehicles.push(truck);
          this._wireCrashHook(truck);
          G.heistTruck = truck;
        } else {
          G.heistTruck.setPose(spot.x, spot.z, Math.PI / 2);
          G.heistTruck.speed = 0;
        }
      }
    } catch (err) {
      console.warn('[VICE HARBOR] mission start failed:', err);
    }
  }

  _startPlaying() {
    const G = this.G;
    this.hud.hideStart();
    G.state = 'playing';
    if (G.audio) { try { G.audio.ensure(); } catch (e) { /* ignore */ } }
    announce('Playing. W A S D to move, E to enter a car, M for missions.');
  }

  _resumeGame() {
    this.hud.hidePause();
    this.G.state = 'playing';
  }

  _restartAfterBusted() {
    const G = this.G;
    this.hud.hideBusted();
    G.wanted = 0;
    G.health = 100;
    G.armor = 50;
    // reset() clears the stars, the cruisers, the helicopter AND the
    // busted flag — the plain addWanted(-99) left busted set and
    // re-busted on the next step.
    if (G.police && typeof G.police.reset === 'function') {
      try { G.police.reset(); } catch (e) { /* ignore */ }
    } else if (G.police && typeof G.police.addWanted === 'function') {
      try { G.police.addWanted(-99); } catch (e) { /* ignore */ }
    }
    this.player.teleport(this.world.spawnPoints.player[0], this.world.spawnPoints.player[1], 0);
    if (G.playerVehicle) { G.playerVehicle.speed = 0; }
    this.player.onFoot = true;
    G.playerVehicle = null;
    G.state = 'playing';
    announce('Back on the streets.');
  }

  // ---- one fixed step ----
  // The state dispatch: each game state has its own step, so the main
  // loop reads as a table instead of a nested if/else chain.
  _stepMenu(dt, actions) {
    const G = this.G;
    if (actions & ACTION_CONFIRM) { this._startPlaying(); return; }
    // Lively backdrop: traffic and pedestrians keep moving.
    if (G.traffic) G.traffic.update(dt);
    if (G.pedestrians) G.pedestrians.update(dt);
  }

  _stepPaused(actions) {
    if (actions & ACTION_CONFIRM) this._resumeGame();
  }

  _stepBusted(actions) {
    if (actions & ACTION_CONFIRM) this._restartAfterBusted();
  }

  _stepComplete(actions) {
    if (actions & ACTION_CONFIRM) {
      this.hud.hideMissionComplete();
      this.G.state = 'playing';
    }
  }

  _stepPlaying(dt, actions) {
    const G = this.G;
    const { input, player, hud } = this;
    if (actions & ACTION_PAUSE) {
      hud.showPause();
      G.state = 'paused';
      return;
    }
    if (actions & ACTION_MISSION_MENU) {
      hud.toggleMissionMenu(G.missions, G.missions && G.missions.active ? G.missions.active.id : null);
    }
    // Keys 1-7 pick a mission while the M menu is open.
    const digit = input.takeDigitPick();
    if (digit && typeof hud.missionMenuOpen === 'function' && hud.missionMenuOpen()) {
      hud.hideMissionMenu();
      this._startMission(digit - 1);
    }
    if (actions & ACTION_CAMERA) {
      G.cameraMode = G.cameraMode === 'follow' ? 'orbit' : 'follow';
      G.camOffset = 0;
      hud.showMessage('Camera: ' + (G.cameraMode === 'follow' ? 'follow — behind the car' : 'free orbit'));
      if (G.audio) { try { G.audio.blip(); } catch (e) { /* ignore */ } }
    }
    if (actions & ACTION_PUNCH) this._doPunch();
    if (actions & ACTION_ENTER_EXIT) this._enterExitCar();
    // Q: draw / holster the pistol. R: reload it.
    if (actions & ACTION_WEAPON) {
      const w = player.switchWeapon();
      hud.showMessage(w === 'pistol' ? 'Pistol drawn — F to fire, R to reload' : 'Fists — F to punch');
      if (G.audio) { try { G.audio.blip(); } catch (e) { /* ignore */ } }
    }
    if (actions & ACTION_RELOAD) {
      if (player.reload()) hud.showMessage('Reloading…');
    }
    // V: photo mode — hide the HUD chrome for a clean screenshot.
    if (actions & ACTION_PHOTO) {
      const on = hud.setPhotoMode(!hud.photoModeOn());
      if (!on) hud.showMessage('HUD back on', 2);
      if (G.audio) { try { G.audio.blip(); } catch (e) { /* ignore */ } }
    }

    // H key: honk while driving (throttled so it cannot machine-gun).
    if (input.isDown && input.isDown(CONFIG.KEYS.HORN) && G.playerVehicle && !player.onFoot
      && G.audio && typeof G.audio.horn === 'function' && G.time - this._hornAt > HORN_COOLDOWN) {
      this._hornAt = G.time;
      try { G.audio.horn(); } catch (e) { /* ignore */ }
    }

    if (player.onFoot) {
      player.update(dt, input, this.world, G.cameraYaw);
    } else if (G.playerVehicle) {
      G.playerVehicle.update(dt, input, this.world);
      player.pos.copy(G.playerVehicle.pos);
      player.heading = G.playerVehicle.heading;
    }

    // Jump pads and stunt pay (driving only): a pad throws the car into
    // the air, gravity brings it back, and a landing after a real flight
    // pays by the second. While airborne the car keeps its forward
    // momentum (Vehicle.update still moves x/z); only the height is
    // owned here, so the arc is a clean parabola.
    if (!player.onFoot && G.playerVehicle) {
      const car = G.playerVehicle;
      const grounded = car.pos.y <= 0 && this._vy === 0;
      if (grounded && this.world && this.world.jumpPads) {
        for (const pad of this.world.jumpPads) {
          const dx = car.pos.x - pad.x;
          const dz = car.pos.z - pad.z;
          if (dx * dx + dz * dz < pad.radius * pad.radius) {
            this._vy = CONFIG.JUMP_PAD_BOOST;
            this._airTime = 0;
            car.pos.y = 0.05;
            if (G.audio) { try { G.audio.blip(); } catch (e) { /* ignore */ } }
            break;
          }
        }
      }
      if (this._vy !== 0 || car.pos.y > 0) {
        car.pos.y += this._vy * dt;
        this._vy -= CONFIG.JUMP_PAD_GRAVITY * dt;
        this._airTime += dt;
        if (car.pos.y <= 0) {
          car.pos.y = 0;
          if (this._airTime >= CONFIG.STUNT_MIN_AIR) {
            const pay = Math.min(CONFIG.STUNT_PAY_CAP, Math.round(this._airTime * CONFIG.STUNT_PAY_PER_SEC));
            G.money += pay;
            writeSave(G.money);
            hud.showMessage(`STUNT! ${this._airTime.toFixed(1)}s in the air — +$${pay}`, 3);
            if (G.audio) { try { G.audio.blip(); } catch (e) { /* ignore */ } }
          }
          this._vy = 0;
          this._airTime = 0;
        }
      }
      // Near miss: flashing past a traffic car at speed, close enough to
      // feel it but without touching it, pays a small bonus. The same
      // car cannot pay twice inside the cooldown.
      if (Math.abs(car.speed || 0) >= CONFIG.NEAR_MISS_MIN_SPEED && G.traffic && G.traffic.cars) {
        for (const other of G.traffic.cars) {
          if (!other || !other.pos) continue;
          const dx = car.pos.x - other.pos.x;
          const dz = car.pos.z - other.pos.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > 1.5 && d < CONFIG.NEAR_MISS_RANGE
            && (other !== this._nearMissCar || G.time - this._nearMissAt > CONFIG.NEAR_MISS_COOLDOWN)) {
            this._nearMissCar = other;
            this._nearMissAt = G.time;
            G.money += CONFIG.NEAR_MISS_PAY;
            writeSave(G.money);
            hud.showMessage(`NEAR MISS +$${CONFIG.NEAR_MISS_PAY}`, 2);
            break;
          }
        }
      }
    }

    if (G.traffic) G.traffic.update(dt, G.playerVehicle, G.pedestrians);
    // The crowd flees the player's car AND the police cruisers.
    if (G.pedestrians) {
      G.pedestrians.update(dt, G.playerVehicle, G.police ? G.police.copCars : null);
    }
    if (G.police) {
      G.police.update(dt, player, G.vehicles);
      if (typeof G.police.wanted === 'number') G.wanted = G.police.wanted;
      if (G.police.busted) {
        G.state = 'busted';
        hud.showBusted();
        announce('Busted by the police.');
        return;
      }
    }
    // Health recovers after a quiet spell.
    if (G.health < 100 && G.time - G._lastDamageAt > HEALTH_REGEN_DELAY) {
      G.health = Math.min(100, G.health + HEALTH_REGEN_RATE * dt);
    }

    // Missions drive themselves: update() advances the clock and the
    // checkpoints, and calls G.missions.onComplete when the job ends
    // (complete or failed) — see the handler wired at boot.
    if (G.missions && typeof G.missions.update === 'function') {
      G.missions.update(dt, player, G);
    }

    // Audio: engine hum follows speed, sirens follow the police siren flag.
    if (G.audio) {
      try {
        const speed01 = G.playerVehicle && !player.onFoot
          ? Math.min(1, Math.abs(G.playerVehicle.speed || 0) / CONFIG.CAR_MAX_SPEED)
          : Math.min(1, (player.speed || 0) / CONFIG.RUN_SPEED) * 0.5;
        G.audio.engine(speed01);
        G.audio.siren(G.police ? !!G.police.siren : G.wanted >= 1);
        G.audio.rotor(G.police && G.police.heli ? 0.7 : 0);
      } catch (e) { /* audio is best-effort */ }
    }
  }

  _step(dt) {
    const G = this.G;
    G.time += dt;
    // The day/night cycle: the in-game hour advances with the clock, and
    // the world's lighting follows it (dusk at boot, night, dawn, day).
    G.hour = (CONFIG.DAY_START_HOUR + (G.time / CONFIG.DAY_LENGTH) * 24) % 24;
    if (this.world && typeof this.world.setHour === 'function') {
      this.world.setHour(G.hour, this.scene);
    }
    // One-shot presses are taken once per step, whatever the state is —
    // so Enter/Space works on every screen, not just in play.
    const actions = this.input.takeActions();
    const dispatch = {
      menu: () => this._stepMenu(dt, actions),
      paused: () => this._stepPaused(actions),
      busted: () => this._stepBusted(actions),
      'mission-complete': () => this._stepComplete(actions),
      playing: () => this._stepPlaying(dt, actions),
    };
    const run = dispatch[G.state];
    if (run) run();
  }

  _bindResize() {
    const onResize = () => resizeToCanvas(this.renderer, this.camera);
    window.addEventListener('resize', onResize);
    onResize();
  }

  // ---- screenshot staging ----
  _stageShot(shotName) {
    const G = this.G;
    // Build a playable-looking scene deterministically, then freeze.
    G.state = 'playing';
    stageShot(shotName, G);
    // Render a few frames so the canvas is painted, then signal readiness.
    let painted = 0;
    const paintShot = () => {
      this.renderer.render(this.scene, this.camera);
      painted += 1;
      if (painted < 3) requestAnimationFrame(paintShot);
      else window.__shotReady = true;
    };
    requestAnimationFrame(paintShot);
  }

  // ---- interactive loop ----
  _runLoop() {
    const G = this.G;
    this.hud.showStart();
    announce('VICE HARBOR. Click Start to play.');
    this._accumulator = 0;
    this._last = performance.now();

    const frame = (now) => {
      requestAnimationFrame(frame);
      const frameDt = Math.min((now - this._last) / 1000, MAX_FRAME);
      this._last = now;
      if (G.state === 'paused') {
        // Still step once per frame while paused, so Enter/Space (confirm)
        // can resume — step's paused branch only consumes that action.
        this._step(STEP);
        this.renderer.render(this.scene, this.camera);
        return;
      }
      this._accumulator += frameDt;
      let guard = 0;
      while (this._accumulator >= STEP && guard < 8) {
        this._step(STEP);
        this._accumulator -= STEP;
        guard += 1;
      }
      if (guard >= 8) this._accumulator = 0;
      // Menu camera: a slow, CLOSE orbit around the player on foot —
      // the menu used to orbit the whole city from 170 m up, so the
      // character was invisible. Now it circles 13 m out at 5.5 m high,
      // starting behind the player (facing east into the sunset), so the
      // menu screen always has the character, the street and the crowd
      // in frame, GTA-style.
      if (G.state === 'menu') {
        const t = Math.PI + G.time * 0.05;
        const px = G.player ? G.player.pos.x : 0;
        const pz = G.player ? G.player.pos.z : 0;
        this.camera.position.set(px + Math.cos(t) * 13, 5.5, pz + Math.sin(t) * 13);
        this.camera.lookAt(px, 1.5, pz);
      } else {
        this._updateCamera(frameDt);
      }
      // The harbour lives: boats bob, the lighthouse beam sweeps, the
      // ferris wheel turns, the clouds drift.
      if (this.world.tick) {
        try { this.world.tick(frameDt, G.time); } catch (e) { /* garnish */ }
      }
      // Explosions and tracers animate and fade.
      this._updateEffects(frameDt);
      this.hud.update(G);
      this.renderer.render(this.scene, this.camera);
    };

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && G.state === 'playing') {
        this.hud.showPause();
        G.state = 'paused';
        announce('Paused.');
      }
    });

    requestAnimationFrame(frame);
  }
}

const game = new Game();
game.start().catch((err) => {
  console.error('[VICE HARBOR] boot failed:', err);
  if (statusEl) statusEl.textContent = 'VICE HARBOR failed to start: ' + (err && err.message ? err.message : err);
});
