# F-22 Raptor 外观模型

依据美国空军公开照片、F-22 资料页和 Lockheed Martin 产品卡的俯视轮廓重建。总长 18.90 米、翼展 13.56 米、平尾展 8.84 米；局部曲面、进气道与舱门细节依据照片作美术近似，非官方工程模型。

- airplane-f22.glb：带低光泽灰色涂层、金色座舱和金属喷口的通用 3D 模型。
- airplane-f22.obj + airplane-f22.mtl：备用格式，两个文件需放在一起。
- airplane-f22-viewer.html：独立离线 WebGL 预览，拖动旋转、滚轮缩放、双击复位。
- airplane-f22-preview.png：从本次实际几何体渲染的预览图。
- ../../tools/build_airplane.py：参数化建模脚本，依赖 numpy 与 Pillow。
- model-info.json：构建统计、尺寸及参考来源。

前机身使用带折线的圆润菱形横截面，翼身肩部与双发动机背脊具有体积；主翼和平尾采用翼根厚、翼尖薄的翼型，主翼后缘控制面有实际间隙。左右进气道有唇口、内壁和深处暗面，喷口有二维矩形开口与独立瓣片。机腹包括闭合武器舱边界。部件使用语义名称，便于游戏按材质合并渲染。

坐标 Y 向上、机头朝 -Z。GLB 使用 POSITION/NORMAL 非索引三角形，不依赖外部纹理；游戏另加程序涂装和局部自阴影。此为静态外观资产，未制作起落架、驾驶舱内部或工程结构，重叠部件不适合直接 3D 打印。

参考：
- https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/
- https://www.lockheedmartin.com/content/dam/lockheed-martin/aero/documents/f22/FG19-Product%20Card%20F-22.pdf
