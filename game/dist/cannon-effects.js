import * as T from './vendor/three.module.js';

// 机炮使用短曳光火团和瞬时炮口焰。两者共用一个程序材质，
// 每发炮弹只绘制一个低面数网格；炮口焰常驻复用，不创建动态灯光。
export function createCannonEffects(parent) {
  const uniforms = {time:{value:0},muzzleStrength:{value:0}};
  const material = new T.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,
    vertexShader:`
      attribute float flameMode;
      varying vec3 vLocal;
      varying vec3 vNormalView;
      varying vec3 vView;
      varying float vMode;
      void main(){
        vLocal=position;vMode=flameMode;
        vec4 viewPosition=modelViewMatrix*vec4(position,1.);
        vView=-viewPosition.xyz;vNormalView=normalMatrix*normal;
        gl_Position=projectionMatrix*viewPosition;
      }`,
    fragmentShader:`
      uniform float time;
      uniform float muzzleStrength;
      varying vec3 vLocal;
      varying vec3 vNormalView;
      varying vec3 vView;
      varying float vMode;
      void main(){
        float facing=abs(dot(normalize(vNormalView),normalize(vView)));
        float softEdge=smoothstep(.015,.62,facing);
        float heat=mix(1.-smoothstep(-.22,.58,vLocal.z),
                       1.-smoothstep(.05,.95,-vLocal.z),vMode);
        float tail=mix(1.-smoothstep(.16,.66,vLocal.z),
                       1.-smoothstep(.62,1.0,-vLocal.z),vMode);
        float flicker=.88+.12*sin(time*155.+vLocal.z*37.+vLocal.x*24.);
        vec3 ember=vec3(1.,.075,.006);
        vec3 yellow=vec3(1.,.62,.12);
        vec3 hot=vec3(1.,.98,.75);
        vec3 color=mix(ember,yellow,smoothstep(0.,.65,heat));
        color=mix(color,hot,pow(heat,2.)*pow(softEdge,.6));
        float alpha=softEdge*tail*flicker*mix(.92,muzzleStrength,vMode);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`
  });
  function flameGeometry(profile,mode,lobes=0) {
    const g=new T.LatheGeometry(profile.map(([radius,z])=>new T.Vector2(radius,z)),12);
    g.rotateX(Math.PI/2); // 局部 -Z 为飞行前方，+Z 为短尾迹。
    if(lobes){
      const p=g.attributes.position;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),angle=Math.atan2(y,x);
        const ripple=.77+.23*Math.cos(angle*lobes+p.getZ(i)*9.);
        p.setXY(i,x*ripple,y*ripple);
      }
      g.computeVertexNormals();
    }
    const modeData=new Float32Array(g.attributes.position.count);modeData.fill(mode);
    g.setAttribute('flameMode',new T.BufferAttribute(modeData,1));
    g.computeBoundingSphere();return g;
  }
  const tracerGeometry=flameGeometry([[0,-.38],[.055,-.32],[.095,-.19],[.07,-.02],[.05,.18],[.023,.42],[0,.65]],0);
  const muzzleGeometry=flameGeometry([[0,-1.0],[.07,-.76],[.22,-.42],[.12,-.22],[.055,-.04],[0,.025]],1,5);
  const root=new T.Group();root.name='Cannon muzzle flashes';root.visible=false;parent.add(root);
  const flashes=[-1,1].map(side=>{
    const mesh=new T.Mesh(muzzleGeometry,material);mesh.name=side<0?'Left muzzle flash':'Right muzzle flash';
    mesh.position.set(side*.62,0,-2);root.add(mesh);return mesh;
  });
  const localMuzzle=new T.Vector3(),duration=.075;
  let remaining=0,firedSinceRender=false,changed=false;
  function muzzlePosition(side,player,attitude,out) {
    localMuzzle.set(side*.62,0,-2).applyQuaternion(attitude);
    return out.set(player.x,player.y,player.z).add(localMuzzle);
  }
  function createTracer() {
    const mesh=new T.Mesh(tracerGeometry,material);mesh.name='Cannon incendiary tracer';
    return mesh;
  }
  function trigger(){remaining=duration;firedSinceRender=true;changed=true;}
  function update(dt){uniforms.time.value+=dt;remaining=Math.max(0,remaining-dt);changed=true;}
  function flush(player,attitude) {
    // 低帧率的追赶子步中即使已完成闪焰，也至少在本画面呈现一次射击提示。
    const strength=changed?(firedSinceRender?1:remaining/duration):uniforms.muzzleStrength.value;
    changed=false;firedSinceRender=false;uniforms.muzzleStrength.value=strength;
    root.visible=strength>.001;root.position.set(player.x,player.y,player.z);root.quaternion.copy(attitude);
    if(root.visible)for(let i=0;i<flashes.length;i++){
      const pulse=Math.sin(uniforms.time.value*173+i*2.1);
      flashes[i].scale.set(1+pulse*.13,1-pulse*.08,.9+pulse*.18);
    }
  }
  function clear(){remaining=0;firedSinceRender=false;changed=false;root.visible=false;uniforms.muzzleStrength.value=0;}
  function dispose(){clear();parent.remove(root);tracerGeometry.dispose();muzzleGeometry.dispose();material.dispose();}
  return {root,createTracer,muzzlePosition,trigger,update,flush,clear,dispose};
}
