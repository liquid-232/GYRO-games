import * as T from './vendor/three.module.js';
// 爆炸火球、烟团和火星共用实例化面片；没有逐次分配材质或全屏后处理。
export class AceEffects {
 constructor(root){
  this.root=root;this.capacity=192;this.cursor=0;this.object=new T.Object3D();this.time=0;this.boost=0;
  this.pool=Array.from({length:this.capacity},()=>({position:new T.Vector3(),velocity:new T.Vector3(),age:9,life:1,size:1,type:0}));
  this.states=new Float32Array(this.capacity*3);this.geometry=new T.PlaneGeometry(1,1);this.geometry.setAttribute('aState',new T.InstancedBufferAttribute(this.states,3).setUsage(T.DynamicDrawUsage));
  this.material=new T.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,vertexShader:`attribute vec3 aState;varying vec2 vUv;varying vec3 vState;void main(){vUv=uv;vState=aState;vec4 p=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);p.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*p;}`,fragmentShader:`varying vec2 vUv;varying vec3 vState;void main(){float u=vState.x,type=vState.y;vec2 p=vUv-.5;float r=length(p)*2.;float shape=1.-smoothstep(.35,1.,r);float billow=.86+.14*sin(p.x*22.+sin(p.y*18.)+vState.z);vec3 color;float alpha;
 if(type<.5){color=mix(vec3(1.,.97,.67),vec3(1.,.23,.035),smoothstep(.04,.7,u));alpha=shape*billow*(1.-u)*min(1.,u*18.);}
 else if(type<1.5){color=mix(vec3(.32,.31,.3),vec3(.12,.17,.2),u);alpha=shape*billow*sin(u*3.14159)*.5;}
 else{color=vec3(1.,.77,.25);alpha=shape*(1.-u);}
 if(alpha<.005)discard;gl_FragColor=vec4(color,alpha);}`});
  this.mesh=new T.InstancedMesh(this.geometry,this.material,this.capacity);this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.mesh.frustumCulled=false;root.add(this.mesh);
  this.ringGeometry=new T.TorusGeometry(1,.016,4,56);this.rings=Array.from({length:6},()=>{const material=new T.MeshBasicMaterial({color:0xffc874,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}),mesh=new T.Mesh(this.ringGeometry,material);mesh.visible=false;root.add(mesh);return {mesh,age:9,life:.6,scale:1};});
  this.jets=new T.Group();this.jetGeometry=new T.ConeGeometry(.16,1.5,8);this.jetGeometry.rotateX(Math.PI/2);this.jetMaterial=new T.MeshBasicMaterial({color:0x72dfff,transparent:true,opacity:.85,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
  for(const x of [-.4,.4]){const jet=new T.Mesh(this.jetGeometry,this.jetMaterial);jet.position.set(x,-.04,2.6);this.jets.add(jet);}root.add(this.jets);this.clear();
 }
 clear(){for(const p of this.pool)p.age=p.life;for(const r of this.rings)r.mesh.visible=false;this.mesh.count=0;this.jets.visible=false;}
 burst(position,scale=1,parry=false){
  const ring=this.rings.find(r=>!r.mesh.visible)||this.rings[0];ring.mesh.position.copy(position);ring.mesh.material.color.setHex(parry?0x90ffe5:0xffc874);ring.mesh.visible=true;ring.age=0;ring.life=parry?.35:.65;ring.scale=scale;
  const count=parry?12:42;for(let i=0;i<count;i++){const p=this.pool[this.cursor++%this.capacity];p.position.copy(position);p.velocity.randomDirection().multiplyScalar((i<12?10:6+Math.random()*12)*scale);p.velocity.y+=2;p.age=0;p.type=parry?2:i<12?0:i<24?1:2;p.life=p.type===1?2.3:p.type===2?.6+Math.random()*.5:.65+Math.random()*.4;p.size=(p.type===1?8:p.type===2?.55:6)*scale;}
 }
 update(dt,s){
  this.time+=dt;let count=0;
  for(const p of this.pool){if(p.age>=p.life)continue;p.age+=dt;const u=Math.min(1,p.age/p.life);p.position.addScaledVector(p.velocity,dt);p.velocity.multiplyScalar(Math.exp(-dt*1.5));if(p.type===1)p.position.y+=dt*3;
   this.object.position.copy(p.position);this.object.quaternion.identity();this.object.scale.setScalar(p.size*(p.type===2?1:.45+u*1.9));this.object.updateMatrix();this.mesh.setMatrixAt(count,this.object.matrix);this.states[count*3]=u;this.states[count*3+1]=p.type;this.states[count*3+2]=count*1.73;count++;
  }
  this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;this.geometry.attributes.aState.needsUpdate=true;
  for(const r of this.rings)if(r.mesh.visible){r.age+=dt;if(r.age>=r.life){r.mesh.visible=false;continue;}r.mesh.quaternion.copy(s.camera.quaternion);r.mesh.scale.setScalar((1+r.age*26)*r.scale);r.mesh.material.opacity=(1-r.age/r.life)*.55;}
  this.jets.visible=s.aircraft.visible;this.jets.position.copy(s.flight.position);this.jets.quaternion.copy(s.aircraft.quaternion);const boost=s.flight.speed>85;for(const jet of this.jets.children)jet.scale.z=(boost?1.8:.8)*(1+.08*Math.sin(this.time*65));this.jetMaterial.color.setHex(boost?0xffc685:0x77cfff);
 }
 prepare(){this.jets.visible=true;this.rings[0].mesh.visible=true;this.mesh.count=1;this.object.scale.setScalar(0);this.object.updateMatrix();this.mesh.setMatrixAt(0,this.object.matrix);}
 dispose(){this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose();this.ringGeometry.dispose();for(const r of this.rings){r.mesh.removeFromParent();r.mesh.material.dispose();}this.jets.removeFromParent();this.jetGeometry.dispose();this.jetMaterial.dispose();}
}
