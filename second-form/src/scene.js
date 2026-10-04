// THE SECOND FORM — scene description shared by the browser experience and the
// native film renderer: material, light, room, camera rigs, the three selected
// light positions and the 24-second choreography.
import { buildGlass, MATERIAL, cauchyFromAbbe } from './geometry.js';

export const DEG = Math.PI / 180;

// The glass is fixed. Facet normals sit at FACET0 + k*60 degrees around z.
export const FACET0_DEG = 30;

export const SURFACE = {
  albedo: 0.78,          // pale matte receiving surface
};

// One small, finite white source; restrained ambient fill.
export const LIGHT = {
  radius: 4.0,           // mm (a small spherical emitter)
  radiance: 1.0,         // reference radiance; exposure is set relative to it
  ambient: 0.0,          // filled in below relative to the key
  envGradient: 1.6,      // overhead fill is brighter than the horizon
};

// light position in spherical coordinates about the glass foot centre
export function lightPosition({ az, el, dist }) {
  const a = az * DEG, e = el * DEG;
  return [dist * Math.cos(e) * Math.cos(a), dist * Math.cos(e) * Math.sin(a), dist * Math.sin(e)];
}

export function makeUniforms(opts = {}) {
  const glass = opts.glass || buildGlass();
  const c = cauchyFromAbbe(opts.n_d ?? MATERIAL.n_d, opts.abbe ?? MATERIAL.abbe);
  const f0 = (opts.facet0 ?? FACET0_DEG) * DEG;
  const u0 = [Math.cos(f0), Math.sin(f0)];
  const u1 = [Math.cos(f0 + 60 * DEG), Math.sin(f0 + 60 * DEG)];
  const L = opts.light || {};
  const pos = L.pos || lightPosition({ az: L.az ?? 200, el: L.el ?? 30, dist: L.dist ?? 450 });
  const radius = L.radius ?? LIGHT.radius;
  const radiance = L.radiance ?? LIGHT.radiance;
  // ambient radiance as a fraction of the key's irradiance at the glass foot
  const dist2 = pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2;
  const keyE = Math.PI * radiance * radius * radius / dist2 * (pos[2] / Math.sqrt(dist2));
  const ambFrac = opts.ambientFraction ?? 0.035;
  const grad = opts.envGradient ?? LIGHT.envGradient;
  const ambient = opts.ambientRadiance ?? (ambFrac * keyE / (Math.PI * (0.35 + grad * 0.5)));
  return {
    zones: glass.table,
    uGlass: [glass.nZones, glass.bound[0], glass.bound[1], opts.glassOn === false ? 0 : 1],
    uLip: glass.lip,
    uFacet: [u0[0], u0[1], u1[0], u1[1]],
    uOptic: [c.A, c.B, opts.albedo ?? SURFACE.albedo, opts.glassAmbientT ?? 0.82],
    uLight: [pos[0], pos[1], pos[2], radius],
    uLightE: [radiance, ambient, grad, opts.studio ? 1 : 0],
    keyE,
  };
}

// camera from orbit parameters about a target
export function orbitCamera({ az, el, dist, target = [0, 0, 60], fov = 30, aperture = 0, focus, roll = 0 }) {
  const a = az * DEG, e = el * DEG;
  const pos = [target[0] + dist * Math.cos(e) * Math.cos(a), target[1] + dist * Math.cos(e) * Math.sin(a),
    target[2] + dist * Math.sin(e)];
  return { pos, target, fov, aperture, focus: focus ?? dist, roll };
}

// Region of the receiving surface that can receive light redirected by the glass
// (the glass's projected bounding cylinder seen from the light, plus margins for
// refraction and reflection). Returns [x0, y0, x1, y1].
export function castRegion(lightPos, { margin = 40, reach = 1.25, maxLen = 900 } = {}) {
  const [Lx, Ly, Lz] = lightPos;
  const R = 42, H = 137;
  let x0 = -R - margin, x1 = R + margin, y0 = -R - margin, y1 = R + margin;
  for (let k = 0; k < 48; k++) {
    const ph = (k / 48) * 2 * Math.PI;
    for (const z of [0, H * 0.5, H]) {
      const qx = R * Math.cos(ph), qy = R * Math.sin(ph);
      if (Lz <= z + 1) continue;
      // ray from the light through (qx,qy,z) hits the floor at s
      const s = Lz / (Lz - z);
      let fx = Lx + (qx - Lx) * s * reach + (1 - reach) * 0, fy = Ly + (qy - Ly) * s * reach;
      const dx = fx, dy = fy, d = Math.hypot(dx, dy);
      if (d > maxLen) { fx *= maxLen / d; fy *= maxLen / d; }
      x0 = Math.min(x0, fx - margin); x1 = Math.max(x1, fx + margin);
      y0 = Math.min(y0, fy - margin); y1 = Math.max(y1, fy + margin);
    }
  }
  return [x0, y0, x1, y1];
}

// Floor footprint of a camera frustum (z = 0), clipped at `far` mm from the glass.
export function floorFootprint(cam, aspect, { far = 900, pad = 30 } = {}) {
  const f = norm(sub(cam.target, cam.pos));
  const r = norm(cross(f, [0, 0, 1]));
  const u = cross(r, f);
  const th = Math.tan(cam.fov * DEG / 2);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [0, -1], [-1, 0], [1, 0]]) {
    const d = norm(add(f, add(scale(r, sx * th * aspect), scale(u, sy * th))));
    let p;
    if (d[2] < -1e-3) {
      const t = -cam.pos[2] / d[2];
      p = add(cam.pos, scale(d, t));
    } else {
      p = add(cam.pos, scale([d[0], d[1], 0], 1e4));
    }
    const L = Math.hypot(p[0], p[1]);
    if (L > far) { p = [p[0] * far / L, p[1] * far / L, 0]; }
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
export function intersectRect(a, b) {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
}
export function unionRect(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
