# 可直接烧录的 ESP32-C3 固件

`gyro-c3.bin` 为 ESP-IDF 6.0.2 编译的合并镜像，包含 bootloader、分区表与应用，**起始烧录地址为 `0x0`**。目标 ESP32-C3，4 MB Flash，DIO / 80 MHz，SDA=GPIO4、SCL=GPIO5。

SHA-256：

```text
6d1056f716da32135f5cc4f5881742a144b13721ddeb57036e4d9da8c7199e5a
```

在安装了 esptool 5.x 的 Python 或 ESP-IDF 终端中，从仓库根目录执行（替换实际串口）：

```text
python -m esptool --chip esp32c3 --port COM29 --baud 460800 write-flash 0x0 firmware/releases/gyro-c3.bin
```

烧录会替换现有固件。之后仅需 USB / 其他合适方式供电；电脑连接 `GYRO-C3-xxxx`，默认密码 `GyroPlay32`，打开游戏的体感控制面板。

此镜像与 2026-10-12 在 COM29 上烧录的应用来自同一次构建。实际传感器尚未连接，接线和校准见 [上级说明](../README.md)。

重新构建后，可在 `firmware/build` 中生成最新合并镜像：

```text
python -m esptool --chip esp32c3 merge-bin -o ../releases/gyro-c3.bin @flash_args
```

更新镜像时同步更新本文件的 SHA-256。
