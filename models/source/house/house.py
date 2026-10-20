# 青溪小筑 · two-storey timber house — Blender build script (tested with Blender 5.1.2).
#   blender -b --factory-startup -noaudio -P house.py -- [--preview] [--no-bake]
# Builds the procedural model (arch.py + furn.py), bakes ambient occlusion into the vertex colours,
# exports out/house.glb (+ out/house.blend) and writes src/assets/houseLayout.js (colliders, floors,
# lights, bed, door) from the same numbers. --preview also renders Cycles previews.
import sys, os, math, time, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy, numpy as np
from mathutils import Vector
import geo, tex, arch, furn
from geo import BUCKETS, COLL

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.join(HERE, '..', 'out'); os.makedirs(OUT, exist_ok=True)
TEXD = os.path.join(OUT, 'house_tex'); os.makedirs(TEXD, exist_ok=True)
REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
PREV = os.path.join(REPO, '.agents', 'tasks', 'timber-house', 'preview')
t0 = time.time()

# ------------------------------------------------------------------ scene reset + geometry
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
arch.build()
LIGHTS = furn.build()
st = geo.stats()
print('triangles by group:', st, 'total', sum(st.values()), f'({time.time() - t0:.1f}s)')
print('tris / verts by bucket:', {f'{g}_{m}': (b.tris(), len(b.P)) for (g, m), b in sorted(BUCKETS.items())}, 'verts', sum(len(b.P) for b in BUCKETS.values()))

# ------------------------------------------------------------------ textures
def save_img(name, arr, noncolor=False):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    if noncolor: img.colorspace_settings.name = 'Non-Color'     # set before the pixels: changing it reloads the buffer
    rgba = np.concatenate([arr.astype(np.float32), np.ones((h, w, 1), np.float32)], -1)
    img.pixels.foreach_set(rgba.ravel()); img.update()
    img.filepath_raw = os.path.join(TEXD, name + '.png'); img.file_format = 'PNG'; img.save()
    return img
T = {}
for key, fn in (('wood', tex.wood), ('stone', tex.stone), ('slate', tex.slate), ('weave', tex.weave)):
    c, n = fn()
    T[key] = save_img('T_' + key, c); T[key + '_n'] = save_img('T_' + key + '_n', n, True)
T['atlas'] = save_img('T_textile', tex.textile_atlas())
print(f'textures done ({time.time() - t0:.1f}s)')

# ------------------------------------------------------------------ materials
MAT_DEF = {   # key: (base texture, normal texture, normal strength, roughness, metallic, extra)
    'wood_ext': ('wood', 'wood_n', 1.0, 0.86, 0.0, {}),
    'wood': ('wood', 'wood_n', 0.55, 0.62, 0.0, {}),
    'stone': ('stone', 'stone_n', 1.0, 0.9, 0.0, {}),
    'slate': ('slate', 'slate_n', 0.8, 0.62, 0.0, {}),
    'fabric': ('weave', 'weave_n', 0.6, 0.95, 0.0, {'double': True}),
    'textile': ('atlas', None, 0.0, 0.92, 0.0, {'double': True}),
    'metal': (None, None, 0.0, 0.5, 0.75, {}),
    'ceramic': (None, None, 0.0, 0.32, 0.0, {}),
    'misc': (None, None, 0.0, 0.7, 0.0, {'double': True}),
    'glass': (None, None, 0.0, 0.05, 0.0, {'glass': True, 'double': True}),
    'shade': (None, None, 0.0, 0.85, 0.0, {'emit': (1.0, 0.72, 0.4), 'double': True}),
    'flame': (None, None, 0.0, 1.0, 0.0, {'emit': (1.0, 0.55, 0.2), 'double': True}),
    'ember': (None, None, 0.0, 1.0, 0.0, {'emit': (1.0, 0.3, 0.08)}),
}
MATS = {}
def build_mat(key):
    tb, tn, ns, rough, metal, ex = MAT_DEF[key]
    m = bpy.data.materials.new(key); m.use_nodes = True
    m.use_backface_culling = not ex.get('double', False)
    nt = m.node_tree; N = nt.nodes; Lk = nt.links
    b = N['Principled BSDF']
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    vc = N.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    if tb:
        ti = N.new('ShaderNodeTexImage'); ti.image = T[tb]; ti.name = 'BASE'
        mul = N.new('ShaderNodeVectorMath'); mul.operation = 'MULTIPLY'; mul.name = 'VCMUL'
        Lk.new(ti.outputs['Color'], mul.inputs[0]); Lk.new(vc.outputs['Color'], mul.inputs[1])
        Lk.new(mul.outputs[0], b.inputs['Base Color'])
    else:
        Lk.new(vc.outputs['Color'], b.inputs['Base Color'])
    if tn:
        tni = N.new('ShaderNodeTexImage'); tni.image = T[tn]
        nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = ns
        Lk.new(tni.outputs['Color'], nm.inputs['Color']); Lk.new(nm.outputs['Normal'], b.inputs['Normal'])
    if 'emit' in ex:
        b.inputs['Emission Color'].default_value = (*ex['emit'], 1); b.inputs['Emission Strength'].default_value = 0.0
    if ex.get('glass'):
        b.inputs['Transmission Weight'].default_value = 1.0; b.inputs['Base Color'].default_value = (0.9, 0.95, 0.95, 1)
        for l in list(b.inputs['Base Color'].links): Lk.remove(l)
    return m
for k in MAT_DEF: MATS[k] = build_mat(k)

def for_export():
    """glTF wants base colour = texture (vertex colours travel as COLOR_0 and multiply in three.js)"""
    for k, m in MATS.items():
        nt = m.node_tree; b = nt.nodes['Principled BSDF']
        for l in list(b.inputs['Base Color'].links): nt.links.remove(l)
        if 'BASE' in nt.nodes: nt.links.new(nt.nodes['BASE'].outputs['Color'], b.inputs['Base Color'])
        b.inputs['Base Color'].default_value = (1, 1, 1, 1)
        if 'emit' in MAT_DEF[k][5]: b.inputs['Emission Strength'].default_value = 1.0

# ------------------------------------------------------------------ buckets -> Blender meshes
def g2b(a):  # game (x, y-up, z-south) -> Blender (x, y-north, z-up)
    return np.stack([a[:, 0], -a[:, 2], a[:, 1]], 1)
PIVOTS = {'Door': (arch.DOOR_HINGE[0], 0.0, arch.DOOR_HINGE[1])}
root = bpy.data.objects.new('House', None); bpy.context.scene.collection.objects.link(root)
OBJS = []
for (grp, mk), B in sorted(BUCKETS.items()):
    if not B.F: continue
    P = np.array(B.P, np.float32); Nn = np.array(B.N, np.float32)
    piv = np.array(PIVOTS.get(grp, (0, 0, 0)), np.float32)
    P = P - piv
    me = bpy.data.meshes.new(f'{grp}_{mk}')
    me.vertices.add(len(P)); me.vertices.foreach_set('co', g2b(P).ravel())
    counts = np.array([len(f) for f in B.F], np.int32)
    starts = np.concatenate([[0], np.cumsum(counts)[:-1]]).astype(np.int32)
    flat = np.fromiter((i for f in B.F for i in f), np.int32, int(counts.sum()))
    me.loops.add(len(flat)); me.loops.foreach_set('vertex_index', flat)
    me.polygons.add(len(B.F)); me.polygons.foreach_set('loop_start', starts); me.polygons.foreach_set('loop_total', counts)
    me.update(calc_edges=True)
    uv = me.uv_layers.new(name='UVMap')
    UV = np.array(B.UV, np.float32)
    uv.data.foreach_set('uv', UV[flat].ravel())
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    C = np.array(B.C, np.float32)
    ca.data.foreach_set('color', np.concatenate([C, np.ones((len(C), 1), np.float32)], 1).ravel())
    me.color_attributes.active_color = ca; me.color_attributes.render_color_index = me.color_attributes.find('Col')
    me.shade_smooth()
    nb = g2b(Nn); nb /= np.maximum(np.linalg.norm(nb, axis=1, keepdims=True), 1e-9)
    me.normals_split_custom_set_from_vertices([tuple(v) for v in nb])
    me.materials.append(MATS[mk])
    ob = bpy.data.objects.new(f'{grp}_{mk}', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = tuple(g2b(piv[None])[0])
    ob.parent = root
    OBJS.append(ob)
# the door leaf: one empty pivot so the game can swing it
door_objs = [o for o in OBJS if o.name.startswith('Door_')]
if door_objs:
    dp = bpy.data.objects.new('Door', None); bpy.context.scene.collection.objects.link(dp)
    dp.location = door_objs[0].location.copy(); dp.parent = root
    for o in door_objs: o.parent = dp; o.location = (0, 0, 0)
print('objects:', len(OBJS), f'({time.time() - t0:.1f}s)')

# ------------------------------------------------------------------ AO -> vertex colours
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
if sc.world is None: sc.world = bpy.data.worlds.new('World')
def bake_ao():
    w = sc.world; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    w.light_settings.distance = 0.9
    sc.cycles.samples = 96
    # ground plane so the plinth and the walls darken towards the ground
    gm = bpy.data.meshes.new('ground'); gm.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
    g = bpy.data.objects.new('ground', gm); sc.collection.objects.link(g); gm.materials.append(MATS['stone'])
    skip = [o for o in OBJS if o.name.startswith(('Glass_', 'Fire_')) or o.name.endswith(('_glass', '_flame', '_ember', '_shade'))]
    for o in skip: o.hide_render = True
    targets = [o for o in OBJS if o not in skip]
    for o in targets:
        a = o.data.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT'); o.data.color_attributes.active_color = a
    bpy.ops.object.select_all(action='DESELECT')
    for o in targets: o.select_set(True)
    bpy.context.view_layer.objects.active = targets[0]
    sc.render.bake.target = 'VERTEX_COLORS'; sc.render.bake.use_selected_to_active = False
    t1 = time.time()
    bpy.ops.object.bake(type='AO')
    print(f'AO bake {time.time() - t1:.0f}s')
    for o in targets:
        me = o.data; n = len(me.vertices)
        ao = np.empty(n * 4, np.float32); me.color_attributes['AO'].data.foreach_get('color', ao); ao = ao.reshape(-1, 4)[:, 0]
        col = np.empty(n * 4, np.float32); me.color_attributes['Col'].data.foreach_get('color', col); col = col.reshape(-1, 4)
        k = 0.9 if o.name.startswith(('Int_', 'Door_')) else 0.8
        f = (1 - k) + k * np.clip(ao, 0, 1) ** 1.15
        col[:, :3] *= f[:, None]
        me.color_attributes['Col'].data.foreach_set('color', col.ravel())
        me.color_attributes.remove(me.color_attributes['AO'])
        me.color_attributes.active_color = me.color_attributes['Col']
    for o in skip: o.hide_render = False
    bpy.data.objects.remove(g, do_unlink=True)
if '--no-bake' not in ARGS: bake_ao()
print(f'bake done ({time.time() - t0:.1f}s)')

# ------------------------------------------------------------------ preview renders (Cycles)
def gb(p): return Vector((p[0], -p[2], p[1]))
def preview():
    os.makedirs(PREV, exist_ok=True)
    w = sc.world; nt = w.node_tree
    nt.nodes['Background'].inputs['Color'].default_value = (0.55, 0.68, 0.85, 1); nt.nodes['Background'].inputs['Strength'].default_value = 0.9
    sc.cycles.samples = 64; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 6
    sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = 1280, 800
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.0; sun.angle = math.radians(2); sun.color = (1.0, 0.93, 0.82)
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(55), 0, math.radians(35))       # from the south-west, afternoon
    gm = bpy.data.meshes.new('lawn'); gm.from_pydata([(-40, -40, -0.01), (40, -40, -0.01), (40, 40, -0.01), (-40, 40, -0.01)], [], [(0, 1, 2, 3)])
    lm = bpy.data.materials.new('lawn'); lm.use_nodes = True; lm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.24, 0.09, 1)
    gm.materials.append(lm); g = bpy.data.objects.new('lawn', gm); sc.collection.objects.link(g)
    lamps = []
    for k, p in LIGHTS.items():
        L = bpy.data.lights.new('L_' + k, 'POINT'); L.energy = 60 if k == 'fire' else 25; L.color = (1.0, 0.62, 0.32) if k == 'fire' else (1.0, 0.78, 0.5)
        L.shadow_soft_size = 0.08
        o = bpy.data.objects.new('L_' + k, L); sc.collection.objects.link(o); o.location = gb(p); lamps.append(o)
    for m in ('shade', 'flame', 'ember'):
        MATS[m].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = {'shade': 0.7, 'flame': 2.5, 'ember': 3.0}[m]
    cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    def shot(name, loc, tgt, lens=28, ortho=None, clip=None):
        cam.location = gb(loc); d = gb(tgt) - cam.location
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        cd.type = 'ORTHO' if ortho else 'PERSP'; cd.lens = lens
        if ortho: cd.ortho_scale = ortho
        cd.clip_start = clip if clip else 0.05; cd.clip_end = 200
        sc.render.filepath = os.path.join(PREV, name + '.png'); t1 = time.time()
        bpy.ops.render.render(write_still=True); print(f'  render {name} {time.time() - t1:.0f}s')
    shot('exterior', (10.5, 4.2, 13.5), (0, 3.0, 0.5), lens=30)
    shot('exterior_nw', (-11.5, 5.0, -10.0), (0, 3.2, 0), lens=30)
    # interiors: brighter sky through the windows, eye-adapted exposure
    nt.nodes['Background'].inputs['Strength'].default_value = 2.2
    sc.view_settings.exposure = 1.4
    shot('ground_floor', (2.9, 2.05, 2.7), (-3.0, 1.2, -0.4), lens=17)
    shot('kitchen', (-1.2, 2.05, 1.6), (3.0, 1.3, -2.2), lens=18)
    shot('bedroom', (-1.0, 5.0, 2.6), (3.0, 3.9, 0.4), lens=17)
    sc.view_settings.exposure = 1.0
    shot('plan_ground', (0, 30, 0.0001), (0, 0, 0), ortho=13, clip=30 - 2.6)
    shot('plan_upper', (0, 30, 0.0001), (0, 0, 0), ortho=13, clip=30 - (arch.F2 + 1.3))
    sc.view_settings.exposure = 0.0
    for o in lamps + [so, g, cam]: bpy.data.objects.remove(o, do_unlink=True)
    for m in ('shade', 'flame', 'ember'): MATS[m].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0.0
if '--preview' in ARGS: preview()

# ------------------------------------------------------------------ export
for_export()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'house.blend'), compress=True)
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for o in root.children_recursive: o.select_set(True)
glb = os.path.join(OUT, 'house.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
                          export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
                          export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_image_format='AUTO',
                          export_cameras=False, export_lights=False, export_extras=False)
print('exported', glb, round(os.path.getsize(glb) / 1024), 'KB')

# ------------------------------------------------------------------ game layout (local coordinates; the game adds CABIN.x / HOME_H / CABIN.z)
F1, F2, IX, IZ = arch.F1, arch.F2, arch.IX, arch.IZ
def box(x0, x1, z0, z1, lv=None, tag='wall'):
    d = {'t': 'box', 'x': round((x0 + x1) / 2, 4), 'z': round((z0 + z1) / 2, 4), 'hx': round((x1 - x0) / 2, 4), 'hz': round((z1 - z0) / 2, 4), 'rot': 0, 'tag': tag}
    if lv is not None: d['lv'] = lv
    return d
def circ(x, z, r, lv=None, tag='prop'):
    d = {'t': 'circle', 'x': x, 'z': z, 'r': r, 'tag': tag}
    if lv is not None: d['lv'] = lv
    return d
hx0, hx1, hz0, hz1 = arch.HOLE
colliders = [
    # walls (all levels); the south wall leaves the door opening x 0.9 .. 2.1
    box(-4.12, 0.9, IZ, 3.6), box(2.1, 4.12, IZ, 3.6), box(-4.12, 4.12, -3.62, -IZ),
    box(IX, 4.12, -3.62, 3.6), box(-4.12, -IX, -3.62, 3.6),
    # outside
    box(arch.CHIM[0] - 0.07, arch.CHIM[1] + 0.02, arch.CHIM[2] - 0.07, arch.CHIM[3] + 0.07, tag='chimney'),
    box(-4.65, -4.05, 0.75, 3.33, tag='firewood'), circ(-5.3, 3.9, 0.28, tag='stump'),
    circ(-3.85, arch.POST_Z, 0.15, tag='post'), circ(0.45, arch.POST_Z, 0.15, tag='post'), circ(3.85, arch.POST_Z, 0.15, tag='post'),
    box(-3.37, -1.93, 3.5, 3.72, tag='bench'), circ(0.55, 5.05, 0.2), circ(2.55, 5.0, 0.17), circ(-0.2, 4.9, 0.15),
    circ(4.05, 5.53, 0.32, tag='basin'), circ(4.88, -3.95, 0.07), circ(-4.88, -3.95, 0.07), circ(4.16, -3.95, 0.07), circ(-4.16, -3.95, 0.07),
    # stairs: open side of the flight (all levels), gallery rails on the upper floor
    box(arch.STAIR_X0 - 0.05, hx1, hz1 - 0.07, hz1 + 0.05, tag='stair'),
    box(hx0 - 0.05, hx1 + 0.1, hz1 - 0.03, hz1 + 0.07, 1, 'rail'), box(hx0 - 0.07, hx0 + 0.03, -IZ, hz1 + 0.05, 1, 'rail'),
] + [dict(c) for c in COLL]
for c in colliders:
    for k in ('x', 'z', 'hx', 'hz', 'r', 'rot'):
        if k in c: c[k] = round(c[k], 4)
decks = [
    {'x0': -IX, 'x1': IX, 'z0': -IZ, 'z1': IZ, 'h': F1},
    {'x0': 0.9, 'x1': 2.1, 'z0': 3.2, 'z1': 3.56, 'h': F1},
    {'x0': -4.0, 'x1': 4.0, 'z0': 3.5, 'z1': 5.3, 'h': F1},
    {'x0': 0.75, 'x1': 2.25, 'z0': 5.3, 'z1': 5.62, 'h': 0.30},
    {'x0': 0.75, 'x1': 2.25, 'z0': 5.62, 'z1': 5.94, 'h': 0.15},
    # the flight: a ramp through the middle of every tread
    {'x0': arch.STAIR_X0 - 0.125, 'x1': hx1 + 0.125, 'z0': -IZ, 'z1': hz1, 'h0': F1, 'h1': F2},
    # upper floor (only for feet already near that level)
    {'x0': -IX, 'x1': IX, 'z0': hz1, 'z1': IZ, 'h': F2, 'upper': 1},
    {'x0': -IX, 'x1': hx0, 'z0': -IZ, 'z1': hz1, 'h': F2, 'upper': 1},
    {'x0': hx1 + 0.125, 'x1': IX, 'z0': -IZ, 'z1': hz1, 'h': F2, 'upper': 1},
]
r3 = lambda p: [round(v, 3) for v in p]
layout = {
    'F1': F1, 'F2': F2, 'interior': [-IX, IX, -IZ, IZ], 'level1Above': 1.40,
    'colliders': colliders, 'decks': decks,
    'lights': {k: r3(v) for k, v in LIGHTS.items()}, 'porchLamp': [2.35, 2.36, 3.70],
    'bed': {'x': 2.75, 'z': 1.0, 'r': 1.9}, 'wake': {'x': 1.15, 'z': 1.0, 'yaw': 0.0},
    'door': {'hinge': r3(arch.DOOR_HINGE), 'x': 1.5, 'z': 3.4, 'open': 2.1, 'x0': 0.9, 'x1': 2.1},
    'chimneyTop': [round((arch.CHIM[0] + arch.CHIM[1]) / 2, 3), 8.05, 0.0],
    'noGrass': [[-4.6, -4.15, 4.9, 3.6], [-4.2, 3.5, 4.45, 6.1], [-4.95, -0.8, -4.0, 3.45], [-5.75, 3.45, -4.85, 4.35], [3.7, 5.15, 4.5, 6.0]],
    'blockers': [[-4.85, -0.3, -4.2, 4.85, 8.1, 3.6], [-4.2, 2.7, 3.5, 4.2, 3.62, 5.62], [-4.7, 0, -0.6, -3.95, 8.1, 0.6]],
    'tris': st,
}
dst = os.path.join(REPO, 'src', 'assets', 'houseLayout.js')
with open(dst, 'w', encoding='utf-8') as f:
    f.write('// Timber house layout (local metres; x east, z south, y above HOME_H) — generated by\n// models/source/house/house.py from the same numbers as the model. Do not edit by hand.\n')
    f.write('export default ' + json.dumps(layout, separators=(',', ':')) + ';\n')
print('layout ->', dst, len(colliders), 'colliders')
print(f'all done in {time.time() - t0:.0f}s')
