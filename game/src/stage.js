// stage.js — stages the four screenshots of VICE HARBOR.
// ?shot=start|drive|chase|end&seed=1 puts the game in a fixed,
// deterministic tableau instead of the interactive loop, renders it
// once, and raises window.__shotReady for the capture script.
// Each shot shows several systems at once: the city, the HUD with
// its minimap, traffic, the police, and a mission in progress.
// Roads run on the centre-lines x,z = k*56; every staged position
// sits on a road (or beside a landmark), never inside a block.

import { TUNE } from './tune.js';

export const SHOT_LIST = ['start', 'drive', 'chase', 'end'];

export function stageShot(G, name) {
  const { hero, fleet, law, fx } = G.world;
  const P = TUNE.pitch;

  function placeHeroInCar(car, x, z, heading, speed) {
    hero.hero.car = car;
    car.parked = false;
    car.driver = true;
    car.x = x;
    car.z = z;
    car.heading = heading;
    car.speed = speed;
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = heading;
    hero.hero.mesh.visible = false;
    hero.hero.x = x;
    hero.hero.z = z;
    hero.hero.heading = heading;
  }

  function placeHeroOnFoot(x, z, heading) {
    hero.hero.car = null;
    hero.hero.x = x;
    hero.hero.z = z;
    hero.hero.heading = heading;
    hero.hero.mesh.visible = true;
    hero.hero.mesh.position.set(x, 0, z);
    hero.hero.mesh.rotation.y = heading;
  }

  if (name === 'start') {
    // Rex on foot on the main avenue at dusk, his red sport coupe
    // ahead of him, the towers and the sunset up the street.
    G.setClock(18 * 60 + 42);
    placeHeroOnFoot(0, 4, Math.PI);
    const car = fleet.heroCar;
    car.x = 0; car.z = -4; car.heading = 0;
    car.mesh.position.set(0, 0, -4);
    car.mesh.rotation.y = 0;
    // clear any parked or traffic car that wandered into the frame
    for (const c of fleet.cars) {
      if (c === car) continue;
      if (Math.hypot(c.x - 0, c.z - 0) < 18) {
        c.x = 112 + (c.id % 3) * 8;
        c.z = -168;
        c.mesh.position.set(c.x, 0, c.z);
      }
    }
    hero.hero.money = 250;
    law.setWanted(0);
    G.camYaw = 0.4;
    G.camPitch = 0.25;
    G.camDist = 10;
    G.objectiveText = 'Welcome to Vice Harbor — press E to steal the coupe';
  } else if (name === 'drive') {
    // Driving the red coupe south down the main avenue at speed,
    // traffic ahead, the sun low over the towers.
    G.setClock(18 * 60 + 55);
    const car = fleet.heroCar;
    placeHeroInCar(car, 0, 100, 0, 26);
    hero.hero.money = 480;
    law.setWanted(0);
    G.camYaw = Math.PI;
    G.camPitch = 0.3;
    G.camDist = 13;
    G.objectiveText = 'Drive to Mama Lou\'s Bar — 2 blocks north';
    G.noticeText = '+$10 NEAR MISS';
    // guarantee traffic ahead on this avenue
    const ahead = fleet.cars.filter((c) => !c.wrecked && c !== car).slice(0, 3);
    const spots = [[2.5, 132], [-2.5, 158], [2.5, 186]];
    ahead.forEach((c, i) => {
      c.x = spots[i][0];
      c.z = spots[i][1];
      c.heading = 0;
      c.speed = 14;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = 0;
    });
  } else if (name === 'chase') {
    // Four stars: cruisers on the tail, the helicopter overhead,
    // a fireball blooming ahead on the avenue.
    G.setClock(19 * 60 + 20);
    const car = fleet.heroCar;
    placeHeroInCar(car, 0, 84, 0, 30);
    law.setWanted(4);
    // let the law module spawn its cruisers and the helicopter
    law.update(0.1, hero.hero, fx);
    law.update(0.1, hero.hero, fx);
    // pull two cruisers in right behind the player, flanking it so
    // they stay in front of the camera
    const chasers = law.cops.slice(0, 2);
    const spots = [[-3.5, 74], [3.5, 78]];
    chasers.forEach((c, i) => {
      c.x = spots[i][0];
      c.z = spots[i][1];
      c.heading = 0;
      c.speed = 30;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = 0;
    });
    // bring the helicopter down into the frame, ahead and to the side
    if (law.heli) {
      law.heli.mesh.position.set(hero.hero.x + 16, 18, hero.hero.z + 24);
      law.heli.mesh.rotation.y = Math.atan2(hero.hero.x - (hero.hero.x + 16), hero.hero.z - (hero.hero.z + 24));
    }
    // a fireball ahead on the avenue
    fx.spawnExplosion(2, 0.5, 140, 1.0);
    fx.tick(0.25);
    // a wrecked car burning at the roadside
    const wreck = fleet.addCar('sedan', -8, 114, 0.4, { parked: true, driver: false, color: 0x2a2a30 });
    wreck.health = 0;
    wreck.wrecked = true;
    wreck.mesh.rotation.z = 0.25;
    fx.spawnSmoke(-8, 1.5, 114);
    hero.hero.money = 1140;
    hero.hero.health = 72;
    G.camYaw = Math.PI;
    G.camPitch = 0.22;
    G.camDist = 15;
    G.objectiveText = 'Lose the cops — reach the safehouse';
  } else if (name === 'end') {
    // Night on the boardwalk: the Casino Caper paid out, the ferris
    // wheel turning behind Rex, the lamps on along the deck.
    G.setClock(22 * 60 + 40);
    placeHeroOnFoot(210, -30, 0.1);
    hero.hero.money = 1840;
    hero.hero.health = 100;
    hero.hero.armor = 60;
    law.setWanted(0);
    G.camYaw = 0;
    G.camPitch = 0.15;
    G.camDist = 14;
    G.objectiveText = 'JOB DONE — Casino Caper  +$700';
    G.noticeText = '+$700 CASINO CAPER';
  }

  // render one frame from the staged camera and signal the capturer
  G.renderFrame(0);
  G.hud.update(0, {
    hero: hero.hero, law, town: G.world.town, target: null,
    clockMinutes: G.clockMinutes, bustText: '',
  });
  if (G.noticeText) G.hud.showNotice(G.noticeText, '#7dff9e');
  if (G.objectiveText) G.hud.setObjective(G.objectiveText);
  window.__shotReady = true;
}
