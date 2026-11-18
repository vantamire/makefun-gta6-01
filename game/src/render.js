// Small rendering helpers: renderer sizing, resize handling, a
// pixel-ratio cap so the game stays fast on high-DPI screens, and a
// frame-rate-independent field-of-view approach for the speed kick.
// v2: approachFov — eases the camera's FOV toward a target (the driving
// speed kick) and only touches the projection matrix when it moved.

export const MAX_PIXEL_RATIO = 1.5;

export function applyPixelRatio(renderer) {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  renderer.setPixelRatio(ratio);
  return ratio;
}

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

// Fit the renderer to its canvas element's client size.
export function resizeToCanvas(renderer, camera) {
  const canvas = renderer.domElement;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  return resizeRenderer(renderer, camera, w, h);
}

// Ease camera.fov toward targetFov; `rate` is the exponential approach
// speed per second. Returns the new FOV.
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
