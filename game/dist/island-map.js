import * as T from './vendor/three.module.js';

// Original, deterministic archipelago. All geometry is generated locally;
// recycling moves whole islands, with no geometry allocation during flight.
export const SEA_LEVEL = -3;
const TAU = Math.PI * 2;
const time = { value: 0 };
function random(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; }; }
const coast = (a, seed) => 1 + .095 * Math.sin(a * 3 + seed) + .055 * Math.sin(a * 5 - seed * .7) + .035 * Math.cos(a * 9 + seed);
function noise(x,z) {
  const hash=(a,b)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
  return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),T.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);
}
function terrainHeight(u,v,height,seed) {
  const r=Math.hypot(u,v),base=Math.pow(Math.max(0,1-r*r),1.65);
  const ridge=.43+.57*noise(u*4.8+seed,v*4.1-seed)+.13*noise(u*12+seed,v*10);
  const shape=height*base*ridge-.28;
  const center=height*(.43+.57*noise(seed,-seed)+.13*noise(seed,0))-.28;
  return T.MathUtils.lerp(center,shape,T.MathUtils.smoothstep(r,.1,.23));
}
const stone = new T.MeshStandardMaterial({ vertexColors: true, roughness: .91, metalness: .04 });
stone.onBeforeCompile = shader => {
  shader.vertexShader = 'varying vec3 vTerrain;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrain = position;');
  shader.fragmentShader = 'varying vec3 vTerrain;\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    float grain = sin(vTerrain.x*15.3 + sin(vTerrain.z*8.2))*sin(vTerrain.z*17.1+vTerrain.y*11.0);
    float strata = sin(vTerrain.y*6.0 + sin(vTerrain.x*.6) + sin(vTerrain.z*.8));
    diffuseColor.rgb *= .89 + .10*grain + .035*strata;`);
};
stone.customProgramCacheKey = () => 'island-stone-v1';
const metal = new T.MeshStandardMaterial({ color: 0x64747c, roughness: .4, metalness: .65 });
const concrete = new T.MeshStandardMaterial({ color: 0x49575d, roughness: .9 });
const white = new T.MeshStandardMaterial({ color: 0xc6ceca, roughness: .56, metalness: .25 });
const beacon = new T.MeshBasicMaterial({ color: 0xffbb70 });
const cube = new T.BoxGeometry(1, 1, 1);
const cylinder = new T.CylinderGeometry(1, 1, 1, 16);
function box(group, material, x, y, z, sx, sy, sz) {
  const mesh = new T.Mesh(cube, material); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); group.add(mesh); return mesh;
}
function islandGeometry(rx, rz, height, seed) {
  const rings = 36, slices = 80, points = [0,terrainHeight(0,0,height,seed),0], indices = [];
  for (let j=1;j<=rings;j++) {
    const r=j/rings;
    for (let i=0;i<slices;i++) {
      const a=i/slices*TAU, edge=coast(a,seed), u=r*Math.cos(a), v=r*Math.sin(a);
      const y=terrainHeight(u,v,height,seed);
      points.push(u*rx*edge,y,v*rz*edge);
    }
  }
  for(let i=0;i<slices;i++) indices.push(0,1+(i+1)%slices,1+i);
  for(let j=1;j<rings;j++) for(let i=0;i<slices;i++) {
    const a=1+(j-1)*slices+i,b=1+(j-1)*slices+(i+1)%slices,c=a+slices,d=b+slices;
    indices.push(a,b,c,b,d,c);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();
  const normals=g.attributes.normal, colors=[], sand=new T.Color(0xa89f80), rock=new T.Color(0x505b5a), green=new T.Color(0x304b3a), c=new T.Color();
  for(let i=0;i<points.length/3;i++) {
    const y=points[i*3+1], x=points[i*3],z=points[i*3+2];
    const vegetation=T.MathUtils.smoothstep(y,.9,3)*T.MathUtils.smoothstep(normals.getY(i),.62,.93);
    c.copy(rock).lerp(green,vegetation*.9).lerp(sand,1-T.MathUtils.smoothstep(y,.15,1.35));
    c.multiplyScalar(.88+.12*Math.sin(x*1.8+Math.cos(z*2.4))*.5+.10*Math.sin(z*.8));colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeBoundingSphere();return g;
}
const shoreMaterial = new T.ShaderMaterial({
  transparent:true,depthWrite:false,uniforms:{uTime:time},
  vertexShader:`varying vec2 vUv; varying vec3 vWorld;
    void main(){vUv=uv;vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
  fragmentShader:`uniform float uTime;varying vec2 vUv;varying vec3 vWorld;
    void main(){float r=vUv.y;float ripple=sin(r*59.-uTime*1.8+sin(vUv.x*38.)*1.4);
      float foam=pow(max(0.,ripple),12.)*(1.-smoothstep(.12,.65,r));
      vec3 color=mix(vec3(.035,.35,.36),vec3(.54,.72,.68),foam*.55);
      float fade=(1.-smoothstep(.05,1.,r))*smoothstep(0.,.08,r);
      float fog=exp(-.000025*pow(length(cameraPosition-vWorld),2.));
      gl_FragColor=vec4(color,fade*(.36+foam*.3)*fog);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
function shore(rx,rz,seed) {
  const positions=[],uv=[],idx=[],slices=96,rings=7;
  for(let j=0;j<=rings;j++) for(let i=0;i<=slices;i++) {
    const a=i/slices*TAU,r=.91+j/rings*.44,edge=coast(a,seed);
    positions.push(Math.cos(a)*rx*edge*r,.085,Math.sin(a)*rz*edge*r);uv.push(i/slices,j/rings);
  }
  for(let j=0;j<rings;j++)for(let i=0;i<slices;i++) {const a=j*(slices+1)+i,b=a+slices+1;idx.push(a,a+1,b,a+1,b+1,b);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);
  return new T.Mesh(g,shoreMaterial);
}
function station(group,height,variant) {
  const y=height+.04;
  box(group,concrete,0,y,0,7,.7,5);
  if(variant%2===0) {
    box(group,metal,0,y+1.3,0,3.7,2,2.8);
    box(group,white,0,y+2.38,0,4,.16,3.1);
    box(group,metal,0,y+3.2,0,.35,1.7,.35);
    const dome=new T.Mesh(new T.SphereGeometry(1.2,20,12,0,TAU,0,Math.PI/2),white);dome.position.set(0,y+3.7,0);group.add(dome);
    box(group,metal,2.5,y+2.8,1.4,.12,5.5,.12);box(group,beacon,2.5,y+5.55,1.4,.22,.22,.22);
  } else {
    box(group,white,-.75,y+.36,0,.15,.03,2);box(group,white,.75,y+.36,0,.15,.03,2);box(group,white,0,y+.36,0,1.5,.03,.15);
    for(const x of [-2.9,2.9]) for(const z of [-1.9,1.9]) box(group,beacon,x,y+.4,z,.18,.13,.18);
    box(group,metal,4,y+.6,0,1.2,1.1,1.7);
  }
}
function sky() {
  return new T.Mesh(new T.SphereGeometry(480,32,20),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,
    vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vDir;void main(){vec3 d=normalize(vDir);float h=max(0.,d.y);
      vec3 color=mix(vec3(.25,.39,.44),vec3(.055,.17,.29),pow(h,.48));
      float sun=max(0.,dot(d,normalize(vec3(-.55,.32,-.8))));
      color+=vec3(.65,.49,.28)*pow(sun,20.)*.23+vec3(1.,.82,.53)*pow(sun,650.);
      float streak=sin(d.x*17.+d.z*8.+sin(d.x*25.)*.15);
      float cloud=smoothstep(.6,.98,streak)*exp(-pow((d.y-.22)*11.,2.));
      color=mix(color,vec3(.57,.66,.67),cloud*.15);gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`}));
}
function ocean() {
  const geometry=new T.PlaneGeometry(1400,1400,1,1);geometry.rotateX(-Math.PI/2);
  const material=new T.ShaderMaterial({uniforms:{uTime:time,uDistance:{value:0}},
    vertexShader:`varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader:`uniform float uTime;uniform float uDistance;varying vec3 vWorld;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      float waves(vec2 p,float t){return noise(p*vec2(.85,1.9)+vec2(t*.19,-t*.25))*.6+noise(p*vec2(2.1,4.2)+t*.31)*.28+noise(p*7.-t*.2)*.12;}
      void main(){vec2 p=vWorld.xz+vec2(0.,-uDistance);float t=uTime;
        float wave=waves(p,t),a=waves(p+vec2(.12,0.),t)-wave,b=waves(p+vec2(0.,.12),t)-wave;
        vec3 n=normalize(vec3(-a*.6,1.,-b*.6));
        vec3 view=normalize(cameraPosition-vWorld),light=normalize(vec3(-.55,.65,-.8));
        float fresnel=pow(1.-max(0.,dot(n,view)),4.);
        vec3 color=mix(vec3(.018,.089,.13),vec3(.18,.32,.38),fresnel*.8);
        color+=vec3(.025,.06,.065)*(wave*.6);
        float gloss=pow(max(0.,dot(n,normalize(light+view))),320.);
        color+=vec3(.85,.75,.52)*gloss*.6;
        float dist=length(cameraPosition-vWorld);float detail=1.-smoothstep(30.,160.,dist);
        float fine=noise(p*12.+t*.3)-.5;
        color+=vec3(.01,.021,.025)*max(0.,fine)*detail;
        float fog=1.-exp(-.000025*dist*dist);color=mix(color,vec3(.25,.39,.44),fog);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const mesh=new T.Mesh(geometry,material);mesh.position.y=SEA_LEVEL;return mesh;
}
// Shared obstacle geometry: the top is y=1; the base is y=0.
const stackGeometry=(()=>{
  const g=new T.CylinderGeometry(.63,1,1,12,9),p=g.attributes.position,colors=[],c=new T.Color();
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),y=p.getY(i)+.5;
    const wobble=1+.075*Math.sin(y*24+Math.atan2(z,x)*5);
    p.setXYZ(i,x*wobble,y,z*wobble);
    c.setHex(y>.84?0x596855:0x717775);c.multiplyScalar(.9+.1*Math.sin(y*30+x*3));colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
})();
const stackFoam=new T.MeshBasicMaterial({color:0x8fbfb6,transparent:true,opacity:.25,depthWrite:false});
const foamGeometry=new T.TorusGeometry(1,.075,4,32);foamGeometry.rotateX(Math.PI/2);
export function createSeaStack(x,y,z,r) {
  const group=new T.Group();group.position.set(x,y,z);
  const top=y+r, height=top-SEA_LEVEL;
  const body=new T.Mesh(stackGeometry,stone);body.position.y=SEA_LEVEL-y;body.scale.set(r,height,r);group.add(body);
  const foam=new T.Mesh(foamGeometry,stackFoam);foam.position.y=SEA_LEVEL-y+.07;foam.scale.set(r*1.1,1,r*1.1);group.add(foam);
  // A small warm navigation light makes the silhouette legible at range.
  box(group,metal,0,r+.22,0,.12,.45,.12);box(group,beacon,0,r+.5,0,.22,.15,.22);
  return {mesh:group,bottom:SEA_LEVEL,top:top+.6,r:r*1.075};
}
const scrubGeometry=new T.IcosahedronGeometry(1,1);
const scrubMaterial=new T.MeshStandardMaterial({color:0xb2bba3,roughness:1});
export function createIslandMap(scene) {
  const root=new T.Group();root.name='Archipelago';scene.add(root);
  const sea=ocean();root.add(sea);root.add(sky());
  const islands=[],rng=random(605032),period=576;
  for(let i=0;i<12;i++) {
    const rx=15+rng()*10,rz=19+rng()*14,h=6+rng()*11,seed=rng()*20,side=i%2?1:-1;
    const group=new T.Group();group.name=`Island ${i+1}`;
    // Keep shore geometry and solid land outside the player's +/-10 corridor.
    group.position.set(side*(19+rx*1.2+rng()*8),SEA_LEVEL,22-i*48);
    group.add(new T.Mesh(islandGeometry(rx,rz,h,seed),stone));group.add(shore(rx,rz,seed));
    if(i%3===0)station(group,terrainHeight(0,0,h,seed),i);
    // Sparse scrub follows the terrain and shares one instanced draw per island.
    const vegetation=new T.InstancedMesh(scrubGeometry,scrubMaterial,100),matrix=new T.Matrix4(),rotation=new T.Quaternion(),position=new T.Vector3(),scale=new T.Vector3();
    for(let j=0;j<100;j++) {
      const a=rng()*TAU,r=.27+Math.sqrt(rng())*.43,u=r*Math.cos(a),v=r*Math.sin(a),edge=coast(a,seed),size=.28+rng()*.45;
      position.set(u*rx*edge,terrainHeight(u,v,h,seed)+size*.15,v*rz*edge);scale.set(size,size*(.5+rng()*.5),size);
      matrix.compose(position,rotation,scale);vegetation.setMatrixAt(j,matrix);
      vegetation.setColorAt(j,new T.Color().setHSL(.27+rng()*.035,.16,.15+rng()*.07));
    }
    group.add(vegetation);
    root.add(group);islands.push({group,startZ:group.position.z});
  }
  function update(distance,elapsed) {
    time.value=elapsed;sea.material.uniforms.uDistance.value=distance;
    for(const island of islands) island.group.position.z=100-((100-island.startZ-distance)%period+period)%period;
  }
  update(0,0);
  return {root,islands,update,reset:()=>update(0,0)};
}
