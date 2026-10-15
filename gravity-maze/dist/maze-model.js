import * as T from './vendor/three.module.js';
import {RADIUS} from './maze-physics.js';
// 独立迷宫模型：底座、墙体、滚球、星星和出口。
export function createMazeModel(level){
const board=new T.Group(),ball=level.start;let sphere,starMeshes,exitRing;
const mat=(color,metalness=0,roughness=.5)=>new T.MeshStandardMaterial({color,metalness,roughness});
function mesh(geo,material,x,y,z){const m=new T.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;board.add(m);return m;}
function ring(x,z,color,r=.34){const m=mesh(new T.TorusGeometry(r,.045,8,40),mat(color,.5,.25),x,.045,z);m.rotation.x=-Math.PI/2;return m;}
 const n=level.size,offset=(n-1)/2;board.position.set(-offset,0,-offset);
 mesh(new T.BoxGeometry(n+.3,.45,n+.3),mat(0x153f44,.45,.32),offset,-.28,offset);
 const wallGeo=new T.BoxGeometry(1,.52,1),wallMat=mat(0x568b83,.35,.3);
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){if(level.grid[z][x])mesh(wallGeo,wallMat,x,.26,z);else{const tile=mesh(new T.PlaneGeometry(.96,.96),mat((x+z)%2?0x244850:0x274c54,.2),x,-.047,z);tile.rotation.x=-Math.PI/2;}}
 ring(1,1,0x82f5d4);exitRing=ring(level.goal.x,level.goal.z,0x657a86,.36);
 for(const h of level.holes){const hole=mesh(new T.CylinderGeometry(.36,.36,.025,40),mat(0x02090e),h.x,-.018,h.z);hole.receiveShadow=false;ring(h.x,h.z,0xd78170,.39);}
 const starShape=new T.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.115:.25;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)starShape.moveTo(x,y);else starShape.lineTo(x,y);}starShape.closePath();const starGeo=new T.ExtrudeGeometry(starShape,{depth:.075,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:2,steps:1});starGeo.rotateX(-Math.PI/2);starMeshes=level.stars.map(s=>mesh(starGeo,mat(0xffd083,.8,.18),s.x,.28,s.z));
 sphere=mesh(new T.SphereGeometry(RADIUS,32,24),mat(0xd6ecef,.95,.12),ball.x,RADIUS,ball.z);

return {board,sphere,starMeshes,exitRing};
}
export function disposeMazeModel(board){const geometries=new Set(),materials=new Set();board.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());board.clear();}
