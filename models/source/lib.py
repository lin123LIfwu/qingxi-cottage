# Shared helpers for the Qingxi tool models (Blender 4.5, run headless: blender -b -P tool.py)
import bpy, bmesh, math, os, time
import numpy as np
from mathutils import Vector, Matrix, Quaternion

ROOT = os.path.dirname(os.path.abspath(__file__))   # 脚本所在目录
OUT = os.path.join(ROOT, 'out')
os.makedirs(OUT, exist_ok=True)
V = Vector

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.world = bpy.data.worlds.new('World')
    return sc

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)
def rgba(h): return (*lin(h), 1.0) if isinstance(h, str) else (tuple(h) + (1.0,))[:4]
def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

# ------------------------------------------------------------------ mesh builders
def link(o): bpy.context.scene.collection.objects.link(o); return o
def mesh_obj(name, verts, faces, mat=None, smooth=True, uvs=None):
    """uvs: optional list (one per face) of per-corner (u, v) tuples, in metres; islands must be disjoint in UV space"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces]); me.update(calc_edges=True)
    o = link(bpy.data.objects.new(name, me))
    if mat is not None: me.materials.append(mat)
    me.polygons.foreach_set('use_smooth', [smooth] * len(me.polygons))
    if uvs is not None:
        lay = me.uv_layers.new(name='UVMap')
        flat = [c for fu in uvs for uv in fu for c in uv]
        lay.data.foreach_set('uv', flat)
    return o

def lathe(name, prof, seg=32, mat=None, closed=False, smooth=True, center=(0, 0), uv=None):
    """prof: [(r, z)] bottom->top for outward normals; r==0 makes a pole. closed: connect last to first.
    uv: None | True (one cylindrical island) | [(row0, row1, 'cyl'|'planar'[, usplit])] islands by profile rows."""
    verts, faces, rings = [], [], []
    cx, cy = center
    for r, z in prof:
        if r < 1e-7: rings.append([len(verts)]); verts.append((cx, cy, z)); continue
        ring = []
        for k in range(seg):
            a = k / seg * math.tau
            ring.append(len(verts)); verts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
        rings.append(ring)
    n = len(prof)
    pairs = [(i, i + 1) for i in range(n - 1)] + ([(n - 1, 0)] if closed else [])
    # arc length along the profile (v coordinate)
    sl = [0.0]
    for (i, j) in pairs: sl.append(sl[-1] + math.hypot(prof[j][0] - prof[i][0], prof[j][1] - prof[i][1]))
    if uv is True: uv = [(0, len(pairs), 'cyl')]
    def island_of(pi):
        for ii, isl in enumerate(uv or []):
            if isl[0] <= pi < isl[1]: return ii, isl
        return 0, (0, len(pairs), 'cyl')
    fuv = []
    for pi, (ia, ib) in enumerate(pairs):
        A, B = rings[ia], rings[ib]
        if len(A) == 1 and len(B) == 1: continue
        ii, isl = island_of(pi); mode = isl[2]; usplit = isl[3] if len(isl) > 3 else 1
        va, vb = sl[pi], sl[pi + 1]
        ra, rb = prof[ia][0], prof[ib][0]
        for k in range(seg):
            k2 = (k + 1) % seg
            part = min(usplit - 1, k * usplit // seg)
            off = (ii * 10.0 + part * 3.0, 0.0)
            def cyl(r, kk, v):
                return (off[0] + math.tau * max(r, 1e-6) / seg * (kk - seg * (part + 0.5) / usplit), v)
            def pl(vi):
                x, y, _ = verts[vi]; return (off[0] + x - cx, y - cy)
            if len(A) == 1:
                faces.append((A[0], B[k2], B[k]))
                if mode == 'planar': fuv.append((pl(A[0]), pl(B[k2]), pl(B[k])))
                else: fuv.append((cyl(rb, k + 0.5, va), cyl(rb, k + 1, vb), cyl(rb, k, vb)))
            elif len(B) == 1:
                faces.append((A[k], A[k2], B[0]))
                if mode == 'planar': fuv.append((pl(A[k]), pl(A[k2]), pl(B[0])))
                else: fuv.append((cyl(ra, k, va), cyl(ra, k + 1, va), cyl(ra, k + 0.5, vb)))
            else:
                faces.append((A[k], A[k2], B[k2], B[k]))
                if mode == 'planar': fuv.append((pl(A[k]), pl(A[k2]), pl(B[k2]), pl(B[k])))
                else: fuv.append((cyl(ra, k, va), cyl(ra, k + 1, va), cyl(rb, k + 1, vb), cyl(rb, k, vb)))
    return mesh_obj(name, verts, faces, mat, smooth, uvs=fuv if uv else None)

def catmull(pts, n=8):
    P = [V(p) for p in pts]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(len(P) - 3):
        p0, p1, p2, p3 = P[i:i + 4]
        for k in range(n):
            t = k / n; t2 = t * t; t3 = t2 * t
            out.append(0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3))
    out.append(P[-2].copy())
    return out

def frames(path, up=V((1, 0, 0))):
    n = len(path)
    T = [(path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized() for i in range(n)]
    N0 = up - T[0] * up.dot(T[0])
    if N0.length < 1e-6: N0 = T[0].orthogonal()
    Ns = [N0.normalized()]
    for i in range(1, n):
        Ns.append((T[i - 1].rotation_difference(T[i]) @ Ns[-1]).normalized())
    return T, Ns

def sweep(name, path, radius=None, seg=16, mat=None, caps=(True, True), up=V((1, 0, 0)), section=None, smooth=True, uv=False, chunks=1):
    """Tube along path. radius(t)->r or (rx, ry); or section(t)->[(a, b)] points (a along N, b along B=T x N).
    uv: True -> islands: the tube split into `chunks` pieces along its length (u around the section, v along the path),
    plus one planar island per cap."""
    path = [V(p) for p in path]; n = len(path)
    L = [0.0]
    for i in range(1, n): L.append(L[-1] + (path[i] - path[i - 1]).length)
    T, Ns = frames(path, up)
    verts, faces, rings, secs = [], [], [], []
    for i in range(n):
        t = L[i] / L[-1] if L[-1] > 0 else 0
        if section: pts2 = section(t)
        else:
            r = radius(t) if callable(radius) else radius
            rx, ry = r if isinstance(r, (tuple, list)) else (r, r)
            pts2 = [(rx * math.cos(k / seg * math.tau), ry * math.sin(k / seg * math.tau)) for k in range(seg)]
        B = T[i].cross(Ns[i]); ring = []
        for a, b in pts2:
            ring.append(len(verts)); verts.append(path[i] + Ns[i] * a + B * b)
        rings.append(ring); secs.append(pts2)
    m = len(rings[0])
    # u: arc length around each ring, centred
    U = []
    for i in range(n):
        P = [verts[j] for j in rings[i]]; acc = [0.0]
        for k in range(m): acc.append(acc[-1] + (P[(k + 1) % m] - P[k]).length)
        U.append([a - acc[-1] / 2 for a in acc])
    cut = [int(round(c * (n - 1) / chunks)) for c in range(chunks + 1)]
    fuv = []
    for i in range(n - 1):
        A, Bq = rings[i], rings[i + 1]
        ci = max(c for c in range(chunks) if cut[c] <= i)
        ox = ci * 10.0
        for k in range(m):
            faces.append((A[k], A[(k + 1) % m], Bq[(k + 1) % m], Bq[k]))
            fuv.append(((ox + U[i][k], L[i]), (ox + U[i][k + 1], L[i]), (ox + U[i + 1][k + 1], L[i + 1]), (ox + U[i + 1][k], L[i + 1])))
    for end, ring_i, sec_i, flip in ((0, 0, 0, True), (1, n - 1, n - 1, False)):
        if not caps[end]: continue
        rg = rings[ring_i]; sc2 = secs[sec_i]
        c = len(verts); verts.append(sum((verts[j] for j in rg), V()) / m)
        ca = sum(p[0] for p in sc2) / m; cb = sum(p[1] for p in sc2) / m
        ox = (chunks + end) * 10.0 + 5.0
        for k in range(m):
            k2 = (k + 1) % m
            if flip:
                faces.append((c, rg[k2], rg[k])); fuv.append(((ox + ca, cb), (ox + sc2[k2][0], sc2[k2][1]), (ox + sc2[k][0], sc2[k][1])))
            else:
                faces.append((rg[k], rg[k2], c)); fuv.append(((ox + sc2[k][0], sc2[k][1]), (ox + sc2[k2][0], sc2[k2][1]), (ox + ca, cb)))
    return mesh_obj(name, verts, faces, mat, smooth, uvs=fuv if uv else None)

def superellipse(hw, ht, p=4.0, n=32, rib=None):
    out = []
    for k in range(n):
        a = k / n * math.tau; c, s = math.cos(a), math.sin(a)
        w = hw * math.copysign(abs(c) ** (2 / p), c)
        t = ht * math.copysign(abs(s) ** (2 / p), s)
        if rib: t += math.copysign(rib(w), s) * abs(s) ** (2 / p)
        out.append((w, t))
    return out

def grid(name, nu, nv, fn, mat=None, closed_u=False, smooth=True):
    cols = nu if closed_u else nu + 1
    verts = [fn(i / nu, j / nv) for j in range(nv + 1) for i in range(cols)]
    faces = []
    for j in range(nv):
        for i in range(nu):
            i2 = (i + 1) % cols if closed_u else i + 1
            faces.append((j * cols + i, j * cols + i2, (j + 1) * cols + i2, (j + 1) * cols + i))
    return mesh_obj(name, verts, faces, mat, smooth)

def select(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]
def apply_all(o):
    select([o]); bpy.ops.object.convert(target='MESH'); return bpy.context.view_layer.objects.active
def join(objs, name):
    objs = [apply_all(o) if o.modifiers else o for o in objs]
    select(objs, objs[0]); bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name; o.data.name = name; return o
def weld(o, dist=1e-6):
    select([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=dist); bpy.ops.object.mode_set(mode='OBJECT')
def smooth_angle(o, deg=40):
    select([o]); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))
def place(o, loc=(0, 0, 0), rot=None, quat=None):
    o.location = loc
    if quat is not None: o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = quat
    elif rot is not None: o.rotation_euler = rot
    return o
def bake_transform(o):
    select([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
def set_mask(o, fn, name='mask'):
    """per-vertex float colour attribute from fn(world_pos, local_pos) -> (r, g, b); used by the bake shaders"""
    me = o.data
    a = me.color_attributes.get(name) or me.color_attributes.new(name=name, type='FLOAT_COLOR', domain='POINT')
    mw = o.matrix_world
    for v in me.vertices:
        c = fn(mw @ v.co, v.co); a.data[v.index].color = (c[0], c[1], c[2], c[3] if len(c) > 3 else 1.0)
def tris(o):
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); m = ev.to_mesh(); m.calc_loop_triangles()
    n = len(m.loop_triangles); ev.to_mesh_clear(); return n

# ------------------------------------------------------------------ node graph helper
class G:
    """tiny node DSL: every method returns an output socket (or node when noted)"""
    def __init__(self, mat):
        self.m = mat; self.nt = mat.node_tree; self.N = self.nt.nodes; self.L = self.nt.links
        self.bsdf = self.N['Principled BSDF']
    def _set(self, node, key, val):
        s = node.inputs[key]
        if isinstance(val, bpy.types.NodeSocket): self.L.new(val, s)
        elif isinstance(val, str): s.default_value = rgba(val)
        elif isinstance(val, (tuple, list)) and len(val) == 3 and s.type == 'RGBA': s.default_value = (*val, 1)
        elif isinstance(val, (int, float)) and s.type == 'RGBA': s.default_value = (val, val, val, 1)
        elif isinstance(val, (int, float)) and s.type == 'VECTOR': s.default_value = (val, val, val)
        else: s.default_value = val
    def node(self, t, inputs=None, **props):
        n = self.N.new(t)
        for k, v in props.items(): setattr(n, k, v)
        for k, v in (inputs or {}).items(): self._set(n, k, v)
        return n
    def coord(self, kind='Object'): return self.node('ShaderNodeTexCoord').outputs[kind]
    def attr(self, name='mask'): return self.node('ShaderNodeAttribute', attribute_name=name)
    def mapping(self, v, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        return self.node('ShaderNodeMapping', {'Vector': v, 'Location': loc, 'Rotation': rot, 'Scale': scale}).outputs['Vector']
    def noise(self, v, scale=5, detail=4, rough=0.5, dist=0.0, out='Fac'):
        return self.node('ShaderNodeTexNoise', {'Vector': v, 'Scale': scale, 'Detail': detail, 'Roughness': rough, 'Distortion': dist}).outputs[out]
    def voronoi(self, v, scale=5, feature='F1', rnd=1.0, out='Distance'):
        return self.node('ShaderNodeTexVoronoi', {'Vector': v, 'Scale': scale, 'Randomness': rnd}, feature=feature).outputs[out]
    def wave(self, v, scale, kind='BANDS', direction='Z', dist=0.0, detail=2.0, dscale=1.0, profile='SIN', phase=0.0):
        n = self.node('ShaderNodeTexWave', {'Vector': v, 'Scale': scale, 'Distortion': dist, 'Detail': detail, 'Detail Scale': dscale, 'Phase Offset': phase},
                      wave_type=kind, wave_profile=profile)
        if kind == 'BANDS': n.bands_direction = direction
        else: n.rings_direction = direction
        return n.outputs['Fac']
    def ramp(self, fac, stops, interp='LINEAR', out='Color'):
        n = self.node('ShaderNodeValToRGB', {'Fac': fac}); cr = n.color_ramp; cr.interpolation = interp
        while len(cr.elements) > 1: cr.elements.remove(cr.elements[-1])
        for i, (pos, col) in enumerate(stops):
            e = cr.elements[0] if i == 0 else cr.elements.new(pos)
            e.position = pos; e.color = rgba(col) if isinstance(col, str) else ((col, col, col, 1) if isinstance(col, (int, float)) else (*col, 1)[:4])
        return n.outputs[out]
    def mr(self, x, a, b, c=0.0, d=1.0, smooth=False, clamp=True):
        return self.node('ShaderNodeMapRange', {'Value': x, 'From Min': a, 'From Max': b, 'To Min': c, 'To Max': d},
                         interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR', clamp=clamp).outputs['Result']
    def math(self, op, a, b=0.0, c=0.0, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if isinstance(v, bpy.types.NodeSocket): self.L.new(v, n.inputs[i])
            else: n.inputs[i].default_value = v
        return n.outputs['Value']
    def mul(self, a, b, clamp=False): return self.math('MULTIPLY', a, b, clamp=clamp)
    def add(self, a, b, clamp=False): return self.math('ADD', a, b, clamp=clamp)
    def sub(self, a, b, clamp=False): return self.math('SUBTRACT', a, b, clamp=clamp)
    def vdot(self, a, b):
        n = self.node('ShaderNodeVectorMath', operation='DOT_PRODUCT')
        for i, v in enumerate((a, b)):
            if isinstance(v, bpy.types.NodeSocket): self.L.new(v, n.inputs[i])
            else: n.inputs[i].default_value = v
        return n.outputs['Value']
    def mix(self, fac, a, b, blend='MIX', clamp=True):
        return self.node('ShaderNodeMixRGB', {'Fac': fac, 'Color1': a, 'Color2': b}, blend_type=blend, use_clamp=clamp).outputs['Color']
    def sep(self, v): return self.node('ShaderNodeSeparateXYZ', {'Vector': v}).outputs
    def vmath(self, op, a, b=(0, 0, 0), out='Vector'):
        n = self.node('ShaderNodeVectorMath', operation=op)
        for i, v in enumerate((a, b)):
            if isinstance(v, bpy.types.NodeSocket): self.L.new(v, n.inputs[i])
            else: n.inputs[i].default_value = v
        return n.outputs[out]
    def comb(self, x=0.0, y=0.0, z=0.0): return self.node('ShaderNodeCombineXYZ', {'X': x, 'Y': y, 'Z': z}).outputs['Vector']
    def img(self, vec, path, extension='CLIP', interp='Linear', colorspace='Non-Color', out='Color'):
        im = bpy.data.images.load(path, check_existing=True); im.colorspace_settings.name = colorspace
        n = self.node('ShaderNodeTexImage', image=im, extension=extension, interpolation=interp)
        self.L.new(vec, n.inputs['Vector']); return n.outputs[out]
    def sepc(self, c): return self.node('ShaderNodeSeparateColor', {'Color': c}).outputs
    def bump(self, h, strength=0.3, dist=0.001, normal=None):
        n = self.node('ShaderNodeBump', {'Height': h, 'Strength': strength, 'Distance': dist})
        if normal is not None: self.L.new(normal, n.inputs['Normal'])
        return n.outputs['Normal']
    def geo(self, out='Pointiness'): return self.node('ShaderNodeNewGeometry').outputs[out]
    def ao(self, dist=0.02, only_local=True, samples=16):
        return self.node('ShaderNodeAmbientOcclusion', {'Distance': dist}, only_local=only_local, samples=samples).outputs['AO']
    def out(self, color=None, rough=None, metal=None, normal=None, extra=None):
        for k, v in (('Base Color', color), ('Roughness', rough), ('Metallic', metal), ('Normal', normal)):
            if v is not None: self._set(self.bsdf, k, v)
        for k, v in (extra or {}).items(): self._set(self.bsdf, k, v)

def newmat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, G(m)

def simple_mat(name, color, rough=0.5, metal=0.0):
    m, g = newmat(name); g.out(color, rough, metal); return m

# ------------------------------------------------------------------ texture baking
def _px(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32); img.pixels.foreach_get(a); return a.reshape(-1, 4)

def _route_emit(mat, sock):
    nt = mat.node_tree; N = nt.nodes; L = nt.links
    bsdf = next(n for n in N if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    src = bsdf.inputs[sock]
    em = N.new('ShaderNodeEmission')
    if src.is_linked: L.new(src.links[0].from_socket, em.inputs['Color'])
    else:
        v = src.default_value
        em.inputs['Color'].default_value = (v, v, v, 1) if isinstance(v, float) else tuple(v)
    orig = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].is_linked else None
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    return em, orig, out

def _unroute(mat, st):
    em, orig, out = st
    if orig is not None: mat.node_tree.links.new(orig, out.inputs['Surface'])
    mat.node_tree.nodes.remove(em)

def save_img(name, rgb, size, colorspace, alpha=None):
    w, h = size
    im = bpy.data.images.new(name, w, h, alpha=alpha is not None, float_buffer=False)
    im.colorspace_settings.name = colorspace
    a = np.ones((w * h, 4), np.float32); a[:, :3] = np.clip(rgb, 0, 1)
    if alpha is not None: a[:, 3] = np.clip(alpha, 0, 1)
    im.pixels.foreach_set(a.ravel())
    im.filepath_raw = f'{OUT}/{name}.png'; im.file_format = 'PNG'; im.save()
    return im

def to_srgb(x):
    x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)

def bake(objs, groups, ao_dist=0.03, ao_k=0.55, samples=6, ao_samples=32, margin=6):
    """groups: {name: (size, [materials])}. Every material of every object must belong to a group.
    Bakes albedo / roughness / metallic (emission trick), tangent normal and AO into per-group images.
    Returns {name: dict(col=np(sRGB), orm=np, nrm=np, size=(w,h))} and writes PNGs."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = False
    rb = sc.render.bake; rb.margin = margin; rb.use_clear = True; rb.margin_type = 'EXTEND'
    sc.world.light_settings.distance = ao_dist
    imgs, targets = {}, {}
    for gname, (size, mats) in groups.items():
        w, h = size if isinstance(size, tuple) else (size, size)
        imgs[gname] = {k: bpy.data.images.new(f'_bk_{gname}_{k}', w, h, alpha=False, float_buffer=True) for k in ('col', 'rough', 'metal', 'nrm', 'ao')}
        for m in mats:
            n = m.node_tree.nodes.new('ShaderNodeTexImage'); targets[m] = (gname, n)
    def target(key):
        for m, (gname, n) in targets.items():
            n.image = imgs[gname][key]; m.node_tree.nodes.active = n; n.select = True
    select(objs)
    mats = list(targets)
    t0 = time.time()
    for key, sock in (('col', 'Base Color'), ('rough', 'Roughness'), ('metal', 'Metallic')):
        st = [_route_emit(m, sock) for m in mats]
        target(key); bpy.ops.object.bake(type='EMIT')
        for m, s in zip(mats, st): _unroute(m, s)
    target('nrm'); bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
    sc.cycles.samples = ao_samples; target('ao'); bpy.ops.object.bake(type='AO'); sc.cycles.samples = samples
    print(f'  bake passes {time.time() - t0:.1f}s')
    res = {}
    for gname, I in imgs.items():
        w, h = I['col'].size
        col = _px(I['col'])[:, :3]; ao = _px(I['ao'])[:, :1]
        rough = _px(I['rough'])[:, :1]; metal = _px(I['metal'])[:, :1]; nrm = _px(I['nrm'])[:, :3]
        base = to_srgb(col * (1 - ao_k + ao_k * ao))
        orm = np.concatenate([ao, rough, metal], 1)
        res[gname] = dict(col=base, orm=orm, nrm=nrm, size=(w, h))
    for m, (gname, n) in targets.items(): m.node_tree.nodes.remove(n)
    return res

def baked_material(name, base_img, orm_img=None, nrm_img=None, rough=0.6, metal=0.0, nstrength=1.0):
    m, g = newmat(name); b = g.bsdf; m.use_backface_culling = True
    tb = g.node('ShaderNodeTexImage', image=base_img); g.L.new(tb.outputs['Color'], b.inputs['Base Color'])
    if orm_img is not None:
        to = g.node('ShaderNodeTexImage', image=orm_img); s = g.sepc(to.outputs['Color'])
        g.L.new(s['Green'], b.inputs['Roughness']); g.L.new(s['Blue'], b.inputs['Metallic'])
    else:
        b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if nrm_img is not None:
        tn = g.node('ShaderNodeTexImage', image=nrm_img)
        nm = g.node('ShaderNodeNormalMap', {'Strength': nstrength}); g.L.new(tn.outputs['Color'], nm.inputs['Color']); g.L.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m

def finish_group(prefix, r):
    """save the baked maps of one group and return the export material"""
    size = r['size']
    bi = save_img(f'{prefix}_basecolor', r['col'], size, 'sRGB')
    oi = save_img(f'{prefix}_orm', r['orm'], size, 'Non-Color')
    ni = save_img(f'{prefix}_normal', r['nrm'], size, 'Non-Color')
    return baked_material(prefix, bi, oi, ni)

def assign(o, mat_by_index):
    """replace the material slots of o: mat_by_index = list of materials, one per existing slot index"""
    me = o.data
    idx = np.zeros(len(me.polygons), np.int32); me.polygons.foreach_get('material_index', idx)
    old = [s.material for s in o.material_slots]
    uniq = []
    for m in mat_by_index:
        if m not in uniq: uniq.append(m)
    remap = np.array([uniq.index(mat_by_index[i]) for i in range(len(old))], np.int32)
    me.materials.clear()
    for m in uniq: me.materials.append(m)
    me.polygons.foreach_set('material_index', remap[idx] if len(remap) else idx)

def uv_unwrap(objs, angle=60, margin=0.004):
    select(objs)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')

def auto_uv(o, angle=60):
    """smart-project UVs for a part that has no hand-made islands (run before join)"""
    select([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')

def pack_uv(o, margin=0.004):
    """equalise texel density over all islands, then pack them into 0..1; returns UV coverage"""
    select([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, margin_method='SCALED', shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    me = o.data; lay = me.uv_layers.active.data; area = 0.0
    for p in me.polygons:
        pts = [lay[li].uv for li in p.loop_indices]
        for k in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[k], pts[k + 1]
            area += abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2
    print(f'  uv coverage {area:.1%}')
    return area

# ------------------------------------------------------------------ export / render
def export_glb(path, objs, quality=90):
    select(objs)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
              export_image_format='WEBP', export_image_quality=quality, export_texcoords=True, export_normals=True,
              export_tangents=False, export_cameras=False, export_lights=False, export_extras=False,
              export_vertex_color='NONE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=False)
    try: bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print('export fallback:', e); kw.pop('export_image_quality', None); kw['export_image_format'] = 'AUTO'; bpy.ops.export_scene.gltf(**kw)
    print('exported', path, round(os.path.getsize(path) / 1024), 'KB')

def look_at(cam, target):
    cam.rotation_euler = (V(target) - cam.location).to_track_quat('-Z', 'Y').to_euler()

def studio(res=(1200, 900), samples=64, floor=True, floor_hex='#d6cebf', sun_rot=(52, 0, 150), sun_energy=3.6, world_hex='#cdd8e2', world_strength=0.55):
    sc = bpy.context.scene
    w = sc.world; w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs['Color'].default_value = rgba(world_hex); bg.inputs['Strength'].default_value = world_strength
    if floor:
        # seamless backdrop: flat floor curving up at the back
        def f(u, v):
            x = (u - 0.5) * 8; y = -3 + v * 6
            z = 0.0 if y < 1.2 else (1 - math.cos(min(1, (y - 1.2) / 1.6) * math.pi / 2)) * 1.6
            y2 = y if y < 1.2 else 1.2 + math.sin(min(1, (y - 1.2) / 1.6) * math.pi / 2) * 1.6
            return (x, y2, z)
        fm = simple_mat('floor', floor_hex, rough=0.9)
        grid('Backdrop', 4, 40, f, fm)
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = sun_energy; sun.angle = math.radians(4); sun.color = (1, 0.96, 0.9)
    so = link(bpy.data.objects.new('sun', sun)); so.rotation_euler = tuple(math.radians(a) for a in sun_rot)
    fill = bpy.data.lights.new('fill', 'AREA'); fill.energy = 25; fill.size = 1.5; fill.color = (0.9, 0.95, 1.0)
    fo = link(bpy.data.objects.new('fill', fill)); fo.location = (-1.6, -1.2, 1.2); look_at(fo, (0, 0, 0.1))
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.film_transparent = False

def camera(loc, target, lens=50):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens
    c = link(bpy.data.objects.new('cam', cd)); c.location = loc; look_at(c, target)
    bpy.context.scene.camera = c; return c

def render(path):
    t0 = time.time(); sc = bpy.context.scene; sc.render.filepath = path
    bpy.ops.render.render(write_still=True); print(f'  render {os.path.basename(path)} {time.time() - t0:.0f}s')
