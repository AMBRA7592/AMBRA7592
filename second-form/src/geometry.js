// THE SECOND FORM — code-defined reconstruction of the clear Harcourt 1841 glass,
// size M (17 cl), reference 1201103.
//
// Units: millimetres. The glass stands on the receiving surface (z = 0) with its
// axis on z. Every cross-section is the intersection of
//   - a hexagonal "cut" region  : |x . u_k| <= a(z) for the three facet normals u_k
//                                 (six flat-across facets, curved along their length),
//   - an optional round region   : x^2 + y^2 <= R(z)        (uncut blank surface),
// minus the round inner cavity    : x^2 + y^2 <  Ri(z)
// The rim is a half-round lip (torus) joining the outer and inner walls.
//
// a(z), R(z) and Ri(z) are piecewise quadratics in z (C1 where the surface is smooth,
// C0 where the glass has a cut edge), so every surface can be intersected exactly
// with a quadratic solve. This module is shared by the browser experience and the
// native film renderer: both read the same zone table it produces.
//
// Published data (Baccarat product page, ref 1201103): height 13.60 cm, diameter
// 8.20 cm, 17 cl, 0.34 kg. Everything else below is reconstructed from the official
// front photograph (silhouette measurements in reference/measurements.md) and is an
// estimate, not manufacturing geometry.

export const PUBLISHED = {
  reference: '1201103',
  name: 'Harcourt 1841 Glass, size M',
  height_mm: 136.0,
  diameter_mm: 82.0,
  capacity_cl: 17,
  mass_kg: 0.34,
};

// Assumed optical/material properties (not published).
export const MATERIAL = {
  // Full lead crystal (~30 % PbO): n_d ~ 1.56, Abbe ~ 42, density ~ 3.0-3.1 g/cm3.
  n_d: 1.56,
  abbe: 42.0,
  density_g_cm3: 3.05,
};

// Cauchy fit n(lambda) = A + B / lambda^2 (lambda in micrometres) matching n_d and abbe.
export function cauchyFromAbbe(nd, vd) {
  const lF = 0.4861327, lC = 0.6562725, ld = 0.5875618;
  const B = (nd - 1) / vd / (1 / (lF * lF) - 1 / (lC * lC));
  const A = nd - B / (ld * ld);
  return { A, B };
}

// ---------------------------------------------------------------------------
// Piecewise quadratic helper. Each piece: f(z) = c0 + c1 (z - z0) + c2 (z - z0)^2
class Piecewise {
  constructor(name) { this.name = name; this.pieces = []; }
  _push(z0, z1, c0, c1, c2) {
    const last = this.pieces[this.pieces.length - 1];
    if (last && Math.abs(last.z1 - z0) > 1e-9) throw new Error(`${this.name}: gap at ${z0}`);
    if (last) {
      const v = last.c0 + last.c1 * (z0 - last.z0) + last.c2 * (z0 - last.z0) ** 2;
      if (Math.abs(v - c0) > 1e-6) throw new Error(`${this.name}: discontinuity at z=${z0} (${v} vs ${c0})`);
    }
    this.pieces.push({ z0, z1, c0, c1, c2 });
    return this;
  }
  // straight segment (planar facet / cylinder)
  lin(z0, v0, z1, v1) { return this._push(z0, z1, v0, (v1 - v0) / (z1 - z0), 0); }
  // C1 quadratic Hermite between two (value, slope) pairs, split at the mid-point
  herm(z0, v0, s0, z1, v1, s1) {
    const h = (z1 - z0) / 2;
    const A = ((s1 - s0) / (2 * h) + (v1 - v0 - (s0 + s1) * h) / (h * h)) / 2;
    const B = (s1 - s0) / (2 * h) - A;
    const zm = z0 + h;
    const vm = v0 + s0 * h + A * h * h;
    const sm = s0 + 2 * A * h;
    this._push(z0, zm, v0, s0, A);
    this._push(zm, z1, vm, sm, B);
    return this;
  }
  // single quadratic from (z0, v0, s0) to (z1, v1)
  quad(z0, v0, s0, z1, v1) {
    const d = z1 - z0;
    return this._push(z0, z1, v0, s0, (v1 - v0 - s0 * d) / (d * d));
  }
  get zMin() { return this.pieces[0].z0; }
  get zMax() { return this.pieces[this.pieces.length - 1].z1; }
  find(z) {
    for (const p of this.pieces) if (z >= p.z0 - 1e-9 && z <= p.z1 + 1e-9) return p;
    return null;
  }
  eval(z) {
    const p = this.find(z);
    if (!p) return NaN;
    const s = z - p.z0;
    return p.c0 + p.c1 * s + p.c2 * s * s;
  }
  slope(z) {
    const p = this.find(z);
    if (!p) return NaN;
    return p.c1 + 2 * p.c2 * (z - p.z0);
  }
  breaks() {
    const b = [this.pieces[0].z0];
    for (const p of this.pieces) b.push(p.z1);
    return b;
  }
}

// ---------------------------------------------------------------------------
// The reconstruction. Values are mm; comments give the photo feature they follow.
export function harcourtProfile() {
  // Uncut outer surface of the bowl blank (round), visible near the rim and in the
  // spandrels between the facet arches. Stored as R^2(z).
  const lip = { e: 1.1, top: PUBLISHED.height_mm };
  lip.zc = lip.top - lip.e;
  const rOut = 41.0, rIn = rOut - 2 * lip.e;
  lip.Rc = (rOut + rIn) / 2;
  const R = [ // [z, r, dr/dz]
    [100.0, 37.9, 0.12],
    [115.8, 39.2, 0.10],
    [127.0, 40.3, 0.085],
    [lip.zc, rOut, 0.0],
  ];
  const rev = new Piecewise('rev');
  for (let i = 0; i + 1 < R.length; i++) {
    const [z0, r0, d0] = R[i], [z1, r1, d1] = R[i + 1];
    rev.herm(z0, r0 * r0, 2 * r0 * d0, z1, r1 * r1, 2 * r1 * d1);
  }
  const Rz = (z) => Math.sqrt(rev.eval(z));
  const dRz = (z) => rev.slope(z) / (2 * Rz(z));

  // Facet arch: each facet leaves the blank along a half-ellipse. Between the
  // spandrel tip (where neighbouring facets meet, 30 deg from the facet centre) and
  // the arch apex the facet boundary follows dtheta(z) = 30deg * sqrt(1 - u^2),
  // which fixes the facet's distance from the axis: a(z) = R(z) cos(dtheta(z)).
  const arch = { zsp: 117.4, ztop: 128.2 };
  const TH = Math.PI / 6, hA = arch.ztop - arch.zsp;
  const archA = (z) => {
    const u = Math.min(Math.max((z - arch.zsp) / hA, 0), 1);
    return Rz(z) * Math.cos(TH * Math.sqrt(1 - u * u));
  };
  const archS = (z) => {
    const u = Math.min(Math.max((z - arch.zsp) / hA, 0), 1);
    const q = Math.sqrt(Math.max(1 - u * u, 0));
    const dl = TH * q;
    const sinOverQ = q > 1e-9 ? Math.sin(dl) / q : TH;
    return dRz(z) * Math.cos(dl) + Rz(z) * sinOverQ * TH * u / hA;
  };

  // Hexagonal cut, apothem a(z): distance from the axis to each facet, measured
  // along the facet normal. Silhouette corner radii from the photo were converted
  // with a = 0.866 * corner radius.
  const hex = new Piecewise('hex')
    // foot: bevelled underside, vertical side faces, six sloping top facets
    .lin(0.0, 30.6, 2.4, 33.2)
    .lin(2.4, 33.2, 7.4, 33.2)
    .lin(7.4, 33.2, 14.0, 13.5)
    // stem base: bevel tiers rising into the lower stem
    .lin(14.0, 13.5, 16.0, 11.0)
    .lin(16.0, 11.0, 18.4, 9.2)
    .lin(18.4, 9.2, 21.6, 7.6)
    .lin(21.6, 7.6, 25.0, 6.6)
    // lower stem waist
    .lin(25.0, 6.6, 31.0, 6.5)
    // knop: bevels into three stacked hexagonal tiers (small, large, small)
    .lin(31.0, 6.5, 33.6, 7.2)
    .lin(33.6, 7.2, 35.6, 8.6)
    .lin(35.6, 8.6, 36.6, 9.6)
    .lin(36.6, 9.6, 38.2, 12.65)
    .lin(38.2, 12.65, 39.9, 12.65)
    .lin(39.9, 12.65, 41.7, 14.8)
    .lin(41.7, 14.8, 44.7, 14.8)
    .lin(44.7, 14.8, 45.6, 12.65)
    .lin(45.6, 12.65, 47.4, 12.65)
    .lin(47.4, 12.65, 48.4, 10.8)
    // upper stem: bevel tiers, waist, collar under the bowl
    .lin(48.4, 10.8, 50.6, 8.6)
    .lin(50.6, 8.6, 53.2, 7.2)
    .lin(53.2, 7.2, 57.6, 6.85)
    .lin(57.6, 6.85, 60.4, 7.6)
    // bowl: six facets, flat across, gently curved along their length
    .herm(60.4, 7.6, 0.95, 70.0, 15.8, 0.80)
    .herm(70.0, 15.8, 0.80, 82.0, 23.9, 0.55)
    .herm(82.0, 23.9, 0.55, 96.0, 29.7, 0.31)
    .herm(96.0, 29.7, 0.31, 110.0, 33.3, 0.12)
    .herm(110.0, 33.3, 0.12, arch.zsp, archA(arch.zsp), archS(arch.zsp));
  // the elliptical run-out, approximated by C1 quadratic pieces
  const U = [0, 0.4, 0.68, 0.86, 0.95, 1.0];
  for (let i = 0; i + 1 < U.length; i++) {
    const z0 = arch.zsp + U[i] * hA, z1 = arch.zsp + U[i + 1] * hA;
    hex.herm(z0, archA(z0), archS(z0), z1, archA(z1), archS(z1));
  }
  const sTop = archS(arch.ztop);
  hex.lin(arch.ztop, archA(arch.ztop), arch.ztop + 4.0, archA(arch.ztop) + 4.0 * sTop);
  let archErr = 0;
  for (let z = arch.zsp; z <= arch.ztop; z += 0.01) archErr = Math.max(archErr, Math.abs(hex.eval(z) - archA(z)));

  // Inner cavity, radius Ri(z), stored as Ri^2. Rounded bottom (radius of curvature
  // 15 mm at the axis), vertical tangent where it meets the rim lip. Wall thickness
  // was set so that capacity and mass agree with the published 17 cl and 0.34 kg.
  const C = [ // [z, ri, dri/dz]
    [80.0, 17.0, 1.20],
    [86.0, 22.3, 0.66],
    [96.0, 27.0, 0.37],
    [110.0, 30.95, 0.22],
    [116.0, 31.75, 0.17],
    [121.0, 32.75, 0.30],
    [125.0, 34.5, 0.58],
    [128.5, 36.95, 0.50],
    [131.5, 38.35, 0.20],
    [lip.zc, rIn, 0.0],
  ];
  const cav = new Piecewise('cav');
  const zcb = 73.0;
  cav.herm(zcb, 0.0, 30.0, C[0][0], C[0][1] ** 2, 2 * C[0][1] * C[0][2]);
  for (let i = 0; i + 1 < C.length; i++) {
    const [z0, r0, d0] = C[i], [z1, r1, d1] = C[i + 1];
    cav.herm(z0, r0 * r0, 2 * r0 * d0, z1, r1 * r1, 2 * r1 * d1);
  }
  return { hex, rev, cav, lip, arch, archErr, cavityBottom: zcb, footApothem: hex.eval(0) };
}

// Flags shared with the optical core (keep in sync with optics.glsl).
export const ZF = { HEX: 1, REV: 2, CAV: 4, BOTTOM: 8, LIP: 16 };
export const ZONE_VEC4 = 4;          // vec4s per zone in the table
export const MAX_ZONES = 80;

const COS30 = Math.cos(Math.PI / 6);

// Build the zone table consumed by the optical core.
export function buildGlass(profile = harcourtProfile()) {
  const { hex, rev, cav, lip } = profile;
  const brk = new Set([0, lip.zc, lip.top]);
  for (const f of [hex, rev, cav]) for (const z of f.breaks()) if (z < lip.zc) brk.add(+z.toFixed(9));
  const zs = [...brk].sort((a, b) => a - b).filter((z, i, arr) => i === 0 || z - arr[i - 1] > 1e-7);

  const zones = [];
  for (let i = 0; i + 1 < zs.length; i++) {
    const z0 = zs[i], z1 = zs[i + 1];
    if (z0 >= lip.zc - 1e-9) { // rim lip
      zones.push({ z0, z1, flags: ZF.LIP, rb: lip.Rc + lip.e, h: [0, 0, 0], p: [0, 0, 0], c: [0, 0, 0] });
      continue;
    }
    const zm = 0.5 * (z0 + z1);
    const local = (f) => { // re-express the covering piece in s = z - z0
      if (zm < f.zMin || zm > f.zMax) return null;
      const pc = f.find(zm); const d = z0 - pc.z0;
      return [pc.c0 + pc.c1 * d + pc.c2 * d * d, pc.c1 + 2 * pc.c2 * d, pc.c2];
    };
    let h = local(hex), p = local(rev), c = local(cav);
    // decide which outer constraints actually form part of the boundary in this zone
    let hexActive = false, revActive = false, rb = 0;
    for (let k = 0; k <= 16; k++) {
      const z = z0 + (z1 - z0) * k / 16;
      const a = h ? hex.eval(z) : Infinity;
      const r = p ? Math.sqrt(Math.max(rev.eval(z), 0)) : Infinity;
      if (a < r) hexActive = true;                 // facet cuts the round surface
      if (r < a / COS30) revActive = true;        // round surface survives somewhere
      rb = Math.max(rb, Math.min(r, a / COS30));
    }
    let flags = 0;
    if (h && hexActive) flags |= ZF.HEX; else h = null;
    if (p && revActive) flags |= ZF.REV; else p = null;
    if (c) flags |= ZF.CAV;
    if (z0 === 0) flags |= ZF.BOTTOM;
    if (!(flags & (ZF.HEX | ZF.REV))) throw new Error(`zone ${z0}-${z1} has no outer boundary`);
    zones.push({ z0, z1, flags, rb: rb * 1.0005 + 1e-3, h: h || [0, 0, 0], p: p || [0, 0, 0], c: c || [0, 0, 0] });
  }
  if (zones.length > MAX_ZONES) throw new Error(`too many zones: ${zones.length}`);

  const table = new Float32Array(MAX_ZONES * ZONE_VEC4 * 4);
  zones.forEach((zn, j) => {
    const o = j * ZONE_VEC4 * 4;
    table.set([zn.z0, zn.z1, zn.flags, zn.rb], o);
    table.set([...zn.h, 0], o + 4);
    table.set([...zn.p, 0], o + 8);
    table.set([...zn.c, 0], o + 12);
  });
  const rMax = Math.max(...zones.map((z) => z.rb));
  return {
    zones, table, nZones: zones.length,
    lip: [lip.zc, lip.Rc, lip.e, lip.top],
    bound: [rMax + 0.05, lip.top + 0.01],
    profile,
  };
}

// ---------------------------------------------------------------------------
// Analysis: cross-section areas, volume, capacity, mass, wall thickness.
function hexCircleArea(a, r) {
  // area of {|x.u_k| <= a, k=0..2} ∩ {|x| <= r}
  if (!(a < Infinity)) return Math.PI * r * r;
  if (!(r < Infinity)) return 2 * Math.sqrt(3) * a * a;
  if (a >= r) return Math.PI * r * r;
  if (a <= r * COS30) return 2 * Math.sqrt(3) * a * a;
  const seg = r * r * Math.acos(a / r) - a * Math.sqrt(r * r - a * a);
  return Math.PI * r * r - 6 * seg;
}

export function analyse(glass = buildGlass()) {
  const { hex, rev, cav, lip } = glass.profile;
  const N = 20000;
  let vOut = 0, vCav = 0, minWall = Infinity, minWallZ = 0;
  for (let i = 0; i < N; i++) {
    const z = (i + 0.5) / N * lip.zc;
    const a = (z >= hex.zMin && z <= hex.zMax) ? hex.eval(z) : Infinity;
    const r = (z >= rev.zMin && z <= rev.zMax) ? Math.sqrt(rev.eval(z)) : Infinity;
    const dz = lip.zc / N;
    vOut += hexCircleArea(a, r) * dz;
    if (z >= cav.zMin && z <= cav.zMax) {
      const ri2 = Math.max(cav.eval(z), 0);
      vCav += Math.PI * ri2 * dz;
      const wall = Math.min(a, r) - Math.sqrt(ri2);
      if (wall < minWall) { minWall = wall; minWallZ = z; }
    }
  }
  // rim lip: half torus annulus + the cavity's continuation inside the lip zone
  const vLip = Math.PI * lip.e * lip.e / 2 * 2 * Math.PI * lip.Rc;
  const rInTop = lip.Rc - lip.e;
  const capacity = vCav + Math.PI * rInTop * rInTop * lip.e; // brim-full
  const vGlass = vOut - vCav + vLip;
  // run-out arch: spandrel tip (a = R cos30) and arch apex (a = R)
  let zsp = null, ztop = null;
  for (let z = 100; z < lip.zc; z += 0.01) {
    const a = hex.eval(z), r = Math.sqrt(rev.eval(z));
    if (zsp === null && a >= r * COS30) zsp = z;
    if (ztop === null && a >= r) ztop = z;
  }
  return {
    glassVolume_cm3: vGlass / 1000,
    capacity_ml: capacity / 1000,
    mass_g_at_density: (d) => vGlass / 1000 * d,
    minWall_mm: minWall, minWallZ_mm: minWallZ,
    spandrelTip_mm: zsp, archApex_mm: ztop,
  };
}
