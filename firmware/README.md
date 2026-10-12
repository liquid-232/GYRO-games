# ESP32-C3 + MPU6050 USB + 蓝牙体感控制器

ESP-IDF **6.0.2**，ESP32-C3 SuperMini，4 MB Flash，NimBLE BLE GATT。原生 USB Serial/JTAG 用于烧录及有线体感，本机串口 COM29。运行时 USB 由驱动独占传输二进制帧，文字日志关闭。

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

连接和传感器状态在游戏设置页显示。传感器未读到时自动重试，断电接好后上电无需重烧。双模式固件的串口为二进制 USB 数据通道，运行时不输出文字日志；串口监视器会占用端口，使用 USB 游戏前需要关闭。

## 数据链路与延迟

```text
MPU6050 → I²C 400 kHz → ESP32 四元数姿态融合 → BLE GATT 通知 → 浏览器游戏
```

传感器 DLPF=2，陀螺仪带宽约 98 Hz，采样分频 4，目标 200 Hz，量程 ±500 °/s 和 ±4 g。用实际采样间隔积分，重力修正提供横滚 / 俯仰长期参考，线性加速明显时减小修正。游戏按选择的机头朝向，将完整姿态映射为飞机横滚 / 俯仰控制；机头沿 ±Z 时需要偏航数据，可能积累漂移。

BLE 外设请求 7.5–15 ms 连接间隔、外设延迟 0。实际间隔由中心设备决定。通知任务目标每 10 ms 发送最新样本，不累计历史动作；包长 20 字节，不依赖大 MTU。

浏览器默认满速倾角 25°、死区 1.5°、输入平滑时间常数 12 ms。无新采样 150 ms 时输入归零并冻结飞行，保留中位；持续 750 ms 才显示暂停。短时恢复自动继续，持续中断后数据恢复可手动继续。真正蓝牙断开、传感器异常或重新校准会清除中位；切换后台仅暂停飞行并保留中位，离开页面则断开连接。

「接收频率」统计最近一秒的有效通知；「数据年龄」是浏览器收到最新有效采样后经过的时间；「命令往返」是带响应写入加读取校验应答所用的时间。设备时钟应答用于识别肯定过期的通知。以上均不冒充整条动作到画面的实测延迟。

## BLE GATT 协议 v2

所有多字节整数 little-endian。一次连接一个中心设备。

| 项目 | UUID / 属性 |
| --- | --- |
| 主服务 | `7b6a0001-8e7f-4a23-a83b-e55a7634cc01` |
| 姿态特征 | `7b6a0002-8e7f-4a23-a83b-e55a7634cc01`，READ / NOTIFY |
| 指令特征 | `7b6a0003-8e7f-4a23-a83b-e55a7634cc01`，READ / WRITE with response |

姿态通知 20 字节，Python 结构格式 `<4sIIhhBBh`：

| 字节偏移 | 字段 |
| --- | --- |
| 0 | 4 字节 `GYB2` |
| 4 | uint32 sequence，每次有效传感器采样递增 |
| 8 | uint32 device_us，采样时设备微秒时钟 |
| 12 | int16 roll，单位 0.01° |
| 14 | int16 pitch，单位 0.01° |
| 16 | uint8 flags：1=传感器正常，2=校准中，4=就绪 |
| 17 | uint8 角速度模长，就绪时扣除零偏，单位 °/s，四舍五入并饱和到 255 |
| 18 | int16 yaw，相对偏航，单位 0.01°，范围 ±180° |

v2 使用原采样间隔字段传输相对偏航；采样时钟、序号、标记和每包 20 字节保持不变。新版游戏同时兼容 v1 (`GYB1`，偏移 18 为 uint16 采样间隔)，连接旧固件时仅显示横滚 / 俯仰，偏航标为不可用。旧页面不识别 v2，烧录后请刷新游戏。

偏航从现有融合四元数提取，校准完成时以初始朝向为零，用于三维姿态预览及按机头朝向换算操控轴。MPU6050 无磁力计，不能提供绝对航向，偏航会积累漂移；游戏基于完整中位姿态计算飞机坐标下的横滚 / 俯仰；机头沿 ±Z 时偏航也参与操控，漂移时重新设置中位。

指令 WRITE 为 5 字节 `<BI`：operation uint8、随机 ID uint32。operation=1 重新静止校准，operation=2 时钟探测。指令 READ 为 9 字节 `<BII`：operation、相同 ID、执行指令时的设备微秒时钟。浏览器串行执行指令并核对 ID；校准后等待实际校准状态。

序号与设备时钟按模 2³² 处理。重复通知仅证明连接仍活跃，不刷新有效采样年龄。错误格式、非法标记、越界角度、乱序和肯定过期的数据被拒绝。

## USB Serial/JTAG 协议

Type-C 使用 ESP32-C3 原生 USB，VID `303a` / PID `1001`。在电脑串口选择器选择本机 COM29，打开参数 115200、DTR=false / RTS=false，不主动复位芯片。浏览器用 Web Serial，USB 和 BLE 共用同一传感器采样、姿态融合与 GYB2 20 字节负载。

| 帧 | 格式 |
| --- | --- |
| 姿态 | `GYU2` (4 字节) + GYB2 负载 (20 字节) + CRC16 (2 字节)，共 26 字节 |
| 命令 | `GYC2` + operation uint8 + ID uint32 + CRC16，共 11 字节 |
| 应答 | `GYA2` + operation uint8 + 相同 ID uint32 + device_us uint32 + CRC16，共 15 字节 |

多字节数 little-endian。CRC 为 CRC16-CCITT-FALSE：初值 0xffff、多项式 0x1021，对帧头和负载一起计算，CRC 本身 little-endian。`123456789` 的校验为 0x29b1。

operation=1 校准、2 时钟探测 / 续期、3 停止发送。1 / 2 启用约 3 秒发送租期，浏览器每秒探测续期。USB 任务每 10 ms 发送最新采样；TX/RX 各 256 字节，零等待写入不阻塞传感器或 BLE。协议解析可以从断帧、坏校验或启动日志中重新同步；浏览器每批只提交最新姿态，不播放历史动作。

控制器一次只选一种游戏连接方式。USB 断开时取消读取、释放读写锁并关闭端口；固件租期到期停止有线发送，BLE 可继续使用。监视器或其他程序打开串口会导致游戏连接失败。

2026-10-12 双模式固件已在 COM29 烧录并校验。8 秒 USB 检查 801 帧 / 100.4 Hz、8 次应答、停止发送通过；BLE 检查 515 帧 / 100.1 Hz，flags=5。以上为短时通信检查，完整游玩延迟与手持精度仍需实际使用确认。

## 浏览器与硬件限制

体感需要支持 Web Bluetooth 的 Chrome / Edge、电脑 BLE 适配器，以及 localhost / HTTPS 页面。Firefox 等不支持该 API 的浏览器仍可用键盘模式。浏览器设备选择必须由点击按钮触发。

2026-10-12 已在本机 ESP32-C3 上完成真实 BLE GATT 收发：设备名 `GYRO-C3-BLE-95BA`，约 100 Hz 通知，6 次命令往返中位数约 55 ms，传感器 flags=5（正常且就绪）。这是当前电脑和无线环境下的短时实测，不是动作到画面的总延迟。

实际静止数据存在约 9 °/s 陀螺仪零偏、重力模长约 1.095 g。已改用连续 400 个采样的陀螺仪 / 加速度稳定性判断，校准并扣除零偏；重力修正以校准时测得的模长为参考。设置中位使用扣除零偏后的角速度。C 算法测试覆盖这种零偏、60 秒静止漂移、倾斜跟踪及运动时拒绝校准。

2026-10-12 三轴版固件已编译并烧录至 COM29，写入校验通过。8 秒真实 BLE 检查收到 803 个 GYB2 包，约 100.0 Hz，flags=5；最后姿态为 roll=0.50°、pitch=-0.42°、yaw=0.34°。这次检查确认了三轴数据传输，未验证长时间偏航漂移或动作到画面的总延迟。

真实操控方向和动作到画面的完整响应仍需手持控制器游玩确认。

## 资料

- 用户提供的 MPU6050 模块引脚定义、原理图和寄存器手册。
- 用户提供的 ESP32-C3 SuperMini 引脚图与原理图。
- [Espressif NimBLE 连接说明](https://docs.espressif.com/projects/esp-idf/en/v5.5.4/esp32c3/api-guides/ble/get-started/ble-connection.html)。
- [Chrome Web Bluetooth 文档](https://developer.chrome.com/docs/capabilities/bluetooth)。
- [TDK MPU-6000/6050 寄存器手册](https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Register-Map1.pdf)。

供应商资料未复制到仓库。底层库采用本机 ESP-IDF 6.0.2 API。
