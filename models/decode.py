#!/usr/bin/env python3
"""把仓库里的 *.b64 文本还原成二进制文件（.blend / .glb）。

GitHub 网页接口只能提交文本，所以 Blender 工程和 GLB 以 base64 文本形式存放；
较大的文件拆成了几段（xxx.b64.part1、xxx.b64.part2 …），本脚本会按顺序自动拼接。
用法（在 models/ 目录里运行）：
    python3 decode.py            # 还原全部：blend/hoe.blend.b64 → blend/hoe.blend …
    python3 decode.py blend      # 只还原某个文件夹
不想装 Python 也可以用系统自带命令：
    Windows : certutil -decode hoe.blend.b64 hoe.blend
    macOS   : base64 -D -i hoe.blend.b64 -o hoe.blend
    Linux   : base64 -d hoe.blend.b64 > hoe.blend
    分段文件先拼接：cat farmer.blend.b64.part* | base64 -d > farmer.blend
              （Windows：copy /b farmer.blend.b64.part1+farmer.blend.b64.part2+… farmer.blend.b64）
"""
import base64, os, re, sys, glob

here = os.path.dirname(os.path.abspath(__file__))
dirs = sys.argv[1:] or ['.']
groups = {}
for d in dirs:
    for src in glob.glob(os.path.join(here, d, '**', '*.b64*'), recursive=True):
        m = re.match(r'^(.*)\.b64(?:\.part(\d+))?$', src)
        if m:
            groups.setdefault(m.group(1), []).append((int(m.group(2) or 0), src))
n = 0
for dst, parts in sorted(groups.items()):
    parts.sort()
    text = b''.join(open(p, 'rb').read() for _, p in parts)
    data = base64.b64decode(text)
    with open(dst, 'wb') as f:
        f.write(data)
    n += 1
    tag = f'（{len(parts)} 段）' if len(parts) > 1 else ''
    print(f'{os.path.relpath(dst, here):32s} {len(data) / 1024:8.0f} KB {tag}')
print(f'完成，共还原 {n} 个文件' if n else '没有找到 .b64 文件')
