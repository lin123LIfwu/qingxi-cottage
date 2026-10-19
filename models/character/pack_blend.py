# Pack every texture of farmer.blend as WebP (hat normal map at 1024 px) and save a compressed,
# self-contained copy:  blender -b out/farmer.blend --python pack_blend.py -- out/farmer_packed.blend /tmp/fwebp
import bpy, sys, os, subprocess
argv = sys.argv[sys.argv.index('--') + 1:]
dst, tmp = argv[0], argv[1]
os.makedirs(tmp, exist_ok=True)
for im in list(bpy.data.images):
    if im.source != 'FILE' or im.users == 0: continue
    src = bpy.path.abspath(im.filepath)
    name = os.path.splitext(os.path.basename(src))[0]
    if name.startswith('young_lightskinned_male'): name = 'skin_diffuse'
    webp = os.path.join(tmp, name + '.webp')
    q = 95 if 'normal' in name else 90
    size = 1024 if name == 'hat_normal' else 0
    subprocess.run(['python3', '-c', f"from PIL import Image;im=Image.open({src!r});im=im.resize(({size},{size}),Image.LANCZOS) if {size} else im;im.save({webp!r},'WEBP',quality={q},method=6)"], check=True)
    cs = im.colorspace_settings.name; am = im.alpha_mode
    im.filepath = webp; im.name = name + '.webp'
    im.reload(); im.colorspace_settings.name = cs; im.alpha_mode = am
    im.pack()
    im.filepath_raw = '//textures/' + name + '.webp'
    print('PACK', name, os.path.getsize(src) // 1024, '->', os.path.getsize(webp) // 1024, 'KB')
bpy.ops.wm.save_as_mainfile(filepath=dst, compress=True, relative_remap=False)
print('SAVED', dst, os.path.getsize(dst) // 1024, 'KB')
