import * as T from './vendor/three.module.js';
// Original offline orbital scenery. Shared assets are reused by each obstacle.
const TAU=Math.PI*2;
const hull=new T.MeshStandardMaterial({color:0x718694,metalness:.78,roughness:.4});
const dark=new T.MeshStandardMaterial({color:0x233342,metalness:.65,roughness:.55});
const edge=new T.MeshStandardMaterial({color:0xc7cec9,metalness:.75,roughness:.32});
const orange=new T.MeshBasicMaterial({color:0xffac55});
const blue=new T.MeshBasicMaterial({color:0x73d9ff});
const boxGeo=new T.BoxGeometry(1,1,1),sphereGeo=new T.SphereGeometry(1,16,10);
const solar=new T.MeshStandardMaterial({color:0x142c58,metalness:.68,roughness:.28});
solar.onBeforeCompile=shader=>{
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float gx=step(.94,fract(vMapUv.x*12.)),gy=step(.91,fract(vMapUv.y*5.));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.28,.37,.42),max(gx,gy)*.7);`);
};
// A 1px white map enables the material UV path without any downloaded assets.
const whiteMap=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);whiteMap.needsUpdate=true;solar.map=whiteMap;
const rockGeo=new T.IcosahedronGeometry(1,2);
const positions=rockGeo.attributes.position;
for(let i=0;i<positions.count;i++){
 const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
 const f=.83+.10*Math.sin(x*8+y*5)*Math.cos(z*7-x*3)+.06*Math.sin(y*13+z*5);
 positions.setXYZ(i,x*f,y*f,z*f);
}
rockGeo.computeVertexNormals();
const rockMaterial=new T.MeshStandardMaterial({color:0x72737b,roughness:.94,metalness:.14});
rockMaterial.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 rockPoint;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nrockPoint=position;');
 shader.fragmentShader='varying vec3 rockPoint;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float grain=sin(rockPoint.x*73.+sin(rockPoint.y*31.))*cos(rockPoint.z*68.);
 float vein=sin(rockPoint.y*19.+sin(rockPoint.x*12.)+rockPoint.z*8.);
 diffuseColor.rgb*=.75+.18*grain+.12*vein;`);
};
function box(group,material,position,scale){const m=new T.Mesh(boxGeo,material);m.position.set(...position);m.scale.set(...scale);group.add(m);return m;}
function satellite(){
 const g=new T.Group();box(g,hull,[0,0,0],[1.3,1.5,1.4]);box(g,edge,[0,.85,0],[1.5,.2,1.6]);
 box(g,dark,[0,0,0],[5,.14,.2]);
 for(const x of [-1.9,1.9]){box(g,edge,[x,0,0],[2,.10,2]);box(g,solar,[x,.07,0],[1.9,.05,1.9]);}
 const dish=new T.Mesh(new T.SphereGeometry(.7,16,8,0,TAU,0,Math.PI*.35),edge);dish.rotation.z=-.6;dish.position.y=1.;g.add(dish);
 box(g,orange,[.5,.9,.4],[.12,.12,.12]);return g;
}
let satelliteTemplate;
export function createOrbitalObstacle(x,y,z,r=1.8,variant=0){
 let mesh;
 if(variant%3===1){satelliteTemplate??=satellite();mesh=satelliteTemplate.clone();mesh.scale.setScalar(r/3.35);}
 else {mesh=new T.Mesh(rockGeo,rockMaterial);mesh.scale.setScalar(r);}
 mesh.position.set(x,y,z);
 return {type:'asteroid',mesh,r,spin:.16+variant*.025};
}
const gateRadius=4.7,gateTube=.48;
const gateGeometry=new T.TorusGeometry(gateRadius,gateTube,8,48);
const rimGeometry=new T.TorusGeometry(gateRadius,.045,5,64);
export function createOrbitalGate(x,y,z){
 const mesh=new T.Group();mesh.name='Traversable orbital frame';mesh.position.set(x,y,z);
 mesh.add(new T.Mesh(gateGeometry,hull));
 for(const dz of [-.49,.49]){const rim=new T.Mesh(rimGeometry,blue);rim.position.z=dz;mesh.add(rim);}
 for(let i=0;i<8;i++){
  const a=i/8*TAU,m=box(mesh,dark,[Math.cos(a)*gateRadius,Math.sin(a)*gateRadius,0],[.7,.72,1.15]);m.rotation.z=a;
  const marker=box(mesh,i%2?orange:blue,[Math.cos(a)*gateRadius,Math.sin(a)*gateRadius,.60],[.24,.26,.04]);marker.rotation.z=a;
 }
 // Collider includes the outer brackets while preserving the hollow center.
 return {type:'gate',mesh,r:gateRadius,ringRadius:gateRadius,tube:.62,halfDepth:.62};
}
export function ringIntersects(object,x,y,z,padding=0){
 return Math.abs(z-object.mesh.position.z)<object.halfDepth+padding&&Math.abs(Math.hypot(x-object.mesh.position.x,y-object.mesh.position.y)-object.ringRadius)<object.tube+padding;
}
function makeStars(){
 const p=[],c=[];let seed=51387;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
 for(let i=0;i<1400;i++){const a=rand()*TAU,v=rand()*2-1,s=Math.sqrt(1-v*v),r=420+rand()*70;p.push(Math.cos(a)*s*r,v*r,Math.sin(a)*s*r);const b=.3+rand()*.7;c.push(b*.8,b*.9,b);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('color',new T.Float32BufferAttribute(c,3));
 return new T.Points(geo,new T.PointsMaterial({size:.6,sizeAttenuation:true,vertexColors:true,fog:false,transparent:true,opacity:.85}));
}
function planet(){
 const g=new T.Group();g.position.set(88,-48,-295);
 const shader=new T.ShaderMaterial({
 vertexShader:`varying vec3 vSurface;varying vec3 vNormal;varying vec3 vWorld;
 void main(){vSurface=position;vNormal=normalize(mat3(modelMatrix)*normal);vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
 fragmentShader:`varying vec3 vSurface;varying vec3 vNormal;varying vec3 vWorld;
 float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=a*noise(p);p=p*2.08+7.1;a*=.5;}return f;}
 void main(){vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld),light=normalize(vec3(-.7,.55,.6)),p=normalize(vSurface);
 float terrain=fbm(p*4.7+vec3(3.,1.,-2.));float land=smoothstep(.49,.55,terrain);
 vec3 ocean=vec3(.008,.045,.11),ground=mix(vec3(.06,.13,.10),vec3(.24,.22,.15),smoothstep(.55,.73,terrain));
 vec3 color=mix(ocean,ground,land);float clouds=smoothstep(.53,.69,fbm(p*11.+vec3(8.))+noise(p*30.)*.1);
 color=mix(color,vec3(.72,.80,.85),clouds*.87);
 float diffuse=dot(n,light);color*=.08+1.3*max(0.,diffuse);
 float fresnel=pow(1.-max(0.,dot(n,v)),3.);color+=vec3(.045,.22,.48)*fresnel*smoothstep(-.35,.4,diffuse);
 float gloss=pow(max(0.,dot(n,normalize(light+v))),90.);color+=vec3(.7,.85,1.)*gloss*.35*(1.-land)*(1.-clouds);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 g.add(new T.Mesh(new T.SphereGeometry(112,80,48),shader));
 const atmosphere=new T.Mesh(new T.SphereGeometry(114,64,40),new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,
 vertexShader:`varying vec3 n;varying vec3 w;void main(){n=normalize(mat3(modelMatrix)*normal);vec4 p=modelMatrix*vec4(position,1.);w=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
 fragmentShader:`varying vec3 n;varying vec3 w;void main(){float rim=pow(1.-max(0.,dot(normalize(n),normalize(cameraPosition-w))),4.);float sun=smoothstep(-.4,.5,dot(normalize(n),normalize(vec3(-.7,.55,.6))));gl_FragColor=vec4(.12,.43,.9,rim*sun*.65);}`
 }));g.add(atmosphere);return g;
}
function distantStation(){
 const g=new T.Group();g.position.set(-66,22,-225);g.rotation.set(.3,.45,-.25);
 const torus=new T.Mesh(new T.TorusGeometry(26,1.35,10,72),hull);g.add(torus);
 const inner=new T.Mesh(new T.TorusGeometry(25,.12,6,72),blue);inner.position.z=1.2;g.add(inner);
 const core=new T.Mesh(new T.CylinderGeometry(3,3,19,12),hull);core.rotation.x=Math.PI/2;g.add(core);
 for(let i=0;i<6;i++){const a=i/6*TAU;const arm=box(g,dark,[Math.cos(a)*13,Math.sin(a)*13,0],[26,.9,1.1]);arm.rotation.z=a;const module=box(g,edge,[Math.cos(a)*26,Math.sin(a)*26,0],[5,3.6,4]);module.rotation.z=a;}
 for(const x of [-35,35]){box(g,dark,[x,0,0],[22,.8,1]);box(g,solar,[x,0,0],[13,.4,29]);}
 return g;
}
export function createSpaceMap(scene){
 const root=new T.Group();root.name='Orbital exclusion zone';scene.add(root);root.add(makeStars());
 const globe=planet(),station=distantStation();root.add(globe,station);
 const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;const ctx=glowCanvas.getContext('2d');
 const grad=ctx.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,'rgba(255,244,216,1)');grad.addColorStop(.08,'rgba(255,231,186,.9)');grad.addColorStop(.28,'rgba(236,179,109,.12)');grad.addColorStop(1,'rgba(236,179,109,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
 const lightSprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(glowCanvas),transparent:true,depthWrite:false,blending:T.AdditiveBlending,fog:false}));lightSprite.position.set(-140,100,-370);lightSprite.scale.set(75,75,1);root.add(lightSprite);
 const debris=[];
 for(let i=0;i<30;i++){
  const side=i%2?1:-1,mesh=i%5===0?satellite():new T.Mesh(rockGeo,rockMaterial);
  const radius=i%5===0?2:2+(i*7%11)*.45;mesh.scale.setScalar(radius);
  mesh.position.set(side*(27+(i*13%43)),(i*17%52)-24,30-i*18);root.add(mesh);
  debris.push({mesh,startZ:mesh.position.z,phase:i*.77});
 }
 function update(distance,time){
  globe.rotation.y=time*.0015;station.rotation.z=-.25+time*.012;
  for(const o of debris){o.mesh.position.z=80-((80-o.startZ-distance)%540+540)%540;o.mesh.rotation.set(o.phase+time*.025,time*.03+o.phase,o.phase*.3);}
 }
 update(0,0);root.visible=false;
 return {root,update,reset:()=>update(0,0),renderReflection(){}};
}
export function createThrusters(aircraft){
 const root=new T.Group();root.name='Orbital ion thrusters';aircraft.add(root);
 const geometry=new T.CylinderGeometry(.025,.46,1,16,1,true);geometry.rotateX(Math.PI/2);geometry.translate(0,0,.5);
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,uniforms:{time:{value:0}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform float time;varying vec2 vUv;void main(){float fade=pow(1.-vUv.y,1.7);float pulse=.82+.18*sin(vUv.y*45.-time*24.);gl_FragColor=vec4(mix(vec3(.15,.4,1.),vec3(.65,.95,1.),fade),fade*pulse*.85);}`});
 const flames=[];
 for(const x of [-.91,.91]){const m=new T.Mesh(geometry,material);m.position.set(x,-.04,7.56);root.add(m);flames.push(m);const core=new T.Mesh(sphereGeo,new T.MeshBasicMaterial({color:0xa1eaff,transparent:true,opacity:.8,blending:T.AdditiveBlending,depthWrite:false}));core.position.copy(m.position);core.scale.set(.37,.18,.15);root.add(core);}
 root.visible=false;
 return {root,update(time,active){material.uniforms.time.value=time;for(let i=0;i<flames.length;i++)flames[i].scale.z=(active?4.2:2.2)*(1+Math.sin(time*19+i)*.07);}};
}
