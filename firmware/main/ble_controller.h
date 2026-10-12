#pragma once
#include <stdint.h>

typedef struct {
    uint32_t sequence, device_us;
    float roll, pitch, yaw, motion_dps;
    uint16_t period_us;
    uint8_t flags;
} gyro_snapshot_t;
void gyro_get_snapshot(gyro_snapshot_t *out);
void gyro_request_calibration(void);
void ble_controller_start(void);
