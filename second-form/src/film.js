// THE SECOND FORM — composition and choreography, shared by the browser
// experience and the native film renderer.
import { lightPosition, LIGHT, DEG } from './scene.js';

export const FPS = 24;
export const DURATION = 24;

// The single source: a small white sphere, 1.2 mm radius.
export const LIGHT_RADIUS = 1.2;

// Three light positions (azimuth/elevation in degrees about the foot centre,
// distance in mm). The glass and the camera do not move between them.
export const PRESETS = [
  { id: 'meridian', name: 'Meridian', light: { az: 173, el: 27, dist: 440 } },
  { id: 'arc', name: 'Arc', light: { az: 158, el: 41, dist: 420 } },
  { id: 'halo', name: 'Halo', light: { az: 128, el: 64, dist: 380 } },
];
export const FINAL_PRESET = 'arc';

// Bounded region the viewer may move the light through.
export const LIGHT_BOUNDS = { az: [118, 182], el: [22, 70], distAt: (el) => 445 - (el - 22) * 1.35 };

// Fixed camera for the hold and for the interactive companion.
export const FINAL_CAMERA = { az: -95, el: 28, dist: 720, target: [112, -10, 22], fov: 28 };

// Opening close view of the cast light: the halo thrown beside the foot by the
// high source, seen from above without the glass.
export const CLOSE_CAMERA = { az: -98, el: 58, dist: 200, target: [66, -92, 0], fov: 28 };

// Exposure and ambient fill are absolute constants (fixed for the whole film and
// the interactive piece): derived once from the final arrangement.
function keyIrradiance(light) {
  const p = lightPosition(light);
  const d2 = p[0] ** 2 + p[1] ** 2 + p[2] ** 2;
  return Math.PI * LIGHT.radiance * LIGHT_RADIUS ** 2 / d2 * (p[2] / Math.sqrt(d2));
}
export const REF_E = keyIrradiance(PRESETS[1].light);
export const ALBEDO = 0.78;
export const EXPOSURE = 0.27 / (ALBEDO * REF_E / Math.PI);
export const ENV_GRADIENT = 1.6;
export const AMBIENT_RADIANCE = 0.022 * REF_E / (Math.PI * (0.35 + ENV_GRADIENT * 0.5));

// --- easing -----------------------------------------------------------------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smoother = (x) => { x = clamp01(x); return x * x * x * (x * (6 * x - 15) + 10); };
const lerp = (a, b, t) => a + (b - a) * t;
const lerpLight = (a, b, t) => ({ az: lerp(a.az, b.az, t), el: lerp(a.el, b.el, t), dist: lerp(a.dist, b.dist, t) });
function lerpCam(a, b, t) {
  return {
    az: lerp(a.az, b.az, t), el: lerp(a.el, b.el, t), dist: lerp(a.dist, b.dist, t), fov: lerp(a.fov, b.fov, t),
    target: [0, 1, 2].map((k) => lerp(a.target[k], b.target[k], t)),
  };
}

// light keyframes
const L_OPEN_A = { az: 121.0, el: 66.5, dist: 377 };   // first frame
const L_OPEN_B = { az: 128.0, el: 64.0, dist: 380 };   // after the small opening movement (= Halo)
const L_FINAL = PRESETS[1].light;
export const TRAVEL = 9.4;

// Timeline (seconds):
//  0-4    close view of the cast light; the source moves slightly
//  4-8    one controlled withdrawal reveals the glass (source still)
//  8-18   camera holds; the source descends and swings toward the final arrangement
//  18-24  the source has stopped; glass and second form are held together
export function filmState(t) {
  let light, camera, phase;
  if (t < 4) {
    phase = 'open';
    light = lerpLight(L_OPEN_A, L_OPEN_B, smoother(t / 4));
    camera = CLOSE_CAMERA;
  } else if (t < 8) {
    phase = 'reveal';
    light = L_OPEN_B;
    camera = lerpCam(CLOSE_CAMERA, FINAL_CAMERA, smoother((t - 4) / 4));
  } else {
    // arrive at 17.4 s with a long, gentle deceleration, then hold
    phase = t < 8 + TRAVEL ? 'travel' : 'hold';
    const u = smoother((t - 8) / TRAVEL);
    light = lerpLight(L_OPEN_B, L_FINAL, u);
    camera = FINAL_CAMERA;
  }
  return { t, phase, light, camera };
}

export function presetById(id) { return PRESETS.find((p) => p.id === id); }
