# Timber house: furniture and the lived-in details (ground floor + bedroom).
import math
from geo import *
from arch import (F1, F2, IX, IZ, J0, OAK, OAK2, PINE, PINE2, LIME, STONE, STONE2, MORTAR, IRON, COPPER, stones_rect, y_in, HOLE)
from tex import ATLAS

LINEN, OATS, RUST, OCHRE, INDIGO, MOSS, CREAM = '#d8cfbf', '#c8bca6', '#a5532e', '#c9963a', '#3e4f6e', '#66704a', '#e9e2d3'
BRASS = '#a8843f'
BOOKS = ['#7a2f24', '#3e4f6e', '#5d6b3a', '#8a6a3a', '#2f3a44', '#9a8466', '#6a3a4a', '#c2a46a', '#40514a', '#a5532e', '#d8cfbf']

def sheet(mat, x0, x1, z0, z1, y, uv, nu=8, nv=8, bump=0.0, c='#ffffff'):
    """flat textile rectangle (rug) mapped onto one atlas quadrant"""
    u0, v0, u1, v1 = ATLAS[uv]
    def fn(u, v):
        x = x0 + (x1 - x0) * u; z = z1 - (z1 - z0) * v
        return (x, y + bump * math.sin(u * 9.1) * math.sin(v * 7.3), z)
    surface(mat, fn, nu, nv, (0, 0, 0), None, c, False, 1.0, u1 - u0, v1 - v0, uvo=(u0, v0))

def drape(mat, x0, x1, z0, z1, top, drop, uv, foot=True, head=False, nu=22, nv=18, c='#ffffff', r=0.07, wr=0.012, seed=0.0):
    """cloth lying on a box top [x0,x1]x[z0,z1] at height `top`, falling `drop` over the long sides (z)
    and the foot end (x0). Parametrised by arc length so the texture does not stretch."""
    u0, v0, u1, v1 = ATLAS[uv]
    W, L = z1 - z0, x1 - x0
    hb = r * math.pi / 2
    def prof(s, half):        # arc-length s from the centre line -> (offset, dy)
        e = abs(s) - half
        if e <= 0: return s, 0.0
        sg = 1 if s > 0 else -1
        if e < hb:
            a = e / r; return sg * (half + r * math.sin(a)), -r * (1 - math.cos(a))
        return sg * (half + r + 0.01 * (e - hb)), -r - (e - hb)
    Sz = W / 2 + hb + drop - r
    Sx0 = (L / 2 + hb + drop - r) if foot else L / 2
    Sx1 = (L / 2 + hb + drop - r) if head else L / 2
    xm, zm = (x0 + x1) / 2, (z0 + z1) / 2
    def fn(u, v):
        sx = -Sx0 + (Sx0 + Sx1) * u; sz = Sz - 2 * Sz * v
        ox, dyx = prof(sx, L / 2) if (sx < 0 and foot) or (sx > 0 and head) else (sx, 0.0)
        oz, dyz = prof(sz, W / 2)
        w = wr * math.sin(sx * 7.3 + seed) * math.sin(sz * 5.1 + 1.3 + seed) + wr * 0.5 * math.sin(sx * 17 + sz * 11)
        return (xm + ox, top + max(dyx + dyz, -drop - 0.02) + w * (1 if dyx + dyz > -0.01 else 0.3), zm + oz)
    surface(mat, fn, nu, nv, (0, 0, 0), None, c, False, 1.0, u1 - u0, v1 - v0, uvo=(u0, v0))

# ------------------------------------------------------------------ fireplace
FX0, FX1, FZ = -IX, -3.2, 0.85            # chimney breast x range, half width in z
def fireplace():
    top = 3.27
    # core + coursed stone on the front and both sides, firebox opening in the front
    sbox('stone', (FX1 - FX0, top - F1, 2 * FZ), ((FX0 + FX1) / 2, (F1 + top) / 2, 0), c=MORTAR, tile=1.2, skip=('ny', 'nx', 'px'))
    oz0, oz1, oy0, oy1 = -0.45, 0.45, F1 + 0.18, F1 + 1.0
    xm = FX1 - 0.005          # mortar face behind the front stones (open where the firebox is)
    for (za, zb, ya, yb) in ((-FZ, oz0, F1, oy1), (oz1, FZ, F1, oy1), (-FZ, FZ, oy1, top), (oz0, oz1, F1, oy0)):
        patch('stone', (xm, ya, za), (xm, ya, zb), (xm, yb, zb), (xm, yb, za), 2, 2, c=MORTAR, tile=1.2, face=(1, 0, 0))
    soot = lambda c, p, n: mulc(c, 1 - 0.45 * max(0, 1 - (abs(p.z) - 0.2) / 0.5) * max(0, 1 - abs(p.y - oy1 - 0.25) / 0.45)) if p.x > FX1 - 0.01 else c
    stones_rect((FX1 - 0.01, 0, 0), (0, 0, 1), (1, 0, 0), -FZ, oz0 - 0.0, F1, oy1, ch=(0.2, 0.28), ln=(0.18, 0.3), colfn=soot)
    stones_rect((FX1 - 0.01, 0, 0), (0, 0, 1), (1, 0, 0), oz1, FZ, F1, oy1, ch=(0.2, 0.28), ln=(0.18, 0.3), colfn=soot)
    stones_rect((FX1 - 0.01, 0, 0), (0, 0, 1), (1, 0, 0), -FZ, FZ, oy1 + 0.22, top, ch=(0.22, 0.3), ln=(0.25, 0.45), colfn=soot)
    for sz in (-1, 1):
        stones_rect((0, 0, sz * (FZ - 0.01)), (1, 0, 0), (0, 0, sz), FX0 + 0.02, FX1, F1, top, ch=(0.22, 0.3), ln=(0.2, 0.32))
    cbox('stone', (0.34, 0.22, 1.18), (FX1 + 0.01, oy1 + 0.11, 0), c='#8d877c', ch=0.02, tile=0.9, colfn=soot)       # lintel
    # firebox: sooty back, sides and top
    d0 = FX0 + 0.12
    for pts, f in (([(d0, oy0, oz0), (d0, oy0, oz1), (d0, oy1, oz1), (d0, oy1, oz0)], (1, 0, 0)),
                   ([(d0, oy0, oz0), (FX1, oy0, oz0), (FX1, oy1, oz0), (d0, oy1, oz0)], (0, 0, 1)),
                   ([(d0, oy0, oz1), (FX1, oy0, oz1), (FX1, oy1, oz1), (d0, oy1, oz1)], (0, 0, -1)),
                   ([(d0, oy1, oz0), (FX1, oy1, oz0), (FX1, oy1, oz1), (d0, oy1, oz1)], (0, -1, 0))):
        patch('stone', *pts, nu=3, nv=3, c='#2b2622', tile=0.6, face=f)
    # raised hearth (granite) and the firebox floor
    cbox('stone', (0.50, 0.18, 1.9), (FX1 + 0.22, F1 + 0.09, 0), c='#6f6b64', ch=0.015, tile=1.0, axis='z')
    patch('stone', (d0, oy0 + 0.001, oz0), (d0, oy0 + 0.001, oz1), (FX1, oy0 + 0.001, oz1), (FX1, oy0 + 0.001, oz0), 2, 2, c='#3a3430', face=(0, 1, 0))
    coll_box(FX0, FX1 + 0.47, -0.95, 0.95, 0, tag='hearth')
    # andirons, logs, embers and flames
    for z in (-0.25, 0.25):
        cbox('metal', (0.36, 0.03, 0.03), (-3.45, oy0 + 0.08, z), c=IRON, ch=0.005)
        cyl('metal', 0.022, 0.16, (-3.27, oy0 + 0.08, z), c=IRON, seg=8)
        lathe('metal', [(0.0, 0, 's'), (0.03, 0.01), (0.032, 0.04), (0.0, 0.06)], (-3.27, oy0 + 0.16, z), c=IRON, seg=8)
    for (x, y, z, r, L, yaw) in ((-3.47, oy0 + 0.15, 0.0, 0.07, 0.62, 0.08), (-3.38, oy0 + 0.17, -0.06, 0.06, 0.55, -0.35), (-3.52, oy0 + 0.27, 0.05, 0.055, 0.5, 0.45)):
        cyl('wood', r, L, (x, y, z), (math.pi / 2, yaw, 0), c='#3a2a1e', seg=9,
            colfn=lambda c, p, n: mixc('#1c1410', '#4a3424', max(0, min(1, (p.y - oy0 - 0.1) * 5))))
    with group('Fire'):
        for i in range(5):
            blob('ember', (rnd(0.05, 0.09), 0.025, rnd(0.04, 0.07)), (-3.45 + pm(0.12), oy0 + 0.02, pm(0.28)), c='#ff5a1a', e1=0.8, e2=0.8, nu=8, nv=4)
        for k in range(3):
            a = k * math.pi / 3
            w, h = 0.26, 0.42
            cx, cy, cz = -3.45, oy0 + 0.12 + h / 2, 0.0
            ca, sa = math.cos(a) * w, math.sin(a) * w
            poly('flame', [(cx - ca, cy - h / 2, cz - sa), (cx + ca, cy - h / 2, cz + sa), (cx + ca, cy + h / 2, cz + sa), (cx - ca, cy + h / 2, cz - sa)],
                 uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], c='#ffffff', double=True, normal=(math.sin(a), 0, -math.cos(a)))
    # mantel beam + things on it
    mt = F1 + 1.30
    cbox('wood', (0.30, 0.17, 2.05), (FX1 + 0.13, mt - 0.085, 0), c='#5e422c', ch=0.018, axis='z', seg=0.6, jit=0.03)
    for z in (-0.85, 0.85):
        cbox('wood', (0.08, 0.2, 0.08), (FX1 + 0.05, mt - 0.27, z * 0.95), (0, 0, 0.6), c='#5e422c', ch=0.008)
    for z, h in ((-0.75, 0.22), (-0.62, 0.16)):
        lathe('metal', [(0.0, 0, 's'), (0.04, 0.0), (0.035, 0.012), (0.012, 0.03), (0.012, 0.06), (0.025, 0.07), (0.0, 0.075)], (FX1 + 0.1, mt, z), c=BRASS, seg=10)
        cyl('misc', 0.017, h, (FX1 + 0.1, mt + 0.075 + h / 2, z), c='#efe6d2', seg=10)
        with group('Fire'):
            fh = 0.035
            for k in range(2):
                a = k * math.pi / 2
                poly('flame', [(FX1 + 0.1 - 0.012 * math.cos(a), mt + 0.075 + h + 0.004, z - 0.012 * math.sin(a)), (FX1 + 0.1 + 0.012 * math.cos(a), mt + 0.075 + h + 0.004, z + 0.012 * math.sin(a)),
                               (FX1 + 0.1 + 0.012 * math.cos(a), mt + 0.075 + h + 0.004 + fh, z + 0.012 * math.sin(a)), (FX1 + 0.1 - 0.012 * math.cos(a), mt + 0.075 + h + 0.004 + fh, z - 0.012 * math.sin(a))],
                     uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], double=True, normal=(math.sin(a), 0, -math.cos(a)))
    for z, hh, cc in ((0.55, 0.14, '#5f8a6e'), (0.68, 0.10, '#c9b79a'), (0.78, 0.18, '#7a5a3c')):
        lathe('ceramic', [(0.0, 0, 's'), (0.035, 0.0), (0.045, hh * 0.5), (0.03, hh), (0.034, hh * 1.06), (0.0, hh * 1.06)], (FX1 + 0.11, mt, z), c=cc, seg=12)
    # dried flowers in the tall jar
    for i in range(9):
        a = rnd(0, 6.28); r0 = rnd(0.0, 0.03); top = mt + 0.18 + rnd(0.15, 0.32)
        p0 = (FX1 + 0.11, mt + 0.16, 0.78); p1 = (FX1 + 0.11 + math.cos(a) * (r0 + 0.06), top, 0.78 + math.sin(a) * (r0 + 0.06))
        rod('misc', p0, p1, 0.003, '#8a7a4a', seg=4)
        blob('misc', (0.018, 0.024, 0.018), p1, c=mixc('#d9b27a', '#b5704a', rnd()), e1=1, e2=1, nu=6, nv=4)
    # painting above the mantel (frame + canvas)
    py, ph, pw = mt + 0.62, 0.62, 0.86
    u0, v0, u1, v1 = ATLAS['painting']
    poly('textile', [(FX1 + 0.035, py - ph / 2, pw / 2), (FX1 + 0.035, py - ph / 2, -pw / 2), (FX1 + 0.035, py + ph / 2, -pw / 2), (FX1 + 0.035, py + ph / 2, pw / 2)],
         uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)], normal=(1, 0, 0))
    for dz, w2, h2 in ((pw / 2 + 0.03, 0.06, ph + 0.12), (-pw / 2 - 0.03, 0.06, ph + 0.12)):
        cbox('wood', (0.05, h2, w2), (FX1 + 0.03, py, dz), c='#3a2a1c', ch=0.01, axis='y')
    for dy in (ph / 2 + 0.03, -ph / 2 - 0.03):
        cbox('wood', (0.05, 0.06, pw + 0.12), (FX1 + 0.03, py + dy, 0), c='#3a2a1c', ch=0.01, axis='z')
    # fire irons and a log basket
    cyl('metal', 0.09, 0.012, (-3.02, F1 + 0.186, -0.72), c=IRON, seg=10)
    for k, (dx, dz) in enumerate(((-0.02, -0.02), (0.02, -0.01), (0.0, 0.025))):
        rod('metal', (-3.02 + dx, F1 + 0.19, -0.72 + dz), (-3.02 + dx * 2, F1 + 0.88, -0.72 + dz * 2), 0.007, '#3a3632', seg=5)
    lathe('wood', [(0.0, 0, 's'), (0.17, 0.0, 's'), (0.21, 0.30), (0.22, 0.32, 's'), (0.20, 0.32, 's'), (0.19, 0.30), (0.16, 0.03, 's'), (0.0, 0.03)],
          (-3.0, F1, 1.25), c='#9a7a4e', seg=14, tile=0.15, caps=(True, False))
    for i in range(5):
        cyl('wood', rnd(0.04, 0.06), 0.45, (-3.0 + pm(0.07), F1 + 0.30 + i * 0.03, 1.25 + pm(0.08)), (0, rnd(0, 3), math.pi / 2 + pm(0.4)), c='#6b4a32', seg=7)
    coll_circle(-3.0, 1.25, 0.24, 0)

# ------------------------------------------------------------------ seating, lamps, books
def armchair(x, z, yaw, cover, y0=F1, throw=False, lv=0):
    """deep wool armchair; local frame: seat faces +z"""
    T = Frame(x, y0, z, yaw)
    for lx in (-0.32, 0.32):
        for lz in (-0.3, 0.3):
            cbox('wood', (0.05, 0.12, 0.05), T.p(lx, 0.06, lz), T.r(), c='#4a3424', ch=0.008, axis='y')
    blob('fabric', (0.39, 0.12, 0.38), T.p(0, 0.22, 0.0), T.r(), c=cover, e1=0.25, e2=0.22, jit=0.03)                    # base
    blob('fabric', (0.29, 0.07, 0.31), T.p(0, 0.39, 0.06), T.r(), c=mulc(cover, 1.06), e1=0.35, e2=0.3)                  # seat cushion
    blob('fabric', (0.30, 0.30, 0.10), T.p(0, 0.62, -0.29), T.r(-0.18), c=cover, e1=0.3, e2=0.3)                           # back
    blob('fabric', (0.25, 0.17, 0.07), T.p(0, 0.58, -0.17), T.r(-0.2), c=mulc(cover, 1.05), e1=0.4, e2=0.4)               # back cushion
    for sx in (-1, 1):
        blob('fabric', (0.075, 0.14, 0.36), T.p(sx * 0.33, 0.44, 0.0), T.r(), c=cover, e1=0.3, e2=0.35)                    # arms
    if throw:
        u0, v0, u1, v1 = ATLAS['plaid']
        def fn(u, v):
            a = 0.4 - 0.8 * v; s = u * 1.0
            # over the right arm: up from the seat, over the arm top, down the outside
            if s < 0.35: px, py = 0.24 + s * 0.15, 0.40 + s * 0.6
            elif s < 0.55: t = (s - 0.35) / 0.2; px, py = 0.29 + t * 0.1, 0.61 + 0.02 * math.sin(t * math.pi)
            else: px, py = 0.42, 0.61 - (s - 0.55) * 0.9
            return T.p(px + 0.015 * math.sin(a * 13), py, a * 0.45)
        surface('textile', fn, 6, 10, (0, 0, 0), None, '#ffffff', False, 1.0, u1 - u0, v1 - v0, uvo=(u0, v0))
    coll_obox(x, z, 0.40, 0.40, yaw, lv)

def floor_lamp(x, z, y0=F1, h=1.55):
    lathe('metal', [(0.0, 0, 's'), (0.13, 0.0), (0.13, 0.015), (0.02, 0.03), (0.0, 0.03)], (x, y0, z), c='#2e2b28', seg=14)
    cyl('metal', 0.012, h - 0.25, (x, y0 + 0.03 + (h - 0.25) / 2, z), c='#2e2b28', seg=8)
    lathe('shade', [(0.17, h - 0.26, 's'), (0.12, h, 's')], (x, y0, z), c='#eadcbc', seg=18, caps=(False, False))
    lathe('shade', [(0.0, h - 0.17, 's'), (0.02, h - 0.17), (0.022, h - 0.12), (0.0, h - 0.08)], (x, y0, z), c='#fff2cf', seg=8)
    return (x, y0 + h - 0.15, z)

def book_row(x0, x1, y, z, depth, facing, lean_end=True, max_h=0.30):
    """books standing on a shelf; facing = +1 spines toward +x (west wall shelf) / axis 'x' rows"""
    a = x0
    while a < x1 - 0.03:
        t = rnd(0.022, 0.05); h = rnd(0.17, max_h); d = depth * rnd(0.75, 0.95)
        if a + t > x1: break
        cc = rng.choice(BOOKS)
        if rng.random() < 0.06 and a + 0.2 < x1:       # a little stack lying flat
            for k in range(rng.randint(2, 4)):
                tk = rnd(0.025, 0.04)
                cbox('misc', (d, tk, rnd(0.15, 0.2)), facing(a + 0.1, y + k * tk + tk / 2, z), None, c=rng.choice(BOOKS), ch=0.004, jit=0.1)
            a += 0.22; continue
        sbox('misc', (d, h, t), facing(a + t / 2, y + h / 2, z), None, c=cc, jit=0.12, skip=('nx', 'ny'),
             colfn=lambda c, p, n: mixc(c, '#e6dcc4', 0.8) if n.y > 0.5 else c)     # page edges on top
        a += t + 0.002
    return a

def bookshelf():
    x0, x1, z0, z1, y0, h = -IX, -IX + 0.34, 1.4, 2.7, F1, 2.15
    for z in (z0 + 0.015, z1 - 0.015):
        cbox('wood', (x1 - x0, h, 0.03), ((x0 + x1) / 2, y0 + h / 2, z), c=OAK, ch=0.006, axis='y')
    shelves = [y0 + 0.08, y0 + 0.46, y0 + 0.86, y0 + 1.24, y0 + 1.62, y0 + h - 0.015]
    for y in shelves:
        cbox('wood', (x1 - x0 - 0.01, 0.03, z1 - z0 - 0.03), ((x0 + x1) / 2, y, (z0 + z1) / 2), c=OAK2, ch=0.005, axis='z')
    cbox('wood', (0.02, 0.08, z1 - z0 - 0.03), (x1 - 0.01, y0 + 0.04, (z0 + z1) / 2), c=OAK, ch=0.004, axis='z')
    facing = lambda a, y, z: (x0 + 0.17, y, a)
    for i, y in enumerate(shelves[:-1]):
        end = book_row(z0 + 0.04, z1 - (0.25 if i % 2 else 0.05), y + 0.015, 0, 0.26, lambda a, yy, zz: (x0 + 0.16, yy, a), max_h=0.34)
        if i % 2:   # a jar / a small plant at the end of every other shelf
            lathe('ceramic', [(0.0, 0, 's'), (0.05, 0.0), (0.06, 0.08), (0.05, 0.12), (0.0, 0.12)], (x0 + 0.16, y + 0.015, z1 - 0.13), c=rng.choice(['#5f8a6e', '#c9b79a', '#8a5a3a']), seg=10)
    lathe('ceramic', [(0.0, 0, 's'), (0.07, 0.0), (0.08, 0.12, 's'), (0.07, 0.12)], (x0 + 0.17, shelves[-1] + 0.015, 2.3), c='#a8603f', seg=12)
    for i in range(10):
        a = rnd(0, 6.28); L = rnd(0.12, 0.3)
        p0 = (x0 + 0.17, shelves[-1] + 0.13, 2.3); p1 = (x0 + 0.17 + math.cos(a) * 0.1, shelves[-1] + 0.13 - rnd(0.0, 0.25), 2.3 + math.sin(a) * L)
        blob('misc', (0.05, 0.02, 0.035), p1, (0, a, 0.4), c=mixc('#4f6b36', '#7a9a52', rnd()), e1=0.8, e2=0.6, nu=6, nv=4)
    coll_box(x0, x1 + 0.02, z0, z1, 0)

def reading_nook():
    x0, x1, z0, z1 = -3.75, -1.6, 2.75, IZ
    sh = F1 + 0.42
    cbox('wood', (x1 - x0, 0.40, z1 - z0 - 0.02), ((x0 + x1) / 2, F1 + 0.20, (z0 + z1) / 2), c=OAK, ch=0.01, seg=0.6)
    for i in range(3):
        cx = x0 + (i + 0.5) * (x1 - x0) / 3
        cbox('wood', ((x1 - x0) / 3 - 0.05, 0.26, 0.02), (cx, F1 + 0.2, z0 - 0.001), c=OAK2, ch=0.004)
        lathe('metal', [(0.0, 0, 's'), (0.012, 0.0), (0.015, 0.015), (0.0, 0.025)], (cx, F1 + 0.24, z0 - 0.01), (-math.pi / 2, 0, 0), c=BRASS, seg=8)
    cbox('wood', (x1 - x0 + 0.04, 0.03, z1 - z0 + 0.02), ((x0 + x1) / 2, F1 + 0.415, (z0 + z1) / 2), c=OAK2, ch=0.006)
    blob('fabric', ((x1 - x0) / 2 - 0.02, 0.05, (z1 - z0) / 2 - 0.02), ((x0 + x1) / 2, sh + 0.055, (z0 + z1) / 2 + 0.01), c=OATS, e1=0.25, e2=0.2, nu=24, nv=8)
    for px, pz, rx, ry, cc in ((-3.55, 3.12, -0.25, 0.4, RUST), (-3.15, 3.15, -0.3, -0.1, OCHRE), (-2.0, 3.14, -0.3, 0.15, INDIGO), (-3.62, 2.92, 0.0, 1.35, MOSS)):
        blob('fabric', (0.21, 0.19, 0.07), (px, sh + 0.27, pz), (rx, ry, 0), c=cc, e1=0.45, e2=0.4, nu=14, nv=10,
             deform=lambda x, y, z: (x, y, z * (1 - 0.35 * (abs(x) / 0.21) ** 2)))
    drape('textile', -2.65, -1.95, 2.8, 3.25, sh + 0.11, 0.25, 'plaid', foot=False, head=True, nu=12, nv=10, r=0.04, wr=0.01)
    for k in range(4):       # a stack of books + mug on the bench end
        cbox('misc', (0.17 + pm(0.02), 0.035, 0.24 + pm(0.02)), (-1.85, sh + 0.10 + k * 0.036, 2.98), (0, pm(0.2), 0), c=rng.choice(BOOKS), ch=0.004)
    lathe('ceramic', [(0.0, 0, 's'), (0.038, 0.0), (0.042, 0.09, 's'), (0.036, 0.09, 's'), (0.034, 0.012), (0.0, 0.012)], (-1.8, sh + 0.245, 2.95), c='#e9e2d3', seg=12)
    torus('ceramic', 0.025, 0.007, (-1.755, sh + 0.29, 2.95), (math.pi / 2, 0, 0), c='#e9e2d3', nu=10, nv=4)
    coll_box(x0, x1, z0, z1, 0)
    return floor_lamp(-1.42, 2.98)

# ------------------------------------------------------------------ kitchen corner (NE)
SAGE = '#6f7d63'
CT = F1 + 0.90              # counter top
def _door_front(cx, cz, w, h, y, facing, c=SAGE, knob=True):
    """framed cabinet door on a front plane; facing = 'z' (front faces +z) or 'x' (faces -x)"""
    if facing == 'z':
        cbox('wood', (w, h, 0.022), (cx, y, cz), c=c, ch=0.005, axis='y', jit=0.03)
        cbox('wood', (w - 0.12, h - 0.12, 0.01), (cx, y, cz + 0.012), c=mulc(c, 0.92), ch=0.003, axis='y')
        if knob: lathe('metal', [(0.0, 0, 's'), (0.01, 0.0), (0.014, 0.018), (0.0, 0.026)], (cx + w / 2 - 0.05, y + h / 2 - 0.08, cz + 0.011), (math.pi / 2, 0, 0), c=BRASS, seg=8)
    else:
        cbox('wood', (0.022, h, w), (cx, y, cz), c=c, ch=0.005, axis='y', jit=0.03)
        cbox('wood', (0.01, h - 0.12, w - 0.12), (cx - 0.012, y, cz), c=mulc(c, 0.92), ch=0.003, axis='y')
        if knob: lathe('metal', [(0.0, 0, 's'), (0.01, 0.0), (0.014, 0.018), (0.0, 0.026)], (cx - 0.011, y + h / 2 - 0.08, cz + w / 2 - 0.05), (0, 0, math.pi / 2), c=BRASS, seg=8)

def kitchen():
    zf = -2.72                                   # cabinet fronts (north run)
    # carcasses (dark toe kick below)
    for x0, x1 in ((1.1, 1.62), (2.58, 2.86), (3.54, IX)):
        sbox('wood', (x1 - x0, 0.78, IZ + zf), ((x0 + x1) / 2, F1 + 0.48, (-IZ + zf) / 2), c=SAGE, skip=('ny', 'nz'))
        sbox('wood', (x1 - x0, 0.09, IZ + zf - 0.06), ((x0 + x1) / 2, F1 + 0.045, (-IZ + zf - 0.06) / 2), c='#2a2420', skip=('ny', 'nz'))
    sbox('wood', (IX - 3.22, 0.78, 1.52), ((3.22 + IX) / 2, F1 + 0.48, -1.94), c=SAGE, skip=('ny', 'px'))
    sbox('wood', (IX - 3.28, 0.09, 1.5), ((3.28 + IX) / 2, F1 + 0.045, -1.95), c='#2a2420', skip=('ny', 'px'))
    _door_front(1.36, zf, 0.48, 0.72, F1 + 0.47, 'z')
    _door_front(2.72, zf, 0.25, 0.72, F1 + 0.47, 'z', knob=True)
    for z0 in (-2.70, -2.20, -1.70):
        _door_front(3.21, z0 + 0.24, 0.47, 0.50, F1 + 0.36, 'x')
        _door_front(3.21, z0 + 0.24, 0.47, 0.16, F1 + 0.76, 'x')
    # oak worktops
    for x0, x1 in ((1.08, 1.62), (2.58, 2.86), (3.54, IX)):
        cbox('wood', (x1 - x0, 0.045, IZ + zf + 0.04), ((x0 + x1) / 2, CT - 0.0225, (-IZ + zf + 0.04) / 2), c='#8a6440', ch=0.006, jit=0.04)
    cbox('wood', (IX - 3.18, 0.045, 1.52), ((3.18 + IX) / 2, CT - 0.0225, -1.94), c='#8a6440', ch=0.006, axis='z', jit=0.04)
    # end panel closing the gap between the stairs and the cabinets
    patch('wood', (1.1, F1, -2.35), (1.1, 3.05, -2.35), (1.1, 3.05, zf), (1.1, F1, zf), 1, 3, c=PINE2, face=(1, 0, 0))
    # farmhouse sink
    sx0, sx1, sz0, sz1, sy0 = 1.62, 2.58, -3.28, zf + 0.02, F1 + 0.60
    sbox('ceramic', (sx1 - sx0, CT - sy0, sz1 - sz0), ((sx0 + sx1) / 2, (sy0 + CT) / 2, (sz0 + sz1) / 2), c='#ece7dc', skip=('py',))
    i = 0.035; by = sy0 + 0.05
    for pts, f in (([(sx0 + i, by, sz0 + i), (sx1 - i, by, sz0 + i), (sx1 - i, by, sz1 - i), (sx0 + i, by, sz1 - i)], (0, 1, 0)),
                   ([(sx0 + i, by, sz0 + i), (sx1 - i, by, sz0 + i), (sx1 - i, CT, sz0 + i), (sx0 + i, CT, sz0 + i)], (0, 0, 1)),
                   ([(sx0 + i, by, sz1 - i), (sx1 - i, by, sz1 - i), (sx1 - i, CT, sz1 - i), (sx0 + i, CT, sz1 - i)], (0, 0, -1)),
                   ([(sx0 + i, by, sz0 + i), (sx0 + i, by, sz1 - i), (sx0 + i, CT, sz1 - i), (sx0 + i, CT, sz0 + i)], (1, 0, 0)),
                   ([(sx1 - i, by, sz0 + i), (sx1 - i, by, sz1 - i), (sx1 - i, CT, sz1 - i), (sx1 - i, CT, sz0 + i)], (-1, 0, 0))):
        patch('ceramic', *pts, nu=2, nv=2, c='#e4ded2', face=f)
    for pts in (([(sx0, CT, sz0), (sx1, CT, sz0), (sx1, CT, sz0 + i), (sx0, CT, sz0 + i)]), ([(sx0, CT, sz1 - i), (sx1, CT, sz1 - i), (sx1, CT, sz1), (sx0, CT, sz1)]),
                ([(sx0, CT, sz0), (sx0 + i, CT, sz0), (sx0 + i, CT, sz1), (sx0, CT, sz1)]), ([(sx1 - i, CT, sz0), (sx1, CT, sz0), (sx1, CT, sz1), (sx1 - i, CT, sz1)])):
        poly('ceramic', pts, c='#f1ece2', normal=(0, 1, 0))
    cyl('metal', 0.03, 0.004, (2.1, by + 0.002, -3.0), c='#6a6660', seg=10)
    rod('metal', (2.1, CT, -3.24), (2.1, CT + 0.28, -3.24), 0.014, BRASS)
    rod('metal', (2.1, CT + 0.28, -3.24), (2.1, CT + 0.33, -3.12), 0.014, BRASS)
    rod('metal', (2.1, CT + 0.33, -3.12), (2.1, CT + 0.24, -3.0), 0.013, BRASS)
    for dx in (-0.09, 0.09):
        cyl('metal', 0.022, 0.03, (2.1 + dx, CT + 0.06, -3.24), c=BRASS, seg=8)
    # cast-iron range with a kettle and a pan, stovepipe into the wall
    rx0, rx1 = 2.87, 3.53
    cbox('metal', (rx1 - rx0, 0.84, 0.6), ((rx0 + rx1) / 2, F1 + 0.42 + 0.04, -3.0), c='#2a2826', ch=0.01)
    cbox('metal', (rx1 - rx0 + 0.04, 0.03, 0.64), ((rx0 + rx1) / 2, F1 + 0.895, -3.0), c='#1f1e1d', ch=0.006)
    cbox('metal', (0.46, 0.34, 0.02), ((rx0 + rx1) / 2, F1 + 0.42, -2.69), c='#33302d', ch=0.006)
    rod('metal', (rx0 + 0.08, F1 + 0.66, -2.66), (rx1 - 0.08, F1 + 0.66, -2.66), 0.008, BRASS)
    for dx in (-0.14, 0.14):
        torus('metal', 0.09, 0.008, ((rx0 + rx1) / 2 + dx, F1 + 0.912, -3.0), c='#151413', nu=16, nv=4)
    kx = (rx0 + rx1) / 2 - 0.14
    lathe('ceramic', [(0.0, 0, 's'), (0.09, 0.0), (0.11, 0.06), (0.105, 0.13), (0.06, 0.17), (0.03, 0.18, 's'), (0.03, 0.2), (0.0, 0.21)], (kx, F1 + 0.91, -3.0), c='#d9d2c0', seg=14)
    rod('ceramic', (kx + 0.09, F1 + 1.0, -3.0), (kx + 0.17, F1 + 1.09, -3.0), 0.012, '#d9d2c0')
    torus('metal', 0.07, 0.007, (kx, F1 + 1.13, -3.0), (math.pi / 2, 0, 0), c='#2a2826', nu=12, nv=4)
    cyl('metal', 0.11, 0.04, ((rx0 + rx1) / 2 + 0.14, F1 + 0.935, -3.0), c='#1c1b1a', seg=14)
    cbox('metal', (0.2, 0.02, 0.03), ((rx0 + rx1) / 2 + 0.33, F1 + 0.95, -3.0), c='#1c1b1a', ch=0.004)
    px, pz = (rx0 + rx1) / 2, -3.2
    rod('metal', (px, F1 + 0.9, pz), (px, F1 + 1.95, pz), 0.06, '#232220', seg=10)
    rod('metal', (px, F1 + 1.95, pz), (px, F1 + 2.05, -IZ - 0.05), 0.06, '#232220', seg=10)
    coll_box(1.1, IX, -IZ, -2.68, 0, tag='counter')
    coll_box(3.18, IX, -2.68, -1.18, 0, tag='counter')
    kitchen_wall()

def plate(x, y, z, r, rot, c):
    lathe('ceramic', [(0.0, 0, 's'), (r * 0.55, 0.0), (r * 0.6, 0.004), (r, 0.018, 's'), (r * 0.96, 0.02, 's'), (r * 0.58, 0.008), (0.0, 0.008)], (x, y, z), rot, c=c, seg=16, caps=(True, False))

def kitchen_wall():
    # green glazed tiles behind the worktops (grout behind)
    def tiles(P0, t, n, a0, a1, y0, y1, skip=None):
        P0, t, n = Vector(P0), Vector(t), Vector(n)
        s = 0.104
        patch('ceramic', tuple(P0 + t * a0 + Vector((0, y0, 0))), tuple(P0 + t * a1 + Vector((0, y0, 0))), tuple(P0 + t * a1 + Vector((0, y1, 0))), tuple(P0 + t * a0 + Vector((0, y1, 0))),
              2, 1, c='#cfc6b4', face=tuple(n))
        rows = int((y1 - y0) / s)
        for j in range(rows):
            a = a0 + (s / 2 if j % 2 else 0)
            while a + s <= a1 + 1e-6:
                cy = y0 + (j + 0.5) * s; ca = a + s / 2
                if not (skip and skip(ca, cy)):
                    p = P0 + t * ca + Vector((0, cy, 0)) + n * 0.007
                    rot = (0, 0, 0) if abs(n.z) > 0.5 else (0, math.pi / 2, 0)
                    sbox('ceramic', (0.098, 0.098, 0.012), tuple(p), (rot[0] + pm(0.01), rot[1] + pm(0.01), pm(0.01)), c=mixc('#4f7d63', '#6c9a7c', rnd()), jit=0.06,
                         skip=('nz', 'px', 'nx', 'py', 'ny') if n.z > 0.5 else ('pz', 'px', 'nx', 'py', 'ny'))
                a += s
    tiles((0, 0, -IZ), (1, 0, 0), (0, 0, 1), 1.1, IX, CT + 0.005, CT + 0.005 + 5 * 0.104,
          skip=lambda a, y: (1.55 < a < 2.65 and y > F1 + 1.0))
    tiles((IX, 0, 0), (0, 0, 1), (-1, 0, 0), -2.68, -1.2, CT + 0.005, CT + 0.005 + 5 * 0.104)
    # shelves on the east wall with brackets
    for y in (F1 + 1.62, F1 + 2.02):
        cbox('wood', (0.24, 0.035, 1.40), (IX - 0.12, y, -1.95), c=OAK2, ch=0.006, axis='z')
        for z in (-2.5, -1.4):
            cbox('metal', (0.2, 0.02, 0.02), (IX - 0.1, y - 0.08, z), (0, 0, -0.62), c=IRON, ch=0.004)
            cbox('metal', (0.02, 0.17, 0.02), (IX - 0.01, y - 0.09, z), c=IRON, ch=0.004, axis='y')
    y1, y2 = F1 + 1.6375, F1 + 2.0375
    for k in range(5):                                   # plates standing against the wall
        plate(IX - 0.06, y1 + 0.13, -2.55 + k * 0.025, 0.12, (0, 0, math.pi / 2 - 0.18), rng.choice(['#e9e2d3', '#e2dccd', '#d8cfbf']))
    for k in range(3):                                   # stacked bowls
        lathe('ceramic', [(0.0, 0, 's'), (0.04, 0.0), (0.075, 0.05), (0.08, 0.065, 's'), (0.072, 0.065, 's'), (0.035, 0.012), (0.0, 0.012)], (IX - 0.12, y1 + k * 0.022, -2.15), c='#5f8a6e' if k == 1 else '#e9e2d3', seg=14, caps=(True, False))
    for k, z in enumerate((-1.95, -1.78, -1.62, -1.48)):  # jars with lids
        h = rnd(0.12, 0.2)
        lathe('ceramic', [(0.0, 0, 's'), (0.045, 0.0), (0.05, h * 0.8), (0.035, h, 's'), (0.04, h + 0.01, 's'), (0.04, h + 0.03), (0.0, h + 0.035)], (IX - 0.12, y1, z), c=rng.choice(['#c9b79a', '#8a5a3a', '#e9e2d3', '#6f7d63']), seg=12)
    for k, z in enumerate((-2.55, -2.35, -2.1, -1.8, -1.55)):   # top shelf: crocks, a basket, a plant
        if k == 4:
            lathe('ceramic', [(0.0, 0, 's'), (0.06, 0.0), (0.07, 0.1, 's'), (0.06, 0.1)], (IX - 0.12, y2, z), c='#a8603f', seg=12)
            for i in range(8):
                a = i * 0.8
                blob('misc', (0.06, 0.012, 0.025), (IX - 0.12 + math.cos(a) * 0.07, y2 + 0.08 - i * 0.012, z + math.sin(a) * 0.07), (0, -a, -0.6), c=mixc('#4f6b36', '#7a9a52', rnd()), e1=0.8, e2=0.6, nu=6, nv=4)
        else:
            h = rnd(0.14, 0.22)
            lathe('ceramic', [(0.0, 0, 's'), (0.06, 0.0), (0.07, h * 0.5), (0.05, h), (0.055, h + 0.01, 's'), (0.0, h + 0.01)], (IX - 0.12, y2, z), c=rng.choice(['#8a6a4a', '#c9b79a', '#5f6b70']), seg=12)
    # pot rail with copper pans below the shelf
    rod('metal', (IX - 0.05, F1 + 1.42, -2.6), (IX - 0.05, F1 + 1.42, -1.35), 0.009, '#3a3632')
    for z, r in ((-2.45, 0.09), (-2.18, 0.075), (-1.92, 0.11), (-1.66, 0.065)):
        rod('metal', (IX - 0.05, F1 + 1.42, z), (IX - 0.06, F1 + 1.34, z), 0.004, '#3a3632', seg=4)
        cbox('metal', (0.02, 0.18, 0.015), (IX - 0.07, F1 + 1.25, z), c=COPPER, ch=0.003, axis='y')
        lathe('metal', [(0.0, 0, 's'), (r, 0.0), (r * 1.05, r * 0.9, 's'), (r * 0.98, r * 0.9, 's'), (r * 0.94, 0.006), (0.0, 0.006)], (IX - 0.09 - r * 0.2, F1 + 1.16 - r, z),
              (0, 0, math.pi / 2 - 0.1), c=COPPER, seg=14, caps=(True, False), colfn=lambda c, p, n: mixc(c, '#c48a5a', 0.3) if n.x < -0.5 else c)
    # herbs drying from the beam
    for x in (2.25, 2.62, 2.98, 3.35):
        rod('misc', (x, 2.95, -1.15), (x, 2.75, -1.15), 0.003, '#b8a27a', seg=4)
        for i in range(6):
            blob('misc', (0.03, 0.09, 0.03), (x + pm(0.03), 2.66 + pm(0.03), -1.15 + pm(0.03)), (pm(0.3), 0, pm(0.3)), c=mixc('#6f7a45', '#a39a5a', rnd()), e1=0.9, e2=0.9, nu=6, nv=5)
    # vegetable basket, bread board, a towel on the range rail
    bx, bz = 3.5, -1.55
    lathe('wood', [(0.0, 0, 's'), (0.12, 0.0, 's'), (0.17, 0.12), (0.18, 0.13, 's'), (0.165, 0.13, 's'), (0.155, 0.12), (0.11, 0.015, 's'), (0.0, 0.015)], (bx, CT, bz), c='#a8854e', seg=14, tile=0.1, caps=(True, False))
    for i in range(4):
        a = i * 1.4
        lathe('misc', [(0.0, 0, 's'), (0.022, 0.03), (0.018, 0.14), (0.0, 0.17)], (bx + math.cos(a) * 0.07, CT + 0.06, bz + math.sin(a) * 0.07), (1.2, a, 0), c='#e0782e', seg=8)
    blob('misc', (0.085, 0.065, 0.085), (bx + 0.03, CT + 0.12, bz - 0.05), c='#e08a2e', e1=1, e2=1, nu=12, nv=8, deform=lambda x, y, z: (x * (1 + 0.06 * math.cos(8 * math.atan2(z, x))), y, z * (1 + 0.06 * math.cos(8 * math.atan2(z, x)))))
    blob('misc', (0.09, 0.08, 0.09), (bx - 0.06, CT + 0.12, bz + 0.05), c='#8fb06a', e1=1, e2=1, nu=12, nv=8)
    cbox('wood', (0.42, 0.025, 0.28), (1.35, CT + 0.0125, -2.98), (0, 0.1, 0), c='#a07a50', ch=0.006)
    blob('misc', (0.12, 0.06, 0.07), (1.33, CT + 0.07, -2.97), (0, 0.15, 0), c='#b5793a', e1=0.6, e2=0.7, nu=12, nv=8)
    surface('fabric', lambda u, v: (3.16 - u * 0.18, F1 + 0.665 - 0.32 * v, -2.645 + 0.01 * math.sin(v * 6 + u * 2)), 3, 6, (0, 0, 0), None, '#c98f86', False, 0.2)

# ------------------------------------------------------------------ dining
def chair(x, z, yaw, y0=F1, cushion=RUST):
    T = Frame(x, y0, z, yaw)
    sh = 0.45
    cbox('wood', (0.42, 0.04, 0.40), T.p(0, sh, 0), T.r(), c='#6e4e32', ch=0.008, jit=0.04)
    for lx in (-0.18, 0.18):
        for lz in (-0.16, 0.16):
            rod('wood', T.p(lx * 1.1, 0, lz * 1.1), T.p(lx, sh - 0.01, lz), 0.018, '#5e422c', seg=7)
        rod('wood', T.p(lx, sh, -0.17), T.p(lx * 1.05, sh + 0.48, -0.22), 0.017, '#5e422c', seg=7)
    cbox('wood', (0.44, 0.07, 0.03), T.p(0, sh + 0.47, -0.22), T.r(-0.1), c='#6e4e32', ch=0.008)
    for lx in (-0.09, 0.0, 0.09):
        rod('wood', T.p(lx, sh + 0.02, -0.18), T.p(lx, sh + 0.44, -0.215), 0.009, '#6e4e32', seg=5)
    rod('wood', T.p(-0.19, 0.16, 0.0), T.p(0.19, 0.16, 0.0), 0.011, '#5e422c', seg=6)
    blob('fabric', (0.17, 0.025, 0.16), T.p(0, sh + 0.045, 0.02), T.r(), c=cushion, e1=0.3, e2=0.3, nu=12, nv=6)

def pendant(x, z, y_bottom):
    rod('metal', (x, J0, z), (x, y_bottom + 0.28, z), 0.004, '#2b2b2b', seg=4)
    lathe('metal', [(0.0, 0, 's'), (0.04, 0.0), (0.04, 0.02, 's'), (0.0, 0.02)], (x, J0 - 0.02, z), c='#2b2b2b', seg=10)
    lathe('shade', [(0.26, 0.0, 's'), (0.25, 0.04), (0.17, 0.18), (0.05, 0.27), (0.03, 0.29, 's')], (x, y_bottom, z), c='#e7dcc4', seg=24, caps=(False, False))
    lathe('shade', [(0.0, 0.10, 's'), (0.04, 0.12), (0.045, 0.16), (0.0, 0.2)], (x, y_bottom, z), c='#fff3d0', seg=10)
    return (x, y_bottom + 0.05, z)

def dining():
    cx, cz, L, W, H = 1.5, -0.4, 1.5, 0.85, F1 + 0.76
    for i, dz in enumerate((-0.3, -0.1, 0.1, 0.3)):
        cbox('wood', (L, 0.045, W / 4 - 0.004), (cx, H - 0.0225, cz + dz * W / 0.85 * 0.85 + 0.0), c=mixc('#7a5636', '#8a6440', rnd()), ch=0.006, seg=0.5, jit=0.03)
    for lx in (-L / 2 + 0.09, L / 2 - 0.09):
        for lz in (-W / 2 + 0.09, W / 2 - 0.09):
            cbox('wood', (0.075, H - F1 - 0.045, 0.075), (cx + lx, (F1 + H - 0.045) / 2, cz + lz), c='#5e422c', ch=0.01, axis='y')
    for lz in (-W / 2 + 0.09, W / 2 - 0.09):
        cbox('wood', (L - 0.2, 0.09, 0.025), (cx, H - 0.09, cz + lz), c='#5e422c', ch=0.005)
    for lx in (-L / 2 + 0.09, L / 2 - 0.09):
        cbox('wood', (0.025, 0.09, W - 0.2), (cx + lx, H - 0.09, cz), c='#5e422c', ch=0.005, axis='z')
    for (x, z, yaw, cc) in ((1.1, cz - 0.62, 0.0, RUST), (1.9, cz - 0.6, 0.05, OCHRE), (1.1, cz + 0.6, math.pi - 0.04, INDIGO), (1.9, cz + 0.62, math.pi, MOSS)):
        chair(x, z, yaw, cushion=cc)
    # linen runner, fruit bowl, wild flowers, candle
    surface('fabric', lambda u, v: (cx - 0.62 + 1.24 * u, H + 0.002, cz + 0.17 - 0.34 * v), 6, 2, (0, 0, 0), None, '#d8cfbf', False, 0.2)
    lathe('ceramic', [(0.0, 0, 's'), (0.06, 0.0), (0.14, 0.07), (0.15, 0.08, 's'), (0.14, 0.08, 's'), (0.055, 0.015), (0.0, 0.015)], (cx - 0.3, H, cz), c='#e9e2d3', seg=18, caps=(True, False))
    for i, (dx, dz, cc) in enumerate(((0.0, 0.0, '#b53a2e'), (0.06, 0.04, '#c94a35'), (-0.05, 0.05, '#d9b54a'), (0.03, -0.06, '#b53a2e'), (-0.04, -0.04, '#9ab04a'))):
        blob('misc', (0.04, 0.037, 0.04), (cx - 0.3 + dx, H + 0.06 + (0.035 if i == 0 else 0), cz + dz), c=cc, e1=1, e2=1, nu=10, nv=7, jit=0.05)
    lathe('ceramic', [(0.0, 0, 's'), (0.04, 0.0), (0.05, 0.08), (0.025, 0.16), (0.03, 0.19, 's'), (0.024, 0.19, 's'), (0.02, 0.16)], (cx + 0.15, H, cz + 0.02), c='#7d9a8a', seg=12, caps=(True, False))
    for i in range(11):
        a = rnd(0, 6.28); r = rnd(0.04, 0.13)
        tip = (cx + 0.15 + math.cos(a) * r, H + 0.3 + rnd(0, 0.16), cz + 0.02 + math.sin(a) * r)
        rod('misc', (cx + 0.15, H + 0.16, cz + 0.02), tip, 0.003, '#5d7a3e', seg=4)
        blob('misc', (0.02, 0.012, 0.02), tip, c=rng.choice(['#f2efe6', '#e9c94a', '#c98fb0', '#f2efe6', '#9a7ac9']), e1=1, e2=1, nu=6, nv=4)
    lathe('metal', [(0.0, 0, 's'), (0.045, 0.0), (0.04, 0.012), (0.013, 0.03), (0.013, 0.07), (0.028, 0.08), (0.0, 0.085)], (cx + 0.45, H, cz - 0.05), c=BRASS, seg=12)
    cyl('misc', 0.017, 0.14, (cx + 0.45, H + 0.155, cz - 0.05), c='#efe6d2', seg=10)
    coll_box(0.65, 2.35, -1.3, 0.5, 0, tag='table')
    return pendant(cx, cz, F1 + 1.66)

# ------------------------------------------------------------------ entry: bench, coat hooks, boots, clock
def entry():
    x0, x1, z0, z1 = 3.38, IX, 1.6, 3.0
    cbox('wood', (x1 - x0, 0.05, z1 - z0), ((x0 + x1) / 2, F1 + 0.44, (z0 + z1) / 2), c=OAK2, ch=0.008, axis='z')
    for z in (z0 + 0.05, z1 - 0.05):
        cbox('wood', (x1 - x0 - 0.04, 0.42, 0.05), ((x0 + x1) / 2, F1 + 0.21, z), c=OAK, ch=0.006, axis='y')
    cbox('wood', (0.03, 0.06, z1 - z0 - 0.1), (x0 + 0.04, F1 + 0.12, (z0 + z1) / 2), c=OAK, ch=0.004, axis='z')
    cbox('wood', (0.025, 0.12, 1.3), (IX - 0.0125, F1 + 1.72, 2.3), c=OAK2, ch=0.005, axis='z')
    for k, z in enumerate((1.8, 2.15, 2.5, 2.85)):
        rod('wood', (IX - 0.02, F1 + 1.72, z), (IX - 0.12, F1 + 1.76, z), 0.014, '#5e422c', seg=6)
    # coat on the first peg, the farmer's bucket hat on the second, a tote on the third
    blob('fabric', (0.07, 0.42, 0.21), (IX - 0.1, F1 + 1.32, 1.8), c='#4f5d48', e1=0.6, e2=0.5, nu=12, nv=10,
         deform=lambda x, y, z: (x * (1 + 0.6 * max(0, -y) / 0.42), y, z * (1 + 0.25 * max(0, -y) / 0.42)))
    lathe('fabric', [(0.0, 0, 's'), (0.17, 0.0), (0.175, 0.006, 's'), (0.11, 0.03), (0.105, 0.09), (0.09, 0.11), (0.0, 0.115)], (IX - 0.16, F1 + 1.70, 2.15), (0, 0, 1.25), c='#c8b48a', seg=18)
    blob('fabric', (0.04, 0.17, 0.15), (IX - 0.07, F1 + 1.44, 2.5), c='#a5532e', e1=0.5, e2=0.4, nu=10, nv=8)
    torus('fabric', 0.11, 0.01, (IX - 0.1, F1 + 1.66, 2.5), (0, 0, math.pi / 2), c='#7a3a24', nu=12, nv=4)
    rod('misc', (IX - 0.1, F1 + 0.46, 2.95), (IX - 0.1, F1 + 1.42, 2.82), 0.012, '#3e4f6e', seg=6)
    lathe('fabric', [(0.0, 0, 's'), (0.06, 0.15), (0.05, 0.5), (0.0, 0.6)], (IX - 0.1, F1 + 0.52, 2.93), (-0.13, 0, 0), c='#3e4f6e', seg=8)
    # boots under the bench
    for k, z in enumerate((1.95, 2.13)):
        blob('misc', (0.13, 0.05, 0.05), (3.6, F1 + 0.05, z), (0, 0.1 * k, 0), c='#3b2a1e', e1=0.5, e2=0.6, nu=10, nv=6)
        lathe('misc', [(0.0, 0, 's'), (0.05, 0.0), (0.048, 0.24, 's'), (0.042, 0.24, 's'), (0.042, 0.04)], (3.66, F1 + 0.05, z), c='#3b2a1e', seg=10, caps=(False, False))
    coll_box(x0 - 0.02, IX, z0, z1, 0, tag='bench')
    # wall clock between the reading window and the door
    T = Frame(-0.45, F1 + 1.95, IZ - 0.02, 0.0)
    cyl('wood', 0.17, 0.04, T.p(0, 0, -0.02), (math.pi / 2, 0, 0), c='#5e422c', seg=24, bev=0.008)
    cyl('misc', 0.145, 0.004, T.p(0, 0, -0.042), (math.pi / 2, 0, 0), c='#efe6d2', seg=24)
    for k in range(12):
        a = k / 12 * 2 * math.pi
        cbox('misc', (0.006, 0.022, 0.002), T.p(math.sin(a) * 0.12, math.cos(a) * 0.12, -0.045), (0, 0, -a), c='#2b2724', ch=0.001)
    cbox('metal', (0.008, 0.085, 0.003), T.p(0.02, 0.035, -0.048), (0, 0, -0.6), c='#1f1e1d', ch=0.001)
    cbox('metal', (0.006, 0.115, 0.003), T.p(-0.04, -0.03, -0.05), (0, 0, 2.4), c='#1f1e1d', ch=0.001)
    cbox('wood', (0.12, 0.5, 0.05), T.p(0, -0.42, -0.02), c='#5e422c', ch=0.008, axis='y')
    rod('metal', T.p(0, -0.2, -0.05), T.p(0.03, -0.55, -0.05), 0.003, BRASS, seg=4)
    cyl('metal', 0.035, 0.008, T.p(0.033, -0.58, -0.052), (math.pi / 2, 0, 0), c=BRASS, seg=12)
    # door mat and a big potted plant by the east window
    sbox('fabric', (0.95, 0.012, 0.6), (1.5, F1 + 0.006, IZ - 0.42), c='#9a7a4e', tile=0.18, skip=('ny',))
    lathe('ceramic', [(0.0, 0, 's'), (0.17, 0.0), (0.21, 0.36), (0.22, 0.40, 's'), (0.2, 0.40, 's'), (0.19, 0.35)], (3.42, F1, 0.98), c='#b56a46', seg=16, caps=(True, False))
    for i in range(16):
        a = rnd(0, 6.28); h = rnd(0.35, 1.0)
        tip = (3.42 + math.cos(a) * rnd(0.12, 0.32), F1 + 0.38 + h, 0.98 + math.sin(a) * rnd(0.12, 0.32))
        rod('misc', (3.42, F1 + 0.38, 0.98), tip, 0.006, '#4a5a32', seg=4)
        blob('misc', (0.11, 0.012, 0.07), tip, (pm(0.6), a, 0.5 + pm(0.3)), c=mixc('#3f6a32', '#5f8a3e', rnd()), e1=0.9, e2=0.7, nu=8, nv=4)
    coll_circle(3.42, 0.98, 0.26, 0)

# ------------------------------------------------------------------ bedroom under the roof
BED = (1.75, IX - 0.02, 0.2, 1.8)        # x0 (foot), x1 (head), z0, z1
def table_lamp(x, y, z):
    lathe('ceramic', [(0.0, 0, 's'), (0.06, 0.0), (0.075, 0.08), (0.05, 0.2), (0.02, 0.23), (0.012, 0.27), (0.0, 0.27)], (x, y, z), c='#7d9a8a', seg=14)
    lathe('shade', [(0.15, 0.25, 's'), (0.10, 0.42, 's')], (x, y, z), c='#eadcbc', seg=18, caps=(False, False))
    lathe('shade', [(0.0, 0.27, 's'), (0.025, 0.29), (0.028, 0.33), (0.0, 0.37)], (x, y, z), c='#fff2cf', seg=8)
    return (x, y + 0.33, z)

def chest(x0, x1, z0, z1, y0, h, c, drawers=3, front='x+', knob=BRASS):
    """chest of drawers; front = side facing the room ('x+', 'x-', 'z+', 'z-')"""
    cbox('wood', (x1 - x0, h - 0.04, z1 - z0), ((x0 + x1) / 2, y0 + 0.02 + (h - 0.04) / 2, (z0 + z1) / 2), c=c, ch=0.01)
    cbox('wood', (x1 - x0 + 0.03, 0.03, z1 - z0 + 0.03), ((x0 + x1) / 2, y0 + h - 0.015, (z0 + z1) / 2), c=mulc(c, 1.08), ch=0.008)
    dh = (h - 0.12) / drawers
    for i in range(drawers):
        y = y0 + 0.07 + (i + 0.5) * dh
        if front[0] == 'x':
            fx = x1 if front == 'x+' else x0
            s = 1 if front == 'x+' else -1
            cbox('wood', (0.016, dh - 0.025, z1 - z0 - 0.05), (fx + s * 0.008, y, (z0 + z1) / 2), c=mulc(c, 0.95), ch=0.004, axis='z')
            for zz in ((z0 + z1) / 2,) if z1 - z0 < 0.6 else (z0 + (z1 - z0) * 0.28, z0 + (z1 - z0) * 0.72):
                lathe('metal', [(0.0, 0, 's'), (0.01, 0.0), (0.013, 0.016), (0.0, 0.024)], (fx + s * 0.016, y, zz), (0, 0, -s * math.pi / 2), c=knob, seg=8)
        else:
            fz = z1 if front == 'z+' else z0
            s = 1 if front == 'z+' else -1
            cbox('wood', (x1 - x0 - 0.05, dh - 0.025, 0.016), ((x0 + x1) / 2, y, fz + s * 0.008), c=mulc(c, 0.95), ch=0.004)
            lathe('metal', [(0.0, 0, 's'), (0.01, 0.0), (0.013, 0.016), (0.0, 0.024)], ((x0 + x1) / 2, y, fz + s * 0.016), (s * math.pi / 2, 0, 0), c=knob, seg=8)

def bedroom():
    y0 = F2
    x0, x1, z0, z1 = BED
    # frame: rails, legs, low footboard, panelled headboard against the knee wall
    for z in (z0 + 0.03, z1 - 0.03):
        cbox('wood', (x1 - x0, 0.16, 0.05), ((x0 + x1) / 2, y0 + 0.24, z), c='#6e4e32', ch=0.01, seg=0.7)
    for x in (x0 + 0.04, x1 - 0.04):
        for z in (z0 + 0.04, z1 - 0.04):
            cbox('wood', (0.08, 0.32 if x < 2 else 0.80, 0.08), (x, y0 + (0.16 if x < 2 else 0.40), z), c='#5e422c', ch=0.012, axis='y')
    cbox('wood', (0.045, 0.28, z1 - z0 - 0.08), (x0 + 0.04, y0 + 0.36, (z0 + z1) / 2), c='#6e4e32', ch=0.01, axis='z')
    cbox('wood', (0.05, 0.42, z1 - z0 - 0.08), (x1 - 0.04, y0 + 0.56, (z0 + z1) / 2), c='#6e4e32', ch=0.01, axis='z')
    for k in range(5):
        zz = z0 + 0.1 + (z1 - z0 - 0.2) * (k + 0.5) / 5
        cbox('wood', (0.02, 0.30, (z1 - z0 - 0.2) / 5 - 0.03), (x1 - 0.068, y0 + 0.56, zz), c='#7a5a3c', ch=0.004, axis='y')
    # mattress, quilt, pillows, folded wool throw at the foot
    blob('fabric', ((x1 - x0) / 2 - 0.06, 0.1, (z1 - z0) / 2 - 0.05), ((x0 + x1) / 2, y0 + 0.42, (z0 + z1) / 2), c='#efe9dc', e1=0.2, e2=0.15, nu=24, nv=8)
    top = y0 + 0.53
    drape('textile', x0 + 0.08, x1 - 0.42, z0 + 0.06, z1 - 0.06, top, 0.30, 'quilt', foot=True, nu=26, nv=22, r=0.07, wr=0.012)
    for z in (0.62, 1.38):
        blob('fabric', (0.17, 0.08, 0.32), (x1 - 0.28, top + 0.06, z), (0, 0, 0.55), c='#f2eee4', e1=0.5, e2=0.35, nu=14, nv=10,
             deform=lambda x, y, zz: (x, y * (1 - 0.4 * (abs(zz) / 0.32) ** 2), zz))
    blob('fabric', (0.12, 0.07, 0.22), (x1 - 0.45, top + 0.05, 1.0), (0, 0, 0.35), c='#a5532e', e1=0.5, e2=0.4, nu=12, nv=8)
    drape('textile', x0 + 0.06, x0 + 0.52, z0 + 0.04, z1 - 0.04, top + 0.022, 0.22, 'plaid', foot=False, nu=10, nv=18, r=0.05, wr=0.006, seed=2.0)
    coll_box(1.72, IX, -0.35, 2.35, 1, tag='bed')
    # nightstands + lamps (south one: book and glasses; north one: a plant and a clock)
    lights = []
    for (za, zb) in ((-0.32, 0.13), (1.87, 2.32)):
        chest(3.30, IX - 0.02, za, zb, y0, 0.55, '#7a5a3c', drawers=2, front='x-')
        lights.append(table_lamp(3.55, y0 + 0.55, (za + zb) / 2 - 0.05))
    cbox('misc', (0.16, 0.03, 0.12), (3.42, y0 + 0.575, 2.18), (0, 0.3, 0), c='#3e4f6e', ch=0.004)
    lathe('ceramic', [(0.0, 0, 's'), (0.04, 0.0), (0.045, 0.07, 's'), (0.04, 0.07)], (3.42, y0 + 0.55, -0.22), c='#a8603f', seg=10)
    for i in range(6):
        a = i * 1.05
        blob('misc', (0.04, 0.01, 0.022), (3.42 + math.cos(a) * 0.04, y0 + 0.64 + rnd(0, 0.03), -0.22 + math.sin(a) * 0.04), (0, -a, -0.5), c=mixc('#4f6b36', '#7a9a52', rnd()), e1=0.8, e2=0.6, nu=6, nv=4)
    # rug at the foot of the bed
    sheet('textile', -1.0, 1.6, -0.8, 2.6, y0 + 0.006, 'kilim', nu=6, nv=6)
    # low chest of drawers under the west knee wall, things on top
    chest(-IX + 0.03, -3.32, -1.25, 0.45, y0, 0.66, '#8a6a4a', drawers=3, front='x+')
    for k, (z, h, cc) in enumerate(((-1.0, 0.2, '#3a2a1c'), (-0.7, 0.15, '#5e422c'))):
        cbox('wood', (0.02, h, 0.16), (-3.62, y0 + 0.66 + h / 2 + 0.01, z), (0, 0, 0.12), c=cc, ch=0.004, axis='y')
        sbox('misc', (0.004, h - 0.04, 0.12), (-3.605, y0 + 0.66 + h / 2 + 0.01, z), (0, 0, 0.12), c=rng.choice(['#c9b79a', '#9fb2bd']))
    lathe('ceramic', [(0.0, 0, 's'), (0.06, 0.0), (0.075, 0.1, 's'), (0.065, 0.1)], (-3.55, y0 + 0.66, -0.2), c='#e9e2d3', seg=12)
    for i in range(10):
        a = rnd(0, 6.28); r = rnd(0.02, 0.09)
        blob('misc', (0.035, 0.012, 0.02), (-3.55 + math.cos(a) * r, y0 + 0.78 + rnd(0, 0.12), -0.2 + math.sin(a) * r), (pm(0.5), a, pm(0.5)), c=mixc('#4f6b36', '#7a9a52', rnd()), e1=0.8, e2=0.7, nu=6, nv=4)
    cbox('wood', (0.24, 0.1, 0.16), (-3.55, y0 + 0.71, 0.22), c='#6e4e32', ch=0.01)
    # wardrobe beside the stair opening
    wx0, wx1, wz0, wz1, wh = -2.45, -1.78, -IZ, -2.76, 1.75
    cbox('wood', (wx1 - wx0, wh - 0.06, wz1 - wz0), ((wx0 + wx1) / 2, y0 + 0.06 + (wh - 0.06) / 2, (wz0 + wz1) / 2), c='#7a5a3c', ch=0.012, axis='y')
    cbox('wood', (wx1 - wx0 + 0.05, 0.05, wz1 - wz0 + 0.04), ((wx0 + wx1) / 2, y0 + wh - 0.025, (wz0 + wz1) / 2 + 0.01), c='#6a4c32', ch=0.01)
    for k in range(2):
        cx = wx0 + (k + 0.5) * (wx1 - wx0) / 2
        cbox('wood', ((wx1 - wx0) / 2 - 0.02, wh - 0.2, 0.02), (cx, y0 + 0.12 + (wh - 0.2) / 2, wz1 + 0.01), c='#86644a', ch=0.004, axis='y')
        cbox('wood', ((wx1 - wx0) / 2 - 0.12, wh - 0.4, 0.01), (cx, y0 + 0.12 + (wh - 0.2) / 2, wz1 + 0.022), c='#7a5a3c', ch=0.003, axis='y')
        lathe('metal', [(0.0, 0, 's'), (0.01, 0.0), (0.013, 0.016), (0.0, 0.024)], (cx + (0.12 if k == 0 else -0.12), y0 + 1.0, wz1 + 0.025), (math.pi / 2, 0, 0), c=BRASS, seg=8)
    coll_box(-2.75, wx1, -IZ, wz1, 1, tag='wardrobe')
    # window bench under the south window, with a cushion and a sleeping-cat-sized cushion
    bx0, bx1, bz0 = -0.7, 0.7, 2.85
    cbox('wood', (bx1 - bx0, 0.42, IZ - bz0), (0, y0 + 0.21, (bz0 + IZ) / 2), c='#7a5a3c', ch=0.01)
    blob('fabric', ((bx1 - bx0) / 2 - 0.02, 0.045, (IZ - bz0) / 2 - 0.01), (0, y0 + 0.47, (bz0 + IZ) / 2), c=INDIGO, e1=0.25, e2=0.2, nu=20, nv=8)
    blob('fabric', (0.2, 0.17, 0.07), (-0.38, y0 + 0.65, IZ - 0.1), (-0.2, 0.15, 0), c=OCHRE, e1=0.45, e2=0.4, nu=12, nv=8)
    blob('fabric', (0.18, 0.15, 0.06), (0.4, y0 + 0.63, IZ - 0.1), (-0.25, -0.2, 0), c=CREAM, e1=0.45, e2=0.4, nu=12, nv=8)
    lathe('ceramic', [(0.0, 0, 's'), (0.05, 0.0), (0.06, 0.09, 's'), (0.05, 0.09)], (0.0, y0 + 0.551, IZ + 0.09), c='#a8603f', seg=10)
    for i in range(8):
        a = i * 0.8
        blob('misc', (0.05, 0.012, 0.025), (math.cos(a) * 0.05, y0 + 0.68 + rnd(0, 0.04), IZ + 0.09 + math.sin(a) * 0.05), (0, -a, -0.5), c=mixc('#4f6b36', '#7a9a52', rnd()), e1=0.8, e2=0.6, nu=6, nv=4)
    coll_box(bx0, bx1, bz0, IZ, 1, tag='bench2')
    # reading corner: armchair, side table with tea, floor lamp
    armchair(-1.8, 2.55, math.pi + 0.55, MOSS, y0=y0, throw=True, lv=1)
    lathe('wood', [(0.0, 0, 's'), (0.14, 0.0), (0.14, 0.02, 's'), (0.025, 0.03), (0.025, 0.5), (0.2, 0.5, 's'), (0.2, 0.53, 's'), (0.0, 0.53)], (-2.42, y0, 2.98), c='#6e4e32', seg=16)
    lathe('ceramic', [(0.0, 0, 's'), (0.038, 0.0), (0.042, 0.09, 's'), (0.036, 0.09, 's'), (0.034, 0.012), (0.0, 0.012)], (-2.38, y0 + 0.53, 2.95), c='#c98f86', seg=12)
    for k in range(2):
        cbox('misc', (0.15, 0.03, 0.21), (-2.47, y0 + 0.545 + k * 0.031, 3.03), (0, 0.3 + k * 0.4, 0), c=rng.choice(BOOKS), ch=0.004)
    lights.append(floor_lamp(-1.2, 3.05, y0, 1.45))
    coll_box(-2.65, -1.0, 2.0, IZ, 1, tag='reading')
    # knee-wall limiters (headroom), stair-side sconce
    coll_box(2.75, IX, -IZ, IZ, 1, tag='knee')
    coll_box(-IX, -2.75, -IZ, IZ, 1, tag='knee')
    return lights

# ------------------------------------------------------------------ everything inside
def living():
    sheet('textile', -2.75, -1.0, -1.1, 1.1, F1 + 0.006, 'kilim', nu=6, nv=6)
    armchair(-2.05, -0.85, -0.62, RUST)
    armchair(-2.05, 1.15, math.pi + 0.62 - 0.0, OCHRE, throw=True)
    lathe('wood', [(0.0, 0, 's'), (0.16, 0.0, 's'), (0.18, 0.2), (0.17, 0.26, 's'), (0.0, 0.26)], (-1.55, F1, 0.15), c='#9a7a4e', seg=14, tile=0.12)   # yarn basket
    for i, cc in enumerate(('#a5532e', '#d8cfbf', '#66704a')):
        blob('fabric', (0.07, 0.07, 0.07), (-1.55 + (i - 1) * 0.08, F1 + 0.28, 0.15 + pm(0.04)), c=cc, e1=1, e2=1, nu=10, nv=7)
    coll_circle(-1.55, 0.15, 0.2, 0)

def build():
    """returns the interior light anchors (local coordinates)"""
    with group('Int'):
        fireplace(); living(); bookshelf()
        nook = reading_nook()
        kitchen()
        table = dining()
        entry()
        up = bedroom()
    return {'fire': (-3.0, F1 + 0.55, 0.0), 'table': table, 'nook': nook, 'bed': up[0], 'bed2': up[1], 'reading': up[2]}
