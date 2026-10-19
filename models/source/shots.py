# Preview renders from the saved .blend files (what you see = the baked, game-ready asset).
# usage: blender -b out/<tool>.blend -P shots.py -- <tool> [preview]
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
TOOL = argv[0]; PREVIEW = 'preview' in argv
sc = bpy.context.scene
def orbit(target, dist, az, el):
    a, e = math.radians(az), math.radians(el); t = V(target)
    return tuple(t + V((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist)
def shot(name, res, target, dist, az, el, lens):
    sc.render.resolution_x, sc.render.resolution_y = res
    camera(orbit(target, dist, az, el), target, lens=lens)
    if PREVIEW: sc.render.resolution_percentage = 40; sc.cycles.samples = 8
    render(f'{OUT}/{TOOL}_{name}.png')
def world_of(o, local): return o.matrix_world @ V(local)
def shot_at(name, res, cam, target, lens):
    sc.render.resolution_x, sc.render.resolution_y = res
    camera(tuple(cam), tuple(target), lens=lens)
    if PREVIEW: sc.render.resolution_percentage = 40; sc.cycles.samples = 8
    render(f'{OUT}/{TOOL}_{name}.png')

if TOOL == 'hoe':
    o = bpy.data.objects['Hoe']
    studio(res=(640, 900), samples=48, sun_rot=(52, 0, 40))
    o.rotation_euler = (0, 0, math.radians(-135)); o.location = (0, 0, 0.128)
    bpy.context.view_layer.update()
    shot('full', (640, 900), (0.07, 0, 0.6), 1.9, 18, 20, 50)
    c = world_of(o, (0, 0.012 + 0.09 * math.cos(0.4), 0.8835 - 0.09 * math.sin(0.4)))
    shot('head', (900, 900), tuple(c), 0.62, 12, 34, 60)

if TOOL == 'can':
    o = bpy.data.objects['WateringCan']
    studio(res=(1100, 900), samples=48, sun_rot=(52, 0, 40))
    o.rotation_euler = (0, 0, math.radians(-122)); o.location = (0, 0, 0.3175)
    bpy.context.view_layer.update()
    shot('full', (1100, 900), (0.07, 0.0, 0.17), 1.12, 14, 17, 50)
    tl = V((0, 0.2, -0.035)); dl = V((0.45, 0.75, 0.55)).normalized()
    shot_at('top', (900, 900), world_of(o, tl + dl * 0.72), world_of(o, tl), 50)

if TOOL == 'rod':
    o = bpy.data.objects['RodBase']
    studio(res=(1600, 600), samples=48, sun_rot=(52, 0, 40))
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Matrix(((0, 0, -1), (1, 0, 0), (0, -1, 0))).to_quaternion()   # rod -> -X, reel down, crank towards camera
    o.location = (0.655, 0, 0.105)
    bpy.context.view_layer.update()
    mid = world_of(o, (0, 0, 0.66))
    shot_at('full', (1600, 600), mid + V((-0.12, -2.75, 0.62)), mid + V((0, 0, -0.02)), 50)
    rc = world_of(o, (0, 0.05, 0.0))
    shot_at('reel', (900, 900), rc + V((0.13, -0.36, 0.14)), rc + V((0.0, 0.0, -0.005)), 55)
    gc = world_of(o, (0, 0.008, 0.585))
    shot_at('guide', (900, 600), gc + V((0.05, -0.22, 0.08)), gc, 60)

if TOOL == 'packet':
    o = bpy.data.objects['Packet']
    studio(res=(700, 900), samples=48, sun_rot=(50, 0, 25))
    o.rotation_euler = (math.radians(-9), 0, math.radians(14)); o.location = (0, 0, 0.0305)
    bpy.context.view_layer.update()
    c = world_of(o, (0, 0, 0.041))
    shot('front', (700, 900), tuple(c), 0.44, -22, 12, 60)
    o.rotation_euler = (math.radians(-9), 0, math.radians(180 - 14)); bpy.context.view_layer.update()
    shot('back', (700, 900), tuple(world_of(o, (0, 0, 0.041))), 0.44, 20, 14, 60)
