/*
 * Type-C 有线姿态通道：使用 ESP32-C3 原生 USB Serial/JTAG。
 * 接收 GYC2 命令，返回 GYA2 应答，发送 GYU2 姿态帧。
 * 帧尾附 CRC16-CCITT-FALSE，所有多字节整数使用小端序。
 * 命令 1：重新校准；2：时钟探测并续期；3：停止有线发送。
 * 发送依赖 3 秒租期，浏览器每秒续期，退出后自动停止发送。
 */
#include <stdarg.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/usb_serial_jtag.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "gyro_packet.h"

// USB 数据通道独占串口；抑制运行时文字日志，防止与驱动发送的数据竞争。
// 日志回调返回 0，不输出字符；传感器状态改由帧 flags 和游戏页面展示。
static int quiet_console(const char *format,va_list args) { (void)format; (void)args; return 0; }
// 拼接帧头、负载、CRC；调用方负载最长 20 字节，总帧长不超过 26 字节。
// CRC 覆盖帧头和负载，尾部按小端序写入；不等待队列空间。
static void send_frame(const char magic[4],const void *payload,size_t length) {
    uint8_t frame[26]; memcpy(frame,magic,4); memcpy(frame+4,payload,length);
    uint16_t crc=gyro_crc16(frame,length+4); frame[length+4]=crc; frame[length+5]=crc>>8;
    // 小缓冲且零等待；队列满时可能丢失或截断帧，接收端用 CRC 和帧头重新同步。
    usb_serial_jtag_write_bytes(frame,length+6,0);
}
// 每 10 ms 轮询命令并尝试发送最新姿态；此任务只读取快照，不访问 I2C。
static void usb_task(void *arg) {
    // 保留上一轮未组成完整命令的字节，适应 USB 拆包与粘包。
    (void)arg; uint8_t input[64]; size_t used=0; int64_t stream_until=0;
    TickType_t wake=xTaskGetTickCount();
    for(;;) {
        vTaskDelayUntil(&wake,pdMS_TO_TICKS(10));
        int n=usb_serial_jtag_read_bytes(input+used,sizeof(input)-used,0);
        if(n>0) used+=n;
        // GYC2 命令固定 11 字节：帧头 4 + 操作 1 + ID 4 + CRC 2。
        while(used>=11) {
            uint16_t crc=gyro_crc16(input,9);
            if(memcmp(input,"GYC2",4)!=0 || input[9]!=(uint8_t)crc || input[10]!=(uint8_t)(crc>>8)) {
                // 帧头或校验错误时仅丢弃一个字节，继续寻找下一帧边界。
                memmove(input,input+1,--used); continue;
            }
            // memcpy 避免在未对齐字节地址上直接读取 uint32_t。
            uint8_t op=input[4]; uint32_t id; memcpy(&id,input+5,4);
            memmove(input,input+11,used-11); used-=11;
            if(op<1 || op>3) continue;
            int64_t now=esp_timer_get_time();
            if(op==1) gyro_request_calibration();
            // 停止命令立即取消发送；校准或探测命令把租期延长到当前时刻后 3 秒。
            stream_until=op==3?0:now+3000000;
            // 应答回传操作、随机 ID 和设备时钟，便于浏览器核对与估算时钟关系。
            uint8_t reply[9]; reply[0]=op; memcpy(reply+1,&id,4);
            uint32_t device_us=(uint32_t)now; memcpy(reply+5,&device_us,4);
            send_frame("GYA2",reply,sizeof(reply));
        }
        // 必须既有有效租期，又接收到电脑 USB SOF；仅接充电宝时不发送。
        if(esp_timer_get_time()<stream_until && usb_serial_jtag_is_connected()) {
            motion_packet_t packet=gyro_make_motion(); send_frame("GYU2",&packet,sizeof(packet));
        }
    }
}
// 启动时安装一次驱动，TX/RX 各 256 字节，收发任务栈为 3072 字节。
void usb_controller_start(void) {
    esp_log_set_vprintf(quiet_console);
    usb_serial_jtag_driver_config_t config={.tx_buffer_size=256,.rx_buffer_size=256};
    ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&config));
    configASSERT(xTaskCreate(usb_task,"usb_pose",3072,NULL,5,NULL)==pdPASS);
}
