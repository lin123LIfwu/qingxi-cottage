# Step 1: generate the MakeHuman character with MPFB (headless) and save a working .blend
import bpy, sys, os, json
bpy.ops.preferences.addon_enable(module='bl_ext.user_default.mpfb')
from bl_ext.user_default.mpfb.services.humanservice import HumanService
OUT = '/data/char/out'
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
hi = HumanService._create_default_human_info_dict()
hi['phenotype'] = {'gender': 1.0, 'age': 0.5, 'muscle': 0.62, 'weight': 0.48, 'proportions': 0.75, 'height': 0.56,
                   'cupsize': 0.5, 'firmness': 0.5, 'race': {'asian': 0.82, 'caucasian': 0.18, 'african': 0.0}}
hi['skin_mhmat'] = 'young_asian_male.mhmat'
hi['skin_material_type'] = 'MAKESKIN'
hi['eyes'] = 'high-poly.mhclo'
hi['eyes_material_type'] = 'MAKESKIN'
hi['eyes_material_settings'] = {}
hi['eyebrows'] = 'eyebrow001.mhclo'
hi['eyelashes'] = 'eyelashes01.mhclo'
hi['hair'] = 'short02.mhclo'
hi['teeth'] = ''
hi['tongue'] = ''
hi['clothes'] = ['male_casualsuit06.mhclo', 'shoes02.mhclo']
hi['rig'] = 'game_engine'
hi['alternative_materials'] = {}
hi['name'] = 'Farmer'
st = HumanService.get_default_deserialization_settings()
st['subdiv_levels'] = 0
st['material_instances'] = 'NEVER'
bm = HumanService.deserialize_from_dict(hi, st)
info = {}
for o in bpy.data.objects:
    d = {'type': o.type, 'parent': o.parent.name if o.parent else None}
    if o.type == 'MESH':
        d['verts'] = len(o.data.vertices); d['faces'] = len(o.data.polygons)
        d['mats'] = [m.name for m in o.data.materials if m]
        d['mods'] = [(m.type, m.name) for m in o.modifiers]
        d['vgroups'] = len(o.vertex_groups)
        d['shapekeys'] = len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0
    if o.type == 'ARMATURE':
        d['bones'] = len(o.data.bones)
    d['dims'] = [round(x, 3) for x in o.dimensions]
    info[o.name] = d
print('INFO', json.dumps(info, indent=1))
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/human_raw.blend')
