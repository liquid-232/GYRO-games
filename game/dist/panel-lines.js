import * as T from './vendor/three.module.js';

// Hand-authored panel layout, projected onto the actual surface (not triangle edges).
// Generated once when loading a model; a single depth-tested batch per aircraft.
export function createPanelLines(meshes, paths, { step=.08, offset=.008 } = {}) {
  for(const mesh of meshes) { mesh.updateMatrixWorld(true); mesh.geometry.computeBoundingBox(); }
  const ray=new T.Raycaster(),positions=[],down=new T.Vector3(0,-1,0);
  const trace=(x,z)=>{
    ray.set(new T.Vector3(x,30,z),down);
    const hit=ray.intersectObjects(meshes,false)[0];
    if(!hit)return null;
    return hit.point.clone().addScaledVector(hit.face.normal.clone().transformDirection(hit.object.matrixWorld),offset);
  };
  for(const path of paths) {
    let previous=null;
    for(let i=0;i<path.length-1;i++) {
      const [x0,z0]=path[i],[x1,z1]=path[i+1],length=Math.hypot(x1-x0,z1-z0),count=Math.max(1,Math.ceil(length/step));
      for(let j=i?1:0;j<=count;j++) {
        const t=j/count,point=trace(T.MathUtils.lerp(x0,x1,t),T.MathUtils.lerp(z0,z1,t));
        // Missing surfaces and abrupt changes are gaps, never floating connecting strokes.
        if(point&&previous&&point.distanceTo(previous)<step*4+offset*2)positions.push(...previous.toArray(),...point.toArray());
        previous=point;
      }
    }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeBoundingSphere();
  const material=new T.LineBasicMaterial({color:0x263642,transparent:true,opacity:.58,depthTest:true,depthWrite:false});
  const lines=new T.LineSegments(geometry,material);lines.name='airframe-panel-lines';lines.renderOrder=1;
  return lines;
}
const mirrored = paths => [-1,1].flatMap(s=>paths.map(path=>path.map(([x,z])=>[s*x,z])));
export function f22PanelPaths() {
  const paths=[];
  // Curved transverse joints on the nose, wing box and engine deck.
  for(const [z,width] of [[-7.15,.49],[-6.6,.61],[-2.35,1.58],[.55,1.98],[2.7,1.97],[4.9,1.69],[6.25,1.05]])paths.push([[-width,z],[width,z]]);
  paths.push([[0,-8.9],[0,-6.6]],[[0,-2.7],[0,6.4]]);
  return paths.concat(mirrored([
    [[.28,-7.25],[.52,-6.55],[.72,-5.7]],
    [[.73,-3.05],[.97,-2.3],[1.08,.5],[1.03,3.9],[.93,6.35]],
    [[.18,-2.02],[.63,-2.02],[.75,-1.75],[.76,-.65],[.2,-.65],[.18,-2.02]],
    [[.2,1.02],[.68,1.02],[.78,1.25],[.78,2.2],[.2,2.2],[.2,1.02]],
    [[1.22,-2.67],[2.3,-1.66],[4.4,.23],[6.28,1.9]],
    [[2.4,-.7],[2.58,1.45],[3.18,2.42]],
    [[3.35,.17],[3.57,1.92],[4.8,2.24]],
    [[2.38,2.83],[4.28,2.44],[6.24,2.1]],
    [[1.82,4.73],[2.62,5.24],[3.48,6.98],[2.23,7.4],[1.82,4.73]],
    [[2.06,6.8],[3.58,7.12]],
    [[.54,3.25],[.77,3.03],[1.25,3.03],[1.37,3.32],[1.32,4.22],[.6,4.22],[.54,3.25]]
  ]));
}
export function su35PanelPaths() {
  const paths=[];
  for(const [z,width] of [[1.72,.18],[1.3,.25],[.53,.45],[.1,.54],[-.45,.51],[-1.07,.44],[-1.63,.34]])paths.push([[-width,z],[width,z]]);
  paths.push([[0,.64],[0,-1.96]]);
  return paths.concat(mirrored([
    [[.20,1.33],[.29,.91],[.4,.49],[.39,-.75],[.37,-1.99]],
    [[.1,.42],[.24,.42],[.29,.32],[.29,.14],[.1,.14],[.1,.42]],
    [[.1,-.08],[.29,-.08],[.31,-.18],[.31,-.37],[.1,-.37],[.1,-.08]],
    [[.1,-.63],[.27,-.63],[.27,-.95],[.1,-.95],[.1,-.63]],
    [[.64,-.02],[1.12,-.39],[1.6,-.74]],
    [[.61,-.56],[1.24,-.7],[1.56,-.86]],
    [[.62,-1.04],[1.1,-.99],[1.69,-.91]],
    [[.73,-.21],[.84,-.76],[1.04,-.93]],
    [[.59,-1.59],[1.03,-1.77],[1.19,-2.05],[.57,-2.06],[.59,-1.59]],
    [[.6,-1.94],[1.12,-1.99]]
  ]));
}
