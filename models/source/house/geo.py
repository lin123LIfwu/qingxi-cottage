# Geometry builder for the timber house (pure Python + mathutils, no bpy).
# All coordinates are GAME coordinates: metres, x east, y up, z south, origin at the centre of
# the main wall outline on the ground (y = 0 is HOME_H in the game). Conversion to Blender's
# Z-up frame happens only when the buckets are turned into meshes (house.py).
import math, random
from mathutils import Matrix, Vector, Euler

rng = random.Random(20261020)
def rnd(a=0.0, b=1.0): return a + (b - a) * rng.random()
def pm(a): return (rng.random() * 2 - 1) * a

# ------------------------------------------------------------------ colour (linear RGB)
def lin1(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def hexlin(h):
    h = h.lstrip('#'); return tuple(lin1(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))
def col(c, jit=0.0, warm=0.0):
    """hex / linear tuple -> linear tuple, with brightness jitter and a small warm/cool shift"""
    c = hexlin(c) if isinstance(c, str) else tuple(c)
    k = 1 + pm(jit); w = pm(warm)
    return (c[0] * k * (1 + w), c[1] * k, c[2] * k * (1 - w))
def mixc(a, b, t):
    a = col(a); b = col(b); return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def mulc(c, k): c = col(c); return (c[0] * k, c[1] * k, c[2] * k)

# ------------------------------------------------------------------ buckets
class Bucket:
    __slots__ = ('group', 'mat', 'P', 'N', 'UV', 'C', 'F')
    def __init__(s, group, mat):
        s.group, s.mat = group, mat
        s.P, s.N, s.UV, s.C, s.F = [], [], [], [], []
    def v(s, p, n, uv, c):
        s.P.append(p); s.N.append(n); s.UV.append(uv); s.C.append(c)
        return len(s.P) - 1
    def tris(s): return sum(len(f) - 2 for f in s.F)

BUCKETS = {}
_group = ['Ext']
class group:
    """with group('Int'): ...  -> everything built inside goes to that node group"""
    def __init__(s, name): s.name = name
    def __enter__(s): _group.append(s.name)
    def __exit__(s, *a): _group.pop()
def bucket(mat):
    k = (_group[-1], mat)
    b = BUCKETS.get(k)
    if b is None: b = BUCKETS[k] = Bucket(*k)
    return b

def xf(pos, rot):
    R = Euler(rot, 'XYZ').to_matrix() if rot else Matrix.Identity(3)
    return R, Vector(pos)

def _emit(b, R, t, p, n, uv, c, colfn):
    wp = R @ Vector(p) + t
    wn = (R @ Vector(n)).normalized()
    cc = colfn(c, wp, wn) if colfn else c
    return b.v((wp.x, wp.y, wp.z), (wn.x, wn.y, wn.z), uv, cc)

def _perm(axis):
    if axis == 'x': return lambda v: (v[0], v[1], v[2])
    if axis == 'y': return lambda v: (v[2], v[0], v[1])
    return lambda v: (v[1], v[2], v[0])

# ------------------------------------------------------------------ chamfered box
def cbox(mat, size, pos, rot=None, c='#ffffff', ch=0.008, axis='x', seg=1.3, tile=1.2, uvo=None, colfn=None, jit=0.0, caps=True):
    """Box with chamfered edges and 'weighted' normals (flat faces, rounded-looking edges).
    The grain axis (local x / y / z) is subdivided every `seg` metres and gets u along it."""
    b = bucket(mat)
    sx, sy, sz = size
    L, H, D = (sx, sy, sz) if axis == 'x' else (sy, sz, sx) if axis == 'y' else (sz, sx, sy)
    P = _perm(axis)
    R, t = xf(pos, rot)
    l, h, d = L / 2, H / 2, D / 2
    e = max(1e-4, min(ch, 0.45 * min(L, H, D)))
    cc = col(c, jit)
    if uvo is None: uvo = (rnd(0, 5), rnd(0, 5))
    sec = [(h, -d + e, (0, 1, 0)), (h, d - e, (0, 1, 0)), (h - e, d, (0, 0, 1)), (-h + e, d, (0, 0, 1)),
           (-h, d - e, (0, -1, 0)), (-h, -d + e, (0, -1, 0)), (-h + e, -d, (0, 0, -1)), (h - e, -d, (0, 0, -1)),
           (h, -d + e, (0, 1, 0))]
    s = [0.0]
    for i in range(1, 9): s.append(s[-1] + math.hypot(sec[i][0] - sec[i - 1][0], sec[i][1] - sec[i - 1][1]))
    n = max(1, math.ceil((L - 2 * e) / seg - 1e-6))
    xs = [-l + e + (L - 2 * e) * k / n for k in range(n + 1)]
    rings = []
    for x in xs:
        rings.append([_emit(b, R, t, P((x, yy, zz)), P(nn), (x / tile + uvo[0], s[j] / tile + uvo[1]), cc, colfn)
                      for j, (yy, zz, nn) in enumerate(sec)])
    F = b.F
    for k in range(n):
        A, B = rings[k], rings[k + 1]
        for j in range(8): F.append((A[j], A[j + 1], B[j + 1], B[j]))
    m = [0, 1, 1, 2, 2, 3, 3, 0, 0]
    caps = [(h - e, -d + e), (h - e, d - e), (-h + e, d - e), (-h + e, -d + e)]
    for side in ((1, -1) if caps else ()):
        x = side * l
        ring = rings[-1] if side > 0 else rings[0]
        q = [_emit(b, R, t, P((x, yy, zz)), P((side, 0, 0)), (zz / tile + uvo[0] * 0.37, yy / tile + uvo[1]), cc, colfn) for yy, zz in caps]
        F.append((q[0], q[1], q[2], q[3]) if side > 0 else (q[3], q[2], q[1], q[0]))
        for j in range(8):
            a, bb, qa, qb = ring[j], ring[j + 1], q[m[j]], q[m[j + 1]]
            if side > 0: F.append((a, bb, qb, qa) if qa != qb else (a, bb, qa))
            else: F.append((qa, qb, bb, a) if qa != qb else (qa, bb, a))

# ------------------------------------------------------------------ simple box (flat, optional faces)
_BOX_FACES = {  # name: (normal, u axis, v axis)
    'px': ((1, 0, 0), (0, 0, -1), (0, 1, 0)), 'nx': ((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
    'py': ((0, 1, 0), (1, 0, 0), (0, 0, -1)), 'ny': ((0, -1, 0), (1, 0, 0), (0, 0, 1)),
    'pz': ((0, 0, 1), (1, 0, 0), (0, 1, 0)), 'nz': ((0, 0, -1), (-1, 0, 0), (0, 1, 0)),
}
def sbox(mat, size, pos, rot=None, c='#ffffff', tile=1.0, uvo=None, colfn=None, jit=0.0, skip=()):
    b = bucket(mat)
    R, t = xf(pos, rot)
    hs = (size[0] / 2, size[1] / 2, size[2] / 2)
    cc = col(c, jit)
    if uvo is None: uvo = (rnd(0, 5), rnd(0, 5))
    for name, (nrm, ua, va) in _BOX_FACES.items():
        if name in skip: continue
        idx = []
        for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            p = tuple(nrm[i] * hs[i] + ua[i] * su * hs[i] + va[i] * sv * hs[i] for i in range(3))
            uu = sum(p[i] * ua[i] for i in range(3)); vv = sum(p[i] * va[i] for i in range(3))
            idx.append(_emit(b, R, t, p, nrm, (uu / tile + uvo[0], vv / tile + uvo[1]), cc, colfn))
        b.F.append(tuple(idx))

# ------------------------------------------------------------------ generic convex hexahedron / polygon
def _newell(pts):
    n = Vector((0, 0, 0))
    for i in range(len(pts)):
        a, c2 = pts[i], pts[(i + 1) % len(pts)]
        n.x += (a.y - c2.y) * (a.z + c2.z); n.y += (a.z - c2.z) * (a.x + c2.x); n.z += (a.x - c2.x) * (a.y + c2.y)
    return n.normalized() if n.length > 1e-12 else Vector((0, 1, 0))
def _proj_uv(p, n, tile, uvo):
    ax = max(range(3), key=lambda i: abs(n[i]))
    if ax == 0: u, v = p.z * (-1 if n.x > 0 else 1), p.y
    elif ax == 1: u, v = p.x, -p.z * (1 if n.y > 0 else -1)
    else: u, v = p.x * (1 if n.z > 0 else -1), p.y
    return (u / tile + uvo[0], v / tile + uvo[1])
def hexa(mat, corners, c='#ffffff', tile=1.0, uvo=None, colfn=None, jit=0.0, skip=()):
    """corners: 8 world points, bottom ring (4) then top ring (4), same winding. Flat shaded."""
    b = bucket(mat)
    V = [Vector(p) for p in corners]
    cen = sum(V, Vector((0, 0, 0))) / 8
    cc = col(c, jit)
    if uvo is None: uvo = (rnd(0, 5), rnd(0, 5))
    faces = {'b': (0, 1, 2, 3), 't': (4, 5, 6, 7), 's0': (0, 1, 5, 4), 's1': (1, 2, 6, 5), 's2': (2, 3, 7, 6), 's3': (3, 0, 4, 7)}
    I = Matrix.Identity(3); Z = Vector((0, 0, 0))
    for name, f in faces.items():
        if name in skip: continue
        pts = [V[i] for i in f]
        n = _newell(pts)
        fc = sum(pts, Vector((0, 0, 0))) / 4
        if n.dot(fc - cen) < 0: pts = pts[::-1]; n = -n
        b.F.append(tuple(_emit(b, I, Z, p, n, _proj_uv(p, n, tile, uvo), cc, colfn) for p in pts))
def poly(mat, pts, pos=(0, 0, 0), rot=None, c='#ffffff', tile=1.0, uvo=(0, 0), uvs=None, colfn=None, double=False, normal=None):
    """flat polygon (fan-triangulated by Blender as an n-gon). uvs: explicit per-point UVs"""
    b = bucket(mat)
    R, t = xf(pos, rot)
    W = [R @ Vector(p) + t for p in pts]
    n = Vector(normal) if normal else _newell(W)
    cc = col(c)
    I = Matrix.Identity(3); Z = Vector((0, 0, 0))
    uv = uvs or [_proj_uv(p, n, tile, uvo) for p in W]
    b.F.append(tuple(_emit(b, I, Z, p, n, uv[i], cc, colfn) for i, p in enumerate(W)))
    if double: b.F.append(tuple(_emit(b, I, Z, p, -n, uv[i], cc, colfn) for i, p in reversed(list(enumerate(W)))))

# ------------------------------------------------------------------ lathe (around local +y)
def lathe(mat, prof, pos, rot=None, c='#ffffff', seg=16, tile=0.5, smooth=True, caps=(True, True), colfn=None, jit=0.0, uvo=None):
    """prof: [(r, y), ...] bottom to top; a third element 's' marks a hard corner."""
    b = bucket(mat)
    R, t = xf(pos, rot)
    cc = col(c, jit)
    if uvo is None: uvo = (rnd(0, 5), rnd(0, 5))
    pts = [(p[0], p[1]) for p in prof]
    sharp = [len(p) > 2 and p[2] == 's' for p in prof]
    segn = []
    for i in range(len(pts) - 1):
        dr, dy = pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]
        L = math.hypot(dr, dy) or 1e-9
        segn.append((dy / L, -dr / L))
    def pn(i, si):  # normal at point i used by segment si
        if not smooth or sharp[i]: return segn[si]
        a = segn[i - 1] if i > 0 else segn[0]; bb = segn[i] if i < len(segn) else segn[-1]
        x, y = a[0] + bb[0], a[1] + bb[1]; L = math.hypot(x, y) or 1e-9
        return (x / L, y / L)
    arc = [0.0]
    for i in range(1, len(pts)): arc.append(arc[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    rmax = max(p[0] for p in pts) or 0.01
    circ = 2 * math.pi * rmax
    cache = {}
    def ring(i, si):
        """vertex ring at profile point i for segment si; smooth points share one ring"""
        key = (i, si) if (sharp[i] or not smooth) else (i, -1)
        if key in cache: return cache[key]
        r, y = pts[i]; nr, ny = pn(i, si)
        row = []
        for k in range(seg + 1):
            a = 2 * math.pi * k / seg
            ca, sa = math.cos(a), math.sin(a)
            row.append(_emit(b, R, t, (r * ca, y, r * sa), (nr * ca, ny, nr * sa), (k / seg * circ / tile + uvo[0], arc[i] / tile + uvo[1]), cc, colfn))
        cache[key] = row
        return row
    for si in range(len(pts) - 1):
        A, B = ring(si, si), ring(si + 1, si)
        for k in range(seg):
            if pts[si][0] < 1e-6: b.F.append((A[k], B[k], B[k + 1]))
            elif pts[si + 1][0] < 1e-6: b.F.append((A[k], B[k], A[k + 1]))
            else: b.F.append((A[k], B[k], B[k + 1], A[k + 1]))
    for end, on in ((0, caps[0]), (len(pts) - 1, caps[1])):
        r, y = pts[end]
        if not on or r < 1e-6: continue
        ny = -1 if end == 0 else 1
        ring = [_emit(b, R, t, (r * math.cos(2 * math.pi * k / seg), y, r * math.sin(2 * math.pi * k / seg)), (0, ny, 0),
                      (r * math.cos(2 * math.pi * k / seg) / tile + uvo[0], r * math.sin(2 * math.pi * k / seg) / tile + uvo[1]), cc, colfn) for k in range(seg)]
        b.F.append(tuple(ring) if end == 0 else tuple(reversed(ring)))

def cyl(mat, r, h, pos, rot=None, c='#ffffff', seg=12, bev=0.0, r1=None, tile=0.5, colfn=None, jit=0.0, caps=(True, True), uvo=None):
    """cylinder centred on pos along local y; r1 = top radius; bev = chamfer at both ends"""
    r1 = r if r1 is None else r1
    y0, y1 = -h / 2, h / 2
    if bev > 0:
        prof = [(r - bev, y0, 's'), (r, y0 + bev), (r1, y1 - bev), (r1 - bev, y1, 's')]
    else:
        prof = [(r, y0, 's'), (r1, y1, 's')]
    lathe(mat, prof, pos, rot, c, seg, tile, True, caps, colfn, jit, uvo)

def rod(mat, a, b2, r, c='#ffffff', seg=8, colfn=None, caps=(True, True)):
    """cylinder between two world points"""
    A, B = Vector(a), Vector(b2)
    d = B - A; L = d.length
    if L < 1e-6: return
    q = Vector((0, 1, 0)).rotation_difference(d.normalized())
    e = q.to_euler('XYZ')
    cyl(mat, r, L, tuple((A + B) / 2), (e.x, e.y, e.z), c, seg, colfn=colfn, caps=caps)

# ------------------------------------------------------------------ parametric surfaces
def surface(mat, fn, nu, nv, pos, rot=None, c='#ffffff', closed_u=True, tile=0.4, uscale=1.0, vscale=1.0, colfn=None, jit=0.0, uvo=None):
    """fn(u, v) -> local point, u, v in [0, 1]; normals from finite differences, outward when
    d/du x d/dv points out (v runs 'up', u runs clockwise seen from above)"""
    b = bucket(mat)
    R, t = xf(pos, rot)
    cc = col(c, jit)
    if uvo is None: uvo = (rnd(0, 5), rnd(0, 5))
    G = [[Vector(fn(k / nu, i / nv)) for k in range(nu + 1)] for i in range(nv + 1)]
    idx = []
    for i in range(nv + 1):
        row = []
        for k in range(nu + 1):
            kp, km = k + 1, k - 1
            if closed_u: kp, km = (kp if kp <= nu else 1), (km if km >= 0 else nu - 1)
            else: kp, km = min(kp, nu), max(km, 0)
            du = G[i][kp] - G[i][km]
            ip, im = min(i + 1, nv), max(i - 1, 0)
            dv = G[ip][k] - G[im][k]
            n = du.cross(dv)
            if n.length < 1e-10:  # pole: use the neighbouring row
                j = 1 if i == 0 else nv - 1
                n = Vector((0, 0, 0))
                for kk in range(nu):
                    a1 = G[j][kk] - G[i][k]; a2 = G[j][kk + 1] - G[i][k]
                    n += a2.cross(a1) if i == 0 else a1.cross(a2)
            n = n.normalized() if n.length > 1e-12 else Vector((0, 1, 0))
            row.append(_emit(b, R, t, tuple(G[i][k]), tuple(n), (k / nu * uscale / tile + uvo[0], i / nv * vscale / tile + uvo[1]), cc, colfn))
        idx.append(row)
    for i in range(nv):
        for k in range(nu):
            b.F.append((idx[i][k], idx[i][k + 1], idx[i + 1][k + 1], idx[i + 1][k]))

def _sp(x, e): return math.copysign(abs(x) ** e, x)
def blob(mat, size, pos, rot=None, c='#ffffff', e1=0.35, e2=0.35, nu=16, nv=10, deform=None, tile=0.35, colfn=None, jit=0.0):
    """superellipsoid with half sizes `size` (cushions, mattresses, fruit with e=1)"""
    sx, sy, sz = size
    if max(size) < 0.07: nu, nv = min(nu, 5), min(nv, 3)       # leaves, fruit, flowers
    elif max(size) < 0.2: nu, nv = min(nu, 14), min(nv, 9)
    def fn(u, v):
        th = -math.pi / 2 + math.pi * v; ph = math.pi - 2 * math.pi * u
        ct, st, cp, sp = math.cos(th), math.sin(th), math.cos(ph), math.sin(ph)
        p = (sx * _sp(ct, e1) * _sp(cp, e2), sy * _sp(st, e1), sz * _sp(ct, e1) * _sp(sp, e2))
        return deform(*p) if deform else p
    surface(mat, fn, nu, nv, pos, rot, c, True, tile, 2 * (sx + sz) * 2, 2 * sy + sx + sz, colfn, jit)

def torus(mat, R0, r, pos, rot=None, c='#ffffff', nu=24, nv=8, tile=0.3, colfn=None):
    """ring in the local xz plane (axis = local y)"""
    def fn(u, v):
        a = -2 * math.pi * u; bb = 2 * math.pi * v
        rr = R0 + r * math.cos(bb)
        return (rr * math.cos(a), r * math.sin(bb), rr * math.sin(a))
    surface(mat, fn, nu, nv, pos, rot, c, True, tile, 2 * math.pi * R0, 2 * math.pi * r, colfn)

# ------------------------------------------------------------------ stats
def stats():
    out = {}
    for (g, m), b in BUCKETS.items():
        out.setdefault(g, 0); out[g] += b.tris()
    return out

# ------------------------------------------------------------------ subdivided flat patches
def patch(mat, p00, p10, p11, p01, nu=1, nv=1, c='#ffffff', tile=1.2, uvo=None, colfn=None, jit=0.0, face=None):
    """bilinear quad p00 -> p10 (u, grain direction) / p00 -> p01 (v); flat normal.
    face: desired normal direction, the quad is mirrored if it would point the other way."""
    b = bucket(mat)
    P00, P10, P11, P01 = Vector(p00), Vector(p10), Vector(p11), Vector(p01)
    n = (P10 - P00).cross(P01 - P00)
    if face is not None and n.dot(Vector(face)) < 0:
        P00, P10, P11, P01 = P10, P00, P01, P11; n = -n
    n = n.normalized() if n.length > 1e-12 else Vector((0, 1, 0))
    cc = col(c, jit)
    if uvo is None: uvo = (rnd(0, 5), rnd(0, 5))
    ul = ((P10 - P00).length + (P11 - P01).length) / 2; vl = ((P01 - P00).length + (P11 - P10).length) / 2
    I = Matrix.Identity(3); Z = Vector((0, 0, 0))
    idx = []
    for k in range(nv + 1):
        t = k / nv; row = []
        for i in range(nu + 1):
            s = i / nu
            p = (P00 * (1 - s) + P10 * s) * (1 - t) + (P01 * (1 - s) + P11 * s) * t
            row.append(_emit(b, I, Z, tuple(p), tuple(n), (s * ul / tile + uvo[0], t * vl / tile + uvo[1]), cc, colfn))
        idx.append(row)
    for k in range(nv):
        for i in range(nu):
            b.F.append((idx[k][i], idx[k][i + 1], idx[k + 1][i + 1], idx[k + 1][i]))

# ------------------------------------------------------------------ local frames for furniture
class Frame:
    """place parts in an object's local frame: origin (x, y, z) + yaw about +y (three.js sense)"""
    def __init__(s, x, y, z, yaw=0.0):
        s.o = Vector((x, y, z)); s.yaw = yaw; s.R = Matrix.Rotation(yaw, 3, 'Y')
    def p(s, lx, ly, lz): v = s.R @ Vector((lx, ly, lz)) + s.o; return (v.x, v.y, v.z)
    def r(s, rx=0.0, ry=0.0, rz=0.0):
        e = (s.R @ Euler((rx, ry, rz), 'XYZ').to_matrix()).to_euler('XYZ'); return (e.x, e.y, e.z)

COLL = []      # interior colliders collected while building furniture (local coordinates)
def coll_box(x0, x1, z0, z1, lv, rot=0.0, tag='furn'):
    COLL.append({'t': 'box', 'x': (x0 + x1) / 2, 'z': (z0 + z1) / 2, 'hx': (x1 - x0) / 2, 'hz': (z1 - z0) / 2, 'rot': rot, 'lv': lv, 'tag': tag})
def coll_obox(cx, cz, hx, hz, rot, lv, tag='furn'):
    COLL.append({'t': 'box', 'x': cx, 'z': cz, 'hx': hx, 'hz': hz, 'rot': rot, 'lv': lv, 'tag': tag})
def coll_circle(x, z, r, lv, tag='furn'):
    COLL.append({'t': 'circle', 'x': x, 'z': z, 'r': r, 'lv': lv, 'tag': tag})
