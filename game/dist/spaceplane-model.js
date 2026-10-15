import * as T from './vendor/three.module.js';

// Photo-based visual reconstruction of the Xuan Nv collectible linked by the user.
// It is not the manufacturer's CAD. +Y up, nose -Z. Published collectible proportions: 34.4 x 22.4 x 5.7 cm.
// The original ORION geometry has been replaced completely.
export function createSpaceplane() {
  const ship=new T.Group();ship.name='Xuan Nv photo reconstruction';
  const batches=new Map();
  const mats={
    shell:new T.MeshStandardMaterial({color:0xbec8c5,metalness:.38,roughness:.43}),
    pale:new T.MeshStandardMaterial({color:0xa2afb1,metalness:.43,roughness:.43}),
    black:new T.MeshStandardMaterial({color:0x182127,metalness:.55,roughness:.4}),
    dark:new T.MeshStandardMaterial({color:0x070e14,metalness:.4,roughness:.48}),
    glass:new T.MeshStandardMaterial({color:0x07151f,metalness:.78,roughness:.13}),
    metal:new T.MeshStandardMaterial({color:0x677a84,metalness:.82,roughness:.32}),
    orange:new T.MeshStandardMaterial({color:0xf2aa30,metalness:.36,roughness:.36}),
    white:new T.MeshStandardMaterial({color:0xd9e7e6,metalness:.55,roughness:.29}),
  };
  const add=(g,mat)=>{
    const geo=g.index?g.toNonIndexed():g;
    if(!batches.has(mat))batches.set(mat,{p:[],n:[]});
    const b=batches.get(mat);b.p.push(...geo.attributes.position.array);b.n.push(...geo.attributes.normal.array);
    if(geo!==g)geo.dispose();g.dispose();
  };
  const plate=(points,y,depth,mat,bevel=.028)=>{
    const s=new T.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();
    const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:bevel>0,bevelSegments:1,steps:1,bevelSize:bevel,bevelThickness:bevel*.55,curveSegments:1});
    g.rotateX(-Math.PI/2).translate(0,y,0);add(g,mat);
  };
  // Closed, curved plates with separately shaded skins and edge walls. Subdivision
  // gives the raised wings a real airfoil instead of a tilted, constant-depth card.
  const contoured=(points,lower,upper,mat,detail=3,foot=(x,z)=>[x,z])=>{
    const outline=points.map(([x,z])=>new T.Vector2(x,z));
    const faces=T.ShapeUtils.triangulateShape(outline,[]),positions=[],indices=[],cache=new Map();
    const vertex=(p,top)=>{
      const key=`${p[0].toFixed(6)},${p[1].toFixed(6)},${top}`;
      if(cache.has(key))return cache.get(key);
      const i=positions.length/3,[x,z]=top?p:foot(...p);positions.push(x,(top?upper:lower)(...p),z);cache.set(key,i);return i;
    };
    const triangle=(a,b,c,n)=>{
      if(n){const ab=a.map((v,i)=>(v+b[i])/2),bc=b.map((v,i)=>(v+c[i])/2),ca=c.map((v,i)=>(v+a[i])/2);
        triangle(a,ab,ca,n-1);triangle(ab,b,bc,n-1);triangle(ca,bc,c,n-1);triangle(ab,bc,ca,n-1);return;}
      if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0)[b,c]=[c,b];
      indices.push(vertex(a,true),vertex(b,true),vertex(c,true),vertex(a,false),vertex(c,false),vertex(b,false));
    };
    for(const face of faces)triangle(...face.map(i=>points[i]),detail);
    const skin=new T.BufferGeometry();skin.setAttribute('position',new T.Float32BufferAttribute(positions,3));skin.setIndex(indices);skin.computeVertexNormals();add(skin,mat);
    const edge=[],clockwise=T.ShapeUtils.isClockWise(outline);
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],steps=2**detail;
      for(let j=0;j<steps;j++){
        const q=a.map((v,k)=>T.MathUtils.lerp(v,b[k],j/steps)),r=a.map((v,k)=>T.MathUtils.lerp(v,b[k],(j+1)/steps));
        const v=[[q[0],lower(...q),q[1]],[r[0],lower(...r),r[1]],[r[0],upper(...r),r[1]],[q[0],upper(...q),q[1]]];
        for(const f of clockwise?[[0,1,2],[0,2,3]]:[[0,2,1],[0,3,2]])for(const k of f)edge.push(...v[k]);
      }
    }
    const wall=new T.BufferGeometry();wall.setAttribute('position',new T.Float32BufferAttribute(edge,3));wall.computeVertexNormals();add(wall,mat);
  };
  const wingPlan=[[1.05,1.63,2.7],[1.57,2.14,4.07],[2.22,2.78,5.66],[2.47,3.03,5.45],[2.77,2.816,5.2],[6.12,.43,1.579],[6.23,1.46,1.46]];
  const wingSection=x=>{
    x=Math.abs(x);let a=wingPlan[0],b=wingPlan[1];
    for(let i=1;i<wingPlan.length;i++){b=wingPlan[i];if(x<=b[0])break;a=b;}
    const t=T.MathUtils.clamp((x-a[0])/Math.max(.001,b[0]-a[0]),0,1);
    return [T.MathUtils.lerp(a[1],b[1],t),T.MathUtils.lerp(a[2],b[2],t)];
  };
  const wingBase=(x,z)=>.39+.185*(Math.abs(x)-1.05)-.018*(z-3);
  const wingCamber=(x,z)=>{const [front,rear]=wingSection(x);return Math.sin(Math.PI*T.MathUtils.clamp((z-front)/Math.max(.03,rear-front),0,1));};
  const wingTop=(x,z)=>wingBase(x,z)+.018+(.195-.014*(Math.abs(x)-1.05))*Math.pow(Math.max(0,wingCamber(x,z)),.7);
  const wingBottom=(x,z)=>wingBase(x,z)-.028*wingCamber(x,z);
  const railBase=(x,z)=>.65-.065*Math.max(0,z-3.1);
  const deckBase=(x,z)=>.22+.22*T.MathUtils.clamp((z-.8)/1.5,0,1)+.15*T.MathUtils.clamp((Math.abs(x)-.5)/1.8,0,1);
  const solidPanel=(points,mat,thickness=.055)=>{
    const p=points.map(v=>new T.Vector3(...v));
    const normal=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();
    const vertices=[...p.map(v=>v.clone().addScaledVector(normal,thickness/2)),...p.map(v=>v.clone().addScaledVector(normal,-thickness/2))];
    const n=p.length,center=new T.Vector3(),faces=[],data=[];vertices.forEach(v=>center.add(v));center.divideScalar(vertices.length);
    for(let i=1;i<n-1;i++)faces.push([0,i,i+1],[n,n+i+1,n+i]);
    for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,j,j+n],[i,j+n,i+n]);}
    for(let face of faces){const [a,b,c]=face.map(i=>vertices[i]);
      if(b.clone().sub(a).cross(c.clone().sub(a)).dot(a.clone().add(b).add(c).divideScalar(3).sub(center))<0)face=[face[0],face[2],face[1]];
      face.forEach(i=>data.push(...vertices[i].toArray()));}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data,3));g.computeVertexNormals();add(g,mat);
  };
  const loft=(rows,mat)=>{
    const cross=[[1,0],[.72,.64],[0,1],[-.72,.64],[-1,0],[-.68,-.58],[0,-.72],[.68,-.58]];
    const p=[],idx=[];
    for(const [z,y,w,h] of rows)for(const [u,v] of cross)p.push(u*w,y+v*h,z);
    for(let i=0;i<rows.length-1;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8,c=b+8,d=a+8;idx.push(a,b,c,a,c,d);}
    idx.push(0,2,1,0,3,2,0,4,3,0,5,4,0,6,5,0,7,6);
    const k=(rows.length-1)*8;for(let i=1;i<7;i++)idx.push(k,k+i,k+i+1);
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();add(g,mat);
  };
  // Very long needle nose; the cockpit occupies most of the narrow forward spine.
  loft([[-8.6,-.05,.012,.018],[-8.12,0,.16,.1],[-6.6,.07,.34,.21],[-4.6,.08,.46,.31],[-2.8,.1,.65,.36],[-.5,.04,.82,.4],[1.45,0,1.28,.48],[3.05,-.02,1.48,.46],[4.55,-.12,1.57,.33],[5.5,-.2,.96,.26],[6.2,-.24,.52,.2]],'shell');
  loft([[-8.08,.115,.08,.016],[-7.45,.205,.185,.06],[-6.1,.33,.25,.13],[-4.4,.43,.3,.15],[-3.18,.425,.235,.12],[-2.79,.39,.13,.02]],'glass');
  // Narrow windscreen frame and two canopy stations.
  for(const [z,w,y] of [[-6.36,.236,.44],[-4.65,.302,.58],[-3.02,.17,.5]])
    add(new T.BoxGeometry(w*2,.018,.027).translate(0,y,z),'metal');

  for(const side of [-1,1]) {
    const pts=p=>p.map(([x,z])=>[side*x,z]);
    // Broad triangular shoulder, with a genuine recessed dark intake inside a
    // segmented white rim. The opening is not painted on top of a solid plate.
    const outer=[[.39,-5.38],[1.18,-2.48],[2.63,.76],[2.64,1.62],[2.05,2.39],[1.55,2.13],[.76,.52]];
    plate(pts(outer),-.26,.12,'black');
    plate(pts([[.4,-5.34],[1.16,-2.47],[2.61,.76],[2.07,.71],[1.09,-2.0],[.65,-2.27]]),-.12,.15,'shell');
    plate(pts([[2.07,.68],[2.61,.72],[2.6,1.61],[2.04,2.34],[1.56,2.1],[1.53,1.53],[1.93,1.36]]),-.12,.15,'shell');
    plate(pts([[.65,-2.27],[1.09,-2.0],[.94,-.7],[1.12,.89],[1.53,1.53],[1.56,2.1],[.77,.49]]),-.12,.15,'shell');
    plate(pts([[1.1,-1.96],[2.06,.72],[1.94,1.38],[1.53,1.55],[1.1,.87],[.94,-.7]]),-.205,.018,'dark',.008);
    plate(pts([[1.13,-1.54],[1.37,-.81],[1.45,.72],[1.24,.94],[1.1,.61],[1.02,-.61]]),-.15,.018,'glass',.008);
    // Recess frame strips catch a thin silver edge around the black pocket.
    plate(pts([[1.1,-1.98],[1.16,-1.96],[2.11,.7],[2.05,.72]]),.02,.018,'pale',.008);

    // High-mounted forward-swept wing. The continuous shoulder fairing rises
    // from the low central body to the wing hinge; the outer wing has mild dihedral.
    const wingOutline=pts([[1.05,1.63],[2.47,3.03],[6.12,.43],[6.23,1.46],[2.77,5.2],[2.22,5.66],[1.57,4.07]]);
    contoured(pts([[1.02,1.63],[1.44,1.91],[2.75,3.1],[2.72,4.89],[2.27,5.22],[1.48,3.91],[1.09,3.39]]),
      (x,z)=>-.12+.13*T.MathUtils.clamp((Math.abs(x)-1.1)/1.7,0,1),
      (x,z)=>wingBase(x,z)+.01,'shell',3,(x,z)=>[Math.sign(x)*Math.max(.65,Math.abs(x)-.42),z-.55*T.MathUtils.clamp((4.9-z)/1.8,0,1)]);
    contoured(wingOutline,wingBottom,wingTop,'shell');
    const skin=(points,mat,offset=.012)=>contoured(pts(points),(x,z)=>wingTop(x,z)+offset,(x,z)=>wingTop(x,z)+offset+.006,mat);
    skin([[2.82,3.08],[5.95,.79],[6.01,1.35],[2.9,4.58]],'pale');
    skin([[3.01,3.18],[5.96,1.03],[5.99,1.33],[3.02,4.33]],'shell',.022);
    contoured(pts([[5.97,.54],[6.12,.43],[6.23,1.46],[6.07,1.61]]),(x,z)=>wingBottom(x,z)-.006,(x,z)=>wingTop(x,z)+.012,'orange');
    // Fold joint is an actual narrow inset between the inner support and outer wing.
    skin([[2.765,2.85],[2.805,2.82],[2.84,4.96],[2.8,5.0]],'black',.009);
    for(const z of [3.29,4.54]){
      const x=side*2.79,y=wingTop(x,z)+.022;
      add(new T.CylinderGeometry(.055,.055,.23,12).rotateX(Math.PI/2).translate(x,y,z),'metal');
    }
    // The raised tail rails descend gradually from the wing saddle, with
    // continuous volumetric transitions instead of isolated horizontal strips.
    contoured(pts([[2.33,2.82],[2.58,3.03],[2.61,5.86],[2.44,7.08],[2.22,7.18],[2.06,6.5],[2.08,4.4]]),
      (x,z)=>railBase(x,z)-.14,(x,z)=>railBase(x,z)+.11,'shell');
    contoured(pts([[2.3,3.3],[2.42,3.42],[2.43,6.13],[2.33,6.74],[2.2,6.34],[2.2,4.43]]),
      (x,z)=>railBase(x,z)+.115,(x,z)=>railBase(x,z)+.123,'pale',2);
    // This sloping rear deck joins the central spine and the elevated wing saddle.
    contoured(pts([[.24,.81],[.76,.92],[1.65,2.32],[2.29,2.81],[2.17,4.62],[1.56,4.08],[1.11,4.45],[.62,3.93],[.32,4.22]]),
      (x,z)=>deckBase(x,z)-.22,(x,z)=>deckBase(x,z)+.14,'shell');
    // The dark tail is layered, serrated and flat, not a circular rocket nozzle.
    plate(pts([[.26,4.17],[.65,3.98],[1.12,4.48],[1.58,4.12],[2.18,4.7],[2.08,6.75],[1.73,7.5],[.7,7.68],[.23,7.05]]),-.2,.17,'black');
    plate(pts([[.63,5.26],[1.52,5.7],[2.06,5.31],[2.04,5.61],[1.51,6.05],[.65,5.61]]),-.012,.012,'pale',.006);
    plate(pts([[1.55,5.98],[2.02,5.7],[1.91,6.61],[1.65,6.95],[1.25,6.58]]),-.013,.012,'shell',.006);
    plate(pts([[.4,4.8],[1.87,5.12],[1.88,5.2],[.39,4.88]]),-.006,.018,'orange',.005);
    plate(pts([[.49,6.49],[1.14,6.33],[1.54,6.81],[1.37,7.55],[.56,7.89],[.43,7.34]]),-.43,.12,'dark');
    // Deep rectangular exhaust mouths, with inset pale metal ramps as in the photos.
    plate(pts([[.58,7.0],[1.24,6.81],[1.32,7.2],[.64,7.52]]),-.28,.014,'white',.008);
    plate(pts([[.58,7.49],[1.32,7.18],[1.28,7.3],[.62,7.63]]),-.28,.035,'metal',.006);
    // The collectible has ventral tail fins: these fold down below the rear
    // deck, not upward like conventional fighter vertical stabilizers.
    const v=p=>p.map(([x,y,z])=>[side*x,y,z]);
    solidPanel(v([[1.46,-.25,5.7],[2.08,-.31,5.92],[2.05,-1.34,7.13],[1.46,-1.08,7.65],[1.05,-.39,7.18]]),'black');
    solidPanel(v([[1.6,-.53,6.17],[1.96,-.55,6.27],[1.94,-.91,6.72],[1.58,-.84,6.83]]),'pale',.008);
    solidPanel(v([[1.63,-.85,6.9],[1.94,-1.02,6.96],[1.78,-1.15,7.32],[1.55,-1.01,7.38]]),'shell',.008);
    // Hanging stores follow the local raised wing height. Their swept pylons
    // physically meet the lower skin, leaving a readable air gap above each body.
    for(let i=0;i<3;i++) {
      const x=side*(3.62+i*.31),z=2.12-i*.21,attachZ=z+.32;
      const underside=wingBottom(x,attachZ),y=underside-.3;
      solidPanel([[x,underside+.025,attachZ-.18],[x,underside+.025,attachZ+.27],[x,y+.045,attachZ+.17],[x,y+.045,attachZ-.1]],'black',.065);
      add(new T.CylinderGeometry(.078,.078,1.2,12).rotateX(Math.PI/2).translate(x,y,z),'pale');
      add(new T.ConeGeometry(.079,.35,12).rotateX(-Math.PI/2).translate(x,y,z-.775),'shell');
      add(new T.CylinderGeometry(.081,.081,.075,12).rotateX(Math.PI/2).translate(x,y,z-.3),'orange');
      add(new T.BoxGeometry(.018,.3,.23).translate(x,y,z+.45),'metal');
      add(new T.BoxGeometry(.28,.025,.23).translate(x,y,z+.45),'metal');
    }
    // Angular charcoal underskin visible in the reference side view.
    plate(pts([[.77,-1.58],[1.84,-.12],[2.08,2.06],[1.69,3.25],[.8,3.79]]),-.42,.12,'black');
  }
  // Long dark central tail spine and its lower spear-shaped continuation.
  loft([[3.93,.2,.05,.035],[4.57,.21,.29,.24],[5.63,.1,.34,.28],[6.83,-.03,.27,.23],[8.6,-.17,.012,.012]],'black');
  plate([[-.32,6.22],[.32,6.22],[.21,7.89],[0,8.6],[-.21,7.89]],-.44,.11,'dark');

  // Fine panel seams and printed markings live in a top-projected texture. The
  // source photographs remain external references, never distributed as assets.
  const map=makeSurfaceMap();
  for(const [name,b] of batches) {
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));g.computeBoundingSphere();
    if(['shell','pale','black'].includes(name)&&map) {
      const uv=new Float32Array(b.p.length/3*2);
      for(let i=0;i<b.p.length/3;i+=3){const top=(b.n[i*3+1]+b.n[(i+1)*3+1]+b.n[(i+2)*3+1])/3>.32;
        for(let j=i;j<i+3;j++){uv[j*2]=top?(b.p[j*3]+6.6)/13.2:.001;uv[j*2+1]=top?(9-b.p[j*3+2])/18:.001;}}
      g.setAttribute('uv',new T.BufferAttribute(uv,2));mats[name].map=map;
    }
    const mesh=new T.Mesh(g,mats[name]);mesh.name='xuannv-'+name;mesh.castShadow=true;mesh.receiveShadow=true;ship.add(mesh);
  }
  // Match the published three-axis proportions; one model unit represents 2 cm
  // of the collectible. Hidden structure and local angles remain photo estimates.
  const dimensions=new T.Box3().setFromObject(ship).getSize(new T.Vector3());
  ship.scale.set(11.2/dimensions.x,2.85/dimensions.y,17.2/dimensions.z);
  const plumes=new T.Group();plumes.name='xuannv-plumes';
  for(const side of [-1,1]) {
    const g=new T.ConeGeometry(.3,1.65,16,1,true).rotateX(Math.PI/2).scale(1,.35,1).translate(side*.87,-.35,7.85);
    const m=new T.ShaderMaterial({uniforms:{tint:{value:new T.Color(0x74bbef)}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 tint;varying vec2 vUv;void main(){gl_FragColor=vec4(tint,.16*pow(1.-vUv.y,2.));}',transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,blending:T.AdditiveBlending});
    plumes.add(new T.Mesh(g,m));
  }
  ship.add(plumes);
  return ship;
}

function makeSurfaceMap() {
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,2048,2048);
  const point=([x,z])=>[(x+6.6)/13.2*2048,(z+9)/18*2048];
  const line=(points,color='#a4aeaf',width=1.7)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>{const [x,y]=point(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();};
  const mirror=paths=>[-1,1].flatMap(s=>paths.map(path=>path.map(([x,z])=>[s*x,z])));
  function patch(points,fill){ctx.fillStyle=fill;ctx.beginPath();points.forEach((p,i)=>{const [x,y]=point(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fill();}
  patch([[-.5,-2.0],[0,-2.5],[.48,-2.08],[0,-1.55]],'#d5dddd');
  patch([[-.6,-1.42],[0,-.84],[-.59,-.32]],'#dce2e1');
  patch([[.55,-1.45],[.7,-.64],[0,-.85]],'#cbd5d6');
  patch([[-.23,-.44],[0,-.7],[.25,-.42],[0,-.17]],'#e2e7e6');
  for(const p of mirror([
    [[.38,-6.8],[.48,-6.3],[.49,-5.8],[.32,-5.9]],
    [[.5,-3.25],[.73,-2.92],[.91,-1.7],[1.1,-1.2]],
    [[1.03,-3.05],[1.28,-2.29],[1.77,-1.04],[2.35,.64],[2.36,1.23],[2.04,1.7]],
    [[.96,-.22],[.73,.12],[.77,.65],[1.02,.82]],
    [[.26,.5],[.43,.7],[.4,1.2],[.18,1.27]],
    [[.63,1.36],[1.24,2.35],[1.68,2.67],[1.52,3.68],[.83,3.44],[.63,1.36]],
    [[2.91,3.41],[5.71,1.33],[5.74,1.59],[3.05,4.4],[2.91,3.41]],
    [[2.76,3.12],[2.79,4.69]],
    [[.42,5.51],[1.31,5.83],[1.67,6.26],[1.89,6.15]],
    [[.21,2.4],[.27,2.6],[.24,2.93],[.13,2.84],[.12,2.59],[.21,2.4]]
  ]))line(p);
  function label(text,x,z,angle,size,color='#263137'){
    const p=point([x,z]);ctx.save();ctx.translate(...p);ctx.rotate(angle);ctx.fillStyle=color;ctx.font=`600 ${size}px Arial`;ctx.textAlign='center';ctx.fillText(text,0,0);ctx.restore();
  }
  label('NV42',4.29,2.79,-.64,61);label('NV42',-1.05,-3.17,-.08,21);
  for(const s of [-1,1]) {
    label('CAUTION',s*1.61,-.72,s*.4,9,'#a14839');label('RESCUE',s*.47,-5.41,s*.15,9,'#ad873a');
    label('NO STEP',s*3.44,3.11,-s*.65,8);label('HS 18072',s*1.7,1.93,0,9);
    const [x,y]=point([s*.86,-3.2]);ctx.strokeStyle='#273136';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,20,.25,Math.PI*1.85);ctx.stroke();
    for(const z of [-1.55,-.1,1.12]) {const [x,y]=point([s*(1.63+z*.3),z]);ctx.strokeStyle='#bc7b71';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.stroke();}
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;return texture;
}

export function updateSpaceplane(ship,time,ignited=false) {
  const plumes=ship.getObjectByName('xuannv-plumes');plumes.visible=ignited;
  for(let i=0;i<plumes.children.length;i++)plumes.children[i].scale.z=1+Math.sin(time*17+i)*.04;
}
