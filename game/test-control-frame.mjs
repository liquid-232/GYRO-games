import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.js';
import { NOSE_DIRECTIONS, aircraftMountQuaternion, centeredControlAngles, poseQuaternion, meanPose } from './dist/control-frame.js';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6, `${actual} != ${expected}`);
function packet(q){const e=new T.Euler().setFromQuaternion(q,'ZYX');return {roll:T.MathUtils.radToDeg(e.x),pitch:T.MathUtils.radToDeg(e.y),yaw:T.MathUtils.radToDeg(e.z)};}
const centers=[poseQuaternion({roll:0,pitch:0,yaw:0}),poseQuaternion({roll:24,pitch:-35,yaw:179}),poseQuaternion({roll:70,pitch:89.5,yaw:-120})];
for(const direction of NOSE_DIRECTIONS)for(const center of centers){
  const mount=aircraftMountQuaternion(direction), neutral={orientation:center.toArray()};
  const sensorPose=(r,p,y)=>packet(center.clone().multiply(mount).multiply(poseQuaternion({roll:r,pitch:p,yaw:y})).multiply(mount.clone().invert()));
  let output=centeredControlAngles(sensorPose(20,0,0),neutral,direction);near(output.x,20);near(output.y,0);
  output=centeredControlAngles(sensorPose(-20,0,0),neutral,direction);near(output.x,-20);near(output.y,0);
  output=centeredControlAngles(sensorPose(0,-15,0),neutral,direction);near(output.x,0);near(output.y,15);
  output=centeredControlAngles(sensorPose(0,15,0),neutral,direction);near(output.x,0);near(output.y,-15);
  output=centeredControlAngles(sensorPose(0,0,40),neutral,direction);near(output.x,0);near(output.y,0);
  output=centeredControlAngles(sensorPose(18,-12,10),neutral,direction);near(output.x,18);near(output.y,12);
}
const samples=[{roll:0,pitch:0,yaw:179.8},{roll:0,pitch:0,yaw:-179.8}];
const avg=meanPose(samples);const output=centeredControlAngles({roll:0,pitch:0,yaw:-179.9},{orientation:avg},'+X');near(output.x,0);near(output.y,0);
assert.ok(new T.Quaternion(...avg).angleTo(poseQuaternion({roll:0,pitch:0,yaw:180}))<1e-6);
console.log('PASS: all six control frames, positive/negative roll/pitch, independent yaw, tilted neutral, near-vertical hold, combined rotations and heading wrap.');
