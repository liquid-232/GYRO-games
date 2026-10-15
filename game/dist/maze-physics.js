// 关卡和物理独立于渲染，以固定时间步保证不同刷新率下的操控一致。
export const RADIUS = .21;
export function createLevel(index) {
  const size = 9 + index * 2, grid = Array.from({length:size},()=>Array(size).fill(1));
  let seed = [41,137,907][index];
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  function carve(x,z) {
    grid[z][x]=0;
    const dirs=[[2,0],[-2,0],[0,2],[0,-2]];
    for(let i=3;i>0;i--){const j=Math.floor(random()*(i+1));[dirs[i],dirs[j]]=[dirs[j],dirs[i]];}
    for(const [dx,dz] of dirs){const nx=x+dx,nz=z+dz;if(nx>0&&nz>0&&nx<size-1&&nz<size-1&&grid[nz][nx]){grid[z+dz/2][x+dx/2]=0;carve(nx,nz);}}
  }
  carve(1,1);
  const start={x:1,z:1}, goal={x:size-2,z:size-2}, queue=[[start]], seen=new Set(['1,1']);let path;
  while(queue.length){const route=queue.shift(),c=route.at(-1);if(c.x===goal.x&&c.z===goal.z){path=route;break;}for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=c.x+dx,z=c.z+dz,key=`${x},${z}`;if(grid[z]?.[x]===0&&!seen.has(key)){seen.add(key);queue.push([...route,{x,z}]);}}}
  const stars=[.25,.5,.75].map(t=>({...path[Math.floor((path.length-1)*t)]}));
  const routeSet=new Set(path.map(c=>`${c.x},${c.z}`)),holes=[];
  for(let z=1;z<size-1;z++)for(let x=1;x<size-1;x++)if(!grid[z][x]&&!routeSet.has(`${x},${z}`)&&Math.hypot(x-1,z-1)>2){if(holes.length<index+2&&holes.every(h=>Math.hypot(h.x-x,h.z-z)>2))holes.push({x,z});}
  return {size,grid,start,goal,stars,holes,path};
}
export function newBall(level){return {...level.start,vx:0,vz:0};}
// 圆与墙体矩形求最短距离；分离接触并消除朝墙的速度，保留沿墙滚动。
export function stepBall(ball,level,input,dt,brake=false){
  const damping=Math.exp(-(brake?15:1.65)*dt);
  ball.vx=(ball.vx+input.x*8*dt)*damping;ball.vz=(ball.vz-input.y*8*dt)*damping;
  const speed=Math.hypot(ball.vx,ball.vz);if(speed>3){ball.vx*=3/speed;ball.vz*=3/speed;}
  ball.x+=ball.vx*dt;ball.z+=ball.vz*dt;
  for(let pass=0;pass<3;pass++)for(let z=Math.max(0,Math.floor(ball.z)-1);z<=Math.min(level.size-1,Math.ceil(ball.z)+1);z++)for(let x=Math.max(0,Math.floor(ball.x)-1);x<=Math.min(level.size-1,Math.ceil(ball.x)+1);x++){
    if(!level.grid[z][x])continue;
    const qx=Math.max(x-.5,Math.min(x+.5,ball.x)),qz=Math.max(z-.5,Math.min(z+.5,ball.z));
    const dx=ball.x-qx,dz=ball.z-qz,d=Math.hypot(dx,dz);
    if(d>0&&d<RADIUS){const nx=dx/d,nz=dz/d;ball.x+=nx*(RADIUS-d);ball.z+=nz*(RADIUS-d);const v=ball.vx*nx+ball.vz*nz;if(v<0){ball.vx-=1.12*v*nx;ball.vz-=1.12*v*nz;}}
  }
  return level.holes.some(h=>Math.hypot(ball.x-h.x,ball.z-h.z)<.28);
}
