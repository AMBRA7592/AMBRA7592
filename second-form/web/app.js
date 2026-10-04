// THE SECOND FORM — experience: film playback, then composing with the light.
import { buildGlass } from '../src/geometry.js';
import { makeUniforms, orbitCamera, lightPosition, floorFootprint, intersectRect } from '../src/scene.js';
import { PRESETS, FINAL_PRESET, FINAL_CAMERA, LIGHT_BOUNDS, LIGHT_RADIUS, EXPOSURE, AMBIENT_RADIANCE, ENV_GRADIENT,
  ALBEDO, DURATION, filmState, smoother, CLOSE_CAMERA, REF_E } from '../src/film.js';
import { Renderer } from './renderer.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const debug = location.hash === '#debug' || location.hash.startsWith('#test');
// local verification only: #test:compose[:preset] or #test:film:<seconds> freezes one state
const testArgs = location.hash.startsWith('#test') ? location.hash.slice(1).split(':') : null;
const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const glass = buildGlass();
const presetLight = (id) => PRESETS.find((p) => p.id === id).light;
const ambientE0 = Math.PI * AMBIENT_RADIANCE * (0.35 + ENV_GRADIENT * 0.5);
let glassOn = true;

function uniformsFor(light) {
  return makeUniforms({
    glass, light: { pos: lightPosition(light), radius: LIGHT_RADIUS }, albedo: ALBEDO,
    ambientRadiance: AMBIENT_RADIANCE, envGradient: ENV_GRADIENT, glassOn,
  });
}

// distance of the source follows its height through the three arrangements
const DIST_KEYS = PRESETS.map((p) => [p.light.el, p.light.dist]).sort((a, b) => a[0] - b[0]);
function distAt(el) {
  const k = DIST_KEYS;
  let i = 0;
  while (i < k.length - 2 && el > k[i + 1][0]) i++;
  const [e0, d0] = k[i], [e1, d1] = k[i + 1];
  return d0 + (d1 - d0) * (el - e0) / (e1 - e0);
}
const clampLight = (l) => ({
  az: Math.min(LIGHT_BOUNDS.az[1], Math.max(LIGHT_BOUNDS.az[0], l.az)),
  el: Math.min(LIGHT_BOUNDS.el[1], Math.max(LIGHT_BOUNDS.el[0], l.el)),
});

// ---------------------------------------------------------------------------------
let R;
let W = 1280, H = 720;
const ASPECT = 16 / 9;
const finalCam = orbitCamera(FINAL_CAMERA);
const closeCam = orbitCamera(CLOSE_CAMERA);
const WIDE = intersectRect(floorFootprint(finalCam, ASPECT, { far: 700, pad: 40 }), [-260, -260, 560, 300]);
const CLOSE = floorFootprint(closeCam, ASPECT, { far: 700, pad: 25 });
const FIELD_WIDE = { rect: WIDE, texel: 0.34, vis: 0.45 };
const FIELD_CLOSE = { rect: CLOSE, texel: 0.13, vis: 0.16 };

const state = {
  mode: 'film',          // film | compose
  t0: 0,
  light: { ...presetLight(FINAL_PRESET) },
  lastLightKey: '',
  anim: null,            // { from, to, start, dur }
  dragging: false,
  camKey: '',
  lastPhase: '',
  stillPending: false,
};

function chooseResolution() {
  const box = $('frame').getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cap = testArgs ? 640 : (debug ? 960 : 1600);
  const w = Math.max(480, Math.min(cap, Math.round(box.width * dpr)));
  W = w; H = Math.round(w / ASPECT);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; state.stable = 0; }
  R.resize(W, H);
}

function start() {
  try {
    R = new Renderer(canvas, {
      uniforms: uniformsFor(state.light), mapGain: 1 / REF_E, exposure: EXPOSURE, ambientE0,
    });
  } catch (e) {
    showError(e.message);
    return;
  }
  chooseResolution();
  window.addEventListener('resize', () => { chooseResolution(); });
  bindControls();
  if (testArgs) {
    R.maxBatches = 64;
    R.maxVis = 64;
    window.__status = () => ({ mode: state.mode, refine: R.refine, vis: R.fields.wide?.visSamples, spp: R.frameSamples, progress: R.progress(), stable: state.stable || 0 });
    window.__snapshot = () => canvas.toDataURL('image/png');
    if (testArgs[1] === 'film') { startFilm(); state.freezeT = Number(testArgs[2] || 0); }
    else { enterCompose(true); if (testArgs[2]) state.light = { ...presetLight(testArgs[2]) }; }
  } else if (reducedMotion) enterCompose(true);
  else startFilm();
  requestAnimationFrame(loop);
}

function showError(msg) {
  const v = $('veil');
  v.hidden = false;
  v.querySelector('p').textContent = msg + ' Try a recent desktop browser with hardware acceleration enabled.';
}

// ---------------------------------------------------------------------------------
function startFilm() {
  state.mode = 'film';
  state.t0 = performance.now();
  document.body.dataset.mode = 'film';
  $('controls').setAttribute('aria-hidden', 'true');
}
function enterCompose(immediate) {
  state.mode = 'compose';
  document.body.dataset.mode = 'compose';
  $('controls').removeAttribute('aria-hidden');
  if (immediate) state.light = { ...presetLight(FINAL_PRESET) };
  R.setFields({ wide: FIELD_WIDE });
  R.setCamera(finalCam);
  updatePad();
}

function lightKey(l) { return `${l.az.toFixed(4)},${l.el.toFixed(4)},${(l.dist ?? 0).toFixed(3)}|${glassOn}`; }

function loop(now) {
  requestAnimationFrame(loop);
  if (!R) return;
  let light, cam, moving;
  if (state.mode === 'film') {
    const t = state.freezeT ?? (now - state.t0) / 1000;
    if (t >= DURATION) { enterCompose(false); return; }
    const s = filmState(t);
    $('progress').style.transform = `scaleX(${(t / DURATION).toFixed(4)})`;
    if (s.phase !== state.lastPhase) {
      state.lastPhase = s.phase;
      if (s.phase === 'open') R.setFields({ wide: FIELD_CLOSE });
      else if (s.phase === 'reveal') R.setFields({ wide: FIELD_WIDE, fine: FIELD_CLOSE });
      else R.setFields({ wide: FIELD_WIDE });
      R.lightChanged = true;
    }
    light = s.light;
    cam = orbitCamera(s.camera);
    state.light = { az: light.az, el: light.el, dist: light.dist };
  } else {
    if (state.anim) {
      const a = state.anim;
      const u = Math.min(1, (now - a.start) / a.dur);
      const e = smoother(u);
      state.light = {
        az: a.from.az + (a.to.az - a.from.az) * e,
        el: a.from.el + (a.to.el - a.from.el) * e,
        dist: a.from.dist + (a.to.dist - a.from.dist) * e,
      };
      if (u >= 1) state.anim = null;
      updatePad();
    }
    light = { ...state.light, dist: state.light.dist ?? distAt(state.light.el) };
    cam = finalCam;
  }
  const key = lightKey(light);
  moving = key !== state.lastLightKey;
  state.lastLightKey = key;
  R.setLight(uniformsFor(light), moving || state.dragging || !!state.anim);
  R.setCamera(cam);
  const camMoved = R.cameraMoved;
  R.cameraMoved = false;

  const { floorChanged } = R.step();
  // camera: restart on a new viewpoint, follow while the floor changes, accumulate when
  // still; spend more samples per frame when the frame time allows it
  const dt = state.lastNow ? now - state.lastNow : 16;
  state.lastNow = now;
  state.spf = Math.max(1, Math.min(8, (state.spf || 1) + (dt < 24 ? 1 : dt > 40 ? -1 : 0)));
  const decay = camMoved ? 0 : (R.moving ? 0.55 : (floorChanged ? 0.88 : 1));
  // once the surface field and the image have converged, stop drawing until something changes
  if (camMoved || R.moving || floorChanged) state.stable = 0;
  const idle = state.stable >= 256;
  if (!idle) {
    for (let k = 0; k < state.spf; k++) R.camera(k === 0 ? decay : 1);
    R.display();
    state.stable = (state.stable || 0) + state.spf;
  }

  if (state.stillPending && !R.moving && R.progress() >= 0.999 && state.stable >= 64) saveStill();
  if (debug) $('debug').textContent =
    `${state.mode} ${W}x${H} batches ${R.refine}/${R.maxBatches} vis ${R.fields.wide?.visSamples} spp ${R.frameSamples} floatBlend ${R.floatBlend} glass ${glassOn}`;
  const prog = Math.min(R.progress(), Math.min(1, (state.stable || 0) / 256));
  $('refine').style.transform = `scaleX(${(state.mode === 'compose' ? prog : 0).toFixed(3)})`;
}

// ---------------------------------------------------------------------------------
function moveLightTo(target, dur = 1400) {
  const from = { ...state.light, dist: state.light.dist ?? distAt(state.light.el) };
  const to = { az: target.az, el: target.el, dist: target.dist ?? distAt(target.el) };
  state.anim = { from, to, start: performance.now(), dur: reducedMotion ? 1 : dur };
  for (const b of document.querySelectorAll('[data-preset]')) b.setAttribute('aria-pressed', 'false');
}

function bindControls() {
  for (const b of document.querySelectorAll('[data-preset]')) {
    b.addEventListener('click', () => {
      if (state.mode !== 'compose') return;
      moveLightTo(presetLight(b.dataset.preset));
      b.setAttribute('aria-pressed', 'true');
    });
  }
  $('reset').addEventListener('click', () => {
    if (state.mode !== 'compose') return;
    moveLightTo(presetLight(FINAL_PRESET));
    document.querySelector(`[data-preset="${FINAL_PRESET}"]`).setAttribute('aria-pressed', 'true');
  });
  $('replay').addEventListener('click', () => startFilm());
  $('save').addEventListener('click', () => {
    if (state.mode !== 'compose') return;
    state.stillPending = true;
    $('save').dataset.busy = 'true';
    $('save').textContent = 'Refining…';
  });

  // direct manipulation on the image
  canvas.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'compose') return;
    state.dragging = true;
    state.anim = null;
    canvas.setPointerCapture(e.pointerId);
    state.dragFrom = { x: e.clientX, y: e.clientY, light: { ...state.light } };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.dragging) return;
    const r = canvas.getBoundingClientRect();
    const dx = (e.clientX - state.dragFrom.x) / r.width, dy = (e.clientY - state.dragFrom.y) / r.height;
    // dragging right swings the source behind the glass, dragging up raises it
    const l = clampLight({ az: state.dragFrom.light.az - dx * 70, el: state.dragFrom.light.el - dy * 55 });
    state.light = { ...l, dist: distAt(l.el) };
    updatePad();
  });
  const end = () => { state.dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // light pad
  const pad = $('pad');
  const padMove = (e) => {
    const r = pad.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const az = LIGHT_BOUNDS.az[1] - u * (LIGHT_BOUNDS.az[1] - LIGHT_BOUNDS.az[0]);
    const el = LIGHT_BOUNDS.el[1] - v * (LIGHT_BOUNDS.el[1] - LIGHT_BOUNDS.el[0]);
    state.light = { az, el, dist: distAt(el) };
    updatePad();
  };
  pad.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'compose') return;
    state.dragging = true; state.anim = null; pad.setPointerCapture(e.pointerId); padMove(e);
  });
  pad.addEventListener('pointermove', (e) => { if (state.dragging) padMove(e); });
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  pad.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 4 : 1;
    const l = { ...state.light };
    if (e.key === 'ArrowLeft') l.az += step; else if (e.key === 'ArrowRight') l.az -= step;
    else if (e.key === 'ArrowUp') l.el += step; else if (e.key === 'ArrowDown') l.el -= step; else return;
    e.preventDefault();
    const c = clampLight(l);
    state.light = { ...c, dist: distAt(c.el) };
    state.anim = null;
    updatePad();
  });
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target === pad)) return;
    if (state.mode === 'film' && e.key === 'Escape') { enterCompose(true); return; }
    if (state.mode !== 'compose') return;
    const idx = { 1: 0, 2: 1, 3: 2 }[e.key];
    if (idx !== undefined) document.querySelectorAll('[data-preset]')[idx].click();
    if (debug && (e.key === 'g' || e.key === 'G')) { glassOn = !glassOn; }
  });
  // place preset marks on the pad
  for (const p of PRESETS) {
    const m = document.querySelector(`[data-mark="${p.id}"]`);
    if (!m) continue;
    const [u, v] = padUV(p.light);
    m.setAttribute('cx', (u * 240).toFixed(1));
    m.setAttribute('cy', (v * 150).toFixed(1));
  }
}

function padUV(l) {
  const u = (LIGHT_BOUNDS.az[1] - l.az) / (LIGHT_BOUNDS.az[1] - LIGHT_BOUNDS.az[0]);
  const v = (LIGHT_BOUNDS.el[1] - l.el) / (LIGHT_BOUNDS.el[1] - LIGHT_BOUNDS.el[0]);
  return [u, v];
}
function updatePad() {
  const [u, v] = padUV(state.light);
  for (const id of ['pad-dot', 'pad-glow']) {
    const dot = $(id);
    dot.setAttribute('cx', (u * 240).toFixed(1));
    dot.setAttribute('cy', (v * 150).toFixed(1));
  }
  $('pad').setAttribute('aria-valuetext', describeLight(state.light));
}
function describeLight(l) {
  const height = l.el > 55 ? 'high' : l.el > 35 ? 'mid-height' : 'low';
  const side = l.az > 165 ? 'from the left' : l.az > 140 ? 'from behind and to the left' : 'from behind';
  return `Light ${height}, ${side}`;
}

// Saving: inside the claude.ai viewer the page asks the viewer through the
// `downloads` capability; opened as a file, an ordinary download link works.
let downloads = null;
const inViewer = !!(window.claude && typeof window.claude.use === 'function');
if (inViewer) {
  window.claude.use('downloads').then((d) => {
    downloads = d;
    if (!d) $('save').hidden = true;
  }).catch(() => { $('save').hidden = true; });
}
function saveStill() {
  state.stillPending = false;
  const btn = $('save');
  btn.dataset.busy = 'false';
  const settle = (label) => { btn.textContent = label; setTimeout(() => { btn.textContent = 'Save still'; }, 1800); };
  canvas.toBlob(async (blob) => {
    if (!blob) { settle('Could not save'); return; }
    if (inViewer) {
      if (!downloads) { settle('Saving is unavailable here'); return; }
      try {
        await downloads.save({ filename: 'the-second-form.png', data: blob });
        settle('Saved');
      } catch (e) {
        settle(e && e.code === 'declined' ? 'Save still' : 'Could not save');
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'the-second-form.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    settle('Saved');
  }, 'image/png');
}

// let the page paint before shaders compile
$('veil').hidden = false;
if (location.hash === '#layout') {
  // layout check only: show the composing controls without starting the renderer
  document.body.dataset.mode = 'compose';
  $('veil').querySelector('p').textContent = 'Layout check: renderer not started.';
} else {
  setTimeout(() => { start(); if (R) $('veil').hidden = true; }, 30);
}
