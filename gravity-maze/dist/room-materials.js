import * as T from './vendor/three.module.js';

// 局部离线生成：一套贴图供整间房复用，纹理只在建场景时计算。
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
function hash(x,y){let n=Math.imul(x,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function field(u,v,cells){
 const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
 const h=(a,b)=>hash(((a%cells)+cells)%cells,((b%cells)+cells)%cells);
 return mix(mix(h(ix,iy),h(ix+1,iy),fx),mix(h(ix,iy+1),h(ix+1,iy+1),fx),fy);
}
function texture(data,w,h,color=false,repeat=true){
 const t=new T.DataTexture(data,w,h);t.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
 t.wrapS=t.wrapT=repeat?T.RepeatWrapping:T.ClampToEdgeWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;return t;
}
function pixel(data,i,r,g=r,b=r){data[i]=clamp(r,0,255);data[i+1]=clamp(g,0,255);data[i+2]=clamp(b,0,255);data[i+3]=255;}

export function createRoomSurfaceMaps(){
 const size=512,color=new Uint8Array(size*size*4),height=new Uint8Array(size*size*4),roughness=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,macro=field(u,v,4),warp=field(u,v,8)-.5;
  const trowel=field(u+warp*.07,v+warp*.04,18),grain=field(u,v,128),fine=hash(x,y);
  // 大片批刮痕、砂粒、少量小气孔共同形成灰泥，避免规则正弦纹与满屏白噪点。
  const pore=Math.max(0,.14-fine)/.14,base=248+(macro-.5)*9+(trowel-.5)*8+(grain-.5)*3-pore*4;
  const i=(y*size+x)*4;pixel(color,i,base,base-1.0,base-2.0);
  pixel(height,i,132+(trowel-.5)*62+(grain-.5)*38+(fine-.5)*12-pore*20);
  pixel(roughness,i,235+(macro-.5)*16+(trowel-.5)*12-pore*5);
 }
 return {color:texture(color,size,size,true),height:texture(height,size,size),roughness:texture(roughness,size,size)};
}

export function createOutdoorMaps(){
 const w=1024,h=512,sky=new Uint8Array(w*h*4),n=256,leaf=new Uint8Array(n*n*4),bark=new Uint8Array(n*n*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x/w,v=y/h,horizon=Math.pow(1-v,1.7),warp=(field(u,v,7)-.5)*.08;
  const cloud=field(u+warp,v*.65,8)*.55+field(u,v*.65,24)*.30+field(u,v*.65,64)*.15;
  const wisps=clamp((cloud-.49)*5.6)*(.45+.45*Math.sin(v*Math.PI));
  const warm=clamp(1-Math.hypot((u-.65)*1.8,(v-.67)*1.4));
  const i=(y*w+x)*4;
  pixel(sky,i,mix(130+88*horizon+warm*7,246,wisps),mix(179+49*horizon,246,wisps),mix(208+24*horizon,238,wisps));
 }
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=x/n,v=y/n,i=(y*n+x)*4,clumps=field(u,v,15),fine=hash(x,y),groove=field(u*.25,v,32);
  pixel(leaf,i,171+clumps*70+(fine-.5)*14);
  pixel(bark,i,130+(groove-.5)*110+(field(u,v,64)-.5)*30);
 }
 return {sky:texture(sky,w,h,true,false),leaf:texture(leaf,n,n),bark:texture(bark,n,n)};
}

// 建筑 UV 以世界单位铺开；宽墙、窗间小块墙和侧墙都保持相同灰泥颗粒尺寸。
export function projectWallUV(mesh,tileSize=8){
 const g=mesh.geometry.clone(),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i)+mesh.position.x,y=p.getY(i)+mesh.position.y,z=p.getZ(i)+mesh.position.z;
  if(Math.abs(n.getY(i))>.5)uv.setXY(i,x/tileSize,z/tileSize);
  else if(Math.abs(n.getX(i))>.5)uv.setXY(i,z/tileSize,y/tileSize);
  else uv.setXY(i,x/tileSize,y/tileSize);
 }
 mesh.geometry=g;return mesh;
}