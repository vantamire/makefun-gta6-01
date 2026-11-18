// The player on foot: a simple low-poly person (capsule body, head, limbs
// as boxes). WASD moves relative to the camera, Shift runs, F throws a
// punch, and a simple AABB slide keeps the player out of buildings and
// inside the bounds.
import { CONFIG } from './config.js';
import { clamp } from './random.js';

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
    this._walkPhase = 0;
    // Punch (F): a short forward swing. punchTimer counts the swing down
    // (the arms animate while it runs); punchCooldown throttles repeats.
    this.punchTimer = 0;
    this.punchCooldown = 0;

    // Low-poly person, ~1.8 m tall.
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x2e86ff });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2b2e38 });
    const shoes = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const hair = new THREE.MeshLambertMaterial({ color: 0x241a12 });
    this.mesh = new THREE.Group();
    this.mesh.name = 'Player';

    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), shirt);
    this.body.position.y = 1.05;
    this.mesh.add(this.body);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
    this.head.position.y = 1.68;
    this.mesh.add(this.head);
    const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairTop.position.y = 1.72;
    this.mesh.add(hairTop);

    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), shirt);
    this.armL.position.set(-0.42, 1.1, 0);
    this.mesh.add(this.armL);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.42;
    this.mesh.add(this.armR);

    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.7, 0.17), pants);
    this.legL.position.set(-0.14, 0.38, 0);
    this.mesh.add(this.legL);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.14;
    this.mesh.add(this.legR);

    this.mesh.position.copy(this.pos);
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
    // Punch timers tick down whether the player moves or not.
    if (this.punchTimer > 0) this.punchTimer -= dt;
    if (this.punchCooldown > 0) this.punchCooldown -= dt;
    const move = input && typeof input.moveVector === 'function'
      ? input.moveVector()
      : { x: 0, y: 0 };
    const running = input && input.isDown
      ? (input.isDown('ShiftLeft') || input.isDown('ShiftRight'))
      : false;
    const maxSpeed = running ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED;

    // Camera-relative direction: forward is away from the camera.
    const sin = Math.sin(cameraYaw || 0);
    const cos = Math.cos(cameraYaw || 0);
    let dx = -sin * move.y + cos * move.x;
    let dz = -cos * move.y - sin * move.x;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len;
      dz /= len;
      this.heading = Math.atan2(dx, dz);
      this.speed = maxSpeed;
      const stepX = dx * maxSpeed * dt;
      const stepZ = dz * maxSpeed * dt;
      this._moveWithCollision(w, stepX, stepZ);
      // Walk-cycle swing.
      this._walkPhase += dt * (running ? 11 : 7);
      const swing = Math.sin(this._walkPhase) * (running ? 0.55 : 0.4);
      this.armL.rotation.x = swing;
      this.armR.rotation.x = -swing;
      this.legL.rotation.x = -swing;
      this.legR.rotation.x = swing;
    } else {
      this.speed = 0;
      this.armL.rotation.x *= 0.8;
      this.armR.rotation.x *= 0.8;
      this.legL.rotation.x *= 0.8;
      this.legR.rotation.x *= 0.8;
    }
    // Punch swing: both arms snap forward while the timer runs, then relax.
    if (this.punchTimer > 0) {
      const punchSwing = -1.5 * Math.sin((this.punchTimer / 0.28) * Math.PI);
      this.armL.rotation.x = punchSwing;
      this.armR.rotation.x = punchSwing;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  // Throw a punch (F). Returns false while cooling down or in a car; the
  // main loop does the hit check against nearby pedestrians.
  punch() {
    if (!this.onFoot || this.punchCooldown > 0) return false;
    this.punchTimer = 0.28;
    this.punchCooldown = 0.6;
    return true;
  }

  // Axis-separated AABB slide: try X, then Z, so the player slides along walls.
  _moveWithCollision(world, stepX, stepZ) {
    const r = CONFIG.PLAYER_RADIUS;
    const b = world.bounds;
    const tryX = clamp(this.pos.x + stepX, b.minX + r, b.maxX - r);
    if (!this._hits(tryX, this.pos.z, r, world.colliders)) this.pos.x = tryX;
    const tryZ = clamp(this.pos.z + stepZ, b.minZ + r, b.maxZ - r);
    if (!this._hits(this.pos.x, tryZ, r, world.colliders)) this.pos.z = tryZ;
  }

  _hits(x, z, r, colliders) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
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
      // Step out to the driver's side.
      const side = Math.cos(this.vehicle.heading);
      const fwd = Math.sin(this.vehicle.heading);
      this.pos.set(
        this.vehicle.pos.x - fwd * 1.6,
        0,
        this.vehicle.pos.z + side * 1.6
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
