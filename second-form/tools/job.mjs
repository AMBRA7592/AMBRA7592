// Writes job files for native/render from a JS description, so the native film
// renderer and the browser experience share one source for geometry and scene.
import fs from 'node:fs';
import { makeUniforms } from '../src/scene.js';

const fmt = (a) => Array.from(a, (x) => (Number.isInteger(x) ? String(x) : x.toPrecision(9))).join(' ');

// u: uniforms from makeUniforms, r: render settings
export function jobLines(u, r) {
  const L = [];
  L.push(`zones ${fmt(u.zones)}`);
  for (const k of ['uGlass', 'uLip', 'uFacet', 'uOptic', 'uLight', 'uLightE']) L.push(`${k} ${fmt(u[k])}`);
  const cam = r.camera;
  L.push(`camera ${fmt([...cam.pos, ...cam.target, cam.fov, cam.aperture ?? 0, cam.focus ?? 0, cam.roll ?? 0])}`);
  L.push(`image ${r.width} ${r.height}`);
  L.push(`spp ${r.spp?.[0] ?? 4} ${r.spp?.[1] ?? 64}`);
  L.push(`photons ${fmt([r.photons ?? 4e6, r.kernelK ?? 400, r.hmin ?? 0.1, r.hmax ?? 2.5, r.beta ?? 0.4])}`);
  L.push(`cmap ${fmt(r.cmap)}`);
  L.push(`dmap ${fmt(r.dmap)}`);
  L.push(`shadow ${r.shadow?.[0] ?? 8} ${r.shadow?.[1] ?? 64}`);
  L.push(`aocell ${r.aocell ?? 1.0}`);
  L.push(`exposure ${fmt([r.exposure ?? 1])}`);
  if (r.hdr) L.push('hdr 1');
  if (r.dumpmaps) L.push('dumpmaps 1');
  return L;
}

// keys that may change per frame
export function frameLines(u, r) {
  const cam = r.camera;
  return [
    `uLight ${fmt(u.uLight)}`, `uLightE ${fmt(u.uLightE)}`, `uGlass ${fmt(u.uGlass)}`,
    `camera ${fmt([...cam.pos, ...cam.target, cam.fov, cam.aperture ?? 0, cam.focus ?? 0, cam.roll ?? 0])}`,
    `cmap ${fmt(r.cmap)}`, `dmap ${fmt(r.dmap)}`,
    `photons ${fmt([r.photons ?? 4e6, r.kernelK ?? 400, r.hmin ?? 0.1, r.hmax ?? 2.5, r.beta ?? 0.4])}`,
    `spp ${r.spp?.[0] ?? 4} ${r.spp?.[1] ?? 64}`,
  ];
}

export function writeStillJob(path, opts, render, out) {
  const u = makeUniforms(opts);
  const lines = jobLines(u, render);
  lines.push(`out ${out}`);
  fs.writeFileSync(path, lines.join('\n') + '\n');
  return u;
}
