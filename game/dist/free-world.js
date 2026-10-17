import * as T from './vendor/three.module.js';
import { FreeFlight, segmentSphere, terrainHit } from './free-flight.js';
import { FreeProgress } from './free-progress.js';
import { FreeMissions, CONTRACTS } from './free-missions.js';
import { updateEnemy } from './free-enemies.js';
import { FreeHUD } from './free-hud.js';
import { createIslandMap } from './island-map.js';
import { createEnemyAircraft } from './enemy-model.js';
import { createPlayerMissile, animateEnemyMissile } from './missile-model.js';
import { createCannonEffects } from './cannon-effects.js';
import { createParticleSystem } from './particle-system.js';
import { createMoraCoin } from './coin-model.js';
const Y=new T.Vector3(0,1,0);
// 渲染对象在装载时建池；重开任务只重置状态，不重复分配几何与材质。
export class FreeWorld {
 constructor({scene,camera,aircraft,notify,onShot,onKill,onPause,onResume,onEnd,canAct}){
  Object.assign(this,{scene,camera,aircraft,notify,onShot,onKill,onPause,onResume,onEnd,canAct});
  this.root=new T.Group();this.root.name='Free flight world';scene.add(this.root);this.map=createIslandMap(this.root,{fixed:true});
  this.flight=new FreeFlight();this.scratch=new T.Vector3();this.project=new T.Vector3();this.delta=new T.Vector3();this.relative=new T.Vector3();this.previousRelative=new T.Vector3();this.matrix=new T.Matrix4();this.rotation=new T.Quaternion();
  this.base=new T.Vector3(0,100,700);this.goal=new T.Vector3();this.touchThrottle={boost:false,brake:false};
  this.enabled=false;this.active=false;this.panel=null;this.storageWarning='';
  let storage;try{storage=localStorage;}catch{storage={getItem(){throw Error('storage');}};}
  this.progress=new FreeProgress(storage,message=>{this.storageWarning=message;notify(message);});
  this.missions=new FreeMissions(this.progress,notify);this.hud=new FreeHUD(this);
  this.cannon=createCannonEffects(this.root);this.particleGeometry=new T.OctahedronGeometry(.22);this.particles=createParticleSystem(this.root,this.particleGeometry,384);
  this.targets=[];this.enemies=[];
  for(let i=0;i<6;i++){
   const mesh=new T.Group(),body=createEnemyAircraft();body.rotation.y=Math.PI;mesh.add(body);mesh.scale.setScalar(1.8);mesh.visible=false;this.root.add(mesh);
   const enemy={mesh,alive:false,role:'patrol',hp:6,radius:4.2,previous:new T.Vector3(),home:new T.Vector3(),target:new T.Quaternion(),escape:new T.Vector3(),state:'patrol',decision:0,fire:2,phase:i*1.7};
   this.enemies.push(enemy);this.targets.push(enemy);
  }
  const armor=new T.MeshStandardMaterial({color:0x637a79,metalness:.5,roughness:.6}),lamp=new T.MeshBasicMaterial({color:0xff7755});
  const cube=new T.BoxGeometry(1,1,1),dish=new T.SphereGeometry(1,12,8,0,Math.PI*2,0,Math.PI/2);
  this.ownedMaterials=[armor,lamp];this.ownedGeometry=[cube,dish];
  this.facilities=[];
  for(let i=0;i<3;i++){
   const mesh=new T.Group(),body=new T.Mesh(cube,armor);body.scale.set(i===2?13:7,i===2?12:5,i===2?13:7);body.position.y=i===2?6:2.5;mesh.add(body);
   const top=new T.Mesh(i===2?dish:cube,i===2?armor:lamp);top.scale.set(i===2?10:1.4,i===2?7:1.4,i===2?10:8);top.position.set(0,i===2?17:6,-2);mesh.add(top);
   mesh.visible=false;this.root.add(mesh);const facility={mesh,alive:false,role:i===2?'radar':'turret',radius:i===2?16:7,hp:i===2?24:12,previous:new T.Vector3(),fire:0};
   this.facilities.push(facility);this.targets.push(facility);
  }
  // 运输机使用独立简化网格，绿色航灯和宽翼与敌机区分。
  const transportMesh=new T.Group(),transportMaterial=new T.MeshStandardMaterial({color:0xc8d8cf,metalness:.45,roughness:.5}),green=new T.MeshBasicMaterial({color:0x70ffd1});
  for(const [x,y,z,sx,sy,sz,mat] of [[0,0,0,3,3,17,transportMaterial],[0,0,1,23,.6,4,transportMaterial],[0,2,6,.7,5,3,transportMaterial],[-11,0,1,1,1,1,green],[11,0,1,1,1,1,green]]){const part=new T.Mesh(cube,mat);part.position.set(x,y,z);part.scale.set(sx,sy,sz);transportMesh.add(part);}
  this.ownedMaterials.push(transportMaterial,green);this.root.add(transportMesh);transportMesh.visible=false;
  this.transport={mesh:transportMesh,alive:false,role:'transport',radius:7,hp:12,previous:new T.Vector3()};this.targets.push(this.transport);
  this.route=[new T.Vector3(-180,140,200),new T.Vector3(200,140,-50),new T.Vector3(450,140,-500)];
  this.rounds=Array.from({length:64},()=>({mesh:this.cannon.createTracer(),alive:false,velocity:new T.Vector3(),previous:new T.Vector3(),life:0}));this.visibleRounds=[];
  const bulletGeometry=new T.SphereGeometry(.7,6,4),bulletMaterial=new T.MeshBasicMaterial({color:0xff793f});this.ownedGeometry.push(bulletGeometry);this.ownedMaterials.push(bulletMaterial);
  this.bullets=Array.from({length:24},()=>{const mesh=new T.Mesh(bulletGeometry,bulletMaterial);mesh.visible=false;this.root.add(mesh);return {mesh,alive:false,velocity:new T.Vector3(),previous:new T.Vector3(),life:0};});
  this.missiles=Array.from({length:2},()=>{const mesh=new T.Group(),body=createPlayerMissile(new T.Vector3(0,0,1));body.rotation.y=Math.PI;mesh.add(body);mesh.visible=false;this.root.add(mesh);return {mesh,alive:false,previous:new T.Vector3(),direction:new T.Vector3(),target:null,age:0};});
  this.coins=Array.from({length:36},()=>{const mesh=createMoraCoin();mesh.visible=false;mesh.scale.setScalar(2);this.root.add(mesh);return {mesh,alive:false,life:0};});
  this.ring=new T.Mesh(new T.TorusGeometry(55,1,6,48),new T.MeshBasicMaterial({color:0x64e6ff}));this.ring.position.copy(this.base);this.root.add(this.ring);
  this.ownedGeometry.push(this.ring.geometry);this.ownedMaterials.push(this.ring.material);
  this.root.visible=false;
 }
 setQuality(profile){this.map.setQuality(profile);}
 // 预热池中的隐藏对象，首次交火不会临时创建网格或编译武器材质。
 async prepare(renderer){
  const visible=this.root.visible;this.root.visible=true;const saved=[];
  for(const object of [...this.targets,...this.bullets,...this.missiles,...this.coins]){saved.push([object.mesh,object.mesh.visible]);object.mesh.visible=true;}
  const tracer=this.rounds[0].mesh;this.root.add(tracer);
  try{await renderer.compileAsync(this.scene,this.camera);if(renderer.initTexture)this.root.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)for(const value of Object.values(m))if(value?.isTexture)renderer.initTexture(value);});}
  finally{this.root.remove(tracer);for(const [mesh,on]of saved)mesh.visible=on;this.root.visible=visible;}
 }
 start(){
  this.clear();this.active=true;this.root.visible=true;this.flight.reset();this.hp=this.progress.health;this.elapsed=0;this.kills=0;this.score=0;this.cooldown=0;this.shotTimer=0;this.invulnerable=2;this.supplyTime=0;this.supplyLatched=false;this.side=-1;
  this.camera.far=6500;this.camera.updateProjectionMatrix();this.scene.fog=new T.FogExp2(0x78979e,.00065);
  this.aircraft.scale.setScalar(.24);this.aircraft.visible=true;this.aircraft.position.copy(this.flight.position);this.aircraft.quaternion.copy(this.flight.attitude);
  this.flight.cameraReady=false;this.flight.camera(this.camera,1/30,this.bodyCamera);this.hud.visible(true);this.hud.panel(null);
  this.spawnEnemy(new T.Vector3(-350,140,120),'patrol');this.spawnEnemy(new T.Vector3(350,150,-200),'patrol');
  this.notify('自由海岛 · M 接任务 · R 摆平 · 蓝色圆环为基地补给');
 }
 clear(){
  for(const pool of [this.targets,this.rounds,this.bullets,this.missiles,this.coins])for(const object of pool){object.alive=false;object.mesh.visible=false;}
  this.visibleRounds.length=0;this.missions.reset();this.cannon.clear();this.particles.clear();this.panel=null;this.touchThrottle.boost=this.touchThrottle.brake=false;
 }
 stop(){this.clear();this.active=false;this.root.visible=false;this.hud.panel(null);this.hud.visible(false);this.camera.up.set(0,1,0);this.camera.far=700;this.camera.updateProjectionMatrix();document.getElementById('health').innerHTML='<i></i>'.repeat(5);document.getElementById('reticle').style.left='';document.getElementById('reticle').style.top='';}
 openPanel(kind){if(!this.canAct()||!this.active||this.panel)return;this.panel=kind;this.touchThrottle.boost=this.touchThrottle.brake=false;this.onPause();if(kind==='supply')this.hp=this.progress.health;this.hud.panel(kind);}
 closePanel(){if(!this.panel)return;this.panel=null;this.hud.panel(null);this.onResume();}
 accept(kind){if(this.missions.accept(kind)){this.clearCombat();this.closePanel();}}
 clearCombat(){for(const t of this.targets){t.alive=false;t.mesh.visible=false;}for(const b of [...this.bullets,...this.missiles]){b.alive=false;b.mesh.visible=false;}}
 abandon(){this.missions.fail();this.clearCombat();}
 spawnEnemy(position,role,missionId=0){const enemy=this.enemies.find(e=>!e.alive);if(!enemy)return null;Object.assign(enemy,{alive:true,role,missionId,hp:6,state:'patrol',decision:0,fire:2,evadeUntil:0});enemy.home.copy(position);enemy.mesh.position.copy(position);enemy.previous.copy(position);enemy.mesh.quaternion.identity();enemy.target.identity();enemy.mesh.visible=true;return enemy;}
 waypoint(){const m=this.missions.active;if(!m)return this.base;if(m.kind==='escort'&&m.stage==='active'&&this.transport.alive)return this.transport.mesh.position;this.goal.fromArray(CONTRACTS[m.kind].point);if(m.kind==='strike')this.goal.y=this.map.heightAt(this.goal.x,this.goal.z)+25;return this.goal;}
 activateMission(){
  const m=this.missions.active;if(!m||!this.missions.arrive())return;const point=new T.Vector3().fromArray(CONTRACTS[m.kind].point);
  if(m.kind==='intercept')for(let i=0;i<3;i++)this.spawnEnemy(point.clone().add(new T.Vector3((i-1)*60,i*15,i*45)),'interceptor',m.id);
  if(m.kind==='strike')for(let i=0;i<3;i++){const t=this.facilities[i];t.mesh.position.set(point.x+(i-1)*30,0,point.z+(i===1?-35:0));t.mesh.position.y=this.map.heightAt(t.mesh.position.x,t.mesh.position.z);t.previous.copy(t.mesh.position);Object.assign(t,{alive:true,hp:i===2?24:12,missionId:m.id,fire:1+i});t.mesh.visible=true;}
  if(m.kind==='escort'){const t=this.transport;t.alive=true;t.hp=12;t.mesh.position.copy(point);t.previous.copy(point);t.mesh.visible=true;this.spawnEscortWave();}
  this.notify(m.kind==='strike'?'先摧毁两座炮台，解除雷达护盾':m.kind==='escort'?'已与运输机会合 · 清除来袭敌机':'发现巡逻编队 · 准备交战');
 }
 spawnEscortWave(){const m=this.missions.active;if(!m||m.waves>=2)return;m.waves++;for(let i=0;i<2;i++)this.spawnEnemy(this.transport.mesh.position.clone().add(new T.Vector3(i?180:-180,50,-170)),'escortAttacker',m.id);}
 lockTarget(){
  let best=null,value=Infinity;const f=this.flight;
  for(const t of this.targets){if(!t.alive||t.role==='transport'||(t.role==='radar'&&this.facilities.some(v=>v.role==='turret'&&v.alive)))continue;
   this.delta.subVectors(t.mesh.position,f.position);const d=this.delta.length();if(d<8||d>520||this.delta.dot(f.forward)/d<.82)continue;const rank=d*(2-this.delta.dot(f.forward)/d);if(rank<value){best=t;value=rank;}}
  return best;
 }
 launch(){
  if(!this.canAct()||this.cooldown>0)return;const target=this.lockTarget(),m=this.missiles.find(v=>!v.alive);if(!target||!m)return;
  this.side=-this.side;m.mesh.position.set(this.side*1.5,-.5,.5).applyQuaternion(this.flight.attitude).add(this.flight.position);m.mesh.quaternion.copy(this.flight.attitude);m.direction.copy(this.flight.forward);m.target=target;m.age=0;m.alive=true;m.mesh.visible=true;m.mesh.getObjectByName('missile-exhaust').visible=false;this.cooldown=this.progress.cooldown;
 }
 fire(){for(const side of [-1,1]){const r=this.rounds.find(s=>!s.alive);if(!r)break;r.alive=true;r.life=2;r.mesh.visible=true;this.cannon.muzzlePosition(side,this.flight.position,this.flight.attitude,r.mesh.position);r.mesh.quaternion.copy(this.flight.attitude);r.velocity.copy(this.flight.forward).multiplyScalar(320+this.flight.speed);}this.cannon.trigger();this.onShot?.();}
 enemyFire(enemy,target){const b=this.bullets.find(v=>!v.alive);if(!b)return;b.alive=true;b.mesh.visible=true;b.mesh.position.copy(enemy.mesh.position);if(enemy.role==='turret')b.mesh.position.y+=8;b.velocity.subVectors(target,b.mesh.position).normalize().multiplyScalar(175);b.life=4;}
 hit(target,damage){
  if(!target.alive)return;
  if(target.role==='radar'&&this.facilities.some(t=>t.role==='turret'&&t.alive)){this.particles.burst(target.mesh.position,0x66cfff,3);return;}
  target.hp-=damage;this.particles.burst(target.mesh.position,0xffad62,3);if(target.hp>0)return;
  target.alive=false;target.mesh.visible=false;this.onKill?.();this.particles.burst(target.mesh.position,0xffb963,24);
  if(target.role==='transport'){this.missions.fail('运输机被击毁');this.clearCombat();return;}
  this.kills++;this.score+=200;
  for(let i=0;i<3;i++){const c=this.coins.find(v=>!v.alive);if(!c)break;c.alive=true;c.life=35;c.mesh.visible=true;c.mesh.position.copy(target.mesh.position).add(new T.Vector3((i-1)*5,2,0));}
  this.missions.destroyed(target.role,target.missionId);
 }
 damage(amount=1,crash=false){if(!this.canAct()||(!crash&&this.invulnerable>0))return;this.hp-=crash?this.hp:amount;this.invulnerable=1.7;this.particles.burst(this.flight.position,0xff7755,12);if(this.hp<=0){this.hp=0;this.missions.fail('本次出击结束');this.onEnd({kills:this.kills,score:this.score,balance:this.progress.data.balance,distance:this.flight.distance});}else this.notify('机体受损 · 基地可免费维修');}
 tick(dt,input){
  if(!this.canAct())return false;this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.invulnerable=Math.max(0,this.invulnerable-dt);
  this.flight.update(dt,{...input,boost:input.boost||this.touchThrottle.boost,brake:input.brake||this.touchThrottle.brake});
  if(terrainHit(this.flight.previous,this.flight.position,(x,z)=>this.map.heightAt(x,z),1.2)!==null){this.damage(1,true);return false;}
  this.aircraft.position.copy(this.flight.position);this.aircraft.quaternion.copy(this.flight.attitude);this.aircraft.visible=this.invulnerable<=0||Math.floor(this.invulnerable*12)%2===0;
  this.flight.camera(this.camera,dt,this.bodyCamera);this.shotTimer-=dt;if(input.fire&&this.shotTimer<=0){this.fire();this.shotTimer=.14;}
  let mission=this.missions.active;
  if(mission?.stage==='travel'&&this.flight.position.distanceTo(this.waypoint())<(mission.kind==='escort'?220:360))this.activateMission();
  for(const enemy of this.enemies)if(enemy.alive){const target=enemy.role==='escortAttacker'&&this.transport.alive?this.transport.mesh.position:this.flight.position;if(updateEnemy(enemy,dt,target,this.elapsed))this.enemyFire(enemy,target);}
  for(const t of this.facilities)if(t.alive){t.fire-=dt;if(t.role==='turret'&&t.fire<=0&&t.mesh.position.distanceTo(this.flight.position)<430){this.enemyFire(t,this.flight.position);t.fire=2.4;}}
  mission=this.missions.active;
  if(this.transport.alive&&mission?.kind==='escort'){
   const t=this.transport;t.previous.copy(t.mesh.position);const point=this.route[Math.min(mission.waypoint,2)];
   this.delta.subVectors(point,t.mesh.position);const d=this.delta.length();
   if(d>8){this.matrix.lookAt(t.mesh.position,point,Y);this.rotation.setFromRotationMatrix(this.matrix);t.mesh.quaternion.rotateTowards(this.rotation,dt);t.mesh.position.addScaledVector(this.delta.normalize(),Math.min(35*dt,d));}
   else if(mission.waypoint<3){mission.waypoint++;if(mission.waypoint===1)this.spawnEscortWave();}
   if(mission.waypoint>=3&&!this.enemies.some(e=>e.alive&&e.missionId===mission.id)){this.missions.complete();t.alive=false;t.mesh.visible=false;}
  }
  for(const round of this.rounds)if(round.alive){round.previous.copy(round.mesh.position);round.mesh.position.addScaledVector(round.velocity,dt);round.life-=dt;if(this.hitSegment(round.previous,round.mesh.position,this.progress.damage)||round.life<=0){round.alive=false;round.mesh.visible=false;}}
  for(const missile of this.missiles)if(missile.alive){
   missile.previous.copy(missile.mesh.position);missile.age+=dt;
   if(missile.age<.35){missile.mesh.position.addScaledVector(missile.direction,this.flight.speed*dt);missile.mesh.position.y-=3*dt;}
   else{
    if(!missile.target?.alive)missile.target=this.lockTarget();
    if(missile.target?.alive){this.delta.copy(missile.target.mesh.position);if(missile.target.previous)this.delta.addScaledVector(this.scratch.subVectors(missile.target.mesh.position,missile.target.previous),.3/Math.max(dt,.001));this.matrix.lookAt(missile.mesh.position,this.delta,Y);this.rotation.setFromRotationMatrix(this.matrix);missile.mesh.quaternion.rotateTowards(this.rotation,3.5*dt);}
    missile.direction.set(0,0,-1).applyQuaternion(missile.mesh.quaternion);missile.mesh.position.addScaledVector(missile.direction,Math.min(230,80+(missile.age-.35)*180)*dt);missile.mesh.getObjectByName('missile-exhaust').visible=true;animateEnemyMissile(missile.mesh,missile.age,0);
   }
   if(this.hitSegment(missile.previous,missile.mesh.position,8)||missile.age>6){missile.alive=false;missile.mesh.visible=false;}
  }
  for(const bullet of this.bullets)if(bullet.alive){
   bullet.previous.copy(bullet.mesh.position);bullet.mesh.position.addScaledVector(bullet.velocity,dt);bullet.life-=dt;
   this.previousRelative.subVectors(bullet.previous,this.flight.previous);this.relative.subVectors(bullet.mesh.position,this.flight.position);
   const playerHit=segmentSphere(this.previousRelative,this.relative,this.scratch.set(0,0,0),2);
   let transportHit=null;if(this.transport.alive){this.previousRelative.subVectors(bullet.previous,this.transport.previous);this.relative.subVectors(bullet.mesh.position,this.transport.mesh.position);transportHit=segmentSphere(this.previousRelative,this.relative,this.scratch.set(0,0,0),7);}
   const groundHit=terrainHit(bullet.previous,bullet.mesh.position,(x,z)=>this.map.heightAt(x,z),.2);
   const nearest=Math.min(playerHit??Infinity,transportHit??Infinity,groundHit??Infinity);
   if(Number.isFinite(nearest)){if(nearest===groundHit){/* 山体先拦截弹丸。 */}else if(nearest===playerHit)this.damage();else this.hit(this.transport,1);bullet.life=0;}
   if(bullet.life<=0){bullet.alive=false;bullet.mesh.visible=false;}
  }
  if(!this.canAct())return false;
  for(const target of this.targets)if(target.alive){this.previousRelative.subVectors(this.flight.previous,target.previous);this.relative.subVectors(this.flight.position,target.mesh.position);if(segmentSphere(this.previousRelative,this.relative,this.scratch.set(0,0,0),target.radius+1.3)!==null){this.damage(1,target.role==='radar'||target.role==='turret');if(!this.canAct())return false;}}
  for(const c of this.coins)if(c.alive){c.life-=dt;c.mesh.rotation.y+=dt*2;this.delta.subVectors(this.flight.position,c.mesh.position);const d=this.delta.length();if(d<40)c.mesh.position.addScaledVector(this.delta.normalize(),Math.min(d,150*dt));if(d<7){this.progress.reward(25);c.life=0;}if(c.life<=0){c.alive=false;c.mesh.visible=false;}}
  const baseDistance=this.flight.position.distanceTo(this.base);if(baseDistance>85)this.supplyLatched=false;
  if(baseDistance<60&&this.flight.speed<42&&!this.supplyLatched){this.supplyTime+=dt;if(this.supplyTime>=3){this.supplyLatched=true;this.supplyTime=0;this.openPanel('supply');}}else this.supplyTime=0;
  this.map.update(0,this.elapsed);this.particles.update(dt);this.cannon.update(dt);return this.canAct();
 }
 hitSegment(a,b,damage){
  let nearest=terrainHit(a,b,(x,z)=>this.map.heightAt(x,z),.12),target=null;
  for(const t of this.targets){if(!t.alive||t.role==='transport')continue;this.previousRelative.subVectors(a,t.previous);this.relative.subVectors(b,t.mesh.position);const f=segmentSphere(this.previousRelative,this.relative,this.scratch.set(0,0,0),t.radius);if(f!==null&&(nearest===null||f<nearest)){nearest=f;target=t;}}
  if(target)this.hit(target,damage);return nearest!==null;
 }
 render(now){if(!this.active)return;this.visibleRounds.length=0;for(const round of this.rounds)if(round.alive)this.visibleRounds.push(round);this.cannon.flush(this.flight.position,this.flight.attitude,true,this.visibleRounds);this.particles.flush();this.hud.update(now);this.hud.weapon();}
 dispose(){this.stop();this.map.dispose();this.cannon.dispose();this.particles.dispose();this.particleGeometry.dispose();for(const geometry of this.ownedGeometry)geometry.dispose();for(const material of this.ownedMaterials)material.dispose();this.scene.remove(this.root);this.hud.host.remove();}
}
