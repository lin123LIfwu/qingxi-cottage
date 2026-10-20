#!/usr/bin/env python3
"""decode.py 的逆操作：把文件编码成 base64 文本（超过 100 万字符就拆成几段），并更新 checksums.md5。

GitHub 网页接口只能提交文本、单次提交也不能太大，所以仓库里的游戏单文件、Blender 工程和 GLB 都这样存放。
用法（在 models/ 目录里运行，路径相对当前目录）：
    python3 encode.py ../dist/青溪小筑.html        # → ../dist/青溪小筑.html.b64.part1 … part5
    python3 encode.py blend/hoe.blend glb/hoe.glb  # 不超过一段的直接写成 xxx.b64
重新编码后段数变少时，记得把仓库里多出来的旧分段删掉。
"""
import base64, glob, hashlib, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SUMS = os.path.join(HERE, 'checksums.md5')
PART = 1_000_000      # 每段字符数（4 的倍数，每段都是完整的 base64 块）


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    sums = {}
    if os.path.exists(SUMS):
        for line in open(SUMS, encoding='utf-8'):
            if line.strip() and not line.startswith('#'):
                h, name = line.strip().split(None, 1)
                sums[name.lstrip('*')] = h
    for src in sys.argv[1:]:
        src = os.path.abspath(src)
        data = open(src, 'rb').read()
        text = base64.b64encode(data)
        for old in glob.glob(glob.escape(src) + '.b64') + glob.glob(glob.escape(src) + '.b64.part*'):
            os.remove(old)
        chunks = [text[i:i + PART] for i in range(0, len(text), PART)]
        if len(chunks) == 1:
            open(src + '.b64', 'wb').write(chunks[0])
        else:
            for i, c in enumerate(chunks, 1):
                open(f'{src}.b64.part{i}', 'wb').write(c)
        name = os.path.relpath(src, ROOT).replace(os.sep, '/')
        sums[name] = hashlib.md5(data).hexdigest()
        print(f'{name:30s} {len(data) / 1024:7.0f} KB → {len(chunks)} 段')
    with open(SUMS, 'w', encoding='utf-8', newline='\n') as f:
        for name in sorted(sums):
            f.write(f'{sums[name]}  {name}\n')


if __name__ == '__main__':
    main()
