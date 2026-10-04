// Writes the native-renderer job for the 24-second film (or a preview of it).
//   node tools/film.mjs <out.cfg> <framesDir> [--preview] [--from N] [--to M] [--step K]
import fs from 'node:fs';
import path from 'node:path';
import { buildGlass } from '../src/geometry.js';
import { makeUniforms, orbitCamera, lightPosition, floorFootprint, castRegion, intersectRect, unionRect } from '../src/scene.js';
import { FPS, DURATION, filmState, LIGHT_RADIUS, EXPOSURE, AMBIENT_RADIANCE, ENV_GRADIENT, ALBEDO, FINAL_CAMERA } from '../src/film.js';
import { jobLines } from './job.mjs';

const args = process.argv.slice(2);
const outCfg = args[0];
const framesDir = args[1];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const preview = args.includes('--preview');
const W = preview ? 480 : 1920, H = preview ? 270 : 1080;
const Q = preview
  ? { open: 4e6, reveal: 8e6, travel: 4e6, hold: 8e6, spp: [2, 8], holdSpp: [2, 16], cTex: 0.3, cTexClose: 0.12, dTex: 0.5 }
  : { open: 70e6, reveal: 140e6, travel: 45e6, hold: 200e6, spp: [4, 96], holdSpp: [8, 256], cTex: 0.13, cTexClose: 0.075, dTex: 0.3 };
const from = opt('--from', 0), to = opt('--to', FPS * DURATION), step = opt('--step', 1);

const glass = buildGlass();
const fmt = (a) => a.map((x) => (+x).toPrecision(8)).join(' ');
const finalCam = orbitCamera(FINAL_CAMERA);
const WIDE = intersectRect(floorFootprint(finalCam, W / H, { far: 700, pad: 40 }), [-260, -260, 560, 300]);

const base = makeUniforms({
  glass, light: { pos: [0, 0, 400], radius: LIGHT_RADIUS }, albedo: ALBEDO,
  ambientRadiance: AMBIENT_RADIANCE, envGradient: ENV_GRADIENT,
});
const lines = jobLines(base, {
  camera: finalCam, width: W, height: H, spp: Q.spp, photons: Q.travel, kernelK: 800, hmin: 0.06, hmax: 4, beta: 0,
  cmap: [...WIDE, Q.cTex], dmap: [...WIDE, Q.dTex], exposure: EXPOSURE,
});
lines.push(`out ${path.join(framesDir, 'f%04d')}`);
lines.push('resume 1');

for (let f = from; f < to; f += step) {
  const t = f / FPS;
  const s = filmState(t);
  const pos = lightPosition(s.light);
  const u = makeUniforms({ glass, light: { pos, radius: LIGHT_RADIUS }, albedo: ALBEDO, ambientRadiance: AMBIENT_RADIANCE, envGradient: ENV_GRADIENT });
  const cam = orbitCamera(s.camera);
  const fl = [`frame ${f}`, `uLight ${fmt(u.uLight)}`, `uLightE ${fmt(u.uLightE)}`,
    `camera ${fmt([...cam.pos, ...cam.target, cam.fov, 0, 0, 0])}`];
  const closeFoot = floorFootprint(orbitCamera(filmState(0).camera), W / H, { far: 700, pad: 25 });
  if (s.phase === 'open') {
    fl.push(`cmap ${fmt([...closeFoot, Q.cTexClose])}`, `dmap ${fmt([...closeFoot, Q.dTex * 0.4])}`, `photons ${fmt([Q.open, 1300, 0.05, 4, 0])}`);
  } else if (s.phase === 'reveal') {
    fl.push(`cmap ${fmt([...WIDE, Q.cTex])}`, `dmap ${fmt([...WIDE, Q.dTex])}`,
      `cmap2 ${fmt([...closeFoot, Q.cTexClose])}`, `dmap2 ${fmt([...closeFoot, Q.dTex * 0.4])}`, `photons ${fmt([Q.reveal, 1000, 0.05, 4, 0])}`);
  } else {
    const n = s.phase === 'hold' ? Q.hold : Q.travel;
    fl.push(`cmap ${fmt([...WIDE, Q.cTex])}`, `dmap ${fmt([...WIDE, Q.dTex])}`, `photons ${fmt([n, 800, 0.06, 4, 0])}`);
    // the held frame is rendered once at higher quality (identical frames are reused);
    // its first frame also keeps an HDR copy
    if (s.phase === 'hold') {
      fl.push(`spp ${Q.holdSpp[0]} ${Q.holdSpp[1]}`);
      if (filmState((f - 1) / FPS).phase !== 'hold') fl.push('hdr 1');
    }
  }
  lines.push(...fl);
}
fs.mkdirSync(framesDir, { recursive: true });
fs.writeFileSync(outCfg, lines.join('\n') + '\n');
console.error(`wrote ${outCfg}: frames ${from}..${to - 1} step ${step}, ${W}x${H}, wide map ${WIDE.map((v) => v.toFixed(0)).join(',')}`);
