import * as T from './vendor/three.module.js';

// Local NASA Blue Marble imagery; attribution is bundled beside the textures.
export const ORBIT_SUN = new T.Vector3(-.78,.48,.39).normalize();
const vertexShader = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`;
function fallback(r,g,b){const t=new T.DataTexture(new Uint8Array([r,g,b,255]),1,1);t.needsUpdate=true;return t;}
export function createEarth(){
 const root=new T.Group();root.position.set(88,-48,-295);root.name='Earth / layered Blue Marble';
 const uniforms={dayMap:{value:fallback(7,20,38)},cloudMap:{value:fallback(0,0,0)},sunDirection:{value:ORBIT_SUN},cloudShift:{value:0}};
 const surface=new T.Mesh(new T.SphereGeometry(112,112,72),new T.ShaderMaterial({uniforms,vertexShader,fragmentShader:`
 uniform sampler2D dayMap;uniform sampler2D cloudMap;uniform vec3 sunDirection;uniform float cloudShift;
 varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
 void main(){
  vec3 n=normalize(vNormal),view=normalize(cameraPosition-vWorld),light=sunDirection;
  float nl=dot(n,light),day=smoothstep(-.06,.08,nl);
  vec3 albedo=texture2D(dayMap,vUv).rgb;
  float ocean=smoothstep(.004,.035,albedo.b-max(albedo.r,albedo.g)*1.08);
  albedo=mix(vec3(dot(albedo,vec3(.2126,.7152,.0722))),albedo,.82);
  float cloud=texture2D(cloudMap,vUv+vec2(cloudShift+.0018,.0008)).r;
  float shadow=1.-smoothstep(.16,.8,cloud)*.38*day;
  vec3 color=albedo*(.012+max(0.,nl)*1.34)*shadow;
  float fresnel=.025+.975*pow(1.-max(0.,dot(n,view)),5.);
  float spec=pow(max(0.,dot(n,normalize(light+view))),100.);
  color+=vec3(1.,.92,.78)*spec*ocean*(.12+fresnel)*day*shadow;
  float rim=pow(1.-max(0.,dot(n,view)),4.);
  color+=vec3(.012,.075,.19)*rim*smoothstep(-.15,.4,nl);
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`}));root.add(surface);
 const clouds=new T.Mesh(new T.SphereGeometry(112.28,112,72),new T.ShaderMaterial({uniforms,vertexShader,transparent:true,depthWrite:false,fragmentShader:`
 uniform sampler2D cloudMap;uniform vec3 sunDirection;uniform float cloudShift;
 varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
 void main(){
  float c=texture2D(cloudMap,vUv+vec2(cloudShift,0.)).r;
  float nl=dot(normalize(vNormal),sunDirection);
  float a=smoothstep(.12,.92,c)*.96;
  vec3 color=mix(vec3(.012,.018,.03),vec3(.88,.92,1.),smoothstep(-.08,.16,nl))*(.12+max(0.,nl)*1.3);
  gl_FragColor=vec4(color,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`}));root.add(clouds);
 // Thin optical shell, lit only on the sunward limb; no uniform neon outline.
 const atmosphere=new T.Mesh(new T.SphereGeometry(113.3,112,72),new T.ShaderMaterial({uniforms,vertexShader,transparent:true,depthWrite:false,blending:T.AdditiveBlending,fragmentShader:`
 uniform vec3 sunDirection;varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
 void main(){vec3 n=normalize(vNormal),v=normalize(cameraPosition-vWorld);float mu=max(0.,dot(n,v)),nl=dot(n,sunDirection);
 float rim=pow(1.-mu,4.5),lit=smoothstep(-.22,.35,nl);
 vec3 tint=mix(vec3(.32,.10,.025),vec3(.055,.28,.68),smoothstep(-.08,.24,nl));
 gl_FragColor=vec4(tint,rim*lit*.65);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`}));root.add(atmosphere);
 const loader=new T.TextureLoader(),pending=[];
 for(const [name,file,color] of [['dayMap','earth-day.jpg',true],['cloudMap','earth-clouds.jpg',false]]){
  pending.push(new Promise(resolve=>loader.load(new URL(`./assets/earth/${file}`,import.meta.url).href,texture=>{
   texture.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;texture.wrapS=T.RepeatWrapping;texture.anisotropy=4;
   uniforms[name].value.dispose();uniforms[name].value=texture;resolve();
  },undefined,()=>{resolve();console.warn(`Earth texture unavailable: ${file}; retaining fallback`);})));
 }
 return {root,ready:Promise.all(pending),update(time){root.rotation.set(.10,2.05+time*.0013,-.12);uniforms.cloudShift.value=time*.000012;}};
}
