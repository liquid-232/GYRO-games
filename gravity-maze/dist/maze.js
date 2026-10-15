import {createSphereLevel,stepSphere,spherePoint,surfaceDistance} from './sphere-physics.js';
import {createSphereModel} from './sphere-model.js';
import * as T from './vendor/three.module.js';
import {GyroController} from './gyro.js';
import {createMazeModel,disposeMazeModel} from './maze-model.js';
import {createLevel,newBall,stepBall,RADIUS} from './maze-physics.js';
const $=id=>document.getElementById(id),keys=new Set(),touch={x:0,y:0};
let family='sphere',checkpoint=null,mode='menu',index=0,level,ball,elapsed=0,falls=0,collected=new Set(),accumulator=0,fallTime=0,poseView,poseLoad;
const names=['01 / 初识重力','02 / 曲径寻星','03 / 精密穿行'],orbNames=['01 / 环绕初航','02 / 起伏回廊','03 / 极限窄桥'];
const isOrb=()=>level?.kind==='sphere';
const recordKey=()=>`gravity-maze-best-${family==='sphere'?'sphere-v1-':''}${index}`;
const gyro=new GyroController({onInterrupt:message=>pause(message),onNoseDirection:d=>poseView?.setNoseDirection(d),onPanelVisibility:visible=>{
  if(poseView){poseView.setVisible(visible);return;}if(!visible||poseLoad)return;
  poseLoad=import('./gyro-view.js').then(({GyroPoseView})=>{poseView=new GyroPoseView($('gyroModel'),gyro);poseView.setVisible(gyro.selected&&!$('gyroPanel').classList.contains('hidden'));}).catch(()=>{$('gyroModelState').textContent='姿态预览不可用';poseLoad=null;});
}});
// 复用空战的硬件协议、校准与断流保护；为本游戏提供对应的界面文字。
const renderStatus=gyro.renderStatus.bind(gyro);gyro.renderStatus=()=>{renderStatus();$('gyroTitle').textContent=`${gyro.linkName}体感滚球`;$('controlHint').textContent='倾斜控制方向';$('gyroGuide').innerHTML=$('gyroGuide').innerHTML.replaceAll('飞行','挑战');};
$('gyroPanel').querySelector('.gyro-footnote').textContent='设置中位后关闭面板，点击开始或继续挑战。选择控制器的前进方向，可调整操控轴。';
const renderer=new T.WebGLRenderer({canvas:$('mazeCanvas'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x102e33);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new T.Scene(),camera=new T.OrthographicCamera(-8,8,8,-8,.1,100);camera.position.set(0,19,10);camera.lookAt(0,0,0);
scene.add(new T.HemisphereLight(0xdcf8ed,0x193f48,1.7));const light=new T.DirectionalLight(0xffe2ae,3.4);light.position.set(-5,16,7);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-10,right:10,top:10,bottom:-10});light.shadow.bias=-.0005;scene.add(light);const rim=new T.DirectionalLight(0x8de5ee,2.2);rim.position.set(8,4,-8);scene.add(rim);
const environment=new T.Scene();environment.background=new T.Color(0x55737a);for(const x of [-5,5]){const panel=new T.Mesh(new T.PlaneGeometry(5,10),new T.MeshBasicMaterial({color:0xeafcff}));panel.position.set(x,7,2);panel.lookAt(0,0,0);environment.add(panel);}const pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(environment);scene.environment=env.texture;pmrem.dispose();
let board=new T.Group(),sphere,starMeshes=[],exitRing;scene.add(board);
function loadLevel(i){
 index=i;level=family==='sphere'?createSphereLevel(i):createLevel(i);ball=newBall(level);checkpoint={...level.start};elapsed=falls=fallTime=accumulator=0;collected.clear();mode='menu';keys.clear();touch.x=touch.y=0;document.body.classList.remove('playing');
 scene.remove(board);disposeMazeModel(board);({board,sphere,starMeshes,exitRing}=(isOrb()?createSphereModel(level):createMazeModel(level)));scene.add(board);
 $('levelName').textContent=(isOrb()?orbNames:names)[i]+' / 收集星星 → 抵达终点';$('familyTitle').textContent=isOrb()?'立体迷宫球':'经典平面迷宫';$('orbHelp').textContent=isOrb()?'视角随球环绕 · 星星存档 · 金色窄桥放慢速度':'绕开红色陷阱 · 收齐三颗星星';$('mazeModal').classList.add('hidden');$('mazePause').disabled=true;$('mazeStart').textContent='开始挑战 ↗';$('mazeMessage').textContent=isOrb()?'倾斜控制球面上的滚球；收集星星会保存检查点。':'收齐三颗星星，抵达终点。连接体感或用键盘开始。';
 [...$('levels').children].forEach((b,j)=>b.setAttribute('aria-pressed',i===j));let record;try{record=JSON.parse(localStorage.getItem(recordKey()));}catch{}$('record').textContent=record?`本关最佳 ${record.time.toFixed(1)} 秒 · ${record.falls} 次掉落`:'本关最佳 —';camera.up.set(0,1,0);if(isOrb()){const normal=new T.Vector3(...spherePoint(level,ball.x,ball.z)).normalize();camera.position.copy(normal.multiplyScalar(20));camera.lookAt(0,0,0);}else{camera.position.set(0,19,10);camera.lookAt(0,0,0);}hud();resize();
}
function hud(){$('timer').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${(elapsed%60).toFixed(1).padStart(4,'0')}`;$('stars').textContent=`${collected.size} / 3`;$('falls').textContent=falls;}
function permit(){if(gyro.canFly)return true;$('mazeMessage').textContent=gyro.pauseMessage;$('modalText').textContent=gyro.pauseMessage;if($('gyroPanel').classList.contains('hidden'))$('gyroToggle').click();return false;}
function start(){if(!permit())return;document.activeElement?.blur();if(mode==='won')loadLevel(index);if(!$('gyroPanel').classList.contains('hidden'))$('gyroClose').click();mode='playing';accumulator=0;$('mazeModal').classList.add('hidden');$('mazePause').disabled=false;document.body.classList.add('playing');$('mazeStart').textContent='暂停挑战 Ⅱ';$('mazeMessage').textContent=isOrb()?'球面模式：沿通道轻缓倾斜，窄桥上可按空格刹车。':'轻轻倾斜即可滚动。先收集三颗星星，再进入终点。';}
function pause(message='休息一下，准备好后继续。'){if(mode!=='playing')return;mode='paused';keys.clear();touch.x=touch.y=0;document.body.classList.remove('playing');$('modalTitle').textContent='挑战已暂停';$('modalText').textContent=message;$('continue').textContent='继续挑战';$('mazeModal').classList.remove('hidden');}
function win(){mode='won';document.body.classList.remove('playing');$('mazePause').disabled=true;let old;try{old=JSON.parse(localStorage.getItem(recordKey()));if(!old||elapsed<old.time)localStorage.setItem(recordKey(),JSON.stringify({time:elapsed,falls}));}catch{}$('modalTitle').textContent=index===2?'三关挑战完成！':'迷宫已征服';$('modalText').textContent=`收齐 3 颗星星 · 用时 ${elapsed.toFixed(1)} 秒 · 掉落 ${falls} 次${!old||elapsed<old.time?' · 新纪录':''}`;$('continue').textContent=index===2?'返回第一关':'下一关 ↗';$('mazeModal').classList.remove('hidden');}
function buildLevels(){
 $('levels').replaceChildren();
 for(let i=0;i<3;i++){const b=document.createElement('button');b.innerHTML=`<span class=level-number>0${i+1}</span><span><b>${(family==='sphere'?['环绕初航','起伏回廊','极限窄桥']:['初识重力','曲径寻星','精密穿行'])[i]}</b><small>${(family==='sphere'?['入门 · 球面探索','进阶 · 坡道 / 宽桥','专家 · 窄桥 / 惯性']:['入门 · 9 × 9','进阶 · 11 × 11','挑战 · 13 × 13'])[i]}</small></span><span class=level-arrow>↗</span>`;b.onclick=()=>loadLevel(i);$('levels').append(b);}
}
for(const button of document.querySelectorAll('[data-family]'))button.onclick=()=>{family=button.dataset.family;document.querySelectorAll('[data-family]').forEach(b=>b.setAttribute('aria-pressed',b===button));buildLevels();loadLevel(0);};
$('mazeStart').onclick=()=>{if(mode==='playing')pause();else start();};$('keyboardStart').onclick=()=>{$('controlMode').value='keyboard';$('controlMode').onchange();start();};
$('mazePause').onclick=()=>mode==='playing'?pause():start();$('continue').onclick=()=>{if(mode==='won')loadLevel((index+1)%3);start();};$('retry').onclick=()=>{loadLevel(index);start();};$('mazeLobby').onclick=()=>loadLevel(index);
window.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,#gyroPanel,button'))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyP'||e.code==='Escape'){if(!e.repeat){if(mode==='playing')pause();else if(mode==='paused')start();}return;}if(mode==='playing')keys.add(e.code);});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>pause());document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
for(const b of $('pad').children){b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);touch.x=Number(b.dataset.x);touch.y=Number(b.dataset.y);};b.onpointerup=b.onpointercancel=()=>{touch.x=touch.y=0;};}
function resize(){const r=$('boardViewport').getBoundingClientRect(),aspect=r.width/Math.max(1,r.height),half=isOrb()?6.05:(level?.size||9)*.57;camera.left=-half*Math.max(1,aspect);camera.right=-camera.left;camera.top=half*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);}new ResizeObserver(resize).observe($('boardViewport'));
let previous=performance.now();function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;
 if(mode==='playing'){
  const motion=gyro.sample(dt);
  if(mode==='playing'&&(!gyro.selected||gyro.fresh)){
   const input=motion||{x:Math.max(-1,Math.min(1,Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+touch.x)),y:Math.max(-1,Math.min(1,Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))+touch.y))};
   accumulator+=dt;
   while(accumulator>=1/120&&mode==='playing'){const step=1/120;accumulator-=step;elapsed+=step;
    if(fallTime>0){fallTime-=step;if(!isOrb())sphere.position.y=-.8*(1-fallTime/.45);sphere.scale.setScalar(Math.max(.05,fallTime/.45));if(fallTime<=0){ball={...(isOrb()?checkpoint:level.start),vx:0,vz:0};sphere.scale.setScalar(1);sphere.position.y=RADIUS;accumulator=0;}continue;}
    const oldX=ball.x,oldZ=ball.z;if((isOrb()?stepSphere:stepBall)(ball,level,input,step,keys.has('Space'))){falls++;fallTime=.45;$('mazeMessage').textContent=isOrb()?'掉落，返回最近检查点；已收集的星星保留。':'落入陷阱，返回起点；已收集的星星保留。';continue;}
    sphere.rotation.z-=(ball.x-oldX)/RADIUS;sphere.rotation.x+=(ball.z-oldZ)/RADIUS;
    level.stars.forEach((s,i)=>{if(!collected.has(i)&&(isOrb()?surfaceDistance(level,ball,s):Math.hypot(ball.x-s.x,ball.z-s.z))<.43){collected.add(i);starMeshes[i].visible=false;if(isOrb()){checkpoint={...s};$('mazeMessage').textContent=`星星 ${collected.size}/3 · 检查点已保存`;}if(collected.size===3){exitRing.material.color.set(0x86f8df);exitRing.material.emissive.set(0x2b8976);$('mazeMessage').textContent='星星已集齐，前往发光终点！';}}});
    if(collected.size===3&&(isOrb()?surfaceDistance(level,ball,level.goal):Math.hypot(ball.x-level.goal.x,ball.z-level.goal.z))<.32)win();
   }
   if(isOrb()){
    sphere.position.set(...spherePoint(level,ball.x,ball.z,RADIUS-(fallTime>0?(1-fallTime/.45)*.7:0)));
    const normal=new T.Vector3(...spherePoint(level,ball.x,ball.z)).normalize();
    const north=new T.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize();
    camera.up.lerp(north,1-Math.exp(-8*dt)).normalize();
    camera.position.lerp(normal.multiplyScalar(20),1-Math.exp(-7*dt));camera.lookAt(0,0,0);
   }else{
    sphere.position.x=ball.x;sphere.position.z=ball.z;
    board.rotation.z=T.MathUtils.damp(board.rotation.z,-input.x*.035,7,dt);board.rotation.x=T.MathUtils.damp(board.rotation.x,-input.y*.035,7,dt);const offset=(level.size-1)/2;board.position.set(-offset,0,-offset).applyQuaternion(board.quaternion);
   }
   hud();
  }else accumulator=0;
 }
 starMeshes.forEach((m,i)=>{if(isOrb()){m.quaternion.copy(m.userData.baseQuaternion);m.rotateZ(now*.001+i);}else{m.rotation.y=now*.001+i;m.position.y=.37+Math.sin(now*.002+i)*.05;}});renderer.render(scene,camera);
}
buildLevels();loadLevel(0);requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{renderer.dispose();env.dispose();});
