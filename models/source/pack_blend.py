# open a tool .blend, pack all external images into it, drop temporary bake images, save into the delivery folder
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
dst = argv[0]
for im in list(bpy.data.images):
    if im.name.startswith('_bk_') or (im.users == 0 and not im.use_fake_user): bpy.data.images.remove(im)
bpy.ops.file.pack_all()
os.makedirs(os.path.dirname(dst), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=dst, compress=True)
print('packed ->', dst, os.path.getsize(dst) // 1024, 'KB')
