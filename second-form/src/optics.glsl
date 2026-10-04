// THE SECOND FORM — shared optical core.
//
// This file is compiled twice from the same source:
//   * as GLSL ES 3.00 inside the browser experience (WebGL2), and
//   * as C++ (native/glsl.h) inside the film renderer.
// Geometry, material, light, environment and both light-transport directions
// (photons from the source, rays from the camera) live here so that the image of
// the glass and the light it casts are always computed from the same model.
//
// Units: millimetres. z is up; the receiving surface is the plane z = 0.
// Platform preamble must declare these uniforms before including this file:
//   vec4 uZone[320];   zone table from src/geometry.js (4 x vec4 per zone)
//   vec4 uGlass;       (nZones, boundRadius, boundTop, enabled)
//   vec4 uLip;         (zc, Rc, e, top) — half-round rim
//   vec4 uFacet;       (u0.x, u0.y, u1.x, u1.y) facet normals (third = u1 - u0)
//   vec4 uOptic;       (cauchyA, cauchyB, floorAlbedo, glassAmbientT)
//   vec4 uLight;       (centre.xyz, radius)
//   vec4 uLightE;      (radiance, ambientRadiance, envGradient, unused)
// and must define, after including this file, the irradiance lookup
//   vec3 floorIrradiance(vec2 xy);

#define ZF_HEX 1
#define ZF_REV 2
#define ZF_CAV 4
#define ZF_BOTTOM 8
#define ZF_LIP 16

#define SID_NONE 0
#define SID_FACET 1
#define SID_REV 2
#define SID_CAV 3
#define SID_BOTTOM 4
#define SID_LIP 5

#define PI_F 3.14159265358979
#define BIG_F 1.0e30

// ---------------------------------------------------------------------------
// Random numbers and low-discrepancy sequences (integer arithmetic, so the
// browser and the native renderer generate identical sample sets).
uint pcgHash(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float u01(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }
float rand2(uint a, uint b) { return u01(pcgHash(a ^ pcgHash(b + 0x9e3779b9u))); }
// R-sequence (Roberts 2018), 5-D generator, coordinate k of point i
float rseq5(uint i, int k) {
  uint g = 3785032107u;
  if (k == 1) g = 3335640777u;
  if (k == 2) g = 2939605023u;
  if (k == 3) g = 2590590015u;
  if (k == 4) g = 2283013049u;
  return u01(2147483648u + i * g);
}
float rseq3(uint i, int k) {
  uint g = 3518319155u;
  if (k == 1) g = 2882110345u;
  if (k == 2) g = 2360945575u;
  return u01(2147483648u + i * g);
}
float rseq2(uint i, int k) {
  uint g = (k == 0) ? 3242174889u : 2447445414u;
  return u01(2147483648u + i * g);
}

// Owen-scrambled Sobol points (Burley 2020, hash-based nested uniform scrambling):
// stratified like Sobol, without the lattice structure of Kronecker sequences.
uint reverseBits(uint x) {
  x = ((x & 0xaaaaaaaau) >> 1u) | ((x & 0x55555555u) << 1u);
  x = ((x & 0xccccccccu) >> 2u) | ((x & 0x33333333u) << 2u);
  x = ((x & 0xf0f0f0f0u) >> 4u) | ((x & 0x0f0f0f0fu) << 4u);
  x = ((x & 0xff00ff00u) >> 8u) | ((x & 0x00ff00ffu) << 8u);
  return (x >> 16u) | (x << 16u);
}
uint laineKarras(uint x, uint seed) {
  x += seed;
  x ^= x * 0x6c50b47cu;
  x ^= x * 0xb82f1e52u;
  x ^= x * 0xc7afe638u;
  x ^= x * 0x8d22f6e6u;
  return x;
}
uint nestedScramble(uint x, uint seed) { return reverseBits(laineKarras(reverseBits(x), seed)); }
uint sobolDim1(uint i) {
  uint v = 0x80000000u;
  uint r = 0u;
  for (int k = 0; k < 32; k++) {
    if (i == 0u) break;
    if ((i & 1u) != 0u) r ^= v;
    i >>= 1u;
    v ^= v >> 1u;
  }
  return r;
}
// third Sobol dimension (primitive polynomial x^2 + x + 1, m = 1, 3)
uint sobolDim2(uint i) {
  uint r = 0u;
  uint ma = 1u;
  uint mb = 3u;
  for (int k = 1; k <= 32; k++) {
    if (i == 0u) break;
    uint mk = 1u;
    if (k == 2) mk = 3u;
    if (k >= 3) {
      mk = (2u * mb) ^ (4u * ma) ^ ma;
      ma = mb;
      mb = mk;
    }
    if ((i & 1u) != 0u) r ^= mk << uint(32 - k);
    i >>= 1u;
  }
  return r;
}
// 3-D scrambled Sobol point (dimensions 0..2 of one shuffled index)
vec3 sobol3(uint index, uint seed) {
  uint s = pcgHash(seed);
  uint i = nestedScramble(index, s);
  uint x = nestedScramble(reverseBits(i), pcgHash(s + 1u));
  uint y = nestedScramble(sobolDim1(i), pcgHash(s + 2u));
  uint z = nestedScramble(sobolDim2(i), pcgHash(s + 3u));
  return vec3(float(x >> 8u), float(y >> 8u), float(z >> 8u)) * (1.0 / 16777216.0);
}
// 2-D point `pair` of the padded, shuffled, scrambled Sobol sequence
vec2 sobol2(uint index, uint pair, uint seed) {
  uint s = pcgHash(seed + pair * 0x9e3779b9u);
  uint i = nestedScramble(index, s);
  uint x = nestedScramble(reverseBits(i), pcgHash(s + 1u));
  uint y = nestedScramble(sobolDim1(i), pcgHash(s + 2u));
  return vec2(float(x >> 8u), float(y >> 8u)) * (1.0 / 16777216.0);
}

// ---------------------------------------------------------------------------
// Spectrum. White light is sampled uniformly over 380-720 nm; three smooth,
// non-negative channel responses map wavelength to RGB (equal-energy white -> 1,1,1).
float lambdaFromU(float u) { return 380.0 + 340.0 * u; }
float iorAt(float lambdaNm) {
  float l = lambdaNm * 0.001;
  return uOptic.x + uOptic.y / (l * l);
}
vec3 channelWeights(float l) {
  float r = exp(-0.5 * ((l - 600.0) / 38.0) * ((l - 600.0) / 38.0)) +
            0.07 * exp(-0.5 * ((l - 445.0) / 18.0) * ((l - 445.0) / 18.0));
  float g = exp(-0.5 * ((l - 545.0) / 36.0) * ((l - 545.0) / 36.0));
  float b = exp(-0.5 * ((l - 455.0) / 26.0) * ((l - 455.0) / 26.0));
  return vec3(r * 3.45760155, g * 3.76779902, b * 5.22717997);
}
// spectral value at lambda of an RGB irradiance (partition of unity over channels)
float rgbToSpectral(vec3 c, float l) {
  vec3 w = channelWeights(l);
  float s = w.x + w.y + w.z;
  return (s > 1e-6) ? dot(c, w) / s : (c.x + c.y + c.z) / 3.0;
}

// ---------------------------------------------------------------------------
// Geometry helpers
int solveQuad(float a, float b, float c, OUT(float) t0, OUT(float) t1) {
  t0 = BIG_F;
  t1 = BIG_F;
  if (a == 0.0 || abs(a) < 1e-10 * abs(b)) {
    if (b == 0.0) return 0;
    t0 = -c / b;
    return 1;
  }
  float disc = b * b - 4.0 * a * c;
  if (disc < 0.0) return 0;
  float sq = sqrt(disc);
  float q = -0.5 * (b + (b >= 0.0 ? sq : -sq));
  float r0 = q / a;
  float r1 = (q != 0.0) ? c / q : r0;
  t0 = min(r0, r1);
  t1 = max(r0, r1);
  return 2;
}

vec2 facetU(int k) {
  if (k == 0) return vec2(uFacet.x, uFacet.y);
  if (k == 1) return vec2(uFacet.z, uFacet.w);
  return vec2(uFacet.z - uFacet.x, uFacet.w - uFacet.y);
}
// largest facet coordinate: max_k |p . u_k| (the hexagonal "radius" of a point)
float hexCoord(float px, float py) {
  float a0 = abs(px * uFacet.x + py * uFacet.y);
  float a1 = abs(px * uFacet.z + py * uFacet.w);
  float a2 = abs(px * (uFacet.z - uFacet.x) + py * (uFacet.w - uFacet.y));
  return max(a0, max(a1, a2));
}
float quadAt(vec4 c, float s) { return c.x + s * (c.y + s * c.z); }
float quadSlope(vec4 c, float s) { return c.y + 2.0 * s * c.z; }

int zoneIndexAt(float z) {
  int nz = int(uGlass.x);
  int lo = 0;
  int hi = nz - 1;
  for (int it = 0; it < 8; it++) {
    if (lo >= hi) break;
    int mid = (lo + hi + 1) / 2;
    if (uZone[mid * 4].x <= z) lo = mid; else hi = mid - 1;
  }
  return lo;
}

float lipSDF(vec3 p) {
  float rho = sqrt(p.x * p.x + p.y * p.y);
  float qx = rho - uLip.y;
  float qz = p.z - uLip.x;
  return sqrt(qx * qx + qz * qz) - uLip.z;
}

// Is p inside the crystal?
bool glassInside(vec3 p) {
  if (uGlass.w < 0.5) return false;
  if (p.z < 0.0 || p.z > uGlass.z) return false;
  float rho2 = p.x * p.x + p.y * p.y;
  if (rho2 > uGlass.y * uGlass.y) return false;
  int j = zoneIndexAt(p.z);
  vec4 z0 = uZone[j * 4];
  int fl = int(z0.z);
  if ((fl & ZF_LIP) != 0) return lipSDF(p) < 0.0;
  float s = p.z - z0.x;
  if ((fl & ZF_HEX) != 0 && hexCoord(p.x, p.y) > quadAt(uZone[j * 4 + 1], s)) return false;
  if ((fl & ZF_REV) != 0 && rho2 > quadAt(uZone[j * 4 + 2], s)) return false;
  if ((fl & ZF_CAV) != 0 && rho2 < quadAt(uZone[j * 4 + 3], s)) return false;
  return true;
}

// Candidate tests within one zone. o is the (re-origined) ray origin, the ray
// segment considered is (ta, tBest). Updates tBest / nBest / sBest on a valid hit.
void zoneHit(int j, vec3 o, vec3 d, float ta, INOUT(float) tBest, INOUT(vec3) nBest,
             INOUT(int) sBest, bool inGlass, bool inCavity) {
  vec4 Z = uZone[j * 4];
  int fl = int(Z.z);
  float s0 = o.z - Z.x;
  float dz = d.z;
  float oxy2 = o.x * o.x + o.y * o.y;
  float dxy2 = d.x * d.x + d.y * d.y;
  float odxy = o.x * d.x + o.y * d.y;
  // bounding radius cull: smallest distance to the axis over [ta, tBest]
  float tm = (dxy2 > 0.0) ? clamp(-odxy / dxy2, ta, tBest) : ta;
  float rmin2 = oxy2 + tm * (2.0 * odxy + tm * dxy2);
  if (rmin2 > Z.w * Z.w) return;

  if ((fl & ZF_LIP) != 0) {
    // half-round rim: sphere-trace the exact torus distance, bisect the crossing
    float t = ta + 1e-4;
    float dprev = lipSDF(o + t * d);
    float tprev = t;
    for (int i = 0; i < 96; i++) {
      t += max(abs(dprev), 2e-4);
      if (t >= tBest) break;
      float dc = lipSDF(o + t * d);
      if ((dc < 0.0) != (dprev < 0.0)) {
        // entering the crystal means + to -; leaving means - to +
        bool entersGlass = dprev >= 0.0;
        if (entersGlass != inGlass) {
          float lo = tprev;
          float hi = t;
          for (int k = 0; k < 24; k++) {
            float mid = 0.5 * (lo + hi);
            if ((lipSDF(o + mid * d) < 0.0) == (dprev < 0.0)) lo = mid; else hi = mid;
          }
          vec3 p = o + hi * d;
          if (p.z >= uLip.x - 1e-4) {
            float rho = max(sqrt(p.x * p.x + p.y * p.y), 1e-6);
            float qx = rho - uLip.y;
            float qz = p.z - uLip.x;
            tBest = hi;
            nBest = normalize(vec3(p.x / rho * qx, p.y / rho * qx, qz));
            sBest = SID_LIP;
          }
          break;
        }
      }
      tprev = t;
      dprev = dc;
    }
    return;
  }

  vec4 H = uZone[j * 4 + 1];
  vec4 P = uZone[j * 4 + 2];
  vec4 C = uZone[j * 4 + 3];
  bool hasHex = (fl & ZF_HEX) != 0;
  bool hasRev = (fl & ZF_REV) != 0;
  bool hasCav = (fl & ZF_CAV) != 0;
  float r0;
  float r1;

  // outer surfaces cannot be reached from inside the cavity
  if (!inCavity) {
    if (hasHex) {
      float Hs0 = quadAt(H, s0);
      float Hd = H.y + 2.0 * H.z * s0;
      // range of dz * a'(s) over the zone: a facet can only be entered (left) if
      // sigma*beta - dz*a'(s) is negative (positive) somewhere in the zone
      float sl0 = dz * H.y;
      float sl1 = dz * (H.y + 2.0 * H.z * (Z.y - Z.x));
      float slMin = min(sl0, sl1) - 1e-6;
      float slMax = max(sl0, sl1) + 1e-6;
      for (int k = 0; k < 3; k++) {
        vec2 u = facetU(k);
        float al = o.x * u.x + o.y * u.y;
        float be = d.x * u.x + d.y * u.y;
        for (int sg = 0; sg < 2; sg++) {
          float sigma = (sg == 0) ? 1.0 : -1.0;
          float sb = sigma * be;
          if (inGlass ? (sb <= slMin) : (sb >= slMax)) continue;
          int n = solveQuad(-H.z * dz * dz, sigma * be - dz * Hd, sigma * al - Hs0, r0, r1);
          for (int r = 0; r < 2; r++) {
            if (r >= n) break;
            float t = (r == 0) ? r0 : r1;
            if (t <= ta || t >= tBest) continue;
            vec3 p = o + t * d;
            float s = s0 + t * dz;
            float A = quadAt(H, s);
            if (hexCoord(p.x, p.y) > A + 1e-4) continue;
            if (hasRev && p.x * p.x + p.y * p.y > quadAt(P, s) + 1e-3) continue;
            vec3 nn = normalize(vec3(sigma * u.x, sigma * u.y, -quadSlope(H, s)));
            float side = dot(d, nn);
            if (inGlass ? (side <= 0.0) : (side >= 0.0)) continue;
            tBest = t;
            nBest = nn;
            sBest = SID_FACET;
          }
        }
      }
    }
    if (hasRev) {
      int n = solveQuad(dxy2 - P.z * dz * dz, 2.0 * odxy - dz * (P.y + 2.0 * P.z * s0), oxy2 - quadAt(P, s0), r0, r1);
      for (int r = 0; r < 2; r++) {
        if (r >= n) break;
        float t = (r == 0) ? r0 : r1;
        if (t <= ta || t >= tBest) continue;
        vec3 p = o + t * d;
        float s = s0 + t * dz;
        if (hasHex && hexCoord(p.x, p.y) > quadAt(H, s) + 1e-4) continue;
        vec3 nn = normalize(vec3(p.x, p.y, -0.5 * quadSlope(P, s)));
        float side = dot(d, nn);
        if (inGlass ? (side <= 0.0) : (side >= 0.0)) continue;
        tBest = t;
        nBest = nn;
        sBest = SID_REV;
      }
    }
    if ((fl & ZF_BOTTOM) != 0 && dz != 0.0) {
      float t = -o.z / dz;
      if (t > ta && t < tBest) {
        vec3 p = o + t * d;
        bool ok = true;
        if (hasHex && hexCoord(p.x, p.y) > H.x) ok = false;
        if (hasRev && p.x * p.x + p.y * p.y > P.x) ok = false;
        if (ok) {
          tBest = t;
          nBest = vec3(0.0, 0.0, -1.0);
          sBest = SID_BOTTOM;
        }
      }
    }
  }
  // the cavity wall is reachable from glass and from inside the cavity (open top)
  if (hasCav) {
    int n = solveQuad(dxy2 - C.z * dz * dz, 2.0 * odxy - dz * (C.y + 2.0 * C.z * s0), oxy2 - quadAt(C, s0), r0, r1);
    for (int r = 0; r < 2; r++) {
      if (r >= n) break;
      float t = (r == 0) ? r0 : r1;
      if (t <= ta || t >= tBest) continue;
      vec3 p = o + t * d;
      float s = s0 + t * dz;
      // outward normal of the crystal points into the cavity
      vec3 nn = -normalize(vec3(p.x, p.y, -0.5 * quadSlope(C, s)));
      float side = dot(d, nn);
      if (inGlass ? (side <= 0.0) : (side >= 0.0)) continue;
      tBest = t;
      nBest = nn;
      sBest = SID_CAV;
    }
  }
}

// First crossing of the crystal boundary along ro + t rd, t in (tmin, tmax).
// nHit is the outward normal (crystal -> air). inGlass tells which side the ray
// starts on (used to reject grazing re-hits of the surface just left).
bool glassHit(vec3 ro, vec3 rd, float tmin, float tmax, bool inGlass, OUT(float) tHit,
              OUT(vec3) nHit, OUT(int) sHit) {
  tHit = BIG_F;
  nHit = vec3(0.0, 0.0, 1.0);
  sHit = SID_NONE;
  if (uGlass.w < 0.5) return false;
  float R = uGlass.y;
  float ztop = uGlass.z;
  float t0 = tmin;
  float t1 = tmax;
  if (abs(rd.z) < 1e-12) {
    if (ro.z < -0.01 || ro.z > ztop) return false;
  } else {
    // the slab reaches slightly below z = 0 so the foot's underside is inside it
    float ta = (-0.01 - ro.z) / rd.z;
    float tb = (ztop - ro.z) / rd.z;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  }
  float A = rd.x * rd.x + rd.y * rd.y;
  float B = ro.x * rd.x + ro.y * rd.y;
  float Cc = ro.x * ro.x + ro.y * ro.y - R * R;
  if (A < 1e-14) {
    if (Cc > 0.0) return false;
  } else {
    float disc = B * B - A * Cc;
    if (disc < 0.0) return false;
    float sq = sqrt(disc);
    t0 = max(t0, (-B - sq) / A);
    t1 = min(t1, (-B + sq) / A);
  }
  if (t0 >= t1) return false;

  // re-origin at the bounding-volume entry for precision
  float tOff = t0;
  vec3 o = ro + tOff * rd;
  float tEnd = t1 - tOff;
  float tLo = (tOff > tmin) ? -1e-6 : 0.0;

  // which air region does the ray start in? (cavity vs exterior)
  int j = zoneIndexAt(clamp(o.z, 0.0, ztop));
  bool inCav = false;
  if (!inGlass) {
    int jc = j;
    vec4 Zc = uZone[jc * 4];
    int flc = int(Zc.z);
    if ((flc & ZF_CAV) != 0) {
      inCav = (o.x * o.x + o.y * o.y) < quadAt(uZone[jc * 4 + 3], o.z - Zc.x);
    } else if ((flc & ZF_LIP) != 0) {
      inCav = sqrt(o.x * o.x + o.y * o.y) < uLip.y;
    }
  }

  int nz = int(uGlass.x);
  int dir = (rd.z >= 0.0) ? 1 : -1;
  float tBest = tEnd;
  vec3 nBest = vec3(0.0, 0.0, 1.0);
  int sBest = SID_NONE;
  for (int it = 0; it < 64; it++) {
    if (j < 0 || j >= nz) break;
    vec4 Z = uZone[j * 4];
    float ta = tLo;
    float tb = tEnd;
    if (abs(rd.z) >= 1e-12) {
      float q0 = (Z.x - o.z) / rd.z;
      float q1 = (Z.y - o.z) / rd.z;
      ta = min(q0, q1) - 1e-5;
      tb = max(q0, q1) + 1e-5;
    }
    if (ta > tBest) break;
    float lo = max(ta, tLo);
    float hi = min(tb, tBest);
    if (lo < hi) {
      float tz = hi;
      vec3 nz3 = vec3(0.0, 0.0, 1.0);
      int sz = SID_NONE;
      zoneHit(j, o, rd, lo, tz, nz3, sz, inGlass, inCav);
      if (sz != SID_NONE) {
        tBest = tz;
        nBest = nz3;
        sBest = sz;
        break;
      }
    }
    if (abs(rd.z) < 1e-12) break;
    j += dir;
  }
  if (sBest == SID_NONE) return false;
  tHit = tBest + tOff;
  nHit = nBest;
  sHit = sBest;
  return true;
}

// Does the crystal interrupt the segment o -> o + tmax d ? (works from inside too)
bool glassBlocks(vec3 o, vec3 d, float tmax) {
  float t;
  vec3 n;
  int sid;
  return glassHit(o, d, 0.0, tmax, glassInside(o), t, n, sid);
}

// ---------------------------------------------------------------------------
// Dielectric interface
float fresnelDielectric(float cosI, float eta) {
  // eta = n_transmitted / n_incident, cosI in [0,1]
  float sin2T = (1.0 - cosI * cosI) / (eta * eta);
  if (sin2T >= 1.0) return 1.0;
  float cosT = sqrt(1.0 - sin2T);
  float rs = (cosI - eta * cosT) / (cosI + eta * cosT);
  float rp = (eta * cosI - cosT) / (eta * cosI + cosT);
  return 0.5 * (rs * rs + rp * rp);
}
// refraction of unit d through a surface with normal nf facing the incident side
vec3 refractDir(vec3 d, vec3 nf, float eta) {
  float cosI = -dot(d, nf);
  float sin2T = (1.0 - cosI * cosI) / (eta * eta);
  float cosT = sqrt(max(1.0 - sin2T, 0.0));
  return normalize(d / eta + (cosI / eta - cosT) * nf);
}

// ---------------------------------------------------------------------------
// The light: a small sphere of uniform radiance.
float lightHit(vec3 o, vec3 d) {
  vec3 oc = o - vec3(uLight.x, uLight.y, uLight.z);
  float b = dot(oc, d);
  float c = dot(oc, oc) - uLight.w * uLight.w;
  float disc = b * b - c;
  if (disc < 0.0) return BIG_F;
  float t = -b - sqrt(disc);
  return (t > 0.0) ? t : BIG_F;
}
// unoccluded irradiance on the floor from the sphere (exact while it is above the horizon)
float directUnoccluded(vec3 x) {
  vec3 L = vec3(uLight.x, uLight.y, uLight.z) - x;
  float d2 = dot(L, L);
  float cosT = L.z / sqrt(d2);
  return PI_F * uLightE.x * uLight.w * uLight.w / d2 * max(cosT, 0.0);
}
// direction toward a point of the sphere, uniform in its solid angle seen from x
vec3 sampleLightCone(vec3 x, float u1, float u2, OUT(float) omega, OUT(float) dist) {
  vec3 L = vec3(uLight.x, uLight.y, uLight.z) - x;
  float D = length(L);
  vec3 w = L / D;
  float sinMax = min(uLight.w / D, 0.999999);
  float cosMax = sqrt(1.0 - sinMax * sinMax);
  omega = 2.0 * PI_F * (1.0 - cosMax);
  float cosT = 1.0 - u1 * (1.0 - cosMax);
  float sinT = sqrt(max(1.0 - cosT * cosT, 0.0));
  float ph = 2.0 * PI_F * u2;
  vec3 a = (abs(w.x) > 0.6) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 b1 = normalize(cross(a, w));
  vec3 b2 = cross(w, b1);
  vec3 dir = normalize(b1 * (cos(ph) * sinT) + b2 * (sin(ph) * sinT) + w * cosT);
  // distance to the near intersection with the sphere
  float bq = dot(-L, dir);
  float cq = dot(L, L) - uLight.w * uLight.w;
  float disc = max(bq * bq - cq, 0.0);
  dist = -bq - sqrt(disc);
  return dir;
}

// Conservative pre-test: may the cone from p to the light sphere meet the
// crystal's bounding cylinder? (points that fail it see the whole source)
bool lightConeMayHitGlass(vec3 p) {
  vec3 C = vec3(uLight.x, uLight.y, uLight.z);
  vec3 d = C - p;
  float len = length(d);
  d = d / len;
  float R = uGlass.y + uLight.w + 0.5;
  float top = uGlass.z + uLight.w + 0.5;
  float t0 = 0.0;
  float t1 = len;
  if (abs(d.z) > 1e-9) {
    float ta = (-0.5 - p.z) / d.z;
    float tb = (top - p.z) / d.z;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  }
  float A = d.x * d.x + d.y * d.y;
  float B = p.x * d.x + p.y * d.y;
  float Cc = p.x * p.x + p.y * p.y - R * R;
  if (A < 1e-12) return Cc <= 0.0 && t0 < t1;
  float disc = B * B - A * Cc;
  if (disc < 0.0) return false;
  float sq = sqrt(disc);
  t0 = max(t0, (-B - sq) / A);
  t1 = min(t1, (-B + sq) / A);
  return t0 < t1;
}

// ---------------------------------------------------------------------------
// Environment: a quiet, dark room with a dim overhead fill (restrained ambient).
float envRadiance(vec3 d) {
  float up = max(d.z, 0.0);
  if (uLightE.w > 0.5) {
    // reference "studio" used only for the neutral product view: bright sweep
    // behind the glass, soft top, dark flags left and right, grey front
    float L = 1.0 + 0.25 * smoothstep(0.6, 0.95, d.z);
    float flag = smoothstep(0.36, 0.44, abs(d.x)) * (1.0 - smoothstep(0.55, 0.75, d.z));
    L = mix(L, 0.03, flag);
    L = mix(L, 0.3, smoothstep(-0.15, -0.4, d.y) * (1.0 - flag));
    return uLightE.y * L;
  }
  return uLightE.y * (0.35 + uLightE.z * up * up);
}

// Fraction of the ambient fill that reaches surface point o: directions are
// weighted by the room's radiance; the crystal passes uOptic.w of what it covers.
float fillOcclusion(vec3 o, int n) {
  float blocked = 0.0;
  float wsum = 0.0;
  for (int k = 0; k < 256; k++) {
    if (k >= n) break;
    float u1 = rseq2(uint(k), 0);
    float u2 = rseq2(uint(k), 1);
    float ct = sqrt(1.0 - u1);
    float st = sqrt(u1);
    float ph = 6.2831853 * u2;
    vec3 dir = vec3(cos(ph) * st, sin(ph) * st, ct);
    float w = envRadiance(dir);
    wsum += w;
    if (glassBlocks(o, dir, 1e4)) blocked += w;
  }
  return 1.0 - (1.0 - uOptic.w) * blocked / max(wsum, 1e-9);
}

// ---------------------------------------------------------------------------
// Forward light transport: one photon from the source through the crystal.
// Returns true and the landing point on the receiving surface if the photon
// touched the glass at least once (light that never touches the glass is the
// separately computed direct term). Reflection vs transmission is chosen by the
// Fresnel probability, so every surviving photon carries the same flux.
bool tracePhoton(vec3 o, vec3 d, float lambdaNm, uint seed, OUT(vec3) landing) {
  landing = vec3(0.0);
  float n = iorAt(lambdaNm);
  bool touched = false;
  bool inGlass = false;
  for (int b = 0; b < 32; b++) {
    float t;
    vec3 nrm;
    int sid;
    if (!glassHit(o, d, 1e-4, BIG_F, inGlass, t, nrm, sid)) {
      if (!touched || inGlass) return false;
      if (d.z >= 0.0) return false;
      float tf = -o.z / d.z;
      landing = o + tf * d;
      return true;
    }
    touched = true;
    vec3 p = o + t * d;
    bool entering = dot(d, nrm) < 0.0;
    vec3 nf = entering ? nrm : -nrm;
    float eta = entering ? n : 1.0 / n;
    float cosI = -dot(d, nf);
    float F = fresnelDielectric(cosI, eta);
    float u = rand2(seed, uint(b) * 2654435761u + 17u);
    if (u < F) {
      d = normalize(reflect(d, nf));
    } else {
      d = refractDir(d, nf, eta);
      inGlass = !inGlass;
      if (sid == SID_BOTTOM && !inGlass) {
        // leaving through the polished foot: it rests on the surface
        landing = vec3(p.x, p.y, 0.0);
        return true;
      }
    }
    o = p;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Camera transport. Leaves of the reflection/refraction tree end on the light,
// the receiving surface (lit by the irradiance field computed above) or the room.
vec3 floorIrradiance(vec2 xy);

vec3 surfaceRadianceRGB(vec2 xy) { return uOptic.z / PI_F * floorIrradiance(xy); }

// Glints. A camera path that leaves the crystal and meets the source carries the
// source's own radiance, some 10^5 times that of the lit surface. Most of these
// images of the source are far smaller than a pixel: a pixel's samples find them
// only now and then, so they show as isolated saturated specks that flash on and
// off as the light moves. Their throughput is capped at GLINT_MAX of the source's
// radiance (one and a half times display white at the piece's fixed exposure): a
// glint that covers most of a pixel still reads as white, sub-pixel ones fade.
// This touches only the image of the crystal; the light on the surface is
// computed separately and is not affected.
const float GLINT_MAX = 2.3e-5;
float glint(float w) { return min(w, GLINT_MAX) * uLightE.x; }

// spectral radiance at lambda, times the path weight w, of whatever a path that
// has left the crystal reaches first
float leafRadiance(vec3 o, vec3 d, float lambdaNm, float w) {
  float tl = lightHit(o, d);
  float tf = (d.z < 0.0) ? -o.z / d.z : BIG_F;
  if (tl < tf) return glint(w);
  if (tf < BIG_F) {
    vec3 p = o + tf * d;
    return w * rgbToSpectral(surfaceRadianceRGB(vec2(p.x, p.y)), lambdaNm);
  }
  return w * envRadiance(d);
}

vec3 leafRadianceRGB(vec3 o, vec3 d) {
  float tl = lightHit(o, d);
  float tf = (d.z < 0.0) ? -o.z / d.z : BIG_F;
  if (tl < tf) return vec3(uLightE.x);
  if (tf < BIG_F) {
    vec3 p = o + tf * d;
    return surfaceRadianceRGB(vec2(p.x, p.y));
  }
  return vec3(envRadiance(d));
}

// Full camera sample. Splits at every interface (deterministic Fresnel weights),
// Russian roulette only for very weak branches. Returns RGB radiance.
vec3 traceCamera(vec3 ro, vec3 rd, float lambdaNm, uint seed) {
  float tg;
  vec3 ng;
  int sg;
  bool hit = glassHit(ro, rd, 0.0, BIG_F, false, tg, ng, sg);
  if (!hit || lightHit(ro, rd) < tg) return leafRadianceRGB(ro, rd);

  float n = iorAt(lambdaNm);
  vec3 stO[16];
  vec3 stD[16];
  float stW[16];
  int stDepth[16];
  bool stIn[16];
  int sp = 0;
  float L = 0.0;
  vec3 o = ro;
  vec3 d = rd;
  float w = 1.0;
  int depth = 0;
  bool inGlass = false;
  bool alive = true;
  for (int iter = 0; iter < 96; iter++) {
    if (!alive) {
      if (sp == 0) break;
      sp--;
      o = stO[sp];
      d = stD[sp];
      w = stW[sp];
      depth = stDepth[sp];
      inGlass = stIn[sp];
      alive = true;
    }
    float t;
    vec3 nrm;
    int sid;
    bool g = glassHit(o, d, (depth == 0) ? 0.0 : 1e-4, BIG_F, inGlass, t, nrm, sid);
    if (!g) {
      if (inGlass) {
        alive = false;  // numerical leak; drop
        continue;
      }
      L += leafRadiance(o, d, lambdaNm, w);
      alive = false;
      continue;
    }
    if (!inGlass && lightHit(o, d) < t) {
      L += glint(w);
      alive = false;
      continue;
    }
    vec3 p = o + t * d;
    bool entering = dot(d, nrm) < 0.0;
    vec3 nf = entering ? nrm : -nrm;
    float eta = entering ? n : 1.0 / n;
    float cosI = -dot(d, nf);
    float F = fresnelDielectric(cosI, eta);
    vec3 dr = normalize(reflect(d, nf));
    if (depth >= 14) {
      // terminate long chains by Russian roulette on the dominant branch
      alive = false;
      continue;
    }
    if (F >= 1.0) {
      o = p;
      d = dr;
      depth++;
      continue;
    }
    vec3 dt = refractDir(d, nf, eta);
    float wr = w * F;
    float wt = w * (1.0 - F);
    // transmitted branch out of the foot lands on the surface directly beneath it
    bool tLand = (sid == SID_BOTTOM && !entering);
    // weak-branch roulette (unbiased; keeps the tree small)
    float thr = 0.02;
    if (wr < thr) {
      float u = rand2(seed, uint(iter) * 747796405u + 1u);
      wr = (u < wr / thr) ? thr : 0.0;
    }
    if (wr > 0.0 && sp < 16) {
      stO[sp] = p;
      stD[sp] = dr;
      stW[sp] = wr;
      stDepth[sp] = depth + 1;
      stIn[sp] = inGlass;
      sp++;
    }
    if (tLand) {
      L += wt * rgbToSpectral(surfaceRadianceRGB(vec2(p.x, p.y)), lambdaNm);
      alive = false;
      continue;
    }
    if (wt < thr) {
      float u = rand2(seed, uint(iter) * 2891336453u + 7u);
      wt = (u < wt / thr) ? thr : 0.0;
    }
    if (wt <= 0.0) {
      alive = false;
      continue;
    }
    o = p;
    d = dt;
    w = wt;
    inGlass = !inGlass;
    depth++;
  }
  return L * channelWeights(lambdaNm);
}
