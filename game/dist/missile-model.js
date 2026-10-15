import * as T from './vendor/three.module.js';

// Original visual asset. Local +Z points toward the target; the exhaust is -Z.
// All instances share immutable geometry/materials (three draws per missile).
let template;
const forward = new T.Vector3(0, 0, 1);

function buildMissile() {
  const root = new T.Group(); root.name = 'enemy-missile';
  const positions = [], normals = [], colors = [];
  const add = (geometry, color) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.attributes.position, n = g.attributes.normal, c = new T.Color(color);
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(c.r, c.g, c.b);
    }
    if (g !== geometry) g.dispose();
    geometry.dispose();
  };
  const cylinder = (top, bottom, length, z, color) => {
    add(new T.CylinderGeometry(top, bottom, length, 12).rotateX(Math.PI / 2).translate(0, 0, z), color);
  };
  cylinder(.115, .125, .96, -.04, 0xcbd5d8);
  add(new T.ConeGeometry(.115, .36, 12).rotateX(Math.PI / 2).translate(0, 0, .62), 0x293442);
  cylinder(.121, .121, .055, .29, 0xc94232);
  cylinder(.129, .129, .07, -.39, 0xc94232);
  cylinder(.12, .09, .13, -.565, 0x3b424c);
  add(new T.TorusGeometry(.085, .018, 4, 12).translate(0, 0, -.635), 0x959da7);

  // Thin closed swept fins, rather than intersecting flat double-sided planes.
  const fin = (outline, angle, color) => {
    const vertices = [-.011, .011].flatMap(y => outline.map(([x,z]) => [x,y,z]));
    const faces = [[0,2,1],[0,3,2],[4,5,6],[4,6,7]];
    for(let i=0;i<4;i++) { const j=(i+1)%4; faces.push([i,j,j+4],[i,j+4,i+4]); }
    const center = new T.Vector3();
    vertices.forEach(v => center.add(new T.Vector3(...v))); center.divideScalar(8);
    const data = [];
    for (let face of faces) {
      const [a,b,c] = face.map(i => new T.Vector3(...vertices[i]));
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.dot(a.clone().add(b).add(c).divideScalar(3).sub(center)) < 0) face = [face[0],face[2],face[1]];
      face.forEach(i => data.push(...vertices[i]));
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(data,3));
    g.computeVertexNormals(); g.rotateZ(angle); add(g,color);
  };
  for(let i=0;i<4;i++) {
    const angle=i*Math.PI/2+Math.PI/4;
    fin([[.1,-.12],[.34,-.43],[.34,-.61],[.1,-.5]],angle,0x778b99);
    fin([[.105,.32],[.2,.17],[.2,.07],[.105,.13]],angle,0xcbd5d8);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors,3));
  geometry.computeBoundingSphere();
  const body = new T.Mesh(geometry, new T.MeshStandardMaterial({vertexColors:true,metalness:.62,roughness:.34,envMapIntensity:1.3}));
  body.name='missile-body';root.add(body);

  const exhaust = new T.Group(); exhaust.name='missile-exhaust'; exhaust.position.z=-.64;
  const flame = (radius,length,color,opacity) => {
    const g=new T.ConeGeometry(radius,length,10,1,true).rotateX(-Math.PI/2).translate(0,0,-length/2);
    const material=new T.MeshBasicMaterial({color,transparent:true,opacity,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,toneMapped:false});
    const mesh=new T.Mesh(g,material);mesh.renderOrder=1;exhaust.add(mesh);
  };
  flame(.13,1.12,0xff5218,.58);
  flame(.075,.65,0xffefac,.9);
  root.add(exhaust);
  return root;
}

export function createEnemyMissile(velocity) {
  template ??= buildMissile();
  const missile=template.clone(true);
  if(velocity.lengthSq()>0)missile.quaternion.setFromUnitVectors(forward,velocity.clone().normalize());
  return missile;
}

export function animateEnemyMissile(missile,age,phase=0) {
  const exhaust=missile.getObjectByName('missile-exhaust');
  const pulse=Math.sin(age*43+phase)*.1+Math.sin(age*79+phase)*.06;
  exhaust.scale.set(1-pulse*.3,1-pulse*.3,1+pulse);
}
