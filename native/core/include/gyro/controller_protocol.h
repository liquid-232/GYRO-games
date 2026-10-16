/*
 * ESP32-C3 / MPU6050 原生控制器协议。
 * 与浏览器和固件共用 GYB1/GYB2 姿态、GYC2 命令、GYU2/GYA2 USB 帧格式。
 * 核心只解析字节，不依赖 Unreal、串口、蓝牙、异常或 RTTI，也不分配堆内存。
 */
#pragma once
#include <array>
#include <cstddef>
#include <cstdint>

namespace gyro {

// UUID 与 firmware/main/ble_controller.c 一致，供后续 Windows BLE 传输层使用。
inline constexpr char kBleService[] = "7b6a0001-8e7f-4a23-a83b-e55a7634cc01";
inline constexpr char kBleMotion[] = "7b6a0002-8e7f-4a23-a83b-e55a7634cc01";
inline constexpr char kBleCommand[] = "7b6a0003-8e7f-4a23-a83b-e55a7634cc01";
inline constexpr std::size_t kMotionSize = 20;
inline constexpr std::size_t kReplySize = 9;
inline constexpr std::size_t kUsbMotionSize = 26;
inline constexpr std::uint64_t kStaleMs = 150;
inline constexpr std::uint8_t kSensorOk = 1;
inline constexpr std::uint8_t kCalibrating = 2;
inline constexpr std::uint8_t kReady = 4;

// 角度单位为度；GYB1 的尾部是采样周期，GYB2 的尾部是相对偏航。
// 0.01 度只是协议量化分辨率，不代表传感器的实测精度。
struct MotionPacket {
    std::uint8_t version = 0;
    std::uint32_t sequence = 0;
    std::uint32_t device_us = 0;
    float roll = 0;
    float pitch = 0;
    float yaw = 0;
    std::uint8_t flags = 0;
    std::uint8_t motion_dps = 0;
    std::uint16_t period_us = 0;
    bool has_yaw = false;
};

struct CommandReply {
    std::uint8_t op = 0;
    std::uint32_t id = 0;
    std::uint32_t device_us = 0;
};

// 拒绝长度、标识、角度或状态组合异常的数据；失败时不修改输出参数。
bool decode_motion(const std::uint8_t* bytes, std::size_t size, MotionPacket& out) noexcept;
bool decode_reply(const std::uint8_t* bytes, std::size_t size, CommandReply& out) noexcept;

// CRC16-CCITT-FALSE：初值 0xffff、多项式 0x1021、不反射、不做末尾异或。
// size>0 时 bytes 必须有效；空串校验值为 0xffff。
std::uint16_t crc16_ccitt_false(const std::uint8_t* bytes, std::size_t size) noexcept;

// 返回编码长度（BLE 5 字节 / USB 11 字节）；非法操作或容量不足返回 0。
// BLE 支持 1=校准、2=探测；USB 另支持 3=停止发送。失败时不修改输出缓冲。
std::size_t encode_ble_command(std::uint8_t op, std::uint32_t id,
                              std::uint8_t* output, std::size_t capacity) noexcept;
std::size_t encode_usb_command(std::uint8_t op, std::uint32_t id,
                              std::uint8_t* output, std::size_t capacity) noexcept;

// 每批最多返回一个姿态（本批最后一个有效帧）；应答则逐条通过回调交付。
// 回调中的引用只在本次调用期间有效，不可在回调中重入同一个解码器。
using ReplyCallback = void (*)(const CommandReply& reply, void* context);
struct DecodeBatch {
    MotionPacket motion{};
    bool has_motion = false;
    std::size_t motion_count = 0;
    std::size_t reply_count = 0;
};

// 单线程对象；USB 读取线程调用 push，然后把结果投递到游戏线程。
// 固定 26 字节缓冲支持任意拆包、粘包和垃圾前缀，坏 CRC 逐字节重新同步。
class UsbFrameDecoder {
public:
    DecodeBatch push(const std::uint8_t* bytes, std::size_t size,
                     ReplyCallback on_reply = nullptr, void* context = nullptr) noexcept;
    void clear() noexcept;
    std::size_t buffered_size() const noexcept { return used_; }
private:
    void discard(std::size_t count) noexcept;
    std::array<std::uint8_t, kUsbMotionSize> buffer_{};
    std::size_t used_ = 0;
};

// 只保留最新样本，以 uint32 序号差处理回绕和旧包。
// 重复序号只更新状态位，绝不延长样本新鲜期；重连/设备重启后调用 clear。
// now_ms 应来自单调时钟，不能用会被系统校时修改的日历时间。
class LatestMotionFeed {
public:
    bool ingest(const MotionPacket& packet, std::uint64_t now_ms) noexcept;
    bool is_fresh(std::uint64_t now_ms) const noexcept;
    const MotionPacket* latest() const noexcept { return has_packet_ ? &packet_ : nullptr; }
    std::uint64_t received_at_ms() const noexcept { return received_at_ms_; }
    void clear() noexcept;
private:
    MotionPacket packet_{};
    std::uint64_t received_at_ms_ = 0;
    bool has_packet_ = false;
    bool has_sample_ = false;
};

} // namespace gyro
