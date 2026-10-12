#include <stdarg.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/usb_serial_jtag.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "gyro_packet.h"

// USB owns the serial channel; runtime text logs must not race its driver writes.
static int quiet_console(const char *format,va_list args) { (void)format; (void)args; return 0; }
static void send_frame(const char magic[4],const void *payload,size_t length) {
    uint8_t frame[26]; memcpy(frame,magic,4); memcpy(frame+4,payload,length);
    uint16_t crc=gyro_crc16(frame,length+4); frame[length+4]=crc; frame[length+5]=crc>>8;
    // Small TX buffer and zero wait: the USB task cannot block the sensor/BLE tasks.
    usb_serial_jtag_write_bytes(frame,length+6,0);
}
static void usb_task(void *arg) {
    (void)arg; uint8_t input[64]; size_t used=0; int64_t stream_until=0;
    TickType_t wake=xTaskGetTickCount();
    for(;;) {
        vTaskDelayUntil(&wake,pdMS_TO_TICKS(10));
        int n=usb_serial_jtag_read_bytes(input+used,sizeof(input)-used,0);
        if(n>0) used+=n;
        while(used>=11) {
            uint16_t crc=gyro_crc16(input,9);
            if(memcmp(input,"GYC2",4)!=0 || input[9]!=(uint8_t)crc || input[10]!=(uint8_t)(crc>>8)) {
                memmove(input,input+1,--used); continue;
            }
            uint8_t op=input[4]; uint32_t id; memcpy(&id,input+5,4);
            memmove(input,input+11,used-11); used-=11;
            if(op<1 || op>3) continue;
            int64_t now=esp_timer_get_time();
            if(op==1) gyro_request_calibration();
            stream_until=op==3?0:now+3000000;
            uint8_t reply[9]; reply[0]=op; memcpy(reply+1,&id,4);
            uint32_t device_us=(uint32_t)now; memcpy(reply+5,&device_us,4);
            send_frame("GYA2",reply,sizeof(reply));
        }
        if(esp_timer_get_time()<stream_until && usb_serial_jtag_is_connected()) {
            motion_packet_t packet=gyro_make_motion(); send_frame("GYU2",&packet,sizeof(packet));
        }
    }
}
void usb_controller_start(void) {
    esp_log_set_vprintf(quiet_console);
    usb_serial_jtag_driver_config_t config={.tx_buffer_size=256,.rx_buffer_size=256};
    ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&config));
    configASSERT(xTaskCreate(usb_task,"usb_pose",3072,NULL,5,NULL)==pdPASS);
}
