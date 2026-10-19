# 锄头 Hoe — tool frame (Blender, Z-up): grip at origin, handle along +Z, blade towards +Y.
# glTF/three.js frame after export: handle +Y, blade towards -Z (same frame as the old procedural hoe).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lib; importlib.reload(lib)
from lib import *
import numpy as np
sc = reset()
ALPHA = 0.40                                   # blade leans back towards the user by ~23 deg
F = V((0, math.cos(ALPHA), -math.sin(ALPHA)))  # from the eye towards the cutting edge
NB = V((0, math.sin(ALPHA), math.cos(ALPHA)))  # blade face normal
EYE_Z = 0.8835
E0 = V((0, 0.012, EYE_Z))
S = 0.175

# ------------------------------------------------------------------ materials (procedural, baked later)
def M_wood():
    m, g = newmat('hoe_wood')
    p = g.coord('Object'); mc = g.sepc(g.attr().outputs['Color'])          # R grip polish, G head grime, B end grain
    pm = g.mapping(p, loc=(0.034, 0.021, 0), rot=(0.016, 0.007, 0))
    ring = g.wave(pm, 0.3142 / 0.0034, 'RINGS', 'Z', dist=4.0, detail=3, dscale=0.7)
    fine = g.noise(g.mapping(p, scale=(1, 1, 0.035)), scale=850, detail=3)
    tone = g.noise(p, scale=5, detail=2)
    c = g.ramp(ring, [(0.0, '#9a6c42'), (0.16, '#b48655'), (0.45, '#cba574'), (1.0, '#d3b283')])
    c = g.mix(g.mr(fine, 0.42, 0.78, 0, 0.35), c, '#8c623d')
    c = g.mix(g.mr(tone, 0.25, 0.75, 0, 0.22), c, '#9d7a58')
    c = g.mix(0.1, c, '#9f998f')                                           # a little weathered grey
    c = g.mix(g.mul(mc['Red'], 0.85), c, '#bf9474', 'MULTIPLY')             # hand-polished, darker grip
    dirt = g.mul(mc['Green'], g.mr(g.noise(p, scale=38, detail=6), 0.36, 0.6))
    c = g.mix(dirt, c, '#5a4632')
    c = g.mix(g.mul(mc['Blue'], 0.45), c, '#8a6a4a', 'MULTIPLY')            # end grain reads darker
    wedge = g.mul(mc['Blue'], g.mr(g.math('ABSOLUTE', g.sep(p)['X']), 0.0011, 0.0019, 1, 0))
    c = g.mix(wedge, c, '#3f2a1a')
    r = g.add(0.6, g.mr(fine, 0.3, 0.8, -0.05, 0.08))
    r = g.mix(mc['Red'], r, 0.36); r = g.mix(dirt, r, 0.9); r = g.mix(mc['Blue'], r, 0.78)
    h = g.add(g.mul(ring, 0.25), g.mul(fine, 0.75))
    g.out(c, r, 0.0, g.bump(g.add(h, g.mul(dirt, 0.6)), 0.55, 0.00022))
    return m

def M_iron():
    m, g = newmat('hoe_iron')
    p = g.coord('Object'); mc = g.sepc(g.attr().outputs['Color'])          # R crevice rust, G soil, B polished edge
    mott = g.noise(p, scale=55, detail=6, rough=0.62)
    dents = g.voronoi(p, scale=160, feature='SMOOTH_F1')
    base = g.ramp(mott, [(0.3, (0.032, 0.034, 0.037)), (0.72, (0.078, 0.08, 0.085))])
    rn = g.noise(p, scale=20, detail=8, rough=0.66)
    rust = g.math('MINIMUM', g.add(g.mr(rn, 0.53, 0.64), g.mul(mc['Red'], 0.45)), 1.0)
    rust = g.mul(rust, g.sub(1.0, mc['Blue'], clamp=True))
    rustc = g.ramp(g.noise(p, scale=85, detail=4), [(0.25, '#4e2410'), (0.55, '#743a17'), (0.85, '#8f532a')])
    scr = g.noise(g.mapping(p, scale=(1, 0.025, 1)), scale=650, detail=2)
    pol = g.mix(g.mr(scr, 0.35, 0.7), (0.30, 0.30, 0.31), (0.52, 0.52, 0.535))
    edgew = g.mr(g.geo('Pointiness'), 0.52, 0.62, 0, 0.6)
    c = g.mix(edgew, base, (0.16, 0.165, 0.17))
    c = g.mix(mc['Blue'], c, pol)
    c = g.mix(rust, c, rustc)
    soil = g.mul(mc['Green'], g.mr(g.noise(p, scale=13, detail=6, rough=0.6), 0.43, 0.58))
    c = g.mix(soil, c, '#4a3826')
    metal = g.mix(g.math('MAXIMUM', rust, soil), 0.92, 0.0)
    r = g.add(0.5, g.mr(mott, 0.3, 0.7, -0.06, 0.08))
    r = g.mix(edgew, r, 0.4); r = g.mix(mc['Blue'], r, g.mr(scr, 0.3, 0.7, 0.22, 0.36)); r = g.mix(rust, r, 0.86); r = g.mix(soil, r, 0.95)
    h = g.add(g.mul(dents, 0.5), g.mul(g.noise(p, scale=320, detail=3), g.add(0.08, g.mul(rust, 0.5))))
    h = g.add(h, g.mul(soil, 0.7))
    g.out(c, r, metal, g.bump(h, 0.8, 0.0014))
    return m

wood, iron = M_wood(), M_iron()

# ------------------------------------------------------------------ geometry
handle = lathe('handle', [(0, -0.128), (0.0062, -0.1276), (0.0106, -0.1262), (0.0139, -0.1238), (0.016, -0.1205), (0.0173, -0.1165),
                          (0.0179, -0.111), (0.018, -0.104), (0.0178, -0.095), (0.0174, -0.08), (0.0172, -0.05), (0.0171, 0.1),
                          (0.0169, 0.3), (0.0167, 0.5), (0.0166, 0.7), (0.0165, 0.86), (0.0164, 0.905), (0.0159, 0.9175),
                          (0.0148, 0.9245), (0.0124, 0.929), (0.0075, 0.9313), (0, 0.932)], seg=28, mat=wood,
               uv=[(0, 4, 'planar'), (4, 11, 'cyl'), (11, 13, 'cyl'), (13, 16, 'cyl'), (16, 19, 'cyl'), (19, 21, 'planar')])
set_mask(handle, lambda w, l: (1 - sstep(0.1, 0.24, w.z), sstep(0.72, 0.86, w.z), 1.0 if w.z > 0.9285 else 0.0))

eye = lathe('eye', [(0.0222, 0.862), (0.0236, 0.8645), (0.0243, 0.872), (0.0246, 0.8835), (0.0243, 0.895), (0.0236, 0.9025), (0.0222, 0.905),
                    (0.0195, 0.9058), (0.0170, 0.9055), (0.0166, 0.904), (0.0166, 0.863), (0.0170, 0.8615), (0.0195, 0.8612)],
            seg=32, mat=iron, closed=True, uv=True)

def hw(s):
    xs = [0, 0.012, 0.03, 0.048, 0.075, S]; ys = [0.0165, 0.0185, 0.042, 0.061, 0.067, 0.079]
    w = float(np.interp(s, xs, ys)); rc = 0.015
    if s > S - rc: w = (float(np.interp(S, xs, ys)) - rc) + math.sqrt(max(0.0, rc * rc - (s - (S - rc)) ** 2))
    return w
def ht(s):
    return float(np.interp(s, [0, 0.012, 0.03, 0.06, 0.12, S - 0.012, S], [0.0078, 0.0074, 0.0046, 0.0027, 0.002, 0.0013, 0.0006]))
s_samples = [0, 0.006, 0.012, 0.018, 0.024, 0.03, 0.036, 0.042, 0.05, 0.06, 0.07, 0.085, 0.1, 0.115, 0.13, 0.14, 0.15, 0.156,
             0.161, 0.165, 0.168, 0.1705, 0.1725, 0.174, S]
path = [E0 + F * s for s in s_samples]
def section(t):
    s = t * S; W, H = hw(s), ht(s)
    rib = lambda w: 0.0017 * math.exp(-(w / 0.011) ** 2) * (1 - sstep(0.03, 0.11, s))
    pts = superellipse(W, H, p=5.0, n=36, rib=rib)
    return [(a, b - 0.0035 * (a / 0.079) ** 2) for a, b in pts]          # slightly dished across the width
blade = sweep('blade', path, section=section, mat=iron, up=V((1, 0, 0)), uv=True)
for o in (eye, blade):
    set_mask(o, lambda w, l: (1 - sstep(0.012, 0.045, (w - E0).dot(F)), sstep(S - 0.085, S - 0.02, (w - E0).dot(F)),
                              sstep(S - 0.032, S - 0.004, (w - E0).dot(F))))
hoe = join([handle, eye, blade], 'Hoe')
smooth_angle(hoe, 50)
print('tris', tris(hoe))

# ------------------------------------------------------------------ bake + export
pack_uv(hoe, 0.004)
res = bake([hoe], {'hoe': (1024, [wood, iron])}, ao_dist=0.02, ao_k=0.5)
mat = finish_group('hoe', res['hoe'])
assign(hoe, [mat, mat])
export_glb(f'{OUT}/hoe.glb', [hoe])
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/hoe.blend')

# preview renders: see shots.py (renders the saved, baked asset)
