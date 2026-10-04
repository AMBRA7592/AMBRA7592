#!/usr/bin/env python3
"""Convert 16-bit PPM renders to 8-bit PNG with a one-step triangular dither.

usage: python3 tools/png.py file.ppm [more.ppm ...]   (writes file.png next to each)
"""
import sys

import numpy as np
from PIL import Image

for path in sys.argv[1:]:
    with open(path, 'rb') as f:
        assert f.readline().strip() == b'P6'
        w, h = map(int, f.readline().split())
        f.readline()
        a = np.frombuffer(f.read(), dtype='>u2').reshape(h, w, 3).astype(np.float32) / 65535.0
    rng = np.random.default_rng(1841)
    tri = rng.random(a.shape, dtype=np.float32) + rng.random(a.shape, dtype=np.float32) - 1.0
    Image.fromarray(np.clip(np.round(a * 255.0 + tri), 0, 255).astype(np.uint8)).save(path[:-4] + '.png', optimize=True)
    print(path[:-4] + '.png')
