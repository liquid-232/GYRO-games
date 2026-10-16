import * as T from './vendor/three.module.js';

// Shared procedural textures and geometry; each burst owns only its changing
// materials and spark buffer. No downloads, timers or additional render passes.
export function createEnemyExplosions(parent) {
  const bursts = [], idle = [], maxBursts = 6;
  let assets,primer,activeLimit=6,reducedEffects=false;
  const clamp = T.MathUtils.clamp;
  function texture(smoke) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const glow = (x,y,r,alpha) => {
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,`rgba(255,255,255,${alpha})`);
      g.addColorStop(.32,`rgba(255,255,255,${alpha*.8})`);
      g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    };
    if(smoke){
      for(let i=0;i<25;i++){
        const a=i*2.39996,r=34*Math.sqrt(i/25);
        glow(64+Math.cos(a)*r,64+Math.sin(a)*r,20+(i*13%18),.28);
      }
    }else glow(64,64,63,1);
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;return map;
  }
  function resources(){
    return assets ??= {fire:texture(false),smoke:texture(true),
      ring:new T.TorusGeometry(1,.025,4,56),shard:new T.TetrahedronGeometry(1),
      metal:new T.MeshStandardMaterial({color:0x454d56,metalness:.65,roughness:.62,emissive:0x65200a,emissiveIntensity:.45})};
  }
  function prepare(renderer){
    const a=resources();if(primer)return;
    renderer?.initTexture(a.fire);renderer?.initTexture(a.smoke);
    primer=new T.Group();primer.name='Explosion material warmup';primer.visible=false;
    for(const [map,blending] of [[a.fire,T.AdditiveBlending],[a.smoke,T.NormalBlending]]){
      primer.add(new T.Sprite(new T.SpriteMaterial({map,transparent:true,opacity:0,depthWrite:false,blending,toneMapped:false})));
    }
    primer.add(new T.Mesh(a.ring,new T.MeshBasicMaterial({color:0xffbd65,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false})));
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,0,0,0],3));g.setAttribute('color',new T.Float32BufferAttribute([1,1,1,1,1,1],3));
    primer.add(new T.LineSegments(g,new T.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false})));
    const debris=new T.InstancedMesh(a.shard,a.metal,1);debris.count=0;primer.add(debris);
    parent.add(primer);
    // 预分配六组爆炸网格、材质和动态缓冲，游玩中只重置数据。
    const limit=activeLimit;activeLimit=maxBursts;
    for(let i=0;i<maxBursts;i++)spawn(new T.Vector3(0,0,-500),new T.Quaternion(),true);
    clear();activeLimit=limit;
  }
  function release(burst){
    burst.root.visible=false;idle.push(burst);
  }
  function recycle(burst,position,attitude,orbital){
    burst.root.visible=true;burst.root.position.copy(position);burst.age=0;burst.orbital=orbital;
    for(const p of burst.puffs){
      p.offset.set((Math.random()-.5)*1.4,(Math.random()-.5)*.65,(Math.random()-.5)*2.5);
      if(p.smoke)p.velocity.set((Math.random()-.5)*1.7,orbital?(Math.random()-.5)*1.1:.8+Math.random(),(Math.random()-.5)*1.6);
      else{p.offset.applyQuaternion(attitude);p.velocity.copy(p.offset).multiplyScalar(1.5);p.velocity.y+=.4+Math.random();}
    }
    for(const spark of burst.sparks){spark.velocity.randomDirection().multiplyScalar(4+Math.random()*7);spark.life=.45+Math.random()*.45;}
    for(const fragment of burst.fragments){fragment.velocity.randomDirection().multiplyScalar(2+Math.random()*4);fragment.spin.randomDirection();}
    return burst;
  }
  function clear(){for(const burst of bursts)release(burst);bursts.length=0;}
  function spawn(position,attitude,orbital=false){
    const a=resources();
    if(bursts.length>=activeLimit)release(bursts.shift());
    if(idle.length){bursts.push(recycle(idle.pop(),position,attitude,orbital));return;}
    const root=new T.Group();root.name='Enemy destruction';root.position.copy(position);parent.add(root);
    const materials=[],puffs=[];
    const sprite=(map,color,additive)=>{
      const material=new T.SpriteMaterial({map,color,transparent:true,opacity:0,depthWrite:false,
        blending:additive?T.AdditiveBlending:T.NormalBlending,toneMapped:false});
      materials.push(material);const mesh=new T.Sprite(material);root.add(mesh);return mesh;
    };
    const flash=sprite(a.fire,0xfff0cf,true);
    for(let i=0;i<7;i++){
      const offset=new T.Vector3((Math.random()-.5)*1.4,(Math.random()-.5)*.65,(Math.random()-.5)*2.5).applyQuaternion(attitude);
      const velocity=offset.clone().multiplyScalar(1.5).add(new T.Vector3((Math.random()-.5)*1.8,.4+Math.random(),(Math.random()-.5)*1.5));
      const mesh=sprite(a.fire,0xffce79,true);
      puffs.push({mesh,offset,velocity,delay:i*.025,duration:.5+Math.random()*.23,size:1.4+Math.random(),smoke:false});
    }
    for(let i=0;i<6;i++){
      const offset=new T.Vector3((Math.random()-.5)*1.4,(Math.random()-.5)*.5,(Math.random()-.5)*1.8);
      const velocity=new T.Vector3((Math.random()-.5)*1.7,orbital?(Math.random()-.5)*1.1:.8+Math.random(),(Math.random()-.5)*1.6);
      const mesh=sprite(a.smoke,orbital?0x6b717c:0x44434a,false);mesh.material.rotation=Math.random()*Math.PI;
      puffs.push({mesh,offset,velocity,delay:.12+i*.045,duration:1.45,size:1.2+Math.random()*.7,smoke:true});
    }
    const ringMaterial=new T.MeshBasicMaterial({color:0xffbd65,transparent:true,opacity:0,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
    materials.push(ringMaterial);const ring=new T.Mesh(a.ring,ringMaterial);root.add(ring);
    const sparkCount=28,sparkPositions=new Float32Array(sparkCount*6),sparkColors=new Float32Array(sparkCount*6),sparks=[];
    for(let i=0;i<sparkCount;i++){
      const direction=new T.Vector3().randomDirection(),velocity=direction.multiplyScalar(4+Math.random()*7);
      sparks.push({velocity,life:.45+Math.random()*.45});sparkColors.set([1,.75,.24,.15,.025,.003],i*6);
    }
    const sparkGeometry=new T.BufferGeometry();
    sparkGeometry.setAttribute('position',new T.BufferAttribute(sparkPositions,3).setUsage(T.DynamicDrawUsage));
    sparkGeometry.setAttribute('color',new T.BufferAttribute(sparkColors,3));
    const sparkMaterial=new T.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
    materials.push(sparkMaterial);const sparkMesh=new T.LineSegments(sparkGeometry,sparkMaterial);sparkMesh.frustumCulled=false;root.add(sparkMesh);
    const debris=new T.InstancedMesh(a.shard,a.metal,10);debris.instanceMatrix.setUsage(T.DynamicDrawUsage);debris.frustumCulled=false;root.add(debris);
    const fragments=Array.from({length:10},()=>({velocity:new T.Vector3().randomDirection().multiplyScalar(2+Math.random()*4),
      spin:new T.Vector3().randomDirection(),rate:3+Math.random()*6,size:new T.Vector3(.12+Math.random()*.13,.035+Math.random()*.06,.2+Math.random()*.24)}));
    bursts.push({root,materials,flash,puffs,ring,sparks,sparkMesh,sparkGeometry,sparkPositions,debris,fragments,orbital,age:0});
  }
  const transform=new T.Object3D(),hot=new T.Color(0xffe6a2),cool=new T.Color(0xe23a0d);
  function update(dt,forwardSpeed,camera){
    for(let i=bursts.length-1;i>=0;i--){
      const b=bursts[i];b.age+=dt;b.root.position.z+=forwardSpeed*dt;const t=b.age;
      if(t>=1.9||b.root.position.z>35){release(b);bursts.splice(i,1);continue;}
      b.flash.visible=t<.18;b.flash.scale.setScalar(1.5+9*t);b.flash.material.opacity=Math.pow(Math.max(0,1-t/.18),2);
      b.ring.visible=t<.5;b.ring.quaternion.copy(camera.quaternion);b.ring.scale.setScalar(.4+6*t);b.ring.material.opacity=.55*Math.pow(Math.max(0,1-t/.5),2);
      let firePuffs=0,smokePuffs=0;
      for(const p of b.puffs){
        const allowed=!reducedEffects||(p.smoke?smokePuffs++<2:firePuffs++<3);
        const age=t-p.delay,u=clamp(age/p.duration,0,1);p.mesh.visible=allowed&&age>=0&&u<1;
        if(!p.mesh.visible)continue;
        p.mesh.position.copy(p.offset).addScaledVector(p.velocity,age);
        p.mesh.scale.setScalar(p.size*(p.smoke?.7+u*2.1:.35+Math.sin(u*Math.PI*.65)*1.5));
        p.mesh.material.opacity=p.smoke?Math.sin(u*Math.PI)*.38:Math.min(1,u*12)*Math.pow(1-u,1.3)*.95;
        if(!p.smoke)p.mesh.material.color.copy(hot).lerp(cool,u);
      }
      b.sparkGeometry.setDrawRange(0,reducedEffects?28:56);b.debris.count=reducedEffects?6:10;
      b.sparkMesh.visible=t<.9;b.sparkMesh.material.opacity=Math.max(0,1-t/.9);
      for(let j=0;j<b.sparks.length;j++){
        const s=b.sparks[j],age=Math.min(t,s.life),head=(1-Math.exp(-age*2))/2,tail=(1-Math.exp(-Math.max(0,age-.065)*2))/2;
        const n=j*6,v=s.velocity,g=b.orbital?0:1.8;
        b.sparkPositions[n]=v.x*head;b.sparkPositions[n+1]=v.y*head-g*age*age;b.sparkPositions[n+2]=v.z*head;
        b.sparkPositions[n+3]=v.x*(t<s.life?tail:head);b.sparkPositions[n+4]=v.y*(t<s.life?tail:head)-g*age*age;b.sparkPositions[n+5]=v.z*(t<s.life?tail:head);
      }
      b.sparkGeometry.attributes.position.needsUpdate=true;
      for(let j=0;j<b.fragments.length;j++){
        const f=b.fragments[j];transform.position.copy(f.velocity).multiplyScalar(t*.7);
        if(!b.orbital)transform.position.y-=2*t*t;
        transform.quaternion.setFromAxisAngle(f.spin,t*f.rate);transform.scale.copy(f.size).multiplyScalar(1-clamp((t-1.1)/.7,0,1));
        transform.updateMatrix();b.debris.setMatrixAt(j,transform.matrix);
      }
      b.debris.instanceMatrix.needsUpdate=true;
    }
  }
  function dispose(){clear();for(const b of idle){parent.remove(b.root);for(const m of b.materials)m.dispose();b.sparkGeometry.dispose();b.debris.dispose();}idle.length=0;if(primer){parent.remove(primer);for(const child of primer.children){if(child.material!==assets.metal)child.material.dispose();if(child.isLine)child.geometry.dispose();if(child.isInstancedMesh)child.dispose();}primer=null;}if(assets){assets.fire.dispose();assets.smoke.dispose();assets.ring.dispose();assets.shard.dispose();assets.metal.dispose();assets=null;}}
  function setQuality(profile){
    activeLimit=profile.effectLimit;reducedEffects=!profile.effectDetail;
    while(bursts.length>activeLimit)release(bursts.shift());
  }
  return {prepare,spawn,update,clear,dispose,setQuality};
}
