import assert from 'node:assert/strict';
import {createSphereLevel,stepSphere,metrics,surfaceDistance,spherePoint,surface} from './dist/sphere-physics.js';
import {createSphereModel} from './dist/sphere-model.js';
import {disposeMazeModel} from './dist/maze-model.js';
for(let d=0;d<3;d++){
 const level=createSphereLevel(d),ball={...level.start,vx:0,vz:0};assert.deepEqual(level,createSphereLevel(d));
 if(d>0)assert.ok(level.bridges.length>=2);
 let steps=0;
 // 按完整迷宫路线以物理速度控制，覆盖窄桥和每个拐角，不能直接瞬移到出口。
 for(const target of level.path.slice(1)){
  let reached=false;
  for(let i=0;i<3600;i++){
   const m=metrics(level,ball.x,ball.z),dx=(target.x-ball.x)*m.x,dz=(target.z-ball.z)*m.z;
   if(Math.hypot(dx,dz)<.1&&Math.hypot(ball.vx,ball.vz)<.2){reached=true;break;}
   const clamp=v=>Math.max(-1,Math.min(1,v));
   const fell=stepSphere(ball,level,{x:clamp(dx*2.5-ball.vx),y:clamp(-dz*2.5+ball.vz)},1/120);
   assert.equal(fell,false,`level ${d} unexpected fall at ${JSON.stringify(ball)}`);steps++;
  }assert.ok(reached,`unreachable ${d}: ${JSON.stringify(target)}`);
 }
 assert.ok(surfaceDistance(level,ball,level.goal)<.12);
 const point=spherePoint(level,ball.x,ball.z);assert.ok(Math.abs(Math.hypot(...point)-surface(level,ball.x,ball.z).radius)<1e-8);
 if(d>0){const b=level.bridges[0],off={...b,vx:0,vz:0};off[b.axis==='z'?'x':'z']+=b.half+.06;assert.equal(stepSphere(off,level,{x:0,y:0},1/120),true);}
 const hole={...level.holes[0],vx:0,vz:0};assert.equal(stepSphere(hole,level,{x:0,y:0},1/120),true);
 const model=createSphereModel(level);assert.equal(model.starMeshes.length,3);assert.ok(model.board.children.length<=16);assert.ok(model.sphere.position.length()>4);let triangles=0;model.board.traverse(o=>{if(o.geometry)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});disposeMazeModel(model.board);assert.equal(model.board.children.length,0);
 console.log(`Sphere ${d}: route ${level.path.length} cells, ${level.bridges.length} bridges, ${Math.round(steps/120)} simulated seconds, ${triangles} triangles; passed.`);
}

