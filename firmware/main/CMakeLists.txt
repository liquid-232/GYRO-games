idf_component_register(SRCS "main.c" "ble_controller.c" INCLUDE_DIRS "."
    REQUIRES esp_driver_i2c bt esp_timer nvs_flash)
