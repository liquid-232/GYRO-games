import * as T from './vendor/three.module.js';
// 空战按三波推进。波次结算先切换状态，再写存档，避免重复奖励。
export class FreeSortie {
 constructor(session){this.session=session;this.point=new T.Vector3();this.reset();}
 reset(){this.active=false;this.wave=0;this.wait=0;this.state='idle';this.reward=0;this.defeated=0;}
 start(){this.reset();this.active=true;this.wait=2;this.state='incoming';}
 update(dt){
  if(!this.active)return;const s=this.session;
  if(this.state==='combat'&&!s.enemies.some(e=>e.alive&&e.role==='ace')){
   const amount=100+50*(this.wave-1);this.state='incoming';this.wait=4;this.reward+=amount;s.progress.reward(amount);s.hp=Math.min(s.progress.health,s.hp+2);s.cooldown=0;
   s.notify(`第 ${this.wave} 波清除 · +${amount} 摩拉 · 修复两格装甲`);
   if(this.wave===3){this.active=false;this.state='complete';this.reward+=300;s.progress.reward(300,true);for(const b of s.bullets){b.alive=false;b.mesh.visible=false;}s.openPanel('sortie');return;}
  }
  if(this.state!=='incoming')return;this.wait-=dt;if(this.wait>0)return;
  this.wave++;this.state='combat';const count=[3,4,6][this.wave-1],f=s.flight;
  for(let i=0;i<count;i++){
   this.point.copy(f.position).addScaledVector(f.forward,220+i*16).addScaledVector(f.right,(i-(count-1)/2)*50);
   const radius=Math.hypot(this.point.x,this.point.z);if(radius>950){this.point.x*=950/radius;this.point.z*=950/radius;}
   this.point.y=Math.max(s.map.heightAt(this.point.x,this.point.z)+80,Math.min(330,f.position.y+(i%2)*30));
   const enemy=s.spawnEnemy(this.point,'ace');enemy.hp=this.wave===1?4:6;enemy.fire=3+i*.6;enemy.mesh.quaternion.copy(f.attitude);enemy.target.copy(f.attitude);
  }
  s.notify(`第 ${this.wave}/3 波 · ${count} 架敌机 · 将目标带入绿色锁定圈，Q 齐射`);
 }
 get description(){if(this.state==='complete')return '三波挑战完成';if(this.state==='incoming')return `第 ${this.wave+1}/3 波 · ${Math.max(1,Math.ceil(this.wait))} 秒后接敌`;return `王牌空战 ${this.wave}/3 · 剩余 ${this.session.enemies.filter(e=>e.alive&&e.role==='ace').length} 架`;}
}
