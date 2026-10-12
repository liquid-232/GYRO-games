/*
 * 姿态融合算法：使用加速度计和陀螺仪估计 MPU6050 的三轴姿态。
 * 先用连续静止样本校准零偏，再积分陀螺仪并用重力修正横滚、俯仰。
 * 四元数按 [w, x, y, z] 存放，表示传感器坐标到参考坐标的旋转。
 * 参考姿态采用 Rz(偏航) × Ry(俯仰) × Rx(横滚) 的旋转顺序。
 * MPU6050 没有磁力计，相对偏航会漂移；游戏根据机头设置换算操控轴。
 */
#pragma once
#include <math.h>
#include <stdbool.h>
#include <string.h>

// 重力能约束横滚、俯仰；偏航仅为相对角度，机头沿 ±Z 时也参与操控换算。
typedef struct {
    /* q：单位四元数 [w,x,y,z]；bias：三轴角速度零偏（°/s）。
     * sum / sum2：角速度之和 / 平方和，用于校准均值和方差。
     * previous_accel / previous_gyro：上一帧加速度（g）/ 角速度（°/s）。
     */
    float q[4], bias[3], sum[3], sum2[3], previous_accel[3], previous_gyro[3];
    /* sum_accel / sum2_accel：校准窗口内加速度之和 / 平方和。
     * gravity_norm：校准时测得的重力模长，容纳模块比例误差。
     */
    float sum_accel[3], sum2_accel[3], gravity_norm;
    unsigned count;             // 当前连续静止采样数，达到 400 后检查稳定性。
    bool ready;                 // true 表示已完成静止校准，可输出有效姿态。
} attitude_t;

// 清空校准统计，初始化为单位旋转；上电或收到校准命令时调用。
static inline void attitude_reset(attitude_t *f) {
    memset(f, 0, sizeof(*f)); f->q[0] = 1; f->gravity_norm=1;
}

/*
 * 输入：a 为三轴加速度（g），g 为三轴角速度（°/s），dt 为实际采样间隔（秒）。
 * 输出：roll 为横滚角（°），pitch 为俯仰角（°）。
 * 校准未完成时仍更新统计，调用方必须用 ready 标记区分有效姿态。
 */
static inline void attitude_step(attitude_t *f, const float a[3], const float g[3],
                                 float dt, float *roll, float *pitch) {
    const float radians = 0.01745329252f;
    float norm = sqrtf(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
    if (!f->ready) {
        // 先检查重力模长与帧间变化，允许实际模块存在较大的恒定零偏。
        bool still = norm > .85f && norm < 1.15f;
        for (int i=0;i<3;i++) {
            still &= fabsf(g[i]) < 25 && (!f->count || (fabsf(a[i]-f->previous_accel[i]) < .035f && fabsf(g[i]-f->previous_gyro[i]) < .8f));
            f->previous_accel[i] = a[i]; f->previous_gyro[i] = g[i];
        }
        // 发生移动后丢弃整个校准窗口，重新积累连续静止样本。
        if (!still) {
            f->count=0; memset(f->sum,0,sizeof(f->sum)); memset(f->sum2,0,sizeof(f->sum2));
            memset(f->sum_accel,0,sizeof(f->sum_accel)); memset(f->sum2_accel,0,sizeof(f->sum2_accel));
        }
        else {
            for (int i=0;i<3;i++) {
                f->sum[i]+=g[i]; f->sum2[i]+=g[i]*g[i];
                f->sum_accel[i]+=a[i]; f->sum2_accel[i]+=a[i]*a[i];
            }
            // 目标 200 Hz 下 400 个有效样本约为 2 秒；缺样或移动会延长等待。
            if (++f->count == 400) {
                bool stable = true; float mean_accel[3];
                for (int i=0;i<3;i++) {
                    f->bias[i]=f->sum[i]/400;
                    // E[x²] − E[x]² 为方差，用于排除窗口内的晃动。
                    stable &= f->sum2[i]/400 - f->bias[i]*f->bias[i] < .16f;
                    mean_accel[i]=f->sum_accel[i]/400;
                    stable &= f->sum2_accel[i]/400 - mean_accel[i]*mean_accel[i] < .0004f;
                }
                if (!stable) attitude_reset(f);
                else {
                    f->gravity_norm=sqrtf(mean_accel[0]*mean_accel[0]+mean_accel[1]*mean_accel[1]+mean_accel[2]*mean_accel[2]);
                    // 由平均重力建立初始横滚和俯仰，相对偏航以此时朝向为零。
                    float r=atan2f(mean_accel[1],mean_accel[2]), p=atan2f(-mean_accel[0],hypotf(mean_accel[1],mean_accel[2]));
                    f->q[0]=cosf(r/2)*cosf(p/2); f->q[1]=sinf(r/2)*cosf(p/2);
                    f->q[2]=cosf(r/2)*sinf(p/2); f->q[3]=-sinf(r/2)*sinf(p/2);
                    f->ready=true;
                }
            }
        }
    } else {
        // 先扣除陀螺仪零偏，再将 °/s 转换为弧度/秒供四元数积分使用。
        float w[3]; for (int i=0;i<3;i++) w[i]=(g[i]-f->bias[i])*radians;
        float q0=f->q[0],q1=f->q[1],q2=f->q[2],q3=f->q[3];
        // 线性加速会污染重力方向；模长偏离校准值时降低重力修正权重。
        float weight = fmaxf(0, 1-fabsf(norm-f->gravity_norm)/(.15f*f->gravity_norm));
        if (norm>.01f && weight>0) {
            float ax=a[0]/norm,ay=a[1]/norm,az=a[2]/norm;
            // 四元数预测的重力方向与实测方向的叉积，作为角速度修正量。
            float vx=2*(q1*q3-q0*q2),vy=2*(q0*q1+q2*q3),vz=q0*q0-q1*q1-q2*q2+q3*q3;
            w[0]+=2.5f*weight*(ay*vz-az*vy);
            w[1]+=2.5f*weight*(az*vx-ax*vz);
            w[2]+=2.5f*weight*(ax*vy-ay*vx);
        }
        // 将异常采样间隔限制在 1～30 ms；四元数微分中的系数为 dt/2。
        dt=fminf(.03f,fmaxf(.001f,dt))*.5f;
        f->q[0]+=(-q1*w[0]-q2*w[1]-q3*w[2])*dt;
        f->q[1]+=(q0*w[0]+q2*w[2]-q3*w[1])*dt;
        f->q[2]+=(q0*w[1]-q1*w[2]+q3*w[0])*dt;
        f->q[3]+=(q0*w[2]+q1*w[1]-q2*w[0])*dt;
        // 每次积分后归一化，避免数值误差破坏单位四元数约束。
        float length=sqrtf(f->q[0]*f->q[0]+f->q[1]*f->q[1]+f->q[2]*f->q[2]+f->q[3]*f->q[3]);
        for(int i=0;i<4;i++) f->q[i]/=length;
    }
    // 提取 ZYX 欧拉角，并限制 asin 输入，防止浮点误差导致 NaN。
    float *q=f->q;
    *roll=atan2f(2*(q[0]*q[1]+q[2]*q[3]),1-2*(q[1]*q[1]+q[2]*q[2]))/radians;
    *pitch=asinf(fmaxf(-1,fminf(1,2*(q[0]*q[2]-q[3]*q[1]))))/radians;
}

// 从同一个四元数提取相对偏航角（°）；范围约为 −180°～180°。
// 无磁力计提供绝对航向参考，长时间漂移时可重新校准或设置游戏中位。
static inline float attitude_yaw(const attitude_t *f) {
    const float *q=f->q;
    return atan2f(2*(q[0]*q[3]+q[1]*q[2]),1-2*(q[2]*q[2]+q[3]*q[3])) / .01745329252f;
}
