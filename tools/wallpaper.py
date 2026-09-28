#!/usr/bin/env python3
"""Procedural wallpaper for the wall panel: a dark ground with a few
luminous ribbons and glows, heavily blurred, plus grain so the panel's LCD
does not band. Deterministic per seed. Writes JPEG at 1280x800.

  python3 wallpaper.py out.jpg [seed]
"""
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 800
SS = 2  # supersample for smooth ribbons
out = sys.argv[1] if len(sys.argv) > 1 else "wallpaper.jpg"
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 7
rng = np.random.default_rng(seed)

# Ground: near-black navy, faintly lighter at the top.
y = np.linspace(0, 1, H)[:, None]
ground = np.zeros((H, W, 3), dtype=np.float32)
top = np.array([16, 22, 32], dtype=np.float32)
bottom = np.array([7, 10, 15], dtype=np.float32)
ground[:] = top * (1 - y)[..., None] + bottom * y[..., None]

# Palette: cool blues and teal with a single warm amber, all below 80% saturation.
COLOURS = {
    "indigo": (56, 84, 170),
    "sky": (120, 160, 230),
    "teal": (26, 132, 140),
    "mint": (110, 210, 200),
    "amber": (224, 160, 80),
    "gold": (255, 214, 150),
    "rose": (140, 66, 104),
}


def ribbon(draw, colour, cx, cy, amp, freq, phase, width, length, tilt):
    """A wide sinusoidal band drawn as a thick polyline (in supersampled px)."""
    pts = []
    for i in range(0, length, 6):
        t = i / length
        x = cx + (i - length / 2)
        yy = cy + amp * math.sin(freq * t * math.tau + phase)
        # tilt the whole ribbon
        xr = cx + (x - cx) * math.cos(tilt) - (yy - cy) * math.sin(tilt)
        yr = cy + (x - cx) * math.sin(tilt) + (yy - cy) * math.cos(tilt)
        pts.append((xr, yr))
    draw.line(pts, fill=colour, width=width, joint="curve")


def glow_layer(colour, blur, draw_fn):
    layer = Image.new("RGB", (W * SS, H * SS), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    draw_fn(d, colour)
    layer = layer.resize((W, H), Image.LANCZOS)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(layer, dtype=np.float32)


def screen(base, layer, strength):
    """Screen blend with a strength multiplier."""
    l = layer * strength
    return 255 - (255 - base) * (255 - l) / 255


img = ground.copy()

# Three ribbons: indigo across the top left, teal sweeping low right, amber
# a narrow warm thread through the middle right. Positions jitter by seed.
j = lambda s: float(rng.uniform(-s, s))
specs = [
    # (colour, geometry, blur, strength). Each ribbon is drawn twice: a wide soft
    # band and a narrow bright core along the same path, which is what makes it
    # read as a lit ribbon of liquid rather than a fog bank.
    ("indigo", dict(cx=330 + j(60), cy=170 + j(40), amp=80, freq=1.1, phase=0.4, width=260, length=1500, tilt=-0.30), 90, 0.75),
    ("sky",    dict(cx=330 + j(60), cy=170 + j(40), amp=80, freq=1.1, phase=0.4, width=60, length=1500, tilt=-0.30), 30, 0.55),
    ("teal",   dict(cx=1020 + j(60), cy=690 + j(40), amp=90, freq=1.0, phase=2.1, width=300, length=1600, tilt=0.20), 100, 0.70),
    ("mint",   dict(cx=1020 + j(60), cy=690 + j(40), amp=90, freq=1.0, phase=2.1, width=56, length=1600, tilt=0.20), 28, 0.50),
    ("amber",  dict(cx=760 + j(40), cy=360 + j(30), amp=48, freq=1.5, phase=1.0, width=120, length=1500, tilt=-0.10), 70, 0.55),
    ("gold",   dict(cx=760 + j(40), cy=360 + j(30), amp=48, freq=1.5, phase=1.0, width=22, length=1500, tilt=-0.10), 14, 0.55),
]
for name, kw, blur, strength in specs:
    kw = {k: (v * SS if k in ("cx", "cy", "amp", "width", "length") else v) for k, v in kw.items()}
    layer = glow_layer(COLOURS[name], blur, lambda d, c, kw=kw: ribbon(d, c, **kw))
    img = screen(img, layer, strength)

# Two soft round glows for depth: one rose low left, one indigo top right.
def blob(cx, cy, r):
    def f(d, c):
        d.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=c)
    return f

img = screen(img, glow_layer(COLOURS["rose"], 150, blob(150 + j(60), 740 + j(40), 240)), 0.38)
img = screen(img, glow_layer(COLOURS["indigo"], 170, blob(1200 + j(60), 60 + j(40), 280)), 0.40)

# Vignette so the edges stay dark and the cards read as lit from within.
xx = np.linspace(-1, 1, W)[None, :]
yy = np.linspace(-1, 1, H)[:, None]
vig = 1 - 0.22 * np.clip((xx**2 + yy**2) - 0.35, 0, 1.4)
img *= vig[..., None]

# Grain: kills banding on the panel's 8-bit LCD.
img += rng.normal(0, 2.2, img.shape).astype(np.float32)

Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(out, quality=88, optimize=True, subsampling=0)
print(out, seed)
