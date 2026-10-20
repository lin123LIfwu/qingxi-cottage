#!/usr/bin/env python3
"""把仓库里的 base64 文本还原成可以直接打开的文件，并校验 md5。

GitHub 网页接口只能提交文本，单个文件也不能太大，所以下面这些文件以 base64 文本存放，
较大的拆成了几段（xxx.b64.part1、xxx.b64.part2 …），本脚本会按顺序自动拼接：
    dist/青溪小筑.html        游戏本体（单文件网页，双击用浏览器打开就能玩）
    models/blend/*.blend     Blender 工程（Blender 4.5 打开）
    models/glb/*.glb         GLB 模型

用法（在 models/ 目录里运行；Windows 上把 python3 换成 python）：
    python3 decode.py            # 还原全部
    python3 decode.py game       # 只还原游戏
    python3 decode.py blend glb  # 只还原 Blender 工程 / GLB

不想装 Python 也可以用系统自带命令，分段文件先按 part1、part2 … 的顺序拼接：
    macOS / Linux : cat 青溪小筑.html.b64.part1 青溪小筑.html.b64.part2 … | base64 -d > 青溪小筑.html
                    （macOS 用 base64 -D；单个 .b64 文件不用拼接：base64 -d hoe.blend.b64 > hoe.blend）
    Windows       : copy /b 青溪小筑.html.b64.part1+青溪小筑.html.b64.part2+… 青溪小筑.html.b64
                    certutil -decode 青溪小筑.html.b64 青溪小筑.html
"""
import base64, binascii, glob, hashlib, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))       # models/
ROOT = os.path.dirname(HERE)                            # 仓库根目录
GROUPS = {'game': os.path.join(ROOT, 'dist'), 'blend': os.path.join(HERE, 'blend'), 'glb': os.path.join(HERE, 'glb')}
SUMS = os.path.join(HERE, 'checksums.md5')              # 标准 md5sum 格式，路径相对仓库根目录


def pad(s, n):
    w = sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)
    return s + ' ' * max(1, n - w)


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, '/')


def load_sums():
    sums = {}
    if os.path.exists(SUMS):
        for line in open(SUMS, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#'):
                h, name = line.split(None, 1)
                sums[name.lstrip('*')] = h.lower()
    return sums


def find(dirs):
    found = {}
    for d in dirs:
        for src in glob.glob(os.path.join(d, '**', '*.b64*'), recursive=True):
            m = re.match(r'^(.*)\.b64(?:\.part(\d+))?$', src)
            if m:
                found.setdefault(m.group(1), []).append((int(m.group(2) or 0), src))
    return found


def main():
    try:
        sys.stdout.reconfigure(errors='replace')   # 某些终端编码不支持中文时不至于报错
    except AttributeError:
        pass
    keys = sys.argv[1:] or list(GROUPS)
    dirs = []
    for k in keys:
        d = GROUPS.get(k) or os.path.join(HERE, k)
        if os.path.isdir(d):
            dirs.append(d)
        elif sys.argv[1:]:
            sys.exit(f'找不到“{k}”（可选：game blend glb）')
    sums, found = load_sums(), find(dirs)
    if not found:
        sys.exit('没有找到 .b64 文件')
    ok = bad = 0
    for dst, parts in sorted(found.items()):
        parts.sort()
        nums = [n for n, _ in parts]
        name = rel(dst)
        if nums != [0] and nums != list(range(1, len(nums) + 1)):
            missing = sorted(set(range(1, max(nums) + 1)) - set(nums))
            print(f'× {name}：分段不完整' + (f'，缺少第 {"、".join(map(str, missing))} 段' if missing else ''))
            bad += 1
            continue
        text = b''.join(open(p, 'rb').read() for _, p in parts)
        try:
            data = base64.b64decode(text)          # 自动忽略换行等非 base64 字符
        except (binascii.Error, ValueError) as e:
            print(f'× {name}：base64 内容损坏（{e}）')
            bad += 1
            continue
        md5 = hashlib.md5(data).hexdigest()
        want = sums.get(name)
        if want and want != md5:
            state = '× md5 不符，文件可能没下载完整（没有写出）'
            bad += 1
        else:
            with open(dst, 'wb') as f:
                f.write(data)
            state = '校验通过' if want else ''
            ok += 1
        segs = f'{len(parts)} 段' if len(parts) > 1 else ''
        print(f'{pad(name, 28)}{len(data) / 1024:6.0f} KB  {pad(segs, 5)}{state}')
    print(f'\n完成：还原 {ok} 个文件' + (f'，{bad} 个有问题（重新下载对应的 .b64 文件再运行一次）' if bad else '，全部正常。'))
    if os.path.join(ROOT, 'dist') in dirs and not bad:
        print('游戏：双击 dist/青溪小筑.html 用浏览器打开；.blend 用 Blender 4.5 打开；.glb 可以拖进 https://gltf-viewer.donmccurdy.com 查看。')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
