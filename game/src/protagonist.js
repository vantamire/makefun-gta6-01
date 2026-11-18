// VICE HARBOR v6 — the protagonist.
// The player on foot: a visible third-person figure (burgundy jacket,
// white tee, jeans, red cap worn backwards, pivoting arms and legs) who
// walks, runs, shoves pedestrians with F, draws the pistol with Q, cycles
// weapons with X (pistol → scattergun → SMG), fires with F, reloads with
// R, and steals any parked car with E. Health regens after a quiet
// stretch; armor absorbs damage first. The protagonist collides with
// building circles and stays inside the city.

import { CFG } from './settings.js';
import { clamp, steerToward } from './rng.js';

const WEAPONS = ['pistol', 'scatter', 'smg'];
const MAG = { pistol: CFG.PISTOL_MAG, scatter: CFG.SCATTER_MAG, smg: CFG.SMG_MAG };
const REACH = { pistol: CFG.PISTOL_REACH, scatter: CFG.SCATTER_REACH, smg: CFG.SMG_REACH };
const PAUSE = { pistol: CFG.PISTOL_PAUSE, scatter: CFG.SCATTER_PAUSE, smg: CFG.SMG_PAUSE };
const SPREAD = { pistol: CFG.PISTOL_SPREAD, scatter: CFG.SCATTER_SPREAD, smg: CFG.SMG_SPREAD };
const RELOAD = { pistol: CFG.PISTOL_RELOAD_S, scatter: CFG.SCATTER_RELOAD_S, smg: CFG.SMG_RELOAD_S };
const PELLETS = { pistol: 1, scatter: CFG.SCATTER_PELLETS, smg: 1 };

export class Protagonist {
  constructor(THREE, city) {
    this.THREE = THREE;
    this.city = city;
    this.mesh = this._buildFigure(THREE);
    this.pos = this.mesh.position;
    this.pos.set(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.health = 100;
    this.armor = 50;
    // Sprint stamina: running drains it, standing still refills it.
    // When it hits zero the hero can only walk until it recovers.
    this.stamina = 100;
    this.car = null;
    this.weapon = 'none'; // 'none' | 'pistol' | 'scatter' | 'smg'
    this.ammo = 0;
    this.reloading = false;
    this._reloadT = 0;
    this._coolT = 0;
    this._quietT = 0;
    this._swing = 0;
    this._velX = 0;
    this._velZ = 0;
  }

  _mat(T, color, rough) {
    return new T.MeshStandardMaterial({ color, roughness: rough ?? 0.85 });
  }

  _buildFigure(T) {
    const g = new T.Group();
    g.name = 'hero';
    const jacket = this._mat(T, 0x7a1f2b, 0.8);
    const tee = this._mat(T, 0xf5f0e0, 0.9);
    const jeans = this._mat(T, 0x2e4a6a, 0.9);
    const skin = this._mat(T, 0xc68e5f, 0.7);
    const capMat = this._mat(T, 0xd23c2e, 0.85);

    const legs = new T.Mesh(new T.BoxGeometry(0.46, 0.66, 0.28), jeans);
    legs.position.y = 0.33;
    legs.castShadow = true;
    g.add(legs);
    const torso = new T.Mesh(new T.BoxGeometry(0.56, 0.74, 0.32), jacket);
    torso.position.y = 1.02;
    torso.castShadow = true;
    g.add(torso);
    const chest = new T.Mesh(new T.BoxGeometry(0.4, 0.5, 0.06), tee);
    chest.position.set(0, 1.02, 0.17);
    g.add(chest);
    const head = new T.Mesh(new T.SphereGeometry(0.22, 12, 10), skin);
    head.position.y = 1.58;
    head.castShadow = true;
    g.add(head);
    const cap = new T.Mesh(new T.CylinderGeometry(0.23, 0.24, 0.1, 12), capMat);
    cap.position.y = 1.74;
    g.add(cap);
    const brim = new T.Mesh(new T.BoxGeometry(0.26, 0.03, 0.18), capMat);
    brim.position.set(0, 1.71, -0.24);
    g.add(brim);
    const armL = new T.Mesh(new T.BoxGeometry(0.12, 0.62, 0.12), jacket);
    armL.position.set(-0.35, 1.02, 0);
    armL.castShadow = true;
    g.add(armL);
    const armR = new T.Mesh(new T.BoxGeometry(0.12, 0.62, 0.12), jacket);
    armR.position.set(0.35, 1.02, 0);
    armR.castShadow = true;
    g.add(armR);
    // The pistol, hidden until drawn.
    const pistol = new T.Group();
    pistol.name = 'pistol';
    const barrel = new T.Mesh(new T.BoxGeometry(0.3, 0.08, 0.08), this._mat(T, 0x222222, 0.4, 0.6));
    barrel.position.set(0.12, 0, 0);
    pistol.add(barrel);
    const grip = new T.Mesh(new T.BoxGeometry(0.08, 0.18, 0.08), this._mat(T, 0x222222, 0.4, 0.6));
    grip.position.set(-0.02, -0.1, 0);
    pistol.add(grip);
    pistol.position.set(0.35, 0.78, 0.2);
    pistol.visible = false;
    g.add(pistol);
    // The scattergun, longer and wider, hidden until drawn.
    const scatter = new T.Group();
    scatter.name = 'scatter';
    const sBarrel = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.7, 8), this._mat(T, 0x333333, 0.4, 0.6));
    sBarrel.rotation.z = Math.PI / 2;
    sBarrel.position.set(0.2, 0, 0);
    scatter.add(sBarrel);
    const stock = new T.Mesh(new T.BoxGeometry(0.3, 0.12, 0.1), this._mat(T, 0x5a4028, 0.85));
    stock.position.set(-0.2, -0.02, 0);
    scatter.add(stock);
    scatter.position.set(0.35, 0.78, 0.2);
    scatter.visible = false;
    g.add(scatter);
    // The SMG: compact, with a magazine and a foregrip, hidden until drawn.
    const smg = new T.Group();
    smg.name = 'smg';
    const sBody = new T.Mesh(new T.BoxGeometry(0.5, 0.12, 0.1), this._mat(T, 0x222222, 0.4, 0.6));
    sBody.position.set(0.15, 0, 0);
    smg.add(sBody);
    const mag = new T.Mesh(new T.BoxGeometry(0.08, 0.24, 0.08), this._mat(T, 0x444444, 0.5, 0.5));
    mag.position.set(0.1, -0.16, 0);
    smg.add(mag);
    const gripF = new T.Mesh(new T.BoxGeometry(0.08, 0.16, 0.08), this._mat(T, 0x222222, 0.4, 0.6));
    gripF.position.set(0.32, -0.12, 0);
    smg.add(gripF);
    smg.position.set(0.35, 0.78, 0.2);
    smg.visible = false;
    g.add(smg);
    g.userData.arms = [armL, armR];
    g.userData.pistol = pistol;
    g.userData.scatter = scatter;
    g.userData.smg = smg;
    return g;
  }

  _faceDirection(input, camYaw) {
    const mv = input.moveVec();
    if (mv.x === 0 && mv.z === 0) return 0;
    const worldX = mv.x * Math.cos(camYaw) - mv.z * Math.sin(camYaw);
    const worldZ = mv.x * Math.sin(camYaw) + mv.z * Math.cos(camYaw);
    return Math.atan2(worldX, worldZ);
  }

  _easeVel(tx, tz, dt) {
    const k = Math.min(1, dt * 10);
    this._velX += (tx - this._velX) * k;
    this._velZ += (tz - this._velZ) * k;
  }

  _limbPose(swing) {
    const arms = this.mesh.userData.arms;
    if (!arms) return;
    arms[0].rotation.x = swing;
    arms[1].rotation.x = -swing;
  }

  _calmLimbs() {
    this._limbPose(0);
  }

  _showWeapon() {
    this.mesh.userData.pistol.visible = this.weapon === 'pistol';
    this.mesh.userData.scatter.visible = this.weapon === 'scatter';
    this.mesh.userData.smg.visible = this.weapon === 'smg';
  }

  update(dt, input, city, camYaw) {
    if (this.car) return this; // driving is the car's job
    this._coolT = Math.max(0, this._coolT - dt);
    if (this.reloading) {
      this._reloadT -= dt;
      if (this._reloadT <= 0) {
        this.reloading = false;
        this.ammo = MAG[this.weapon] || 0;
      }
    }
    const mv = input.moveVec();
    const wantsRun = input.isDown(CFG.KEYS.RUN) || input.isDown(CFG.KEYS.RUN2);
    // Sprinting drains stamina; when it is gone the hero walks.
    const running = wantsRun && this.stamina > 0;
    if (running) {
      this.stamina = Math.max(0, this.stamina - 22 * dt);
    } else if (!wantsRun) {
      this.stamina = Math.min(100, this.stamina + 16 * dt);
    }
    const top = running ? CFG.FOOT_RUN : CFG.FOOT_WALK;
    const moving = mv.x !== 0 || mv.z !== 0;
    if (moving) {
      const wantHeading = this._faceDirection(input, camYaw);
      this.heading = steerToward(this.heading, wantHeading, 8 * dt);
      const wx = Math.sin(this.heading);
      const wz = Math.cos(this.heading);
      this._easeVel(wx * top, wz * top, dt);
      this._quietT = 0;
    } else {
      this._easeVel(0, 0, dt);
      this._quietT += dt;
    }
    this.speed = Math.hypot(this._velX, this._velZ);
    const nx = this.pos.x + this._velX * dt;
    const nz = this.pos.z + this._velZ * dt;
    const fixed = city.resolveCircle(nx, nz, CFG.HERO_RADIUS);
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.mesh.rotation.y = this.heading;
    // Walk-cycle: arms swing, body bobs.
    if (this.speed > 0.3) {
      this._swing += dt * this.speed * 1.6;
      this._limbPose(Math.sin(this._swing) * 0.55);
      this.mesh.position.y = Math.abs(Math.sin(this._swing)) * 0.05;
    } else {
      this._calmLimbs();
      this.mesh.position.y = 0;
    }
    // Health regens after a quiet stretch.
    if (this._quietT > 6 && this.health < 100) {
      this.health = Math.min(100, this.health + 3 * dt);
    }
    return this;
  }

  damage(amount) {
    let left = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, left);
      this.armor -= absorbed;
      left -= absorbed;
    }
    this.health = Math.max(0, this.health - left);
    this._quietT = 0;
    return this.health;
  }

  punch() {
    // A short forward shove; main.js finds the nearest pedestrian.
    return { x: this.pos.x + Math.sin(this.heading) * 1.6, z: this.pos.z + Math.cos(this.heading) * 1.6 };
  }

  drawWeapon() {
    if (this.weapon === 'none') {
      this.weapon = 'pistol';
      this.ammo = CFG.PISTOL_MAG;
    } else {
      this.weapon = 'none';
      this.ammo = 0;
    }
    this.reloading = false;
    this._showWeapon();
    return this.weapon;
  }

  cycleWeapon() {
    if (this.weapon === 'none') return 'none';
    const idx = WEAPONS.indexOf(this.weapon);
    this.weapon = WEAPONS[(idx + 1) % WEAPONS.length];
    this.ammo = MAG[this.weapon];
    this.reloading = false;
    this._showWeapon();
    return this.weapon;
  }

  reload() {
    if (this.weapon === 'none' || this.reloading) return false;
    const full = MAG[this.weapon];
    if (this.ammo >= full) return false;
    this.reloading = true;
    this._reloadT = RELOAD[this.weapon];
    return true;
  }

  // Fire a hitscan shot. Returns null when it cannot fire (cooling down,
  // reloading, empty, or unarmed). Otherwise returns the shot cone:
  // { origin, dir, range, spread, pellets } for main.js to resolve.
  shoot() {
    if (this.weapon === 'none' || this.reloading || this._coolT > 0) return null;
    if (this.ammo <= 0) return { empty: true };
    this.ammo -= 1;
    this._coolT = PAUSE[this.weapon];
    const dir = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
    return {
      origin: { x: this.pos.x, y: 1.3, z: this.pos.z },
      dir,
      range: REACH[this.weapon],
      spread: SPREAD[this.weapon],
      pellets: PELLETS[this.weapon],
    };
  }

  enterVehicle(vehicle) {
    this.car = vehicle;
    this.mesh.visible = false;
    this._velX = 0;
    this._velZ = 0;
  }

  exitVehicle() {
    if (!this.car) return null;
    const car = this.car;
    this.car = null;
    const side = car.pos.x + Math.cos(car.heading) * 2.2;
    const sideZ = car.pos.z - Math.sin(car.heading) * 2.2;
    const fixed = this.city.resolveCircle(side, sideZ, CFG.HERO_RADIUS);
    this.pos.set(fixed.x, 0, fixed.z);
    this.heading = car.heading;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    return car;
  }

  teleport(x, z, heading) {
    const fixed = this.city.resolveCircle(x, z, CFG.HERO_RADIUS);
    this.pos.set(fixed.x, 0, fixed.z);
    this.heading = heading ?? this.heading;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    return this;
  }
}
