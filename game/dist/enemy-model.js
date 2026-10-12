import * as T from './vendor/three.module.js';
import { applyAirframeSurface } from './airframe-surface.js';

// Original visual game asset inspired by the Su-35S silhouette; +Z is the nose.
// Shared immutable geometry/materials keep repeated enemies inexpensive.
export const ENEMY_EXTENTS = Object.freeze({ x: 1.86, y: 1.02, z: 2.5 });
let template;
function buildTemplate() {
  const group = new T.Group(), pieces = [];
  const material = (color, metalness, roughness, extra = {}) => new T.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  const mats = {
    skin: material(0x718e9d, .65, .34), camo: material(0x334f66, .55, .4),
    nose: material(0xb9c2c5, .3, .48), glass: material(0x173b4b, .75, .12),
    metal: material(0x59606a, .9, .27), dark: material(0x0b151e, .15, .7),
    red: material(0xe35153, .4, .34, { emissive: 0x650d16, emissiveIntensity: .45 }),
    glow: new T.MeshBasicMaterial({ color: 0xff934f })
  };
  const add = (name, geometry, mat, position = [0,0,0], rotation = [0,0,0]) => {
    const mesh = new T.Mesh(geometry, mats[mat]); mesh.name = name;
    mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.updateMatrix(); pieces.push(mesh); return mesh;
  };
  // Elliptical fuselage loft. Smooth normals keep curves legible at close range.
  const loft = (name, sections, mat, sides = 24, x = 0) => {
    const rows = [];
    for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < 3; j++) {
      const t = j / 3; rows.push(sections[i].map((v,k) => T.MathUtils.lerp(v, sections[i+1][k], t)));
    }
    rows.push(sections.at(-1));
    const positions = [], indices = [];
    for (const [z,y,w,h] of rows) for (let i = 0; i < sides; i++) {
      const a = i * Math.PI * 2 / sides; positions.push(x + w*Math.cos(a), y + h*Math.sin(a), z);
    }
    for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < sides; k++) {
      const a=j*sides+k,b=j*sides+(k+1)%sides,c=b+sides,d=a+sides; indices.push(a,b,c,a,c,d);
    }
    for (const [row, reverse] of [[0,true],[rows.length-1,false]]) {
      const center=positions.length/3; positions.push(x,rows[row][1],rows[row][0]);
      for (let k=0;k<sides;k++) { const a=row*sides+k,b=row*sides+(k+1)%sides; indices.push(center,...(reverse?[b,a]:[a,b])); }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();add(name,g,mat);
  };
  // Closed convex plates with thickness along the face normal (also works for fins).
  const plate = (name, points, mat, thickness=.045) => {
    const p=points.map(v=>new T.Vector3(...v));
    const normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();
    const vertices=[...p.map(v=>v.clone().addScaledVector(normal,thickness/2)),...p.map(v=>v.clone().addScaledVector(normal,-thickness/2))];
    const center=vertices.reduce((sum,v)=>sum.add(v),new T.Vector3()).divideScalar(vertices.length), faces=[],n=p.length;
    for(let i=1;i<n-1;i++)faces.push([0,i,i+1],[n,n+i+1,n+i]);
    for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,j,j+n],[i,j+n,i+n]);}
    const positions=[];
    for(let face of faces){const [a,b,c]=face.map(i=>vertices[i]);const normal=b.clone().sub(a).cross(c.clone().sub(a));
      if(normal.dot(a.clone().add(b).add(c).divideScalar(3).sub(center))<0)face=[face[0],face[2],face[1]];
      for(const i of face)positions.push(...vertices[i].toArray());}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();add(name,g,mat);
  };
  loft('blended-fuselage', [[-2.05,.02,.15,.11],[-1.65,.04,.36,.17],[-.85,.05,.52,.21],[0,.03,.57,.23],[.7,.035,.39,.23],[1.3,.04,.25,.19],[1.72,.055,.18,.14]],'skin');
  loft('long-radome', [[1.68,.055,.185,.145],[1.98,.04,.13,.115],[2.27,.025,.065,.065],[2.48,0,.003,.004]],'nose');
  loft('canopy-frame', [[.65,.23,.02,.02],[.85,.27,.205,.14],[1.12,.25,.18,.16],[1.4,.21,.075,.07],[1.49,.18,.01,.01]],'dark',20);
  loft('single-seat-canopy', [[.72,.26,.015,.015],[.88,.3,.177,.16],[1.1,.3,.153,.18],[1.35,.245,.067,.08],[1.44,.21,.008,.008]],'glass',24);
  // Offset IRST fairing in front of the windscreen.
  add('irst-fairing',new T.SphereGeometry(.052,10,8),'metal',[-.10,.245,1.43]);
  for(const s of [-1,1]) {
    const side=s<0?'left':'right', pts=list=>list.map(([x,y,z])=>[s*x,y,z]);
    plate(side+'-wing',pts([[.34,.015,.62],[1.8,-.035,-.7],[1.78,-.045,-1.0],[.45,.015,-1.19]]),'skin',.06);
    plate(side+'-lerx',pts([[.22,.04,1.2],[.54,.01,.68],[.92,-.01,-.24],[.38,.08,-.46]]),'skin');
    plate(side+'-wing-camo',pts([[.56,.054,.20],[1.49,-.001,-.57],[1.22,.006,-.75],[.49,.052,-.46]]),'camo',.008);
    plate(side+'-flaperon',pts([[.73,.027,-.98],[1.68,-.017,-.85],[1.66,-.021,-.98],[.73,.02,-1.14]]),'camo',.012);
    plate(side+'-horizontal-tail',pts([[.42,.055,-1.39],[1.15,.018,-1.6],[1.38,.0,-2.12],[.42,.035,-2.23]]),'skin',.047);
    plate(side+'-tail-camo',pts([[.54,.086,-1.61],[1.16,.04,-1.86],[1.21,.035,-2.06],[.57,.07,-2.12]]),'camo',.008);
    // Su-35S has conventional twin fins and no foreplane/canard.
    plate(side+'-vertical-tail',pts([[.45,.16,-.92],[.55,.96,-1.42],[.56,.97,-1.71],[.46,.17,-2.18]]),'camo',.04);
    plate(side+'-tail-recognition',pts([[.577,.57,-1.39],[.587,.82,-1.5],[.588,.82,-1.64],[.579,.57,-1.58]]),'red',.008);
    loft(side+'-engine', [[-2.14,-.125,.195,.20],[-1.9,-.105,.255,.25],[-1.15,-.10,.285,.255],[-.45,-.13,.25,.25],[.34,-.15,.215,.22]],'skin',24,s*.38);
    // Rectangular underslung intake, set ahead of the engine body.
    add(side+'-intake-rim',new T.BoxGeometry(.43,.32,.24),'metal',[s*.38,-.16,.47]);
    add(side+'-intake-mouth',new T.BoxGeometry(.345,.24,.014),'dark',[s*.38,-.16,.599]);
    const nozzle=add(side+'-round-nozzle',new T.CylinderGeometry(.197,.175,.30,20,1,true),'metal',[s*.38,-.125,-2.18],[Math.PI/2,0,0]);
    nozzle.material.side=T.DoubleSide;
    add(side+'-nozzle-throat',new T.CircleGeometry(.169,20),'dark',[s*.38,-.125,-2.315],[0,Math.PI,0]);
    add(side+'-exhaust-core',new T.CircleGeometry(.095,16),'glow',[s*.38,-.125,-2.323],[0,Math.PI,0]);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6;
      add(side+'-nozzle-petal',new T.BoxGeometry(.012,.028,.21),'metal',[s*.38+.187*Math.cos(a),-.125+.187*Math.sin(a),-2.185],[0,0,a-Math.PI/2]);
    }
    loft(side+'-wingtip-pod',[[-1.15,-.025,.025,.025],[-.96,-.025,.045,.045],[-.49,-.025,.04,.04],[-.36,-.025,.006,.006]],'camo',10,s*1.79);
    add(side+'-red-tip',new T.SphereGeometry(.052,8,6),'red',[s*1.79,-.02,-.39]);
  }
  loft('tail-stinger',[[-2.42,.01,.012,.014],[-2.19,.025,.075,.06],[-1.61,.04,.12,.095]],'skin',16);
  // Merge by material: 8 draw calls per enemy instead of one per detail.
  const names=pieces.map(p=>p.name);
  for(const [name,mat] of Object.entries(mats)) {
    const positions=[],normals=[];
    for(const piece of pieces.filter(p=>p.material===mat)) {
      const g=piece.geometry.index?piece.geometry.toNonIndexed():piece.geometry.clone();g.applyMatrix4(piece.matrix);
      positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);g.dispose();piece.geometry.dispose();
    }
    if(!positions.length)continue;
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.computeBoundingSphere();
    const mesh=new T.Mesh(g,mat);mesh.name='su35-'+name;group.add(mesh);
  }
  applyAirframeSurface(group.children.filter(mesh=>['su35-skin','su35-camo','su35-nose'].includes(mesh.name)),'su35');
  group.name='Su-35 inspired enemy';group.userData.parts=names;
  return group;
}
export function createEnemyAircraft() {
  template ??= buildTemplate();
  return template.clone(true);
}
