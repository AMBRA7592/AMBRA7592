#!/usr/bin/env python3
"""Encode the rendered frames of THE SECOND FORM into the delivery films.

usage: python3 tools/encode.py <framesDir> <outDir> [--hold-start 418] [--fade 12]

Frames are the 16-bit PPMs written by native/render (already tone-mapped with the
shared display transform). The held frame is rendered once at higher quality; the
first frames of the hold blend into it over half a second, the same way the
interactive version refines once the light stops. Outputs:
  the-second-form-1080p.mp4        H.264 High, 8-bit 4:2:0 (wide compatibility)
  the-second-form-1080p-10bit.mp4  H.264 High 10, 4:2:0 (fewer gradient steps)
  poster.png                       the held frame
"""
import os
import subprocess
import sys

import numpy as np

FPS = 24


def read_ppm16(path):
    with open(path, 'rb') as f:
        assert f.readline().strip() == b'P6'
        w, h = map(int, f.readline().split())
        assert int(f.readline()) == 65535
        return np.frombuffer(f.read(), dtype='>u2').reshape(h, w, 3).astype(np.float32) / 65535.0


def main():
    frames_dir, out_dir = sys.argv[1], sys.argv[2]
    args = sys.argv[3:]
    hold = int(args[args.index('--hold-start') + 1]) if '--hold-start' in args else 418
    fade = int(args[args.index('--fade') + 1]) if '--fade' in args else 12
    names = sorted(n for n in os.listdir(frames_dir) if n.startswith('f') and n.endswith('.ppm'))
    n = len(names)
    assert n == int(names[-1][1:5]) + 1, 'missing frames'
    os.makedirs(out_dir, exist_ok=True)
    first = read_ppm16(os.path.join(frames_dir, names[0]))
    h, w = first.shape[:2]
    # static, hash-free dither: triangular noise of one 8-bit step
    rng = np.random.default_rng(1841)
    tri = (rng.random((h, w, 3), dtype=np.float32) + rng.random((h, w, 3), dtype=np.float32) - 1.0)

    common = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart']
    p8 = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}',
                           '-r', str(FPS), '-i', '-', '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'film', '-pix_fmt', 'yuv420p',
                           *common, os.path.join(out_dir, 'the-second-form-1080p.mp4')], stdin=subprocess.PIPE)
    p10 = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', f'{w}x{h}',
                            '-r', str(FPS), '-i', '-', '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
                            '-c:v', 'libx264', '-preset', 'slow', '-crf', '13', '-profile:v', 'high10',
                            '-pix_fmt', 'yuv420p10le', *common, os.path.join(out_dir, 'the-second-form-1080p-10bit.mp4')],
                           stdin=subprocess.PIPE)
    last_travel = read_ppm16(os.path.join(frames_dir, names[hold - 1])) if hold > 0 else None
    held = read_ppm16(os.path.join(frames_dir, names[hold]))
    for i, name in enumerate(names):
        if i >= hold:
            k = i - hold
            if k < fade and last_travel is not None:
                t = (k + 1) / (fade + 1)
                t = t * t * (3 - 2 * t)
                img = last_travel * (1 - t) + held * t
            else:
                img = held
        else:
            img = read_ppm16(os.path.join(frames_dir, name))
        p10.stdin.write(np.clip(np.round(img * 65535.0), 0, 65535).astype('<u2').tobytes())
        p8.stdin.write(np.clip(np.round(img * 255.0 + tri), 0, 255).astype(np.uint8).tobytes())
        if i % 48 == 0:
            print(f'  frame {i}/{n}', flush=True)
    for p in (p8, p10):
        p.stdin.close()
        p.wait()
    from PIL import Image
    Image.fromarray(np.clip(np.round(held * 255.0 + tri), 0, 255).astype(np.uint8)).save(os.path.join(out_dir, 'poster.png'))
    print('done')


if __name__ == '__main__':
    main()
