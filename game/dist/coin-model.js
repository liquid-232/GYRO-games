import * as T from './vendor/three.module.js';

// Procedural recreation of the Mora silhouette and threefold knot motif.
// Local Z is the coin's thickness axis. All pickups share one mesh resource.
let geometry, material;
function buildMora() {
  const positions=[], normals=[], colors=[];
  const add=(source,color)=>{
    const g=source.index?source.toNonIndexed():source;
    const p=g.attributes.position,n=g.attributes.normal,c=new T.Color(color);
    for(let i=0;i<p.count;i++) {
      positions.push(p.getX(i),p.getY(i),p.getZ(i));
      normals.push(n.getX(i),n.getY(i),n.getZ(i));
      colors.push(c.r,c.g,c.b);
    }
    if(g!==source)g.dispose();source.dispose();
  };
  // Closed solid disc with rounded bevels: the previous pickup was a hollow ring.
  const profile=[[0,-.069],[.55,-.069],[.62,-.061],[.665,-.035],[.675,0],[.665,.035],[.62,.061],[.55,.069],[0,.069]];
  add(new T.LatheGeometry(profile.map(([r,z])=>new T.Vector2(r,z)),48).rotateX(Math.PI/2),0xd69a32);

  const point=new T.Vector3(0,.405,0);
  const curve=new T.CubicBezierCurve3(point,new T.Vector3(-.41,-.16,0),new T.Vector3(-.13,-.43,0),point.clone().applyAxisAngle(new T.Vector3(0,0,1),-2*Math.PI/3));
  // A flat ribbon with bevelled shoulders and alternating crossing heights,
  // rather than a round wire drawn on the face. Three rotated arcs form a knot.
  function knot(face) {
    const data=[],color=0xffdc7b,steps=32,width=.038;
    for(let arm=0;arm<3;arm++) {
      const angle=-arm*2*Math.PI/3,c=Math.cos(angle),s=Math.sin(angle);
      const sections=[];
      for(let i=0;i<=steps;i++) {
        const t=i/steps,p=curve.getPoint(t),tangent=curve.getTangent(t);
        const x=p.x*c-p.y*s,y=p.x*s+p.y*c;
        const tx=tangent.x*c-tangent.y*s,ty=tangent.x*s+tangent.y*c;
        // Over/under relief is deliberately small so the knot still feels minted.
        const height=.097+.013*Math.sin(t*Math.PI*2);
        sections.push([[-width,.077],[-width*.68,height],[width*.68,height],[width,.077]].map(([w,z])=>[x-ty*w,y+tx*w,face*z]));
      }
      for(let i=0;i<steps;i++)for(let band=0;band<3;band++) {
        const a=sections[i][band],b=sections[i+1][band],c=sections[i+1][band+1],d=sections[i][band+1];
        // Ribbon order follows its tangent; front and reverse need opposite winding.
        const triangles=face>0?[a,b,c,a,c,d]:[a,c,b,a,d,c];
        for(const v of triangles)data.push(...v);
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data,3));g.computeVertexNormals();add(g,color);
  }
  for(const face of [-1,1]) {
    // Slightly darker recessed field lets the raised golden knot read at a distance.
    const field=new T.CircleGeometry(.557,48);
    if(face<0)field.rotateY(Math.PI);
    field.translate(0,0,face*.071);add(field,0xba7f27);
    add(new T.TorusGeometry(.617,.033,6,48).translate(0,0,face*.066),0xffd46b);
    add(new T.TorusGeometry(.548,.009,4,48).translate(0,0,face*.076),0xf5bc4e);
    knot(face);
    // Three small diamond stamps echo the emblem's threefold symmetry.
    for(let i=0;i<3;i++) {
      const angle=i*Math.PI*2/3,shape=new T.Shape();
      shape.moveTo(0,.022);shape.lineTo(.015,0);shape.lineTo(0,-.022);shape.lineTo(-.015,0);shape.closePath();
      const stamp=new T.ShapeGeometry(shape);if(face<0)stamp.rotateY(Math.PI);
      stamp.translate(0,.493,0).rotateZ(angle).translate(0,0,face*.074);add(stamp,0xffd46b);
    }
  }
  geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.computeBoundingSphere();
  material=new T.MeshStandardMaterial({vertexColors:true,metalness:.8,roughness:.29,envMapIntensity:1.35,emissive:0x6b3808,emissiveIntensity:.16});
}

export function createMoraCoin() {
  if(!geometry)buildMora();
  const coin=new T.Mesh(geometry,material);coin.name='mora-coin';
  coin.rotation.x=-.12;
  return coin;
}
