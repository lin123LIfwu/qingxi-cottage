# 种子袋 Seed packet — tool frame (Blender, Z-up): front faces -Y, packet stands up +Z, grip near the origin.
# Objects: Packet (baked print + paper wear), Icon (crop decal over the label window; the game swaps its texture per crop).
# glTF/three.js frame after export: up +Y, front faces +Z (same frame as the old procedural packet).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lib; importlib.reload(lib)
from lib import *
import numpy as np
sc = reset()
SRC = os.path.join(ROOT, 'src_tex')
HW, ZB, ZC, ZT = 0.047, -0.030, 0.096, 0.112          # half width, bottom, crimp start, top
NX = 40

def half_t(x, z):
    ax = abs(x)
    if z >= ZC: return 0.00028
    cx = max(0.0, 1 - (ax / 0.0445) ** 2) ** 0.55 if ax < 0.0445 else 0.0
    T = 0.0068 - 0.0030 * sstep(-0.01, 0.08, z)
    cz = math.sqrt(sstep(ZB, -0.012, z)) * (1 - sstep(0.068, ZC, z))
    lump = 0.0006 * math.exp(-(((x + 0.012) / 0.012) ** 2 + ((z + 0.012) / 0.01) ** 2)) + 0.0005 * math.exp(-(((x - 0.018) / 0.01) ** 2 + ((z + 0.006) / 0.012) ** 2))
    return 0.00028 + (T + lump) * cx * cz
def bow(x, z): return 0.0024 * (x / HW) ** 2 + 0.0012 * ((z - 0.04) / 0.07) ** 2
def crinkle(x, z): return 0.00022 * math.sin(x * 310 + z * 170) * math.sin(z * 260 - x * 90) * sstep(ZB, ZB + 0.01, z)

xs = [-HW + 2 * HW * k / NX for k in range(NX + 1)]
zs = [ZB, -0.0288, -0.0265, -0.0232, -0.019, -0.014, -0.008, 0.0, 0.009, 0.018, 0.027, 0.036, 0.045, 0.054, 0.063, 0.072, 0.08,
      0.0865, 0.0915, 0.0945, ZC, 0.0985, 0.101, 0.104, 0.107, 0.1095, ZT]
NZ = len(zs) - 1
def ztop(k): return ZT - (0.0018 if k % 2 else 0.0)        # pinked (zig-zag) top edge
verts, faces, fuv, fmat = [], [], [], []
idx = {}
def vid(side, k, j):
    boundary = k in (0, NX) or j in (0, NZ)
    key = ('s', k, j) if boundary else (side, k, j)
    if key not in idx:
        x = xs[k]; z = ztop(k) if j == NZ else zs[j]
        y = bow(x, z)
        if not boundary:
            t = half_t(x, z); y += (-t if side == 'f' else t) + crinkle(x, z) * (1 if side == 'f' else 0.7)
        idx[key] = len(verts); verts.append(V((x, y, z)))
    return idx[key]
def uv(side, k, j):
    x = xs[k]; z = ztop(k) if j == NZ else zs[j]
    v = (z - ZB) / (ZT - ZB)
    return ((x + HW) / (2 * HW) * 0.5, v) if side == 'f' else (0.5 + (HW - x) / (2 * HW) * 0.5, v)
for j in range(NZ):
    for k in range(NX):
        q = [(k, j), (k + 1, j), (k + 1, j + 1), (k, j + 1)]
        f = [vid('f', a, b) for a, b in q]; faces.append(f); fuv.append([uv('f', a, b) for a, b in q])
        qb = q[::-1]
        f = [vid('b', a, b) for a, b in qb]; faces.append(f); fuv.append([uv('b', a, b) for a, b in qb])

# ------------------------------------------------------------------ material: printed kraft paper (baked)
def M_packet():
    m, g = newmat('packet_paper')
    p = g.coord('Object'); uvc = g.coord('UV'); mc = g.sepc(g.attr().outputs['Color'])       # R edge wear, G grime, B crimp
    prn = g.img(uvc, f'{SRC}/packet_print.png', extension='EXTEND', colorspace='sRGB')
    ink = g.sepc(g.img(uvc, f'{SRC}/packet_ink.png', extension='EXTEND'))['Red']
    fib = g.noise(p, scale=700, detail=3)
    crease = g.voronoi(g.mapping(p, scale=(1, 1, 1)), scale=38, feature='DISTANCE_TO_EDGE')
    crease2 = g.voronoi(p, scale=90, feature='DISTANCE_TO_EDGE', rnd=0.8)
    cl = g.add(g.mr(crease, 0.0, 0.03, 1, 0), g.mul(g.mr(crease2, 0.0, 0.025, 1, 0), 0.5))
    c = g.mix(g.mr(fib, 0.3, 0.7, 0.0, 0.08), prn, '#8d6d48')
    c = g.mix(g.mul(cl, 0.12), c, '#6e5338', 'MULTIPLY')
    scuff = g.mul(g.mr(g.noise(p, scale=150, detail=5), 0.45, 0.62), g.add(mc['Red'], g.mul(cl, 0.5)))
    scuff = g.math('MINIMUM', g.mul(scuff, ink), 1.0)
    c = g.mix(g.mul(scuff, 0.7), c, '#d8c09a')                                     # ink rubbed off on edges / creases
    grime = g.mul(mc['Green'], g.mr(g.noise(p, scale=30, detail=6, rough=0.6), 0.38, 0.62))
    c = g.mix(g.mul(grime, 0.55), c, '#5d4630')
    ridge = g.wave(p, 0.3142 / 0.0011, 'BANDS', 'X', profile='SIN')
    c = g.mix(g.mul(g.mul(ridge, mc['Blue']), 0.12), c, '#5f4428')
    r = g.mix(ink, 0.88, 0.6); r = g.mix(scuff, r, 0.85); r = g.mix(grime, r, 0.92)
    h = g.add(g.mul(fib, 0.15), g.mul(cl, -0.6))
    h = g.add(h, g.mul(g.mul(ridge, mc['Blue']), 0.8))
    g.out(c, r, 0.0, g.bump(h, 0.6, 0.0004))
    return m
paper = M_packet()
packet = mesh_obj('Packet', verts, faces, paper, smooth=True, uvs=fuv)
def pmask(w, l):
    edge = max(1 - sstep(0.0, 0.004, HW - abs(w.x)), 1 - sstep(0.0, 0.004, w.z - ZB), sstep(ZT - 0.004, ZT, w.z))
    grime = max(1 - sstep(ZB, ZB + 0.025, w.z), 0.7 * math.exp(-((w.x / 0.03) ** 2 + ((w.z + 0.004) / 0.03) ** 2)))
    return (edge, grime, 1.0 if w.z >= ZC - 0.0005 else 0.0)
set_mask(packet, pmask)
smooth_angle(packet, 70)
print('tris', tris(packet))

# ------------------------------------------------------------------ icon decal conforming to the front, over the label window
IC_Z, IC_S, N = 0.040, 0.046, 10
iv, ifc, iuv = [], [], []
for j in range(N + 1):
    for k in range(N + 1):
        x = (k / N - 0.5) * IC_S; z = IC_Z + (j / N - 0.5) * IC_S
        iv.append(V((x, bow(x, z) - half_t(x, z) + crinkle(x, z) - 0.00035, z)))
for j in range(N):
    for k in range(N):
        a = j * (N + 1) + k; q = [a, a + 1, a + N + 2, a + N + 1]; ifc.append(q)
        iuv.append([((k + dk) / N, (j + dj) / N) for dk, dj in ((0, 0), (1, 0), (1, 1), (0, 1))])
im_ic = bpy.data.images.load(f'{SRC}/packet_icon.png'); im_ic.alpha_mode = 'STRAIGHT'
mi, gi = newmat('packet_icon'); mi.use_backface_culling = True
t = gi.node('ShaderNodeTexImage', image=im_ic, extension='CLIP')
gi.L.new(t.outputs['Color'], gi.bsdf.inputs['Base Color']); gi.L.new(t.outputs['Alpha'], gi.bsdf.inputs['Alpha'])
gi.bsdf.inputs['Roughness'].default_value = 0.62
mi.surface_render_method = 'BLENDED' if hasattr(mi, 'surface_render_method') else None
icon = mesh_obj('Icon', iv, ifc, mi, smooth=True, uvs=iuv)

# ------------------------------------------------------------------ bake (packet only, keeps its print-layout UVs) + export
res = bake([packet], {'packet': ((1024, 768), [paper])}, ao_dist=0.01, ao_k=0.45)
mat = finish_group('packet', res['packet'])
assign(packet, [mat])
icon.parent = packet; icon.matrix_parent_inverse = Matrix.Identity(4)
export_glb(f'{OUT}/packet.glb', [packet, icon])
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/packet.blend')
