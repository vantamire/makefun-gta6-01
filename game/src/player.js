// v4 — player.js
// The player on foot: a chunky third-person GTA-style character you can
// actually SEE from behind — burgundy open jacket over a white tee, blue
// jeans, sneakers, and a red cap worn backwards, so the follow camera
// always has a person in frame instead of a floating viewpoint. WASD
// moves relative to the camera, Shift runs, F throws a punch, and an
// axis-separated slide keeps the player out of buildings and inside the
// bounds. Movement is velocity-smoothed, so starting and stopping feels
// like weight instead of teleporting.
//
// New in v4: a WEAPON. Q draws the pistol (12-round magazine, F fires a
// hitscan shot with a tracer, R reloads); on foot the pistol is the
// Vigilante mission's tool, and firing it raises the heat. Fists are the
// default — F punches, and the punch still shoves a pedestrian down.
//
// Every limb hangs from a pivot group at its joint (shoulder / hip), so
// the walk cycle swings arms and legs from the right place instead of
// spinning boxes around their middles. The shoes ride inside the leg
// pivots, so they follow the stride for free.

import { CONFIG } from './config.js';
import { clamp } from './random.js';

// Walk-cycle rate: the limbs swing faster when running, and the swing
// is driven by distance travelled, so the feet match the ground speed.
const WALK_SWING = 7;
const RUN_SWING = 11;

// The look: a Vice Harbor street kid — burgundy jacket, white tee, blue
// jeans, dark sneakers with pale soles, skin, hair and a backwards cap.
const WARDROBE = {
  jacket: 0x8a2432, // deep burgundy, reads from behind at dusk
  tee: 0xf2ede2, // warm white tee under the open jacket
  jeans: 0x2e4a6b, // classic blue denim
  sneakers: 0x1c1c22,
  sole: 0xe8e6df,
  skin: 0xc98d5f,
  hair: 0x241a12,
  cap: 0xd23c2e, // bright red cap, brim to the back
  belt: 0x14100c,
  pistol: 0x1a1a1e, // gunmetal
};

export class Player {
  constructor(THREE, world) {
    this.THREE = THREE;
    this.world = world;
    const [sx, sz] = world.spawnPoints.player;
    this.pos = new THREE.Vector3(sx, 0, sz);
    this.heading = 0;
    this.speed = 0;
    this.onFoot = true;
    this.vehicle = null;
    // Punch (F): a short forward swing. punchTimer counts the swing down
    // (the arms animate while it runs); punchCooldown throttles repeats.
    this.punchTimer = 0;
    this.punchCooldown = 0;
    // Pistol (Q to draw, F to fire, R to reload): 12 rounds, a short
    // reload, and a fire cooldown so it cannot machine-gun.
    this.weapon = 'fists';
    this.ammo = CONFIG.PISTOL_MAG;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this._phase = 0;
    this._velX = 0;
    this._velZ = 0;

    this.mesh = new THREE.Group();
    this.mesh.name = 'Player';
    this._buildFigure(THREE);
    this.mesh.position.copy(this.pos);
  }

  // One material per colour, shared by every part that wears it.
  _mat(T, color, rough) {
    return new T.MeshStandardMaterial({ color, roughness: rough ?? 0.85, metalness: 0 });
  }

  _buildFigure(T) {
    const jacket = this._mat(T, WARDROBE.jacket, 0.9);
    const tee = this._mat(T, WARDROBE.tee, 0.9);
    const jeans = this._mat(T, WARDROBE.jeans, 0.95);
    const shoeMat = this._mat(T, WARDROBE.sneakers, 0.7);
    const soleMat = this._mat(T, WARDROBE.sole, 0.6);
    const skin = this._mat(T, WARDROBE.skin, 0.7);
    const hair = this._mat(T, WARDROBE.hair, 0.95);
    const cap = this._mat(T, WARDROBE.cap, 0.85);
    const gunmetal = this._mat(T, WARDROBE.pistol, 0.4);

    // Torso + head parts as a table: [width, height, depth, material,
    // x, y, z]. The jacket back panel is the big burgundy block the
    // follow camera sees; the tee shows as a pale strip down the front.
    const torsoParts = [
      [0.58, 0.64, 0.30, tee, 0, 1.08, 0], // white tee
      [0.62, 0.66, 0.08, jacket, 0, 1.08, -0.15], // jacket back panel
      [0.17, 0.64, 0.06, jacket, -0.21, 1.08, 0.16], // jacket front left
      [0.17, 0.64, 0.06, jacket, 0.21, 1.08, 0.16], // jacket front right
      [0.50, 0.10, 0.34, jacket, 0, 1.42, 0], // collar, standing up
      [0.60, 0.07, 0.32, this._mat(T, WARDROBE.belt, 0.6), 0, 0.74, 0], // belt
    ];
    for (const [w, h, d, m, x, y, z] of torsoParts) {
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.mesh.add(mesh);
    }
    // Head: skin, hair at the back, and a red cap worn backwards — the
    // brim sticks out behind the head, so the cap reads from the follow
    // camera as well as from the front.
    const head = new T.Mesh(new T.SphereGeometry(0.23, 12, 10), skin);
    head.position.set(0, 1.66, 0);
    head.castShadow = true;
    this.mesh.add(head);
    const hairBack = new T.Mesh(
      new T.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair
    );
    hairBack.position.set(0, 1.7, 0);
    this.mesh.add(hairBack);
    const capTop = new T.Mesh(new T.CylinderGeometry(0.24, 0.25, 0.09, 12), cap);
    capTop.position.set(0, 1.84, 0);
    this.mesh.add(capTop);
    const brim = new T.Mesh(new T.BoxGeometry(0.26, 0.03, 0.18), cap);
    brim.position.set(0, 1.82, -0.28);
    this.mesh.add(brim);

    // Limbs: each one is a pivot group at the joint, with the mesh
    // hanging below it, so rotation.x swings it like a real arm/leg.
    const makeLimb = (x, y) => {
      const pivot = new T.Group();
      pivot.position.set(x, y, 0);
      this.mesh.add(pivot);
      return pivot;
    };
    const limbPart = (pivot, w, h, d, m, x, y, z) => {
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      pivot.add(mesh);
      return mesh;
    };
    // Arms: burgundy sleeve + skin hand at the end.
    this.armL = makeLimb(-0.38, 1.36);
    limbPart(this.armL, 0.15, 0.6, 0.15, jacket, 0, -0.3, 0);
    limbPart(this.armL, 0.13, 0.12, 0.13, skin, 0, -0.66, 0);
    this.armR = makeLimb(0.38, 1.36);
    limbPart(this.armR, 0.15, 0.6, 0.15, jacket, 0, -0.3, 0);
    limbPart(this.armR, 0.13, 0.12, 0.13, skin, 0, -0.66, 0);
    // Legs: blue jeans + sneaker (dark top, pale sole) at the foot.
    this.legL = makeLimb(-0.15, 0.72);
    limbPart(this.legL, 0.18, 0.66, 0.18, jeans, 0, -0.33, 0);
    limbPart(this.legL, 0.19, 0.09, 0.30, shoeMat, 0, -0.68, 0.04);
    limbPart(this.legL, 0.20, 0.04, 0.31, soleMat, 0, -0.72, 0.04);
    this.legR = makeLimb(0.15, 0.72);
    limbPart(this.legR, 0.18, 0.66, 0.18, jeans, 0, -0.33, 0);
    limbPart(this.legR, 0.19, 0.09, 0.30, shoeMat, 0, -0.68, 0.04);
    limbPart(this.legR, 0.20, 0.04, 0.31, soleMat, 0, -0.72, 0.04);
    // Keep the old slot names the rest of the game expects: shoes ride
    // with their legs now, so point the slots at the leg pivots.
    this.shoeL = this.legL;
    this.shoeR = this.legR;

    // The pistol: a small gunmetal block in the right hand, hidden
    // until Q draws it. It hangs from the right arm's pivot so it
    // follows the arm's aim.
    this.pistolMesh = new T.Group();
    const barrel = new T.Mesh(new T.BoxGeometry(0.07, 0.07, 0.34), gunmetal);
    barrel.position.set(0, -0.68, 0.16);
    this.pistolMesh.add(barrel);
    const grip = new T.Mesh(new T.BoxGeometry(0.07, 0.16, 0.09), gunmetal);
    grip.position.set(0, -0.76, 0.02);
    this.pistolMesh.add(grip);
    this.pistolMesh.visible = false;
    this.armR.add(this.pistolMesh);
  }

  // Camera-relative movement direction from the input's move vector:
  // forward is away from the camera, strafe is across it.
  _moveDirection(input, cameraYaw) {
    const move = input && typeof input.moveVector === 'function'
      ? input.moveVector()
      : { x: 0, y: 0 };
    if (move.x === 0 && move.y === 0) return null;
    const yaw = cameraYaw || 0;
    // Camera forward (away from the viewer) and camera right, on the
    // ground plane: forward = (-sin yaw, -cos yaw), right = (cos, -sin).
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const dx = fx * move.y + rx * move.x;
    const dz = fz * move.y + rz * move.x;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return null;
    return { x: dx / len, z: dz / len };
  }

  // Ease the current velocity toward a target: the player speeds up and
  // slows down over a few frames instead of snapping between 0 and full.
  _easeVelocity(tx, tz, dt) {
    const k = 1 - Math.exp(-dt * 10);
    this._velX += (tx - this._velX) * k;
    this._velZ += (tz - this._velZ) * k;
  }

  // Set every limb's swing from one phase value: arms opposite the legs.
  // With the pistol drawn, the right arm aims forward instead of swinging.
  _poseLimbs(swing) {
    this.armL.rotation.x = swing;
    this.legL.rotation.x = -swing;
    this.legR.rotation.x = swing;
    if (this.weapon === 'pistol') {
      this.armR.rotation.x = -Math.PI / 2 + swing * 0.15;
    } else {
      this.armR.rotation.x = -swing;
    }
  }

  // Relax every limb back toward neutral (each pivot decays its own
  // angle, so a frozen mid-swing pose eases out instead of snapping).
  _relaxLimbs() {
    this.armL.rotation.x *= 0.8;
    this.armR.rotation.x *= 0.8;
    this.legL.rotation.x *= 0.8;
    this.legR.rotation.x *= 0.8;
    if (this.weapon === 'pistol') this.armR.rotation.x += (-Math.PI / 2 - this.armR.rotation.x) * 0.2;
  }

  // Move relative to the camera yaw. `move` is {x, y} from Input.moveVector().
  update(dt, input, world, cameraYaw) {
    if (!this.onFoot) {
      // Hidden inside the car; keep position synced to the vehicle.
      if (this.vehicle) this.pos.copy(this.vehicle.pos);
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const w = world || this.world;
    // Punch and weapon timers tick down whether the player moves or not.
    if (this.punchTimer > 0) this.punchTimer -= dt;
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = CONFIG.PISTOL_MAG;
        this.reloadTimer = 0;
      }
    }
    const running = input && input.isDown
      ? (input.isDown('ShiftLeft') || input.isDown('ShiftRight'))
      : false;
    const topSpeed = running ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED;

    const dir = this._moveDirection(input, cameraYaw);
    if (dir) {
      this.heading = Math.atan2(dir.x, dir.z);
      this._easeVelocity(dir.x * topSpeed, dir.z * topSpeed, dt);
      this.speed = Math.hypot(this._velX, this._velZ);
      this._moveWithCollision(w, this._velX * dt, this._velZ * dt);
      // Walk cycle: the phase advances with distance travelled, so the
      // feet match the ground instead of flailing at a fixed rate.
      this._phase += this.speed * dt * (running ? RUN_SWING : WALK_SWING) / topSpeed;
      const swing = Math.sin(this._phase) * (running ? 0.55 : 0.4);
      this._poseLimbs(swing);
    } else {
      this._easeVelocity(0, 0, dt);
      this.speed = Math.hypot(this._velX, this._velZ);
      this._relaxLimbs();
    }
    // Punch swing: both arms snap forward while the timer runs, then relax.
    if (this.punchTimer > 0) {
      const punchSwing = -1.5 * Math.sin((this.punchTimer / 0.28) * Math.PI);
      this.armL.rotation.x = punchSwing;
      if (this.weapon === 'fists') this.armR.rotation.x = punchSwing;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  // Throw a punch (F with fists). Returns false while cooling down or in
  // a car; the main loop does the hit check against nearby pedestrians.
  punch() {
    if (!this.onFoot || this.punchCooldown > 0) return false;
    this.punchTimer = 0.28;
    this.punchCooldown = 0.6;
    return true;
  }

  // Q: draw or holster the pistol. Returns the new weapon name.
  switchWeapon() {
    if (!this.onFoot) return this.weapon;
    this.weapon = this.weapon === 'pistol' ? 'fists' : 'pistol';
    if (this.pistolMesh) this.pistolMesh.visible = this.weapon === 'pistol';
    return this.weapon;
  }

  // R: start a reload (only when the pistol is drawn and not full).
  reload() {
    if (this.weapon !== 'pistol' || this.reloadTimer > 0) return false;
    if (this.ammo >= CONFIG.PISTOL_MAG) return false;
    this.reloadTimer = CONFIG.PISTOL_RELOAD;
    return true;
  }

  // F with the pistol drawn: one hitscan shot straight ahead from the
  // muzzle. Returns null when the shot cannot fire (in a car, reloading,
  // cooling down, or empty — the caller plays the dry-fire click), or a
  // result { from, to, hit, person, vehicle, cop } the main loop turns
  // into a tracer, a sound and a wanted bump.
  shoot(pedestrians, vehicles, cops) {
    if (!this.onFoot || this.weapon !== 'pistol') return null;
    if (this.reloadTimer > 0 || this.fireCooldown > 0) return null;
    if (this.ammo <= 0) return { empty: true };
    this.ammo -= 1;
    this.fireCooldown = CONFIG.PISTOL_COOLDOWN;
    // The muzzle is 1.4 m up at the player's chest, firing along the
    // heading with a small spread.
    const spread = (Math.random() - 0.5) * CONFIG.PISTOL_SPREAD * 2;
    const aim = this.heading + spread;
    const dirX = Math.sin(aim);
    const dirZ = Math.cos(aim);
    const from = { x: this.pos.x + dirX * 0.6, y: 1.4, z: this.pos.z + dirZ * 0.6 };
    const range = CONFIG.PISTOL_RANGE;
    let bestT = range;
    let hit = null;
    let hitPerson = null;
    let hitVehicle = null;
    let hitCop = null;
    // Pedestrians: a 0.5 m radius cylinder around each person.
    const checkPerson = (p) => {
      if (!p || p.state === 'down') return;
      const dx = p.pos.x - from.x;
      const dz = p.pos.z - from.z;
      const along = dx * dirX + dz * dirZ;
      if (along <= 0 || along > bestT) return;
      const side = Math.abs(dx * dirZ - dz * dirX);
      if (side < 0.6) {
        bestT = along;
        hit = 'pedestrian';
        hitPerson = p;
        hitVehicle = null;
        hitCop = null;
      }
    };
    if (pedestrians && pedestrians.people) {
      for (const p of pedestrians.people) checkPerson(p);
    }
    // Vehicles (parked, traffic and the armored truck): a circle test
    // against each machine's radius.
    const checkVehicle = (v, isCop) => {
      if (!v || !v.pos) return;
      const dx = v.pos.x - from.x;
      const dz = v.pos.z - from.z;
      const along = dx * dirX + dz * dirZ;
      if (along <= 0 || along > bestT) return;
      const side = Math.abs(dx * dirZ - dz * dirX);
      const r = (v.radius || 2) + 0.4;
      if (side < r) {
        bestT = along;
        hit = isCop ? 'cop' : 'vehicle';
        hitVehicle = v;
        hitCop = isCop ? v : null;
        hitPerson = null;
      }
    };
    if (Array.isArray(vehicles)) {
      for (const v of vehicles) checkVehicle(v, false);
    }
    if (Array.isArray(cops)) {
      for (const c of cops) checkVehicle(c, true);
    }
    const to = { x: from.x + dirX * bestT, y: 1.4, z: from.z + dirZ * bestT };
    return { from, to, hit, person: hitPerson, vehicle: hitVehicle, cop: hitCop, distance: bestT };
  }

  // Axis-separated slide: try X, then Z, so the player slides along
  // walls instead of sticking to them.
  _moveWithCollision(world, stepX, stepZ) {
    const r = CONFIG.PLAYER_RADIUS;
    const b = world.bounds;
    const tryX = clamp(this.pos.x + stepX, b.minX + r, b.maxX - r);
    if (!this._hits(tryX, this.pos.z, r, world.colliders)) this.pos.x = tryX;
    const tryZ = clamp(this.pos.z + stepZ, b.minZ + r, b.maxZ - r);
    if (!this._hits(this.pos.x, tryZ, r, world.colliders)) this.pos.z = tryZ;
  }

  // True when the circle at (x, z) with radius r overlaps a building.
  _hits(x, z, r, colliders) {
    for (const c of colliders) {
      const overlapsX = x + r > c.minX && x - r < c.maxX;
      const overlapsZ = z + r > c.minZ && z - r < c.maxZ;
      if (overlapsX && overlapsZ) return true;
    }
    return false;
  }

  enterVehicle(vehicle) {
    this.onFoot = false;
    this.vehicle = vehicle;
    this.mesh.visible = false;
    if (vehicle) this.pos.copy(vehicle.pos);
  }

  exitVehicle() {
    this.onFoot = true;
    if (this.vehicle) {
      // Step out to the driver's side: forward and right of the car.
      const fx = Math.sin(this.vehicle.heading);
      const fz = Math.cos(this.vehicle.heading);
      const rx = Math.cos(this.vehicle.heading);
      const rz = -Math.sin(this.vehicle.heading);
      this.pos.set(
        this.vehicle.pos.x - fx * 0.4 - rx * 1.6,
        0,
        this.vehicle.pos.z - fz * 0.4 - rz * 1.6,
      );
    }
    this.vehicle = null;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
  }

  // Teleport (used by missions and shot staging).
  teleport(x, z, heading) {
    this.pos.set(x, 0, z);
    if (heading !== undefined) this.heading = heading;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }
}
