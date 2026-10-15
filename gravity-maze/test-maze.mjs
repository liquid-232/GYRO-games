import assert from 'node:assert/strict';
import {createLevel,newBall,stepBall,RADIUS} from './dist/maze-physics.js';
for(let i=0;i<3;i++){
 const level=createLevel(i);assert.deepEqual(level,createLevel(i));assert.equal(level.stars.length,3);assert.ok(level.holes.length>0);
 for(const c of [...level.path,...level.stars,level.goal]){assert.equal(level.grid[c.z][c.x],0);assert.ok(!level.holes.some(h=>h.x===c.x&&h.z===c.z));}
 // 路线中心实际推动球，验证球体尺寸能够经过所有拐角并到达出口。
 const ball=newBall(level);
 for(const target of level.path.slice(1)){
  let reached=false;
  for(let j=0;j<1200;j++){const dx=target.x-ball.x,dz=target.z-ball.z;if(Math.hypot(dx,dz)<.045&&Math.hypot(ball.vx,ball.vz)<.15){reached=true;break;}
   assert.equal(stepBall(ball,level,{x:Math.max(-1,Math.min(1,dx*3-ball.vx)),y:Math.max(-1,Math.min(1,-dz*3+ball.vz))},1/120),false);
  }assert.ok(reached,`level ${i} route ${JSON.stringify(target)}`);
 }
 const pressed=newBall(level);for(let j=0;j<3000;j++)stepBall(pressed,level,{x:-1,y:1},1/120);assert.ok(pressed.x>=.5+RADIUS-1e-7);assert.ok(pressed.z>=.5+RADIUS-1e-7);
 const trap={...level.holes[0],vx:0,vz:0};assert.equal(stepBall(trap,level,{x:0,y:0},1/120),true);
}
console.log('Maze: all three routes playable, collision boundaries and traps passed.');

const {createMazeModel,disposeMazeModel}=await import('./dist/maze-model.js');
for(let i=0;i<3;i++){
 const model=createMazeModel(createLevel(i));assert.equal(model.starMeshes.length,3);assert.ok(model.sphere.parent===model.board);assert.ok(model.exitRing.parent===model.board);disposeMazeModel(model.board);assert.equal(model.board.children.length,0);
}
console.log('Standalone maze models construct and dispose for all levels.');
