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
#include "ble_controller.h"

#define SDA_PIN 4
#define SCL_PIN 5
#define SENSOR_OK 1
#define CALIBRATING 2
#define READY 4
static const char *TAG="gyro";

static gyro_snapshot_t latest={.period_us=5000};
static portMUX_TYPE lock=portMUX_INITIALIZER_UNLOCKED;
static bool calibrate_requested;
static i2c_master_bus_handle_t bus;
static i2c_master_dev_handle_t imu;

static esp_err_t read_register(uint8_t reg, uint8_t *data, size_t len) {
    return i2c_master_transmit_receive(imu,&reg,1,data,len,10);
}
static esp_err_t write_register(uint8_t reg,uint8_t value) {
    uint8_t data[]={reg,value}; return i2c_master_transmit(imu,data,2,10);
}
static bool start_sensor(void) {
    if (imu) { i2c_master_bus_rm_device(imu); imu=NULL; }
    for(int address=0x68;address<=0x69;address++) {
        if(i2c_master_probe(bus,address,20)!=ESP_OK) continue;
        i2c_device_config_t config={.dev_addr_length=I2C_ADDR_BIT_LEN_7,.device_address=address,.scl_speed_hz=400000};
        if(i2c_master_bus_add_device(bus,&config,&imu)!=ESP_OK) continue;
        uint8_t who=0;
        if(read_register(0x75,&who,1)==ESP_OK && (who&0x7e)==0x68) {
            if(write_register(0x6b,0x80)!=ESP_OK) break;
            vTaskDelay(pdMS_TO_TICKS(100));
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
static int16_t word(const uint8_t *p) { return (int16_t)((p[0]<<8)|p[1]); }
static void sensor_task(void *arg) {
    (void)arg;
    i2c_master_bus_config_t config={.i2c_port=I2C_NUM_0,.sda_io_num=SDA_PIN,.scl_io_num=SCL_PIN,
        .clk_source=I2C_CLK_SRC_DEFAULT,.glitch_ignore_cnt=7,.flags.enable_internal_pullup=true};
    ESP_ERROR_CHECK(i2c_new_master_bus(&config,&bus));
    attitude_t filter;
    uint32_t sequence=0;
    for(;;) {
        portENTER_CRITICAL(&lock); latest.flags=0; portEXIT_CRITICAL(&lock);
        if(!start_sensor()) { ESP_LOGW(TAG,"MPU6050 unavailable: check 3V3/GND/SDA4/SCL5"); vTaskDelay(pdMS_TO_TICKS(1000)); continue; }
        attitude_reset(&filter);
        int64_t last_sample=esp_timer_get_time(),last_report=0;
        TickType_t wake=xTaskGetTickCount();
        for(;;) {
            vTaskDelayUntil(&wake,pdMS_TO_TICKS(5));
            bool reset;
            portENTER_CRITICAL(&lock); reset=calibrate_requested; calibrate_requested=false; portEXIT_CRITICAL(&lock);
            if(reset) attitude_reset(&filter);
            uint8_t status=0,data[14];
            int64_t now=esp_timer_get_time();
            if(read_register(0x3a,&status,1)!=ESP_OK || !(status&1) || read_register(0x3b,data,14)!=ESP_OK) {
                if(now-last_sample>100000) break;
                continue;
            }
            float a[]={word(data)/8192.f,word(data+2)/8192.f,word(data+4)/8192.f};
            float g[]={word(data+8)/65.5f,word(data+10)/65.5f,word(data+12)/65.5f};
            gyro_snapshot_t packet={.sequence=++sequence,.device_us=(uint32_t)now,
                .motion_dps=sqrtf(g[0]*g[0]+g[1]*g[1]+g[2]*g[2]),
                .period_us=(uint16_t)fminf(now-last_sample,65535)};
            float roll, pitch;
            attitude_step(&filter,a,g,(now-last_sample)/1000000.f,&roll,&pitch);
            packet.roll=roll; packet.pitch=pitch; packet.yaw=attitude_yaw(&filter);
            if(filter.ready) {
                float x=g[0]-filter.bias[0],y=g[1]-filter.bias[1],z=g[2]-filter.bias[2];
                packet.motion_dps=sqrtf(x*x+y*y+z*z);
            }
            last_sample=now;
            packet.flags=SENSOR_OK|(filter.ready?READY:CALIBRATING);
            portENTER_CRITICAL(&lock); latest=packet; portEXIT_CRITICAL(&lock);
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
void gyro_get_snapshot(gyro_snapshot_t *out) {
    portENTER_CRITICAL(&lock); *out=latest; portEXIT_CRITICAL(&lock);
    if ((uint32_t)((uint32_t)esp_timer_get_time()-out->device_us)>100000) out->flags=0;
}
void gyro_request_calibration(void) {
    portENTER_CRITICAL(&lock);
    calibrate_requested=true;
    latest.flags=(latest.flags&SENSOR_OK)?SENSOR_OK|CALIBRATING:0;
    portEXIT_CRITICAL(&lock);
}
void app_main(void) {
    esp_err_t error=nvs_flash_init();
    if(error==ESP_ERR_NVS_NO_FREE_PAGES || error==ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase()); error=nvs_flash_init();
    }
    ESP_ERROR_CHECK(error);
    ble_controller_start();
    configASSERT(xTaskCreate(sensor_task,"imu",4096,NULL,8,NULL)==pdPASS);
}
