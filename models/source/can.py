# 浇水壶 Watering can — tool frame (Blender, Z-up): grip (top of the handle strap) at origin, spout towards +Y.
# glTF/three.js frame after export: up +Y, spout towards -Z (same frame as the old procedural can).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, lib; importlib.reload(lib)
from lib import *
import numpy as np
sc = reset()

Z0, Z1, R0, R1 = -0.3175, -0.0825, 0.118, 0.104
def rw(z): return R0 + (z - Z0) * (R1 - R0) / (Z1 - Z0)
BEADS = (-0.272, -0.128)
def bead(z): return sum(0.0024 * math.exp(-((z - b) / 0.0032) ** 2) for b in BEADS)
# spout axis
D = V((0, 0.857, 0.515)).normalized()
S0 = V((0, 0.070, -0.265)); SL = 0.372
def spout_r(s): return 0.0205 + (0.0108 - 0.0205) * s / SL + 0.0028 * math.exp(-((s - 0.062) / 0.006) ** 2)
AE = S0 + D * SL                                   # spout end = rose base
ROSE_FACE = 0.0535
FC = AE + D * ROSE_FACE                            # rose face centre
QR = V((0, 0, 1)).rotation_difference(D)
E1, E2 = QR @ V((1, 0, 0)), QR @ V((0, 1, 0))
CF = (0.0, -0.046)                                 # fill opening centre (x, y)

# ------------------------------------------------------------------ rose hole pattern (white = hole), 0.07 m square
def make_holes(path, n=256, span=0.07):
    yy, xx = np.mgrid[0:n, 0:n]; px = (xx + 0.5) / n * span - span / 2; py = (yy + 0.5) / n * span - span / 2
    img = np.zeros((n, n), np.float32); hr = 0.00115
    centers = [(0.0, 0.0)]
    for k, cnt in ((1, 6), (2, 12), (3, 18), (4, 24), (5, 30)):
        rho = 0.0051 * k
        for j in range(cnt):
            a = j / cnt * math.tau + k * 0.37
            centers.append((rho * math.cos(a), rho * math.sin(a)))
    for cx, cy in centers:
        d = np.sqrt((px - cx) ** 2 + (py - cy) ** 2)
        img = np.maximum(img, np.clip((hr - d) / (span / n * 0.9) + 0.5, 0, 1))
    im = bpy.data.images.new('rose_holes', n, n, alpha=False, float_buffer=False)
    a = np.ones((n * n, 4), np.float32); a[:, 0] = a[:, 1] = a[:, 2] = img.ravel()
    im.pixels.foreach_set(a.ravel()); im.filepath_raw = path; im.file_format = 'PNG'; im.save()
    return len(centers)
HOLES = os.path.join(ROOT, 'src_tex', 'rose_holes.png')
print('rose holes', make_holes(HOLES))

# ------------------------------------------------------------------ materials (procedural, baked later)
def M_paint():
    m, g = newmat('can_paint')
    p = g.coord('Object'); at = g.attr(); mc = g.sepc(at.outputs['Color'])   # R edge wear, G dirt, B interior dark, A pointiness weight
    tone = g.noise(p, scale=9, detail=3)
    c = g.ramp(tone, [(0.3, '#4f978c'), (0.7, '#5fae a2'.replace(' ', ''))])
    streak = g.noise(g.mapping(p, scale=(1, 1, 0.06)), scale=60, detail=3)     # faint mineral drips running down
    c = g.mix(g.mul(g.mr(streak, 0.55, 0.75), 0.22), c, '#a9c4bc')
    pt = g.geo('Pointiness')
    edge = g.add(g.mul(g.mr(pt, 0.515, 0.56), at.outputs['Alpha']), g.mul(mc['Red'], 0.6))
    chipn = g.noise(p, scale=70, detail=6, rough=0.65)
    chip = g.mr(g.add(g.mul(edge, 0.55), chipn), 0.86, 0.9)                 # chipped enamel -> bare steel
    rim = g.mr(g.add(g.mul(edge, 0.5), chipn), 0.8, 0.86)                   # dark rim around each chip
    steel = g.ramp(g.noise(p, scale=140, detail=3), [(0.3, '#5b5f61'), (0.7, '#7c8183')])
    rustn = g.noise(p, scale=45, detail=5)
    steel = g.mix(g.mr(rustn, 0.6, 0.7), steel, '#6a3a1e')
    c = g.mix(rim, c, '#2f5a53')
    c = g.mix(chip, c, steel)
    dirt = g.mul(mc['Green'], g.mr(g.noise(p, scale=16, detail=6, rough=0.6), 0.32, 0.62))
    c = g.mix(dirt, c, '#5b4a36')
    c = g.mix(mc['Blue'], c, '#0b0d0d')                                       # inside of the fill opening
    r = g.add(0.3, g.mr(tone, 0.2, 0.8, -0.05, 0.07))
    r = g.mix(chip, r, 0.5); r = g.mix(dirt, r, 0.92); r = g.mix(mc['Blue'], r, 0.9)
    metal = g.mul(chip, g.sub(1.0, g.mr(rustn, 0.6, 0.7), clamp=True))
    peel = g.noise(p, scale=900, detail=2)                                   # orange-peel enamel
    dents = g.voronoi(p, scale=22, feature='SMOOTH_F1')
    h = g.add(g.mul(peel, 0.08), g.mul(dents, 0.25))
    h = g.add(h, g.mul(g.sub(1.0, chip), 0.35))                              # chips sit below the enamel
    h = g.add(h, g.mul(dirt, 0.4))
    g.out(c, r, metal, g.bump(h, 0.6, 0.0011))
    return m

def M_brass():
    m, g = newmat('can_brass')
    p = g.coord('Object'); mc = g.sepc(g.attr().outputs['Color'])         # R crevice tarnish
    q = g.vmath('SUBTRACT', p, tuple(FC))
    uvv = g.comb(g.add(g.mul(g.vdot(q, tuple(E1)), 1 / 0.07), 0.5), g.add(g.mul(g.vdot(q, tuple(E2)), 1 / 0.07), 0.5), 0.0)
    hole = g.sepc(g.img(uvv, HOLES))['Red']
    w = g.vdot(g.vmath('SUBTRACT', p, tuple(AE)), tuple(D))
    face = g.mr(w, ROSE_FACE - 0.0022, ROSE_FACE - 0.0012)
    hole = g.mul(hole, face)
    n1 = g.noise(p, scale=60, detail=5, rough=0.6)
    base = g.ramp(n1, [(0.3, '#a8803c'), (0.7, '#c39a4e')])
    tarn = g.add(g.mr(g.noise(p, scale=25, detail=4), 0.4, 0.65), g.mul(mc['Red'], 0.6))
    tarn = g.math('MINIMUM', tarn, 1.0)
    base = g.mix(g.mul(tarn, 0.75), base, '#5b4724')
    verd = g.mul(g.mr(g.noise(p, scale=90, detail=3), 0.58, 0.7), mc['Red'])
    base = g.mix(verd, base, '#4f7d6a')
    ring = g.mul(face, g.mr(g.noise(g.mapping(p, scale=(1, 1, 1)), scale=300, detail=2), 0.3, 0.7, 0.0, 0.25))
    base = g.mix(ring, base, '#d8b264')                                       # rubbed face
    c = g.mix(hole, base, '#060504')
    r = g.add(0.3, g.mul(tarn, 0.3)); r = g.mix(verd, r, 0.8); r = g.mix(hole, r, 0.9)
    metal = g.mix(g.math('MAXIMUM', verd, hole), 1.0, 0.0)
    h = g.add(g.mul(g.sub(1.0, hole), 0.6), g.mul(g.noise(p, scale=400, detail=2), 0.05))
    g.out(c, r, metal, g.bump(h, 0.7, 0.0009))
    return m

paint, brass = M_paint(), M_brass()

# ------------------------------------------------------------------ body (lathe)
prof = [(0, -0.3112), (0.05, -0.3114), (0.085, -0.3119), (0.104, -0.3128), (0.1125, -0.3145), (0.1158, -0.3163), (0.1178, -0.3175)]
i_bot = len(prof) - 1
prof += [(0.1203, -0.3172), (0.1219, -0.3160), (0.1228, -0.3140), (0.1229, -0.3115), (0.1220, -0.3092), (0.1200, -0.3076)]
i_wall = len(prof) - 1
zs = [-0.3055, -0.296, -0.285]
for b in BEADS:
    zs += [b + d for d in (-0.0065, -0.0035, -0.0015, 0.0, 0.0015, 0.0035, 0.0065)]
    if b == BEADS[0]: zs += [-0.258, -0.235, -0.205, -0.175, -0.15]
zs += [-0.112, -0.1, -0.0905]
zs = sorted(zs)
prof += [(rw(z) + bead(z), z) for z in zs]
i_seam = len(prof) - 1
prof += [(0.1048, -0.0880), (0.1062, -0.0868), (0.1077, -0.0850), (0.1083, -0.0828), (0.1080, -0.0806), (0.1067, -0.0789), (0.1046, -0.0779), (0.1025, -0.0776)]
DZC, DA, DB = -0.0776, 0.1025, 0.0262
def dome_z(rho): return DZC + DB * math.sqrt(max(0.0, 1 - (rho / DA) ** 2))
for th in (7, 15, 24):
    t = math.radians(th); prof.append((DA * math.cos(t), DZC + DB * math.sin(t)))
i_dome = len(prof) - 1
for th in (34, 45, 56, 67, 78):
    t = math.radians(th); prof.append((DA * math.cos(t), DZC + DB * math.sin(t)))
prof.append((0, DZC + DB))
NP = len(prof) - 1
body = lathe('body', prof, seg=40, mat=paint,
             uv=[(0, i_bot, 'planar'), (i_bot, i_wall, 'cyl', 2), (i_wall, i_seam, 'cyl', 2), (i_seam, i_dome, 'cyl', 2), (i_dome, NP, 'planar')])
def body_mask(w, l):
    z = w.z
    rimz = max(math.exp(-((z + 0.314) / 0.006) ** 2), math.exp(-((z + 0.0828) / 0.005) ** 2), *(math.exp(-((z - b) / 0.004) ** 2) * 0.5 for b in BEADS))
    return (rimz, 1 - sstep(-0.3175, -0.235, z), 0.0)
set_mask(body, body_mask)

# ------------------------------------------------------------------ fill opening collar
bc_r, bc_z, tr = 0.0349, -0.0378, 0.0033
cp = [(0.0335, -0.074), (0.0335, -0.056), (0.0336, -0.046)]
for ph in (-115, -80, -45, -15, 15, 45, 75, 105, 135, 165, 195, 225):
    a = math.radians(ph); cp.append((bc_r + tr * math.cos(a), bc_z + tr * math.sin(a)))
i_in = len(cp)
cp += [(0.0311, -0.0418), (0.0309, -0.0455), (0.0306, -0.0490), (0.0294, -0.0502)]
i_fl = len(cp) - 1
cp += [(0.020, -0.0505), (0, -0.0505)]
collar = lathe('collar', cp, seg=28, mat=paint, center=CF, uv=[(0, i_fl, 'cyl'), (i_fl, len(cp) - 1, 'planar')])
def collar_mask(w, l):
    rr = math.hypot(w.x - CF[0], w.y - CF[1])
    inner = 1.0 if rr < 0.0318 and w.z < -0.039 else 0.0
    deep = sstep(-0.040, -0.0495, w.z) if inner else 0.0
    lip = math.exp(-((w.z - bc_z) / 0.004) ** 2) * (1 - inner)
    return (lip, 0.0, deep * 0.97)
set_mask(collar, collar_mask)

# ------------------------------------------------------------------ handle strap: dome front -> over the top (grip) -> down the back
hp = [(0, 0.081, -0.068), (0, 0.077, -0.047), (0, 0.067, -0.017), (0, 0.043, 0.0075), (0, 0.0, 0.0165), (0, -0.044, 0.0118),
      (0, -0.088, -0.0045), (0, -0.126, -0.029), (0, -0.147, -0.066), (0, -0.149, -0.104), (0, -0.136, -0.136), (0, -0.1175, -0.1535),
      (0, -0.1085, -0.169)]
hpath = catmull(hp, 5)
grip_t = (0.27, 0.5)
def hsec(t):
    k = sstep(grip_t[0] - 0.08, grip_t[0], t) * (1 - sstep(grip_t[1], grip_t[1] + 0.08, t))
    hw = 0.0116 + (0.0098 - 0.0116) * k; ht = 0.0034 + (0.0060 - 0.0034) * k
    return superellipse(hw, ht, p=3.2 - 0.8 * k, n=16)
handle = sweep('handle', hpath, section=hsec, mat=paint, up=V((1, 0, 0)), uv=True, chunks=3)
hl = [0.0]
for i in range(1, len(hpath)): hl.append(hl[-1] + (hpath[i] - hpath[i - 1]).length)
def handle_mask(w, l):
    # nearest path parameter
    j = min(range(len(hpath)), key=lambda i: (hpath[i] - w).length_squared); t = hl[j] / hl[-1]
    grip = sstep(grip_t[0] - 0.05, grip_t[0] + 0.03, t) * (1 - sstep(grip_t[1] - 0.03, grip_t[1] + 0.05, t))
    side = min(1.0, abs(w.x) / 0.0105) ** 6
    return (min(1.0, 0.2 + 0.6 * grip + 0.3 * side), 0.0, 0.0, 0.5)
set_mask(handle, handle_mask)

# foot plates + rivets
def plate(name, pts, hw=0.0135, ht=0.0016):
    o = sweep(name, catmull(pts, 4), section=lambda t: superellipse(hw * (0.75 + 0.25 * math.sin(math.pi * t)), ht, p=4, n=16),
              mat=paint, up=V((1, 0, 0)), uv=True)
    return o
def on_dome(y, lift=0.0011):
    rho = abs(y); z = dome_z(rho)
    n = V((0, y / DA ** 2, (z - DZC) / DB ** 2)).normalized()
    return V((0, y, z)) + n * lift, n
def on_wall(z, lift=0.0011):
    r = rw(z); n = V((0, -1, (R1 - R0) / (Z1 - Z0) * -1)).normalized()
    return V((0, -r, z)) + n * lift, n
parts = [body, collar, handle]
fp = [on_dome(y)[0] for y in (0.064, 0.072, 0.080, 0.090)]
parts.append(plate('plate_f', fp))
rp = [on_wall(z)[0] for z in (-0.172, -0.162, -0.150, -0.140)]
parts.append(plate('plate_r', rp))
def rivet(name, pos, n, r=0.0026):
    o = lathe(name, [(0, r * 0.55), (r * 0.5, r * 0.47), (r * 0.82, r * 0.3), (r, 0.0), (r * 0.98, -0.002)], seg=10, mat=paint, uv=[(0, 4, 'planar')])
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = V((0, 0, 1)).rotation_difference(n); o.location = pos
    bake_transform(o); return o
for i, y in enumerate((0.0645, 0.0885)):
    pos, n = on_dome(y, 0.0026); parts.append(rivet(f'rv_f{i}', pos, n))
for i, z in enumerate((-0.1705, -0.1415)):
    pos, n = on_wall(z, 0.0026); parts.append(rivet(f'rv_r{i}', pos, n))
for o in parts[3:]:
    set_mask(o, lambda w, l: (0.7, 0.0, 0.0, 0.6))

# ------------------------------------------------------------------ spout + brace
srows = [0, 0.03, 0.045, 0.052, 0.058, 0.062, 0.066, 0.072, 0.08, 0.1, 0.14, 0.18, 0.22, 0.26, 0.3, 0.34, SL]
spout = sweep('spout', [S0 + D * s for s in srows], radius=lambda t: spout_r(t * SL), seg=20, mat=paint, up=V((1, 0, 0)), uv=True, chunks=2)
set_mask(spout, lambda w, l: (math.exp(-((((w - S0).dot(D)) - 0.062) / 0.007) ** 2) * 0.9 + 0.1, 0.0, 0.0, 0.8))
A2 = S0 + D * 0.2; NUP = V((0, -D.z, D.y))
bend = A2 + NUP * (spout_r(0.2) - 0.0015)
brace = sweep('brace', [V((0, 0.097, -0.110)) + (bend - V((0, 0.097, -0.110))) * (k / 6) for k in range(7)],
              radius=0.0034, seg=8, mat=paint, up=V((1, 0, 0)), uv=True)
set_mask(brace, lambda w, l: (0.12, 0.0, 0.0, 0.12))
parts += [spout, brace]

# ------------------------------------------------------------------ brass rose
rp_ = [(0.0108, -0.014), (0.0122, -0.0135), (0.0126, -0.004), (0.0129, 0.0), (0.0146, 0.008), (0.0182, 0.018), (0.0240, 0.030), (0.0288, 0.040),
       (0.0314, 0.0455), (0.0328, 0.0476), (0.0333, 0.0496), (0.0327, 0.0512)]
i_face = len(rp_) - 1
rp_ += [(0.0311, 0.0519), (0.0262, 0.0526), (0.0200, 0.0531), (0.0130, 0.0534), (0.0060, 0.0535), (0, ROSE_FACE)]
rose = lathe('rose', rp_, seg=32, mat=brass, uv=[(0, i_face, 'cyl'), (i_face, len(rp_) - 1, 'planar')])
rose.rotation_mode = 'QUATERNION'; rose.rotation_quaternion = QR; rose.location = AE
bake_transform(rose)
def rose_mask(w, l):
    s = (w - AE).dot(D)
    return (max(math.exp(-((s - 0.0) / 0.005) ** 2), math.exp(-((s - 0.0505) / 0.0025) ** 2) * 0.6), 0.0, 0.0)
set_mask(rose, rose_mask)
parts.append(rose)

can = join(parts, 'WateringCan')
smooth_angle(can, 46)
print('tris', tris(can))

# spout tip marker for the water particles
tip = bpy.data.objects.new('Spout', None); link(tip); tip.location = FC + D * 0.006
tip.parent = can; tip.matrix_parent_inverse = Matrix.Identity(4)

# ------------------------------------------------------------------ bake + export
pack_uv(can, 0.004)
res = bake([can], {'can': (1024, [paint, brass])}, ao_dist=0.03, ao_k=0.55)
mat = finish_group('can', res['can'])
assign(can, [mat, mat])
export_glb(f'{OUT}/can.glb', [can, tip])
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/can.blend')
