// 将独立协议核心纳入 Unreal 模块；协议测试也编译同一份实现，避免双份维护。
// 此层只负责解码，Windows BLE / USB 接收线程将在下一阶段接入。
#include "../../../core/src/controller_protocol.cpp"
