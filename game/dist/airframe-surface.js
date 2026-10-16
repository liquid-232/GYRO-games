import * as T from './vendor/three.module.js';

// Original art direction: sparse access panels and control-surface joints.
// Dimensions are in the source model's X/Z plane, not manufacturing drawings.
const mirror = paths => [-1,1].flatMap(s => paths.map(p => p.map(([x,z]) => [s*x,z])));
const close = p => [...p,p[0]];
function layout(kind) {
  return {
    size:1024, bounds:[-2,2,-2.6,2.6], relief:.004,
    panels:[
      close([[-.13,.56],[.13,.56],[.22,.39],[.24,-.23],[.18,-.41],[-.18,-.41],[-.24,-.23],[-.22,.39]]),
      ...mirror([
        close([[.3,-.64],[.43,-.58],[.53,-.75],[.53,-1.26],[.47,-1.46],[.31,-1.44],[.27,-1.26]]),
        close([[.23,.7],[.33,.62],[.39,.35],[.33,.27],[.25,.39]])
      ])
    ],
    joints:[
      [[-.18,1.69],[-.09,1.67],[0,1.665],[.09,1.67],[.18,1.69]],
      [[-.31,-1.63],[-.17,-1.59],[0,-1.57],[.17,-1.59],[.31,-1.63]],
      ...mirror([
        [[.23,1.22],[.27,1.05],[.31,.94]],
        [[.24,-.43],[.23,-.86],[.19,-1.31],[.16,-1.59]],
        [[.62,-.09],[1.13,-.46],[1.65,-.82]],
        [[.67,-1.02],[1.21,-.95],[1.66,-.9]],
        [[1.21,-.95],[1.17,-.7]],
        [[.7,-.34],[.77,-.66],[.81,-1]],
        [[.58,-1.55],[.77,-1.69],[1.18,-1.94]],
        [[.59,-2.07],[1.23,-2.01]]
      ])
    ],
    fasteners:mirror([[[.33,-.78],[.47,-.78],[.33,-1.3],[.47,-1.3],[.28,.54]]]).flat()
  };
}

// Immutable CPU pixels are cached; each model owns its GPU textures so disposing
// the Bluetooth preview cannot invalidate the game's materials.
const atlases = new Map();
function rasterize(kind) {
  if (atlases.has(kind)) return atlases.get(kind);
  if (kind === 'f22') return rasterizeF22();
  const design=layout(kind), n=design.size, [x0,x1,z0,z1]=design.bounds;
  const color=new Uint8Array(n*n*4), surface=new Uint8Array(n*n*4);
  for(let i=0;i<n*n;i++) {
    const k=i*4;
    color[k]=color[k+1]=color[k+2]=255; color[k+3]=255;
    surface[k]=188; surface[k+1]=222; surface[k+2]=0; surface[k+3]=255;
  }
  const pixel=([x,z])=>[(x-x0)/(x1-x0)*(n-1),(z-z0)/(z1-z0)*(n-1)];
  // Scanline fill keeps subtle paint/roughness differences inside actual panels.
  function panel(points,index) {
    const p=points.map(pixel), shade= index===0?250:252, rough=index%2?232:216;
    for(let y=Math.max(1,Math.floor(Math.min(...p.map(v=>v[1]))));y<=Math.min(n-2,Math.ceil(Math.max(...p.map(v=>v[1]))));y++) {
      const crossings=[];
      for(let i=0,j=p.length-1;i<p.length;j=i++) {
        const a=p[j],b=p[i];
        if((a[1]>y+.5)!==(b[1]>y+.5))crossings.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      crossings.sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2)for(let x=Math.max(1,Math.ceil(crossings[i]));x<=Math.min(n-2,Math.floor(crossings[i+1]));x++) {
        const k=(y*n+x)*4;color[k]=color[k+1]=color[k+2]=shade;surface[k+1]=rough;
      }
    }
  }
  function groove(a,b,width=1) {
    const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy,r=2.5*width;
    const minX=Math.max(1,Math.floor(Math.min(a[0],b[0])-r)),maxX=Math.min(n-2,Math.ceil(Math.max(a[0],b[0])+r));
    const minY=Math.max(1,Math.floor(Math.min(a[1],b[1])-r)),maxY=Math.min(n-2,Math.ceil(Math.max(a[1],b[1])+r));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
      const t=l2?T.MathUtils.clamp(((x-a[0])*dx+(y-a[1])*dy)/l2,0,1):0;
      const d=Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)/width;
      if(d>2.5)continue;
      const core=Math.exp(-d*d/0.42),shoulder=Math.exp(-d*d/1.8),k=(y*n+x)*4;
      const shade=255-46*core-6*shoulder;
      color[k]=color[k+1]=color[k+2]=Math.min(color[k],Math.round(shade));
      surface[k]=Math.min(surface[k],Math.round(188-67*core-7*shoulder));
      surface[k+1]=Math.max(surface[k+1],Math.round(222+18*shoulder));
    }
  }
  design.panels.forEach(panel);
  for(const path of [...design.panels,...design.joints]) {
    const p=path.map(pixel);
    for(let i=1;i<p.length;i++)groove(p[i-1],p[i],kind==='f22'?1.25:1.1);
  }
  // A few flush screw recesses on removable covers, never raised rivet strips.
  for(const point of design.fasteners){const p=pixel(point);groove(p,p,.8);}
  const result={...design,color,surface};atlases.set(kind,result);return result;
}

// F-22 artwork is a photo-informed approximation of the standard grey finish.
// References: Lockheed Martin F-22 Product Card and USAF photo 120510-F-JQ435-127.
// Each half of this single 2048-square atlas is a separate top/belly chart.
// A neutral gutter prevents the charts from bleeding onto vertical sidewalls.
const F22_BOUNDS=[-7.05,7.05,-10.65,8.65];
const F22_GUTTER=16;
function createPainter(size) {
  const color=new Uint8Array(size*size*4),surface=new Uint8Array(size*size*4);
  for(let i=0;i<color.length;i+=4) {
    color[i]=color[i+1]=color[i+2]=color[i+3]=255;
    surface[i]=188;surface[i+1]=222;surface[i+2]=0;surface[i+3]=255;
  }
  function fill(points,shade=250,rough=222) {
    const rgb=Array.isArray(shade)?shade:[shade,shade,shade];
    const minY=Math.max(1,Math.floor(Math.min(...points.map(p=>p[1]))));
    const maxY=Math.min(size-2,Math.ceil(Math.max(...points.map(p=>p[1]))));
    for(let y=minY;y<=maxY;y++) {
      const crossings=[];
      for(let i=0,j=points.length-1;i<points.length;j=i++) {
        const a=points[j],b=points[i];
        if((a[1]>y+.5)!==(b[1]>y+.5))crossings.push(a[0]+(y+.5-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      crossings.sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2) {
        for(let x=Math.max(1,Math.floor(crossings[i]));x<=Math.min(size-2,Math.ceil(crossings[i+1]));x++) {
          const coverage=Math.min(1,x+1-crossings[i],crossings[i+1]-x);
          if(coverage<=0)continue;
          const k=(y*size+x)*4;
          for(let c=0;c<3;c++)color[k+c]=Math.round(color[k+c]*(1-coverage)+rgb[c]*coverage);
          surface[k+1]=Math.round(surface[k+1]*(1-coverage)+rough*coverage);
        }
      }
    }
  }
  function line(a,b,width=.75,shade=198,depth=34,rough=230) {
    const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy,r=2.5*width;
    const minX=Math.max(1,Math.floor(Math.min(a[0],b[0])-r)),maxX=Math.min(size-2,Math.ceil(Math.max(a[0],b[0])+r));
    const minY=Math.max(1,Math.floor(Math.min(a[1],b[1])-r)),maxY=Math.min(size-2,Math.ceil(Math.max(a[1],b[1])+r));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
      const t=l2?T.MathUtils.clamp(((x-a[0])*dx+(y-a[1])*dy)/l2,0,1):0;
      const d2=((x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2)/(width*width);
      if(d2>6.25)continue;
      const alpha=Math.exp(-d2/.9),k=(y*size+x)*4;
      for(let c=0;c<3;c++)color[k+c]=Math.round(color[k+c]*(1-alpha)+Math.min(color[k+c],shade)*alpha);
      surface[k]=Math.min(surface[k],Math.round(188-depth*alpha));
      surface[k+1]=Math.max(surface[k+1],Math.round(222+(rough-222)*alpha));
    }
  }
  const stroke=(points,width,shade,depth,rough)=>{
    for(let i=1;i<points.length;i++)line(points[i-1],points[i],width,shade,depth,rough);
  };
  return {size,color,surface,fill,line,stroke};
}
function rounded(points) {
  return new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,0,z)),true,'centripetal').getPoints(points.length*6).map(p=>[p.x,p.z]);
}
// Small stencil glyphs need no font download and also work without a DOM canvas.
const STENCIL={
  A:['01110','10001','10001','11111','10001','10001','10001'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  F:['11111','10000','10000','11110','10000','10000','10000'],
  N:['10001','11001','11001','10101','10011','10011','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
  P:['11110','10001','10001','11110','10000','10000','10000'],
  R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],
  T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],
  '1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],
  '8':['01110','10001','10001','01110','10001','10001','01110']
};
function stencil(painter,project,text,x,z,width,height,shade=175,reverse=false,yUp=false) {
  const unit=width/(text.length*6-1),dy=height/7;
  for(let i=0;i<text.length;i++) {
    const glyph=STENCIL[text[i]];
    if(!glyph)continue;
    for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(glyph[row][col]==='1') {
      const u=(i*6+col)*unit,ax=reverse?x+width-u-unit:x+u;
      const az=z+(yUp?-row*dy:row*dy),bz=az+(yUp?-dy:dy);
      painter.fill([[ax,az],[ax+unit,az],[ax+unit,bz],[ax,bz]].map(project),shade,222);
    }
  }
}
function f22Project([x,z],underside=false) {
  const [x0,x1,z0,z1]=F22_BOUNDS,g=F22_GUTTER;
  return [g+(x-x0)/(x1-x0)*(2048-2*g),g+(z-z0)/(z1-z0)*(1024-2*g)+(underside?1024:0)];
}
function rasterizeF22() {
  const p=createPainter(2048),top=point=>f22Project(point),belly=point=>f22Project(point,true);
  const patch=(points,shade,rough=222,smooth=false,project=top)=>p.fill((smooth?rounded(points):points).map(project),shade,rough);
  const seam=(points,width=.75,shade=203,project=top)=>p.stroke(points.map(project),width,shade,31,230);
  const panel=(points,shade=247,rough=224,project=top)=>{patch(points,shade,rough,false,project);seam(close(points),.66,213,project);};
  // Broad, softly curved camouflage islands; avoid checkerboard plating.
  for(const side of [-1,1]) {
    const m=points=>points.map(([x,z])=>[side*x,z]);
    patch(m([[1.14,-2.65],[1.86,-2.23],[2.78,-1.02],[3.52,-.14],[4.88,.9],[5.82,1.84],[5.6,2.62],[4.82,2.86],[3.98,2.52],[3.12,2.81],[2.47,2.44],[1.82,.62]]),[212,217,221],226,true);
    patch(m([[.7,-2.04],[1.44,-1.48],[1.72,.44],[1.5,1.64],[1.75,3.3],[1.55,5.6],[1.08,6.05],[.69,4.43],[.82,2.92],[.58,1.27]]),[227,231,234],219,true);
    patch(m([[2.01,4.8],[2.75,5.69],[3.85,6.82],[3.91,7.5],[3.33,7.86],[2.84,7.6],[2.64,6.85],[2.03,6.51]]),[216,221,225],226,true);
    // Light edge treatment and actual trapezoid control surfaces, not raised strips.
    patch(m([[2.15,-1.95],[6.78,2.18],[6.78,3.38],[6.59,3.46],[6.58,2.3],[2.15,-1.69]]),249,221);
    patch(m([[2.38,4.27],[6.58,2.94],[6.58,3.35],[2.38,5.17]]),[241,244,246],227);
    seam(m([[2.7,4.12],[6.58,2.94]]),.95,186);
    seam(m([[4.58,3.53],[4.76,4.22]]),.8,195);
    seam(m([[2.17,-1.68],[6.57,2.29]]),.55,216);
    seam(m([[2.13,5.01],[2.48,5.34],[4.23,7.02]]),.72,199);
    // Flush engine access covers and small angular LO coating boundaries.
    panel(m([[.77,.44],[1.47,.44],[1.61,.7],[1.61,1.78],[1.49,1.9],[1.49,2.09],[.76,2.09]]),246,219);
    seam(m([[.7,2.28],[.86,2.42],[1.02,2.28],[1.18,2.42],[1.34,2.28],[1.5,2.42],[1.63,2.28]]),.65,209);
    seam(m([[.73,4.29],[.91,4.49],[1.13,4.29],[1.34,4.49],[1.56,4.29]]),.65,208);
    seam(m([[1.76,-2.51],[1.76,-1.81],[2.1,-1.48],[2.1,.36]]),.65,213);
    panel(m([[1.15,-3.06],[1.43,-2.77],[1.42,-2.32],[1.12,-2.55]]),239,225);
    panel(m([[1.96,.88],[2.15,.68],[2.36,.9],[2.17,1.13]]),230,230);
    for(const [x,z] of [[.88,.62],[1.47,.65],[.89,1.89],[1.43,1.87],[2.22,1.94],[5.96,2.53]]) {
      const at=top([side*x,z]);p.line(at,at,.6,210,22,228);
    }
    // Sparse servicing marks are painted flat, with no bump relief.
    stencil(p,top,'NO STEP',side>0?3.62:-4.47,3.58,.85,.15,192);
    stencil(p,top,'RESCUE',side>0?.73:-1.41,-4.31,.68,.13,193);
    const arrow=m([[.77,-4.13],[1.07,-4.13],[1.07,-4.18],[1.21,-4.08],[1.07,-3.98],[1.07,-4.03],[.77,-4.03]]);
    patch(arrow,[218,209,164],222);
    // A separate belly chart carries the closed main/side bays and gear doors.
    panel(m([[.12,-3.58],[.83,-3.58],[1,-3.39],[1,-2.96],[.88,-2.83],[1,-2.7],[1,.84],[.87,.97],[1,1.1],[1,1.74],[.82,1.96],[.12,1.96]]),247,225,belly);
    panel(m([[1.12,-3.43],[1.58,-3.12],[1.69,-2.78],[1.69,-.69],[1.5,-.46],[1.18,-.71]]),245,227,belly);
    panel(m([[1.14,2.26],[1.81,2.46],[1.95,3.58],[1.74,4.15],[1.18,3.76]]),250,224,belly);
    seam(m([[.15,-3.31],[.31,-3.15],[.47,-3.31],[.63,-3.15],[.8,-3.31]]),.65,204,belly);
    seam(m([[.72,4.7],[1.45,4.7],[1.68,5.21],[1.6,6.01]]),.6,213,belly);
    seam(m([[2.7,4.12],[6.58,2.94]]),.8,200,belly);
  }
  // Dorsal refueling door lies behind the single canopy.
  panel([[-.36,-2.94],[.36,-2.94],[.48,-2.73],[.48,-1.98],[.24,-1.7],[-.24,-1.7],[-.48,-1.98],[-.48,-2.73]],240,226);
  seam([[-.28,-2.56],[.28,-2.56]],.55,209);
  panel([[-.21,-7.34],[.21,-7.34],[.33,-6.99],[.33,-4.82],[.16,-4.63],[-.16,-4.63],[-.33,-4.82],[-.33,-6.99]],250,225,belly);
  const result={size:2048,bounds:F22_BOUNDS,relief:.008,color:p.color,surface:p.surface};
  atlases.set('f22',result);return result;
}

export function applyAirframeSurface(meshes,kind) {
  const atlas=rasterize(kind),[x0,x1,z0,z1]=atlas.bounds;
  const texture=(pixels,colorSpace)=>{
    const map=new T.DataTexture(pixels,atlas.size,atlas.size,T.RGBAFormat);
    map.colorSpace=colorSpace;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;
    map.magFilter=T.LinearFilter;map.anisotropy=4;map.needsUpdate=true;return map;
  };
  const paint=texture(atlas.color,T.SRGBColorSpace),relief=texture(atlas.surface,T.NoColorSpace);
  paint.name=kind+'-panel-paint';relief.name=kind+'-panel-relief-roughness';
  const materials=new Map();
  for(const mesh of meshes) {
    const g=mesh.geometry,positions=g.attributes.position,normals=g.attributes.normal;
    const uv=new Float32Array(positions.count*2);
    // These source meshes are unindexed. Suppress steep sidewalls as whole
    // triangles; the F-22 underside has its own separate texture chart.
    for(let i=0;i<positions.count;i+=3) {
      const ny=(normals.getY(i)+normals.getY(i+1)+normals.getY(i+2))/3;
      const top=ny>.32,belly=kind==='f22'&&ny<-.38;
      for(let j=i;j<i+3;j++) {
        if(kind==='f22'&&(top||belly)) {
          const p=f22Project([positions.getX(j),positions.getZ(j)],belly);
          uv[j*2]=p[0]/atlas.size;uv[j*2+1]=p[1]/atlas.size;
        } else {
          uv[j*2]=top?(positions.getX(j)-x0)/(x1-x0):.0001;
          uv[j*2+1]=top?(positions.getZ(j)-z0)/(z1-z0):.0001;
        }
      }
    }
    g.setAttribute('uv',new T.BufferAttribute(uv,2));
    let material=materials.get(mesh.material);
    if(!material) {
      material=mesh.material.clone();material.map=paint;material.bumpMap=relief;
      material.bumpScale=atlas.relief;material.roughnessMap=relief;
      // The atlas base is 222/255; keep the original paint's average roughness.
      material.roughness=Math.min(1,material.roughness*255/222);
      materials.set(mesh.material,material);
    }
    mesh.material=material;
  }
}

const F22_TAIL_BOUNDS=[2.65,7.3,.27,3.2];
function f22TailProject([z,y],left=false) {
  const [z0,z1,y0,y1]=F22_TAIL_BOUNDS;
  return [8+(z-z0)/(z1-z0)*496,8+(y-y0)/(y1-y0)*240+(left?256:0)];
}
function rasterizeF22Tail() {
  if(atlases.has('f22-tail'))return atlases.get('f22-tail');
  const p=createPainter(512);
  for(const left of [false,true]) {
    const project=point=>f22TailProject(point,left);
    p.fill(rounded([[3.72,1.26],[4.1,2.45],[4.68,2.62],[5.2,2.32],[5.65,1.36],[5.25,.88],[4.58,1.08]]).map(project),[215,220,224],226);
    p.stroke([[3.01,.55],[3.96,2.8],[5.24,2.9],[6.88,.54]].map(project),.7,212,21,226);
    p.stroke([[5.05,2.88],[5.34,2.31],[5.86,1.4],[6.35,.56]].map(project),.8,197,30,230);
    p.stroke([[3.01,.57],[6.86,.57]].map(project),.6,210,20,228);
    // From +X the screen-right direction is -Z: mirror the starboard text.
    // Paint shapes retain their common physical Z/Y placement on both fins.
    stencil(p,project,'FF',4.02,2.55,.72,.42,158,!left,true);
    stencil(p,project,'AF 08',4.07,1.99,.76,.14,173,!left,true);
    stencil(p,project,'022',4.16,1.73,.64,.24,173,!left,true);
  }
  const result={size:512,color:p.color,surface:p.surface};
  atlases.set('f22-tail',result);return result;
}

// Apply only to separately batched painted vertical stabilizer/rudder meshes.
// Their outside faces use Y/Z charts; caps and inner faces stay neutral, so the
// fuselage projection never stretches markings along a fin's narrow thickness.
export function applyF22TailSurface(meshes) {
  if(!meshes.length)return;
  const atlas=rasterizeF22Tail();
  const texture=(pixels,colorSpace)=>{
    const map=new T.DataTexture(pixels,atlas.size,atlas.size,T.RGBAFormat);
    map.colorSpace=colorSpace;map.generateMipmaps=true;map.minFilter=T.LinearMipmapLinearFilter;
    map.magFilter=T.LinearFilter;map.anisotropy=4;map.needsUpdate=true;return map;
  };
  const paint=texture(atlas.color,T.SRGBColorSpace),relief=texture(atlas.surface,T.NoColorSpace),materials=new Map();
  paint.name='f22-tail-markings';relief.name='f22-tail-relief-roughness';
  for(const mesh of meshes) {
    const positions=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal;
    const uv=new Float32Array(positions.count*2);
    for(let i=0;i<positions.count;i+=3) {
      const x=(positions.getX(i)+positions.getX(i+1)+positions.getX(i+2))/3;
      const nx=(normals.getX(i)+normals.getX(i+1)+normals.getX(i+2))/3;
      const outside=Math.abs(nx)>.32&&x*nx>0;
      for(let j=i;j<i+3;j++) {
        const at=outside?f22TailProject([positions.getZ(j),positions.getY(j)],x<0):[.05,.05];
        uv[j*2]=at[0]/atlas.size;uv[j*2+1]=at[1]/atlas.size;
      }
    }
    mesh.geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
    let material=materials.get(mesh.material);
    if(!material) {
      material=mesh.material.clone();material.map=paint;material.bumpMap=relief;
      material.bumpScale=.006;material.roughnessMap=relief;
      material.roughness=Math.min(1,material.roughness*255/222);
      materials.set(mesh.material,material);
    }
    mesh.material=material;
  }
}
