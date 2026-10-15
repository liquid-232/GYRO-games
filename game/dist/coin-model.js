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
  // Thick minted blank: recessed faces, stepped shoulders and bevelled edge.
  const profile=[[0,-.105],[.515,-.105],[.535,-.13],[.558,-.166],[.61,-.18],[.647,-.157],[.675,-.115],[.675,.115],[.647,.157],[.61,.18],[.558,.166],[.535,.13],[.515,.105],[0,.105]];
  add(new T.LatheGeometry(profile.map(([r,z])=>new T.Vector2(r,z)),48).rotateX(Math.PI/2),0xc58b2e);

  // Raised edge reeding remains visible when the face turns away from the camera.
  for(let i=0;i<40;i++) {
    const tooth=new T.BoxGeometry(.018,.012,.205);
    tooth.translate(0,.675,0).rotateZ(i*Math.PI*2/40);
    add(tooth,i%2?0xe9b44e:0xf5c768);
  }

  const point=new T.Vector3(0,.405,0);
  const curve=new T.CubicBezierCurve3(point,new T.Vector3(-.41,-.16,0),new T.Vector3(-.13,-.43,0),point.clone().applyAxisAngle(new T.Vector3(0,0,1),-2*Math.PI/3));
  // High relief ribbons: dark vertical walls, bevels, and a broad polished top.
  // Bake these color differences into the same mesh, keeping one draw per coin.
  function knot(face) {
    const bands=Array.from({length:5},()=>[]),steps=40,width=.047;
    for(let arm=0;arm<3;arm++) {
      const angle=-arm*2*Math.PI/3,c=Math.cos(angle),s=Math.sin(angle);
      const sections=[];
      for(let i=0;i<=steps;i++) {
        const t=i/steps,p=curve.getPoint(t),tangent=curve.getTangent(t);
        const x=p.x*c-p.y*s,y=p.x*s+p.y*c;
        const tx=tangent.x*c-tangent.y*s,ty=tangent.x*s+tangent.y*c;
        const height=.221+.026*Math.sin(t*Math.PI*2);
        const profile=[[-width,.108],[-width,height-.022],[-width*.68,height],
          [width*.68,height],[width,height-.022],[width,.108]];
        sections.push(profile.map(([w,z])=>[x-ty*w,y+tx*w,face*z]));
      }
      for(let i=0;i<steps;i++)for(let band=0;band<5;band++) {
        const a=sections[i][band],b=sections[i+1][band],c=sections[i+1][band+1],d=sections[i][band+1];
        const triangles=face>0?[a,b,c,a,c,d]:[a,c,b,a,d,c];
        for(const v of triangles)bands[band].push(...v);
      }
    }
    const shades=[0x98601c,0xe9b752,0xffdf87,0xe9b752,0x98601c];
    bands.forEach((data,i)=>{
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data,3));
      g.computeVertexNormals();add(g,shades[i]);
    });
  }
  for(const face of [-1,1]) {
    // Slightly darker recessed field lets the raised golden knot read at a distance.
    const field=new T.CircleGeometry(.516,48);
    if(face<0)field.rotateY(Math.PI);
    field.translate(0,0,face*.106);add(field,0xa76e23);
    add(new T.TorusGeometry(.611,.027,8,48).translate(0,0,face*.166),0xffd46b);
    add(new T.TorusGeometry(.526,.012,6,48).translate(0,0,face*.126),0xf5bc4e);
    knot(face);
    // Three small diamond stamps echo the emblem's threefold symmetry.
    for(let i=0;i<3;i++) {
      const angle=i*Math.PI*2/3,shape=new T.Shape();
      shape.moveTo(0,.022);shape.lineTo(.015,0);shape.lineTo(0,-.022);shape.lineTo(-.015,0);shape.closePath();
      const stamp=new T.ExtrudeGeometry(shape,{depth:.025,steps:1,bevelEnabled:true,bevelSegments:1,bevelSize:.004,bevelThickness:.004});if(face<0)stamp.rotateY(Math.PI);
      stamp.translate(0,.493,0).rotateZ(angle).translate(0,0,face*.111);add(stamp,0xffd46b);
    }
  }
  geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.computeBoundingSphere();
  material=new T.MeshStandardMaterial({vertexColors:true,metalness:.76,roughness:.32,envMapIntensity:1.25,emissive:0x6b3808,emissiveIntensity:.035});
}

export function createMoraCoin() {
  if(!geometry)buildMora();
  const coin=new T.Mesh(geometry,material);coin.name='mora-coin';
  // A slight two-axis tilt exposes the edge even at the face-on part of the spin.
  coin.rotation.set(.3,0,.1);
  return coin;
}
