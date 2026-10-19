# Crop icon decals for the seed packet (system python + PIL + Noto Color Emoji), same layout as packet_icon.png
from PIL import Image, ImageDraw, ImageFont
import os, sys
EMO = '/usr/share/fonts/google-noto-emoji/NotoColorEmoji.ttf'
OUTD = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src_tex', 'icons')
os.makedirs(OUTD, exist_ok=True)
CROPS = {'bokchoy': '🥬', 'carrot': '🥕', 'strawberry': '🍓', 'tomato': '🍅', 'corn': '🌽', 'pumpkin': '🎃', 'sprout': '🌱'}
def icon(ch, path, size=256):
    f = ImageFont.truetype(EMO, 109, layout_engine=ImageFont.Layout.BASIC)
    g = Image.new('RGBA', (160, 160), (0, 0, 0, 0)); ImageDraw.Draw(g).text((80, 80), ch, font=f, embedded_color=True, anchor='mm')
    g = g.crop(g.getbbox())
    s = 0.74 * size / max(g.size); g = g.resize((max(1, int(g.width * s)), max(1, int(g.height * s))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0)); out.paste(g, ((size - g.width) // 2, (size - g.height) // 2), g)
    out.save(path, 'WEBP', quality=88, method=6)
for k, ch in CROPS.items(): icon(ch, os.path.join(OUTD, k + '.webp'))
print('icons ->', OUTD, sorted(os.listdir(OUTD)))
