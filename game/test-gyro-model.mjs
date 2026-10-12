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

// Exercise the actual game asset and switching while its asynchronous load is pending.
const { readFile } = await import('node:fs/promises');
const { createAircraftPoseModel } = await import('./dist/aircraft-model.js');
const { GyroPoseView } = await import('./dist/gyro-view.js');
const bytes = await readFile(new URL('./dist/assets/airplane-f22.glb', import.meta.url));
const plane = createAircraftPoseModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
near(new T.Vector3(0,0,-1).applyQuaternion(plane.quaternion).x,1);
near(new T.Vector3(-1,0,0).applyQuaternion(plane.quaternion).y,1);
near(new T.Vector3(0,1,0).applyQuaternion(plane.quaternion).z,1);
assert.equal(plane.children[0].children.length,32, 'preview loads the full game aircraft');
const planeBounds = new T.Box3().setFromObject(plane);
near(planeBounds.getCenter(new T.Vector3()).length(),0);
near(Math.max(...planeBounds.getSize(new T.Vector3()).toArray()),2.6);
const controls = new Map();
const view = Object.create(GyroPoseView.prototype);
view.$ = id => { if(!controls.has(id)) controls.set(id,{textContent:'',disabled:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;}}); return controls.get(id); };
view.board = new T.Group(); view.body = new T.Group(); view.body.quaternion.copy(poseQuaternion({roll:20,pitch:-15,yaw:30}));
const originalPose = view.body.quaternion.clone();
let loaded, loads=0;
view.loadAircraft = () => { loads++; return new Promise(resolve => {loaded=()=>{view.aircraft=plane;plane.visible=false;resolve();};}); };
const switching = view.selectModel('aircraft');
assert.equal(view.$('gyroShowAircraft').disabled,true);
await view.selectModel('board'); loaded(); await switching;
assert.equal(view.modelKind,'board', 'late aircraft completion cannot override a newer selection');
assert.equal(plane.visible,false);
await view.selectModel('aircraft');
assert.equal(view.modelKind,'aircraft');assert.equal(view.board.visible,false);assert.equal(plane.visible,true);
assert.equal(view.$('gyroShowAircraft').attributes['aria-pressed'],'true');
assert.equal(view.$('gyroModelTitle').textContent,'F-22 · 实时姿态');
await view.selectModel('board'); await view.selectModel('aircraft');
assert.equal(loads,1,'repeated switches reuse the existing model');
near(view.body.quaternion.angleTo(originalPose),0);
view.aircraft=null; view.loadAircraft=async()=>{throw Error('offline');};
await view.selectModel('board'); await view.selectModel('aircraft');
assert.equal(view.board.visible,true); assert.equal(view.$('gyroShowAircraft').disabled,false);
assert.match(view.$('gyroModelLoading').textContent,/重试/);
console.log('PASS: actual F-22 asset, sensor alignment, fit, switching, late load, caching, retained pose and failure recovery.');
