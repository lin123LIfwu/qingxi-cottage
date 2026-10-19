# 系统 python：拼接展示图
from PIL import Image, ImageDraw, ImageFont
import os
O = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
FM = '/usr/share/fonts/google-noto-cjk/NotoSansSC-Medium.otf'
FR = '/usr/share/fonts/google-noto-cjk/NotoSansSC-Regular.otf'
if not os.path.exists(FR): FR = FM
def L(n): return Image.open(f'{O}/{n}').convert('RGB')
def cap(im, xy, title, sub=None, s=1.0):
    d = ImageDraw.Draw(im, 'RGBA')
    f1 = ImageFont.truetype(FM, int(40 * s)); f2 = ImageFont.truetype(FR, int(24 * s))
    x, y = xy
    d.text((x, y), title, font=f1, fill=(58, 54, 48, 255))
    if sub: d.text((x + 2, y + int(52 * s)), sub, font=f2, fill=(96, 90, 82, 255))

# ---------- 总览 ----------
hoe, can, pk = L('hoe_full.png'), L('can_full.png'), L('packet_front.png')
rod = L('rod_full.png').crop((0, 170, 1600, 430))
W = hoe.width + can.width + pk.width
rod = rod.resize((W, int(rod.height * W / rod.width)), Image.LANCZOS)
ov = Image.new('RGB', (W, 900 + rod.height), (206, 202, 196))
ov.paste(hoe, (0, 0)); ov.paste(can, (hoe.width, 0)); ov.paste(pk, (hoe.width + can.width, 0)); ov.paste(rod, (0, 900))
cap(ov, (36, 790), '锄头', '3,752 面 · 307 KB')
cap(ov, (hoe.width + 36, 790), '水壶', '10,244 面 · 508 KB')
cap(ov, (hoe.width + can.width + 36, 790), '种子袋', '4,360 面 · 384 KB')
cap(ov, (36, 900 + rod.height - 120), '鱼竿（三节竹竿 + 纺车轮）', '10,894 面 · 571 KB')
ov = ov.resize((int(W * 0.62), int(ov.height * 0.62)), Image.LANCZOS)
ov.save(os.path.join(O, '展示_总览.png'))

# ---------- 细节 ----------
T = 600
def sq(im, box=None):
    if box: im = im.crop(box)
    return im.resize((T, T), Image.LANCZOS)
tiles = [
    (sq(L('hoe_head.png')), '锄头 · 锻铁锄头与木柄'),
    (sq(L('can_top.png')), '水壶 · 黄铜莲蓬头 91 孔'),
    (sq(L('rod_reel.png')), '鱼竿 · 纺车轮与软木握把'),
    (sq(L('rod_guide.png'), (150, 0, 750, 600)), '鱼竿 · 丝线缠绕与导环'),
    (sq(L('packet_back.png'), (0, 100, 700, 800)), '种子袋 · 背面播种指南'),
]
# 第 6 格：四张烘焙 BaseColor 贴图
atl = Image.new('RGB', (T, T), (206, 202, 196))
for i, n in enumerate(['hoe', 'can', 'rod', 'packet']):
    a = L(f'{n}_basecolor.png'); a.thumbnail((290, 290), Image.LANCZOS)
    cx, cy = (i % 2) * 300 + 5, (i // 2) * 300 + 5
    atl.paste(a, (cx + (290 - a.width) // 2, cy + (290 - a.height) // 2))
tiles.append((atl, '烘焙贴图（BaseColor）'))
de = Image.new('RGB', (T * 3 + 8 * 2, T * 2 + 8), (240, 238, 234))
for i, (im, t) in enumerate(tiles):
    x, y = (i % 3) * (T + 8), (i // 3) * (T + 8)
    de.paste(im, (x, y))
    d = ImageDraw.Draw(de, 'RGBA'); f = ImageFont.truetype(FM, 26)
    tw = d.textlength(t, font=f)
    d.rounded_rectangle((x + 14, y + T - 56, x + 14 + tw + 28, y + T - 14), 10, fill=(250, 248, 244, 215))
    d.text((x + 28, y + T - 53), t, font=f, fill=(58, 54, 48, 255))
de.save(os.path.join(O, '展示_细节.png'))

# ---------- three.js ----------
th = L('threejs_lineup.png').crop((150, 70, 1150, 640))
d = ImageDraw.Draw(th, 'RGBA'); f = ImageFont.truetype(FM, 24)
t = 'three.js r186 实时加载检查：4 个 GLB · 0 报错 · 粉点 = 出水口/竿梢/摇柄标记点'
tw = d.textlength(t, font=f)
d.rounded_rectangle((16, 16, 16 + tw + 28, 58), 10, fill=(250, 248, 244, 220))
d.text((30, 18), t, font=f, fill=(58, 54, 48, 255))
th.save(os.path.join(O, '展示_threejs.png'))
for n in ['展示_总览.png', '展示_细节.png', '展示_threejs.png']:
    print(n, Image.open(os.path.join(O, n)).size, os.path.getsize(os.path.join(O, n)) // 1024, 'KB')
