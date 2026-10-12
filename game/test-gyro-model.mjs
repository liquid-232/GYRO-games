import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.js';
import { createGyroModel, createBodyAxes, poseQuaternion } from './dist/gyro-model.js';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-6, `${a} != ${b}`);
const rotate = (v, roll, pitch, yaw) => new T.Vector3(...v).applyQuaternion(poseQuaternion({roll,pitch,yaw}));
// Recommended grip: +X forward, +Y left, +Z up.
near(rotate([0,-1,0],90,0,0).z,-1); // Positive roll drops right edge.
near(rotate([1,0,0],0,-90,0).z,1); // Negative pitch lifts front.
near(rotate([1,0,0],0,0,90).y,1); // Positive yaw turns front towards +Y.
const compound=rotate([0,0,1],90,30,90); near(compound.x,1); near(compound.y,0); near(compound.z,0);
const before=poseQuaternion({roll:10,pitch:20,yaw:179.99}), after=poseQuaternion({roll:10,pitch:20,yaw:-179.99});
assert.ok(before.angleTo(after)<.001, 'heading wrap cannot cause a visual flip');
assert.ok(poseQuaternion({roll:12,pitch:20,yaw:null}).angleTo(poseQuaternion({roll:12,pitch:20,yaw:0}))<1e-6);
const model=createGyroModel();
assert.ok(model.getObjectByName('pin-VCC').position.y > model.getObjectByName('pin-INT').position.y);
near(model.getObjectByName('MPU6050').position.length(),0);
const axes=createBodyAxes();
for(const axis of ['X','Y','Z']) { const arrow=axes.getObjectByName(axis); near(arrow.position.length(),0); }
let vertices=0;
model.traverse(o=>{ if(o.geometry) { const p=o.geometry.attributes.position; vertices+=p.count; for(const value of p.array) assert.ok(Number.isFinite(value)); } });
assert.ok(vertices>1000);
console.log('PASS: sensor axis signs, compound rotation order, yaw wrap, legacy pose, PCB pins and finite model geometry.');
