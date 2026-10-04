# Reference: Harcourt 1841 glass, size M, ref. 1201103

## Published data

From the Baccarat product listing for reference 1201103 (retrieved through a web search
summary; the Baccarat site itself was not reachable from the build environment):

| Property | Value |
| --- | --- |
| Height | 13.6 cm |
| Diameter | 8.2 cm |
| Capacity | 17 cl |
| Weight | 0.34 kg |
| Material | clear crystal |
| Described features | flat-cut bowl, bevelled stem ("triple-knob"), hexagonal foot, six facets |

## The photograph

One official front-view product photograph (1023 × 1023 px, supplied with the brief) was
used as the visual reference. It is not used as a texture or anywhere in the rendering.
Additional views of this exact reference could not be downloaded (network policy), so
anything not visible from the front is inferred.

### Camera estimate

- The rim reads as a thin ellipse: back edge at y = 157 px, front edge at y = 177 px on the
  centre column, so the camera sits roughly 3 to 6 degrees above the rim plane.
- Left and right silhouette points lie in the plane of the axis, so they can be measured
  without perspective correction; the photograph behaves close to an orthographic view.

### Scale

The published height and diameter cannot both be matched with a single isotropic scale
(the photograph is about 4 % taller relative to its width). The reconstruction honours
both published numbers:

- radial scale 0.2164 mm/px (rim half-width 189.5 px = 41.0 mm)
- vertical scale 0.20875 mm/px (rim plane at y = 173 px, foot plane at y = 824.5 px = 136 mm)

### Silhouette (left/right extremes, half-width in px, then mm)

Below the spandrel tips the silhouette is a ridge between two facets, so the facet
apothem is `a = 0.866 × corner radius`.

| y (px) | z (mm) | half-width (px) | corner radius (mm) | facet apothem (mm) |
| ---: | ---: | ---: | ---: | ---: |
| 175 | 135.2 | 189.5 | 41.0 | (round rim) |
| 220 | 125.8 | 186.0 | 40.3 | (round) |
| 270 | 115.4 | 181.0 | 39.2 | 33.9 |
| 320 | 104.9 | 172.0 | 37.2 | 32.2 |
| 370 | 94.5 | 157.0 | 34.0 | 29.4 |
| 410 | 86.1 | 139.5 | 30.2 | 26.1 |
| 450 | 77.8 | 115.5 | 25.0 | 21.6 |
| 490 | 69.4 | 84.0 | 18.2 | 15.7 |
| 530 | 61.0 | 44.0 | 9.5 | 8.2 |
| 558 | 55.2 | 36.5 | 7.9 | 6.84 (upper stem waist) |
| 600 | 46.4 | 66.5 | 14.4 | 12.5 (upper knop tier) |
| 620 | 42.2 | 79.0 | 17.1 | 14.8 (main knop tier) |
| 637 | 38.6 | 66.5 | 14.4 | 12.5 (lower knop tier) |
| 685 | 28.6 | 34.5 | 7.47 | 6.47 (lower stem waist) |
| 750 | 15.0 | 63.0 | 13.6 | 11.8 (stem base bevels) |
| 787 | 7.8 | 179.5 | 38.8 | 33.6 (foot plate) |

The knop reads as three stacked hexagonal tiers (small, large, small) joined by bevels,
which is how the "triple-knob stem" is modelled.

### Facet arches

Measured on the front facet along the centre column, relative to the front rim edge
(same depth, so independent of the camera height): the arch apex is 38 px and the
spandrel notch 91 px below the rim edge, giving z ≈ 128.2 mm and z ≈ 117.4 mm.

## Calibrations made in code

- Wall thickness and cavity depth were set so that the computed brim-full capacity and
  mass match the published figures: 165 ml (published 170 ml) and 346 to 352 g for an
  assumed density of 3.00 to 3.05 g/cm³ (published 340 g). See `analyse()` in
  `src/geometry.js`.
- A matched-framing render was overlaid on the photograph's edges to check the outline of
  bowl, knop tiers and foot.

Nothing here is manufacturing geometry. It is a careful reconstruction from one
photograph and four published numbers.
