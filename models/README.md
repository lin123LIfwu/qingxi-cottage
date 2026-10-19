# 青溪小筑 · 模型源文件

游戏里用到的 3D 模型的源文件。全部在 **Blender 4.5** 里用 Python 脚本程序化建模、程序化材质，再烘焙成 PBR 贴图并导出 glTF（GLB）。

![四件工具总览](preview/overview.svg)

![细节特写](preview/details.svg)

![three.js 实时渲染](preview/threejs.svg)

## 目录

```
models/
  blend/*.blend.b64     Blender 工程（贴图已打包进文件，WebP 格式）
  glb/*.glb.b64         Blender 直接导出的 GLB（完整精度，可导入其他引擎 / 软件）
  source/               全部生成脚本：改参数后重新生成模型和贴图
  game_export/          GLB → 游戏资源：压缩（Meshopt + WebP）并写成 src/assets/*.glb.js
  preview/              上面三张预览图
  decode.py             把 .b64 还原成 .blend / .glb
```

## 下载后先还原二进制文件

GitHub 网页接口只能提交文本，所以 `.blend` 和 `.glb` 以 base64 文本存放（内容完全一致，只是编码不同）。下载仓库后在 `models/` 目录运行：

```bash
python3 decode.py
```

就会在旁边生成 `blend/hoe.blend`、`glb/hoe.glb` 等文件，用 Blender 直接打开即可。
不想装 Python 也可以用系统自带命令：

| 系统 | 命令 |
|---|---|
| Windows | `certutil -decode hoe.blend.b64 hoe.blend` |
| macOS | `base64 -D -i hoe.blend.b64 -o hoe.blend` |
| Linux | `base64 -d hoe.blend.b64 > hoe.blend` |

## 通用约定

- 单位：米。坐标系是 glTF / three.js：**+Y 朝上**。
- **原点 = 手握的位置**，工具朝 **−Z** 方向伸出（第一人称和第三人称手持都按这个约定挂到手上）。
- 每件工具一张 1024 贴图集、一个材质（种子袋的作物图标另有一个透明材质）；贴图通道：
  `basecolor` 颜色（已乘入部分 AO）、`orm` R = AO / G = 粗糙度 / B = 金属度、`normal` 切线空间法线（OpenGL）。
- 材质开启了背面剔除（单面）。

## 各件规格

| 模型 | 面数 | 节点 | 说明 |
|---|---|---|---|
| 锄头 `hoe` | 3,752 | `Hoe` | 全长 106 cm，锄板宽 15.8 cm。白蜡木纹木柄、握手处包浆、柄端年轮；锻铁锄箍带锈；梯形铁锄板，锈斑 + 磨亮的刃口 |
| 水壶 `can` | 10,244 | `WateringCan` › `Spout` | 壶身高 34 cm，含壶嘴总长 60 cm，握点 = 提手顶端。青绿搪瓷壶身、加强筋和卷边、磕碰掉漆、底部泥渍、铆接提手、锡焊壶嘴、91 孔黄铜莲蓬头。`Spout` 是空节点（莲蓬头出水面外 6 mm），游戏用它发射水流粒子 |
| 鱼竿 `rod` | 10,894 | `RodBase` › `Crank` › `Knob`；`RodBase` › `Seg1` › `Seg2` › `Seg3` › `Tip` | 全长 191.5 cm。三节竹竿带竹节、红色丝线缠绕 + 金线收边、蛇形导环、软木握把、胡桃木轮座；纺车轮：墨绿轮体、金色线杯、鱼线。转 `Crank` 的 rotation.x 就是摇轮动画；给 `Seg1/2/3` 加一点 rotation.x 就能弯竿；`Tip` 是竿梢出线点 |
| 种子袋 `packet` | 4,360 | `Packet` › `Icon` | 9.4 × 14.2 cm。正面标签、背面播种指南、折痕、封口压纹。换作物只需替换 `Icon` 材质的贴图（256×256 透明图），游戏里会随所选种子自动切换 |

## 重新生成

需要：Blender 4.5（无界面模式即可）；系统 `python3` + Pillow + numpy；Noto Sans SC 和 Noto Color Emoji 字体（路径写在 `packet_art.py` 开头）。

```bash
cd source
BLENDER=/path/to/blender ./build_all.sh
```

或者单独做一件：

```bash
python3 packet_art.py                                   # 种子袋印刷图 → src_tex/
blender -b -noaudio --factory-startup -P hoe.py         # 建模 + 烘焙 + 导出 → out/hoe.glb、hoe.blend、贴图
blender -b out/hoe.blend -noaudio -P shots.py -- hoe    # Cycles 预览渲染 → out/hoe_*.png
```

`can` / `rod` / `packet` 同理（2 核 CPU 上每件几分钟）。脚本说明：

| 文件 | 作用 |
|---|---|
| `lib.py` | 公用工具：车削 / 扫掠建模、UV、程序化材质节点、烘焙、导出 |
| `hoe.py` `can.py` `rod.py` `packet.py` | 四件工具，尺寸参数都在文件开头 |
| `packet_art.py` | 种子袋的印刷图案（正面、背面、油墨遮罩、图标） |
| `shots.py` / `showcase.py` | Cycles 预览渲染机位 / 拼展示图 |
| `pack_blend.py` / `repack_webp.py` | 把贴图打包进 .blend / 改成 WebP 打包（仓库里的 .blend 就是这样缩小的） |
| `glbinfo.py` | 查看 GLB 的面数、贴图、节点 |
| `view/` | three.js 加载检查页（lineup.html + Playwright 截图脚本） |

注：`.blend` 里保留的是烘焙后的材质；程序化材质节点在脚本里，重新跑脚本就能得到无损原图。

## 放进游戏

游戏是单文件网页，模型以 base64 内嵌在 `src/assets/*.glb.js` 里。改完模型后：

```bash
cd game_export && npm install
LEVEL=high node pack.mjs ../source/out/hoe.glb out/hoe.glb 1024 512 512 82   # 压缩：贴图转 WebP 并缩小，网格 Meshopt 压缩
python3 crop_icons.py icons                                               # 种子袋作物图标
ICONS=icons node emit.mjs out/hoe.glb out/can.glb out/rod.glb out/packet.glb  # 写入 ../../src/assets/
cd ../.. && npm run build
```
