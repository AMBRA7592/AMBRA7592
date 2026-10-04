#!/usr/bin/env python3
"""Assemble the verification images in out/checks from rendered PPM frames.

usage: python3 tools/checks.py <checksDir> [browserPng] [--film <framesDir>]

With --film, also measures frame-to-frame change in the rendered film: the change is
split into a smooth part (the light or camera moving) and a fine-grained residual, which
is what would read as shimmer.
"""
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw


def ppm16(path):
    with open(path, 'rb') as f:
        assert f.readline().strip() == b'P6'
        w, h = map(int, f.readline().split())
        f.readline()
        a = np.frombuffer(f.read(), dtype='>u2').reshape(h, w, 3)
    return Image.fromarray((a / 257.0).round().astype(np.uint8))


def ppm16f(path):
    with open(path, 'rb') as f:
        f.readline()
        w, h = map(int, f.readline().split())
        f.readline()
        return np.frombuffer(f.read(), dtype='>u2').reshape(h, w, 3).astype(np.float32) / 257.0


def box(a, r):
    """Mean over a (2r+1)^2 window, edges clamped."""
    p = np.pad(a, ((r + 1, r), (r + 1, r), (0, 0)), mode='edge').cumsum(0).cumsum(1)
    k = 2 * r + 1
    return (p[k:, k:] - p[:-k, k:] - p[k:, :-k] + p[:-k, :-k]) / (k * k)


def temporal(frames_dir):
    names = sorted(n for n in os.listdir(frames_dir) if n.endswith('.ppm'))
    sections = [('opening', 0, 95), ('withdrawal', 96, 191), ('travel', 192, 417)]
    for title, a, b in sections:
        rows = []
        for i in range(a, b, 12):
            if i + 1 >= len(names):
                break
            d = ppm16f(os.path.join(frames_dir, names[i + 1])) - ppm16f(os.path.join(frames_dir, names[i]))
            fine = d - box(d, 4)
            rows.append((np.abs(d).mean(), np.sqrt((fine ** 2).mean())))
        if rows:
            r = np.array(rows)
            print(f'temporal {title}: mean frame-to-frame change {r[:, 0].mean():.2f}/255, '
                  f'fine-grained residual {r[:, 1].mean():.2f}/255 RMS (max {r[:, 1].max():.2f})')


def label(im, text):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 10 + 6 * len(text), 20], fill=(0, 0, 0))
    d.text((5, 4), text, fill=(235, 235, 235))
    return im


def main():
    argv = sys.argv[1:]
    if '--film' in argv:
        i = argv.index('--film')
        temporal(argv[i + 1])
        del argv[i:i + 2]
    sys.argv[1:] = argv
    root = sys.argv[1]
    out = lambda n: os.path.join(root, n)
    # glass removal: same light, camera and exposure
    if os.path.exists(out('removal-with-glass.ppm')):
        a = ppm16(out('removal-with-glass.ppm'))
        b = ppm16(out('removal-without-glass.ppm'))
        diff = np.abs(np.asarray(a, float) - np.asarray(b, float)).mean()
        print('removal: mean difference', round(diff, 2))
        sheet = Image.new('RGB', (a.width, a.height * 2))
        sheet.paste(label(a, 'with the glass'), (0, 0))
        sheet.paste(label(b, 'glass removed: the same photons traced, none land'), (0, a.height))
        sheet.save(out('removal.png'))
    # convergence: crops of the drop and arc at increasing photon counts
    names = [n for n in ['conv-6M', 'conv-24M', 'conv-96M', 'conv-384M'] if os.path.exists(out(n + '.ppm'))]
    if names:
        crops = []
        for n in names:
            im = ppm16(out(n + '.ppm'))
            box = (int(im.width * 0.47), int(im.height * 0.52), int(im.width * 0.97), int(im.height * 0.92))
            c = im.crop(box)
            crops.append(label(c, n.replace('conv-', '') + ' photons'))
        w, h = crops[0].size
        sheet = Image.new('RGB', (w * 2, h * 2))
        for i, c in enumerate(crops):
            sheet.paste(c, ((i % 2) * w, (i // 2) * h))
        sheet.save(out('convergence.png'))
        ref = np.asarray(ppm16(out(names[-1] + '.ppm')), float)
        for n in names[:-1]:
            d = np.abs(np.asarray(ppm16(out(n + '.ppm')), float) - ref).mean()
            print(f'convergence: {n} vs {names[-1]} mean difference {d:.2f}')
    # transition: contact sheet
    frames = sorted(f for f in os.listdir(root) if f.startswith('transition-') and f.endswith('.ppm'))
    if frames:
        pick = frames[::max(1, len(frames) // 8)][:8]
        tiles = [label(ppm16(out(f)).resize((480, 270)), f'frame {int(f[11:14])}') for f in pick]
        sheet = Image.new('RGB', (480 * 4, 270 * 2))
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % 4) * 480, (i // 4) * 270))
        sheet.save(out('transition.png'))
        if shutil.which('ffmpeg'):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '12', '-i', out('transition-%03d.ppm'),
                            '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-c:v', 'libx264', '-crf', '16',
                            '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                            '-colorspace', 'bt709', '-movflags', '+faststart', out('transition.mp4')], check=True)
    # browser against film renderer
    if len(sys.argv) > 2 and os.path.exists(out('film-renderer-640.ppm')):
        a = Image.open(sys.argv[2]).convert('RGB')
        b = ppm16(out('film-renderer-640.ppm'))
        da = np.asarray(a, float); db = np.asarray(b, float)
        d = np.abs(da - db)
        print('browser vs film renderer: mean', round(d.mean(), 2), '95th percentile', round(np.percentile(d, 95), 1))
        sheet = Image.new('RGB', (a.width, a.height * 3))
        sheet.paste(label(a.copy(), 'browser (WebGL2)'), (0, 0))
        sheet.paste(label(b.copy(), 'film renderer (C++)'), (0, a.height))
        amp = Image.fromarray(np.clip(d * 8, 0, 255).astype(np.uint8))
        sheet.paste(label(amp, 'difference x8'), (0, a.height * 2))
        sheet.save(out('browser-vs-film.png'))
    if os.path.exists(out('geometry-clay.ppm')):
        im = ppm16(out('geometry-clay.ppm'))
        d = ImageDraw.Draw(im)
        legend = ['The crystal\'s surfaces rendered opaque (geometry check).',
                  'blue-grey: flat cuts (bowl facets, stem, knop, foot)',
                  'beige: uncut round blank above the arches; pink: half-round rim']
        for i, line in enumerate(legend):
            d.text((24, im.height - 70 + 18 * i), line, fill=(225, 225, 225))
        im.save(out('geometry-clay.png'))


if __name__ == '__main__':
    main()
