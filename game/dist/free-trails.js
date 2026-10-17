import * as T from './vendor/three.module.js';
const COLORS=[[.8,.96,1],[.76,.84,.88],[.93,.96,1]],CORNERS=[0,1,2,2,1,3];
// 摄像机朝向的宽尾迹共享一个网格；固定环形缓冲保留约两秒轨迹。
export class FreeTrails {
 constructor(root){
  this.count=14;this.length=64;this.head=0;this.timer=0;this.valid=new Uint8Array(this.count);this.fade=new Float32Array(this.count);this.generation=new Uint32Array(this.count);this.points=new Float32Array(this.count*this.length*3);
  const vertices=this.count*(this.length-1)*6;this.positions=new Float32Array(vertices*3);this.colors=new Float32Array(vertices*3);this.edges=new Float32Array(vertices*2);this.point=new T.Vector3();this.a=new T.Vector3();this.b=new T.Vector3();this.side=new T.Vector3();this.sideB=new T.Vector3();this.c=new T.Vector3();this.d=new T.Vector3();this.view=new T.Vector3();
  this.geometry=new T.BufferGeometry();for(const [name,array,size]of [['position',this.positions,3],['color',this.colors,3],['aEdge',this.edges,2]])this.geometry.setAttribute(name,new T.BufferAttribute(array,size).setUsage(T.DynamicDrawUsage));
  this.material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,vertexShader:`attribute vec3 color;attribute vec2 aEdge;varying vec3 vColor;varying vec2 vEdge;void main(){vColor=color;vEdge=aEdge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vColor;varying vec2 vEdge;void main(){float alpha=(1.-smoothstep(.25,1.,abs(vEdge.x)))*vEdge.y;if(alpha<.005)discard;gl_FragColor=vec4(vColor,alpha);}`});
  this.mesh=new T.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;root.add(this.mesh);this.clear();
 }
 clear(){this.generation.fill(0);this.valid.fill(0);this.fade.fill(0);this.mesh.visible=false;this.head=0;this.timer=0;}
 update(dt,s){
  this.timer+=dt;if(this.timer<1/30)return;const step=this.timer;this.timer%=1/30;const oldHead=this.head;this.head=(this.head+1)%this.length;
  for(let i=0;i<this.count;i++){
   const object=i<2?null:i<8?s.enemies[i-2]:s.missiles[i-8],alive=i<2||object?.alive;
   if(object&&alive&&this.generation[i]!==object.trailGeneration){this.generation[i]=object.trailGeneration;this.valid[i]=0;}
   this.fade[i]=alive?1:Math.max(0,this.fade[i]-step/1.6);if(!this.fade[i]){this.valid[i]=0;continue;}
   if(alive){if(i<2)this.point.set(i===0?-1.2:1.2,0,1).applyQuaternion(s.aircraft.quaternion).add(s.flight.position);else this.point.copy(object.mesh.position);}else this.point.fromArray(this.points,(i*this.length+oldHead)*3);
   this.point.toArray(this.points,(i*this.length+this.head)*3);this.valid[i]=Math.min(this.length,this.valid[i]+1);
  }
  let vertex=0;
  for(let i=0;i<this.count;i++)for(let age=0;age<this.valid[i]-1;age++){
   this.a.fromArray(this.points,(i*this.length+(this.head-age+this.length)%this.length)*3);this.b.fromArray(this.points,(i*this.length+(this.head-age-1+this.length)%this.length)*3);
   this.c.fromArray(this.points,(i*this.length+(this.head-Math.max(0,age-1)+this.length)%this.length)*3);
   this.d.fromArray(this.points,(i*this.length+(this.head-Math.min(this.valid[i]-1,age+2)+this.length)%this.length)*3);
   this.view.subVectors(s.camera.position,this.a);this.side.subVectors(this.b,this.c).cross(this.view);if(this.side.lengthSq()<.00001)continue;this.side.normalize();
   this.view.subVectors(s.camera.position,this.b);this.sideB.subVectors(this.d,this.a).cross(this.view).normalize();
   const width=(i<2?.045:i<8?.13:.22),alpha=(1-age/this.length)*this.fade[i]*(i<2?.5:.85),color=COLORS[i<2?0:i<8?1:2];
   for(const corner of CORNERS){const end=corner>1,sign=corner%2?1:-1,p=end?this.b:this.a,side=end?this.sideB:this.side,w=width*(1+(age+(end?1:0))*.035);this.positions[vertex*3]=p.x+side.x*w*sign;this.positions[vertex*3+1]=p.y+side.y*w*sign;this.positions[vertex*3+2]=p.z+side.z*w*sign;this.colors.set(color,vertex*3);this.edges[vertex*2]=sign;this.edges[vertex*2+1]=alpha;vertex++;}
  }
  this.geometry.setDrawRange(0,vertex);for(const a of Object.values(this.geometry.attributes))a.needsUpdate=true;this.mesh.visible=vertex>0;
 }
 dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
