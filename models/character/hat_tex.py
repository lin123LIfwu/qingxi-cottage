# Bucket-hat textures (cotton canvas, sand colour): stitched brim rows, crown seams, brass eyelets.
# UV layout must match build_char.py: island A u in [0,0.74] = angle, v in [0,1] = profile arc length (brim edge -> crown top)
#                                      island B = top disc, planar, centre (0.875, 0.5), radius 0.12
import numpy as np, math, cv2
from PIL import Image
S = 2048
OUT = '/data/char/tex'
import json
HAT = json.load(open('/data/char/hat_params.json'))
prof = [tuple(p) for p in HAT['prof']]
ax, ay = HAT['ax'], HAT['ay']
L = [0.0]
for i in range(1, len(prof)): L.append(L[-1] + math.dist(prof[i - 1], prof[i]))
Lt = L[-1]; vband = L[7] / Lt
rng = np.random.default_rng(7)
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
u = (xx + 0.5) / S; v = 1 - (yy + 0.5) / S
# profile offset d(v) and circumference C(v) on island A
dv = np.interp(v * Lt, L, [p[0] for p in prof])
C = 2 * math.pi * np.sqrt(((ax + dv) ** 2 + (ay + dv) ** 2) / 2)
A = u < 0.74
Bc = ((u - 0.875) / 0.12) ** 2 + ((v - 0.5) / 0.12) ** 2
B = Bc < 1.02
# metric coordinates (m): along the circumference X and along the profile Y
X = np.where(A, u / 0.74 * C, (u - 0.875) / 0.12 * (ax - 0.026))
Y = np.where(A, v * Lt, (v - 0.5) / 0.12 * (ay - 0.026))
def noise(scale_px, amp=1.0):
    n = rng.standard_normal((S // 4, S // 4)).astype(np.float32)
    n = cv2.GaussianBlur(n, (0, 0), scale_px / 4)
    n = cv2.resize(n, (S, S), interpolation=cv2.INTER_CUBIC)
    return n / (n.std() + 1e-6) * amp
height = np.zeros((S, S), np.float32)
col = np.zeros((S, S, 3), np.float32)
base = np.array([0.80, 0.72, 0.555], np.float32)          # sand canvas (sRGB)
col[:] = base
# fabric: fine grain + mottling; the twill as a faint diagonal rib (period 1.1 mm)
grain = noise(2.0) * 0.6 + noise(6.0) * 0.4
twill = np.sin((X + Y) / 0.0011 * 2 * math.pi) * 0.5
height += grain * 0.00004 + twill * 0.00002
col *= (1 + 0.025 * noise(3.0) + 0.015 * noise(40.0))[..., None]
# soft wrinkles / dents in the crown
height += noise(120.0) * 0.0004 * ((v > vband) & A)
# sun fade toward the top, slightly darker under-brim crease at the band
fade = np.clip((v - vband) / (1 - vband), 0, 1) * A + B * 1.0
col = col * (1 + 0.06 * fade[..., None])
def line_mask(dist_m, half_w):            # smooth band around a line, distance in metres
    return np.clip(1 - np.abs(dist_m) / half_w, 0, 1)
ao = np.ones((S, S), np.float32)
def stitch_row(dist_m, along_m, period=0.0042, dash=0.0031):
    # raised thread dashes with a slight groove either side (thread pulls the canvas in)
    on = ((along_m % period) < dash).astype(np.float32)
    on = cv2.GaussianBlur(on, (0, 0), 0.8)
    th = line_mask(dist_m, 0.00045) * on
    gr = line_mask(dist_m, 0.0011) * (1 - line_mask(dist_m, 0.00045))
    return th, gr
def add_row(dist, along):
    global height, col, ao
    th, gr = stitch_row(dist, along)
    height += th * 0.00022 - gr * 0.00012
    col = col * (1 - 0.18 * th[..., None]) + np.array([0.86, 0.80, 0.66]) * 0.18 * th[..., None] * 1.0
    ao *= 1 - 0.18 * gr
# brim rows: every 5.5 mm from 3 mm off the edge up to the band
for k in range(12):
    yk = 0.003 + 0.0055 * k
    if yk > L[7] - 0.004: break
    m = A & (np.abs(Y - yk) < 0.003)
    th, gr = stitch_row(np.where(m, Y - yk, 1.0), X)
    height += th * 0.00022 - gr * 0.00012; ao *= 1 - 0.20 * gr
    col = col * (1 - 0.15 * th[..., None]) + np.array([0.88, 0.82, 0.68]) * 0.15 * th[..., None]
# band seam (brim joins crown): crease + two rows of stitching just above it
yb = L[7]
sd = np.where(A, Y - yb, 1.0)
height -= line_mask(sd, 0.0016) * 0.00035; ao *= 1 - 0.35 * line_mask(sd, 0.0018)
for off in (0.003, 0.0062):
    th, gr = stitch_row(np.where(A, Y - (yb + off), 1.0), X)
    height += th * 0.0002 - gr * 0.0001; ao *= 1 - 0.15 * gr
    col = col * (1 - 0.15 * th[..., None]) + np.array([0.88, 0.82, 0.68]) * 0.15 * th[..., None]
# crown-top seam (side meets the top disc) at the top rounding + its stitch row
yt = L[15]
st_ = np.where(A, Y - yt, 1.0)
height -= line_mask(st_, 0.0014) * 0.0003; ao *= 1 - 0.3 * line_mask(st_, 0.0016)
th, gr = stitch_row(np.where(A, Y - (yt - 0.003), 1.0), X)
height += th * 0.0002 - gr * 0.0001; ao *= 1 - 0.15 * gr
col = col * (1 - 0.15 * th[..., None]) + np.array([0.88, 0.82, 0.68]) * 0.15 * th[..., None]
# top disc: one stitch ring near its edge
rB = np.sqrt(Bc)
rd = (rB - 0.93) * (ax - 0.026)
th, gr = stitch_row(np.where(B, rd, 1.0), np.arctan2(v - 0.5, u - 0.875) * (ax - 0.026))
height += th * 0.0002 - gr * 0.0001; ao *= 1 - 0.15 * gr
col = col * (1 - 0.15 * th[..., None]) + np.array([0.88, 0.82, 0.68]) * 0.15 * th[..., None]
# side seams of the crown panels at the left and right (theta = 90 deg, 270 deg) with a stitch row each side
for th0 in (0.25, 0.75):
    su = np.where(A & (v > vband), (u / 0.74 - th0) * C, 1.0)
    height -= line_mask(su, 0.0013) * 0.0003; ao *= 1 - 0.3 * line_mask(su, 0.0015)
    for off in (-0.003, 0.003):
        th, gr = stitch_row(su - off, Y)
        height += th * 0.0002 - gr * 0.0001; ao *= 1 - 0.15 * gr
        col = col * (1 - 0.15 * th[..., None]) + np.array([0.88, 0.82, 0.68]) * 0.15 * th[..., None]
# brass eyelets: two each side on the crown
metal = np.zeros((S, S), np.float32); rough = np.full((S, S), 0.9, np.float32)
yE = L[7] + 0.62 * (L[14] - L[7])
for th0 in (0.25, 0.75):
    for dz in (-0.014, 0.014):
        ex = (u / 0.74 - th0) * C - dz
        ey = Y - yE
        r = np.sqrt(ex ** 2 + ey ** 2) * A
        ring = np.clip((0.0029 - r) / 0.0003, 0, 1) * np.clip((r - 0.0016) / 0.0003, 0, 1)
        hole = np.clip((0.0016 - r) / 0.0003, 0, 1) * A
        height += ring * 0.0006 * np.cos(np.clip((r - 0.00225) / 0.0007, -1, 1) * math.pi / 2) - hole * 0.0008
        col = col * (1 - ring[..., None]) + np.array([0.78, 0.62, 0.36]) * ring[..., None]
        col = col * (1 - hole[..., None]) + np.array([0.10, 0.09, 0.08]) * hole[..., None]
        metal = np.maximum(metal, ring); rough = rough * (1 - ring) + 0.38 * ring
        ao *= 1 - 0.5 * hole
# brim edge: slightly worn, lighter
edge = A & (Y < 0.0025)
col = col * (1 + 0.06 * edge[..., None])
# normal map from the height field (metric spacing per texel differs along X and Y on island A)
pxX = np.where(A, C / (0.74 * S), 2 * (ax - 0.026) / (0.24 * S))
pxY = np.where(A, Lt / S, 2 * (ay - 0.026) / (0.24 * S))
hx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) / (2 * pxX)
hy = -(np.roll(height, -1, 0) - np.roll(height, 1, 0)) / (2 * pxY)      # rows go down = -v
n = np.dstack([-hx, -hy, np.ones_like(hx)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
nrm = (n * 0.5 + 0.5)
col = np.clip(col * ao[..., None] ** 0.5, 0, 1)
orm = np.dstack([ao, rough, metal])
sv = lambda a, p: Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(p)
sv(col, f'{OUT}/hat_basecolor.png'); sv(nrm, f'{OUT}/hat_normal.png'); sv(orm, f'{OUT}/hat_orm.png')
Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).resize((1024, 1024)).save(f'{OUT}/hat_prev.jpg', quality=85)
print('ok vband', round(vband, 3))
