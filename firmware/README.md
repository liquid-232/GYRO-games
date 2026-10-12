# ESP32-C3 + MPU6050 无线体感控制器

ESP-IDF **6.0.2**，ESP32-C3 SuperMini，4 MB Flash，USB Serial/JTAG。本机串口为 COM29；在其他电脑上请检查实际串口。

## 接线

断电后连接，接好再上电。引脚按板上标记识别，不按排针位置数。

| MPU6050 模块 | ESP32-C3 |
| --- | --- |
| VCC | 3V3 |
| GND | GND |
| SDA | GPIO4 |
| SCL | GPIO5 |
| AD0 | 默认悬空 / 模块下拉，地址 0x68；也兼容拉高后的 0x69 |
| INT、XDA、XCL | 不接 |

按用户提供的模块原理图，模块已带 4.7 kΩ I²C 上拉。默认 I²C 400 kHz，线应短且接触牢固。本工程避开 BOOT 所用 GPIO9 和 USB 数据引脚。使用四根线，固件轮询数据就绪状态，无需 INT 线。

## 编译 / 烧录

本机已安装官方 ESP-IDF 6.0.2。在仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\esp32.ps1 build
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\esp32.ps1 flash -Port COM29
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\esp32.ps1 monitor -Port COM29
```

监视器按 `Ctrl+]` 退出。无法连接时，按住 BOOT，短按 RESET，松开 BOOT，重新确认串口再烧录。烧录会替换开发板现有应用。

也可以打开 `esp32c3.code-workspace`，使用 VS Code 的编译、Flash and Monitor 任务。本机激活脚本为 `C:\Espressif\tools\Microsoft.v6.0.2.PowerShell_profile.ps1`；在其他电脑上用 ESP-IDF 终端：

```text
idf.py -C firmware set-target esp32c3
idf.py -C firmware build
idf.py -C firmware -p COM29 flash monitor
```

首次配置从 `sdkconfig.defaults` 读取：4 MB / DIO、USB 控制台、160 MHz CPU、FreeRTOS 1000 Hz。若复用旧工程配置，请确认 `CONFIG_FREERTOS_HZ=1000`，否则无法实现 5 ms 采样任务周期。

直接烧录合并镜像的方法见 [releases/README.md](releases/README.md)。镜像不含用户 Wi-Fi 密码和个人凭据。

## 连接与校准

1. ESP32 创建 WPA2 Wi-Fi：`GYRO-C3-xxxx`（后四位由设备 MAC 生成），出厂密码 `GyroPlay32`。
2. 电脑加入这个 Wi-Fi，然后通过 `game/start-game.cmd` 启动本地游戏。
3. 在体感面板选择 MPU6050，连接 `192.168.4.1`，保持传感器静止。400 个合格采样完成零偏校准；运动会重新计数，因此通常至少需要约 2 秒，可能更长。
4. 显示「姿态就绪」后，将控制器放在舒适握姿，设置中位。建议板面朝上、倾斜范围在 45° 内；按实际安装方向选择交换轴或反向。
5. 温度变化或感觉漂移时重新校准，再设置中位。六轴没有磁力计，不使用会漂移的航向角控制方向。

开发板自动重试未连接的传感器。断电接好后上电，无需重烧。串口 `MPU6050 unavailable` 表示未读到模块；`KEEP STILL` 表示正在校准；`READY` 表示姿态就绪。

AP 使用 2.4 GHz、信道 6、20 MHz 带宽，关闭 Wi-Fi 省电，仅允许一台电脑连接。出厂密码是公开的默认值；可在 `main/main.c` 修改后重新烧录。它不是个人网络凭据。

## 数据链路

```text
MPU6050 → I²C 400 kHz → ESP32 姿态融合 → Wi-Fi UDP 4210
        → 电脑 Python 接收程序 → 本机 SSE → 浏览器游戏
```

传感器 DLPF=2，陀螺仪带宽约 98 Hz，采样分频为 4，目标 200 Hz。量程 ±500 °/s、±4 g。四元数积分用实测采样间隔，重力校正提供横滚 / 俯仰长期参考，明显线性加速时减小重力修正。

无线任务目标每 10 ms 发送最新样本。采样与无线分别运行；不缓存动作队列。电脑发起 UDP 连接，无需让浏览器读取串口，也无需把数据送到互联网。接收程序只监听 `127.0.0.1`，校验 Host / Origin，控制器目标仅接受 RFC1918 IPv4 地址。

浏览器的满速倾角默认 25°，死区 1.5°，输入平滑时间常数 12 ms。150 ms 数据看门狗用于中断保护，并不代表正常游玩延迟目标。RTT 是实测往返时间；数据年龄是电脑收到最新采样后经过的时间，也包含本机传递到浏览器的时间。没有把 RTT 或配置频率视为整条链路的实测延迟。

## UDP 协议 v1

全部 little-endian。Wi-Fi 局域网内发送，默认端口 4210。

### 指令 / 应答：16 字节 `<4sIII`

`GYC1, session, operation, argument`

- session：电脑生成的非零随机 uint32；同时校验源 IP 和端口。
- operation=1：订阅 / 心跳。每 500 ms 发送，3 秒超时释放控制器。
- operation=2：PING，argument 为随机 ping ID。
- operation=3：请求重新静止校准。游戏等待校准状态，未收到时可以重新点击。
- operation=4：主动释放当前会话。
- PONG：`GYP1, session, ping ID, device_us`，用于 RTT 和设备时钟界限估计。

### 姿态：40 字节 `<4sIII5fHH`

| 字段 | 类型 / 单位 |
| --- | --- |
| magic | `GYR1` |
| session | uint32 |
| sequence | uint32，每个有效传感器采样递增，按模 2³² 比较 |
| device_us | uint32，传感器读取时设备微秒时钟，约 71.6 分钟回绕 |
| roll, pitch | float32，角度 |
| gx, gy, gz | float32，原始角速度 °/s |
| flags | uint16：1=传感器正常，2=正在校准，4=姿态就绪 |
| period_us | uint16，最近两个有效采样之间的微秒数 |

电脑拒绝格式错误、非有限值、越界值、错误会话、重复 / 乱序样本。重复包可证明无线仍在线，但不会刷新采样年龄。基于 PONG 时钟界限确定超过 150 ms 的旧样本也会被丢弃。SSE 带电脑接收时间，浏览器检查年龄，积压数据不能重新获得新鲜状态。

## 当前硬件进展

2026-10-12：ESP-IDF 编译成功，COM29 上 ESP32-C3 revision v0.4 / 4 MB 成功烧录，写入哈希校验通过，已读取运行日志。用户确认 **MPU6050 尚未连接**，因此传感器识别、动作响应、实际姿态精度和完整无线游玩体验尚未实测。

## 资料来源

- 用户提供的 `MPU6050模块镀金板焊直针`：引脚定义、原理图、寄存器手册。
- 用户提供的 `ESP32-C3黑SuperMini焊针下`：引脚图、原理图。
- [TDK/InvenSense MPU-6000/6050 寄存器手册](https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Register-Map1.pdf)。
- [Espressif ESP-IDF Wi-Fi 文档](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-guides/wifi.html)。

供应商资料仅用于核对硬件，没有复制到本仓库。
