idf_component_register(SRCS "main.c" "ble_controller.c" "usb_controller.c" INCLUDE_DIRS "."
    REQUIRES esp_driver_i2c esp_driver_usb_serial_jtag bt esp_timer nvs_flash)
