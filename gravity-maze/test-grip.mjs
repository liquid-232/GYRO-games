import assert from 'node:assert/strict';
import {applyMeasuredGrip,GRIP_PROFILE} from './dist/grip-profile.js';
import {GyroController} from './dist/gyro.js';
const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
const old={fullScale:30,deadzone:2,invertX:false,invertY:true,swap:true};
const profile=applyMeasuredGrip(old,'-Y',storage);
assert.equal(profile.direction,'+X');assert.equal(profile.settings.fullScale,30);assert.equal(profile.settings.deadzone,2);
assert.equal(storage.getItem('gravity-maze-grip-profile'),GRIP_PROFILE);
const custom={...profile.settings,invertX:false};assert.deepEqual(applyMeasuredGrip(custom,'+Y',storage),{settings:custom,direction:'+Y'});
assert.equal(applyMeasuredGrip(old,'-Y',{getItem(){throw Error();},setItem(){throw Error();}}).settings.invertX,true);
// 使用实际串口样本经过游戏 sample()，检查最终运动方向，而非只检查选项。
const neutral={"roll": -0.0228, "pitch": 0.7011, "yaw": 0.0207},front={"roll": 0.0971, "pitch": -14.3074, "yaw": 4.0568},right={"roll": -12.1292, "pitch": 0.7742, "yaw": 2.9597};
function output(packet){
 const g=Object.create(GyroController.prototype);Object.assign(g,{selected:true,settings:profile.settings,noseDirection:profile.direction,neutral,feed:{packet},output:{x:0,y:0}});
 Object.defineProperty(g,'canFly',{value:true});return g.sample(.1);
}
const f=output(front),r=output(right);assert.ok(f.y>.3&&Math.abs(f.x)<.05,JSON.stringify(f));assert.ok(r.x>.2&&Math.abs(r.y)<.05,JSON.stringify(r));
const center=output(neutral);assert.ok(Math.abs(center.x)<1e-6&&Math.abs(center.y)<1e-6);
console.log('Measured grip: forward moves up, right moves right, neutral zero; one-time migration preserves later choices.');
