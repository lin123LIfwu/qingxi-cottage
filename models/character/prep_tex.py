# Texture prep for the farmer: remove MakeHuman logos from the tee, recolour it, bake the clothes AO into
# the colour map, darken the hair. Output -> /data/char/tex
import numpy as np, cv2, os, sys
from PIL import Image
D = os.path.expanduser('~/.config/blender/4.5/extensions/.user/user_default/mpfb/data')
OUT = '/data/char/tex'
TEE = np.array([float(x) for x in (sys.argv[1] if len(sys.argv) > 1 else '0.47,0.53,0.40').split(',')])
rd = lambda p: np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
a = rd(f'{D}/clothes/male_casualsuit06/male_casualsuit06_diffuse.png')
ao = rd(f'{D}/clothes/male_casualsuit06/male_casualsuit06_ao.png')[..., 0]
H, W = a.shape[:2]
top = np.zeros((H, W), bool); top[:int(0.43 * H)] = True
shirt = top          # the tee's cloth grey is the same 207 grey as the unused atlas space, so tint the whole band
mx, mn = a.max(2), a.min(2); sat = (mx - mn) / np.maximum(mx, 1e-4); lum = a @ np.array([0.299, 0.587, 0.114])
logo = np.zeros((H, W), bool)
for (x0, y0, x1, y1) in [(195, 110, 305, 170), (450, 115, 645, 210), (735, 140, 785, 195)]:   # boxes in 1024 px
    sl = (slice(y0 * H // 1024, y1 * H // 1024), slice(x0 * W // 1024, x1 * W // 1024))
    logo[sl] = (sat[sl] > 0.08) | (lum[sl] < 0.72)
logo = cv2.dilate(logo.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
logo &= shirt
src = (np.clip(a, 0, 1) * 255).astype(np.uint8)
inp = cv2.inpaint(cv2.cvtColor(src, cv2.COLOR_RGB2BGR), logo.astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA)
a = cv2.cvtColor(inp, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
lum = a @ np.array([0.299, 0.587, 0.114])
# recolour: keep the folds (luminance relative to the cloth white), add a faint heather (melange) noise
ref = 207 / 255
rng = np.random.default_rng(3)
n = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), 0.8)
heather = 1 + 0.035 * n
shade = np.clip(lum / ref, 0, 1.15)[..., None] * heather[..., None]
tint = np.clip(TEE[None, None, :] * shade, 0, 1)
m = shirt[..., None].astype(np.float32)
a = a * (1 - m) + tint * m
# jeans: tame the bleached stonewash fades (divide out most of the large-scale brightness), deeper indigo
jeans = np.zeros((H, W), bool); jeans[int(0.43 * H):] = True
jsat = (a.max(2) - a.min(2)) / np.maximum(a.max(2), 1e-4)
lum0 = a @ np.array([0.299, 0.587, 0.114])
greyish = (jsat < 0.06) & (np.abs(lum0 - 0.81) < 0.06) & jeans
ncc, lab = cv2.connectedComponents(greyish.astype(np.uint8))
big = [i for i in range(1, ncc) if (lab == i).sum() > 0.02 * H * W]  # the large flat atlas background only
bgm = np.isin(lab, big)
bgm = cv2.morphologyEx(bgm.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
den = jeans & ~bgm                                             # the denim itself (incl. bleached fades)
lumj = a @ np.array([0.299, 0.587, 0.114])
wsum = cv2.GaussianBlur(den.astype(np.float32), (0, 0), H / 40) + 1e-4
lowl = cv2.GaussianBlur(np.where(den, lumj, 0).astype(np.float32), (0, 0), H / 40) / wsum
meanl = float(lumj[den].mean())
gain = np.clip((meanl / np.maximum(lowl, 1e-3)) ** 0.72, 0.6, 1.25) * 0.86
dn = np.clip(a * gain[..., None], 0, 1)
dn = dn * np.array([0.92, 0.97, 1.04])                        # slightly cooler, richer indigo
dm = cv2.GaussianBlur(den.astype(np.float32), (0, 0), 2.0)[..., None]
a = a * (1 - dm) + np.clip(dn, 0, 1) * dm
# clothes AO into the colour (soft)
a = a * (0.45 + 0.55 * ao[..., None]) ** 0.8
Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/suit_diffuse.png')
Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((1024, 1024)).save(f'{OUT}/suit_preview.jpg', quality=85)
# hair: darker, cooler brown-black
h = Image.open(f'{D}/hair/short02/short02_diffuse.png').convert('RGBA'); ha = np.asarray(h).astype(np.float32) / 255
ha[..., :3] = np.clip(ha[..., :3] * np.array([0.42, 0.38, 0.35]) + 0.012, 0, 1)
Image.fromarray((ha * 255).astype(np.uint8)).save(f'{OUT}/hair_diffuse.png')
print('logo px', int(logo.sum()), 'shirt ref lum', round(float(ref), 3), 'tee', TEE)
# eyes: the stock "brown" iris is reddish -> deep East-Asian brown; sclera a touch less white
e = Image.open(f'{D}/eyes/materials/brown_eye.png').convert('RGBA'); ea = np.asarray(e).astype(np.float32) / 255
rgb = ea[..., :3]; mx = rgb.max(-1); mn = rgb.min(-1); sat = (mx - mn) / np.maximum(mx, 1e-4)
iris = np.clip((sat - 0.25) / 0.25, 0, 1)[..., None]
lumi = (rgb @ np.array([0.299, 0.587, 0.114]))[..., None]
brown = np.clip(np.array([0.36, 0.22, 0.13]) * (lumi / 0.30) ** 0.9, 0, 1)
rgb = rgb * (1 - iris) + brown * iris
rgb = rgb * (1 - 0.06 * (1 - iris)) * np.array([1.0, 0.985, 0.965])
ea[..., :3] = rgb
Image.fromarray((np.clip(ea, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/eye_diffuse.png')
# lashes: the stock strip is mascara-heavy -> thinner, a bit lighter
l = Image.open(f'{D}/eyelashes/eyelashes01/eyelashes01.png').convert('RGBA'); la = np.asarray(l).astype(np.float32) / 255
la[..., 3] = la[..., 3] ** 1.6 * 0.8; la[..., :3] = np.clip(la[..., :3] * 0.6 + 0.06, 0, 1)
Image.fromarray((np.clip(la, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/lash_diffuse.png')
