import * as T from './vendor/three.module.js';

// ORION: original preview-only spacecraft. Y up, nose -Z; dimensions match
// the existing aircraft asset convention, but this module does not alter gameplay.
export function createSpaceplane() {
  const ship=new T.Group();ship.name='ORION spaceplane';
  const batches=new Map();
  const mats={
    shell:new T.MeshStandardMaterial({color:0xc4d2d9,metalness:.72,roughness:.29}),
    titanium:new T.MeshStandardMaterial({color:0x273743,metalness:.86,roughness:.32}),
    trim:new T.MeshStandardMaterial({color:0xa88b52,metalness:.82,roughness:.3}),
    glass:new T.MeshStandardMaterial({color:0x092332,metalness:.75,roughness:.09}),
    dark:new T.MeshStandardMaterial({color:0x070e14,metalness:.5,roughness:.6}),
    blue:new T.MeshBasicMaterial({color:0x53dcff,toneMapped:false}),
    white:new T.MeshBasicMaterial({color:0xdcfaff,toneMapped:false})
  };
  const add=(g,mat)=>{
    const geo=g.index?g.toNonIndexed():g;
    if(!batches.has(mat))batches.set(mat,{p:[],n:[]});
    const b=batches.get(mat);b.p.push(...geo.attributes.position.array);b.n.push(...geo.attributes.normal.array);
    if(geo!==g)geo.dispose();g.dispose();
  };
  const ring=(r,t,x,y,z,mat='titanium')=>add(new T.TorusGeometry(r,t,8,48).translate(x,y,z),mat);
  const tube=(points,r,mat)=>add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),points.length*8,r,5,false),mat);
  const hull=(sections,mat)=>{
    const rows=[];
    const curves=[0,1,2,3].map(k=>new T.CatmullRomCurve3(sections.map((s,i)=>new T.Vector3(i,s[k],0)),false,'centripetal'));
    // Interpolate the elliptical profile along stations; smooth normals blend rings.
    for(let i=0;i<=64;i++){const t=i/64;rows.push(curves.map(c=>c.getPoint(t).y));}
    const p=[],idx=[],sides=40;
    for(const [z,y,w,h] of rows)for(let j=0;j<sides;j++){const a=j*2*Math.PI/sides;p.push(w*Math.cos(a),y+h*Math.sin(a),z);}
    for(let i=0;i<rows.length-1;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides,c=b+sides,d=a+sides;idx.push(a,b,c,a,c,d);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();add(g,mat);
  };
  hull([[-8.4,-.14,.025,.025],[-6.4,-.05,.57,.34],[-3.7,.02,1.25,.65],[-.7,0,2.1,.88],[2.1,-.1,2.35,1.12],[4.1,-.18,1.9,1.22],[4.65,-.2,1.54,1.05]],'shell');
  const plate=(points,y,depth,mat)=>{
    const shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
    add(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.055,bevelThickness:.035,curveSegments:1}).rotateX(-Math.PI/2).translate(0,y,0),mat);
  };
  for(const side of [-1,1]) {
    const pts=p=>p.map(([x,z])=>[side*x,z]);
    plate(pts([[1.2,-3.05],[2.55,-1.7],[6.45,2.5],[6.15,3.58],[2.2,3.95],[1.8,.9]]),-.25,.22,'titanium');
    plate(pts([[1.55,-2.3],[2.58,-1.25],[5.92,2.4],[5.7,2.95],[2.22,3.35],[1.83,.68]]),.01,.07,'shell');
    plate(pts([[2.85,.1],[4.8,2.21],[3.94,2.37],[2.56,.94]]),.12,.02,'titanium');
    plate(pts([[4.86,2.35],[5.8,2.18],[5.68,2.72],[4.72,2.94]]),.13,.025,'trim');
    tube([[side*2.5,.19,-1.08],[side*3.75,.16,.24],[side*5.68,.13,2.23]],.025,'blue');
    // Raised shoulder fairings feeding two outboard trim engines.
    const pod=new T.SphereGeometry(1,24,14).scale(.83,.65,1.9).translate(side*2.25,-.19,1.7);add(pod,'titanium');
    const cap=new T.SphereGeometry(1,24,12).scale(.65,.26,1.75).translate(side*2.25,.34,1.65);add(cap,'shell');
    tube([[side*2.35,.59,.85],[side*2.38,.65,2.2],[side*2.34,.58,3.35]],.035,'trim');
    // Low canted dorsal stabilizers leave the main exhaust unobstructed.
    const fin=new T.Shape();fin.moveTo(0,0);fin.lineTo(.04,1.4);fin.lineTo(1.1,2.25);fin.lineTo(2.5,.1);fin.closePath();
    const g=new T.ExtrudeGeometry(fin,{depth:.12,bevelEnabled:true,bevelSegments:2,bevelSize:.055,bevelThickness:.03});
    g.rotateY(Math.PI/2).rotateZ(-side*.26).translate(side*1.45,.62,1.7);add(g,'titanium');
    // Maneuvering ports on the wing tips.
    for(const z of [2.62,3.02])ring(.105,.03,side*5.91,-.1,z,'trim');
  }
  // Continuous dark canopy with a raised metal frame and a narrow cyan instrument line.
  add(new T.SphereGeometry(1,32,18).scale(.78,.39,1.83).translate(0,.64,-3.58),'titanium');
  add(new T.SphereGeometry(1,32,18).scale(.65,.43,1.56).translate(0,.75,-3.61),'glass');
  tube([[-.51,.84,-4.2],[0,1.15,-4.35],[.51,.84,-4.2]],.022,'trim');
  tube([[-.19,.38,-6.64],[0,.43,-6.82],[.19,.38,-6.64]],.021,'blue');
  plate([[-.47,-1.7],[.47,-1.7],[.72,-.6],[.67,.65],[-.67,.65],[-.72,-.6]],.84,.09,'titanium');
  for(let i=0;i<5;i++)add(new T.BoxGeometry(.72,.06,.075).translate(0,.99,-.75+i*.23),'trim');

  const plumes=new T.Group();plumes.name='orion-plumes';
  function engine(x,y,z,r,main=false) {
    // An actually open flared bell, with a recessed throat and concentric liners.
    add(new T.CylinderGeometry(r,r*.77,1.4,48,1,true).rotateX(Math.PI/2).translate(x,y,z-.7),'titanium');
    const liner=new T.CylinderGeometry(r*.91,r*.7,1.33,48,1,true).rotateX(Math.PI/2).translate(x,y,z-.68);
    // Inside-facing geometry is separate from the housing so the cavity shades correctly.
    liner.scale(-1,1,1);add(liner,'dark');
    ring(r,.105,x,y,z,'trim');ring(r*.91,.055,x,y,z+.02,'titanium');
    for(let j=0;j<4;j++)ring(r*(.72+j*.055),.035,x,y,z-1.15+j*.28,'titanium');
    add(new T.CircleGeometry(r*.72,48).translate(x,y,z-1.39),'dark');
    ring(r*.61,.055,x,y,z-1.31,'blue');ring(r*.36,.045,x,y,z-1.29,'white');
    add(new T.CircleGeometry(r*.27,32).translate(x,y,z-1.28),'blue');
    for(let j=0;j<(main?20:12);j++) {
      const a=j*Math.PI*2/(main?20:12),cx=Math.cos(a),sy=Math.sin(a);
      tube([[x+cx*r*.78,y+sy*r*.78,z-1.25],[x+cx*r*.89,y+sy*r*.89,z-.55],[x+cx*r*.98,y+sy*r*.98,z-.05]],main?.045:.027,j%5===0?'trim':'shell');
    }
    const flame=new T.Group();flame.position.set(x,y,z-.04);
    for(const [radius,length,color,opacity] of [[r*.76,r*2.6,0x188bff,.09],[r*.47,r*1.8,0x5bdcff,.16],[r*.2,r*.95,0xc8f5ff,.4]]) {
      const g=new T.ConeGeometry(radius,length,32,1,true).rotateX(Math.PI/2).translate(0,0,length/2);
      const m=new T.ShaderMaterial({
        uniforms:{tint:{value:new T.Color(color)},strength:{value:opacity}},
        vertexShader:`varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
          void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=-p.xyz;gl_Position=projectionMatrix*p;}`,
        fragmentShader:`uniform vec3 tint;uniform float strength;varying vec2 vUv;varying vec3 vNormal;varying vec3 vView;
          void main(){float edge=pow(abs(dot(normalize(vNormal),normalize(vView))),.65);
          float fade=pow(1.-vUv.y,1.6);gl_FragColor=vec4(tint,strength*fade*edge);}`,
        transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,toneMapped:false
      });
      flame.add(new T.Mesh(g,m));
    }
    plumes.add(flame);
  }
  engine(0,-.2,6.75,1.83,true);
  engine(-2.25,-.19,5.05,.64);engine(2.25,-.19,5.05,.64);
  for(const [name,b] of batches) {
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));g.computeBoundingSphere();
    const mesh=new T.Mesh(g,mats[name]);mesh.name='orion-'+name;ship.add(mesh);
  }
  ship.add(plumes);
  return ship;
}

export function updateSpaceplane(ship,time,ignited=true) {
  const plumes=ship.getObjectByName('orion-plumes');plumes.visible=ignited;
  for(let i=0;i<plumes.children.length;i++) {
    const pulse=1+Math.sin(time*13+i)*.045+Math.sin(time*23+i)*.025;
    plumes.children[i].scale.set(1,1,pulse);
  }
}
