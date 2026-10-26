"""Trace the skyline south of Almaty and print the SVG paths used on the site.

The ridge on the homepage is the real horizon seen from Republic Square,
looking south (azimuth 92° to 268°). Elevation comes from SRTM data served as
AWS Terrain Tiles. Each layer keeps the highest elevation angle within a
distance band (6 km, 12 km, 80 km), which is what gives the drawing depth.

    pip install numpy pillow
    python3 scripts/skyline.py

Paste each printed d attribute into the matching .layer path in
site/index.html and site/404.html. Path units are degrees: x is azimuth,
y is the negative elevation angle, matching viewBox="92 -10 176 11".
"""
import math
import os
import tempfile
import urllib.request

import numpy as np
from PIL import Image

LAT0, LON0 = 43.2385, 76.9453  # Republic Square, Almaty
EYE = 25.0                      # metres above the ground
Z = 11                          # tile zoom, about 55 m per pixel here
R_EARTH, REFRACTION = 6371000.0, 0.13
AZ_MIN, AZ_MAX, AZ_STEP = 92.0, 268.0, 0.1
AZ_PAD = 12.0                   # traced beyond the view so smoothing has neighbours
BANDS = {"near": 6000, "mid": 12000, "far": 80000}
TOLERANCE = 0.05                # simplification, in exaggerated degrees
CACHE = os.path.join(tempfile.gettempdir(), "terrain-tiles")


def tile_xy(lat, lon):
    n = 2 ** Z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n


def destination(az, d):
    p1, l1, th, dr = math.radians(LAT0), math.radians(LON0), math.radians(az), d / R_EARTH
    p2 = math.asin(math.sin(p1) * math.cos(dr) + math.cos(p1) * math.sin(dr) * math.cos(th))
    l2 = l1 + math.atan2(math.sin(th) * math.sin(dr) * math.cos(p1), math.cos(dr) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), math.degrees(l2)


def load_elevation():
    far = max(BANDS.values())
    corners = [destination(a, far) for a in range(80, 281, 5)] + [(LAT0 + 0.05, LON0)]
    x0, y0 = tile_xy(max(c[0] for c in corners), min(c[1] for c in corners))
    x1, y1 = tile_xy(min(c[0] for c in corners), max(c[1] for c in corners))
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    os.makedirs(CACHE, exist_ok=True)
    grid = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), dtype=np.float32)
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
        ix, iy = int(px), int(py)
        fx, fy = px - ix, py - iy
        top = grid[iy, ix] * (1 - fx) + grid[iy, ix + 1] * fx
        bottom = grid[iy + 1, ix] * (1 - fx) + grid[iy + 1, ix + 1] * fx
        return top * (1 - fy) + bottom * fy

    return sample


def horizon(sample):
    """Highest elevation angle per azimuth, cumulative over each distance band."""
    h0 = sample(LAT0, LON0) + EYE
    limits = sorted(BANDS.values())
    out = {limit: [] for limit in limits}
    for az in np.arange(AZ_MIN - AZ_PAD, AZ_MAX + AZ_PAD + 1e-9, AZ_STEP):
        best, d, i = -90.0, 150.0, 0
        while d <= limits[-1]:
            lat, lon = destination(az, d)
            drop = d * d / (2 * R_EARTH) * (1 - REFRACTION)
            best = max(best, math.degrees(math.atan2(sample(lat, lon) - h0 - drop, d)))
            while i < len(limits) and d >= limits[i]:
                out[limits[i]].append(round(best, 4))
                i += 1
            d += 30.0 if d < 5000 else 60.0 if d < 20000 else 100.0
        for limit in limits[i:]:
            out[limit].append(round(best, 4))
    return {name: np.array(out[limit]) for name, limit in BANDS.items()}


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


def path(profile):
    smooth = np.convolve(np.pad(profile, 1, mode="edge"), [0.25, 0.5, 0.25], mode="valid")
    az = AZ_MIN - AZ_PAD + np.arange(len(smooth)) * AZ_STEP
    view = (az >= AZ_MIN - 1e-9) & (az <= AZ_MAX + 1e-9)
    pts = simplify(np.column_stack([az[view], -smooth[view] * 2.2]), TOLERANCE)  # judge y as it renders
    pts[:, 1] /= 2.2
    r = np.round(pts * 100).astype(int)
    out = ""
    for v in (np.diff(r, axis=0) / 100).flatten():
        s = num(v)
        tail = out.split(" ")[-1].split("-")[-1]
        if out and not (s.startswith("-") or (s.startswith(".") and "." in tail)):
            out += " "
        out += s
    # Start and end beyond the view, then close below it, so only the ridge is stroked.
    return f"M80 {num(r[0][1] / 100)}H{num(r[0][0] / 100)}l{out}H280V5H80Z"


if __name__ == "__main__":
    for name, profile in horizon(load_elevation()).items():
        print(f"{name}: {path(profile)}\n")
