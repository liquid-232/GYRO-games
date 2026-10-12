#pragma once
#include <math.h>
#include <stdbool.h>
#include <string.h>

// Gravity corrects roll/pitch drift; yaw is intentionally not used for controls.
typedef struct {
    float q[4], bias[3], sum[3], sum2[3], previous_accel[3];
    unsigned count;
    bool ready;
} attitude_t;

static inline void attitude_reset(attitude_t *f) {
    memset(f, 0, sizeof(*f)); f->q[0] = 1;
}

static inline void attitude_step(attitude_t *f, const float a[3], const float g[3],
                                 float dt, float *roll, float *pitch) {
    const float radians = 0.01745329252f;
    float norm = sqrtf(a[0]*a[0] + a[1]*a[1] + a[2]*a[2]);
    if (!f->ready) {
        bool still = norm > .92f && norm < 1.08f;
        for (int i=0;i<3;i++) {
            still &= fabsf(g[i]) < 4 && (!f->count || fabsf(a[i]-f->previous_accel[i]) < .035f);
            f->previous_accel[i] = a[i];
        }
        if (!still) { f->count=0; memset(f->sum,0,sizeof(f->sum)); memset(f->sum2,0,sizeof(f->sum2)); }
        else {
            for (int i=0;i<3;i++) { f->sum[i]+=g[i]; f->sum2[i]+=g[i]*g[i]; }
            if (++f->count == 400) {
                bool stable = true;
                for (int i=0;i<3;i++) {
                    f->bias[i]=f->sum[i]/400;
                    stable &= f->sum2[i]/400 - f->bias[i]*f->bias[i] < .16f;
                }
                if (!stable) attitude_reset(f);
                else {
                    float r=atan2f(a[1],a[2]), p=atan2f(-a[0],hypotf(a[1],a[2]));
                    f->q[0]=cosf(r/2)*cosf(p/2); f->q[1]=sinf(r/2)*cosf(p/2);
                    f->q[2]=cosf(r/2)*sinf(p/2); f->q[3]=-sinf(r/2)*sinf(p/2);
                    f->ready=true;
                }
            }
        }
    } else {
        float w[3]; for (int i=0;i<3;i++) w[i]=(g[i]-f->bias[i])*radians;
        float q0=f->q[0],q1=f->q[1],q2=f->q[2],q3=f->q[3];
        // Reduce gravity correction during translational acceleration.
        float weight = fmaxf(0, 1-fabsf(norm-1)/.15f);
        if (norm>.01f && weight>0) {
            float ax=a[0]/norm,ay=a[1]/norm,az=a[2]/norm;
            float vx=2*(q1*q3-q0*q2),vy=2*(q0*q1+q2*q3),vz=q0*q0-q1*q1-q2*q2+q3*q3;
            w[0]+=2.5f*weight*(ay*vz-az*vy);
            w[1]+=2.5f*weight*(az*vx-ax*vz);
            w[2]+=2.5f*weight*(ax*vy-ay*vx);
        }
        dt=fminf(.03f,fmaxf(.001f,dt))*.5f;
        f->q[0]+=(-q1*w[0]-q2*w[1]-q3*w[2])*dt;
        f->q[1]+=(q0*w[0]+q2*w[2]-q3*w[1])*dt;
        f->q[2]+=(q0*w[1]-q1*w[2]+q3*w[0])*dt;
        f->q[3]+=(q0*w[2]+q1*w[1]-q2*w[0])*dt;
        float length=sqrtf(f->q[0]*f->q[0]+f->q[1]*f->q[1]+f->q[2]*f->q[2]+f->q[3]*f->q[3]);
        for(int i=0;i<4;i++) f->q[i]/=length;
    }
    float *q=f->q;
    *roll=atan2f(2*(q[0]*q[1]+q[2]*q[3]),1-2*(q[1]*q[1]+q[2]*q[2]))/radians;
    *pitch=asinf(fmaxf(-1,fminf(1,2*(q[0]*q[2]-q[3]*q[1]))))/radians;
}
