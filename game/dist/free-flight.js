import * as T from './vendor/three.module.js';

// 自由飞行使用米、秒和局部 -Z 机头；辅助模式直接控制转向，特技模式提供角速度，不依赖绝对偏航。
export const FLIGHT = Object.freeze({cruise:70,boost:115,brake:32,rollRate:2.3,pitchRate:1.35,boundary:1200,ceiling:600});
const X=new T.Vector3(1,0,0),Y=new T.Vector3(0,1,0);
export class FreeFlight {
 constructor(){this.assistEuler=new T.Euler(0,0,0,'YXZ');this.travelDirection=new T.Vector3(0,0,-1);this.position=new T.Vector3();this.previous=new T.Vector3();this.attitude=new T.Quaternion();this.forward=new T.Vector3();this.previousForward=new T.Vector3();this.angular=new T.Vector3();this.up=new T.Vector3();this.right=new T.Vector3();this.rotation=new T.Quaternion();this.target=new T.Quaternion();this.matrix=new T.Matrix4();this.flat=new T.Vector3();this.cameraRight=new T.Vector3(1,0,0);this.cameraUp=new T.Vector3(0,1,0);this.cameraPosition=new T.Vector3();this.cameraTarget=new T.Vector3();this.reset();}
 reset(){this.position.set(0,90,820);this.previous.copy(this.position);this.attitude.identity();this.speed=FLIGHT.cruise;this.distance=0;this.returning=false;this.leveling=false;this.cameraReady=false;this.cameraRight.set(1,0,0);this.cameraUp.set(0,1,0);this.axes();this.travelDirection.copy(this.forward);this.groundAssist=false;}
 axes(){this.forward.set(0,0,-1).applyQuaternion(this.attitude);this.up.copy(Y).applyQuaternion(this.attitude);this.right.copy(X).applyQuaternion(this.attitude);}
 level(){this.leveling=true;}
 update(dt,input={}){
  this.previous.copy(this.position);this.axes();this.previousForward.copy(this.forward);const previousRightY=this.right.y;this.groundAssist=false;
  const radius=Math.hypot(this.position.x,this.position.z);
  if(radius>FLIGHT.boundary||this.position.y>FLIGHT.ceiling)this.returning=true;
  if(this.returning){
   this.flat.set(-this.position.x,Math.max(-.3,Math.min(.3,(130-this.position.y)/400))*Math.max(radius,1),-this.position.z).normalize();
   this.matrix.lookAt(this.position,this.cameraTarget.copy(this.position).add(this.flat),Y);this.target.setFromRotationMatrix(this.matrix);
   this.attitude.rotateTowards(this.target,1.8*dt);
   if(radius<1080&&this.position.y<550)this.returning=false;
  }else if(this.leveling){
   this.flat.set(this.forward.x,0,this.forward.z);if(this.flat.lengthSq()<.001)this.flat.set(0,0,-1);this.flat.normalize();
   this.matrix.lookAt(this.position,this.cameraTarget.copy(this.position).add(this.flat),Y);this.target.setFromRotationMatrix(this.matrix);
   this.attitude.rotateTowards(this.target,2.5*dt);if(this.attitude.angleTo(this.target)<.01)this.leveling=false;
  }else if(input.assisted){
   // 新手左右输入直接改变航向，抬头输入决定爬升角；松手平滑回到平飞。
   const turn=T.MathUtils.clamp(input.roll||0,-1,1),pitch=T.MathUtils.clamp(input.pitch||0,-1,1);
   const yaw=Math.atan2(-this.forward.x,-this.forward.z);
   let elevation=pitch*.72;this.groundAssist=Number.isFinite(input.safeFloor)&&this.position.y<input.safeFloor;
   if(this.groundAssist)elevation=Math.max(elevation,.72);
   this.assistEuler.set(elevation,yaw,-turn*(input.brake?1:.65),'YXZ');
   this.target.setFromEuler(this.assistEuler);this.attitude.slerp(this.target,1-Math.exp(-12*dt));this.attitude.premultiply(this.rotation.setFromAxisAngle(Y,-turn*(input.brake?2.15:1.1)*dt));
  }else{
   this.groundAssist=false;
   this.angular.set(T.MathUtils.clamp(input.pitch||0,-1,1)*FLIGHT.pitchRate,0,-T.MathUtils.clamp(input.roll||0,-1,1)*FLIGHT.rollRate);
   const angularSpeed=this.angular.length();if(angularSpeed>0)this.attitude.multiply(this.rotation.setFromAxisAngle(this.angular.divideScalar(angularSpeed),angularSpeed*dt));
   // 协调转弯绕世界竖轴发生；倒飞仍允许连续滚转和俯仰。
   this.axes();const headingRate=(previousRightY+this.right.y)*.5*.62*Math.hypot(this.forward.x,this.forward.z);
   this.attitude.premultiply(this.rotation.setFromAxisAngle(Y,headingRate*dt));
  }
  this.attitude.normalize();this.axes();
  const desired=this.returning?FLIGHT.cruise:input.brake?FLIGHT.brake:input.boost?FLIGHT.boost:FLIGHT.cruise;
  const travel=desired*dt+(this.speed-desired)*(1-Math.exp(-2.5*dt))/2.5;this.speed=T.MathUtils.damp(this.speed,desired,2.5,dt);this.flat.copy(this.previousForward).add(this.forward).multiplyScalar(.5);if(input.assisted){
   // 刹车时保留惯性航迹，机头能够先转回目标；松开恢复沿机头推进。
   this.travelDirection.lerp(this.forward,1-Math.exp(-(input.brake&&!this.returning&&!this.leveling?1.5:8)*dt));if(this.travelDirection.lengthSq()<.01)this.travelDirection.copy(this.forward);this.travelDirection.normalize();this.position.addScaledVector(this.travelDirection,travel);
  }else{this.position.addScaledVector(this.flat,travel);this.travelDirection.copy(this.forward);}
  this.distance+=travel;
 }
 camera(camera,dt,body=false){
  this.axes();
  if(body)this.cameraUp.copy(this.up);
  else{
   // 将上一帧上方向平行投影到新视线平面；穿越极点时继续使用它。
   this.cameraUp.addScaledVector(this.forward,-this.cameraUp.dot(this.forward));
   if(this.cameraUp.lengthSq()<.001)this.cameraUp.crossVectors(this.cameraRight,this.forward);
   this.cameraUp.normalize();
   this.flat.copy(Y).addScaledVector(this.forward,-this.forward.y);
   if(this.flat.lengthSq()>.04){
    this.flat.normalize();this.angular.crossVectors(this.cameraUp,this.flat);
    const angle=Math.atan2(this.forward.dot(this.angular),T.MathUtils.clamp(this.cameraUp.dot(this.flat),-1,1));
    this.rotation.setFromAxisAngle(this.forward,T.MathUtils.clamp(angle,-2.5*dt,2.5*dt));this.cameraUp.applyQuaternion(this.rotation);
   }
   this.cameraRight.crossVectors(this.forward,this.cameraUp).normalize();
  }
  this.cameraPosition.copy(this.position).addScaledVector(this.forward,-11).addScaledVector(this.cameraUp,3.2);
  this.cameraTarget.copy(this.position).addScaledVector(this.forward,42);
  const initial=!this.cameraReady;if(initial){camera.position.copy(this.cameraPosition);this.cameraReady=true;}else camera.position.lerp(this.cameraPosition,1-Math.exp(-8*dt));
  this.matrix.lookAt(camera.position,this.cameraTarget,this.cameraUp);this.target.setFromRotationMatrix(this.matrix);
  camera.quaternion.slerp(this.target,initial?1:1-Math.exp(-10*dt));
 }
}
// 相对运动线段与球相交，可用于任意方向的高速弹丸及移动飞机。
export function segmentSphere(a,b,center,radius){
 const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ox=a.x-center.x,oy=a.y-center.y,oz=a.z-center.z;
 const aa=dx*dx+dy*dy+dz*dz,c=ox*ox+oy*oy+oz*oz-radius*radius;if(c<=0)return 0;if(aa<1e-12)return null;
 const bb=ox*dx+oy*dy+oz*dz,d=bb*bb-aa*c;if(d<0)return null;const t=(-bb-Math.sqrt(d))/aa;return t>=0&&t<=1?t:null;
}
export function terrainHit(a,b,height,radius=.8){
 const steps=Math.max(1,Math.ceil(a.distanceTo(b)/.75));
 for(let i=0;i<=steps;i++){const t=i/steps,x=T.MathUtils.lerp(a.x,b.x,t),z=T.MathUtils.lerp(a.z,b.z,t);if(T.MathUtils.lerp(a.y,b.y,t)-radius<=height(x,z))return t;}
 return null;
}
