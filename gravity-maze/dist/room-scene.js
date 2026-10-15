import * as T from './vendor/three.module.js';
import { roundedBox } from './maze-materials.js';
import { mergeStatic } from './static-geometry.js';

// 儿童房使用真实厚度的墙体、窗框与家具。所有坐标与木桌共享世界坐标：
// 地面 y=-15，桌面 y=-6.1，背墙 z=-29，正面保持开放，供游戏相机观察。
const FLOOR_Y=-15;
// 本地生成的微表面贴图保持轻微起伏；不引入图片下载或屏幕模糊。
// 细纹随纹理的 mipmap 缩小，远处墙面和织物不会出现闪烁的粗颗粒。
function surfaceTexture(kind){
 const size=512,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const noise=((Math.imul(x+31,374761393)^Math.imul(y+17,668265263))>>>0)%101/100-.5;
  let n;
  if(kind==='wood'||kind==='woodRough'){
   const bend=Math.sin(x*.017)*1.7+Math.sin(x*.037+y*.006)*.7;
   const lines=Math.sin(y*.19+bend)*.55+Math.sin(y*.063+bend*.35)*.30+Math.sin(y*.71+bend*1.5)*.15;
   n=kind==='wood'?231+lines*13+noise*2:211+lines*17+noise*2;
  }else if(kind==='weave'){
   const warp=Math.sin(x*Math.PI/4),weft=Math.sin(y*Math.PI/4);
   n=197+warp*8+weft*7+warp*weft*6+noise*2;
  }else{
   const cloud=Math.sin(x*.045+Math.sin(y*.024))*Math.sin(y*.051)*2;
   n=215+noise*8+cloud;
  }
  const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=Math.round(n);data[i+3]=255;
 }
 const tex=new T.DataTexture(data,size,size);tex.wrapS=tex.wrapT=T.RepeatWrapping;
 tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;
 tex.anisotropy=16;tex.repeat.set(kind==='plaster'?4:kind==='weave'?3:1,kind==='plaster'?3:kind==='weave'?3:1);tex.needsUpdate=true;return tex;
}
// 建筑与家具的局部遮蔽只降低间接反射，保留窗光照到表面的亮度。
// 使用合并后的世界坐标，因此不增加透明遮罩的绘制次数和排序伪影。
function localOcclusion(material,architecture=false){
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>',
   '#include <common>\nvarying vec3 vRoomSurface;\nvarying vec3 vRoomSurfaceNormal;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\nvRoomSurface=(modelMatrix*vec4(transformed,1.0)).xyz;\nvRoomSurfaceNormal=normalize(mat3(modelMatrix)*objectNormal);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
   '#include <common>\nvarying vec3 vRoomSurface;\nvarying vec3 vRoomSurfaceNormal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>', `
   #include <aomap_fragment>
   vec3 roomP=vRoomSurface;
   vec3 roomN=abs(normalize(vRoomSurfaceNormal));
   float roomAO=1.0;
   ${architecture?`
   float roomCorner=max(roomN.z*exp(-abs(abs(roomP.x)-27.65)*1.35),roomN.x*exp(-abs(roomP.z+28.65)*1.35));
   float roomSkirting=exp(-abs(roomP.y+14.3)*2.4);
   float roomDado=exp(-abs(roomP.y+6.05)*6.0);
   roomAO-=0.16*roomCorner+0.10*roomSkirting+0.055*roomDado;
   // 挂画边框后方柔和的近距离遮蔽，不改变画作自身的颜色。
   float frameA=length(max(abs(roomP.xy-vec2(3.0,1.5))-vec2(2.75,3.4),0.0));
   float frameB=length(max(abs(roomP.xy-vec2(10.5,3.1))-vec2(2.5,2.7),0.0));
   roomAO-=roomN.z*0.14*(1.0-smoothstep(0.01,0.44,min(frameA,frameB)));
   `:`
   // 开放书架背板及层板根部，避免环境光将深处填成同样亮度。
   float shelfRegion=(1.0-smoothstep(3.25,3.55,abs(roomP.x+21.6)))*(1.0-smoothstep(6.0,6.3,abs(roomP.y+8.5)));
   float shelfDepth=exp(-abs(roomP.z+26.25)*1.2);
   roomAO-=0.17*shelfRegion*shelfDepth;
   roomAO-=0.075*exp(-abs(roomP.y+14.9)*2.0);
   `}
   roomAO=clamp(roomAO,0.72,1.0);
   reflectedLight.indirectDiffuse*=roomAO;
   reflectedLight.indirectSpecular*=mix(1.0,roomAO,0.5);
   #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect*=mix(1.0,roomAO,0.5);
   #endif
  `);
 };
 material.customProgramCacheKey=()=>architecture?'room-architecture-contact-v1':'room-furniture-contact-v1';
 return material;
}
export function createRoomScene(){
 const root=new T.Group();root.name='木桌背后的儿童房';
 const plaster=surfaceTexture('plaster'),woodTexture=surfaceTexture('wood'),woodRoughness=surfaceTexture('woodRough'),weave=surfaceTexture('weave');
 const matte=(color,roughness=.94)=>new T.MeshStandardMaterial({color,roughness,roughnessMap:plaster,bumpMap:plaster,bumpScale:.010});
 const painted=(color)=>new T.MeshPhysicalMaterial({color,roughness:.54,roughnessMap:plaster,bumpMap:plaster,bumpScale:.003,clearcoat:.16,clearcoatRoughness:.38});
 const m={
  wall:matte(0xf0e4ce),side:matte(0xd1ded6),panel:painted(0x9fb9ac),trim:painted(0xf6ebd7),
  floor:new T.MeshStandardMaterial({color:0xc6a784,roughness:.78,map:woodTexture,roughnessMap:woodRoughness,bumpMap:woodTexture,bumpScale:.015}),
  wood:new T.MeshPhysicalMaterial({color:0xc9a273,roughness:.55,map:woodTexture,roughnessMap:woodRoughness,bumpMap:woodTexture,bumpScale:.012,clearcoat:.20,clearcoatRoughness:.32}),
  woodDark:new T.MeshStandardMaterial({color:0x8f7053,roughness:.81,map:woodTexture,roughnessMap:woodRoughness,bumpMap:woodTexture,bumpScale:.012}),
  blue:painted(0x81a9b8),sage:painted(0x9bb999),rose:painted(0xd59583),gold:painted(0xd7b66b),
  purple:painted(0x9290b1),paper:matte(0xede6ce),ink:matte(0x526b70),
  cloth:new T.MeshStandardMaterial({color:0xb4c4d6,roughness:1,roughnessMap:weave,bumpMap:weave,bumpScale:.025}),
  linen:new T.MeshStandardMaterial({color:0xe8d9b9,roughness:1,roughnessMap:weave,bumpMap:weave,bumpScale:.010}),
  rug:new T.MeshStandardMaterial({color:0xccac96,roughness:1,roughnessMap:weave,bumpMap:weave,bumpScale:.045}),
  metal:new T.MeshStandardMaterial({color:0xb89c65,metalness:.66,roughness:.38}),
  sky:new T.MeshBasicMaterial({color:0xc3dfe5}),cloud:new T.MeshBasicMaterial({color:0xf7f4e4}),
  distant:new T.MeshBasicMaterial({color:0xa1beb2}),foliage:new T.MeshBasicMaterial({color:0x729b87}),
  sun:new T.MeshBasicMaterial({color:0xf3da9d}),
  shade:new T.MeshStandardMaterial({color:0xf1dfb2,roughness:.85,emissive:0xd4ad66,emissiveIntensity:.13,side:T.DoubleSide})
 };
 // 墙角和书架分别使用更轻的环境遮蔽，避免与真实灯光阴影叠成死黑。
 for(const key of ['wall','side','panel','trim'])localOcclusion(m[key],true);
 for(const key of ['floor','wood','woodDark','blue','sage','rose','gold','purple','cloth','linen','rug'])localOcclusion(m[key]);
 const cache=new Map();
 const geo=(key,build)=>{if(!cache.has(key))cache.set(key,build());return cache.get(key);};
 const mesh=(geometry,material,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1])=>{const o=new T.Mesh(geometry,material);o.position.set(...pos);o.rotation.set(...rot);o.scale.set(...scale);o.castShadow=true;o.receiveShadow=true;root.add(o);return o;};
 const box=(w,h,d,r,material,pos,rot=[0,0,0])=>mesh(geo(`b${w},${h},${d},${r}`,()=>roundedBox(w,h,d,r)),material,pos,rot);
 const plain=(w,h,d,material,pos)=>mesh(geo(`p${w},${h},${d}`,()=>new T.BoxGeometry(w,h,d)),material,pos);
 const ball=(radius,material,pos,scale=[1,1,1])=>mesh(geo(`s${radius}`,()=>new T.SphereGeometry(radius,32,24)),material,pos,[0,0,0],scale);
 const rod=(radius,height,material,pos,rot=[0,0,0],top=radius)=>mesh(geo(`c${radius},${height},${top}`,()=>new T.CylinderGeometry(top,radius,height,32)),material,pos,rot);
 const line=(a,b,radius,material)=>{const av=new T.Vector3(...a),bv=new T.Vector3(...b),d=bv.clone().sub(av),o=rod(radius,d.length(),material,av.add(bv).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;};
 // 墙角、墙板与踢脚线拥有体积；纵向地板缝把视线引向远处的房间。
 plain(56.6,33,.65,m.wall,[0,1.5,-29]);
 plain(.65,33,57,m.side,[-28,1.5,-.5]);plain(.65,33,57,m.wall,[28,1.5,-.5]);
 plain(56,.3,58,m.woodDark,[0,FLOOR_Y-.16,0]);
 for(let ix=0;ix<16;ix++)for(let iz=0;iz<7;iz++){
  const x=-26.25+ix*3.5,z=-24.85+iz*8.3;
  plain(3.475,.10,8.275,m.floor,[x,FLOOR_Y-.025,z]);
 }
 plain(55.5,9,.18,m.panel,[0,-10.4,-28.55]);
 plain(.18,9,56.4,m.panel,[-27.55,-10.4,-.2]);plain(.18,9,56.4,m.panel,[27.55,-10.4,-.2]);
 for(const y of [-14.5,-5.9]){
  box(55.5,y<-10?.7:.23,.26,.055,m.trim,[0,y,-28.36]);
  box(.26,y<-10?.7:.23,56.2,.055,m.trim,[-27.38,y,-.2]);box(.26,y<-10?.7:.23,56.2,.055,m.trim,[27.38,y,-.2]);
 }
 for(let x=-26;x<28;x+=3.5)box(.08,7.9,.09,.025,m.trim,[x,-10.1,-28.40]);
 for(let z=-26;z<28;z+=3.5){box(.09,7.9,.08,.025,m.trim,[-27.42,-10.1,z]);box(.09,7.9,.08,.025,m.trim,[27.42,-10.1,z]);}
 box(.38,31,.38,.07,m.trim,[-27.47,.5,-28.43]);box(.38,31,.38,.07,m.trim,[27.47,.5,-28.43]);
 box(55.8,.45,.5,.08,m.trim,[0,16.8,-28.38]);
 // 窗景采用清晰不透明的浅蓝背景与有层次的树景，不使用会糊化轨道的屏幕透射。
 const wx=-13.5,wy=1.6;
 plain(13.4,11.5,.10,m.woodDark,[wx,wy,-28.48]);
 const sky=plain(12.5,10.5,.08,m.sky,[wx,wy,-28.38]);sky.castShadow=false;
 const hill=(points,material,z)=>{const s=new T.Shape();s.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)s.lineTo(points[i][0],points[i][1]);s.closePath();const o=mesh(new T.ShapeGeometry(s),material,[0,0,z]);o.castShadow=false;return o;};
 hill([[-19.7,-3.6],[-19.7,-1.2],[-17.4,-.2],[-15.1,-.7],[-12.4,.35],[-9.9,-.35],[-7.3,-.8],[-7.3,-3.6]],m.distant,-28.29);
 hill([[-19.7,-3.6],[-19.7,-2.2],[-17.6,-1.8],[-14.7,-2.5],[-11.9,-1.7],[-9.4,-2.2],[-7.3,-1.5],[-7.3,-3.6]],m.foliage,-28.24);
 ball(.66,m.sun,[-9.2,5.0,-28.22],[1,1,.12]);
 for(const [x,y,sx] of [[-16.9,5.0,1.3],[-14.5,3.9,1.0],[-10.5,6.2,.65]]){
  box(sx*2.1,.38,.04,.10,m.cloud,[x,y,-28.23]);ball(.36,m.cloud,[x-.2,y+.17,-28.21],[1.25,.83,.09]);
 }
 for(const [x,y,size] of [[-18.2,-.9,1.0],[-11.2,-1.5,.8],[-8.2,-1.5,.65]]){
  plain(.10,2.7,.06,m.woodDark,[x,y-.45,-28.18]);
  for(let i=0;i<3;i++)ball(size,m.foliage,[x+(i-1)*size*.42,y+.5+(i%2)*size*.5,-28.12],[.75,1.0,.09]);
 }
 for(const x of [wx-6.5,wx+6.5])box(.48,11.8,.62,.065,m.trim,[x,wy,-28.03]);
 for(const y of [wy-5.65,wy+5.65])box(13.5,.48,.62,.065,m.trim,[wx,y,-28.03]);
 box(.22,10.8,.31,.04,m.trim,[wx,wy,-27.92]);box(12.65,.20,.31,.035,m.trim,[wx,wy+.5,-27.92]);
 box(14.1,.32,1.2,.08,m.wood,[wx,wy-5.9,-27.75]);
 // 两侧软布窗帘由起伏的实体布褶组成，窗户仍留出大面积室外视野。
 rod(.11,15.8,m.metal,[wx,wy+6.35,-27.63],[0,0,Math.PI/2]);
 // 每侧使用连续细分布面，五道布褶不会彼此重叠而形成自阴影斑点。
 for(const side of [-1,1]){
  const width=1.73,x=wx+side*6.74,g=new T.PlaneGeometry(width,11.8,80,40),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i),u=(p.getX(i)+width/2)/width;p.setZ(i,.15*Math.cos(u*Math.PI*10)+.10*Math.sin(y*.28));}
  g.computeVertexNormals();const curtain=mesh(g,m.linen,[x,wy+.1,-27.48]);curtain.material.side=T.DoubleSide;
 }
 // 左后开放书架：厚侧板、层板、背板、立放书与收纳盒有明确前后遮挡。
 const bx=-21.6,bz=-24.75,bottom=FLOOR_Y+.45,top=-2.5,bw=7.1,bd=3.25;
 // 背板放在柜体深处，前面敞开；书籍和收纳盒真实落在层板上。
 box(bw-.32,top-bottom-.2,.24,.055,m.woodDark,[bx,(top+bottom)/2,bz-bd/2+.12]);
 for(const x of [bx-bw/2+.18,bx+bw/2-.18])box(.36,top-bottom,bd+.22,.06,m.wood,[x,(top+bottom)/2,bz+.08]);
 for(const y of [bottom+.2,bottom+3.1,bottom+6.1,bottom+9.2,top-.18])box(bw,.32,bd+.38,.065,m.wood,[bx,y,bz+.18]);
 const colors=[m.blue,m.rose,m.sage,m.gold,m.purple,m.trim];
 for(let shelf=1;shelf<4;shelf++){
  const base=bottom+[0,3.28,6.28,9.38][shelf];
  for(let i=0;i<7;i++){
   const height=1.65+(i*7+shelf*3)%6*.17,x=bx-2.75+i*.67;
   box(.48,height,1.8,.045,colors[(i+shelf)%colors.length],[x,base+height/2,bz+.65],[0,0,i===6?-.16:0]);
   box(.32,.055,.025,.012,m.paper,[x,base+height*.78,bz+1.56]);box(.32,.035,.025,.008,m.paper,[x,base+.25,bz+1.56]);
  }
 }
 for(const side of [-1,1]){box(2.7,2.15,2.35,.12,side<0?m.linen:m.sage,[bx+side*1.65,bottom+1.4,bz+.30]);box(.6,.16,.08,.045,m.woodDark,[bx+side*1.65,bottom+1.65,bz+1.51]);}
 // 右后儿童矮柜的顶面和侧面处于不同深度，圆把手与圆脚补充尺度线索。
 const cx=18.6,cz=-24.8;
 for(const x of [cx-3.4,cx+3.4])for(const z of [cz-1.5,cz+1.5])rod(.24,1.1,m.wood,[x,FLOOR_Y+.55,z]);
 box(8.1,10.9,4.5,.24,m.blue,[cx,-8.45,cz]);box(8.5,.44,4.9,.13,m.wood,[cx,-2.85,cz]);
 for(let i=0;i<4;i++){
  const y=-4.25-i*2.4;box(7.5,2.12,.22,.11,i%2?m.blue:m.sage,[cx,y,cz+2.32]);
  for(const x of [cx-2.1,cx+2.1]){rod(.12,.22,m.metal,[x,y,cz+2.53],[Math.PI/2,0,0]);ball(.23,m.wood,[x,y,cz+2.67],[1,1,.6]);}
 }
 // 柜面木制拱形彩虹、圆盆绿植和叠书，轮廓足以在游戏背景中被辨认。
 for(let i=0;i<5;i++){
  const r=1.45-i*.23,g=new T.TorusGeometry(r,.13,12,48,Math.PI);
  mesh(g,colors[(i+1)%colors.length],[cx-1.5,-2.60,cz+.25]);
 }
 rod(.73,1.1,m.rose,[cx+2.6,-2.13,cz],undefined,.90);
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3,tip=[cx+2.6+Math.cos(a)*.65,-.3+(i%2)*.4,cz+Math.sin(a)*.45];
  line([cx+2.6,-1.65,cz],tip,.045,m.foliage);const leaf=ball(.43,m.sage,tip,[.42,1.2,.8]);leaf.rotation.z=Math.cos(a)*.6;
 }
 // 左侧低床伸到走道内，能看到床脚、床垫边缘、枕头及柔软靠垫。
 const bedX=-23.4,bedZ=-13.1;
 for(const x of [bedX-2.6,bedX+2.6])for(const z of [bedZ-5.1,bedZ+5.1])box(.5,2.7,.5,.09,m.wood,[x,-13.65,z]);
 box(6.3,.55,11.3,.16,m.wood,[bedX,-12.3,bedZ]);box(6.0,1.1,10.9,.35,m.linen,[bedX,-11.5,bedZ]);
 box(6.4,5.0,.52,.2,m.blue,[bedX,-11.4,bedZ-5.6]);box(5.95,.38,7.5,.17,m.cloth,[bedX,-10.79,bedZ+1.8]);
 box(4.7,.65,2.6,.28,m.trim,[bedX,-10.6,bedZ-3.7],[0,0,-.03]);box(1.7,.85,1.8,.32,m.rose,[bedX+1.6,-10.2,bedZ-2.3],[.1,.2,.18]);
 // 地毯的压边和桌下可见的条纹一起建立地面尺度，而非一张无厚度底图。
 box(30,.10,24,.045,m.rug,[1,FLOOR_Y+.07,0]);
 for(const z of [-11.6,11.6])box(29,.018,.3,.008,m.linen,[1,FLOOR_Y+.13,z]);
 for(const x of [-13.5,15.5])box(.3,.018,22.9,.008,m.linen,[x,FLOOR_Y+.13,0]);
 for(let x=-12.5;x<=14.5;x+=.55)for(const z of [-12.18,12.18])line([x,FLOOR_Y+.075,z-.23],[x+.06,FLOOR_Y+.075,z+.23],.024,m.linen);
 // 右后落地灯：内凹灯罩与窄支杆留出过道，不遮挡球体。
 const lx=25.0,lz=-18.5;
 rod(.95,.18,m.metal,[lx,FLOOR_Y+.1,lz]);rod(.075,12.8,m.metal,[lx,FLOOR_Y+6.55,lz]);
 mesh(new T.CylinderGeometry(1.2,2.0,2.8,48,1,true),m.shade,[lx,-1.3,lz]);
 for(const [y,r] of [[.1,1.2],[-2.7,2]])mesh(new T.TorusGeometry(r,.045,10,64),m.trim,[lx,y,lz],[Math.PI/2,0,0]);
 // 背墙图画有厚边框、纸张与实体图形，避免一整面空白墙。
 const picture=(x,y,w,h,art)=>{
  box(w,h,.24,.075,m.wood,[x,y,-28.20]);box(w-.42,h-.42,.075,.025,m.paper,[x,y,-28.04]);
  if(art===0){ball(.65,m.gold,[x+.75,y+.8,-27.94],[1,1,.08]);
   const s=new T.Shape();s.moveTo(-w*.4,-h*.35);s.lineTo(-w*.12,h*.17);s.lineTo(w*.10,-h*.12);s.lineTo(w*.27,h*.05);s.lineTo(w*.4,-h*.35);s.closePath();mesh(new T.ShapeGeometry(s),m.blue,[x,y,-27.94]);
  }else{for(let i=0;i<4;i++){const g=new T.TorusGeometry(1.40-i*.27,.10,10,40,Math.PI);mesh(g,colors[(i+1)%colors.length],[x,y-.65,-27.94]);}}
 };
 picture(3.0,1.5,5.5,6.8,0);picture(10.5,3.1,5.0,5.4,1);
 // 墙上的彩旗以弧线连接，三角布片略微折起；不会漂在游戏操作区。
 const flagCurve=new T.CatmullRomCurve3([new T.Vector3(-2.5,9.0,-28.05),new T.Vector3(9,7.6,-28.05),new T.Vector3(24,8.9,-28.05)]);
 mesh(new T.TubeGeometry(flagCurve,64,.035,8,false),m.linen);
 for(let i=0;i<10;i++){
  const p=flagCurve.getPoint((i+.5)/10),g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([-.72,0,0,.72,0,0,0,-1.55,.16],3));g.computeVertexNormals();const flag=mesh(g,colors[i%colors.length],p.toArray());flag.material.side=T.DoubleSide;
 }
 // 静态合并保留每个材质的一次绘制；不向房间里嵌入额外相机或后处理。
 mergeStatic(root);
 root.userData={floorY:FLOOR_Y,backWallZ:-29,sideWallX:28,windowCenter:[wx,wy,-28],bounds:{width:56,depth:58,height:33},description:'窗边儿童房：微纹理灰泥、棉麻布帘、木纹家具、柔和墙角与书架遮蔽、儿童床及地毯'};
 return root;
}
