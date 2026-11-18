// Keyboard + mouse input state, consumed by main.js and player.js.
// Tracks a live set of pressed codes, mouse-drag deltas for the orbit
// camera, and the mouse wheel for zoom. One-shot presses (pause, enter
// car, mission menu, camera, punch) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never
// counted twice. Number keys 1-4 are queued separately as a mission pick,
// so the M menu can be driven from the keyboard alone.
// v2: ACTION_PUNCH (F) for on-foot combat, digit picks for the mission menu.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_EXIT = 4;
export const ACTION_MISSION_MENU = 8;
export const ACTION_CAMERA = 16;
export const ACTION_PUNCH = 32;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_EXIT = new Set(['KeyE']);
const MISSION_MENU = new Set(['KeyM']);
const CAMERA = new Set(['KeyC']);
const PUNCH = new Set(['KeyF']);
const DIGITS = new Set(['Digit1', 'Digit2', 'Digit3', 'Digit4']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas || null;
    this.keys = new Set();
    this.actions = 0;
    // Queued mission pick: 1-4 from the Digit keys, 0 = none. Taken once.
    this.digitPick = 0;
    this.mouseDown = false;
    this.dragDX = 0;
    this.dragDY = 0;
    this.wheelDelta = 0;
    this._onKeyDown = (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) {
        if (CONFIRM.has(e.code)) this.actions |= ACTION_CONFIRM;
        else if (PAUSE.has(e.code)) this.actions |= ACTION_PAUSE;
        else if (ENTER_EXIT.has(e.code)) this.actions |= ACTION_ENTER_EXIT;
        else if (MISSION_MENU.has(e.code)) this.actions |= ACTION_MISSION_MENU;
        else if (CAMERA.has(e.code)) this.actions |= ACTION_CAMERA;
        else if (PUNCH.has(e.code)) this.actions |= ACTION_PUNCH;
        else if (DIGITS.has(e.code)) this.digitPick = Number(e.code.slice(5));
      }
      this.keys.add(e.code);
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouseDown = false;
    };
    this._onMouseDown = () => {
      this.mouseDown = true;
    };
    this._onMouseUp = () => {
      this.mouseDown = false;
    };
    this._onMouseMove = (e) => {
      if (this.mouseDown) {
        this.dragDX += e.movementX || 0;
        this.dragDY += e.movementY || 0;
      }
    };
    this._onWheel = (e) => {
      e.preventDefault();
      this.wheelDelta += e.deltaY;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    if (canvas) {
      canvas.addEventListener('mousedown', this._onMouseDown);
      window.addEventListener('mouseup', this._onMouseUp);
      window.addEventListener('mousemove', this._onMouseMove);
      canvas.addEventListener('wheel', this._onWheel, { passive: false });
    }
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // True while any of the given codes is held.
  anyDown(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  // WASD / arrow movement as { x: -1..1 (strafe), y: -1..1 (forward) }.
  moveVector() {
    const f = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const s = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    return { x: s, y: f };
  }

  // One-shot presses since the last call, as ACTION_* flags.
  takeActions() {
    const taken = this.actions;
    this.actions = 0;
    return taken;
  }

  // Queued Digit1-4 press since the last call (1-4, or 0 when none).
  takeDigitPick() {
    const pick = this.digitPick;
    this.digitPick = 0;
    return pick;
  }

  // Consume the accumulated mouse-drag delta since the last call.
  consumeDrag() {
    const dx = this.dragDX;
    const dy = this.dragDY;
    this.dragDX = 0;
    this.dragDY = 0;
    return { dx, dy };
  }

  // Consume the accumulated wheel delta since the last call.
  consumeWheel() {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
      this.canvas.removeEventListener('wheel', this._onWheel);
    }
  }
}

export function createInput(canvas) {
  return new Input(canvas);
}
