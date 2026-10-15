import * as T from './vendor/three.module.js';
// 程序化微纹理，离线可用；同一场景共享，切关时随材质释放。
export function makeMaterials(){
 const size=128,data=new Uint8Array(size*size*4);let seed=7123;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=120+(seed>>>27)+Math.sin(y*1.8)*7;const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=n;data[i+3]=255;}
 const grain=new T.DataTexture(data,size,size);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(3,3);grain.needsUpdate=true;grain.magFilter=T.LinearFilter;grain.minFilter=T.LinearMipmapLinearFilter;grain.generateMipmaps=true;
 return {floor:new T.MeshPhysicalMaterial({color:0x325d61,metalness:.4,roughness:.36,bumpMap:grain,bumpScale:.018,clearcoat:.4,clearcoatRoughness:.3}),
 wall:new T.MeshPhysicalMaterial({color:0xa9c2b0,metalness:.27,roughness:.28,bumpMap:grain,bumpScale:.008,clearcoat:.7,clearcoatRoughness:.2}),
 base:new T.MeshPhysicalMaterial({color:0x153239,metalness:.7,roughness:.3,bumpMap:grain,bumpScale:.012,clearcoat:.3}),
 brass:new T.MeshStandardMaterial({color:0xdab577,metalness:.82,roughness:.27}),
 ball:new T.MeshPhysicalMaterial({color:0xe3edeb,metalness:.96,roughness:.13,clearcoat:1,clearcoatRoughness:.07}),
 star:new T.MeshStandardMaterial({color:0xffcd73,metalness:.85,roughness:.2,emissive:0xa35d18,emissiveIntensity:.15})};
}
export function roundedBox(w,h,d,r=.07){
 const s=new T.Shape(),x=-w/2,y=-d/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
 const g=new T.ExtrudeGeometry(s,{depth:h-2*r,bevelEnabled:true,bevelSize:r*.48,bevelThickness:r,bevelSegments:3,curveSegments:4,steps:1});g.rotateX(-Math.PI/2);g.translate(0,-h/2+r,0);return g;
}
export function starGeometry(){const s=new T.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.115:.25,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)s.moveTo(x,y);else s.lineTo(x,y);}s.closePath();return new T.ExtrudeGeometry(s,{depth:.07,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:2,steps:1});}
