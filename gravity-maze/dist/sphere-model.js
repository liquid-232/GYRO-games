import {addEndpointMarkers} from './endpoint-markers.js';
import {addSphereInterior} from './sphere-interior.js';
import * as T from './vendor/three.module.js';
import {mergeStatic} from './static-geometry.js';
import {spherePoint,sphereBallPoint,surfaceNormal,surface,metrics} from './sphere-physics.js';
import {RADIUS} from './maze-physics.js';
import {starGeometry} from './maze-materials.js';

export const SHELL_RADIUS=5.65;
const vec=a=>new T.Vector3(...a),Z=new T.Vector3(0,0,1);
const QUALITY={floorU:32,floorV:20,edgeSteps:40,edgeSides:20,shellU:256,shellV:160,ballU:128,ballV:96};
// 注塑件使用非金属材质；透明外壳与钢珠独立设置光学参数。
function materials(){
 const plastic=color=>new T.MeshPhysicalMaterial({color,metalness:0,roughness:.29,clearcoat:.75,clearcoatRoughness:.18,ior:1.46,side:T.DoubleSide});
 return {tracks:[0xffc235,0xfa7841,0xa9cc52,0x70bfc1].map(plastic),frame:plastic(0x6354b4),
  hole:plastic(0xdf5546),start:plastic(0x3fbb9a),exit:plastic(0xa0bbb1),bumper:plastic(0xd74e40),
  shell:clearShellMaterial(),
  seam:new T.MeshPhysicalMaterial({color:0xd5eced,metalness:0,roughness:.2,transparent:true,opacity:.24,depthWrite:false}),
  chrome:new T.MeshPhysicalMaterial({color:0xe8edf1,metalness:1,roughness:.105,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.4}),
  star:new T.MeshStandardMaterial({color:0xffd454,metalness:.65,roughness:.23,emissive:0x9e5313,emissiveIntensity:.1})};
}
// 薄透明壳直接合成内部原始画面，避免屏幕空间透射采样把细轨道变软。
// 视线越贴近轮廓反光越明显，球心只留很淡的保护壳高光。
function clearShellMaterial(){
 const mat=new T.MeshPhysicalMaterial({color:0xf6fcff,metalness:0,roughness:.07,transparent:true,opacity:.06,depthWrite:false,transmission:0,ior:1.46,clearcoat:.35,clearcoatRoughness:.06,envMapIntensity:1.1});
 mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
  float shellEdge=pow(1.0-clamp(dot(normal,geometryViewDir),0.0,1.0),3.5);
  diffuseColor.a=mix(0.018,0.5,shellEdge);
  outgoingLight=mix(outgoingLight,vec3(0.12,0.20,0.23),shellEdge*0.72);
  #include <opaque_fragment>
 `);};
 mat.customProgramCacheKey=()=> 'crisp-toy-shell-v1';return mat;
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
 const pts=[];for(let i=0;i<=24;i++)pts.push(vec(sphereBallPoint(level,T.MathUtils.lerp(a[0],b[0],i/24),T.MathUtils.lerp(a[1],b[1],i/24),height)));
 return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),QUALITY.edgeSteps,radius,QUALITY.edgeSides,false),material);
}
// 护栏顶部沿路面法线抬高，与钢珠接触方向一致；底部接回轨道厚度。
function sideWall(level,a,b,bottom,top,material){
 const p=[],idx=[],segments=40;
 for(let i=0;i<=segments;i++){
  const x=T.MathUtils.lerp(a[0],b[0],i/segments),z=T.MathUtils.lerp(a[1],b[1],i/segments);
  p.push(...spherePoint(level,x,z,bottom),...sphereBallPoint(level,x,z,top));
 }
 for(let i=0;i<segments;i++){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return new T.Mesh(g,material);
}
// 数字直接由代码绘制成印刷贴花，离线可用，不包含参考品牌的图案或商标。
function numberMaterial(maxLabel){
 const size=1024,rows=Math.ceil((maxLabel+1)/16),height=rows*64,data=new Uint8Array(size*height*4),glyphs=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
 for(let label=1;label<=maxLabel;label++){
  const ox=(label%16)*64,oy=Math.floor(label/16)*64;
  [...String(label).padStart(2,'0')].forEach((char,digit)=>{
   const glyph=glyphs[Number(char)];for(let y=0;y<5;y++)for(let x=0;x<3;x++)if(glyph[y*3+x]==='1'){
    for(let py=0;py<6;py++)for(let px=0;px<6;px++){
     const k=((oy+17+y*6+py)*size+ox+10+digit*24+x*6+px)*4;data[k]=data[k+1]=data[k+2]=255;data[k+3]=230;
    }
   }
  });
 }
 const texture=new T.DataTexture(data,size,height);texture.flipY=true;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;
 return new T.MeshStandardMaterial({map:texture,alphaTest:.35,depthWrite:false,roughness:.6,polygonOffset:true,polygonOffsetFactor:-2});
}
export function createSphereModel(level){
 const board=new T.Group(),m=materials();board.name='透明外壳立体迷宫玩具';
 const add=(g,mat,cast=true)=>{const mesh=g.isMesh?g:new T.Mesh(g,mat);mesh.castShadow=cast;mesh.receiveShadow=true;board.add(mesh);return mesh;};
 // 从外层橙色到内层青色，直接用当前轨道深度选色，提示真实的下潜位置。
 const floorMaterial=(x,z)=>{const depth=-surface(level,x,z).height;return m.tracks[depth<level.depth*.22?1:depth<level.depth*.56?0:depth<level.depth*.80?2:3];};
 const directions=[{dx:0,dz:-1,a:[-.5,-.5],b:[.5,-.5]},{dx:1,dz:0,a:[.5,-.5],b:[.5,.5]},{dx:0,dz:1,a:[.5,.5],b:[-.5,.5]},{dx:-1,dz:0,a:[-.5,.5],b:[-.5,-.5]}];
 for(let z=0;z<level.size;z++)for(let x=0;x<level.size;x++){
  if(level.grid[z][x])continue;
  const bridge=level.bridges.find(b=>b.x===x&&b.z===z),hole=level.holes.find(h=>h.x===x&&h.z===z),mat=bridge?m.tracks[0]:floorMaterial(x,z);
  const hx=bridge?.axis==='z'?bridge.half:.5,hz=bridge?.axis==='x'?bridge.half:.5;
  const map=(u,v)=>[x-hx+u*2*hx,z-hz+v*2*hz];
  if(hole){
   // 陷阱是真实开孔，内侧曲壁一直延伸到轨道底面。
   const scale=metrics(level,x,z),radius=hole.radius;
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
 // 径向支撑停在同一个通道的底面；内端沿支撑层接环，不横穿相邻可玩轨道。
 const supportRadius=2.75,ringGeometry=new T.TorusGeometry(supportRadius,.055,20,160),supportRings=[];
 for(const angle of [-.55,.85]){const ring=add(ringGeometry,m.frame);ring.rotation.set(Math.PI/2,angle,.35);supportRings.push(ring.quaternion.clone());}
 const Y=new T.Vector3(0,1,0);
 function supportRod(a,b){const delta=b.clone().sub(a),o=add(new T.CylinderGeometry(.038,.055,delta.length(),16),m.frame);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(Y,delta.normalize());}
 for(let z=1;z<level.size-1;z+=2)for(let x=1;x<level.size-1;x+=2){
  if(level.grid[z][x]||level.holes.some(h=>h.x===x&&h.z===z)||level.bridges.some(b=>b.x===x&&b.z===z))continue;
  const anchor=vec(spherePoint(level,x,z,-.115)),radial=anchor.clone().normalize().multiplyScalar(supportRadius);
  const ends=supportRings.map(q=>{const p=radial.clone().applyQuaternion(q.clone().invert());p.z=0;return p.normalize().multiplyScalar(supportRadius).applyQuaternion(q);});
  const end=ends.sort((a,b)=>a.distanceToSquared(radial)-b.distanceToSquared(radial))[0];
  supportRod(anchor,radial);
  const arc=[];for(let i=0;i<=16;i++)arc.push(radial.clone().lerp(end,i/16).normalize().multiplyScalar(supportRadius));
  if(radial.distanceToSquared(end)>1e-8)add(new T.TubeGeometry(new T.CatmullRomCurve3(arc),24,.032,10,false),m.frame);
  const collar=add(new T.TorusGeometry(.095,.022,12,40),m.frame);collar.position.copy(anchor);collar.quaternion.setFromUnitVectors(Z,anchor.clone().normalize());
 }
 // 红色圆头挡柱是真实碰撞障碍；白色环带与陷阱/星星区分。
 const stripe=new T.MeshStandardMaterial({color:0xfff2da,roughness:.36});
 for(const post of level.posts){
  const position=vec(sphereBallPoint(level,post.x,post.z,.19)),normal=vec(surfaceNormal(level,post.x,post.z));
  const body=add(new T.CylinderGeometry(post.radius,post.radius,.38,32),m.bumper);body.position.copy(position);body.quaternion.setFromUnitVectors(Y,normal);
  const cap=add(new T.SphereGeometry(post.radius,32,20),m.bumper);cap.scale.set(1,.55,1);cap.position.copy(position).addScaledVector(normal,.19);cap.quaternion.copy(body.quaternion);
  const band=add(new T.TorusGeometry(post.radius+.003,.018,12,40),stripe);band.position.copy(position).addScaledVector(normal,.055);band.quaternion.setFromUnitVectors(Z,normal);
 }
 addSphereInterior(board,m);
 // 两半球的注塑合模线和紫色扣合环，参考真实玩具的装配结构。
 const seamRotation=new T.Euler(.32,0,.18),seamQuaternion=new T.Quaternion().setFromEuler(seamRotation);
 const rim=add(new T.TorusGeometry(SHELL_RADIUS-.025,.065,24,256),m.frame);rim.quaternion.copy(seamQuaternion);
 const seam=add(new T.TorusGeometry(SHELL_RADIUS+.006,.012,16,256),m.seam,false);seam.quaternion.copy(seamQuaternion);
 for(let i=0;i<8;i++){
  const a=i*Math.PI/4,position=new T.Vector3(Math.cos(a)*(SHELL_RADIUS-.035),Math.sin(a)*(SHELL_RADIUS-.035),0).applyQuaternion(seamQuaternion);
  const lug=add(new T.SphereGeometry(.11,32,20),m.frame);lug.scale.set(1,1,.68);lug.position.copy(position);lug.quaternion.setFromUnitVectors(Z,position.clone().normalize());
  const screw=add(new T.SphereGeometry(.044,24,16),m.chrome);screw.scale.set(1,1,.38);screw.position.copy(position).addScaledVector(position.clone().normalize(),.073);screw.quaternion.copy(lug.quaternion);
 }
 const exitRing=addEndpointMarkers(board,level);
 // 路线编号按照实际通关路线递增；与球面贴合，不遮住通道中央的钢珠。
 const print=numberMaterial(level.path.length),printRows=Math.ceil((level.path.length+1)/16);
 for(let i=0;i<level.path.length;i+=3){
  const c=level.path[i];if(i===0||i===level.path.length-1||level.bridges.some(b=>b.x===c.x&&b.z===c.z)||level.posts.some(p=>p.cellX===c.x&&p.cellZ===c.z))continue;
  const label=i+1,g=new T.PlaneGeometry(.31,.2),uv=g.attributes.uv;
  for(let k=0;k<uv.count;k++)uv.setXY(k,(label%16+uv.getX(k))/16,1-(Math.floor(label/16)+1-uv.getY(k))/printRows);
  const mesh=add(g,print,false),pos=vec(sphereBallPoint(level,c.x+.22,c.z,.016));mesh.position.copy(pos);mesh.quaternion.setFromUnitVectors(Z,vec(surfaceNormal(level,c.x+.22,c.z)));
 }
 const starGeo=starGeometry(),starMeshes=level.stars.map(s=>{const star=add(starGeo,m.star);star.position.copy(vec(sphereBallPoint(level,s.x,s.z,.32)));star.quaternion.setFromUnitVectors(Z,star.position.clone().normalize());star.userData.baseQuaternion=star.quaternion.clone();return star;});
 const sphere=add(new T.SphereGeometry(RADIUS,QUALITY.ballU,QUALITY.ballV),m.chrome);sphere.name='高精度抛光钢珠';sphere.position.copy(vec(sphereBallPoint(level,level.start.x,level.start.z,RADIUS)));
 const shell=add(new T.SphereGeometry(SHELL_RADIUS,QUALITY.shellU,QUALITY.shellV),m.shell,false);shell.name='透明聚碳酸酯外壳';shell.receiveShadow=false;shell.renderOrder=2;
 // 透明壳和合模线单独绘制；其余静态部件按共享材质合并。
 mergeStatic(board,[sphere,exitRing,...starMeshes,shell,seam]);
 let triangles=0;board.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
 board.userData.triangles=triangles;board.userData.quality={...QUALITY};
 return {board,sphere,starMeshes,exitRing};
}
