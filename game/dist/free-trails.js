import * as T from './vendor/three.module.js';
const COLORS=[[.7,.91,1],[.55,.72,.8],[1,.64,.24]];
// 单次绘制的航迹池：双翼、六架敌机和六枚导弹共享固定顶点缓冲。
export class FreeTrails {
 constructor(root){
  this.count=14;this.length=28;this.head=0;this.timer=0;this.valid=new Uint8Array(this.count);this.points=new Float32Array(this.count*this.length*3);this.positions=new Float32Array(this.count*(this.length-1)*6);this.colors=new Float32Array(this.positions.length);this.point=new T.Vector3();
  this.geometry=new T.BufferGeometry();this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));this.geometry.setAttribute('color',new T.BufferAttribute(this.colors,3).setUsage(T.DynamicDrawUsage));
  this.material=new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.48,depthWrite:false});this.mesh=new T.LineSegments(this.geometry,this.material);this.mesh.frustumCulled=false;root.add(this.mesh);this.clear();
 }
 clear(){this.valid.fill(0);this.mesh.visible=false;this.head=0;this.timer=0;}
 update(dt,s){
  this.timer+=dt;if(this.timer<1/30)return;this.timer%=1/30;this.head=(this.head+1)%this.length;
  for(let i=0;i<this.count;i++){
   const object=i<2?null:i<8?s.enemies[i-2]:s.missiles[i-8],alive=i<2||object?.alive;
   if(!alive){this.valid[i]=0;continue;}
   if(i<2)this.point.set(i===0?-1.2:1.2,0,1).applyQuaternion(s.aircraft.quaternion).add(s.flight.position);else this.point.copy(object.mesh.position);
   this.point.toArray(this.points,(i*this.length+this.head)*3);this.valid[i]=Math.min(this.length,this.valid[i]+1);
  }
  let cursor=0;
  for(let i=0;i<this.count;i++)for(let age=0;age<this.valid[i]-1;age++){
   const strength=(1-age/this.length)*(i<2?1:.7),color=COLORS[i<2?0:i<8?1:2];
   for(let edge=0;edge<2;edge++){
    const p=(i*this.length+(this.head-age-edge+this.length)%this.length)*3;
    for(let c=0;c<3;c++){this.positions[cursor]=this.points[p+c];this.colors[cursor++]=color[c]*strength;}
   }
  }
  this.geometry.setDrawRange(0,cursor/3);this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.color.needsUpdate=true;this.mesh.visible=cursor>0;
 }
 dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
