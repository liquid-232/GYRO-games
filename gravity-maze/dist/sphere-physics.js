import {createLevel,RADIUS} from './maze-physics.js';
// 球面经纬参数仅用于索引迷宫；速度、碰撞距离均换算为球面上的实际长度。
export const ORB_RADIUS=4.6;
export function createSphereLevel(difficulty){
 const level=createLevel(difficulty);Object.assign(level,{kind:'sphere',difficulty,bridges:[]});
 if(difficulty>0){
  for(let i=3;i<level.path.length-3;i++){
   const prev=level.path[i-1],cell=level.path[i],next=level.path[i+1];
   if(level.stars.some(s=>Math.hypot(s.x-cell.x,s.z-cell.z)<2))continue;
   if(prev.x===next.x||prev.z===next.z){
    if(level.bridges.every(b=>Math.hypot(b.x-cell.x,b.z-cell.z)>3))level.bridges.push({...cell,axis:prev.x===next.x?'z':'x',half:prev.x===next.x?(difficulty===1?.31:.24):(difficulty===1?.16:.10)});
   }if(level.bridges.length>=difficulty+1)break;
  }
 }
 return level;
}
export function surface(level,x,z){
 const longitude=(x-(level.size-1)/2)*5.5/level.size;
 const latitude=((level.size-1)/2-z)*1.9/level.size;
 const height=level.difficulty? .22*level.difficulty*Math.sin(x*.78)*Math.cos(z*.65):0;
 return {longitude,latitude,height,radius:ORB_RADIUS+height};
}
export function metrics(level,x,z){const s=surface(level,x,z);return {x:s.radius*Math.cos(s.latitude)*5.5/level.size,z:s.radius*1.9/level.size};}
export function spherePoint(level,x,z,extra=0){const s=surface(level,x,z),r=s.radius+extra,c=Math.cos(s.latitude);return [r*c*Math.sin(s.longitude),r*Math.sin(s.latitude),r*c*Math.cos(s.longitude)];}
export function surfaceDistance(level,a,b){const pa=spherePoint(level,a.x,a.z),pb=spherePoint(level,b.x,b.z);return Math.hypot(...pa.map((v,i)=>v-pb[i]));}
export function stepSphere(ball,level,input,dt,brake=false){
 const m=metrics(level,ball.x,ball.z),eps=.01;
 // 径向起伏产生沿坡面的重力分量；空格制动同时抑制坡道滑动。
 const slopeX=(surface(level,ball.x+eps,ball.z).height-surface(level,ball.x-eps,ball.z).height)/(2*eps*m.x);
 const slopeZ=(surface(level,ball.x,ball.z+eps).height-surface(level,ball.x,ball.z-eps).height)/(2*eps*m.z);
 const damping=Math.exp(-(brake?18:2.4-level.difficulty*.3)*dt),accel=5.5;
 ball.vx=(ball.vx+(input.x*accel-slopeX*2)*dt)*damping;
 ball.vz=(ball.vz+(-input.y*accel-slopeZ*2)*dt)*damping;
 const speed=Math.hypot(ball.vx,ball.vz),max=2.1+level.difficulty*.25;if(speed>max){ball.vx*=max/speed;ball.vz*=max/speed;}
 ball.x+=ball.vx*dt/m.x;ball.z+=ball.vz*dt/m.z;
 for(let pass=0;pass<3;pass++)for(let z=Math.max(0,Math.floor(ball.z)-1);z<=Math.min(level.size-1,Math.ceil(ball.z)+1);z++)for(let x=Math.max(0,Math.floor(ball.x)-1);x<=Math.min(level.size-1,Math.ceil(ball.x)+1);x++){
  if(!level.grid[z][x])continue;
  const qx=Math.max(x-.5,Math.min(x+.5,ball.x)),qz=Math.max(z-.5,Math.min(z+.5,ball.z));
  const dx=(ball.x-qx)*m.x,dz=(ball.z-qz)*m.z,d=Math.hypot(dx,dz);
  if(d>0&&d<RADIUS){const nx=dx/d,nz=dz/d;ball.x+=nx*(RADIUS-d)/m.x;ball.z+=nz*(RADIUS-d)/m.z;const v=ball.vx*nx+ball.vz*nz;if(v<0){ball.vx-=1.08*v*nx;ball.vz-=1.08*v*nz;}}
 }
 if(level.holes.some(h=>surfaceDistance(level,ball,h)<.28))return true;
 return level.bridges.some(b=>Math.abs(ball.x-b.x)<.5&&Math.abs(ball.z-b.z)<.5&&Math.abs(b.axis==='z'?ball.x-b.x:ball.z-b.z)>b.half);
}
