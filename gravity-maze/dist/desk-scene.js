import * as T from './vendor/three.module.js';
import { roundedBox } from './maze-materials.js';
import { mergeStatic } from './static-geometry.js';

// 木桌与玩具全部由本地几何和 DataTexture 构造，离线和 Node 环境都可创建。
// 球体独立旋转；这组背景保持世界坐标不动，桌面顶部为 -6.1。
const TABLE_Y=-6.1;
function grainTexture(){
 const width=2048,height=1024,data=new Uint8Array(width*height*4);
 const knots=[{x:.18,y:.23,r:.045},{x:.77,y:.67,r:.038},{x:.52,y:.90,r:.032}];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=x/width,v=y/height,plank=Math.floor(v*7),pv=(v*7)%1;
  let warp=7*Math.sin(u*8+plank*1.7)+2.4*Math.sin(u*31+plank),knotShade=0;
  for(const k of knots){const dx=(u-k.x)*.6,dy=v-k.y,d=Math.sqrt(dx*dx+dy*dy);if(d<k.r*2.5){const fall=Math.exp(-d*d/(k.r*k.r));warp+=25*fall*Math.atan2(dy,dx);knotShade+=(Math.sin(d*970)*5-15)*fall;}}
  const line=y*.43+warp,fine=Math.sin(line)*2.8+Math.sin(line*2.78+u*4)*1.3;
  const flow=Math.sin(y*.071+warp*.22)*7+Math.sin(y*.016+u*3)*4;
  const hash=((Math.imul(x+13,374761393)^Math.imul(y+41,668265263))>>>0)%101/100;
  const seam=Math.min(pv,1-pv)<.007?-23:Math.min(pv,1-pv)<.013?-8:0;
  const tint=Math.sin(plank*4.17)*5,n=fine+flow+knotShade+seam+tint+(hash-.5)*2.5;
  const i=(y*width+x)*4;data[i]=Math.max(0,Math.min(255,191+n));data[i+1]=Math.max(0,Math.min(255,143+n*.86));data[i+2]=Math.max(0,Math.min(255,94+n*.66));data[i+3]=255;
 }
 const tex=new T.DataTexture(data,width,height);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=16;tex.needsUpdate=true;return tex;
}
function letterTexture(){
 const chars=['01110100011000111111100011000110001','11110100011000111110100011000111110','01111100001000010000100001000001111','00100011000010000100001000010001110','01110100010000100010001000100011111','11110000010000101110000010000111110'];
 const tile=128,width=tile*chars.length,data=new Uint8Array(width*tile*4);
 for(let n=0;n<chars.length;n++)for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
  const gx=(x-24)/16,gy=(y-8)/16,col=Math.floor(gx),row=Math.floor(gy),i=(y*width+n*tile+x)*4;
  const on=col>=0&&col<5&&row>=0&&row<7&&chars[n][row*5+col]==='1';
  data[i]=255;data[i+1]=246;data[i+2]=218;data[i+3]=on?255:0;
 }
 const tex=new T.DataTexture(data,width,tile);tex.colorSpace=T.SRGBColorSpace;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=16;tex.needsUpdate=true;return tex;
}
function paperTexture(){
 const size=512,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4;let color=[248,242,225];
  const dx=x-392,dy=y-112,r=Math.hypot(dx,dy);
  if(r<38||(r>45&&r<64&&Math.abs(Math.sin(Math.atan2(dy,dx)*10))<.16))color=[226,170,61];
  if(Math.abs(y-(372+Math.sin(x*.018)*8))<4)color=[90,149,100];
  if(x>125&&x<300&&y>230&&y<370&&(Math.min(x-125,300-x,y-230,370-y)<5))color=[79,130,158];
  if(y>145&&y<235&&Math.abs(Math.abs(x-212)-(y-145))<4)color=[199,94,76];
  if(x>195&&x<232&&y>298&&y<370&&(Math.min(x-195,232-x,y-298,370-y)<4))color=[156,115,77];
  if(x>148&&x<181&&y>260&&y<294&&(Math.min(x-148,181-x,y-260,294-y)<3))color=[79,130,158];
  const noise=Math.sin(x*17+y*23)*1.5;data[i]=color[0]+noise;data[i+1]=color[1]+noise;data[i+2]=color[2]+noise;data[i+3]=255;
 }
 const tex=new T.DataTexture(data,size,size);tex.colorSpace=T.SRGBColorSpace;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=16;tex.needsUpdate=true;return tex;
}
function paint(color){return new T.MeshPhysicalMaterial({color,roughness:.33,metalness:.01,clearcoat:.42,clearcoatRoughness:.25});}
export function createDeskScene(){
 const root=new T.Group();root.name='儿童木桌与散放玩具';
 const grain=grainTexture(),m={
  wood:new T.MeshPhysicalMaterial({color:0xffffff,map:grain,bumpMap:grain,bumpScale:.018,roughness:.47,clearcoat:.18,clearcoatRoughness:.43}),
  natural:paint(0xcfaa75),red:paint(0xc96552),yellow:paint(0xe7b951),blue:paint(0x6898ab),mint:paint(0x8ba78d),violet:paint(0x77779b),cream:paint(0xeee1bc),
  rubber:new T.MeshStandardMaterial({color:0x333e40,roughness:.86}),
  metal:new T.MeshStandardMaterial({color:0xb9bdba,metalness:.82,roughness:.27}),
  window:new T.MeshPhysicalMaterial({color:0x315260,metalness:.15,roughness:.18,clearcoat:1}),
  print:new T.MeshStandardMaterial({map:letterTexture(),transparent:true,alphaTest:.3,roughness:.6,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),
  paper:new T.MeshStandardMaterial({map:paperTexture(),roughness:.96,color:0xffffff,side:T.DoubleSide})
 };
 const add=(geometry,material,position=[0,0,0],rotation=[0,0,0],parent=root)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 const box=(w,h,d,r,material,pos,rot=[0,0,0],parent=root)=>add(roundedBox(w,h,d,r),material,pos,rot,parent);
 const cylinder=(radius,height,material,pos,rot=[0,0,0],parent=root,top=radius)=>add(new T.CylinderGeometry(top,radius,height,48,1),material,pos,rot,parent);
 // 台面 UV 以实际平面投射，2048 像素纹理保留木板接缝和细小木纹。
 const tabletop=roundedBox(40,.9,32,.3),p=tabletop.attributes.position,uv=tabletop.attributes.uv;
 for(let i=0;i<p.count;i++)uv.setXY(i,(p.getX(i)+20)/40,(p.getZ(i)+16)/32);
 const table=add(tabletop,m.wood,[0,TABLE_Y-.45,0]);table.castShadow=false;
 box(34,1,1.0,.12,m.natural,[0,TABLE_Y-1.2,-13.5]);
 for(const x of [-16,16])for(const z of [-12,12])box(1.35,8.3,1.35,.14,m.natural,[x,TABLE_Y-4.7,z]);
 // 实体玩具座：底盘贴桌，圆环在球体下部形成清晰接触关系。
 cylinder(1.5,.13,m.violet,[0,TABLE_Y+.065,0]);
 add(new T.TorusGeometry(1.14,.105,20,128),m.violet,[0,-5.53,0],[Math.PI/2,0,0]);
 for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;cylinder(.09,.42,m.violet,[Math.cos(a)*1.14,-5.80,Math.sin(a)*1.14]);}
 add(new T.TorusGeometry(1.37,.035,12,112),m.cream,[0,TABLE_Y+.142,0],[Math.PI/2,0,0]);
 // 印刷字母贴片共用一张纹理图集，不引入字体或浏览器 Canvas 依赖。
 const glyph=(index,size,pos,rotation,parent)=>{const g=new T.PlaneGeometry(size,size),a=g.attributes.uv;for(let i=0;i<a.count;i++){a.setX(i,(a.getX(i)+index)/6);a.setY(i,1-a.getY(i));}return add(g,m.print,pos,rotation,parent);};
 const block=(x,z,color,index,angle=0,y=TABLE_Y+.68)=>{const group=new T.Group();group.position.set(x,y,z);group.rotation.y=angle;root.add(group);box(1.34,1.34,1.34,.095,color,[0,0,0],[0,0,0],group);glyph(index,.96,[0,.675,0],[-Math.PI/2,0,0],group);glyph(index,.96,[0,0,.681],[0,0,0],group);return group;};
 block(-9.0,1.9,m.red,0,-.22);block(-10.7,2.2,m.blue,1,.19);block(-10.3,.5,m.yellow,2,-.12);block(-10.7,2.2,m.mint,3,-.13,TABLE_Y+2.02);block(8.4,-7.1,m.yellow,4,.3);
 // 木制小汽车：圆角喷漆车身、深色车窗、橡胶轮胎和金属轮轴。
 const car=new T.Group();car.position.set(9.1,TABLE_Y,-.6);car.rotation.y=-.38;root.add(car);
 box(2.95,.65,1.38,.16,m.red,[0,.67,0],[0,0,0],car);box(1.45,.62,1.23,.16,m.red,[-.2,1.26,0],[0,0,0],car);
 box(1.03,.39,1.25,.08,m.window,[-.2,1.31,0],[0,0,0],car);
 box(.08,.45,1.27,.025,m.red,[-.2,1.31,0],[0,0,0],car);
 for(const x of [-.92,.92])for(const z of [-.73,.73]){cylinder(.44,.26,m.rubber,[x,.44,z],[Math.PI/2,0,0],car);cylinder(.24,.275,m.cream,[x,.44,z],[Math.PI/2,0,0],car);cylinder(.095,.285,m.metal,[x,.44,z],[Math.PI/2,0,0],car);}
 for(const z of [-.43,.43])box(.035,.18,.25,.018,m.cream,[1.485,.73,z],[0,0,0],car);
 // 叠圈玩具占据后左角；每个圆环都有足够细分并共享颜色材质。
 const ringX=-8.3,ringZ=-7.8;cylinder(1.48,.30,m.natural,[ringX,TABLE_Y+.15,ringZ]);cylinder(.20,2.95,m.natural,[ringX,TABLE_Y+1.78,ringZ],undefined,root,.12);
 for(let i=0;i<5;i++)add(new T.TorusGeometry(1.05-i*.145,.22,24,80),[m.blue,m.mint,m.yellow,m.red,m.violet][i],[ringX,TABLE_Y+.48+i*.43,ringZ],[Math.PI/2,0,0]);
 add(new T.SphereGeometry(.28,32,24),m.natural,[ringX,TABLE_Y+3.28,ringZ]);
 // 几支交错的蜡笔放在近处右侧，笔套、木质削面与彩色笔芯分开建模。
 const crayon=(x,z,color,angle,length=2.6)=>{const group=new T.Group();group.position.set(x,TABLE_Y+.16,z);group.rotation.y=angle;root.add(group);cylinder(.145,length,color,[0,0,0],[0,0,Math.PI/2],group);cylinder(.151,length*.63,m.cream,[-.13,0,0],[0,0,Math.PI/2],group);cylinder(.147,.06,color,[-length*.35,0,0],[0,0,Math.PI/2],group);cylinder(.147,.06,color,[length*.24,0,0],[0,0,Math.PI/2],group);add(new T.ConeGeometry(.145,.36,32),color,[length/2+.18,0,0],[0,0,-Math.PI/2],group);};
 crayon(8.3,6.2,m.yellow,.4,2.7);crayon(8.5,6.9,m.blue,-.35,2.9);crayon(9.9,5.3,m.red,.8,2.3);crayon(-8.7,6.4,m.mint,.55,2.6);
 // 纸上是儿童蜡笔画，放在远侧，不穿入球体中心留白。
 const sheet=new T.Group();sheet.position.set(2.8,TABLE_Y+.024,-9.2);sheet.rotation.y=.10;root.add(sheet);
 add(new T.BoxGeometry(6.0,.025,4.4),m.cream,[0,0,0],[0,0,0],sheet);
 add(new T.PlaneGeometry(5.86,4.25),m.paper,[0,.024,0],[-Math.PI/2,0,0],sheet);
 crayon(5.4,-8.1,m.red,-.7,2.1);
 // 小木陀螺补充桌面近侧细节，圆锥和球帽都有平滑法线。
 const top=new T.Group();top.position.set(-7.0,TABLE_Y,6.8);top.rotation.y=.3;root.add(top);
 cylinder(.78,.42,m.yellow,[0,.39,0],undefined,top,.27);add(new T.ConeGeometry(.78,.4,64),m.blue,[0,.77,0],[0,0,0],top);cylinder(.095,.61,m.red,[0,1.00,0],undefined,top);add(new T.SphereGeometry(.11,24,16),m.red,[0,1.30,0],[0,0,0],top);
 // 将玩具层级变换烘入几何后按材质批处理，使桌面环境仅约 13 个绘制批次。
 root.updateMatrixWorld(true);const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);});
 for(const mesh of meshes){mesh.updateWorldMatrix(true,false);const matrix=mesh.matrixWorld.clone();mesh.removeFromParent();mesh.matrixAutoUpdate=false;mesh.matrix.copy(matrix);root.add(mesh);}
 for(const child of [...root.children])if(!child.isMesh)root.remove(child);
 mergeStatic(root);root.userData={tableTopY:TABLE_Y,clearCenterRadius:6.3,woodTextureResolution:[2048,1024],disposeMaps:['map','bumpMap'],description:'暖色木桌、字母积木、木制小车、蜡笔、叠圈、画纸与陀螺'};
 return root;
}

