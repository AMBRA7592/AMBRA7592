// THE SECOND FORM — native renderer for stills and film frames.
//
// It compiles the shared optical core (src/optics.glsl) as C++ so the film uses
// exactly the geometry, material, light, photon tracer and camera tracer that the
// browser experience runs in WebGL2. This file only adds what a CPU needs around
// that core: thread scheduling, the receiving-surface irradiance maps (direct term
// with soft shadows + photon density estimate), adaptive pixel sampling and output.
//
// Usage:  render <job.cfg>      (job files are written by tools/job.mjs)

#include "glsl.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <functional>
#include <map>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace glsl {
vec4 uZone[320];
vec4 uGlass, uLip, uFacet, uOptic, uLight, uLightE;
#include "../src/optics.glsl"
#include "../src/tonemap.glsl"
}  // namespace glsl

using namespace glsl;

// ---------------------------------------------------------------------------
static int gThreads = 4;
static void parallelFor(int n, int chunk, const std::function<void(int, int)> &fn) {
  std::atomic<int> next(0);
  std::vector<std::thread> th;
  for (int t = 0; t < gThreads; t++) {
    th.emplace_back([&, t]() {
      for (;;) {
        int b = next.fetch_add(chunk);
        if (b >= n) break;
        int e = std::min(n, b + chunk);
        for (int i = b; i < e; i++) fn(i, t);
      }
    });
  }
  for (auto &x : th) x.join();
}
static double nowSec() {
  using namespace std::chrono;
  return duration<double>(steady_clock::now().time_since_epoch()).count();
}

// ---------------------------------------------------------------------------
// Irradiance map on the receiving surface (3 floats per texel, W/mm^2 units of
// the light's radiance scale).
struct Map2D {
  float x0 = 0, y0 = 0, x1 = 0, y1 = 0, texel = 1;
  int W = 0, H = 0;
  std::vector<float> d;
  void setup(float ax0, float ay0, float ax1, float ay1, float tx) {
    texel = tx;
    W = std::max(2, (int)std::ceil((ax1 - ax0) / tx));
    H = std::max(2, (int)std::ceil((ay1 - ay0) / tx));
    x0 = ax0;
    y0 = ay0;
    x1 = x0 + W * tx;
    y1 = y0 + H * tx;
    d.assign((size_t)W * H * 3, 0.0f);
  }
  bool valid() const { return W > 0 && !d.empty(); }
  bool inside(float x, float y) const { return valid() && x >= x0 && x < x1 && y >= y0 && y < y1; }
  // texel centres at x0 + (i + 0.5) * texel
  vec3 sample(float x, float y) const {
    float fx = (x - x0) / texel - 0.5f, fy = (y - y0) / texel - 0.5f;
    int ix = (int)std::floor(fx), iy = (int)std::floor(fy);
    float ax = fx - ix, ay = fy - iy;
    auto at = [&](int i, int j) {
      i = std::min(std::max(i, 0), W - 1);
      j = std::min(std::max(j, 0), H - 1);
      const float *p = &d[((size_t)j * W + i) * 3];
      return vec3(p[0], p[1], p[2]);
    };
    vec3 a = mix(at(ix, iy), at(ix + 1, iy), ax);
    vec3 b = mix(at(ix, iy + 1), at(ix + 1, iy + 1), ax);
    return mix(a, b, ay);
  }
  // weight of the map near its border (fades the edge so missing data is never a seam)
  float edgeFade(float x, float y) const {
    float m = std::min(std::min(x - x0, x1 - x), std::min(y - y0, y1 - y));
    return clamp(m / (8.0f * texel), 0.0f, 1.0f);
  }
};

static Map2D gDirect;   // direct (soft-shadowed) + ambient, crystal treated as occluder
static Map2D gCaustic;  // light that interacted with the crystal (photon density estimate)
static Map2D gDirectF;  // optional finer nested maps for close views
static Map2D gCausticF;
static float gAmbientE0 = 0;  // unoccluded ambient irradiance

namespace glsl {
vec3 floorIrradiance(vec2 xy) {
  vec3 E;
  float base = directUnoccluded(vec3(xy.x, xy.y, 0.0f)) + gAmbientE0;
  if (gDirect.inside(xy.x, xy.y)) {
    float f = gDirect.edgeFade(xy.x, xy.y);
    E = gDirect.sample(xy.x, xy.y) * f + vec3(base) * (1.0f - f);
  } else {
    E = vec3(base);
  }
  if (gDirectF.inside(xy.x, xy.y)) {
    float f = gDirectF.edgeFade(xy.x, xy.y);
    E = gDirectF.sample(xy.x, xy.y) * f + E * (1.0f - f);
  }
  vec3 C(0.0f);
  if (gCaustic.inside(xy.x, xy.y)) C = gCaustic.sample(xy.x, xy.y);
  if (gCausticF.inside(xy.x, xy.y)) {
    float f = gCausticF.edgeFade(xy.x, xy.y);
    C = gCausticF.sample(xy.x, xy.y) * f + C * (1.0f - f);
  }
  return E + C;
}
}  // namespace glsl

// ---------------------------------------------------------------------------
struct Job {
  std::map<std::string, std::vector<double>> v;
  std::map<std::string, std::string> s;
  double get(const std::string &k, int i = 0, double def = 0) const {
    auto it = v.find(k);
    if (it == v.end() || (int)it->second.size() <= i) return def;
    return it->second[i];
  }
  bool has(const std::string &k) const { return v.count(k) || s.count(k); }
};

static void parseLine(Job &job, const std::string &line) {
  std::istringstream is(line);
  std::string key;
  if (!(is >> key) || key[0] == '#') return;
  std::vector<double> vals;
  std::string tok;
  std::string str;
  while (is >> tok) {
    char *end = nullptr;
    double x = std::strtod(tok.c_str(), &end);
    if (end && *end == 0) vals.push_back(x);
    else str = tok;
  }
  if (!str.empty()) job.s[key] = str;
  if (!vals.empty() || str.empty()) job.v[key] = vals;
}

// ---------------------------------------------------------------------------
static void applyUniforms(const Job &J) {
  const auto &zt = J.v.at("zones");
  for (int i = 0; i < 320; i++)
    uZone[i] = vec4(zt[i * 4], zt[i * 4 + 1], zt[i * 4 + 2], zt[i * 4 + 3]);
  auto v4 = [&](const char *k) { return vec4(J.get(k, 0), J.get(k, 1), J.get(k, 2), J.get(k, 3)); };
  uGlass = v4("uGlass");
  uLip = v4("uLip");
  uFacet = v4("uFacet");
  uOptic = v4("uOptic");
  uLight = v4("uLight");
  uLightE = v4("uLightE");
  // ambient irradiance of the receiving surface: the environment radiance
  // integrated against cos(theta) over the upper hemisphere
  double E = 0;
  const int NT = 64, NP = 128;
  for (int i = 0; i < NT; i++) {
    double th = (i + 0.5) / NT * M_PI / 2;
    for (int k = 0; k < NP; k++) {
      double ph = (k + 0.5) / NP * 2 * M_PI;
      vec3 d((float)(std::sin(th) * std::cos(ph)), (float)(std::sin(th) * std::sin(ph)), (float)std::cos(th));
      E += envRadiance(d) * std::cos(th) * std::sin(th) * (M_PI / 2 / NT) * (2 * M_PI / NP);
    }
  }
  gAmbientE0 = (float)E;
}

// fraction of the light sphere visible from floor point p (fixed per-texel pattern)
static float lightVisibility(vec3 p, uint seed, int nProbe, int nFull) {
  vec3 o(p.x, p.y, 1e-3f);
  float r1 = u01(pcgHash(seed)), r2 = u01(pcgHash(seed ^ 0x68bc21ebu));
  auto vis = [&](int i) {
    float u1 = fract(rseq2((uint)i, 0) + r1), u2 = fract(rseq2((uint)i, 1) + r2);
    float omega, dist;
    vec3 dir = sampleLightCone(o, u1, u2, omega, dist);
    return glassBlocks(o, dir, dist) ? 0.0f : 1.0f;
  };
  float acc = 0;
  for (int i = 0; i < nProbe; i++) acc += vis(i);
  if (acc == 0 || acc == nProbe) return acc / nProbe;
  for (int i = nProbe; i < nFull; i++) acc += vis(i);
  return acc / nFull;
}

static void directPassInto(const Job &J, Map2D &gDirect, const char *key) {
  double t0 = nowSec();
  gDirect.setup(J.get(key, 0), J.get(key, 1), J.get(key, 2), J.get(key, 3), J.get(key, 4));
  int nProbe = (int)J.get("shadow", 0, 8), nFull = (int)J.get("shadow", 1, 64);
  // ambient occlusion on a coarse grid (crystal transmits uOptic.w of the ambient)
  float aoCell = (float)J.get("aocell", 0, 1.0);
  int AW = (int)std::ceil((gDirect.x1 - gDirect.x0) / aoCell) + 1;
  int AH = (int)std::ceil((gDirect.y1 - gDirect.y0) / aoCell) + 1;
  std::vector<float> ao((size_t)AW * AH, 1.0f);
  int nAO = (int)J.get("aosamples", 0, 48);
  parallelFor(AH, 1, [&](int j, int) {
    for (int i = 0; i < AW; i++) {
      float x = gDirect.x0 + i * aoCell, y = gDirect.y0 + j * aoCell;
      if (x * x + y * y > 260.0f * 260.0f) continue;
      if (uGlass.w < 0.5f) continue;
      ao[(size_t)j * AW + i] = fillOcclusion(vec3(x, y, 1e-3f), nAO);
    }
  });
  auto aoAt = [&](float x, float y) {
    float fx = (x - gDirect.x0) / aoCell, fy = (y - gDirect.y0) / aoCell;
    int ix = std::min(std::max((int)fx, 0), AW - 2), iy = std::min(std::max((int)fy, 0), AH - 2);
    float ax = clamp(fx - ix, 0.f, 1.f), ay = clamp(fy - iy, 0.f, 1.f);
    float a = ao[(size_t)iy * AW + ix] * (1 - ax) + ao[(size_t)iy * AW + ix + 1] * ax;
    float b = ao[(size_t)(iy + 1) * AW + ix] * (1 - ax) + ao[(size_t)(iy + 1) * AW + ix + 1] * ax;
    return a * (1 - ay) + b * ay;
  };
  std::atomic<long> nShadow(0);
  parallelFor(gDirect.H, 4, [&](int j, int) {
    long ns = 0;
    for (int i = 0; i < gDirect.W; i++) {
      float x = gDirect.x0 + (i + 0.5f) * gDirect.texel, y = gDirect.y0 + (j + 0.5f) * gDirect.texel;
      vec3 p(x, y, 0);
      float E0 = directUnoccluded(p);
      float V = 1.0f;
      if (E0 > 0 && uGlass.w > 0.5f && lightConeMayHitGlass(p)) {
        V = lightVisibility(p, pcgHash((uint)(i * 73856093) ^ (uint)(j * 19349663)), nProbe, nFull);
        ns++;
      }
      float E = E0 * V + gAmbientE0 * aoAt(x, y);
      float *q = &gDirect.d[((size_t)j * gDirect.W + i) * 3];
      q[0] = q[1] = q[2] = E;
    }
    nShadow += ns;
  });
  fprintf(stderr, "  direct[%s]: %dx%d texels (%.3f mm), %ld shadow-tested, %.1fs\n", key, gDirect.W, gDirect.H,
          gDirect.texel, nShadow.load(), nowSec() - t0);
}
static void directPass(const Job &J) {
  directPassInto(J, gDirect, "dmap");
  gDirectF = Map2D();
  if (J.has("dmap2")) directPassInto(J, gDirectF, "dmap2");
}

// ---------------------------------------------------------------------------
// Photon pass: emit from the light toward a window enclosing the crystal, trace
// with the shared core, estimate density with an adaptive kernel.
struct Landing {
  float x, y, lambda, flux;
};

static float splatInto(const Job &J, Map2D &M, std::vector<std::vector<Landing>> &perThread, float K, float hmin,
                       float hmax, float rhoRefIn) {

  // pilot density at map resolution: photon counts blurred with a Gaussian of
  // `pilot` texels; kernel radius per photon h = sqrt(K / (pi rho)) (Abramson)
  const int PW = M.W, PH = M.H;
  std::vector<float> pil((size_t)PW * PH, 0.0f), tmp((size_t)PW * PH, 0.0f);
  for (auto &v : perThread)
    for (auto &L : v) {
      if (!M.inside(L.x, L.y)) continue;
      int ix = std::min(PW - 1, std::max(0, (int)((L.x - M.x0) / M.texel)));
      int iy = std::min(PH - 1, std::max(0, (int)((L.y - M.y0) / M.texel)));
      pil[(size_t)iy * PW + ix] += 1.0f;
    }
  {
    // pilot blur given in millimetres so nested maps estimate the same density
    float sig = std::max(1.0f, (float)J.get("pilot", 0, 0.375) / M.texel);
    int rad = (int)std::ceil(3 * sig);
    std::vector<float> g(2 * rad + 1);
    float gs = 0;
    for (int k = -rad; k <= rad; k++) gs += g[k + rad] = std::exp(-0.5f * k * k / (sig * sig));
    for (auto &x : g) x /= gs;
    parallelFor(PH, 8, [&](int j, int) {
      for (int i = 0; i < PW; i++) {
        float a = 0;
        for (int k = -rad; k <= rad; k++) {
          int ii = std::min(PW - 1, std::max(0, i + k));
          a += g[k + rad] * pil[(size_t)j * PW + ii];
        }
        tmp[(size_t)j * PW + i] = a;
      }
    });
    parallelFor(PH, 8, [&](int j, int) {
      for (int i = 0; i < PW; i++) {
        float a = 0;
        for (int k = -rad; k <= rad; k++) {
          int jj = std::min(PH - 1, std::max(0, j + k));
          a += g[k + rad] * tmp[(size_t)jj * PW + i];
        }
        pil[(size_t)j * PW + i] = a / (M.texel * M.texel);
      }
    });
  }
  // reference density: median pilot density over landed photons
  float rhoRef = 1.0f;
  {
    std::vector<float> samp;
    for (auto &v : perThread)
      for (size_t k = 0; k < v.size(); k += 97) {
        if (!M.inside(v[k].x, v[k].y)) continue;
        int ix = std::min(PW - 1, std::max(0, (int)((v[k].x - M.x0) / M.texel)));
        int iy = std::min(PH - 1, std::max(0, (int)((v[k].y - M.y0) / M.texel)));
        samp.push_back(pil[(size_t)iy * PW + ix]);
      }
    if (!samp.empty()) {
      std::nth_element(samp.begin(), samp.begin() + samp.size() / 2, samp.end());
      rhoRef = std::max(samp[samp.size() / 2], 1e-6f);
    }
    if (rhoRefIn > 0) rhoRef = rhoRefIn;
  }
  // photons per kernel N(rho) = K (rhoRef / rho)^beta : smoother where the light is
  // thin, sharper where it is concentrated (beta = 0 is Abramson's square-root law)
  float beta = (float)J.get("photons", 4, 0.4);
  auto kernelH = [&](float x, float y) {
    int ix = std::min(PW - 1, std::max(0, (int)((x - M.x0) / M.texel)));
    int iy = std::min(PH - 1, std::max(0, (int)((y - M.y0) / M.texel)));
    float rho = std::max(pil[(size_t)iy * PW + ix], 1e-6f);
    float Nk = K * std::pow(rhoRef / rho, beta);
    return clamp(std::sqrt(Nk / (3.14159265f * rho)), hmin, hmax);
  };
  // bucket photons by row bands, splat with an Epanechnikov kernel of adaptive radius
  int nb = gThreads * 8;
  float bandH = (M.y1 - M.y0) / nb;
  std::vector<std::vector<const Landing *>> buckets(nb);
  for (auto &v : perThread)
    for (auto &L : v) {
      if (L.x < M.x0 - hmax || L.x > M.x1 + hmax || L.y < M.y0 - hmax || L.y > M.y1 + hmax) continue;
      float h = kernelH(L.x, L.y);
      int b0 = std::max(0, (int)((L.y - h - M.y0) / bandH)), b1 = std::min(nb - 1, (int)((L.y + h - M.y0) / bandH));
      for (int b = b0; b <= b1; b++) buckets[b].push_back(&L);
    }
  float tx = M.texel, invA = 1.0f / (tx * tx);
  parallelFor(nb, 1, [&](int b, int) {
    int row0 = (int)std::floor(b * bandH / tx), row1 = std::min(M.H, (int)std::floor((b + 1) * bandH / tx));
    if (b == nb - 1) row1 = M.H;
    for (const Landing *L : buckets[b]) {
      float h = kernelH(L->x, L->y);
      float fx = (L->x - M.x0) / tx - 0.5f, fy = (L->y - M.y0) / tx - 0.5f;
      float hr = h / tx;
      int i0 = (int)std::ceil(fx - hr), i1 = (int)std::floor(fx + hr);
      int j0 = (int)std::ceil(fy - hr), j1 = (int)std::floor(fy + hr);
      // normalisation: exact discrete sum for small kernels, continuous integral
      // (pi h^2 / 2 in texel units) once the kernel spans several texels
      float wsum = 0;
      if (hr < 4.0f) {
        for (int j = j0; j <= j1; j++)
          for (int i = i0; i <= i1; i++) {
            float rx = (i - fx) / hr, ry = (j - fy) / hr, r2 = rx * rx + ry * ry;
            if (r2 < 1) wsum += 1 - r2;
          }
      } else {
        wsum = 1.5707963f * hr * hr;
      }
      vec3 rgb = channelWeights(L->lambda) * L->flux;
      if (wsum <= 0) {  // kernel smaller than a texel: deposit at the nearest texel
        int i = (int)std::floor(fx + 0.5f), j = (int)std::floor(fy + 0.5f);
        if (j >= row0 && j < row1 && i >= 0 && i < M.W && j >= 0) {
          float *q = &M.d[((size_t)j * M.W + i) * 3];
          q[0] += rgb.x * invA; q[1] += rgb.y * invA; q[2] += rgb.z * invA;
        }
        continue;
      }
      float sc = invA / wsum;
      for (int j = std::max(j0, row0); j <= std::min(j1, row1 - 1); j++) {
        if (j < 0) continue;
        for (int i = std::max(i0, 0); i <= std::min(i1, M.W - 1); i++) {
          float rx = (i - fx) / hr, ry = (j - fy) / hr, r2 = rx * rx + ry * ry;
          if (r2 >= 1) continue;
          float k = (1 - r2) * sc;
          float *q = &M.d[((size_t)j * M.W + i) * 3];
          q[0] += rgb.x * k; q[1] += rgb.y * k; q[2] += rgb.z * k;
        }
      }
    }
  });
  return rhoRef;
}

static void photonPass(const Job &J) {
  double t0 = nowSec();
  gCaustic.setup(J.get("cmap", 0), J.get("cmap", 1), J.get("cmap", 2), J.get("cmap", 3), J.get("cmap", 4));
  gCausticF = Map2D();
  if (J.has("cmap2")) gCausticF.setup(J.get("cmap2", 0), J.get("cmap2", 1), J.get("cmap2", 2), J.get("cmap2", 3), J.get("cmap2", 4));
  long N = (long)J.get("photons", 0, 1e6);
  if (uGlass.w < 0.5f || N <= 0) {
    fprintf(stderr, "  photons: skipped\n");
    return;
  }
  float K = (float)J.get("photons", 1, 400), hmin = (float)J.get("photons", 2, 0.1),
        hmax = (float)J.get("photons", 3, 2.0);
  // emission window: plane through the crystal's centre, normal toward the light,
  // covering the perspective projection of the bounding cylinder from the source
  vec3 C(uLight.x, uLight.y, uLight.z);
  vec3 G(0, 0, uGlass.z * 0.5f);
  vec3 w = normalize(G - C);
  vec3 a = (std::fabs(w.z) < 0.9f) ? vec3(0, 0, 1) : vec3(1, 0, 0);
  vec3 U = normalize(cross(a, w)), V = cross(w, U);
  float umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
  for (int k = 0; k < 128; k++) {
    float ph = 6.2831853f * (k % 64) / 64.0f;
    vec3 Q(uGlass.y * std::cos(ph), uGlass.y * std::sin(ph), (k < 64) ? 0.0f : uGlass.z);
    vec3 dq = Q - C;
    float s = dot(G - C, w) / dot(dq, w);
    vec3 X = C + dq * s - G;
    umin = std::min(umin, dot(X, U)); umax = std::max(umax, dot(X, U));
    vmin = std::min(vmin, dot(X, V)); vmax = std::max(vmax, dot(X, V));
  }
  float margin = 3.0f * uLight.w + 1.0f;
  umin -= margin; umax += margin; vmin -= margin; vmax += margin;
  float area = (umax - umin) * (vmax - vmin);

  // occupancy mask of the window: cells whose ray from the light centre meets the
  // crystal, dilated so every photon that can touch the glass is still traced
  const int MW = 160;
  std::vector<unsigned char> occ(MW * MW, 0), occD(MW * MW, 0);
  parallelFor(MW, 1, [&](int j, int) {
    for (int i = 0; i < MW; i++) {
      for (int sj = 0; sj < 3 && !occ[j * MW + i]; sj++)
        for (int si = 0; si < 3 && !occ[j * MW + i]; si++) {
          float uu = umin + (i + (si + 0.5f) / 3.0f) / MW * (umax - umin);
          float vv = vmin + (j + (sj + 0.5f) / 3.0f) / MW * (vmax - vmin);
          vec3 X = G + U * uu + V * vv;
          vec3 dd = normalize(X - C);
          float t; vec3 n; int sid;
          if (glassHit(C, dd, 0.0f, 1e30f, false, t, n, sid)) occ[j * MW + i] = 1;
        }
    }
  });
  int dil = 2;  // light-size spread at the glass is far below one cell
  for (int j = 0; j < MW; j++)
    for (int i = 0; i < MW; i++) {
      if (!occ[j * MW + i]) continue;
      for (int dj = -dil; dj <= dil; dj++)
        for (int di = -dil; di <= dil; di++) {
          int ii = i + di, jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < MW && jj < MW) occD[jj * MW + ii] = 1;
        }
    }
  long nOcc = 0;
  for (auto c : occD) nOcc += c;

  std::vector<std::vector<Landing>> perThread(gThreads);
  std::atomic<long> nTouched(0);
  const long CH = 4096;
  long nChunks = (N + CH - 1) / CH;
  parallelFor((int)nChunks, 1, [&](int c, int t) {
    auto &out = perThread[t];
    long b = c * CH, e = std::min(N, b + CH);
    long touched = 0;
    for (long i = b; i < e; i++) {
      uint ui = (uint)i;
      // window position and wavelength from one 3-D point: nearby photons span
      // the spectrum evenly; the light-surface sample is a separate padded pair
      vec3 a3 = sobol3(ui, 0x51a7u);
      vec2 b2 = sobol2(ui, 1u, 0x51a7u);
      float u1 = a3.x, u2 = a3.y, u3 = b2.x, u4 = b2.y, u5 = a3.z;
      if (!occD[std::min(MW - 1, (int)(u2 * MW)) * MW + std::min(MW - 1, (int)(u1 * MW))]) continue;
      vec3 xT = G + U * (umin + u1 * (umax - umin)) + V * (vmin + u2 * (vmax - vmin));
      float omega, dist;
      vec3 toL = sampleLightCone(xT, u3, u4, omega, dist);
      vec3 o = xT + toL * dist;
      vec3 d = -toL;
      float flux = uLightE.x * omega * std::fabs(dot(d, w)) * area / (float)N;
      float lambda = lambdaFromU(u5);
      vec3 land;
      if (tracePhoton(o, d, lambda, pcgHash(ui * 2u + 1u), land)) {
        touched++;
        if (gCaustic.inside(land.x, land.y) || gCausticF.inside(land.x, land.y)) out.push_back({land.x, land.y, lambda, flux});
      }
    }
    nTouched += touched;
  });
  size_t total = 0;
  for (auto &v : perThread) total += v.size();
  double tTrace = nowSec() - t0;
  float rhoRef = splatInto(J, gCaustic, perThread, K, hmin, hmax, -1.0f);
  if (gCausticF.valid()) splatInto(J, gCausticF, perThread, K, hmin, hmax, rhoRef);
  fprintf(stderr, "  photons: %ld emitted (window %.0f%% occupied), %ld touched crystal, %zu landed in map, trace %.1fs, splat %.1fs\n", N,
          100.0 * nOcc / (MW * MW), nTouched.load(), total, tTrace, nowSec() - t0 - tTrace);
}

// ---------------------------------------------------------------------------
struct Camera {
  vec3 pos, fwd, right, up;
  float tanHalf, aspect, aperture, focus;
};
static Camera makeCamera(const Job &J, int W, int H) {
  Camera c;
  c.pos = vec3(J.get("camera", 0), J.get("camera", 1), J.get("camera", 2));
  vec3 tgt(J.get("camera", 3), J.get("camera", 4), J.get("camera", 5));
  float fov = (float)J.get("camera", 6, 30);
  c.aperture = (float)J.get("camera", 7, 0);
  c.focus = (float)J.get("camera", 8, length(tgt - c.pos));
  float roll = (float)J.get("camera", 9, 0) * 3.14159265f / 180.0f;
  c.fwd = normalize(tgt - c.pos);
  vec3 r0 = normalize(cross(c.fwd, vec3(0, 0, 1)));
  vec3 u0 = cross(r0, c.fwd);
  c.right = r0 * std::cos(roll) + u0 * std::sin(roll);
  c.up = u0 * std::cos(roll) - r0 * std::sin(roll);
  c.tanHalf = std::tan(fov * 0.5f * 3.14159265f / 180.0f);
  c.aspect = (float)W / H;
  return c;
}
static void cameraRay(const Camera &c, int W, int H, float px, float py, float la, float lb, vec3 &o, vec3 &d) {
  float sx = (2.0f * px / W - 1.0f) * c.tanHalf * c.aspect;
  float sy = (1.0f - 2.0f * py / H) * c.tanHalf;
  d = normalize(c.fwd + c.right * sx + c.up * sy);
  o = c.pos;
  if (c.aperture > 0) {
    vec3 focusPt = c.pos + d * (c.focus / dot(d, c.fwd));
    float r = c.aperture * 0.5f * std::sqrt(la), ph = 6.2831853f * lb;
    o = c.pos + c.right * (r * std::cos(ph)) + c.up * (r * std::sin(ph));
    d = normalize(focusPt - o);
  }
}
static bool rayMeetsBound(vec3 o, vec3 d) {
  float R = uGlass.y + 0.5f, top = uGlass.z + 0.5f;
  float t0 = 0, t1 = 1e9f;
  if (std::fabs(d.z) > 1e-9f) {
    float ta = (-0.5f - o.z) / d.z, tb = (top - o.z) / d.z;
    t0 = std::max(t0, std::min(ta, tb));
    t1 = std::min(t1, std::max(ta, tb));
  }
  float A = d.x * d.x + d.y * d.y, B = o.x * d.x + o.y * d.y, Cc = o.x * o.x + o.y * o.y - R * R;
  if (A < 1e-12f) return Cc <= 0 && t0 < t1;
  float disc = B * B - A * Cc;
  if (disc < 0) return false;
  float sq = std::sqrt(disc);
  return std::max(t0, (-B - sq) / A) < std::min(t1, (-B + sq) / A);
}

// Debug only: opaque "clay" shading of the same crystal surfaces (first hit),
// used to inspect facet boundaries against the reference photograph.
static std::vector<float> renderClay(const Job &J, int W, int H) {
  Camera cam = makeCamera(J, W, H);
  std::vector<float> img((size_t)W * H * 3, 0.0f);
  vec3 l1 = normalize(vec3(-0.4f, -0.8f, 0.6f)), l2 = normalize(vec3(0.7f, -0.3f, 0.3f));
  parallelFor(H, 1, [&](int y, int) {
    for (int x = 0; x < W; x++) {
      vec3 acc(0);
      for (int s = 0; s < 16; s++) {
        vec3 o, d;
        cameraRay(cam, W, H, x + rseq2((uint)s, 0), y + rseq2((uint)s, 1), 0, 0, o, d);
        float t; vec3 n; int sid;
        if (glassHit(o, d, 0.0f, 1e30f, false, t, n, sid)) {
          float sh = 0.15f + 0.6f * max(dot(n, l1), 0.0f) + 0.35f * max(dot(n, l2), 0.0f);
          vec3 base = (sid == SID_FACET) ? vec3(0.85f, 0.88f, 0.95f) : (sid == SID_REV ? vec3(0.95f, 0.85f, 0.75f)
                     : (sid == SID_LIP ? vec3(0.9f, 0.7f, 0.7f) : vec3(0.8f)));
          acc += base * sh;
        } else {
          acc += vec3(0.08f);
        }
      }
      float *q = &img[((size_t)y * W + x) * 3];
      q[0] = acc.x / 16; q[1] = acc.y / 16; q[2] = acc.z / 16;
    }
  });
  return img;
}

static std::vector<float> renderCamera(const Job &J, int W, int H) {
  if (J.get("clay", 0, 0) > 0) return renderClay(J, W, H);
  double t0 = nowSec();
  Camera cam = makeCamera(J, W, H);
  int S0 = (int)J.get("spp", 0, 4), S1 = (int)J.get("spp", 1, 64);
  std::vector<float> img((size_t)W * H * 3, 0.0f);
  std::vector<unsigned char> glassPix((size_t)W * H, 0);
  bool lightInFrame = false;
  uint pixSeed = (uint)J.get("pixseed", 0, 0);
  auto shade = [&](int x, int y, int s0, int s1, vec3 &acc) {
    uint pix = (uint)(y * W + x);
    uint rot = pcgHash(pix * 9781u + 6271u + pixSeed * 0x9e3779b9u);
    float r0 = u01(rot), r1 = u01(pcgHash(rot)), r2 = u01(pcgHash(rot + 1u)), r3 = u01(pcgHash(rot + 2u)),
          r4 = u01(pcgHash(rot + 3u));
    bool g = false;
    for (int s = s0; s < s1; s++) {
      float jx = fract(rseq5((uint)s, 0) + r0), jy = fract(rseq5((uint)s, 1) + r1);
      float jl = fract(rseq5((uint)s, 2) + r2), ja = fract(rseq5((uint)s, 3) + r3), jb = fract(rseq5((uint)s, 4) + r4);
      vec3 o, d;
      cameraRay(cam, W, H, x + jx, y + jy, ja, jb, o, d);
      if (rayMeetsBound(o, d)) g = true;
      acc += traceCamera(o, d, lambdaFromU(jl), pcgHash(pix * 131u + (uint)s));
    }
    return g;
  };
  parallelFor(H, 1, [&](int y, int) {
    for (int x = 0; x < W; x++) {
      vec3 acc(0);
      bool g = shade(x, y, 0, S0, acc);
      glassPix[(size_t)y * W + x] = g ? 1 : 0;
      float *q = &img[((size_t)y * W + x) * 3];
      q[0] = acc.x; q[1] = acc.y; q[2] = acc.z;
    }
  });
  (void)lightInFrame;
  // dilate the crystal mask by one pixel, then refine those pixels
  std::vector<unsigned char> refine((size_t)W * H, 0);
  long nRef = 0;
  for (int y = 0; y < H; y++)
    for (int x = 0; x < W; x++) {
      bool g = false;
      for (int dy = -1; dy <= 1 && !g; dy++)
        for (int dx = -1; dx <= 1 && !g; dx++) {
          int xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && glassPix[(size_t)yy * W + xx]) g = true;
        }
      refine[(size_t)y * W + x] = g;
      nRef += g;
    }
  double t1 = nowSec();
  parallelFor(H, 1, [&](int y, int) {
    for (int x = 0; x < W; x++) {
      float *q = &img[((size_t)y * W + x) * 3];
      int n = S0;
      if (refine[(size_t)y * W + x]) {
        vec3 acc(q[0], q[1], q[2]);
        shade(x, y, S0, S0 + S1, acc);
        q[0] = acc.x; q[1] = acc.y; q[2] = acc.z;
        n = S0 + S1;
      }
      q[0] /= n; q[1] /= n; q[2] /= n;
    }
  });
  fprintf(stderr, "  camera: %dx%d, base %d spp %.1fs, %ld crystal px x %d spp %.1fs\n", W, H, S0, t1 - t0, nRef, S1,
          nowSec() - t1);
  return img;
}

// ---------------------------------------------------------------------------
static void writePFM(const std::string &path, const std::vector<float> &img, int W, int H) {
  FILE *f = fopen(path.c_str(), "wb");
  if (!f) { perror(path.c_str()); return; }
  fprintf(f, "PF\n%d %d\n-1.0\n", W, H);
  for (int y = H - 1; y >= 0; y--) fwrite(&img[(size_t)y * W * 3], 4, (size_t)W * 3, f);
  fclose(f);
}
static void writePPM16(const std::string &path, const std::vector<float> &img, int W, int H, float exposure) {
  FILE *f = fopen(path.c_str(), "wb");
  if (!f) { perror(path.c_str()); return; }
  fprintf(f, "P6\n%d %d\n65535\n", W, H);
  std::vector<unsigned char> row((size_t)W * 6);
  for (int y = 0; y < H; y++) {
    for (int x = 0; x < W; x++) {
      const float *p = &img[((size_t)y * W + x) * 3];
      vec3 c = toneMap(vec3(p[0], p[1], p[2]) * exposure);
      float ch[3] = {c.x, c.y, c.z};
      for (int k = 0; k < 3; k++) {
        // triangular dither of one 16-bit step keeps later 8/10-bit encodes band-free
        float dn = (u01(pcgHash((uint)(y * W + x) * 3u + (uint)k)) + u01(pcgHash((uint)(y * W + x) * 7u + (uint)k + 1u)) - 1.0f);
        int v = (int)std::lround(clamp(ch[k], 0.f, 1.f) * 65535.0f + dn);
        v = std::min(65535, std::max(0, v));
        row[x * 6 + k * 2] = (unsigned char)(v >> 8);
        row[x * 6 + k * 2 + 1] = (unsigned char)(v & 255);
      }
    }
    fwrite(row.data(), 1, row.size(), f);
  }
  fclose(f);
}
static void writeMapPFM(const std::string &path, const Map2D &m) {
  std::vector<float> img(m.d);
  // flip so that +y is up in the image
  std::vector<float> flip(img.size());
  for (int j = 0; j < m.H; j++)
    std::copy(&img[(size_t)j * m.W * 3], &img[(size_t)(j + 1) * m.W * 3], &flip[(size_t)(m.H - 1 - j) * m.W * 3]);
  writePFM(path, flip, m.W, m.H);
}

// ---------------------------------------------------------------------------
static std::string lightKey(const Job &J) {
  std::ostringstream os;
  for (const char *k : {"uLight", "uLightE", "uGlass", "dmap", "cmap", "dmap2", "cmap2", "photons", "shadow", "uFacet", "uOptic"}) {
    os << k;
    auto it = J.v.find(k);
    if (it != J.v.end())
      for (double x : it->second) os << ' ' << x;
    os << ';';
  }
  return os.str();
}
static std::string cameraKey(const Job &J) {
  std::ostringstream os;
  for (const char *k : {"camera", "image", "spp", "exposure"}) {
    os << k;
    auto it = J.v.find(k);
    if (it != J.v.end())
      for (double x : it->second) os << ' ' << x;
    os << ';';
  }
  return os.str();
}

// Debug only: classify photon outcomes for the energy audit.
static void photonAudit(const Job &J) {
  vec3 C(uLight.x, uLight.y, uLight.z);
  vec3 G(0, 0, uGlass.z * 0.5f);
  long N = (long)J.get("audit", 0, 200000);
  vec3 ww = normalize(G - C);
  vec3 aa = (std::fabs(ww.z) < 0.9f) ? vec3(0, 0, 1) : vec3(1, 0, 0);
  vec3 Uw = normalize(cross(aa, ww)), Vw = cross(ww, Uw);
  float umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
  for (int k = 0; k < 128; k++) {
    float ph = 6.2831853f * (k % 64) / 64.0f;
    vec3 Q(uGlass.y * std::cos(ph), uGlass.y * std::sin(ph), (k < 64) ? 0.0f : uGlass.z);
    vec3 dq = Q - C;
    float sc = dot(G - C, ww) / dot(dq, ww);
    vec3 X = C + dq * sc - G;
    umin = std::min(umin, dot(X, Uw)); umax = std::max(umax, dot(X, Uw));
    vmin = std::min(vmin, dot(X, Vw)); vmax = std::max(vmax, dot(X, Vw));
  }
  long cnt[8] = {0};
  const char *names[8] = {"miss", "landed", "up", "leak", "maxbounce", "bottom", "", ""};
  double fluxIn = 0, fluxLand = 0, fluxUp = 0, fluxLeak = 0;
  for (long i = 0; i < N; i++) {
    uint ui = (uint)i;
    // same emission as the photon pass: window facing the light, scrambled Sobol points
    vec3 a3 = sobol3(ui, 0x51a7u);
    vec2 b2 = sobol2(ui, 1u, 0x51a7u);
    vec3 xT = G + Uw * (umin + a3.x * (umax - umin)) + Vw * (vmin + a3.y * (vmax - vmin));
    float omega, dist;
    vec3 toL = sampleLightCone(xT, b2.x, b2.y, omega, dist);
    vec3 o = xT + toL * dist, d = -toL;
    float n = iorAt(lambdaFromU(a3.z));
    bool touched = false, inGlass = false;
    int outcome = -1, lastSid = 0, lastRefl = 0, firstSid = 0, nInter = 0;
    for (int b = 0; b < 32; b++) {
      float t; vec3 nrm; int sid;
      if (!glassHit(o, d, 1e-4f, 1e30f, inGlass, t, nrm, sid)) {
        if (!touched) outcome = 0;
        else if (inGlass) {
          outcome = 3;
          static int shown = 0;
          if (shown++ < 6) {
            int j = zoneIndexAt(clamp(o.z, 0.0f, uGlass.z));
            fprintf(stderr, "LEAK o=(%.4f %.4f %.4f) d=(%.4f %.4f %.4f) inside=%d zone=%d [%.2f %.2f] flags=%d rho=%.3f hex=%.3f\n",
                    o.x, o.y, o.z, d.x, d.y, d.z, (int)glassInside(o + d * 1e-3f), j, uZone[j*4].x, uZone[j*4].y,
                    (int)uZone[j*4].z, std::sqrt(o.x*o.x+o.y*o.y), hexCoord(o.x, o.y));
            // brute-force scan along the ray for the inside->outside transition
            float tt = 1e-3f; bool prev = glassInside(o + d * tt);
            for (int k = 1; k < 200000; k++) {
              float t2 = 1e-3f + k * 1e-3f; bool cur = glassInside(o + d * t2);
              if (cur != prev) { vec3 q = o + d * t2; int jq = zoneIndexAt(q.z);
                fprintf(stderr, "   true exit t=%.4f at (%.3f %.3f %.3f) zone %d flags %d\n", t2, q.x, q.y, q.z, jq, (int)uZone[jq*4].z); break; }
              prev = cur;
            }
          }
        }
        else if (d.z >= 0) outcome = 2;
        else outcome = 1;
        break;
      }
      touched = true;
      if (nInter == 0) firstSid = sid;
      nInter++;
      lastSid = sid;
      vec3 p = o + d * t;
      bool entering = dot(d, nrm) < 0;
      vec3 nf = entering ? nrm : -nrm;
      float eta = entering ? n : 1.0f / n;
      float F = fresnelDielectric(-dot(d, nf), eta);
      if (rand2(pcgHash(ui * 2u + 1u), (uint)b * 2654435761u + 17u) < F) { d = normalize(reflect(d, nf)); lastRefl = 1; }
      else {
        lastRefl = 0;
        d = refractDir(d, nf, eta);
        inGlass = !inGlass;
        if (sid == SID_BOTTOM && !inGlass) { outcome = 5; break; }
      }
      o = p;
    }
    if (outcome < 0) outcome = 4;
    cnt[outcome]++;
    static long upBy[8][2] = {{0}}, firstBy[8] = {0}, landFirst[8] = {0};
    if (outcome == 2) { upBy[lastSid][lastRefl]++; firstBy[firstSid]++; }
    if (outcome == 1) landFirst[firstSid]++;
    if (i == N - 1) {
      const char *sn[6] = {"none", "facet", "rev", "cav", "bottom", "lip"};
      for (int k = 1; k < 6; k++) fprintf(stderr, "  up via %-6s refl %6ld refr %6ld | up first-hit %6ld | landed first-hit %6ld\n", sn[k], upBy[k][1], upBy[k][0], firstBy[k], landFirst[k]);
    }
  }
  for (int k = 0; k < 6; k++) fprintf(stderr, "  %-10s %8ld (%.2f%% of touched)\n", names[k], cnt[k], 100.0 * cnt[k] / std::max(1L, N - cnt[0]));
  (void)fluxIn; (void)fluxLand; (void)fluxUp; (void)fluxLeak; (void)C; (void)G;
}

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: render job.cfg\n");
    return 1;
  }
  const char *th = getenv("THREADS");
  gThreads = th ? atoi(th) : (int)std::max(1u, std::thread::hardware_concurrency());
  std::ifstream in(argv[1]);
  std::string line;
  Job base;
  std::vector<std::vector<std::string>> frames;
  bool inFrames = false;
  while (std::getline(in, line)) {
    if (line.rfind("frame", 0) == 0) {
      inFrames = true;
      frames.emplace_back();
      frames.back().push_back(line);
      continue;
    }
    if (inFrames) frames.back().push_back(line);
    else parseLine(base, line);
  }
  if (frames.empty()) frames.push_back({"frame 0"});
  std::string lastLight, lastCam;
  std::vector<float> lastImg;
  for (auto &fr : frames) {
    Job J = base;
    for (size_t i = 1; i < fr.size(); i++) parseLine(J, fr[i]);
    std::string out = J.s.count("out") ? J.s["out"] : "out";
    int idx = 0;
    sscanf(fr[0].c_str(), "frame %d", &idx);
    char name[512];
    snprintf(name, sizeof name, out.c_str(), idx);
    std::string outName(name);
    // skip frames already on disk (resumable film renders)
    if (J.get("resume", 0, 0) > 0) {
      FILE *f = fopen((outName + ".ppm").c_str(), "rb");
      if (f) { fclose(f); fprintf(stderr, "frame %d exists, skipped\n", idx); lastLight.clear(); lastCam.clear(); continue; }
    }
    double t0 = nowSec();
    fprintf(stderr, "frame %d -> %s\n", idx, outName.c_str());
    applyUniforms(J);
    int W = (int)J.get("image", 0, 960), H = (int)J.get("image", 1, 540);
    if (J.get("audit", 0, 0) > 0) { photonAudit(J); continue; }
    std::string lk = lightKey(J), ck = cameraKey(J);
    bool lightSame = (lk == lastLight);
    if (!lightSame) {
      directPass(J);
      photonPass(J);
      if (J.get("dumpmaps", 0, 0) > 0) {
        writeMapPFM(outName + "_direct.pfm", gDirect);
        writeMapPFM(outName + "_caustic.pfm", gCaustic);
      }
    }
    std::vector<float> img;
    if (lightSame && ck == lastCam && !lastImg.empty()) {
      img = lastImg;
      fprintf(stderr, "  identical to previous frame\n");
    } else {
      img = renderCamera(J, W, H);
    }
    float exposure = (float)J.get("exposure", 0, 1.0);
    // write atomically so an interrupted render never leaves a truncated frame
    writePPM16(outName + ".ppm.part", img, W, H, exposure);
    std::rename((outName + ".ppm.part").c_str(), (outName + ".ppm").c_str());
    if (J.get("hdr", 0, 0) > 0) writePFM(outName + ".pfm", img, W, H);
    lastLight = lk;
    lastCam = ck;
    lastImg.swap(img);
    fprintf(stderr, "  frame total %.1fs\n", nowSec() - t0);
  }
  return 0;
}
