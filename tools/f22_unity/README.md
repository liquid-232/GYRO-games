# Unity F-22 高细节资产构建

本目录是独立高细节模型的源流程；现有浏览器游戏继续使用轻量版 GLB。

1. Python **3.11**：`pip install bpy==4.5.3 pillow`。
2. `python tools/f22_unity/build.py --out exports/F22-Unity-URP`，生成 FBX、4K/2K PBR 贴图、Blender 源文件与 Cycles 预览。
3. 将 `PackageBuilder.cs` 放到输出工程的 `Assets/GYRO_F22/Editor`。使用 Unity **2022.3 / URP 14.0.11** 打开独立输出工程，调用 `GYRO.F22.PackageBuilder.Build`（或菜单 `GYRO/F22/Rebuild URP materials and prefabs`），生成材质、两个预制体、展示场景和 unitypackage。
4. `python tools/f22_unity/package.py --out exports/F22-Unity-URP --delivery <交付目录>`，汇集文件、写入中文使用说明和 SHA256 摘要并压缩。

完整输出包含约 49 万面飞行模型与独立起落架展示版，采用 1 米 = 1 单位，长度 18.90 m、翼展 13.56 m、放下起落架高度 5.08 m。局部曲面和内部细节为参考美术建模，并非工程 CAD 或扫描复刻。没有骨骼动画、LOD 或碰撞体。

`build.py` 读取 `tools/build_airplane.py` 的公开参考尺寸与外形参数，再生成高密度曲面、融合机身、增加独立细节。纹理由 `textures.py` 原创绘制。最终尺寸和面数记录于输出的 `model-info.json`。

输出与 Unity Library 缓存放在忽略的 `exports/`，不向仓库提交大型构建副本。Unity 资源生成不等于性能或玩法测试。
