import * as T from './vendor/three.module.js';
import { GyroController } from './gyro.js';
import { parseAircraft } from './aircraft-model.js';
import { createEnemyAircraft, ENEMY_EXTENTS } from './enemy-model.js';
import { createIslandMap, createSeaStack } from './island-map.js';
const $=id=>document.getElementById(id), clamp=T.MathUtils.clamp;
let renderer;
try{renderer=new T.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'high-performance'});}catch(e){$('loadError').classList.remove('hidden');$('loadError').textContent='无法启动 3D 场景，请启用浏览器硬件加速后刷新。';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x72939c);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const scene=new T.Scene();scene.fog=new T.FogExp2(0x78979e,.005);const camera=new T.PerspectiveCamera(53,innerWidth/innerHeight,.1,700);
scene.add(new T.HemisphereLight(0xc2deeb,0x263b3c,2.3));const sun=new T.DirectionalLight(0xffe8c4,3.3);sun.position.set(-32,38,-45);scene.add(sun);const rim=new T.DirectionalLight(0xb5e4ff,1.8);rim.position.set(15,8,15);scene.add(rim);
// Studio environment gives the existing metal material a continuous reflection.
const envScene=new T.Scene();envScene.background=new T.Color(0x344a5d);for(const [x,y,z,color] of [[-8,9,0,0xdcf6ff],[8,5,2,0xffe0b0],[0,3,-10,0x78bfff]]){const p=new T.Mesh(new T.PlaneGeometry(7,17),new T.MeshBasicMaterial({color,side:T.DoubleSide}));p.position.set(x,y,z);p.lookAt(0,0,0);envScene.add(p);}const pmrem=new T.PMREMGenerator(renderer);const envMap=pmrem.fromScene(envScene,.02);scene.environment=envMap.texture;pmrem.dispose();
const world=new T.Group();scene.add(world);const objects=[],shots=[],hostile=[],effects=[];let aircraft,mode='loading',autoFire=true,muted=true,keys=new Set(),touch={x:0,y:0,fire:false};
let hp=5,score=0,coins=0,kills=0,distance=0,elapsed=0,level=1,speed=26,invuln=0,spawnTimer=0,shotTimer=0,noticeTimer=0,shake=0,best=0;
try{best=Number(localStorage.getItem('gyro-skystrike-best'))||0;}catch{}$('best').textContent=String(best).padStart(6,'0');
let poseView, poseLoad;
const gyro=new GyroController({onInterrupt:message=>{if(mode==='playing'){pause();$('pauseReason').textContent=message;}},onNotice:notice,onPanelVisibility:visible=>{
 if(poseView){poseView.setVisible(visible);return;}
 if(!visible||poseLoad)return;
 poseLoad=import('./gyro-view.js').then(({GyroPoseView})=>{
   poseView=new GyroPoseView($('gyroModel'),gyro);
   poseView.setVisible(gyro.selected && !$('gyroPanel').classList.contains('hidden'));
 }).catch(()=>{$('gyroModelState').textContent='3D 预览暂不可用，角度读数和操控仍可使用';poseLoad=null;});
}});
function permitFlight(){if(gyro.canFly)return true;notice(gyro.pauseMessage);return false;}
const player={x:0,y:5,z:7},range={x:10,yMin:2.6,yMax:11};
const materials={coin:new T.MeshStandardMaterial({color:0xffd16b,metalness:.85,roughness:.2,emissive:0x805015,emissiveIntensity:.5}),laser:new T.MeshBasicMaterial({color:0xaaffdf}),red:new T.MeshBasicMaterial({color:0xff5b69})};
const geo={coin:new T.TorusGeometry(.56,.15,6,14),shot:new T.CylinderGeometry(.06,.06,1.5,5),particle:new T.OctahedronGeometry(.14),enemyBullet:new T.SphereGeometry(.18,6,5)};
const islandMap=createIslandMap(scene);

let audio;function tone(freq,dur,type='sine',vol=.025){if(muted)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.45),audio.currentTime+dur);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur);}catch{}}
function notice(text){$('notice').textContent=text;$('notice').style.opacity=1;noticeTimer=2.5;}
function clearList(list){for(const o of list){world.remove(o.mesh);if(o.ownedMaterial)o.mesh.material.dispose();if(o.ownedEdges){o.ownedEdges.geometry.dispose();o.ownedEdges.material.dispose();}}list.length=0;}
function reset(){if(!permitFlight())return;for(const list of [objects,shots,hostile,effects])clearList(list);hp=5;score=coins=kills=distance=elapsed=0;islandMap.reset();level=1;speed=26;invuln=2;spawnTimer=.8;shotTimer=0;shake=0;player.x=0;player.y=5;keys.clear();touch.x=touch.y=0;touch.fire=false;mode='playing';document.body.classList.add('playing');$('overlay').classList.add('hidden');$('pauseOverlay').classList.add('hidden');$('endOverlay').classList.add('hidden');$('pause').disabled=false;aircraft.visible=true;aircraft.scale.setScalar(.24);aircraft.rotation.set(0,0,0);camera.position.set(0,11,22);$('hitflash').style.opacity=0;for(let i=0;i<7;i++)addCoin(Math.sin(i*.4)*.5,5,-28-i*3);addRock(-6,5,-57,1.8);addEnemy(0,5,-90);notice('进入群岛战区 · 沿金币航线穿越礁柱');updateHUD();tone(600,.2);}
function updateHUD(){$('score').textContent=String(Math.floor(score)).padStart(6,'0');$('coins').textContent=coins;[...$('health').children].forEach((e,i)=>e.classList.toggle('empty',i>=hp));$('sector').textContent=String(level).padStart(2,'0');$('speed').textContent=`${Math.round(speed*27.7)} KM/H`;$('alt').textContent=Math.round(1600+player.y*160);}
function end(){mode='over';document.body.classList.remove('playing');$('pause').disabled=true;const newBest=score>best;best=Math.max(best,Math.floor(score));try{localStorage.setItem('gyro-skystrike-best',best);}catch{}$('best').textContent=String(best).padStart(6,'0');$('report').innerHTML=`任务得分 <b>${Math.floor(score)}</b><br>拾取金币 <b>${coins}</b><br>击毁目标 <b>${kills}</b><br>飞行距离 <b>${(distance/1000).toFixed(2)} km</b><br>${newBest?'新纪录':'历史最佳'} <b>${best}</b>`;$('endOverlay').classList.remove('hidden');tone(100,.6,'sawtooth',.045);}
function pause(){if(mode==='playing'){$('pauseReason').textContent='准备好后继续任务。';mode='paused';keys.clear();touch.fire=false;touch.x=touch.y=0;$('thumb').style.transform='';$('pauseOverlay').classList.remove('hidden');document.body.classList.remove('playing');}else if(mode==='paused'){if(!permitFlight()){$('pauseReason').textContent=gyro.pauseMessage;return;}mode='playing';$('pauseOverlay').classList.add('hidden');document.body.classList.add('playing');}}
function returnLobby(){
 if(mode!=='paused')return;
 best=Math.max(best,Math.floor(score));try{localStorage.setItem('gyro-skystrike-best',best);}catch{}
 $('best').textContent=String(best).padStart(6,'0');
 for(const list of [objects,shots,hostile,effects])clearList(list);
 keys.clear();touch.x=touch.y=0;touch.fire=false;$('thumb').style.transform='';
 hp=5;score=coins=kills=distance=elapsed=0;islandMap.reset();level=1;speed=26;invuln=spawnTimer=shotTimer=shake=noticeTimer=0;
 player.x=0;player.y=5;mode='menu';menuTime=0;
 document.body.classList.remove('playing');$('pause').disabled=true;
 $('pauseOverlay').classList.add('hidden');$('endOverlay').classList.add('hidden');$('overlay').classList.remove('hidden');
 $('hitflash').style.opacity=0;$('notice').style.opacity=0;
 aircraft.visible=true;aircraft.scale.setScalar(.85);aircraft.position.set(3.2,5,0);aircraft.rotation.set(.12,Math.PI*.16,-.13);
 camera.position.set(12,15,23);camera.lookAt(0,4,-1);updateHUD();
 $('gyroClose').onclick();$('start').focus();
}
function toggleFire(){autoFire=!autoFire;$('fireMode').innerHTML=`◉ ${autoFire?'自动开火':'手动开火'} <span>${autoFire?'ON':'SPACE'}</span>`;$('fireMode').setAttribute('aria-pressed',autoFire);}
function particleBurst(pos,color,count=16){for(let i=0;i<count;i++){const mat=new T.MeshBasicMaterial({color,transparent:true});const mesh=new T.Mesh(geo.particle,mat);mesh.position.copy(pos);world.add(mesh);effects.push({mesh,ownedMaterial:true,life:.5+Math.random()*.4,vel:new T.Vector3((Math.random()-.5)*12,(Math.random()-.5)*10,(Math.random()-.5)*12)});}}
function damage(){if(invuln>0||mode!=='playing')return;hp--;invuln=1.7;shake=.4;tone(80,.25,'sawtooth',.08);particleBurst(new T.Vector3(player.x,player.y,player.z),0xffa765,10);notice(hp<=2?'机体受损 · 注意闪避':'受到撞击 · 护盾恢复中');if(hp<=0){end();updateHUD();}}
function addCoin(x,y,z){const mesh=new T.Mesh(geo.coin,materials.coin);mesh.position.set(x,y,z);world.add(mesh);objects.push({type:'coin',mesh,r:.9});}
function addRock(x,y,z,r=1.8){const stack=createSeaStack(x,y,z,r);world.add(stack.mesh);objects.push({type:'rock',...stack});}
function rockHeightHit(o,y,padding=0){return y>o.bottom-padding&&y<o.top+padding;}
function addEnemy(x,y,z){const mesh=createEnemyAircraft();mesh.position.set(x,y,z);world.add(mesh);objects.push({type:'enemy',mesh,r:1.15,hit:ENEMY_EXTENTS,hp:3+Math.min(3,level-1),baseX:x,phase:Math.random()*6.28,fire:2+Math.random()*2});}
function spawn(){const lane=(Math.floor(Math.random()*3)-1)*6;const y=4+Math.random()*5;
 for(let i=0;i<6;i++)addCoin(lane+Math.sin(i*.5)*.8,y,-100-i*3.6);
 const blocked=[-6,0,6].filter(x=>x!==lane);addRock(blocked[Math.floor(Math.random()*2)],3.5+Math.random()*5,-112,1.4+Math.random()*.8);
 if(elapsed>4)addEnemy(blocked[0],5+Math.random()*3,-133);
 if(level>=3)addRock(blocked[1],6+Math.random()*2,-139,1.5);
}
function fire(){for(const x of [-.62,.62]){const mesh=new T.Mesh(geo.shot,materials.laser);mesh.rotation.x=Math.PI/2;mesh.position.set(player.x+x,player.y,player.z-2);world.add(mesh);shots.push({mesh,life:1.6});}tone(720,.065,'triangle',.012);}
function removeObject(index){const o=objects[index];world.remove(o.mesh);if(o.ownedEdges){o.ownedEdges.geometry.dispose();o.ownedEdges.material.dispose();}objects.splice(index,1);}
function tick(dt){const motion=gyro.sample(dt);if(mode!=='playing'||(gyro.selected&&!gyro.fresh))return;elapsed+=dt;distance+=speed*dt;score+=dt*8;const next=1+Math.floor(elapsed/25);if(next!==level){level=next;notice(`进入第 ${level} 战区 · 威胁提升`);tone(900,.3);}speed=Math.min(48,26+(level-1)*3);invuln=Math.max(0,invuln-dt);shake=Math.max(0,shake-dt);$('hitflash').style.opacity=shake>0?shake*1.5:0;
 const dx=motion?motion.x:(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+touch.x;
 const dy=motion?motion.y:(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)+touch.y;
 player.x=clamp(player.x+clamp(dx,-1,1)*12*dt,-range.x,range.x);player.y=clamp(player.y+clamp(dy,-1,1)*9*dt,range.yMin,range.yMax);
 aircraft.position.set(player.x,player.y,player.z);aircraft.rotation.z=T.MathUtils.damp(aircraft.rotation.z,-dx*.32,8,dt);aircraft.rotation.x=T.MathUtils.damp(aircraft.rotation.x,dy*.12,8,dt);aircraft.visible=invuln>0?Math.floor(invuln*12)%2===0:true;
 camera.position.lerp(new T.Vector3(player.x*.38,player.y+6,22),1-Math.exp(-5*dt));camera.lookAt(player.x*.45,player.y+1,-24);if(shake){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;}
 spawnTimer-=dt;if(spawnTimer<=0){spawn();spawnTimer=Math.max(1.6,3.4-level*.15);}shotTimer-=dt;if((autoFire||keys.has('Space')||touch.fire)&&shotTimer<=0){fire();shotTimer=.14;}
 for(let i=shots.length-1;i>=0;i--){const s=shots[i];s.prevZ=s.mesh.position.z;s.mesh.position.z-=115*dt;s.life-=dt;let hit=false;for(let j=objects.length-1;j>=0;j--){const o=objects[j];if(o.type==='coin')continue;const p=o.mesh.position;if(Math.abs(p.x-s.mesh.position.x)<(o.hit?.x??o.r)&&(o.type==='rock'?rockHeightHit(o,s.mesh.position.y):Math.abs(p.y-s.mesh.position.y)<(o.hit?.y??o.r))&&p.z>=s.mesh.position.z-(o.hit?.z??o.r)&&p.z<=s.prevZ+(o.hit?.z??o.r)){hit=true;if(o.type==='enemy'){o.hp--;particleBurst(s.mesh.position,0xffcf8a,3);if(o.hp<=0){particleBurst(p,0xff7755,20);score+=200;kills++;tone(140,.22,'sawtooth',.035);for(let k=0;k<3;k++)addCoin(p.x+(k-1)*.8,p.y,p.z-k*1.2);removeObject(j);}}else particleBurst(s.mesh.position,0xffb66c,2);break;}}if(hit||s.life<=0){world.remove(s.mesh);shots.splice(i,1);}}
 for(let i=objects.length-1;i>=0;i--){const o=objects[i];const p=o.mesh.position;p.z+=speed*dt;if(o.type==='coin'){o.mesh.rotation.y+=dt*2.8;if(Math.hypot(p.x-player.x,p.y-player.y)<1.3&&Math.abs(p.z-player.z)<1.8){coins++;score+=25;tone(1300,.09,'sine',.025);particleBurst(p,0xffd16b,5);removeObject(i);continue;}}else{if(o.type==='enemy'){p.x=clamp(o.baseX+Math.sin(elapsed*1.2+o.phase)*(elapsed<8?.35:1.8),-10,10);o.mesh.rotation.z=Math.cos(elapsed*1.2+o.phase)*.16;o.fire-=dt;if(o.fire<0&&p.z<-8&&p.z>-85){const mesh=new T.Mesh(geo.enemyBullet,materials.red);mesh.position.copy(p);const vel=new T.Vector3(player.x,player.y,player.z).sub(p).normalize().multiplyScalar(38);world.add(mesh);hostile.push({mesh,vel,life:5});o.fire=Math.max(.9,2.5-level*.12);}}if((o.type==='rock'?(Math.abs(p.x-player.x)<o.r+.65&&rockHeightHit(o,player.y,.65)):o.hit?Math.hypot((p.x-player.x)/(o.hit.x+.65),(p.y-player.y)/(o.hit.y+.65))<1:Math.hypot(p.x-player.x,p.y-player.y)<o.r+.65)&&Math.abs(p.z-player.z)<(o.hit?.z??o.r)+1){damage();if(mode==='over')return;}}if(p.z>25)removeObject(i);}
 for(let i=hostile.length-1;i>=0;i--){const b=hostile[i];b.mesh.position.addScaledVector(b.vel,dt);b.life-=dt;if(b.mesh.position.distanceTo(new T.Vector3(player.x,player.y,player.z))<.9){damage();b.life=0;if(mode==='over')return;}if(b.life<=0||b.mesh.position.z>30){world.remove(b.mesh);hostile.splice(i,1);}}
 for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;e.mesh.position.addScaledVector(e.vel,dt);e.mesh.material.opacity=Math.max(0,e.life);if(e.life<=0){world.remove(e.mesh);e.mesh.material.dispose();effects.splice(i,1);}}
 islandMap.update(distance,elapsed);
 updateHUD();}
async function boot(){try{const response=await fetch('assets/airplane-f22.glb');if(!response.ok)throw Error(`HTTP ${response.status}`);aircraft=parseAircraft(await response.arrayBuffer());scene.add(aircraft);aircraft.scale.setScalar(.85);mode='menu';$('start').disabled=false;$('start').innerHTML='开始出击 <span>↗</span>';animate();}catch(e){$('loadError').classList.remove('hidden');$('loadError').textContent='模型加载失败。请通过本地 HTTP 服务打开游戏，并确认 assets/airplane-f22.glb 存在。'+e.message;}}
let last=performance.now(),menuTime=0;function animate(now=performance.now()){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.033);last=now;if(mode==='playing')tick(dt);else if(mode==='menu'){menuTime+=dt;islandMap.update(0,menuTime);aircraft.visible=true;aircraft.position.set(3.2,5+Math.sin(menuTime*.8)*.2,0);aircraft.rotation.set(.12,Math.PI*.16+Math.sin(menuTime*.18)*.12,-.13);camera.position.set(12,15,23);camera.lookAt(0,4,-1);}if(noticeTimer>0){noticeTimer-=dt;if(noticeTimer<=0)$('notice').style.opacity=0;}renderer.render(scene,camera);}
$('start').onclick=$('restart').onclick=reset;$('pause').onclick=$('resume').onclick=pause;$('returnLobby').onclick=returnLobby;$('fireMode').onclick=toggleFire;$('sound').onclick=()=>{muted=!muted;$('sound').textContent=`音效 ${muted?'OFF':'ON'}`;$('sound').setAttribute('aria-label',muted?'开启音效':'关闭音效');tone(700,.15);};
window.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,#gyroPanel'))return;if(e.target.tagName==='BUTTON'&&e.code==='Space'&&mode!=='playing')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='KeyP'||e.code==='Escape'){if(!e.repeat)pause();return;}if(e.code==='KeyF'&&!e.repeat)toggleFire();if(mode==='playing')keys.add(e.code);});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(mode==='playing')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')pause();});
const stick=$('stick');let stickId=null;function stickMove(e){const r=stick.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,mag=Math.max(1,Math.hypot(x,y)/40);touch.x=x/mag/40;touch.y=-y/mag/40;$('thumb').style.transform=`translate(${touch.x*32}px,${-touch.y*32}px)`;}stick.onpointerdown=e=>{stickId=e.pointerId;stick.setPointerCapture(e.pointerId);stickMove(e);};stick.onpointermove=e=>{if(e.pointerId===stickId)stickMove(e);};stick.onpointerup=stick.onpointercancel=()=>{stickId=null;touch.x=touch.y=0;$('thumb').style.transform='';};$('touchFire').onpointerdown=e=>{touch.fire=true;e.target.setPointerCapture(e.pointerId);};$('touchFire').onpointerup=$('touchFire').onpointercancel=()=>touch.fire=false;
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
boot();
