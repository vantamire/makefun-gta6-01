// VICE HARBOR v6 — keyboard and mouse input.
// One-shot action flags (confirm, pause, enter/exit, mission menu,
// camera, punch, weapon, reload, photo, radio, swap) are consumed once
// per frame so a held key does not repeat them; held movement keys are
// read live. Mouse drag orbits the camera, the wheel zooms, and digit
// keys 1-0 pick a mission from the menu.

import { CFG } from './settings.js';

export const ACT_CONFIRM = 1;
export const ACT_PAUSE = 2;
export const ACT_ENTER = 4;
export const ACT_MENU = 8;
export const ACT_CAM = 16;
export const ACT_HIT = 32;
export const ACT_GUN = 64;
export const ACT_RELOAD = 128;
export const ACT_PHOTO = 256;
export const ACT_RADIO = 512;
export const ACT_SWAP = 1024;

const KEY_TO_ACTION = {
  Enter: ACT_CONFIRM,
  Space: ACT_CONFIRM,
  KeyP: ACT_PAUSE,
  KeyE: ACT_ENTER,
  KeyM: ACT_MENU,
  KeyC: ACT_CAM,
  KeyF: ACT_HIT,
  KeyQ: ACT_GUN,
  KeyR: ACT_RELOAD,
  KeyV: ACT_PHOTO,
  KeyN: ACT_RADIO,
  KeyX: ACT_SWAP,
};

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.digit = 0;
    this.dragX = 0;
    this.dragY = 0;
    this.wheel = 0;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    // Gamepad state, polled once per frame in takeActions(): the left
    // stick steers, the triggers drive and brake, and the face buttons
    // map to the same one-shot actions as the keyboard.
    this._pad = { stickX: 0, stickZ: 0, fwd: 0, back: 0, flags: 0 };
    this._padPrev = {};
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (e.code.startsWith('Digit')) {
        const n = Number.parseInt(e.code.slice(5), 10);
        if (n >= 0 && n <= 9) this.digit = n === 0 ? 10 : n;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      this.down.delete(e.code);
    };
    this._onBlur = () => {
      this.down.clear();
    };
    this._onMouseDown = (e) => {
      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };
    this._onMouseMove = (e) => {
      if (!this._dragging) return;
      this.dragX += e.clientX - this._lastX;
      this.dragY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };
    this._onMouseUp = () => {
      this._dragging = false;
    };
    this._onWheel = (e) => {
      this.wheel += e.deltaY;
      e.preventDefault();
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  // Poll the first gamepad (if any) into this._pad. Edge-detects the
  // buttons so a held button fires its action once, like a keypress.
  _pollPad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads
      ? navigator.getGamepads()
      : [];
    const pad = pads && pads[0];
    if (!pad) {
      this._pad.stickX = 0;
      this._pad.stickZ = 0;
      this._pad.fwd = 0;
      this._pad.back = 0;
      this._pad.flags = 0;
      return;
    }
    const dead = (v) => (Math.abs(v) < 0.25 ? 0 : v);
    this._pad.stickX = dead(pad.axes[0] || 0);
    this._pad.stickZ = -dead(pad.axes[1] || 0);
    const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    // Right trigger drives, left trigger reverses/brakes.
    this._pad.fwd = btn(7) ? 1 : 0;
    this._pad.back = btn(6) ? 1 : 0;
    let flags = 0;
    const map = [
      [0, ACT_CONFIRM], [1, ACT_HIT], [2, ACT_GUN], [3, ACT_SWAP],
      [4, ACT_RADIO], [5, ACT_PHOTO], [9, ACT_PAUSE], [8, ACT_MENU],
      [12, ACT_CONFIRM], [13, ACT_ENTER],
    ];
    for (const [i, flag] of map) {
      const down = btn(i);
      if (down && !this._padPrev[i]) flags |= flag;
      this._padPrev[i] = down;
    }
    this._pad.flags = flags;
  }

  // Gamepad drive inputs, for readDriveInput in vehicles.js.
  padFwd() { return this._pad.fwd; }
  padBack() { return this._pad.back; }
  padSteer() { return this._pad.stickX; }

  isDown(code) {
    return this.down.has(code);
  }

  anyDown(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  // Movement vector in camera space: x = strafe, z = forward.
  // The gamepad's left stick adds to the WASD keys.
  moveVec() {
    const x = (this.isDown(CFG.KEYS.RIGHT) ? 1 : 0) - (this.isDown(CFG.KEYS.LEFT) ? 1 : 0)
      + this._pad.stickX;
    const z = (this.isDown(CFG.KEYS.FWD) ? 1 : 0) - (this.isDown(CFG.KEYS.BACK) ? 1 : 0)
      + this._pad.stickZ;
    const clamp1 = (v) => (v > 1 ? 1 : v < -1 ? -1 : v);
    return { x: clamp1(x), z: clamp1(z) };
  }

  // One-shot action flags for this frame; consuming them clears them.
  takeActions() {
    this._pollPad();
    let flags = this._pad.flags;
    for (const code of this.pressed) {
      const a = KEY_TO_ACTION[code];
      if (a) flags |= a;
    }
    this.pressed.clear();
    return flags;
  }

  takeDigit() {
    const d = this.digit;
    this.digit = 0;
    return d;
  }

  takeDrag() {
    const d = { x: this.dragX, y: this.dragY };
    this.dragX = 0;
    this.dragY = 0;
    return d;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
  }
}

export function makeControls(canvas) {
  return new Controls(canvas);
}
