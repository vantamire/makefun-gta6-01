// VICE HARBOR v4 — the one tuning table for the whole game.
// World layout, driving and walking feel, the wanted system, the mission
// economy, the dusk palette, the day/night cycle, and the key bindings.
// Systems read numbers from here; they never hard-code their own.

// Seven jobs, in menu order. `brief` is the one-liner the mission menu
// shows; the longer briefing lives in missions.js.
export const MISSION_DEFS = [
  {
    id: 'getaway',
    title: 'Getaway Driver',
    payout: 500,
    brief: 'Steal any car and hit all 3 checkpoints across the city before the clock runs out. The heat lands when you steal the car.',
  },
  {
    id: 'taxi',
    title: 'Taxi Rush',
    payout: 350,
    brief: 'Pick up the passenger at the marker, then deliver them to the far side of town.',
  },
  {
    id: 'package',
    title: 'Package Run',
    payout: 300,
    brief: 'On foot: collect 5 glowing packages stashed around the city before the deadline.',
  },
  {
    id: 'heist',
    title: 'Harbor Heist',
    payout: 650,
    brief: 'Steal the armored truck from Coral Bank and deliver it to the pier while 2 stars chase you. $650 if you make it.',
  },
  {
    id: 'pizza',
    title: 'Pizza Delivery',
    payout: 300,
    brief: 'Grab 3 pizzas from the boardwalk pizzeria and deliver them hot — one stop on foot, two by car.',
  },
  {
    id: 'race',
    title: 'Street Race',
    payout: 450,
    brief: 'Beat the rival sport car through 4 checkpoints. Lose the race and the $450 goes to him.',
  },
  {
    id: 'vigilante',
    title: 'Vigilante',
    payout: 400,
    brief: 'Two getaway cars are fleeing the scene. Ram them to a stop before they reach the edge of town.',
  },
];

export const CONFIG = {
  // Deterministic seed: the same seed always builds the same city.
  WORLD_SEED: 1,

  // City layout: an 8x8 grid of blocks. Block pitch = block + road, so
  // the city spans 8 * 52 + 12 = 428 m across, centred on the origin.
  // The beach and the boardwalk run along the east edge (+X); the water
  // is past them, with the marina and the pier jutting into it.
  GRID_BLOCKS: 8,
  BLOCK_SIZE: 40,
  ROAD_WIDTH: 12,
  CITY_PITCH: 52,
  WORLD_SIZE: 428,
  BEACH_WIDTH: 26,
  BOARDWALK_WIDTH: 10,
  WATER_WIDTH: 90,

  // Driving feel: acceleration, braking, reverse and steering, plus the
  // drag that slows a coasting car. Per-kind top speeds live in
  // vehicles.js (VEHICLE_SPECS); CAR_MAX_SPEED caps the player.
  CAR_ACCEL: 16,
  CAR_BRAKE: 30,
  CAR_REVERSE_ACCEL: 9,
  CAR_MAX_SPEED: 34,
  CAR_MAX_REVERSE: 11,
  CAR_TURN_RATE: 1.9,
  CAR_DRAG: 0.55,
  HANDBRAKE_DECEL: 26,

  // On foot: walking and running pace, collision radius, player height.
  WALK_SPEED: 5.2,
  RUN_SPEED: 9.5,
  PLAYER_RADIUS: 0.55,
  PLAYER_HEIGHT: 1.8,

  // Weapons: the pistol (Q to draw, F to fire, R to reload).
  PISTOL_MAG: 12,
  PISTOL_RANGE: 42,
  PISTOL_COOLDOWN: 0.45,
  PISTOL_RELOAD: 1.4,
  PISTOL_SPREAD: 0.03,

  // How alive the streets are: people on the sidewalks, cars on the
  // loops. v4 is denser than v3.2 — the boardwalk adds its own crowd.
  PEDESTRIAN_COUNT: 64,
  TRAFFIC_COUNT: 30,
  BOARDWALK_PEDESTRIANS: 10,
  // Pedestrians cross at the crosswalks instead of jaywalking everywhere.
  PED_CROSSWALK_CHANCE: 0.35,
  // Traffic eases off near intersections so the city does not look like
  // a slot-car track.
  TRAFFIC_JUNCTION_SLOW: 0.55,

  // Wanted level: five stars max. Heat bleeds off after 26 quiet
  // seconds — one star per 26 s of staying clean. The helicopter joins
  // the chase at 3 stars and leaves when the heat drops below 3.
  WANTED_MAX: 5,
  WANTED_DECAY_SECONDS: 26,
  WANTED_DECAY_PER_SECOND: 1 / 26,
  HELI_MIN_WANTED: 3,
  HELI_HEIGHT: 38,
  HELI_SPEED: 24,

  // Jump pads and stunt pay: two glowing pads on the grid launch the car
  // into the air. Stay airborne at least STUNT_MIN_AIR seconds and the
  // landing pays STUNT_PAY_PER_SEC per second of air, capped at
  // STUNT_PAY_CAP. A near miss — flashing past a traffic car at speed
  // without touching it — pays NEAR_MISS_PAY a pop.
  JUMP_PAD_BOOST: 11,
  JUMP_PAD_GRAVITY: 22,
  STUNT_MIN_AIR: 0.5,
  STUNT_PAY_PER_SEC: 25,
  STUNT_PAY_CAP: 200,
  NEAR_MISS_RANGE: 2.2,
  NEAR_MISS_MIN_SPEED: 18,
  NEAR_MISS_PAY: 10,
  NEAR_MISS_COOLDOWN: 2.5,

  // Mission economy (must match the seven jobs missions.js implements).
  MISSION_PAYOUTS: [500, 350, 300, 650, 300, 450, 400],
  MISSION_TIME_LIMIT: 180,

  // Day/night cycle: one full day takes DAY_LENGTH seconds of play.
  // The clock starts at dusk (18:30) and the sky, sun and lamps follow
  // the hour. Screenshots pin the cycle at dusk for a stable frame.
  DAY_LENGTH: 480,
  DAY_START_HOUR: 18.5,

  // Dusk look. The sun sits east over the water, so the drive and chase
  // cameras (which face east) look straight into the sunset: a deep
  // violet top fading to a burnt-orange horizon, with olive grass that
  // stays muted instead of shouting bright green. The horizon and fog
  // are lifted a touch so the city reads at a glance instead of sinking
  // into murk, and the sun is strong enough for long shadows.
  SKY_TOP: 0x1c1440,
  SKY_HORIZON: 0xff7a3d,
  FOG_COLOR: 0x3a2a55,
  FOG_NEAR: 120,
  FOG_FAR: 420,
  SUN_COLOR: 0xffb36b,
  SUN_INTENSITY: 1.5,
  HEMI_SKY: 0x8a6fd0,
  HEMI_GROUND: 0x2c2118,
  HEMI_INTENSITY: 0.95,
  AMBIENT: 0x40355e,

  // Palette: roads, sidewalks, grass, sand, boardwalk planks and water.
  ROAD_COLOR: 0x2b2e38,
  SIDEWALK_COLOR: 0x8f8a80,
  GROUND_COLOR: 0x4a5a35,
  SAND_COLOR: 0xd9c08a,
  BOARDWALK_COLOR: 0x8a6a45,
  WATER_COLOR: 0x1d6f8e,

  // Dusk driving: headlights and tail lights switch on automatically.
  HEADLIGHT_RANGE: 26,
  HEADLIGHT_INTENSITY: 1.6,

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
    PUNCH: 'KeyF',
    WEAPON: 'KeyQ',
    RELOAD: 'KeyR',
  },
};

export default CONFIG;
