"""Rebuild static/img/moon/moon-00..29.avif (one image per 12 degrees of lunar elongation).
Source photo: Wikimedia Commons "File:Moon nearside LRO.jpg" (NASA/GSFC/Arizona State University,
public domain), 1400x1400, sha1 30b53de66c8662523f03b9e5346cc4e120c9492c. Needs Pillow (with AVIF) + numpy.
Usage: python scripts/make_moon_phases.py <Moon_nearside_LRO.jpg> static/img/moon"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
WORK, FINAL, FRAMES = 640, 160, 30

img = Image.open(SRC).convert("RGB")
gray = np.asarray(img.convert("L"), dtype=np.float32)
ys, xs = np.nonzero(gray > 18)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
r = max(x1 - x0, y1 - y0) / 2
crop = img.crop((int(cx - r), int(cy - r), int(cx + r), int(cy + r))).resize((WORK, WORK), Image.LANCZOS)
base = np.asarray(crop, dtype=np.float32) / 255.0

# Unit-sphere normals for the visible hemisphere (z toward the viewer).
c = (np.arange(WORK) + 0.5) / WORK * 2 - 1
X, Y = np.meshgrid(c, -c)
R2 = X * X + Y * Y
inside = R2 <= 1.0
Z = np.sqrt(np.clip(1 - R2, 0, 1))
dist = np.sqrt(R2)
alpha = np.clip((1.0 - dist) * WORK / 2 + 0.5, 0, 1)  # antialiased limb

earth = np.array([0.80, 0.86, 1.0], dtype=np.float32) * 0.13  # faint bluish earthshine
sizes = []
for k in range(FRAMES):
    e = math.radians(k * 360 / FRAMES)  # 0 new, 90 first quarter, 180 full, 270 last quarter
    s = np.array([math.sin(e), 0.0, -math.cos(e)])
    ndot = X * s[0] + Y * s[1] + Z * s[2]
    t = np.clip((ndot + 0.025) / 0.07, 0, 1)
    lit = t * t * (3 - 2 * t)  # soft terminator
    shade = 0.78 + 0.22 * np.sqrt(np.clip(ndot, 0, 1))
    rgb = base * 1.12 * (lit * shade)[..., None] + base * earth[None, None, :] * (1 - lit)[..., None]
    rgba = np.dstack([np.clip(rgb, 0, 1), alpha * inside])
    out = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").resize((FINAL, FINAL), Image.LANCZOS)
    path = OUT / f"moon-{k:02d}.avif"
    out.save(path, "AVIF", quality=62)
    sizes.append(path.stat().st_size)
print(f"disk r={r:.0f}px center=({cx:.0f},{cy:.0f}); wrote {FRAMES} files, {sum(sizes)/1024:.1f} KB total, max {max(sizes)/1024:.1f} KB")
