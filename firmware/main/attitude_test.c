/*
 * 姿态算法的主机测试：用模拟采样检查校准、漂移、倾斜跟踪与偏航。
 * 此文件仅在电脑上编译运行，不在 ESP-IDF 的固件源文件列表中。
 * 所有 assert 都用于检查算法输出，测试通过后打印结果。
 */
#include <assert.h>
#include <stdio.h>
#include "attitude.h"
// 依次运行独立场景，确保实际硬件零偏及各轴旋转都得到正确处理。
int main(void) {
    attitude_t f; attitude_reset(&f);
    // 模拟实测模块的约 1.095 g 重力模长，以及较大的恒定陀螺仪零偏。
    float a[3]={0,0,1.095f},g[3]={-5.3f,-.38f,-9.3f},roll=0,pitch=0;
    // 连续静止 400 帧后应校准成功，并估计出相应零偏。
    for(int i=0;i<400;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(f.ready); assert(fabsf(f.bias[2]+9.3f)<.001f);
    // 继续静止 60 秒，检查横滚和俯仰不会积累明显误差。
    for(int i=0;i<12000;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(fabsf(roll)<.05f && fabsf(pitch)<.05f);
    // 用重力方向和角速度同时模拟 1 秒内横滚 20°，再观察稳定输出。
    for(int i=1;i<=200;i++) {
        float angle=i*.1f*.01745329252f;
        a[1]=sinf(angle)*1.095f; a[2]=cosf(angle)*1.095f; g[0]=-5.3f+20;
        attitude_step(&f,a,g,.005f,&roll,&pitch);
    }
    g[0]=-5.3f;
    for(int i=0;i<600;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(fabsf(roll-20)<.2f && fabsf(pitch)<.05f);
    // 加速度持续交替变化时，不能错误地判为静止并完成校准。
    attitude_reset(&f); a[1]=0; a[2]=1.095f;
    for(int i=0;i<1000;i++) { a[0]=i%2?.1f:-.1f; attitude_step(&f,a,g,.005f,&roll,&pitch); }
    assert(!f.ready);
    // 角速度持续波动时，同样必须拒绝静止校准。
    attitude_reset(&f); a[0]=0;
    for(int i=0;i<1000;i++) { g[0]=-5.3f+(i%2?1:-1); attitude_step(&f,a,g,.005f,&roll,&pitch); }
    assert(!f.ready);
    // 绕传感器 Z 轴旋转时，偏航应变化，而传感器横滚、俯仰应保持为零。
    attitude_reset(&f); a[0]=a[1]=0; a[2]=1; g[0]=g[1]=g[2]=0;
    for(int i=0;i<400;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    g[2]=90;
    for(int i=0;i<200;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(fabsf(attitude_yaw(&f)-90)<.05f);
    assert(fabsf(roll)<.05f && fabsf(pitch)<.05f);
    // 总偏航达到 270° 时应回绕为 −90°；复位后相对偏航归零。
    for(int i=0;i<400;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(fabsf(attitude_yaw(&f)+90)<.05f);
    attitude_reset(&f); assert(fabsf(attitude_yaw(&f))<.001f);
    puts("PASS: stationary hardware bias calibration, 60s drift, tilt tracking, moving-sensor rejection, relative yaw and heading wrap.");
    return 0;
}
