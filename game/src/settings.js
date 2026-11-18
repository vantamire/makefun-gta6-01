// VICE HARBOR v6 — the single tuning table.
// World layout, driving and walking feel, the wanted system, weapons,
// the mission economy, the day/night cycle, the dusk palette and the key
// bindings. Systems read numbers from here; they never hard-code their
// own. Change the feel of the game by editing this file alone.

// Twelve quests, in menu order. `blurb` is the one-liner the mission
// menu shows; the longer briefing lives in quests.js.
export const QUESTS = [
  {
    id: 'getaway',
    name: 'Getaway Driver',
    pay: 500,
    blurb: 'Steal any car and hit all 3 checkpoints across the city before the clock runs out. The heat lands when you steal the car.',
  },
  {
    id: 'cab',
    name: 'Cab Rush',
    pay: 350,
    blurb: 'Pick up the passenger at the marker, then deliver them to the far side of town.',
  },
  {
    id: 'courier',
    name: 'Courier Run',
    pay: 300,
    blurb: 'On foot: collect 5 glowing parcels stashed around the city before the deadline.',
  },
  {
    id: 'heist',
    name: 'Harbor Heist',
    pay: 650,
    blurb: 'Steal the armored van from Coral Bank and deliver it to the pier while 2 stars chase you. $650 if you make it.',
  },
  {
    id: 'pizza',
    name: 'Pizza Delivery',
    pay: 300,
    blurb: 'Grab 3 pizzas from the boardwalk pizzeria and deliver them hot — one stop on foot, two by car.',
  },
  {
    id: 'race',
    name: 'Street Race',
    pay: 450,
    blurb: 'Beat the rival sport car through 4 checkpoints. Lose the race and the $450 goes to him.',
  },
  {
    id: 'vigilante',
    name: 'Vigilante',
    pay: 400,
    blurb: 'Two getaway cars are fleeing the scene. Ram them to a stop before they reach the edge of town.',
  },
  {
    id: 'nightcab',
    name: 'Night Cab',
    pay: 380,
    blurb: 'Three fares, one night: pick each one up after dark and drop them at the far end of the map. Tips for speed.',
  },
  {
    id: 'dockside',
    name: 'Dockside Dash',
    pay: 420,
    blurb: 'Haul 4 crates from the industrial yard to the marina before the forklifts clock off. Heavy load, tight turns.',
  },
  {
    id: 'bridge',
    name: 'Bridge Run',
    pay: 500,
    blurb: 'A checkpoint sprint from the south houses to the north cranes — through downtown traffic, against the clock.',
  },
  {
    id: 'casino',
    name: 'Casino Caper',
    pay: 700,
    blurb: 'Lift the cash cart from the Golden Anchor casino and lose the 3-star tail on the way to the safehouse. The biggest score in town.',
  },
  {
    id: 'airport',
    name: 'Airport Run',
    pay: 480,
    blurb: 'A sealed case has to reach the airstrip on the north edge — 5 checkpoints, no stops, and the PD is already looking for the car.',
  },
];

export const CFG = {
  // Deterministic seed: the same seed always builds the same city.
  WORLD_SEED: 1,

  // City layout: a 9x9 grid of blocks. Pitch = block + road, so the city
  // spans 9 * 48 + 12 = 444 m across, centred on the origin. The beach
  // and the boardwalk run along the east edge (+X); the water is past
  // them, with the marina and the pier jutting into it. The industrial
  // yards sit in the north rows; the houses in the south; the casino
  // strip crowns the north edge.
  GRID_BLOCKS: 9,
  BLOCK_M: 36,
  ROAD_M: 12,
  GRID_PITCH: 48,
  CITY_SPAN: 444,
  SAND_M: 24,
  WALK_M: 10,
  SEA_M: 90,

  // The save: one key in localStorage holds the money. The start screen
  // orbits the hero on a slow circle of this radius and height.
  SAVE_KEY: 'vice-harbor.save',
  MENU_ORBIT_R: 11,
  MENU_ORBIT_H: 4.2,
  MENU_ORBIT_SPEED: 0.12,

  // Loading-screen tips, one shown at a time on the start screen.
  TIPS: [
    'Steal any parked car with E — then drive to the glowing beacon.',
    'At 3 stars the helicopter joins the hunt. Lose it in the alleys.',
    'Jump pads pay by the second of air. Land it to bank the stunt.',
    'A near miss pays $10. A crash pays nothing.',
    'The scattergun stops a fleeing car in one good hit.',
    'Health regens after a quiet stretch — hide, then come back.',
  ],

  // Driving feel: acceleration, braking, reverse and steering, plus the
  // drag that slows a coasting car. Per-kind top speeds live in
  // vehicles.js (CAR_KINDS); CAR_TOP caps the player.
  CAR_ACCEL: 17,
  CAR_BRAKE: 32,
  CAR_REV_ACCEL: 10,
  CAR_TOP: 36,
  CAR_TOP_REV: 12,
  CAR_STEER: 2.0,
  CAR_DRAG: 0.5,
  HANDBRAKE: 28,

  // On foot: walking and running pace, collision radius, figure height.
  FOOT_WALK: 5.6,
  FOOT_RUN: 10,
  HERO_RADIUS: 0.55,
  HERO_HEIGHT: 1.8,

  // Weapons: the pistol (Q to draw, F to fire, R to reload), the
  // scattergun (X cycles to it: wider spread, 6 shells) and the SMG (X
  // cycles again: fast fire, 24-round magazine).
  PISTOL_MAG: 15,
  PISTOL_REACH: 46,
  PISTOL_PAUSE: 0.4,
  PISTOL_RELOAD_S: 1.3,
  PISTOL_SPREAD: 0.025,
  SCATTER_MAG: 6,
  SCATTER_REACH: 26,
  SCATTER_PAUSE: 0.9,
  SCATTER_RELOAD_S: 2.0,
  SCATTER_PELLETS: 7,
  SCATTER_SPREAD: 0.09,
  SMG_MAG: 24,
  SMG_REACH: 34,
  SMG_PAUSE: 0.11,
  SMG_RELOAD_S: 1.7,
  SMG_SPREAD: 0.055,

  // How alive the streets are: people on the sidewalks, cars on the
  // loops. The boardwalk, the yards and the houses each add their own
  // crowd on top of the downtown one.
  CROWD_N: 70,
  FLOW_N: 32,
  WALK_CROWD: 12,
  YARD_CROWD: 6,
  HOUSE_CROWD: 8,
  // Pedestrians cross at the crosswalks instead of jaywalking everywhere.
  CROSS_CHANCE: 0.4,
  // Traffic eases off near intersections so the city does not look like
  // a slot-car track.
  JUNCTION_EASE: 0.55,

  // Wanted level: five stars max. Heat bleeds off after 24 quiet
  // seconds — one star per 24 s of staying clean. The helicopter joins
  // the chase at 3 stars and leaves when the heat drops below 3;
  // roadblocks go up at 3 stars too.
  HEAT_MAX: 5,
  HEAT_COOL_S: 24,
  HEAT_PER_S: 1 / 24,
  HELI_MIN_HEAT: 3,
  HELI_ALT: 40,
  HELI_SPEED: 26,

  // Jump pads and stunt pay: two glowing pads on the grid launch the car
  // into the air. Stay airborne at least STUNT_MIN_AIR seconds and the
  // landing pays STUNT_PAY_PER_SEC per second of air, capped at
  // STUNT_PAY_CAP. A near miss — flashing past a traffic car at speed
  // without touching it — pays NEAR_MISS_PAY a pop.
  PAD_LIFT: 12,
  PAD_GRAV: 22,
  STUNT_MIN_AIR: 0.5,
  STUNT_PAY_PER_SEC: 25,
  STUNT_PAY_CAP: 200,
  MISS_RANGE: 2.2,
  MISS_MIN_SPEED: 18,
  MISS_PAY: 10,
  MISS_COOLDOWN: 2.5,

  // Mission economy (must match the twelve quests quests.js implements).
  QUEST_PAYS: [500, 350, 300, 650, 300, 450, 400, 380, 420, 500, 700, 480],
  QUEST_TIME: 180,

  // Day/night cycle: one full day takes DAY_S seconds of play.
  // The clock starts at dusk (18:30) and the sky, sun and lamps follow
  // the hour. Screenshots pin the cycle at dusk for a stable frame.
  DAY_S: 480,
  DAY_START: 18.5,

  // Dusk look. The sun sits east over the water, so the drive and chase
  // cameras (which face east) look straight into the sunset: a deep
  // violet top fading to a burnt-orange horizon, with olive grass that
  // stays muted instead of shouting bright green. The horizon and fog
  // are lifted a touch so the city reads at a glance instead of sinking
  // into murk, and the sun is strong enough for long shadows.
  SKY_TOP: 0x1c1440,
  SKY_LOW: 0xff7a3d,
  FOG_COL: 0x3a2a55,
  FOG_NEAR: 120,
  FOG_FAR: 430,
  SUN_COL: 0xffb36b,
  SUN_STR: 1.5,
  HEMI_TOP: 0x8a6fd0,
  HEMI_BOT: 0x2c2118,
  HEMI_STR: 0.95,
  AMBIENT_COL: 0x40355e,

  // Palette: roads, sidewalks, grass, sand, boardwalk planks and water.
  ROAD_COL: 0x2b2e38,
  WALK_COL: 0x8f8a80,
  GRASS_COL: 0x4a5a35,
  SAND_COL: 0xd9c08a,
  PLANK_COL: 0x8a6a45,
  SEA_COL: 0x1d6f8e,

  // Dusk driving: headlights and tail lights switch on automatically.
  LAMP_RANGE: 26,
  LAMP_STR: 1.6,

  // Key bindings.
  KEYS: {
    FWD: 'KeyW',
    BACK: 'KeyS',
    LEFT: 'KeyA',
    RIGHT: 'KeyD',
    RUN: 'ShiftLeft',
    RUN2: 'ShiftRight',
    ENTER: 'KeyE',
    BRAKE: 'Space',
    MENU: 'KeyM',
    PAUSE: 'KeyP',
    HORN: 'KeyH',
    CAM: 'KeyC',
    HIT: 'KeyF',
    GUN: 'KeyQ',
    SWAP: 'KeyX',
    RELOAD: 'KeyR',
    RADIO: 'KeyN',
    PHOTO: 'KeyV',
  },
};

export default CFG;
