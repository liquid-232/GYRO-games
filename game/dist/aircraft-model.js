import * as T from './vendor/three.module.js';

// The exported model has one identity-transformed mesh per named part.
export function parseAircraft(buffer){const dv=new DataView(buffer);if(dv.getUint32(0,true)!==0x46546c67)throw Error('Invalid GLB');let json,bin;for(let offset=12;offset<buffer.byteLength;){const len=dv.getUint32(offset,true),type=dv.getUint32(offset+4,true);if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,offset+8,len)));if(type===0x004e4942)bin=offset+8;offset+=8+len;}const group=new T.Group();const mats=json.materials.map(m=>{const p=m.pbrMetallicRoughness;return new T.MeshStandardMaterial({color:new T.Color(...p.baseColorFactor.slice(0,3)),metalness:p.metallicFactor,roughness:p.roughnessFactor,side:T.DoubleSide,envMapIntensity:1.5});});for(const m of json.meshes){for(const p of m.primitives){const g=new T.BufferGeometry();for(const [key,id] of Object.entries(p.attributes)){const a=json.accessors[id],v=json.bufferViews[a.bufferView];g.setAttribute(key==='POSITION'?'position':'normal',new T.BufferAttribute(new Float32Array(buffer,bin+(v.byteOffset||0)+(a.byteOffset||0),a.count*3),3));}g.computeBoundingSphere();const mesh=new T.Mesh(g,mats[p.material]);mesh.name=m.name;group.add(mesh);}}return group;}

// Reorient the game's Y-up, -Z-forward aircraft into the sensor's
// +X-forward, +Y-left, +Z-up coordinate frame, without mirroring it.
export function createAircraftPoseModel(buffer) {
  const aircraft = parseAircraft(buffer);
  const bounds = new T.Box3().setFromObject(aircraft);
  const center = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3());
  aircraft.position.copy(center).negate();
  const model = new T.Group(); model.name = 'F22-pose'; model.add(aircraft);
  model.quaternion.setFromRotationMatrix(new T.Matrix4().set(
    0, 0, -1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  model.scale.setScalar(2.6 / Math.max(size.x, size.y, size.z));
  return model;
}
