#!/usr/bin/env python3
"""把仓库里的 *.b64 文本还原成二进制文件（.blend / .glb）。

GitHub 网页接口只能提交文本，所以 Blender 工程和 GLB 以 base64 文本形式存放。
用法（在 models/ 目录里运行）：
    python3 decode.py            # 还原全部：blend/hoe.blend.b64 → blend/hoe.blend …
    python3 decode.py blend      # 只还原某个文件夹
不想装 Python 也可以用系统自带命令：
    Windows : certutil -decode hoe.blend.b64 hoe.blend
    macOS   : base64 -D -i hoe.blend.b64 -o hoe.blend
    Linux   : base64 -d hoe.blend.b64 > hoe.blend
"""
import base64, os, sys, glob

here = os.path.dirname(os.path.abspath(__file__))
dirs = sys.argv[1:] or ['.']
n = 0
for d in dirs:
    for src in sorted(glob.glob(os.path.join(here, d, '**', '*.b64'), recursive=True)):
        dst = src[:-4]
        with open(src, 'rb') as f:
            data = base64.b64decode(f.read())
        with open(dst, 'wb') as f:
            f.write(data)
        n += 1
        print(f'{os.path.relpath(dst, here):32s} {len(data) / 1024:8.0f} KB')
print(f'完成，共还原 {n} 个文件' if n else '没有找到 .b64 文件')
