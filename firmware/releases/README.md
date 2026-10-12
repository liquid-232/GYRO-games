# ESP32-C3 蓝牙版烧录镜像

`gyro-c3-ble.bin` 为 ESP-IDF 6.0.2 合并镜像，包含 bootloader、分区表和应用。目标 ESP32-C3 / 4 MB Flash，DIO / 80 MHz，烧录起始地址 **0x0**。传感器 SDA=GPIO4、SCL=GPIO5。

SHA-256：

```text
d612ecdcb7504bea19c99fc717d9ff9406b130d6936602da556b2d04cb6c98d9
```

仓库根目录运行（esptool 5.x，替换实际串口）：

```text
python -m esptool --chip esp32c3 --port COM29 --baud 460800 write-flash 0x0 firmware/releases/gyro-c3-ble.bin
```

烧录后开启电脑蓝牙，用 Chrome / Edge 打开游戏，在「蓝牙体感」里选择 `GYRO-C3-BLE-xxxx`。保持传感器静止，姿态就绪后设置中位。

2026-10-12：蓝牙版已在 COM29 编译并烧录，写入哈希校验通过。真实体感精度仍需硬件联调。

重新构建后，在 `firmware/build` 中生成合并镜像：

```text
python -m esptool --chip esp32c3 merge-bin -o ../releases/gyro-c3-ble.bin @flash_args
```

更新镜像时同步更新本文件的 SHA-256。接线和协议见 [上级说明](../README.md)。
