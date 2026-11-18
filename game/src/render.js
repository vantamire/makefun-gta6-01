// Small rendering helpers: renderer sizing, resize handling and a
// pixel-ratio cap so the game stays fast on high-DPI screens.

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
