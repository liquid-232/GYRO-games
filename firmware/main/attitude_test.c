// Host-only test: never included in the ESP-IDF component sources.
#include <assert.h>
#include <stdio.h>
#include "attitude.h"
int main(void) {
    attitude_t f; attitude_reset(&f);
    float a[3]={0,0,1.095f},g[3]={-5.3f,-.38f,-9.3f},roll=0,pitch=0;
    for(int i=0;i<400;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(f.ready); assert(fabsf(f.bias[2]+9.3f)<.001f);
    for(int i=0;i<12000;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(fabsf(roll)<.05f && fabsf(pitch)<.05f);
    for(int i=1;i<=200;i++) {
        float angle=i*.1f*.01745329252f;
        a[1]=sinf(angle)*1.095f; a[2]=cosf(angle)*1.095f; g[0]=-5.3f+20;
        attitude_step(&f,a,g,.005f,&roll,&pitch);
    }
    g[0]=-5.3f;
    for(int i=0;i<600;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(fabsf(roll-20)<.2f && fabsf(pitch)<.05f);
    attitude_reset(&f); a[1]=0; a[2]=1.095f;
    for(int i=0;i<1000;i++) { a[0]=i%2?.1f:-.1f; attitude_step(&f,a,g,.005f,&roll,&pitch); }
    assert(!f.ready);
    attitude_reset(&f); a[0]=0;
    for(int i=0;i<1000;i++) { g[0]=-5.3f+(i%2?1:-1); attitude_step(&f,a,g,.005f,&roll,&pitch); }
    assert(!f.ready);
    // Z rotation must be observable without changing roll/pitch controls.
    attitude_reset(&f); a[0]=a[1]=0; a[2]=1; g[0]=g[1]=g[2]=0;
    for(int i=0;i<400;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    g[2]=90;
    for(int i=0;i<200;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(fabsf(attitude_yaw(&f)-90)<.05f);
    assert(fabsf(roll)<.05f && fabsf(pitch)<.05f);
    for(int i=0;i<400;i++) attitude_step(&f,a,g,.005f,&roll,&pitch);
    assert(fabsf(attitude_yaw(&f)+90)<.05f);
    attitude_reset(&f); assert(fabsf(attitude_yaw(&f))<.001f);
    puts("PASS: stationary hardware bias calibration, 60s drift, tilt tracking, moving-sensor rejection, relative yaw and heading wrap.");
    return 0;
}
