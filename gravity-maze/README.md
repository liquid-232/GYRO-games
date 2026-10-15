# 重力滚球 · GRAVITY MAZE

独立的三维体感迷宫游戏。整个 `gravity-maze` 文件夹可单独复制运行，无需空战目录。

双击 `start-maze.cmd`，或桌面「重力滚球」快捷方式。需要 Python 3.10+ 和支持 WebGL 2 的 Chrome / Edge。默认端口 8890，关闭最后一个网页 2 秒后退出服务。图标为原创迷宫与金属球图案。

三个固定关卡；收齐三颗星星再到终点。落入陷阱返回起点，保留星星。支持蓝牙、USB、键盘和触屏。默认蓝牙模式；连接开发板、静置校准、设置中位后开始。使用原 USB + BLE 双模式固件，无需重新烧录。SDA GPIO4，SCL GPIO5，VCC 3V3，GND 共地。

方向键 / WASD 倾斜；空格刹车；P / Esc 暂停。打开设置或切换窗口自动暂停。最佳成绩与操控设置独立保存在本游戏浏览器来源中。

`dist/maze-model.js` 是独立三维模型，`maze-physics.js` 为关卡与物理，`maze.js` 为游戏状态，`app.css` 为专属界面。控制器预览只加载陀螺仪模型。依赖均在本目录；Three.js 许可证见 `dist/vendor/LICENSE.txt`。

检查：`node gravity-maze/test-maze.mjs`。
