// keys.js — keyboard and mouse input for VICE HARBOR.
// Tracks held keys, fires one-shot "pressed" edges for actions, and
// collects the mouse drag that orbits the camera. The game reads this
// every frame; nothing here knows about the game itself.

import { TUNE } from './tune.js';

export function makeKeys() {
  const held = new Set();
  const pressed = new Set();
  let orbitDX = 0;
  let orbitDY = 0;
  let wheelDelta = 0;
  let mouseDown = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let locked = false;

  function codeOf(e) {
    return e.code;
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    held.add(codeOf(e));
    pressed.add(codeOf(e));
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(codeOf(e))) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    held.delete(codeOf(e));
  }

  function onMouseDown(e) {
    mouseDown = true;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onMouseUp() {
    mouseDown = false;
    dragging = false;
  }

  function onMouseMove(e) {
    if (!dragging) return;
    orbitDX += e.clientX - lastX;
    orbitDY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onWheel(e) {
    wheelDelta += e.deltaY;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('wheel', onWheel, { passive: true });

  function isDown(code) {
    return held.has(code);
  }

  function anyDown(codes) {
    return codes.some((c) => held.has(c));
  }

  function wasPressed(code) {
    return pressed.has(code);
  }

  function anyPressed(codes) {
    return codes.some((c) => pressed.has(c));
  }

  // WASD in camera space: x = strafe right, z = forward.
  function moveAxis() {
    const k = TUNE.keys;
    let x = 0;
    let z = 0;
    if (anyDown(k.left)) x -= 1;
    if (anyDown(k.right)) x += 1;
    if (anyDown(k.forward)) z += 1;
    if (anyDown(k.back)) z -= 1;
    return { x, z };
  }

  function endFrame() {
    pressed.clear();
    orbitDX = 0;
    orbitDY = 0;
    wheelDelta = 0;
  }

  return {
    isDown, anyDown, wasPressed, anyPressed, moveAxis, endFrame,
    get orbitDX() { return orbitDX; },
    get orbitDY() { return orbitDY; },
    get wheelDelta() { return wheelDelta; },
    get mouseDown() { return mouseDown; },
    get locked() { return locked; },
  };
}
