// VICE HARBOR v6 — vehicles.
// Twelve kinds, each with its own size, top speed and handling: sedan,
// sport, convertible, taxi, pickup, motorcycle, bus, van, limo, food
// truck, armored truck and the police cruiser. Every car is built from
// boxes the same way — a stepped hood and trunk, a pale glass cabin,
// chrome bumpers and grille, big headlights, a full-width tail strip,
// and four wheels with silver hubs — so the fleet reads as cars, not
// boxes. The Vehicle class owns arcade driving physics (accelerate,
// brake, reverse, steer, drag, handbrake) and collision push-out
// against the metropolis's building circles.

import { CFG } from './settings.js';
import { Rng, clamp, steerToward } from './rng.js';

export const CAR_KINDS = {
  sedan: { top: 30, accel: 15, steer: 1.9, len: 4.4, wid: 1.9, h: 1.35, wheels: 4 },
  sport: { top: 38, accel: 21, steer: 2.3, len: 4.2, wid: 1.95, h: 1.15, wheels: 4, spoiler: true },
  convertible: { top: 36, accel: 20, steer: 2.4, len: 4.3, wid: 1.95, h: 1.05, wheels: 4, open: true },
  taxi: { top: 30, accel: 15, steer: 1.9, len: 4.4, wid: 1.9, h: 1.4, wheels: 4, taxi: true },
  pickup: { top: 28, accel: 14, steer: 1.7, len: 4.9, wid: 2.0, h: 1.5, wheels: 4, bed: true },
  moto: { top: 34, accel: 19, steer: 2.8, len: 2.3, wid: 0.8, h: 1.1, wheels: 2 },
  bus: { top: 22, accel: 9, steer: 1.2, len: 9.5, wid: 2.5, h: 2.9, wheels: 4 },
  van: { top: 26, accel: 11, steer: 1.5, len: 5.2, wid: 2.1, h: 2.2, wheels: 4 },
  limo: { top: 33, accel: 16, steer: 1.6, len: 7.2, wid: 2.0, h: 1.35, wheels: 4 },
  foodtruck: { top: 24, accel: 10, steer: 1.4, len: 5.6, wid: 2.3, h: 2.6, wheels: 4, vendor: true },
  truck: { top: 24, accel: 10, steer: 1.4, len: 6.4, wid: 2.4, h: 2.8, wheels: 4, armored: true },
  cruiser: { top: 36, accel: 19, steer: 2.2, len: 4.6, wid: 2.0, h: 1.4, wheels: 4, police: true },
};

export const PAINT = [
  0xd23c2e, 0x2e6fd2, 0xe8b93a, 0x3fae6a, 0x7a4fd0, 0xe8e6df, 0x18a7a0,
  0xd2691e, 0xff5a8a, 0x9be62e, 0xff8c1a, 0x2ee6c8, 0x5a6a7a, 0x222222,
];

function paintMat(THREE, color, rough = 0.55, metal = 0.45) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function glassMat(THREE) {
  return new THREE.MeshStandardMaterial({ color: 0xbfe3f0, roughness: 0.15, metalness: 0.7 });
}

function chromeMat(THREE) {
  return new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.25, metalness: 0.9 });
}

function rubberMat(THREE) {
  return new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
}

// Build the visible mesh for one vehicle kind. Returns a THREE.Group
// whose userData holds the wheels (for spin) and the light meshes.
export function buildCarMesh(THREE, kind, color) {
  const spec = CAR_KINDS[kind] || CAR_KINDS.sedan;
  const g = new THREE.Group();
  g.name = `car-${kind}`;
  const L = spec.len;
  const W = spec.wid;
  const H = spec.h;
  const body = paintMat(THREE, color);
  const glass = glassMat(THREE);
  const chrome = chromeMat(THREE);
  const rubber = rubberMat(THREE);

  if (kind === 'moto') {
    // Motorcycle: a slim tank, a seat, two big wheels, a rider.
    const tank = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.5), body);
    tank.position.set(0, 0.75, 0);
    tank.castShadow = true;
    g.add(tank);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.45), paintMat(THREE, 0x222222, 0.9));
    seat.position.set(-0.55, 0.85, 0);
    g.add(seat);
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.55), chrome);
    fender.position.set(0.85, 0.85, 0);
    g.add(fender);
    const wheels = [];
    for (const wx of [0.85, -0.85]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 12), rubber);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.36, 0);
      wheel.castShadow = true;
      g.add(wheel);
      wheels.push(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.24, 8), chrome);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(wx, 0.36, 0);
      g.add(hub);
    }
    // Rider: torso, helmet, arms to the bars.
    const rider = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.42), paintMat(THREE, 0x2e3a4a, 0.85));
    torso.position.set(-0.25, 1.25, 0);
    rider.add(torso);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), paintMat(THREE, 0xd23c2e, 0.4, 0.3));
    helmet.position.set(-0.15, 1.7, 0);
    rider.add(helmet);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), paintMat(THREE, 0x2e3a4a, 0.85));
      arm.position.set(0.35, 1.35, s * 0.22);
      arm.rotation.z = -0.5;
      rider.add(arm);
    }
    g.add(rider);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 1.4 }));
    lamp.position.set(1.15, 0.8, 0);
    g.add(lamp);
    g.userData.wheels = wheels;
    g.userData.lights = [lamp];
    return g;
  }

  // Four-wheeled body: stepped hood (front), cabin, trunk (rear).
  const lower = new THREE.Mesh(new THREE.BoxGeometry(L, H * 0.55, W), body);
  lower.position.set(0, H * 0.45, 0);
  lower.castShadow = true;
  g.add(lower);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(L * 0.22, H * 0.28, W * 0.94), body);
  hood.position.set(L * 0.36, H * 0.62, 0);
  hood.castShadow = true;
  g.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(L * 0.2, H * 0.3, W * 0.94), body);
  trunk.position.set(-L * 0.36, H * 0.62, 0);
  trunk.castShadow = true;
  g.add(trunk);
  if (spec.bed) {
    // Pickup: open bed with walls instead of a trunk.
    trunk.visible = false;
    const bedWall = new THREE.Mesh(new THREE.BoxGeometry(L * 0.24, 0.5, W * 0.94), body);
    bedWall.position.set(-L * 0.36, H * 0.85, 0);
    g.add(bedWall);
  }
  // Glass cabin — skipped on the open-top convertible, which gets a
  // low windscreen and a roll bar instead.
  if (spec.open) {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, W * 0.8), glass);
    screen.position.set(L * 0.12, H * 0.85, 0);
    g.add(screen);
    const roll = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, W * 0.9), chrome);
    roll.position.set(-L * 0.18, H * 0.95, 0);
    g.add(roll);
  } else {
    const cabLen = spec.armored || kind === 'bus' || kind === 'van' || spec.vendor ? L * 0.55 : L * 0.42;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabLen, H * 0.42, W * 0.86), glass);
    cabin.position.set(kind === 'bus' ? L * 0.1 : -L * 0.02, H * 0.95, 0);
    cabin.castShadow = true;
    g.add(cabin);
  }
  // Chrome bumpers + grille.
  const bumpF = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, W * 0.98), chrome);
  bumpF.position.set(L / 2 + 0.05, H * 0.32, 0);
  g.add(bumpF);
  const bumpR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, W * 0.98), chrome);
  bumpR.position.set(-L / 2 - 0.05, H * 0.32, 0);
  g.add(bumpR);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, W * 0.6), chrome);
  grille.position.set(L / 2 + 0.12, H * 0.55, 0);
  g.add(grille);
  // Headlights (two big rounds) + full-width tail strip.
  const lights = [];
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 1.4 }));
    lamp.position.set(L / 2 + 0.1, H * 0.6, s * W * 0.32);
    g.add(lamp);
    lights.push(lamp);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, W * 0.9),
    new THREE.MeshStandardMaterial({ color: 0xd21f1f, emissive: 0xaa1010, emissiveIntensity: 1.1 }));
  tail.position.set(-L / 2 - 0.1, H * 0.6, 0);
  g.add(tail);
  lights.push(tail);
  // Kept aside so drive() can flare the tail light when braking.
  g.userData.tail = tail;
  // Spoiler on the sport car.
  if (spec.spoiler) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, W * 0.9), paintMat(THREE, 0x1a1a1a, 0.4, 0.6));
    wing.position.set(-L / 2 - 0.1, H * 1.05, 0);
    g.add(wing);
    for (const s of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), paintMat(THREE, 0x1a1a1a, 0.4, 0.6));
      strut.position.set(-L / 2 - 0.1, H * 0.88, s * W * 0.35);
      g.add(strut);
    }
  }
  // Taxi sign.
  if (spec.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xcc9900, emissiveIntensity: 0.7 }));
    sign.position.set(-L * 0.02, H * 1.25, 0);
    g.add(sign);
  }
  // Food truck: serving hatch + menu board on the side.
  if (spec.vendor) {
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(L * 0.4, 0.7, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xff5a8a, emissive: 0xcc2a5a, emissiveIntensity: 0.6 }));
    hatch.position.set(0, H * 0.9, W / 2 + 0.05);
    g.add(hatch);
  }
  // Police light bar.
  if (spec.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.1), paintMat(THREE, 0x222222, 0.6));
    bar.position.set(-L * 0.02, H * 1.2, 0);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff1111, emissiveIntensity: 1.6 }));
    red.position.set(-L * 0.02, H * 1.2, -0.28);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.2, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x1122ff, emissiveIntensity: 1.6 }));
    blue.position.set(-L * 0.02, H * 1.2, 0.28);
    g.add(blue);
    lights.push(red, blue);
  }
  // Armored truck: vault box + roof hatch.
  if (spec.armored) {
    const vault = new THREE.Mesh(new THREE.BoxGeometry(L * 0.5, H * 0.5, W * 0.9), paintMat(THREE, 0x8a8f96, 0.5, 0.7));
    vault.position.set(-L * 0.1, H * 1.1, 0);
    g.add(vault);
  }
  // Wheels with silver hubs.
  const wheels = [];
  const wheelR = kind === 'bus' ? 0.5 : 0.38;
  for (const wx of [L * 0.32, -L * 0.32]) {
    for (const wz of [W / 2 + 0.02, -W / 2 - 0.02]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 12), rubber);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, wheelR, wz);
      wheel.castShadow = true;
      g.add(wheel);
      wheels.push(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.45, wheelR * 0.45, 0.28, 8), chrome);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(wx, wheelR, wz);
      g.add(hub);
    }
  }
  g.userData.wheels = wheels;
  g.userData.lights = lights;
  return g;
}

// Drive input the physics reads: { fwd, back, steer, brake } in 0..1.
// The gamepad's triggers and left stick feed the same shape when a
// controller is connected (Controls exposes padFwd/padBack/padSteer).
export function readDriveInput(keys) {
  const padFwd = typeof keys.padFwd === 'function' ? keys.padFwd() : 0;
  const padBack = typeof keys.padBack === 'function' ? keys.padBack() : 0;
  const padSteer = typeof keys.padSteer === 'function' ? keys.padSteer() : 0;
  const steer = (keys.isDown(CFG.KEYS.LEFT) ? 1 : 0) - (keys.isDown(CFG.KEYS.RIGHT) ? 1 : 0) + padSteer;
  return {
    fwd: keys.isDown(CFG.KEYS.FWD) || padFwd ? 1 : 0,
    back: keys.isDown(CFG.KEYS.BACK) || padBack ? 1 : 0,
    steer: clamp(steer, -1, 1),
    brake: keys.isDown(CFG.KEYS.BRAKE) ? 1 : 0,
  };
}

export class Vehicle {
  constructor(THREE, city, kind, x, z, heading, color) {
    this.THREE = THREE;
    this.city = city;
    this.kind = kind;
    this.spec = CAR_KINDS[kind] || CAR_KINDS.sedan;
    this.color = color;
    this.mesh = buildCarMesh(THREE, kind, color);
    // pos is a Vector3 with a real y, so mesh.position.set never sees
    // an undefined component (the v4 NaN bug: a plain {x, z} object
    // made cars vanish when its y was read).
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.crashed = false;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
  }

  setPose(x, z, heading) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
  }

  // One physics step. `drive` is { fwd, back, steer, brake }.
  drive(dt, drive, topOverride) {
    const spec = this.spec;
    const top = topOverride || spec.top;
    let accel = 0;
    if (drive.fwd) accel += spec.accel;
    if (drive.back) accel -= CFG.CAR_REV_ACCEL;
    if (drive.brake) {
      this.speed -= Math.sign(this.speed) * CFG.HANDBRAKE * dt;
      if (Math.abs(this.speed) < 0.5) this.speed = 0;
    }
    this.speed += accel * dt;
    // Drag + caps.
    this.speed -= this.speed * CFG.CAR_DRAG * dt;
    this.speed = clamp(this.speed, -CFG.CAR_TOP_REV, top);
    if (Math.abs(this.speed) < 0.05 && !drive.fwd && !drive.back) this.speed = 0;
    // Steering scales with speed and flips in reverse.
    const steer = drive.steer * spec.steer * clamp(Math.abs(this.speed) / 12, 0, 1);
    this.heading += steer * Math.sign(this.speed || 1) * dt;
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const fixed = this.city.resolveCircle(nx, nz, spec.len * 0.42);
    if (fixed.x !== nx || fixed.z !== nz) {
      // Bumped a building: kill speed, mark a crash for the game.
      if (Math.abs(this.speed) > 8) this.crashed = true;
      this.speed *= 0.3;
    }
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Spin the wheels.
    const spin = (this.speed * dt) / 0.38;
    for (const w of this.mesh.userData.wheels || []) w.rotation.z -= spin;
    // Brake lights: the tail strip flares while the brake is held.
    const tail = this.mesh.userData.tail;
    if (tail) tail.material.emissiveIntensity = drive.brake ? 2.8 : 1.1;
    return this;
  }

  // Keep the mesh transform in sync after an external move.
  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }
}

// Parked cars along the roads, for stealing.
export function parkVehicles(THREE, city, rng, count) {
  const out = [];
  const kinds = ['sedan', 'sport', 'convertible', 'taxi', 'pickup', 'van', 'limo', 'moto', 'foodtruck'];
  for (let i = 0; i < count; i += 1) {
    const kind = rng.pick(kinds);
    const alongRoad = rng.chance(0.5);
    const line = alongRoad
      ? city.roadXs[Math.floor(rng.next() * city.roadXs.length)]
      : city.roadZs[Math.floor(rng.next() * city.roadZs.length)];
    const t = -city.half + 20 + rng.next() * (city.half * 2 - 40);
    const x = alongRoad ? line + (rng.chance(0.5) ? 4.2 : -4.2) : t;
    const z = alongRoad ? t : line + (rng.chance(0.5) ? 4.2 : -4.2);
    const heading = alongRoad ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    const color = kind === 'sport' ? 0xd23c2e : rng.pick(PAINT);
    const car = new Vehicle(THREE, city, kind, x, z, heading, color);
    city.group.add(car.mesh);
    out.push(car);
  }
  return out;
}

// The armored van for the Harbor Heist, parked at the bank.
export function makeArmoredVan(THREE, city, rng) {
  const van = new Vehicle(THREE, city, 'truck', 46, -58, Math.PI / 2, 0x8a8f96);
  city.group.add(van.mesh);
  return van;
}

// The cash cart for the Casino Caper, parked at the Golden Anchor.
export function makeCashCart(THREE, city, rng) {
  const cart = new Vehicle(THREE, city, 'van', 12, -city.half + 22, Math.PI, 0x1a1a1a);
  city.group.add(cart.mesh);
  return cart;
}
