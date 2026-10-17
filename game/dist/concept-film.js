import * as T from './vendor/three.module.js';
import { parseAircraft } from './aircraft-model.js';
import { createEnemyAircraft } from './enemy-model.js';
import { createIslandMap, createSeaStack } from './island-map.js';
import { createPlayerMissile, createEnemyMissile, animateEnemyMissile } from './missile-model.js';
import { createMoraCoin } from './coin-model.js';

// 独立的分镜动画：所有对象由绝对播放时间求值，暂停、倒退与导出使用同一帧逻辑。
// 此页面展示画面及玩法意图，不接收真实控制器输入，也不运行游戏胜负逻辑。
const $ = id => document.getElementById(id), clamp = T.MathUtils.clamp, lerp = T.MathUtils.lerp;
const duration = 60, params = new URLSearchParams(location.search), capture = params.has('render');
if (capture) document.body.classList.add('capture');
const chapters = [
  {start:0,end:9,en:'FIRST LIGHT',title:'破晓 · 出击',short:'破晓出击',description:'冷蓝海天与暖橙尾焰，建立飞机的金属质感。'},
  {start:9,end:19,en:'THREAD THE NEEDLE',title:'低空 · 穿越',short:'低空穿越',description:'沿补给航线穿过礁柱间隙，倾斜机翼避开障碍。'},
  {start:19,end:29,en:'TURN DEFENCE INTO ATTACK',title:'急转 · 反击',short:'急转避弹',description:'横滚急转避开来袭导弹，在短暂窗口内格挡反击。'},
  {start:29,end:40,en:'LOCK. CHASE. STRIKE.',title:'锁定 · 追击',short:'锁定追击',description:'机炮压制目标，追踪导弹完成击杀，提升飞行风格评分。'},
  {start:40,end:52,en:'FIND THE OPENING',title:'突破 · 核心',short:'弱点突破',description:'绕至空中航母后方，锁定装甲之间暴露的核心。'},
  {start:52,end:60,en:'A BEAUTIFUL SORTIE',title:'任务 · 完成',short:'任务完成',description:'以清晰的战果反馈收束一场短促、连贯的空战。'}
];
let time = 0, playing = !capture && !matchMedia('(prefers-reduced-motion: reduce)').matches, rate = 1, looping = false, last = 0, frame = 0, disposed = false;
const nav = $('chapters');
chapters.forEach((chapter,i) => { const button=document.createElement('button');button.innerHTML=`<span>0${i+1}</span>${chapter.short}`;button.onclick=()=>seek(chapter.start);button.setAttribute('aria-label',`跳至${chapter.title}`);nav.append(button); });
const canvas=$('film');
let renderer, islandMap, environment;
try {
  renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:capture});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new T.Scene();scene.fog=new T.FogExp2(0x7c9da5,.0041);
  const camera=new T.PerspectiveCamera(49,innerWidth/innerHeight,.1,650);
  scene.add(new T.HemisphereLight(0xd9edfa,0x374b4f,1.8));
  const sun=new T.DirectionalLight(0xffe2b9,2.8);sun.position.set(-32,38,-45);scene.add(sun);
  const rim=new T.DirectionalLight(0xaddbff,1.3);rim.position.set(12,8,15);scene.add(rim);
  const envScene=new T.Scene();envScene.background=new T.Color(0x435e72);
  for(const [x,y,z,color] of [[-8,9,0,0xe9f7ff],[8,5,2,0xffd4a0],[0,3,-10,0x6ca5ce]]){
    const p=new T.Mesh(new T.PlaneGeometry(8,18),new T.MeshBasicMaterial({color,side:T.DoubleSide}));p.position.set(x,y,z);p.lookAt(0,0,0);envScene.add(p);
  }
  const pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(envScene,.02);scene.environment=environment.texture;pmrem.dispose();
  envScene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  islandMap=createIslandMap(scene);islandMap.setQuality({reflectionHz:0,reflectionSize:256,waterDetail:1});
  // 云层用本地绘制的透明纹理生成，无外部网络素材。
  const cloudCanvas=document.createElement('canvas');cloudCanvas.width=512;cloudCanvas.height=128;const cc=cloudCanvas.getContext('2d');
  for(let i=0;i<18;i++){const x=36+i*25,y=63+Math.sin(i*2.3)*13,r=22+Math.sin(i*.9)*8,g=cc.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(230,241,239,.38)');g.addColorStop(1,'rgba(230,241,239,0)');cc.fillStyle=g;cc.fillRect(x-r,y-r,r*2,r*2);}
  const cloudTexture=new T.CanvasTexture(cloudCanvas);cloudTexture.colorSpace=T.SRGBColorSpace;
  for(let i=0;i<13;i++){const cloud=new T.Sprite(new T.SpriteMaterial({map:cloudTexture,transparent:true,opacity:.25,depthWrite:false,fog:true}));cloud.position.set((i%2?1:-1)*(45+i*12),40+(i%3)*9,-60-i*25);cloud.scale.set(115,28,1);scene.add(cloud);}
  const response=await fetch('./assets/airplane-f22.glb');if(!response.ok)throw Error(`飞机模型加载失败 (${response.status})`);
  const model=parseAircraft(await response.arrayBuffer()),bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  model.position.copy(center).negate();const normalized=new T.Group();normalized.scale.setScalar(8/size.z);normalized.add(model);
  const plane=new T.Group();plane.name='动画主机 / F-22';plane.add(normalized);scene.add(plane);
  const extent=size.multiplyScalar(8/size.z),rear=extent.z*.43;
  function glowMaterial(color,opacity=1){return new T.MeshBasicMaterial({color,transparent:true,opacity,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,toneMapped:false});}
  const flames=[];
  for(const side of [-1,1]){
    const flame=new T.Group();flame.position.set(side*extent.x*.12,-.12,rear);
    for(const [radius,length,color,opacity] of [[.23,2.7,0xf58e45,.45],[.12,1.4,0xffbf75,.75],[.07,.7,0xe9f7ff,.85]]){
      const mesh=new T.Mesh(new T.ConeGeometry(radius,length,14,1,true).rotateX(Math.PI/2).translate(0,0,length/2),glowMaterial(color,opacity));flame.add(mesh);
    }
    plane.add(flame);flames.push(flame);
  }
  const enemy=createEnemyAircraft();enemy.rotation.y=Math.PI;enemy.scale.setScalar(1.2);scene.add(enemy);
  const wingmen=[createEnemyAircraft(),createEnemyAircraft()];wingmen.forEach((w,i)=>{w.rotation.y=Math.PI;w.scale.setScalar(.95);scene.add(w);});
  // 礁柱及补给的路径经过编排，明确表现绕行与拾取。
  const rocks=[];for(let i=0;i<8;i++){const r=createSeaStack(0,8+(i%3)*4,0,2.6+(i%2));scene.add(r.mesh);rocks.push(r.mesh);}
  const coins=[];const coinTemplate=createMoraCoin();for(let i=0;i<10;i++){const coin=coinTemplate.clone(true);coin.scale.setScalar(.85);scene.add(coin);coins.push(coin);}
  const hostile=[createEnemyMissile(new T.Vector3(0,0,1)),createEnemyMissile(new T.Vector3(0,0,1)),createEnemyMissile(new T.Vector3(0,0,1))];hostile.forEach(m=>scene.add(m));
  const missiles=[createPlayerMissile(new T.Vector3(0,0,-1)),createPlayerMissile(new T.Vector3(0,0,-1))];missiles.forEach(m=>{m.getObjectByName('missile-exhaust').visible=true;scene.add(m);});
  const shield=new T.Mesh(new T.TorusGeometry(2.7,.065,8,64),glowMaterial(0xb5f4e6,.85));scene.add(shield);
  const tracerMaterial=glowMaterial(0xffe0a8,.95),tracers=[];
  for(let i=0;i<16;i++){const bullet=new T.Mesh(new T.CylinderGeometry(.025,.035,2.2,5).rotateX(Math.PI/2),tracerMaterial);scene.add(bullet);tracers.push(bullet);}
  const flash=new T.Mesh(new T.SphereGeometry(.28,8,6),glowMaterial(0xffdc9f,.95));plane.add(flash);flash.position.set(0,-.2,-3.8);
  // 航母为演示原创资产：分离的两侧装甲让后方核心在镜头中可读。
  const carrier=new T.Group();carrier.name='空中航母 / 核心弱点演示';scene.add(carrier);
  const hull=new T.MeshStandardMaterial({color:0x405967,metalness:.65,roughness:.38});
  const armor=new T.MeshStandardMaterial({color:0x8b9ca0,metalness:.6,roughness:.36});
  const dark=new T.MeshStandardMaterial({color:0x152d39,metalness:.5,roughness:.45});
  const orange=glowMaterial(0xffa460,.9);
  const hullGeometries=new Map();
  function bevelBox(w,h,d){const key=`${w}/${h}/${d}`;if(hullGeometries.has(key))return hullGeometries.get(key);const r=Math.min(.38,w*.12,h*.12,d*.12),a=w/2-r,b=h/2-r,shape=new T.Shape();shape.moveTo(-a,-b);shape.lineTo(a,-b);shape.lineTo(a,b);shape.lineTo(-a,b);shape.closePath();const geometry=new T.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,steps:1,curveSegments:1}).translate(0,0,-d/2+r);hullGeometries.set(key,geometry);return geometry;}
  function block(x,y,z,w,h,d,mat=hull){const mesh=new T.Mesh(bevelBox(w,h,d),mat);mesh.position.set(x,y,z);carrier.add(mesh);return mesh;}
  for(const side of [-1,1]){
    block(side*10,0,0,6,6,42);block(side*10,3.1,-1,6.3,.45,39,armor);block(side*10,-3.15,-1,6.5,.5,37,dark);
    block(side*17,1,-4,12,1,12,armor);block(side*19,1.7,-5,2,.4,11,dark);
    block(side*10,2.9,-14,4,1,5,dark);block(side*10,5.5,-13,.7,5,4,armor);
    block(side*7.1,.1,18,.18,5.6,1,orange);
    for(let j=0;j<5;j++){block(side*13.05,.3,-13+j*6,.12,2.4,2.5,dark);block(side*10,3.38,-14+j*7,.5,.07,3,orange);}
    const exhaust=new T.Mesh(new T.ConeGeometry(1.3,11,12,1,true).rotateX(Math.PI/2).translate(0,0,5.5),glowMaterial(0x69c3e8,.4));exhaust.position.set(side*10,0,21);carrier.add(exhaust);
  }
  block(0,3.6,-2,15,1,33,armor);block(0,-3.6,-2,15,1,33,dark);block(0,0,-17,15,7,1,dark);
  const core=new T.Group();core.position.set(0,0,8);carrier.add(core);
  const coreRing=new T.Mesh(new T.TorusGeometry(2.2,.22,10,48),hull);core.add(coreRing);
  const innerCore=new T.Mesh(new T.SphereGeometry(1.6,24,16),glowMaterial(0xffb36b,.9));innerCore.scale.z=.35;core.add(innerCore);
  const coreHalo=new T.Mesh(new T.TorusGeometry(1.85,.07,6,48),orange);core.add(coreHalo);
  // 预分配爆炸粒子，任意时间点直接求解位置和大小，避免倒放时状态残留。
  // 面向镜头的噪声粒子产生柔和火光与烟团，避免爆炸呈现硬边圆块。
  const billboardVertex=`varying vec2 vUv; varying vec3 vTint; varying float vSeed;
    void main(){vUv=uv;vTint=instanceColor;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      vSeed=instanceMatrix[3].x*.73+instanceMatrix[3].y*.37;
      vec2 scale=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
      center.xy+=position.xy*scale;gl_Position=projectionMatrix*center;}`;
  const particleFragment=`uniform float fade;uniform float age;uniform float smokeMode;
    varying vec2 vUv;varying vec3 vTint;varying float vSeed;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
    void main(){vec2 p=vUv*2.-1.;float n=noise(p*3.5+vSeed+vec2(0.,age*.8))*.62+noise(p*8.-age*.4+vSeed)*.26;
      float edge=length(p)+(n-.4)*.36;float alpha=(1.-smoothstep(.35,1.,edge))*fade;
      if(alpha<.01)discard;
      vec3 fire=mix(vTint*.55,vec3(1.,.82,.48),pow(max(0.,1.-edge),2.));
      vec3 soot=mix(vec3(.07,.12,.15),vec3(.26,.31,.32),n*.7+max(0.,1.-edge)*.18);
      gl_FragColor=vec4(mix(fire,soot,smokeMode),alpha*mix(.8,.3,smokeMode));}`;
  function particleMaterial(smokeMode){return new T.ShaderMaterial({uniforms:{fade:{value:1},age:{value:0},smokeMode:{value:smokeMode}},vertexShader:billboardVertex,fragmentShader:particleFragment,transparent:true,depthWrite:false,blending:smokeMode?T.NormalBlending:T.AdditiveBlending,toneMapped:false});}
  const fireMaterial=particleMaterial(0);
  const fire=new T.InstancedMesh(new T.PlaneGeometry(2,2),fireMaterial,72);fire.instanceMatrix.setUsage(T.DynamicDrawUsage);fire.frustumCulled=false;scene.add(fire);
  const smokeMaterial=particleMaterial(1);
  const smoke=new T.InstancedMesh(new T.PlaneGeometry(2,2),smokeMaterial,22);smoke.frustumCulled=false;
  for(let j=0;j<22;j++)smoke.setColorAt(j,new T.Color(0x3a5060));scene.add(smoke);
  const shock=new T.Mesh(new T.TorusGeometry(1,.007,5,90),glowMaterial(0xffd7a3,.24));scene.add(shock);
  const dummy=new T.Object3D(),color=new T.Color();
  const trails=[];
  for(let j=0;j<2;j++){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(64*6*3),3));geometry.setAttribute('color',new T.BufferAttribute(new Float32Array(64*6*3),3));const ribbon=new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.28,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));ribbon.frustumCulled=false;scene.add(ribbon);trails.push(ribbon);}
  function chapterAt(t){return Math.max(0,chapters.findIndex(c=>t>=c.start&&t<c.end));}
  const forward=new T.Vector3(0,0,1),scratch=new T.Vector3(),scratch2=new T.Vector3(),camPos=new T.Vector3(),camLook=new T.Vector3();
  function pose(t){
    const i=t>=60?5:chapterAt(Math.max(0,t)),s=t-chapters[i].start;
    let x=0,y=10,yaw=0,roll=0,pitch=.015;
    if(i===0){y=11+Math.sin(s*.55)*.3;yaw=.08;roll=-.08+Math.sin(s*.6)*.025;}
    if(i===1){x=2.4*Math.sin(s*.85);y=7.8+Math.sin(s*.7)*.6;yaw=-.12*Math.cos(s*.85);roll=-.37*Math.cos(s*.85);}
    if(i===2){x=5*Math.sin(s*.7);y=10+1.5*Math.sin(s*.8);yaw=-.43*Math.cos(s*.7);roll=-.9*Math.cos(s*.7);pitch=.08*Math.cos(s*.8);if(s>6.5&&s<7.7)roll+=Math.sin((s-6.5)/1.2*Math.PI*2)*.6;}
    if(i===3){x=1.4*Math.sin(s*.5);y=10+Math.sin(s*.4)*.3;yaw=.03*Math.sin(s);roll=.14*Math.sin(s*.5);}
    if(i===4){x=3.5*(1-T.MathUtils.smoothstep(s,0,5));y=11;yaw=.06*(1-T.MathUtils.smoothstep(s,0,5));roll=-.13*Math.sin(s*.5);}
    if(i===5){x=0;y=12+Math.sin(s*.4);yaw=.08;roll=-.14;pitch=.015;}
    return {i,s,p:new T.Vector3(x,y,0),q:new T.Quaternion().setFromEuler(new T.Euler(pitch,yaw,roll,'YXZ'))};
  }
  function positionMissile(mesh,a,b,u,arc=0){mesh.visible=u>=0&&u<=1;if(!mesh.visible)return;mesh.position.lerpVectors(a,b,u);mesh.position.x+=Math.sin(u*Math.PI)*arc;const direction=b.clone().sub(a);direction.x+=Math.cos(u*Math.PI)*arc;mesh.quaternion.setFromUnitVectors(forward,direction.normalize());}
  function burst(age,origin,scale=1){
    const active=age>=0&&age<4.2;fire.visible=smoke.visible=shock.visible=active;if(!active)return;
    fireMaterial.uniforms.fade.value=Math.max(0,1-age/2.4);fireMaterial.uniforms.age.value=age;smokeMaterial.uniforms.fade.value=Math.max(0,.7*(1-age/4.2));smokeMaterial.uniforms.age.value=age;
    for(let j=0;j<72;j++){
      const theta=j*2.39996,yy=Math.sin(j*7.13),rr=Math.sqrt(1-yy*yy),speed=(2+(j%9)*.8)*scale;
      dummy.position.set(Math.cos(theta)*rr*speed*age,yy*speed*age+.6*age*age,Math.sin(theta)*rr*speed*age).add(origin);
      dummy.scale.setScalar(Math.max(.001,(.18+(j%7)*.11)*scale*(1+age*.4)));dummy.updateMatrix();fire.setMatrixAt(j,dummy.matrix);
      color.setHex(j%4===0?0xfff3cf:j%3===0?0xfcb66d:0xf06c36);color.multiplyScalar(Math.max(.1,1-age*.23));fire.setColorAt(j,color);
    }
    fire.instanceMatrix.needsUpdate=true;fire.instanceColor.needsUpdate=true;
    for(let j=0;j<22;j++){const a=j*2.4;dummy.position.set(Math.cos(a)*age*2.2*scale,Math.sin(j*3.1)*age*1.5*scale+age*2.1,Math.sin(a)*age*2.2*scale).add(origin);dummy.scale.setScalar((.8+age*1.6)*scale*(.5+(j%4)*.14));dummy.updateMatrix();smoke.setMatrixAt(j,dummy.matrix);}smoke.instanceMatrix.needsUpdate=true;
    shock.position.copy(origin);shock.lookAt(camera.position);shock.scale.setScalar((1+age*17)*scale);shock.material.opacity=Math.max(0,.24-age*.3);
  }
  function trail(t,index){
    const p=trails[index].geometry.attributes.position,c=trails[index].geometry.attributes.color,sign=index?1:-1;
    const points=[],currentChapter=pose(t).i;
    for(let n=0;n<=64;n++){const dt=n*.016,old=pose(Math.max(chapters[currentChapter].start,t-dt));const v=new T.Vector3(sign*extent.x*.44,.08,.3).applyQuaternion(old.q).add(old.p);v.z+=dt*27;points.push(v);}
    let k=0;for(let n=0;n<64;n++){const a=points[n],b=points[n+1],w=.04+.12*n/64;const vertices=[[a.x-w,a.y,a.z],[a.x+w,a.y,a.z],[b.x-w,b.y,b.z],[a.x+w,a.y,a.z],[b.x+w,b.y,b.z],[b.x-w,b.y,b.z]];for(const v of vertices){p.setXYZ(k,...v);const fade=(1-n/64)*.65;c.setXYZ(k,fade*.62,fade*.8,fade);k++;}}
    p.needsUpdate=true;c.needsUpdate=true;
  }
  let activeChapter=-1;
  function evaluate(t){
    t=clamp(t,0,duration);const state=pose(t),{i,s}=state;plane.position.copy(state.p);plane.quaternion.copy(state.q);plane.scale.setScalar(i===0?1.2:i===5?1.15:1);
    islandMap.update(t*24,t);const boost=i===2||i===4;flames.forEach((f,j)=>f.scale.set(1,1,(boost?1.7:1)+Math.sin(t*37+j)*.08));
    const combat=i>0&&i<5;
    if(i===0){const a=-1.5+s*.19;camPos.set(Math.sin(a)*17,17-s*.35,Math.cos(a)*19);camLook.set(3.2,10,-.5);camera.fov=44;}
    if(i===1){camPos.set(state.p.x*.55,13,21);camLook.set(state.p.x*.3,8,-22);camera.fov=56;}
    if(i===2){camPos.set(state.p.x*.45-2,14,23);camLook.set(state.p.x*.7,10,-19);camera.fov=59;}
    if(i===3){camPos.set(-2.5,14.5,22);camLook.set(0,10,-23);camera.fov=52;}
    if(i===4){camPos.set(-3+Math.sin(s*.3),15,24);camLook.set(0,11,-27);camera.fov=57;}
    if(i===5){camPos.set(13+Math.sin(s*.16)*4,16,15-s*.8);camLook.set(-2.4,12,-1);camera.fov=44;}
    // 垂直屏幕额外拉远，保留机翼及目标；导出与宽屏保持原始构图。
    if(innerWidth/innerHeight<1){camPos.multiplyScalar(1.25);camera.fov+=8;}
    camera.position.copy(camPos);camera.up.set(0,1,0);camera.lookAt(camLook);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    for(let j=0;j<rocks.length;j++){const rock=rocks[j];rock.visible=i===1;const progress=s*23-j*25;rock.position.x=(j%2?1:-1)*(7+(j%3)*1.5);rock.position.z=-90+progress;}
    for(let j=0;j<coins.length;j++){const coin=coins[j],z=-24-j*13+s*22;coin.visible=i===1&&z<1.5;coin.position.set(2.4*Math.sin((s-z/22)*.85),7.8,-24-j*13+s*22);coin.rotation.set(0,t*1.5+j*.3,0);}
    wingmen.forEach((w,j)=>{w.visible=i===0&&s<7;w.position.set(17+j*8,14+j*2,-22-j*14+s*1.4);});
    enemy.visible=i===3&&s<8.1;enemy.position.set(2*Math.sin(s*.7),10+Math.sin(s*.6),-52+s*.9);enemy.rotation.z=Math.sin(s*.7)*.25;
    carrier.visible=i===4&&s<9.1;carrier.position.set(0,11,-114+s*9.5);carrier.rotation.z=Math.sin(s*.4)*.015;coreHalo.rotation.z=t*.7;innerCore.scale.setScalar(1+Math.sin(t*8)*.035);innerCore.scale.z=.35;
    const shieldAge=s-7.05;shield.visible=i===2&&shieldAge>=0&&shieldAge<.65;shield.position.copy(state.p).add(new T.Vector3(0,0,-4));shield.lookAt(camera.position);shield.scale.setScalar(1+Math.max(0,shieldAge)*3);shield.material.opacity=Math.max(0,1-shieldAge*1.5);
    hostile.forEach((m,j)=>{
      const age=s-(1.5+j*2.4),u=age/1.6;m.visible=i===2&&u>=0&&u<1.7;
      if(m.visible){m.position.set(lerp(-12+j*11,5-j*5,u),lerp(12+j*.5,9,u),lerp(-80,34,u));m.quaternion.setFromUnitVectors(forward,new T.Vector3(3-j*2,-.5,15).normalize());animateEnemyMissile(m,t,j);}
      if(i===2&&j===2&&s>7.1){m.position.z=-5-(s-7.1)*70;m.position.x=state.p.x;m.position.y=state.p.y;m.rotation.y=Math.PI;}
    });
    const target=enemy.position.clone(),corePosition=core.getWorldPosition(new T.Vector3());
    for(let j=0;j<missiles.length;j++){
      const start=state.p.clone().add(new T.Vector3(j?1.2:-1.2,-.3,-1));
      if(i===3)positionMissile(missiles[j],start,target,(s-5.7-j*.22)/2.4,j?7:-7);
      else if(i===4)positionMissile(missiles[j],start,corePosition,(s-7.1-j*.15)/2,0);
      else missiles[j].visible=false;
    }
    tracers.forEach((bullet,j)=>{bullet.visible=i===3&&s>1.5&&s<7.8;if(bullet.visible){const u=(s*2.3+j/16)%1;const start=state.p.clone().add(new T.Vector3(j%2?.25:-.25,-.15,-3.8));bullet.position.lerpVectors(start,target,u);bullet.quaternion.setFromUnitVectors(forward,target.clone().sub(start).normalize());}});
    flash.visible=i===3&&s>1.5&&s<7.8&&Math.sin(s*49)>.15;flash.scale.setScalar(.5+(Math.sin(t*173)+1)*.8);
    if(i===3)burst(s-8.1,target,1);else if(i===4)burst(s-9.1,new T.Vector3(0,11,-114+9.1*9.5),2.6);else burst(-1,target);
    trails.forEach((r,j)=>{r.visible=i!==0;trail(t,j);});
    renderer.render(scene,camera);
    if(i!==activeChapter){activeChapter=i;const c=chapters[i];$('chapter-code').textContent=`0${i+1} / 06`;$('chapter-en').textContent=c.en;$('chapter-title').textContent=c.title;$('chapter-description').textContent=c.description;[...nav.children].forEach((b,j)=>b.setAttribute('aria-current',String(i===j)));}
    $('hero').style.opacity=i===0?String(Math.min(1,s/.8,(9-s)/1.2)):0;
    $('telemetry').style.opacity=combat?'.82':'0';$('style-panel').style.opacity=combat?'.9':'0';$('reticle').hidden=!combat;
    const score=t<19?Math.floor(t*31):t<29?Math.floor(980+(t-19)*160):t<40?Math.floor(2580+(t-29)*380):Math.min(18400,Math.floor(6760+(t-40)*1130));
    $('score').textContent=String(score).padStart(6,'0');$('rank').textContent=i<2?'B':i===2?'A':'S';$('style-name').firstChild.textContent=i<2?'CLEAN FLIGHT':i===2?'NICE MANEUVER':'SKY ACE';$('style-fill').style.width=`${20+(t*5)%80}%`;
    $('speed').firstChild.textContent=String(Math.round(780+(boost?200:0)+Math.sin(t*.8)*30));$('altitude').textContent=String(Math.round(state.p.y*8)).padStart(3,'0');
    let action='',points='',actionAge=0;
    if(i===1&&s>2.2&&s<8.8){action='补给拾取';points=`+ ${Math.min(10,Math.floor(s*1.1))} SUPPLIES`;actionAge=.4;}
    if(i===2&&s>3&&s<5){action='近距躲避';points='NEAR MISS +240';actionAge=s-3;}
    if(i===2&&s>7.05&&s<9){action='完美格挡';points='PERFECT PARRY +600';actionAge=s-7.05;}
    if(i===3&&s>8.1&&s<10.7){action='目标击毁';points='TARGET DESTROYED +1,200';actionAge=s-8.1;}
    if(i===4&&s>9.1){action='核心击破';points='CORE BREAK +4,800';actionAge=s-9.1;}
    $('action-label').textContent=action;$('action-points').textContent=points;$('action').style.opacity=action?String(Math.min(1,actionAge*5)):0;
    let marker=null;if(i===3&&s<8.1)marker=target;if(i===4&&s>1&&s<9.1)marker=corePosition;
    const targetEl=$('target');targetEl.hidden=true;
    if(marker){scratch.copy(marker).project(camera);if(scratch.z<1&&Math.abs(scratch.x)<.9&&Math.abs(scratch.y)<.85){targetEl.hidden=false;targetEl.style.left=`${(scratch.x*.5+.5)*innerWidth}px`;targetEl.style.top=`${(-scratch.y*.5+.5)*innerHeight}px`;$('target-name').textContent=i===4?'EXPOSED CORE':'TARGET LOCK';$('target-distance').textContent=`${Math.round(marker.distanceTo(state.p)*8)} M`;}}
    $('end-card').hidden=i!==5;$('end-card').style.opacity=String(T.MathUtils.smoothstep(s,.4,1.4));$('caption').style.opacity=i===5?String(1-T.MathUtils.smoothstep(s,0,.5)):'1';
    // 硬切镜头只做短暂淡入，长时间镜头保持清晰。
    $('cut').style.opacity=String(i>0&&s<.22?(1-s/.22)*.6:0);
    $('clock').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t)%60).padStart(2,'0')} / 01:00`;$('seek').value=String(t);$('seek').style.setProperty('--progress',`${t/duration*100}%`);
    $('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'暂停动画':'播放动画');
    return {time:t,chapter:i,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  }
  function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;evaluate(time);}
  addEventListener('resize',resize);
  function animate(now){if(disposed)return;frame=requestAnimationFrame(animate);const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(document.hidden)return;if(playing){time+=dt*rate;if(time>=duration){if(looping)time%=duration;else{time=duration;playing=false;}}evaluate(time);}}
  function renderAt(seconds){playing=false;time=clamp(Number(seconds)||0,0,duration);return evaluate(time);}
  // 渲染导出接口仅控制这段预设动画，不连接外设或修改游戏存档。
  window.conceptFilm=Object.freeze({duration,chapters,renderAt,getState:()=>({time,playing,rate,looping})});
  $('loading').hidden=true;evaluate(time);frame=requestAnimationFrame(animate);
  addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);islandMap?.dispose();const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();});textures.forEach(t=>t.dispose());environment?.dispose();renderer.dispose();},{once:true});
} catch(error){playing=false;$('loading').hidden=false;$('loading').querySelector('b').textContent='动画暂时无法启动';$('loading').querySelector('small').textContent=`${error.message}。请使用启动器在 Chrome / Edge 中打开，并启用硬件加速。`;console.error(error);}
function seek(seconds){time=clamp(Number(seconds)||0,0,duration);window.conceptFilm?.renderAt(time);last=0;}
function toggle(){if(!window.conceptFilm)return;if(time>=duration)time=0;playing=!playing;last=0;$('play').textContent=playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',playing?'暂停动画':'播放动画');}
$('play').onclick=toggle;$('restart').onclick=()=>{seek(0);playing=true;};$('seek').oninput=e=>seek(e.target.value);
$('rate').onchange=e=>{rate=Number(e.target.value);};$('loop').onclick=()=>{looping=!looping;$('loop').setAttribute('aria-pressed',String(looping));};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('fullscreen').title='浏览器暂不支持全屏';}};
addEventListener('keydown',e=>{if(e.target.matches('input,select,button,a'))return;if(e.code==='Space'){e.preventDefault();toggle();}if(e.code==='ArrowRight'){e.preventDefault();seek(time+5);}if(e.code==='ArrowLeft'){e.preventDefault();seek(time-5);}});
addEventListener('visibilitychange',()=>{last=0;});
