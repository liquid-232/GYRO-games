# ESP32-C3 USB + BLE 双模式烧录镜像

`gyro-c3-ble.bin` 保留原文件名，现已包含 USB 有线和 BLE 无线两种模式，为 ESP-IDF 6.0.2 合并镜像，包含 bootloader、分区表和应用。目标 ESP32-C3 / 4 MB Flash，DIO / 80 MHz，烧录起始地址 **0x0**。传感器 SDA=GPIO4、SCL=GPIO5。

SHA-256：

```text
599f04412862c2692f9b571ded84d06f9e78bc8edfc339a5366a41ec4c4dc3dc
```

仓库根目录运行（esptool 5.x，替换实际串口）：

```text
python -m esptool --chip esp32c3 --port COM29 --baud 460800 write-flash 0x0 firmware/releases/gyro-c3-ble.bin
```

烧录后开启电脑蓝牙，用 Chrome / Edge 打开游戏，在「蓝牙体感」里选择 `GYRO-C3-BLE-xxxx`。或用 Type-C 数据线连接电脑，选择「MPU6050 USB 有线体感」，点击「连接 USB」选择 ESP32-C3 串口。保持传感器静止，姿态就绪后设置中位。

2026-10-12：USB + BLE 双模式三轴版已在 COM29 编译并烧录，写入哈希校验通过，真实 USB 与 BLE 都收到约 100 Hz 三轴角度。烧录后刷新游戏页面以加载兼容的协议解析器。偏航为校准后的相对角度，可能漂移。

重新构建后，在 `firmware/build` 中生成合并镜像：

```text
python -m esptool --chip esp32c3 merge-bin -o ../releases/gyro-c3-ble.bin @flash_args
```

更新镜像时同步更新本文件的 SHA-256。接线和协议见 [上级说明](../README.md)。
