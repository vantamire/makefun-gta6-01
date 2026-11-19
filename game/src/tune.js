// tune.js — every number that shapes VICE HARBOR v8 lives here.
// The city, the cars, the police, the missions and the HUD all read
// these constants, so tuning the game means editing this one file.

export const TUNE = {
  // --- city ---
  pitch: 56, // distance between road centre-lines
  roadHalf: 6, // half the road width
  blocks: 4, // grid runs -blocks .. +blocks
  groundSize: 760,
  waterX: 268, // the sea starts east of here
  pierX: 306, // the pier tip

  // --- clock ---
  dayMinutes: 8, // one full in-game day, in real minutes
  startClock: 18 * 60 + 30, // dusk, 18:30

  // --- player on foot ---
  walkSpeed: 6.5,
  runSpeed: 11,
  jumpSpeed: 7.5,
  punchRange: 2.4,
  punchDamage: 12,

  // --- cars ---
  carKinds: {
    sedan: { accel: 14, top: 30, grip: 2.6, brake: 26, seats: 4 },
    taxi: { accel: 13, top: 28, grip: 2.6, brake: 26, seats: 4 },
    sport: { accel: 22, top: 46, grip: 3.4, brake: 32, seats: 2 },
    van: { accel: 10, top: 24, grip: 2.2, brake: 22, seats: 2 },
    pickup: { accel: 15, top: 32, grip: 2.8, brake: 26, seats: 2 },
    bus: { accel: 7, top: 20, grip: 1.8, brake: 18, seats: 8 },
    limo: { accel: 12, top: 30, grip: 2.4, brake: 24, seats: 4 },
    bike: { accel: 20, top: 42, grip: 4.2, brake: 34, seats: 1 },
    cruiser: { accel: 19, top: 40, grip: 3.2, brake: 30, seats: 2 },
    armored: { accel: 9, top: 22, grip: 2.0, brake: 20, seats: 2 },
  },
  trafficCount: 26,
  parkedCount: 18,

  // --- crowd ---
  pedCount: 42,
  dogCount: 3,

  // --- wanted ---
  maxStars: 5,
  // cruisers chasing at each star level
  cruiserCount: [0, 1, 2, 3, 4, 5],
  heliAtStars: 4,
  roadblockAtStars: 3,
  bustDistance: 3.2,
  bustHoldSeconds: 2.0,
  decayQuietSeconds: 18,
  decayStepSeconds: 9,

  // --- combat ---
  weapons: {
    pistol: { damage: 22, rate: 0.28, spread: 0.02, range: 60, mag: 12 },
    scatter: { damage: 11, pellets: 6, rate: 0.8, spread: 0.09, range: 26, mag: 6 },
    smg: { damage: 10, rate: 0.09, spread: 0.05, range: 45, mag: 30 },
  },

  // --- money ---
  startMoney: 250,
  nearMissBonus: 10,
  stuntPerSecond: 60,
  stuntCap: 200,
  bustFine: 120,
  wastedFine: 150,

  // --- dusk palette ---
  skyTop: 0x2e1a4e,
  skyMid: 0xc65a3c,
  skyLow: 0xff9a52,
  sunColor: 0xffb36b,
  fogColor: 0x8a4a52,
  lampColor: 0xffc46b,

  // --- keys ---
  keys: {
    forward: ['KeyW', 'ArrowUp'],
    back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    run: ['ShiftLeft', 'ShiftRight'],
    jump: ['Space'],
    enter: ['KeyE'],
    punch: ['KeyF'],
    weapon: ['KeyQ'],
    swap: ['KeyX'],
    reload: ['KeyR'],
    pause: ['Escape', 'KeyP'],
    photo: ['KeyV'],
    radio: ['KeyM'],
    horn: ['KeyH'],
  },
};

// Mission catalogue: id, title, brief, pay, and the district it starts in.
// The full step lists live in jobs.js; this table is the HUD's job board.
export const JOB_BOARD = [
  { id: 'homecoming', title: 'Homecoming', pay: 120, where: "Mama Lou's Bar" },
  { id: 'cabfare', title: 'Cab Fare', pay: 90, where: 'Downtown' },
  { id: 'packagerun', title: 'Package Run', pay: 150, where: 'North Yards' },
  { id: 'getaway', title: 'Getaway', pay: 260, where: 'Coral Bank' },
  { id: 'pizzarush', title: 'Pizza Rush', pay: 140, where: 'Southside' },
  { id: 'streetrace', title: 'Street Race', pay: 300, where: 'Boardwalk' },
  { id: 'harborheist', title: 'Harbor Heist', pay: 420, where: 'Coral Bank' },
  { id: 'vigilante', title: 'Vigilante', pay: 240, where: 'Downtown' },
  { id: 'nightcab', title: 'Night Cab', pay: 180, where: 'Downtown' },
  { id: 'casinocaper', title: 'Casino Caper', pay: 700, where: 'Golden Anchor' },
];
