# F-22 风格飞机模型

根据 assets/airplane-f22.png 的造型制作的游戏美术模型。机身、发动机舱与座舱采用 64 段环向细分、单调三次曲线纵向插值和平滑顶点法线；金属材质高光沿曲面连续变化。

- airplane-f22.glb：带材质的通用 3D 模型，可直接导入 Blender / Godot / Unity 等软件。
- airplane-f22.obj + airplane-f22.mtl：备用格式，两个文件需要放在一起。
- airplane-f22-viewer.html：独立离线 WebGL 预览，拖动旋转、滚轮缩放、双击复位。
- airplane-f22-preview.png：从实际模型几何体渲染的预览图。
- ../../tools/build_airplane.py：可编辑的参数化建模脚本，依赖 numpy 与 Pillow。

坐标 Y 向上、机头朝 -Z。尺寸为美术近似比例。机翼、机身、尾翼、座舱和喷口独立命名；使用 PBR 色材质，无外部纹理。
模型为静态外观资产，尚未制作动画骨骼、驾驶舱内部、起落架、LOD 或碰撞体；重叠部件未合并成适合 3D 打印的单一实体。
