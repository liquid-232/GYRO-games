import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.js';
import {FreeFlight,segmentSphere,terrainHit} from './dist/free-flight.js';
import {FreeProgress,SAVE_KEY} from './dist/free-progress.js';
import {FreeStyle} from './dist/free-style.js';
import {updateEnemy} from './dist/free-enemies.js';
import {advanceFrame} from './dist/frame-timing.js';
const rightTurn=new FreeFlight();rightTurn.position.set(0,200,0);for(let i=0;i<60;i++)rightTurn.update(1/60,{roll:.3});assert.ok(rightTurn.position.x>0,'right bank turns right');
const enemy={mesh:new T.Group(),previous:new T.Vector3(),home:new T.Vector3(),target:new T.Quaternion(),escape:new T.Vector3(),state:'patrol',decision:0,fire:10,phase:0};
updateEnemy(enemy,.01,new T.Vector3(1000,100,0),0);assert.equal(enemy.state,'patrol');assert.equal(enemy.decision,.3);
enemy.mesh.position.set(0,100,0);enemy.decision=0;updateEnemy(enemy,.01,new T.Vector3(0,100,-200),0);assert.equal(enemy.state,'pursue');
enemy.decision=0;updateEnemy(enemy,.01,new T.Vector3(0,100,-10),1);assert.equal(enemy.state,'evade');
enemy.mesh.position.set(0,100,0);enemy.mesh.quaternion.identity();enemy.target.identity();enemy.decision=1;enemy.fire=0;assert.equal(updateEnemy(enemy,.01,new T.Vector3(0,100,-200),10),true);assert.equal(enemy.state,'attack');
const reports=[];
for(const fps of [15,20,30,60,120]){const f=new FreeFlight();f.position.set(0,200,500);for(let i=0;i<fps*4;i++)advanceFrame(1/fps,dt=>f.update(dt,{roll:.12,pitch:.1}));reports.push(f.position.clone());assert.ok(Math.abs(f.attitude.length()-1)<1e-10);}
for(const p of reports)assert.ok(p.distanceTo(reports[3])<.2,'different frame rates preserve flight');
const f=new FreeFlight();f.position.set(0,200,0);const camera=new T.PerspectiveCamera();f.camera(camera,.02);let previous=camera.quaternion.clone(),largest=0;
for(let i=0;i<1500;i++){f.update(1/120,{pitch:1});f.camera(camera,1/120);largest=Math.max(largest,previous.angleTo(camera.quaternion));previous.copy(camera.quaternion);assert.ok(Number.isFinite(camera.quaternion.x));}
assert.ok(largest<.15,'camera remains continuous through repeated vertical loops');
f.level();for(let i=0;i<240;i++){f.update(1/60,{});f.camera(camera,1/60);}assert.ok(f.cameraUp.y>.99,'stable camera restores world horizon after loops');assert.ok(f.up.y>.99,'recovery levels inverted flight');
f.position.set(1250,150,0);f.update(.01,{});assert.equal(f.returning,true);for(let i=0;i<600;i++)f.update(1/60,{});assert.ok(Math.hypot(f.position.x,f.position.z)<1200);
assert.equal(segmentSphere(new T.Vector3(-100,0,0),new T.Vector3(100,0,0),new T.Vector3(),1),.495);
assert.equal(segmentSphere(new T.Vector3(-100,3,0),new T.Vector3(100,3,0),new T.Vector3(),1),null);
assert.notEqual(terrainHit(new T.Vector3(-10,2,0),new T.Vector3(10,2,0),(x)=>Math.abs(x)<1?8:0),null,'sweep catches thin terrain at speed');
const storage=new Map();storage.getItem=storage.get.bind(storage);storage.setItem=storage.set.bind(storage);
const progress=new FreeProgress(storage);
assert.equal(progress.buy('toString'),false);progress.reward(300,true);assert.ok(progress.buy('armor'));assert.equal(progress.health,6);assert.equal(progress.buy('armor'),false);progress.reward(400,true);
const loaded=new FreeProgress(storage);assert.equal(loaded.health,6);assert.equal(loaded.data.balance,400);assert.equal(loaded.data.completed,2);
let warning='';const bad=new FreeProgress({getItem(){return '{';},setItem(){throw Error('must not overwrite');}},s=>warning=s);bad.reward(25);assert.ok(warning);assert.equal(bad.data.balance,25);
const broken=new FreeProgress({getItem(){return null;},setItem(){throw Error('quota');}},s=>warning=s);warning='';broken.reward(10);assert.match(warning,/保存失败/);
assert.ok(storage.has(SAVE_KEY));
console.log('PASS: frame-rate consistency, full loops, camera continuity, leveling, boundary return, swept collisions, upgrade persistence and storage errors.');
console.log('Largest camera step at 120 Hz:',largest.toFixed(4));

// 辅助操控也必须随游戏时间变化，避免高刷新率下俯仰变慢。
const assisted=[];
for(const fps of [15,20,30,60,120]){const pilot=new FreeFlight();pilot.position.set(0,200,0);for(let i=0;i<fps*3;i++)advanceFrame(1/fps,dt=>pilot.update(dt,{assisted:true,roll:.2,pitch:.25}));assisted.push(pilot);}
for(const pilot of assisted){assert.ok(pilot.position.distanceTo(assisted[3].position)<1.2,'assisted flight timing');assert.ok(pilot.attitude.angleTo(assisted[3].attitude)<.01,'assisted orientation timing');}
for(const pilot of assisted){for(let i=0;i<180;i++)pilot.update(1/60,{assisted:true});assert.ok(pilot.up.y>.999,'release levels attitude');}
const style=new FreeStyle();style.kill();style.update(1);style.kill(true);assert.equal(style.combo,2);assert.ok(style.value>200);const beforeDecay=style.value;style.update(9);assert.equal(style.combo,0);assert.ok(style.value<beforeDecay);style.add('parry',200);const beforeDamage=style.value;style.hurt();assert.ok(style.value<beforeDamage);style.reset();assert.equal(style.rank,'D');
console.log('PASS: assisted flight timing, auto leveling, combo, style decay and damage reset.');
