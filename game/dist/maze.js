import * as T from './vendor/three.module.js';
import {GyroController} from './gyro.js';
import {createLevel,newBall,stepBall,RADIUS} from './maze-physics.js';
const $=id=>document.getElementById(id),keys=new Set(),touch={x:0,y:0};
let mode='menu',index=0,level,ball,elapsed=0,falls=0,collected=new Set(),accumulator=0,fallTime=0,poseView,poseLoad;
const names=['01 / 初识重力','02 / 曲径寻星','03 / 精密穿行'];
const gyro=new GyroController({onInterrupt:message=>pause(message),onNoseDirection:d=>poseView?.setNoseDirection(d),onPanelVisibility:visible=>{
  if(poseView){poseView.setVisible(visible);return;}if(!visible||poseLoad)return;
  poseLoad=import('./gyro-view.js').then(({GyroPoseView})=>{poseView=new GyroPoseView($('gyroModel'),gyro);poseView.setVisible(gyro.selected&&!$('gyroPanel').classList.contains('hidden'));}).catch(()=>{$('gyroModelState').textContent='姿态预览不可用';poseLoad=null;});
}});
// 复用空战的硬件协议、校准与断流保护；为本游戏提供对应的界面文字。
const renderStatus=gyro.renderStatus.bind(gyro);gyro.renderStatus=()=>{renderStatus();$('gyroTitle').textContent=`${gyro.linkName}体感滚球`;$('controlHint').textContent='倾斜控制方向';$('gyroGuide').innerHTML=$('gyroGuide').innerHTML.replaceAll('飞行','挑战');};
$('gyroPanel').querySelector('.gyro-footnote').textContent='设置中位后关闭面板，点击开始或继续挑战。操控轴设置与空战共用。';
const renderer=new T.WebGLRenderer({canvas:$('mazeCanvas'),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x081c22);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene(),camera=new T.OrthographicCamera(-8,8,8,-8,.1,100);camera.position.set(0,19,10);camera.lookAt(0,0,0);
scene.add(new T.HemisphereLight(0xdcf8ed,0x193f48,2.7));const light=new T.DirectionalLight(0xffe2ae,4);light.position.set(-5,16,7);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-10,right:10,top:10,bottom:-10});light.shadow.bias=-.0005;scene.add(light);
const environment=new T.Scene();environment.background=new T.Color(0x55737a);for(const x of [-5,5]){const panel=new T.Mesh(new T.PlaneGeometry(5,10),new T.MeshBasicMaterial({color:0xeafcff}));panel.position.set(x,7,2);panel.lookAt(0,0,0);environment.add(panel);}const pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(environment);scene.environment=env.texture;pmrem.dispose();
const board=new T.Group();scene.add(board);let sphere,starMeshes=[],exitRing;
const mat=(color,metalness=0,roughness=.5)=>new T.MeshStandardMaterial({color,metalness,roughness});
function mesh(geo,material,x,y,z){const m=new T.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;board.add(m);return m;}
function ring(x,z,color,r=.34){const m=mesh(new T.TorusGeometry(r,.045,8,40),mat(color,.5,.25),x,.045,z);m.rotation.x=-Math.PI/2;return m;}
function loadLevel(i){
 index=i;level=createLevel(i);ball=newBall(level);elapsed=falls=fallTime=accumulator=0;collected.clear();mode='menu';keys.clear();touch.x=touch.y=0;document.body.classList.remove('playing');
 const geometries=new Set(),materials=new Set();board.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});board.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
 const n=level.size,offset=(n-1)/2;board.position.set(-offset,0,-offset);board.rotation.set(0,0,0);
 mesh(new T.BoxGeometry(n+.3,.45,n+.3),mat(0x204750,.35,.34),offset,-.28,offset);
 const wallGeo=new T.BoxGeometry(1,.52,1),wallMat=mat(0x50878b,.3,.32);
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){if(level.grid[z][x])mesh(wallGeo,wallMat,x,.26,z);else{const tile=mesh(new T.PlaneGeometry(.96,.96),mat((x+z)%2?0x244850:0x274c54,.2),x,-.047,z);tile.rotation.x=-Math.PI/2;}}
 ring(1,1,0x82f5d4);exitRing=ring(level.goal.x,level.goal.z,0x657a86,.36);
 for(const h of level.holes){const hole=mesh(new T.CylinderGeometry(.36,.36,.025,40),mat(0x02090e),h.x,-.018,h.z);hole.receiveShadow=false;ring(h.x,h.z,0xd78170,.39);}
 const starShape=new T.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.115:.25;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)starShape.moveTo(x,y);else starShape.lineTo(x,y);}starShape.closePath();const starGeo=new T.ExtrudeGeometry(starShape,{depth:.075,bevelEnabled:true,bevelThickness:.018,bevelSize:.018,bevelSegments:2,steps:1});starGeo.rotateX(-Math.PI/2);starMeshes=level.stars.map(s=>mesh(starGeo,mat(0xffd083,.8,.18),s.x,.28,s.z));
 sphere=mesh(new T.SphereGeometry(RADIUS,32,24),mat(0xd6ecef,.95,.12),ball.x,RADIUS,ball.z);
 $('levelName').textContent=names[i]+' / 收集全部星星后抵达发光圆环';$('mazeModal').classList.add('hidden');$('mazePause').disabled=true;$('mazeStart').textContent='开始挑战 ↗';
 [...$('levels').children].forEach((b,j)=>b.setAttribute('aria-pressed',i===j));let record;try{record=JSON.parse(localStorage.getItem(`gyro-maze-${i}`));}catch{}$('record').textContent=record?`本关最佳 ${record.time.toFixed(1)} 秒 · ${record.falls} 次掉落`:'本关最佳 —';hud();resize();
}
function hud(){$('timer').textContent=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${(elapsed%60).toFixed(1).padStart(4,'0')}`;$('stars').textContent=`${collected.size} / 3`;$('falls').textContent=falls;}
function permit(){if(gyro.canFly)return true;$('mazeMessage').textContent=gyro.pauseMessage;$('modalText').textContent=gyro.pauseMessage;if($('gyroPanel').classList.contains('hidden'))$('gyroToggle').click();return false;}
function start(){if(!permit())return;document.activeElement?.blur();if(mode==='won')loadLevel(index);if(!$('gyroPanel').classList.contains('hidden'))$('gyroClose').click();mode='playing';accumulator=0;$('mazeModal').classList.add('hidden');$('mazePause').disabled=false;document.body.classList.add('playing');$('mazeStart').textContent='挑战进行中';$('mazeMessage').textContent='轻轻倾斜即可滚动。先收集三颗星星，再进入终点。';}
function pause(message='休息一下，准备好后继续。'){if(mode!=='playing')return;mode='paused';keys.clear();touch.x=touch.y=0;document.body.classList.remove('playing');$('modalTitle').textContent='挑战已暂停';$('modalText').textContent=message;$('continue').textContent='继续挑战';$('mazeModal').classList.remove('hidden');}
function win(){mode='won';document.body.classList.remove('playing');$('mazePause').disabled=true;let old;try{old=JSON.parse(localStorage.getItem(`gyro-maze-${index}`));if(!old||elapsed<old.time)localStorage.setItem(`gyro-maze-${index}`,JSON.stringify({time:elapsed,falls}));}catch{}$('modalTitle').textContent=index===2?'三关挑战完成！':'迷宫已征服';$('modalText').textContent=`收齐 3 颗星星 · 用时 ${elapsed.toFixed(1)} 秒 · 掉落 ${falls} 次${!old||elapsed<old.time?' · 新纪录':''}`;$('continue').textContent=index===2?'返回第一关':'下一关 ↗';$('mazeModal').classList.remove('hidden');}
for(let i=0;i<3;i++){const b=document.createElement('button');b.textContent=['入门','进阶','挑战'][i];b.onclick=()=>loadLevel(i);$('levels').append(b);}
$('mazeStart').onclick=()=>{if(mode==='playing')pause();else start();};$('keyboardStart').onclick=()=>{$('controlMode').value='keyboard';$('controlMode').onchange();start();};
$('mazePause').onclick=()=>mode==='playing'?pause():start();$('continue').onclick=()=>{if(mode==='won')loadLevel((index+1)%3);start();};$('retry').onclick=()=>{loadLevel(index);start();};$('mazeLobby').onclick=()=>loadLevel(index);
window.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,#gyroPanel,button'))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyP'||e.code==='Escape'){if(!e.repeat){if(mode==='playing')pause();else if(mode==='paused')start();}return;}if(mode==='playing')keys.add(e.code);});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>pause());document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
for(const b of $('pad').children){b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);touch.x=Number(b.dataset.x);touch.y=Number(b.dataset.y);};b.onpointerup=b.onpointercancel=()=>{touch.x=touch.y=0;};}
function resize(){const r=$('boardViewport').getBoundingClientRect(),aspect=r.width/Math.max(1,r.height),half=(level?.size||9)*.67;camera.left=-half*Math.max(1,aspect);camera.right=-camera.left;camera.top=half*Math.max(1,1/aspect);camera.bottom=-camera.top;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);}new ResizeObserver(resize).observe($('boardViewport'));
let previous=performance.now();function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,Math.max(0,(now-previous)/1000));previous=now;
 if(mode==='playing'){
  const motion=gyro.sample(dt);
  if(mode==='playing'&&(!gyro.selected||gyro.fresh)){
   const input=motion||{x:Math.max(-1,Math.min(1,Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'))+touch.x)),y:Math.max(-1,Math.min(1,Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))+touch.y))};
   accumulator+=dt;
   while(accumulator>=1/120&&mode==='playing'){const step=1/120;accumulator-=step;elapsed+=step;
    if(fallTime>0){fallTime-=step;sphere.position.y=-.8*(1-fallTime/.45);sphere.scale.setScalar(Math.max(.05,fallTime/.45));if(fallTime<=0){ball=newBall(level);sphere.scale.setScalar(1);sphere.position.y=RADIUS;}continue;}
    const oldX=ball.x,oldZ=ball.z;if(stepBall(ball,level,input,step,keys.has('Space'))){falls++;fallTime=.45;$('mazeMessage').textContent='落入陷阱，返回起点；已收集的星星保留。';}
    sphere.rotation.z-=(ball.x-oldX)/RADIUS;sphere.rotation.x+=(ball.z-oldZ)/RADIUS;
    level.stars.forEach((s,i)=>{if(!collected.has(i)&&Math.hypot(ball.x-s.x,ball.z-s.z)<.43){collected.add(i);starMeshes[i].visible=false;if(collected.size===3){exitRing.material.color.set(0x86f8df);exitRing.material.emissive.set(0x2b8976);$('mazeMessage').textContent='星星已集齐，前往发光终点！';}}});
    if(collected.size===3&&Math.hypot(ball.x-level.goal.x,ball.z-level.goal.z)<.32)win();
   }
   sphere.position.x=ball.x;sphere.position.z=ball.z;
   // 小幅视觉倾斜绕棋盘中心，物理仍在棋盘局部坐标中计算。
   board.rotation.z=T.MathUtils.damp(board.rotation.z,-input.x*.035,7,dt);board.rotation.x=T.MathUtils.damp(board.rotation.x,-input.y*.035,7,dt);const offset=(level.size-1)/2;board.position.set(-offset,0,-offset).applyQuaternion(board.quaternion);
   hud();
  }else accumulator=0;
 }
 starMeshes.forEach((m,i)=>{m.rotation.y=now*.001+i;m.position.y=.37+Math.sin(now*.002+i)*.05;});renderer.render(scene,camera);
}
loadLevel(0);requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{renderer.dispose();env.dispose();});
