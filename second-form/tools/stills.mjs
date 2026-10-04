// Writes native-renderer jobs for the stills and the verification renders.
//   node tools/stills.mjs <outDir> <set> [--quick]
// sets: product | presets | removal | convergence | transition
import fs from 'node:fs';
import path from 'node:path';
import { buildGlass } from '../src/geometry.js';
import { makeUniforms, orbitCamera, lightPosition, floorFootprint, intersectRect } from '../src/scene.js';
import { PRESETS, FINAL_CAMERA, LIGHT_RADIUS, EXPOSURE, AMBIENT_RADIANCE, ENV_GRADIENT, ALBEDO, smoother } from '../src/film.js';
import { jobLines } from './job.mjs';

const [outDir, set] = process.argv.slice(2);
const quick = process.argv.includes('--quick');
fs.mkdirSync(outDir, { recursive: true });
const glass = buildGlass();
const fmt = (a) => a.map((x) => (+x).toPrecision(8)).join(' ');

function sceneUniforms(light, extra = {}) {
  return makeUniforms({ glass, light: { pos: lightPosition(light), radius: LIGHT_RADIUS }, albedo: ALBEDO,
    ambientRadiance: AMBIENT_RADIANCE, envGradient: ENV_GRADIENT, ...extra });
}
function finalJob(name, light, { W = 1920, H = 1080, photons = 200e6, spp = [8, 256], glassOn = true, hdr = true, K = 800 } = {}) {
  if (quick) { photons /= 8; spp = [4, 32]; }
  const cam = orbitCamera(FINAL_CAMERA);
  const wide = intersectRect(floorFootprint(cam, W / H, { far: 700, pad: 40 }), [-260, -260, 560, 300]);
  const u = sceneUniforms(light, { glassOn });
  const L = jobLines(u, { camera: cam, width: W, height: H, spp, photons, kernelK: K, hmin: 0.06, hmax: 4, beta: 0,
    cmap: [...wide, 0.11], dmap: [...wide, 0.25], exposure: EXPOSURE, hdr });
  L.push(`out ${path.join(outDir, name)}`);
  return L;
}
const write = (file, lines) => { fs.writeFileSync(file, lines.join('\n') + '\n'); console.log(file); };

if (set === 'presets') {
  for (const p of PRESETS) write(path.join(outDir, `${p.id}.cfg`), finalJob(`still-${p.id}`, p.light));
}
if (set === 'compare') {
  // the film renderer at the browser check's size, for the browser-versus-film comparison
  const arc = PRESETS.find((p) => p.id === 'arc').light;
  write(path.join(outDir, 'compare.cfg'), finalJob('film-renderer-640', arc, { W: 640, H: 360, photons: 60e6, spp: [8, 128] }));
}
if (set === 'removal') {
  const arc = PRESETS.find((p) => p.id === 'arc').light;
  write(path.join(outDir, 'removal-with.cfg'), finalJob('removal-with-glass', arc, { W: 1280, H: 720, photons: 60e6, spp: [4, 64] }));
  write(path.join(outDir, 'removal-without.cfg'), finalJob('removal-without-glass', arc, { W: 1280, H: 720, photons: 60e6, spp: [4, 64], glassOn: false }));
}
if (set === 'convergence') {
  const arc = PRESETS.find((p) => p.id === 'arc').light;
  for (const [n, s] of [[6e6, [1, 4]], [24e6, [2, 16]], [96e6, [4, 64]], [384e6, [8, 256]]]) {
    write(path.join(outDir, `conv-${n / 1e6}M.cfg`), finalJob(`conv-${n / 1e6}M`, arc, { W: 1280, H: 720, photons: n, spp: s }));
  }
}
if (set === 'transition') {
  // fixed camera, the source travels Halo -> Arc -> Meridian (one job, many frames)
  const cam = orbitCamera(FINAL_CAMERA);
  const W = 960, H = 540;
  const wide = intersectRect(floorFootprint(cam, W / H, { far: 700, pad: 40 }), [-260, -260, 560, 300]);
  const keys = ['halo', 'arc', 'meridian'].map((id) => PRESETS.find((p) => p.id === id).light);
  const u0 = sceneUniforms(keys[0]);
  const L = jobLines(u0, { camera: cam, width: W, height: H, spp: [4, 32], photons: 24e6, kernelK: 800, hmin: 0.06, hmax: 4,
    beta: 0, cmap: [...wide, 0.18], dmap: [...wide, 0.35], exposure: EXPOSURE });
  L.push(`out ${path.join(outDir, 'transition-%03d')}`);
  const N = 48;
  for (let f = 0; f < N; f++) {
    const s = f / (N - 1) * 2;
    const seg = Math.min(1, Math.floor(s));
    const t = smoother(s - seg);
    const a = keys[seg], b = keys[seg + 1];
    const l = { az: a.az + (b.az - a.az) * t, el: a.el + (b.el - a.el) * t, dist: a.dist + (b.dist - a.dist) * t };
    const u = sceneUniforms(l);
    L.push(`frame ${f}`, `uLight ${fmt(u.uLight)}`, `uLightE ${fmt(u.uLightE)}`);
  }
  write(path.join(outDir, 'transition.cfg'), L);
}
if (set === 'clay') {
  // opaque view of the crystal surfaces (debug shading) at the product-view framing
  const dist = 1900, el = 6 * Math.PI / 180, zc = 65.3;
  const cam = { pos: [0, -dist * Math.cos(el), zc + dist * Math.sin(el)], target: [0, 0, zc],
    fov: 2 * Math.atan(110 / dist) * 180 / Math.PI };
  const u = makeUniforms({ glass, light: { pos: lightPosition({ az: -120, el: 60, dist: 600 }), radius: 30 } });
  const L = jobLines(u, { camera: cam, width: 1200, height: 1200, spp: [1, 1], photons: 0,
    cmap: [-60, -60, 60, 60, 1], dmap: [-60, -60, 60, 60, 1], exposure: 1 });
  L.push('clay 1', `out ${path.join(outDir, 'geometry-clay')}`);
  write(path.join(outDir, 'clay.cfg'), L);
}
if (set === 'product') {
  // neutral product view: studio-like surround, long lens, eye slightly above the rim
  const dist = 1900, el = 6 * Math.PI / 180, zc = 65.3;
  const cam = { pos: [0, -dist * Math.cos(el), zc + dist * Math.sin(el)], target: [0, 0, zc],
    fov: 2 * Math.atan(110 / dist) * 180 / Math.PI };
  const u = makeUniforms({ glass, light: { pos: lightPosition({ az: -120, el: 60, dist: 600 }), radius: 30, radiance: 0.02 },
    ambientRadiance: 1.0, envGradient: 0.0, studio: true });
  const L = jobLines(u, { camera: cam, width: 1440, height: 1440, spp: quick ? [4, 64] : [16, 512], photons: 0,
    cmap: [-60, -60, 60, 60, 0.5], dmap: [-160, -160, 160, 160, 0.4], exposure: 1.45, hdr: true });
  L.push(`out ${path.join(outDir, 'product-view')}`);
  write(path.join(outDir, 'product.cfg'), L);
}
