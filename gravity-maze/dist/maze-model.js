import {mergeStatic} from './static-geometry.js';
import {makeMaterials,roundedBox} from './maze-materials.js';
import * as T from './vendor/three.module.js';
import {RADIUS} from './maze-physics.js';
// 独立迷宫模型：底座、墙体、滚球、星星和出口。
export function createMazeModel(level){
const board=new T.Group(),ball=level.start,m=makeMaterials();let sphere,starMeshes,exitRing;
const mat=(color,metalness=0,roughness=.5)=>new T.MeshStandardMaterial({color,metalness,roughness});
function mesh(geo,material,x,y,z){const m=new T.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;board.add(m);return m;}
function ring(x,z,color,r=.34){const m=mesh(new T.TorusGeometry(r,.045,8,40),mat(color,.5,.25),x,.045,z);m.rotation.x=-Math.PI/2;return m;}
 const n=level.size,offset=(n-1)/2;board.position.set(-offset,0,-offset);
 mesh(roundedBox(n+.3,.45,n+.3,.12),m.base,offset,-.28,offset);
 const wallGeo=roundedBox(.98,.52,.98,.055),wallMat=m.wall;
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){if(level.grid[z][x])mesh(wallGeo,wallMat,x,.26,z);else{const tile=mesh(new T.PlaneGeometry(.96,.96),m.floor,x,-.047,z);tile.rotation.x=-Math.PI/2;}}
 // 底座金属包边与沉头紧固件，增强近距离观察的层次。
 for(const z of [-.58,n-.42])mesh(roundedBox(n+.15,.055,.055,.012),m.brass,offset,-.055,z);
 for(const x of [-.58,n-.42])mesh(roundedBox(.055,.055,n+.15,.012),m.brass,x,-.055,offset);
 for(const x of [0,n-1])for(const z of [0,n-1]){const screw=mesh(new T.CylinderGeometry(.09,.09,.025,12),m.brass,x,.535,z);screw.castShadow=false;}
 ring(1,1,0x82f5d4);exitRing=ring(level.goal.x,level.goal.z,0x657a86,.36);
 for(const h of level.holes){const hole=mesh(new T.CylinderGeometry(.36,.36,.025,40),mat(0x02090e),h.x,-.018,h.z);hole.receiveShadow=false;ring(h.x,h.z,0xd78170,.39);}
 const starShape=new T.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.115:.25;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)starShape.moveTo(x,y);else starShape.lineTo(x,y);}starShape.closePath();const starGeo=new T.ExtrudeGeometry(starShape,{depth:.075,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:2,steps:1});starGeo.rotateX(-Math.PI/2);starMeshes=level.stars.map(s=>mesh(starGeo,m.star,s.x,.28,s.z));
 sphere=mesh(new T.SphereGeometry(RADIUS,32,24),m.ball,ball.x,RADIUS,ball.z);

mergeStatic(board,[sphere,exitRing,...starMeshes]);
return {board,sphere,starMeshes,exitRing};
}
export function disposeMazeModel(board){const geometries=new Set(),materials=new Set();board.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());const textures=new Set();materials.forEach(m=>{for(const key of ['map','bumpMap','roughnessMap'])if(m[key])textures.add(m[key]);m.dispose();});textures.forEach(t=>t.dispose());board.clear();}
