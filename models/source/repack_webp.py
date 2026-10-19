# open a packed tool .blend, re-pack every image as high-quality WebP (smaller repo files), save compressed
import bpy, sys, os, subprocess
argv = sys.argv[sys.argv.index('--') + 1:]
dst, tmp = argv[0], argv[1]
os.makedirs(tmp, exist_ok=True)
for im in list(bpy.data.images):
    if im.source != 'FILE' or not im.packed_file: continue
    name = im.name.rsplit('.', 1)[0]
    png = os.path.join(tmp, name + '.png'); webp = os.path.join(tmp, name + '.webp')
    with open(png, 'wb') as f: f.write(im.packed_file.data)
    q = '95' if 'normal' in name else '92'
    lossless = 'icon' in name
    subprocess.run(['python3', '-c', f"from PIL import Image;im=Image.open({png!r});im.save({webp!r},'WEBP',quality={q},method=6,lossless={lossless})"], check=True)
    cs = im.colorspace_settings.name; am = im.alpha_mode
    im.unpack(method='REMOVE')
    im.filepath = webp; im.name = name + '.webp'
    im.reload(); im.colorspace_settings.name = cs; im.alpha_mode = am
    im.pack()
    im.filepath_raw = '//textures/' + name + '.webp'
    print(name, os.path.getsize(png)//1024, '->', os.path.getsize(webp)//1024, 'KB')
bpy.ops.wm.save_as_mainfile(filepath=dst, compress=True, relative_remap=False)
print('saved', dst, os.path.getsize(dst)//1024, 'KB')
