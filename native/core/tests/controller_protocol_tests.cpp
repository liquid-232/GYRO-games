/*
 * 协议边界回归：用固件布局的固定向量核对端序、CRC、状态位和序号回绕。
 * 固定 USB 向量的校验值由 Python 标准库 binascii.crc_hqx 独立生成。
 * CHECK 不使用 assert，保证 Release / NDEBUG 构建也真实执行检查。
 */
#include "gyro/controller_protocol.h"
#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace {
int failures = 0;
int checks = 0;
#define CHECK(expression) do { ++checks; if (!(expression)) { \
    std::fprintf(stderr, "FAIL line %d: %s\n", __LINE__, #expression); ++failures; \
} } while (false)

constexpr std::array<std::uint8_t,20> kMotion{
    0x47,0x59,0x42,0x32,0x78,0x56,0x34,0x12,0x98,0xba,0xdc,0xfe,
    0x2e,0xfb,0x2e,0x16,0x05,0x4d,0xb1,0xb9};
constexpr std::array<std::uint8_t,20> kLegacy{
    0x47,0x59,0x42,0x31,0x2a,0x00,0x00,0x00,0x40,0x42,0x0f,0x00,
    0x50,0x46,0xd8,0xdc,0x03,0xff,0x10,0x27};
constexpr std::array<std::uint8_t,26> kUsbMotion{
    0x47,0x59,0x55,0x32,0x47,0x59,0x42,0x32,0x78,0x56,0x34,0x12,
    0x98,0xba,0xdc,0xfe,0x2e,0xfb,0x2e,0x16,0x05,0x4d,0xb1,0xb9,0x01,0xea};
constexpr std::array<std::uint8_t,15> kUsbReply{
    0x47,0x59,0x41,0x32,0x02,0x12,0x34,0x56,0x78,0x90,0xef,0xcd,0xab,0x62,0x85};
constexpr std::array<std::uint8_t,11> kUsbCommand{
    0x47,0x59,0x43,0x32,0x02,0x78,0x56,0x34,0x12,0xb6,0x51};

bool near(float actual, float expected) { return std::fabs(actual-expected) < .001f; }
void set_u16(std::uint8_t* bytes, int value) {
    const auto word = static_cast<std::uint16_t>(value);
    bytes[0] = static_cast<std::uint8_t>(word);
    bytes[1] = static_cast<std::uint8_t>(word >> 8);
}
template<std::size_t N>
void refresh_crc(std::array<std::uint8_t,N>& frame) {
    const auto crc = gyro::crc16_ccitt_false(frame.data(),N-2);
    frame[N-2] = static_cast<std::uint8_t>(crc);
    frame[N-1] = static_cast<std::uint8_t>(crc >> 8);
}
struct Replies {
    std::array<gyro::CommandReply,8> values{};
    std::size_t count = 0;
    static void receive(const gyro::CommandReply& reply, void* context) {
        auto& self = *static_cast<Replies*>(context);
        CHECK(self.count < self.values.size());
        if (self.count < self.values.size()) self.values[self.count++] = reply;
    }
};

void test_golden_vectors() {
    constexpr std::uint8_t standard[]{'1','2','3','4','5','6','7','8','9'};
    CHECK(gyro::crc16_ccitt_false(standard,sizeof standard) == 0x29b1);
    CHECK(gyro::crc16_ccitt_false(nullptr,0) == 0xffff);
    CHECK(gyro::crc16_ccitt_false(kUsbMotion.data(),24) == 0xea01);
    CHECK(gyro::crc16_ccitt_false(kUsbReply.data(),13) == 0x8562);
    gyro::MotionPacket motion{};
    CHECK(gyro::decode_motion(kMotion.data(),kMotion.size(),motion));
    CHECK(motion.version==2 && motion.has_yaw && motion.period_us==0);
    CHECK(motion.sequence==0x12345678 && motion.device_us==0xfedcba98);
    CHECK(near(motion.roll,-12.34f) && near(motion.pitch,56.78f) && near(motion.yaw,-179.99f));
    CHECK(motion.flags==5 && motion.motion_dps==77);
    CHECK(gyro::decode_motion(kLegacy.data(),kLegacy.size(),motion));
    CHECK(motion.version==1 && !motion.has_yaw && motion.period_us==10000);
    CHECK(motion.sequence==42 && motion.device_us==1000000);
    CHECK(near(motion.roll,180.f) && near(motion.pitch,-90.f) && motion.yaw==0);
    gyro::CommandReply reply{};
    CHECK(gyro::decode_reply(kUsbReply.data()+4,9,reply));
    CHECK(reply.op==2 && reply.id==0x78563412 && reply.device_us==0xabcdef90);
}

void test_rejected_motion() {
    gyro::MotionPacket out{};
    out.sequence=77;
    CHECK(!gyro::decode_motion(nullptr,20,out));
    CHECK(!gyro::decode_motion(kMotion.data(),19,out));
    CHECK(!gyro::decode_motion(kMotion.data(),21,out));
    auto bytes=kMotion;
    bytes[0]='X';
    CHECK(!gyro::decode_motion(bytes.data(),bytes.size(),out));
    CHECK(out.sequence==77); // 失败不把半解析数据交给操控层。
    bytes=kMotion; bytes[3]='3';
    CHECK(!gyro::decode_motion(bytes.data(),bytes.size(),out));
    for (unsigned flags=0;flags<256;++flags) {
        bytes=kMotion;
        bytes[16]=static_cast<std::uint8_t>(flags);
        const bool valid=flags==0 || flags==1 || flags==3 || flags==5;
        CHECK(gyro::decode_motion(bytes.data(),bytes.size(),out)==valid);
    }
    for (const int value : {-18001,18001,-32768,32767}) {
        bytes=kMotion;set_u16(bytes.data()+12,value);
        CHECK(!gyro::decode_motion(bytes.data(),bytes.size(),out));
        bytes=kMotion;set_u16(bytes.data()+18,value);
        CHECK(!gyro::decode_motion(bytes.data(),bytes.size(),out));
    }
    for (const int value : {-9001,9001}) {
        bytes=kMotion;set_u16(bytes.data()+14,value);
        CHECK(!gyro::decode_motion(bytes.data(),bytes.size(),out));
    }
    for (const int value : {-18000,18000}) {
        bytes=kMotion;set_u16(bytes.data()+12,value);set_u16(bytes.data()+18,value);
        CHECK(gyro::decode_motion(bytes.data(),bytes.size(),out));
    }
    bytes=kLegacy;set_u16(bytes.data()+18,65535);
    CHECK(gyro::decode_motion(bytes.data(),bytes.size(),out) && out.period_us==65535);
    gyro::CommandReply reply{};
    CHECK(!gyro::decode_reply(nullptr,9,reply));
    CHECK(!gyro::decode_reply(kUsbReply.data()+4,8,reply));
    std::array<std::uint8_t,9> invalid{};
    invalid[0]=4;
    CHECK(!gyro::decode_reply(invalid.data(),invalid.size(),reply));
}

void test_commands() {
    std::array<std::uint8_t,11> output{};
    CHECK(gyro::encode_usb_command(2,0x12345678,output.data(),output.size())==11);
    CHECK(output==kUsbCommand);
    CHECK(gyro::encode_ble_command(2,0x12345678,output.data(),output.size())==5);
    constexpr std::array<std::uint8_t,5> expected{2,0x78,0x56,0x34,0x12};
    CHECK(std::memcmp(output.data(),expected.data(),5)==0);
    for (std::uint8_t op : {std::uint8_t{1},std::uint8_t{2},std::uint8_t{3}}) {
        CHECK(gyro::encode_usb_command(op,0xffffffff,output.data(),output.size())==11);
        CHECK(output[4]==op && output[5]==255 && output[8]==255);
        CHECK(gyro::encode_ble_command(op,0,output.data(),output.size())==(op==3?0u:5u));
    }
    output.fill(0xa5);
    const auto untouched=output;
    CHECK(gyro::encode_usb_command(0,1,output.data(),output.size())==0);
    CHECK(gyro::encode_usb_command(4,1,output.data(),output.size())==0);
    CHECK(gyro::encode_usb_command(2,1,output.data(),10)==0);
    CHECK(gyro::encode_ble_command(2,1,output.data(),4)==0);
    CHECK(output==untouched);
    CHECK(gyro::encode_ble_command(1,1,nullptr,5)==0);
    CHECK(gyro::encode_usb_command(1,1,nullptr,11)==0);
}

void test_usb_splits_and_batches() {
    // 穷举姿态与应答的每个单次断点，包括空片段和整个帧。
    for (std::size_t cut=0;cut<=kUsbMotion.size();++cut) {
        gyro::UsbFrameDecoder decoder;
        const auto first=decoder.push(kUsbMotion.data(),cut);
        const auto second=decoder.push(kUsbMotion.data()+cut,kUsbMotion.size()-cut);
        CHECK(first.motion_count+second.motion_count==1);
        CHECK((second.has_motion?second.motion:first.motion).sequence==0x12345678);
        CHECK(decoder.buffered_size()==0);
    }
    for (std::size_t cut=0;cut<=kUsbReply.size();++cut) {
        gyro::UsbFrameDecoder decoder;
        Replies replies;
        decoder.push(kUsbReply.data(),cut,Replies::receive,&replies);
        decoder.push(kUsbReply.data()+cut,kUsbReply.size()-cut,Replies::receive,&replies);
        CHECK(replies.count==1 && replies.values[0].id==0x78563412);
    }
    auto newer=kUsbMotion;
    newer[8]=0x79;
    refresh_crc(newer);
    std::array<std::uint8_t,82> glued{};
    std::memcpy(glued.data(),kUsbMotion.data(),26);
    std::memcpy(glued.data()+26,kUsbReply.data(),15);
    std::memcpy(glued.data()+41,newer.data(),26);
    std::memcpy(glued.data()+67,kUsbReply.data(),15);
    for (std::size_t width=1;width<=glued.size();++width) {
        gyro::UsbFrameDecoder decoder;
        Replies replies;
        std::size_t count=0,reply_count=0;
        gyro::MotionPacket latest{};
        for (std::size_t offset=0;offset<glued.size();) {
            const auto remaining=glued.size()-offset;
            const auto length=remaining<width?remaining:width;
            const auto batch=decoder.push(glued.data()+offset,length,Replies::receive,&replies);
            count+=batch.motion_count;reply_count+=batch.reply_count;
            if (batch.has_motion) latest=batch.motion;
            CHECK(decoder.buffered_size()<26);
            offset+=length;
        }
        CHECK(count==2 && reply_count==2 && replies.count==2);
        CHECK(latest.sequence==0x12345679);
        CHECK(replies.values[0].device_us==0xabcdef90);
    }
    gyro::UsbFrameDecoder decoder;
    const auto batch=decoder.push(glued.data(),glued.size());
    CHECK(batch.has_motion && batch.motion_count==2 && batch.reply_count==2);
    CHECK(batch.motion.sequence==0x12345679);
}

void test_usb_resynchronization() {
    // 每个字节损坏都不能污染下一帧；CRC、帧头和负载均在覆盖范围内。
    for (std::size_t index=0;index<26;++index) {
        auto broken=kUsbMotion;
        broken[index]^=0x80;
        std::array<std::uint8_t,52> stream{};
        std::memcpy(stream.data(),broken.data(),26);
        std::memcpy(stream.data()+26,kUsbMotion.data(),26);
        gyro::UsbFrameDecoder decoder;
        const auto batch=decoder.push(stream.data(),stream.size());
        CHECK(batch.motion_count==1 && batch.motion.sequence==0x12345678);
    }
    // 缺失尾部的帧后直接连接新帧时，应通过 CRC 失败恢复到正确帧头。
    for (std::size_t truncated=0;truncated<26;++truncated) {
        gyro::UsbFrameDecoder decoder;
        decoder.push(kUsbMotion.data(),truncated);
        const auto batch=decoder.push(kUsbMotion.data(),kUsbMotion.size());
        CHECK(batch.motion_count==1 && batch.motion.sequence==0x12345678);
    }
    gyro::UsbFrameDecoder decoder;
    std::array<std::uint8_t,10000> noise{};
    constexpr std::uint8_t pattern[]{'G','Y','U','2',0x55,'G','Y','A','2',0xff};
    for (std::size_t i=0;i<noise.size();++i) noise[i]=pattern[i%sizeof pattern];
    CHECK(!decoder.push(noise.data(),noise.size()).has_motion);
    const auto recovered=decoder.push(kUsbMotion.data(),kUsbMotion.size());
    CHECK(recovered.has_motion && recovered.motion_count==1);
    CHECK(decoder.buffered_size()==0);
    auto invalid=kUsbMotion;invalid[20]=7;refresh_crc(invalid);
    CHECK(!decoder.push(invalid.data(),invalid.size()).has_motion);
    CHECK(decoder.push(kUsbMotion.data(),kUsbMotion.size()).has_motion);
    auto invalid_reply=kUsbReply;invalid_reply[4]=4;refresh_crc(invalid_reply);
    Replies replies;
    CHECK(decoder.push(invalid_reply.data(),invalid_reply.size(),Replies::receive,&replies).reply_count==0);
    CHECK(replies.count==0);
    CHECK(decoder.push(kUsbReply.data(),kUsbReply.size(),Replies::receive,&replies).reply_count==1);
    decoder.push(kUsbMotion.data(),7);
    CHECK(decoder.buffered_size()==7);
    decoder.clear();
    CHECK(decoder.buffered_size()==0);
    CHECK(!decoder.push(nullptr,100).has_motion);
}

void test_latest_motion_feed() {
    gyro::MotionPacket packet{};
    CHECK(gyro::decode_motion(kMotion.data(),kMotion.size(),packet));
    gyro::LatestMotionFeed feed;
    CHECK(feed.latest()==nullptr && !feed.is_fresh(0));
    packet.sequence=0xfffffffe;
    CHECK(feed.ingest(packet,1000));
    CHECK(feed.is_fresh(1000) && feed.is_fresh(1149));
    CHECK(!feed.is_fresh(1150) && !feed.is_fresh(999));
    CHECK(!feed.ingest(packet,1149)); // 重复状态包不刷新样本接收时间。
    CHECK(feed.received_at_ms()==1000 && !feed.is_fresh(1150));
    packet.sequence=0xffffffff;
    CHECK(feed.ingest(packet,1200));
    packet.sequence=0;
    CHECK(feed.ingest(packet,1210) && feed.is_fresh(1210));
    packet.sequence=0xffffffff;
    CHECK(!feed.ingest(packet,1220));
    CHECK(feed.latest()->sequence==0 && feed.received_at_ms()==1210);
    packet.sequence=0x80000000;
    CHECK(!feed.ingest(packet,1230)); // 半个序号空间之外按旧包处理。
    packet.sequence=1;packet.flags=3;
    CHECK(feed.ingest(packet,1240) && !feed.is_fresh(1240));
    packet.sequence=2;packet.flags=5;
    CHECK(feed.ingest(packet,1250) && feed.is_fresh(1250));
    packet.flags=1;
    CHECK(!feed.ingest(packet,1260) && !feed.is_fresh(1260));
    packet.flags=5;
    CHECK(!feed.ingest(packet,1500) && !feed.is_fresh(1500));
    packet.sequence=3;packet.flags=0;
    CHECK(feed.ingest(packet,1510) && !feed.is_fresh(1510));
    packet.flags=5;
    CHECK(!feed.ingest(packet,1520) && !feed.is_fresh(1520));
    packet.sequence=4;
    CHECK(feed.ingest(packet,1530) && feed.is_fresh(1530));
    packet.sequence=5;packet.flags=7;
    CHECK(!feed.ingest(packet,1540) && feed.latest()->sequence==4);
    feed.clear();
    CHECK(feed.latest()==nullptr && !feed.is_fresh(1600));
    packet.sequence=0;packet.flags=5;
    CHECK(feed.ingest(packet,1600) && feed.is_fresh(1600));
}
}

int main() {
    test_golden_vectors();
    test_rejected_motion();
    test_commands();
    test_usb_splits_and_batches();
    test_usb_resynchronization();
    test_latest_motion_feed();
    std::printf("Protocol checks: %d, failures: %d\n",checks,failures);
    return failures==0?0:1;
}
