# 鱼竿 Fishing rod — tool frame (Blender, Z-up): grip at origin, rod along +Z, spinning reel hangs towards +Y.
# Objects: RodBase (handle + reel) > Seg1 > Seg2 > Seg3 > Tip(empty); Crank (rotates about X) child of RodBase.
# glTF/three.js frame after export: rod +Y, reel towards -Z (same frame as the old procedural rod).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lib; importlib.reload(lib)
from lib import *
import numpy as np
sc = reset()

SEG_Z0 = 0.11
SEG_L = [0.52, 0.50, 0.48]
SEG_R = [0.0115, 0.0085, 0.0058, 0.0028]
GUIDE_U = (0.4, 0.84)
GUIDE_RG = [(0.0062, 0.0052), (0.0044, 0.0038), (0.0032, 0.0027)]
NODES = [(0.10, 0.31), (0.085, 0.30), (0.09, 0.285)]
REEL_C = V((0, 0.058, -0.005))          # gearbox centre
SPOOL_C = (0.0, 0.060)                  # spool axis (x, y), parallel to the rod
CRANK_O = V((-0.024, 0.058, -0.005))

# ------------------------------------------------------------------ materials
def M_bamboo():
    m, g = newmat('rod_bamboo')
    p = g.coord('Object'); mc = g.sepc(g.attr().outputs['Color'])         # R thread wrap, G node, B gold tipping
    fib = g.noise(g.mapping(p, scale=(1, 1, 0.02)), scale=900, detail=3)
    blot = g.noise(g.mapping(p, scale=(1, 1, 0.25)), scale=40, detail=4)
    c = g.ramp(g.add(g.mul(fib, 0.6), g.mul(blot, 0.4)), [(0.3, '#b3823b'), (0.55, '#c99a50'), (0.8, '#d8b066')])
    c = g.mix(g.mul(mc['Green'], 0.95), c, '#5e3c1a')                            # darker node rings
    burn = g.mr(g.noise(p, scale=12, detail=3), 0.55, 0.75, 0, 0.35)           # flame-tempered mottling
    c = g.mix(burn, c, '#9a6c35')
    thread = g.wave(p, 0.3142 / 0.00045, 'BANDS', 'Z', profile='SIN')
    wrapc = g.mix(g.mul(thread, 0.35), '#6e1d1c', '#3d0e0e')
    c = g.mix(mc['Red'], c, wrapc)
    c = g.mix(mc['Blue'], c, '#c9a347')
    r = g.add(0.32, g.mr(fib, 0.3, 0.7, -0.04, 0.05)); r = g.mix(mc['Red'], r, 0.42); r = g.mix(mc['Blue'], r, 0.3)
    metal = g.mul(mc['Blue'], 0.9)
    h = g.add(g.mul(fib, 0.3), g.mul(g.mul(thread, mc['Red']), 0.5))
    g.out(c, r, metal, g.bump(h, 0.45, 0.0004))
    return m

def M_cork():
    m, g = newmat('rod_cork')
    p = g.coord('Object')
    pits = g.voronoi(p, scale=420, feature='F1')
    pits2 = g.mr(g.noise(p, scale=160, detail=5), 0.62, 0.72)
    base = g.ramp(g.noise(p, scale=55, detail=4), [(0.3, '#b98f5d'), (0.7, '#d2ad78')])
    seam = g.mr(g.math('ABSOLUTE', g.math('SINE', g.mul(g.sep(p)['Z'], math.pi / 0.0127))), 0.0, 0.07, 1, 0)
    c = g.mix(g.mr(pits, 0.0, 0.18, 0.75, 0), base, '#6b4a2b')
    c = g.mix(pits2, c, '#7d5733')
    c = g.mix(g.mul(seam, 0.7), c, '#8a6741')
    grime = g.mr(g.noise(p, scale=8, detail=3), 0.45, 0.7, 0, 0.25)
    c = g.mix(grime, c, '#7a5c3f')
    h = g.sub(1.0, g.add(g.mul(g.mr(pits, 0.0, 0.18, 1, 0), 0.6), g.add(g.mul(pits2, 0.5), g.mul(seam, 0.4))))
    g.out(c, 0.78, 0.0, g.bump(h, 0.7, 0.0007))
    return m

def M_nickel():
    m, g = newmat('rod_nickel')
    p = g.coord('Object'); mc = g.sepc(g.attr().outputs['Color'])         # R knurl / dark tarnish
    n = g.noise(p, scale=80, detail=4)
    c = g.ramp(n, [(0.3, '#a7aaa8'), (0.7, '#c9cbc6')])
    tarn = g.mr(g.add(g.mul(g.noise(p, scale=30, detail=4), 0.7), g.mul(mc['Red'], 0.5)), 0.5, 0.8, 0, 0.7)
    c = g.mix(tarn, c, '#6d6a5e')
    knurl = g.mul(mc['Green'], g.mr(g.math('SINE', g.mul(g.math('ARCTAN2', g.sep(p)['Y'], g.sep(p)['X']), 60.0)), -0.2, 0.2))
    c = g.mix(g.mul(knurl, 0.5), c, '#4f504c')
    r = g.add(0.24, g.mul(tarn, 0.3))
    g.out(c, r, 1.0, g.bump(g.add(g.mul(knurl, 0.8), g.mul(g.noise(p, scale=500, detail=2), 0.1)), 0.5, 0.0004))
    return m

def M_reel():
    m, g = newmat('rod_reel')
    p = g.coord('Object'); mc = g.sepc(g.attr().outputs['Color'])         # R edge wear, G black parts
    n = g.noise(p, scale=60, detail=4)
    flake = g.noise(p, scale=1400, detail=1)
    c = g.ramp(g.add(g.mul(n, 0.7), g.mul(flake, 0.3)), [(0.3, '#2f3c38'), (0.7, '#41524c')])
    edge = g.add(g.mr(g.geo('Pointiness'), 0.52, 0.58), g.mul(mc['Red'], 0.5))
    wear = g.mr(g.add(g.mul(edge, 0.6), g.noise(p, scale=90, detail=5)), 0.85, 0.92)
    c = g.mix(wear, c, '#9b9e9a')
    c = g.mix(mc['Green'], c, '#151615')
    r = g.add(0.36, g.mul(flake, 0.12)); r = g.mix(wear, r, 0.3); r = g.mix(mc['Green'], r, 0.45)
    metal = g.mix(wear, 0.35, 1.0)
    g.out(c, r, metal, g.bump(g.add(g.mul(flake, 0.2), g.mul(wear, -0.5)), 0.3, 0.0004))
    return m

def M_gold():
    m, g = newmat('rod_gold')
    p = g.coord('Object')
    ang = g.math('ARCTAN2', g.math('SUBTRACT', g.sep(p)['Y'], SPOOL_C[1]), g.math('SUBTRACT', g.sep(p)['X'], SPOOL_C[0]))
    brushed = g.noise(g.comb(g.mul(g.sep(p)['Z'], 1.0), g.mul(ang, 0.002), 0.0), scale=900, detail=2)
    c = g.ramp(brushed, [(0.3, '#b48a35'), (0.7, '#d4ab52')])
    g.out(c, g.add(0.22, g.mul(brushed, 0.1)), 1.0, g.bump(brushed, 0.2, 0.0003))
    return m

def M_line():
    m, g = newmat('rod_line')
    p = g.coord('Object')
    wind = g.wave(p, 0.3142 / 0.00042, 'BANDS', 'Z', dist=1.5, detail=2, dscale=3)
    c = g.mix(g.mul(wind, 0.4), '#c5d6b9', '#8fa58a')
    g.out(c, 0.28, 0.0, g.bump(wind, 0.5, 0.0002))
    return m

def M_ivory():
    m, g = newmat('rod_ivory')
    p = g.coord('Object')
    n = g.noise(p, scale=70, detail=3)
    c = g.ramp(n, [(0.3, '#d8cfbd'), (0.7, '#ece5d6')])
    grime = g.mr(g.noise(p, scale=200, detail=4), 0.58, 0.72, 0, 0.5)
    c = g.mix(grime, c, '#a59a85')
    g.out(c, 0.4, 0.0, g.bump(n, 0.1, 0.0003))
    return m

def M_dark():
    m, g = newmat('rod_dark')                                                    # butt cap rubber + walnut reel-seat insert
    p = g.coord('Object'); mc = g.sepc(g.attr().outputs['Color'])          # R walnut
    rub = g.noise(p, scale=300, detail=3)
    c = g.mix(g.mul(rub, 0.3), '#2a2623', '#3a3430')
    wal = g.wave(g.mapping(p, rot=(0.02, 0.01, 0)), 0.3142 / 0.0016, 'BANDS', 'Z', dist=3, detail=3, dscale=1.5)
    walc = g.ramp(wal, [(0.2, '#3d2414'), (0.6, '#5a3820'), (1.0, '#6e4628')])
    c = g.mix(mc['Red'], c, walc)
    r = g.mix(mc['Red'], g.add(0.75, g.mul(rub, 0.1)), 0.32)
    g.out(c, r, 0.0, g.bump(g.mix(mc['Red'], rub, wal), 0.3, 0.0004))
    return m

bamboo, cork, nickel, reelm, gold, linem, ivory, dark = M_bamboo(), M_cork(), M_nickel(), M_reel(), M_gold(), M_line(), M_ivory(), M_dark()
MATS = [bamboo, cork, nickel, reelm, gold, linem, ivory, dark]

parts = {'base': [], 'seg0': [], 'seg1': [], 'seg2': [], 'crank': []}
def add(group, o, mask=None):
    if mask is not None: set_mask(o, mask)
    parts[group].append(o); return o
def ring_prof(r_in, r_out, z0, z1, bev=0.0004):
    """short tube (fitting) profile bottom->top, outer side then back down the inside"""
    return [(r_in, z0), (r_out - bev, z0), (r_out, z0 + bev), (r_out, z1 - bev), (r_out - bev, z1), (r_in, z1)]

# ------------------------------------------------------------------ handle: butt cap, cork, reel seat
cap = lathe('buttcap', [(0, -0.3025), (0.0085, -0.3022), (0.0145, -0.3008), (0.0178, -0.2985), (0.0193, -0.2955), (0.0197, -0.292),
                        (0.0197, -0.2705), (0.019, -0.2695), (0.0186, -0.268)], seg=24, mat=dark,
            uv=[(0, 4, 'planar'), (4, 8, 'cyl')])
add('base', cap, lambda w, l: (0.0, 0.0, 0.0))
add('base', lathe('chk0', ring_prof(0.0182, 0.0196, -0.2702, -0.2668), seg=24, mat=nickel, uv=True), lambda w, l: (0.2, 0.0, 0.0))
cz = [-0.2675 + k * (0.234 / 14) for k in range(15)]
def cork_r(z, za, zb, ra, rb, swell):
    t = (z - za) / (zb - za); return ra + (rb - ra) * t + swell * math.sin(math.pi * t)
rear = lathe('cork_rear', [(cork_r(z, -0.2675, -0.0335, 0.0188, 0.0172, 0.0012), z) for z in cz], seg=20, mat=cork,
             uv=[(0, 7, 'cyl'), (7, 14, 'cyl')])
add('base', rear)
# reel seat: walnut insert between two nickel hoods, knurled lock ring
add('base', lathe('seat', [(0.0142, -0.034), (0.0145, -0.033), (0.0145, 0.033), (0.0142, 0.034)], seg=24, mat=dark, uv=True), lambda w, l: (1.0, 0.0, 0.0))
add('base', lathe('hood_r', ring_prof(0.0140, 0.0162, -0.0345, -0.0185, 0.0007), seg=24, mat=nickel, uv=True), lambda w, l: (0.15, 0.0, 0.0))
add('base', lathe('hood_f', ring_prof(0.0140, 0.0162, 0.0165, 0.025, 0.0006), seg=24, mat=nickel, uv=True), lambda w, l: (0.15, 0.0, 0.0))
add('base', lathe('lockring', ring_prof(0.0140, 0.0172, 0.025, 0.0345, 0.0008), seg=32, mat=nickel, uv=True), lambda w, l: (0.4, 1.0, 0.0))
fz = [0.0335 + k * (0.074 / 6) for k in range(7)]
fore = lathe('cork_fore', [(cork_r(z, 0.0335, 0.1075, 0.0166, 0.0134, 0.0004), z) for z in fz], seg=24, mat=cork, uv=True)
add('base', fore)
add('base', lathe('chk1', ring_prof(0.0112, 0.0132, 0.1072, 0.1112), seg=24, mat=nickel, uv=True), lambda w, l: (0.2, 0.0, 0.0))

# ------------------------------------------------------------------ blank segments (lathe per segment, world coordinates)
seg_base = [SEG_Z0, SEG_Z0 + SEG_L[0], SEG_Z0 + SEG_L[0] + SEG_L[1]]
def blank(i):
    L, r0, r1, zb = SEG_L[i], SEG_R[i], SEG_R[i + 1], seg_base[i]
    rad = lambda u: r0 + (r1 - r0) * u / L
    feats = []                                                  # (u0, u1, kind)
    for gu in GUIDE_U:
        zc = gu * L
        feats += [(zc - 0.0145, zc + 0.0145, 'wrap')]
    if i < 2: feats += [(L - 0.062, L - 0.044, 'wrap')]
    else: feats += [(L - 0.016, L - 0.004, 'wrap')]
    if i == 0: feats += [(0.004, 0.02, 'wrap')]                 # hook-keeper / winding check wrap
    us = {0.0, L}
    for a, b, k in feats: us |= {a - 0.0004, a, a + 0.0009, b - 0.0009, b, b + 0.0004}
    for nu in NODES[i]: us |= {nu - 0.006, nu - 0.0018, nu, nu + 0.0018, nu + 0.006}
    k = 0.0
    while k < L: us.add(k); k += 0.12
    us = sorted(u for u in us if 0 <= u <= L)
    def r_at(u):
        r = rad(u)
        for nu in NODES[i]: r += r * 0.045 * math.exp(-((u - nu) / 0.0016) ** 2) + r * 0.012 * math.exp(-((u - nu) / 0.005) ** 2)
        for a, b, kk in feats:
            if a <= u <= b: r += 0.00028
        return r
    prof = [(0, -0.0)] + [(r_at(u), u) for u in us] + [(0, L)]
    rows = len(prof) - 1
    cuts = [0] + [j for j in range(1, rows) if prof[j][1] >= 0 and any(abs(prof[j][1] - c) < 1e-9 for c in (L * 0.34, L * 0.67))] + [rows]
    if len(cuts) < 4:
        cuts = [0, rows // 3, 2 * rows // 3, rows]
    o = lathe(f'blank{i}', prof, seg=(12, 10, 8)[i], mat=bamboo, uv=[(cuts[j], cuts[j + 1], 'cyl') for j in range(len(cuts) - 1)])
    o.location = (0, 0, zb); bake_transform(o)
    def mask(w, l, feats=feats, i=i):
        u = w.z - zb
        wr = 1.0 if any(a - 0.0002 <= u <= b + 0.0002 for a, b, kk in feats) else 0.0
        tip = 1.0 if any(abs(u - a) < 0.0003 or abs(u - b) < 0.0003 for a, b, kk in feats) else 0.0
        nd = max([math.exp(-((u - nu) / 0.0022) ** 2) for nu in NODES[i]] + [0.0])
        return (wr * (1 - tip), nd, tip * wr)
    add(f'seg{i}', o, mask)
    # guides: bent wire frame + ring standing off towards +Y
    for gi, gu in enumerate(GUIDE_U):
        zc = zb + gu * L; r = rad(gu * L) + 0.00028; rg = GUIDE_RG[i][gi]; tw = 0.0008 if i == 0 else 0.0006
        yc = r + 0.0032 + rg
        wire = [V((0, r * 0.98, zc - 0.012)), V((0, r + 0.0006, zc - 0.007)), V((0, yc - rg - 0.0012, zc - 0.0022)),
                V((0, yc - rg - 0.0002, zc)), V((0, yc - rg - 0.0012, zc + 0.0022)), V((0, r + 0.0006, zc + 0.007)), V((0, r * 0.98, zc + 0.012))]
        add(f'seg{i}', sweep(f'gwire{i}{gi}', catmull(wire, 2), radius=tw, seg=5, mat=nickel, uv=True), lambda w, l: (0.3, 0.0, 0.0))
        tor = [(rg + 0.0009 * math.cos(a), zc + 0.0009 * math.sin(a)) for a in np.linspace(-math.pi / 2, 1.5 * math.pi, 6, endpoint=False)]
        add(f'seg{i}', lathe(f'gring{i}{gi}', tor, seg=10, mat=nickel, closed=True, center=(0, yc), uv=True), lambda w, l: (0.1, 0.0, 0.0))
    if i < 2:   # female ferrule on top of this segment
        add(f'seg{i}', lathe(f'ferrule{i}', [(r1 + 0.0002, zb + L - 0.046), (r1 + 0.0009, zb + L - 0.0455), (r1 + 0.0012, zb + L - 0.043),
                                              (r1 + 0.0012, zb + L - 0.002), (r1 + 0.0008, zb + L), (r1 * 0.6, zb + L)], seg=16, mat=nickel, uv=True),
            lambda w, l: (0.3, 0.0, 0.0))
    else:       # tip-top
        zt = zb + L
        add(f'seg{i}', lathe('tiptop_tube', [(r1 + 0.0002, zt - 0.012), (r1 + 0.0006, zt - 0.0115), (r1 + 0.0006, zt - 0.001), (0.0, zt)], seg=10, mat=nickel, uv=True),
            lambda w, l: (0.2, 0.0, 0.0))
        rg = 0.0024; tor = [(rg + 0.0008 * math.cos(a), zt + 0.0014 + 0.0008 * math.sin(a)) for a in np.linspace(-math.pi / 2, 1.5 * math.pi, 8, endpoint=False)]
        add(f'seg{i}', lathe('tiptop_ring', tor, seg=12, mat=nickel, closed=True, center=(0, 0.0012), uv=True), lambda w, l: (0.1, 0.0, 0.0))
for i in range(3): blank(i)

# ------------------------------------------------------------------ spinning reel (part of RodBase)
add('base', sweep('reelfoot', [V((0, 0.0153, z)) for z in np.linspace(-0.026, 0.026, 7)],
                  section=lambda t: superellipse(0.0042, 0.0011, p=4, n=12), mat=reelm, up=V((1, 0, 0)), uv=True),
    lambda w, l: (0.6, 0.0, 0.0))
stem = [V((0, 0.0158, 0.0)), V((0, 0.024, -0.002)), V((0, 0.033, -0.004)), V((0, 0.041, -0.005))]
add('base', sweep('stem', catmull(stem, 4), section=lambda t: superellipse(0.0036 + 0.0012 * t, 0.0085 - 0.0015 * t, p=3, n=16),
                  mat=reelm, up=V((1, 0, 0)), uv=True), lambda w, l: (0.3, 0.0, 0.0))
# gearbox: squarish ellipsoid
def gearbox(u, v):
    a = u * math.tau; b = (v - 0.5) * math.pi
    ca, sa, cb, sb = math.cos(a), math.sin(a), math.cos(b), math.sin(b)
    e = 2 / 2.6
    sg = lambda x: math.copysign(abs(x) ** e, x)
    return (REEL_C.x + 0.0185 * sg(ca) * sg(cb), REEL_C.y + 0.0195 * sg(sa) * sg(cb), REEL_C.z + 0.026 * sg(sb))
gb = grid('gearbox', 24, 12, gearbox, reelm, closed_u=True)
weld(gb); auto_uv(gb, 55)
add('base', gb, lambda w, l: (0.2, 0.0, 0.0))
# side cap on +X (bearing cover) and crank shaft boss on -X
add('base', place(lathe('boss_r', [(0.0, 0.0034), (0.0035, 0.0032), (0.0065, 0.0022), (0.0082, 0.0008), (0.0088, -0.002)], seg=20, mat=nickel, uv=[(0, 4, 'planar')]),
                  (REEL_C.x + 0.0178, REEL_C.y, REEL_C.z), rot=(0, math.pi / 2, 0)), lambda w, l: (0.3, 0.0, 0.0))
add('base', place(lathe('boss_l', [(0.0, 0.0028), (0.0040, 0.0026), (0.0058, 0.0014), (0.0064, -0.002)], seg=20, mat=reelm, uv=[(0, 3, 'planar')]),
                  (REEL_C.x - 0.0178, REEL_C.y, REEL_C.z), rot=(0, -math.pi / 2, 0)), lambda w, l: (0.5, 1.0, 0.0))
for o in parts['base'][-2:]: bake_transform(o)
# rotor cup + spool + drag knob, axis parallel to the rod
add('base', lathe('rotor', [(0.0, 0.010), (0.009, 0.0102), (0.0165, 0.0115), (0.0205, 0.0135), (0.0228, 0.0165), (0.0238, 0.0205),
                            (0.0236, 0.0235), (0.0226, 0.0245), (0.0212, 0.0235)], seg=24, mat=reelm, center=SPOOL_C,
                  uv=[(0, 3, 'planar'), (3, 8, 'cyl')]), lambda w, l: (0.4, 0.0, 0.0))
add('base', lathe('spool', [(0.0205, 0.0215), (0.0232, 0.0222), (0.0240, 0.0240), (0.0240, 0.0275), (0.0218, 0.0285), (0.0175, 0.0292),
                            (0.0172, 0.0478), (0.0205, 0.0484), (0.0226, 0.0492), (0.0228, 0.0512), (0.0205, 0.0522), (0.0110, 0.0526)],
                  seg=24, mat=gold, center=SPOOL_C, uv=[(0, 6, 'cyl'), (6, 11, 'cyl')]))
add('base', lathe('line', [(0.0172, 0.0296), (0.0196, 0.0302), (0.0201, 0.0315), (0.0203, 0.0385), (0.0204, 0.0455), (0.0200, 0.047), (0.0172, 0.0476)],
                  seg=24, mat=linem, center=SPOOL_C, uv=True))
add('base', lathe('drag', [(0.0110, 0.0522), (0.0102, 0.0545), (0.0098, 0.0598), (0.0088, 0.0612), (0.0050, 0.0618), (0.0, 0.0619)],
                  seg=24, mat=reelm, center=SPOOL_C, uv=[(0, 3, 'cyl'), (3, 5, 'planar')]), lambda w, l: (0.3, 1.0, 0.0))
# bail: wire hoop between the two rotor arms (+X / -X), arcing round the outer (+Y) side of the spool; line roller at +X
def bail_pt(a): return V((SPOOL_C[0] + 0.0262 * math.cos(a), SPOOL_C[1] + 0.0262 * math.sin(a), 0.0238 + 0.0105 * math.sin(a)))
add('base', sweep('bail', [bail_pt(a) for a in np.linspace(0, math.pi, 17)], radius=0.0011, seg=6, mat=nickel, uv=True), lambda w, l: (0.2, 0.0, 0.0))
for side, a in (('r', 0.0), ('l', math.pi)):
    pa = bail_pt(a); d = V((math.cos(a), math.sin(a), 0))
    arm = [V((SPOOL_C[0], SPOOL_C[1], 0)) + d * 0.0205 + V((0, 0, 0.0125)), V((SPOOL_C[0], SPOOL_C[1], 0)) + d * 0.0248 + V((0, 0, 0.0185)), pa]
    add('base', sweep(f'rotorarm_{side}', catmull(arm, 3), section=lambda t: superellipse(0.0021, 0.0036 - 0.001 * t, p=3, n=10), mat=reelm,
                      up=V((0, 0, 1)), uv=True), lambda w, l: (0.5, 0.0, 0.0))
roller = lathe('roller', [(0.0, -0.0032), (0.0021, -0.003), (0.0024, -0.0018), (0.0024, 0.0018), (0.0021, 0.003), (0.0, 0.0032)], seg=10, mat=nickel, uv=True)
place(roller, tuple(bail_pt(0.0) + V((0, 0.0012, 0))), rot=(math.pi / 2, 0, 0))
bake_transform(roller); add('base', roller, lambda w, l: (0.3, 0.0, 0.0))

# ------------------------------------------------------------------ crank (own object, pivot = CRANK_O, rotates about X)
CK = CRANK_O
add('crank', place(lathe('ck_hub', [(0.0, 0.0), (0.0042, 0.0), (0.0044, -0.0015), (0.0044, -0.0075), (0.0035, -0.0085), (0.0, -0.0086)], seg=16, mat=reelm,
                         uv=[(0, 1, 'planar'), (1, 4, 'cyl'), (4, 5, 'planar')]), (CK.x + 0.004, CK.y, CK.z), rot=(0, math.pi / 2, 0)),
    lambda w, l: (0.3, 1.0, 0.0))
bake_transform(parts['crank'][-1])
armp = [V((CK.x - 0.0055, CK.y, CK.z)), V((CK.x - 0.0075, CK.y, CK.z + 0.015)), V((CK.x - 0.0088, CK.y, CK.z + 0.032)), V((CK.x - 0.0092, CK.y, CK.z + 0.046))]
add('crank', sweep('ck_arm', catmull(armp, 4), section=lambda t: superellipse(0.0016, 0.0042 - 0.0016 * t, p=3, n=12), mat=reelm,
                   up=V((1, 0, 0)), uv=True), lambda w, l: (0.5, 1.0, 0.0))
add('crank', place(lathe('ck_pin', [(0.0, 0.0), (0.0018, 0.0), (0.0018, 0.022), (0.0, 0.022)], seg=8, mat=nickel, uv=True),
                   (CK.x - 0.0092, CK.y, CK.z + 0.046), rot=(0, -math.pi / 2, 0)), lambda w, l: (0.2, 0.0, 0.0))
bake_transform(parts['crank'][-1])
kp = [(0.0, 0.0), (0.0042, 0.0003), (0.0060, 0.0015), (0.0068, 0.0040), (0.0070, 0.0090), (0.0068, 0.0145), (0.0060, 0.0172), (0.0042, 0.0183), (0.0, 0.0186)]
add('crank', place(lathe('ck_knob', [(r, z) for r, z in kp], seg=18, mat=ivory, uv=[(0, 2, 'planar'), (2, 6, 'cyl'), (6, 8, 'planar')]),
                   (CK.x - 0.0112, CK.y, CK.z + 0.046), rot=(0, -math.pi / 2, 0)))
bake_transform(parts['crank'][-1])

# ------------------------------------------------------------------ join everything for one UV atlas + bake, then split back into the hierarchy
allp = [o for grp in parts.values() for o in grp]
for o in allp:
    if not o.data.uv_layers: auto_uv(o)
gid = {}
for gname, grp in parts.items():
    for o in grp:
        a = o.data.attributes.new('part', 'INT', 'FACE'); a.data.foreach_set('value', [list(parts).index(gname)] * len(o.data.polygons))
rod = join(allp, 'RodAll')
smooth_angle(rod, 48)
print('tris', tris(rod))
pack_uv(rod, 0.003)
res = bake([rod], {'rod': (1024, MATS)}, ao_dist=0.012, ao_k=0.5)
mat = finish_group('rod', res['rod'])
assign(rod, [mat] * len(rod.material_slots))
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/rod_all.blend')

def split(src, idx, name):
    select([src]); bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(src.data); lay = bm.faces.layers.int.get('part')
    for f in bm.faces: f.select_set(False)
    for f in bm.faces:
        if f[lay] == idx: f.select_set(True)
    bmesh.update_edit_mesh(src.data)
    bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    new = [o for o in bpy.context.selected_objects if o is not src][0]; new.name = name; new.data.name = name
    return new
names = {1: 'Seg1', 2: 'Seg2', 3: 'Seg3', 4: 'Crank'}
objs = {}
for idx, nm in names.items(): objs[nm] = split(rod, idx, nm)
rod.name = 'RodBase'; rod.data.name = 'RodBase'; objs['RodBase'] = rod
for o in objs.values():
    if 'part' in o.data.attributes: o.data.attributes.remove(o.data.attributes['part'])
def set_origin(o, pivot):
    o.data.transform(Matrix.Translation(-V(pivot))); o.location = V(pivot)
set_origin(objs['Seg1'], (0, 0, seg_base[0])); set_origin(objs['Seg2'], (0, 0, seg_base[1])); set_origin(objs['Seg3'], (0, 0, seg_base[2]))
set_origin(objs['Crank'], CRANK_O)
def parent(child, par, local):
    child.parent = par; child.matrix_parent_inverse = Matrix.Identity(4); child.location = V(local)
parent(objs['Seg1'], objs['RodBase'], (0, 0, SEG_Z0))
parent(objs['Seg2'], objs['Seg1'], (0, 0, SEG_L[0]))
parent(objs['Seg3'], objs['Seg2'], (0, 0, SEG_L[1]))
parent(objs['Crank'], objs['RodBase'], CRANK_O)
tip = bpy.data.objects.new('Tip', None); link(tip); parent(tip, objs['Seg3'], (0, 0, SEG_L[2] + 0.0032))
knob = bpy.data.objects.new('Knob', None); link(knob); parent(knob, objs['Crank'], (-0.03, 0, 0.046))
bpy.context.view_layer.update()
for nm, o in objs.items(): print(nm, 'tris', tris(o), 'world', tuple(round(c, 4) for c in o.matrix_world.translation))
export_glb(f'{OUT}/rod.glb', list(objs.values()) + [tip, knob])
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/rod.blend')
