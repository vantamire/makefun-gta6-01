// VICE HARBOR — shared tuning constants. Single source of truth for the
// world layout, movement, driving, wanted level and mission economy.
export const CONFIG = {
  WORLD_SEED: 1,
  // City layout: an 8x8 grid of blocks. Block pitch = block size + road.
  GRID_BLOCKS: 8,
  BLOCK_SIZE: 40,
  ROAD_WIDTH: 12,
  // Derived world size (metres, centred on origin).
  get CITY_PITCH() { return this.BLOCK_SIZE + this.ROAD_WIDTH; },
  get WORLD_SIZE() {
    return this.GRID_BLOCKS * this.CITY_PITCH + this.ROAD_WIDTH;
  },
  // Beach strip along the east edge (+X) and the water beyond it.
  BEACH_WIDTH: 26,
  WATER_WIDTH: 90,

  // Player on foot.
  WALK_SPEED: 5.2,
  RUN_SPEED: 9.5,
  PLAYER_RADIUS: 0.55,
  PLAYER_HEIGHT: 1.8,

  // Driving.
  CAR_ACCEL: 16,
  CAR_BRAKE: 30,
  CAR_REVERSE_ACCEL: 9,
  CAR_MAX_SPEED: 34,
  CAR_MAX_REVERSE: 11,
  CAR_TURN_RATE: 1.9,
  CAR_DRAG: 0.55,
  HANDBRAKE_DECEL: 26,

  // Wanted level.
  WANTED_MAX: 5,
  WANTED_DECAY_SECONDS: 26,
  WANTED_DECAY_PER_SECOND: 1 / 26,

  // Missions (must match the three jobs missions.js implements).
  MISSION_PAYOUTS: [500, 350, 300],
  MISSION_TIME_LIMIT: 180,

  // Day / dusk look.
  SKY_TOP: 0x2a1e52,
  SKY_HORIZON: 0xff7e4a,
  FOG_COLOR: 0x3a2b55,
  FOG_NEAR: 120,
  FOG_FAR: 420,
  SUN_COLOR: 0xffb36b,
  SUN_INTENSITY: 1.35,
  HEMI_SKY: 0x8a6fd0,
  HEMI_GROUND: 0x2c2118,
  HEMI_INTENSITY: 0.85,
  AMBIENT: 0x40355e,

  // Palette.
  ROAD_COLOR: 0x2b2e38,
  SIDEWALK_COLOR: 0x8f8a80,
  GROUND_COLOR: 0x3f6b4a,
  SAND_COLOR: 0xd9c08a,
  WATER_COLOR: 0x1d6f8e,

  // Key bindings.
  KEYS: {
    FORWARD: 'KeyW',
    BACK: 'KeyS',
    LEFT: 'KeyA',
    RIGHT: 'KeyD',
    RUN: 'ShiftLeft',
    RUN_ALT: 'ShiftRight',
    ENTER_EXIT: 'KeyE',
    HANDBRAKE: 'Space',
    MISSION_MENU: 'KeyM',
    PAUSE: 'KeyP',
    HORN: 'KeyH',
    CAMERA: 'KeyC',
  },
};

export const MISSION_DEFS = [
  {
    id: 'getaway',
    title: 'Getaway Driver',
    brief: 'Steal any car and hit all 3 checkpoints across the city before the clock runs out. The heat is on from the start.',
    payout: 500,
  },
  {
    id: 'taxi',
    title: 'Taxi Rush',
    brief: 'Pick up the passenger at the marker, then deliver them to the far side of town.',
    payout: 350,
  },
  {
    id: 'package',
    title: 'Package Run',
    brief: 'On foot: collect 5 glowing packages stashed around the city before the deadline.',
    payout: 300,
  },
];

export default CONFIG;
