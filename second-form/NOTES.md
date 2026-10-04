# Notes

## Reference

- Object: Baccarat Harcourt 1841 glass, size M, clear, ref. 1201103.
- Published: height 13.6 cm, diameter 8.2 cm, capacity 17 cl, weight 0.34 kg; flat-cut
  bowl with six facets, bevelled "triple-knob" stem, hexagonal foot.
- Visual reference: the official front-view product photograph supplied with the brief.
  The Baccarat website and retailer pages were blocked by the build environment's network
  policy, so no other views of this reference were available. Anything not visible from
  the front (back facets, the foot's underside, the inside of the bowl) is inferred.
- Photographs guided the reconstruction only. They are not used as textures and are not
  shipped with the work. Measurements are recorded in `reference/measurements.md`.

## The glass in code

Every horizontal cross-section is the intersection of a hexagonal cut and an optional
round blank, minus a round cavity, closed at the top by a half-round rim:

| Part | Representation |
| --- | --- |
| Six bowl facets | flat across, gently curved along their length: `x·uₖ = a(z)` with `a(z)` a C1 piecewise quadratic |
| Facet arches | each facet leaves the blank along a half-ellipse; its distance from the axis follows `a(z) = R(z)·cos(30°·√(1−u²))` between the spandrel tip (z = 117.4 mm) and the arch apex (z = 128.2 mm) |
| Uncut blank | `R²(z)` piecewise quadratic, vertical at the rim |
| Cavity | `Rᵢ²(z)` piecewise quadratic with a rounded bottom (z = 73 mm), vertical at the rim |
| Rim | half-round lip, 2.2 mm thick (torus, intersected by sphere tracing its exact distance) |
| Stem and knop | the same hexagonal cut with planar bevels: two waisted stem sections and a knop of three stacked tiers (small, large, small) |
| Foot | hexagon of 66.4 mm across the flats, bevelled underside, 5.0 mm vertical faces, six top facets sloping at about 18° into the stem |

The table of 68 zones is built in `src/geometry.js`; every surface is intersected exactly
with a quadratic (or, for the rim, with the exact torus distance), so the camera and the
photons see exactly the same crystal. Creases between facets are sharp; real cut edges are
polished to a small radius that is not modelled.

Checks against the published data (computed by `analyse()`):

| | Model | Published |
| --- | --- | --- |
| Height | 136.0 mm | 13.6 cm |
| Rim diameter | 82.0 mm | 8.2 cm |
| Brim-full capacity | 165 ml | 17 cl |
| Mass at 3.00–3.05 g/cm³ | 346–352 g | 0.34 kg |
| Thinnest wall | 2.07 mm (below the arches) | — |

During development a matched-framing render was overlaid on the photograph's edges to
check the outline of bowl, knop tiers and foot; that overlay is derived from the
photograph and is not included. `out/checks/geometry-clay.png` shows the same crystal
surfaces rendered opaque, so the facet layout, arches, knop tiers and foot can be read
directly.

## Assumed optical properties

Not published; chosen as typical for full lead crystal (about 30 % PbO):

- refractive index n_d = 1.56, Abbe number 42, represented by a Cauchy fit
  (n = 1.5398 + 0.006982 / λ², λ in µm); n ranges from 1.588 at 380 nm to 1.554 at 720 nm;
- no absorption inside the crystal, perfectly polished surfaces, no scratches or striae;
- the foot rests on the surface across a thin air gap (light leaving the underside
  lands directly beneath it; light inside the foot meets a glass/air interface there).

## Scene

- One source: a sphere of 1.2 mm radius with uniform white radiance (equal energy over
  380–720 nm).
- Room: dark, with a dim overhead fill whose irradiance on the surface is 2.2 % of the key
  at the foot of the glass in the final arrangement.
- Receiving surface: an infinite matte plane, reflectance 0.78.
- Fixed exposure and fill for the whole film and the interactive piece, so every change in
  brightness comes from the light moving.

## How the light is computed

The light on the surface is split into two exact parts plus the fill:

1. **Light that never touches the crystal** (the direct term): the sphere's analytic
   irradiance multiplied by the fraction of the sphere visible from each point, found with
   stratified rays tested against the crystal. This gives the soft shadow.
2. **Light that touches the crystal**: photons are emitted from the sphere toward the
   glass and followed through every interface, with reflection or transmission chosen by
   the Fresnel probability, total internal reflection, and refraction at the photon's own
   wavelength (dispersion). Up to 32 interactions per photon. Where they land on the
   surface, an adaptive-kernel density estimate (pilot density, Abramson's square-root
   law, about 800 photons per kernel) gives the irradiance. Emission uses Owen-scrambled
   Sobol points so neighbouring photons span the window and the spectrum evenly, and the
   same photon set is reused for every frame so moving light never shimmers.
   Energy audit for the final arrangement (one million photons, `audit` mode of the
   native renderer): of the light that reaches the crystal, 79 % lands on the surface
   (18 % leaves straight through the polished underside of the foot), 21 % leaves upward
   (reflections, and total internal reflection inside the foot that sends light back out
   of its top facets), 0.4 % is still inside after 32 interactions and 0.04 % is lost to
   numerical edge cases.
3. **The fill**: the room's radiance integrated over the sky of each surface point, with
   the crystal treated as a grey occluder that passes 82 % of what it covers. This is the
   one approximation in the surface lighting; the fill is faint.

The camera traces a tree of reflections and refractions with Fresnel weights (weak
branches by Russian roulette), one wavelength per sample. Branches end on the light, on
the surface (looking up the irradiance above), or in the room.

A branch that reaches the source itself through the crystal is a glint: an image of a
light some 10⁵ times brighter than the lit surface, usually far smaller than a pixel. At
a few hundred samples per pixel such glints are found only now and then, and showed as
isolated saturated specks that flashed on and off as the light moved. Their throughput is
therefore capped at 2.3·10⁻⁵ of the source's radiance (one and a half times display white
at the fixed exposure): a glint covering most of a pixel still reads as white, smaller ones
fade. This is a deliberate bias in the image of the glass only; the light on the surface
is computed separately and is not affected.

Removing the glass removes all photon light: with the glass gone the surface shows only
the smooth fall-off of the source (`out/checks/removal-*.png`).

### One optical system, two renderers

`src/optics.glsl` holds the geometry, material, light, room, photon tracer and camera
tracer. The browser compiles it as GLSL ES 3.00; the film renderer compiles the same file
as C++ through `native/glsl.h`. Photon indices, scrambling, sample patterns and the display
transform are identical. Rendered at 640×360, the converged browser image of the final
arrangement differs from the film renderer's by 0.8/255 on average (95th percentile 3/255)
(`out/checks/browser-vs-film.png`).

Differences that remain:

- the browser keeps its surface field coarser (0.34 mm texels over the wide view, 0.13 mm
  for the opening close view; the film uses 0.13 mm and 0.075 mm);
- the browser builds its pilot density from the first batch of photons and shrinks its
  kernels as batches accumulate; the film estimates from all photons at once;
- while the light moves, the browser uses one small batch per position and refines when
  it stops; film frames are always fully sampled.

## The film

24 s, 24 fps, 1920×1080.

| Time | Camera | Light |
| --- | --- | --- |
| 0–4 s | close above the surface, beside the foot | high and behind (the halo arrangement), moving 7° in azimuth and 2.5° in height |
| 4–8 s | one eased withdrawal to the final framing | still |
| 8–17.4 s | still | descends from 64° to 41° and swings from 128° to 158° in azimuth, decelerating |
| 17.4–24 s | still | still: the held arrangement (Arc) |

Per-frame sampling: 70 million photons for the close view, 140 million for the withdrawal
(computed once, the light is still), 45 million per frame while the light travels, and
200 million with 256 camera samples per pixel for the held frame. The held frame refines
over half a second as the frames blend into it, the way the interactive piece refines when
the light stops. Frames are 16-bit; the 8-bit delivery is dithered once before encoding.

## Composition

From one fixed camera, three arrangements of the same glass:

- **Meridian** (azimuth 173°, elevation 27°): a low light from the left throws a long
  shadow ending in an eye-shaped ring of light with spectral edges.
- **Arc** (158°, 41°): the held arrangement. A luminous drop with blue and amber edges sits
  inside the shadow, one bright arc closes the form, fainter arcs (light reflected by the
  bowl's outer surface) sweep across the lit surface, and the space above stays dark.
- **Halo** (128°, 64°): a high light from behind gathers a compact swirl of arcs and a
  bright cusp beside the foot.

## Known limitations

- The reconstruction rests on one front photograph and four published numbers. The
  photograph's proportions differ from the published height-to-diameter ratio by about
  4 %; the model honours the published numbers.
- Hidden geometry (back facets, the underside of the foot, the cavity's exact profile, the
  rim section) is inferred. Polished edge radii are not modelled.
- Light that the lit surface sends back through the glass onto the surface again
  (surface → crystal → surface) is ignored; it is far below the direct caustics. The
  fill's own caustics are ignored.
- Glints of the source seen in the crystal are capped (see above), so the glass sparkles
  less than it would in a photograph, where the lens also spreads each glint into a
  small halo. No lens glare is modelled.
- No absorption, scattering or polarisation in the crystal.
- Dispersion follows a two-term Cauchy model fitted to assumed n_d and Abbe number.
- In the neutral product view the stem waists look faint: their opposite hexagonal faces
  are parallel, so they pass the bright surround almost unchanged. This is physical for
  that surround, and differs from the studio photograph, whose lighting is unknown.
- The browser needs WebGL2 with floating-point render targets (EXT_color_buffer_float).
  Software renderers work but are very slow.
