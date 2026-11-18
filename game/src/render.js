// v4 — rendering helpers: pixel-ratio caps, resizing, the speed FOV
// ease, and a place-the-camera call the shot staging uses so staged
// cameras read exactly like the live ones.

// Never render above this device-pixel ratio: the dusk city is heavy
// enough without supersampling on a phone screen.
export const MAX_PIXEL_RATIO = 1.5;

/** Pick the pixel ratio for this display and hand it to the renderer. */
export function applyPixelRatio(renderer) {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(ratio);
  return ratio;
}

/**
 * Resize the drawing buffer and keep the camera's aspect honest.
 * Width/height default to the window when the caller passes nothing.
 */
export function resizeRenderer(renderer, camera, width, height) {
  const w = width || window.innerWidth;
  const h = height || window.innerHeight;
  renderer.setSize(w, h, false);
  if (camera) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  return { width: w, height: h };
}

/** Fit the renderer to the size its canvas actually occupies. */
export function resizeToCanvas(renderer, camera) {
  const canvas = renderer.domElement;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  return resizeRenderer(renderer, camera, w, h);
}

/**
 * Ease the camera's field of view toward a target, exponentially, so
 * the zoom-in at speed feels smooth instead of stepped. `rate` is the
 * approach speed per second; returns the FOV actually in use.
 */
export function approachFov(camera, targetFov, dt, rate) {
  if (!camera) return targetFov;
  const k = 1 - Math.exp(-(rate || 3) * Math.max(0, dt));
  const next = camera.fov + (targetFov - camera.fov) * k;
  if (Math.abs(next - camera.fov) > 0.02) {
    camera.fov = next;
    camera.updateProjectionMatrix();
  }
  return camera.fov;
}

/** Put the camera at one point and aim it at another, in a single call. */
export function placeCamera(camera, x, y, z, tx, ty, tz) {
  if (!camera) return camera;
  camera.position.set(x, y, z);
  camera.lookAt(tx, ty, tz);
  return camera;
}
