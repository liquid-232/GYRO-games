import {createLevel,RADIUS} from './maze-physics.js';
// 同一连续曲面同时驱动显示、碰撞与坡度，外环经缓坡深入球内再返回。
export const ORB_RADIUS=4.85;
const LATITUDE_SPAN=2.25,DEPTHS=[.60,1.05,1.35];
export function createSphereLevel(difficulty){
 const level=createLevel(difficulty);Object.assign(level,{kind:'sphere',difficulty,bridges:[],posts:[],depth:DEPTHS[difficulty]});
 const protectedCell=c=>[level.start,level.goal,...level.stars].some(s=>Math.hypot(s.x-c.x,s.z-c.z)<1.8);
 // 桥宽使用实际空间长度，避免球内半径缩小时同一格子宽度变成不可控的细线。
 const candidates=[];
 for(let i=3;i<level.path.length-3;i++){
  const prev=level.path[i-1],cell=level.path[i],next=level.path[i+1];
  if(protectedCell(cell)||!(prev.x===next.x||prev.z===next.z))continue;
  candidates.push({...cell,axis:prev.x===next.x?'z':'x',order:i});
 }
 const target=[1,3,5][difficulty];
 // 优先均匀分散到整条路线，星星附近保留可停稳的安全平台。
 for(let slot=0;slot<target;slot++){
  const ideal=(slot+1)*level.path.length/(target+1);
  const c=candidates.filter(c=>level.bridges.every(b=>Math.hypot(b.x-c.x,b.z-c.z)>2.5)).sort((a,b)=>Math.abs(a.order-ideal)-Math.abs(b.order-ideal))[0];
  if(!c)continue;
  const scale=metrics(level,c.x,c.z),cross=c.axis==='z'?scale.x:scale.z;
  const half=Math.min(.42,[.32,.29,.25][difficulty]/cross);
  level.bridges.push({...c,half});
 }
 // 宽通道里的偏心挡柱要求主动绕行。留足一侧通路，不在桥/星星旁放柱。
 for(const c of candidates){
  if(c.axis!=='z'||level.posts.length>=[1,3,5][difficulty])continue;
  if(level.bridges.some(b=>Math.hypot(b.x-c.x,b.z-c.z)<2)||level.posts.some(p=>Math.hypot(p.x-c.x,p.z-c.z)<2.5))continue;
  const scale=metrics(level,c.x,c.z),radius=.105;
  if(scale.x<1.25)continue;
  const offset=(level.posts.length%2?1:-1)*.12;
  level.posts.push({x:c.x+offset/scale.x,z:c.z,radius,cellX:c.x,cellZ:c.z});
 }
 // 深层通道随半径收窄，开孔也同步缩放，避免孔洞与护栏边界交叉。
 for(const hole of level.holes){const m=metrics(level,hole.x,hole.z);hole.radius=Math.min(.30,.42*Math.min(m.x,m.z));}
 return level;
}
export function surface(level,x,z){
 const longitude=(x-(level.size-1)/2)*5.5/level.size;
 const latitude=((level.size-1)/2-z)*LATITUDE_SPAN/level.size;
 const u=Math.max(0,Math.min(1,(z-1)/(level.size-3))),v=Math.max(0,Math.min(1,(x-1)/(level.size-3)));
 const basin=Math.sin(Math.PI*u)**2,across=.82+.18*Math.sin(Math.PI*v)**2;
 // 起终点平台平缓，中央通道下沉；高难度增加低幅度反坡，需要主动控制惯性。
 const ripple=level.difficulty*.055*basin*Math.sin(x*1.12)*Math.sin(z*.93);
 const height=-(level.depth??DEPTHS[level.difficulty]??.6)*basin*across+ripple;
 return {longitude,latitude,height,radius:ORB_RADIUS+height};
}
export function metrics(level,x,z){
 const s=surface(level,x,z),e=.001;
 const rx=(surface(level,x+e,z).height-surface(level,x-e,z).height)/(2*e);
 const rz=(surface(level,x,z+e).height-surface(level,x,z-e).height)/(2*e);
 return {x:Math.hypot(s.radius*Math.cos(s.latitude)*5.5/level.size,rx),z:Math.hypot(s.radius*LATITUDE_SPAN/level.size,rz)};
}
export function spherePoint(level,x,z,extra=0){const s=surface(level,x,z),r=s.radius+extra,c=Math.cos(s.latitude);return [r*c*Math.sin(s.longitude),r*Math.sin(s.latitude),r*c*Math.cos(s.longitude)];}
export function surfaceNormal(level,x,z){
 const e=.001,a=spherePoint(level,x+e,z),b=spherePoint(level,x-e,z),c=spherePoint(level,x,z+e),d=spherePoint(level,x,z-e);
 const dx=a.map((v,i)=>v-b[i]),dz=c.map((v,i)=>v-d[i]);
 const n=[dz[1]*dx[2]-dz[2]*dx[1],dz[2]*dx[0]-dz[0]*dx[2],dz[0]*dx[1]-dz[1]*dx[0]],length=Math.hypot(...n);
 return n.map(v=>v/length);
}
// 钢珠沿轨道真实法线抬高，深坡上也不会陷进路面。
export function sphereBallPoint(level,x,z,lift=RADIUS){const p=spherePoint(level,x,z),n=surfaceNormal(level,x,z);return p.map((v,i)=>v+n[i]*lift);}
export function surfaceDistance(level,a,b){const pa=spherePoint(level,a.x,a.z),pb=spherePoint(level,b.x,b.z);return Math.hypot(...pa.map((v,i)=>v-pb[i]));}
export function stepSphere(ball,level,input,dt,brake=false){
 const m=metrics(level,ball.x,ball.z),eps=.001;
 const slopeX=(surface(level,ball.x+eps,ball.z).height-surface(level,ball.x-eps,ball.z).height)/(2*eps*m.x);
 const slopeZ=(surface(level,ball.x,ball.z+eps).height-surface(level,ball.x,ball.z-eps).height)/(2*eps*m.z);
 const damping=Math.exp(-(brake?18:2.5-level.difficulty*.35)*dt),accel=5.5;
 ball.vx=(ball.vx+(input.x*accel-slopeX*2.4)*dt)*damping;
 ball.vz=(ball.vz+(-input.y*accel-slopeZ*2.4)*dt)*damping;
 const speed=Math.hypot(ball.vx,ball.vz),max=2.05+level.difficulty*.22;if(speed>max){ball.vx*=max/speed;ball.vz*=max/speed;}
 ball.x+=ball.vx*dt/m.x;ball.z+=ball.vz*dt/m.z;
 // 墙与挡柱交替解算，避免贴着障碍时被一次推到相邻墙里。
 for(let pass=0;pass<3;pass++){
  const scale=metrics(level,ball.x,ball.z);
  for(let z=Math.max(0,Math.floor(ball.z)-1);z<=Math.min(level.size-1,Math.ceil(ball.z)+1);z++)for(let x=Math.max(0,Math.floor(ball.x)-1);x<=Math.min(level.size-1,Math.ceil(ball.x)+1);x++){
   if(!level.grid[z][x])continue;
   const qx=Math.max(x-.5,Math.min(x+.5,ball.x)),qz=Math.max(z-.5,Math.min(z+.5,ball.z));
   const dx=(ball.x-qx)*scale.x,dz=(ball.z-qz)*scale.z,d=Math.hypot(dx,dz);
   if(d>0&&d<RADIUS){const nx=dx/d,nz=dz/d;ball.x+=nx*(RADIUS-d)/scale.x;ball.z+=nz*(RADIUS-d)/scale.z;const v=ball.vx*nx+ball.vz*nz;if(v<0){ball.vx-=1.08*v*nx;ball.vz-=1.08*v*nz;}}
  }
  for(const p of level.posts){
   const dx=(ball.x-p.x)*scale.x,dz=(ball.z-p.z)*scale.z,d=Math.hypot(dx,dz),limit=RADIUS+p.radius;
   if(d>=limit)continue;const nx=d>1e-7?dx/d:1,nz=d>1e-7?dz/d:0;
   ball.x+=nx*(limit-d)/scale.x;ball.z+=nz*(limit-d)/scale.z;
   const speed=ball.vx*nx+ball.vz*nz;if(speed<0){ball.vx-=1.05*speed*nx;ball.vz-=1.05*speed*nz;}
  }
 }
 if(level.holes.some(h=>surfaceDistance(level,ball,h)<h.radius*.93))return true;
 return level.bridges.some(b=>Math.abs(ball.x-b.x)<.5&&Math.abs(ball.z-b.z)<.5&&Math.abs(b.axis==='z'?ball.x-b.x:ball.z-b.z)>b.half);
}
