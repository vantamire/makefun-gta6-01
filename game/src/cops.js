// VICE HARBOR v6 — the police.
// Harbor PD: cruisers that spawn near the player and chase, a helicopter
// that circles above at 3+ stars with a searchlight and a blinking belly
// bar, and striped roadblocks that go up across the road ahead at 3+
// stars. Wanted level decays one star per quiet stretch. Cops ram the
// player; when a cruiser gets close enough it busts the player. The
// helicopter never lands — it just keeps the pressure on from above.

import { CFG } from './settings.js';
import { Vehicle } from './vehicles.js';
import { Rng, clamp, steerToward } from './rng.js';

export class Police {
  constructor(THREE, city) {
    this.THREE = THREE;
    this.city = city;
    this.wanted = 0;
    this.quietT = 0;
    this.cops = [];
    this.heli = null;
    this.blocks = [];
    this._rotorT = 0;
    this._flashT = 0;
    this._rng = new Rng(9001);
  }

  add(n) {
    this.wanted = clamp(this.wanted + n, 0, CFG.HEAT_MAX);
    this.quietT = 0;
  }

  reset() {
    this.wanted = 0;
    this.quietT = 0;
    for (const cop of this.cops) this.city.group.remove(cop.mesh);
    this.cops = [];
    this._dropHeli();
    this._clearBlocks();
  }

  _cruiserCount() {
    return Math.min(1 + Math.floor(this.wanted / 2), 4);
  }

  _spawnCopNear(playerPos) {
    const T = this.THREE;
    const angle = this._rng.next() * Math.PI * 2;
    const dist = 55 + this._rng.next() * 25;
    const x = clamp(playerPos.x + Math.sin(angle) * dist, -this.city.half + 10, this.city.half - 10);
    const z = clamp(playerPos.z + Math.cos(angle) * dist, -this.city.half + 10, this.city.half - 10);
    const cop = new Vehicle(T, this.city, 'cruiser', x, z, 0, 0xf5f0e0);
    this.city.group.add(cop.mesh);
    this.cops.push(cop);
    return cop;
  }

  _dropCop(cop) {
    this.city.group.remove(cop.mesh);
    this.cops.splice(this.cops.indexOf(cop), 1);
  }

  _buildHeli() {
    const T = this.THREE;
    const g = new T.Group();
    g.name = 'heli';
    const body = new T.Mesh(new T.BoxGeometry(4.4, 1.6, 2.2),
      new T.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.5, metalness: 0.5 }));
    body.castShadow = true;
    g.add(body);
    const glass = new T.Mesh(new T.BoxGeometry(1.6, 1.2, 2.0),
      new T.MeshStandardMaterial({ color: 0xbfe3f0, roughness: 0.15, metalness: 0.7 }));
    glass.position.set(2.2, 0.2, 0);
    g.add(glass);
    const tail = new T.Mesh(new T.BoxGeometry(3.6, 0.5, 0.5),
      new T.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.5, metalness: 0.5 }));
    tail.position.set(-3.6, 0.4, 0);
    g.add(tail);
    const fin = new T.Mesh(new T.BoxGeometry(0.3, 1.4, 0.5),
      new T.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.5, metalness: 0.5 }));
    fin.position.set(-5.2, 1, 0);
    g.add(fin);
    const rotor = new T.Group();
    rotor.position.set(0, 1.1, 0);
    for (let i = 0; i < 2; i += 1) {
      const blade = new T.Mesh(new T.BoxGeometry(9, 0.08, 0.5),
        new T.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 }));
      blade.rotation.y = (i / 2) * Math.PI;
      rotor.add(blade);
    }
    g.add(rotor);
    for (const sz of [0.9, -0.9]) {
      const skid = new T.Mesh(new T.BoxGeometry(3.4, 0.12, 0.3),
        new T.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.7 }));
      skid.position.set(0, -1.1, sz);
      g.add(skid);
    }
    const belly = new T.Mesh(new T.BoxGeometry(1.2, 0.3, 1.2),
      new T.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff1111, emissiveIntensity: 1.8 }));
    belly.position.set(0, -0.95, 0);
    g.add(belly);
    const beam = new T.Mesh(
      new T.CylinderGeometry(2.2, 3.4, 30, 16, 1, true),
      new T.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.14, side: T.DoubleSide, depthWrite: false }),
    );
    beam.position.set(0, -16, 0);
    g.add(beam);
    g.userData.rotor = rotor;
    g.userData.belly = belly;
    g.userData.beam = beam;
    return g;
  }

  _raiseHeli(playerPos) {
    if (this.heli) return;
    const g = this._buildHeli();
    g.position.set(playerPos.x + 20, CFG.HELI_ALT, playerPos.z - 20);
    this.city.group.add(g);
    this.heli = { mesh: g, angle: 0 };
  }

  _dropHeli() {
    if (!this.heli) return;
    this.city.group.remove(this.heli.mesh);
    this.heli = null;
  }

  _raiseBlocks(playerPos, heading) {
    if (this.blocks.length) return;
    const T = this.THREE;
    // Two striped barricades across the road ahead of the player.
    const ahead = 26;
    const ax = playerPos.x + Math.sin(heading) * ahead;
    const az = playerPos.z + Math.cos(heading) * ahead;
    for (const off of [-4, 4]) {
      const bx = ax + Math.cos(heading) * off;
      const bz = az - Math.sin(heading) * off;
      const bar = new T.Group();
      const stripe = new T.Mesh(new T.BoxGeometry(4.4, 1.1, 0.5),
        new T.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 }));
      stripe.position.y = 1.1;
      stripe.castShadow = true;
      bar.add(stripe);
      const stripe2 = new T.Mesh(new T.BoxGeometry(4.4, 0.35, 0.52),
        new T.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.7 }));
      stripe2.position.y = 1.1;
      bar.add(stripe2);
      for (const s of [-1.8, 1.8]) {
        const leg = new T.Mesh(new T.BoxGeometry(0.3, 1.1, 0.3),
          new T.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 }));
        leg.position.set(s, 0.55, 0);
        bar.add(leg);
      }
      bar.position.set(bx, 0, bz);
      bar.rotation.y = heading + Math.PI / 2;
      this.city.group.add(bar);
      this.blocks.push({ mesh: bar, x: bx, z: bz });
      this.city.solids.push({ x: bx, z: bz, r: 2.4 });
    }
  }

  _clearBlocks() {
    for (const b of this.blocks) {
      this.city.group.remove(b.mesh);
      const i = this.city.solids.findIndex((s) => s.x === b.x && s.z === b.z);
      if (i >= 0) this.city.solids.splice(i, 1);
    }
    this.blocks = [];
  }

  _chaseTop(playerTop) {
    return Math.min(38, Math.max(26, (playerTop || 30) + 2));
  }

  update(dt, player, vehicles) {
    const playerPos = player && player.pos ? player.pos : null;
    const playerCar = player && player.car ? player.car : null;
    const playerTop = playerCar ? playerCar.spec.top : CFG.CAR_TOP;
    const hasPlayer = !!playerPos;

    // Decay: one star per quiet stretch.
    if (this.wanted > 0) {
      this.quietT += dt;
      if (this.quietT > CFG.HEAT_COOL_S) {
        this.wanted = Math.max(0, this.wanted - 1);
        this.quietT = 0;
      }
    }

    // Cruiser count follows the heat.
    if (hasPlayer && this.wanted > 0) {
      while (this.cops.length < this._cruiserCount()) this._spawnCopNear(playerPos);
      while (this.cops.length > this._cruiserCount()) this._dropCop(this.cops[this.cops.length - 1]);
    } else if (this.wanted === 0) {
      while (this.cops.length) this._dropCop(this.cops[0]);
    }

    // Helicopter + roadblocks at 3+ stars.
    if (hasPlayer && this.wanted >= CFG.HELI_MIN_HEAT) {
      this._raiseHeli(playerPos);
      if (playerCar) this._raiseBlocks(playerPos, playerCar.heading);
    } else {
      this._dropHeli();
      this._clearBlocks();
    }

    // Chase each cruiser at the player.
    const chaseTop = this._chaseTop(playerTop);
    this._flashT += dt;
    const strobe = Math.sin(this._flashT * 8) > 0;
    for (const cop of this.cops) {
      if (!hasPlayer) break;
      const dx = playerPos.x - cop.pos.x;
      const dz = playerPos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      cop.heading = steerToward(cop.heading, Math.atan2(dx, dz), 2.4 * dt);
      const drive = { fwd: dist > 4 ? 1 : 0, back: 0, steer: 0, brake: 0 };
      cop.drive(dt, drive, chaseTop);
      // Light bar: alternate the red and blue strobes while chasing.
      const lights = cop.mesh.userData.lights || [];
      const red = lights[lights.length - 2];
      const blue = lights[lights.length - 1];
      if (red && blue) {
        red.material.emissiveIntensity = strobe ? 2.6 : 0.3;
        blue.material.emissiveIntensity = strobe ? 0.3 : 2.6;
      }
      // Ram: a close cruiser shoves the player.
      if (dist < 3.4 && player.damage) {
        player.damage(6 * dt);
      }
      // Cops also push each other apart.
      for (const other of this.cops) {
        if (other === cop) continue;
        const ox = cop.pos.x - other.pos.x;
        const oz = cop.pos.z - other.pos.z;
        const od = Math.hypot(ox, oz);
        if (od < 5 && od > 0.01) {
          cop.pos.x += (ox / od) * (5 - od) * 0.5 * dt * 10;
          cop.pos.z += (oz / od) * (5 - od) * 0.5 * dt * 10;
        }
      }
    }

    // Helicopter circles the player with its searchlight.
    if (this.heli && hasPlayer) {
      this.heli.angle += dt * 0.35;
      const r = 26;
      this.heli.mesh.position.set(
        playerPos.x + Math.cos(this.heli.angle) * r,
        CFG.HELI_ALT + Math.sin(this.heli.angle * 0.7) * 3,
        playerPos.z + Math.sin(this.heli.angle) * r,
      );
      this.heli.mesh.rotation.y = -this.heli.angle;
      this.heli.mesh.userData.rotor.rotation.y += dt * 22;
      this._rotorT += dt;
      const blink = Math.sin(this._rotorT * 6) > 0 ? 1.8 : 0.2;
      this.heli.mesh.userData.belly.material.emissiveIntensity = blink;
    }
    return this;
  }
}

export function makePolice(THREE, city) {
  return new Police(THREE, city);
}
