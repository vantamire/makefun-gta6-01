// Screenshot scenes behind ?shot=start|drive|chase|end (with &seed=N).
// Each scene stages the real game from the seeded start, advances the
// simulation a FIXED number of deterministic 1/60 s steps, then freezes —
// so the same seed always gives the same frame.
// v2: the drive shot starts the Taxi Rush mission FOR REAL (objective bar,
// timer, beacon and minimap diamond are live, not a faked toast); the
// chase shot re-stages the cruisers FLANKING the player car with a front
// three-quarter camera, so their flashing light bars are actually in
// frame; the menu shot orbits from the west so it looks into the sunset.

import { CONFIG } from './config.js';

export const SHOT_NAMES = ['start', 'drive', 'chase', 'end'];
const STEPS = 120;
const STEP = 1 / 60;

// Drive the player car forward along a road with gentle steering.
function autopilotDrive(G, steps) {
  const v = G.playerVehicle;
  if (!v) return;
  for (let i = 0; i < steps; i++) {
    // readDriveInput reads input.keys (a Set of held codes), so the fake
    // input must carry one — a bare isDown() is never consulted.
    const fakeInput = {
      keys: new Set(['KeyW']),
      isDown: (code) => code === 'KeyW',
      moveVector: () => ({ x: 0, y: 1 }),
    };
    if (typeof v.update === 'function') v.update(STEP, fakeInput, G.world);
    // Keep the player glued to the car, as the real loop does — otherwise
    // the HUD objective distance stays stuck at the start position.
    if (G.player) {
      G.player.pos.copy(v.pos);
      G.player.heading = v.heading;
    }
    if (G.traffic && typeof G.traffic.update === 'function') G.traffic.update(STEP, G.playerVehicle, G.pedestrians);
    if (G.pedestrians && typeof G.pedestrians.update === 'function') G.pedestrians.update(STEP, G.playerVehicle);
    // No police update here on purpose: in the chase shot the cruisers
    // ram the car and shove it off the road before the frame is taken.
    // The chase branch places them for the photo after the drive instead.
    G.time += STEP;
  }
}

// Chase camera: behind and above the player car, looking ahead of it.
// `side` shifts the camera sideways (off the car's line); `dist` pulls it
// back; `height` sets its eye level. A high rear camera keeps trailing
// cruisers in frame without letting them hide the player car.
function chaseCam(G, side, dist, height) {
  const v = G.playerVehicle;
  if (!v) return;
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  const rx = -Math.cos(v.heading);
  const rz = Math.sin(v.heading);
  const s = side || 0;
  const d = dist || 11;
  const h = height || 4.6 + (d - 11) * 0.12;
  G.camera.position.set(v.pos.x - fx * d + rx * s, h, v.pos.z - fz * d + rz * s);
  G.camera.lookAt(v.pos.x + fx * 10, 1.6, v.pos.z + fz * 10);
}

// Front three-quarter camera: ahead of the player car and off to one side,
// looking BACK at it — so anything chasing the car (cruisers flanking
// behind it) is in frame beyond the car instead of hidden behind the
// chase camera. `dist` is how far ahead, `side` the lateral offset.
function frontCam(G, dist, side, height) {
  const v = G.playerVehicle;
  if (!v) return;
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  const rx = -Math.cos(v.heading);
  const rz = Math.sin(v.heading);
  const d = dist || 15;
  const s = side || 7;
  const h = height || 4.4;
  G.camera.position.set(v.pos.x + fx * d + rx * s, h, v.pos.z + fz * d + rz * s);
  G.camera.lookAt(v.pos.x - fx * 4, 1.6, v.pos.z - fz * 4);
}

function advanceWorld(G, steps) {
  for (let i = 0; i < steps; i++) {
    if (G.traffic && typeof G.traffic.update === 'function') G.traffic.update(STEP);
    if (G.pedestrians && typeof G.pedestrians.update === 'function') G.pedestrians.update(STEP);
    G.time += STEP;
  }
}

// Put the player in the fastest parked car and place it on a road
// (road centre z = -58, heading east, as world.js lays the grid out)
// so the autopilot drives along asphalt instead of into a building.
function putPlayerInCar(G) {
  const cars = G.vehicles || [];
  if (!cars.length || !G.player) return null;
  const car = cars.reduce((best, c) => (c.topSpeed > (best ? best.topSpeed : 0) ? c : best), null) || cars[0];
  car.pos.set(0, 0, -58);
  car.heading = Math.PI / 2;
  if (car.mesh) {
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
  }
  car.speed = 14;
  G.player.enterVehicle(car);
  G.playerVehicle = car;
  return car;
}

/**
 * Stage the named shot on the shared game state G.
 * G: { THREE, scene, camera, renderer, clock, input, world, player,
 *   vehicles, traffic, pedestrians, police, missions, hud, audio,
 *   money, wanted, time, state }.
 * Returns the shot name; unknown names fall back to 'start'.
 */
export function stageShot(name, G) {
  const shot = SHOT_NAMES.includes(name) ? name : 'start';
  if (!G || !G.scene || !G.camera) return shot;
  G.state = 'playing';
  if (G.hud) G.hud.hideStart();

  if (shot === 'start') {
    // Menu camera: orbit from the WEST, looking east into the sunset —
    // the sun sits over the water, so the menu frame shows the skyline
    // against the dusk instead of a murky dark backdrop.
    G.state = 'menu';
    advanceWorld(G, STEPS);
    const t = 2.6;
    const r = 170;
    G.camera.position.set(Math.cos(t) * r, 55, Math.sin(t) * r);
    G.camera.lookAt(0, 12, 0);
    if (G.hud) {
      G.hud.showStart();
      G.hud.update(G);
    }
    return shot;
  }

  if (shot === 'drive') {
    putPlayerInCar(G);
    // Start the Taxi Rush mission FOR REAL: the objective bar, timer,
    // beacon, minimap diamond and toast are all the live mission, not a
    // staged message. Then place the car on the pickup's road, ~55 m
    // west of the passenger, heading east toward the marker.
    if (G.missions && typeof G.missions.start === 'function') {
      try { G.missions.start('taxi', G); } catch (e) { /* mission is garnish for the shot */ }
    }
    const pickup = G.missions && G.missions.active && G.missions.active.checkpoints
      ? G.missions.active.checkpoints[0]
      : null;
    if (pickup && G.playerVehicle) {
      const car = G.playerVehicle;
      car.pos.set(pickup.x - 55, 0, pickup.z);
      car.heading = Math.PI / 2;
      if (car.mesh) {
        car.mesh.position.copy(car.pos);
        car.mesh.rotation.y = car.heading;
      }
      car.speed = 14;
      G.player.pos.copy(car.pos);
      G.player.heading = car.heading;
    }
    autopilotDrive(G, 70);
    // A few mission updates AFTER the drive: they build the beacon and
    // diamond markers (built lazily on the first update) and refresh the
    // objective line from the car's final position — updating before the
    // drive would leave a stale distance on the HUD.
    if (G.missions && typeof G.missions.update === 'function') {
      try {
        for (let i = 0; i < 3; i++) G.missions.update(STEP, G.player, G);
      } catch (e) { /* mission is garnish for the shot */ }
    }
    chaseCam(G);
    if (G.hud) {
      G.hud.update(G);
    }
    return shot;
  }

  if (shot === 'chase') {
    const car = putPlayerInCar(G);
    G.wanted = 3;
    if (G.police) {
      if (typeof G.police.addWanted === 'function') G.police.addWanted(3);
      // Cruisers only exist once update() spawns them, so run a few steps
      // to get them on the road before the drive.
      if (typeof G.police.update === 'function') {
        for (let i = 0; i < 3; i++) G.police.update(STEP, G.player, G.vehicles);
      }
    }
    autopilotDrive(G, STEPS);
    // Park the cruisers FLANKING the player car — slightly behind, one
    // to each side — after the drive, so the chase camera sees them
    // instead of hiding them behind itself. Letting them chase during
    // the drive rams the car off the road before the photo is taken.
    // All three sit within 14 m behind the car, ahead of the camera.
    if (G.police) {
      const cops = G.police.copCars || [];
      cops.forEach((cop, i) => {
        const back = 4 + i * 3;
        const side = i % 2 === 0 ? 5 : -5;
        const fx = Math.sin(car.heading);
        const fz = Math.cos(car.heading);
        const rx = -Math.cos(car.heading);
        const rz = Math.sin(car.heading);
        cop.pos.set(
          car ? car.pos.x - fx * back + rx * side : -back,
          0,
          car ? car.pos.z - fz * back + rz * side : 0,
        );
        cop.heading = car ? car.heading : 0;
        cop.speed = 16;
        if (cop.mesh) {
          cop.mesh.position.copy(cop.pos);
          cop.mesh.rotation.y = cop.heading;
        }
        // Freeze the light bar mid-flash so the photo shows the red/blue
        // bars lit (they alternate while the police update runs).
        if (cop.lightBarRed && cop.lightBarBlue) {
          const redOn = i % 2 === 0;
          cop.lightBarRed.emissiveIntensity = redOn ? 2.4 : 0.25;
          cop.lightBarBlue.emissiveIntensity = redOn ? 0.25 : 2.4;
        }
      });
    }
    // Low, wide rear chase camera on the road behind the car: the
    // flanking cruisers show in frame beside and behind the player car,
    // light bars lit, with the sunset ahead. (A front three-quarter view
    // was tried first — the low camera clipped through the buildings
    // beside the road.)
    chaseCam(G, 0, 18, 6.5);
    if (G.audio && typeof G.audio.siren === 'function') {
      try { G.audio.siren(true); } catch (e) { /* audio is best-effort */ }
    }
    if (G.hud) {
      G.hud.showMessage('WANTED — lose the cops!');
      G.hud.update(G);
    }
    return shot;
  }

  // 'end' — mission-complete overlay over a sunset skyline.
  putPlayerInCar(G);
  autopilotDrive(G, STEPS);
  G.money = 500;
  if (G.missions && typeof G.missions.onComplete === 'function') {
    try { G.missions.onComplete({ mission: 'getaway', title: 'Getaway Driver', payout: 500, timeLeft: 41 }); } catch (e) { /* ignore */ }
  }
  G.state = 'mission-complete';
  const t = 2.4;
  const r = 150;
  G.camera.position.set(Math.cos(t) * r, 48, Math.sin(t) * r);
  G.camera.lookAt(0, 14, 0);
  if (G.hud) {
    G.hud.showMissionComplete('Getaway Driver complete — $500 banked. The harbor is yours.');
    G.hud.update(G);
  }
  return shot;
}
