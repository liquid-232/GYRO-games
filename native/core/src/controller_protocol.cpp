/*
 * 所有多字节读写都按固定偏移完成，避免结构体对齐、宿主字节序和未对齐访问问题。
 * 此实现同样由 Unreal 模块编译，独立 CMake 测试覆盖的就是游戏将使用的解码逻辑。
 */
#include "gyro/controller_protocol.h"
#include <cstring>

namespace gyro {
namespace {
std::uint16_t read_u16(const std::uint8_t* p) noexcept {
    return static_cast<std::uint16_t>(p[0] | (static_cast<std::uint16_t>(p[1]) << 8));
}
std::uint32_t read_u32(const std::uint8_t* p) noexcept {
    return static_cast<std::uint32_t>(p[0]) |
           (static_cast<std::uint32_t>(p[1]) << 8) |
           (static_cast<std::uint32_t>(p[2]) << 16) |
           (static_cast<std::uint32_t>(p[3]) << 24);
}
int read_i16(const std::uint8_t* p) noexcept {
    const int value = read_u16(p);
    // 显式转换补码，不依赖超出范围的无符号转有符号实现行为。
    return value >= 0x8000 ? value - 0x10000 : value;
}
void write_u32(std::uint8_t* p, std::uint32_t value) noexcept {
    for (unsigned i = 0; i < 4; ++i) p[i] = static_cast<std::uint8_t>(value >> (i * 8));
}
bool valid_flags(std::uint8_t flags) noexcept {
    return (flags & ~7u) == 0 && (flags & 6u) != 6u &&
           ((flags & 6u) == 0 || (flags & kSensorOk) != 0);
}
bool valid_op(std::uint8_t op) noexcept { return op >= 1 && op <= 3; }
}

bool decode_motion(const std::uint8_t* bytes, std::size_t size, MotionPacket& out) noexcept {
    if (!bytes || size != kMotionSize || bytes[0] != 'G' || bytes[1] != 'Y' ||
        bytes[2] != 'B' || (bytes[3] != '1' && bytes[3] != '2')) return false;
    const int roll = read_i16(bytes + 12), pitch = read_i16(bytes + 14);
    const bool has_yaw = bytes[3] == '2';
    const int yaw = has_yaw ? read_i16(bytes + 18) : 0;
    if (roll < -18000 || roll > 18000 || pitch < -9000 || pitch > 9000 ||
        yaw < -18000 || yaw > 18000 || !valid_flags(bytes[16])) return false;
    MotionPacket decoded{};
    decoded.version = static_cast<std::uint8_t>(bytes[3] - '0');
    decoded.sequence = read_u32(bytes + 4);
    decoded.device_us = read_u32(bytes + 8);
    decoded.roll = static_cast<float>(roll) / 100.0f;
    decoded.pitch = static_cast<float>(pitch) / 100.0f;
    decoded.yaw = static_cast<float>(yaw) / 100.0f;
    decoded.flags = bytes[16];
    decoded.motion_dps = bytes[17];
    decoded.has_yaw = has_yaw;
    decoded.period_us = has_yaw ? 0 : read_u16(bytes + 18);
    out = decoded;
    return true;
}

bool decode_reply(const std::uint8_t* bytes, std::size_t size, CommandReply& out) noexcept {
    if (!bytes || size != kReplySize || !valid_op(bytes[0])) return false;
    out = {bytes[0], read_u32(bytes + 1), read_u32(bytes + 5)};
    return true;
}

std::uint16_t crc16_ccitt_false(const std::uint8_t* bytes, std::size_t size) noexcept {
    std::uint16_t crc = 0xffff;
    for (std::size_t i = 0; i < size; ++i) {
        crc ^= static_cast<std::uint16_t>(static_cast<std::uint16_t>(bytes[i]) << 8);
        for (unsigned bit = 0; bit < 8; ++bit) {
            crc = static_cast<std::uint16_t>((crc & 0x8000u) ?
                    (static_cast<unsigned>(crc) << 1) ^ 0x1021u :
                    static_cast<unsigned>(crc) << 1);
        }
    }
    return crc;
}

std::size_t encode_ble_command(std::uint8_t op, std::uint32_t id,
                              std::uint8_t* output, std::size_t capacity) noexcept {
    if (!output || capacity < 5 || op < 1 || op > 2) return 0;
    output[0] = op;
    write_u32(output + 1, id);
    return 5;
}

std::size_t encode_usb_command(std::uint8_t op, std::uint32_t id,
                              std::uint8_t* output, std::size_t capacity) noexcept {
    if (!output || capacity < 11 || !valid_op(op)) return 0;
    std::memcpy(output, "GYC2", 4);
    output[4] = op;
    write_u32(output + 5, id);
    const std::uint16_t crc = crc16_ccitt_false(output, 9);
    output[9] = static_cast<std::uint8_t>(crc);
    output[10] = static_cast<std::uint8_t>(crc >> 8);
    return 11;
}

void UsbFrameDecoder::clear() noexcept { used_ = 0; }
void UsbFrameDecoder::discard(std::size_t count) noexcept {
    used_ -= count;
    if (used_) std::memmove(buffer_.data(), buffer_.data() + count, used_);
}

DecodeBatch UsbFrameDecoder::push(const std::uint8_t* bytes, std::size_t size,
                                  ReplyCallback on_reply, void* context) noexcept {
    DecodeBatch result{};
    if (!bytes) return result;
    for (std::size_t i = 0; i < size; ++i) {
        // 上一轮必定已消费完整帧或保留不足一帧的数据，写入前 used_ 至多为 25。
        buffer_[used_++] = bytes[i];
        while (used_ >= 4) {
            const auto* p = buffer_.data();
            if (p[0] != 'G' || p[1] != 'Y' || p[3] != '2' ||
                (p[2] != 'U' && p[2] != 'A')) {
                discard(1);
                continue;
            }
            const std::size_t length = p[2] == 'U' ? kUsbMotionSize : 15;
            if (used_ < length) break;
            if (crc16_ccitt_false(p, length - 2) != read_u16(p + length - 2)) {
                discard(1);
                continue;
            }
            if (p[2] == 'U') {
                MotionPacket motion{};
                if (!decode_motion(p + 4, kMotionSize, motion)) {
                    discard(1);
                    continue;
                }
                result.motion = motion;
                result.has_motion = true;
                ++result.motion_count;
                discard(length);
            } else {
                CommandReply reply{};
                if (!decode_reply(p + 4, kReplySize, reply)) {
                    discard(1);
                    continue;
                }
                // 消费帧后再交付应答，不在内部保留调用者的引用。
                discard(length);
                ++result.reply_count;
                if (on_reply) on_reply(reply, context);
            }
        }
    }
    return result;
}

bool LatestMotionFeed::ingest(const MotionPacket& packet, std::uint64_t now_ms) noexcept {
    // 本接口通常接收 decode_motion 的产物；仍检查状态位，防止调用者手工构造非法状态。
    if (!valid_flags(packet.flags)) return false;
    if (has_packet_) {
        const std::uint32_t delta = packet.sequence - packet_.sequence;
        if (delta >= 0x80000000u) return false;
        if (delta == 0) {
            packet_.flags = packet.flags;
            return false;
        }
    }
    packet_ = packet;
    has_packet_ = true;
    has_sample_ = (packet.flags & kSensorOk) != 0;
    if (has_sample_) received_at_ms_ = now_ms;
    return true;
}

bool LatestMotionFeed::is_fresh(std::uint64_t now_ms) const noexcept {
    return has_packet_ && has_sample_ &&
           (packet_.flags & (kReady | kSensorOk)) == (kReady | kSensorOk) &&
           now_ms >= received_at_ms_ && now_ms - received_at_ms_ < kStaleMs;
}

void LatestMotionFeed::clear() noexcept {
    packet_ = {};
    received_at_ms_ = 0;
    has_packet_ = false;
    has_sample_ = false;
}
} // namespace gyro
