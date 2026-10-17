import * as T from './vendor/three.module.js';
const up=new T.Vector3(0,1,0),direction=new T.Vector3(),aim=new T.Vector3(),offset=new T.Vector3(),matrix=new T.Matrix4();
// 远处目标仅降低决策频率，运动和碰撞仍逐物理步更新。
export function updateEnemy(enemy,dt,player,elapsed){
 enemy.previous.copy(enemy.mesh.position);enemy.decision-=dt;enemy.fire-=dt;
 const distance=enemy.mesh.position.distanceTo(player);
 if(enemy.decision<=0){
  enemy.decision=distance>500?.3:.08;
  if(enemy.state==='evade'&&elapsed<enemy.evadeUntil){aim.copy(enemy.mesh.position).addScaledVector(enemy.escape,250);}
  else if(distance<40){enemy.state='evade';enemy.evadeUntil=elapsed+2.2;enemy.escape.subVectors(enemy.mesh.position,player).normalize();aim.copy(enemy.mesh.position).addScaledVector(enemy.escape,250);}
  else if(distance<420){enemy.state='pursue';aim.copy(player);}
  else{enemy.state='patrol';aim.copy(enemy.home).add(offset.set(Math.sin(elapsed*.15+enemy.phase)*110,Math.sin(elapsed*.1)*25,Math.cos(elapsed*.15+enemy.phase)*110));}
  aim.y=Math.max(75,Math.min(400,aim.y));matrix.lookAt(enemy.mesh.position,aim,up);enemy.target.setFromRotationMatrix(matrix);
 }
 enemy.mesh.quaternion.rotateTowards(enemy.target,dt*.85);direction.set(0,0,-1).applyQuaternion(enemy.mesh.quaternion);
 enemy.mesh.position.copy(enemy.previous).addScaledVector(direction,(enemy.state==='patrol'?46:62)*dt);
 aim.subVectors(player,enemy.mesh.position).normalize();
 if(distance<320&&distance>20&&direction.dot(aim)>.94&&enemy.fire<=0){enemy.state='attack';enemy.fire=2.6;return true;}return false;
}
