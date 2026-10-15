import * as T from './vendor/three.module.js';

// 程序生成的四格窗光投影片：只改变入射光，不覆盖或模糊场景颜色。
function windowLightTexture(){
 const size=512,data=new Uint8Array(size*size*4);
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/(size-1),v=y/(size-1),edge=Math.min(u,1-u,v,1-v);
  const border=smooth(.075,.105,edge);
  const bars=smooth(.014,.024,Math.abs(u-.5))*smooth(.014,.024,Math.abs(v-.5));
  const light=255*border*bars,i=(y*size+x)*4;
  data[i]=data[i+1]=data[i+2]=Math.round(light);data[i+3]=255;
 }
 const texture=new T.DataTexture(data,size,size);texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

export function createRoomLighting(renderer){
 const group=new T.Group();group.name='窗边日光与室内反射';
 const sky=new T.HemisphereLight(0xc6dce9,0x76583c,.36);group.add(sky);
 // 日光承担主要明暗，较弱的天空补光只保留阴面细节。
 const sun=new T.DirectionalLight(0xffe3b5,3.2);sun.position.set(-20,18,-17);sun.target.position.set(0,-5,-2);sun.castShadow=true;
 const shadowSize=Math.min(4096,renderer.capabilities.maxTextureSize);sun.shadow.mapSize.set(shadowSize,shadowSize);
 Object.assign(sun.shadow.camera,{left:-29,right:29,top:29,bottom:-29,near:.5,far:105});
 sun.shadow.bias=-.00012;sun.shadow.normalBias=.018;group.add(sun,sun.target);
 const rim=new T.DirectionalLight(0xc8dfff,.65);rim.position.set(8,4,-8);group.add(rim);
 const fill=new T.DirectionalLight(0xdceaff,.52);fill.position.set(2,7,16);group.add(fill);
 const roomOnly=new T.Group();group.add(roomOnly);
 // 窗光带有实际阴影贴图，球、书架与玩具会挡住投射光。投影源在窗框内侧。
 const panes=windowLightTexture(),windowSun=new T.SpotLight(0xffdf9d,1700,100,.53,.16,2);
 windowSun.position.set(-13.5,5.6,-26.7);windowSun.target.position.set(7,-7,1);
 windowSun.map=panes;windowSun.castShadow=true;
 const paneShadowSize=Math.min(2048,renderer.capabilities.maxTextureSize);windowSun.shadow.mapSize.set(paneShadowSize,paneShadowSize);
 windowSun.shadow.camera.near=.5;windowSun.shadow.camera.far=100;windowSun.shadow.bias=-.00012;windowSun.shadow.normalBias=.018;
 roomOnly.add(windowSun,windowSun.target);
 // 近窗的偏冷漫反射与灯罩的暖光有距离衰减，墙面获得连续的明暗过渡。
 const windowBounce=new T.PointLight(0xc7e4ff,100,28,2);windowBounce.position.set(-13.5,2,-24.8);roomOnly.add(windowBounce);
 const lamp=new T.PointLight(0xffbf72,48,23,2);lamp.position.set(25,-1.4,-18.5);roomOnly.add(lamp);
 return {group,setRoomMode(enabled){
  roomOnly.visible=enabled;
  sky.color.set(enabled?0xc6dce9:0xf7f3e9);sky.groundColor.set(enabled?0x76583c:0x877159);sky.intensity=enabled?.36:.8;
  sun.color.set(enabled?0xffe3b5:0xffefd7);sun.intensity=enabled?3.2:2.7;
  sun.position.set(...(enabled?[-20,18,-17]:[-9,18,12]));sun.target.position.set(...(enabled?[0,-5,-2]:[0,0,0]));
  rim.intensity=enabled?.65:1.25;fill.intensity=enabled?.52:.55;
 },dispose(){panes.dispose();sun.dispose();windowSun.dispose();}};
}