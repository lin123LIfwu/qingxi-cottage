# Step 2: turn the MPFB human into a game-ready GLB: bake the morph targets, delete hidden / helper geometry,
# smooth the clothes, add the bucket hat (bone-parented to the head), rebuild simple PBR materials, export.
import bpy, bmesh, os, sys, math
import numpy as np
from mathutils import Vector, Matrix
D = os.path.expanduser('~/.config/blender/4.5/extensions/.user/user_default/mpfb/data')
TEX = '/data/char/tex'; OUT = '/data/char/out'
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arm = bpy.data.objects['Farmer']
bones = set(b.name for b in arm.data.bones)
ctx = bpy.context

def activate(o):
    for x in ctx.view_layer.objects: x.select_set(False)
    ctx.view_layer.objects.active = o; o.select_set(True)

def delete_masked(o):
    keep = np.ones(len(o.data.vertices), bool)
    for m in [m for m in o.modifiers if m.type == 'MASK']:
        g = o.vertex_groups.get(m.vertex_group)
        ing = np.zeros(len(o.data.vertices), bool)
        if g:
            gi = g.index
            for v in o.data.vertices:
                for e in v.groups:
                    if e.group == gi and e.weight > 0: ing[v.index] = True
        keep &= ~ing if m.invert_vertex_group else ing
        o.modifiers.remove(m)
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep[v.index]], context='VERTS')
    bm.to_mesh(o.data); bm.free()

def clean_groups(o):
    for g in list(o.vertex_groups):
        if g.name not in bones: o.vertex_groups.remove(g)

def subdivide(o, levels=1):
    activate(o)
    m = o.modifiers.new('sub', 'SUBSURF'); m.levels = levels; m.render_levels = levels; m.quality = 3
    m.uv_smooth = 'PRESERVE_BOUNDARIES'
    bpy.ops.object.modifier_move_to_index(modifier='sub', index=0)
    bpy.ops.object.modifier_apply(modifier='sub')

meshes = {o.name.split('.', 1)[1]: o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm}
print('meshes', list(meshes))
body = meshes['body']
activate(body)
if body.data.shape_keys: bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
delete_masked(body)
for o in meshes.values():
    clean_groups(o)
    for m in list(o.modifiers):
        if m.type not in ('ARMATURE',): o.modifiers.remove(m)
def drop_cornea(o):
    # the high-poly eyes carry a cornea shell mapped to a fully transparent corner of the texture
    # (u > 0.85, v < 0.15).  Opaque in the game -> black eyes, so remove it; the glossy eyeball gives the highlight.
    bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active
    dead = [f for f in bm.faces if all(l[uvl].uv.x > 0.85 and l[uvl].uv.y < 0.15 for l in f.loops)]
    bmesh.ops.delete(bm, geom=dead, context='FACES'); print('cornea faces removed', len(dead))
    bm.to_mesh(o.data); bm.free()
drop_cornea(meshes['high-poly'])
subdivide(meshes['male_casualsuit06'], 1)
# shoes stay at base resolution (small on screen)
for o in meshes.values():
    activate(o); bpy.ops.object.shade_smooth()

# ---------------------------------------------------------------- bucket hat
import json
HAT = json.load(open('/data/char/hat_params.json'))
def fit_hair_under_hat(o):
    # flatten the hair into the crown: nothing may poke through the crown wall / top or the brim root
    z0, cy, ax, ay = HAT['z0'], HAT['cy'], HAT['ax'], HAT['ay']
    ztop = z0 + HAT['prof'][-1][1]
    mw = o.matrix_world; inv = mw.inverted()
    for vt in o.data.vertices:
        p = mw @ vt.co
        if p.z < z0 - 0.022: continue
        w = min(1.0, max(0.0, (p.z - (z0 - 0.022)) / 0.022)); w = w * w * (3 - 2 * w)
        smax = 1.18 + (0.93 - 1.18) * w
        if p.z > z0: smax = 0.93 - 0.10 * min(1.0, (p.z - z0) / (ztop - z0)) ** 2
        rho = math.sqrt((p.x / ax) ** 2 + ((p.y - cy) / ay) ** 2)
        if rho > smax:
            k = smax / rho; p.x *= k; p.y = cy + (p.y - cy) * k
        if p.z > ztop - 0.007: p.z = ztop - 0.007 - (p.z - (ztop - 0.007)) * 0.2
        vt.co = inv @ p
fit_hair_under_hat(meshes['short02'])
def inflate(o, d):
    me = o.data
    for vt in me.vertices: vt.co += vt.normal * d
inflate(meshes['male_casualsuit06'], 0.0022)
def hat_mesh():
    z0, cy, ax, ay, prof = HAT['z0'], HAT['cy'], HAT['ax'], HAT['ay'], HAT['prof']
    N = 96
    # arc length along the profile -> v coordinate (side/brim island)
    L = [0.0]
    for i in range(1, len(prof)): L.append(L[-1] + math.dist(prof[i - 1], prof[i]))
    Ltot = L[-1]
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    rings = []; ringuv = []
    for (d, z), l in zip(prof, L):
        ring = []
        for k in range(N):
            t = 2 * math.pi * k / N
            ring.append(bm.verts.new((math.sin(t) * (ax + d), cy - math.cos(t) * (ay + d), z0 + z)))
        rings.append(ring); ringuv.append(l / Ltot)
    # top disc: concentric rings to the centre
    ex, ey = ax + prof[-1][0], ay + prof[-1][0]; zt = z0 + prof[-1][1]
    tops = []
    for s in [0.8, 0.6, 0.4, 0.2]:
        ring = [bm.verts.new((math.sin(2 * math.pi * k / N) * ex * s, cy - math.cos(2 * math.pi * k / N) * ey * s, zt + 0.004 * (1 - s * s))) for k in range(N)]
        tops.append((s, ring))
    ctr = bm.verts.new((0, cy, zt + 0.004))
    def side_uv(k, j):        # island A: u in [0, 0.74], v in [0, 1]  (k may be N for the seam column)
        return (0.74 * k / N, ringuv[j])
    def top_uv(x, y):          # island B: planar, square at u 0.75..1, v 0..0.25*? -> use v 0.70..0.95 band
        return (0.875 + 0.12 * x / ex, 0.5 + 0.12 * (y - cy) / ey)
    for j in range(len(rings) - 1):
        for k in range(N):
            k2 = (k + 1) % N
            f = bm.faces.new((rings[j][k], rings[j][k2], rings[j + 1][k2], rings[j + 1][k]))
            for lp, (kk, jj) in zip(f.loops, [(k, j), (k + 1, j), (k + 1, j + 1), (k, j + 1)]): lp[uv].uv = side_uv(kk, jj)
    prev = rings[-1]
    allr = [prev] + [r for _, r in tops]
    for j in range(len(allr) - 1):
        for k in range(N):
            k2 = (k + 1) % N
            f = bm.faces.new((allr[j][k], allr[j][k2], allr[j + 1][k2], allr[j + 1][k]))
            for lp in f.loops: lp[uv].uv = top_uv(lp.vert.co.x, lp.vert.co.y)
    for k in range(N):
        f = bm.faces.new((allr[-1][k], allr[-1][(k + 1) % N], ctr))
        for lp in f.loops: lp[uv].uv = top_uv(lp.vert.co.x, lp.vert.co.y)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('BucketHat'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('BucketHat', me); ctx.scene.collection.objects.link(o)
    # make normals point outward (up on the crown)
    activate(o)
    sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.0028; sol.offset = -1; sol.use_rim = True; sol.use_even_offset = True
    bpy.ops.object.modifier_apply(modifier='sol')
    bpy.ops.object.shade_smooth()
    return o
hat = hat_mesh()
mw = hat.matrix_world.copy()
hat.parent = arm; hat.parent_type = 'BONE'; hat.parent_bone = 'head'
ctx.view_layer.update(); hat.matrix_world = mw

# ---------------------------------------------------------------- materials
def img(path, cs='sRGB'):
    im = bpy.data.images.load(path, check_existing=True); im.colorspace_settings.name = cs; return im
def mat(name, base, normal=None, rough=0.6, alpha=False, metal=0.0, orm=None, spec=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes
    p = N['Principled BSDF']; p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    p.inputs['Specular IOR Level'].default_value = spec
    t = N.new('ShaderNodeTexImage'); t.image = img(base); nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if alpha:
        nt.links.new(t.outputs['Alpha'], p.inputs['Alpha']); m.surface_render_method = 'BLENDED'
    if normal:
        tn = N.new('ShaderNodeTexImage'); tn.image = img(normal, 'Non-Color'); nm = N.new('ShaderNodeNormalMap')
        nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if orm:
        to = N.new('ShaderNodeTexImage'); to.image = img(orm, 'Non-Color'); sp = N.new('ShaderNodeSeparateColor')
        nt.links.new(to.outputs['Color'], sp.inputs['Color'])
        nt.links.new(sp.outputs['Green'], p.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], p.inputs['Metallic'])
    return m
def setmat(o, m):
    o.data.materials.clear(); o.data.materials.append(m)
setmat(body, mat('skin', f'{D}/skins/young_asian_male/young_lightskinned_male_diffuse3.png', rough=0.52, spec=0.45))
setmat(meshes['high-poly'], mat('eyes', f'{TEX}/eye_diffuse.png', rough=0.12, spec=0.55))
setmat(meshes['eyebrow001'], mat('brows', f'{D}/eyebrows/eyebrow001/eyebrow001.png', rough=0.8, alpha=True))
setmat(meshes['eyelashes01'], mat('lashes', f'{TEX}/lash_diffuse.png', rough=0.8, alpha=True))
setmat(meshes['short02'], mat('hair', f'{TEX}/hair_diffuse.png', f'{D}/hair/short02/short02_normal.png', rough=0.5, alpha=True))
setmat(meshes['male_casualsuit06'], mat('clothes', f'{TEX}/suit_diffuse.png', f'{D}/clothes/male_casualsuit06/male_casualsuit06_normal.png', rough=0.88, spec=0.3))
setmat(meshes['shoes02'], mat('shoes', f'{D}/clothes/shoes02/shoes02_diffuse.png', rough=0.72, spec=0.4))
hat_tex = os.path.exists(f'{TEX}/hat_basecolor.png')
setmat(hat, mat('hat', f'{TEX}/hat_basecolor.png' if hat_tex else f'{TEX}/suit_diffuse.png', f'{TEX}/hat_normal.png' if hat_tex else None,
                rough=0.9, orm=f'{TEX}/hat_orm.png' if hat_tex else None, spec=0.3))
# rename for the game
names = {'body': 'Body', 'high-poly': 'Eyes', 'eyebrow001': 'Brows', 'eyelashes01': 'Lashes', 'short02': 'Hair', 'male_casualsuit06': 'Clothes', 'shoes02': 'Shoes'}
for k, o in meshes.items(): o.name = names[k]; o.data.name = names[k]
for o in list(meshes.values()) + [hat]:
    print('MESH', o.name, 'faces', len(o.data.polygons), 'verts', len(o.data.vertices), 'groups', len(o.vertex_groups))
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/farmer.blend')
for x in ctx.view_layer.objects: x.select_set(False)
bpy.ops.export_scene.gltf(filepath=f'{OUT}/farmer_raw.glb', export_format='GLB', export_yup=True, export_apply=True,
                          export_skins=True, export_animations=False, export_morph=False, export_texcoords=True, export_normals=True,
                          export_tangents=False, export_materials='EXPORT', export_image_format='AUTO', export_cameras=False, export_lights=False,
                          export_rest_position_armature=True)
print('GLB', os.path.getsize(f'{OUT}/farmer_raw.glb') // 1024, 'KB')
