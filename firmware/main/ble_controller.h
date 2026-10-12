/*
 * 控制器共享接口：传感器任务发布快照，BLE 与 USB 读取同一份姿态。
 * 具体采样与校准请求由 main.c 实现，临界区保护在实现内部完成。
 * 快照为内存结构，发送前由 gyro_packet.h 编码为固定长度的数据包。
 */
#pragma once
#include <stdint.h>

// 内存快照：角度用浮点存储，通信编码时再转换为 0.01° 的整数。
typedef struct {
    // sequence：成功采样序号；device_us：采样微秒时钟低 32 位，均允许回绕。
    uint32_t sequence, device_us;
    // roll/pitch/yaw：横滚/俯仰/相对偏航（°）；motion_dps：角速度模长（°/s），就绪后扣除零偏。
    float roll, pitch, yaw, motion_dps;
    uint16_t period_us;         // 最近实际采样间隔（微秒），最大截断为 65535。
    uint8_t flags;              // 位标记：1=传感器正常，2=校准中，4=姿态就绪。
} gyro_snapshot_t;
// 原子复制最新快照；超过 100 ms 没有新采样时返回无效 flags。
void gyro_get_snapshot(gyro_snapshot_t *out);
// 请求采样任务重新校准，并立即把共享状态标为校准中。
void gyro_request_calibration(void);
// 初始化 NimBLE、GATT 服务、广播与通知任务；仅在启动时调用一次。
void ble_controller_start(void);
