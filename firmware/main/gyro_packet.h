/*
 * BLE / USB 共用的 GYB2 姿态数据包及 USB CRC16 校验函数。
 * ESP32-C3 按小端序存放多字节数，浏览器也按小端序解析。
 * packed 禁止结构体对齐填充，保证姿态负载始终为 20 字节。
 * USB 在此负载外增加帧头与校验；BLE 直接发送此负载。
 */
#pragma once
#include <math.h>
#include <string.h>
#include "ble_controller.h"
// 固定偏移：0=标识，4=序号，8=时钟，12/14=横滚/俯仰，16=状态，17=角速度，18=偏航。
typedef struct __attribute__((packed)) {
    char magic[4];                 // 协议标识 GYB2，不包含字符串结束符。
    uint32_t sequence, device_us;   // 采样序号和微秒时钟，均按 32 位回绕。
    int16_t roll_cdeg, pitch_cdeg;  // 横滚 / 俯仰，单位 0.01°。
    uint8_t flags, motion_dps;      // 状态位与角速度模长（整数 °/s，饱和到 255）。
    int16_t yaw_cdeg;               // 相对偏航，单位 0.01°。
} motion_packet_t;
// 编译期检查包长，保证默认 BLE ATT MTU=23 时单次通知就能容纳。
_Static_assert(sizeof(motion_packet_t)==20,"Motion packet must be 20 bytes");
// 读取同一份传感器快照并编码；0.01° 是编码分辨率，不代表实测精度。
static inline motion_packet_t gyro_make_motion(void) {
    gyro_snapshot_t sample; gyro_get_snapshot(&sample);
    return (motion_packet_t){.magic={'G','Y','B','2'},.sequence=sample.sequence,.device_us=sample.device_us,
        .roll_cdeg=(int16_t)lroundf(sample.roll*100),.pitch_cdeg=(int16_t)lroundf(sample.pitch*100),
        .flags=sample.flags,.motion_dps=(uint8_t)fminf(255,lroundf(sample.motion_dps)),.yaw_cdeg=(int16_t)lroundf(sample.yaw*100)};
}
// CRC16-CCITT-FALSE：初值 0xffff，多项式 0x1021，不反射，不做末尾异或。
// 输入为 USB 帧头与负载；调用方把结果按低字节、高字节顺序附在帧尾。
static inline uint16_t gyro_crc16(const uint8_t *bytes,size_t count) {
    uint16_t crc=0xffff;
    for(size_t i=0;i<count;i++) {
        crc^=(uint16_t)bytes[i]<<8;
        for(int bit=0;bit<8;bit++) crc=(crc&0x8000)?(uint16_t)((crc<<1)^0x1021):(uint16_t)(crc<<1);
    }
    return crc;
}
// 安装原生 USB 驱动并启动收发任务；传感器采样仍由 main.c 管理。
void usb_controller_start(void);
