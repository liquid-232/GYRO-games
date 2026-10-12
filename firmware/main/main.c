/*
 * 固件入口与 MPU6050 采样任务。
 * 接线：VCC→3V3，GND→GND，SDA→GPIO4，SCL→GPIO5。
 * 用 I2C 以目标 200 Hz 采样，完成静止校准与三轴姿态融合。
 * BLE 和 USB 以目标 100 Hz 读取最新快照，通信任务不直接访问 I2C。
 * 蓝牙 / USB 的校准命令只设置请求标记，由采样任务执行滤波器复位。
 */
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "attitude.h"
#include "gyro_packet.h"

// I2C 引脚与对外发布的状态位，需与浏览器协议保持一致。
#define SDA_PIN 4
#define SCL_PIN 5
#define SENSOR_OK 1
#define CALIBRATING 2
#define READY 4
static const char *TAG="gyro";

// 采样任务写入、通信任务读取，使用同一临界区保护快照及校准请求。
static gyro_snapshot_t latest={.period_us=5000};
static portMUX_TYPE lock=portMUX_INITIALIZER_UNLOCKED;
static bool calibrate_requested;
static i2c_master_bus_handle_t bus;
static i2c_master_dev_handle_t imu;

// 先写寄存器地址，再重复起始读取；单次事务最多等待 10 ms。
static esp_err_t read_register(uint8_t reg, uint8_t *data, size_t len) {
    return i2c_master_transmit_receive(imu,&reg,1,data,len,10);
}
// 写入一字节寄存器配置，返回 ESP-IDF I2C 错误码供调用方判断。
static esp_err_t write_register(uint8_t reg,uint8_t value) {
    uint8_t data[]={reg,value}; return i2c_master_transmit(imu,data,2,10);
}
// 初始化或故障后重建 MPU6050 句柄，依次探测 AD0 对应的 0x68 / 0x69。
static bool start_sensor(void) {
    if (imu) { i2c_master_bus_rm_device(imu); imu=NULL; }
    for(int address=0x68;address<=0x69;address++) {
        if(i2c_master_probe(bus,address,20)!=ESP_OK) continue;
        i2c_device_config_t config={.dev_addr_length=I2C_ADDR_BIT_LEN_7,.device_address=address,.scl_speed_hz=400000};
        if(i2c_master_bus_add_device(bus,&config,&imu)!=ESP_OK) continue;
        // WHO_AM_I（0x75）确认器件身份，屏蔽地址选择位后应为 0x68。
        uint8_t who=0;
        if(read_register(0x75,&who,1)==ESP_OK && (who&0x7e)==0x68) {
            // PWR_MGMT_1（0x6b）先复位，再等待芯片完成复位。
            if(write_register(0x6b,0x80)!=ESP_OK) break;
            vTaskDelay(pdMS_TO_TICKS(100));
            // 0x6b/0x6c：使用陀螺仪 PLL 时钟并启用所有轴。
            // 0x1a=2：数字低通约 98 Hz；0x19=4：1 kHz/(1+4)=200 Hz。
            // 0x1b=8：陀螺仪 ±500 °/s；0x1c=8：加速度计 ±4 g。
            // 0x38=1：使能数据就绪状态；本项目轮询状态，不使用 INT 引脚。
            if(write_register(0x6b,0x01)!=ESP_OK || write_register(0x6c,0)!=ESP_OK ||
               write_register(0x1a,2)!=ESP_OK || write_register(0x19,4)!=ESP_OK ||
               write_register(0x1b,8)!=ESP_OK || write_register(0x1c,8)!=ESP_OK ||
               write_register(0x38,1)!=ESP_OK) break;
            ESP_LOGI(TAG,"MPU6050 found at 0x%02x; SDA=4 SCL=5; 200 Hz, gyro +/-500 dps, accel +/-4g",address);
            return true;
        }
        i2c_master_bus_rm_device(imu); imu=NULL;
    }
    if(imu) { i2c_master_bus_rm_device(imu); imu=NULL; }
    return false;
}
// MPU6050 寄存器按高字节在前存放，将两字节拼为有符号 16 位数。
static int16_t word(const uint8_t *p) { return (int16_t)((p[0]<<8)|p[1]); }
// 唯一访问 I2C 的任务：处理校准请求、采样、姿态融合和故障重试。
static void sensor_task(void *arg) {
    (void)arg;
    // 400 kHz 在器件句柄中设置；内部上拉辅助外部模块上拉，滤除短毛刺。
    i2c_master_bus_config_t config={.i2c_port=I2C_NUM_0,.sda_io_num=SDA_PIN,.scl_io_num=SCL_PIN,
        .clk_source=I2C_CLK_SRC_DEFAULT,.glitch_ignore_cnt=7,.flags.enable_internal_pullup=true};
    ESP_ERROR_CHECK(i2c_new_master_bus(&config,&bus));
    attitude_t filter;
    uint32_t sequence=0;
    for(;;) {
        // 尚未初始化或数据中断时先发布无效状态，避免沿用旧姿态。
        portENTER_CRITICAL(&lock); latest.flags=0; portEXIT_CRITICAL(&lock);
        if(!start_sensor()) { ESP_LOGW(TAG,"MPU6050 unavailable: check 3V3/GND/SDA4/SCL5"); vTaskDelay(pdMS_TO_TICKS(1000)); continue; }
        attitude_reset(&filter);
        int64_t last_sample=esp_timer_get_time(),last_report=0;
        TickType_t wake=xTaskGetTickCount();
        for(;;) {
            vTaskDelayUntil(&wake,pdMS_TO_TICKS(5));
            bool reset;
            portENTER_CRITICAL(&lock); reset=calibrate_requested; calibrate_requested=false; portEXIT_CRITICAL(&lock);
            // 校准命令不在通信线程中操作滤波器，统一由采样任务执行。
            if(reset) attitude_reset(&filter);
            uint8_t status=0,data[14];
            int64_t now=esp_timer_get_time();
            // 先检查 INT_STATUS 数据就绪位，再读取加速度、温度和角速度共 14 字节。
            if(read_register(0x3a,&status,1)!=ESP_OK || !(status&1) || read_register(0x3b,data,14)!=ESP_OK) {
                // 允许偶发缺样；连续 100 ms 没有成功采样则重新初始化传感器。
                if(now-last_sample>100000) break;
                continue;
            }
            // 当前量程对应 8192 LSB/g 和 65.5 LSB/(°/s)；温度字节暂不使用。
            float a[]={word(data)/8192.f,word(data+2)/8192.f,word(data+4)/8192.f};
            float g[]={word(data+8)/65.5f,word(data+10)/65.5f,word(data+12)/65.5f};
            gyro_snapshot_t packet={.sequence=++sequence,.device_us=(uint32_t)now,
                .motion_dps=sqrtf(g[0]*g[0]+g[1]*g[1]+g[2]*g[2]),
                .period_us=(uint16_t)fminf(now-last_sample,65535)};
            float roll, pitch;
            // 用实际微秒间隔积分，避免把调度延迟误当成固定的 5 ms。
            attitude_step(&filter,a,g,(now-last_sample)/1000000.f,&roll,&pitch);
            packet.roll=roll; packet.pitch=pitch; packet.yaw=attitude_yaw(&filter);
            // 静止检测使用扣除零偏后的模长，避免模块出厂零偏妨碍设置中位。
            if(filter.ready) {
                float x=g[0]-filter.bias[0],y=g[1]-filter.bias[1],z=g[2]-filter.bias[2];
                packet.motion_dps=sqrtf(x*x+y*y+z*z);
            }
            last_sample=now;
            packet.flags=SENSOR_OK|(filter.ready?READY:CALIBRATING);
            // 一次性发布整个快照，确保 BLE 与 USB 读到一致的序号、时钟和角度。
            portENTER_CRITICAL(&lock); latest=packet; portEXIT_CRITICAL(&lock);
            // 低频诊断日志；双模式固件由 USB 模块抑制文字输出，防止混入帧数据。
            if(now-last_report>2000000) {
                ESP_LOGI(TAG,"%s sample=%lu roll=%.2f pitch=%.2f calibration=%u/400",
                    filter.ready?"READY":"KEEP STILL",(unsigned long)sequence,packet.roll,packet.pitch,filter.count);
                if(!filter.ready) ESP_LOGI(TAG,"Calibration input: |accel|=%.3fg gyro=(%.2f,%.2f,%.2f) dps",
                    sqrtf(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]),g[0],g[1],g[2]);
                last_report=now;
            }
        }
        ESP_LOGW(TAG,"Sensor stream interrupted; reinitializing");
    }
}
// 拷贝快照后再检查年龄；无符号差值允许低 32 位微秒时钟自然回绕。
void gyro_get_snapshot(gyro_snapshot_t *out) {
    portENTER_CRITICAL(&lock); *out=latest; portEXIT_CRITICAL(&lock);
    if ((uint32_t)((uint32_t)esp_timer_get_time()-out->device_us)>100000) out->flags=0;
}
// 立即撤销 READY 状态，下一轮采样再真正复位滤波器。
void gyro_request_calibration(void) {
    portENTER_CRITICAL(&lock);
    calibrate_requested=true;
    latest.flags=(latest.flags&SENSOR_OK)?SENSOR_OK|CALIBRATING:0;
    portEXIT_CRITICAL(&lock);
}
// ESP-IDF 应用入口：准备 NVS，初始化两种通信，再启动高优先级采样任务。
void app_main(void) {
    esp_err_t error=nvs_flash_init();
    // NVS 空间不足或格式不兼容时清空并重新初始化，供蓝牙存储配置使用。
    if(error==ESP_ERR_NVS_NO_FREE_PAGES || error==ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase()); error=nvs_flash_init();
    }
    ESP_ERROR_CHECK(error);
    usb_controller_start();
    ble_controller_start();
    // 优先级 8 高于通信任务的 5，栈大小为 4096 字节，减少通信对采样的干扰。
    configASSERT(xTaskCreate(sensor_task,"imu",4096,NULL,8,NULL)==pdPASS);
}
