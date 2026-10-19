#!/bin/bash
# 一键重建四件工具：印刷图 → 建模 + 程序化材质 + 烘焙 + 导出 GLB → Cycles 预览渲染
# 用法：BLENDER=/path/to/blender ./build_all.sh      （Blender 4.5；系统 python3 需 Pillow + numpy）
# 机器内存小的话请保持顺序执行（每次只开一个 Blender）。
set -e
cd "$(dirname "$0")"
B=${BLENDER:-blender}
python3 packet_art.py
for t in hoe can rod packet; do "$B" -b -noaudio --factory-startup -P $t.py; done
for t in hoe can rod packet; do "$B" -b out/$t.blend -noaudio -P shots.py -- $t; done
echo "完成：输出在 source/out/"
