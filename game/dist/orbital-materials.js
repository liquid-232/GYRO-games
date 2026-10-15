import * as T from './vendor/three.module.js';

// Generated once, kept offline, and shared by gates, satellites and station modules.
let cachedMaterials;
const SIZE=512;
function canvas(){const c=document.createElement('canvas');c.width=c.height=SIZE;return c;}
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function texture(c,color=false){
 const t=new T.CanvasTexture(c);t.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
 t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;return t;
}
function finishMaps(color,roughness,height){return{map:texture(color,true),roughnessMap:texture(roughness),bumpMap:texture(height)};}
function metalMaps(){
 const color=canvas(),roughness=canvas(),height=canvas();
 const a=color.getContext('2d'),r=roughness.getContext('2d'),h=height.getContext('2d'),rand=random(68132);
 a.fillStyle='#bfc3c6';a.fillRect(0,0,SIZE,SIZE);
 r.fillStyle='#b9b9b9';r.fillRect(0,0,SIZE,SIZE);
 h.fillStyle='#808080';h.fillRect(0,0,SIZE,SIZE);
 // Sparse structural panels, without painted-on weathering or oversized scratches.
 const panels=[[0,0,256,170],[256,0,256,170],[0,170,172,171],[172,170,340,171],[0,341,340,171],[340,341,172,171]];
 for(const [x,y,w,hh] of panels){
  const tone=182+Math.floor(rand()*19);
  a.fillStyle=`rgb(${tone},${tone+3},${tone+5})`;a.fillRect(x+2,y+2,w-4,hh-4);
  const gradient=a.createLinearGradient(x,y,x+w,y+hh);gradient.addColorStop(0,'rgba(255,255,255,.045)');gradient.addColorStop(1,'rgba(0,0,0,.035)');a.fillStyle=gradient;a.fillRect(x+2,y+2,w-4,hh-4);
  r.fillStyle=`rgb(${169+Math.floor(rand()*28)},${169+Math.floor(rand()*28)},${169+Math.floor(rand()*28)})`;r.fillRect(x+2,y+2,w-4,hh-4);
  a.strokeStyle='rgba(40,49,58,.38)';a.lineWidth=1.5;a.strokeRect(x+.75,y+.75,w-1.5,hh-1.5);
  a.strokeStyle='rgba(255,255,255,.22)';a.lineWidth=.6;a.strokeRect(x+2.5,y+2.5,w-5,hh-5);
  h.strokeStyle='#5d5d5d';h.lineWidth=2;h.strokeRect(x+1,y+1,w-2,hh-2);
  h.strokeStyle='#969696';h.lineWidth=1;h.strokeRect(x+3,y+3,w-6,hh-6);
  for(const [dx,dy] of [[9,9],[w-9,9],[9,hh-9],[w-9,hh-9]]){
   a.fillStyle='#737b82';a.beginPath();a.arc(x+dx,y+dy,1.7,0,Math.PI*2);a.fill();
   a.strokeStyle='rgba(255,255,255,.5)';a.lineWidth=.6;a.beginPath();a.arc(x+dx-.15,y+dy-.15,1.8,Math.PI,Math.PI*1.8);a.stroke();
   h.fillStyle='#626262';h.beginPath();h.arc(x+dx,y+dy,1.5,0,Math.PI*2);h.fill();
  }
 }
 // Subpixel brushed grain largely disappears into the mip chain at flight distance.
 for(let i=0;i<1100;i++){
  const x=rand()*SIZE,y=rand()*SIZE,length=3+rand()*29,light=rand()>.5;
  a.strokeStyle=light?'rgba(255,255,255,.035)':'rgba(31,41,49,.026)';a.lineWidth=.5;
  a.beginPath();a.moveTo(x,y);a.lineTo(x+length,y);a.stroke();
  r.strokeStyle=light?'rgba(255,255,255,.065)':'rgba(0,0,0,.04)';r.lineWidth=.65;r.beginPath();r.moveTo(x,y);r.lineTo(x+length,y);r.stroke();
 }
 return finishMaps(color,roughness,height);
}
function solarMaps(){
 const color=canvas(),roughness=canvas(),height=canvas();
 const a=color.getContext('2d'),r=roughness.getContext('2d'),h=height.getContext('2d'),rand=random(43015);
 a.fillStyle='#303c46';a.fillRect(0,0,SIZE,SIZE);r.fillStyle='#bbbbbb';r.fillRect(0,0,SIZE,SIZE);h.fillStyle='#5f5f5f';h.fillRect(0,0,SIZE,SIZE);
 for(let row=0;row<8;row++)for(let col=0;col<4;col++){
  const x=col*128+4,y=row*64+4,w=120,hh=56;
  const g=a.createLinearGradient(x,y,x+w,y+hh),blue=25+Math.floor(rand()*12);
  g.addColorStop(0,`rgb(9,18,${blue+17})`);g.addColorStop(.55,`rgb(13,26,${blue+29})`);g.addColorStop(1,`rgb(10,20,${blue+13})`);a.fillStyle=g;
  // Chamfered photovoltaic cells and fine silver bus bars.
  a.beginPath();a.moveTo(x+5,y);a.lineTo(x+w-5,y);a.lineTo(x+w,y+5);a.lineTo(x+w,y+hh-5);a.lineTo(x+w-5,y+hh);a.lineTo(x+5,y+hh);a.lineTo(x,y+hh-5);a.lineTo(x,y+5);a.closePath();a.fill();
  r.fillStyle='#777777';r.fillRect(x,y,w,hh);h.fillStyle='#828282';h.fillRect(x,y,w,hh);
  a.strokeStyle='rgba(113,156,180,.28)';a.lineWidth=.65;
  for(let sy=7;sy<hh;sy+=6){a.beginPath();a.moveTo(x+3,y+sy);a.lineTo(x+w-3,y+sy);a.stroke();}
  a.strokeStyle='rgba(164,181,190,.58)';a.lineWidth=1;
  for(const dx of [39,81]){a.beginPath();a.moveTo(x+dx,y+2);a.lineTo(x+dx,y+hh-2);a.stroke();}
 }
 return finishMaps(color,roughness,height);
}
function foilMaps(){
 const color=canvas(),roughness=canvas(),height=canvas();
 const a=color.getContext('2d'),r=roughness.getContext('2d'),h=height.getContext('2d'),rand=random(7029);
 a.fillStyle='#d6c8a4';a.fillRect(0,0,SIZE,SIZE);r.fillStyle='#9c9c9c';r.fillRect(0,0,SIZE,SIZE);h.fillStyle='#808080';h.fillRect(0,0,SIZE,SIZE);
 // Jittered triangles form quiet crinkles in multilayer insulation, not a noise overlay.
 const grid=8,step=SIZE/grid,points=[];
 for(let y=0;y<=grid;y++){points[y]=[];for(let x=0;x<=grid;x++)points[y][x]=[x*step+(x>0&&x<grid?(rand()-.5)*34:0),y*step+(y>0&&y<grid?(rand()-.5)*34:0)];}
 const facet=(p,q,s)=>{
  const shade=166+Math.floor(rand()*61),raise=107+Math.floor(rand()*42),rough=142+Math.floor(rand()*35);
  for(const [ctx,fill] of [[a,`rgb(${shade},${shade-7},${shade-23})`],[h,`rgb(${raise},${raise},${raise})`],[r,`rgb(${rough},${rough},${rough})`]]){
   ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.lineTo(...s);ctx.closePath();ctx.fill();
  }
  a.strokeStyle='rgba(255,244,214,.09)';a.lineWidth=.8;a.beginPath();a.moveTo(...p);a.lineTo(...q);a.lineTo(...s);a.stroke();
 };
 for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
  const p=points[y][x],q=points[y][x+1],s=points[y+1][x],t=points[y+1][x+1];facet(p,q,t);facet(p,t,s);
 }
 // Broad folded seams suggest blanket sheets rather than bare gold plating.
 for(const ctx of [a,h]){ctx.strokeStyle=ctx===a?'rgba(53,45,29,.28)':'#5e5e5e';ctx.lineWidth=3;ctx.strokeRect(2,2,SIZE-4,SIZE-4);}
 return finishMaps(color,roughness,height);
}
export function createOrbitalMaterials(){
 if(cachedMaterials)return cachedMaterials;
 const metal=metalMaps(),cells=solarMaps(),blanket=foilMaps();
 const hull=new T.MeshStandardMaterial({name:'Orbital brushed aluminium panels',...metal,color:0xd8dde0,metalness:.62,roughness:.58,bumpScale:.035});
 const dark=new T.MeshStandardMaterial({name:'Orbital graphite structural alloy',...metal,color:0x464d56,metalness:.58,roughness:.65,bumpScale:.022});
 const edge=new T.MeshStandardMaterial({name:'Orbital machined frame edges',...metal,color:0xf1ede4,metalness:.72,roughness:.46,bumpScale:.018});
 const solar=new T.MeshPhysicalMaterial({name:'Orbital photovoltaic cells',...cells,color:0xffffff,metalness:.28,roughness:.48,bumpScale:.012,clearcoat:.35,clearcoatRoughness:.2});
 const foil=new T.MeshStandardMaterial({name:'Orbital gold thermal blanket',...blanket,color:0xc69b46,metalness:.82,roughness:.62,bumpScale:.07});
 cachedMaterials={hull,dark,edge,solar,foil};return cachedMaterials;
}
