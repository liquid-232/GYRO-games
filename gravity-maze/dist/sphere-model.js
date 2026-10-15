import {mergeStatic} from './static-geometry.js';
import * as T from './vendor/three.module.js';
import {ORB_RADIUS,spherePoint} from './sphere-physics.js';
import {RADIUS} from './maze-physics.js';
import {makeMaterials,starGeometry} from './maze-materials.js';
const vec=a=>new T.Vector3(...a);
// 每块曲面通道都按同一球面参数生成，视觉坡度与碰撞高度一致。
function patch(level,x0,x1,z0,z1,extra,material){
 const points=[],uv=[],indices=[],nx=8,nz=4;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){points.push(...spherePoint(level,x0+(x1-x0)*i/nx,z0+(z1-z0)*j/nz,extra));uv.push(i/nx,j/nz);}
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const mesh=new T.Mesh(g,material);mesh.receiveShadow=true;return mesh;
}
function edge(level,a,b,extra,material,radius=.018){const pts=[];for(let i=0;i<=10;i++)pts.push(vec(spherePoint(level,a[0]+(b[0]-a[0])*i/10,a[1]+(b[1]-a[1])*i/10,extra)));return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),16,radius,5,false),material);}
export function createSphereModel(level){
 const board=new T.Group(),m=makeMaterials();m.wall.side=T.DoubleSide;m.floor.side=T.DoubleSide;
 const core=new T.Mesh(new T.SphereGeometry(ORB_RADIUS-.65,64,40),m.base);core.receiveShadow=true;board.add(core);
 // 纬线、经线和两极金属环强调这是完整球体。
 const gridMat=new T.MeshStandardMaterial({color:0x497273,metalness:.7,roughness:.35});
 for(const angle of [0,Math.PI/2]){const ring=new T.Mesh(new T.TorusGeometry(ORB_RADIUS-.6,.018,5,100),gridMat);ring.rotation.y=angle;board.add(ring);}
 for(let z=0;z<level.size;z++)for(let x=0;x<level.size;x++){
  const wall=level.grid[z][x],bridge=level.bridges.find(b=>b.x===x&&b.z===z);
  const hx=bridge?.axis==='z'?bridge.half:.5,hz=bridge?.axis==='x'?bridge.half:.5;
  const top=wall?.25:0;
  const cell=patch(level,x-hx,x+hx,z-hz,z+hz,top,wall?m.wall:m.floor);board.add(cell);cell.castShadow=!!wall;
  if(wall){
   // 边缘向通道收成圆润高光，低矮墙体不遮住滚球。
   for(const [a,b,dx,dz] of [[[x-.5,z-.5],[x+.5,z-.5],0,-1],[[x+.5,z-.5],[x+.5,z+.5],1,0],[[x+.5,z+.5],[x-.5,z+.5],0,1],[[x-.5,z+.5],[x-.5,z-.5],-1,0]]){
    if(level.grid[z+dz]?.[x+dx])continue;
    board.add(edge(level,a,b,.24,m.wall,.035));
    const va=vec(spherePoint(level,...a,0)),vb=vec(spherePoint(level,...b,0)),ta=vec(spherePoint(level,...a,.25)),tb=vec(spherePoint(level,...b,.25));
    const g=new T.BufferGeometry().setFromPoints([va,vb,ta,vb,tb,ta]);g.computeVertexNormals();const side=new T.Mesh(g,m.wall);side.castShadow=true;board.add(side);
   }
  }else{
   const color=bridge?m.brass:gridMat;
   for(const sign of [-1,1]){
    if(!bridge||bridge.axis==='x')board.add(edge(level,[x-hx,z+sign*hz],[x+hx,z+sign*hz],.012,color));
    if(!bridge||bridge.axis==='z')board.add(edge(level,[x+sign*hx,z-hz],[x+sign*hx,z+hz],.012,color));
   }
  }
 }
 const markerMaterials=new Map(),holeMaterial=new T.MeshBasicMaterial({color:0x02090e});
 function marker(cell,color,r=.31){if(!markerMaterials.has(color))markerMaterials.set(color,new T.MeshStandardMaterial({color,metalness:.7,roughness:.25}));const ring=new T.Mesh(new T.TorusGeometry(r,.035,8,40),markerMaterials.get(color));const pos=vec(spherePoint(level,cell.x,cell.z,.035));ring.position.copy(pos);ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),pos.clone().normalize());board.add(ring);return ring;}
 marker(level.start,0x86f8df);const exitRing=marker(level.goal,0x788f8b,.33);
 for(const hole of level.holes){const ring=marker(hole,0xff9477,.33);const disk=new T.Mesh(new T.CircleGeometry(.3,32),holeMaterial);disk.position.copy(ring.position);disk.quaternion.copy(ring.quaternion);board.add(disk);}
 const starGeo=starGeometry(),starMeshes=level.stars.map(s=>{const star=new T.Mesh(starGeo,m.star);star.position.copy(vec(spherePoint(level,s.x,s.z,.32)));star.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),star.position.clone().normalize());star.userData.baseQuaternion=star.quaternion.clone();board.add(star);return star;});
 const sphere=new T.Mesh(new T.SphereGeometry(RADIUS,32,24),m.ball);sphere.castShadow=true;sphere.position.copy(vec(spherePoint(level,level.start.x,level.start.z,RADIUS)));board.add(sphere);
 mergeStatic(board,[sphere,exitRing,...starMeshes]);
 return {board,sphere,starMeshes,exitRing};
}
