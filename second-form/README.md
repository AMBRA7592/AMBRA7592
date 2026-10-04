# Baccarat — The Second Form

An independent creative study. One clear Harcourt 1841 glass (size M, 17 cl,
ref. 1201103) stands still on a pale surface. A single small white light moves
around it, and the light the crystal concentrates, divides and redirects forms a
second figure on the surface. Everything is computed: the glass is defined in code,
and the light on the surface is traced through it, photon by photon.

Not affiliated with or endorsed by Baccarat.

## What is here

| Path | What it is |
| --- | --- |
| `dist/the-second-form.html` | The self-contained experience. Open it in a desktop browser with WebGL2. It plays the 24-second sequence live, then lets you compose with the light. |
| `out/film/the-second-form-1080p.mp4` | The 24-second film, 1920×1080, 24 fps, H.264 8-bit, silent (a 10-bit master and the held frame as `poster.png` sit beside it). |
| `out/stills/still-arc.png` | The held arrangement (the decisive frame). |
| `out/stills/still-meridian.png`, `still-halo.png` | The two other arrangements, same glass, same camera. |
| `out/stills/product-view.png` | Neutral product view used to check the reconstruction. |
| `out/checks/` | Verification renders: glass removed, convergence, a fixed-camera light transition (sheet and clip), browser versus film renderer, and an opaque view of the geometry. |
| `NOTES.md` | Reference, method, assumptions and known limitations. |
| `reference/measurements.md` | What was measured from the photograph and the published data. |

## Source

| File | Role |
| --- | --- |
| `src/geometry.js` | The Harcourt in code: piecewise-quadratic profiles for the six flat-cut facets, the round blank, the cavity, the triple-tier knop and the bevelled hexagonal foot, compiled into a zone table. Also computes volume, capacity and mass. |
| `src/optics.glsl` | The shared optical core: exact ray/surface intersection, Fresnel reflection and refraction, dispersion, the light, the room, the photon tracer and the camera tracer. Compiled as GLSL ES 3.00 in the browser and as C++ for the film. |
| `src/tonemap.glsl` | The display transform used by both. |
| `src/scene.js`, `src/film.js` | Materials, light, camera rigs, the three light positions and the 24-second timeline. |
| `web/renderer.js`, `web/app.js`, `web/template.html` | The WebGL2 renderer and the experience. |
| `native/render.cpp`, `native/glsl.h` | CPU renderer for the film and stills (compiles `src/optics.glsl` through a small GLSL compatibility header). |
| `tools/` | Job writers for the film and stills, the HTML bundler, the encoder, and the scripts that assemble the verification sheets and capture the browser render. |

## Rebuild the experience

```sh
node tools/build.mjs            # writes dist/the-second-form.html and dist/artifact.html
```

Debug views stay outside the principal experience: append `#debug` to the URL to see
sample counts (and press `G` to remove the glass).

## Render the film and stills

Requirements: Node 18+, a C++17 compiler, Python 3 with NumPy and Pillow, ffmpeg with
libx264. Rendering is CPU-only; times below are for 4 cores.

```sh
g++ -O3 -march=native -std=c++17 -pthread native/render.cpp -o native/render

# film: 576 frames (about 4 hours); safe to stop and restart, finished frames are kept
node tools/film.mjs build/film.cfg build/frames
./native/render build/film.cfg
python3 tools/encode.py build/frames out/film

# quick preview of the whole sequence (480x270, every 4th frame, a few minutes)
node tools/film.mjs build/preview.cfg build/preview --preview --step 4
./native/render build/preview.cfg

# stills (about 4 minutes each)
node tools/stills.mjs out/stills presets
for f in meridian arc halo; do ./native/render out/stills/$f.cfg; done
node tools/stills.mjs out/stills product && ./native/render out/stills/product.cfg
python3 tools/png.py out/stills/*.ppm

# verification renders
node tools/stills.mjs out/checks removal && ./native/render out/checks/removal-with.cfg && ./native/render out/checks/removal-without.cfg
node tools/stills.mjs out/checks convergence && for f in out/checks/conv-*.cfg; do ./native/render $f; done
node tools/stills.mjs out/checks transition && ./native/render out/checks/transition.cfg
node tools/stills.mjs out/checks clay && ./native/render out/checks/clay.cfg
node tools/stills.mjs out/checks compare && ./native/render out/checks/compare.cfg

# the browser's converged image at the same size (needs Playwright; software WebGL is slow)
node tools/capture-browser.mjs out/checks/browser-640.png arc

python3 tools/checks.py out/checks out/checks/browser-640.png --film build/frames
```

Frames are 16-bit PPM (and PFM for HDR when requested); `python3 tools/png.py *.ppm`
writes 8-bit PNGs. The render is deterministic for a given build: the same job file
reproduces the same frames. `python3 tools/checks.py` assembles the verification sheets
and the transition clip, prints the comparison figures, and with `--film` measures
frame-to-frame change in the rendered film.

Two diagnostic job options exist for inspection only: `clay 1` shades the crystal's
surfaces opaque (geometry check), and `audit N` traces N photons and reports where their
energy goes (surface, upward, trapped, numerical loss).
