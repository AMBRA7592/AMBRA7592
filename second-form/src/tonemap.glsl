// THE SECOND FORM — shared display transform (browser and film use the same curve).
// Input: scene-linear RGB already multiplied by the fixed exposure.
// A gentle toe and a long shoulder keep the structure of bright caustics without
// hard clipping; very bright values desaturate toward white as film would.

float shoulder(float x) {
  // linear up to 0.6, then an exponential roll-off that reaches 1.0 asymptotically
  float k = 0.6;
  if (x <= k) return x;
  return k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k)));
}

float srgbEncode1(float c) {
  c = clamp(c, 0.0, 1.0);
  return (c <= 0.0031308) ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

vec3 toneMap(vec3 x) {
  x = max(x, vec3(0.0));
  float lum = 0.2126 * x.x + 0.7152 * x.y + 0.0722 * x.z;
  float lm = shoulder(lum);
  // compress by luminance, then let over-range channels bleed toward white
  vec3 c = (lum > 1e-6) ? x * (lm / lum) : x;
  float mx = max(c.x, max(c.y, c.z));
  if (mx > 1.0) {
    float t = clamp((mx - 1.0) / mx, 0.0, 1.0);
    c = mix(c / mx, vec3(1.0), t);
  }
  return vec3(srgbEncode1(c.x), srgbEncode1(c.y), srgbEncode1(c.z));
}
