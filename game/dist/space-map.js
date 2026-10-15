import * as T from './vendor/three.module.js';
import { createEarth } from './earth-model.js';
import { createOrbitalMaterials } from './orbital-materials.js';
// Offline orbital scenery. Static mechanical details are batched by material.
const TAU=Math.PI*2;
let hull,dark,edge,solar,foil;
function prepareMaterials(){if(hull)return;({hull,dark,edge,solar,foil}=createOrbitalMaterials());}
const orange=new T.MeshBasicMaterial({color:0xffac55});
const blue=new T.MeshBasicMaterial({color:0x91becb});
const boxGeo=new T.BoxGeometry(1,1,1),sphereGeo=new T.SphereGeometry(1,16,10);
const rockGeo=new T.IcosahedronGeometry(1,2);
const positions=rockGeo.attributes.position;
for(let i=0;i<positions.count;i++){
 const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
 const f=.83+.10*Math.sin(x*8+y*5)*Math.cos(z*7-x*3)+.06*Math.sin(y*13+z*5);
 positions.setXYZ(i,x*f,y*f,z*f);
}
rockGeo.computeVertexNormals();
const rockMaterial=new T.MeshStandardMaterial({color:0x67645e,roughness:.96,metalness:.04});
rockMaterial.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 rockPoint;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nrockPoint=position;');
 shader.fragmentShader='varying vec3 rockPoint;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float grain=sin(rockPoint.x*73.+sin(rockPoint.y*31.))*cos(rockPoint.z*68.);
 float vein=sin(rockPoint.y*19.+sin(rockPoint.x*12.)+rockPoint.z*8.);
 diffuseColor.rgb*=.88+.05*grain+.055*vein;`);
};
function box(group,material,position,scale){const m=new T.Mesh(boxGeo,material);m.position.set(...position);m.scale.set(...scale);group.add(m);return m;}
function satellite(){
 prepareMaterials();const g=new T.Group();box(g,foil,[0,0,0],[1.3,1.5,1.4]);box(g,edge,[0,.85,0],[1.5,.2,1.6]);
 box(g,dark,[0,0,0],[5,.14,.2]);
 for(const x of [-1.9,1.9]){box(g,edge,[x,0,0],[2,.10,2]);box(g,solar,[x,.07,0],[1.9,.05,1.9]);}
 const dish=new T.Mesh(new T.SphereGeometry(.7,16,8,0,TAU,0,Math.PI*.35),edge);dish.rotation.z=-.6;dish.position.y=1.;g.add(dish);
 box(g,orange,[.5,.9,.4],[.12,.12,.12]);return g;
}
let satelliteTemplate;
export function createOrbitalObstacle(x,y,z,r=1.8,variant=0){
 prepareMaterials();let mesh;
 if(variant%3===1){satelliteTemplate??=satellite();mesh=satelliteTemplate.clone();mesh.scale.setScalar(r/3.35);}
 else {mesh=new T.Mesh(rockGeo,rockMaterial);mesh.scale.setScalar(r);}
 mesh.position.set(x,y,z);
 return {type:'asteroid',mesh,r,spin:.16+variant*.025};
}
// Bake static details once per template, keeping each gate to a few draw calls.
function batchStatic(group){
 group.updateMatrixWorld(true);const batches=new Map();
 group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);let batch=batches.get(o.material);if(!batch){batch={position:[],normal:[],uv:[]};batches.set(o.material,batch);}for(const key of Object.keys(batch)){const a=g.getAttribute(key);for(let i=0;i<a.array.length;i++)batch[key].push(a.array[i]);}g.dispose();});
 const result=new T.Group();for(const [material,attrs] of batches){const geo=new T.BufferGeometry();for(const [name,a] of Object.entries(attrs))geo.setAttribute(name,new T.Float32BufferAttribute(a,name==='uv'?2:3));geo.computeBoundingSphere();result.add(new T.Mesh(geo,material));}return result;
}
const gateRadius=4.7;
let gateTemplate;
function buildGate(){
 const g=new T.Group();g.add(new T.Mesh(new T.TorusGeometry(gateRadius,.4,12,96),dark));
 const arc=TAU/24,shape=new T.Shape();shape.absarc(0,0,5.15,.012,arc-.012,false);shape.absarc(0,0,4.25,arc-.012,.012,true);shape.closePath();
 const armor=new T.ExtrudeGeometry(shape,{depth:.78,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.035,curveSegments:5});armor.translate(0,0,-.39);
 for(let i=0;i<24;i++){const panel=new T.Mesh(armor,i%6===0?dark:hull);panel.rotation.z=i*arc;g.add(panel);}
 for(const radius of [4.3,5.1])for(const z of [-.45,.45]){const rail=new T.Mesh(new T.TorusGeometry(radius,.025,5,96),edge);rail.position.z=z;g.add(rail);}
 const boltGeo=new T.CylinderGeometry(.043,.043,.035,6);boltGeo.rotateX(Math.PI/2);
 for(let i=0;i<24;i++){
  const a=(i+.5)*arc;
  for(const r of [4.38,5.02]){const bolt=new T.Mesh(boltGeo,edge);bolt.position.set(Math.cos(a)*r,Math.sin(a)*r,.45);g.add(bolt);}
  if(i%3===0){
   const mount=box(g,dark,[Math.cos(a)*gateRadius,Math.sin(a)*gateRadius,0],[.8,.4,1.1]);mount.rotation.z=a;
   const light=box(g,blue,[Math.cos(a)*4.38,Math.sin(a)*4.38,.565],[.055,.23,.025]);light.rotation.z=a;
   const caution=box(g,orange,[Math.cos(a)*4.95,Math.sin(a)*4.95,.565],[.16,.045,.02]);caution.rotation.z=a;
  }
 }
 const result=batchStatic(g);const geometry=new Set();g.traverse(o=>{if(o.isMesh&&o.geometry!==boxGeo)geometry.add(o.geometry);});for(const geo of geometry)geo.dispose();return result;
}
export function createOrbitalGate(x,y,z){
 prepareMaterials();gateTemplate??=buildGate();const mesh=gateTemplate.clone();mesh.name='Segmented orbital transit frame';mesh.position.set(x,y,z);
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
function distantStation(){
 const g=new T.Group();
 g.add(new T.Mesh(new T.TorusGeometry(26,1.1,12,96),hull));
 for(const z of [-1.6,1.6]){const rail=new T.Mesh(new T.TorusGeometry(26,.24,8,96),edge);rail.position.z=z;g.add(rail);}
 const core=new T.Mesh(new T.CylinderGeometry(3.2,3.2,19,24),hull);core.rotation.x=Math.PI/2;g.add(core);
 const collar=new T.Mesh(new T.TorusGeometry(3.35,.28,8,32),dark);collar.position.z=8.7;g.add(collar);
 for(let i=0;i<24;i++){
  const a=i/24*TAU,m=box(g,dark,[Math.cos(a)*26,Math.sin(a)*26,0],[2.5,1.2,3.6]);m.rotation.z=a;
  if(i%4===0){const mark=box(g,blue,[Math.cos(a)*26,Math.sin(a)*26,1.85],[.14,.65,.08]);mark.rotation.z=a;}
 }
 for(let i=0;i<6;i++){
  const a=i/6*TAU,arm=new T.Group();arm.rotation.z=a;
  for(const y of [-.65,.65])box(arm,edge,[14,y,0],[23,.22,.24]);
  for(let j=0;j<8;j++){const brace=box(arm,dark,[4+j*2.8,0,0],[2.85,.16,.18]);brace.rotation.z=(j%2?1:-1)*.45;}
  box(arm,hull,[25.8,0,0],[4.6,3.4,4.5]);box(arm,foil,[25.8,0,-2.4],[3.6,2.5,.35]);
  for(let j=0;j<4;j++)box(arm,edge,[24.5+j*.85,0,2.35],[.12,3,.18]);g.add(arm);
 }
 for(const x of [-38,38]){
  box(g,dark,[x,0,0],[26,.7,.9]);
  for(const y of [-5.5,5.5]){box(g,edge,[x,y,0],[17,9.5,.24]);box(g,solar,[x,y,.16],[16.7,9.2,.07]);}
  for(let i=0;i<5;i++)box(g,edge,[x-8+i*4,0,.24],[.1,20,.12]);
 }
 const result=batchStatic(g);const geometry=new Set();g.traverse(o=>{if(o.isMesh&&o.geometry!==boxGeo)geometry.add(o.geometry);});for(const geo of geometry)geo.dispose();
 result.position.set(-66,22,-225);result.rotation.set(.3,.45,-.25);return result;
}
export function createSpaceMap(scene){
 const root=new T.Group();root.name='Orbital exclusion zone';scene.add(root);root.add(makeStars());
 prepareMaterials();const globe=createEarth(),station=distantStation();root.add(globe.root,station);
 const debris=[];
 for(let i=0;i<30;i++){
  const side=i%2?1:-1,mesh=i%5===0?satellite():new T.Mesh(rockGeo,rockMaterial);
  const radius=i%5===0?2:2+(i*7%11)*.45;mesh.scale.setScalar(radius);
  mesh.position.set(side*(27+(i*13%43)),(i*17%52)-24,30-i*18);root.add(mesh);
  debris.push({mesh,startZ:mesh.position.z,phase:i*.77});
 }
 function update(distance,time){
  globe.update(time);station.rotation.z=-.25+time*.012;
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
