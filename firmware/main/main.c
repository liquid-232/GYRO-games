#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2c_master.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_event.h"
#include "esp_wifi.h"
#include "esp_mac.h"
#include "esp_timer.h"
#include "nvs_flash.h"
#include "lwip/sockets.h"
#include "attitude.h"

#define SDA_PIN 4
#define SCL_PIN 5
#define UDP_PORT 4210
#define SENSOR_OK 1
#define CALIBRATING 2
#define READY 4
static const char *TAG="gyro";

// ESP32-C3 is little-endian. Protocol layout is shared with game/gyro_bridge.py.
typedef struct __attribute__((packed)) {
    char magic[4]; uint32_t session, sequence, device_us;
    float roll, pitch, gx, gy, gz; uint16_t flags, period_us;
} motion_packet_t;
typedef struct __attribute__((packed)) { char magic[4]; uint32_t session, op, arg; } command_t;
_Static_assert(sizeof(motion_packet_t)==40, "Motion protocol must be 40 bytes");
_Static_assert(sizeof(command_t)==16, "Command protocol must be 16 bytes");
static motion_packet_t latest={.magic={'G','Y','R','1'},.period_us=5000};
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
            motion_packet_t packet={.magic={'G','Y','R','1'},.sequence=++sequence,.device_us=(uint32_t)now,
                .gx=g[0],.gy=g[1],.gz=g[2],.period_us=(uint16_t)fminf(now-last_sample,65535)};
            float roll, pitch;
            attitude_step(&filter,a,g,(now-last_sample)/1000000.f,&roll,&pitch);
            packet.roll=roll; packet.pitch=pitch;
            last_sample=now;
            packet.flags=SENSOR_OK|(filter.ready?READY:CALIBRATING);
            portENTER_CRITICAL(&lock); latest=packet; portEXIT_CRITICAL(&lock);
            if(now-last_report>2000000) {
                ESP_LOGI(TAG,"%s sample=%lu roll=%.2f pitch=%.2f calibration=%u/400",
                    filter.ready?"READY":"KEEP STILL",(unsigned long)sequence,packet.roll,packet.pitch,filter.count);
                last_report=now;
            }
        }
        ESP_LOGW(TAG,"Sensor stream interrupted; reinitializing");
    }
}
static void wireless_task(void *arg) {
    (void)arg;
    int fd=socket(AF_INET,SOCK_DGRAM,IPPROTO_UDP);
    if(fd<0) { ESP_LOGE(TAG,"UDP socket failed"); vTaskDelete(NULL); return; }
    struct sockaddr_in local={.sin_family=AF_INET,.sin_port=htons(UDP_PORT),.sin_addr.s_addr=htonl(INADDR_ANY)};
    if(bind(fd,(struct sockaddr*)&local,sizeof(local))!=0) { ESP_LOGE(TAG,"UDP bind failed"); close(fd); vTaskDelete(NULL); return; }
    fcntl(fd,F_SETFL,O_NONBLOCK);
    struct sockaddr_in peer={0}; uint32_t session=0;
    int64_t expires=0,next_send=0;
    TickType_t wake=xTaskGetTickCount();
    for(;;) {
        int64_t now=esp_timer_get_time();
        // Bound work per iteration, so a burst cannot starve the sensor task.
        for(int i=0;i<8;i++) {
            uint8_t bytes[17]; struct sockaddr_in from; socklen_t len=sizeof(from);
            int n=recvfrom(fd,bytes,sizeof(bytes),0,(struct sockaddr*)&from,&len);
            if(n<0) break;
            if(n!=16) continue;
            command_t command; memcpy(&command,bytes,16);
            if(memcmp(command.magic,"GYC1",4) || !command.session) continue;
            bool owner=session==command.session && peer.sin_addr.s_addr==from.sin_addr.s_addr && peer.sin_port==from.sin_port;
            if(command.op==1 && (now>=expires || owner)) { peer=from; session=command.session; owner=true; }
            if(!owner) continue;
            expires=now+3000000;
            if(command.op==2) {
                command_t pong={.magic={'G','Y','P','1'},.session=session,.op=command.arg,.arg=(uint32_t)now};
                sendto(fd,&pong,sizeof(pong),0,(struct sockaddr*)&peer,sizeof(peer));
            } else if(command.op==3) {
                portENTER_CRITICAL(&lock); calibrate_requested=true; portEXIT_CRITICAL(&lock);
            } else if(command.op==4) { expires=0; session=0; }
        }
        if(session && now<expires && now>=next_send) {
            motion_packet_t packet;
            portENTER_CRITICAL(&lock); packet=latest; portEXIT_CRITICAL(&lock);
            packet.session=session;
            if((uint32_t)((uint32_t)now-packet.device_us)>100000) packet.flags=0;
            sendto(fd,&packet,sizeof(packet),0,(struct sockaddr*)&peer,sizeof(peer));
            next_send=now+10000; // Always latest sample; never replay a backlog.
        }
        vTaskDelayUntil(&wake,pdMS_TO_TICKS(1));
    }
}
void app_main(void) {
    esp_err_t error=nvs_flash_init();
    if(error==ESP_ERR_NVS_NO_FREE_PAGES || error==ESP_ERR_NVS_NEW_VERSION_FOUND) { ESP_ERROR_CHECK(nvs_flash_erase()); error=nvs_flash_init(); }
    ESP_ERROR_CHECK(error);
    ESP_ERROR_CHECK(esp_netif_init()); ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t init=WIFI_INIT_CONFIG_DEFAULT(); ESP_ERROR_CHECK(esp_wifi_init(&init));
    uint8_t mac[6]; ESP_ERROR_CHECK(esp_read_mac(mac,ESP_MAC_WIFI_SOFTAP));
    wifi_config_t wifi={.ap={.password="GyroPlay32",.channel=6,.max_connection=1,.authmode=WIFI_AUTH_WPA2_PSK,.pmf_cfg={.required=false}}};
    snprintf((char*)wifi.ap.ssid,sizeof(wifi.ap.ssid),"GYRO-C3-%02X%02X",mac[4],mac[5]);
    wifi.ap.ssid_len=strlen((char*)wifi.ap.ssid);
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP)); ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP,&wifi));
    ESP_ERROR_CHECK(esp_wifi_set_bandwidth(WIFI_IF_AP,WIFI_BW20)); ESP_ERROR_CHECK(esp_wifi_start());
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
    ESP_LOGI(TAG,"Join Wi-Fi %s, password GyroPlay32; controller 192.168.4.1:%d",wifi.ap.ssid,UDP_PORT);
    configASSERT(xTaskCreate(sensor_task,"imu",4096,NULL,8,NULL)==pdPASS);
    configASSERT(xTaskCreate(wireless_task,"udp",4096,NULL,5,NULL)==pdPASS);
}
