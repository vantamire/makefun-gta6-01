// VICE HARBOR — boot and the one game loop. Builds the shared state G,
// wires world → player → vehicles / traffic / pedestrians / police /
// missions / audio / hud, runs the third-person camera, and owns the game
// states: 'menu' | 'playing' | 'paused' | 'busted' | 'mission-complete'.
//
// ?seed=N fixes the world seed. ?shot=start|drive|chase|end stages that
// screenshot scene instead of the interactive loop, renders it, and sets
// window.__shotReady for the capture.
//
// The other builders' systems (vehicles, traffic, pedestrians, police,
// missions, audio) are loaded with dynamic import() guarded by try/catch,
// so the game still runs if one of them is missing.
//
// v2: Enter/Space starts, resumes, retries and continues (ACTION_CONFIRM
// is finally wired); C toggles the camera between a behind-car follow
// camera (the default while driving, with a speed FOV kick) and a free
// orbit; F punches the nearest pedestrian; keys 1-4 pick a mission from
// the M menu; the wanted heat lands on the theft, not the briefing; the
// Harbor Heist spawns its armored truck; traffic yields to pedestrians.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRNG, angleLerp } from './random.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Input, ACTION_PAUSE, ACTION_ENTER_EXIT, ACTION_MISSION_MENU, ACTION_CONFIRM, ACTION_CAMERA, ACTION_PUNCH } from './input.js';
import { HUD } from './hud.js';
import { applyPixelRatio, resizeToCanvas, approachFov } from './render.js';
import { stageShot, SHOT_NAMES } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY = 'vice-harbor.save';

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
    const mod = await import(path);
    return mod;
  } catch (err) {
    console.warn('[VICE HARBOR] optional system not loaded:', path, err && err.message ? err.message : err);
    return null;
  }
}

async function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(1280, 720, false);
  applyPixelRatio(renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(CONFIG.FOG_COLOR, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

  const camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 1200);
  camera.position.set(40, 30, 60);

  const input = new Input(canvas);
  const world = createWorld(THREE, seed);
  scene.add(world.group);
  const player = new Player(THREE, world);
  scene.add(player.mesh);

  const save = readSave();
  const hud = new HUD();

  // Shared game state — the contract every system reads and writes.
  const G = {
    THREE, scene, camera, renderer,
    clock: new THREE.Clock(),
    input, world, player,
    vehicles: [], traffic: null, pedestrians: null, police: null,
    missions: null, hud, audio: null,
    money: save.money, wanted: 0, time: 0, state: 'menu',
    playerVehicle: null,
    cameraYaw: 0, cameraPitch: 0.32, cameraDist: 10,
    // v2 camera: 'follow' eases behind the car while driving (drag adds a
    // decaying offset); 'orbit' is the old free camera. On foot it is
    // always a free orbit.
    cameraMode: 'follow', camOffset: 0,
    heistTruck: null,
  };

  // ---- load the other builders' systems (tolerant) ----
  const vehiclesMod = await loadSystem('./vehicles.js');
  if (vehiclesMod && typeof vehiclesMod.spawnParkedCars === 'function') {
    try {
      G.vehicles = vehiclesMod.spawnParkedCars(THREE, world, 10) || [];
    } catch (err) {
      console.warn('[VICE HARBOR] spawnParkedCars failed:', err);
      G.vehicles = [];
    }
  }
  for (const v of G.vehicles) scene.add(v.mesh);
  // A crash thud for any parked car the player drives into a wall:
  // the hook reads G.audio at crash time, so it works once audio loads.
  for (const v of G.vehicles) {
    v.onCrash = () => {
      if (G.audio) { try { G.audio.crash(); } catch (e) { /* ignore */ } }
    };
  }

  const trafficMod = await loadSystem('./traffic.js');
  if (trafficMod && typeof trafficMod.createTraffic === 'function') {
    try {
      G.traffic = trafficMod.createTraffic(THREE, world, 14);
      if (G.traffic && G.traffic.cars) for (const c of G.traffic.cars) scene.add(c.mesh);
    } catch (err) {
      console.warn('[VICE HARBOR] createTraffic failed:', err);
    }
  }

  const pedMod = await loadSystem('./pedestrians.js');
  if (pedMod && typeof pedMod.createPedestrians === 'function') {
    try {
      G.pedestrians = pedMod.createPedestrians(THREE, world, 18);
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
      // missions.js finishes a job by calling onComplete(lastResult) and
      // banks the payout into G.money itself — so this handler only shows
      // the result and changes state, and never adds the payout twice.
      if (G.missions) {
        G.missions.onComplete = (result) => {
          if (!result) return;
          if (result.failed) {
            hud.showMessage('Mission failed — press M to try another');
            return;
          }
          writeSave(G.money);
          G.state = 'mission-complete';
          const def = (G.missions.list || []).find((mm) => mm.id === result.mission) || {};
          const title = def.title || 'Mission';
          hud.showMissionComplete(title + ' complete — $' + result.payout + ' banked.');
          if (G.audio) { try { G.audio.success(); } catch (e) { /* ignore */ } }
          announce('Mission complete. $' + result.payout + ' earned.');
        };
      }
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

  // ---- wanted helper (keeps G.wanted in sync with the police system) ----
  function addWanted(n) {
    if (G.police && typeof G.police.addWanted === 'function') {
      G.police.addWanted(n);
      if (typeof G.police.wanted === 'number') G.wanted = G.police.wanted;
    } else {
      G.wanted = Math.max(0, Math.min(CONFIG.WANTED_MAX, G.wanted + n));
    }
  }

  // ---- camera ----
  function updateCamera(dt) {
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
  function nearestVehicle(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const v of G.vehicles) {
      const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  function enterExitCar() {
    if (player.onFoot) {
      const v = nearestVehicle(4);
      if (v) {
        player.enterVehicle(v);
        G.playerVehicle = v;
        if (G.audio) G.audio.blip();
        hud.showMessage('Car stolen — drive!');
        announce('In a car. W A S D to drive.');
        // Theft heat (v2): the crime is the theft, so the wanted level
        // lands when the player gets into a car during a mission — not
        // at the briefing, when they may still be on foot with no car.
        const active = G.missions && G.missions.active;
        if (active && !active.heatApplied) {
          if (active.id === 'getaway') {
            active.heatApplied = true;
            addWanted(1);
            hud.showMessage('Car stolen — the heat is on!');
          } else if (active.id === 'heist' && v.armored) {
            active.heatApplied = true;
            addWanted(2);
            hud.showMessage('Armored truck stolen — 2 stars on you!');
          }
        }
      } else {
        hud.showMessage('No car nearby — find one on the road');
      }
    } else {
      const v = G.playerVehicle;
      player.exitVehicle();
      G.playerVehicle = null;
      if (v) v.speed = 0;
      hud.showMessage('On foot');
    }
  }

  // ---- on-foot punch (F) ----
  function doPunch() {
    if (!player.onFoot) return;
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
      addWanted(1);
      hud.showMessage('You shoved a pedestrian — the cops noticed!');
      announce('You shoved a pedestrian. Wanted level up.');
    }
  }

  // ---- missions ----
  function startMission(i) {
    if (!G.missions || typeof G.missions.start !== 'function') {
      hud.showMessage('Missions not loaded yet');
      return;
    }
    try {
      const started = G.missions.start(i, G);
      const m = started || null;
      if (m) {
        hud.showMessage((m.title || 'Mission') + ' — ' + (m.objective || m.brief || ''));
        announce('Mission started.');
        // Harbor Heist: park the armored truck at its spot (or put it
        // back there if a failed run moved it).
        if (m.id === 'heist' && vehiclesMod && typeof vehiclesMod.spawnArmoredTruck === 'function') {
          const spot = G.missions.heistTruckPos || { x: 46, z: -58 };
          if (!G.heistTruck) {
            const truck = vehiclesMod.spawnArmoredTruck(THREE, spot.x, spot.z, Math.PI / 2);
            scene.add(truck.mesh);
            G.vehicles.push(truck);
            truck.onCrash = () => {
              if (G.audio) { try { G.audio.crash(); } catch (e) { /* ignore */ } }
            };
            G.heistTruck = truck;
          } else {
            G.heistTruck.setPose(spot.x, spot.z, Math.PI / 2);
            G.heistTruck.speed = 0;
          }
        }
      }
    } catch (err) {
      console.warn('[VICE HARBOR] mission start failed:', err);
    }
  }

  hud.bind({
    onStart: () => startPlaying(),
    onResume: () => resumeGame(),
    onRetry: () => restartAfterBusted(),
    onContinue: () => { hud.hideMissionComplete(); G.state = 'playing'; },
    onMissionPick: (i) => startMission(i),
  });

  function startPlaying() {
    hud.hideStart();
    G.state = 'playing';
    if (G.audio) { try { G.audio.ensure(); } catch (e) { /* ignore */ } }
    announce('Playing. W A S D to move, E to enter a car, M for missions.');
  }

  function resumeGame() {
    hud.hidePause();
    G.state = 'playing';
  }

  function restartAfterBusted() {
    hud.hideBusted();
    G.wanted = 0;
    // reset() clears the stars, the cruisers AND the busted flag — the
    // plain addWanted(-99) left busted set and re-busted on the next step.
    if (G.police && typeof G.police.reset === 'function') {
      try { G.police.reset(); } catch (e) { /* ignore */ }
    } else if (G.police && typeof G.police.addWanted === 'function') {
      try { G.police.addWanted(-99); } catch (e) { /* ignore */ }
    }
    player.teleport(world.spawnPoints.player[0], world.spawnPoints.player[1], 0);
    if (G.playerVehicle) { G.playerVehicle.speed = 0; }
    player.onFoot = true;
    G.playerVehicle = null;
    G.state = 'playing';
    announce('Back on the streets.');
  }

  // ---- one fixed step ----
  function step(dt) {
    G.time += dt;
    // One-shot presses are taken once per step, whatever the state is —
    // so Enter/Space works on every screen, not just in play.
    const actions = input.takeActions();
    if (G.state === 'menu') {
      if (actions & ACTION_CONFIRM) { startPlaying(); return; }
      // Lively backdrop: traffic and pedestrians keep moving.
      if (G.traffic) G.traffic.update(dt);
      if (G.pedestrians) G.pedestrians.update(dt);
      return;
    }
    if (G.state === 'paused') {
      if (actions & ACTION_CONFIRM) resumeGame();
      return;
    }
    if (G.state === 'busted') {
      if (actions & ACTION_CONFIRM) restartAfterBusted();
      return;
    }
    if (G.state === 'mission-complete') {
      if (actions & ACTION_CONFIRM) {
        hud.hideMissionComplete();
        G.state = 'playing';
      }
      return;
    }
    if (G.state !== 'playing') return;

    if (actions & ACTION_PAUSE) {
      hud.showPause();
      G.state = 'paused';
      return;
    }
    if (actions & ACTION_MISSION_MENU) {
      hud.toggleMissionMenu(G.missions, G.missions && G.missions.active ? G.missions.active.id : null);
    }
    // Keys 1-4 pick a mission while the M menu is open.
    const digit = input.takeDigitPick();
    if (digit && typeof hud.missionMenuOpen === 'function' && hud.missionMenuOpen()) {
      hud.hideMissionMenu();
      startMission(digit - 1);
    }
    if (actions & ACTION_CAMERA) {
      G.cameraMode = G.cameraMode === 'follow' ? 'orbit' : 'follow';
      G.camOffset = 0;
      hud.showMessage('Camera: ' + (G.cameraMode === 'follow' ? 'follow — behind the car' : 'free orbit'));
      if (G.audio) { try { G.audio.blip(); } catch (e) { /* ignore */ } }
    }
    if (actions & ACTION_PUNCH) doPunch();
    if (actions & ACTION_ENTER_EXIT) enterExitCar();

    if (player.onFoot) {
      player.update(dt, input, world, G.cameraYaw);
    } else if (G.playerVehicle) {
      G.playerVehicle.update(dt, input, world);
      player.pos.copy(G.playerVehicle.pos);
      player.heading = G.playerVehicle.heading;
    }

    if (G.traffic) G.traffic.update(dt, G.playerVehicle, G.pedestrians);
    if (G.pedestrians) G.pedestrians.update(dt, G.playerVehicle);
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
    // Wanted decays when the player stays out of trouble.
    if (G.wanted > 0 && G.police && typeof G.police.addWanted !== 'function') {
      G.wanted = Math.max(0, G.wanted - CONFIG.WANTED_DECAY_PER_SECOND * dt);
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
      } catch (e) { /* audio is best-effort */ }
    }
  }

  // ---- resize ----
  function onResize() {
    resizeToCanvas(renderer, camera);
  }
  window.addEventListener('resize', onResize);
  onResize();

  // ---- screenshot staging ----
  if (shot && SHOT_NAMES.includes(shot)) {
    // Build a playable-looking scene deterministically, then freeze.
    G.state = 'playing';
    stageShot(shot, G);
    // Render a few frames so the canvas is painted, then signal readiness.
    let painted = 0;
    function paintShot() {
      renderer.render(scene, camera);
      painted += 1;
      if (painted < 3) requestAnimationFrame(paintShot);
      else window.__shotReady = true;
    }
    requestAnimationFrame(paintShot);
    return;
  }

  // ---- interactive loop ----
  hud.showStart();
  announce('VICE HARBOR. Click Start to play.');
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (G.state === 'paused') {
      // Still step once per frame while paused, so Enter/Space (confirm)
      // can resume — step's paused branch only consumes that action.
      step(STEP);
      renderer.render(scene, camera);
      return;
    }
    accumulator += frameDt;
    let guard = 0;
    while (accumulator >= STEP && guard < 8) {
      step(STEP);
      accumulator -= STEP;
      guard += 1;
    }
    if (guard >= 8) accumulator = 0;
    // Menu camera: slow orbit over the city.
    if (G.state === 'menu') {
      const t = G.time * 0.05;
      camera.position.set(Math.cos(t) * 170, 55, Math.sin(t) * 170);
      camera.lookAt(0, 12, 0);
    } else {
      updateCamera(frameDt);
    }
    // The harbour lives: boats bob, the lighthouse beam sweeps.
    if (world.tick) {
      try { world.tick(frameDt, G.time); } catch (e) { /* garnish */ }
    }
    hud.update(G);
    renderer.render(scene, camera);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'playing') {
      hud.showPause();
      G.state = 'paused';
      announce('Paused.');
    }
  });

  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error('[VICE HARBOR] boot failed:', err);
  if (statusEl) statusEl.textContent = 'VICE HARBOR failed to start: ' + (err && err.message ? err.message : err);
});
