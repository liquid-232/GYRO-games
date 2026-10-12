import * as T from './vendor/three.module.js';

// Original art direction: sparse access panels and control-surface joints.
// Dimensions are in the source model's X/Z plane, not manufacturing drawings.
const mirror = paths => [-1,1].flatMap(s => paths.map(p => p.map(([x,z]) => [s*x,z])));
const close = p => [...p,p[0]];
function layout(kind) {
  if (kind === 'f22') return {
    size:2048, bounds:[-7,7,-9.5,8.5], relief:.018,
    panels:[
      close([[-.4,-2.5],[.4,-2.5],[.62,-2.02],[.62,-.78],[.36,-.48],[-.36,-.48],[-.62,-.78],[-.62,-2.02]]),
      ...mirror([
        close([[.78,.7],[1.28,.45],[1.53,1.02],[1.47,3.72],[1.18,4.24],[.78,3.86]]),
        close([[1.02,-4.05],[1.37,-3.44],[1.49,-2.72],[1.15,-2.9],[.9,-3.72]])
      ])
    ],
    joints:mirror([
      [[.32,-7.12],[.47,-6.96],[.59,-6.71]],
      [[.64,-2.02],[1.31,-1.35],[1.71,-.52],[1.82,1.64]],
      [[1.65,2.9],[1.7,4.48],[1.5,5.8]],
      [[1.48,-2.34],[2.62,-1.32],[4.29,.14],[6.12,1.81]],
      [[2.6,2.68],[4.23,2.35],[6.2,2.02]],
      [[4.23,2.35],[4.02,1.27],[3.76,.74]],
      [[2.1,5.04],[2.84,6.06],[3.35,6.87]],
      [[2.24,7.13],[3.45,6.98]]
    ]),
    fasteners:mirror([[[1,1.1],[1.25,1.12],[1.03,3.52],[1.27,3.5]]]).flat()
  };
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
    // These source meshes are unindexed. Suppress projection on sidewalls and
    // undersides as a whole triangle, avoiding stretched stripes on vertical fins.
    for(let i=0;i<positions.count;i+=3) {
      const top=(normals.getY(i)+normals.getY(i+1)+normals.getY(i+2))/3>.32;
      for(let j=i;j<i+3;j++) {
        uv[j*2]=top?(positions.getX(j)-x0)/(x1-x0):.0001;
        uv[j*2+1]=top?(positions.getZ(j)-z0)/(z1-z0):.0001;
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
