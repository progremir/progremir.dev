"""Trace the mountains south of Almaty and print the SVG used on the site.

The ridge on the homepage is the real horizon seen from the north of the city,
looking south across the Ile Alatau (azimuth 120° to 180°). Elevation comes
from SRTM data served as AWS Terrain Tiles. Each layer keeps the highest
elevation angle within a distance band: the foothills (20 km), the front range
(30 km) and the snowy crest behind it. Like most mountain panoramas, the
drawing is three times taller than true scale so the peaks read as they do
in person.

    pip install numpy pillow
    python3 scripts/skyline.py

Copy the printed viewBox and paths into the three .layer svgs in
site/index.html and site/404.html. Units are degrees: x is azimuth, y is minus
the elevation angle. Set --relief in style.css to RELIEF * height / width of
the viewBox.
"""
import math
import os
import tempfile
import urllib.request

import numpy as np
from PIL import Image

LAT0, LON0, EYE = 43.400, 76.950, 25.0  # north of the city, a few floors up
Z = 12                                  # tile zoom, about 28 m per pixel here
R_EARTH, REFRACTION = 6371000.0, 0.13
AZ_FROM, AZ_TO, AZ_STEP = 110.0, 250.0, 0.05
WINDOW = (120.0, 180.0)
RELIEF = 3.0                            # vertical exaggeration
D_MAX = 75000.0
LAYERS = {"near": 20000, "mid": 30000, "far": D_MAX}
TOLERANCE = 0.45                        # simplification, in pixels at 1440 wide
CACHE = os.path.join(tempfile.gettempdir(), "terrain-tiles")


def tile_xy(lat, lon):
    n = 2 ** Z
    return (lon + 180) / 360 * n, (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n


def destination(az, d):
    p1, l1 = math.radians(LAT0), math.radians(LON0)
    th, dr = np.radians(az), d / R_EARTH
    p2 = np.arcsin(np.sin(p1) * np.cos(dr) + np.cos(p1) * np.sin(dr) * np.cos(th))
    l2 = l1 + np.arctan2(np.sin(th) * np.sin(dr) * np.cos(p1), np.cos(dr) - np.sin(p1) * np.sin(p2))
    return np.degrees(p2), np.degrees(l2)


def load_elevation():
    edge = np.arange(AZ_FROM - 5, AZ_TO + 5.1, 2.5)
    lat, lon = destination(edge, D_MAX)
    lat, lon = np.append(lat, LAT0 + 0.02), np.append(lon, LON0)
    x0, y0 = tile_xy(lat.max(), lon.min())
    x1, y1 = tile_xy(lat.min(), lon.max())
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    os.makedirs(CACHE, exist_ok=True)
    grid = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            path = os.path.join(CACHE, f"{Z}_{tx}_{ty}.png")
            if not os.path.exists(path):
                url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
                urllib.request.urlretrieve(url, path)
            rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
            h = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
            grid[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = h

    def sample(lat, lon):
        x, y = tile_xy(lat, lon)
        px, py = (x - tx0) * 256 - 0.5, (y - ty0) * 256 - 0.5
        ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
        fx, fy = px - ix, py - iy
        top = grid[iy, ix] * (1 - fx) + grid[iy, ix + 1] * fx
        bottom = grid[iy + 1, ix] * (1 - fx) + grid[iy + 1, ix + 1] * fx
        return top * (1 - fy) + bottom * fy

    return sample


def horizon(sample):
    """Highest elevation angle per azimuth, cumulative over each distance band."""
    h0 = float(sample(np.array([LAT0]), np.array([LON0]))[0]) + EYE
    d = np.concatenate([np.arange(150, 5000, 12.0), np.arange(5000, 20000, 20.0), np.arange(20000, D_MAX + 1, 35.0)])
    drop = d * d / (2 * R_EARTH) * (1 - REFRACTION)
    azs = np.arange(AZ_FROM, AZ_TO + 1e-9, AZ_STEP)
    out = {name: np.zeros(len(azs)) for name in LAYERS}
    for i, az in enumerate(azs):
        lat, lon = destination(np.full_like(d, az), d)
        highest = np.maximum.accumulate(np.degrees(np.arctan2(sample(lat, lon) - h0 - drop, d)))
        for name, limit in LAYERS.items():
            out[name][i] = highest[np.searchsorted(d, limit, side="right") - 1]
    return azs, {name: v.round(4) for name, v in out.items()}


def simplify(pts, eps):
    """Ramer–Douglas–Peucker."""
    keep = np.zeros(len(pts), bool)
    keep[[0, -1]] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, ab = pts[i], pts[j] - pts[i]
        seg = pts[i + 1:j]
        dist = np.abs(ab[0] * (seg[:, 1] - a[1]) - ab[1] * (seg[:, 0] - a[0])) / (np.hypot(*ab) or 1)
        k = int(np.argmax(dist))
        if dist[k] > eps:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return pts[keep]


def num(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    s = "0" if s in ("", "-0") else s
    return s.replace("0.", ".", 1) if s.startswith("0.") else s.replace("-0.", "-.", 1)


def path(az, profile, below):
    lo, hi = WINDOW
    sx = 1440 / (hi - lo)
    sy = sx * RELIEF
    pts = simplify(np.column_stack([az * sx, -profile * sy]), TOLERANCE)  # judged as it renders
    pts[:, 0] /= sx
    pts[:, 1] /= sy
    r = np.round(pts * 100).astype(int)
    out = ""
    for v in (np.diff(r, axis=0) / 100).flatten():
        s = num(v)
        tail = out.split(" ")[-1].split("-")[-1]
        if out and not (s.startswith("-") or (s.startswith(".") and "." in tail)):
            out += " "
        out += s
    # Start and end beyond the view, then close below it, so only the ridge is stroked.
    return f"M{num(lo - 10)} {num(r[0][1] / 100)}H{num(r[0][0] / 100)}l{out}H{num(hi + 10)}V{num(below)}H{num(lo - 10)}Z"


if __name__ == "__main__":
    azs, layers = horizon(load_elevation())
    azs = AZ_FROM + np.arange(len(azs)) * AZ_STEP  # exact grid for drawing
    lo, hi = WINDOW
    view = (azs >= lo - 1e-9) & (azs <= hi + 1e-9)
    top = layers["far"][view].max() + 0.15
    bottom = min(v[view].min() for v in layers.values()) - 0.15
    print(f'viewBox="{num(lo)} {num(-top)} {num(hi - lo)} {num(top - bottom)}"\n')
    for name in ("far", "mid", "near"):
        print(f"{name}: {path(azs[view], layers[name][view], -bottom + 5)}\n")
