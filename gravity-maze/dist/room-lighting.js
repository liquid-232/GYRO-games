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
 Object.assign(sun.shadow.camera,{left:-29,right:29,top:29,bottom:-29,near:.5,far:105});
 sun.shadow.bias=-.00012;sun.shadow.normalBias=.018;group.add(sun,sun.target);
 const rim=new T.DirectionalLight(0xc8dfff,.65);rim.position.set(8,4,-8);group.add(rim);
 const fill=new T.DirectionalLight(0xdceaff,.52);fill.position.set(2,7,16);group.add(fill);
 const roomOnly=new T.Group();group.add(roomOnly);
 // 窗光带有实际阴影贴图，球、书架与玩具会挡住投射光。投影源在窗框内侧。
 const panes=windowLightTexture(),windowSun=new T.SpotLight(0xffdf9d,1700,100,.53,.16,2);
 windowSun.position.set(-13.5,5.6,-26.7);windowSun.target.position.set(7,-7,1);
 // SpotLight.map 的投影矩阵依赖阴影路径，故保留 castShadow，只降低重绘频率。
 windowSun.map=panes;windowSun.castShadow=true;
 windowSun.shadow.camera.near=.5;windowSun.shadow.camera.far=100;windowSun.shadow.bias=-.00012;windowSun.shadow.normalBias=.018;
 roomOnly.add(windowSun,windowSun.target);
 // 近窗的偏冷漫反射与灯罩的暖光有距离衰减，墙面获得连续的明暗过渡。
 const windowBounce=new T.PointLight(0xc7e4ff,100,28,2);windowBounce.position.set(-13.5,2,-24.8);roomOnly.add(windowBounce);
 const lamp=new T.PointLight(0xffbf72,48,23,2);lamp.position.set(25,-1.4,-18.5);roomOnly.add(lamp);

 // 静态桌面与房间沿用已生成的阴影。运动时主光最多 30 Hz、窗光 15 Hz。
 const shadowStates=[sun,windowSun].map((light,index)=>{
  light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;
  return {light,interval:1000/(index?15:30),lastUpdate:-Infinity,dirty:true,pending:false,
   lightMatrix:new T.Matrix4(),targetMatrix:new T.Matrix4()};
 });
 function invalidate(){for(const state of shadowStates)state.dirty=true;}
 function setQuality(mode='auto'){
  const sizes=({auto:[2048,1024],balanced:[1024,512],ultra:[4096,2048]})[mode]||[2048,1024];
  shadowStates.forEach((state,index)=>{
   const shadow=state.light.shadow,size=Math.min(sizes[index],renderer.capabilities.maxTextureSize);
   if(shadow.mapSize.x===size&&shadow.mapSize.y===size)return;
   // Three 不会仅因 mapSize 改动而重建已有目标，必须释放两种阴影目标后再分配。
   shadow.map?.dispose();shadow.map=null;
   shadow.mapPass?.dispose();shadow.mapPass=null;
   shadow.mapSize.set(size,size);shadow.needsUpdate=true;state.dirty=true;
  });
 }
 function prepareFrame(now,moving,force=false){
  let scheduled=false;
  for(const state of shadowStates){
   const {light}=state;
   // 捕捉灯光或父组变换；模型变换由调用方的 moving / invalidate 明确告知。
   light.updateWorldMatrix(true,false);light.target.updateWorldMatrix(true,false);
   if(!state.lightMatrix.equals(light.matrixWorld)||!state.targetMatrix.equals(light.target.matrixWorld)){
    state.dirty=true;state.lightMatrix.copy(light.matrixWorld);state.targetMatrix.copy(light.target.matrixWorld);
   }
   if(moving)state.pending=true;
   if(light===windowSun&&!roomOnly.visible)continue;
   // 停止运动时补画最后姿态，避免阴影停在上一节流帧的位置。
   if(force||state.dirty||(state.pending&&(!moving||now-state.lastUpdate>=state.interval))){
    light.shadow.needsUpdate=true;state.lastUpdate=now;state.dirty=false;state.pending=false;scheduled=true;
   }
  }
  // 也兼容渲染器整体关闭 shadowMap.autoUpdate 的按需渲染模式。
  if(scheduled)renderer.shadowMap.needsUpdate=true;
  return scheduled;
 }
 setQuality('auto');
 return {group,prepareFrame,invalidate,setQuality,setRoomMode(enabled){
  const changed=roomOnly.visible!==enabled;roomOnly.visible=enabled;
  sky.color.set(enabled?0xc6dce9:0xf7f3e9);sky.groundColor.set(enabled?0x76583c:0x877159);sky.intensity=enabled?.36:.8;
  sun.color.set(enabled?0xffe3b5:0xffefd7);sun.intensity=enabled?3.2:2.7;
  sun.position.set(...(enabled?[-20,18,-17]:[-9,18,12]));sun.target.position.set(...(enabled?[0,-5,-2]:[0,0,0]));
  rim.intensity=enabled?.65:1.25;fill.intensity=enabled?.52:.55;
  if(changed)invalidate();
 },dispose(){panes.dispose();sun.dispose();windowSun.dispose();}};
}
