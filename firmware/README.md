# ESP32-C3 + MPU6050 蓝牙体感控制器

ESP-IDF **6.0.2**，ESP32-C3 SuperMini，4 MB Flash，NimBLE BLE GATT。原生 USB Serial/JTAG 用于烧录和日志，本机串口 COM29。

## 接线

断电后连接，接好再上电。按板上的引脚标记识别。

| MPU6050 模块 | ESP32-C3 |
| --- | --- |
| VCC | 3V3 |
| GND | GND |
| SDA | GPIO4 |
| SCL | GPIO5 |
| AD0 | 默认悬空 / 模块下拉，地址 0x68；也兼容拉高后的 0x69 |
| INT、XDA、XCL | 不接 |

用户提供的模块原理图显示已有 4.7 kΩ I²C 上拉。线应短且接触牢固。四线连接，固件轮询数据就绪，无需 INT 线。

## 编译 / 烧录

仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\esp32.ps1 build
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\esp32.ps1 flash -Port COM29
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\esp32.ps1 monitor -Port COM29
```

监视器按 `Ctrl+]` 退出。若无法连接，按住 BOOT，短按 RESET，松开 BOOT 后重试，并确认实际串口。烧录会替换当前固件。

本机使用 `C:\Espressif\tools\Microsoft.v6.0.2.PowerShell_profile.ps1`。也可以在安装了 ESP-IDF 6.0.2 的终端中执行：

```text
idf.py -C firmware set-target esp32c3
idf.py -C firmware build
idf.py -C firmware -p COM29 flash monitor
```

默认配置为 4 MB / DIO、160 MHz、FreeRTOS 1000 Hz、NimBLE、一个 BLE 外设连接、ATT MTU 23。复用旧配置时确认已启用 `CONFIG_BT_ENABLED` / `CONFIG_BT_NIMBLE_ENABLED`，以及 `CONFIG_FREERTOS_HZ=1000`。

直接烧录合并镜像见 [releases/README.md](releases/README.md)。

## 蓝牙连接

1. 给开发板供电，电脑开启蓝牙，使用 Chrome 或 Edge 从桌面快捷方式打开游戏。
2. 打开「蓝牙体感」，选择 MPU6050 蓝牙体感，点击「连接蓝牙」。
3. 在浏览器设备列表中选择 `GYRO-C3-BLE-xxxx`，后四位来自设备蓝牙地址。游戏会订阅姿态通知。
4. 首次上电静置约 2–4 秒。400 个合格采样完成零偏校准，运动会重新计数。
5. 显示「姿态就绪」后，保持舒适握姿并设置中位。建议板面朝上、倾斜范围在 45° 内。方向不符合安装习惯时使用交换轴向和反转设置。
6. 温度变化或出现漂移时点击「重新校准」，校准后重新设置中位。

通过浏览器设备选择器连接即可。开发板只接受一台电脑的 BLE 连接，断开后重新广播。Windows 配对列表中存在旧设备时，先从游戏断开再重新选择设备。

串口 `Advertising GYRO-C3-BLE-xxxx` 表示可发现；`BLE connected` 表示电脑已连接；`Motion notifications enabled` 表示已订阅姿态；`KEEP STILL` 表示正在校准；`READY` 表示姿态就绪。传感器未读到时自动重试，断电接好后上电无需重烧。

## 数据链路与延迟

```text
MPU6050 → I²C 400 kHz → ESP32 四元数姿态融合 → BLE GATT 通知 → 浏览器游戏
```

传感器 DLPF=2，陀螺仪带宽约 98 Hz，采样分频 4，目标 200 Hz，量程 ±500 °/s 和 ±4 g。用实际采样间隔积分，重力修正提供横滚 / 俯仰长期参考，线性加速明显时减小修正。不使用没有磁力计参考的航向角操控。

BLE 外设请求 7.5–15 ms 连接间隔、外设延迟 0。串口输出电脑实际采用的连接间隔。通知任务目标每 10 ms 发送最新样本，不累计历史动作；包长 20 字节，不依赖大 MTU。

浏览器默认满速倾角 25°、死区 1.5°、输入平滑时间常数 12 ms。无新采样 150 ms 时输入归零并冻结飞行，保留中位；持续 750 ms 才显示暂停。短时恢复自动继续，持续中断后数据恢复可手动继续。真正蓝牙断开、传感器异常或重新校准会清除中位；切换后台仅暂停飞行并保留中位，离开页面则断开连接。

「接收频率」统计最近一秒的有效通知；「数据年龄」是浏览器收到最新有效采样后经过的时间；「命令往返」是带响应写入加读取校验应答所用的时间。设备时钟应答用于识别肯定过期的通知。以上均不冒充整条动作到画面的实测延迟。

## BLE GATT 协议 v1

所有多字节整数 little-endian。一次连接一个中心设备。

| 项目 | UUID / 属性 |
| --- | --- |
| 主服务 | `7b6a0001-8e7f-4a23-a83b-e55a7634cc01` |
| 姿态特征 | `7b6a0002-8e7f-4a23-a83b-e55a7634cc01`，READ / NOTIFY |
| 指令特征 | `7b6a0003-8e7f-4a23-a83b-e55a7634cc01`，READ / WRITE with response |

姿态通知 20 字节，Python 结构格式 `<4sIIhhBBH`：

| 字节偏移 | 字段 |
| --- | --- |
| 0 | 4 字节 `GYB1` |
| 4 | uint32 sequence，每次有效传感器采样递增 |
| 8 | uint32 device_us，采样时设备微秒时钟 |
| 12 | int16 roll，单位 0.01° |
| 14 | int16 pitch，单位 0.01° |
| 16 | uint8 flags：1=传感器正常，2=校准中，4=就绪 |
| 17 | uint8 角速度模长，就绪时扣除零偏，单位 °/s，四舍五入并饱和到 255 |
| 18 | uint16 最近采样间隔，单位 μs |

指令 WRITE 为 5 字节 `<BI`：operation uint8、随机 ID uint32。operation=1 重新静止校准，operation=2 时钟探测。指令 READ 为 9 字节 `<BII`：operation、相同 ID、执行指令时的设备微秒时钟。浏览器串行执行指令并核对 ID；校准后等待实际校准状态。

序号与设备时钟按模 2³² 处理。重复通知仅证明连接仍活跃，不刷新有效采样年龄。错误格式、非法标记、越界角度、乱序和肯定过期的数据被拒绝。

## 浏览器与硬件限制

体感需要支持 Web Bluetooth 的 Chrome / Edge、电脑 BLE 适配器，以及 localhost / HTTPS 页面。Firefox 等不支持该 API 的浏览器仍可用键盘模式。浏览器设备选择必须由点击按钮触发。

2026-10-12 已在本机 ESP32-C3 上完成真实 BLE GATT 收发：设备名 `GYRO-C3-BLE-95BA`，约 100 Hz 通知，6 次命令往返中位数约 55 ms，传感器 flags=5（正常且就绪）。这是当前电脑和无线环境下的短时实测，不是动作到画面的总延迟。

实际静止数据存在约 9 °/s 陀螺仪零偏、重力模长约 1.095 g。已改用连续 400 个采样的陀螺仪 / 加速度稳定性判断，校准并扣除零偏；重力修正以校准时测得的模长为参考。设置中位使用扣除零偏后的角速度。C 算法测试覆盖这种零偏、60 秒静止漂移、倾斜跟踪及运动时拒绝校准。

真实操控方向和动作到画面的完整响应仍需手持控制器游玩确认。

## 资料

- 用户提供的 MPU6050 模块引脚定义、原理图和寄存器手册。
- 用户提供的 ESP32-C3 SuperMini 引脚图与原理图。
- [Espressif NimBLE 连接说明](https://docs.espressif.com/projects/esp-idf/en/v5.5.4/esp32c3/api-guides/ble/get-started/ble-connection.html)。
- [Chrome Web Bluetooth 文档](https://developer.chrome.com/docs/capabilities/bluetooth)。
- [TDK MPU-6000/6050 寄存器手册](https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Register-Map1.pdf)。

供应商资料未复制到仓库。底层库采用本机 ESP-IDF 6.0.2 API。
