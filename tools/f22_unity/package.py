"""Assemble the Unity handoff without build caches or local application settings."""
import argparse,json,shutil,zipfile,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--out',default=str(ROOT/'exports'/'F22-Unity-URP'));p.add_argument('--delivery',required=True);a=p.parse_args()
out=Path(a.out);dest=Path(a.delivery);dest.mkdir(parents=True,exist_ok=True)
info=json.loads((out/'model-info.json').read_text())
readme=f'''# F-22 高细节模型 · Unity URP

## 导入（推荐）

1. 使用 Unity **2022.3 LTS / URP 14** 项目。本包使用 2022.3.62f3c1 + URP 14.0.11 生成。
2. 双击 `F22_URP_HighDetail.unitypackage`，导入 `Assets/GYRO_F22`。
3. 从 `Assets/GYRO_F22/Prefabs` 将 `F22_Flight_High`（飞行）或 `F22_GearDown_High`（起落架放下）拖到场景中。
4. 根物体 Scale 保持 `(1,1,1)`。预制体机头朝 **+Z**，上方 **+Y**；1 Unity 单位 = 1 米。
5. 可打开 `Assets/GYRO_F22/Scenes/F22_Showcase.unity` 查看展示场景。接收项目应已经启用 URP；导入不会修改项目的 Graphics / Quality 管线设置。附带 `Settings/F22_URP.asset` 供新工程选择。

材质与预制体已经生成，正常导入不需要运行脚本。若更改 FBX 后需要重新配材质，可以在菜单 `GYRO > F22 > Rebuild URP materials and prefabs` 执行；这会重建本包内的预制体和展示场景，请先另存自己的编辑。

## 尺寸与模型

- 实际几何外包长度：**{info['length_m']:.2f} m**；翼展：**{info['wingspan_m']:.2f} m**。
- 起落架放下的外包高度：**{info['gear_down_height_m']:.2f} m**。
- 飞行形态：**{info['flight_triangles']:,} 个三角面**。
- 起落架结构另有 **{info['landing_gear_triangles']:,} 个三角面**；放下形态合计 **{info['flight_triangles']+info['landing_gear_triangles']:,} 面**。
- 原点是机身基准点，展示形态放在地面时向上平移约 **{info['ground_offset_m']:.4f} m**。示例场景按实际轮胎位置落地。

这里的 **1:1 指真实米制整体尺寸**。外形以公开产品卡和实拍为参考；局部截面、座舱、起落架机构、管道、喷口内部与维修标记为美术重建，**不是官方制造 CAD，也不是扫描级逐点复刻**。机体以封闭舱门状态呈现；没有起落架收放、舵面或座舱动画，没有飞行动力学、碰撞体和 LOD。

## 细节与材质

连续机身曲面、平滑翼型与控制面间隙、双发动机背脊、外倾垂尾、带深度的进气道、矩形喷口瓣片/内衬/支杆；座舱含座椅、头枕、安全带、侧控制台与显示器；起落架含轮胎、轮毂、支柱、扭力连杆、管线和开启的舱门。

- 机身 **4096×4096**：BaseColor、Normal、MetallicSmoothness。
- 垂尾 **2048×2048**：独立方向的相同三种贴图。
- BaseColor 使用 sRGB；Normal 使用 Unity Normal Map 导入；MetallicSmoothness 为线性，**R=金属度，A=平滑度**。
- 机腹使用独立图集区；尾翼使用左右外侧图集；局部平面投影和共用纹理适合当前涂装，任意重绘独立侧壁需重新展开 UV。
- URP/Lit 的座舱为金色半透明反射材质；Blender 源文件额外使用透射，因此离线渲染与 URP 的玻璃折射效果不同。
- 预览 PNG 是实际几何与 PBR 材质的 Blender Cycles 渲染，**不是 Unity 截图**。高面数适合近景展示；未进行帧率或目标硬件性能测试。

## 文件

- `F22_URP_HighDetail.unitypackage`：Unity 直接导入包，含下述 Assets。
- `Assets/GYRO_F22/Models/*.fbx`：通用二进制 FBX，保留独立部件和法线。
- `Assets/GYRO_F22/Materials`、`Textures`、`Prefabs`、`Scenes`：Unity 已生成资源及其稳定引用。
- `Source/F22_HighDetail.blend`：Blender 4.5 可编辑源文件，贴图已打包，起落架在独立集合中，默认隐藏。无骨骼绑定；局部部件仍可编辑。
- `Source/Procedural`：参数化建模和打包代码。Python 3.11 安装 `bpy==4.5.3 pillow` 后执行 `python tools/f22_unity/build.py --out <输出目录>`。生成 Unity 资源的 C# 编辑器脚本另在 Assets 中。
- `Previews`：前侧、后侧、完整俯视、起落架展示及拼图。
- `model-info.json`：来自实际构建的几何统计。
- `SHA256SUMS.txt`：交付文件摘要。

## 参考

- USAF F-22 Fact Sheet: https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/
- Lockheed Martin product card: https://www.lockheedmartin.com/content/dam/lockheed-martin/aero/documents/f22/F-22-Product-Card.pdf
- USAF 正视实拍: https://www.dvidshub.net/image/1187060/usaf-heritage-flight-raptor-ready
- USAF 涂装实拍: https://www.dvidshub.net/image/584185/f-22-raptor-refueling
- Unity 模型准备: https://docs.unity.cn/Manual/models-preparing.html

模型与贴图由本项目程序制作；参考照片没有打包进资产。FF/AF/022 为展示性标记，不代表某一架飞机的完整精确涂装。
'''
(out/'README_中文.md').write_text(readme,encoding='utf-8')
# A labeled contact sheet uses actual final renders; no AI image substitution.
canvas=Image.new('RGB',(1600,1220),(17,22,29));draw=ImageDraw.Draw(canvas)
try:font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',27)
except OSError:font=ImageFont.load_default()
draw.text((34,22),'F-22 / UNITY URP / REAL-WORLD SCALE',font=font,fill=(223,233,241))
for i,(name,label) in enumerate([('Front','FRONT / AIRFRAME'),('Rear','REAR / NOZZLES'),('Top','PLANFORM / 18.90 x 13.56 M'),('GearDown','GEAR DOWN / 5.08 M')]):
    im=Image.open(out/'Previews'/f'{name}.png').convert('RGB');im.thumbnail((780,536))
    x=10+(i%2)*800;y=76+(i//2)*570;canvas.paste(im,(x,y));draw.text((x+15,y+537),label,font=font,fill=(169,187,202))
canvas.save(out/'Previews'/'F22_Overview.jpg',quality=93)
for folder in ['Assets','Source','Previews']:shutil.copytree(out/folder,dest/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('*.blend1'))
for name in ['F22_URP_HighDetail.unitypackage','README_中文.md','model-info.json']:shutil.copy2(out/name,dest/name)
proc=dest/'Source'/'Procedural';(proc/'tools'/'f22_unity').mkdir(parents=True,exist_ok=True)
shutil.copy2(ROOT/'tools'/'build_airplane.py',proc/'tools'/'build_airplane.py')
for src in (ROOT/'tools'/'f22_unity').glob('*'):
    if src.is_file():shutil.copy2(src,proc/'tools'/'f22_unity'/src.name)
(proc/'requirements.txt').write_text('bpy==4.5.3\npillow\n',encoding='utf-8')
sums=[]
for f in sorted(dest.rglob('*')):
    if f.is_file() and f.name!='SHA256SUMS.txt':sums.append(hashlib.file_digest(f.open('rb'),'sha256').hexdigest()+'  '+f.relative_to(dest).as_posix())
(dest/'SHA256SUMS.txt').write_text('\n'.join(sums)+'\n',encoding='utf-8')
archive=dest.with_suffix('.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for f in sorted(dest.rglob('*')):
        if f.is_file():z.write(f,Path(dest.name)/f.relative_to(dest))
print(json.dumps({'delivery':str(dest),'archive':str(archive),'archive_bytes':archive.stat().st_size,'files':len(sums)},ensure_ascii=False))
