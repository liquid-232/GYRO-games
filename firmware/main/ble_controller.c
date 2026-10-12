#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "host/ble_uuid.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "gyro_packet.h"

static const char *TAG="gyro_ble";
// 7b6a0001-8e7f-4a23-a83b-e55a7634cc01; NimBLE UUID bytes are reversed.
static const ble_uuid128_t service_uuid=BLE_UUID128_INIT(0x01,0xcc,0x34,0x76,0x5a,0xe5,0x3b,0xa8,0x23,0x4a,0x7f,0x8e,0x01,0x00,0x6a,0x7b);
static const ble_uuid128_t motion_uuid=BLE_UUID128_INIT(0x01,0xcc,0x34,0x76,0x5a,0xe5,0x3b,0xa8,0x23,0x4a,0x7f,0x8e,0x02,0x00,0x6a,0x7b);
static const ble_uuid128_t command_uuid=BLE_UUID128_INIT(0x01,0xcc,0x34,0x76,0x5a,0xe5,0x3b,0xa8,0x23,0x4a,0x7f,0x8e,0x03,0x00,0x6a,0x7b);

typedef struct __attribute__((packed)) { uint8_t op; uint32_t id; } command_t;
typedef struct __attribute__((packed)) { uint8_t op; uint32_t id, device_us; } reply_t;
_Static_assert(sizeof(motion_packet_t)==20,"BLE motion must fit one notification");
_Static_assert(sizeof(command_t)==5,"BLE command must be 5 bytes");
_Static_assert(sizeof(reply_t)==9,"BLE reply must be 9 bytes");
static reply_t last_reply;
static uint16_t motion_handle, connection=BLE_HS_CONN_HANDLE_NONE;
static uint8_t own_addr_type;
static bool subscribed, notify_pending, notify_inflight, synced;
static portMUX_TYPE ble_lock=portMUX_INITIALIZER_UNLOCKED;
static struct ble_npl_event notify_event;

static motion_packet_t make_packet(void) { return gyro_make_motion(); }
static int motion_access(uint16_t conn,uint16_t attr,struct ble_gatt_access_ctxt *ctxt,void *arg) {
    (void)conn; (void)attr; (void)arg;
    if(ctxt->op!=BLE_GATT_ACCESS_OP_READ_CHR) return BLE_ATT_ERR_READ_NOT_PERMITTED;
    motion_packet_t packet=make_packet();
    return os_mbuf_append(ctxt->om,&packet,sizeof(packet))==0?0:BLE_ATT_ERR_INSUFFICIENT_RES;
}
static int command_access(uint16_t conn,uint16_t attr,struct ble_gatt_access_ctxt *ctxt,void *arg) {
    (void)conn; (void)attr; (void)arg;
    if(ctxt->op==BLE_GATT_ACCESS_OP_READ_CHR)
        return os_mbuf_append(ctxt->om,&last_reply,sizeof(last_reply))==0?0:BLE_ATT_ERR_INSUFFICIENT_RES;
    if(ctxt->op!=BLE_GATT_ACCESS_OP_WRITE_CHR) return BLE_ATT_ERR_WRITE_NOT_PERMITTED;
    command_t command; uint16_t len=0;
    if(OS_MBUF_PKTLEN(ctxt->om)!=sizeof(command) ||
       ble_hs_mbuf_to_flat(ctxt->om,&command,sizeof(command),&len)!=0 || len!=sizeof(command))
        return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    if(command.op!=1 && command.op!=2) return BLE_ATT_ERR_VALUE_NOT_ALLOWED;
    if(command.op==1) gyro_request_calibration();
    last_reply=(reply_t){.op=command.op,.id=command.id,.device_us=(uint32_t)esp_timer_get_time()};
    return 0;
}
static const struct ble_gatt_svc_def services[]={
    {.type=BLE_GATT_SVC_TYPE_PRIMARY,.uuid=&service_uuid.u,
     .characteristics=(struct ble_gatt_chr_def[]){
        {.uuid=&motion_uuid.u,.access_cb=motion_access,.flags=BLE_GATT_CHR_F_READ|BLE_GATT_CHR_F_NOTIFY,.val_handle=&motion_handle},
        {.uuid=&command_uuid.u,.access_cb=command_access,.flags=BLE_GATT_CHR_F_READ|BLE_GATT_CHR_F_WRITE},
        {0}}},
    {0}
};
static void advertise(void);
static void log_interval(uint16_t handle) {
    struct ble_gap_conn_desc desc;
    if(ble_gap_conn_find(handle,&desc)==0)
        ESP_LOGI(TAG,"BLE interval=%.2f ms, latency=%u, supervision=%u ms",desc.conn_itvl*1.25f,desc.conn_latency,desc.supervision_timeout*10);
}
static int gap_event(struct ble_gap_event *event,void *arg) {
    (void)arg;
    switch(event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if(event->connect.status!=0) { advertise(); break; }
        portENTER_CRITICAL(&ble_lock);
        connection=event->connect.conn_handle; subscribed=false; notify_inflight=false;
        portEXIT_CRITICAL(&ble_lock);
        ESP_LOGI(TAG,"BLE connected; handle=%u",connection);
        log_interval(connection);
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        portENTER_CRITICAL(&ble_lock);
        connection=BLE_HS_CONN_HANDLE_NONE; subscribed=false; notify_inflight=false;
        portEXIT_CRITICAL(&ble_lock);
        ESP_LOGI(TAG,"BLE disconnected; reason=%d",event->disconnect.reason);
        advertise();
        break;
    case BLE_GAP_EVENT_SUBSCRIBE:
        if(event->subscribe.attr_handle==motion_handle) {
            portENTER_CRITICAL(&ble_lock); subscribed=event->subscribe.cur_notify; portEXIT_CRITICAL(&ble_lock);
            ESP_LOGI(TAG,"Motion notifications %s",subscribed?"enabled":"disabled");
            if(subscribed) {
                // Finish GATT discovery before negotiating a faster link on Windows.
                struct ble_gap_upd_params params={.itvl_min=6,.itvl_max=12,.latency=0,.supervision_timeout=200};
                int rc=ble_gap_update_params(connection,&params);
                if(rc) ESP_LOGW(TAG,"Interval request returned %d; central chooses actual interval",rc);
            }
        }
        break;
    case BLE_GAP_EVENT_NOTIFY_TX:
        if(event->notify_tx.attr_handle==motion_handle && !event->notify_tx.indication) {
            portENTER_CRITICAL(&ble_lock); notify_inflight=false; portEXIT_CRITICAL(&ble_lock);
        }
        break;
    case BLE_GAP_EVENT_CONN_UPDATE:
        if(event->conn_update.status==0) log_interval(event->conn_update.conn_handle);
        else ESP_LOGW(TAG,"Central refused interval update: %d",event->conn_update.status);
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        advertise(); break;
    default: break;
    }
    return 0;
}
static void advertise(void) {
    struct ble_hs_adv_fields fields={0};
    fields.flags=BLE_HS_ADV_F_DISC_GEN|BLE_HS_ADV_F_BREDR_UNSUP;
    fields.uuids128=(ble_uuid128_t*)&service_uuid; fields.num_uuids128=1; fields.uuids128_is_complete=1;
    int rc=ble_gap_adv_set_fields(&fields);
    if(rc) { ESP_LOGE(TAG,"Advertising service failed: %d",rc); return; }
    memset(&fields,0,sizeof(fields));
    const char *name=ble_svc_gap_device_name();
    fields.name=(const uint8_t*)name; fields.name_len=strlen(name); fields.name_is_complete=1;
    rc=ble_gap_adv_rsp_set_fields(&fields);
    if(rc) { ESP_LOGE(TAG,"Advertising name failed: %d",rc); return; }
    struct ble_gap_adv_params params={.conn_mode=BLE_GAP_CONN_MODE_UND,.disc_mode=BLE_GAP_DISC_MODE_GEN,.itvl_min=48,.itvl_max=80};
    rc=ble_gap_adv_start(own_addr_type,NULL,BLE_HS_FOREVER,&params,gap_event,NULL);
    if(rc) ESP_LOGE(TAG,"Advertising start failed: %d",rc);
    else ESP_LOGI(TAG,"Advertising %s; select it from the game's Bluetooth picker",name);
}
static void on_sync(void) {
    int rc=ble_hs_util_ensure_addr(0); assert(rc==0);
    rc=ble_hs_id_infer_auto(0,&own_addr_type); assert(rc==0);
    uint8_t address[6]; rc=ble_hs_id_copy_addr(own_addr_type,address,NULL); assert(rc==0);
    char name[26]; snprintf(name,sizeof(name),"GYRO-C3-BLE-%02X%02X",address[1],address[0]);
    rc=ble_svc_gap_device_name_set(name); assert(rc==0);
    portENTER_CRITICAL(&ble_lock); synced=true; portEXIT_CRITICAL(&ble_lock);
    advertise();
}
static void on_reset(int reason) {
    portENTER_CRITICAL(&ble_lock);
    synced=false; connection=BLE_HS_CONN_HANDLE_NONE; subscribed=false; notify_inflight=false; notify_pending=false;
    portEXIT_CRITICAL(&ble_lock);
    ESP_LOGW(TAG,"BLE host reset: %d",reason);
}
static void notify_latest(struct ble_npl_event *event) {
    (void)event;
    portENTER_CRITICAL(&ble_lock);
    notify_pending=false;
    uint16_t conn=connection;
    bool send=synced && subscribed && conn!=BLE_HS_CONN_HANDLE_NONE && !notify_inflight;
    if(send) notify_inflight=true;
    portEXIT_CRITICAL(&ble_lock);
    if(!send) return;
    motion_packet_t packet=make_packet();
    struct os_mbuf *buffer=ble_hs_mbuf_from_flat(&packet,sizeof(packet));
    int rc=buffer?ble_gatts_notify_custom(conn,motion_handle,buffer):BLE_HS_ENOMEM;
    if(rc) { portENTER_CRITICAL(&ble_lock); notify_inflight=false; portEXIT_CRITICAL(&ble_lock); }
    // NimBLE consumes the mbuf, including on error. No historical samples are queued here.
}
static void notification_task(void *arg) {
    (void)arg; TickType_t wake=xTaskGetTickCount();
    for(;;) {
        vTaskDelayUntil(&wake,pdMS_TO_TICKS(10));
        portENTER_CRITICAL(&ble_lock);
        bool queue=synced && subscribed && connection!=BLE_HS_CONN_HANDLE_NONE && !notify_pending && !notify_inflight;
        if(queue) notify_pending=true;
        portEXIT_CRITICAL(&ble_lock);
        if(queue) ble_npl_eventq_put(nimble_port_get_dflt_eventq(),&notify_event);
    }
}
static void host_task(void *arg) {
    (void)arg; nimble_port_run(); nimble_port_freertos_deinit();
}
void ble_store_config_init(void);
void ble_controller_start(void) {
    esp_log_level_set("NimBLE",ESP_LOG_WARN); // Avoid formatting a log for every notification.
    ESP_ERROR_CHECK(nimble_port_init());
    ble_hs_cfg.sync_cb=on_sync; ble_hs_cfg.reset_cb=on_reset;
    ble_hs_cfg.sm_io_cap=BLE_HS_IO_NO_INPUT_OUTPUT;
    ble_hs_cfg.sm_sc=1;
    ble_svc_gap_init(); ble_svc_gatt_init();
    int rc=ble_gatts_count_cfg(services); assert(rc==0);
    rc=ble_gatts_add_svcs(services); assert(rc==0);
    ble_store_config_init();
    ble_npl_event_init(&notify_event,notify_latest,NULL);
    nimble_port_freertos_init(host_task);
    configASSERT(xTaskCreate(notification_task,"ble_notify",3072,NULL,5,NULL)==pdPASS);
}
