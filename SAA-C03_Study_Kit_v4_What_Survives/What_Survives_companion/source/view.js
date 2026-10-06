/*
 * AWS — What Survives · view
 *
 * Draws one frame of a run as SVG. Reads model frames; never changes them.
 * Each study has a wide (landscape) and a narrow (portrait) layout with fixed
 * component positions, so nothing moves during a replay. Visual vocabulary:
 *   live component      solid box, status pill with symbol + word
 *   stored record       card with a folded corner, monospace identifier
 *   request             solid line, filled arrowhead, "REQUEST" label
 *   replication         double line, "REPLICATION" label
 *   acknowledgement     thin line, hollow arrowhead, "ACK" label
 *   unavailable path    dashed grey line with a cross, "NO PATH" label
 *   business effect     double-bordered stamp with a check mark
 *   historical copy     stacked box with a clock symbol
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var keys = Object.keys;

  /* ------------------------------------------------------------------ */
  /* Layouts                                                             */
  /* ------------------------------------------------------------------ */

  var LAYOUTS = {
    photo: {
      wide: {
        w: 960, h: 600, lane: 6,
        frames: [
          { kind: 'region', x: 196, y: 10, w: 754, h: 580, label: 'AWS Region', pos: 'br' },
          { kind: 'az', x: 210, y: 126, w: 360, h: 338, label: 'Availability Zone a', pos: 'bl' },
          { kind: 'az', x: 590, y: 126, w: 346, h: 338, label: 'Availability Zone b', pos: 'bl' },
          { kind: 'group', x: 236, y: 146, w: 692, h: 300, label: 'Auto Scaling group · desired capacity 2', pos: 'br' }
        ],
        comps: {
          browser: { x: 12, y: 38, w: 172, h: 340 },
          alb: { x: 246, y: 36, w: 672, h: 76 },
          'i-0a1': { x: 246, y: 158, w: 284, h: 136 },
          'i-0a2': { x: 246, y: 304, w: 284, h: 136 },
          'i-0b1': { x: 632, y: 158, w: 284, h: 136 },
          bucket: { x: 300, y: 478, w: 560, h: 100 }
        },
        links: {
          'browser>alb': [[184, 74], [246, 74]],
          'alb>i-0a1': [[388, 112], [388, 158]],
          'alb>i-0b1': [[774, 112], [774, 158]],
          'alb>i-0a2': [[262, 112], [262, 136], [226, 136], [226, 372], [246, 372]],
          'i-0a1>bucket': [[530, 254], [552, 254], [552, 478]],
          'i-0a2>bucket': [[388, 440], [388, 478]],
          'i-0b1>bucket': [[774, 294], [774, 478]],
          'i-0b1>i-0a1': [[632, 214], [530, 214]]
        }
      },
      narrow: {
        w: 440, h: 832, lane: 5,
        frames: [
          { kind: 'region', x: 4, y: 138, w: 432, h: 690, label: 'AWS Region', pos: 'br' },
          { kind: 'az', x: 10, y: 232, w: 206, h: 444, label: 'AZ a', pos: 'bl' },
          { kind: 'az', x: 224, y: 232, w: 206, h: 444, label: 'AZ b', pos: 'bl' },
          { kind: 'group', x: 16, y: 250, w: 408, h: 400, label: 'Auto Scaling group', pos: 'br' }
        ],
        comps: {
          browser: { x: 10, y: 8, w: 420, h: 118 },
          alb: { x: 16, y: 154, w: 408, h: 68 },
          'i-0a1': { x: 36, y: 262, w: 160, h: 178 },
          'i-0a2': { x: 36, y: 458, w: 160, h: 178 },
          'i-0b1': { x: 250, y: 262, w: 160, h: 178 },
          bucket: { x: 30, y: 698, w: 380, h: 120 }
        },
        links: {
          'browser>alb': [[220, 126], [220, 154]],
          'alb>i-0a1': [[116, 222], [116, 262]],
          'alb>i-0b1': [[330, 222], [330, 262]],
          'alb>i-0a2': [[48, 222], [48, 242], [23, 242], [23, 548], [36, 548]],
          'i-0a1>bucket': [[196, 404], [207, 404], [207, 698]],
          'i-0a2>bucket': [[116, 636], [116, 698]],
          'i-0b1>bucket': [[330, 440], [330, 698]],
          'i-0b1>i-0a1': [[250, 300], [196, 300]]
        }
      }
    },
    database: {
      wide: {
        w: 960, h: 600, lane: 6,
        frames: [
          { kind: 'region', x: 200, y: 10, w: 750, h: 580, label: 'AWS Region', pos: 'tr' },
          { kind: 'az', x: 222, y: 150, w: 356, h: 306, label: 'Availability Zone a', pos: 'bl' },
          { kind: 'az', x: 582, y: 150, w: 356, h: 306, label: 'Availability Zone b', pos: 'bl' },
          { kind: 'group', x: 232, y: 168, w: 696, h: 266, label: 'RDS for PostgreSQL · Multi-AZ DB instance deployment', pos: 'bl2' }
        ],
        comps: {
          customer: { x: 12, y: 28, w: 178, h: 258 },
          operator: { x: 12, y: 300, w: 178, h: 172 },
          app: { x: 228, y: 28, w: 262, h: 118 },
          dns: { x: 510, y: 28, w: 260, h: 118 },
          'db-a': { x: 240, y: 180, w: 282, h: 230 },
          'db-b': { x: 640, y: 180, w: 282, h: 230 },
          'db-r': { x: 240, y: 466, w: 282, h: 118 },
          snapshot: { x: 640, y: 466, w: 282, h: 118 }
        },
        links: {
          'customer>app': [[190, 80], [228, 80]],
          'operator>db-a': [[190, 384], [240, 384]],
          'app>db-a': [[300, 146], [300, 180]],
          'app>db-b': [[446, 146], [446, 160], [781, 160], [781, 180]],
          'app>db-r': [[228, 120], [211, 120], [211, 526], [240, 526]],
          'db-a>db-b': [[522, 296], [640, 296]],
          'snapshot>db-r': [[640, 526], [522, 526]]
        }
      },
      narrow: {
        w: 440, h: 1004, lane: 4,
        frames: [
          { kind: 'region', x: 4, y: 194, w: 432, h: 806, label: 'AWS Region', pos: 'br' },
          { kind: 'az', x: 18, y: 344, w: 196, h: 414, label: 'AZ a', pos: 'bl' },
          { kind: 'az', x: 226, y: 344, w: 196, h: 414, label: 'AZ b', pos: 'bl' },
          { kind: 'group', x: 22, y: 360, w: 396, h: 376, label: 'Multi-AZ DB instance', pos: 'bl2' }
        ],
        comps: {
          customer: { x: 10, y: 8, w: 205, h: 170 },
          operator: { x: 225, y: 8, w: 205, h: 170 },
          app: { x: 16, y: 204, w: 194, h: 124 },
          dns: { x: 230, y: 204, w: 194, h: 124 },
          'db-a': { x: 28, y: 372, w: 180, h: 314 },
          'db-b': { x: 232, y: 372, w: 180, h: 314 },
          'db-r': { x: 24, y: 778, w: 184, h: 214 },
          snapshot: { x: 232, y: 778, w: 184, h: 214 }
        },
        links: {
          'customer>app': [[112, 178], [112, 204]],
          'operator>db-a': [[330, 178], [330, 187], [220, 187], [220, 452], [208, 452]],
          'app>db-a': [[112, 328], [112, 372]],
          'app>db-b': [[186, 328], [186, 338], [322, 338], [322, 372]],
          'app>db-r': [[16, 300], [11, 300], [11, 884], [24, 884]],
          'db-a>db-b': [[208, 584], [232, 584]],
          'snapshot>db-r': [[232, 884], [208, 884]]
        }
      }
    },
    payment: {
      wide: {
        w: 960, h: 600, lane: 6,
        frames: [
          { kind: 'region', x: 10, y: 10, w: 694, h: 580, label: 'AWS Region \u00b7 the shop\u2019s account', pos: 'tl' },
          { kind: 'outside', x: 714, y: 10, w: 236, h: 580, label: 'Outside AWS', pos: 'tl' }
        ],
        comps: {
          checkout: { x: 24, y: 40, w: 136, h: 132 },
          queue: { x: 190, y: 40, w: 234, h: 344 },
          W1: { x: 500, y: 40, w: 192, h: 164 },
          W2: { x: 500, y: 220, w: 192, h: 164 },
          processed: { x: 500, y: 404, w: 192, h: 172 },
          tally: { x: 24, y: 404, w: 400, h: 172 },
          processor: { x: 724, y: 40, w: 216, h: 344 },
          statement: { x: 724, y: 404, w: 216, h: 172 }
        },
        links: {
          'checkout>queue': [[160, 104], [190, 104]],
          'W1>queue': [[500, 118], [424, 118]],
          'W2>queue': [[500, 300], [424, 300]],
          'W1>processor': [[692, 118], [724, 118]],
          'W2>processor': [[692, 300], [724, 300]],
          'W1>processed': [[500, 186], [466, 186], [466, 470], [500, 470]],
          'W2>processed': [[596, 384], [596, 404]]
        }
      },
      narrow: {
        w: 440, h: 1124, lane: 4,
        frames: [
          { kind: 'region', x: 4, y: 4, w: 432, h: 702, label: 'AWS Region \u00b7 the shop\u2019s account', pos: 'tl' },
          { kind: 'outside', x: 4, y: 716, w: 432, h: 404, label: 'Outside AWS', pos: 'tl' }
        ],
        comps: {
          checkout: { x: 16, y: 28, w: 408, h: 72 },
          queue: { x: 16, y: 120, w: 408, h: 238 },
          W1: { x: 16, y: 380, w: 196, h: 152 },
          W2: { x: 228, y: 380, w: 196, h: 152 },
          processed: { x: 16, y: 552, w: 196, h: 140 },
          tally: { x: 228, y: 552, w: 196, h: 140 },
          processor: { x: 16, y: 746, w: 408, h: 222 },
          statement: { x: 16, y: 982, w: 408, h: 132 }
        },
        links: {
          'checkout>queue': [[220, 100], [220, 120]],
          'W1>queue': [[114, 380], [114, 358]],
          'W2>queue': [[326, 380], [326, 358]],
          'W1>processor': [[212, 470], [220, 470], [220, 746]],
          'W2>processor': [[424, 470], [430, 470], [430, 734], [330, 734], [330, 746]],
          'W1>processed': [[114, 532], [114, 552]],
          'W2>processed': [[250, 532], [250, 542], [190, 542], [190, 552]]
        }
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /* SVG helpers                                                         */
  /* ------------------------------------------------------------------ */

  function E(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) keys(attrs).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function T(parent, x, y, str, cls, extra) {
    var a = { x: x, y: y, 'class': cls };
    if (extra) keys(extra).forEach(function (k) { a[k] = extra[k]; });
    var t = E('text', a, parent);
    t.textContent = str;
    return t;
  }
  // Text width in user units. While a drawing is being rendered into a visible
  // SVG, a hidden measuring element gives exact widths; otherwise (print pack
  // built off-screen, tests) a conservative estimate is used.
  var measurer = null;
  function textWidth(str, size, mono, bold) {
    if (measurer) {
      measurer.style.fontSize = size + 'px';
      measurer.style.fontFamily = mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' : '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
      measurer.style.fontWeight = bold ? '700' : '400';
      measurer.textContent = str;
      var w = 0;
      try { w = measurer.getComputedTextLength(); } catch (e) { w = 0; }
      if (w > 0) return w;
    }
    return str.length * size * (mono ? 0.62 : bold ? 0.6 : 0.56);
  }
  function wrap(str, maxWidth, size, mono, bold) {
    var words = String(str).split(' '), lines = [], line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (textWidth(test, size, mono, bold) > maxWidth && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }
  function fit(str, maxWidth, size, mono, bold) {
    if (textWidth(str, size, mono, bold) <= maxWidth) return str;
    var cut = str.length;
    while (cut > 3 && textWidth(str.slice(0, cut) + '…', size, mono, bold) > maxWidth) cut--;
    return str.slice(0, cut).replace(/\s+$/, '') + '…';
  }
  function T2(parent, x, y, str, maxWidth, size, cls, lh, mono, bold) {
    var lines = wrap(str, maxWidth, size, mono, bold);
    lines.forEach(function (l, i) { T(parent, x, y + i * (lh || size * 1.3), l, cls); });
    return lines.length * (lh || size * 1.3);
  }

  function defs(svg) {
    var d = E('defs', null, svg);
    var hatch = E('pattern', { id: 'ws-hatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, d);
    E('rect', { width: 8, height: 8, 'class': 'hatch-bg' }, hatch);
    E('line', { x1: 0, y1: 0, x2: 0, y2: 8, 'class': 'hatch-line' }, hatch);
    function marker(id, path, cls, filled) {
      var m = E('marker', { id: id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse', markerUnits: 'strokeWidth' }, d);
      E('path', { d: path, 'class': cls + (filled ? ' mk-filled' : ' mk-open') }, m);
    }
    marker('ws-mk-request', 'M0,0 L10,5 L0,10 z', 'mk-request', true);
    marker('ws-mk-ack', 'M1,1 L9,5 L1,9 z', 'mk-ack', false);
    marker('ws-mk-replication', 'M0,0 L10,5 L0,10 z', 'mk-replication', true);
    marker('ws-mk-restore', 'M0,0 L10,5 L0,10 z', 'mk-restore', true);
  }

  /* ------------------------------------------------------------------ */
  /* Shapes                                                              */
  /* ------------------------------------------------------------------ */

  var STATUS = {
    ok: '●', bad: '✕', pending: '◌', busy: '▶', idle: '○', info: '◆'
  };

  function pill(g, x, y, text, kind, anchorEnd) {
    var str = STATUS[kind] + ' ' + text;
    var w = textWidth(str, 11, false, true) + 12;
    var x0 = anchorEnd ? x - w : x;
    var p = E('g', { 'class': 'pill pill--' + kind }, g);
    E('rect', { x: x0, y: y - 11, width: w, height: 16, rx: 8 }, p);
    T(p, x0 + 6, y + 1, str, 'pill-text');
    return w;
  }

  // A live component (or other box). Returns the content rectangle.
  function box(ctx, id, o) {
    var r = ctx.L.comps[id];
    var g = E('g', { 'class': 'comp comp--' + (o.variant || 'live') + (o.down ? ' is-down' : '') + (ctx.changedComp[id] ? ' is-changed' : ''), 'data-comp': id }, ctx.layer.comps);
    if (o.variant === 'historic') {
      E('rect', { x: r.x + 8, y: r.y - 8, width: r.w, height: r.h, rx: 6, 'class': 'stack-back' }, g);
      E('rect', { x: r.x + 4, y: r.y - 4, width: r.w, height: r.h, rx: 6, 'class': 'stack-back' }, g);
    }
    E('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 6, 'class': 'comp-box' }, g);
    E('path', { d: 'M' + r.x + ',' + (r.y + 26) + ' H' + (r.x + r.w), 'class': 'comp-rule' }, g);
    var title = (o.variant === 'historic' ? '\u23f2 ' : '') + o.title;
    var titleW = textWidth(title, 12.5, false, true);
    var pillW = o.status ? textWidth(STATUS.ok + ' ' + o.status[0], 11, false, true) + 12 : 0;
    // The status pill shares the header when there is room; otherwise it
    // opens the body, so neither the name nor the status is truncated.
    var pillInHeader = !o.status || titleW + pillW + 26 <= r.w;
    T(g, r.x + 8, r.y + 17.5, fit(title, r.w - 16 - (pillInHeader && o.status ? pillW + 10 : 0), 12.5, false, true), 'comp-title');
    var top = r.y + 32;
    if (o.status && pillInHeader) pill(g, r.x + r.w - 6, r.y + 13, o.status[0], o.status[1], true);
    else if (o.status) { pill(g, r.x + 8, r.y + 42, o.status[0], o.status[1], false); top += 20; }
    if (o.down) E('rect', { x: r.x + 1, y: r.y + 27, width: r.w - 2, height: r.h - 28, 'class': 'down-hatch' }, g);
    ctx.rects.push({ x: r.x, y: r.y, w: r.w, h: r.h });
    return { g: g, x: r.x + 8, y: top, w: r.w - 16, h: r.y + r.h - 4 - top, r: r };
  }

  function card(ctx, g, x, y, w, rec) {
    // rec: { id, detail, state, badge, comp, rec }
    var h = rec.detail ? 32 : 22;
    var changed = rec.comp && ctx.changedRec[rec.comp + '|' + rec.recKey];
    var cls = 'rec rec--' + (rec.state || 'normal') + (changed ? ' is-changed' : '');
    var c = E('g', { 'class': cls, 'data-rec': rec.comp ? rec.comp + '|' + rec.recKey : null }, g);
    var f = 7;
    E('path', { d: 'M' + x + ',' + y + ' H' + (x + w - f) + ' L' + (x + w) + ',' + (y + f) + ' V' + (y + h) + ' H' + x + ' Z', 'class': 'rec-shape' }, c);
    E('path', { d: 'M' + (x + w - f) + ',' + y + ' V' + (y + f) + ' H' + (x + w), 'class': 'rec-fold' }, c);
    var badgeW = rec.badge ? textWidth(rec.badge, 9.5, false, true) + 0.4 * rec.badge.length + 10 : 0;
    var idStr = fit(rec.id, w - 18 - badgeW, 12, true, true);
    var idT = T(c, x + 7, y + 14.5, idStr, 'rec-id');
    if (rec.state === 'destroyed' || rec.state === 'deleted') {
      E('line', { x1: x + 5, y1: y + 10.5, x2: x + 9 + textWidth(idStr, 12, true, true), y2: y + 10.5, 'class': 'rec-strike' }, c);
    }
    if (rec.detail) T(c, x + 7, y + 27, fit(rec.detail, w - 12, 10.5), 'rec-detail');
    if (rec.badge) {
      var bx = x + w - 9 - badgeW;
      E('rect', { x: bx, y: y + 4, width: badgeW, height: 13, rx: 2, 'class': 'rec-badge-box' }, c);
      T(c, bx + 5, y + 13.8, rec.badge, 'rec-badge');
    }
    if (idT && rec.state === 'absent') idT.setAttribute('font-style', 'italic');
    return h;
  }

  function stamp(ctx, g, x, y, w, o) {
    // o: { text, sub, kind: done | duplicate | broken, compact }
    var h = o.sub ? 32 : o.compact ? 18 : 22;
    var s = E('g', { 'class': 'effect effect--' + o.kind + (o.changed ? ' is-changed' : '') }, g);
    E('rect', { x: x, y: y, width: w, height: h, rx: 4, 'class': 'effect-outer' }, s);
    E('rect', { x: x + 2.5, y: y + 2.5, width: w - 5, height: h - 5, rx: 2.5, 'class': 'effect-inner' }, s);
    var glyph = o.kind === 'broken' ? '✕' : o.kind === 'duplicate' ? '✓✓' : '✓';
    var base = o.compact ? 13 : 15;
    T(s, x + (o.compact ? 6 : 8), y + base, glyph, 'effect-glyph');
    var gx = x + (o.compact ? 7 : 10) + textWidth(glyph, 12, false, true) + (o.compact ? 3 : 4);
    T(s, gx, y + base, fit(o.text, x + w - gx - 5, o.compact ? 10.5 : 11.5, false, true), o.compact ? 'effect-text effect-text--compact' : 'effect-text');
    if (o.sub) T(s, gx, y + 27, fit(o.sub, x + w - gx - 6, 10), 'effect-sub');
    return h;
  }

  function tagAt(ctx, compId, text, kind) {
    var r = ctx.L.comps[compId];
    if (!r) return null;
    var n = (ctx.tagCount[compId] = (ctx.tagCount[compId] || 0) + 1);
    var w = textWidth(text, 10.5, false, true) + 14;
    var x = Math.min(r.x + r.w - w - 4, ctx.L.w - w - 2);
    var y = r.y - 7 - (n - 1) * 18;
    if (y < 2) y = r.y + 30 + (n - 1) * 18;
    var g = E('g', { 'class': 'cue-tag cue-tag--' + kind, 'data-tag': compId }, ctx.layer.labels);
    E('rect', { x: x, y: y - 9, width: w, height: 16, rx: 3 }, g);
    T(g, x + 7, y + 2.5, text, 'cue-tag-text');
    return g;
  }

  function frameBox(ctx, f) {
    var g = E('g', { 'class': 'frame frame--' + f.kind }, ctx.layer.frames);
    E('rect', { x: f.x, y: f.y, width: f.w, height: f.h, rx: f.kind === 'region' || f.kind === 'outside' ? 10 : 8 }, g);
    var size = f.kind === 'group' ? 11 : 11.5;
    var lx, ly, anchor = 'start';
    if (f.pos === 'tl') { lx = f.x + 10; ly = f.y + 16; }
    else if (f.pos === 'tr') { lx = f.x + f.w - 10; ly = f.y + 16; anchor = 'end'; }
    else if (f.pos === 'br') { lx = f.x + f.w - 10; ly = f.y + f.h - 8; anchor = 'end'; }
    else { lx = f.x + 10; ly = f.y + f.h - 8; }
    T(g, lx, ly, f.label, 'frame-label', { 'text-anchor': anchor, 'font-size': size });
    // Frame labels are obstacles for cue labels, so they stay readable.
    var w = textWidth(f.label, size, false, true) + 0.02 * size * f.label.length;
    ctx.rects.push({ x: anchor === 'end' ? lx - w : lx, y: ly - size, w: w, h: size + 3 });
  }

  /* ------------------------------------------------------------------ */
  /* Geometry for cues                                                   */
  /* ------------------------------------------------------------------ */

  function linkPoints(L, a, b) {
    if (L.links[a + '>' + b]) return L.links[a + '>' + b].map(function (p) { return p.slice(); });
    if (L.links[b + '>' + a]) return L.links[b + '>' + a].slice().reverse().map(function (p) { return p.slice(); });
    return null;
  }

  // Offset a polyline to the right-hand side of its direction of travel, so
  // a request and its acknowledgement on the same link use separate lanes.
  function offsetPolyline(pts, d) {
    if (!d) return pts;
    var segs = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len * d, ny = dx / len * d;
      segs.push([[pts[i][0] + nx, pts[i][1] + ny], [pts[i + 1][0] + nx, pts[i + 1][1] + ny]]);
    }
    var out = [segs[0][0]];
    for (var j = 0; j < segs.length - 1; j++) {
      var p = intersect(segs[j], segs[j + 1]);
      out.push(p || segs[j][1]);
    }
    out.push(segs[segs.length - 1][1]);
    return out;
  }
  function intersect(s1, s2) {
    var x1 = s1[0][0], y1 = s1[0][1], x2 = s1[1][0], y2 = s1[1][1];
    var x3 = s2[0][0], y3 = s2[0][1], x4 = s2[1][0], y4 = s2[1][1];
    var den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-6) return null;
    var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }
  function polyLength(pts) {
    var s = 0;
    for (var i = 0; i < pts.length - 1; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    return s;
  }
  function pointAt(pts, t) {
    var total = polyLength(pts), target = total * t, acc = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (acc + l >= target) {
        var u = l ? (target - acc) / l : 0;
        return [pts[i][0] + u * (pts[i + 1][0] - pts[i][0]), pts[i][1] + u * (pts[i + 1][1] - pts[i][1])];
      }
      acc += l;
    }
    return pts[pts.length - 1];
  }
  function ptsAttr(pts) { return pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  var TYPE_WORD = { request: 'REQUEST', ack: 'ACK', replication: 'REPLICATION', restore: 'RESTORE', blocked: 'NO PATH' };
  var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

  // Greedy placement of a cue label beside its path, avoiding components and
  // other labels. Returns null when no free position exists (the numbered
  // marker on the path and the step list still identify the cue).
  function placeLabel(ctx, links, cue, num) {
    var word = TYPE_WORD[cue.type];
    var wordW = textWidth(word, 9, false, true) + 0.07 * 9 * word.length;
    var textW = textWidth(cue.label, 10.5);
    var h = 17;
    // Full label first; if no free position exists, a compact label carrying
    // only the number and type word (the step list gives the full text).
    var variants = [{ text: cue.label, w: 22 + wordW + 6 + textW + 8 }, { text: null, w: 22 + wordW + 8 }];
    for (var v = 0; v < variants.length; v++) {
      var w = variants[v].w;
      var cands = [];
      links.forEach(function (pts, li) {
        for (var i = 0; i < pts.length - 1; i++) {
          var a = pts[i], b = pts[i + 1];
          var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 6) continue;
          var dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
          var nx = -dy, ny = dx;
          [0.5, 0.35, 0.65, 0.2, 0.8].forEach(function (t) {
            var px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
            [1, -1].forEach(function (side) {
              [7, 24].forEach(function (gap) {
                var vertical = Math.abs(nx) > 0.5;
                var rect = vertical
                  ? { x: side * nx > 0 ? px + gap : px - gap - w, y: py - h / 2, w: w, h: h }
                  : { x: px - w / 2, y: side * ny > 0 ? py + gap : py - gap - h, w: w, h: h };
                // Labels beside a long vertical link may also sit centred on it.
                cands.push({ rect: rect, score: len * (li === links.length - 1 ? 1.15 : 1) - Math.abs(t - 0.5) * 50 - (side < 0 ? 25 : 0) - (gap > 7 ? 60 : 0) });
              });
            });
          });
        }
      });
      cands.sort(function (p, q) { return q.score - p.score; });
      var margin = 2;
      for (var k = 0; k < cands.length; k++) {
        var r = cands[k].rect;
        if (r.x < margin || r.y < margin || r.x + r.w > ctx.L.w - margin || r.y + r.h > ctx.L.h - margin) continue;
        var bad = ctx.rects.some(function (o) { return overlaps(r, o); }) || ctx.placed.some(function (o) { return overlaps(r, o); });
        if (bad) continue;
        ctx.placed.push({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 });
        var g = E('g', { 'class': 'cue-label cue-label--' + cue.type + (variants[v].text ? '' : ' cue-label--compact') }, ctx.layer.labels);
        E('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 8.5, 'class': 'cue-label-box' }, g);
        T(g, r.x + 5, r.y + 12.5, CIRCLED[num] || String(num + 1), 'cue-label-num');
        T(g, r.x + 21, r.y + 12, word, 'cue-label-type');
        if (variants[v].text) T(g, r.x + 21 + wordW + 6, r.y + 12.5, variants[v].text, 'cue-label-text');
        return g;
      }
    }
    return null;
  }

  function drawCue(ctx, cue, num) {
    if (cue.type === 'control' || cue.type === 'health') {
      var kind = cue.type === 'health' ? 'health' : 'control';
      var prefix = cue.type === 'health' ? 'HEALTH CHECK · ' : '';
      var target = cue.route[cue.route.length - 1];
      var tg = tagAt(ctx, target, (CIRCLED[num] || '') + ' ' + prefix + cue.label, kind);
      return { cue: cue, tag: tg, links: [], target: target };
    }
    var links = [];
    for (var i = 0; i < cue.route.length - 1; i++) {
      var p = linkPoints(ctx.L, cue.route[i], cue.route[i + 1]);
      if (!p) { if (ctx.missing) ctx.missing.push(cue.route[i] + '>' + cue.route[i + 1]); continue; }
      links.push(offsetPolyline(p, cue.type === 'blocked' ? 0 : ctx.L.lane));
    }
    if (!links.length) return null;
    var g = E('g', { 'class': 'cue cue--' + cue.type, 'data-cue': num }, ctx.layer.cues);
    links.forEach(function (pts, li) {
      var last = li === links.length - 1;
      if (cue.type === 'replication' || cue.type === 'restore') {
        E('polyline', { points: ptsAttr(offsetPolyline(pts, 2)), 'class': 'cue-line cue-line--a' }, g);
        E('polyline', { points: ptsAttr(offsetPolyline(pts, -2)), 'class': 'cue-line cue-line--b' }, g);
        if (last) E('polyline', { points: ptsAttr(pts), 'class': 'cue-head', 'marker-end': 'url(#ws-mk-' + cue.type + ')' }, g);
      } else {
        E('polyline', { points: ptsAttr(pts), 'class': 'cue-line', 'marker-end': last && cue.type !== 'blocked' ? 'url(#ws-mk-' + cue.type + ')' : null }, g);
      }
    });
    if (cue.type === 'blocked') {
      var mid = pointAt(links[0], 0.5);
      var x = E('g', { 'class': 'cue-cross' }, g);
      E('circle', { cx: mid[0], cy: mid[1], r: 8 }, x);
      E('path', { d: 'M' + (mid[0] - 4) + ',' + (mid[1] - 4) + ' L' + (mid[0] + 4) + ',' + (mid[1] + 4) + ' M' + (mid[0] + 4) + ',' + (mid[1] - 4) + ' L' + (mid[0] - 4) + ',' + (mid[1] + 4) }, x);
    }
    // numbered badge at the start of the path
    var start = links[0][0];
    var nb = E('g', { 'class': 'cue-num' }, g);
    E('circle', { cx: start[0], cy: start[1], r: 7.5 }, nb);
    T(nb, start[0], start[1] + 3.6, String(num + 1), 'cue-num-text', { 'text-anchor': 'middle' });
    var label = placeLabel(ctx, links, cue, num);
    return { cue: cue, g: g, links: links, label: label, target: cue.route[cue.route.length - 1] };
  }

  /* ------------------------------------------------------------------ */
  /* Study drawings                                                      */
  /* ------------------------------------------------------------------ */

  function drawPhoto(ctx) {
    var s = ctx.state, c = ctx.config, M = ctx.M;
    var narrow = ctx.layoutName === 'narrow';
    // Browser: the last response the customer received, the load-balancer
    // cookie and the shop's promise (a completed business effect).
    var page = s.browser.page;
    var b = box(ctx, 'browser', { title: 'Customer\u2019s browser', variant: 'customer' });
    var y = b.y;
    var pw = narrow ? Math.min(196, b.w * 0.48) : b.w;
    E('rect', { x: b.x, y: y, width: pw, height: 18, rx: 9, 'class': 'urlbar' }, b.g);
    T(b.g, b.x + 8, y + 12.5, fit(page.kind === 'form' || page.kind === 'saved' ? 'shop.example/upload' : 'shop.example/photos/photo-17', pw - 14, 10.5, true), 'url-text');
    y += 24;
    var pageH = narrow ? 58 : 100;
    E('rect', { x: b.x, y: y, width: pw, height: pageH, rx: 3, 'class': 'page' }, b.g);
    if (s.request) T(b.g, b.x + pw - 6, y + 13, 'last response \u00b7 ' + s.request.id + ' \u00b7 ' + s.request.at.slice(0, 5), 'page-small', { 'text-anchor': 'end' });
    var py = y + (s.request ? 30 : 18);
    if (page.kind === 'form') {
      T(b.g, b.x + 8, py, 'Upload a photo', 'page-strong');
      E('rect', { x: b.x + 8, y: py + 10, width: Math.min(110, pw - 16), height: 18, rx: 3, 'class': 'page-btn' }, b.g);
      T(b.g, b.x + 14, py + 23, 'Choose file\u2026', 'page-small');
    } else if (page.kind === 'saved') {
      T(b.g, b.x + 8, py, '201 Created', 'page-code');
      T(b.g, b.x + 8, py + 20, '\u201cphoto-17 saved\u201d', 'page-strong');
    } else if (page.kind === 'photo') {
      T(b.g, b.x + 8, py, '200 OK', 'page-code');
      var ix = b.x + 8, iy = py + 7, iw = Math.min(pw - 70, 92), ih = y + pageH - iy - 6;
      E('rect', { x: ix, y: iy, width: iw, height: ih, 'class': 'photo-frame' }, b.g);
      E('path', { d: 'M' + (ix + 4) + ',' + (iy + ih - 4) + ' L' + (ix + iw * 0.38) + ',' + (iy + ih * 0.4) + ' L' + (ix + iw * 0.6) + ',' + (iy + ih * 0.7) + ' L' + (ix + iw * 0.75) + ',' + (iy + ih * 0.52) + ' L' + (ix + iw - 4) + ',' + (iy + ih - 4) + ' Z', 'class': 'photo-hill' }, b.g);
      E('circle', { cx: ix + iw * 0.78, cy: iy + ih * 0.28, r: Math.max(3, ih * 0.11), 'class': 'photo-sun' }, b.g);
      T(b.g, ix + iw + 6, iy + 12, 'photo-17', 'page-small mono');
    } else if (page.kind === 'missing') {
      T(b.g, b.x + 8, py, '404 Not Found', 'page-code page-code--bad');
      T(b.g, b.x + 8, py + 20, 'Photo not found', 'page-strong');
    }
    var sideX = narrow ? b.x + pw + 12 : b.x;
    var sideY = narrow ? b.y - 2 : y + pageH + 8;
    var sideW = narrow ? b.w - pw - 12 : b.w;
    T(b.g, sideX, sideY + 12, 'Cookie: ' + (s.browser.cookie ? 'AWSALB \u2192 ' + s.browser.cookie : 'none'), 'small-mono');
    if (s.accepted) {
      var copies = M.photo.copies(s, c);
      T(b.g, sideX, sideY + 32, 'The shop\u2019s promise:', 'small-label');
      stamp(ctx, b.g, sideX, sideY + 38, sideW, copies.length
        ? { kind: 'done', text: 'Shop said \u201csaved\u201d', sub: 'accepted ' + s.accepted.at, changed: ctx.frame.event && ctx.frame.event.key === 'upload' }
        : { kind: 'broken', text: 'Promise broken', sub: 'no copy exists', changed: ctx.frame.event && ctx.frame.event.key === 'replace' });
    }

    // ALB
    var a = box(ctx, 'alb', { title: 'Application Load Balancer (ALB) · internet-facing', status: ['active', 'ok'] });
    var tx = a.x, ty = a.y + 12;
    T(a.g, tx, ty - (narrow ? 2 : 0), 'Targets:', 'small-label');
    tx += narrow ? 0 : 54;
    if (narrow) ty += 15;
    ['i-0a1', 'i-0b1', 'i-0a2'].forEach(function (id) {
      var inst = s.instances[id];
      if (inst.status === 'absent') return;
      var h = s.alb.targets[id];
      var label = id + ' ' + (h || 'removed');
      var kind = h === 'healthy' ? 'ok' : h === 'initial' ? 'pending' : 'bad';
      var w = pill(a.g, tx, ty, label, kind, false);
      tx += w + 8;
    });
    T(a.g, narrow ? a.x + a.w : a.x + a.w - 150, narrow ? a.y + 10 : a.y + 34, 'Stickiness: ' + (c.sticky ? 'on (cookie)' : 'off'), 'small-label', narrow ? { 'text-anchor': 'end' } : null);

    // Instances
    ['i-0a1', 'i-0b1', 'i-0a2'].forEach(function (id) {
      var inst = s.instances[id];
      if (inst.status === 'absent') return;
      var st = { running: ['running', 'ok'], impaired: ['impaired', 'bad'], terminated: ['terminated', 'bad'], launching: ['launching', 'pending'] }[inst.status];
      var bx = box(ctx, id, { title: inst.name + ' · EC2 ' + id, status: st, down: inst.status === 'terminated' || inst.status === 'impaired' });
      var yy = bx.y + 2;
      T(bx.g, bx.x, yy + 9, 'AZ ' + inst.az + (c.storage === 's3' ? ' · app uses S3 API' : ' · app saves to local disk'), 'small-label');
      yy += 18;
      var volH = bx.r.y + bx.r.h - 8 - yy;
      E('rect', { x: bx.x, y: yy, width: bx.w, height: volH, rx: 4, 'class': 'vol' }, bx.g);
      T(bx.g, bx.x + 6, yy + 13, 'Instance store · /uploads', 'vol-label');
      var ry = yy + 20;
      var files = keys(inst.files);
      files.forEach(function (f) {
        var fr = inst.files[f];
        // Make "not reachable" visibly different from "destroyed": the record
        // stays solid and says why the current request cannot use it.
        var req = s.request && ctx.frame.event && ctx.frame.event.req ? s.request : null;
        var missedBy = req && !req.found && req.server !== id ? req.id : null;
        var rec = { id: fr.id, detail: '/uploads/' + f + ' \u00b7 ' + fr.size + ' \u00b7 ' + fr.at.slice(0, 5), state: 'normal', badge: null, comp: id, recKey: f };
        if (ctx.changedRec[id + '|' + f]) { rec.state = 'new'; rec.badge = 'NEW'; }
        else if (inst.status === 'impaired') { rec.state = 'unreachable'; rec.badge = 'UNREACHABLE'; rec.detail = 'intact on disk \u00b7 instance impaired'; }
        else if (missedBy) { rec.badge = 'INTACT'; rec.detail = 'not reachable by ' + missedBy; }
        ry += card(ctx, bx.g, bx.x + 6, ry, bx.w - 12, rec) + 4;
      });
      s.erased.filter(function (e) { return e.instance === id; }).forEach(function (e) {
        ry += card(ctx, bx.g, bx.x + 6, ry, bx.w - 12, { id: e.id, detail: 'erased with the instance \u00b7 ' + e.at.slice(0, 5), state: 'destroyed', badge: 'ERASED', comp: id, recKey: e.file }) + 4;
      });
      if (!files.length && !s.erased.some(function (e) { return e.instance === id; })) {
        T(bx.g, bx.x + 8, ry + 12, c.storage === 's3' ? '(no uploads kept here)' : '(empty)', 'empty-note');
      }
    });

    // Shared storage: an S3 bucket in the S3 design; in the local design the
    // same place is marked empty, so the absence of shared storage is visible.
    if (c.storage !== 's3') {
      var rr = ctx.L.comps.bucket;
      var ph = E('g', { 'class': 'placeholder' }, ctx.layer.comps);
      E('rect', { x: rr.x, y: rr.y, width: rr.w, height: rr.h, rx: 6 }, ph);
      T(ph, rr.x + rr.w / 2, rr.y + rr.h / 2 - 2, 'No shared storage for uploads in this design', 'placeholder-text', { 'text-anchor': 'middle' });
      T(ph, rr.x + rr.w / 2, rr.y + rr.h / 2 + 15, 'each upload exists only where it was written', 'placeholder-sub', { 'text-anchor': 'middle' });
    }
    if (c.storage === 's3') {
      var k = box(ctx, 'bucket', { title: 'S3 bucket shop-uploads · S3 Standard', status: ['available', 'ok'] });
      T(k.g, k.x, k.y + 10, narrow ? 'Regional · stored across multiple AZs' : 'Regional service · objects stored redundantly across multiple AZs', 'small-label');
      var oy = k.y + 18;
      var objs = keys(s.bucket.objects);
      objs.forEach(function (o) {
        var ob = s.bucket.objects[o];
        oy += card(ctx, k.g, k.x, oy, Math.min(k.w, 340), { id: ob.id, detail: 'key ' + o + ' \u00b7 ' + ob.size + ' \u00b7 ' + ob.at.slice(0, 5), state: ctx.changedRec['bucket|' + o] ? 'new' : 'normal', badge: ctx.changedRec['bucket|' + o] ? 'NEW' : null, comp: 'bucket', recKey: o }) + 4;
      });
      if (!objs.length) T(k.g, k.x + 2, oy + 14, '(empty)', 'empty-note');
    }
  }

  function drawDatabase(ctx) {
    var s = ctx.state, M = ctx.M;
    var narrow = ctx.layoutName === 'narrow';
    var target = s.dns[s.app.endpoint];
    var ev = ctx.frame.event;

    // Customers: the page last shown, and every order the shop confirmed
    // (completed business effects) to compare with what the database holds.
    var cu = box(ctx, 'customer', { title: 'Customers’ browsers', variant: 'customer' });
    var y = cu.y;
    var p = s.customer.page;
    var pageH = narrow ? 50 : 78;
    E('rect', { x: cu.x, y: y, width: cu.w, height: pageH, rx: 3, 'class': 'page' }, cu.g);
    if (p.kind === 'idle') {
      T(cu.g, cu.x + 6, y + 16, 'shop.example', 'page-small mono');
    } else if (p.kind === 'confirmed') {
      T(cu.g, cu.x + 6, y + 14, s.customer.who + ' · checkout', 'page-small mono');
      T(cu.g, cu.x + 6, y + 32, '✓ Order confirmed', 'page-strong');
      if (!narrow) T(cu.g, cu.x + 6, y + 48, p.order, 'page-small mono');
    } else if (p.kind === 'error') {
      T(cu.g, cu.x + 6, y + 14, s.customer.who + ' · order page', 'page-small mono');
      T2(cu.g, cu.x + 6, y + 30, '\u26a0 Temporarily unavailable \u2014 please retry', cu.w - 12, narrow ? 11 : 12, 'page-strong page-bad page-wrap', narrow ? 13 : 15, false, true);
    } else if (p.kind === 'orders') {
      T(cu.g, cu.x + 6, y + 14, s.customer.who + ' · My orders', 'page-small mono');
      if (!p.orders.length) T(cu.g, cu.x + 6, y + 33, 'You have no orders', 'page-strong page-bad');
      p.orders.forEach(function (o, i) { T(cu.g, cu.x + 6 + (narrow ? i * 84 : 0), y + 32 + (narrow ? 0 : i * 16), '▪ ' + o, 'page-strong mono'); });
    }
    y += pageH + 8;
    T(cu.g, cu.x, y + 8, 'Confirmed to customers:', 'small-label');
    y += 13;
    var cols = narrow ? 2 : 1;
    var sw = (cu.w - (cols - 1) * 4) / cols;
    s.confirmed.forEach(function (x, i) {
      var cx = cu.x + (i % cols) * (sw + 4), cy = y + Math.floor(i / cols) * (narrow ? 21 : 24);
      stamp(ctx, cu.g, cx, cy, sw, { kind: 'done', text: narrow ? x.order : x.order + ' \u00b7 ' + x.customer, compact: narrow, changed: ev && ev.order && ev.order.id === x.order });
    });

    // Operator
    var op = box(ctx, 'operator', { title: 'Operator’s SQL console', variant: 'customer' });
    if (s.operator) {
      var hh = T2(op.g, op.x, op.y + 10, s.operator.sql, op.w, 10.5, 'small-mono', 13, true);
      T(op.g, op.x, op.y + 18 + hh, '→ ' + s.operator.result + ' (committed)', 'small-strong');
      T2(op.g, op.x, op.y + 35 + hh, 'meant: cust-77, a test account', op.w, 10.5, 'small-label', 13);
    } else {
      T(op.g, op.x, op.y + 12, '(idle)', 'empty-note');
    }

    // Application
    var connected = s.app.connection === 'open';
    var ap = box(ctx, 'app', { title: 'Order application (EC2)', status: connected ? ['connected', 'ok'] : ['disconnected', 'bad'] });
    T(ap.g, ap.x, ap.y + 10, 'DB endpoint: ' + s.app.endpoint, 'small-mono');
    T(ap.g, ap.x, ap.y + 25, fit('→ ' + M.database.instanceName(s, target), ap.w, 10.5), 'small-label');
    T(ap.g, ap.x, ap.y + 42, 'Confirmed orders missing here:', 'small-label');
    if (connected) {
      var rows = s.db[target].rows;
      var missing = s.confirmed.filter(function (x) { return !rows[x.order]; }).map(function (x) { return x.order; });
      T(ap.g, ap.x, ap.y + 57, fit(missing.length ? '✕ ' + missing.join(', ') : '✓ none', ap.w, 11.5, false, true), missing.length ? 'small-strong bad' : 'small-strong ok');
    } else {
      T(ap.g, ap.x, ap.y + 57, '— cannot check: no connection', 'small-strong bad');
    }

    // DNS
    var dn = box(ctx, 'dns', { title: 'DNS records (endpoints)' });
    T(dn.g, dn.x, dn.y + 10, 'orders-db', 'small-mono');
    T(dn.g, dn.x, dn.y + 25, fit('→ ' + M.database.instanceName(s, s.dns['orders-db']), dn.w, 10.5), 'small-label');
    T(dn.g, dn.x, dn.y + 43, 'orders-db-restored', 'small-mono');
    T(dn.g, dn.x, dn.y + 58, s.dns['orders-db-restored'] ? '→ the restored instance' : '→ (does not exist)', 'small-label');

    // The two copies of the Multi-AZ DB instance
    ['db-a', 'db-b'].forEach(function (id) {
      var d = s.db[id];
      var failed = d.status === 'failed';
      var role = failed ? 'Failed primary' : d.role === 'primary' ? 'Primary (writer)' : d.role === 'standby' ? 'Standby (no reads)' : 'Former primary';
      var bx = box(ctx, id, { title: role + ' · AZ ' + d.az, status: failed ? ['failed', 'bad'] : ['available', 'ok'], down: failed });
      dbRows(ctx, bx, id, d, s, failed);
    });

    // Snapshot: a retained historical copy
    var sn = box(ctx, 'snapshot', { title: 'snap-0900 · taken 09:00', variant: 'historic', status: ['retained', 'info'] });
    var sy = sn.y;
    sy += T2(sn.g, sn.x, sy + 8, 'Manual DB snapshot kept by RDS. Not queryable: restore it first.', sn.w, 10.5, 'small-label', 13) + 2;
    var sk = keys(s.snapshot.rows).sort();
    if (narrow) {
      sk.forEach(function (id) {
        var r0 = s.snapshot.rows[id];
        sy += card(ctx, sn.g, sn.x, sy, sn.w, { id: id, detail: r0.customer + ' · ' + r0.placedAt.slice(0, 5), state: 'historic' }) + 3;
      });
    } else {
      var cw = (sn.w - 8) / 3;
      sk.forEach(function (id, i) {
        card(ctx, sn.g, sn.x + i * (cw + 4), sy, cw, { id: id, detail: s.snapshot.rows[id].customer + ' · ' + s.snapshot.rows[id].placedAt.slice(0, 5), state: 'historic' });
      });
    }

    // Restored DB instance: a separate database created from the snapshot
    var r = s.db['db-r'];
    if (r.status !== 'absent') {
      var rb = box(ctx, 'db-r', { title: 'orders-db-restored', status: r.status === 'creating' ? ['creating', 'pending'] : ['available', 'ok'] });
      if (r.status === 'creating') {
        T2(rb.g, rb.x, rb.y + 12, 'New DB instance being restored from snap-0900. Own endpoint; nothing is overwritten.', rb.w, 11, 'small-label', 14);
      } else {
        var have = keys(r.rows).sort();
        var absent = s.confirmed.filter(function (x) { return !r.rows[x.order]; }).map(function (x) { return x.order; });
        if (narrow) {
          var ry = rb.y;
          have.forEach(function (id) { ry += card(ctx, rb.g, rb.x, ry, rb.w, { id: id, detail: 'from snap-0900', state: ctx.changedRec['db-r|' + id] ? 'new' : 'normal', comp: 'db-r', recKey: id }) + 3; });
          absent.forEach(function (id) { ry += card(ctx, rb.g, rb.x, ry, rb.w, { id: id, detail: 'confirmed later; not in this copy', state: 'absent', badge: 'ABSENT' }) + 3; });
        } else {
          var colW = (rb.w - 8) / 2;
          T(rb.g, rb.x, rb.y + 8, 'From snap-0900 (09:00):', 'small-label');
          T(rb.g, rb.x + colW + 8, rb.y + 8, 'Confirmed later, not here:', 'small-label');
          var ya = rb.y + 14, yb = rb.y + 14;
          have.forEach(function (id) { ya += card(ctx, rb.g, rb.x, ya, colW, { id: id, state: ctx.changedRec['db-r|' + id] ? 'new' : 'normal', comp: 'db-r', recKey: id }) + 2; });
          absent.forEach(function (id) { yb += card(ctx, rb.g, rb.x + colW + 8, yb, colW, { id: id, state: 'absent', badge: 'ABSENT' }) + 2; });
        }
      }
    }
  }

  function dbRows(ctx, bx, id, d, s, failed) {
    var y = bx.y;
    var narrow = ctx.layoutName === 'narrow';
    var ids = keys(d.rows).concat(keys(d.deleted)).sort();
    ids.forEach(function (oid) {
      var row = d.rows[oid];
      var del = d.deleted[oid];
      var ch = ctx.changedRec[id + '|' + oid];
      var rec = row
        ? { id: oid, detail: row.customer + ' · ' + row.item + ' · ' + row.placedAt.slice(0, 5), state: failed ? 'unreachable' : ch ? 'new' : 'normal', badge: failed ? 'UNREACHABLE' : ch ? 'NEW' : null, comp: id, recKey: oid }
        : { id: oid, detail: 'deleted ' + del.at.slice(0, 5) + ' by the DELETE', state: 'deleted', badge: 'DELETED', comp: id, recKey: oid };
      if (narrow) rec.detail = row ? row.customer + ' · ' + row.placedAt.slice(0, 5) : 'deleted ' + del.at.slice(0, 5);
      y += card(ctx, bx.g, bx.x, y, bx.w, rec) + 3;
    });
  }

  function drawPayment(ctx) {
    var s = ctx.state, c = ctx.config, M = ctx.M;
    var narrow = ctx.layoutName === 'narrow';
    var msgs = s.queue.messages;

    // Checkout (producer)
    var ck = box(ctx, 'checkout', { title: 'Checkout service', status: ['running', 'ok'] });
    var sent = keys(msgs);
    T2(ck.g, ck.x, ck.y + 10, narrow ? 'Producer · sends one message per payment' : 'Producer: one message per payment', ck.w, 10.5, 'small-label', 13);
    T(ck.g, ck.x, ck.y + (narrow ? 30 : 46), 'Sent: ' + (sent.length ? sent.join(', ') : 'nothing yet'), 'small-mono');

    // Queue
    var q = box(ctx, 'queue', { title: 'SQS Standard queue · payments', status: ['available', 'ok'] });
    var qh = T2(q.g, q.x, q.y + 9, 'Visibility timeout 30 s \u00b7 a message stays in the queue until it is deleted', q.w, 10.5, 'small-label', 13);
    var qy = q.y + 6 + qh;
    ['m-42', 'm-43'].forEach(function (id) {
      var m = msgs[id];
      if (!m) return;
      var ch = ctx.changedRec['queue|' + id];
      qy += msgCard(ctx, q.g, q.x, qy, q.w, m, ch) + 8;
    });
    if (!sent.length) T(q.g, q.x + 2, qy + 14, '(empty)', 'empty-note');

    // Workers
    ['W1', 'W2'].forEach(function (id) {
      var w = s.workers[id];
      var st = { idle: ['idle', 'idle'], processing: ['processing', 'busy'], crashed: ['crashed', 'bad'] }[w.status];
      var b = box(ctx, id, { title: 'Worker ' + id, status: st, down: w.status === 'crashed' });
      T(b.g, b.x, b.y + 10, 'Memory:', 'small-label');
      if (w.status === 'crashed') {
        T(b.g, b.x, b.y + 27, '✕ lost in the crash', 'small-strong bad');
      } else if (w.holding) {
        T(b.g, b.x, b.y + 27, w.holding + ' · ' + w.receipt, 'small-mono');
        T(b.g, b.x, b.y + 42, 'receipt handle, in memory only', 'small-label');
      } else {
        T(b.g, b.x, b.y + 27, '(nothing held)', 'empty-note');
      }
        var last = ctx.frame.event && ctx.frame.event.worker === id ? ctx.frame.event : null;
      if (last && (last.key === 'charge-1' || last.key === 'charge-2' || last.key === 'process-43') && s.last) {
        T(b.g, b.x, b.y + (narrow ? 60 : 64), 'Processor replied:', 'small-label');
        T(b.g, b.x, b.y + (narrow ? 75 : 79), fit(s.last.result === 'existing' ? 'already done \u2192 ' + s.last.charge : s.last.result === 'skipped' ? 'skipped (marked)' : 'charged \u2192 ' + s.last.charge, b.w, 11, false, true), s.last.result === 'new' && s.processor.charges.filter(function (x) { return x.payment === s.last.payment; }).length > 1 ? 'small-strong bad' : 'small-strong');
      }
    });

    // processed-payments table (naive design only)
    if (c.design === 'checked') {
      var pb = box(ctx, 'processed', { title: 'processed-payments table', status: ['available', 'ok'] });
      T2(pb.g, pb.x, pb.y + 10, 'Shop database, outside the workers', pb.w, 10, 'small-label', 12);
      var py = pb.y + 26;
      var pk = keys(s.processed);
      pk.forEach(function (k) {
        py += card(ctx, pb.g, pb.x, py, pb.w, { id: k, detail: 'marked by ' + s.processed[k].by + ' ' + s.processed[k].at, state: ctx.changedRec['processed|' + k] ? 'new' : 'normal', badge: ctx.changedRec['processed|' + k] ? 'NEW' : null, comp: 'processed', recKey: k }) + 3;
      });
      if (!pk.length) T(pb.g, pb.x + 2, py + 12, '(no rows)', 'empty-note');
    }

    // Tally: attempts versus completed charges
    var t = box(ctx, 'tally', { title: narrow ? 'Attempts vs charges' : 'Processing attempts vs completed charges', variant: 'panel' });
    var ty = t.y + 4;
    ['payment-42', 'payment-43'].forEach(function (p) {
      var n = M.payment.counts(s, p);
      if (!msgs['m-' + p.slice(-2)]) return;
      T(t.g, t.x, ty + 10, p, 'small-mono strong');
      var col = narrow ? t.x : t.x + 100;
      var row1 = narrow ? ty + 26 : ty + 10;
      T(t.g, col, row1, 'attempts', 'small-label');
      for (var i = 0; i < n.attempts; i++) {
        E('circle', { cx: col + 62 + i * 16, cy: row1 - 4, r: 5.5, 'class': 'tally-attempt' }, t.g);
      }
      T(t.g, col + 62 + Math.max(n.attempts, 1) * 16, row1, String(n.attempts), 'small-strong');
      var row2 = row1 + 18;
      T(t.g, col, row2, 'charges', 'small-label');
      var dup = n.charges > 1;
      for (var j = 0; j < n.charges; j++) {
        var cx = col + 56 + j * 16;
        E('rect', { x: cx, y: row2 - 10, width: 12, height: 12, rx: 2, 'class': 'tally-charge' + (j > 0 ? ' is-dup' : '') }, t.g);
        T(t.g, cx + 2, row2 - 0.5, '✓', 'tally-check');
      }
      T(t.g, col + 62 + Math.max(n.charges, 1) * 16, row2, String(n.charges) + (dup ? ' — DUPLICATE' : ''), dup ? 'small-strong bad' : 'small-strong');
      ty += narrow ? 58 : 44;
    });
    if (!msgs['m-42']) T(t.g, t.x + 2, ty + 12, '(nothing sent yet)', 'empty-note');

    // Payment processor (external)
    var pr = box(ctx, 'processor', { title: 'Payment processor (simulated)', variant: 'external', status: ['available', 'ok'] });
    T2(pr.g, pr.x, pr.y + 10, c.design === 'idempotent' ? 'Durable ledger + idempotency records, written atomically' : 'Durable ledger, outside the workers', pr.w, 10, 'small-label', 12);
    var y2 = pr.y + (narrow ? 22 : 30);
    T(pr.g, pr.x, y2 + 8, 'Charges (business effects):', 'small-label');
    y2 += 14;
    s.processor.charges.forEach(function (chg) {
      y2 += stamp(ctx, pr.g, pr.x, y2, pr.w, { kind: chg.duplicate ? 'duplicate' : 'done', text: chg.id + ' · ' + chg.payment + (chg.duplicate ? ' · AGAIN' : ''), sub: chg.amount + ' · ' + chg.at, changed: !!ctx.changedRec['processor|' + chg.id] }) + 3;
    });
    if (!s.processor.charges.length) { T(pr.g, pr.x + 2, y2 + 12, '(none)', 'empty-note'); y2 += 18; }
    if (c.design === 'idempotent') {
      y2 += 6;
      T(pr.g, pr.x, y2 + 8, 'Idempotency records:', 'small-label');
      y2 += 14;
      var kk = keys(s.processor.keys);
      kk.forEach(function (k) {
        var matched = ctx.frame.changes.some(function (x) { return x.comp === 'processor' && x.rec === k && x.kind === 'matched'; });
        y2 += card(ctx, pr.g, pr.x, y2, pr.w, { id: k + ' → ' + s.processor.keys[k], state: matched ? 'matched' : ctx.changedRec['processor|' + k] ? 'new' : 'normal', badge: matched ? 'MATCHED' : ctx.changedRec['processor|' + k] ? 'NEW' : null, comp: 'processor', recKey: k }) + 3;
      });
      if (!kk.length) T(pr.g, pr.x + 2, y2 + 12, '(none)', 'empty-note');
    }

    // Customer statement: what cust-7 actually paid (the visible result)
    var st2 = box(ctx, 'statement', { title: 'cust-7\u2019s card statement', variant: 'customer' });
    var mine = s.processor.charges.filter(function (x) { return x.customer === 'cust-7'; });
    var sy = st2.y + 2;
    mine.forEach(function (x) {
      var cls = x.duplicate ? 'small-mono bad' : 'small-mono';
      T(st2.g, st2.x, sy + 10, x.at + '  ' + x.amount, cls);
      T(st2.g, st2.x + st2.w, sy + 10, x.payment, x.duplicate ? 'small-strong bad' : 'small-label', { 'text-anchor': 'end' });
      if (x.duplicate) { T(st2.g, st2.x + st2.w, sy + 23, 'DUPLICATE of an earlier charge', 'small-strong bad', { 'text-anchor': 'end' }); sy += 13; }
      sy += 16;
    });
    if (!mine.length) T(st2.g, st2.x + 2, sy + 12, '(no charges)', 'empty-note');
    else {
      var orders = keys(msgs).length;
      E('line', { x1: st2.x, y1: sy + 1, x2: st2.x + st2.w, y2: sy + 1, 'class': 'statement-rule' }, st2.g);
      T(st2.g, st2.x, sy + 16, 'Paid \u20ac' + (49 * mine.length).toFixed(2) + ' for ' + orders + ' order' + (orders === 1 ? '' : 's'), mine.length > orders ? 'small-strong bad' : 'small-strong');
    }
  }

  function msgCard(ctx, g, x, y, w, m, changed) {
    var h = m.state === 'deleted' ? 34 : 58;
    var state = m.state === 'in-flight' ? 'inflight' : m.state === 'visible' ? 'visible' : 'deleted';
    var c = E('g', { 'class': 'rec msg rec--' + state + (changed ? ' is-changed' : ''), 'data-rec': 'queue|' + m.id }, g);
    var f = 8;
    E('path', { d: 'M' + x + ',' + y + ' H' + (x + w - f) + ' L' + (x + w) + ',' + (y + f) + ' V' + (y + h) + ' H' + x + ' Z', 'class': 'rec-shape' }, c);
    E('path', { d: 'M' + (x + w - f) + ',' + y + ' V' + (y + f) + ' H' + (x + w), 'class': 'rec-fold' }, c);
    var head = m.id + ' · ' + m.payment + ' · ' + m.amount;
    T(c, x + 8, y + 15, fit(head, w - 16, 12, true), 'rec-id');
    if (m.state === 'deleted') {
      E('line', { x1: x + 6, y1: y + 11, x2: x + 10 + textWidth(fit(head, w - 16, 12, true), 12, true), y2: y + 11, 'class': 'rec-strike' }, c);
      T(c, x + 8, y + 29, 'DELETED ' + m.deletedAt + ' · received ' + m.receiveCount + '×', 'rec-detail strong');
      return h;
    }
    var stateLine = m.state === 'in-flight' ? '⊘ IN FLIGHT · hidden until ' + m.hiddenUntil : '◉ VISIBLE · any worker may receive it';
    T(c, x + 8, y + 31, fit(stateLine, w - 16, 10.5), 'rec-detail strong');
    T(c, x + 8, y + 47, fit('receive count ' + m.receiveCount + (m.receipt ? ' · current receipt ' + m.receipt : ''), w - 16, 10.5), 'rec-detail');
    return h;
  }

  var DRAW = { photo: drawPhoto, database: drawDatabase, payment: drawPayment };

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  function render(svg, opts) {
    // opts: { study, run, index, layout: 'wide'|'narrow', M, title }
    var run = opts.run, frame = run.frames[opts.index];
    var L = LAYOUTS[opts.study][opts.layout];
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + L.w + ' ' + L.h);
    svg.setAttribute('class', 'ws-drawing ws-' + opts.layout + ' ws-study-' + opts.study);
    var title = E('title', null, svg);
    title.textContent = opts.title || '';
    defs(svg);
    var ctx = {
      L: L, layoutName: opts.layout, state: frame.state, config: run.config, frame: frame, M: opts.M,
      rects: [], placed: [], tagCount: {}, missing: opts.missing || null,
      changedComp: {}, changedRec: {},
      layer: {}
    };
    frame.changes.forEach(function (ch) {
      if (ch.rec) ctx.changedRec[ch.comp + '|' + ch.rec] = ch.kind;
      else ctx.changedComp[ch.comp] = ch.kind;
    });
    ctx.layer.frames = E('g', { 'class': 'layer-frames' }, svg);
    ctx.layer.topo = E('g', { 'class': 'layer-topo' }, svg);
    ctx.layer.cues = E('g', { 'class': 'layer-cues' }, svg);
    ctx.layer.comps = E('g', { 'class': 'layer-comps' }, svg);
    ctx.layer.labels = E('g', { 'class': 'layer-labels' }, svg);
    ctx.layer.tokens = E('g', { 'class': 'layer-tokens' }, svg);
    measurer = E('text', { x: -900, y: -900, visibility: 'hidden', 'aria-hidden': 'true' }, ctx.layer.tokens);
    L.frames.forEach(function (f) { frameBox(ctx, f); });
    DRAW[opts.study](ctx);
    // Topology: faint lines for connections that exist in this design.
    topology(ctx, opts.study);
    var drawn = [];
    frame.cues.forEach(function (cue, i) { var d = drawCue(ctx, cue, i); if (d) drawn.push(d); });
    // Cues are drawn below components so boxes stay readable; move the cue
    // layer above the components when a path would otherwise be hidden.
    svg.appendChild(ctx.layer.cues);
    svg.appendChild(ctx.layer.labels);
    svg.appendChild(ctx.layer.tokens);
    if (measurer && measurer.parentNode) measurer.parentNode.removeChild(measurer);
    measurer = null;
    return { drawn: drawn, ctx: ctx, svg: svg };
  }

  function topology(ctx, study) {
    var s = ctx.state, c = ctx.config, L = ctx.L;
    var list = [];
    if (study === 'photo') {
      list.push('browser>alb');
      ['i-0a1', 'i-0b1', 'i-0a2'].forEach(function (id) {
        if (s.instances[id].status === 'absent') return;
        list.push('alb>' + id);
        if (c.storage === 's3') list.push(id + '>bucket');
      });
    } else if (study === 'database') {
      // Only connections that exist at this moment: the application's current
      // database, replication from the primary to an available standby, the
      // operator's session to the primary, and the restore lineage.
      var target = s.dns[s.app.endpoint];
      list.push('customer>app');
      if (s.app.connection === 'open') list.push('app>' + target);
      ['db-a', 'db-b'].forEach(function (id) {
        var other = id === 'db-a' ? 'db-b' : 'db-a';
        if (s.db[id].role === 'primary' && s.db[id].status === 'available' && s.db[other].role === 'standby' && s.db[other].status === 'available') list.push(id + '>' + other);
      });
      if (s.db['db-a'].role === 'primary' && s.db['db-a'].status === 'available') list.push('operator>db-a');
      if (s.db['db-r'].status !== 'absent') list.push('snapshot>db-r');
    } else {
      list.push('checkout>queue', 'W1>queue', 'W2>queue', 'W1>processor', 'W2>processor');
      if (c.design === 'checked') list.push('W1>processed', 'W2>processed');
    }
    list.forEach(function (k) {
      var parts = k.split('>');
      var pts = linkPoints(L, parts[0], parts[1]);
      if (!pts) return;
      E('polyline', { points: ptsAttr(pts), 'class': 'topo' }, ctx.layer.topo);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Animation                                                           */
  /* ------------------------------------------------------------------ */

  // Plays the frame's cues in order: a token travels along each path; records
  // changed by the event appear when the cue reaching their component lands.
  // Returns a controller with finish() so the user can skip ahead.
  function animate(result, done) {
    var drawn = result.drawn, svg = result.svg;
    var tokens = result.ctx.layer.tokens;
    var pending = Array.prototype.slice.call(svg.querySelectorAll('.is-changed'));
    pending.forEach(function (el) { el.classList.add('is-pending'); });
    drawn.forEach(function (d) {
      if (d.g) d.g.classList.add('is-waiting');
      if (d.label) d.label.classList.add('is-waiting');
      if (d.tag) d.tag.classList.add('is-waiting');
    });
    var i = 0, raf = null, timer = null, finished = false;
    function reveal(compId) {
      pending.forEach(function (el) {
        var key = el.getAttribute('data-rec') || el.getAttribute('data-comp') || '';
        if (!compId || key === compId || key.indexOf(compId + '|') === 0) el.classList.remove('is-pending');
      });
    }
    function finish() {
      if (finished) return;
      finished = true;
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      while (tokens.firstChild) tokens.removeChild(tokens.firstChild);
      drawn.forEach(function (d) {
        if (d.g) d.g.classList.remove('is-waiting');
        if (d.label) d.label.classList.remove('is-waiting');
        if (d.tag) d.tag.classList.remove('is-waiting');
      });
      reveal(null);
      if (done) done();
    }
    function next() {
      if (finished) return;
      if (i >= drawn.length) { reveal(null); timer = setTimeout(finish, 250); return; }
      var d = drawn[i++];
      if (d.g) d.g.classList.remove('is-waiting');
      if (d.tag) {
        d.tag.classList.remove('is-waiting');
        d.tag.classList.add('is-flash');
        reveal(d.target);
        timer = setTimeout(next, 650);
        return;
      }
      var pts = [];
      d.links.forEach(function (l) { pts = pts.concat(l); });
      var stop = d.cue.type === 'blocked' ? 0.5 : 1;
      var len = polyLength(pts) * stop;
      var dur = Math.max(380, Math.min(1100, len * 2.2));
      var tok = E('g', { 'class': 'token token--' + d.cue.type }, tokens);
      if (d.cue.type === 'restore') E('rect', { x: -6, y: -6, width: 12, height: 12, rx: 2 }, tok);
      else {
        E('circle', { r: d.cue.type === 'replication' ? 7 : 6 }, tok);
        if (d.cue.type === 'replication') E('circle', { r: 3.5, 'class': 'token-inner' }, tok);
      }
      var t0 = null;
      function step(ts) {
        if (finished) return;
        if (t0 === null) t0 = ts;
        var u = Math.min(1, (ts - t0) / dur);
        var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        var p = pointAt(pts, e * stop);
        tok.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ')');
        if (u < 1) { raf = requestAnimationFrame(step); return; }
        if (d.label) d.label.classList.remove('is-waiting');
        if (d.cue.type === 'blocked') tok.classList.add('is-stopped');
        else tokens.removeChild(tok);
        if (d.cue.type !== 'blocked' && d.cue.type !== 'ack') reveal(d.target);
        timer = setTimeout(next, 140);
      }
      raf = requestAnimationFrame(step);
    }
    next();
    return { finish: finish, isDone: function () { return finished; } };
  }

  /* ------------------------------------------------------------------ */
  /* Text description (readable step mode)                               */
  /* ------------------------------------------------------------------ */

  function describe(study, run, index, M) {
    var f = run.frames[index], s = f.state, c = run.config, out = [];
    if (study === 'photo') {
      out.push(['Customer’s browser', 'Page: ' + ({ form: 'upload form', saved: '“photo-17 saved” (201)', photo: 'photo-17 shown (200)', missing: '“Photo not found” (404)' }[s.browser.page.kind]) + '. Cookie: ' + (s.browser.cookie || 'none') + '.' + (s.accepted ? ' Business action: upload accepted at ' + s.accepted.at + '.' : '')]);
      out.push(['Application Load Balancer', 'Targets: ' + keys(s.alb.targets).map(function (t) { return t + ' ' + s.alb.targets[t]; }).join(', ') + '. Stickiness ' + (c.sticky ? 'on' : 'off') + '.']);
      ['i-0a1', 'i-0b1', 'i-0a2'].forEach(function (id) {
        var x = s.instances[id];
        if (x.status === 'absent') return;
        var files = keys(x.files);
        var er = s.erased.filter(function (e) { return e.instance === id; });
        out.push([x.name + ' (' + id + ', AZ ' + x.az + ')', 'Status: ' + x.status + '. Instance store /uploads: ' + (files.length ? files.join(', ') : 'empty') + (er.length ? '; erased: ' + er.map(function (e) { return e.file + ' at ' + e.at; }).join(', ') : '') + '.']);
      });
      if (c.storage === 's3') out.push(['S3 bucket shop-uploads (S3 Standard)', 'Objects: ' + (keys(s.bucket.objects).length ? keys(s.bucket.objects).join(', ') : 'none') + '.']);
    } else if (study === 'database') {
      var target = s.dns[s.app.endpoint];
      out.push(['Customers', s.customer.who ? s.customer.who + ': ' + ({ idle: '—', confirmed: 'order confirmed', error: 'temporarily unavailable', orders: (s.customer.page.orders || []).length ? 'My orders: ' + (s.customer.page.orders || []).join(', ') : 'You have no orders' }[s.customer.page.kind]) : 'No request yet.']);
      out.push(['Confirmed to customers', s.confirmed.map(function (x) { return x.order + ' (' + x.customer + ', ' + x.at.slice(0, 5) + ')'; }).join(', ') + '.']);
      if (s.operator) out.push(['Operator’s console', s.operator.sql + ' → ' + s.operator.result + '.']);
      out.push(['Application', 'Endpoint ' + s.app.endpoint + ' → ' + M.database.instanceName(s, target) + '; connection ' + s.app.connection + '.']);
      ['db-a', 'db-b', 'db-r'].forEach(function (id) {
        var d = s.db[id];
        if (d.status === 'absent') return;
        out.push([M.database.instanceName(s, id), 'Status ' + d.status + '. Orders: ' + (keys(d.rows).length ? keys(d.rows).sort().join(', ') : 'none') + (keys(d.deleted).length ? '. Deleted: ' + keys(d.deleted).sort().join(', ') : '') + '.']);
      });
      out.push(['Snapshot snap-0900 (09:00)', 'Orders: ' + keys(s.snapshot.rows).sort().join(', ') + '. Retained; not queryable until restored.']);
    } else {
      keys(s.queue.messages).forEach(function (id) {
        var m = s.queue.messages[id];
        out.push(['Queue message ' + id, m.payment + ': ' + (m.state === 'in-flight' ? 'in flight, hidden until ' + m.hiddenUntil : m.state === 'visible' ? 'visible' : 'deleted at ' + m.deletedAt) + '; receive count ' + m.receiveCount + '.']);
      });
      ['W1', 'W2'].forEach(function (id) {
        var w = s.workers[id];
        out.push(['Worker ' + id, w.status + (w.holding ? ', holding ' + w.holding + ' with ' + w.receipt + ' (memory only)' : '') + '.']);
      });
      if (c.design === 'checked') out.push(['processed-payments table', keys(s.processed).length ? keys(s.processed).join(', ') : 'no rows']);
      out.push(['Payment processor', 'Charges: ' + (s.processor.charges.length ? s.processor.charges.map(function (x) { return x.id + ' (' + x.payment + (x.duplicate ? ', duplicate' : '') + ')'; }).join(', ') : 'none') + (c.design === 'idempotent' ? '. Idempotency records: ' + (keys(s.processor.keys).length ? keys(s.processor.keys).map(function (k) { return k + ' → ' + s.processor.keys[k]; }).join(', ') : 'none') : '') + '.']);
      ['payment-42', 'payment-43'].forEach(function (p) {
        if (!s.queue.messages['m-' + p.slice(-2)]) return;
        var n = M.payment.counts(s, p);
        out.push([p, 'Processing attempts: ' + n.attempts + '. Completed charges: ' + n.charges + '.']);
      });
    }
    return out;
  }

  root.WhatSurvivesView = {
    layouts: LAYOUTS,
    render: render,
    animate: animate,
    describe: describe,
    linkPoints: linkPoints,
    typeWord: TYPE_WORD,
    circled: CIRCLED
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
