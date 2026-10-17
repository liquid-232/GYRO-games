# 破晓航线 · 空战动画概念片

本地可播放的 60 秒 3D 动画，用现有 F-22 模型展示画面风格与玩法意图。

双击 `game/start-concept-film.cmd`，或运行：

```powershell
python game/server.py --open --page concept-film.html
```

播放按钮控制暂停；时间轴可拖动；六个章节可直接跳转；支持 0.5× / 1× / 1.5×、循环和全屏。空格暂停，左右方向键跳转 5 秒。系统启用“减少动态效果”时默认暂停。关闭最后一个预览/游戏页面约 2 秒后启动器自动退出。

## 分镜

| 时间 | 片段 | 演示内容 |
| --- | --- | --- |
| 00–09 秒 | 破晓出击 | 金属飞机、海面、云层、暖橙尾焰与环绕镜头 |
| 09–19 秒 | 低空穿越 | 礁柱绕行、补给拾取、跟随镜头 |
| 19–29 秒 | 急转避弹 | 横滚急转、导弹近距掠过、格挡反射 |
| 29–40 秒 | 锁定追击 | 目标锁定、机炮弹道、追踪导弹与击毁反馈 |
| 40–52 秒 | 弱点突破 | 原创空中航母、后方暴露核心与大型爆炸 |
| 52–60 秒 | 任务完成 | 飞机展示及风格评分战果 |

这是独立的**预设动画**，飞行路线、弹道、事件和评分均按时间编排，不代表这些新玩法已经加入可玩游戏。动画无需蓝牙或 USB，不修改游戏进度。航母是为本片制作的原创简化模型。

所有素材在本地生成或复用仓库资产，无 CDN、字体或其他在线依赖。每帧依据绝对时间求值，可重复导出和跳转。网页可实时观看；视频是无声的视觉概念片。

## 视频与分镜

- `assets/animations/skystrike-first-light.mp4`：1280×720、24 fps、60 秒，无声 MP4。
- `assets/animations/skystrike-storyboard.jpg`：六段分镜概览。

生产导出命令（已安装 Playwright 和 ffmpeg 时）：

```powershell
node tools/render-concept-film.cjs --video
```

工具默认查找本机 Codex 附带的 Playwright、Sharp 和 Edge。其他环境可通过 `PLAYWRIGHT_MODULE`、`FILM_BROWSER`、`FILM_FFMPEG`、`FILM_SHARP_MODULE` 指定路径。工具只启动临时本地静态服务器，导出结束后释放浏览器和端口。
