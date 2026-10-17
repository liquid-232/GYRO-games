import * as T from './vendor/three.module.js';

// 固定空战场景：地形查询与网格共用同一高度函数；天空和海面保持独立预算。
const SEA=-3,TAU=Math.PI*2;
const LAYOUT=[[-650,-650,245,205,200,1],[600,-540,280,170,225,4],[-790,350,185,260,165,7],[680,580,250,220,185,11],[-180,-820,145,110,145,13],[160,50,110,145,100,17],[-330,130,125,90,130,22],[70,850,200,140,120,25],[-950,-200,95,110,190,28],[970,20,125,185,160,32]];
function edge(a,seed){return 1+.09*Math.sin(a*3+seed)+.055*Math.cos(a*5-seed);}
function landHeight(u,v,h,seed){
 const r=Math.hypot(u,v);if(r>=1)return -.4;
 const dome=Math.pow(Math.max(0,1-r*r),.72);
 const ridge=.58+.22*Math.sin(u*6+seed)*Math.cos(v*5-seed)+.17*Math.sin(u*11+v*8+seed);
 // 高岸壁与不规则山脊形成清晰剪影，避免所有岛屿都是圆馒头。
 return Math.max(-.4,h*dome*ridge-2.2);
}
function makeIsland(rx,rz,h,seed){
 const rings=32,slices=80,p=[0,landHeight(0,0,h,seed),0],idx=[],colors=[];
 for(let j=1;j<=rings;j++)for(let i=0;i<slices;i++){const a=i/slices*TAU,r=j/rings,u=r*Math.cos(a),v=r*Math.sin(a),e=edge(a,seed);p.push(u*rx*e,landHeight(u,v,h,seed),v*rz*e);}
 for(let i=0;i<slices;i++)idx.push(0,1+(i+1)%slices,1+i);
 for(let j=1;j<rings;j++)for(let i=0;i<slices;i++){const a=1+(j-1)*slices+i,b=1+(j-1)*slices+(i+1)%slices;idx.push(a,b,a+slices,b,b+slices,a+slices);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();const normals=g.attributes.normal,c=new T.Color(),grass=new T.Color(0x195b3f),ridge=new T.Color(0x537c42),rock=new T.Color(0xbec6b4),sand=new T.Color(0xf0d6a1);
 for(let i=0;i<p.length/3;i++){const y=p[i*3+1],n=normals.getY(i),patch=.5+.5*Math.sin(p[i*3]*.035+seed)*Math.cos(p[i*3+2]*.045);c.copy(rock).lerp(grass,T.MathUtils.smoothstep(n,.25,.68)).lerp(ridge,patch*.25*T.MathUtils.smoothstep(n,.5,.9));c.lerp(sand,1-T.MathUtils.smoothstep(y,1,9));c.multiplyScalar(.88+.12*patch);colors.push(c.r,c.g,c.b);}
 g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeBoundingSphere();return g;
}
function cloudTexture(){
 // 四种云形共用图集：高度场估算法线，保留亮顶、蓝灰云底和自然轮廓。
 const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d'),image=ctx.createImageData(512,256);
 for(let tile=0;tile<4;tile++){
  const heights=new Float32Array(256*128),puffs=[];
  for(let i=0;i<10;i++){const r=.12+((i*17+tile*11)%19)/100,x=.18+i*.068;puffs.push({x,y:.48+Math.sin(i*2.3+tile)*.1,rx:Math.min(r,x-.025,.975-x),ry:r*1.15,z:r});}
  for(let y=0;y<128;y++)for(let x=0;x<256;x++){let h=0;const u=x/256,v=y/128;for(const p of puffs){const d=((u-p.x)/p.rx)**2+((v-p.y)/p.ry)**2;if(d<1){const cap=Math.sqrt(1-d)*p.z,k=.07,blend=Math.max(0,k-Math.abs(h-cap));h=Math.max(h,cap)+blend*blend/(4*k);}}heights[y*256+x]=h;}
  for(let y=1;y<127;y++)for(let x=1;x<255;x++){const h=heights[y*256+x];if(h<=0)continue;const nx=(heights[y*256+x-1]-heights[y*256+x+1])*65,ny=(heights[(y-1)*256+x]-heights[(y+1)*256+x])*40;const light=Math.max(0,(-nx*.4-ny*.6+.7)/Math.hypot(nx,ny,1));const shade=Math.min(1,.25+light*.75),i=(((tile>>1)*128+y)*512+(tile%2)*256+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=Math.round(shade*255);image.data[i+3]=Math.round(Math.min(1,h*38)*255);}
 }
 ctx.putImageData(image,0,0);return new T.CanvasTexture(c);
}
export function createAceEnvironment(parent,camera){
 const root=new T.Group();root.name='Azure archipelago';parent.add(root);const geometries=[],materials=[],textures=[],clock={value:0};
 const gradient=new T.DataTexture(new Uint8Array([80,140,200,255]),4,1,T.RedFormat);gradient.minFilter=gradient.magFilter=T.NearestFilter;gradient.needsUpdate=true;textures.push(gradient);
 const terrainMaterial=new T.MeshToonMaterial({vertexColors:true,gradientMap:gradient});materials.push(terrainMaterial);
 const islands=LAYOUT.map(([x,z,rx,rz,h,seed])=>{const geometry=makeIsland(rx,rz,h,seed),mesh=new T.Mesh(geometry,terrainMaterial);mesh.position.set(x,SEA,z);root.add(mesh);geometries.push(geometry);return {x,z,rx,rz,h,seed,mesh};});
 const treeGeo=new T.ConeGeometry(1,3.4,5),treeMat=new T.MeshToonMaterial({color:0x2e6943,gradientMap:gradient}),trees=new T.InstancedMesh(treeGeo,treeMat,700),treeObject=new T.Object3D();let treeCount=0;
 for(const island of islands)for(let j=0;j<100&&treeCount<700;j++){
  const angle=j*2.39996+island.seed,r=.16+Math.sqrt((j*37%97)/97)*.69,u=Math.cos(angle)*r,v=Math.sin(angle)*r,e=edge(angle,island.seed),x=u*island.rx*e,z=v*island.rz*e,h=landHeight(u,v,island.h,island.seed);
  const slope=Math.hypot((landHeight(u+.01,v,island.h,island.seed)-h)/(island.rx*.01),(landHeight(u,v+.01,island.h,island.seed)-h)/(island.rz*.01));if(h<8||slope>.9)continue;
  const scale=2+(j*13%17)*.12;treeObject.position.set(island.x+x,SEA+h+scale*1.35,island.z+z);treeObject.rotation.y=j;treeObject.scale.setScalar(scale);treeObject.updateMatrix();trees.setMatrixAt(treeCount++,treeObject.matrix);
 }
 trees.count=treeCount;trees.computeBoundingSphere();root.add(trees);geometries.push(treeGeo);materials.push(treeMat);
 const skyMaterial=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,depthTest:false,uniforms:{uTime:clock},vertexShader:`varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,fragmentShader:`varying vec3 vDir;uniform float uTime;
 void main(){vec3 d=normalize(vDir);float h=max(0.,d.y);vec3 horizon=vec3(.13,.43,.62),zenith=vec3(.002,.045,.18);vec3 color=mix(horizon,zenith,pow(h,.38));
 float sun=max(0.,dot(d,normalize(vec3(-.48,.65,-.58))));color+=vec3(.6,.55,.32)*pow(sun,32.)*.22+vec3(1.4,1.15,.8)*pow(sun,1900.);

 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const skyGeo=new T.SphereGeometry(3000,32,16),sky=new T.Mesh(skyGeo,skyMaterial);sky.renderOrder=-1000;sky.frustumCulled=false;root.add(sky);geometries.push(skyGeo);materials.push(skyMaterial);
 const cloudMap=cloudTexture();textures.push(cloudMap);const cloudMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uMap:{value:cloudMap}},vertexShader:`attribute float aCloud;varying vec2 vUv;varying float vDepth;void main(){vUv=uv*.5+vec2(mod(aCloud,2.)*.5,floor(aCloud/2.)*.5);vec4 p=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vec2 s=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));p.xy+=position.xy*s;vDepth=-p.z;gl_Position=projectionMatrix*p;}`,fragmentShader:`uniform sampler2D uMap;varying vec2 vUv;varying float vDepth;void main(){vec4 tex=texture2D(uMap,vUv);float mask=tex.a;if(mask<.02)discard;vec3 color=mix(vec3(.018,.095,.18),vec3(.94,.98,1.),smoothstep(.35,.88,tex.r));float fade=1.-smoothstep(2300.,3800.,vDepth);gl_FragColor=vec4(color,mask*.97*fade);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const cloudGeo=new T.PlaneGeometry(1,1),clouds=new T.InstancedMesh(cloudGeo,cloudMaterial,48),matrix=new T.Matrix4(),q=new T.Quaternion(),v=new T.Vector3(),scale=new T.Vector3();
 cloudGeo.setAttribute('aCloud',new T.InstancedBufferAttribute(Float32Array.from({length:48},(_,i)=>i%4),1));
 for(let i=0;i<48;i++){const angle=i*2.39996,ring=1050+(i%5)*320;v.set(Math.cos(angle)*ring,430+(i%7)*58,Math.sin(angle)*ring);scale.set(350+(i*73%260),125+(i*31%100),1);matrix.compose(v,q,scale);clouds.setMatrixAt(i,matrix);}
 clouds.frustumCulled=false;clouds.renderOrder=-10;root.add(clouds);geometries.push(cloudGeo);materials.push(cloudMaterial);
 const coastData=LAYOUT.map(([x,z,rx,rz])=>new T.Vector4(x,z,rx,rz));
 const seaMaterial=new T.ShaderMaterial({uniforms:{uTime:clock,uCoasts:{value:coastData},uSeeds:{value:LAYOUT.map(v=>v[5])},uDetail:{value:0}},vertexShader:`varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,fragmentShader:`uniform float uTime;uniform float uDetail;uniform vec4 uCoasts[10];uniform float uSeeds[10];varying vec3 vWorld;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
 void main(){vec2 p=vWorld.xz;float t=uTime;float d=50.;for(int i=0;i<10;i++){vec4 c=uCoasts[i];vec2 v=(p-c.xy)/c.zw;float a=atan(v.y,v.x);float e=1.+.09*sin(a*3.+uSeeds[i])+.055*cos(a*5.-uSeeds[i]);d=min(d,length(v)/e);}
 float coast=d+(noise(p*.025)-.5)*.08;float reef=1.-smoothstep(1.02,1.5,coast);float dist=length(cameraPosition-vWorld);
 float wx=dot(p,vec2(.055,.085))+t*.8,wz=dot(p,vec2(-.12,.04))-t*1.1;
 float warp=noise(p*.026)*3.;vec3 n=normalize(vec3(-cos(wx+warp)*.035-cos(wz)*.025,1.,-cos(wx+warp)*.04-cos(wz)*.02));
 if(uDetail>.5){float rip=noise(p*.75+vec2(t*.2,-t*.15))-.5;n.xz+=rip*.035;}
 vec3 view=normalize(cameraPosition-vWorld),sun=normalize(vec3(-.48,.65,-.58));float fresnel=pow(1.-max(0.,view.y),5.);
 vec3 deep=vec3(.001,.024,.078),shallow=vec3(.008,.26,.23);vec3 color=mix(deep,shallow,reef*.85);color*=.94+.06*noise(p*.1+vec2(t*.12,0.));
 vec3 sky=mix(vec3(.055,.23,.38),vec3(.006,.065,.17),max(0.,reflect(-view,n).y));color=mix(color,sky,.05+fresnel*.25);
 float shine=pow(max(0.,dot(n,normalize(view+sun))),180.);color+=vec3(.95,.88,.63)*shine*.7*(.35+.65*noise(p*.7));
 float foam=(1.-smoothstep(.008,.026,abs(coast-1.025-sin(t*.65)*.015)))*(.5+.5*noise(p*.18-t*.18));
 float breakWave=pow(max(0.,sin((coast-1.)*70.-t*1.7)),18.)*(1.-smoothstep(1.05,1.22,coast))*smoothstep(.99,1.04,coast);
 float caustic=pow(1.-abs(sin(p.x*.21+sin(p.y*.17+t*.6))*cos(p.y*.19-t*.4)),18.);color+=vec3(.12,.21,.12)*caustic*reef*.15;
 color=mix(color,vec3(.78,.94,.94),clamp(foam*.8+breakWave*.3,0.,.85));float haze=smoothstep(1800.,5500.,dist);color=mix(color,vec3(.13,.43,.62),haze);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const seaGeo=new T.PlaneGeometry(9000,9000);seaGeo.rotateX(-Math.PI/2);const sea=new T.Mesh(seaGeo,seaMaterial);sea.position.y=SEA;root.add(sea);geometries.push(seaGeo);materials.push(seaMaterial);
 function heightAt(x,z){let h=SEA;for(const i of islands){const u=(x-i.x)/i.rx,v=(z-i.z)/i.rz;if(u*u+v*v>1.4)continue;const e=edge(Math.atan2(v,u),i.seed);h=Math.max(h,SEA+landHeight(u/e,v/e,i.h,i.seed)+.5);}return h;}
 return {root,islands,heightAt,update(distance,elapsed){clock.value=elapsed;sky.position.copy(camera.position);},reset(){clock.value=0;},renderReflection(){},setQuality(profile){seaMaterial.uniforms.uDetail.value=profile.waterDetail;},dispose(){root.removeFromParent();clouds.dispose();trees.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
