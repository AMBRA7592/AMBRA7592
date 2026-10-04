// Minimal GLSL ES 3.00 compatibility layer so that src/optics.glsl compiles as C++.
// Only the subset used by the shared optical core is implemented.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstring>
#include <type_traits>

namespace glsl {

typedef uint32_t uint;

struct vec2 {
  float x, y;
  vec2() : x(0), y(0) {}
  explicit vec2(float s) : x(s), y(s) {}
  vec2(float a, float b) : x(a), y(b) {}
};
struct vec3 {
  float x, y, z;
  vec3() : x(0), y(0), z(0) {}
  explicit vec3(float s) : x(s), y(s), z(s) {}
  vec3(float a, float b, float c) : x(a), y(b), z(c) {}
  vec3(vec2 a, float c) : x(a.x), y(a.y), z(c) {}
};
struct vec4 {
  float x, y, z, w;
  vec4() : x(0), y(0), z(0), w(0) {}
  explicit vec4(float s) : x(s), y(s), z(s), w(s) {}
  vec4(float a, float b, float c, float d) : x(a), y(b), z(c), w(d) {}
  vec4(vec3 a, float d) : x(a.x), y(a.y), z(a.z), w(d) {}
};

#define GLSL_V2OP(op)                                                                 \
  inline vec2 operator op(vec2 a, vec2 b) { return vec2(a.x op b.x, a.y op b.y); }   \
  inline vec2 operator op(vec2 a, float b) { return vec2(a.x op b, a.y op b); }      \
  inline vec2 operator op(float a, vec2 b) { return vec2(a op b.x, a op b.y); }      \
  inline vec2 &operator op##=(vec2 &a, vec2 b) { a = a op b; return a; }             \
  inline vec2 &operator op##=(vec2 &a, float b) { a = a op b; return a; }
#define GLSL_V3OP(op)                                                                         \
  inline vec3 operator op(vec3 a, vec3 b) { return vec3(a.x op b.x, a.y op b.y, a.z op b.z); } \
  inline vec3 operator op(vec3 a, float b) { return vec3(a.x op b, a.y op b, a.z op b); }      \
  inline vec3 operator op(float a, vec3 b) { return vec3(a op b.x, a op b.y, a op b.z); }      \
  inline vec3 &operator op##=(vec3 &a, vec3 b) { a = a op b; return a; }                       \
  inline vec3 &operator op##=(vec3 &a, float b) { a = a op b; return a; }
#define GLSL_V4OP(op)                                                                                       \
  inline vec4 operator op(vec4 a, vec4 b) { return vec4(a.x op b.x, a.y op b.y, a.z op b.z, a.w op b.w); } \
  inline vec4 operator op(vec4 a, float b) { return vec4(a.x op b, a.y op b, a.z op b, a.w op b); }        \
  inline vec4 operator op(float a, vec4 b) { return vec4(a op b.x, a op b.y, a op b.z, a op b.w); }        \
  inline vec4 &operator op##=(vec4 &a, vec4 b) { a = a op b; return a; }                                   \
  inline vec4 &operator op##=(vec4 &a, float b) { a = a op b; return a; }
GLSL_V2OP(+) GLSL_V2OP(-) GLSL_V2OP(*) GLSL_V2OP(/)
GLSL_V3OP(+) GLSL_V3OP(-) GLSL_V3OP(*) GLSL_V3OP(/)
GLSL_V4OP(+) GLSL_V4OP(-) GLSL_V4OP(*) GLSL_V4OP(/)
inline vec2 operator-(vec2 a) { return vec2(-a.x, -a.y); }
inline vec3 operator-(vec3 a) { return vec3(-a.x, -a.y, -a.z); }
inline vec4 operator-(vec4 a) { return vec4(-a.x, -a.y, -a.z, -a.w); }

inline float dot(vec2 a, vec2 b) { return a.x * b.x + a.y * b.y; }
inline float dot(vec3 a, vec3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline float dot(vec4 a, vec4 b) { return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w; }
inline vec3 cross(vec3 a, vec3 b) { return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
inline float sqrt(float x) { return std::sqrt(x); }
inline float inversesqrt(float x) { return 1.0f / std::sqrt(x); }
inline float length(vec2 a) { return std::sqrt(dot(a, a)); }
inline float length(vec3 a) { return std::sqrt(dot(a, a)); }
inline vec2 normalize(vec2 a) { return a * (1.0f / length(a)); }
inline vec3 normalize(vec3 a) { return a * (1.0f / length(a)); }
inline float abs(float a) { return std::fabs(a); }
inline int abs(int a) { return a < 0 ? -a : a; }
inline float sign(float a) { return a > 0.0f ? 1.0f : (a < 0.0f ? -1.0f : 0.0f); }
inline float min(float a, float b) { return a < b ? a : b; }
inline float max(float a, float b) { return a > b ? a : b; }
inline int min(int a, int b) { return a < b ? a : b; }
inline int max(int a, int b) { return a > b ? a : b; }
inline uint min(uint a, uint b) { return a < b ? a : b; }
inline uint max(uint a, uint b) { return a > b ? a : b; }
inline vec3 min(vec3 a, vec3 b) { return vec3(min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)); }
inline vec3 max(vec3 a, vec3 b) { return vec3(max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)); }
inline vec3 max(vec3 a, float b) { return vec3(max(a.x, b), max(a.y, b), max(a.z, b)); }
inline vec3 min(vec3 a, float b) { return vec3(min(a.x, b), min(a.y, b), min(a.z, b)); }
// GLSL has no doubles; literals like 1.0 are doubles in C++, so mixed calls go here.
template <class A, class B>
using glsl_fp_mix = typename std::enable_if<std::is_arithmetic<A>::value && std::is_arithmetic<B>::value &&
                                                (std::is_floating_point<A>::value || std::is_floating_point<B>::value),
                                            float>::type;
template <class A, class B> inline glsl_fp_mix<A, B> max(A a, B b) { float x = (float)a, y = (float)b; return x > y ? x : y; }
template <class A, class B> inline glsl_fp_mix<A, B> min(A a, B b) { float x = (float)a, y = (float)b; return x < y ? x : y; }
inline float abs(double a) { return (float)std::fabs(a); }
inline float clamp(float x, float a, float b) { return min(max(x, a), b); }
inline vec3 clamp(vec3 x, float a, float b) { return vec3(clamp(x.x, a, b), clamp(x.y, a, b), clamp(x.z, a, b)); }
inline float mix(float a, float b, float t) { return a + (b - a) * t; }
inline vec3 mix(vec3 a, vec3 b, float t) { return a + (b - a) * t; }
inline vec3 mix(vec3 a, vec3 b, vec3 t) { return a + (b - a) * t; }
inline float step(float e, float x) { return x < e ? 0.0f : 1.0f; }
inline float smoothstep(float e0, float e1, float x) {
  float t = clamp((x - e0) / (e1 - e0), 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}
inline float floor(float x) { return std::floor(x); }
inline float ceil(float x) { return std::ceil(x); }
inline float fract(float x) { return x - std::floor(x); }
inline float mod(float x, float y) { return x - y * std::floor(x / y); }
inline float pow(float a, float b) { return std::pow(a, b); }
inline vec3 pow(vec3 a, vec3 b) { return vec3(std::pow(a.x, b.x), std::pow(a.y, b.y), std::pow(a.z, b.z)); }
inline float exp(float a) { return std::exp(a); }
inline vec3 exp(vec3 a) { return vec3(std::exp(a.x), std::exp(a.y), std::exp(a.z)); }
inline float exp2(float a) { return std::exp2(a); }
inline float log(float a) { return std::log(a); }
inline float log2(float a) { return std::log2(a); }
inline float sin(float a) { return std::sin(a); }
inline float cos(float a) { return std::cos(a); }
inline float tan(float a) { return std::tan(a); }
inline float asin(float a) { return std::asin(a); }
inline float acos(float a) { return std::acos(a); }
inline float atan(float y, float x) { return std::atan2(y, x); }
inline float atan(float a) { return std::atan(a); }
inline vec3 reflect(vec3 i, vec3 n) { return i - 2.0f * dot(n, i) * n; }
inline uint floatBitsToUint(float f) { uint u; std::memcpy(&u, &f, 4); return u; }
inline float uintBitsToFloat(uint u) { float f; std::memcpy(&f, &u, 4); return f; }

}  // namespace glsl

// Parameter qualifiers used by the shared source.
#define OUT(T) T &
#define INOUT(T) T &
