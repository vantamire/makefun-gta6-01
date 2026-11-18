// v4 — shots.js
// Screenshot scenes behind ?shot=start|drive|chase|end (with &seed=N).
// Each scene stages the real game from the seeded start, advances the
// simulation a FIXED number of deterministic 1/60 s steps, then freezes —
// so the same seed always gives the same frame.
//
// Every shot is a CLOSE third-person frame with people and cars in it.
// The menu shot stands right behind the player on foot (burgundy jacket,
// red cap) with pedestrians on the sidewalk and parked cars ahead; the
// drive and chase shots put pedestrians crossing the road and a traffic
// car ahead of the player car; the end shot stands the player next to
// the red car at sunset. The player's car is always a bright-red SPORT
// car (the reference screenshot's glossy red supercar, spoiler and all)
// with its headlights on.
//
// The drive shot starts the Taxi Rush mission FOR REAL (objective bar,
// timer, beacon and minimap diamond are live, not a faked toast) and
// clears the long mission-briefing toast before the photo; the chase
// shot re-stages the cruisers FLANKING the player car with a rear
// camera, so their flashing light bars are actually in frame — and it
// stages a FIREBALL explosion ahead of the car, like the reference
// screenshot's explosion, with the police helicopter circling above.
//
// Structure: one stager per shot in a table, so stageShot is a lookup
// instead of a four-way branch — each shot reads as one setup. Crowd and
// traffic staging happen AFTER the autopilot drive, so the staged people
// and cars are exactly where the photo takes them instead of wandering
// off during the run-in.
//
// The fireball helper is shared: main.js imports makeFireball for the
// live crash explosions, and the chase stager uses it for the static
// photo explosion.

import { CONFIG } from './config.js';

export const SHOT_NAMES = ['start', 'drive', 'chase', 'end'];
const STEPS = 120;
const STEP = 1 / 60;
const PLAYER_RED = 0xd23c2e;

// A fireball: a sprite with a radial-gradient canvas texture (white-hot
// core, orange middle, red edge, transparent outside) plus a point light
// so the explosion lights the street around it. `scale` is the fireball's
// diameter in metres.
export function makeFireball(THREE, x, z, scale) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,220,1)');
  g.addColorStop(0.25, 'rgba(255,200,80,0.95)');
  g.addColorStop(0.55, 'rgba(255,110,30,0.85)');
  g.addColorStop(0.8, 'rgba(200,40,10,0.5)');
  g.addColorStop(1, 'rgba(120,10,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  sprite.scale.set(scale, scale, 1);
  sprite.position.set(x, 1.6, z);
  const light = new THREE.PointLight(0xff8c2e, 60, 30, 1.5);
  light.position.set(x, 2.5, z);
  return { sprite, light };
}

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
// back; `height` sets its eye level. Close and low now (GTA-style): the
// car fills the lower frame and the street ahead fills the rest.
function chaseCam(G, side, dist, height) {
  const v = G.playerVehicle;
  if (!v) return;
  // Forward and right of the car, on the ground plane.
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  const rx = -Math.cos(v.heading);
  const rz = Math.sin(v.heading);
  const s = side || 0;
  const d = dist || 9;
  const h = height || 4.2;
  const eyeX = v.pos.x - fx * d + rx * s;
  const eyeZ = v.pos.z - fz * d + rz * s;
  G.camera.position.set(eyeX, h, eyeZ);
  G.camera.lookAt(v.pos.x + fx * 10, 1.4, v.pos.z + fz * 10);
}

// Wide menu camera: a slow orbit position over the city, looking at the
// skyline with the sunset behind it. (Kept for the live menu orbit; the
// start screenshot uses a close third-person camera instead.)
function menuCam(G, angle, radius, height) {
  G.camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
  G.camera.lookAt(0, 12, 0);
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
// The car is repainted bright harbor red with its headlights on, so the
// player's car is unmistakable in every driving shot. The sport car is
// preferred (the reference's red supercar) — the fastest car on the
// street is a sport, so the pick already lands on one.
function putPlayerInCar(G) {
  const cars = G.vehicles || [];
  if (!cars.length || !G.player) return null;
  let car = cars[0];
  for (const c of cars) if (c.spec && c.spec.topSpeed > (car.spec ? car.spec.topSpeed : 0)) car = c;
  car.setPose(0, -58, Math.PI / 2);
  car.speed = 14;
  if (typeof car.repaint === 'function') car.repaint(PLAYER_RED);
  if (typeof car.setHeadlights === 'function') car.setHeadlights(true);
  G.player.enterVehicle(car);
  G.playerVehicle = car;
  return car;
}

// Park the police cruisers FLANKING the player car — slightly behind, one
// to each side — so the chase camera sees them instead of hiding them
// behind itself. All three sit within 14 m behind the car, ahead of the
// camera. Their light bars are frozen mid-flash so the photo shows the
// red/blue bars lit (they alternate while the police update runs).
function stageCruisersFlanking(G, car) {
  if (!G.police) return;
  const cops = G.police.copCars || [];
  cops.forEach((cop, i) => {
    const back = 4 + i * 3;
    const side = i % 2 === 0 ? 5 : -5;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = -Math.cos(car.heading);
    const rz = Math.sin(car.heading);
    const px = car ? car.pos.x - fx * back + rx * side : -back;
    const pz = car ? car.pos.z - fz * back + rz * side : 0;
    cop.setPose(px, pz, car ? car.heading : 0);
    cop.speed = 16;
    if (cop.lightBarRed && cop.lightBarBlue) {
      const redOn = i % 2 === 0;
      cop.lightBarRed.material.color.setHex(redOn ? 0xff2e2e : 0x551111);
      cop.lightBarBlue.material.color.setHex(redOn ? 0x111155 : 0x2e6fd2);
    }
  });
}

// Place `n` pedestrians around (cx, cz): half strolling the sidewalk
// just off the road, half crossing the road in front of the camera, so
// the frame has people in it. Runs AFTER the autopilot, so nobody
// wanders out of frame before the photo. A couple of update steps after
// placing puts their arms mid-swing instead of frozen at their sides.
function stageCrowd(G, cx, cz, n, crossers) {
  const peds = G.pedestrians;
  if (!peds || !Array.isArray(peds.people) || !peds.people.length) return;
  const people = peds.people;
  const want = Math.min(n | 0, people.length);
  const crossCount = crossers === undefined ? Math.floor(want / 2) : crossers;
  for (let i = 0; i < want; i++) {
    const p = people[i];
    const t = (i + 0.5) / want;
    if (i < crossCount) {
      // Crossing the road, mid-stride, heading across it.
      p.pos.set(cx - 6 + t * 14, 0, cz - 5 + i * 3.5);
      p.heading = i % 2 === 0 ? 0 : Math.PI;
      p.waypoint = { x: p.pos.x + (i % 2 === 0 ? 14 : -14), z: p.pos.z };
    } else {
      // Strolling the sidewalk on either side of the road.
      const side = i % 2 === 0 ? 1 : -1;
      p.pos.set(cx - 12 + t * 26, 0, cz + side * 7.6);
      p.heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      p.waypoint = { x: p.pos.x + (side > 0 ? 20 : -20), z: p.pos.z };
    }
    p.state = 'walk';
    p.pauseTimer = 0;
    p.fleeTimer = 0;
    p.downTimer = 0;
    if (p.mesh) p.mesh.rotation.y = p.heading;
  }
  if (typeof peds.update === 'function') {
    for (let i = 0; i < 3; i++) peds.update(STEP, null, null);
  }
}

// Park one traffic car on the road ahead of the player car, in the same
// lane, so the driving shots have another car in frame. Placed AFTER
// the autopilot, so the traffic loop cannot drive it away first.
function stageTrafficAhead(G, ahead) {
  const traffic = G.traffic;
  const car = G.playerVehicle;
  if (!traffic || !Array.isArray(traffic.cars) || !traffic.cars.length || !car) return;
  const other = traffic.cars[0];
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const d = ahead || 26;
  other.setPose(car.pos.x + fx * d, car.pos.z + fz * d, car.heading);
  other.speed = 8;
}

// -- one stager per shot ----------------------------------------------------

function stageStart(G) {
  // Close third-person menu shot: the player stands on the road at
  // spawn, facing east into the sunset, jacket and red cap to the
  // camera. The camera sits low behind the player and looks past them
  // down the street — pedestrians on the sidewalks, parked cars, shop
  // signs and towers ahead — with the player off-centre so the menu
  // panel does not cover them.
  G.state = 'menu';
  advanceWorld(G, STEPS);
  const p = G.player;
  if (p) {
    p.teleport(-6, -2, Math.PI / 2);
    if (G.hud) G.hud.update(G);
  }
  // Crowd around the spawn street: sidewalks + road crossings.
  stageCrowd(G, -6, -2, 8, 3);
  // The two guaranteed parked cars by the spawn get bright colours, so
  // the menu frame has colourful cars instead of a dark box.
  if (G.vehicles && G.vehicles[0] && typeof G.vehicles[0].repaint === 'function') {
    G.vehicles[0].repaint(0x2e6fd2);
  }
  if (G.vehicles && G.vehicles[1] && typeof G.vehicles[1].repaint === 'function') {
    G.vehicles[1].repaint(0xe8b93a);
  }
  // A traffic car rolling down the same road, past the player.
  stageTrafficAhead(G, 22);
  G.camera.position.set(-11.5, 2.6, 0.5);
  // Look east past the player, not straight at them: the player stands
  // in the left third of the frame, clear of the centred menu panel,
  // instead of hiding behind it.
  G.camera.lookAt(8, 1.2, -1);
  if (G.hud) {
    G.hud.showStart();
    G.hud.update(G);
  }
}

function stageDrive(G) {
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
    car.setPose(pickup.x - 55, pickup.z, Math.PI / 2);
    car.speed = 14;
    G.player.pos.copy(car.pos);
    G.player.heading = car.heading;
  }
  // A longer run-in (110 steps) so the car is deeper in the city — more
  // chance of traffic and pedestrians in frame — and the speedometer
  // reads a proper cruising speed.
  autopilotDrive(G, 110);
  // A few mission updates AFTER the drive: they build the beacon and
  // diamond markers (built lazily on the first update) and refresh the
  // objective line from the car's final position — updating before the
  // drive would leave a stale distance on the HUD.
  if (G.missions && typeof G.missions.update === 'function') {
    try {
      for (let i = 0; i < 3; i++) G.missions.update(STEP, G.player, G);
    } catch (e) { /* mission is garnish for the shot */ }
  }
  // People crossing the road ahead + a traffic car in the same lane.
  if (G.playerVehicle) {
    stageCrowd(G, G.playerVehicle.pos.x + 14, G.playerVehicle.pos.z, 6, 3);
    stageTrafficAhead(G, 26);
  }
  chaseCam(G, 1.5, 9, 4.2);
  if (G.hud) {
    // Clear the long mission-briefing toast — in v2 it covered the
    // middle of the city in this shot. The objective bar below already
    // says what the job is.
    if (typeof G.hud.clearMessage === 'function') G.hud.clearMessage();
    G.hud.update(G);
  }
}

function stageChase(G) {
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
  stageCruisersFlanking(G, car);
  // Pedestrians scattering on the sidewalk ahead + a traffic car to dodge.
  if (car) {
    stageCrowd(G, car.pos.x + 14, car.pos.z, 6, 1);
    stageTrafficAhead(G, 30);
  }
  // The reference screenshot's fireball: a big explosion ahead-left of
  // the car, on the road, so the chase frame has the blast, the red car
  // and the flanking cruisers in one shot. Static (the scene is frozen
  // for the photo), at full size.
  if (car && G.scene && G.THREE) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = -Math.cos(car.heading);
    const rz = Math.sin(car.heading);
    const ex = car.pos.x + fx * 22 - rx * 6;
    const ez = car.pos.z + fz * 22 - rz * 6;
    const boom = makeFireball(G.THREE, ex, ez, 9);
    G.scene.add(boom.sprite);
    G.scene.add(boom.light);
  }
  // The police helicopter circles above at 3 stars — make sure it is in
  // the frame: place it ahead of the car and LOW enough to be inside the
  // chase camera's field of view (the camera looks slightly down, so
  // the top edge sits only ~23° above horizontal — at its real 38 m the
  // chopper is above the frame). At 18 m and 40 m ahead it reads clearly
  // against the sky in the upper frame.
  if (G.police && G.police.heli && car) {
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    G.police.heli.position.set(car.pos.x + fx * 40, 18, car.pos.z + fz * 40);
  }
  // Close, low rear chase camera: the red car fills the frame, the
  // flanking cruisers show beside it with light bars lit, the fireball
  // ahead, sunset beyond.
  chaseCam(G, 0, 13, 4.8);
  if (G.audio && typeof G.audio.siren === 'function') {
    try { G.audio.siren(true); } catch (e) { /* audio is best-effort */ }
  }
  if (G.hud) {
    G.hud.showMessage('WANTED — lose the cops!');
    G.hud.update(G);
  }
}

function stageEnd(G) {
  // 'end' — mission complete, but close and personal: the player stands
  // on foot beside the red car at sunset, pedestrians on the sidewalk
  // behind, the city ahead. The complete overlay is a light panel, so
  // the scene stays visible around it.
  const car = putPlayerInCar(G);
  autopilotDrive(G, STEPS);
  G.money = 500;
  if (G.missions && typeof G.missions.onComplete === 'function') {
    try { G.missions.onComplete({ mission: 'getaway', title: 'Getaway Driver', payout: 500, timeLeft: 41 }); } catch (e) { /* ignore */ }
  }
  G.state = 'mission-complete';
  // Step out and stand by the driver's door, facing the car and the sun.
  if (car && G.player) {
    G.player.exitVehicle();
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    G.player.teleport(car.pos.x - fz * 2.2, car.pos.z + fx * 2.2, car.heading);
    G.playerVehicle = null;
  }
  if (car) {
    stageCrowd(G, car.pos.x + 10, car.pos.z, 6, 2);
  }
  if (G.player) {
    const p = G.player.pos;
    const fx = Math.sin(G.player.heading);
    const fz = Math.cos(G.player.heading);
    // Close up: 5 m instead of the usual 7.5, so the player stands big
    // in the frame — head above the overlay button, legs below it —
    // instead of hiding behind it.
    G.cameraDist = 5;
    G.camera.position.set(p.x - fx * 5, 2.4, p.z - fz * 5);
    G.camera.lookAt(p.x + fx * 6, 1.4, p.z + fz * 6);
    // The live loop's follow camera (which runs after staging) keeps
    // this yaw: west of the player, looking east into the sunset, with
    // the player and the red car in frame.
    G.cameraYaw = -Math.PI / 2;
  } else {
    menuCam(G, 2.4, 150, 48);
  }
  if (G.hud) {
    G.hud.showMissionComplete('Getaway Driver complete — $500 banked. The harbor is yours.');
    G.hud.update(G);
  }
}

const SHOT_STAGERS = {
  start: stageStart,
  drive: stageDrive,
  chase: stageChase,
  end: stageEnd,
};

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
  SHOT_STAGERS[shot](G);
  return shot;
}
