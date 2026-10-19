# Seed-packet print art (system python + PIL). Atlas 1024x768: left half = front, right half = back (mirrored u).
# Also: ink mask (for roughness) and the default crop icon decal.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np, math, random, sys
import os
OUTD = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src_tex')
W, H = 1024, 768
FSC = '/usr/share/fonts/google-noto-cjk/NotoSansSC-%s.otf'
EMO = '/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf'
def font(style, size): return ImageFont.truetype(FSC % style, size)
def ypx(z): return (0.112 - z) / 0.142 * H                 # packet z (m) -> image row
def xf(x): return (x + 0.047) / 0.094 * 512                  # front column
def xb(x): return 512 + (0.047 - x) / 0.094 * 512            # back column

rng = np.random.default_rng(7)
def kraft():
    base = np.array([200, 166, 118], np.float32)
    n = rng.normal(0, 1, (H // 4, W // 4)).astype(np.float32)
    n = np.array(Image.fromarray(((n * 20) + 128).clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2)), np.float32) - 128
    fib = rng.normal(0, 1, (H, W)).astype(np.float32) * 5
    a = base[None, None, :] + (n * 0.35 + fib)[..., None] * np.array([1.0, 0.9, 0.75])[None, None, :]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGB')

col = kraft(); ink = Image.new('L', (W, H), 0)
dc, di = ImageDraw.Draw(col), ImageDraw.Draw(ink)
def both(fn, *a, inkv=255, **k):
    fn(dc)(*a, **k)
    k2 = dict(k)
    for key in ('fill', 'outline'):
        if key in k2 and k2[key] is not None: k2[key] = inkv
    fn(di)(*a, **k2)
def text(d, xy, s, f, fill, anchor='mm', inkv=255):
    dc.text(xy, s, font=f, fill=fill, anchor=anchor); di.text(xy, s, font=f, fill=inkv, anchor=anchor)

# crimp bands (both halves): slightly darker kraft with pressed vertical ridges
cz0 = ypx(0.096)
for x0 in (0, 512):
    for i in range(0, 512, 6):
        dc.rectangle([x0 + i, 0, x0 + i + 2, cz0], fill=(176, 142, 98)); dc.rectangle([x0 + i + 3, 0, x0 + i + 4, cz0], fill=(206, 174, 128))
    dc.line([x0, cz0, x0 + 512, cz0], fill=(150, 118, 80), width=2)

# ---------------- front
L, R = xf(-0.0425), xf(0.0425); T, B = ypx(0.093), ypx(-0.026)
both(lambda d: d.rounded_rectangle, [L, T, R, B], radius=18, fill=(243, 232, 207))
both(lambda d: d.rounded_rectangle, [L + 9, T + 9, R - 9, B - 9], radius=12, outline=(180, 138, 85), width=3, inkv=255)
gb = T + 92
both(lambda d: d.rounded_rectangle, [L + 9, T + 9, R - 9, gb], radius=12, fill=(111, 159, 76))
dc.rectangle([L + 9, gb - 14, R - 9, gb], fill=(111, 159, 76))
text(dc, ((L + R) / 2, (T + 9 + gb) / 2 + 2), 'S E E D S', font('Black', 44), (255, 252, 240))
for sx in (L + 40, R - 40):     # little leaf ornaments
    dc.ellipse([sx - 10, (T + gb) / 2 - 6, sx + 10, (T + gb) / 2 + 8], fill=(160, 201, 112))
cx, cy, cr = 256, ypx(0.040), 0.0215 / 0.142 * H
both(lambda d: d.ellipse, [cx - cr, cy - cr, cx + cr, cy + cr], fill=(251, 245, 230))
both(lambda d: d.ellipse, [cx - cr, cy - cr, cx + cr, cy + cr], outline=(160, 122, 74), width=5)
for k in range(48):            # dotted inner ring
    a = k / 48 * math.tau; rr = cr - 13
    px, py = cx + rr * math.cos(a), cy + rr * math.sin(a)
    both(lambda d: d.ellipse, [px - 2.2, py - 2.2, px + 2.2, py + 2.2], fill=(200, 172, 128))
text(dc, (256, ypx(0.0045)), '种  子', font('Bold', 60), (107, 74, 44))
text(dc, (256, ypx(-0.0055)), '青溪小筑 · 精选良种', font('Medium', 23), (138, 106, 72))
bb = ypx(-0.0135)
both(lambda d: d.rectangle, [L + 9, bb, R - 9, B - 20], fill=(229, 212, 172))
both(lambda d: d.rounded_rectangle, [L + 9, B - 40, R - 9, B - 9], radius=12, fill=(229, 212, 172))
text(dc, (256, (bb + B - 9) / 2), '净含量 5 g   ·   当季播种', font('Medium', 22), (107, 74, 44))

# ---------------- back (printed straight onto the kraft in brown ink)
INK = (88, 58, 32)
text(dc, (768, ypx(0.086)), '播 种 指 南', font('Bold', 40), INK)
both(lambda d: d.line, [560, ypx(0.0795), 976, ypx(0.0795)], fill=INK, width=3)
steps = ['① 松土：翻耕土壤，耙平地面', '② 播种：每穴 2–3 粒，覆土 1 厘米', '③ 浇水：保持土壤湿润', '④ 照料：每日浇水，耐心等待', '⑤ 收获：成熟后及时采收']
for i, s in enumerate(steps):
    text(dc, (560, ypx(0.0705 - i * 0.0083)), s, font('Regular', 25), INK, anchor='lm')
tb, tt = ypx(0.0255), ypx(0.0095)
both(lambda d: d.rectangle, [560, tb, 976, tt], outline=INK, width=2)
both(lambda d: d.line, [768, tb, 768, tt], fill=INK, width=2)
text(dc, (664, (tb + tt) / 2), '发芽  3–5 天', font('Medium', 24), INK)
text(dc, (872, (tb + tt) / 2), '光照  充足', font('Medium', 24), INK)
# barcode
random.seed(3); x = 572; y0, y1 = ypx(0.0035), ypx(-0.0125)
while x < 790:
    w = random.choice((2, 2, 3, 4, 5)); both(lambda d: d.rectangle, [x, y0, x + w - 1, y1], fill=(30, 22, 16)); x += w + random.choice((2, 3, 4))
text(dc, (681, ypx(-0.0158)), '6 920250 101010', font('Regular', 19), INK)
text(dc, (768, ypx(-0.0228)), '批号 QX-2025 · 保质期 24 个月', font('Regular', 20), INK)
# red "青溪" seal stamp, slightly rotated and patchy
st = Image.new('RGBA', (140, 140), (0, 0, 0, 0)); sd = ImageDraw.Draw(st)
sd.rounded_rectangle([8, 8, 132, 132], radius=14, outline=(168, 64, 44, 255), width=7)
sd.text((70, 72), '青溪', font=font('Black', 46), fill=(168, 64, 44, 255), anchor='mm')
alpha = np.array(st.split()[3], np.float32) * (0.55 + 0.45 * (rng.random((140, 140)) > 0.25))
st.putalpha(Image.fromarray(alpha.clip(0, 255).astype(np.uint8)))
st = st.rotate(-12, resample=Image.BICUBIC, expand=True)
col.paste(st, (850, int(ypx(0.005))), st)
ink.paste(Image.new('L', st.size, 200), (850, int(ypx(0.005))), st)

col.save(f'{OUTD}/packet_print.png'); ink.save(f'{OUTD}/packet_ink.png')

# ---------------- crop icon decal (default 🌱), transparent RGBA
def icon(ch, path, size=256):
    f = ImageFont.truetype(EMO, 109, layout_engine=ImageFont.Layout.BASIC)
    g = Image.new('RGBA', (160, 160), (0, 0, 0, 0)); ImageDraw.Draw(g).text((80, 80), ch, font=f, embedded_color=True, anchor='mm')
    bb = g.getbbox(); g = g.crop(bb)
    s = 0.74 * size / max(g.size); g = g.resize((max(1, int(g.width * s)), max(1, int(g.height * s))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0)); out.paste(g, ((size - g.width) // 2, (size - g.height) // 2), g)
    out.save(path)
icon('🌱', f'{OUTD}/packet_icon.png')
print('ok', col.size)
