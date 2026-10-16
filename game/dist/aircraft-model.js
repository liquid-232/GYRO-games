import * as T from './vendor/three.module.js';
import { aircraftMountQuaternion, NOSE_DIRECTIONS } from './control-frame.js';
export { NOSE_DIRECTIONS } from './control-frame.js';
import { applyAirframeSurface, applyF22TailSurface } from './airframe-surface.js';

// The local builder exports identity-transformed named meshes. Keep semantic
// part names as metadata, but merge their buffers by material before rendering.
export function parseAircraft(buffer) {
  const dv=new DataView(buffer);
  if(dv.getUint32(0,true)!==0x46546c67)throw Error('Invalid GLB');
  let json,bin;
  for(let offset=12;offset<buffer.byteLength;){
    const length=dv.getUint32(offset,true),type=dv.getUint32(offset+4,true);
    if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,offset+8,length)));
    if(type===0x004e4942)bin=offset+8;
    offset+=8+length;
  }
  const group=new T.Group();group.name='F-22 Raptor';group.userData.parts=[];
  const materials=json.materials.map(m=>{
    const p=m.pbrMetallicRoughness,canopy=/canopy gold|canopy glass|amber canopy/i.test(m.name);
    const options={name:m.name,color:new T.Color(...p.baseColorFactor.slice(0,3)),metalness:p.metallicFactor,
      roughness:p.roughnessFactor,side:m.doubleSided?T.DoubleSide:T.FrontSide,envMapIntensity:canopy?1.15:.85};
    const material=canopy?new T.MeshPhysicalMaterial({...options,clearcoat:1,clearcoatRoughness:.08}):new T.MeshStandardMaterial(options);
    material.shadowSide=T.FrontSide;return material;
  });
  const batches=new Map();
  for(const part of json.meshes)for(const primitive of part.primitives){
    group.userData.parts.push(part.name);
    const geometry=new T.BufferGeometry();
    for(const [key,label] of [['POSITION','position'],['NORMAL','normal']]){
      const accessor=json.accessors[primitive.attributes[key]],view=json.bufferViews[accessor.bufferView];
      geometry.setAttribute(label,new T.BufferAttribute(new Float32Array(buffer,bin+(view.byteOffset||0)+(accessor.byteOffset||0),accessor.count*3),3));
    }
    if(primitive.indices!==undefined){
      const accessor=json.accessors[primitive.indices],view=json.bufferViews[accessor.bufferView];
      const ArrayType=accessor.componentType===5125?Uint32Array:accessor.componentType===5123?Uint16Array:Uint8Array;
      geometry.setIndex(new T.BufferAttribute(new ArrayType(buffer,bin+(view.byteOffset||0)+(accessor.byteOffset||0),accessor.count),1));
    }
    const flat=geometry.index?geometry.toNonIndexed():geometry;
    if(flat!==geometry)geometry.dispose();
    const tail=/vertical|rudder/i.test(part.name),key=`${primitive.material}/${tail?'tail':'body'}`;
    if(!batches.has(key))batches.set(key,{index:primitive.material,tail,pieces:[]});
    batches.get(key).pieces.push(flat);
  }
  for(const {index,tail,pieces} of batches.values()){
    const geometry=new T.BufferGeometry(),count=pieces.reduce((sum,g)=>sum+g.attributes.position.count,0);
    for(const name of ['position','normal']){
      const data=new Float32Array(count*3);let offset=0;
      for(const piece of pieces){data.set(piece.attributes[name].array,offset);offset+=piece.attributes[name].array.length;}
      geometry.setAttribute(name,new T.BufferAttribute(data,3));
    }
    pieces.forEach(g=>g.dispose());geometry.computeBoundingSphere();
    const mesh=new T.Mesh(geometry,materials[index]);mesh.name='f22-'+materials[index].name;
    mesh.userData.tail=tail;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  const skin=group.children.filter(mesh=>!/canopy|cockpit|exhaust|nozzle|intake|darkness|glass|metal|seal/i.test(mesh.material.name));
  applyAirframeSurface(skin.filter(mesh=>!mesh.userData.tail),'f22');
  applyF22TailSurface(skin.filter(mesh=>mesh.userData.tail));
  // Surface materials own their textures independently in the game and gyro view.
  const used=new Set(group.children.map(mesh=>mesh.material));
  for(const material of materials)if(!used.has(material))material.dispose();
  return group;
}

// Reorient the game's Y-up, -Z-forward aircraft into the sensor's
// +X-forward, +Y-left, +Z-up coordinate frame, without mirroring it.
export function createAircraftPoseModel(buffer) {
  return createAircraftPoseFromObject(parseAircraft(buffer));
}

// Share the same body-axis conversion for every Y-up, -Z-forward player model.
export function createAircraftPoseFromObject(aircraft) {
  const bounds = new T.Box3().setFromObject(aircraft);
  const center = bounds.getCenter(new T.Vector3()), size = bounds.getSize(new T.Vector3());
  aircraft.position.copy(center).negate();
  const model = new T.Group(); model.name = 'Aircraft-pose'; model.add(aircraft);
  model.quaternion.setFromRotationMatrix(new T.Matrix4().set(
    0, 0, -1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  model.scale.setScalar(2.6 / Math.max(size.x, size.y, size.z));
  return model;
}

export function setAircraftNoseDirection(model, direction = '+X') {
  if (!NOSE_DIRECTIONS.includes(direction)) direction = '+X';
  const mounting = aircraftMountQuaternion(direction);
  const sourceToSensor = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().set(
    0, 0, -1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  model.quaternion.copy(mounting).multiply(sourceToSensor);
  return direction;
}
