// VICE HARBOR v7 — screenshot staging.
// The four staged scenes the capture script renders (?shot=start|drive|
// chase|end, seed 1): each one puts the hero, the cars, the cops and the
// HUD into a frame that shows several systems at once, then main.js
// renders it and sets window.__shotReady. A fireball is a sprite +
// point light that swells and fades; makeBlast builds one anywhere.

// The four shots, in the order the dossier shows them.
export const SHOT_LIST = ['start', 'drive', 'chase', 'end'];

// A fireball: a glowing sprite and a warm point light, scaled up over
// its life by main.js's effect ticker.
export function makeBlast(THREE, x, z, scale) {
  const group = new THREE.Group();
  group.position.set(x, 1.6, z);
  const size = 7 * (scale || 1);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,180,1)');
  grad.addColorStop(0.35, 'rgba(255,150,40,0.95)');
  grad.addColorStop(0.7, 'rgba(220,50,20,0.6)');
  grad.addColorStop(1, 'rgba(120,10,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  sprite.scale.set(size, size, 1);
  group.add(sprite);
  const light = new THREE.PointLight(0xff8a2a, 3, 34);
  light.position.set(0, 1, 0);
  group.add(light);
  return { group, sprite, light, t: 0, life: 0.9 };
}

// Find a parked car of a kind, or null.
function findParked(S, kind) {
  for (const car of S.parked) {
    if (!kind || car.kind === kind) return car;
  }
  return S.parked[0] || null;
}

// Put the hero in a red sport car and point it east into the sunset.
function stageDriver(S, x, z, heading) {
  const car = findParked(S, 'sport') || findParked(S, null);
  if (!car) return null;
  car.setPose(x, z, heading);
  car.speed = 0;
  S.hero.enterVehicle(car);
  return car;
}

// Stage one of the four shots. `S` is the shared game state main.js
// builds (city, hero, parked, flow, crowd, law, quests, hud, sound).
export function composeShot(name, S) {
  const city = S.city;
  const hero = S.hero;
  // Every shot runs at dusk, 18:30, for a stable frame.
  S.hour = 18.5;
  city.setClock(18.5);
  S.money = 0;
  S.police.reset();

  if (name === 'start') {
    // The menu: the hero on the sidewalk at dusk, a red sport car
    // ahead on the road, pedestrians crossing, the menu up.
    hero.teleport(0, 27, Math.PI / 2);
    const car = findParked(S, 'sport');
    if (car) car.setPose(14, 18, Math.PI / 2);
    S.mode = 'menu';
    S.hud.showStart();
    return;
  }

  if (name === 'drive') {
    // The drive: the hero in the red sport car on the road east into
    // the sunset, the Cab Rush mission live, traffic and pedestrians
    // ahead, the beacon down the road.
    const car = stageDriver(S, 0, 18, Math.PI / 2);
    if (car) car.speed = 22;
    S.mode = 'play';
    S.startQuest(1);
    S.hud.hideStart();
    return;
  }

  if (name === 'chase') {
    // The chase: 3 stars, cruisers flanking, the helicopter above and
    // a fireball going off ahead of the red sport car.
    const car = stageDriver(S, 0, 18, Math.PI / 2);
    if (car) car.speed = 26;
    S.mode = 'play';
    S.police.add(3);
    S.police.update(0.5, hero, S.parked);
    // Pull two cruisers into frame, flanking the road ahead of the
    // player's car, so the chase reads at a glance.
    const cops = S.police.cops;
    if (cops[0]) { cops[0].setPose(14, 26, Math.PI / 2); cops[0].speed = 20; }
    if (cops[1]) { cops[1].setPose(20, 10, Math.PI / 2); cops[1].speed = 20; }
    const bx = 30;
    const bz = 18;
    S.blast(bx, bz, 2.6);
    S.hud.hideStart();
    return;
  }

  // 'end': mission complete. The hero on foot beside the red sport
  // car at sunset, $500 banked, the overlay up.
  const car = findParked(S, 'sport');
  if (car) car.setPose(8, 18, Math.PI / 2);
  hero.teleport(0, 27, Math.PI / 2);
  S.money = 500;
  S.mode = 'done';
  S.hud.showDone('GETAWAY DRIVER — $500 banked. The harbor is yours.');
}

export function shotQuery(name) {
  return `?shot=${name}&seed=1`;
}
