// v4 — keyboard + mouse input, consumed by main.js and player.js.
// The loop reads a live set of held codes (movement, handbrake) and
// takes one-shot presses (pause, enter car, mission menu, camera,
// punch, weapon switch, reload) as bit flags, so a press landing
// between two frames is never lost and never counted twice. Number keys
// 1-7 queue a mission pick, so the M menu works from the keyboard alone.

// One-shot actions, as bits the main loop takes once per frame.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_EXIT = 4;
export const ACTION_MISSION_MENU = 8;
export const ACTION_CAMERA = 16;
export const ACTION_PUNCH = 32;
export const ACTION_WEAPON = 64;
export const ACTION_RELOAD = 128;
export const ACTION_PHOTO = 256;

// Every key that fires a one-shot action, as code → flag. Space doubles
// as the confirm key and the handbrake: confirm is queued on keydown
// while the handbrake is read from the live key set, so one press does
// both jobs without conflict.
const BINDINGS = new Map([
  ['Space', ACTION_CONFIRM],
  ['Enter', ACTION_CONFIRM],
  ['KeyP', ACTION_PAUSE],
  ['Escape', ACTION_PAUSE],
  ['KeyE', ACTION_ENTER_EXIT],
  ['KeyM', ACTION_MISSION_MENU],
  ['KeyC', ACTION_CAMERA],
  ['KeyF', ACTION_PUNCH],
  ['KeyQ', ACTION_WEAPON],
  ['KeyR', ACTION_RELOAD],
  ['KeyV', ACTION_PHOTO],
]);

// Mission picks: Digit1-7 map to jobs 1-7.
const DIGIT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];

// Movement keys: each entry contributes its x/y to the move vector.
const MOVE_KEYS = [
  { codes: ['KeyW', 'ArrowUp'], x: 0, y: 1 },
  { codes: ['KeyS', 'ArrowDown'], x: 0, y: -1 },
  { codes: ['KeyD', 'ArrowRight'], x: 1, y: 0 },
  { codes: ['KeyA', 'ArrowLeft'], x: -1, y: 0 },
];

export class Input {
  constructor(canvas) {
    this.canvas = canvas || null;
    // Live set of held key codes.
    this.keys = new Set();
    // Queued one-shot flags, taken once by the loop.
    this.actions = 0;
    // Queued mission pick (1-7 from the Digit keys, 0 = none).
    this.digitPick = 0;
    this.mouseDown = false;
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheelDelta = 0;
    // Every listener this instance adds, so dispose() removes exactly
    // what the constructor registered — no stale handlers after a retry.
    this._listeners = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._listeners.push([target, type, fn, opts]);
    };
    on(window, 'keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      const flag = BINDINGS.get(e.code);
      if (flag !== undefined) {
        this.actions |= flag;
      } else {
        const digit = DIGIT_CODES.indexOf(e.code);
        if (digit >= 0) this.digitPick = digit + 1;
      }
      this.keys.add(e.code);
    });
    on(window, 'keyup', (e) => {
      this.keys.delete(e.code);
    });
    on(window, 'blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    if (canvas) {
      on(canvas, 'mousedown', () => {
        this.mouseDown = true;
      });
      on(window, 'mouseup', () => {
        this.mouseDown = false;
      });
      on(window, 'mousemove', (e) => {
        if (!this.mouseDown) return;
        this.dragDX += e.movementX || 0;
        this.dragDY += e.movementY || 0;
      });
      on(canvas, 'wheel', (e) => {
        e.preventDefault();
        this.wheelDelta += e.deltaY;
      }, { passive: false });
    }
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** True while any of the given codes is held. */
  anyDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** WASD / arrow movement as { x: -1..1 (strafe), y: -1..1 (forward) }. */
  moveVector() {
    let x = 0;
    let y = 0;
    for (const entry of MOVE_KEYS) {
      if (entry.codes.some((c) => this.keys.has(c))) {
        x += entry.x;
        y += entry.y;
      }
    }
    return { x, y };
  }

  /** One-shot presses since the last call, as ACTION_* flags. */
  takeActions() {
    const taken = this.actions;
    this.actions = 0;
    return taken;
  }

  /** Queued Digit1-7 press since the last call (1-7, or 0 when none). */
  takeDigitPick() {
    const pick = this.digitPick;
    this.digitPick = 0;
    return pick;
  }

  /** The mouse-drag delta accumulated since the last call. */
  consumeDrag() {
    const out = { dx: this.dragDX, dy: this.dragDY };
    this.dragDX = 0;
    this.dragDY = 0;
    return out;
  }

  /** The wheel delta accumulated since the last call. */
  consumeWheel() {
    const out = this.wheelDelta;
    this.wheelDelta = 0;
    return out;
  }

  dispose() {
    for (const [target, type, fn, opts] of this._listeners) {
      target.removeEventListener(type, fn, opts);
    }
    this._listeners.length = 0;
  }
}

export function createInput(canvas) {
  return new Input(canvas);
}
