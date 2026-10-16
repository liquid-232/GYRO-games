import assert from 'node:assert/strict';
import * as T from './dist/vendor/three.module.js';
import {framePlan,advanceFrame,AdaptiveResolution} from './dist/frame-timing.js';
import {createParticleSystem} from './dist/particle-system.js';

const rows=[];
for(const fps of [10,15,20,24,30,60,120,165]){
 let elapsed=0,largest=0;
 for(let i=0;i<fps*10;i++)advanceFrame(1/fps,dt=>{elapsed+=dt;largest=Math.max(largest,dt);});
 assert.ok(Math.abs(elapsed-10)<1e-9, fps+' FPS must preserve ten real seconds');
 assert.ok(largest<=1/60+1e-9, 'collision steps remain bounded');
 rows.push({fps,oldSeconds:Number((fps*10*Math.min(1/fps,.033)).toFixed(3)),newSeconds:Number(elapsed.toFixed(3))});
}
assert.equal(framePlan(2).duration,.25);assert.equal(framePlan(2).steps,15);
for(const invalid of [-1,NaN,Infinity])assert.equal(framePlan(invalid).steps,0);
let calls=0;advanceFrame(.2,()=>{calls++;return false;});assert.equal(calls,1,'stop substeps immediately on pause/end');
const quality=new AdaptiveResolution(1.6);
for(let i=0;i<30;i++)quality.observe(50,true);
assert.equal(quality.ratio,1.45,'sustained low FPS reduces resolution');
const saved=quality.ratio;quality.observe(360,true);quality.observe(50,false);
assert.equal(quality.ratio,saved,'one long task and pause do not lower quality');
for(let i=0;i<600;i++)quality.observe(16,true);
assert.ok(quality.ratio>saved&&quality.ratio<=quality.max,'stable recovery restores resolution gradually');
for(let i=0;i<1000;i++)quality.observe(50,true);
assert.equal(quality.ratio,quality.min);
for(const ratio of [.75,1,1.5,3]){const q=new AdaptiveResolution(ratio);assert.ok(q.min<=q.ratio&&q.ratio<=1.6);}

const scene=new T.Group(),source=new T.OctahedronGeometry(.14),pool=createParticleSystem(scene,source,8),material=pool.mesh.material;
assert.equal(source.getAttribute('particleOpacity'),undefined,'source geometry is not mutated');
pool.burst(new T.Vector3(0,1,0),0xffaa44,20);pool.flush();
assert.equal(pool.count,8);assert.equal(pool.mesh.count,8);assert.equal(scene.children.length,1);
pool.update(1);pool.flush();assert.equal(pool.count,0);assert.equal(pool.mesh.count,0);
pool.emit(new T.Vector3(),new T.Vector3(1,0,0),0xff0000,.1);
pool.emit(new T.Vector3(0,2,0),new T.Vector3(0,1,0),0x00ff00,.5);
pool.update(.15);pool.flush();assert.equal(pool.count,1);
const m=new T.Matrix4();pool.mesh.getMatrixAt(0,m);assert.ok(Math.abs(m.elements[13]-2.15)<1e-6,'swap removal keeps the surviving particle');
for(let i=0;i<1000;i++){pool.burst(new T.Vector3(),0xffffff,30);pool.update(.04);pool.flush();assert.ok(pool.count<=8);assert.equal(pool.mesh.material,material);}
let disposed=false;source.addEventListener('dispose',()=>disposed=true);
pool.clear();assert.equal(pool.mesh.count,0);pool.dispose();assert.equal(scene.children.length,0);
assert.equal(disposed,false,'disposing the pool must preserve the shared source geometry');source.dispose();assert.equal(disposed,true);
console.table(rows);
console.log('PASS: frame-rate independent timing, bounded catch-up/collision steps, adaptive resolution hysteresis, bounded particle pool, one particle draw and resource reuse.');
