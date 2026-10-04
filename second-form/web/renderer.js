// THE SECOND FORM — WebGL2 renderer.
// Runs the shared optical core (src/optics.glsl) on the GPU:
//   photons      one photon per fragment, traced through the crystal
//   pilot/splat  adaptive-kernel density estimate of the light on the surface
//   visibility   soft shadow of the small source (crystal as occluder)
//   ambient      occlusion of the restrained fill (computed once: the glass never moves)
//   camera       reflection/refraction tree per pixel, progressive
//   display      shared display transform (src/tonemap.glsl)
/* global OPTICS_GLSL, TONEMAP_GLSL */

const PREAMBLE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define OUT(T) out T
#define INOUT(T) inout T
layout(std140) uniform ZoneBlock { vec4 uZone[320]; };
uniform vec4 uGlass;
uniform vec4 uLip;
uniform vec4 uFacet;
uniform vec4 uOptic;
uniform vec4 uLight;
uniform vec4 uLightE;
`;
const STUB_FLOOR = `vec3 floorIrradiance(vec2 xy) { return vec3(0.0); }\n`;

const FS_VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// --- photons ----------------------------------------------------------------
const PHOTON_FS = () => PREAMBLE + OPTICS_GLSL + STUB_FLOOR + `
uniform vec3 uWinG; uniform vec3 uWinU; uniform vec3 uWinV; uniform vec3 uWinW;
uniform vec4 uWinRect;      // umin umax vmin vmax
uniform float uWinArea;
uniform float uNTotal;      // photons in this estimate (flux normalisation)
uniform uint uBase;         // first photon index of this batch
uniform int uPB;
out vec4 oPhoton;
void main() {
  uint i = uBase + uint(int(gl_FragCoord.y) * uPB + int(gl_FragCoord.x));
  vec3 a3 = sobol3(i, 0x51a7u);
  vec2 b2 = sobol2(i, 1u, 0x51a7u);
  vec3 xT = uWinG + uWinU * (uWinRect.x + a3.x * (uWinRect.y - uWinRect.x))
                  + uWinV * (uWinRect.z + a3.y * (uWinRect.w - uWinRect.z));
  float omega;
  float dist;
  vec3 toL = sampleLightCone(xT, b2.x, b2.y, omega, dist);
  vec3 o = xT + toL * dist;
  vec3 d = -toL;
  float flux = uLightE.x * omega * abs(dot(d, uWinW)) * uWinArea / uNTotal;
  float lambda = lambdaFromU(a3.z);
  vec3 land;
  if (tracePhoton(o, d, lambda, pcgHash(i * 2u + 1u), land)) oPhoton = vec4(land.x, land.y, lambda, flux);
  else oPhoton = vec4(0.0);
}`;

// --- pilot density (photon counts) --------------------------------------------
const PILOT_VS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uPhotons; uniform int uPB; uniform vec4 uMapRect; uniform ivec2 uMapSize;
void main() {
  vec4 ph = texelFetch(uPhotons, ivec2(gl_VertexID % uPB, gl_VertexID / uPB), 0);
  vec2 uv = (ph.xy - uMapRect.xy) / (uMapRect.zw - uMapRect.xy);
  bool ok = ph.w > 0.0 && uv.x >= 0.0 && uv.y >= 0.0 && uv.x < 1.0 && uv.y < 1.0;
  gl_Position = ok ? vec4(uv * 2.0 - 1.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 1.0;
}`;
const PILOT_FS = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(1.0, 0.0, 0.0, 1.0); }`;

const BLUR_FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uSrc; uniform ivec2 uDir; uniform float uSigma; uniform ivec2 uSize;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int r = int(ceil(3.0 * uSigma));
  float a = 0.0, ws = 0.0;
  for (int k = -24; k <= 24; k++) {
    if (k < -r || k > r) continue;
    float w = exp(-0.5 * float(k * k) / (uSigma * uSigma));
    ivec2 q = clamp(p + uDir * k, ivec2(0), uSize - 1);
    a += w * texelFetch(uSrc, q, 0).r;
    ws += w;
  }
  o = vec4(a / ws, 0.0, 0.0, 1.0);
}`;

// --- adaptive-kernel splat ----------------------------------------------------
const SPLAT_VS = () => PREAMBLE + OPTICS_GLSL + STUB_FLOOR + `
uniform sampler2D uPhotons; uniform int uPB;
uniform sampler2D uPilot; uniform ivec2 uMapSize; uniform vec4 uMapRect; uniform float uTexel;
uniform float uRhoScale;   // pilot count per texel -> photons per mm^2 of the current estimate
uniform float uK; uniform float uHmin; uniform float uHmax; uniform float uGain;
flat out vec3 vRGB; flat out vec2 vC; flat out float vHr; flat out float vNorm;
void main() {
  vec4 ph = texelFetch(uPhotons, ivec2(gl_VertexID % uPB, gl_VertexID / uPB), 0);
  vec2 f = (ph.xy - uMapRect.xy) / uTexel - 0.5;
  float hmaxT = uHmax / uTexel;
  bool near = f.x > -hmaxT && f.y > -hmaxT && f.x < float(uMapSize.x) + hmaxT && f.y < float(uMapSize.y) + hmaxT;
  if (ph.w <= 0.0 || !near) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; vNorm = 0.0; return; }
  ivec2 pi = clamp(ivec2(floor(f + 0.5)), ivec2(0), uMapSize - 1);
  float rho = max(texelFetch(uPilot, pi, 0).r * uRhoScale, 1e-9);
  float h = clamp(sqrt(uK / (3.14159265 * rho)), uHmin, uHmax);
  float hr = h / uTexel;
  float wsum = 0.0;
  if (hr < 4.0) {
    int i0 = int(ceil(f.x - hr)); int i1 = int(floor(f.x + hr));
    int j0 = int(ceil(f.y - hr)); int j1 = int(floor(f.y + hr));
    for (int j = j0; j <= j1; j++) for (int i = i0; i <= i1; i++) {
      vec2 r = (vec2(float(i), float(j)) - f) / hr;
      float r2 = dot(r, r);
      if (r2 < 1.0) wsum += 1.0 - r2;
    }
  } else {
    wsum = 1.5707963 * hr * hr;
  }
  vNorm = wsum > 0.0 ? uGain / (wsum * uTexel * uTexel) : 0.0;
  vRGB = channelWeights(ph.z) * ph.w;
  vC = f;
  vHr = hr;
  gl_PointSize = 2.0 * hr + 2.0;
  gl_Position = vec4((f + 0.5) / vec2(uMapSize) * 2.0 - 1.0, 0.0, 1.0);
}`;
const SPLAT_FS = `#version 300 es
precision highp float;
flat in vec3 vRGB; flat in vec2 vC; flat in float vHr; flat in float vNorm;
out vec4 o;
void main() {
  vec2 r = (gl_FragCoord.xy - 0.5 - vC) / vHr;
  float r2 = dot(r, r);
  if (r2 >= 1.0 || vNorm <= 0.0) discard;
  o = vec4(vRGB * ((1.0 - r2) * vNorm), 1.0);
}`;

// running mean: A + (B - A) / n
const ADD_FS = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uA; uniform sampler2D uB; uniform float uInvN;
out vec4 o;
void main() { ivec2 p = ivec2(gl_FragCoord.xy); vec4 a = texelFetch(uA, p, 0); o = a + (texelFetch(uB, p, 0) - a) * uInvN; }`;

// --- light visibility (soft shadow) -------------------------------------------
const VIS_FS = () => PREAMBLE + OPTICS_GLSL + STUB_FLOOR + `
uniform sampler2D uPrev; uniform vec4 uMapRect; uniform ivec2 uSize; uniform int uBase; uniform int uCount;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  float prev = texelFetch(uPrev, p, 0).r;
  vec2 xy = uMapRect.xy + (vec2(p) + 0.5) / vec2(uSize) * (uMapRect.zw - uMapRect.xy);
  vec3 x = vec3(xy, 0.0);
  float acc = float(uCount);
  if (uGlass.w > 0.5 && lightConeMayHitGlass(x)) {
    acc = 0.0;
    uint seed = pcgHash(uint(p.x) * 73856093u ^ uint(p.y) * 19349663u);
    float r1 = u01(pcgHash(seed));
    float r2 = u01(pcgHash(seed ^ 0x68bc21ebu));
    vec3 oo = vec3(xy, 1e-3);
    for (int k = 0; k < 64; k++) {
      if (k >= uCount) break;
      uint s = uint(uBase + k);
      float omega;
      float dist;
      vec3 dir = sampleLightCone(oo, fract(rseq2(s, 0) + r1), fract(rseq2(s, 1) + r2), omega, dist);
      if (!glassBlocks(oo, dir, dist)) acc += 1.0;
    }
  }
  o = vec4(prev + acc, 0.0, 0.0, 1.0);
}`;

// --- ambient occlusion of the fill (once) --------------------------------------
const AO_FS = () => PREAMBLE + OPTICS_GLSL + STUB_FLOOR + `
uniform vec4 uRect; uniform ivec2 uSize;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 xy = uRect.xy + (vec2(p) + 0.5) / vec2(uSize) * (uRect.zw - uRect.xy);
  o = vec4(fillOcclusion(vec3(xy, 1e-3), 48), 0.0, 0.0, 1.0);
}`;

// --- camera ---------------------------------------------------------------------
const CAMERA_FS = () => PREAMBLE + OPTICS_GLSL + `
uniform sampler2D uCaustic; uniform ivec2 uCausticSize;
uniform sampler2D uVis; uniform ivec2 uVisSize;
uniform vec4 uMapRect;
uniform sampler2D uCausticF; uniform ivec2 uCausticFSize;
uniform sampler2D uVisF; uniform ivec2 uVisFSize;
uniform vec4 uMapRectF; uniform float uHasFine;
uniform sampler2D uAO; uniform ivec2 uAOSize; uniform vec4 uAORect;
uniform vec4 uScale;   // caustic scale, visibility scale, fine caustic scale, fine visibility scale
uniform float uAmbientE0;
vec4 bilin(sampler2D t, ivec2 size, vec2 uv) {
  vec2 f = uv * vec2(size) - 0.5;
  ivec2 i = ivec2(floor(f));
  vec2 a = f - vec2(i);
  ivec2 m = size - 1;
  vec4 c00 = texelFetch(t, clamp(i, ivec2(0), m), 0);
  vec4 c10 = texelFetch(t, clamp(i + ivec2(1, 0), ivec2(0), m), 0);
  vec4 c01 = texelFetch(t, clamp(i + ivec2(0, 1), ivec2(0), m), 0);
  vec4 c11 = texelFetch(t, clamp(i + ivec2(1, 1), ivec2(0), m), 0);
  return mix(mix(c00, c10, a.x), mix(c01, c11, a.x), a.y);
}
float fade(vec2 uv, ivec2 size) {
  vec2 d = min(uv, 1.0 - uv) * vec2(size);
  return clamp(min(d.x, d.y) / 8.0, 0.0, 1.0);
}
vec3 floorIrradiance(vec2 xy) {
  float base = directUnoccluded(vec3(xy, 0.0));
  float V = 1.0;
  vec3 C = vec3(0.0);
  vec2 uv = (xy - uMapRect.xy) / (uMapRect.zw - uMapRect.xy);
  if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
    float f = fade(uv, uVisSize);
    V = mix(1.0, bilin(uVis, uVisSize, uv).r * uScale.y, f);
    C = bilin(uCaustic, uCausticSize, uv).rgb * uScale.x;
  }
  if (uHasFine > 0.5) {
    vec2 uf = (xy - uMapRectF.xy) / (uMapRectF.zw - uMapRectF.xy);
    if (all(greaterThanEqual(uf, vec2(0.0))) && all(lessThan(uf, vec2(1.0)))) {
      float f = fade(uf, uVisFSize);
      V = mix(V, bilin(uVisF, uVisFSize, uf).r * uScale.w, f);
      C = mix(C, bilin(uCausticF, uCausticFSize, uf).rgb * uScale.z, f);
    }
  }
  float ao = 1.0;
  vec2 ua = (xy - uAORect.xy) / (uAORect.zw - uAORect.xy);
  if (all(greaterThanEqual(ua, vec2(0.0))) && all(lessThan(ua, vec2(1.0)))) ao = bilin(uAO, uAOSize, ua).r;
  return vec3(base * V + uAmbientE0 * ao) + C;
}
uniform vec3 uCamPos; uniform vec3 uCamFwd; uniform vec3 uCamRight; uniform vec3 uCamUp;
uniform vec2 uTan; uniform vec2 uRes; uniform int uSample; uniform sampler2D uPrev; uniform float uDecay;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int yTop = int(uRes.y) - 1 - p.y;
  uint pix = uint(yTop) * uint(uRes.x) + uint(p.x);
  uint rot = pcgHash(pix * 9781u + 6271u);
  float r0 = u01(rot);
  float r1 = u01(pcgHash(rot));
  float r2 = u01(pcgHash(rot + 1u));
  uint s = uint(uSample);
  float jx = fract(rseq5(s, 0) + r0);
  float jy = fract(rseq5(s, 1) + r1);
  float jl = fract(rseq5(s, 2) + r2);
  float sx = (2.0 * (float(p.x) + jx) / uRes.x - 1.0) * uTan.x;
  float sy = (1.0 - 2.0 * (float(yTop) + jy) / uRes.y) * uTan.y;
  vec3 d = normalize(uCamFwd + uCamRight * sx + uCamUp * sy);
  vec3 c = traceCamera(uCamPos, d, lambdaFromU(jl), pcgHash(pix * 131u + s));
  vec4 prev = texelFetch(uPrev, p, 0);
  o = prev * uDecay + vec4(c, 1.0);
}`;

const DISPLAY_FS = () => `#version 300 es
precision highp float; precision highp sampler2D;
` + TONEMAP_GLSL + `
uniform sampler2D uAcc; uniform float uExposure; uniform vec2 uSrcSize; uniform vec2 uDstSize;
out vec4 o;
uint h2(uint v) { v = v * 747796405u + 2891336453u; v = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u; return (v >> 22u) ^ v; }
void main() {
  vec2 uv = gl_FragCoord.xy / uDstSize;
  ivec2 p = ivec2(uv * uSrcSize);
  vec4 a = texelFetch(uAcc, p, 0);
  vec3 c = a.rgb / max(a.a, 1e-6);
  vec3 m = toneMap(c * uExposure);
  uint k = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u;
  float dn = (float(h2(k) & 1023u) + float(h2(k + 7u) & 1023u)) / 1023.0 - 1.0;
  o = vec4(m + dn / 255.0, 1.0);
}`;

// ---------------------------------------------------------------------------------
function compile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    throw new Error(`${name}: ${log}`);
  }
  return s;
}
function program(gl, vs, fs, name) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name + ' (vs)'));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name + ' (fs)'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  const blockIndex = gl.getUniformBlockIndex(p, 'ZoneBlock');
  if (blockIndex !== gl.INVALID_INDEX && blockIndex !== 0xffffffff) gl.uniformBlockBinding(p, blockIndex, 0);
  return { p, u, name };
}

class Target {
  constructor(gl, w, h, fmt) {
    this.gl = gl; this.w = w; this.h = h;
    const F = { rgba32f: [gl.RGBA32F, gl.RGBA, gl.FLOAT], rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
      r32f: [gl.R32F, gl.RED, gl.FLOAT], r16f: [gl.R16F, gl.RED, gl.HALF_FLOAT] }[fmt];
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, F[0], w, h, 0, F[1], F[2], null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer ${fmt} ${w}x${h} incomplete (${st})`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  clear() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  dispose() { this.gl.deleteTexture(this.tex); this.gl.deleteFramebuffer(this.fb); }
}
class PingPong {
  constructor(gl, w, h, fmt) { this.a = new Target(gl, w, h, fmt); this.b = new Target(gl, w, h, fmt); this.w = w; this.h = h; }
  swap() { const t = this.a; this.a = this.b; this.b = t; }
  clear() { this.a.clear(); this.b.clear(); }
  dispose() { this.a.dispose(); this.b.dispose(); }
}

// One irradiance field over a rectangle of the receiving surface.
class SurfaceField {
  constructor(gl, rect, texel, visTexel, floatBlend) {
    this.rect = rect;
    this.texel = texel;
    this.W = Math.max(2, Math.ceil((rect[2] - rect[0]) / texel));
    this.H = Math.max(2, Math.ceil((rect[3] - rect[1]) / texel));
    this.rect = [rect[0], rect[1], rect[0] + this.W * texel, rect[1] + this.H * texel];
    this.VW = Math.max(2, Math.ceil((this.rect[2] - this.rect[0]) / visTexel));
    this.VH = Math.max(2, Math.ceil((this.rect[3] - this.rect[1]) / visTexel));
    // half floats throughout: the field stores a running mean scaled by uGain (~1)
    this.caustic = new PingPong(gl, this.W, this.H, 'rgba16f');
    this.batch = new Target(gl, this.W, this.H, 'rgba16f');
    this.pilot = new Target(gl, this.W, this.H, 'r16f');
    this.pilotTmp = new Target(gl, this.W, this.H, 'r16f');
    this.pilotBlur = new Target(gl, this.W, this.H, 'r16f');
    this.vis = new PingPong(gl, this.VW, this.VH, 'r32f');
    this.reset();
  }
  reset() { this.batches = 0; this.visSamples = 0; this.pilotN = 0; this.caustic.clear(); this.vis.clear(); }
  resetVisibility() { this.visSamples = 0; this.vis.clear(); }
  dispose() { for (const t of [this.caustic, this.batch, this.pilot, this.pilotTmp, this.pilotBlur, this.vis]) t.dispose(); }
}

export class Renderer {
  constructor(canvas, scene) {
    this.canvas = canvas;
    this.scene = scene;     // { uniforms, mapGain, exposure, ambientE0 }
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('This piece needs WebGL2.');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This piece needs floating-point render targets (EXT_color_buffer_float).');
    this.floatBlend = !!gl.getExtension('EXT_float_blend');
    this.gl = gl;
    this.PB = 512;            // photons per batch: PB * PB
    this.PBmove = 256;        // smaller batches while the light is moving
    this.maxBatches = 160;
    this.maxVis = 128;
    this.K = 800;
    this.vao = gl.createVertexArray();
    this.progs = {};
    this.compileAll();
    // zone table in a uniform buffer
    this.ubo = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, scene.uniforms.zones, gl.STATIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);
    this.photons = new Target(gl, this.PB, this.PB, 'rgba32f');
    this.photonsMove = new Target(gl, this.PBmove, this.PBmove, 'rgba32f');
    this.fields = {};
    this.camAcc = null;
    this.frameSamples = 0;
    this.lightKey = '';
  }

  compileAll() {
    const gl = this.gl;
    const P = (name, vs, fs) => { this.progs[name] = program(gl, vs, fs, name); };
    P('photon', FS_VERT, PHOTON_FS());
    P('pilot', PILOT_VS, PILOT_FS);
    P('blur', FS_VERT, BLUR_FS);
    P('splat', SPLAT_VS(), SPLAT_FS);
    P('add', FS_VERT, ADD_FS);
    P('vis', FS_VERT, VIS_FS());
    P('ao', FS_VERT, AO_FS());
    P('camera', FS_VERT, CAMERA_FS());
    P('display', FS_VERT, DISPLAY_FS());
  }

  use(name) {
    const gl = this.gl;
    const pr = this.progs[name];
    gl.useProgram(pr.p);
    gl.bindVertexArray(this.vao);
    const U = this.scene.uniforms, u = pr.u;
    for (const k of ['uGlass', 'uLip', 'uFacet', 'uOptic', 'uLight', 'uLightE']) if (u[k]) gl.uniform4fv(u[k], U[k]);
    return pr;
  }
  tex(pr, name, unit, tex) {
    const gl = this.gl;
    if (!pr.u[name]) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(pr.u[name], unit);
  }
  drawTo(target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    if (target) gl.viewport(0, 0, target.w, target.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ---- configuration -----------------------------------------------------------
  setFields(spec) {
    // spec: { wide: {rect, texel, vis}, fine?: {rect, texel, vis} }
    const gl = this.gl;
    for (const key of ['wide', 'fine']) {
      const want = spec[key];
      const have = this.fields[key];
      const same = have && want && have.spec === JSON.stringify(want);
      if (same) continue;
      if (have) have.dispose();
      this.fields[key] = null;
      if (want) {
        const f = new SurfaceField(gl, want.rect, want.texel, want.vis, this.floatBlend);
        f.spec = JSON.stringify(want);
        this.fields[key] = f;
      }
    }
    if (!this.ao) this.computeAO();
  }
  computeAO() {
    const gl = this.gl;
    const rect = [-260, -260, 260, 260];
    this.aoRect = rect;
    this.ao = new Target(gl, 520, 520, 'r32f');
    const pr = this.use('ao');
    gl.uniform4fv(pr.u.uRect, rect);
    gl.uniform2i(pr.u.uSize, 520, 520);
    this.drawTo(this.ao);
  }
  setCamera(cam) {
    // cam: { pos, target, fov }
    const f = norm(sub(cam.target, cam.pos));
    const r = norm(cross(f, [0, 0, 1]));
    const u = cross(r, f);
    const key = JSON.stringify([cam.pos, cam.target, cam.fov].flat().map((v) => +v.toFixed(5)));
    if (key !== this.camKey) { this.camKey = key; this.cameraMoved = true; }
    this.cam = { pos: cam.pos, f, r, u, tan: Math.tan(cam.fov * Math.PI / 360) };
  }
  setLight(uniforms, moving) {
    const key = uniforms.uLight.map((v) => v.toFixed(5)).join(',') + '|' + uniforms.uGlass[3];
    this.scene.uniforms = uniforms;
    this.moving = moving;
    if (key !== this.lightKey) {
      this.lightKey = key;
      this.lightChanged = true;
      this.window = photonWindow(uniforms);
    }
  }
  resize(w, h) {
    if (this.camAcc && this.camAcc.w === w && this.camAcc.h === h) return;
    if (this.camAcc) this.camAcc.dispose();
    this.camAcc = new PingPong(this.gl, w, h, 'rgba32f');
    this.camAcc.clear();
    this.frameSamples = 0;
  }

  // ---- passes --------------------------------------------------------------------
  tracePhotons(target, pb, base, nTotal) {
    const gl = this.gl, W = this.window;
    const pr = this.use('photon');
    gl.uniform3fv(pr.u.uWinG, W.G); gl.uniform3fv(pr.u.uWinU, W.U); gl.uniform3fv(pr.u.uWinV, W.V); gl.uniform3fv(pr.u.uWinW, W.w);
    gl.uniform4fv(pr.u.uWinRect, W.rect); gl.uniform1f(pr.u.uWinArea, W.area); gl.uniform1f(pr.u.uNTotal, nTotal);
    gl.uniform1ui(pr.u.uBase, base >>> 0); gl.uniform1i(pr.u.uPB, pb);
    this.drawTo(target);
  }
  buildPilot(field, photons, pb) {
    const gl = this.gl;
    field.pilot.clear();
    let pr = this.use('pilot');
    this.tex(pr, 'uPhotons', 0, photons.tex);
    gl.uniform1i(pr.u.uPB, pb); gl.uniform4fv(pr.u.uMapRect, field.rect); gl.uniform2i(pr.u.uMapSize, field.W, field.H);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, field.pilot.fb); gl.viewport(0, 0, field.W, field.H);
    gl.drawArrays(gl.POINTS, 0, pb * pb);
    gl.disable(gl.BLEND);
    const sig = Math.max(1, 0.6 / field.texel);
    pr = this.use('blur');
    gl.uniform1f(pr.u.uSigma, Math.min(sig, 8)); gl.uniform2i(pr.u.uSize, field.W, field.H);
    this.tex(pr, 'uSrc', 0, field.pilot.tex); gl.uniform2i(pr.u.uDir, 1, 0); this.drawTo(field.pilotTmp);
    this.tex(pr, 'uSrc', 0, field.pilotTmp.tex); gl.uniform2i(pr.u.uDir, 0, 1); this.drawTo(field.pilotBlur);
    field.pilotN = pb * pb;
  }
  splat(field, photons, pb, nEff) {
    const gl = this.gl;
    field.batch.clear();
    const pr = this.use('splat');
    this.tex(pr, 'uPhotons', 0, photons.tex);
    this.tex(pr, 'uPilot', 1, field.pilotBlur.tex);
    gl.uniform1i(pr.u.uPB, pb); gl.uniform2i(pr.u.uMapSize, field.W, field.H); gl.uniform4fv(pr.u.uMapRect, field.rect);
    gl.uniform1f(pr.u.uTexel, field.texel);
    gl.uniform1f(pr.u.uRhoScale, (nEff / field.pilotN) / (field.texel * field.texel));
    gl.uniform1f(pr.u.uK, this.K); gl.uniform1f(pr.u.uHmin, Math.max(0.06, 0.75 * field.texel)); gl.uniform1f(pr.u.uHmax, 4.0);
    gl.uniform1f(pr.u.uGain, this.scene.mapGain);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, field.batch.fb); gl.viewport(0, 0, field.W, field.H);
    gl.drawArrays(gl.POINTS, 0, pb * pb);
    gl.disable(gl.BLEND);
    // fold this batch into the running mean
    const pa = this.use('add');
    this.tex(pa, 'uA', 0, field.caustic.a.tex); this.tex(pa, 'uB', 1, field.batch.tex);
    gl.uniform1f(pa.u.uInvN, 1 / (field.batches + 1));
    this.drawTo(field.caustic.b);
    field.caustic.swap();
  }
  visibility(field, count) {
    const gl = this.gl;
    const pr = this.use('vis');
    this.tex(pr, 'uPrev', 0, field.vis.a.tex);
    gl.uniform4fv(pr.u.uMapRect, field.rect); gl.uniform2i(pr.u.uSize, field.VW, field.VH);
    gl.uniform1i(pr.u.uBase, field.visSamples); gl.uniform1i(pr.u.uCount, count);
    this.drawTo(field.vis.b);
    field.vis.swap();
    field.visSamples += count;
  }
  camera(decay) {
    const gl = this.gl, c = this.cam, acc = this.camAcc;
    const pr = this.use('camera');
    const F = this.fields.wide, Ff = this.fields.fine;
    this.tex(pr, 'uCaustic', 0, F.caustic.a.tex); gl.uniform2i(pr.u.uCausticSize, F.W, F.H);
    this.tex(pr, 'uVis', 1, F.vis.a.tex); gl.uniform2i(pr.u.uVisSize, F.VW, F.VH);
    gl.uniform4fv(pr.u.uMapRect, F.rect);
    const g = this.scene.mapGain;
    const sc = [F.batches ? 1 / g : 0, F.visSamples ? 1 / F.visSamples : 1, 0, 1];
    if (Ff) {
      this.tex(pr, 'uCausticF', 2, Ff.caustic.a.tex); gl.uniform2i(pr.u.uCausticFSize, Ff.W, Ff.H);
      this.tex(pr, 'uVisF', 3, Ff.vis.a.tex); gl.uniform2i(pr.u.uVisFSize, Ff.VW, Ff.VH);
      gl.uniform4fv(pr.u.uMapRectF, Ff.rect); gl.uniform1f(pr.u.uHasFine, 1);
      sc[2] = Ff.batches ? 1 / g : 0; sc[3] = Ff.visSamples ? 1 / Ff.visSamples : 1;
    } else {
      this.tex(pr, 'uCausticF', 2, F.caustic.a.tex); gl.uniform2i(pr.u.uCausticFSize, F.W, F.H);
      this.tex(pr, 'uVisF', 3, F.vis.a.tex); gl.uniform2i(pr.u.uVisFSize, F.VW, F.VH);
      gl.uniform4fv(pr.u.uMapRectF, F.rect); gl.uniform1f(pr.u.uHasFine, 0);
    }
    this.tex(pr, 'uAO', 4, this.ao.tex); gl.uniform2i(pr.u.uAOSize, 520, 520); gl.uniform4fv(pr.u.uAORect, this.aoRect);
    gl.uniform4fv(pr.u.uScale, sc);
    gl.uniform1f(pr.u.uAmbientE0, this.scene.ambientE0);
    gl.uniform3fv(pr.u.uCamPos, c.pos); gl.uniform3fv(pr.u.uCamFwd, c.f); gl.uniform3fv(pr.u.uCamRight, c.r); gl.uniform3fv(pr.u.uCamUp, c.u);
    gl.uniform2f(pr.u.uTan, c.tan * acc.w / acc.h, c.tan); gl.uniform2f(pr.u.uRes, acc.w, acc.h);
    gl.uniform1i(pr.u.uSample, this.frameSamples);
    this.tex(pr, 'uPrev', 5, acc.a.tex); gl.uniform1f(pr.u.uDecay, decay);
    this.drawTo(acc.b);
    acc.swap();
    this.frameSamples++;
  }
  display() {
    const gl = this.gl, acc = this.camAcc;
    const pr = this.use('display');
    this.tex(pr, 'uAcc', 0, acc.a.tex);
    gl.uniform1f(pr.u.uExposure, this.scene.exposure);
    gl.uniform2f(pr.u.uSrcSize, acc.w, acc.h);
    gl.uniform2f(pr.u.uDstSize, this.canvas.width, this.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // One unit of progressive work. While the light moves, each new light position
  // gets one small, smooth estimate; when it stops, full batches refine it.
  step() {
    const fields = [this.fields.wide, this.fields.fine].filter(Boolean);
    if (this.lightChanged) {
      this.lightChanged = false;
      this.moveDone = false;
      this.refine = 0;
      for (const f of fields) f.reset();
    }
    if (this.moving) {
      if (this.moveDone) return { floorChanged: false };
      const pb = this.PBmove, n = pb * pb;
      this.tracePhotons(this.photonsMove, pb, 0, n);
      for (const f of fields) {
        f.reset();
        this.buildPilot(f, this.photonsMove, pb);
        this.splat(f, this.photonsMove, pb, n);
        f.batches = 1;
        f.fromMove = true;
        this.visibility(f, 4);
      }
      this.moveDone = true;
      return { floorChanged: true };
    }
    let changed = false;
    if (this.refine < this.maxBatches) {
      const pb = this.PB, n = pb * pb;
      if (this.refine === 0) for (const f of fields) { if (f.fromMove) { f.reset(); f.fromMove = false; } }
      this.tracePhotons(this.photons, pb, this.refine * n, n);
      for (const f of fields) {
        if (this.refine === 0) this.buildPilot(f, this.photons, pb);
        this.splat(f, this.photons, pb, (this.refine + 1) * n);
        f.batches++;
      }
      this.refine++;
      changed = true;
    }
    for (const f of fields) {
      if (f.visSamples < this.maxVis) { this.visibility(f, 8); changed = true; }
    }
    return { floorChanged: changed };
  }
  progress() {
    const f = this.fields.wide;
    if (!f) return 0;
    return Math.min(1, 0.7 * this.refine / this.maxBatches + 0.3 * f.visSamples / this.maxVis);
  }
}

// photon emission window (identical to the native renderer)
export function photonWindow(U) {
  const C = [U.uLight[0], U.uLight[1], U.uLight[2]];
  const G = [0, 0, U.uGlass[2] * 0.5];
  const w = norm(sub(G, C));
  const a = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const Uv = norm(cross(a, w)), V = cross(w, Uv);
  let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
  for (let k = 0; k < 128; k++) {
    const ph = 2 * Math.PI * (k % 64) / 64;
    const Q = [U.uGlass[1] * Math.cos(ph), U.uGlass[1] * Math.sin(ph), k < 64 ? 0 : U.uGlass[2]];
    const dq = sub(Q, C);
    const s = dot(sub(G, C), w) / dot(dq, w);
    const X = sub(add(C, scale(dq, s)), G);
    umin = Math.min(umin, dot(X, Uv)); umax = Math.max(umax, dot(X, Uv));
    vmin = Math.min(vmin, dot(X, V)); vmax = Math.max(vmax, dot(X, V));
  }
  const m = 3 * U.uLight[3] + 1;
  umin -= m; umax += m; vmin -= m; vmax += m;
  return { G, U: Uv, V, w, rect: [umin, umax, vmin, vmax], area: (umax - umin) * (vmax - vmin) };
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
