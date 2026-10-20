# Timber house: architecture (plinth, walls, roof, porch, chimney, windows, door, floors, stairs).
# Game coordinates (see geo.py). Numbers follow .agents/tasks/timber-house/design.md sections 2-5.
import math
from geo import *

TH = math.radians(40); TANP, COSP, SINP = math.tan(TH), math.cos(TH), math.sin(TH)
HX, HZ = 4.0, 3.5            # outer face of the cladding
IX, IZ = 3.8, 3.3            # interior faces
F1, F2 = 0.45, 3.30          # floor levels
J0 = 3.07                    # ground-floor ceiling (joist bottoms)
EAVE_X, GABLE_Z, SH = 4.72, 4.1, 0.035
def y_in(x): return 4.30 + (IX - abs(x)) * TANP          # interior ceiling board face
def y_ex(x): return 4.52 + (HX - abs(x)) * TANP          # top of the roof sheathing
def y_rake(x): return y_ex(x) - SH - 0.01                # top of the gable cladding

# palette (sRGB)
CHAR, CHAR2 = '#2c2824', '#3a342e'          # yakisugi (charred cedar)
GREY, GREY2 = '#8d8a83', '#a8a49b'          # weathered cedar
OAK, OAK2 = '#7a5a3c', '#9a7550'            # old oiled oak
PINE, PINE2, LIME = '#c9a271', '#b88d5c', '#d9cdb8'
FLOOR, FLOOR2 = '#8a6440', '#6f4f33'
STONE, STONE2, MORTAR = '#77736b', '#a39b8c', '#a59d8e'
SLATE, SLATE2 = '#33373a', '#4a4f52'
IRON, COPPER = '#2b2b2b', '#8a5a3a'

def wear(c, wp, wn):
    """exterior weathering: splash darkening near the ground, a slight cool cast up high"""
    k = 1.0
    if wp.y < 0.9: k *= 0.80 + 0.20 * min(1, max(0, (wp.y - 0.05) / 0.85))
    return (c[0] * k, c[1] * k, c[2] * k)

# openings: wall, a0, a1, y0, y1, kind, cols, rows  (a = x on S/N walls, z on E/W walls)
OPEN = [
    ('S', 0.9, 2.1, F1, F1 + 2.15, 'door', 0, 0),
    ('S', -3.5, -1.8, F1 + 0.50, F1 + 2.15, 'win', 3, 2),
    ('S', 2.6, 3.4, F1 + 0.95, F1 + 2.15, 'win', 2, 2),
    ('N', 1.6, 2.6, F1 + 1.05, F1 + 2.10, 'win', 2, 2),
    ('E', -0.6, 0.6, F1 + 0.90, F1 + 2.10, 'win', 2, 2),
    ('W', -2.1, -1.3, F1 + 0.90, F1 + 2.10, 'win', 1, 2),
    ('S', -0.7, 0.7, F2 + 0.55, F2 + 2.15, 'win', 2, 3),
    ('N', 1.4, 2.3, F2 + 0.75, F2 + 1.85, 'win', 2, 2),
    ('S', -0.32, 0.32, F2 + 3.25 - 0.32, F2 + 3.25 + 0.32, 'round', 0, 0),
]
WN = {'S': (0, 0, 1), 'N': (0, 0, -1), 'E': (1, 0, 0), 'W': (-1, 0, 0)}
def wp(wall, a, y, d):
    """point on a wall: a along the wall, y up, d = outward distance from the cladding face"""
    if wall == 'S': return (a, y, HZ + d)
    if wall == 'N': return (a, y, -HZ - d)
    if wall == 'E': return (HX + d, y, a)
    return (-HX - d, y, a)
def wsize(wall, along, up, depth):
    return (along, up, depth) if wall in 'SN' else (depth, up, along)
INNER_D = -(HZ - IZ)          # d of the interior face (-0.2)

def cut(wall, b0, b1, y0, y1, pad=0.0):
    """vertical intervals of [y0, y1] left over by the openings overlapping [b0, b1]"""
    iv = [(y0, y1)]
    for o in OPEN:
        if o[0] != wall or o[1] - pad >= b1 or o[2] + pad <= b0: continue
        out = []
        for a, b in iv:
            if o[4] <= a or o[3] >= b: out.append((a, b)); continue
            if o[3] - a > 0.02: out.append((a, o[3]))
            if b - o[4] > 0.02: out.append((o[4], b))
        iv = out
    return iv

# ------------------------------------------------------------------ plinth
def plinth():
    # mortar core (only its outer faces show)
    sbox('stone', (2 * HX + 0.06, 0.75, 2 * HZ + 0.06), (0, 0.075, 0), c=MORTAR, tile=1.6, colfn=wear, skip=('py', 'ny'))
    for wall, L in (('N', HX), ('E', HZ), ('W', HZ)):
        for y0, y1 in ((-0.22, 0.10), (0.10, 0.38)):
            a = -L - 0.02
            while a < L + 0.02:
                ln = rnd(0.32, 0.62); a1 = min(L + 0.04, a + ln)
                g = 0.012
                yy0, yy1 = y0 + g + pm(0.012), y1 - g + pm(0.012)
                d0, d1 = 0.0, 0.05 + rnd(0, 0.03)
                back = [wp(wall, a + g, yy0, d0), wp(wall, a1 - g, yy0, d0), wp(wall, a1 - g, yy1, d0), wp(wall, a + g, yy1, d0)]
                ins = 0.025
                front = [wp(wall, a + g + ins + pm(0.01), yy0 + ins + pm(0.01), d1), wp(wall, a1 - g - ins + pm(0.01), yy0 + ins + pm(0.01), d1 + pm(0.01)),
                         wp(wall, a1 - g - ins + pm(0.01), yy1 - ins + pm(0.01), d1 + pm(0.01)), wp(wall, a + g + ins + pm(0.01), yy1 - ins + pm(0.01), d1)]
                hexa('stone', back + front, c=mixc(STONE, STONE2, rnd()), tile=0.9, jit=0.12, colfn=wear, skip=('b',))
                a = a1
        # cap slabs
        a = -L - 0.07
        while a < L + 0.07:
            a1 = min(L + 0.07, a + rnd(0.5, 0.9))
            b = wp(wall, (a + a1) / 2, 0.415, 0.0)
            sbox('stone', wsize(wall, a1 - a - 0.008, 0.07, 0.17), b, c=mixc(STONE, STONE2, rnd(0.3, 0.8)), tile=0.9, jit=0.08, skip=('ny',))
            a = a1

# ------------------------------------------------------------------ exterior cladding
def cladding():
    BW, BAT = 0.24, 0.05
    for wall in 'SNEW':
        L = (HX - 0.11) if wall in 'SN' else (HZ - 0.11)          # stop at the corner posts
        gable = wall in 'SN'
        for lower in (True, False):
            y0, y1 = (F1, 3.15) if lower else (3.45, None)
            c0, c1 = (CHAR, CHAR2) if lower else (GREY, GREY2)
            n = max(1, round(2 * L / BW)); bw = 2 * L / n
            for i in range(n):
                b0, b1 = -L + i * bw, -L + (i + 1) * bw
                top0 = y1 if y1 else (y_rake(b0) if gable else y_ex(HX) - SH - 0.01)
                top1 = y1 if y1 else (y_rake(b1) if gable else y_ex(HX) - SH - 0.01)
                tmax = max(top0, top1)
                cc = mixc(c0, c1, rnd())
                for a, b in cut(wall, b0, b1, y0, tmax):
                    ta = top0 if b >= tmax - 1e-6 else b
                    tb = top1 if b >= tmax - 1e-6 else b
                    nv = max(1, round((b - a) / 0.9))
                    patch('wood_ext', wp(wall, b0, a, 0), wp(wall, b0, ta, 0), wp(wall, b1, tb, 0), wp(wall, b1, a, 0),
                          1, nv, c=cc, tile=1.3, jit=0.06, colfn=wear, face=WN[wall])
                # batten over the seam on the right of this board
                if i < n - 1:
                    tm = min(top1, top1)
                    for a, b in cut(wall, b1 - 0.03, b1 + 0.03, y0, tm - 0.02):
                        if b - a < 0.06: continue
                        cbox('wood_ext', wsize(wall, BAT, b - a, 0.024), wp(wall, b1, (a + b) / 2, 0.012), c=mixc(c0, c1, rnd()),
                             ch=0.006, axis='y', seg=3.0, tile=1.3, jit=0.08, colfn=wear, caps=False)
    # corner posts and waist beam (old oak)
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (HX - 0.08), sz * (HZ - 0.08)
            cbox('wood_ext', (0.22, 3.15 - F1, 0.22), (x, (F1 + 3.15) / 2, z), c=OAK, ch=0.012, axis='y', seg=0.9, jit=0.06, colfn=wear)
            top = y_rake(HX)
            cbox('wood_ext', (0.2, top - 3.45, 0.2), (x, (3.45 + top) / 2, z), c=OAK, ch=0.012, axis='y', seg=0.9, jit=0.06)
    for wall in 'SNEW':
        L = HX + 0.06 if wall in 'SN' else HZ + 0.06
        cbox('wood_ext', wsize(wall, 2 * L, 0.30, 0.12), wp(wall, 0, 3.30, 0.03), c=OAK2, ch=0.014, axis='x' if wall in 'SN' else 'z', seg=0.8, jit=0.05)

# ------------------------------------------------------------------ roof
CHIM = (-4.65, -4.0, -0.55, 0.55)      # chimney footprint x0, x1, z0, z1
SKY = (2.1, 3.0, 0.61, 1.39)           # skylight: x0, x1 (horizontal projection), z0, z1

def slates_on_plane(origin, down, across, slope_len, width, skip=None, moss=None, ex=0.25, sw=0.40):
    """courses of slates on a plane: origin = ridge-side corner; down / across unit vectors"""
    D, A = Vector(down), Vector(across)
    N = A.cross(D).normalized()
    if N.y < 0: N = -N
    courses = int(slope_len / ex) + 1
    for r in range(courses):
        s1 = slope_len - r * ex                      # lower edge of this course (distance down-slope)
        if s1 <= 0.05: break
        ln = min(ex * 2.05, s1)
        off = (r % 2) * sw / 2
        k = -1
        while True:
            k += 1
            a0 = -sw / 2 + off + k * sw - sw / 2
            if a0 > width: break
            a1 = min(width, a0 + sw); a0c = max(0.0, a0)
            if a1 - a0c < 0.06: continue
            w = a1 - a0c - 0.012
            cen = Vector(origin) + D * (s1 - ln / 2) + A * ((a0c + a1) / 2)
            if skip and skip(cen): continue
            lift = 0.018 + pm(0.004)
            # tilt: lower edge lifted by the course below
            tilt = math.atan2(0.012, ln) + pm(0.01)
            wonky = rng.random() < 0.07
            yaw = pm(0.05 if wonky else 0.012)
            c0 = mixc(SLATE, SLATE2, rnd()) if not wonky else mixc(SLATE2, '#5a5f60', rnd())
            if moss and moss(cen, r): c0 = mixc(c0, '#4f5a33', rnd(0.2, 0.4))
            elif rng.random() < 0.025: c0 = mixc(c0, '#7f846a', rnd(0.12, 0.25))   # lichen
            # build in a local frame: x = down-slope, y = normal, z = across
            M = Matrix((D, N, D.cross(N))).transposed()     # proper rotation on both slopes
            Rt = Matrix.Rotation(tilt, 3, 'Z') @ Matrix.Rotation(yaw, 3, 'Y')
            R = M @ Rt
            e = R.to_euler('XYZ')
            p = cen + N * (lift + (0.006 if wonky else 0))
            sbox('slate', (ln, 0.014, w), tuple(p), (e.x, e.y, e.z), c=c0, tile=0.55, jit=0.08, skip=('ny', 'nx', 'pz', 'nz'))

def roof():
    # sheathing slabs (one per side; the west one is split around the chimney)
    for sx in (1, -1):
        def slab(z0, z1, x0=0.0, x1=EAVE_X):
            bot = [(sx * x, y_ex(x) - SH, z) for x, z in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))]
            top = [(p[0], p[1] + SH, p[2]) for p in bot]
            hexa('wood_ext', bot + top, c=mixc(GREY, OAK, 0.5), tile=1.2)
        if sx < 0:
            slab(-GABLE_Z, CHIM[2]); slab(CHIM[3], GABLE_Z); slab(CHIM[2], CHIM[3], 0.0, -CHIM[1])
        else:
            slab(-GABLE_Z, GABLE_Z)
        # slates
        D = (sx * COSP, -SINP, 0.0); A = (0, 0, 1)
        o = (0.0, y_ex(0) + 0.004, -GABLE_Z)
        L = (EAVE_X + 0.05) / COSP
        def skip(c, sx=sx):
            if sx > 0 and SKY[0] - 0.12 < c.x < SKY[1] + 0.12 and SKY[2] - 0.1 < c.z < SKY[3] + 0.1: return True
            if sx < 0 and c.x < CHIM[1] + 0.12 and CHIM[2] - 0.12 < c.z < CHIM[3] + 0.12: return True
            return False
        moss = (lambda c, r: r < 3 and rng.random() < 0.6) if sx < 0 else (lambda c, r: r < 2 and rng.random() < 0.3)
        slates_on_plane(o, D, A, L, 2 * GABLE_Z, skip, moss)
        # rafter tails under the eave
        z = -3.9
        while z < 3.95:
            if not (sx < 0 and CHIM[2] - 0.05 < z < CHIM[3] + 0.05):
                xc = 4.33
                p = (sx * xc, y_ex(xc) - SH - 0.07 / COSP, z)
                cbox('wood_ext', (0.66 / COSP, 0.14, 0.07), p, (0, 0, -sx * TH), c=OAK, ch=0.008, seg=2, jit=0.06)
            z += 0.65
        # eave fascia + copper gutter
        yf = y_ex(EAVE_X)
        segs = [(-GABLE_Z, CHIM[2] - 0.02), (CHIM[3] + 0.02, GABLE_Z)] if sx < 0 else [(-GABLE_Z, GABLE_Z)]
        for z0, z1 in segs:
            cbox('wood_ext', (0.04, 0.20, z1 - z0), (sx * (EAVE_X + 0.02), yf - 0.07, (z0 + z1) / 2), c=GREY2, ch=0.006, axis='z', seg=2, jit=0.05)
            cyl('metal', 0.065, z1 - z0, (sx * (EAVE_X + 0.11), yf - 0.13, (z0 + z1) / 2), (math.pi / 2, 0, 0), c=COPPER, seg=10,
                colfn=lambda c, p, n: mixc(c, '#5f9e8a', 0.55) if n.y < -0.3 else c)
        # downpipes at the north corners
        gx = sx * (EAVE_X + 0.11); yg = yf - 0.18
        rod('metal', (gx, yg, -3.95), (gx, yg - 0.25, -3.95), 0.04, COPPER)
        rod('metal', (gx, yg - 0.25, -3.95), (sx * (HX + 0.16), yg - 0.7, -3.95), 0.04, COPPER)
        rod('metal', (sx * (HX + 0.16), yg - 0.7, -3.95), (sx * (HX + 0.16), 0.15, -3.95), 0.042, COPPER,
            colfn=lambda c, p, n: mixc(c, '#5f9e8a', 0.3 + 0.3 * (p.y < 1)))
        rod('metal', (sx * (HX + 0.16), 0.15, -3.95), (sx * (HX + 0.36), 0.05, -3.95), 0.042, COPPER)
    # barge boards along the gables and ridge
    for sz in (1, -1):
        for sx in (1, -1):
            L = EAVE_X / COSP
            xc = EAVE_X / 2
            p = (sx * xc, y_ex(xc) - 0.10, sz * (GABLE_Z + 0.02))
            cbox('wood_ext', (L + 0.05, 0.26, 0.045), p, (0, 0, -sx * TH), c=GREY2, ch=0.008, seg=1.0, jit=0.05)
        # exposed ridge beam and purlin ends at the gable overhang
        for x in (0.0, -2.0, 2.0):
            h = 0.26 if x == 0 else 0.22
            yt = y_ex(abs(x)) - SH
            cbox('wood_ext', (0.18, h, 0.62), (x, yt - h / 2, sz * (HZ + 0.31)), c=OAK, ch=0.01, axis='z', jit=0.06)
    for sx in (1, -1):
        cbox('slate', (0.20, 0.03, 2 * GABLE_Z + 0.1), (sx * 0.07, y_ex(0.07) + 0.06, 0), (0, 0, -sx * TH), c='#3d4144', ch=0.006, axis='z', seg=2.5)
    cyl('slate', 0.045, 2 * GABLE_Z + 0.14, (0, y_ex(0) + 0.115, 0), (math.pi / 2, 0, 0), c='#3a3e41', seg=10)
    # skylight on the east slope (frame + glass)
    x0, x1, z0, z1 = SKY
    sl = (x1 - x0) / COSP
    xc = (x0 + x1) / 2
    base = Vector((xc, y_ex(xc) + 0.05, (z0 + z1) / 2))
    for dz, w in ((z0 - 0.04, 0.08), (z1 + 0.04, 0.08)):
        cbox('metal', (sl + 0.16, 0.10, w), (xc, y_ex(xc) + 0.05, dz), (0, 0, -TH), c='#3b3f40', ch=0.008)
    for dx in (x0 - 0.03, x1 + 0.03):
        cbox('metal', (0.08, 0.10, z1 - z0 + 0.16), (dx, y_ex(dx) + 0.05, (z0 + z1) / 2), (0, 0, -TH), c='#3b3f40', ch=0.008, axis='z')
    with group('Glass'):
        n = Vector((SINP, COSP, 0))
        pts = [(x0, y_ex(x0) + 0.07, z0), (x1, y_ex(x1) + 0.07, z0), (x1, y_ex(x1) + 0.07, z1), (x0, y_ex(x0) + 0.07, z1)]
        poly('glass', pts, normal=tuple(n), double=True)
    # lead flashing around the chimney where the slates stop
    cbox('metal', (0.16, 0.012, CHIM[3] - CHIM[2] + 0.3), (-3.93, y_ex(3.93) + 0.012, 0), (0, 0, TH), c='#55595a', ch=0.004, axis='z')

# ------------------------------------------------------------------ stonework helper
def stones_rect(P0, t, n, a0, a1, y0, y1, c0=STONE, c1=STONE2, ch=(0.22, 0.30), ln=(0.26, 0.5), proud=(0.02, 0.05), colfn=None):
    """random-coursed fieldstone on a plane: P(a, y, d) = P0 + t * a + up * y + n * d"""
    P0, t, n, up = Vector(P0), Vector(t), Vector(n), Vector((0, 1, 0))
    P = lambda a, y, d: tuple(P0 + t * a + up * y + n * d)
    y = y0
    row = 0
    while y < y1 - 0.04:
        h = min(rnd(*ch), y1 - y)
        a = a0 - (rnd(0.0, 0.2) if row % 2 else 0.0)
        while a < a1 - 0.03:
            l = min(rnd(*ln), a1 - a)
            g = 0.012; ins = 0.022
            aa0, aa1 = max(a0, a) + g, a + l - g
            yy0, yy1 = y + g + pm(0.01), y + h - g + pm(0.01)
            d1 = rnd(*proud)
            back = [P(aa0, yy0, 0), P(aa1, yy0, 0), P(aa1, yy1, 0), P(aa0, yy1, 0)]
            front = [P(aa0 + ins + pm(0.012), yy0 + ins + pm(0.012), d1 + pm(0.008)), P(aa1 - ins + pm(0.012), yy0 + ins + pm(0.012), d1 + pm(0.008)),
                     P(aa1 - ins + pm(0.012), yy1 - ins + pm(0.012), d1 + pm(0.008)), P(aa0 + ins + pm(0.012), yy1 - ins + pm(0.012), d1 + pm(0.008))]
            hexa('stone', back + front, c=mixc(c0, c1, rnd()), tile=0.8, jit=0.12, colfn=colfn, skip=('b',))
            a += l
        y += h; row += 1

def chimney():
    x0, x1, z0, z1 = CHIM
    top = 7.62
    soot = lambda c, p, n: mulc(wear(c, p, n), 1 - 0.55 * min(1, max(0, (p.y - 6.9) / 0.7)))
    sbox('stone', (x1 - x0 - 0.06, top + 0.3, z1 - z0 - 0.06), ((x0 + x1) / 2, (top - 0.3) / 2, 0), c=MORTAR, tile=1.4, skip=('ny',), colfn=soot)
    stones_rect((x0 + 0.03, 0, 0), (0, 0, 1), (-1, 0, 0), z0, z1, -0.25, top, colfn=soot)
    stones_rect((0, 0, z0 + 0.03), (1, 0, 0), (0, 0, -1), x0, x1, -0.25, top, colfn=soot)
    stones_rect((0, 0, z1 - 0.03), (1, 0, 0), (0, 0, 1), x0, x1, -0.25, top, colfn=soot)
    stones_rect((x1 - 0.03, 0, 0), (0, 0, 1), (1, 0, 0), z0, z1, y_ex(HX) - 0.1, top, colfn=soot)
    cbox('stone', (x1 - x0 + 0.14, 0.1, z1 - z0 + 0.14), ((x0 + x1) / 2, top + 0.05, 0), c='#6a665f', ch=0.015, tile=0.8, colfn=soot)
    for dz in (-0.2, 0.2):
        lathe('ceramic', [(0.10, 0, 's'), (0.10, 0.04), (0.085, 0.10), (0.085, 0.22), (0.10, 0.25, 's'), (0.10, 0.28, 's'), (0.075, 0.28, 's'), (0.07, 0.10)],
              ((x0 + x1) / 2, top + 0.1, dz), c='#9a5a40', seg=12, caps=(False, False),
              colfn=lambda c, p, n: mulc(c, 0.45) if p.y > 7.9 or n.y > 0.5 else c)

# ------------------------------------------------------------------ porch
PZ0, PZ1, POST_Z = HZ, 5.30, 5.15
def porch_roof_y(z): return 3.55 - (z - HZ) * math.tan(math.radians(20))
def porch():
    # deck
    sbox('wood_ext', (2 * HX, 0.03, PZ1 - PZ0), (0, 0.40, (PZ0 + PZ1) / 2), c='#1c1916', skip=('ny',))
    x = -HX
    while x < HX - 0.02:
        w = min(0.14, HX - x)
        cbox('wood_ext', (w - 0.009, 0.035, PZ1 - PZ0 + 0.02), (x + w / 2, F1 - 0.0175, (PZ0 + PZ1) / 2 + 0.01), c=mixc(OAK, GREY, rnd(0.3, 0.7)),
             ch=0.004, axis='z', seg=2.0, jit=0.08,
             colfn=lambda c, p, n: mulc(c, 1.12) if abs(p.x - 1.5) < 0.6 and n.y > 0.5 else c)    # worn path to the door
        x += w
    sbox('wood_ext', (2 * HX + 0.06, 0.52, 0.04), (0, 0.19, PZ1 + 0.02), c=OAK, colfn=wear)
    for sx in (-1, 1):
        sbox('wood_ext', (0.04, 0.52, PZ1 - PZ0), (sx * (HX + 0.02), 0.19, (PZ0 + PZ1) / 2), c=OAK, colfn=wear)
    # steps (granite)
    cbox('stone', (1.5, 0.30, 0.32), (1.5, 0.15, 5.46), c='#8e8a82', ch=0.02, tile=0.9, colfn=wear)
    cbox('stone', (1.5, 0.15, 0.34), (1.5, 0.075, 5.79), c='#86827a', ch=0.02, tile=0.9, colfn=wear)
    # posts, beam, braces
    for px in (-3.85, 0.45, 3.85):
        cbox('stone', (0.30, 0.10, 0.30), (px, F1 + 0.05, POST_Z), c='#7d786f', ch=0.015)
        cbox('wood_ext', (0.20, 2.43 - F1 - 0.1, 0.20), (px, (2.43 + F1 + 0.1) / 2, POST_Z), c=OAK, ch=0.014, axis='y', seg=0.8, jit=0.05)
    cbox('wood_ext', (2 * HX + 0.3, 0.22, 0.20), (0, 2.54, POST_Z), c=OAK2, ch=0.014, seg=0.8, jit=0.04)
    for px, s in ((-3.85, 1), (3.85, -1), (0.45, -1)):
        a = (px + s * 0.10, 2.06); b = (px + s * 0.46, 2.43)
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        cbox('wood_ext', (L + 0.06, 0.09, 0.09), ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, POST_Z), (0, 0, math.atan2(b[1] - a[1], b[0] - a[0])),
             c=OAK, ch=0.008)
    # shed roof
    tz = math.tan(math.radians(20)); cz, szn = math.cos(math.radians(20)), math.sin(math.radians(20))
    Z1 = 5.58
    bot = [(x, porch_roof_y(z) - SH, z) for x, z in ((-4.15, HZ), (4.15, HZ), (4.15, Z1), (-4.15, Z1))]
    hexa('wood_ext', bot + [(p[0], p[1] + SH, p[2]) for p in bot], c=mixc(GREY, OAK, 0.5))
    slates_on_plane((-4.15, porch_roof_y(HZ) + 0.004, HZ), (0, -szn, cz), (1, 0, 0), (Z1 - HZ) / cz + 0.04, 8.3)
    x = -3.9
    while x < 3.95:
        zc = (HZ + Z1) / 2
        cbox('wood_ext', (0.06, 0.12, (Z1 - HZ) / cz), (x, porch_roof_y(zc) - SH - 0.06 / cz, zc), (math.radians(20), 0, 0), c=OAK, ch=0.006, axis='z', seg=1.2, jit=0.06)
        x += 0.6
    cbox('wood_ext', (8.34, 0.16, 0.035), (0, porch_roof_y(Z1) - 0.05, Z1 + 0.02), c=GREY2, ch=0.006, seg=1.4)
    cbox('metal', (8.3, 0.012, 0.16), (0, porch_roof_y(HZ + 0.05) + 0.03, HZ + 0.06), (math.radians(20), 0, 0), c='#55595a', ch=0.004)
    # rain chain into a stone basin at the east end
    for i in range(11):
        y = porch_roof_y(Z1) - 0.12 - i * 0.24
        lathe('metal', [(0.0, 0, 's'), (0.035, 0.0), (0.05, 0.07), (0.055, 0.1, 's')], (4.05, y - 0.1, Z1 - 0.05), c=COPPER, seg=8, caps=(False, False),
              colfn=lambda c, p, n: mixc(c, '#5f9e8a', 0.45))
    rod('metal', (4.05, porch_roof_y(Z1) - 0.02, Z1 - 0.05), (4.05, 0.32, Z1 - 0.05), 0.006, '#4e5d52')
    lathe('stone', [(0.26, 0, 's'), (0.30, 0.18), (0.30, 0.30, 's'), (0.24, 0.30, 's'), (0.22, 0.12, 's'), (0.0, 0.12)], (4.05, -0.02, Z1 - 0.05), c='#7f7a70', seg=14, tile=0.6)
    # lantern beside the door
    cbox('metal', (0.03, 0.03, 0.2), (2.35, 2.62, HZ + 0.1), c=IRON, ch=0.004, axis='z')
    rod('metal', (2.35, 2.62, HZ + 0.2), (2.35, 2.55, HZ + 0.2), 0.006, IRON)
    lathe('metal', [(0.0, 0.25, 's'), (0.12, 0.17, 's'), (0.10, 0.155, 's'), (0.0, 0.155)], (2.35, 2.30, HZ + 0.2), c=IRON, seg=8)
    lathe('metal', [(0.0, 0.0, 's'), (0.08, 0.0, 's'), (0.08, 0.03, 's'), (0.0, 0.03)], (2.35, 2.30, HZ + 0.2), c=IRON, seg=8)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        rod('metal', (2.35 + 0.075 * math.cos(a), 2.32, HZ + 0.2 + 0.075 * math.sin(a)), (2.35 + 0.095 * math.cos(a), 2.465, HZ + 0.2 + 0.095 * math.sin(a)), 0.006, IRON, seg=5)
    lathe('shade', [(0.0, 0.03, 's'), (0.07, 0.03), (0.088, 0.155), (0.0, 0.155, 's')], (2.35, 2.30, HZ + 0.2), c='#ffe2b0', seg=8)
    # bench under the reading window, potted herbs by the steps, boot scraper mat
    cbox('wood_ext', (1.4, 0.05, 0.38), (-2.65, F1 + 0.44, HZ + 0.27), c=OAK2, ch=0.008)
    cbox('wood_ext', (1.4, 0.24, 0.04), (-2.65, F1 + 0.72, HZ + 0.07), (-0.12, 0, 0), c=OAK2, ch=0.008)
    for dx in (-0.62, 0.62):
        cbox('wood_ext', (0.05, 0.44, 0.34), (-2.65 + dx, F1 + 0.22, HZ + 0.26), c=OAK, ch=0.006, axis='y')
    for px, pz, s in ((0.55, 5.05, 1.0), (2.55, 5.0, 0.85), (-0.2, 4.9, 0.7)):
        lathe('ceramic', [(0.0, 0, 's'), (0.13 * s, 0, 's'), (0.17 * s, 0.26 * s), (0.185 * s, 0.30 * s, 's'), (0.16 * s, 0.30 * s, 's'), (0.15 * s, 0.24 * s)],
              (px, F1, pz), c='#a8603f', seg=12, caps=(False, False))
        for i in range(7):
            blob('misc', (0.09 * s, 0.07 * s, 0.09 * s), (px + pm(0.08 * s), F1 + 0.30 * s + rnd(0.02, 0.12) * s, pz + pm(0.08 * s)), c=mixc('#4f6b36', '#6f8a45', rnd()), e1=1, e2=1, nu=8, nv=5)
    sbox('fabric', (0.9, 0.02, 0.55), (1.5, F1 + 0.01, HZ + 0.4), c='#8a6a44', tile=0.25, skip=('ny',))

# ------------------------------------------------------------------ firewood and chopping block (west side)
def firewood():
    sbox('wood_ext', (0.55, 0.08, 2.6), (-4.35, 0.04, 2.05), c='#3a3029', skip=('ny',))
    for row in range(7):
        y = 0.08 + 0.08 + row * 0.158
        z = 0.8 + (0.06 if row % 2 else 0)
        while z < 3.28:
            r = rnd(0.068, 0.088)
            cyl('wood_ext', r, rnd(0.46, 0.52), (-4.35 + pm(0.02), y + pm(0.01), z + r), (0, pm(0.05), math.pi / 2 + pm(0.03)), c=mixc('#6b4a32', '#7d6047', rnd()), seg=6,
                colfn=lambda c, p, n: mixc('#c9a072', '#a8794c', rnd()) if abs(n.x) > 0.9 else c)
            z += 2 * r + 0.004
    cyl('wood_ext', 0.24, 0.46, (-5.3, 0.22, 3.9), c='#5e4632', seg=12, bev=0.02,
        colfn=lambda c, p, n: mixc('#b08a5e', '#8f6a45', rnd()) if n.y > 0.9 else c)
    rod('wood_ext', (-5.32, 0.45, 3.86), (-5.05, 0.95, 4.25), 0.018, '#8a6a48')
    cbox('metal', (0.16, 0.10, 0.02), (-5.31, 0.47, 3.87), (0.6, 0.0, 0.9), c='#4a4a4a', ch=0.004)

# ------------------------------------------------------------------ windows and the front door
def _wbox(mat, wall, a, y, d, along, up, depth, c, **kw):
    ax = kw.pop('axis', 'x')
    if wall in 'EW' and ax == 'x': ax = 'z'
    cbox(mat, wsize(wall, along, up, depth), wp(wall, a, y, d), c=c, axis=ax, **kw)

def window(o):
    wall, a0, a1, y0, y1, kind, cols, rows = o
    W, H, am, ym = a1 - a0, y1 - y0, (a0 + a1) / 2, (y0 + y1) / 2
    DEP = -INNER_D                         # wall depth 0.2
    upper = y0 > F2 - 0.1
    ext_c = OAK if not upper else OAK2
    if kind == 'round':
        R0 = W / 2
        rotw = (math.pi / 2, 0, 0)
        torus('wood_ext', R0 + 0.08, 0.065, wp(wall, am, ym, 0.03), rotw, c=OAK2, nu=24, nv=6)
        cyl('wood_ext', R0 + 0.01, DEP, wp(wall, am, ym, -DEP / 2), rotw, c=OAK, seg=20, caps=(False, False))
        for ang in (0, math.pi / 2):
            cbox('wood_ext', (2 * R0, 0.035, 0.035), wp(wall, am, ym, -0.06), (0, 0, ang), c=OAK2, ch=0.005)
        with group('Glass'):
            pts = [wp(wall, am + R0 * math.cos(k / 20 * 2 * math.pi), ym + R0 * math.sin(k / 20 * 2 * math.pi), -0.065) for k in range(20)]
            poly('glass', pts, normal=WN[wall], double=True)
        with group('Int'):
            torus('wood', R0 + 0.085, 0.055, wp(wall, am, ym, INNER_D - 0.01), rotw, c=LIME, nu=24, nv=6)
        return
    # lining of the opening (full wall depth)
    for a in (a0 + 0.0225, a1 - 0.0225):
        _wbox('wood_ext', wall, a, ym, -DEP / 2, 0.045, H, DEP + 0.01, OAK, ch=0.006, axis='y')
    _wbox('wood_ext', wall, am, y1 - 0.0225, -DEP / 2, W, 0.045, DEP + 0.01, OAK, ch=0.006)
    if kind == 'door':
        # threshold: worn in the middle
        _wbox('wood_ext', wall, am, y0 - 0.02, -DEP / 2 + 0.01, W + 0.06, 0.05, DEP + 0.06, OAK2, ch=0.01,
              colfn=lambda c, p, n: mulc(c, 1.15) if n.y > 0.5 and abs(p.x - am) < 0.35 else c)
    else:
        _wbox('wood_ext', wall, am, y0 + 0.0225, -DEP / 2, W, 0.045, DEP + 0.01, OAK, ch=0.006)
        _wbox('wood_ext', wall, am, y0 - 0.02, 0.05, W + 0.30, 0.05, 0.13, ext_c, ch=0.01)          # sill nose
    # exterior casing + drip cap
    for a in (a0 - 0.05, a1 + 0.05):
        _wbox('wood_ext', wall, a, ym + 0.05 * (kind != 'door'), 0.0175, 0.10, H + (0.1 if kind == 'door' else 0.2), 0.035, ext_c, ch=0.006, axis='y', colfn=wear)
    _wbox('wood_ext', wall, am, y1 + 0.065, 0.02, W + 0.32, 0.13, 0.04, ext_c, ch=0.008)
    _wbox('metal', wall, am, y1 + 0.135, 0.04, W + 0.36, 0.012, 0.08, '#4b4f50', ch=0.003)
    # interior casing + stool
    with group('Int'):
        ic = LIME if upper else PINE2
        for a in (a0 - 0.04, a1 + 0.04):
            _wbox('wood', wall, a, ym + (0.0 if kind == 'door' else 0.04), INNER_D - 0.012, 0.08, H + (0.08 if kind == 'door' else 0.16), 0.024, ic, ch=0.005, axis='y')
        _wbox('wood', wall, am, y1 + 0.05, INNER_D - 0.014, W + 0.16, 0.10, 0.028, ic, ch=0.006)
        if kind != 'door':
            _wbox('wood', wall, am, y0 - 0.0175, INNER_D + 0.05, W + 0.16, 0.035, 0.24, ic if upper else OAK2, ch=0.008)
    if kind == 'door': return
    # sash, glazing bars, glass
    sd = -0.065
    fw = 0.055
    ia0, ia1, iy0, iy1 = a0 + 0.045, a1 - 0.045, y0 + 0.045, y1 - 0.045
    for a in (ia0 + fw / 2, ia1 - fw / 2):
        _wbox('wood_ext', wall, a, ym, sd, fw, iy1 - iy0, 0.05, '#e3dccb' if False else OAK2, ch=0.004, axis='y')
    for y in (iy0 + fw / 2, iy1 - fw / 2):
        _wbox('wood_ext', wall, am, y, sd, ia1 - ia0, fw, 0.05, OAK2, ch=0.004)
    for i in range(1, cols):
        a = ia0 + fw + (ia1 - ia0 - 2 * fw) * i / cols
        _wbox('wood_ext', wall, a, ym, sd, 0.028, iy1 - iy0 - 2 * fw, 0.035, OAK2, ch=0.003, axis='y')
    for j in range(1, rows):
        y = iy0 + fw + (iy1 - iy0 - 2 * fw) * j / rows
        _wbox('wood_ext', wall, am, y, sd, ia1 - ia0 - 2 * fw, 0.028, 0.035, OAK2, ch=0.003)
    with group('Glass'):
        pts = [wp(wall, ia0 + fw, iy0 + fw, sd), wp(wall, ia1 - fw, iy0 + fw, sd), wp(wall, ia1 - fw, iy1 - fw, sd), wp(wall, ia0 + fw, iy1 - fw, sd)]
        poly('glass', pts, normal=WN[wall], double=True)

DOOR_HINGE = (2.05, HZ - 0.145)           # door pivot (x, z): inner east corner of the leaf
def door():
    """front door leaf, modelled in place (house.py moves its origin to the hinge)"""
    with group('Door'):
        x0, x1 = 0.9 + 0.05, 2.1 - 0.05
        y0, y1 = F1 + 0.01, F1 + 2.15 - 0.05
        zc = HZ - 0.12                    # leaf sits in the inner half of the opening
        n = 6; w = (x1 - x0) / n
        # glass light with a small frame, high in the door
        gx0, gx1, gy0, gy1 = 1.25, 1.75, F1 + 1.55, F1 + 1.9
        for i in range(n):
            bx0, bx1 = x0 + i * w, x0 + (i + 1) * w
            ivs = [(y0, gy0), (gy1, y1)] if bx1 > gx0 and bx0 < gx1 else [(y0, y1)]
            cc = mixc('#6e4a2e', '#7d5636', rnd())
            for ya, yb in ivs:
                cbox('wood', (w - 0.004, yb - ya, 0.045), ((bx0 + bx1) / 2, (ya + yb) / 2, zc), c=cc, ch=0.006, axis='y', seg=0.7, jit=0.03,
                     colfn=lambda c, p, nn: mulc(c, 0.85) if p.y < F1 + 0.25 else c)
        for yy in (F1 + 0.35, F1 + 1.15):    # ledges on the inside, Z brace
            cbox('wood', (x1 - x0 - 0.06, 0.12, 0.03), ((x0 + x1) / 2, yy, zc - 0.037), c='#6a452a', ch=0.006)
        dx, dy = (x1 - x0 - 0.2), 0.68
        cbox('wood', (math.hypot(dx, dy), 0.11, 0.03), ((x0 + x1) / 2, F1 + 0.75, zc - 0.037), (0, 0, math.atan2(dy, dx)), c='#6a452a', ch=0.006)
        for yy in (gy0 - 0.03, gy1 + 0.03):
            cbox('wood', (gx1 - gx0 + 0.1, 0.05, 0.06), ((gx0 + gx1) / 2, yy, zc), c='#5a3c25', ch=0.005)
        for xx in (gx0 - 0.03, gx1 + 0.03):
            cbox('wood', (0.05, gy1 - gy0, 0.06), (xx, (gy0 + gy1) / 2, zc), c='#5a3c25', ch=0.005, axis='y')
        poly('glass', [(gx0, gy0, zc + 0.002), (gx1, gy0, zc + 0.002), (gx1, gy1, zc + 0.002), (gx0, gy1, zc + 0.002)], normal=(0, 0, 1), double=True)
        # strap hinges, ring pull, heart inlay
        for yy in (F1 + 0.4, F1 + 1.75):
            cbox('metal', (0.62, 0.045, 0.008), (x1 - 0.31, yy, zc + 0.027), c=IRON, ch=0.003)
            cyl('metal', 0.018, 0.12, (x1 + 0.012, yy, zc + 0.02), c=IRON, seg=8)
        torus('metal', 0.05, 0.007, (x0 + 0.12, F1 + 1.02, zc + 0.04), (math.pi / 2, 0, 0), c='#3a3632', nu=14, nv=5)
        cyl('metal', 0.03, 0.02, (x0 + 0.12, F1 + 1.07, zc + 0.03), (math.pi / 2, 0, 0), c='#3a3632', seg=10)
        cyl('metal', 0.022, 0.12, (x0 + 0.12, F1 + 1.02, zc - 0.07), (math.pi / 2, 0, 0), c='#3a3632', seg=8)
        hx, hy, hz = 1.5, F1 + 1.38, zc + 0.024
        pts = []
        for k in range(28):
            t = k / 28 * 2 * math.pi
            pts.append((hx + 0.006 * 16 * math.sin(t) ** 3 / 2.2, hy + 0.006 * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 2.2, hz))
        poly('misc', pts, c='#b5413f', normal=(0, 0, 1))

# ------------------------------------------------------------------ interior shell
HOLE = (-1.7, 1.1, -3.3, -2.35)        # stair opening in the upper floor: x0, x1, z0, z1
STAIR_X0, STAIR_RUN, STAIR_RISE, STAIR_N = -2.4, 0.25, 0.19, 15
def nosing_y(x): return F1 + (x - STAIR_X0 + STAIR_RUN) * (STAIR_RISE / STAIR_RUN)

def _worn_floor(c, p, n):
    """walking lines: door -> stairs, door -> kitchen, hearth: a touch lighter and smoother"""
    if n.y < 0.5: return c
    d1 = abs((p.z - 3.0) * 0.9 + (p.x - 1.5) * 0.3)
    k = 1.0
    if p.y < 1.0:
        if -2.6 < p.x < 1.8 and -2.3 < p.z < 3.3 and abs(p.x - (1.5 + (p.z - 3.3) * 0.75)) < 0.5: k = 1.09
        if abs(p.x + 2.4) < 0.45 and -2.6 < p.z < 0.9: k = max(k, 1.06)
    return (c[0] * k, c[1] * k, c[2] * k)

def floor_boards(y, x0, x1, z0, z1, c0, c1, bw=0.16, worn=None, under=None):
    sbox('wood', (x1 - x0, 0.01, z1 - z0), ((x0 + x1) / 2, y - 0.012, (z0 + z1) / 2), c='#24180f', skip=('ny', 'px', 'nx', 'pz', 'nz'))
    z = z0
    while z < z1 - 0.02:
        w = min(bw, z1 - z)
        x = x0 - rnd(0, 1.2)
        cc = None
        while x < x1:
            L = rnd(1.1, 2.6)
            a, b = max(x0, x), min(x1, x + L)
            if b - a > 0.08:
                cc = mixc(c0, c1, rnd())
                nu = max(1, math.ceil((b - a) / 0.8))
                patch('wood', (a + 0.002, y, z + 0.002), (b - 0.002, y, z + 0.002), (b - 0.002, y, z + w - 0.002), (a + 0.002, y, z + w - 0.002),
                      nu, 1, c=cc, tile=1.1, jit=0.05, colfn=worn, face=(0, 1, 0))
            x += L
        z += w
    if under is not None:      # ceiling of the room below (one sheet; the joists break it up)
        nu, nv = max(1, math.ceil((x1 - x0) / 0.6)), max(1, math.ceil((z1 - z0) / 0.6))
        patch('wood', (x0, under, z0), (x1, under, z0), (x1, under, z1), (x0, under, z1), nu, nv, c=mixc(PINE, PINE2, 0.5), tile=1.1, face=(0, -1, 0))

def lining(wall, a0, a1, y0, ytop, c0, c1, bw=0.19, skip=None):
    """vertical tongue-and-groove boards on the inside face of a wall (dark backing shows in the joints)"""
    n = WN[wall]; face = (-n[0], -n[1], -n[2])
    d = INNER_D
    n_b = max(1, round((a1 - a0) / bw)); w = (a1 - a0) / n_b
    for i in range(n_b):
        b0, b1 = a0 + i * w, a0 + (i + 1) * w
        if skip and skip(b0, b1): continue
        t0, t1 = ytop(b0), ytop(b1)
        tmax = max(t0, t1)
        cc = mixc(c0, c1, rnd())
        for a, b in cut(wall, b0, b1, y0, tmax):
            ta, tb = (t0, t1) if b >= tmax - 1e-6 else (b, b)
            nv = max(1, round((max(ta, tb) - a) / 1.0))
            patch('wood', wp(wall, b0 + 0.002, a, d), wp(wall, b0 + 0.002, ta, d), wp(wall, b1 - 0.002, tb, d), wp(wall, b1 - 0.002, a, d),
                  1, nv, c=cc, tile=1.2, jit=0.04, face=face)
            # dark backing behind this board: shows in the joints only
            patch('wood', wp(wall, b0, a, d + 0.004), wp(wall, b0, ta, d + 0.004), wp(wall, b1, tb, d + 0.004), wp(wall, b1, a, d + 0.004),
                  1, 1, c='#2a1d12', face=face)

def skirting(wall, a0, a1, y, c=OAK, gaps=()):
    n = WN[wall]
    segs = [(a0, a1)]
    for g0, g1 in gaps:
        segs = [s for p in segs for s in ((p[0], min(p[1], g0)), (max(p[0], g1), p[1])) if s[1] - s[0] > 0.02]
    for a, b in segs:
        _wbox('wood', wall, (a + b) / 2, y + 0.06, INNER_D - 0.012, b - a, 0.12, 0.024, c, ch=0.005)

def interior():
    with group('Int'):
        # ---- ground floor
        floor_boards(F1, -IX, IX, -IZ, IZ, FLOOR, FLOOR2, worn=_worn_floor)
        g_top = lambda a: 3.27
        lining('S', -IX, IX, F1, g_top, PINE, PINE2)
        lining('N', -IX, IX, F1, g_top, PINE, PINE2)
        lining('E', -IZ, IZ, F1, g_top, PINE, PINE2)
        lining('W', -IZ, IZ, F1, g_top, PINE, PINE2, skip=lambda b0, b1: b1 > -0.85 and b0 < 0.85)
        skirting('S', -IX, IX, F1, gaps=((0.88, 2.12),))
        skirting('N', -IX, IX, F1, gaps=((STAIR_X0 - 0.1, 3.8),))
        skirting('E', -IZ, IZ, F1, gaps=((-2.7, -1.2),))
        skirting('W', -IZ, IZ, F1, gaps=((-0.95, 0.95), (-3.3, -2.35)))
        # ---- ceiling: beams, joists, boards above
        for zb in (-1.15, 1.15):
            cbox('wood', (2 * IX + 0.1, 0.30, 0.24), (0, 3.10, zb), c='#5b402a', ch=0.016, seg=0.8, jit=0.04)
            for sx in (-1, 1):
                a = (sx * (IX - 0.02), 2.45); b = (sx * (IX - 0.52), 2.96)
                cbox('wood', (math.hypot(0.5, 0.51) + 0.08, 0.12, 0.12), ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, zb),
                     (0, 0, math.atan2(b[1] - a[1], b[0] - a[0])), c='#5b402a', ch=0.01)
        hx0, hx1, hz0, hz1 = HOLE
        x = -IX + 0.2
        while x < IX - 0.1:
            z0 = hz1 if hx0 - 0.04 < x < hx1 + 0.04 else -IZ
            cbox('wood', (0.08, 0.20, IZ - z0), (x, 3.17, (IZ + z0) / 2), c=mixc('#6b4c32', '#5e422b', rnd()), ch=0.008, axis='z', seg=1.6, jit=0.05)
            x += 0.6
        cbox('wood', (hx1 - hx0 + 0.12, 0.23, 0.12), ((hx0 + hx1) / 2, 3.185, hz1 + 0.06), c='#5b402a', ch=0.01)
        cbox('wood', (0.12, 0.23, hz1 - hz0), (hx0 - 0.06, 3.185, (hz0 + hz1) / 2), c='#5b402a', ch=0.01, axis='z')
        # ---- upper floor (with the stair opening)
        for (x0, x1, z0, z1) in ((-IX, IX, hz1, IZ), (-IX, hx0, -IZ, hz1), (hx1, IX, -IZ, hz1)):
            floor_boards(F2, x0, x1, z0, z1, '#9a7450', '#80603f', bw=0.18, under=3.268)
        cbox('wood', (hx1 - hx0, 0.26, 0.04), ((hx0 + hx1) / 2, F2 - 0.11, hz1 + 0.0), c=OAK2, ch=0.006)
        cbox('wood', (0.04, 0.26, hz1 - hz0), (hx0 - 0.0, F2 - 0.11, (hz0 + hz1) / 2), c=OAK2, ch=0.006, axis='z')
        # ---- upper walls: knee walls (E / W), gables (S / N) up to the sloping ceiling
        knee = lambda a: y_in(IX)
        gable = lambda a: y_in(a) - 0.005
        lining('E', -IZ, IZ, F2, knee, LIME, '#cfc0a6', bw=0.2)
        lining('W', -IZ, IZ, F2, knee, LIME, '#cfc0a6', bw=0.2)
        lining('S', -IX, IX, F2, gable, LIME, '#cfc0a6', bw=0.2)
        lining('N', -IX, IX, F2, gable, LIME, '#cfc0a6', bw=0.2)
        skirting('E', -IZ, IZ, F2, c='#8a6a4a'); skirting('W', -IZ, IZ, F2, c='#8a6a4a')
        skirting('S', -IX, IX, F2, c='#8a6a4a'); skirting('N', -IX, IX, F2, c='#8a6a4a', gaps=((hx0, hx1),))
        for sx in (-1, 1):
            cbox('wood', (0.10, 0.06, 2 * IZ), (sx * (IX - 0.05), y_in(IX) - 0.03, 0), c='#7a5a3c', ch=0.006, axis='z', seg=1.2)
        ceiling()
        stairs()

def ceiling():
    """sloping board ceiling under the roof, exposed rafters, collar ties, ridge beam, skylight well"""
    sk0, sk1, skz0, skz1 = SKY
    for sx in (1, -1):
        nrm = Vector((-sx * SINP, -COSP, 0))
        L = (IX - 0.0) / COSP
        n_b = int(L / 0.19); w = L / n_b
        for i in range(n_b):
            xa, xb = IX - i * w * COSP, IX - (i + 1) * w * COSP          # |x| from knee wall towards the ridge
            ivs = [(-IZ, IZ)]
            if sx > 0 and xb < sk1 and xa > sk0: ivs = [(-IZ, skz0), (skz1, IZ)]
            cc = mixc('#d6c8ae', '#c9b898', rnd())
            for z0, z1 in ivs:
                pa = (sx * xa, y_in(xa), z0); pb = (sx * xb, y_in(xb), z0)
                nu = max(1, round((z1 - z0) / 0.6))
                patch('wood', (pa[0], pa[1] - 0.001, z0), (pa[0], pa[1] - 0.001, z1), (pb[0], pb[1] - 0.001, z1), (pb[0], pb[1] - 0.001, z0),
                      nu, 1, c=cc, tile=1.3, jit=0.03, face=tuple(nrm))
        # rafters
        z = -3.0
        while z < 3.05:
            segs = [(0.12, IX)]
            if sx > 0 and skz0 - 0.04 < z < skz1 + 0.04: segs = [(0.12, sk0 - 0.02), (sk1 + 0.02, IX)]
            for a, b in segs:
                xc = (a + b) / 2
                cbox('wood', ((b - a) / COSP, 0.14, 0.07), (sx * xc, y_in(xc) - 0.07 / COSP, z), (0, 0, -sx * TH), c=mixc('#7a5a3c', '#6a4c32', rnd()), ch=0.008, seg=1.0, jit=0.04)
            z += 0.6
        cbox('wood', (0.06, 0.06, 2 * IZ), (sx * 0.02, y_in(0.02) - 0.03, 0), c='#6a4c32', ch=0.004, axis='z')
    cbox('wood', (0.18, 0.26, 2 * IZ), (0, y_in(0) - 0.13, 0), c='#5e432c', ch=0.014, axis='z', seg=0.9)
    z = -3.0
    while z < 3.05:
        cbox('wood', (2 * 2.03 + 0.1, 0.16, 0.10), (0, 5.60 + 0.08, z + 0.085), c='#6a4c32', ch=0.01, seg=0.9, jit=0.04)
        z += 1.2
    # skylight well (lime-washed boards from the ceiling up to the roof)
    for z in (skz0, skz1):
        pa, pb = Vector((sk0, y_in(sk0), z)), Vector((sk1, y_in(sk1), z))
        up = Vector((0, y_ex(sk0) - y_in(sk0) + 0.05, 0))
        patch('wood', tuple(pa), tuple(pb), tuple(pb + up), tuple(pa + up), 2, 1, c=LIME, face=(0, 0, 1 if z == skz0 else -1))
    for x in (sk0, sk1):
        up = Vector((0, y_ex(x) - y_in(x) + 0.05, 0))
        pa, pb = Vector((x, y_in(x), skz0)), Vector((x, y_in(x), skz1))
        patch('wood', tuple(pa), tuple(pb), tuple(pb + up), tuple(pa + up), 1, 1, c=LIME, face=(1 if x == sk0 else -1, 0, 0))

def stairs():
    hx0, hx1, hz0, hz1 = HOLE
    zw, zo = -IZ, hz1 - 0.06            # wall side / open side of the treads
    zc = (zw + zo) / 2
    for i in range(1, STAIR_N):
        x0 = STAIR_X0 + (i - 1) * STAIR_RUN
        top = F1 + i * STAIR_RISE
        cbox('wood', (STAIR_RUN + 0.03, 0.04, zo - zw), (x0 + STAIR_RUN / 2 - 0.015, top - 0.02, zc), c=mixc('#7a5636', '#8a6440', rnd()), ch=0.008, axis='z', seg=1.0,
             colfn=lambda c, p, n: mulc(c, 1.14) if n.y > 0.5 and abs(p.z - zc + 0.08) < 0.22 else c)
        cbox('wood', (0.02, STAIR_RISE - 0.04, zo - zw), (x0 + 0.01, top - STAIR_RISE / 2 - 0.02, zc), c=PINE2, ch=0.003, axis='z', seg=1.0, caps=False)
    cbox('wood', (0.02, STAIR_RISE, zo - zw), (STAIR_X0 + (STAIR_N - 1) * STAIR_RUN + 0.01, F2 - STAIR_RISE / 2, zc), c=PINE2, ch=0.003, axis='z')
    cbox('wood', (0.08, 0.05, zo - zw), (hx1 + 0.04, F2 - 0.02, zc), c=OAK2, ch=0.01, axis='z')   # landing nosing
    # stringers
    xa, xb = STAIR_X0 - 0.15, hx1 + 0.05
    ya, yb = nosing_y(xa) - 0.12, nosing_y(xb) - 0.12
    L = math.hypot(xb - xa, yb - ya); ang = math.atan2(yb - ya, xb - xa)
    cbox('wood', (L, 0.30, 0.06), ((xa + xb) / 2, (ya + yb) / 2, hz1 - 0.03), (0, 0, ang), c=OAK, ch=0.01, seg=0.8)
    cbox('wood', (L, 0.26, 0.03), ((xa + xb) / 2, (ya + yb) / 2 + 0.02, -IZ + 0.015), (0, 0, ang), c=OAK, ch=0.008, seg=0.8)
    # under-stair board wall with a cupboard
    def under(x): return nosing_y(x) - 0.12 - 0.15 / math.cos(ang)
    xs = STAIR_X0 + 0.05
    x = xs
    while x < hx1 - 0.01:
        w = min(0.15, hx1 - x)
        ta, tb = max(F1 + 0.02, under(x)), max(F1 + 0.02, under(x + w))
        if tb > F1 + 0.05:
            patch('wood', (x + w - 0.002, F1, hz1 + 0.0), (x + w - 0.002, tb, hz1), (x + 0.002, ta, hz1), (x + 0.002, F1, hz1), 1, 3,
                  c=mixc(PINE, PINE2, rnd()), tile=1.2, face=(0, 0, 1))
        x += w
    for cx in (0.05, 0.62):
        cbox('wood', (0.52, 1.25, 0.025), (cx, F1 + 0.70, hz1 + 0.015), c='#8e6a46', ch=0.006, axis='y')
        for yy in (F1 + 0.2, F1 + 1.2):
            cbox('wood', (0.52, 0.08, 0.012), (cx, yy, hz1 + 0.032), c='#7b5a3a', ch=0.003)
        lathe('metal', [(0.0, 0, 's'), (0.012, 0.0), (0.016, 0.02), (0.0, 0.03)], (cx + (0.2 if cx < 0.3 else -0.2), F1 + 0.75, hz1 + 0.04), (math.pi / 2, 0, 0), c='#3a3632', seg=8)
    # balustrade on the open side (bottom newel -> mid newel under the gallery edge)
    nx0, nx1 = STAIR_X0 - 0.05, -0.8
    cbox('wood', (0.09, nosing_y(nx0) + 1.0 - F1, 0.09), (nx0, (F1 + nosing_y(nx0) + 1.0) / 2, hz1 - 0.03), c=OAK2, ch=0.012, axis='y')
    lathe('wood', [(0.0, 0, 's'), (0.05, 0.0), (0.055, 0.04), (0.0, 0.09)], (nx0, nosing_y(nx0) + 1.0, hz1 - 0.03), c=OAK2, seg=10)
    cbox('wood', (0.09, 3.07 - nosing_y(nx1) - 0.2 + 0.25, 0.09), (nx1, (nosing_y(nx1) - 0.05 + 3.07) / 2, hz1 - 0.03), c=OAK2, ch=0.012, axis='y')
    ra, rb = (nx0, nosing_y(nx0) + 0.9), (nx1, nosing_y(nx1) + 0.9)
    L = math.hypot(rb[0] - ra[0], rb[1] - ra[1])
    cbox('wood', (L, 0.06, 0.07), ((ra[0] + rb[0]) / 2, (ra[1] + rb[1]) / 2, hz1 - 0.03), (0, 0, math.atan2(rb[1] - ra[1], rb[0] - ra[0])), c='#8a6440', ch=0.015, seg=0.6,
         colfn=lambda c, p, n: mulc(c, 1.1) if n.y > 0.4 else c)
    x = nx0 + 0.12
    while x < nx1 - 0.06:
        y0 = nosing_y(x) - 0.02; y1 = nosing_y(x) + 0.87
        cbox('wood', (0.032, y1 - y0, 0.032), (x, (y0 + y1) / 2, hz1 - 0.03), c=OAK2, ch=0.005, axis='y', seg=1.2)
        x += 0.125
    # gallery railing around the opening on the upper floor
    def rail_run(a, b):
        A, B = Vector(a), Vector(b)
        d = B - A; L = d.length; t = d / L
        ang = math.atan2(-t.z, t.x)
        mid = (A + B) / 2
        cbox('wood', (L + 0.06, 0.06, 0.07), (mid.x, F2 + 0.95, mid.z), (0, ang, 0), c='#8a6440', ch=0.015, seg=0.7)
        cbox('wood', (L, 0.05, 0.05), (mid.x, F2 + 0.10, mid.z), (0, ang, 0), c=OAK2, ch=0.008, seg=0.7)
        k = int(L / 0.12)
        for i in range(1, k):
            p = A + t * (L * i / k)
            cbox('wood', (0.032, 0.83, 0.032), (p.x, F2 + 0.535, p.z), c=OAK2, ch=0.005, axis='y')
    rail_run((hx0 - 0.02, 0, hz1 + 0.02), (hx1 + 0.05, 0, hz1 + 0.02))
    rail_run((hx0 - 0.02, 0, -IZ), (hx0 - 0.02, 0, hz1 + 0.02))
    for px, pz in ((hx0 - 0.02, hz1 + 0.02), (hx1 + 0.05, hz1 + 0.02)):
        cbox('wood', (0.09, 1.05, 0.09), (px, F2 + 0.52, pz), c=OAK2, ch=0.012, axis='y')
        lathe('wood', [(0.0, 0, 's'), (0.05, 0.0), (0.055, 0.04), (0.0, 0.09)], (px, F2 + 1.05, pz), c=OAK2, seg=10)

def build():
    plinth(); cladding(); roof(); chimney(); porch(); firewood()
    for o in OPEN: window(o)
    door()
    interior()
