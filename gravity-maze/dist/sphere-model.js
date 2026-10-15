import * as T from './vendor/three.module.js';
import {mergeStatic} from './static-geometry.js';
import {spherePoint,metrics} from './sphere-physics.js';
import {RADIUS} from './maze-physics.js';
import {starGeometry} from './maze-materials.js';

export const SHELL_RADIUS=5.65;
const vec=a=>new T.Vector3(...a),Z=new T.Vector3(0,0,1);
const QUALITY={floorU:32,floorV:20,edgeSteps:40,edgeSides:20,shellU:256,shellV:160,ballU:128,ballV:96};
// 注塑件使用非金属材质；透明外壳与钢珠独立设置光学参数。
function materials(){
 const plastic=color=>new T.MeshPhysicalMaterial({color,metalness:0,roughness:.29,clearcoat:.75,clearcoatRoughness:.18,ior:1.46,side:T.DoubleSide});
 return {tracks:[0xffc235,0xfa7841,0xa9cc52,0x70bfc1].map(plastic),frame:plastic(0x6354b4),
  hole:plastic(0xdf5546),start:plastic(0x3fbb9a),exit:plastic(0xa0bbb1),
  shell:new T.MeshPhysicalMaterial({color:0xffffff,metalness:0,roughness:.025,transmission:1,thickness:.02,ior:1.46,clearcoat:.25,clearcoatRoughness:.025,envMapIntensity:.65}),
  seam:new T.MeshPhysicalMaterial({color:0xd5eced,metalness:0,roughness:.2,transparent:true,opacity:.24,depthWrite:false}),
  chrome:new T.MeshPhysicalMaterial({color:0xe8edf1,metalness:1,roughness:.105,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.4}),
  star:new T.MeshStandardMaterial({color:0xffd454,metalness:.65,roughness:.23,emissive:0x9e5313,emissiveIntensity:.1})};
}
// 有厚度的轨道沿物理曲面细分，法线通过曲面导数计算，消除相邻格子的明暗断缝。
function normalAt(level,x,z,extra){
 const e=.001,dx=vec(spherePoint(level,x+e,z,extra)).sub(vec(spherePoint(level,x-e,z,extra)));
 const dz=vec(spherePoint(level,x,z+e,extra)).sub(vec(spherePoint(level,x,z-e,extra)));
 return dz.cross(dx).normalize();
}
function surfaceGeometry(level,pointAt,extra,nu,nv,reverse=false){
 const p=[],n=[],uv=[],idx=[];
 for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
  const [x,z]=pointAt(i/nu,j/nv);p.push(...spherePoint(level,x,z,extra));
  const normal=normalAt(level,x,z,extra).multiplyScalar(reverse?-1:1);n.push(...normal);uv.push(i/nu,j/nv);
 }
 for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
  const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;
  idx.push(...(reverse?[a,b,c,b,d,c]:[a,c,b,b,c,d]));
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);return g;
}
function tube(level,a,b,height,material,radius=.024){
 const pts=[];for(let i=0;i<=24;i++)pts.push(vec(spherePoint(level,T.MathUtils.lerp(a[0],b[0],i/24),T.MathUtils.lerp(a[1],b[1],i/24),height)));
 return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),QUALITY.edgeSteps,radius,QUALITY.edgeSides,false),material);
}
// 护栏侧壁沿同一曲线逐段生成；替换原来每条边只有两个平面三角形的做法。
function sideWall(level,a,b,bottom,top,material){
 const p=[],idx=[],segments=40;
 for(let i=0;i<=segments;i++){
  const x=T.MathUtils.lerp(a[0],b[0],i/segments),z=T.MathUtils.lerp(a[1],b[1],i/segments);
  p.push(...spherePoint(level,x,z,bottom),...spherePoint(level,x,z,top));
 }
 for(let i=0;i<segments;i++){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return new T.Mesh(g,material);
}
// 数字直接由代码绘制成印刷贴花，离线可用，不包含参考品牌的图案或商标。
function numberMaterial(){
 const size=1024,data=new Uint8Array(size*256*4),glyphs=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
 for(let label=1;label<=48;label++){
  const ox=(label%16)*64,oy=Math.floor(label/16)*64;
  [...String(label).padStart(2,'0')].forEach((char,digit)=>{
   const glyph=glyphs[Number(char)];for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(glyph[y*3+x]==='1'){
    for(let py=0;py<6;py++)for(let px=0;px<6;px++){
     const k=((oy+17+y*6+py)*size+ox+10+digit*24+x*6+px)*4;data[k]=data[k+1]=data[k+2]=255;data[k+3]=230;
    }
   }
  });
 }
 const texture=new T.DataTexture(data,size,256);texture.flipY=true;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;
 return new T.MeshStandardMaterial({map:texture,alphaTest:.35,depthWrite:false,roughness:.6,polygonOffset:true,polygonOffsetFactor:-2});
}
export function createSphereModel(level){
 const board=new T.Group(),m=materials();board.name='透明外壳立体迷宫玩具';
 const add=(g,mat,cast=true)=>{const mesh=g.isMesh?g:new T.Mesh(g,mat);mesh.castShadow=cast;mesh.receiveShadow=true;board.add(mesh);return mesh;};
 const floorMaterial=z=>m.tracks[Math.min(3,Math.floor(z/level.size*4))];
 const directions=[{dx:0,dz:-1,a:[-.5,-.5],b:[.5,-.5]},{dx:1,dz:0,a:[.5,-.5],b:[.5,.5]},{dx:0,dz:1,a:[.5,.5],b:[-.5,.5]},{dx:-1,dz:0,a:[-.5,.5],b:[-.5,-.5]}];
 for(let z=0;z<level.size;z++)for(let x=0;x<level.size;x++){
  if(level.grid[z][x])continue;
  const bridge=level.bridges.find(b=>b.x===x&&b.z===z),hole=level.holes.find(h=>h.x===x&&h.z===z),mat=bridge?m.tracks[0]:floorMaterial(z);
  const hx=bridge?.axis==='z'?bridge.half:.5,hz=bridge?.axis==='x'?bridge.half:.5;
  const map=(u,v)=>[x-hx+u*2*hx,z-hz+v*2*hz];
  if(hole){
   // 陷阱是真实开孔，内侧曲壁一直延伸到轨道底面。
   const scale=metrics(level,x,z),radius=.30;
   const annulus=(u,v)=>{const a=-u*Math.PI*2,c=Math.cos(a),s=Math.sin(a),outer=.5/Math.max(Math.abs(c),Math.abs(s));return [x+T.MathUtils.lerp(radius*c/scale.x,outer*c,v),z+T.MathUtils.lerp(radius*s/scale.z,outer*s,v)];};
   add(surfaceGeometry(level,annulus,0,96,12),mat);add(surfaceGeometry(level,annulus,-.095,96,12,true),mat);
   const points=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2;points.push(vec(spherePoint(level,x+radius*Math.cos(a)/scale.x,z+radius*Math.sin(a)/scale.z,.012)));}
   add(new T.TubeGeometry(new T.CatmullRomCurve3(points),128,.026,20,false),m.hole);
   const wall=[];for(let i=0;i<=96;i++){const a=i/96*Math.PI*2;wall.push([x+radius*Math.cos(a)/scale.x,z+radius*Math.sin(a)/scale.z]);}
   for(let i=0;i<96;i++){
    const a=wall[i],b=wall[i+1],p=[...spherePoint(level,...a,0),...spherePoint(level,...a,-.1),...spherePoint(level,...b,0),...spherePoint(level,...b,-.1)];
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex([0,1,2,1,3,2]);g.computeVertexNormals();add(g,m.hole);
   }
  }else{
   add(surfaceGeometry(level,map,0,QUALITY.floorU,QUALITY.floorV),mat);
   add(surfaceGeometry(level,map,-.095,QUALITY.floorU,QUALITY.floorV,true),mat);
  }
  for(const d of directions){
   const a=[x+d.a[0]*2*hx,z+d.a[1]*2*hz],b=[x+d.b[0]*2*hx,z+d.b[1]*2*hz];
   const acrossBridge=bridge&&(bridge.axis==='x'?d.dz!==0:d.dx!==0);
   if(!level.grid[z+d.dz]?.[x+d.dx]&&!acrossBridge)continue;
   // 真正的窄桥只保留圆角路缘，避免可掉落边缘被画成不可越过的高墙。
   const height=acrossBridge?.018:.17;
   add(sideWall(level,a,b,-.095,height,mat));add(tube(level,a,b,height,mat,acrossBridge?.018:.035));
   if(!acrossBridge){
    // 双面护栏带厚度，外沿偏向碰撞墙内部，不侵占滚球通道。
    const scale=metrics(level,x,z),shift=[d.dx*.055/scale.x,d.dz*.055/scale.z],aa=[a[0]+shift[0],a[1]+shift[1]],bb=[b[0]+shift[0],b[1]+shift[1]];
    add(sideWall(level,aa,bb,-.095,height,mat));add(tube(level,aa,bb,height,mat,.035));
   }
  }
 }
 // 内部弧形加强筋和螺柱让轨道有真实的悬空支撑，球心保持通透。
 const ringGeometry=new T.TorusGeometry(3.25,.065,24,192),supportRings=[];
 for(const angle of [-.55,.85]){const ring=add(ringGeometry,m.frame);ring.rotation.set(Math.PI/2,angle,.35);supportRings.push(ring.quaternion.clone());}
 for(let z=1;z<level.size-1;z+=2)for(let x=1;x<level.size-1;x+=4){
  if(level.holes.some(h=>h.x===x&&h.z===z)||level.bridges.some(b=>b.x===x&&b.z===z))continue;
  const anchor=vec(spherePoint(level,x,z,-.11));
  // 每根支柱终止于实际加强环，避免悬空的装饰柱或穿过陷阱开孔。
  const ends=supportRings.map(q=>{const p=anchor.clone().applyQuaternion(q.clone().invert());p.z=0;return p.normalize().multiplyScalar(3.25).applyQuaternion(q);});
  const inner=ends.sort((a,b)=>a.distanceToSquared(anchor)-b.distanceToSquared(anchor))[0];
  const support=add(new T.CylinderGeometry(.045,.065,anchor.distanceTo(inner),24),m.frame);
  support.position.copy(anchor).add(inner).multiplyScalar(.5);support.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),anchor.clone().sub(inner).normalize());
  const collar=add(new T.TorusGeometry(.11,.025,16,48),m.frame);collar.position.copy(anchor);collar.quaternion.setFromUnitVectors(Z,anchor.clone().normalize());
 }
 // 两半球的注塑合模线和紫色扣合环，参考真实玩具的装配结构。
 const seamRotation=new T.Euler(.32,0,.18),seamQuaternion=new T.Quaternion().setFromEuler(seamRotation);
 const rim=add(new T.TorusGeometry(SHELL_RADIUS-.025,.065,24,256),m.frame);rim.quaternion.copy(seamQuaternion);
 const seam=add(new T.TorusGeometry(SHELL_RADIUS+.006,.012,16,256),m.seam,false);seam.quaternion.copy(seamQuaternion);
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4,position=new T.Vector3(Math.cos(a)*(SHELL_RADIUS-.035),Math.sin(a)*(SHELL_RADIUS-.035),0).applyQuaternion(seamQuaternion);
  const lug=add(new T.SphereGeometry(.11,32,20),m.frame);lug.scale.set(1,1,.68);lug.position.copy(position);lug.quaternion.setFromUnitVectors(Z,position.clone().normalize());
  const screw=add(new T.SphereGeometry(.044,24,16),m.chrome);screw.scale.set(1,1,.38);screw.position.copy(position).addScaledVector(position.clone().normalize(),.073);screw.quaternion.copy(lug.quaternion);
 }
 function marker(cell,mat,r=.31){
  const ring=add(new T.TorusGeometry(r,.034,24,96),mat),pos=vec(spherePoint(level,cell.x,cell.z,.04));ring.position.copy(pos);ring.quaternion.setFromUnitVectors(Z,pos.clone().normalize());return ring;
 }
 marker(level.start,m.start);const exitRing=marker(level.goal,m.exit,.32);
 // 路线编号按照实际通关路线递增；与球面贴合，不遮住通道中央的钢珠。
 const print=numberMaterial();
 for(let i=0;i<level.path.length;i+=3){
  const c=level.path[i];if(level.bridges.some(b=>b.x===c.x&&b.z===c.z))continue;
  const label=i+1,g=new T.PlaneGeometry(.31,.2),uv=g.attributes.uv;
  for(let k=0;k<uv.count;k++)uv.setXY(k,(label%16+uv.getX(k))/16,1-(Math.floor(label/16)+1-uv.getY(k))/4);
  const mesh=add(g,print,false),pos=vec(spherePoint(level,c.x+.22,c.z,.012));mesh.position.copy(pos);mesh.quaternion.setFromUnitVectors(Z,pos.clone().normalize());
 }
 const starGeo=starGeometry(),starMeshes=level.stars.map(s=>{const star=add(starGeo,m.star);star.position.copy(vec(spherePoint(level,s.x,s.z,.32)));star.quaternion.setFromUnitVectors(Z,star.position.clone().normalize());star.userData.baseQuaternion=star.quaternion.clone();return star;});
 const sphere=add(new T.SphereGeometry(RADIUS,QUALITY.ballU,QUALITY.ballV),m.chrome);sphere.name='高精度抛光钢珠';sphere.position.copy(vec(spherePoint(level,level.start.x,level.start.z,RADIUS)));
 const shell=add(new T.SphereGeometry(SHELL_RADIUS,QUALITY.shellU,QUALITY.shellV),m.shell,false);shell.name='透明聚碳酸酯外壳';shell.receiveShadow=false;shell.renderOrder=2;
 // 透明壳和合模线单独绘制；其余静态部件按共享材质合并。
 mergeStatic(board,[sphere,exitRing,...starMeshes,shell,seam]);
 let triangles=0;board.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
 board.userData.triangles=triangles;board.userData.quality={...QUALITY};
 return {board,sphere,starMeshes,exitRing};
}
