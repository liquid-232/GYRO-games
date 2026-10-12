#pragma once
#include <math.h>
#include <string.h>
#include "ble_controller.h"
typedef struct __attribute__((packed)) {
    char magic[4]; uint32_t sequence, device_us;
    int16_t roll_cdeg, pitch_cdeg; uint8_t flags, motion_dps; int16_t yaw_cdeg;
} motion_packet_t;
_Static_assert(sizeof(motion_packet_t)==20,"Motion packet must be 20 bytes");
static inline motion_packet_t gyro_make_motion(void) {
    gyro_snapshot_t sample; gyro_get_snapshot(&sample);
    return (motion_packet_t){.magic={'G','Y','B','2'},.sequence=sample.sequence,.device_us=sample.device_us,
        .roll_cdeg=(int16_t)lroundf(sample.roll*100),.pitch_cdeg=(int16_t)lroundf(sample.pitch*100),
        .flags=sample.flags,.motion_dps=(uint8_t)fminf(255,lroundf(sample.motion_dps)),.yaw_cdeg=(int16_t)lroundf(sample.yaw*100)};
}
static inline uint16_t gyro_crc16(const uint8_t *bytes,size_t count) {
    uint16_t crc=0xffff;
    for(size_t i=0;i<count;i++) {
        crc^=(uint16_t)bytes[i]<<8;
        for(int bit=0;bit<8;bit++) crc=(crc&0x8000)?(uint16_t)((crc<<1)^0x1021):(uint16_t)(crc<<1);
    }
    return crc;
}
void usb_controller_start(void);
